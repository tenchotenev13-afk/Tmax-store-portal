-- checklist-portal-values-fn.sql
-- Огледало на supabase/migrations/20261030120000_checklist_portal_values_linked_group.sql
-- (предишната версия: 20261026120100_checklist_portal_values.sql).
--
-- ЗАЩО (checklist-live-calc, етап 1 от 3; Теодор 26.10, решение на Тенчо
-- 26.10.2026). portal_value в weekly_checklist е снимка от последното
-- отваряне на таба: седмица 43 беше сметната на 14.10 и 22.10, а трите нови
-- колони стояха празни. Стойностите вече не се пазят, а се смятат в момента
-- на четене — от ТАЗИ функция. Етап 2: табът чете от нея; етап 3: неделният
-- отчет и писмото до обектите. В етап 1 НИКОЙ не я вика — тя е сверена с
-- checklist.js клетка по клетка (tools/checklist-parity.js).
--
-- ПРАВИЛОТО Е ТОЧНО ТОВА НА checklist.js (към 80b290f):
--   · колоните: активните с source 'recurring:<uuid>' или 'module:<id>';
--     'manual' не се връщат. Ред на всяка такава колона за всеки отчетен обект;
--     value NULL там, където checklist.js не пише стойност (null);
--   · обектите: различните users.store_name минус report_excluded_stores()
--     (loadReportableStores в shared.js). Липсващ/повреден ключ → НИЩО
--     (fail-closed, както transit_mark_empty_stores; JS там пада към вградения
--     списък — нарочно не се повтаря, виж transit-empty-stores-schema);
--   · седмицата: ISO (year, week) → понеделник; границите за timestamptz —
--     в Europe/Sofia (checklistWeekBounds).
--
--   recurring (checklistRecurringChanges + checklistPortalPlan +
--   checklistFileNonePlan + checklistPortalValueFor):
--     · задачата е recurring_tasks; due_weekdays — от версията за седмицата
--       (recurring_task_versions, печели най-късният from_monday), ако има;
--       иначе от задачата. Липсва задача → NULL. any / count без дни → NULL;
--     · отмятанията: completion_date ИЛИ postponed_to в седмицата; без дата
--       или без обект отпадат; само status 'done' е попадение;
--     · пренасяне (postponed_to): денят на явяването е postponed_to. Изнесено
--       от дължим ден извън седмицата → знаменател −1; внесено отвън → +1;
--       попадение по първоначалната дата, ако новата е дължим ден, иначе по
--       новата. Два записа в един ден = едно попадение (множество дати);
--     · знаменател ПО ОБЕКТ = брой дни в срока + delta; ≤ 0 → NULL;
--     · задача с периоди, невалидна за седмицата → NULL за всички;
--       изключена за обекта или глобално (recurring_task_skips) → NULL;
--     · any: попадение → 'da', иначе 'ne'; count: '<дни>/<знаменател>';
--       file_none: свършено отмятане в седмицата (по деня на явяването) с
--       непразен масив files → 'da', иначе 'ne'.
--   module:
--     · transit: goods_transit, само direction 'incoming' — '<обработени>/<всички>',
--       обработен = status непразен и ≠ 'pending' ИЛИ reviewed_at; без входящи
--       → NULL. Цялата таблица — НЕ зависи от седмицата (снимка към сега);
--     · returns: stock_returns source='diff' — '<обработени>/<всички>',
--       обработен = status 'taken' ИЛИ confirmed_date; без редове → NULL.
--       Също не зависи от седмицата;
--     · wrong_receipt: бланките differences_reports direction='wrong_receipt',
--       подадени в седмицата, и редовете им в stock_differences —
--       '<бланки>/<редове>', „0/0" без сторна; бъдеща седмица → NULL;
--     · друг module: → NULL (в checklist.js няма правило).
--
-- STABLE, SECURITY INVOKER: чете с правата на викащия (anon има SELECT на
-- всички таблици тук, users.store_name — колонно).
--
-- ГРУПА ПО linked_module (30.10.2026, решение А на Тенчо от 29.10;
-- claude/open/closed/29-10-checklist-minusi-gd.md). Колона от постоянна задача
-- брои не само задачата от source, а всяка, която ЗА СЕДМИЦАТА има същия
-- linked_module (от версията; в recurring_tasks често е NULL) и важи за нея
-- (периоди, иначе active). За всеки обект дните, знаменателят, периодът и
-- изключването са на задачата, в чийто target_stores е (изрично > за всички >
-- нито една → задачата от source); отметките — по ВСИЧКИ задачи от групата,
-- като множество дати. Без linked_module → само задачата от source (старото).
-- Повод: „СПРАВКА МИНУСИ“ 03c44560 + 5a4e0562 от 26.10 — Гоце Делчев 0/5.
-- В checklist.js: checklistTaskGroup / checklistTaskForStore.
--
-- Rollback: supabase/migrations/20261030120000_checklist_portal_values_linked_group_down.sql
--   (връща тялото от 20261026120100).

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
  anchors as (
    select mt.key, mt.portal_mode, mt.task_id
      from metrics mt
     where mt.kind = 'recurring' and mt.portal_mode in ('any', 'count', 'file_none')
  ),
  -- Съдържанието на ВСЯКА задача за седмицата: версията (печели най-късният
  -- from_monday), иначе редът в recurring_tasks — recurringApplyVersion.
  eff as (
    select t.id, t.active,
           case when ver.recurring_task_id is not null then ver.due_weekdays
                else t.due_weekdays end                                      as days,
           case when ver.recurring_task_id is not null then ver.target_stores
                else t.target_stores end                                     as targets,
           case when ver.recurring_task_id is not null then ver.linked_module
                else t.linked_module end                                     as lm,
           exists (select 1 from public.recurring_task_periods p
                    where p.recurring_task_id = t.id)                        as has_periods,
           exists (select 1 from public.recurring_task_periods p
                    where p.recurring_task_id = t.id
                      and p.from_monday <= v_mon
                      and (p.to_monday is null or p.to_monday >= v_mon))     as valid_week
      from public.recurring_tasks t
      left join lateral (
        select v.recurring_task_id, v.due_weekdays, v.target_stores, v.linked_module
          from public.recurring_task_versions v
         where v.recurring_task_id = t.id
           and v.from_monday <= v_mon
           and (v.to_monday is null or v.to_monday >= v_mon)
         order by v.from_monday desc
         limit 1
      ) ver on true
  ),
  -- Групата на колоната (30.10.2026, решение А на Тенчо от 29.10): задачата
  -- от source плюс всяка друга, която ЗА СЕДМИЦАТА има същия linked_module и
  -- важи за нея (периоди, иначе active — recurringTasksForWeek). Без
  -- linked_module → само задачата от source, тоест старото поведение.
  grp as (
    select a.key, e.id as task_id
      from anchors a
      join eff ea on ea.id = a.task_id
      join eff e  on e.id = a.task_id
                  or (ea.lm is not null and e.lm = ea.lm
                      and case when e.has_periods then e.valid_week else e.active end)
  ),
  -- Задачата, която важи ЗА ОБЕКТА: изрично в target_stores > без списък
  -- (за всички) > нито една → задачата от source. При равенство — задачата
  -- от source, после по id.
  pick as (
    select distinct on (a.key, st.s)
           a.key, st.s,
           case when (case when coalesce(cardinality(e.targets), 0) = 0 then 1
                           when st.s = any (e.targets) then 2 else 0 end) > 0
                then g.task_id else a.task_id end                            as task_id
      from anchors a
      cross join stores st
      join grp g on g.key = a.key
      join eff e on e.id = g.task_id
     order by a.key, st.s,
              case when coalesce(cardinality(e.targets), 0) = 0 then 1
                   when st.s = any (e.targets) then 2 else 0 end desc,
              (g.task_id = a.task_id) desc,
              g.task_id
  ),
  rt as (
    select pk.key, a.portal_mode, pk.s, pk.task_id, e.days, e.has_periods, e.valid_week
      from pick pk
      join anchors a on a.key = pk.key
      join eff e on e.id = pk.task_id
  ),
  rt_plan as (
    -- Само клетките, за които checklistPortalPlan връща план.
    select rt.*,
           coalesce(array(select v_mon + d from unnest(rt.days) as d
                           where d between 0 and 6), '{}'::date[])          as allowed,
           coalesce(cardinality(rt.days), 0)                                 as base_denom
      from rt
     where rt.portal_mode = 'file_none' or coalesce(cardinality(rt.days), 0) > 0
  ),
  -- Отметките на обекта по ВСИЧКИ задачи от групата; дните (allowed) са на
  -- задачата, която важи за него. Две отметки в един ден по две задачи са
  -- едно попадение (множество дати).
  comps as (
    select p.key, p.s, c.status, c.completion_date as orig,
           c.postponed_to, coalesce(c.postponed_to, c.completion_date) as eff,
           c.files, p.allowed
      from rt_plan p
      join grp g on g.key = p.key
      join public.task_completions c on c.recurring_task_id = g.task_id
                                    and c.store_name = p.s
     where c.completion_date is not null
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
    select p.s, p.key,
           case
             when p.has_periods and not p.valid_week then null
             when exists (select 1 from public.recurring_task_skips k
                           where k.recurring_task_id = p.task_id
                             and k.year = v_skip_y and k.week_number = v_skip_w
                             and (k.store_name is null or k.store_name = p.s)) then null
             when p.portal_mode = 'file_none' then
               case when coalesce(ps.has_file, false) then 'da' else 'ne' end
             when p.base_denom + coalesce(ps.delta, 0) <= 0 then null
             when p.portal_mode = 'any' then
               case when coalesce(ps.hits, 0) > 0 then 'da' else 'ne' end
             else coalesce(ps.hits, 0)::text || '/' || (p.base_denom + coalesce(ps.delta, 0))::text
           end as value
      from rt_plan p
      left join per_store ps on ps.key = p.key and ps.s = p.s
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
  'Чек лист: автоматичните стойности за ISO седмица (p_year, p_week) — ред на recurring:/module: колона за всеки отчетен обект, смятани в момента на четене по правилото на checklist.js. value NULL = няма стойност. Колона от постоянна задача брои групата със същия linked_module за седмицата, всеки обект по задачата от своя target_stores (30.10.2026).';

revoke all on function public.checklist_portal_values(int, int) from public;
grant execute on function public.checklist_portal_values(int, int) to anon, authenticated, service_role;
