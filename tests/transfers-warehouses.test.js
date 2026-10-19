/* Трансфери — складовете действат от името на своя обект (19.10.2026).
   ИНТЕГРАЦИОНЕН: shared.js, stock-differences.js (isLogisticsWarehouseUser),
   report.js, transfers.js, notifications.js в реда от index.html.

   Логистика 1 / 2 са роля 'logistics' (в isGlobal()) със store_name
   „Логистичен склад …". Досега tfActorStores() им връщаше [] — гледаха, но
   не можеха да натиснат нищо и не получаваха картата при вход. Сега:
   ГЛЕДАТ всички транспорти (както досега), ДЕЙСТВАТ от свое име. admin и
   accounting — без права за отметки, както досега.

   Какво заковава файлът:
   a) складът вижда „✅ Получен (N остават)" за товар към себе си и записва
      received по единица от свое име; на чужд транспорт — без бутони;
   b) „Разтоварен" в точка на прехвърляне = складът;
   c) нов транспорт — само от своя обект;
   d) admin, accounting, logistics без склад — tfActorStores() = [], без
      бутони за отметки;
   e) картата при вход „91 бройки за потвърждение в Трансфери" и пулс при
      „Тръгна" към склада; admin — без карта и без заявки;
   f) tfCanDepart: planned без отметки → null; завършен → „Транспортът е
      завършен."; с отметка → „Има отметки по товарите."; куриер → причина;
   g) „Чакащи прехвърляне при мен" при склада, „(всички обекти)" при admin;
   h) tfCanDelete за склада — само свои транспорти.

   Мутационна проверка (19.10.2026, всяка поотделно върху transfers.js):
     1. tfActorStores за склад връща []                → пада a) (тестът спира там)
     2. tfCreatorStores за склад връща целия списък     → пада c)
     3. махната проверката за завършен в tfCanDepart   → пада f)
   И трите събарят теста.

   Пускане:  node tests/transfers-warehouses.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick } = H;

const WH = 'Логистичен склад Търговище';
const STORES = ['Козлодуй', 'Троян', 'Кърджали', 'Враца', 'Монтана', 'Централен офис'];
const LOG2 = { id: 'log2', email: 'logistichen2@temax.bg', display_name: 'Логистика 2', role: 'logistics', store_name: WH };
const LOG_NOWH = { id: 'logx', email: 'logx@temax.bg', display_name: 'Логистика ЦО', role: 'logistics', store_name: 'Централен офис' };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ACC = { id: 'acc', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };
const KOZ = { id: 'u-koz', email: 'koz@temax.bg', display_name: 'Управител Козлодуй', role: 'manager', store_name: 'Козлодуй' };
const dayISO = function (n) { const d = new Date(); d.setDate(d.getDate() + n); const p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const ago = function (h) { return new Date(Date.now() - h * 3600000).toISOString(); };

/* Козлодуй-0007: бус Козлодуй → Троян → склада; 90 + 1 бройки за склада. */
const K7 = { id: 'k7', transfer_num: 'Козлодуй-0007', from_store: 'Козлодуй', mode: 'bus', depart_date: dayISO(-3), depart_time: '08:00',
             stops: ['Троян'], end_store: WH, status: 'planned', created_at: ago(80), departed_at: null };
const A = { id: 'a', transfer_id: 'k7', position: 1, kind: 'carton', qty: 90, recipient_store: WH, transfer_points: [] };
const B = { id: 'b', transfer_id: 'k7', position: 2, kind: 'pallet', qty: 1, recipient_store: WH, transfer_points: [] };
/* Козлодуй-0003: товар за Кърджали, разтоварва се в склада. Тръгва след 2
   дни — бутонът „Разтоварен" е там и преди тръгването, но картата при вход
   не го брои (бъдещ без „Тръгна"). */
const K3 = { id: 'k3', transfer_num: 'Козлодуй-0003', from_store: 'Козлодуй', mode: 'bus', depart_date: dayISO(2), depart_time: '08:00',
             stops: [WH], end_store: 'Кърджали', status: 'planned', created_at: ago(130), departed_at: null };
