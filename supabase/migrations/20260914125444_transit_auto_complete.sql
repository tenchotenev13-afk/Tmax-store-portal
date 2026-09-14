-- Стока на път: „проверено, не е пристигнало" + автоматично отмятане на задачи
--
-- ═══ ЗАЩО ═══════════════════════════════════════════════════════════════
-- Задачата „Стока на път" в Бюлетина се отмяташе на ръка, ден по ден, докато
-- самата работа живее в goods_transit. Троян обработи 142 реда и излезе 0/4
-- в С37 (14.09.2026), защото чекбоксът е друго място от работата.
--
-- goods_transit е ВИНАГИ една партида: в началото на месеца се изчиства и се
-- импортва наново. Затова задачата не сочи партида (без period) — тя се
-- мери спрямо текущото съдържание на таблицата.
--
-- ═══ НОВО СЪСТОЯНИЕ: „ПРОВЕРЕНО, НЕ Е ПРИСТИГНАЛО" ═══════════════════════
-- status='pending' досега значеше И „непипнат", И „проверен, стоката още я
-- няма". reviewed_at/reviewed_by са изричното твърдение на обекта за второто.
-- Статусите НЕ се пипат: reviewed_at е отделна колона, тоест няма нова
-- стойност в status и нищо надолу по веригата не се чупи.
-- Приемане/неприемане в transit.js чисти reviewed_at (там живее правилото).
--
-- ═══ КРИТЕРИЙ ЗА ИЗПЪЛНЕНО ПО ОБЕКТ ═════════════════════════════════════
--   · само direction='incoming' — при изходящ и трансфер отговаря другата
--     страна (същото правило като checklistTransitValue в checklist.js);
--   · обектът има ПОНЕ ЕДИН входящ ред (решение 1: обект без входящи НЕ се
--     отмята — както чек листът оставя празна клетка вместо „0/0");
--   · нито един входящ ред не е pending (или NULL) с празно reviewed_at.
--
-- ═══ ЗАПИСЪТ ════════════════════════════════════════════════════════════
-- Отметката е РЕД в task_completions, не смятане при рендер: отчетите
-- (send-scheduled-report, send-routed-report) и известията (bulletin-notify)
-- четат task_completions. Така Бюлетинът и имейлът броят едно и също.
--   · само bulletin_tasks с linked_module='transit' И auto_complete;
--   · само еднодневни (cardinality(due_dates) <= 1) — клиентът не позволява
--     повече, а базата не отгатва кой от няколко дни е „денят";
--   · completion_date = срокът (due_dates[1], иначе due_date — клиентът
--     пише двете с една и съща стойност);
--   · срок >= днес − 14 дни (Europe/Sofia): не пренаписва стари седмици;
--   · target_stores се спазва;
--   · completed_by='auto:transit', comment='всички редове обработени';
--   · НЕ трие, ако ред се върне в pending — историята остава;
--   · съществуващ ред status='postponed' за същия ден СТАВА done (решение 3):
--     postponed_to и коментарът за отлагането се пазят, сменят се само
--     status, completed_by, completed_at — точно както при ръчно изпълнение
--     на отложена задача ред остава един;
--   · съществуващ done ред не се пипа;
--   · чернови бюлетини не се филтрират (решение 4): магазин черновата не я
--     вижда, а публикуването не пуска тригер.
--
-- ═══ ТРИГЕРИТЕ ══════════════════════════════════════════════════════════
-- goods_transit: FOR EACH STATEMENT с преходни таблици — импортът пише по 50
-- реда в заявка, тоест синхронизацията тече веднъж на обект на заявка, не
-- 50 пъти. PostgreSQL не позволява преходни таблици заедно с два вида
-- събития или със списък колони, затова са три тригера (INSERT, UPDATE,
-- DELETE) и UPDATE хваща всяка колона (включително reviewed_at). При UPDATE
-- се синхронизира и старият store_name. DELETE е добавен след прегледа на
-- supabase-guard: изтрит последен pending ред иначе не пуска нищо.
--
-- ОТВОРЕНО (решение за човек): горна граница на срока няма — изчистен в
-- понеделник обект получава отметка и за задача с петъчен срок, а нов pending
-- в сряда не я отменя (редът не се трие).
-- bulletin_tasks (решение 2): нова/редактирана автоматична задача при вече
-- изчистен обект — без него такава задача никога не се отмята, защото в
-- goods_transit няма какво да се промени (14.09.2026: 9 такива обекта).
-- Грешка в синхронизацията НЕ проваля записа в goods_transit/bulletin_tasks —
-- пише се WARNING. Иначе проблем в Бюлетина би спрял бутона „Прието".
--
-- Функциите са SECURITY DEFINER и EXECUTE е отнет от anon/authenticated:
-- не са RPC. Supabase дава EXECUTE на anon по подразбиране за нова функция.
--
-- ═══ ЗАВАРЕНИТЕ ДАННИ (правило 9, проверено 14.09.2026) ═════════════════
-- Входящи pending редове по обекти: Севлиево 86, Дупница 77 (и 77-те с
-- коментар), Пирдоп 77, Шумен 53, Козлодуй 33, Троян 29, Габрово 10,
-- Силистра 6, Враца 5, Добрич 1 — общо 377 при 10 обекта.
-- 0 pending (биха били изпълнени): Гоце Делчев, Карлово, Кърджали, Монтана,
-- Петрич, Раднево, Сервиз Троян, Сливен, Търговище.
-- Без нито един входящ: Логистичен склад Търговище (не се отмята).
-- Редове със status IS NULL: 0.
-- Засегнати съществуващи редове: 0 — колоните са нови (NULL / false), нито
-- една от 52-те задачи няма auto_complete, тоест С36/С37 остават ръчни.
-- reviewed_at НЕ се попълва със задна дата (решение 5): „проверено" е
-- твърдение на обекта, не извод от коментар.
--
-- Нови колони → Живко обновява mirror-schema.sql и $TableColumns:
--   goods_transit.reviewed_at, goods_transit.reviewed_by,
--   bulletin_tasks.auto_complete
-- Rollback: supabase/migrations/20260914125444_transit_auto_complete_down.sql

-- ── колони ───────────────────────────────────────────────────────────────
alter table public.goods_transit
  add column reviewed_at timestamptz,
  add column reviewed_by text;

alter table public.bulletin_tasks
  add column auto_complete boolean not null default false;

comment on column public.goods_transit.reviewed_at is
  'Обектът е проверил реда и стоката още не е пристигнала. Само при status=pending; приемане/неприемане го чисти. NULL = непроверен.';
comment on column public.goods_transit.reviewed_by is
  'Кой е отбелязал „проверено, не е пристигнало".';
comment on column public.bulletin_tasks.auto_complete is
  'Отмята се автоматично от модула (засега само linked_module=transit, еднодневна задача). Ръчният чекбокс е заключен.';

-- ── изчистен ли е обектът ────────────────────────────────────────────────
create or replace function public.transit_store_done(p_store text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from goods_transit
            where store_name = p_store and direction = 'incoming')
     and not exists (
           select 1 from goods_transit
            where store_name = p_store and direction = 'incoming'
              and coalesce(status, 'pending') = 'pending'
              and reviewed_at is null);
$$;

comment on function public.transit_store_done(text) is
  'true, ако обектът има поне един входящ ред в goods_transit и нито един входящ pending без reviewed_at.';

-- ── запис на отметките за един обект ─────────────────────────────────────
create or replace function public.transit_sync_completions(p_store text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_n     integer := 0;
begin
  if p_store is null or not transit_store_done(p_store) then
    return 0;
  end if;

  insert into task_completions
         (task_id, bulletin_id, store_name, completed_by, completed_at,
          status, completion_date, comment)
  select bt.id, bt.bulletin_id, p_store, 'auto:transit', now(),
         'done', coalesce(bt.due_dates[1], bt.due_date), 'всички редове обработени'
    from bulletin_tasks bt
   where bt.linked_module = 'transit'
     and bt.auto_complete
     and coalesce(cardinality(bt.due_dates), 0) <= 1
     and coalesce(bt.due_dates[1], bt.due_date) is not null
     and coalesce(bt.due_dates[1], bt.due_date) >= v_today - 14
     and (bt.target_stores is null
          or cardinality(bt.target_stores) = 0
          or p_store = any(bt.target_stores))
  on conflict (task_id, store_name, completion_date)
     where task_id is not null and completion_date is not null
  do update set status       = 'done',
                completed_by = excluded.completed_by,
                completed_at = excluded.completed_at
          where task_completions.status = 'postponed';

  get diagnostics v_n = row_count;
  return v_n;
end
$$;

comment on function public.transit_sync_completions(text) is
  'Записва done за автоматичните transit задачи на обекта, ако transit_store_done. Не трие; postponed за същия ден става done (postponed_to и коментарът се пазят).';

-- ── тригер: goods_transit (веднъж на обект на заявка) ────────────────────
create or replace function public.goods_transit_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  -- new_rows има при INSERT и UPDATE, old_rows при UPDATE и DELETE; plpgsql
  -- планира всяка заявка чак при изпълнение, затова клоновете са отделни,
  -- а не един union с where tg_op.
  if tg_op = 'INSERT' then
    for s in select distinct store_name from new_rows loop
      begin
        perform transit_sync_completions(s);
      exception when others then
        raise warning 'transit_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  elsif tg_op = 'DELETE' then
    for s in select distinct store_name from old_rows loop
      begin
        perform transit_sync_completions(s);
      exception when others then
        raise warning 'transit_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  else
    for s in select store_name from new_rows union select store_name from old_rows loop
      begin
        perform transit_sync_completions(s);
      exception when others then
        raise warning 'transit_sync_completions(%): %', s, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end
$$;

create trigger goods_transit_sync_ins
  after insert on public.goods_transit
  referencing new table as new_rows
  for each statement execute function public.goods_transit_sync_trg();

create trigger goods_transit_sync_upd
  after update on public.goods_transit
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.goods_transit_sync_trg();

-- Изтрит последен pending ред (✕ в transit.js) също изчиства обекта.
-- „Изчисти всички" в началото на месеца минава оттук безвредно: обект без
-- входящи редове не се отмята.
create trigger goods_transit_sync_del
  after delete on public.goods_transit
  referencing old table as old_rows
  for each statement execute function public.goods_transit_sync_trg();

-- ── тригер: bulletin_tasks (нова/редактирана автоматична задача) ─────────
create or replace function public.bulletin_tasks_transit_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  if new.linked_module is distinct from 'transit' or not coalesce(new.auto_complete, false) then
    return null;
  end if;
  for s in select distinct store_name from goods_transit loop
    begin
      perform transit_sync_completions(s);
    exception when others then
      raise warning 'transit_sync_completions(%): %', s, sqlerrm;
    end;
  end loop;
  return null;
end
$$;

create trigger bulletin_tasks_transit_sync
  after insert or update of auto_complete, linked_module, due_date, due_dates, target_stores
  on public.bulletin_tasks
  for each row execute function public.bulletin_tasks_transit_sync_trg();

-- ── права: функциите не са RPC ───────────────────────────────────────────
revoke all on function public.transit_store_done(text)          from public, anon, authenticated;
revoke all on function public.transit_sync_completions(text)    from public, anon, authenticated;
revoke all on function public.goods_transit_sync_trg()          from public, anon, authenticated;
revoke all on function public.bulletin_tasks_transit_sync_trg() from public, anon, authenticated;
