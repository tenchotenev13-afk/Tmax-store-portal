/* Трансфери → етап 2: началният обект дотоварва (с клиентска заявка) създаден,
   още нетръгнал транспорт през съществуващия „➕ Дотовари" (05.11.2026, идея на
   Хасан Шатов, Склад Карлово; решение на Тенчо — без нов бутон).
   ИНТЕГРАЦИОНЕН: shared.js + client-orders.js + transfers.js + notifications.js
   в реда от index.html.

   Какво заковава файлът (истински клик):
   а) началният обект вижда „➕ Дотовари" на нетръгнал бус, камион и куриер без отметки
   б) не го вижда след „Тръгна", при куриер след първото „Предаден", при Завършен
   в) чужд обект, крайната точка и глобални роли (admin, accounting) — не за началото
   г) междинна спирка — както досега, и след тръгване
   д) формата на началния обект: „➕ Добави товар — <№>", маршрутът е целият
   е) запис → нов ред в transfer_cargo с client_order_ids (избрана през
      същия datalist като при създаване), loaded_at_store = null → изпращач =
      началният обект, без „дотоварен в" в картата; куриер — получателят е
      крайната точка
   ж) кешът казва „нетръгнал", базата — тръгнал (или има отметка, или
      четенето пада) → 0 POST, червен toast
   з) после „🚚 Тръгна" → заявката от добавения товар става sent (етап 1)

   Мутационна проверка (05.11.2026, всяка поотделно в transfers.js):
     1. махната проверката за departed_at в tfOriginCanReload  → пада б) бус/камион, ж) тръгнал (5 ❌)
     2. махната проверката за отметки в tfOriginCanReload      → пада б) куриер, ж) отметка (5 ❌)
     3. махната свежата проверка преди POST (fresh = null)      → пада е) свежа проверка, ж) и трите (10 ❌)
     4. loaded_at_store = f.from_store и за началния обект      → пада е), е2) (3 ❌)
   И четирите събарят теста (exit 1).

   Пускане:  node tests/tf-co-stage2-origin-reload.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Враца', 'Монтана', 'Раднево', 'Варна', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ACC = { id: 'acc', email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' };
const daysAgo = function (n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(9, 0, 0, 0); return d.toISOString(); };
const ISO = function (n) { return daysAgo(n).slice(0, 10); };

/* Бус Враца → Монтана → Раднево; камион Враца → Раднево; куриер Враца → Раднево. */
const BUS = { id: 't1', transfer_num: 'Враца-0003', from_store: 'Враца', mode: 'bus', depart_date: ISO(0), depart_time: '08:00',
              driver: 'Иван', stops: ['Монтана'], end_store: 'Раднево', status: 'planned', created_at: daysAgo(2), departed_at: null };
const TRUCK = { id: 't3', transfer_num: 'Враца-0005', from_store: 'Враца', mode: 'truck', plate_no: 'ВР1234АВ', depart_date: ISO(0), depart_time: '09:00',
                driver: 'Петър', stops: [], end_store: 'Раднево', status: 'planned', created_at: daysAgo(2), departed_at: null };
const K = { id: 'k1', transfer_num: 'Враца-0004', from_store: 'Враца', mode: 'courier', courier_company: 'Econt', waybill_no: null,
            stops: [], end_store: 'Раднево', status: 'planned', created_at: daysAgo(1), departed_at: null };
