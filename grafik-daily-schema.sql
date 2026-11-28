-- grafik-daily-schema.sql — Работен график, пакет 2А: дневна присъствена „✅ Днес“
-- (план и решения на Тенчо 27.11.2026: обектът — днес и 2 дни назад, „късно“ за минали дни;
-- регионален / admin — целият месец, извън прозореца с основание; „неуточнено“ отсъствие — да).
-- Rollback: grafik-daily-schema-down.sql. Сух тест: grafik-daily-dryrun.sql.
--
-- grafik_daily        — денят на обекта е отбелязан: кой и кога първо, кой последно, корекция.
-- grafik_daily_marks  — какво е отбелязано за всеки човек (доказателството). Ефектът — отклонението
--                       от графика — е ред в grafik_changes с source = 'daily' (същата таблица като
--                       „✎ Промени“, без двойно въвеждане); „неуточнено“ (state 'unknown') няма ред
--                       там, защото „реално“ не може да е „?“ — стои само тук, докато обектът го уточни.
-- grafik_changes.source — 'manual' („✎ Промени“) / 'daily' („✅ Днес“).
-- grafik_daily_save(jsonb) — записът на деня (ден + промени + отметки) в ЕДНА транзакция; PostgREST
--                       няма транзакция между отделни заявки. Проверките (права, прозорец, буквите
--                       за договора, отразените в ТРЗ) са в grafik-api — функцията само пише.
--
-- ПРАВА — както всички grafik_*: RLS без политики, без права за anon / authenticated; достъп само
-- през grafik-api (service_role). Функцията — SECURITY INVOKER, EXECUTE само за service_role.
-- Огледалото не ги тегли (grafik_* не са в mirror-tables.txt) — редът за Живко е само за записа.
--
-- ЗАВАРЕНИ ДАННИ (правило 9, 27.11.2026): grafik_daily* — нови; grafik_changes — 1 ред → 'manual'.

begin;

alter table public.grafik_changes add column source text not null default 'manual';
alter table public.grafik_changes add constraint grafik_changes_source_check check (source in ('manual', 'daily'));

create table public.grafik_daily (
  id               uuid primary key default gen_random_uuid(),
  store_name       text not null,
  month_id         uuid not null references public.grafik_months(id),
  day              date not null,
  marked_by        text not null,
  marked_by_name   text,
  marked_at        timestamptz not null default now(),
  late             boolean not null default false,
  updated_by       text,
  updated_by_name  text,
  updated_at       timestamptz,
  corrected_by     text,
  corrected_by_name text,
  corrected_at     timestamptz,
  correct_reason   text,
  unique (store_name, day)
);
create index grafik_daily_month on public.grafik_daily(month_id);

create table public.grafik_daily_marks (
  id           uuid primary key default gen_random_uuid(),
  daily_id     uuid not null references public.grafik_daily(id) on delete cascade,
  staff_id     uuid not null references public.grafik_staff(id),
  planned_letter text,
  state        text not null check (state in ('present', 'absent', 'unknown', 'other_shift', 'trip', 'extra', 'off')),
  actual       text,
  trip_store   text,
  note         text check (note is null or length(note) <= 200),
  change_id    uuid references public.grafik_changes(id) on delete set null,
  marked_by    text,
  marked_at    timestamptz not null default now(),
  unique (daily_id, staff_id),
  check ((state in ('absent', 'other_shift', 'trip', 'extra')) = (actual is not null)),
  check ((state = 'trip') = (trip_store is not null and btrim(trip_store) <> ''))
);

alter table public.grafik_daily       enable row level security;
alter table public.grafik_daily_marks enable row level security;
revoke all on public.grafik_daily, public.grafik_daily_marks from anon, authenticated;

-- p = { store_name, month_id, day (ГГГГ-ММ-ДД), actor, actor_name, late,
--       correction: null | { reason },
--       changes_delete: [uuid], changes_upsert: [{ staff_id, planned_letter, planned_code, actual, reason, trip_store }],
--       marks: [{ staff_id, planned_letter, state, actual, trip_store, note }] }
-- Отметките на деня се заменят изцяло (списъкът е целият ден). Връща id на деня.
create function public.grafik_daily_save(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; v_now timestamptz := now();
  v_month uuid := (p->>'month_id')::uuid;
  v_day date := (p->>'day')::date;
  v_dn int := extract(day from (p->>'day')::date)::int;
  v_corr boolean := jsonb_typeof(p->'correction') = 'object';
begin
  perform 1 from grafik_months where id = v_month and store_name = p->>'store_name'
    and status in ('submitted', 'approved') and month = date_trunc('month', v_day)::date for update;
  if not found then raise exception 'grafik_daily_save: месецът не е подаден' using errcode = 'P0001'; end if;

  insert into grafik_daily (store_name, month_id, day, marked_by, marked_by_name, late, marked_at,
                            corrected_by, corrected_by_name, corrected_at, correct_reason)
  values (p->>'store_name', v_month, v_day, p->>'actor', p->>'actor_name', coalesce((p->>'late')::boolean, false), v_now,
          case when v_corr then p->>'actor' end, case when v_corr then p->>'actor_name' end,
          case when v_corr then v_now end, case when v_corr then p->'correction'->>'reason' end)
  on conflict (store_name, day) do update set
    updated_by = excluded.marked_by, updated_by_name = excluded.marked_by_name, updated_at = v_now,
    corrected_by = coalesce(excluded.corrected_by, grafik_daily.corrected_by),
    corrected_by_name = coalesce(excluded.corrected_by_name, grafik_daily.corrected_by_name),
    corrected_at = coalesce(excluded.corrected_at, grafik_daily.corrected_at),
    correct_reason = coalesce(excluded.correct_reason, grafik_daily.correct_reason)
  returning id into v_id;

  delete from grafik_changes where month_id = v_month and day = v_dn
    and id in (select x::uuid from jsonb_array_elements_text(coalesce(p->'changes_delete', '[]'::jsonb)) x);

  insert into grafik_changes (month_id, staff_id, day, planned_letter, planned_code, actual, reason, trip_store, source,
                              created_by, updated_by, created_at, updated_at)
  select v_month, c.staff_id, v_dn, c.planned_letter, c.planned_code, c.actual, c.reason, c.trip_store, 'daily',
         p->>'actor', p->>'actor', v_now, v_now
  from jsonb_to_recordset(coalesce(p->'changes_upsert', '[]'::jsonb))
       as c(staff_id uuid, planned_letter text, planned_code text, actual text, reason text, trip_store text)
  on conflict (month_id, staff_id, day) do update set
    planned_letter = excluded.planned_letter, planned_code = excluded.planned_code, actual = excluded.actual,
    reason = excluded.reason, trip_store = excluded.trip_store, source = 'daily',
    updated_by = excluded.updated_by, updated_at = v_now;

  delete from grafik_daily_marks where daily_id = v_id;
  insert into grafik_daily_marks (daily_id, staff_id, planned_letter, state, actual, trip_store, note, change_id, marked_by, marked_at)
  select v_id, m.staff_id, m.planned_letter, m.state, m.actual, m.trip_store, m.note,
         (select gc.id from grafik_changes gc where gc.month_id = v_month and gc.staff_id = m.staff_id and gc.day = v_dn),
         p->>'actor', v_now
  from jsonb_to_recordset(coalesce(p->'marks', '[]'::jsonb))
       as m(staff_id uuid, planned_letter text, state text, actual text, trip_store text, note text);

  return v_id;
end $$;
revoke all on function public.grafik_daily_save(jsonb) from public, anon, authenticated;
grant execute on function public.grafik_daily_save(jsonb) to service_role;

commit;
