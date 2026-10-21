-- picking-schema.sql — под-таб „📦 Пикинг" в Транспорт (picking.js), етап 1.
-- Огледало на миграцията (версията е дадена от базата):
--   supabase/migrations/20261021090405_picking_schema.sql (+ _down.sql)
-- Ред на прилагане: схема → проверка в базата (таблици, политики) → push на
-- кода. picking.js чете таблиците при отваряне на под-таба; ако кодът е на
-- живо преди миграцията, под-табът показва грешка при зареждане.
--
-- ЗАЩО (предложение на В. Филев, 17.10.2026). Складът качва седмичните SAP
-- износи „Планиран трансфер" и „Непланиран трансфер"; порталът ги показва
-- като списък за пикинг по обект и снабдителска група, работникът отмята
-- „взето" (с корекция на броя) или „пропуснато" (с коментар), а за Данчето има
-- печатен списък на отклоненията. Етап 1 — БЕЗ сканиране, палети, износ към
-- SAP и известия. Нищо оттук не влиза в История, „Днес", имейли и отчети.
--
-- ОБЕКТ — по store_name text (конвенцията на проекта), от номера на магазина
-- в SAP през SR_SHEET_TO_STORE (stock-returns.js). warehouse е единият от
-- двата логистични склада (LOGISTICS_WAREHOUSES в shared.js).
--
-- УНИКАЛНОСТ (warehouse, sap_order, sap_item) — ОБИКНОВЕНО unique
-- ограничение, НЕ частичен индекс „where sap_order is not null". Частичният
-- не може да бъде цел на ON CONFLICT без WHERE в самия insert, а PostgREST
-- (`?on_conflict=warehouse,sap_order,sap_item`) не слага WHERE → всеки
-- импорт би върнал 42P10 „no unique or exclusion constraint matching the ON
-- CONFLICT specification" (проверено в базата на 21.10.2026 с временна
-- таблица). Обикновеното ограничение дава същото: NULL-ите са различни,
-- тоест непланираните редове (sap_order NULL) никога не се сблъскват, а
-- повторно качване на същия планиран файл не дублира.
--
-- CHECK по source и status — в Supabase; огледалото на Живко не носи value
-- CHECK-ове (в опашката не се пишат). Задължителният коментар при skipped
-- НЕ е CHECK — пази се в клиента.
--
-- ПРАВА. RLS включено; anon select / insert / update на двете таблици и
-- delete САМО на picking_batches (каскадата трие редовете). КОМПРОМИС ЗА
-- ПИЛОТА, както при loading_lists: anon ключът е общ, тоест „трие се само
-- качване без отметнат ред" и „вижда само picking_users" са проверки в
-- клиента (picking.js), не в базата. Изтриване на отделен picking_lines ред
-- през anon няма.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): таблиците са нови — 0 реда. Имената picking_*
-- и ключът app_settings.picking_users не съществуваха (проверено 21.10.2026);
-- app_settings.key е primary key → on conflict (key) е валиден.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

create table public.picking_batches (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  source text not null,
  file_name text,
  rows_total int,
  rows_imported int,
  rows_skipped int,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  constraint picking_batches_source_check check (source in ('planned','unplanned'))
);
comment on table public.picking_batches is
  'Едно качване на SAP износ „Планиран трансфер" (planned) или „Непланиран трансфер" (unplanned) за един логистичен склад.';
comment on column public.picking_batches.warehouse is 'Логистичен склад Добрич | Логистичен склад Търговище';
comment on column public.picking_batches.rows_total is 'Редове във файла (без заглавието и празните).';
comment on column public.picking_batches.rows_imported is 'Влезли в picking_lines (без вече качените).';
comment on column public.picking_batches.rows_skipped is 'За друг склад / обект→обект / непознат номер / „За трансфер" ≤ 0.';

create table public.picking_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.picking_batches(id) on delete cascade,
  warehouse text not null,
  store_name text not null,
  sap_code text not null,
  product_name text,
  unit text,
  qty_requested numeric not null,
  supply_group text,
  sap_order text,
  sap_item text,
  line_no int,
  status text not null default 'open',
  qty_picked numeric,
  comment text,
  done_by text,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  constraint picking_lines_status_check check (status in ('open','picked','skipped')),
  constraint picking_lines_sap_order_uq unique (warehouse, sap_order, sap_item)
);
comment on table public.picking_lines is
  'Ред за пикинг: какво складът изпраща на обекта. Повторно качване на планиран файл = insert on conflict do nothing по (warehouse, sap_order, sap_item).';
comment on column public.picking_lines.store_name is 'Обектът получател — име по SR_SHEET_TO_STORE.';
comment on column public.picking_lines.supply_group is '„Снабдителска група" — само планиран.';
comment on column public.picking_lines.sap_order is '„Заявка за доставка" — само планиран; NULL при непланиран.';
comment on column public.picking_lines.sap_item is '„Позиция на заявка" — само планиран.';
comment on column public.picking_lines.line_no is 'Номер на реда във файла (2 = първият след заглавието) — за реда „както във файла"; created_at е еднакъв за цялата порция.';
comment on column public.picking_lines.status is 'open | picked | skipped';
comment on column public.picking_lines.qty_picked is 'При picked; NULL = колкото е заявено.';
comment on column public.picking_lines.comment is 'Задължителен при skipped — проверката е в клиента, не CHECK.';

create index picking_lines_batch_idx on public.picking_lines (batch_id);
create index picking_lines_wh_store_idx on public.picking_lines (warehouse, store_name, status);

alter table public.picking_batches enable row level security;
alter table public.picking_lines enable row level security;

create policy picking_batches_select on public.picking_batches for select to anon using (true);
create policy picking_batches_insert on public.picking_batches for insert to anon with check (true);
create policy picking_batches_update on public.picking_batches for update to anon using (true) with check (true);
create policy picking_batches_delete on public.picking_batches for delete to anon using (true);
create policy picking_lines_select on public.picking_lines for select to anon using (true);
create policy picking_lines_insert on public.picking_lines for insert to anon with check (true);
create policy picking_lines_update on public.picking_lines for update to anon using (true) with check (true);

-- Пилот: Тенчо, Виктор Филев, тестов акаунт. Списък имейли със запетая —
-- НЕ 'on' (виж HIDDEN-FEATURES.md).
insert into public.app_settings (key, value) values
  ('picking_users', 'ten.tenev@temax.bg, v.filev@temax.bg, tencho.tenev13@gmail.com')
on conflict (key) do update set value = excluded.value;

-- ROLLBACK (губи данни — всички качвания и отметки на склада):
--   drop table if exists public.picking_lines;
--   drop table if exists public.picking_batches;
--   delete from public.app_settings where key = 'picking_users';
