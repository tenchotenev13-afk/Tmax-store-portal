-- SQL тест на transit_mark_empty_stores() и report_excluded_stores()
-- (transit-empty-stores-schema.sql, миграция 20260928001552).
--
-- Пуска се през Supabase MCP **apply_migration** — execute_sql е само за
-- четене. НИЩО не остава в базата: файлът винаги завършва с raise exception,
-- което връща назад и тестовите редове, и временната функция, и записа на
-- самата миграция. Гейтът е ТЕКСТЪТ „SQL-ТЕСТ ОК", не това, че има грешка.
--
-- ═══ КАК СЕ РАЗИГРАВА ИМПОРТЪТ ═════════════════════════════════════════════
-- Импортът в transit.js пише на порции по 50 реда и тригерите по goods_transit
-- се палят след ВСЯКА порция. Тук порциите се разиграват през created_at:
--   · ред с created_at = now()              → „току-що", тишината НЕ е минала;
--   · ред с created_at = now() − 20 минути  → импортът е приключил.
-- Часовникът не се пипа. now() е замразено за транзакцията, значи двете
-- сравнения са детерминирани, а не зависят от това колко е текъл тестът.
--
-- ═══ ЗАЩО ТЕСТЪТ НЕ ВИЖДА РЕАЛНИЯ ИМПОРТ ═══════════════════════════════════
-- Реалните входящи редове са от 01.09.2026. Задачите тук са с „в сила от" в
-- текущата седмица, тоест прозорецът им (starts_on − 7) започва след тази дата.
-- Изолацията НЕ се приема на доверие — първата проверка брои реалните редове в
-- прозореца и СПИРА теста, ако не са нула.
--
-- ═══ МУТАЦИИ ═══════════════════════════════════════════════════════════════
-- Тялото е временна функция __sqltest_empty_body(mf, mt), която ВРЪЩА списъка
-- паднали проверки вместо да гърми. Долният цикъл я вика веднъж чисто и веднъж
-- за всеки мутант, всяка итерация в СВОЯ подтранзакция (begin/exception), тоест
-- и тестовите редове, и мутираната функция се връщат преди следващата.
-- mf/mt заменят низ в ТЯЛОТО на живата функция (pg_get_functiondef → replace →
-- execute). Низът трябва да се среща ТОЧНО ЕДИН път — иначе тестът спира;
-- мутация, която не се е приложила, би минала за „убит мутант".
-- Убит мутант = върнал поне една паднала проверка.

create or replace function public.__sqltest_empty_body(mf text, mt text)
returns text
language plpgsql
as $fn$
declare
  v_src     text;
  v_hits    integer;
  v_today   date := (now() at time zone 'Europe/Sofia')::date;
  v_mon     date;             -- понеделникът на текущата седмица
  b_id      uuid;
  t_win     uuid;   -- прозорец по „в сила от" (starts_on)
  t_plain   uuid;   -- без прозорец (v_from = null)
  t_all     uuid;   -- без target_stores → обхватът е „отчетните обекти"
  t_old     uuid;   -- срокът е минал
  d_win     date;
  d_old     date;
  from_old  timestamptz;
  ob_a  text := '__sqltest_ob_a';    -- ИМА редове, необработени
  ob_b  text := '__sqltest_ob_b';    -- НЯМА редове
  ob_in text := '__sqltest_ob_incl'; -- потребителски обект, отчетен
  ob_ex text := '__sqltest_ob_excl'; -- потребителски обект, ИЗКЛЮЧЕН
  n integer;
  who text;
  dt  date;
  fails text := '';
