# 20.11 — instrukcii-transport

`tools/instrukcii.json`: два нови реда за комплекта „Транспорт“ (Заявки + Календар) — „Транспорт — Заявки — обекти“ (`instrukcii/transport-obekti.pdf`) и „Транспорт — Заявки — пълна справка“ (`instrukcii/transport-palna.pdf`), и двата „Само за офиса“. Без схема, без миграция → без ред за Живко.

- **Сухо на живо от worktree-а (база `af5a3a1`, с d347dc8):** 13 в списъка · 0 без файл · 11 непроменени · 0 с грешка · 0 извън списъка, exit 0; двата нови — „няма обект, няма карта — би направил качване + INSERT на карта“ (526 KB и 682 KB).
- **Тест:** npm test — 512 теста, 28 445 проверки, exit 0 (вкл. `publish-instrukcii`, `docs-groups`, `handover-structure`); smoke exit 0.
- **Затворено:** `claude/open/closed/13-11-instrukcia-transport-snimki.md` (снимките след 53fd868 — сверено от чата 20.11).
- **Комит:** SHA — в следващия комит на предавката. Pages не е засегнат — `tools/` и `claude/` не се зареждат от портала.
- **Остава:** push, после `npm run instrukcii -- --go` (първо качване на двата PDF + INSERT на картите) и преглед на живо в 📂 Транспорт → 📁 Заявки.
