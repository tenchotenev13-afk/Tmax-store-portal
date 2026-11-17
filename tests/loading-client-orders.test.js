/* Товарни листи: „📋 Дължими клиентски заявки" в редактора (етап 1, 17.11.2026).

   Само показване. Пази се тук:
     а) нов лист за склад Добрич → заявките на склада, групирани по обект, с брой;
     б) чужд изпълнител и статуси sent/arrived/done/refused не се показват —
        и самият низ на заявката носи fulfiller=eq.<склад> и not.in.(…);
     в) празен резултат → „Няма дължими клиентски заявки", блокът е на екрана;
     г) паднала заявка → червен toast + „не се заредиха", листът се записва;
     д) редакция на чернова → блокът е там;
     е) вход като обект → няма блок и няма заявка към client_orders;
     ж) <script> в клиент/артикул излиза ескейпнат;
     з) интеграционно: shared.js + client-orders.js + loading.js + transfers.js
        в реда от index.html; блокът е само четене (нула PATCH/POST към
        client_orders).
   Фикстурата ФИЛТРИРА по URL-а (fulfiller / status), както PostgREST — затова
   махнат филтър в кода вкарва чуждите редове на екрана.

   Мутационна проверка (17.11.2026, всеки мутант срещу този тест):
     1) махнат &fulfiller=eq.<склад> от заявката              → ПАДА (б)
     2) махнат &status=not.in.(…) от заявката                  → ПАДА (б)
     3) .catch поглъща грешката без llCoError / toast          → ПАДА (г)
     4) llCoBlockHtml() без esc() около етикета                → ПАДА (ж)
     5) без проверката llCanEdit() в llLoadClientOrders        → ОЦЕЛЯВА —
        еквивалентен: за обект llActiveWarehouse() е '' и заявка не тръгва и
        без нея; проверката е втора защита, (е) пази резултата.

   Пускане:  node tests/loading-client-orders.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, btn } = H;

const DOB = 'Логистичен склад Добрич';
const TG = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.dob@temax.bg', display_name: 'Склад Добрич',
                    role: 'sklad', store_name: DOB, assigned_stores: [] };
const STORE = { email: 'varna@temax.bg', display_name: 'Варна', role: 'store',
                store_name: 'Варна', assigned_stores: [] };
const NEW_ID = 'L-NEW';

const ORDERS = [
  { id: 'c1', in_num: '1001', store_name: 'Варна', customer_name: 'Иван Петров', status: 'pending',
    created_at: '2026-11-10T09:00:00+00:00', delivery: '2026-11-20', fulfiller: DOB,
    product: 'Диван ъглов', sap: '500123', qty: 1, unit: 'бр', items: null },
  { id: 'c2', in_num: '1002', store_name: 'Варна', customer_name: 'Мария', status: 'pending',
    created_at: '2026-11-11T09:00:00+00:00', delivery: null, fulfiller: DOB,
    product: null, sap: null, qty: null, unit: null,
    items: [{ product: 'Маса', sap: '700', qty: 2, unit: 'бр' }, { product: 'Стол', sap: '701', qty: 4, unit: 'бр' }] },
  { id: 'c3', in_num: '1003', store_name: 'Бургас', customer_name: 'Георги', status: 'pending',
    created_at: '2026-11-12T09:00:00+00:00', delivery: '2026-11-25', fulfiller: DOB,
    product: 'Гардероб', sap: '800', qty: 1, unit: 'бр', items: null },
  /* не трябва да се виждат */
  { id: 'x-tg', in_num: '9001', store_name: 'Варна', customer_name: 'ЧУЖД-СКЛАД', status: 'pending',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: TG, product: 'А', items: null },
  { id: 'x-sent', in_num: '9002', store_name: 'Варна', customer_name: 'СТАТУС-SENT', status: 'sent',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null },
  { id: 'x-arr', in_num: '9003', store_name: 'Варна', customer_name: 'СТАТУС-ARRIVED', status: 'arrived',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null },
  { id: 'x-done', in_num: '9004', store_name: 'Варна', customer_name: 'СТАТУС-DONE', status: 'done',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null },
  { id: 'x-ref', in_num: '9005', store_name: 'Варна', customer_name: 'СТАТУС-REFUSED', status: 'refused',
    created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB, product: 'А', items: null }
];

