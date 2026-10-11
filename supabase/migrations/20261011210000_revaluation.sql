-- 20261011210000_revaluation
-- Огледало: revaluation-schema.sql (обяснението е там).
-- Rollback: 20261011210000_revaluation_down.sql

create table public.revaluation_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'mandatory',
  starts_on date not null,
  ends_on date not null,
  default_pct numeric(5,2),
  note text,
  status text not null default 'open',
  created_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text
);

create table public.revaluation_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.revaluation_campaigns(id) on delete cascade,
  store_name text not null,
  default_pct numeric(5,2),
  no_items boolean not null default false,
  store_note text,
  status text not null default 'draft',
  submitted_at timestamptz,
  submitted_by text,
  reopened_at timestamptz,
  reopened_by text,
  created_at timestamptz not null default now(),
  constraint revaluation_submissions_uq unique (campaign_id, store_name)
);

create table public.revaluation_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.revaluation_submissions(id) on delete cascade,
  campaign_id uuid not null references public.revaluation_campaigns(id) on delete cascade,
  store_name text not null,
  sort_order integer not null default 0,
  sap_code text not null,
  product_name text,
  unit text,
  qty numeric(12,3) not null default 0,
  store_comment text,
  std_price numeric(10,2),
  discount_pct numeric(5,2),
  proposed_price numeric(10,2),
  new_sap_code text,
  sale_price numeric(10,2),
  co_comment text,
  co_by text,
  co_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index revaluation_items_campaign_store_idx
  on public.revaluation_items (campaign_id, store_name);

comment on table public.revaluation_campaigns is
  'Преоценка: кампания, отворена от ЦО (вид, прозорец от дати, % по подразбиране). Обектите подават бланка по нея.';
comment on column public.revaluation_campaigns.kind is
  'mandatory = задължителна | optional = пожелателна';
comment on column public.revaluation_campaigns.status is
  'open = обектите подават | closed = затворена от ЦО (closed_at / closed_by)';
comment on column public.revaluation_campaigns.default_pct is
  'Процент намаление по подразбиране за кампанията; NULL = няма.';

comment on table public.revaluation_submissions is
  'Преоценка: бланката на един обект по една кампания. Един ред на кампания × обект.';
comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена (submitted_at / submitted_by). ЦО отключва → обратно draft + reopened_at / reopened_by.';
comment on column public.revaluation_submissions.no_items is
  'true = „нямаме за преоценка“ (подадена без редове).';
comment on column public.revaluation_submissions.default_pct is
  'Процентът на обекта за тази бланка; NULL = процентът на кампанията.';

comment on table public.revaluation_items is
  'Преоценка: ред от бланката на обекта. Колони A–H на Excel файла са на обекта, I–K (new_sap_code, sale_price, co_comment) — на ЦО.';
comment on column public.revaluation_items.store_name is
  'Денормализирано от submission — за износа по кампания без join.';
comment on column public.revaluation_items.proposed_price is
  'Предложение за цена = std_price × (1 − discount_pct/100), закръглено надолу до .х9 в клиента; базата пази и двете.';
comment on column public.revaluation_items.new_sap_code is
  '„Материален номер“ (ЦО) — преоцененият код, text; базата не го извежда.';

alter table public.revaluation_campaigns enable row level security;
create policy revaluation_campaigns_select on public.revaluation_campaigns for select to anon using (true);
create policy revaluation_campaigns_insert on public.revaluation_campaigns for insert to anon with check (true);
create policy revaluation_campaigns_update on public.revaluation_campaigns for update to anon using (true) with check (true);

alter table public.revaluation_submissions enable row level security;
create policy revaluation_submissions_select on public.revaluation_submissions for select to anon using (true);
create policy revaluation_submissions_insert on public.revaluation_submissions for insert to anon with check (true);
create policy revaluation_submissions_update on public.revaluation_submissions for update to anon using (true) with check (true);

alter table public.revaluation_items enable row level security;
create policy revaluation_items_select on public.revaluation_items for select to anon using (true);
create policy revaluation_items_insert on public.revaluation_items for insert to anon with check (true);
create policy revaluation_items_update on public.revaluation_items for update to anon using (true) with check (true);
create policy revaluation_items_delete on public.revaluation_items for delete to anon using (true);
