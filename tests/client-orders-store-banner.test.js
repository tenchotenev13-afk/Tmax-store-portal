/* Клиентски заявки — банерът на обекта над таблицата (09.11.2026, по модела
   на Стока на път / Товарни листи / Трансфери).

   ПОВОД: 09.11 Севлиево вижда бадж 9 на таба, а в таба няма обяснение — и
   деветте са pending с fulfiller='Севлиево' от други обекти.

   ТВЪРДЕНИЯТА (реалният ред от index.html, loadClientOrders → updateBadges):
   1. Само „за мен": 9 заявки с разбъркани дати → броят и най-старата дата;
      баджът = 9.
   2. Само просрочени / днешни (свои заявки) → „⏰ 2 … , 1 — с доставка днес".
   3. Смес с припокриване (за мен И просрочена): банерът и баджът дават едно
      число — сборът на числата в банера = баджа.
   4. 0 → без банер.
   5. admin, контролинг, логистичен склад → без банер (баджът им може да е > 0).
   6. Етикетът в банера = текста на бутона „📤 Изпратена".
   7. Истински клик „📤 Изпратена" → PATCH → банерът и баджът падат заедно.

   МУТАЦИИ (ръчно, 09.11.2026 — всяка пада): M1 датата от най-новата;
   M2 разбивката брои припокриването два пъти; M3 банерът с различен предикат
   от баджа; M4 банерът и на глобален профил.

   Пускане:  node tests/client-orders-store-banner.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, dayOffset, tsOffset } = H;

const ME = 'Севлиево';
const STORE = { email: 'sevlievo@temax.bg', display_name: 'Управител Севлиево', role: 'manager', store_name: ME, assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const ACC = { email: 'c@temax.bg', display_name: 'Контролинг', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };
const WH = { email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: 'Логистичен склад Търговище', assigned_stores: [] };

let seq = 0;
function ord(o) {
  seq++;
  const d = o.days != null ? o.days : -1;
  delete o.days;
  return Object.assign({
    id: 'o' + seq, in_num: String(9000 + seq), store_name: 'Габрово', fulfiller: ME, status: 'pending',
    date: dayOffset(d), hour: '10:00', customer_name: 'Клиент ' + seq, phone: '0888000' + seq,
    product: 'АРТИКУЛ', sap: '111', qty: 1, unit: 'бр.', items: [{ product: 'АРТИКУЛ', sap: '111', qty: 1, unit: 'бр.' }],
    delivery: dayOffset(12), note: '', created_at: tsOffset(d), co_eta: null, co_note: null,
    paid_transport: false, transport_id: null, awaiting_stock: false
  }, o);
}
const ddmm = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);

function env(user, orders) {
  let ref = null;
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: user, confirm: true,
    data: {
      client_orders: function () {
        const rows = orders.map(r => Object.assign({}, r));
        if (ref) ref.calls.patch.filter(p => p.table === 'client_orders').forEach(p => {
          const m = /id=eq\.([^&]*)/.exec(p.url);
          const row = m && rows.find(r => String(r.id) === decodeURIComponent(m[1]));
          if (row) Object.assign(row, p.body);
        });
        return rows;
      },
      transport_orders: [], stores: [], order_restrictions: []
    }
  });
  ref = h;
  h.w.transportOrders = [];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 10); i++) await ticks(); }
async function open(user, orders) {
  const h = env(user, orders);
  h.w.loadClientOrders();
  await settle();
  return h;
}
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
const bannerEl = h => h.doc.getElementById('co-wait-note');
/* Частите на банера са отделни <div> — текстът е частите, разделени с интервал. */
const banner = h => { const b = bannerEl(h); if (!b) return null; return { textContent: Array.from(b.children).map(txt).join(' '), el: b, querySelectorAll: s => b.querySelectorAll(s), compareDocumentPosition: n => b.compareDocumentPosition(n) }; };
const badgeN = h => { const b = h.w.coTabBadgeEl(); return b && b.style.display !== 'none' ? b.textContent : '0'; };
/* Сборът на всички числа в <b> на банера — трябва да е броят на баджа. */
const bannerSum = h => Array.from((banner(h) || { querySelectorAll: () => [] }).querySelectorAll('b')).reduce((a, b) => a + (parseInt(b.textContent, 10) || 0), 0);

