Отворено: 28.11 · Кой чака: Тенчо · Сесия: rls-spravochnici-razliki

**MAINTAIN (`m` в ACL) за anon / authenticated — отделна точка.** При
сверката за миграции 2 и 3 на rls-ostanali-15 (28.11) ACL-ът на всичките 11
таблици е `arw(d)Dxtm` за anon и authenticated — `m` е MAINTAIN (PG17:
VACUUM, ANALYZE, REINDEX, CLUSTER, REFRESH MATERIALIZED VIEW, LOCK TABLE).
През PostgREST тези команди не се викат, но правото е излишно.
Решение на Тенчо 28.11: НЕ се пипа в миграциите на справочниците и
Разлики (последователно с касата) — отделна задача: инвентар по всички
таблици в public (`has_table_privilege('anon', oid, 'MAINTAIN')`) и една
миграция с revoke + rollback. Default privileges за нови таблици — да се
провери дали дават MAINTAIN.