const C = { id: 'c', transfer_id: 'k3', position: 1, kind: 'roll', qty: 2, recipient_store: 'Кърджали', transfer_points: [WH] };
/* Враца-0009: складът не участва. */
const V9 = { id: 'v9', transfer_num: 'Враца-0009', from_store: 'Враца', mode: 'bus', depart_date: dayISO(-1), depart_time: '08:00',
             stops: [], end_store: 'Монтана', status: 'planned', created_at: ago(30), departed_at: null };
const D = { id: 'd', transfer_id: 'v9', position: 1, kind: 'carton', qty: 1, recipient_store: 'Монтана', transfer_points: [] };
/* От склада — за h). */
const W1 = { id: 'w1', transfer_num: 'Логистичен склад Търговище-0001', from_store: WH, mode: 'bus', depart_date: dayISO(1), depart_time: '08:00',
             stops: [], end_store: 'Козлодуй', status: 'planned', created_at: ago(2), departed_at: null };
const E = { id: 'e', transfer_id: 'w1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Козлодуй', transfer_points: [] };
/* Завършен, с отметка — за f). */
const DN = { id: 'dn', transfer_num: 'Кърджали-0001', from_store: 'Козлодуй', mode: 'bus', depart_date: dayISO(-9), depart_time: '08:00',
             stops: [], end_store: 'Троян', status: 'done', created_at: ago(240), departed_at: null };
const F = { id: 'f', transfer_id: 'dn', position: 1, kind: 'carton', qty: 1, recipient_store: 'Троян', transfer_points: [] };
const EV_DN = { id: 'edn', cargo_id: 'f', transfer_id: 'dn', event: 'received', store_name: 'Троян', unit: 1, created_at: ago(200) };

function env(user, st) {
  st = st || {};
  const transfers = function () { return st.transfers ? st.transfers() : [K7, K3, V9, W1, DN]; };
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js',
              'report.js', 'loading.js', 'transfers.js', 'notifications.js'],
    user: user, confirm: true,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: function (url) {
        const u = decodeURIComponent(url), m = /id=in\.\(([^)]*)\)/.exec(u);
        return m ? transfers().filter(function (t) { return m[1].split(',').indexOf(t.id) >= 0; }) : transfers();
      },
      transfer_cargo: function (url) { return /prev_cargo_id=in\./.test(decodeURIComponent(url)) ? [] : [A, B, C, D, E, F]; },
      transfer_cargo_events: function () { return st.events ? st.events() : [EV_DN]; },
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: [], loading_list_products: [],
      loading_list_photos: [], app_settings: [], goods_transit: [], stores: [], contacts: [], kasa_reports: [], kasa_storno: [],
      bulletin_tasks: [], recurring_tasks: [], task_completions: [], stock_differences: [], differences_reports: [], stock_returns: []
    }
  });
  h.w.transportOrders = []; h.w.clientOrders = [];
  h.sounds = 0; h.w.playSound = function () { h.sounds++; };
  h.notify = [];
  const realNotify = h.w.coNotifyToast;
  h.w.coNotifyToast = function (text, id, hover, onClick) { h.notify.push(text); return realNotify(text, id, hover, onClick); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }
