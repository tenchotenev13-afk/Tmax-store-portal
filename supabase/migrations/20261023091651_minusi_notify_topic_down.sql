-- Rollback на 20261023091651_minusi_notify_topic — маха темата и дневника ѝ.
-- bulletin-notify без реда в notification_topics просто не я пуска
-- (кронът чете активните теми); строителят в кода остава безвреден.
delete from public.notification_log where topic_key = 'minus_unfilled';
delete from public.notification_topics where key = 'minus_unfilled';
