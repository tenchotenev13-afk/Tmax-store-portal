Отворено: 17.11 · Кой чака: Тенчо · Сесия: razliki-etap5

Етап 5б на Разлики — местата, които днес броят насочените междускладови редове
(етап 5а: wrong_barcode / pack_mismatch / similar_item → ЦО, damaged →
регионалният) като „чака склада" или „чака обекта". Етап 5а НЕ ги пипа; правилото
е `sdLineRoute` / `sdLineRoutedHere` в stock-differences.js.

1. report.js:2342–2344 — „Необработени разлики над N дни" (дневен/седмичен
   отчет), клон (б): ред без отговор на склада (`noWr`) → колона „склад".
   Насоченият ред няма отговор на склада → днес се брои като „чака склада".
   Би се сменило: насоченият ред — в отделна колона („ЦО" / „регионален") или
   извън броя.
2. supabase/functions/send-scheduled-report/index.ts:3390–3393 — копието на
   същото в едж функцията (сверява се от tests/report-edge-sync.test.js);
   сменя се заедно с т.1 и изисква деплой.
3. shared.js:970 `diffLineWaitsStore` — изключва само wrong_barcode /
   similar_item; pack_mismatch и damaged с отговор „return" от склада биха се
   брояли като „чака обекта". След 5а насоченият ред по новия път няма
   отговор на склада, тоест днес не се брои — но правилото не знае за
   насочването. Копие: send-scheduled-report/index.ts:888. Ползват го
   bulletin.js:1564–1568 (`bulDiffStoreWaiting`, „⏳ N реда чакат отговор"),
   report.js:2345 (колона „чака обекта"), stock-differences.js
   (`sdMyWaitingLines`, `sdUnreviewedCountFor` на обекта).
4. Базата: функцията `stock_diff_store_done` (stock-diff-auto-complete-schema.sql:215–222,
   миграция 20261014120000_stock_diff_store_move) — същото изключение
   `not in ('wrong_barcode','similar_item')`; отмята „РАЗЛИКИ ЛОГИСТИЧНИ
   СКЛАДОВЕ" в Бюлетина. Огледалото на т.3 — сменят се заедно.
5. bulletin.js:1550 — заявката за `bulAutoPending['stock-diff']` тегли
   `difference_category` и `direction` — данните за правилото ги има.

Решение, което трябва преди 5б: насоченият ред брои ли се изобщо някъде
(отделна колона „ЦО / регионален" в отчета) или изчезва от всички броеве.

Наблюдение от проверката на живо на етап 6а (18.11, сесия razliki-etap6a) —
за етап 6б, не за 5б: на 15-те реда „Ход: ЦО“ (warehouse_response 'return' +
store_response 'no_stock') складът още вижда четирите си стари бутона
(diffWarehouseResolveButtons), с активен „↩️ Обратно“ — макар ходът да не е
негов. Да се изчисти в 6б (бутоните на склада по категория / по ход).
