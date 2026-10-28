-- bul-allow-postpone-oneoff-schema.sql — Бюлетин: офисът забранява „⏱ Отложи"
-- и/или „🚫 Не се отнася" и по ЕДНОКРАТНА задача (bulletin_tasks).
-- Сесия bul-allow-postpone-oneoff, 28.10.2026. Образец:
-- bul-allow-postpone-schema.sql (recurring_tasks, 876cfdd).
--
-- Решение на Тенчо 28.10.2026: същото като за постоянните. Колоните се пишат
-- от формата на задачата (нова / ✏️) — sbPostReturn / sbPatch върху
-- bulletin_tasks, които вече пращат цялото тяло на задачата.
--
-- ФАКТИ (база, 28.10.2026, преди миграцията): bulletin_tasks 94 реда (4 със
-- срок днес); колони allow_* няма; тригер bulletin_tasks_transit_sync е
-- AFTER INSERT OR UPDATE OF auto_complete, linked_module, due_date, due_dates,
-- target_stores, starts_on — не гледа новите колони и ALTER не го пуска.
-- task_completions по еднократни: 8 'postponed' + 10 'not_applicable' = 18
-- реда, md5 91964cd8955d23a94c5abc33217f4719 — миграцията не ги пипа.
-- Default true за всички → нищо не се променя, докато офисът не махне отметка.
--
-- Огледалото: две нови колони → ред в zhivko-opashka.md, „Чака изпращане".
-- Колоните се добавят с default → PostgreSQL 11+ не пренаписва таблицата.

alter table public.bulletin_tasks
  add column allow_postpone boolean not null default true,
  add column allow_not_applicable boolean not null default true;

comment on column public.bulletin_tasks.allow_postpone is
  'false = обектите нямат „⏱ Отложи" за задачата (решение 28.10.2026)';
comment on column public.bulletin_tasks.allow_not_applicable is
  'false = обектите нямат „🚫 Не се отнася" за задачата (решение 28.10.2026)';

-- ── ПРОВЕРКА СЛЕД ─────────────────────────────────────────────────────────
-- select count(*) всички,
--        count(*) filter (where allow_postpone and allow_not_applicable) двете_true
--   from public.bulletin_tasks;            -- очаква се всички = двете_true = 94
-- select md5(string_agg(id::text||status||coalesce(store_name,'')||coalesce(completion_date::text,'')
--          ||coalesce(postponed_to::text,'')||coalesce(comment,''), '|' order by id)), count(*)
--   from public.task_completions
--  where task_id is not null and status in ('postponed','not_applicable');
--                                          -- очаква се 91964cd8955d23a94c5abc33217f4719, 18

-- ── ROLLBACK (down) ───────────────────────────────────────────────────────
-- Губи само забраните, сложени от офиса след миграцията. Първо git revert на
-- кода — иначе submitTask / submitEditTask пращат несъществуваща колона
-- (PGRST204) и задача не може да се добави / запише.
-- alter table public.bulletin_tasks
--   drop column if exists allow_postpone,
--   drop column if exists allow_not_applicable;
