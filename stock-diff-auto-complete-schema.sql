-- stock-diff-auto-complete-schema.sql
-- Автоматично отмятане на постоянната задача „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ"
-- (recurring_tasks.linked_module = 'stock-diff') от данните в „Разлики".
--
-- ⚠ ПОДГОТВЕНО, НЕ Е ПРИЛОЖЕНО към 04.10.2026 — чака изрично потвърждение.
-- Миграция: supabase/migrations/20261004..._stock_diff_auto_complete.sql
--
-- ЗАЩО
-- Задачата се отмята или от sdMarkDiffTask (всяко действие на обекта по вече
-- подадена бланка), или ръчно — и в базата двете са НЕРАЗЛИЧИМИ: completed_by
-- е името на човека в двата случая. Следствието е измерено за 01.10.2026:
--   · 13 от 18 обекта са отметнати;
--   · девет от тези 13 са имали редове, чакащи ТЯХНОТО действие (Силистра 18,
--     Враца 17, Дупница 14, Троян 5, Търговище 2, Добрич 2, Козлодуй, Монтана,
--     Кърджали по 1);
--   · четири от петте неотметнати не са имали НИЩО чакащо (Гоце Делчев,
--     Раднево, Севлиево, Сливен) — наказани без причина;
--   · вярна е била само 5 от 18 (Габрово, Карлово, Петрич, Шумен — чисти и
--     отметнати; Пирдоп — с 5 чакащи и неотметнат).
-- Числата за 01.10 са ОЦЕНКА, не точно число: няма warehouse_response_at и
-- няма reviewed_at, тоест кога складът е отговорил и кога бланката е прегледана
-- не се знае. Условието е приложено към днешното състояние на редовете с
-- отрязване по store_response_at / completed_at / resolved_at.
--
-- Днешният sdMarkDiffTask е и ПО-ШИРОК от името на задачата: три от осемте му
-- извиквания (📎 документ към ред, 📷 снимка към бланка, корекция на
-- количества) важат за ВСЯКА посока, включително доставчикова бланка. Тоест
-- задачата „логистични складове" се отмяташе и от закачена снимка по
-- доставчикова разлика.
--
-- ПРАВИЛОТО за обект X и ден D
--   изпълнено ⇔ в момента на проверката НЯМА ред, чакащ действие на X.
-- „Ред, чакащ действие на обекта" е ДОСЛОВНО условието, по което порталът вече
-- брои балончето на таба (sdUnreviewedCountFor, клонът за магазин):
--   бланката е непрегледана, междускладова и на този обект, И
--     · складът е отговорил 'sent' / 'sent_sap' / 'return',
--       обектът още не е отговорил (store_response IS NULL)
--       и редът не е приключен (status <> 'received');
--   ИЛИ
--     · по ред от бланката има размяна, по която ходът е на обекта
--       ('linked' и той е изпращач, или 'sent' и той е получател).
-- Нарочно ИЗВЪН сметката (решение на Тенчо, 04.10.2026 — така е и в кода):
--   · warehouse_response = 'will_send' (26 реда днес) — стоката още не е
--     тръгнала, обектът няма какво да направи;
--   · warehouse_response IS NULL (225 реда) — чака СКЛАДА;
--   · store_response = 'no_stock' — обектът е отговорил, ходът е на склада.
-- Предположението „warehouse_response попълнен, store_response празен" е
-- по-широко от истинското и наказва обекти, които чакат склада: днес дава 89
-- реда вместо 63 и праща трима обекта в „неизпълнили" без причина (Карлово 4,
-- Кърджали 9 вместо 1, Силистра 28 вместо 18).
--
-- ПОСОКАТА е изрично 'interstore' (решение на Тенчо). Днес филтърът е излишен
-- (доставчиковите редове нямат warehouse_response — тя е колона на склада, и
-- всичките 247 междускладови бланки са с counterpart един от двата логистични
-- склада), но пази от бъдеща бланка с чужда посока и попълнен отговор.
--
-- ПРОЗОРЕЦЪТ Е ДЕНЯТ, не седмицата. Задачата е пон–пет с ПЕТ отделни дни
-- (due_weekdays = {0,1,2,3,4}) и БЕЗ час (due_time е NULL и в базовия ред, и
-- във версията от 28.09). Затова:
--   · completion_date = самият ден D;
--   · функцията пресмята САМО за подадения ден (по подразбиране днес) — минал
--     ден никога не се преизчислява, тоест „замразяването след края на D" е в
--     самата сигнатура, а не отделен гейт както при „За връщане";
--   · понеделник НЕ се догонва в сряда. Затова кронът е на час.
--
-- ОТ КОГА: само за дни >= 2026-10-12 (понеделник; решение на Тенчо). Дните до
-- 11.10 включително не се пипат — дотогава задачата работи както досега, с
-- ръчна отметка и sdMarkDiffTask. Гейтът тук е по ДЕН, не по седмица, защото
-- всеки ден е отделна отметка.
--
-- НЕ ПРЕНАПИСВА ЧОВЕК. Вмъкването е `on conflict do nothing`: ръчна отметка,
-- отлагане ('postponed') и „не се отнася за нас" ('not_applicable') остават.
-- Изтриването е само на СВОЙ ред (completed_by = 'auto:stock-diff').
--
-- ВЕРСИИТЕ — „версията печели", не coalesce по поле, точно както
-- recurringApplyVersion() в shared.js и както в stock_returns_task_for_week.
-- Базовият ред е task_type='notice', версия от 2026-09-28 (отворена нагоре) го
-- прави 'info'. NOTICE ден → функцията НЕ ПИШЕ НИЩО.
--
-- КОЙ Я ВИКА
--   1) тригери върху ТРИ таблици — условието зависи от три места:
--      · stock_differences (warehouse_response / store_response / status),
--      · differences_reports (reviewed — приключването на бланката),
--      · stock_diff_swaps (status на размяната);
--      всички statement-level с преходни таблици, по един обект наведнъж, в
--      азбучен ред и всеки в собствен BEGIN/EXCEPTION (моделът на
--      goods_transit_sync_trg и stock_returns_sync_trg);
--   2) крон на всеки час — за деня, в който никой не е пипал нищо.
--
-- ТИХ ПЕРИОД НЯМА, по същата причина като при „За връщане": няма порой.
-- Цената е ИЗМЕРЕНА на 04.10.2026 върху живите данни (771 реда разлики, 355
-- бланки, 0 размени): 300 пресмятания на условието = 99.9 ms, тоест 0.333 ms
-- на обект. Успоредните пресмятания се подреждат с advisory lock по обект —
-- редът на вземане на ключалката съвпада с реда на комитите, значи последното
-- пресмятане вижда всичко.

