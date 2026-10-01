-- Rollback на 20261001160000_task_completion_not_applicable
--
-- ⚠ НЕ Е БЕЗУСЛОВЕН. Старият CHECK изброява само 'done' и 'postponed', тоест
-- ако в таблицата има ДОРИ ЕДИН ред с 'not_applicable', ALTER-ът ще падне с
-- 23514 — и това е правилното поведение: алтернативата би била мълчаливо да
-- изтрием заявки на обекти заедно с причините им.
--
-- ПРЕДИ да се пусне:
--   select count(*), array_agg(distinct store_name)
--     from task_completions where status = 'not_applicable';
--
-- Нула → връщането е безопасно.
-- Повече от нула → решение на ЧОВЕК, не рутинна стъпка. Двата изхода са:
--   а) редовете се изтриват (губи се кой какво е заявил и защо) —
--      delete from task_completions where status = 'not_applicable';
--   б) връщането не се прави.
-- Заявките НЕ се превръщат в 'done': това би записало като свършена работа,
-- която обектът изрично е казал, че не може да свърши, и би надула процента му.
--
-- Редът е обратният на миграцията: първо пада изискването за причина, после се
-- стеснява списъкът със статуси. Обратното би оставило CHECK, който се позовава
-- на стойност, вече недопустима от другия.

alter table public.task_completions
  drop constraint if exists task_completions_na_needs_reason_chk;

alter table public.task_completions
  drop constraint if exists task_completions_status_check;

alter table public.task_completions
  add constraint task_completions_status_check
  check (status = any (array['done'::text, 'postponed'::text]));

comment on column public.task_completions.status is null;
