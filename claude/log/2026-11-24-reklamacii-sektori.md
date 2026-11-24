# 24.11 — reklamacii-sektori

- Рекламации → Гаранционен справочник: ред „Гаранционни карти по сектори:“ под заглавието — 8 бутона (`REF_SECTORS` в `reference.js`), клик показва бланките на сектора, втори клик затваря; сектор без бланка — сив `<button>` „няма бланка“. Общото меню „🖨 Гаранционна карта ▾“ не е пипано.
- „⚙️ Управление на записи“: меню „Сектор“ на всяка бланка → PATCH `warranty_templates.sector`; грешка → червен toast, изборът се връща.
- Миграция `warranty_templates_sector`, версия 20261124110821 (`warranty-templates-sector-schema.sql`): `sector text` nullable. Сверено в SQL и през PostgREST с anon ключа (HTTP 200).
- Данни (24.11 13:09 София, `execute_sql`): Машини — hobby, tayfun, mehanik; Баня — smesiteli, monoblok; 7 NULL. Стойностите в базата = `REF_SECTORS` байт по байт (UTF-8 hex). Rollback: `update warranty_templates set sector = null;`
- Тест: `tests/reference-sectors.test.js` (60 проверки; 4 мутанта — всичките exit 1). Ред за Живко — в `zhivko-opashka.md`.
- SHA `65777c6` (push 24.11 14:40, по SHA, след rebase върху `f641a20` и пълен пакет: 528 теста, exit 0). Живият Pages сверен в 14:40:49: `reference.js` байт по байт = HEAD (маркер `REF_SECTORS` — 0 в старата версия, 5 в новата).
- Не е видяно на живо в браузър с реален вход (обект / офис) — за Тенчо.
