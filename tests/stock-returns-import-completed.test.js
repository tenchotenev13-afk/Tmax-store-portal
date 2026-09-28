/* Импорт „Обобщен списък": „ПРИКЛЮЧЕНА" се разпознава — с правата от модала.

   Досега parseDiffReturnsWorkbook познаваше само ВЗЕТА/НЕВЗЕТА и четеше
   „ПРИКЛЮЧЕНА" (която нашият износ вече пише) като 'pending'. Ред, отворен
   наново или изтрит между износа и качването, се връщаше като „невзета".

   Сега:
     · „ПРИКЛЮЧ…" → 'completed', но само за canCompleteSR() (както в модала);
     · без това право: нов ред влиза като 'taken', съществуващ си пази
       статуса (останалите полета се обновяват), броят се показва;
     · приключен в портала ред не се пипа — както досега.

   Всичко минава през целия startReturnsImport: бутон „📤 Импорт от Excel" →
   файл → „Започни импорт" → дедуп GET → POST / PATCH.

   Пускане:  node tests/stock-returns-import-completed.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn } = H;

/* canCompleteSR(): admin или c.teneva@temax.bg. logistics може да импортира
   (canAddSR), но не и да приключва. */
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const LOGI = { email: 'logi@temax.bg', display_name: 'Логистик',
  role: 'logistics', store_name: 'Централен офис', assigned_stores: [] };

const HEAD = ['НОВА ПВ-ЕВР', 'НОВА ИД-ЕВРО', 'Доставчик', 'Дата на документ', 'Завод', 'Статус',
  'Дата на изтегляне', 'Изтеглена с', 'Потвърдена акт.', 'Коментар', 'Коментар контролер'];
const line = (po, status, courier) => [po, 'E-' + po.slice(-2), 'КАМ-04', '02.08.2026', '1210', status,
  '20.08.2026', courier || 'Спиди', '21.08.2026', 'коментар ' + po, ''];

function env(user, existing, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true,
    data: {
      stock_returns: (url) => url.indexOf('purchase_order=in.') < 0
        ? JSON.parse(JSON.stringify(opts.rows || []))
        : (existing || []).filter(r => url.indexOf(r.purchase_order) >= 0),
      stock_differences: [], differences_reports: []
    }
  });
  h.w.srData = JSON.parse(JSON.stringify(opts.rows || []));
  h.w.srTab = 'complaint'; h.w.srFilter = 'all';
  h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  h.cap = { files: [] };
  h.w.XLSX = {
    read: () => h.WB || h.cap.files[h.cap.files.length - 1].wb,
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: (aoa) => ({ __aoa: aoa }),
      book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; },
      sheet_to_json: (sheet, o) => {
        if (o && o.header === 1) return sheet.__aoa;
        throw new Error('sheet_to_json без header:1 не се очаква тук');
      }
    },
    writeFile: (wb, fname) => { h.cap.files.push({ wb: wb, fname: fname }); }
  };
  h.w.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0);
    };
  };
  return h;
}
const sheet21 = rows => ({ SheetNames: ['21'], Sheets: { '21': { __aoa: [HEAD].concat(rows) } } });
const settle = () => new Promise(res => setTimeout(res, 60));

/* Истинският път през бутоните. */
async function runImport(h) {
  h.w.renderStockReturns();
  const open = btn(h.doc.getElementById('mod-stock-returns'), '📤 Импорт от Excel');
  if (!open) throw new Error('няма бутон „📤 Импорт от Excel"');
  realClick(h.w, open);
  const inp = h.doc.getElementById('sr-import-file');
  Object.defineProperty(inp, 'files', { value: [{ name: 'obobshten.xlsx' }], configurable: true });
  const go = btn(h.doc, 'Започни импорт');
  if (!go) throw new Error('няма бутон „Започни импорт"');
  realClick(h.w, go);
  await settle();
}
const posts = h => {
  const out = [];
  h.calls.post.filter(p => p.table === 'stock_returns')
    .forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(b => out.push(b)));
  return out;
};
const patchFor = (h, id) => h.calls.patch.find(p => /stock_returns/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);
const prog = h => (h.doc.getElementById('sr-import-progress') || {}).innerHTML || '';

