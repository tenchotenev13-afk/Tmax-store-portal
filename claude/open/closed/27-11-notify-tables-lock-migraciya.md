Отворено: 27.11 · Кой чака: Живко · Сесия: notify-tables-lock
Затворено: 28.11 · Как: Живко потвърди 27.11 (огледалото — само mirror_reader; edge_logs от 27.11 11:06 UTC без anon); миграция notify_tables_lock, версия 20261128085642, приложена 28.11 — час преди нея нула anon заявки от браузъра към петте; след нея anon → 401/42501 на петте (GET/POST/PATCH/DELETE), mirror_reader = postgres (7/9/6/1/45). Първото ползване от accounting — claude/open/28-11-notify-admin-accounting-live.md.

**Миграцията `notify-tables-lock-schema.sql` чака огледалото.** Петте
таблици (report_recipients, notification_topics / matrix / overrides /
schedules) губят всички права за anon/authenticated; порталът ги чете и пише
само през едж функцията `notify-admin`.

Блокер (edge_logs, 27.11): `TemaxMirrorSync` чете и петте с **anon** — по 17
GET на таблица от 26.11 14:00 UTC, последната 27.11 06:07 UTC
(`request.sb.jwt.authorization.payload.role` = anon). mirror_reader вече има
SELECT на петте (20261126222936), а миграцията добавя и
`mirror_reader_select` (RLS се включва). Живко сменя скрипта да чете всичките
93 таблици с ключа на mirror_reader (`zhivko-opashka.md`, „Чака изпращане“,
27.11). Без това огледалото спира да получава петте в деня на миграцията.

Точно преди миграцията — edge_logs за последния час, петте таблици:
- `TemaxMirrorSync` с role anon → 0 (с mirror_reader — да);
- браузър (Mozilla) към /rest/v1/<петте> → 0 (порталът е на notify-admin,
  Pages сверен);
- notify-admin в function_edge_logs → има 200-ки.

След миграцията (транзакция / HTTP): anon → 401/42501 на петте (GET и POST);
mirror_reader count = postgres; notify-admin list като admin = броевете;
кронът в часа (bulletin-notify, dynamic-responder, send-scheduled-report,
send-routed-report) — без грешки в function_edge_logs.
