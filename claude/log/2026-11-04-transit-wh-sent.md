# 04.11 — transit-wh-sent

- Решение на Тенчо (04.11): ред от логистичен склад влиза при импорта направо като изпратен. `transit.js`: `transitIsWarehouseSupplier` (името от `TRANSIT_WAREHOUSE_CODES` през `PLANT_ALL`), `TRANSIT_IMPORT_SENDER_BY = 'импорт'`; в `transitImportBody` — само НОВ ред от склад: `sender_status 'sent'`, by „импорт“, at = imported_at. Съществуващ ред — sender_status* не се пращат. Трансферите — без промяна.
- Показване: „📤 Изпратена · импорт“ (значката на изпращача); Excel вече показва „· импорт“ през sender_status_by. Прегледът на импорта: „от склад — влизат като изпратени: N“ (`t-imp-wh`).
- Данни: `transit-wh-sent-data.sql` (проверка преди / UPDATE / проверка след, rollback в коментар) — заварените неархивирани редове от склад с sender_status NULL (1 224 към 04.11). Миграцията — след push-а. Схема няма → ред за Живко не трябва.
- Тест: `tests/transit-vd-import.test.js`, раздел з) (118 проверки); мутанти W1–W4 падат. transit.js — функции 79 → 80.
