/* store_name следва „Поръчан от магазин" и на ДВЕТЕ останали места.

   1c614ca направи store_name = избраният обект при НОВ запис. Оставаха два
   пътя, по които двете полета пак се разминават:

   · КОРЕКЦИЯ (shared.js/submitCorrection) — патчът пишеше само from_store.
     Редът показваше новия обект, но видимостта и номерирането вървят по
     store_name, тоест магазинът пак не виждаше заявката си.
   · „➕ Още една заявка за същия клиент" (client-orders.js/openClientModal)
     — prefill.from_store се подаваше, но никой не го четеше: менюто оставаше
     преизбрано на магазина на въвеждащия и втората заявка от една поръчка
     се откъсваше от първата.

   Пускане:
     node tests/client-order-store-sync.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks, dayOffset, tsOffset } = H;

/* accounting → isGlobal()===true и canCorrectRecord()===true за чужда заявка */
const CO_USER = {
  email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева',
  role: 'accounting', store_name: 'Централен офис',
  assigned_stores: ['Карлово', 'Пирдоп']
};

const STORE_USER = {
  email: 'petrich@temax.bg', display_name: 'Магазин Петрич',
  role: 'user', store_name: 'Петрич'
};

const STORES = [
  { name: 'Карлово' }, { name: 'Петрич' }, { name: 'Пирдоп' },
  { name: 'Централен офис' }
];

/* Стара заявка, влязла ПРЕДИ 1c614ca: номерът и store_name са на ЦО,
   а „Поръчан от магазин" сочи Пирдоп — точно разминаването от 24.08. */
const CO_ORDER = {
  id: 'o-1', in_num: 'Централен офис-0133', store_name: 'Централен офис',
  from_store: 'Пирдоп', fulfiller: 'Централен офис', status: 'done',
  date: dayOffset(-5), hour: '10:00',
  customer_name: 'Иван Петров', phone: '0888111222',
  product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
  items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
  delivery: dayOffset(-1), note: '', agent: 'П. Георгиева',
  created_at: tsOffset(-5), co_eta: null, co_note: null,
  paid_transport: false, transport_id: null, group_id: null
};

const TR_ORDER = {
  id: 't-1', store_name: 'Карлово', status: 'done',
  date: dayOffset(-4), hour: '10:00',
  customer_name: 'Мария Георгиева', phone: '0888333444',
  address: 'Карлово, ул. Тест 2',
  product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.',
  items: [{ product: 'МИВКА', sap: '222', qty: 1, unit: 'бр.' }],
  delivery: dayOffset(-1), notes: '', agent: 'П. Георгиева',
  created_at: tsOffset(-4)
};

function env(user) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: user,
    data: { client_orders: [], transport_orders: [], stores: STORES }
  });
  h.w.clientOrders = JSON.parse(JSON.stringify([CO_ORDER]));
  h.w.transportOrders = JSON.parse(JSON.stringify([TR_ORDER]));
  h.w.clientOrders.forEach(o => { o._status = h.w.calcStatus(o.delivery, o.status); });
  return h;
}

/* Прихваща PATCH-а на корекцията. Снимка, не референция. */
function stubPatch(w) {
  const state = { n: 0, patches: [] };
  w.sbPatch = function (table, filter, body) {
    state.n++;
    state.patches.push({ table: table, filter: filter, body: JSON.parse(JSON.stringify(body)) });
    return Promise.resolve({ ok: true });
  };
  return state;
}

function stubPost(w) {
  const state = { n: 0, recs: [] };
  w.sbPostReturn = function (table, body) {
    state.n++;
    state.recs.push({ table: table, body: JSON.parse(JSON.stringify(body)) });
    return Promise.resolve({ ok: true, row: { in_num: 'X-0001' } });
  };
  return state;
}

async function saveCorrection(w, doc) {
  const modal = doc.getElementById('correction-modal');
  const b = btn(modal, 'Запази корекцията');
  if (!b) throw new Error('няма бутон „Запази корекцията"');
  realClick(w, b, 'Запази корекцията');
  await ticks(6);
}

function fillItems(doc, containerId) {
  const row = doc.querySelector('#' + containerId + ' .item-row');
  if (!row) throw new Error('няма ред за артикул в #' + containerId);
  row.querySelector('.item-product').value = 'ПАРКЕТ';
  row.querySelector('.item-qty').value = '5';
}

