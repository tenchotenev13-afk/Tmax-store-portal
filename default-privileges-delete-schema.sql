-- default-privileges-delete-schema.sql
-- Нова таблица в public да НЕ получава DELETE за anon и authenticated по
-- подразбиране (решение А, Тенчо, 02.11.2026). Забравен grant дава видима
-- грешка (401 / 42501 при триене), забравен revoke — тиха дупка.
--
-- Само DELETE. TRUNCATE не е достъпен през PostgREST и не се пипа;
-- SELECT / INSERT / UPDATE по подразбиране остават. Заварените таблици не се
-- пипат — правата им са от 20261103212604 anon_revoke_delete. Таблица, от
-- която браузърът трие → изричен `grant delete on public.<т> to anon,
-- authenticated;` в миграцията ѝ + запис в DELETE_ALLOWED
-- (tests/delete-tables-whitelist.test.js).
--
-- Проверено преди (04.11.2026):
--   - 109 таблици/изгледи в public, всички с owner postgres; миграциите
--     вървят като postgres (current_user), който НЕ е член на supabase_admin;
--   - pg_default_acl за таблици в public: два записа — за postgres и за
--     supabase_admin, и двата с anon=arwdDxtm, authenticated=arwdDxtm;
--   - промяна на записа за supabase_admin от postgres → 42501 „permission
--     denied to change default privileges“ (транзакция с rollback).
--     ГРАНИЦА: записът за supabase_admin остава — засяга само таблици,
--     създадени от supabase_admin, не нашите миграции;
--   - пробно прилагане в транзакция с rollback: нова таблица → anon и
--     authenticated без DELETE, със SELECT/INSERT/UPDATE; service_role с DELETE.

alter default privileges for role postgres in schema public
  revoke delete on tables from anon, authenticated;

-- ROLLBACK
-- alter default privileges for role postgres in schema public
--   grant delete on tables to anon, authenticated;
