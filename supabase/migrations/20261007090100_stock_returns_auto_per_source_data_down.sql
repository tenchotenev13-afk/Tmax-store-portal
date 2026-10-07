-- Rollback на 20261007090100_stock_returns_auto_per_source_data
-- Първо се връща ТОЗИ файл, после _per_source_down.sql.

-- 1. Новите автоматични отметки на двете списъчни задачи (само свои редове,
--    само от седмицата на 05.10).
delete from public.task_completions
 where recurring_task_id in ('0a20f6e8-c526-400b-bed5-57194f35e4e5',
                             'e9d418af-311a-45ec-b4da-0f9ad69205e7')
   and completed_by = 'auto:stock-returns'
   and completion_date >= date '2026-10-05';

-- 2. linked_module обратно: списъчните задачи — само версията от 05.10;
--    „Срок на годност" — основният запис и двете му версии.
update public.recurring_task_versions
   set linked_module = 'stock-returns'
 where (recurring_task_id in ('0a20f6e8-c526-400b-bed5-57194f35e4e5',
                              'e9d418af-311a-45ec-b4da-0f9ad69205e7')
        and from_monday = date '2026-10-05')
    or (recurring_task_id = '31351174-4182-46a1-a1ce-91e877066297'
        and from_monday in (date '2026-09-28', date '2026-10-05'));

update public.recurring_tasks
   set linked_module = 'stock-returns'
 where id = '31351174-4182-46a1-a1ce-91e877066297';

-- 3. Изтритите отметки — от архива. on conflict do nothing: ако междувременно
--    е пуснат стария sync и вече е вмъкнал свой ред, не се дублира.
insert into public.task_completions
select * from public.stock_returns_auto_bak_20261007
on conflict do nothing;

-- Таблицата-архив се пази до ръчен drop (виж claude/open-tasks.md):
--   drop table public.stock_returns_auto_bak_20261007;
