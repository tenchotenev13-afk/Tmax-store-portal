-- Приложено в Supabase на 23.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: diff_stale_days_setting (version 20260923084515)
--
-- ДАННИ, не схема: нов ред в app_settings. НИЩО ЗА ЖИВКО.
--
-- Праг в ДНИ за секцията „⏳ Необработени разлики над N дни" в СЕДМИЧНИЯ
-- отчет. Възрастта се мери от differences_reports.created_at, не от реда:
-- бланката е подадена веднъж и точно оттогава тече чакането. Критерият е
-- строго „над" — доклад на точно N дни още не влиза.
--
-- Образецът е returns_stale_days и storno_small_threshold. Стойността е
-- ТЕКСТ (таблицата е key/value от text) и минава през Number() в двата
-- кода — report.js и send-scheduled-report; липсващ ключ, празна, нечислова
-- или нулева стойност → 3.
--
-- Rollback: supabase/migrations/20260923084515_diff_stale_days_setting_down.sql

insert into public.app_settings (key, value, updated_by)
values ('diff_stale_days', '3', 'claude 23.09.2026 — необработени разлики в седмичния отчет')
on conflict (key) do nothing;
