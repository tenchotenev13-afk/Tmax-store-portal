-- Приложено в Supabase на 25.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_list_photos (version 20260925083934)
--
-- Снимки към товарен лист: при ИЗПРАЩАНЕ (задължителни, поне 2) и при
-- ПОЛУЧАВАНЕ (по избор, без минимум). Целта е да се хване щета при
-- транспорт, неправилно натоварване или стречоване — затова двата края се
-- показват един до друг: снимка отпреди тръгване, която никой не сравнява с
-- пристигането, не доказва нищо.
--
-- Файлът е записан СЛЕД прилагането. Обратното четене потвърди седемте
-- колони: id / list_id / store_name / stage / path — всичките NOT NULL,
-- uploaded_by nullable, uploaded_at NOT NULL default now().
--
-- ЗАЩО ОТДЕЛНА ТАБЛИЦА, А НЕ jsonb КОЛОНА
-- Таблицата е източникът за бъдещия общ архив на снимките (подтаб
-- „📷 Снимки" в История), където се филтрира по ОБЕКТ и по ДАТА. Върху jsonb
-- това е пълно сканиране на loading_lists при всяко отваряне; върху редове е
-- индекс.
--
-- store_name Е NOT NULL И ПРИ ДВЕТЕ СТРАНИ.
-- Първоначалната идея беше null да значи „снимка при изпращане", но тогава
-- архивът не може да отговори на „покажи всичко за Петрич" — а точно това е
-- смисълът му. Затова колоната винаги носи ЧИЯ е снимката:
--   stage = 'sent'     → ИЗПРАЩАЧЪТ (loading_lists.warehouse — склад ИЛИ
--                        магазин, откакто магазин може да изпраща, 23.09.2026)
--   stage = 'received' → ПОЛУЧАВАЩИЯТ обект
-- Разликата между двете страни я носи stage; втори признак за същото
-- (наличие/липса на стойност) се разминава пръв.
--
-- БЕЗ CHECK по stage — същото правило като loading_missing и
-- loading_store_added_rows: огледалото на Живко не носи value CHECK-ове, а
-- единственият, който пише тук, е loading.js.
--
-- path е ПЪЛНИЯТ публичен URL, както в Разлики (diffUploadPhoto). Не е ключ в
-- bucket-а: сменѝ ли се хостът, старите редове пак сочат нещо, което се отваря.
-- Storage: съществуващият bucket bulletin-files, префикс loading-lists/<list_id>/.
--
-- Правило 9 (проверено преди прилагането): loading_lists = 4 реда,
-- loading_list_items = 8. Нова таблица — нула засегнати записа.
--
-- ЗА ЖИВКО: НОВА ТАБЛИЦА → mirror-schema.sql и $TableColumns в sync-mirror.ps1.
-- Бележка: claude/loading-photos-2026-09-25.md
-- Копие на DDL-а в корена: loading-list-photos-schema.sql
--
-- Rollback: supabase/migrations/20260925083934_loading_list_photos_down.sql

create table if not exists public.loading_list_photos (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.loading_lists(id) on delete cascade,
  store_name  text not null,
  stage       text not null,
  path        text not null,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

-- Картата на обекта и прегледът на склада четат по лист — това е горещият път.
create index if not exists loading_list_photos_list_idx
  on public.loading_list_photos (list_id);

-- Бъдещият архив: „обект X, най-новите отгоре". Съставен, защото двете
-- условия винаги вървят заедно; отделен индекс по дата не би помогнал.
create index if not exists loading_list_photos_store_date_idx
  on public.loading_list_photos (store_name, uploaded_at desc);

-- „Всички снимки при изпращане" / „при получаване" през целия архив.
create index if not exists loading_list_photos_stage_idx
  on public.loading_list_photos (stage);

grant all on table public.loading_list_photos to anon, authenticated, service_role;

alter table public.loading_list_photos enable row level security;

create policy anon_all_loading_list_photos on public.loading_list_photos
  as permissive
  for all
  to anon
  using (true)
  with check (true);

comment on table public.loading_list_photos is
  'Снимки към товарен лист — при изпращане (поне 2, задължителни) и при получаване (по избор). Източник за бъдещия архив „📷 Снимки" в История. Редовете се трият каскадно с листа.';
comment on column public.loading_list_photos.list_id is
  'Товарният лист. on delete cascade — снимките нямат смисъл без него.';
comment on column public.loading_list_photos.store_name is
  'ЧИЯ е снимката. При stage=sent това е ИЗПРАЩАЧЪТ (loading_lists.warehouse); при stage=received — получаващият обект. NOT NULL и при двете, за да може архивът да филтрира по обект.';
comment on column public.loading_list_photos.stage is
  'sent | received. БЕЗ check в базата — стойностите се пазят в клиента (loading.js), по модела на loading_missing и заради огледалото.';
comment on column public.loading_list_photos.path is
  'ПЪЛЕН публичен URL към обекта в bucket bulletin-files, префикс loading-lists/<list_id>/. Същата конвенция като снимките в Разлики.';
comment on column public.loading_list_photos.uploaded_by is
  'display_name или email на качилия. Само той може да трие снимката, и то докато листът не е приключен (правилото е в клиента).';
comment on column public.loading_list_photos.uploaded_at is
  'Кога е качена. NOT NULL default now() — архивът се подрежда по нея.';
