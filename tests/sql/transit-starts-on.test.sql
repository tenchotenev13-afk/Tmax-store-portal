-- SQL тест на прозореца по импорт в transit_sync_completions()
-- (bulletin-task-starts-on-schema.sql, миграция 20260927195603).
--
-- Пуска се през Supabase MCP **apply_migration** — execute_sql е само за
-- четене и вмъкването там пада с 25006. Целият файл е ЕДИН DO блок и НИЩО не
-- остава в базата: блокът винаги завършва с raise exception, което връща назад
-- и тестовите редове, и записа на самата миграция. Резултатът е в текста на
-- грешката:
--   „SQL-ТЕСТ ОК (N проверки)"  — минал;
--   „SQL-ТЕСТ ПРОВАЛ: …"        — паднал, с имената на паднали проверки.
-- Гейтът е ТЕКСТЪТ „SQL-ТЕСТ ОК", не това, че има грешка.
--
-- Мутации: сложи повреден create or replace function в променливата mutant —
-- изпълнява се в същата транзакция преди проверките и също се връща назад.
-- Всеки мутант трябва да даде ПРОВАЛ.
--
-- ═══ ЗАЩО НЕ СЕ МЕСТИ ЧАСОВНИКЪТ ═══════════════════════════════════════════
-- Критерият НЕ сравнява starts_on с днес (решение на Тенчо, 27.09.2026:
-- синхронизацията не се блокира по starts_on > днес, иначе обект, приключил
-- ранен импорт, никога не се отмята — на starts_on няма тригер). Сравнява
-- created_at на редовете с starts_on − 7 дни. Затова „преди/на/след starts_on"
-- се разиграва с ДАТИТЕ НА ИМПОРТА, а не с фалшив часовник: старата партида е
-- с created_at = starts_on − 30, новата — starts_on или starts_on − 1.
--
-- Отмятането минава през ИСТИНСКИТЕ тригери по goods_transit (INSERT/UPDATE),
-- не през пряко извикване на функцията — това е пътят, по който работи на живо.

do $test$
declare
  mutant text := null;  -- МУТАНТ ТУК
  mon        date := (date_trunc('week', now() at time zone 'Europe/Sofia'))::date;
  ob         text := '__sqltest_ob_transit';     -- импорт навреме
  ob_ran     text := '__sqltest_ob_ranen';       -- импорт ден по-рано
  ob_gran    text := '__sqltest_ob_granica';     -- импорт 8 дни по-рано
  b_id       uuid;
  t_plain    uuid;   -- без starts_on → старото поведение
  t_span     uuid;   -- starts_on = mon + 10
  t_ran      uuid;   -- starts_on = mon + 12, импорт на mon + 11
  t_gran     uuid;   -- starts_on = mon + 12, импорт на mon + 4 (извън прозореца)
  s_span     date := mon + 10;
  s_ran      date := mon + 12;
  due_plain  date := mon + 9;
  due_span   date := mon + 16;
  due_ran    date := mon + 17;
  sofia      text := 'Europe/Sofia';
  n          integer;
  d          date;
  fails      text := '';
  checks     integer := 0;
