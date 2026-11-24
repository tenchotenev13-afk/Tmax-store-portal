-- Rollback на 20261123140000_weekly_checklist_label_razliki.
update public.weekly_checklist_metrics
   set label = 'Разлики от доставка'
 where key = 'razliki_dostavka' and label = 'Разлики логистични складове';
