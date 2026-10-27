-- weekly-checklist-freeze-schema.sql
-- Огледало на supabase/migrations/20261026210000_weekly_checklist_freezes.sql
-- (+ еднократното затваряне на седмици 35–43 в
-- supabase/migrations/20261026210100_weekly_checklist_freeze_35_43.sql).
--
-- ЗАЩО (checklist-live-calc, етап 2 от 3; решение на Тенчо 26.10.2026).
-- Стойностите на чек листа вече не са снимка от последното отваряне на таба.
--   · ТЕКУЩАТА седмица (и всяка незатворена) се показва ЖИВО от
--     checklist_portal_values() — нищо не се пише в базата;
--   · ПРИКЛЮЧИЛАТА се ЗАМРАЗЯВА веднъж: стойностите се записват в
--     weekly_checklist.portal_value и после не се местят.
-- Защо замразяване, а не винаги живо: „Стока на път" и „Стока за връщане" се
-- смятат от ДНЕШНОТО състояние на таблиците (нямат история по седмици) — без
-- замразяване всяка стара седмица и всяка поредица в писмото биха се местили.
-- Отметката на контролинга (control_value / control_num / comment) не се пипа
-- никога и продължава да има предимство.
--
-- 1. weekly_checklist_freezes — ред = седмицата е затворена. RLS: select за
--    anon/authenticated (табът решава живо / замразено); запис САМО от
--    checklist_freeze_week (SECURITY DEFINER) — от браузъра не може.
-- 2. checklist_freeze_week(p_year, p_week, p_by) — затваря ЕДНА седмица:
--      · не е приключила (понеделникът след нея, 00:00 Europe/Sofia, още не е
--        дошъл) → нищо, връща -2;
--      · вече е затворена → нищо, връща -1 (идемпотентна);
--      · иначе записва реда в freezes и пренася стойностите от
--        checklist_portal_values() в weekly_checklist: portal_value и
--        updated_at САМО там, където стойността се МЕНИ (решение 26.10 —
--        иначе „Данни на контролинга към …" в отчета става часът на
--        затварянето за всички редове); нов ред — само ако има стойност;
--        стойност NULL при съществуващ ред → portal_value NULL. control_*,
--        comment, updated_by — НЕ се пипат. Връща броя записани редове.
--    SECURITY DEFINER, search_path = public; execute само за service_role
--    (и собственика) — НЕ за anon/authenticated, без PUBLIC.
-- 3. pg_cron „checklist-freeze-mon-0010": понеделник 00:10 Europe/Sofia —
--    двата UTC кандидата (неделя 21:10 и 22:10 UTC) с guard по часа в София
--    (правилото в CLAUDE.md, „Схемни промени"). Затваря седмицата, която е
--    свършила в неделя (датата в София минус 1 ден).
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблицата е нова. Еднократното затваряне на
-- 35–43 (отделната миграция) презаписва portal_value на тези седмици с
-- изчисленото днес: за колоните от постоянни задачи и „Сторна по грешни
-- приеми" това е същото правило (сверено, етап 1); за „Стока на път" и „Стока
-- за връщане" — състоянието КЪМ ДЕНЯ НА МИГРАЦИЯТА, не към самата седмица.
-- 23 отметки на контролинга в седмици 36–38 остават непокътнати.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане" — нова таблица.
-- Rollback: supabase/migrations/20261026210000_weekly_checklist_freezes_down.sql
--   select cron.unschedule('checklist-freeze-mon-0010');
--   drop function if exists public.checklist_freeze_week(int, int, text);
--   drop table if exists public.weekly_checklist_freezes;
-- (portal_value-тата, записани от затварянето, остават — те са в weekly_checklist).

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
