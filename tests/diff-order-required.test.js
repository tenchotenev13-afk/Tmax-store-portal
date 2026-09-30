/* Разлики: „Поръчка №" (41…) при подаване на бланка. (Точка 4 от Цвети.)

   Формата имаше само „Документ №" (вх. доставка 180… / документ 46…);
   поръчката от доставчика не се искаше и не се пазеше. От 755b733 тя живее в
   stock_differences.order_number (42… — в return_order_number).

   ПРАВИЛО:
     · полето е при посока „Доставчик" и (от 30.09.2026) при „Сторна по
       грешен прием" — в контейнера diff-no-doc-wrap; при междускладов го
       няма в DOM-а. Сторната се покрива в tests/diff-order-wrong-receipt.test.js;
     · задължително, освен при „без документ" (само при доставчик);
     · точно 10 цифри, започва с 41; интервалите отпред/отзад се махат;
       друго → червен toast и фокус, ПРЕДИ POST-а;
     · номерът отива в order_number на ВСЕКИ ред от бланката;
     · картата на бланката показва „· Поръчка 41…", ако е една за всички редове;
     · решение „Връщане" → stock_returns.order_number = същата поръчка.

   Пускане:  node tests/diff-order-required.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Склад Враца',
  role: 'sklad', store_name: 'Враца', assigned_stores: [] };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

/* „Базата": POST-натата бланка се връща при GET-а за id-то ѝ (submitDiffReport
   тегли последната по магазин), редовете — при GET-а за stock_differences. */
function env(user, seed) {
  seed = seed || {};
  let h;
  const posted = t => (h ? h.calls.post : []).filter(p => p.table === t)
    .map((p, i) => (Array.isArray(p.body) ? p.body : [p.body]).map((b, j) => Object.assign({ id: t + '-' + i + '-' + j }, b)))
    .reduce((a, b) => a.concat(b), []);
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      differences_reports: () => (seed.reports || []).concat(posted('differences_reports').map((r, i) =>
        Object.assign({ created_at: '2026-09-29T08:0' + i + ':00Z' }, r))).reverse(),
      stock_differences: () => (seed.lines || []).concat(posted('stock_differences')),
      stock_returns: url => (seed.returns || []).filter(r => url.indexOf('diff_line_id=eq.') < 0 || url.indexOf(r.diff_line_id) >= 0),
      transport_orders: [], users: [{ store_name: 'Враца' }], contacts: [], stores: [], stock_diff_swaps: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(seed.lines || []));
  h.w.diffReports = JSON.parse(JSON.stringify(seed.reports || []));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.w.invalidateSuppliersCache && h.w.invalidateSuppliersCache();
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД', 'КАМ-04']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };

/* Отваря формата с истински клик, избира посока, попълва два реда. */
async function openForm(h, direction) {
  realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '📝 Подай бланка'));
  await settle();
  const dir = h.doc.getElementById('diff-direction');
  if (dir.value !== direction) { dir.value = direction; fire(h.w, dir, 'change'); }
  await settle();
  const cp = h.doc.getElementById('diff-counterpart');
  if (cp.options.length > 1) cp.selectedIndex = 1;
  else cp.innerHTML = '<option>ТЕСИ ООД</option>';
  h.doc.getElementById('diff-docnum').value = '180486328';
  realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), '+ Добави артикул'));
  const rows = h.doc.querySelectorAll('#diff-items .diff-item-row');
  rows[0].querySelector('.di-name').value = 'ПЛАНКА ЪГЛОВА'; rows[0].querySelector('.di-qty').value = '3';
  rows[1].querySelector('.di-name').value = 'ЩУЦЕР'; rows[1].querySelector('.di-qty').value = '2';
}
async function submit(h) {
  realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
  await settle();
}
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const linePosts = h => h.calls.post.filter(p => p.table === 'stock_differences')
  .map(p => Array.isArray(p.body) ? p.body : [p.body]).reduce((a, b) => a.concat(b), []);
