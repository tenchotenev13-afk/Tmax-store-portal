# 04.11 — etap2-inventar

- Етап 2 от сигурността, стъпка 1: инвентар, само четене — `claude/security-etap2-inventar.md`. Нищо в базата и в кода не е променено; няма миграция.
- Подписване: JWKS — един ES256 ключ (`kid ccdd7d71…`); legacy HS256 anon ключът (shared.js) още се приема. Секретите на едж функциите (`supabase secrets list`, само имена) — без `SUPABASE_JWT_SECRET`; няма ключ, с който функция да подпише JWT за PostgREST. Статусът current/previously used/revoked — само в Dashboard (JWT Keys).
- Данни: 103 таблици + 1 изглед, 20 без RLS; grants anon = authenticated навсякъде; 59 таблици с политика само за anon; 23 pg_cron задачи (postgres), 13 от тях викат едж функции с legacy anon JWT; Storage — 4 публични bucket-а + `kasa-docs`, политиките само за anon, 1 894 публични URL-а в 12 колони; `storage_files_index` дава на anon списъка на файловете.
- Потребители на anon (edge_logs 28.10–04.11, по 24 ч.): портал, RM-app (8 таблици, само четене, без логин), огледало `TemaxMirrorSync/1.0` (89 таблици), PowerShell клиент (файлове — вероятно Живко), локални node/curl. Checklist-Temax не ползва Supabase. Едж функциите — само service_role (по репото).
- Копираните метаданни за базата са свалени през `supabase db query --linked` направо във файлове (scratchpad), документът е сглобен от тях — без препис през изхода на сесията; проверен за ключове (0).
- Тест: нов няма — само документ. Ред в `zhivko-opashka.md` няма.
- SHA е комитът, който добавя този файл.
