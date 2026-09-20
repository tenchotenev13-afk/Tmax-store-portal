-- Rollback на 20260920142158_loading_missing.sql
--
-- Преди пускане: уведоми Живко (огледалото вече очаква трите колони и
-- разширения CHECK).
--
-- ВНИМАНИЕ 1 — откатът на CHECK-а ГЪРМИ, ако има листи със status='partial'.
-- Стесняването не е автоматично обратимо. Преброй ПРЕДИ отката:
--   select count(*) from public.loading_lists where status = 'partial';
-- Различно от нула значи решение на човек какво става с тези листи ('done'
-- ли са, или обратно 'sent'). Нарочно НЕ пиша тук UPDATE — мълчаливо
-- пренаписване на статуси при откат е точно видът промяна, която после никой
-- не може да проследи.
--
-- ВНИМАНИЕ 2 — drop-ът на колоните заличава маркировките „неполучен"
-- безвъзвратно. Те НЕ се извеждат обратно от received: received = false значи
-- само „още не е отметнат", а не „обектът заяви, че липсва".
--
-- Към 20.09.2026 откатът е без загуба — и двете таблици бяха празни.

alter table public.loading_lists
  drop constraint loading_lists_status_check;

alter table public.loading_lists
  add constraint loading_lists_status_check
    check (status in ('draft', 'sent', 'done'));

comment on column public.loading_lists.status is
  'draft | sent | done. draft е видим само за склада; от sent нататък обектите виждат своите редове.';

alter table public.loading_list_items
  drop column missing_at,
  drop column missing_by,
  drop column missing;
