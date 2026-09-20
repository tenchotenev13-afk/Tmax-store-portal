-- Rollback на 20260920122602_swaps_kind.sql
--
-- Constraint stock_diff_swaps_kind_check пада заедно с колоната.
-- Към 20.09.2026 rollback е без загуба — таблицата беше празна. След като
-- влязат размени, drop-ът заличава класификацията doc/physical безвъзвратно:
-- тя НЕ се извежда обратно от transport_mode, защото физическа размяна със
-- status='linked' още няма попълнен превоз.
--
-- Преди пускане: уведоми Живко (огледалото очаква колоната).

alter table public.stock_diff_swaps drop column kind;
