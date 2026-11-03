-- 20261103135820_grafik_sectors — приложена 03.11.2026. Изходен файл: grafik-sectors-schema.sql;
-- SQL-ът е сверен машинно с приложения (md5 без коментари: 7e0ac515…).

-- grafik-sectors-schema.sql — Работен график: етикети на сезоните и сектори по магазин.
-- Огледало: supabase/migrations/20261103135820_grafik_sectors.sql (+ _down.sql), приложена 03.11.2026.
-- Rollback: grafik-sectors-schema-down.sql.
--
-- ЗАЩО (Тенчо, 03.11.2026, след проверката на живо на 1г).
-- 1) „З1“ в заглавието се чете като „31“. Пълното име на сезона с часа на затваряне
--    е ДАННИ в grafik_vtr_seasons.labels ({"Л":"Лято (до 20:00)", …}), не твърд код.
--    Кодовете Л / З1 / З2 остават вътрешни (буква → код, изравняване).
--    Часовете: Настройки!C7 на бланката v70 („Л … до 20:00 · З1 … до 19:30 · З2 … до 19:00“).
--    Преди 01.11.2026 (стар ВТР) зимата е една — З2 (Д4/З 08–19), затова „Зима (до 19:00)“.
-- 2) Секторът беше свободен текст и покритието се разпадаше („Баня“ / „БАНЯ“, „Машимки“ …).
--    Нова таблица grafik_sectors — списък по магазин; grafik_staff.sector_id сочи в нея.
--    Старата колона grafik_staff.sector (текстът от бланката) НЕ се трие — остава като
--    история на импорта; екранът и покритието ползват само sector_id.
--
-- ПРАВА: както останалите grafik_* — RLS без политики, без права за anon/authenticated;
-- четене и запис само през grafik-api.
--
-- РАЗПРЕДЕЛЕНИЕТО по-долу е одобрено от Тенчо на 03.11.2026 („да“ с решения за неясните:
-- КАСА/ГЛАВЕН КАСИЕР → Каса; БОИ/РЪК.СЕКТОРИ → Бои; ПЛОЧКИ/ПЛАЦ и Плочки /плац → Плочки;
-- ХИГИЕНИСТ → нов сектор „Хигиена“ (Кърджали); Търговска зала (Раднево) → ОТЗ; Машимки → Машинки).
-- Съвпадението е по ТОЧНИЯ текст в grafik_staff.sector за магазина; NULL остава без сектор.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): grafik_staff — 60 реда (Кърджали 45, Раднево 15), всички с
-- sector_id NULL след миграцията, преди разпределението; grafik_vtr_seasons — 2 реда.


do $$
declare n int;
begin
  select count(*) into n from public.grafik_vtr_seasons;
  if n <> 2 then raise exception 'очаквани 2 реда в grafik_vtr_seasons, намерени %', n; end if;
  select count(*) into n from public.grafik_staff;
  if n <> 60 then raise exception 'очаквани 60 служители, намерени %', n; end if;
end $$;

-- ── 1) Етикети на сезоните ───────────────────────────────────────────────
alter table public.grafik_vtr_seasons add column labels jsonb;
update public.grafik_vtr_seasons set labels = '{"Л":"Лято (до 20:00)","З2":"Зима (до 19:00)"}'
 where vtr_id = '6a1d0000-0000-4000-8000-000000000001' and valid_to = '2026-10-31';
update public.grafik_vtr_seasons set labels = '{"Л":"Лято (до 20:00)","З1":"Зима 1 (до 19:30)","З2":"Зима 2 (до 19:00)"}'
 where vtr_id = '6a1d0000-0000-4000-8000-000000000001' and valid_from = '2026-11-01';

