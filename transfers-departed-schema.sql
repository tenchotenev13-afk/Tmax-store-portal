-- transfers-departed-schema.sql
-- Междускладови трансфери — отметка „🚚 Тръгна" за бус и камион:
-- transfers.departed_at, transfers.departed_by; нов статус 'sent' („Изпратен").
-- ЧАКА ПРИЛАГАНЕ (apply_migration след „давай" от Тенчо). След прилагане тук
-- се вписва номерът на миграцията, който базата даде.
-- Предишни: transfers-schema.sql · transfers-events-schema.sql ·
-- transfer-cargo-loaded-at-schema.sql · transfer-cargo-prev-schema.sql ·
-- transfers-plate-schema.sql · transfer-events-unit-schema.sql.
--
-- Създателят (или админ) натиска „🚚 Тръгна" — веднъж, без връщане; часът е
-- по избор между created_at и сега. Без отметки по товарите транспортът е
-- „Изпратен" (transfers.status = 'sent'), иначе както досега.
-- „В път" / „застоял" се мерят от departed_at, ако го има, иначе от
-- depart_date (старите записи нямат departed_at и не се местят).
-- transfers.status няма CHECK (проверено 18.10.2026: planned 4, partial 3,
-- done 10) — 'sent' минава без промяна. Транспорти без нито една отметка:
-- 4 (3 буса, 1 камион) — стават „Изпратен" едва при натискане.

alter table public.transfers
  add column if not exists departed_at timestamptz null,
  add column if not exists departed_by text null;

comment on column public.transfers.departed_at is
  'Кога е тръгнал бусът / камионът („🚚 Тръгна"). NULL = не е отбелязано (куриер или стар запис).';
comment on column public.transfers.departed_by is
  'Кой е отбелязал „🚚 Тръгна" (display_name).';

-- rollback:
-- alter table public.transfers drop column if exists departed_at, drop column if exists departed_by;
