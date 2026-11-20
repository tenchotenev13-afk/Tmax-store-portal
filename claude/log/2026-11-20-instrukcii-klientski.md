# 20.11 — instrukcii-klientski

`tools/instrukcii.json`: четири нови реда за комплекта „Клиентски заявки“ — „Клиентски — обекти“ (`instrukcii/klientski-obekti.pdf`), „Клиентски — складове“ (`instrukcii/klientski-skladove.pdf`), „Клиентски — снабдяване“ (`instrukcii/klientski-snabdyavane.pdf`) и „Клиентски — пълна справка“ (`instrukcii/klientski-palna.pdf`), всички „Само за офиса“; табът „Клиентски“ е името от лентата (`index.html`). Без схема, без миграция → без ред за Живко.

- **Сухо на живо от worktree-а (база `2f0cc31`):** 17 в списъка · 0 без файл · 13 непроменени · 0 с грешка, exit 0; четирите нови — „няма обект, няма карта — би направил качване + INSERT на карта“ (420 / 317 / 384 / 931 KB). Отделно 3 извън списъка: `График-ТРЗ.pdf`, `График-инструкция.pdf`, `График-магазини.pdf` — в папката, не в списъка, не се качват.
- **Тест:** npm test — 514 теста, 28 622 проверки, exit 0 (вкл. `publish-instrukcii`, `docs-groups`, `handover-structure`); smoke exit 0.
- **Комит / push / `--go`:** чакат „давай“ от Тенчо.
