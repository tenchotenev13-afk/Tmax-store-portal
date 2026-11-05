# 05.11 — transit-fixes

- Поправки в „Стока на път“, намерени при инструкцията за магазини и склад. Без схема → ред за Живко не трябва.
- (1) Колона „Статус“: значките на получателя, изпращача и засечката се пренасят (`TRANSIT_BADGE_WRAP`: inline-block, max-width 100%, white-space normal) — с nowrap излизаха под „Действия“ при 1280 / 1600 px.
- (2) „✏️ Редакция“: пълна форма само за офиса (admin, accounting); обект и склад — „✏️ Коментар към реда“ (`transitModalCommentOnly`, останалите полета disabled, бележка), `submitTransit` праща само `{comment, updated_by, updated_at}` (кой и кога); нов ред от тях — отказ.
- (3) Формата: „🏭 От склад“ / „🏬 От магазин“ / „Друго (outgoing)“ (стойностите същите), статусите от `T_STATUS`, подсказка „напр. дойде непълно, чакаме второ пале“.
- (4) Импорт / „+ Добави ред“ / „✕“ — само офисът: `canAddTransit` без logistics; защита и в `tDelete`, `openTransitAdd`, `confirmTransitImport`; „📊 Експорт Excel“ — `canExportTransit` (с logistics). transit.js — функции 79 → 81.
- Тест: нов `tests/transit-fixes.test.js` (57), мутанти F1–F5 и F2б (без кой и кога) падат; `transit-auto-complete` A6 — офис вместо управител.
