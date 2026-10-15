/* Трансфери — етикетът на клиентските заявки във „Връзки" на товара (15.10.2026).

   Какво заковава файлът:
   a) Заявката към client_orders иска само отворените
      (status=not.in.(done,refused)) и полетата product,sap,qty,unit,items;
      филтърът по изпълнител (fulfiller) остава.
   b) tfCoLabel: items от 1 ред → пълният етикет; от 3 реда → първият +
      „ +2 арт."; без items → полетата на заявката; без артикул → само
      № · клиент (без висящо „·"); артикул от 80 знака → 60 + „…";
      „—" от старите записи се пропуска.
   c) Формата: datalist-ът показва новия етикет; избор → чипчето носи същия
      текст; при запис client_order_ids съдържа id-то, не текста.
   d) Приключена заявка (done / refused) не е в списъка — фалшивият сървър
      прилага филтъра само ако той е в URL-а, както би направил PostgREST.

   Мутационна проверка (15.10.2026, всяка поотделно върху transfers.js):
     1. махнат статус-филтърът от заявката       → пада a) и d)
     2. върнат старият label (№ · клиент)          → пада c)
     3. махнато „ +N арт."                         → пада b)
   И трите събарят теста.

   Пускане:  node tests/transfers-co-label.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Кърджали', 'Сливен', 'Варна', 'Централен офис'];
const KARDZHALI = { id: 'u-k', email: 'kardzhali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };

const ITEM = function (product, sap, qty, unit) { return { product: product, sap: sap, qty: qty, unit: unit, color: '' }; };
const ORDERS = [
  { id: 'co-47', in_num: 'Кърджали-0047', customer_name: 'Ажда колежката', status: 'pending', store_name: 'Кърджали',
    product: 'К-КТ YSTAD 3 ЧАСТИ СИН', sap: '94553', qty: 12, unit: 'бр.', items: [ITEM('К-КТ YSTAD 3 ЧАСТИ СИН', '94553', 12, 'бр.')] },
  /* Заявка на Сливен, която Кърджали изпълнява */
  { id: 'co-54', in_num: 'Сливен-0054', customer_name: 'Иван', status: 'sent', store_name: 'Сливен', fulfiller: 'Кърджали',
    product: 'ШАТРА С ПОДВИЖЕН ПОКРИВ 3/3/2,45М Т.СИВА', sap: '93305', qty: 1, unit: 'бр.', items: [ITEM('ШАТРА С ПОДВИЖЕН ПОКРИВ 3/3/2,45М Т.СИВА', '93305', 1, 'бр.')] },
  { id: 'co-done', in_num: 'Кърджали-0040', customer_name: 'Приключен', status: 'done', store_name: 'Кърджали', items: [ITEM('СТАРО', '1', 1, 'бр.')] },
  { id: 'co-ref', in_num: 'Кърджали-0041', customer_name: 'Отказан', status: 'refused', store_name: 'Кърджали', items: [ITEM('ОТКАЗАНО', '2', 1, 'бр.')] }
];
const LABEL_47 = 'Кърджали-0047 · Ажда колежката · К-КТ YSTAD 3 ЧАСТИ СИН · SAP 94553 · 12 бр.';
const LABEL_54 = 'Сливен-0054 · Иван · ШАТРА С ПОДВИЖЕН ПОКРИВ 3/3/2,45М Т.СИВА · SAP 93305 · 1 бр.';

