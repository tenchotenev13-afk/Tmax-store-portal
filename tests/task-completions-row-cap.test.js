/* Хилядният ред: заявките към task_completions трябва да носят филтър по ДАТА.

   Какво се счупи (09.09.2026)
   ───────────────────────────
   Дневният отчет за 09.09 излезе 0/18 за всичките осем постоянни задачи, при
   реални 18/18 в базата. Причината не е в броенето, а в заявката:
   report.js теглеше `task_completions?recurring_task_id=in.(…)` БЕЗ филтър по
   дата. За тези задачи има 1345 реда; PostgREST реже на 1000
   (`Content-Range: 0-999/*`), а понеже заявката няма `order`, отрязаните са
   точно НАЙ-НОВИТЕ — тоест днешните. Прагът е прекрачен между 08.09 (86%) и
   09.09 (30%): дотогава същата заявка се събираше под хилядата и дефектът
   стоеше невидим.

   Същият шаблон имаше в today.js (таблото „Днес") и в bulletin.js
   (глобалният клон `recurring_task_id=not.is.null`, 1595 реда) — оттам и
   0/18 в седмичния календар.

   Вторият дефект, в същия ред работа: today.js броеше отмятане с
   `completion_date=NULL` за изпълнено ДНЕС. Такива редове има 90, всичките
   отпреди полето да се пълни, и се броят за изпълнени всеки ден завинаги —
   на 10.09.2026 това бяха 15 фантома и табло 18/90 при реални 5. report.js
   ги изключва нарочно още отпреди („184 фантома").

   Как се тества
   ─────────────
   `pgFake()` е миниатюрен PostgREST: разбира `eq/gte/lte/in/is.null/not.is.null`
   и вложеното `or=(and(…),…)`, и — най-важното — РЕЖЕ на 1000 реда, както
   истинският. Наборът е нареден СТАР → НОВ, точно както е дошъл от базата без
   `order`, така че срязването изяжда новите редове. Тоест:
     · стар код (заявка без дата) → новите 18 отпадат → 0/18;
     · нов код (заявка с дата)    → връщат се точно те → 18/18.
   Проверката е върху числата, които колекторът връща, а не върху текста на
   URL-а — URL се проверява само допълнително, за да се вижда КАКВО се е
   променило.

   ⚠️ Никакви фиксирани календарни дати: котва (понеделникът от текущата
   реална седмица) + отместване, часовникът замразен на конкретен ден.

   Пускане: node tests/task-completions-row-cap.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

/* ── Котва и дати ────────────────────────────────────────────────────────── */
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

/* ── Миниатюрен PostgREST ────────────────────────────────────────────────── */

const CAP = 1000;   /* същият таван като на живия PostgREST */

function colPred(col, val) {
  if (val === 'not.is.null') return r => r[col] !== null && r[col] !== undefined;
  if (val === 'is.null') return r => r[col] === null || r[col] === undefined;
  const m = /^(eq|neq|gte|lte|gt|lt)\.([\s\S]*)$/.exec(val);
  if (m) {
    const op = m[1], v = m[2];
    return function (r) {
      const raw = r[col];
      if (raw === null || raw === undefined) return false;   /* NULL не съвпада с нищо, както в SQL */
      const x = String(raw);
      return op === 'eq' ? x === v : op === 'neq' ? x !== v
        : op === 'gte' ? x >= v : op === 'lte' ? x <= v
          : op === 'gt' ? x > v : x < v;
    };
  }
  const mi = /^in\.\(([\s\S]*)\)$/.exec(val);
  if (mi) {
    const list = mi[1] ? mi[1].split(',').map(s => s.replace(/^"|"$/g, '')) : [];
    return r => list.indexOf(String(r[col])) >= 0;
  }
  throw new Error('pgFake: непознат предикат ' + col + '=' + val);
}

