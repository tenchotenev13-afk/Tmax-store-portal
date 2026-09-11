/* Клиентски заявки — известие за НОВА заявка към ИЗПЪЛНИТЕЛЯ + брояч на таба.

   Какво заковава тестът:
     1. обхватът на звънеца е „заявки, които АЗ трябва да изпълня":
        · магазин Троян чува заявка с fulfiller=Троян от Монтана, НЕ и своята
          собствена (Троян→Троян), НЕ и тази, която сам е поръчал от другиго;
        · ЦО — само роля supply, и само fulfiller='Централен офис' (същият
          обхват като push-а); admin, accounting, marketing и user в ЦО —
          нищо, включително регионалните счетоводители, чиято таблица е
          непокътната;
        · логистичен склад (роля logistics, assigned_stores='{}') — само своя;
        · обхватът е в САМАТА ЗАЯВКА към PostgREST (fulfiller=in, store_name=
          not.in), не само във филтър в JS — fake-ът емулира филтрите;
     2. toast-ът казва номер · клиент · от кой обект, и кликът отваря модала;
     3. картата „N нови заявки за изпълнение": Виж →, ✕, смяна на статус;
     4. баджът = просрочени/днешни + чакащи-за-мен, без двойно броене; и
        СЪЩЕСТВУВА (изтрит е от index.html на 19.06.2026 и не се показваше);
     5. мрежов срив не нулира _seenIds и не вдига фалшива тревога;
     6. push: магазин → pushToStores([fulfiller]), ЦО → pushToRole('supply'),
        своя заявка и празен изпълнител → НИЩО (най-вече не pushToAll).

   Пускане:  node tests/co-new-for-fulfiller.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, btnExact, ok, guard, section, report,
        dayOffset, tsOffset, ticks } = H;

const CO = 'Централен офис';
const WH = 'Логистичен склад Добрич';

const U_TROYAN = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'store', store_name: 'Троян' };
const U_CO_ACC = { email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: CO, assigned_stores: ['Троян'] };
const U_CO_SUP = { email: 'sup@temax.bg', display_name: 'Снабдяване ЦО', role: 'supply', store_name: CO };
const U_WH     = { email: 'wh@temax.bg', display_name: 'Склад Добрич', role: 'logistics', store_name: WH, assigned_stores: [] };

function order(over) {
  return Object.assign({
    status: 'pending', date: dayOffset(0), hour: '10:00', bon: '',
    customer_name: 'Клиент', phone: '0888000000', agent: '',
    product: 'ПРОДУКТ', color: '', sap: '1', qty: 1, unit: 'бр.', items: null,
    delivery: dayOffset(10), note: '', co_eta: null, co_note: null,
    paid_transport: false, transport_id: null, group_id: null,
    created_at: tsOffset(0)
  }, over);
}

/* Базата в началото — съществуващи заявки, които стават базата на звънеца */
const BASE = [
  order({ id: 'b-mon-tro', in_num: 'Монтана-0001', store_name: 'Монтана', fulfiller: 'Троян' }),
  order({ id: 'b-co',      in_num: 'Троян-0001',   store_name: 'Троян',   fulfiller: CO }),
  order({ id: 'b-wh',      in_num: 'Троян-0002',   store_name: 'Троян',   fulfiller: WH })
];
/* Новопостъпили след базата */
const N_FOR_TROYAN = order({ id: 'n-mon-tro', in_num: 'Монтана-0007', store_name: 'Монтана', fulfiller: 'Троян', customer_name: 'КАРТРАНС ЕООД' });
const N_TROYAN_OWN = order({ id: 'n-tro-tro', in_num: 'Троян-0241',   store_name: 'Троян',   fulfiller: 'Троян', customer_name: 'Своя' });
const N_TROYAN_OUT = order({ id: 'n-tro-mon', in_num: 'Троян-0242',   store_name: 'Троян',   fulfiller: 'Монтана', customer_name: 'Поръчана от Троян' });
const N_FOR_CO     = order({ id: 'n-sli-co',  in_num: 'Сливен-0010',  store_name: 'Сливен',  fulfiller: CO, customer_name: 'ЦО клиент' });
const N_CO_OWN     = order({ id: 'n-co-co',   in_num: 'ЦО-0001',      store_name: CO,        fulfiller: CO, customer_name: 'ЦО за себе си' });
const N_FOR_WH     = order({ id: 'n-shu-wh',  in_num: 'Шумен-0050',   store_name: 'Шумен',   fulfiller: WH, customer_name: 'Складов клиент' });
const N_OTHER_WH   = order({ id: 'n-shu-wh2', in_num: 'Шумен-0051',   store_name: 'Шумен',   fulfiller: 'Логистичен склад Търговище' });

