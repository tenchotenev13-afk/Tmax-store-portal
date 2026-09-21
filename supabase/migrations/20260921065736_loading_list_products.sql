-- Приложено в Supabase на 21.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_list_products (version 20260921065736) — Пакет В1 „Артикули по палет"
--
-- Файлът е записан СЛЕД прилагането. Обратното четене потвърди:
--   собственик postgres, relrowsecurity = true,
--   relacl = {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--             service_role=arwdDxtm} — идентично с loading_lists и
--             loading_list_items;
--   политика anon_all_loading_list_products: PERMISSIVE, roles {anon}, ALL,
--             qual true, with_check true;
--   loading_list_products_item_id_fkey: FOREIGN KEY (item_id) REFERENCES
--             loading_list_items(id) ON DELETE CASCADE — ЕДИНСТВЕНИЯТ FK към
--             loading_list_items, тоест embed-ът е еднозначен;
--   индекси loading_list_products_pkey и loading_list_products_item_idx.
-- Embed-ът е проверен срещу живия PostgREST с anon ключа:
--   loading_list_items?select=id,position,loading_list_products(*)
--   върна трите заварени реда с loading_list_products = [].
--
-- Нова таблица → огледалото (Живко): mirror-schema.sql и $TableColumns в
-- sync-mirror.ps1. Бележката е в claude/loading-list-products-2026-09-21.md.
-- Копие на DDL-а в корена: loading-list-products-schema.sql
--
-- Rollback: supabase/migrations/20260921065736_loading_list_products_down.sql
--
-- Правило 9 (проверено на 21.09.2026 със SELECT, преди прилагане):
--   loading_list_products — нова, 0 реда → NOT NULL и FK не обезсилват нищо;
--   loading_list_items = 3 реда, loading_lists = 2 реда — не се пипат (на
--   20.09.2026 бяха 0: първият реален лист е влязъл между двете проверки).
--   Името loading_list_products беше свободно — без таблица, изглед,
--   последователност, индекс, тип, функция или политика с това име.
--
-- ЗАЩО product_name / unit са КОПИЯ, а не FK към product_catalog:
-- листът е документ за това какво е натоварено ТОГАВА. Каталогът се налива
-- наново всеки месец; преименуван или изтрит артикул не бива да пренаписва
-- вече изпратен лист. sap_code също е без FK — по същата причина и защото
-- огледалото копира редове през PostgREST без гаранция за реда на таблиците.
--
-- ЗНАЕ СЕ И НЕ СЕ НАЛАГА ОТ БАЗАТА: няма CHECK за qty > 0, cartons >= 0,
-- received_qty <= qty и няма UNIQUE (item_id, position). Нарочно, по модела
-- на loading_missing: CHECK от страната на огледалото би отхвърлял редове,
-- които в Supabase са минали. Правилата живеят в клиента (llParseQty,
-- llParseCartons в loading.js).
--
-- on delete cascade: изтрит ред от loading_list_items (а чрез него и изтрит
-- лист) изтрива артикулите му. Клиентът трие ред само при изрично махане от
-- черновата. Записът на лист НЕ трие редове — съществуващите са PATCH.
-- Артикулите се ЗАМЕНЯТ при запис с „вмъкни новите, после изтрий по-старите
-- по created_at" — виж llWriteProducts: паднала мрежа по средата оставя
-- дубликат, не празен палет.
--
-- RLS: permissive, TO anon — ИДЕНТИЧНО с живите anon_all_loading_lists и
-- anon_all_loading_list_items. Внимание: loading-lists-schema.sql пише техните
-- политики БЕЗ `to anon` (би дало {public}) — живата база не съвпада с онзи
-- файл; тук `to anon` е изрично. Компромисът е известният за целия проект:
-- всичко видимо за anon е публично, включително количествата по обекти.
--
-- ИНДЕКС ПО product_catalog.ean_code НЯМА и не е част от тази миграция. Всяко
-- сканиране е последователно четене на 106 550 реда. Отделно решение — таблицата
-- се пише от admin.js и налива от Цвети.

create table public.loading_list_products (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.loading_list_items(id) on delete cascade,
  position      int not null,
  sap_code      text not null,
  product_name  text not null,
  unit          text,
  qty           numeric not null,
  cartons       int,
  received_qty  numeric,
  created_at    timestamptz not null default now()
);

create index loading_list_products_item_idx
  on public.loading_list_products (item_id);

grant all on table public.loading_list_products to anon, authenticated, service_role;

alter table public.loading_list_products enable row level security;

create policy anon_all_loading_list_products on public.loading_list_products
  as permissive
  for all
  to anon
  using (true)
  with check (true);

comment on table public.loading_list_products is
  'Артикули по ред (палет/руло/насип) от товарен лист. Пакет В1, 21.09.2026. Ред се трие каскадно с реда от loading_list_items.';
comment on column public.loading_list_products.item_id is
  'Редът от loading_list_items, към който е артикулът. on delete cascade.';
comment on column public.loading_list_products.position is
  'Подредба в рамките на item_id. Без UNIQUE — редът се поддържа от клиента.';
comment on column public.loading_list_products.sap_code is
  'SAP код на артикула. Без FK към product_catalog — листът е документ към момента на товаренето.';
comment on column public.loading_list_products.product_name is
  'КОПИЕ на product_catalog.product_name към момента на добавяне. Не се чете обратно и не се синхронизира с каталога.';
comment on column public.loading_list_products.unit is
  'КОПИЕ на product_catalog.default_unit към момента на добавяне.';
comment on column public.loading_list_products.qty is
  'Натоварено количество. Без CHECK в базата — валидацията е в клиента (loading.js).';
comment on column public.loading_list_products.cartons is
  'Брой кашони, по желание.';
comment on column public.loading_list_products.received_qty is
  'Получено количество — за Пакет В2. В В1 е само колона, клиентът не я пише.';
