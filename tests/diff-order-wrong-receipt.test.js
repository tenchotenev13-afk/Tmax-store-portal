/* Разлики: „Поръчка №" (41…) и при „Сторна по грешен прием" (Цвети, 30.09.2026).

   Сторната тръгва от фактура на доставчик, значи и там има поръчка 41….
     · полето е под „Документ №" и при wrong_receipt — БЕЗ отметката „без
       документ" (тя е само при доставчик);
     · задължително и по двата пътя: бутона „🧾 Грешен прием" на магазина и
       „📝 Подай бланка" от ЦО; валидацията е diffOrderNumValid() и спира
       ПРЕДИ POST-а (червен toast);
     · номерът отива в order_number на ВСЕКИ ред;
     · смяна на посоката напред-назад пази написания номер и не оставя полето
       при междускладов;
     · „Доставчик" — както преди, включително „без документ".

   Пускане:  node tests/diff-order-wrong-receipt.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const STORE = { email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'sklad', store_name: 'Раднево', assigned_stores: [] };
const ACCOUNTANT = { email: 'a.simeonova@temax.bg', display_name: 'А. Симеонова',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Раднево', 'Гоце Делчев'] };

function env(user) {
  let h;
  const reps = () => (h ? h.calls.post : []).filter(p => p.table === 'differences_reports')
    .map((p, i) => Object.assign({ id: 'rep-' + (i + 1), created_at: '2026-09-30T10:0' + i + ':00Z' }, p.body)).reverse();
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      differences_reports: () => reps(),
      stock_differences: [], stock_returns: [], transport_orders: [], stock_diff_swaps: [],
      users: [{ store_name: 'Раднево' }, { store_name: 'Гоце Делчев' }],
      stores: [{ name: 'Раднево' }, { name: 'Гоце Делчев' }], contacts: []
    }
  });
  h.w.sdData = []; h.w.diffReports = []; h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД', 'КАМ-04']);
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const modBtn = (h, label) => btn(h.doc.getElementById('mod-stock-diff'), label);
const ov = h => h.doc.getElementById('diff-submit-ov');
const orderEl = h => h.doc.getElementById('diff-order-num');
const noDocEl = h => h.doc.getElementById('diff-no-doc');
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const linePosts = h => h.calls.post.filter(p => p.table === 'stock_differences')
  .map(p => Array.isArray(p.body) ? p.body : [p.body]).reduce((a, b) => a.concat(b), []);
const ORDER_MSG = 'Поръчка №: впиши номер на поръчка 41…, не входяща доставка';
const lastToast = h => String(h.calls.toast[h.calls.toast.length - 1] || '');

async function setDir(h, d) {
  const dir = h.doc.getElementById('diff-direction');
  dir.value = d; fire(h.w, dir, 'change');
  await settle();
}
/* Два реда, доставчик, документ. Магазинът и посоката — отвън. */
async function fill(h) {
  const cp = h.doc.getElementById('diff-counterpart');
  if (!Array.prototype.some.call(cp.options, o => o.value === 'ТЕСИ ООД')) cp.innerHTML = '<option>ТЕСИ ООД</option>';
  cp.value = 'ТЕСИ ООД';
  h.doc.getElementById('diff-docnum').value = 'ФК-4600179694';
  realClick(h.w, btn(ov(h), '+ Добави артикул'));
  const rows = h.doc.querySelectorAll('#diff-items .diff-item-row');
  rows[0].querySelector('.di-name').value = 'ЛАЙСНА АЛ. 10ММ'; rows[0].querySelector('.di-qty').value = '3';
  rows[1].querySelector('.di-name').value = 'ЩУЦЕР'; rows[1].querySelector('.di-qty').value = '2';
}
async function submit(h) { realClick(h.w, btn(ov(h), 'Подай бланка')); await settle(); }

/* Трите опита по ред: празно → 180… → 41…. */
async function threeTries(h, who) {
  const o = orderEl(h);
  if (!ok(who + ': полето „Поръчка №" е във формата', !!o)) return;
  ok(who + ': БЕЗ отметката „без документ"', !noDocEl(h));
  const doc = h.doc.getElementById('diff-docnum');
  ok(who + ': полето е под „Документ №"',
    !!(doc.compareDocumentPosition(o) & h.w.Node.DOCUMENT_POSITION_FOLLOWING));

  o.value = '';
  await submit(h);
  ok(who + ': без номер → червен toast', lastToast(h) === ORDER_MSG, lastToast(h));
  ok(who + ': без номер → няма POST', repPosts(h).length === 0 && linePosts(h).length === 0);

  o.value = '180486328';
  await submit(h);
  ok(who + ': 180… → червен toast', lastToast(h) === ORDER_MSG, lastToast(h));
  ok(who + ': 180… → няма POST', repPosts(h).length === 0 && linePosts(h).length === 0);

  o.value = '4100135756';
  await submit(h);
  const rp = repPosts(h), lp = linePosts(h);
  ok(who + ': 4100135756 → POST на бланката с wrong_receipt', rp.length === 1 && rp[0].body.direction === 'wrong_receipt',
    JSON.stringify(rp.map(p => p.body)) + ' | ' + h.calls.toast.join(' | '));
  ok(who + ': двата реда с order_number = 4100135756', lp.length === 2 && lp.every(l => l.order_number === '4100135756'),
    JSON.stringify(lp.map(l => l.order_number)));
}

