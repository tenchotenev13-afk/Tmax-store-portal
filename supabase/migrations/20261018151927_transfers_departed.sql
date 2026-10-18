-- 20261018151927_transfers_departed — огледало: transfers-departed-schema.sql.
-- Приложено 18.10.2026 с apply_migration; версията е дадена от базата.

alter table public.transfers
  add column if not exists departed_at timestamptz null,
  add column if not exists departed_by text null;

comment on column public.transfers.departed_at is
  'Кога е тръгнал бусът / камионът („🚚 Тръгна"). NULL = не е отбелязано (куриер или стар запис).';
comment on column public.transfers.departed_by is
  'Кой е отбелязал „🚚 Тръгна" (display_name).';
