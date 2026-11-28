-- rls-spravochnici-schema.sql
-- Миграция 2 от описа rls-15-opis (28.11.2026): осемте справочника. RLS on
-- БЕЗ промяна в кода и без промяна в това, което порталът може да прави днес:
-- политики portal_<команда> using (true) за anon и authenticated САМО за
-- командите, които те имат днес като grant; mirror_reader_select за
-- огледалото; revoke на TRUNCATE / REFERENCES / TRIGGER. Останалите grants
-- (вкл. MAINTAIN) — непипнати. Истинското затваряне (запис през функция) е
-- стъпка (б) — claude/open/27-11-rls-ostanali-15.md.
--
-- Сверка преди (28.11.2026, сесия rls-spravochnici-razliki):
-- - RLS изключено на осемте; политики — няма; тригери — няма.
-- - ACL anon / authenticated:
--   arwdDxtm (S/I/U/D) — warranty_brands, warranty_subcategories,
--     warranty_entries, order_restrictions, product_catalog;
--   arwDxtm (S/I/U, без DELETE) — warranty_service_locations,
--     warranty_templates (кодът ползва само PATCH, но INSERT е grant днес —
--     политиката го пази, промяната на правата е стъпка (б)),
--     bulletin_promotions.
--   mirror_reader = r на всички; service_role / postgres — bypassrls.
-- - DELETE_ALLOWED (tests/delete-tables-whitelist.test.js) съвпада с DELETE
--   в ACL-а за осемте.
-- - rpc/catalog_set_sale_prices — SECURITY INVOKER (UPDATE като anon) →
--   покрива се от portal_update + portal_select на product_catalog.
--   upsert с merge-duplicates (INSERT … ON CONFLICT DO UPDATE) иска
--   portal_insert + portal_update + portal_select.
-- - Изгледи, кронове, DEFINER функции върху осемте — няма.
-- - edge_logs за 24 ч: само 200/201/204/206 + 5 × 500 на product_catalog
--   GET (origin_time ≈ 3,1 с = statement_timeout=3s на anon; seq scan по
--   sale_price_uploaded_at / ilike върху 107 812 реда) — отделно от RLS,
--   claude/open/28-11-product-catalog-500.md.
-- - Нови колони / таблици / стойности на статус — няма; нов ред за Живко няма.
--
-- Advisor след прилагане: rls_disabled_in_public изчезва за осемте, идва
-- rls_policy_always_true — очаквано (поведението е умишлено като днес).

revoke truncate, references, trigger on public.warranty_brands            from anon, authenticated;
revoke truncate, references, trigger on public.warranty_subcategories     from anon, authenticated;
revoke truncate, references, trigger on public.warranty_entries           from anon, authenticated;
revoke truncate, references, trigger on public.warranty_service_locations from anon, authenticated;
revoke truncate, references, trigger on public.warranty_templates         from anon, authenticated;
revoke truncate, references, trigger on public.bulletin_promotions        from anon, authenticated;
revoke truncate, references, trigger on public.order_restrictions         from anon, authenticated;
revoke truncate, references, trigger on public.product_catalog            from anon, authenticated;

create policy portal_select on public.warranty_brands for select to anon, authenticated using (true);
create policy portal_insert on public.warranty_brands for insert to anon, authenticated with check (true);
create policy portal_update on public.warranty_brands for update to anon, authenticated using (true) with check (true);
create policy portal_delete on public.warranty_brands for delete to anon, authenticated using (true);
create policy portal_select on public.warranty_subcategories for select to anon, authenticated using (true);
create policy portal_insert on public.warranty_subcategories for insert to anon, authenticated with check (true);
create policy portal_update on public.warranty_subcategories for update to anon, authenticated using (true) with check (true);
create policy portal_delete on public.warranty_subcategories for delete to anon, authenticated using (true);
create policy portal_select on public.warranty_entries for select to anon, authenticated using (true);
create policy portal_insert on public.warranty_entries for insert to anon, authenticated with check (true);
create policy portal_update on public.warranty_entries for update to anon, authenticated using (true) with check (true);
create policy portal_delete on public.warranty_entries for delete to anon, authenticated using (true);
create policy portal_select on public.warranty_service_locations for select to anon, authenticated using (true);
create policy portal_insert on public.warranty_service_locations for insert to anon, authenticated with check (true);
create policy portal_update on public.warranty_service_locations for update to anon, authenticated using (true) with check (true);
create policy portal_select on public.warranty_templates for select to anon, authenticated using (true);
create policy portal_insert on public.warranty_templates for insert to anon, authenticated with check (true);
create policy portal_update on public.warranty_templates for update to anon, authenticated using (true) with check (true);
create policy portal_select on public.bulletin_promotions for select to anon, authenticated using (true);
create policy portal_insert on public.bulletin_promotions for insert to anon, authenticated with check (true);
create policy portal_update on public.bulletin_promotions for update to anon, authenticated using (true) with check (true);
create policy portal_select on public.order_restrictions for select to anon, authenticated using (true);
create policy portal_insert on public.order_restrictions for insert to anon, authenticated with check (true);
create policy portal_update on public.order_restrictions for update to anon, authenticated using (true) with check (true);
create policy portal_delete on public.order_restrictions for delete to anon, authenticated using (true);
create policy portal_select on public.product_catalog for select to anon, authenticated using (true);
create policy portal_insert on public.product_catalog for insert to anon, authenticated with check (true);
create policy portal_update on public.product_catalog for update to anon, authenticated using (true) with check (true);
create policy portal_delete on public.product_catalog for delete to anon, authenticated using (true);

