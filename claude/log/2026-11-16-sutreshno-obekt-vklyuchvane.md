# 16.11 — sutreshno-obekt-vklyuchvane

- Включване на `store_open_items` за обектите (решение на Тенчо 16.11): миграция `20261116202940` (`store_open_items_enable`, файл `store-open-items-enable-data.sql`) — `active=true`, `test_email=null`; DO блок с проверка за точно 1 ред, rollback в същия файл.
- Преди: active=false, test_email ten.tenev@temax.bg, 07:45, {1,2,3,4,5}, матрица store/email/own_stores, 0 overrides, 0 реда в notification_log. След: active=true, test_email null.
- dry_run 16.11 след включването: 14 обекта / 31 получатели (15 manager, 14 sklad, 2 info, 0 kasa). Нищо не е пратено ръчно. Първо писмо — 17.11 в 07:45.
- Само данни — без код, без схема, ред за Живко няма.
