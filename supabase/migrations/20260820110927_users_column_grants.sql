-- 20260820110927_users_column_grants.sql
--
-- Защо: anon ключът е публичен в клиентския JS (shared.js). Всяко право на
-- anon върху users е публично достъпно на практика — включително SELECT върху
-- password_hash и history_pin_hash, тоест bcrypt хешовете на 102 души.
-- Табличният грант arwdDxtm се заменя с колонни грантове само върху колоните,
-- които клиентът и огледалото реално ползват.
--
-- ТОВА НЕ Е RLS ПРОМЯНА. RLS остава ИЗКЛЮЧЕНО и нито една политика не се
-- пипа. Колонните права казват КОИ КОЛОНИ, никога КОИ РЕДОВЕ — след тази
-- миграция anon продължава да чете пълния списък служители.
--
-- Предусловие, изпълнено преди прилагането: admin.js праща
-- POST /users?select=id (commit 628fa08, проверено в origin/main). Без него
-- Prefer:return=representation прави RETURNING users.* и създаването на
-- потребител би връщало 403 върху password_hash.

begin;

-- 1) Табличните права падат ПЪРВИ. Докато съществува табличен грант, колонните
--    грантове не ограничават нищо — табличният е надмножество.
revoke all privileges on table public.users from anon;
revoke all privileges on table public.users from authenticated;

-- 2) SELECT — само безопасните колони.
--    id/email/role са нужни и за филтрите и order= в PostgREST
--    (admin.js: order=role,email и id=eq.…). created_at не се ползва от
--    клиента, но се ползва от огледалото (sync-mirror.ps1).
--    oborot_report е добавена към users СЛЕД първото писане на тази
--    миграция (20.08.2026) и отначало липсваше тук. admin.js я чете на две
--    места (списъка с потребители и модала за оборота), а огледалото я
--    тегли като девета колона — без този грант и двете дават 403.
grant select (id, email, display_name, store_name, role, active,
              assigned_stores, created_at, oborot_report)
  on public.users to anon;
grant select (id, email, display_name, store_name, role, active,
              assigned_stores, created_at, oborot_report)
  on public.users to authenticated;

-- 3) INSERT — admin.js подава точно тези пет колони.
--    id, created_at, active и role имат DEFAULT.
--    oborot_report НЕ е тук нарочно: при създаване на потребител admin.js не
--    подава колоната, стойността се задава после през editOborotReport() с
--    PATCH. Тоест на INSERT правото ѝ би било мъртво.
grant insert (email, display_name, store_name, role, active)
  on public.users to anon;
grant insert (email, display_name, store_name, role, active)
  on public.users to authenticated;

-- 4) UPDATE — редакция на колега, назначени магазини и оборотът.
--    Никой клиентски път не пише в password/password_hash/history_pin_hash —
--    това минава само през Edge Functions със service_role.
grant update (display_name, store_name, role, active, assigned_stores,
              oborot_report)
  on public.users to anon;
grant update (display_name, store_name, role, active, assigned_stores,
              oborot_report)
  on public.users to authenticated;

-- 5) DELETE остава на ниво таблица. DELETE няма колонен вариант в PostgreSQL,
--    а премахването му чупи deleteUser() в admin.js. Съзнателно оставено както
--    е — това е известна дупка, не пропуск.
grant delete on public.users to anon;
grant delete on public.users to authenticated;

-- Нарочно НЕ се възстановяват TRUNCATE, REFERENCES, TRIGGER и MAINTAIN.
-- Нищо в портала не ги ползва, а TRUNCATE за anon е дупка сам по себе си.
--
-- service_role и postgres НЕ се пипат: auth-login, auth-set-password,
-- kasa-access-check и set-history-pin четат и пишат хешовете именно през тях.
--
-- ОТСЕГА НАТАТЪК: всяка нова колона в users трябва да носи явен
-- grant select (нова_колона) on public.users to anon, authenticated;
-- в същата миграция — иначе е недостъпна и за клиента, и за огледалото.

commit;
