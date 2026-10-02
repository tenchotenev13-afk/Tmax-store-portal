-- stock-returns-auto-complete-schema.sql
-- Автоматично отмятане на постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ"
-- (recurring_tasks.linked_module = 'stock-returns') от данните в „За връщане".
--
-- ⚠ ТОЗИ ФАЙЛ Е ПОДГОТВЕН, НО НЕ Е ПРИЛОЖЕН към 02.10.2026 — чака изрично
-- потвърждение. Миграция: supabase/migrations/20261002..._stock_returns_auto.sql
--
-- ЗАЩО
-- Обектите трябва всяка седмица, от понеделник до срока на задачата, да
-- попълнят „Дата потвърдена актуализация" (stock_returns.confirmed_date) на
-- всеки НЕВЗЕТ запис — така се вижда, че следят срокове на годност и
-- рекламации. Ръчната отметка не доказва нищо и днес вече лъже масово:
--
--   За срока 30.09.2026 има 17 ръчни отметки (всичките 'done', от хора).
--   По данните обаче:
--     · 13 обекта са отметнали, а имат невзети записи БЕЗ актуализация —
--       Шумен 19 от 31, Кърджали 15/28, Севлиево 15/15, Дупница, Монтана и
--       Сливен 11/11, Раднево и Силистра 10/10, Пирдоп, Търговище, Враца,
--       Козлодуй, Петрич;
--     · 4 обекта са отметнали и наистина са чисти (Габрово — без невзети,
--       Добрич, Карлово, Троян);
--     · 1 обект не е отметнал и наистина не е чист (Гоце Делчев, 6 от 27).
--   Тоест автоматиката обръща картината от 17/18 на 4/18. Това е целта, не
--   страничен ефект.
--
-- ОБХВАТ (решение на Тенчо, 02.10.2026): ВСИЧКИ невзети записи
-- (status = 'pending'), и 'complaint' (рекламации, 125 реда), и 'diff'
-- (от разлики, 96 реда). Разделяне по „срок на годност" НЕ е възможно по
-- данните: колоната expiry_date е празна на ВСИЧКИТЕ 221 невзети реда, а
-- reason е свободен текст („Излишък от разлика — <доставчик>", 18 стойности).
--
-- ПРАВИЛОТО за обект X и седмица W (понеделник p_monday):
--   изпълнено ⇔ НЯМА невзет запис на X, чиято confirmed_date е NULL или е
--   извън [p_monday .. least(днес, деня на срока на W)].
-- Следствия, всяко нарочно:
--   · актуализация СЛЕД срока (чет–нед) не се брои за никоя седмица — горната
--     граница е денят на срока;
--   · БЪДЕЩА дата не се брои — два реда в базата са 2028-09-02 и 2029-09-02
--     (Козлодуй, явна печатна грешка). Нарочно БЕЗ CHECK в базата: отказът е
--     във формата, а тези два реда обектът ще види в предупреждението и ще ги
--     поправи сам;
--   · прозорецът е седмичен, тоест миналата седмица не помага на тази;
--   · АКТУАЛИЗАЦИЯТА ТРЯБВА ДА Е НА ОБЕКТА — confirmed_by = 'store:<обект>'.
--     Датата се пише и от двата Excel импорта (само офисът ги пуска) и те
--     презаписват съществуващи редове; без тази проверка качен файл щеше да
--     отмята обектите наготово. Виж stock-returns-confirmed-by-schema.sql.
--
-- ЗАМРАЗЯВАНЕ СЛЕД СРОКА — по образеца на transit_mark_empty_stores: докато
-- `днес <= деня на срока` резултатът се преизчислява (отметката се маха, ако
-- се появи нов невзет запис); СЛЕД срока функцията не пипа нищо. Иначе
-- вчерашният резултат би се променял до безкрай и отчетът за минала седмица
-- би казвал различно число всеки ден.
--
-- ОТ КОГА: само за седмици с понеделник >= 2026-10-05 (решение на Тенчо).
-- Миналото НЕ се пипа: ръчните отметки до 30.09 остават, нищо не се трие и
-- нищо не се добавя назад.
--
-- НЕ ПРЕНАПИСВА ЧОВЕК. Вмъкването е `on conflict do nothing`, тоест ръчна
-- отметка ('done' от обекта), отлагане ('postponed') и „не се отнася за нас"
-- ('not_applicable') остават както са. Изтриването е само на СВОЙ ред
-- (completed_by = 'auto:stock-returns') — точно както transit_mark_empty_stores
-- трие само 'auto:transit-empty'.
--
-- ВЕРСИИТЕ — защо НЕ coalesce по поле.
-- Задачата е `task_type='notice'` на базовия ред, а версия от 2026-09-28
-- (отворена нагоре) я прави 'info'. Денят и часът на срока също са съдържание
-- по седмици. В портала сливането е recurringApplyVersion():
--     RECURRING_CONTENT_FIELDS.forEach(f => { if (f in v) out[f] = v[f]; })
-- тоест стойността на ВЕРСИЯТА печели дори когато е NULL, а заявката
-- (loadRecurringVersions) тегли всички тези полета, значи винаги са налице.
-- `coalesce(v.due_time, t.due_time)` щеше да се разминава с екрана точно при
-- версия с NULL: екранът вижда NULL, coalesce — базовата стойност. Затова тук
-- е „има ли версия за седмицата → взимаме НЕЯ, иначе базовия ред", поле по
-- поле със `case when v.id is null`. Това е тясното четене, за което става
-- дума — само трите полета, от които зависи правилото, без трето копие на
-- целия recurringApplyVersion.
--
-- NOTICE СЕДМИЦА: ако слятата задача е 'notice', функцията НЕ ПИШЕ НИЩО
-- (решение на Тенчо). „Само за информация" няма отмятане и редове по нея
-- никой не чете.
--
-- КОЙ Я ВИКА
--   1) тригер върху stock_returns — INSERT, DELETE и UPDATE на confirmed_date
--      или status. Statement-level с REFERENCING NEW/OLD TABLE, по едно
--      извикване за всеки РАЗЛИЧЕН обект, всяко в собствен BEGIN/EXCEPTION:
--      грешка при един обект не бива да събори целия импорт (дословно моделът
--      на goods_transit_sync_trg);
--   2) крон на всеки час — за случая „срокът настъпи, а никой не е пипал
--      таблицата" и за новите обекти. Същата честота като transit-empty-stores.
--
-- ТИХ ПЕРИОД ПРИ МАСОВ ИМПОРТ — защо на негово място стои ЗАКЛЮЧВАНЕ.
-- Исканото беше „тих период" по образеца на transit_mark_empty_stores (там:
-- не пипай, докато последният внесен ред е на под 10 минути). Тук той няма за
-- какво да се закачи и не решава проблема:
--   · 300-те НОВИ реда идват с ЕДИН POST (srBatchImport, BATCH=300), значи
--     ЕДНО извикване на тригера — няма порой;
--   · 300-те ОБНОВЕНИ реда идват като 300 отделни PATCH-а, по 20 УСПОРЕДНО
--     (srBatchUpdate, BATCH=20) — ето го порой, но stock_returns НЯМА
--     updated_at, значи „кога този ред е пипан последно" е непознаваемо.
--     confirmed_at не върши работа: от 02.10 той нарочно НЕ се пише, когато
--     датата не се мени, тоест мълчи точно при повечето редове от импорта;
--   · цената е ИЗМЕРЕНА на 02.10.2026 върху живите данни (530 реда, 18 обекта,
--     task_completions 3448 реда): 300 пълни пресмятания = 87 ms общо —
--     условието 32.7, задачата със слятата версия 9.5, сондата по
--     task_completions 45.2. Порой няма и откъм време;
--   · а тих период, завързан за „този обект има скорошен запис", би забавил и
--     ЕДНИЧКАТА редакция на обекта — точно нея човекът чака да го отметне.
-- Истинският риск при 20 успоредни PATCH-а е друг: две пресмятания с различни
-- моментни снимки могат да се разминат (едното вмъква, другото трие) и да
-- оставят ГРЕШЕН последен резултат. Затова функцията взема advisory lock по
-- обект: извикванията за един обект се подреждат, а редът на вземане на
-- ключалката съвпада с реда на комитите — значи ПОСЛЕДНОТО пресмятане вижда
-- всичко. Без забавяне и без прозорец на застой. Кронът остава резерва.

