-- loading-list-kind-roll-container-schema.sql
-- Пакет Г1: нов вид товарна единица „рол контейнер".
-- ПРИЛОЖЕНО В СУПАБЕЙС НА 23.09.2026
-- (миграция 20260923071737_loading_kind_roll_container).
-- Този файл е ОГЛЕДАЛО на живата схема, не източник — сверен след
-- прилагането срещу pg_constraint.
-- Чете се ЗАЕДНО с loading-lists-schema.sql, loading-lists-missing-schema.sql
-- и loading-list-products-schema.sql.
--
-- НЯМА нова таблица, НЯМА нова колона, НЯМА индекс. Само CHECK-ът върху
-- loading_list_items.kind получава четвърта стойност.
--
-- ЗА КАКВО СЛУЖИ
-- Рол контейнерът (количката на колела) се товари, вози и приема като
-- отделна физическа единица и получава свой печатен опис — както палета.
-- Дотук складът нямаше как да го отбележи: минаваше за палет или за „насип".
--
-- НОМЕРАЦИЯТА Е ОТДЕЛНА ПОРЕДИЦА
-- В клиента (llRenumberPallets) ключът е ОБЕКТ + ВИД. „Палет 2 от 5" и
-- „рол контейнер 2 от 3" са две различни обещания към един и същ обект.
-- Обща поредица би дала „палет 4 от 8" при четири палета и четири
-- контейнера — число, което не отговаря на нищо на рампата.
-- Затова и препратката към единица за печат на опис носи вида:
-- „1" = палет 1, „rc1" = рол контейнер 1.

alter table public.loading_list_items
  drop constraint if exists loading_list_items_kind_check;

alter table public.loading_list_items
  add constraint loading_list_items_kind_check
    check (kind in ('pallet', 'roll_container', 'roll', 'bulk'));

comment on column public.loading_list_items.kind is
  'pallet | roll_container | roll | bulk. При pallet и roll_container се пълнят pallet_no и pallet_total — всеки вид със СВОЯ поредица в рамките на обекта; при roll и bulk остават NULL.';

-- ЗАСЕГНАТИ ЗАВАРЕНИ РЕДОВЕ: нула. Новият списък е надмножество на стария
-- (към 23.09.2026: 7 реда 'pallet', 1 ред 'roll', 0 'bulk').
--
-- ОТКАТ: supabase/migrations/20260923071737_loading_kind_roll_container_down.sql
-- Стесняването ГЪРМИ при наличен ред 'roll_container' — преброй ги преди това
-- и реши какво става с тях. Първо се връща loading.js отпреди Г1, после CHECK-ът.
