# 16.11 — supply-rev-subtabs

- Решение на Тенчо 16.11: Снабдяване (supply, 15 активни, всички в ЦО) в „🔎 Ревизии и преоценка“ вижда САМО „🎨 Зареждане“.
- `shared.js` (`setupTabsForRole`): за supply главният таб отваря `showModule('supply')`; `rvs-schedule` получи видимост по `rsCanSeeSchedule()` (дотогава винаги видим), връща се и при смяна на потребителя без презареждане.
- `revisions.js`: `rsCanSeeSchedule()` = `rsCanSee()` без supply → „Нямаш достъп“. `rsCanSee()` НЕ е пипана (табът, `rvs-supply`, `linkedModuleAllowed('supply')`).
- `revaluation.js`: `rvCanSee()` и `rvIsCoViewer()` без supply; мъртвият клон за supply в `rvStoreOptions()` е махнат. Минуси — supply не ги виждаше и преди (`MN_CO_ROLES`). Бюлетин: `linkedModuleAllowed('revaluation')` за supply вече е false (по `rvCanSee`).
- Известия по Преоценка към supply няма: 0 supply в групата `revaluation`, нито един в `revaluation_approvers` / `revaluation_done_cc` (SQL 16.11).
- Тест `tests/supply-rev-subtabs.test.js` (66 проверки, реален клик по таба); мутанти M1/M2/M3 — 4 / 4 / 3 ❌. Обновени само supply проверките в `revaluation`, `revaluation-co`, `revaluation-history`, `revaluation-bugs-1910`. Пълен пакет: 480 теста, exit 0.
- Без схема — ред за Живко няма.
