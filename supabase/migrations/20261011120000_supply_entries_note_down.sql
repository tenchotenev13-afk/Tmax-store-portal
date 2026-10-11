-- Rollback на 20261011120000_supply_entries_note
--
-- ГУБИ ДАННИ: всички коментари от обектите изчезват. Преди rollback:
--   select count(*) from supply_entries where note is not null;
-- Върне ли се само базата, supply.js (праща note) и send-routed-report
-- (select=…,note) падат с 400 — първо се връщат те.

alter table public.supply_entries drop column if exists note;
