-- Rollback на transit_empty_stores
--
-- Редът е обратният: първо кронът спира, после функциите падат, накрая се
-- махат ОТМЕТКИТЕ, които тази функция е направила. Ключът в app_settings
-- ОСТАВА — порталът (shared.js) го чете и без него би паднал към вградения си
-- списък, тоест махането му само би върнало твърдото копие.
--
-- Отметките се трият само тези с completed_by='auto:transit-empty' — ръчните и
-- 'auto:transit' не се пипат. След rollback обектите без входящи редове пак ще
-- излизат неизпълнили (поведението до 27.09.2026).

select cron.unschedule('transit-empty-stores');

drop function if exists public.transit_mark_empty_stores();
drop function if exists public.report_excluded_stores();

delete from task_completions where completed_by = 'auto:transit-empty';
