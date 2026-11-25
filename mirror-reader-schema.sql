-- mirror-reader-schema.sql
-- Роля само за четене за огледалото на Живко (sync-mirror.ps1 и
-- sync-storage-files.ps1): седемте касови таблици, изгледът
-- storage_files_index и файловете в bucket kasa-docs.
-- Подготовка за етап 2 на защитата на Каса (claude/kasa-api-dizajn.md т.6,
-- вариант А; claude/open/19-11-kasa-mirror-role.md). Правата на anon НЕ се
-- пипат тук — това е етап 2, след потвърждение от Живко.
--
-- Ключът е JWT с role=mirror_reader, подписан с JWT тайната на проекта
-- (tools/mirror-key/make-mirror-key.js — пуска го Тенчо, не сесията).
--
-- Миграция mirror_reader, версия 20261125122939, приложена 25.11.2026.
--
-- Сверка преди (25.11.2026):
-- - и седемте таблици са с RLS. Политиките: anon_all_kasa, anon_all_glavna,
--   anon_all_zoborot, anon_all_docs — TO anon; anon_all_daily_turnover,
--   anon_all_storno, anon_all_storno_items — TO public (важат и за новата
--   роля, но изрична политика се добавя и там: етап 2 може да ги смени).
-- - storage_files_index: изглед, собственик postgres (rolbypassrls), без
--   security_invoker — чете storage.objects като собственика; трябва му
--   само SELECT, без политика.
-- - Storage API влиза като supabase_storage_admin, който е член на
--   authenticator (set=true), а authenticator прави SET ROLE към ролята от
--   токена. Затова grant ... to authenticator стига и за PostgREST, и за
--   Storage. storage.buckets няма нито една политика и anon днес сваля от
--   kasa-docs без нея — bucket-ът се търси като администратор; права върху
--   storage.buckets НЕ се дават. Самопроверката в скрипта (сваляне на файл)
--   е доказателството.
-- - Няма права за PUBLIC върху таблици в public/storage и няма SECURITY
--   DEFINER функции в public с EXECUTE за PUBLIC.
--
-- Проверка след прилагане (set local role mirror_reader в транзакция):
--   select count(*) от всяка от осемте — същото като с anon;
--   select from public.users → 42501;
--   has_table_privilege('mirror_reader', <всяка от осемте>, 'INSERT'/'UPDATE'/'DELETE') = false.

create role mirror_reader nologin noinherit;
grant mirror_reader to authenticator with inherit false, set true;

grant usage on schema public to mirror_reader;
grant usage on schema storage to mirror_reader;

grant select on
  public.kasa_reports,
  public.kasa_glavna,
  public.kasa_zoborot,
  public.kasa_documents,
  public.kasa_storno,
  public.kasa_storno_items,
  public.daily_turnover,
  public.storage_files_index
to mirror_reader;

create policy mirror_reader_select on public.kasa_reports      for select to mirror_reader using (true);
create policy mirror_reader_select on public.kasa_glavna       for select to mirror_reader using (true);
create policy mirror_reader_select on public.kasa_zoborot      for select to mirror_reader using (true);
create policy mirror_reader_select on public.kasa_documents    for select to mirror_reader using (true);
create policy mirror_reader_select on public.kasa_storno       for select to mirror_reader using (true);
create policy mirror_reader_select on public.kasa_storno_items for select to mirror_reader using (true);
create policy mirror_reader_select on public.daily_turnover    for select to mirror_reader using (true);

grant select on storage.objects to mirror_reader;
create policy mirror_reader_kasa_docs_read on storage.objects
  for select to mirror_reader using (bucket_id = 'kasa-docs');

-- Rollback:
-- drop policy if exists mirror_reader_kasa_docs_read on storage.objects;
-- revoke select on storage.objects from mirror_reader;
-- drop policy if exists mirror_reader_select on public.kasa_reports;
-- drop policy if exists mirror_reader_select on public.kasa_glavna;
-- drop policy if exists mirror_reader_select on public.kasa_zoborot;
-- drop policy if exists mirror_reader_select on public.kasa_documents;
-- drop policy if exists mirror_reader_select on public.kasa_storno;
-- drop policy if exists mirror_reader_select on public.kasa_storno_items;
-- drop policy if exists mirror_reader_select on public.daily_turnover;
-- revoke select on public.kasa_reports, public.kasa_glavna, public.kasa_zoborot,
--   public.kasa_documents, public.kasa_storno, public.kasa_storno_items,
--   public.daily_turnover, public.storage_files_index from mirror_reader;
-- revoke usage on schema storage from mirror_reader;
-- revoke usage on schema public from mirror_reader;
-- revoke mirror_reader from authenticator;
-- drop role mirror_reader;
-- (След rollback издаденият ключ не работи — PostgREST връща грешка за
-- несъществуваща роля. Друго почистване не трябва.)
