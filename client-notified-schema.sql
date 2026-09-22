-- Клиентски заявки: отметка „📞 Уведомен" при пристигнала стока.
-- Магазинът отбелязва, че е уведомил клиента; другата смяна вижда кой и кога.
-- Пуска се ПРЕДИ деплоя на client-orders.js. Двете колони са nullable,
-- без default — съществуващите редове остават NULL („не е уведомяван").

alter table client_orders
  add column if not exists client_notified_at timestamptz,
  add column if not exists client_notified_by text;

-- Rollback:
-- alter table client_orders
--   drop column if exists client_notified_at,
--   drop column if exists client_notified_by;
