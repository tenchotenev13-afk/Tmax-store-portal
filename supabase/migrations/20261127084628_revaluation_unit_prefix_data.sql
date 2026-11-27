-- 20261127084628_revaluation_unit_prefix_data
-- Заварените номера → новия вид (т.7 на Теодор, 27.11.2026): префиксът на
-- обекта + числото от стария номер, без нули
-- (Шумен-П0007 → SH7, Кърджали-П0004 → KJ4, Габрово-П0002 → GB2).
-- Към 27.11.2026: 16 реда (Шумен 10 submitted, Кърджали 4 и Габрово 2 draft).
-- Броячите (revaluation_unit_counters) не се пипат — номерацията продължава.
-- Rollback: 20261127084628_revaluation_unit_prefix_data_down.sql
update public.revaluation_units u
   set unit_no = s.unit_prefix || (substring(u.unit_no from '-П(\d+)$')::int)::text
  from public.stores s
 where s.name = u.store_name
   and s.unit_prefix is not null
   and u.unit_no ~ '-П\d+$';
