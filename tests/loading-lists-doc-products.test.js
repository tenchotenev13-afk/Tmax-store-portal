/* Товарни листи — „Изходящ №" ръчно и скриване на „Артикули" (Теодор, 01.10.2026).

   Какво заковава файлът:
     1) ИЗХОДЯЩ №: в редактора на склада клетката е поле; въведеният номер се
        записва (без интервали отпред/отзад); празно → null; изчистен номер
        маха и „частично".
     2) Номер, който съвпада с чакащ документ в goods_transit за обекта, се
        държи като досега — при получаване документът се затваря; номер, който
        НЕ съвпада, не затваря нищо и нищо не гърми.
     3) app_settings 'loading_products' (само 'on' включва): изключен —
        блокът „Артикули" го няма в редактора и в „➕ Извънреден ред", и не
        тръгва заявка към каталога; включен — има го.
     4) Стар лист с артикули ги показва и при изключен флаг (преглед на склада,
        картата на обекта, печатът); „🖨 Опис" — само за единица с артикули;
        стара чернова с артикули показва блока на този ред; надписът
        „Няма артикули — ✏️ Редакция" в прегледа на чернова — само при on.

   Пускане:  node tests/loading-lists-doc-products.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };
const PETRICH = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                  role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис', assigned_stores: [] };

const USERS = [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' },
               { store_name: 'Сандански' }, { store_name: 'Централен офис' },
               { store_name: WH }];

function list_(o) {
  return Object.assign({ id: 'L1', warehouse: WH, list_date: '2026-09-23',
    status: 'draft', executed_by: 'Иван', comment: '',
    created_at: '2026-09-23T06:00:00.000Z', sent_at: null, done_at: null }, o);
}
function item_(o) {
  return Object.assign({
    id: 'i1', list_id: 'L1', position: 1, kind: 'pallet', pallet_no: 1,
    pallet_total: 1, purchase_doc: 'ИЗХ-100', clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, store_comment: null,
    partial: false, received: false, received_by: null, received_at: null,
    missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null,
    created_at: '2026-09-23T06:00:00.000Z'
  }, o);
}
const P = (itemId, sap, name) =>
  ({ id: 'p-' + itemId, item_id: itemId, position: 1, sap_code: sap,
     product_name: name, unit: 'бр.', qty: 5, cartons: null, created_at: 'x' });

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'push.js', 'email.js', 'loading.js', 'notifications.js'],
    user: user,
    confirm: opts.confirm !== undefined ? opts.confirm : true,
    data: {
      loading_lists: function (url) {
        let rows = (opts.lists || []).map(r => Object.assign({}, r));
        const m = /warehouse=eq\.([^&]*)/.exec(url);
        if (m) rows = rows.filter(r => r.warehouse === decodeURIComponent(m[1]));
        const st = /status=in\.\(([^)]*)\)/.exec(url);
        if (st) { const a = st[1].split(','); rows = rows.filter(r => a.indexOf(r.status) >= 0); }
        const st1 = /[?&]status=eq\.([^&]*)/.exec(url);
        if (st1) rows = rows.filter(r => r.status === decodeURIComponent(st1[1]));
        const ids = /id=in\.\(([^)]*)\)/.exec(url);
        if (ids) { const a = ids[1].split(','); rows = rows.filter(r => a.indexOf(String(r.id)) >= 0); }
        return rows;
      },
      loading_list_items: function (url) {
        let rows = (opts.items || []).map(r => Object.assign({}, r, {
          loading_list_products: (opts.products || []).filter(p => p.item_id === r.id)
        }));
        const st = /store_name=eq\.([^&]*)/.exec(url);
        if (st) rows = rows.filter(r => r.store_name === decodeURIComponent(st[1]));
        const li = /list_id=in\.\(([^)]*)\)/.exec(url);
        if (li) { const a = li[1].split(','); rows = rows.filter(r => a.indexOf(String(r.list_id)) >= 0); }
        const l1 = /list_id=eq\.([^&]*)/.exec(url);
        if (l1) rows = rows.filter(r => String(r.list_id) === decodeURIComponent(l1[1]));
        if (/received=eq\.false/.test(url)) rows = rows.filter(r => !r.received);
        if (/missing=eq\.false/.test(url)) rows = rows.filter(r => !r.missing);
        return rows;
      },
      users: USERS,
      loading_list_products: [], product_catalog: [],
      /* „📷 Сканирай" е зад app_settings 'loading_scan' (по подразбиране
         ИЗКЛЮЧЕН, 25.09.2026). Този тест описва ВКЛЮЧЕНИЯ скенер, затова
         флагът е изричен. Изключеното състояние е в loading-scan-toggle. */
      app_settings: opts.settings || [],
      /* „📤 Изпрати" иска поне 2 снимки на натоварването (25.09.2026).
         Този тест проверява какво става СЛЕД изпращането, не гейта —
         затова фикстурата ги носи. Гейтът е в loading-lists-photos. */
      loading_list_photos: [
        { id: 'ph1', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/1.jpg', uploaded_by: 'Склад', uploaded_at: 'x' },
        { id: 'ph2', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/2.jpg', uploaded_by: 'Склад', uploaded_at: 'x' }
      ],
      stores: [], contacts: [], transport_orders: [], goods_transit: function (url) {
        /* Филтрира наистина: purchase_doc / store_name / status eq. */
        const q = decodeURIComponent(url.split('?')[1] || '');
        const g = re => (q.match(re) || [])[1];
        const pd = g(/purchase_doc=eq\.([^&]*)/), sn = g(/store_name=eq\.([^&]*)/), st = g(/status=eq\.([^&]*)/);
        return (opts.transit || []).filter(r => (!pd || r.purchase_doc === pd) && (!sn || r.store_name === sn) && (!st || r.status === st))
          .map(r => Object.assign({}, r));
      },
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.w.llLists = []; h.w.llItems = []; h.w.llStoreLists = []; h.w.llStoreItems = [];
  h.w.llView = 'list'; h.w.llCurrentId = null; h.w.llDraft = null;
  h.w.llWarehouse = ''; h.w.llCollapsed = {};
  h.w.invalidateStoreCaches();
  h.toasts = [];
  const origToast = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return origToast(m, c); };
  h.w.pushToStores = function (st, t, m) { h.pushes.push({ stores: st, title: t, msg: m }); return Promise.resolve({ ok: true, data: {} }); };
  h.w.pushToAll = function () { h.pushAll++; return Promise.resolve({ ok: true, data: {} }); };
  h.w.sendEmail = function (to, subj, html) { h.mails.push({ to: Array.isArray(to) ? to : [to], subj: subj, html: html }); return Promise.resolve({ ok: true, data: {} }); };
  h.pushes = []; h.mails = []; h.pushAll = 0;
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const pr = h => h.doc.getElementById('mod-print');


const ON = [{ key: 'loading_products', value: 'on' }];
const OFF = [{ key: 'loading_products', value: 'off' }];
const posts = (h, t) => h.calls.post.filter(p => p.table === t);
const patches = (h, t) => h.calls.patch.filter(p => p.table === t);
async function newList(h) {
  h.w.loadLoadingLists(); await ticks(); await ticks();
  realClick(h.w, btn(mod(h), 'Нов товарен лист')); await ticks(); await ticks();
}
const docIn = (h, i) => mod(h).querySelector('input.ll-doc-in[data-i="' + i + '"]');
const chips = (h, i) => Array.from(mod(h).querySelectorAll('[data-ll-doc-chip^="' + i + '-"]')).map(c => c.textContent.replace('✕', '').trim());
function typeDoc(h, i, v) { const el = docIn(h, i); el.value = v; H.fire(h.w, el, 'input'); H.fire(h.w, el, 'change'); }

(async function () {

  section('1) Изходящ № — ръчно поле в редактора');
  {
    const h = env(WAREHOUSE, { lists: [], items: [], settings: OFF });
    await newList(h);
    ok('колоната „Изходящи №" е поле за всяка единица', !!docIn(h, 0) && !!docIn(h, 9));
    h.w.llDraft.units[0].store_name = 'Петрич';
    h.w.llDraft.units[1].store_name = 'Петрич';
    h.w.renderLoadingLists();
    typeDoc(h, 0, '  4600179694 ');
    ok('записан без интервалите', h.w.llDraft.units[0].docs.join() === '4600179694', JSON.stringify(h.w.llDraft.units[0].docs));
    ok('номерът се вижда като чип след пре-рендиране', chips(h, 0).join() === '4600179694', chips(h, 0).join());
    typeDoc(h, 1, '   ');
    ok('празно (само интервали) → без чип', h.w.llDraft.units[1].docs.length === 0);
    /* „частично" е на единицата и иска поне един документ. */
    const cb = mod(h).querySelector('input[type="checkbox"][onchange^="llSetRowPartial"][data-i="0"]');
    ok('с номер — отметката „частично" е на реда', !!cb);
    cb.checked = true; H.fire(h.w, cb, 'change'); await ticks();
    ok('отметнато „частично" стига до единицата', h.w.llDraft.units[0].partial === true);
    realClick(h.w, mod(h).querySelector('[data-ll-doc-chip="0-0"] button')); await ticks();
    ok('махнат последен номер → без документи и „частично" пада', h.w.llDraft.units[0].docs.length === 0 && h.w.llDraft.units[0].partial === false);
    typeDoc(h, 0, '4600179694');
    realClick(h.w, btn(mod(h), 'Запази черновата')); await ticks(); await ticks();
    const rows = [].concat.apply([], posts(h, 'loading_list_items').map(p => [].concat(p.body)));
    ok('записът носи номера за единица 1 и null за единица 2',
      rows.length === 2 && rows[0].purchase_doc === '4600179694' && rows[1].purchase_doc === null, JSON.stringify(rows.map(r => r.purchase_doc)));
  }

  section('2) Съвпадащ номер затваря документа в Стока на път; несъвпадащ — нищо');
  {
    const L = list_({ id: 'L1', status: 'sent', sent_at: '2026-09-30T08:00:00Z' });
    const T = [{ id: 'gt1', purchase_doc: '4600179694', store_name: 'Петрич', status: 'pending', supplier: WH }];
    const h = env(PETRICH, { lists: [L], items: [item_({ id: 'i1', purchase_doc: '4600179694' })], transit: T, settings: OFF });
    h.w.loadLoadingLists(); await ticks(); await ticks();
    realClick(h.w, mod(h).querySelector('button[data-id="i1"][onclick^="llMarkReceived"]')); await ticks(); await ticks(); await ticks();
    const gp = patches(h, 'goods_transit');
    ok('ръчният номер, който съвпада, затваря документа (status=received)', gp.length === 1 && gp[0].body.status === 'received' &&
      /purchase_doc=eq\.4600179694/.test(decodeURIComponent(gp[0].url || gp[0].query || '')), JSON.stringify(gp.map(p => [p.url || p.query, p.body && p.body.status])));

    const h2 = env(PETRICH, { lists: [L], items: [item_({ id: 'i1', purchase_doc: '9999999999' })], transit: T, settings: OFF });
    h2.w.loadLoadingLists(); await ticks(); await ticks();
    realClick(h2.w, mod(h2).querySelector('button[data-id="i1"][onclick^="llMarkReceived"]')); await ticks(); await ticks(); await ticks();
    ok('несъвпадащ номер: редът е получен', patches(h2, 'loading_list_items').some(p => p.body && p.body.received === true));
    ok('и НИЩО в Стока на път не е пипнато', patches(h2, 'goods_transit').length === 0, JSON.stringify(patches(h2, 'goods_transit')));
    ok('и няма червено съобщение', !h2.toasts.some(t => t.col === '#dc2626'), JSON.stringify(h2.toasts));

    /* Документ на ДРУГ обект със същия номер не се затваря. */
    const h3 = env(PETRICH, { lists: [L], items: [item_({ id: 'i1', purchase_doc: '4600179694' })],
      transit: [Object.assign({}, T[0], { store_name: 'Сандански' })], settings: OFF });
    h3.w.loadLoadingLists(); await ticks(); await ticks();
    realClick(h3.w, mod(h3).querySelector('button[data-id="i1"][onclick^="llMarkReceived"]')); await ticks(); await ticks(); await ticks();
    ok('същият номер на чужд обект — не се затваря', patches(h3, 'goods_transit').length === 0);
  }

  section('3) loading_products: off → без „Артикули", on → с тях');
  {
    const h = env(WAREHOUSE, { lists: [], items: [], settings: OFF });
    await newList(h);
    ok('off: в редактора няма блок „Артикули"', !mod(h).querySelector('[data-ll-prodrow]') && !h.doc.getElementById('ll-pf-sap-0') &&
      !/Артикули \(/.test(mod(h).textContent));
    ok('и нито една заявка към каталога', !h.calls.get.some(u => /product_catalog/.test(u)));
    const s = env(PETRICH, { lists: [list_({ id: 'L1', status: 'sent' })], items: [item_({ id: 'i1' })], settings: OFF });
    s.w.loadLoadingLists(); await ticks(); await ticks();
    realClick(s.w, btn(mod(s), 'Добави ред')); await ticks();
    const m = s.doc.getElementById('ll-add-modal');
    ok('off: „➕ Извънреден ред" се отваря', !!m && !!s.doc.getElementById('ll-add-comment'));
    ok('и няма блок „Артикули" в него', m && !s.doc.getElementById('ll-pf-sap-0') && !/Артикули \(/.test(m.textContent));

    const h2 = env(WAREHOUSE, { lists: [], items: [], settings: ON });
    await newList(h2);
    ok('on: блокът е в редактора (поле за SAP код на ред 1)', !!h2.doc.getElementById('ll-pf-sap-0') && !!mod(h2).querySelector('[data-ll-prodrow="0"]'));
    const s2 = env(PETRICH, { lists: [list_({ id: 'L1', status: 'sent' })], items: [item_({ id: 'i1' })], settings: ON });
    s2.w.loadLoadingLists(); await ticks(); await ticks();
    realClick(s2.w, btn(mod(s2), 'Добави ред')); await ticks();
    ok('on: и в извънредния ред', !!s2.doc.getElementById('ll-pf-sap-0'));
    const h3 = env(WAREHOUSE, { lists: [], items: [], settings: [] });
    await newList(h3);
    ok('липсващ ключ → изключено', !h3.doc.getElementById('ll-pf-sap-0'));
    const h4 = env(WAREHOUSE, { lists: [], items: [], settings: [{ key: 'loading_products', value: 'yes' }] });
    await newList(h4);
    ok('боклук („yes") → изключено', !h4.doc.getElementById('ll-pf-sap-0'));
  }

  section('4) Стари артикули остават видими при off; „🖨 Опис" — само с артикули');
  {
    const L = list_({ id: 'L1', status: 'sent', sent_at: '2026-09-30T08:00:00Z' });
    const items = [item_({ id: 'i1', pallet_no: 1, pallet_total: 2 }), item_({ id: 'i2', pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-2' })];
    const prods = [P('i1', '1001', 'ШУРУПИ 4x40')];
    const h = env(WAREHOUSE, { lists: [L], items: items, products: prods, settings: OFF });
    h.w.loadLoadingLists(); await ticks(); await ticks();
    h.w.llOpenView('L1'); await ticks();
    ok('преглед на склада: редът с артикули ги има (под-ред)', !!mod(h).querySelector('tr[data-ll-vprod="i1"]'));
    const opis = Array.from(mod(h).querySelectorAll('button[data-u]')).map(b => b.getAttribute('data-u'));
    ok('„🖨 Опис" — само за палет 1 (с артикули), не за палет 2', opis.join(',') === '1', opis.join(','));
    h.w.llPrint('L1');
    ok('печатът на листа носи артикула', pr(h).textContent.indexOf('ШУРУПИ 4x40') >= 0);

    const s = env(PETRICH, { lists: [L], items: items, products: prods, settings: OFF });
    s.w.loadLoadingLists(); await ticks(); await ticks();
    ok('картата на обекта: артикулите на реда са там', !!mod(s).querySelector('tr[data-ll-sprod="i1"]'));

    /* Стара чернова с артикули: блокът на ТОЗИ ред се показва и при off. */
    const D = list_({ id: 'D1', status: 'draft' });
    const d = env(WAREHOUSE, { lists: [D], items: [item_({ id: 'd1', list_id: 'D1' }), item_({ id: 'd2', list_id: 'D1', pallet_no: 2 })],
      products: [P('d1', '1001', 'ШУРУПИ 4x40')], settings: OFF });
    d.w.loadLoadingLists(); await ticks(); await ticks();
    d.w.llOpenEdit('D1'); await ticks(); await ticks();
    ok('стара чернова: редът с артикули показва блока', !!mod(d).querySelector('[data-ll-prodrow="0"]') && /ШУРУПИ 4x40/.test(mod(d).textContent));
    ok('а редът без артикули — не', !mod(d).querySelector('[data-ll-prodrow="1"]'));

    /* „Няма артикули — ✏️ Редакция" в прегледа на чернова — само при on. */
    const vOff = env(WAREHOUSE, { lists: [D], items: [item_({ id: 'd2', list_id: 'D1' })], settings: OFF });
    vOff.w.loadLoadingLists(); await ticks(); await ticks();
    vOff.w.llOpenView('D1');
    ok('off: в прегледа на черновата надписа „Няма артикули" го няма', !mod(vOff).querySelector('tr[data-ll-noprod="d2"]') &&
      mod(vOff).textContent.indexOf('Няма артикули') < 0);
    const vOn = env(WAREHOUSE, { lists: [D], items: [item_({ id: 'd2', list_id: 'D1' })], settings: ON });
    vOn.w.loadLoadingLists(); await ticks(); await ticks();
    vOn.w.llOpenView('D1');
    ok('on: надписът е там', !!mod(vOn).querySelector('tr[data-ll-noprod="d2"]'));
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
