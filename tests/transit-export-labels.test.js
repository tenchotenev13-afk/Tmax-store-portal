/* Стока на път → Excel износ: етикетите на посоката и статуса са като на екрана
   (трансфер → „🔄 Трансфер", sent → „Изпратена"). Износът е архив преди
   изчистване — изнася ЦЕЛИЯ transitData, не следва филтъра на екрана.

   Пускане: node tests/transit-export-labels.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report } = H;

const row = (id, direction, status) => ({
  id, direction, status, store_name: 'Троян', supplier: 'Склад', purchase_doc: 'D' + id,
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

(async function run() {
  section('1. посока и статус');
  {
    const { w, cap } = env('admin');
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    const body = cap.aoa ? cap.aoa.slice(1) : [];
    ok('4 реда + заглавен', cap.aoa && cap.aoa.length === 5, cap.aoa && cap.aoa.length);
    ok('посоки', JSON.stringify(body.map(r => r[0])) === JSON.stringify(['📦 Получавам', '📦 Получавам', '🔄 Трансфер', '🔄 Трансфер']), JSON.stringify(body.map(r => r[0])));
    ok('статуси', JSON.stringify(body.map(r => r[12])) === JSON.stringify(['Не доставена', 'Прието', 'Изпратена', 'Не доставена']), JSON.stringify(body.map(r => r[12])));
    ok('17 колони', cap.aoa[0].length === 17 && body.every(r => r.length === 17));
  }

  section('2. outgoing / rejected / непознат статус');
  {
    const { w, cap } = env('admin');
    w.transitData = [row('a', 'outgoing', 'rejected'), row('b', 'incoming', 'странен')];
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    const body = cap.aoa.slice(1);
    ok('outgoing → „📤 Изпращам"', body[0][0] === '📤 Изпращам');
    ok('rejected → „Неприето"', body[0][12] === 'Неприето', body[0][12]);
    ok('непознат статус → самата стойност', body[1][12] === 'странен', body[1][12]);
  }

  section('3. филтър на екрана не влиза в износа');
  {
    const { w, cap } = env('admin');
    w.transitFilter = 'received';
    guard('exportTransitExcel()', () => w.exportTransitExcel());
    ok('пак всичките 4 реда', cap.aoa && cap.aoa.length === 5, cap.aoa && cap.aoa.length);
  }

  section('4. admin → въпрос за изчистване; не-admin → няма');
  {
    const a = env('admin');
    guard('export', () => a.w.exportTransitExcel());
    await wait(1200);
    ok('admin: confirm се появява', a.cap.confirms.length === 1 && /изчистя/.test(a.cap.confirms[0]), JSON.stringify(a.cap.confirms));
    const m = env('logistics');
    guard('export', () => m.w.exportTransitExcel());
    await wait(1200);
    ok('logistics: няма confirm', m.cap.confirms.length === 0);
  }
  report();
})().catch(e => { console.error(e); process.exit(1); });
