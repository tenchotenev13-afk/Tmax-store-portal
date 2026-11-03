-- Rollback на grafik_sectors: маха sector_id, таблицата с секторите и етикетите на
-- сезоните. Старата колона grafik_staff.sector (текстът от бланката) не е пипана от
-- миграцията и остава. Секторите, добавени после от екрана, се губят — износ преди това.
begin;

alter table public.grafik_staff drop column sector_id;
drop table public.grafik_sectors;
alter table public.grafik_vtr_seasons drop column labels;

commit;