-- ТЕСТВАНО ПРЕДИ ПРИЛАГАНЕТО (04.10.2026, две транзакции, върнати назад с
-- raise exception; след тях базата е сверена: 771 реда разлики, 355 бланки,
-- 0 размени, 0 нови функции, 0 тригера, 0 тестови реда).
--   ПРАВИЛОТО, 41 проверки, 0 паднали: версията печели (21.09 → notice,
--   седмицата на 12.10 → info, пет дни, без target_stores); гейтът по ден
--   (петък 09.10 → 0 действия и нито един ред; събота 17.10 → 0, не е ден на
--   задачата); чист обект → отметка auto:stock-diff/done за 12.10; обратно
--   движение и 'sent' без отговор → отметката пада; will_send, празен отговор
--   на склада, store_response='no_stock' и приключен ред (received) → НЕ се
--   броят, обектът остава отметнат; доставчикова бланка → не се брои, обратно
--   към междускладова → пада; прегледана бланка (reviewed) → не се брои;
--   отговор на ЕДИН от два реда → още не, на ВСИЧКИ → отметнат; замразяване —
--   пресмятане за вторник НЕ пипа отметката за понеделник, а пресмятане за
--   самия понеделник я маха, докато денят е отворен; ръчна отметка,
--   not_applicable и postponed не се пренаписват и не се дублират; notice →
--   нищо; target_stores на версията се зачита; нула авто редове преди 12.10.
--   РАЗМЕНИТЕ (fixture, защото таблицата е празна на живо): 'linked' →
--   изпращачът не е отметнат, а получателят да; 'sent' → ходът се мести,
--   получателят пада и изпращачът се отмята обратно; 'received' → никой не
--   чака. НЕПРОВЕРЕНО НА РЕАЛНИ ДАННИ.
--   ТРИГЕРИТЕ, 18 проверки, 0 паднали (със шпионин на мястото на
--   синхронизацията, за да се брои КОГО вика): нова бланка → 1 извикване за
--   нейния обект; редакция без reviewed → нула; приключване → 1; нов ред → 1,
--   с обекта ОТ БЛАНКАТА; редакция на коментар → нула; същата стойност на
--   warehouse_response → нула; отговор на обекта → 1; смяна на статуса → 1;
--   INSERT на 200 реда с ЕДИН statement в два обекта → точно 2 извиквания, по
--   азбучен ред (15.4 ms), изтриването им → пак 2; нова размяна → и двата
--   обекта, редакция на бележка → нула, смяна на статуса → и двата, изтриване
--   → и двата.
--   ЦЕНА: 300 пресмятания на условието = 99.9 ms (0.333 ms на обект).
--   НЕ Е проверено тук: кронът при p_store = NULL (минава през users) и целият
--   път през тригера с ОТВОРЕН гейт — преди 12.10 гейтът го затваря. Двете се
--   проверяват на живо след 12.10.

