-- 20261014120000_stock_diff_store_move
-- Огледало: stock-diff-auto-complete-schema.sql (обяснението е там).
-- Rollback: 20261014120000_stock_diff_store_move_down.sql
--
-- Решение на Тенчо, 14.10.2026 (стъпка 1 от 3): кое е „ход на обекта" за
-- „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ".
--   (а) warehouse_response 'sent' / 'sent_sap' вече НЕ е ход на обекта —
--       стоката е на път (дни, до седмица), а единственият отговор на обекта
--       е „прието", тоест той не може да го даде, преди тя да пристигне.
--       'return' остава негов ход — на него обектът отговаря веднага.
--   (б) ред с difference_category 'wrong_barcode' / 'similar_item' НЕ е ход
--       на обекта, независимо от отговора на склада — по инструкцията той
--       зависи от ЦО (ZPACK/баркод). Временно изцяло, докато стъпка 2 не
--       добави отговор на ЦО на реда.
-- Клон 2 (размени) — без промяна. Нова таблица/колона няма. Правата не се
-- пипат: create or replace пази ACL-а (postgres, service_role).

create or replace function public.stock_diff_store_done(p_store text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select not exists (
    /* 1. Складът е отговорил „връщане", обектът още не. 'will_send' не
          влиза — стоката още не е тръгнала; NULL не влиза — чака СКЛАДА;
          store_response 'no_stock' вече е отговор, тоест ходът е на склада.
          'sent' / 'sent_sap' НЕ влизат (от 14.10.2026): стоката е на път,
          обектът може да отговори само „прието", когато тя пристигне.
          Категориите 'wrong_barcode' / 'similar_item' НЕ влизат (от
          14.10.2026): чакат ЦО (ZPACK/баркод). Стъпка 2 ще ги върне като
          „срещу обекта след отговор на ЦО". */
    select 1
      from stock_differences d
      join differences_reports r on r.id = d.report_id
     where r.store_name = p_store
       and not coalesce(r.reviewed, false)
       and r.direction = 'interstore'
       and d.warehouse_response in ('return')
       and d.store_response is null
       and coalesce(d.status, '') <> 'received'
       and coalesce(d.difference_category, '') not in ('wrong_barcode','similar_item')
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
  'Има ли обектът ред, чакащ НЕГОВОТО действие по междускладова разлика: непрегледана бланка, складът е отговорил return, обектът не е отговорил, редът не е приключен и категорията не е wrong_barcode/similar_item; или размяна, по която ходът е негов. true = няма такъв ред (включително когато обектът няма разлики изобщо). will_send, празен отговор на склада и store_response=no_stock НЕ се броят — там ходът е на склада. sent/sent_sap НЕ се броят от 14.10.2026 — стоката е на път; wrong_barcode/similar_item НЕ се броят от 14.10.2026 — чакат ЦО. От 14.10.2026 НЕ е дословен близнак на sdUnreviewedCountFor() — балончето на таба още брои sent/sent_sap.';
