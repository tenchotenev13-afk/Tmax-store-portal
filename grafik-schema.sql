-- grafik-schema.sql — Работен график, етап 1а: таблици, начални данни, достъп.
-- Огледало на миграцията (версията се дава от базата при прилагане):
--   supabase/migrations/20261101205213_grafik_schema.sql (+ _down.sql), приложена 01.11.2026
-- Ред на прилагане: схема → проверка в базата → деплой на grafik-api → push на кода.
--
-- ЗАЩО (Тенчо, 01.11.2026). Магазинът въвежда месечния график с букви; порталът
-- превежда към кодовете по ВТР, изравнява до нормата и дава файл за ТРЗ.
-- Еталонът е бланката Работен_график_*_v70.xlsx (не е в репото — лични данни).
--
-- ПРАВА — РАЗЛИЧНИ ОТ ОСТАНАЛИЯ ПОРТАЛ, НАРОЧНО. Всички grafik_* таблици са с
-- включено RLS и БЕЗ НИТО ЕДНА политика; anon и authenticated нямат никакви
-- права върху тях. Директна заявка с публичния ключ връща грешка за права.
-- Четене и запис — само през едж функцията grafik-api (service_role), която
-- проверява подписания пропуск от auth-login (currentSession), списъците
-- app_settings.grafik_beta_users / grafik_trz_users и обекта.
-- Следствие: огледалото на Живко (тегли с anon) НЕ вижда тези таблици —
-- прието за етап 1 (решение 01.11.2026); преди пускане за всички — решение за
-- бекъп. perform_daily_backup също НЕ ги включва (фиксиран списък таблици).
--
-- companies: досега anon_all_companies (for all using true) + пълни права за
-- anon. Таблицата е празна и не се ползва от кода (проверено 01.11.2026 —
-- нула попадения в *.js / *.ts / *.sql). Отсега носи заглавката на файла за
-- ТРЗ (име, адрес), затова anon остава само с четене; запис — през grafik-api.
--
-- stores.name НЕ е уникален (само stores_pkey по id) → навсякъде store_name
-- text без FK, както в останалия портал. Проверката за обект е в grafik-api.
--
-- Валидност от/до: valid_from NULL = „от винаги", valid_to NULL = „без край".
-- Справката е към ПЪРВИЯ ДЕН на месеца.
--
-- ЗАВАРЕНИ ДАННИ (правило 9): grafik_* са нови (0 таблици с такова име);
-- companies — 0 реда; stores.company_id — NULL в 23 от 23 реда.

begin;

-- ── ВТР ────────────────────────────────────────────────────────────────────
create table public.grafik_vtr (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  note       text,
  created_at timestamptz not null default now()
);

-- Кодове с часове. kind: work (отработено), absence (О/Б/Н), trip (К —
-- командировка; часовете се решават в изчисленията, не тук).
-- seasons: за кой сезон е в легендата — {Л}, {З} или NULL (и двата).
create table public.grafik_vtr_codes (
  id         uuid primary key default gen_random_uuid(),
  vtr_id     uuid not null references public.grafik_vtr(id) on delete cascade,
  code       text not null,
  hours      numeric(4,1),
  kind       text not null default 'work' check (kind in ('work','absence','trip')),
  seasons    text[],
  legend     text,
  sort_order int not null default 0,
  valid_from date,
  valid_to   date,
  unique (vtr_id, code, valid_from)
);

-- Сезон по месец: months = {"1":"З2",…,"12":"З1"}.
create table public.grafik_vtr_seasons (
  id         uuid primary key default gen_random_uuid(),
  vtr_id     uuid not null references public.grafik_vtr(id) on delete cascade,
  months     jsonb not null,
  valid_from date,
  valid_to   date
);

-- Буква → код. day_kind: Л / З1 / З2 (делник по сезона) или Н (неделя).
create table public.grafik_letter_map (
  id         uuid primary key default gen_random_uuid(),
  vtr_id     uuid not null references public.grafik_vtr(id) on delete cascade,
  letter     text not null,
  day_kind   text not null check (day_kind in ('Л','З1','З2','Н')),
  code       text not null,
  valid_from date,
  valid_to   date,
  unique (vtr_id, letter, day_kind, valid_from)
);

-- ── Дружество и обект ─────────────────────────────────────────────────────
create table public.grafik_company_terms (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vtr_id     uuid not null references public.grafik_vtr(id),
  approver   text not null,
  valid_from date,
  valid_to   date
);

create table public.grafik_store_company (
  id         uuid primary key default gen_random_uuid(),
  store_name text not null,
  company_id uuid not null references public.companies(id),
  blank_name text not null,
  address    text,
  valid_from date,
  valid_to   date
);
create index grafik_store_company_store on public.grafik_store_company(store_name);

