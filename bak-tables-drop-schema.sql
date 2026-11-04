-- bak-tables-drop-schema.sql
-- Дроп на 5 резервни таблици, чиято работа е свършена (04.11.2026).
-- Кодът не се променя — никой .js / едж функция не ги чете.
--
--   task_completions_bak_20260910     2126 реда — „за дроп“ в handover-а
--   kasa_cleanup_bak_20260920           60 реда — „за дроп“ в handover-а
--   kasa_cleanup_bak_20260928           10 реда — без описание и без миграция;
--                                                 решение на Тенчо 04.11
--   stock_returns_auto_bak_20261007      5 реда — срокът ~14.10 е минал
--   dash_guard_bak_20261027            137 реда — условието е изпълнено
--                                                 (0 от 254 нови реда в
--                                                 kasa_reports с „—“ от 28.10)
-- Остават: loading_items_bak_20261030_shumen, loading_items_bak_20261102_dupnica.
--
-- Проверено преди (04.11.2026): няма изгледи, FK, функции (prosrc), тригери,
-- политики или pg_cron команди с имената им; в репото — само документи,
-- schema файлове, supabase/migrations/ и два коментара (kasa.js:717 и
-- tests/kasa-returned-day-close.test.js:8 — „backup: kasa_cleanup_bak_20260920“).
--
-- ROLLBACK: SQL rollback НЯМА. Таблиците се възстановяват от JSON копията в
--   C:\Users\tench\Documents\temax-bak-2026-11\
--     <име>.json      — пълното съдържание (json_agg на всички редове,
--                       подредени по to_jsonb(ред)::text); MD5 на файла =
--                       MD5, сметнат в базата преди дропа; брой редове =
--                       брой в таблицата
--     _columns.json   — колоните на петте таблици (име, тип, not null)
--   Възстановяване: create table по _columns.json, после
--   insert into … select * from json_populate_recordset(null::<таблица>, '<json>').

drop table public.task_completions_bak_20260910;
drop table public.kasa_cleanup_bak_20260920;
drop table public.kasa_cleanup_bak_20260928;
drop table public.stock_returns_auto_bak_20261007;
drop table public.dash_guard_bak_20261027;
