/* Еднократна задача с ПРОЗОРЕЦ в БРОЕНЕТО (т.4 от 01.10.2026).

   Това е същината на повода. С39 „Излагане палето зони" (4 дни) показа 15 от
   18 обекта под норма при свършена работа, защото седмичният отчет разгъваше
   многодневната задача на ЕДИН ЕЛЕМЕНТ ЗА ВСЕКИ ДЕН: четири единици в
   знаменателя, а една свършена работа затваря само своя ден → 1/4.

   С due_window задачата е ЕДНО явяване с ДИАПАЗОН (dateFrom..dateTo) и
   отмятане където и да е в прозореца я затваря — дословно моделът на
   прозоречната ПОСТОЯННА задача (recurring-window-report.test.js).
   В дневния отчет и в „Днес" се явява само в деня на СРОКА, иначе обектът
   излиза неизпълнил на всеки ден от прозореца и се брои толкова пъти.

   Всяка секция има КОНТРОЛА — същата задача без флага. Без нея тестът би
   минавал и ако задачата просто е изчезнала отвсякъде.

   ⚠️ Никакви фиксирани календарни дати: котва + отместване, часовникът
   замразен на конкретен ден.

   Пускане: node tests/task-window-report.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва: понеделникът от текущата реална седмица ──────────────────────── */
const ANCHOR_MON = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
function dateAt(n) { const d = new Date(ANCHOR_MON.getTime()); d.setDate(d.getDate() + n); return d; }
function isoAt(n) {
  const d = dateAt(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}
function freezeAt(w, n) {
  const Real = w.Date, fixedMs = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2), THU = isoAt(3);

const STORE = 'Троян';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const TITLE = 'Излагане палето зони';

/* Фалшив PostgREST, който ЗАЧИТА eq/gte/lte/in — иначе промяната по самата
   заявка (regDateQ) не би се проверила от нищо. */
function pgFake(rows) {
  return function (url) {
    const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
    const preds = [];
    qs.split('&').forEach(function (p) {
      const i = p.indexOf('=');
      if (i < 0) return;
      const col = decodeURIComponent(p.slice(0, i));
      const val = decodeURIComponent(p.slice(i + 1));
      if (col === 'select' || col === 'order' || col === 'limit') return;
      const m = /^(eq|gte|lte)\.([\s\S]*)$/.exec(val);
      if (m) {
        preds.push(r => {
          const v = r[col];
          if (v === null || v === undefined) return false;
          const x = String(v);
          return m[1] === 'eq' ? x === m[2] : m[1] === 'gte' ? x >= m[2] : x <= m[2];
        });
        return;
      }
      const mi = /^in\.\(([\s\S]*)\)$/.exec(val);
      if (mi) {
        const list = mi[1] ? mi[1].split(',') : [];
        preds.push(r => list.indexOf(String(r[col])) >= 0);
        return;
      }
      if (val === 'not.is.null') { preds.push(r => r[col] !== null && r[col] !== undefined); return; }
      if (val === 'is.null') { preds.push(r => r[col] === null || r[col] === undefined); return; }
    });
    return rows.filter(r => preds.every(f => f(r)));
  };
}

function winTask(over) {
  return Object.assign({
    id: 't-win', bulletin_id: 'b-1', title: TITLE, description: null,
    department: 'trade', task_type: 'info', sort_order: 1,
    due_date: MON, due_dates: [MON, TUE, WED], due_window: true,
    spans_from: null, starts_on: null,
    target_stores: null, report_groups: null, linked_module: null, auto_complete: false
  }, over || {});
}
function comp(date, over) {
  return Object.assign({
    id: 'c1', task_id: 't-win', recurring_task_id: null, store_name: STORE,
    status: 'done', completion_date: date, completed_by: 'Иван', completed_at: date + 'T09:00:00',
    comment: null, photos: null, files: null, postponed_to: null
  }, over || {});
}

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: ADMIN, data: {}
  });
  const w = h.w;
  freezeAt(w, opts.at === undefined ? 2 : opts.at);
  const wkDate = dateAt(0);
  const bul = {
    id: 'b-1', week_number: w.weekNum(wkDate), year: isoWeekYear(wkDate),
    status: 'published', created_at: isoAt(0),
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.DKEYS.forEach(k => { bul.content.calendar[k] = []; });
  h.setData('bulletins', [bul]);
  h.setData('recurring_tasks', []);
  h.setData('recurring_task_versions', []);
  h.setData('bulletin_tasks', url =>
    (url.indexOf('spans_from=not.is.null') >= 0 ? [] : [opts.task || winTask()]));
  h.setData('task_completions', pgFake(opts.comps || []));
  h.setData('users', [{ store_name: STORE }]);
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
   'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
   'transport_orders', 'daily_turnover', 'report_recipients', 'recurring_task_periods',
   'recurring_task_skips', 'bulletin_promotions', 'task_subtasks', 'subtask_completions',
   'notification_schedules'].forEach(t => h.setData(t, []));
  return h;
}
const weekly = h => new Promise(r => { h.w.collectWeeklyReportData(r); });
const daily = h => new Promise(r => { h.w.collectDailyReportData(r); });
async function board(h) { h.w.loadTodayDashboard(); await ticks(); await ticks(); return h.w.todayCache; }
const regCompUrl = h => h.calls.get.filter(u =>
  u.indexOf('/task_completions') >= 0 && u.indexOf('task_id=in.') >= 0 &&
  u.indexOf('recurring_task_id=in.') < 0)[0];

