-- grafik-approve-schema.sql — Работен график, етап Б: одобрение от ТРЗ (24.11.2026).
-- Огледало: supabase/migrations/20261124103940_grafik_approve.sql (+ _down.sql), приложена 24.11.2026.
-- Rollback: grafik-approve-schema-down.sql.
--
-- ЗАЩО (предложенията на Теодор, имейл 23.11; план А + Б + В, одобрен от Тенчо 23.11.2026):
-- „Подай“ = обектът е готов и заключен; ТРЗ (Ваня) — „✔ Одобри“ или „↩ Върни с коментар“,
-- за един обект и масово. Статуси: чернова → подаден → одобрен; върнат = чернова с коментар
-- (механизмът „reopened“ в снимката — ТРЗ продължават да виждат последното подаване).
-- Решение 3: одобрява ТРЗ и admin (резерв); одобрен връщат ТРЗ и admin; регионалният —
-- само подаден, както досега. Решение 4: коментарът — само на екрана.
--
-- КОЛОНИ: approved_* — кой и кога е одобрил (нулират се при връщане);
-- return_comment / returned_* — ПОСЛЕДНОТО връщане (остават след новото подаване като история;
-- екранът показва лентата само докато месецът е чернова). Цялата история — в одита (audit_log, събитията grafik_approve / grafik_return).
--
-- ПРАВА: без промяна — grafik_months е с RLS без политики и без права за anon/authenticated.
--
-- ЗАВАРЕНИ ДАННИ (правило 9, 24.11.2026): grafik_months — 3 реда (submitted 1, draft 2,
-- върнати 0). Нищо не става невалидно: новата стойност само разширява CHECK-а.

begin;

do $$
declare n int;
begin
  select count(*) into n from public.grafik_months where status not in ('draft', 'submitted');
  if n <> 0 then raise exception 'очаквани само draft / submitted, намерени други: %', n; end if;
end $$;

alter table public.grafik_months drop constraint grafik_months_status_check;
alter table public.grafik_months add constraint grafik_months_status_check
  check (status in ('draft', 'submitted', 'approved'));

alter table public.grafik_months
  add column approved_at      timestamptz,
  add column approved_by      text,
  add column approved_by_name text,
  add column return_comment   text,
  add column returned_at      timestamptz,
  add column returned_by_name text;

comment on column public.grafik_months.return_comment is
  'Последното „↩ Върни с коментар“ (ТРЗ / admin / регионален) — виждат го обектът и офисът над графика, докато е чернова (24.11.2026).';

commit;
