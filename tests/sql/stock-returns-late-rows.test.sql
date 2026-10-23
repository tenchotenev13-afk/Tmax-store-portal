-- SQL тест: ред, влязъл В ДЕНЯ НА СРОКА, не се брои за тази седмица
-- (миграция 20261023085400_stock_returns_late_rows, решение от 22.10.2026).
--
-- КАК СЕ ПУСКА. Като ЕДНА транзакция през Supabase MCP (execute_sql).
-- Преди прилагането на миграцията — слепен СЛЕД
-- 20261023085400_stock_returns_late_rows.sql; след прилагането — сам.
-- Файлът завършва с raise exception → връща се назад ВСИЧКО (и миграцията, и
-- тестовите редове). Гейтът е текстът „SQL-ТЕСТ ОК" в съобщението, не това,
-- че има грешка.
--
-- ОБЕКТИТЕ СА ИЗМИСЛЕНИ ('__sqltest_*'), задачата е РЕАЛНАТА „Изтегляне по
-- разлики" (срок сряда). Седмицата е тази от случая: понеделник 19.10, срок
-- 21.10; следващата — 26.10 / 28.10. created_at се задава изрично по
-- Europe/Sofia. Тригерите върху stock_returns се изключват за транзакцията,
-- за да се разиграва всяко извикване на sync ръчно.
--
-- СЦЕНАРИИТЕ:
--   а   s1: всичко потвърдено в понеделник → отметка; нов ред сряда 16:00 →
--           отметката ОСТАВА
--   а2  s2: ред от сряда 16:00 съществува ПРЕДИ първото пресмятане →
--           отметката СЕ ПОСТАВЯ (не пречи на поставянето)
--   б   s1 в следващата седмица: редът от 21.10 СЕ БРОИ (отметка за 28.10 няма),
--           докато обектът не го потвърди; после отметката идва
--   в   s3: нов ред във вторник → отметката СЕ МАХА (старото поведение за
--           дните преди срока)
--   г   p_due = NULL (4-те аргумента) → поведение като преди: редът от сряда
--           се брои
--   д   s4: ред в сряда 01:30 българско (= вторник 22:30 UTC) → не се брои
--   е   s5: ред във вторник 23:59:59 българско → СЕ БРОИ (границата)
--
-- МУТАНТИ (всеки трябва да е „убит"):
--   M1 без изключението                              (убива а, а2, д)
--   M2 изключение по UTC дата вместо Europe/Sofia    (убива д)
--   M3 изключение и в дните преди срока              (убива в, е)
--   M4 sync не подава v_due в delete-а               (убива а)
--   M5 sync не подава v_due в insert-а               (убива а2)

create or replace function pg_temp.t(cond boolean, msg text) returns text
language sql as $$ select case when coalesce(cond, false) then '' else E'\n  ПАДНА: ' || msg end $$;

create or replace function pg_temp.mark(p_store text, p_date date) returns boolean
language sql as $$
  select exists (select 1 from public.task_completions
                  where recurring_task_id = 'e9d418af-311a-45ec-b4da-0f9ad69205e7'
                    and store_name = p_store and completion_date = p_date
                    and completed_by = 'auto:stock-returns') $$;

create or replace function pg_temp.run_checks() returns text language plpgsql as $f$
declare
  MON  date := date '2026-10-19';
  TUE  date := date '2026-10-20';
  WED  date := date '2026-10-21';
  MON2 date := date '2026-10-26';
  TUE2 date := date '2026-10-27';
  WED2 date := date '2026-10-28';
  s text;
  fails text := '';
begin
  alter table public.stock_returns disable trigger user;

  -- 0. Предпоставки: задачата е със срок сряда и в двете седмици.
  fails := fails || pg_temp.t(
    (select due_idx from public.stock_returns_tasks_for_week(MON)
      where task_id = 'e9d418af-311a-45ec-b4da-0f9ad69205e7') = 2
    and (select due_idx from public.stock_returns_tasks_for_week(MON2)
      where task_id = 'e9d418af-311a-45ec-b4da-0f9ad69205e7') = 2,
    '„Изтегляне по разлики" не е със срок сряда — тестовите дати не важат');

  -- Общо начало: всеки обект има ред, създаден и потвърден ОТ ОБЕКТА в понеделник.
  foreach s in array array['__sqltest_s1','__sqltest_s2','__sqltest_s3','__sqltest_s4','__sqltest_s5'] loop
    insert into public.stock_returns (store_name, source, status, created_at, confirmed_date, confirmed_by, confirmed_at)
    values (s, 'diff', 'pending', timestamptz '2026-10-19 09:00 Europe/Sofia', MON, 'store:' || s,
            timestamptz '2026-10-19 09:05 Europe/Sofia');
  end loop;

  -- ═══ а. Отметка в сряда; ред в сряда 16:00 не я маха ════════════════════
  perform public.stock_returns_sync_completions('__sqltest_s1', WED);
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s1', WED), 'а: преди новия ред отметката трябва да е поставена');
  insert into public.stock_returns (store_name, source, status, created_at)
  values ('__sqltest_s1', 'diff', 'pending', timestamptz '2026-10-21 16:00 Europe/Sofia');
  perform public.stock_returns_sync_completions('__sqltest_s1', WED);
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s1', WED),
    'а: ред, влязъл в деня на срока, НЕ бива да маха отметката');

  -- ═══ а2. Редът от сряда съществува преди първото пресмятане ═════════════
  insert into public.stock_returns (store_name, source, status, created_at)
  values ('__sqltest_s2', 'diff', 'pending', timestamptz '2026-10-21 16:00 Europe/Sofia');
  perform public.stock_returns_sync_completions('__sqltest_s2', WED);
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s2', WED),
    'а2: ред, влязъл в деня на срока, НЕ бива да пречи на поставянето на отметката');

  -- ═══ г. p_due = NULL → старото поведение ═════════════════════════════════
  fails := fails || pg_temp.t(
    public.stock_returns_store_done('__sqltest_s1', MON, WED, 'diff') = false,
    'г: без p_due редът от сряда трябва да се брои (старото поведение)');
  fails := fails || pg_temp.t(
    public.stock_returns_store_done('__sqltest_s1', MON, WED, 'diff', WED) = true,
    'г: с p_due = сряда редът от сряда НЕ се брои');

  -- ═══ б. Следващата седмица: редът от 21.10 се брои ══════════════════════
  -- Понеделнишкият ред се потвърждава в новата седмица, за да остане само
  -- редът от сряда като причина.
  update public.stock_returns set confirmed_date = MON2, confirmed_by = 'store:__sqltest_s1',
         confirmed_at = timestamptz '2026-10-26 09:00 Europe/Sofia'
   where store_name = '__sqltest_s1' and created_at = timestamptz '2026-10-19 09:00 Europe/Sofia';
  perform public.stock_returns_sync_completions('__sqltest_s1', MON2);
  fails := fails || pg_temp.t(not pg_temp.mark('__sqltest_s1', WED2),
    'б: в новата седмица редът от 21.10 трябва да се брои — отметка за 28.10 не бива да има');
  perform public.stock_returns_sync_completions('__sqltest_s1', TUE2);
  fails := fails || pg_temp.t(not pg_temp.mark('__sqltest_s1', WED2),
    'б: и във вторник на новата седмица — още непотвърден, отметка не бива да има');
  update public.stock_returns set confirmed_date = TUE2, confirmed_by = 'store:__sqltest_s1',
         confirmed_at = timestamptz '2026-10-27 10:00 Europe/Sofia'
   where store_name = '__sqltest_s1' and created_at = timestamptz '2026-10-21 16:00 Europe/Sofia';
  perform public.stock_returns_sync_completions('__sqltest_s1', TUE2);
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s1', WED2),
    'б: след потвърждение от обекта в новата седмица отметката трябва да дойде');
  -- Миналата седмица е замразена — отметката за 21.10 си стои.
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s1', WED), 'б: отметката за 21.10 не бива да се пипа');

  -- ═══ в. Ред във вторник маха отметката ══════════════════════════════════
  perform public.stock_returns_sync_completions('__sqltest_s3', TUE);
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s3', WED), 'в: във вторник отметката трябва да е поставена');
  insert into public.stock_returns (store_name, source, status, created_at)
  values ('__sqltest_s3', 'diff', 'pending', timestamptz '2026-10-20 15:00 Europe/Sofia');
  perform public.stock_returns_sync_completions('__sqltest_s3', TUE);
  fails := fails || pg_temp.t(not pg_temp.mark('__sqltest_s3', WED),
    'в: ред, влязъл ПРЕДИ деня на срока, трябва да маха отметката');
  perform public.stock_returns_sync_completions('__sqltest_s3', WED);
  fails := fails || pg_temp.t(not pg_temp.mark('__sqltest_s3', WED),
    'в: и в сряда — редът от вторник още се брои');

  -- ═══ д. Сряда 01:30 българско (вторник 22:30 UTC) ═══════════════════════
  perform public.stock_returns_sync_completions('__sqltest_s4', WED);
  insert into public.stock_returns (store_name, source, status, created_at)
  values ('__sqltest_s4', 'diff', 'pending', timestamptz '2026-10-21 01:30 Europe/Sofia');
  perform public.stock_returns_sync_completions('__sqltest_s4', WED);
  fails := fails || pg_temp.t(pg_temp.mark('__sqltest_s4', WED),
    'д: ред в сряда 01:30 българско е от деня на срока — не бива да маха отметката (UTC дата?)');

  -- ═══ е. Вторник 23:59:59 българско — границата ══════════════════════════
  perform public.stock_returns_sync_completions('__sqltest_s5', WED);
  insert into public.stock_returns (store_name, source, status, created_at)
  values ('__sqltest_s5', 'diff', 'pending', timestamptz '2026-10-20 23:59:59 Europe/Sofia');
  perform public.stock_returns_sync_completions('__sqltest_s5', WED);
  fails := fails || pg_temp.t(not pg_temp.mark('__sqltest_s5', WED),
    'е: ред във вторник 23:59:59 българско е ПРЕДИ деня на срока — трябва да маха отметката');

  return fails;
