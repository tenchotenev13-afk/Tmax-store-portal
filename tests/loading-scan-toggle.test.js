/* Товарни листи — „📷 Сканирай" зад превключвател, и новото емоджи на рулата.

   Второто скриване по решение на Теодор (25.09.2026), по същата причина като
   „Документи от Стока на път" на 23.09: в началото складът се обърква от
   твърде много начини да въведе един артикул. SAP кодът с автодопълване е
   основният път и остава.

   Въпросите, в които е лесно да се сбърка ТИХО, и затова са заковани тук:
     · БИБЛИОТЕКАТА. „Бутонът не се вижда" и „html5-qrcode не се зарежда" са
       различни твърдения; първото минава и с второто счупено, а вторият
       случай значи 375 KB и молба за камера при изключен фийчър;
     · ВТОРИЯТ ВХОД. llOpenScanner може да бъде извикан от конзолата или от
       екран, рендиран преди флагът да се смени. Без гейт и там „скрит" значи
       само „не се вижда";
     · МАГАЗИНСКАТА СТРАНА. Формата за извънреден ред (Пакет Г2) ползва СЪЩИЯ
       блок. Флаговете се четат в llLoadEditorData — ако не се четат и в
       llLoadStoreSide, обектът никога не вижда скенера, дори когато ключът е
       пуснат. Скрито по правилната причина, но по грешен повод;
     · ЕДНА ЗАЯВКА ЗА ДВАТА КЛЮЧА. Два флага, четени в един и същи миг, не
       бива да са две обикаляния до сървъра;
     · безопасната посока е ИЗКЛЮЧЕНО — липсващ ключ, боклук и паднала заявка
       значат едно и също.

   Пускане:  node tests/loading-scan-toggle.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const L_SENT = { id: 'L1', warehouse: WH, list_date: '2026-09-25', status: 'sent',
                 executed_by: 'Иван', comment: '', created_at: '2026-09-25T06:00:00.000Z',
                 sent_at: '2026-09-25T07:00:00.000Z', done_at: null };
function item_(o) {
  return Object.assign({
    id: 'i1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1,
    pallet_total: 1, purchase_doc: 'ИЗХ-100', clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, created_at: 'x'
  }, o);
}
const USERS = [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' },
               { store_name: 'Централен офис' }, { store_name: WH }];

/* settings: масивът, който app_settings връща. [] = липсващи ключове. */
function env(user, settings, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js'],
    user: user, confirm: true, fail: opts.fail,
    data: {
      app_settings: settings || [],
      users: USERS,
      loading_lists: opts.lists || [],
      loading_list_items: opts.items || [],
      product_catalog: [], loading_list_products: [], goods_transit: [],
      stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.w.llLists = []; h.w.llItems = []; h.w.llStoreLists = []; h.w.llStoreItems = [];
  h.w.llView = 'list'; h.w.llCurrentId = null; h.w.llDraft = null;
  h.w.llStores = []; h.w.llIncompleteSaves = {}; h.w.llStoreTab = 'in';
  h.w.llCollapsed = {}; h.w.llScanOn = false; h.w.llTransitDocsOn = false;
  h.w.invalidateStoreCaches();
  /* Зареждането на html5-qrcode минава през <script src> — в jsdom не гърми,
     но и не се вижда. Броим извикванията на llLoadScanLib: то е ЕДИНСТВЕНИЯТ
     път до библиотеката и точно то не бива да тръгва при изключен фийчър. */
  h.libCalls = 0;
  const realLib = h.w.llLoadScanLib;
  h.w.llLoadScanLib = function () { h.libCalls++; return realLib.apply(this, arguments); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const settingsGets = h => h.calls.get.filter(u => /app_settings/.test(u));

async function openEditor(h) {
  h.w.llNewList();
  await ticks(); await ticks(); await ticks();
  return mod(h);
}

(async function () {

  section('а) Липсващ ключ → без бутон и без библиотека');
  {
    const h = env(WAREHOUSE, []);
    const wrap = await openEditor(h);
    ok('редакторът се отвори', wrap.textContent.indexOf('Нов товарен лист') >= 0,
      wrap.textContent.slice(0, 160));
    ok('llScanOn е false', h.w.llScanOn === false, String(h.w.llScanOn));
    ok('бутонът „📷 Сканирай" го няма', !btn(wrap, '📷 Сканирай'),
      wrap.textContent.slice(0, 400));
    ok('и не стои в markup-а', wrap.innerHTML.indexOf('Сканирай') < 0);
    ok('llLoadScanLib НЕ е викана', h.libCalls === 0, String(h.libCalls));

    /* Останалото в блока работи — скенерът не е единственият път. */
    ok('полето за SAP код си е там', !!h.doc.getElementById('ll-pf-sap-0'));
    ok('и полето за бройки', !!h.doc.getElementById('ll-pf-qty-0'));
    ok('и бутонът „➕ Добави"', !!btn(wrap, '➕ Добави'));
  }

  section('б) Вторият вход: llOpenScanner наум също мълчи');
  {
    const h = env(WAREHOUSE, []);
    await openEditor(h);
    await h.w.llOpenScanner(0);
    await ticks(); await ticks();
    ok('llLoadScanLib пак НЕ е викана', h.libCalls === 0, String(h.libCalls));
    ok('модал за сканиране не се отваря', !h.doc.getElementById('ll-scan-modal'),
      h.doc.body.innerHTML.slice(0, 200));
    ok('и llScan остава празен', !h.w.llScan, JSON.stringify(h.w.llScan));
  }

  section('в) Стойност „on" → точно както досега');
  {
    const h = env(WAREHOUSE, [{ key: 'loading_scan', value: 'on' }]);
    const wrap = await openEditor(h);
    ok('llScanOn е true', h.w.llScanOn === true);
    ok('бутонът е там', !!btn(wrap, '📷 Сканирай'), wrap.textContent.slice(0, 300));
    /* Библиотеката се зарежда ЧАК при натискане — не при рендиране. */
    ok('но библиотеката още не е поискана', h.libCalls === 0, String(h.libCalls));
    h.w.llOpenScanner(0);
    await ticks();
    ok('натискането я иска', h.libCalls === 1, String(h.libCalls));
  }

  section('г) Всяка друга стойност значи ИЗКЛЮЧЕНО');
  {
    for (const [name, value] of [['изрично „off"', 'off'], ['празен низ', ''],
                                 ['боклук', 'да'], ['„true" не е „on"', 'true']]) {
      const h = env(WAREHOUSE, [{ key: 'loading_scan', value: value }]);
      const wrap = await openEditor(h);
      ok(name + ' → няма бутон', !btn(wrap, '📷 Сканирай') && h.libCalls === 0,
        'бутон=' + !!btn(wrap, '📷 Сканирай') + ' lib=' + h.libCalls);
      h.close();
    }
    /* Ключът се пипа от SQL Editor на ръка — главни букви и празни места. */
    const h2 = env(WAREHOUSE, [{ key: 'loading_scan', value: '  ON  ' }]);
    ok('„  ON  " → ВКЛЮЧЕНО', !!btn(await openEditor(h2), '📷 Сканирай'));
  }

  section('д) Паднала заявка → изключено, редакторът работи');
  {
    const h = env(WAREHOUSE, [{ key: 'loading_scan', value: 'on' }],
                  { fail: { GET: /app_settings/ } });
    const wrap = await openEditor(h);
    ok('без бутон', !btn(wrap, '📷 Сканирай'));
    ok('без библиотека', h.libCalls === 0, String(h.libCalls));
    ok('редакторът пак се рендира', wrap.textContent.indexOf('Нов товарен лист') >= 0);
    ok('и редовете са там', h.w.llDraft.items.length === 10, String(h.w.llDraft.items.length));

    /* sbGet НИКОГА не отхвърля — резолвва с []. Остава вторият път: самата
       обвивка да гръмне. Без този сценарий .catch-ът е непокрит код. */
    const h2 = env(WAREHOUSE, [{ key: 'loading_scan', value: 'on' }]);
    const real = h2.w.sbGet;
    h2.w.sbGet = function (t, q, s2) {
      return /app_settings/.test(t) ? Promise.reject(new Error('мрежа')) : real(t, q, s2);
    };
    const w2 = await openEditor(h2);
    ok('sbGet ОТХВЪРЛЯ → пак изключено', !btn(w2, '📷 Сканирай') && h2.w.llScanOn === false,
      String(h2.w.llScanOn));
  }

  section('е) Една заявка за ДВАТА ключа');
  {
    const h = env(WAREHOUSE, [{ key: 'loading_scan', value: 'on' },
                              { key: 'loading_transit_docs', value: 'on' }]);
    await openEditor(h);
    const q = settingsGets(h);
    ok('точно една заявка към app_settings', q.length === 1, JSON.stringify(q));
    ok('с in.(…) за двата ключа',
      /key=in\.\(loading_transit_docs,loading_scan\)/.test(q[0] || ''), JSON.stringify(q));
    ok('и иска ключа И стойността', /select=key,value/.test(q[0] || ''), JSON.stringify(q));
    ok('двата флага са вдигнати', h.w.llScanOn === true && h.w.llTransitDocsOn === true,
      h.w.llScanOn + ' / ' + h.w.llTransitDocsOn);

    /* Редът в отговора няма значение — сверява се по ключ, не по позиция. */
    const rev = env(WAREHOUSE, [{ key: 'loading_transit_docs', value: 'off' },
                                { key: 'loading_scan', value: 'on' }]);
    await openEditor(rev);
    ok('обърнат ред: скенерът ВКЛЮЧЕН, снимката ИЗКЛЮЧЕНА',
      rev.w.llScanOn === true && rev.w.llTransitDocsOn === false,
      rev.w.llScanOn + ' / ' + rev.w.llTransitDocsOn);
    ok('и двата флага са независими',
      !!btn(mod(rev), '📷 Сканирай') &&
      mod(rev).textContent.indexOf('Документи от Стока на път') < 0,
      mod(rev).textContent.slice(0, 300));
  }

  section('ж) Магазинската страна чете флага — формата за извънреден ред');
  {
    const items = [item_({ id: 'i1' })];
    const off = env(STORE, [], { lists: [L_SENT], items: items });
    off.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    off.w.llStoreAddOpen('L1');
    await ticks();
    const m1 = off.doc.getElementById('ll-add-modal');
    if (ok('формата се отваря', !!m1)) {
      ok('без бутон за сканиране', !btn(m1, '📷 Сканирай'), m1.textContent.slice(0, 300));
      ok('без библиотека', off.libCalls === 0, String(off.libCalls));
      ok('но полето за SAP код е там', !!off.doc.getElementById('ll-pf-sap-0'));
    }

    const on = env(STORE, [{ key: 'loading_scan', value: 'on' }],
                   { lists: [L_SENT], items: items });
    on.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    ok('флагът е прочетен и от магазинската страна', on.w.llScanOn === true,
      String(on.w.llScanOn));
    on.w.llStoreAddOpen('L1');
    await ticks();
    const m2 = on.doc.getElementById('ll-add-modal');
    ok('при „on" обектът вижда скенера', !!m2 && !!btn(m2, '📷 Сканирай'),
      m2 && m2.textContent.slice(0, 300));
  }

  section('з) Новото емоджи на рулата — един източник');
  {
    const h = env(WAREHOUSE, []);
    const roll = h.w.LL_KINDS.find(k => k[0] === 'roll');
    ok('LL_KINDS: „📏 Рула"', roll && roll[1] === '📏 Рула', JSON.stringify(roll));
    ok('старото „🧻" го няма никъде в менюто',
      h.w.LL_KINDS.every(k => k[1].indexOf('🧻') < 0),
      JSON.stringify(h.w.LL_KINDS.map(k => k[1])));
    /* Ключът е в базата по осем реда и в CHECK-а — не се пипа. */
    ok('ключът си остава „roll"', roll && roll[0] === 'roll');
    ok('и рулото пак се номерира', h.w.llIsNumbered('roll') === true);
    ok('llKindLabel не носи емоджи — то е само за менюто',
      h.w.llKindLabel({ kind: 'roll', pallet_no: 1, pallet_total: 2 }) === 'руло 1 от 2',
      h.w.llKindLabel({ kind: 'roll', pallet_no: 1, pallet_total: 2 }));

    /* Падащото меню в редактора го взима оттам, не от копие. */
    const wrap = await openEditor(h);
    ok('менюто в редактора показва „📏 Рула"', wrap.innerHTML.indexOf('📏 Рула') >= 0,
      wrap.innerHTML.indexOf('Рула') >= 0 ? 'има „Рула", но с друго емоджи' : 'няма „Рула"');
    ok('и никъде не е останало „🧻"', wrap.innerHTML.indexOf('🧻') < 0);

    /* Печатът, PDF-ът и писмата минават през llKindLabel — без емоджи и там,
       точно както при палета. Проверява се, че НЕ е поникнало копие. */
    const src = require('fs').readFileSync(
      require('path').join(process.argv[2] || '.', 'loading.js'), 'utf8');
    ok('„🧻" го няма в целия loading.js', src.indexOf('🧻') < 0);
    ok('„📏" стои на ЕДНО място — в LL_KINDS',
      (src.match(/📏/g) || []).length === 1,
      String((src.match(/📏/g) || []).length));
  }

  report();
})();