create policy mirror_reader_select on public.warranty_brands            for select to mirror_reader using (true);
create policy mirror_reader_select on public.warranty_subcategories     for select to mirror_reader using (true);
create policy mirror_reader_select on public.warranty_entries           for select to mirror_reader using (true);
create policy mirror_reader_select on public.warranty_service_locations for select to mirror_reader using (true);
create policy mirror_reader_select on public.warranty_templates         for select to mirror_reader using (true);
create policy mirror_reader_select on public.bulletin_promotions        for select to mirror_reader using (true);
create policy mirror_reader_select on public.order_restrictions         for select to mirror_reader using (true);
create policy mirror_reader_select on public.product_catalog            for select to mirror_reader using (true);

alter table public.warranty_brands            enable row level security;
alter table public.warranty_subcategories     enable row level security;
alter table public.warranty_entries           enable row level security;
alter table public.warranty_service_locations enable row level security;
alter table public.warranty_templates         enable row level security;
alter table public.bulletin_promotions        enable row level security;
alter table public.order_restrictions         enable row level security;
alter table public.product_catalog            enable row level security;

-- ROLLBACK (дословно обратното, в обратен ред):
-- alter table public.product_catalog            disable row level security;
-- alter table public.order_restrictions         disable row level security;
-- alter table public.bulletin_promotions        disable row level security;
-- alter table public.warranty_templates         disable row level security;
-- alter table public.warranty_service_locations disable row level security;
-- alter table public.warranty_entries           disable row level security;
-- alter table public.warranty_subcategories     disable row level security;
-- alter table public.warranty_brands            disable row level security;
-- drop policy mirror_reader_select on public.product_catalog;
-- drop policy mirror_reader_select on public.order_restrictions;
-- drop policy mirror_reader_select on public.bulletin_promotions;
-- drop policy mirror_reader_select on public.warranty_templates;
-- drop policy mirror_reader_select on public.warranty_service_locations;
-- drop policy mirror_reader_select on public.warranty_entries;
-- drop policy mirror_reader_select on public.warranty_subcategories;
-- drop policy mirror_reader_select on public.warranty_brands;
-- drop policy portal_delete on public.product_catalog;
-- drop policy portal_update on public.product_catalog;
-- drop policy portal_insert on public.product_catalog;
-- drop policy portal_select on public.product_catalog;
-- drop policy portal_delete on public.order_restrictions;
-- drop policy portal_update on public.order_restrictions;
-- drop policy portal_insert on public.order_restrictions;
-- drop policy portal_select on public.order_restrictions;
-- drop policy portal_update on public.bulletin_promotions;
-- drop policy portal_insert on public.bulletin_promotions;
-- drop policy portal_select on public.bulletin_promotions;
-- drop policy portal_update on public.warranty_templates;
-- drop policy portal_insert on public.warranty_templates;
-- drop policy portal_select on public.warranty_templates;
-- drop policy portal_update on public.warranty_service_locations;
-- drop policy portal_insert on public.warranty_service_locations;
-- drop policy portal_select on public.warranty_service_locations;
-- drop policy portal_delete on public.warranty_entries;
-- drop policy portal_update on public.warranty_entries;
-- drop policy portal_insert on public.warranty_entries;
-- drop policy portal_select on public.warranty_entries;
-- drop policy portal_delete on public.warranty_subcategories;
-- drop policy portal_update on public.warranty_subcategories;
-- drop policy portal_insert on public.warranty_subcategories;
-- drop policy portal_select on public.warranty_subcategories;
-- drop policy portal_delete on public.warranty_brands;
-- drop policy portal_update on public.warranty_brands;
-- drop policy portal_insert on public.warranty_brands;
-- drop policy portal_select on public.warranty_brands;
-- grant truncate, references, trigger on public.product_catalog            to anon, authenticated;
-- grant truncate, references, trigger on public.order_restrictions         to anon, authenticated;
-- grant truncate, references, trigger on public.bulletin_promotions        to anon, authenticated;
-- grant truncate, references, trigger on public.warranty_templates         to anon, authenticated;
-- grant truncate, references, trigger on public.warranty_service_locations to anon, authenticated;
-- grant truncate, references, trigger on public.warranty_entries           to anon, authenticated;
-- grant truncate, references, trigger on public.warranty_subcategories     to anon, authenticated;
-- grant truncate, references, trigger on public.warranty_brands            to anon, authenticated;
