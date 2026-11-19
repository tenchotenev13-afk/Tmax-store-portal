Отворено: 19.11 · Кой чака: Тенчо · Сесия: transit-nahodki

„Засечката е отговор" (решение 18.11) — места извън transit.js, сверени на
19.11 (правило 7):

- Тригерът за Бюлетина (`transit_store_done_since`, вика се от
  `transit_sync_completions` през `goods_transit_sync_trg` и
  `bulletin_tasks_transit_sync_trg`) — ГЛЕДА `recon_at` (засечката = обработен).
- `bulletin.js` (~1394, броят чакащи в задачата) — гледа (`recon_at=is.null`).
- `checklist.js` (~947) и `checklist_portal_values()` — гледат.
- `transit_mark_empty_stores()` — не гледа, но брои дали обектът ИМА редове,
  не дали чакат — засечката е без значение.
- `bulletin-notify`, `send-routed-report` — не четат `goods_transit`.
- **`report.js` (~1943, таб „Днес" и седмичното писмо) и копието в
  `send-scheduled-report` (~3001)** — НЕ гледат `recon_at` (нито
  `reviewed_at`): „Стока на път" там са застоялите неприети редове
  (`status in (pending,sent)`), тоест ред със засечка и „✕ Недоставена" се
  броят като „на път". Това е друго понятие („не е пристигнала"), не „чака
  отговор" — не е пипано. Ако Тенчо реши засечката да излиза и оттам —
  промяна в report.js + едж функцията заедно (`tests/report-edge-sync.test.js`),
  отделна сесия.
