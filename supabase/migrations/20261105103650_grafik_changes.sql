-- grafik-changes-schema.sql — Работен график, етап „Промени + ПРИСЪСТВЕНА ФОРМА“, П1 (план, одобрен 05.11.2026).
-- Реалните отклонения от ПОДАДЕН график (лист „Промени“ в бланката v70): един ред за човек и ден.
-- „По график“ (буква и официален код) се записва от сървъра при въвеждане; „реално“ — от списъка
-- на бланката (Настройки Q:R + работните букви). „Отразено в ТРЗ“ отмята само ТРЗ (и admin).
-- RLS без политики и без права за anon/authenticated — достъп САМО през grafik-api, както grafik_*.
-- Rollback: grafik-changes-schema-down.sql.

create table public.grafik_changes (
  id             uuid primary key default gen_random_uuid(),
  month_id       uuid not null references public.grafik_months(id),
  staff_id       uuid not null references public.grafik_staff(id),
  day            int  not null check (day between 1 and 31),
  planned_letter text,
  planned_code   text,
  actual         text not null check (actual in ('ЛД','ЗД','П','В','М','почивка','О','Б','Н','Д','А','С','Майч')),
  reason         text not null check (btrim(reason) <> ''),
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text,
  trz_done       boolean not null default false,
  trz_done_at    timestamptz,
  trz_done_by    text
);
create unique index grafik_changes_month_staff_day on public.grafik_changes (month_id, staff_id, day);

alter table public.grafik_changes enable row level security;
revoke all on public.grafik_changes from anon, authenticated;
