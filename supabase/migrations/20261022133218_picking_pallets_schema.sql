-- 20261022133218_picking_pallets_schema — огледало: picking-pallets-schema.sql (схема + RLS).
-- Приложено 22.10.2026 с apply_migration; версията е дадена от базата.

create table public.picking_pallets (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  store_name text not null,
  kind text not null default 'pallet',
  no int not null,
  created_on date not null default current_date,
  status text not null default 'open',
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  closed_by text,
  closed_at timestamptz,
  shipment_id uuid,
  loaded_by text,
  loaded_at timestamptz,
  received_status text,
  received_by text,
  received_at timestamptz,
  receive_note text,
  constraint picking_pallets_kind_check check (kind in ('pallet','bulk','carton')),
  constraint picking_pallets_status_check check (status in ('open','closed')),
  constraint picking_pallets_no_uq unique (warehouse, store_name, kind, no, created_on)
);
comment on table public.picking_pallets is
  'Единица от пикинга (палет / насип / кашон) за един обект. № е пореден за (склад, обект, вид, ден).';
comment on column public.picking_pallets.kind is 'pallet | bulk | carton';
comment on column public.picking_pallets.status is 'open | closed';
comment on column public.picking_pallets.shipment_id is 'Част Б: транспортът (→ picking_shipments, FK от част Б). NULL = неизпратена.';
comment on column public.picking_pallets.received_status is 'Част Б: received | missing | NULL.';

create table public.picking_pallet_items (
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references public.picking_pallets(id) on delete cascade,
  line_id uuid not null references public.picking_lines(id) on delete cascade,
  qty numeric not null,
  qty_received numeric,
  receive_comment text,
  created_at timestamptz not null default now(),
  constraint picking_pallet_items_uq unique (pallet_id, line_id)
);
comment on table public.picking_pallet_items is
  'Колко от ред за пикинг е в единицата. Един ред може да е в няколко единици; сборът ≤ взетото (проверка в клиента).';
comment on column public.picking_pallet_items.qty_received is 'Част Б: получено при обекта, ако е различно от qty; NULL = равно.';

create index picking_pallet_items_line_idx on public.picking_pallet_items (line_id);
create index picking_pallets_wh_store_idx on public.picking_pallets (warehouse, store_name, status);

alter table public.picking_pallets enable row level security;
alter table public.picking_pallet_items enable row level security;

create policy picking_pallets_select on public.picking_pallets for select to anon using (true);
create policy picking_pallets_insert on public.picking_pallets for insert to anon with check (true);
create policy picking_pallets_update on public.picking_pallets for update to anon using (true) with check (true);
create policy picking_pallets_delete on public.picking_pallets for delete to anon using (true);
create policy picking_pallet_items_select on public.picking_pallet_items for select to anon using (true);
create policy picking_pallet_items_insert on public.picking_pallet_items for insert to anon with check (true);
create policy picking_pallet_items_update on public.picking_pallet_items for update to anon using (true) with check (true);
create policy picking_pallet_items_delete on public.picking_pallet_items for delete to anon using (true);

