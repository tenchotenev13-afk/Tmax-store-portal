-- 20261021050541_minusi_schema — огледало: minusi-schema.sql, секция 1 (схема + RLS).
-- Приложено 21.10.2026 с apply_migration; версията е дадена от базата.


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

