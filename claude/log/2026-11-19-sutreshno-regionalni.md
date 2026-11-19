# 19.11 — sutreshno-regionalni

- `bulletin-notify` (бележка v25, не деплойната): нова тема `store_open_items_regional` „Незавършено за вашите обекти" — едно писмо на регионален, част на обект по азбучен ред със същото съдържание като писмото на обекта (`soiPartsFor` → `soiStoreBody`); обект без редове — пропуснат; нищо → без писмо; лог `<дата>|regional|<имейл>`, dry_run (с `as_of`), recipients_only, test_email. Получатели: `is_regional` + `assigned_stores` (без notify_groups) + `app_settings.soi_regional_extra`; същият имейл → обектите се сливат; exclude се зачита.
- Пращането на двете теми е изнесено в `soiSendAll` (едно писмо на получател, повторен опит при таван, last_run_at не се записва при неуспешни) — store_open_items: същият резултат (тестът 136/136, локален dry_run 17 обекта / 37 адреса = живата версия 39).
- `admin.js`: темата в `NOTIF_IMPLEMENTED_TOPICS` и колона „Незавършено — регионални" в `WHO_COLS`.
- Данни (не приложени): `store-open-items-regional-data.sql`, `store-open-items-regional-enable-data.sql`. Без схема — ред за Живко няма.
- Тест `tests/store-open-items-regional.test.js` (41) + `admin-who-gets` (нова колона); мутации Р1–Р7 и М17/М19/М22 върху `soiSendAll` — всички събарят теста си.
- Инвентар (решение В на Тенчо): `assignedStores()` не изключва admin — акаунтът на Тенчо не се пипа.
