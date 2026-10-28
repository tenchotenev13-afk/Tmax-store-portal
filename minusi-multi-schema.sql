-- minusi-multi-schema.sql — Минуси: многократен минус и седмичното писмо
-- „Минуси — повтарящи се артикули" (28.10.2026, сесия minusi-repeat-report).
-- ПРИЛОЖЕНО В SUPABASE НА 28.10.2026 като миграция 20261028104053_minusi_multi_report
-- и прочетено обратно (колоната boolean NOT NULL default false; ключовете '3' / '30';
-- minus_multi=true само за Теодор, Тен и Миглена; ACL на report_cron_schedule без PUBLIC).
-- Този файл е ОГЛЕДАЛО на миграцията, не източник.
-- Rollback: supabase/migrations/20261028104053_minusi_multi_report_down.sql.
--
-- ЗАЩО. Теодор, 27.10 (WhatsApp с Миглена): седмичен отчет, когато обект има
-- ~3 повторения на артикул, с становището на обекта. Решения на Тенчо 27.10:
-- 3 минуса (955) за последните 30 дни; ОТДЕЛНО писмо до Теодор, Миглена и
-- Тенчо.
--
-- 1. report_recipients.minus_multi — кой получава писмото (send-scheduled-
--    report, type 'minus_multi'), като co_overdue.
-- 2. app_settings minus_multi_count ('3') и minus_multi_days ('30') — прагът и
--    прозорецът (липсва / невалидно → 3 и 30 в кода).
-- 3. Данни: Миглена Павлова няма ред → нов, само с minus_multi (daily/weekly
--    имат default true — затова изрично false); Теодор и Тен — само флагът.
-- 4. report_cron_schedule() — и minus_multi (колоната „Разписание" в
--    Администрация → Общи отчети). Регексът за type минава на [a-z_]+, иначе
--    'minus_multi' се реже до 'minus'.
--
-- Становището на обекта е СЪЩАТА колона minus_movements.action — без нова
-- колона.
--
-- ПОРЕДНОСТ: миграция → push на кода (admin.js / report.js четат колоната).
--
-- Огледало (Живко): колоната и двата ключа — zhivko-opashka.md, „Чака изпращане".
--
-- ROLLBACK:
--   delete from public.report_recipients
--    where lower(email) = 'm.pavlova@temax.bg'
--      and not (daily or weekly or pallets or warehouse or co_overdue);
--   alter table public.report_recipients drop column if exists minus_multi;
--   delete from public.app_settings where key in ('minus_multi_count', 'minus_multi_days');
--   + report_cron_schedule() от 20260918120256_report_cron_schedule.sql,
--   + старите comment на minus_movements.action и description на темата
--   minus_unfilled (виж *_down.sql).
--
-- 5. Описанието на темата minus_unfilled (Администрация → Известия → Теми) и
--    коментарът на minus_movements.action — и многократният минус.
-- Кронът minus-multi-mon-8h НЕ е тук — отделна стъпка след деплоя на
-- send-scheduled-report (виж report-cron-minus-multi-schema.sql).

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