/* PostgREST накратко: fulfiller=eq.X и status=not.in.(a,b) — колкото ползва кодът. */
function coRoute(rows) {
  return function (url) {
    const q = decodeURIComponent(String(url).split('?')[1] || '');
    let out = rows.slice();
    const f = /(?:^|&)fulfiller=eq\.([^&]*)/.exec(q);
    if (f) out = out.filter(r => r.fulfiller === f[1]);
    const s = /(?:^|&)status=not\.in\.\(([^)]*)\)/.exec(q);
    if (s) { const ex = s[1].split(','); out = out.filter(r => ex.indexOf(r.status) < 0); }
    if (/order=store_name\.asc,created_at\.asc/.test(q))
      out.sort((a, b) => a.store_name.localeCompare(b.store_name, 'bg') || (a.created_at < b.created_at ? -1 : 1));
    const off = /(?:^|&)offset=(\d+)/.exec(q);
    return off && +off[1] > 0 ? [] : out;
  };
}

const L_DRAFT = { id: 'L9', warehouse: DOB, list_date: '2026-11-16', status: 'draft',
                  executed_by: 'Иван', comment: '', created_at: 'x', sent_at: null, done_at: null };
const OLD_ITEMS = [
  { id: 'I1', list_id: 'L9', position: 1, kind: 'pallet', pallet_no: 1, pallet_total: 1,
    purchase_doc: 'ИЗХ-1', clears_doc: null, store_name: 'Варна', warehouse_comment: null,
    store_comment: null, partial: false, received: false, missing: false, created_at: 'x' }
];

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['client-orders.js', 'transport.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js', 'transfers.js'],
    user: opts.user || WAREHOUSE, confirm: true,
    data: {
      app_settings: [],
      client_orders: coRoute(opts.orders || ORDERS),
      loading_lists: opts.lists || [],
      loading_list_items: () => (opts.items || []).map(r => Object.assign({}, r, { loading_list_products: [] })),
      users: [{ store_name: 'Варна' }, { store_name: 'Бургас' }, { store_name: DOB }],
      loading_list_products: [], loading_list_photos: [], stores: [], contacts: [], transport_orders: [],
      stock_differences: [], differences_reports: [], stock_returns: [], goods_transit: []
    },
    fail: opts.fail
  });
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const m = ((init || {}).method || 'GET').toUpperCase();
    if (m === 'POST' && /\/rest\/v1\/loading_lists(\?|$)/.test(String(url))) {
      return inner(url, init).then(function () {
        let body = {}; try { body = JSON.parse(init.body); } catch (e) {}
        const row = Object.assign({ id: NEW_ID }, Array.isArray(body) ? body[0] : body);
        return { ok: true, status: 201, json: () => Promise.resolve([row]),
                 text: () => Promise.resolve(JSON.stringify([row])), headers: { get: () => null } };
      });
    }
    return inner(url, init);
  };
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: m, col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
const block = h => mod(h).querySelector('[data-ll-co]');
const coGets = h => h.calls.get.filter(u => /\/client_orders\?/.test(u));
async function settle() { for (let k = 0; k < 6; k++) await ticks(); }

