-- Rollback на 20261002090100_stock_returns_auto_complete
--
-- ⚠ РЕДЪТ Е ВАЖЕН: тази миграция се връща ПЪРВА, преди
-- 20261002090000_stock_returns_confirmed_by_down. Обратното оставя тригер,
-- който вика функция, искаща изтрита колона — всеки запис в stock_returns
-- пада с 42703.
--
-- Какво става след връщането: задачата „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" спира да
-- се отмята сама. Вече записаните редове в task_completions с
-- completed_by='auto:stock-returns' ОСТАВАТ — те са история и не се трият
-- автоматично. Да се махнат ли, е отделно решение:
--   select count(*) from task_completions where completed_by='auto:stock-returns';
--   -- delete from task_completions where completed_by='auto:stock-returns';
--
-- Ръчната отметка в портала се връща с rollback на самия портал (BUL_AUTO_MODULES
-- в bulletin.js) — базата не я контролира.

select cron.unschedule('stock-returns-auto-complete')
 where exists (select 1 from cron.job where jobname='stock-returns-auto-complete');

drop trigger if exists stock_returns_sync_upd on public.stock_returns;
drop trigger if exists stock_returns_sync_del on public.stock_returns;
drop trigger if exists stock_returns_sync_ins on public.stock_returns;

drop function if exists public.stock_returns_sync_trg();
drop function if exists public.stock_returns_sync_completions(text, date);
drop function if exists public.stock_returns_store_done(text, date, date);
drop function if exists public.stock_returns_task_for_week(date);
