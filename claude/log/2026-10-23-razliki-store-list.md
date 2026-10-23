# 23.10 — razliki-store-list

- Решение на Тенчо (А) по `claude/open/23-10-sd-store-list-service.md`: „Магазин" в „📝 Подай бланка" (`openDiffSubmitModal`) и „+ Добави ръчно" (`openSDModal`) — общият списък (празен assigned_stores) вече е `loadReportableStores()` (users минус `app_settings.report_excluded_stores`); „Сервиз Троян", складовете и ЦО не излизат.
- Нова `sdFillReportableStores(selId, current)` — една за двете форми; текуща стойност извън списъка (редакция, prefill) се добавя като опция, не се губи. Профил със собствен / разпределени обекти — без промяна (складът вижда своя). „Обект изпращач" при междускладов — без промяна, складовете остават.
- База 23.10: 0 бланки и 0 реда за изключените обекти. Без схема, без ред за Живко.
- Тест: `tests/storno-notes.test.js`, секция и (89 проверки); мутации S1–S5 падат. Затворено: `claude/open/closed/23-10-sd-store-list-service.md`. SHA е комитът, който добавя този файл.
