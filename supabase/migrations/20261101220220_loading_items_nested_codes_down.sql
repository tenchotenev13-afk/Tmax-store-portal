-- Rollback на 20261101220220_loading_items_nested_codes (loading-stoka-v-stoka-schema.sql)
-- Данните в колоната се губят — преди това: select id, nested_codes from loading_list_items where nested_codes is not null;
alter table public.loading_list_items drop column nested_codes;
