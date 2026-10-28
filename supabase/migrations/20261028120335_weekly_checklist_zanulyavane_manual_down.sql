-- Rollback на 20261028120335_weekly_checklist_zanulyavane_manual — връща
-- връзката на zanulyavane_lm със „ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М." (както от 23.10).
-- Изчистените portal_value в седмици 40–43 (72 реда) НЕ се връщат — стойностите
-- са в claude/log/2026-10-28-checklist-zanulyavane-manual.md. Замразените
-- седмици не се преизчисляват сами (checklist_freeze_week пише само при
-- затваряне), а живите (44+) пак ще идват от checklist_portal_values().
update public.weekly_checklist_metrics
   set source = 'recurring:72aed3fc-1720-4205-be89-feb242b2627f',
       portal_mode = 'any',
       sublabel = 'бланка Зареждане или „нямам нужда“'
 where key = 'zanulyavane_lm';
