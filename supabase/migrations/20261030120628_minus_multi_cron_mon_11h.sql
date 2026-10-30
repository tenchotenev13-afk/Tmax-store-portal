-- Крон 30 (minus-multi-mon-8h) → понеделник 11:00 София. Виж minusi-weekly-count-cron-schema.sql.
do $$
declare c text;
begin
  select command into c from cron.job where jobid = 30 and jobname = 'minus-multi-mon-8h' and schedule = '0 5,6 * * 1';
  if c is null or position('Europe/Sofia'') = 8;' in c) = 0 or position('"type":"minus_multi"' in c) = 0 then
    raise exception 'job 30 не е в очакваното състояние (0 5,6 * * 1, = 8, minus_multi)';
  end if;
  perform cron.alter_job(30, schedule := '0 8,9 * * 1',
    command := replace(c, 'Europe/Sofia'') = 8;', 'Europe/Sofia'') = 11;'));
end $$;
