Отворено: 27.11 · Кой чака: Code · Сесия: grafik-zashtita

- **СПЕШНО, за сесията по сигурността (решение на Тенчо 27.11: тук не се поправя).** `public.audit_log` е отворен за публичния (anon) ключ: anon и authenticated имат **SELECT, INSERT, UPDATE и TRUNCATE** (сверено 27.11 в `information_schema.role_table_grants`; mirror_reader — само SELECT, 30 357 реда).
- Следствия: всеки с ключа от клиента чете целия одит (кой какво е правил, имейли, детайли); пише фалшиви редове; променя съществуващи; **TRUNCATE изтрива всичко с една заявка** (DELETE е отнет от 02.11, TRUNCATE — не).
- Графикът вече не разчита на него за нови неща: одитът на четенето и ПИН събитията са в `grafik_audit` (без права за anon, `grafik-zashtita-schema.sql`). Промените по графика се пишат и в двата.
- Посока: кой в браузъра пише в `audit_log` (grep `audit_log` в *.js) → INSERT остава или минава през едж функция; SELECT / UPDATE / TRUNCATE за anon и authenticated — revoke; огледалото чете с mirror_reader (не се засяга).
