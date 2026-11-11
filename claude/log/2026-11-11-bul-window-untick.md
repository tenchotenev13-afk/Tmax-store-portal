# 11.11 — bul-window-untick

- Бюлетин (повод „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА“, Търговище и Враца 09–10.11; решение на Тенчо 10.11): задача с прозорец — докато днес е между първия и последния ден, ОБЕКТЪТ може да махне своята отметка и да отметне наново (нов файл/коментар). След прозореца — заключена, както досега; автоматичните модули (`bulAutoModuleOf`), офисът и supply — без промяна.
- `winDoneAttr(comp, kind, t)` / `winDoneStyle` / `winUntickable` / `winUntickDates` / `bulWinUntickRejected` в bulletin.js; всичките 7 рендера („План за деня“ ×2, календар ×2, блок по отдел, панел на обекта, блок „Постоянни задачи“) подават вида и задачата. Отключеният чекбокс носи `data-wcdate` = completion_date на затварящия ред — `bulCheckboxChanged` / `bulRecurringCheckboxChanged` трият ПО НЕГО, не по днешния ден. Title: „Изпълнена на дд.мм — можете да я махнете до дд.мм, ако трябва да смените файла“.
- Файлът в Storage (`bulletin-files/task-completions/…`) не се трие — остава сирак (решение на Тенчо 11.11; подсказката остава в title). anon има DELETE върху цялата кофа `bulletin-files` (политика `bulletin_delete`) — сверено 11.11, само четене.
- Тест `tests/bul-window-untick.test.js` (59 проверки, 5/5 мутанта); обновени към новото правило: `recurring-due-window`, `task-window-view`, `rec-window-from-version`.
- Схема няма → rollback и ред за Живко няма. SHA е комитът, който добавя този файл.
