-- 20261015140000_revaluation_co
-- Огледало: revaluation-co-schema.sql (обяснението е там).
-- Rollback: 20261015140000_revaluation_co_down.sql

alter table public.revaluation_items add column co_qty numeric(12,3);
alter table public.revaluation_submissions add column processed_at timestamptz;
alter table public.revaluation_submissions add column processed_by text;

comment on column public.revaluation_items.co_qty is
  'Прехвърлено количество (ЦО, етап 3а); NULL = не е решено — износът ползва qty.';
comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена (submitted_at / submitted_by) | processed = обработена от ЦО (processed_at / processed_by). ЦО отключва → обратно draft + reopened_at / reopened_by.';
comment on column public.revaluation_submissions.processed_at is
  'Кога ЦО е натиснал „Готово за обект" (етап 3а); NULL при отключване.';
