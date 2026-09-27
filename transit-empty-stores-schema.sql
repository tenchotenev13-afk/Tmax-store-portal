-- Обект БЕЗ входящи редове в „Стока на път" е ИЗПЪЛНИЛ
--
-- transit_store_done_since() изисква „поне един входящ ред" (решение от
-- 14.09.2026). Следствие: обект, който в тази партида няма нито един входящ
-- ред, не се отмята НИКОГА, а ръчното отмятане му е заключено
-- (bulAutoLocked в bulletin.js) — тоест излиза неизпълнил, без да има какво да
-- прави. Решение на Тенчо от 27.09.2026: такъв обект е ИЗПЪЛНИЛ. Това ОТМЕНЯ
-- решението от 14.09 за случая „нула редове".
--
-- ═══ ЗАЩО НЕ СЕ РЕШАВА В ТРИГЕРА ═══════════════════════════════════════════
-- Импортът пише на порции по 50 реда (transit.js) и тригерите по goods_transit
-- се палят след ВСЯКА порция. Проверка „няма редове → изпълнено" по време на
-- импорта би отметнала всички обекти, чиито редове още не са записани. Преди
-- импорта пък никой няма редове.
--
-- Освен това transit_sync_completions(p_store) отговаря на „приключил ли е ТОЗИ
-- обект", а правилото за празните е за ДРУГИТЕ обекти — тези, които тригерът
-- никога няма да види, защото няма техни редове. Различен въпрос, различна
-- функция.
--
-- ═══ КОГА СЕ ВЗИМА РЕШЕНИЕТО ═══════════════════════════════════════════════
-- Почасов крон вика transit_mark_empty_stores(). Тя пипа задача САМО ако:
--   1. в прозореца на задачата има ПОНЕ ЕДИН входящ ред (за който и да е
--      обект) — тоест импортът е дошъл. Иначе никой не се отмята;
--   2. последният вмъкнат ред в прозореца е на възраст ПОВЕЧЕ от 10 минути —
--      тоест импортът е приключил. Целият импорт от 01.09.2026 (2269 реда, 19
--      обекта) отне 8 СЕКУНДИ, значи 10 минути са 75× запас.
-- Двете условия заедно са причината да няма нужда от „N минути след последния
-- INSERT" като отделен механизъм: max(created_at) в прозореца го дава.
--
-- Почасово, а не веднъж в деня на срока, защото: обектът без редове се вижда
-- като изпълнил до час след импорта (не в 20:00), а късен импорт не се губи.
-- Функцията е чист SQL и обхожда 63 задачи + 2.3к реда — цената е нула.
--
-- ═══ КАК СЕ ЗАПИСВА ════════════════════════════════════════════════════════
-- Ред в task_completions със status='done', completion_date = СРОКА и
-- completed_by = 'auto:transit-empty' — отделен от 'auto:transit', за да се
-- различава в отчетите и в интерфейса „няма какво да обработва" от „обработи
-- и приключи". bulCompletedByLabel() в bulletin.js го изписва с думи.
--
-- ═══ САМОПОЧИСТВАНЕ ════════════════════════════════════════════════════════
-- Допълващ импорт е реален: обект, отметнат като „без редове", получава редове
-- по-късно. Тогава отметката се МАХА и обектът трябва да ги обработи. Маха се
-- само отметка с completed_by='auto:transit-empty' (никога ръчна и никога
-- 'auto:transit') и само ДОКАТО срокът не е минал — след срока историята не се
-- пипа, защото отчетът за онзи ден вече е излязъл.
--
-- ═══ ОБХВАТЪТ НА ОБЕКТИТЕ ══════════════════════════════════════════════════
-- target_stores на задачата, ако е зададен; иначе отчетните обекти. „Отчетни"
-- значи потребителските обекти минус изключените, а списъкът на изключените
-- вече НЕ е твърд в кода: app_settings.report_excluded_stores е единственият
-- източник и за SQL, и за портала (shared.js го чете в същия комит).
-- Без този обхват двата логистични склада и Централен офис (0 входящи реда
-- към 27.09.2026) щяха да получат отметки — редове, които не влизат в никой
-- знаменател, но замърсяват историята.
--
-- Липсва ли ключът, transit_mark_empty_stores() НЕ прави нищо и вдига warning.
-- Нарочно няма резервен списък в SQL: това е кронова функция, а мълчаливото
-- падане към твърд списък е точно начинът да се появи трети източник.
--
-- Rollback: supabase/migrations/20260928001552_transit_empty_stores_down.sql

