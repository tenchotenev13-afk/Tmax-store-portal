/* Трансфери → свързаните клиентски заявки стават „Изпратена" (етап 1,
   05.11.2026, идея на Хасан Шатов, Склад Карлово). ИНТЕГРАЦИОНЕН:
   shared.js + client-orders.js + transfers.js в реда от index.html —
   syncLinkedTransport е в client-orders.js, а тук clientOrders е ПРАЗЕН
   (таб Трансфери), затова редът се подава изрично.

   Какво заковава файлът (истински клик на „🚚 Тръгна" / „Предаден на куриер"):
   а) pending / processed / approved, изпълнител = изпращачът → PATCH status 'sent'
   б) чужд изпълнител → без PATCH, в toast-а като пропусната
   в) sent / arrived / done / refused / postponed → без PATCH; статусът е
      СВЕЖ от базата (кешът в clientOrders казва pending за вече sent заявка)
   г) куриер — само заявките на предадения товар
   д) дотоварен товар (loaded_at_store) — изпращачът е дотоварилият обект
   е) paid_transport → PATCH transport_orders {awaiting_stock:true}
   ж) PATCH по заявка пада → червен toast с номера, маркер в картата,
      тръгването остава (няма връщане на departed_at)
   з) неуспешно „Тръгна" → 0 GET и 0 PATCH към client_orders
   и) редът: PATCH transfers (тръгването) е ПРЕДИ всеки PATCH client_orders

   Мутационна проверка (05.11.2026, всяка поотделно в transfers.js):
     1. махната проверката за изпълнител (tfCoNorm(r.fulfiller) !== …)  → пада а), б), д), toast
     2. махната проверката за статус (TF_CO_AUTO_FROM.indexOf…)        → пада а), в), toast
     3. tfCoAutoSent извикан ПРЕДИ sbPatch('transfers', …) в submitDepart → пада а), е), з)
        (и) сама НЕ пада: PATCH-ът по заявките чака GET-а и пак излиза
        след PATCH transfers — редът се пази от з), не от и))
     4. провалът на syncLinkedTransport не влиза в sum.trFailed          → пада е2)
   И четирите събарят теста (exit 1).

   Пускане:  node tests/tf-co-auto-sent.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Враца', 'Монтана', 'Раднево', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };
const daysAgo = function (n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(9, 0, 0, 0); return d.toISOString(); };
const ISO = function (n) { return daysAgo(n).slice(0, 10); };

/* Бус Враца → Монтана → Раднево. c1 — от Враца; c2 — дотоварен в Монтана. */
const T = { id: 't1', transfer_num: 'Враца-0003', from_store: 'Враца', mode: 'bus', depart_date: ISO(0), depart_time: '08:00',
            driver: 'Иван', stops: ['Монтана'], end_store: 'Раднево', status: 'planned', created_at: daysAgo(2), departed_at: null, departed_by: null };
const C1 = { id: 'c1', transfer_id: 't1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Раднево', transfer_points: [],
             client_order_ids: ['o-pend', 'o-proc', 'o-appr', 'o-for', 'o-sent', 'o-arr', 'o-done', 'o-ref', 'o-post', 'o-pt'] };
const C2 = { id: 'c2', transfer_id: 't1', position: 2, kind: 'carton', qty: 1, recipient_store: 'Раднево', transfer_points: [],
             loaded_at_store: 'Монтана', client_order_ids: ['o-mont', 'o-vr2'] };
/* Куриер Враца с два товара. */
const K = { id: 'k1', transfer_num: 'Враца-0004', from_store: 'Враца', mode: 'courier', courier_company: 'Econt', waybill_no: null,
            stops: [], end_store: 'Раднево', status: 'planned', created_at: daysAgo(1), departed_at: null };
const KC1 = { id: 'kc1', transfer_id: 'k1', position: 1, kind: 'carton', qty: 1, recipient_store: 'Раднево', transfer_points: [], client_order_ids: ['o-k1'] };
const KC2 = { id: 'kc2', transfer_id: 'k1', position: 2, kind: 'carton', qty: 1, recipient_store: 'Раднево', transfer_points: [], client_order_ids: ['o-k2'] };

