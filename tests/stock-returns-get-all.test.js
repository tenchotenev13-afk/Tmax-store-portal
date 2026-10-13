/* „За връщане" (stock-returns.js) — четенията на stock_returns на страници
   (лимит 1000, стъпка 4).

   PostgREST реже на 1000 реда без грешка. На 13.10.2026 stock_returns е 627
   (472 рекламации, 155 по разлики) и расте с ~100 на месец. Отрязана проверка
   за дубликати при импорт е най-опасното: ред, който е в базата, но не е
   прочетен, се качва втори път.

   Покрива:
     1. Импорт на рекламации (единичен лист): 1001 съществуващи, ред във
        файла съвпада с №1001 → засечен като дубликат, НЕ се качва; новият
        ред се качва.
     2. Провал на втора страница при проверката → импортът спира с червена
        грешка „Непълна проверка за дубликати“, 0 POST-а.
     3. loadStockReturns: 1001 реда → всички в srData, order с id tiebreaker;
        провал → червен ред „Непълни данни“ над таблицата + toast.

   Мутационна проверка (13.10.2026), всеки мутант пуснат срещу този тест:
     - дедупликацията (единичен лист) обратно на sbGetOk      — СЪБОРЕН (4 ❌)
     - махнат throw при .partial в дедупликацията             — СЪБОРЕН (2 ❌)
     - махнат ,id.desc в loadStockReturns                     — СЪБОРЕН (1 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/stock-returns-get-all.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const HEAD_SS = ['Продукт', 'SAP', 'Количество', 'Магазин', 'Доставчик', 'Срок на годност', 'Причина'];

/* 1001 рекламации в „базата“: Раднево / S0…S1000 / срок 10.10.2026. */
const EXISTING = [];
for (let i = 0; i < 1001; i++) {
  EXISTING.push({ id: 'db-' + String(100000 + i), source: 'complaint', store_name: 'Раднево',
    sap_code: 'S' + i, product_name: 'АРТИКУЛ ' + i, expiry_date: '2026-10-10',
    status: 'pending', doc_date: '2026-10-01', supplier: 'ДАНОН' });
}

function pager(rows) {
  return function (url) {
    const u = decodeURIComponent(String(url));
    const off = +((u.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const lim = +((u.match(/[?&]limit=(\d+)/) || [])[1] || 1000);
    return rows.slice(off, off + Math.min(lim, 1000));
  };
}
function failAt(offset) {
  return { GET: function (url) {
    const u = decodeURIComponent(String(url));
    if (u.indexOf('/stock_returns?') < 0) return null;
    const off = (u.match(/[?&]offset=(\d+)/) || [])[1];
    return off !== undefined && +off === offset ? { status: 500, body: { message: 'boom' } } : null;
  } };
}

function env(aoa, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'], user: CVETI, confirm: true, fail: opts.fail,
    data: { stock_returns: pager(EXISTING), stock_differences: [], differences_reports: [] }
  });
  h.w.srData = []; h.w.srTab = 'complaint'; h.w.srFilter = 'all';
  h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  const WB = { SheetNames: ['Лист1'], Sheets: { 'Лист1': { __aoa: aoa || [HEAD_SS] } } };
  h.w.XLSX = {
    read: () => WB,
    utils: {
      sheet_to_json: (sheet, opt) => {
        const a = sheet.__aoa;
        if (opt && opt.header === 1) return [];
        const dv = (opt && 'defval' in opt) ? opt.defval : undefined;
        return a.slice(1).map(r => { const o = {}; a[0].forEach((k, i) => { o[k] = (r[i] === undefined || r[i] === null) ? dv : r[i]; }); return o; });
      }
    }
  };
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () { setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0); };
  };
  return h;
}
async function runImport(h) {
  h.w.renderStockReturns();
  realClick(h.w, btn(h.doc.getElementById('mod-stock-returns'), '📤 Импорт от Excel'));
  const inp = h.doc.getElementById('sr-import-file');
  Object.defineProperty(inp, 'files', { value: [{ name: 'spisak.xlsx' }], configurable: true });
  realClick(h.w, btn(h.doc, 'Започни импорт'));
  await new Promise(res => setTimeout(res, 120));
}
const posted = h => {
  const out = [];
  h.calls.post.filter(p => p.table === 'stock_returns').forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(b => out.push(b)));
  return out;
};
const progText = h => (h.doc.getElementById('sr-import-progress') || {}).textContent || '';
const srGets = h => h.calls.get.filter(u => u.indexOf('/stock_returns?') >= 0);