(async function () {

  section('1. Само „за мен": Севлиево — 9 заявки, най-старата е по средата');
  {
    seq = 0;
    const days = [-1, -2, 0, -3, -6, -2, -1, 0, -3];   /* -6 = най-старата, пета */
    const orders = days.map((d, i) => ord({ days: d, store_name: ['Габрово', 'Троян', 'Кърджали'][i % 3] }));
    const h = await open(STORE, orders);
    const EXP = '📋 9 заявки от други обекти чакат вие да ги изпълните (най-старата от ' + ddmm(dayOffset(-6)) + '). ' +
      'Когато изпратите стоката, сменете статуса на 📤 Изпратена.';
    ok('точният текст', txt(banner(h)) === EXP, txt(banner(h)));
    ok('баджът е 9', badgeN(h) === '9', badgeN(h));
    ok('сборът в банера = баджа', String(bannerSum(h)) === badgeN(h), bannerSum(h) + ' / ' + badgeN(h));
    ok('банерът е над „⚠️ … SAP"', !!banner(h) && (banner(h).compareDocumentPosition(h.doc.getElementById('co-sap-banner')) & 4) !== 0);

    section('6. Етикетът в банера = бутона');
    const sentBtns = Array.from(h.doc.querySelectorAll('#co-body button')).filter(b => /setClientStatus\(this\.dataset\.id,'sent'\)/.test(b.getAttribute('onclick') || ''));
    ok('9 бутона за „Изпратена"', sentBtns.length === 9, sentBtns.length);
    ok('текстът на бутона = CO_SENT_BTN_LABEL', sentBtns.every(b => txt(b) === h.w.CO_SENT_BTN_LABEL), JSON.stringify(sentBtns.map(txt).slice(0, 2)));
    ok('… и е в банера', txt(banner(h)).indexOf(h.w.CO_SENT_BTN_LABEL) >= 0);
    ok('етикетът идва от statusLabel', h.w.CO_SENT_BTN_LABEL === '📤 ' + h.w.statusLabel('sent'));

    section('7. Истински клик „📤 Изпратена" → банерът и баджът падат заедно');
    realClick(h.w, sentBtns[0]); await settle(14);
    ok('PATCH status=sent', h.calls.patch.some(p => p.table === 'client_orders' && p.body.status === 'sent'), JSON.stringify(h.calls.patch.map(p => p.body)));
    ok('баджът е 8', badgeN(h) === '8', badgeN(h));
    ok('банерът казва 8', /^📋 8 заявки от други обекти/.test(txt(banner(h))), txt(banner(h)));
    ok('сборът в банера = баджа', String(bannerSum(h)) === badgeN(h));
    h.close();
  }

  section('2. Само просрочени / днешни (свои заявки към ЦО)');
  {
    seq = 0;
    const orders = [
      ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(-3) }),
      ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(-1) }),
      ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(0) }),
      ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(5) })   /* не се брои */
    ];
    const h = await open(STORE, orders);
    ok('точният текст', txt(banner(h)) === '⏰ 2 заявки са с изтекла дата на доставка, 1 — с доставка днес.', txt(banner(h)));
    ok('баджът е 3 = сборът', badgeN(h) === '3' && bannerSum(h) === 3, badgeN(h) + ' / ' + bannerSum(h));
    h.close();

    seq = 0;
    const h1 = await open(STORE, [ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(0) })]);
    ok('една днешна — единствено число', txt(banner(h1)) === '⏰ 1 заявка е с доставка днес.', txt(banner(h1)));
    h1.close();
  }

  section('3. Смес с припокриване: за мен И просрочена — веднъж');
  {
    seq = 0;
    const orders = [
      ord({ days: -4, delivery: dayOffset(-2) }),                                  /* за мен + просрочена */
      ord({ days: -1 }),                                                           /* за мен */
      ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(-1) }), /* своя просрочена */
      ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(0) })   /* своя днес */
    ];
    const h = await open(STORE, orders);
    const EXP = '📋 2 заявки от други обекти чакат вие да ги изпълните (най-старата от ' + ddmm(dayOffset(-4)) + '). ' +
      'Когато изпратите стоката, сменете статуса на 📤 Изпратена. ' +
      '⏰ Още 1 заявка е с изтекла дата на доставка, 1 — с доставка днес.';
    ok('точният текст', txt(banner(h)) === EXP, txt(banner(h)));
    ok('баджът е 4', badgeN(h) === '4', badgeN(h));
    ok('сборът в банера = баджа (припокриването е веднъж)', bannerSum(h) === 4, bannerSum(h));
    h.close();
  }

  section('4. Нула → без банер');
  {
    seq = 0;
    const h = await open(STORE, [ord({ status: 'sent' }), ord({ store_name: ME, fulfiller: 'Централен офис', delivery: dayOffset(4) })]);
    ok('баджът е скрит и банер няма', badgeN(h) === '0' && !banner(h), badgeN(h));
    h.close();
  }

  section('5. Глобални профили — без банер, макар баджът да е > 0');
  for (const [name, user, ful] of [['admin', ADMIN, ME], ['контролинг', ACC, ME], ['логистичен склад', WH, WH.store_name]]) {
    seq = 0;
    const h = await open(user, [ord({ fulfiller: ful }), ord({ store_name: 'Троян', fulfiller: 'Централен офис', delivery: dayOffset(-2) })]);
    ok(name + ': баджът е > 0', parseInt(badgeN(h), 10) > 0, badgeN(h));
    ok(name + ': без банер', !banner(h));
    h.close();
  }

  report();
})();
