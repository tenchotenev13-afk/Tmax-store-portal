-- supply-no-need-schema.sql
-- Огледало на supabase/migrations/20261013062446_supply_no_need.sql.
-- ПРИЛОЖЕНО 13.10.2026 (apply_migration, версия в базата 20261013062446).
--
-- ЗАЩО. От 12.10.2026 „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." се отмята автоматично
-- (supply_sync_completions, supply-auto-complete-schema.sql) само ако ВСЯКА
-- активна бланка за обекта има поне един ред с qty. Обект без нужда — Силистра,
-- 12.10: „Подови настилки" попълнена, „Кабели на макара" празна — остава без
-- отметка и излиза като пропуснал. Тук обектът казва изрично „нямам нужда тази
-- седмица" по бланка и това се брои за попълнена бланка.
--
-- Един ред на (template_id, store_name, week_start). „Отмени" = DELETE на реда;
-- запис с поне една стойност в supply.js (submitSupplyForm) също трие реда —
-- бланката вече е „заявена", не „без нужда". Без UPDATE: редът няма какво да
-- се редактира.
--
-- ПРАВА. RLS включено; политики за anon: select / insert / delete, БЕЗ update.
-- КОМПРОМИС: delete за anon значи, че всеки с публичния ключ може да изтрие
-- чужда отметка „без нужда". Приемливо, защото съдържанието е нечувствително
-- (флаг без текст), а последицата е само, че задачата се разотмята и обектът
-- пак излиза като „неподал" — видимо, не тихо. Без delete „↩ Отмени" не може
-- да работи от клиента. Същият модел като supply_entries (anon ключът е общ).
-- Табличните GRANT-ове идват от default privileges на public.
--
-- ЗАВАРЕНИТЕ ДАННИ (правило 9): таблицата е нова — 0 засегнати реда.
-- supply_store_done() само РАЗШИРЯВА условието (ИЛИ) — не може да направи
-- false обект, който досега е бил true.
--
-- ТРИГЕР: след insert/delete на ред за ТЕКУЩАТА седмица (понеделникът по
-- Europe/Sofia, същото правило като supply_sync_entries_trg) се вика
-- supply_sync_completions(обекта). Грешка -> raise warning, записът минава;
-- мрежата е часовият крон 'supply-auto-complete'.
--
-- ПОРЕДНОСТ: миграцията ПРЕДИ push на supply.js — loadSupply() чете таблицата
-- при всяко отваряне на модула.
--
-- Огледало (Живко): ред в zhivko-opashka.md, „Чака изпращане".
-- Rollback: supabase/migrations/20261013062446_supply_no_need_down.sql
-- (дословно копие е и най-долу в този файл, закоментирано).

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

-- ═══ ROLLBACK (= supabase/migrations/20261013062446_supply_no_need_down.sql) ═
-- drop trigger if exists supply_no_need_sync on public.supply_no_need;
-- drop function if exists public.supply_no_need_trg();
-- drop table if exists public.supply_no_need;
-- -- старата supply_store_done дословно от supply-auto-complete-schema.sql:
-- create or replace function public.supply_store_done(p_store text, p_monday date)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path to 'public'
-- as $$
--   select exists (select 1 from supply_templates t
--                   where coalesce(t.active, true)
--                     and (t.target_stores is null
--                          or cardinality(t.target_stores) = 0
--                          or p_store = any(t.target_stores)))
--      and not exists (
--     select 1 from supply_templates t
--      where coalesce(t.active, true)
--        and (t.target_stores is null
--             or cardinality(t.target_stores) = 0
--             or p_store = any(t.target_stores))
--        and not exists (
--          select 1 from supply_entries e
--           where e.template_id = t.id
--             and e.store_name = p_store
--             and e.week_start = p_monday
--             and (e.qty1 is not null or e.qty2 is not null)));
-- $$;
-- comment on function public.supply_store_done(text, date) is
--   'true ⇔ обектът има поне един ред с непразна стойност (0 се брои) във ВСЯКА активна бланка, която важи за него, за седмицата на p_monday. Без приложими бланки → false.';
-- revoke execute on function public.supply_store_done(text, date) from public, anon, authenticated;
-- -- След rollback пусни веднъж: select public.supply_sync_completions();
-- -- (иначе отметките, поставени заради „без нужда", остават до часовия крон).
