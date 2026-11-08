-- Rollback на transit-auto-always-schema.sql — живите дефиниции от 08.11.2026
-- (pg_get_functiondef преди миграцията) — transit_sync_completions,
-- bulletin_tasks_transit_sync_trg, transit_mark_empty_stores. Отметките, записани
-- междувременно, НЕ се махат от този файл.

create or replace function public.transit_sync_completions(p_store text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_n     integer := 0;
begin
  if p_store is null then
    return 0;
  end if;

  insert into task_completions
         (task_id, bulletin_id, store_name, completed_by, completed_at,
          status, completion_date)
  select bt.id, bt.bulletin_id, p_store, 'auto:transit', now(),
         'done', coalesce(bt.due_dates[1], bt.due_date)
    from bulletin_tasks bt
   where bt.linked_module = 'transit'
     and bt.auto_complete
     and coalesce(cardinality(bt.due_dates), 0) <= 1
     and coalesce(bt.due_dates[1], bt.due_date) is not null
     and coalesce(bt.due_dates[1], bt.due_date) >= v_today - 14
     and (bt.target_stores is null
          or cardinality(bt.target_stores) = 0
          or p_store = any(bt.target_stores))
     and transit_store_done_since(p_store,
           case when bt.starts_on is null then null else bt.starts_on - 7 end)
  on conflict (task_id, store_name, completion_date)
     where task_id is not null and completion_date is not null
  do update set status       = 'done',
                completed_by = excluded.completed_by,
                completed_at = excluded.completed_at
          where task_completions.status = 'postponed';

  get diagnostics v_n = row_count;
  return v_n;
end
$$;

create or replace function public.bulletin_tasks_transit_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  if new.linked_module is distinct from 'transit' or not coalesce(new.auto_complete, false) then
    return null;
  end if;
  for s in select distinct store_name from goods_transit loop
    begin
      perform transit_sync_completions(s);
    exception when others then
      raise warning 'transit_sync_completions(%): %', s, sqlerrm;
    end;
  end loop;
  return null;
end
$$;

create or replace function public.transit_mark_empty_stores()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_today   date := (now() at time zone 'Europe/Sofia')::date;
  v_excl    text[] := report_excluded_stores();
  v_quiet   interval := interval '10 minutes';
  t         record;
  v_from    timestamptz;
  v_rows    integer;
  v_last    timestamptz;
  v_stores  text[];
  v_n       integer := 0;
  v_d       integer := 0;
  v_tmp     integer;
begin
  if v_excl is null then
    raise warning 'transit_mark_empty_stores: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  for t in
    select bt.id, bt.bulletin_id, bt.starts_on, bt.target_stores,
           coalesce(bt.due_dates[1], bt.due_date) as due
      from bulletin_tasks bt
     where bt.linked_module = 'transit'
       and bt.auto_complete
       and coalesce(cardinality(bt.due_dates), 0) <= 1
       and coalesce(bt.due_dates[1], bt.due_date) is not null
       and coalesce(bt.due_dates[1], bt.due_date) >= v_today - 14
  loop
    v_from := case when t.starts_on is null then null
                   else ((t.starts_on - 7)::timestamp at time zone 'Europe/Sofia') end;

    select count(*), max(imported_at) into v_rows, v_last
      from goods_transit
     where direction = 'incoming'
       and archived_at is null
       and (v_from is null or imported_at >= v_from);

    if v_rows = 0 then continue; end if;
    if v_last > now() - v_quiet then continue; end if;

    v_stores := case
      when t.target_stores is not null and cardinality(t.target_stores) > 0 then t.target_stores
      else array(select distinct u.store_name
                   from users u
                  where u.store_name is not null
                    and not (u.store_name = any(v_excl)))
    end;

    insert into task_completions
           (task_id, bulletin_id, store_name, completed_by, completed_at,
            status, completion_date)
    select t.id, t.bulletin_id, s, 'auto:transit-empty', now(), 'done', t.due
      from unnest(v_stores) as s
     where not exists (
             select 1 from goods_transit g
              where g.store_name = s and g.direction = 'incoming'
                and g.archived_at is null
                and (v_from is null or g.imported_at >= v_from))
    on conflict (task_id, store_name, completion_date)
       where task_id is not null and completion_date is not null
    do nothing;
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);

    if t.due >= v_today then
      delete from task_completions tc
       where tc.task_id = t.id
         and tc.completion_date = t.due
         and tc.completed_by = 'auto:transit-empty'
         and exists (
               select 1 from goods_transit g
                where g.store_name = tc.store_name and g.direction = 'incoming'
                  and g.archived_at is null
                  and (v_from is null or g.imported_at >= v_from));
      get diagnostics v_tmp = row_count;
      v_d := v_d + coalesce(v_tmp, 0);
    end if;
  end loop;

  return v_n + v_d;
end
$function$;
