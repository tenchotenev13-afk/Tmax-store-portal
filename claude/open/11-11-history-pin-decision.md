Отворено: 11.11 · Кой чака: Тенчо · Сесия: kasa-access-check-remove

- **ПИН за таб История — да се довърши ли или да се махне изцяло?** На 11.11 е махната `kasa-access-check` (проверката на ПИН-а, без ограничение на опитите). Остават `set-history-pin` (задава ПИН, иска админски пропуск — `requireAdmin`) и колоната `users.history_pin_hash` — 31 от 105 потребители имат ПИН (11.11). Никой код на портала не ги вика; достъпът до История е само по роля (`roleCanSeeHistory`: admin, accounting).
  - **Довършване:** нова проверка на ПИН-а — с пропуск (`verifySession`), брояч и заключване по `user_id` — плюс клиентската част в История.
  - **Махане:** `supabase functions delete set-history-pin`, папката от репото, и миграция `alter table public.users drop column history_pin_hash` (с копие на колоната преди това, както при `bak-tables-drop`).
