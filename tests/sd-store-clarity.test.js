/* Разлики: обектът да се ориентира без обяснения (24.10.2026, след проверката
   на живо с Монтана).

   ПОВОД. Банерът казваше „7 реда чакат вашия отговор", Бюлетинът — 3: банерът
   броеше и 'sent_sap' (стоката е на път), а базата (stock_diff_store_done) от
   14.10 не ги брои. Подтабът пишеше „(0)🆕 12" — нулата се четеше като „нищо
   няма". Чакащите редове в картата изглеждаха като останалите.

   ТВЪРДЕНИЯТА (обект, fixture като Монтана — бланка с 3 реда 'return',
   бланка с 4 реда 'sent_sap', бланка, която чака склада, плюс чужда бланка):
   · банерът а) казва 3 (по bulDiffStoreWaiting), не 7, и назовава точно
     бутоните на реда 'return';
   · ред б) „🚚 4 реда са на път" е ОТДЕЛЕН елемент и назовава бутона за
     приемане на 'sent_sap';
   · ИСТИНСКИ клик на „Покажи ги →" → подтабът „междускладови", изгледът
     „Бланки за преглед" с филтъра, трите реда в DOM-а;
   · числото на подтаба: „3 бланки · 📝 1 чака вас", без „(0)" и „🆕";
   · маркировки само по точните <tr>: жълто + „📝 чака вас" на трите 'return',
     „🚚 на път" без фон на четирите 'sent_sap', нищо на реда, чакащ склада;
   · 0 чакащи → няма ред а), няма бутон, няма „чака вас" в подтаба;
   · и 'sent', и 'sent_sap' → ред б) назовава двата бутона;
   · чужда бланка (инжектирана) не влиза никъде;
   · офис акаунт не вижда нищо ново — подтабът е постарому.

   МУТАЦИИ (пускани ръчно на 24.10.2026, всяка пада):
   M1 банерът брои по sdLineWaitsStore (sdMyWaitingLines) → 7;
   M2 bulOpenPending без смяна на подтаба;
   M3 ред 'sent_sap' маркиран като „чака вас".

   Пускане: node tests/sd-store-clarity.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const ANCHOR = new Date('2026-10-21T12:00:00');
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const STORE = 'Монтана';
const FOREIGN = 'Враца';
const WH = 'Логистичен склад Търговище';
const USER = { email: 'montana@temax.bg', display_name: 'Склад Монтана', role: 'manager', store_name: STORE, assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function rep(id, over) {
  return Object.assign({ id: id, direction: 'interstore', store_name: STORE, counterpart: WH,
    document_number: 'Д-' + id, doc_date: '2026-10-19', submitted_by: 'Склад Монтана', general_comment: '',
    photos: [], reviewed: false, created_at: '2026-10-19T09:00:00.000Z' }, over || {});
}
function line(id, repId, over) {
  return Object.assign({ id: id, store_name: STORE, supplier: WH, report_id: repId,
    material_code: '1' + id, material_name: 'АРТИКУЛ ' + id, quantity: 2, quantity_received: 1, quantity_supplier_doc: null,
    order_number: null, confirmed_date: null, comment: null, resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null, store_corrected_at: null,
    warehouse_response: null, warehouse_comment: null, store_response: null, store_response_by: null,
    store_response_at: null, store_response_comment: null, created_at: '2026-10-19T09:00:00.000Z' }, over || {});
}
const REPORTS = [
  rep('rep-ret'),
  rep('rep-sap', { created_at: '2026-10-19T10:00:00.000Z' }),
  rep('rep-wh', { created_at: '2026-10-19T11:00:00.000Z' })
];
const LINES = [
  line('r1', 'rep-ret', { warehouse_response: 'return' }),
  line('r2', 'rep-ret', { warehouse_response: 'return' }),
  line('r3', 'rep-ret', { warehouse_response: 'return' }),
  line('s1', 'rep-sap', { warehouse_response: 'sent_sap' }),
  line('s2', 'rep-sap', { warehouse_response: 'sent_sap' }),
  line('s3', 'rep-sap', { warehouse_response: 'sent_sap' }),
  line('s4', 'rep-sap', { warehouse_response: 'sent_sap' }),
  line('h1', 'rep-wh', { warehouse_response: null })
];
const FOREIGN_REP = rep('rep-foreign', { store_name: FOREIGN });
const FOREIGN_LINE = line('f1', 'rep-foreign', { store_name: FOREIGN, warehouse_response: 'return' });

function env(user, reports, lines) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'bulletin.js', 'today.js', 'report.js'],
    user: user, confirm: true,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }, { name: WH }],
      recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: [], bulletin_tasks: [], task_completions: [],
      stock_differences: () => lines.map(l => Object.assign({}, l)),
      differences_reports: () => reports.map(r => Object.assign({}, r)),
      stock_diff_swaps: [],
      stock_returns: [], transport_orders: [], goods_transit: [], contacts: [{ name: 'ТЕСИ ООД' }],
      supply_templates: [], supply_entries: [], supply_no_need: [],
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w);
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 40); i++) await ticks(); }
async function openModule(user, reports, lines) {
  const h = env(user, reports || REPORTS, lines || LINES);
  /* Влизане в модула постарому: подтабът на доставчиците, бланките. */
  h.w.sdDirTab = 'supplier'; h.w.sdView = 'reports';
  if (!guard('showModule(stock-diff) не хвърля', () => h.w.showModule('stock-diff'))) return null;
  await settle(60);
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-diff');
const q = (h, sel) => mod(h) && mod(h).querySelector(sel);
const qa = (h, sel) => mod(h) ? Array.from(mod(h).querySelectorAll(sel)) : [];
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const dirBtn = (h, d) => q(h, 'button[data-dir="' + d + '"]');
const dirActive = (h, d) => { const b = dirBtn(h, d); return !!b && /background:#0f172a/.test(b.getAttribute('style') || ''); };
const rowOf = (h, id) => qa(h, 'tr').find(tr => txt(tr).indexOf('АРТИКУЛ ' + id) >= 0) || null;
const ids = trs => trs.map(tr => (txt(tr).match(/АРТИКУЛ (\w+)/) || [])[1]).sort().join(',');

(async function () {

  section('1. Банерът: а) 3 по правилото на Бюлетина, б) 4 на път — отделно');
  {
    const h = await openModule(USER);
    if (h) {
      const a = h.doc.getElementById('sd-waiting-note');
      const b = h.doc.getElementById('sd-onway-note');
      if (ok('ред а) го има', !!a)) {
        ok('а) казва 3', /📝 3 реда чакат вашия отговор/.test(txt(a)), txt(a));
        ok('а) НЕ казва 7', txt(a).indexOf('7') < 0, txt(a));
        ok('а) назовава точно бутоните на ред „return"',
          txt(a).indexOf('„📄 ПУСНАТО В SAP“ или „⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА“') >= 0, txt(a));
        ok('а) казва, че задачата се отмята сама', txt(a).indexOf('Задачата в Бюлетина се отмята сама, когато няма такива редове.') >= 0);
        ok('а) има бутон „Покажи ги →"', !!a.querySelector('#sd-waiting-show') && txt(a.querySelector('#sd-waiting-show')) === 'Покажи ги →');
      }
      if (ok('ред б) го има', !!b)) {
        ok('б) казва 4 на път', /🚚 4 реда са на път към вас/.test(txt(b)), txt(b));
        ok('б) назовава бутона за „sent_sap"', txt(b).indexOf('отговорете с „📄 ПРИЕТО В SAP“.') >= 0, txt(b));
        ok('б) не назовава бутона за „sent"', txt(b).indexOf('✅ ПРИЕТО') < 0);
        ok('б) е отделен елемент (не е вътре в а)', !!a && !a.contains(b) && !b.contains(a));
        ok('б) е по-кротък — не кехлибарен', !/#f59e0b|#fef3c7/.test(b.getAttribute('style') || ''), b.getAttribute('style'));
      }
      const all = txt(mod(h));
      ok('старото „Броят е за двата подтаба" го няма', all.indexOf('Броят е за двата подтаба') < 0);
      ok('старото „Ред, по който складът още не е отговорил" го няма', all.indexOf('Ред, по който складът още не е отговорил') < 0);
      ok('етикетите в банера съвпадат с истинските бутони',
        h.w.SD_STORE_BTN.sap_done === '📄 ПУСНАТО В SAP' && h.w.SD_STORE_BTN.no_stock === '⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА' &&
        h.w.SD_STORE_BTN.sent_sap === '📄 ПРИЕТО В SAP' && h.w.SD_STORE_BTN.sent === '✅ ПРИЕТО');

      section('2. Числото на подтабовете (обект)');
      const it = txt(dirBtn(h, 'interstore')), sp = txt(dirBtn(h, 'supplier'));
      ok('междускладови: „· 3 бланки"', it.indexOf('· 3 бланки') >= 0, it);
      ok('междускладови: „📝 1 чака вас"', it.indexOf('📝 1 чака вас') >= 0, it);
      ok('без „(0)" и без „🆕"', !/\(\d+\)/.test(it) && it.indexOf('🆕') < 0, it);
      ok('доставчици: „· 0 бланки", без „чака вас"', sp.indexOf('· 0 бланки') >= 0 && sp.indexOf('чака вас') < 0, sp);

      section('3. Истински клик на „Покажи ги →"');
      ok('преди клика: подтабът е доставчици', dirActive(h, 'supplier'));
      realClick(h.w, h.doc.getElementById('sd-waiting-show'));
      await settle(60);
      ok('активен е подтабът „междускладови" (DOM)', dirActive(h, 'interstore'));
      ok('изгледът е „Бланки за преглед"', h.w.sdView === 'reports', h.w.sdView);
      ok('филтърът „само чакащите" е включен', h.w.sdOnlyWaiting === true && !!h.doc.getElementById('sd-only-waiting-off'));
      ok('чакащата бланка е в DOM-а', !!q(h, '#diff-rep-rep-ret'));
      ok('и трите реда са в DOM-а', ['r1', 'r2', 'r3'].every(id => !!rowOf(h, id)));
      ok('бланката „на път" е скрита от филтъра', !q(h, '#diff-rep-rep-sap'));

      section('4. Маркировки по точните редове');
      realClick(h.w, h.doc.getElementById('sd-only-waiting-off'));
      await settle(6);
      const waitRows = qa(h, 'tr.sd-row-wait'), onRows = qa(h, 'tr.sd-row-onway');
      ok('„чака вас" — точно r1, r2, r3', ids(waitRows) === 'r1,r2,r3', ids(waitRows));
      ok('„на път" — точно s1..s4', ids(onRows) === 's1,s2,s3,s4', ids(onRows));
      ok('жълтият фон е на <tr> на чакащите', waitRows.length === 3 && waitRows.every(tr => /background:#fef3c7/.test(tr.getAttribute('style'))));
      ok('надписът „📝 чака вас" е в самия ред', waitRows.every(tr => !!tr.querySelector('.sd-mark-wait') && txt(tr.querySelector('.sd-mark-wait')) === '📝 чака вас'));
      ok('… до бутоните на обекта', waitRows.every(tr => {
        const m = tr.querySelector('.sd-mark-wait'); return !!m && txt(m.parentNode).indexOf('📄 ПУСНАТО В SAP') >= 0;
      }));
      ok('редовете „на път" са без жълт фон', onRows.every(tr => !/#fef3c7/.test(tr.getAttribute('style'))));
      ok('надписът „🚚 на път — отговорете, когато пристигне"',
        onRows.every(tr => txt(tr.querySelector('.sd-mark-onway')) === '🚚 на път — отговорете, когато пристигне'));
      const h1 = rowOf(h, 'h1');
      ok('редът, чакащ склада, е без маркировка', !!h1 && !h1.className && !/#fef3c7/.test(h1.getAttribute('style')) &&
        !h1.querySelector('.sd-mark-wait,.sd-mark-onway'));
      const card = q(h, '#diff-rep-rep-ret');
      ok('картата като цяло не е оцветена', !!card && !/#fef3c7/.test(card.getAttribute('style') || ''));
      ok('маркировките са само в <tr>', qa(h, '.sd-mark-wait,.sd-mark-onway').every(m => !!m.closest('tr')));
      h.close();
    }
  }

  section('5. 0 чакащи → няма ред а), няма бутон, няма „чака вас"');
  {
    const none = LINES.map(l => l.report_id === 'rep-ret' ? Object.assign({}, l, { store_response: 'sap_done' }) : l);
    const h = await openModule(USER, REPORTS, none);
    if (h) {
      ok('няма ред а)', !h.doc.getElementById('sd-waiting-note'));
      ok('няма бутон „Покажи ги →"', !h.doc.getElementById('sd-waiting-show'));
      ok('ред б) си остава', !!h.doc.getElementById('sd-onway-note'));
      ok('подтабът е без „чака вас"', txt(dirBtn(h, 'interstore')).indexOf('чака вас') < 0, txt(dirBtn(h, 'interstore')));
      ok('и пак казва бланките', txt(dirBtn(h, 'interstore')).indexOf('· 3 бланки') >= 0);
      h.close();
    }
    const h2 = await openModule(USER, [REPORTS[2]], [LINES[7]]);
    if (h2) {
      ok('нищо чакащо, нищо на път → нито а), нито б)',
        !h2.doc.getElementById('sd-waiting-note') && !h2.doc.getElementById('sd-onway-note'));
      ok('подтабът: „· 1 бланка"', txt(dirBtn(h2, 'interstore')).indexOf('· 1 бланка') >= 0, txt(dirBtn(h2, 'interstore')));
      h2.close();
    }
  }

  section('6. И „sent", и „sent_sap" → б) назовава двата бутона');
  {
    const mix = LINES.map(l => l.id === 's1' ? Object.assign({}, l, { warehouse_response: 'sent' }) : l);
    const h = await openModule(USER, REPORTS, mix);
    if (h) {
      const b = h.doc.getElementById('sd-onway-note');
      ok('б) казва 4', !!b && /🚚 4 реда/.test(txt(b)), txt(b));
      ok('б) назовава двата', !!b && txt(b).indexOf('„✅ ПРИЕТО“ или „📄 ПРИЕТО В SAP“') >= 0, txt(b));
      ok('а) остава 3 ('+"'sent'"+' не влиза)', /📝 3 реда/.test(txt(h.doc.getElementById('sd-waiting-note'))));
      h.close();
    }
  }

  section('7. Чужда бланка не влиза никъде');
  {
    const h = await openModule(USER);
    if (h) {
      h.w.diffReports.push(Object.assign({}, FOREIGN_REP));
      h.w.sdData.push(Object.assign({}, FOREIGN_LINE));
      h.w.sdDirTab = 'interstore';
      guard('рендер с чуждата бланка', () => h.w.renderStockDiff());
      ok('а) пак казва 3', /📝 3 реда/.test(txt(h.doc.getElementById('sd-waiting-note'))), txt(h.doc.getElementById('sd-waiting-note')));
      ok('чуждият ред не е маркиран', !qa(h, 'tr.sd-row-wait,tr.sd-row-onway').some(tr => txt(tr).indexOf('АРТИКУЛ f1') >= 0));
      ok('„чака вас" в подтаба пак е 1', txt(dirBtn(h, 'interstore')).indexOf('📝 1 чака вас') >= 0, txt(dirBtn(h, 'interstore')));
      h.close();
    }
  }

  section('8. Офис акаунт не вижда нищо ново');
  {
    const h = await openModule(ADMIN);
    if (h) {
      h.w.sdDirTab = 'interstore';
      guard('рендер за офиса', () => h.w.renderStockDiff());
      ok('няма ред а)', !h.doc.getElementById('sd-waiting-note'));
      ok('няма ред б)', !h.doc.getElementById('sd-onway-note'));
      ok('няма маркировки', !qa(h, 'tr.sd-row-wait,tr.sd-row-onway,.sd-mark-wait,.sd-mark-onway').length);
      const it = txt(dirBtn(h, 'interstore'));
      ok('подтабът е постарому: (N) и 🆕', /\(\d+\)/.test(it) && it.indexOf('🆕 3') >= 0 && it.indexOf('бланки') < 0, it);
      ok('… без „чака вас"', it.indexOf('чака вас') < 0);
      h.close();
    }
  }

  report();
})();
