-- Rollback на 20261015132314_transfer_events_unit
--
-- ГУБИ ДАННИ: номерата на единиците изчезват — отметките по единица стават
-- „за целия товар" (един „Получен" за кашон 1/3 ще изглежда като получен
-- целият товар). Преди rollback:
--   select count(*) from transfer_cargo_events where unit is not null;
-- transfers.js, report.js и send-scheduled-report четат unit — върни и кода
-- (и деплоя на функцията), иначе заявките им падат.

drop index if exists transfer_cargo_events_unit_once;
alter table public.transfer_cargo_events drop column if exists unit;
