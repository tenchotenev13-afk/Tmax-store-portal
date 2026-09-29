-- Rollback на transfers_stage2 (отметки по товар).
-- Без загуба само докато таблицата е празна:
--   select count(*) from public.transfer_cargo_events;
-- transfers.status може да съдържа 'partial' / 'done', записани от клиента;
-- старият код (етап 1) ги показва като суров текст. При нужда:
--   update public.transfers set status = 'planned' where status <> 'planned';
drop table if exists public.transfer_cargo_events;
