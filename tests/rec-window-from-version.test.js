/* Прозорец, който идва САМО ОТ ВЕРСИЯ за седмицата (01.10.2026).

   ПОВОД. due_window е седмично поле: то е в RECURRING_CONTENT_FIELDS, тоест
   редакция „само за тази седмица" го записва в recurring_task_versions, а
   редът в recurring_tasks остава какъвто е бил. Към 01.10.2026 в базата има
   точно такъв случай: РЕВИЗИЯ 953 е с due_window=true на самия ред, а
   РЕВИЗИЯ ГРУПИ получава прозореца си ЕДИНСТВЕНО през версия.

   Следствието, което тестът пази: всеки четец трябва да реши „прозорец ли е"
   СЛЕД recurringApplyVersions(), не върху суровия ред. Четец, който пита
   базовия ред, за РЕВИЗИЯ ГРУПИ ще отговори „не" — и ще иска по една отметка
   на ден за задача, която се отмята веднъж. Обратното също: седмица ИЗВЪН
   обхвата на версията трябва да върне базовата стойност.

   Контролата е именно тази втора посока. Без нея тестът би минавал и ако
   кодът просто смята всичко за прозорец.

   ⚠️ Никакви фиксирани календарни дати: котва + отместване.

   Пускане: node tests/rec-window-from-version.test.js . */
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
const MON = isoAt(0), TUE = isoAt(1), WED = isoAt(2);
const PREV_MON = isoAt(-7);

const STORE = 'Троян';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const TITLE = 'РЕВИЗИЯ ГРУПИ';

