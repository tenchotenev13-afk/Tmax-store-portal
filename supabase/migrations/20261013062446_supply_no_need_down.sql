-- Rollback на 20261013062446_supply_no_need
--
-- ГУБИ ДАННИ: всички отметки „нямам нужда тази седмица" изчезват. Преди rollback:
--   select count(*) from supply_no_need;
-- supply.js ще получава грешка при четене на таблицата — върни и кода.

drop trigger if exists supply_no_need_sync on public.supply_no_need;
drop function if exists public.supply_no_need_trg();
drop table if exists public.supply_no_need;
-- старата supply_store_done дословно от supply-auto-complete-schema.sql:
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
            and (e.qty1 is not null or e.qty2 is not null)));
$$;
comment on function public.supply_store_done(text, date) is
  'true ⇔ обектът има поне един ред с непразна стойност (0 се брои) във ВСЯКА активна бланка, която важи за него, за седмицата на p_monday. Без приложими бланки → false.';
revoke execute on function public.supply_store_done(text, date) from public, anon, authenticated;
-- След rollback пусни веднъж: select public.supply_sync_completions();
-- (иначе отметките, поставени заради „без нужда", остават до часовия крон).
