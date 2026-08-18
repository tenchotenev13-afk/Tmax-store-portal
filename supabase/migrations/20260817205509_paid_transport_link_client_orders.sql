alter table public.client_orders
  add column if not exists paid_transport boolean not null default false,
  add column if not exists transport_id uuid;

alter table public.transport_orders
  add column if not exists client_order_id uuid,
  add column if not exists client_order_num text,
  add column if not exists awaiting_stock boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transport_orders_client_order_id_fkey'
  ) then
    alter table public.transport_orders
      add constraint transport_orders_client_order_id_fkey
      foreign key (client_order_id) references public.client_orders(id) on delete set null;
  end if;
end $$;

create index if not exists idx_transport_orders_client_order_id
  on public.transport_orders(client_order_id);
create index if not exists idx_client_orders_transport_id
  on public.client_orders(transport_id);