/* БАЗОВИЯТ ред е БЕЗ прозорец — точно като РЕВИЗИЯ ГРУПИ в базата. */
function baseTask(over) {
  return Object.assign({
    id: 'r-grp', title: TITLE, department: 'trade', task_type: 'info',
    active: true, sort_order: 1,
    due_weekdays: [0, 1, 2], due_weekday: 0, due_time: '16:00',
    due_window: false,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
/* Версия САМО за текущата седмица, която включва прозореца. Отворена нагоре
   (to_monday=null) както я записва „от тази седмица нататък". */
function version(over) {
  return Object.assign({
    id: 'v-1', recurring_task_id: 'r-grp', from_monday: MON, to_monday: null,
    title: TITLE, description: null, due_weekday: 0, due_weekdays: [0, 1, 2],
    due_window: true, due_time: '16:00', task_type: 'info', department: 'trade',
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function comp(date) {
  return { id: 'c1', recurring_task_id: 'r-grp', task_id: null, store_name: STORE,
           status: 'done', completion_date: date, comment: null, photos: null, postponed_to: null };
}

function env(opts) {
  opts = opts || {};
  const h = boot({ modules: ['bulletin.js', 'today.js', 'report.js'],
                   user: opts.user || ADMIN, data: {} });
  const w = h.w;
  freezeAt(w, opts.at === undefined ? 6 : opts.at);
  const wkDate = dateAt(opts.bulAt === undefined ? 0 : opts.bulAt);
  const bul = {
    id: 'b-1', week_number: w.weekNum(wkDate), year: isoWeekYear(wkDate),
    status: 'published', created_at: isoAt(0),
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.DKEYS.forEach(k => { bul.content.calendar[k] = []; });
  h.setData('bulletins', [bul]);
  h.setData('recurring_tasks', [opts.task || baseTask()]);
  h.setData('recurring_task_versions', opts.versions === undefined ? [version()] : opts.versions);
  h.setData('bulletin_tasks', []);
  h.setData('task_completions', opts.comps || []);
  h.setData('users', [{ store_name: STORE }]);
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
   'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
   'transport_orders', 'daily_turnover', 'report_recipients',
   'recurring_task_periods', 'recurring_task_skips', 'bulletin_promotions',
   'task_subtasks', 'subtask_completions', 'notification_schedules'].forEach(t => h.setData(t, []));
  return h;
}
const weekly = h => new Promise(r => { h.w.collectWeeklyReportData(r); });

(async function run() {

  section('1. Сливането наистина носи прозореца за седмицата');
  {
    const h = env();
    const w = h.w;
    const raw = baseTask();
    ok('базовият ред е БЕЗ прозорец', w.recurringIsWindow(raw) === false);
    const merged = w.recurringApplyVersions([raw], [version()], MON)[0];
    ok('след сливане за текущата седмица due_window е true', merged.due_window === true,
      String(merged.due_window));
    ok('и recurringIsWindow() вече казва ДА', w.recurringIsWindow(merged) === true);
    /* КОНТРОЛА: предходната седмица е ИЗВЪН обхвата на версията. */
    const old = w.recurringApplyVersions([raw], [version()], PREV_MON)[0];
    ok('за предходната седмица остава базовата стойност', old.due_window === false,
      String(old.due_window));
    ok('и recurringIsWindow() казва НЕ', w.recurringIsWindow(old) === false);
    /* И самият базов обект не е мутиран — същият набор се ползва и за „Днес". */
    ok('оригиналът не е пипнат', raw.due_window === false, String(raw.due_window));
  }

  section('2. СЕДМИЧЕН отчет: едно явяване, защото прозорецът идва от версията');
  {
    const h = env({ at: 6, comps: [comp(MON)] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('знаменателят е 1, не 3', d.totalAll === 1, String(d.totalAll));
      ok('отметката от понеделник я затваря', d.totalDone === 1, String(d.totalDone));
      ok('тоест 100%', d.overallPct === 100, String(d.overallPct));
    }
  }

  section('2б. КОНТРОЛА: БЕЗ версията същата задача пак е три явявания');
  {
    const h = env({ at: 6, versions: [], comps: [comp(MON)] });
    const d = await weekly(h);
    if (ok('отчетът се събира', !!d)) {
      ok('знаменателят е 3', d.totalAll === 3, String(d.totalAll));
      ok('изпълнено е едно → 33%', d.totalDone === 1 && d.overallPct === 33,
        d.totalDone + '/' + d.totalAll + ' = ' + d.overallPct + '%');
    }
  }

  section('2в. КОНТРОЛА: версия за БЪДЕЩА седмица не важи за тази');
  {
    /* from_monday е следващият понеделник — тази седмица трябва да е по базовия
       ред, тоест пак три явявания. Иначе „прилага се версията за седмицата"
       би значело „прилага се кой да е ред от таблицата". */
    const h = env({ at: 6, versions: [version({ from_monday: isoAt(7) })], comps: [comp(MON)] });
    const d = await weekly(h);
    ok('знаменателят е 3', !!d && d.totalAll === 3, d ? String(d.totalAll) : 'null');
  }

  /* Чекбоксите в календара ги има само за ОБЕКТА — офисът вижда брояч „X/N".
     Затова двете секции долу минават с потребител магазин. */
  const STORE_USER = { email: 't@temax.bg', display_name: 'Троян', role: 'store', store_name: STORE };
  async function calBoxes(opts) {
    const h = env(Object.assign({ at: 2, user: STORE_USER }, opts || {}));
    h.w.bulSelectedId = 'b-1';
    h.w.reportableStoresCache = [STORE];
    h.w.allStoresCache = [STORE];
    if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
    for (let i = 0; i < 80; i++) {
      if (h.doc.querySelector('#sec-calendar input[data-rtid="r-grp"]')) break;
      await ticks();
    }
    return [MON, TUE, WED].map(d =>
      h.doc.querySelector('#sec-calendar input[data-rtid="r-grp"][data-cdate="' + d + '"]'));
  }

  section('3. ЕКРАНЪТ: календарът го води по прозоречния път');
  {
    const boxes = await calBoxes({ comps: [comp(MON)] });
    if (boxes && ok('редът е в трите дни', boxes.filter(Boolean).length === 3,
                    boxes.filter(Boolean).length + ' от 3')) {
      ok('и във всичките е отметнат — прозорецът е затворен',
        boxes.every(b => b.checked), boxes.map(b => String(b.checked)).join(','));
      ok('и заключен', boxes.every(b => b.disabled),
        boxes.map(b => String(b.disabled)).join(','));
      ok('title казва деня на изпълнението',
        boxes.every(b => /Изпълнена на /.test(b.getAttribute('title') || '')),
        boxes[0].getAttribute('title'));
    }
  }

  section('3б. КОНТРОЛА: без версията отмятането важи само за понеделник');
  {
    const boxes = await calBoxes({ versions: [], comps: [comp(MON)] });
    if (boxes && ok('редът пак е в трите дни', boxes.filter(Boolean).length === 3,
                    boxes.filter(Boolean).length + ' от 3')) {
      ok('отметнат е САМО понеделник', boxes[0].checked === true);
      ok('вторник не е', boxes[1].checked === false);
      ok('сряда не е', boxes[2].checked === false);
      ok('и вторник не е заключен като „изпълнена"',
        !/Изпълнена на /.test(boxes[1].getAttribute('title') || ''),
        boxes[1].getAttribute('title'));
    }
  }

  section('4. „ПЛАН ЗА ДЕНЯ" също решава по версията, не по суровия ред');
  {
    /* bulPlanGroups() е отделен четец от календара и пита recurringIsWindow()
       сам. Без тази секция мутант, който там чете базовия ред, остава жив. */
    const plan = async (opts) => {
      const h = env(Object.assign({ at: 2, user: STORE_USER }, opts || {}));
      h.w.bulSelectedId = 'b-1';
      h.w.reportableStoresCache = [STORE];
      h.w.allStoresCache = [STORE];
      if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
      for (let i = 0; i < 80; i++) {
        if ((h.w.recurringTasks || []).length) break;
        await ticks();
      }
      return (dateISO) => {
        const g = h.w.bulPlanGroups(dateISO, STORE);
        return [].concat(g.timed || [], g.untimed || [], g.later || [])
                 .filter(r => r.t && r.t.id === 'r-grp');
      };
    };
    const inPlan = await plan({ comps: [comp(MON)] });
    if (inPlan) {
      ok('с версия: редът е в плана на понеделник (деня на изпълнението)',
        inPlan(MON).length === 1, String(inPlan(MON).length));
      ok('и го няма във вторник', inPlan(TUE).length === 0, String(inPlan(TUE).length));
      ok('и в сряда', inPlan(WED).length === 0, String(inPlan(WED).length));
      ok('редът знае, че прозорецът е затворен', !!(inPlan(MON)[0] || {}).winComp);
    }
    const inPlan2 = await plan({ versions: [], comps: [comp(MON)] });
    if (inPlan2) {
      ok('БЕЗ версия: трите дни са отделни задължения и всеки е в плана си',
        inPlan2(MON).length === 1 && inPlan2(TUE).length === 1 && inPlan2(WED).length === 1,
        [inPlan2(MON).length, inPlan2(TUE).length, inPlan2(WED).length].join(','));
      ok('и нито един ред не е „затворен прозорец"',
        !(inPlan2(MON)[0] || {}).winComp && !(inPlan2(TUE)[0] || {}).winComp);
    }
  }

  report();
})();
