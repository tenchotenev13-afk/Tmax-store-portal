/* Междускладови трансфери — дотоварване от спирка и търсене по товар.

   Какво заковава файлът:
   1. ДОТОВАРВАНЕ от спирка (Враца на бус Козлодуй → Враца → Плевен → Троян):
      бутон „➕ Дотовари" в картата, истински клик, товарът се записва с
      loaded_at_store = Враца и следваща позиция; прогресът 1/3 → 1/4 и
      етикетът „· дотоварен в Враца" в картата и в печата.
   2. БЕЗ БУТОН: началото (Козлодуй), крайната точка (Троян), чужд обект
      (Варна — дори не вижда транспорта), глобална роля, Завършен транспорт.
   3. ОТКАЗ: получател или точка на прехвърляне ПРЕДИ дотоварващия обект.
   4. „Решен" и „Предаден на куриер" — изпращачът на дотоварен товар е
      loaded_at_store, не създателят.
   5. ТЪРСЕНЕ ПО ТОВАР: стокова / рекламация / № клиентска заявка / бележка →
      точният товар с последното му движение („в път", ако няма).
   6. ВИДИМОСТ: чужд обект не намира чужд товар; админът — да.
   7. ТОЛЕРАНТНО ТЪРСЕНЕ: общ корен, една сгрешена буква, разместени думи и
      главни, латински двойници; числата — само точен подниз; точните
      съвпадения преди толерантните; видимостта не се променя.

   Пускане:  node tests/transfers-reload-search.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const STORES = ['Козлодуй', 'Враца', 'Плевен', 'Троян', 'Варна', 'Шумен', 'Централен офис'];
const U = function (store, role) { return { id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store }; };
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* Бус Козлодуй → Враца → Плевен → Троян. */
const BUS = { id: 'b1', transfer_num: 'Козлодуй-0001', from_store: 'Козлодуй', mode: 'bus', depart_date: '2026-09-30', depart_time: '08:00',
              driver: 'Иван', stops: ['Враца', 'Плевен'], end_store: 'Троян', status: 'partial', created_at: '2026-09-29T08:00:00Z' };
const CARGO = [
  /* c1: за Враца — без отметка (в раздел 5 — получен) */
  { id: 'c1', transfer_id: 'b1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Враца', transfer_points: [], goods_doc: 'СР-1001', note: 'Стелажни елементи' },
  /* c2: за Троян, свързан с клиентска заявка Троян-0042 */
  { id: 'c2', transfer_id: 'b1', position: 2, kind: 'roll', qty: 2, recipient_store: 'Троян', transfer_points: [], client_order_ids: ['co-42'], claim_numbers: ['РК-555'], goods_doc: '6514123134' },
  /* c3: за Троян с прехвърляне в Плевен — разтоварен там (единственото завършено) */
  { id: 'c3', transfer_id: 'b1', position: 3, kind: 'carton', qty: 1, recipient_store: 'Троян', transfer_points: ['Плевен'], note: 'чупливо стъкло' }
];
const E_RECEIVED = { id: 'e1', transfer_id: 'b1', cargo_id: 'c1', store_name: 'Враца', event: 'received', created_at: '2026-09-30T09:15:00Z' };
const EVENTS = [
  { id: 'e2', transfer_id: 'b1', cargo_id: 'c3', store_name: 'Плевен', event: 'unloaded', created_at: '2026-09-30T10:30:00Z' }
];
/* Чужд транспорт Шумен → Варна. */
const FOREIGN = { id: 'f1', transfer_num: 'Шумен-0003', from_store: 'Шумен', mode: 'bus', depart_date: '2026-09-30', depart_time: '07:00',
                  stops: [], end_store: 'Варна', status: 'planned', created_at: '2026-09-29T07:00:00Z' };
const FCARGO = [{ id: 'f1c', transfer_id: 'f1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Варна', transfer_points: [], goods_doc: 'СР-777', note: 'чупливо' }];
const CLIENT_ORDERS = [{ id: 'co-42', in_num: 'Троян-0042' }, { id: 'co-43', in_num: 'Троян-0043' }];

