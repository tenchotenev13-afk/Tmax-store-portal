-- SQL тест на „За връщане" по source (миграции 20261007090000 + 20261007090100).
--
-- КАК СЕ ПУСКА. Миграциите още не са приложени, затова тестът се пуска като
-- ЕДНА транзакция през Supabase MCP apply_migration:
--     <20261007090000_stock_returns_auto_per_source.sql>
--   + <20261007090100_stock_returns_auto_per_source_data.sql>
--   + този файл
-- слепени в този ред. Файлът завършва с raise exception, значи се връща назад
-- ВСИЧКО — и миграциите, и тестовите редове, и записът на самата миграция.
-- Гейтът е текстът „SQL-ТЕСТ ОК" в съобщението, не това, че има грешка.
-- (След прилагане на миграциите тестът се пуска САМ — тогава новите функции
-- вече съществуват, а втората миграция не бива да се слепва: тя ще гръмне на
-- проверката „бекъп = изтрито" само ако таблицата вече съществува.)
--
-- ОБЕКТИТЕ СА ИЗМИСЛЕНИ ('__sqltest_*'), задачите са РЕАЛНИТЕ три. Фиксираният
-- p_today = сряда 2026-10-07 прави теста независим от деня на пускане, но
-- задачите трябва да са със срок сряда (due_weekdays [2]) — първата проверка го
-- пази. Тригерите върху stock_returns се изключват за транзакцията, за да се
-- разиграе всяко извикване на sync ръчно; изключването също се връща назад.

create or replace function pg_temp.t(cond boolean, msg text) returns text
language sql as $$ select case when coalesce(cond, false) then '' else E'\n  ПАДНА: ' || msg end $$;

create or replace function pg_temp.run_checks() returns text language plpgsql as $f$
declare
  T_RET  uuid := '0a20f6e8-c526-400b-bed5-57194f35e4e5';  -- Списък стока за връщане   (complaint)
  T_DIFF uuid := 'e9d418af-311a-45ec-b4da-0f9ad69205e7';  -- Изтегляне по разлики      (diff)
  T_EXP  uuid := '31351174-4182-46a1-a1ce-91e877066297';  -- Срок на годност           (ръчна)
  WED    date := date '2026-10-07';
  THU    date := date '2026-10-08';
  s1 text := '__sqltest_s1';  -- complaint актуализиран, diff НЕ → само „връщане"
  s2 text := '__sqltest_s2';  -- без нито един diff; complaint не е актуализиран → само „разлики"
  s3 text := '__sqltest_s3';  -- и двете актуализирани → и двете
  s4 text := '__sqltest_s4';  -- ръчна отметка + not_applicable, записи неактуализирани
  s5 text := '__sqltest_s5';  -- complaint с дата от ОФИСА → не е актуализация
  s6 text := '__sqltest_s6';  -- без записи изобщо → и двете автоматично
  s7 text := '__sqltest_s7';  -- за мутациите на linked_module
  fails text := '';
  n integer;
begin
  alter table public.stock_returns disable trigger user;

  -- 0. Предпоставки.
  fails := fails || pg_temp.t(
    (select count(*) from public.stock_returns_tasks_for_week(date '2026-10-05')) = 2,
    'за седмицата 05.10 функцията трябва да върне ТОЧНО двете списъчни задачи, а върна '
    || (select count(*) from public.stock_returns_tasks_for_week(date '2026-10-05')));
  fails := fails || pg_temp.t(
    (select count(*) from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_EXP) = 0,
    '„Срок на годност" не бива да е сред задачите');
  fails := fails || pg_temp.t(
    (select source from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_RET) = 'complaint'
    and (select source from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_DIFF) = 'diff',
    'съответствието задача → source е грешно');
  fails := fails || pg_temp.t(
    (select bool_and(due_idx = 2) from public.stock_returns_tasks_for_week(date '2026-10-05')),
    'задачите не са със срок сряда — тестовите дати не важат');
  -- Миналата седмица: версиите от 28.09 нямат linked_module → нищо.
  fails := fails || pg_temp.t(
    (select count(*) from public.stock_returns_tasks_for_week(date '2026-09-28')) = 0,
    'за 28.09 не бива да има автоматични задачи');

  -- ═══ Данни ═══════════════════════════════════════════════════════════════
  -- s1
  insert into public.stock_returns (store_name, source, status, confirmed_date, confirmed_by) values
    (s1, 'complaint', 'pending', WED, 'store:' || s1),
    (s1, 'diff',      'pending', null, null);
  -- s2: само complaint-ове, нито един diff
  insert into public.stock_returns (store_name, source, status, confirmed_date, confirmed_by) values
    (s2, 'complaint', 'pending', null, null);
  -- s3
  insert into public.stock_returns (store_name, source, status, confirmed_date, confirmed_by) values
    (s3, 'complaint', 'pending', WED, 'store:' || s3),
    (s3, 'diff',      'pending', date '2026-10-05', 'store:' || s3);
  -- s4: неактуализирани и в двата source
  insert into public.stock_returns (store_name, source, status) values
    (s4, 'complaint', 'pending'), (s4, 'diff', 'pending');
  insert into public.task_completions (recurring_task_id, store_name, completed_by, completed_at, status, completion_date)
    values (T_DIFF, s4, 'Иван Тестов', now(), 'done', WED);
  insert into public.task_completions (recurring_task_id, store_name, completed_by, completed_at, status, completion_date, comment)
    values (T_RET, s4, 'Иван Тестов', now(), 'not_applicable', WED, 'не важи за нас (тест)');
  -- s5: дата от офиса в complaint; diff-ът е чист
  insert into public.stock_returns (store_name, source, status, confirmed_date, confirmed_by) values
    (s5, 'complaint', 'pending', WED, 'office:Цветелина');
  -- s6, s7: без записи

  perform public.stock_returns_sync_completions(s1, WED);
  perform public.stock_returns_sync_completions(s2, WED);
  perform public.stock_returns_sync_completions(s3, WED);
  perform public.stock_returns_sync_completions(s4, WED);
  perform public.stock_returns_sync_completions(s5, WED);
  perform public.stock_returns_sync_completions(s6, WED);

  -- ═══ 1. Всяка задача по своя source ══════════════════════════════════════
  -- s1: само „връщане"
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_RET  and store_name=s1 and completion_date=WED and completed_by='auto:stock-returns'),
    's1: „Списък за връщане" трябва да е отметната (complaint актуализиран)');
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id=T_DIFF and store_name=s1),
    's1: „Изтегляне по разлики" НЕ бива да е отметната (diff неактуализиран)');
  -- s2: само „разлики" (няма нито един diff)
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_DIFF and store_name=s2 and completed_by='auto:stock-returns'),
    's2: обект без нито един diff запис → „Изтегляне по разлики" се отмята');
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id=T_RET and store_name=s2),
    's2: complaint неактуализиран → „за връщане" НЕ се отмята');
  -- s3: и двете
  fails := fails || pg_temp.t((select count(*) from public.task_completions where store_name=s3 and recurring_task_id in (T_RET,T_DIFF) and completed_by='auto:stock-returns') = 2,
    's3: и двете задачи трябва да са отметнати');
  -- s5: дата от офиса не е актуализация на обекта
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id=T_RET and store_name=s5),
    's5: дата от офиса не отмята „за връщане"');
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_DIFF and store_name=s5),
    's5: няма diff записи → „разлики" се отмята');
  -- s6: без записи → и двете
  fails := fails || pg_temp.t((select count(*) from public.task_completions where store_name=s6 and recurring_task_id in (T_RET,T_DIFF)) = 2,
    's6: обект без записи → и двете автоматично');

  -- ═══ 2. „Срок на годност" не се пипа НИКОГА ══════════════════════════════
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id = T_EXP and store_name like '\_\_sqltest\_%'),
    '„Срок на годност" получи отметка за тестов обект — трябва да е ръчна');

  -- ═══ 3. Ръчна отметка и not_applicable не се пренаписват ═════════════════
  fails := fails || pg_temp.t((select completed_by from public.task_completions where recurring_task_id=T_DIFF and store_name=s4 and completion_date=WED) = 'Иван Тестов',
    's4: ръчната отметка е пренаписана');
  fails := fails || pg_temp.t((select status from public.task_completions where recurring_task_id=T_RET and store_name=s4 and completion_date=WED) = 'not_applicable',
    's4: „не се отнася" е пренаписано');
  -- … и не се трие при махане: условието се развали, но редът не е auto.
  perform public.stock_returns_sync_completions(s4, WED);
  select count(*) into n from public.task_completions where store_name=s4 and recurring_task_id in (T_RET,T_DIFF);
  fails := fails || pg_temp.t(n = 2, 's4: ръчните редове трябва да са 2 и след втори sync, а са ' || n);

  -- ═══ 4. Махане: развалено условие трие САМО своя ред и САМО на тази задача ═
  insert into public.stock_returns (store_name, source, status) values (s3, 'complaint', 'pending');
  perform public.stock_returns_sync_completions(s3, WED);
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id=T_RET and store_name=s3),
    's3: нов неактуализиран complaint → „за връщане" трябва да се махне');
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_DIFF and store_name=s3 and completed_by='auto:stock-returns'),
    's3: „разлики" НЕ бива да се пипа от complaint запис');

  -- ═══ 5. Замразяване: след срока нищо не се добавя и не се маха ═══════════
  insert into public.stock_returns (store_name, source, status) values (s1, 'complaint', 'pending');  -- условието вече е развалено…
  n := public.stock_returns_sync_completions(s1, THU);
  fails := fails || pg_temp.t(n = 0, 'четвъртък: sync трябва да върне 0, а върна ' || n);
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_RET and store_name=s1),
    'четвъртък: отметката на s1 не бива да се маха (замразено, макар условието да е развалено)');
  -- и миналото: седмица преди 05.10 → 0
  n := public.stock_returns_sync_completions(s6, date '2026-10-02');
  fails := fails || pg_temp.t(n = 0, 'петък 02.10 (минала седмица): sync трябва да върне 0, а върна ' || n);

  -- ═══ 6. Старата стойност 'stock-returns' НЕ е автоматична ═════════════════
  update public.recurring_task_versions set linked_module = 'stock-returns'
   where recurring_task_id = T_RET and from_monday = date '2026-10-05';
  fails := fails || pg_temp.t((select count(*) from public.stock_returns_tasks_for_week(date '2026-10-05')) = 1,
    'със стара стойност задачата не бива да се връща от функцията');
  perform public.stock_returns_sync_completions(s7, WED);
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id=T_RET and store_name=s7),
    'със стара стойност s7 не бива да получи отметка по „за връщане"');
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_DIFF and store_name=s7),
    '… но другата задача (разлики) пак се обработва — цикълът не бива да спира');

  -- ═══ 7. Версията печели и при NULL (като recurringApplyVersion) ═════════
  update public.recurring_task_versions set linked_module = null
   where recurring_task_id = T_RET and from_monday = date '2026-10-05';
  update public.recurring_tasks set linked_module = 'stock-returns-complaint' where id = T_RET;
  fails := fails || pg_temp.t(not exists (select 1 from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_RET),
    'версия с NULL linked_module трябва да бие основния запис със стойност');
  -- обратно: основен запис NULL, версия със стойност → печели версията
  update public.recurring_tasks set linked_module = null where id = T_RET;
  update public.recurring_task_versions set linked_module = 'stock-returns-complaint'
   where recurring_task_id = T_RET and from_monday = date '2026-10-05';
  fails := fails || pg_temp.t(exists (select 1 from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_RET and source = 'complaint'),
    'версия със стойност трябва да печели при основен запис NULL');

  -- ═══ 8. „Само за информация" и неактивна задача ══════════════════════════
  update public.recurring_task_versions set task_type = 'notice'
   where recurring_task_id = T_DIFF and from_monday = date '2026-10-05';
  delete from public.task_completions where store_name = s6;
  perform public.stock_returns_sync_completions(s6, WED);
  fails := fails || pg_temp.t(not exists (select 1 from public.task_completions where recurring_task_id=T_DIFF and store_name=s6),
    'notice задача не бива да се отмята');
  fails := fails || pg_temp.t(exists (select 1 from public.task_completions where recurring_task_id=T_RET and store_name=s6),
    '… а другата задача на същия обект да се отмята (continue, не return)');
  update public.recurring_task_versions set task_type = 'info'
   where recurring_task_id = T_DIFF and from_monday = date '2026-10-05';
  update public.recurring_tasks set active = false where id = T_DIFF;
  fails := fails || pg_temp.t(not exists (select 1 from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_DIFF),
    'неактивна задача не бива да се връща');
  update public.recurring_tasks set active = true where id = T_DIFF;

  -- ═══ 9. Права ═══════════════════════════════════════════════════════════
  fails := fails || pg_temp.t(
    not has_function_privilege('anon', 'public.stock_returns_tasks_for_week(date)', 'execute')
    and not has_function_privilege('authenticated', 'public.stock_returns_tasks_for_week(date)', 'execute')
    and not has_function_privilege('anon', 'public.stock_returns_store_done(text,date,date,text)', 'execute')
    and not has_function_privilege('anon', 'public.stock_returns_sync_completions(text,date)', 'execute'),
    'anon/authenticated не бива да могат да викат функциите');
  fails := fails || pg_temp.t(
    to_regprocedure('public.stock_returns_task_for_week(date)') is null
    and to_regprocedure('public.stock_returns_store_done(text,date,date)') is null,
    'старите сигнатури трябва да са махнати');

  return fails;
