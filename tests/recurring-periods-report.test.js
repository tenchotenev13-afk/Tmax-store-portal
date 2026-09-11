/* Постоянните задачи по седмици (recurring_task_periods) — в ОТЧЕТИТЕ.

   Същият код тече и в send-scheduled-report / send-routed-report —
   tests/report-edge-sync.test.js заковава, че колекторите и копията на
   recurringValidForWeek / recurringTasksForWeek са байт по байт същите.
   Тук се проверява ПОВЕДЕНИЕТО на report.js:

     1. дневният отчет взима задачите, валидни за седмицата на ОТЧЕТНИЯ ДЕН:
        спряна днес задача още е в отчета за миналата седмица, а активирана
        днес я няма в него;
     2. същият отчет за ден от СЛЕДВАЩАТА седмица дава огледалния набор;
     3. седмичният — за седмицата на бюлетина;
     4. личният (маршрутизиран) — също; спряната има картичка за приключилата
        седмица, бъдещата няма;
     5. заявката е БЕЗ active=eq.true и тегли периодите;
     6. без публикуван бюлетин → пак кешът active;
     7. провалена заявка за периодите → решава кешът active (поведението
        отпреди периодите), отчетът не е празен.

   ⚠️ Дати: котвата е понеделникът на текущата реална седмица, часовникът се
   замразява с отместване. Понеделниците на периодите се смятат независимо
   от кода под тест.

   Пускане: node tests/recurring-periods-report.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report } = H;

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

const A = 'Троян', B = 'Ловеч', C = 'Севлиево';
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const MON_K = isoAt(0), MON_NEXT = isoAt(7), MON_OLD = isoAt(-35);

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info', active: true, sort_order: 0,
    due_weekday: null, due_weekdays: null, due_time: '20:00', due_window: false,
    target_stores: null, report_groups: ['owner'], linked_module: null, description: null
  }, over || {});
}
/* r-stop  — спряна в СЛЕДВАЩАТА седмица (важи до седмицата на котвата);
   r-future— активирана от следващата седмица (в котвата не важи);
   r-live  — отворен период отдавна;
   r-legacy— БЕЗ период, active=true (стар кеширан клиент) → важи винаги;
   r-dead  — БЕЗ период, active=false → не важи никъде. */
const TASKS = [
  rec('r-stop', { active: false }),
  rec('r-future'),
  rec('r-live'),
  rec('r-legacy'),
  rec('r-dead', { active: false })
];
const PERIODS = [
  { recurring_task_id: 'r-stop', from_monday: MON_OLD, to_monday: MON_K },
  { recurring_task_id: 'r-future', from_monday: MON_NEXT, to_monday: null },
  { recurring_task_id: 'r-live', from_monday: MON_OLD, to_monday: null }
];
function done(taskId, store, date) {
  return { id: 'c-' + taskId + '-' + store + '-' + date, recurring_task_id: taskId, task_id: null,
           store_name: store, status: 'done', completion_date: date, comment: null, photos: null, files: null };
}
/* Мъничък PostgREST за task_completions — прилага gte/lte/in. */
function pgFake(rows) {
  return function (url) {
    const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
    const preds = [];
    qs.split('&').forEach(function (p) {
      const i = p.indexOf('='); if (i < 0) return;
      const col = decodeURIComponent(p.slice(0, i)), val = decodeURIComponent(p.slice(i + 1));
      const m = /^(eq|gte|lte)\.([\s\S]*)$/.exec(val);
      if (m && ['completion_date', 'store_name'].indexOf(col) >= 0) {
        preds.push(r => { const x = r[col]; if (x === null || x === undefined) return false;
          return m[1] === 'eq' ? String(x) === m[2] : m[1] === 'gte' ? String(x) >= m[2] : String(x) <= m[2]; });
      }
      const mi = /^in\.\(([\s\S]*)\)$/.exec(val);
      if (mi) { const list = mi[1] ? mi[1].split(',') : []; preds.push(r => list.indexOf(String(r[col])) >= 0); }
    });
    return rows.filter(r => preds.every(f => f(r)));
  };
}

