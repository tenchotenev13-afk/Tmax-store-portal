/* Разлики: баджът на таба за ОБЕКТ брои само реалния ход на обекта
   (04.11.2026, сесия sd-badge-store-align).

   ПОВОД. Управител Шумен вижда бадж „1" (бланка 51526265-… от 17.10, 2 реда
   'sent' от Логистичен склад Търговище), а „📝 Само чакащите мен (0)".
   Баджът (sdUnreviewedCountFor) броеше 'sent' / 'sent_sap' без отговор —
   стока на път, — докато чипът и Бюлетинът (bulDiffStoreWaiting →
   diffLineWaitsStore, огледало на stock_diff_store_done) от 14.10 не ги броят.
   Решение на Тенчо: баджът на обекта брои САМО реалния ход — правилото на
   Бюлетина.

   ТВЪРДЕНИЯТА:
   а) бланка само с 'sent' и 'sent_sap' → 0;
   б) ред 'return' без store_response → 1 (wrong_barcode → 0, както Бюлетина);
   в) размяна linked, обектът е изпращач → 1;
   г) размяна sent, обектът е получател → 1;
   д) доставчикова бланка с какъвто и да е отговор / размяна → 0;
   е) пулсът (sdRefreshTabBadge със stub на sbGet, който връща САМО колоните
      от select-а) и рендерът (sdUpdateTabBadgeFromData) дават едно число,
      и то съвпада с бланките на чипа „Само чакащите мен";
   ж) склад и canReviewDiff — числата и заявките на пулса непроменени;
   з) казусът Шумен през истинския showModule: банерът „🚚 2 реда са на път
      към вас" остава, баджът е скрит.

   МУТАЦИИ (пускани ръчно на 04.11.2026, всяка пада):
   M1 върнат 'sent'/'sent_sap' в условието на sdUnreviewedCountFor
      (|| warehouse_response==='sent'...) → падат а), е), з);
   M2 махнат филтърът r.direction!=='interstore' → пада д);
   M3 махнат ',direction' от select-а на пулса → пада е) (пулс 0 ≠ рендер 3).
   M4 махнат 'id,' от вложените редове на пулса → пада е) (размените).

   Пускане: node tests/sd-badge-store-align.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ANCHOR = new Date('2026-11-04T12:00:00');
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
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
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null, store_corrected_at: null,
    warehouse_response: null, warehouse_comment: null, store_response: null, store_response_by: null,
    store_response_at: null, store_response_comment: null, created_at: '2026-10-17T09:00:00.000Z' }, over || {});
}

/* ── Случаите поотделно ── */
const CASES = {
  a: { reps: [rep('rep-a')], lines: [line('a1', 'rep-a', { warehouse_response: 'sent' }), line('a2', 'rep-a', { warehouse_response: 'sent_sap' })], swaps: [] },
  b: { reps: [rep('rep-b')], lines: [line('b1', 'rep-b', { warehouse_response: 'return' })], swaps: [] },
  bwb: { reps: [rep('rep-bw')], lines: [line('bw1', 'rep-bw', { warehouse_response: 'return', difference_category: 'wrong_barcode' })], swaps: [] },
  c: { reps: [rep('rep-c', { counterpart: OTHER })], lines: [line('c1', 'rep-c', { warehouse_response: null })],
       swaps: [{ status: 'linked', from_store: STORE, to_store: OTHER, from_line_id: 'c1', to_line_id: 'x-c' }] },
  cRev: { reps: [rep('rep-cr', { counterpart: OTHER })], lines: [line('cr1', 'rep-cr', { warehouse_response: null })],
       swaps: [{ status: 'sent', from_store: STORE, to_store: OTHER, from_line_id: 'cr1', to_line_id: 'x-cr' }] },
  d: { reps: [rep('rep-d', { counterpart: OTHER })], lines: [line('d1', 'rep-d', { warehouse_response: null })],
       swaps: [{ status: 'sent', from_store: OTHER, to_store: STORE, from_line_id: 'x-d', to_line_id: 'd1' }] },
  e: { reps: [rep('rep-e', { direction: 'supplier', counterpart: 'ТЕСИ ООД' })],
       lines: [line('e1', 'rep-e', { warehouse_response: 'return' }), line('e2', 'rep-e', { warehouse_response: 'sent' }),
               line('e3', 'rep-e', { warehouse_response: 'sent_sap' }), line('e4', 'rep-e', { warehouse_response: null })],
       swaps: [{ status: 'linked', from_store: STORE, to_store: OTHER, from_line_id: 'e4', to_line_id: 'x-e' }] }
};
/* Комбинацията за пулса/рендера: б + в + г = 3, плюс шум (а, д, wrong_barcode,
   прегледана бланка с 'return'). */
