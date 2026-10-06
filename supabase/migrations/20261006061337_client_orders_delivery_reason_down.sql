-- Rollback на client_orders_delivery_reason.
-- Губи се причината за по-дълъг срок на заявките, записани след деплоя:
--   select count(*) from public.client_orders where delivery_reason is not null;
alter table public.client_orders drop column if exists delivery_reason;