-- ТЕСТВАНО ПРЕДИ ПРИЛАГАНЕТО (02.10.2026, две транзакции, върнати назад с
-- raise exception; след тях базата е сверена: 530 реда, 0 нови колони, 0
-- функции, 0 тригера, 0 тестови реда).
--   Правилото, 35 проверки, 0 паднали: версията печели (21.09 → notice,
--   28.09 и 05.10 → info, ден сряда, час 20:00); седмица 28.09 → 0 действия и
--   нито един авто ред; чист обект → отметка auto:stock-returns/done на
--   07.10; нов невзет запис → отметката пада; дата от офис / от импорт /
--   заварена (NULL) → НЕ отмята, дата от обекта → отмята; границите —
--   понеделник 05.10 брои се, неделя 04.10 не, бъдеща 2028 не, дата 07.10
--   при днес 06.10 не, същата в сряда да; замразяване — в четвъртък
--   разваленото условие не маха отметката, в сряда я маха; ръчна отметка,
--   not_applicable и postponed не се пренаписват и не се дублират; notice
--   седмица не пише нищо, същата като info пише; target_stores на версията
--   се зачита.
--   Тригерът, 13 проверки, 0 паднали (със шпионин на мястото на
--   синхронизацията, за да се брои КОГО вика): INSERT на 300 реда с един
--   statement → 18 извиквания, по азбучен ред; UPDATE само на коментар → 0;
--   confirmed_date със същата стойност → 0; дата върху 34 реда в 2 обекта →
--   2; само статус → 1; ред, преместен в друг обект → старият И новият;
--   DELETE от 3 обекта → 3; 249 отделни PATCH-а → 249 извиквания, а
--   statement без променен ред → нула.
--   Време: 300 пълни пресмятания (вкл. ключалката) 325 ms; INSERT на 300
--   реда с един statement 19 ms; 249 отделни UPDATE-а 137 ms. Тоест цял
--   импорт от 300 реда струва под половин секунда.
--   ХВАНАТО ОТ ТЕСТА: `after update of confirmed_date, status` + преходни
--   таблици е НЕВЪЗМОЖНО (0A000) — миграцията щеше да падне. Виж бележката в
--   stock_returns_sync_trg.
--   НЕ Е проверено тук: кронът при p_store = NULL (минава през users), защото
--   преди 05.10 гейтът го затваря; и целият път през тригера с ОТВОРЕН гейт —
--   двете се проверяват на живо след 05.10.