const ORDER_MSG = 'Поръчка №: впиши номер на поръчка 41…, не входяща доставка';
const lastToast = h => String(h.calls.toast[h.calls.toast.length - 1] || '');

(async function run() {

  section('0. diffOrderNumValid');
  {
    const h = env(STORE);
    const f = h.w.diffOrderNumValid;
    [['4100135756', true], [' 4100135756 ', true], ['4100000000', true],
     ['410013575', false], ['41001357567', false], ['4200017097', false], ['180486328', false],
     ['4600179694', false], ['41001357a6', false], ['', false], [null, false]]
      .forEach(([v, exp]) => ok(JSON.stringify(v) + ' → ' + exp, f(v) === exp));
    h.close();
  }

  section('а) Доставчик без поръчка → блокира с toast, фокус, няма POST');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    const ord = h.doc.getElementById('diff-order-num');
    ok('полето „Поръчка №" е във формата', !!ord);
    await submit(h);
    ok('toast: ' + ORDER_MSG, lastToast(h) === ORDER_MSG, h.calls.toast.join(' | '));
    ok('фокус върху полето', h.doc.activeElement === ord, h.doc.activeElement && h.doc.activeElement.id);
    ok('няма POST на бланка', repPosts(h).length === 0);
    h.close();
  }

  section('б) Доставчик, „180486328" (входяща доставка) → блокира');
  {
    for (const bad of ['180486328', '4200017097', '4600179694', '41001357']) {
      const h = env(STORE);
      await openForm(h, 'supplier');
      h.doc.getElementById('diff-order-num').value = bad;
      await submit(h);
      ok('„' + bad + '" → блокира', repPosts(h).length === 0 && lastToast(h) === ORDER_MSG, h.calls.toast.join(' | '));
      h.close();
    }
  }

  section('в) Доставчик, „ 4100135756 " → POST; ВСИЧКИ редове носят 4100135756');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    h.doc.getElementById('diff-order-num').value = ' 4100135756 ';
    await submit(h);
    ok('има POST на бланката', repPosts(h).length === 1, h.calls.toast.join(' | '));
    ok('„Документ №" си е 180486328', repPosts(h)[0] && repPosts(h)[0].body.document_number === '180486328');
    const L = linePosts(h);
    ok('два реда', L.length === 2, String(L.length));
    ok('и двата с order_number = „4100135756" (без интервали)', L.length === 2 && L.every(l => l.order_number === '4100135756'),
      JSON.stringify(L.map(l => l.order_number)));
    h.close();
  }

  section('г) Доставчик + „без документ" → минава без поръчка; попълнена лоша → пак блокира');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    h.doc.getElementById('diff-no-doc').checked = true;
    await submit(h);
    ok('POST без поръчка', repPosts(h).length === 1, h.calls.toast.join(' | '));
    ok('редовете са с order_number = null', linePosts(h).every(l => l.order_number === null),
      JSON.stringify(linePosts(h).map(l => l.order_number)));
    const h2 = env(STORE);
    await openForm(h2, 'supplier');
    h2.doc.getElementById('diff-no-doc').checked = true;
    h2.doc.getElementById('diff-order-num').value = '180486328';
    await submit(h2);
    ok('„без документ" + попълнена входяща доставка → блокира', repPosts(h2).length === 0 && lastToast(h2) === ORDER_MSG,
      h2.calls.toast.join(' | '));
    h.close(); h2.close();
  }

  section('д) Междускладов → полето го няма и минава без поръчка');
  {
    /* Сторната беше тук до 30.09.2026 — вече иска поръчка (виж
       tests/diff-order-wrong-receipt.test.js). */
    for (const d of ['interstore']) {
      const h = env(d === 'wrong_receipt' ? CVETI : STORE);
      if (d === 'wrong_receipt') h.w.diffReports = [];
      await openForm(h, d);
      ok('[' + d + '] няма поле „Поръчка №"', !h.doc.getElementById('diff-order-num'));
      if (d === 'wrong_receipt') { const st = h.doc.getElementById('diff-store'); st.innerHTML = '<option>Враца</option>'; st.value = 'Враца'; }
      if (d === 'interstore') {
        const cp = h.doc.getElementById('diff-counterpart');
        cp.innerHTML = '<option>Логистичен склад Търговище</option>'; cp.value = 'Логистичен склад Търговище';
      }
      await submit(h);
      ok('[' + d + '] POST без поръчка', repPosts(h).length === 1, h.calls.toast.join(' | '));
      ok('[' + d + '] редовете с order_number = null', linePosts(h).length > 0 && linePosts(h).every(l => l.order_number === null));
      h.close();
    }
  }

  section('е) Картата на бланката показва „· Поръчка 4100135756"');
  {
    const R = { id: 'rep-1', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД', document_number: '180486328',
      doc_date: '2026-09-28', submitted_by: 'Склад Враца', general_comment: '', photos: [], reviewed: false,
      email_pending: false, created_at: '2026-09-28T08:00:00Z' };
    const L = o => Object.assign({ id: 'l-1', report_id: 'rep-1', store_name: 'Враца', supplier: 'ТЕСИ ООД', material_name: 'А',
      quantity: 2, type: null, status: 'new', order_number: '4100135756', attachments: [] }, o);
    const h = env(CVETI, { reports: [R], lines: [L({ id: 'l-1' }), L({ id: 'l-2', material_name: 'Б' })] });
    const c = h.doc.getElementById('diff-rep-rep-1');
    ok('картата показва „· Док. 180486328 · Поръчка 4100135756"',
      !!c && c.textContent.indexOf('Док. 180486328 · Поръчка 4100135756') >= 0, c && c.textContent.slice(0, 200));
    /* Различни поръчки по редовете → нищо (не се гадае коя). */
    const h2 = env(CVETI, { reports: [R], lines: [L({ id: 'l-1' }), L({ id: 'l-2', order_number: '4100999999' })] });
    const c2 = h2.doc.getElementById('diff-rep-rep-1');
    ok('различни поръчки → без „Поръчка"', !!c2 && c2.textContent.indexOf('Поръчка 41') < 0);
    const h3 = env(CVETI, { reports: [R], lines: [L({ id: 'l-1', order_number: null })] });
    ok('без поръчка → без „Поръчка"', h3.doc.getElementById('diff-rep-rep-1').textContent.indexOf('Поръчка 41') < 0);
    h.close(); h2.close(); h3.close();
  }

  section('ж) Решение „Връщане" → stock_returns.order_number = 4100135756');
  {
    const R = { id: 'rep-1', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД', document_number: '180486328',
      doc_date: '2026-09-28', submitted_by: 'Склад Враца', general_comment: '', photos: [], reviewed: false,
      email_pending: false, created_at: '2026-09-28T08:00:00Z' };
    const line = { id: 'l-1', report_id: 'rep-1', store_name: 'Враца', supplier: 'ТЕСИ ООД', material_code: '111',
      material_name: 'ПЛАНКА', quantity: 3, quantity_supplier_doc: '2', quantity_received: '5', type: null, status: 'new',
      order_number: '4100135756', return_order_number: null, attachments: [], difference_category: 'excess', unit: 'бр.' };
    const h = env(CVETI, { reports: [R], lines: [line], returns: [] });
    const b = Array.prototype.find.call(h.doc.querySelectorAll('button[data-id="l-1"]'),
      x => /resolveDiffLine/.test(x.getAttribute('onclick') || '') && x.textContent.indexOf('Връщане') >= 0);
    if (ok('бутонът „Връщане" на реда е на екрана', !!b)) {
      realClick(h.w, b);
      await settle();
      const p = h.calls.post.find(x => x.table === 'stock_returns');
      if (ok('POST в stock_returns', !!p, h.calls.toast.join(' | '))) {
        ok('order_number = 4100135756', p.body.order_number === '4100135756', JSON.stringify(p.body.order_number));
        ok('ПВ-ЕВР = null (няма поръчка за връщане)', p.body.purchase_order === null, JSON.stringify(p.body.purchase_order));
      }
    }
    h.close();
  }

  report();
})();
