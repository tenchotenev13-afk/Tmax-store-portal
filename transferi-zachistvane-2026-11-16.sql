-- Трансфери — старт на чисто от 17.11.2026 (изтриване с архив)
-- Сесия transferi-zachistvane, 16.11.2026. Корекция на ДАННИ, не на схемата.
--
-- Решение на Теодор и Тенчо (16.11): всички трансфери до днес се махат от
-- портала, обектите започват на чисто от вторник 17.11. Незавършените
-- (sent 8, partial 11, planned 1 към 16.11) влизат в изтриването нарочно;
-- товарите им са извадени в Excel преди изпълнението (само четене, не е в
-- репото).
--
-- Какво НЕ се пипа:
--   • transfer_counters — оттам идва номерът (assign_transfer_num), затова
--     номерацията по обект ПРОДЪЛЖАВА (напр. Троян-0031 след Троян-0030).
--   • client_orders — статусът им ('sent' от „🚚 Тръгна") остава какъвто е;
--     връзката е масив в transfer_cargo.client_order_ids, не FK от другата
--     страна.
--   • loading_list_items — FK е transfer_cargo.loading_item_id → там
--     (ON DELETE SET NULL от страната на товара); към 16.11 попълнено в 0 реда.
--   • Снимките в Storage (bulletin-files/transfers/…) — остават; адресите им
--     са в transfer_cargo_events_archive_20261116.photos.
--   • app_settings.transfer_stale_days — остава.
--
-- Връзки вътре в трите таблици (всички се трият заедно, в една транзакция):
--   transfer_cargo.transfer_id        → transfers        ON DELETE CASCADE
--   transfer_cargo.prev_cargo_id      → transfer_cargo   ON DELETE SET NULL
--   transfer_cargo_events.cargo_id    → transfer_cargo   ON DELETE CASCADE
--   transfer_cargo_events.transfer_id → transfers        ON DELETE CASCADE
--   transfer_cargo_events.resolves_id → transfer_cargo_events ON DELETE SET NULL
-- Тригери: само на transfers (assign_transfer_num при insert,
-- keep_transfer_num при update). Кронове и изгледи, които четат трите
-- таблици — няма (проверено 16.11).
--
-- Архивните таблици са в public: RLS включено БЕЗ политики + revoke all от
-- anon / authenticated (default privileges иначе дават SELECT/INSERT/UPDATE
-- на anon). Не се четат от браузъра и НЕ са за огледалото.
--
-- Защо архив и изтриване са в ЕДНА миграция, а не в две: обектите отмятат
-- до последно (44 отметки след 13.11, последната 16.11 07:24). Между две
-- отделни стъпки може да влезе нова отметка или смяна на статус и архивът
-- да не е точно това, което се трие. LOCK-ът спира записите (четенето
-- остава) до края на транзакцията; архивът и изтриването виждат едно и
-- също състояние.

-- ═══ ПРЕДИ ИЗПЪЛНЕНИЕТО (execute_sql, само четене) ═══
-- select (select count(*) from transfers)             t,
--        (select count(*) from transfer_cargo)        c,
--        (select count(*) from transfer_cargo_events) e,
--        (select count(*) from transfers where created_at >= '2026-11-14') t_new,
--        (select max(created_at) from transfer_cargo_events) last_ev;
-- t_new трябва да е 0. Ако не е — СПИРАНЕ, нов транспорт след 13.11.
-- Изпълнено по обед на 16.11 (решение на Тенчо), затова миграцията хваща
-- само created_at < 2026-11-15T22:00:00Z (16.11 00:00 София); създаденото
-- днес остава в живите таблици.

-- ═══ МИГРАЦИЯ (apply_migration, име transferi_zachistvane_20261116) ═══

lock table public.transfers, public.transfer_cargo, public.transfer_cargo_events
  in share row exclusive mode;

-- Само създаденото ПРЕДИ 16.11 00:00 София (= 2026-11-15T22:00:00Z), решение
-- на Тенчо 16.11 12:52: каквото е създадено днес, остава. Товарите — на
-- архивираните трансфери. Отметките — на архивираните товари ИЛИ на
-- архивираните трансфери (и двата FK са ON DELETE CASCADE, иначе каскадата
-- би изтрила отметка, която не е в архива).
create table public.transfers_archive_20261116 as
  select * from public.transfers
   where created_at < '2026-11-15T22:00:00Z';
create table public.transfer_cargo_archive_20261116 as
  select * from public.transfer_cargo
   where transfer_id in (select id from public.transfers_archive_20261116);
create table public.transfer_cargo_events_archive_20261116 as
  select * from public.transfer_cargo_events
   where cargo_id    in (select id from public.transfer_cargo_archive_20261116)
      or transfer_id in (select id from public.transfers_archive_20261116);

alter table public.transfers_archive_20261116             enable row level security;
alter table public.transfer_cargo_archive_20261116        enable row level security;
alter table public.transfer_cargo_events_archive_20261116 enable row level security;

revoke all on public.transfers_archive_20261116             from anon, authenticated;
revoke all on public.transfer_cargo_archive_20261116        from anon, authenticated;
revoke all on public.transfer_cargo_events_archive_20261116 from anon, authenticated;

comment on table public.transfers_archive_20261116 is
  'Архив на transfers преди старта на чисто 17.11.2026 (transferi-zachistvane-2026-11-16.sql). Не за браузъра, не за огледалото.';
comment on table public.transfer_cargo_archive_20261116 is
  'Архив на transfer_cargo преди старта на чисто 17.11.2026 (transferi-zachistvane-2026-11-16.sql). Не за браузъра, не за огледалото.';
comment on table public.transfer_cargo_events_archive_20261116 is
  'Архив на transfer_cargo_events преди старта на чисто 17.11.2026 (transferi-zachistvane-2026-11-16.sql). Не за браузъра, не за огледалото.';

do $$
declare
  a_t int; a_c int; a_e int;
  d_t int; d_c int; d_e int;
  r_t int; r_c int; r_e int;
begin
  select count(*) into a_t from public.transfers_archive_20261116;
  select count(*) into a_c from public.transfer_cargo_archive_20261116;
  select count(*) into a_e from public.transfer_cargo_events_archive_20261116;

  -- Нещо, което ОСТАВА, да не сочи към изтриваното — иначе SET NULL би
  -- скъсал връзката мълчаливо (prev_cargo_id, resolves_id).
  if exists (select 1 from public.transfer_cargo
              where id not in (select id from public.transfer_cargo_archive_20261116)
                and prev_cargo_id in (select id from public.transfer_cargo_archive_20261116))
     or exists (select 1 from public.transfer_cargo_events
              where id not in (select id from public.transfer_cargo_events_archive_20261116)
                and resolves_id in (select id from public.transfer_cargo_events_archive_20261116)) then
    raise exception 'transferi-zachistvane: оставащ ред сочи към изтриван (prev_cargo_id / resolves_id) — отказ';
  end if;

  -- Ред: отметки → товари → трансфери. Трие се САМО архивираното (по id).
  delete from public.transfer_cargo_events
   where id in (select id from public.transfer_cargo_events_archive_20261116);
  get diagnostics d_e = row_count;

  delete from public.transfer_cargo
   where id in (select id from public.transfer_cargo_archive_20261116);
  get diagnostics d_c = row_count;

  delete from public.transfers
   where id in (select id from public.transfers_archive_20261116);
  get diagnostics d_t = row_count;

  -- Останали от архивираните id — трябва 0 (каскадата не е изтрила повече,
  -- отколкото е в архива, защото проверката е по броя изтрити).
  select count(*) into r_t from public.transfers
   where id in (select id from public.transfers_archive_20261116);
  select count(*) into r_c from public.transfer_cargo
   where id in (select id from public.transfer_cargo_archive_20261116);
  select count(*) into r_e from public.transfer_cargo_events
   where id in (select id from public.transfer_cargo_events_archive_20261116);

  if d_t <> a_t or d_c <> a_c or d_e <> a_e or r_t <> 0 or r_c <> 0 or r_e <> 0 then
    raise exception 'transferi-zachistvane: архив %/%/%, изтрити %/%/%, останали от архива %/%/% — отказ, нищо не е променено',
      a_t, a_c, a_e, d_t, d_c, d_e, r_t, r_c, r_e;
  end if;

  raise notice 'transferi-zachistvane: архив и изтрити transfers %, transfer_cargo %, transfer_cargo_events %; в живите остават %/%/%',
    d_t, d_c, d_e,
    (select count(*) from public.transfers), (select count(*) from public.transfer_cargo),
    (select count(*) from public.transfer_cargo_events);
end $$;

-- ═══ СЛЕД ИЗПЪЛНЕНИЕТО (execute_sql, само четене) ═══
-- select (select count(*) from transfers)                              t,
--        (select count(*) from transfer_cargo)                         c,
--        (select count(*) from transfer_cargo_events)                  e,
--        (select count(*) from transfers_archive_20261116)             at,
--        (select count(*) from transfer_cargo_archive_20261116)        ac,
--        (select count(*) from transfer_cargo_events_archive_20261116) ae;
-- select store_name, last_num from transfer_counters order by 1;   -- непроменени
-- select c.relname, c.relrowsecurity, c.relacl::text,
--        (select count(*) from pg_policy p where p.polrelid = c.oid) pols
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relname like 'transfer%archive_20261116';
-- relrowsecurity = true, pols = 0, в relacl няма anon / authenticated.

-- ═══ ROLLBACK (ръчно, през execute_sql; само докато архивните таблици ги има) ═══
-- Връща редовете с оригиналните id и transfer_num. assign_transfer_num се
-- изключва за времето на вмъкването — иначе би дал НОВ номер на всеки
-- върнат трансфер и би вдигнал transfer_counters. Старите номера не се бият
-- с новите (unique transfers_num_uidx): броячите продължават, новите
-- номера са по-големи от всеки архивиран.
-- Колоните се взимат по ИМЕ от архива (не select *), за да не зависи от
-- реда на колоните, ако таблицата е променяна междувременно.
--
-- begin;
-- alter table public.transfers disable trigger trg_assign_transfer_num;
-- do $$
-- declare
--   pair text[]; cols text; n_a int; n_i int;
-- begin
--   foreach pair slice 1 in array array[
--     ['transfers',             'transfers_archive_20261116'],
--     ['transfer_cargo',        'transfer_cargo_archive_20261116'],
--     ['transfer_cargo_events', 'transfer_cargo_events_archive_20261116']
--   ] loop
--     select string_agg(format('%I', column_name), ', ' order by ordinal_position) into cols
--       from information_schema.columns
--      where table_schema = 'public' and table_name = pair[2];
--     execute format('insert into public.%I (%s) select %s from public.%I', pair[1], cols, cols, pair[2]);
--     get diagnostics n_i = row_count;
--     execute format('select count(*) from public.%I', pair[2]) into n_a;
--     if n_i <> n_a then
--       raise exception 'rollback %: върнати %, в архива %', pair[1], n_i, n_a;
--     end if;
--     raise notice 'rollback %: върнати %', pair[1], n_i;
--   end loop;
-- end $$;
-- alter table public.transfers enable trigger trg_assign_transfer_num;
-- commit;
--
-- Проверка след rollback:
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.transfers'::regclass and not tgisinternal;   -- и двата 'O'
-- select count(*) from transfers t join transfers_archive_20261116 a
--   on a.id = t.id and a.transfer_num = t.transfer_num;               -- = броя в архива
--
-- Архивните таблици се махат с отделно решение (drop table …), не тук.
