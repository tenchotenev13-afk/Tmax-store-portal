-- Rollback на grafik_shift_times: махат се колоните за начало и край на смяната.
-- grafik-engine.js без тях се връща към проверката на почивката по дни.
begin;

alter table public.grafik_vtr_codes drop column end_time;
alter table public.grafik_vtr_codes drop column start_time;

commit;
