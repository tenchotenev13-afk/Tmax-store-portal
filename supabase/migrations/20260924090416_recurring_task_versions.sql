-- Съдържанието на постоянната задача ПО СЕДМИЦИ: recurring_task_versions
--
-- До 24.09.2026 редакцията на постоянна задача (submitEditRecurring в
-- bulletin.js) правеше PATCH върху единствения ред в recurring_tasks. Всички
-- бюлетини четат съдържанието оттам, затова поправка, направена от чернова за
-- следващата седмица, сменяше и публикувания бюлетин, и всички стари.
-- recurring_task_periods (миграция 20260911204550) решава само ДАЛИ задачата
-- важи за седмицата, не КАКВО пише в нея.
--
-- id-то НЕ се сменя: към него висят task_completions (2311 реда на
-- 24.09.2026), recurring_task_skips, recurring_task_periods, насрочените
-- отчети в notification_schedules и прикачените файлове. Затова задачата не
-- се копира в нов ред — съдържанието става зависимо от седмицата при СЪЩОТО
-- id, в отделна таблица.
--
-- ═══ ГРАНИЦИТЕ СА КАТО ПРИ ПЕРИОДИТЕ ════════════════════════════════════
-- Версията важи за седмица W, ако
--   from_monday <= W.monday  и  (to_monday is null  или  to_monday >= W.monday).
-- Двете граници са ПОНЕДЕЛНИЦИ и са включени. Покриват ли няколко версии
-- една седмица (не бива, но данните не го пазят), печели най-късният
-- from_monday — виж recurringVersionForWeek() в shared.js.
-- Задача БЕЗ нито една версия за W се чете от реда в recurring_tasks. Това е
-- и резервата, и поведението отпреди тази таблица.
--
-- ═══ ДВАТА ПЪТЯ ПРИ „💾 Запази" (bulletin.js) ════════════════════════════
-- W = понеделникът на показания бюлетин, C = понеделникът на текущата седмица.
--   W = C  („само тази седмица")   → версия W..W с новото съдържание.
--            Покрива ли W по-стара версия, тя се разделя: старата се затваря
--            на W−7 (или се трие, ако започва в самата W), пише се W..W с
--            новото и опашка от W+7 с ПРЕДИШНОТО съдържание — иначе „само
--            тази седмица" би изтрило по-ранна постоянна редакция.
--   W > C  („от W нататък")        → версиите, които започват на или след W,
--            се трият (по-късна редакция се замества); версия, която покрива
--            W и е започнала преди нея, се затваря на W−7; пише се W..null.
--   W < C  (минал бюлетин)         → забранено; бутонът ✏️ го няма там.
-- recurring_tasks НЕ се пипа в нито един от двата пътя — затова текущата и
-- миналите седмици остават такива, каквито са били.
--
-- ═══ КОЛОНИ ════════════════════════════════════════════════════════════
-- Съдържанието е ТОЧНО полетата, които формата редактира, със същите типове
-- като в recurring_tasks (due_time е text, не time — както е заварено).
-- sort_order, active и attachments НЕ са тук: подредбата и файловете са общи
-- за всички седмици (решено 24.09.2026).
--
-- ═══ ОГРАНИЧЕНИЯТА — всяко срещу тих провал ════════════════════════════
--   range_chk     — to_monday преди from_monday: версия, която не покрива
--                   нито една седмица, но изглежда като запис;
--   from_mon_chk,
--   to_mon_chk    — граница, която не е понеделник: сравнението с W.monday
--                   би изпуснало или добавило седмица без грешка;
--   rtv_open_uq   — най-много ЕДНА отворена версия на задача. Две отворени
--                   правят „коя важи от следващата седмица" двусмислено.
-- Застъпване на ЗАТВОРЕНИ версии не се пази с constraint (иска btree_gist) —
-- същото решение като при recurring_task_periods; кодът пише така, че да не
-- се застъпват, а четенето взима най-късния from_monday.
--
-- ═══ RLS ═══════════════════════════════════════════════════════════════
-- Огледално на recurring_task_periods: RLS включено, четири anon политики,
-- UPDATE без with check. Едж функциите са със service_role (bypassrls).
--
-- Засегнати съществуващи редове: 0 — нова таблица, без backfill. Всичките 18
-- задачи продължават да се четат от реда си, докато някой не ги редактира.
--
-- Живко: НОВА ТАБЛИЦА recurring_task_versions (колоните и типовете са
-- отдолу) → mirror-schema.sql и $TableColumns в sync-mirror.ps1.
-- Rollback: supabase/migrations/20260924090416_recurring_task_versions_down.sql

create table public.recurring_task_versions (
  id                uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references public.recurring_tasks(id) on delete cascade,
  from_monday       date not null,
  to_monday         date,
  title             text not null,
  description       text,
  due_weekday       smallint,
  due_weekdays      integer[],
  due_window        boolean not null default false,
  due_time          text,
  task_type         text not null default 'info',
  department        text not null,
  target_stores     text[],
  report_groups     text[],
  linked_module     text,
  created_by        text,
  created_at        timestamptz default now(),
  constraint recurring_task_versions_range_chk    check (to_monday is null or to_monday >= from_monday),
  constraint recurring_task_versions_from_mon_chk check (extract(isodow from from_monday) = 1),
  constraint recurring_task_versions_to_mon_chk   check (to_monday is null or extract(isodow from to_monday) = 1)
);

create index rtv_task_from_idx
  on public.recurring_task_versions (recurring_task_id, from_monday);

create unique index rtv_open_uq
  on public.recurring_task_versions (recurring_task_id)
  where to_monday is null;

alter table public.recurring_task_versions enable row level security;

create policy "Allow select recurring_task_versions" on public.recurring_task_versions
  for select to anon using (true);
create policy "Allow insert recurring_task_versions" on public.recurring_task_versions
  for insert to anon with check (true);
create policy "Allow update recurring_task_versions" on public.recurring_task_versions
  for update to anon using (true);
create policy "Allow delete recurring_task_versions" on public.recurring_task_versions
  for delete to anon using (true);

grant select, insert, update, delete on public.recurring_task_versions to anon, authenticated, service_role;

comment on table public.recurring_task_versions is
  'Съдържанието на постоянната задача за седмиците from_monday..to_monday (понеделници, включително; to_monday NULL = отворена). Няма ли версия за седмицата — чете се редът в recurring_tasks. sort_order, active и attachments НЕ са тук.';
comment on index public.rtv_open_uq is
  'Най-много една отворена версия (to_monday IS NULL) на постоянна задача.';
