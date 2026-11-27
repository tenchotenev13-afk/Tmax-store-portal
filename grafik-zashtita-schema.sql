-- grafik-zashtita-schema.sql — Работен график, защита (решение на Тенчо 27.11.2026), стъпка 1 от 2.
-- Само схемата — нищо от данните не се сменя; старият grafik-api (който чете list = beta / trz) работи
-- както досега. Прилага се ПРЕДИ деплоя на grafik-api, който чете can_reset_pin / grafik_pin / grafik_audit.
-- Стъпка 2 (grafik-access-roles-schema.sql) — beta → edit, Теодор → view — СЛЕД деплоя.
-- Rollback: grafik-zashtita-schema-down.sql.
--
-- А. Роли: grafik_access.list приема view / trz / edit (и beta до стъпка 2); can_reset_pin —
--    може да нулира ПИН-а на друг (Теодор, въпреки че е view).
-- Б. grafik_pin — личен ПИН за таба (bcrypt хеш), брояч на поредни грешни опити, заключване:
--    5 → 15 мин (locked_until), 10 → до нулиране (blocked). grafik_pin_reserve — атомарно
--    ИЗРАЗХОДВА опит преди сравнението (паралелни заявки не пробват повече от позволеното).
-- В. grafik_audit — одит и на четенето (кой, роля, обект, месец, кога; без съдържанието).
--    Отделно от audit_log, защото audit_log е четим / изтриваем с публичния ключ
--    (claude/open/27-11-audit-log-anon.md). dedup_key — едно и също четене веднъж на 10 мин.
--    Пази се 2 години (крон grafik-audit-retention, всеки ден; часът не е важен).
-- И двете таблици: RLS без политики, без права за anon / authenticated (както всички grafik_*);
-- не са в огледалото (mirror_reader — само таблиците от tools/mirror-key/mirror-tables.txt).

-- А
alter table public.grafik_access drop constraint grafik_access_list_check;
alter table public.grafik_access add constraint grafik_access_list_check check (list in ('beta', 'view', 'trz', 'edit'));
alter table public.grafik_access add column can_reset_pin boolean not null default false;

-- Б
create table public.grafik_pin (
  user_id uuid primary key references public.users(id) on delete cascade,
  pin_hash text not null,
  fails int not null default 0 check (fails >= 0),
  locked_until timestamptz,
  blocked boolean not null default false,
  set_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_try_at timestamptz
);
alter table public.grafik_pin enable row level security;
revoke all on public.grafik_pin from anon, authenticated;

create function public.grafik_pin_reserve(p_user uuid)
returns table (granted boolean, pin_hash text, fails int, locked_until timestamptz, blocked boolean)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
    update public.grafik_pin p
       set fails = p.fails + 1,
           blocked = (p.fails + 1 >= 10),
           locked_until = case when p.fails + 1 = 5 then now() + interval '15 minutes' else p.locked_until end,
           last_try_at = now()
     where p.user_id = p_user
       and not p.blocked
       and (p.locked_until is null or p.locked_until <= now())
    returning true, p.pin_hash, p.fails, p.locked_until, p.blocked;
  if not found then
    return query
      select false, null::text, p.fails, p.locked_until, p.blocked from public.grafik_pin p where p.user_id = p_user;
  end if;
end;
$$;
revoke all on function public.grafik_pin_reserve(uuid) from public, anon, authenticated;
grant execute on function public.grafik_pin_reserve(uuid) to service_role;

-- В
create table public.grafik_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  event text not null,
  user_email text,
  user_role text,
  grafik_kind text,
  store_name text,
  month text,
  success boolean not null default true,
  details jsonb,
  dedup_key text unique
);
create index grafik_audit_at on public.grafik_audit (at desc);
alter table public.grafik_audit enable row level security;
revoke all on public.grafik_audit from anon, authenticated;

select cron.schedule('grafik-audit-retention', '17 3 * * *',
  $$delete from public.grafik_audit where at < now() - interval '2 years'$$);
