-- Rollback на 20261123202341_revaluation_units_existing_data
-- Трие номерата, създадени от data миграцията (Шумен-П0001…П0010) и връща
-- брояча на Шумен на 0. Само ако след нея НЯМА нови номера за Шумен —
-- иначе нулираният брояч би дал дубликат. Преди rollback:
--   select unit_no, created_at from revaluation_units where store_name = 'Шумен' order by unit_no;
delete from public.revaluation_units
 where store_name = 'Шумен' and unit_no between 'Шумен-П0001' and 'Шумен-П0010';
update public.revaluation_unit_counters set last_num = 0
 where store_name = 'Шумен'
   and not exists (select 1 from public.revaluation_units where store_name = 'Шумен');