end
$f$;

do $run$
declare
  base text;
  res  text;
  rep  text := '';
  m    record;
  def  text;
  hits integer;
begin
  begin
    base := pg_temp.run_checks();
    raise exception '__rollback__';
  exception when others then
    if sqlerrm <> '__rollback__' then raise; end if;
  end;
  rep := E'ЧИСТ КОД: ' || case when base = '' then 'всички проверки минават' else 'ПАДНА' || base end;

  for m in
    select * from (values
      ('M1 без изключението', 'public.stock_returns_store_done(text,date,date,text,date)'::text,
        E'and (p_due is null\n            or (created_at at time zone ''Europe/Sofia'')::date <> p_due)', 'and true'),
      ('M2 изключение по UTC дата', 'public.stock_returns_store_done(text,date,date,text,date)',
        E'(created_at at time zone ''Europe/Sofia'')::date <> p_due', E'(created_at at time zone ''UTC'')::date <> p_due'),
      ('M3 изключение и преди срока', 'public.stock_returns_store_done(text,date,date,text,date)',
        E'(created_at at time zone ''Europe/Sofia'')::date <> p_due',
        E'(created_at at time zone ''Europe/Sofia'')::date not between p_from and p_due'),
      ('M4 delete без v_due', 'public.stock_returns_sync_completions(text,date)',
        'and not stock_returns_store_done(tc.store_name, v_monday, v_upto, v_task.source, v_due)',
        'and not stock_returns_store_done(tc.store_name, v_monday, v_upto, v_task.source)'),
      ('M5 insert без v_due', 'public.stock_returns_sync_completions(text,date)',
        'and stock_returns_store_done(s, v_monday, v_upto, v_task.source, v_due)',
        'and stock_returns_store_done(s, v_monday, v_upto, v_task.source)')
    ) as x(name, fn, a, b)
  loop
    def := pg_get_functiondef(m.fn::regprocedure);
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

  raise exception E'SQL-ТЕСТ %\n%', case when base = '' then 'ОК' else 'ПАДНА' end, rep;
end
$run$;
