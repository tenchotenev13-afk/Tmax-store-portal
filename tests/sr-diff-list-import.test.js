/* „За връщане" → „По разлики": импорт на „Стока за изтегляне по разлики".
   (29.09.2026.)

   Формат: листове с номерата от SR_SHEET_TO_STORE; ред 1 = заглавия (по име,
   trim, без значение от главни/малки); бележка H — колоната след „КОМЕНТАР"
   (често без заглавие).
     · обновяване вместо дубликат: магазин + поръчка + SAP; без поръчка —
       магазин + SAP + наименование; приключените не се пипат; липсващите във
       файла не се пипат;
     · статус от G — „невзет" ПРЕДИ „взет"; „заприход/изхвърл/прието при" →
       completed само при canCompleteSR, иначе taken;
     · G + H → store_comment; control_comment / controller_comment — никога;
     · доставчик: пълното име от базата (точно едно с правна форма, или единствено);
     · дати: srParseFlexibleDate, нечетими → null и брой в обобщението;
     · „По рекламации" — без промяна (минава по стария път).
   Данните са в самия тест — без git история и без истинския файл.

   Пускане:  node tests/sr-diff-list-import.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const LOGI = { email: 'logi@temax.bg', display_name: 'Логистик', role: 'logistics',
  store_name: 'Централен офис', assigned_stores: [] };

const HEAD = ['ДОСТАВЧИК', 'МАТЕРИАЛ', 'НАИМЕНОВАНИЕ', 'КОЛИЧЕСТВО', 'ПОРЪЧКА', 'ДАТА НА ПОТВЪРДЕНА АКТУАЛИЗАЦИЯ', 'КОМЕНТАР '];
const DB_SUPPLIERS = ['ЕЛМАК', 'ЕЛМАК ЕООД', 'ДЕНИКОМ ЕООД', 'ТЕКРА  ЕООД', 'ТЕКРА ЕООД', 'ВИТО'].map(s => ({ supplier: s }));

/* Лист „21" = Раднево, „3" = Враца. */
const WB = () => ({
  SheetNames: ['Обяснение', '21', '3'],
  Sheets: {
    'Обяснение': { __aoa: [['Обяснение:', ''], ['някакъв текст']] },
    '21': { __aoa: [
      HEAD,
      ['ЕЛМАК', 20923, 'ЦИРКУЛЯР', 1, 4100141066, '02.09.2026', 'НЕВЗЕТА', 'НЕ Е ЛИ ИЗТЕГЛЕН???'],   /* обновява ex-1 */
      ['ДЕНИКОМ', '88749.0', 'ПЛИК', 4, 4100167424, 46267, 'Спиди 1234'],                       /* нов */
      ['ТЕКРА', 18873, 'СКОБА', 1, '', '23,09,2026', 'тук е'],                                    /* без поръчка → ex-2 */
      ['ВИТО', 111, 'ЗАПРИХОДЕНО', 2, 4100000001, '16.09.226', 'заприходено'],                    /* нов, нечетима дата */
      ['НЕПОЗНАТ ДОСТАВЧИК', 222, 'ИЗХВЪРЛЕНО', 1, 4100000002, '09/232026', 'изхвърлена'],       /* нов, нечетима дата */
      ['ВИТО', 333, 'ПРИКЛЮЧЕН В ПОРТАЛА', 1, 4100000003, '', 'взета'],                           /* ex-3 completed */
      ['', '', '', '', '', '', ''],                                                                /* празен */
      ['ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС!', '', '', '', '', '', '']                      /* банер */
    ] },
    '3': { __aoa: [
      ['доставчик', 'материал', 'наименование', 'количество', 'поръчка', 'дата на потвърдена актуализация', 'коментар'],
      ['ЕЛМАК', 444, 'РАЗНИ', 3, 4100000004, '', 'не е взета'],
      ['ЕЛМАК', 555, 'ДРУГИ', 3, 4100000005, '', 'приготвени'],
      ['ЕЛМАК', 666, 'ПРИЕТИ', 3, 4100000006, '', 'Прието при нас']
    ] }
  }
});
/* Съществуващите в „По разлики". ex-4 го няма във файла → не се пипа. */
const EXISTING = [
  { id: 'ex-1', store_name: 'Раднево', order_number: '4100141066', sap_code: '20923', product_name: 'ЦИРКУЛЯР', status: 'taken' },
  { id: 'ex-2', store_name: 'Раднево', order_number: null, sap_code: '18873', product_name: 'СКОБА', status: 'pending' },
  { id: 'ex-3', store_name: 'Раднево', order_number: '4100000003', sap_code: '333', product_name: 'ПРИКЛЮЧЕН В ПОРТАЛА', status: 'completed' },
  { id: 'ex-4', store_name: 'Раднево', order_number: '4199999999', sap_code: '999', product_name: 'НЯМА ГО ВЪВ ФАЙЛА', status: 'pending' }
];

