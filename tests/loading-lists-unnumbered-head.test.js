/* Товарни листи: заглавен ред и за единиците БЕЗ номер (насип).

   Единица без номер (насип, или палет без pallet_no) получава заглавен ред в
   същия стил като палетите — „Насип · Монтана · изходящи: 80472771" — а
   редът под него е „↳". На този заглавен ред няма бутони (насипът няма
   етикет, няма „(1/2)", няма „Опис"). llIsHeaded() не се пипа.

   Пускане:  node tests/loading-lists-unnumbered-head.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const MONTANA = { email: 'montana@temax.bg', display_name: 'Управител Монтана',
                  role: 'manager', store_name: 'Монтана', assigned_stores: [] };
const MODULES = ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
                 'stock-differences.js', 'loading.js'];
const L1 = { id: 'L1', warehouse: WH, list_date: '2026-10-06', status: 'sent',
             executed_by: 'Иван', comment: '', created_by: 'x', created_at: '2026-10-06T06:00:00.000Z',
             sent_at: '2026-10-06T07:00:00.000Z', done_at: null };

function it_(o) {
  return Object.assign({
    id: 'i-x', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 2,
    purchase_doc: null, clears_doc: null, store_name: 'Монтана', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, received_by: null,
    received_at: null, created_at: '2026-10-06T06:00:00.000Z', products: []
  }, o);
}
/* Два палета и един насип за ЕДИН обект. */
const ITEMS = [
  it_({ id: 'p1', position: 1, pallet_no: 1, purchase_doc: 'P1' }),
  it_({ id: 'p2', position: 2, pallet_no: 2, purchase_doc: 'P2' }),
  it_({ id: 'b1', position: 3, kind: 'bulk', pallet_no: null, pallet_total: null, purchase_doc: '80472771' })
];
const HEAD_BULK = 'Насип · Монтана · изходящи: 80472771';

