# 24.11 — kasa-api-all

- `app_settings.kasa_api_stores` = `'all'` (беше „Кърджали, Раднево“) от 24.11.2026 10:01:44 София (08:01:44 UTC), MCP `execute_sql`, `updated_by` = „Code: kasa-api-all (24.11, решение на Тенчо)“. Без код и без схемна промяна → няма ред за Живко.
- Rollback: `update app_settings set value='Кърджали, Раднево', updated_at=now(), updated_by='rollback: kasa-api-all' where key='kasa_api_stores';`
- Обратно четене: PostgREST с anon ключа → 200 `value:"all"`; живият `shared.js` (= `a68ca89`) в jsdom срещу този отговор — 13/13 (`kasaApiOn()` = true за manager Троян, admin, accounting без и със assigned; контрол при пилотната стойност и без пропуск = false).
- Отворени точки: `19-11-kasa-api-pilot.md` (смяната, сутрешният пик от 18 обекта) и `19-11-kasa-mirror-role.md` (огледалото преди етап 2).
