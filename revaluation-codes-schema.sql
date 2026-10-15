-- revaluation-codes-schema.sql
-- Огледало на supabase/migrations/20261015180000_revaluation_codes.sql.
--
-- ЗАЩО (Елица Гюрова, 14–15.10.2026). Преоценка, етап 3б — файловете за SAP.
-- След обработка Елица създава в SAP преоценените кодове, които още не
-- съществуват, с импорт MM41. Код, създаден веднъж (в предишна кампания или
-- за друг обект), не се създава повторно — затова регистър.
--
-- - revaluation_codes — един ред на създаден в SAP преоценен код:
--   new_sap_code (PK, MATNR), sap_code (оригиналът), product_name (MAKTX
--   както е подаден, ≤ 40 знака), unit (MEINH_01), std_price (ENDPR —
--   стандартната цена на оригинала), campaign_id (от коя кампания; при
--   изтриване на кампанията → NULL, регистърът остава), created_in_sap_at /
--   created_by — кога и кой е натиснал „Кодовете са създадени в SAP".
-- - revaluation_campaigns — DELETE политика за anon: Контролинг трие БЪДЕЩА
--   кампания от графика (етап 3б). Клиентът позволява изтриване само на
--   кампания БЕЗ бланки и проверява броя непосредствено преди заявката:
--   FK-ите от revaluation_submissions / revaluation_items са ON DELETE
--   CASCADE и изтриване на кампания с бланки би ги изтрило.
--
-- ПРАВА. RLS включено на revaluation_codes; anon select / insert / update,
-- БЕЗ delete (регистърът не се чисти от браузъра). КОМПРОМИС (както при
-- revaluation_items / revision_schedule): anon ключът е общ, тоест „пише
-- само Контролинг" и „трие само кампания без бланки" е проверка в клиента
-- (revaluation.js), не в базата.
-- Табличните GRANT-ове идват от default privileges на public.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9, 15.10.2026): revaluation_codes е нова — 0
-- реда. revaluation_campaigns: 1 кампания („Тестова преоценка Кърджали
-- 10.2026“) с 1 бланка (Кърджали, processed, 3 реда с код) — DELETE
-- политиката не я засяга; клиентът няма да я изтрие (има бланка).
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push-а на кода — revaluation.js чете
-- revaluation_codes при отваряне на модула от ЦО.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане" (само новата
-- таблица; политиката не се описва).
-- Rollback: supabase/migrations/20261015180000_revaluation_codes_down.sql
--   drop table public.revaluation_codes;
--   drop policy revaluation_campaigns_delete on public.revaluation_campaigns;

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
