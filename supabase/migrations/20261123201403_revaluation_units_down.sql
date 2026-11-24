-- Rollback на 20261123201403_revaluation_units
--
-- ГУБИ ДАННИ: всички номера на бройките (revaluation_units), броячите по
-- обект и адресите на снимките в revaluation_items.photos (файловете в
-- bulletin-files/revaluation/ остават). Първо се връща revaluation.js
-- отпреди етап 2 — новият чете revaluation_units при отваряне на бланка.
-- Преди rollback:
--   select count(*) from revaluation_units;
--   select store_name, last_num from revaluation_unit_counters;
--   select count(*) from revaluation_items where photos is not null;

drop trigger if exists trg_revaluation_unit_no on public.revaluation_units;
drop function if exists public.assign_revaluation_unit_no();
drop table if exists public.revaluation_units;
drop table if exists public.revaluation_unit_counters;
alter table public.revaluation_items drop column if exists photos;
