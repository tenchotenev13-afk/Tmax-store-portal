-- Приложено в Supabase на 20.09.2026, проект xiwkdiqqplgdcrkewgtv
-- Миграция: loading_missing (version 20260920142158) — Пакет А „Неполучен по ред"
--
-- Файлът е записан СЛЕД прилагането. Обратното четене потвърди:
--   loading_lists_status_check =
--     CHECK ((status = ANY (ARRAY['draft'::text,'sent'::text,'done'::text,'partial'::text])))
--   loading_list_items: missing boolean NOT NULL default false,
--                       missing_by text NULL, missing_at timestamptz NULL
--
-- Нови колони + разширен CHECK → огледалото (Живко): mirror-schema.sql и
-- $TableColumns за loading_list_items в sync-mirror.ps1. Бележката е в
-- claude/loading-lists-missing-2026-09-20.md.
-- Копие на DDL-а в корена: loading-lists-missing-schema.sql
--
-- Rollback: supabase/migrations/20260920142158_loading_missing_down.sql
--
-- Правило 9 (проверено непосредствено преди прилагане):
--   loading_list_items — 0 реда общо → 0 стават невалидни от not null default;
--   loading_lists      — 0 реда общо (group by status върна ПРАЗЕН резултат);
--   разширеният CHECK е надмножество на стария (draft|sent|done ⊂
--   draft|sent|done|partial), тоест не може да обезсили заварен ред дори да
--   имаше такива.
-- Имената missing / missing_by / missing_at бяха свободни в loading_list_items
-- (заварени 21 колони, нито една с това име).
--
-- ЗНАЕ СЕ И НЕ СЕ НАЛАГА ОТ БАЗАТА: взаимното изключване на missing и
-- received НЯМА check. Нарочно — огледалото на Живко копира редове през
-- PostgREST и CHECK от страната на огледалото би отхвърлял редове, които в
-- Supabase са минали. Правилото „или отметнат, или неполучен, не и двете"
-- живее в клиента (llMarkReceived / llMarkMissing в loading.js). Следствие:
-- базата приема missing = true и received = true едновременно; разминаването
-- няма да гръмне, а ще се види като грешно число в справка. Всяка справка
-- „колко са неполучените" пише `missing and not received`, не само `missing`.
--
-- ЗАЩО 'partial' е на ЛИСТА, а loading_list_items.partial е на РЕДА — две
-- различни неща с една и съща дума. Колоната items.partial (03.09.2026) значи
-- „с този товар тръгва само част от стоковия документ" и пази goods_transit
-- да не се затвори. Новият статус partial значи „листът е приключен, но част
-- от редовете са маркирани като неполучени". Не се извеждат един от друг.
--
-- Индексът loading_list_items_store_idx е по (store_name, received) и НЕ
-- обслужва заявка по missing. Нов индекс по (store_name, missing) е възможен,
-- но при 0 реда няма измерима полза, а е още нещо за огледалото — отделно
-- решение, не рутина.

alter table public.loading_list_items
  add column missing    boolean not null default false,
  add column missing_by text,
  add column missing_at timestamptz;

comment on column public.loading_list_items.missing is
  'Обектът заявява, че редът НЕ е пристигнал. Огледално на received и взаимно изключващо се с него — но БЕЗ check в базата (огледалото на Живко копира редове през PostgREST); правилото живее в клиента (loading.js).';
comment on column public.loading_list_items.missing_by is
  'Кой е маркирал реда като неполучен. Пълни се от клиента в момента на маркирането — тригер няма, както при received_by.';
comment on column public.loading_list_items.missing_at is
  'Кога е маркиран като неполучен. Пълни се от клиента заедно с missing_by.';

alter table public.loading_lists
  drop constraint loading_lists_status_check;

alter table public.loading_lists
  add constraint loading_lists_status_check
    check (status in ('draft', 'sent', 'done', 'partial'));

comment on column public.loading_lists.status is
  'draft | sent | done | partial. draft е видим само за склада; от sent нататък обектите виждат своите редове. partial = приключен лист, в който има редове с missing = true.';
