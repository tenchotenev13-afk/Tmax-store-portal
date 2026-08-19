-- 20260819125225_add_warehouse_comment_to_stock_differences.sql
-- ОПИСВА ЗАВАРЕНО СЪСТОЯНИЕ, не нова промяна. Колоната е жива в базата
-- отпреди тази папка да съществува; версията в името казва кога е записана
-- тук, не кога колоната се е появила.
-- Източник: supabase/legacy-notes/stock-differences-warehouse-response-schema.sql
-- Свободен текст от склада, придружаващ warehouse_response — двете се пишат
-- заедно с един sbPatch.
alter table public.stock_differences
  add column if not exists warehouse_comment text;
