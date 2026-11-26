-- mirror-reader-audit-log-schema.sql
-- Ролята mirror_reader (mirror-reader-schema.sql, миграция 20261125122939)
-- чете и public.audit_log — за да може огледалото на Живко да махне
-- service_role ключа от сървъра (писмо на Живко от 25.11.2026: чете
-- audit_log със service_role, защото anon няма достъп до редовете).
-- Ключът на Живко НЕ се сменя — правата са на ролята.
-- Нищо за anon, нищо за запис.
--
-- Миграция mirror_reader_audit_log, версия 20261126062013, приложена 26.11.2026.
--
-- Сверка преди (26.11.2026):
-- - audit_log е таблица (relkind r) с включено RLS;
-- - единствената политика е anon_insert_audit_log (INSERT, TO anon) —
--   anon има grant SELECT, но без политика вижда 0 реда;
-- - has_table_privilege('mirror_reader', 'public.audit_log', 'SELECT') = false;
-- - 29 860 реда.
--
-- Проверка след прилагане (set local role mirror_reader в транзакция):
--   count(*) от audit_log = count(*) като postgres;
--   select от public.users → 42501;
--   като anon count(*) от audit_log = 0.
-- Резултат 26.11.2026: postgres 29866 = mirror_reader 29866; anon 0;
-- users → 42501; INSERT/UPDATE/DELETE за mirror_reader = false; ACL
-- mirror_reader=r/postgres; ACL-ът на anon — непроменен.

grant select on public.audit_log to mirror_reader;
create policy mirror_reader_select on public.audit_log
  for select to mirror_reader using (true);

-- Rollback:
-- drop policy if exists mirror_reader_select on public.audit_log;
-- revoke select on public.audit_log from mirror_reader;
