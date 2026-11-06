# 06.11 — preocenka-dovarshvane

- Без схема → ред в `zhivko-opashka.md` не трябва. Данни в базата не са пипани.
- (1) revaluation.js `rvCoAcceptAll`: след записа — `rvLoadCat` за записаните `new_sap_code`, после `rvRender` (както `rvCoEdit`). Знакът „в SAP“ / „за създаване“ излиза без повторно отваряне; паднал каталог → без знак.
- (2) Мерни единици: admin.js `CATALOG_UNIT_MAP` + ККТ, БЛИ, КГ, КУТ, ТОП, РОЛ, ТОН, M3 → `ккт`, `бли`, `кг`, `кут`, `топ`, `рол`, `тон`, `m3` (същите стойности като в `product_catalog.default_unit`; `rvSapUnit` ги приема). shared.js `unitOptionsHtml` — същите 8 в менюто (решение на Тенчо 06.11: навсякъде — каталог, Транспорт / Клиентски, Разлики); дотогава попълването от каталога оставяше „Бр.“.
- (3) Затворени: 15-10-revaluation-stores-enable, 15-10-revaluation-3a-live, 15-10-revaluation-import-returned, 18-10-controlling-group-revaluation (Елица — controlling, `notify_groups = ['revaluation']`, сверено в базата). Нова: 06-11-catalog-unit-garbage (111 реда с текст вместо МЕ).
- `tests/loading-diff-prefill.test.js`: снимката на модала за Разлики обновена 6247 → 6499 (`b06d658c…`) — единствената разлика е блокът с 8-те нови опции (252 знака, веднъж), без него HTML-ът е байт по байт старата `51ced347…`, проверено машинно.
- Тест: нов `tests/preocenka-dovarshvane.test.js` (17) — истински клик на „✔ Приеми предложените за всички“; 14-те SAP единици през normalizeCatalogUnit → rvSapUnit; ред на заявка избира „ккт“. Мутанти M1 (без rvLoadCat) и M2 (менюто без 8-те) падат.
