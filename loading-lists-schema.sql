-- loading-lists-schema.sql
-- Товарни листи на логистичните складове — какво е натоварено за кой обект.
-- ПРИЛОЖЕНО В SUPABASE НА 03.09.2026. Този файл е ОГЛЕДАЛО на живата схема,
-- не източник: сверен е ред по ред срещу information_schema, pg_constraint,
-- pg_indexes и pg_policy на същата дата. Прилага се повторно само на празна
-- база (create table if not exists го прави безвредно).
--
-- ЗА КАКВО СЛУЖИ
-- При експедиция складът описва какво товари: палет, руло или насипна стока,
-- за кой обект, срещу коя покупка и коя стокова разписка изчиства. Досега
-- това се водеше на хартия и по телефона — обектът разбираше какво е тръгнало
-- към него чак когато камионът дойде, а разминаването („този палет не е наш")
-- нямаше къде да се запише.
--
-- КОЙ ПИШЕ
-- Логистичният склад (потребител със store_name = точното име на склада, виж
-- LOGISTICS_WAREHOUSES в shared.js) създава и редактира собствените си листи.
-- admin и logistics могат да пишат за кой да е склад — те избират склада явно.
-- Магазинът НЕ пише по loading_lists изобщо.
--
-- КОЙ ЧЕТЕ
-- Складът — своите листи (warehouse = неговото име). Обектът — редовете,
-- адресирани до него (loading_list_items.store_name), и потвърждава
-- получаването им (received / received_by / received_at). Оттам идва и
-- индексът по (store_name, received): това е основната заявка на магазинската
-- страна и тя гледа „моето, неполученото", не целия лист.
--
-- ЗАЩО ДВЕ ТАБЛИЦИ
-- Един товарен лист е един курс на един склад за един ден и носи общите неща
-- — дата, изпълнил, статус. Редовете вътре са адресирани до РАЗНИ обекти,
-- всеки със собствено потвърждение. Едно ниво би значело или дублиране на
-- заглавието във всеки ред, или лист, който се потвърждава наведнъж от
-- когото се случи пръв.
--
-- store_name и warehouse са ТЕКСТ, не външни ключове към stores — същата
-- конвенция както в daily_turnover, kasa_reports, differences_reports и
-- bulletin таблиците. Обектите се преименуват рядко; преименуват ли се,
-- историята трябва да пази името отпреди, а не да се пренапише мълчаливо.

-- ---------------------------------------------------------------------
-- 1. Заглавие на товарния лист
-- ---------------------------------------------------------------------
create table if not exists public.loading_lists (
  id          uuid primary key default gen_random_uuid(),

  -- Името на склада ТОЧНО както е в LOGISTICS_WAREHOUSES (shared.js):
  -- „Логистичен склад Добрич" / „Логистичен склад Търговище". Не съкратено
  -- и не името на града — складът чете листите си по точно съвпадение.
  warehouse   text not null,

  -- Денят на товаренето, не денят на въвеждане. Клиентът го подава явно
  -- (локална дата), default-ът е само предпазна мрежа при вмъкване без поле.
  list_date   date not null default current_date,

  -- Кой е товарил — свободен текст, а не потребител: товари се от екип и
  -- човекът, който въвежда, невинаги е този, който е товарил.
  executed_by text,

  -- draft -> складът още пише; sent -> листът е пуснат към обектите и те
  -- го виждат; done -> всичко е потвърдено/приключено.
  status      text not null default 'draft',

  comment     text,
  created_by  text,
  created_at  timestamptz not null default now(),

  -- Моментите на двата прехода. Пазят се отделно от status, защото „кога е
  -- изпратен" е въпрос, на който самият статус не отговаря.
  sent_at     timestamptz,
  done_at     timestamptz,

  constraint loading_lists_status_check
    check (status in ('draft', 'sent', 'done'))
);

-- Основната заявка на склада: „моите листи, най-новите отгоре".
create index if not exists loading_lists_warehouse_idx
  on public.loading_lists (warehouse, list_date desc);

comment on table public.loading_lists is
  'Товарен лист на логистичен склад за един ден. Редовете са в loading_list_items и са адресирани до различни обекти.';
comment on column public.loading_lists.warehouse is
  'Точното име на склада от LOGISTICS_WAREHOUSES (shared.js). Складът чете листите си по точно съвпадение.';
comment on column public.loading_lists.status is
  'draft | sent | done. draft е видим само за склада; от sent нататък обектите виждат своите редове.';
comment on column public.loading_lists.executed_by is
  'Кой е товарил — свободен текст, не потребител: товари екип, а въвежда един човек.';

-- ---------------------------------------------------------------------
-- 2. Редовете — по един на товарна единица
-- ---------------------------------------------------------------------
create table if not exists public.loading_list_items (
  id            uuid primary key default gen_random_uuid(),

  -- Изтрие ли се листът, редовете му си отиват с него: ред без заглавие
  -- няма нито дата, нито склад, тоест е неизползваем.
  list_id       uuid not null
    references public.loading_lists(id) on delete cascade,

  -- Подредбата, както е въведена от склада. Не се разчита на created_at:
  -- редовете се записват накуп и таймстампите им съвпадат до милисекунда.
  position      int  not null,

  -- pallet -> палет (с номер „N от M"); roll -> руло; bulk -> насипна стока.
  kind          text not null,

  -- Само за kind = 'pallet': „палет 2 от 5". И двете стоят NULL при руло и
  -- насип — там номерацията не значи нищо.
  pallet_no     int,
  pallet_total  int,

  -- Документите: срещу коя покупка е тръгнала стоката и коя стокова
  -- разписка изчиства редът.
  purchase_doc  text,
  clears_doc    text,

  -- Обектът получател. Един лист адресира РАЗНИ обекти — затова полето е
  -- тук, а не в заглавието.
  store_name    text not null,

  -- Двата коментара са отделни нарочно: складът обяснява какво е натоварил,
  -- обектът — какво е заварил. Едно поле би позволило на втория да презапише
  -- първия и разминаването да изчезне.
  warehouse_comment text,
  store_comment     text,

  -- Частична пратка: с този товар тръгва само ЧАСТ от стоковия документ.
  -- Добавена на 03.09.2026, след като автозатварянето вече работеше.
  -- Без нея отмятането на палета затваряше ЦЕЛИЯ документ в goods_transit и
  -- обектът губеше следа какво още му се дължи — при 75 от 1987 чакащи реда
  -- (проверка на същата дата) частичното приемане вече е факт, не хипотеза.
  -- Стойността е на ПРАТКАТА по документа, не на отделния палет: документ
  -- върху три палета тръгва или цял, или не, затова клиентът я слага на
  -- всичките му редове наведнъж.
  partial       boolean not null default false,

  -- Потвърждението от обекта. received_by/received_at се пълнят от клиента
  -- в момента на отмятането — тригер няма.
  received      boolean not null default false,
  received_by   text,
  received_at   timestamptz,

  created_at    timestamptz not null default now(),

  constraint loading_list_items_kind_check
    check (kind in ('pallet', 'roll', 'bulk'))
);

-- Редовете на един лист (изгледът на склада).
create index if not exists loading_list_items_list_idx
  on public.loading_list_items (list_id);
-- „Моето, неполученото" — основната заявка на магазинската страна.
create index if not exists loading_list_items_store_idx
  on public.loading_list_items (store_name, received);

comment on table public.loading_list_items is
  'Една товарна единица от товарен лист: палет / руло / насип, адресирана до един обект и потвърждавана от него.';
comment on column public.loading_list_items.kind is
  'pallet | roll | bulk. При pallet се пълнят pallet_no и pallet_total; при другите два те остават NULL.';
comment on column public.loading_list_items.position is
  'Подредбата, както я е въвел складът. created_at не върши работа — редовете се записват накуп.';
comment on column public.loading_list_items.warehouse_comment is
  'Коментарът на СКЛАДА. Отделен от store_comment нарочно: обектът не бива да може да го презапише.';
comment on column public.loading_list_items.partial is
  'Частична пратка: с този палет тръгва само част от стоковия документ. Отмятането НЕ затваря документа в goods_transit.';
comment on column public.loading_list_items.received is
  'Отметката на обекта. received_by/received_at се пълнят от клиента при отмятането — няма тригер.';

-- Броят палети/рула/насип НАРОЧНО не се пази като колона в loading_lists.
-- Смята се от самите редове при рендиране. Копие в заглавието би се
-- разминало при първата редакция на ред, а разминаването не гърми — просто
-- показва грешно число, докато някой не го забележи.

-- ---------------------------------------------------------------------
-- 3. RLS — както другите таблици в проекта
-- ---------------------------------------------------------------------
-- Permissive anon политика, същата като anon_all_* по останалите таблици:
-- порталът работи с публичния anon ключ, а разделението кой какво вижда е
-- в клиента (виж „Сигурност — текущо състояние" в CLAUDE.md). Затягането
-- на достъпа е общ въпрос за целия проект, не за тези две таблици.
alter table public.loading_lists enable row level security;
drop policy if exists anon_all_loading_lists on public.loading_lists;
create policy anon_all_loading_lists on public.loading_lists
  for all using (true) with check (true);

alter table public.loading_list_items enable row level security;
drop policy if exists anon_all_loading_list_items on public.loading_list_items;
create policy anon_all_loading_list_items on public.loading_list_items
  for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- Обратимо без загуба само докато таблиците са празни. След първия въведен
-- товарен лист откатът ТРИЕ данни на склада и потвържденията на обектите —
-- тогава не е рутинна операция и иска отделно решение.
--
-- drop table if exists public.loading_list_items;
-- drop table if exists public.loading_lists;
