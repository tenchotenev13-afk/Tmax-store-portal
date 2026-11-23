-- weekly-checklist-transit-deadline-schema.sql
-- Огледало на supabase/migrations/20261123120000_checklist_transit_deadline.sql
-- (сесия checklist-store-gaps, етап Б; решения на Тенчо 23.11.2026).
--
-- ПРАВИЛОТО ЗА „СТОКА НА ПЪТ" (stoka_na_pat, module:transit):
--   · стойност има САМО в ISO седмицата, която съдържа деня
--     weekly_checklist_metrics.deadline_day (днес 10) на месеца — и когато той
--     е събота или неделя (седмицата е пн–нд). В останалите седмици — NULL.
--     Прагът се чете от таблицата, не е закован. Ден, който месецът няма
--     (31 при 30-дневен) → NULL за целия месец.
--   · стойността е 'da', ако ВСИЧКИ входящи редове са обработени (status ≠
--     pending ИЛИ reviewed_at ИЛИ recon_at — checklistTransitValue), иначе
--     'ne'; обект без входящи редове → NULL. Вместо брой N/M — да/не.
--   · оценката е към края на деня-срок: снимка в 23:59 Europe/Sofia на
--     deadline_day (checklist_snapshot_deadline, крон по-долу). До снимката
--     функцията смята живо; след нея връща ЗАПИСАНОТО в weekly_checklist —
--     goods_transit няма история, а updated_at не се ползва за смятане назад.
--   · неделното затваряне (checklist_freeze_week) НЕ презаписва снимката.
--     Паднал ли е кронът (снимка няма, а седмицата се затваря) — затварянето
--     записва живата стойност и отметката с taken_by = 'freeze-late'
--     (решение на Тенчо 23.11: да, но да се вижда, че е закъсняла).
--
-- 1. weekly_checklist_snapshots — ред = снимката на колоната за седмицата е
--    направена; стойностите са в weekly_checklist.portal_value. taken_by:
--    'cron' | 'freeze-late' | текст от еднократна миграция. RLS: select за
--    anon/authenticated (табът и checklist_portal_values — security invoker);
--    запис само от двете SECURITY DEFINER функции.
-- 2. checklist_portal_values() — create or replace (нова миграция, старата не
--    се редактира): правилото горе; останалото — байт в байт като
--    20261116120000_checklist_portal_values_task_type.
-- 3. checklist_snapshot_deadline(p_by) — прави снимката за днешния ден, ако
--    днес е deadline_day на активна колона и снимка още няма; само след
--    23:00 в София (иначе -2). Идемпотентна.
-- 4. checklist_freeze_week() — колона със снимка не се пипа; колона със срок
--    в седмицата и без снимка → живото + отметка 'freeze-late'.
-- 5. pg_cron „checklist-transit-snapshot-2359": всеки ден 23:59 Europe/Sofia
--    — двата UTC кандидата (20:59 лято, 21:59 зима) + guard по часа в София.
--
-- ЗАВАРЕНИТЕ ДАННИ: схемата не пипа редове. Затворените седмици остават
-- каквито са записани (табът и писмата четат weekly_checklist). Чистенето на
-- 108-те клетки извън седмиците със срок (40, 42–45, 47) — отделна data
-- миграция 20261123120100_checklist_transit_history_data (решение В).
--
-- Огледало (Живко): нова таблица weekly_checklist_snapshots → ред в
-- zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261123120000_checklist_transit_deadline_down.sql
--   (кронът, checklist_snapshot_deadline, таблицата; checklist_portal_values и
--   checklist_freeze_week — към 20261116120000 / 20261026210000).

create table public.weekly_checklist_snapshots (
  year        int  not null,
  week_number int  not null,
  metric_key  text not null,
  taken_at    timestamptz not null default now(),
  taken_by    text,
  constraint weekly_checklist_snapshots_pkey primary key (year, week_number, metric_key),
  constraint weekly_checklist_snapshots_week_chk check (week_number between 1 and 53)
);

