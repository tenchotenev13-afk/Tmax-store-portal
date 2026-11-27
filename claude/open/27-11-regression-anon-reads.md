Отворено: 27.11 · Кой чака: Тенчо · Сесия: notify-tables-lock

**`tools/regression/fetch.js` чете с публичния ключ (anon)** — касовите
таблици след Каса етап 2 (26.11) и петте „кой какво получава“ след
`notify-tables-lock-schema.sql` връщат празно/401. Решение 10 от
`claude/kasa-api-dizajn.md` („`tools/regression` — отделна точка, не сега“),
важи и тук (Тенчо, 27.11). Препоръката оттам: service ключ от локална `.env`
(никога в репото) или ключът на mirror_reader. Засегнати в `fetch.js`:
`report_recipients`, `notification_topics`, `notification_matrix`,
`notification_overrides`, `notification_schedules` (редове 38–42) + касовите.
