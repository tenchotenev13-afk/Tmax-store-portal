-- SQL тест на strip_leading_dash() и тригерите kasa_reports_strip_dash /
-- stock_returns_strip_dash (dash-db-guard-schema.sql, 27.10.2026).
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
-- Мутации: сложи SQL в променливата mutant — изпълнява се в същата
-- транзакция преди проверките и също се връща назад. Всеки мутант трябва да
-- даде ПРОВАЛ. Списъкът и резултатите — най-долу.
--
-- Записът минава през ИСТИНСКИТЕ тригери (insert и update по двете таблици),
-- не само през пряко извикване на функцията — това е пътят от портала.

do $test$
declare
  mutant text := null;  -- МУТАНТ ТУК
  k_id   uuid;
  s_id   uuid;
  r      record;
  fails  text := '';
  checks integer := 0;
begin
  if mutant is not null then execute mutant; end if;

  -- ═══ 1. Функцията пряко ═══════════════════════════════════════════════
  checks := checks + 1;
  if public.strip_leading_dash('—Ренета Добрева') is distinct from 'Ренета Добрева' then
    fails := fails || ' [„—Ренета Добрева" → „Ренета Добрева", е «' || coalesce(public.strip_leading_dash('—Ренета Добрева'),'null') || '»]'; end if;
  checks := checks + 1;
  if public.strip_leading_dash('—') is not null then
    fails := fails || ' [„—" → NULL, е «' || public.strip_leading_dash('—') || '»]'; end if;
  checks := checks + 1;
  if public.strip_leading_dash(' — Име') is distinct from 'Име' then
    fails := fails || ' [„ — Име" → „Име", е «' || coalesce(public.strip_leading_dash(' — Име'),'null') || '»]'; end if;
  checks := checks + 1;
  if public.strip_leading_dash('Излишък от разлика — ДЕНИКОМ ЕООД') is distinct from 'Излишък от разлика — ДЕНИКОМ ЕООД' then
    fails := fails || ' [тире в средата НЕ се пипа, е «' || coalesce(public.strip_leading_dash('Излишък от разлика — ДЕНИКОМ ЕООД'),'null') || '»]'; end if;
  checks := checks + 1;
  if public.strip_leading_dash(null) is not null then
    fails := fails || ' [NULL → NULL]'; end if;
  checks := checks + 1;
  if public.strip_leading_dash('') is not null or public.strip_leading_dash(' — ') is not null then
    fails := fails || ' [празно / „ — " → NULL]'; end if;

  -- ═══ 2. kasa_reports: insert и update през тригера ════════════════════
  insert into public.kasa_reports (cashier_name) values ('—Ренета Добрева') returning id into k_id;
  checks := checks + 1;
  if (select cashier_name from public.kasa_reports where id = k_id) is distinct from 'Ренета Добрева' then
    fails := fails || ' [kasa insert: „—Ренета Добрева" не е изчистено, е «' || coalesce((select cashier_name from public.kasa_reports where id = k_id),'null') || '»]'; end if;

  update public.kasa_reports set cashier_name = '—' where id = k_id;
  checks := checks + 1;
  if (select cashier_name from public.kasa_reports where id = k_id) is not null then
    fails := fails || ' [kasa update: „—" → NULL]'; end if;

  update public.kasa_reports set cashier_name = ' — Иван Петров' where id = k_id;
  checks := checks + 1;
  if (select cashier_name from public.kasa_reports where id = k_id) is distinct from 'Иван Петров' then
    fails := fails || ' [kasa update: „ — Иван Петров" → „Иван Петров", е «' || coalesce((select cashier_name from public.kasa_reports where id = k_id),'null') || '»]'; end if;

  -- ═══ 3. stock_returns: всичките шест колони, insert и update ═════════
  insert into public.stock_returns
    (store_name, source, status, store_comment, reason, courier_info,
     control_comment, controller_comment, product_name)
  values ('__sqltest_dash', 'diff', 'pending', '—взета лично', '—', ' — изхвърлени',
          'Излишък от разлика — ДЕНИКОМ ЕООД', null, '—Артикул')
  returning id into s_id;
  select * into r from public.stock_returns where id = s_id;
  checks := checks + 1;
  if r.store_comment is distinct from 'взета лично' then fails := fails || ' [sr insert store_comment]'; end if;
  checks := checks + 1;
  if r.reason is not null then fails := fails || ' [sr insert reason „—" → NULL]'; end if;
  checks := checks + 1;
  if r.courier_info is distinct from 'изхвърлени' then fails := fails || ' [sr insert courier_info]'; end if;
  checks := checks + 1;
  if r.control_comment is distinct from 'Излишък от разлика — ДЕНИКОМ ЕООД' then fails := fails || ' [sr insert control_comment: тире в средата]'; end if;
  checks := checks + 1;
  if r.controller_comment is not null then fails := fails || ' [sr insert controller_comment NULL → NULL]'; end if;
  checks := checks + 1;
  if r.product_name is distinct from 'Артикул' then fails := fails || ' [sr insert product_name]'; end if;

  update public.stock_returns
     set controller_comment = '—проверено', reason = '—Брак', store_comment = '—'
   where id = s_id;
  select * into r from public.stock_returns where id = s_id;
  checks := checks + 1;
  if r.controller_comment is distinct from 'проверено' then fails := fails || ' [sr update controller_comment]'; end if;
  checks := checks + 1;
  if r.reason is distinct from 'Брак' then fails := fails || ' [sr update reason]'; end if;
  checks := checks + 1;
  if r.store_comment is not null then fails := fails || ' [sr update store_comment „—" → NULL]'; end if;

  -- ═══ 4. Почистването от т.3 („x = x") чисти заварено „—" ═════════════
  -- Тригерът се изключва за момент, за да се създаде заварен ред.
  alter table public.stock_returns disable trigger stock_returns_strip_dash;
  update public.stock_returns set courier_info = '—куриер' where id = s_id;
  alter table public.stock_returns enable trigger stock_returns_strip_dash;
  update public.stock_returns set courier_info = courier_info where id = s_id;
  checks := checks + 1;
  if (select courier_info from public.stock_returns where id = s_id) is distinct from 'куриер' then
    fails := fails || ' [„x = x" не чисти заварено „—куриер"]'; end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end
$test$;

-- ═══ МУТАНТИТЕ (пускат се със стойност в mutant) ═════════════════════════
--  M1  без тригерите:
--      drop trigger kasa_reports_strip_dash on public.kasa_reports;
--      drop trigger stock_returns_strip_dash on public.stock_returns;
--  M2  regex без ^ (маха първото „—", където и да е — и в средата):
--      create or replace function public.strip_leading_dash(x text) returns text
--      language sql immutable set search_path = '' as $m$
--        select nullif(btrim(regexp_replace(x, '(\s*—)+', ''), E' \t\r\n'), '') $m$;
--  M3  без btrim:
--      create or replace function public.strip_leading_dash(x text) returns text
--      language sql immutable set search_path = '' as $m$
--        select nullif(regexp_replace(x, '^(\s*—)+', ''), '') $m$;
--
-- ПУСНАТИ НА 27.10.2026 срещу живата база (след миграция 20261027202716):
--  чист код → „SQL-ТЕСТ ОК (19 проверки)"
--  M1 → ПРОВАЛ, 10 проверки (kasa insert/update ×3, sr insert ×4, sr update ×3).
--       Пуснат БЕЗ секция 4 — тя изключва тригера по име и при свален
--       тригер гърми с „trigger does not exist", а не с ПРОВАЛ.
--  M2 → ПРОВАЛ: „тире в средата" (функция и sr insert control_comment),
--       е «Излишък от разлика ДЕНИКОМ ЕООД».
--  M3 → ПРОВАЛ: „ — Име" е « Име»; „ — " не става NULL; kasa „ — Иван Петров";
--       sr insert courier_info е « изхвърлени».
