-- Rollback на 20260923084515_diff_stale_days_setting.sql
--
-- Махането на реда НЕ маха секцията — и двата кода падат към 3 дни при
-- липсващ ключ. Иска ли се друг праг, стойността се сменя:
--   update public.app_settings set value = '7' where key = 'diff_stale_days';
-- Изтриването е уместно само ако секцията се маха от report.js и от
-- send-scheduled-report.

delete from public.app_settings where key = 'diff_stale_days';
