-- 20261102095558_grafik_letters_contract — приложена 02.11.2026. Изходен файл: grafik-letters-contract-schema.sql;
-- SQL-ът е сверен машинно с приложения (md5 без коментари: 47f377f5…).

-- grafik-letters-contract-schema.sql — Работен график: буква → код според договора
-- (часове на ден) и връщане на О4 → Д5/1. Огледало на миграцията
-- supabase/migrations/20261102095558_grafik_letters_contract.sql (+ _down.sql), приложена 02.11.2026.
-- Rollback: grafik-letters-contract-schema-down.sql.
--
-- ЗАЩО (Тенчо, 02.11.2026).
-- 1) О4 → О от 01.11 беше грешно указание. О4 = къс работен ден 4 ч. (Д5/1), целта
--    НЕ се намалява — както в бланката v70 (Настройки!I12:K12) и в график.xlsx (ТРЗ,
--    Шумен 11.2026: 13 души на 8 ч. с по един Д5/1 при цел 168). В Раднево 11 души
--    на 8 ч. ползват по едно О4, за да стигнат нормата.
-- 2) Служител с 4-часов договор пише П / В — кодът е Д5/1 / Д5/2 (график.xlsx,
--    редове 37/38), и лято, и зима. В неделя 4-часов код няма → без ред → порта
--    дава предупреждение „няма код за този ден“, не код.
--
-- МОДЕЛ. Нова колона grafik_letter_map.hours_per_day: NULL = общото правило
-- (8-часов договор и всеки договор без собствени редове). Ако за договора на
-- служителя има ПОНЕ ЕДИН ред в ВТР-а, ползват се САМО тези редове — без
-- връщане към общите (иначе П в неделя би дал Д6/2 = 8 ч. на 4-часов служител).
-- Затова за 4 ч. се вписват и отсъствията (О, Б, НО — и в неделя). ЛД, ЗД, М, К
-- при 4 ч. нямат ред → предупреждение.
--
-- Уникалност: старото unique (vtr_id, letter, day_kind, valid_from) не различава
-- договора и пропуска NULL-ите → заменя се с уникален индекс с coalesce.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): grafik_rows — 0 реда (няма въведени графици), значи
-- смяната на О4 не засяга нищо записано. grafik_letter_map — 40 реда, всички с
-- hours_per_day NULL след миграцията.


do $$
declare n int;
begin
  select count(*) into n from public.grafik_letter_map;
  if n <> 40 then raise exception 'очаквани 40 реда в grafik_letter_map, намерени %', n; end if;
  select count(*) into n from public.grafik_letter_map where letter = 'О4' and code = 'О';
  if n <> 4 then raise exception 'очаквани 4 реда О4 → О, намерени %', n; end if;
end $$;

alter table public.grafik_letter_map
  add column hours_per_day numeric(3,1) check (hours_per_day is null or (hours_per_day > 0 and hours_per_day < 8));

alter table public.grafik_letter_map drop constraint grafik_letter_map_vtr_id_letter_day_kind_valid_from_key;
create unique index grafik_letter_map_uniq on public.grafik_letter_map
  (vtr_id, letter, day_kind, coalesce(hours_per_day, 0), coalesce(valid_from, '1900-01-01'::date));

-- 1) О4 → Д5/1 навсякъде (и в неделя, както Настройки!K12).
update public.grafik_letter_map set code = 'Д5/1'
 where vtr_id = '6a1d0000-0000-4000-8000-000000000001' and letter = 'О4' and hours_per_day is null;

-- 2) 4-часов договор.
insert into public.grafik_letter_map (vtr_id, letter, day_kind, code, hours_per_day)
select '6a1d0000-0000-4000-8000-000000000001', m.letter, m.dk, m.code, 4
from (values
  ('П', 'Л','Д5/1'), ('П', 'З1','Д5/1'), ('П', 'З2','Д5/1'),
  ('В', 'Л','Д5/2'), ('В', 'З1','Д5/2'), ('В', 'З2','Д5/2'),
  ('О4','Л','Д5/1'), ('О4','З1','Д5/1'), ('О4','З2','Д5/1'),
  ('О', 'Л','О'),    ('О', 'З1','О'),    ('О', 'З2','О'),    ('О', 'Н','О'),
  ('Б', 'Л','Б'),    ('Б', 'З1','Б'),    ('Б', 'З2','Б'),    ('Б', 'Н','Б'),
  ('НО','Л','Н'),    ('НО','З1','Н'),    ('НО','З2','Н'),    ('НО','Н','Н')
) as m(letter, dk, code);
