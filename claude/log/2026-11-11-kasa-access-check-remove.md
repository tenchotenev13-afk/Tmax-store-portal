# 11.11 — kasa-access-check-remove

- Едж функцията `kasa-access-check` махната от репото (`supabase/functions/kasa-access-check/`) — приемаше `user_id` + ПИН (4–6 цифри) без пропуск, брояч или заключване (`claude/open/04-11-kasa-access-check-pin-bruteforce.md`, ВИСОК). Кодът на портала не е пипан.
- Сверено преди (11.11): `git grep` — само собствената папка, `supabase/functions/README.md`, документи и коментар в `20260820110927_users_column_grants.sql`; живата версия (`functions download --use-api`) — байт в байт като репото; `function_edge_logs` 04.11–11.11 по 24 ч. — 0 извиквания (контрола: същият филтър за `bulletin-notify` дава 96 за 24 ч.); `audit_log` — 0 реда `history_pin_*`; 31 от 105 потребители имат `history_pin_hash`.
- `supabase/functions/README.md`: редът за функцията — „махната 11.11.2026“; разделът „Готови на сървъра“ — само `set-history-pin`; таблицата с променливите — без `kasa-access-check`, с `grafik-api` и `send-routed-report`. `_shared/session.ts:5` — коментарът поправен (стига до живо при следващия деплой на функция с `_shared`). Затворено `04-11-edge-docs-stale`.
- `set-history-pin` и `users.history_pin_hash` не са пипани — `claude/open/11-11-history-pin-decision.md` (Тенчо).
- Тест: нов няма — няма клиентски код. Ред в `zhivko-opashka.md` няма — функциите не са в огледалото.
- Живата функция изтрита (11.11, след push на cb6cf7f): `supabase functions delete kasa-access-check` → „Deleted Edge Function.“; `list_edge_functions` — 13, без нея (= 13-те папки в репото); curl с anon `POST /functions/v1/kasa-access-check` → 404 `{"code":"NOT_FOUND","message":"Requested function was not found"}`. Затворено `04-11-kasa-access-check-pin-bruteforce`.
- SHA е комитът, който добавя този файл.
