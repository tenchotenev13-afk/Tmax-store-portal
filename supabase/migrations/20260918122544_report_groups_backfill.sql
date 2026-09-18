-- Групите на личния отчет — от users.notify_groups, не от кода
--
-- До 18.09.2026 send-routed-report и report.js решаваха кой е в групите
-- co / controlling / owner по твърд списък REPORT_GROUPS в кода. Оттук
-- нататък решава users: active=true, email не null, notify_groups @> [група].
-- 'regional' остава по users.is_regional (обхват — assigned_stores спрямо
-- target_stores на задачата).
--
-- Този backfill изравнява notify_groups с последния твърд списък. Сверено
-- на 18.09.2026 преди прилагане: всичките петима вече имат групата си →
-- 0 засегнати реда. Записан е като миграция, за да остане следа кой е бил
-- в групите в момента на прехода; повторно пускане не прави нищо.
--
-- Живко: без нови колони — огледалото не се засяга.
-- Rollback: supabase/migrations/20260918122544_report_groups_backfill_down.sql (без действие — виж там).

update public.users set notify_groups = array(select distinct unnest(notify_groups || array['co']))
 where email in ('j.jeliazkov@temax.bg','v.shikova@temax.bg') and not notify_groups @> array['co'];

update public.users set notify_groups = array(select distinct unnest(notify_groups || array['controlling']))
 where email in ('m.pavlova@temax.bg','c.teneva@temax.bg') and not notify_groups @> array['controlling'];

update public.users set notify_groups = array(select distinct unnest(notify_groups || array['owner']))
 where email = 't.tenev@temax.bg' and not notify_groups @> array['owner'];
