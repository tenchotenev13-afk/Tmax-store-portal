# 16.11 — supply-rev-subtabs

- Решение на Тенчо 16.11: Снабдяване (supply, 15 активни, всички в ЦО) в „🔎 Ревизии и преоценка“ вижда САМО „🎨 Зареждане“.
- `shared.js` (`setupTabsForRole`): за supply главният таб отваря `showModule('supply')`; `rvs-schedule` получи видимост по `rsCanSeeSchedule()` (дотогава винаги видим), връща се и при смяна на потребителя без презареждане.
- `revisions.js`: `rsCanSeeSchedule()` = `rsCanSee()` без supply → „Нямаш достъп“. `rsCanSee()` НЕ е пипана (табът, `rvs-supply`, `linkedModuleAllowed('supply')`).
- `revaluation.js`: `rvCanSee()` и `rvIsCoViewer()` без supply; мъртвият клон за supply в `rvStoreOptions()` е махнат. Минуси — supply не ги виждаше и преди (`MN_CO_ROLES`). Бюлетин: `linkedModuleAllowed('revaluation')` за supply вече е false (по `rvCanSee`).
- Известия по Преоценка към supply няма: 0 supply в групата `revaluation`, нито един в `revaluation_approvers` / `revaluation_done_cc` (SQL 16.11).
- Тест `tests/supply-rev-subtabs.test.js` (66 проверки, реален клик по таба); мутанти M1/M2/M3 — 4 / 4 / 3 ❌. Обновени само supply проверките в `revaluation`, `revaluation-co`, `revaluation-history`, `revaluation-bugs-1910`. Пълен пакет: 480 теста, exit 0.
- Без схема — ред за Живко няма.
- Push 16.11 — `0417f4d` (main, върху `dae8608`; пълен пакет на този SHA: 482 теста, exit 0). Pages сверен: `shared.js`, `revisions.js`, `revaluation.js` байт в байт с `0417f4d` (маркер `rvSupplyOnly`: 2 на живо, 0 в `dae8608`).
- Rebase-ове преди push (origin мръдна 6 пъти; всеки път пълният пакет): `6f2abc8`+`263a5c9` (Чек лист), `e49c5ca`+`3b1588b` (Разлики), `b342a8a`, `d651b82`, `1b48878`+`41bf7d8` (bulletin-notify), `92bae2e`, `dae8608` (.sql). Един пуск — 4 ЗАБИ при 47 мин (Контакти, `co-row-click`; поединично exit 0 за 2–6 сек) → пуснат пак, зелен.
- Изключение от т.13 (решение на Тенчо 16.11, САМО за тази сесия): ако новите комити в origin пипат само файлове под `claude/` (без .js, tests/, `tests/run-all.js`, supabase/, index.html, *.sql), след rebase стигат smoke + `tests/handover-structure.test.js`, без пълния пакет; важи и между „давай“ и push (отказан push заради такъв комит → rebase + двата теста + push на новия SHA без ново питане, с изброени комити и файлове в отчета). При всяко друго пипане — пълният пакет. Не е използвано: единственият отказан push беше преди решението; след него `dae8608` носеше .sql.
- Не е проверено на живо с реален supply акаунт.
