-- Чек лист: пълната бланка на контролинга — 12 колони (28.09.2026).
-- Само данни в weekly_checklist_metrics, без DDL. Rollback: *_down.sql.

-- 1. Ревизия група / групи — от постоянната задача „РЕВИЗИЯ ГРУПИ" (Пон–Сря).
update public.weekly_checklist_metrics
   set source = 'recurring:0d668f1a-a8df-40ff-ab8f-ebf6b9d9acc4', active = true
 where key = 'revizia_grupi';

-- 2. Сторна по грешни приеми — бланките от Разлики с посока wrong_receipt.
update public.weekly_checklist_metrics
   set source = 'module:wrong_receipt'
 where key = 'storna_priem';

-- 3. Преоценка — от „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА" (file_comment, без дни).
update public.weekly_checklist_metrics
   set source = 'recurring:a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6'
 where key = 'preocenka';

-- 4. Пет ръчни колони — контролингът ги отмята да/не.
insert into public.weekly_checklist_metrics (key, label, sublabel, value_type, source, sort_order, active)
values
  ('razhodi',           'разходи',                    null, 'yes_no', 'manual', 5, true),
  ('zanulyavane_lm',    'таблица зануляване л.м.',    null, 'yes_no', 'manual', 6, true),
  ('razliki_dostavka',  'Разлики от доставка',        null, 'yes_no', 'manual', 7, true),
  ('srok_godnost',      'Срок на годност/рекламации', null, 'yes_no', 'manual', 8, true),
  ('dogovoreni_returi', 'Договорени ретури',          null, 'yes_no', 'manual', 9, true);

-- 5. Подредбата на бланката.
update public.weekly_checklist_metrics m
   set sort_order = v.ord
  from (values
    ('revizia_953', 1), ('revizia_grupi', 2), ('spravka_minusi', 3), ('stoka_vrashtane', 4),
    ('razhodi', 5), ('zanulyavane_lm', 6), ('razliki_dostavka', 7), ('srok_godnost', 8),
    ('dogovoreni_returi', 9), ('storna_priem', 10), ('stoka_na_pat', 11), ('preocenka', 12)
  ) as v(key, ord)
 where m.key = v.key;
