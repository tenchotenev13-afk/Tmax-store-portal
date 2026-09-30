-- daily_turnover: card_turnover и bank_turnover могат да са ОТРИЦАТЕЛНИ.
--
-- Причина (30.09.2026): в ден, в който сторното по карта или по банков път е
-- по-голямо от продажбите по канала, каналът е под нула. Старото
-- daily_turnover_nonneg_chk отказваше записа. Общият оборот, сумата в брой и
-- броят клиенти остават >= 0. daily_turnover_sum_chk (10%) НЕ се пипа.
--
-- Клиентът (daily-turnover.js → dtValidate) е сменен в същия комит. Редът е
-- клиент ПРЕДИ база само при СТЕГНАТО правило; тук правилото се РАЗХЛАБВА,
-- затова е обратно: първо базата, после клиентът — иначе касиерът минава
-- клиентската проверка и удря „нарушен CHECK".
--
-- Проверка преди прилагане: новото ограничение е по-слабо от старото (махат
-- се две условия), тоест всеки съществуващ ред го удовлетворява. Сверено на
-- 30.09.2026 с: select count(*) filter (where total_turnover>=0
--   and cash_turnover>=0 and customers>=0), count(*) from daily_turnover.

alter table public.daily_turnover
  drop constraint if exists daily_turnover_nonneg_chk;

alter table public.daily_turnover
  add constraint daily_turnover_nonneg_chk
  check (total_turnover >= 0 and cash_turnover >= 0 and customers >= 0);

-- ROLLBACK (работи само ако няма редове с отрицателна карта/банка —
-- иначе add constraint пада; тогава редовете се коригират първо):
--   alter table public.daily_turnover drop constraint daily_turnover_nonneg_chk;
--   alter table public.daily_turnover add constraint daily_turnover_nonneg_chk
--     check (total_turnover >= 0 and cash_turnover >= 0
--            and card_turnover >= 0 and bank_turnover >= 0 and customers >= 0);
