# 22.10 — razliki-lipsa-priklyuchena

- Разлики, тип „Липса“: статус „🏁 Приключена“ (status='completed') вече важи и тук, не само за „Връщане“ (Цветелина, документ 20.10 т.4, отговор 21.10). Задава го само `canCompleteSR()` (Цвети/admin) от ✏️; ключалките (`sdCompletedLocked`, `sdStoreLockedMissing`) са без промяна.
- Нова `sdTypeHasCompleted(t)` (return/missing) — един източник за модала, `submitSD`, третия чип, филтъра „Взета“ и `setSDTypeFilter`. При Липса чиповете са „⏳ Невзета / ✅ Взета / 🏁 Приключени“ (`sdCounterWords('missing')` = думите на реда); „Взета“ вече не брои приключените.
- Без схема: стойността 'completed' съществува (29.09), CHECK на `stock_differences.status` няма; ред за Живко няма. В базата на 22.10: 0 реда missing/completed (112 pending, 21 taken).
- Правило 7: `stock_diff_store_done` (жива = репо), `report.js`/`send-scheduled-report` (кръстосаният брой), `bulletin.js` — гледат само `status <> 'received'`, не taken/completed → без промяна. `today.js`, `checklist.js` не четат статуса на Разлики.
- Тест: `tests/sd-lipsa-priklyuchena.test.js` (34 проверки, 6 мутации падат); `diff-return-completed.test.js` — проверките „Липса без опция“ сменени със „Заприхождаване“; `stock-diff-status-labels.test.js` — при Липса думите вече са „Невзета/Взета“, не неутралните. Пълен пакет: 366 теста, exit 0. SHA е комитът, който добавя този файл.
