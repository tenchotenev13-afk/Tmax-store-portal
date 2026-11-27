-- grafik-changes-trip-schema-down.sql — rollback на grafik-changes-trip-schema.sql.
-- ПРЕДИ него: grafik-api върнат на версия без „К“ / trip_store (иначе repo.ts чете липсваща колона).
-- Редовете с „К“ се трият (старото ограничение не ги допуска) — обектите получатели се губят.

begin;
delete from public.grafik_changes where actual = 'К';
alter table public.grafik_changes drop constraint grafik_changes_trip_store_check;
alter table public.grafik_changes drop column trip_store;
alter table public.grafik_changes drop constraint grafik_changes_actual_check;
alter table public.grafik_changes add constraint grafik_changes_actual_check
  check (actual in ('ЛД','ЗД','П','В','М','почивка','О','Б','Н','Д','А','С','Майч'));
commit;
