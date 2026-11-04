# 02.11 — anon-revoke-delete

- `anon-revoke-delete-schema.sql`: `revoke delete` от anon и authenticated на 45 таблици в public, от които браузърът не трие (вкл. 4-те `*_bak_*`); DELETE остава на 45 (`DELETE_ALLOWED`). Кодът на модулите не е пипан. Rollback: `grant delete` на същите 45.
- Инвентар: 60 извиквания на `sbDelete` в 18 файла (59 с литерал + `reference.js:refDeletePrompt` с променлива → `warranty_brands` / `warranty_subcategories`), 1 директен fetch DELETE към `/rest/v1/goods_transit` (`transit.js:confirmClearTransit`), 1 към Storage (`stock-differences.js:sdDeleteReport`, извън обхвата).
- Сверено: едж функциите трият само със service_role; pg_cron job 8 (`backup_snapshots`) — postgres; функциите в public с DELETE FROM са SECURITY DEFINER (само `task_completions`); FK каскадите към таблици без DELETE право минават — доказано с временни таблици в транзакция с rollback. edge_logs 24 ч: anon DELETE само от портала + 1 ръчен към `loading_lists` от конзолата. Сверка от чата за 27.10–02.11 (edge_logs): DELETE към 45-те таблици от revoke-списъка — само същото ръчно почистване на `loading_lists` от 02.11.
- Тест: `tests/delete-tables-whitelist.test.js`; 6 мутанта — съборени (вкл. директен fetch). `tests/handover-structure.test.js` — временна папка през `fs.mkdtempSync`, чисти се при изход.
- Огледалото: ред в `zhivko-opashka.md` НЕ се пише — правата (grant/revoke) не влизат в огледалото.
- Затворено: `01-11-users-create-after-5b` (проверено от Тенчо 02.11 11:37–11:40).
- Миграция: `anon_revoke_delete`, версия 20261103212604 (03.11, след push на df20bdd); приложеният SQL = 45-те реда от файла (MD5 6e43847433800d60d1ad05612534f13f). В базата: anon DELETE на точно 45 (= DELETE_ALLOWED), authenticated същото. curl с anon и id=eq.0000…: `kasa_reports` → 401 `42501 permission denied for table kasa_reports`; `bus_routes` → 204 `*/0`; бройките непроменени (3861 / 217).
- На живо 04.11 (Тенчо, сверено от чата): контакт „проверка 04.11“ — POST /contacts 201 в 07:57 UTC, изтрит през ✕ в Контакти, 0 реда в базата. Махане на отметка в Бюлетина от обект — непроверено (`claude/open/04-11-task-completions-delete-live.md`).
- SHA е комитът, който добавя този файл.
