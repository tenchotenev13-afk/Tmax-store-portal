-- 20260820123008_subtask_rls_policies_down.sql
--
-- ВНИМАНИЕ какво значи този rollback: двете таблици се връщат в състояние
-- "RLS включено, нула политики", тоест ОТНОВО отказват всичко през anon —
-- подзадачите в Бюлетина пак се чупят с 401 при добавяне и връщат 0 реда
-- при четене. Това е връщане към счупено, не към безопасно.
--
-- Данните не се пипат: drop policy не трие редове. Ако междувременно са
-- натрупани подзадачи, те остават в таблицата, но стават недостъпни през
-- REST API (вижда ги само service_role).
--
-- RLS флагът не се пипа и тук — остава включен, какъвто беше.

begin;

drop policy if exists anon_all_subtasks on public.task_subtasks;
drop policy if exists anon_all_subtask_completions on public.subtask_completions;

commit;

-- Проверка след rollback — трябва да върне 0 реда:
--   select policyname, tablename from pg_policies
--    where schemaname = 'public'
--      and tablename in ('task_subtasks','subtask_completions');
