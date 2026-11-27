-- razliki-return-sync-data.sql — изравняване на заварените (26.11.2026,
-- сесия razliki-vrashtane-edno-myasto). Прилага се СЛЕД тригера
-- (razliki-return-sync-schema.sql), отделна миграция.
--
-- Редовете в stock_differences с type 'return' и status 'pending', чийто
-- свързан stock_returns (diff_line_id) е 'taken' или 'completed'
--   → status 'taken', completed_by 'За връщане (изравняване 26.11)',
--     completed_at = now().
-- НЕ се пипат: шестте обратни (Разлики taken, За връщане pending) и двата
-- 'received'.
--
-- Гард по броя: към 26.11.2026 сутринта очаквани 18; при писането на файла
-- (26.11, следобед) — 17 (16 taken + 1 completed; един ред е отбелязан
-- междувременно). Блокът спира, ако кандидатите са извън 14..20 или ако
-- засегнатите не са равни на кандидатите. id-тата — в
-- claude/log/2026-11-26-razliki-vrashtane-edno-myasto.md.
-- Схема няма → за огледалото: „само промяна в данни".
--
-- ROLLBACK (по id от лога):
--   update stock_differences set status = 'pending', completed_by = null, completed_at = null
--    where completed_by = 'За връщане (изравняване 26.11)' and id in (<id-тата от лога>);

do $sync$
declare
  n_cand  integer;
  n_upd   integer;
  n_after integer;
begin
  select count(*) into n_cand
    from stock_differences d
   where d.type = 'return' and d.status = 'pending'
     and exists (select 1 from stock_returns r
                  where r.diff_line_id = d.id and r.status in ('taken', 'completed'));
  if n_cand < 14 or n_cand > 20 then
    raise exception 'Изравняване: % кандидата, очаквани ~17 — спирам', n_cand;
  end if;

  update stock_differences d
     set status = 'taken', completed_by = 'За връщане (изравняване 26.11)', completed_at = now()
   where d.type = 'return' and d.status = 'pending'
     and exists (select 1 from stock_returns r
                  where r.diff_line_id = d.id and r.status in ('taken', 'completed'));
  get diagnostics n_upd = row_count;

  select count(*) into n_after
    from stock_differences d
   where d.type = 'return' and d.status = 'pending'
     and exists (select 1 from stock_returns r
                  where r.diff_line_id = d.id and r.status in ('taken', 'completed'));

  if n_upd <> n_cand or n_after <> 0 then
    raise exception 'Изравняване: кандидати %, засегнати %, останали % — връщам', n_cand, n_upd, n_after;
  end if;
  raise notice 'Изравняване: % реда', n_upd;
end
$sync$;