comment on table public.weekly_checklist_snapshots is
  'Чек лист: снимката на колона със срок (deadline_day) за седмицата е направена — стойностите са в weekly_checklist.portal_value и checklist_portal_values() ги връща вместо живото. Пишат само checklist_snapshot_deadline() и checklist_freeze_week().';
comment on column public.weekly_checklist_snapshots.taken_by is
  'Кой: ''cron'' (23:59 в деня-срок), ''freeze-late'' (кронът е паднал — неделното затваряне), или текст от еднократна миграция.';

alter table public.weekly_checklist_snapshots enable row level security;
create policy weekly_checklist_snapshots_select on public.weekly_checklist_snapshots
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on table public.weekly_checklist_snapshots from anon, authenticated;
grant select on table public.weekly_checklist_snapshots to anon, authenticated;

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
           case when m.source like 'module:%' then btrim(substr(m.source, 8)) end as module_id,
           -- Срок в рамките на месеца (етап Б, 23.11.2026): денят deadline_day
           -- в показаната седмица (пн–нд) или NULL, ако го няма в нея.
           m.deadline_day,
           case when m.deadline_day is not null then
             (select g.d::date
                from generate_series(v_mon::timestamp, v_sun::timestamp, interval '1 day') as g(d)
               where extract(day from g.d)::int = m.deadline_day
               limit 1) end                                                    as dl_date,
           -- Снимката на колоната за седмицата е направена → връща се записаното.
           exists (select 1 from public.weekly_checklist_snapshots sn
                    where sn.year = p_year and sn.week_number = p_week
                      and sn.metric_key = m.key)                               as snapped
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
           case when ver.recurring_task_id is not null then ver.task_type
                else t.task_type end                                         as ttype,
           exists (select 1 from public.recurring_task_periods p
                    where p.recurring_task_id = t.id)                        as has_periods,
           exists (select 1 from public.recurring_task_periods p
                    where p.recurring_task_id = t.id
                      and p.from_monday <= v_mon
                      and (p.to_monday is null or p.to_monday >= v_mon))     as valid_week
      from public.recurring_tasks t
      left join lateral (
        select v.recurring_task_id, v.due_weekdays, v.target_stores, v.linked_module, v.task_type
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
    select pk.key, a.portal_mode, pk.s, pk.task_id, e.days, e.has_periods, e.valid_week, e.ttype
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
           c.files, p.allowed,
           (g.task_id = p.task_id)                               as own_task
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
                   and jsonb_array_length(c.files) > 0)           as has_file,
           -- file_none при задача, която НЕ е file_comment (16.11.2026): свършено,
           -- в седмицата, по САМАТА задача на обекта — без изискване за файл
           bool_or(c.status = 'done' and c.eff_in and c.own_task) as has_own_done
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
               case when coalesce(p.ttype, 'file_comment') <> 'file_comment'
                    then case when coalesce(ps.has_own_done, false) then 'da' else 'ne' end
                    when coalesce(ps.has_file, false) then 'da' else 'ne' end
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
                               or g.reviewed_at is not null
                               or g.recon_at is not null)               as done,
           count(*)                                                     as total
      from public.goods_transit g
     where g.direction = 'incoming'
       and g.archived_at is null
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
               -- да/не вместо брой (етап Б): всички входящи обработени → 'da'.
               case when tr.total > 0 then case when tr.done = tr.total then 'da' else 'ne' end end
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
    select st.s, mt.key, mt.deadline_day, mt.dl_date, mt.snapped
      from metrics mt cross join stores st
  )
  -- Колона със срок: извън седмицата със срока → NULL; след снимката →
  -- записаното в weekly_checklist; иначе — живо.
  select a.s, a.key,
         case when a.deadline_day is null then coalesce(rv.value, mv.value)
              when a.dl_date is null      then null
              when a.snapped              then sw.portal_value
              else coalesce(rv.value, mv.value) end
    from all_cells a
    left join rec_vals rv on rv.s = a.s and rv.key = a.key
    left join mod_vals mv on mv.s = a.s and mv.key = a.key
    left join public.weekly_checklist sw on a.snapped
                                        and sw.year = p_year and sw.week_number = p_week
                                        and sw.store_name = a.s and sw.metric_key = a.key
   order by a.s, a.key;
end
$function$;

