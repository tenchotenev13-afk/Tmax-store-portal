/* Разлики: бутон „📥 Excel" за долната таблица. (Точка 1 от Цвети, част 2.)

   Цвети сверява КИ и дали стоката е заприходена по подтабове. Износът:
     · изнася ТОЧНО видяното — sdTableRows() (посока, магазин, тип, статус,
       търсене), в реда от екрана;
     · колоните от екрана + „Дата на подаване", „Документ №", „Дата на
       документ" от бланката; етикети, не кодове; статусът като на екрана;
     · номерата (SAP, поръчки, документ) — текст; празна дата — празна клетка;
     · бутонът е винаги видим; при 0 реда → toast, без файл.

   window.XLSX е фалшив и хваща aoa-то и името на файла.

   Пускане:  node tests/diff-excel-export.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

const HEAD = ['Тип','Магазин','Доставчик','Материал','Наименование','Кол.','Поръчка','Поръчка за връщане',
  'Дата потвърд.','Статус','Кредитно','Коментар','Коментар контролер',
  'Дата на подаване','Документ №','Дата на документ'];

const REPS = [
  { id: 'rep-1', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД', document_number: '180486328',
    doc_date: '2026-09-20', created_at: '2026-09-21T09:30:00Z', reviewed: true, photos: [] },
  { id: 'rep-2', direction: 'supplier', store_name: 'Раднево', counterpart: 'КАМ-04', document_number: '4600179694',
    doc_date: null, created_at: '2026-09-22T09:30:00Z', reviewed: true, photos: [] },
  { id: 'rep-3', direction: 'interstore', store_name: 'Враца', counterpart: 'Логистичен склад Търговище',
    document_number: '777', doc_date: '2026-09-20', created_at: '2026-09-21T09:30:00Z', reviewed: true, photos: [] }
];
function line(o) {
  return Object.assign({ id: 'l', report_id: 'rep-1', store_name: 'Враца', supplier: 'ТЕСИ ООД',
    material_code: '0034989', material_name: 'АРТИКУЛ', quantity: '3', type: 'missing', status: 'pending',
    order_number: '4100135756', return_order_number: null, confirmed_date: null, credit_note_issued: false,
    comment: null, resolution_comment: null, attachments: [], warehouse_response: null, store_response: null,
    created_at: '2026-09-21T09:30:00Z' }, o);
}
/* Редът в sdData е редът на таблицата (заявката е по created_at.desc). */
const LINES = [
  line({ id: 'l-1', material_name: 'ЛИПСА ВРАЦА 1', confirmed_date: '2026-09-25', comment: 'липсват 3',
         resolution_comment: 'иска КИ', credit_note_issued: true }),
  line({ id: 'l-2', material_name: 'ЗАПРИХОДЕНО ВРАЦА', type: 'writein' }),
  line({ id: 'l-3', material_name: 'ЛИПСА РАДНЕВО', report_id: 'rep-2', store_name: 'Раднево', supplier: 'КАМ-04' }),
  line({ id: 'l-4', material_name: 'ЛИПСА ВРАЦА 2', type: 'missing', status: 'taken',
         return_order_number: '4200017097', order_number: null }),
  line({ id: 'l-5', material_name: 'МЕЖДУСКЛАДОВ ВРАЦА', report_id: 'rep-3', type: 'missing' })
];

function env(lines) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_differences: lines, differences_reports: REPS, stock_returns: [], transport_orders: [],
            users: [], contacts: [], stores: [], stock_diff_swaps: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(REPS));
  h.w.transportOrders = [];
  h.w.sdView = 'rows'; /* изгледът „Редове" (таблицата) — подразбирането е „Бланки" */
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.cap = { aoas: [], files: [] };
  h.w.XLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: aoa => { h.cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: (wb, ws, n) => { wb.SheetNames.push(n); wb.Sheets[n] = ws; }
    },
    writeFile: (wb, fname) => { h.cap.files.push({ wb, fname }); }
  };
  h.w.renderStockDiff();
  return h;
}
const excelBtn = h => btn(h.doc.getElementById('mod-stock-diff'), '📥 Excel');
const chip = (h, sel) => h.doc.querySelector(sel);
function mainTable(h) {
  return Array.prototype.find.call(h.doc.querySelectorAll('#mod-stock-diff table'),
    t => Array.prototype.some.call(t.querySelectorAll('thead th'), th => th.textContent.trim() === 'Дата потвърд.'));
}
const tableNames = h => { const t = mainTable(h); return t ? Array.prototype.map.call(t.querySelectorAll('tbody tr'),
  tr => tr.querySelectorAll('td')[4].textContent.trim()) : []; };

