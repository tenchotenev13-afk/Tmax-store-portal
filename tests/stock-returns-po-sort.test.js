/* „За връщане" → „По рекламации / срок на годност": редовете са подредени по
   ПВ-ЕВР (purchase_order) от най-стария към най-новия номер, независимо от
   датите. Редове без ПВ-ЕВР — най-отдолу. (Точка 2 от Цвети.)

   Сортирането е в srFilteredList(), затова важи еднакво за таблицата и за
   exportSRExcel(). Подтаб „По разлики" запазва реда от заявката
   (order=doc_date.desc) — тя е обща и не се пипа.

   Пускане:  node tests/stock-returns-po-sort.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn } = H;

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: []
};

function row(o) {
  return Object.assign({
    id: 'r-1', source: 'complaint', store_name: 'Раднево', supplier: 'КАМ-04',
    product_name: 'АРТИКУЛ', sap_code: '111', quantity: 3,
    order_number: null, purchase_order: null, id_euro: null, plant: null,
    doc_date: '2026-08-17', withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: '', courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}

function env(rows, tab) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = tab || 'diff';
  h.w.srFilter = 'all';
  h.w.srStoreFilter = '';
  h.w.srSupplierFilter = '';
  h.w.srSearch = '';
  return h;
}

function stubXLSX(w) {
  const cap = { aoas: [] };
  w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (aoa) => { cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; }
    },
    writeFile: () => {}
  };
  return cap;
}

/* Ред „<етикет> <стойност>" от клетката „Документ“ (компактна таблица „За връщане“). */
const docLine = (td, label) => { const d = Array.prototype.find.call(td.querySelectorAll('div'), x => x.textContent.trim().indexOf(label) === 0); return d ? d.textContent.trim().slice(label.length).trim() : ''; };
/* Първата клетка на ред в „По рекламации" е „Документ“; ПВ-ЕВР е ред в нея. */
const tablePOs = doc => Array.prototype.map.call(
  doc.getElementById('mod-stock-returns').querySelectorAll('tbody tr'),
  tr => docLine(tr.children[0], 'ПВ-ЕВР'));

/* Редът в srData е по doc_date.desc — като от заявката — и нарочно НЕ съвпада
   с реда по ПВ-ЕВР. Продуктите носят номер, за да се провери, че в Excel-а
   целият ред пътува заедно с ПВ-ЕВР (колона 0), а не само номерът. */
const COMPLAINT = [
  row({ id: 'c-1', purchase_order: '4200016266', product_name: 'П-16266', doc_date: '2026-09-20' }),
  row({ id: 'c-2', purchase_order: null,         product_name: 'П-БЕЗ',   doc_date: '2026-09-19' }),
  row({ id: 'c-3', purchase_order: '4200015982', product_name: 'П-15982', doc_date: '2026-09-18' }),
  row({ id: 'c-4', purchase_order: '4200016001', product_name: 'П-16001', doc_date: '2026-09-10' }),
  row({ id: 'c-5', purchase_order: '4200017100', product_name: 'П-17100', doc_date: '2026-09-05' }),
  row({ id: 'c-6', purchase_order: '4200015990', product_name: 'П-15990', doc_date: '2026-08-01' })
];
const EXPECT_PO = ['4200015982', '4200015990', '4200016001', '4200016266', '4200017100', ''];
const EXPECT_PROD = ['П-15982', 'П-15990', 'П-16001', 'П-16266', 'П-17100', 'П-БЕЗ'];

