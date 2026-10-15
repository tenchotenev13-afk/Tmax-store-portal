-- 20261015180000_revaluation_codes
-- Огледало: revaluation-codes-schema.sql (обяснението е там).
-- Rollback: 20261015180000_revaluation_codes_down.sql

create table public.revaluation_codes (
  new_sap_code text primary key,
  sap_code text not null,
  product_name text,
  unit text,
  std_price numeric(10,2),
  campaign_id uuid references public.revaluation_campaigns(id) on delete set null,
  created_in_sap_at timestamptz not null default now(),
  created_by text
);

comment on table public.revaluation_codes is
  'Преоценка: регистър на преоценените кодове, създадени в SAP (MM41). Код от регистъра не влиза в следващ MM41.';
comment on column public.revaluation_codes.product_name is
  'MAKTX както е подаден в MM41: „ПРЕОЦ." + описанието, отрязано на 40 знака.';
comment on column public.revaluation_codes.std_price is
  'ENDPR — стандартната цена на ОРИГИНАЛНИЯ артикул при създаването.';

alter table public.revaluation_codes enable row level security;
create policy revaluation_codes_select on public.revaluation_codes for select to anon using (true);
create policy revaluation_codes_insert on public.revaluation_codes for insert to anon with check (true);
create policy revaluation_codes_update on public.revaluation_codes for update to anon using (true) with check (true);

create policy revaluation_campaigns_delete on public.revaluation_campaigns for delete to anon using (true);
