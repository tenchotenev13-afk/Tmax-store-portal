/* Трансфери — напомняне в банера при вход и звънец на пулса (18.10.2026).
   ИНТЕГРАЦИОНЕН: shared.js, report.js, loading.js, transfers.js и
   notifications.js в реда от index.html — броенето е tfDueForStores()
   (transfers.js), а notifications.js тегли данните сам: табът може да не е
   отварян. Само банер и звук в портала — без push и без имейл.

   Какво заковава файлът:
   a) Обект с 3 дължими ЕДИНИЦИ (от тръгнал бус) и 1 чакащ прехвърляне →
      картата „3 бройки за потвърждение в Трансфери · 1 чака прехвърляне";
      клик → модул transfers и филтър „📥 За потвърждение при мен".
   b) 0 и 0 → няма карта; само чакащ → „1 товар чака прехвърляне…" и клик
      към „⏳ Чакащи".
   c) Глобален профил → няма карта и няма нито една заявка на пулса.
   d) Броят се единиците от бус / камион с departed_at ИЛИ depart_date ≤ днес;
      бъдещ без „Тръгна" — не; куриер — винаги.
   e) Пулс: цикъл 1 — само воден знак; цикъл 2 с нов departed_at → звук
      веднъж, coNotifyToast с номера, картата обновена; цикъл 3 без ново →
      нищо.
   f) Сринат отговор след баселайна → знакът не мърда.
   g) tfDueForStores дава същото като tfPendingItems + tfReshipItems.
   h) ✕ затваря картата, без да отваря модула.

   Мутационна проверка (18.10.2026, всяка поотделно):
     1. брой товари вместо единици (tfDueForStores)            → пада a), e)
     2. знакът мърда при празен / сринат отговор (notifications) → пада f)
     3. бъдещ нетръгнал се брои (depart_date ≤ днес → винаги)   → пада a), d)
     4. depart_date не се гледа (само departed_at)             → пада d)
   И четирите събарят теста.

   Пускане:  node tests/transfers-notify.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const STORES = ['Враца', 'Раднево', 'Варна', 'Централен офис'];
const RADNEVO = { id: 'u-r', email: 'radnevo@temax.bg', display_name: 'Управител Раднево', role: 'manager', store_name: 'Раднево', assigned_stores: [] };
const ACC = { id: 'acc', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };
const ago = function (h) { return new Date(Date.now() - h * 3600000).toISOString(); };
/* Местна дата след n дни (n < 0 — назад) — като today() в shared.js. */
const dayISO = function (n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  const p = function (x) { return String(x).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/* T1: тръгнал бус към Раднево — X ×3 (единица 1 вече получена → 2 остават), Z ×1 → общо 3 единици. */
const T1 = { id: 't1', transfer_num: 'Враца-0001', from_store: 'Враца', mode: 'bus', stops: [], end_store: 'Раднево', status: 'partial',
             created_at: ago(30), departed_at: ago(20), depart_date: null };
const X = { id: 'x', transfer_id: 't1', position: 1, kind: 'carton', qty: 3, recipient_store: 'Раднево', transfer_points: [] };
const Z = { id: 'z', transfer_id: 't1', position: 2, kind: 'pallet', qty: 1, recipient_store: 'Раднево', transfer_points: [] };
/* T2: НЕтръгнал бус към Раднево с дата на тръгване УТРЕ — W ×4. */
const T2 = { id: 't2', transfer_num: 'Враца-0002', from_store: 'Враца', mode: 'bus', stops: [], end_store: 'Раднево', status: 'planned',
             created_at: ago(10), departed_at: null, depart_date: dayISO(1) };
const W = { id: 'w', transfer_id: 't2', position: 1, kind: 'roll', qty: 4, recipient_store: 'Раднево', transfer_points: [] };
/* T3: R разтоварен в Раднево, чака прехвърляне към Варна. */
const T3 = { id: 't3', transfer_num: 'Враца-0003', from_store: 'Враца', mode: 'bus', stops: ['Раднево'], end_store: 'Варна', status: 'done',
             created_at: ago(50), departed_at: ago(48), depart_date: null };
const R = { id: 'r', transfer_id: 't3', position: 1, kind: 'carton', qty: 1, recipient_store: 'Варна', transfer_points: ['Раднево'] };
const EVS = [
  { id: 'e1', cargo_id: 'x', transfer_id: 't1', event: 'received', store_name: 'Раднево', unit: 1, created_at: ago(19) },
  { id: 'e2', cargo_id: 'r', transfer_id: 't3', event: 'unloaded', store_name: 'Раднево', unit: null, created_at: ago(40) }
];

function env(user, st) {
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js',
              'report.js', 'loading.js', 'transfers.js', 'notifications.js'],
    user: user, confirm: true,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: function (url) {
        if (st.fail) return [];
        const u = decodeURIComponent(url), m = /id=in\.\(([^)]*)\)/.exec(u);
        const all = st.transfers();
        return m ? all.filter(function (t) { return m[1].split(',').indexOf(t.id) >= 0; }) : all;
      },
      transfer_cargo: function (url) {
        if (st.fail) return [];
        const u = decodeURIComponent(url);
        if (/prev_cargo_id=in\./.test(u)) return st.succ || [];
        return st.cargo();
      },
      transfer_cargo_events: function () { return st.fail ? [] : st.events(); },
      loading_lists: [], loading_list_items: [], transport_orders: [], client_orders: [], stores: [], contacts: [],
      kasa_reports: [], kasa_storno: [], bulletin_tasks: [], recurring_tasks: [], task_completions: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: [], app_settings: [],
      loading_list_products: [], loading_list_photos: []
    }
  });
  h.w.transportOrders = []; h.w.clientOrders = [];
  h.sounds = 0;
  h.w.playSound = function () { h.sounds++; };
  h.notify = [];
  const realNotify = h.w.coNotifyToast;
  h.w.coNotifyToast = function (text, id, hover, onClick) { h.notify.push({ text: text, id: id, hover: hover, onClick: onClick }); return realNotify(text, id, hover, onClick); };
  h.modules = [];
  const realShow = h.w.showModule;
  h.w.showModule = function (m) { h.modules.push(m); return realShow(m); };
  return h;
}
const state = function (o) {
  return Object.assign({ transfers: () => [T1, T2, T3], cargo: () => [X, Z, W, R], events: () => EVS, succ: [] }, o || {});
};
const card = function (h) { return h.doc.querySelector('#notif-banner [data-notif="transfers"]'); };
const title = function (h) { const c = card(h); return c ? c.querySelector('.notif-title').textContent : null; };
const trGets = function (h) { return h.calls.get.filter(function (u) { return /\/rest\/v1\/transfer/.test(u); }).length; };
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }

