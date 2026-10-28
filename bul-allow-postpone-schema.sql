-- bul-allow-postpone-schema.sql — Бюлетин: офисът забранява „⏱ Отложи" и/или
-- „🚫 Не се отнася" по ПОСТОЯННА задача. Сесия bul-allow-postpone, 28.10.2026.
--
-- Решение на Тенчо 28.10.2026, вариант А — по писмото на Миглена от 21.10
-- („ТеМАХ — РЕВИЗИЯ ГРУПИ"). Настройката е ОБЩА за всички седмици, като
-- store_hints: колоните НЕ влизат в RECURRING_CONTENT_FIELDS и не се
-- версионират (recurring_task_versions); пишат се с PATCH върху recurring_tasks.
--
-- ФАКТИ (база, 28.10.2026, преди миграцията): recurring_tasks 26 реда (24
-- активни); колони allow_* няма; тригери върху recurring_tasks няма.
-- Default true за всички → нищо не се променя, докато офисът не махне отметка.
-- Вече отложените / заявените „не се отнася" (task_completions) не се пипат —
-- напр. Севлиево, РЕВИЗИЯ ГРУПИ, 21.10 → 28.10.
--
-- Еднократните задачи (bulletin_tasks) — НЕ тук
-- (claude/open/28-10-bul-allow-postpone-oneoff.md).
--
-- Огледалото: две нови колони → ред в zhivko-opashka.md, „Чака изпращане".
-- Колоните се добавят с default → PostgreSQL 11+ не пренаписва таблицата.

alter table public.recurring_tasks
  add column allow_postpone boolean not null default true,
  add column allow_not_applicable boolean not null default true;

comment on column public.recurring_tasks.allow_postpone is
  'false = обектите нямат „⏱ Отложи" за задачата (решение 28.10.2026, общо за всички седмици)';
comment on column public.recurring_tasks.allow_not_applicable is
  'false = обектите нямат „🚫 Не се отнася" за задачата (решение 28.10.2026, общо за всички седмици)';

-- ── ПРОВЕРКА СЛЕД ─────────────────────────────────────────────────────────
-- select count(*) всички,
--        count(*) filter (where allow_postpone and allow_not_applicable) двете_true
--   from public.recurring_tasks;            -- очаква се всички = двете_true = 26

-- ── ROLLBACK (down) ───────────────────────────────────────────────────────
-- Губи само забраните, сложени от офиса след миграцията. Първо git revert на
-- кода — иначе bulAllowToggle() пише в несъществуваща колона (PGRST204).
-- alter table public.recurring_tasks
--   drop column if exists allow_postpone,
--   drop column if exists allow_not_applicable;
