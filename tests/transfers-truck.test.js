/* Трансфери — вид „🚛 Камион" (групажен) с transfers.plate_no (14.10.2026).

   Камионът е бус по маршрут и права (спирки, дотоварване, „От чакащите",
   отметки, статус); отличава се с регистрационния номер.

   Какво заковава файлът:
   a) Камион без рег. номер → отказ с текста, 0 POST; с номер → POST transfers
      с mode:'truck', plate_no:'СА 1234 АВ', courier_company:null.
   b) Бус → plate_no:null в POST и полето #trf-plate го няма; куриер — също.
   c) Списък: етикет „🚛 Камион · СА 1234 АВ"; чипът „Камион" филтрира;
      търсенето „1234" намира транспорта.
   d) Камион със спирка: спирката вижда „➕ Дотовари" (истински клик →
      дотоварване се записва, без да иска рег. номер), точката на прехвърляне
      вижда „⏸ Разтоварен" (истински клик → отметка).
   e) Бус → Камион → Куриер → Камион: радио „Бус" не е checked при камион;
      рег. номерът СЕ ПАЗИ при връщане от куриер (tfSetMode не го пипа), но
      при куриер не се праща.
   f) Печат: „Вид: Камион" и „Рег. номер".

   Мутационна проверка (14.10.2026, всяка поотделно върху transfers.js):
     1. махната валидацията за plate_no              → пада a)
     2. радио „Бус" пак с `!courier`                  → пада e)
     3. plate_no махнат от hay в tfMatches            → пада c)
   И трите събарят теста.

   Пускане:  node tests/transfers-truck.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Добрич', 'Шумен', 'Варна', 'Търговище', 'Централен офис'];
const U = function (store) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: 'manager', store_name: store }; };

/* Камион Добрич → Шумен → Варна; товар X за Търговище, разтоварва се в Шумен. */
const TRUCK = { id: 'k1', transfer_num: 'Добрич-0011', from_store: 'Добрич', mode: 'truck', plate_no: 'СА 1234 АВ',
                depart_date: '2026-10-15', depart_time: '07:00', driver: 'Георги', stops: ['Шумен'], end_store: 'Варна',
                status: 'planned', created_at: '2026-10-14T08:00:00Z' };
const BUS = { id: 'b1', transfer_num: 'Добрич-0010', from_store: 'Добрич', mode: 'bus', plate_no: null,
              depart_date: '2026-10-15', depart_time: '08:00', driver: 'Иван', stops: [], end_store: 'Варна',
              status: 'planned', created_at: '2026-10-14T07:00:00Z' };
