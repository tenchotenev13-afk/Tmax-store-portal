Отворено: 29.10 · Кой чака: чат · Сесия: minusi-auto-tick

Първата автоматична отметка на „СПРАВКА МИНУСИ“ на живо (`bulletin-notify` v16, `completed_by = 'auto:minusi'`).

Проверка:

```sql
select tc.store_name, tc.completion_date, tc.completed_at at time zone 'Europe/Sofia' as kogda, tc.recurring_task_id
  from task_completions tc
 where tc.completed_by = 'auto:minusi'
 order by tc.completed_at desc;
```

Очаква се: ред само за обект от `minus_stores` (днес Гоце Делчев, Монтана), по неговата задача (ГД → 5a4e0562…, Монтана → 03c44560…), в ден Пон–Пет, след качване в `minus_uploads` за деня или от 20:00 до края на деня без качване, и само когато „➖ Минуси“ на обекта показва 0 непопълнени. В портала на обекта: квадратче няма, вместо него „✓ от Минуси“ / „⏳ N непопълнени“.

Резултатът на крона: `minus_auto_tick` в отговора на `bulletin-notify` (function_edge_logs / net._http_response); грешка → `minus_auto_tick: …` в логовете на функцията.

Не е проверено при деплоя: реален insert (dry_run не пише) и видът на „✓ от Минуси“ в браузъра на обекта.
