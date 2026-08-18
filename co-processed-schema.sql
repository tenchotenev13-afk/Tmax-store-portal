-- Статус "Обработена от ЦО" за клиентски заявки
-- Централен офис обработва заявките, които магазините пускат към доставчици,
-- свързва се с доставчика и отбелязва, че поръчката е пусната.
-- Приложена в Supabase на 18.08.2026 (миграция: co_processed_client_orders)

alter table client_orders add column if not exists co_eta date;
alter table client_orders add column if not exists co_note text;
alter table client_orders add column if not exists co_processed_at timestamptz;
alter table client_orders add column if not exists co_processed_by text;

create index if not exists idx_client_orders_fulfiller on client_orders(fulfiller);

-- Значение на колоните:
--   co_eta           - ориентировъчна дата за получаване в обекта, подадена от ЦО
--   co_note          - кратък коментар от ЦО (доставчик, № на поръчка)
--   co_processed_at  - кога ЦО е отбелязал заявката
--   co_processed_by  - кой от ЦО я е отбелязал
--
-- НОВА СТОЙНОСТ в client_orders.status: 'processed'
--   Пълен списък на статусите: pending, processed, sent, arrived, done,
--   refused, postponed (и остарялото approved - 1 запис).
--   Потокът е: pending -> processed (ЦО поръча) -> sent (стоката пътува)
--              -> arrived (в магазина) -> done (предадена на клиента).
--   'processed' е стъпка САМО за заявки с fulfiller = 'Централен офис'.
--
-- ВАЖНО за справки: заявка със status='processed' и co_eta в БЪДЕЩЕТО не е
-- закъсняла - чака се доставчикът. Закъсняла е, когато co_eta е минала,
-- а статусът още е 'processed'.
