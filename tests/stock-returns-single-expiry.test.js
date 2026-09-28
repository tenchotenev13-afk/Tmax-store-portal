/* Единичен лист („рекламации / срок на годност"): срокът на годност минава
   през srParseFlexibleDate, не през изтритата srParseExcelDate.

   srParseExcelDate не познаваше Excel сериен номер (46236 → „+046235-12"),
   хвърляше при невалиден Date, а всичко, което подаваше на new Date(), четеше
   като местна полунощ и в България връщаше ДЕН ПО-РАНО („2026-08-17T00:00:00"
   → 2026-08-16). Многолистовият импорт вече ползва srParseFlexibleDate — сега
   и единичният.

   Целият път: „📤 Импорт от Excel" → файл → „Започни импорт" →
   parseDiffReturnsWorkbook не разпознава листа → parseComplaintReturnsSheet →
   POST към stock_returns.

   Пускане:  node tests/stock-returns-single-expiry.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

/* Лист с непознато име → многолистовият парсър връща [] и импортът минава
   към единичния. sheet_to_json в обектен режим: ред 1 са ключовете. */
function env(aoa) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI, confirm: true,
    data: { stock_returns: [], stock_differences: [], differences_reports: [] }
  });
  h.w.srData = []; h.w.srTab = 'complaint'; h.w.srFilter = 'all';
  h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  const WB = { SheetNames: ['Лист1'], Sheets: { 'Лист1': { __aoa: aoa } } };
  h.w.XLSX = {
    read: () => WB,
    utils: {
      sheet_to_json: (sheet, opt) => {
        const a = sheet.__aoa;
        if (opt && opt.header === 1) return a;
        const dv = (opt && 'defval' in opt) ? opt.defval : undefined;
        return a.slice(1).map(r => {
          const o = {};
          a[0].forEach((k, i) => { o[k] = (r[i] === undefined || r[i] === null) ? dv : r[i]; });
          return o;
        });
      }
    }
  };
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0);
    };
  };
  return h;
}
const settle = () => new Promise(res => setTimeout(res, 60));

async function runImport(h) {
  h.w.renderStockReturns();
  realClick(h.w, btn(h.doc.getElementById('mod-stock-returns'), '📤 Импорт от Excel'));
  const inp = h.doc.getElementById('sr-import-file');
  Object.defineProperty(inp, 'files', { value: [{ name: 'reklamacii.xlsx' }], configurable: true });
  realClick(h.w, btn(h.doc, 'Започни импорт'));
  await settle();
}
const inserted = h => {
  const out = [];
  h.calls.post.filter(p => p.table === 'stock_returns')
    .forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(b => out.push(b)));
  return out;
};

(async function run() {

  section('а) Срок на годност във всички форми през целия импорт');
  {
    const HEAD = ['Продукт', 'SAP', 'Количество', 'Магазин', 'Доставчик', 'Срок на годност', 'Причина'];
    const CASES = [
      ['П-ЧИСЛО', 46236, '2026-08-02', 'Excel сериен номер'],
      ['П-ТОЧКИ', '17.08.2026', '2026-08-17', 'текст дд.мм.гггг'],
      ['П-НАКЛ', '17/08/2026', '2026-08-17', 'текст дд/мм/гггг'],
      ['П-ISO-Ч', '2026-08-17T00:00:00', '2026-08-17', 'ISO с час — БЕЗ изместване с ден'],
      ['П-ГГГГ', '2026/08/17', '2026-08-17', 'гггг/мм/дд — БЕЗ изместване с ден'],
      ['П-ПРАЗ', '', null, 'празно'],
      ['П-БОКЛ', 'до края на месеца', null, 'боклук']
    ];
    const h = env([HEAD].concat(CASES.map(c => [c[0], '111', 2, 'Раднево', 'КАМ-04', c[1], 'изтекъл'])));
    await runImport(h);
    const rows = inserted(h);
    const prog = (h.doc.getElementById('sr-import-progress') || {}).innerHTML || '';
    ok('всички ' + CASES.length + ' реда са вмъкнати', rows.length === CASES.length,
      'брой: ' + rows.length + ' | ' + prog);
    ok('минали са през единичния формат (source=complaint, status=pending)',
      rows.every(r => r.source === 'complaint' && r.status === 'pending'));
    CASES.forEach(([prod, inp, exp, label]) => {
      const r = rows.find(x => x.product_name === prod);
      ok(label + ': ' + JSON.stringify(inp) + ' → ' + JSON.stringify(exp),
        r && r.expiry_date === exp, JSON.stringify(r && r.expiry_date));
    });
  }

  section('б) Без колона за срок → null, без грешка');
  {
    const h = env([['Продукт', 'Магазин'], ['П-1', 'Раднево']]);
    await runImport(h);
    const rows = inserted(h);
    ok('редът е вмъкнат с expiry_date = null', rows.length === 1 && rows[0].expiry_date === null,
      JSON.stringify(rows.map(r => r.expiry_date)));
  }

  section('в) srParseExcelDate вече я няма — едно място за дати');
  {
    const h = env([['Продукт']]);
    ok('srParseExcelDate не е дефинирана', typeof h.w.srParseExcelDate === 'undefined');
  }

  report();
})();
