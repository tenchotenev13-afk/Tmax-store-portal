-- supply-store-notes-schema.sql
-- Огледало на supabase/migrations/20261011200000_supply_store_notes.sql.
--
-- ЗАЩО (решение на Тенчо, 11.10.2026). Снабдяването (роля supply, ЦО)
-- оставя ЕДИН свободен коментар на обект за седмица и бланка — „поръчани 2
-- балатум 4м и 1 мокет, идват сряда" — и обектът го вижда над своята бланка.
-- Цел: обектът да знае какво е поръчано, за да не заявява същото всяка
-- седмица. Нарочно НЕ е структурирано (без статуси, бройки по артикул, връзка
-- с товарни листи) — това идва, когато бланките получат артикулни номера.
--
-- Огледално на supply_entries.note (коментарът на обекта по ред), но на ниво
-- обект, не ред — затова отделна таблица, не колона в supply_entries.
--
-- Един ред на (template_id, store_name, week_start) — supply.js пише с
-- UPSERT (Prefer: resolution=merge-duplicates, on_conflict по уникалността).
-- co_note null = съдържанието е изтрито, редът остава. co_note_at се праща
-- изрично от клиента: default now() важи само при INSERT.
--
-- ПРАВА. RLS включено; политики за anon: select / insert / update, БЕЗ
-- delete — както при supply_entries. Компромисът е същият като в
-- supply-schema.sql: anon ключът е общ за всички, тоест „пишат само supply и
-- admin" е проверка в клиента (supplyCanWriteCoNote), не в базата.
-- Табличните GRANT-ове идват от default privileges на public
-- (anon/authenticated = arwdDxtm, проверено 11.10.2026).
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблицата е нова — 0 засегнати реда.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push на supply.js. Обратното не чупи
-- формата на обекта (четенето е silent), но ЦО вижда червен ред вместо полета.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261011200000_supply_store_notes_down.sql
--   drop table public.supply_store_notes;

create table public.supply_store_notes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.supply_templates(id) on delete cascade,
  store_name text not null,
  week_start date not null,
  co_note text,
  co_note_by text,
  co_note_at timestamptz default now(),
  constraint supply_store_notes_uq unique (template_id, store_name, week_start)
);

comment on table public.supply_store_notes is
  'Зареждане: коментар на Снабдяването към обект за седмица и бланка (какво е поръчано). Един ред на бланка × обект × седмица.';

alter table public.supply_store_notes enable row level security;
create policy supply_store_notes_select on public.supply_store_notes for select to anon using (true);
create policy supply_store_notes_insert on public.supply_store_notes for insert to anon with check (true);
create policy supply_store_notes_update on public.supply_store_notes for update to anon using (true) with check (true);
