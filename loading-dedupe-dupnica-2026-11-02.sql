-- Товарни листи — почистване на дубликатите в лист fe0bae6b (Добрич → Пирдоп +
-- Дупница, 30.10.2026) и възстановяване на изтрития документ 80481348.
-- Сесия loading-dedupe-dupnica, 02.11.2026. Корекция на ДАННИ, не на схемата.
-- Образец: loading-dedupe-shumen-2026-10-30.sql (миграция 20261030154537).
--
-- Причина: до b4cdfdb прегледът на склада режеше на 1000 реда (PostgREST),
-- складът записа листа многократно (30.10 14:38, 14:51, 15:34) и частта за
-- Дупница натрупа копия. Листът е sent, 63 реда (Пирдоп 26, Дупница 37).
--
-- Отговор на склада (Димитър, 02.11) за Дупница: 5 палета по 80481346 +
-- 80481347, 1 палет по 80481348 („3 мебели за баня и душ системи"; документът
-- е изтрит при повторните записи), 2 каш. насип, 2 палета ПВЦ панел по
-- 80480126, 1 палет ПВЦ ламперия по 80481899 — 9 палета + 2 насипа.
--
-- Пирдоп (26 реда, позиции 1–26) НЕ се пипа. От Дупница остават 16 реда с нови
-- позиции 27–42 и номера 1–9 от 9; 21 реда се трият. Към 02.11 Дупница няма
-- нито една отметка, коментар, артикул или трансфер.
--
-- Резервна таблица: public.loading_items_bak_20261102_dupnica — всичките 63
-- реда преди промяната. RLS включено без политики + revoke от anon /
-- authenticated (таблицата е в public). Не е за огледалото. Дроп след
-- ~16.11.2026.

-- ═══ МИГРАЦИЯ (apply_migration, име loading_dedupe_dupnica) ═══

do $$
declare
  v_list uuid := 'fe0bae6b-4ac7-4ddd-b9f1-fff800a10c0a';
  n_total int; n_pirdop int; n_dup int; n_other int; n_found int;
  n_block int; n_done int; v_status text;