const CO = function (id, num, status, fulfiller, extra) {
  return Object.assign({ id: id, in_num: num, status: status, fulfiller: fulfiller, store_name: 'Раднево', paid_transport: false, transport_id: null }, extra || {});
};
const ORDERS = [
  CO('o-pend', 'Враца-0042', 'pending', 'Враца'),
  CO('o-proc', 'Враца-0043', 'processed', ' враца '),   /* интервал и малки букви — същият обект */
  CO('o-appr', 'Враца-0044', 'approved', 'Враца'),
  CO('o-for',  'Враца-0045', 'pending', 'Централен офис'),
  CO('o-sent', 'Враца-0046', 'sent', 'Враца'),
  CO('o-arr',  'Враца-0047', 'arrived', 'Враца'),
  CO('o-done', 'Враца-0048', 'done', 'Враца'),
  CO('o-ref',  'Враца-0049', 'refused', 'Враца'),
  CO('o-post', 'Враца-0050', 'postponed', 'Враца'),
  CO('o-pt',   'Враца-0051', 'processed', 'Враца', { paid_transport: true, transport_id: 'tr-9' }),
  CO('o-mont', 'Монтана-0007', 'pending', 'Монтана'),
  CO('o-vr2',  'Враца-0052', 'pending', 'Враца'),        /* в товара на Монтана — чужд за него */
  CO('o-k1',   'Враца-0060', 'pending', 'Враца'),
  CO('o-k2',   'Враца-0061', 'pending', 'Враца')
];
const SKIP = ['o-sent', 'o-arr', 'o-done', 'o-ref', 'o-post'];

/* Фалшивият PostgREST: id=in.(…) се филтрира като в базата. */
function coRows(url) {
  const m = /id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
  if (!m) return ORDERS;
  const want = m[1].split(',');
  return ORDERS.filter(function (o) { return want.indexOf(o.id) >= 0; });
}

function env(user, opts) {
  opts = opts || {};
  const box = { h: null };
  const storedEvents = function () {
    const rows = box.h ? [].concat.apply([], box.h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events'; })
      .map(function (p) { return Array.isArray(p.body) ? p.body : [p.body]; })) : [];
    return rows.map(function (r, i) { return Object.assign({ id: 'ev-' + i, created_at: new Date().toISOString() }, r); });
  };
  const h = boot({
    modules: ['client-orders.js', 'stock-differences.js', 'report.js', 'transfers.js', 'notifications.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: [T, K], transfer_cargo: [C1, C2, KC1, KC2], transfer_cargo_events: storedEvents,
      client_orders: coRows, transport_orders: [], loading_lists: [], loading_list_items: [], app_settings: []
    },
    fail: opts.fail
  });
  box.h = h;
  /* Таб Трансфери: Клиентски заявки не са зареждани — с една стара (кеширана)
     заявка, чийто статус в базата вече е sent. */
  h.w.clientOrders = opts.cache || [];
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, c: c }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const coPatches = function (h) { return h.calls.patch.filter(function (p) { return p.table === 'client_orders'; }); };
const coPatchedIds = function (h) { return coPatches(h).map(function (p) { return (/id=eq\.([^&]+)/.exec(p.url) || [])[1]; }).sort(); };
const lastToast = function (h) { return h.toasts[h.toasts.length - 1] || { m: '' }; };
async function settle() { for (let i = 0; i < 6; i++) await ticks(); }
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); }
async function depart(h) {
  await open(h);
  h.w.openTransferCard('t1'); await ticks();
  realClick(h.w, $(h, '#trf-depart')); await ticks();
  realClick(h.w, $(h, '#tfd-save')); await settle();
}

