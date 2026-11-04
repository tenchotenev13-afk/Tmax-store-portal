-- transit-cleanup-data.sql — „Стока на път“ (04.11.2026, сесия transit-cleanup):
-- старите стойности на status, останали в базата.
--
--   status 'sent'     → status 'pending' + sender_status 'sent',
--                       sender_status_at = updated_at, sender_status_by = updated_by
--                       (правилото на 20261104122306; ако sender_status вече е
--                       попълнен — само status)
--   status 'rejected' → status 'pending' + reviewed_at = updated_at,
--                       reviewed_by = updated_by („✕ Недоставена“; ако reviewed_at
--                       вече е попълнен — само status)
--
-- Кога: СЛЕД тригера (transit-cleanup-schema.sql) и СЛЕД push-а на кода.
-- С тригера в базата нов 'sent' / 'rejected' не се появява; това са заварените.
-- Към 04.11.2026: 31 'sent' (13:03–16:20 UTC, раздели със стара версия) и 19
-- 'rejected' (нито един с reviewed_at). Броят не се изисква точен: засегнати =
-- кандидати, 0 оставащи.
-- Схема няма → ред за Живко не трябва.

do $cleanup$
declare
  n_sent    integer;
  n_rej     integer;
  n_upd_s   integer;
  n_upd_r   integer;
  n_after   integer;
begin
  select count(*) into n_sent from public.goods_transit where status = 'sent';
  select count(*) into n_rej  from public.goods_transit where status = 'rejected';

  update public.goods_transit
     set status = 'pending',
         sender_status    = coalesce(sender_status, 'sent'),
         sender_status_at = case when sender_status is null then coalesce(updated_at, now()) else sender_status_at end,
         sender_status_by = case when sender_status is null then updated_by else sender_status_by end
   where status = 'sent';
  get diagnostics n_upd_s = row_count;

  update public.goods_transit
     set status = 'pending',
         reviewed_at = coalesce(reviewed_at, updated_at, now()),
         reviewed_by = case when reviewed_at is null then updated_by else reviewed_by end
   where status = 'rejected';
  get diagnostics n_upd_r = row_count;

  select count(*) into n_after from public.goods_transit where status in ('sent', 'rejected');
  if n_upd_s <> n_sent or n_upd_r <> n_rej or n_after <> 0 then
    raise exception 'UPDATE: sent % → %, rejected % → %, останали % — връщам назад', n_sent, n_upd_s, n_rej, n_upd_r, n_after;
  end if;
  raise notice 'transit-cleanup-data: % sent → pending + sender_status, % rejected → pending + reviewed_at', n_upd_s, n_upd_r;
end
$cleanup$;

-- ── ROLLBACK (отделно, при нужда) ──────────────────────────────────────────
-- Точните редове се пазят в отчета на миграцията (id-тата се записват в лога
-- преди прилагането). Тригерът превежда 'sent' / 'rejected' обратно в pending,
-- затова rollback-ът минава САМО след rollback-а на схемата
-- (transit-cleanup-schema-down.sql):
-- update public.goods_transit set status = 'rejected'
--  where id in (<id-тата на rejected от лога>);
-- update public.goods_transit set status = 'sent'
--  where id in (<id-тата на sent от лога>);
