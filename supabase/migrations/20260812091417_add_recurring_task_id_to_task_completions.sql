alter table task_completions add column recurring_task_id uuid references recurring_tasks(id);
