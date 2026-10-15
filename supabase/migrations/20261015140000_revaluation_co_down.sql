-- Rollback на 20261015140000_revaluation_co
--
-- ГУБИ ДАННИ: прехвърлените количества (co_qty) и кога/кой е обработил.
-- Обработените бланки се връщат в 'submitted' — иначе статус 'processed'
-- остава без колоните, които го обясняват. Първо се връща revaluation.js
-- отпреди етап 3а, после базата.
-- Преди rollback:
--   select status, count(*) from revaluation_submissions group by status;
--   select count(*) from revaluation_items where co_qty is not null;

update public.revaluation_submissions set status = 'submitted' where status = 'processed';
alter table public.revaluation_submissions drop column if exists processed_by;
alter table public.revaluation_submissions drop column if exists processed_at;
alter table public.revaluation_items drop column if exists co_qty;
comment on column public.revaluation_submissions.status is
  'draft = чернова | submitted = подадена (submitted_at / submitted_by). ЦО отключва → обратно draft + reopened_at / reopened_by.';
