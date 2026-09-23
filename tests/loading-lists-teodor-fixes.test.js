/* Товарни листи — корекциите на Теодор от 23.09.2026.

   Пет несвързани поправки, които обаче се събират в едно твърдение: товарният
   лист вече не е „складът пише, обектът отмята". Обектът може да ИЗПРАЩА, а
   това, което се показва, е само това, което някой чете.

   Какво се заковава и защо точно то:

     2) „Изчиства" (clears_doc) изчезва от ЕКРАНА, не от базата. Разликата е
        цялата същина: llItemDocKey продължава да го ползва и автозатварянето
        на стоковия документ зависи от него. Тест, който проверява само че
        текстът го няма, би минал и ако колоната беше изтрита от записа.

     3) Магазин като ИЗПРАЩАЧ. Тук е лесно да се счупи тихо в три посоки:
        · llCanEdit() става true за магазина — а той дотук решаваше КОЙ
          ИЗГЛЕД се рендира. Без llIsSenderStore() в диспечера картата за
          получаване просто изчезва и никой не забелязва, докато обект не се
          оплаче, че не вижда товара си;
        · изпращачът остава в списъка с получатели → лист от Петрич за Петрич,
          който стига до собствената му карта „Към мен";
        · известието за СОБСТВЕНИЯ лист. Филтърът е по warehouse на листа, не
          по роля: един и същи човек е изпращач по едни листи и получател по
          други.

     4) Рулото се номерира. Препратката за опис вече различава ТРИ вида —
        „", „rc", „rl". Пропусне ли се третата, описът на руло 1 показва
        палет 1 и обратно.

     5) Артикулите са отворени по подразбиране. Проверява се срещу
        `_prodOpen !== false`, а не срещу истина, защото редовете се раждат на
        четири различни места.

     6) Надписът за черновата — в редактора И в прегледа, но само докато е
        чернова.

   Пускане:  node tests/loading-lists-teodor-fixes.test.js .
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
      loading_list_products: [], product_catalog: [], app_settings: [],
      stores: [], contacts: [], transport_orders: [], goods_transit: [],
      stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.w.llLists = []; h.w.llItems = []; h.w.llStoreLists = []; h.w.llStoreItems = [];
  h.w.llView = 'list'; h.w.llCurrentId = null; h.w.llDraft = null;
  h.w.llWarehouse = ''; h.w.llStoreTab = 'in'; h.w.llCollapsed = {};
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

(async function () {

  section('2) „Изчиства" изчезва от екрана, но НЕ от данните');
  {
    const items = [item_({ id: 'i1', clears_doc: 'D-777' })];
    /* Складът: списък → преглед на черновата. */
    const h = env(WAREHOUSE, { lists: [list_({})], items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    ok('прегледът няма колона „Изчиства"',
      mod(h).textContent.indexOf('Изчиства') < 0, mod(h).textContent.slice(0, 500));
    ok('и не пише „изчиства D-777"', mod(h).textContent.indexOf('D-777') < 0);

    h.w.llOpenEdit('L1');
    await ticks(); await ticks();
    ok('редакторът няма колона „Изчиства"',
      mod(h).textContent.indexOf('Изчиства') < 0, mod(h).textContent.slice(0, 600));
    ok('и няма select за clears_doc',
      mod(h).innerHTML.indexOf('clears_doc') < 0);
    ok('llClearsOptions вече я няма — мъртва функция не остава',
      typeof h.w.llClearsOptions === 'undefined');

    /* СЪРЦЕВИНАТА: данните са непокътнати и продължават да решават. */
    ok('llItemDocKey пак предпочита clears_doc',
      h.w.llItemDocKey({ clears_doc: 'D-777', purchase_doc: 'D-100' }) === 'D-777');
    ok('а без него пада на изходящия',
      h.w.llItemDocKey({ clears_doc: null, purchase_doc: 'D-100' }) === 'D-100');
    ok('черновата пази стойността за записа',
      h.w.llDraft.items[0].clears_doc === 'D-777', JSON.stringify(h.w.llDraft.items[0].clears_doc));

    /* Печатът и PDF-ът също мълчат. */
    h.w.llPrint('L1');
    ok('печатът не пише „изчиства"', pr(h).textContent.indexOf('изчиства') < 0,
      pr(h).textContent.slice(0, 400));
    /* Писмото при изпращане. */
    const html = h.w.llSentHtmlFor(list_({}), 'Петрич', items);
    ok('писмото няма колона „Изчиства"', html.indexOf('Изчиства') < 0);
    ok('и не носи D-777', html.indexOf('D-777') < 0);
  }

  section('3) Магазинът като изпращач — права, раздели, получатели');
  {
    const h = env(PETRICH, { lists: [], items: [] });
    ok('llIsSenderStore() е true за магазина', h.w.llIsSenderStore() === true);
    ok('llCanEdit() също', h.w.llCanEdit() === true);
    ok('llActiveWarehouse() е неговият обект', h.w.llActiveWarehouse() === 'Петрич',
      h.w.llActiveWarehouse());
    ok('и той НЕ избира друг изпращач', h.w.llWarehouseSelectHtml() === '',
      h.w.llWarehouseSelectHtml());

    /* Логистичният склад НЕ е „магазин-изпращач" — той няма раздели. */
    const w = env(WAREHOUSE, { lists: [], items: [] });
    ok('складът не е sender store', w.w.llIsSenderStore() === false);
    w.w.loadLoadingLists();
    await ticks(); await ticks();
    ok('и няма чипове', !mod(w).querySelector('[data-ll-store-tabs]'),
      mod(w).textContent.slice(0, 200));

    /* Централният офис също не е — той минава по клона admin/logistics. */
    const a = env(ADMIN, { lists: [], items: [] });
    ok('admin не е sender store', a.w.llIsSenderStore() === false);
  }

  section('3) Двата раздела при магазина');
  {
    /* Лист КЪМ Петрич (от склада) и лист ОТ Петрич (към Сандански). */
    const lists = [
      list_({ id: 'IN', warehouse: WH, status: 'sent' }),
      list_({ id: 'OUT', warehouse: 'Петрич', status: 'draft' })
    ];
    const items = [
      item_({ id: 'a1', list_id: 'IN', store_name: 'Петрич', purchase_doc: 'ИЗХ-ВХОД' }),
      item_({ id: 'b1', list_id: 'OUT', store_name: 'Сандански', purchase_doc: 'ИЗХ-ИЗХОД' })
    ];
    const h = env(PETRICH, { lists: lists, items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    const tabs = mod(h).querySelector('[data-ll-store-tabs]');
    if (ok('чиповете ги има', !!tabs, mod(h).textContent.slice(0, 300))) {
      ok('два — „Към мен" и „От мен"', tabs.querySelectorAll('button').length === 2,
        tabs.textContent);
      ok('заглавието е ЕДНО, не две',
        (mod(h).innerHTML.match(/class="pg-title"/g) || []).length === 1,
        String((mod(h).innerHTML.match(/class="pg-title"/g) || []).length));
    }
    ok('по подразбиране „Към мен" — вижда входящия лист',
      mod(h).textContent.indexOf('ИЗХ-ВХОД') >= 0, mod(h).textContent.slice(0, 500));
    ok('и НЕ вижда изходящия', mod(h).textContent.indexOf('ИЗХ-ИЗХОД') < 0);
    ok('няма бутон за нов лист в „Към мен"', !btn(mod(h), 'Нов товарен лист'));

    /* Превключване към „От мен" — складовият изглед. */
    h.w.llSetStoreTab('out');
    await ticks(); await ticks();
    ok('„От мен" показва бутона за нов лист', !!btn(mod(h), 'Нов товарен лист'),
      mod(h).textContent.slice(0, 400));
    ok('и собствената чернова', mod(h).textContent.indexOf('📝 Чернова') >= 0,
      mod(h).textContent.slice(0, 400));
    ok('llStoreTab е „out"', h.w.llStoreTab === 'out');
    ok('чиповете си остават', !!mod(h).querySelector('[data-ll-store-tabs]'));

    /* И обратно. */
    h.w.llSetStoreTab('in');
    await ticks(); await ticks();
    ok('обратно в „Към мен"', mod(h).textContent.indexOf('ИЗХ-ВХОД') >= 0 &&
      !btn(mod(h), 'Нов товарен лист'), mod(h).textContent.slice(0, 300));
    ok('изгледът се връща в списък', h.w.llView === 'list');
  }

  section('3) Изпращачът не може да е получател на своя лист');
  {
    const h = env(PETRICH, { lists: [], items: [] });
    h.w.llStoreTab = 'out';
    h.w.llStores = ['Гоце Делчев', 'Петрич', 'Сандански'];
    const opts = h.w.llStoreOptions('');
    ok('Петрич го няма сред получателите', opts.indexOf('>Петрич<') < 0, opts);
    ok('но другите два са там',
      opts.indexOf('>Гоце Делчев<') >= 0 && opts.indexOf('>Сандански<') >= 0, opts);
    /* Заварена стойност се пази видима — иначе редакция на стар лист би я
       изтрила тихо при първото пре-рендиране. */
    ok('заварен избор „Петрич" ОСТАВА видим', h.w.llStoreOptions('Петрич').indexOf('>Петрич<') >= 0,
      h.w.llStoreOptions('Петрич'));
    /* КОНТРОЛА: за склада нищо не отпада. */
    const w = env(WAREHOUSE, { lists: [], items: [] });
    w.w.llStores = ['Гоце Делчев', 'Петрич', 'Сандански'];
    ok('КОНТРОЛА: при склада Петрич е получател',
      w.w.llStoreOptions('').indexOf('>Петрич<') >= 0);
  }

  section('3) Известия: до магазин-изпращач да; за собствен лист не');
  {
    /* Петрич изпраща лист към Сандански → push и имейл до Сандански,
       а „складът" в писмото при приключване е Петрич. */
    const l = list_({ id: 'OUT', warehouse: 'Петрич', status: 'draft' });
    const items = [item_({ id: 'b1', list_id: 'OUT', store_name: 'Сандански' })];
    const h = env(PETRICH, { lists: [l], items: items });
    h.w.llStoreTab = 'out';
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    await h.w.llNotifyClosed(l);
    await ticks(); await ticks();
    ok('писмото при приключване отива до ИЗПРАЩАЧА Петрич',
      h.pushes.some(p => p.stores.join() === 'Петрич'), JSON.stringify(h.pushes));
    ok('pushToAll не е викана', h.pushAll === 0, String(h.pushAll));

    /* Банерът: собственият лист не влиза. */
    const h2 = env(PETRICH, {
      lists: [list_({ id: 'IN', warehouse: WH, status: 'sent' }),
              list_({ id: 'OUT', warehouse: 'Петрич', status: 'sent' })],
      items: [item_({ id: 'a1', list_id: 'IN', store_name: 'Петрич' }),
              item_({ id: 'b1', list_id: 'OUT', store_name: 'Петрич' })]
    });
    ok('notifWantsLoadingLists НЕ изключва магазина', h2.w.notifWantsLoadingLists() === true);
    const got = await new Promise(res => h2.w.notifLoadingListsPending(res));
    const ids = (got || []).map(x => x.id);
    ok('входящият лист влиза', ids.indexOf('IN') >= 0, JSON.stringify(ids));
    ok('а собственият — НЕ', ids.indexOf('OUT') < 0, JSON.stringify(ids));

    /* КОНТРОЛА: за склада собственият му лист също отпада. */
    const h3 = env(WAREHOUSE, {
      lists: [list_({ id: 'OWN', warehouse: WH, status: 'sent' })],
      items: [item_({ id: 'c1', list_id: 'OWN', store_name: WH })]
    });
    ok('КОНТРОЛА: логистичният склад изобщо не иска това известие',
      h3.w.notifWantsLoadingLists() === false);
  }

  section('3) Търсенето покрива и магазините-изпращачи');
  {
    const h = env(ADMIN, {
      lists: [list_({ id: 'L1', warehouse: 'Петрич' })],
      items: [item_({ id: 'i1', list_id: 'L1', store_name: 'Сандански' })]
    });
    h.w.llItems = [item_({ id: 'i1', list_id: 'L1', store_name: 'Сандански' })];
    ok('търсене по име на магазин-изпращач намира листа',
      h.w.llListMatches(list_({ id: 'L1', warehouse: 'Петрич' }), 'петрич') === true);
    ok('а чуждо име — не',
      h.w.llListMatches(list_({ id: 'L1', warehouse: 'Петрич' }), 'добрич') === false);
  }

  section('4) Рулото се номерира');
  {
    const h = env(WAREHOUSE, { lists: [], items: [] });
    ok('llIsNumbered("roll") е true', h.w.llIsNumbered('roll') === true);
    ok('етикетът е „руло N от M"',
      h.w.llKindLabel({ kind: 'roll', pallet_no: 2, pallet_total: 4 }) === 'руло 2 от 4',
      h.w.llKindLabel({ kind: 'roll', pallet_no: 2, pallet_total: 4 }));
    ok('насипът остава без номер', h.w.llIsNumbered('bulk') === false);
    ok('и си е „насип"', h.w.llKindLabel({ kind: 'bulk' }) === 'насип');

    /* Своя поредица по вид — три вида, три броения. */
    const rows = [
      { kind: 'pallet', pallet_no: 3, store_name: 'Петрич' },
      { kind: 'roll', pallet_no: 8, store_name: 'Петрич' },
      { kind: 'roll', pallet_no: 2, store_name: 'Петрич' },
      { kind: 'oversize', pallet_no: 5, store_name: 'Петрич' }
    ];
    h.w.llRenumberPallets(rows);
    ok('палетът е 1 от 1', rows[0].pallet_no === 1 && rows[0].pallet_total === 1,
      JSON.stringify(rows.map(r => r.kind + r.pallet_no + '/' + r.pallet_total)));
    ok('рулата са 1 и 2 от 2 — своя поредица',
      rows[2].pallet_no === 1 && rows[1].pallet_no === 2 && rows[1].pallet_total === 2,
      JSON.stringify(rows.map(r => r.kind + r.pallet_no + '/' + r.pallet_total)));
    ok('извънгабаритният е 1 от 1', rows[3].pallet_no === 1 && rows[3].pallet_total === 1);
  }

  section('4) Описът на рулото е свой — препратка „rl"');
  {
    const items = [
      item_({ id: 'A', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-П' }),
      item_({ id: 'B', position: 2, kind: 'roll', pallet_no: 1, pallet_total: 1, purchase_doc: 'ИЗХ-Р' })
    ];
    const products = [P('A', 'НА-ПАЛЕТА', 'СТОКА ОТ ПАЛЕТ'), P('B', 'В-РУЛОТО', 'СТОКА ОТ РУЛО')];
    const h = env(WAREHOUSE, { lists: [list_({})], items: items, products: products });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const btns = Array.from(mod(h).querySelectorAll('button[data-u]'));
    ok('препратките са „1" и „rl1"',
      btns.map(b => b.getAttribute('data-u')).join(',') === '1,rl1',
      btns.map(b => b.getAttribute('data-u')).join(','));

    realClick(h.w, btns[1]);
    const t = pr(h).textContent;
    ok('описът е за РУЛОТО', t.indexOf('Руло 1 от 1') >= 0, t.slice(0, 250));
    ok('със своята стока', t.indexOf('СТОКА ОТ РУЛО') >= 0);
    ok('и без стоката на палет 1', t.indexOf('СТОКА ОТ ПАЛЕТ') < 0);

    realClick(h.w, btns[0]);
    const t2 = pr(h).textContent;
    ok('а палет 1 не носи рулото', t2.indexOf('СТОКА ОТ ПАЛЕТ') >= 0 &&
      t2.indexOf('СТОКА ОТ РУЛО') < 0, t2.slice(0, 250));
  }

  section('5) Артикулите са отворени по подразбиране');
  {
    const h = env(WAREHOUSE, { lists: [], items: [] });
    h.w.llNewList();
    await ticks(); await ticks();
    ok('формата за добавяне е на екрана, не зад бутон', !!btn(mod(h), '📷 Сканирай'),
      mod(h).textContent.slice(0, 400));
    ok('и то за ВСЕКИ от десетте реда, не само за първия',
      mod(h).querySelectorAll('input[id^="ll-pf-sap-"]').length === 10,
      String(mod(h).querySelectorAll('input[id^="ll-pf-sap-"]').length));
    ok('и полето за SAP код също', !!h.doc.getElementById('ll-pf-sap-0'));
    ok('черновата не е трябвало да вдига флаг',
      h.w.llDraft.items[0]._prodOpen === undefined,
      JSON.stringify(h.w.llDraft.items[0]._prodOpen));

    /* Свиването пак работи — и то пише изричното false. */
    h.w.llToggleProducts(0);
    await ticks();
    ok('след свиване формата на ТОЗИ ред я няма',
      !h.doc.getElementById('ll-pf-sap-0'));
    ok('а на съседния ред си стои — свива се само редът, по който е кликнато',
      !!h.doc.getElementById('ll-pf-sap-1'));
    ok('и флагът е изричното false', h.w.llDraft.items[0]._prodOpen === false,
      JSON.stringify(h.w.llDraft.items[0]._prodOpen));
    h.w.llToggleProducts(0);
    await ticks();
    ok('и обратно', !!h.doc.getElementById('ll-pf-sap-0'));
  }

  section('5) Изпращане на ред без артикули — питане, не забрана');
  {
    const items = [
      item_({ id: 'i1', position: 1, purchase_doc: 'ИЗХ-1' }),
      item_({ id: 'i2', position: 2, pallet_no: 2, purchase_doc: 'ИЗХ-2' })
    ];
    /* confirm: false → отказ на ПЪРВИЯ въпрос (този за артикулите). */
    const no = env(WAREHOUSE, { lists: [list_({})], items: items, confirm: false });
    no.w.loadLoadingLists();
    await ticks(); await ticks();
    no.w.llSendList('L1');
    await ticks();
    ok('пита за редовете без артикули',
      no.calls.confirm.some(m => /2 реда са без артикули/.test(String(m))),
      JSON.stringify(no.calls.confirm));
    ok('и питането е ПЪРВО — второто не се показва',
      no.calls.confirm.length === 1, JSON.stringify(no.calls.confirm));
    ok('отказът не изпраща нищо',
      no.calls.patch.filter(p => p.table === 'loading_lists').length === 0,
      JSON.stringify(no.calls.patch.map(p => p.table)));

    /* Съгласие → минава и през двата въпроса. */
    const yes = env(WAREHOUSE, { lists: [list_({})], items: items });
    yes.w.loadLoadingLists();
    await ticks(); await ticks();
    yes.w.llSendList('L1');
    await ticks(); await ticks();
    ok('двата въпроса', yes.calls.confirm.length === 2, JSON.stringify(yes.calls.confirm));
    ok('и листът тръгва',
      yes.calls.patch.some(p => p.table === 'loading_lists' && p.body.status === 'sent'),
      JSON.stringify(yes.calls.patch.map(p => p.table)));

    /* Единствено число. */
    const one = env(WAREHOUSE, {
      lists: [list_({})],
      items: [item_({ id: 'i1', products: [] }),
              item_({ id: 'i2', position: 2, pallet_no: 2 })],
      products: [P('i2', 'КОД', 'ИМЕ')], confirm: false });
    one.w.loadLoadingLists();
    await ticks(); await ticks();
    one.w.llSendList('L1');
    await ticks();
    ok('един ред → „1 ред е без артикули"',
      one.calls.confirm.some(m => /1 ред е без артикули/.test(String(m))),
      JSON.stringify(one.calls.confirm));

    /* Всички с артикули → само старият въпрос. */
    const full = env(WAREHOUSE, {
      lists: [list_({})], items: [item_({ id: 'i1' })],
      products: [P('i1', 'КОД', 'ИМЕ')] });
    full.w.loadLoadingLists();
    await ticks(); await ticks();
    full.w.llSendList('L1');
    await ticks();
    ok('без липсващи артикули — един въпрос',
      full.calls.confirm.length === 1 && !/без артикули/.test(String(full.calls.confirm[0])),
      JSON.stringify(full.calls.confirm));
  }

  section('5) „Няма артикули — ✏️ Редакция" в прегледа на чернова');
  {
    const items = [item_({ id: 'i1' })];
    const h = env(WAREHOUSE, { lists: [list_({ status: 'draft' })], items: items });
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    const row = mod(h).querySelector('tr[data-ll-noprod="i1"]');
    if (ok('редът без артикули има свой под-ред', !!row, mod(h).textContent.slice(0, 500))) {
      ok('пише „Няма артикули"', row.textContent.indexOf('Няма артикули') >= 0, row.textContent);
      const b = btn(row, '✏️ Редакция');
      ok('и води към редактора', !!b);
      realClick(h.w, b);
      await ticks(); await ticks();
      ok('редакторът се отваря', h.w.llView === 'edit', h.w.llView);
    }

    /* След изпращане същият надпис би бил само упрек — не се показва. */
    const sent = env(WAREHOUSE, { lists: [list_({ status: 'sent' })], items: items });
    sent.w.loadLoadingLists();
    await ticks(); await ticks();
    sent.w.llOpenView('L1');
    ok('в ИЗПРАТЕН лист надписа го няма',
      !mod(sent).querySelector('tr[data-ll-noprod="i1"]'),
      mod(sent).textContent.slice(0, 400));

    /* Ред С артикули пак показва разгъвача, не надписа. */
    const withP = env(WAREHOUSE, { lists: [list_({ status: 'draft' })], items: items,
                                   products: [P('i1', 'КОД', 'ИМЕ')] });
    withP.w.loadLoadingLists();
    await ticks(); await ticks();
    withP.w.llOpenView('L1');
    ok('ред с артикули няма надписа',
      !mod(withP).querySelector('tr[data-ll-noprod="i1"]') &&
      !!mod(withP).querySelector('tr[data-ll-vprod="i1"]'));
  }

  section('6) Надписът за черновата — редактор и преглед, само в чернова');
  {
    const h = env(WAREHOUSE, { lists: [list_({ status: 'draft' })], items: [item_({ id: 'i1' })] });
    h.w.loadLoadingLists();
    await ticks(); await ticks();

    h.w.llOpenEdit('L1');
    await ticks(); await ticks();
    const inEd = mod(h).querySelector('[data-ll-draft-notice]');
    if (ok('редакторът носи надписа', !!inEd, mod(h).textContent.slice(0, 300))) {
      ok('с точния текст',
        inEd.textContent.indexOf('Черновата се вижда само тук') >= 0 &&
        inEd.textContent.indexOf('📤 Изпрати към обектите') >= 0, inEd.textContent);
      ok('и е син', /#eff6ff/.test(inEd.getAttribute('style') || ''), inEd.getAttribute('style'));
    }

    h.w.llBackToList();
    await ticks(); await ticks();
    h.w.llOpenView('L1');
    ok('прегледът на черновата също', !!mod(h).querySelector('[data-ll-draft-notice]'),
      mod(h).textContent.slice(0, 300));

    const sent = env(WAREHOUSE, { lists: [list_({ status: 'sent' })], items: [item_({ id: 'i1' })] });
    sent.w.loadLoadingLists();
    await ticks(); await ticks();
    sent.w.llOpenView('L1');
    ok('в ИЗПРАТЕН лист надписа го няма',
      !mod(sent).querySelector('[data-ll-draft-notice]'),
      mod(sent).textContent.slice(0, 300));
  }

  report();
})();
