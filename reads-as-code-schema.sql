-- reads-as-code-schema.sql — Разлики: „Чете се като (код)“ на реда с
-- категория „грешен баркод“ (23.11.2026, сесия razliki-chete-se-kato).
-- Миграция reads_as_code — ВЕРСИЯТА СЕ ВПИСВА СЛЕД ПРИЛАГАНЕТО.
-- Този файл е ОГЛЕДАЛО на миграцията, не източник.
--
-- ЗАЩО. Тестът на Миглена (писмо 20.11, „тест проблемни артикули“): при ред
-- „грешен баркод“ обектът знае на какъв код се чете баркодът (87798), но
-- няма къде да го впише — слагаше го в общия коментар, а после Миглена го
-- въвеждаше наново в регистъра през „➕ В регистъра“. Решение на Тенчо
-- 22–23.11: поле по избор на реда, само при wrong_barcode.
--
-- Колоната е nullable, без default, без CHECK и без индекс. Заварените
-- редове остават NULL. Права: таблицата е с anon_all_* политика и
-- таблични права — нова колона ги наследява (SELECT/INSERT/UPDATE).
--
-- Огледало (Живко): нова колона — ред в zhivko-opashka.md, „Чака изпращане“.

alter table public.stock_differences add column if not exists reads_as_code text;

comment on column public.stock_differences.reads_as_code is
  'Грешен баркод: на какъв код се чете баркодът на касата (по избор, само при difference_category = wrong_barcode). 23.11.2026.';

-- ROLLBACK:
-- alter table public.stock_differences drop column if exists reads_as_code;
