Отворено: 27.11 · Кой чака: Тенчо · Сесия: notify-tables-lock

**Supabase Advisor `rls_disabled_in_public` (писмо от 22.11.2026) — останалите
15 таблици.** Петте „кой какво получава“ (report_recipients,
notification_topics / matrix / overrides / schedules) се затварят в сесия
notify-tables-lock (`notify-tables-lock-schema.sql`). Тези 15 са извън нея —
към 27.11.2026 са с изключено RLS:

- `users` — затворена с колонни grants, без INSERT/UPDATE/DELETE за anon
  (30.09) — Advisor я показва, но рискът е решен; само решение дали да се
  включи RLS „за чистота“.
- с INSERT + UPDATE + DELETE за anon: `differences_reports`,
  `stock_differences`, `stock_diff_swaps`, `order_restrictions`,
  `product_catalog`, `warranty_brands`, `warranty_entries`,
  `warranty_subcategories`;
- с INSERT + UPDATE (без DELETE): `bulletin_promotions`,
  `client_order_counters`, `notification_log`, `warranty_cards`,
  `warranty_service_locations`, `warranty_templates`.

Пълният списък — заявката `select relname from pg_class … where not
relrowsecurity` в public. Включването на RLS без политики за anon СПИРА
портала (той пише в тях с anon) — за всяка: опис кой пише/чете (като фаза 0
на notify-tables-lock), после или политика `anon_all_*` (както при
останалите 86), или запис през едж функция. И за всяка — политика
`mirror_reader_select`, иначе огледалото вижда 0 реда.
Предложение за ред: първо `notification_log` и `client_order_counters`
(само сървър/тригер?), после гаранционните, накрая Разлики (най-много
пътища от обектите).

**28.11 (сесия rls-server-only): миграция 1 от описа rls-15-opis — готова.**
`notification_log`, `warranty_cards`, `client_order_counters`: RLS on, anon /
authenticated без права, само `mirror_reader_select`; тригерната
`assign_client_order_num()` — SECURITY DEFINER + search_path, без EXECUTE за
PUBLIC/anon/authenticated (миграция `rls_server_only`, 20261128115146,
`rls-server-only-schema.sql`). На живо: клиентски заявки след нея получават
номер (Карлово-0512, Севлиево-0150); bulletin-notify 14:00 → 200.
**Непроверено:** първият запис на bulletin-notify в `notification_log` след
миграцията (последният е от 08:00 София на 28.11) — edge_logs: POST
`/rest/v1/notification_log` от Deno → 201 и нов ред с `sent_at` след
20261128115146. Остават 12 таблици: миграции 2 и 3 от описа
и стъпка (б). Триенето на `warranty_cards` — отделно
(`28-11-warranty-cards-delete.md`); 500-ките на `product_catalog` — преди
нейната миграция (`28-11-product-catalog-500.md`).
