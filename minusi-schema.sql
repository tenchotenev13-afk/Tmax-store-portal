-- minusi-schema.sql — модул „Минуси" (под-таб в „Ревизии и преоценка"), етап 1.
-- Огледало на две миграции (версиите са дадени от базата):
--   supabase/migrations/20261021050541_minusi_schema.sql  — таблиците + RLS
--   supabase/migrations/20261021050606_minusi_seed.sql    — началните данни
-- Ред на прилагане (решение 20.10.2026): схема → проверка в базата → seed →
-- push на кода. minusi.js чете таблиците при отваряне на под-таба; ако кодът
-- е на живо преди миграцията, под-табът показва грешка при зареждане.
--
-- ЗАЩО (19–20.10.2026). NTT DATA пусна движение 955 „Недостиг AUTO": продажба
-- без наличност по система се осчетоводява автоматично с датата на продажбата.
-- 956 „Сторно Недостиг AUTO" е обратното (количество със знак минус).
-- Автоматично зануляване НЯМА — закриването е работа на обекта. Контролингът
-- качва експорт от SAP (MB51, натрупан от 05.10 насам); обектът вижда
-- незакритите 955 и попълва заметнат код / причина / служител.
--
-- ОБЕКТ — по store_name text, както revaluation_*, supply_*, stock_*.
-- Заводът (minus_plants.plant) определя обекта; „Име 1" от файла НЕ се ползва
-- (в един файл има „Гоце Делчев" за 7519 и „ТМ Гоце Делчев" за 5519).
--
-- СУМИ НЯМА. Колоната „Сума в МестВал." от файла не се записва никъде —
-- магазинът не вижда суми (решение 19.10.2026).
--
-- Без CHECK — огледалото на Живко прави UPSERT и CHECK по стойност го чупи;
-- допустимите стойности са в коментарите на колоните.
--
-- ПРАВА. RLS включено; anon select / insert / update, БЕЗ delete (като
-- supply_entries). КОМПРОМИС (като revaluation_*): anon ключът е общ, тоест
-- „качва само Контролинг" и „попълва само обектът" са проверки в клиента
-- (minusi.js), не в базата.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): всички таблици са нови — 0 реда, 0 засегнати.
-- Имената minus_* не съществуваха в базата (проверено 20.10.2026), ключът
-- app_settings.minus_stores — също.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
--
-- ROLLBACK (губи данни — всичко качено и попълнено от обектите):
--   delete from public.app_settings where key = 'minus_stores';
--   drop table if exists public.minus_movements;
--   drop table if exists public.minus_uploads;
--   drop table if exists public.minus_reasons;
--   drop table if exists public.minus_uom_thresholds;
--   drop table if exists public.minus_plants;

-- ═══ 1. СХЕМА ═══════════════════════════════════════════════════════════

create table public.minus_plants (
  plant text primary key,
  store_name text not null,
  role text not null
);
comment on table public.minus_plants is
  'Завод от SAP → обект на портала. Логистичните складове и „онлайн" не се зареждат.';
comment on column public.minus_plants.role is
  'доставка | продажби | наличност (наличност = заводът е и доставка или продажби).';

create table public.minus_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  file_name text,
  rows_total int,
  rows_new int,
  date_from date,
  date_to date
);
comment on table public.minus_uploads is
  'Едно качване на експорт от SAP (MB51). rows_total = редове 955/956 с познат завод; rows_new = реално вмъкнати.';

create table public.minus_reasons (
  id serial primary key,
  label text not null,
  excluded_from_revision boolean not null default false,
  active boolean not null default true,
  sort int
);
comment on table public.minus_reasons is
  'Причини за минус — обектът избира САМО от този списък, без свободен текст.';
comment on column public.minus_reasons.excluded_from_revision is
  'true = редът не влиза в темплейта за ревизия 956 (етап 3).';

create table public.minus_uom_thresholds (
  uom text primary key,
  min_qty numeric not null
);
comment on table public.minus_uom_thresholds is
  'Праг по мерна единица: остатък под min_qty не се показва на обекта. Ключът е нормализиран (trim, горен регистър, без точка накрая). Единица без ред → показва се всеки остатък ≠ 0.';

create table public.minus_movements (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references public.minus_uploads(id),
  plant text not null,
  store_name text not null,
  material text not null,
  material_desc text,
  mvt_type text not null,
  qty numeric not null,
  uom text,
  mat_doc text not null,
  doc_item text not null,
  doc_year int not null,
  posting_date date not null,
  header_text text,
  real_code text,
  reason_id int references public.minus_reasons(id),
  employee_name text,
  note text,
  filled_by text,
  filled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint minus_movements_doc_uq unique (mat_doc, doc_item, doc_year)
);
comment on table public.minus_movements is
  'Движения 955 / 956 от SAP. Без сума. Повторно качване = insert on conflict do nothing — попълнените от обекта полета не се презаписват.';
comment on column public.minus_movements.mvt_type is '955 (Недостиг AUTO) | 956 (Сторно Недостиг AUTO)';
comment on column public.minus_movements.qty is 'Количество със знака от SAP (956 е отрицателно).';
comment on column public.minus_movements.header_text is '„Текст общи данни док" — само за показване, не за логика.';
comment on column public.minus_movements.real_code is 'Заметнат код — попълва обектът.';

create index minus_movements_store_mat_idx on public.minus_movements (store_name, material);

