-- Rollback на 20261002090000_stock_returns_confirmed_by
--
-- ⚠ ГУБИ СЛЕДАТА кой е поставил всяка дата. Самите дати (confirmed_date) НЕ се
-- пипат — те са данните; тук пада само произходът им.
--
-- Следствие, което трябва да се знае преди да се пусне: автоматичното отмятане
-- на „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" зависи от confirmed_by. Без колоната
-- stock_returns_store_done() ще гърми (42703, undefined column), тоест ПЪРВО
-- се връща auto-complete миграцията, после тази. Обратният ред оставя тригер,
-- който пада при всеки запис в stock_returns.
--
-- Преди да се пусне:
--   select count(*) from stock_returns where confirmed_by is not null;
-- Числото е колко следи ще изчезнат.

alter table public.stock_returns
  drop column if exists confirmed_at;

alter table public.stock_returns
  drop column if exists confirmed_by;
