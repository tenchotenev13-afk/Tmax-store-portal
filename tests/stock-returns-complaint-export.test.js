/* „За връщане" → „По рекламации": Excel износът е ОГЛЕДАЛО на многолистовия
   ERP импорт (parseDiffReturnsWorkbook), не на единичния лист. (Точка 1 от Цвети.)

   Редовете в този подтаб идват от многолистовия файл, а полетата на единичния
   формат (продукт, SAP, срок) често са празни — старият износ даваше почти
   празен файл. Сега:
     · един лист на магазин, името е номерът от SR_SHEET_TO_STORE;
     · ред 1 = заглавия, без заглавен блок (импортът прескача точно един ред);
     · колони 0–10 позиционно, както ги чете импортът;
     · колони 11+ (продукт, SAP, кол., срок, причина) само ако някой ред ги има;
     · статус с главни букви ВЗЕТА / НЕВЗЕТА / ПРИКЛЮЧЕНА.

   Кръгът е истински: изнесеният workbook минава през parseDiffReturnsWorkbook
   и през целия startReturnsImport (дедуп GET → PATCH), за да се види, че
   ПРИКЛЮЧЕНА не връща назад приключен в портала ред.

   Пускане:  node tests/stock-returns-complaint-export.test.js .
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
    product_name: null, sap_code: null, quantity: null,
    order_number: null, purchase_order: null, id_euro: null, plant: null,
    doc_date: null, withdrawal_date: null, confirmed_date: null,
    expiry_date: null, status: 'pending', reason: null, courier_info: null,
    control_comment: null, controller_comment: null,
    diff_line_id: null, photos: [], created_by: 'Цветелина Тенева'
  }, o);
}

/* Редовете са като от многолистовия импорт: ERP полетата пълни, продукт/SAP празни.
   Редът в srData е нарочно разбъркан (заявката е по doc_date.desc). */
const ROWS = [
  row({ id: 'c-1', store_name: 'Раднево', purchase_order: '4200016266', id_euro: 'E-66',
        supplier: 'КАМ-04', doc_date: '2026-08-02', plant: '1210', status: 'taken',
        withdrawal_date: '2026-08-20', courier_info: 'Спиди 777', confirmed_date: '2026-08-21',
        control_comment: 'Проверено', controller_comment: 'Ок от контрольор' }),
  row({ id: 'c-2', store_name: 'Враца', purchase_order: '4200016001', id_euro: 'E-01',
        supplier: 'ТЕСИ ООД', doc_date: '2026-07-15', plant: '1203', status: 'pending' }),
  row({ id: 'c-3', store_name: 'Раднево', purchase_order: '4200015982', id_euro: 'E-82',
        supplier: 'АГРО', doc_date: '2026-06-30', plant: '1210', status: 'completed',
        withdrawal_date: '2026-07-10', courier_info: 'Еконт', confirmed_date: '2026-07-12',
        control_comment: 'Приключено', controller_comment: 'Потвърдено' }),
  row({ id: 'c-4', store_name: 'Враца', purchase_order: '4200015990', id_euro: 'E-90',
        supplier: 'КАМ-04', doc_date: '2026-06-01', plant: '1203', status: 'taken',
        withdrawal_date: '2026-06-05', courier_info: 'Транспорт ТеМАХ' })
];

const HEAD = ['НОВА ПВ-ЕВР', 'НОВА ИД-ЕВРО', 'Доставчик', 'Дата на документ', 'Завод', 'Статус',
  'Дата на изтегляне', 'Изтеглена с', 'Потвърдена акт.', 'Коментар', 'Коментар контролер'];
const EXTRA = ['Продукт', 'SAP', 'Кол.', 'Срок на годност', 'Причина'];
/* От 29.09.2026 най-накрая е „Коментар обект" (store_comment) — след 0–10 и 11+;
   импортът чете позиционно само 0–10. Виж sr-store-comment.test.js. */
const TAIL = ['Коментар обект'];

