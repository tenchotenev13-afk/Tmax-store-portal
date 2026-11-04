-- transit-status-split-data.sql — „Стока на път“, етап 3 (04.11.2026):
-- старата стойност status 'sent' (изпращачът натиснал „Изпратена“, получателят
-- още не е отговорил) се разделя на двете независими полета.
--
--   status 'sent'  →  status 'pending'           (получателят още не е отговорил)
--                     sender_status 'sent'        (изпращачът е изпратил)
--                     sender_status_at = updated_at, sender_status_by = updated_by
--
-- Кога: СЛЕД push-а на кода от етап 3 и СЛЕД transit-status-split-schema.sql.
-- Новият код търпи и двете (стар 'sent' се показва като „получател pending +
-- изпращач изпратена“). Старият код с новите данни би показал тези редове като
-- „Не доставена“ без „Изпратена“ — затова данните чакат кода.
--
-- Към 04.11.2026: 44 реда 'sent', всичките direction 'transfer', всичките с
-- попълнени updated_at и updated_by. Проверката долу НЕ изисква точно 44 —
-- обектите работят и броят се мени; изисква всеки 'sent' да е transfer и след
-- UPDATE-а да не остане нито един 'sent'.
--
-- Схема няма (колоните са от transit-status-split-schema.sql) → ред за Живко
-- не трябва: огледалото взема данните с UPSERT.

do $split$
declare
  n_before integer;
  n_bad    integer;
  n_upd    integer;
  n_after  integer;
begin
  select count(*) into n_before from public.goods_transit where status = 'sent';
  select count(*) into n_bad from public.goods_transit
   where status = 'sent' and (direction is distinct from 'transfer' or sender_status is not null);
  if n_bad <> 0 then
    raise exception 'ПРОВЕРКАТА ПРЕДИ НЕ МИНА: % реда sent не са transfer или вече имат sender_status', n_bad;
  end if;

  update public.goods_transit
     set status = 'pending',
         sender_status = 'sent',
         sender_status_at = updated_at,
         sender_status_by = updated_by
   where status = 'sent';
  get diagnostics n_upd = row_count;

  select count(*) into n_after from public.goods_transit where status = 'sent';
  if n_upd <> n_before or n_after <> 0 then
    raise exception 'UPDATE: преди % sent, засегнати %, останали % — връщам назад', n_before, n_upd, n_after;
  end if;
  raise notice 'transit-status-split-data: % реда sent → pending + sender_status sent', n_upd;
end
$split$;

-- ── ROLLBACK (отделно, при нужда) ──────────────────────────────────────────
-- Връща старото значение: „изпращачът изпратил, получателят не е отговорил“
-- = status 'sent'. Важи и за редовете, отбелязани с новия код след
-- миграцията — в стария модел те пак са 'sent'. Колоните sender_* остават
-- (махат се с rollback-а на схемата).
-- update public.goods_transit
--    set status = 'sent'
--  where sender_status = 'sent' and status = 'pending';
