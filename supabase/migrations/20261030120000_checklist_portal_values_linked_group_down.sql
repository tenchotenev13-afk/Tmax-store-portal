-- Rollback на 20261030120000_checklist_portal_values_linked_group:
-- връща функцията от 20261026120100 (колона = само задачата от source).
-- Безопасно по всяко време: табът и checklist_freeze_week просто пак
-- броят само задачата от source.

create or replace function public.checklist_portal_values(p_year int, p_week int)
returns table(store_name text, metric_key text, value text)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_mon   date;
  v_sun   date;
  v_from  timestamptz;
  v_to    timestamptz;
  v_excl  text[];
  v_skip_y int;
  v_skip_w int;
begin
  if p_year is null or p_week is null or p_week < 1 or p_week > 53 then
    return;
  end if;
  -- ISO понеделник: седмица 1 е тази с 4 януари (weekDays() в bulletin.js).
  v_mon  := date_trunc('week', make_date(p_year, 1, 4))::date + 7 * (p_week - 1);
  v_sun  := v_mon + 6;
  v_from := v_mon::timestamp at time zone 'Europe/Sofia';
  v_to   := (v_mon + 7)::timestamp at time zone 'Europe/Sofia';
  -- Изключванията — по ISO седмицата на понеделника (recurringSkipWeekOf).
  v_skip_y := extract(isoyear from v_mon)::int;
  v_skip_w := extract(week from v_mon)::int;

  v_excl := public.report_excluded_stores();
  if v_excl is null then
    raise warning 'checklist_portal_values: report_excluded_stores липсва — нищо не се връща';
    return;
  end if;

  return query
  with stores as (
    select distinct u.store_name as s
      from public.users u
     where coalesce(u.store_name, '') <> ''
       and not (u.store_name = any (v_excl))
  ),
  metrics as (
    select m.key,
           m.portal_mode,
           case when m.source like 'recurring:%' then 'recurring'
                when m.source like 'module:%'    then 'module' end            as kind,
           case when m.source like 'recurring:%'
                 and btrim(substr(m.source, 11)) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then btrim(substr(m.source, 11))::uuid end                   as task_id,
           case when m.source like 'module:%' then btrim(substr(m.source, 8)) end as module_id
      from public.weekly_checklist_metrics m
     where m.active = true
       and (m.source like 'recurring:%' or m.source like 'module:%')
  ),
  -- ── постоянни задачи ─────────────────────────────────────────────────
  rt as (
    select mt.key, mt.portal_mode, mt.task_id,
           (t.id is not null) as task_exists,
           case when ver.recurring_task_id is not null then ver.due_weekdays
                else t.due_weekdays end                                      as days,
           exists (select 1 from public.recurring_task_periods p
                    where p.recurring_task_id = mt.task_id)                  as has_periods,
           exists (select 1 from public.recurring_task_periods p
                    where p.recurring_task_id = mt.task_id
                      and p.from_monday <= v_mon
                      and (p.to_monday is null or p.to_monday >= v_mon))     as valid_week
      from metrics mt
      left join public.recurring_tasks t on t.id = mt.task_id
      left join lateral (
        select v.recurring_task_id, v.due_weekdays
          from public.recurring_task_versions v
         where v.recurring_task_id = mt.task_id
           and v.from_monday <= v_mon
           and (v.to_monday is null or v.to_monday >= v_mon)
         order by v.from_monday desc
         limit 1
      ) ver on true
     where mt.kind = 'recurring' and mt.portal_mode in ('any', 'count', 'file_none')
  ),
  rt_plan as (
    -- Само колоните, за които checklistPortalPlan връща план.
    select rt.*,
           coalesce(array(select v_mon + d from unnest(rt.days) as d
                           where d between 0 and 6), '{}'::date[])          as allowed,
           coalesce(cardinality(rt.days), 0)                                 as base_denom
      from rt
     where rt.task_exists
       and (rt.portal_mode = 'file_none' or coalesce(cardinality(rt.days), 0) > 0)
  ),
  comps as (
    select p.key, c.store_name as s, c.status, c.completion_date as orig,
           c.postponed_to, coalesce(c.postponed_to, c.completion_date) as eff,
           c.files, p.allowed
      from rt_plan p
      join public.task_completions c on c.recurring_task_id = p.task_id
     where c.completion_date is not null
       and coalesce(c.store_name, '') <> ''
       and ((c.completion_date between v_mon and v_sun)
         or (c.postponed_to   between v_mon and v_sun))
  ),
  comps2 as (
    select c.*,
           (c.eff between v_mon and v_sun)                       as eff_in,
           (c.orig = any (c.allowed))                            as orig_due
      from comps c
  ),
  per_store as (
    select c.key, c.s,
           -- попадения (any / count): множество дати
           count(distinct case
             when (case when c.postponed_to is not null then c.eff_in else c.orig_due end)
                  and c.status = 'done'
             then case when c.postponed_to is not null and c.eff = any (c.allowed)
                       then c.orig else c.eff end
           end)                                                   as hits,
           -- знаменател: пренесените
           coalesce(sum(case
             when c.postponed_to is null then 0
             when c.orig_due and not c.eff_in then -1
             when not c.orig_due and c.eff_in then 1
             else 0 end), 0)                                      as delta,
           -- file_none: свършено, денят на явяването в седмицата, с файл
           bool_or(c.status = 'done' and c.eff_in
                   and jsonb_typeof(c.files) = 'array'
                   and jsonb_array_length(c.files) > 0)           as has_file
      from comps2 c
     group by c.key, c.s
  ),
  rec_vals as (
    select st.s, p.key,
           case
             when p.has_periods and not p.valid_week then null
             when exists (select 1 from public.recurring_task_skips k
                           where k.recurring_task_id = p.task_id
                             and k.year = v_skip_y and k.week_number = v_skip_w
                             and (k.store_name is null or k.store_name = st.s)) then null
             when p.portal_mode = 'file_none' then
               case when coalesce(ps.has_file, false) then 'da' else 'ne' end
             when p.base_denom + coalesce(ps.delta, 0) <= 0 then null
             when p.portal_mode = 'any' then
               case when coalesce(ps.hits, 0) > 0 then 'da' else 'ne' end
             else coalesce(ps.hits, 0)::text || '/' || (p.base_denom + coalesce(ps.delta, 0))::text
           end as value
      from rt_plan p
      cross join stores st
      left join per_store ps on ps.key = p.key and ps.s = st.s
  ),
  -- ── модули ───────────────────────────────────────────────────────────
  transit as (
    select g.store_name as s,
           count(*) filter (where (coalesce(g.status, '') <> '' and g.status <> 'pending')
                               or g.reviewed_at is not null)            as done,
           count(*)                                                     as total
      from public.goods_transit g
     where g.direction = 'incoming'
     group by g.store_name
  ),
  rets as (
    select r.store_name as s,
           count(*) filter (where r.status = 'taken' or r.confirmed_date is not null) as done,
           count(*)                                                                    as total
      from public.stock_returns r
     where r.source = 'diff'
     group by r.store_name
  ),
  wr as (
    select d.store_name as s,
           count(*)                                       as reports,
           coalesce(sum((select count(*) from public.stock_differences x
                          where x.report_id = d.id)), 0)  as lines
      from public.differences_reports d
     where d.direction = 'wrong_receipt'
       and d.created_at >= v_from and d.created_at < v_to
     group by d.store_name
  ),
  mod_vals as (
    select st.s, mt.key,
           case mt.module_id
             when 'transit' then
               case when tr.total > 0 then tr.done::text || '/' || tr.total::text end
             when 'returns' then
               case when rs.total > 0 then rs.done::text || '/' || rs.total::text end
             when 'wrong_receipt' then
               case when v_from > now() then null
                    else coalesce(w.reports, 0)::text || '/' || coalesce(w.lines, 0)::text end
           end as value
      from metrics mt
      cross join stores st
      left join transit tr on tr.s = st.s
      left join rets    rs on rs.s = st.s
      left join wr      w  on w.s  = st.s
     where mt.kind = 'module'
  ),
  -- Всяка recurring:/module: колона × всеки обект; без правило → NULL.
  all_cells as (
    select st.s, mt.key from metrics mt cross join stores st
  )
  select a.s, a.key, coalesce(rv.value, mv.value)
    from all_cells a
    left join rec_vals rv on rv.s = a.s and rv.key = a.key
    left join mod_vals mv on mv.s = a.s and mv.key = a.key
   order by a.s, a.key;
end
$function$;

comment on function public.checklist_portal_values(int, int) is
  'Чек лист: автоматичните стойности за ISO седмица (p_year, p_week) — ред на recurring:/module: колона за всеки отчетен обект, смятани в момента на четене по правилото на checklist.js. value NULL = няма стойност. Етап 1 (26.10.2026): още никой не я вика.';

revoke all on function public.checklist_portal_values(int, int) from public;
grant execute on function public.checklist_portal_values(int, int) to anon, authenticated, service_role;
