Отворено: 04.11 · Кой чака: Code · Сесия: etap2-inventar

- **Два остарели текста около едж функциите** (намерени при инвентара за етап 2, `claude/security-etap2-inventar.md`, т.3б). Само документация — кодът работи.
  - `supabase/functions/_shared/session.ts:5`: „verifySession() още никой не вика — това е етап 2.“ — невярно: `grafik-api` го вика (`grafik-api/handler.ts`). Промяната на коментара в `_shared/` стига до живо само с деплой на всяка функция, която го ползва — достатъчно е да се поправи в репото и да влезе при следващия деплой.
  - `supabase/functions/README.md`, ред 415 (таблицата с променливите): за `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` липсват `grafik-api` и `send-routed-report` — и двете ги ползват.
