Отворено: 26.11 · Кой чака: Code · Сесия: kasa-etap2

**Каса, етап 3 — записите през kasa-api** (проект: `claude/kasa-api-dizajn.md` т.3.3). След етап 2 браузърът още пише в касовите таблици с публичния ключ (INSERT/UPDATE и колонен SELECT по филтрите — `kasa-etap2-schema.sql`). Остава:

1. Записите W1–W13, W17–W23 през kasa-api (`report_save` / `_confirm` / `_unlock`, `glavna_*`, `zoborot_*` — вкл. суровия fetch в `confirmZoborot` и `kasaUpsert`, `day_mark_ready`, `day_return`, `storno_save`, `storno_return`, `storno_resubmit`, `doc_upload_url` + `doc_register`, `oborot_save`, `oborot_edit`).
2. **`storno_save` в една транзакция** (бележка + артикули) — днес `storno_items_save` е две стъпки (изтриване, после запис), както беше stornoSaveItems; паднал запис след изтриването → 500 `items_not_saved` и бележката е без артикули, докато не се запази пак (решение на чата 26.11).
3. Махане на резервните пътища за четене зад гейта (`tests/no-anon-kasa-reads.test.js` ги брои: 46 + 4 подписвания на файл) — след миграцията на етап 2 те могат само да върнат грешка.
4. Миграция: revoke на колонния SELECT и на INSERT/UPDATE за anon/authenticated от седемте; `kasa_docs_upload` (INSERT в kasa-docs) — след `doc_upload_url`. Решение и за MAINTAIN (остава за anon/authenticated на пет от таблиците — не е в решението от 26.11).
5. Уникален индекс за `kasa_reports` (обект + дата + ПОС) — днес няма; проверката за дубликат е само в браузъра (R4).

**Внимание за rollback (26.11):** след миграцията на етап 2 връщане на `app_settings.kasa_api_stores` към стар списък (или изтриване на ключа) НЕ е rollback — старият път няма права и ще връща само грешки. Rollback е единствено schema rollback-ът в `kasa-etap2-schema.sql`.
