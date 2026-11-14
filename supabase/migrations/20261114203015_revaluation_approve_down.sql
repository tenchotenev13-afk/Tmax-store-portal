-- Rollback на 20261114203015_revaluation_approve
--
-- ГУБИ ДАННИ: кой/кога е одобрил и коментарите при връщане. Одобрените
-- бланки се връщат в 'submitted' (за старата версия на revaluation.js това е
-- „подадена, за ЦО"). Първо се връща revaluation.js отпреди одобрението,
-- после базата.
-- Преди rollback:
--   select status, count(*) from revaluation_submissions group by status;
--   select count(*) from revaluation_submissions where return_note is not null;

update public.revaluation_submissions set status = 'submitted' where status = 'approved';
alter table public.revaluation_submissions
  drop column if exists approved_at,
  drop column if exists approved_by,
  drop column if exists return_note,
  drop column if exists returned_at,
  drop column if exists returned_by;
comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена (submitted_at / submitted_by) | processed = обработена от ЦО (processed_at / processed_by). ЦО отключва → обратно draft + reopened_at / reopened_by.';