(async function () {

  section('а–в, д, е, и) „🚚 Тръгна" — кои заявки стават „Изпратена"');
  {
    const h = env(U('Враца'), { cache: [CO('o-sent', 'Враца-0046', 'pending', 'Враца')] });
    await depart(h);
    const tp = h.calls.patch.filter(function (p) { return p.table === 'transfers'; });
    ok('тръгването е записано', tp.length === 1 && !!tp[0].body.departed_at);
    const got = coPatchedIds(h);
    const want = ['o-appr', 'o-mont', 'o-pend', 'o-proc', 'o-pt'];
    ok('а) PATCH точно за pending / processed / approved на изпращача (+ д) Монтана)', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
    ok('а) тялото е само {status:"sent"}', coPatches(h).every(function (p) { return JSON.stringify(p.body) === '{"status":"sent"}'; }));
    ok('б) чужд изпълнител (ЦО) — без PATCH', got.indexOf('o-for') < 0);
    ok('в) sent / arrived / done / refused / postponed — без PATCH', SKIP.every(function (id) { return got.indexOf(id) < 0; }));
    ok('в) статусът е свеж от базата (кешът казва pending за o-sent)', got.indexOf('o-sent') < 0 &&
      h.calls.get.some(function (u) { return /client_orders\?select=id,in_num,status,fulfiller,paid_transport,transport_id&id=in\./.test(decodeURIComponent(u)); }));
    ok('д) дотоварен в Монтана: заявка на Враца в товара на Монтана — чужда', got.indexOf('o-vr2') < 0);
    const tr = h.calls.patch.filter(function (p) { return p.table === 'transport_orders'; });
    ok('е) платен транспорт → PATCH transport_orders tr-9 {awaiting_stock:true} (clientOrders празен)',
      tr.length === 1 && /id=eq\.tr-9$/.test(tr[0].url) && JSON.stringify(tr[0].body) === '{"awaiting_stock":true}', JSON.stringify(tr));
    const iT = h.calls.patch.findIndex(function (p) { return p.table === 'transfers'; });
    const iC = h.calls.patch.findIndex(function (p) { return p.table === 'client_orders'; });
    ok('и) PATCH transfers е преди първия PATCH client_orders', iT >= 0 && iC > iT, iT + ' / ' + iC);
    const m = lastToast(h).m;
    ok('toast: тръгна + „5 клиентски заявки → Изпратена (…)"', /^🚚 Враца-0003 тръгна в /.test(m) &&
      /✅ 5 клиентски заявки → Изпратена \(Враца-0042, Враца-0043, Враца-0044, Враца-0051, Монтана-0007\)/.test(m), m);
    ok('б) toast: отделен ред с пропуснатите по изпълнител', /\nНе са маркирани — изпълнител е друг обект: Враца-0045, Враца-0052$/.test(m), m);
    ok('toast не е червен (няма провал)', lastToast(h).c !== '#dc2626');
    ok('без маркер в картата', !$(h, '.trf-co-sync-failed'));
    ok('без грешки към базата', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
    h.close();
  }

  section('г) Куриер — само заявките на предадения товар');
  {
    const h = env(U('Враца'));
    await open(h);
    realClick(h.w, $(h, '.trf-filter[data-f="mine"]')); await ticks();
    realClick(h.w, $(h, '.trf-pending-row[data-c="kc1"] .trf-act-handed_to_courier')); await ticks();
    const wb = $(h, '#tfe-waybill'); wb.value = '1055501234'; fire(h.w, wb, 'input');
    realClick(h.w, $(h, '#tfe-save')); await settle();
    const ev = h.calls.post.filter(function (p) { return p.table === 'transfer_cargo_events'; });
    ok('отметката е записана', ev.length === 1 && ev[0].body.event === 'handed_to_courier');
    ok('PATCH само за o-k1 (не и o-k2 от другия товар)', JSON.stringify(coPatchedIds(h)) === '["o-k1"]', JSON.stringify(coPatchedIds(h)));
    ok('toast: „Предаден на куриер" + 1 заявка', /^✅ Предаден на куриер\n✅ 1 клиентски заявки → Изпратена \(Враца-0060\)$/.test(lastToast(h).m), lastToast(h).m);
    h.close();
  }

  section('ж) PATCH по заявка пада → червен toast, маркер, тръгването остава');
  {
    const h = env(U('Враца'), { fail: { PATCH: /client_orders\?id=eq\.o-proc/ } });
    await depart(h);
    const tp = h.calls.patch.filter(function (p) { return p.table === 'transfers'; });
    ok('тръгването е записано и не е върнато (1 PATCH, без departed_at:null)', tp.length === 1 && !!tp[0].body.departed_at);
    ok('другите заявки пак са обновени', coPatchedIds(h).indexOf('o-pend') >= 0);
    const t = lastToast(h);
    ok('червен toast с номера', t.c === '#dc2626' && /⚠️ НЕ са обновени на „Изпратена“: Враца-0043 — отбележи ги ръчно/.test(t.m), JSON.stringify(t));
    ok('успешните са в същия toast', /✅ 4 клиентски заявки → Изпратена/.test(t.m), t.m);
    h.w.openTransferCard('t1'); await ticks();
    const mk = $(h, '.trf-card-cargo[data-c="c1"] .trf-co-sync-failed');
    ok('маркер в картата на товара: Враца-0043', !!mk && /Враца-0043/.test(mk.textContent), mk && mk.textContent);
    ok('маркерът не е на товара на Монтана', !$(h, '.trf-card-cargo[data-c="c2"] .trf-co-sync-failed'));
    ok('departed_at остава в паметта', !!h.w.tfFindTransfer('t1').departed_at);
    h.close();
  }

  section('е2) Синхронизацията на платения транспорт пада → ред в общия toast');
  {
    const h = env(U('Враца'), { fail: { PATCH: /transport_orders/ } });
    await depart(h);
    const t = lastToast(h);
    ok('заявката е „Изпратена", транспортът — не: ред в toast-а, не погълнат', coPatchedIds(h).indexOf('o-pt') >= 0 &&
      /\n⚠️ Платеният транспорт НЕ е обновен за: Враца-0051 — провери в таб Транспорт/.test(t.m) && t.c !== '#16a34a', JSON.stringify(t));
    h.close();
  }

  section('ж2) Четенето на заявките пада → всички са „НЕ обновени", без PATCH');
  {
    const h = env(U('Враца'), { fail: { GET: /client_orders\?select=id,in_num,status/ } });
    await depart(h);
    ok('0 PATCH към client_orders', coPatches(h).length === 0);
    const t = lastToast(h);
    ok('червен toast „НЕ са обновени"', t.c === '#dc2626' && /НЕ са обновени/.test(t.m), JSON.stringify(t));
    ok('тръгването остава', !!h.w.tfFindTransfer('t1').departed_at);
    h.close();
  }

  section('з) Неуспешно „Тръгна" → никакви заявки');
  {
    const h = env(U('Враца'), { fail: { PATCH: /transfers\?id=eq\.t1/ } });
    await depart(h);
    ok('„Тръгна" НЕ е записано (червен toast)', /„Тръгна“ НЕ е записано/.test(lastToast(h).m), lastToast(h).m);
    ok('0 PATCH към client_orders', coPatches(h).length === 0);
    ok('0 GET на статусите', !h.calls.get.some(function (u) { return /client_orders\?select=id,in_num,status/.test(decodeURIComponent(u)); }));
    ok('0 PATCH към transport_orders', h.calls.patch.filter(function (p) { return p.table === 'transport_orders'; }).length === 0);
    h.close();
  }

  section('Ръчният бутон в Клиентски заявки — непроменен (syncLinkedTransport от кеша)');
  {
    const h = env(U('Враца'), { cache: [CO('o-pt', 'Враца-0051', 'processed', 'Враца', { paid_transport: true, transport_id: 'tr-9' })] });
    h.w.setClientStatus('o-pt', 'sent'); await settle();
    ok('PATCH client_orders {status:sent}', coPatches(h).length === 1 && coPatches(h)[0].body.status === 'sent');
    const tr = h.calls.patch.filter(function (p) { return p.table === 'transport_orders'; });
    ok('синхронизацията от кеша работи както преди', tr.length === 1 && tr[0].body.awaiting_stock === true);
    h.close();
  }

  report();
})();
