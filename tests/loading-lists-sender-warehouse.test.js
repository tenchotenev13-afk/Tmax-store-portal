/* Товарни листи — изпращач е САМО логистичен склад (Теодор, 28.09.2026).

   Товарният лист е инструмент на изпращащия склад. Магазинът е само
   получател: отмята, „⛔ Неполучено", „🏁 Приключи приемането", „➕ Добави ред"
   — това не се пипа.

   Какво заковава файлът:
     1) магазинът не вижда „➕ Нов товарен лист", няма раздели и не може да
        бъде изпращач (llCanEdit false, llActiveWarehouse празен);
     2) logistics на склад вижда бутона с истински клик, изпращачът е
        неговият склад, и записът носи warehouse = складът;
     3) admin избира само между двата логистични склада; изпращач магазин,
        подаден отвън (стар избор), не отваря листите за писане;
     4) приемането от магазин работи както досега — „✅ Получено" с истински
        клик пише received=true.

   Пускане:  node tests/loading-lists-sender-warehouse.test.js .
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
      app_settings: [{ key: 'loading_scan', value: 'on' }],
      /* „📤 Изпрати" иска поне 2 снимки на натоварването (25.09.2026).
         Този тест проверява какво става СЛЕД изпращането, не гейта —
         затова фикстурата ги носи. Гейтът е в loading-lists-photos. */
      loading_list_photos: [
        { id: 'ph1', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/1.jpg', uploaded_by: 'Склад', uploaded_at: 'x' },
        { id: 'ph2', list_id: 'L1', store_name: WH, stage: 'sent',
          path: 'https://x/2.jpg', uploaded_by: 'Склад', uploaded_at: 'x' }
      ],
      stores: [], contacts: [], transport_orders: [], goods_transit: [],
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


const LOGISTICS = { email: 'log.tg@temax.bg', display_name: 'Логистика Търговище', role: 'logistics',
                    store_name: WH, assigned_stores: [] };
const LOG_CO = { email: 'log.co@temax.bg', display_name: 'Логистика ЦО', role: 'logistics',
                 store_name: 'Централен офис', assigned_stores: [] };
const byText = (root, re) => Array.from(root.querySelectorAll('button')).filter(b => re.test(b.textContent))[0];

(async function () {

  section('1) Магазинът не е изпращач');
  {
    const lists = [list_({ id: 'IN', warehouse: WH, status: 'sent' })];
    const items = [item_({ id: 'a1', list_id: 'IN', store_name: 'Петрич', purchase_doc: 'ИЗХ-ВХОД' })];
    const h = env(PETRICH, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('няма бутон „➕ Нов товарен лист"', !byText(mod(h), /Нов товарен лист/), mod(h).textContent.slice(0, 300));
    ok('няма раздели „Към мен" / „От мен"', !mod(h).querySelector('[data-ll-store-tabs]') && mod(h).textContent.indexOf('От мен') < 0);
    ok('няма избор на изпращач', !h.doc.getElementById('ll-wh'));
    ok('llCanEdit() е false', h.w.llCanEdit() === false);
    ok('llActiveWarehouse() е празен', h.w.llActiveWarehouse() === '');
    ok('вижда входящия лист', mod(h).textContent.indexOf('ИЗХ-ВХОД') >= 0);
    /* Директно извикване (стар линк / конзола) не отваря редактор за писане:
       записът иска llActiveWarehouse(), който за магазина е празен. */
    h.w.llWarehouse = 'Петрич';
    ok('и подаден отвън изпращач „Петрич" не става активен', h.w.llActiveWarehouse() === '');
  }

  section('2) logistics на склад: бутонът е там, изпращачът е складът');
  {
    const h = env(LOGISTICS, { lists: [], items: [] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('няма избор на изпращач — складът е зададен', !h.doc.getElementById('ll-wh'));
    ok('складът е изписан', mod(h).textContent.indexOf(WH) >= 0, mod(h).textContent.slice(0, 200));
    const b = byText(mod(h), /Нов товарен лист/);
    ok('бутонът „➕ Нов товарен лист" е там', !!b);
    realClick(h.w, b);
    await ticks(); await ticks();
    ok('отваря редактора', h.w.llView === 'edit' && !!h.w.llDraft);
    ok('изпращачът е неговият склад', h.w.llActiveWarehouse() === WH);
    /* Записът: първи ред с обект — заглавието отива с warehouse = складът. */
    h.w.llDraft.items[0].store_name = 'Петрич';
    h.w.llDraft.items[0].kind = 'bulk';
    h.w.llDraft.items[0].purchase_doc = 'ИЗХ-900';
    h.w.llSaveDraft();
    await ticks(); await ticks();
    const head = h.calls.post.filter(p => p.table === 'loading_lists')[0];
    ok('заглавието се записва с warehouse = ' + WH, head && head.body && head.body.warehouse === WH,
      JSON.stringify(head && head.body));
  }

  section('3) admin: избор само между двата логистични склада');
  {
    const a = env(ADMIN, { lists: [list_({ id: 'OLD', warehouse: 'Враца', status: 'draft' })], items: [] });
    a.w.loadLoadingLists();
    await ticks(); await ticks();
    const sel = a.doc.getElementById('ll-wh');
    ok('admin вижда избор на изпращач', !!sel);
    const vals = Array.from(sel.querySelectorAll('option')).map(o => o.value).filter(Boolean);
    ok('само двата логистични склада', vals.join('|') === a.w.LOGISTICS_WAREHOUSES.join('|'), vals.join('|'));
    ok('без магазини', vals.indexOf('Петрич') < 0 && vals.indexOf('Враца') < 0);
    ok('преди избор — няма бутон за нов лист', !byText(mod(a), /Нов товарен лист/));
    sel.value = WH; H.fire(a.w, sel, 'change');
    await ticks(); await ticks();
    ok('след избор на склад — бутонът е там', !!byText(mod(a), /Нов товарен лист/), mod(a).textContent.slice(0, 200));
    ok('изпращачът е избраният склад', a.w.llActiveWarehouse() === WH);
    /* Изпращач магазин (стар лист от преди 30.09) не се отваря за писане. */
    a.w.llSetWarehouse('Враца');
    await ticks(); await ticks();
    ok('„Враца" като изпращач не се приема', a.w.llActiveWarehouse() === '' && !byText(mod(a), /Нов товарен лист/));

    const c = env(LOG_CO, { lists: [], items: [] });
    c.w.loadLoadingLists();
    await ticks(); await ticks();
    const sel2 = c.doc.getElementById('ll-wh');
    ok('logistics без склад избира като admin — само складовете',
      !!sel2 && Array.from(sel2.querySelectorAll('option')).map(o => o.value).filter(Boolean).join('|') === c.w.LOGISTICS_WAREHOUSES.join('|'));
  }

  section('4) Приемането от магазин работи както досега');
  {
    const lists = [list_({ id: 'IN', warehouse: WH, status: 'sent', sent_at: '2026-09-23T08:00:00.000Z' })];
    const items = [item_({ id: 'a1', list_id: 'IN', store_name: 'Петрич', purchase_doc: 'ИЗХ-ВХОД' }),
                   item_({ id: 'a2', list_id: 'IN', store_name: 'Петрич', purchase_doc: 'ИЗХ-ВТОРИ', pallet_no: 1, kind: 'bulk' })];
    const h = env(PETRICH, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    const rb = mod(h).querySelector('button[data-id="a1"][onclick^="llMarkReceived"]');
    ok('„✅ Получено" е там', !!rb, mod(h).textContent.slice(0, 300));
    realClick(h.w, rb);
    await ticks(); await ticks();
    const p = h.calls.patch.filter(x => x.table === 'loading_list_items' && x.body && x.body.received === true);
    ok('с истински клик → received=true', p.length >= 1, JSON.stringify(h.calls.patch.map(x => [x.table, x.body])));
    ok('„⛔ Неполучено" е там за другия ред', !!mod(h).querySelector('button[data-id="a2"][onclick^="llMarkMissing"]'));
    ok('„➕ Добави ред" е там', !!byText(mod(h), /Добави ред/));
    ok('„🏁 Приключи приемането" е там', !!byText(mod(h), /Приключи приемането/));
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
