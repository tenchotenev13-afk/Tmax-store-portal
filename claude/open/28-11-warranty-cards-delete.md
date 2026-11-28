Отворено: 28.11 · Кой чака: Тенчо · Сесия: rls-server-only

**`warranty_cards` — да се трие ли?** 0 реда, нито клиентът, нито едж функция
я ползват (edge_logs 28.11: само GET от огледалото, mirror_reader). От
28.11.2026 е заключена (`rls-server-only-schema.sql`: RLS on, anon и
authenticated без права, само `mirror_reader_select`). Триенето е отделно
решение: `drop table` + ред в `zhivko-opashka.md` („таблицата отпада“) +
махане от `tools/mirror-key/mirror-tables.txt` и от mirror-schema на Живко.
FK от нея към `warranty_brands` / `warranty_subcategories` — отпадат с нея.
