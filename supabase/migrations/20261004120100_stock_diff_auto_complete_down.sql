-- Rollback на 20261004120000_stock_diff_auto_complete
--
-- Задачата „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" спира да се отмята сама. Вече
-- записаните редове в task_completions с completed_by='auto:stock-diff'
-- ОСТАВАТ — те са история и не се трият автоматично. Да се махнат ли, е
-- отделно решение:
--   select count(*) from task_completions where completed_by='auto:stock-diff';
--   -- delete from task_completions where completed_by='auto:stock-diff';
--
-- Ръчната отметка и sdMarkDiffTask се връщат с rollback на САМИЯ ПОРТАЛ
-- (BUL_AUTO_MODULES в bulletin.js и AUTO_COMPLETE_FROM в shared.js) — базата
-- не ги контролира. Върне ли се само тази миграция, задачата остава заключена
-- в портала и НИКОЙ не може да я отметне.

select cron.unschedule('stock-diff-auto-complete')
 where exists (select 1 from cron.job where jobname='stock-diff-auto-complete');

drop trigger if exists stock_diff_sync_swaps_upd on public.stock_diff_swaps;
drop trigger if exists stock_diff_sync_swaps_del on public.stock_diff_swaps;
drop trigger if exists stock_diff_sync_swaps_ins on public.stock_diff_swaps;
drop trigger if exists stock_diff_sync_reports_upd on public.differences_reports;
drop trigger if exists stock_diff_sync_reports_del on public.differences_reports;
drop trigger if exists stock_diff_sync_reports_ins on public.differences_reports;
drop trigger if exists stock_diff_sync_lines_upd on public.stock_differences;
drop trigger if exists stock_diff_sync_lines_del on public.stock_differences;
drop trigger if exists stock_diff_sync_lines_ins on public.stock_differences;

drop function if exists public.stock_diff_sync_swaps_trg();
drop function if exists public.stock_diff_sync_reports_trg();
drop function if exists public.stock_diff_sync_lines_trg();
drop function if exists public.stock_diff_sync_completions(text, date);
drop function if exists public.stock_diff_store_done(text);
drop function if exists public.stock_diff_task_for_week(date);
