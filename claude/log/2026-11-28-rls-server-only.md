# 28.11 — rls-server-only

- Миграция 1 от описа rls-15-opis: `notification_log`, `warranty_cards`, `client_order_counters` — RLS on, `revoke all` от anon / authenticated, политика `mirror_reader_select`. Схема и rollback — `rls-server-only-schema.sql`.
- `assign_client_order_num()` (тригерът на client_orders) → SECURITY DEFINER + `search_path = public, pg_temp`, тялото непроменено; EXECUTE отнет от PUBLIC / anon / authenticated.
- Преди: като anon INSERT client_orders → „Карлово-0511“ (отменено). edge_logs 24 ч към трите: само mirror_reader и bulletin-notify (service).
- Миграция `rls_server_only` — версия **20261128115146**, приложена 28.11.2026 (≈13:51 София). След: anon INSERT client_orders → „Карлово-0512“ (отменено); anon SELECT/INSERT в трите и прякото викане на функцията → 42501; mirror_reader 3669 / 0 / 19 = като postgres. Без нов ред за Живко (без нови колони/таблици).
- На живо след миграцията: реални клиентски заявки от браузъра — „Карлово-0512“ (13:58) и „Севлиево-0150“ (14:03), POST 201; крон 15 в 14:00 → bulletin-notify 200; огледалото GET warranty_cards 200. Запис в notification_log след миграцията — още няма (кронът не е имал какво да прати); виж `27-11-rls-ostanali-15.md`.
- Затворено: `26-11-kasa-etap2-parvo-polzvane.md` (логове 27–28.11). Обновено: `27-11-rls-ostanali-15.md`.
- Тест: `tests/rls-server-only-schema.test.js` 24/0, 9 мутанта падат.
