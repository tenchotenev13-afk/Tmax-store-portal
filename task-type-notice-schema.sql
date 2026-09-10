-- Нов вид задача: 'notice' — „Само за информация"
--
-- Задача, която се показва като ТЕКСТ в Седмичния календар на Бюлетина, без
-- чекбокс. Няма task_completions, значи не влиза в нито един брояч, отчет,
-- имейл или push. Клиентската страна е в taskIsNotice() (shared.js) и в
-- копия в трите едж функции.
--
-- Без нова колона: само разширяване на CHECK-а върху съществуващата
-- task_type в двете таблици.
--
-- ВТОРО нещо в същия DDL, нарочно: bulletin_tasks няма 'file' и
-- 'file_comment' в CHECK-а си, а падащото меню в редактора ги предлага от
-- въвеждането на колоната files. Тоест „Потвърждение с документ" на
-- еднократна задача връща 409 и днес. Данните го потвърждават — 0 такива
-- реда в bulletin_tasks при 2 и 6 в recurring_tasks. Двата CHECK-а стават
-- ЕДНАКВИ, за да няма втори такъв капан.
--
-- Нула засегнати съществуващи реда: и двата нови списъка са НАДмножества на
-- старите. Проверено към 10.09.2026 — разпределението е info 49+6,
-- comment 2+6, photo 1+0, photo_comment 0+1, file_comment 0+2.
--
-- Задачата, която ще стане notice първа („Осчетоводяване на минуси",
-- cb008ac6-a01c-4de5-b74f-c916007263ff), се превключва РЪЧНО от
-- Администрация след деплоя — не оттук. Тя има 388 отмятания; те остават в
-- базата, но никой няма да ги брои. Връщането към 'info' ги връща в игра,
-- тоест стъпката е обратима без данни за възстановяване.

alter table public.bulletin_tasks
  drop constraint if exists bulletin_tasks_task_type_check;
alter table public.bulletin_tasks
  add constraint bulletin_tasks_task_type_check
  check (task_type = any (array[
    'info'::text, 'photo'::text, 'file'::text, 'comment'::text,
    'photo_comment'::text, 'file_comment'::text, 'notice'::text
  ]));

alter table public.recurring_tasks
  drop constraint if exists recurring_tasks_task_type_check;
alter table public.recurring_tasks
  add constraint recurring_tasks_task_type_check
  check (task_type = any (array[
    'info'::text, 'photo'::text, 'file'::text, 'comment'::text,
    'photo_comment'::text, 'file_comment'::text, 'notice'::text
  ]));

comment on column public.bulletin_tasks.task_type is
  'Вид задача. notice = „Само за информация": показва се като текст в Седмичния календар, без чекбокс, няма task_completions и не влиза в отчети, броячи и известия.';
comment on column public.recurring_tasks.task_type is
  'Вид задача. notice = „Само за информация": показва се като текст в Седмичния календар, без чекбокс, няма task_completions и не влиза в отчети, броячи и известия.';
