/* Клиентска заявка: store_name трябва да е ИЗБРАНИЯТ „Поръчан от магазин",
   не магазинът на този, който въвежда.

   Досега записът беше store_name:currentUser.store_name. Когато регионален
   мениджър или админ (isGlobal, повече от един назначен обект) избереше друг
   обект, заявката излизаше като „Централен офис-0133“:
     · тригерът assign_client_order_num() номерира по new.store_name;
     · loadClientOrders() филтрира по store_name/fulfiller — from_store не
       участва никъде освен като колона в реда;
     · coSameCustomerCandidates() търси по вече заредените заявки, тоест
       не вижда чуждата и не предупреждава за дубликат.
   Реален случай: П. Георгиева (ЦО/регионален, Пирдоп) въведе
   Централен офис-0133 на 24.08; Пирдоп не я видя и въведе Пирдоп-0141
   три минути по-късно.

   Пускане:
     node tests/client-order-from-store.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

/* Регионален от ЦО: role accounting → isGlobal()===true, два назначени
   обекта → „Поръчан от магазин" остава истинско падащо меню. */
const CO_USER = {
  email: 'p.georgieva@temax.bg', display_name: 'П. Георгиева',
  role: 'accounting', store_name: 'Централен офис',
  assigned_stores: ['Карлово', 'Пирдоп']
};

/* Обикновен служител: role user → isGlobal()===false → assignedStores()
   връща точно един обект и openClientModal подменя select-а със скрит input. */
const STORE_USER = {
  email: 'petrich@temax.bg', display_name: 'Магазин Петрич',
  role: 'user', store_name: 'Петрич'
};

const STORES = [
  { name: 'Карлово' }, { name: 'Петрич' }, { name: 'Пирдоп' },
  { name: 'Централен офис' }
];

function env(user) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: user,
    data: { client_orders: [], transport_orders: [], stores: STORES }
  });
  h.w.clientOrders = [];
  h.w.transportOrders = [];
  return h;
}

/* Стъб, който записва подадения rec — сърцето на теста.
   Пази СНИМКА, не референция: submitClientOrder дописва rec.in_num върху
   същия обект след отговора, тоест референция би показала състояние СЛЕД
   записа вместо това, което реално е тръгнало към базата. */
function stubPost(w) {
  const state = { n: 0, recs: [] };
  w.sbPostReturn = function (table, body) {
    state.n++;
    state.recs.push({ table: table, body: JSON.parse(JSON.stringify(body)) });
    return Promise.resolve({ ok: true, row: { in_num: 'X-0001' } });
  };
  return state;
}

/* Отваря модала и изчаква loadAllStores()/fillStoreSelect да напълнят
   падащото меню — иначе задаването на .value на празен select тихо не
   прави нищо и тестът би „минал" върху непопълнено поле. */
async function openModal(w, doc) {
  w.openClientModal();
  await ticks(4);
}

function fillRequired(doc) {
  doc.getElementById('c-name').value = 'Иван Петров';
  doc.getElementById('c-phone').value = '0888111222';
  const row = doc.querySelector('#c-items .item-row');
  if (!row) throw new Error('няма ред за артикул в #c-items');
  row.querySelector('.item-product').value = 'ПАРКЕТ';
  row.querySelector('.item-qty').value = '5';
}

async function saveAndGetRec(w, doc, post) {
  realClick(w, doc.getElementById('co-submit'), 'Запази заявката');
  await ticks(6);
  return post.recs.length ? post.recs[post.recs.length - 1].body : null;
}