const FILE = [HEAD_SS,
  ['АРТИКУЛ 1000', 'S1000', 1, 'Раднево', 'ДАНОН', '10.10.2026', 'изтича'],  /* = ред №1001 в базата */
  ['НОВ АРТИКУЛ', 'NEW1', 1, 'Раднево', 'ДАНОН', '10.10.2026', 'изтича']     /* нов */
];

(async function run() {

  section('1. Импорт на рекламации: ред №1001 от базата е засечен като дубликат');
  {
    const h = env(FILE);
    await runImport(h);
    const g = srGets(h).filter(u => decodeURIComponent(u).indexOf('expiry_date') >= 0);
    ok('проверката е на две страници с order=id.asc', g.length === 2 && g.every(u => /order=id\.asc/.test(decodeURIComponent(u))),
       g.length + ' | ' + g.join(' | '));
    const p = posted(h);
    ok('S1000 (ред №1001) НЕ е качен', !p.some(r => r.sap_code === 'S1000'), JSON.stringify(p.map(r => r.sap_code)));
    ok('новият (NEW1) е качен', p.length === 1 && p[0].sap_code === 'NEW1', JSON.stringify(p.map(r => r.sap_code)));
    ok('отчетът: Нови: 1 · Пропуснати (вече в портала): 1', progText(h).indexOf('Нови: 1 · Пропуснати (вече в портала): 1') >= 0, progText(h));
    h.close();
  }

  section('2. Провал на втора страница при проверката → импортът спира');
  {
    const h = env(FILE, { fail: failAt(1000) });
    await runImport(h);
    ok('0 POST-а', posted(h).length === 0, JSON.stringify(posted(h).map(r => r.sap_code)));
    ok('червено „Непълна проверка за дубликати: прочетени 1000 реда“',
       /Грешка при проверка за дублирани: Непълна проверка за дубликати: прочетени 1000 реда/.test(progText(h)), progText(h));
    h.close();
  }

  section('3. loadStockReturns: 1001 реда → всички; провал → червен ред');
  {
    let h = env();
    h.w.loadStockReturns();
    await new Promise(res => setTimeout(res, 80));
    const g = srGets(h).filter(u => /order=doc_date/.test(decodeURIComponent(u)));
    ok('две страници, order=doc_date.desc,id.desc', g.length === 2 && g.every(u => decodeURIComponent(u).indexOf('order=doc_date.desc,id.desc') >= 0),
       g.length + ' | ' + g.join(' | '));
    ok('srData = 1001', h.w.srData.length === 1001, 'реално: ' + h.w.srData.length);
    const txt = h.doc.getElementById('mod-stock-returns').textContent;
    ok('„1001 от 1001 записа.“ на екрана', txt.indexOf('1001 от 1001 записа.') >= 0, txt.slice(-200));
    ok('без „Непълни данни“', txt.indexOf('Непълни данни') < 0);
    h.close();

    h = env(null, { fail: failAt(1000) });
    h.w.loadStockReturns();
    await new Promise(res => setTimeout(res, 80));
    const t2 = h.doc.getElementById('mod-stock-returns').textContent;
    ok('провал → червен ред „Непълни данни — прочетени 1000 реда“', t2.indexOf('Непълни данни — прочетени 1000 реда') >= 0, t2.slice(0, 300));
    ok('данните все пак се показват (1000)', h.w.srData.length === 1000 && t2.indexOf('1000 от 1000 записа.') >= 0, 'srData: ' + h.w.srData.length);
    ok('и toast', h.calls.toast.some(t => t.indexOf('Непълни данни — За връщане: прочетени 1000') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  report();
})();