function env() {
  const h = boot({
    modules: ['transfers.js'],
    user: KARDZHALI,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: [], transfer_cargo: [], transfer_cargo_events: [],
      /* Като PostgREST: статус-филтърът важи само ако е поискан. */
      client_orders: function (url) {
        const u = decodeURIComponent(url);
        return /status=not\.in\.\(done,refused\)/.test(u) ? ORDERS.filter(function (o) { return o.status !== 'done' && o.status !== 'refused'; }) : ORDERS.slice();
      },
      transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/rest\/v1\/transfers(\?|$)/.test(url)) {
      return inner(url, init).then(function () {
        const row = Object.assign({}, JSON.parse(init.body), { id: 't-new', transfer_num: 'Кърджали-0020', created_at: '2026-10-15T08:00:00Z' });
        return { ok: true, status: 201, json: function () { return Promise.resolve([row]); }, text: function () { return Promise.resolve(JSON.stringify([row])); } };
      });
    }
    return inner(url, init);
  };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
function setSel(h, el, val) { el.value = val; fire(h.w, el, 'change'); }
function setInp(h, el, val) { el.value = val; fire(h.w, el, 'input'); }
const posts = function (h, table) { return h.calls.post.filter(function (p) { return p.table === table; }); };
const dlValues = function (h) { return $$(h, 'datalist[id^="trf-dl-co-"] option').map(function (o) { return o.getAttribute('value'); }); };

(async function () {

  section('a) Заявката към client_orders');
  {
    const h = env();
    h.w.showModule('transfers'); await ticks();
    realClick(h.w, $(h, '#trf-new')); await ticks();
    const url = decodeURIComponent(h.calls.get.filter(function (u) { return /\/client_orders\?/.test(u); })[0] || '');
    ok('заявката е тръгнала', !!url, url);
    ok('само отворените: status=not.in.(done,refused)', url.indexOf('status=not.in.(done,refused)') >= 0, url);
    ok('полетата product,sap,qty,unit,items', /select=[^&]*\bproduct\b/.test(url) && /select=[^&]*\bsap\b/.test(url) && /select=[^&]*\bqty\b/.test(url) && /select=[^&]*\bunit\b/.test(url) && /select=[^&]*\bitems\b/.test(url), url);
    ok('филтърът по изпълнител остава', url.indexOf('or=(store_name.eq.Кърджали,fulfiller.eq.Кърджали)') >= 0, url);
    h.close();
  }

  section('b) tfCoLabel');
  {
    const h = env();
    const L = h.w.tfCoLabel;
    ok('items от 1 ред → пълният етикет', L(ORDERS[0]) === LABEL_47, L(ORDERS[0]));
    const three = { in_num: 'Варна-0003', customer_name: 'Мария', product: 'ГЛАВЕН', sap: '9', qty: 9, unit: 'бр.',
      items: [ITEM('ПЪРВИ', '111', 2, 'бр.'), ITEM('ВТОРИ', '222', 1, 'бр.'), ITEM('ТРЕТИ', '333', 1, 'бр.')] };
    ok('items от 3 реда → първият + „ +2 арт."', L(three) === 'Варна-0003 · Мария · ПЪРВИ · SAP 111 · 2 бр. +2 арт.', L(three));
    const flat = { in_num: 'Варна-0004', customer_name: 'Петър', product: 'МАСА', sap: '555', qty: 3, unit: 'бр.', items: null };
    ok('без items → полетата на заявката', L(flat) === 'Варна-0004 · Петър · МАСА · SAP 555 · 3 бр.', L(flat));
    ok('празен масив items → полетата на заявката', L(Object.assign({}, flat, { items: [] })) === 'Варна-0004 · Петър · МАСА · SAP 555 · 3 бр.');
    const bare = { in_num: 'Варна-0005', customer_name: 'Гошо', items: [] };
    ok('без артикул → само № · клиент', L(bare) === 'Варна-0005 · Гошо', L(bare));
    ok('без висящо „·"', !/·\s*$/.test(L(bare)) && L(bare).indexOf('·  ·') < 0);
    const long = 'А'.repeat(80);
    const lg = L({ in_num: 'Варна-0006', customer_name: 'Х', items: [ITEM(long, '7', 1, 'бр.')] });
    ok('артикул от 80 знака → 60 + „…"', lg === 'Варна-0006 · Х · ' + 'А'.repeat(60) + '… · SAP 7 · 1 бр.', lg);
    const dash = L({ in_num: '0017', customer_name: '', items: [ITEM('62433', '—', 30, 'бр.'), ITEM('101222', '—', 30, 'бр.')] });
    ok('„—" и празен клиент се пропускат', dash === '0017 · 62433 · 30 бр. +1 арт.', dash);
    ok('без клиент, без двойно „·"', dash.indexOf('· ·') < 0);
    h.close();
  }

  section('c–d) Формата: datalist, чипче, запис по id; приключените ги няма');
  {
    const h = env();
    h.w.showModule('transfers'); await ticks();
    realClick(h.w, $(h, '#trf-new')); await ticks(); await ticks();
    const vals = dlValues(h);
    ok('datalist-ът показва новите етикети', vals.indexOf(LABEL_47) >= 0 && vals.indexOf(LABEL_54) >= 0, JSON.stringify(vals));
    ok('d) приключена (done) я няма', !vals.some(function (v) { return /Кърджали-0040/.test(v); }), JSON.stringify(vals));
    ok('d) отказана (refused) я няма', !vals.some(function (v) { return /Кърджали-0041/.test(v); }), JSON.stringify(vals));
    ok('tfCoOpts са точно двете отворени', h.w.tfCoOpts.map(function (o) { return o.id; }).sort().join(',') === 'co-47,co-54');

    const inp = $(h, '.trf-link-co');
    inp.value = LABEL_54; fire(h.w, inp, 'change'); await ticks();
    const chip = $(h, '.trf-chip-co');
    ok('чипчето носи същия текст', !!chip && chip.textContent.replace(/\s*✕\s*$/, '').trim() === LABEL_54, chip && chip.textContent);

    setSel(h, $(h, '#trf-time'), '08:00');
    setSel(h, $(h, '#trf-end'), 'Сливен');
    setInp(h, $$(h, '.trf-qty')[0], '1');
    setSel(h, $$(h, '.trf-recipient')[0], 'Сливен');
    realClick(h.w, $(h, '#trf-save')); await ticks();
    const cargo = (posts(h, 'transfer_cargo')[0] || {}).body || [];
    ok('при запис client_order_ids = [id], не текста', Array.isArray(cargo) && cargo[0] && JSON.stringify(cargo[0].client_order_ids) === '["co-54"]', JSON.stringify(cargo));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
