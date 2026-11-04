-- SQL тест: тригерът goods_transit_legacy_status_trg (transit-cleanup-schema.sql,
-- 04.11.2026) превежда записа на стар клиент — status 'sent' / 'rejected' — в
-- новия модел и не презаписва вече отбелязаното.
--
-- Пуска се през Supabase MCP apply_migration СЛЕД миграцията на схемата. Целият
-- файл е ЕДИН DO блок и НИЩО не остава в базата: блокът завършва с raise
-- exception. Гейтът е ТЕКСТЪТ „SQL-ТЕСТ ОК", не това, че има грешка.
--
-- Мутации: сложи SQL в mutant — изпълнява се в същата транзакция преди
-- проверките. Всеки мутант трябва да даде ПРОВАЛ.
--   L1 без проверката за NULL (презаписва sender_status / reviewed_at):
--      replace(replace(pg_get_functiondef('public.goods_transit_legacy_status()'::regprocedure),
--        'if NEW.sender_status is null then', 'if true then'),
--        'if NEW.reviewed_at is null then', 'if true then')                    → [5 …] [6 …]
--   L2 тригерът само за UPDATE:
--      'drop trigger goods_transit_legacy_status_trg on public.goods_transit;
--       create trigger goods_transit_legacy_status_trg before update on public.goods_transit
--       for each row when (NEW.status in (''sent'',''rejected''))
--       execute function public.goods_transit_legacy_status()'              → [1 …] [2 …]

do $test$
declare
  mutant text := null;  -- МУТАНТ ТУК
  ob     text := '__sqltest_ob_legacy';
  t0     timestamptz := '2026-11-01 09:00:00+00';
  t1     timestamptz := '2026-11-04 10:00:00+00';
  r      record;
  fails  text := '';
  checks int  := 0;
begin
  if mutant is not null then execute mutant; end if;

  /* 1. INSERT 'sent' → pending + sender_status sent (at = updated_at, by = updated_by). */
  insert into public.goods_transit (store_name, direction, material_name, status, updated_at, updated_by)
  values (ob, 'transfer', '__sql_l1', 'sent', t1, 'Стар клиент 1');
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l1';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.sender_status is distinct from 'sent'
     or r.sender_status_at is distinct from t1 or r.sender_status_by is distinct from 'Стар клиент 1' then
    fails := fails || format(' [1 INSERT sent: %s/%s/%s/%s]', r.status, r.sender_status, r.sender_status_at, r.sender_status_by);
  end if;

  /* 2. INSERT 'rejected' → pending + reviewed_at. */
  insert into public.goods_transit (store_name, direction, material_name, status, updated_at, updated_by)
  values (ob, 'incoming', '__sql_l2', 'rejected', t1, 'Стар клиент 2');
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l2';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.reviewed_at is distinct from t1 or r.reviewed_by is distinct from 'Стар клиент 2' then
    fails := fails || format(' [2 INSERT rejected: %s/%s/%s]', r.status, r.reviewed_at, r.reviewed_by);
  end if;

  /* 3. UPDATE на чакащ ред → 'sent'. */
  insert into public.goods_transit (store_name, direction, material_name, status)
  values (ob, 'transfer', '__sql_l3', 'pending');
  update public.goods_transit set status = 'sent', updated_at = t1, updated_by = 'Стар клиент 3'
   where store_name = ob and material_name = '__sql_l3';
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l3';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.sender_status is distinct from 'sent' or r.sender_status_by is distinct from 'Стар клиент 3' then
    fails := fails || format(' [3 UPDATE sent: %s/%s/%s]', r.status, r.sender_status, r.sender_status_by);
  end if;

  /* 4. UPDATE на чакащ ред → 'rejected'. */
  insert into public.goods_transit (store_name, direction, material_name, status)
  values (ob, 'incoming', '__sql_l4', 'pending');
  update public.goods_transit set status = 'rejected', reviewed_at = null, reviewed_by = null, updated_at = t1, updated_by = 'Стар клиент 4'
   where store_name = ob and material_name = '__sql_l4';
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l4';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.reviewed_at is distinct from t1 or r.reviewed_by is distinct from 'Стар клиент 4' then
    fails := fails || format(' [4 UPDATE rejected: %s/%s/%s]', r.status, r.reviewed_at, r.reviewed_by);
  end if;

  /* 5. Вече изпратен (sender_status от склада) — стар 'sent' не го презаписва. */
  insert into public.goods_transit (store_name, direction, material_name, status, sender_status, sender_status_at, sender_status_by)
  values (ob, 'incoming', '__sql_l5', 'pending', 'sent', t0, 'Склад');
  update public.goods_transit set status = 'sent', updated_at = t1, updated_by = 'Стар клиент 5'
   where store_name = ob and material_name = '__sql_l5';
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l5';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.sender_status_at is distinct from t0 or r.sender_status_by is distinct from 'Склад' then
    fails := fails || format(' [5 не презаписва sender: %s/%s/%s]', r.status, r.sender_status_at, r.sender_status_by);
  end if;

  /* 6. Вече „Недоставена" (reviewed_at) — стар 'rejected' не го презаписва. */
  insert into public.goods_transit (store_name, direction, material_name, status, reviewed_at, reviewed_by)
  values (ob, 'incoming', '__sql_l6', 'pending', t0, 'Обект');
  update public.goods_transit set status = 'rejected', updated_at = t1, updated_by = 'Стар клиент 6'
   where store_name = ob and material_name = '__sql_l6';
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l6';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.reviewed_at is distinct from t0 or r.reviewed_by is distinct from 'Обект' then
    fails := fails || format(' [6 не презаписва reviewed: %s/%s/%s]', r.status, r.reviewed_at, r.reviewed_by);
  end if;

  /* 7. 'received' и 'pending' — без промяна. */
  insert into public.goods_transit (store_name, direction, material_name, status, updated_at, updated_by)
  values (ob, 'incoming', '__sql_l7', 'received', t1, 'Нов клиент');
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l7';
  checks := checks + 1;
  if r.status is distinct from 'received' or r.sender_status is not null or r.reviewed_at is not null then
    fails := fails || format(' [7 received без промяна: %s/%s/%s]', r.status, r.sender_status, r.reviewed_at);
  end if;
  insert into public.goods_transit (store_name, direction, material_name, status)
  values (ob, 'incoming', '__sql_l8', 'pending');
  update public.goods_transit set status = 'pending', updated_at = t1, updated_by = 'Нов клиент' where store_name = ob and material_name = '__sql_l8';
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l8';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.sender_status is not null or r.reviewed_at is not null then
    fails := fails || format(' [8 pending без промяна: %s/%s/%s]', r.status, r.sender_status, r.reviewed_at);
  end if;

  /* 9. Без updated_at — часът е now(), не NULL. */
  insert into public.goods_transit (store_name, direction, material_name, status)
  values (ob, 'transfer', '__sql_l9', 'sent');
  select * into r from public.goods_transit where store_name = ob and material_name = '__sql_l9';
  checks := checks + 1;
  if r.status is distinct from 'pending' or r.sender_status_at is null then
    fails := fails || format(' [9 без updated_at: %s/%s]', r.status, r.sender_status_at);
  end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end
$test$;
