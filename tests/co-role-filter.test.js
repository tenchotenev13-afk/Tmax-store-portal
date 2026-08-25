/* Филтър "моя роля" в Клиентски заявки (#co-role-filter).

   Разделя двата потока, които иначе се смесват в един списък:
     · "За изпращане"  — аз съм изпълнителят, чужд обект чака стока от мен;
     · "За получаване" — аз съм заявителят, чужд обект ми дължи стока.

   Тестът пуска РЕАЛНИЯ index.html + shared.js + client-orders.js и сменя
   стойността на select-а с истинско `change` събитие, за да мине през
   inline onchange="renderClientOrders()", а не да вика рендера директно.

   Пускане от корена на репото:
     node tests/co-role-filter.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, fire, ok, guard, section, report, dayOffset, tsOffset } = H;

/* ── 1. Данни ────────────────────────────────────────────────────────────── */

/* Потребител на обект Троян — НЕ е global, значи assignedStores() връща
   точно ['Троян']. */
const TROYAN_USER = {
  email: 'troyan@temax.bg', display_name: 'Магазин Троян',
  role: 'store', store_name: 'Троян'
};

function order(over) {
  return Object.assign({
    id: 'x', in_num: '0000', store_name: 'Троян', fulfiller: null,
    status: 'pending', date: dayOffset(-2), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.' }],
    delivery: dayOffset(8), note: '', created_at: tsOffset(-2),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null
  }, over);
}

const ORDERS = [
  /* o-1: изпълнява Троян, но записано с ГЛАВНИ букви. Заявителят е Севлиево.
     → "За изпращане". Точката на теста: нормализацията. */
  order({ id: 'o-1', in_num: '0001', fulfiller: 'ТРОЯН', store_name: 'Севлиево', status: 'pending' }),

  /* o-2: Троян изпълнява собствената си заявка → нито изходяща, нито входяща. */
  order({ id: 'o-2', in_num: '0002', fulfiller: 'Троян', store_name: 'Троян', status: 'pending' }),

  /* o-3: Троян е заявител, изпълнява Враца, стоката е тръгнала, но още не е
     приета → "За получаване". */
  order({ id: 'o-3', in_num: '0003', store_name: 'Троян', fulfiller: 'Враца', status: 'sent' }),

  /* o-4: същата, но приключена → не излиза никъде. */
  order({ id: 'o-4', in_num: '0004', store_name: 'Троян', fulfiller: 'Враца', status: 'done' }),

  /* o-5: Троян е заявител, но НЯМА изпълнител (обслужва се сам) → не е входяща. */
  order({ id: 'o-5', in_num: '0005', store_name: 'Троян', fulfiller: null, status: 'pending' }),

  /* o-6: Троян изпълнява за Габрово, но вече е изпратил → изходящата приключва,
     оттук нататък чака заявителя. Граничен случай точно на ръба на списъка
     ['pending','postponed','processed']. */
  order({ id: 'o-6', in_num: '0006', fulfiller: 'Троян', store_name: 'Габрово', status: 'sent' }),

  /* o-7: Троян изпълнява за Монтана, отложена → пак изходяща (postponed е в списъка). */
  order({ id: 'o-7', in_num: '0007', fulfiller: 'Троян', store_name: 'Монтана', status: 'postponed' }),

  /* o-8: чужда заявка между два други обекта → Троян няма нищо общо. */
  order({ id: 'o-8', in_num: '0008', store_name: 'Враца', fulfiller: 'Плевен', status: 'pending' })
];

/* Очаквано: изходящи = o-1, o-7 ; входящи = o-3 */
const EXPECT_OUT = ['o-1', 'o-7'];
const EXPECT_IN = ['o-3'];

/* ── 2. Обвивка над boot() ───────────────────────────────────────────────── */
function env(over) {
  over = over || {};
  const h = boot(Object.assign({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: over.user || TROYAN_USER,
    data: { client_orders: ORDERS, transport_orders: [], stores: [] }
  }, over.bootOpts || {}));

  h.w.transportOrders = [];
  h.w.clientOrders = JSON.parse(JSON.stringify(over.orders || ORDERS));
  h.w.clientOrders.forEach(o => {
    o._status = h.w.calcStatus(o.delivery, o.status);
    o._days = h.w.calcElapsed(o.created_at);
    o._isFulfiller = !h.w.isGlobal() &&
      o.fulfiller === h.w.currentUser.store_name &&
      o.store_name !== h.w.currentUser.store_name;
  });
  return h;
}

