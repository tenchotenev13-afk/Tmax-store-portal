/* „За връщане": приключен ред (completed) няма бутон „✅ Взета" — иначе
   кликът връща приключения ред назад. Броячите и филтрите не се пипат.

   Пускане:  node tests/stock-returns-completed-no-taken-btn.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'diff', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: 'Стока', sap_code: '1', quantity: 1, order_number: null,
    purchase_order: '4200016266', id_euro: 'E-1', plant: '1210', doc_date: null,
    withdrawal_date: null, confirmed_date: null, expiry_date: null, status: 'pending',
    reason: null, courier_info: '', control_comment: '', controller_comment: '',
    diff_line_id: null, photos: [], created_by: 'x'
  }, o);
}
const user = role => ({ email: role + '@temax.bg', display_name: role, role: role,
  store_name: 'Централен офис', assigned_stores: [] });

function env(rows, role, tab) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user(role), confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [], users: [] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab;
  h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.w.srPendingPhotos = [];
  h.w.renderStockReturns();
  return h;
}
const hasBtn = (h, id, onclickPart, text) => Array.from(h.doc.querySelectorAll('button[data-id="' + id + '"]'))
  .some(b => (b.getAttribute('onclick') || '').indexOf(onclickPart) >= 0 && (!text || b.textContent.indexOf(text) >= 0));

(async function run() {
  ['diff', 'complaint'].forEach(tab => {
    section('а) ' + tab + ': pending → „Взета"; taken и completed → няма (manager)');
    const h = env([row({ id: 'p', status: 'pending', source: tab }), row({ id: 't', status: 'taken', source: tab }),
      row({ id: 'c', status: 'completed', source: tab })], 'manager', tab);
    ok(tab + ': pending има бутон', hasBtn(h, 'p', 'srMarkTaken', 'Взета'));
    ok(tab + ': taken няма бутон', !hasBtn(h, 't', 'srMarkTaken'));
    ok(tab + ': completed няма бутон', !hasBtn(h, 'c', 'srMarkTaken'));
  });

  section('б) pending със сменено решение → чипът е там, бутонът няма');
  {
    const h = env([row({ id: 'p', status: 'pending', diff_line_id: 'L1' })], 'manager', 'diff');
    h.w.srDiffTypes = { L1: 'write_off' };
    h.w.renderStockReturns();
    ok('чипът е там', !!h.doc.querySelector('[data-decision-changed]'));
    ok('няма бутон „Взета"', !hasBtn(h, 'p', 'srMarkTaken'));
  }

  section('в) admin, completed → ✏️ и ✕ ги има; „Взета" няма');
  {
    const h = env([row({ id: 'c', status: 'completed' })], 'admin', 'diff');
    ok('✏️', hasBtn(h, 'c', 'openSRModal', '✏️'));
    ok('✕', hasBtn(h, 'c', 'srDelete', '✕'));
    ok('няма „Взета"', !hasBtn(h, 'c', 'srMarkTaken'));
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
