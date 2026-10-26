-- SQL тест на checklist_portal_values() (checklist-live-calc, етап 1; 26.10.2026).
-- Миграции 20261026120000_weekly_checklist_portal_mode +
--          20261026120100_checklist_portal_values.
--
-- КАК СЕ ПУСКА. След като миграциите са приложени — САМ, като една заявка през
-- Supabase MCP execute_sql. Файлът завършва с raise exception, значи се връща
-- назад ВСИЧКО: тестовите обекти, задачи, колони и отметки. Гейтът е текстът
-- „SQL-ТЕСТ ОК" в съобщението, не това, че има грешка.
--
-- ОБЕКТИТЕ, ЗАДАЧИТЕ И КОЛОНИТЕ СА ИЗМИСЛЕНИ ('__sqltest_*'); проверките гледат
-- само тях. Реалните колони „Стока за връщане" / „Сторна по грешни приеми" се
-- питат за тестов обект — той няма редове в тези таблици.
--
-- Седмица 43/2026: пон 19.10 … нд 25.10 (предходната: пон 12.10 … пт 16.10).
-- Седмица 53/2026: пон 28.12.2026 … нд 03.01.2027 (петък = 01.01.2027).
-- Седмица 1/2027:  пон 04.01.2027.

create or replace function pg_temp.t(cond boolean, msg text) returns text
language sql as $$ select case when coalesce(cond, false) then '' else E'\n  ПАДНА: ' || msg end $$;

-- Стойността на една клетка; '(няма ред)' — ако функцията изобщо не връща реда.
create or replace function pg_temp.v(p_year int, p_week int, p_store text, p_key text) returns text
language sql as $$
  select coalesce((select coalesce(value, '∅') from public.checklist_portal_values(p_year, p_week)
                    where store_name = p_store and metric_key = p_key), '(няма ред)')
$$;

create or replace function pg_temp.run_checks() returns text language plpgsql as $f$
declare
  fails text := '';
  got text;
begin
  -- 1. any (сряда): свършено в сряда → da; в четвъртък → ne.
  got := pg_temp.v(2026, 43, '__sqltest_a', '__sqltest_any');
  fails := fails || pg_temp.t(got = 'da', 'any: сряда → da, а е ' || got);
  got := pg_temp.v(2026, 43, '__sqltest_b', '__sqltest_any');
  fails := fails || pg_temp.t(got = 'ne', 'any: четвъртък → ne, а е ' || got);

  -- 2. count (пон–пет): пон, вт, чет → 3/5; без записи → 0/5 (не NULL).
  got := pg_temp.v(2026, 43, '__sqltest_a', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '3/5', 'count: пон, вт, чет → 3/5, а е ' || got);
  got := pg_temp.v(2026, 43, '__sqltest_b', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '0/5', 'count: без записи → 0/5, а е ' || got);

  -- 3. пренасяне: от пон 12.10 в ср 21.10 (дължим ден) → попадение по ПЪРВОНАЧАЛНАТА
  --    дата, знаменател +1 → 1/6. От пт 23.10 в пн 26.10 (извън седмицата),
  --    отложено → знаменател −1 → 0/4.
  got := pg_temp.v(2026, 43, '__sqltest_c', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '1/6', 'пренесено в седмицата → 1/6, а е ' || got);
  got := pg_temp.v(2026, 43, '__sqltest_d', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '0/4', 'изнесено от седмицата → 0/4, а е ' || got);

  -- 4. два записа в един ден = едно попадение: 15.10 и 16.10, пренесени в
  --    съб 24.10 (недължим ден) → едно попадение (24.10), знаменател +2 → 1/7.
  got := pg_temp.v(2026, 43, '__sqltest_e', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '1/7', 'два пренесени в един ден → 1/7, а е ' || got);

  -- 5. file_none: свършено с файл (съб) → da; без файл → ne.
  got := pg_temp.v(2026, 43, '__sqltest_a', '__sqltest_file');
  fails := fails || pg_temp.t(got = 'da', 'file_none: с файл → da, а е ' || got);
  got := pg_temp.v(2026, 43, '__sqltest_b', '__sqltest_file');
  fails := fails || pg_temp.t(got = 'ne', 'file_none: без файл → ne, а е ' || got);

  -- 6. изключение за обекта (recurring_task_skips) → NULL; другият обект — не.
  got := pg_temp.v(2026, 43, '__sqltest_f', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '∅', 'изключен обект → NULL, а е ' || got);

  -- 7. период от 02.11 → седмица 43 не важи → NULL за всички.
  got := pg_temp.v(2026, 43, '__sqltest_a', '__sqltest_per');
  fails := fails || pg_temp.t(got = '∅', 'задача извън периода → NULL, а е ' || got);

  -- 8. версия от 19.10 с дни [0,1] → знаменател 2; седмица 42 (преди) → 5.
  got := pg_temp.v(2026, 43, '__sqltest_a', '__sqltest_ver');
  fails := fails || pg_temp.t(got = '1/2', 'версия за седмицата → 1/2, а е ' || got);
  got := pg_temp.v(2026, 42, '__sqltest_a', '__sqltest_ver');
  fails := fails || pg_temp.t(got = '0/5', 'преди версията → 0/5, а е ' || got);

  -- 9. преходът на годината: пт 01.01.2027 е в седмица 53/2026, не в 1/2027.
  got := pg_temp.v(2026, 53, '__sqltest_a', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '1/5', 'седмица 53/2026 с 01.01.2027 → 1/5, а е ' || got);
  got := pg_temp.v(2027, 1, '__sqltest_a', '__sqltest_cnt');
  fails := fails || pg_temp.t(got = '0/5', 'седмица 1/2027 без 01.01.2027 → 0/5, а е ' || got);

  -- 10. модули за обект без записи: returns → NULL; wrong_receipt → 0/0
  --     (минала седмица), NULL за бъдеща.
  got := pg_temp.v(2026, 43, '__sqltest_a', 'stoka_vrashtane');
  fails := fails || pg_temp.t(got = '∅', 'returns без записи → NULL, а е ' || got);
  got := pg_temp.v(2026, 43, '__sqltest_a', 'storna_priem');
  fails := fails || pg_temp.t(got = '0/0', 'wrong_receipt без сторна → 0/0, а е ' || got);
  got := pg_temp.v(2030, 10, '__sqltest_a', 'storna_priem');
  fails := fails || pg_temp.t(got = '∅', 'wrong_receipt, бъдеща седмица → NULL, а е ' || got);

  -- 11. manual колона не се връща; изключен обект (ЦО) не се връща.
  fails := fails || pg_temp.t(pg_temp.v(2026, 43, '__sqltest_a', 'razhodi') = '(няма ред)', 'manual колона се връща');
  fails := fails || pg_temp.t(pg_temp.v(2026, 43, 'Централен офис', 'stoka_vrashtane') = '(няма ред)', 'ЦО се връща');
  return fails;
