-- Отчет по задача в избран ден/час — получателите в notification_schedules
--
-- От 18.09.2026 във формата за задача (bulletin.js) има секция „Отчет за
-- изпълнението": дата + час + получатели. Всеки насрочен отчет е ред тук:
--   entity_type = 'task_report', entity_id = id на задачата (bulletin_tasks),
--   schedule_type = 'once', scheduled_date + scheduled_time — денят и часът
--   (същите колони, които dynamic-responder вече чете; отделен run_at не
--   трябва), target_recipients — КОЙ получава.
-- Една задача може да има няколко такива реда (напр. 12:00 и 18:00).
--
-- target_recipients (jsonb): {"groups": ["co", ...], "user_ids": ["<uuid>", ...]}
--   groups   — ключовете co / controlling / regional / owner; членовете се
--              решават В МОМЕНТА на изпращането по users.notify_groups /
--              is_regional (както личният седмичен отчет);
--   user_ids — users.id на отделни хора; имейлът се чете при изпращането,
--              тоест смяна на имейл не иска смяна на реда.
-- Съществуващите колони target_store / target_stores са за обекти (push) и не
-- стават за хора — затова нова колона, не преизползване.
--
-- Засегнати редове: 0 — нова колона без default, NULL за 6-те заварени реда
-- (напомняния за постоянни задачи и промоции), които не я четат.
-- Няма CHECK върху entity_type — 'task_report' минава без промяна.
-- RLS на notification_schedules е изключено (заварено) — не се пипа тук.
--
-- Живко: НОВА КОЛОНА notification_schedules.target_recipients, тип jsonb,
-- nullable → mirror-schema.sql и $TableColumns в sync-mirror.ps1.
-- Rollback: supabase/migrations/20260918125150_task_report_target_recipients_down.sql

alter table public.notification_schedules
  add column target_recipients jsonb;

comment on column public.notification_schedules.target_recipients is
  'Само за entity_type=task_report: {"groups":[co|controlling|regional|owner], "user_ids":[users.id]}. Членовете на групите се решават при изпращането.';
