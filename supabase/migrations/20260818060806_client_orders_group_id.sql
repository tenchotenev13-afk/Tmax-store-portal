alter table public.client_orders add column if not exists group_id uuid;
create index if not exists idx_client_orders_group_id on public.client_orders(group_id);
