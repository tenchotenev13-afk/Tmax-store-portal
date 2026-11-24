-- 20261123202341_revaluation_units_existing_data
-- Номера на бройките за заварените бланки draft / submitted / approved
-- (етап 2/3, 23.11.2026). Към прилагането: 1 бланка (Шумен, submitted),
-- 7 реда, всичките БР → 10 номера (Шумен-П0001…П0010, броячът = 10).
-- processed НЕ се номерират. Схемата: revaluation-units-schema.sql.
-- Rollback: 20261123202341_revaluation_units_existing_data_down.sql
-- БР (бр, бр., БР) → ceil(qty) номера, друга МЕ → 1 (както rvUnitsWant).
-- Пропуска редове, които вече имат номера. unit_no дава тригерът.
insert into public.revaluation_units (item_id, submission_id, store_name)
select i.id, i.submission_id, i.store_name
from public.revaluation_items i
join public.revaluation_submissions s on s.id = i.submission_id
cross join lateral generate_series(1,
  case when lower(btrim(coalesce(i.unit, ''))) in ('бр', 'бр.')
       then greatest(ceil(coalesce(i.qty, 0))::int, 0)
       else 1 end) g
where s.status in ('draft', 'submitted', 'approved')
  and not exists (select 1 from public.revaluation_units u where u.item_id = i.id)
order by i.store_name, i.sort_order, i.created_at, g;
