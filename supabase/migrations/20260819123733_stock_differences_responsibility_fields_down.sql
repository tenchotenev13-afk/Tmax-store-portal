-- 20260819123733_stock_differences_responsibility_fields_down.sql
--
-- ВНИМАНИЕ: разрушителен. Триенето на четирите колони изтрива записаните
-- имена и дати БЕЗВЪЗВРАТНО — кой е решил и кой е изпълнил всяка разлика.
-- Тази информация не съществува никъде другаде: няма backfill, няма одитен
-- запис, от който да се възстанови.
--
-- Към 19.08.2026 колоните са празни във всичките 44 реда (кодът още не ги
-- пише), тоест днес rollback-ът не губи нищо. Това е моментна снимка —
-- преди реален rollback се брои наново:
--   select count(resolved_by), count(resolved_at),
--          count(completed_by), count(completed_at)
--     from public.stock_differences;
--
-- По избор, преди drop-а — резервно копие:
-- create table if not exists public._bak_sd_responsibility as
--   select id, resolved_by, resolved_at, completed_by, completed_at
--     from public.stock_differences
--    where resolved_by is not null or completed_by is not null;

alter table public.stock_differences
  drop column if exists resolved_by,
  drop column if exists resolved_at,
  drop column if exists completed_by,
  drop column if exists completed_at;
