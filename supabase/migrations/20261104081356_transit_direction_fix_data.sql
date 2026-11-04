-- 20261104081356_transit_direction_fix_data
-- Огледало: transit-direction-fix-data.sql (DO блокът, приложен дословно чрез apply_migration на 04.11.2026). Rollback: _down.sql
do $fix$
declare
  ids uuid[] := array[
    '148ed86c-c463-459a-b080-b1bb660c3300',
    '070ffe3c-e641-4f66-bd34-c993e656c353',
    '4be0d06b-c361-4745-b8a5-8bf2d8678f75'
  ]::uuid[];
  n integer;
begin
  -- Проверка преди: точно тези 3 реда, всичките 'outgoing', доставчик склад.
  select count(*) into n from public.goods_transit
   where id = any(ids) and direction = 'outgoing'
     and supplier = 'Логистичен склад Търговище';
  if n <> 3 then
    raise exception 'ПРОВЕРКАТА ПРЕДИ НЕ МИНА: очаквани 3 реда outgoing от склад Търговище, има %', n;
  end if;

  update public.goods_transit set direction = 'incoming'
   where id = any(ids) and direction = 'outgoing';
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'UPDATE засегна % реда, очаквани 3 — връщам назад', n;
  end if;
end
$fix$;
