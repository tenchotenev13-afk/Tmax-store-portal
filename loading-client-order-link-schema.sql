-- loading-client-order-link-schema.sql
-- Товарни листи, етап 2 на клиентските заявки: връзка ред ↔ заявка
-- (17.11.2026, сесия ll-co-link). Стъпва на блока „📋 Дължими клиентски
-- заявки" (2e99059) и „➕" (dc8aaa0).
-- ПРИЛОЖЕНО В СУПАБЕЙС НА 17.11.2026 — миграция 20261117125425_loading_client_order_link
-- (supabase/migrations/, + _down.sql). Сверено след прилагането: uuid,
-- nullable, без default, 0 попълнени; anon GET/PATCH по колоната — 200.
--
-- ЗА КАКВО СЛУЖИ
-- „➕" в редактора слага id-то на заявката на единицата; записът го пише на
-- всичките ѝ редове (единица с няколко документа = няколко реда). При
-- „📤 Изпрати към обектите" заявките със статус pending / processed /
-- approved и изпълнител = склада на листа стават „Изпратена".
-- Дотук връзката беше само текстът „КЗ <№>" в warehouse_comment.
--
-- БЕЗ ВЪНШЕН КЛЮЧ И БЕЗ CHECK — огледалото на Живко прави пълен UPSERT през
-- PostgREST и не държи client_orders в същия ред; изтрита заявка оставя
-- „висящ" id, който клиентът брои за непроверен (не за „няма").
-- Редовете, добавени от обекта (added_by_store), и всички копия остават NULL —
-- правилото е в loading.js.
--
-- ФАКТИ (база, 17.11.2026, преди миграцията): loading_list_items 3074 реда,
-- loading_lists 111 (draft 9, sent 16, partial 3, done 83). Колона
-- client_order_id няма. Редове с „КЗ " в warehouse_comment — 0 (тестовата
-- чернова от проверката на „➕" е изтрита в ll-co-test-cleanup). Тригери и
-- изгледи върху таблицата — няма. Нова nullable колона без default не прави
-- нито един ред невалиден.
-- Четци с изричен списък колони (transfers.js:623, notifications.js:436,
-- bulletin-notify/index.ts:2141) не я искат и не се чупят; останалите са
-- select=* (LL_ITEM_SELECT, tools/regression/fetch.js).
--
-- RLS / права: не се пипат. anon_all_loading_list_items е `for all` за anon,
-- а anon има INSERT/SELECT/UPDATE на ниво таблица (проверено 17.11.2026) —
-- новата колона се покрива автоматично.
--
-- Индексът е за проверката „в друг неприключен лист" и за
-- client_order_id=in.(…); в огледалото не влиза.

alter table public.loading_list_items
  add column if not exists client_order_id uuid;

create index if not exists loading_list_items_client_order_idx
  on public.loading_list_items (client_order_id)
  where client_order_id is not null;

comment on column public.loading_list_items.client_order_id is
  'Клиентската заявка (client_orders.id), сложена с „➕" от блока „Дължими клиентски заявки" (17.11.2026). NULL = без връзка. Без FK — огледалото. При изпращане на листа заявката става „Изпратена", ако е pending/processed/approved и изпълнителят е складът.';

-- ОТКАТ (_down.sql) — връзките се губят (коментарът „КЗ …" остава). Преди това:
--   select id, list_id, store_name, client_order_id
--   from loading_list_items where client_order_id is not null;
-- drop index if exists public.loading_list_items_client_order_idx;
-- alter table public.loading_list_items drop column if exists client_order_id;
