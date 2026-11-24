# 24.11 — reklamacii-garancii

- Рекламации → Гаранционен справочник, етап 1 от предложенията на Теодор (20.11.2026): бутонът „🖨 Гаранционна карта ▾“ е горе до заглавието и се вижда без избрана марка (`refTemplatePickerHtml()` в `reference.js`); от картата на марката е махнат — един бутон, едно меню `#ref-tpl-menu`.
- Нова бланка `warranty-templates/vrati.pdf` („Метални входни врати“, 2 стр.); добавена и в резервния списък.
- Тест: `tests/reference-template-picker.test.js` (44 проверки; срещу старата версия — 10 ❌).
- Без схемна промяна → няма ред за Живко. Редът в `warranty_templates` (vrati.pdf, sort_order 12) се вписва САМО след като файлът е на живия Pages — иначе менюто дава линк към 404.
- SHA `2f4bd85` (push 24.11, origin не беше мръднал). Живият Pages сверен в 10:38:31: `reference.js` и `vrati.pdf` байт по байт = HEAD; адресът от менюто → 200 application/pdf, 750 222 байта.
- Insert в `warranty_templates` (24.11 10:40:29 София, MCP `execute_sql`, решение на Тенчо): `('vrati.pdf', 'Метални входни врати', 12)`, id `6ac99447-314e-4d12-b8f1-efeb736be9f3`. Обратно четене: SQL — 12 реда, vrati.pdf последен; PostgREST с anon ключа → HTTP 200, същите 12. Rollback: `delete from warranty_templates where filename = 'vrati.pdf';`
- Етап 2 (бутони по сектори) — `claude/open/24-11-reklamacii-sektori.md`.
