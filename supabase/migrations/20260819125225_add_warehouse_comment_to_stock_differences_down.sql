-- 20260819125225_add_warehouse_comment_to_stock_differences_down.sql
-- Към 19.08.2026 колоната е празна във всичките 42 реда. Липсата ѝ чупи
-- PATCH-а на целия отговор от склада, не само коментара.
alter table public.stock_differences
  drop column if exists warehouse_comment;
