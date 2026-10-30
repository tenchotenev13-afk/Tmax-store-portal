-- revaluation-codes-store-schema.sql — Преоценка: регистърът на създадените
-- кодове помни и ОБЕКТА. Сесия preocenka-elica, 30.10.2026.
-- Миграция revaluation_codes_store, версия 20261030123801, приложена 30.10.2026
-- (сверено след: Кърджали | 11). Rollback: supabase/migrations/20261030123801_revaluation_codes_store_down.sql
--
-- ЗАЩО (Елица Гюрова, 29.10.2026, след Кърджали). От 30.10.2026 MM41 и
-- „✔ Кодовете са създадени в SAP" са в бланката на обекта (revaluation.js,
-- rvMm41Collect / rvMm41Done), не на ниво кампания. Регистърът пише и от
-- коя бланка е кодът — store_name. Ключът остава new_sap_code (кодът
-- в SAP е един, цената по обект е във VK11).
--
-- ФАКТИ (база, 30.10.2026, преди миграцията): revaluation_codes 11 реда,
-- една кампания („Пожелателна преоценка 10.2026“), записани наведнъж
-- 29.10.2026 17:16 UTC; колона store_name няма. Всеки от 11-те кода го има
-- в revaluation_items на същата кампания в ТОЧНО един обект — Кърджали.
-- Попълването долу пише store_name само при точно един обект; при повече
-- или нула остава NULL.
-- Права: ACL на таблицата е на ниво таблица (anon=arwdDxtm) → новата колона
-- се чете и пише без нов GRANT.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push-а на кода — rvMm41Done праща store_name
-- в POST-а; без колоната PostgREST връща 400 и регистърът не се пише.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

alter table public.revaluation_codes add column store_name text;

comment on column public.revaluation_codes.store_name is
  'обектът, от чиято бланка е създаден кодът (MM41 по бланка, 30.10.2026); NULL = неизвестен';

update public.revaluation_codes r
   set store_name = s.store_name
  from (select i.campaign_id, i.new_sap_code, min(i.store_name) store_name
          from public.revaluation_items i
         where i.new_sap_code is not null
         group by 1, 2
        having count(distinct i.store_name) = 1) s
 where r.store_name is null
   and s.campaign_id = r.campaign_id
   and s.new_sap_code = r.new_sap_code;

-- ── ПРОВЕРКА СЛЕД ─────────────────────────────────────────────────────────
-- select store_name, count(*) from revaluation_codes group by 1;
--   очаквано: Кърджали | 11
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────
-- alter table public.revaluation_codes drop column store_name;