const ALL_KEYS = ['a', 'b', 'bwb', 'c', 'cRev', 'd', 'e'];
const ALL_REPS = [].concat(...ALL_KEYS.map(k => CASES[k].reps), [rep('rep-rv', { reviewed: true })]);
const ALL_LINES = [].concat(...ALL_KEYS.map(k => CASES[k].lines), [line('rv1', 'rep-rv', { warehouse_response: 'return' })]);
const ALL_SWAPS = [].concat(...ALL_KEYS.map(k => CASES[k].swaps));

/* Казусът Шумен — бланка 51526265-… от 17.10, 2 реда 'sent' от склада. */
const SH_REP = rep('51526265-aaaa-4bbb-8ccc-000000000001');
const SH_LINES = [line('sh1', SH_REP.id, { warehouse_response: 'sent' }), line('sh2', SH_REP.id, { warehouse_response: 'sent' })];

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

/* Рендерът: глобалните както ги зарежда модулът, после sdUpdateTabBadgeFromData. */
function renderCount(h, reps, lines, swaps) {
  h.w.diffReports = clone(reps); h.w.sdData = clone(lines); h.w.sdSwaps = clone(swaps);
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

/* Пулсът: sbGet е подменен с PostgREST-подобен stub, който връща САМО
   поисканите колони и вложените редове. Така махната колона от select-а
   наистина липсва в данните, както на живо. */
async function pulseCount(h, reps, lines, swaps) {
  const seen = [];
  h.w.sbGet = function (table, q) {
    seen.push(table + '?' + q);
    if (table === 'differences_reports') {
      const sel = parseSelect(q);
      const rows = reps.filter(r => !r.reviewed).map(r => {
        const o = pick(r, sel.cols);
        if (sel.emb.stock_differences) o.stock_differences = lines.filter(l => l.report_id === r.id).map(l => pick(l, sel.emb.stock_differences));
        return o;
      });
      return Promise.resolve(clone(rows));
    }
    if (table === 'stock_diff_swaps') return Promise.resolve(clone(swaps));
    return Promise.resolve([]);
  };
  /* jsdom е „скрит" по подразбиране — пулсът тогава не пита сървъра. */
  Object.defineProperty(h.doc, "hidden", { value: false, configurable: true });
  let got = null;
  h.w.sdBadgePulse = n => { got = n; };
  h.w.sdRefreshTabBadge();
  await settle(10);
  return { n: got, seen: seen };
}

(async function () {

  section('1. Случаите поотделно (рендер, обект Шумен)');
  {
    const h = env(USER, [], [], []);
    const c = k => renderCount(h, CASES[k].reps, CASES[k].lines, CASES[k].swaps);
    ok('shared.js → bulletin.js → stock-differences.js заредени', typeof h.w.diffLineWaitsStore === 'function' &&
      typeof h.w.bulDiffStoreWaiting === 'function' && typeof h.w.sdUnreviewedCountFor === 'function');
    ok('а) само sent + sent_sap → 0', c('a') === 0, String(c('a')));
    ok('б) return без отговор → 1', c('b') === 1, String(c('b')));
    ok('б) return, но wrong_barcode → 0 (както Бюлетина)', c('bwb') === 0, String(c('bwb')));
    ok('в) размяна linked, обектът изпращач → 1', c('c') === 1, String(c('c')));
    ok('в) размяна sent, обектът изпращач → 0 (чака отсрещния)', c('cRev') === 0, String(c('cRev')));
    ok('г) размяна sent, обектът получател → 1', c('d') === 1, String(c('d')));
    ok('д) доставчикова бланка (return/sent/sent_sap/размяна) → 0', c('e') === 0, String(c('e')));
    ok('всичко заедно → 3 (б, в, г)', renderCount(h, ALL_REPS, ALL_LINES, ALL_SWAPS) === 3,
      String(renderCount(h, ALL_REPS, ALL_LINES, ALL_SWAPS)));
    /* Съвпадение с чипа „Само чакащите мен" — бланките с ред по bulDiffStoreWaiting. */
    renderCount(h, ALL_REPS, ALL_LINES, ALL_SWAPS);
    const chipReps = Object.keys(h.w.sdBulWaitingReportIds()).sort().join(',');
    ok('бланките на чипа = rep-b, rep-c, rep-d', chipReps === 'rep-b,rep-c,rep-d', chipReps);
  }

  section('2. Пулс = рендер (обект)');
  {
    const h = env(USER, [], [], []);
    const r = await pulseCount(h, ALL_REPS, ALL_LINES, ALL_SWAPS);
    const rendered = renderCount(h, ALL_REPS, ALL_LINES, ALL_SWAPS);
    ok('пулсът дава 3', r.n === 3, String(r.n));
    ok('пулс = рендер', r.n === rendered, r.n + ' / ' + rendered);
    const q = r.seen.find(s => s.indexOf('differences_reports?') === 0) || '';
    ok('select-ът носи direction', /select=id,store_name,counterpart,reviewed,direction/.test(q), q);
    ok('вложените редове носят id и difference_category',
      /stock_differences\(id,difference_category,report_id,warehouse_response,store_response,status\)/.test(q), q);
    const sh = await pulseCount(h, [SH_REP], SH_LINES, []);
    ok('казус Шумен: пулсът дава 0', sh.n === 0, String(sh.n));
  }

  section('3. Склад и Цвети/admin — непроменени');
  {
    const WH_REPS = [
      rep('w-a', { store_name: OTHER }),           /* отговорено sent → не чака склада */
      rep('w-n', { store_name: OTHER }),           /* ред без отговор → чака */
      rep('w-s', { store_name: STORE }),           /* sap_done, неприключен → чака */
      rep('w-x', { store_name: STORE, counterpart: 'Логистичен склад Бургас' })
    ];
    const WH_LINES = [
      line('wa1', 'w-a', { store_name: OTHER, warehouse_response: 'sent' }),
      line('wn1', 'w-n', { store_name: OTHER, warehouse_response: null }),
      line('ws1', 'w-s', { warehouse_response: 'return', store_response: 'sap_done' }),
      line('wx1', 'w-x', { warehouse_response: null })
    ];
    const hw = env(WH_USER, [], [], []);
    ok('складът е складов акаунт', hw.w.isLogisticsWarehouseUser() === true);
    ok('склад: рендер = 2', renderCount(hw, WH_REPS, WH_LINES, []) === 2, String(renderCount(hw, WH_REPS, WH_LINES, [])));
    const pw = await pulseCount(hw, WH_REPS.filter(r => r.counterpart === WH), WH_LINES, []);
    ok('склад: пулс = 2', pw.n === 2, String(pw.n));
    const qw = pw.seen.find(s => s.indexOf('differences_reports?') === 0) || '';
    /* От 04.11.2026 (sd-waiting-filter-align) складът тегли и id на реда —
       иначе закъсняла размяна не се засича в пулса. */
    ok('склад: заявката — постарому плюс id на реда', qw === 'differences_reports?select=id,store_name,counterpart,reviewed,stock_differences(id,report_id,warehouse_response,store_response,status)&reviewed=eq.false&counterpart=eq.' + encodeURIComponent(WH), qw);

    const ha = env(ADMIN, [], [], []);
    ok('admin е canReviewDiff', !!ha.w.canReviewDiff());
    ok('admin: рендер = всички непрегледани (7)', renderCount(ha, ALL_REPS, ALL_LINES, ALL_SWAPS) === 7,
      String(renderCount(ha, ALL_REPS, ALL_LINES, ALL_SWAPS)));
    const pa = await pulseCount(ha, ALL_REPS, ALL_LINES, ALL_SWAPS);
    ok('admin: пулс = 7', pa.n === 7, String(pa.n));
    const qa = pa.seen.find(s => s.indexOf('differences_reports?') === 0) || '';
    ok('admin: заявката е постарому', qa === 'differences_reports?select=id,store_name,counterpart,reviewed&reviewed=eq.false', qa);
  }

  section('4. Казусът Шумен през истинския showModule');
  {
    const h = env(USER, [SH_REP], SH_LINES, []);
    h.w.sdDirTab = 'interstore'; h.w.sdView = 'reports';
    if (guard('showModule(stock-diff) не хвърля', () => h.w.showModule('stock-diff'))) {
      await settle(60);
      const b = h.doc.getElementById('sd-onway-note');
      const t = b ? b.textContent.replace(/\s+/g, ' ') : '';
      ok('банерът „🚚 2 реда са на път към вас" остава', /🚚 2 реда са на път към вас/.test(t), t);
      ok('няма „чака вашия отговор"', !h.doc.getElementById('sd-waiting-note'));
      const badge = h.doc.getElementById('badge-stock-diff');
      ok('баджът е скрит (0)', !badge || badge.style.display === 'none', badge ? badge.style.display + ' ' + badge.textContent : '');
      ok('рендер-броячът е 0', h.w.sdUnreviewedCountFor(h.w.diffReports, h.w.sdData) === 0);
      const chip = h.doc.getElementById('sd-only-waiting-on');
      ok('чипът (ако е показан) е „(0)"', !chip || /\(0\)/.test(chip.textContent), chip ? chip.textContent : 'няма чип');
    }
  }

  report();
})();
