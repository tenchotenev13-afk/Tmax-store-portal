-- 20261011200000_supply_store_notes
-- Огледало: supply-store-notes-schema.sql (обяснението е там).
-- Rollback: 20261011200000_supply_store_notes_down.sql

create table public.supply_store_notes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.supply_templates(id) on delete cascade,
  store_name text not null,
  week_start date not null,
  co_note text,
  co_note_by text,
  co_note_at timestamptz default now(),
  constraint supply_store_notes_uq unique (template_id, store_name, week_start)
);

comment on table public.supply_store_notes is
  'Зареждане: коментар на Снабдяването към обект за седмица и бланка (какво е поръчано). Един ред на бланка × обект × седмица.';

alter table public.supply_store_notes enable row level security;
create policy supply_store_notes_select on public.supply_store_notes for select to anon using (true);
create policy supply_store_notes_insert on public.supply_store_notes for insert to anon with check (true);
create policy supply_store_notes_update on public.supply_store_notes for update to anon using (true) with check (true);
