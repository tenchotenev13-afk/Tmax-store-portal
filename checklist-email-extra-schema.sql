-- checklist-email-extra-schema.sql
-- Чек лист: писмото „Изпрати" / „Изпрати поправка" отива освен до обектите и
-- до регионалните, контролинга и ръководството (решение на Тенчо 26.11.2026).
-- Допълнителните адреси на общата група са в app_settings, ключ
-- 'checklist_email_extra' — JSON масив от имейли (checklistParseExtraEmails
-- в checklist.js). Липсващ/повреден ключ → общата група е само контролингът.
--
-- ПРОМЯНА САМО В ДАННИ — без нова таблица/колона, без промяна за огледалото.
-- Миграция: supabase/migrations/20261126120000_checklist_email_extra.sql
--
-- Rollback (supabase/migrations/20261126120000_checklist_email_extra_down.sql):
--   delete from public.app_settings where key = 'checklist_email_extra';

insert into public.app_settings (key, value, updated_at, updated_by)
values ('checklist_email_extra', '["t.tenev@temax.bg","ten.tenev@temax.bg"]', now(), 'migration checklist_email_extra')
on conflict (key) do nothing;
