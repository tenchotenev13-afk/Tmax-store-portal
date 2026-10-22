-- Rollback на 20261022133218_picking_pallets_schema.
--
-- ГУБИ ДАННИ: всички единици на пикинга и какво е във всяка. Преди rollback:
--   select status, count(*) from picking_pallets group by status;
-- picking.js чете тези таблици при отваряне на „📦 Събиране“ — върни и кода,
-- иначе под-табът показва грешка при зареждане.
drop table if exists public.picking_pallet_items;
drop table if exists public.picking_pallets;
