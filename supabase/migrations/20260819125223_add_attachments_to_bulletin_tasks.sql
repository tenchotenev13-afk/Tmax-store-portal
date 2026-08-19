-- 20260819125223_add_attachments_to_bulletin_tasks.sql
-- ОПИСВА ЗАВАРЕНО СЪСТОЯНИЕ, не нова промяна. Колоната е жива в базата
-- отпреди тази папка да съществува; версията в името казва кога е записана
-- тук, не кога колоната се е появила.
-- Източник: supabase/legacy-notes/bulletin-task-attachments-schema.sql
-- Формат на стойността: масив от {type:'image'|'file', url, filename}
alter table public.bulletin_tasks
  add column if not exists attachments jsonb default '[]'::jsonb;
