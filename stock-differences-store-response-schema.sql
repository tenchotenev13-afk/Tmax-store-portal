-- Разлики (междускладови): отговор на МАГАЗИНА по реда
-- Приложено в Supabase на 15.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: stock_differences_store_response
--
-- ═══ ЗАЩО ═══════════════════════════════════════════════════════════════
-- stock_differences вече има отговор на СКЛАДА (warehouse_response:
-- sent / will_send / return + warehouse_comment). Тук се добавя отговорът на
-- магазина по същия ред — кой, кога, какво и коментар. UI е отделна задача.
--
-- Стойности на store_response:
--   accepted — ПРИЕТО: стоката е получена физически (след warehouse_response=sent).
--   sap_done — ПУСНАТО В SAP: обратното движение е прието в SAP (след warehouse_response=return).
--   no_stock — НЯМА НАЛИЧНОСТ В ЛОГИСТИКА: магазинът не може да пусне движението; редът остава отворен и червен за склада.
--
-- ═══ ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 15.09.2026) ═════════════════
-- Междускладови редове по status / warehouse_response:
--   new      / NULL       141
--   new      / return      54   ← получават бутоните веднага (sap_done / no_stock)
--   new      / will_send   39
--   received / sent        22
--   new      / sent        21   ← получават бутоните веднага (accepted)
--   received / return       3
-- status='received' общо: 25 — всичките междускладови.
--
-- БЕЗ BACKFILL. Съществуващите status='received' редове остават приключени
-- както са, с store_response = NULL. UI третира status='received' като край
-- НЕЗАВИСИМО от store_response — NULL при приключен ред не значи „чака
-- магазина". Всички текущи редове са NULL, тоест CHECK-ът минава без
-- засегнати записи.
--
-- Нови колони → огледалото (Живко): mirror-schema.sql + $TableColumns в
-- sync-mirror.ps1. RLS и grants не се пипат.
-- Rollback: stock-differences-store-response-schema-down.sql

alter table public.stock_differences
  add column store_response text
    check (store_response in ('accepted','sap_done','no_stock')),
  add column store_response_by text,
  add column store_response_at timestamptz,
  add column store_response_comment text;

comment on column public.stock_differences.store_response is 'Отговор на магазина по междускладов ред: accepted = ПРИЕТО (стоката е получена физически, след warehouse_response=sent); sap_done = ПУСНАТО В SAP (обратното движение е прието в SAP, след warehouse_response=return); no_stock = НЯМА НАЛИЧНОСТ В ЛОГИСТИКА (магазинът не може да пусне движението; редът остава отворен и червен за склада).';

-- ── ROLLBACK ──
-- alter table public.stock_differences
--   drop column store_response,
--   drop column store_response_by,
--   drop column store_response_at,
--   drop column store_response_comment;
-- Внимание: rollback изтрива записаните отговори на магазините безвъзвратно
-- (CHECK ограничението пада заедно с колоната).