begin
  create temp table _keep (id uuid primary key, pos int, pno int, ptotal int) on commit drop;
  insert into _keep values
    ('cd84cfaa-87c1-4ae4-bb6c-741c68090e16', 27, 1, 9),     -- палет 1  80481346
    ('a6cbc712-0cad-4b8c-a20e-8f0b55cb7b4a', 28, 1, 9),     -- палет 1  80481347
    ('ee3aab06-2ca2-4db1-ab0b-582d866d6a0c', 29, 2, 9),     -- палет 2  80481346
    ('67276caa-fd51-4cc3-a2dc-ef246c924037', 30, 2, 9),     -- палет 2  80481347
    ('aebe9760-6ee1-4058-aeb1-01d7cce3fd75', 31, 3, 9),     -- палет 3  80481346
    ('0b073866-a6bc-4538-9e70-c79b218c21d6', 32, 3, 9),     -- палет 3  80481347
    ('5d86b094-65f8-4b8c-b36e-98e213285df5', 33, 4, 9),     -- палет 4  80481346
    ('d4f382b6-8a83-453a-8f18-442bb140beb6', 34, 4, 9),     -- палет 4  80481347
    ('0a232b25-59b2-48e9-ad87-71d22984d3a6', 35, 5, 9),     -- палет 5  80481346
    ('6cf4126d-efab-48f2-a67d-e85dce74e317', 36, 5, 9),     -- палет 5  80481347
    ('67f7a2aa-dcc7-46a0-a553-71317b56ffa8', 37, 6, 9),     -- палет 6  → 80481348
    ('26b8c6e9-a673-477f-a7d7-f8465de4cbdf', 38, null, null), -- насип (PS панел)
    ('1a4715a2-2726-4f0d-ab7e-3bc8c65a9ca3', 39, null, null), -- насип (PS панел)
    ('083f8873-1806-4c27-8462-6cb963536680', 40, 7, 9),     -- палет 7  80480126 ПВЦ панел
    ('a0eeec2d-832b-4567-a0c4-69ec6b526dce', 41, 8, 9),     -- палет 8  80480126 ПВЦ панел
    ('a50bd077-51d8-4b69-beac-8daa23aff85a', 42, 9, 9);     -- палет 9  80481899 ПВЦ ламперия

  -- Гардове: нещо разминато → exception, нищо не се прилага.
  select status into v_status from loading_lists where id = v_list;
  select count(*) into n_total  from loading_list_items where list_id = v_list;
  select count(*) into n_pirdop from loading_list_items where list_id = v_list and store_name = 'Пирдоп';
  select count(*) into n_dup    from loading_list_items where list_id = v_list and store_name = 'Дупница';
  n_other := n_total - n_pirdop - n_dup;
  select count(*) into n_found from loading_list_items i join _keep k on k.id = i.id
    where i.list_id = v_list and i.store_name = 'Дупница';
  if v_status is distinct from 'sent' or n_total <> 63 or n_pirdop <> 26 or n_dup <> 37
     or n_other <> 0 or n_found <> 16 then
    raise exception 'разминаване: статус % / общо % / Пирдоп % / Дупница % / други % / намерени %',
      v_status, n_total, n_pirdop, n_dup, n_other, n_found;
  end if;
  -- Дупница е започнала да отмята или да пише → спира, нищо не се губи тихо.
  select count(*) into n_block from loading_list_items i
    where i.list_id = v_list and i.store_name = 'Дупница'
      and (i.received or i.missing or coalesce(i.store_comment, '') <> '' or i.approval_status is not null
           or exists (select 1 from loading_list_products p where p.item_id = i.id)
           or exists (select 1 from transfer_cargo t where t.loading_item_id = i.id));
  if n_block <> 0 then
    raise exception '% реда на Дупница имат отметка / липса / коментар / одобрение / артикули / трансфер', n_block;
  end if;

  -- 1. Резервно копие на целия лист (63 реда).
  create table public.loading_items_bak_20261102_dupnica as
    select * from loading_list_items where list_id = v_list;
  alter table public.loading_items_bak_20261102_dupnica enable row level security;
  revoke all on public.loading_items_bak_20261102_dupnica from anon, authenticated;

  -- 2. Изтриване: list_id + Дупница + не в списъка за оставане.
  delete from loading_list_items
    where list_id = v_list and store_name = 'Дупница' and id not in (select id from _keep);
  get diagnostics n_done = row_count;
  if n_done <> 21 then raise exception 'изтрити % вместо 21', n_done; end if;

  -- 3. Нови позиции и номера на 16-те реда; за палет 6 — документът 80481348.
  update loading_list_items i
    set position = k.pos, pallet_no = k.pno, pallet_total = k.ptotal
    from _keep k
    where i.id = k.id and i.list_id = v_list;
  get diagnostics n_done = row_count;
  if n_done <> 16 then raise exception 'обновени % вместо 16', n_done; end if;
  update loading_list_items
    set purchase_doc = '80481348', warehouse_comment = '3 мебели за баня и душ системи'
    where id = '67f7a2aa-dcc7-46a0-a553-71317b56ffa8' and list_id = v_list;
  get diagnostics n_done = row_count;
  if n_done <> 1 then raise exception 'палет 6: обновени % вместо 1', n_done; end if;

  select count(*) into n_total from loading_list_items where list_id = v_list;
  if n_total <> 42 then raise exception 'остават % вместо 42', n_total; end if;
end $$;

-- ═══ ROLLBACK (ръчно, през execute_sql; само докато резервната таблица я има) ═══
--
-- begin;
-- insert into loading_list_items
--   select b.* from public.loading_items_bak_20261102_dupnica b
--   where not exists (select 1 from loading_list_items i where i.id = b.id);
-- update loading_list_items i
--   set position = b.position, pallet_no = b.pallet_no, pallet_total = b.pallet_total,
--       purchase_doc = b.purchase_doc, warehouse_comment = b.warehouse_comment
--   from public.loading_items_bak_20261102_dupnica b
--   where i.id = b.id;
-- -- проверка: 63 реда в листа
-- select count(*) from loading_list_items where list_id = 'fe0bae6b-4ac7-4ddd-b9f1-fff800a10c0a';
-- commit;
--
-- select b.* разчита колоните на loading_list_items да са в същия ред като
-- при създаването на копието. Добавена ли е колона междувременно — изброй
-- колоните изрично. Дропът след ~16.11:
-- drop table public.loading_items_bak_20261102_dupnica;
