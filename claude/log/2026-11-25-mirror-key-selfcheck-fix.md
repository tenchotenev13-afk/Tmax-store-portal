# 25.11 — mirror-key-selfcheck-fix

- Първото пускане на `make-mirror-key.js` от Тенчо (25.11): а), б), в) и POST от г) — OK; два FAIL, и двата грешка в самопроверката, не в правата (сверено в базата: `has_table_privilege('mirror_reader','public.kasa_reports','UPDATE')` = false; политиката на ролята в `storage.objects` е само `bucket_id = 'kasa-docs'`).
- г) PATCH `kasa_reports` → 204: тялото беше `'{}'`, а при празно тяло PostgREST не пуска UPDATE и връща 204 без проверка на правата. Сега тялото е `{"status":"mirror-check"}` (колоната сверена в `information_schema`; редове с `created_at < 1900` — 0, тоест нищо не се пише). Очаква се 401/403.
- д) сваляне от `docs` → 200: `docs` е `public=true` (като bulletin-files, contacts, Pictures; само kasa-docs е private) — сваля се от всеки и без ключ. Сега д) е Storage list (`POST /storage/v1/object/list/docs`, prefix ''): OK при 200 и 0 обекта или при 4xx; FAIL при >0 обекта, 200 без масив, 5xx.
- Тест `tests/mirror-reader-key.test.js` — 80 проверки (бяха 64). Мутации 5/5 съборени: върнато `'{}'`, приет 204, д) обратно към сваляне, приет списък с обекти, приет 5xx. Чист код — exit 0.
- Схема — няма промяна; правата в базата не са пипани. Ред за Живко — няма.
