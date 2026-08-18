alter table task_completions add column status text not null default 'done' check (status in ('done','postponed'));
