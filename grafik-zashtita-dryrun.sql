-- grafik-zashtita-dryrun.sql — СУХ ТЕСТ на grafik-zashtita-schema.sql + grafik-access-roles-schema.sql
-- и на двата rollback-а. Един DO блок, който завършва с raise exception: изключението отменя
-- всичко — в базата не остава нищо (и кронът, и ПИН-ът на пробата). Резултатът е в текста на
-- грешката (СУХ ТЕСТ ОК …). Всяко разминаване — raise със своя текст, без „ОК“.

do $dry$
declare r text := ''; n int; t text; uid uuid; g boolean; f int; lu timestamptz; bl boolean; ok boolean;
begin
  select string_agg(list || ':' || c, ', ' order by list) into t from (select list, count(*) c from public.grafik_access group by list) x;
  r := r || E'\n0 преди: grafik_access — ' || t || '; CHECK — ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_access_list_check');

  -- ── стъпка 1 (grafik-zashtita-schema.sql) ──
  alter table public.grafik_access drop constraint grafik_access_list_check;
  alter table public.grafik_access add constraint grafik_access_list_check check (list in ('beta', 'view', 'trz', 'edit'));
  alter table public.grafik_access add column can_reset_pin boolean not null default false;
  create table public.grafik_pin (
    user_id uuid primary key references public.users(id) on delete cascade, pin_hash text not null,
    fails int not null default 0 check (fails >= 0), locked_until timestamptz, blocked boolean not null default false,
    set_at timestamptz not null default now(), last_ok_at timestamptz, last_try_at timestamptz);
  alter table public.grafik_pin enable row level security;
  revoke all on public.grafik_pin from anon, authenticated;
  create function public.grafik_pin_reserve(p_user uuid)
  returns table (granted boolean, pin_hash text, fails int, locked_until timestamptz, blocked boolean)
  language plpgsql set search_path = public as $f$
  #variable_conflict use_column
  begin
    return query
      update public.grafik_pin p
         set fails = p.fails + 1, blocked = (p.fails + 1 >= 10),
             locked_until = case when p.fails + 1 = 5 then now() + interval '15 minutes' else p.locked_until end,
             last_try_at = now()
       where p.user_id = p_user and not p.blocked and (p.locked_until is null or p.locked_until <= now())
      returning true, p.pin_hash, p.fails, p.locked_until, p.blocked;
    if not found then
      return query select false, null::text, p.fails, p.locked_until, p.blocked from public.grafik_pin p where p.user_id = p_user;
    end if;
  end; $f$;
  revoke all on function public.grafik_pin_reserve(uuid) from public, anon, authenticated;
  grant execute on function public.grafik_pin_reserve(uuid) to service_role;
  create table public.grafik_audit (
    id bigint generated always as identity primary key, at timestamptz not null default now(), event text not null,
    user_email text, user_role text, grafik_kind text, store_name text, month text,
    success boolean not null default true, details jsonb, dedup_key text unique);
  create index grafik_audit_at on public.grafik_audit (at desc);
  alter table public.grafik_audit enable row level security;
  revoke all on public.grafik_audit from anon, authenticated;
  perform cron.schedule('grafik-audit-retention', '17 3 * * *', $c$delete from public.grafik_audit where at < now() - interval '2 years'$c$);

  r := r || E'\n1 стъпка 1: CHECK — ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_access_list_check')
        || '; can_reset_pin true — ' || (select count(*) from public.grafik_access where can_reset_pin);
  -- права: anon / authenticated / mirror_reader — нищо; service_role — всичко нужно
  select string_agg(x, ', ') into t from (
    select rl || ':' || tb || ':' || pr as x from unnest(array['anon', 'authenticated', 'mirror_reader']) rl,
      unnest(array['public.grafik_pin', 'public.grafik_audit']) tb, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) pr
     where has_table_privilege(rl, tb, pr)) z;
  if t is not null then raise exception 'права, които не бива да ги има: %', t; end if;
  if not (has_table_privilege('service_role', 'public.grafik_pin', 'SELECT,INSERT,UPDATE,DELETE') and has_table_privilege('service_role', 'public.grafik_audit', 'SELECT,INSERT')) then
    raise exception 'service_role няма права върху новите таблици — grafik-api би паднал';
  end if;
  if has_function_privilege('anon', 'public.grafik_pin_reserve(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.grafik_pin_reserve(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.grafik_pin_reserve(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE на grafik_pin_reserve — грешен (anon/authenticated да нямат, service_role да има)';
  end if;
  r := r || E'\n2 права: anon / authenticated / mirror_reader — нищо върху grafik_pin и grafik_audit, без EXECUTE на функцията; service_role — да';
  select relrowsecurity into ok from pg_class where oid = 'public.grafik_pin'::regclass;
  select ok and relrowsecurity into ok from pg_class where oid = 'public.grafik_audit'::regclass;
  if not ok then raise exception 'RLS не е включен'; end if;
  select count(*) into n from cron.job where jobname = 'grafik-audit-retention';
  r := r || E'\n3 RLS — включен и на двете; кронът grafik-audit-retention — ' || n;

  -- проба на функцията (ПИН на admin, хешът е фалшив)
  select id into uid from public.users where email = 'ten.tenev@temax.bg';
  select count(*) into n from public.grafik_pin_reserve(uid);
  r := r || E'\n4 без ПИН — редове от функцията: ' || n;
  insert into public.grafik_pin (user_id, pin_hash) values (uid, 'dry');
  t := '';
  for i in 1..5 loop
    select x.granted, x.fails, x.locked_until into g, f, lu from public.grafik_pin_reserve(uid) x;
    t := t || ' ' || i || ':' || g || '/' || f || case when lu is null then '' else '/заключен' end;
  end loop;
  select x.granted, x.fails into g, f from public.grafik_pin_reserve(uid) x;
  t := t || ' | 6-и (заключен):' || g || '/' || f;
  if g or f <> 5 then raise exception 'заключването на 5-ия не работи: %', t; end if;
  update public.grafik_pin set locked_until = now() - interval '1 second' where user_id = uid;   -- минали 15 мин
  for i in 6..10 loop
    select x.granted, x.fails, x.blocked into g, f, bl from public.grafik_pin_reserve(uid) x;
    t := t || ' ' || i || ':' || g || '/' || f || case when bl then '/блокиран' else '' end;
  end loop;
  select x.granted, x.blocked into g, bl from public.grafik_pin_reserve(uid) x;
  t := t || ' | 11-и:' || g || '/' || bl;
  if g or not bl then raise exception 'блокирането на 10-ия не работи: %', t; end if;
  r := r || E'\n5 опити:' || t;
  begin
    insert into public.grafik_pin (user_id, pin_hash) values (uid, 'dry2');
    raise exception 'втори ПИН за същия човек МИНА';
  exception when unique_violation then r := r || E'\n6 втори ПИН за същия човек — отказ (unique)'; end;

  -- одит: dedup
  insert into public.grafik_audit (event, user_email, dedup_key) values ('dry', 'dry@test', 'k1') on conflict (dedup_key) do nothing;
  insert into public.grafik_audit (event, user_email, dedup_key) values ('dry', 'dry@test', 'k1') on conflict (dedup_key) do nothing;
  insert into public.grafik_audit (event, user_email, dedup_key) values ('dry', 'dry@test', null), ('dry', 'dry@test', null);
  select count(*) into n from public.grafik_audit where event = 'dry';
  r := r || E'\n7 одит: k1 два пъти + два без ключ → ' || n || ' реда (очаквани 3)';
  if n <> 3 then raise exception 'dedup не работи: %', n; end if;

  -- ── стъпка 2 (grafik-access-roles-schema.sql) ──
  update public.grafik_access set list = 'edit' where list = 'beta';
  update public.grafik_access set list = 'view', can_reset_pin = true where email = 't.tenev@temax.bg';
  drop index public.grafik_access_list_email;
  create unique index grafik_access_email on public.grafik_access (email);
  alter table public.grafik_access drop constraint grafik_access_list_check;
  alter table public.grafik_access add constraint grafik_access_list_check check (list in ('view', 'trz', 'edit'));
  select string_agg(email || ':' || list || case when can_reset_pin then ':нулира' else '' end, ', ' order by email) into t from public.grafik_access;
  r := r || E'\n8 стъпка 2: ' || t;
  begin
    insert into public.grafik_access (list, email) values ('trz', 't.tenev@temax.bg');
    raise exception 'втора роля за същия имейл МИНА';
  exception when unique_violation then r := r || E'\n9 втора роля за същия имейл — отказ'; end;
  begin
    insert into public.grafik_access (list, email) values ('beta', 'dry.test@temax.bg');
    raise exception 'beta след стъпка 2 МИНА';
  exception when check_violation then r := r || E'\n10 beta след стъпка 2 — отказ'; end;

  -- ── rollback на стъпка 2, после на стъпка 1 ──
  alter table public.grafik_access drop constraint grafik_access_list_check;
  update public.grafik_access set list = 'beta' where list in ('view', 'edit');
  drop index public.grafik_access_email;
  create unique index grafik_access_list_email on public.grafik_access (list, email);
  alter table public.grafik_access add constraint grafik_access_list_check check (list in ('beta', 'view', 'trz', 'edit'));
  perform cron.unschedule('grafik-audit-retention');
  drop table public.grafik_audit;
  drop function public.grafik_pin_reserve(uuid);
  drop table public.grafik_pin;
  alter table public.grafik_access drop column can_reset_pin;
  alter table public.grafik_access drop constraint grafik_access_list_check;
  alter table public.grafik_access add constraint grafik_access_list_check check (list in ('beta', 'trz'));
  select string_agg(list || ':' || c, ', ' order by list) into t from (select list, count(*) c from public.grafik_access group by list) x;
  select count(*) into n from information_schema.tables where table_schema = 'public' and table_name in ('grafik_pin', 'grafik_audit');
  r := r || E'\n11 след двата rollback-а: grafik_access — ' || t || '; CHECK — ' || (select pg_get_constraintdef(oid) from pg_constraint where conname = 'grafik_access_list_check')
        || '; нови таблици — ' || n || '; крон — ' || (select count(*) from cron.job where jobname = 'grafik-audit-retention')
        || '; индекс (list, email) — ' || (select count(*) from pg_indexes where indexname = 'grafik_access_list_email');

  raise exception 'СУХ ТЕСТ ОК%', r;
end
$dry$;