begin
  if mutant is not null then execute mutant; end if;

  insert into public.bulletins (week_number, year, status, title)
    values (99, 2099, 'published', '__sqltest_bul') returning id into b_id;

  insert into public.bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     due_date, due_dates, spans_from, starts_on, target_stores)
  values (b_id, 'warehouse', '__sqltest_plain', 'info', 'transit', true,
          due_plain, array[due_plain], mon, null, array[ob])
  returning id into t_plain;

  insert into public.bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     due_date, due_dates, spans_from, starts_on, target_stores)
  values (b_id, 'warehouse', '__sqltest_span', 'info', 'transit', true,
          due_span, array[due_span], mon, s_span, array[ob])
  returning id into t_span;

  insert into public.bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     due_date, due_dates, spans_from, starts_on, target_stores)
  values (b_id, 'warehouse', '__sqltest_ranen', 'info', 'transit', true,
          due_ran, array[due_ran], mon, s_ran, array[ob_ran])
  returning id into t_ran;

  insert into public.bulletin_tasks
    (bulletin_id, department, title, task_type, linked_module, auto_complete,
     due_date, due_dates, spans_from, starts_on, target_stores)
  values (b_id, 'warehouse', '__sqltest_granica', 'info', 'transit', true,
          due_ran, array[due_ran], mon, s_ran, array[ob_gran])
  returning id into t_gran;

  /* ── 1. СТАРАТА ПАРТИДА: внесена 30 дни преди starts_on и ИЗЧИСТЕНА ──────
     Точно ситуацията на 27.09.2026 — 11 от 19 обекта са приключили старата
     партида. INSERT-ът пуска тригера, тоест синхронизацията тече веднага. */
  insert into public.goods_transit
    (store_name, direction, material_name, status, reviewed_at, reviewed_by, created_at)
  values (ob, 'incoming', '__sqltest_star_1', 'received',
          ((s_span - 25)::timestamp at time zone sofia), 'sqltest',
          ((s_span - 30)::timestamp at time zone sofia)),
         (ob, 'incoming', '__sqltest_star_2', 'received',
          ((s_span - 25)::timestamp at time zone sofia), 'sqltest',
          ((s_span - 30)::timestamp at time zone sofia));

  select count(*) into n from public.task_completions
   where task_id = t_span and store_name = ob;
  checks := checks + 1;
  if n <> 0 then fails := fails || ' [стара партида НЕ отмята задача с „в сила от" (има ' || n || ')]'; end if;

  /* КОНТРОЛА: задачата БЕЗ starts_on се отмята по старото правило. Без нея
     тестът щеше да минава и ако прозорецът изключва всичко наред. */
  select count(*) into n from public.task_completions
   where task_id = t_plain and store_name = ob and status = 'done';
  checks := checks + 1;
  if n <> 1 then fails := fails || ' [КОНТРОЛА: задача без „в сила от" се отмята по старото правило (има ' || n || ', чакано 1)]'; end if;

  /* ── 2. НОВАТА ПАРТИДА пристига: редовете са необработени ──────────────── */
  insert into public.goods_transit
    (store_name, direction, material_name, status, reviewed_at, created_at)
  values (ob, 'incoming', '__sqltest_nov_1', 'pending', null,
          (s_span::timestamp at time zone sofia)),
         (ob, 'incoming', '__sqltest_nov_2', 'pending', null,
          (s_span::timestamp at time zone sofia));

  select count(*) into n from public.task_completions
   where task_id = t_span and store_name = ob;
  checks := checks + 1;
  if n <> 0 then fails := fails || ' [нов импорт с НЕОБРАБОТЕНИ редове не отмята (има ' || n || ')]'; end if;

  /* ── 3. Обектът обработва новите редове → отмята се ЕДИН път, на СРОКА ── */
  update public.goods_transit
     set status = 'received', reviewed_at = now(), reviewed_by = 'sqltest'
   where store_name = ob and material_name like '__sqltest_nov_%';

  select count(*) into n from public.task_completions
   where task_id = t_span and store_name = ob and status = 'done';
  checks := checks + 1;
  if n <> 1 then fails := fails || ' [след обработка на новите редове → ЕДНО отмятане (има ' || n || ')]'; end if;

  select completion_date into d from public.task_completions
   where task_id = t_span and store_name = ob limit 1;
  checks := checks + 1;
  if d is distinct from due_span then fails := fails || ' [completion_date = СРОКЪТ ' || due_span || ', е ' || coalesce(d::text,'null') || ']'; end if;

  /* ── 4. РАНЕН ИМПОРТ: ден ПРЕДИ starts_on, обработен същия ден ──────────
     Заради този случай допускът е 7 дни, а не нула: при нулев прозорец
     задачата не би се отметнала никога — на starts_on няма тригер. */
  insert into public.goods_transit
    (store_name, direction, material_name, status, reviewed_at, created_at)
  values (ob_ran, 'incoming', '__sqltest_ranen_1', 'pending', null,
          ((s_ran - 1)::timestamp at time zone sofia));

  select count(*) into n from public.task_completions
   where task_id = t_ran and store_name = ob_ran;
  checks := checks + 1;
  if n <> 0 then fails := fails || ' [ранен импорт, още необработен → без отмятане (има ' || n || ')]'; end if;

  update public.goods_transit
     set status = 'received', reviewed_at = now(), reviewed_by = 'sqltest'
   where store_name = ob_ran and material_name = '__sqltest_ranen_1';

  select count(*) into n from public.task_completions
   where task_id = t_ran and store_name = ob_ran and status = 'done';
  checks := checks + 1;
  if n <> 1 then fails := fails || ' [ранен импорт, обработен → ЕДНО отмятане, макар starts_on да е в бъдещето (има ' || n || ')]'; end if;

  select completion_date into d from public.task_completions
   where task_id = t_ran and store_name = ob_ran limit 1;
  checks := checks + 1;
  if d is distinct from due_ran then fails := fails || ' [ранен импорт: completion_date = СРОКЪТ ' || due_ran || ', е ' || coalesce(d::text,'null') || ']'; end if;

  /* ── 5. ПАРТИДА ОТПРЕДИ ПРОЗОРЕЦА (8 дни преди starts_on) НЕ важи ──────── */
  insert into public.goods_transit
    (store_name, direction, material_name, status, reviewed_at, reviewed_by, created_at)
  values (ob_gran, 'incoming', '__sqltest_gran_1', 'received',
          now(), 'sqltest', ((s_ran - 8)::timestamp at time zone sofia));

  select count(*) into n from public.task_completions
   where task_id = t_gran and store_name = ob_gran;
  checks := checks + 1;
  if n <> 0 then fails := fails || ' [ред 8 дни преди „в сила от" е ИЗВЪН прозореца (има ' || n || ')]'; end if;

  /* ── 6. ДАННИТЕ: колко реда са внесени извън последния месечен импорт ────
     Допускането зад числото 7 е, че импортът е един на месец и вътре в месеца
     не се добавят редове на ръка. Стане ли това число > 0, прозорецът може да
     захване стар ред — виж коментара в схемата. Тестовите редове по-горе са в
     същата транзакция, затова се изключват по име. */
  select count(*) into n from public.goods_transit
   where material_name not like '\_\_sqltest%'
     and created_at < (select max(created_at) from public.goods_transit
                        where material_name not like '\_\_sqltest%') - interval '1 day';
  checks := checks + 1;
  if n <> 0 then fails := fails || ' [редове извън месечния импорт = 0, са ' || n || ' → допускът от 7 дни иска преглед]'; end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end
