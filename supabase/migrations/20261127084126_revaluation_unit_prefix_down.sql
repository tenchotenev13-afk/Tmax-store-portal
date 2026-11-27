-- Rollback на 20261127084126_revaluation_unit_prefix.
-- ПРЕДИ него: 20261127084628_revaluation_unit_prefix_data_down.sql (номерата
-- обратно във вида '<обект>-П0001'), иначе късите номера остават.
create or replace function public.assign_revaluation_unit_no()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  st  text;
  sub uuid;
  n   integer;
begin
  select i.store_name, i.submission_id into st, sub
    from public.revaluation_items i where i.id = new.item_id;
  if sub is null then
    raise exception 'revaluation_units: няма ред % в revaluation_items', new.item_id;
  end if;
  st := coalesce(nullif(btrim(st), ''), 'Без обект');

  -- ON CONFLICT DO UPDATE заключва реда на обекта: два едновременни записа
  -- от един обект получават различни номера.
  insert into public.revaluation_unit_counters (store_name, last_num)
  values (st, 1)
  on conflict (store_name)
  do update set last_num = public.revaluation_unit_counters.last_num + 1
  returning last_num into n;

  new.store_name    := st;
  new.submission_id := sub;
  new.unit_no       := st || '-П' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
  return new;
end
$function$;
revoke all on function public.assign_revaluation_unit_no() from public, anon, authenticated;

revoke select (unit_prefix) on public.stores from mirror_reader;
alter table public.stores drop column if exists unit_prefix;
