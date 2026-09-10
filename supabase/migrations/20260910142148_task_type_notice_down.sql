-- Rollback на 20260910142148_task_type_notice.sql
--
-- ⚠️ Върни СЪДЪРЖАНИЕТО, преди да върнеш ограничението. Има ли дори един ред
-- с task_type='notice', ADD CONSTRAINT пада и таблицата остава без CHECK.
-- 'info' е стойността по подразбиране в двете таблици и е безопасна цел:
-- задачата се връща като обикновена, отмятанията ѝ (ако е имала) отново се
-- броят.

update public.bulletin_tasks  set task_type = 'info' where task_type = 'notice';
update public.recurring_tasks set task_type = 'info' where task_type = 'notice';

alter table public.bulletin_tasks
  drop constraint if exists bulletin_tasks_task_type_check;
alter table public.bulletin_tasks
  add constraint bulletin_tasks_task_type_check
  check (task_type = any (array[
    'info'::text, 'photo'::text, 'comment'::text, 'photo_comment'::text
  ]));

alter table public.recurring_tasks
  drop constraint if exists recurring_tasks_task_type_check;
alter table public.recurring_tasks
  add constraint recurring_tasks_task_type_check
  check (task_type = any (array[
    'info'::text, 'photo'::text, 'file'::text, 'comment'::text,
    'photo_comment'::text, 'file_comment'::text
  ]));

comment on column public.bulletin_tasks.task_type is null;
comment on column public.recurring_tasks.task_type is null;
