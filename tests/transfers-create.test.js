/* Междускладови трансфери — етап 1: създаване на транспорт с товари.

   Какво заковава файлът:
   1. БУС с 2 товара за различни получатели, единият с точка на
      прехвърляне. Формата се попълва с истински change/input/click;
      записват се заглавие + товари, номерът НЕ се подава от клиента.
   2. НОМЕРЪТ ИДВА ОТ ОТГОВОРА. Фалшивият PostgREST играе ролята на тригера:
      игнорира всяко transfer_num от тялото и връща „Добрич-0007".
   3. КУРИЕР: превключването маха спирките и прехвърлянията; получателят е
      един (end_store) и всички товари отиват при него. tfValidate отказва
      куриер със спирки и товар за друг получател.
   4. ВАЛИДАЦИЯ „първата точка трябва да е спирка на транспорта" — и като
      чиста функция, и през бутона „Запиши" (нула POST-а).
   5. ВИДИМОСТ: създател / получател (само през товар) / чужд обект.
   6. Провал при товарите → заглавието се трие (няма празен транспорт).

   Пускане:  node tests/transfers-create.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Добрич', 'Шумен', 'Варна', 'Търговище', 'Централен офис'];
const DOBRICH = { id: 'u-1', email: 'dobrich@temax.bg', display_name: 'Управител Добрич', role: 'manager', store_name: 'Добрич' };

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transfers.js'],
    user: opts.user || DOBRICH,
    data: Object.assign({
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: opts.transfers || [],
      transfer_cargo: opts.cargo || [],
      client_orders: opts.clientOrders || [],
      transport_orders: opts.transportOrders || [],
      loading_lists: [],
      loading_list_items: []
    }, opts.data || {}),
    fail: opts.fail
  });
  /* Тригерът assign_transfer_num: номерът от клиента се ИГНОРИРА, базата
     връща свой. Харнесът по подразбиране отговаря с {} на POST. */
  const inner = h.w.fetch;
  h.w.fetch = function (url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/rest\/v1\/transfers(\?|$)/.test(url) && !(opts.fail && opts.fail.POST && opts.fail.POST.test && opts.fail.POST.test(url))) {
      return inner(url, init).then(function () {
        const body = JSON.parse(init.body);
        const row = Object.assign({}, body, { id: 't-new', transfer_num: 'Добрич-0007', created_at: '2026-09-29T08:00:00Z' });
        return { ok: true, status: 201, json: function () { return Promise.resolve([row]); }, text: function () { return Promise.resolve(JSON.stringify([row])); } };
      });
    }
    return inner(url, init);
  };
  return h;
}

const $ = function (h, sel) { return h.doc.querySelector(sel); };
const $$ = function (h, sel) { return Array.prototype.slice.call(h.doc.querySelectorAll(sel)); };
function setSel(h, el, val) { el.value = val; fire(h.w, el, 'change'); }
function setInp(h, el, val) { el.value = val; fire(h.w, el, 'input'); }
function posts(h, table) {
  return h.calls.post.filter(function (p) { return p.table === table; });
}
async function openForm(h) {
  h.w.showModule('transfers');
  await ticks();
  realClick(h.w, $(h, '#trf-new'));
  await ticks();
}