(async function run() {

  section('а) С право (Цвети): ПРИКЛЮЧЕНА → completed — и за нов, и за съществуващ');
  {
    const h = env(CVETI, [{ id: 'db-1', purchase_order: '4200000001', status: 'taken' }]);
    ok('canCompleteSR() е true', h.w.canCompleteSR() === true);
    h.WB = sheet21([line('4200000001', 'ПРИКЛЮЧЕНА'), line('4200000002', 'ПРИКЛЮЧЕНА')]);
    await runImport(h);
    const n = posts(h).find(b => b.purchase_order === '4200000002');
    ok('новият е вмъкнат като completed', n && n.status === 'completed', JSON.stringify(n && n.status));
    const p = patchFor(h, 'db-1');
    ok('съществуващият taken става completed', p && p.body.status === 'completed', JSON.stringify(p && p.body));
    ok('няма предупреждение за права', prog(h).indexOf('без право') < 0, prog(h));
  }

  section('б) Без право (logistics): нов → taken, съществуващ пази статуса, броят се вижда');
  {
    const h = env(LOGI, [{ id: 'db-1', purchase_order: '4200000001', status: 'taken' },
                         { id: 'db-3', purchase_order: '4200000003', status: 'pending' }]);
    ok('canCompleteSR() е false', h.w.canCompleteSR() === false);
    h.WB = sheet21([line('4200000001', 'ПРИКЛЮЧЕНА', 'Еконт 777'), line('4200000002', 'ПРИКЛЮЧЕНА'),
                    line('4200000003', 'ПРИКЛЮЧЕНА')]);
    await runImport(h);
    const n = posts(h).find(b => b.purchase_order === '4200000002');
    ok('новият е вмъкнат като taken', n && n.status === 'taken', JSON.stringify(n && n.status));
    const p1 = patchFor(h, 'db-1');
    if (ok('има PATCH за съществуващия taken', !!p1)) {
      ok('PATCH-ът НЕ носи status', !Object.prototype.hasOwnProperty.call(p1.body, 'status'), JSON.stringify(p1.body));
      ok('другите полета се обновяват (куриер)', p1.body.courier_info === 'Еконт 777', JSON.stringify(p1.body.courier_info));
    }
    const p3 = patchFor(h, 'db-3');
    ok('съществуващ pending също не става completed (няма status)',
      p3 && !Object.prototype.hasOwnProperty.call(p3.body, 'status'), JSON.stringify(p3 && p3.body));
    const t = prog(h);
    ok('обобщението показва общия брой: 3', t.indexOf('без право да приключваш: 3') >= 0, t);
    ok('и разбивката: 1 нов, 2 съществуващи',
      t.indexOf('вмъкнати като „Взета": 1') >= 0 && t.indexOf('със запазен статус: 2') >= 0, t);
  }

  section('в) Приключен в портала + файл с НЕВЗЕТА → не се пипа (и за двамата)');
  {
    for (const u of [CVETI, LOGI]) {
      const h = env(u, [{ id: 'db-9', purchase_order: '4200000009', status: 'completed' }]);
      h.WB = sheet21([line('4200000009', 'НЕВЗЕТА'), line('4200000010', 'НЕВЗЕТА')]);
      await runImport(h);
      ok(u.role + ': няма PATCH за приключения', !patchFor(h, 'db-9'),
        JSON.stringify(h.calls.patch.map(p => p.url)));
      ok(u.role + ': обобщението брои 1 пропуснат приключен',
        prog(h).indexOf('Пропуснати (приключени): 1') >= 0, prog(h));
    }
  }

  section('г) ВЗЕТА / НЕВЗЕТА / непознат текст — както преди');
  {
    const h = env(LOGI, []);
    const wb = sheet21([line('4200000011', 'ВЗЕТА'), line('4200000012', 'НЕВЗЕТА'),
                        line('4200000013', 'взета'), line('4200000014', ''),
                        line('4200000015', 'нещо друго'), line('4200000016', 'Приключена')]);
    const rows = h.w.parseDiffReturnsWorkbook(wb);
    const st = {}; rows.forEach(r => { st[r.purchase_order] = r.status; });
    ok('ВЗЕТА → taken', st['4200000011'] === 'taken', st['4200000011']);
    ok('НЕВЗЕТА → pending (не taken)', st['4200000012'] === 'pending', st['4200000012']);
    ok('малки букви „взета" → taken', st['4200000013'] === 'taken', st['4200000013']);
    ok('празно → pending', st['4200000014'] === 'pending', st['4200000014']);
    ok('непознат текст → pending', st['4200000015'] === 'pending', st['4200000015']);
    ok('„Приключена" (малки) → completed', st['4200000016'] === 'completed', st['4200000016']);
  }

  section('д) Кръг: износ → импорт запазва completed при право');
  {
    const R = (o) => Object.assign({ source: 'complaint', store_name: 'Раднево', supplier: 'КАМ-04',
      id_euro: 'E', plant: '1210', doc_date: '2026-08-02', withdrawal_date: '2026-08-20',
      courier_info: 'Спиди', confirmed_date: null, control_comment: '', controller_comment: '',
      photos: [], product_name: null, sap_code: null, quantity: null, expiry_date: null, reason: null }, o);
    const rows = [R({ id: 'x-1', purchase_order: '4200000021', status: 'completed' }),
                  R({ id: 'x-2', purchase_order: '4200000022', status: 'taken' })];
    /* Базата при качването: x-1 е отворен наново (taken), x-2 е изтрит. */
    const h = env(CVETI, [{ id: 'x-1', purchase_order: '4200000021', status: 'taken' }], { rows });
    h.w.renderStockReturns();
    realClick(h.w, btn(h.doc, '📥 Excel'));
    if (ok('износът е записан', h.cap.files.length === 1)) {
      ok('в листа пише ПРИКЛЮЧЕНА', h.cap.files[0].wb.Sheets['21'].__aoa[1][5] === 'ПРИКЛЮЧЕНА',
        JSON.stringify(h.cap.files[0].wb.Sheets['21'].__aoa[1]));
      await runImport(h);
      const p = patchFor(h, 'x-1');
      ok('отвореният наново ред се връща като completed, не като pending',
        p && p.body.status === 'completed', JSON.stringify(p && p.body.status));
      const n = posts(h).find(b => b.purchase_order === '4200000022');
      ok('изтритият се вмъква като taken (както е бил)', n && n.status === 'taken', JSON.stringify(n && n.status));
    }
  }

  report();
})();