-- Допълнителни неработни дни (празниците се смятат в кода). store_name NULL = всички.
create table public.grafik_extra_days (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  store_name text,
  note       text,
  created_by text,
  created_at timestamptz not null default now()
);

-- ── Персонал ──────────────────────────────────────────────────────────────
-- Без ЕГН. Напуснал не се трие — left_on. Преместване: left_on в стария обект
-- + нов ред в новия с prev_staff_id.
create table public.grafik_staff (
  id             uuid primary key default gen_random_uuid(),
  store_name     text not null,
  short_name     text not null,
  full_name      text not null,
  contract_title text,
  position       text check (position in ('Каса','Продавач','ОТЗ','Склад','Шофьор','Снабдител','Ръководител')),
  sector         text,
  hours_per_day  numeric(3,1) not null default 8 check (hours_per_day > 0 and hours_per_day <= 8),
  hired_on       date,
  left_on        date,
  sort_order     int not null default 0,
  note           text,
  prev_staff_id  uuid references public.grafik_staff(id),
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create index grafik_staff_store on public.grafik_staff(store_name);

-- ── Месечен график ────────────────────────────────────────────────────────
-- month = първо число на месеца. snapshot — заглавка, ВТР и финални кодове към
-- момента на „Подай" (старият месец не се мени при смяна на ВТР/дружество).
create table public.grafik_months (
  id                uuid primary key default gen_random_uuid(),
  store_name        text not null,
  month             date not null check (extract(day from month) = 1),
  status            text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at      timestamptz,
  submitted_by      text,
  submitted_by_name text,
  snapshot          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_name, month)
);

-- letters: до 31 елемента, '' = празен ден. locked: {"5":"Д1/З",…} — ръчно
-- заключени кодове по ден, изравняването не ги пипа.
create table public.grafik_rows (
  id         uuid primary key default gen_random_uuid(),
  month_id   uuid not null references public.grafik_months(id) on delete cascade,
  staff_id   uuid not null references public.grafik_staff(id),
  letters    text[] not null default '{}' check (coalesce(array_length(letters,1),0) <= 31),
  locked     jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (month_id, staff_id)
);

-- ── Права ─────────────────────────────────────────────────────────────────
alter table public.grafik_vtr           enable row level security;
alter table public.grafik_vtr_codes     enable row level security;
alter table public.grafik_vtr_seasons   enable row level security;
alter table public.grafik_letter_map    enable row level security;
alter table public.grafik_company_terms enable row level security;
alter table public.grafik_store_company enable row level security;
alter table public.grafik_extra_days    enable row level security;
alter table public.grafik_staff         enable row level security;
alter table public.grafik_months        enable row level security;
alter table public.grafik_rows          enable row level security;

revoke all on public.grafik_vtr, public.grafik_vtr_codes, public.grafik_vtr_seasons,
  public.grafik_letter_map, public.grafik_company_terms, public.grafik_store_company,
  public.grafik_extra_days, public.grafik_staff, public.grafik_months, public.grafik_rows
  from anon, authenticated;

drop policy anon_all_companies on public.companies;
revoke insert, update, delete, truncate, references, trigger on public.companies from anon, authenticated;
create policy anon_select_companies on public.companies for select to anon using (true);

-- ── Начални данни ─────────────────────────────────────────────────────────
insert into public.grafik_vtr (id, name, note) values
  ('6a1d0000-0000-4000-8000-000000000001', 'ВТР ТЦД 3 / ТЦД 4 / Темакс Юг',
   'Нов правилник от 01.11.2026 (сезони Л/З1/З2); преди това — старите кодове Д7, Д10, Д11, К1–К10.');

-- Сезони: преди 01.11.2026 — Л = април–октомври, иначе З2 (Настройки!B7, клон B3<B13);
-- от 01.11.2026 — Л = май–октомври, З1 = ноем., дек., март, апр., З2 = ян., февр.
insert into public.grafik_vtr_seasons (vtr_id, months, valid_from, valid_to) values
  ('6a1d0000-0000-4000-8000-000000000001',
   '{"1":"З2","2":"З2","3":"З2","4":"Л","5":"Л","6":"Л","7":"Л","8":"Л","9":"Л","10":"Л","11":"З2","12":"З2"}',
   null, '2026-10-31'),
  ('6a1d0000-0000-4000-8000-000000000001',
   '{"1":"З2","2":"З2","3":"З1","4":"З1","5":"Л","6":"Л","7":"Л","8":"Л","9":"Л","10":"Л","11":"З1","12":"З1"}',
   '2026-11-01', null);

