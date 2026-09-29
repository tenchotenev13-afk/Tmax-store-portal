-- Rollback на transfers (етап 1).
-- Обратимо без загуба САМО докато трите таблици са празни. Преди пускане:
--   select (select count(*) from public.transfers),
--          (select count(*) from public.transfer_cargo),
--          (select count(*) from public.transfer_counters);
-- Не е 0/0/0 → това ТРИЕ транспорти и товари; отделно решение, не рутина.
drop trigger if exists trg_keep_transfer_num   on public.transfers;
drop trigger if exists trg_assign_transfer_num on public.transfers;
drop function if exists public.keep_transfer_num();
drop function if exists public.assign_transfer_num();
drop table if exists public.transfer_cargo;     -- политиката, индексите и FK към loading_list_items падат с нея
drop table if exists public.transfers;
drop table if exists public.transfer_counters;