comment on function public.checklist_portal_values(int, int) is
  'Чек лист: автоматичните стойности за ISO седмица (p_year, p_week) — ред на recurring:/module: колона за всеки отчетен обект, смятани в момента на четене по правилото на checklist.js. value NULL = няма стойност. Колона от постоянна задача брои групата със същия linked_module за седмицата, всеки обект по задачата от своя target_stores (30.10.2026). file_none иска файл само от задача file_comment; друг вид — свършена отметка по самата задача (16.11.2026). Колона с deadline_day има стойност само в седмицата със срока, след снимката (weekly_checklist_snapshots) — записаното; „Стока на път" е да/не (23.11.2026).';

revoke all on function public.checklist_portal_values(int, int) from public;
grant execute on function public.checklist_portal_values(int, int) to anon, authenticated, service_role;

create or replace function public.checklist_freeze_week(p_year int, p_week int, p_by text default 'cron')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mon date;
  v_end timestamptz;
  n_upd int := 0;
  n_ins int := 0;
  v_late text[];
begin
  if p_year is null or p_week is null or p_week < 1 or p_week > 53 then
    raise exception 'checklist_freeze_week: невалидна седмица %/%', p_week, p_year;
  end if;
  v_mon := date_trunc('week', make_date(p_year, 1, 4))::date + 7 * (p_week - 1);
  v_end := (v_mon + 7)::timestamp at time zone 'Europe/Sofia';
  if now() < v_end then
    return -2;                                   -- седмицата не е приключила
  end if;

  insert into public.weekly_checklist_freezes (year, week_number, frozen_by)
  values (p_year, p_week, p_by)
  on conflict (year, week_number) do nothing;
  if not found then
    return -1;                                   -- вече е затворена
  end if;

  -- Колоните със срок в тази седмица, за които снимка няма (паднал крон):
  -- записва се живото и отметка 'freeze-late' (решение на Тенчо 23.11.2026).
  v_late := array(
    select m.key from public.weekly_checklist_metrics m
     where m.active and m.deadline_day is not null
       and exists (select 1 from generate_series(v_mon::timestamp, (v_mon + 6)::timestamp, interval '1 day') as g(d)
                    where extract(day from g.d)::int = m.deadline_day)
       and not exists (select 1 from public.weekly_checklist_snapshots s
                        where s.year = p_year and s.week_number = p_week and s.metric_key = m.key));

  -- Две отделни заявки към функцията (CTE, не временна таблица — затварянето
  -- на няколко седмици в една транзакция иначе гърми на втората).
  with x as (select v.store_name, v.metric_key, v.value
               from public.checklist_portal_values(p_year, p_week) v)
  update public.weekly_checklist w
     set portal_value = x.value,
         updated_at   = now()
    from x
   where w.year = p_year and w.week_number = p_week
     and w.store_name = x.store_name and w.metric_key = x.metric_key
     and w.portal_value is distinct from x.value
     -- снимката не се презаписва (етап Б, 23.11.2026)
     and not exists (select 1 from public.weekly_checklist_snapshots s
                      where s.year = p_year and s.week_number = p_week and s.metric_key = x.metric_key);
  get diagnostics n_upd = row_count;

  insert into public.weekly_checklist (year, week_number, store_name, metric_key, portal_value, updated_at)
  select p_year, p_week, x.store_name, x.metric_key, x.value, now()
    from public.checklist_portal_values(p_year, p_week) x
   where x.value is not null
     and not exists (select 1 from public.weekly_checklist_snapshots s
                      where s.year = p_year and s.week_number = p_week and s.metric_key = x.metric_key)
     and not exists (select 1 from public.weekly_checklist w
                      where w.year = p_year and w.week_number = p_week
                        and w.store_name = x.store_name and w.metric_key = x.metric_key);
  get diagnostics n_ins = row_count;

  insert into public.weekly_checklist_snapshots (year, week_number, metric_key, taken_by)
  select p_year, p_week, k, 'freeze-late' from unnest(v_late) as k
  on conflict (year, week_number, metric_key) do nothing;

  return n_upd + n_ins;
end
$function$;

