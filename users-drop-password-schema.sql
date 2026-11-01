-- users-drop-password-schema.sql
-- Етап 5б от затварянето на users: колоната public.users.password (парола в
-- чист текст) се маха. Виж supabase/functions/README.md, „етап 5а/5б".
--
-- Защо: от етап 5а (30.09.2026, f8be752) входът и смяната на парола ползват
-- само password_hash (bcrypt). Колоната не се чете и не се пише от никой код,
-- но имаше DEFAULT 'temax2025' — всеки нов потребител от admin-users (който не
-- праща password) получаваше тази парола в чист текст. Така се появи редът
-- от 03.10.2026: единственият попълнен, равен точно на default-а.
--
-- Проверено преди (01.11.2026):
--   - pg_depend: единствената зависимост е самият DEFAULT (pg_attrdef);
--     няма изгледи, функции (prosrc), политики или тригери с password;
--   - колонни права върху password: само postgres и service_role —
--     anon/authenticated нямат (от 20260820110927_users_column_grants),
--     тоест огледалото никога не е виждало стойностите;
--   - 104 реда: 104 с password_hash, 1 с попълнено password (= default);
--   - живите auth-login, auth-set-password, admin-users, set-history-pin
--     (+ _shared/session.ts на всяка) са байт в байт като репото и не пипат
--     колоната; grep в *.js и supabase/functions/ — 0 попадения
--     (tests/users-no-plain-password.test.js).

alter table public.users drop column password;

-- ROLLBACK
-- alter table public.users add column password text;
-- Стойностите не се възстановяват — умишлено: всички 104 реда имат
-- password_hash. Default-ът 'temax2025' също НЕ се връща.
