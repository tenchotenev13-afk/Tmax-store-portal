# 19.11 — kasa-api-opis

Етап 1а от „Каса — защита на данните“: опис и проект на `kasa-api`, БЕЗ промяна на код, база и едж функции. Документът: `claude/kasa-api-dizajn.md`. База: `origin/main` f6276ae; базата само четена през MCP (SELECT).

- Опис: 29 четения (R1–R29) и 23 записа/триения (W1–W23) в kasa.js, kasa-docs.js, history.js, daily-turnover.js, report.js, notifications.js — файл:ред, функция, филтри, роля, кога.
- База 19.11: седемте таблици 4 375 / 2 353 / 2 339 / 4 664 / 7 704 / 29 126 / 1 567 реда; bucket `kasa-docs` 4 515 файла, ~3.9 GB, пътят носи само дължината на името на обекта (кирилицата → `_`); 11 файла без ред, 1 ред без файл. `perform_daily_backup` не включва storno, storno_items, documents, daily_turnover.
- Находки (непоправени): в клиента няма PIN за История; admin тегли цялата `kasa_reports` при отваряне на Каса; банерът за сторно и оборотът на ЦО не гледат `assigned_stores`; `openKasaDetail` и `kasa_storno_items` по id — без проверка на обекта; anon ключът е вписан в два генерирани прозореца (печат, детайл).
- Проект: 6 действия за четене (`day`, `range`, `storno_items`, `banner`, `report_rows`, `doc_url`), обхват от `users` по `uid` от пропуска, 401 → модал за повторен вход без `startApp()`. 13 въпроса към Тенчо → `claude/open/19-11-kasa-api-opis.md`.
