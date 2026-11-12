-- report-cron-schedule-co-overdue-schema.sql
-- report_cron_schedule() — и co_overdue (крон 26, „Просрочени клиентски заявки — ЦО").
-- Сесия otcheti-tablica, 12.11.2026 (Теодор 11.11, етап 2б — таблицата
-- „📋 Кой какво получава" в Администрация → Известия чете часовете оттук).
-- НЕ Е ПРИЛОЖЕНО — чака „давай" (apply_migration).
--
-- ЕДНО нещо: 'co_overdue' влиза в списъка с типове. Тялото иначе е
-- непроменено (20261028104053_minusi_multi_report). create or replace пази
-- ACL-а (EXECUTE за anon остава — admin.js я чете, виж
-- definer-functions-anon-schema.sql).
--
-- Само функция → ред за Живко няма (огледалото не носи функции).
--
-- ROLLBACK (тялото отпреди — без co_overdue):
--   create or replace function public.report_cron_schedule()
--    returns table(kind text, dow text, minute integer, hour_sofia integer, active boolean)
--    language sql stable security definer set search_path to 'pg_catalog', 'public'
--   as $function$
--     select substring(j.command from '"type":"([a-z_]+)"'),
--            split_part(j.schedule, ' ', 5),
--            case when split_part(j.schedule, ' ', 1) ~ '^\d+$' then split_part(j.schedule, ' ', 1)::int end,
--            substring(j.command from 'Europe/Sofia''\)\s*=\s*(\d+)')::int,
--            j.active
--       from cron.job j
--      where j.command ilike '%/functions/v1/send-scheduled-report%'
--        and substring(j.command from '"type":"([a-z_]+)"') in ('daily','weekly','pallets','warehouse','minus_multi');
--   $function$;

create or replace function public.report_cron_schedule()
 returns table(kind text, dow text, minute integer, hour_sofia integer, active boolean)
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select substring(j.command from '"type":"([a-z_]+)"'),
         split_part(j.schedule, ' ', 5),
         case when split_part(j.schedule, ' ', 1) ~ '^\d+$' then split_part(j.schedule, ' ', 1)::int end,
         substring(j.command from 'Europe/Sofia''\)\s*=\s*(\d+)')::int,
         j.active
    from cron.job j
   where j.command ilike '%/functions/v1/send-scheduled-report%'
     and substring(j.command from '"type":"([a-z_]+)"') in ('daily','weekly','pallets','warehouse','co_overdue','minus_multi');
$function$;
