# 12.11 — storno-banner-count

- Банерът при вход (notifications.js, `showLoginBanner`, admin/accounting) брои сторно бележките с по-малка сума през `stornoIndicator(...).flagged` от kasa.js вместо собственото `new_sum < returned_sum` — капаро/ваучер (900001/900009) вече не влизат. `articles` е добавено в select-а. kasa.js зарежда преди notifications.js (index.html поз. 10 срещу 25).
- Реални данни, последните 30 дни (от 13.10.2026): 2132 бележки; старо правило 52, ново 47 (5 капаро/ваучер) = числото в История.
- Правило 7: stornoIndicator ползват history.js (екран + Excel) и kasa.js (списък, жива сметка във формата, `notifyStornoDiscrepancy`). Сами сравняват, без изключението: report.js и send-scheduled-report („Сторна с по-малка нова сума", само седмичният) → `claude/open/12-11-storno-short-report-exempt.md`. Дневният отчет и today.js не броят това.
- Тест `tests/storno-banner-count.test.js` (8 проверки; мокът връща само колоните от select-а); 2 мутанта (старото сравнение; без articles в select-а) — хванати.
- Затворено `12-11-history-storno-filter-live` (проверено на живо от чата).
- Схема няма → rollback и ред за Живко няма. SHA е комитът, който добавя този файл.
