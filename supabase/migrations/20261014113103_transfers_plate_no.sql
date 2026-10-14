-- 20261014113103_transfers_plate_no — огледало: transfers-plate-schema.sql.
-- Приложено 14.10.2026 с apply_migration; версията е дадена от базата.

alter table public.transfers add column if not exists plate_no text null;

comment on column public.transfers.plate_no is
  'Регистрационен номер на камиона (mode = ''truck''). NULL за бус и куриер.';
