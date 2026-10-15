-- revision-schedule-schema.sql
-- Огледало на supabase/migrations/20261015090000_revision_schedule.sql.
--
-- ЗАЩО (решение на Тенчо, 14.10.2026). Контролингът поддържа годишен график
-- на ревизиите по седмици — днес Excel („график до края на 2026.xlsx“,
-- колони Срок / групи / Име на групата). Нов под-таб „📅 График ревизии“ в
-- таба „Ревизии и преоценка“: всички виждат цялата година, Контролинг
-- (admin/accounting) добавя, редактира и трие седмици, обектите само четат.
--
-- Един ред = една седмица на ревизии:
-- - starts_on / ends_on — прозорецът („08.09-09.09.“ → 2026-09-08 / 2026-09-09);
-- - kind — 'groups' (ревизия на изброените групи) | 'none' (старт брошура —
--   няма ревизии) | 'movements' („движения“). Без CHECK — огледалото на Живко
--   прави UPSERT и CHECK по стойност го чупи; стойностите са в коментара;
-- - note — свободен текст („старт брошура 04.09-няма ревизии“, „07.09 почивен
--   ден заради 06.09“);
-- - groups — jsonb масив [{"code":"30121010","name":"Навеси"}, …]; code е
--   низ (кодът на материалната група от SAP), name — както е във файла.
-- Уникалност по starts_on: две седмици не могат да започват в един ден
-- (повторно зареждане на графика или двоен клик не дублира седмица).
--
-- ПРАВА. RLS включено; политики за anon select / insert / update / DELETE —
-- Контролингът трие седмица от браузъра. КОМПРОМИС (както при
-- revaluation_items): anon ключът е общ за всички, тоест „пише само
-- Контролинг“ е проверка в клиента (revisions.js), не в базата.
-- Табличните GRANT-ове идват от default privileges на public.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблицата е нова — 0 реда, 0 засегнати.
-- Името revision_schedule не съществуваше в базата и в кода (проверено 14.10.2026).
--
-- ПОРЕДНОСТ: миграция → данни (tools/revision-schedule-2026.js) → push на
-- кода. revisions.js чете таблицата при отваряне на модула; ако кодът е на
-- живо преди миграцията, под-табът показва грешка при зареждане.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане“.
-- Rollback: supabase/migrations/20261015090000_revision_schedule_down.sql
--   drop table public.revision_schedule;

create table public.revision_schedule (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'groups',
  note text,
  groups jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz,
  constraint revision_schedule_uq unique (starts_on)
);

comment on table public.revision_schedule is
  'График на ревизиите: една седмица на ред. Поддържа го Контролинг (admin/accounting), обектите четат.';
comment on column public.revision_schedule.kind is
  'groups = ревизия на групите в groups | none = старт брошура, няма ревизии | movements = движения';
comment on column public.revision_schedule.groups is
  'jsonb масив [{"code":"30121010","name":"Навеси"}, …]; празен при none / movements.';
comment on column public.revision_schedule.note is
  'Свободна бележка: „старт брошура 04.09-няма ревизии“, „07.09 почивен ден заради 06.09“.';

alter table public.revision_schedule enable row level security;
create policy revision_schedule_select on public.revision_schedule for select to anon using (true);
create policy revision_schedule_insert on public.revision_schedule for insert to anon with check (true);
create policy revision_schedule_update on public.revision_schedule for update to anon using (true) with check (true);
create policy revision_schedule_delete on public.revision_schedule for delete to anon using (true);
