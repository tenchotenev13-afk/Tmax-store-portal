-- Rollback на 20261005120000_supply_auto_complete
--
-- Редовете в task_completions с completed_by='auto:supply' ОСТАВАТ (история).
-- Да се махнат ли — отделно решение:
--   select count(*) from task_completions where completed_by='auto:supply';
-- Ръчното отмятане се връща с rollback на САМИЯ ПОРТАЛ (BUL_AUTO_MODULES в
-- bulletin.js и AUTO_COMPLETE_FROM в shared.js). Върне ли се само тази
-- миграция, задачата остава заключена в портала и НИКОЙ не може да я отметне.

select cron.unschedule('supply-auto-complete')
 where exists (select 1 from cron.job where jobname='supply-auto-complete');

drop trigger if exists supply_sync_entries_upd on public.supply_entries;
drop trigger if exists supply_sync_entries_del on public.supply_entries;
drop trigger if exists supply_sync_entries_ins on public.supply_entries;
drop function if exists public.supply_sync_entries_trg();
drop function if exists public.supply_sync_completions(text, date);
drop function if exists public.supply_store_done(text, date);
drop function if exists public.supply_task_for_week(date);