-- ═══ 1. ЕДИНСТВЕНИЯТ СПИСЪК НА ИЗКЛЮЧЕНИТЕ ОБЕКТИ ══════════════════════════
-- Стойността е JSON масив. Форматът е изричен (не „имена, разделени със
-- запетая"), защото име с запетая е възможно, а два формата значат две
-- разчитания.
insert into public.app_settings (key, value)
values ('report_excluded_stores',
        '["Централен офис","Логистичен склад Добрич","Логистичен склад Търговище","Пазарджик","Сервиз Троян"]')
on conflict (key) do nothing;

create or replace function public.report_excluded_stores()
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v text;
  arr text[];
begin
  select value into v from app_settings where key = 'report_excluded_stores';
  if v is null or btrim(v) = '' then
    return null;    -- null = „не знам", извикващият спира
  end if;
  begin
    select array(select jsonb_array_elements_text(v::jsonb)) into arr;
  exception when others then
    raise warning 'report_excluded_stores: стойността не е JSON масив (%)', v;
    return null;
  end;
  return arr;
end
$function$;

comment on function public.report_excluded_stores() is
  'Изключените от отчетите обекти, от app_settings.report_excluded_stores (JSON масив). NULL = липсващ или невалиден ключ — извикващият НЕ бива да продължава с празен списък. Същият ключ чете и порталът (shared.js).';

-- ═══ 2. ОТМЯТАНЕ НА ОБЕКТИТЕ БЕЗ ВХОДЯЩИ РЕДОВЕ ════════════════════════════
create or replace function public.transit_mark_empty_stores()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today   date := (now() at time zone 'Europe/Sofia')::date;
  v_excl    text[] := report_excluded_stores();
  v_quiet   interval := interval '10 minutes';
  t         record;
  v_from    timestamptz;
  v_rows    integer;
  v_last    timestamptz;
  v_stores  text[];
  v_n       integer := 0;   -- отметнати
  v_d       integer := 0;   -- махнати при допълващ импорт
  v_tmp     integer;
begin
  if v_excl is null then
    raise warning 'transit_mark_empty_stores: няма app_settings.report_excluded_stores — нищо не се прави';
    return 0;
  end if;

  for t in
    select bt.id, bt.bulletin_id, bt.starts_on, bt.target_stores,
           coalesce(bt.due_dates[1], bt.due_date) as due
      from bulletin_tasks bt
     where bt.linked_module = 'transit'
       and bt.auto_complete
       and coalesce(cardinality(bt.due_dates), 0) <= 1
       and coalesce(bt.due_dates[1], bt.due_date) is not null
       and coalesce(bt.due_dates[1], bt.due_date) >= v_today - 14
  loop
    /* Прозорецът е същият като в transit_store_done_since(): при „в сила от"
       се броят само редовете, внесени от starts_on − 7 дни насам. */
    v_from := case when t.starts_on is null then null
                   else ((t.starts_on - 7)::timestamp at time zone 'Europe/Sofia') end;

    select count(*), max(created_at) into v_rows, v_last
      from goods_transit
     where direction = 'incoming'
       and (v_from is null or created_at >= v_from);

    /* 1. импортът не е дошъл → никой не се отмята по това правило */
    if v_rows = 0 then continue; end if;
    /* 2. импортът още върви (порции по 50) → изчаква се тишината */
    if v_last > now() - v_quiet then continue; end if;

    v_stores := case
      when t.target_stores is not null and cardinality(t.target_stores) > 0 then t.target_stores
      else array(select distinct u.store_name
                   from users u
                  where u.store_name is not null
                    and not (u.store_name = any(v_excl)))
    end;

    /* ── отмятане на празните ── */
    insert into task_completions
           (task_id, bulletin_id, store_name, completed_by, completed_at,
            status, completion_date)
    select t.id, t.bulletin_id, s, 'auto:transit-empty', now(), 'done', t.due
      from unnest(v_stores) as s
     where not exists (
             select 1 from goods_transit g
              where g.store_name = s and g.direction = 'incoming'
                and (v_from is null or g.created_at >= v_from))
    on conflict (task_id, store_name, completion_date)
       where task_id is not null and completion_date is not null
    do nothing;
    /* Броят е от INSERT-а, не от повторено пресмятане на кандидатите: при
       on conflict do nothing вторите са повече от първите. */
    get diagnostics v_tmp = row_count;
    v_n := v_n + coalesce(v_tmp, 0);

    /* ── самопочистване: обектът ВЕЧЕ има редове → отметката пада ──
       Само 'auto:transit-empty' и само докато срокът не е минал. */
    if t.due >= v_today then
      delete from task_completions tc
       where tc.task_id = t.id
         and tc.completion_date = t.due
         and tc.completed_by = 'auto:transit-empty'
         and exists (
               select 1 from goods_transit g
                where g.store_name = tc.store_name and g.direction = 'incoming'
                  and (v_from is null or g.created_at >= v_from));
      get diagnostics v_tmp = row_count;
      v_d := v_d + coalesce(v_tmp, 0);
    end if;
  end loop;

  return v_n + v_d;
end
$function$;

comment on function public.transit_mark_empty_stores() is
  'Отмята задачите „Стока на път" (linked_module=transit + auto_complete) за обектите БЕЗ нито един входящ ред в прозореца на задачата, с completed_by=auto:transit-empty. Пипа само когато импортът е дошъл (поне един ред) и е приключил (последният ред е на 10+ минути). Маха своята отметка, ако обектът получи редове, докато срокът не е минал. Вика се от крон на всеки час.';

-- ═══ 3. КРОНЪТ ═════════════════════════════════════════════════════════════
-- На всеки час. Идемпотентна е: частичните уникални индекси върху
-- task_completions поемат повторното пускане, а изтриването е с условие.
select cron.schedule('transit-empty-stores', '0 * * * *',
                     'select public.transit_mark_empty_stores();');
