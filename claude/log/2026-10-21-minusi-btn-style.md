# 21.10 — minusi-btn-style

- Минуси: „Запази“ (`btn btn-sm btn-primary`) и „📤 Качи файл“ (`btn btn-primary`) не изглеждаха като бутони — правило за `.btn-primary` няма никъде, а `.btn` (index.html:231, `border:none`) идва след `.btn-sm` (index.html:66) и маха рамката. На живо (sklad.gdelchev@, 02397a7) „Запази“ беше сив текст без фон и рамка.
- `minusi.js`: двата са `btn btn-green` — стандартният бутон за действие в портала. index.html и общият CSS не са пипани.
- Тест: `tests/minusi.test.js`, секция 3в (класовете на „Запази“ и на label-а „📤 Качи файл“); мутации M10–M11 падат. Без схема — ред за Живко няма.
- Затворено: `21-10-minusi-save-visible-live` (мерене на живо от чата — „Запази“ в рамките на картата при 1280 и 1366 px).
- SHA — комитът, който добавя този файл (`git log -- claude/log/2026-10-21-minusi-btn-style.md`).
