/* „За връщане" → „По рекламации / срок на годност": импортът САМО ДОБАВЯ нови
   редове (Цвети, 02.10.2026). Заменя stock-returns-import-update.test.js,
   който заковаваше обратното (познат ПВ-ЕВР се обновяваше от файла).

   „Ще качвам само текущата седмица, за да не попълвам информация и на двете
   места" — статусите, датите, куриерът и коментарите се поддържат в портала.

   Многолистов файл (ключ ПВ-ЕВР = purchase_order):
     · ПВ-ЕВР, който вече е в портала → пропуснат, нито един PATCH (и празна
       клетка във файла не трие нищо);
     · ред без ПВ-ЕВР → пропуснат и показан поименно;
     · повторен ПВ-ЕВР във файла → един POST.
   Единичен лист (няма ПВ-ЕВР; решение на Тенчо от 02.10.2026): „същият ред" е
   магазин + SAP (без SAP — наименование) + срок на годност.
   Отчетът: „Нови · Пропуснати (вече в портала) · Пропуснати (без ПВ-ЕВР) ·
   Повторени във файла" — без „Обновени".
   Провалена проверка за съществуващите → нищо не се качва (иначе всичко
   става дубликат).

   Пускане:  node tests/stock-returns-import-new-only.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };

/* Многолистов: позиционни колони; лист „21" = Раднево. */
const HEAD_WB = ['НОВА ПВ-ЕВРО', 'НОВА ИД-ЕВРО', 'Доставчик', 'Дата документ', 'Завод',
  'Статус', 'Дата изтегляне', 'Изтеглена с', 'Потвърдена акт.', 'коментар Контролер', 'коментар Контролер'];
/* Единичен лист: заглавия по име, лист с непознато име. */
const HEAD_SS = ['Продукт', 'SAP', 'Количество', 'Магазин', 'Доставчик', 'Срок на годност', 'Причина'];

/* „Базата". Съществуващият многолистов ред е с попълнен куриер. */
const EXISTING_WB = [{ id: 'db-1', purchase_order: '4200000001', status: 'taken', courier_info: 'Спиди 777' }];
const EXISTING_SS = [{ id: 'db-s', store_name: 'Раднево', sap_code: '111', product_name: 'КИСЕЛО МЛЯКО', expiry_date: '2026-10-10' }];

function env(kind, aoa, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'], user: CVETI, confirm: true, fail: opts.fail,
    data: {
      stock_returns: (url) => {
        if (url.indexOf('purchase_order=in.') >= 0)
          return EXISTING_WB.filter(r => url.indexOf(r.purchase_order) >= 0);
        if (url.indexOf('expiry_date') >= 0) return EXISTING_SS.slice();
        return [];
      },
      stock_differences: [], differences_reports: []
    }
  });
  h.w.srData = []; h.w.srTab = 'complaint'; h.w.srFilter = 'all';
  h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  const name = kind === 'wb' ? '21' : 'Лист1';
  const WB = { SheetNames: [name], Sheets: { [name]: { __aoa: aoa } } };
  h.w.XLSX = {
    read: () => WB,
    utils: {
      sheet_to_json: (sheet, opt) => {
        const a = sheet.__aoa;
        if (opt && opt.header === 1) return kind === 'wb' ? a : [];
        const dv = (opt && 'defval' in opt) ? opt.defval : undefined;
        return a.slice(1).map(r => { const o = {}; a[0].forEach((k, i) => { o[k] = (r[i] === undefined || r[i] === null) ? dv : r[i]; }); return o; });
      }
    }
  };
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () { setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0); };
  };
  h.loads = 0;
  const realLoad = h.w.loadStockReturns;
  h.w.loadStockReturns = function () { h.loads++; return realLoad.apply(this, arguments); };
  return h;
}
async function runImport(h) {
  h.w.renderStockReturns();
  realClick(h.w, btn(h.doc.getElementById('mod-stock-returns'), '📤 Импорт от Excel'));
  const inp = h.doc.getElementById('sr-import-file');
  Object.defineProperty(inp, 'files', { value: [{ name: 'spisak.xlsx' }], configurable: true });
  realClick(h.w, btn(h.doc, 'Започни импорт'));
  await new Promise(res => setTimeout(res, 80));
}
const posted = h => {
  const out = [];
  h.calls.post.filter(p => p.table === 'stock_returns').forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(b => out.push(b)));
  return out;
};
const prog = h => (h.doc.getElementById('sr-import-progress') || {}).innerHTML || '';
const progText = h => (h.doc.getElementById('sr-import-progress') || {}).textContent || '';
const srPatches = h => h.calls.patch.filter(p => /stock_returns/.test(p.url));

