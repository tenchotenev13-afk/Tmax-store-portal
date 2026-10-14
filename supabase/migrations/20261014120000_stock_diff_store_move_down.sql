-- Rollback на 20261014120000_stock_diff_store_move
--
-- Връща stock_diff_store_done ДОСЛОВНО както е живо на 14.10.2026 преди
-- миграцията (сверено с pg_get_functiondef): 'sent' / 'sent_sap' / 'return'
-- са ход на обекта, без изключение по категория. Коментарът на функцията —
-- също дословно. Отметките, дадени междувременно, ОСТАВАТ (функцията за
-- синхронизация само добавя от 13.10.2026). Правата не се променят:
-- create or replace пази ACL-а (postgres, service_role).

create or replace function public.stock_diff_store_done(p_store text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select not exists (
    /* 1. Складът е отговорил, обектът още не. 'will_send' не влиза — стоката
          още не е тръгнала; NULL не влиза — чака СКЛАДА; store_response
          'no_stock' вече е отговор, тоест ходът е на склада. */
    select 1
      from stock_differences d
      join differences_reports r on r.id = d.report_id
     where r.store_name = p_store
       and not coalesce(r.reviewed, false)
       and r.direction = 'interstore'
       and d.warehouse_response in ('sent','sent_sap','return')
       and d.store_response is null
       and coalesce(d.status, '') <> 'received'
    union all
    /* 2. Размяна, по която ходът е на обекта. И двете условия се искат —
          редът да е в НЕГОВА бланка И той да е съответната страна — точно
          както порталът пресича myMove с редовете на бланката.
          НЕПРОВЕРЕНО НА РЕАЛНИ ДАННИ: stock_diff_swaps е празна таблица
          (0 реда на 04.10.2026). Клонът е тестван само с fixture в
          транзакция. */
    select 1
      from stock_diff_swaps sw
      join stock_differences d
        on d.id = case when sw.status = 'linked' then sw.from_line_id else sw.to_line_id end
      join differences_reports r on r.id = d.report_id
     where r.store_name = p_store
       and not coalesce(r.reviewed, false)
       and r.direction = 'interstore'
       and ((sw.status = 'linked' and sw.from_store = p_store)
         or (sw.status = 'sent'   and sw.to_store   = p_store)));
$function$;

comment on function public.stock_diff_store_done(text) is
  'Има ли обектът ред, чакащ НЕГОВОТО действие по междускладова разлика: непрегледана бланка, складът е отговорил sent/sent_sap/return, обектът не е отговорил и редът не е приключен; или размяна, по която ходът е негов. true = няма такъв ред (включително когато обектът няма разлики изобщо). will_send, празен отговор на склада и store_response=no_stock НЕ се броят — там ходът е на склада. Дословният близнак на sdUnreviewedCountFor() в stock-differences.js.';
