-- grafik-sector-coverage-schema-down.sql — rollback на grafik-sector-coverage-schema.sql.
-- Губи само изборите „не следи покритието“ (след rollback всички сектори се броят, както преди).
-- Преди rollback: grafik-api трябва да е върнат на версия, която НЕ чете track_coverage
-- (иначе select-ът в repo.ts пада с 42703).

begin;
alter table public.grafik_sectors drop column track_coverage;
commit;
