-- transfer-events-unit-schema.sql
-- Междускладови трансфери — приемане ПО ЕДИНИЦА: transfer_cargo_events.unit.
-- ПРИЛОЖЕНО В SUPABASE НА 15.10.2026 като миграция 20261015132314_transfer_events_unit
-- и прочетено обратно (integer, NULL, без default, 0 попълнени от 18 реда;
-- индексът transfer_cargo_events_unit_once — уникален, частичен, valid;
-- коментарът е там). Този файл е ОГЛЕДАЛО на миграцията, не източник.
-- Rollback: supabase/migrations/20261015132314_transfer_events_unit_down.sql.
-- Предишни: transfers-schema.sql · transfers-events-schema.sql ·
-- transfer-cargo-loaded-at-schema.sql · transfer-cargo-prev-schema.sql ·
-- transfers-plate-schema.sql.
--
-- „Получен" и „Разтоварен" се отбелязват за всеки кашон / палет / руло /
-- насип поотделно; товарът е приключен, когато всички единици 1..qty са
-- отбелязани. unit null = целият товар: старите отметки (преди 15.10.2026),
-- handed_to_courier, resolved и „Проблем" за целия товар.
-- Проверено 15.10.2026: 18 отметки, 2 от тях на товари с qty > 1 (received,
-- Враца 14.10 и Раднево 15.10) — остават валидни за целия товар. Няма
-- unique индекс по отметките.
-- Индексът пази от двойна отметка на една и съща единица (две телефонни
-- сканирания едновременно): вторият INSERT връща 23505 / 409.

alter table public.transfer_cargo_events add column if not exists unit integer null;

comment on column public.transfer_cargo_events.unit is
  'Номер на единицата (1..qty) при received/unloaded/problem; null = целият товар (стари отметки, handed_to_courier, resolved)';

create unique index if not exists transfer_cargo_events_unit_once
  on public.transfer_cargo_events (cargo_id, store_name, event, unit)
  where event in ('received', 'unloaded') and unit is not null;

-- rollback:
-- drop index if exists transfer_cargo_events_unit_once;
-- alter table public.transfer_cargo_events drop column if exists unit;
