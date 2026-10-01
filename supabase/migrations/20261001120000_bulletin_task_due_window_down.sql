-- Rollback на 20261001120000_bulletin_task_due_window
--
-- Редът е обратният: първо ограничението, после колоната. Обратното дава
-- „constraint does not exist", защото drop column го маха заедно с нея.
--
-- ⚠ ГУБИ ДАННИ. Всяка задача, за която е включен прозорец, се връща към
-- поведението „отметка за ВСЕКИ ден поотделно" — тоест обект, свършил работата
-- веднъж, пак ще излиза 1/4. Отметките в task_completions НЕ се пипат: те носят
-- реалния ден на щракване и остават валидни редове, просто броячите пак ще искат
-- по една на ден.
--
-- Преди да се пусне: select count(*) from bulletin_tasks where due_window;
-- Нула значи, че връщането е безопасно. Повече от нула значи, че точно толкова
-- задачи ще сменят начина, по който се броят — и ако седмицата им е минала,
-- отчетът за нея ще каже друго число от вчера.

alter table public.bulletin_tasks
  drop constraint if exists bulletin_tasks_window_needs_days_chk;

alter table public.bulletin_tasks
  drop column if exists due_window;
