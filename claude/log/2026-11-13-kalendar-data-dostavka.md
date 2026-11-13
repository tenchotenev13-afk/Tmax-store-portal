# 13.11 — kalendar-data-dostavka

- Календар (`calendar.js`): транспортната заявка излиза в деня на доставката (`delivery`), а без нея — в деня на заявката (`date`), `calTrDay()`. Към базата отива една заявка с `or=(and(delivery в седмицата),and(delivery is null, date в седмицата))&status=neq.refused` — без дублиране, отказаните не се показват (като клиентските). `calFindConflictIds` получава редовете на колоната, тоест вече е по същия ден.
- Конфликт (`transport.js`, `checkTransportConflict`): при подадено `delivery` сравнява с `delivery = деня` ИЛИ (`delivery is null` и `date = деня`); без `delivery` — както преди, по `date`. Изключенията done/refused/postponed остават. Нов 5-и аргумент `delivery`, единственото извикване (`submitTransport`) го подава.
- Тест `tests/calendar-delivery-day.test.js` (24 проверки, мини-PostgREST за заявките, реален клик „✓ Подай заявката“). Старият код — 16 ❌; мутациите „календар по date“, „конфликт по date“, „отказаните видими“ — 7 / 5 / 3 ❌.
- Без схема — ред за Живко няма. Непроверено на живо.
