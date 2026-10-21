-- Rollback на 20261021050606_minusi_seed — маха началните данни. Ако вече има качени
-- движения, minus_reasons не може да се изтрие (reason_id сочи към нея) —
-- тогава първо 20261021050541_minusi_schema_down.
delete from public.app_settings where key = 'minus_stores';
delete from public.minus_uom_thresholds where uom in ('M2', 'ЛМ');
delete from public.minus_reasons where id between 1 and 19;
delete from public.minus_plants;