(async function run() {

  section('1. СЕДМИЧЕН отчет: едно явяване, не три');
  {
    const h = env({ at: 6, comps: [comp(MON)] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('знаменателят е 1, не 3', d.totalAll === 1, String(d.totalAll));
      ok('отметката от понеделник я затваря', d.totalDone === 1, String(d.totalDone));
      ok('тоест 100%', d.overallPct === 100, String(d.overallPct));
    }
  }

  section('1б. Отметка в СРЕДНИЯ ден на прозореца също затваря');
  {
    const h = env({ at: 6, comps: [comp(TUE)] });
    const d = await weekly(h);
    ok('пак 1/1', !!d && d.totalAll === 1 && d.totalDone === 1,
      d ? d.totalDone + '/' + d.totalAll : 'null');
  }

  section('1в. Без отметка: 0 от 1, не 0 от 3');
  {
    const h = env({ at: 6, comps: [] });
    const d = await weekly(h);
    ok('знаменателят пак е 1', !!d && d.totalAll === 1, d ? String(d.totalAll) : 'null');
    ok('и нищо не е изпълнено', !!d && d.totalDone === 0, d ? String(d.totalDone) : 'null');
  }

  section('1г. Отметка ИЗВЪН прозореца (четвъртък) не се брои');
  {
    const h = env({ at: 6, comps: [comp(THU)] });
    const d = await weekly(h);
    ok('0 от 1', !!d && d.totalAll === 1 && d.totalDone === 0,
      d ? d.totalDone + '/' + d.totalAll : 'null');
  }

  section('1д. КОНТРОЛА: същата задача без флага → трите стари явявания');
  {
    const h = env({ at: 6, task: winTask({ due_window: false }), comps: [comp(MON)] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d)) {
      /* Точно числото от С39, само с три дни вместо четири. */
      ok('знаменателят е 3', d.totalAll === 3, String(d.totalAll));
      ok('изпълнено е само едно', d.totalDone === 1, String(d.totalDone));
      ok('тоест 33%', d.overallPct === 33, String(d.overallPct));
    }
  }

  section('2. ДНЕВЕН отчет: участва само в деня на СРОКА');
  {
    for (const [n, name, want] of [[0, 'понеделник', false], [1, 'вторник', false],
                                   [2, 'сряда (срокът)', true], [3, 'четвъртък', false]]) {
      const h = env({ at: n, comps: [comp(MON)] });
      const d = await daily(h);
      const has = !!d && (d.items || []).some(i => i.title === TITLE);
      ok('в ' + name + ' задачата ' + (want ? 'Е' : 'НЕ Е') + ' в отчета', has === want,
        d ? JSON.stringify((d.items || []).map(i => i.title)) : 'null');
    }
  }

  section('2б. ДНЕВЕН в деня на срока: отметката от понеделник я затваря');
  {
    const h = env({ at: 2, comps: [comp(MON)] });
    const d = await daily(h);
    if (ok('отчетът се събира', !!d)) {
      ok('отчетният ден е сряда', d.reportDate === WED, String(d.reportDate));
      ok('знаменателят е 1', d.totalAll === 1, String(d.totalAll));
      ok('и е изпълнена', d.totalDone === 1, String(d.totalDone));
    }
    const h2 = env({ at: 2, comps: [] });
    const d2 = await daily(h2);
    ok('без отметка: 0 от 1', !!d2 && d2.totalAll === 1 && d2.totalDone === 0,
      d2 ? d2.totalDone + '/' + d2.totalAll : 'null');
  }

  section('2в. КОНТРОЛА: без флага участва и в понеделник, и във вторник');
  {
    for (const [n, name] of [[0, 'понеделник'], [1, 'вторник'], [2, 'сряда']]) {
      const h = env({ at: n, task: winTask({ due_window: false }), comps: [comp(MON)] });
      const d = await daily(h);
      ok('в ' + name + ' е в отчета',
        !!d && (d.items || []).some(i => i.title === TITLE),
        d ? JSON.stringify((d.items || []).map(i => i.title)) : 'null');
    }
  }

  section('2г. САМАТА ЗАЯВКА се разширява, не само JS филтърът');
  {
    /* Без това отмятането от понеделник изобщо не стига до отчета: заявката
       искаше completion_date=eq.<отчетния ден>. Проверява се URL-ът, защото
       точно той беше причината дневният да показва 0/18 на 09.09.2026. */
    const h = env({ at: 2, comps: [comp(MON)] });
    await daily(h);
    const u = regCompUrl(h);
    if (ok('има заявка за отмятанията на обикновените задачи', !!u, h.calls.get.join('\n'))) {
      ok('долната граница е НАЧАЛОТО на прозореца', u.indexOf('completion_date=gte.' + MON) >= 0, u);
      ok('горната е отчетният ден', u.indexOf('completion_date=lte.' + WED) >= 0, u);
      ok('и вече НЕ е тясното eq.', u.indexOf('completion_date=eq.') < 0, u);
    }
    /* КОНТРОЛА: без прозорец заявката остава дословно каквато беше. */
    const h2 = env({ at: 2, task: winTask({ due_window: false }), comps: [comp(MON)] });
    await daily(h2);
    const u2 = regCompUrl(h2);
    if (ok('и без прозорец има заявка', !!u2)) {
      ok('тя е старото eq.<отчетния ден>', u2.indexOf('completion_date=eq.' + WED) >= 0, u2);
      ok('без диапазон', u2.indexOf('gte.') < 0, u2);
    }
  }

  section('3. ДНЕС: на таблото само в деня на срока, и то изпълнена');
  {
    for (const [n, name, want] of [[0, 'понеделник', false], [1, 'вторник', false],
                                   [2, 'сряда (срокът)', true]]) {
      const h = env({ at: n, comps: [comp(MON)] });
      const c = await board(h);
      const has = !!c && (c.items || []).some(i => i.title === TITLE);
      ok('в ' + name + ' задачата ' + (want ? 'Е' : 'НЕ Е') + ' на таблото', has === want,
        c ? JSON.stringify((c.items || []).map(i => i.title)) : 'няма кеш');
    }
    const h = env({ at: 2, comps: [comp(MON)] });
    const c = await board(h);
    if (ok('таблото се събира', !!c)) {
      const mine = (c.comps || []).filter(x => x.item_id === 't-win' && x.store_name === STORE);
      ok('отмятането от понеделник е прието за ДНЕШНИЯ набор', mine.length === 1,
        JSON.stringify(c.comps || []));
    }
    /* КОНТРОЛА: без флага отмятането от понеделник НЕ важи за сряда. */
    const h2 = env({ at: 2, task: winTask({ due_window: false }), comps: [comp(MON)] });
    const c2 = await board(h2);
    if (ok('таблото се събира и без флага', !!c2)) {
      const mine2 = (c2.comps || []).filter(x => x.item_id === 't-win' && x.store_name === STORE);
      ok('отмятането от понеделник НЕ се брои в сряда', mine2.length === 0,
        JSON.stringify(c2.comps || []));
    }
  }

  section('4. МАРШРУТИЗИРАНОТО писмо: прозорецът е СВОЯТ диапазон, не седмицата');
  {
    const h = env({ at: 6 });
    const w = h.w;
    const wkDates = [0, 1, 2, 3, 4, 5, 6].map(isoAt);
    const bul = { week_number: w.weekNum(dateAt(0)), year: isoWeekYear(dateAt(0)) };
    const t = winTask(); t.kind = 'regular';
    const got = w.reportRoutedTaskWindow(t, wkDates, bul);
    if (ok('връща прозорец', !!got, JSON.stringify(got))) {
      ok('от понеделник', got.dateFrom === MON, String(got.dateFrom));
      ok('до сряда — не до неделя', got.dateTo === WED, String(got.dateTo));
    }
    /* КОНТРОЛА: многодневната без флага пази заварения широк диапазон. */
    const t2 = winTask({ due_window: false }); t2.kind = 'regular';
    const got2 = w.reportRoutedTaskWindow(t2, wkDates, bul);
    ok('без флага диапазонът е цялата седмица',
      !!got2 && got2.dateFrom === wkDates[0] && got2.dateTo === wkDates[6],
      JSON.stringify(got2));
    /* И еднодневната остава с точна дата. */
    const t3 = winTask({ due_dates: [WED], due_window: false }); t3.kind = 'regular';
    const got3 = w.reportRoutedTaskWindow(t3, wkDates, bul);
    ok('еднодневната е с точна дата', !!got3 && got3.date === WED, JSON.stringify(got3));
  }

  section('5. ТАБЛИЦАТА ПО МАГАЗИНИ и АНАЛИЗ — вече броят по ЗАДАЧА, не по ден');
  {
    /* Тези два екрана НЕ бяха пипани в т.4 и секцията съществува, за да го
       ДОКАЖЕ, вместо да го предположи: и двата броят 1 на задача и приемат
       кое да е отмятане (loadTasksStats: dTasks.length + `some(status==='done')`;
       renderBulAnalysis: ds[c.task_id]=1). Тоест прозорецът не променя нищо
       тук, а многодневната БЕЗ флаг също е 1/1 — отклонението от „1/4" е било
       само в отчетите и в дневните изгледи.
       Пада ли секцията, значи някой е направил и тези два екрана да броят по
       ден — и тогава прозорецът трябва да влезе и в тях. */
    const mk = async (task) => {
      const h = env({ at: 2, task: task, comps: [comp(MON)] });
      h.w.bulSelectedId = 'b-1';
      h.w.reportableStoresCache = [STORE];
      h.w.allStoresCache = [STORE];
      if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
      for (let i = 0; i < 60; i++) {
        const el = h.doc.getElementById('tasks-stat-wrap');
        if (el && /\d+\/\d+/.test(el.textContent || '')) break;
        await ticks();
      }
      const el = h.doc.getElementById('tasks-stat-wrap');
      return el ? (el.textContent || '').replace(/\s+/g, ' ') : null;
    };
    const txtWin = await mk(winTask());
    if (ok('таблицата се рендира за прозоречната', !!txtWin, String(txtWin))) {
      ok('показва 1/1 — една задача, отметната', txtWin.indexOf('1/1') >= 0, txtWin);
      ok('и никъде 1/3', txtWin.indexOf('1/3') < 0, txtWin);
    }
    const txtMul = await mk(winTask({ due_window: false }));
    if (ok('таблицата се рендира и за многодневната без флаг', !!txtMul, String(txtMul))) {
      ok('тя също е 1/1 — тоест екранът винаги е броил по задача',
        txtMul.indexOf('1/1') >= 0, txtMul);
    }
  }

  report();
})();