const CARGO = [
  { id: 'cX', transfer_id: 'k1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Търговище', transfer_points: ['Шумен'] },
  { id: 'cY', transfer_id: 'k1', position: 2, kind: 'roll', qty: 1, recipient_store: 'Варна', transfer_points: [] },
  { id: 'cB', transfer_id: 'b1', position: 1, kind: 'carton', qty: 1, recipient_store: 'Варна', transfer_points: [] }
];

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: opts.transfers || [TRUCK, BUS],
      transfer_cargo: opts.cargo || CARGO,
      transfer_cargo_events: [],
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  /* Тригерът дава номера; POST към transfers връща реда. */
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/rest\/v1\/transfers(\?|$)/.test(url)) {
      return inner(url, init).then(function () {
        const row = Object.assign({}, JSON.parse(init.body), { id: 't-new', transfer_num: 'Добрич-0012', created_at: '2026-10-14T09:00:00Z' });
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
async function open(h) { h.w.showModule('transfers'); await ticks(); }
async function openForm(h) { await open(h); realClick(h.w, $(h, '#trf-new')); await ticks(); }
async function pickMode(h, m) { const r = $(h, '#trf-mode-' + m); r.checked = true; fire(h.w, r, 'change'); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
/* Попълва маршрут Добрич → Варна с един товар до Варна. */
function fillBasic(h) {
  if ($(h, '#trf-time')) setSel(h, $(h, '#trf-time'), '07:30');
  setSel(h, $(h, '#trf-end'), 'Варна');
  setSel(h, $$(h, '.trf-kind')[0], 'pallet');
  setInp(h, $$(h, '.trf-qty')[0], '1');
  if ($$(h, '.trf-recipient')[0]) setSel(h, $$(h, '.trf-recipient')[0], 'Варна');
}
const visibleIds = function (h) { return $$(h, '#trf-table tbody tr[data-id]').map(function (r) { return r.getAttribute('data-id'); }); };

(async function () {

  section('a) Камион: рег. номерът е задължителен');
  {
    const h = env(U('Добрич'));
    await openForm(h);
    ok('радио „🚛 Камион" съществува', !!$(h, '#trf-mode-truck'));
    await pickMode(h, 'truck');
    ok('при камион полето #trf-plate е там', !!$(h, '#trf-plate'));
    ok('при камион маршрутът (спирки) е там', !!$(h, '#trf-add-stop'));
    fillBasic(h);
    realClick(h.w, $(h, '#trf-save')); await ticks();
    ok('без рег. номер — 0 POST', posts(h, 'transfers').length === 0);
    ok('текстът на отказа', ($(h, '#trf-error') || {}).textContent === 'Въведи регистрационен номер на камиона.', ($(h, '#trf-error') || {}).textContent);
    setInp(h, $(h, '#trf-plate'), '   ');
    ok('само интервали — също отказ', h.w.tfValidate(h.w.tfForm) === 'Въведи регистрационен номер на камиона.', h.w.tfValidate(h.w.tfForm));
    setInp(h, $(h, '#trf-plate'), ' СА 1234 АВ ');
    realClick(h.w, $(h, '#trf-save')); await ticks();
    const b = (posts(h, 'transfers')[0] || {}).body || {};
    ok('POST transfers: mode truck, plate_no подрязан, courier_company null',
       b.mode === 'truck' && b.plate_no === 'СА 1234 АВ' && b.courier_company === null && b.waybill_no === null, JSON.stringify(b));
    ok('камионът носи дата / час / спирки като бус', b.depart_date && b.depart_time === '07:30' && Array.isArray(b.stops), JSON.stringify(b));
    h.close();
  }

  section('b) Бус и куриер: plate_no = null, без поле');
  {
    const h = env(U('Добрич'));
    await openForm(h);
    ok('бус по подразбиране — #trf-plate го няма', !$(h, '#trf-plate'));
    h.w.tfForm.plate_no = 'ОСТАТЪК';
    fillBasic(h);
    realClick(h.w, $(h, '#trf-save')); await ticks();
    const b = (posts(h, 'transfers')[0] || {}).body || {};
    ok('бус: mode bus, plate_no null (дори при остатък във формата)', b.mode === 'bus' && b.plate_no === null, JSON.stringify(b));
    h.close();

    const h2 = env(U('Добрич'));
    await openForm(h2);
    await pickMode(h2, 'courier');
    ok('куриер — #trf-plate го няма', !$(h2, '#trf-plate'));
    h2.w.tfForm.plate_no = 'ОСТАТЪК';
    setSel(h2, $(h2, '#trf-company'), 'Econt');
    setSel(h2, $(h2, '#trf-end'), 'Варна');
    setInp(h2, $$(h2, '.trf-qty')[0], '1');
    realClick(h2.w, $(h2, '#trf-save')); await ticks();
    const c = (posts(h2, 'transfers')[0] || {}).body || {};
    ok('куриер: mode courier, plate_no null', c.mode === 'courier' && c.plate_no === null, JSON.stringify(c));
    h2.close();
  }

  section('c) Списък: етикет, чип „Камион", търсене по номер');
  {
    const h = env(U('Добрич'));
    await open(h);
    const row = $(h, '#trf-table tbody tr[data-id="k1"]');
    ok('етикет „🚛 Камион · СА 1234 АВ"', !!row && row.textContent.indexOf('🚛 Камион · СА 1234 АВ') >= 0, row && row.textContent);
    ok('датата на камиона е от depart_date (15.10)', !!row && /15\.10/.test(row.textContent), row && row.textContent);
    ok('и двата транспорта в списъка', visibleIds(h).sort().join(',') === 'b1,k1', visibleIds(h).join(','));
    const chip = $(h, '.trf-q[data-g="mode"][data-v="truck"]');
    ok('чип „🚛 Камион" съществува', !!chip && /Камион/.test(chip.textContent));
    realClick(h.w, chip); await ticks();
    ok('чипът оставя само камиона', visibleIds(h).join(',') === 'k1', visibleIds(h).join(','));
    realClick(h.w, $(h, '.trf-q[data-g="mode"][data-v="bus"]')); await ticks();
    ok('чип „Бус" не показва камиона', visibleIds(h).join(',') === 'b1', visibleIds(h).join(','));
    realClick(h.w, $(h, '.trf-q[data-g="mode"][data-v=""]')); await ticks();
    setInp(h, $(h, '#trf-search'), '1234'); await ticks();
    ok('търсене „1234" намира камиона и само него', visibleIds(h).join(',') === 'k1', visibleIds(h).join(','));
    h.close();
  }

  section('d) Камион със спирка: дотоварване и разтоварване (наследено от буса)');
  {
    const h = env(U('Шумен'));
    await open(h); await card(h, 'k1');
    ok('картата показва „🚛 Камион · СА 1234 АВ"', /🚛 Камион · СА 1234 АВ/.test(($(h, '#trf-card') || {}).textContent || ''));
    const rl = $(h, '.trf-reload');
    ok('Шумен (спирка) вижда „➕ Дотовари"', !!rl && /Дотовари/.test(rl.textContent));
    const un = $(h, '.trf-card-cargo[data-c="cX"] .trf-act-unloaded');
    ok('Шумен (точка на прехвърляне) вижда „Разтоварен" при товар X', !!un);
    realClick(h.w, un); await ticks();
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const ev = (posts(h, 'transfer_cargo_events')[0] || {}).body || {};
    ok('отметката: unloaded, Шумен, товар X', ev.event === 'unloaded' && ev.store_name === 'Шумен' && ev.cargo_id === 'cX', JSON.stringify(ev));
    h.close();

    const h2 = env(U('Шумен'));
    await open(h2); await card(h2, 'k1');
    realClick(h2.w, $(h2, '.trf-reload')); await ticks();
    ok('формата за дотоварване е отворена, вид truck', !!$(h2, '#trf-reload-route') && h2.w.tfForm.mode === 'truck');
    setSel(h2, $$(h2, '.trf-recipient')[0], 'Варна');
    setInp(h2, $$(h2, '.trf-qty')[0], '2');
    realClick(h2.w, $(h2, '#trf-save')); await ticks();
    const rc = (posts(h2, 'transfer_cargo')[0] || {}).body || [];
    ok('дотоварването е записано от Шумен към k1', Array.isArray(rc) && rc.length === 1 && rc[0].transfer_id === 'k1' && rc[0].loaded_at_store === 'Шумен', JSON.stringify(rc));
    ok('дотоварването не пише ново заглавие', posts(h2, 'transfers').length === 0);
    h2.close();

    const h3 = env(U('Добрич'), { transfers: [Object.assign({}, TRUCK, { mode: 'courier', stops: [] })] });
    await open(h3);
    ok('контрол: куриер не се дотоварва (tfReloadStores празно)', h3.w.tfReloadStores(h3.w.tfTransfers[0]).length === 0);
    h3.close();
  }

  section('e) Превключване Бус → Камион → Куриер → Камион');
  {
    const h = env(U('Добрич'));
    await openForm(h);
    ok('старт: Бус е checked, Камион не е', $(h, '#trf-mode-bus').checked && !$(h, '#trf-mode-truck').checked);
    await pickMode(h, 'truck');
    ok('камион: „Бус" НЕ е checked', !$(h, '#trf-mode-bus').checked, String($(h, '#trf-mode-bus').checked));
    ok('камион: „Камион" е checked', $(h, '#trf-mode-truck').checked);
    ok('камион: в разметката „Бус" няма checked', !/id="trf-mode-bus" value="bus" checked/.test($(h, '#trf-form').innerHTML));
    setInp(h, $(h, '#trf-plate'), 'СА 1234 АВ');
    await pickMode(h, 'courier');
    ok('куриер: полето го няма', !$(h, '#trf-plate'));
    ok('куриер: „Куриер" е единственият checked', $(h, '#trf-mode-courier').checked && !$(h, '#trf-mode-bus').checked && !$(h, '#trf-mode-truck').checked);
    await pickMode(h, 'truck');
    ok('обратно на камион: рег. номерът е запазен', ($(h, '#trf-plate') || {}).value === 'СА 1234 АВ', ($(h, '#trf-plate') || {}).value);
    h.close();
  }

  section('f) Печат');
  {
    const h = env(U('Добрич'));
    await open(h);
    h.w.renderTransferPrint(TRUCK, CARGO.filter(function (c) { return c.transfer_id === 'k1'; }), {});
    const html = ($(h, '#mod-print') || {}).innerHTML || '';
    ok('печат: „Вид" = Камион', /<td>Вид<\/td><td>Камион<\/td>/.test(html));
    ok('печат: „Рег. номер" = СА 1234 АВ', /<td>Рег\. номер<\/td><td>СА 1234 АВ<\/td>/.test(html));
    h.w.renderTransferPrint(BUS, [CARGO[2]], {});
    const hb = ($(h, '#mod-print') || {}).innerHTML || '';
    ok('печат на бус: без „Рег. номер"', !/Рег\. номер/.test(hb) && /<td>Вид<\/td><td>Бус<\/td>/.test(hb));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
