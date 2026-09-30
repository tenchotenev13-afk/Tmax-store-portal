-- Rollback на transfer_cargo_prev_cargo_id (етап 3 — прехвърляне).
-- Без загуба само докато нищо не е прехвърлено:
--   select count(*) from public.transfer_cargo where prev_cargo_id is not null;
-- След първото прехвърляне rollback-ът къса веригите: новите редове остават,
-- но вече не знаят от кой товар продължават, а старите пак изглеждат като
-- „чака прехвърляне" в портала.
drop index if exists public.transfer_cargo_prev_uidx;
alter table public.transfer_cargo drop column if exists prev_cargo_id;
