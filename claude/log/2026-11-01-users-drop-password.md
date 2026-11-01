# 01.11 — users-drop-password

- Етап 5б от затварянето на `users`: `users-drop-password-schema.sql` маха `public.users.password` (чист текст). Rollback: `add column password text` без стойности и без стария default.
- Сверено преди (01.11): единствената зависимост в базата е DEFAULT `'temax2025'`; няма изгледи/функции/политики/тригери; колонни права само postgres и service_role. 104 реда, всички с `password_hash`; 1 с попълнено `password` (създаден 03.10.2026) — равен на default-а, тоест от `admin-users` create без поле password, не от функция.
- Живите `auth-login`, `auth-set-password`, `admin-users`, `set-history-pin` (+ `_shared/session.ts` на всяка, `functions download --use-api`) — байт в байт като репото след `tr -d '\r'`; никоя не пипа колоната. Ресетът без стара парола иска admin пропуск → дупката в `claude/open-tasks.md` е затворена (62314bd).
- Тест: `tests/users-no-plain-password.test.js` (статичен, бял списък по ред); 5 мутанта — съборени.
- `checklist.js`: застарял коментар за select-а на auth-login (без `password`) — само коментар.
- Миграция: още НЕ е приложена (след push). Версия: —.
- SHA е комитът, който добавя този файл.
