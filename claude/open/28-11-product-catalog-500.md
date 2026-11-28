Отворено: 28.11 · Кой чака: Code · Сесия: rls-server-only

**`product_catalog` — 9 × 500 при GET за 48 ч** (от описа rls-15-opis, 28.11).
Причината не е търсена. Преди миграция 2/3 на rls-ostanali-15 (product_catalog
е с RLS off и пълни права за anon) — `edge_logs` + `postgres_logs` за
500-ките: коя заявка (`request.search`), statement timeout ли е (голям `ilike`
без индекс / без `limit`), от кой модул (referer). Да не се смесва с ефекта от
включване на RLS.

**28.11 (сесия rls-spravochnici-razliki) — причината, преди миграция 2.**
edge_logs за 24 ч: 5 × 500, всички GET от браузъра (Pages), `origin_time`
3125–3166 мс — тоест `statement_timeout=3s` на ролята anon (57014), не RLS
(тогава RLS е изключено). Заявките: 4 × `select=sale_price_uploaded_at &
sale_price_uploaded_at=not.is.null & order=…desc & limit=1` (най-новата дата
на качени продажни цени) и 1 × търсене `or=(sap_code.ilike.12549*,
product_name.ilike.*12549*) & limit=8`. Таблицата: 107 812 реда, 53 MB;
индекси само pkey(sap_code), GIN to_tsvector(product_name), ean_code — нищо
по `sale_price_uploaded_at`, нищо за `ilike '*…*'` (trigram). Тоест seq scan
+ сортировка, понякога (студен кеш) над 3 с. Предложение (отделна задача,
не е направено): `create index … on product_catalog (sale_price_uploaded_at
desc) where sale_price_uploaded_at is not null` (или един ред в
app_settings за датата) и trigram индекс за търсенето. След RLS (политика
using (true)) да се сравни броят 500 — очаква се същият.
