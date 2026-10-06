-- client-order-delivery-reason-schema.sql
-- Клиентски заявки — причина за срок, по-дълъг от автоматичните 10 работни дни.
-- ПРИЛОЖЕНО В SUPABASE НА 06.10.2026 като миграция
-- 20261006061337_client_orders_delivery_reason и прочетено обратно
-- (text, NULL, без default, 0 попълнени реда). Този файл е ОГЛЕДАЛО на
-- миграцията, не източник.
-- Rollback: supabase/migrations/20261006061337_client_orders_delivery_reason_down.sql.
-- Старите заявки не се пипат (без backfill): delivery_reason = NULL.
alter table public.client_orders add column if not exists delivery_reason text;
