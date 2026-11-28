Отворено: 28.11 · Кой чака: Тенчо · Сесия: notify-tables-lock

**notify-admin като accounting — непроверено на живо.** Като admin чатът
провери на 28.11 (Известия, „📧 Общи отчети“, 🔔 в Бюлетина — зареждат през
notify-admin, нула преки заявки). Accounting няма парола за проба. Затваря се
при първото реално ползване от accounting на 🔔 (напомняне) или на отчет за
задача в Бюлетина: function_logs на notify-admin — ред
`{"notify_admin":"notification_schedules", …, "role":"accounting"}` и 200 в
function_edge_logs, без 403. При 403 за accounting — проверка на
`users.role`/`active` на човека (функцията чете ролята от users, не от
пропуска) и на `TABLES.notification_schedules.roles` в handler.ts.