-- ── 2) Сектори ───────────────────────────────────────────────────────────
create table public.grafik_sectors (
  id         uuid primary key default gen_random_uuid(),
  store_name text not null,
  name       text not null check (length(btrim(name)) > 0),
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);
create unique index grafik_sectors_store_name_uniq on public.grafik_sectors (store_name, lower(btrim(name)));
alter table public.grafik_sectors enable row level security;
revoke all on public.grafik_sectors from anon, authenticated;

alter table public.grafik_staff add column sector_id uuid references public.grafik_sectors(id);

insert into public.grafik_sectors (store_name, name, sort_order, created_by)
select s.store, s.name, s.ord, 'migration grafik_sectors'
from (values
  ('Кърджали','Каса',10), ('Кърджали','ОТЗ',20), ('Кърджали','Склад',30), ('Кърджали','Баня',40),
  ('Кърджали','Бои',50), ('Кърджали','Градина',60), ('Кърджали','Домашни потреби',70), ('Кърджали','Машинки',80),
  ('Кърджали','Осветление',90), ('Кърджали','Плочки',100), ('Кърджали','Строителство',110), ('Кърджали','Текстил',120),
  ('Кърджали','Управление',130), ('Кърджали','Хигиена',140),
  ('Раднево','Каса',10), ('Раднево','ОТЗ',20), ('Раднево','Склад',30), ('Раднево','Баня',40),
  ('Раднево','Бои',50), ('Раднево','Домашни потреби',70), ('Раднево','Електро',75), ('Раднево','Машинки',80),
  ('Раднево','Паркет',95), ('Раднево','Плочки',100), ('Раднево','Управление',130)
) as s(store, name, ord);

-- „сегашна стойност → сектор“ — точният текст в grafik_staff.sector.
update public.grafik_staff st set sector_id = g.id
  from (values
    ('Кърджали','Баня','Баня'), ('Кърджали','БАНЯ','Баня'),
    ('Кърджали','БОИ','Бои'), ('Кърджали','БОИ/РЪК.СЕКТОРИ','Бои'),
    ('Кърджали','ГРАДИНА','Градина'),
    ('Кърджали','ДОМ.ПОТР.','Домашни потреби'),
    ('Кърджали','каса','Каса'), ('Кърджали','КАСА','Каса'), ('Кърджали','КАСА/ГЛАВЕН КАСИЕР','Каса'),
    ('Кърджали','МАШИНКИ','Машинки'),
    ('Кърджали','ОСВЕТЛЕНИЕ','Осветление'),
    ('Кърджали','ОТЗ','ОТЗ'),
    ('Кърджали','ПЛОЧКИ','Плочки'), ('Кърджали','ПЛОЧКИ/ПЛАЦ','Плочки'),
    ('Кърджали','СКЛАД','Склад'),
    ('Кърджали','СТРОИТЕЛСТВО','Строителство'),
    ('Кърджали','ТЕКСТИЛ','Текстил'),
    ('Кърджали','Управител','Управление'),
    ('Кърджали','ХИГИЕНИСТ','Хигиена'),
    ('Раднево','Баня','Баня'),
    ('Раднево','БОИ','Бои'),
    ('Раднево','Домашни потреби','Домашни потреби'),
    ('Раднево','ЕЛ. Сектор','Електро'),
    ('Раднево','Машимки','Машинки'),
    ('Раднево','ОТЗ','ОТЗ'),
    ('Раднево','Паркет','Паркет'),
    ('Раднево','Плочки /плац','Плочки'),
    ('Раднево','СКЛАД','Склад'),
    ('Раднево','Търговска зала','ОТЗ'),
    ('Раднево','Управител','Управление')
  ) as m(store, raw, sector)
  join public.grafik_sectors g on g.store_name = m.store and g.name = m.sector
 where st.store_name = m.store and st.sector = m.raw;

-- Без сектор остават само празните (Кърджали — 3).
do $$
declare n int;
begin
  select count(*) into n from public.grafik_staff where sector_id is null;
  if n <> 3 then raise exception 'очаквани 3 без сектор (празните), намерени %', n; end if;
end $$;
