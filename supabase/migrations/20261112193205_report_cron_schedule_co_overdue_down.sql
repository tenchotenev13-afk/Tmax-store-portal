-- Rollback на 20261112193205_report_cron_schedule_co_overdue — тялото отпреди (без co_overdue).
create or replace function public.report_cron_schedule()
 returns table(kind text, dow text, minute integer, hour_sofia integer, active boolean)
 language sql stable security definer set search_path to 'pg_catalog', 'public'
as $function$
  select substring(j.command from '"type":"([a-z_]+)"'),
         split_part(j.schedule, ' ', 5),
         case when split_part(j.schedule, ' ', 1) ~ '^\d+$' then split_part(j.schedule, ' ', 1)::int end,
         substring(j.command from 'Europe/Sofia''\)\s*=\s*(\d+)')::int,
         j.active
    from cron.job j
   where j.command ilike '%/functions/v1/send-scheduled-report%'
     and substring(j.command from '"type":"([a-z_]+)"') in ('daily','weekly','pallets','warehouse','minus_multi');
$function$;