/* ── Мини PostgREST: емулира САМО филтрите, които кодът ползва ──
   Без това тестът би проверявал единствено JS-а, а обхватът трябва да е в
   самата заявка — иначе звънецът тегли чужди id-та и ги пази в _seenIds. */
function parseList(v) {
  const m = /^(not\.)?in\.\((.*)\)$/.exec(v);
  if (!m) return null;
  const out = []; let cur = ''; let q = false;
  for (const ch of m[2]) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.length) out.push(cur);
  return { not: !!m[1], vals: out };
}
function pg(rows, url) {
  const sp = new URL(url).searchParams;
  return rows.filter(o => {
    for (const [k, v] of sp) {
      if (k === 'order' || k === 'select' || k === 'limit') continue;
      if (k === 'or') {
        const parts = v.replace(/^\(|\)$/g, '').split(',');
        const hit = parts.some(p => { const [f, op, ...rest] = p.split('.'); return op === 'eq' && String(o[f]) === rest.join('.'); });
        if (!hit) return false;
        continue;
      }
      const lst = parseList(v);
      if (lst) {
        const inIt = lst.vals.indexOf(String(o[k])) >= 0;
        if (lst.not ? inIt : !inIt) return false;
        continue;
      }
      const eq = /^eq\.(.*)$/.exec(v);
      if (eq && String(o[k]) !== eq[1]) return false;
    }
    return true;
  });
}

/* db е ЖИВ масив — тестът добавя редове между циклите на звънеца.
   state.failClient прави заявките към client_orders да падат (500). */
function env(user, over) {
  over = over || {};
  const db = { client: (over.client || BASE).slice(), transport: [{ id: 't1', store_name: user.store_name }] };
  const state = { failClient: false, failTransport: false };
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'stock-differences.js', 'push.js', 'notifications.js'],
    user,
    data: {
      client_orders: url => pg(db.client, url),
      transport_orders: () => db.transport,
      stores: [], users: [], order_restrictions: [], sap_catalog: [], kasa_reports: [],
      loading_lists: [], loading_list_items: []
    },
    fail: { GET: url =>
      (state.failClient && /\/client_orders/.test(url)) ||
      (state.failTransport && /\/transport_orders/.test(url)) }
  });
  h.db = db; h.state = state;
  h.w.transportOrders = [];
  h.w.clientOrders = [];
  return h;
}
/* Един цикъл на звънеца — точно каквото прави setInterval на всеки 30 сек */
async function cycle(h) { h.w.checkNewOrders(); await ticks(); await ticks(); }
const seenC = w => Object.keys(w._seenIds || {}).filter(k => k.indexOf('c_') === 0).sort();
/* Общото съобщение за нови заявки (toast() от shared.js, записва го harness-ът) */
const falseAlarm = h => h.calls.toast.filter(m => /нов[аи] заявк|Нова заявка е постъпила/.test(String(m)));
const newForMe = w => Object.keys(w._coNewForMe || {}).sort();

