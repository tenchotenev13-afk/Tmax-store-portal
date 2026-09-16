-- Зареждане (Етап 1): бланки за седмично попълване от обектите.
-- supply_templates -> supply_template_items -> supply_entries (по обект и седмица).
--
-- RLS: включено и на трите. anon: select на всичко; insert/update само на
-- supply_entries; БЕЗ delete. Шаблоните и артикулите са само за четене -
-- редакцията им е Етап 3. Изричен компромис: записите не са вързани към
-- обекта на пишещия (anon ключът е общ) - подробности в supply-schema.sql.
--
-- Seed: шаблон 'colorants' + 58 артикула. target_stores се взема от
-- users.store_name; гардът пада, ако някое от 13-те имена липсва.
--
-- Файлът е записан СЛЕД прилагането (версията се дава при apply_migration).
-- SQL-ът отдолу е сверен машинно (md5 256c7a71… + дължина 7734) със
-- statements в supabase_migrations.schema_migrations.
--
-- Три нови таблици -> огледалото (Живко).
-- Rollback: supabase/migrations/20260916194826_supply_templates_down.sql

create table public.supply_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  col1_label text not null,
  col2_label text,
  target_stores text[],
  instructions text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.supply_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.supply_templates(id) on delete cascade,
  sap_code text,
  name text not null,
  supplier text,
  active boolean default true,
  sort_order int default 0
);

create table public.supply_entries (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.supply_templates(id),
  item_id uuid references public.supply_template_items(id),
  store_name text not null,
  week_start date not null,
  qty1 int,
  qty2 int,
  created_by text,
  created_at timestamptz default now(),
  updated_by text,
  updated_at timestamptz,
  constraint supply_entries_item_store_week unique (item_id, store_name, week_start)
);

comment on table public.supply_templates is 'Зареждане: бланка за седмично попълване от обектите (напр. Колоранти). target_stores null = всички обекти.';
comment on column public.supply_entries.week_start is 'Понеделникът на ISO седмицата, за която е попълнено.';
comment on column public.supply_entries.qty1 is 'Стойност по col1_label на шаблона; null = непопълнено (НЕ 0).';

-- RLS: включено. anon чете трите; пише (insert/update) само supply_entries.
-- БЕЗ delete политика. Шаблоните и артикулите са само за четене до Етап 3.
alter table public.supply_templates enable row level security;
alter table public.supply_template_items enable row level security;
alter table public.supply_entries enable row level security;

create policy supply_templates_select on public.supply_templates
  for select to anon using (true);
create policy supply_template_items_select on public.supply_template_items
  for select to anon using (true);
create policy supply_entries_select on public.supply_entries
  for select to anon using (true);
create policy supply_entries_insert on public.supply_entries
  for insert to anon with check (true);
create policy supply_entries_update on public.supply_entries
  for update to anon using (true) with check (true);

-- SEED: шаблон „Колоранти". target_stores се взема от users.store_name
-- (case-insensitive), не се преписва на ръка; ако някое от 13-те имена липсва,
-- миграцията пада, вместо да запише непълен списък.
do $$
declare
  want text[] := array['Петрич','Враца','Монтана','Пирдоп','Кърджали','Троян','Търговище','Карлово','Сливен','Шумен','Гоце Делчев','Севлиево','Козлодуй'];
  found text[];
  tid uuid;
