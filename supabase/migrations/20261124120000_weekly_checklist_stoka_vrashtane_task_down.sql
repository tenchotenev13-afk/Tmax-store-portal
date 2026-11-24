-- Rollback на 20261124120000_weekly_checklist_stoka_vrashtane_task — връща
-- stoka_vrashtane към 'module:returns' без portal_mode (както до 24.11.2026).
-- ВНИМАНИЕ: checklist.js от същия комит няма запис 'returns' в
-- CHECKLIST_MODULE_FILL — еталонът (tools/checklist-parity.js) ще се размине с
-- базата, докато кодът не се върне с git revert. checklist_portal_values() в
-- базата има собствен клон за module:returns и пак ще смята брой.
-- Замразените седмици не се преизчисляват сами.
update public.weekly_checklist_metrics
   set source = 'module:returns',
       portal_mode = null
 where key = 'stoka_vrashtane'
   and source = 'recurring:e9d418af-311a-45ec-b4da-0f9ad69205e7';
