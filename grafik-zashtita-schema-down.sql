-- grafik-zashtita-schema-down.sql — rollback на grafik-zashtita-schema.sql.
-- ПРЕДИ него: grafik-api върнат на версия, която не чете can_reset_pin / grafik_pin / grafik_audit
-- (иначе repo.ts пада с 42703 / 42P01), и стъпка 2 върната (grafik-access-roles-schema-down.sql) —
-- иначе редовете view / edit не минават старото ограничение.
-- Губят се: ПИН-овете (всеки задава нов при следващото пускане) и одитът на четенето.
-- Промените (подаване, одобрение…) остават и в audit_log, както преди.

begin;
select cron.unschedule('grafik-audit-retention');
drop table public.grafik_audit;
drop function public.grafik_pin_reserve(uuid);
drop table public.grafik_pin;
alter table public.grafik_access drop column can_reset_pin;
alter table public.grafik_access drop constraint grafik_access_list_check;
alter table public.grafik_access add constraint grafik_access_list_check check (list in ('beta', 'trz'));
commit;
