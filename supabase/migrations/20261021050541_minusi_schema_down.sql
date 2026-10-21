-- Rollback на 20261021050541_minusi_schema.
--
-- ГУБИ ДАННИ: всички качени движения 955/956 и всичко, попълнено от обектите
-- (заметнат код, причина, служител, бележка). Преди rollback:
--   select count(*), count(reason_id) from minus_movements;
-- minusi.js чете тези таблици при отваряне на под-таба — върни и кода,
-- иначе „➖ Минуси" показва грешка при зареждане.
delete from public.app_settings where key = 'minus_stores';
drop table if exists public.minus_movements;
drop table if exists public.minus_uploads;
drop table if exists public.minus_reasons;
drop table if exists public.minus_uom_thresholds;
drop table if exists public.minus_plants;
