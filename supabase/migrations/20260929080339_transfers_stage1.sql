-- Междускладови трансфери — етап 1: транспорт + товари + номерация.
-- Отделен модул (transfers.js), не разширение на loading_*.
-- Бележка за огледалото: claude/transfers-2026-09-29.md.
--
-- БЕЗ value CHECK-ове (mode, kind, courier_company, status, qty) — същото
-- правило като loading_list_products / loading_list_photos / loading_missing:
-- огледалото на Живко не ги носи. Правилата живеят в клиента:
-- tfValidate() в transfers.js (включително „куриерът е без спирки").

-- 1. Брояч на номерата по създаващ обект — образец client_order_counters.
create table public.transfer_counters (
  store_name text primary key,
  last_num   integer not null default 0
);

-- 2. Транспорт.
create table public.transfers (
  id              uuid primary key default gen_random_uuid(),
  transfer_num    text not null,                  -- „Добрич-0007", от тригера
  from_store      text not null,                  -- създаващият обект = начална точка
  mode            text not null,                  -- bus | courier
  depart_date     date,                           -- бус
  depart_time     text,                           -- бус, „HH:MM" (text — като hour в transport_orders)
  driver          text,                           -- бус, свободен текст
  stops           text[] not null default '{}',   -- бус: междинни спирки по ред (обекти)
  end_store       text not null,                  -- бус: крайна точка; куриер: единственият получател
  courier_company text,                           -- куриер: Intime | Econt | Transpress
  waybill_no      text,                           -- куриер: № товарителница
  status          text not null default 'planned',-- етап 1: само planned
  note            text,
  created_by      text,
  created_at      timestamptz not null default now()
);
create unique index transfers_num_uidx on public.transfers (transfer_num);
create index transfers_from_idx  on public.transfers (from_store, created_at desc);
create index transfers_end_idx   on public.transfers (end_store);
create index transfers_stops_gin on public.transfers using gin (stops);

-- 3. Товари — една физическа единица на ред (брой > 1 е ЕДИН товар).
create table public.transfer_cargo (
  id                  uuid primary key default gen_random_uuid(),
  transfer_id         uuid not null references public.transfers(id) on delete cascade,
  position            integer not null,
  kind                text not null,                  -- pallet | roll | bulk | carton
  qty                 integer not null default 1,
  recipient_store     text not null,                  -- краен получател, винаги ОБЕКТ
  -- Точките на прехвърляне по ред: САМО обекти, където товарът се
  -- разтоварва и чака следващ транспорт. Транзитът не се пише.
  transfer_points     text[] not null default '{}',
  note                text,
  -- Връзки 0..N като масиви — мотивът е в claude/transfers-2026-09-29.md.
  client_order_ids    uuid[] not null default '{}',
  transport_order_ids uuid[] not null default '{}',
  claim_numbers       text[] not null default '{}',   -- № рекламация, свободен текст
  goods_doc           text,                           -- стокова разписка / изходящ №
  loading_item_id     uuid references public.loading_list_items(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index transfer_cargo_transfer_idx     on public.transfer_cargo (transfer_id);
create index transfer_cargo_recipient_idx    on public.transfer_cargo (recipient_store);
create index transfer_cargo_points_gin       on public.transfer_cargo using gin (transfer_points);
create index transfer_cargo_loading_item_idx on public.transfer_cargo (loading_item_id);

-- 4. Номерът — раздава го базата; стойност от клиента се игнорира.
-- SECURITY DEFINER: пише в transfer_counters, където anon няма право на
-- запис. Работи, защото собственикът на функцията е собственик и на
-- таблицата (RLS не важи за собственика). НЕ слагай FORCE ROW LEVEL
-- SECURITY на transfer_counters — всеки INSERT в transfers ще падне.
create function public.assign_transfer_num()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st text;
  n  integer;
begin
  st := coalesce(nullif(btrim(new.from_store), ''), 'Без обект');
  -- ON CONFLICT DO UPDATE заключва реда на обекта: два едновременни записа
  -- от един обект получават различни номера.
  insert into public.transfer_counters (store_name, last_num)
  values (st, 1)
  on conflict (store_name)
  do update set last_num = public.transfer_counters.last_num + 1
  returning last_num into n;
  new.transfer_num := st || '-' || lpad(n::text, 4, '0');
  return new;
end
$$;
-- Тригерна функция: EXECUTE не се проверява при задействане. Отнема се и от
-- PUBLIC (водещото =X/), не само от anon — виж CLAUDE.md, perform_daily_backup.
revoke execute on function public.assign_transfer_num() from public, anon, authenticated;

create trigger trg_assign_transfer_num
before insert on public.transfers
for each row execute function public.assign_transfer_num();

-- Номерът не се пренаписва и при UPDATE.
create function public.keep_transfer_num()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.transfer_num := old.transfer_num;
  return new;
end
$$;
revoke execute on function public.keep_transfer_num() from public, anon, authenticated;

create trigger trg_keep_transfer_num
before update on public.transfers
for each row execute function public.keep_transfer_num();

-- 5. Права и RLS.
-- transfers / transfer_cargo — permissive anon, като loading_*; разделението
-- кой какво вижда е в клиента (tfVisibleToStores в transfers.js).
grant all on table public.transfers, public.transfer_cargo to anon, authenticated, service_role;

alter table public.transfers enable row level security;
create policy anon_all_transfers on public.transfers
  for all to anon using (true) with check (true);

alter table public.transfer_cargo enable row level security;
create policy anon_all_transfer_cargo on public.transfer_cargo
  for all to anon using (true) with check (true);

-- transfer_counters — anon само ЧЕТЕ (огледалото тегли през anon и така
-- броячите имат бекъп). Запис — само тригерът.
revoke all on table public.transfer_counters from anon, authenticated;
grant select on table public.transfer_counters to anon, authenticated;
alter table public.transfer_counters enable row level security;
create policy anon_select_transfer_counters on public.transfer_counters
  for select to anon using (true);

-- ЕТАП 2 (не се строи сега): public.transfer_cargo_events —
-- (id, cargo_id → transfer_cargo, store_name, event: unloaded | received |
--  handed_to_courier | problem, note, created_by, created_at).
-- „Премина" НЕ се пише. Статусът на транспорта ще се смята от събитията.
