/* Бланка за шофьора (Транспорт): ред „Проверено (снабдител / началник склад)".

   Решение на Тенчо 11.11.2026: стоката, която напуска обекта, се проверява от
   снабдителя или началник склада — на бланката има поле, което го
   удостоверява. Бланката е два еднакви екземпляра half() на един лист A4;
   полето трябва да е в ДВАТА, точно по веднъж, ПРЕДИ „Получил", а редовете
   „Получил" и „Получих стоката без забележка!" — непроменени.

   Пътят е истинският: renderTransport() → бутон „🖨 Бланка" в реда →
   realClick → loadTransportPrint() → renderTransportPrint() → #mod-print.

   Пускане от корена на репото:
     node tests/transport-print-checked.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, dayOffset, tsOffset } = H;

const ITEM = { product: 'БОЙЛЕР 80Л', color: 'бял', sap: '10012345', qty: 2, unit: 'бр.' };

const TRANSPORT_ORDERS = [
  { id: 'tr-1', in_num: '5001', store_name: 'Враца', date: dayOffset(-2), hour: '14:00', bon: '000999',
    customer_name: 'Мария Георгиева', phone: '0888333444', address: 'ул. Кирил и Методий 12',
    product: ITEM.product, sap: ITEM.sap, qty: ITEM.qty, unit: ITEM.unit, items: [ITEM],
    delivery: dayOffset(5), status: 'pending', notes: 'Звънец 3', created_at: tsOffset(-2),
    client_order_num: '0042', paid_transport: false, agent: 'Управител Враца' }
];

const USER = { email: 'vr@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };

const CHECKED = 'Проверено (снабдител / началник склад)';
const RECV = 'Получил:';
const OK_TXT = 'Получих стоката без забележка!';

function env() {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: USER,
    data: { transport_orders: TRANSPORT_ORDERS, client_orders: [], stores: [] }
  });
  h.w.transportOrders = JSON.parse(JSON.stringify(TRANSPORT_ORDERS));
  return h;
}

/* Печат през истинския бутон в реда. Връща #mod-print или null. */
function printViaRow(h) {
  if (!guard('renderTransport() не хвърля', () => h.w.renderTransport())) return null;
  const row = h.doc.getElementById('tr-row-tr-1');
  if (!ok('редът tr-1 е рендериран', !!row)) return null;
  const b = btn(row, '🖨 Бланка');
  if (!ok('редът има бутон „🖨 Бланка"', !!b)) return null;
  ok('бутонът вика loadTransportPrint', /loadTransportPrint\('tr-1'\)/.test(b.getAttribute('onclick') || ''));
  realClick(h.w, b, '🖨 Бланка');
  return h.doc.getElementById('mod-print');
}

/* Проверките на един рендер — ползват се и за чистия код, и за мутантите. */
function checkSheet(mp) {
  const halves = mp ? Array.from(mp.querySelectorAll('.p-half')) : [];
  const r = { halves: halves.length, perHalf: [] };
  halves.forEach(hf => {
    const sign = hf.querySelector('.p-sign');
    const lines = sign ? Array.from(sign.children).map(c => c.textContent.replace(/\s+/g, ' ').trim()) : [];
    const iChecked = lines.findIndex(t => t.indexOf(CHECKED) === 0);
    const iRecv = lines.findIndex(t => t.indexOf(RECV) === 0);
    const checkedEl = sign ? Array.from(sign.children)[iChecked] : null;
    r.perHalf.push({
      lines,
      countChecked: (hf.textContent.split(CHECKED).length - 1),
      iChecked, iRecv,
      checkedTxt: iChecked >= 0 ? lines[iChecked] : '',
      checkedBold: !!(checkedEl && checkedEl.querySelector('b') && checkedEl.querySelector('b').textContent === 'Проверено'),
      checkedClass: checkedEl ? checkedEl.className : '',
      recvTxt: iRecv >= 0 ? lines[iRecv] : '',
      okTxt: lines[lines.length - 1] || ''
    });
  });
  return r;
}

function sheetIsGood(r) {
  return r.halves === 2 && r.perHalf.every(p =>
    p.countChecked === 1 && p.iChecked >= 0 && p.iRecv === p.iChecked + 1 &&
    /имена \.{10,} подпис \.{10,}$/.test(p.checkedTxt));
}

