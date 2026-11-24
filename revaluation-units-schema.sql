-- revaluation-units-schema.sql
-- Огледало на supabase/migrations/20261123201403_revaluation_units.sql
-- (приложена 23.11.2026).
--
-- ЗАЩО (Преоценка, етап 2 от 3, 23.11.2026). Всяка бройка в бланката получава
-- пореден номер при добавяне на реда — за етикетите в етап 3. Към реда могат
-- да се качват снимки за прегледа на регионалния.
--
-- - revaluation_units — по един ред на номер. Мерна единица БР (бр., бр, БР —
--   нормализира rvSapUnit в revaluation.js) → по един номер на бройка
--   (ceil(qty)); всяка друга МЕ → един номер на реда. Клиентът добавя и трие
--   редовете (rvUnitsSync); изтрит ред от бланката → номерата му падат
--   (on delete cascade).
-- - unit_no = '<store_name>-П<4 цифри>' (Кърджали-П0042), брояч по обект.
--   Раздава го САМО тригерът; стойност от клиента се игнорира. store_name и
--   submission_id тригерът също взима от реда (revaluation_items), не от
--   клиента. Номерата не се преизползват — изтритите оставят дупки. Над 9999
--   номерът продължава с 5 цифри (lpad би отрязал и дал дубликат).
-- - revaluation_unit_counters — броячът. Без достъп за anon/authenticated:
--   тригерът е SECURITY DEFINER и пише сам. RLS включено, без политики.
-- - revaluation_items.photos — публичните адреси на снимките на реда
--   (bucket 'bulletin-files', префикс 'revaluation/'). Махане на снимка =
--   само от масива, файлът остава. NULL = няма снимки.
--
-- ПРАВА. revaluation_units: RLS + политики select / insert / delete за anon
-- (както revaluation_items). UPDATE няма — номерът не се пипа. DELETE е
-- изричен grant: default privileges от 04.11.2026 не го дават на нова
-- таблица; таблицата е и в DELETE_ALLOWED (tests/delete-tables-whitelist.test.js).
--
-- ЗАВАРЕНИТЕ ДАННИ (т.9, 23.11.2026): бланки draft / submitted / approved без
-- номера — 1 (Шумен, submitted), 7 реда, всичките БР → 10 номера.
-- processed бланките (55 реда) НЕ се номерират. Номерирането — отделна data
-- миграция след тази.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push-а на кода — revaluation.js чете
-- revaluation_units при отваряне на бланка.
--
-- Огледало (Живко): редове в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261123201403_revaluation_units_down.sql
--   drop trigger if exists trg_revaluation_unit_no on public.revaluation_units;
--   drop function if exists public.assign_revaluation_unit_no();
--   drop table if exists public.revaluation_units;
--   drop table if exists public.revaluation_unit_counters;
--   alter table public.revaluation_items drop column if exists photos;

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