/* Какво „вече е в базата" при обратното качване — дедуп GET-ът пита с in.(…). */
function env(rows, existing) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: {
      stock_returns: (url) => {
        if (url.indexOf('purchase_order=in.') < 0) return JSON.parse(JSON.stringify(rows));
        return (existing || []).filter(r => url.indexOf(r.purchase_order) >= 0);
      },
      stock_differences: [], differences_reports: []
    }
  });
  h.w.srData = JSON.parse(JSON.stringify(rows));
  h.w.srTab = 'complaint';
  h.w.srFilter = 'all';
  h.w.srStoreFilter = '';
  h.w.srSupplierFilter = '';
  h.w.srSearch = '';

  /* SheetJS стъб: листът пази aoa-то. sheet_to_json с header:1 го връща
     обратно — точно договорът, на който разчита parseDiffReturnsWorkbook. */
  const cap = { files: [], aoas: [] };
  h.w.XLSX = {
    read: () => cap.files[cap.files.length - 1].wb,
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (aoa) => { cap.aoas.push(aoa); return { __aoa: aoa }; },
      book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; },
      sheet_to_json: (sheet, opt) => {
        if (opt && opt.header === 1) return sheet.__aoa;
        throw new Error('sheet_to_json без header:1 не се очаква по този път');
      }
    },
    writeFile: (wb, fname) => { cap.files.push({ wb: wb, fname: fname }); }
  };
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0);
    };
  };
  h.cap = cap;
  return h;
}

function exportNow(w, doc) {
  w.renderStockReturns();
  const b = btn(doc, '📥 Excel');
  if (!b) return false;
  realClick(w, b);
  return true;
}

const settle = () => new Promise(res => setTimeout(res, 60));
const sheetOf = (wb, name) => (wb.Sheets[name] || {}).__aoa;

