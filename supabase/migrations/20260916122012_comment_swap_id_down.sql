-- Rollback на 20260916122012_comment_swap_id.sql
--
-- Връща първоначалния коментар от 20260916090050_stock_diff_swaps, дума по
-- дума (сверен с базата преди промяната на 16.09.2026). Само текст.

comment on column public.stock_differences.swap_id is 'Отворената размяна, в която редът е ЛИПСА (to_line_id). Ред с излишък може да захрани няколко размени - те се търсят през stock_diff_swaps.from_line_id.';