function env(at, comps, extra) {
  extra = extra || {};
  const h = boot(Object.assign({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: {} },
    extra.fail ? { fail: extra.fail } : {}));
  const w = h.w;
  freezeAt(w, at);
  const k = { year: isoWeekYear(dateAt(0)), week: w.weekNum(dateAt(0)) };
  const kn = { year: isoWeekYear(dateAt(7)), week: w.weekNum(dateAt(7)) };
  h.setData('bulletins', [
    { id: 'b-2', week_number: kn.week, year: kn.year, status: 'published', created_at: isoAt(7) },
    { id: 'b-1', week_number: k.week, year: k.year, status: 'published', created_at: isoAt(0) }
  ]);
  /* active=eq.… се прилага като в PostgREST: стара заявка наистина губи
     спряната, не само „изглежда" различно. */
  h.setData('recurring_tasks', url => { const m = /[?&]active=eq\.(true|false)/.exec(url);
    return TASKS.filter(t => !m || String(!!t.active) === m[1]); });
  h.setData('recurring_task_periods', PERIODS);
  h.setData('recurring_task_skips', []);
  h.setData('bulletin_tasks', []);
  h.setData('task_completions', pgFake(comps || []));
  h.setData('users', [A, B, C].map(s => ({ store_name: s })));
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot', 'kasa_reports',
   'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
   'transport_orders', 'daily_turnover', 'app_settings'].forEach(t => h.setData(t, []));
  h.k = k; h.kn = kn;
  return h;
}
const collect = (h, fn) => new Promise(resolve => { h.w[fn](resolve); });
const rowOf = (d, s) => (d && d.rows || []).find(r => r.name === s) || null;
const recGets = h => h.calls.get.filter(u => u.indexOf('/recurring_tasks?') >= 0 || /\/recurring_tasks$/.test(u.split('?')[0] + (u.indexOf('?') < 0 ? '' : '?')) && u.indexOf('/recurring_tasks') >= 0);
const perGets = h => h.calls.get.filter(u => u.indexOf('/recurring_task_periods') >= 0);
const titlesOf = d => (d.items || []).map(i => i.title);
const T = id => 'Постоянна ' + id;

