-- loading-stoka-v-stoka-schema.sql — Товарни листи: „Стока в стока" на ред (палет).
-- Сесия loading-stoka-v-stoka, 01.11.2026.
-- Миграция loading_items_nested_codes, версия 20261101220220, приложена 02.11.2026 (00:02 София)
-- (сверено след: text, nullable, без default, 0 от 1907 реда попълнени; PostgREST — 200).
-- Rollback: supabase/migrations/20261101220220_loading_items_nested_codes_down.sql
--
-- ЗАЩО (Теодор, 29.10.2026). Коледните кутии 98235/98234/98233 и
-- 98247/98246/98243 идват опаковани една в друга. Обектът не отваря кашона,
-- вижда само външния код и подава разлика за другите. Складът отбелязва на
-- реда групите „код в код", обектът ги вижда при приемане (loading.js).
--
-- ФОРМАТ: по една група на ред (\n), кодовете в групата разделени с „/“,
-- напр. '98235/98234/98233'. Само цифри и „/“, поне 2 кода в група —
-- проверката е в клиента (llNestedParse), не в базата. NULL = няма.
-- Палетът с N документа е N реда — всеки носи същата стойност (като
-- warehouse_comment).
--
-- ФАКТИ (база, 01.11.2026, преди миграцията): loading_list_items 1907 реда,
-- колона nested_codes няма, тригери няма, RLS включено. ACL е на ниво таблица
-- (anon=arwdDxtm, authenticated=arwdDxtm) → новата колона се чете и пише без
-- нов GRANT.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push-а на кода. llBuildItemRows праща
-- nested_codes във ВСЕКИ POST/PATCH на ред от редактора — без колоната
-- PostgREST връща 400 и складът не може да запише лист.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".

alter table public.loading_list_items add column nested_codes text;

comment on column public.loading_list_items.nested_codes is
  'Стока в стока: по една група на ред, кодовете разделени с /, напр. 98235/98234/98233 (01.11.2026); NULL = няма';

-- ── ПРОВЕРКА СЛЕД ─────────────────────────────────────────────────────────
-- select count(*) filter (where nested_codes is not null) from loading_list_items;
--   очаквано: 0
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────
-- alter table public.loading_list_items drop column nested_codes;
-- (данните в колоната се губят — преди rollback:
--  select id, nested_codes from loading_list_items where nested_codes is not null;)
