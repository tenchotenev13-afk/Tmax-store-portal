-- SQL тест: запис, създаден ОТ ОБЕКТА, не маха автоматичната отметка
-- (08.10.2026; промяната в autoCreateReturnFromDiff). Пуска се през Supabase MCP
-- apply_migration като ЕДНА транзакция. Заварения ред на Троян (9382933f) не
-- пипа — решение на Тенчо от 11.10.2026: остава, както е.
-- Файлът завършва с raise exception → връща се назад ВСИЧКО. Гейтът е текстът
-- „SQL-ТЕСТ ОК" в съобщението, не това, че има грешка.
--
-- ОБЕКТИТЕ СА ИЗМИСЛЕНИ ('__sqltest_*'), задачата е РЕАЛНАТА „Изтегляне по
-- разлики" (сряда). Фиксираният p_today = 2026-10-07 прави теста независим от
-- деня на пускане. Тригерите върху stock_returns се изключват за транзакцията,
-- за да се разиграва всяко извикване на sync ръчно.
--
-- СЦЕНАРИИТЕ (всеки обект е с два актуализирани от него diff записа, отметка
-- има; после се добавя НОВ невзет запис):
--   s1  нов запис СЪС следа от обекта (дата = днес, store:s1)  → отметката ОСТАВА
--   s2  нов запис БЕЗ следа (старото поведение, Троян 07.10)   → отметката се маха
--   s3  нов запис със следа от ОФИСА (office:…)                → отметката се маха
--   s4  нов запис със следа от ОБЕКТА, но с БЪДЕЩА дата        → отметката се маха
--   s5  нов запис със следа от ДРУГ обект (store:s1 за s5)     → отметката се маха
-- Мутанти: махнато сравнение на confirmed_by (убива s3, s5); махната горна
-- граница на датата (убива s4).

create or replace function pg_temp.t(cond boolean, msg text) returns text
language sql as $$ select case when coalesce(cond, false) then '' else E'\n  ПАДНА: ' || msg end $$;

create or replace function pg_temp.run_checks() returns text language plpgsql as $f$
declare
  T_DIFF uuid := 'e9d418af-311a-45ec-b4da-0f9ad69205e7';
  WED    date := date '2026-10-07';
  FRI    date := date '2026-10-09';
  s text;
  fails text := '';
  has_mark boolean;
begin
  alter table public.stock_returns disable trigger user;

  -- Предпоставка: задачата е със срок сряда, иначе p_today не важи.
  fails := fails || pg_temp.t(
    (select due_idx from public.stock_returns_tasks_for_week(date '2026-10-05') where task_id = T_DIFF) = 2,
    '„Изтегляне по разлики" не е със срок сряда — тестовите дати не важат');

  foreach s in array array['__sqltest_s1','__sqltest_s2','__sqltest_s3','__sqltest_s4','__sqltest_s5'] loop
    insert into public.stock_returns (store_name, source, status, confirmed_date, confirmed_by) values
      (s, 'diff', 'pending', date '2026-10-05', 'store:' || s),
      (s, 'diff', 'pending', WED,               'store:' || s);
    perform public.stock_returns_sync_completions(s, WED);
    fails := fails || pg_temp.t(
      exists (select 1 from public.task_completions where recurring_task_id = T_DIFF and store_name = s
                and completion_date = WED and completed_by = 'auto:stock-returns'),
      s || ': преди новия запис отметката трябва да е поставена');
  end loop;

  -- Новите записи.
  insert into public.stock_returns (store_name, source, status, confirmed_date, confirmed_by, confirmed_at) values
    ('__sqltest_s1', 'diff', 'pending', WED, 'store:__sqltest_s1', now()),
    ('__sqltest_s2', 'diff', 'pending', null, null, null),
    ('__sqltest_s3', 'diff', 'pending', WED, 'office:Цветелина', now()),
    ('__sqltest_s4', 'diff', 'pending', FRI, 'store:__sqltest_s4', now()),
    ('__sqltest_s5', 'diff', 'pending', WED, 'store:__sqltest_s1', now());

  foreach s in array array['__sqltest_s1','__sqltest_s2','__sqltest_s3','__sqltest_s4','__sqltest_s5'] loop
    perform public.stock_returns_sync_completions(s, WED);
  end loop;

  has_mark := exists (select 1 from public.task_completions where recurring_task_id = T_DIFF
                        and store_name = '__sqltest_s1' and completion_date = WED and completed_by = 'auto:stock-returns');
  fails := fails || pg_temp.t(has_mark, 's1: нов запис ОТ ОБЕКТА (днес, store:s1) → отметката трябва да ОСТАНЕ');
  foreach s in array array['__sqltest_s2','__sqltest_s3','__sqltest_s4','__sqltest_s5'] loop
    fails := fails || pg_temp.t(
      not exists (select 1 from public.task_completions where recurring_task_id = T_DIFF and store_name = s and completion_date = WED),
      s || ': отметката трябва да се МАХНЕ (' ||
        case s when '__sqltest_s2' then 'без следа' when '__sqltest_s3' then 'следа от офиса'
               when '__sqltest_s4' then 'бъдеща дата' else 'следа от друг обект' end || ')');
  end loop;

  -- Връщане на следата: когато обектът поправи неактуализирания запис, отметката се връща.
  update public.stock_returns set confirmed_date = WED, confirmed_by = 'store:__sqltest_s2', confirmed_at = now()
   where store_name = '__sqltest_s2' and confirmed_date is null;
  perform public.stock_returns_sync_completions('__sqltest_s2', WED);
  fails := fails || pg_temp.t(
    exists (select 1 from public.task_completions where recurring_task_id = T_DIFF and store_name = '__sqltest_s2' and completion_date = WED),
    's2: след като обектът постави следа на записа, отметката трябва да се върне');

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
      ('M1 махнато сравнение на confirmed_by', 'public.stock_returns_store_done(text,date,date,text)'::text,
        E'\n            or confirmed_by is distinct from (''store:'' || p_store)', ''),
      ('M2 махната горна граница на датата',     'public.stock_returns_store_done(text,date,date,text)',
        E'\n            or confirmed_date > p_upto', '')
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
