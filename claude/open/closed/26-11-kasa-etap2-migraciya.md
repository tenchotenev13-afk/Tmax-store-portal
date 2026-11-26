Отворено: 26.11 · Кой чака: Тенчо · Сесия: kasa-etap2
Затворено: 26.11 · Как: миграция kasa_etap2_revoke_reads, версия 20261126211702, приложена 26.11 в 23:17 София (час преди нея — нула anon четения на седемте таблици); проверките в транзакция, HTTP с anon и mirror_reader — минаха (подробно в kasa-etap2-schema.sql); ред за Живко в zhivko-opashka.md. Първото реално ползване — claude/open/26-11-kasa-etap2-parvo-polzvane.md.

**Каса, етап 2 — миграцията `kasa-etap2-schema.sql` (kasa_etap2_revoke_reads).** Кодът (kasa.js: stornoSaveItems / deleteStornoEntry през kasa-api; kasa-docs.js: `x-upsert: false`) и kasa-api с `storno_items_save` / `storno_delete` трябва да са НА ЖИВО преди нея (Pages сверен по маркер, kasa-api — обратно четене). Миграцията — с отделно „давай“, рано сутрин (преди 7:30); Тенчо казва на обектите да презаредят портала (застояли табове от преди 24.11 четат по стария път — Пирдоп 24–25.11, Козлодуй 24.11, телефони Габрово / Кърджали).

Точно преди миграцията: edge_logs за anon четения (GET) на седемте таблици и `TemaxMirrorSync` с anon — очаквано 0.

След миграцията (в транзакция, `set local role anon`): select на колона със сума → 42501; select id → минава; PATCH по id → минава (rollback); като mirror_reader — броевете на седемте = като postgres. HTTP с anon ключа: `GET kasa_reports?select=id` → 200; `?select=*` → 401/403; подписване/сваляне от kasa-docs → отказ. После първото реално качване на документ и първото реално изтриване на сторно — по function_edge_logs / storage логовете.

След миграцията — ред в `zhivko-opashka.md` („Чака изпращане“): „касовите таблици и kasa-docs вече не се четат с публичния ключ — само с mirror_reader; моля пусни повторната проба“; затваряне на тази точка.

**Внимание за rollback:** след миграцията връщане на `app_settings.kasa_api_stores` към стар списък (или изтриване на ключа) НЕ е rollback — старият път няма права и ще връща само грешки. Rollback е единствено schema rollback-ът в `kasa-etap2-schema.sql`.
