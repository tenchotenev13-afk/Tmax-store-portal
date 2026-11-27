-- grafik-changes-trip-schema.sql — Работен график, пакет 1, т.6 (решение на Тенчо 27.11.2026):
-- „К“ (командировка) като „реално“ в „✎ Промени“, със задължителен обект, където е командирован човекът.
-- trip_store — името на обекта получател (stores.name), проверява го grafik-api (съществува, не е своят).
-- Без FK към stores: обектът може да се преименува, а записът трябва да пази какво е било тогава.
-- Пакет 4 ще ползва същото поле (часовете при обекта получател); графикът ще пази обекта на „К“ отделно.
-- Ограничението: обект има ТОЧНО когато „реално“ е К.
-- Rollback: grafik-changes-trip-schema-down.sql.

alter table public.grafik_changes drop constraint grafik_changes_actual_check;
alter table public.grafik_changes add constraint grafik_changes_actual_check
  check (actual in ('ЛД','ЗД','П','В','М','К','почивка','О','Б','Н','Д','А','С','Майч'));
alter table public.grafik_changes add column trip_store text;
alter table public.grafik_changes add constraint grafik_changes_trip_store_check
  check ((actual = 'К') = (trip_store is not null and btrim(trip_store) <> ''));
