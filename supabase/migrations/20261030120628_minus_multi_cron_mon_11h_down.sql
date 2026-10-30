-- Rollback: крон 30 обратно на 08:00 София (0 5,6 * * 1, = 8).
do $$
declare c text;
begin
  select command into c from cron.job where jobid = 30 and schedule = '0 8,9 * * 1';
  if c is null or position('Europe/Sofia'') = 11;' in c) = 0 then
    raise exception 'job 30 не е в очакваното състояние (0 8,9 * * 1, = 11)';
  end if;
  perform cron.alter_job(30, schedule := '0 5,6 * * 1',
    command := replace(c, 'Europe/Sofia'') = 11;', 'Europe/Sofia'') = 8;'));
end $$;
