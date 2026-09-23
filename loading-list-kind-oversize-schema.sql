-- Приложено в Supabase на 23.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_kind_oversize (version 20260923090000)
--
-- „рол контейнер" става „извънгабаритен товар".
--
-- Файлът е записан СЛЕД прилагането. Обратното четене потвърди:
--   loading_list_items_kind_check =
--     CHECK ((kind = ANY (ARRAY['pallet'::text,'oversize'::text,
--                               'roll'::text,'bulk'::text])))
--
-- Правило 9 (проверено непосредствено преди прилагането):
--   loading_list_items = 8 реда — 7 'pallet' и 1 'roll', НУЛА 'roll_container'.
--   Видът е въведен по-рано СЪЩИЯ ден (20260923071737) и още не е ползван,
--   тоест UPDATE-ът долу не пипа нито един ред и стесняването на CHECK-а не
--   може да гръмне.
--
-- ЗАЩО ПРЕИМЕНУВАНЕ, А НЕ ВТОРА СТОЙНОСТ
-- Количката на колела се оказа частен случай. Това, което складът наистина
-- трябва да отдели от палета, е ВСЯКО нещо, което не се вози на палет —
-- стелажи, ламперия, дълги профили. Две стойности за едно и също нещо биха
-- дали два начина да се опише един товар и нито един да се преброи.
--
-- ПОВЕДЕНИЕТО НЕ СЕ ПРОМЕНЯ: 'oversize' се номерира като палет, но със своя
-- поредица в рамките на обекта, и получава свой печатен опис — точно както
-- 'roll_container' дотук. Смени се ключът и етикетът, нищо друго.
--
-- UPDATE-ът е ПРЕДИ смяната на CHECK-а нарочно. Обратният ред би гръмнал в
-- мига, в който някой ден има такъв ред.
--
-- ЗАДЪЛЖИТЕЛНОТО ОПИСАНИЕ НЕ Е CHECK. За 'oversize' warehouse_comment е
-- задължителен („какъв е товарът"), но изискването живее в клиента: базата не
-- може да различи „складът още пише черновата" от „складът приключи, без да
-- напише". CHECK тук би направил невъзможен самия процес на писане.
--
-- За Живко: НОВА СТОЙНОСТ на съществуващ CHECK → нищо за правене (правилото
-- му — огледалото не носи value CHECK-ове).
-- Бележка: claude/loading-kind-oversize-2026-09-23.md
-- Копие на DDL-а в корена: loading-list-kind-oversize-schema.sql
--
-- Rollback: supabase/migrations/20260923090000_loading_kind_oversize_down.sql

update public.loading_list_items
   set kind = 'oversize'
 where kind = 'roll_container';

alter table public.loading_list_items
  drop constraint loading_list_items_kind_check;

alter table public.loading_list_items
  add constraint loading_list_items_kind_check
    check (kind in ('pallet', 'oversize', 'roll', 'bulk'));

comment on column public.loading_list_items.kind is
  'pallet | oversize | roll | bulk. При pallet и oversize се пълнят pallet_no и pallet_total — всеки вид със СВОЯ поредица в рамките на обекта; при roll и bulk остават NULL. За oversize warehouse_comment е задължителен (какъв е товарът) — изискването се налага в клиента, не с CHECK.';
