-- Rollback на 20261018151927_transfers_departed
--
-- ГУБИ ДАННИ: часът и човекът на „🚚 Тръгна" изчезват; транспортите със
-- status 'sent' остават 'sent' (статусът не се пипа — при нужда:
--   update transfers set status = 'planned' where status = 'sent';).
-- Преди rollback:
--   select count(*) from transfers where departed_at is not null;
-- transfers.js, report.js и send-scheduled-report четат departed_at — върни
-- и кода (и деплоя на функцията), иначе заявките им падат.

alter table public.transfers drop column if exists departed_at, drop column if exists departed_by;
