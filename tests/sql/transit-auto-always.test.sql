-- SQL тест: „Стока на път" в Бюлетина — автоматична ВИНАГИ
-- (transit-auto-always-schema.sql, решение на Тенчо 08.11.2026).
-- Проверява transit_sync_completions, bulletin_tasks_transit_sync_trg и
-- transit_mark_empty_stores такива, каквито са В БАЗАТА в момента.
--
-- Пуска се през Supabase MCP execute_sql (или apply_migration). НИЩО не остава
-- в базата: файлът завършва с raise exception, което връща назад тестовите
-- редове, временната функция и мутациите. Гейтът е ТЕКСТЪТ „SQL-ТЕСТ ОК".
-- ПРЕДИ миграцията: пред файла се слагат трите create or replace от
-- transit-auto-always-schema.sql (без еднократния sync накрая) — в същата
-- заявка, тоест и те се връщат назад.
--
-- ═══ ИЗОЛАЦИЯ ════════════════════════════════════════════════════════════
-- Реалните входящи редове се архивират В ТРАНЗАКЦИЯТА (archived_at = now()),
-- тоест функциите виждат само тестовите. Задачите са с изрични target_stores
-- (тестови обекти), за да не зависят от users. Първата проверка брои
-- неархивираните входящи редове и спира, ако не са само тестовите.
--
-- ═══ МУТАЦИИ ═════════════════════════════════════════════════════════════
-- __sqltest_taa_body(fn, mf, mt) сменя низа mf с mt в тялото на функцията fn
-- (pg_get_functiondef → replace → execute). Низът трябва да е ТОЧНО ЕДИН —
-- иначе грешка, която НЕ се брои за убит мутант. Всяка итерация е в своя
-- подтранзакция. Убит мутант = върнал поне една паднала проверка.

create or replace function public.__sqltest_taa_body(fn text, mf text, mt text)
returns text
language plpgsql
as $fn$
declare
  v_src   text;
  v_hits  integer;
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  b_id    uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid;
  ob_a text := '__sqltest_taa_a';   -- всички редове обработени
  ob_b text := '__sqltest_taa_b';   -- един необработен ред
  ob_c text := '__sqltest_taa_c';   -- без редове
  n integer;
  ds text;
  fails text := '';
