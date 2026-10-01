/* „🚫 Не се отнася за нас" в ОТЧЕТИТЕ и „Днес" (т.5, 01.10.2026).

   ТВЪРДЕНИЯТА:
   · седмичният и дневният отчет вадят обекта от ДВЕТЕ страни на дробта —
     1/1, не 1/2 — и го изброяват отделно, с причината;
   · редът на обекта в решетката получава клетка 'notapp', различима от
     'missing' и от 'done';
   · „Днес" не го брои и не го показва като пропуснал;
   · отчетът по задача (маршрутизираното писмо) показва „🚫 Не се отнася:
     обект — причина" и намалява „X от Y";
   · маркерът „N поредни седмици" пали на ТРЕТАТА и се прекъсва при пропусната
     седмица;
   · заявката се тегли с ОТДЕЛНА заявка за СЕДМИЦАТА — иначе дневният отчет
     никога не би я видял (редът носи деня на заявяването).

   Всяка секция има КОНТРОЛА без заявката.

   Пускане: node tests/na-report-count.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

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
  const Real = w.Date, ms = dateAt(n).getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2);
const TR = 'Троян', LO = 'Ловеч';
const STORES = [TR, LO];
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const TITLE = 'Излагане палето зони';

/* Фалшив PostgREST, който зачита eq/in/gte/lte — иначе отделната заявка за
   „не се отнася" не би се проверила от нищо. */
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
function task(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', title: TITLE, description: null,
    department: 'trade', task_type: 'info', sort_order: 1,
    due_date: WED, due_dates: [WED], due_window: false,
    spans_from: null, starts_on: null,
    target_stores: null, report_groups: ['controlling'], linked_module: null, auto_complete: false
  }, over || {});
}
function comp(store, status, over) {
  return Object.assign({
    id: 'c-' + store + '-' + status, task_id: 't-1', recurring_task_id: null,
    store_name: store, status: status, completion_date: WED,
    comment: status === 'not_applicable' ? 'обектът няма такъв стелаж' : null,
    completed_by: store, completed_at: WED + 'T09:00:00', postponed_to: null
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
    status: 'published', created_at: MON,
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.DKEYS.forEach(k => { bul.content.calendar[k] = []; });
  h.setData('bulletins', [bul]);
  h.setData('recurring_tasks', opts.recurring || []);
  h.setData('recurring_task_versions', []);
  h.setData('bulletin_tasks', url =>
    (url.indexOf('spans_from=not.is.null') >= 0 ? [] : (opts.tasks || [task('t-1')])));
  h.setData('task_completions', pgFake(opts.comps || []));
  h.setData('users', STORES.map(s => ({ store_name: s })));
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
const cellsOf = (d, store) => {
  const row = (d.rows || []).find(r => r.name === store);
  return row ? row.cells : null;
};

(async function run() {

  section('1. СЕДМИЧЕН: обектът излиза от двете страни на дробта');
  {
    const h = env({ at: 6, comps: [comp(TR, 'done'), comp(LO, 'not_applicable')] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('общо е 1, не 2', d.totalAll === 1, String(d.totalAll));
      ok('изпълнено е 1', d.totalDone === 1, String(d.totalDone));
      ok('тоест 100%', d.overallPct === 100, String(d.overallPct));
      ok('клетката на Ловеч е notapp', (cellsOf(d, LO) || [])[0] === 'notapp',
        JSON.stringify(cellsOf(d, LO)));
      ok('и редът му е 0 от 0', (d.rows.find(r => r.name === LO) || {}).total === 0,
        JSON.stringify(d.rows.find(r => r.name === LO)));
      ok('клетката на Троян е done', (cellsOf(d, TR) || [])[0] === 'done',
        JSON.stringify(cellsOf(d, TR)));
    }
  }

  section('1б. И се ИЗБРОЯВА отделно, с причината');
  {
    const h = env({ at: 6, comps: [comp(TR, 'done'), comp(LO, 'not_applicable')] });
    const d = await weekly(h);
    const list = (d && d.notApplicableList) || [];
    if (ok('списъкът е един ред', list.length === 1, JSON.stringify(list))) {
      ok('обектът е Ловеч', list[0].store === LO, list[0].store);
      ok('заглавието е на задачата', list[0].title === TITLE, list[0].title);
      ok('и причината е там', list[0].comment === 'обектът няма такъв стелаж', list[0].comment);
    }
    /* Секцията в писмото я казва с думи. */
    const html = h.w.reportNotApplicableSectionHtml(list, {});
    ok('писмото изписва заглавието на секцията', html.indexOf('🚫 Не се отнася (1)') >= 0, html.slice(0, 200));
    ok('и причината', html.indexOf('обектът няма такъв стелаж') >= 0);
    ok('и казва, че не влизат в процента',
      html.indexOf('НЕ влизат в процента') >= 0, html.slice(-300));
  }

  section('1в. КОНТРОЛА: без заявката е 1/2 и 50%');
  {
    const h = env({ at: 6, comps: [comp(TR, 'done')] });
    const d = await weekly(h);
    ok('общо е 2', !!d && d.totalAll === 2, d && String(d.totalAll));
    ok('и 50%', !!d && d.overallPct === 50, d && String(d.overallPct));
    ok('клетката на Ловеч е missing', (cellsOf(d, LO) || [])[0] === 'missing',
      JSON.stringify(cellsOf(d, LO)));
    ok('и списъкът е празен', ((d && d.notApplicableList) || []).length === 0);
  }

  section('1г. Отметка СЛЕД заявката не прави обекта изпълнил');
  {
    /* Двата реда не могат да съществуват за един и същ ден (уникален индекс),
       но могат за различни дни на многодневна задача. Заявката бие: тя е за
       цялата задача. */
    const h = env({ at: 6, tasks: [task('t-1', { due_dates: [MON, WED] })],
      comps: [comp(LO, 'not_applicable', { completion_date: MON }),
              comp(LO, 'done', { id: 'c-lo-d', completion_date: WED })] });
    const d = await weekly(h);
    const cells = cellsOf(d, LO) || [];
    ok('нито една клетка не е done', cells.indexOf('done') < 0, JSON.stringify(cells));
    ok('и всички са notapp', cells.length > 0 && cells.every(c => c === 'notapp'),
      JSON.stringify(cells));
  }

  section('2. ДНЕВЕН: отделна заявка за седмицата и обектът е изваден');
  {
    /* Заявката е от ПОНЕДЕЛНИК, отчетният ден е СРЯДА — тесните заявки по дата
       не биха я видели. */
    const h = env({ at: 2, comps: [comp(TR, 'done'), comp(LO, 'not_applicable', { completion_date: MON })] });
    const d = await daily(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('общо е 1, не 2', d.totalAll === 1, String(d.totalAll));
      ok('клетката на Ловеч е notapp', (cellsOf(d, LO) || [])[0] === 'notapp',
        JSON.stringify(cellsOf(d, LO)));
      ok('списъкът носи причината',
        ((d.notApplicableList || [])[0] || {}).comment === 'обектът няма такъв стелаж',
        JSON.stringify(d.notApplicableList));
    }
    const u = h.calls.get.filter(x => x.indexOf('/task_completions') >= 0 &&
      x.indexOf('status=eq.not_applicable') >= 0);
    if (ok('има ОТДЕЛНА заявка за заявките', u.length >= 1, h.calls.get.join('\n'))) {
      ok('и прозорецът ѝ е от понеделника на седмицата',
        u.some(x => x.indexOf('completion_date=gte.' + MON) >= 0), u.join('\n'));
    }
    /* КОНТРОЛА: без заявката дневният е 1/2. */
    const h2 = env({ at: 2, comps: [comp(TR, 'done')] });
    const d2 = await daily(h2);
    ok('контрола: 1 от 2', !!d2 && d2.totalAll === 2, d2 && String(d2.totalAll));
  }

  section('3. ДНЕС: обектът не се брои и не е пропуснал');
  {
    const h = env({ at: 2, comps: [comp(TR, 'done'), comp(LO, 'not_applicable', { completion_date: MON })] });
    const c = await board(h);
    if (ok('таблото се събира', !!c, String(c))) {
      const it = (c.items || []).find(x => x.id === 't-1');
      if (ok('задачата е на таблото', !!it, JSON.stringify((c.items || []).map(x => x.id)))) {
        ok('Ловеч е в na_stores', (it.na_stores || []).indexOf(LO) >= 0,
          JSON.stringify(it.na_stores));
        ok('а Троян не е', (it.na_stores || []).indexOf(TR) < 0, JSON.stringify(it.na_stores));
      }
      const stLo = h.w.todayStoreStats(LO, c.items, c.comps);
      const stTr = h.w.todayStoreStats(TR, c.items, c.comps);
      ok('Ловеч е 0 от 0 — задачата не е негова', stLo.total === 0, JSON.stringify(stLo));
      ok('Троян е 1 от 1', stTr.done === 1 && stTr.total === 1, JSON.stringify(stTr));
    }
    /* КОНТРОЛА: без заявката Ловеч е 0 от 1. */
    const h2 = env({ at: 2, comps: [comp(TR, 'done')] });
    const c2 = await board(h2);
    const st2 = h2.w.todayStoreStats(LO, c2.items, c2.comps);
    ok('контрола: Ловеч е 0 от 1', st2.total === 1 && st2.done === 0, JSON.stringify(st2));
  }

  section('4. ОТЧЕТ ПО ЗАДАЧА: „🚫 Не се отнася: обект — причина"');
  {
    const h = env({ at: 6 });
    const w = h.w;
    const t = { id: 't-1', kind: 'regular', title: TITLE, target_stores: null,
                date: WED, dateFrom: null, dateTo: null };
    const comps = [
      { item_id: 't-1', kind: 'regular', store_name: TR, status: 'done', completion_date: WED, comment: '', photos: [], files: [] },
      { item_id: 't-1', kind: 'regular', store_name: LO, status: 'not_applicable', completion_date: MON, comment: 'няма стелаж' }
    ];
    const bd = w.taskStoreBreakdown(t, comps, STORES);
    ok('обхватът е само Троян', bd.scope.length === 1 && bd.scope[0] === TR, JSON.stringify(bd.scope));
    ok('Ловеч е в notApplicable', (bd.notApplicable || []).length === 1, JSON.stringify(bd.notApplicable));
    ok('с причината', ((bd.notApplicable || [])[0] || {}).comment === 'няма стелаж');
    ok('и НЕ е в pending', bd.pending.indexOf(LO) < 0, JSON.stringify(bd.pending));
    const card = w.personalizedTaskCardHtml(t, comps, STORES);
    ok('картичката казва 1 от 1 обекта', card.indexOf('1 от 1 обекта') >= 0, card.slice(0, 300));
    ok('и изписва реда за заявката',
      card.indexOf('🚫 Не се отнася: ' + LO) >= 0 && card.indexOf('няма стелаж') >= 0,
      card.slice(0, 600));
    /* КОНТРОЛА: без заявката е 1 от 2 и Ловеч е „не е изпълнил". */
    const bd2 = w.taskStoreBreakdown(t, [comps[0]], STORES);
    ok('контрола: обхватът е два обекта', bd2.scope.length === 2);
    ok('и Ловеч е в pending', bd2.pending.indexOf(LO) >= 0, JSON.stringify(bd2.pending));
    const card2 = w.personalizedTaskCardHtml(t, [comps[0]], STORES);
    ok('контрола: картичката казва 1 от 2', card2.indexOf('1 от 2 обекта') >= 0, card2.slice(0, 200));
  }

  section('5. МАРКЕРЪТ „N поредни седмици" пали на третата');
  {
    const w = env({ at: 6 }).w;
    const key = LO + '|recurring|r-1';
    const list = [{ title: 'Ревизия', store: LO, comment: 'няма групи', kind: 'recurring', item_id: 'r-1', on: MON }];
    const at = n => w.reportNotApplicableSectionHtml(list, (function () { const o = {}; o[key] = n; return o; })());
    ok('при 1 седмица — без маркер', at(1).indexOf('поредни седмици') < 0);
    ok('при 2 седмици — без маркер', at(2).indexOf('поредни седмици') < 0);
    ok('при 3 седмици — МАРКЕР', at(3).indexOf('3 поредни седмици') >= 0, at(3).slice(-300));
    ok('и той предлага премахване от Магазини',
      at(3).indexOf('помислете за премахване от Магазини') >= 0);
    ok('при 5 седмици — пак маркер, с числото', at(5).indexOf('5 поредни седмици') >= 0);
    ok('без карта — без маркер', w.reportNotApplicableSectionHtml(list, null).indexOf('поредни') < 0);
    ok('празен списък → празна секция', w.reportNotApplicableSectionHtml([], {}) === '');
  }

  section('5б. Броят поредни седмици се ПРЕКЪСВА при пропусната');
  {
    const rec = {
      id: 'r-1', title: 'Ревизия', department: 'trade', task_type: 'info',
      active: true, sort_order: 1, due_weekdays: [2], due_weekday: 2,
      due_time: null, due_window: false, target_stores: null, report_groups: ['controlling'],
      linked_module: null
    };
    const na = (weeksBack) => ({
      id: 'na-' + weeksBack, task_id: null, recurring_task_id: 'r-1', store_name: LO,
      status: 'not_applicable', completion_date: isoAt(2 - 7 * weeksBack),
      comment: 'няма групи', completed_by: LO, postponed_to: null
    });
    /* Три ПОРЕДНИ седмици: тази, миналата, преди две. */
    const h = env({ at: 6, tasks: [], recurring: [rec], comps: [na(0), na(1), na(2)] });
    const d = await weekly(h);
    const key = LO + '|recurring|r-1';
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('броят е 3', (d.naStreaks || {})[key] === 3, JSON.stringify(d.naStreaks));
    }
    /* С ДУПКА: тази и преди две — прекъснато, значи 1. */
    const h2 = env({ at: 6, tasks: [], recurring: [rec], comps: [na(0), na(2)] });
    const d2 = await weekly(h2);
    ok('при дупка броят е 1', (d2.naStreaks || {})[key] === 1, JSON.stringify(d2.naStreaks));
    /* Само минали седмици, без тази → нула (маркерът е за текущата заявка). */
    const h3 = env({ at: 6, tasks: [], recurring: [rec], comps: [na(1), na(2)] });
    const d3 = await weekly(h3);
    ok('без заявка за тази седмица — няма запис',
      (d3.naStreaks || {})[key] === undefined, JSON.stringify(d3.naStreaks));
  }

  report();
})();
