-- SQL тест на checklist_freeze_week() (checklist-live-calc, етап 2; 26.10.2026).
-- Миграция 20261026210000_weekly_checklist_freezes.
--
-- КАК СЕ ПУСКА. След миграцията — САМ, като една заявка през Supabase MCP
-- execute_sql. Завършва с raise exception → връща назад ВСИЧКО. Гейтът е
-- текстът „SQL-ТЕСТ ОК" в съобщението.
--
-- Седмица 30/2026 (пон 20.07 … нд 26.07): приключила, без редове в
-- weekly_checklist и извън еднократното затваряне на 35–43. Обектите, задачата
-- и колоната са измислени ('__sqltest_*'). Седмица 2026/53 е в бъдещето
-- (до 03.01.2027) → не бива да се затваря.

create or replace function pg_temp.t(cond boolean, msg text) returns text
language sql as $$ select case when coalesce(cond, false) then '' else E'\n  ПАДНА: ' || msg end $$;

create or replace function pg_temp.wrow(p_store text) returns public.weekly_checklist
language sql as $$
  select * from public.weekly_checklist
   where year = 2026 and week_number = 30 and store_name = p_store and metric_key = '__sqltest_cnt'
$$;

create or replace function pg_temp.run_checks() returns text language plpgsql as $f$
declare
  fails text := '';
  n1 int; n2 int; nf int;
  r public.weekly_checklist;
  ua timestamptz;
begin
  -- 1. бъдеща седмица → -2, нищо не се записва.
  n1 := public.checklist_freeze_week(2026, 53, 'тест');
  fails := fails || pg_temp.t(n1 = -2, 'бъдеща седмица → -2, а е ' || n1);
  fails := fails || pg_temp.t(not exists (select 1 from public.weekly_checklist_freezes where year = 2026 and week_number = 53),
    'бъдеща седмица е записана във freezes');

  -- 2. първо затваряне на 30.
  n1 := public.checklist_freeze_week(2026, 30, 'тест');
  fails := fails || pg_temp.t(n1 > 0, 'първо затваряне → брой > 0, а е ' || n1);
  fails := fails || pg_temp.t(exists (select 1 from public.weekly_checklist_freezes
                                       where year = 2026 and week_number = 30 and frozen_by = 'тест'),
    'няма ред във freezes за 30');

  r := pg_temp.wrow('__sqltest_a');
  fails := fails || pg_temp.t(r.portal_value = '2/5', 'a: portal_value 2/5, а е ' || coalesce(r.portal_value, '∅'));
  fails := fails || pg_temp.t(r.control_value = 'ne' and r.comment = 'бележка' and r.updated_by = 'Меги',
    'a: control_value / comment / updated_by са пипнати');
  fails := fails || pg_temp.t(r.updated_at <> timestamptz '2026-01-01 00:00+00', 'a: updated_at не е обновен при промяна');

  r := pg_temp.wrow('__sqltest_b');
  fails := fails || pg_temp.t(r.portal_value = '0/5', 'b: portal_value 0/5, а е ' || coalesce(r.portal_value, '∅'));
  fails := fails || pg_temp.t(r.updated_at = timestamptz '2026-01-01 00:00+00', 'b: непроменен ред — updated_at е пипнат');

  r := pg_temp.wrow('__sqltest_c');
  fails := fails || pg_temp.t(r.portal_value = '0/5', 'c: нов ред 0/5, а е ' || coalesce(r.portal_value, '(няма ред)'));

  r := pg_temp.wrow('__sqltest_d');
  fails := fails || pg_temp.t(r.id is not null and r.portal_value is null, 'd: изключен → portal_value NULL, а е ' || coalesce(r.portal_value, '∅'));

  fails := fails || pg_temp.t(not exists (select 1 from public.weekly_checklist
                                           where year = 2026 and week_number = 30 and store_name = '__sqltest_e'
                                             and metric_key = '__sqltest_cnt'),
    'e: изключен обект без ред — създаден е празен ред');

  -- 3. второ затваряне → -1, нищо не се пипа.
  ua := (pg_temp.wrow('__sqltest_a')).updated_at;
  update public.weekly_checklist set portal_value = 'ръчно' where year = 2026 and week_number = 30
     and store_name = '__sqltest_b' and metric_key = '__sqltest_cnt';
  n2 := public.checklist_freeze_week(2026, 30, 'тест 2');
  fails := fails || pg_temp.t(n2 = -1, 'второ затваряне → -1, а е ' || n2);
  fails := fails || pg_temp.t((pg_temp.wrow('__sqltest_b')).portal_value = 'ръчно', 'второ затваряне е презаписало b');
  select count(*) into nf from public.weekly_checklist_freezes where year = 2026 and week_number = 30;
  fails := fails || pg_temp.t(nf = 1, 'freezes има ' || nf || ' реда за 30');

  -- 4. права: anon не вика функцията и не пише във freezes.
  fails := fails || pg_temp.t(not has_function_privilege('anon', 'public.checklist_freeze_week(int, int, text)', 'execute'),
    'anon има execute на checklist_freeze_week');
  fails := fails || pg_temp.t(not has_function_privilege('authenticated', 'public.checklist_freeze_week(int, int, text)', 'execute'),
    'authenticated има execute на checklist_freeze_week');
  fails := fails || pg_temp.t(has_table_privilege('anon', 'public.weekly_checklist_freezes', 'select')
                          and not has_table_privilege('anon', 'public.weekly_checklist_freezes', 'insert')
                          and not has_table_privilege('anon', 'public.weekly_checklist_freezes', 'delete'),
    'anon: select да, insert/delete не');
  return fails;
