# 25.10 — pilot-preocenka-minusi

- Пилот по обект за двата под-таба на „Ревизии и преоценка": Преоценка → Кърджали, Минуси → Гоце Делчев; admin / accounting / controlling (и supply за Преоценка) — без промяна.
- `revaluation.js`: `revaluation_stores` = 'on' (всички) / 'off' или празно (никой) / списък имена (`rvParseStoresFlag`, `rvStoreOn`). `rvCanSee` по обекта на потребителя; `rvCanEdit` и `rvCoCanUnlock` — по обекта на бланката; списъкът на ЦО при списък брои само включените (+ обекти с бланка); `loadRevaluation` изчаква флага.
- `minusi.js` + `shared.js`: `rvs-minusi` за обекта само ако е в `minus_stores` (`mnTabVisible`, `mnLoadStoresFlag` при вход); пазачът вътре остава.
- `bulletin.js`: LINKED_MODULES 'revaluation' / 'minusi', `linkedModuleAllowed` по същите правила; Бюлетин, нарисуван преди флага, се рисува пак след него (`bulPilotFlagsWait`). Без auto_complete.
- Тест: `tests/pilot-tabs.test.js` (83 проверки, 6 мутанта — всички падат); обновени `minusi.test.js` §6 и текстът в `revaluation-bugs-1910.test.js`. Без схема, без миграция, ред за Живко няма; `app_settings` не е пипан. SHA е комитът, който добавя този файл.