function env(items, user) {
  const h = boot({
    modules: MODULES, user: user || WAREHOUSE, confirm: true,
    data: {
      app_settings: [], goods_transit: [], loading_lists: [L1],
      loading_list_items: function (url) {
        let rows = (items || []).map(r => Object.assign({}, r, {
          loading_list_products: (r.products || []).map(p => Object.assign({}, p)) }));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        return rows;
      },
      loading_list_products: [], loading_list_photos: [],
      users: [{ store_name: 'Монтана' }], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  const rec = { text: [] };
  function Doc() {}
  ['addFileToVFS', 'addFont', 'setFont', 'setFontSize', 'setTextColor', 'setFillColor', 'rect', 'addPage'].forEach(m => { Doc.prototype[m] = function () {}; });
  Doc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  Doc.prototype.text = function (t) { rec.text.push(String(t)); };
  Doc.prototype.output = function () { return 'data:application/pdf;filename=x.pdf;base64,UERG'; };
  h.w.jspdf = { jsPDF: Doc };
  h.w.llPdfFont = () => Promise.resolve('Rk9OVA==');
  h.pdf = rec;
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const patchesOf = h => h.calls.patch.filter(p => p.table === 'loading_list_items');
/* Заглавните редове и редовете под тях, в реда им. */
const seq = root => Array.from(root.querySelectorAll('tbody tr')).filter(t =>
    t.hasAttribute('data-ll-unit-head') || /↳/.test(t.textContent)).map(t => t.hasAttribute('data-ll-unit-head') ? 'H' : 'R').join('');

(async function () {

  section('1. Помощната проверка — llIsHeaded() не е пипан');
  {
    const h = env(ITEMS);
    const w = h.w;
    ok('палет с № е „с номер"', w.llIsHeaded(ITEMS[0]) === true && w.llIsUnnumberedUnit(ITEMS[0]) === false);
    ok('насипът е „без номер"', w.llIsHeaded(ITEMS[2]) === false && w.llIsUnnumberedUnit(ITEMS[2]) === true);
    ok('палет без pallet_no — също', w.llIsUnnumberedUnit(it_({ pallet_no: null })) === true);
    ok('няма редове → не е единица', w.llIsUnnumberedUnit(null) === false);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const units = w.llLabelUnits(w.llItemsOf('L1'));
    ok('етикетите НЕ се пипат — насипът остава без етикет (2 единици)', units.length === 2 && units.every(u => u.kind === 'pallet'),
      units.map(u => u.key).join());
    const share = w.llDocShare(w.llItemsOf('L1'));
    ok('и „(1/2)" си остава само за номерираните', share('Монтана', '80472771', 'bulk', null) === '');
  }

  section('2. Карта на обекта: 3 заглавни реда, насипът е без бутони');
  {
    const h = env(ITEMS, MONTANA);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    const card = h.doc.getElementById('ll-card-L1');
    const heads = Array.from(card.querySelectorAll('tr[data-ll-unit-head]'));
    ok('3 заглавни реда (2 палета + насип) с data-ll-unit-head', heads.length === 3, String(heads.length));
    ok('редът: заглавие, ↳, заглавие, ↳, заглавие, ↳', seq(card) === 'HRHRHR', seq(card));
    const hb = heads.find(t => t.hasAttribute('data-ll-unnumbered'));
    ok('насипният има текста от llGroupHeading', !!hb && hb.textContent.trim() === HEAD_BULK, hb && hb.textContent);
    ok('сив фон и лява лента в цвета на обекта', hb && /background:#f8fafc/.test(hb.getAttribute('style')) &&
      hb.querySelector('td').getAttribute('style').toLowerCase().indexOf('border-left:4px solid ' + h.w.llStoreColor('Монтана')) >= 0);
    ok('НЯМА <button> на заглавния ред на насипа', hb && hb.querySelectorAll('button').length === 0);
    ok('заглавният ред за палет 1 си е същият (не е пипан)', heads[0].textContent.indexOf('Палет 1 от 2 · Монтана · изходящи: P1') === 0);
    const row = Array.from(card.querySelectorAll('tbody tr')).find(t => !t.hasAttribute('data-ll-unit-head') && /80472771/.test(t.textContent));
    ok('редът на насипа е „↳"', row && /↳/.test(row.children[0].textContent) && !/насип/i.test(row.children[0].textContent), row && row.children[0].textContent);
    ok('и върху него остават бутоните за приемане', !!btn(row, '✅ Получено') && !!btn(row, '⛔ Неполучено'));

    /* „✅ Получено" на реда на насипа — както преди. */
    realClick(h.w, btn(row, '✅ Получено'));
    await ticks(); await ticks(); await ticks();
    const ps = patchesOf(h);
    ok('PATCH само за b1: received', ps.length === 1 && /id=eq\.b1/.test(ps[0].url) && ps[0].body.received === true, JSON.stringify(ps.map(p => p.url)));
  }
  {
    /* „⛔ Неполучено" — иска коментар; работи при реален клик както преди. */
    const h = env(ITEMS, MONTANA);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.doc.getElementById('ll-sc-b1').value = 'насипът не дойде';
    const card = h.doc.getElementById('ll-card-L1');
    const row = Array.from(card.querySelectorAll('tbody tr')).find(t => !t.hasAttribute('data-ll-unit-head') && /80472771/.test(t.textContent));
    realClick(h.w, btn(row, '⛔ Неполучено'));
    await ticks(); await ticks(); await ticks();
    const ps = patchesOf(h);
    ok('„⛔ Неполучено" → PATCH missing за b1', ps.length === 1 && /id=eq\.b1/.test(ps[0].url) && ps[0].body.missing === true && ps[0].body.store_comment === 'насипът не дойде',
      JSON.stringify(ps.map(p => [p.url, p.body])));
  }

  section('3. Преглед на склада: 3 заглавни реда, насипът — без бутони');
  {
    const h = env(ITEMS);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llOpenView('L1'); await ticks();
    const root = mod(h);
    const heads = Array.from(root.querySelectorAll('tr[data-ll-unit-head]'));
    ok('3 заглавни реда', heads.length === 3, heads.map(t => t.textContent).join(' | '));
    ok('редът: Н Р Н Р Н Р', seq(root) === 'HRHRHR', seq(root));
    const hb = heads.find(t => t.hasAttribute('data-ll-unnumbered'));
    ok('„' + HEAD_BULK + '"', hb && hb.textContent.trim() === HEAD_BULK, hb && hb.textContent);
    ok('БЕЗ „🏷 Етикет", „⬇" и „🖨 Опис" на този ред', hb && hb.querySelectorAll('button').length === 0);
    ok('а палетите ги имат (етикет)', heads.filter(t => !t.hasAttribute('data-ll-unnumbered')).every(t => !!btn(t, '🏷 Етикет')));
    ok('нищо друго не е пипано — „🏷 Етикет“ общо за 2 палета', root.querySelectorAll('button[data-lk]').length === 4);
  }

  section('4. Печат и PDF');
  {
    const h = env(ITEMS);
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llPrint('L1');
    const pr = h.doc.getElementById('mod-print');
    const heads = Array.from(pr.querySelectorAll('tr[data-ll-unit-head]')).map(t => t.textContent);
    ok('печат: 3 заглавни реда', heads.length === 3, JSON.stringify(heads));
    ok('печат: „' + HEAD_BULK + '"', heads.indexOf(HEAD_BULK) >= 0, JSON.stringify(heads));
    const l = h.w.llLists.find(x => x.id === 'L1');
    await h.w.llBuildPdf(l, h.w.llItems, '');
    const t = h.pdf.text;
    ok('PDF: ред „N. Насип · Монтана · изходящи: 80472771"', t.some(x => /^\d+\. Насип · Монтана · изходящи: 80472771$/.test(x)), JSON.stringify(t));
    ok('PDF: под него — документът му', t.some(x => /изходящ № 80472771/.test(x)));
    ok('PDF: номерацията е 1, 2, 3 подред', ['1. ', '2. ', '3. '].every(p => t.some(x => x.indexOf(p) === 0)), JSON.stringify(t));
  }

  report();
})();
