-- Rollback на 20261026120000_weekly_checklist_portal_mode
-- Трие колоната заедно с данните. В етап 1 никой не я чете; от етап 2
-- (табът чете от checklist_portal_values) rollback-ът изисква и функцията
-- да се върне назад първо — тя чете колоната.

alter table public.weekly_checklist_metrics drop column if exists portal_mode;
