-- storage-files-index-readonly-schema.sql
-- Изгледът public.storage_files_index става САМО за четене за anon и
-- authenticated. SELECT остава — огледалото на Живко (sync-storage-files.ps1)
-- чете изгледа с anon ключа.
--
-- Защо: изгледът е от 20260730123224_add_storage_files_index_view.sql, където
-- е дадено само GRANT SELECT TO anon. В базата (24.11.2026) anon и
-- authenticated имат и INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
-- (права по подразбиране за public; ACL anon=arwdDxtm/postgres). Собственик е
-- postgres (rolbypassrls), изгледът е без security_invoker и е обновяем —
-- запис през него минава покрай RLS на storage.objects. DELETE се спира от
-- тригера storage.protect_delete, UPDATE и INSERT — не.
--
-- НЕ се пипа: SELECT, собственикът, security_invoker. security_invoker би
-- спрял огледалото — anon няма права върху storage.objects.
--
-- Проверка след прилагане:
--   has_table_privilege('anon','public.storage_files_index','UPDATE')  = false
--   has_table_privilege('anon','public.storage_files_index','INSERT')  = false
--   has_table_privilege('anon','public.storage_files_index','SELECT')  = true
--   select count(*) from public.storage_files_index  — 9680 преди (24.11.2026)

revoke insert, update, delete, truncate, references, trigger
  on public.storage_files_index from anon, authenticated;

-- Rollback:
-- grant insert, update, delete, truncate, references, trigger
--   on public.storage_files_index to anon, authenticated;