begin
  /* ── мутация (ако има) ────────────────────────────────────────────────── */
  if mf is not null then
    v_src  := pg_get_functiondef('public.transit_mark_empty_stores()'::regprocedure);
    v_hits := coalesce(array_length(string_to_array(v_src, mf), 1), 1) - 1;
    if v_hits <> 1 then
      raise exception 'МУТАНТЪТ НЕ Е ЕДНОЗНАЧЕН (% попадения): %', v_hits, mf;
    end if;
    execute replace(v_src, mf, mt);
  end if;

  v_mon    := v_today - (extract(isodow from v_today)::int - 1);
  d_win    := v_mon + 7;                 -- срок: следващият понеделник
  d_old    := v_mon - 7;                 -- срок в миналото
  from_old := ((v_mon - 14)::timestamp at time zone 'Europe/Sofia');

  /* ── 0. ИЗОЛАЦИЯ: реални редове в прозореца на теста? ─────────────────── */
  select count(*) into n from goods_transit
   where direction = 'incoming' and created_at >= from_old;
  if n <> 0 then
    raise exception 'ТЕСТЪТ НЕ Е ИЗОЛИРАН: % реални входящи реда след % — не може да различи своите от чуждите', n, from_old;
  end if;

  /* ── 0б. report_excluded_stores() чете ключа ──────────────────────────── */
  if coalesce(array_length(report_excluded_stores(), 1), 0) < 3
     or not ('Централен офис' = any(report_excluded_stores())) then
    fails := fails || ' [0б report_excluded_stores() чете ключа от app_settings]';
  end if;

  /* ── тестови данни ─────────────────────────────────────────────────────── */
  insert into users (email, store_name) values ('__sqltest_in@x', ob_in);
  insert into users (email, store_name) values ('__sqltest_ex@x', ob_ex);
  update app_settings
     set value = (select jsonb_agg(x)::text
                    from (select unnest(report_excluded_stores()) as x
                          union all select ob_ex) q)
   where key = 'report_excluded_stores';
  if not (ob_ex = any(report_excluded_stores())) then
    fails := fails || ' [подготовка: тестовият обект влезе в изключените]';
  end if;

  insert into bulletins (week_number, year, status, title)
    values (97, 2099, 'published', '__sqltest_bul') returning id into b_id;

  /* Обхватът е ИЗРИЧЕН (target_stores), за да не зависят проверките от това
     колко реални обекта има в users. t_all по-долу проверява другия обхват. */
  insert into bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     spans_from, starts_on, due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_win', 'info', 'transit', true,
          v_mon, v_today, d_win, array[d_win], array[ob_a, ob_b])
  returning id into t_win;

  /* ── 1. ПРЕДИ ИМПОРТА: нула редове в прозореца → никой не се отмята ────── */
  n := transit_mark_empty_stores();
  if exists (select 1 from task_completions where task_id = t_win) then
    fails := fails || ' [1 преди импорта никой не се отмята]';
  end if;

  /* ── 2. ПЪРВА ПОРЦИЯ, току-що вмъкната: тишината НЕ е минала ───────────── */
  insert into goods_transit (store_name, direction, material_name, status, created_at)
  values (ob_a, 'incoming', '__sqltest_p1', 'pending', now());

  /* Задача БЕЗ прозорец (v_from = null) — вижда цялата таблица, значи и двата
     режима минават през едни и същи две условия. */
  insert into bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_plain', 'info', 'transit', true,
          v_today, array[v_today], array[ob_a, ob_b])
  returning id into t_plain;

  n := transit_mark_empty_stores();
  if exists (select 1 from task_completions
              where task_id in (t_win, t_plain) and store_name = ob_b) then
    fails := fails || ' [2 по време на импорта обектът БЕЗ редове не се отмята]';
  end if;

  /* ── 3. ИМПОРТЪТ Е ПРИКЛЮЧИЛ (последният ред е на 20 минути) ───────────── */
  update goods_transit set created_at = now() - interval '20 minutes'
   where material_name = '__sqltest_p1';

  n := transit_mark_empty_stores();

  if not exists (select 1 from task_completions
                  where task_id = t_win and store_name = ob_b and status = 'done') then
    fails := fails || ' [3 след тишината обектът БЕЗ редове се отмята (прозорец)]';
  end if;

  if not exists (select 1 from task_completions
                  where task_id = t_plain and store_name = ob_b and status = 'done') then
    fails := fails || ' [3 същото и при задача без прозорец]';
  end if;

  select completed_by into who from task_completions
   where task_id = t_win and store_name = ob_b limit 1;
  if who is distinct from 'auto:transit-empty' then
    fails := fails || ' [3 completed_by = auto:transit-empty, е ' || coalesce(who, 'null') || ']';
  end if;

  select completion_date into dt from task_completions
   where task_id = t_win and store_name = ob_b limit 1;
  if dt is distinct from d_win then
    fails := fails || ' [3 completion_date = СРОКА ' || d_win || ', е ' || coalesce(dt::text, 'null') || ']';
  end if;

  /* ── 4. Обектът С НЕОБРАБОТЕНИ редове НЕ се отмята от това правило ─────── */
  if exists (select 1 from task_completions
              where task_id in (t_win, t_plain) and store_name = ob_a) then
    fails := fails || ' [4 обект с необработени редове не се отмята]';
  end if;

  /* ── 5. Второ пускане не дублира ──────────────────────────────────────── */
  n := transit_mark_empty_stores();
  select count(*) into n from task_completions
   where task_id = t_win and store_name = ob_b;
  if n <> 1 then
    fails := fails || ' [5 второ пускане не дублира (има ' || n || ')]';
  end if;

  /* ── 6. ОБХВАТ без target_stores: отчетните обекти, без изключените ────── */
  insert into bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     spans_from, starts_on, due_date, due_dates)
  values (b_id, 'warehouse', '__sqltest_all', 'info', 'transit', true,
          v_mon, v_today, d_win, array[d_win])
  returning id into t_all;

  n := transit_mark_empty_stores();
  if not exists (select 1 from task_completions
                  where task_id = t_all and store_name = ob_in) then
    fails := fails || ' [6 отчетният обект без редове се отмята и без target_stores]';
  end if;
  if exists (select 1 from task_completions
              where task_id = t_all and store_name = ob_ex) then
    fails := fails || ' [6 ИЗКЛЮЧЕНИЯТ обект НЕ се отмята]';
  end if;

  /* ── 7. ДОПЪЛВАЩ ИМПОРТ: празният обект получава редове → отметката пада ─
     Тригерът по goods_transit САМО вмъква (transit_sync_completions никога не
     трие), тоест махането може да дойде единствено от проверяваната функция. */
  insert into goods_transit (store_name, direction, material_name, status, created_at)
  values (ob_b, 'incoming', '__sqltest_late', 'pending', now() - interval '20 minutes');

  n := transit_mark_empty_stores();
  if exists (select 1 from task_completions
              where task_id in (t_win, t_plain) and store_name = ob_b
                and completed_by = 'auto:transit-empty') then
    fails := fails || ' [7 допълващ импорт маха отметката „без редове"]';
  end if;

  /* ── 8. Ръчна отметка НЕ се пипа от самопочистването ─────────────────────
     Сценарият е „отметката на обекта е РЪЧНА", значи започва от чисто: без
     този delete мутант, който е оставил своя отметка за (t_win, ob_b, d_win),
     чупи ТЕСТА с duplicate key вместо да падне на проверка. */
  delete from task_completions
   where task_id = t_win and store_name = ob_b and completion_date = d_win;
  insert into task_completions
    (task_id, bulletin_id, store_name, completed_by, completed_at, status, completion_date)
  values (t_win, b_id, ob_b, 'Управител Тест', now(), 'done', d_win);
  n := transit_mark_empty_stores();
  if not exists (select 1 from task_completions
                  where task_id = t_win and store_name = ob_b
                    and completed_by = 'Управител Тест') then
    fails := fails || ' [8 ръчната отметка остава непокътната]';
  end if;

  /* ── 9. СЛЕД СРОКА историята не се пипа ───────────────────────────────── */
  insert into bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     spans_from, starts_on, due_date, due_dates, target_stores)
  values (b_id, 'warehouse', '__sqltest_old', 'info', 'transit', true,
          v_mon - 14, d_old, d_old, array[d_old], array[ob_b])
  returning id into t_old;
  insert into task_completions
    (task_id, bulletin_id, store_name, completed_by, completed_at, status, completion_date)
  values (t_old, b_id, ob_b, 'auto:transit-empty', now(), 'done', d_old);
  /* ob_b ВЕЧЕ има редове в този прозорец (редът от т.7), тоест ако срокът не се
     зачиташе, отметката щеше да падне и отчетът за онзи ден да се пренапише. */
  n := transit_mark_empty_stores();
  if not exists (select 1 from task_completions
                  where task_id = t_old and store_name = ob_b
                    and completed_by = 'auto:transit-empty') then
    fails := fails || ' [9 след срока отметката НЕ се маха]';
  end if;

  /* ── 10. Липсващ ключ → функцията не прави НИЩО ───────────────────────── */
  delete from task_completions where task_id in (t_win, t_plain, t_all);
  delete from goods_transit where store_name = ob_b;
  update app_settings set value = '' where key = 'report_excluded_stores';
  if report_excluded_stores() is not null then
    fails := fails || ' [10 при празна стойност report_excluded_stores() връща null]';
  end if;
  n := transit_mark_empty_stores();
  if n <> 0 or exists (select 1 from task_completions
                        where task_id in (t_win, t_plain, t_all)) then
    fails := fails || ' [10 без ключа не се отмята нищо (върна ' || n || ')]';
  end if;

  /* ── 11. Невалидна стойност (не е JSON масив) → същото ────────────────── */
  update app_settings set value = 'Централен офис, Пазарджик' where key = 'report_excluded_stores';
  if report_excluded_stores() is not null then
    fails := fails || ' [11 при не-JSON стойност се връща null, а не мълчалив празен списък]';
  end if;
  n := transit_mark_empty_stores();
  if n <> 0 or exists (select 1 from task_completions
                        where task_id in (t_win, t_plain, t_all)) then
    fails := fails || ' [11 при невалиден ключ не се отмята нищо (върна ' || n || ')]';
  end if;

  return fails;