/* Разцепва по запетаи на НУЛЕВА дълбочина — `and(a,b),c` дава два члена. */
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function logicPred(term) {
  const m = /^(and|or)\(([\s\S]*)\)$/.exec(term);
  if (m) {
    const subs = splitTop(m[2]).map(logicPred);
    return m[1] === 'and' ? (r => subs.every(f => f(r))) : (r => subs.some(f => f(r)));
  }
  const i = term.indexOf('.'), rest = term.slice(i + 1), j = rest.indexOf('.');
  return colPred(term.slice(0, i), rest.slice(0, j) + '.' + rest.slice(j + 1));
}

/* rows трябва да е нареден СТАР → НОВ: заявките нямат `order`, затова
   срязването на CAP изяжда точно опашката, както се случи на живо. */
function pgFake(rows, opts) {
  opts = opts || {};
  return function (url) {
    const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
    const preds = [];
    qs.split('&').forEach(function (p) {
      if (!p) return;
      const i = p.indexOf('=');
      if (i < 0) return;
      const col = decodeURIComponent(p.slice(0, i));
      const val = decodeURIComponent(p.slice(i + 1));
      if (col === 'select' || col === 'order' || col === 'limit' || col === 'offset') return;
      /* Режимът „сляп" пренебрегва датата — така се вижда какво е правел
         старият код срещу СЪЩИЯ набор. */
      if (opts.ignoreDates && (col === 'completion_date' || col === 'or')) return;
      preds.push(col === 'or' ? logicPred('or' + val) : colPred(col, val));
    });
    return rows.filter(r => preds.every(f => f(r))).slice(0, CAP);
  };
}

/* ── Данни ───────────────────────────────────────────────────────────────── */

const N_STORES = 18;
const STORES = [];
for (let i = 1; i <= N_STORES; i++) STORES.push('Обект ' + i);

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

const REC_ID = 'r-minusi';
const REG_ID = 't-bul';

function recTask(over) {
  return Object.assign({
    id: REC_ID, title: 'СПРАВКА МИНУСИ', department: 'trade',
    task_type: 'info', active: true, sort_order: 1,
    due_weekdays: [0, 1, 2, 3, 4], due_weekday: 0, due_time: '20:00', due_window: false,
    target_stores: null, report_groups: null, linked_module: null
  }, over || {});
}
function comp(o) {
  return Object.assign({
    id: 'c-' + Math.random().toString(36).slice(2),
    task_id: null, recurring_task_id: null, store_name: STORES[0],
    status: 'done', completion_date: null, completed_by: 'x@temax.bg',
    comment: null, photos: null, files: null
  }, o);
}

/* Опашката от стари отмятания: N реда с дати от МИНАЛИ седмици, наредени
   най-стар пръв. Точно те изяждаха хилядата. */
function oldTail(n, key, id) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = { store_name: STORES[i % N_STORES], completion_date: isoAt(-7 * (1 + Math.floor(i / N_STORES))) };
    o[key] = id;
    out.push(comp(o));
  }
  return out.sort((a, b) => a.completion_date < b.completion_date ? -1 : 1);
}
function todaysRows(key, id, iso) {
  return STORES.map(s => { const o = { store_name: s, completion_date: iso }; o[key] = id; return comp(o); });
}

/* ── Среда ───────────────────────────────────────────────────────────────── */

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'report.js'],
    user: opts.user || ADMIN,
    data: {}
  });
  const w = h.w;
  freezeAt(w, opts.at === undefined ? 2 : opts.at);
  const wkDate = opts.bulWeekOf || dateAt(0);
  const bul = {
    id: 'b-1', week_number: w.weekNum(wkDate), year: isoWeekYear(wkDate),
    status: 'published', created_at: isoAt(0),
    content: { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }
  };
  w.DKEYS.forEach(k => { bul.content.calendar[k] = []; });
  h.setData('bulletins', [bul]);
  h.setData('recurring_tasks', opts.tasks || [recTask()]);
  h.setData('bulletin_tasks', opts.bulTasks || []);
  h.setData('task_completions', pgFake(opts.comps || [], opts.pg));
  h.setData('users', STORES.map(s => ({ store_name: s })));
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot',
    'goods_transit', 'transport_pallets', 'stock_differences', 'client_orders',
    'transport_orders', 'daily_turnover', 'bulletin_promotions',
    'subtask_completions', 'report_recipients'].forEach(t => h.setData(t, []));
  return h;
}

