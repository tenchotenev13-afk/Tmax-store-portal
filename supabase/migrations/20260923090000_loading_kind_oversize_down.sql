-- Rollback на 20260923090000_loading_kind_oversize.sql
--
-- Връща ключа 'oversize' обратно на 'roll_container'. За разлика от обикновен
-- откат на CHECK, тук се ПРЕИМЕНУВАТ и данните — иначе стесняването ГЪРМИ при
-- всеки заварен ред 'oversize'.
--
-- Преброй ПРЕДИ отката, за да знаеш какво пипаш:
--   select count(*) from public.loading_list_items where kind = 'oversize';
--
-- Откатът е смислен САМО заедно с връщане на loading.js отпреди тази промяна.
-- Порталът предлага „📐 Извънгабаритен" в падащото меню; при стеснен CHECK
-- записът на такъв ред връща 409 и черновата не се записва.
--
-- ВНИМАНИЕ ЗА СЪДЪРЖАНИЕТО: 'roll_container' значи „количка на колела", а
-- 'oversize' значи „всичко, което не се вози на палет". Преименуването назад
-- е вярно като ключ и НЕВЯРНО като смисъл за всеки ред, който описва стелаж
-- или ламперия. Затова редовете не се пипат мълчаливо — числото отгоре
-- трябва да бъде погледнато от човек.
--
-- Огледалото на Живко не носи value CHECK-ове → нищо за правене там.

update public.loading_list_items
   set kind = 'roll_container'
 where kind = 'oversize';

alter table public.loading_list_items
  drop constraint loading_list_items_kind_check;

alter table public.loading_list_items
  add constraint loading_list_items_kind_check
    check (kind in ('pallet', 'roll_container', 'roll', 'bulk'));

comment on column public.loading_list_items.kind is
  'pallet | roll_container | roll | bulk. При pallet и roll_container се пълнят pallet_no и pallet_total — всеки вид със СВОЯ поредица в рамките на обекта; при roll и bulk остават NULL.';
