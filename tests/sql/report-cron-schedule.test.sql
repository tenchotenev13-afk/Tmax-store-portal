-- SQL тест на report_cron_schedule()
-- (миграция 20260918120256_report_cron_schedule — виж supabase/migrations/).
--
-- Пуска се през Supabase MCP execute_sql — целият файл е ЕДИН DO блок.
-- Нищо не остава в базата: блокът ВИНАГИ завършва с raise exception.
--   „SQL-ТЕСТ ОК (N проверки)" — минал;
--   „SQL-ТЕСТ ПРОВАЛ: …"       — паднал, с имената на проверките.
-- Гейтът е ТЕКСТЪТ „SQL-ТЕСТ ОК", не това, че има грешка.
--
-- execute_sql върви като supabase_read_only_user: тя НЕ може да изпълни
-- функцията (execute е само за anon/authenticated) и не може да създава
-- мутанти. Затова тук са правата и структурата; стойностите се проверяват
-- по истинския път — GET /rest/v1/rpc/report_cron_schedule с anon ключа:
--   curl -s ".../rest/v1/rpc/report_cron_schedule?order=kind" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
-- Очаквано на 18.09.2026:
--   daily *  0 21 · pallets 5 0 18 · warehouse 0 0 21 · weekly 0 0 21, всички active.

do $test$
declare
  fn oid; cols text; src text;
  fails text := ''; checks integer := 0;
begin
  select 'public.report_cron_schedule()'::regprocedure into fn;

  checks := checks + 1;
  if not has_function_privilege('anon', fn, 'execute') then fails := fails || ' anon-execute'; end if;
  checks := checks + 1;
  if not has_function_privilege('authenticated', fn, 'execute') then fails := fails || ' authenticated-execute'; end if;
  checks := checks + 1;
  if has_function_privilege('supabase_read_only_user', fn, 'execute') then fails := fails || ' public-execute-не-е-отнет'; end if;
  checks := checks + 1;
  if has_schema_privilege('anon', 'cron', 'usage') then fails := fails || ' anon-вижда-схемата-cron'; end if;
  checks := checks + 1;
  if not (select prosecdef from pg_proc where oid = fn) then fails := fails || ' не-е-security-definer'; end if;
  checks := checks + 1;
  if (select provolatile from pg_proc where oid = fn) <> 's' then fails := fails || ' не-е-stable(GET-няма-да-мине)'; end if;
  checks := checks + 1;
  if pg_get_userbyid((select proowner from pg_proc where oid = fn)) <> 'postgres' then fails := fails || ' собственик-не-е-postgres'; end if;
  checks := checks + 1;
  if not exists (select 1 from pg_proc where oid = fn and 'search_path=pg_catalog, public' = any(proconfig)) then
    fails := fails || ' search_path-не-е-фиксиран';
  end if;

  select string_agg(a, ',') into cols from (select unnest(proargnames) a from pg_proc where oid = fn) x;
  checks := checks + 1;
  if cols is distinct from 'kind,dow,minute,hour_sofia,active' then fails := fails || ' колони:' || coalesce(cols, 'null'); end if;
  checks := checks + 1;
  if cols like '%command%' then fails := fails || ' връща-command'; end if;

  -- Няма начин функцията да ПРОМЕНЯ нещо: тялото е само select.
  select prosrc into src from pg_proc where oid = fn;
  checks := checks + 1;
  if src ~* '\m(alter_job|schedule|unschedule|update|insert|delete)\s*\(' or src ~* '\m(update|insert|delete)\M\s' then
    fails := fails || ' тялото-пише';
  end if;

  if fails = '' then
    raise exception 'SQL-ТЕСТ ОК (% проверки)', checks;
  else
    raise exception 'SQL-ТЕСТ ПРОВАЛ:%', fails;
  end if;
end $test$;