const daily = h => new Promise(res => { h.w.collectDailyReportData(res); });
const compUrls = h => h.calls.get.filter(u => u.indexOf('/task_completions') >= 0);

(async function run() {

  /* ═══ 1. Дневен отчет: постоянна задача под опашка от 1400 стари ═══════ */
  section('1. Дневен отчет, постоянна задача: 18/18, а не 0/18');
  {
    /* 1400 стари + 18 за отчетния ден = 1418 реда за ЕДНА задача — точно
       положението от 09.09.2026 (1345 реда за осемте). */
    const tail = oldTail(1400, 'recurring_task_id', REC_ID);
    const fresh = todaysRows('recurring_task_id', REC_ID, TUE);
    const rows = tail.concat(fresh);

    ok('наборът наистина прелива над хилядата', rows.length > CAP, rows.length + ' реда');

    /* КОНТРОЛА: същият набор, но заявката „сляпа" за датата = старият код. */
    const hOld = env({ at: 2, comps: rows, pg: { ignoreDates: true } });
    const dOld = await daily(hOld);
    ok('стар код (заявка без дата) наистина дава 0 изпълнени',
      !!dOld && dOld.totalDone === 0 && dOld.totalAll === N_STORES,
      dOld ? dOld.totalDone + '/' + dOld.totalAll : 'null');

    /* НОВИЯТ код срещу СЪЩИЯ набор. */
    const h = env({ at: 2, comps: rows });
    const d = await daily(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('отчетният ден е вторник', d.reportDate === TUE, String(d.reportDate));
      ok('знаменателят е 18 обекта', d.totalAll === N_STORES, String(d.totalAll));
      ok('и 18-те са изпълнени', d.totalDone === N_STORES, String(d.totalDone));
      ok('тоест 100%, не 0%', d.overallPct === 100, String(d.overallPct));
    }
    const u = compUrls(h).filter(x => x.indexOf('recurring_task_id=in.') >= 0)[0];
    if (ok('има заявка за постоянните отмятания', !!u, compUrls(h).join('\n'))) {
      ok('носи филтър по дата', u.indexOf('completion_date=') >= 0, u);
    }
  }

  /* ═══ 2. Същото и за ОБИКНОВЕНА задача от бюлетина ════════════════════ */
  section('2. Дневен отчет, обикновена задача: филтърът важи и за нея');
  {
    const bulTask = {
      id: REG_ID, bulletin_id: 'b-1', title: 'Ежедневна проверка',
      department: 'trade', due_date: TUE, due_dates: null, task_type: 'info',
      target_stores: null, sort_order: 1, report_groups: null, linked_module: null
    };
    const rows = oldTail(1400, 'task_id', REG_ID)
      .concat(todaysRows('task_id', REG_ID, TUE));

    const h = env({ at: 2, tasks: [], bulTasks: [bulTask], comps: rows });
    const d = await daily(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('18 от 18', d.totalAll === N_STORES && d.totalDone === N_STORES,
        d.totalDone + '/' + d.totalAll);
    }
    const u = compUrls(h).filter(x => x.indexOf('task_id=in.') >= 0 &&
      x.indexOf('recurring_task_id') < 0)[0];
    if (ok('има заявка за обикновените отмятания', !!u, compUrls(h).join('\n'))) {
      ok('носи completion_date=eq.<отчетния ден>',
        u.indexOf('completion_date=eq.' + TUE) >= 0, u);
    }
  }

  /* ═══ 3. Прозоречна задача: обхват, не точен ден ══════════════════════ */
  /* Тук се вижда защо филтърът за постоянните е gte/lte, а не eq: задачата е
     отметната в ПОНЕДЕЛНИК, а отчетът е за СРЯДА (деня на срока). При eq.WED
     заявката не би върнала нищо и щеше да излезе 0/18 — вече не заради
     хилядата, а заради самата поправка. */
  section('3. Прозоречна постоянна задача: отметката от понеделник стига');
  {
    const win = recTask({ id: 'r-win', title: 'Ревизии 953', due_weekdays: [0, 1, 2], due_window: true });
    const rows = oldTail(1400, 'recurring_task_id', 'r-win')
      .concat(todaysRows('recurring_task_id', 'r-win', MON));

    const h = env({ at: 3, tasks: [win], comps: rows });   /* днес=четвъртък → отчет за сряда */
    const d = await daily(h);
    if (ok('отчетът се събира', !!d, String(d))) {
      ok('отчетният ден е сряда', d.reportDate === WED, String(d.reportDate));
      ok('18 от 18 от понеделнишките отметки',
        d.totalAll === N_STORES && d.totalDone === N_STORES,
        d.totalDone + '/' + d.totalAll);
    }
    const u = compUrls(h).filter(x => x.indexOf('recurring_task_id=in.') >= 0)[0];
    if (ok('има заявка за постоянните', !!u)) {
      ok('обхватът тръгва от понеделник', u.indexOf('completion_date=gte.' + MON) >= 0, u);
      ok('и свършва в сряда', u.indexOf('completion_date=lte.' + WED) >= 0, u);
    }
  }

  /* ═══ 4. Таб „Днес": фантомите с completion_date=NULL ═════════════════ */
  section('4. Таб „Днес": отмятане без дата НЕ се брои за днес');
  {
    /* Заявката нарочно е „сляпа" за датата: така NULL редът СТИГА до JS
       филтъра и се проверява самият предикат, а не че заявката го е спряла.
       Двете защити са различни неща и трябва да държат поотделно. */
    const rows = [
      comp({ recurring_task_id: REC_ID, store_name: STORES[0], completion_date: null }),
      comp({ recurring_task_id: REC_ID, store_name: STORES[1], completion_date: TUE }),
      comp({ recurring_task_id: REC_ID, store_name: STORES[2], completion_date: isoAt(-7) })
    ];
    const h = env({ at: 1, comps: rows, pg: { ignoreDates: true } });   /* днес = вторник */
    if (guard('loadTodayDashboard() не хвърля', () => h.w.loadTodayDashboard())) {
      await ticks(); await ticks();
      const c = h.w.todayCache;
      if (ok('таблото се напълни', !!c, String(c))) {
        const names = (c.comps || []).map(x => x.store_name).sort();
        ok('брои се точно ЕДНО отмятане', c.comps.length === 1, JSON.stringify(names));
        ok('и то е днешното', names[0] === STORES[1], JSON.stringify(names));
        ok('фантомът с NULL дата не е вътре', names.indexOf(STORES[0]) < 0, JSON.stringify(names));
        ok('старото от миналата седмица също не е', names.indexOf(STORES[2]) < 0, JSON.stringify(names));
      }
    }
  }

  section('5. Таб „Днес": заявката носи датата (защита от хилядата)');
  {
    const rows = oldTail(1400, 'recurring_task_id', REC_ID)
      .concat(todaysRows('recurring_task_id', REC_ID, TUE));
    const h = env({ at: 1, comps: rows });   /* днес = вторник */
    if (guard('loadTodayDashboard() не хвърля', () => h.w.loadTodayDashboard())) {
      await ticks(); await ticks();
      const u = compUrls(h).filter(x => x.indexOf('recurring_task_id=in.') >= 0)[0];
      if (ok('има заявка за постоянните отмятания', !!u, compUrls(h).join('\n'))) {
        /* От 10.09.2026 обхватът е gte/lte, не eq: прозоречната задача може
           да е отметната в друг ден от прозореца си (виж
           tests/today-window-task.test.js). За тази задача — СПРАВКА МИНУСИ,
           due_window=false — двете граници се свиват до днес, тоест защитата
           срещу хилядата е същата. */
        ok('носи долна граница = днес', u.indexOf('completion_date=gte.' + TUE) >= 0, u);
        ok('и горна граница = днес', u.indexOf('completion_date=lte.' + TUE) >= 0, u);
      }
      const c = h.w.todayCache;
      if (ok('таблото се напълни', !!c)) {
        ok('всичките 18 днешни отмятания са налице', c.comps.length === N_STORES,
          String(c.comps.length));
      }
    }
  }

  /* ═══ 6. Бюлетин: глобалният клон ════════════════════════════════════ */
  section('6. Бюлетин (глобален изглед): заявката е ограничена до седмицата');
  {
    const bulTask = {
      id: REG_ID, bulletin_id: 'b-1', title: 'Задача', department: 'trade',
      due_date: TUE, due_dates: null, task_type: 'info',
      target_stores: null, sort_order: 1, report_groups: null, linked_module: null
    };
    const h = env({ at: 2, bulTasks: [bulTask], comps: [] });
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await ticks(); await ticks(); await ticks();
      const u = compUrls(h).filter(x => x.indexOf('recurring_task_id=not.is.null') >= 0)[0];
      if (ok('глобалният клон изобщо пита', !!u, compUrls(h).join('\n'))) {
        ok('от понеделник на бюлетина', u.indexOf('completion_date=gte.' + MON) >= 0, u);
        ok('до неделя на бюлетина', u.indexOf('completion_date=lte.' + isoAt(6)) >= 0, u);
      }
    }
  }

  section('7. Бюлетин за ЧУЖДА седмица: днешната дата остава в обхвата');
  {
    /* Постоянна задача БЕЗ ден от седмицата се съпоставя с ДНЕШНАТА дата
       (fallback toLocalISO(new Date()) в recurringSectionHtml). Гледаш ли
       минала седмица, тя е извън диапазона — затова заявката е `or`. */
    const bulTask = {
      id: REG_ID, bulletin_id: 'b-1', title: 'Задача', department: 'trade',
      due_date: isoAt(-13), due_dates: null, task_type: 'info',
      target_stores: null, sort_order: 1, report_groups: null, linked_module: null
    };
    const h = env({ at: 2, bulWeekOf: dateAt(-14), bulTasks: [bulTask], comps: [] });
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await ticks(); await ticks(); await ticks();
      const u = compUrls(h).filter(x => x.indexOf('recurring_task_id=not.is.null') >= 0)[0];
      if (ok('глобалният клон изобщо пита', !!u, compUrls(h).join('\n'))) {
        ok('заявката е във формата or=(and(диапазон),днес)',
          u.indexOf('or=(and(completion_date.gte.' + isoAt(-14)) >= 0, u);
        ok('и носи ДНЕШНАТА дата отделно',
          u.indexOf('completion_date.eq.' + WED) >= 0, u);
        ok('не е изроден в прост диапазон до днес',
          u.indexOf('completion_date=gte.') < 0, u);
      }
    }
  }

  section('8. Бюлетин: изгледът на ЕДИН обект пак носи и магазина, и датата');
  {
    const bulTask = {
      id: REG_ID, bulletin_id: 'b-1', title: 'Задача', department: 'trade',
      due_date: TUE, due_dates: null, task_type: 'info',
      target_stores: null, sort_order: 1, report_groups: null, linked_module: null
    };
    const mgr = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: STORES[0] };
    const h = env({ at: 2, user: mgr, bulTasks: [bulTask], comps: [] });
    if (guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) {
      await ticks(); await ticks(); await ticks();
      const u = compUrls(h).filter(x => x.indexOf('recurring_task_id=not.is.null') >= 0)[0];
      if (ok('клонът на обекта изобщо пита', !!u, compUrls(h).join('\n'))) {
        ok('пази филтъра по магазин', u.indexOf('store_name=eq.') >= 0, u);
        ok('и добавя датата', u.indexOf('completion_date=gte.' + MON) >= 0, u);
      }
    }
  }

  report();
})();
