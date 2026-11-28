# 28.11 — rls-spravochnici-razliki

- Миграции 2 и 3 от описа rls-15-opis, написани (още НЕ приложени): `rls-spravochnici-schema.sql` (8 справочника) и `rls-razliki-schema.sql` (differences_reports, stock_differences, stock_diff_swaps). RLS on, политики `portal_<команда>` using (true) само за командите с grant днес, `mirror_reader_select`, revoke TRUNCATE / REFERENCES / TRIGGER; MAINTAIN и останалите grants — непипнати. Rollback — в края на всеки файл.
- Сверка преди: ACL anon/authenticated = arwdDxtm на 8 таблици, arwDxtm (без DELETE) на warranty_service_locations / warranty_templates / bulletin_promotions; DELETE_ALLOWED съвпада. stock_differences / stock_diff_swaps имат `anon_all_*` само за anon → там portal_* е само за authenticated (без дубликат).
- product_catalog 500-ките: statement_timeout 3 с на anon (seq scan по sale_price_uploaded_at / ilike), не RLS — `claude/open/28-11-product-catalog-500.md`.
- Без нов ред за Живко (без нови колони / таблици / статуси).
- Тест: `tests/rls-spravochnici-razliki-schema.test.js` 44/0, 15 мутанта падат.
