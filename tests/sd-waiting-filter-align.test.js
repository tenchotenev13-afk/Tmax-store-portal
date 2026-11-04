/* Разлики: статус-филтърът „📝 Чакат моя отговор" следва баджа, и пулсът на
   склада тегли id на реда (04.11.2026, сесия sd-waiting-filter-align).

   ПОВОД. На 04.11 (f454ffe) баджът на обекта спря да брои стока на път —
   брои по diffLineWaitsStore() (shared.js), като Бюлетина и чипа „Само
   чакащите мен". Филтърът „📝 Чакат моя отговор" (sdMyWaitingLines →
   sdWaitingIds) още броеше 'sent'/'sent_sap' по старото sdLineWaitsStore.
   Решение на Тенчо 04.11: и филтърът по същото правило. ОТМЕНЯ решението
   от 14–15.10 (claude/open/closed/15-10-diff-old-rule-two-places.md).
   sdLineWaitsStore е махната — нямаше друг потребител.
   Пулсът на склада не теглеше id на вложените редове, затова закъсняла
   размяна (lateTo[String(l.id)]) вдигаше баджа при рендер, но не в пулса.

   ТВЪРДЕНИЯТА (обект Шумен, реален ред shared.js → bulletin.js →
   stock-differences.js):
   а) 'sent' и 'sent_sap' — не са във филтъра, но банерът „🚚 2 реда са на път
      към вас" (sdStoreHints().onway) още ги брои;
   б) 'return' без отговор — във филтъра;
   в) 'return' с wrong_barcode / similar_item — не е;
   г) размяна linked (обектът изпращач) и sent (обектът получател) — във
      филтъра; sent, където обектът е изпращач — не;
   д) филтърът, чипът „Само чакащите мен" и баджът дават едни и същи бланки;
      истински клик на чипа „📝 Чакат моя отговор (3)" оставя точно 3 реда;
   е) склад: закъсняла размяна по бланка без друг чакащ ред — пулсът (stub на
      sbGet, връщащ САМО колоните от select-а) и рендерът дават 1; заявките
      на обекта и на Цвети/admin — непроменени.

   МУТАЦИИ (пускани ръчно на 04.11.2026, всяка пада):
   M1 върнат старият критерий в sdMyWaitingLines ('sent'/'sent_sap'/'return'
      без категория) → падат а), в), д);
   M2 махнат 'id,' от select-а на склада → пада е) (пулс 0 ≠ рендер 1);
   M3 махната проверката за difference_category в diffLineWaitsStore → пада в).

   Пускане: node tests/sd-waiting-filter-align.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick, btn } = H;

const ANCHOR = new Date('2026-11-04T12:00:00');
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const daysAgo = n => new Date(ANCHOR.getTime() - n * 86400000).toISOString();
const STORE = 'Шумен';
const OTHER = 'Варна';
const WH = 'Логистичен склад Търговище';
const USER = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: STORE, assigned_stores: [] };
const WH_USER = { email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'manager', store_name: WH, assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function rep(id, over) {
  return Object.assign({ id: id, direction: 'interstore', store_name: STORE, counterpart: WH,
    document_number: 'Д-' + id, doc_date: '2026-10-17', submitted_by: 'Управител Шумен', general_comment: '',
    photos: [], reviewed: false, created_at: '2026-10-17T09:00:00.000Z' }, over || {});
}
function line(id, repId, over) {
  return Object.assign({ id: id, store_name: STORE, supplier: WH, report_id: repId,
    material_code: '1' + id, material_name: 'АРТИКУЛ ' + id, quantity: 2, quantity_received: 1, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null, resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: 'return', /* с тип — иначе редът е в „За преглед", не в таблицата */
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null, store_corrected_at: null,
    warehouse_response: null, warehouse_comment: null, store_response: null, store_response_by: null,
    store_response_at: null, store_response_comment: null, created_at: '2026-10-17T09:00:00.000Z' }, over || {});
}