insert into public.grafik_vtr_codes (vtr_id, code, hours, kind, seasons, legend, sort_order, valid_from, valid_to)
select '6a1d0000-0000-4000-8000-000000000001', c.code, c.hours, c.kind, c.seasons, c.legend, c.ord, c.vf, c.vt
from (values
  -- лято
  ('Д1/Л', 8.0,  'work', '{Л}'::text[], 'от 08:00 до 17:00 часа – 8 часа', 10, null::date, null::date),
  ('Д2/Л', 8.0,  'work', '{Л}', 'от 11:00 до 20:00 часа – 8 часа', 20, null, null),
  ('Д4/Л', 11.0, 'work', '{Л}', 'от 8:00 до 20:00 часа – дневна смяна – 11 часа', 40, null, null),
  ('Д5/3', 4.0,  'work', '{Л}', 'от 16:00 до 20:00 часа – 4 часа', 63, null, null),
  -- зима
  ('Д1/З', 8.0,  'work', '{З}', 'от 08:00 до 17:00 часа – 8 часа', 11, null, null),
  ('Д2/З', 8.0,  'work', '{З}', 'от 10:00 до 19:00 часа – 8 часа', 21, null, null),
  ('Д3/З', 8.0,  'work', '{З}', 'от 10:30 до 19:30 часа – 8 часа', 31, '2026-11-01', null),
  ('Д4/З', 10.0, 'work', '{З}', 'от 8:00 до 19:00 – дневна смяна – 10 часа', 41, null, null),
  ('Д5/З', 10.5, 'work', '{З}', 'от 8:00 до 19:30 – дневна смяна – 10 часа и 30 минути', 50, '2026-11-01', null),
  ('Д8',   6.0,  'work', '{З}', 'от 8:30 до 15:00 часа – 6 часа', 80, null, null),
  ('Д9',   4.0,  'work', '{З}', 'от 15:00 до 19:00 часа – 4 часа', 90, null, null),
  ('К11',  6.0,  'work', '{З}', 'от 8:30 до 15:30 часа – 6 часа', 110, null, null),
  -- и двата сезона
  ('Д3',   8.0,  'work', null, 'от 08:30 до 17:30 часа – за административния персонал – 8 часа', 30, null, null),
  ('Д5/1', 4.0,  'work', null, 'от 8:00 до 12:00 часа – 4 часа', 61, null, null),
  ('Д5/2', 4.0,  'work', null, 'от 13:00 до 17:00 часа – 4 часа', 62, null, null),
  ('Д6/1', 9.0,  'work', null, 'от 8:30 до 18:30 часа – дневна смяна за неделя – 9 часа', 71, null, null),
  ('Д6/2', 8.0,  'work', null, 'от 8:30 до 17:30 часа – първа смяна за неделя – 8 часа', 72, null, null),
  ('Д6/3', 8.0,  'work', null, 'от 9:30 до 18:30 часа – втора смяна за неделя – 8 часа', 73, null, null),
  -- отпаднали от 01.11.2026 (Настройки!N12:P29)
  ('Д7',   8.0,  'work', null, null, 75, null, '2026-10-31'),
  ('Д10',  5.0,  'work', null, null, 100, null, '2026-10-31'),
  ('Д11',  6.0,  'work', null, null, 101, null, '2026-10-31'),
  ('К1',   7.0,  'work', null, null, 111, null, '2026-10-31'),
  ('К2',   7.0,  'work', null, null, 112, null, '2026-10-31'),
  ('К3',   4.0,  'work', null, null, 113, null, '2026-10-31'),
  ('К4',   4.0,  'work', null, null, 114, null, '2026-10-31'),
  ('К5',   2.0,  'work', null, null, 115, null, '2026-10-31'),
  ('К6',   2.0,  'work', null, null, 116, null, '2026-10-31'),
  ('К7',   2.0,  'work', null, null, 117, null, '2026-10-31'),
  ('К8',   2.0,  'work', null, null, 118, null, '2026-10-31'),
  ('К9',   4.0,  'work', null, null, 119, null, '2026-10-31'),
  ('К10',  4.0,  'work', null, null, 120, null, '2026-10-31'),
  -- отсъствия и командировка
  ('К',    null, 'trip',    null, 'КОМАНДИРОВКА', 200, null, null),
  ('О',    null, 'absence', null, 'ПЛАТЕН ГОДИШЕН ОТПУСК', 210, null, null),
  ('Н',    null, 'absence', null, 'НЕПЛАТЕН ГОДИШЕН ОТПУСК', 211, null, null),
  ('Б',    null, 'absence', null, 'ОТПУСК ПО БОЛЕСТ', 212, null, null)
) as c(code, hours, kind, seasons, legend, ord, vf, vt);