(async function run() {

  section('1. Истински клик „🖨 Бланка" → бланката в #mod-print');
  const h = env();
  const mp = printViaRow(h);
  const r = checkSheet(mp);
  ok('два екземпляра .p-half', r.halves === 2, 'намерени: ' + r.halves);

  section('2. „Проверено" — в двата екземпляра, по веднъж, преди „Получил"');
  r.perHalf.forEach((p, i) => {
    const n = 'екземпляр ' + (i + 1) + ': ';
    ok(n + 'редът „Проверено (снабдител / началник склад)" е точно веднъж', p.countChecked === 1, 'брой: ' + p.countChecked);
    ok(n + 'редът е в .p-sign', p.iChecked >= 0);
    ok(n + 'е НЕПОСРЕДСТВЕНО преди „Получил"', p.iRecv === p.iChecked + 1, 'индекси ' + p.iChecked + ' / ' + p.iRecv);
    ok(n + 'има „имена ....." и „подпис ....."', /: имена \.{10,} подпис \.{10,}$/.test(p.checkedTxt), p.checkedTxt);
    ok(n + '„Проверено" е удебелено като „Получил"', p.checkedBold);
    ok(n + 'същият стил като „Получил" (.p-recv)', p.checkedClass === 'p-recv', p.checkedClass);
  });

  section('3. „Получил" и „Получих стоката без забележка!" — непроменени');
  r.perHalf.forEach((p, i) => {
    const n = 'екземпляр ' + (i + 1) + ': ';
    ok(n + '„Получил:" е както преди', p.recvTxt === 'Получил: ' + '.'.repeat(64), p.recvTxt);
    ok(n + 'последният ред е „Получих стоката без забележка!"', p.okTxt === OK_TXT, p.okTxt);
    ok(n + 'пунктирът .p-dots е първи и непроменен', p.lines[0] === '.'.repeat(101), p.lines[0]);
    ok(n + '.p-sign има точно 4 реда (пунктир, Проверено, Получил, без забележка)', p.lines.length === 4, p.lines.length);
  });

  section('4. Останалите полета — непроменени');
  {
    const halves = mp ? Array.from(mp.querySelectorAll('.p-half')) : [];
    halves.forEach((hf, i) => {
      const rows = Array.from(hf.querySelectorAll('.p-table tr')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
      const n = 'екземпляр ' + (i + 1) + ': ';
      const want = ['Изискване за транспорт от дата:', 'По клиентска заявка №:0042', 'Касов бон:000999',
        'Клиент:Мария Георгиева', 'Адрес:ул. Кирил и Методий 12', 'Телефон за връзка:0888333444',
        'Продукти:', 'Забележка:Звънец 3'];
      ok(n + '8 реда в таблицата', rows.length === 8, rows.length);
      want.forEach((w0, k) => ok(n + 'ред „' + w0 + '"', (rows[k] || '').indexOf(w0) === 0, rows[k]));
      ok(n + 'продуктът е в реда', (rows[6] || '').indexOf('БОЙЛЕР 80Л') >= 0);
      const deliv = hf.querySelector('.p-deliv');
      ok(n + 'Дата/Час за доставка', !!deliv && /Дата за доставка:/.test(deliv.textContent) && /Час за доставка: 14:00/.test(deliv.textContent));
      ok(n + 'ТРАНСПОРТ + обект', !!hf.querySelector('.p-title') && hf.querySelector('.p-store-name').textContent === 'Враца');
    });
    ok('линията „ОТКЪСВАТЕ ТУК" е една, между двата екземпляра',
      !!mp && mp.querySelectorAll('.p-cut').length === 1 &&
      mp.querySelector('.p-cut').previousElementSibling.className === 'p-half' &&
      mp.querySelector('.p-cut').nextElementSibling.className === 'p-half');
  }

  section('5. Мутации — проверките ги хващат');
  {
    const src = h.w.renderTransportPrint.toString();
    const CHK_DIV = "'<div class=\"p-recv\"><b>Проверено</b> (снабдител / началник склад): имена ........................................ подпис ..............................</div>'+";
    const RECV_DIV = "'<div class=\"p-recv\"><b>Получил:</b> ................................................................</div>'+";
    ok('мутациите имат котва в кода', src.indexOf(CHK_DIV) >= 0 && src.indexOf(RECV_DIV) >= 0);
    ok('чистият код минава проверките', sheetIsGood(r));

    const mutants = {
      'полето само в единия екземпляр':
        s => s.replace(CHK_DIV, "((window.__n=(window.__n||0)+1)===1?" + CHK_DIV.slice(0, -1) + ":'')+"),
      'полето след „Получил"':
        s => s.replace(CHK_DIV + '\n        ' + RECV_DIV, RECV_DIV + '\n        ' + CHK_DIV),
      'липсва „подпис"':
        s => s.replace(' подпис ..............................', ' ..............................'),
      'полето го няма':
        s => s.replace(CHK_DIV, '')
    };
    Object.keys(mutants).forEach(name => {
      const ms = mutants[name](src);
      if (!ok('мутантът „' + name + '" е различен от оригинала', ms !== src)) return;
      const hm = env();
      let compiled = true;
      try { hm.w.eval('window.renderTransportPrint=' + ms); } catch (e) { compiled = false; }
      if (!ok('мутантът „' + name + '" се компилира', compiled)) return;
      const rm = checkSheet(printViaRow(hm));
      ok('мутантът „' + name + '" е хванат', !sheetIsGood(rm));
    });
  }

  report();
})();
