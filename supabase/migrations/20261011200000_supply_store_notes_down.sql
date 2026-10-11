-- Rollback на 20261011200000_supply_store_notes
--
-- ГУБИ ДАННИ: всички коментари на Снабдяването към обектите изчезват. Преди rollback:
--   select count(*) from supply_store_notes where co_note is not null;
-- Върне ли се само базата, supply.js не се чупи: обектът тихо не вижда реда
-- (sbGet silent), а в обобщението на ЦО блокът излиза с червен ред вместо полета.

drop table if exists public.supply_store_notes;
