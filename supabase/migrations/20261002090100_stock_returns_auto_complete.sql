-- Автоматично отмятане на „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" от „За връщане"
--
-- ЗАЩО. Обектите трябва всяка седмица, понеделник → срока, да попълнят „Дата
-- потвърдена актуализация" на всеки НЕВЗЕТ запис. Ръчната отметка не доказва
-- нищо и вече лъже масово: за срока 30.09.2026 има 17 отметки от 18 обекта, а
-- по данните чисти са 4. Задачата минава на автоматично отмятане; ръчната
-- отметка, отлагането и „🚫 Не се отнася за нас" при нея изчезват (Бюлетинът
-- показва сив надпис какво остава).
--
-- ОБХВАТ: всички невзети записи (status='pending'), и 'complaint', и 'diff'.
-- Разделяне по „срок на годност" не е възможно по данните: expiry_date е празна
-- на всичките 221 невзети реда.
--
-- ОТ КОГА: само за седмици с понеделник >= 2026-10-05. Миналото не се пипа.
--
-- ЗАВИСИ ОТ 20261002090000_stock_returns_confirmed_by: правилото брои ред само
-- при confirmed_by = 'store:' || store_name. Без тези колони функциите гърмят
-- с 42703. Тази миграция се прилага ВТОРА и се връща ПЪРВА.
--
-- Пълното обяснение (защо версията печели и при NULL, защо не „тих период", а
-- advisory lock, какво точно е тествано и измерено) е в
-- stock-returns-auto-complete-schema.sql, който е огледало на този файл.
--
-- Кронът НЕ е тук — пуска се отделно (cron.schedule не е идемпотентен):
--   select cron.schedule('stock-returns-auto-complete', '0 * * * *',
--                        'select public.stock_returns_sync_completions();');
--
-- Rollback: 20261002090100_stock_returns_auto_complete_down.sql

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
