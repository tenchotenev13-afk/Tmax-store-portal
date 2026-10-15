-- 20261015132314_transfer_events_unit — огледало: transfer-events-unit-schema.sql.
-- Приложено 15.10.2026 с apply_migration; версията е дадена от базата.

alter table public.transfer_cargo_events add column if not exists unit integer null;

comment on column public.transfer_cargo_events.unit is
  'Номер на единицата (1..qty) при received/unloaded/problem; null = целият товар (стари отметки, handed_to_courier, resolved)';

create unique index if not exists transfer_cargo_events_unit_once
  on public.transfer_cargo_events (cargo_id, store_name, event, unit)
  where event in ('received', 'unloaded') and unit is not null;
