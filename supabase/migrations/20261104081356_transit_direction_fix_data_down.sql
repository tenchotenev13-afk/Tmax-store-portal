-- Rollback на 20261104081356_transit_direction_fix_data
-- Огледало: закоментираният ROLLBACK блок в transit-direction-fix-data.sql
do $rb$
declare
  ids uuid[] := array[
    '148ed86c-c463-459a-b080-b1bb660c3300',
    '070ffe3c-e641-4f66-bd34-c993e656c353',
    '4be0d06b-c361-4745-b8a5-8bf2d8678f75'
  ]::uuid[];
  n integer;
begin
  update public.goods_transit set direction = 'outgoing'
   where id = any(ids) and direction = 'incoming';
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'ROLLBACK засегна % реда, очаквани 3 — връщам назад', n;
  end if;
end
$rb$;
