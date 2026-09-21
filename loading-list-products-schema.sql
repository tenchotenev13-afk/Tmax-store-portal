-- loading-list-products-schema.sql
-- Пакет В1 по товарните листи: АРТИКУЛИ ПО ПАЛЕТ.
-- ПРИЛОЖЕНО В SUPABASE НА 21.09.2026 (миграция 20260921065736_loading_list_products).
-- Този файл е ОГЛЕДАЛО на живата схема, не източник: сверен след
-- прилагането срещу pg_class (relacl, relrowsecurity), pg_policies,
-- pg_constraint и information_schema.columns.
-- Допълва loading-lists-schema.sql и loading-lists-missing-schema.sql —
-- трите се четат ЗАЕДНО.
--
-- ЗА КАКВО СЛУЖИ
-- „Стока на път" (goods_transit) е МЕСЕЧНА снимка — пълно зачистване и
-- наливане, последно 01.09.2026, документи до 25.08. Не е оперативен
-- източник и не знае какво е натоварено на кой палет. Товарният лист носи
-- собственото си съдържание: всеки ред (палет / руло / насип) — своите
-- артикули, защото всеки палет получава печатен опис, който се лепи на него.
--
-- ЗАЩО КЪМ РЕДА, А НЕ КЪМ ДОКУМЕНТА
-- Изходящият номер (purchase_doc) е на ниво документ. Един палет може да носи
-- няколко документа (няколко реда с един pallet_no), а един документ — да е
-- разстлан върху няколко палета. Описът е за ФИЗИЧЕСКИЯ палет, затова
-- артикулът е закачен за реда. Описът на палет събира артикулите на всички
-- редове с този pallet_no за този обект.
--
-- КОЙ ПИШЕ / КОЙ ЧЕТЕ
-- Складът — в редактора на черновата (сканер или автодопълване от
-- product_catalog). Обектът — само чете (картата си, „⚠️ Разлика"). Отмятане
-- по артикул (received_qty) е следващият пакет, В2.

-- ---------------------------------------------------------------------
-- 1. Таблицата
-- ---------------------------------------------------------------------
create table if not exists public.loading_list_products (
  id            uuid primary key default gen_random_uuid(),

  -- Изтрие ли се редът (или целият лист), артикулите му си отиват с него.
  item_id       uuid not null references public.loading_list_items(id) on delete cascade,

  -- Подредбата в рамките на реда — както ги е въвел складът. Описът се
  -- печата в този ред. Без UNIQUE: поддържа се от клиента.
  position      int not null,

  -- Кодът — без FK към product_catalog. Листът е документ към момента на
  -- товаренето, а каталогът се налива наново всеки месец.
  sap_code      text not null,

  -- КОПИЯ от каталога към момента на добавяне. НЕ се четат обратно и НЕ се
  -- синхронизират: преименуван артикул не бива да пренаписва изпратен лист.
  -- Код, който го няма в каталога, се допуска с име на ръка — складът не
  -- бива да бъде спрян.
  product_name  text not null,
  unit          text,

  -- Натовареното количество. Задължително и > 0 — пази се в клиента
  -- (llParseQty), не с CHECK (виж по-долу).
  qty           numeric not null,

  -- Брой кашони, по желание.
  cartons       int,

  -- Пакет В2 — какво е получил обектът. Сега само колона; клиентът не я пише.
  received_qty  numeric,

  created_at    timestamptz not null default now()
);

-- Артикулите на един ред — всяко четене минава оттук (embed-ът по FK).
create index if not exists loading_list_products_item_idx
  on public.loading_list_products (item_id);

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

-- CHECK-ове и UNIQUE НЯМА — нарочно, по модела на loading-lists-missing:
-- CHECK от страната на огледалото на Живко би отхвърлял редове, които в
-- Supabase са минали, и синхронизацията би спряла мълчаливо.

-- ---------------------------------------------------------------------
-- 2. Как клиентът чете и пише (за следващия, който пипа loading.js)
-- ---------------------------------------------------------------------
-- ЧЕТЕНЕ: редовете идват с артикулите си наведнъж —
--   loading_list_items?…&select=*,loading_list_products(*)
-- Втора заявка item_id=in.(…) би растяла с броя на редовете на ВСИЧКИ листи
-- на склада. Следствие: ТАБЛИЦАТА Е ЗАДЪЛЖИТЕЛНА за модула — без нея
-- PostgREST отказва цялата заявка и Товарни листи остават без нито един ред.
--
-- ЗАПИС (llWriteProducts): новите редове се вмъкват със sbPost
-- (return=minimal) и id-тата им не се връщат. Затова след записа на редовете
-- те се четат наново (id, position) и артикулите се закачат по position.
-- После: ВМЪКВАНЕ на всички артикули на листа с return=representation, и
-- едва тогава ТРИЕНЕ на по-старите с
--   item_id=in.(…)&created_at=lt.<created_at на новите>
-- Всички редове от едно INSERT получават едно и също now() (началото на
-- транзакцията), а старите са от по-ранна — часовникът на телефона не
-- участва. Обратният ред („изтрий, после вмъкни") при паднала мрежа насред
-- склада оставя палета без опис.

-- ---------------------------------------------------------------------
-- 3. RLS — идентично с другите две таблици на товарните листи
-- ---------------------------------------------------------------------
-- Живите политики са TO anon (roles = {anon}). loading-lists-schema.sql ги
-- пише без `to anon`, което би дало {public} — онзи файл не съвпада с живото
-- по този ред. Тук е изрично.
grant all on table public.loading_list_products to anon, authenticated, service_role;

alter table public.loading_list_products enable row level security;
drop policy if exists anon_all_loading_list_products on public.loading_list_products;
create policy anon_all_loading_list_products on public.loading_list_products
  as permissive for all to anon using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4. Свързано, но НЕ направено тук
-- ---------------------------------------------------------------------
-- product_catalog.ean_code НЯМА индекс: всяко сканиране чете 106 550 реда.
-- 114 реда там носят боклук вместо баркод (БР, M2, 50" — изместени колони
-- от внос); число от скенер не може да съвпадне с тях, но при почистване на
-- каталога е добре да се знае. 89 923 реални баркода, 0 дубликата
-- (21.09.2026). Решение за индекса — отделно: таблицата се пише от admin.js.

-- ---------------------------------------------------------------------
-- ОТКАТ
-- ---------------------------------------------------------------------
-- supabase/migrations/20260921065736_loading_list_products_down.sql.
-- ПЪРВО върни loading.js отпреди В1, после drop — обратният ред чупи модула.
-- След първия записан артикул откатът трие данни безвъзвратно.
