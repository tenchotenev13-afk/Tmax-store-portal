update task_completions tc
set completion_date = bt.due_date
from bulletin_tasks bt
where tc.task_id = bt.id and tc.completion_date is null and bt.due_date is not null;
