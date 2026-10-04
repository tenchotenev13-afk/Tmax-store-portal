/* Две малки промени (29.09.2026):

   А) „За връщане" → „По рекламации": втори бутон „📥 Excel (един лист)".
      Същите редове като на екрана (srFilteredList), колона „Магазин" най-
      отпред, после ТОЧНО колоните на многолистовия износ (srXlHead/srXlRow -
      едно място за двата). Файл …-edin-list-<дата>.xlsx. Многолистовият бутон
      дава байт по байт същото като преди — сравнено срещу замразения изход на
      кода отпреди промяната (tests/fixtures/sr-excel-multisheet-52ccb73.json).

   Б) „Разлики": „Кол. по док." се бърка → „Кол. по входяща" / „Количество по
      входяща (бр.)" за доставчик и междускладов. Сторната („по фактура") и
      печатът (printDoc) не се пипат.

   Пускане:  node tests/sr-excel-one-sheet-qty-label.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;
const fs = require('fs');
const path = require('path');

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

function row(o) {
  return Object.assign({ id: 'r', source: 'complaint', store_name: 'Раднево', supplier: 'ЕЛМАК ЕООД',
    product_name: null, sap_code: null, quantity: null, order_number: null, purchase_order: null,
    id_euro: null, plant: '1210', doc_date: null, withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: null, courier_info: null, control_comment: null,
    controller_comment: null, diff_line_id: null, photos: [] }, o);
}
const ROWS = [
  row({ id: 'a', store_name: 'Раднево', purchase_order: '4200016266', id_euro: 'E-66', doc_date: '2026-08-02',
        status: 'taken', withdrawal_date: '2026-08-20', courier_info: 'Спиди 777' }),
  row({ id: 'b', store_name: 'Враца', purchase_order: '4200015982', id_euro: 'E-82' }),
  row({ id: 'c', store_name: 'Раднево', purchase_order: '4200017100', supplier: 'ТЕСИ ООД' }),
  row({ id: 'd', store_name: 'Враца', purchase_order: '4200016001', product_name: 'БОЯ', sap_code: '0055123',
        quantity: 4, expiry_date: '2026-12-31', reason: 'Изтекъл срок' })
];

function srEnv(rows, dir) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true, repo: dir,
    data: { stock_returns: rows, stock_differences: [], differences_reports: [] }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = 'complaint'; h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.cap = { files: [] };
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => ({ __aoa: aoa }),
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; }
    },
    writeFile: (wb, fname) => { h.cap.files.push({ wb, fname }); }
  };
  h.w.renderStockReturns();
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-returns');
/* Ред „<етикет> <стойност>" от клетката „Документ“ (компактна таблица „За връщане“). */
const docLine = (td, label) => { const d = Array.prototype.find.call(td.querySelectorAll('div'), x => x.textContent.trim().indexOf(label) === 0); return d ? d.textContent.trim().slice(label.length).trim() : ''; };
/* Първата клетка на реда в „По рекламации“ е „Документ“ — ПВ-ЕВР е ред в нея. */
const onScreen = h => Array.prototype.map.call(mod(h).querySelectorAll('tbody tr'), tr => docLine(tr.children[0], 'ПВ-ЕВР'));
const dump = wb => JSON.stringify(wb.SheetNames.map(n => [n, wb.Sheets[n].__aoa, wb.Sheets[n]['!cols']]));
/* От 29.09.2026: „Коментар обект" (store_comment) — в „един лист" на мястото си
   от екрана (позиция 8, след „Изтеглена с"), в многолистовия — най-накрая.
   Виж sr-store-comment.test.js. */
const ins8 = (arr, v) => { const c = arr.slice(); c.splice(8, 0, v); return c; };
const dropLast = wb => JSON.stringify(wb.SheetNames.map(n => [n, wb.Sheets[n].__aoa.map(r => r.slice(0, -1)),
  wb.Sheets[n]['!cols'].slice(0, -1)]));

