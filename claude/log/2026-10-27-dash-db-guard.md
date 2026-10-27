# 27.10 — dash-db-guard

- „—“ влизаше пак от 19.10, при актуален жив JS. Сложих предпазител в базата: `strip_leading_dash()` + BEFORE INSERT OR UPDATE тригери `kasa_reports_strip_dash` (cashier_name) и `stock_returns_strip_dash` (store_comment, reason, courier_info, control_comment, controller_comment, product_name). Маха само водещите „—“, тире в средата остава. Миграция `20261027202716 dash_db_guard`, файл `dash-db-guard-schema.sql` (rollback вътре). Sync тригерът на stock_returns не се събужда, защото гледа само status / confirmed_date.
- Почистване на данните: `20261027203119 dash_db_guard_data` (`dash-db-guard-data.sql`). kasa_reports.cashier_name 95 (1 точно „—“ → NULL); stock_returns: store_comment 10 (9 → NULL), reason 14 (14 → NULL), courier_info 17 (14 → NULL), control_comment 1 (→ NULL). След него — 0 с водещо „—“. Старите стойности са в `dash_guard_bak_20261027` (RLS, без права за anon/authenticated, временна, без ред за Живко — решение на Тенчо).
- SQL тест `tests/sql/dash-db-guard.test.sql` срещу живата база: „SQL-ТЕСТ ОК (19 проверки)“. Мутантите M1 (без тригерите), M2 (regex без ^) и M3 (без btrim) дават ПРОВАЛ.
- Причината не е установена. Вероятно е автопопълване на браузъра, не кеш → `claude/open/27-10-store-cache-version.md`.
- Ред за Живко няма — функцията и тригерите не са в огледалото, колоните са същите. JS не е пипан; smoke и npm test дават exit 0.