end
$f$;

do $run$
declare
  T uuid := 'b0000000-0000-4000-8000-000000000001';
  base text;
  rep  text := '';
  def  text;
  m    record;
  hits int;
  res  text;
begin
  insert into public.users (email, store_name, role) values
    ('__sqltest_a@x.bg', '__sqltest_a', 'manager'), ('__sqltest_b@x.bg', '__sqltest_b', 'manager'),
    ('__sqltest_c@x.bg', '__sqltest_c', 'manager'), ('__sqltest_d@x.bg', '__sqltest_d', 'manager'),
    ('__sqltest_e@x.bg', '__sqltest_e', 'manager');
  insert into public.recurring_tasks (id, department, title, task_type, due_weekdays, active)
    values (T, 'test', '__sqltest freeze', 'info', array[0,1,2,3,4], true);
  insert into public.recurring_task_skips (recurring_task_id, year, week_number, store_name) values
    (T, 2026, 30, '__sqltest_d'), (T, 2026, 30, '__sqltest_e');
  insert into public.weekly_checklist_metrics (key, label, value_type, source, sort_order, active, portal_mode)
    values ('__sqltest_cnt', 't cnt', 'yes_no', 'recurring:' || T, 950, true, 'count');
  insert into public.task_completions (recurring_task_id, store_name, completion_date, status) values
    (T, '__sqltest_a', date '2026-07-20', 'done'),
    (T, '__sqltest_a', date '2026-07-21', 'done');
  insert into public.weekly_checklist (year, week_number, store_name, metric_key, portal_value, control_value, comment, updated_by, updated_at) values
    (2026, 30, '__sqltest_a', '__sqltest_cnt', 'старо', 'ne', 'бележка', 'Меги', timestamptz '2026-01-01 00:00+00'),
    (2026, 30, '__sqltest_b', '__sqltest_cnt', '0/5',   null, null,      null,   timestamptz '2026-01-01 00:00+00'),
    (2026, 30, '__sqltest_d', '__sqltest_cnt', '1/5',   null, null,      null,   timestamptz '2026-01-01 00:00+00');

  -- За мутантите: всяка проверка тръгва от едно и също състояние.
  begin
    base := pg_temp.run_checks();
    raise exception '__rollback__';
  exception when others then
    if sqlerrm <> '__rollback__' then raise; end if;
  end;

  for m in
    select * from (values
      ('M1 updated_at и при непроменена стойност', 'and w.portal_value is distinct from x.value;', ';'),
      ('M2 затваря и неприключила седмица', 'if now() < v_end then', 'if false then'),
      ('M3 трие отметката на контролинга', 'updated_at   = now()
    from x', 'updated_at   = now(), control_value = null
    from x'),
      ('M4 не е идемпотентна', 'if not found then
    return -1;', 'if false then
    return -1;'),
      ('M5 празен ред за NULL', 'where x.value is not null
     and not exists', 'where true
     and not exists')
    ) as x(name, a, b)
  loop
    def := pg_get_functiondef('public.checklist_freeze_week(int, int, text)'::regprocedure);
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
