# 05.11 — preocenka-shumen-gabrovo

- Само данни, код не е пипан. Без нова таблица / колона / статус → ред в `zhivko-opashka.md` не трябва.
- Изтрити трите тестови кампании за преоценка („Тестова преоценка Кърджали 10.2026“, „Тест Елица 10.2026“, „Тест за Елица 20–23.10.2026“): 8 реда `revaluation_items`, 3 `revaluation_submissions`, 3 `revaluation_campaigns`, в една транзакция с проверка на броя. В `revaluation_codes` към тях нямаше редове.
- Бекъп / rollback: `claude/log/2026-11-05-preocenka-test-backup.json` (пълните редове; сверен с базата преди триенето — `jsonb_populate_recordset … except` = 0 в трите таблици). Връщане: insert кампании → бланки → редове.
- Непокътнати: „Пожелателна преоценка 10.2026“ (Кърджали, processed, 11 реда, 11 кода), двете кампании за 11.2026.
- `app_settings.revaluation_stores`: `'Кърджали'` → `'Кърджали, Шумен, Габрово'` (`rvParseStoresFlag` реже интервалите). Rollback: `update app_settings set value = 'Кърджали' where key = 'revaluation_stores';`
- HIDDEN-FEATURES.md — записът обновен. Тест: пълният `npm test`.
