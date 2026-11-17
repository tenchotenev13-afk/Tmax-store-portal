-- Rollback на 20261117083038_loading_wrong_store (loading-wrong-store-schema.sql)
-- Данните в колоните се губят — преди това:
--   select id, list_id, store_name, wrong_store, wrong_store_note, wrong_store_done_note
--   from loading_list_items where wrong_store is not null;
alter table public.loading_list_items
  drop column if exists wrong_store_done_note,
  drop column if exists wrong_store_done_at,
  drop column if exists wrong_store_done_by,
  drop column if exists wrong_store_note,
  drop column if exists wrong_store_at,
  drop column if exists wrong_store_by,
  drop column if exists wrong_store;
