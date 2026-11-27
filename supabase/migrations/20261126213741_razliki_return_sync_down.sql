-- rollback за 20261126213741_razliki_return_sync
drop trigger if exists razliki_return_sync on public.stock_returns;
drop function if exists public.razliki_return_sync_trg();
