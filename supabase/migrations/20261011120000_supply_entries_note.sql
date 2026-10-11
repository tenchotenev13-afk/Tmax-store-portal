-- Миграция: supply_entries.note (11.10.2026). Описанието — в supply-note-schema.sql.
alter table public.supply_entries add column note text;

comment on column public.supply_entries.note is
  'Незадължителен коментар от обекта на реда (supply.js). null = без коментар; празен низ не се записва. Не прави реда попълнен.';
