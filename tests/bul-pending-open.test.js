/* Бюлетин → „Отвори →" за Разлики води до РЕДОВЕТЕ, които чакат обекта
   (24.10.2026, след проверката на живо с Монтана).

   ПОВОД. bul-pending-hint (6deab80) пращаше бутона в „Решени редове" +
   „Чакат моя отговор" на подтаба на доставчиците. Чакащите редове обаче са по
   НЕПРЕГЛЕДАНИ МЕЖДУСКЛАДОВИ бланки и днес всичките са без тип (14 от 14 в
   базата на 24.10), а ред без тип не влиза в „Решени редове" — Монтана видя
   „Чакат моя отговор (0)" при надпис „⏳ 3 реда чакат отговор".

   ТВЪРДЕНИЯТА (обект, fixture като реалния случай — междускладова бланка,
   reviewed=false, ред type=null, warehouse_response='return'):
   · ИСТИНСКИ клик на „Отвори →" в главния списък (реалният showModule и
     loadStockDiff) → активен е подтабът „междускладови", изгледът е
     „Бланки за преглед" и чакащият ред е В DOM-а;
   · показани са само бланките с чакащ ред; чипът „Покажи всички бланки"
     връща останалите и не изчезва (става „Само чакащите мен");
   · същото през бутона към модула в „План за деня";
   · стар брояч без реално чакащи редове → чипът стои с (0), път обратно има;
   · брой 0 → няма „Отвори", бутонът към модула — showModule, както преди;
   · правилото е ЕДНО: bulDiffStoreWaiting (bulletin.js) брои същите редове,
     които филтърът показва; ред 'sent' (банерът го брои, Бюлетинът — не) не
     вкарва бланката във филтъра.

   МУТАЦИИ (пускани ръчно на 24.10.2026, всяка пада):
   M1 bulOpenPending пак слага sdView='rows';
   M2 без смяна на подтаба (sdDirTab остава 'supplier');
   M3 филтърът крие редовете без тип (sdBulWaitingReportIds пропуска type=null).

   Пускане: node tests/bul-pending-open.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const WED = isoOf(ANCHOR);
const STORE = 'Монтана';
const USER = { email: 'montana@temax.bg', display_name: 'Склад Монтана', role: 'manager', store_name: STORE, assigned_stores: [] };

const TASK = { id: 'r-sd', title: 'РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ', department: 'admin', task_type: 'info', active: true,
  sort_order: 1, due_weekday: 2, due_weekdays: [2], due_time: '20:00', due_window: false,
  target_stores: null, report_groups: null, linked_module: 'stock-diff' };

function rep(id, dir, over) {
  return Object.assign({ id: id, direction: dir, store_name: STORE, counterpart: dir === 'interstore' ? 'Логистичен склад Търговище' : 'ТЕСИ ООД',
    document_number: '1804' + id.length, doc_date: '2026-09-19', submitted_by: 'Склад Монтана', general_comment: '',
    photos: [], reviewed: false, created_at: '2026-09-19T09:00:00.000Z' }, over || {});
}
function line(id, repId, over) {
  return Object.assign({ id: id, store_name: STORE, supplier: null, report_id: repId,
    material_code: '1' + id.length, material_name: 'АРТИКУЛ ' + id, quantity: 2, quantity_received: 1, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null, resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'shortage', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null, store_corrected_at: null,
    warehouse_response: null, warehouse_comment: null, store_response: null, store_response_by: null,
    store_response_at: null, store_response_comment: null, created_at: '2026-09-19T09:00:00.000Z' }, over || {});
}
/* Като Монтана: бланка afde35a0… — три реда, type=null, warehouse_response='return'. */
const REPORTS = [
  rep('rep-wait', 'interstore'),
  rep('rep-other', 'interstore', { created_at: '2026-09-20T09:00:00.000Z' }),   /* без чакащ ред */
  rep('rep-sent', 'interstore', { created_at: '2026-09-21T09:00:00.000Z' }),    /* само 'sent' — банерът го брои, Бюлетинът не */
  rep('rep-sup', 'supplier')
];
const LINES = [
  line('w1', 'rep-wait', { warehouse_response: 'return' }),
  line('w2', 'rep-wait', { warehouse_response: 'return' }),
  line('w3', 'rep-wait', { warehouse_response: 'return' }),
  line('o1', 'rep-other', { warehouse_response: null }),
  line('s1', 'rep-sent', { warehouse_response: 'sent' }),
  line('p1', 'rep-sup')
];

