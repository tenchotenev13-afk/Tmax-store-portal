/* Стока на път → Excel износ: колоната „Посока" е по вида на изпращача
   („От склад" / „От магазин", етап 2 — 03.11.2026), статусът е като на екрана
   (sent → „Изпратена"). Износът е на всички
   активни редове (transitData, без архива) — не следва филтъра на екрана.

   Пускане: node tests/transit-export-labels.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report } = H;

const row = (id, direction, status) => ({
  id, direction, status, store_name: 'Троян', supplier: direction === 'transfer' ? 'Добрич' : 'Склад', purchase_doc: 'D' + id,
  position: '10', doc_date: '2026-09-01', material_code: 'M' + id, material_name: 'Стока ' + id,
  ordered_qty: 1, unit: 'бр.', remaining_qty: 1, transfer_date: null, comment: '', updated_by: '', updated_at: null
});
const DATA = [
  row('1', 'incoming', 'pending'), row('2', 'incoming', 'received'),
  row('3', 'transfer', 'sent'), row('4', 'transfer', 'pending')
];

function env(role) {
  const h = boot({
    modules: ['transit.js'],
    user: { email: role + '@temax.bg', display_name: role, role, store_name: 'Централен офис' },
    data: { goods_transit: DATA }
  });
  const w = h.w;
  const cap = { aoa: null, wrote: 0, confirms: [] };
  w.XLSX = {
    utils: { book_new: () => ({}), aoa_to_sheet: a => { cap.aoa = a; return {}; }, book_append_sheet: () => {} },
    writeFile: () => { cap.wrote++; }
  };
  w.confirm = m => { cap.confirms.push(m); return false; };
  w.transitData = JSON.parse(JSON.stringify(DATA));
  return { h, w, cap };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const ST = 15; /* колоната „Статус" (от 03.11.2026; преди 12) — проверява се долу по заглавието */

(async function run() {
  section('1. посока и статус');
  {
    const { w, cap } = env('admin');
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    const body = cap.aoa ? cap.aoa.slice(1) : [];
    ok('4 реда + заглавен', cap.aoa && cap.aoa.length === 5, cap.aoa && cap.aoa.length);
    ok('„Статус" е колона ' + ST, cap.aoa && cap.aoa[0][ST] === 'Статус', cap.aoa && cap.aoa[0].indexOf('Статус'));
    /* От 03.11.2026 (етап 2) „Посока" е по вида на изпращача, не по direction. */
    ok('посоки: „От склад" / „От магазин"', JSON.stringify(body.map(r => r[0])) === JSON.stringify(['От склад', 'От склад', 'От магазин', 'От магазин']), JSON.stringify(body.map(r => r[0])));
    ok('статуси', JSON.stringify(body.map(r => r[ST])) === JSON.stringify(['Не доставена', 'Прието', 'Изпратена', 'Не доставена']), JSON.stringify(body.map(r => r[ST])));
    ok('20 колони (от 03.11.2026 + ВД, ИД, К-во по ВД)', cap.aoa[0].length === 20 && body.every(r => r.length === 20), cap.aoa[0].length);
  }

  section('1б. ВД, ИД, К-во по ВД; архивът не се изнася');
  {
    const { w, cap } = env('admin');
    w.transitData = [
      Object.assign(row('v', 'incoming', 'pending'), { inbound_delivery: '180441043', outbound_delivery: '80415493', delivery_qty: 7 }),
      Object.assign(row('x', 'incoming', 'pending'), { inbound_delivery: '180000009', archived_at: '2026-11-01T08:00:00Z' })
    ];
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    const head = cap.aoa[0], body = cap.aoa.slice(1);
    const col = n => head.indexOf(n);
    ok('колони ВД, ИД, К-во по ВД', col('ВД') >= 0 && col('ИД') >= 0 && col('К-во по ВД') >= 0, JSON.stringify(head));
    ok('редът носи ВД / ИД / к-во', body[0] && body[0][col('ВД')] === '180441043' && body[0][col('ИД')] === '80415493' && body[0][col('К-во по ВД')] === 7,
      JSON.stringify(body[0]));
    ok('архивираният ред не е в износа', body.length === 1, body.length);
  }

  section('2. outgoing / rejected / непознат статус');
  {
    const { w, cap } = env('admin');
    w.transitData = [row('a', 'outgoing', 'rejected'), row('b', 'incoming', 'странен')];
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    const body = cap.aoa.slice(1);
    ok('outgoing от склад → „От склад" (не по direction)', body[0][0] === 'От склад', body[0][0]);
    ok('rejected → „Неприето"', body[0][ST] === 'Неприето', body[0][ST]);
    ok('непознат статус → самата стойност', body[1][ST] === 'странен', body[1][ST]);
  }

  section('3. филтър на екрана не влиза в износа');
  {
    const { w, cap } = env('admin');
    w.transitFilter = 'received';
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    ok('пак всичките 4 реда', cap.aoa && cap.aoa.length === 5, cap.aoa && cap.aoa.length);
  }

  /* До 03.11.2026 admin получаваше „Да изчистя ли всички записи след
     експорта?". Изчистването е махнато (етап 1 — сверка и архив). */
  section('4. няма въпрос за изчистване — нито за admin, нито за друг');
  {
    const a = env('admin');
    guard('export', () => a.w.exportTransitExcel());
    await wait(1200);
    ok('admin: няма confirm', a.cap.confirms.length === 0, JSON.stringify(a.cap.confirms));
    const m = env('logistics');
    guard('export', () => m.w.exportTransitExcel());
    await wait(1200);
    ok('logistics: няма confirm', m.cap.confirms.length === 0);
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
