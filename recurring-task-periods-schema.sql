-- Постоянните задачи по седмици: recurring_task_periods
--
-- До 11.09.2026 recurring_tasks беше една обща листа с active=true/false и
-- всеки бюлетин я четеше наново: спряна задача изчезваше от старите седмици,
-- нова се появяваше в тях. Сега задачата важи за седмица W, ако има период
--   from_monday <= W.monday  и  (to_monday is null  или  to_monday >= W.monday).
-- Двете граници са ПОНЕДЕЛНИЦИ и са включени: to_monday е понеделникът на
-- ПОСЛЕДНАТА валидна седмица.
--
-- ═══ БУТОНИТЕ (bulletin.js, само в бюлетина на текущата седмица W) ═══════
--   „⏸ Спри"       → отвореният период получава to_monday = W.monday − 7
--                    (от W нататък не се изисква; W−1 и по-старите я имат).
--                    Спряна в първата си седмица → периодът се трие.
--   „▶ Активирай"  → нов период from_monday = W.monday, to_monday = null.
--                    Старият затворен остава — празнината се пази.
--   Нова задача    → from_monday = max(показаната седмица, текущата).
--   Редакция на текст важи навсякъде — не е snapshot (решено 11.09.2026).
--
-- ═══ recurring_tasks.active ОСТАВА — като кеш ═════════════════════════════
-- active = „има отворен период". Кодът го поддържа при всяка промяна на
-- период. Понеже бутоните са само в текущата седмица, active е точно
-- „важи тази седмица" — и консуматорите на ТЕКУЩАТА седмица (today,
-- notifications, daily-turnover, today_deadlines/deadline_passed в
-- bulletin-notify) продължават с active=eq.true, без промяна.
-- Консуматорите на КОНКРЕТНА седмица (бюлетинът, чек листът, отчетите,
-- overdue_tasks за вчера) четат периодите.
--
-- ═══ ОГРАНИЧЕНИЯТА — всяко срещу тих провал ═══════════════════════════════
--   range_chk     — to_monday преди from_monday: период, който не покрива
--                   нито една седмица, но изглежда като запис.
--   from_mon_chk,
--   to_mon_chk    — граница, която не е понеделник: сравнението с
--                   W.monday би изпуснало или добавило седмица без грешка.
--   rtp_open_uq   — най-много ЕДИН отворен период на задача. Два отворени
--                   правят „затвори отворения" двусмислено, а active-кеша —
--                   неверен след първото „Спри".
-- Застъпване на затворени периоди не се пази с constraint (иска btree_gist);
-- кодът създава нов период само когато няма отворен.
--
-- ═══ RLS ═════════════════════════════════════════════════════════════════
-- Огледално на recurring_tasks и recurring_task_skips (проверено 11.09.2026):
-- RLS включено, четири anon политики „Allow …", UPDATE без with check.
-- GRANT-овете идват и от pg_default_acl; тук са изрично, за да ги види
-- огледалото. Едж функциите са със service_role (bypassrls).
--
-- ═══ BACKFILL ════════════════════════════════════════════════════════════
-- Всяка задача получава ЕДИН период:
--   from_monday = понеделникът на седмицата на created_at (Europe/Sofia) —
--                 не '2024-01-01': бюлетини има от С23, задачите са от
--                 С29–С36, и с 2024 всички биха се появили в седмици преди
--                 да съществуват. Първите отметки са винаги след created_at.
--   active=true  → to_monday = null.
--   active=false → to_monday = 2026-08-31 (С36): и двете спрени
--                 (e83f53fa „Ревизии 953", bc34a4c4 „Промоция 1+1") са спрени
--                 от потребителя на 11.09.2026, в С37 → Спри(W) = W−1.
-- Защитата отгоре: ако в момента на прилагане спрените не са ТОЧНО тези
-- две, миграцията спира — някой е натиснал бутон между прегледа и
-- прилагането, и датата 2026-08-31 не важи за новата.
--
-- Засегнати съществуващи редове: 0 — recurring_tasks не се пипа (active
-- остава както е); нова таблица + 14 реда backfill.
--
-- Нова таблица → Живко обновява mirror-schema.sql и $TableColumns.
-- Rollback: supabase/migrations/20260911204550_recurring_task_periods_down.sql

do $$
declare
  stopped text[];
begin
  select coalesce(array_agg(id::text order by id::text), '{}') into stopped
    from public.recurring_tasks where active = false;
  if stopped <> array['bc34a4c4-7c5f-4425-b395-2b9649552c7f',
                      'e83f53fa-907b-41b2-8961-e023f543eff1'] then
    raise exception 'Спрените задачи не са очакваните две (bc34a4c4, e83f53fa): %. Backfill датата 2026-08-31 не важи — прегледай наново.', stopped;
  end if;
end $$;

create table public.recurring_task_periods (
  id                uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references public.recurring_tasks(id) on delete cascade,
  from_monday       date not null,
  to_monday         date,
  created_by        text,
  created_at        timestamptz default now(),
  constraint recurring_task_periods_range_chk    check (to_monday is null or to_monday >= from_monday),
  constraint recurring_task_periods_from_mon_chk check (extract(isodow from from_monday) = 1),
  constraint recurring_task_periods_to_mon_chk   check (to_monday is null or extract(isodow from to_monday) = 1)
);

create index rtp_task_from_idx
  on public.recurring_task_periods (recurring_task_id, from_monday);

create unique index rtp_open_uq
  on public.recurring_task_periods (recurring_task_id)
  where to_monday is null;

alter table public.recurring_task_periods enable row level security;

create policy "Allow select recurring_task_periods" on public.recurring_task_periods
  for select to anon using (true);
create policy "Allow insert recurring_task_periods" on public.recurring_task_periods
  for insert to anon with check (true);
create policy "Allow update recurring_task_periods" on public.recurring_task_periods
  for update to anon using (true);
create policy "Allow delete recurring_task_periods" on public.recurring_task_periods
  for delete to anon using (true);

grant select, insert, update, delete on public.recurring_task_periods to anon, authenticated, service_role;

insert into public.recurring_task_periods (recurring_task_id, from_monday, to_monday, created_by)
select id,
       date_trunc('week', created_at at time zone 'Europe/Sofia')::date,
       case when active then null else date '2026-08-31' end,
       'backfill 11.09.2026'
  from public.recurring_tasks;

comment on table public.recurring_task_periods is
  'Седмиците, в които постоянната задача важи: from_monday..to_monday (понеделници, включително). to_monday NULL = отворен. recurring_tasks.active = има отворен период.';
comment on index public.rtp_open_uq is
  'Най-много един отворен период (to_monday IS NULL) на постоянна задача.';
