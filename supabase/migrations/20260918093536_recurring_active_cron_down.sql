-- Rollback на 20260918093536_recurring_active_cron.sql
--
-- ⚠️ Първо се връща КЛИЕНТЪТ (bulletin.js отпреди 18.09.2026 — „+ Добави" и
-- „▶ Активирай" само в текущата седмица). Иначе задача, добавена или
-- активирана от бъдещ бюлетин, остава с active=false завинаги: периодът ѝ
-- започва, но никой не вдига кеша, и тя липсва от „Днес" и известията.
-- Преди това виж кои чакат вдигане:
--   select t.id, t.title, p.from_monday from public.recurring_tasks t
--     join public.recurring_task_periods p on p.recurring_task_id = t.id
--    where p.to_monday is null and not t.active;
--
-- recurring_tasks не се пипа — active остава както е в момента.

select cron.unschedule('recurring-active-refresh')
 where exists (select 1 from cron.job where jobname = 'recurring-active-refresh');

drop function if exists public.recurring_tasks_refresh_active();