alter table public.minus_plants enable row level security;
alter table public.minus_uploads enable row level security;
alter table public.minus_reasons enable row level security;
alter table public.minus_uom_thresholds enable row level security;
alter table public.minus_movements enable row level security;

create policy minus_plants_select on public.minus_plants for select to anon using (true);
create policy minus_plants_insert on public.minus_plants for insert to anon with check (true);
create policy minus_plants_update on public.minus_plants for update to anon using (true) with check (true);
create policy minus_uploads_select on public.minus_uploads for select to anon using (true);
create policy minus_uploads_insert on public.minus_uploads for insert to anon with check (true);
create policy minus_uploads_update on public.minus_uploads for update to anon using (true) with check (true);
create policy minus_reasons_select on public.minus_reasons for select to anon using (true);
create policy minus_reasons_insert on public.minus_reasons for insert to anon with check (true);
create policy minus_reasons_update on public.minus_reasons for update to anon using (true) with check (true);
create policy minus_uom_thresholds_select on public.minus_uom_thresholds for select to anon using (true);
create policy minus_uom_thresholds_insert on public.minus_uom_thresholds for insert to anon with check (true);
create policy minus_uom_thresholds_update on public.minus_uom_thresholds for update to anon using (true) with check (true);
create policy minus_movements_select on public.minus_movements for select to anon using (true);
create policy minus_movements_insert on public.minus_movements for insert to anon with check (true);
create policy minus_movements_update on public.minus_movements for update to anon using (true) with check (true);

-- ═══ 2. SEED (след проверка, че схемата е в базата) ═════════════════════

-- Заводи: един ред на уникален завод. Наличност = доставка или = продажби →
-- ролята е 'наличност'. Пазарджик (няма заводи), логистичните складове и
-- „онлайн" не се зареждат.
insert into public.minus_plants (plant, store_name, role) values
  ('5502', 'Севлиево', 'доставка'),    ('2502', 'Севлиево', 'наличност'),
  ('5503', 'Враца', 'доставка'),       ('2503', 'Враца', 'наличност'),
  ('5507', 'Монтана', 'доставка'),     ('7507', 'Монтана', 'наличност'),
  ('5508', 'Кърджали', 'доставка'),    ('6508', 'Кърджали', 'наличност'),
  ('5512', 'Търговище', 'доставка'),   ('6512', 'Търговище', 'наличност'),
  ('5513', 'Сливен', 'доставка'),      ('2513', 'Сливен', 'наличност'),
  ('5514', 'Шумен', 'наличност'),      ('6514', 'Шумен', 'продажби'),
  ('5515', 'Габрово', 'доставка'),     ('7515', 'Габрово', 'наличност'),
  ('5516', 'Добрич', 'доставка'),      ('6516', 'Добрич', 'наличност'),
  ('5519', 'Гоце Делчев', 'наличност'),('7519', 'Гоце Делчев', 'продажби'),
  ('5520', 'Силистра', 'доставка'),    ('2520', 'Силистра', 'наличност'),
  ('5521', 'Раднево', 'доставка'),     ('2521', 'Раднево', 'наличност'),
  ('5522', 'Дупница', 'доставка'),     ('2522', 'Дупница', 'наличност'),
  ('5523', 'Петрич', 'наличност'),     ('7523', 'Петрич', 'продажби'),
  ('5524', 'Пирдоп', 'доставка'),      ('7524', 'Пирдоп', 'наличност'),
  ('5525', 'Троян', 'наличност'),      ('6525', 'Троян', 'продажби'),
  ('5526', 'Карлово', 'доставка'),     ('7526', 'Карлово', 'наличност'),
  ('5527', 'Козлодуй', 'наличност'),   ('6527', 'Козлодуй', 'продажби');

insert into public.minus_reasons (id, label, excluded_from_revision, sort) values
  (1,  'клиентска поръчка (номер/дата)', true, 1),
  (2,  'последна бройка, липсва код', false, 2),
  (3,  'продажба на цялото количество, липсва код', false, 3),
  (4,  'има още количество, липсва код', false, 4),
  (5,  'реална продажба, чака вход от ЛСТ', true, 5),
  (6,  'грешна стокова бележка', false, 6),
  (7,  'грешен етикет', false, 7),
  (8,  'грешен баркод, не е преналепено', false, 8),
  (9,  'разлика т-ще', true, 9),
  (10, 'касиерска грешка', false, 10),
  (11, 'грешно въведен код от касиер', false, 11),
  (12, 'маркират се трудно на каса, продадени на ценови етикет', false, 12),
  (13, 'налепени грешно артикули', false, 13),
  (14, 'маркирани едновременно на каса различни артикули', false, 14),
  (15, 'заметнати с другия цвят', false, 15),
  (16, 'заметнати със съседните', false, 16),
  (17, 'паднал етикет, продаден на ценови етикет', false, 17),
  (18, 'заметнат с преоценения код', false, 18),
  (19, 'продаден преди да се заведе, имаме го', false, 19);
select setval(pg_get_serial_sequence('public.minus_reasons', 'id'), 19);

insert into public.minus_uom_thresholds (uom, min_qty) values ('M2', 0.01), ('ЛМ', 0.01);

insert into public.app_settings (key, value, updated_at, updated_by)
  values ('minus_stores', 'Гоце Делчев', now(), 'minusi-etap1');
