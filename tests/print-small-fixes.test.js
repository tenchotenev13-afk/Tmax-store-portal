/* Две дребни поправки на печата (12.11.2026, от проверките на живо 11–12.11):

   1) Трансфери — печатът на трансфер (renderTransferPrint): клетките на
      таблицата с товарите (# / Вид / Брой / Краен получател / Прехвърляне
      през / Връзки / Забележка) пренасят дълги низове без интервали
      (`.tf-cargo td{overflow-wrap:anywhere}`). Реален случай Козлодуй-0015:
      „80485351/80485352/80485974/…" в „Забележка" излизаше от таблицата и се
      режеше. Шрифтът и ширините на колоните — непроменени; историята под
      таблицата — не е пипана.
   2) Клиентски заявки — бланката (renderPrint): датата горе под „Заявка №"
      е дд.мм.гггг (fmtDate) и в двете копия; без дата — празно, без
      „undefined" / „—".

   Бланките се отварят през истинските бутони: „🖨 Печат" в реда на
   трансфера и „🖨 Бланка" в реда на заявката (loadPrint).

   Мутационна проверка (12.11.2026, всяка поотделно):
     1. махнато `.tf-cargo td{overflow-wrap:anywhere}`        → пада 1)
     2. върнат esc(o.date||'') на бланката                    → пада 2)
     3. правилото само на „Забележка" (td:nth-child(7))       → пада 1) „Връзки"
     4. без проверката за празна дата (esc(fmtDate(o.date)))  → пада 2) „—"
   Всички събарят теста.

   Пускане:  node tests/print-small-fixes.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, realClick, ok, guard, section, report, ticks, dayOffset, tsOffset } = H;

const btnByText = (root, txt) => Array.from(root.querySelectorAll('button')).filter(b => b.textContent.indexOf(txt) >= 0);

/* ─────────── Трансфер ─────────── */
const NOTE = '80485351/80485352/80485974/80485975/80486011/80486017';
const LINK_CO = 'co-1';
const TR = { id: 'k1', transfer_num: 'Козлодуй-0015', from_store: 'Козлодуй', mode: 'bus', plate_no: null,
             depart_date: '2026-11-12', depart_time: '07:00', driver: 'Георги', stops: ['Враца'], end_store: 'Монтана',
             status: 'planned', created_at: '2026-11-11T08:00:00Z', created_by: 'Склад Козлодуй' };
