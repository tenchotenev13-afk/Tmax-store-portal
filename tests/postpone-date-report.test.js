/* Отлагане с точна дата — ОТЧЕТИТЕ (report.js + двете едж функции).

   Правилото е едно: явяването се брои там, където РЕАЛНО се очаква. Оттам
   излизат шест следствия, всяко със своя секция:

     1. РЕШЕТКАТА. Клетка с postponed_to на ПЪРВОНАЧАЛНИЯ ден получава
        състояние 'moved' (глиф „→") — независимо от статуса, тоест и
        отметнатото пренесено явяване не зачита стария ден. Излиза и от
        числителя, И от знаменателя му, точно като 'na'.
     2. НОВАТА ДАТА. Там явяването е ДЪЛЖИМО: done, ако редът е отметнат,
        иначе missing.
     3. ДРУГА СЕДМИЦА. Извън знаменателя на старата, вътре в новата —
        седмичният колектор тегли и пренесените В седмицата (отделна заявка
        по postponed_to, както в checklist.js).
     4. СЛЯТО ЯВЯВАНЕ. Пренесено в ден, в който постоянната задача и без
        това е дължима → ЕДНО явяване, не две колони (решение 5).
     5. СПИСЪКЪТ „Отложени" носи „→ дд.мм"; стар ред без дата — както сега.
     6. ДНЕВНИЯТ отчет за първоначалната дата казва „отложена → дата", не
        „пропусната"; за новата дата задачата е дължима.
     7. ЛИЧНИЯТ (маршрутизиран) отчет: пренеслият извън прозореца обект
        излиза от обхвата на картичката, а не се изброява като „не изпълнил".

   ⚠️ Никакви фиксирани календарни дати за колекторите: седмицата се смята
   от същите помощници, които ползва и кодът под тест.

   Пускане: node tests/postpone-date-report.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };
const TR = 'Троян', LV = 'Ловеч', SV = 'Севлиево';
const STORES = [TR, LV, SV];

function env(data) {
  return boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: data || {} });
}

/* ── Помощници за дати, независими от кода под тест ─────────────────────── */
function isoOf(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function shiftISO(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoOf(d);
}
const dm = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);

/* Фиксирани дати са допустими САМО за reportBuildSummary — той не пита
   часовника, а получава явяванията и отмятанията наготово. */
const MON = '2026-08-17', TUE = '2026-08-18', WED = '2026-08-19';
const SAT = '2026-08-22', NEXT_MON = '2026-08-24';

function comp(o) {
  return Object.assign({
    item_id: 't-1', kind: 'regular', store_name: TR, status: 'done',
    comment: '', photos: [], files: [], completion_date: MON, postponed_to: null
  }, o);
}
function item(o) {
  return Object.assign({ id: 't-1', kind: 'regular', title: 'Палети', target_stores: null }, o);
}

