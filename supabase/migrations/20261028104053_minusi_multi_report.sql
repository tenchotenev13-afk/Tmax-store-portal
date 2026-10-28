-- 20261028104053_minusi_multi_report — огледало: minusi-multi-schema.sql (версията — от базата, приложена 28.10.2026).
alter table public.report_recipients add column if not exists minus_multi boolean not null default false;

insert into public.app_settings (key, value, updated_at, updated_by) values
  ('minus_multi_count', '3', now(), 'minusi-multi'),
  ('minus_multi_days', '30', now(), 'minusi-multi')
  on conflict (key) do nothing;

update public.report_recipients set minus_multi = true
 where lower(email) in ('t.tenev@temax.bg', 'ten.tenev@temax.bg');

insert into public.report_recipients (name, email, daily, weekly, pallets, warehouse, co_overdue, minus_multi, active)
select 'Миглена Павлова', 'm.pavlova@temax.bg', false, false, false, false, false, true, true
 where not exists (select 1 from public.report_recipients where lower(email) = 'm.pavlova@temax.bg');

comment on column public.minus_movements.action is
  'Действие срещу повторен минус (до app_settings.minus_repeat_days дни след предишния 955) ИЛИ становище при многократен минус (minus_multi_count+ реда 955 за minus_multi_days дни, същия обект и материал). Попълва обектът; задължително и в двата случая.';

update public.notification_topics set description =
  'Всеки делник 10:00: push до обекта, ако има НЕЗАКРИТИ минуси, които са непопълнени — без причина, повторение до minus_repeat_days дни без действие, многократен минус (minus_multi_count+ за minus_multi_days дни) без становище, или причина с requires_note без бележка. Закритите не се броят. Само обектите от app_settings.minus_stores; веднъж на ден на обект. Без имейл.'
 where key = 'minus_unfilled';

create or replace function public.report_cron_schedule()
returns table(kind text, dow text, minute int, hour_sofia int, active boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select substring(j.command from '"type":"([a-z_]+)"'),
         split_part(j.schedule, ' ', 5),
         case when split_part(j.schedule, ' ', 1) ~ '^\d+$' then split_part(j.schedule, ' ', 1)::int end,
         substring(j.command from 'Europe/Sofia''\)\s*=\s*(\d+)')::int,
         j.active
    from cron.job j
   where j.command ilike '%/functions/v1/send-scheduled-report%'
     and substring(j.command from '"type":"([a-z_]+)"') in ('daily','weekly','pallets','warehouse','minus_multi');
$$;

revoke all on function public.report_cron_schedule() from public;
grant execute on function public.report_cron_schedule() to anon, authenticated;
