-- Постоянна задача, изключена за конкретна седмица: recurring_task_skips
--
-- Постоянната задача (recurring_tasks) важи всяка седмица и за всеки обект в
-- обхвата си. Ред тук казва „тази седмица задачата не се изисква" — за всички
-- обекти (store_name NULL) или само за посочения обект. Самата задача остава
-- активна; следващата седмица важи отново без никакво действие.
--
-- ═══ КЛЮЧЪТ ЗА СЕДМИЦА ═══════════════════════════════════════════════════
-- (year, week_number) е ISO седмица, а year е годината на ЧЕТВЪРТЪКА от нея —
-- същата двойка като в bulletins за всеки валиден бюлетин. Смята се от ДАТА
-- през recurringSkipWeekOf() в shared.js, не от new Date().getFullYear():
-- около Нова година календарната година и ISO седмицата се разминават
-- (01.01.2027 е седмица 53 на 2026).
--
-- ═══ ЗАЩО ДВА ЧАСТИЧНИ ИНДЕКСА ═══════════════════════════════════════════
-- Обикновен UNIQUE (recurring_task_id, year, week_number, store_name) третира
-- NULL-ите като различни и би допуснал два глобални реда за една и съща
-- седмица. Затова глобалният и магазинният случай имат по свой индекс.
-- Последствие за клиента: PostgREST не може да ползва частичен индекс за
-- on_conflict, тоест повторен запис връща 409 и се обработва като такъв.
--
-- ═══ ТРИТЕ CHECK-А — всеки срещу тих провал ══════════════════════════════
--   week_chk  — ISO седмицата е 1..53; същото като в weekly_checklist.
--   year_chk  — хваща разменени year/week_number и двуцифрена година.
--   store_chk — празен низ би бил трето състояние: нито „за всички", нито
--               реален обект, а уникалният индекс за обект би го приел.
--
-- ═══ RLS ═════════════════════════════════════════════════════════════════
-- Четири отделни anon политики, огледални на recurring_tasks (проверено на
-- 11.09.2026: RLS включено, 4 политики „Allow … recurring_tasks" to anon,
-- UPDATE без with check). Разрешаващи са нарочно — като останалите таблици на
-- Бюлетина; anon ключът е публичен в клиента и базата няма друг слой за права.
-- GRANT-ове не се пишат: pg_default_acl за postgres в public дава arwdDxtm на
-- anon/authenticated/service_role за всяка нова таблица (проверено 11.09.2026).
-- Едж функциите са със service_role (bypassrls) и не зависят от политиките.
--
-- Засегнати съществуващи редове: 0 — таблицата е нова.
--
-- Нова таблица → Живко обновява mirror-schema.sql и $TableColumns.
-- Бележката за него: claude/recurring-task-skips-2026-09-11.md
--
-- Rollback: supabase/migrations/20260911080537_recurring_task_skips_down.sql

create table public.recurring_task_skips (
  id                uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references public.recurring_tasks(id) on delete cascade,
  year              int  not null,
  week_number       int  not null,
  store_name        text,
  reason            text,
  created_by        text,
  created_at        timestamptz default now(),
  constraint recurring_task_skips_week_chk  check (week_number between 1 and 53),
  constraint recurring_task_skips_year_chk  check (year between 2024 and 2100),
  constraint recurring_task_skips_store_chk check (store_name is null or btrim(store_name) <> '')
);

create unique index rts_global_uq
  on public.recurring_task_skips (recurring_task_id, year, week_number)
  where store_name is null;

create unique index rts_store_uq
  on public.recurring_task_skips (recurring_task_id, year, week_number, store_name)
  where store_name is not null;

alter table public.recurring_task_skips enable row level security;

create policy "Allow select recurring_task_skips" on public.recurring_task_skips
  for select to anon using (true);
create policy "Allow insert recurring_task_skips" on public.recurring_task_skips
  for insert to anon with check (true);
create policy "Allow update recurring_task_skips" on public.recurring_task_skips
  for update to anon using (true);
create policy "Allow delete recurring_task_skips" on public.recurring_task_skips
  for delete to anon using (true);

comment on table public.recurring_task_skips is
  'Постоянна задача, изключена за една ISO седмица (year = годината на четвъртъка). store_name NULL = за всички обекти.';
comment on index public.rts_global_uq is
  'Един глобален ред на (постоянна задача, седмица). Частичен: само store_name IS NULL.';
comment on index public.rts_store_uq is
  'Един ред на (постоянна задача, седмица, обект). Частичен: само store_name IS NOT NULL.';
