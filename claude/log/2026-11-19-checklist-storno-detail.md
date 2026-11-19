# 19.11 — checklist-storno-detail

Чек лист, „Сторна по грешни приеми" (Цветелина, писмо 07.11): ▾ до стойността разгъва какво е сторнирано за седмицата и обекта — по бланка дата на подаване (дд.мм) и № поръчка, после редовете (SAP код, наименование, количество). Само четене; ▾ само при показана стойност, различна от празно и „0/0"; за офис и за обект (същите хора, които виждат клетката).

**SHA `2600c1c`** (push по SHA 19.11 върху f6276ae; `npm test` TEST_JOBS=4 exit 0 — 28268 проверки, 509 теста; два предишни зелени кръга — c36f95f и 6069460 — останаха без push, защото origin мръдна). Pages сверен: живият `checklist.js` = `git cat-file blob 2600c1c:checklist.js` (cmp 0), маркер `function checklistWrToggleClick` (0 във f6276ae).

- `checklist.js`: `checklistWrongReceiptRows()` тегли още `created_at` на бланката и `order_number, material_code, material_name, quantity` на редовете (стойността „N/M" е същата — `lines` = броят редове); нови `checklistLoadWrDetails` (веднъж при отваряне, паралелно с `checklist_portal_values()`, никога не отхвърля; провал → `checklistWrDetails = null` → без ▾), `checklistWrToggleHtml`, `checklistWrDetailsHtml` (всичко през `esc()`), `checklistWrToggleClick` (stopPropagation — не стига до редакцията на клетката). Функции 99 → 103, колизии — няма.
- Стойността и записът ѝ не са пипани: в таба идва от `checklist_portal_values()` / `weekly_checklist`; подробностите — само в паметта.
- Правило 7: писмото (`checklistEmailHtml`), неделният отчет (`report.js`, `send-scheduled-report`) и „Днес" — БЕЗ промяна по решение на Тенчо (само в портала).
- Без схема → без rollback и без ред за Живко; без едж функции.
- `tests/checklist-wrong-receipt.test.js`: „редовете се теглят само за 2 id" брои вече само GET-овете от изчислението; нова проверка — отварянето тегли редовете точно веднъж (за ▾). Хванато от пълния пакет.
- Тест: `tests/checklist-storno-detail.test.js` (53 проверки; мутанти: без esc, без „0/0", ▾ винаги, само първи ред, lines+1, без stopPropagation — всички exit 1). Проверка на живо — `claude/open/19-11-checklist-storno-detail-live.md`.
