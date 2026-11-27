-- Rollback на 20261127084628_revaluation_unit_prefix_data: всеки къс номер
-- (вкл. раздадените след миграцията) → '<обект>-П0007'. Пуска се ПРЕДИ
-- rollback-а на схемата (той маха stores.unit_prefix).
update public.revaluation_units u
   set unit_no = u.store_name || '-П' ||
       case when substring(u.unit_no from '^[A-Z]{2}(\d+)$')::int < 10000
            then lpad(substring(u.unit_no from '^[A-Z]{2}(\d+)$'), 4, '0')
            else substring(u.unit_no from '^[A-Z]{2}(\d+)$') end
 where u.unit_no ~ '^[A-Z]{2}\d+$';