(async function () {

  /* ═══ 1. Дневен отчет за ден от седмицата на котвата ══════════════════ */
  section('1. Дневен отчет (сряда от седмицата на котвата): спряната след нея ОЩЕ е в набора');
  {
    const WED = isoAt(2);
    const h = env(3, [done('r-stop', A, WED)]);
    const d = await collect(h, 'collectDailyReportData');
    if (ok('отчетът се събира', !!d)) {
      ok('отчетният ден е сряда', d.reportDate === WED, d.reportDate);
      const q = h.calls.get.filter(u => u.indexOf('/recurring_tasks') >= 0);
      ok('заявката е БЕЗ active=eq.true', q.length >= 1 && q.every(u => u.indexOf('active=eq.true') < 0), q.join(' | '));
      ok('периодите се теглят', perGets(h).length === 1, String(perGets(h).length));
      const titles = titlesOf(d);
      ok('спряната ПОСЛЕ (r-stop) Е в набора', titles.indexOf(T('r-stop')) >= 0, titles.join(', '));
      ok('r-live и r-legacy са в набора', titles.indexOf(T('r-live')) >= 0 && titles.indexOf(T('r-legacy')) >= 0);
      ok('активираната от СЛЕДВАЩАТА седмица (r-future) я няма', titles.indexOf(T('r-future')) < 0, titles.join(', '));
      ok('без период и спряна (r-dead) я няма', titles.indexOf(T('r-dead')) < 0);
      ok('Троян: 1/3', rowOf(d, A).done === 1 && rowOf(d, A).total === 3, JSON.stringify({ d: rowOf(d, A).done, t: rowOf(d, A).total }));
      ok('Ловеч: 0/3', rowOf(d, B).done === 0 && rowOf(d, B).total === 3);
      ok('общо 1/9', d.totalDone === 1 && d.totalAll === 9, d.totalDone + '/' + d.totalAll);
    }
  }

  /* ═══ 2. Дневен отчет за ден от СЛЕДВАЩАТА седмица ════════════════════ */
  section('2. Дневен отчет (понеделник от следващата седмица): огледалният набор');
  {
    const h = env(8, []);
    const d = await collect(h, 'collectDailyReportData');
    if (ok('отчетът се събира', !!d)) {
      ok('отчетният ден е следващият понеделник', d.reportDate === isoAt(7), d.reportDate);
      const titles = titlesOf(d);
      ok('r-stop вече я НЯМА', titles.indexOf(T('r-stop')) < 0, titles.join(', '));
      ok('r-future вече Е в набора', titles.indexOf(T('r-future')) >= 0, titles.join(', '));
      ok('r-live и r-legacy пак са там', titles.indexOf(T('r-live')) >= 0 && titles.indexOf(T('r-legacy')) >= 0);
      ok('Троян: 0/3', rowOf(d, A).done === 0 && rowOf(d, A).total === 3, JSON.stringify({ t: rowOf(d, A).total }));
    }
  }

  /* ═══ 3. Седмичен отчет ═══════════════════════════════════════════════ */
  section('3. Седмичен отчет (седмицата на котвата, гледан в следващия понеделник)');
  {
    const h = env(7, [done('r-stop', A, isoAt(1)), done('r-live', B, isoAt(1))]);
    const d = await collect(h, 'collectWeeklyReportData');
    if (ok('отчетът се събира', !!d)) {
      ok('заявката е БЕЗ active=eq.true', h.calls.get.filter(u => u.indexOf('/recurring_tasks') >= 0).every(u => u.indexOf('active=eq.true') < 0));
      ok('периодите се теглят', perGets(h).length === 1, String(perGets(h).length));
      ok('r-stop: 7 явявания (важала е цялата седмица)', d.items.filter(i => i.id === 'r-stop').length === 7,
        String(d.items.filter(i => i.id === 'r-stop').length));
      ok('r-future: нула явявания', d.items.filter(i => i.id === 'r-future').length === 0);
      ok('r-dead: нула явявания', d.items.filter(i => i.id === 'r-dead').length === 0);
      ok('Троян: 1/21 (r-stop + r-live + r-legacy)', rowOf(d, A).done === 1 && rowOf(d, A).total === 21,
        JSON.stringify({ d: rowOf(d, A).done, t: rowOf(d, A).total }));
      ok('Ловеч: 1/21', rowOf(d, B).done === 1 && rowOf(d, B).total === 21,
        JSON.stringify({ d: rowOf(d, B).done, t: rowOf(d, B).total }));
    }
  }

  /* ═══ 4. Личен (маршрутизиран) отчет ══════════════════════════════════ */
  section('4. Личен отчет: картичка за спряната след седмицата, без бъдещата');
  {
    const h = env(7, [done('r-stop', A, isoAt(1))]);
    const d = await collect(h, 'collectWeeklyRoutingData');
    if (ok('отчетът се събира', !!d)) {
      const ids = (d.tasks || []).map(t => t.id);
      ok('заявката е БЕЗ active=eq.true', h.calls.get.filter(u => u.indexOf('/recurring_tasks') >= 0).every(u => u.indexOf('active=eq.true') < 0));
      ok('периодите се теглят', perGets(h).length === 1, String(perGets(h).length));
      ok('r-stop има картичка', ids.indexOf('r-stop') >= 0, ids.join(', '));
      ok('r-future НЯМА картичка', ids.indexOf('r-future') < 0, ids.join(', '));
      ok('r-dead НЯМА картичка', ids.indexOf('r-dead') < 0);
      const card = h.w.personalizedTaskCardHtml((d.tasks || []).find(t => t.id === 'r-stop'), d.comps, d.stores);
      ok('в картичката: 1 от 3 обекта изпълнили', card.indexOf('1 от 3 обекта изпълнили') >= 0, card.slice(0, 200));
      ok('и Ловеч/Севлиево са сред „Не са изпълнили"', card.indexOf('Не са изпълнили') >= 0 && card.indexOf(B) >= 0 && card.indexOf(C) >= 0);
    }
  }

  /* ═══ 5. Провалена заявка за периодите ════════════════════════════════ */
  section('5. Провал на периодите → решава кешът active, отчетът не е празен');
  {
    const h = env(3, [], { fail: { GET: /recurring_task_periods/ } });
    const d = await collect(h, 'collectDailyReportData');
    if (ok('отчетът се събира', !!d)) {
      const titles = titlesOf(d);
      ok('активните са в набора (r-future, r-live, r-legacy)',
        titles.indexOf(T('r-future')) >= 0 && titles.indexOf(T('r-live')) >= 0 && titles.indexOf(T('r-legacy')) >= 0, titles.join(', '));
      ok('спрените ги няма (r-stop, r-dead)', titles.indexOf(T('r-stop')) < 0 && titles.indexOf(T('r-dead')) < 0, titles.join(', '));
    }
  }

  /* ═══ 6. Седмичен отчет без публикуван бюлетин ═══════════════════════ */
  section('6. Без публикуван бюлетин (няма седмица) → пак кешът active');
  {
    /* Личният отчет работи и без бюлетин (прозорецът е отворен) — там се
       вижда резервата. Седмичният без бюлетин не строи явявания изобщо. */
    const h = env(7, []);
    h.setData('bulletins', []);
    const d = await collect(h, 'collectWeeklyRoutingData');
    if (ok('отчетът се събира', !!d)) {
      const ids = (d.tasks || []).map(t => t.id);
      ok('r-live, r-future, r-legacy (активни) имат картички', ids.indexOf('r-live') >= 0 &&
        ids.indexOf('r-future') >= 0 && ids.indexOf('r-legacy') >= 0, ids.join(','));
      ok('r-stop и r-dead (спрени) нямат', ids.indexOf('r-stop') < 0 && ids.indexOf('r-dead') < 0, ids.join(','));
    }
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
