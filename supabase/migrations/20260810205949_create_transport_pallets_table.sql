create table public.transport_pallets (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  report_date date not null default current_date,
  euro_pallets integer not null default 0,
  small_pallets integer not null default 0,
  nonstandard_pallets integer not null default 0,
  grate_pallets integer not null default 0,
  bilka_pallets integer not null default 0,
  sent_note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz
);

create unique index idx_transport_pallets_store_date on public.transport_pallets (store_name, report_date);
create index idx_transport_pallets_store on public.transport_pallets (store_name, report_date desc);

alter table public.transport_pallets enable row level security;
create policy anon_all_pallets on public.transport_pallets for all using (true) with check (true);
