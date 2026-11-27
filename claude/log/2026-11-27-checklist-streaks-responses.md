# 27.11 — checklist-streaks-responses

- Писмото на Чек листа (`submitChecklistSend`), решение на Тенчо 27.11 (Теодор: „да, може да ги добавим“). Неделният отчет, „Днес“ и табът — не са пипани.
- Повтарящи се пропуски в брой: `checklistIsCountGap` (едно правило за блока „Пропуски“ и поредицата), `checklistGapStreak` през общия обход `checklistWeekStreak` (с него вече и `checklistNoStreak`). В блока „Пропуски“ (обект, регионален, обща група): „· 2-ра поредна седмица“ … „· 8+ поредни седмици“, от 3-тата тъмночервен ред (`CHECKLIST_EMAIL_HOT`).
- Становища за седмица M — само до регионалните (своите обекти) и общата група (всички): `checklistEmailPrevResponsesHtml` вика `reportChecklistResponsesHtml` от report.js (не е копие). `checklistLoadEmailExtra`: 8 седмици история (беше 7), `sbGetOk` за становищата + нова заявка `weekly_checklist_sends` за M; провал → без блока.
- Тест: `tests/checklist-gap-streak.test.js` (27 проверки, истински клик по „Изпрати“); мутанти М1–М5 — и петте exit 1.
- Без схема → без миграция, без ред за Живко.
- SHA `eca5f35` (rebase върху `c24f26a`; пълен пакет върху `a5e3f0a` — 545 теста, exit 0; след него влезе само claude/log → smoke + тестовете на чек листа). Сверката на Pages — в отчета на сесията.
