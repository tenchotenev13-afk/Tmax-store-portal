-- Rollback на 20260918120256_report_cron_schedule.sql
--
-- Клиентът (admin.js → renderReportsAdmin) не зависи от функцията: при
-- провал на заявката колоната „Разписание" пада обратно към статичния текст
-- от ADMIN_REPORTS. Затова редът на връщане няма значение.
-- cron.job не се пипа — функцията само чете.

drop function if exists public.report_cron_schedule();
