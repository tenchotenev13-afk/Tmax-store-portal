-- weekly-checklist-schema.sql
-- Седмичен чек лист на контролинга — по обект, седмица и показател.
-- НЕ Е ПРИЛОЖЕНО. Прилага се ръчно след преглед.
--
-- Досега седмичният контрол се водеше в Excel: ред на обект, колона на
-- показател, отметка на ръка. Порталът вече знае част от отговорите
-- (постоянните задачи в Бюлетина, Каса, Стока на път), но никъде не ги
-- поставя един до друг така, както ги гледа контролингът.
--
-- ДВЕ СТОЙНОСТИ НА КЛЕТКА, НЕ ЕДНА
-- portal_value е това, което казва порталът, и се пълни автоматично —
-- НЕ се редактира от човек. control_value е това, което отмята
-- контролингът. Нарочно са две колони: съвпадат ли, клетката е потвърдена;
-- разминат ли се, разминаването е самата информация (порталът вижда
-- отметка, контролингът — не). Едно поле би стрило точно това.
--
-- ЗАЩО ОТДЕЛНА ТАБЛИЦА ЗА ПОКАЗАТЕЛИТЕ
-- weekly_checklist_metrics държи определението на колоните — етикет, тип
-- на стойността, откъде идва автоматичната част. Иначе шестте показателя
-- биха се озовали заковани в JS-а на няколко места (таб, износ, имейл) и
-- добавянето на седми би значело промяна по код. Тук е ред в базата.
--
-- store_name е ТЕКСТ, не външен ключ към stores — същата конвенция както в
-- daily_turnover, kasa_reports и bulletin таблиците. Обектите се
-- преименуват рядко; преименуват ли се, историята трябва да пази името
-- отпреди, а не да се пренапише мълчаливо.
--
-- year + week_number вместо дата на седмицата: номерът на седмицата е това,
-- което контролингът пише и говори. Годината е отделно поле, защото ISO
-- седмица 1 може да падне в декември на предходната календарна година.

-- ---------------------------------------------------------------------
-- 1. Определение на показателите
-- ---------------------------------------------------------------------
create table if not exists public.weekly_checklist_metrics (
  key        text primary key,
  label      text not null,
  sublabel   text,
  -- 'yes_no'      -> да / не
  -- 'yes_no_none' -> да / не / нямат  (обектът няма какво да отчете)
  -- 'number'      -> брой, пази се в weekly_checklist.control_num
  value_type text not null,
  -- Откъде идва portal_value:
  --   'recurring:<uuid>' -> отмятане на постоянна задача от Бюлетина
  --   'module:<id>'      -> модул на портала (id-то от showModule)
  --   'manual'           -> порталът не знае; само контролингът отмята
  source     text,
  sort_order int,
  active     boolean not null default true,

  constraint weekly_checklist_metrics_value_type_chk
    check (value_type in ('yes_no', 'yes_no_none', 'number'))
);

comment on table public.weekly_checklist_metrics is
  'Определение на колоните в седмичния чек лист. Нов показател се добавя с ред тук, не с промяна по кода.';
comment on column public.weekly_checklist_metrics.value_type is
  'yes_no | yes_no_none | number. Определя как се рендира клетката и коя колона на weekly_checklist се пълни.';
comment on column public.weekly_checklist_metrics.source is
  'recurring:<uuid> | module:<id> | manual. Откъде порталът вади portal_value. NULL или manual = не вади нищо.';
comment on column public.weekly_checklist_metrics.active is
  'false скрива показателя от новите седмици, без да трие историята му.';

-- ---------------------------------------------------------------------
-- 2. Самите отметки
-- ---------------------------------------------------------------------
create table if not exists public.weekly_checklist (
  id            uuid primary key default gen_random_uuid(),
  year          int  not null,
  week_number   int  not null,
  store_name    text not null,
  metric_key    text not null,

  -- Какво казва порталът: 'da' / 'ne' / NULL (не знае).
  -- Пълни се автоматично. НЕ се редактира от интерфейса.
  portal_value  text,

  -- Какво отмята контролингът: 'da' / 'ne' / 'nyamat' / NULL (не е гледано).
  -- 'nyamat' има смисъл само при value_type = 'yes_no_none'.
  control_value text,

  -- Само за показатели с value_type = 'number' (сторна за приемане).
  control_num   numeric,

  comment       text,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint weekly_checklist_uniq
    unique (year, week_number, store_name, metric_key),

  constraint weekly_checklist_week_chk
    check (week_number between 1 and 53),

  -- on update cascade: преименуван ключ на показател влече редовете си.
  -- Изтриване НЕ каскадира нарочно — показател с история се изключва с
  -- active = false, не се трие.
  constraint weekly_checklist_metric_fk
    foreign key (metric_key) references public.weekly_checklist_metrics(key)
    on update cascade
);

-- Основната заявка на таба е „една седмица, всички обекти".
create index if not exists weekly_checklist_week_idx
  on public.weekly_checklist (year, week_number);
-- Историята на един обект през седмиците.
create index if not exists weekly_checklist_store_idx
  on public.weekly_checklist (store_name, year, week_number desc);

