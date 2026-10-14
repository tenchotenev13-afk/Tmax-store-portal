-- transfers-plate-schema.sql
-- Междускладови трансфери — вид „Камион" (групажен): transfers.plate_no.
-- ЧАКА ПРИЛАГАНЕ (apply_migration след „давай" от Тенчо). След прилагане тук
-- се вписва номерът на миграцията, който базата даде.
-- Предишни: transfers-schema.sql · transfers-events-schema.sql ·
-- transfer-cargo-loaded-at-schema.sql · transfer-cargo-prev-schema.sql.
--
-- Камионът е бус по маршрут и права (спирки, дотоварване, „От чакащите",
-- отметки, статус) — отличава се с регистрационния номер. transfers.mode
-- няма CHECK (проверено 14.10.2026: само 'bus' в 8 реда), тоест новата
-- стойност 'truck' минава без схемна промяна.
-- plate_no се попълва само при mode = 'truck'; за бус и куриер е NULL.

alter table public.transfers add column if not exists plate_no text null;

comment on column public.transfers.plate_no is
  'Регистрационен номер на камиона (mode = ''truck''). NULL за бус и куриер.';

-- rollback:
-- alter table public.transfers drop column if exists plate_no;
