-- minusi-reasons-v2-data.sql — Минуси: нов списък с причини (06.11.2026, сесия
-- minusi-reasons-v2). Файл на Миглена 06.11, лист „за корекции“; решения на
-- Тенчо 06.11. Приложена на 06.11.2026 като миграция 20261106145433
-- (minusi_reasons_v2_data). САМО ДАННИ в minus_reasons — нова таблица / колона / статус няма,
-- затова ред в zhivko-opashka.md няма.
--
-- Какво:
--   · 8 преименувания (label) — флаговете (excluded_from_revision, requires_note,
--     sort) НЕ се пипат. 1 „Клиентска поръчка“ остава requires_note = true
--     (решение на Тенчо: когато заявката не е в портала, бележката е единственият
--     запис) и excluded_from_revision = true; 5 и 9 — excluded остава true.
--   · 3 отпадат: active = false (НЕ се трият — стари редове ги ползват).
--     Неактивна причина не се предлага в падащото меню на нов ред, но ред, който
--     вече я има, я показва и може да се запише с нея (minusi.js, mnRender).
--   · 6 нови: active = true, excluded_from_revision = false (ПРЕДПОЛОЖЕНИЕ — чака
--     потвърждение, claude/open/06-11-minusi-reasons-flag.md), requires_note =
--     false, sort 20–25 (след съществуващите). id-тата в базата НЕ следват sort
--     (insert … select от values): 24 Отразен минус на ревизия, 21 Наличие на два
--     баркода, 23 Грешно разчетен баркод, 22 Част от комплект, 25 Преналепен
--     артикул, 20 Грешно надписан/прочетен код — менюто е по sort, затова е без значение.
--
-- Предпазители: всеки UPDATE е по id И по сегашния label — ако някой е сменил
-- етикета междувременно, редът не се пипа (0 реда вместо чужда промяна). INSERT —
-- само ако етикетът още го няма.
--
-- ЗАВАРЕНИ ДАННИ (правило 9, 06.11.2026): minus_movements с reason_id 3 — 25,
-- 11 — 2, 16 — 36 реда. Не се пипат; етикетът им се чете по id и остава видим.
--
-- ROLLBACK (връща точно стойностите от 06.11.2026 преди промяната):
--   update public.minus_reasons set label = 'клиентска поръчка (номер/дата)'          where id = 1  and label = 'Клиентска поръчка';
--   update public.minus_reasons set label = 'последна бройка, липсва код'             where id = 2  and label = 'Реална продажба – последно количество';
--   update public.minus_reasons set label = 'има още количество, липсва код'          where id = 4  and label = 'Има още налично количество';
--   update public.minus_reasons set label = 'реална продажба, чака вход от ЛСТ'       where id = 5  and label = 'Реална продажба, чака входяща доставка';
--   update public.minus_reasons set label = 'грешен баркод, не е преналепено'         where id = 8  and label = 'Не е преналепено';
--   update public.minus_reasons set label = 'разлика т-ще'                            where id = 9  and label = 'Разлики логистичен склад/доставчик';
--   update public.minus_reasons set label = 'заметнати с другия цвят'                 where id = 15 and label = 'Заметнат с друг цвят, размер, съседен артикул на регал';
--   update public.minus_reasons set label = 'продаден преди да се заведе, имаме го'   where id = 19 and label = 'Извадено в търговска зала преди да се заприходи';
--   update public.minus_reasons set active = true where id in (3, 11, 16) and active = false;
--   delete from public.minus_reasons r
--    where r.label in ('Отразен минус на ревизия',
--                      'Наличие на два баркода на оригиналната опаковка',
--                      'Грешно разчетен баркод от четеца на касата',
--                      'Част от комплект маркиран самостоятелно',
--                      'Преналепен артикул, етикетът прозира и четецът разчита грешния',
--                      'Грешно надписан/прочетен код на артикул, идващ без собствен етикет')
--      and not exists (select 1 from public.minus_movements m where m.reason_id = r.id);
--   -- Нова причина, вече ползвана в minus_movements, НЕ се трие (delete-ът я
--   -- пропуска) — тогава вместо това: update … set active = false where id = <id>.

update public.minus_reasons set label = 'Клиентска поръчка'                                       where id = 1  and label = 'клиентска поръчка (номер/дата)';
update public.minus_reasons set label = 'Реална продажба – последно количество'                   where id = 2  and label = 'последна бройка, липсва код';
update public.minus_reasons set label = 'Има още налично количество'                              where id = 4  and label = 'има още количество, липсва код';
update public.minus_reasons set label = 'Реална продажба, чака входяща доставка'                  where id = 5  and label = 'реална продажба, чака вход от ЛСТ';
update public.minus_reasons set label = 'Не е преналепено'                                        where id = 8  and label = 'грешен баркод, не е преналепено';
update public.minus_reasons set label = 'Разлики логистичен склад/доставчик'                      where id = 9  and label = 'разлика т-ще';
update public.minus_reasons set label = 'Заметнат с друг цвят, размер, съседен артикул на регал'  where id = 15 and label = 'заметнати с другия цвят';
update public.minus_reasons set label = 'Извадено в търговска зала преди да се заприходи'         where id = 19 and label = 'продаден преди да се заведе, имаме го';

update public.minus_reasons set active = false
 where (id, label) in ((3, 'продажба на цялото количество, липсва код'),
                       (11, 'грешно въведен код от касиер'),
                       (16, 'заметнати със съседните'));

insert into public.minus_reasons (label, active, excluded_from_revision, requires_note, sort)
select v.label, true, false, false, v.sort
  from (values ('Отразен минус на ревизия', 20),
               ('Наличие на два баркода на оригиналната опаковка', 21),
               ('Грешно разчетен баркод от четеца на касата', 22),
               ('Част от комплект маркиран самостоятелно', 23),
               ('Преналепен артикул, етикетът прозира и четецът разчита грешния', 24),
               ('Грешно надписан/прочетен код на артикул, идващ без собствен етикет', 25)) as v(label, sort)
 where not exists (select 1 from public.minus_reasons r where r.label = v.label);
