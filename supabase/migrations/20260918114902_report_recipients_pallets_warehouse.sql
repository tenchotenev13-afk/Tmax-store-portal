-- Отделни получатели за „Палети" и „Склад" (досега Палети = weekly).
alter table public.report_recipients
  add column pallets   boolean not null default false,
  add column warehouse boolean not null default false;

-- Backfill: днешните получатели на Палети са weekly=true — запазват се.
-- warehouse остава false: Склад днес отива само до role=logistics.
update public.report_recipients set pallets = weekly;
