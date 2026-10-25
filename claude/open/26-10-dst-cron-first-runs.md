Отворено: 25.10 · Кой чака: чат · Сесия: dst-cron

Първите реални пускания след миграция `dst_cron_guards` (`20261025212904`).
Проверка в понеделник 26.10 (зимно време, UTC+2) през `cron.job_run_details`
(колона `return_message`):

- задача **16** `weekly-routed-report`: 05:10 UTC → „0 rows“, 06:10 UTC → „1 row“;
  `notification_topics.weekly_routed.last_run_at` = 26.10 около 08:10 българско
  (06:10 UTC).
- задача **4** `rm-push-morning`: 05:00 UTC → „0 rows“, 06:00 UTC → „1 row“.
  (5 и 6 същият модел: 11:00 → 0, 12:00 → 1; 14:00 → 0, 15:00 → 1.)
- задача **14** `oborot-report-evening` вечерта: 17:45 UTC → „0 rows“,
  18:45 UTC → „1 row“; писмото с оборота излиза в 20:45 българско.

Примерна заявка:

    select jobid, start_time, status, return_message
      from cron.job_run_details
     where jobid in (4,5,6,14,16) and start_time >= '2026-10-26'
     order by start_time;

Ако „1 row“ излезе и в двата часа или в нито един — where-ът не работи;
rollback е в `dst-cron-guards-schema.sql`.

Козметика за следващия деплой на `send-oborot-report` (не сега — без деплой
файлът би се разминал с живата функция): ред 2 в `index.ts` още казва
„Крон: 45 17 * * * (UTC) = 20:45 лятно / 19:45 зимно“ → вече е
`45 17,18 * * *` с условие час в София = 20, тоест 20:45 винаги.