(async function run() {

  /* ══════════ 1. Обхват — магазин ══════════ */
  section('1. Магазин Троян — чува само заявките, които САМ трябва да изпълни');
  {
    const h = env(U_TROYAN);
    const { w, calls } = h;
    ok('предикатът съществува', typeof w.coMyFulfillerNames === 'function');
    ok('за Троян изпълнителят е ["Троян"]',
      JSON.stringify(w.coMyFulfillerNames && w.coMyFulfillerNames()) === '["Троян"]');

    await cycle(h);
    ok('базов цикъл: в _seenIds е заявката за изпълнение от Монтана',
      seenC(w).indexOf('c_b-mon-tro') >= 0, JSON.stringify(seenC(w)));
    ok('базов цикъл: НЯМА заявки, които Троян сам е поръчал от другиго',
      seenC(w).indexOf('c_b-co') < 0 && seenC(w).indexOf('c_b-wh') < 0, JSON.stringify(seenC(w)));
    ok('базовият цикъл е тих — нито една „нова"', newForMe(w).length === 0);

    const url = calls.get.filter(u => /\/client_orders/.test(u) && /select=id/.test(u)).pop() || '';
    const sp = new URL(url).searchParams;
    ok('обхватът е в заявката: fulfiller=in.("Троян")', sp.get('fulfiller') === 'in.("Троян")', sp.get('fulfiller'));
    ok('и своите се изключват там: store_name=not.in.("Троян")', sp.get('store_name') === 'not.in.("Троян")', sp.get('store_name'));

    h.db.client.push(N_FOR_TROYAN, N_TROYAN_OWN, N_TROYAN_OUT);
    await cycle(h);
    ok('новата заявка Монтана→Троян Е обявена', newForMe(w).indexOf('n-mon-tro') >= 0, JSON.stringify(newForMe(w)));
    ok('СВОЯТА (Троян→Троян) НЕ е обявена', newForMe(w).indexOf('n-tro-tro') < 0);
    ok('поръчаната от Троян към Монтана НЕ е обявена', newForMe(w).indexOf('n-tro-mon') < 0);
    ok('в _seenIds няма своята собствена', seenC(w).indexOf('c_n-tro-tro') < 0, JSON.stringify(seenC(w)));
    ok('обявена е точно една', newForMe(w).length === 1, JSON.stringify(newForMe(w)));
  }

  /* ══════════ 2. Обхват — ЦО и склад ══════════
     За ЦО изпълнител е САМО роля supply — същият обхват като push-а
     (pushToRole('supply')). Останалите ~46 души с обект ЦО (admin, accounting,
     marketing, user) не получават нито звънец, нито карта, нито бадж. */
  section('2. Централен офис — изпълнител е само роля supply');
  {
    const h = env(U_CO_SUP);
    const { w } = h;
    ok('supply: изпълнителят е ["Централен офис"]',
      JSON.stringify(w.coMyFulfillerNames()) === '["' + CO + '"]', JSON.stringify(w.coMyFulfillerNames()));
    await cycle(h);
    ok('supply: базата съдържа само заявката към ЦО',
      JSON.stringify(seenC(w)) === '["c_b-co"]', JSON.stringify(seenC(w)));
    h.db.client.push(N_FOR_CO, N_CO_OWN, N_FOR_TROYAN, N_FOR_WH);
    await cycle(h);
    ok('supply: обявена е само новата към ЦО (без своята ЦО→ЦО)',
      JSON.stringify(newForMe(w)) === '["n-sli-co"]', JSON.stringify(newForMe(w)));
  }
  {
    const h = env(U_CO_SUP);
    h.db.client.push(N_FOR_CO);
    guard('loadClientOrders() за ЦО supply', () => h.w.loadClientOrders());
    await ticks();
    const o = (h.w.clientOrders || []).find(x => x.id === 'n-sli-co');
    ok('supply: заявката към ЦО е в таблицата и _isFulfiller е true (баджът я брои)',
      !!o && o._isFulfiller === true, o && String(o._isFulfiller));
  }
  /* Всички НЕ-supply роли в ЦО — нищо. Включително двата вида accounting
     (с и без региони) и marketing/user, които са НЕ-глобални и под старото
     правило (!isGlobal() && fulfiller===store_name) бяха изпълнители. */
  const NON_SUPPLY = [
    Object.assign({}, U_CO_ACC, { assigned_stores: [] }),
    U_CO_ACC,
    { email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: CO, assigned_stores: [] },
    { email: 'mkt@temax.bg', display_name: 'Маркетинг', role: 'marketing', store_name: CO },
    { email: 'usr@temax.bg', display_name: 'Потребител ЦО', role: 'user', store_name: CO }
  ];
  for (const U of NON_SUPPLY) {
    const tag = U.role + (U.assigned_stores && U.assigned_stores.length ? ' (регионален)' : '');
    const h = env(U);
    const { w, calls } = h;
    ok(tag + ': НЕ е изпълнител — coMyFulfillerNames() е []',
      JSON.stringify(w.coMyFulfillerNames()) === '[]', JSON.stringify(w.coMyFulfillerNames()));
    await cycle(h);
    h.db.client.push(N_FOR_CO);
    await cycle(h);
    ok(tag + ': звънецът НЕ обявява заявка към ЦО', newForMe(w).length === 0, JSON.stringify(newForMe(w)));
    ok(tag + ': и изобщо не пита client_orders от звънеца',
      !calls.get.some(u => /\/client_orders/.test(u) && /select=id/.test(u)));
    guard(tag + ': loadClientOrders()', () => w.loadClientOrders());
    await ticks();
    /* Без заявка към ЦО в таблицата „false" по-долу би минало на празно. */
    const toCo = (w.clientOrders || []).filter(x => x.fulfiller === CO);
    if (ok(tag + ': в таблицата има заявка към ЦО (иначе проверката е празна)', toCo.length > 0,
           JSON.stringify((w.clientOrders || []).map(x => x.id)))) {
      ok(tag + ': _isFulfiller е false за заявките към ЦО (баджът не ги брои)',
        !toCo.some(x => x._isFulfiller), JSON.stringify(toCo.map(x => x.id + ':' + x._isFulfiller)));
    }
  }
  {
    /* Регионалните счетоводители НЕ са пипани: таблицата им тегли само своите
       региони, както и преди — заявка Сливен→ЦО не влиза в clientOrders.
       Заковано, за да се види, ако някой разшири заявката в loadClientOrders(). */
    const h = env(U_CO_ACC);
    h.db.client.push(N_FOR_CO);
    guard('loadClientOrders() за регионален ЦО', () => h.w.loadClientOrders());
    await ticks();
    ok('регионален ЦО: таблицата е непокътната — заявка към ЦО извън региона НЕ е в нея',
      !(h.w.clientOrders || []).some(x => x.id === 'n-sli-co'));
  }

  section('2б. Логистичен склад — само своят склад');
  {
    const h = env(U_WH);
    const { w } = h;
    ok('assignedStores() за склада е null (глобален) — затова е нужен отделен клон',
      w.assignedStores() === null, JSON.stringify(w.assignedStores()));
    ok('изпълнителят е ["' + WH + '"]', JSON.stringify(w.coMyFulfillerNames()) === '["' + WH + '"]');
    await cycle(h);
    h.db.client.push(N_FOR_WH, N_OTHER_WH, N_FOR_CO);
    await cycle(h);
    ok('обявена е само заявката към този склад',
      JSON.stringify(newForMe(w)) === '["n-shu-wh"]', JSON.stringify(newForMe(w)));
  }
  {
    /* Глобален профил без изпълнителска роля не пита клиентските изобщо */
    const ADMIN_ELSE = { email: 'x@temax.bg', display_name: 'X', role: 'admin', store_name: 'Някъде', assigned_stores: [] };
    const h = env(ADMIN_ELSE);
    ok('глобален профил извън ЦО/склад не изпълнява нищо', h.w.coMyFulfillerNames().length === 0);
    await cycle(h);
    ok('и НЕ праща заявка към client_orders от звънеца',
      !h.calls.get.some(u => /\/client_orders/.test(u) && /select=id/.test(u)));
  }

  /* ══════════ 3. Toast ══════════ */
  section('3. Toast — казва какво е дошло и кликът отваря заявката');
  {
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    h.db.client.push(N_FOR_TROYAN);
    await cycle(h);
    const t = doc.getElementById('co-toast');
    if (ok('кликаемото известие е показано', !!t && t.style.display === 'block')) {
      ok('съдържа номера на заявката', t.textContent.indexOf('Монтана-0007') >= 0, t.textContent);
      ok('съдържа клиента', t.textContent.indexOf('КАРТРАНС ЕООД') >= 0, t.textContent);
      ok('съдържа от кой обект', t.textContent.indexOf('от Монтана') >= 0, t.textContent);
      ok('започва с „🔔 Нова заявка"', t.textContent.indexOf('🔔 Нова заявка') === 0, t.textContent);
      t.onclick();
      ok('кликът отваря модала с пълните данни', !!doc.getElementById('cod-ov'));
      ok('на правилната заявка', (doc.getElementById('cod-ov') || {}).textContent &&
        doc.getElementById('cod-ov').textContent.indexOf('Монтана-0007') >= 0);
    }
  }
  {
    /* >1 нови — бройка + първата */
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    const N2 = order({ id: 'n-mon-tro2', in_num: 'Монтана-0008', store_name: 'Монтана', fulfiller: 'Троян', customer_name: 'Втори' });
    h.db.client.push(N_FOR_TROYAN, N2);
    await cycle(h);
    const t = doc.getElementById('co-toast');
    ok('при 2 нови пише бройката', !!t && t.textContent.indexOf('2 нови заявки') >= 0, t && t.textContent);
    ok('и подробности за първата', !!t && t.textContent.indexOf('първата:') >= 0, t && t.textContent);
  }
  {
    /* Модалът се отваря и когато заявката НЕ е в заредения clientOrders */
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    h.db.client.push(N_FOR_TROYAN);
    await cycle(h);
    w.clientOrders = [];            /* сякаш списъкът не я съдържа */
    const t = doc.getElementById('co-toast');
    if (t) t.onclick();
    ok('модалът се отваря и без заявката в clientOrders (от _coNotifyRows)',
      !!doc.getElementById('cod-ov'));
  }

  /* ══════════ 4. Картата в банера ══════════ */
  section('4. Карта „N нови заявки за изпълнение" в банера');
  {
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    h.db.client.push(N_FOR_TROYAN);
    await cycle(h);
    const card = doc.getElementById('co-new-card');
    if (ok('картата се появява', !!card)) {
      ok('казва „1 нова заявка за изпълнение"', card.textContent.indexOf('1 нова заявка за изпълнение') >= 0, card.textContent);
      ok('банерът е видим', doc.getElementById('notif-banner').style.display === 'block');
      const view = btn(card, 'Виж');
      if (ok('има бутон „Виж →"', !!view)) {
        realClick(w, view, 'Виж →');
        ok('„Виж →" включва филтъра „Изчаква"', w.orderFilter === 'pending', w.orderFilter);
        const pb = [].slice.call(doc.querySelectorAll('#co-filters .filter-btn'))
          .find(b => /filterOrders\('pending'/.test(b.getAttribute('onclick') || ''));
        ok('и бутонът „Изчаква" е активен', !!pb && pb.classList.contains('active'));
      }
    }
  }
  {
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    h.db.client.push(N_FOR_TROYAN);
    await cycle(h);
    const x = doc.querySelector('#co-new-card .notif-close');
    if (ok('картата има ✕', !!x)) {
      realClick(w, x, '✕');
      ok('✕ маха картата', !doc.getElementById('co-new-card'));
      ok('и изчиства списъка нови', newForMe(w).length === 0);
    }
  }
  {
    /* Стои, докато статусът не се смени */
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    h.db.client.push(N_FOR_TROYAN);
    await cycle(h);
    ok('картата е там преди смяната', !!doc.getElementById('co-new-card'));
    w.clientOrders = [Object.assign({}, N_FOR_TROYAN, { status: 'sent', _status: 'sent', _isFulfiller: true })];
    w.updateBadges();
    ok('след смяна на статуса картата изчезва', !doc.getElementById('co-new-card'));
  }

  /* ══════════ 5. Баджът ══════════ */
  section('5. Баджът на таба — просрочени/днешни + чакащи за мен');
  {
    const h = env(U_TROYAN);
    const { w, doc } = h;
    const mk = (id, over) => Object.assign(order({ id, in_num: id }), over);
    w.clientOrders = [
      mk('a', { store_name: 'Троян',   fulfiller: 'Монтана', delivery: dayOffset(-2) }),   /* просрочена, не е за мен → 1 */
      mk('b', { store_name: 'Монтана', fulfiller: 'Троян',   delivery: dayOffset(10) }),   /* чакаща за мен → 1 */
      mk('c', { store_name: 'Троян',   fulfiller: 'Монтана', delivery: dayOffset(10) }),   /* чакаща, НЕ за мен → 0 */
      mk('d', { store_name: 'Монтана', fulfiller: 'Троян',   delivery: dayOffset(-3) }),   /* просрочена И за мен → брои се ВЕДНЪЖ */
      mk('e', { store_name: 'Монтана', fulfiller: 'Троян',   delivery: dayOffset(10), status: 'done' }), /* за мен, но изпълнена → 0 */
      mk('f', { store_name: 'Троян',   fulfiller: 'Троян',   delivery: dayOffset(10) })    /* своя → 0 */
    ];
    const mine = w.coMyFulfillerNames();
    w.clientOrders.forEach(o => { o._status = w.calcStatus(o.delivery, o.status); o._isFulfiller = w.coIsMineToFulfill(o, mine); });
    guard('updateBadges() не хвърля', () => w.updateBadges());
    const b = doc.getElementById('badge-client');
    if (ok('баджът съществува (създава се в таба)', !!b)) {
      ok('е вътре в таба „Клиентски"', !!b.closest && b.closest('#tab-client') !== null);
      ok('брои 3 = 1 просрочена + 1 чакаща за мен + 1 просрочена-и-за-мен', b.textContent === '3', b.textContent);
      ok('видим е', b.style.display === 'block');
    }
    w.clientOrders = [];
    w.updateBadges();
    ok('при 0 е скрит (display:none), не изтрит', !!doc.getElementById('badge-client') &&
      doc.getElementById('badge-client').style.display === 'none');
  }

  /* ══════════ 6. Мрежов срив ══════════ */
  section('6. Мрежов срив — _seenIds не се нулира и няма фалшива тревога');
  {
    const h = env(U_TROYAN);
    const { w, doc } = h;
    await cycle(h);
    const before = seenC(w);
    ok('базата е заредена', before.length === 1, JSON.stringify(before));
    h.state.failClient = true;
    await cycle(h);
    ok('при срив на client_orders клиентските id-та ОСТАВАТ в _seenIds',
      JSON.stringify(seenC(w)) === JSON.stringify(before), JSON.stringify(seenC(w)));
    h.state.failClient = false;
    await cycle(h);
    ok('след възстановяване — нищо не е обявено за ново', newForMe(w).length === 0, JSON.stringify(newForMe(w)));
    ok('и няма известие', !doc.getElementById('co-toast') || doc.getElementById('co-toast').style.display !== 'block');
    ok('и НЯМА общо „нови заявки!" — фалшивата тревога на стария код',
      falseAlarm(h).length === 0, JSON.stringify(falseAlarm(h)));
  }
  {
    /* Срив и на двата източника → _seenIds изобщо не мърда */
    const h = env(U_TROYAN);
    const { w } = h;
    await cycle(h);
    const snap = JSON.stringify(Object.keys(w._seenIds).sort());
    h.state.failClient = true; h.state.failTransport = true;
    await cycle(h);
    ok('срив на двата — _seenIds е непокътнат', JSON.stringify(Object.keys(w._seenIds).sort()) === snap);
  }
  {
    /* Срив точно в ПЪРВИЯ цикъл на клиентските — следващият не бива да обяви всичко */
    const h = env(U_TROYAN);
    const { w } = h;
    h.state.failClient = true;
    await cycle(h);
    h.state.failClient = false;
    await cycle(h);
    ok('срив в първия цикъл → вторият е тих базов, не „всичко е ново"', newForMe(w).length === 0, JSON.stringify(newForMe(w)));
    ok('и без общо „нови заявки!" за цялата таблица',
      falseAlarm(h).length === 0, JSON.stringify(falseAlarm(h)));
    h.db.client.push(N_FOR_TROYAN);
    await cycle(h);
    ok('и после истински новата пак се хваща', JSON.stringify(newForMe(w)) === '["n-mon-tro"]', JSON.stringify(newForMe(w)));
  }

  /* ══════════ 7. Push ══════════ */
  section('7. Push към изпълнителя при нова заявка');
  {
    const h = env(U_TROYAN);
    const { w } = h;
    const rec = { stores: [], role: [], all: 0 };
    w.pushToStores = (s, t, m) => { rec.stores.push({ s, t, m }); return Promise.resolve({ ok: true }); };
    w.pushToRole   = (r, t, m) => { rec.role.push({ r, t, m }); return Promise.resolve({ ok: true }); };
    w.pushToAll    = () => { rec.all++; return Promise.resolve({ ok: true }); };

    await w.pushNewClientOrder({ in_num: 'Монтана-0007', store_name: 'Монтана', fulfiller: 'Троян', customer_name: 'КАРТРАНС ЕООД' });
    ok('магазин → pushToStores([fulfiller])', rec.stores.length === 1 && JSON.stringify(rec.stores[0].s) === '["Троян"]',
      JSON.stringify(rec.stores));
    ok('заглавието носи номера', rec.stores[0] && rec.stores[0].t.indexOf('Монтана-0007') >= 0);
    ok('текстът носи клиента и обекта', rec.stores[0] && rec.stores[0].m.indexOf('КАРТРАНС ЕООД') >= 0 &&
      rec.stores[0].m.indexOf('от Монтана') >= 0, rec.stores[0] && rec.stores[0].m);

    await w.pushNewClientOrder({ in_num: 'Сливен-0010', store_name: 'Сливен', fulfiller: CO, customer_name: 'X' });
    ok('ЦО → pushToRole("supply")', rec.role.length === 1 && rec.role[0].r === 'supply', JSON.stringify(rec.role));

    await w.pushNewClientOrder({ in_num: 'Шумен-0050', store_name: 'Шумен', fulfiller: WH, customer_name: 'X' });
    ok('склад → pushToStores([склада])', rec.stores.length === 2 && rec.stores[1].s[0] === WH);

    const n0 = rec.stores.length + rec.role.length;
    await w.pushNewClientOrder({ in_num: 'Троян-0241', store_name: 'Троян', fulfiller: 'Троян' });
    ok('своя заявка → НИКАКЪВ push', rec.stores.length + rec.role.length === n0);
    const r = await w.pushNewClientOrder({ in_num: 'X', store_name: 'Троян', fulfiller: '' });
    ok('празен изпълнител → никакъв push', rec.stores.length + rec.role.length === n0);
    ok('и НЕ пада към pushToAll', rec.all === 0, String(rec.all));
    ok('връща ok:false с причина', r && r.ok === false);
  }
  {
    /* Интеграция — истински submitClientOrder вика push-а */
    const h = env(U_TROYAN, { client: [] });
    const { w, doc } = h;
    const rec = [];
    w.pushToStores = (s) => { rec.push(s); return Promise.resolve({ ok: true }); };
    w.pushToRole = () => Promise.resolve({ ok: true });
    w.pushToAll = () => { rec.push('ALL'); return Promise.resolve({ ok: true }); };
    w.openClientModal();
    doc.getElementById('c-name').value = 'КАРТРАНС ЕООД';
    doc.getElementById('c-phone').value = '0888111222';
    doc.querySelector('#c-items .item-product').value = 'ПАРКЕТ';
    doc.querySelector('#c-items .item-qty').value = '1';
    const sel = doc.getElementById('c-fulfiller');
    sel.innerHTML = '<option value="Монтана">Монтана</option>';
    sel.value = 'Монтана';
    realClick(w, btnExact(doc.getElementById('client-modal'), '✓ Запази заявката'), 'Запази');
    await ticks(); await ticks();
    ok('записът минава', h.calls.post.some(p => /client_orders/.test(p.url)));
    ok('submitClientOrder праща push към изпълнителя Монтана', rec.length === 1 && JSON.stringify(rec[0]) === '["Монтана"]',
      JSON.stringify(rec));
    ok('и никога към всички', rec.indexOf('ALL') < 0);
  }

  report();
})();
