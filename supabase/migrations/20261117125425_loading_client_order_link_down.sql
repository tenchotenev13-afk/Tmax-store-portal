-- Откат на 20261117125425_loading_client_order_link. Връзките се губят
-- (коментарът „КЗ …" остава). Преди това:
--   select id, list_id, store_name, client_order_id
--   from public.loading_list_items where client_order_id is not null;
drop index if exists public.loading_list_items_client_order_idx;
alter table public.loading_list_items drop column if exists client_order_id;
