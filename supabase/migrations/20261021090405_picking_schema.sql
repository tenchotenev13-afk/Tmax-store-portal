-- 20261021090405_picking_schema — огледало: picking-schema.sql (схема + RLS + ключ picking_users).
-- Приложено 21.10.2026 с apply_migration; версията е дадена от базата.

create table public.picking_batches (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  source text not null,
  file_name text,
  rows_total int,
  rows_imported int,
  rows_skipped int,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  constraint picking_batches_source_check check (source in ('planned','unplanned'))
);
comment on table public.picking_batches is
  'Едно качване на SAP износ „Планиран трансфер" (planned) или „Непланиран трансфер" (unplanned) за един логистичен склад.';
comment on column public.picking_batches.warehouse is 'Логистичен склад Добрич | Логистичен склад Търговище';
comment on column public.picking_batches.rows_total is 'Редове във файла (без заглавието и празните).';
comment on column public.picking_batches.rows_imported is 'Влезли в picking_lines (без вече качените).';
comment on column public.picking_batches.rows_skipped is 'За друг склад / обект→обект / непознат номер / „За трансфер" ≤ 0.';

create table public.picking_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.picking_batches(id) on delete cascade,
  warehouse text not null,
  store_name text not null,
  sap_code text not null,
  product_name text,
  unit text,
  qty_requested numeric not null,
  supply_group text,
  sap_order text,
  sap_item text,
  line_no int,
  status text not null default 'open',
  qty_picked numeric,
  comment text,
  done_by text,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  constraint picking_lines_status_check check (status in ('open','picked','skipped')),
  constraint picking_lines_sap_order_uq unique (warehouse, sap_order, sap_item)
);
comment on table public.picking_lines is
  'Ред за пикинг: какво складът изпраща на обекта. Повторно качване на планиран файл = insert on conflict do nothing по (warehouse, sap_order, sap_item).';
comment on column public.picking_lines.store_name is 'Обектът получател — име по SR_SHEET_TO_STORE.';
comment on column public.picking_lines.supply_group is '„Снабдителска група" — само планиран.';
comment on column public.picking_lines.sap_order is '„Заявка за доставка" — само планиран; NULL при непланиран.';
comment on column public.picking_lines.sap_item is '„Позиция на заявка" — само планиран.';
comment on column public.picking_lines.line_no is 'Номер на реда във файла (2 = първият след заглавието) — за реда „както във файла"; created_at е еднакъв за цялата порция.';
comment on column public.picking_lines.status is 'open | picked | skipped';
comment on column public.picking_lines.qty_picked is 'При picked; NULL = колкото е заявено.';
comment on column public.picking_lines.comment is 'Задължителен при skipped — проверката е в клиента, не CHECK.';

create index picking_lines_batch_idx on public.picking_lines (batch_id);
create index picking_lines_wh_store_idx on public.picking_lines (warehouse, store_name, status);

alter table public.picking_batches enable row level security;
alter table public.picking_lines enable row level security;

create policy picking_batches_select on public.picking_batches for select to anon using (true);
create policy picking_batches_insert on public.picking_batches for insert to anon with check (true);
create policy picking_batches_update on public.picking_batches for update to anon using (true) with check (true);
create policy picking_batches_delete on public.picking_batches for delete to anon using (true);
create policy picking_lines_select on public.picking_lines for select to anon using (true);
create policy picking_lines_insert on public.picking_lines for insert to anon with check (true);
create policy picking_lines_update on public.picking_lines for update to anon using (true) with check (true);

insert into public.app_settings (key, value) values
  ('picking_users', 'ten.tenev@temax.bg, v.filev@temax.bg, tencho.tenev13@gmail.com')
on conflict (key) do update set value = excluded.value;

