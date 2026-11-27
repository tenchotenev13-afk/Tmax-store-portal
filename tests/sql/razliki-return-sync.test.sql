-- SQL тест: тригерът razliki_return_sync (razliki-return-sync-schema.sql,
-- 26.11.2026) — „✅ Взета" в „За връщане → По разлики" отбелязва свързания
-- ред тип „Връщане" в Разлики; „Невзета" там го връща, само ако е отбелязан
-- от синхрона.
--
-- Пуска се през Supabase MCP apply_migration. Целият файл е ЕДИН DO блок и
-- НИЩО не остава в базата: блокът завършва с raise exception, което връща
-- назад тестовите редове и записа на миграцията. Гейтът е ТЕКСТЪТ
-- „SQL-ТЕСТ ОК", не това, че има грешка.
-- ПРЕДИ миграцията: подай razliki-return-sync-schema.sql + този файл в ЕДНА
-- заявка — изключението в края връща назад и тригера.
-- Срещу живата база — само след изрично разрешение от Тенчо (правило 08.11).
--
-- Мутации (mutant := replace(pg_get_functiondef(…), …)) — всеки трябва да
-- даде ПРОВАЛ:
--   M1 без „and d.type = 'return'"            → [5 …]
--   M2 без „and d.completed_by like 'За връщане%'" → [3 …]
--   M3 „new.status in ('taken', 'completed')" → „new.status in ('taken')" → [4 …]
--   M4 „completed_by = 'За връщане'" → „completed_by = 'x'" → [1 …] и [2 …]

do $test$
declare
  mutant text := null;  -- МУТАНТ ТУК
  ob     text := '__sqltest_ob_retsync';
  d1 uuid; d2 uuid; d3 uuid; d4 uuid; d5 uuid; d6 uuid; d7 uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid; r7 uuid;
  rec    record;
  fails  text := '';
  checks int  := 0;
begin
  if to_regprocedure('public.razliki_return_sync_trg()') is null then
    raise exception 'SQL-ТЕСТ: няма razliki_return_sync_trg — подай схемата в същата заявка';
  end if;
  if mutant is not null then
    if mutant = pg_get_functiondef('public.razliki_return_sync_trg()'::regprocedure) then
      raise exception 'SQL-ТЕСТ: мутантът не промени нищо';
    end if;
    execute mutant;
  end if;

  -- Редове в Разлики без report_id: stock_diff_sync_lines_trg не намира обект
  -- и не вика нищо.
  insert into stock_differences (store_name, material_name, type, status)
    values (ob, 't1', 'return', 'pending') returning id into d1;
  insert into stock_differences (store_name, material_name, type, status)
    values (ob, 't2', 'return', 'pending') returning id into d2;
  insert into stock_differences (store_name, material_name, type, status, completed_by, completed_at)
    values (ob, 't3', 'return', 'taken', 'Ръчно Мениджър', now()) returning id into d3;
  insert into stock_differences (store_name, material_name, type, status)
    values (ob, 't4', 'return', 'pending') returning id into d4;
  insert into stock_differences (store_name, material_name, type, status)
    values (ob, 't5', 'missing', 'pending') returning id into d5;
  insert into stock_differences (store_name, material_name, type, status, completed_by)
    values (ob, 't6', 'return', 'received', 'Склад') returning id into d6;
  insert into stock_differences (store_name, material_name, type, status)
    values (ob, 't7', 'return', 'pending') returning id into d7;

  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'pending', d1) returning id into r1;
  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'pending', d2) returning id into r2;
  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'taken',   d3) returning id into r3;
  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'pending', d4) returning id into r4;
  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'pending', d5) returning id into r5;
  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'pending', d6) returning id into r6;
  insert into stock_returns (store_name, source, status, diff_line_id) values (ob, 'diff', 'taken',   d7) returning id into r7;

  /* 1. pending → taken: свързаният 'return'/'pending' става 'taken' от синхрона. */
  update stock_returns set status = 'taken' where id = r1;
  select status, completed_by, completed_at into rec from stock_differences where id = d1;
  checks := checks + 1;
  if rec.status is distinct from 'taken' or rec.completed_by is distinct from 'За връщане' or rec.completed_at is null then
    fails := fails || format(' [1 taken: %s / %s / %s]', rec.status, rec.completed_by, rec.completed_at);
  end if;

  /* 2. taken → pending: отбелязаният от синхрона се връща, кой/кога = null. */
  update stock_returns set status = 'pending' where id = r1;
  select status, completed_by, completed_at into rec from stock_differences where id = d1;
  checks := checks + 1;
  if rec.status is distinct from 'pending' or rec.completed_by is not null or rec.completed_at is not null then
    fails := fails || format(' [2 обратно: %s / %s / %s]', rec.status, rec.completed_by, rec.completed_at);
  end if;

  /* 3. Ред, отбелязан РЪЧНО в Разлики, не се връща. */
  update stock_returns set status = 'pending' where id = r3;
  select status, completed_by into rec from stock_differences where id = d3;
  checks := checks + 1;
  if rec.status is distinct from 'taken' or rec.completed_by is distinct from 'Ръчно Мениджър' then
    fails := fails || format(' [3 ръчният е пипнат: %s / %s]', rec.status, rec.completed_by);
  end if;

  /* 4. pending → completed („Приключена" направо): също 'taken' в Разлики. */
  update stock_returns set status = 'completed' where id = r4;
  select status, completed_by into rec from stock_differences where id = d4;
  checks := checks + 1;
  if rec.status is distinct from 'taken' or rec.completed_by is distinct from 'За връщане' then
    fails := fails || format(' [4 completed: %s / %s]', rec.status, rec.completed_by);
  end if;

  /* 5. Друг тип в Разлики (missing) — нищо. */
  update stock_returns set status = 'taken' where id = r5;
  select status into rec from stock_differences where id = d5;
  checks := checks + 1;
  if rec.status is distinct from 'pending' then
    fails := fails || format(' [5 missing е пипнат: %s]', rec.status);
  end if;

  /* 6. 'received' в Разлики — нищо. */
  update stock_returns set status = 'taken' where id = r6;
  select status, completed_by into rec from stock_differences where id = d6;
  checks := checks + 1;
  if rec.status is distinct from 'received' or rec.completed_by is distinct from 'Склад' then
    fails := fails || format(' [6 received е пипнат: %s / %s]', rec.status, rec.completed_by);
  end if;

  /* 7. Без смяна на статуса (друга колона, или taken → completed) — нищо. */
  update stock_returns set courier_info = 'Спиди 123' where id = r7;
  update stock_returns set status = 'completed' where id = r7;
  select status into rec from stock_differences where id = d7;
  checks := checks + 1;
  if rec.status is distinct from 'pending' then
    fails := fails || format(' [7 без преход от друго е пипнат: %s]', rec.status);
  end if;

  /* 8. Липсващ ред в Разлики — без грешка. */
  update stock_returns set diff_line_id = gen_random_uuid() where id = r2;
  update stock_returns set status = 'taken' where id = r2;
  select status into rec from stock_differences where id = d2;
  checks := checks + 1;
  if rec.status is distinct from 'pending' then
    fails := fails || format(' [8 несвързаният d2 е пипнат: %s]', rec.status);
  end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end
$test$;