(async function run() {

  section('а) Регионален от ЦО избира „Пирдоп" → заявката е на Пирдоп');
  {
    const { w, doc } = env(CO_USER);
    const post = stubPost(w);
    await openModal(w, doc);

    const sel = doc.getElementById('c-from-store');
    ok('за 2-магазинен потребител полето е истински SELECT',
      !!sel && sel.tagName === 'SELECT', sel ? sel.tagName : 'няма елемент');
    const hasPirdop = !!sel && Array.prototype.some.call(
      sel.options, o => o.textContent === 'Пирдоп');
    ok('падащото меню съдържа „Пирдоп"', hasPirdop,
      sel ? Array.prototype.map.call(sel.options, o => o.textContent).join('|') : '');

    sel.value = 'Пирдоп';
    ok('изборът наистина се е записал в полето', sel.value === 'Пирдоп', sel.value);

    fillRequired(doc);
    const rec = await saveAndGetRec(w, doc, post);

    if (ok('заявката е изпратена', !!rec, 'n=' + post.n)) {
      ok('store_name е ИЗБРАНИЯТ магазин, не ЦО', rec.store_name === 'Пирдоп',
        rec.store_name);
      ok('from_store остава непроменен (съвместимост с колоната)',
        rec.from_store === 'Пирдоп', rec.from_store);
      ok('agent е въвелият от ЦО — вижда се кой е пуснал заявката',
        rec.agent === 'П. Георгиева', rec.agent);
      ok('номерът НЕ се смята от клиента (идва от тригера)',
        rec.in_num === undefined, String(rec.in_num));
    }
  }

  section('б) Същият потребител избира „Централен офис" → непроменено поведение');
  {
    const { w, doc } = env(CO_USER);
    const post = stubPost(w);
    await openModal(w, doc);

    const sel = doc.getElementById('c-from-store');
    sel.value = 'Централен офис';
    ok('изборът се е записал', sel.value === 'Централен офис', sel.value);

    fillRequired(doc);
    const rec = await saveAndGetRec(w, doc, post);

    if (ok('заявката е изпратена', !!rec, 'n=' + post.n)) {
      ok('store_name остава „Централен офис"',
        rec.store_name === 'Централен офис', rec.store_name);
      ok('from_store също', rec.from_store === 'Централен офис', rec.from_store);
    }
  }

  section('в) Магазинен потребител (1 обект) → скрит input, заявката е негова');
  {
    const { w, doc } = env(STORE_USER);
    const post = stubPost(w);
    await openModal(w, doc);

    const el = doc.getElementById('c-from-store');
    ok('за 1-магазинен потребител полето е заключено (hidden input)',
      !!el && el.tagName === 'INPUT' && el.type === 'hidden',
      el ? el.tagName + '/' + el.type : 'няма елемент');
    ok('стойността е неговият магазин', !!el && el.value === 'Петрич',
      el ? el.value : '');

    fillRequired(doc);
    const rec = await saveAndGetRec(w, doc, post);

    if (ok('заявката е изпратена', !!rec, 'n=' + post.n)) {
      ok('store_name е „Петрич"', rec.store_name === 'Петрич', rec.store_name);
      ok('и съвпада с currentUser.store_name', rec.store_name === w.currentUser.store_name);
    }
  }

  section('г) Липсващо или празно поле → fallback към currentUser.store_name');
  {
    /* г1 — елементът изобщо го няма в DOM-а */
    const { w, doc } = env(CO_USER);
    const post = stubPost(w);
    await openModal(w, doc);
    const el = doc.getElementById('c-from-store');
    el.parentNode.removeChild(el);
    ok('полето е премахнато от DOM-а', !doc.getElementById('c-from-store'));

    fillRequired(doc);
    const rec = await saveAndGetRec(w, doc, post);
    if (ok('заявката пак минава', !!rec, 'n=' + post.n)) {
      ok('store_name пада обратно към currentUser.store_name',
        rec.store_name === 'Централен офис', rec.store_name);
    }
  }
  {
    /* г2 — елементът е там, но стойността е празна */
    const { w, doc } = env(CO_USER);
    const post = stubPost(w);
    await openModal(w, doc);
    const sel = doc.getElementById('c-from-store');
    sel.innerHTML = '<option value=""></option>';
    sel.value = '';
    ok('полето е празно', sel.value === '', JSON.stringify(sel.value));

    fillRequired(doc);
    const rec = await saveAndGetRec(w, doc, post);
    if (ok('заявката пак минава', !!rec, 'n=' + post.n)) {
      ok('празната стойност не се записва като store_name',
        rec.store_name === 'Централен офис', rec.store_name);
    }
  }

  section('д) Свързаният платен транспорт наследява СЪЩИЯ магазин');
  {
    /* createLinkedTransport ползва co.store_name, не currentUser — тоест
       поправката се пренася и към транспортната заявка. Ако някой я върне
       към currentUser, тази проверка пада. */
    const { w, doc, calls } = env(CO_USER);
    const post = stubPost(w);
    await openModal(w, doc);
    doc.getElementById('c-from-store').value = 'Пирдоп';
    fillRequired(doc);
    doc.getElementById('c-paid-transport').checked = true;
    guard('toggleClientPT() не хвърля', () => w.toggleClientPT());
    doc.getElementById('c-pt-addr').value = 'Пирдоп, ул. Тест 1';

    const rec = await saveAndGetRec(w, doc, post);
    if (ok('клиентската заявка е изпратена', !!rec, 'n=' + post.n)) {
      ok('store_name на клиентската заявка е „Пирдоп"',
        rec.store_name === 'Пирдоп', rec.store_name);
    }
    const tr = calls.post.filter(p => p.table === 'transport_orders');
    if (ok('създадена е и транспортна заявка', tr.length === 1, 'бр=' + tr.length)) {
      ok('транспортът е на СЪЩИЯ магазин, не на ЦО',
        tr[0].body.store_name === 'Пирдоп', tr[0].body.store_name);
    }
  }

  report();
})();