(async function () {

  /* ═══ 1. Решетката: 'moved' на първоначалния ден ═══════════════════════ */
  section('1. Клетка с postponed_to → „→", извън числителя и знаменателя');
  {
    const { w } = env();
    /* Две явявания: понеделник и вторник. Троян е пренесъл понеделника за
       вторник, Ловеч не е пипал нищо. */
    const items = [item({ date: MON, title: 'Палети (17.08)' }), item({ date: TUE, title: 'Палети (18.08)' })];
    const comps = [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: TUE, comment: 'нямаше стока' }),
      comp({ store_name: LV, status: 'done', completion_date: MON })
    ];
    const s = w.reportBuildSummary(items, comps, [TR, LV], 0);
    const tr = s.rows.filter(r => r.name === TR)[0];
    const lv = s.rows.filter(r => r.name === LV)[0];
    /* Вторникът е ДЪЛЖИМ и още неизпълнен — редът е отложен ЗА него, значи
       състоянието му е 'postponed', не 'missing': обектът е казал кога ще го
       направи. Понеделникът е 'moved' и пада от дробта. */
    ok('Троян: понеделникът е „moved", вторникът е дължим',
      tr.cells.join(',') === 'moved,postponed', tr.cells.join(','));
    ok('знаменателят на Троян е 1, не 2', tr.total === 1, String(tr.total));
    ok('Ловеч не е засегнат: done, missing', lv.cells.join(',') === 'done,missing', lv.cells.join(','));
    ok('глифът на „moved" е стрелка', w.reportGridCellHtml('moved').indexOf('→') >= 0,
      w.reportGridCellHtml('moved'));
    ok('и не е същият като на „пропусната"',
      w.reportGridCellHtml('moved') !== w.reportGridCellHtml('missing'));

    /* ОТМЕТНАТОТО пренесено явяване пак не зачита стария ден: редът пази
       status='done' върху първоначалния си completion_date. */
    const done = w.reportBuildSummary(items, [
      comp({ store_name: TR, status: 'done', completion_date: MON, postponed_to: TUE })
    ], [TR], 0);
    const trDone = done.rows[0];
    ok('отметнатото пренесено: старият ден е „moved", не „done"',
      trDone.cells[0] === 'moved', trDone.cells.join(','));
    ok('а новият ден е изпълнен', trDone.cells[1] === 'done', trDone.cells.join(','));
    ok('дробта е 1 от 1', trDone.done === 1 && trDone.total === 1,
      trDone.done + '/' + trDone.total);
  }

  section('1б. КОНТРОЛА: същият ред БЕЗ дата се държи както досега');
  {
    const { w } = env();
    const items = [item({ date: MON }), item({ date: TUE })];
    const s = w.reportBuildSummary(items, [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: null })
    ], [TR], 0);
    ok('стар отложен ред: клетката е „postponed", не „moved"',
      s.rows[0].cells.join(',') === 'postponed,missing', s.rows[0].cells.join(','));
    ok('и остава в знаменателя', s.rows[0].total === 2, String(s.rows[0].total));
  }

  section('1в. Пренесено ВЪТРЕ в диапазона на седмично явяване не е пренесено');
  {
    /* Задача без собствен срок важи за цялата седмица (dateFrom..dateTo).
       Отлагане от понеделник за сряда не я мести никъде — денят ѝ и без това
       е „някога тази седмица". */
    const { w } = env();
    const items = [item({ dateFrom: MON, dateTo: '2026-08-23', date: null })];
    const s = w.reportBuildSummary(items, [
      comp({ store_name: TR, status: 'done', completion_date: MON, postponed_to: WED })
    ], [TR], 0);
    ok('клетката е „done", не „moved"', s.rows[0].cells.join(',') === 'done', s.rows[0].cells.join(','));
    ok('и явяването си остава в знаменателя', s.rows[0].total === 1, String(s.rows[0].total));
  }

  /* ═══ 2. Новата дата е дължима ══════════════════════════════════════════ */
  section('2. Пренесеното явяване се съпоставя с НОВИЯ си ден');
  {
    const { w } = env();
    /* Явяване САМО за вторник (задачата не е дължима в понеделник), а редът
       идва от понеделник — типичното „пренесена от миналата седмица". */
    const carried = item({ date: TUE, target_stores: [TR], carried_to: TUE, carried_from: MON,
                           title: 'Палети (⏱ пренесена от 17.08)' });
    const s = w.reportBuildSummary([carried], [
      comp({ store_name: TR, status: 'done', completion_date: MON, postponed_to: TUE })
    ], [TR, LV], 0);
    const tr = s.rows.filter(r => r.name === TR)[0];
    const lv = s.rows.filter(r => r.name === LV)[0];
    ok('за своя обект явяването е изпълнено', tr.cells.join(',') === 'done', tr.cells.join(','));
    ok('за чуждия обект то изобщо не важи', lv.cells.join(',') === 'na', lv.cells.join(','));
    ok('знаменателят на Ловеч е 0', lv.total === 0, String(lv.total));

    const pend = w.reportBuildSummary([carried], [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: TUE })
    ], [TR], 0);
    ok('неотметнатото пренесено явяване е „пропуснато", не „moved"',
      pend.rows[0].cells.join(',') === 'postponed', pend.rows[0].cells.join(','));
    ok('и влиза в знаменателя на новия ден', pend.rows[0].total === 1, String(pend.rows[0].total));
  }

  /* ═══ 3. reportCarriedItems: слятото явяване е ЕДНО ════════════════════ */
  section('3. Слято явяване: пренесено в ден, който вече е дължим');
  {
    const { w } = env();
    const lookup = () => ({ id: 'r-1', title: 'Каса' });
    const rec = { id: 'r-1', kind: 'recurring', title: 'Каса (19.08)', target_stores: null, date: WED };
    const carriedRow = { item_id: 'r-1', kind: 'recurring', store_name: TR,
                         completion_date: MON, postponed_to: WED };
    const merged = w.reportCarriedItems([carriedRow], [rec], lookup);
    ok('НЕ се добавя втора колона за слятото явяване', merged.length === 0,
      JSON.stringify(merged.map(x => x.title)));

    /* Същият ред, но новият ден НЕ е дължим (събота) → отделно явяване. */
    const apart = w.reportCarriedItems(
      [{ item_id: 'r-1', kind: 'recurring', store_name: TR, completion_date: MON, postponed_to: SAT }],
      [rec], lookup);
    ok('недължимият ден дава СВОЕ явяване', apart.length === 1, String(apart.length));
    if (apart.length) {
      ok('с дата НОВИЯ ден', apart[0].date === SAT, String(apart[0].date));
      ok('само за своя обект', JSON.stringify(apart[0].target_stores) === JSON.stringify([TR]),
        JSON.stringify(apart[0].target_stores));
      ok('заглавието казва откъде е пренесена',
        apart[0].title.indexOf('пренесена от ' + dm(MON)) >= 0, apart[0].title);
      ok('срезът „по задачи" го групира при задачата', apart[0].baseTitle === 'Каса', apart[0].baseTitle);
    }
    /* Задача, чието заглавие не може да се намери, не влиза с
       „(неизвестна задача)". */
    const nameless = w.reportCarriedItems(
      [{ item_id: 'r-9', kind: 'recurring', store_name: TR, completion_date: MON, postponed_to: SAT }],
      [rec], () => null);
    ok('без намерена задача редът се пропуска', nameless.length === 0, String(nameless.length));
    /* Собственото явяване не важи за обекта (target_stores) → пренесеното
       пак получава своя колона. */
    const scoped = w.reportCarriedItems([carriedRow],
      [Object.assign({}, rec, { target_stores: [LV] })], lookup);
    ok('чуждото явяване не отменя пренесеното', scoped.length === 1, String(scoped.length));
  }

  /* ═══ 3б. Седмичният колектор: пренесено ОТ друга седмица ═════════════ */
  section('3б. Седмичният отчет тегли и пренесените В седмицата');
  {
    /* Задача от ПО-СТАР бюлетин, пренесена в отчетната седмица. По
       completion_date тя не влиза в нито една заявка на този отчет — идва
       само от заявката по postponed_to, а заглавието ѝ се дотегля по id. */
    const probe = env();
    const target = probe.w.reportWeekOfMonday(probe.w.reportPrevWeekMonday(new Date()));
    const days = probe.w.weekDays(target.week, target.year).map(probe.w.toLocalISO);
    probe.close();
    const prevThu = shiftISO(days[0], -4);

    const rows = [{ id: 'c-old', task_id: 't-old', recurring_task_id: null, store_name: TR,
                    status: 'postponed', completion_date: prevThu, postponed_to: days[2],
                    comment: 'нямаше стока', photos: null, files: null }];
    const h = env({
      bulletins: [{ id: 'b-now', status: 'published', week_number: target.week, year: target.year }],
      bulletin_tasks: url => {
        const pool = [
          { id: 't-now', bulletin_id: 'b-now', title: 'Тазседмична', department: 'trade',
            task_type: 'info', due_date: days[1], due_dates: null, target_stores: null },
          { id: 't-old', bulletin_id: 'b-old', title: 'Стара от миналата седмица', department: 'trade',
            task_type: 'info', due_date: prevThu, due_dates: null, target_stores: null }
        ];
        const mb = /bulletin_id=eq\.([^&]+)/.exec(url);
        if (mb) return pool.filter(t => t.bulletin_id === mb[1]);
        const mi = /[?&]id=in\.\(([^)]*)\)/.exec(url);
        if (mi) { const ids = mi[1].split(','); return pool.filter(t => ids.indexOf(String(t.id)) >= 0); }
        return pool;
      },
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: url => {
        if (/postponed_to=gte\./.test(url)) {
          const lo = /postponed_to=gte\.([^&]+)/.exec(url)[1], hi = /postponed_to=lte\.([^&]+)/.exec(url)[1];
          return rows.filter(r => r.postponed_to >= lo && r.postponed_to <= hi);
        }
        if (/completion_date=gte\./.test(url)) {
          const lo = /completion_date=gte\.([^&]+)/.exec(url)[1], hi = /completion_date=lte\.([^&]+)/.exec(url)[1];
          return rows.filter(r => r.completion_date >= lo && r.completion_date <= hi);
        }
        return [];
      },
      users: STORES.map(s => ({ store_name: s })),
      report_snapshots: [], differences_reports: [], stock_returns: [], kasa_storno: [],
      kasa_zoborot: [], goods_transit: [], transport_pallets: [], client_orders: [],
      transport_orders: [], daily_turnover: [], stock_differences: []
    });

    let data = null;
    if (guard('collectWeeklyReportData не хвърля', () => h.w.collectWeeklyReportData(d => { data = d; }))) {
      for (let i = 0; i < 60 && !data; i++) await ticks();
      if (ok('седмичните данни се събират', !!data, 'няма данни')) {
        const titles = (data.items || []).map(x => x.title);
        ok('пренесената задача има СВОЕ явяване в тази седмица',
          titles.some(t => t.indexOf('Стара от миналата седмица') >= 0), JSON.stringify(titles));
        ok('и то казва откъде е пренесена',
          titles.some(t => t.indexOf('пренесена от ' + dm(prevThu)) >= 0), JSON.stringify(titles));
        const carriedIdx = titles.findIndex(t => t.indexOf('Стара от миналата седмица') >= 0);
        const tr = data.rows.filter(r => r.name === TR)[0];
        const lv = data.rows.filter(r => r.name === LV)[0];
        ok('за своя обект явяването се брои', tr.total === 2, tr.done + '/' + tr.total);
        ok('за чуждия обект не се брои', lv.total === 1, lv.done + '/' + lv.total);
        ok('клетката му е отложена, не пропусната',
          carriedIdx >= 0 && tr.cells[carriedIdx] === 'postponed', tr.cells.join(','));
        ok('чуждият обект я вижда като „не важи"',
          carriedIdx >= 0 && lv.cells[carriedIdx] === 'na', lv.cells.join(','));
        const byId = h.calls.get.filter(u => /bulletin_tasks/.test(u) && /id=in\./.test(u));
        ok('задачата от чуждия бюлетин се дотегля по id', byId.length === 1, JSON.stringify(byId));
        ok('в списъка „Отложени" е със стрелка към новия ден',
          (data.postponedList || []).some(p => p.to === days[2]), JSON.stringify(data.postponedList));
      }
    }
    h.close();
  }

  /* ═══ 4. Списъкът „Отложени" ═══════════════════════════════════════════ */
  section('4. „Отложени" носи „→ дд.мм"');
  {
    const { w } = env();
    const items = [item({ date: MON })];
    const s = w.reportBuildSummary(items, [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: WED, comment: 'ремонт' }),
      comp({ store_name: LV, status: 'postponed', completion_date: MON, postponed_to: null, comment: 'без дата' })
    ], [TR, LV], 0);
    ok('и двата реда са в списъка', s.postponedList.length === 2,
      JSON.stringify(s.postponedList));
    const withDate = s.postponedList.filter(p => p.store === TR)[0];
    const noDate = s.postponedList.filter(p => p.store === LV)[0];
    ok('пренесеният носи новата дата', withDate && withDate.to === WED, JSON.stringify(withDate));
    ok('старият ред остава без дата', noDate && noDate.to === null, JSON.stringify(noDate));
    const html = w.reportPostponedSectionHtml(s.postponedList);
    ok('в секцията се вижда „→ дд.мм"', html.indexOf('→ ' + dm(WED)) >= 0, html.slice(0, 400));
    ok('редът без дата е БЕЗ стрелка',
      html.split('→').length === 2, 'брой стрелки: ' + (html.split('→').length - 1));
    /* Пренесеният ред обяснява стрелката и в СТАРАТА седмица — затова
       остава в списъка, макар явяването му вече да е в друга седмица. */
    const other = w.reportBuildSummary(items, [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: NEXT_MON })
    ], [TR], 0);
    ok('пренесеното в ДРУГА седмица също е в списъка', other.postponedList.length === 1,
      JSON.stringify(other.postponedList));
    ok('и то със стрелка към новата дата', other.postponedList[0].to === NEXT_MON,
      String(other.postponedList[0].to));
  }

  /* ═══ 5. Срезът „по задачи" ════════════════════════════════════════════ */
  section('5. Срезът „по задачи" не брои пренесените');
  {
    const { w } = env();
    const items = [item({ date: MON, title: 'Палети' })];
    const s = w.reportBuildSummary(items, [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: NEXT_MON })
    ], [TR, LV, SV], 0);
    const h = w.reportByTaskHtml(s, true);
    /* Троян е извън обхвата на задачата за тази седмица → 0 от 2, не 0 от 3. */
    ok('знаменателят по задача е 2, не 3', h.indexOf('2') >= 0 && h.indexOf('/3') < 0, h.slice(0, 500));
  }

  /* ═══ 6. Дневният отчет ════════════════════════════════════════════════ */
  section('6. Дневният отчет: „отложена → дата" вместо пропусната');
  {
    /* Тук вече говорим с колектора, значи датите се смятат от кода. */
    const probe = env();
    const day = probe.w.toLocalISO(probe.w.reportDailyTargetDate(new Date()));
    probe.close();
    const nextDay = shiftISO(day, 1);

    const h = env({
      bulletins: [{ id: 'b-1', status: 'published',
                    week_number: null, year: null }],
      bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [],
      recurring_task_skips: [], task_completions: [], users: STORES.map(s => ({ store_name: s })),
      report_snapshots: [], differences_reports: [], stock_returns: [], kasa_storno: [],
      kasa_zoborot: [], goods_transit: [], transport_pallets: [], daily_turnover: []
    });
    /* Бюлетинът трябва да е за седмицата на отчетния ден — иначе колекторът
       няма от какво да строи задачите. */
    const tw = h.w.reportWeekOfMonday(h.w.reportMondayOfWeek(new h.w.Date(day + 'T12:00:00')));
    h.setData('bulletins', [{ id: 'b-1', status: 'published', week_number: tw.week, year: tw.year }]);
    h.setData('bulletin_tasks', [
      { id: 't-day', bulletin_id: 'b-1', title: 'Опис', department: 'trade',
        task_type: 'info', due_date: day, due_dates: null, target_stores: null }
    ]);
    h.setData('task_completions', url => {
      const rows = [{ id: 'c1', task_id: 't-day', recurring_task_id: null, store_name: TR,
                      status: 'postponed', completion_date: day, postponed_to: nextDay,
                      comment: 'няма ток', photos: null, files: null }];
      if (/postponed_to=eq\.([^&]+)/.test(url)) {
        const m = /postponed_to=eq\.([^&]+)/.exec(url);
        return rows.filter(r => String(r.postponed_to) === m[1]);
      }
      if (/completion_date=eq\.([^&]+)/.test(url)) {
        const m = /completion_date=eq\.([^&]+)/.exec(url);
        return rows.filter(r => String(r.completion_date) === m[1]);
      }
      return rows;
    });

    let data = null;
    if (guard('collectDailyReportData не хвърля', () => h.w.collectDailyReportData(d => { data = d; }))) {
      for (let i = 0; i < 40 && !data; i++) await ticks();
      if (ok('дневните данни се събират', !!data, 'няма данни')) {
        const tr = data.rows.filter(r => r.name === TR)[0];
        ok('клетката на Троян е „moved", не „missing"', tr.cells.join(',') === 'moved', tr.cells.join(','));
        ok('и не влиза в знаменателя му', tr.total === 0, String(tr.total));
        const lv = data.rows.filter(r => r.name === LV)[0];
        ok('чуждият обект си дължи задачата', lv.cells.join(',') === 'missing', lv.cells.join(','));
        ok('списъкът „Отложени" носи новата дата',
          (data.postponedList || []).length === 1 && data.postponedList[0].to === nextDay,
          JSON.stringify(data.postponedList));
        const q = h.calls.get.filter(u => /task_completions/.test(u) && /postponed_to=eq\./.test(u));
        ok('има отделна заявка по postponed_to за отчетния ден', q.length === 1, JSON.stringify(q));
        if (q.length) ok('и тя е точно за него', q[0].indexOf('postponed_to=eq.' + day) >= 0, q[0]);
      }
    }
    h.close();
  }

  /* ═══ 7. Личният (маршрутизиран) отчет ════════════════════════════════ */
  section('7. Личната картичка: пренеслият извън прозореца обект пада от обхвата');
  {
    const { w } = env();
    /* weekFrom/weekTo са седмицата на отчета — колекторът ги закача на всяка
       маршрутизирана задача. По тях се решава пренесеното още ли е тук. */
    const task = { id: 't-1', kind: 'regular', title: 'Палети', target_stores: null,
                   date: MON, dateFrom: null, dateTo: null,
                   weekFrom: MON, weekTo: '2026-08-23' };
    const bd = w.taskStoreBreakdown(task, [
      comp({ store_name: TR, status: 'postponed', completion_date: MON, postponed_to: NEXT_MON }),
      comp({ store_name: LV, status: 'done', completion_date: MON }),
      comp({ store_name: SV, status: 'postponed', completion_date: MON, postponed_to: WED, comment: 'ремонт' })
    ], STORES);
    ok('пренеслият за ДРУГА седмица е извън обхвата',
      bd.scope.indexOf(TR) < 0 && bd.scope.length === 2, JSON.stringify(bd.scope));
    ok('и не е в „не са изпълнили"', bd.pending.indexOf(TR) < 0, JSON.stringify(bd.pending));
    ok('изпълнилият си е изпълнил', bd.done.length === 1 && bd.done[0].store === LV,
      JSON.stringify(bd.done.map(d => d.store)));
    ok('отложеният ВЪТРЕ в прозореца остава отложен',
      bd.postponed.length === 1 && bd.postponed[0].store === SV,
      JSON.stringify(bd.postponed));
    ok('и носи датата за стрелката', bd.postponed[0].to === WED, String(bd.postponed[0].to));
    const card = w.personalizedTaskCardHtml(task, [
      comp({ store_name: SV, status: 'postponed', completion_date: MON, postponed_to: WED, comment: 'ремонт' })
    ], [SV]);
    ok('картичката показва „→ дд.мм"', card.indexOf('→ ' + dm(WED)) >= 0, card.slice(0, 500));
  }

  section('7б. КОНТРОЛА: без отлагане обхватът е пълен');
  {
    const { w } = env();
    const task = { id: 't-1', kind: 'regular', title: 'Палети', target_stores: null, date: MON,
                   weekFrom: MON, weekTo: '2026-08-23' };
    const bd = w.taskStoreBreakdown(task, [comp({ store_name: LV, status: 'done', completion_date: MON })], STORES);
    ok('и трите обекта са в обхвата', bd.scope.length === 3, JSON.stringify(bd.scope));
    ok('двамата без отметка са „не са изпълнили"', bd.pending.length === 2, JSON.stringify(bd.pending));
  }

  report();
})();