-- ═══ 1. ПОМОЩНИК: задачата за дадена седмица, със слята версия ═══════════
create or replace function public.stock_returns_task_for_week(p_monday date)
returns table (task_id uuid, task_type text, due_idx int, due_time text, target_stores text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id,
         case when v.id is null then t.task_type else v.task_type end,
         /* Денят: due_weekdays[1], иначе due_weekday. Прозоречна задача тук
            няма (due_window=false) — а и правилото ѝ не зависи от прозорец,
            защото заявката е по седмица, не по ден. */
         coalesce(
           (case when v.id is null then t.due_weekdays else v.due_weekdays end)[1],
           (case when v.id is null then t.due_weekday  else v.due_weekday  end)
         ),
         case when v.id is null then t.due_time else v.due_time end,
         /* target_stores също е седмично съдържание: днес е NULL (задачата
            важи за всички), но сложи ли го някой за една седмица, правилото
            трябва да го зачете — иначе базата отмята обект, който екранът
            изобщо не показва. */
         case when v.id is null then t.target_stores else v.target_stores end
    from recurring_tasks t
    left join lateral (
      select vv.id, vv.task_type, vv.due_weekdays, vv.due_weekday, vv.due_time, vv.target_stores
        from recurring_task_versions vv
       where vv.recurring_task_id = t.id
         and vv.from_monday <= p_monday
         and (vv.to_monday is null or vv.to_monday >= p_monday)
       order by vv.from_monday desc
       limit 1
    ) v on true
   where t.linked_module = 'stock-returns'
     and t.active
   limit 1;
$$;

comment on function public.stock_returns_task_for_week(date) is
  'Постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" за седмицата на p_monday, със СЛЯТА версия (recurring_task_versions). Връща task_type, индекса на деня (0=Пон), часа и target_stores. Сливането е „версията печели", не coalesce по поле — точно както recurringApplyVersion() в shared.js.';

-- ═══ 2. УСЛОВИЕТО: обектът актуализирал ли е всичко в прозореца ══════════
create or replace function public.stock_returns_store_done(
  p_store text, p_from date, p_upto date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    select 1 from stock_returns
     where store_name = p_store
       and status = 'pending'
       and (confirmed_date is null
            or confirmed_date < p_from
            or confirmed_date > p_upto
            /* АКТУАЛИЗАЦИЯТА ТРЯБВА ДА Е НА ОБЕКТА. confirmed_date се пише и
               от двата Excel импорта, които са само на офиса и презаписват
               съществуващи редове — без тази проверка файл, качен в сряда
               сутрин, щеше да отметне обектите, без те да са работили.
               Заварен ред (confirmed_by NULL) не се брои; на практика без
               значение, защото датите му са от минали седмици.
               Виж stock-returns-confirmed-by-schema.sql. */
            or confirmed_by is distinct from ('store:' || p_store)));
$$;

comment on function public.stock_returns_store_done(text, date, date) is
  'Има ли обектът НЕВЗЕТ запис без актуализация в [p_from .. p_upto], направена ОТ САМИЯ ОБЕКТ (confirmed_by = store:<обект>). true = всичко е актуализирано (включително когато обектът няма невзети записи). Бъдеща дата не се зачита — извън горната граница. Дата от офис или от импорт не се зачита — не е негова работа.';

-- ═══ 3. СИНХРОНИЗАЦИЯТА ══════════════════════════════════════════════════
create or replace function public.stock_returns_sync_completions(
  p_store text default null, p_today date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  /* p_today е САМО за тест и за ръчно препускане на конкретен ден. Всички
     гейтове (началната седмица, замразяването след срока) важат спрямо него,
     тоест подаден ден не отваря вратичка — отваря прозорец, който и без това
     съществува. Функцията не е достъпна на anon/authenticated. */
  v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_monday  date;
  v_start   date := date '2026-10-05';   -- от тази седмица нататък, не по-рано
  v_task    record;
  v_due     date;
  v_upto    date;
  v_excl    text[] := report_excluded_stores();
  v_stores  text[];
  v_n       integer := 0;
  v_tmp     integer;
begin
  v_monday := v_today - ((extract(isodow from v_today)::int) - 1);

  if v_excl is null then
    raise warning 'stock_returns_sync_completions: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  -- Миналото не се пипа. Проверката е по СЕДМИЦАТА, не по днешната дата:
  -- иначе в понеделник 05.10 функцията още щеше да смята за 28.09.
  if v_monday < v_start then
    return 0;
  end if;

  /* ЗАКЛЮЧВАНЕ ПО ОБЕКТ — вместо „тих период" (защо: виж заглавието).
     srBatchUpdate праща по 20 PATCH-а УСПОРЕДНО; без това две пресмятания с
     различни моментни снимки могат да се разминат — едното вмъква, другото
     трие — и да оставят грешен последен резултат. Ключалката е за
     транзакцията, значи редът на вземането ѝ съвпада с реда на комитите и
     последното пресмятане вижда всичко. При p_store = NULL (кронът) се взема
     една обща ключалка, за да не се застъпва с друг крон. */
  perform pg_advisory_xact_lock(hashtext('sr-sync:' || coalesce(p_store, '*')));

  select * into v_task from stock_returns_task_for_week(v_monday);
  if v_task.task_id is null then
    return 0;                       -- няма такава активна задача
  end if;
  -- „Само за информация" НЕ се отмята (решение на Тенчо): редове по нея
  -- никой не чете, а записването им би било мъртъв код в данните.
  if coalesce(v_task.task_type, 'info') = 'notice' then
    return 0;
  end if;
  if v_task.due_idx is null then
    return 0;                       -- задача без ден: няма срок, няма прозорец
  end if;

  v_due  := v_monday + v_task.due_idx;
  v_upto := least(v_today, v_due);

  -- ЗАМРАЗЯВАНЕ: след деня на срока нищо не се пипа — нито се добавя, нито се
  -- маха. Същият гейт като `if t.due >= v_today` в transit_mark_empty_stores.
  if v_today > v_due then
    return 0;
  end if;

  v_stores := case
    when p_store is not null then array[p_store]
    else array(select distinct u.store_name
                 from users u
                where u.store_name is not null
                  and not (u.store_name = any(v_excl)))
  end;

  -- Обхватът по target_stores — същото правило като на екрана: празно/NULL
  -- значи „всички обекти", иначе само изброените.
  if v_task.target_stores is not null and cardinality(v_task.target_stores) > 0 then
    v_stores := array(select s from unnest(v_stores) as s
                       where s = any(v_task.target_stores));
  end if;
  if cardinality(v_stores) = 0 then
    return 0;
  end if;

  -- ДОБАВЯНЕ: само където условието е изпълнено. `do nothing` пази ръчната
  -- отметка, отлагането и „не се отнася за нас" — редът вече е там.
  insert into task_completions
         (recurring_task_id, store_name, completed_by, completed_at,
          status, completion_date)
  select v_task.task_id, s, 'auto:stock-returns', now(), 'done', v_due
    from unnest(v_stores) as s
   where not (s = any(v_excl))
     and stock_returns_store_done(s, v_monday, v_upto)
  on conflict (recurring_task_id, store_name, completion_date)
     where recurring_task_id is not null and completion_date is not null
  do nothing;
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  -- МАХАНЕ: условието се е развалило (нов невзет запис, изтрита дата). Трие се
  -- САМО свой ред — ръчната отметка на обекта и 'not_applicable' не се пипат.
  delete from task_completions tc
   where tc.recurring_task_id = v_task.task_id
     and tc.completion_date = v_due
     and tc.completed_by = 'auto:stock-returns'
     and tc.store_name = any(v_stores)
     and not stock_returns_store_done(tc.store_name, v_monday, v_upto);
  get diagnostics v_tmp = row_count;
  v_n := v_n + coalesce(v_tmp, 0);

  return v_n;
end
$function$;

comment on function public.stock_returns_sync_completions(text, date) is
  'Отмята/разотмята постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" за обект (или за всички, ако p_store е NULL) за ТЕКУЩАТА седмица. Пише само в прозореца понеделник..ден на срока; след срока замразява. Не пренаписва ръчна отметка, отлагане и not_applicable; трие само свои редове (auto:stock-returns). Седмици преди 2026-10-05 не се пипат. Взема advisory lock по обект, за да не се разминат две успоредни пресмятания при импорт. p_today е само за тест/ръчно препускане — гейтовете важат спрямо него.';

-- ═══ 4. ТРИГЕР върху stock_returns ═══════════════════════════════════════
create or replace function public.stock_returns_sync_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s text;
begin
  -- Дословно моделът на goods_transit_sync_trg: по един обект наведнъж, всеки
  -- в собствен BEGIN/EXCEPTION, за да не събори импорта. plpgsql планира всяка
  -- заявка при изпълнение, затова клоновете са отделни, а не един union.
  -- ПОДРЕДБАТА (order by 1) не е разкош: функцията взема advisory lock по
  -- обект, а две успоредни транзакции, които вземат А→Б и Б→А, се заключват
  -- взаимно. Еднаквият ред прави взаимното заключване невъзможно.
  if tg_op = 'INSERT' then
    for s in select distinct store_name from new_rows order by 1 loop
      begin perform stock_returns_sync_completions(s);
      exception when others then
        raise warning 'stock_returns_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct store_name from old_rows order by 1 loop
      begin perform stock_returns_sync_completions(s);
      exception when others then
        raise warning 'stock_returns_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    /* ПРИ UPDATE се броят само РЕАЛНИТЕ промени по двете колони, от които
       зависи правилото. Списък с колони в самия тригер (after update of …) е
       НЕВЪЗМОЖЕН заедно с преходни таблици — PostgreSQL отказва със
       „transition tables cannot be specified for triggers with column lists"
       (хванато от SQL теста на 02.10.2026, иначе щеше да падне миграцията).
       Пък и той не би помогнал: PostgREST праща confirmed_date в тялото на
       всеки PATCH, значи колоната „се пипа" и когато стойността е същата.
       Сверката по стойност върши и двете. Двете посоки на union покриват
       ред, преместен от един обект в друг. */
    for s in
      select distinct q.st from (
        select o.store_name as st from old_rows o join new_rows n on n.id = o.id
         where n.confirmed_date is distinct from o.confirmed_date
            or n.status is distinct from o.status
        union all
        select n.store_name from old_rows o join new_rows n on n.id = o.id
         where n.confirmed_date is distinct from o.confirmed_date
            or n.status is distinct from o.status
      ) q
      order by 1 loop
      begin perform stock_returns_sync_completions(s);
      exception when others then
        raise warning 'stock_returns_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$function$;

drop trigger if exists stock_returns_sync_ins on public.stock_returns;
create trigger stock_returns_sync_ins
  after insert on public.stock_returns
  referencing new table as new_rows
  for each statement execute function stock_returns_sync_trg();

drop trigger if exists stock_returns_sync_del on public.stock_returns;
create trigger stock_returns_sync_del
  after delete on public.stock_returns
  referencing old table as old_rows
  for each statement execute function stock_returns_sync_trg();

-- БЕЗ списък с колони: той е несъвместим с преходните таблици (виж бележката
-- в stock_returns_sync_trg). Отсяването по confirmed_date/status става ВЪТРЕ в
-- функцията и е по-строго — по стойност, не по „колоната е в SET".
drop trigger if exists stock_returns_sync_upd on public.stock_returns;
create trigger stock_returns_sync_upd
  after update on public.stock_returns
  referencing old table as old_rows new table as new_rows
  for each statement execute function stock_returns_sync_trg();

-- ═══ 4б. ПРАВА ═══════════════════════════════════════════════════════════
-- По образеца на transit_sync_completions / goods_transit_sync_trg: само
-- postgres и service_role. Водещото `=X/` (EXECUTE на PUBLIC) се маха ИЗРИЧНО —
-- revoke само от anon/authenticated не върши нищо, защото правото се наследява
-- от PUBLIC (случаят perform_daily_backup, 23.09.2026). Тригерът пак работи:
-- изпълнението на тригерна функция не проверява EXECUTE, а самата тя е
-- security definer, значи вътрешните извиквания минават като собственика.
revoke execute on function public.stock_returns_task_for_week(date) from public, anon, authenticated;
revoke execute on function public.stock_returns_store_done(text, date, date) from public, anon, authenticated;
revoke execute on function public.stock_returns_sync_completions(text, date) from public, anon, authenticated;
revoke execute on function public.stock_returns_sync_trg() from public, anon, authenticated;

-- ═══ 5. КРОН — на всеки час ══════════════════════════════════════════════
-- За случая „срокът настъпи, а никой не е пипал таблицата": в сряда 20:00
-- прозорецът се затваря и резултатът трябва да е верен, дори обектът да не е
-- отварял нищо. Същата честота като transit-empty-stores (jobid 22).
select cron.schedule('stock-returns-auto-complete', '0 * * * *',
                     'select public.stock_returns_sync_completions();');

-- ОГЛЕДАЛО (Живко): НЯМА нова таблица и нова колона. Само нови функции,
-- тригери и крон — огледалото копира данни, не код. Текстът го праща Тенчо.
