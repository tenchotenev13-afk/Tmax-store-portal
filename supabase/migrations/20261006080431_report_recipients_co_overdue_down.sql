-- Rollback на report_recipients_co_overdue.
-- Първо кой губи отчета:  select count(*) from public.report_recipients where co_overdue;
-- Редът на v.shikova@temax.bg е създаден САМО за този отчет (всички други флагове false) —
-- след drop на колоната остава активен ред без нито един отчет. Ако не е нужен:
--   delete from public.report_recipients
--    where lower(email) = 'v.shikova@temax.bg' and not (daily or weekly or pallets or warehouse);
alter table public.report_recipients drop column if exists co_overdue;
