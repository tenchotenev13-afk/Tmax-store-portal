-- loading-wrong-store-schema.sql
-- Товарни листи: „🔀 За друг обект" (17.11.2026, сесия ll-wrong-store).
-- ПРИЛОЖЕНО В СУПАБЕЙС НА 17.11.2026 — миграция 20261117083038_loading_wrong_store
-- (supabase/migrations/, + _down.sql). Сверено след прилагането срещу
-- information_schema.columns: 7 колони, всички nullable, без default.
-- Допълва loading-lists-schema.sql и loading-lists-missing-schema.sql.
--
-- ЗА КАКВО СЛУЖИ
-- Обектът маркира ред (палет/единица), чиято стока физически е за ДРУГ обект.
-- Повод: 17.11 Габрово получи в листа от 12.11 (Търговище) палет с входяща
-- стока за друг обект; дотук това беше само свободен коментар и складът не
-- научаваше.
--
-- ЧЕТИРИТЕ СЪСТОЯНИЯ НА ЕДИН РЕД
--   received = false, missing = false, wrong_store is null -> чака
--   received = true                                          -> прието
--   missing  = true                                          -> заявена липса
--   wrong_store is not null                                  -> стоката е за друг обект
-- Взаимното изключване НЕ е CHECK — по същата причина като при missing
-- (огледалото копира редове през PostgREST); правилото живее в loading.js
-- (llHandled, llWrongSubmit). Справка „чакащи" пише и `wrong_store is null`.
--
-- wrong_store_done_* е уреждането от склада (какво е направено: трансфер,
-- връщане…). Неуреден случай = wrong_store is not null and wrong_store_done_at is null.
--
-- RLS / права: не се пипат. anon_all_loading_list_items е `for all` за anon, а
-- anon има UPDATE на ниво таблица (проверено 17.11.2026) — новите колони се
-- покриват автоматично.

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

-- ОТКАТ (_down.sql) — данните в колоните се губят. Преди това:
--   select id, list_id, store_name, wrong_store, wrong_store_note, wrong_store_done_note
--   from loading_list_items where wrong_store is not null;
-- alter table public.loading_list_items
--   drop column if exists wrong_store_done_note,
--   drop column if exists wrong_store_done_at,
--   drop column if exists wrong_store_done_by,
--   drop column if exists wrong_store_note,
--   drop column if exists wrong_store_at,
--   drop column if exists wrong_store_by,
--   drop column if exists wrong_store;