begin
  if mf is not null then
    v_src  := pg_get_functiondef(fn::regprocedure);
    v_hits := coalesce(array_length(string_to_array(v_src, mf), 1), 1) - 1;
    if v_hits <> 1 then
      raise exception 'МУТАНТЪТ НЕ Е ЕДНОЗНАЧЕН (% попадения в %): %', v_hits, fn, mf;
    end if;
    execute replace(v_src, mf, mt);
  end if;

  /* ── 0. изолация ───────────────────────────────────────────────────────── */
  update goods_transit set archived_at = now() where archived_at is null;
  insert into goods_transit (store_name, direction, material_name, status, imported_at) values
    (ob_a, 'incoming', '__sqltest_taa_a1', 'received', now() - interval '20 minutes'),
    (ob_a, 'incoming', '__sqltest_taa_a2', 'received', now() - interval '20 minutes'),
    (ob_b, 'incoming', '__sqltest_taa_b1', 'pending',  now() - interval '20 minutes');
  select count(*) into n from goods_transit where direction = 'incoming' and archived_at is null;
  if n <> 3 then
    raise exception 'ТЕСТЪТ НЕ Е ИЗОЛИРАН: % неархивирани входящи реда (очаквани 3)', n;
  end if;

  insert into bulletins (week_number, year, status, title)
    values (96, 2099, 'published', '__sqltest_taa_bul') returning id into b_id;

  /* Всички с auto_complete = false — точно случаят от 08.11. */
  insert into bulletin_tasks (bulletin_id, department, title, task_type, linked_module, auto_complete,
                              due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_taa_one', 'info', 'transit', false,
          v_today, array[v_today], array[ob_a, ob_b, ob_c]) returning id into t1;
  insert into bulletin_tasks (bulletin_id, department, title, task_type, linked_module, auto_complete,
                              due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_taa_multi', 'info', 'transit', false,
          v_today - 2, array[v_today - 2, v_today - 1, v_today], array[ob_a, ob_b, ob_c]) returning id into t2;
  /* Последният ден е в прозореца (днес − 10), първият — не (днес − 20). */
  insert into bulletin_tasks (bulletin_id, department, title, task_type, linked_module, auto_complete,
                              due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_taa_win_in', 'info', 'transit', false,
          v_today - 20, array[v_today - 20, v_today - 10], array[ob_a, ob_b, ob_c]) returning id into t3;
  /* Последният ден е извън прозореца (днес − 15). */
  insert into bulletin_tasks (bulletin_id, department, title, task_type, linked_module, auto_complete,
                              due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_taa_win_out', 'info', 'transit', false,
          v_today - 16, array[v_today - 16, v_today - 15], array[ob_a, ob_b, ob_c]) returning id into t4;

  /* ── 7. ТРИГЕРЪТ: само записът на задачата вече я отмята ───────────────── */
  if (select count(*) from task_completions where task_id = t1 and store_name = ob_a and completed_by = 'auto:transit') <> 1
     or (select count(*) from task_completions where task_id = t2 and store_name = ob_a and completed_by = 'auto:transit') <> 3 then
    fails := fails || ' [7 тригерът при запис на задача (auto_complete=false) отмята обекта]';
  end if;

  perform transit_sync_completions(ob_a);
  perform transit_sync_completions(ob_b);
  perform transit_sync_completions(ob_c);

  /* ── 1. еднодневна ─────────────────────────────────────────────────────── */
  if not exists (select 1 from task_completions where task_id = t1 and store_name = ob_a
                   and completion_date = v_today and status = 'done' and completed_by = 'auto:transit') then
    fails := fails || ' [1 еднодневна с auto_complete=false се отмята]';
  end if;

  /* ── 2. многодневна — за всеки ден ─────────────────────────────────────── */
  select string_agg(completion_date::text, ',' order by completion_date) into ds
    from task_completions where task_id = t2 and store_name = ob_a and completed_by = 'auto:transit';
  if ds is distinct from ((v_today - 2)::text || ',' || (v_today - 1)::text || ',' || v_today::text) then
    fails := fails || ' [2 многодневна → отметка за всеки ден (' || coalesce(ds, 'няма') || ')]';
  end if;

  /* ── 3. обект с необработен ред → нищо ─────────────────────────────────── */
  if exists (select 1 from task_completions where store_name = ob_b and task_id in (t1, t2, t3, t4)) then
    fails := fails || ' [3 обект с необработен ред НЕ се отмята]';
  end if;

  /* ── 4. обект без редове → нищо от sync ────────────────────────────────── */
  if exists (select 1 from task_completions where store_name = ob_c and completed_by = 'auto:transit') then
    fails := fails || ' [4 обект без редове не се отмята от sync]';
  end if;

  /* ── 5. прозорец по ПОСЛЕДНИЯ ден ──────────────────────────────────────── */
  if (select count(*) from task_completions where task_id = t3 and store_name = ob_a) <> 2 then
    fails := fails || ' [5 последен ден днес−10 → и двата дни отметнати]';
  end if;
  if exists (select 1 from task_completions where task_id = t4) then
    fails := fails || ' [5 последен ден днес−15 → нищо]';
  end if;

  /* ── 6. отложена → изпълнена (тригерът при смяна на linked_module) ─────── */
  insert into bulletin_tasks (bulletin_id, department, title, task_type, linked_module, auto_complete,
                              due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_taa_postp', 'info', null, false,
          v_today, array[v_today], array[ob_a]) returning id into t5;
  insert into task_completions (task_id, bulletin_id, store_name, completed_by, completed_at,
                                status, completion_date, postponed_to, comment)
  values (t5, b_id, ob_a, 'Управител Тест', now(), 'postponed', v_today, v_today + 1, 'причина');
  update bulletin_tasks set linked_module = 'transit' where id = t5;
  if not exists (select 1 from task_completions where task_id = t5 and store_name = ob_a
                   and status = 'done' and completed_by = 'auto:transit') then
    fails := fails || ' [6 отложена → done от тригера при смяна на linked_module]';
  end if;

  /* ── 8. transit_mark_empty_stores: обектът БЕЗ редове, всеки ден ───────── */
  perform transit_mark_empty_stores();
  select string_agg(completion_date::text, ',' order by completion_date) into ds
    from task_completions where task_id = t2 and store_name = ob_c and completed_by = 'auto:transit-empty';
  if ds is distinct from ((v_today - 2)::text || ',' || (v_today - 1)::text || ',' || v_today::text) then
    fails := fails || ' [8 празен обект, многодневна → всеки ден (' || coalesce(ds, 'няма') || ')]';
  end if;
  if not exists (select 1 from task_completions where task_id = t1 and store_name = ob_c
                   and completed_by = 'auto:transit-empty' and completion_date = v_today) then
    fails := fails || ' [8 празен обект, еднодневна с auto_complete=false]';
  end if;
  if (select count(*) from task_completions where task_id = t3 and store_name = ob_c and completed_by = 'auto:transit-empty') <> 2 then
    fails := fails || ' [8 прозорец по последния ден (днес−10) → двата дни]';
  end if;
  if exists (select 1 from task_completions where task_id = t4) then
    fails := fails || ' [8 последен ден днес−15 → нищо]';
  end if;
  if exists (select 1 from task_completions where store_name in (ob_a, ob_b) and completed_by = 'auto:transit-empty') then
    fails := fails || ' [8 обект С редове не е „празен"]';
  end if;

  /* ── 9. самопочистване: празният получи ред → маха се само за днес+ ────── */
  insert into goods_transit (store_name, direction, material_name, status, imported_at)
  values (ob_c, 'incoming', '__sqltest_taa_c1', 'pending', now() - interval '20 minutes');
  perform transit_mark_empty_stores();
  if exists (select 1 from task_completions where store_name = ob_c and completed_by = 'auto:transit-empty'
               and task_id in (t1, t2) and completion_date >= v_today) then
    fails := fails || ' [9 самопочистване за днешния ден (и при многодневна)]';
  end if;
  if (select count(*) from task_completions where task_id = t2 and store_name = ob_c and completed_by = 'auto:transit-empty'
        and completion_date < v_today) <> 2 then
    fails := fails || ' [9 минали дни остават]';
  end if;
  if (select count(*) from task_completions where task_id = t3 and store_name = ob_c and completed_by = 'auto:transit-empty') <> 2 then
    fails := fails || ' [9 минала задача остава]';
  end if;

  return fails;
