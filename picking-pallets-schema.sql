-- picking-pallets-schema.sql — Пикинг, етап 2, част А: единици (палет / насип /
-- кашон) и редовете в тях.
-- Огледало на миграцията (версията е дадена от базата):
--   supabase/migrations/20261022133218_picking_pallets_schema.sql (+ _down.sql)
-- Ред на прилагане: схема → проверка в базата → push на кода. picking.js чете
-- picking_pallets / picking_pallet_items при отваряне на „📦 Събиране";
-- ако кодът е на живо преди миграцията, под-табът показва грешка.
--
-- ЗАЩО (Тенчо, 22.10.2026). Събиращият отмята ред „✓ Взето" и той влиза в
-- ТЕКУЩАТА единица; единицата се затваря, прави се следваща; накрая —
-- етикети по единица с QR (#pk=<id>) и празно поле „№ за маркер". Един ред
-- може да е в няколко единици: picking_pallet_items.qty, сборът ≤ взетото
-- (проверка в клиента, не в базата).
--
-- № НА ЕДИНИЦАТА — пореден за (склад, обект, вид, ден): unique (warehouse,
-- store_name, kind, no, created_on). Клиентът смята max(no)+1 от заредените;
-- при сблъсък (друго устройство) — един повторен опит с +1.
--
-- КОЛОНИ ЗА ЧАСТ Б (изпращане и приемане) — добавени ТУК още сега, nullable,
-- кодът на част А не ги пише: picking_pallets.shipment_id / loaded_* /
-- received_* / receive_note и picking_pallet_items.qty_received /
-- receive_comment. FK shipment_id → picking_shipments идва с част Б (таблицата
-- още я няма).
--
-- CHECK по kind и status — в Supabase; огледалото на Живко не носи value
-- CHECK-ове.
--
-- ПРАВА. RLS включено; anon select / insert / update / delete на двете
-- таблици: празна единица се трие, ред се маха от единица (✕). КОМПРОМИС ЗА
-- ПИЛОТА, както picking_batches и loading_lists: anon ключът е общ, тоест
-- „трие се само празна единица", „не се отваря изпратена" и „вижда само
-- picking_users" са проверки в клиента (picking.js), не в базата.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): таблиците са нови — 0 реда. Имената
-- picking_pallets / picking_pallet_items не съществуваха.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

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

-- ROLLBACK (губи данни — всички единици и какво е в тях):
--   drop table if exists public.picking_pallet_items;
--   drop table if exists public.picking_pallets;
