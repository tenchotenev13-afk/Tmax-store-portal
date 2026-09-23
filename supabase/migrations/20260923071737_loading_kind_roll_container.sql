-- Приложено в Supabase на 23.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_kind_roll_container (version 20260923071737) — Пакет Г1
--
-- Файлът е записан СЛЕД прилагането. Обратното четене потвърди:
--   loading_list_items_kind_check =
--     CHECK ((kind = ANY (ARRAY['pallet'::text,'roll_container'::text,
--                               'roll'::text,'bulk'::text])))
--
-- САМО НОВА СТОЙНОСТ на съществуващ CHECK. Няма нова таблица, няма нова
-- колона, няма индекс. По правилото на Живко огледалото не носи value
-- CHECK-ове → за него няма нищо за правене. Бележка:
-- claude/loading-kind-roll-container-2026-09-23.md
-- Копие на DDL-а в корена: loading-list-kind-roll-container-schema.sql
--
-- Rollback: supabase/migrations/20260923071737_loading_kind_roll_container_down.sql
--
-- Правило 9 (проверено непосредствено преди прилагане):
--   loading_list_items = 8 реда — 7 pallet, 1 roll; нито един не става
--   невалиден, защото новият списък е НАДМНОЖЕСТВО на стария
--   (pallet|roll|bulk ⊂ pallet|roll_container|roll|bulk).
--   loading_lists = 4 реда, loading_list_products = 5 — не се пипат.
--
-- ЗАЩО ОТДЕЛЕН ВИД, А НЕ „палет с бележка"
-- Рол контейнерът се товари, вози и приема като отделна физическа единица и
-- получава СВОЙ печатен опис. В клиента (loading.js) той се номерира като
-- палета, но с ОТДЕЛНА поредица в рамките на обекта: „палет 2 от 5" и
-- „рол контейнер 2 от 3" са две различни обещания. Обща поредица би дала
-- „палет 4 от 8" при четири палета и четири контейнера.
--
-- СЛЕДСТВИЕ ЗА ОПИСА: препратката към товарна единица в llPrint вече носи
-- вида — „1" е палет 1, „rc1" е рол контейнер 1. Без това палет 1 и
-- контейнер 1 на един и същ обект се смесваха в един опис.

alter table public.loading_list_items
  drop constraint loading_list_items_kind_check;

alter table public.loading_list_items
  add constraint loading_list_items_kind_check
    check (kind in ('pallet', 'roll_container', 'roll', 'bulk'));

comment on column public.loading_list_items.kind is
  'pallet | roll_container | roll | bulk. При pallet и roll_container се пълнят pallet_no и pallet_total — всеки вид със СВОЯ поредица в рамките на обекта; при roll и bulk остават NULL.';
