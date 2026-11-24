# 24.11 — preocenka-snimka-kamera

- Преоценка (`revaluation.js`): на реда два бутона вместо един — 📷 „Снимай“ → вход `#rv-photo-cam` с `capture="environment"`; 🖼 „От галерията“ → `#rv-photo-file` с `multiple`, без capture. И двата през `rvPhotoUpload` (компресия, `bulletin-files/revaluation/`, `photos` на реда). `rvPhotoPick(id, src)` — `src === 'cam'` избира камерата.
- Повод: проверката на живо на Тенчо 24.11 (Кърджали) — 📷 предлагаше само галерията.
- Правото (`rvCanPhoto`), миниатюрите, ✕ и цял екран — без промяна. Без схемна промяна → няма ред за Живко; rollback = revert.
- Тест: `tests/revaluation-units.test.js` секции 7–8 (62 проверки, реален клик по двата бутона, качване през всеки); 3 мутанта (без capture, разменени входове, без проверка за чернова) — убити.
- SHA: попълва се след push (отделен комит „Предавка“).
