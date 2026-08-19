-- 20260819125224_add_warehouse_response_to_stock_differences_down.sql
-- Към 19.08.2026 колоната е празна във всичките 42 реда, тоест rollback-ът
-- днес не губи данни. Това е моментна снимка — преди реален rollback се брои
-- наново. Отделно от данните: без колоната модулът „Разлики" спира, защото
-- stock-differences.js я чете и пише на 8 места.
alter table public.stock_differences
  drop column if exists warehouse_response;
