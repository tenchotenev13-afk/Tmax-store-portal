alter table public.client_orders
  add column if not exists co_eta date,
  add column if not exists co_note text,
  add column if not exists co_processed_at timestamptz,
  add column if not exists co_processed_by text;

create index if not exists idx_client_orders_fulfiller on public.client_orders(fulfiller);