-- ═══ 1. ПОМОЩНИК: задачата за дадена седмица, със слята версия ═══════════
-- Връща due_weekdays като МАСИВ (за разлика от „За връщане", където денят е
-- един): задачата се пада пет пъти в седмицата и всеки ден е отделна отметка.
create or replace function public.stock_diff_task_for_week(p_monday date)
returns table (task_id uuid, task_type text, due_idx int[], target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id,
         case when v.id is null then t.task_type else v.task_type end,
         /* due_weekdays, иначе един ден от due_weekday. Версията печели и
            когато е NULL — coalesce по поле би се разминал с екрана. */
         coalesce(
           case when v.id is null then t.due_weekdays else v.due_weekdays end,
           array[ case when v.id is null then t.due_weekday else v.due_weekday end ]
         ),
         case when v.id is null then t.target_stores else v.target_stores end
    from recurring_tasks t
    left join lateral (
      select vv.id, vv.task_type, vv.due_weekdays, vv.due_weekday, vv.target_stores
        from recurring_task_versions vv
       where vv.recurring_task_id = t.id
         and vv.from_monday <= p_monday
         and (vv.to_monday is null or vv.to_monday >= p_monday)
       order by vv.from_monday desc
       limit 1
    ) v on true
   where t.linked_module = 'stock-diff'
     and t.active
   limit 1;
$$;

comment on function public.stock_diff_task_for_week(date) is
  'Постоянната задача „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" за седмицата на p_monday, със СЛЯТА версия (recurring_task_versions). due_idx е МАСИВ от дни (0=Пон), защото задачата се пада пон–пет. Сливането е „версията печели", не coalesce по поле — както recurringApplyVersion() в shared.js.';

-- ═══ 2. УСЛОВИЕТО: чака ли нещо действието на обекта ═════════════════════
-- Дословен превод на sdUnreviewedCountFor() (клонът за магазин) от
-- stock-differences.js. Без прозорец по дата: въпросът е „в ТОЗИ момент".
create or replace function public.stock_diff_store_done(p_store text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
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
$$;

comment on function public.stock_diff_store_done(text) is
  'Има ли обектът ред, чакащ НЕГОВОТО действие по междускладова разлика: непрегледана бланка, складът е отговорил sent/sent_sap/return, обектът не е отговорил и редът не е приключен; или размяна, по която ходът е негов. true = няма такъв ред (включително когато обектът няма разлики изобщо). will_send, празен отговор на склада и store_response=no_stock НЕ се броят — там ходът е на склада. Дословният близнак на sdUnreviewedCountFor() в stock-differences.js.';

-- ═══ 3. СИНХРОНИЗАЦИЯТА ══════════════════════════════════════════════════
create or replace function public.stock_diff_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  /* p_today е за тест и за ръчно препускане на конкретен ден. Гейтът по дата
     важи спрямо него, тоест подаден ден не отваря вратичка. Функцията не е
     достъпна на anon/authenticated. */
  v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_monday  date;
  v_start   date := date '2026-10-12';   -- понеделник; по-рано не се пипа
  v_task    record;
  v_idx     int;
  v_excl    text[] := report_excluded_stores();
  v_stores  text[];
  v_n       integer := 0;
  v_tmp     integer;
begin
  if v_excl is null then
    raise warning 'stock_diff_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  /* Гейтът е по ДЕН, не по седмица (за разлика от „За връщане"): всеки ден е
     отделна отметка, значи 09.10 не бива да се пипа дори когато 12.10 вече е
     настъпил. Оттук идва и замразяването: функцията смята САМО за v_today и
     никога не преизчислява минал ден. */
  if v_today < v_start then
    return 0;
  end if;

  v_monday := v_today - ((extract(isodow from v_today)::int) - 1);

  /* ЗАКЛЮЧВАНЕ ПО ОБЕКТ вместо „тих период" (защо: виж заглавието). Ключалката
     е за транзакцията, значи редът на вземането ѝ съвпада с реда на комитите и
     последното пресмятане вижда всичко. При p_store = NULL (кронът) се взема
     една обща ключалка, за да не се застъпват две пускания. */
  perform pg_advisory_xact_lock(hashtext('sd-sync:' || coalesce(p_store, '*')));

  select * into v_task from stock_diff_task_for_week(v_monday);
  if v_task.task_id is null then
    return 0;                       -- няма такава активна задача
  end if;
  -- „Само за информация" НЕ се отмята: редове по нея никой не чете.
  if coalesce(v_task.task_type, 'info') = 'notice' then
    return 0;
  end if;

  -- Пада ли се задачата ДНЕС. 0 = понеделник, както в due_weekdays.
  v_idx := (extract(isodow from v_today)::int) - 1;
  if v_task.due_idx is null or not (v_idx = any(v_task.due_idx)) then
    return 0;
  end if;

  v_stores := case
    when p_store is not null then array[p_store]
    else array(select distinct u.store_name
                 from users u
                where u.store_name is not null
                  and not (u.store_name = any(v_excl)))
  end;

  -- target_stores — същото правило като на екрана: празно/NULL значи „всички".
  if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
    v_stores := array(select s from unnest(v_stores) as s
                       where s = any(v_task.target_stores));
  end if;
  if cardinality(v_stores) = 0 then
    return 0;
  end if;

  -- ДОБАВЯНЕ: само където няма чакащ ред. `do nothing` пази ръчната отметка,
  -- отлагането и „не се отнася за нас" — редът вече е там.
  insert into task_completions
         (recurring_task_id, store_name, completed_by, completed_at,
          status, completion_date)
  select v_task.task_id, s, 'auto:stock-diff', now(), 'done', v_today
    from unnest(v_stores) as s
   where not (s = any(v_excl))
     and stock_diff_store_done(s)
  on conflict (recurring_task_id, store_name, completion_date)
     where recurring_task_id is not null and completion_date is not null
  do nothing;
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  -- МАХАНЕ: появил се е нов чакащ ред. Трие се САМО свой ред и САМО за ДНЕС —
  -- миналите дни са замразени.
  delete from task_completions tc
   where tc.recurring_task_id = v_task.task_id
     and tc.completion_date = v_today
     and tc.completed_by = 'auto:stock-diff'
     and tc.store_name = any(v_stores)
     and not stock_diff_store_done(tc.store_name);
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  return v_n;
end
$function$;

comment on function public.stock_diff_sync_completions(text, date) is
  'Отмята/разотмята постоянната задача „РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ" за обект (или за всички, ако p_store е NULL) за ЕДИН ДЕН — подадения или днешния. Пише само ако денят се пада по due_weekdays и е >= 2026-10-12; минал ден никога не се преизчислява, тоест след края на деня резултатът е замразен. Не пренаписва ръчна отметка, отлагане и not_applicable; трие само свои редове (auto:stock-diff). Взема advisory lock по обект.';

-- ═══ 4. ТРИГЕРИ — три таблици, защото условието зависи от три места ══════
-- Общият вид: statement-level, преходни таблици, по един обект наведнъж в
-- АЗБУЧЕН ред (ключалката се взема в един и същ ред от всички транзакции,
-- иначе две успоредни се заключват взаимно) и всеки в собствен
-- BEGIN/EXCEPTION, за да не събори чуждия запис.

-- 4а. РЕДОВЕТЕ на разликите. Обектът идва от БЛАНКАТА (differences_reports),
--     защото правилото брои по нея; преходната таблица носи само редовете,
--     затова има join. Отсява се по РЕАЛНА промяна на трите колони — списък с
--     колони в самия тригер е невъзможен заедно с преходни таблици (0A000) и
--     при PostgREST не би помогнал: тялото на PATCH-а носи колоната и когато
--     стойността е същата.
create or replace function public.stock_diff_sync_lines_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    for s in select distinct r.store_name
               from new_rows n join differences_reports r on r.id = n.report_id
              order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct r.store_name
               from old_rows o join differences_reports r on r.id = o.report_id
              order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    for s in
      select distinct r.store_name
        from old_rows o
        join new_rows n on n.id = o.id
        join differences_reports r on r.id = coalesce(n.report_id, o.report_id)
       where n.warehouse_response is distinct from o.warehouse_response
          or n.store_response     is distinct from o.store_response
          or n.status             is distinct from o.status
       order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_diff_sync_lines_ins on public.stock_differences;
create trigger stock_diff_sync_lines_ins
  after insert on public.stock_differences
  referencing new table as new_rows
  for each statement execute function stock_diff_sync_lines_trg();

drop trigger if exists stock_diff_sync_lines_del on public.stock_differences;
create trigger stock_diff_sync_lines_del
  after delete on public.stock_differences
  referencing old table as old_rows
  for each statement execute function stock_diff_sync_lines_trg();

drop trigger if exists stock_diff_sync_lines_upd on public.stock_differences;
create trigger stock_diff_sync_lines_upd
  after update on public.stock_differences
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_diff_sync_lines_trg();

-- 4б. БЛАНКИТЕ. Приключването (reviewed) маха всичките ѝ чакащи редове от
--     сметката наведнъж, затова е отделен тригер. Обектът е в самата бланка.
create or replace function public.stock_diff_sync_reports_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    for s in select distinct store_name from new_rows order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct store_name from old_rows order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    /* Само реална промяна на reviewed или на обекта/посоката. Редакция на
       коментар или прикачена снимка не пипа условието. */
    for s in
      select distinct q.st from (
        select o.store_name as st from old_rows o join new_rows n on n.id = o.id
         where n.reviewed is distinct from o.reviewed
            or n.store_name is distinct from o.store_name
            or n.direction is distinct from o.direction
        union all
        select n.store_name from old_rows o join new_rows n on n.id = o.id
         where n.reviewed is distinct from o.reviewed
            or n.store_name is distinct from o.store_name
            or n.direction is distinct from o.direction
      ) q
      order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_diff_sync_reports_ins on public.differences_reports;
create trigger stock_diff_sync_reports_ins
  after insert on public.differences_reports
  referencing new table as new_rows
  for each statement execute function stock_diff_sync_reports_trg();

drop trigger if exists stock_diff_sync_reports_del on public.differences_reports;
create trigger stock_diff_sync_reports_del
  after delete on public.differences_reports
  referencing old table as old_rows
  for each statement execute function stock_diff_sync_reports_trg();

drop trigger if exists stock_diff_sync_reports_upd on public.differences_reports;
create trigger stock_diff_sync_reports_upd
  after update on public.differences_reports
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_diff_sync_reports_trg();

-- 4в. РАЗМЕНИТЕ. Ходът се мести между двата обекта със смяната на status,
--     затова се пресмятат И двете страни — и старата, и новата стойност на
--     from_store/to_store, в случай че някой пренасочи размяната.
create or replace function public.stock_diff_sync_swaps_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  if tg_op = 'INSERT' then
    for s in select distinct st from (
               select from_store as st from new_rows
               union all select to_store from new_rows) q
             where st is not null order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct st from (
               select from_store as st from old_rows
               union all select to_store from old_rows) q
             where st is not null order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    for s in select distinct st from (
               select o.from_store as st from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store
               union all
               select o.to_store from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store
               union all
               select n.from_store from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store
               union all
               select n.to_store from old_rows o join new_rows n on n.id = o.id
                where n.status is distinct from o.status
                   or n.from_store is distinct from o.from_store
                   or n.to_store is distinct from o.to_store) q
             where st is not null order by 1 loop
      begin perform stock_diff_sync_completions(s);
      exception when others then
        raise warning 'stock_diff_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_diff_sync_swaps_ins on public.stock_diff_swaps;
create trigger stock_diff_sync_swaps_ins
  after insert on public.stock_diff_swaps
  referencing new table as new_rows
  for each statement execute function stock_diff_sync_swaps_trg();

drop trigger if exists stock_diff_sync_swaps_del on public.stock_diff_swaps;
create trigger stock_diff_sync_swaps_del
  after delete on public.stock_diff_swaps
  referencing old table as old_rows
  for each statement execute function stock_diff_sync_swaps_trg();

drop trigger if exists stock_diff_sync_swaps_upd on public.stock_diff_swaps;
create trigger stock_diff_sync_swaps_upd
  after update on public.stock_diff_swaps
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_diff_sync_swaps_trg();

-- ═══ 4г. ПРАВА ═══════════════════════════════════════════════════════════
-- По образеца на stock_returns_* и transit_sync_completions: само postgres и
-- service_role. Водещото `=X/` (EXECUTE на PUBLIC) се маха ИЗРИЧНО — revoke
-- само от anon/authenticated не върши нищо, защото правото се наследява от
-- PUBLIC (случаят perform_daily_backup, 23.09.2026). Тригерите пак работят:
-- изпълнението на тригерна функция не проверява EXECUTE, а самите те са
-- security definer, значи вътрешните извиквания минават като собственика.
revoke execute on function public.stock_diff_task_for_week(date) from public, anon, authenticated;
revoke execute on function public.stock_diff_store_done(text) from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_completions(text, date) from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_lines_trg() from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_reports_trg() from public, anon, authenticated;
revoke execute on function public.stock_diff_sync_swaps_trg() from public, anon, authenticated;

-- ═══ 5. КРОН — на всеки час ══════════════════════════════════════════════
-- За деня, в който никой не е пипал нито разлика, нито бланка, нито размяна.
-- Понеделник не се догонва в сряда (всеки ден е отделна отметка и миналите са
-- замразени), затова честотата е на час, а не на ден.
select cron.schedule('stock-diff-auto-complete', '0 * * * *',
                     'select public.stock_diff_sync_completions();');

-- ОГЛЕДАЛО (Живко): НЯМА нова таблица и нова колона. Само нови функции,
-- тригери и крон — огледалото копира данни, не код.
