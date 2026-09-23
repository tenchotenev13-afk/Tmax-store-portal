-- Rollback на 20260923074532_enable_rls_task_completions_bak_20260910.sql
--
-- Връща таблицата в състоянието отпреди: RLS изключен, значи четима и
-- писуема с публичния anon ключ. Политики не се трият — нямаше нито една.
-- Данните не се пипат в нито една от двете посоки.

alter table public.task_completions_bak_20260910 disable row level security;
