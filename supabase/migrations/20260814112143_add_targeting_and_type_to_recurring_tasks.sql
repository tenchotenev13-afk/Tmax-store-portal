alter table recurring_tasks add column target_stores text[];
alter table recurring_tasks add column task_type text not null default 'info' check (task_type in ('info','photo','comment','photo_comment'));
alter table recurring_tasks add column report_groups text[];
alter table recurring_tasks add column linked_module text;
