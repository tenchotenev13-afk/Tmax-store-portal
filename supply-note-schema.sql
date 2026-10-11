-- supply-note-schema.sql
-- Огледало на supabase/migrations/20261011120000_supply_entries_note.sql.
--
-- ЗАЩО. Обектът иска да каже нещо по реда на бланката за Зареждане
-- („няма място на щанда", „доставчикът е спрял артикула") — досега само по
-- телефона. Незадължителен коментар на ред: артикул × обект × седмица.
--
-- note null = без коментар. Празен низ НЕ се записва — supply.js праща null
-- (supplyReadNote), за да няма два вида „празно". Коментарът НЕ прави реда
-- „попълнен": броенето „Попълнили N от M" в supply.js и send-routed-report
-- и supply_store_done() гледат само qty1/qty2. Тригерът
-- supply_sync_entries_upd реагира само на qty/обект/седмица/бланка, тоест
-- редакция само на коментара не пуска supply_sync_completions.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 11.10.2026): 1004 реда в
-- supply_entries; колоната е nullable без default — нито един ред не става
-- невалиден. Права: anon/authenticated имат SELECT/INSERT/UPDATE на ниво
-- таблица (не колонни), тоест новата колона ги наследява; RLS политиките
-- (supply_entries_select/insert/update) не изброяват колони.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push на supply.js и ПРЕДИ деплоя на
-- send-routed-report — иначе PostgREST връща 400 (непозната колона) и
-- записът от обектите пада, а секцията в имейла излиза червена.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261011120000_supply_entries_note_down.sql

alter table public.supply_entries add column note text;

comment on column public.supply_entries.note is
  'Незадължителен коментар от обекта на реда (supply.js). null = без коментар; празен низ не се записва. Не прави реда попълнен.';