(async function () {

  /* ── 1–2. Бус с 2 товара ──────────────────────────────────────────────── */
  section('1. Бус: 2 товара за различни получатели, единият с прехвърляне');
  {
    const h = env();
    await openForm(h);
    ok('формата е отворена', !!$(h, '#trf-form'));
    ok('началото е заковано за обекта на потребителя', ($(h, '#trf-from-fixed') || {}).textContent === 'Добрич');

    setSel(h, $(h, '#trf-time'), '08:30');
    setInp(h, $(h, '#trf-driver'), 'Петър');
    realClick(h.w, $(h, '#trf-add-stop')); await ticks();
    setSel(h, $(h, '.trf-stop'), 'Шумен');
    setSel(h, $(h, '#trf-end'), 'Варна');

    /* товар 1: 2 палета до Варна (крайната точка) */
    setSel(h, $$(h, '.trf-kind')[0], 'pallet');
    setInp(h, $$(h, '.trf-qty')[0], '2');
    setSel(h, $$(h, '.trf-recipient')[0], 'Варна');

    /* товар 2: руло до Търговище, прехвърляне в Шумен */
    realClick(h.w, $(h, '#trf-add-cargo')); await ticks();
    setSel(h, $$(h, '.trf-kind')[1], 'roll');
    setSel(h, $$(h, '.trf-recipient')[1], 'Търговище');
    realClick(h.w, $$(h, '.trf-add-point')[1]); await ticks();
    setSel(h, $$(h, '.trf-cargo')[1].querySelector('.trf-point'), 'Шумен');
    setInp(h, $$(h, '.trf-claims')[1], 'R-11, R-12');

    ok('няма предупреждение за маршрута', !$(h, '.trf-cargo-warn'));
    realClick(h.w, $(h, '#trf-save'));
    await ticks();

    const head = posts(h, 'transfers')[0];
    ok('един POST към transfers', posts(h, 'transfers').length === 1);
    ok('номерът НЕ се подава от клиента', head && !('transfer_num' in head.body), JSON.stringify(head && head.body));
    ok('заглавие: бус, Добрич → [Шумен] → Варна, 08:30, Петър',
       head && head.body.mode === 'bus' && head.body.from_store === 'Добрич' &&
       JSON.stringify(head.body.stops) === '["Шумен"]' && head.body.end_store === 'Варна' &&
       head.body.depart_time === '08:30' && head.body.driver === 'Петър' && head.body.status === 'planned',
       JSON.stringify(head && head.body));
    ok('без куриерски полета при бус', head && head.body.courier_company === null && head.body.waybill_no === null);

    const cargo = (posts(h, 'transfer_cargo')[0] || {}).body || [];
    ok('два товара с един POST', Array.isArray(cargo) && cargo.length === 2, JSON.stringify(cargo));
    ok('товарите сочат към id от отговора', cargo.every(function (c) { return c.transfer_id === 't-new'; }));
    ok('товар 1: 2 палета до Варна, без прехвърляне',
       cargo[0] && cargo[0].kind === 'pallet' && cargo[0].qty === 2 && cargo[0].recipient_store === 'Варна' &&
       cargo[0].transfer_points.length === 0 && cargo[0].position === 1, JSON.stringify(cargo[0]));
    ok('товар 2: руло до Търговище през Шумен',
       cargo[1] && cargo[1].kind === 'roll' && cargo[1].recipient_store === 'Търговище' &&
       JSON.stringify(cargo[1].transfer_points) === '["Шумен"]', JSON.stringify(cargo[1]));
    ok('рекламациите са разделени', cargo[1] && JSON.stringify(cargo[1].claim_numbers) === '["R-11","R-12"]', JSON.stringify(cargo[1] && cargo[1].claim_numbers));

    /* ── 2. Номерът — от отговора ── */
    ok('номерът е прочетен от отговора (toast)', h.calls.toast.some(function (t) { return /Добрич-0007/.test(String(t)); }), JSON.stringify(h.calls.toast));
    ok('след запис — обратно към списъка', !$(h, '#trf-form') && !!$(h, '#trf-table'));
    h.close();
  }

  /* ── 3. Куриер ────────────────────────────────────────────────────────── */
  section('3. Куриер: без спирки, един получател');
  {
    const h = env({ clientOrders: [{ id: 'co-1', in_num: 'Добрич-0042', customer_name: 'Иван' }] });
    await openForm(h);
    realClick(h.w, $(h, '#trf-add-stop')); await ticks();
    setSel(h, $(h, '.trf-stop'), 'Шумен');
    realClick(h.w, $$(h, '.trf-add-point')[0]); await ticks();
    setSel(h, $(h, '.trf-point'), 'Шумен');

    const radio = $(h, '#trf-mode-courier'); radio.checked = true; fire(h.w, radio, 'change');
    await ticks();
    ok('при куриер няма поле за спирки', !$(h, '.trf-stop') && !$(h, '#trf-add-stop'));
    ok('при куриер няма точки на прехвърляне', !$(h, '.trf-point') && !$(h, '.trf-add-point'));
    ok('спирките са изчистени и в състоянието', h.w.tfForm.stops.length === 0 && h.w.tfForm.cargo[0].transfer_points.length === 0);

    setSel(h, $(h, '#trf-company'), 'Econt');
    setInp(h, $(h, '#trf-waybill'), '1234567890');
    setSel(h, $(h, '#trf-end'), 'Варна');
    ok('получателят на товара е заключен към получателя на куриера',
       ($(h, '.trf-recipient-fixed') || {}).textContent === 'Варна' && !$(h, '.trf-recipient'));

    /* връзка към клиентска поръчка през автодовършването */
    const co = $(h, '.trf-link-co');
    co.value = 'Добрич-0042 · Иван'; fire(h.w, co, 'change'); await ticks();
    ok('избраната поръчка е чип', ($(h, '.trf-chip-co') || {}).textContent.indexOf('Добрич-0042') >= 0);

    realClick(h.w, $(h, '#trf-save')); await ticks();
    const head = (posts(h, 'transfers')[0] || {}).body || {};
    const cargo = ((posts(h, 'transfer_cargo')[0] || {}).body || [])[0] || {};
    ok('куриер: Econt, товарителница, без спирки, без дата/шофьор',
       head.mode === 'courier' && head.courier_company === 'Econt' && head.waybill_no === '1234567890' &&
       head.stops.length === 0 && head.end_store === 'Варна' && head.depart_date === null && head.driver === null,
       JSON.stringify(head));
    ok('товарът е за получателя на куриера, без прехвърляне',
       cargo.recipient_store === 'Варна' && cargo.transfer_points.length === 0, JSON.stringify(cargo));
    ok('връзката е записана по id', JSON.stringify(cargo.client_order_ids) === '["co-1"]', JSON.stringify(cargo.client_order_ids));
    h.close();
  }
  {
    const h = env();
    const base = { from_store: 'Добрич', mode: 'courier', courier_company: 'Intime', waybill_no: '', stops: [], end_store: 'Варна',
                   cargo: [{ kind: 'pallet', qty: 1, recipient_store: '', transfer_points: [], client_order_ids: [], transport_order_ids: [] }] };
    ok('куриер без спирки и един получател — валиден', h.w.tfValidate(base) === null, h.w.tfValidate(base));
    ok('куриер със спирки — отказ', /без спирки/.test(h.w.tfValidate(Object.assign({}, base, { stops: ['Шумен'] })) || ''));
    const other = JSON.parse(JSON.stringify(base)); other.cargo[0].recipient_store = 'Шумен';
    ok('куриер с товар за друг получател — отказ', /един получател/.test(h.w.tfValidate(other) || ''), h.w.tfValidate(other));
    const pts = JSON.parse(JSON.stringify(base)); pts.cargo[0].transfer_points = ['Шумен'];
    ok('куриер с точка на прехвърляне — отказ', /без точки/.test(h.w.tfValidate(pts) || ''), h.w.tfValidate(pts));
    const noco = Object.assign({}, base, { courier_company: '' });
    ok('куриер без фирма — отказ', /фирма/.test(h.w.tfValidate(noco) || ''));
    h.close();
  }

  /* ── 4. Първата точка трябва да е спирка ──────────────────────────────── */
  section('4. Валидация: първата точка на прехвърляне / получателят е спирка на транспорта');
  {
    const h = env();
    const bus = { from_store: 'Добрич', mode: 'bus', depart_date: '2026-09-30', depart_time: '08:00', stops: ['Шумен'], end_store: 'Варна',
                  cargo: [{ kind: 'pallet', qty: 1, recipient_store: 'Търговище', transfer_points: [], client_order_ids: [], transport_order_ids: [] }] };
    ok('получател извън маршрута без прехвърляне — отказ', /Търговище.*спирка/.test(h.w.tfValidate(bus) || ''), h.w.tfValidate(bus));
    const via = JSON.parse(JSON.stringify(bus)); via.cargo[0].transfer_points = ['Шумен'];
    ok('с прехвърляне в Шумен (спирка) — валиден', h.w.tfValidate(via) === null, h.w.tfValidate(via));
    const bad = JSON.parse(JSON.stringify(bus)); bad.cargo[0].transfer_points = ['Търговище', 'Шумен'];
    ok('получателят като точка на прехвърляне — отказ', !!h.w.tfValidate(bad));
    const off = JSON.parse(JSON.stringify(bus)); off.cargo[0].recipient_store = 'Централен офис'; off.cargo[0].transfer_points = ['Търговище'];
    ok('първа точка извън маршрута — отказ', /първата точка.*Търговище/.test(h.w.tfValidate(off) || ''), h.w.tfValidate(off));
    const toEnd = JSON.parse(JSON.stringify(bus)); toEnd.cargo[0].recipient_store = 'Варна';
    ok('получател = крайна точка — валиден', h.w.tfValidate(toEnd) === null);
    const qty0 = JSON.parse(JSON.stringify(toEnd)); qty0.cargo[0].qty = 0;
    ok('брой 0 — отказ', /цяло число/.test(h.w.tfValidate(qty0) || ''));
    const qty1 = JSON.parse(JSON.stringify(toEnd)); qty1.cargo[0].qty = 1;
    ok('брой 1 (границата) — валиден', h.w.tfValidate(qty1) === null);
    const notime = Object.assign({}, toEnd, { depart_time: '' });
    ok('бус без час — отказ', /час/.test(h.w.tfValidate(notime) || ''));
    h.close();
  }
  {
    /* През бутона: получател извън маршрута → грешка и нула записи. */
    const h = env();
    await openForm(h);
    setSel(h, $(h, '#trf-time'), '09:00');
    setSel(h, $(h, '#trf-end'), 'Варна');
    setSel(h, $$(h, '.trf-recipient')[0], 'Търговище');
    ok('формата предупреждава още преди запис', !!$(h, '.trf-cargo-warn'));
    realClick(h.w, $(h, '#trf-save')); await ticks();
    ok('нищо не е записано', h.calls.post.length === 0);
    ok('грешката е показана във формата', /Търговище/.test(($(h, '#trf-error') || {}).textContent || ''), ($(h, '#trf-error') || {}).textContent);
    h.close();
  }

  /* ── 5. Видимост ──────────────────────────────────────────────────────── */
  section('5. Видимост: създател / получател / чужд обект');
  {
    const T = [
      { id: 'a', transfer_num: 'Добрич-0001', from_store: 'Добрич', mode: 'bus', stops: [], end_store: 'Варна', status: 'planned', created_at: '2026-09-29T08:00:00Z' },
      { id: 'b', transfer_num: 'Шумен-0001',  from_store: 'Шумен',  mode: 'bus', stops: ['Варна'], end_store: 'Търговище', status: 'planned', created_at: '2026-09-29T09:00:00Z' },
      { id: 'c', transfer_num: 'Шумен-0002',  from_store: 'Шумен',  mode: 'courier', courier_company: 'Econt', waybill_no: 'W1', stops: [], end_store: 'Търговище', status: 'planned', created_at: '2026-09-29T10:00:00Z' }
    ];
    const C = [
      { id: 'x1', transfer_id: 'a', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Варна', transfer_points: [] },
      /* b: Добрич е краен получател само през прехвърляне на товара */
      { id: 'x2', transfer_id: 'b', position: 1, kind: 'roll', qty: 3, recipient_store: 'Добрич', transfer_points: ['Варна'] },
      { id: 'x3', transfer_id: 'c', position: 1, kind: 'carton', qty: 1, recipient_store: 'Търговище', transfer_points: [] }
    ];
    const vis = function (h) { return $$(h, '#trf-table tbody tr[data-id]').map(function (tr) { return tr.getAttribute('data-id'); }).sort().join(','); };

    const h1 = env({ transfers: T, cargo: C });
    h1.w.showModule('transfers'); await ticks();
    ok('Добрич вижда своя (създател) и този с товар за него (получател), не чуждия', vis(h1) === 'a,b', vis(h1));
    const q = h1.calls.get.filter(function (u) { return /\/transfers\?or=/.test(u); })[0] || '';
    ok('заявката по заглавие пита създател / крайна точка / спирка', /from_store\.eq\./.test(q) && /end_store\.eq\./.test(q) && /stops\.cs\./.test(q), q);
    const qc = h1.calls.get.filter(function (u) { return /\/transfer_cargo\?or=/.test(u); })[0] || '';
    ok('заявката по товари пита получател / точка на прехвърляне', /recipient_store\.eq\./.test(qc) && /transfer_points\.cs\./.test(qc), qc);
    h1.close();

    const h2 = env({ transfers: T, cargo: C, user: { id: 'u-2', email: 'v@temax.bg', role: 'manager', store_name: 'Варна' } });
    h2.w.showModule('transfers'); await ticks();
    ok('Варна: получател в „a", спирка и точка в „b", не вижда „c"', vis(h2) === 'a,b', vis(h2));
    h2.close();

    const h3 = env({ transfers: T, cargo: C, user: { id: 'u-3', email: 'adm@temax.bg', role: 'admin', store_name: 'Централен офис' } });
    h3.w.showModule('transfers'); await ticks();
    ok('админ вижда всички', vis(h3) === 'a,b,c', vis(h3));
    /* търсене по товарителница */
    const s = $(h3, '#trf-search'); s.value = 'W1'; fire(h3.w, s, 'input');
    ok('търсене по № товарителница', vis(h3) === 'c', vis(h3));
    const s2 = $(h3, '#trf-search'); s2.value = 'Добрич'; fire(h3.w, s2, 'input');  /* рендерът подменя полето */
    ok('търсене по получател (товар)', vis(h3) === 'a,b', vis(h3));
    h3.close();

    const h4 = env();
    ok('чужд обект: tfVisibleToStores → false',
       h4.w.tfVisibleToStores(T[2], [C[2]], ['Добрич']) === false &&
       h4.w.tfVisibleToStores(T[1], [C[1]], ['Добрич']) === true &&
       h4.w.tfVisibleToStores(T[0], [C[0]], null) === true);
    h4.close();
  }

  /* ── 6. Провал при товарите ───────────────────────────────────────────── */
  section('6. Провал при товарите → заглавието се трие');
  {
    const h = env({ fail: { POST: /transfer_cargo/ } });
    await openForm(h);
    setSel(h, $(h, '#trf-time'), '09:00');
    setSel(h, $(h, '#trf-end'), 'Варна');
    setSel(h, $$(h, '.trf-recipient')[0], 'Варна');
    realClick(h.w, $(h, '#trf-save')); await ticks();
    ok('заглавието е изтрито', h.calls.del.some(function (u) { return /\/transfers\?id=eq\.t-new/.test(u); }), JSON.stringify(h.calls.del));
    ok('червен toast', h.calls.toast.some(function (t) { return /не е създаден/.test(String(t)); }), JSON.stringify(h.calls.toast));
    ok('формата остава отворена', !!$(h, '#trf-form'));
    h.close();
  }

  /* ── 7. Печат ─────────────────────────────────────────────────────────── */
  section('7. Печат на транспорта (A4, в #mod-print)');
  {
    const T = [{ id: 'a', transfer_num: 'Добрич-0001', from_store: 'Добрич', mode: 'bus', depart_date: '2026-09-30', depart_time: '08:30',
                 driver: 'Петър', stops: ['Шумен'], end_store: 'Варна', status: 'planned', created_at: '2026-09-29T08:00:00Z' }];
    const C = [
      { id: 'x1', transfer_id: 'a', position: 1, kind: 'pallet', qty: 2, recipient_store: 'Варна', transfer_points: [], client_order_ids: ['co-1'], claim_numbers: ['R-1'], goods_doc: 'СР-5' },
      { id: 'x2', transfer_id: 'a', position: 2, kind: 'roll', qty: 1, recipient_store: 'Търговище', transfer_points: ['Шумен'], client_order_ids: [] }
    ];
    const h = env({ transfers: T, cargo: C, clientOrders: [{ id: 'co-1', in_num: 'Добрич-0042' }] });
    h.w.showModule('transfers'); await ticks();
    realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="a"]'), 'Печат')); await ticks();
    const pr = h.doc.getElementById('mod-print');
    ok('печатът е показан', pr && pr.style.display === 'block');
    const txt = pr ? pr.textContent : '';
    ok('номер, маршрут, шофьор', /Добрич-0001/.test(txt) && /Добрич → Шумен → Варна/.test(txt) && /Петър/.test(txt));
    const rows = pr ? pr.querySelectorAll('.tf-tbl tbody tr') : [];
    ok('ред на товар', rows.length === 2, String(rows.length));
    ok('връзките с номера на КЗ', /КЗ Добрич-0042/.test(txt) && /Рекл\. R-1/.test(txt) && /СР СР-5/.test(txt), txt.slice(0, 300));
    ok('прехвърлянето е в реда на товара', rows[1] && /Шумен/.test(rows[1].textContent));
    ok('A4 и изрично white-space:normal в клетките (глобалното th{nowrap})',
       /size:A4 portrait/.test(pr.innerHTML) && /\.tf-tbl th,\.tf-tbl td\{[^}]*white-space:normal/.test(pr.innerHTML));
    ok('бутон „← Обратно" връща към Трансфери', /showModule\('transfers'\)/.test(pr.innerHTML));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
