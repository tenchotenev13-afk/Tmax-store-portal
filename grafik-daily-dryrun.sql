-- grafik-daily-dryrun.sql — СУХ ТЕСТ на grafik-daily-schema.sql (+ rollback), пакет 2А.
-- Един DO блок с raise exception накрая — в базата не остава нищо (и пробните записи, и схемата).

do $dry$
declare
  r text := ''; n int; n0 int; t text; mid uuid; st text; mo date; s1 uuid; s2 uuid; did uuid; did2 uuid; cid uuid; d date;
begin
  select count(*) into n0 from public.grafik_changes;
  r := r || E'\n0 преди: grafik_changes — ' || n0 || ' реда; grafik_daily — '
        || (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'grafik_daily%') || ' таблици';

  -- ── миграцията (същият текст като grafik-daily-schema.sql, без begin/commit) ──
  alter table public.grafik_changes add column source text not null default 'manual';
  alter table public.grafik_changes add constraint grafik_changes_source_check check (source in ('manual', 'daily'));
  create table public.grafik_daily (
    id uuid primary key default gen_random_uuid(), store_name text not null,
    month_id uuid not null references public.grafik_months(id), day date not null,
    marked_by text not null, marked_by_name text, marked_at timestamptz not null default now(),
    late boolean not null default false, updated_by text, updated_by_name text, updated_at timestamptz,
    corrected_by text, corrected_by_name text, corrected_at timestamptz, correct_reason text,
    unique (store_name, day));
  create index grafik_daily_month on public.grafik_daily(month_id);
  create table public.grafik_daily_marks (
    id uuid primary key default gen_random_uuid(),
    daily_id uuid not null references public.grafik_daily(id) on delete cascade,
    staff_id uuid not null references public.grafik_staff(id), planned_letter text,
    state text not null check (state in ('present', 'absent', 'unknown', 'other_shift', 'trip', 'extra', 'off')),
    actual text, trip_store text, note text check (note is null or length(note) <= 200),
    change_id uuid references public.grafik_changes(id) on delete set null,
    marked_by text, marked_at timestamptz not null default now(), unique (daily_id, staff_id),
    check ((state in ('absent', 'other_shift', 'trip', 'extra')) = (actual is not null)),
    check ((state = 'trip') = (trip_store is not null and btrim(trip_store) <> '')));
  alter table public.grafik_daily enable row level security;
  alter table public.grafik_daily_marks enable row level security;
  revoke all on public.grafik_daily, public.grafik_daily_marks from anon, authenticated;
  create function public.grafik_daily_save(p jsonb) returns uuid
  language plpgsql security invoker set search_path = public as $f$
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
  end $f$;
  revoke all on function public.grafik_daily_save(jsonb) from public, anon, authenticated;
  grant execute on function public.grafik_daily_save(jsonb) to service_role;

  -- ── проверки ──
  select count(*) into n from public.grafik_changes where source = 'manual';
  r := r || E'\n1 заварени промени → source manual: ' || n || ' от ' || n0;
  if n <> n0 then raise exception 'заварените не са manual'; end if;

  if has_table_privilege('anon', 'public.grafik_daily', 'SELECT') or has_table_privilege('authenticated', 'public.grafik_daily_marks', 'SELECT')
     or has_table_privilege('anon', 'public.grafik_daily_marks', 'INSERT') or has_table_privilege('anon', 'public.grafik_daily', 'DELETE') then
    raise exception 'anon / authenticated имат права';
  end if;
  if has_function_privilege('anon', 'public.grafik_daily_save(jsonb)', 'EXECUTE') or has_function_privilege('authenticated', 'public.grafik_daily_save(jsonb)', 'EXECUTE') then
    raise exception 'anon изпълнява функцията';
  end if;
  if not has_function_privilege('service_role', 'public.grafik_daily_save(jsonb)', 'EXECUTE')
     or not has_table_privilege('service_role', 'public.grafik_daily', 'INSERT') or not has_table_privilege('service_role', 'public.grafik_daily_marks', 'DELETE') then
    raise exception 'service_role няма права';
  end if;
  r := r || E'\n2 права: anon / authenticated — нищо (таблици и функция); service_role — да; RLS: '
        || (select string_agg(relname || '=' || relrowsecurity, ', ' order by relname) from pg_class where relname in ('grafik_daily', 'grafik_daily_marks'));

  -- проби върху реалния подаден месец (ако има)
  select m.id, m.store_name, m.month into mid, st, mo from public.grafik_months m where m.status in ('submitted', 'approved') order by m.month desc limit 1;
  if mid is null then
    r := r || E'\n3 проби — няма подаден месец, пропуснати';
  else
    d := mo + 26;   -- 27-о число
    select staff_id into s1 from public.grafik_rows where month_id = mid
      and staff_id not in (select staff_id from public.grafik_changes where month_id = mid and day = 27) order by staff_id limit 1;
    select staff_id into s2 from public.grafik_rows where month_id = mid and staff_id <> s1
      and staff_id not in (select staff_id from public.grafik_changes where month_id = mid and day = 27) order by staff_id limit 1;
    did := public.grafik_daily_save(jsonb_build_object('store_name', st, 'month_id', mid, 'day', d, 'actor', 'dry@test', 'actor_name', 'Сух тест', 'late', false,
      'changes_upsert', jsonb_build_array(jsonb_build_object('staff_id', s2, 'planned_letter', 'П', 'planned_code', 'Д1/З', 'actual', 'Б', 'reason', 'Дневна присъствена — Б')),
      'marks', jsonb_build_array(jsonb_build_object('staff_id', s1, 'planned_letter', 'П', 'state', 'present'),
                                 jsonb_build_object('staff_id', s2, 'planned_letter', 'П', 'state', 'absent', 'actual', 'Б'))));
    select count(*) into n from public.grafik_daily_marks where daily_id = did;
    select id into cid from public.grafik_changes where month_id = mid and staff_id = s2 and day = 27 and source = 'daily' and actual = 'Б';
    if n <> 2 or cid is null or (select change_id from public.grafik_daily_marks where daily_id = did and staff_id = s2) is distinct from cid
       or (select change_id from public.grafik_daily_marks where daily_id = did and staff_id = s1) is not null then
      raise exception 'първи запис: отметки % / промяна %', n, cid;
    end if;
    r := r || E'\n3 първи запис (' || st || ', ' || d || '): ден + 2 отметки + промяна Б (source daily), отметката сочи промяната';

    did2 := public.grafik_daily_save(jsonb_build_object('store_name', st, 'month_id', mid, 'day', d, 'actor', 'dry2@test', 'actor_name', 'Втори', 'late', false,
      'changes_delete', jsonb_build_array(cid),
      'marks', jsonb_build_array(jsonb_build_object('staff_id', s1, 'planned_letter', 'П', 'state', 'present'),
                                 jsonb_build_object('staff_id', s2, 'planned_letter', 'П', 'state', 'unknown'))));
    if did2 <> did then raise exception 'втори запис — нов ден вместо същия'; end if;
    select marked_by || ' / ' || updated_by into t from public.grafik_daily where id = did;
    if t <> 'dry@test / dry2@test' or exists (select 1 from public.grafik_changes where id = cid)
       or (select state from public.grafik_daily_marks where daily_id = did and staff_id = s2) <> 'unknown' then
      raise exception 'втори запис: %', t;
    end if;
    r := r || E'\n4 втори запис: същият ден; първият отбелязал остава, последният — updated_by; промяната е махната; „неуточнено“ без промяна';

    perform public.grafik_daily_save(jsonb_build_object('store_name', st, 'month_id', mid, 'day', d, 'actor', 'reg@test', 'actor_name', 'Рег', 'late', true,
      'correction', jsonb_build_object('reason', 'болничен донесен'),
      'changes_upsert', jsonb_build_array(jsonb_build_object('staff_id', s2, 'planned_letter', 'П', 'planned_code', 'Д1/З', 'actual', 'Б', 'reason', 'x')),
      'marks', jsonb_build_array(jsonb_build_object('staff_id', s2, 'planned_letter', 'П', 'state', 'absent', 'actual', 'Б'))));
    select corrected_by || ' / ' || correct_reason || ' / late=' || late into t from public.grafik_daily where id = did;
    if t <> 'reg@test / болничен донесен / late=false' then raise exception 'корекция: %', t; end if;
    select count(*) into n from public.grafik_daily_marks where daily_id = did;
    r := r || E'\n5 корекция: ' || t || ' (late е от първото отбелязване); отметките заменени — ' || n;

    begin
      perform public.grafik_daily_save(jsonb_build_object('store_name', st, 'month_id', mid, 'day', (mo + interval '1 month')::date, 'actor', 'x', 'marks', '[]'::jsonb));
      raise exception 'ден от друг месец МИНА';
    exception when sqlstate 'P0001' then
      if sqlerrm like '%МИНА%' then raise; end if;
      r := r || E'\n6 ден извън месеца / чужд месец — отказ';
    end;
    begin
      perform public.grafik_daily_save(jsonb_build_object('store_name', st || 'Х', 'month_id', mid, 'day', d, 'actor', 'x', 'marks', '[]'::jsonb));
      raise exception 'чужд обект МИНА';
    exception when sqlstate 'P0001' then
      if sqlerrm like '%МИНА%' then raise; end if;
      r := r || E'\n7 месец на друг обект — отказ';
    end;
    begin
      insert into public.grafik_daily_marks (daily_id, staff_id, state) values (did, s1, 'absent');
      raise exception 'absent без actual МИНА';
    exception when check_violation then r := r || E'\n8 отсъствие без „реално“ — отказ'; end;
    begin
      insert into public.grafik_daily_marks (daily_id, staff_id, state, actual) values (did, s1, 'trip', 'К');
      raise exception 'trip без обект МИНА';
    exception when check_violation then r := r || E'\n9 командировка без обект — отказ'; end;
    begin
      update public.grafik_changes set source = 'x' where month_id = mid and staff_id = s2 and day = 27;
      raise exception 'source x МИНА';
    exception when check_violation then r := r || E'\n10 source извън manual/daily — отказ'; end;
    delete from public.grafik_changes where month_id = mid and day = 27 and source = 'daily';
  end if;

  -- ── rollback (същият текст като grafik-daily-schema-down.sql) ──
  drop function public.grafik_daily_save(jsonb);
  drop table public.grafik_daily_marks;
  drop table public.grafik_daily;
  alter table public.grafik_changes drop constraint grafik_changes_source_check;
  alter table public.grafik_changes drop column source;
  select count(*) into n from public.grafik_changes;
  r := r || E'\n11 след rollback: grafik_changes — ' || n || ' реда; колона source — '
        || (select count(*) from information_schema.columns where table_name = 'grafik_changes' and column_name = 'source')
        || '; таблици grafik_daily* — ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'grafik_daily%')
        || '; функция — ' || (select count(*) from pg_proc where proname = 'grafik_daily_save');
  if n <> n0 then raise exception 'rollback: броят промени се смени'; end if;

  raise exception 'СУХ ТЕСТ ОК%', r;
end
$dry$;
