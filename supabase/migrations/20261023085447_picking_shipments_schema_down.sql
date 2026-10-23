-- Rollback на 20261023085447_picking_shipments_schema.
--
-- ГУБИ ДАННИ: всички транспорти и кога / от кого са тръгнали и приети.
-- shipment_id / loaded_* / received_* в picking_pallets остават, но без
-- връзка. Преди rollback:
--   select status, count(*) from picking_shipments group by status;
-- picking.js чете picking_shipments в „🚚 Изпращане“ — върни и кода.
alter table public.picking_pallets drop constraint if exists picking_pallets_shipment_fk;
drop index if exists public.picking_pallets_shipment_idx;
drop table if exists public.picking_shipments;