const CARGO = [
  { id: 'c1', transfer_id: 'k1', position: 1, kind: 'pallet', qty: 1, recipient_store: 'Монтана',
    transfer_points: ['Враца'], note: NOTE, client_order_ids: [LINK_CO], claim_numbers: ['804486015/80486011/80486017'] },
  { id: 'c2', transfer_id: 'k1', position: 2, kind: 'carton', qty: 2, recipient_store: 'Враца', transfer_points: [], note: 'кратка' }
];
function tfEnv() {
  return boot({
    modules: ['stock-differences.js', 'transfers.js'],
    user: { id: 'u1', email: 'kozloduy@temax.bg', display_name: 'Склад Козлодуй', role: 'manager', store_name: 'Козлодуй' },
    data: {
      users: ['Козлодуй', 'Враца', 'Монтана'].map(s => ({ store_name: s })),
      transfers: [TR], transfer_cargo: CARGO, transfer_cargo_events: [],
      client_orders: [{ id: LINK_CO, in_num: 'Козлодуй-80485351/80485352' }],
      transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
}

/* ─────────── Клиентска заявка ─────────── */
function order(id, extra) {
  return Object.assign({
    id, in_num: 'Троян-' + id, store_name: 'Троян', fulfiller: 'Габрово',
    status: 'pending', date: '2026-11-11', hour: '10:00',
    customer_name: 'Иван Петров', phone: '0888111222', bon: 'Б-1', agent: 'Мария',
    product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 5, unit: 'кв.м' }],
    delivery: '2026-11-20', delivery_reason: 'склад Габрово', note: '', created_at: tsOffset(-1),
    co_eta: null, co_note: null, paid_transport: false, transport_id: null, group_id: null
  }, extra || {});
}
const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };
function coEnv(orders) {
  const h = boot({ modules: ['transport.js', 'client-orders.js', 'notifications.js'], user: ADMIN,
    data: { client_orders: orders, transport_orders: [], stores: [] } });
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
function openCoPrint(h, id) {
  const row = h.doc.getElementById('co-row-' + id);
  const b = row && btnByText(row, 'Бланка')[0];
  ok('бутонът „🖨 Бланка" е в реда ' + id, !!b);
  if (b) guard('клик „🖨 Бланка"', () => bubbleClick(h.w, b));
  return Array.from(h.doc.querySelectorAll('#mod-print .cp-card'));
}
/* Датата горе: третият ред в блока „Заявка №". */
function topDate(card) {
  const lbl = Array.from(card.querySelectorAll('div')).find(d => d.textContent === 'Заявка №');
  const box = lbl && lbl.parentNode;
  return box ? box.children[2].textContent : null;
}

(async function () {

  section('1) Трансфер — клетките на таблицата с товарите пренасят дълги низове');
  {
    const h = tfEnv();
    h.w.showModule('transfers'); await ticks(); await ticks();
    const row = h.doc.querySelector('#trf-table tbody tr[data-id="k1"]');
    const b = row ? btnByText(row, '🖨 Печат') : [];
    if (ok('бутонът „🖨 Печат" е в реда', b.length === 1)) {
      realClick(h.w, b[0]); await ticks(); await ticks();
      const tbl = h.doc.querySelector('#mod-print table.tf-cargo');
      if (ok('таблицата с товарите е .tf-tbl.tf-cargo', !!tbl && tbl.classList.contains('tf-tbl'))) {
        const ths = Array.from(tbl.querySelectorAll('thead th')).map(t => t.textContent);
        ok('колоните са същите 7', ths.join('|') === '#|Вид|Брой|Краен получател|Прехвърляне през|Връзки|Забележка', ths.join('|'));
        const r1 = tbl.querySelector('tbody tr');
        const tds = Array.from(r1.children);
        ok('„Забележка" носи дългия низ', tds[6].textContent === NOTE, tds[6].textContent);
        ok('„Връзки" носят дълги номера без интервали (КЗ и рекламация)',
          /80485351\/80485352/.test(tds[5].textContent) && /804486015\/80486011/.test(tds[5].textContent), tds[5].textContent);
        const wrapOf = td => h.w.getComputedStyle(td).overflowWrap;
        const bad = [];
        Array.from(tbl.querySelectorAll('tbody td')).forEach((td, i) => { if (wrapOf(td) !== 'anywhere') bad.push(i % 7 + 1); });
        ok('ВСЯКА клетка на таблицата е overflow-wrap:anywhere', bad.length === 0, 'колони без правилото: ' + bad.join(','));
        ok('„Забележка" (7) — пренася', wrapOf(tds[6]) === 'anywhere');
        ok('„Връзки" (6) — пренася', wrapOf(tds[5]) === 'anywhere');
        ok('„Прехвърляне през" (5) — пренася', wrapOf(tds[4]) === 'anywhere');
        const st = h.w.getComputedStyle(tds[6]);
        /* jsdom смята pt в px: 8.5pt = 11.3333px. */
        ok('шрифтът е непроменен (8.5pt)', /^11\.333\d*px$/.test(st.fontSize), st.fontSize);
        ok('table-layout е fixed', h.w.getComputedStyle(tbl).tableLayout === 'fixed');
        const cols = Array.from(tbl.querySelectorAll('col')).map(c => c.style.width).join(',');
        ok('ширините на колоните — непроменени (190 мм)', cols === '7mm,16mm,11mm,34mm,40mm,48mm,34mm', cols);
      }
    }
    h.close();
  }

  section('2) Клиентска заявка — датата горе е дд.мм.гггг и в двете копия');
  {
    const h = coEnv([order('1'), order('2', { date: null })]);
    const cards = openCoPrint(h, '1');
    ok('две копия', cards.length === 2, cards.length);
    cards.forEach((c, i) => ok('копие ' + (i + 1) + ': датата горе е „11.11.2026"', topDate(c) === '11.11.2026', topDate(c)));
    const html = h.doc.getElementById('mod-print').innerHTML;
    ok('„2026-11-11" не стои никъде в бланката', html.indexOf('2026-11-11') < 0);

    h.w.showModule('client'); guard('renderClientOrders()', () => h.w.renderClientOrders());
    const c2 = openCoPrint(h, '2');
    c2.forEach((c, i) => ok('без дата — копие ' + (i + 1) + ': празно (не „—", не „undefined")', topDate(c) === '', JSON.stringify(topDate(c))));
    const h2 = h.doc.getElementById('mod-print').innerHTML;
    ok('без дата — никъде „undefined" / „null"', !/undefined|>null</.test(h2));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
