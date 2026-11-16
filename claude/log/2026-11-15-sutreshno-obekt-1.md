# 15.11 — sutreshno-obekt-1

- Нова тема `store_open_items` в `bulletin-notify` (бележка v19): делник 07:45 по ЕДНО писмо на обект до ролите manager / sklad / info на обекта (`soiRecipients`, не `resolveRecipients` — без kasa). Секции в `SOI_SECTIONS`: (А) просрочените задачи на обекта от `buildOverdueTasks`, (Б) клиентски заявки — закъснели (правилото на `reportIsLate` без `awaiting_stock`) и със срок до 2 работни дни, като заявител и като изпълнител. Матрицата (`store_open_items`, `store`) решава само дали праща имейл; override `exclude` се зачита. Неработен ден → skipped. Лог `<дата>|<обект>`. Без push. `{"as_of":"гггг-мм-дд"}` — само с dry_run, за сверка в почивен ден.
- Копие на `bgHolidaysForYear` / `isBgWorkday` / `reportWorkdaysBetween` от `send-scheduled-report`; третото копие е в `tests/co-overdue-report.test.js` т.7.
- admin.js: `NOTIF_IMPLEMENTED_TOPICS` + колона „Незавършено за обекта" в „Кой какво получава".
- Данни: `store-open-items-schema.sql` (тема `active=false`, `test_email`, матрица store/email). Без нова колона — ред за Живко няма.
- Тест: `tests/store-open-items.test.js` (нов, в `TESTS`), обновени `admin-who-gets`, `co-overdue-report`. Мутации М1–М4 — и четирите го събарят.