comment on table public.weekly_checklist is
  'Седмичен чек лист на контролинга: по обект, седмица и показател. portal_value е автоматично, control_value е ръчно.';
comment on column public.weekly_checklist.portal_value is
  'da | ne | NULL. Какво вижда порталът. Пълни се автоматично, не се редактира.';
comment on column public.weekly_checklist.control_value is
  'da | ne | nyamat | NULL. Какво отмята контролингът. Разминаване с portal_value е информацията, не грешка.';
comment on column public.weekly_checklist.control_num is
  'Числовата стойност при value_type = number. При останалите типове стои NULL.';
comment on column public.weekly_checklist.updated_at is
  'Задава се от клиента при всеки запис. Няма тригер — default now() важи само за вмъкването.';

-- Домейнът на portal_value / control_value НАРОЧНО не е закован с CHECK.
-- Допустимите стойности зависят от value_type, който живее в другата
-- таблица; CHECK не може да го погледне, а изброяване на обединението
-- ('da','ne','nyamat') би върнало точно това, което metrics таблицата е
-- създадена да махне от кода — списък, чието разширяване иска миграция.
-- Проверката остава в клиента, срещу value_type на съответния показател.

-- ---------------------------------------------------------------------
-- 3. RLS — както другите таблици в проекта
-- ---------------------------------------------------------------------
alter table public.weekly_checklist_metrics enable row level security;
drop policy if exists anon_all_weekly_checklist_metrics on public.weekly_checklist_metrics;
create policy anon_all_weekly_checklist_metrics on public.weekly_checklist_metrics
  for all using (true) with check (true);

alter table public.weekly_checklist enable row level security;
drop policy if exists anon_all_weekly_checklist on public.weekly_checklist;
create policy anon_all_weekly_checklist on public.weekly_checklist
  for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4. Началните шест показателя
-- ---------------------------------------------------------------------
-- UUID-тата в source са сверени срещу public.recurring_tasks на 01.09.2026
-- и са на АКТИВНИТЕ задачи. „Ревизии 953" е с три реда там — два неактивни
-- (e80f06ec…, e83f53fa…) и един активен; взет е активният. Пресъздаде ли се
-- задача, source се обновява с update тук, не в кода.
--
-- Етикетите и подетикетите са ДУМА ПО ДУМА от бланката на контролинга,
-- включително непоследователната главна буква и разредката („Стока за
-- връщане- ТАБЛИЦИ"). Не се „подравняват" — бланката е това, което хората
-- разпознават, и разминаване в изписването изглежда като друг показател.
insert into public.weekly_checklist_metrics (key, label, sublabel, value_type, source, sort_order)
values
  ('revizia_953',     'ревизия',                   '953',                          'yes_no',
   'recurring:74da41e4-494f-48cc-a434-79bfc04fc243', 1),
  ('spravka_minusi',  'справка минуси',            'подадено в срок/правилно',     'yes_no',
   'recurring:03c44560-9572-4274-ad53-5228d61b4de7', 2),
  -- ⚠️ ВРЪЗКАТА НЕ Е ПОТВЪРДЕНА. На същия слот (due_weekday = 2, 20:00)
  -- седят ТРИ активни постоянни задачи, две от които носят „стока за
  -- връщане" в заглавието — от бланката не личи коя се има предвид:
  --   0a20f6e8… „Списък стока за връщане"                       ← взета тук
  --   31351174… „Стока за връщане/ срок на годност/ рекламации"
  --   e9d418af… „Списък стока за изтегляне по разлики"
  -- Сверява се с контролинга ПРЕДИ portal_value да тръгне да се пълни;
  -- дотогава показателят работи като ръчен.
  ('stoka_vrashtane', 'Стока за връщане- ТАБЛИЦИ', 'подадено в срок',              'yes_no',
   'recurring:0a20f6e8-c526-400b-bed5-57194f35e4e5', 3),
  ('storna_priem',    'Сторна по грешни приеми',   'брой сторнирани поръчки/позиции', 'number',
   'module:kasa',    4),
  ('stoka_na_pat',    'стока на път',              'подадено в срок',              'yes_no',
   'module:transit', 5),
  -- Легенда от бланката — трите стойности НЕ са симетрични и „не" не значи
  -- „няма преоценка":
  --   да    = има изпратена преоценка
  --   не    = от магазина не са писали, че няма
  --   нямат = не са подавали, но магазинът е писал, че няма
  -- Тоест „не" наказва мълчанието, а „нямат" е редовно отчетена нула.
  -- Затова типът е yes_no_none, а не yes_no.
  ('preocenka',       'преоценка',                 'подадено в срок/правилно',     'yes_no_none',
   'manual',         6)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- ОТКАТ (при нужда)
-- ---------------------------------------------------------------------
-- Обратимо без загуба само докато таблиците са празни. След първата
-- попълнена седмица откатът ТРИЕ данни на контролинга — тогава не е
-- рутинна операция и иска отделно решение.
--
-- drop table if exists public.weekly_checklist;
-- drop table if exists public.weekly_checklist_metrics;
