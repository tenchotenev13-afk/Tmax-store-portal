# 24.11 — preocenka-snimka-kamera

- Преоценка (`revaluation.js`): на реда два бутона вместо един — 📷 „Снимай“ → вход `#rv-photo-cam` с `capture="environment"`; 🖼 „От галерията“ → `#rv-photo-file` с `multiple`, без capture. И двата през `rvPhotoUpload` (компресия, `bulletin-files/revaluation/`, `photos` на реда). `rvPhotoPick(id, src)` — `src === 'cam'` избира камерата.
- Повод: проверката на живо на Тенчо 24.11 (Кърджали) — 📷 предлагаше само галерията.
- Правото (`rvCanPhoto`), миниатюрите, ✕ и цял екран — без промяна. Без схемна промяна → няма ред за Живко; rollback = revert.
- Тест: `tests/revaluation-units.test.js` секции 7–8 (62 проверки, реален клик по двата бутона, качване през всеки); 3 мутанта (без capture, разменени входове, без проверка за чернова) — убити.
- SHA: `9eefea0` (push 24.11, Pages сверен байт в байт за revaluation.js; маркер `rv-photo-cam` — 0 в старата версия, 3 в живата).
- Push по вариант А — решение на Тенчо 24.11. Пълният пакет мина два пъти (527 теста, exit 0; последно на `b6678a9` върху `005c16d`). Между `005c16d` и базата на push-а (`d04dc48`) влязоха `5ae54dc`, `91153b4`, `d04dc48` (График, етап Б: `grafik.js`, `grafik-api`, миграция `20261124103940`, `tests/grafik-ui.test.js`, `zhivko-opashka.md`, .md) — без revaluation.js / loading.js / shared.js / stock-differences.js / index.html (`git diff --name-only` точно преди push-а). След rebase: node --check, smoke, id-collisions, 12-те теста на Преоценка, grafik-engine, grafik-ui, handover-structure — 15/15 exit 0.
