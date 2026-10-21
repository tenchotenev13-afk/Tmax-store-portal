/* Разлики — три малки корекции по искане на Цветелина (20-21.10.2026).

   а) Д7 — „Поръчка №" приема и 43… (внос: Билка, Левиор). 10 цифри, 41 или
      43; 42… (за връщане), 44…, 180… и грешна дължина — отказ. Подаване с
      43… стига до POST с реален клик, с 42… спира с червения toast.
   б) Д1 — „← Обратно" от печата на бланка връща при същата бланка: от
      картата в „Бланки за преглед" → scrollIntoView на diff-rep-<id>; от ред
      в „Решени редове" → window.scrollTo с позицията отпреди печата.
      Браузърът свива скрола, докато е отворен печатът — тестът го имитира
      (pageYOffset → 0), иначе позицията би „оцеляла" и без поправката.
   в) Д2 — „Бланки за преглед" по created_at ВЪЗХОДЯЩО (най-старите отгоре);
      коригираната от магазина НЕ изскача отгоре; прегледана, чакаща имейл,
      остава след непрегледаните.

   Мутационна проверка (21.10.2026, поотделно върху stock-differences.js;
   при всяка тестът пада с exit 1):
     1. регексът пак само /^41\d{8}$/                         → пада (а)
     2. 42… приет (/^4[123]\d{8}$/)                          → пада (а)
     3. sdKeepScroll(rep.id) махнат от loadDiffPrint          → пада (б)
     4. сорт по created_at НИЗХОДЯЩО                          → пада (в)
     5. върнато правилото „коригираните отгоре"               → пада (в)

   Пускане:  node tests/sd-melki-oct21.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Склад Враца',
  role: 'sklad', store_name: 'Враца', assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function rep(o) {
  return Object.assign({ direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
    document_number: '180486328', doc_date: '2026-10-15', submitted_by: 'Склад Враца',
    general_comment: '', photos: [], reviewed: false, email_pending: false, email_sent_at: null,
    created_at: '2026-10-15T08:00:00+00:00' }, o);
}
function line(o) {
  return Object.assign({ store_name: 'Враца', supplier: 'ТЕСИ ООД', material_name: 'АРТИКУЛ',
    material_code: '111', quantity: 2, quantity_received: 3, type: null, status: 'new',
    order_number: '4100135756', attachments: [], store_corrected_at: null,
    difference_category: 'excess', comment: null, resolution_comment: null }, o);
}

function env(user, seed, opts) {
  seed = seed || {}; opts = opts || {};
  let h;
  const posted = t => (h ? h.calls.post : []).filter(p => p.table === t)
    .map((p, i) => (Array.isArray(p.body) ? p.body : [p.body]).map((b, j) => Object.assign({ id: t + '-' + i + '-' + j }, b)))
    .reduce((a, b) => a.concat(b), []);
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      differences_reports: () => (seed.reports || []).concat(posted('differences_reports').map((r, i) =>
        Object.assign({ created_at: '2026-10-21T08:0' + i + ':00Z' }, r))),
      stock_differences: () => (seed.lines || []).concat(posted('stock_differences')),
      stock_returns: [], transport_orders: [], users: [{ store_name: 'Враца' }], contacts: [], stores: [],
      stock_diff_swaps: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(seed.lines || []));
  h.w.diffReports = JSON.parse(JSON.stringify(seed.reports || []));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.w.sdView = opts.view || 'reports';
  h.w.invalidateSuppliersCache && h.w.invalidateSuppliersCache();
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); await new Promise(r => setTimeout(r, 30)); };

async function openForm(h) {
  realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '📝 Подай бланка'));
  await settle();
  const dir = h.doc.getElementById('diff-direction');
  if (dir.value !== 'supplier') { dir.value = 'supplier'; fire(h.w, dir, 'change'); }
  await settle();
  const cp = h.doc.getElementById('diff-counterpart');
  if (cp.options.length > 1) cp.selectedIndex = 1;
  else cp.innerHTML = '<option>ТЕСИ ООД</option>';
  h.doc.getElementById('diff-docnum').value = '180486328';
  const rows = h.doc.querySelectorAll('#diff-items .diff-item-row');
  rows[0].querySelector('.di-name').value = 'ПЛАНКА ЪГЛОВА'; rows[0].querySelector('.di-qty').value = '3';
}
const ORDER_MSG = 'Поръчка №: впиши номер на поръчка 41… или 43…, не входяща доставка';
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const linePosts = h => h.calls.post.filter(p => p.table === 'stock_differences')
  .map(p => Array.isArray(p.body) ? p.body : [p.body]).reduce((a, b) => a.concat(b), []);
const lastToast = h => String(h.calls.toast[h.calls.toast.length - 1] || '');

(async function run() {

  section('а) Д7 — diffOrderNumValid и подаване с 43… / 42…');
  {
    const h = env(STORE);
    const f = h.w.diffOrderNumValid;
    [['4100135756', true], ['4300001221', true], [' 4300001221 ', true],
     ['4200017648', false], ['4400001203', false], ['180507457', false],
     ['410013575', false], ['41001357561', false], ['4600179694', false], ['', false]]
      .forEach(([v, exp]) => ok(JSON.stringify(v) + ' → ' + exp, f(v) === exp));
    h.close();

    const h1 = env(STORE);
    await openForm(h1);
    ok('надписът на полето: „(41… или 43…, не входяща доставка)"',
      h1.doc.getElementById('diff-submit-ov').textContent.indexOf('(41… или 43…, не входяща доставка)') >= 0);
    h1.doc.getElementById('diff-order-num').value = '4300001221';
    realClick(h1.w, btn(h1.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await settle();
    ok('43… → POST на бланката', repPosts(h1).length === 1, h1.calls.toast.join(' | '));
    ok('редът носи order_number 4300001221', linePosts(h1).length === 1 && linePosts(h1)[0].order_number === '4300001221',
      JSON.stringify(linePosts(h1).map(l => l.order_number)));
    h1.close();

    const h2 = env(STORE);
    await openForm(h2);
    h2.doc.getElementById('diff-order-num').value = '4200017648';
    realClick(h2.w, btn(h2.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await settle();
    ok('42… → без POST', repPosts(h2).length === 0);
    ok('42… → toast „' + ORDER_MSG + '"', lastToast(h2) === ORDER_MSG, h2.calls.toast.join(' | '));
    h2.close();
  }

  section('б) Д1 — „← Обратно" от печата връща при същата бланка');
  {
    /* от картата горе */
    const R1 = rep({ id: 101, created_at: '2026-10-10T08:00:00+00:00' });
    const R2 = rep({ id: 102, created_at: '2026-10-12T08:00:00+00:00' });
    const seed = { reports: [R2, R1], lines: [line({ id: 1, report_id: 101 }), line({ id: 2, report_id: 102 })] };
    const h = env(CVETI, seed);
    const card = h.doc.getElementById('diff-rep-102');
    const pb = card && Array.prototype.find.call(card.querySelectorAll('button'), b => /loadDiffPrint\(/.test(b.getAttribute('onclick') || ''));
    if (ok('🖨 в картата на бланка 102', !!pb)) {
      h.w.__y = 900;
      realClick(h.w, pb, '🖨 Печат');
      await settle();
      ok('печатът е отворен', h.doc.getElementById('mod-print').textContent.trim().length > 0);
      h.w.__y = 0; /* браузърът свива скрола на печатната страница */
      h.calls.scrollIntoView.length = 0; h.calls.scrollTo.length = 0;
      const back = btn(h.doc.getElementById('mod-print'), '← Обратно');
      ok('бутон „← Обратно"', !!back);
      realClick(h.w, back, '← Обратно');
      await settle();
      ok('scrollIntoView на diff-rep-102', h.calls.scrollIntoView.some(s => s.id === 'diff-rep-102'),
        JSON.stringify(h.calls.scrollIntoView));
    }
    h.close();

    /* от ред в „Решени редове" */
    const R3 = rep({ id: 103, reviewed: true });
    const hr = env(CVETI, { reports: [R3], lines: [line({ id: 3, report_id: 103, type: 'writein', status: 'pending' })] }, { view: 'rows' });
    const tb = hr.doc.getElementById('sd-rows');
    const rb = tb && Array.prototype.find.call(tb.querySelectorAll('button'), b => /loadDiffPrint\(/.test(b.getAttribute('onclick') || ''));
    if (ok('🖨 в реда от „Решени редове"', !!rb)) {
      hr.w.__y = 640;
      realClick(hr.w, rb, '🖨');
      await settle();
      hr.w.__y = 0;
      hr.calls.scrollIntoView.length = 0; hr.calls.scrollTo.length = 0;
      realClick(hr.w, btn(hr.doc.getElementById('mod-print'), '← Обратно'), '← Обратно');
      await settle();
      ok('изгледът е пак „Решени редове"', !!hr.doc.getElementById('sd-rows'));
      ok('window.scrollTo(0, 640)', hr.calls.scrollTo.some(p => p[0] === 0 && p[1] === 640), JSON.stringify(hr.calls.scrollTo));
    }
    hr.close();
  }

  section('в) Д2 — „Бланки за преглед": най-старите отгоре, коригираната не изскача');
  {
    const reps = [
      rep({ id: 201, created_at: '2026-10-14T08:00:00+00:00' }),
      rep({ id: 202, created_at: '2026-10-01T08:00:00+00:00' }),
      rep({ id: 203, created_at: '2026-10-20T08:00:00+00:00' }), /* най-новата, коригирана */
      rep({ id: 204, created_at: '2026-10-07T08:00:00+00:00' }),
      rep({ id: 205, created_at: '2026-09-30T08:00:00+00:00', reviewed: true, email_pending: true }), /* най-стара, но прегледана */
      rep({ id: 206, created_at: '2026-10-07T08:00:00+00:00' })  /* същото време като 204 → по id */
    ];
    const lines = reps.map(r => line({ id: 300 + (r.id - 200), report_id: r.id,
      store_corrected_at: r.id === 203 ? '2026-10-21T07:00:00+00:00' : null,
      type: r.reviewed ? 'writein' : null, status: r.reviewed ? 'pending' : 'new' }));
    const h = env(CVETI, { reports: reps.slice().reverse(), lines: lines });
    const order = Array.prototype.map.call(h.doc.querySelectorAll('[id^="diff-rep-"]'), e => e.id.replace('diff-rep-', ''));
    ok('ред: 202, 204, 206, 201, 203, после прегледаната 205',
      order.join(',') === '202,204,206,201,203,205', order.join(','));
    ok('коригираната (203) не е отгоре', order[0] !== '203');
    const c203 = h.doc.getElementById('diff-rep-203');
    ok('коригираната си пази „✏️ КОРИГИРАНА"', !!c203 && c203.textContent.indexOf('КОРИГИРАНА') >= 0);
    h.close();
  }

  report();
})();
