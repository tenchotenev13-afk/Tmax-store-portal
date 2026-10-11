-- Rollback на 20261011210000_revaluation
--
-- ГУБИ ДАННИ: всички кампании, бланки и редове на „Преоценка“ изчезват.
-- Преди rollback:
--   select (select count(*) from revaluation_campaigns) c,
--          (select count(*) from revaluation_submissions) s,
--          (select count(*) from revaluation_items) i;
-- В етап 1 нищо в кода не чете таблиците, тоест rollback не чупи портала.
-- От етап 2 нататък — първо се маха revaluation.js, после базата.

drop table if exists public.revaluation_items;
drop table if exists public.revaluation_submissions;
drop table if exists public.revaluation_campaigns;
