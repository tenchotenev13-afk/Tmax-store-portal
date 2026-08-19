-- 20260819125224_add_warehouse_response_to_stock_differences.sql
-- ОПИСВА ЗАВАРЕНО СЪСТОЯНИЕ, не нова промяна. Колоната е жива в базата
-- отпреди тази папка да съществува; версията в името казва кога е записана
-- тук, не кога колоната се е появила.
-- Източник: supabase/legacy-notes/stock-differences-warehouse-response-schema.sql
-- Стойности, които кодът записва (stock-differences.js, WH_RESPONSE_LABELS):
--   'sent' | 'will_send' | 'return'. В живата база НЯМА CHECK constraint
--   върху тях — миграцията описва заварено състояние и затова не добавя такъв.
alter table public.stock_differences
  add column if not exists warehouse_response text;
