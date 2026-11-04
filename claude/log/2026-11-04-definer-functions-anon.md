# 04.11 — definer-functions-anon

- `definer-functions-anon-schema.sql`: `revoke execute on function public.transit_mark_empty_stores() from public, anon, authenticated`; `alter function public.report_excluded_stores() security invoker`. `report_cron_schedule()` остава DEFINER с EXECUTE за anon (admin.js, само дни/часове) — до етап 2. Кодът не е пипан. Rollback: grant execute на трите роли + `security definer`.
- Сверено преди (04.11): ACL на transit и report_excluded_stores — `{=X/postgres,postgres,anon,authenticated,service_role}` (с PUBLIC); на report_cron_schedule и checklist_portal_values — без PUBLIC. transit е volatile, вика я само pg_cron job 22 (`0 * * * *`, postgres; последните 3 пуска 08:00/09:00/10:00 UTC — succeeded, „1 row“). report_excluded_stores — stable, `search_path=public` вече е зададен; вика я checklist_portal_values (INVOKER) и SECURITY DEFINER функциите transit_mark_empty_stores, pallets_/stock_diff_/stock_returns_/supply_sync_completions. Никой .js / едж функция не вика transit; edge_logs 24 ч.: само `rpc/checklist_portal_values` (anon, седмици 45 и 46, 200), нито transit, нито report_cron_schedule.
- Граница: политиката на `app_settings` е само за роля anon — като INVOKER функцията, извикана като authenticated, връща NULL; порталът ползва само anon.
- Референтни стойности с anon ключа (04.11, преди миграцията): checklist_portal_values 2026/45 — 162 реда, md5 на отговора b39b491a…; 2026/46 — 162 реда, ab5e19a8…; report_cron_schedule — 5 реда, c9571d01…; report_excluded_stores — 5 обекта.
- Пробно прилагане в транзакция с rollback (като anon в същата транзакция): checklist_portal_values(2026,45) — md5 4046e5e2… и 162 реда преди и след; report_excluded_stores — еднакъв списък; report_cron_schedule — 5 реда; transit като anon → `42501 permission denied for function transit_mark_empty_stores`. След rollback ACL-ите и prosecdef — както преди.
- Тест: нов jsdom тест няма — промяната е само в базата.
- Огледалото: ред в `zhivko-opashka.md` НЕ се пише — функциите не влизат в огледалото.
- Миграция: още НЕ е приложена (след push). Версия: —.
- SHA е комитът, който добавя този файл.
