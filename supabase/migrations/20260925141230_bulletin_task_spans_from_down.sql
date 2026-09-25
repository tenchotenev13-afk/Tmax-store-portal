-- Rollback на 20260925141230_bulletin_task_spans_from.sql
--
-- Сваля колоната bulletin_tasks.spans_from заедно с петте ограничения и
-- индекса. Задачите остават — губи се само знанието КОИ от тях са
-- многоседмични, тоест те се връщат към поведението „живея само в моя
-- бюлетин": задача, поставена в С40 със срок в С41, ще се вижда само в С40 и
-- ще брои там. Отмятанията (task_completions с completion_date = срока) НЕ
-- се пипат — те остават валидни и при двете посоки.

drop index if exists public.bt_spans_from_due_idx;

alter table public.bulletin_tasks
  drop constraint if exists bulletin_tasks_spans_max_weeks_chk,
  drop constraint if exists bulletin_tasks_spans_later_week_chk,
  drop constraint if exists bulletin_tasks_spans_single_day_chk,
  drop constraint if exists bulletin_tasks_spans_due_req_chk,
  drop constraint if exists bulletin_tasks_spans_from_mon_chk;

alter table public.bulletin_tasks
  drop column if exists spans_from;