const REPS = [
  rep('rep-on'), rep('rep-ret'), rep('rep-cat'),
  rep('rep-sw1', { counterpart: OTHER }), rep('rep-sw2', { counterpart: OTHER }), rep('rep-sw3', { counterpart: OTHER })
];
const LINES = [
  line('on1', 'rep-on', { warehouse_response: 'sent' }),
  line('on2', 'rep-on', { warehouse_response: 'sent_sap' }),
  line('ret1', 'rep-ret', { warehouse_response: 'return' }),
  line('wb1', 'rep-cat', { warehouse_response: 'return', difference_category: 'wrong_barcode' }),
  line('si1', 'rep-cat', { warehouse_response: 'return', difference_category: 'similar_item' }),
  line('sw1', 'rep-sw1', { supplier: OTHER }),
  line('sw2', 'rep-sw2', { supplier: OTHER }),
  line('sw3', 'rep-sw3', { supplier: OTHER })
];
const SWAPS = [
  { id: 's1', status: 'linked', from_store: STORE, to_store: OTHER, from_line_id: 'sw1', to_line_id: 'x1' },
  { id: 's2', status: 'sent', from_store: OTHER, to_store: STORE, from_line_id: 'x2', to_line_id: 'sw2', sent_at: daysAgo(1) },
  { id: 's3', status: 'sent', from_store: STORE, to_store: OTHER, from_line_id: 'sw3', to_line_id: 'x3', sent_at: daysAgo(1) }
];

function env(user, reports, lines, swaps) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'bulletin.js', 'today.js', 'report.js'],
    user: user, confirm: true,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }, { name: WH }, { name: OTHER }],
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: [], bulletin_tasks: [], task_completions: [],
      stock_differences: () => (lines || []).map(l => Object.assign({}, l)),
      differences_reports: () => (reports || []).map(r => Object.assign({}, r)),
      stock_diff_swaps: () => (swaps || []).map(s => Object.assign({}, s)),
      stock_returns: [], transport_orders: [], goods_transit: [], contacts: [{ name: 'ТЕСИ ООД' }],
      supply_templates: [], supply_entries: [], supply_no_need: [],
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w);
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE, OTHER];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 40); i++) await ticks(); }
const clone = x => JSON.parse(JSON.stringify(x));
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();

/* Глобалните както ги зарежда модулът — за чистите функции. */
function setData(h, reps, lines, swaps) {
  h.w.diffReports = clone(reps); h.w.sdData = clone(lines); h.w.sdSwaps = clone(swaps);
  h.w.sdResetWaitingCache();
}
function renderBadge(h, reps, lines, swaps) {
  setData(h, reps, lines, swaps);
  let got = null;
  const orig = h.w.sdSetTabBadge;
  h.w.sdSetTabBadge = n => { got = n; };
  try { h.w.sdUpdateTabBadgeFromData(); } finally { h.w.sdSetTabBadge = orig; }
  return got;
}

/* select=a,b,emb(c,d) → { cols:[a,b], emb:{ emb:[c,d] } } */
function parseSelect(q) {
  const m = /(?:^|&)select=([^&]*)/.exec(q); if (!m) return null;
  const s = decodeURIComponent(m[1]); const out = { cols: [], emb: {} };
  let depth = 0, cur = '';
  const push = t => { t = t.trim(); if (!t) return; const e = /^(\w+)\((.*)\)$/.exec(t);
    if (e) out.emb[e[1]] = e[2].split(',').map(x => x.trim()); else out.cols.push(t); };
  for (const ch of s) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { push(cur); cur = ''; } else cur += ch;
  }
  push(cur); return out;
}
const pick = (o, cols) => { const r = {}; cols.forEach(c => { if (c in o) r[c] = o[c]; }); return r; };

/* Пулсът със stub, който връща САМО поисканите колони — махната колона
   наистина липсва, както на живо. Размените — по колоните от select-а. */
