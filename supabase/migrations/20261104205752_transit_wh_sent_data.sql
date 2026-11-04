-- transit-wh-sent-data.sql — „Стока на път“ (04.11.2026, сесия transit-wh-sent):
-- редовете от логистичен склад, внесени ПРЕДИ правилото в импорта, стават
-- „📤 Изпратена · импорт“ — както ги внася вече импортът (transitImportBody).
-- Решение на Тенчо, 04.11.2026 (claude/stoka-na-pat-reshenia-2026-11.md в
-- Проекта на чата, „Складът и „Изпратена““): ред влиза само с ВД, импортът е месечен — стоката
-- почти винаги вече е тръгнала; складът ползва „↩ Върни изпращането“ само за
-- изключенията. Трансферите между магазини — без промяна.
--
--   неархивиран ред, supplier = логистичен склад, sender_status IS NULL
--     → sender_status 'sent', sender_status_by 'импорт', sender_status_at = imported_at
--
-- Кога: СЛЕД push-а на кода (значката „· импорт“ е в него).
-- Към 04.11.2026: Търговище 1 079 + Добрич 145 = 1 224 реда, всички incoming,
-- всички с imported_at. Проверката НЕ изисква точно 1 224 — изисква засегнатите
-- = кандидатите преди и след това 0 кандидати.
-- Схема няма → ред за Живко не трябва (огледалото взема данните с UPSERT).

do $whsent$
declare
  n_before integer;
  n_noimp  integer;
  n_upd    integer;
  n_after  integer;
begin
  select count(*) into n_before from public.goods_transit
   where archived_at is null and sender_status is null
     and supplier in ('Логистичен склад Търговище', 'Логистичен склад Добрич');
  select count(*) into n_noimp from public.goods_transit
   where archived_at is null and sender_status is null and imported_at is null
     and supplier in ('Логистичен склад Търговище', 'Логистичен склад Добрич');
  if n_noimp <> 0 then
    raise exception 'ПРОВЕРКАТА ПРЕДИ НЕ МИНА: % реда без imported_at — sender_status_at няма откъде да се вземе', n_noimp;
  end if;

  update public.goods_transit
     set sender_status    = 'sent',
         sender_status_by = 'импорт',
         sender_status_at = imported_at
   where archived_at is null and sender_status is null
     and supplier in ('Логистичен склад Търговище', 'Логистичен склад Добрич');
  get diagnostics n_upd = row_count;

  select count(*) into n_after from public.goods_transit
   where archived_at is null and sender_status is null
     and supplier in ('Логистичен склад Търговище', 'Логистичен склад Добрич');
  if n_upd <> n_before or n_after <> 0 then
    raise exception 'UPDATE: кандидати %, засегнати %, останали % — връщам назад', n_before, n_upd, n_after;
  end if;
  raise notice 'transit-wh-sent-data: % реда от склад → sender_status sent (импорт)', n_upd;
end
$whsent$;

-- ── ROLLBACK (отделно, при нужда) ──────────────────────────────────────────
-- Само редовете, отбелязани от тази миграция или от импорта (by 'импорт' и
-- at = imported_at). Внимание: следващ импорт обновява imported_at на
-- съществуващите редове, а sender_status_at остава — след него rollback-ът
-- не хваща тези редове. Ред, който складът е натиснал ръчно, носи друго by
-- и не се пипа.
-- update public.goods_transit
--    set sender_status = null, sender_status_by = null, sender_status_at = null
--  where sender_status = 'sent' and sender_status_by = 'импорт'
--    and sender_status_at = imported_at;