function env(user, opts) {
  opts = opts || {};
  /* Фалшивият PostgREST не пази POST-овете — тук товарите и отметките се
     пазят, за да ги върне следващото зареждане, както би направила базата. */
  const box = { h: null };
  const postedOf = function (table) {
    const out = [];
    if (!box.h) return out;
    box.h.calls.post.filter(function (p) { return p.table === table; }).forEach(function (p) {
      [].concat(p.body).forEach(function (b) { out.push(b); });
    });
    return out;
  };
  const storedCargo = function () {
    return (opts.cargo || CARGO.concat(FCARGO)).concat(postedOf('transfer_cargo').map(function (b, i) {
      return Object.assign({ id: 'new-' + i }, b);
    }));
  };
  const storedEvents = function () {
    return (opts.events || EVENTS).concat(postedOf('transfer_cargo_events').map(function (b, i) {
      return Object.assign({ id: 'ev-' + i, created_at: '2026-09-30T1' + i + ':00:00Z' }, b);
    }));
  };
  const h = boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(function (s) { return { store_name: s }; }),
      transfers: opts.transfers || [BUS, FOREIGN],
      transfer_cargo: storedCargo,
      transfer_cargo_events: storedEvents,
      client_orders: CLIENT_ORDERS, transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  box.h = h;
  return h;
}
const $ = function (h, s) { return h.doc.querySelector(s); };
const $$ = function (h, s) { return Array.prototype.slice.call(h.doc.querySelectorAll(s)); };
const posts = function (h, table) { return h.calls.post.filter(function (p) { return p.table === table; }); };
function setSel(h, el, val) { el.value = val; fire(h.w, el, 'change'); }
function setInp(h, el, val) { el.value = val; fire(h.w, el, 'input'); }
async function open(h) { h.w.showModule('transfers'); await ticks(); }
async function card(h, id) { realClick(h.w, H.btn($(h, '#trf-table tbody tr[data-id="' + id + '"]'), 'Отвори')); await ticks(); }
const rowOf = function (h, id) { return $(h, '#trf-table tbody tr[data-id="' + id + '"]'); };
async function search(h, q) {
  const el = $(h, '#trf-csearch'); setInp(h, el, q);
  realClick(h.w, $(h, '#trf-csearch-go')); await ticks();
  return $$(h, '.trf-cargo-hit').map(function (r) { return r.getAttribute('data-c'); });
}
const hitLast = function (h, cid) { const r = $(h, '.trf-cargo-hit[data-c="' + cid + '"] .trf-cargo-last'); return r ? r.textContent : ''; };

