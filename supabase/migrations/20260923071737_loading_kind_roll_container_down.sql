-- Rollback на 20260923071737_loading_kind_roll_container.sql
--
-- ВНИМАНИЕ — стесняването ГЪРМИ, ако има ред с kind='roll_container'.
-- Преброй ПРЕДИ отката:
--   select count(*) from public.loading_list_items where kind = 'roll_container';
-- Различно от нула значи решение на човек какво става с тези редове (палет
-- ли са, или руло). Нарочно НЯМА UPDATE тук: мълчаливо пренаписване на вида
-- при откат е точно промяната, която после никой не може да проследи — редът
-- би станал „палет" и би влязъл в чужда номерация.
--
-- Преди пускане: върни loading.js отпреди Пакет Г1. Клиентът предлага
-- „🛒 Рол контейнер" в падащото меню; при стеснен CHECK записът на такъв ред
-- връща 409 и черновата не се записва.
--
-- Огледалото на Живко не носи value CHECK-ове → нищо за правене там.

alter table public.loading_list_items
  drop constraint loading_list_items_kind_check;

alter table public.loading_list_items
  add constraint loading_list_items_kind_check
    check (kind in ('pallet', 'roll', 'bulk'));

comment on column public.loading_list_items.kind is
  'pallet | roll | bulk. При pallet се пълнят pallet_no и pallet_total; при другите два те остават NULL.';
