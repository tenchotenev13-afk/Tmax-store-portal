# 04.11 — sd-badge-store-align

- Разлики: баджът на таба за ОБЕКТ брои само реалния ход на обекта — междускладова бланка с ход по размяна или ред по `diffLineWaitsStore()` (shared.js, огледало на stock_diff_store_done) — същото правило като Бюлетина и чипа „Само чакащите мен". 'sent'/'sent_sap' (стока на път) вече не се броят. Повод: Управител Шумен — бадж 1 при „Само чакащите мен (0)".
- `sdRefreshTabBadge`: за обекта select-ът носи `direction`, а вложените редове — `id,difference_category` (пулс = рендер). Складът и Цвети/admin — заявки и числа непроменени.
- Без схема, без миграция, без ред за Живко. Функции: stock-differences.js 264 → 264, shared.js 126 → 126 (в shared.js — само коментарът на `diffLineWaitsStore`).
- Тест: `tests/sd-badge-store-align.test.js` (29 проверки, 4 мутации — всяка пада); обновени старите очаквания в stock-differences / sd-notify / sd-sent-sap. `npm test` — 423 теста, exit 0.
