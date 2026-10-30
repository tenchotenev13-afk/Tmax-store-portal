-- Товарни листи — почистване на дубликатите в лист d1002304 (Добрич → Шумен, 27.10.2026)
-- Сесия loading-dedupe-shumen, 30.10.2026. Корекция на ДАННИ, не на схемата.
--
-- Причина: до b4cdfdb прегледът на склада режеше на 1000 реда (PostgREST),
-- редовете над ~позиция 35 не се виждаха и всяко „Запази" (14 пъти, 27.10
-- 15:35–16:23) добавяше нов комплект. Листът е sent, 106 реда, трябва 43.
--
-- Остават: позиции 1–34 (по един ред, не се пипат), позиция 35 = насипът
-- 00bff65f, позиции 36–43 = последният запис (16:23:49). Трият се останалите
-- 63 реда. pallet_total = 15 за палетите на листа (1–13 бяха „/14").
--
-- Решение на Тенчо 30.10 (вариант А): палетите са 15 — последният екран на
-- склада (16:22, имейлът на Димитър) показва 1–13 + двата с ламперия.
-- „16" и „17" са копия от повторното въвеждане. Отметките „получено" се
-- сверяват по единица (вид + №): преди 19 получени единици (палети 1–17,
-- насип, руло 4), след — 17 (палети 1–15, насип, руло 4). Отметките на
-- Шумен по палети 16 и 17 се трият заедно с копията и стоят в резервната
-- таблица.
--
-- Резервна таблица: public.loading_items_bak_20261030_shumen — всичките 106
-- реда преди промяната. RLS включено без политики + revoke от anon /
-- authenticated: таблицата е в public и иначе би се чела с публичния ключ.
-- Не е за огледалото (няма ред за Живко). Дроп след ~14.11.2026.

-- ═══ МИГРАЦИЯ (прилага се с apply_migration, име loading_dedupe_shumen) ═══

do $$
declare
  v_list uuid := 'd1002304-81bc-48db-8a7c-7458c5ecb86d';
  v_keep_hi uuid[] := array[
    '00bff65f-4790-4051-97fc-0a633bae97b8',  -- 35 насип, крепежи
    '76e3abf0-ad93-47d9-b088-aea5f927ce1a',  -- 36 палет 14 Ламперия
    'd37d6e0b-e32c-4a75-9216-69e81e454346',  -- 37 палет 15 Ламперия
    '1ad07efd-3075-4b1f-b419-eb8575cd4aa2',  -- 38 руло 1 57572
    '4b117702-dc9d-4c4b-96f2-f4d4bd07822e',  -- 39 руло 2 87677
    'a0a08506-731e-4738-bf4e-bc84d149b66c',  -- 40 руло 3 93448
    'edde2094-5206-40e0-9f97-d86c697fdc2b',  -- 41 руло 4 93450
    'f03a1f6d-0747-41ac-be0b-7aba266e1950',  -- 42 руло 5 102716
    'f1524b54-2deb-40ec-a1d7-79f408236947'   -- 43 руло 6 105356
  ]::uuid[];
  n_total int; n_keep int; n_del int; n_hi int; n_block int; n_rcv int; n_done int;
begin
  -- Гардове: нещо разминато → exception, нищо не се прилага.
  select count(*) into n_total from loading_list_items where list_id = v_list;
  select count(*) into n_keep from loading_list_items
    where list_id = v_list and (position <= 34 or id = any(v_keep_hi));
  select count(*) into n_hi from loading_list_items
    where list_id = v_list and id = any(v_keep_hi);
  n_del := n_total - n_keep;
  if n_total <> 106 or n_keep <> 43 or n_del <> 63 or n_hi <> 9 then
    raise exception 'разминаване: общо % / остават % / трият се % / горни %', n_total, n_keep, n_del, n_hi;
  end if;
  select count(*) into n_block from loading_list_items i
    where i.list_id = v_list and not (i.position <= 34 or i.id = any(v_keep_hi))
      and (coalesce(i.store_comment, '') <> '' or i.missing or i.approval_status is not null
           or exists (select 1 from loading_list_products p where p.item_id = i.id)
           or exists (select 1 from transfer_cargo t where t.loading_item_id = i.id));
  if n_block <> 0 then
    raise exception '% реда за изтриване имат коментар / липса / одобрение / артикули / трансфер', n_block;
  end if;
  -- Шумен може да отмята в момента: нова отметка върху копие не бива да се
  -- губи тихо. Към 30.10 (сверено преди) — точно 36.
  select count(*) into n_rcv from loading_list_items
    where list_id = v_list and not (position <= 34 or id = any(v_keep_hi)) and received;
  if n_rcv <> 36 then
    raise exception 'редовете за изтриване с received=true са % вместо 36', n_rcv;
  end if;

  -- 1. Резервно копие на целия лист (106 реда).
  create table public.loading_items_bak_20261030_shumen as
    select * from loading_list_items where list_id = v_list;
  alter table public.loading_items_bak_20261030_shumen enable row level security;
  revoke all on public.loading_items_bak_20261030_shumen from anon, authenticated;

  -- 2. Изтриване по list_id + списъка за оставане (не по позиция).
  delete from loading_list_items
    where list_id = v_list and not (position <= 34 or id = any(v_keep_hi));
  get diagnostics n_done = row_count;
  if n_done <> 63 then raise exception 'изтрити % вместо 63', n_done; end if;

  -- 3. pallet_total = 15 за палетите на листа.
  update loading_list_items set pallet_total = 15
    where list_id = v_list and kind = 'pallet' and pallet_total is distinct from 15;
end $$;

-- ═══ ROLLBACK (ръчно, през execute_sql; само докато резервната таблица я има) ═══
--
-- begin;
-- insert into loading_list_items
--   select b.* from public.loading_items_bak_20261030_shumen b
--   where not exists (select 1 from loading_list_items i where i.id = b.id);
-- update loading_list_items i set pallet_total = b.pallet_total
--   from public.loading_items_bak_20261030_shumen b
--   where i.id = b.id and i.pallet_total is distinct from b.pallet_total;
-- -- проверка: 106 реда в листа, pallet_total като в b
-- select count(*) from loading_list_items where list_id = 'd1002304-81bc-48db-8a7c-7458c5ecb86d';
-- commit;
--
-- select b.* разчита колоните на loading_list_items да са в същия ред като
-- при създаването на копието. Добавена ли е колона междувременно — изброй
-- колоните изрично. Дропът след ~14.11:
-- drop table public.loading_items_bak_20261030_shumen;