const C1 = { id: 'c1', transfer_id: 't1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Раднево', transfer_points: [], client_order_ids: [] };
const C3 = { id: 'c3', transfer_id: 't3', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Раднево', transfer_points: [], client_order_ids: [] };
const KC = { id: 'kc', transfer_id: 'k1', position: 1, kind: 'carton', qty: 1, recipient_store: 'Раднево', transfer_points: [], client_order_ids: [] };
const departed = function (t) { return Object.assign({}, t, { departed_at: daysAgo(0), departed_by: 'Управител Враца', status: 'sent' }); };
const HANDED = { id: 'e-h', cargo_id: 'kc', transfer_id: 'k1', store_name: 'Враца', event: 'handed_to_courier', unit: null, waybill_no: '1055', created_at: daysAgo(0) };

const ORDERS = [
  { id: 'o-42', in_num: 'Враца-0042', status: 'pending', fulfiller: 'Враца', store_name: 'Раднево', customer_name: 'Иванов',
    product: 'Мивка', sap: '100200', qty: 1, unit: 'бр.', items: null, paid_transport: false, transport_id: null }
];
function coRows(url) {
  const m = /id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
  if (!m) return ORDERS;
  const want = m[1].split(',');
  return ORDERS.filter(function (o) { return want.indexOf(o.id) >= 0; });
}

/* opts.transfers — кешът (зарежда се при отваряне); opts.db — какво връща
   свежото четене с вградените отметки (по подразбиране = кешът + отметките). */
function env(user, opts) {
  opts = opts || {};
  const box = { h: null };
  const postedOf = function (table) {
    const out = [];
    if (!box.h) return out;
    box.h.calls.post.filter(function (p) { return p.table === table; }).forEach(function (p) { [].concat(p.body).forEach(function (b) { out.push(b); }); });
    return out;
  };
  const cargo = function () {
    return (opts.cargo || [C1, C3, KC]).concat(postedOf('transfer_cargo').map(function (b, i) { return Object.assign({ id: 'new-' + i }, b); }));
  };
  const events = function () {
    return (opts.events || []).concat(postedOf('transfer_cargo_events').map(function (b, i) { return Object.assign({ id: 'ev-' + i, created_at: new Date().toISOString() }, b); }));
  };
  const transfers = function (url) {
    const u = decodeURIComponent(url);
    if (/transfer_cargo_events\(id\)/.test(u)) {
      if (opts.db) return opts.db(u);
      const id = (/id=eq\.([^&]+)/.exec(u) || [])[1];
      return (opts.transfers || [BUS, TRUCK, K]).filter(function (t) { return t.id === id; }).map(function (t) {
        return Object.assign({}, t, { transfer_cargo_events: events().filter(function (e) { return e.transfer_id === id; }).map(function (e) { return { id: e.id }; }) });
      });
    }
    return opts.transfers || [BUS, TRUCK, K];
  };
  const h = boot({
    modules: ['client-orders.js', 'stock-differences.js', 'report.js', 'transfers.js', 'notifications.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: transfers, transfer_cargo: cargo, transfer_cargo_events: events,
      client_orders: coRows, transport_orders: [], loading_lists: [], loading_list_items: [], app_settings: []
    },
    fail: opts.fail
  });
  box.h = h;
  h.w.clientOrders = [];
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, c: c }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
const posts = function (h, table) { return h.calls.post.filter(function (p) { return p.table === table; }); };
const lastToast = function (h) { return h.toasts[h.toasts.length - 1] || { m: '' }; };
function setSel(h, el, val) { el.value = val; fire(h.w, el, 'change'); }
function setInp(h, el, val) { el.value = val; fire(h.w, el, 'input'); }
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); }
async function card(h, id) { h.w.openTransferCard(id); await ticks(); }
const reloadBtns = function (h) { return $$(h, '#trf-card .trf-reload').map(function (b) { return b.getAttribute('data-s'); }); };
async function hasOrigin(h, id) { await card(h, id); const r = !!$(h, '#trf-card') && reloadBtns(h).indexOf('Враца') >= 0; h.w.closeTransferCard(); await ticks(); return r; }

/* Отваря формата от началния обект, попълва товар с КЗ Враца-0042 и записва. */
async function addCargo(h, id, withRecipient) {
  await card(h, id);
  realClick(h.w, $(h, '#trf-card .trf-reload[data-s="Враца"]')); await settle();
  if (withRecipient) setSel(h, $(h, '.trf-recipient'), 'Раднево');
  setInp(h, $(h, '.trf-qty'), '2');
  const label = $$(h, 'datalist[id^="trf-dl-co-"] option').map(function (o) { return o.getAttribute('value'); }).filter(function (v) { return /Враца-0042/.test(v); })[0];
  const inp = $(h, '.trf-link-co');
  inp.value = label || ''; fire(h.w, inp, 'change'); await ticks();
  realClick(h.w, $(h, '#trf-save')); await settle();
  return label;
}

