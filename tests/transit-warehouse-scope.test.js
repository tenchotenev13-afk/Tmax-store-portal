/* „Стока на път": складов профил (role 'logistics') вижда само своя склад.

   Преди: logistics минава през isGlobal() и тегли ВСИЧКО; филтър по „Кърджали"
   показваше и редовете на другия склад и трансфери между магазини.
   Сега: сървърен филтър or=(supplier.eq.<склад>,store_name.eq.<склад>), а
   филтърът по магазин е само по получател (store_name).

   Пускане:  node tests/transit-warehouse-scope.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

const TG = 'Логистичен склад Търговище';
const DB = 'Логистичен склад Добрич';

function stubFetch(w) {
  const urls = [];
  w.fetch = function (url) {
    urls.push(String(url));
    return Promise.resolve({
      ok: true, status: 206,
      headers: { get: function (h) { return /content-range/i.test(h) ? '0-0/0' : null; } },
      json: function () { return Promise.resolve([]); },
      text: function () { return Promise.resolve('[]'); }
    });
  };
  return urls;
}
function env(user) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'transit.js'],
    user: user,
    data: { goods_transit: [], stores: [], users: [] }
  });
  h.urls = stubFetch(h.w);
  h.w.requestAnimationFrame = function (f) { f(); };
  h.w.transitData = [];
  return h;
}
const transitUrl = urls => urls.filter(u => /goods_transit/.test(u))[0] || '';

const SKLAD = { email: 'ls.targovishte@temax.bg', display_name: TG, role: 'logistics', store_name: TG };
const SKLAD_NOSTORE = { email: 'x@temax.bg', display_name: 'Склад', role: 'logistics', store_name: '' };
const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };

function row(id, o) {
  return Object.assign({ id: id, direction: 'incoming', status: 'pending', doc_date: '2026-09-01',
    purchase_doc: 'D' + id, position: 1, material_code: 'M' + id, material_name: 'Стока ' + id,
    remaining_qty: 1, unit: 'бр' }, o);
}
const DATA = [
  row(1, { store_name: 'Кърджали', supplier: TG }),
  row(2, { store_name: 'Шумен', supplier: TG }),
  row(3, { store_name: 'Кърджали', supplier: DB }),            /* чужд склад */
  row(4, { store_name: 'Шумен', supplier: 'Кърджали', direction: 'transfer' }), /* Кърджали→Шумен */
  row(5, { store_name: 'Кърджали', supplier: 'Шумен', direction: 'transfer' }),
  row(6, { store_name: TG, supplier: 'Доставчик X' })           /* собственият склад като получател */
];
/* Какво би върнал сървърът за филтъра на Търговище. */
const OWN = DATA.filter(r => r.supplier === TG || r.store_name === TG);

function docsShown(h) {
  const html = h.w.document.getElementById('mod-transit').innerHTML;
  return DATA.filter(r => html.indexOf('>' + r.purchase_doc + '<') >= 0 || html.indexOf(r.purchase_doc) >= 0)
    .map(r => r.id);
}
function options(h) {
  const sel = h.w.document.querySelector('#mod-transit select');
  return sel ? Array.prototype.map.call(sel.options, o => o.value) : [];
}

(async function run() {

  section('а) logistics + store_name: сървърен филтър по склада');
  {
    const h = env(SKLAD);
    ok('transitOwnWarehouse() връща склада', h.w.transitOwnWarehouse() === TG, h.w.transitOwnWarehouse());
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      const url = transitUrl(h.urls);
      const T = encodeURIComponent(TG);
      ok('or=(supplier.eq.X,store_name.eq.X)',
        url.indexOf('&or=(supplier.eq.' + T + ',store_name.eq.' + T + ')') >= 0, url);
      ok('няма ilike', url.indexOf('ilike') < 0, url);
    }
  }

  section('б) Филтър „Кърджали": само store_name=Кърджали от редовете на склада');
  {
    const h = env(SKLAD);
    h.w.transitData = OWN.slice();
    h.w.transitStore = 'Кърджали';
    h.w.transitDir = 'all'; h.w.transitFilter = 'all';
    if (guard('renderTransit()', () => h.w.renderTransit())) {
      const shown = docsShown(h);
      ok('показва само ред 1 (Кърджали от ЛС Търговище)', JSON.stringify(shown) === '[1]', JSON.stringify(shown));
    }
    /* Контрол: същите данни без правилото биха показали и supplier-а. */
    h.w.transitStore = 'Шумен';
    h.w.renderTransit();
    ok('„Шумен" → само ред 2', JSON.stringify(docsShown(h)) === '[2]', JSON.stringify(docsShown(h)));
  }

  section('в) Падащото меню не съдържа складовете');
  {
    const h = env(SKLAD);
    h.w.transitData = OWN.slice();
    h.w.transitStore = '';
    h.w.renderTransit();
    const o = options(h);
    ok('има опция Кърджали', o.indexOf('Кърджали') >= 0, o.join('|'));
    ok('няма „' + TG + '"', o.indexOf(TG) < 0, o.join('|'));
    ok('няма „' + DB + '"', o.indexOf(DB) < 0, o.join('|'));
  }

  section('г) Admin: без филтър, старото поведение');
  {
    const h = env(ADMIN);
    ok('transitOwnWarehouse() е празно', h.w.transitOwnWarehouse() === '');
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      const url = transitUrl(h.urls);
      ok('няма or=', url.indexOf('or=') < 0, url);
    }
    h.w.transitData = DATA.slice();
    h.w.transitDir = 'all'; h.w.transitFilter = 'all';
    h.w.transitStore = 'Кърджали';
    h.w.renderTransit();
    const shown = docsShown(h).sort().join(',');
    /* Кърджали: 1,3 (получател), 4,5 (трансфери) — както преди. */
    ok('admin: Кърджали вижда 1,3,4,5 (вкл. трансфера като подател)', shown === '1,3,4,5', shown);
    h.w.transitStore = '';
    h.w.renderTransit();
    const o = options(h);
    ok('admin: менюто има и складовете', o.indexOf(TG) >= 0 && o.indexOf(DB) >= 0, o.join('|'));
  }

  section('д) logistics с празен store_name: fallback като преди');
  {
    const h = env(SKLAD_NOSTORE);
    ok('transitOwnWarehouse() е празно', h.w.transitOwnWarehouse() === '');
    if (guard('loadTransit() не хвърля', () => h.w.loadTransit())) {
      ok('няма or=', transitUrl(h.urls).indexOf('or=') < 0, transitUrl(h.urls));
    }
    h.w.transitData = DATA.slice();
    h.w.transitStore = 'Кърджали';
    h.w.renderTransit();
    ok('старото мажоритарно/transfer поведение', docsShown(h).sort().join(',') === '1,3,4,5', docsShown(h).join(','));
  }

  report();
})();
