-- Rollback на 20261028104053_minusi_multi_report.
-- Първо кой губи писмото:  select email from public.report_recipients where minus_multi;
-- Редът на m.pavlova@temax.bg е създаден САМО за това писмо (всички други флагове
-- false) — след drop на колоната би останал активен ред без нито един отчет.
-- Кронът minus-multi-mon-8h (ако е създаден) се маха отделно:
--   select cron.unschedule('minus-multi-mon-8h');

delete from public.report_recipients
 where lower(email) = 'm.pavlova@temax.bg'
   and not (daily or weekly or pallets or warehouse or co_overdue);

alter table public.report_recipients drop column if exists minus_multi;

delete from public.app_settings where key in ('minus_multi_count', 'minus_multi_days');

comment on column public.minus_movements.action is
  'Действие срещу повторен минус (до app_settings.minus_repeat_days дни след предишния 955 за същия обект и материал). Попълва обектът; задължително при повторение.';

update public.notification_topics set description =
  'Всеки делник 10:00: push до обекта, ако има НЕЗАКРИТИ минуси, които са непопълнени — без причина, повторение до minus_repeat_days дни без действие, или причина с requires_note без бележка. Закритите не се броят. Само обектите от app_settings.minus_stores; веднъж на ден на обект. Без имейл.'
 where key = 'minus_unfilled';

-- report_cron_schedule() — версията от 20260918120256 (само четирите отчета).
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
