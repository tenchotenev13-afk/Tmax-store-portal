# 19.11 — kasa-api-etap1b

Етап 1б (част 1 от 3): едж функцията `kasa-api` — само ЧЕТЕНЕ, по проекта `claude/kasa-api-dizajn.md`. **Не е деплойната**, порталът не я вика; база, GRANT, политики и `app_settings` — непипнати. Без схемна промяна (огледалото — без ред в опашката).

- `supabase/functions/kasa-api/`: `index.ts`, `handler.ts` (пропуск → `users` по uid → `resolveScope` → day / range / storno_items / banner / report_rows / doc_url), `repo.ts` (supabase-js, страници по 1000, `guardQuery` отказва заявка без обхват), `storno-rule.js` (копие от kasa.js, решение 13). Обхват по решения 2–4 от 19.11; линк 300 сек; range над 400 дни — само за един обект; таван 20 000 реда → 413.
- `deno check` чист; `handler.test.ts` — 19 теста (обект А ≠ Б по всички видове, accounting с assigned (масив и низ), admin с assigned = всички, controlling / logistics, изтекъл и подправен пропуск без нито едно извикване към базата, роля от users, граници 400 / 401 дни, 413). Мутации на обхвата M1–M8 — всички убити от тест (не от грешка в типовете).
- `tests/kasa-api-storno-sync.test.js` (в TESTS) — текстът на трите блока + изпълнение на 10 гранични случая; мутант на прага → exit 1.
- Решенията от 19.11 — в т.7 на проекта; `19-11-kasa-api-opis` затворена; огледалото → `claude/open/19-11-kasa-mirror-role.md`.
- Остава (предложено разделяне): 1б-2 — `shared.js` (`kasaApi`, модал за повторен вход, ключ `kasa_api_stores`) + kasa.js + kasa-docs.js + notifications.js; 1б-3 — history.js, daily-turnover.js, report.js. Пилотът → `claude/open/19-11-kasa-api-pilot.md`.
