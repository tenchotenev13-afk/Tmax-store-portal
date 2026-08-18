alter table bulletin_tasks add column task_type text not null default 'info' check (task_type in ('info','photo','comment','photo_comment'));
alter table task_completions add column comment text;
alter table task_completions add column photos jsonb;
