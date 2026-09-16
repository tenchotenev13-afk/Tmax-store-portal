-- Rollback на 20260916090050_stock_diff_swaps.sql
--
-- Ред: първо колоната swap_id (FK към размените), после индексът, после
-- таблицата. Политиката anon_all_sd_swaps и grant-овете падат с таблицата.
-- Всички записани размени и връзките stock_differences.swap_id се губят
-- безвъзвратно. Преди пускане: уведоми Живко (огледалото очаква таблицата
-- и колоната).

alter table public.stock_differences drop column swap_id;
drop index if exists public.stock_diff_swaps_to_open;
drop table public.stock_diff_swaps;