comment on function public.checklist_freeze_week(int, int, text) is
  'Чек лист: затваря ПРИКЛЮЧИЛА седмица веднъж — записва стойностите от checklist_portal_values() в weekly_checklist.portal_value (само промените) и ред в weekly_checklist_freezes. -2 = не е приключила, -1 = вече затворена, иначе брой записани редове. control_* не се пипат. Колона със снимка (weekly_checklist_snapshots) не се пипа; колона със срок в седмицата без снимка → живото + снимка ''freeze-late'' (23.11.2026).';

revoke all on function public.checklist_freeze_week(int, int, text) from public;
revoke all on function public.checklist_freeze_week(int, int, text) from anon, authenticated;
grant execute on function public.checklist_freeze_week(int, int, text) to service_role;

create or replace function public.checklist_snapshot_deadline(p_by text default 'cron')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now  timestamp := now() at time zone 'Europe/Sofia';
  v_day  date;
  v_y    int;
  v_w    int;
  v_keys text[];
  n_upd  int := 0;
  n_ins  int := 0;
begin
  if extract(hour from v_now) < 23 then
    return -2;                                   -- още не е краят на деня
  end if;
  v_day := v_now::date;
  v_y   := extract(isoyear from v_day)::int;
  v_w   := extract(week from v_day)::int;
  v_keys := array(
    select m.key from public.weekly_checklist_metrics m
     where m.active and m.deadline_day = extract(day from v_day)::int
       and not exists (select 1 from public.weekly_checklist_snapshots s
                        where s.year = v_y and s.week_number = v_w and s.metric_key = m.key));
  if coalesce(cardinality(v_keys), 0) = 0 then
    return -1;                                   -- днес няма срок или снимката я има
  end if;

  -- Живите стойности (снимка още няма → функцията смята живо).
  with x as (select v.store_name, v.metric_key, v.value
               from public.checklist_portal_values(v_y, v_w) v
              where v.metric_key = any (v_keys))
  update public.weekly_checklist w
     set portal_value = x.value,
         updated_at   = now()
    from x
   where w.year = v_y and w.week_number = v_w
     and w.store_name = x.store_name and w.metric_key = x.metric_key
     and w.portal_value is distinct from x.value;
  get diagnostics n_upd = row_count;

  insert into public.weekly_checklist (year, week_number, store_name, metric_key, portal_value, updated_at)
  select v_y, v_w, x.store_name, x.metric_key, x.value, now()
    from public.checklist_portal_values(v_y, v_w) x
   where x.metric_key = any (v_keys)
     and x.value is not null
     and not exists (select 1 from public.weekly_checklist w
                      where w.year = v_y and w.week_number = v_w
                        and w.store_name = x.store_name and w.metric_key = x.metric_key);
  get diagnostics n_ins = row_count;

  insert into public.weekly_checklist_snapshots (year, week_number, metric_key, taken_by)
  select v_y, v_w, k, coalesce(p_by, 'cron') from unnest(v_keys) as k
  on conflict (year, week_number, metric_key) do nothing;

  return n_upd + n_ins;
end
$function$;

comment on function public.checklist_snapshot_deadline(text) is
  'Чек лист: снимка в края на деня-срок — ако днес (Europe/Sofia, след 23:00) е deadline_day на активна колона и снимка още няма, записва живите стойности в weekly_checklist.portal_value и ред в weekly_checklist_snapshots. -2 = преди 23:00, -1 = няма какво, иначе брой записани редове.';

revoke all on function public.checklist_snapshot_deadline(text) from public;
revoke all on function public.checklist_snapshot_deadline(text) from anon, authenticated;
grant execute on function public.checklist_snapshot_deadline(text) to service_role;

-- 23:59 Europe/Sofia: 20:59 UTC (лято, UTC+3) и 21:59 UTC (зима, UTC+2);
-- guard-ът оставя само събуждането, при което в София е 23 ч.
select cron.schedule(
  'checklist-transit-snapshot-2359',
  '59 20,21 * * *',
  $cron$select public.checklist_snapshot_deadline('cron')
  where extract(hour from now() at time zone 'Europe/Sofia') = 23;$cron$
);
