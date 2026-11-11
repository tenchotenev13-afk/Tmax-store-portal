/* Бланка на клиентската заявка (renderPrint) — решение 11.11.2026:
   - „★ Срок за доставка" със стойност „до дд.мм.гггг г." и в двете копия;
   - копието на магазина: два подписа — при поръчката (срокът от заявката)
     и при получаването („Получих стоката без забележка.");
   - копието на клиента: един подпис, както досега;
   - без delivery → „__________" без „до", без „undefined" / „—";
   - „ОБЩИ УСЛОВИЯ" — непроменени.
   Бланката се отваря през истинския бутон „🖨 Бланка" от реда (loadPrint).

   node tests/co-print-signature.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, ok, guard, section, report, dayOffset, tsOffset } = H;

function order(id, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово',
    status: 'pending', date: dayOffset(-3), hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222', bon: 'Б-1', agent: 'Мария',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: '2026-11-20', delivery_reason: 'склад Габрово', note: '', created_at: tsOffset(-3),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null
  }, extra || {});
}

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };
const OBSHTI = 'ОБЩИ УСЛОВИЯ: Поръчката е валидна само след цялостно заплащане или капариране. Срокът за доставка е посочен по-горе.';

function env(orders) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN,
    data: { client_orders: orders, transport_orders: [], stores: [] }
  });
  const w = h.w;
  w.transportOrders = [];
  w.clientOrders = JSON.parse(JSON.stringify(orders));
  w.clientOrders.forEach(o => {
    o._status = w.calcStatus(o.delivery, o.status);
    o._days = w.calcElapsed(o.created_at, o.date);
    o._isFulfiller = w.coIsMineToFulfill(o);
  });
  w.orderFilter = 'all';
  guard('renderClientOrders()', () => w.renderClientOrders());
  return h;
}

/* Истинският бутон „🖨 Бланка" в реда → loadPrint → #mod-print */
function openPrint(h, id) {
  const { w, doc } = h;
  const row = doc.getElementById('co-row-' + id);
  const b = row && Array.prototype.find.call(row.querySelectorAll('button'), x => /Бланка/.test(x.textContent));
  ok('бутонът „🖨 Бланка" е в реда ' + id, !!b);
  if (b) guard('клик „🖨 Бланка"', () => bubbleClick(w, b));
  const cards = Array.prototype.slice.call(doc.querySelectorAll('#mod-print .cp-card'));
  ok('бланката е с две копия', cards.length === 2, cards.length);
  return cards;
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ');
const count = (s, sub) => s.split(sub).length - 1;
/* Блоковете за подпис: заглавие + текст, по реда в картата */
/* Блок за подпис = родителят на червеното каре с текста:
   [0] заглавие, [1] текст, [2] „Подпис / Дата". */
function signBoxes(card) {
  return Array.prototype.map.call(card.querySelectorAll('div[style*="border-left:3px solid #dc2626"]'), d => d.parentElement);
}
function signs(card) {
  return signBoxes(card).map(b => ({ title: txt(b.children[0]).trim(), text: txt(b.children[1]).trim(),
    tail: txt(b.children[2]).trim() }));
}

(async function run() {

  section('1. С дата на доставка — „Срок за доставка: до 20.11.2026 г." в двете копия');
  {
    const h = env([order('a1')]);
    const [shop, cust] = openPrint(h, 'a1');
    [['магазина', shop], ['клиента', cust]].forEach(([n, c]) => {
      const t = txt(c);
      ok('копие на ' + n + ': „★ Срок за доставка"', t.indexOf('★ Срок за доставка') >= 0);
      ok('копие на ' + n + ': няма „Дата на доставка"', t.indexOf('Дата на доставка') < 0);
      ok('копие на ' + n + ': „до 20.11.2026 г."', t.indexOf('★ Срок за доставкадо 20.11.2026 г.') >= 0, t.slice(t.indexOf('★'), t.indexOf('★') + 60));
      ok('копие на ' + n + ': delivery_reason под срока', t.indexOf('до 20.11.2026 г.склад Габрово') >= 0);
      ok('копие на ' + n + ': ОБЩИ УСЛОВИЯ непроменени', t.indexOf(OBSHTI) >= 0);
      ok('копие на ' + n + ': без „undefined"', t.indexOf('undefined') < 0);
    });

    const ss = signs(shop);
    ok('копие на магазина: два подписа', ss.length === 2, JSON.stringify(ss));
    ok('подпис 1: „Подпис на клиента при поръчката"', ss[0] && ss[0].title === 'Подпис на клиента при поръчката', ss[0] && ss[0].title);
    ok('подпис 1: точният текст със срока от заявката',
      ss[0] && ss[0].text === 'Запознат/а съм, че срокът за доставка е до 20.11.2026 г. Ако стоката пристигне по-рано, ще бъда уведомен/а по телефона.', ss[0] && ss[0].text);
    ok('подпис 2: „Подпис на клиента при получаването"', ss[1] && ss[1].title === 'Подпис на клиента при получаването', ss[1] && ss[1].title);
    ok('подпис 2: „Получих стоката без забележка."', ss[1] && ss[1].text === 'Получих стоката без забележка.', ss[1] && ss[1].text);
    const st = txt(shop);
    ok('копие на магазина: „Получих стоката" само веднъж', count(st, 'Получих стоката') === 1, count(st, 'Получих стоката'));
    ok('копие на магазина: няма „Запознат/а съм с условията."', st.indexOf('Запознат/а съм с условията') < 0);
    ok('копие на магазина: два реда „Подпис:" и два „Дата:"', count(st, 'Подпис: ') === 2 && count(st, 'Дата: __________ г.') === 2);
    ok('всеки подпис в магазина има свой „Подпис" + „Дата"',
      ss.length === 2 && ss.every(s => /^Подпис: _+ ?Дата: _+ г\.$/.test(s.tail)), JSON.stringify(ss.map(s => s.tail)));

    /* Решение 11.11.2026: двата подписа — един до друг в ЕДНА редица */
    const boxes = signBoxes(shop);
    const row = shop.querySelector('.cp-sign-row');
    ok('копие на магазина: има редица .cp-sign-row', !!row);
    ok('редицата е display:flex (колони, не един под друг)', !!row && /display:\s*flex/.test(row.getAttribute('style') || ''));
    ok('точно 2 колони в редицата', !!row && row.children.length === 2, row && row.children.length);
    ok('колоните са равни (flex:1)', !!row && Array.prototype.every.call(row.children, c => /flex:\s*1/.test(c.getAttribute('style') || '')));
    ok('подписът при поръчката — в лявата колона', !!row && boxes[0] && row.children[0].contains(boxes[0]));
    ok('подписът при получаването — в дясната колона', !!row && boxes[1] && row.children[1] && row.children[1].contains(boxes[1]));
    ok('и двата подписа са в ЕДНА редица', !!row && boxes.length === 2 && boxes.every(b => row.contains(b)));
    ok('редът „Подпис / Дата" слиза най-долу в колоната (линиите на една височина)',
      boxes.length === 2 && boxes.every(b => /margin-top:\s*auto/.test(b.children[2].getAttribute('style') || '')));
    ok('шрифтът на текста — 10px, както досега', boxes.every(b => /font-size:10px/.test(b.children[1].getAttribute('style') || '')));

    const cs = signs(cust);
    ok('копие на клиента: един подпис', cs.length === 1, JSON.stringify(cs));
    ok('копие на клиента: „Подпис на клиента" / „Получих стоката без забележка."',
      cs[0] && cs[0].title === 'Подпис на клиента' && cs[0].text === 'Получих стоката без забележка.', JSON.stringify(cs[0]));
    ok('копие на клиента: без подпис при поръчката', txt(cust).indexOf('при поръчката') < 0 && txt(cust).indexOf('Запознат') < 0);
    ok('копие на клиента: без редица от подписи (както досега)', !cust.querySelector('.cp-sign-row'));
    const cb = signBoxes(cust)[0];
    ok('копие на клиента: подписът е по старому (без flex колона)',
      !!cb && !/flex-direction/.test(cb.getAttribute('style') || '') && !/margin-top:\s*auto/.test(cb.children[2].getAttribute('style') || ''));
  }

  section('2. Датата идва от заявката (друга дата → друг текст)');
  {
    const h = env([order('b1', { delivery: '2026-12-03' })]);
    const [shop, cust] = openPrint(h, 'b1');
    ok('срок в копието на магазина: до 03.12.2026 г.', txt(shop).indexOf('★ Срок за доставкадо 03.12.2026 г.') >= 0);
    ok('срок в копието на клиента: до 03.12.2026 г.', txt(cust).indexOf('★ Срок за доставкадо 03.12.2026 г.') >= 0);
    const ss = signs(shop);
    ok('подпис при поръчката с 03.12.2026', ss[0] && ss[0].text.indexOf('срокът за доставка е до 03.12.2026 г. Ако') >= 0, ss[0] && ss[0].text);
    ok('няма остатък от 20.11.2026', txt(shop).indexOf('20.11.2026') < 0);
  }

  section('3. Без дата на доставка — празно място, без „до", без „undefined"/„—"');
  {
    const h = env([order('c1', { delivery: null, delivery_reason: null })]);
    const [shop, cust] = openPrint(h, 'c1');
    [['магазина', shop], ['клиента', cust]].forEach(([n, c]) => {
      const t = txt(c);
      ok('копие на ' + n + ': „★ Срок за доставка__________"', t.indexOf('★ Срок за доставка__________') >= 0, t.slice(t.indexOf('★'), t.indexOf('★') + 40));
      ok('копие на ' + n + ': няма „до __________"', t.indexOf('до __________') < 0);
      ok('копие на ' + n + ': без „undefined"/„null"', t.indexOf('undefined') < 0 && t.indexOf('null') < 0);
      ok('копие на ' + n + ': срокът не е „—"', t.indexOf('★ Срок за доставка—') < 0);
    });
    const ss = signs(shop);
    ok('подпис при поръчката: „срокът за доставка е __________."',
      ss[0] && ss[0].text === 'Запознат/а съм, че срокът за доставка е __________. Ако стоката пристигне по-рано, ще бъда уведомен/а по телефона.', ss[0] && ss[0].text);
    ok('и без дата — два подписа в магазина, един при клиента', ss.length === 2 && signs(cust).length === 1);
  }

  report();
})();
