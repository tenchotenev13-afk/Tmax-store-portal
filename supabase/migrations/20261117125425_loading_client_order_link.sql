-- Товарни листи, етап 2 на клиентските заявки: loading_list_items.client_order_id
-- (17.11.2026, сесия ll-co-link). Описание и факти — loading-client-order-link-schema.sql.
alter table public.loading_list_items
  add column if not exists client_order_id uuid;

create index if not exists loading_list_items_client_order_idx
  on public.loading_list_items (client_order_id)
  where client_order_id is not null;

comment on column public.loading_list_items.client_order_id is
  'Клиентската заявка (client_orders.id), сложена с „➕" от блока „Дължими клиентски заявки" (17.11.2026). NULL = без връзка. Без FK — огледалото. При изпращане на листа заявката става „Изпратена", ако е pending/processed/approved и изпълнителят е складът.';
