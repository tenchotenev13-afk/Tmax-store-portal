-- Rollback на 20261014113103_transfers_plate_no
--
-- ГУБИ ДАННИ: регистрационните номера на камионите изчезват. Преди rollback:
--   select count(*) from transfers where plate_no is not null;
-- transfers.js записва plate_no при камион — върни и кода, иначе POST пада.

alter table public.transfers drop column if exists plate_no;
