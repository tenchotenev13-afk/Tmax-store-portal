create table public.kasa_storno (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  storno_date date not null,
  original_receipt_date date,
  articles text,
  article_name text,
  returned_sum numeric(10,2) not null default 0,
  reason text,
  replacement_articles text,
  new_sum numeric(10,2) not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz
);

create index idx_kasa_storno_store_date on public.kasa_storno (store_name, storno_date desc);

alter table public.kasa_storno enable row level security;
create policy anon_all_storno on public.kasa_storno for all using (true) with check (true);