-- Буква → код (Настройки!H2:K12). О4 → О (поправка спрямо бланката, Тенчо
-- 01.11.2026: О4 е отпуск при 4-часов договор, не Д5/1). М → Д1 НЕ Е
-- потвърдено от ТРЗ — само данни тук, сменя се без код.
insert into public.grafik_letter_map (vtr_id, letter, day_kind, code)
select '6a1d0000-0000-4000-8000-000000000001', m.letter, m.dk, m.code
from (values
  ('ЛД','Л','Д4/Л'), ('ЛД','З1','Д5/З'), ('ЛД','З2','Д4/З'), ('ЛД','Н','Д6/1'),
  ('ЗД','Л','Д4/Л'), ('ЗД','З1','Д4/З'), ('ЗД','З2','Д4/З'), ('ЗД','Н','Д6/1'),
  ('П', 'Л','Д1/Л'), ('П', 'З1','Д1/З'), ('П', 'З2','Д1/З'), ('П', 'Н','Д6/2'),
  ('В', 'Л','Д2/Л'), ('В', 'З1','Д3/З'), ('В', 'З2','Д2/З'), ('В', 'Н','Д6/3'),
  ('М', 'Л','Д1/Л'), ('М', 'З1','Д1/З'), ('М', 'З2','Д1/З'), ('М', 'Н','Д6/2'),
  ('О4','Л','О'),    ('О4','З1','О'),    ('О4','З2','О'),    ('О4','Н','О'),
  ('К', 'Л','К'),    ('К', 'З1','К'),    ('К', 'З2','К'),    ('К', 'Н','К'),
  ('О', 'Л','О'),    ('О', 'З1','О'),    ('О', 'З2','О'),    ('О', 'Н','О'),
  ('Б', 'Л','Б'),    ('Б', 'З1','Б'),    ('Б', 'З2','Б'),    ('Б', 'Н','Б'),
  ('НО','Л','Н'),    ('НО','З1','Н'),    ('НО','З2','Н'),    ('НО','Н','Н')
) as m(letter, dk, code);

-- Дружества (Тенчо, 01.11.2026). Адрес и формата ЕООД на ТЦД 3 — от образеца
-- график.xlsx (ред 3). Адрес на Темакс Юг и МОЛ на двете — липсват, попълват се
-- от админ екрана; без име и адрес на дружеството файлът за ТРЗ не се сваля,
-- но графикът се попълва.
insert into public.companies (id, name, eik, addr) values
  ('6a1d0000-0000-4000-8000-0000000000c3', '"ТЕМАКС ТЪРГОВСКИ ЦЕНТЪР ЗА ДОМА 3" ЕООД', '207322431', 'гр. Варна, ул. "Блян" 2'),
  ('6a1d0000-0000-4000-8000-0000000000a1', '"ТЕМАКС ЮГ" ЕООД', '202885071', null);

insert into public.grafik_company_terms (company_id, vtr_id, approver, valid_from) values
  ('6a1d0000-0000-4000-8000-0000000000c3', '6a1d0000-0000-4000-8000-000000000001', 'Теодор Тенев', null),
  ('6a1d0000-0000-4000-8000-0000000000a1', '6a1d0000-0000-4000-8000-000000000001', 'Теодор Тенев', null);

-- Обект → дружество. Адрес на обекта — от Настройки!B9 на двете бланки; на Шумен
-- не е известен (админ екран). Име за бланката по образеца на ТРЗ ("Темакс" - Шумен);
-- „Юг" е дружеството, не обектът.
insert into public.grafik_store_company (store_name, company_id, blank_name, address) values
  ('Кърджали', '6a1d0000-0000-4000-8000-0000000000c3', '"Темакс" – КЪРДЖАЛИ', 'гр. Кърджали, бул. "България" 115'),
  ('Шумен',    '6a1d0000-0000-4000-8000-0000000000c3', '"Темакс" - Шумен', null),
  ('Раднево',  '6a1d0000-0000-4000-8000-0000000000a1', '"Темакс" – Раднево', 'гр. Раднево, ул. Заводска 1');

-- stores.company_id — текущото дружество, само за справка; източникът е grafik_store_company.
update public.stores set company_id = '6a1d0000-0000-4000-8000-0000000000c3' where name in ('Кърджали','Шумен');
update public.stores set company_id = '6a1d0000-0000-4000-8000-0000000000a1' where name = 'Раднево';

-- Списъци за достъп (публични за четене, както picking_users).
insert into public.app_settings (key, value, updated_at, updated_by) values
  ('grafik_beta_users', 'ten.tenev@temax.bg, tencho.tenev13@gmail.com', now(), 'migration grafik_schema'),
  ('grafik_trz_users',  'trz@temax.bg', now(), 'migration grafik_schema');

commit;
