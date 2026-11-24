# 24.11 — storage-index-readonly

- Изгледът `public.storage_files_index` е само за четене за anon и authenticated: revoke insert, update, delete, truncate, references, trigger. SELECT, собственикът (postgres) и липсата на `security_invoker` — непроменени (огледалото на Живко чете изгледа с anon).
- Схема: `storage-files-index-readonly-schema.sql` (rollback вътре, коментиран); миграция `storage_files_index_readonly`, версия **20261124125709**, приложена 24.11.
- В базата след нея: ACL `anon=rm/postgres`, `authenticated=rm/postgres`; `has_table_privilege` — SELECT true, останалите шест false и за двете роли. `count(*)` 9700 (преди 9680; = `storage.objects` за четирите bucket-а, 21 нови файла за последните 75 мин). curl с anon: GET 206 `0-0/9700`, PATCH 401/42501.
- Тест: `tests/storage-files-index-readonly.test.js` (12 проверки); мутации — махнат update / махнато authenticated / добавен select — и трите exit 1. Пълен пакет: 528 теста, exit 0.
- Ред за Живко: в `zhivko-opashka.md` („без промяна за огледалото“).
