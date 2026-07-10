-- Добавя поле за снимки/файлове към задачите в бюлетина (bulletin_tasks)
-- Формат: масив от {type:'image'|'file', url, filename}
alter table bulletin_tasks add column if not exists attachments jsonb default '[]'::jsonb;