(async function () {

  section('а) Нов лист, склад Добрич — заявките, групирани по обект');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е на екрана', !!b)) {
      ok('заглавие с брой 3', /Дължими клиентски заявки \(3\)/.test(b.textContent), b.textContent.slice(0, 80));
      const st = Array.from(b.querySelectorAll('[data-ll-co-store]')).map(e => e.textContent);
      ok('две групи: Бургас (1), Варна (2)', JSON.stringify(st) === JSON.stringify(['Бургас (1)', 'Варна (2)']), JSON.stringify(st));
      ok('3 реда', b.querySelectorAll('[data-ll-co-row]').length === 3);
      const r1 = b.querySelector('[data-ll-co-row="c1"]');
      if (ok('ред c1', !!r1)) {
        const t = r1.textContent;
        ok('№ · клиент · артикул · SAP · к-во', t.indexOf('1001 · Иван Петров · Диван ъглов · SAP 500123 · 1 бр') >= 0, t);
        ok('дата на заявката 10.11.2026', t.indexOf('заявена 10.11.2026') >= 0, t);
        ok('дата на доставка 20.11.2026', t.indexOf('доставка 20.11.2026') >= 0, t);
      }
      const r2 = b.querySelector('[data-ll-co-row="c2"]');
      if (ok('ред c2', !!r2)) {
        ok('артикул от items + „+1 арт."', r2.textContent.indexOf('Маса · SAP 700 · 2 бр +1 арт.') >= 0, r2.textContent);
        ok('без доставка → „доставка —"', r2.textContent.indexOf('доставка —') >= 0, r2.textContent);
      }
      ok('над „📦 Редове"', !!mod(h).querySelector('tr[data-ll-unit]') &&
        !!(mod(h).querySelector('tr[data-ll-unit]').compareDocumentPosition(b) & 2));
      ok('без чекбокс/бутон в блока', !b.querySelector('input,button,select'));
    }
    ok('една заявка към client_orders', coGets(h).length === 1, JSON.stringify(coGets(h)));
  }

  section('б) Чужд склад и отминали статуси не се показват; низът на заявката');
  {
    const h = env();
    h.w.llNewList();
    await settle();
    const txt = block(h) ? block(h).textContent : '';
    ['ЧУЖД-СКЛАД', 'СТАТУС-SENT', 'СТАТУС-ARRIVED', 'СТАТУС-DONE', 'СТАТУС-REFUSED'].forEach(n =>
      ok('няма ' + n, txt.indexOf(n) < 0, txt.slice(0, 200)));
    const u = decodeURIComponent(coGets(h)[0] || '');
    ok('fulfiller=eq.' + DOB, u.indexOf('fulfiller=eq.' + DOB) >= 0, u);
    ok('status=not.in.(sent,arrived,done,refused)', u.indexOf('status=not.in.(sent,arrived,done,refused)') >= 0, u);
    ok('order=store_name.asc,created_at.asc', u.indexOf('order=store_name.asc,created_at.asc') >= 0, u);
    ok('select носи delivery и items', /select=[^&]*delivery/.test(u) && /select=[^&]*items/.test(u), u);
  }

  section('в) Празен резултат → „Няма дължими клиентски заявки"');
  {
    const h = env({ orders: [] });
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е на екрана', !!b)) {
      ok('текстът „Няма дължими клиентски заявки"', !!b.querySelector('[data-ll-co-empty]') &&
        b.textContent.indexOf('Няма дължими клиентски заявки') >= 0, b.textContent);
      ok('без текст за грешка', !b.querySelector('[data-ll-co-error]'));
    }
    ok('без червен toast', !h.toasts.some(t => t.col === '#dc2626'), JSON.stringify(h.toasts));
  }

  section('г) Паднала заявка → червен toast + „не се заредиха"; листът се записва');
  {
    const h = env({ fail: { GET: /client_orders/ } });
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е на екрана', !!b)) {
      ok('„Клиентските заявки не се заредиха"', !!b.querySelector('[data-ll-co-error]') &&
        b.textContent.indexOf('Клиентските заявки не се заредиха') >= 0, b.textContent);
      ok('НЕ „Няма дължими"', b.textContent.indexOf('Няма дължими') < 0, b.textContent);
    }
    ok('червен toast за заявките', h.toasts.some(t => t.col === '#dc2626' && /Клиентските заявки/.test(t.msg)), JSON.stringify(h.toasts));
    ok('редакторът е там (30 реда)', mod(h).querySelectorAll('tr[data-ll-unit]').length === 30);
    h.w.llDraft.units[0].store_name = 'Варна';
    h.w.llDraft.units[0].docs = ['ИЗХ-5'];
    realClick(h.w, btn(mod(h), 'Запази черновата'));
    await settle();
    const ip = h.calls.post.filter(p => /loading_list_items/.test(p.url));
    ok('записът на листа минава', h.calls.post.some(p => p.table === 'loading_lists') && ip.length === 1,
      JSON.stringify(h.calls.post.map(p => p.table)));
  }

  section('д) Редакция на чернова — блокът е там');
  {
    const h = env({ lists: [L_DRAFT], items: OLD_ITEMS });
    h.w.loadLoadingLists();
    await settle();
    h.w.llOpenEdit('L9');
    await settle();
    ok('редакторът е отворен', h.w.llView === 'edit' && /Редакция на товарен лист/.test(mod(h).textContent));
    const b = block(h);
    ok('блокът е там с 3 заявки', !!b && b.querySelectorAll('[data-ll-co-row]').length === 3,
      b ? b.textContent.slice(0, 120) : 'няма');
  }

  section('е) Вход като обект — няма блок, няма заявка към client_orders');
  {
    const h = env({ user: STORE, lists: [Object.assign({}, L_DRAFT, { status: 'sent' })], items: OLD_ITEMS });
    h.w.loadLoadingLists();
    await settle();
    ok('няма блок', !block(h));
    ok('няма „Дължими клиентски заявки" в текста', mod(h).textContent.indexOf('Дължими клиентски заявки') < 0);
    /* Дори при пряко извикване на зареждането — заявка не тръгва. */
    h.w.llLoadEditorData();
    await settle();
    ok('нула GET към client_orders', coGets(h).length === 0, JSON.stringify(coGets(h)));
  }

  section('ж) <script> в име на клиент / артикул — ескейпнат');
  {
    const evil = [{ id: 'e1', in_num: '66', store_name: 'Варна<b>x</b>', customer_name: '<script>alert(1)</script>',
                    status: 'pending', created_at: '2026-11-12T09:00:00+00:00', delivery: null, fulfiller: DOB,
                    product: '<img src=x onerror=alert(2)>', sap: '1', qty: 1, unit: 'бр', items: null }];
    const h = env({ orders: evil });
    h.w.llNewList();
    await settle();
    const b = block(h);
    if (ok('блокът е там', !!b)) {
      ok('няма <script> елемент', !b.querySelector('script'));
      ok('няма <img> елемент', !b.querySelector('img'));
      ok('няма <b> елемент от името на обекта', !b.querySelector('b'));
      ok('текстът стои буквално', b.textContent.indexOf('<script>alert(1)</script>') >= 0 &&
        b.textContent.indexOf('<img src=x onerror=alert(2)>') >= 0, b.textContent);
    }
  }

  section('з) Интеграционно: заедно с transfers.js; само четене');
  {
    const h = env();
    ok('tfCoLabel и llCoLabel съществуват', typeof h.w.tfCoLabel === 'function' && typeof h.w.llCoLabel === 'function');
    ORDERS.slice(0, 3).forEach(o =>
      ok('llCoLabel = tfCoLabel за ' + o.id, h.w.llCoLabel(o) === h.w.tfCoLabel(o), h.w.llCoLabel(o) + ' | ' + h.w.tfCoLabel(o)));
    h.w.llNewList();
    await settle();
    ok('блокът е там', !!block(h));
    ok('нула PATCH/POST към client_orders',
      !h.calls.patch.some(p => /client_orders/.test(p.url)) && !h.calls.post.some(p => /client_orders/.test(p.url)));
    ok('без notOk заявки', h.calls.notOk.length === 0, JSON.stringify(h.calls.notOk));
  }

  report();
})();