(async function run() {

  section('а) „По рекламации": таблицата е по ПВ-ЕВР възходящо, празният най-долу');
  {
    /* Тръгваме от „По разлики" и минаваме в рекламациите с истински клик. */
    const { w, doc } = env(COMPLAINT, 'diff');
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const tab = btn(doc, '📋 По рекламации');
      if (ok('бутонът „📋 По рекламации" е на екрана', !!tab)) {
        realClick(w, tab);
        ok('srTab стана complaint', w.srTab === 'complaint', w.srTab);
        const got = tablePOs(doc);
        ok('редовете са ' + EXPECT_PO.join(' < ') + ' + празен най-долу',
          got.join('|') === EXPECT_PO.join('|'), got.join('|'));
        ok('srData не е пренаредена (заявката остава doc_date.desc)',
          w.srData.map(r => r.id).join('|') === 'c-1|c-2|c-3|c-4|c-5|c-6',
          w.srData.map(r => r.id).join('|'));
      }
    }
  }

  section('б) „По рекламации": Excel износът е в същия ред като таблицата');
  {
    const { w, doc } = env(COMPLAINT, 'complaint');
    const cap = stubXLSX(w);
    w.renderStockReturns();
    const b = btn(doc, '📥 Excel');
    if (ok('бутонът „📥 Excel" е на екрана', !!b)) {
      realClick(w, b);
      const aoa = cap.aoas[0];
      if (ok('aoa е подаден на SheetJS', !!aoa)) {
        /* Многолистов формат: всички редове са от Раднево → един лист;
           колона 0 = ПВ-ЕВР, колона 11 = продукт (излиза, защото редовете го имат). */
        const pos = aoa.slice(1).map(r => r[0]);
        ok('ПВ-ЕВР в aoa е ' + EXPECT_PO.join(' < '),
          pos.join('|') === EXPECT_PO.join('|'), pos.join('|'));
        const prods = aoa.slice(1).map(r => r[11]);
        ok('продуктите пътуват със своя ПВ-ЕВР: ' + EXPECT_PROD.join(' < '),
          prods.join('|') === EXPECT_PROD.join('|'), prods.join('|'));
      }
    }
  }

  section('в) Сортирането важи и при филтър (търсене)');
  {
    const { w } = env(COMPLAINT, 'complaint');
    w.srSearch = 'П-1';
    const got = w.srFilteredList().map(r => r.purchase_order);
    ok('филтрираните пет са във възходящ ред',
      got.join('|') === EXPECT_PO.slice(0, 5).join('|'), got.join('|'));
  }

  section('г) Нечислов ПВ-ЕВР — localeCompare, не NaN; празен/интервали най-долу');
  {
    const { w } = env([
      row({ id: 'x-1', purchase_order: 'B-2' }),
      row({ id: 'x-2', purchase_order: '   ' }),
      row({ id: 'x-3', purchase_order: 'A-9' }),
      row({ id: 'x-4', purchase_order: '' })
    ], 'complaint');
    const got = w.srFilteredList().map(r => r.id);
    ok('A-9 < B-2, празните след тях в изходния ред',
      got.join('|') === 'x-3|x-1|x-2|x-4', got.join('|'));
  }

  section('д) „По разлики": редът НЕ е променен');
  {
    const DIFF = COMPLAINT.map(r => Object.assign({}, r, { source: 'diff', id: 'd' + r.id }));
    const { w, doc } = env(DIFF, 'diff');
    if (guard('renderStockReturns() не хвърля', () => w.renderStockReturns())) {
      const ids = w.srFilteredList().map(r => r.id);
      ok('srFilteredList() е в реда на srData',
        ids.join('|') === 'dc-1|dc-2|dc-3|dc-4|dc-5|dc-6', ids.join('|'));
      /* В „По разлики" ПВ-ЕВР е ред в 2-рата клетка („Документ"). */
      const pos = Array.prototype.map.call(
        doc.getElementById('mod-stock-returns').querySelectorAll('tbody tr'),
        tr => docLine(tr.children[1], 'ПВ-ЕВР'));
      const exp = COMPLAINT.map(r => r.purchase_order || '');
      ok('таблицата е в реда на заявката', pos.join('|') === exp.join('|'), pos.join('|'));

      const cap = stubXLSX(w);
      realClick(w, btn(doc, '📥 Excel'));
      const aoa = cap.aoas[0] || [];
      /* 7 реда заглавен блок, после данните; ПВ-ЕВР е колона 5. */
      const xpos = aoa.slice(7).map(r => r[4]);
      ok('Excel-ът на „По разлики" е в реда на заявката',
        xpos.join('|') === exp.join('|'), xpos.join('|'));
    }
  }

  report();
})();
