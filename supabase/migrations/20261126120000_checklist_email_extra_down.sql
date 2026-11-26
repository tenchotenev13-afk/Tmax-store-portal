-- Rollback на 20261126120000_checklist_email_extra — маха ключа.
-- checklist.js тогава праща общото писмо само до контролинга (console.error).
delete from public.app_settings where key = 'checklist_email_extra';
