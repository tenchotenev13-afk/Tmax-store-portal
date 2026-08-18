create table kasa_storno_items (
  id uuid primary key default gen_random_uuid(),
  storno_id uuid not null references kasa_storno(id) on delete cascade,
  kind text not null check (kind in ('returned','replacement')),
  sap_code text not null,
  article_name text,
  line_no int not null default 1,
  created_at timestamptz not null default now()
);

create index idx_kasa_storno_items_storno_id on kasa_storno_items(storno_id);

alter table kasa_storno_items enable row level security;
create policy anon_all_storno_items on kasa_storno_items for all using (true) with check (true);