(async function run() {

  section('а) Филтър „Липса" + магазин „Враца" → само тези редове, в реда от екрана');
  {
    const h = env(LINES);
    realClick(h.w, chip(h, 'button[data-f="missing"]'));
    h.w.sdStoreFilter = 'Враца'; h.w.renderStockDiff();
    const onScreen = tableNames(h);
    ok('на екрана: ЛИПСА ВРАЦА 1, ЛИПСА ВРАЦА 2', onScreen.join('|') === 'ЛИПСА ВРАЦА 1|ЛИПСА ВРАЦА 2', onScreen.join('|'));
    const b = excelBtn(h);
    if (ok('бутонът „📥 Excel" е на екрана', !!b)) {
      realClick(h.w, b);
      const aoa = h.cap.aoas[0];
      if (ok('aoa е подаден', !!aoa)) {
        const names = aoa.slice(1).map(r => r[4]);
        ok('в Excel-а са същите редове в същия ред', names.join('|') === onScreen.join('|'), names.join('|'));
        ok('няма друг тип / друг магазин / междускладов', names.every(n => n.indexOf('ЛИПСА ВРАЦА') === 0));
      }
      ok('името: razliki-lipsa-vratsa-<дата>.xlsx',
        h.cap.files[0] && /^razliki-lipsa-vratsa-\d{4}-\d{2}-\d{2}\.xlsx$/.test(h.cap.files[0].fname), h.cap.files[0] && h.cap.files[0].fname);
      ok('един лист „Разлики"', h.cap.files[0] && h.cap.files[0].wb.SheetNames.join('|') === 'Разлики');
      ok('toast с броя', h.calls.toast.some(t => String(t).indexOf('Excel изтеглен! (2 реда)') >= 0), h.calls.toast.join(' | '));
    }
    h.close();
  }

  section('а2) Статус „Чакащи" + търсене също важат');
  {
    const h = env(LINES);
    h.w.sdFilter = 'pending'; h.w.sdSearch = 'ВРАЦА'; h.w.renderStockDiff();
    realClick(h.w, excelBtn(h));
    const names = (h.cap.aoas[0] || []).slice(1).map(r => r[4]);
    ok('само чакащите с „ВРАЦА", без приключената', names.join('|') === tableNames(h).join('|') &&
      names.indexOf('ЛИПСА ВРАЦА 2') < 0 && names.length === 2, names.join('|'));
    h.close();
  }

  section('б) Колоните и етикетите');
  {
    const h = env(LINES);
    realClick(h.w, excelBtn(h));
    const aoa = h.cap.aoas[0];
    ok('ред 1 = заглавията точно', aoa[0].join('|') === HEAD.join('|'), aoa[0].join('|'));
    const r1 = aoa.find(r => r[4] === 'ЛИПСА ВРАЦА 1');
    ok('Тип „Липса" (не „missing", без емоджи)', r1[0] === 'Липса', r1[0]);
    ok('Тип „Заприхождаване"', aoa.find(r => r[4] === 'ЗАПРИХОДЕНО ВРАЦА')[0] === 'Заприхождаване');
    /* Статусът — като на екрана: сравнява се с клетката на таблицата. */
    const tr = Array.prototype.find.call(mainTable(h).querySelectorAll('tbody tr'),
      x => x.querySelectorAll('td')[4].textContent.trim() === 'ЛИПСА ВРАЦА 1');
    const screenStatus = tr.querySelectorAll('td')[9].textContent.trim();
    /* Думата от екрана, БЕЗ иконата отпред (както при Тип). */
    ok('на екрана статусът е с икона („' + screenStatus + '")', /^\S+ НЕВЗЕТА$/.test(screenStatus), screenStatus);
    ok('в Excel: „НЕВЗЕТА" — думата от екрана без иконата', r1[9] === 'НЕВЗЕТА' && screenStatus.endsWith(' ' + r1[9]),
      JSON.stringify(r1[9]));
    const r4s = aoa.find(r => r[4] === 'ЛИПСА ВРАЦА 2')[9];
    const tr4 = Array.prototype.find.call(mainTable(h).querySelectorAll('tbody tr'),
      x => x.querySelectorAll('td')[4].textContent.trim() === 'ЛИПСА ВРАЦА 2');
    const screen4 = tr4.querySelectorAll('td')[9].textContent.trim();
    ok('приключена Липса: „' + screen4 + '" на екрана → „ВЗЕТА" в Excel', r4s === 'ВЗЕТА' && screen4.endsWith(' ВЗЕТА'),
      JSON.stringify([screen4, r4s]));
    ok('нито един статус не започва с не-буква', aoa.slice(1).every(r => /^[A-Za-zА-Яа-я]/.test(r[9])),
      JSON.stringify(aoa.slice(1).map(r => r[9])));
    ok('Кол. е число 3', r1[5] === 3, JSON.stringify(r1[5]));
    ok('Кредитно „Издадено" за Липса с КИ', r1[10] === 'Издадено', r1[10]);
    ok('Кредитно празно за не-Липса', aoa.find(r => r[4] === 'ЗАПРИХОДЕНО ВРАЦА')[10] === '');
    ok('Коментари', r1[11] === 'липсват 3' && r1[12] === 'иска КИ', JSON.stringify([r1[11], r1[12]]));
    ok('Дата потвърд. 25.09.2026', r1[8] === '25.09.2026', r1[8]);
    ok('Дата на подаване 21.09.2026 (от бланката)', r1[13] === '21.09.2026', r1[13]);
    ok('Документ № 180486328 (от бланката)', r1[14] === '180486328', r1[14]);
    ok('Дата на документ 20.09.2026', r1[15] === '20.09.2026', r1[15]);
    ok('всеки ред е с 16 клетки (без „Отговор на склада" в Доставчици)', aoa.every(r => r.length === 16));
    h.close();
  }

  section('в) 4100… и 4200… — текст, в правилните колони; SAP с водеща нула — текст');
  {
    const h = env(LINES);
    realClick(h.w, excelBtn(h));
    const aoa = h.cap.aoas[0];
    const r1 = aoa.find(r => r[4] === 'ЛИПСА ВРАЦА 1');
    const r4 = aoa.find(r => r[4] === 'ЛИПСА ВРАЦА 2');
    ok('Поръчка „4100135756" като низ', r1[6] === '4100135756' && typeof r1[6] === 'string', JSON.stringify(r1[6]));
    ok('Поръчка за връщане празна при l-1', r1[7] === '', JSON.stringify(r1[7]));
    ok('Поръчка за връщане „4200017097" като низ', r4[7] === '4200017097' && typeof r4[7] === 'string', JSON.stringify(r4[7]));
    ok('Поръчка празна при l-4', r4[6] === '', JSON.stringify(r4[6]));
    ok('SAP „0034989" — низ, нулата е запазена', r1[3] === '0034989', JSON.stringify(r1[3]));
    ok('Документ № 4600179694 — низ', aoa.find(r => r[4] === 'ЛИПСА РАДНЕВО')[14] === '4600179694');
    h.close();
  }

  section('г) Празна дата → празна клетка, не „—"');
  {
    const h = env(LINES);
    realClick(h.w, excelBtn(h));
    const aoa = h.cap.aoas[0];
    const rR = aoa.find(r => r[4] === 'ЛИПСА РАДНЕВО');
    ok('Дата потвърд. празна', rR[8] === '', JSON.stringify(rR[8]));
    ok('Дата на документ празна (бланката е без)', rR[15] === '', JSON.stringify(rR[15]));
    ok('никъде „—"', aoa.every(r => r.every(c => c !== '—')));
    h.close();
  }

  section('д/е) 0 реда → бутонът се вижда; клик → toast, без файл');
  {
    const h = env(LINES);
    h.w.sdSearch = 'НЯМА-ТАКОВА'; h.w.renderStockDiff();
    ok('таблицата е празна', !mainTable(h));
    const b = excelBtn(h);
    if (ok('бутонът „📥 Excel" се вижда и при 0 реда', !!b)) {
      realClick(h.w, b);
      ok('toast „Няма редове за износ"', h.calls.toast.some(t => String(t) === 'Няма редове за износ'), h.calls.toast.join(' | '));
      ok('нищо не е подадено на SheetJS', h.cap.aoas.length === 0 && h.cap.files.length === 0);
    }
    const h2 = env([]);
    ok('и при напълно празен модул бутонът е там', !!excelBtn(h2));
    h.close(); h2.close();
  }

  section('ж) Без SheetJS → зарежда го от cdnjs, без да хвърля');
  {
    const h = env(LINES);
    delete h.w.XLSX;
    const before = h.doc.querySelectorAll('script[src]').length;
    realClick(h.w, excelBtn(h));
    const srcs = Array.prototype.map.call(h.doc.querySelectorAll('script[src]'), s => s.src);
    ok('добавен е <script> към cdnjs xlsx 0.18.5', srcs.length === before + 1 &&
      srcs.indexOf('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js') >= 0, srcs.join(' | '));
    h.close();
  }

  report();
})();
