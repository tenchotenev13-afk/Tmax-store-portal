/* Постоянна задача, изключена за седмица — в ОТЧЕТИТЕ (report.js).

   Същият код тече и в send-scheduled-report / send-routed-report —
   tests/report-edge-sync.test.js заковава, че колекторите,
   reportBuildSummary, taskStoreBreakdown и копията на recurringIsSkipped /
   recurringSkipStores са байт по байт същите. Тук се проверява ПОВЕДЕНИЕТО:

     1. reportBuildSummary: skip_stores → 'na' САМО за изключения обект —
        излиза от числителя и знаменателя му; редовете на останалите са
        идентични с тези без изключване (сверени поле по поле);
     2. дневният отчет тегли изключванията за седмицата на ОТЧЕТНИЯ ден:
        глобалното маха задачата, магазинното е по обект, съседната седмица
        не се прилага;
     3. седмичният — за седмицата на бюлетина, същото правило;
     4. личният (маршрутизиран) — глобално изключената няма картичка,
        изключеният обект не е сред „Не са изпълнили".

   ⚠️ Дати: котвата е понеделникът на текущата реална седмица, часовникът се
   замразява с отместване (същият модел като recurring-window-report). Ключът
   за седмицата в данните се смята независимо — годината на четвъртъка +
   weekNum().

   Пускане: node tests/recurring-task-skips-report.test.js . */
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

function rec(id, over) {
  return Object.assign({
    id: id, title: 'Постоянна ' + id, department: 'trade', task_type: 'info', active: true, sort_order: 0,
    due_weekday: null, due_weekdays: null, due_time: '20:00', due_window: false,
    target_stores: null, report_groups: ['owner'], linked_module: null, description: null
  }, over || {});
}
function done(taskId, store, date) {
  return { id: 'c-' + taskId + '-' + store + '-' + date, recurring_task_id: taskId, task_id: null,
           store_name: store, status: 'done', completion_date: date, comment: null, photos: null, files: null };
}
function skipsRoute(rowsRef) {
  return function (url) {
    const y = /[?&]year=eq\.(\d+)/.exec(url), wk = /[?&]week_number=eq\.(\d+)/.exec(url);
    return rowsRef.rows.filter(r => (!y || r.year === +y[1]) && (!wk || r.week_number === +wk[1]));
  };
}
/* Мъничък PostgREST за task_completions — прилага gte/lte/in, за да мине
   истинската заявка на колектора, не подменен масив. */
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

/* at = отместване на замразения „днес" спрямо котвата; бюлетинът е за
   седмицата на котвата. Изключванията в базата:
     s1: r-a глобално, седмицата на котвата
     s2: r-b само за Троян, седмицата на котвата
     s3: r-c глобално, СЛЕДВАЩАТА седмица */
