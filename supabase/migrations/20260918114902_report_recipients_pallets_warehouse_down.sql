-- Rollback на 20260918114902_report_recipients_pallets_warehouse.sql
--
-- ⚠️ Първо се връща КЛИЕНТЪТ и send-scheduled-report отпреди 18.09.2026
-- (Палети по weekly=true, Склад само role=logistics). Иначе заявките с
-- pallets=eq.true / warehouse=eq.true връщат 400 и отчетите не тръгват.
--
-- Стойностите на двата флага се губят. pallets се възстановява от weekly
-- (backfill-ът беше pallets = weekly); warehouse е изцяло нов.

alter table public.report_recipients
  drop column warehouse,
  drop column pallets;
