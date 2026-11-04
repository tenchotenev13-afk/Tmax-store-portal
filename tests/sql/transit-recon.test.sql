-- SQL тест: „🔍 Чака засечка" (recon_at) се брои като ОБРАБОТЕН ред в двете
-- функции, които броят „обработено" (transit-status-split-schema.sql, етап 3,
-- 04.11.2026): transit_store_done_since и checklist_portal_values.
--
-- Пуска се през Supabase MCP apply_migration. Целият файл е ЕДИН DO блок и
-- НИЩО не остава в базата: блокът завършва с raise exception, което връща
-- назад тестовите редове и записа на миграцията. Гейтът е ТЕКСТЪТ
-- „SQL-ТЕСТ ОК", не това, че има грешка.
--
-- Мутации: сложи повреден create or replace function в mutant — изпълнява се
-- в същата транзакция преди проверките. Всеки мутант трябва да даде ПРОВАЛ.
--   R1 transit_store_done_since без „and recon_at is null" (засечката не е
--      обработена) → [1 …]
--   R2 checklist_portal_values без „or g.recon_at is not null" → [3 …]
-- Мутантът се прави от ЖИВОТО тяло, без препис:
--   mutant text := replace(pg_get_functiondef('public.transit_store_done_since(text,date)'::regprocedure), 'and recon_at is null', '');
--   mutant text := replace(pg_get_functiondef('public.checklist_portal_values(int,int)'::regprocedure), 'or g.recon_at is not null', '');
-- плюс проверка, че replace е сменил нещо (иначе мутантът е празен и „оцелява").
-- Пуснат на 04.11.2026 след миграция 20261104114441: чист → „SQL-ТЕСТ ОК
-- (4 проверки)"; R1 → ПРОВАЛ [1 …]; R2 → ПРОВАЛ [3 … е 0/1].

do $test$
declare
  mutant text := null;  -- МУТАНТ ТУК
  ob     text := '__sqltest_ob_recon';
  y      int  := extract(isoyear from (now() at time zone 'Europe/Sofia'))::int;
  w      int  := extract(week    from (now() at time zone 'Europe/Sofia'))::int;
  v      text;
  fails  text := '';
  checks int  := 0;
begin
  if mutant is not null then execute mutant; end if;

  insert into public.users (email, store_name) values ('__sqltest_recon@x', ob);

  /* Един входящ ред: pending, БЕЗ reviewed_at, С recon_at — „Чака засечка". */
  insert into public.goods_transit (store_name, direction, material_name, status, recon_at, recon_by, recon_side)
  values (ob, 'incoming', '__sqltest_recon_1', 'pending', now(), 'sqltest', 'receiver');

  /* 1. Авто-отметката: всички редове на обекта са обработени (засечката е обработка). */
  checks := checks + 1;
  if not public.transit_store_done_since(ob, null) then
    fails := fails || ' [1 ред с recon_at е обработен в transit_store_done_since]';
  end if;

  /* 2. КОНТРОЛА: без засечка същият ред е НЕобработен. */
  update public.goods_transit set recon_at = null, recon_by = null, recon_side = null
   where store_name = ob and material_name = '__sqltest_recon_1';
  checks := checks + 1;
  if public.transit_store_done_since(ob, null) then
    fails := fails || ' [2 КОНТРОЛА: без засечка редът е необработен]';
  end if;

  /* 3. Чек листът: колоната „Стока на път" (module:transit) за обекта е 1/1. */
  update public.goods_transit set recon_at = now(), recon_by = 'sqltest', recon_side = 'sender'
   where store_name = ob and material_name = '__sqltest_recon_1';
  select c.value into v from public.checklist_portal_values(y, w) c
    join public.weekly_checklist_metrics m on m.key = c.metric_key
   where c.store_name = ob and m.source = 'module:transit';
  checks := checks + 1;
  if v is distinct from '1/1' then
    fails := fails || ' [3 Чек листът брои засечката като обработена: чакано 1/1, е ' || coalesce(v, 'null') || ']';
  end if;

  /* 4. КОНТРОЛА: без засечка — 0/1. */
  update public.goods_transit set recon_at = null where store_name = ob and material_name = '__sqltest_recon_1';
  select c.value into v from public.checklist_portal_values(y, w) c
    join public.weekly_checklist_metrics m on m.key = c.metric_key
   where c.store_name = ob and m.source = 'module:transit';
  checks := checks + 1;
  if v is distinct from '0/1' then
    fails := fails || ' [4 КОНТРОЛА: без засечка 0/1, е ' || coalesce(v, 'null') || ']';
  end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end
$test$;
