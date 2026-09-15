-- Разлики (междускладови): отговор на МАГАЗИНА по реда
--
-- ═══ ЗАЩО ═══════════════════════════════════════════════════════════════
-- stock_differences вече има отговор на СКЛАДА (warehouse_response:
-- sent / will_send / return + warehouse_comment). Тук се добавя отговорът на
-- магазина по същия ред. UI е отделна задача.
--   accepted — ПРИЕТО: стоката е получена физически (след warehouse_response=sent).
--   sap_done — ПУСНАТО В SAP: обратното движение е прието в SAP (след warehouse_response=return).
--   no_stock — НЯМА НАЛИЧНОСТ В ЛОГИСТИКА: редът остава отворен и червен за склада.
--
-- ═══ ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 15.09.2026) ═════════════════
-- БЕЗ BACKFILL. 25-те реда със status='received' остават приключени с
-- store_response = NULL; UI третира status='received' като край независимо
-- от store_response. Всички редове са NULL → CHECK-ът не засяга нищо.
--
-- Файлът е записан СЛЕД прилагането (правило 2 е наваксано същия ден);
-- SQL-ът отдолу е сверен дума по дума със statements в
-- supabase_migrations.schema_migrations.
--
-- Нови колони → огледалото (Живко): mirror-schema.sql + $TableColumns.
-- Бележка: stock-differences-store-response-schema.sql в корена.
-- Rollback: supabase/migrations/20260915193838_stock_differences_store_response_down.sql

alter table public.stock_differences
  add column store_response text
    check (store_response in ('accepted','sap_done','no_stock')),
  add column store_response_by text,
  add column store_response_at timestamptz,
  add column store_response_comment text;

comment on column public.stock_differences.store_response is 'Отговор на магазина по междускладов ред: accepted = ПРИЕТО (стоката е получена физически, след warehouse_response=sent); sap_done = ПУСНАТО В SAP (обратното движение е прието в SAP, след warehouse_response=return); no_stock = НЯМА НАЛИЧНОСТ В ЛОГИСТИКА (магазинът не може да пусне движението; редът остава отворен и червен за склада).';
