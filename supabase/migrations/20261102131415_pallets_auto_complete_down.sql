-- Rollback на 20261102131415_pallets_auto_complete
--
-- Редовете в task_completions с completed_by='auto:pallets' ОСТАВАТ (история).
-- Да се махнат ли — отделно решение:
--   select count(*) from task_completions where completed_by='auto:pallets';
-- Ръчното отмятане се връща с rollback на ПОРТАЛА (BUL_AUTO_MODULES в
-- bulletin.js и AUTO_COMPLETE_FROM в shared.js). Върне ли се само базата,
-- задачата остава заключена в портала и никой не може да я отметне.

select cron.unschedule('pallets-auto-complete')
 where exists (select 1 from cron.job where jobname='pallets-auto-complete');

drop trigger if exists pallets_sync_ins on public.transport_pallets;
drop function if exists public.pallets_sync_trg();
drop function if exists public.pallets_sync_completions(text, date);
drop function if exists public.pallets_store_done(text, date, date, timestamptz);
drop function if exists public.pallets_task_for_week(date);
