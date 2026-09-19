-- Зареждане: снимки-подсказки към бланките + две нови бланки.
--
-- supply_templates.photos text[] - URL-и на снимки, показват се под указанията
-- във формата на обекта (supply.js). null / празен масив = нищо не се рендира.
--
-- Seed (гард по slug - повторно пускане не вмъква нищо):
--   floor-lm      Подови настилки (линейни метри) - 12 артикула без sap_code,
--                 две колони, за всички обекти (target_stores null);
--   cables-reels  Кабели на макара - 25 артикула, една колона, за всички
--                 обекти, 3 снимки от img/supply/ в репото (GitHub Pages).
-- Колорантите не се пипат (active=false ръчно на 19.09.2026).
--
-- Файлът е записан СЛЕД прилагането (версията се дава при apply_migration).
-- SQL-ът отдолу е сверен машинно (md5 47fc9587… + дължина 3398) със
-- statements в supabase_migrations.schema_migrations.
--
-- Нова колона -> огледалото (Живко).
-- Rollback: supabase/migrations/20260919132946_supply_photos_floor_cables_down.sql

alter table public.supply_templates add column photos text[];

comment on column public.supply_templates.photos is 'URL-и на снимки-подсказки, показват се под указанията във формата на обекта';

-- SEED: две бланки. Гард по slug: ако шаблонът вече съществува, нито той,
-- нито артикулите му се вмъкват повторно (миграцията е безопасна за повторение).
do $$
declare
  tid uuid;
begin
  insert into public.supply_templates (name, slug, col1_label, col2_label, target_stores, photos, instructions, sort_order)
  values ('Подови настилки (линейни метри)', 'floor-lm',
          'Общ брой места в търговска зала',
          'Брой за трансфер/поръчка ОБЩО (зала и склад)',
          null, null,
          'Първата колона е броят места за ролки в търговската зала. Втората — колко ролки общо трябва да се поръчат/трансферират, като се брои и складът.',
          1)
  on conflict (slug) do nothing
  returning id into tid;

  if tid is not null then
    insert into public.supply_template_items (template_id, sort_order, sap_code, name)
    select tid, v.ord, null, v.nm from (values
      (1, 'Балатум 4м.'),
      (2, 'Балатум 3м.'),
      (3, 'Балатум 1.83м.'),
      (4, 'Мокет 4м.'),
      (5, 'Мокет 2м.'),
      (6, 'Мокет 0.8м.'),
      (7, 'Изкуствена трева 4м.'),
      (8, 'Изкуствена трева 2м.'),
      (9, 'Пътеки'),
      (10, 'Мушама'),
      (11, 'Протектор за маса'),
      (12, 'Постелка за баня')
    ) as v(ord, nm);
  end if;

  tid := null;
  insert into public.supply_templates (name, slug, col1_label, col2_label, target_stores, photos, instructions, sort_order)
  values ('Кабели на макара', 'cables-reels', 'Налична макара', null, null,
          array[
            'https://tenchotenev13-afk.github.io/Tmax-store-portal/img/supply/cable-reel-1.jpg',
            'https://tenchotenev13-afk.github.io/Tmax-store-portal/img/supply/cable-reel-2.jpg',
            'https://tenchotenev13-afk.github.io/Tmax-store-portal/img/supply/cable-reel-3.jpg'
          ],
          'Попълваме само брой пластмасови или дървени макари, на които има кабел — в търговска зала и в склада. Ако нямате — пишете 0. Не попълваме „да/не“, „половин макара“ и подобни. Броят се така навити кабели независимо от цвета, размера и материала на макарата.',
          2)
  on conflict (slug) do nothing
  returning id into tid;

  if tid is not null then
    insert into public.supply_template_items (template_id, sort_order, sap_code, name)
    select tid, v.ord, v.sap, v.nm from (values
      (1, '23237', 'ПВВ-МБ1 2X1'),
      (2, '23238', 'ПВВ-МБ1 2X1.5'),
      (3, '23239', 'ПВВ-МБ1 2X2.5'),
      (4, '23240', 'ПВВ-МБ1 2X4'),
      (5, '23241', 'ПВВ-МБ1 3X1'),
      (6, '23242', 'ПВВ-МБ1 3X1.5'),
      (7, '23243', 'ПВВ-МБ1 3X2.5'),
      (8, '23270', 'ПВВ-МБ1 3X4'),
      (9, '23244', 'ШВПС 2X1'),
      (10, '23245', 'ШВПС 2X1.5'),
      (11, '23246', 'ШВПС 2X2.5'),
      (12, '23247', 'ШВПС 3X1'),
      (13, '23248', 'ШВПС 3X1.5'),
      (14, '23249', 'ШВПС 3X2.5'),
      (15, '23258', 'СВТ 2X1'),
      (16, '23304', 'СВТ 2X1.5'),
      (17, '23305', 'СВТ 2X2.5'),
      (18, '23314', 'СВТ 3X1'),
      (19, '23255', 'СВТ 3X1.5'),
      (20, '23261', 'СВТ 3X2.5'),
      (21, '23264', 'СВТ 3X4'),
      (22, '23269', 'ШВПЛ-Б 2X0.50'),
      (23, '23271', 'ШВПЛ-Б 2X0.75'),
      (24, '23283', 'ШВПЛ-Б 3X0.50'),
      (25, '23284', 'ШВПЛ-Б 3X0.75')
    ) as v(ord, sap, nm);
  end if;
end $$;
