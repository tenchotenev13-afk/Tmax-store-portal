-- sap-prices-vkp2-schema.sql — Продажни цени от SAP (VKP2) в справочника на
-- артикулите (06.11.2026, сесия sap-prices-vkp2). Решения на Тенчо 06.11:
-- цените се пазят в product_catalog; качват ги admin от Администрация →
-- „SAP каталог“ („💶 Цени (VKP2)“, admin.js); справочникът се пише с публичния
-- ключ, както досега — цените не са защитени повече от имената (прието).
-- Основа за сумите в Минуси (само за офиса) и по-късно за сторно бележките —
-- в тази сесия нищо не ги показва.
--
-- ПРИЛОЖЕНО в Supabase на 08.11.2026 като миграция 20261108150623 (sap_prices_vkp2).
--
-- 1. product_catalog — четири nullable колони, без default:
--      sale_price             numeric      — цена за единица = Сума / Ценова единица
--      sale_price_unit        text         — „Единица на условие“ от VKP2
--      sale_price_valid_from  date         — „Валиден от“ на взетия ред
--      sale_price_uploaded_at timestamptz  — кога е качена (едно време за целия импорт)
--    Кодът само ги чете / пише през функцията долу → миграцията минава преди push-а.
--
-- 2. catalog_set_sale_prices(p_rows jsonb, p_uploaded_at timestamptz) → jsonb
--    САМО UPDATE на съществуващ sap_code и САМО на ценовите колони — не пипа
--    product_name, default_unit, category, ean_code, updated_at; не създава ред.
--    Защо функция, а не upsert-ът на каталога (POST merge-duplicates): upsert
--    вмъква ред за непознат материал (забранено), а и product_name е NOT NULL —
--    INSERT … ON CONFLICT проверява NOT NULL преди конфликта, тоест порция само
--    с ценови колони пада цялата. PATCH ред по ред са 107 хил. заявки.
--    SECURITY INVOKER: anon вече има UPDATE върху product_catalog (RLS е
--    изключен) — функцията не дава повече права, отколкото браузърът вече има.
--    Връща {"updated": N, "unknown": [кодове, които ги няма в каталога]}.
--    p_rows: [{"sap_code","price","unit","valid_from"}], по един ред на код
--    (дедупликацията е в браузъра; повторен код в порцията — обновява се веднъж,
--    по последния).
--
-- Огледало (Живко): ред в zhivko-opashka.md „Чака изпращане“ — 4-те колони;
-- функцията — не (огледалото ги няма).
--
-- ROLLBACK:
--   drop function if exists public.catalog_set_sale_prices(jsonb, timestamptz);
--   alter table public.product_catalog
--     drop column if exists sale_price,
--     drop column if exists sale_price_unit,
--     drop column if exists sale_price_valid_from,
--     drop column if exists sale_price_uploaded_at;

alter table public.product_catalog
  add column if not exists sale_price numeric,
  add column if not exists sale_price_unit text,
  add column if not exists sale_price_valid_from date,
  add column if not exists sale_price_uploaded_at timestamptz;

comment on column public.product_catalog.sale_price is
  'Продажна цена за единица от SAP VKP2 (VKP0, валидна в деня на качването) = Сума / Ценова единица.';
comment on column public.product_catalog.sale_price_unit is 'Единица на условие от VKP2.';
comment on column public.product_catalog.sale_price_valid_from is 'Валиден от на взетия ред от VKP2.';
comment on column public.product_catalog.sale_price_uploaded_at is 'Кога е качен ценоразписът (едно време за целия импорт).';

create or replace function public.catalog_set_sale_prices(p_rows jsonb, p_uploaded_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated int;
  v_unknown jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'catalog_set_sale_prices: p_rows трябва да е масив';
  end if;
  with src as (
    select distinct on (x.sap_code) x.sap_code, x.price, x.unit, x.valid_from
      from rows from (jsonb_to_recordset(p_rows) as (sap_code text, price numeric, unit text, valid_from date))
           with ordinality as x(sap_code, price, unit, valid_from, n)
     where coalesce(btrim(x.sap_code), '') <> ''
     order by x.sap_code, x.n desc
  ), upd as (
    update public.product_catalog c
       set sale_price = s.price,
           sale_price_unit = s.unit,
           sale_price_valid_from = s.valid_from,
           sale_price_uploaded_at = p_uploaded_at
      from src s
     where c.sap_code = s.sap_code
    returning c.sap_code
  )
  select (select count(*) from upd),
         coalesce((select jsonb_agg(s.sap_code order by s.sap_code) from src s
                    where not exists (select 1 from public.product_catalog c where c.sap_code = s.sap_code)), '[]'::jsonb)
    into v_updated, v_unknown;
  return jsonb_build_object('updated', v_updated, 'unknown', v_unknown);
end;
$$;

comment on function public.catalog_set_sale_prices(jsonb, timestamptz) is
  'VKP2 → product_catalog: само UPDATE на ценовите колони по sap_code, без нови редове. Вика се от admin.js (💶 Цени (VKP2)).';
