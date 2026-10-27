Отворено: 26.10 · Кой чака: Code · Сесия: checklist-live-calc-1
Затворено: 26.10 · Как: етап 2 в базата (миграции 20261026210148 + 20261026210223) и в checklist.js, сесия checklist-live-calc-2; етап 3 → claude/open/26-10-checklist-live-calc-etap3.md

Чек лист — „стойностите се смятат при четене", етапи 2 и 3 (решение на Тенчо
26.10). Етап 1 е в базата: `checklist_portal_values(p_year, p_week)` и
`weekly_checklist_metrics.portal_mode`, сверени с checklist.js за 40–43
(0 разлики, `tools/checklist-parity.js`).

Етап 2: табът „Чек лист" чете стойностите от функцията вместо да пише
portal_value при отваряне (checklistFillPortalValues /
checklistRecurringChanges / checklistModuleChanges, CHECKLIST_PORTAL_MODE →
portal_mode от базата). Етап 3: неделният отчет (report.js +
send-scheduled-report) и писмото до обектите четат от нея.

За решаване преди етап 2:
* „Стока на път" и „Стока за връщане" и в JS, и във функцията са снимка на
  цялата таблица към момента — за минала седмица дават днешното състояние.
  Остава ли така, или седмицата трябва да има своя снимка.
* При липсващ ключ report_excluded_stores функцията не връща нищо, а JS пада
  към вградения списък — днес ключът го има.
* Преди етап 2: пак `node tools/checklist-parity.js` за последните седмици.
