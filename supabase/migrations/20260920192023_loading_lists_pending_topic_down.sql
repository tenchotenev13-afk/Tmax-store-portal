-- Rollback на 20260920192023_loading_lists_pending_topic.sql
--
-- Маха реда на темата. Записите в notification_log с този topic_key остават
-- НАРОЧНО: те са история „на кого какво е пратено" и триенето им значи, че
-- връщането на темата ще напомни втори път за листи, за които вече е
-- напомнено. Ако редът наистина трябва да си отиде:
--   delete from public.notification_log where topic_key = 'loading_lists_pending';
--
-- Редовете в notification_matrix / notification_overrides за този ключ също
-- остават — те са нечия настройка от Администрация, не част от миграцията.
-- При повторно прилагане тя се връща в сила такава, каквато е била.
--
-- По-мекият вариант, ако целта е само да спре да праща:
--   update public.notification_topics set active = false where key = 'loading_lists_pending';
-- Той пази настройките и историята и е обратим с един ред.

delete from public.notification_topics where key = 'loading_lists_pending';
