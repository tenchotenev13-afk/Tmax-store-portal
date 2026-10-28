# 28.10 — checklist-zanulyavane-manual

- Решение на Тенчо 28.10: „таблица зануляване л.м.“ (`zanulyavane_lm`) е друг вид задача — Миглена я отмята ръчно; връзката с „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.“ (72aed3fc, от 23.10 — 24f6f2f, 20261023080810) е махната.
- Миграция `weekly_checklist_zanulyavane_manual` (само данни, `weekly-checklist-zanulyavane-manual-schema.sql`): метриката обратно на `source 'manual'`, `portal_mode` NULL, `sublabel` NULL; седмици 35–43 — `portal_value` = NULL по колоната (control_*, comment и редовете — непипнати). Ред за Живко няма.
- checklist.js: `zanulyavane_lm` махнат от `CHECKLIST_PORTAL_MODE` (документацията/еталонът от етап 2) + коментарът над него.
- Изчистени `portal_value` (прочетени 28.10 преди миграцията; rollback-ът не ги връща) — 72 реда, само седмици 40–43; 35–39 нямат редове по колоната; `control_value` — 0 реда:
  - 40: 18 × da (всички обекти);
  - 41: 18 × da (всички обекти);
  - 42: 11 × da, 7 × ne — ne: Габрово, Гоце Делчев, Кърджали, Петрич, Севлиево, Силистра, Търговище;
  - 43: 17 × da, 1 × ne — ne: Габрово.
- Становището „проверка 23.10“ (седмица 42, Кърджали, zanulyavane_lm) — не е трито.
- Миграция приложена 28.10, версия **20261028120335** (огледало `supabase/migrations/20261028120335_weekly_checklist_zanulyavane_manual.sql` + `_down.sql`). Проверено в базата след нея: метриката `manual` / NULL / NULL; `checklist_portal_values(2026, 44)` — 162 реда, 9 колони, `zanulyavane_lm` 0 (и за 43 — 0); 35–43 — 72 реда по колоната, всички без portal_value; `control_value` по колоната — 0 (като преди); portal_value на другите колони в 40–43 — 576, непипнати; становището от 23.10 — на място.
- Тестове: нов `tests/checklist-zanulyavane-manual.test.js` (21; мутации Z1–Z4 падат); `tests/checklist-portal-columns.test.js` — zanulyavane_lm без режим, празна дори при стария източник. SHA е комитът, който добавя този файл.