/* Идентификаторите на реално изрисуваните редове (празният ред "Няма заявки"
   няма id, затова се филтрира сам). */
function rowIds(doc) {
  const body = doc.getElementById('co-body');
  if (!body) return null;
  return Array.prototype.slice.call(body.getElementsByTagName('tr'))
    .map(tr => tr.id)
    .filter(id => id && id.indexOf('co-row-') === 0)
    .map(id => id.slice('co-row-'.length));
}

/* Числото в скобите на дадена опция: "За изпращане (2)" → 2 */
function labelCount(sel, value) {
  const opts = Array.prototype.slice.call(sel.options);
  const o = opts.filter(x => x.value === value)[0];
  if (!o) return null;
  const m = /\((\d+)\)/.exec(o.textContent || '');
  return m ? Number(m[1]) : null;
}

(async function run() {

  /* ── 3. Полето съществува и се пълни ───────────────────────────────────── */
  section('1. Падащото меню съществува и стои ПРЕДИ "Изпълнява"');
  {
    const { w, doc } = env();
    const sel = doc.getElementById('co-role-filter');
    if (ok('#co-role-filter е в index.html', !!sel)) {
      ok('onchange вика renderClientOrders()',
        (sel.getAttribute('onchange') || '').indexOf('renderClientOrders') >= 0,
        sel.getAttribute('onchange'));

      const fulf = doc.getElementById('co-fulfiller-filter');
      ok('стои преди #co-fulfiller-filter',
        !!fulf && !!(sel.compareDocumentPosition(fulf) & 4));

      ok('единствената начална опция е "Всички заявки"',
        sel.options.length === 1 && sel.options[0].value === '' &&
        sel.options[0].textContent.trim() === 'Всички заявки',
        sel.innerHTML);
    }

    guard('coBuildRoleOptions() не хвърля', () => w.coBuildRoleOptions());
    ok('трите опции са налични след попълване', sel.options.length === 3, sel.innerHTML);
    ok('стойностите са "", "out", "in"',
      sel.options[0].value === '' && sel.options[1].value === 'out' && sel.options[2].value === 'in');
  }

  section('2. Броячите в етикетите');
  {
    const { w, doc } = env();
    w.coBuildRoleOptions();
    const sel = doc.getElementById('co-role-filter');
    ok('"За изпращане" брои 2 (o-1 с главни букви + o-7 отложена)',
      labelCount(sel, 'out') === 2, sel.innerHTML);
    ok('"За получаване" брои 1 (само o-3)',
      labelCount(sel, 'in') === 1, sel.innerHTML);
  }

  /* ── 4. Истински клик/change по филтъра ────────────────────────────────── */
  section('3. Избор "За изпращане" — истинско change събитие');
  {
    const { w, doc } = env();
    w.coBuildRoleOptions();
    w.renderClientOrders();
    const sel = doc.getElementById('co-role-filter');

    ok('без филтър се виждат всички 8 заявки', (rowIds(doc) || []).length === 8);

    sel.value = 'out';
    if (guard('change по #co-role-filter не хвърля', () => fire(w, sel, 'change'))) {
      const ids = rowIds(doc) || [];
      ok('излизат точно o-1 и o-7', ids.sort().join(',') === EXPECT_OUT.join(','), ids.join(','));
      ok('o-1 излиза, макар fulfiller да е "ТРОЯН" с главни букви', ids.indexOf('o-1') >= 0);
      ok('o-2 (Троян→Троян) НЕ излиза', ids.indexOf('o-2') < 0);
      ok('o-6 (вече изпратена) НЕ излиза', ids.indexOf('o-6') < 0);
      ok('o-8 (чужда заявка) НЕ излиза', ids.indexOf('o-8') < 0);
      ok('броят редове съвпада с брояча в етикета',
        ids.length === labelCount(sel, 'out'), ids.length + ' vs ' + labelCount(sel, 'out'));
    }
  }

  section('4. Избор "За получаване" — истинско change събитие');
  {
    const { w, doc } = env();
    w.coBuildRoleOptions();
    w.renderClientOrders();
    const sel = doc.getElementById('co-role-filter');

    sel.value = 'in';
    if (guard('change по #co-role-filter не хвърля', () => fire(w, sel, 'change'))) {
      const ids = rowIds(doc) || [];
      ok('излиза само o-3 (Враца → Троян, изпратена)',
        ids.sort().join(',') === EXPECT_IN.join(','), ids.join(','));
      ok('o-4 (същата, но изпълнена) НЕ излиза', ids.indexOf('o-4') < 0);
      ok('o-5 (без изпълнител) НЕ излиза', ids.indexOf('o-5') < 0);
      ok('o-2 (Троян→Троян) НЕ излиза', ids.indexOf('o-2') < 0);
      ok('броят редове съвпада с брояча в етикета',
        ids.length === labelCount(sel, 'in'), ids.length + ' vs ' + labelCount(sel, 'in'));
    }

    sel.value = '';
    fire(w, sel, 'change');
    ok('връщане на "Всички заявки" показва пак всичките 8', (rowIds(doc) || []).length === 8);
  }

  /* ── 5. Съжителство с останалите филтри ────────────────────────────────── */
  section('5. Не разваля другите филтри (правило 5 от заявката)');
  {
    const { w, doc } = env();
    w.coBuildFulfillerOptions();
    w.coBuildRoleOptions();
    const role = doc.getElementById('co-role-filter');
    const fulf = doc.getElementById('co-fulfiller-filter');

    /* "За получаване" + "Изпълнява: Враца" → пресичане, остава o-3 */
    role.value = 'in';
    fulf.value = 'враца';
    fire(w, role, 'change');
    ok('двата филтъра се пресичат, не се бият',
      (rowIds(doc) || []).join(',') === 'o-3', (rowIds(doc) || []).join(','));

    /* Бутоните за статус (orderFilter) продължават да работят отгоре */
    fulf.value = '';
    role.value = 'out';
    w.orderFilter = 'postponed';
    w.renderClientOrders();
    ok('статусният филтър стеснява ролевия (остава само o-7)',
      (rowIds(doc) || []).join(',') === 'o-7', (rowIds(doc) || []).join(','));
    w.orderFilter = 'all';
  }

  /* ── 6. Празни данни и брой 0 ──────────────────────────────────────────── */
  section('6. Опциите стоят и при брой 0 (CLAUDE.md т.11)');
  {
    const { w, doc } = env({ orders: [order({ id: 'z-1', store_name: 'Троян', fulfiller: null })] });
    const sel = doc.getElementById('co-role-filter');
    guard('coBuildRoleOptions() при нулеви бройки не хвърля', () => w.coBuildRoleOptions());
    ok('и трите опции пак са там', sel.options.length === 3, sel.innerHTML);
    ok('"За изпращане" показва (0)', labelCount(sel, 'out') === 0, sel.innerHTML);
    ok('"За получаване" показва (0)', labelCount(sel, 'in') === 0, sel.innerHTML);

    sel.value = 'out';
    fire(w, sel, 'change');
    ok('изборът дава празен списък, не грешка', (rowIds(doc) || []).length === 0);
  }

  section('7. Изборът преживява презареждане на опциите');
  {
    const { w, doc } = env();
    const sel = doc.getElementById('co-role-filter');
    w.coBuildRoleOptions();
    sel.value = 'in';
    w.coBuildRoleOptions();  /* както прави loadClientOrders() при рефреш */
    ok('стойността "in" се запазва', sel.value === 'in', sel.value);
  }

  /* ── 7. КОНТРОЛЕН ТЕСТ ─────────────────────────────────────────────────── */
  section('8. Контролен тест — без нормализация тестът с главни букви ПАДА');
  {
    const { w, doc } = env();
    /* Махаме само свеждането до малки букви — остава trim, тоест сравнението
       става точно това, което би било със строго ===. Ако след това o-1 пак
       излезе, значи проверката отгоре не мери нормализацията и лъже. */
    w.coNormName = function (n) { return String(n || '').trim(); };

    w.coBuildRoleOptions();
    const sel = doc.getElementById('co-role-filter');
    sel.value = 'out';
    fire(w, sel, 'change');
    const ids = rowIds(doc) || [];

    ok('БЕЗ нормализация o-1 ("ТРОЯН") изпада от "За изпращане"',
      ids.indexOf('o-1') < 0, ids.join(','));
    ok('БЕЗ нормализация броячът пада от 2 на 1',
      labelCount(sel, 'out') === 1, sel.innerHTML);
    ok('o-7 (точно изписване) остава — счупена е само нормализацията',
      ids.indexOf('o-7') >= 0, ids.join(','));
  }

  /* ── 8. Глобални роли: assignedStores() връща null ─────────────────────── */
  section('9. admin/accounting/logistics — assignedStores() е null, пада на store_name');
  {
    /* 18 от 34-те глобални потребителя днес нямат assigned_stores (проверено
       в базата 25.08.2026), тоест минават точно през резервния списък
       [currentUser.store_name]. Тестът заковава именно този клон. */
    const CO_ORDERS = [
      order({ id: 'a-1', in_num: '1001', fulfiller: 'ЦЕНТРАЛЕН ОФИС', store_name: 'Троян', status: 'pending' }),
      order({ id: 'a-2', in_num: '1002', store_name: 'Централен офис', fulfiller: 'Враца', status: 'sent' }),
      order({ id: 'a-3', in_num: '1003', store_name: 'Троян', fulfiller: 'Враца', status: 'pending' })
    ];
    const { w, doc } = env({
      user: { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
      orders: CO_ORDERS
    });

    ok('assignedStores() наистина връща null за тази роля', w.assignedStores() === null,
      JSON.stringify(w.assignedStores()));
    ok('резервният набор е собственият обект',
      w.coMyStoreSet()['централен офис'] === true, JSON.stringify(w.coMyStoreSet()));

    w.coBuildRoleOptions();
    const sel = doc.getElementById('co-role-filter');
    ok('"За изпращане" брои 1 (a-1, макар ЦО да е с главни букви)',
      labelCount(sel, 'out') === 1, sel.innerHTML);
    ok('"За получаване" брои 1 (a-2)', labelCount(sel, 'in') === 1, sel.innerHTML);

    sel.value = 'out';
    fire(w, sel, 'change');
    ok('изходящата е a-1', (rowIds(doc) || []).join(',') === 'a-1', (rowIds(doc) || []).join(','));
    sel.value = 'in';
    fire(w, sel, 'change');
    ok('входящата е a-2', (rowIds(doc) || []).join(',') === 'a-2', (rowIds(doc) || []).join(','));
    ok('a-3 (чужда за ЦО) не излиза в нито един', (rowIds(doc) || []).indexOf('a-3') < 0);
  }

  section('10. Глобален потребител С assigned_stores — наборът са обектите, не ЦО');
  {
    /* Регионален счетоводител: store_name е "Централен офис", но регионът е
       друг и ЦО НЕ е вътре в assigned_stores (така изглеждат и 16-те реални
       записа в базата). Заявката към Supabase вече е стеснена по същия
       списък, затова наборът трябва да съвпада с него, а не със store_name. */
    const REG_ORDERS = [
      order({ id: 'r-1', in_num: '2001', store_name: 'Троян', fulfiller: 'Централен офис', status: 'pending' }),
      order({ id: 'r-2', in_num: '2002', fulfiller: 'Враца', store_name: 'Плевен', status: 'pending' }),
      order({ id: 'r-3', in_num: '2003', store_name: 'Троян', fulfiller: 'Враца', status: 'pending' })
    ];
    const { w, doc } = env({
      user: {
        email: 'reg@temax.bg', display_name: 'Регионален', role: 'accounting',
        store_name: 'Централен офис', assigned_stores: ['Враца', 'Троян']
      },
      orders: REG_ORDERS
    });

    const mine = w.coMyStoreSet();
    ok('наборът съдържа обектите от региона', mine['враца'] === true && mine['троян'] === true);
    ok('ЦО НЕ е в набора, макар да е store_name на потребителя',
      mine['централен офис'] !== true, JSON.stringify(mine));

    w.coBuildRoleOptions();
    const sel = doc.getElementById('co-role-filter');
    ok('"За получаване" брои 1 (r-1: ЦО дължи на Троян)', labelCount(sel, 'in') === 1, sel.innerHTML);
    ok('"За изпращане" брои 1 (r-2: Враца изпраща на Плевен)',
      labelCount(sel, 'out') === 1, sel.innerHTML);

    sel.value = 'in';
    fire(w, sel, 'change');
    ok('r-3 (между два МОИ обекта) не е входяща', (rowIds(doc) || []).indexOf('r-3') < 0);
    sel.value = 'out';
    fire(w, sel, 'change');
    ok('r-3 не е и изходяща — и двете страни съм аз',
      (rowIds(doc) || []).indexOf('r-3') < 0, (rowIds(doc) || []).join(','));
  }

  report();
})();