end
$f$;

do $run$
declare
  T_ANY  uuid := 'a0000000-0000-4000-8000-000000000001';
  T_CNT  uuid := 'a0000000-0000-4000-8000-000000000002';
  T_FILE uuid := 'a0000000-0000-4000-8000-000000000003';
  T_PER  uuid := 'a0000000-0000-4000-8000-000000000004';
  T_VER  uuid := 'a0000000-0000-4000-8000-000000000005';
  base text;
  rep  text := '';
  def  text;
  m    record;
  hits int;
  res  text;
begin
  -- ── данни ───────────────────────────────────────────────────────────
  insert into public.users (email, store_name, role) values
    ('__sqltest_a@x.bg', '__sqltest_a', 'manager'), ('__sqltest_b@x.bg', '__sqltest_b', 'manager'),
    ('__sqltest_c@x.bg', '__sqltest_c', 'manager'), ('__sqltest_d@x.bg', '__sqltest_d', 'manager'),
    ('__sqltest_e@x.bg', '__sqltest_e', 'manager'), ('__sqltest_f@x.bg', '__sqltest_f', 'manager');

  insert into public.recurring_tasks (id, department, title, task_type, due_weekdays, active) values
    (T_ANY,  'test', '__sqltest any',   'info', array[2],         true),
    (T_CNT,  'test', '__sqltest count', 'info', array[0,1,2,3,4], true),
    (T_FILE, 'test', '__sqltest file',  'file_comment', null,     true),
    (T_PER,  'test', '__sqltest period','info', array[0,1,2,3,4], true),
    (T_VER,  'test', '__sqltest ver',   'info', array[0,1,2,3,4], true);
  insert into public.recurring_task_periods (recurring_task_id, from_monday, to_monday)
    values (T_PER, date '2026-11-02', null);
  insert into public.recurring_task_versions (recurring_task_id, from_monday, to_monday, title, department, due_weekdays)
    values (T_VER, date '2026-10-19', null, '__sqltest ver v2', 'test', array[0,1]);
  insert into public.recurring_task_skips (recurring_task_id, year, week_number, store_name)
    values (T_CNT, 2026, 43, '__sqltest_f');

  insert into public.weekly_checklist_metrics (key, label, value_type, source, sort_order, active, portal_mode) values
    ('__sqltest_any',  't any',  'yes_no',      'recurring:' || T_ANY,  901, true, 'any'),
    ('__sqltest_cnt',  't cnt',  'yes_no',      'recurring:' || T_CNT,  902, true, 'count'),
    ('__sqltest_file', 't file', 'yes_no_none', 'recurring:' || T_FILE, 903, true, 'file_none'),
    ('__sqltest_per',  't per',  'yes_no',      'recurring:' || T_PER,  904, true, 'count'),
    ('__sqltest_ver',  't ver',  'yes_no',      'recurring:' || T_VER,  905, true, 'count');

  insert into public.task_completions (recurring_task_id, store_name, completion_date, postponed_to, status, files) values
    (T_ANY,  '__sqltest_a', date '2026-10-21', null, 'done', null),
    (T_ANY,  '__sqltest_b', date '2026-10-22', null, 'done', null),
    (T_CNT,  '__sqltest_a', date '2026-10-19', null, 'done', null),
    (T_CNT,  '__sqltest_a', date '2026-10-20', null, 'done', null),
    (T_CNT,  '__sqltest_a', date '2026-10-22', null, 'done', null),
    (T_CNT,  '__sqltest_a', date '2026-10-24', null, 'done', null),          -- събота: не е в срока
    (T_CNT,  '__sqltest_c', date '2026-10-12', date '2026-10-21', 'done', null),
    (T_CNT,  '__sqltest_d', date '2026-10-23', date '2026-10-26', 'postponed', null),
    (T_CNT,  '__sqltest_e', date '2026-10-15', date '2026-10-24', 'done', null),
    (T_CNT,  '__sqltest_e', date '2026-10-16', date '2026-10-24', 'done', null),
    (T_CNT,  '__sqltest_f', date '2026-10-19', null, 'done', null),
    (T_CNT,  '__sqltest_a', date '2027-01-01', null, 'done', null),          -- седмица 53/2026
    (T_FILE, '__sqltest_a', date '2026-10-24', null, 'done', '[{"url":"x","name":"f.pdf"}]'::jsonb),
    (T_FILE, '__sqltest_b', date '2026-10-21', null, 'done', '[]'::jsonb),
    (T_PER,  '__sqltest_a', date '2026-10-19', null, 'done', null),
    (T_VER,  '__sqltest_a', date '2026-10-19', null, 'done', null);

  base := pg_temp.run_checks();

  -- ── мутанти: всеки трябва да падне ──────────────────────────────────
  for m in
    select * from (values
      ('M1 два записа в един ден се броят два пъти', 'count(distinct case', 'count(case'),
      ('M2 периодите не се гледат', 'when p.has_periods and not p.valid_week then null', 'when false then null'),
      ('M3 внесено отвън не увеличава знаменателя', 'when not c.orig_due and c.eff_in then 1', 'when not c.orig_due and c.eff_in then 0'),
      ('M4 седмица 1 от 1 януари, не от 4', 'make_date(p_year, 1, 4)', 'make_date(p_year, 1, 1)'),
      ('M5 изключенията не се гледат', 'and (k.store_name is null or k.store_name = st.s)) then null', 'and false) then null'),
      ('M6 версиите не се гледат', 'case when ver.recurring_task_id is not null then ver.due_weekdays', 'case when false then ver.due_weekdays')
    ) as x(name, a, b)
  loop
    def := pg_get_functiondef('public.checklist_portal_values(int, int)'::regprocedure);
    hits := (length(def) - length(replace(def, m.a, ''))) / greatest(length(m.a), 1);
    if hits <> 1 then
      rep := rep || E'\n' || m.name || ': МУТАЦИЯТА НЕ СЕ ПРИЛАГА (срещания: ' || hits || ')';
      continue;
    end if;
    begin
      execute replace(def, m.a, m.b);
      res := pg_temp.run_checks();
      raise exception '__rollback__';
    exception when others then
      if sqlerrm <> '__rollback__' then raise; end if;
    end;
    rep := rep || E'\n' || m.name || ': ' || case when res = '' then 'ОЦЕЛЯЛ ⚠' else 'убит' end;
  end loop;

  raise exception E'SQL-ТЕСТ %\n--- проверки ---%\n--- мутанти ---%',
    case when base = '' then 'ОК' else 'ПАДНА' end,
    case when base = '' then E'\n  всички минаха' else base end, rep;
end
$run$;