(async function run() {

  section('1. Магазин → „🧾 Грешен прием"');
  {
    const h = env(STORE);
    const b = modBtn(h, '🧾 Грешен прием');
    if (ok('бутонът е там', !!b)) {
      realClick(h.w, b);
      await settle();
      ok('посоката е wrong_receipt', h.doc.getElementById('diff-direction').value === 'wrong_receipt');
      h.doc.getElementById('diff-store').value = 'Раднево';
      await fill(h);
      await threeTries(h, 'магазин');
    }
    h.close();
  }

  section('2. accounting → „📝 Подай бланка" → Сторна');
  {
    const h = env(ACCOUNTANT);
    realClick(h.w, modBtn(h, '📝 Подай бланка'));
    await settle();
    await setDir(h, 'wrong_receipt');
    const st = h.doc.getElementById('diff-store');
    if (!Array.prototype.some.call(st.options, o => o.value === 'Гоце Делчев')) st.innerHTML = '<option>Гоце Делчев</option>';
    st.value = 'Гоце Делчев';
    await fill(h);
    await threeTries(h, 'accounting');
    h.close();
  }

  section('3. „Доставчик" — както преди');
  {
    const h = env(STORE);
    realClick(h.w, modBtn(h, '📝 Подай бланка'));
    await settle();
    await setDir(h, 'supplier');
    h.doc.getElementById('diff-store').value = 'Раднево';
    await fill(h);
    ok('полето е там', !!orderEl(h));
    ok('отметката „без документ" е там', !!noDocEl(h));
    await submit(h);
    ok('без номер → червен toast, без POST', lastToast(h) === ORDER_MSG && repPosts(h).length === 0, lastToast(h));
    noDocEl(h).checked = true;
    await submit(h);
    const rp = repPosts(h);
    ok('„без документ" + без номер → минава', rp.length === 1 && rp[0].body.direction === 'supplier' && rp[0].body.no_document === true,
      JSON.stringify(rp.map(p => p.body)) + ' | ' + h.calls.toast.join(' | '));
    ok('редовете с order_number = null', linePosts(h).length === 2 && linePosts(h).every(l => l.order_number === null));
    h.close();
  }

  section('4. Смяна на посоката пази номера и не оставя полето при междускладов');
  {
    const h = env(ACCOUNTANT);
    realClick(h.w, modBtn(h, '📝 Подай бланка'));
    await settle();
    await setDir(h, 'supplier');
    orderEl(h).value = '4100135756';
    await setDir(h, 'wrong_receipt');
    ok('Доставчик → Сторна: номерът е запазен', !!orderEl(h) && orderEl(h).value === '4100135756', orderEl(h) && orderEl(h).value);
    ok('при Сторна няма „без документ"', !noDocEl(h));
    orderEl(h).value = '4100999999';
    await setDir(h, 'interstore');
    ok('→ Междускладов: полето го няма', !orderEl(h) && !noDocEl(h));
    await setDir(h, 'supplier');
    ok('→ обратно Доставчик: номерът (последно написаният) е там', !!orderEl(h) && orderEl(h).value === '4100999999', orderEl(h) && orderEl(h).value);
    ok('и „без документ" е обратно', !!noDocEl(h));
    await setDir(h, 'wrong_receipt');
    ok('→ пак Сторна: номерът е там', !!orderEl(h) && orderEl(h).value === '4100999999');
    h.close();
  }
  {
    /* Номер, написан при Сторна, после Междускладов → подаването е БЕЗ поръчка. */
    const h = env(ACCOUNTANT);
    realClick(h.w, modBtn(h, '📝 Подай бланка'));
    await settle();
    await setDir(h, 'wrong_receipt');
    orderEl(h).value = '4100135756';
    await setDir(h, 'interstore');
    const st = h.doc.getElementById('diff-store');
    if (!Array.prototype.some.call(st.options, o => o.value === 'Раднево')) st.innerHTML = '<option>Раднево</option>';
    st.value = 'Раднево';
    const cp = h.doc.getElementById('diff-counterpart');
    cp.value = cp.options[1] ? cp.options[1].value : '';
    h.doc.getElementById('diff-docnum').value = '180486328';
    realClick(h.w, btn(ov(h), '+ Добави артикул'));
    const rows = h.doc.querySelectorAll('#diff-items .diff-item-row');
    rows[0].querySelector('.di-name').value = 'ЛАЙСНА'; rows[0].querySelector('.di-qty').value = '1';
    rows[0].querySelector('.di-qty-real').value = '1';
    await submit(h);
    const rp = repPosts(h);
    ok('междускладов подаден', rp.length === 1 && rp[0].body.direction === 'interstore', JSON.stringify(rp.map(p => p.body)) + ' | ' + h.calls.toast.join(' | '));
    ok('и без поръчка в редовете (скритият номер не изтича)', linePosts(h).length > 0 && linePosts(h).every(l => l.order_number === null),
      JSON.stringify(linePosts(h).map(l => l.order_number)));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
