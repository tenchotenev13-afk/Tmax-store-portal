-- Приложено в Supabase на 21.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: product_catalog_ean_idx (version 20260921083912)
--
-- САМО ИНДЕКС. Нито колона, нито таблица, нито ограничение — по правилото на
-- Живко огледалото не носи индекси, тоест за него няма нищо за правене.
--
-- Файлът е записан СЛЕД прилагането. Обратното четене:
--   CREATE INDEX product_catalog_ean_code_idx ON public.product_catalog
--     USING btree (ean_code)
--   indisvalid = true, indisready = true, 2904 kB, 106 550 реда в таблицата.
--
-- ЗАЩО
-- Скенерът на товарните листи (Пакет В1, loading.js → llHandleScannedEan)
-- търси по баркод: ean_code=eq.X, или ean_code=in.(12 цифри, 13 с водеща 0)
-- за UPC-A. Без индекс всяко сканиране беше последователно четене:
--   ПРЕДИ:  Seq Scan on product_catalog, Rows Removed by Filter: 106550,
--           Execution Time: 81.110 ms
--   СЛЕД:   Index Scan using product_catalog_ean_code_idx,
--           Execution Time: 0.131 ms
-- (EXPLAIN ANALYZE, една и съща заявка за липсващ баркод — това е и най-
-- лошият случай за seq scan: чете всичко, преди да каже „няма".)
--
-- Правило 9: неуникален btree — не може да обезсили нито един ред. Заварено
-- към датата: 16 513 реда без ean_code, 114 с боклук вместо баркод (БР, M2,
-- 50" — изместени колони от внос), 89 923 реални баркода без дубликати.
-- Боклукът НЕ се чисти в тази миграция — отделно решение. Индексът го поема
-- както е; число от скенер не може да съвпадне с него.
--
-- ЗАКЛЮЧВАНЕ: create index без concurrently държи SHARE lock върху
-- product_catalog за времето на изграждане (под секунда при 31 MB).
-- apply_migration върви в транзакция, където concurrently не е позволено.
-- Преди прилагането в pg_stat_activity нямаше активни заявки към таблицата.
--
-- Rollback: supabase/migrations/20260921083912_product_catalog_ean_idx_down.sql

create index if not exists product_catalog_ean_code_idx
  on public.product_catalog (ean_code);

comment on index public.product_catalog_ean_code_idx is
  'Търсене по баркод от скенера на товарните листи (loading.js, llHandleScannedEan): ean_code=eq / ean_code=in.(12 цифри, 13 с водеща 0). Без индекса всяко сканиране четеше 106 550 реда.';