(async function run() {

  section('а) Два магазина → два листа с номерата от SR_SHEET_TO_STORE');
  {
    const { w, doc, cap } = env(ROWS);
    if (ok('бутонът „📥 Excel" е на екрана и износът тръгва', guard('износ', () => exportNow(w, doc)) && cap.files.length === 1,
      'файлове: ' + cap.files.length)) {
      const wb = cap.files[0].wb;
      ok('листовете са „3" (Враца) и „21" (Раднево), в реда на номерата',
        wb.SheetNames.join('|') === '3|21', wb.SheetNames.join('|'));
      ok('SR_SHEET_TO_STORE наистина ги връща към магазините',
        w.SR_SHEET_TO_STORE['3'] === 'Враца' && w.SR_SHEET_TO_STORE['21'] === 'Раднево');
      ok('името на файла е същото като преди',
        /^za-vrashtane-reklamacii-vsichki-\d{4}-\d{2}-\d{2}\.xlsx$/.test(cap.files[0].fname),
        cap.files[0].fname);

      const r21 = sheetOf(wb, '21');
      ok('ред 1 са заглавията — без „ТеМАХ — …" над тях',
        r21[0].join('|') === HEAD.concat(TAIL).join('|'), r21[0].join('|'));
      ok('всеки лист има ред 1 = заглавия', wb.SheetNames.every(n => sheetOf(wb, n)[0][0] === 'НОВА ПВ-ЕВР'));
      ok('нито една клетка „ТеМАХ — …" никъде',
        !wb.SheetNames.some(n => JSON.stringify(sheetOf(wb, n)).indexOf('ТеМАХ —') >= 0));
      ok('без продукт/SAP в никой ред → 11 колони + „Коментар обект", без 11+',
        wb.SheetNames.every(n => sheetOf(wb, n).every(r => r.length === 12)));

      ok('„21" има двата реда на Раднево, по ПВ-ЕВР възходящо',
        r21.slice(1).map(r => r[0]).join('|') === '4200015982|4200016266',
        r21.slice(1).map(r => r[0]).join('|'));
      ok('„3" има двата реда на Враца, по ПВ-ЕВР възходящо',
        sheetOf(wb, '3').slice(1).map(r => r[0]).join('|') === '4200015990|4200016001',
        sheetOf(wb, '3').slice(1).map(r => r[0]).join('|'));

      const x = r21[2]; /* 4200016266 */
      ok('колони 0–10 са точно полетата на реда',
        JSON.stringify(x) === JSON.stringify(['4200016266', 'E-66', 'КАМ-04', '02.08.2026', '1210',
          'ВЗЕТА', '20.08.2026', 'Спиди 777', '21.08.2026', 'Проверено', 'Ок от контрольор', '']),
        JSON.stringify(x));
      ok('ПРИКЛЮЧЕНА с главни букви', r21[1][5] === 'ПРИКЛЮЧЕНА', JSON.stringify(r21[1][5]));
      const y = sheetOf(wb, '3')[2]; /* 4200016001, pending, без дати */
      ok('НЕВЗЕТА с главни букви', y[5] === 'НЕВЗЕТА', JSON.stringify(y[5]));
      ok('празните дати и текстове са празни клетки, не „—"',
        y[6] === '' && y[7] === '' && y[8] === '' && y[9] === '' && y[10] === '', JSON.stringify(y));
    }
  }

  section('б) Един ред с продукт/SAP → колони 11+ за целия файл');
  {
    const rows = ROWS.map(r => Object.assign({}, r));
    rows[1] = Object.assign({}, rows[1], { product_name: 'БОЯ ЛАТЕКС', sap_code: '55123', quantity: 12,
      expiry_date: '2026-12-31', reason: 'Изтекъл срок' });
    const { w, doc, cap } = env(rows);
    guard('износ', () => exportNow(w, doc));
    const wb = cap.files[0].wb;
    const s3 = sheetOf(wb, '3'), s21 = sheetOf(wb, '21');
    ok('заглавията са 11 + продукт, SAP, кол., срок, причина',
      s3[0].join('|') === HEAD.concat(EXTRA, TAIL).join('|'), s3[0].join('|'));
    ok('и в листа без такива редове колоните са същите (еднакъв формат)',
      s21[0].join('|') === s3[0].join('|'), s21[0].join('|'));
    const hit = s3.find(r => r[0] === '4200016001');
    ok('допълнителните полета са на място, срокът в дд.мм.гггг, количеството число',
      JSON.stringify(hit.slice(11, 16)) === JSON.stringify(['БОЯ ЛАТЕКС', '55123', 12, '31.12.2026', 'Изтекъл срок']),
      JSON.stringify(hit.slice(11, 16)));
    ok('колони 0–10 не са разместени от допълнителните', hit[0] === '4200016001' && hit[2] === 'ТЕСИ ООД',
      JSON.stringify(hit.slice(0, 3)));
    ok('ред без тях има празни клетки 11+', s21[1].slice(11).every(v => v === ''), JSON.stringify(s21[1].slice(11)));

    let back = null;
    guard('parseDiffReturnsWorkbook() не хвърля с колони 11+', () => { back = w.parseDiffReturnsWorkbook(wb); });
    ok('импортът ги игнорира — четирите реда се връщат', back && back.length === 4, JSON.stringify(back && back.length));
  }

  section('в) Кръг: износ → parseDiffReturnsWorkbook → същите полета');
  {
    const { w, doc, cap } = env(ROWS);
    guard('износ', () => exportNow(w, doc));
    let back = null;
    if (guard('parseDiffReturnsWorkbook() не хвърля', () => { back = w.parseDiffReturnsWorkbook(cap.files[0].wb); })) {
      ok('върнати са 4 реда', back.length === 4, String(back.length));
      const F = ['store_name', 'purchase_order', 'id_euro', 'supplier', 'doc_date', 'plant',
        'withdrawal_date', 'courier_info', 'confirmed_date', 'control_comment', 'controller_comment'];
      /* Импортът пише празното като '' (текст) или null (дата) — сравняваме през общ знаменател. */
      const norm = v => (v === null || v === undefined) ? '' : v;
      ROWS.forEach(src => {
        const b = back.find(x => x.purchase_order === src.purchase_order);
        if (!ok(src.purchase_order + ' е върнат', !!b)) return;
        const diff = F.filter(f => norm(b[f]) !== norm(src[f]));
        ok(src.purchase_order + ': всички 11 полета + магазин съвпадат', diff.length === 0,
          diff.map(f => f + ': ' + JSON.stringify(src[f]) + ' → ' + JSON.stringify(b[f])).join('; '));
        /* И трите, включително ПРИКЛЮЧЕНА → completed. Дали се прилага, решават
           правата в startReturnsImport (stock-returns-import-completed). */
        ok(src.purchase_order + ': статусът се връща (' + src.status + ')', b.status === src.status,
          JSON.stringify(b.status));
      });
    }
  }

  section('г) Обратно качване на изнесения файл: нищо не се пипа (само нови редове от 02.10.2026)');
  {
    const EXISTING = [
      { id: 'c-1', purchase_order: '4200016266', status: 'taken' },
      { id: 'c-2', purchase_order: '4200016001', status: 'pending' },
      { id: 'c-3', purchase_order: '4200015982', status: 'completed' },
      { id: 'c-4', purchase_order: '4200015990', status: 'taken' }
    ];
    const { w, doc, cap, calls } = env(ROWS, EXISTING);
    guard('износ', () => exportNow(w, doc));
    w.openReturnsImportModal();
    const inp = doc.getElementById('sr-import-file');
    Object.defineProperty(inp, 'files', { value: [{ name: 'export.xlsx' }], configurable: true });
    const b = btn(doc, 'Започни импорт');
    if (ok('бутонът „Започни импорт" е на екрана', !!b)) {
      realClick(w, b);
      await settle();
      const patches = calls.patch.filter(p => /stock_returns/.test(p.url));
      const posts = calls.post.filter(p => p.table === 'stock_returns');
      ok('нищо не е вмъкнато наново (всички ПВ-ЕВР са познати)', posts.length === 0,
        JSON.stringify(posts.map(p => p.body)));
      /* От 02.10.2026 импортът само добавя нови редове: изнесеният файл, качен
         обратно, не пипа нито един ред — и приключения, и останалите. */
      ok('нито един PATCH (и приключеният c-3, и другите три)', patches.length === 0,
        patches.map(p => p.url).join(' | '));
      const prog = (doc.getElementById('sr-import-progress') || {}).textContent || '';
      ok('обобщението казва „Пропуснати (вече в портала): 4"', prog.indexOf('Пропуснати (вече в портала): 4') >= 0, prog);
    }
  }

  section('д) Филтър по доставчик → само неговите редове и магазини');
  {
    const { w, doc, cap } = env(ROWS);
    w.srSupplierFilter = 'ТЕСИ ООД';
    guard('износ', () => exportNow(w, doc));
    const wb = cap.files[0].wb;
    ok('един лист — „3" (Враца)', wb.SheetNames.join('|') === '3', wb.SheetNames.join('|'));
    ok('един ред данни', sheetOf(wb, '3').length === 2, String(sheetOf(wb, '3').length));
    ok('името на файла носи доставчика',
      /^za-vrashtane-reklamacii-tesi-ood-\d{4}-\d{2}-\d{2}\.xlsx$/.test(cap.files[0].fname), cap.files[0].fname);
  }

  section('е) Магазин без номер в SR_SHEET_TO_STORE → лист с името му, накрая');
  {
    const rows = [ROWS[0], row({ id: 'c-9', store_name: 'Плевен', purchase_order: '4200019999', supplier: 'X' })];
    const { w, doc, cap } = env(rows);
    guard('износ', () => exportNow(w, doc));
    const wb = cap.files[0].wb;
    ok('листовете са „21" и „Плевен", непознатият накрая',
      wb.SheetNames.join('|') === '21|Плевен', wb.SheetNames.join('|'));
    ok('редът не е изгубен от износа', sheetOf(wb, 'Плевен')[1][0] === '4200019999');
    /* Известно ограничение, записано в коментара на exportSRExcel. */
    const back = w.parseDiffReturnsWorkbook(wb);
    ok('импортът прескача листа без номер (само Раднево се връща)',
      back.length === 1 && back[0].store_name === 'Раднево', JSON.stringify(back.map(x => x.store_name)));
  }

  report();
})();
