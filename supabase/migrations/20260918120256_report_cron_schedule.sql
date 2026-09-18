-- Разписанието на четирите общи отчета — САМО ЗА ЧЕТЕНЕ, за колоната
-- „Разписание" в Администрация → Общи отчети. Не връща command (в него
-- стои ключ). Промяна на разписанието оттук НЯМА: сървърът не знае кой
-- вика (anon ключ, ролята се проверява само в браузъра) — виж
-- claude/open-tasks.md „Сървърна проверка на самоличност".
create or replace function public.report_cron_schedule()
returns table(kind text, dow text, minute int, hour_sofia int, active boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select substring(j.command from '"type":"([a-z]+)"'),
         split_part(j.schedule, ' ', 5),
         case when split_part(j.schedule, ' ', 1) ~ '^\d+$' then split_part(j.schedule, ' ', 1)::int end,
         substring(j.command from 'Europe/Sofia''\)\s*=\s*(\d+)')::int,
         j.active
    from cron.job j
   where j.command ilike '%/functions/v1/send-scheduled-report%'
     and substring(j.command from '"type":"([a-z]+)"') in ('daily','weekly','pallets','warehouse');
$$;

revoke all on function public.report_cron_schedule() from public;
grant execute on function public.report_cron_schedule() to anon, authenticated;
