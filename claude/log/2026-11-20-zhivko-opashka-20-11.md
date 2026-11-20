# 20.11 — zhivko-opashka-20-11

- `zhivko-opashka.md`: нова секция „Потвърдено 20.11.2026" над „Потвърдено 19.11.2026" с двата реда, потвърдени от Живко с имейл 20.11:
  - редът от 18.11 (loading_list_delete_draft, информативно) — от „Чака изпращане"; бележка: синхронът трие изчезналите редове в loading_lists / loading_list_items / loading_list_products / loading_list_photos, сираци — 0;
  - problem_articles (таблица + seed 23 реда) — от „Изпратено 19.11.2026" (махната, празна); бележка: всички колони и default-и, photos jsonb, 23 реда active / seed, без NOT NULL и CHECK, индекси material_code / status / source_line_id, синхрон всеки час от 23:00.
- „Чака изпращане" остава празна. Само текст — без схема, без rollback, без ред за Живко. Проверки: smoke + handover-structure.
