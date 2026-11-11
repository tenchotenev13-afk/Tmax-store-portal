Отворено: 02.11 · Кой чака: чат · Сесия: pallets-auto-complete
Затворено: 06.11 · Как: сверено от чата в базата (само четене) за 02–06.11.2026 — 17 обекта със справка в transport_pallets, всичките 17 с task_completions за ceb052e6-872f-425d-bb78-cd1e7db2909f, completion_date 2026-11-06, completed_by='auto:pallets', completed_at = created_at на справката (тригерът); Троян подаде 05.11 → отметка за петъка; справка след 17:00 — няма; отметка без справка — няма. Без справка и без отметка: Силистра (очаквано); Пазарджик — без справка; 0 активни потребители (users), затова не е в отчетните обекти на Бюлетина; извън обхвата, проверено от чата 11.11. Писмото deadline_passed от 17:15 не е сверено (не се пази в базата).

- **Палети → Бюлетин, проверка на живо в петък 06.11.2026** (първият петък с автоматичната отметка):
  - всеки обект със справка до 17:00 има ред `task_completions` с `completed_by='auto:pallets'`, `completion_date='2026-11-06'` и `completed_at` до минута след `transport_pallets.created_at` (тригерът) или до час (кронът `pallets-auto-complete`);
  - справка след 17:00 (ако изобщо мине през формата) — без отметка;
  - писмото deadline_passed в 17:15 изброява като „не са подали" само обектите без справка;
  - обект без справка, който досега е отмятал с коментар „изпратени всички палети" (Добрич 30.10, Габрово 09.10), вече ще излезе неподал — очаквано по решението; ако Тенчо иска друго, решение за обектите с 0 палета (справка с нули минава и днес).
- SQL за сверката:
  `select tc.store_name, tc.completed_by, tc.completed_at at time zone 'Europe/Sofia', p.created_at at time zone 'Europe/Sofia' from task_completions tc left join transport_pallets p on p.store_name=tc.store_name and p.report_date between '2026-11-02' and '2026-11-06' where tc.recurring_task_id='ceb052e6-872f-425d-bb78-cd1e7db2909f' and tc.completion_date='2026-11-06' order by 1;`