(async function () {

  section('а) Началният обект вижда „➕ Дотовари" — бус, камион, куриер без отметки');
  {
    const h = env(U('Враца'));
    await open(h);
    ok('бус, нетръгнал', await hasOrigin(h, 't1'));
    ok('камион, нетръгнал', await hasOrigin(h, 't3'));
    ok('куриер без отметки', await hasOrigin(h, 'k1'));
    h.close();
  }

  section('б) Не вижда след „Тръгна", при куриер след „Предаден", при Завършен');
  {
    const h1 = env(U('Враца'), { transfers: [departed(BUS), departed(TRUCK), K] });
    await open(h1);
    ok('бус след „Тръгна" — без бутон', !(await hasOrigin(h1, 't1')));
    ok('камион след „Тръгна" — без бутон', !(await hasOrigin(h1, 't3')));
    h1.close();
    const h2 = env(U('Враца'), { events: [HANDED] });
    await open(h2);
    ok('куриер след първото „Предаден" — без бутон', !(await hasOrigin(h2, 'k1')));
    h2.close();
    const h3 = env(U('Враца'), { transfers: [Object.assign({}, BUS, { status: 'done' }), TRUCK, K] });
    await open(h3);
    ok('Завършен (status done) — без бутон', !(await hasOrigin(h3, 't1')));
    h3.close();
    ok('tfOriginCanReload: отметка без departed_at → не', h3.w.tfOriginCanReload(BUS, [{ id: 'x' }]) === false);
  }

  section('в) Чужд обект, крайна точка, глобални роли — не за началото');
  {
    for (const u of [[U('Раднево'), 'крайната точка'], [U('Варна'), 'чужд обект'], [ADMIN, 'admin'], [ACC, 'accounting']]) {
      const h = env(u[0]);
      await open(h); await card(h, 't1');
      ok(u[1] + ': без „Дотовари" за Враца', reloadBtns(h).indexOf('Враца') < 0 && !reloadBtns(h).length, JSON.stringify(reloadBtns(h)));
      h.close();
    }
  }

  section('г) Междинна спирка — както досега');
  {
    const h = env(U('Монтана'));
    await open(h); await card(h, 't1');
    ok('Монтана вижда „Дотовари" за себе си (не за Враца)', JSON.stringify(reloadBtns(h)) === '["Монтана"]', JSON.stringify(reloadBtns(h)));
    realClick(h.w, $(h, '#trf-card .trf-reload')); await settle();
    ok('спирката: заглавие „Дотоварване в Монтана"', /Дотоварване в Монтана — Враца-0003/.test($(h, '#mod-transfers .pg-title').textContent));
    ok('спирката: маршрутът оттук — Монтана → Раднево', /🏁 Монтана\s*→ Раднево$/.test($(h, '#trf-reload-route').textContent.trim()), $(h, '#trf-reload-route').textContent);
    h.close();
    const h2 = env(U('Монтана'), { transfers: [departed(BUS), TRUCK, K] });
    await open(h2); await card(h2, 't1');
    ok('спирката и след „Тръгна"', JSON.stringify(reloadBtns(h2)) === '["Монтана"]');
    h2.close();
  }

  section('д–е) Формата на началния обект + запис (бус)');
  {
    const h = env(U('Враца'));
    await open(h); await card(h, 't1');
    realClick(h.w, $(h, '#trf-card .trf-reload[data-s="Враца"]')); await settle();
    ok('д) заглавие „➕ Добави товар — Враца-0003"', $(h, '#mod-transfers .pg-title').textContent.trim() === '➕ Добави товар — Враца-0003', $(h, '#mod-transfers .pg-title').textContent);
    ok('д) маршрутът е целият: Враца → Монтана → Раднево', /🏁 Враца\s*→ Монтана → Раднево$/.test($(h, '#trf-reload-route').textContent.trim()), $(h, '#trf-reload-route').textContent);
    const recOpts = Array.prototype.map.call($(h, '.trf-recipient').options, function (o) { return o.value; });
    ok('д) получател: Монтана и Раднево да, Враца не', recOpts.indexOf('Монтана') >= 0 && recOpts.indexOf('Раднево') >= 0 && recOpts.indexOf('Враца') < 0, recOpts.join(','));
    h.w.closeTransferForm && h.w.closeTransferForm();
    h.close();

    const h2 = env(U('Враца'));
    await open(h2);
    const label = await addCargo(h2, 't1', true);
    ok('е) КЗ се избира от същия datalist като при създаване', !!label, label);
    ok('е) свежа проверка в базата преди POST', h2.calls.get.some(function (u) { return /transfers\?select=id,departed_at,status,transfer_cargo_events\(id\)&id=eq\.t1/.test(decodeURIComponent(u)); }));
    const p = posts(h2, 'transfer_cargo');
    const row = p[0] ? [].concat(p[0].body)[0] : {};
    ok('е) записан е един товар към t1, позиция 2', p.length === 1 && row.transfer_id === 't1' && row.position === 2, JSON.stringify(row));
    ok('е) client_order_ids = ["o-42"]', JSON.stringify(row.client_order_ids) === '["o-42"]', JSON.stringify(row));
    ok('е) loaded_at_store = null', row.loaded_at_store === null, JSON.stringify(row));
    const t = h2.w.tfFindTransfer('t1');
    const nc = (h2.w.tfCargoByTransfer.t1 || []).filter(function (c) { return c.id === 'new-0'; })[0];
    ok('е) изпращачът е Враца (tfCargoSender)', !!nc && h2.w.tfCargoSender(t, nc) === 'Враца');
    const el = $(h2, '.trf-card-cargo[data-c="new-0"]');
    ok('е) в картата — без „дотоварен"', !!el && !/дотоварен/.test(el.textContent), el && el.textContent.slice(0, 120));
    ok('е) toast „✅ Дотоварено в Враца-0003"', h2.toasts.some(function (x) { return x.m === '✅ Дотоварено в Враца-0003'; }));

    section('з) После „🚚 Тръгна" → заявката от добавения товар става sent');
    realClick(h2.w, $(h2, '#trf-depart')); await ticks();
    realClick(h2.w, $(h2, '#tfd-save')); await settle();
    const cp = h2.calls.patch.filter(function (x) { return x.table === 'client_orders'; });
    ok('PATCH client_orders o-42 {status:sent}', cp.length === 1 && /id=eq\.o-42$/.test(cp[0].url) && cp[0].body.status === 'sent', JSON.stringify(cp));
    ok('toast: „1 клиентски заявки → Изпратена (Враца-0042)"', /✅ 1 клиентски заявки → Изпратена \(Враца-0042\)/.test(lastToast(h2).m), lastToast(h2).m);
    h2.close();
  }

  section('е2) Куриер без отметки — товарът е към получателя');
  {
    const h = env(U('Враца'));
    await open(h);
    await addCargo(h, 'k1', false);
    const p = posts(h, 'transfer_cargo');
    const row = p[0] ? [].concat(p[0].body)[0] : {};
    ok('записан товар към k1 → Раднево, loaded_at_store null, КЗ o-42', p.length === 1 && row.transfer_id === 'k1' && row.recipient_store === 'Раднево' &&
      row.loaded_at_store === null && JSON.stringify(row.client_order_ids) === '["o-42"]', JSON.stringify(row) + ' ' + JSON.stringify(h.toasts.slice(-2)));
    h.close();
  }

  section('ж) Кешът — нетръгнал, базата — тръгнал / с отметка / непрочетена → нищо');
  {
    const cases = [
      ['базата: тръгнал', function () { return [Object.assign({}, BUS, { departed_at: daysAgo(0), transfer_cargo_events: [] })]; }, /^Транспортът вече е тръгнал — товарът не е добавен$/],
      ['базата: има отметка', function () { return [Object.assign({}, BUS, { transfer_cargo_events: [{ id: 'e1' }] })]; }, /^Транспортът вече е тръгнал — товарът не е добавен$/],
      ['четенето пада', null, /Не успях да проверя транспорта/]
    ];
    for (const c of cases) {
      const h = env(U('Враца'), c[1] ? { db: c[1] } : { fail: { GET: /transfer_cargo_events\(id\)/ } });
      await open(h);
      await addCargo(h, 't1', true);
      ok(c[0] + ': 0 POST към transfer_cargo', posts(h, 'transfer_cargo').length === 0);
      const t = lastToast(h);
      ok(c[0] + ': червен toast', t.c === '#dc2626' && c[2].test(t.m), JSON.stringify(t));
      ok(c[0] + ': формата остава отворена, бутонът не е заключен', !!$(h, '#trf-form') && !$(h, '#trf-save').disabled);
      h.close();
    }
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
