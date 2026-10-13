-- 20261013062446_supply_no_need — огледало: supply-no-need-schema.sql (секции 1–4).
-- Приложено 13.10.2026 с apply_migration; версията е дадена от базата.

-- ═══ 1. ТАБЛИЦАТА ════════════════════════════════════════════════════════
create table public.supply_no_need (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.supply_templates(id) on delete cascade,
  store_name text not null,
  week_start date not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint supply_no_need_uq unique (template_id, store_name, week_start)
);

comment on table public.supply_no_need is
  'Зареждане: обектът е отбелязал „нямам нужда тази седмица" по бланка. Брои се като попълнена бланка в supply_store_done().';

alter table public.supply_no_need enable row level security;
create policy supply_no_need_select on public.supply_no_need for select to anon using (true);
create policy supply_no_need_insert on public.supply_no_need for insert to anon with check (true);
create policy supply_no_need_delete on public.supply_no_need for delete to anon using (true);

-- ═══ 2. УСЛОВИЕТО — бланка с ред „без нужда" е попълнена ════════════════
create or replace function public.supply_store_done(p_store text, p_monday date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from supply_templates t
                  where coalesce(t.active, true)
                    and (t.target_stores is null
                         or cardinality(t.target_stores) = 0
                         or p_store = any(t.target_stores)))
     and not exists (
    select 1 from supply_templates t
     where coalesce(t.active, true)
       and (t.target_stores is null
            or cardinality(t.target_stores) = 0
            or p_store = any(t.target_stores))
       and not exists (
         select 1 from supply_entries e
          where e.template_id = t.id
            and e.store_name = p_store
            and e.week_start = p_monday
            and (e.qty1 is not null or e.qty2 is not null))
       and not exists (
         select 1 from supply_no_need n
          where n.template_id = t.id
            and n.store_name = p_store
            and n.week_start = p_monday));
$$;

comment on function public.supply_store_done(text, date) is
  'true ⇔ за ВСЯКА активна бланка, която важи за обекта, има поне един ред с непразна стойност (0 се брои) ИЛИ ред в supply_no_need за седмицата на p_monday. Без приложими бланки → false.';

-- ═══ 3. ТРИГЕР върху supply_no_need ═════════════════════════════════════
create or replace function public.supply_no_need_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_mon date := ((now() at time zone 'Europe/Sofia')::date)
              - ((extract(isodow from (now() at time zone 'Europe/Sofia')::date)::int) - 1);
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  if r.week_start = v_mon then
    begin perform supply_sync_completions(r.store_name);
    exception when others then
      raise warning 'supply_sync_completions(%): %', r.store_name, sqlerrm;
    end;
  end if;
  return null;
end
$function$;

drop trigger if exists supply_no_need_sync on public.supply_no_need;
create trigger supply_no_need_sync
  after insert or delete on public.supply_no_need
  for each row execute function supply_no_need_trg();

-- ═══ 4. ПРАВА ═══════════════════════════════════════════════════════════
-- create or replace запазва ACL-а на supply_store_done; новата функция
-- получава водещо =X/ (EXECUTE на PUBLIC) — маха се изрично.
revoke execute on function public.supply_store_done(text, date) from public, anon, authenticated;
revoke execute on function public.supply_no_need_trg() from public, anon, authenticated;

