-- 20261023085447_picking_shipments_schema — огледало: picking-shipments-schema.sql (схема + FK + RLS).
-- Приложено 23.10.2026 с apply_migration; версията е дадена от базата.

create table public.picking_shipments (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  store_name text not null,
  status text not null default 'loading',
  vehicle text,
  driver text,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  departed_by text,
  departed_at timestamptz,
  received_by text,
  received_at timestamptz,
  notify_error text,
  notified_at timestamptz,
  constraint picking_shipments_status_check check (status in ('loading','departed','received','partial'))
);
comment on table public.picking_shipments is
  'Транспорт от логистичен склад към един обект: единиците (picking_pallets.shipment_id), „Тръгна", приемане.';
comment on column public.picking_shipments.status is 'loading | departed | received | partial (приет с отклонения)';
comment on column public.picking_shipments.notify_error is 'Защо push / имейлът при „Тръгна" не е тръгнал; NULL = тръгнало. Извън спецификацията — за „🔁 Прати пак" след презареждане.';
comment on column public.picking_shipments.notified_at is 'Кога известието до обекта е тръгнало успешно.';

alter table public.picking_pallets add constraint picking_pallets_shipment_fk
  foreign key (shipment_id) references public.picking_shipments(id) on delete set null;

create index picking_shipments_store_status_idx on public.picking_shipments (store_name, status);
create index picking_pallets_shipment_idx on public.picking_pallets (shipment_id);

alter table public.picking_shipments enable row level security;

create policy picking_shipments_select on public.picking_shipments for select to anon using (true);
create policy picking_shipments_insert on public.picking_shipments for insert to anon with check (true);
create policy picking_shipments_update on public.picking_shipments for update to anon using (true) with check (true);
create policy picking_shipments_delete on public.picking_shipments for delete to anon using (status = 'loading');

