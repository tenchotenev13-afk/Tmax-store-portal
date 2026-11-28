# 28.11 — razliki-sklad-prava

- Разлики: логистичният склад (isLogisticsWarehouseUser) вече не минава като офиса — canAddSD / canSubmitDiff / canReviewDiff / canEditSD връщат false за него; ✕ (sdDelete) и модалът на Контролинга (sdModalHtml) не се рисуват; ключалки в openSDModal, submitSD, sdDelete, sdToggleCreditNote, openDiffSubmitModal, submitDiffReport (resolveDiffLine, openSDMoveModal / submitSDMove, sdAddMissingReturn — през canReviewDiff).
- Странично: за склада изчезват и „↩️ Добави в За връщане“ и „✅ Върната / Изписана“ (sdMarkTaken, под canEditSD) — в базата складовете имат 0 реда 'taken'; решение на Тенчо 28.11 — остават скрити.
- Тест: нов `tests/razliki-sklad-prava.test.js` (мутации 9/9); `sd-compact-table.expected.json` — сменени само ключовете warehouse/* (свеж --dump); `storno-notes.test.js` — блокът „складът подава бланка със собствения си обект“ обърнат към „без 📝 Подай бланка“.
- Без промяна по базата. SHA: виж git log.
- Отворено: `28-11-razliki-sklad-prava-live.md`.
