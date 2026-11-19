# 19.11 — oborot-no-history

Каса → „Вечерен оборот": обектът вече НЕ вижда минали дни (решение на Теодор 19.11). `dtStoreView()` = само `dtTaskWarnBand()` + `dtTodayBlock()`; таблицата „Последните 7 дни" (`#dt-last7`, `dtLast7Block()`) е махната заедно с функцията — ползваше я само `dtStoreView()` (функции в `daily-turnover.js`: 46 → 45). Четенето на 30 дни в `loadOborot()` остава — от него е `dtAvg30()` за „необичайно високо". Изгледът на ЦО (`dtCOView`) — без промяна.

**SHA `3dab4e1`** (push по SHA 19.11 върху b7f7043, след rebase на 034c6dd; `npm test` exit 0 — 28214 проверки, 508 теста). Pages сверен: живият `daily-turnover.js` = `git cat-file blob 3dab4e1:daily-turnover.js` (cmp 0), маркер „Теодор, 19.11.2026" (0 в d31190d), `dtLast7Block` — 0. Без схема, без едж функции, без ред за Живко.

- Тестове: `tests/daily-turnover.test.js` — трите проверки за `#dt-last7` обърнати (таблицата я няма, сумите от минали дни не се виждат); нов `tests/oborot-no-history.test.js` (manager и kasa, форма и „записан", предупреждение 5×, ЦО admin/accounting вкл. минал ден през избора на дата). Стъбът уважава `date=eq./gte.`.
- Мутанти (всички exit 1): M1 `dtLast7Block()` върнат; M2 четене само за днес → confirm не се вика; M3 таблицата скрита с `display:none`.