async function runImport(user, tab, wbOverride) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'], user: user, confirm: true,
    data: {
      stock_returns: url => {
        if (url.indexOf('select=supplier') >= 0) return DB_SUPPLIERS;
        if (url.indexOf('source=eq.diff') >= 0) return EXISTING;
        if (url.indexOf('purchase_order=in.') >= 0) return [];
        return [];
      },
      stock_differences: [], differences_reports: []
    }
  });
  h.w.srData = []; h.w.srTab = tab; h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
  const wb = wbOverride || WB();
  h.w.XLSX = { read: () => wb, utils: { sheet_to_json: (s, o) => {
    if (o && o.header === 1) return s.__aoa;
    const a = s.__aoa, dv = o && 'defval' in o ? o.defval : undefined;
    return a.slice(1).map(r => { const x = {}; a[0].forEach((k, i) => { x[k] = r[i] === undefined ? dv : r[i]; }); return x; });
  } } };
  h.w.FileReader = function () { const self = this; this.readAsArrayBuffer = function () {
    setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0); }; };
  h.spy = { diffList: 0 };
  const real = h.w.srImportDiffList;
  h.w.srImportDiffList = function () { h.spy.diffList++; return real.apply(this, arguments); };
  h.w.renderStockReturns();
  const b = btn(h.doc.getElementById('mod-stock-returns'), '📤 Импорт от Excel');
  h.hasBtn = !!b;
  if (b) {
    realClick(h.w, b);
    const inp = h.doc.getElementById('sr-import-file');
    Object.defineProperty(inp, 'files', { value: [{ name: 'razliki.xlsx' }], configurable: true });
    realClick(h.w, btn(h.doc, 'Започни импорт'));
    await new Promise(res => setTimeout(res, 80));
  }
  h.ins = [];
  h.calls.post.filter(p => p.table === 'stock_returns').forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(x => h.ins.push(x)));
  h.upd = id => h.calls.patch.find(p => /stock_returns/.test(p.url) && p.url.indexOf('id=eq.' + id) >= 0);
  h.prog = (h.doc.getElementById('sr-import-progress') || {}).innerHTML || '';
  return h;
}
const byName = (h, n) => h.ins.find(r => r.product_name === n);

