-- Rollback на 20260918125150_task_report_target_recipients.sql
--
-- ⚠️ Първо се връщат КЛИЕНТЪТ (bulletin.js — секцията „Отчет за
-- изпълнението") и dynamic-responder / send-routed-report (режимът
-- task_report). Иначе клиентът пише в колона, която я няма (PGRST204), а
-- насрочените отчети губят получателите си.
--
-- ⚠️ Трие получателите на всички насрочени отчети по задача. Самите редове
-- остават без адресати; преди това виж:
--   select id, entity_id, scheduled_date, scheduled_time, target_recipients
--     from public.notification_schedules where entity_type = 'task_report';
-- и ги изтрий или деактивирай съзнателно:
--   update public.notification_schedules set active = false where entity_type = 'task_report';

alter table public.notification_schedules drop column if exists target_recipients;
