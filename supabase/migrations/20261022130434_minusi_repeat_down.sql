-- Rollback на 20261022130434_minusi_repeat.
--
-- ГУБИ ДАННИ: въведените от обектите действия срещу повторен минус. Преди
-- rollback:
--   select count(*) from minus_movements where action is not null;
-- minusi.js чете колоната action — върни и кода, иначе „Минуси" показва грешка.
delete from public.app_settings where key = 'minus_repeat_days';
alter table public.minus_movements drop column if exists action;