(async function run() {

  section('0. srDiffListStatus — „невзет" преди „взет"');
  {
    const h = boot({ modules: ['stock-returns.js'], user: CVETI, data: {} });
    const f = h.w.srDiffListStatus;
    [['НЕВЗЕТА', true, 'pending'], ['невзето', true, 'pending'], ['не взето', true, 'pending'], ['не е взета', true, 'pending'],
     ['Тук е', true, 'pending'], ['  тук е ', true, 'pending'], ['взета', true, 'taken'], ['Спиди 1234', true, 'taken'],
     ['Еконт', true, 'taken'], ['изпратена', true, 'taken'], ['върната', true, 'taken'],
     ['заприходено', true, 'completed'], ['заприходено', false, 'taken'], ['изхвърлена', true, 'completed'],
     ['изхвърлена', false, 'taken'], ['прието при нас', true, 'completed'], ['приготвени', true, 'pending'],
     ['', true, 'pending'], [null, true, 'pending'], ['изпращай', true, 'pending']]
      .forEach(([t, c, exp]) => ok(JSON.stringify(t) + (c ? '' : ' (без право)') + ' → ' + exp, f(t, c) === exp, f(t, c)));
    ok('srSupplierNorm: „ЕЛМАК ЕООД" = „ЕЛМАК"', h.w.srSupplierNorm('ЕЛМАК ЕООД') === 'ЕЛМАК' && h.w.srSupplierNorm('Елмак') === 'ЕЛМАК');
    ok('srSupplierNorm: „ДИКСИ - ООД" = „ДИКСИ"', h.w.srSupplierNorm('ДИКСИ - ООД') === 'ДИКСИ');
    ok('srSupplierNorm: „ЕТЕРНА" не губи „ЕТ" от думата', h.w.srSupplierNorm('ЕТЕРНА ЕТ') === 'ЕТЕРНА');
    h.close();
  }

  section('а) Цвети: целият импорт в „По разлики"');
  {
    const h = await runImport(CVETI, 'diff');
    ok('бутонът „📤 Импорт от Excel" е и в „По разлики"', h.hasBtn);
    ok('минава по новия път (srImportDiffList)', h.spy.diffList === 1);
    ok('вмъкнати: 6 (3 от „21" + 3 от „3"; без банера, празния, обновените и приключения)', h.ins.length === 6,
      String(h.ins.length) + ' ' + JSON.stringify(h.ins.map(r => r.product_name)));
    ok('всички вмъкнати са source=diff', h.ins.every(r => r.source === 'diff'));
    ok('банерът не е вмъкнат', !h.ins.some(r => /ЗАПРИХОЖДАВАТЕ/.test(r.supplier || '')));
    ok('„Обяснение" е прескочен', !h.ins.some(r => r.supplier === 'някакъв текст'));

    const p = byName(h, 'ПЛИК');
    ok('SAP „88749.0" → „88749" (текст)', p && p.sap_code === '88749', JSON.stringify(p && p.sap_code));
    ok('поръчка 4100167424 → текст', p && p.order_number === '4100167424', JSON.stringify(p && p.order_number));
    ok('Excel дата 46267 → 2026-09-02', p && p.confirmed_date === '2026-09-02', JSON.stringify(p && p.confirmed_date));
    ok('„Спиди 1234" → taken', p && p.status === 'taken');
    ok('доставчик „ДЕНИКОМ" → „ДЕНИКОМ ЕООД"', p && p.supplier === 'ДЕНИКОМ ЕООД', JSON.stringify(p && p.supplier));
    ok('store_comment = G', p && p.store_comment === 'Спиди 1234', JSON.stringify(p && p.store_comment));

    const z = byName(h, 'ЗАПРИХОДЕНО');
    ok('„заприходено" при Цвети → completed', z && z.status === 'completed', JSON.stringify(z && z.status));
    ok('нечетима дата „16.09.226" → null', z && z.confirmed_date === null);
    ok('„ВИТО" (единствено в базата) → „ВИТО"', z && z.supplier === 'ВИТО');
    const x = byName(h, 'ИЗХВЪРЛЕНО');
    ok('„изхвърлена" при Цвети → completed', x && x.status === 'completed');
    ok('нечетима „09/232026" → null', x && x.confirmed_date === null);
    ok('непознат доставчик остава с името от файла', x && x.supplier === 'НЕПОЗНАТ ДОСТАВЧИК');

    ok('„не е взета" → pending', byName(h, 'РАЗНИ').status === 'pending');
    ok('„приготвени" → pending', byName(h, 'ДРУГИ').status === 'pending');
    ok('„Прието при нас" при Цвети → completed', byName(h, 'ПРИЕТИ').status === 'completed');
    ok('лист „3" → Враца; доставчик „ЕЛМАК" → „ЕЛМАК ЕООД" (едното с правна форма)',
      byName(h, 'РАЗНИ').store_name === 'Враца' && byName(h, 'РАЗНИ').supplier === 'ЕЛМАК ЕООД');
    ok('в НИТО ЕДИН запис няма control_comment / controller_comment',
      h.ins.every(r => !('control_comment' in r) && !('controller_comment' in r)));
    ok('всички вмъкнати са с еднакви ключове (PostgREST партида)',
      h.ins.every(r => Object.keys(r).sort().join() === Object.keys(h.ins[0]).sort().join()));

    const u1 = h.upd('ex-1');
    if (ok('ex-1 (магазин + поръчка + SAP) се ОБНОВЯВА, не се дублира', !!u1 && !h.ins.some(r => r.product_name === 'ЦИРКУЛЯР'))) {
      ok('ex-1: НЕВЗЕТА → pending (не taken)', u1.body.status === 'pending', u1.body.status);
      ok('ex-1: store_comment = G · H', u1.body.store_comment === 'НЕВЗЕТА · НЕ Е ЛИ ИЗТЕГЛЕН???', JSON.stringify(u1.body.store_comment));
      ok('ex-1: „ЕЛМАК" → „ЕЛМАК ЕООД"', u1.body.supplier === 'ЕЛМАК ЕООД');
      ok('ex-1: дата „02.09.2026" → 2026-09-02', u1.body.confirmed_date === '2026-09-02');
      ok('ex-1: без коментарите на Цвети', !('control_comment' in u1.body) && !('controller_comment' in u1.body));
    }
    const u2 = h.upd('ex-2');
    if (ok('ex-2 (без поръчка: магазин + SAP + наименование) се ОБНОВЯВА', !!u2 && !h.ins.some(r => r.product_name === 'СКОБА'))) {
      ok('ex-2: „тук е" → pending; дата „23,09,2026" → 2026-09-23', u2.body.status === 'pending' && u2.body.confirmed_date === '2026-09-23',
        JSON.stringify(u2.body));
      ok('ex-2: „ТЕКРА" → „ТЕКРА ЕООД" (двойният интервал не е второ име)', u2.body.supplier === 'ТЕКРА ЕООД', u2.body.supplier);
    }
    ok('ex-3 (приключен в портала) НЕ се пипа', !h.upd('ex-3') && !h.ins.some(r => r.product_name === 'ПРИКЛЮЧЕН В ПОРТАЛА'));
    ok('ex-4 (няма го във файла) НЕ се пипа', !h.upd('ex-4'));

    ok('обобщение: Нови 6 · Обновени 2 · Пропуснати (приключени) 1',
      h.prog.indexOf('Нови: 6') >= 0 && h.prog.indexOf('Обновени: 2') >= 0 && h.prog.indexOf('Пропуснати (приключени): 1') >= 0, h.prog);
    ok('обобщение: несъпоставен „НЕПОЗНАТ ДОСТАВЧИК"', h.prog.indexOf('Несъпоставени доставчици') >= 0 &&
      h.prog.indexOf('НЕПОЗНАТ ДОСТАВЧИК') >= 0 && h.prog.indexOf('ЕЛМАК') < 0, h.prog);
    ok('обобщение: нечетими дати 2', h.prog.indexOf('Нечетими дати (записани празни): 2') >= 0, h.prog);
    h.close();
  }

  section('б) Без право (logistics): „заприход/изхвърл/прието при" → taken');
  {
    const h = await runImport(LOGI, 'diff');
    ok('„заприходено" → taken', byName(h, 'ЗАПРИХОДЕНО').status === 'taken');
    ok('„изхвърлена" → taken', byName(h, 'ИЗХВЪРЛЕНО').status === 'taken');
    ok('„Прието при нас" → taken', byName(h, 'ПРИЕТИ').status === 'taken');
    ok('нищо не е completed', h.ins.every(r => r.status !== 'completed'));
    h.close();
  }

  section('в) Провалена проверка за съществуващи → нищо не се пише (без дубликати)');
  {
    const h = boot({ modules: ['stock-returns.js', 'stock-differences.js'], user: CVETI, confirm: true,
      data: { stock_returns: [], stock_differences: [], differences_reports: [] },
      fail: { GET: { status: 500, body: { message: 'boom' }, url: /source=eq\.diff/ } } });
    h.w.srData = []; h.w.srTab = 'diff'; h.w.srFilter = 'all'; h.w.srStoreFilter = ''; h.w.srSupplierFilter = ''; h.w.srSearch = '';
    const wb = WB();
    h.w.XLSX = { read: () => wb, utils: { sheet_to_json: (s) => s.__aoa } };
    h.w.FileReader = function () { const self = this; this.readAsArrayBuffer = function () {
      setTimeout(function () { self.onload({ target: { result: new Uint8Array(0) } }); }, 0); }; };
    h.w.renderStockReturns();
    realClick(h.w, btn(h.doc.getElementById('mod-stock-returns'), '📤 Импорт от Excel'));
    Object.defineProperty(h.doc.getElementById('sr-import-file'), 'files', { value: [{ name: 'x.xlsx' }], configurable: true });
    realClick(h.w, btn(h.doc, 'Започни импорт'));
    await new Promise(res => setTimeout(res, 80));
    ok('няма POST', !h.calls.post.some(p => p.table === 'stock_returns'));
    ok('няма PATCH', !h.calls.patch.some(p => /stock_returns/.test(p.url)));
    ok('съобщение за грешката', /Грешка при проверка на съществуващите/.test((h.doc.getElementById('sr-import-progress') || {}).innerHTML || ''));
    h.close();
  }

  section('г) „По рекламации" — непроменен път');
  {
    const h = await runImport(CVETI, 'complaint');
    ok('бутонът е и там', h.hasBtn);
    ok('НЕ минава през srImportDiffList', h.spy.diffList === 0);
    ok('файлът на „По разлики" в „По рекламации" не става нито един запис за разлики',
      !h.ins.some(r => r.source === 'diff'), JSON.stringify(h.ins.map(r => r.source)));
    h.close();
  }

  report();
})();
