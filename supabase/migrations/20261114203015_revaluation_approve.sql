-- 20261114203015_revaluation_approve
-- Огледало: revaluation-approve-schema.sql (обяснението е там).
-- Rollback: 20261114203015_revaluation_approve_down.sql

alter table public.revaluation_submissions
  add column approved_at timestamptz,
  add column approved_by text,
  add column return_note text,
  add column returned_at timestamptz,
  add column returned_by text;

comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена, чака регионалния (submitted_at / submitted_by) | approved = одобрена от регионалния или обект без регионален (approved_at / approved_by) | processed = обработена от ЦО (processed_at / processed_by). Регионалният връща → draft + return_note; ЦО отключва → draft + reopened_at / reopened_by.';
comment on column public.revaluation_submissions.approved_at is
  'Кога регионалният е одобрил (13.11.2026); при обект без регионален = submitted_at. NULL при връщане / отключване.';
comment on column public.revaluation_submissions.approved_by is
  'Кой е одобрил; ''без регионален'' — обектът няма регионален; ''преди одобрението (13.11.2026)'' — заварените.';
comment on column public.revaluation_submissions.return_note is
  'Коментар на регионалния при последното „Върни на обекта" (задължителен).';
comment on column public.revaluation_submissions.returned_at is
  'Кога е последното връщане от регионалния.';
comment on column public.revaluation_submissions.returned_by is
  'Кой регионален е върнал бланката последно.';
