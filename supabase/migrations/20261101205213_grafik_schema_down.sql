-- Rollback на grafik_schema (Работен график, етап 1а), версия 20261101205213.
-- Сух тест 01.11.2026: миграция + този скрипт в една транзакция с отказ → 0 таблици,
-- 0 дружества, 0 обекта с company_id, 0 ключа grafik_*, companies с anon_all_companies
-- и пълните права на anon/authenticated — точно заварените.
-- ВНИМАНИЕ: трие и данните на модула (персонал, графици). Ако вече има
-- въведени графици — първо износ, после rollback.
-- companies се връща към заварените права (anon_all_companies + пълни права),
-- а двете дружества от миграцията се трият заедно с връзките си.
begin;

delete from public.app_settings where key in ('grafik_beta_users','grafik_trz_users');

update public.stores set company_id = null
 where company_id in ('6a1d0000-0000-4000-8000-0000000000c3','6a1d0000-0000-4000-8000-0000000000a1');

drop table public.grafik_rows;
drop table public.grafik_months;
drop table public.grafik_staff;
drop table public.grafik_extra_days;
drop table public.grafik_store_company;
drop table public.grafik_company_terms;
drop table public.grafik_letter_map;
drop table public.grafik_vtr_seasons;
drop table public.grafik_vtr_codes;
drop table public.grafik_vtr;

delete from public.companies
 where id in ('6a1d0000-0000-4000-8000-0000000000c3','6a1d0000-0000-4000-8000-0000000000a1');

drop policy anon_select_companies on public.companies;
grant insert, update, delete, truncate, references, trigger on public.companies to anon, authenticated;
create policy anon_all_companies on public.companies for all to anon using (true) with check (true);

commit;
