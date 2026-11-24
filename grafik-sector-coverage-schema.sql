-- grafik-sector-coverage-schema.sql — Работен график: сектор „следи покритието“ (24.11.2026).
-- Огледало: supabase/migrations/20261124081201_grafik_sector_coverage.sql (+ _down.sql), приложена 24.11.2026.
-- Rollback: grafik-sector-coverage-schema-down.sql.
--
-- ЗАЩО (Тенчо, 24.11.2026, след проверката на живо на етап А5): секторите с един човек
-- (Управление, Хигиена, Машинки в Кърджали) дават червена точка „сектор без човек“ в 21 от
-- 30 дни и шумът скрива истинските дупки. Сектор с track_coverage = false не се брои в
-- „Сектори без човек“, в червените колони и в точката над деня; редът му „на смяна“ остава,
-- без червено. По подразбиране — включено (както досега); сменя го admin / регионалният
-- в „👥 Персонал“ (grafik-api, действие sector_update).
--
-- ПРАВА: без промяна — grafik_sectors е с RLS без политики и без права за anon/authenticated.
--
-- ЗАВАРЕНИ ДАННИ (правило 9, 24.11.2026): grafik_sectors — 25 реда (Кърджали 14, Раднево 11),
-- всички получават true. Нищо не става невалидно.

begin;

do $$
declare n int;
begin
  select count(*) into n from public.grafik_sectors;
  if n <> 25 then raise exception 'очаквани 25 сектора, намерени %', n; end if;
end $$;

alter table public.grafik_sectors add column track_coverage boolean not null default true;

comment on column public.grafik_sectors.track_coverage is
  'Следи покритието: false → секторът не се брои в „Сектори без човек“ / червените колони на графика (24.11.2026).';

commit;