(async function run() {

  section('а) Корекция: смяна на „Поръчан от магазин" мести и store_name');
  {
    const { w, doc } = env(CO_USER);
    const patch = stubPatch(w);

    guard('openCorrection() не хвърля', () => w.openCorrection('o-1', 'client_orders'));
    await ticks(4);

    const sel = doc.getElementById('edt-from-store');
    ok('полето „Поръчан от магазин" е попълнено', !!sel && sel.options.length > 0,
      sel ? 'опции=' + sel.options.length : 'няма елемент');
    sel.value = 'Пирдоп';
    ok('изборът се е записал', sel.value === 'Пирдоп', sel.value);

    await saveCorrection(w, doc);

    if (ok('патчът е изпратен', patch.n === 1, 'n=' + patch.n)) {
      const b = patch.patches[0].body;
      ok('патчът е към client_orders', patch.patches[0].table === 'client_orders');
      ok('from_store е новият обект', b.from_store === 'Пирдоп', b.from_store);
      ok('store_name СЪЩО е новият обект', b.store_name === 'Пирдоп', b.store_name);
      ok('in_num НЕ е в патча — номерът остава от бланката',
        !('in_num' in b), JSON.stringify(b.in_num));
      /* Останалата част от патча не бива да е пострадала */
      ok('fulfiller още се пише', 'fulfiller' in b);
      ok('note още се пише', 'note' in b);
      ok('клиентът е запазен', b.customer_name === 'Иван Петров', b.customer_name);
    }
  }

  section('б1) Корекция на ТРАНСПОРТНА заявка → store_name изобщо не се пипа');
  {
    const { w, doc } = env(CO_USER);
    const patch = stubPatch(w);

    guard('openCorrection() за транспорт не хвърля',
      () => w.openCorrection('t-1', 'transport_orders'));
    await ticks(4);
    doc.getElementById('edt-addr').value = 'Карлово, ул. Тест 2';
    fillItems(doc, 'edt-items');

    await saveCorrection(w, doc);

    if (ok('патчът е изпратен', patch.n === 1, 'n=' + patch.n)) {
      const b = patch.patches[0].body;
      ok('патчът е към transport_orders', patch.patches[0].table === 'transport_orders');
      ok('from_store не участва', !('from_store' in b));
      ok('store_name НЕ е в патча', !('store_name' in b), JSON.stringify(b.store_name));
      ok('address си е на място', b.address === 'Карлово, ул. Тест 2', b.address);
    }
  }

  section('б2) Клиентска корекция с ПРАЗЕН „Поръчан от магазин" → без store_name');
  {
    const { w, doc } = env(CO_USER);
    const patch = stubPatch(w);

    guard('openCorrection() не хвърля', () => w.openCorrection('o-1', 'client_orders'));
    await ticks(4);

    const sel = doc.getElementById('edt-from-store');
    sel.innerHTML = '<option value=""></option>';
    sel.value = '';
    ok('полето е празно', sel.value === '', JSON.stringify(sel.value));

    await saveCorrection(w, doc);

    if (ok('патчът е изпратен', patch.n === 1, 'n=' + patch.n)) {
      const b = patch.patches[0].body;
      ok('from_store е празен низ', b.from_store === '', JSON.stringify(b.from_store));
      ok('store_name НЕ се записва с празна стойност',
        !('store_name' in b), JSON.stringify(b.store_name));
    }
  }

  section('в) „Още една заявка": prefill.from_store преизбира менюто');
  {
    const { w, doc } = env(CO_USER);
    const post = stubPost(w);

    guard('openClientModal с prefill не хвърля', () => w.openClientModal({
      from_store: 'Пирдоп', customer_name: 'Иван Петров', phone: '0888111222'
    }));
    await ticks(4);

    const sel = doc.getElementById('c-from-store');
    ok('полето е SELECT (2 назначени обекта)', !!sel && sel.tagName === 'SELECT',
      sel ? sel.tagName : 'няма елемент');
    ok('менюто е преизбрано на „Пирдоп", не на ЦО', !!sel && sel.value === 'Пирдоп',
      sel ? sel.value : '');
    ok('данните на клиента са пренесени',
      doc.getElementById('c-name').value === 'Иван Петров',
      doc.getElementById('c-name').value);

    fillItems(doc, 'c-items');
    realClick(w, doc.getElementById('co-submit'), 'Запази заявката');
    await ticks(6);

    if (ok('заявката е изпратена', post.n === 1, 'n=' + post.n)) {
      const rec = post.recs[0].body;
      ok('store_name на втората заявка е „Пирдоп"', rec.store_name === 'Пирдоп',
        rec.store_name);
      ok('from_store също', rec.from_store === 'Пирдоп', rec.from_store);
    }
  }

  section('г) Несъществуващ обект в prefill → менюто не се пипа');
  {
    const { w, doc } = env(CO_USER);
    const post = stubPost(w);

    guard('openClientModal с невалиден prefill не хвърля', () => w.openClientModal({
      from_store: 'Несъществуващ', customer_name: 'Иван Петров', phone: '0888111222'
    }));
    await ticks(4);

    const sel = doc.getElementById('c-from-store');
    ok('менюто пази предварителния избор', !!sel && sel.value === 'Централен офис',
      sel ? sel.value : '');
    ok('менюто НЕ е изпразнено', !!sel && sel.options.length === STORES.length,
      sel ? 'опции=' + sel.options.length : '');
    const hasGhost = !!sel && Array.prototype.some.call(
      sel.options, o => o.value === 'Несъществуващ');
    ok('невалидната стойност не се добавя като опция', !hasGhost);

    fillItems(doc, 'c-items');
    realClick(w, doc.getElementById('co-submit'), 'Запази заявката');
    await ticks(6);
    if (ok('заявката е изпратена', post.n === 1, 'n=' + post.n)) {
      ok('store_name е предварителният избор, не измисленият обект',
        post.recs[0].body.store_name === 'Централен офис', post.recs[0].body.store_name);
    }
  }

  section('д) 1-магазинен потребител: prefill не отключва чужд обект');
  {
    const { w, doc } = env(STORE_USER);
    const post = stubPost(w);

    guard('openClientModal не хвърля', () => w.openClientModal({
      from_store: 'Пирдоп', customer_name: 'Иван Петров', phone: '0888111222'
    }));
    await ticks(4);

    const el = doc.getElementById('c-from-store');
    ok('полето е заключено (hidden input)',
      !!el && el.tagName === 'INPUT' && el.type === 'hidden',
      el ? el.tagName + '/' + el.type : 'няма елемент');
    ok('стойността остава неговият магазин', !!el && el.value === 'Петрич',
      el ? el.value : '');

    fillItems(doc, 'c-items');
    realClick(w, doc.getElementById('co-submit'), 'Запази заявката');
    await ticks(6);
    if (ok('заявката е изпратена', post.n === 1, 'n=' + post.n)) {
      ok('store_name остава „Петрич"', post.recs[0].body.store_name === 'Петрич',
        post.recs[0].body.store_name);
    }
  }

  report();
})();
