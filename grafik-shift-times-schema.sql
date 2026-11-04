-- grafik-shift-times-schema.sql — Работен график: начало и край на смените (ВТР чл. 19).
-- Огледало: supabase/migrations/20261104073847_grafik_shift_times.sql (+ _down.sql), приложена 04.11.2026.
-- Rollback: grafik-shift-times-schema-down.sql.
--
-- ЗАЩО (Тенчо, 03.11.2026 — „ДА“ по claude/open/03-11-grafik-shift-times.md): правилата за
-- междудневна почивка ≥ 12 ч. и междуседмична ≥ 36 ч. се смятат по часовник, а в
-- grafik_vtr_codes имаше само нетните часове (hours) и текст (legend).
--
-- start_time / end_time са РАМКАТА на смяната по ВТР (редакция от 01.11.2026, еднаква за
-- ТЦД 3 / ТЦД 4 / Темакс Юг). hours са НЕТНИТЕ часове (с обедната почивка) — двете НЕ се
-- сверяват едно с друго (Д5/З: 08:00–19:30 = 11:30 рамка, 10.5 ч. нетно).
-- Попълват се САМО действащите работни кодове (valid_to NULL, kind 'work') — 18 на брой.
-- Отпадналите от 01.11.2026 (Д7, Д10, Д11, К1–К10) и „К“ (командировка) остават без часове:
-- за тях grafik-engine.js проверява почивката по дни, както досега.
-- Стойностите са преписани от легендата; сухият тест ги сверява машинно с нея.

begin;

do $$
declare n int;
begin
  select count(*) into n from public.grafik_vtr_codes
   where vtr_id = '6a1d0000-0000-4000-8000-000000000001' and kind = 'work' and valid_to is null;
  if n <> 18 then raise exception 'очаквани 18 действащи работни кода, намерени %', n; end if;
end $$;

alter table public.grafik_vtr_codes add column start_time time;
alter table public.grafik_vtr_codes add column end_time time;

update public.grafik_vtr_codes c set start_time = v.s::time, end_time = v.e::time
  from (values
    ('Д1/Л','08:00','17:00'), ('Д2/Л','11:00','20:00'), ('Д4/Л','08:00','20:00'), ('Д5/3','16:00','20:00'),
    ('Д1/З','08:00','17:00'), ('Д2/З','10:00','19:00'), ('Д3/З','10:30','19:30'), ('Д4/З','08:00','19:00'),
    ('Д5/З','08:00','19:30'), ('Д8','08:30','15:00'), ('Д9','15:00','19:00'), ('К11','08:30','15:30'),
    ('Д3','08:30','17:30'), ('Д5/1','08:00','12:00'), ('Д5/2','13:00','17:00'),
    ('Д6/1','08:30','18:30'), ('Д6/2','08:30','17:30'), ('Д6/3','09:30','18:30')
  ) as v(code, s, e)
 where c.vtr_id = '6a1d0000-0000-4000-8000-000000000001' and c.code = v.code
   and c.kind = 'work' and c.valid_to is null;

do $$
declare n int;
begin
  select count(*) into n from public.grafik_vtr_codes where start_time is not null;
  if n <> 18 then raise exception 'очаквани 18 кода с начало/край, намерени %', n; end if;
  select count(*) into n from public.grafik_vtr_codes where start_time is not null and end_time <= start_time;
  if n <> 0 then raise exception 'краят е преди началото при % кода', n; end if;
end $$;

commit;
