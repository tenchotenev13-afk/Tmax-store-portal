/* Прозоречната постоянна задача в отчетите — един елемент, не N.

   Без due_window задача с due_weekdays=[Пон,Вто,Сря] влиза в седмичния отчет
   като ТРИ явявания: три единици в знаменателя, и обект, който я е свършил в
   понеделник, излиза 1/3 = 33%. С due_window тя е ЕДНО явяване с диапазон
   (dateFrom..dateTo) и отмятане където и да е в прозореца я затваря.

   В дневния отчет се явява само в деня на СРОКА — иначе същият обект излиза
   неизпълнил в понеделник и във вторник, и се брои три пъти.

   ⚠️ Никакви фиксирани календарни дати: котва + отместване, часовникът
   замразен на конкретен ден.

   Пускане: node tests/recurring-window-report.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report } = H;

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
/* ISO week-year = годината на четвъртъка от същата седмица. */
function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
}

const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2);

function freezeAt(w, n) {
  const Real = w.Date;
  const fixedMs = dateAt(n).getTime();
  class Frozen extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  }
  w.Date = Frozen;
}

const STORE = 'Троян';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function winTask(over) {
  return Object.assign({
    id: 'r-win', title: 'Справка линейни метри', department: 'trade',
    task_type: 'info', active: true, sort_order: 1,
    due_weekdays: [0, 1, 2], due_weekday: 0, due_time: '16:00', due_window: true,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function comp(date) {
  return { id: 'c1', recurring_task_id: 'r-win', task_id: null, store_name: STORE,
           status: 'done', completion_date: date, comment: null, photos: null };
}

/* at = отместване на замразения „днес" спрямо котвата.
   bulWeekOf = коя дата определя седмицата на бюлетина. */
function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {}
  });
  const w = h.w;
  freezeAt(w, opts.at);
  const wkDate = opts.bulWeekOf || dateAt(0);
  h.setData('bulletins', [{
    id: 'b-1', week_number: w.weekNum(wkDate), year: isoWeekYear(wkDate),
    status: 'published', created_at: isoAt(0)
  }]);
  h.setData('recurring_tasks', [opts.task || winTask()]);
  h.setData('bulletin_tasks', []);
  h.setData('task_completions', opts.comps || []);
  h.setData('users', [{ store_name: STORE }]);
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
   'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
   'transport_orders', 'daily_turnover'].forEach(t => h.setData(t, []));
  return h;
}

function weekly(h) {
  return new Promise(resolve => { h.w.collectWeeklyReportData(resolve); });
}
function daily(h) {
  return new Promise(resolve => { h.w.collectDailyReportData(resolve); });
}

(async function run() {

  /* ═══ 1. Седмичен отчет ══════════════════════════════════════════════ */
  /* collectWeeklyReportData() гледа ПРЕДХОДНАТА седмица, затова „днес" е
     замразено в следващия понеделник, а бюлетинът е за седмицата на котвата. */
  section('1. Седмичен отчет: ЕДНО явяване, не три');
  {
    const h = env({ at: 7, comps: [comp(MON)] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('знаменателят е 1, не 3', d.totalAll === 1, String(d.totalAll));
      ok('отметката от понеделник я затваря', d.totalDone === 1, String(d.totalDone));
      ok('обектът е на 100%', d.overallPct === 100, String(d.overallPct));
    }
  }

  section('1б. Отметка във ВТОРНИК (среда на прозореца) също затваря');
  {
    const h = env({ at: 7, comps: [comp(TUE)] });
    const d = await weekly(h);
    ok('пак 1/1', !!d && d.totalAll === 1 && d.totalDone === 1,
      d ? d.totalDone + '/' + d.totalAll : 'null');
  }

  section('1в. Без отметка: 0 от 1, не 0 от 3');
  {
    const h = env({ at: 7, comps: [] });
    const d = await weekly(h);
    ok('знаменателят пак е 1', !!d && d.totalAll === 1, d ? String(d.totalAll) : 'null');
    ok('и нищо не е изпълнено', !!d && d.totalDone === 0, d ? String(d.totalDone) : 'null');
  }

  section('1г. Отметка ИЗВЪН прозореца (четвъртък) не се брои');
  {
    const h = env({ at: 7, comps: [comp(isoAt(3))] });
    const d = await weekly(h);
    ok('0 от 1', !!d && d.totalAll === 1 && d.totalDone === 0,
      d ? d.totalDone + '/' + d.totalAll : 'null');
  }

  section('1д. КОНТРОЛА: същата задача без флага -> старите три явявания');
  {
    const h = env({ at: 7, task: winTask({ due_window: false }), comps: [comp(MON)] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d)) {
      ok('знаменателят е 3', d.totalAll === 3, String(d.totalAll));
      ok('изпълнено е само едно', d.totalDone === 1, String(d.totalDone));
      ok('тоест 33%', d.overallPct === 33, String(d.overallPct));
    }
  }

  /* ═══ 2. Дневен отчет ════════════════════════════════════════════════ */
  /* collectDailyReportData() описва ВЧЕРАШНИЯ ден, затова „днес" се замразява
     един ден след деня, който ни интересува. */
  section('2. Дневен отчет във ВТОРНИК: задачата не участва');
  {
    const h = env({ at: 2, comps: [comp(MON)] });   /* днес=сряда -> отчет за вторник */
    const d = await daily(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('отчетният ден е вторник', d.reportDate === TUE, String(d.reportDate));
      ok('няма нито едно явяване', d.totalAll === 0, String(d.totalAll));
    }
  }

  section('2б. Дневен отчет в СРЯДА (денят на срока): участва и е изпълнена');
  {
    const h = env({ at: 3, comps: [comp(MON)] });   /* днес=четвъртък -> отчет за сряда */
    const d = await daily(h);
    if (ok('отчетът се събира', !!d)) {
      ok('отчетният ден е сряда', d.reportDate === WED, String(d.reportDate));
      ok('едно явяване', d.totalAll === 1, String(d.totalAll));
      ok('изпълнена от отметката в понеделник', d.totalDone === 1, String(d.totalDone));
    }
  }

  section('2в. Дневен отчет в сряда, без отметка: неизпълнена');
  {
    const h = env({ at: 3, comps: [] });
    const d = await daily(h);
    ok('0 от 1', !!d && d.totalAll === 1 && d.totalDone === 0,
      d ? d.totalDone + '/' + d.totalAll : 'null');
  }

  section('2г. КОНТРОЛА: без флага задачата участва и в понеделник, и във вторник');
  {
    const h1 = env({ at: 1, task: winTask({ due_window: false }), comps: [comp(MON)] });
    const d1 = await daily(h1);   /* отчет за понеделник */
    ok('понеделник: 1 явяване, изпълнено', !!d1 && d1.totalAll === 1 && d1.totalDone === 1,
      d1 ? d1.totalDone + '/' + d1.totalAll : 'null');
    const h2 = env({ at: 2, task: winTask({ due_window: false }), comps: [comp(MON)] });
    const d2 = await daily(h2);   /* отчет за вторник */
    ok('вторник: пак 1 явяване, но НЕизпълнено (третото броене)',
      !!d2 && d2.totalAll === 1 && d2.totalDone === 0,
      d2 ? d2.totalDone + '/' + d2.totalAll : 'null');
  }

  report();
})();
