-- 20260930075914_users_revoke_anon_writes.sql
--
-- Етап 4 от затварянето на users: anon и authenticated губят INSERT, UPDATE
-- и DELETE върху public.users.
--
-- Защо: anon ключът е публичен в клиентския JS (shared.js). До тази миграция
-- всеки с него можеше да създаде потребител, да смени роля/обект/активност
-- на когото и да е (включително да си даде role='admin') и да изтрие
-- произволен ред. От етап 3 (38c0a22, 29.09.2026) порталът не пише в users
-- директно — всички записи минават през едж функцията admin-users, която
-- проверява админския пропуск и пише със service_role. Паролите и ПИН-ът
-- минават през auth-login / auth-set-password / set-history-pin, също със
-- service_role. Тоест клиентските права за запис вече не ползват никой, а
-- само държат вратата отворена.
--
-- Проверено преди писането (30.09.2026):
--   - grep в целия клиентски код за sbPatch/sbPost/sbPostReturn/sbDelete
--     ('users' и fetch към /users: 0 в origin/main; контрола върху 2d1aa60
--     намира шестте стари места в admin.js;
--   - в users пишат само admin-users, auth-login, auth-set-password,
--     set-history-pin — и четирите със SUPABASE_SERVICE_ROLE_KEY;
--   - РМ app и Checklist-Temax не пишат в users; огледалото само чете.
--
-- Какво остава: SELECT по колони точно както е (id, email, display_name,
-- store_name, role, active, assigned_stores, created_at, oborot_report,
-- is_regional, notify_groups). Четенето не се пипа — огледалото и
-- клиентът продължават както досега. RLS остава изключено; политиките не се
-- пипат. service_role и postgres не се пипат.
--
-- Заварени права (pg_class.relacl + pg_attribute.attacl, 30.09.2026), еднакви
-- за anon и authenticated:
--   таблица: d                    (DELETE)
--   email: ar
--   display_name, store_name, role, active: arw
--   assigned_stores, oborot_report, is_regional, notify_groups: rw
--   id, created_at: r
--   password, password_hash, history_pin_hash: няма
--
-- Връщане: 20260930075914_users_revoke_anon_writes_down.sql — дава обратно
-- ТОЧНО горните a/w/d. Нужно е само ако нещо извън портала се окаже, че
-- пише в users с публичния ключ.

begin;

-- 1) На ниво таблица. В PostgreSQL REVOKE на табличното право отнема и
--    съответните колонни права по всички колони.
revoke insert, update, delete on table public.users from anon;
revoke insert, update, delete on table public.users from authenticated;

-- 2) Изрично и по колони — за да не зависи резултатът от горното поведение.
--    Всичките 14 колони; където права няма, revoke не прави нищо.
revoke insert (id, email, password, store_name, role, display_name, active,
               created_at, assigned_stores, password_hash, history_pin_hash,
               oborot_report, is_regional, notify_groups),
       update (id, email, password, store_name, role, display_name, active,
               created_at, assigned_stores, password_hash, history_pin_hash,
               oborot_report, is_regional, notify_groups)
  on public.users from anon;
revoke insert (id, email, password, store_name, role, display_name, active,
               created_at, assigned_stores, password_hash, history_pin_hash,
               oborot_report, is_regional, notify_groups),
       update (id, email, password, store_name, role, display_name, active,
               created_at, assigned_stores, password_hash, history_pin_hash,
               oborot_report, is_regional, notify_groups)
  on public.users from authenticated;

commit;

-- Проверка след прилагане — никакви a / w / d за anon и authenticated;
-- колонните SELECT (r) остават:
--   select relacl::text from pg_class where oid = 'public.users'::regclass;
--   select attname, attacl::text from pg_attribute
--    where attrelid = 'public.users'::regclass and attnum > 0
--      and not attisdropped order by attname;
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'users'
--      and grantee in ('anon','authenticated')
--      and privilege_type <> 'SELECT';            -- очаквано: 0 реда
--
-- ОТСЕГА НАТАТЪК: нова колона в users получава само
--   grant select (нова_колона) on public.users to anon, authenticated;
-- Запис от клиента — само през admin-users (бял списък в handler.ts).
