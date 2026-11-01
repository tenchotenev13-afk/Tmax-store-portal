-- Rollback на grafik_companies_seed: връща състоянието след grafik_schema
-- (2 дружества, 3 обекта: Кърджали, Шумен, Раднево).
begin;

update public.stores set company_id = null
 where name in (select store_name from public.grafik_store_company where valid_from = '2026-11-01');

delete from public.grafik_store_company where valid_from = '2026-11-01'
   and company_id in ('6a1d0000-0000-4000-8000-0000000000c3','6a1d0000-0000-4000-8000-0000000000c4',
                      '6a1d0000-0000-4000-8000-0000000000a1','6a1d0000-0000-4000-8000-0000000000c2');

update public.grafik_store_company set blank_name = '"Темакс" – КЪРДЖАЛИ' where store_name = 'Кърджали' and valid_from is null;
update public.grafik_store_company set blank_name = '"Темакс" - Шумен'    where store_name = 'Шумен'    and valid_from is null;

delete from public.grafik_company_terms where company_id = '6a1d0000-0000-4000-8000-0000000000c4';
delete from public.companies where id in ('6a1d0000-0000-4000-8000-0000000000c4','6a1d0000-0000-4000-8000-0000000000c2');

commit;