end
$fn$;

do $outer$
declare
  /* Всеки мутант е ЕДНА смяна в тялото. Отдясно е проверката, която ГО ХВАЩА —
     ако падне друга, това не е провал, но си заслужава поглед. */
  m_nm text[] := array[
    '(чист пробег)',
    'M1  без импорт пак отмята            (хваща я 1)',
    'M2  не чака тишината                 (хваща я 2)',
    'M3  тишината е нула                  (хваща я 2)',
    'M4  етикетът е auto:transit          (хваща я 3)',
    'M5  completion_date = днес, не срока  (хваща я 3)',
    'M6  отмята и обект С редове          (хваща я 3/4)',
    'M7  чистенето не различава ръчното   (хваща я 8)',
    'M8  срокът не се зачита              (хваща я 9)',
    'M9  няма самопочистване              (хваща я 7)',
    'M10 липсващият ключ не спира         (хваща я 10)'
  ];
  m_from text[] := array[
    null,
    'if v_rows = 0 then continue; end if;',
    'if v_last > now() - v_quiet then continue; end if;',
    'interval ''10 minutes''',
    '''auto:transit-empty'', now(), ''done'', t.due',
    '''done'', t.due',
    'not exists (',
    'and tc.completed_by = ''auto:transit-empty''',
    'if t.due >= v_today then',
    'if t.due >= v_today then',
    'if v_excl is null then'
  ];
  m_to text[] := array[
    null,
    'if false then continue; end if;',
    'if false then continue; end if;',
    'interval ''0 minutes''',
    '''auto:transit'', now(), ''done'', t.due',
    '''done'', v_today',
    'exists (',
    'and tc.completed_by is not null',
    'if true then',
    'if false then',
    'if false then'
  ];
  i integer;
  res text;
  txt text;
  clean_fails text := '(не е пускан)';
  killed integer := 0;
  survived integer := 0;
  report text := '';
begin
  for i in 1 .. array_length(m_nm, 1) loop
    /* Подтранзакция: raise-ът долу връща назад и тестовите редове, и мутацията
       на функцията, а резултатът излиза през текста на изключението. */
    begin
      res := public.__sqltest_empty_body(m_from[i], m_to[i]);
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
        /* Грешка, а не резултат: мутант, който не се е приложил, или счупен
           тест. И в двата случая не е „убит". */
        survived := survived + 1;
        report := report || chr(10) || '  ГРЕШКА ' || m_nm[i] || ': ' || txt;
      end if;
    end;
  end loop;

  if clean_fails = '' and survived = 0 then
    raise exception 'SQL-ТЕСТ ОК: чист пробег без паднали проверки, % мутанта убити%',
                    killed, report;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ: чист пробег →[%], оцелели мутанти: %; %',
                    clean_fails, survived, report;
  end if;
end
$outer$;