function env(at, comps) {
  const db = { rows: [] };
  const h = boot({ modules: ['bulletin.js', 'report.js'], user: ADMIN, data: {} });
  const w = h.w;
  freezeAt(w, at);
  const k = { year: isoWeekYear(dateAt(0)), week: w.weekNum(dateAt(0)) };
  const kn = { year: isoWeekYear(dateAt(7)), week: w.weekNum(dateAt(7)) };
  db.rows = [
    { id: 's1', recurring_task_id: 'r-a', year: k.year, week_number: k.week, store_name: null },
    { id: 's2', recurring_task_id: 'r-b', year: k.year, week_number: k.week, store_name: A },
    { id: 's3', recurring_task_id: 'r-c', year: kn.year, week_number: kn.week, store_name: null }
  ];
  h.setData('bulletins', [{ id: 'b-1', week_number: k.week, year: k.year, status: 'published', created_at: isoAt(0) }]);
  h.setData('recurring_tasks', [rec('r-a'), rec('r-b'), rec('r-c')]);
  h.setData('recurring_task_skips', skipsRoute(db));
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
const skipGets = h => h.calls.get.filter(u => u.indexOf('/recurring_task_skips') >= 0);
const pick = r => r ? { done: r.done, total: r.total, pct: r.pct, cells: r.cells } : null;

(async function () {

  /* ═══ 1. reportBuildSummary ═══════════════════════════════════════════ */
  section('1. reportBuildSummary: skip_stores → \'na\' само за изключения обект');
  {
    const h = env(3);
    const w = h.w;
    const stores = [A, B, C];
    const comps = [
      { item_id: 'r-b', kind: 'recurring', store_name: A, status: 'done' }, /* отметка ПРЕДИ изключването */
      { item_id: 'r-b', kind: 'recurring', store_name: B, status: 'done' },
      { item_id: 'r-c', kind: 'recurring', store_name: C, status: 'done' }
    ];
    const base = [
      { id: 'r-b', kind: 'recurring', title: 'B', target_stores: null },
      { id: 'r-c', kind: 'recurring', title: 'C', target_stores: null }
    ];
    const withSkip = [Object.assign({}, base[0], { skip_stores: [A] }), base[1]];
    const s0 = w.reportBuildSummary(base, comps, stores, 0);
    const s1 = w.reportBuildSummary(withSkip, comps, stores, 0);
    ok('без изключване Троян е 1/2', rowOf(s0, A).done === 1 && rowOf(s0, A).total === 2, JSON.stringify(pick(rowOf(s0, A))));
    ok('с изключване Троян е 0/1 — r-b е „не важи"', rowOf(s1, A).done === 0 && rowOf(s1, A).total === 1, JSON.stringify(pick(rowOf(s1, A))));
    ok('клетката на Троян за r-b е \'na\'', rowOf(s1, A).cells[0] === 'na', JSON.stringify(rowOf(s1, A).cells));
    ok('отметката на Троян отпреди изключването НЕ се брои', rowOf(s1, A).cells[0] !== 'done');
    ok('Ловеч е ИДЕНТИЧЕН с/без изключване', JSON.stringify(pick(rowOf(s1, B))) === JSON.stringify(pick(rowOf(s0, B))), JSON.stringify(pick(rowOf(s1, B))));
    ok('Севлиево е ИДЕНТИЧЕН с/без изключване', JSON.stringify(pick(rowOf(s1, C))) === JSON.stringify(pick(rowOf(s0, C))), JSON.stringify(pick(rowOf(s1, C))));
    ok('общо: 3/6 → 2/5 (само приносът на Троян за r-b)', s0.totalDone === 3 && s0.totalAll === 6 && s1.totalDone === 2 && s1.totalAll === 5,
      s0.totalDone + '/' + s0.totalAll + ' → ' + s1.totalDone + '/' + s1.totalAll);

    const allSkip = w.reportBuildSummary([Object.assign({}, base[0], { skip_stores: [A, B, C] })], comps, stores, 0);
    ok('граница: изключена за всички три обекта → 0 в знаменателя, 0%', allSkip.totalAll === 0 && allSkip.overallPct === 0 &&
      allSkip.rows.every(r => r.cells[0] === 'na'), JSON.stringify(allSkip.rows.map(pick)));
    const empty = w.reportBuildSummary([Object.assign({}, base[0], { skip_stores: [] }), base[1]], comps, stores, 0);
    ok('празен skip_stores = без изключване', JSON.stringify(empty.rows.map(pick)) === JSON.stringify(s0.rows.map(pick)));
    const targeted = w.reportBuildSummary([{ id: 'r-b', kind: 'recurring', title: 'B', target_stores: [A, B], skip_stores: [A] }], comps, stores, 0);
    ok('с target_stores [Троян, Ловеч] + изключен Троян: броим само Ловеч',
      targeted.totalAll === 1 && targeted.totalDone === 1 && rowOf(targeted, C).cells[0] === 'na' && rowOf(targeted, A).cells[0] === 'na',
      JSON.stringify(targeted.rows.map(pick)));

    /* Списъците под решетката: отлагане и коментар от ИЗКЛЮЧЕНИЯ обект не
       се изреждат — клетката му е 'na'. Другите обекти си остават. */
    const noisy = [
      { item_id: 'r-b', kind: 'recurring', store_name: A, status: 'postponed', comment: 'отложено от Троян' },
      { item_id: 'r-b', kind: 'recurring', store_name: B, status: 'postponed', comment: 'отложено от Ловеч' },
      { item_id: 'r-c', kind: 'recurring', store_name: A, status: 'done', comment: 'снимка от Троян' }
    ];
    const lists = w.reportBuildSummary(withSkip, noisy, stores, 0);
    ok('„Отложени": Троян по r-b НЕ е в списъка', !lists.postponedList.some(p => p.store === A), JSON.stringify(lists.postponedList));
    ok('„Отложени": Ловеч по r-b остава', lists.postponedList.some(p => p.store === B));
    ok('„Коментари": Троян по r-c (НЕ е изключен за нея) остава', lists.commentedList.some(p => p.store === A && p.comment === 'снимка от Троян'));
    const listsBase = w.reportBuildSummary(base, noisy, stores, 0);
    ok('КОНТРОЛА: без изключване Троян по r-b е в „Отложени"', listsBase.postponedList.some(p => p.store === A));
  }

  /* ═══ 2. Дневен отчет ═════════════════════════════════════════════════ */
  section('2. Дневен отчет (отчетен ден = сряда от седмицата на котвата)');
  {
    const WED = isoAt(2);
    const h = env(3, [done('r-b', A, WED), done('r-b', B, WED)]);
    const d = await collect(h, 'collectDailyReportData');
    if (ok('отчетът се събира', !!d)) {
      ok('отчетният ден е сряда', d.reportDate === WED, d.reportDate);
      const q = skipGets(h);
      ok('една заявка за СЕДМИЦАТА на отчетния ден', q.length === 1 && q[0].indexOf('year=eq.' + h.k.year) >= 0 &&
        q[0].indexOf('week_number=eq.' + h.k.week + '&') >= 0, q.join(' | '));
      const titles = d.items.map(i => i.title);
      ok('r-a (глобално) я няма в набора', titles.indexOf('Постоянна r-a') < 0, titles.join(', '));
      ok('r-b и r-c са в набора', titles.indexOf('Постоянна r-b') >= 0 && titles.indexOf('Постоянна r-c') >= 0);
      ok('Троян: 0/1 (само r-c)', rowOf(d, A).done === 0 && rowOf(d, A).total === 1, JSON.stringify(pick(rowOf(d, A))));
      ok('Ловеч: 1/2', rowOf(d, B).done === 1 && rowOf(d, B).total === 2, JSON.stringify(pick(rowOf(d, B))));
      ok('Севлиево: 0/2', rowOf(d, C).done === 0 && rowOf(d, C).total === 2, JSON.stringify(pick(rowOf(d, C))));
      ok('общо 1/5', d.totalDone === 1 && d.totalAll === 5, d.totalDone + '/' + d.totalAll);
    }
  }

  section('2б. Дневен отчет за понеделника на СЛЕДВАЩАТА седмица — нейните изключвания');
  {
    const h = env(8, []);    /* днес = следващият вторник → отчет за следващия понеделник */
    const d = await collect(h, 'collectDailyReportData');
    if (ok('отчетът се събира', !!d)) {
      ok('отчетният ден е следващият понеделник', d.reportDate === isoAt(7), d.reportDate);
      const q = skipGets(h);
      ok('заявката е за СЛЕДВАЩАТА седмица', q.length === 1 && q[0].indexOf('week_number=eq.' + h.kn.week + '&') >= 0, q.join(' | '));
      const titles = d.items.map(i => i.title);
      ok('r-a и r-b отново са в набора', titles.indexOf('Постоянна r-a') >= 0 && titles.indexOf('Постоянна r-b') >= 0, titles.join(', '));
      ok('r-c (глобално тази седмица) я няма', titles.indexOf('Постоянна r-c') < 0);
      ok('Троян отново дължи r-b (2/2 в знаменателя)', rowOf(d, A).total === 2, JSON.stringify(pick(rowOf(d, A))));
    }
  }

  /* ═══ 3. Седмичен отчет ═══════════════════════════════════════════════ */
  section('3. Седмичен отчет (седмицата на котвата, гледана в следващия понеделник)');
  {
    const h = env(7, [done('r-b', A, isoAt(1)), done('r-b', B, isoAt(1))]);
    const d = await collect(h, 'collectWeeklyReportData');
    if (ok('отчетът се събира', !!d)) {
      const q = skipGets(h);
      ok('една заявка за седмицата на БЮЛЕТИНА', q.length === 1 && q[0].indexOf('year=eq.' + h.k.year) >= 0 &&
        q[0].indexOf('week_number=eq.' + h.k.week + '&') >= 0, q.join(' | '));
      ok('r-a (глобално) я няма в нито едно явяване', !d.items.some(i => i.id === 'r-a'));
      const rb = d.items.filter(i => i.id === 'r-b');
      ok('r-b: 7 явявания, всяко със skip_stores=[Троян]', rb.length === 7 && rb.every(i => JSON.stringify(i.skip_stores) === JSON.stringify([A])),
        rb.length + ' ' + JSON.stringify(rb[0] && rb[0].skip_stores));
      ok('r-c: 7 явявания без изключване (то е за следващата седмица)',
        d.items.filter(i => i.id === 'r-c' && (!i.skip_stores || !i.skip_stores.length)).length === 7);
      ok('Троян: 0/7 (само r-c)', rowOf(d, A).done === 0 && rowOf(d, A).total === 7, JSON.stringify({ d: rowOf(d, A).done, t: rowOf(d, A).total }));
      ok('Ловеч: 1/14', rowOf(d, B).done === 1 && rowOf(d, B).total === 14, JSON.stringify({ d: rowOf(d, B).done, t: rowOf(d, B).total }));
      ok('Севлиево: 0/14', rowOf(d, C).done === 0 && rowOf(d, C).total === 14, JSON.stringify({ d: rowOf(d, C).done, t: rowOf(d, C).total }));
    }
  }

  section('3в. „Без срок": седмичният не брои изключената за всички — като дневния');
  {
    /* r-n1 и r-n2 — без ден и без час; r-n1 е изключена за всички в
       седмицата на котвата. */
    const addNoDue = h => {
      h.setData('recurring_tasks', [rec('r-a'), rec('r-b'), rec('r-c'),
        rec('r-n1', { due_time: null }), rec('r-n2', { due_time: null })]);
    };
    const hw = env(7, []);
    addNoDue(hw);
    hw.setData('recurring_task_skips', skipsRoute({ rows: [
      { id: 'n1', recurring_task_id: 'r-n1', year: hw.k.year, week_number: hw.k.week, store_name: null }
    ] }));
    const dw = await collect(hw, 'collectWeeklyReportData');
    ok('седмичен: noDueCount = 1 (r-n2), не 2', !!dw && dw.noDueCount === 1, dw && String(dw.noDueCount));
    const hd = env(3, []);
    addNoDue(hd);
    hd.setData('recurring_task_skips', skipsRoute({ rows: [
      { id: 'n1', recurring_task_id: 'r-n1', year: hd.k.year, week_number: hd.k.week, store_name: null }
    ] }));
    const dd = await collect(hd, 'collectDailyReportData');
    ok('дневен за същата седмица: също 1', !!dd && dd.noDueCount === 1, dd && String(dd.noDueCount));
  }

  section('3б. Седмичен отчет: провал на заявката → отчетът тръгва без изключвания');
  {
    const h = env(7, []);
    h.setData('recurring_task_skips', () => ({ message: 'relation does not exist' })); /* не масив — както върне PostgREST грешка */
    const d = await collect(h, 'collectWeeklyReportData');
    ok('отчетът се събира', !!d);
    ok('всички три задачи са в набора', !!d && ['r-a', 'r-b', 'r-c'].every(id => d.items.some(i => i.id === id)));
  }

  /* ═══ 4. Личният (маршрутизиран) отчет ════════════════════════════════ */
  section('4. Личен отчет: без картичка за глобалната, без изключения обект в „Не са изпълнили"');
  {
    const h = env(7, [done('r-b', B, isoAt(1))]);
    const w = h.w;
    const data = await collect(h, 'collectWeeklyRoutingData');
    if (ok('данните се събират', !!data)) {
      const q = skipGets(h);
      ok('една заявка за седмицата на бюлетина', q.length === 1 && q[0].indexOf('week_number=eq.' + h.k.week + '&') >= 0, q.join(' | '));
      const ids = data.tasks.map(t => t.id);
      ok('r-a (глобално) няма картичка', ids.indexOf('r-a') < 0, ids.join(','));
      const tb = data.tasks.find(t => t.id === 'r-b');
      ok('r-b носи skip_stores=[Троян]', tb && JSON.stringify(tb.skip_stores) === JSON.stringify([A]), tb && JSON.stringify(tb.skip_stores));
      const bd = w.taskStoreBreakdown(tb, data.comps, data.stores);
      ok('обхватът на r-b е Ловеч и Севлиево', JSON.stringify(bd.scope) === JSON.stringify([B, C]), JSON.stringify(bd.scope));
      ok('„Не са изпълнили" е само Севлиево', JSON.stringify(bd.pending) === JSON.stringify([C]), JSON.stringify(bd.pending));
      const card = w.personalizedTaskCardHtml(tb, data.comps, data.stores);
      ok('картичката казва „1 от 2 обекта изпълнили"', card.indexOf('1 от 2 обекта изпълнили') >= 0);
      ok('Троян не се споменава в картичката', card.indexOf(A) < 0);
      const tc = data.tasks.find(t => t.id === 'r-c');
      ok('r-c: обхват и трите обекта', tc && JSON.stringify(w.taskStoreBreakdown(tc, data.comps, data.stores).scope) === JSON.stringify([A, B, C]));
    }
  }

  section('4б. Личен отчет: насочена задача с изключен единствен обект → без картичка „0 от 0"');
  {
    const h = env(7, []);
    h.setData('recurring_tasks', [rec('r-b'), rec('r-t', { target_stores: [A] }), rec('r-u', { target_stores: [A, B] })]);
    h.setData('recurring_task_skips', skipsRoute({ rows: [
      { id: 't1', recurring_task_id: 'r-t', year: h.k.year, week_number: h.k.week, store_name: A },
      { id: 'u1', recurring_task_id: 'r-u', year: h.k.year, week_number: h.k.week, store_name: A }
    ] }));
    const data = await collect(h, 'collectWeeklyRoutingData');
    const ids = data ? data.tasks.map(t => t.id) : [];
    ok('r-t (само Троян, Троян изключен) няма картичка', ids.indexOf('r-t') < 0, ids.join(','));
    ok('r-u (Троян и Ловеч, изключен само Троян) има картичка', ids.indexOf('r-u') >= 0);
    const tu = data && data.tasks.find(t => t.id === 'r-u');
    ok('r-u: обхватът е само Ловеч', !!tu && JSON.stringify(h.w.taskStoreBreakdown(tu, data.comps, data.stores).scope) === JSON.stringify([B]));
  }

  report();
})().catch(function (e) {
  ok('тестът стига до края без необработено изключение', false, e && e.stack);
  report();
});
