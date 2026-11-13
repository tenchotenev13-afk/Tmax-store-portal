/* Таб Транспорт — първата колона е денят на ДОСТАВКАТА с часа ѝ (решение Б на
   Тенчо, 13.11.2026, claude/open/13-11-transport-mesec-data-chas.md).

   До 13.11 колоната „Дата · Час" показваше o.date (денят на заявката, сурово
   гггг-мм-дд) с o.hour (часът на ДОСТАВКАТА), а денят на доставката стоеше
   удебелен в „Статус · Доставка". Сега:
   - „Доставка · Час": fmtDate(delivery) + час, под него „заявена дд.мм.гггг"
     и обектът; без delivery — датата на заявката + час и „без дата на доставка";
   - „Статус" не повтаря деня;
   - детайлът: „Заявена дд.мм.гггг"; „Доставка дд.мм.гггг · чч:мм";
   - месечният филтър остава по date (денят на заявката).

   Пускане: node tests/transport-delivery-column.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, ok, guard, section, report, ticks } = H;

const TRANSPORT = [
  { id: 't-a', store_name: 'Кърджали', date: '2026-11-09', hour: '10:00', delivery: '2026-11-14',
    status: 'pending', customer_name: 'Клиент А', phone: '0888', address: 'адрес А', bon: '1',
    items: [{ product: 'ПЛОЧКИ', qty: 1, unit: 'бр.' }], created_at: '2026-11-09T08:00:00Z' },
  { id: 't-b', store_name: 'Троян', date: '2026-11-10', hour: '15:00', delivery: null,
    status: 'pending', customer_name: 'Клиент Б', phone: '0899', address: 'адрес Б', bon: '2',
    items: [{ product: 'ВРАТА', qty: 1, unit: 'бр.' }], created_at: '2026-11-10T08:00:00Z' },
  /* Заявена през октомври, доставка през ноември — месечният филтър е по date. */
  { id: 't-c', store_name: 'Враца', date: '2026-10-30', hour: '09:00', delivery: '2026-11-03',
    status: 'pending', customer_name: 'Клиент В', phone: '0877', address: 'адрес В', bon: '3',
    items: [{ product: 'ПАРКЕТ', qty: 1, unit: 'бр.' }], created_at: '2026-10-30T08:00:00Z' }
];

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: ADMIN,
    data: { transport_orders: TRANSPORT, client_orders: [], stores: [] }
  });
  return h;
}
const row = (h, id) => h.doc.getElementById('tr-row-' + id);
const cell = (h, id, i) => { const r = row(h, id); return r ? r.querySelectorAll('td')[i] || null : null; };
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
/* Ред от детайла по етикет — coDetailRow(label, val): два div-а. */
function detailRow(h, label) {
  const ov = h.doc.getElementById('trd-ov'); if (!ov) return null;
  const r = Array.from(ov.querySelectorAll('div')).find(d => d.children.length === 2 &&
    d.children[0].textContent.trim() === label);
  return r ? r.children[1].textContent.replace(/\s+/g, ' ').trim() : null;
}

(async function run() {
  const h = env();
  h.w.showModule('transport');
  await ticks(10);

  section('1. Заглавия на колоните');
  {
    const th = Array.from(h.doc.querySelectorAll('#mod-transport thead th')).map(x => x.textContent.trim());
    ok('„Доставка · Час" … „Статус"', JSON.stringify(th) === JSON.stringify(['Доставка · Час', 'Клиент', 'Адрес', 'Артикул', 'Статус', 'Действия']), JSON.stringify(th));
  }

  section('2. Първата колона — денят на доставката');
  {
    const a = cell(h, 't-a', 0);
    ok('редът е рендиран (реален loadTransport)', !!a);
    ok('A: „14.11.2026 10:00"', txt(a).indexOf('14.11.2026 10:00') === 0, txt(a));
    ok('A: „заявена 09.11.2026"', txt(a).indexOf('заявена 09.11.2026') >= 0, txt(a));
    ok('A: обектът стои', txt(a).indexOf('Кърджали') >= 0, txt(a));
    ok('A: без суровата дата 2026-11-09', txt(a).indexOf('2026-11-09') < 0, txt(a));
    const b = cell(h, 't-b', 0);
    ok('Б (без delivery): „10.11.2026 15:00"', txt(b).indexOf('10.11.2026 15:00') === 0, txt(b));
    ok('Б: „без дата на доставка" (не е скрито)', txt(b).indexOf('без дата на доставка') >= 0, txt(b));
    ok('Б: няма „заявена"', txt(b).indexOf('заявена') < 0, txt(b));
  }

  section('3. „Статус" не повтаря деня');
  {
    const s = cell(h, 't-a', 4);
    ok('A: в „Статус" няма 14.11.2026', !!s && txt(s).indexOf('14.11.2026') < 0, txt(s));
    ok('A: в „Статус" няма и 09.11.2026', !!s && txt(s).indexOf('09.11.2026') < 0, txt(s));
    const sb = cell(h, 't-b', 4);
    ok('Б: в „Статус" няма „—" от празна доставка', !!sb && txt(sb).indexOf('—') < 0, txt(sb));
  }

  section('4. Детайл — клик по реда');
  {
    guard('клик по първата клетка на A', () => bubbleClick(h.w, cell(h, 't-a', 0)));
    await ticks(4);
    ok('детайлът е отворен', !!h.doc.getElementById('trd-ov'));
    ok('„Заявена 09.11.2026"', detailRow(h, 'Заявена') === '09.11.2026', detailRow(h, 'Заявена'));
    ok('„Доставка 14.11.2026 · 10:00"', detailRow(h, 'Доставка') === '14.11.2026 · 10:00', detailRow(h, 'Доставка'));
    ok('няма стария ред „Дата / Час"', detailRow(h, 'Дата / Час') === null);
    h.w.closeTransportDetail();
    guard('клик по първата клетка на Б', () => bubbleClick(h.w, cell(h, 't-b', 0)));
    await ticks(4);
    ok('Б: „Заявена 10.11.2026"', detailRow(h, 'Заявена') === '10.11.2026', detailRow(h, 'Заявена'));
    ok('Б: „Доставка — · 15:00"', detailRow(h, 'Доставка') === '— · 15:00', detailRow(h, 'Доставка'));
    h.w.closeTransportDetail();
  }

  section('5. Месечният филтър — по деня на заявката (date)');
  {
    const sel = h.doc.getElementById('tr-month');
    const opts = Array.from(sel.options).map(o => o.value);
    ok('месеците са 2026-11 и 2026-10 (по date)', opts.indexOf('2026-11') >= 0 && opts.indexOf('2026-10') >= 0, opts.join(','));
    sel.value = '2026-10';
    h.w.eval(sel.getAttribute('onchange')); /* inline onchange — като realClick за onclick */
    await ticks(2);
    ok('октомври: В (заявена 30.10, доставка 03.11) е вътре', !!row(h, 't-c'));
    ok('октомври: А и Б ги няма', !row(h, 't-a') && !row(h, 't-b'));
    sel.value = '2026-11';
    h.w.eval(sel.getAttribute('onchange')); /* inline onchange — като realClick за onclick */
    await ticks(2);
    ok('ноември: А и Б са вътре, В (заявена през октомври) — не', !!row(h, 't-a') && !!row(h, 't-b') && !row(h, 't-c'));
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
