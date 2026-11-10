/* Трансфери — рег. номерът на камиона се иска при „🚚 Тръгна", не при
   създаване; „✏️ Редактирай" на вид / рег. номер / шофьор преди тръгване
   (10.11.2026, Пирдоп-0015: plate_no „като спре камиона ще въведен номера").

   Какво заковава файлът:
   a) Камион без номер → POST transfers с plate_no null; етикетът в списъка е
      „🚛 Камион · номер при тръгване" (не „null"); печатът — „— (при тръгване)".
   b) „🚚 Тръгна" при камион без номер → поле #tfd-plate (празно), отказ
      „Въведи регистрационен номер на камиона.", 0 PATCH; с номер → ЕДИН PATCH
      с departed_at + plate_no (подрязан). Камион с номер → полето е попълнено.
      Бус → без поле, PATCH без plate_no.
   c) „✏️ Редактирай" (истински клик): създалият обект сменя бус → камион +
      номер (PATCH mode/plate_no/driver, само transfers) и камион → бус
      (plate_no null, дори при остатък в полето). Етикетът се обновява.
   d) Кой: чужд обект, тръгнал транспорт, транспорт с отметки, куриер → няма
      бутон и submitTransferEdit отказва с 0 PATCH; admin — може.
   e) Провален PATCH → червен toast, данните на екрана не се сменят.

   Мутационна проверка (10.11.2026, всяка поотделно върху transfers.js):
     1. махната проверката за номер при „Тръгна"          → пада b)
     2. tfCanEdit без проверка за отметки (без tfCanDelete) → пада d)
     3. plate_no не се нулира при бус в submitTransferEdit → пада c)
   И трите събарят теста.

   Пускане:  node tests/trf-edit-plate.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Пирдоп', 'Шумен', 'Варна', 'Централен офис'];
const U = function (store) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: 'manager', store_name: store }; };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const ago = function (min) { return new Date(Date.now() - min * 60000).toISOString(); };

const TRUCK0 = { id: 'k0', transfer_num: 'Пирдоп-0015', from_store: 'Пирдоп', mode: 'truck', plate_no: null,
                 depart_date: '2026-11-10', depart_time: '07:00', driver: '', stops: [], end_store: 'Варна',
                 status: 'planned', created_at: ago(600), departed_at: null };
const TRUCK1 = Object.assign({}, TRUCK0, { id: 'k1', transfer_num: 'Пирдоп-0016', plate_no: 'СА 1234 АВ', driver: 'Георги' });
const BUS = { id: 'b1', transfer_num: 'Пирдоп-0017', from_store: 'Пирдоп', mode: 'bus', plate_no: null,
              depart_date: '2026-11-10', depart_time: '08:00', driver: 'Иван', stops: [], end_store: 'Варна',
              status: 'planned', created_at: ago(600), departed_at: null };
const COURIER = { id: 'q1', transfer_num: 'Пирдоп-0018', from_store: 'Пирдоп', mode: 'courier', courier_company: 'Econt',
                  stops: [], end_store: 'Варна', status: 'planned', created_at: ago(600), departed_at: null };
const DEPARTED = Object.assign({}, BUS, { id: 'd1', transfer_num: 'Пирдоп-0019', departed_at: ago(30), departed_by: 'Управител Пирдоп', status: 'sent' });
const EVBUS = Object.assign({}, BUS, { id: 'e1', transfer_num: 'Пирдоп-0020' });
const ALL = [TRUCK0, TRUCK1, BUS, COURIER, DEPARTED, EVBUS];
const CARGO = ALL.map(function (t) { return { id: 'c-' + t.id, transfer_id: t.id, position: 1, kind: 'pallet', qty: 1, recipient_store: 'Варна', transfer_points: [] }; });
const EVENTS = [{ id: 'ev1', cargo_id: 'c-e1', transfer_id: 'e1', event: 'received', store_name: 'Варна', unit: null, created_at: ago(10) }];
const clone = function (x) { return JSON.parse(JSON.stringify(x)); };

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    fail: opts.fail,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: clone(ALL), transfer_cargo: clone(CARGO), transfer_cargo_events: clone(EVENTS),
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: [], app_settings: []
    }
  });
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/rest\/v1\/transfers(\?|$)/.test(url)) {
      return inner(url, init).then(function () {
        const row = Object.assign({}, JSON.parse(init.body), { id: 't-new', transfer_num: 'Пирдоп-0021', created_at: new Date().toISOString() });
        return { ok: true, status: 201, json: function () { return Promise.resolve([row]); }, text: function () { return Promise.resolve(JSON.stringify([row])); } };
      });
    }
    return inner(url, init);
  };
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ m: m, red: c === '#dc2626' }); return orig(m, c); };
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
function setSel(h, el, val) { el.value = val; fire(h.w, el, 'change'); }
function setInp(h, el, val) { el.value = val; fire(h.w, el, 'input'); }
const patches = function (h) { return h.calls.patch.filter(function (p) { return p.table === 'transfers'; }); };
const nonTransferWrites = function (h) {
  return h.calls.patch.filter(function (p) { return p.table !== 'transfers'; }).length + h.calls.del.length +
    h.calls.post.filter(function (p) { return p.table === 'transfer_cargo'; }).length;
};
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); }
async function card(h, id) { h.w.openTransferCard(id); await ticks(); }
const rowText = function (h, id) { return (($(h, '#trf-table tbody tr[data-id="' + id + '"]') || {}).textContent) || ''; };
const lastToast = function (h) { return h.toasts[h.toasts.length - 1] || {}; };

(async function () {

  section('a) Създаване на камион без номер → plate_no null; етикетът показва липсата');
  {
    const h = env(U('Пирдоп'));
    await open(h);
    realClick(h.w, $(h, '#trf-new')); await ticks();
    const r = $(h, '#trf-mode-truck'); r.checked = true; fire(h.w, r, 'change'); await ticks();
    setSel(h, $(h, '#trf-time'), '07:30');
    setSel(h, $(h, '#trf-end'), 'Варна');
    setSel(h, $$(h, '.trf-kind')[0], 'pallet');
    setInp(h, $$(h, '.trf-qty')[0], '1');
    if ($$(h, '.trf-recipient')[0]) setSel(h, $$(h, '.trf-recipient')[0], 'Варна');
    ok('полето #trf-plate е там, празно', !!$(h, '#trf-plate') && $(h, '#trf-plate').value === '');
    realClick(h.w, $(h, '#trf-save')); await ticks();
    const p = h.calls.post.filter(function (x) { return x.table === 'transfers'; });
    ok('POST transfers без номер: mode truck, plate_no null', p.length === 1 && p[0].body.mode === 'truck' && p[0].body.plate_no === null, JSON.stringify(p[0] && p[0].body));
    h.close();

    const h2 = env(U('Пирдоп'));
    await open(h2);
    const t0 = rowText(h2, 'k0');
    ok('списък: „🚛 Камион · номер при тръгване"', t0.indexOf('🚛 Камион · номер при тръгване') >= 0, t0);
    ok('списък: никъде „null" / „undefined"', !/null|undefined/.test($(h2, '#trf-table').textContent));
    ok('камион с номер: „🚛 Камион · СА 1234 АВ"', rowText(h2, 'k1').indexOf('🚛 Камион · СА 1234 АВ') >= 0);
    await card(h2, 'k0');
    ok('картата: „номер при тръгване", без „null"', /номер при тръгване/.test($(h2, '#trf-card').textContent) && !/null/.test($(h2, '#trf-card').textContent));
    h2.w.printTransfer('k0'); await ticks();
    const pr = ($(h2, '#mod-print') || {}).textContent || '';
    ok('печат: „Рег. номер — (при тръгване)", без „null"', /Рег\. номер— \(при тръгване\)/.test(pr) && !/null/.test(pr), pr.slice(0, 300));
    h2.close();
  }

  section('b) „🚚 Тръгна": камион иска номер, бус — не');
  {
    const h = env(U('Пирдоп'));
    await open(h); await card(h, 'k0');
    realClick(h.w, $(h, '#trf-depart')); await ticks();
    ok('камион без номер: поле #tfd-plate, празно', !!$(h, '#tfd-plate') && $(h, '#tfd-plate').value === '');
    realClick(h.w, $(h, '#tfd-save')); await ticks();
    ok('отказ с текста, 0 PATCH', patches(h).length === 0 && $(h, '#tfd-error').textContent === 'Въведи регистрационен номер на камиона.', ($(h, '#tfd-error') || {}).textContent);
    ok('отказът е червен toast', lastToast(h).red && lastToast(h).m === 'Въведи регистрационен номер на камиона.');
    setInp(h, $(h, '#tfd-plate'), '   ');
    realClick(h.w, $(h, '#tfd-save')); await ticks();
    ok('само интервали → пак отказ, 0 PATCH', patches(h).length === 0);
    setInp(h, $(h, '#tfd-plate'), ' РВ 7777 КК ');
    realClick(h.w, $(h, '#tfd-save')); await ticks();
    const p = patches(h);
    ok('с номер → ЕДИН PATCH с departed_at + plate_no (подрязан)', p.length === 1 && !!p[0].body.departed_at && p[0].body.plate_no === 'РВ 7777 КК' && /id=eq\.k0$/.test(p[0].url), JSON.stringify(p[0] && p[0].body));
    ok('етикетът в картата — с новия номер', /🚛 Камион · РВ 7777 КК/.test($(h, '#trf-card').textContent));
    await card(h, 'k1');
    realClick(h.w, $(h, '#trf-depart')); await ticks();
    ok('камион с номер: полето е попълнено с текущия', ($(h, '#tfd-plate') || {}).value === 'СА 1234 АВ');
    h.w.closeDepartModal();
    await card(h, 'b1');
    realClick(h.w, $(h, '#trf-depart')); await ticks();
    ok('бус: без поле за номер', !!$(h, '#tfd-ov') && !$(h, '#tfd-plate'));
    realClick(h.w, $(h, '#tfd-save')); await ticks();
    const pb = patches(h)[1] || {};
    ok('бус: PATCH с departed_at, без plate_no', !!(pb.body || {}).departed_at && !('plate_no' in pb.body) && /id=eq\.b1$/.test(pb.url), JSON.stringify(pb.body));
    h.close();
  }

  section('c) „✏️ Редактирай": бус → камион + номер, камион → бус');
  {
    const h = env(U('Пирдоп'));
    await open(h); await card(h, 'b1');
    ok('бус: бутон „✏️ Редактирай" има', !!$(h, '#trf-edit'));
    realClick(h.w, $(h, '#trf-edit')); await ticks();
    ok('прозорчето: бус е избран, без поле за номер, шофьорът е попълнен',
       $(h, '#tfm-mode-bus').checked && !$(h, '#tfm-plate') && $(h, '#tfm-driver').value === 'Иван');
    ok('куриер не се предлага', !$(h, '#tfm-mode-courier'));
    const r = $(h, '#tfm-mode-truck'); r.checked = true; fire(h.w, r, 'change'); await ticks();
    ok('камион → появява се поле за номер', !!$(h, '#tfm-plate'));
    setInp(h, $(h, '#tfm-plate'), ' СВ 5555 ВС ');
    setInp(h, $(h, '#tfm-driver'), ' Петър ');
    realClick(h.w, $(h, '#tfm-save')); await ticks();
    const p = patches(h)[0] || {};
    ok('PATCH transfers по id: mode truck, plate_no, driver (подрязани)',
       /id=eq\.b1$/.test(p.url) && JSON.stringify(p.body) === JSON.stringify({ mode: 'truck', plate_no: 'СВ 5555 ВС', driver: 'Петър' }), JSON.stringify(p.body));
    ok('товарите и другите таблици не се пипат', nonTransferWrites(h) === 0);
    ok('прозорчето се затваря; картата: „🚛 Камион · СВ 5555 ВС" и шофьор Петър',
       !$(h, '#tfm-ov') && /🚛 Камион · СВ 5555 ВС/.test($(h, '#trf-card').textContent) && /шофьор Петър/.test($(h, '#trf-card').textContent));

    await card(h, 'k1');
    realClick(h.w, $(h, '#trf-edit')); await ticks();
    ok('камион: полето е с текущия номер', ($(h, '#tfm-plate') || {}).value === 'СА 1234 АВ');
    const rb = $(h, '#tfm-mode-bus'); rb.checked = true; fire(h.w, rb, 'change'); await ticks();
    ok('бус → полето изчезва', !$(h, '#tfm-plate'));
    realClick(h.w, $(h, '#tfm-save')); await ticks();
    const p2 = patches(h)[1] || {};
    ok('камион → бус: plate_no null (номерът не остава)', (p2.body || {}).mode === 'bus' && p2.body.plate_no === null && p2.body.driver === 'Георги', JSON.stringify(p2.body));
    ok('картата: „🚐 Бус"', /🚐 Бус/.test($(h, '#trf-card').textContent));
    h.close();
  }

  section('d) Кой може: чужд обект / тръгнал / с отметки / куриер — не; admin — да');
  {
    const h = env(U('Шумен'));
    await open(h); await card(h, 'b1');
    ok('чужд обект: бутон няма', !!$(h, '#trf-card') && !$(h, '#trf-edit'));
    h.w.tfEditForm = { tid: 'b1', mode: 'truck', plate: 'X', driver: '', saving: false };
    h.w.renderTransferEdit(); realClick(h.w, $(h, '#tfm-save')); await ticks();
    ok('чужд обект: записът отказва, 0 PATCH', patches(h).length === 0 && /Редактира създалият го обект или админ/.test($(h, '#tfm-error').textContent), $(h, '#tfm-error').textContent);
    h.close();

    const h2 = env(U('Пирдоп'));
    await open(h2);
    for (const id of ['d1', 'e1', 'q1']) {
      await card(h2, id);
      ok(id + ': бутон няма', !!$(h2, '#trf-card') && !$(h2, '#trf-edit'));
      h2.w.tfEditForm = { tid: id, mode: 'truck', plate: 'X', driver: '', saving: false };
      h2.w.renderTransferEdit(); realClick(h2.w, $(h2, '#tfm-save')); await ticks();
      ok(id + ': записът отказва, 0 PATCH', patches(h2).length === 0 && !!$(h2, '#tfm-error').textContent, $(h2, '#tfm-error').textContent);
      h2.w.closeTransferEdit();
    }
    ok('тръгнал: причината', /не се редактира/.test(h2.w.tfCanEdit(h2.w.tfFindTransfer('d1')) || ''));
    ok('с отметки: причината', /отметки/.test(h2.w.tfCanEdit(h2.w.tfFindTransfer('e1')) || ''));
    ok('куриер: причината', h2.w.tfCanEdit(h2.w.tfFindTransfer('q1')) === 'Куриер не се редактира.');
    h2.w.openTransferEdit('e1'); await ticks();
    ok('openTransferEdit при отметки → червен toast, без прозорче', lastToast(h2).red && !$(h2, '#tfm-ov'));
    h2.close();

    const h3 = env(ADMIN);
    await open(h3); await card(h3, 'k0');
    ok('admin: бутон има', !!$(h3, '#trf-edit'));
    realClick(h3.w, $(h3, '#trf-edit')); await ticks();
    setInp(h3, $(h3, '#tfm-plate'), 'А 1111 АА');
    realClick(h3.w, $(h3, '#tfm-save')); await ticks();
    ok('admin: PATCH минава', patches(h3).length === 1 && patches(h3)[0].body.plate_no === 'А 1111 АА');
    h3.close();
  }

  section('e) Провален PATCH → червен toast, екранът не се сменя');
  {
    const h = env(U('Пирдоп'), { fail: { PATCH: /transfers/ } });
    await open(h); await card(h, 'b1');
    realClick(h.w, $(h, '#trf-edit')); await ticks();
    const r = $(h, '#tfm-mode-truck'); r.checked = true; fire(h.w, r, 'change'); await ticks();
    setInp(h, $(h, '#tfm-plate'), 'СВ 5555 ВС');
    realClick(h.w, $(h, '#tfm-save')); await ticks();
    ok('опитан е PATCH', patches(h).length === 1);
    ok('червен toast „Промяната НЕ е записана"', lastToast(h).red && /^Промяната НЕ е записана/.test(lastToast(h).m), JSON.stringify(lastToast(h)));
    const t = h.w.tfFindTransfer('b1');
    ok('данните не са сменени (mode bus, plate null)', t.mode === 'bus' && t.plate_no === null);
    ok('прозорчето остава, бутонът „Запиши" е активен', !!$(h, '#tfm-ov') && !$(h, '#tfm-save').disabled);
    h.w.closeTransferEdit(); await card(h, 'b1');
    ok('картата е още „🚐 Бус"', /🚐 Бус/.test($(h, '#trf-card').textContent) && !/СВ 5555/.test($(h, '#trf-card').textContent));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