(async function run() {

  section('А1) Бутонът „📥 Excel (един лист)" — само в „По рекламации"');
  {
    const h = srEnv(ROWS);
    ok('в „По рекламации" го има', !!btn(mod(h), '📥 Excel (един лист)'));
    ok('и многолистовият „📥 Excel" си е там', Array.prototype.some.call(mod(h).querySelectorAll('button'),
      b => b.textContent.trim() === '📥 Excel'));
    h.w.srTab = 'diff'; h.w.renderStockReturns();
    ok('в „По разлики" го няма', !btn(mod(h), '📥 Excel (един лист)'));
    h.close();
  }

  section('А2) Доставчик ЕЛМАК + магазин → един лист, „Магазин" първа, в реда от екрана');
  {
    const h = srEnv(ROWS);
    h.w.srSupplierFilter = 'ЕЛМАК ЕООД'; h.w.renderStockReturns();
    const screen = onScreen(h);
    ok('на екрана: 3-те на ЕЛМАК, по ПВ-ЕВР', screen.join('|') === '4200015982|4200016001|4200016266', screen.join('|'));
    realClick(h.w, btn(mod(h), '📥 Excel (един лист)'));
    const f = h.cap.files[0];
    if (ok('файлът е записан', !!f)) {
      ok('ЕДИН лист', f.wb.SheetNames.length === 1, f.wb.SheetNames.join('|'));
      const aoa = f.wb.Sheets[f.wb.SheetNames[0]].__aoa;
      ok('ред 1: „Магазин" + колоните на многолистовия (с 11+, защото има продукт)',
        aoa[0].join('|') === ['Магазин'].concat(ins8(h.w.srXlHead(true), 'Коментар обект')).join('|'), aoa[0].join('|'));
      ok('един заглавен ред', aoa.length === 4, String(aoa.length));
      ok('ПВ-ЕВР в реда от екрана', aoa.slice(1).map(r => r[1]).join('|') === screen.join('|'), aoa.slice(1).map(r => r[1]).join('|'));
      ok('колона „Магазин" носи обекта', aoa.slice(1).map(r => r[0]).join('|') === 'Враца|Враца|Раднево');
      const ra = aoa.find(r => r[1] === '4200016266');
      ok('ред = „Магазин" + srXlRow (едно място за колоните)',
        JSON.stringify(ra) === JSON.stringify(['Раднево'].concat(ins8(h.w.srXlRow(h.w.srData.find(r => r.id === 'a'), true), ''))), JSON.stringify(ra));
      ok('статус ВЗЕТА, дати дд.мм.гггг', ra[6] === 'ВЗЕТА' && ra[4] === '02.08.2026' && ra[7] === '20.08.2026', JSON.stringify(ra));
      const rd = aoa.find(r => r[1] === '4200016001');
      ok('SAP „0055123" — текст, нулата е запазена', rd[14] === '0055123', JSON.stringify(rd[14]));
      ok('празните дати — празни клетки', ra[9] === '' && aoa.every(r => r.every(c => c !== '—')));
      ok('името: za-vrashtane-reklamacii-elmak-eood-edin-list-<дата>.xlsx',
        /^za-vrashtane-reklamacii-elmak-eood-edin-list-\d{4}-\d{2}-\d{2}\.xlsx$/.test(f.fname), f.fname);
    }
    /* + магазин */
    h.cap.files.length = 0;
    h.w.srStoreFilter = 'Раднево'; h.w.renderStockReturns();
    realClick(h.w, btn(mod(h), '📥 Excel (един лист)'));
    const aoa2 = h.cap.files[0].wb.Sheets[h.cap.files[0].wb.SheetNames[0]].__aoa;
    ok('+ магазин Раднево → само неговият ред', aoa2.length === 2 && aoa2[1][0] === 'Раднево' && aoa2[1][1] === '4200016266',
      JSON.stringify(aoa2.slice(1).map(r => r.slice(0, 2))));
    ok('без продукт в изнесените → без колони 11+', aoa2[0].length === 13, String(aoa2[0].length));
    h.close();
  }

  section('А3) 0 реда → toast, без файл');
  {
    const h = srEnv(ROWS);
    h.w.srSearch = 'НЯМА'; h.w.renderStockReturns();
    realClick(h.w, btn(mod(h), '📥 Excel (един лист)'));
    ok('toast „Няма редове за износ"', h.calls.toast.some(t => String(t) === 'Няма редове за износ'));
    ok('файл няма', h.cap.files.length === 0);
    h.close();
  }

  section('А4) Многолистовият бутон — байт по байт същото като кода отпреди промяната');
  {
    /* Очакваният резултат е ЗАМРАЗЕН във fixture: изходът на stock-returns.js
       отпреди „един лист" (блоб 52ccb73…, в историята от 666a43e) за същите
       ROWS — имена на листове, aoa, ширини и име на файла. Генериран веднъж
       локално от стария блоб; днешната дата в името е заменена с <ДАТА>.
       Досега тестът четеше блоба с git cat-file при всяко пускане и в CI
       (actions/checkout без fetch-depth — само последният комит) падаше с
       „bad file" и спираше целия пакет (29.09.2026). */
    const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sr-excel-multisheet-52ccb73.json'), 'utf8'));
    let same = true, detail = '';
    for (const sup of ['', 'ЕЛМАК ЕООД']) {
      const want = FIX[sup || '(всички)'];
      const h = srEnv(ROWS);
      h.w.srSupplierFilter = sup; h.w.renderStockReturns();
      h.w.exportSRExcel();
      const f = h.cap.files[0];
      /* Новият има „Коментар обект" най-накрая — без нея трябва да е fixture-ът. */
      const got = { fname: f ? f.fname.split(h.w.today()).join('<ДАТА>') : null, wb: f ? JSON.parse(dropLast(f.wb)) : null,
                    last: f ? f.wb.SheetNames.map(n => f.wb.Sheets[n].__aoa[0].slice(-1)[0]) : [] };
      h.close();
      if (!want) { same = false; detail = 'няма fixture за „' + sup + '"'; break; }
      if (JSON.stringify(got.wb) !== JSON.stringify(want.wb) || got.fname !== want.fname || !got.last.every(v => v === 'Коментар обект')) {
        same = false; detail = (sup || '(всички)') + ': ' + got.fname + ' vs ' + want.fname; break;
      }
    }
    ok('многолистовият износ = старият (fixture) + „Коментар обект" най-накрая (с и без филтър по доставчик)', same, detail);
  }

  section('Б) „Кол. по входяща" — форма, карта на бланката; сторната — „по фактура"');
  {
    const h = boot({ modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'], user: CVETI, confirm: true,
      data: { stock_differences: [], differences_reports: [], stock_returns: [], users: [], contacts: [], stores: [], stock_diff_swaps: [] } });
    const q = h.w.diffQtyLabels;
    for (const d of ['supplier', 'interstore']) {
      ok('[' + d + '] doc = „Количество по входяща (бр.)"', q(d).doc === 'Количество по входяща (бр.)', q(d).doc);
      ok('[' + d + '] docShort = „Кол. по входяща"', q(d).docShort === 'Кол. по входяща', q(d).docShort);
      ok('[' + d + '] printDoc непроменен („Кол.")', q(d).printDoc === 'Кол.', q(d).printDoc);
    }
    ok('[wrong_receipt] „Количество по фактура (бр.)" / „Кол. по фактура"',
      q('wrong_receipt').doc === 'Количество по фактура (бр.)' && q('wrong_receipt').docShort === 'Кол. по фактура');

    /* Формата: подсказката на количеството, с истински клик на „Подай бланка". */
    h.w.sdData = []; h.w.diffReports = []; h.w.transportOrders = [];
    h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = ''; h.w.sdDirTab = 'supplier';
    h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД']);
    h.w.renderStockDiff();
    realClick(h.w, btn(h.doc.getElementById('mod-stock-diff'), '📝 Подай бланка'));
    await ticks(); await ticks();
    /* От 01.10.2026 думата е в постоянния надпис над полето (diffQtyLabels().formDoc),
       а в самото поле е само „бр." — виж tests/diff-form-qty-labels.test.js. */
    const ph = () => { const f = h.doc.querySelector('#diff-items .di-qty'); const w = f && f.closest('.di-fld'); return w ? w.querySelector('.di-lbl').textContent : null; };
    ok('формата (междускладов): „По входяща доставка (бр.)"', ph() === 'По входяща доставка (бр.)', ph());
    const dir = h.doc.getElementById('diff-direction');
    dir.value = 'supplier'; fire(h.w, dir, 'change'); await ticks();
    ok('формата (доставчик): „По входяща доставка (бр.)"', ph() === 'По входяща доставка (бр.)', ph());
    dir.value = 'wrong_receipt'; fire(h.w, dir, 'change'); await ticks();
    ok('формата (сторна): „Количество по фактура (бр.)"', ph() === 'Количество по фактура (бр.)', ph());
    h.w.closeDiffSubmitModal();

    /* Картата на бланката в горната секция. */
    const REP = d => ({ id: 'rep-' + d, direction: d, store_name: 'Враца', counterpart: 'ТЕСИ ООД', document_number: '1',
      doc_date: '2026-09-28', photos: [], reviewed: false, created_at: '2026-09-28T08:00:00Z' });
    const LN = d => ({ id: 'l-' + d, report_id: 'rep-' + d, store_name: 'Враца', material_name: 'А', quantity: 2,
      type: null, status: 'new', attachments: [] });
    for (const [d, want] of [['supplier', 'Кол. по входяща'], ['wrong_receipt', 'Кол. по фактура']]) {
      h.w.sdData = [LN(d)]; h.w.diffReports = [REP(d)]; h.w.sdDirTab = d; h.w.renderStockDiff();
      const card = h.doc.getElementById('diff-rep-rep-' + d);
      const heads = card ? Array.prototype.map.call(card.querySelectorAll('th'), th => th.textContent.trim()) : [];
      ok('[' + d + '] картата: колона „' + want + '"', heads.indexOf(want) >= 0, heads.join('|'));
      ok('[' + d + '] картата: без „Кол. по док."', heads.indexOf('Кол. по док.') < 0);
    }
    h.close();
  }

  report();
})();
