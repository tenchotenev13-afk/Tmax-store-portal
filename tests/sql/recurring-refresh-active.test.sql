-- SQL тест на recurring_tasks_refresh_active()
-- (recurring-active-cron-schema.sql, миграция 20260918093536).
--
-- Пуска се през Supabase MCP execute_sql — целият файл е ЕДИН DO блок.
-- Нищо не остава в базата: блокът ВИНАГИ завършва с raise exception, което
-- връща назад и тестовите редове, и промените на функцията върху живите
-- задачи. Резултатът е в текста на грешката:
--   „SQL-ТЕСТ ОК (N проверки)"      — минал;
--   „SQL-ТЕСТ ПРОВАЛ: …"            — паднал, с имената на проверките.
-- Гейтът е ТЕКСТЪТ „SQL-ТЕСТ ОК", не това, че има грешка.
--
-- Мутации: сложи тялото на повреден create or replace function в
-- променливата mutant — то се изпълнява в същата транзакция преди
-- проверките и също се връща назад. Всеки мутант трябва да даде ПРОВАЛ.

do $test$
declare
  mutant text := null;  -- МУТАНТ ТУК
  w date := date_trunc('week', now() at time zone 'Europe/Sofia')::date;
  id_next uuid; id_this uuid; id_closed uuid; id_noper uuid;
  n integer; fails text := ''; checks integer := 0;
  a boolean;
begin
  if mutant is not null then execute mutant; end if;

  insert into public.recurring_tasks (department, title, task_type, active)
    values ('admin', '__sqltest_next', 'info', true) returning id into id_next;
  insert into public.recurring_tasks (department, title, task_type, active)
    values ('admin', '__sqltest_this', 'info', false) returning id into id_this;
  insert into public.recurring_tasks (department, title, task_type, active)
    values ('admin', '__sqltest_closed', 'info', true) returning id into id_closed;
  insert into public.recurring_tasks (department, title, task_type, active)
    values ('admin', '__sqltest_noper', 'info', true) returning id into id_noper;

  -- от СЛЕДВАЩИЯ понеделник → false
  insert into public.recurring_task_periods (recurring_task_id, from_monday, to_monday, created_by)
    values (id_next, w + 7, null, 'sqltest');
  -- от ТОЗИ понеделник → true
  insert into public.recurring_task_periods (recurring_task_id, from_monday, to_monday, created_by)
    values (id_this, w, null, 'sqltest');
  -- затворен МИНАЛАТА седмица (последна валидна = w−7) → false
  insert into public.recurring_task_periods (recurring_task_id, from_monday, to_monday, created_by)
    values (id_closed, w - 35, w - 7, 'sqltest');
  -- id_noper: без нито един период → не се пипа (остава true)

  n := public.recurring_tasks_refresh_active();

  select active into a from public.recurring_tasks where id = id_next;
  checks := checks + 1; if a is distinct from false then fails := fails || ' [от следващия понеделник → false, е ' || coalesce(a::text,'null') || ']'; end if;
  select active into a from public.recurring_tasks where id = id_this;
  checks := checks + 1; if a is distinct from true then fails := fails || ' [от този понеделник → true, е ' || coalesce(a::text,'null') || ']'; end if;
  select active into a from public.recurring_tasks where id = id_closed;
  checks := checks + 1; if a is distinct from false then fails := fails || ' [затворен миналата седмица → false, е ' || coalesce(a::text,'null') || ']'; end if;
  select active into a from public.recurring_tasks where id = id_noper;
  checks := checks + 1; if a is distinct from true then fails := fails || ' [без период → непокътната (true), е ' || coalesce(a::text,'null') || ']'; end if;
  -- върнатият брой: точно трите тестови смени (живите задачи днес са в синхрон)
  checks := checks + 1; if n is distinct from 3 then fails := fails || ' [върнат брой = 3, е ' || coalesce(n::text,'null') || ']'; end if;
  -- второ пускане — идемпотентно, нула промени
  n := public.recurring_tasks_refresh_active();
  checks := checks + 1; if n is distinct from 0 then fails := fails || ' [второ пускане → 0, е ' || coalesce(n::text,'null') || ']'; end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end
$test$;
