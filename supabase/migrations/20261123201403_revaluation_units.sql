-- 20261123201403_revaluation_units
-- Огледало: revaluation-units-schema.sql (обяснението е там).
-- Rollback: 20261123201403_revaluation_units_down.sql

create table public.revaluation_unit_counters (
  store_name text primary key,
  last_num   integer not null default 0
);
alter table public.revaluation_unit_counters enable row level security;
revoke all on public.revaluation_unit_counters from anon, authenticated;

create table public.revaluation_units (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.revaluation_items(id) on delete cascade,
  submission_id uuid not null references public.revaluation_submissions(id) on delete cascade,
  store_name    text not null,
  unit_no       text not null unique,
  created_at    timestamptz not null default now()
);
create index revaluation_units_item_idx on public.revaluation_units(item_id);
create index revaluation_units_submission_idx on public.revaluation_units(submission_id);

comment on table public.revaluation_units is
  'Преоценка, етап 2 (23.11.2026): пореден номер на бройка. БР → един на бройка, друга МЕ → един на ред. unit_no раздава тригерът assign_revaluation_unit_no().';
comment on column public.revaluation_units.unit_no is
  '<store_name>-П<4 цифри>, брояч по обект (revaluation_unit_counters). Не се преизползва.';

create or replace function public.assign_revaluation_unit_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st  text;
  sub uuid;
  n   integer;
begin
  select i.store_name, i.submission_id into st, sub
    from public.revaluation_items i where i.id = new.item_id;
  if sub is null then
    raise exception 'revaluation_units: няма ред % в revaluation_items', new.item_id;
  end if;
  st := coalesce(nullif(btrim(st), ''), 'Без обект');

  -- ON CONFLICT DO UPDATE заключва реда на обекта: два едновременни записа
  -- от един обект получават различни номера.
  insert into public.revaluation_unit_counters (store_name, last_num)
  values (st, 1)
  on conflict (store_name)
  do update set last_num = public.revaluation_unit_counters.last_num + 1
  returning last_num into n;

  new.store_name    := st;
  new.submission_id := sub;
  new.unit_no       := st || '-П' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
  return new;
end
$$;
revoke all on function public.assign_revaluation_unit_no() from public, anon, authenticated;

create trigger trg_revaluation_unit_no
before insert on public.revaluation_units
for each row execute function public.assign_revaluation_unit_no();

alter table public.revaluation_units enable row level security;
create policy revaluation_units_select on public.revaluation_units for select to anon using (true);
create policy revaluation_units_insert on public.revaluation_units for insert to anon with check (true);
create policy revaluation_units_delete on public.revaluation_units for delete to anon using (true);
grant select, insert on public.revaluation_units to anon;
grant delete on public.revaluation_units to anon;

alter table public.revaluation_items add column photos text[];
comment on column public.revaluation_items.photos is
  'Снимки на реда (етап 2, 23.11.2026): публични адреси в bulletin-files/revaluation/. Махане = само от масива. NULL = няма.';
