-- ПОПРАВКА НА ДАННИ: &amp; в адреса на [текст](адрес)
--
-- Причина: bulDescPaste() в bulletin.js вадеше href с регекс от СУРОВИЯ HTML на
-- клипборда, където `&` е `&amp;`. Текстът на линка се разкодираше през DOM,
-- адресът — не. Записваше се „…?e=4&amp;at=9&amp;resid=…", после linkify() го
-- ескейпваше пак и в href оставаше `&amp;` → OneDrive/SharePoint отговаряха
-- „Този елемент може да не съществува". Кодът е поправен в d6626fc (getAttribute
-- през DOMParser); тук се чистят редовете, писани преди това.
--
-- Обхват: ТРИ реда, всичките от 28.09.2026 — намерени с
--   description ~ '\[[^\]]*\]\([^)]*&amp;[^)]*\)'
-- през bulletin_tasks, recurring_tasks, recurring_task_versions и task_subtasks:
--   · bulletin_tasks „Контакти Темакс"                        — 6 срещания
--   · recurring_task_versions „СПИСЪК СТОКА ЗА ВРЪЩАНЕ"        — 1
--   · recurring_task_versions „СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ" — 4
-- Базовите редове на двете постоянни задачи са ЧИСТИ (там адресът стои като гол
-- линк, старият стил), и нито един блок в нито един бюлетин не е засегнат
-- (проверено по bulletins.content за трите колони).
--
-- ЗАЩО е достатъчен прост replace: и в трите реда ВСИЧКИ `&amp;` са вътре в
-- адреса — броят им в описанието съвпада с броя им в частта `](…)`. Затова
-- WHERE-ът го проверява САМ: мине ли редакция междувременно, която внесе `&amp;`
-- в текста, условието не се изпълнява и редът не се пипа, вместо да се повреди.
-- Следствие: миграцията е идемпотентна — второ пускане не хваща нищо.
--
-- Rollback: 20260928124500_fix_amp_in_desc_links_down.sql (прочети коментара
-- там — обратният ход е по-груб от този и е за авария, не за рутина).

update bulletin_tasks
   set description = replace(description, '&amp;', '&')
 where id = '9a7f1104-55d0-47b8-8b19-0a39857eb7e3'
   and description ~ '\[[^\]]*\]\([^)]*&amp;[^)]*\)'
   and (length(description) - length(replace(description, '&amp;', '')))/5
     = (select coalesce(sum((length(u[1]) - length(replace(u[1], '&amp;', '')))/5), 0)
          from regexp_matches(description, '\]\(([^)]*)\)', 'g') u);

update recurring_task_versions
   set description = replace(description, '&amp;', '&')
 where id in ('22e9a61f-bb61-410d-afbb-6f6eaac698ab',
              '1919a8dd-ebfd-4e35-84cc-bcac80e0eff8')
   and description ~ '\[[^\]]*\]\([^)]*&amp;[^)]*\)'
   and (length(description) - length(replace(description, '&amp;', '')))/5
     = (select coalesce(sum((length(u[1]) - length(replace(u[1], '&amp;', '')))/5), 0)
          from regexp_matches(description, '\]\(([^)]*)\)', 'g') u);
