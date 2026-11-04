# 04.11 — default-privileges-delete

- `default-privileges-delete-schema.sql`: `alter default privileges for role postgres in schema public revoke delete on tables from anon, authenticated` (решение А, Тенчо, 02.11). Само DELETE; TRUNCATE и SELECT/INSERT/UPDATE не се пипат; заварените таблици — също. Rollback: същото с `grant delete … to`.
- Сверено преди (04.11): 109 таблици/изгледи в public, всички owner postgres; `pg_default_acl` за public — два записа (postgres, supabase_admin), и двата `anon=arwdDxtm`; current_user на MCP = postgres, не е член на supabase_admin.
- `alter default privileges for role supabase_admin …` от postgres → `42501 permission denied to change default privileges` (транзакция с rollback). Граница: записът за supabase_admin остава — само за таблици, създадени от supabase_admin.
- Пробно прилагане в транзакция с rollback: нова таблица → `anon=arwDxtm` (без d), SELECT/INSERT/UPDATE true, service_role с DELETE; след rollback таблицата я няма, default-ът непроменен, anon DELETE пак на 45.
- Тест: нов jsdom тест няма — промяната е само в базата и не се вижда от кода. Съобщението на `delete-tables-whitelist` („добави grant delete в нова миграция“) вече е точно: без grant новата таблица няма DELETE.
- Огледалото: ред в `zhivko-opashka.md` НЕ се пише — правата не влизат в огледалото.
- Затворено: `04-11-task-completions-delete-live` (DELETE /task_completions 204, 04.11 06:08 UTC; 46 DELETE до 07:57 UTC, 0 отказа — edge_logs, чатът).
- Миграция: `default_privileges_delete`, версия 20261104084511 (04.11, след push на e901a74); приложеният SQL = файла. След нея: default за postgres/public — anon=arwDxtm, authenticated=arwDxtm (supabase_admin непроменен); проба с `zz_probe_default_acl` в транзакция с rollback — DELETE false за двете роли, SELECT/INSERT/UPDATE true, таблицата я няма след rollback; DELETE_ALLOWED с DELETE 45/45, общо anon DELETE 45. Пробен вход — пропуснат по решение на Тенчо (не засяга съществуващ път).
- SHA е комитът, който добавя този файл.
