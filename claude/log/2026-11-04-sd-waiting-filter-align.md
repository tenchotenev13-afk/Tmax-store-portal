# 04.11 — sd-waiting-filter-align

- Разлики: статус-филтърът „📝 Чакат моя отговор" (`sdMyWaitingLines` → `sdWaitingIds`) брои по `diffLineWaitsStore()` (shared.js) — като баджа (f454ffe), Бюлетина и чипа „Само чакащите мен". 'sent'/'sent_sap' (стока на път) вече не са във филтъра; остават в банера „🚚 … на път към вас" и маркировката в картата. Решение на Тенчо 04.11 — **отменя решението от 14–15.10** (claude/open/closed/15-10-diff-old-rule-two-places.md).
- `sdLineWaitsStore` е махната — нямаше друг потребител (stock-differences.js 264 → 263 функции; shared.js 126 → 126, само коментар).
- Пулсът на склада (`sdRefreshTabBadge`) тегли `id` на вложените редове — закъсняла размяна се засича и в 60-сек пулс. Обектът и Цвети/admin — заявки непроменени.
- Без схема, без миграция, без ред за Живко.
- Тест: `tests/sd-waiting-filter-align.test.js` (32 проверки, 3 мутации — всяка пада); обновени stock-diff-auto-complete и sd-badge-store-align. `npm test` — 425 теста, exit 0.
