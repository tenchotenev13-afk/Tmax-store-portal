-- Чек лист, checklist-live-calc етап 2: затваряне (замразяване) на приключила седмица (26.10.2026).
-- Обяснението — в weekly-checklist-freeze-schema.sql (корен). Rollback: *_down.sql.

create table public.weekly_checklist_freezes (
  year        int  not null,
  week_number int  not null,
  frozen_at   timestamptz not null default now(),
  frozen_by   text,
  constraint weekly_checklist_freezes_pkey primary key (year, week_number),
  constraint weekly_checklist_freezes_week_chk check (week_number between 1 and 53)
);

comment on table public.weekly_checklist_freezes is
  'Чек лист: затворените (замразени) седмици. Ред = стойностите на седмицата са записани в weekly_checklist.portal_value и не се смятат повече. Пише само checklist_freeze_week().';
comment on column public.weekly_checklist_freezes.frozen_by is
  'Кой е затворил: ''cron'' (понеделник 00:10) или текст от еднократно затваряне.';

alter table public.weekly_checklist_freezes enable row level security;
create policy weekly_checklist_freezes_select on public.weekly_checklist_freezes
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on table public.weekly_checklist_freezes from anon, authenticated;
grant select on table public.weekly_checklist_freezes to anon, authenticated;

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
     and w.portal_value is distinct from x.value;
  get diagnostics n_upd = row_count;

  insert into public.weekly_checklist (year, week_number, store_name, metric_key, portal_value, updated_at)
  select p_year, p_week, x.store_name, x.metric_key, x.value, now()
    from public.checklist_portal_values(p_year, p_week) x
   where x.value is not null
     and not exists (select 1 from public.weekly_checklist w
                      where w.year = p_year and w.week_number = p_week
                        and w.store_name = x.store_name and w.metric_key = x.metric_key);
  get diagnostics n_ins = row_count;

  return n_upd + n_ins;
end
$function$;

comment on function public.checklist_freeze_week(int, int, text) is
  'Чек лист: затваря ПРИКЛЮЧИЛА седмица веднъж — записва стойностите от checklist_portal_values() в weekly_checklist.portal_value (само промените) и ред в weekly_checklist_freezes. -2 = не е приключила, -1 = вече затворена, иначе брой записани редове. control_* не се пипат.';

revoke all on function public.checklist_freeze_week(int, int, text) from public;
revoke all on function public.checklist_freeze_week(int, int, text) from anon, authenticated;
grant execute on function public.checklist_freeze_week(int, int, text) to service_role;

-- Понеделник 00:10 Europe/Sofia: неделя 21:10 UTC (лято, UTC+3) и 22:10 UTC
-- (зима, UTC+2); guard-ът оставя само събуждането, при което в София е 00 ч.
select cron.schedule(
  'checklist-freeze-mon-0010',
  '10 21,22 * * 0',
  $cron$select public.checklist_freeze_week(extract(isoyear from d)::int, extract(week from d)::int, 'cron')
  from (select (now() at time zone 'Europe/Sofia')::date - 1 as d) x
  where extract(hour from now() at time zone 'Europe/Sofia') = 0;$cron$
);
