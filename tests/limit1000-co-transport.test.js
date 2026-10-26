/* Клиентски и Транспорт — зареждането през sbGetAll (лимит 1000 на PostgREST).

   На 26.10.2026 client_orders = 3060, transport_orders = 2598. Глобален
   профил без обекти (admin, accounting) виждаше само първите 1000 по
   created_at.desc — клиентски от 20.09, транспорт от 11.09; 4 + 1 отворени
   заявки отпреди това не излизаха нито в таба, нито в банера при вход.
   Мокът се държи като PostgREST: максимум 1000 реда, чете limit/offset.

   Покрива:
     1. Глобален профил: 1000 + 1000 + 37 → 2037 в clientOrders / transportOrders,
        ред от трета страница е в DOM-а, order с id tiebreaker.
     2. Обект с 12 реда → една заявка, 12 реда.
     3. Точно 1000 → втора заявка, спира на празната; без червен ред.
     4. Втора страница пада → червен ред + toast, първите 1000 в таблицата.
     5. Стара отворена заявка (след 1000-ния ред) излиза в банера при вход —
        notifications.js зареден в реда от index.html, банерът тръгва от
        обвивката на renderMetrics, не от ръчно извикване.
     6. История: клиентски и транспорт на страници, червен ред при провал.

   Мутационна проверка (26.10.2026), всеки мутант пуснат срещу този тест:
     - loadClientOrders обратно на sbGet                   — СЪБОРЕН (9 ❌)
     - loadTransport обратно на sbGet                      — СЪБОРЕН (8 ❌)
     - махнат `,id.desc` в client-orders.js                — СЪБОРЕН (1 ❌)
     - махнат `,id.desc` в transport.js                    — СЪБОРЕН (1 ❌)
     - coShowPartial(false) вместо .partial                — СЪБОРЕН (3 ❌)
     - trShowPartial(false) вместо .partial                — СЪБОРЕН (3 ❌)
     - История: client_orders обратно на sbGet             — СЪБОРЕН (3 ❌)
     - История: без червения ред за клиентски              — СЪБОРЕН (1 ❌)
   Неубити мутанти: няма. Базата преди кръга: exit 0.
   ВНИМАНИЕ: tiebreaker-ът се хваща САМО по текста на URL-а. Мокът реже
   стабилно, тоест припокриване на страници при равни created_at не се
   симулира — ако някой смени проверката на URL-а, мутантът ще мине.

   Пускане:  node tests/limit1000-co-transport.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, section, report, guard, ticks, dayOffset } = H;

const ADMIN = {
  email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис'
};
const STORE = {
  email: 'shumen@temax.bg', display_name: 'Шумен', role: 'store', store_name: 'Шумен'
};

function rows(n, mk) { var out = []; for (var i = 0; i < n; i++) out.push(mk(i)); return out; }
/* created_at намалява с i — същият ред като order=created_at.desc */
function ts(i) { return new Date(Date.UTC(2026, 9, 26, 12, 0, 0) - i * 3600000).toISOString(); }
const co = (i, over) => Object.assign({
  id: 'co-' + String(100000 + i), in_num: String(5000 + i), store_name: i % 2 ? 'Шумен' : 'Карлово',
  fulfiller: 'Централен офис', status: 'pending', date: '2026-10-01', hour: '10:00',
  customer_name: 'Клиент ' + i, phone: '0888', product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.',
  items: [{ product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.' }],
  delivery: dayOffset(30), note: '', created_at: ts(i), co_eta: null, co_note: null,
  paid_transport: false, transport_id: null
}, over || {});
const tr = (i, over) => Object.assign({
  id: 'tr-' + String(100000 + i), store_name: i % 2 ? 'Шумен' : 'Карлово', from_store: '',
  status: 'pending', date: '2026-10-01', hour: '10:00', customer_name: 'Транспорт ' + i,
  phone: '0888', address: 'ул. 1', product: 'ДИВАН', sap: '222', qty: 1, unit: 'бр.',
  delivery: dayOffset(30), note: '', created_at: ts(i), awaiting_stock: false
}, over || {});

/* tables: { име: редове }; failAt: { име: offset, на който страницата пада } */
function env(user, tables, failAt) {
  failAt = failAt || {};
  var urls = [];
  var data = { transport_orders: [], client_orders: [], stores: [], kasa_storno: [], kasa_storno_items: [] };
  Object.keys(tables).forEach(function (t) {
    data[t] = function (url) {
      urls.push(url);
      var u = decodeURIComponent(url);
      var all = tables[t];
      /* филтър по обект — както storeQ / or=(store_name.eq.…) */
      var m = /store_name=eq\.([^&]+)/.exec(u);
      if (m) all = all.filter(function (r) { return r.store_name === m[1]; });
      var lim = /[?&]limit=(\d+)/.exec(u), off = /[?&]offset=(\d+)/.exec(u);
      var limit = Math.min(lim ? +lim[1] : 1000, 1000), offset = off ? +off[1] : 0;
      return all.slice(offset, offset + limit);
    };
  });
  var h = boot({
    modules: ['transport.js', 'client-orders.js', 'kasa.js', 'history.js', 'notifications.js'],
    user: user, data: data,
    fail: { GET: function (url) {
      if (urls.length > 40) return { status: 500, body: { message: 'runaway' } };
      var m = /\/rest\/v1\/([a-z_]+)\?/.exec(url); if (!m || failAt[m[1]] == null) return null;
      var off = /[?&]offset=(\d+)/.exec(decodeURIComponent(url));
      return off && +off[1] === failAt[m[1]] ? { status: 500, body: { message: 'boom' } } : null;
    } }
  });
  h.gets = function (t) { return h.calls.get.filter(function (u) { return u.indexOf('/' + t + '?') >= 0; }); };
  return h;
}
async function loadBoth(h) {
  guard('loadClientOrders() не хвърля', () => h.w.loadClientOrders());
  guard('loadTransport() не хвърля', () => h.w.loadTransport());
  await ticks(); await ticks();
}
const txt = (h, id) => { var e = h.doc.getElementById(id); return e && e.style.display !== 'none' ? e.textContent : ''; };

(async function () {

  section('1. Глобален профил — 1000 + 1000 + 37');
  {
    var h = env(ADMIN, { client_orders: rows(2037, co), transport_orders: rows(2037, tr) });
    await loadBoth(h);
    var g = h.gets('client_orders'), t = h.gets('transport_orders');
    ok('а) три страници към client_orders', g.length === 3, 'реално: ' + g.length);
    ok('а) три страници към transport_orders', t.length === 3, 'реално: ' + t.length);
    ok('а) client_orders: order=created_at.desc,id.desc',
       g.length && decodeURIComponent(g[0]).indexOf('order=created_at.desc,id.desc') >= 0, g[0]);
    ok('а) transport_orders: order=created_at.desc,id.desc',
       t.length && decodeURIComponent(t[0]).indexOf('order=created_at.desc,id.desc') >= 0, t[0]);
    ok('б) clientOrders.length === 2037', h.w.clientOrders.length === 2037, 'реално: ' + h.w.clientOrders.length);
    ok('б) transportOrders.length === 2037', h.w.transportOrders.length === 2037, 'реално: ' + h.w.transportOrders.length);
    ok('в) ред от 3-та страница (co-102030) е в DOM-а', !!h.doc.getElementById('co-row-co-102030'));
    ok('в) ред от 3-та страница (tr-102030) е в DOM-а', !!h.doc.getElementById('tr-row-tr-102030'));
    ok('г) без червен ред', !txt(h, 'co-partial') && !txt(h, 'tr-partial'));
    ok('г) без червен toast', !h.calls.toast.some(x => x.indexOf('непълни') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  section('2. Обект с 12 реда → една заявка');
  {
    var data12 = rows(12, i => co(i, { store_name: 'Шумен' }));
    var tr12 = rows(12, i => tr(i, { store_name: 'Шумен' }));
    var h = env(STORE, { client_orders: data12, transport_orders: tr12 });
    await loadBoth(h);
    ok('а) една заявка към client_orders', h.gets('client_orders').length === 1, 'реално: ' + h.gets('client_orders').length);
    ok('а) една заявка към transport_orders', h.gets('transport_orders').length === 1, 'реално: ' + h.gets('transport_orders').length);
    ok('б) 12 клиентски', h.w.clientOrders.length === 12, 'реално: ' + h.w.clientOrders.length);
    ok('б) 12 транспортни', h.w.transportOrders.length === 12, 'реално: ' + h.w.transportOrders.length);
    ok('в) филтърът по обект е запазен (client)', decodeURIComponent(h.gets('client_orders')[0] || '').indexOf('store_name.eq.Шумен') >= 0, h.gets('client_orders')[0]);
    ok('в) филтърът по обект е запазен (transport)', decodeURIComponent(h.gets('transport_orders')[0] || '').indexOf('store_name=eq.Шумен') >= 0, h.gets('transport_orders')[0]);
    h.close();
  }

  section('3. Точно 1000 → втора заявка, спира на празна');
  {
    var h = env(ADMIN, { client_orders: rows(1000, co), transport_orders: rows(1000, tr) });
    await loadBoth(h);
    var g = h.gets('client_orders'), t = h.gets('transport_orders');
    ok('а) две заявки към client_orders', g.length === 2, 'реално: ' + g.length);
    ok('а) втората е offset=1000', g.length === 2 && g[1].indexOf('offset=1000') >= 0, g[1]);
    ok('а) две заявки към transport_orders', t.length === 2, 'реално: ' + t.length);
    ok('б) 1000 + 1000 реда', h.w.clientOrders.length === 1000 && h.w.transportOrders.length === 1000);
    ok('в) без червен ред', !txt(h, 'co-partial') && !txt(h, 'tr-partial'));
    h.close();
  }

  section('4. Втората страница пада → червен ред + toast');
  {
    var h = env(ADMIN, { client_orders: rows(2037, co), transport_orders: rows(2037, tr) },
                { client_orders: 1000, transport_orders: 1000 });
    await loadBoth(h);
    ok('а) clientOrders = 1000', h.w.clientOrders.length === 1000, 'реално: ' + h.w.clientOrders.length);
    ok('а) transportOrders = 1000', h.w.transportOrders.length === 1000, 'реално: ' + h.w.transportOrders.length);
    ok('б) ред от 1-ва страница е в таблицата (co-100000)', !!h.doc.getElementById('co-row-co-100000'));
    ok('б) ред от 1-ва страница е в таблицата (tr-100000)', !!h.doc.getElementById('tr-row-tr-100000'));
    var cp = txt(h, 'co-partial'), tp = txt(h, 'tr-partial');
    ok('в) червен ред над Клиентски: „прочетени 1000 реда“', cp.indexOf('Непълни данни — клиентски заявки: прочетени 1000 реда') >= 0, cp);
    ok('в) червен ред над Транспорт: „прочетени 1000 реда“', tp.indexOf('Непълни данни — транспорт: прочетени 1000 реда') >= 0, tp);
    var coEl = h.doc.getElementById('co-partial'), trEl = h.doc.getElementById('tr-partial');
    ok('в) червеният ред стои точно над таблицата (Клиентски)',
       !!coEl && coEl.nextElementSibling === h.doc.getElementById('co-body').closest('.tbl-wrap'));
    ok('в) червеният ред стои точно над таблицата (Транспорт)',
       !!trEl && trEl.nextElementSibling === h.doc.getElementById('tr-body').closest('.tbl-wrap'));
    ok('в) червен цвят', !!coEl && /dc2626|220, 38, 38/.test(coEl.style.color));
    ok('г) toast „Клиентски заявки: заредени са само 1000 — непълни данни“',
       h.calls.toast.indexOf('Клиентски заявки: заредени са само 1000 — непълни данни') >= 0, h.calls.toast.join(' | '));
    ok('г) toast „Транспорт: заредени са само 1000 — непълни данни“',
       h.calls.toast.indexOf('Транспорт: заредени са само 1000 — непълни данни') >= 0, h.calls.toast.join(' | '));

    /* Следващо цяло зареждане маха червения ред (същият DOM, нов мок) */
    h.close();
  }

  section('4б. Червеният ред изчезва при следващо цяло зареждане');
  {
    var tables = { client_orders: rows(1001, co), transport_orders: rows(1001, tr) };
    var fails = { client_orders: 1000, transport_orders: 1000 };
    var h = env(ADMIN, tables, fails);
    await loadBoth(h);
    ok('а) след провал редът се вижда', !!txt(h, 'co-partial') && !!txt(h, 'tr-partial'));
    delete fails.client_orders; delete fails.transport_orders;
    await loadBoth(h);
    ok('б) след цяло зареждане — скрит', !txt(h, 'co-partial') && !txt(h, 'tr-partial'),
       txt(h, 'co-partial') + ' / ' + txt(h, 'tr-partial'));
    ok('б) и няма дублиран елемент', h.doc.querySelectorAll('#co-partial').length === 1 && h.doc.querySelectorAll('#tr-partial').length === 1);
    h.close();
  }

  section('5. Стара отворена заявка излиза в банера при вход');
  {
    /* Всички приключени, освен една клиентска и една транспортна от 3-та
       страница с изтекла доставка — те са по-стари от 1000-ния ред. */
    var cRows = rows(2037, i => co(i, i === 2030 ? { status: 'pending', delivery: dayOffset(-3) } : { status: 'done' }));
    var tRows = rows(2037, i => tr(i, i === 2030 ? { status: 'pending', delivery: dayOffset(-3) } : { status: 'done' }));
    var h = env(ADMIN, { client_orders: cRows, transport_orders: tRows });
    h.w.eval('_notifShown=false;_metricsCount=0;');
    await loadBoth(h);
    var b = h.doc.getElementById('notif-banner');
    var bt = b ? b.textContent : '';
    ok('а) банерът е показан (от обвивката на renderMetrics)', !!b && b.style.display !== 'none' && bt.length > 0, bt.slice(0, 200));
    ok('б) „1 клиентска заявка с изтекла дата на доставка“', bt.indexOf('1 клиентска заявка с изтекла дата на доставка') >= 0, bt.slice(0, 300));
    ok('б) „1 транспортна заявка с изтекла дата“', bt.indexOf('1 транспортна заявка с изтекла дата') >= 0, bt.slice(0, 300));
    h.close();
  }

  section('6. История — клиентски и транспорт на страници');
  {
    async function search(h, type) {
      h.w.renderHistoryShell();
      h.doc.getElementById('h-from').value = '2026-08-01';
      h.doc.getElementById('h-to').value   = '2026-08-31';
      h.doc.getElementById('h-type').value = type;
      realClick(h.w, btn(h.doc.getElementById('mod-history'), 'Търси →'), 'Търси →');
      await ticks(); await ticks();
    }
    var h = env(ADMIN, { client_orders: rows(1017, co), transport_orders: rows(1017, tr) });
    await search(h, 'client');
    var g = h.gets('client_orders');
    ok('а) клиентски: две страници', g.length === 2, 'реално: ' + g.length);
    ok('а) клиентски: order=created_at.desc,id.desc', g.length && decodeURIComponent(g[0]).indexOf('order=created_at.desc,id.desc&') >= 0, g[0]);
    ok('а) histData.client = 1017', h.w.histData.client.length === 1017, 'реално: ' + h.w.histData.client.length);
    h.close();

    h = env(ADMIN, { client_orders: rows(1017, co), transport_orders: rows(1017, tr) });
    await search(h, 'transport');
    ok('б) транспорт: две страници', h.gets('transport_orders').length === 2, 'реално: ' + h.gets('transport_orders').length);
    ok('б) histData.transport = 1017', h.w.histData.transport.length === 1017, 'реално: ' + h.w.histData.transport.length);
    h.close();

    h = env(ADMIN, { client_orders: rows(1017, co), transport_orders: rows(1017, tr) },
            { client_orders: 1000, transport_orders: 1000 });
    await search(h, 'all');
    var res = h.doc.getElementById('h-results').textContent;
    ok('в) провал → червен ред „клиентски: прочетени 1000 реда“', res.indexOf('Непълни данни — клиентски: прочетени 1000 реда') >= 0, res.slice(0, 300));
    ok('в) провал → червен ред „транспорт: прочетени 1000 реда“', res.indexOf('Непълни данни — транспорт: прочетени 1000 реда') >= 0, res.slice(0, 300));
    ok('в) и toast', h.calls.toast.some(x => x.indexOf('прочетени 1000') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  report();
})();
