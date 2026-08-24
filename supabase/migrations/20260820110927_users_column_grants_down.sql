-- 20260820110927_users_column_grants_down.sql
--
-- Връща ТОЧНО заварените права, проверени преди прилагането на 20.08.2026:
--   pg_attribute.attacl = NULL за всичките 11 колони (нула колонни грантове)
--   pg_class.relacl     = {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--                          authenticated=arwdDxtm/postgres,
--                          service_role=arwdDxtm/postgres}
-- В PG 17 `grant all` включва и MAINTAIN, тоест възпроизвежда arwdDxtm точно.
--
-- ВНИМАНИЕ какво значи този rollback: anon отново получава SELECT върху
-- password_hash и history_pin_hash, тоест bcrypt хешовете на 102 души пак
-- стават публично четими с ключа от клиентския JS. Пускай го само ако нещо
-- реално се е счупило и връщането назад е по-малкото зло.

begin;

-- 1) Колонните грантове ПЪРВИ. Ако първо се даде табличният, PostgreSQL не
--    отнема колонните записи и attacl остава непразен — тогава състоянието НЕ
--    е идентично на заварените права, а само функционално еквивалентно.
revoke all privileges (id, email, password, store_name, role, display_name,
                       active, created_at, assigned_stores, password_hash,
                       history_pin_hash)
  on public.users from anon;
revoke all privileges (id, email, password, store_name, role, display_name,
                       active, created_at, assigned_stores, password_hash,
                       history_pin_hash)
  on public.users from authenticated;

-- 2) Табличните права обратно, точно както бяха.
grant all privileges on table public.users to anon;
grant all privileges on table public.users to authenticated;

commit;

-- Проверка след rollback — трябва да върне attacl NULL за всичките 11 колони
-- и arwdDxtm за двете роли:
--   select attname, attacl::text from pg_attribute
--    where attrelid = 'public.users'::regclass and attnum > 0
--      and not attisdropped;
--   select relacl::text from pg_class where oid = 'public.users'::regclass;
