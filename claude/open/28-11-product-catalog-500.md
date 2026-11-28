Отворено: 28.11 · Кой чака: Code · Сесия: rls-server-only

**`product_catalog` — 9 × 500 при GET за 48 ч** (от описа rls-15-opis, 28.11).
Причината не е търсена. Преди миграция 2/3 на rls-ostanali-15 (product_catalog
е с RLS off и пълни права за anon) — `edge_logs` + `postgres_logs` за
500-ките: коя заявка (`request.search`), statement timeout ли е (голям `ilike`
без индекс / без `limit`), от кой модул (referer). Да не се смесва с ефекта от
включване на RLS.
