-- 20260930075914_users_revoke_anon_writes_down.sql
--
-- Връща ТОЧНО заварените права за запис от 30.09.2026, преди
-- 20260930075914_users_revoke_anon_writes.sql. Еднакви за anon и
-- authenticated (pg_class.relacl + pg_attribute.attacl):
--   таблица: d                    (DELETE)
--   email: a                      (+ r, който не се пипа)
--   display_name, store_name, role, active: a, w
--   assigned_stores, oborot_report, is_regional, notify_groups: w
--   id, created_at: само r (не се пипа)
-- Това е състоянието от 20260824190214_users_column_grants (приложена като
-- 20260820110927_users_column_grants.sql) + is_regional + notify_groups.
-- SELECT не се пипа нито тук, нито в миграцията.
--
-- ВНИМАНИЕ какво значи този rollback: всеки с публичния ключ пак може да
-- създава, редактира (вкл. role='admin') и трие потребители, заобикаляйки
-- admin-users. Пускай го само ако нещо реално пише в users с публичния ключ
-- и спирането му е по-голямото зло.

begin;

grant delete on table public.users to anon;
grant delete on table public.users to authenticated;

grant insert (email, display_name, store_name, role, active)
  on public.users to anon;
grant insert (email, display_name, store_name, role, active)
  on public.users to authenticated;

grant update (display_name, store_name, role, active, assigned_stores,
              oborot_report, is_regional, notify_groups)
  on public.users to anon;
grant update (display_name, store_name, role, active, assigned_stores,
              oborot_report, is_regional, notify_groups)
  on public.users to authenticated;

commit;

-- Проверка след rollback — трябва да съвпадне с таблицата горе:
--   select relacl::text from pg_class where oid = 'public.users'::regclass;
--     → ...anon=d/postgres,authenticated=d/postgres
--   select attname, attacl::text from pg_attribute
--    where attrelid = 'public.users'::regclass and attnum > 0
--      and not attisdropped order by attname;
--     → active/display_name/role/store_name: arw; email: ar;
--       assigned_stores/is_regional/notify_groups/oborot_report: rw;
--       id/created_at: r; password/password_hash/history_pin_hash: NULL
