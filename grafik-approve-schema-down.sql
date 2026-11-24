-- grafik-approve-schema-down.sql — rollback на grafik-approve-schema.sql.
-- Одобрените месеци стават отново „подадени“ (кой и кога е одобрил — само в одита);
-- коментарите при връщане се губят. Преди rollback: grafik-api трябва да е върнат на версия,
-- която не пише / чете тези колони (иначе repo.ts пада с 42703).

begin;
update public.grafik_months set status = 'submitted' where status = 'approved';
alter table public.grafik_months drop constraint grafik_months_status_check;
alter table public.grafik_months add constraint grafik_months_status_check
  check (status in ('draft', 'submitted'));
alter table public.grafik_months
  drop column approved_at,
  drop column approved_by,
  drop column approved_by_name,
  drop column return_comment,
  drop column returned_at,
  drop column returned_by_name;
commit;