async function open(h) { h.w.showModule('transfers'); await settle(); }
async function card(h, id) { h.w.openTransferCard(id); await ticks(); }
const acts = function (h, cid) { return $$(h, '.trf-card-cargo[data-c="' + cid + '"] .trf-act').map(function (b) { return b.className.match(/trf-act-(\w+)/)[1]; }); };
const posts = function (h) { return h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events'; }); };
const ntitle = function (h) { const c = $(h, '#notif-banner [data-notif="transfers"]'); return c ? c.querySelector('.notif-title').textContent : null; };

(async function () {

  section('a) Складът получава по единица от свое име');
  {
    const h = env(LOG2);
    ok('складът е глобален профил (isGlobal)', h.w.isGlobal() === true);
    ok('tfWarehouseStore() = своят обект', h.w.tfWarehouseStore() === WH);
    ok('tfActorStores() = [склада]', JSON.stringify(h.w.tfActorStores()) === JSON.stringify([WH]));
    ok('гледа всички (tfMyStores = null)', h.w.tfMyStores() === null);
    await open(h);
    ok('вижда и чуждия Враца-0009 в списъка', !!$(h, '#trf-table tr[data-id="v9"]'));
    await card(h, 'k7');
    const b = $(h, '.trf-card-cargo[data-c="a"] .trf-act-received');
    ok('„✅ Получен (90 остават)"', !!b && /Получен \(90 остават\)/.test(b.textContent), b && b.textContent);
    realClick(h.w, b); await ticks();
    ok('прозорчето — от името на склада, единица 1 избрана', /от името на Логистичен склад Търговище/.test(($(h, '#tfe-ov') || {}).textContent || '') && $(h, '#tfe-u-1').checked);
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const body = (posts(h)[0] || {}).body || {};
    ok('POST: received, unit 1, store = склада', body.event === 'received' && body.unit === 1 && body.store_name === WH && body.cargo_id === 'a', JSON.stringify(body));
    await card(h, 'v9');
    ok('чужд транспорт — без бутони', acts(h, 'd').length === 0, acts(h, 'd').join(','));
    h.close();
  }

  section('b) „Разтоварен" в точка на прехвърляне — складът');
  {
    const h = env(LOG2);
    await open(h); await card(h, 'k3');
    ok('Козлодуй-0003, товар за Кърджали през склада → „Разтоварен"', acts(h, 'c').indexOf('unloaded') >= 0, acts(h, 'c').join(','));
    h.close();
  }

  section('c) Нов транспорт — само от своя обект');
  {
    const h = env(LOG2);
    await open(h);
    ok('tfCreatorStores() = [склада]', JSON.stringify(h.w.tfCreatorStores()) === JSON.stringify([WH]), JSON.stringify(h.w.tfCreatorStores()));
    realClick(h.w, $(h, '#trf-new')); await ticks();
    ok('„От обект" е заковано на склада (без избор)', !$(h, '#trf-from') && (($(h, '#trf-from-fixed') || {}).textContent || '') === WH);
    h.close();
    const ha = env(ADMIN);
    await open(ha);
    ok('контрол: admin избира от целия списък', ha.w.tfCreatorStores().length > 1);
    ha.close();
  }

  section('d) admin, accounting, logistics без склад — без права');
  {
    for (const u of [[ADMIN, 'admin'], [ACC, 'accounting'], [LOG_NOWH, 'logistics без склад']]) {
      const h = env(u[0]);
      ok(u[1] + ': tfActorStores() = []', JSON.stringify(h.w.tfActorStores()) === '[]');
      ok(u[1] + ': tfWarehouseStore() = null', h.w.tfWarehouseStore() === null);
      await open(h); await card(h, 'k7');
      ok(u[1] + ': без „Получен"/„Разтоварен"', acts(h, 'a').filter(function (k) { return k === 'received' || k === 'unloaded'; }).length === 0, acts(h, 'a').join(','));
      h.close();
    }
  }

  section('e) Картата при вход и пулсът');
  {
    const h = env(LOG2);
    h.w.showLoginBanner(); await settle();
    ok('„91 бройки за потвърждение в Трансфери"', ntitle(h) === '91 бройки за потвърждение в Трансфери', ntitle(h));
    h.close();
    let k7 = Object.assign({}, K7);
    const st = { transfers: function () { return [k7, K3, V9, W1, DN]; } };
    const h2 = env(LOG2, st);
    h2.w.checkNewTransfers(); await settle();
    ok('пулс, цикъл 1 — тих', h2.sounds === 0);
    /* „Тръгна" СЛЕД първия цикъл — знакът е „сега", защото нищо не е тръгнало. */
    k7 = Object.assign({}, K7, { departed_at: new Date(Date.now() + 50).toISOString() });
    h2.w.checkNewTransfers(); await settle();
    ok('„Тръгна" към склада → звук', h2.sounds === 1, String(h2.sounds));
    ok('балонче „🔁 Тръгна Козлодуй-0007 към вас · от Козлодуй · 2 товара"', h2.notify[0] === '🔁 Тръгна Козлодуй-0007 към вас · от Козлодуй · 2 товара', JSON.stringify(h2.notify));
    h2.close();
    const ha = env(ADMIN);
    ha.w.showLoginBanner(); await settle();
    ha.w.checkNewTransfers(); await settle();
    ok('admin — без карта', !ntitle(ha));
    ok('admin — нула заявки към transfer*', ha.calls.get.filter(function (u) { return /\/rest\/v1\/transfer/.test(u); }).length === 0);
    ha.close();
    const hb = env(KOZ);
    ok('контрол: „1 бройка" в единствено число', hb.w.notifTransfersCardTitle(1, 0) === '1 бройка за потвърждение в Трансфери');
    hb.close();
  }

  section('f) tfCanDepart');
  {
    const h = env(ADMIN);
    await open(h);
    const T = function (id) { return h.w.tfFindTransfer(id); };
    ok('планиран, без отметки → null', h.w.tfCanDepart(T('k7')) === null, String(h.w.tfCanDepart(T('k7'))));
    ok('завършен → „Транспортът е завършен."', h.w.tfCanDepart(T('dn')) === 'Транспортът е завършен.', String(h.w.tfCanDepart(T('dn'))));
    h.w.tfEvents.push({ id: 'x1', cargo_id: 'a', transfer_id: 'k7', event: 'problem', store_name: WH, unit: null, created_at: ago(1) });
    ok('с отметка → „Има отметки по товарите."', h.w.tfCanDepart(T('k7')) === 'Има отметки по товарите.', String(h.w.tfCanDepart(T('k7'))));
    ok('куриер → причина', /Предаден на куриер/.test(h.w.tfCanDepart(Object.assign({}, K3, { mode: 'courier' })) || ''));
    await card(h, 'dn');
    ok('на завършения в картата няма „🚚 Тръгна"', !$(h, '#trf-depart'));
    h.close();
    const hw = env(LOG2);
    await open(hw);
    ok('складът — „Тръгна" за свой планиран (W1)', hw.w.tfCanDepart(hw.w.tfFindTransfer('w1')) === null);
    ok('складът — не за чужд (K7)', /създалият го обект/.test(hw.w.tfCanDepart(hw.w.tfFindTransfer('k7')) || ''));
    hw.close();
  }

  section('g) „Чакащи прехвърляне"');
  {
    const h = env(LOG2);
    ok('склад: „Чакащи прехвърляне при мен"', h.w.tfReshipLabel() === 'Чакащи прехвърляне при мен');
    ok('склад: обхватът е своят обект', JSON.stringify(h.w.tfReshipScope()) === JSON.stringify([WH]));
    h.close();
    const ha = env(ADMIN);
    ok('admin: „(всички обекти)"', ha.w.tfReshipLabel() === 'Чакащи прехвърляне (всички обекти)' && ha.w.tfReshipScope() === null);
    ha.close();
  }

  section('h) tfCanDelete за склада — само свои');
  {
    const h = env(LOG2);
    await open(h);
    ok('свой планиран (W1) → null', h.w.tfCanDelete(h.w.tfFindTransfer('w1')) === null, String(h.w.tfCanDelete(h.w.tfFindTransfer('w1'))));
    ok('чужд (K7) → „Изтрива създалият го обект или админ."', h.w.tfCanDelete(h.w.tfFindTransfer('k7')) === 'Изтрива създалият го обект или админ.');
    await card(h, 'w1');
    ok('в картата на W1 — „🗑 Изтрий"', !!$(h, '#trf-delete'));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
