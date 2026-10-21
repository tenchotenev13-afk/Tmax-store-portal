-- Rollback на 20261021090405_picking_schema.
--
-- ГУБИ ДАННИ: всички качвания и отметките на склада (взето / пропуснато /
-- коментари). Преди rollback:
--   select status, count(*) from picking_lines group by status;
-- picking.js чете тези таблици при отваряне на под-таба — върни и кода,
-- иначе „📦 Пикинг" показва грешка при зареждане.
drop table if exists public.picking_lines;
drop table if exists public.picking_batches;
delete from public.app_settings where key = 'picking_users';
