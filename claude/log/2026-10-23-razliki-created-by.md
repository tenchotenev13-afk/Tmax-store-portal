# 23.10 — razliki-created-by

- Само данните. Кодът (`submitSD` праща `created_by` само при нов ред) и тестът `tests/sd-created-by.test.js` са в dd5c570 на сесия sr-created-by, не тук.
- `stock-diff-created-by-fix.sql` — update `stock_differences.created_by = differences_reports.submitted_by` с гард по броя (точно 290) и готов rollback с 290-те стари стойности (генерирани машинно през PostgREST; md5 подпис feffcd3d… съвпада с базата).
- Приложено 23.10.2026 (execute_sql, DML). Преди: 290 разминавания (284 „Цветелина Тенева"), 0 без подател, 1721 реда, 0 без report_id. Гардът мина с точно 290 реда. След: 0 разминавания, 1721 реда, 0 реда с „Цветелина Тенева" като създател.
- Без схема, без ред за Живко (колоната съществува, огледалото изтегля новите стойности само). CLAUDE.md и `claude/open/closed/23-10-sd-created-by-overwrite.md` — обновени с поправката на данните.