$test$;

-- ═══ МУТАНТИТЕ, ПУСНАТИ НА 27.09.2026 — ВСИЧКИТЕ УБИТИ ═════════════════════
-- Всеки се слага в mutant като create or replace на съответната функция.
--
--  S1  transit_store_done_since игнорира p_since (старото поведение)
--        → „стара партида НЕ отмята задача с „в сила от"" (има 1)
--  S2  подава bt.starts_on вместо bt.starts_on - 7 (допуск нула)
--        → „ранен импорт, обработен → ЕДНО отмятане" (има 0)
--  S3  махната е половината „има поне един ред в прозореца" (само „нищо
--      необработено") → стара партида пак отмята (има 1). Тази половина е
--      причината преди новия импорт нищо да не се отмята.
--  S4  добавено `and (bt.starts_on is null or bt.starts_on <= v_today)`
--      — точно това, което Тенчо забрани на 27.09.2026
--        → „ранен импорт, обработен" (има 0)
--  S5  completion_date = v_today вместо срока
--        → „completion_date = СРОКЪТ 2026-10-07, е 2026-09-27"
--
-- Не е писан мутант за „p_since IS NULL дава всички редове": той е покрит от
-- КОНТРОЛАТА (задача без starts_on) в проверка 2 — повреди ли се, тя пада.