async function pulse(h, reps, lines, swaps) {
  const seen = [];
  h.w.sbGet = function (table, q) {
    seen.push(table + '?' + q);
    const sel = parseSelect(q);
    if (table === 'differences_reports') {
      const rows = reps.filter(r => !r.reviewed).map(r => {
        const o = pick(r, sel.cols);
        if (sel.emb.stock_differences) o.stock_differences = lines.filter(l => l.report_id === r.id).map(l => pick(l, sel.emb.stock_differences));
        return o;
      });
      return Promise.resolve(clone(rows));
    }
    if (table === 'stock_diff_swaps') return Promise.resolve(clone(swaps.map(s => sel ? pick(s, sel.cols) : s)));
    return Promise.resolve([]);
  };
  Object.defineProperty(h.doc, 'hidden', { value: false, configurable: true });
  let got = null;
  h.w.sdBadgePulse = n => { got = n; };
  h.w.sdRefreshTabBadge();
  await settle(10);
  return { n: got, q: seen.find(s => s.indexOf('differences_reports?') === 0) || '' };
}

(async function () {

  section('1. Филтърът „Чакат моя отговор" — ред по ред (обект Шумен)');
  {
    const h = env(USER, [], [], []);
    ok('shared.js → bulletin.js → stock-differences.js заредени', typeof h.w.diffLineWaitsStore === 'function' &&
      typeof h.w.bulDiffStoreWaiting === 'function' && typeof h.w.sdMyWaitingLines === 'function');
    ok('sdLineWaitsStore е махната', typeof h.w.sdLineWaitsStore === 'undefined');
    setData(h, REPS, LINES, SWAPS);
    const ids = Object.keys(h.w.sdWaitingIds()).sort().join(',');
    ok('във филтъра са точно ret1, sw1, sw2', ids === 'ret1,sw1,sw2', ids);
    ok('а) sent / sent_sap НЕ са във филтъра', !h.w.sdWaitingIds().on1 && !h.w.sdWaitingIds().on2);
    const onway = h.w.sdStoreHints().onway.map(l => l.id).sort().join(',');
    ok('а) …но банерът „на път" ги брои (on1, on2)', onway === 'on1,on2', onway);
    ok('б) return без отговор — във филтъра', h.w.sdWaitingIds().ret1 === 1);
    ok('в) wrong_barcode — не', !h.w.sdWaitingIds().wb1);
    ok('в) similar_item — не', !h.w.sdWaitingIds().si1);
    ok('г) размяна linked, обектът изпращач — във филтъра', h.w.sdWaitingIds().sw1 === 1);
    ok('г) размяна sent, обектът получател — във филтъра', h.w.sdWaitingIds().sw2 === 1);
    ok('г) размяна sent, обектът изпращач — не (чака отсрещния)', !h.w.sdWaitingIds().sw3);
  }

  section('2. Филтър = чип „Само чакащите мен" = бадж (едни и същи бланки)');
  {
    const h = env(USER, [], [], []);
    setData(h, REPS, LINES, SWAPS);
    const filterReps = Array.from(new Set(h.w.sdMyWaitingLines().map(l => l.report_id))).sort().join(',');
    const chipReps = Object.keys(h.w.sdBulWaitingReportIds()).sort().join(',');
    const badgeReps = REPS.filter(r => h.w.sdUnreviewedCountFor([r], LINES, SWAPS) === 1).map(r => r.id).sort().join(',');
    ok('филтърът: rep-ret, rep-sw1, rep-sw2', filterReps === 'rep-ret,rep-sw1,rep-sw2', filterReps);
    ok('чипът = филтъра', chipReps === filterReps, chipReps);
    ok('баджът = филтъра', badgeReps === filterReps, badgeReps);
    ok('рендер-баджът = 3', renderBadge(h, REPS, LINES, SWAPS) === 3, String(renderBadge(h, REPS, LINES, SWAPS)));
  }

  section('3. Истинският екран: чипът „📝 Чакат моя отговор (3)" и клик');
  {
    const h = env(USER, REPS, LINES, SWAPS);
    h.w.sdDirTab = 'interstore'; h.w.sdView = 'rows'; h.w.sdTypeFilter = 'all';
    if (guard('showModule(stock-diff) не хвърля', () => h.w.showModule('stock-diff'))) {
      await settle(60);
      const mod = h.doc.getElementById('mod-stock-diff');
      const b = btn(mod, 'Чакат моя отговор');
      if (ok('чипът „Чакат моя отговор" го има', !!b)) {
        ok('и показва (3)', /\(3\)/.test(b.textContent), b.textContent.trim());
        realClick(h.w, b);
        const tb = txt(h.doc.getElementById('sd-rows'));
        ok('след клик: ret1, sw1, sw2 в таблицата',
          ['ret1', 'sw1', 'sw2'].every(id => tb.indexOf('АРТИКУЛ ' + id) >= 0), tb.slice(0, 160));
        ok('и нито on1, on2, wb1, si1, sw3',
          ['on1', 'on2', 'wb1', 'si1', 'sw3'].every(id => tb.indexOf('АРТИКУЛ ' + id) < 0), tb.slice(0, 160));
      }
      const on = h.doc.getElementById('sd-onway-note');
      ok('банерът „🚚 2 реда са на път към вас" е на място', /🚚 2 реда са на път към вас/.test(txt(on)), txt(on));
    }
  }

  section('4. Склад: закъсняла размяна — пулс = рендер');
  {
    /* Бланка с един ред: складът е отговорил 'sent', обектът още не — по
       самия ред складът НЕ чака. Чака само заради закъснялата размяна. */
    const W_REPS = [rep('w-late', { store_name: OTHER }), rep('w-ok', { store_name: OTHER })];
    const W_LINES = [
      line('wl1', 'w-late', { store_name: OTHER, warehouse_response: 'sent' }),
      line('wo1', 'w-ok', { store_name: OTHER, warehouse_response: 'sent' })
    ];
    const W_SWAPS = [{ id: 'ws1', status: 'sent', warehouse: WH, from_store: STORE, to_store: OTHER,
      from_line_id: 'y1', to_line_id: 'wl1', sent_at: daysAgo(7) }];
    const hw = env(WH_USER, [], [], []);
    ok('складов акаунт', hw.w.isLogisticsWarehouseUser() === true);
    ok('размяната е закъсняла', hw.w.sdSwapIsLate(W_SWAPS[0]) === true);
    const r = renderBadge(hw, W_REPS, W_LINES, W_SWAPS);
    ok('рендер = 1', r === 1, String(r));
    const p = await pulse(hw, W_REPS, W_LINES, W_SWAPS);
    ok('пулс = 1', p.n === 1, String(p.n));
    ok('пулс = рендер', p.n === r, p.n + ' / ' + r);
    ok('заявката на склада тегли id на реда',
      p.q === 'differences_reports?select=id,store_name,counterpart,reviewed,stock_differences(id,report_id,warehouse_response,store_response,status)&reviewed=eq.false&counterpart=eq.' + encodeURIComponent(WH), p.q);
    const p0 = await pulse(hw, W_REPS, W_LINES, []);
    ok('без размяна — пулс 0', p0.n === 0, String(p0.n));

    const hs = env(USER, [], [], []);
    const ps = await pulse(hs, REPS, LINES, SWAPS);
    ok('обект: заявката е непроменена (от f454ffe)',
      /select=id,store_name,counterpart,reviewed,direction,stock_differences\(id,difference_category,report_id,warehouse_response,store_response,status\)/.test(ps.q), ps.q);
    ok('обект: пулс 3', ps.n === 3, String(ps.n));
    const ha = env(ADMIN, [], [], []);
    const pa = await pulse(ha, REPS, LINES, SWAPS);
    ok('admin: заявката е непроменена', pa.q === 'differences_reports?select=id,store_name,counterpart,reviewed&reviewed=eq.false', pa.q);
    ok('admin: пулс = всички непрегледани (6)', pa.n === 6, String(pa.n));
  }

  report();
})();
