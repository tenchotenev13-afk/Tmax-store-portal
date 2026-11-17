-- loading_wrong_store (17.11.2026, сесия ll-wrong-store) — loading-wrong-store-schema.sql
-- „🔀 За друг обект" в Товарни листи. RLS/права не се пипат (anon_all_loading_list_items
-- е for all за anon, UPDATE за anon на ниво таблица). Rollback: *_down.sql.
alter table public.loading_list_items
  add column if not exists wrong_store           text,
  add column if not exists wrong_store_by        text,
  add column if not exists wrong_store_at        timestamptz,
  add column if not exists wrong_store_note      text,
  add column if not exists wrong_store_done_by   text,
  add column if not exists wrong_store_done_at   timestamptz,
  add column if not exists wrong_store_done_note text;

comment on column public.loading_list_items.wrong_store is
  'Обектът, за който е стоката на реда, когато обектът получател е маркирал „🔀 За друг обект" (17.11.2026). NULL = не е маркиран. Не е received и не е missing; без check — правилото е в loading.js.';
comment on column public.loading_list_items.wrong_store_by is 'Кой е маркирал „🔀 За друг обект".';
comment on column public.loading_list_items.wrong_store_at is 'Кога е маркиран „🔀 За друг обект".';
comment on column public.loading_list_items.wrong_store_note is 'Коментарът на обекта при „🔀 За друг обект" (задължителен в клиента).';
comment on column public.loading_list_items.wrong_store_done_by is 'Кой от склада е уредил случая „🔀 За друг обект".';
comment on column public.loading_list_items.wrong_store_done_at is 'Кога складът е уредил случая; NULL = чака склада.';
comment on column public.loading_list_items.wrong_store_done_note is 'Какво е направил складът (трансфер, връщане…), задължително в клиента.';
