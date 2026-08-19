-- ═══ ПОКРИТА ОТ МИГРАЦИЯ ═══════════════════════════════════════════════
-- Записът за схемата са две миграции, по една на колона:
--   supabase/migrations/20260819125224_add_warehouse_response_to_stock_differences.sql
--   supabase/migrations/20260819125225_add_warehouse_comment_to_stock_differences.sql
-- Този файл е историческа бележка: не го пускай и не го приемай за
-- източник на истината. Сверено на 19.08.2026.
-- Миграциите описват ЗАВАРЕНО състояние — колоните са живи в базата отпреди
-- папката с миграции и нищо не е прилагано в базата, за да се появят.
-- ══════════════════════════════════════════════════════════════════════

alter table stock_differences add column if not exists warehouse_response text;
alter table stock_differences add column if not exists warehouse_comment text;