/* ПВ, ИД, доставчик, дата док., завод, статус, дата изт., куриер, потв., коментар, коментар контр. */
const wbRow = (po, courier, name) => [po, 'ID', 'КАМ-04', '01.10.2026', '1200', 'НЕВЗЕТА', '', courier || '', '', '', name || ''];

(async function run() {

  section('1. Многолистов: 1 нов + 1 съществуващ → POST само за новия, нито един PATCH');
  {
    /* Съществуващият е с ПРАЗЕН куриер във файла — в портала е „Спиди 777". */
    const h = env('wb', [HEAD_WB, wbRow('4200000002', 'Еконт'), wbRow('4200000001', '')]);
    await runImport(h);
    const p = posted(h);
    ok('един POST-нат ред — новият', p.length === 1 && p[0].purchase_order === '4200000002', JSON.stringify(p.map(r => r.purchase_order)));
    ok('новият е с данните от файла (куриер Еконт, Раднево)', p[0] && p[0].courier_info === 'Еконт' && p[0].store_name === 'Раднево', JSON.stringify(p[0]));
    ok('нито един PATCH', srPatches(h).length === 0, JSON.stringify(srPatches(h).map(x => x.body)));
    ok('куриерът на съществуващия остава (празната клетка не трие нищо)',
      !h.calls.patch.some(x => x.body && 'courier_info' in x.body));
    ok('отчетът: Нови: 1 · Пропуснати (вече в портала): 1 · Пропуснати (без ПВ-ЕВР): 0 · Повторени във файла: 0',
      progText(h).indexOf('Нови: 1 · Пропуснати (вече в портала): 1 · Пропуснати (без ПВ-ЕВР): 0 · Повторени във файла: 0') >= 0, progText(h));
    ok('в отчета няма „Обновени"', progText(h).indexOf('Обновени') < 0);
    ok('модалът остава отворен; презареждане чак при затваряне', !!h.doc.getElementById('sr-import-progress') && h.loads === 0);
    realClick(h.w, btn(h.doc, 'Затвори'));
    ok('„Затвори" презарежда веднъж', h.loads === 1, String(h.loads));
    /* Презареждането е асинхронно — да свърши, преди прозорецът да се затвори. */
    await new Promise(res => setTimeout(res, 60));
    h.close();
  }

  section('2. Многолистов: ред без ПВ-ЕВР → пропуснат и отчетен поименно');
  {
    const h = env('wb', [HEAD_WB, wbRow('', 'Спиди', ''), wbRow('4200000003', '')]);
    await runImport(h);
    const p = posted(h);
    ok('POST само за реда с ПВ-ЕВР', p.length === 1 && p[0].purchase_order === '4200000003', JSON.stringify(p.map(r => r.purchase_order)));
    ok('отчетът: Пропуснати (без ПВ-ЕВР): 1', progText(h).indexOf('Пропуснати (без ПВ-ЕВР): 1') >= 0, progText(h));
    ok('и „Без ПВ-ЕВР (не са качени):" с наименование', /Без ПВ-ЕВР \(не са качени\): /.test(progText(h)), progText(h));
    h.close();
  }

  section('3. Многолистов: повторен ПВ-ЕВР във файла → един POST');
  {
    const h = env('wb', [HEAD_WB, wbRow('4200000004', 'А'), wbRow(' 4200000004 ', 'Б'), wbRow('4200000004', 'В')]);
    await runImport(h);
    const p = posted(h);
    ok('един POST-нат ред', p.length === 1 && p[0].purchase_order === '4200000004', JSON.stringify(p.map(r => [r.purchase_order, r.courier_info])));
    ok('влиза първият (куриер А)', p[0] && p[0].courier_info === 'А');
    ok('отчетът: Повторени във файла: 2', progText(h).indexOf('Повторени във файла: 2') >= 0, progText(h));
    h.close();
  }

  section('4. Многолистов: всичко вече е в портала → нищо не се качва, жълто');
  {
    const h = env('wb', [HEAD_WB, wbRow('4200000001', 'НОВ КУРИЕР')]);
    await runImport(h);
    ok('нито POST, нито PATCH', posted(h).length === 0 && srPatches(h).length === 0);
    ok('жълто „Няма нови редове" с отчета', /Няма нови редове/.test(progText(h)) && progText(h).indexOf('Пропуснати (вече в портала): 1') >= 0, progText(h));
    h.close();
  }

  section('5. Провалена проверка за съществуващите → нищо не се качва');
  {
    const h = env('wb', [HEAD_WB, wbRow('4200000002', 'Еконт')], { fail: { GET: /stock_returns/ } });
    await runImport(h);
    ok('нито един POST', posted(h).length === 0, JSON.stringify(posted(h)));
    ok('червено съобщение за проверката', /Грешка при проверка за дублирани/.test(progText(h)), progText(h));
    h.close();
  }

  section('6. Единичен лист: ключ магазин + SAP + срок на годност');
  {
    const h = env('ss', [HEAD_SS,
      ['КИСЕЛО МЛЯКО', '111', 2, 'Раднево', 'ДАНОН', '10.10.2026', 'изтича'],      /* вече в портала */
      ['КИСЕЛО МЛЯКО', '111', 1, 'Раднево', 'ДАНОН', '12.10.2026', 'изтича'],      /* друг срок → нов */
      ['СИРЕНЕ', '222', 3, 'Раднево', 'ДАНОН', '15.10.2026', 'изтича'],            /* нов */
      ['СИРЕНЕ', '222', 3, 'Раднево', 'ДАНОН', '2026-10-15', 'изтича'],            /* същият ден, друг запис → повтор */
      ['ХЛЯБ', '', 1, 'Раднево', 'ДОБРУДЖА', '05.10.2026', 'мухъл'],               /* без SAP → по наименование, нов */
      ['хляб', '', 1, 'Раднево', 'ДОБРУДЖА', '05.10.2026', 'мухъл']                /* същото име → повтор */
    ]);
    await runImport(h);
    const p = posted(h);
    ok('POST за 3 нови реда', p.length === 3, JSON.stringify(p.map(r => [r.product_name, r.sap_code, r.expiry_date])));
    ok('съществуващият (Раднево / 111 / 10.10.2026) не е качен',
      !p.some(r => r.sap_code === '111' && r.expiry_date === '2026-10-10'));
    ok('същият SAP с друг срок е качен', p.some(r => r.sap_code === '111' && r.expiry_date === '2026-10-12'));
    ok('нито един PATCH', srPatches(h).length === 0);
    ok('отчетът: Нови: 3 · Пропуснати (вече в портала): 1 · Пропуснати (без ПВ-ЕВР): 0 · Повторени във файла: 2',
      progText(h).indexOf('Нови: 3 · Пропуснати (вече в портала): 1 · Пропуснати (без ПВ-ЕВР): 0 · Повторени във файла: 2') >= 0, progText(h));
    h.close();
  }

  section('7. srSingleSheetKey');
  {
    const h = env('ss', [HEAD_SS]);
    const k = h.w.srSingleSheetKey;
    ok('ред от файла и запис от базата дават един ключ',
      k({ store_name: 'Раднево ', sap_code: ' 111', expiry_date: '2026-10-10' }) === k({ store_name: 'Раднево', sap_code: '111', expiry_date: '2026-10-10T00:00:00' }));
    ok('без SAP — по наименование, без значение главни/малки',
      k({ store_name: 'А', product_name: 'хляб', expiry_date: null }) === k({ store_name: 'А', product_name: 'ХЛЯБ ', expiry_date: '' }));
    ok('различен срок → различен ключ',
      k({ store_name: 'А', sap_code: '1', expiry_date: '2026-10-10' }) !== k({ store_name: 'А', sap_code: '1', expiry_date: '2026-10-11' }));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