end
$f$;

-- ═══ ИЗПЪЛНЕНИЕ: чисто + мутанти ═══════════════════════════════════════════
-- Всяко пускане е в СВОЯ подтранзакция (begin … raise … exception), така че и
-- тестовите редове, и мутираната функция се връщат преди следващото. Мутантът
-- заменя низ в ТЯЛОТО на живата функция и ТРЯБВА да се срещне точно веднъж —
-- иначе тестът спира (мутация, която не се е приложила, би минала за „убит").
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
      ('M1 махнат „and source = p_source"',   'public.stock_returns_store_done(text,date,date,text)'::text, 'and source = p_source', ''),
      ('M2 разменен source на complaint',      'public.stock_returns_tasks_for_week(date)',                 'then ''complaint''',   'then ''diff'''),
      ('M3 трие и чужди (ръчни) отметки',      'public.stock_returns_sync_completions(text,date)',          'and tc.completed_by = ''auto:stock-returns''', ''),
      ('M4 махнато замразяване след срока',    'public.stock_returns_sync_completions(text,date)',          'if v_today > v_due then continue; end if;', ''),
      ('M5 continue → return при notice',      'public.stock_returns_sync_completions(text,date)',          'then continue; end if;
    if v_task.due_idx', 'then return v_n; end if;
    if v_task.due_idx')
    ) as x(name, fn, a, b)
  loop
    def := pg_get_functiondef(m.fn::regprocedure);
    hits := (length(def) - length(replace(def, m.a, ''))) / greatest(length(m.a), 1);
    if hits <> 1 then
      rep := rep || E'
' || m.name || ': МУТАЦИЯТА НЕ СЕ ПРИЛАГА (срещания: ' || hits || ')';
      continue;
    end if;
    begin
      execute replace(def, m.a, m.b);
      res := pg_temp.run_checks();
      raise exception '__rollback__';
    exception when others then
      if sqlerrm <> '__rollback__' then raise; end if;
    end;
    rep := rep || E'
' || m.name || ': ' || case when res = '' then 'ОЦЕЛЯЛ ⚠' else 'убит' end;
  end loop;

  raise exception E'SQL-ТЕСТ %
%
--- журнал на data миграцията ---
%',
    case when base = '' then 'ОК' else 'ПАДНА' end, rep,
    (select coalesce(string_agg(step || ' = ' || n, E'
' order by step), '(няма журнал)') from pg_temp._sr_data_log);
end
$run$;
