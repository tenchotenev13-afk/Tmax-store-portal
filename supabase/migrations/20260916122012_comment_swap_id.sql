-- Коментар на stock_differences.swap_id: размяната, в която редът е ЛИПСА -
-- последната, отворена ИЛИ затворена.
--
-- Решение 16.09.2026: при приключване (sdCloseSwap) swap_id НЕ се чисти и
-- остава като история. Първоначалният коментар от
-- 20260916090050_stock_diff_swaps казваше "Отворената размяна..." и вече
-- не беше верен. Промяна само на текст: колони и данни не се пипат,
-- огледалото (Живко) не се засяга.
--
-- SQL-ът отдолу е сверен машинно (md5 + дължина) със statements в
-- supabase_migrations.schema_migrations.
-- Rollback: supabase/migrations/20260916122012_comment_swap_id_down.sql

comment on column public.stock_differences.swap_id is 'размяната, в която редът е липса — последната; отворена или затворена';