(async function () {

  section('a) Картата при вход: 3 единици + 1 чакащ');
  {
    const h = env(RADNEVO, state());
    h.w.showLoginBanner(); await settle();
    ok('текстът', title(h) === '3 бройки за потвърждение в Трансфери · 1 чака прехвърляне', title(h));
    ok('иконата и подзаглавието', /🔁/.test(card(h).textContent) && /Отвори Транспорт → Трансфери/.test(card(h).textContent));
    realClick(h.w, card(h)); await settle();
    ok('клик → модул transfers', h.modules.indexOf('transfers') >= 0, JSON.stringify(h.modules));
    ok('и филтър „📥 За потвърждение при мен"', h.w.tfFilter === 'mine' && !!h.doc.querySelector('#trf-pending'), String(h.w.tfFilter));
    h.close();
  }

  section('b) 0 и 0 → няма карта; само чакащ → „чака прехвърляне"');
  {
    const h = env(RADNEVO, state({ transfers: () => [T2], cargo: () => [W], events: () => [] }));
    h.w.showLoginBanner(); await settle();
    ok('само нетръгнал бус → няма карта', !card(h), title(h));
    h.close();
    const h2 = env(RADNEVO, state({ transfers: () => [T3], cargo: () => [R], events: () => [EVS[1]] }));
    h2.w.showLoginBanner(); await settle();
    ok('само чакащ → „1 товар чака прехвърляне в Трансфери"', title(h2) === '1 товар чака прехвърляне в Трансфери', title(h2));
    realClick(h2.w, card(h2)); await settle();
    ok('клик → филтър „⏳ Чакащи"', h2.w.tfFilter === 'reship', String(h2.w.tfFilter));
    h2.close();
    const h3 = env(RADNEVO, state({ transfers: () => [T3], cargo: () => [R], events: () => [EVS[1]], succ: [{ prev_cargo_id: 'r' }] }));
    h3.w.showLoginBanner(); await settle();
    ok('прехвърлен вече (има наследник) → няма карта', !card(h3), title(h3));
    h3.close();
  }

  section('c) Глобален профил — нито карта, нито пулс');
  {
    const h = env(ACC, state());
    h.w.showLoginBanner(); await settle();
    h.w.checkNewTransfers(); await settle();
    ok('няма карта', !card(h));
    ok('нула заявки към transfer*', trGets(h) === 0, String(trGets(h)));
    ok('знакът остава null', h.w._tfWatermark === null);
    h.close();
  }

  section('d) Кога се броят единиците: departed_at, иначе depart_date ≤ днес');
  {
    const due = function (h, ts) { return h.w.tfDueForStores(['Раднево'], ts, { t1: [X, Z], t2: [W], t3: [R] }, EVS, {}); };
    const h = env(RADNEVO, state());
    const d1 = due(h, [T1, T2]);
    ok('нетръгнал с БЪДЕЩА дата (утре) → не се брои: 3 (само T1)', d1.confirm === 3, String(d1.confirm));
    ok('но е в confirmItems с moving=false', d1.confirmItems.some(function (it) { return it.c.id === 'w' && it.moving === false; }));
    const d2 = due(h, [T1, Object.assign({}, T2, { depart_date: dayISO(-1) })]);
    ok('нетръгнал с ВЧЕРАШНА дата → брои се: 3 + 4 = 7', d2.confirm === 7, String(d2.confirm));
    const d2b = due(h, [T1, Object.assign({}, T2, { depart_date: dayISO(0) })]);
    ok('нетръгнал с ДНЕШНА дата → брои се: 7', d2b.confirm === 7, String(d2b.confirm));
    const d3 = due(h, [T1, Object.assign({}, T2, { departed_at: ago(1) })]);
    ok('тръгнал (departed_at) с бъдеща дата → брои се: 7', d3.confirm === 7, String(d3.confirm));
    const d4 = due(h, [Object.assign({}, T2, { mode: 'courier', depart_date: null, departed_at: null })]);
    ok('куриер — брои се (4)', d4.confirm === 4, String(d4.confirm));
    const d5 = h.w.tfDueForStores(['Раднево'], [T2], { t2: [W] }, [], {}, dayISO(1));
    ok('при подаден ден: depart_date = този ден → брои се', d5.confirm === 4, String(d5.confirm));
    h.close();
  }

  section('e) Пулсът');
  {
    let t2 = Object.assign({}, T2);
    const st = state({ transfers: () => [T1, t2, T3] });
    const h = env(RADNEVO, st);
    h.w.checkNewTransfers(); await settle();
    ok('цикъл 1: знакът = departed_at на T1', h.w._tfWatermark === Date.parse(T1.departed_at), String(h.w._tfWatermark));
    ok('цикъл 1: без звук, без балонче, без карта', h.sounds === 0 && h.notify.length === 0 && !card(h));
    t2 = Object.assign({}, T2, { departed_at: ago(0.01) });
    h.w.checkNewTransfers(); await settle();
    ok('цикъл 2: звук веднъж', h.sounds === 1, String(h.sounds));
    ok('цикъл 2: „🔁 Тръгна Враца-0002 към вас · от Враца · 1 товар"', h.notify.length === 1 && h.notify[0].text === '🔁 Тръгна Враца-0002 към вас · от Враца · 1 товар', JSON.stringify(h.notify.map(function (n) { return n.text; })));
    ok('подсказката „Отвори Трансфери"', h.notify[0] && h.notify[0].hover === 'Отвори Трансфери');
    ok('картата: 3 + 4 = 7 единици', title(h) === '7 бройки за потвърждение в Трансфери · 1 чака прехвърляне', title(h));
    ok('знакът е преместен', h.w._tfWatermark === Date.parse(t2.departed_at));
    h.w.checkNewTransfers(); await settle();
    ok('цикъл 3 без ново: нищо', h.sounds === 1 && h.notify.length === 1);
    ok('и само една карта', h.doc.querySelectorAll('#notif-banner [data-notif="transfers"]').length === 1);
    const t = h.doc.getElementById('co-toast');
    t.onclick(); await settle();
    ok('кликът по балончето → Трансфери, „За потвърждение"', h.modules.indexOf('transfers') >= 0 && h.w.tfFilter === 'mine');
    /* Два наведнъж */
    const T4 = Object.assign({}, T2, { id: 't4', transfer_num: 'Враца-0004', departed_at: ago(0.005) });
    const T5 = Object.assign({}, T2, { id: 't5', transfer_num: 'Враца-0005', departed_at: ago(0.004) });
    const W4 = Object.assign({}, W, { id: 'w4', transfer_id: 't4' }), W5 = Object.assign({}, W, { id: 'w5', transfer_id: 't5' });
    st.transfers = () => [T1, t2, T3, T4, T5]; st.cargo = () => [X, Z, W, R, W4, W5];
    h.w.checkNewTransfers(); await settle();
    ok('два наведнъж → „🔁 2 транспорта тръгнаха към вас"', h.notify.length === 2 && h.notify[1].text === '🔁 2 транспорта тръгнаха към вас', JSON.stringify(h.notify.map(function (n) { return n.text; })));
    h.close();
  }

  section('f) Сринат отговор след баселайна — знакът не мърда');
  {
    const st = state();
    const h = env(RADNEVO, st);
    h.w.checkNewTransfers(); await settle();
    const w0 = h.w._tfWatermark;
    st.fail = true;
    h.w.checkNewTransfers(); await settle();
    ok('знакът е същият', h.w._tfWatermark === w0, h.w._tfWatermark + ' / ' + w0);
    ok('без звук', h.sounds === 0);
    st.fail = false;
    h.w.checkNewTransfers(); await settle();
    ok('след срива — пак без звук (нищо ново)', h.sounds === 0 && h.w._tfWatermark === w0);
    h.close();
  }

  section('g) tfDueForStores = tfPendingItems + tfReshipItems');
  {
    const h = env(RADNEVO, state());
    h.w.showModule('transfers'); await settle();
    const due = h.w.tfDueForStores(['Раднево'], h.w.tfTransfers, h.w.tfCargoByTransfer, h.w.tfEvents, h.w.tfSuccOf);
    const pend = h.w.tfPendingItems('').filter(function (it) { return it.acts.some(function (a) { return a.kind === 'received' || a.kind === 'unloaded'; }); })
      .map(function (it) { return it.c.id; }).sort().join(',');
    ok('„За потвърждение": същите товари', due.confirmItems.map(function (it) { return it.c.id; }).sort().join(',') === pend, pend);
    const re = h.w.tfReshipItems(['Раднево'], '').map(function (it) { return it.c.id; }).sort().join(',');
    ok('„Чакащи": същите товари', due.reshipItems.map(function (it) { return it.c.id; }).sort().join(',') === re && re === 'r', re);
    ok('и единиците за потвърждение = сборът от tfUnitsState', due.confirm === 3);
    h.close();
  }

  section('h) ✕ затваря картата, без да отваря модула');
  {
    const h = env(RADNEVO, state());
    h.w.showLoginBanner(); await settle();
    const before = h.modules.length;
    realClick(h.w, card(h).querySelector('.notif-close'));
    await new Promise(function (r) { setTimeout(r, 260); });
    ok('картата я няма', !card(h));
    ok('модулът не е отварян', h.modules.length === before, JSON.stringify(h.modules));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