end
$fn$;

do $outer$
declare
  S  constant text := 'public.transit_sync_completions(text)';
  T  constant text := 'public.bulletin_tasks_transit_sync_trg()';
  E  constant text := 'public.transit_mark_empty_stores()';
  m_nm text[] := array[
    '(чист пробег)',
    'S1 sync: върнато auto_complete           (1/2/7)',
    'S2 sync: само първия ден                 (2)',
    'S3 sync: без „отговорил на всичко"       (3)',
    'S4 sync: прозорец по първия ден          (5)',
    'T1 тригер: върнато auto_complete         (7/6)',
    'E1 empty: върнато auto_complete          (8)',
    'E2 empty: само първия ден                (8)',
    'E3 empty: прозорец по първия ден         (8)',
    'E4 empty: отмята и обект С редове        (8)',
    'E5 empty: чисти само първия ден          (9)',
    'E6 empty: чисти и минали дни             (9)'
  ];
  m_fn text[] := array[null, S, S, S, S, T, E, E, E, E, E, E];
  m_from text[] := array[
    null,
    'where bt.linked_module = ''transit''',
    'and d.day is not null',
    'and transit_store_done_since(p_store,',
    '(select max(x)',
    'if new.linked_module is distinct from ''transit'' then',
    'where bt.linked_module = ''transit''',
    'where d.day is not null',
    '(select max(x)',
    'and not exists (',
    'and tc.completion_date = any(t.days)',
    'and tc.completion_date >= v_today'
  ];
  m_to text[] := array[
    null,
    'where bt.linked_module = ''transit'' and bt.auto_complete',
    'and d.day is not distinct from coalesce(bt.due_dates[1], bt.due_date)',
    'and true or transit_store_done_since(p_store,',
    '(select min(x)',
    'if new.linked_module is distinct from ''transit'' or not coalesce(new.auto_complete, false) then',
    'where bt.linked_module = ''transit'' and bt.auto_complete',
    'where d.day is not distinct from t.days[1]',
    '(select min(x)',
    'and exists (',
    'and tc.completion_date = t.days[1]',
    'and true'
  ];
  i integer;
  res text;
  txt text;
  clean_fails text := '(не е пускан)';
  killed integer := 0;
  survived integer := 0;
  report text := '';
  md5s text;
begin
  /* Отпечатък на ТЕСТВАНИТЕ тела — сверява се с md5 на телата в
     transit-auto-always-schema.sql (пусната ли е точно тази версия). */
  select string_agg(proname || '=' || md5(prosrc), ' ' order by proname) into md5s
    from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('transit_sync_completions', 'bulletin_tasks_transit_sync_trg', 'transit_mark_empty_stores');
  for i in 1 .. array_length(m_nm, 1) loop
    begin
      res := public.__sqltest_taa_body(m_fn[i], m_from[i], m_to[i]);
      raise exception 'RES:%', res;
    exception when others then
      txt := sqlerrm;
      if left(txt, 4) = 'RES:' then
        res := substr(txt, 5);
        if i = 1 then
          clean_fails := res;
        elsif res = '' then
          survived := survived + 1;
          report := report || chr(10) || '  ОЦЕЛЯ  ' || m_nm[i];
        else
          killed := killed + 1;
          report := report || chr(10) || '  убит   ' || m_nm[i] || ' →' || res;
        end if;
      else
        if i = 1 then clean_fails := 'ГРЕШКА: ' || txt; end if;
        survived := survived + 1;
        report := report || chr(10) || '  ГРЕШКА ' || m_nm[i] || ': ' || txt;
      end if;
    end;
  end loop;

  if clean_fails = '' and survived = 0 then
    raise exception 'SQL-ТЕСТ ОК — чист пробег без падания, мутанти убити %/% | %:%', killed, killed + survived, md5s, report;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ — чист пробег:% | убити %/% | %:%', coalesce(nullif(clean_fails, ''), ' без падания'), killed, killed + survived, md5s, report;
  end if;
end
$outer$;
