-- 20261028120335_weekly_checklist_zanulyavane_manual — огледало: weekly-checklist-zanulyavane-manual-schema.sql (версията — от базата, приложена 28.10.2026).
update public.weekly_checklist_metrics
   set source = 'manual', portal_mode = null, sublabel = null
 where key = 'zanulyavane_lm';

update public.weekly_checklist
   set portal_value = null
 where metric_key = 'zanulyavane_lm'
   and year = 2026 and week_number between 35 and 43
   and portal_value is not null;
