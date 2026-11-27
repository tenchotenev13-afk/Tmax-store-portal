-- razliki-return-sync-schema.sql — „Връщане" се отбелязва на ЕДНО място
-- (26.11.2026, сесия razliki-vrashtane-edno-myasto).
--
-- Решение на Тенчо 26.11.2026 по предложение на склад Раднево (писмо
-- 25.11.2026): обектът отбелязва връщането към доставчик САМО в „За връщане →
-- По разлики"; редът в „Разлики" го следва сам. Връзката е
-- stock_returns.diff_line_id (без външен ключ).
--
-- AFTER UPDATE OF status върху stock_returns, ред по ред, само за ред с
-- diff_line_id и реална смяна на статуса:
--   * → 'taken' / 'completed' (от друго): свързаният ред в stock_differences,
--     ако е type 'return' и status 'pending' → status 'taken',
--     completed_at = now(), completed_by = 'За връщане'.
--     В stock_returns няма колона „кой смени статуса" (confirmed_by е за
--     датата на актуализация и се пише само когато тя се мени), затова
--     completed_by е само 'За връщане', без име.
--   * 'taken' / 'completed' → 'pending': свързаният ред се връща на 'pending'
--     с completed_by/at = null САМО ако completed_by започва с 'За връщане'
--     (ред, отбелязан ръчно в Разлики, не се пипа).
--   * друг тип в Разлики, 'received', 'completed', липсващ ред → нищо, без грешка.
--   * 'completed' в „За връщане" НЕ става 'completed' в Разлики — само 'taken'.
--
-- Заварените тригери (сверени 26.11.2026) — няма кръг:
--   stock_returns_sync_ins/upd/del  (statement, stock_returns_sync_trg)
--     → stock_returns_sync_completions(store) — пише САМО task_completions.
--   stock_diff_sync_lines_ins/upd/del (statement, stock_diff_sync_lines_trg)
--     → stock_diff_sync_completions(store) — пише САМО task_completions
--       (insert … do nothing, никога delete). Промяната на status тук го
--       задейства — желано: авто-отметката „stock-diff" се пресмята наново.
--       stock_diff_store_done не гледа status на тип 'return' (гледа
--       warehouse_response/store_response на междускладови), тоест
--       отметката не се губи и не се появява заради този тригер.
--   stock_returns_strip_dash (BEFORE, ред) — не засяга status.
--   Нито една от функциите не пише в stock_returns → тригерът не се върти.
--
-- Схема (колони) — без промяна → за огледалото: „само тригер и промяна в
-- данни, без промяна за огледалото".
--
-- ROLLBACK:
--   drop trigger if exists razliki_return_sync on public.stock_returns;
--   drop function if exists public.razliki_return_sync_trg();

create or replace function public.razliki_return_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status in ('taken', 'completed')
     and coalesce(old.status, '') not in ('taken', 'completed') then
    update stock_differences d
       set status = 'taken', completed_at = now(), completed_by = 'За връщане'
     where d.id = new.diff_line_id
       and d.type = 'return'
       and d.status = 'pending';
  elsif new.status = 'pending'
        and old.status in ('taken', 'completed') then
    update stock_differences d
       set status = 'pending', completed_at = null, completed_by = null
     where d.id = new.diff_line_id
       and d.type = 'return'
       and d.status = 'taken'
       and d.completed_by like 'За връщане%';
  end if;
  return null;
end
$fn$;

revoke all on function public.razliki_return_sync_trg() from public, anon, authenticated;

drop trigger if exists razliki_return_sync on public.stock_returns;
create trigger razliki_return_sync
  after update of status on public.stock_returns
  for each row
  when (new.diff_line_id is not null and old.status is distinct from new.status)
  execute function public.razliki_return_sync_trg();