begin
  select array_agg(m.store_name order by w.ord) into found
  from unnest(want) with ordinality as w(n, ord)
  cross join lateral (
    select distinct u.store_name from public.users u
    where lower(u.store_name) = lower(w.n)
  ) m;

  if coalesce(array_length(found,1),0) <> array_length(want,1) then
    raise exception 'supply seed: намерени % от % обекта: %', coalesce(array_length(found,1),0), array_length(want,1), found;
  end if;

  insert into public.supply_templates (name, slug, col1_label, col2_label, target_stores, instructions, sort_order)
  values ('Колоранти', 'colorants', 'Брой за поръчка', null, found,
          'Броят се всички налични бутилки в търговска зала и склад. Ако нямате — 0.', 0)
  returning id into tid;

  insert into public.supply_template_items (template_id, sort_order, sap_code, name, supplier)
  select tid, v.ord, v.sap, v.nm, v.sup from (values
    (1, '39801', 'КОЛОРАНТ WB1 BLUE 1Л', 'ВАМКО ООД'),
    (2, '39802', 'КОЛОРАНТ WB3 LIGHT BLUE 1Л', 'ВАМКО ООД'),
    (3, '39803', 'КОЛОРАНТ WBG1 GREEN 1Л', 'ВАМКО ООД'),
    (4, '39804', 'КОЛОРАНТ WO3 ORANGE 1Л', 'ВАМКО ООД'),
    (5, '39805', 'КОЛОРАНТ WR2 CLEAR RED 1Л', 'ВАМКО ООД'),
    (6, '39806', 'КОЛОРАНТ WR5 ROSE RED 1Л', 'ВАМКО ООД'),
    (7, '39807', 'КОЛОРАНТ WRI RED OXIDE 1Л', 'ВАМКО ООД'),
    (8, '39808', 'КОЛОРАНТ WTR TRANSPARENT RED 1Л', 'ВАМКО ООД'),
    (9, '39809', 'КОЛОРАНТ WTY TRANSPARENT YELLOW 1Л', 'ВАМКО ООД'),
    (10, '39810', 'КОЛОРАНТ WV1 VIOLET 1Л', 'ВАМКО ООД'),
    (11, '39811', 'КОЛОРАНТ WV2 PURPLE 1Л', 'ВАМКО ООД'),
    (12, '39812', 'КОЛОРАНТ WW1 WHITE 1Л', 'ВАМКО ООД'),
    (13, '39813', 'КОЛОРАНТ WY1 YELLOW OXIDE 1Л', 'ВАМКО ООД'),
    (14, '39814', 'КОЛОРАНТ WY2 YELLOW 1Л', 'ВАМКО ООД'),
    (15, '39815', 'КОЛОРАНТ WY3 LIGHT YELLOW 1Л', 'ВАМКО ООД'),
    (16, '63211', 'КОЛОРАНТ WZ1 BLACK 1Л', 'ВАМКО ООД'),
    (17, '62960', 'КОЛОРАНТ COLTEC BLACK XS 1Л', 'ОРГАХИМ ЕАД'),
    (18, '62961', 'КОЛОРАНТ COLTEC BLUE LS 1 Л', 'ОРГАХИМ ЕАД'),
    (19, '62962', 'КОЛОРАНТ COLTEC BLUE RS 1 Л', 'ОРГАХИМ ЕАД'),
    (20, '62963', 'КОЛОРАНТ COLTEC GREEN PS 1 Л', 'ОРГАХИМ ЕАД'),
    (21, '62964', 'КОЛОРАНТ COLTEC MAGENTA BS 1 Л', 'ОРГАХИМ ЕАД'),
    (22, '62965', 'КОЛОРАНТ COLTEC ORANGE US-N 1 Л', 'ОРГАХИМ ЕАД'),
    (23, '62966', 'КОЛОРАНТ COLTEC RED NS 1 Л', 'ОРГАХИМ ЕАД'),
    (24, '62967', 'КОЛОРАНТ COLTEC RED OXIDE YS 1 Л', 'ОРГАХИМ ЕАД'),
    (25, '62968', 'КОЛОРАНТ COLTEC RED VS 1 Л', 'ОРГАХИМ ЕАД'),
    (26, '62969', 'КОЛОРАНТ COLTEC WHITE KU 1 Л', 'ОРГАХИМ ЕАД'),
    (27, '62970', 'КОЛОРАНТ COLTEC WS 1 Л', 'ОРГАХИМ ЕАД'),
    (28, '62971', 'КОЛОРАНТ COLTEC YELLOW MS 1 Л', 'ОРГАХИМ ЕАД'),
    (29, '62972', 'КОЛОРАНТ COLTEC YELLOW OXID TS 1 Л', 'ОРГАХИМ ЕАД'),
    (30, '62973', 'КОЛОРАНТ COLTEC YELLOW QS 1 Л', 'ОРГАХИМ ЕАД'),
    (31, '39816', 'КОЛОРАНТ КРАФТ 07 КЕРЕМИД.ЧЕРВЕН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (32, '63223', 'КОЛОРАНТ KRAFT 01 ЯРКО ЖЪЛТ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (33, '63224', 'КОЛОРАНТ KRAFT 02 ОРАНЖ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (34, '63225', 'КОЛОРАНТ KRAFT 03 ЧЕРЕН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (35, '63226', 'КОЛОРАНТ KRAFT 04 ОХРА 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (36, '63227', 'КОЛОРАНТ KRAFT 05 НАСИТЕНО ЗЕЛЕН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (37, '63228', 'КОЛОРАНТ KRAFT 06 НАСИТЕНО СИН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (38, '63229', 'КОЛОРАНТ KRAFT 07 КЕРЕМИДЕНО ЧЕРВЕН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (39, '63230', 'КОЛОРАНТ KRAFT 08 ЯРКО ОРАНЖЕВ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (40, '63231', 'КОЛОРАНТ KRAFT 09 ЖЪЛТ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (41, '63232', 'КОЛОРАНТ KRAFT 10 ЛИЛАВ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (42, '63233', 'КОЛОРАНТ KRAFT 11 БЯЛ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (43, '63234', 'КОЛОРАНТ KRAFT 12 ПУРПУР 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (44, '63235', 'КОЛОРАНТ KRAFT 13 ТЪМНО ОРАНЖЕВ 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (45, '63236', 'КОЛОРАНТ KRAFT 14 ЯРКО ЧЕРВЕН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (46, '63237', 'КОЛОРАНТ KRAFT 15 ЗЕЛЕН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (47, '63238', 'КОЛОРАНТ KRAFT 16 СИН 1Л', 'ДФХ БЪЛГАРИЯ ЕООД'),
    (48, '100171', 'КОЛОРАНТ NT 1G ОРГ. ЗЕЛЕН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (49, '100172', 'КОЛОРАНТ NT 2B ОРГ. СИН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (50, '100173', 'КОЛОРАНТ NT 3R ОРГ. ЧЕРВЕН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (51, '100174', 'КОЛОРАНТ NT 4Y ОРГ. ЖЪЛТ GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (52, '100175', 'КОЛОРАНТ NT 5OG МЕТ. ОКСИДНО ЗЕЛЕН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (53, '100176', 'КОЛОРАНТ NT 6OR МЕТ. ОКСИДНО ЧЕРВЕН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (54, '100177', 'КОЛОРАНТ NT 7BO МЕТ. ОКСИДНО ЧЕРЕН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (55, '100178', 'КОЛОРАНТ NT 8OY МЕТ. ОКСИДНО ЖЪЛТ GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (56, '100179', 'КОЛОРАНТ NT 9OB МЕТ. ОКСИДНО СИН GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (57, '100180', 'КОЛОРАНТ NT 10 ВИОЛЕТОВ GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД'),
    (58, '100181', 'КОЛОРАНТ NT 11 БЯЛ GBC 1Л', 'ДЖИ БИ СИ СЪРВИС ЕООД')
  ) as v(ord, sap, nm, sup);
end $$;
