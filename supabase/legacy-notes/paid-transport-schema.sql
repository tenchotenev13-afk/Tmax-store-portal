-- Платен транспорт: свързване на клиентска заявка с транспортна заявка
-- Приложена в Supabase на 17.08.2026 (миграция: paid_transport_link_client_orders)
-- Съответства на комит 3e349da в main.

alter table client_orders add column if not exists paid_transport boolean not null default false;
alter table client_orders add column if not exists transport_id uuid;

alter table transport_orders add column if not exists client_order_id uuid;
alter table transport_orders add column if not exists client_order_num text;
alter table transport_orders add column if not exists awaiting_stock boolean not null default false;

-- Връзката е двупосочна: client_orders.transport_id <-> transport_orders.client_order_id.
-- on delete set null е предпазна мрежа; приложението трие транспорта явно
-- (deleteClientOrder в client-orders.js), за да не остават сираци.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transport_orders_client_order_id_fkey') then
    alter table transport_orders
      add constraint transport_orders_client_order_id_fkey
      foreign key (client_order_id) references client_orders(id) on delete set null;
  end if;
end $$;

create index if not exists idx_transport_orders_client_order_id on transport_orders(client_order_id);
create index if not exists idx_client_orders_transport_id on client_orders(transport_id);

-- Значение на колоните:
--   client_orders.paid_transport    - клиентът е платил транспорт до адрес
--   client_orders.transport_id      - id на създадената транспортна заявка (NULL = още не е създадена)
--   transport_orders.client_order_id  - обратната връзка към клиентската заявка
--   transport_orders.client_order_num - номерът (in_num) на клиентската заявка, за търсене и по бланката
--   transport_orders.awaiting_stock   - стоката още не е пристигнала в магазина;
--                                       заявката се показва като "Чака стока" и НЕ се брои за просрочена