(async function () {

  section('1. Дотоварване от спирка (Враца): истински клик, запис, прогрес 1/3 → 1/4');
  {
    const h = env(U('Враца'));
    await open(h);
    ok('преди: прогрес 1/3', /1\/3 товара/.test(rowOf(h, 'b1').querySelector('.trf-progress').textContent), rowOf(h, 'b1').querySelector('.trf-progress').textContent);
    await card(h, 'b1');
    const b = $(h, '.trf-reload');
    ok('Враца вижда „➕ Дотовари" в картата', !!b && /Дотовари/.test(b.textContent));
    realClick(h.w, b); await ticks();
    ok('отваря се формата за дотоварване', !!$(h, '#trf-form') && /Дотоварване в Враца — Козлодуй-0001/.test($(h, '#mod-transfers .pg-title').textContent), ($(h, '#mod-transfers .pg-title') || {}).textContent);
    ok('маршрутът оттук: Враца → Плевен → Троян', /Враца\s*→ Плевен → Троян/.test($(h, '#trf-reload-route').textContent), $(h, '#trf-reload-route').textContent);
    ok('няма редактор на началото, датата и спирките', !$(h, '#trf-from') && !$(h, '#trf-date') && !$(h, '#trf-add-stop') && !$(h, '#trf-mode-bus'));
    const recOpts = Array.prototype.map.call($(h, '.trf-recipient').options, function (o) { return o.value; });
    ok('получателят не предлага Козлодуй и Враца', recOpts.indexOf('Козлодуй') < 0 && recOpts.indexOf('Враца') < 0 && recOpts.indexOf('Троян') >= 0, recOpts.join(','));
    ok('същите полета като при създаване (вид, брой, бележка, точки, стокова, рекламация, КЗ)',
       !!$(h, '.trf-kind') && !!$(h, '.trf-qty') && !!$(h, '.trf-note') && !!$(h, '.trf-add-point') && !!$(h, '.trf-goods') && !!$(h, '.trf-claims') && !!$(h, '.trf-link-co'));
    setSel(h, $(h, '.trf-recipient'), 'Троян'); await ticks();
    setSel(h, $(h, '.trf-kind'), 'bulk');
    setInp(h, $(h, '.trf-qty'), '3');
    setInp(h, $(h, '.trf-goods'), 'СР-2002');
    realClick(h.w, $(h, '#trf-save')); await ticks(); await ticks();
    const p = posts(h, 'transfer_cargo');
    const body = p[0] ? [].concat(p[0].body) : [];
    ok('записан е ЕДИН товар, без нов транспорт', p.length === 1 && body.length === 1 && posts(h, 'transfers').length === 0, JSON.stringify(body));
    const row = body[0] || {};
    ok('loaded_at_store = Враца, transfer_id = b1, позиция 4', row.loaded_at_store === 'Враца' && row.transfer_id === 'b1' && row.position === 4, JSON.stringify(row));
    ok('полетата на товара: насип ×3 → Троян, СР-2002', row.kind === 'bulk' && row.qty === 3 && row.recipient_store === 'Троян' && row.goods_doc === 'СР-2002', JSON.stringify(row));
    ok('след записа — пак картата на транспорта', !!$(h, '#trf-card'));
    ok('в картата: прогрес 1/4', /1\/4 товара/.test($(h, '#trf-card .trf-progress').textContent), $(h, '#trf-card .trf-progress').textContent);
    const nc = $(h, '.trf-card-cargo[data-c="new-0"]');
    ok('етикетът: „#4 Насип ×3 → Троян · дотоварен в Враца"', nc && /#4 Насип ×3 → Троян · дотоварен в Враца/.test(nc.textContent), nc && nc.textContent.slice(0, 120));
    ok('статусът остава Частично (не се PATCH-ва излишно)', $(h, '#trf-card .trf-status').getAttribute('data-status') === 'partial' &&
       !h.calls.patch.some(function (x) { return x.table === 'transfers'; }));
    realClick(h.w, $(h, '#trf-card-back')); await ticks();
    ok('в списъка: прогрес 1/4', /1\/4 товара/.test(rowOf(h, 'b1').querySelector('.trf-progress').textContent));
    realClick(h.w, H.btn(rowOf(h, 'b1'), 'Печат')); await ticks();
    ok('в печата: „дотоварен в Враца" при товара', /Троян\s*дотоварен в Враца/.test(($(h, '#mod-print .tf-tbl') || {}).textContent || ''));
    h.close();

    /* Завършен транспорт → дотоварката го връща в „Частично" и това се записва. */
    const allDone = EVENTS.concat([E_RECEIVED,
      { id: 'e3', transfer_id: 'b1', cargo_id: 'c2', store_name: 'Троян', event: 'received', created_at: '2026-09-30T12:00:00Z' }
    ]);
    const h2 = env(U('Плевен'), { events: allDone });
    await open(h2); await card(h2, 'b1');
    ok('контрол: при 3/3 (Завършен) Плевен НЕ вижда бутона', !$(h2, '.trf-reload'), $(h2, '#trf-card .trf-progress').textContent);
    h2.close();
  }

  section('2. Без бутон: начало, крайна точка, чужд обект, глобална роля');
  {
    const cases = [['Козлодуй', 'началото'], ['Троян', 'крайната точка']];
    for (const c of cases) {
      const h = env(U(c[0]));
      await open(h); await card(h, 'b1');
      ok(c[0] + ' (' + c[1] + ') — картата е отворена, но без „Дотовари"', !!$(h, '#trf-card') && !$(h, '.trf-reload'));
      h.close();
    }
    const hp = env(U('Плевен'));
    await open(hp); await card(hp, 'b1');
    ok('Плевен (втора спирка) — бутонът Е там', !!$(hp, '.trf-reload'));
    hp.close();
    const hv = env(U('Варна'));
    await open(hv);
    ok('Варна (чужд обект) не вижда транспорта изобщо', !rowOf(hv, 'b1'));
    ok('правилото: Варна не може да дотовари b1', hv.w.tfReloadStores(BUS).length === 0);
    hv.w.openReloadForm('b1', 'Варна'); await ticks();
    ok('директно извикване от чужд обект — няма форма', !$(hv, '#trf-form'));
    hv.close();
    const ha = env(ADMIN);
    await open(ha); await card(ha, 'b1');
    ok('админ (глобална роля, не е обект) — без бутон', !$(ha, '.trf-reload'));
    ha.close();
  }

  section('3. Получател / точка ПРЕДИ дотоварващия обект — отказ');
  {
    const h = env(U('Плевен'));
    await open(h); await card(h, 'b1');
    realClick(h.w, $(h, '.trf-reload')); await ticks();
    const f = h.w.tfForm;
    ok('формата е за Плевен, маршрутът оттук е само Троян', f && f.from_store === 'Плевен' && h.w.tfRouteStops(f).join(',') === 'Троян', f && h.w.tfRouteStops(f).join(','));
    /* Селектът не предлага предишните спирки — стойността се задава направо,
       както би дошла от стара форма. */
    f.cargo[0].recipient_store = 'Враца';
    realClick(h.w, $(h, '#trf-save')); await ticks();
    ok('получател Враца (преди Плевен) — отказ, нищо не е записано', posts(h, 'transfer_cargo').length === 0);
    ok('грешката казва защо', /„Враца" е преди Плевен/.test($(h, '#trf-error').textContent), $(h, '#trf-error').textContent);
    f.cargo[0].recipient_store = 'Козлодуй';
    ok('получател Козлодуй (началото) — отказ', /„Козлодуй" е преди Плевен/.test(h.w.tfValidate(f) || ''), h.w.tfValidate(f));
    f.cargo[0].recipient_store = 'Плевен';
    ok('получател самият Плевен — отказ', /„Плевен" е преди Плевен|получателят не може да е началният обект/.test(h.w.tfValidate(f) || ''), h.w.tfValidate(f));
    f.cargo[0].recipient_store = 'Шумен'; f.cargo[0].transfer_points = ['Враца'];
    ok('точка на прехвърляне Враца (преди Плевен) — отказ', /„Враца" е преди Плевен/.test(h.w.tfValidate(f) || ''), h.w.tfValidate(f));
    f.cargo[0].transfer_points = ['Варна'];
    ok('първа точка извън маршрута след Плевен — отказ', /спирка след Плевен или крайната точка/.test(h.w.tfValidate(f) || ''), h.w.tfValidate(f));
    f.cargo[0].transfer_points = ['Троян'];
    ok('Шумен през Троян — валидно', h.w.tfValidate(f) === null, h.w.tfValidate(f));
    f.cargo[0].transfer_points = []; f.cargo[0].recipient_store = 'Троян';
    ok('Троян (крайната точка) — валидно', h.w.tfValidate(f) === null, h.w.tfValidate(f));
    realClick(h.w, $(h, '#trf-cancel')); await ticks();
    ok('„Откажи" връща в картата', !!$(h, '#trf-card'));
    h.close();
  }

  section('4. Изпращачът на дотоварен товар е loaded_at_store');
  {
    const R = { id: 'c4', transfer_id: 'b1', position: 4, kind: 'pallet', qty: 1, recipient_store: 'Троян', transfer_points: [], loaded_at_store: 'Враца' };
    const prob = { id: 'p1', transfer_id: 'b1', cargo_id: 'c4', store_name: 'Троян', event: 'problem', problem_kind: 'damaged', comment: 'смачкан', created_at: '2026-09-30T13:00:00Z' };
    const h = env(U('Враца'), { cargo: CARGO.concat([R]), events: EVENTS.concat([prob]) });
    await open(h); await card(h, 'b1');
    const box = $(h, '.trf-card-cargo[data-c="c4"]');
    ok('Враца вижда „Решен" при дотоварения си товар', !!box && !!box.querySelector('.trf-act-resolved'));
    realClick(h.w, box.querySelector('.trf-act-resolved')); await ticks();
    realClick(h.w, $(h, '#tfe-save')); await ticks();
    const ev = (posts(h, 'transfer_cargo_events')[0] || {}).body || {};
    ok('записано: resolved от Враца за p1', ev.event === 'resolved' && ev.store_name === 'Враца' && ev.resolves_id === 'p1', JSON.stringify(ev));
    h.close();
    const hk = env(U('Козлодуй'), { cargo: CARGO.concat([R]), events: EVENTS.concat([prob]) });
    await open(hk); await card(hk, 'b1');
    ok('Козлодуй (създателят) НЕ решава проблем по чужд дотоварен товар', !$(hk, '.trf-card-cargo[data-c="c4"] .trf-act-resolved'));
    ok('правилото: „Предаден на куриер" иска loaded_at_store', /Враца/.test(hk.w.tfEventAllowed('handed_to_courier', Object.assign({}, BUS, { mode: 'courier' }), R, [], 'Козлодуй', false) || ''));
    ok('Враца е по маршрута на товара, Козлодуй — не', hk.w.tfCargoRouteStores(BUS, R).join(',') === 'Враца,Троян');
    hk.close();
  }

  section('5. Търсене по товар: стокова / рекламация / № КЗ / бележка');
  {
    const h = env(U('Враца'), { events: [E_RECEIVED].concat(EVENTS) });
    await open(h);
    ok('полето „Товар" е преди „+ Нов транспорт"', (function () {
      const a = $(h, '#trf-csearch'), b = $(h, '#trf-new');
      return a && b && (a.compareDocumentPosition(b) & 4);
    })());
    ok('по стокова СР-1001 → c1', (await search(h, 'ср-1001')).join(',') === 'c1');
    ok('c1: последно — получен във Враца, с час', /получен в Враца · 30\.09 \d\d:15/.test(hitLast(h, 'c1')), hitLast(h, 'c1'));
    ok('по рекламация РК-555 → c2', (await search(h, 'РК-555')).join(',') === 'c2');
    ok('c2 без движение → „в път"', /в път/.test(hitLast(h, 'c2')), hitLast(h, 'c2'));
    ok('по № клиентска заявка Троян-0042 → c2 (номер → id)', (await search(h, 'Троян-0042')).join(',') === 'c2');
    const coCall = h.calls.get.filter(function (g) { return /\/client_orders\?/.test(g); }).pop();
    ok('заявката към client_orders е по in_num', coCall && /in_num=ilike/.test(decodeURIComponent(coCall)), coCall);
    ok('Троян-0043 (няма товар) → нищо', (await search(h, 'Троян-0043')).length === 0 && /Няма товар/.test($(h, '#trf-cargo-results').textContent));
    ok('по бележка „чупливо" → c3 (само своят, не чуждият f1c)', (await search(h, 'чупливо')).join(',') === 'c3');
    ok('c3: разтоварен в Плевен — чака прехвърляне', /разтоварен в Плевен — чака прехвърляне/.test(hitLast(h, 'c3')), hitLast(h, 'c3'));
    realClick(h.w, $(h, '.trf-cargo-hit[data-c="c3"]')); await ticks();
    ok('клик → картата на транспорта', !!$(h, '#trf-card') && h.w.tfCardId === 'b1');
    realClick(h.w, $(h, '#trf-card-back')); await ticks();
    ok('търсенето по транспорт си стои', !!$(h, '#trf-search'));
    realClick(h.w, $(h, '#trf-csearch-clear')); await ticks();
    ok('„Изчисти" маха резултатите', !$(h, '#trf-cargo-results'));
    h.close();
  }

  section('6. Видимост: чужд обект не намира чужд товар');
  {
    const h = env(U('Враца'));
    await open(h);
    ok('Враца търси СР-777 (товар Шумен → Варна) → нищо', (await search(h, 'СР-777')).length === 0);
    h.close();
    const hv = env(U('Варна'));
    await open(hv);
    ok('Варна не намира СР-1001 на b1', (await search(hv, 'СР-1001')).length === 0);
    ok('Варна намира своя СР-777', (await search(hv, 'СР-777')).join(',') === 'f1c');
    hv.close();
    const ha = env(ADMIN);
    await open(ha);
    ok('админът намира „чупливо" и в двата транспорта', (await search(ha, 'чупливо')).sort().join(',') === 'c3,f1c');
    ha.close();
  }

  section('7. Толерантно търсене: правопис, корен, латиница; числата — точно');
  {
    const R = { id: 'c4', transfer_id: 'b1', position: 4, kind: 'pallet', qty: 1, recipient_store: 'Троян', transfer_points: [], loaded_at_store: 'Враца' };
    const h = env(U('Враца'), { cargo: CARGO.concat([R], FCARGO) });
    await open(h);
    ok('„дотоварване" → дотовареният в Враца (и само той)', (await search(h, 'дотоварване')).join(',') === 'c4');
    ok('„стелжни" (липсва буква) → „Стелажни елементи"', (await search(h, 'стелжни')).join(',') === 'c1');
    ok('„ЕЛЕМЕНТИ стелажни" (разместени, главни) → c1', (await search(h, 'ЕЛЕМЕНТИ стелажни')).join(',') === 'c1');
    ok('„стелажни дъски" — втората дума не съвпада → нищо (И между думите)', (await search(h, 'стелажни дъски')).length === 0);
    const lat = await search(h, 'Tpоян');
    ok('„Tpоян" (T и p латински) → товарите за Троян', lat.sort().join(',') === 'c2,c3,c4', lat.join(','));
    ok('„6514123135" (една цифра разлика) → НЕ намира 6514123134', (await search(h, '6514123135')).length === 0);
    ok('„651412" (подниз) → c2', (await search(h, '651412')).join(',') === 'c2');
    ok('„СР-1002" (една цифра разлика) → нищо', (await search(h, 'СР-1002')).length === 0);
    /* Точните първи: c2 получава „стелажи" (толерантно), c3 — „стелажни" (точно). */
    const mixed = await search(h, 'стелажни');
    ok('точно съвпадение — c1', mixed.join(',') === 'c1');
    h.w.tfTransfers.forEach(function (t) { (h.w.tfCargoByTransfer[t.id] || []).forEach(function (c) { if (c.id === 'c2') c.note = 'стелажи'; if (c.id === 'c3') c.note = 'стелажни'; }); });
    const ord = await search(h, 'стелажни');
    ok('подредба: точните (c1, c3) преди толерантното (c2 „стелажи")', ord.join(',') === 'c1,c3,c2', ord.join(','));
    ok('правилото: tfCargoMatch връща 2 за точно и 1 за толерантно',
       h.w.tfCargoMatch('стелажни', { note: 'Стелажни' }) === 2 && h.w.tfCargoMatch('стелжни', { note: 'Стелажни' }) === 1 &&
       h.w.tfCargoMatch('6514123135', { goods_doc: '6514123134' }) === 0);
    ok('къса дума („в") се пропуска, щом има други', h.w.tfCargoMatch('в Троян', { recipient_store: 'Троян' }) === 2);
    h.close();
    const hv = env(U('Варна'), { cargo: CARGO.concat([R], FCARGO) });
    await open(hv);
    ok('видимост: Варна не намира „стелжни" (c1 е чужд)', (await search(hv, 'стелжни')).length === 0);
    ok('видимост: Варна не намира „дотоварване" (c4 е чужд)', (await search(hv, 'дотоварване')).length === 0);
    hv.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