function env(lines) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'bulletin.js', 'today.js', 'report.js'],
    user: USER, confirm: true,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }, { name: 'Логистичен склад Търговище' }],
      recurring_tasks: [TASK], recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published', created_at: WED,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: [],
      stock_differences: lines, differences_reports: REPORTS, stock_diff_swaps: [],
      stock_returns: [], transport_orders: [], goods_transit: [], contacts: [{ name: 'ТЕСИ ООД' }],
      supply_templates: [], supply_entries: [], supply_no_need: [],
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 40); i++) await ticks(); }
/* Бюлетинът с наготово зададен брояч (броячът не е предмет на теста). */
async function bulletinView(lines, pending) {
  const h = env(lines);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle();
  h.w.bulAutoPending['stock-diff'] = pending;
  guard('renderBulletin() не хвърля', () => h.w.renderBulletin());
  await settle(4);
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-diff');
const has = (h, sel) => !!(mod(h) && mod(h).querySelector(sel));
const dirActive = (h, d) => { const b = mod(h) && mod(h).querySelector('button[data-dir="' + d + '"]'); return !!b && /background:#0f172a/.test(b.getAttribute('style') || ''); };

async function checkOpened(h, label) {
  await settle(60);
  ok(label + ': модулът Разлики е показан', !!mod(h) && mod(h).style.display === 'block', mod(h) && mod(h).style.display);
  ok(label + ': активен е подтабът „междускладови" (DOM)', dirActive(h, 'interstore'));
  ok(label + ': подтабът на доставчиците НЕ е активен', !dirActive(h, 'supplier'));
  ok(label + ': изгледът е „Бланки за преглед"', h.w.sdView === 'reports', h.w.sdView);
  ok(label + ': чакащата бланка е в DOM-а', has(h, '#diff-rep-rep-wait'));
  const html = mod(h) ? mod(h).innerHTML : '';
  ok(label + ': и трите чакащи реда се виждат', ['w1', 'w2', 'w3'].every(id => html.indexOf('АРТИКУЛ ' + id) >= 0));
  ok(label + ': бланката без чакащ ред е скрита', !has(h, '#diff-rep-rep-other'));
  ok(label + ': бланката само със „sent" е скрита (Бюлетинът не я брои)', !has(h, '#diff-rep-rep-sent'));
  ok(label + ': чипът „Покажи всички бланки" е там', has(h, '#sd-only-waiting-off'));
}

(async function () {

  section('1. „Отвори →" в главния списък → междускладови, бланки, чакащият ред видим');
  {
    const h = await bulletinView(LINES, 3);
    if (h) {
      const b = h.doc.querySelector('#dept-panel-admin [data-rec-row="r-sd"] button.bul-auto-open');
      if (ok('„Отвори →" го има', !!b)) {
        realClick(h.w, b);
        await checkOpened(h, 'главен списък');
        const n = h.doc.getElementById('sd-only-waiting');
        ok('чипът казва колко бланки (1)', !!n && n.textContent.indexOf('(1)') >= 0, n && n.textContent.trim());
        realClick(h.w, h.doc.getElementById('sd-only-waiting-off'));
        await settle(6);
        ok('„Покажи всички" → бланката без чакащ ред се връща', has(h, '#diff-rep-rep-other'));
        ok('… и тази само със „sent"', has(h, '#diff-rep-rep-sent'));
        ok('… а чакащата си остава', has(h, '#diff-rep-rep-wait'));
        ok('чипът не изчезва — става „Само чакащите мен"', has(h, '#sd-only-waiting-on'));
        realClick(h.w, h.doc.getElementById('sd-only-waiting-on'));
        await settle(6);
        ok('… и пак филтрира', has(h, '#diff-rep-rep-wait') && !has(h, '#diff-rep-rep-other'));
        realClick(h.w, mod(h).querySelector('button[data-dir="supplier"]'));
        await settle(6);
        ok('смяна на подтаба маха филтъра (доставчиковата бланка се вижда)', has(h, '#diff-rep-rep-sup'));
      }
    }
  }

  section('2. Бутонът към модула в „План за деня" — същият път');
  {
    const h = await bulletinView(LINES, 3);
    if (h) {
      const pb = h.doc.querySelector('#sec-dayplan [data-plan-row="r-sd"] button[data-mod]');
      if (ok('бутонът „⚖️ Разлики →" в плана го има', !!pb)) {
        realClick(h.w, pb);
        await checkOpened(h, '„План за деня"');
      }
    }
  }

  section('3. Стар брояч, но реално чакащи редове няма → чипът стои с (0)');
  {
    const none = LINES.map(l => l.report_id === 'rep-wait' ? Object.assign({}, l, { store_response: 'sap_done' }) : l);
    const h = await bulletinView(none, 3);
    if (h) {
      const b = h.doc.querySelector('#dept-panel-admin [data-rec-row="r-sd"] button.bul-auto-open');
      if (ok('„Отвори →" го има (броячът казва 3)', !!b)) {
        realClick(h.w, b);
        await settle(60);
        ok('подтабът е междускладови', dirActive(h, 'interstore'));
        const n = h.doc.getElementById('sd-only-waiting');
        ok('чипът стои и казва (0)', !!n && n.textContent.indexOf('(0)') >= 0, n && n.textContent.trim());
        ok('бланки не се показват', !has(h, '#diff-rep-rep-wait') && !has(h, '#diff-rep-rep-other'));
        realClick(h.w, h.doc.getElementById('sd-only-waiting-off'));
        await settle(6);
        ok('„Покажи всички" → бланките се връщат', has(h, '#diff-rep-rep-wait') && has(h, '#diff-rep-rep-other'));
      }
    }
  }

  section('4. Брой 0 → няма „Отвори", бутонът към модула — както преди');
  {
    const h = await bulletinView(LINES, 0);
    if (h) {
      ok('няма „Отвори →"', !h.doc.querySelector('button.bul-auto-open'));
      const pb = h.doc.querySelector('#sec-dayplan [data-plan-row="r-sd"] button[data-mod]');
      ok('бутонът в плана вика showModule', !!pb && pb.getAttribute('onclick') === 'showModule(this.dataset.mod)', pb && pb.getAttribute('onclick'));
    }
  }

  section('5. Едно правило: bulDiffStoreWaiting брои точно редовете, които филтърът показва');
  {
    const h = env(LINES);
    const lines = LINES.map(l => Object.assign({}, l, { differences_reports: REPORTS.find(r => r.id === l.report_id) }));
    const got = h.w.bulDiffStoreWaiting(lines, [], STORE).map(l => l.id).sort();
    ok('bulDiffStoreWaiting → w1, w2, w3', JSON.stringify(got) === JSON.stringify(['w1', 'w2', 'w3']), JSON.stringify(got));
    h.w.sdData = LINES.map(l => Object.assign({}, l));
    h.w.diffReports = REPORTS.map(r => Object.assign({}, r));
    h.w.sdSwaps = [];
    const ids = Object.keys(h.w.sdBulWaitingReportIds()).sort();
    ok('sdBulWaitingReportIds → само rep-wait', JSON.stringify(ids) === JSON.stringify(['rep-wait']), JSON.stringify(ids));
    /* Размяна, при която ходът е мой — бланката влиза и без 'return'. */
    h.w.sdSwaps = [{ id: 'sw1', from_line_id: 'o1', to_line_id: 'x', from_store: STORE, to_store: 'Друг', status: 'linked' }];
    const ids2 = Object.keys(h.w.sdBulWaitingReportIds()).sort();
    ok('размяна „linked" от мен → и rep-other', JSON.stringify(ids2) === JSON.stringify(['rep-other', 'rep-wait']), JSON.stringify(ids2));
  }

  report();
})();
