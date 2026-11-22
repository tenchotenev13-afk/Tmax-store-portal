/* Разлики — обектът трие ЦЯЛАТА си бланка (решение А на Тенчо, 19.11.2026).

   sdCanStoreDeleteReport(rep) — едно правило за бутона и (през
   sdStoreReportDeletable) за свежата проверка точно преди триенето.
   Проверява се:
     · бутонът е на непипната СВОЯ бланка, вкл. бланка без редове;
     · няма го при: чужд обект, прегледана, пратен имейл (Доставчик), отговор
       на склада, store_response, ред с type, размяна, ред пипан от офиса;
     · складът и офисът го нямат (admin си пази своя 🗑 → sdDeleteReport);
     · клик → модал → „🗑 Изтрий" → свеж GET → DELETE файлове → редове → бланка;
     · срок 72 ч от created_at: точно 72 ч — да, +1 мин — не, без дата — не;
     · свежата проверка показва действие → 0 DELETE + червен toast;
     · провален DELETE на редовете → toast, бланката не се трие.

   Пускане:  node tests/razliki-store-delete-report.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
const PUB = SB + '/storage/v1/object/public/bulletin-files/';
const JPG = PUB + 'differences/1790000000000_aaaaaa.jpg';
const PNG = PUB + 'differences/1790000000001_bbbbbb.png';

function line(o) {
  return Object.assign({
    store_name: 'Кърджали', supplier: 'ТЕСИ ООД', material_code: '111',
    material_name: 'АРТИКУЛ', quantity: 1, quantity_received: null,
    order_number: null, comment: null, resolution_comment: null,
    attachments: [], credit_note_issued: false, difference_category: 'undelivered',
    unit: 'бр.', status: 'new', type: null, warehouse_response: null,
    warehouse_comment: null, store_response: null, resolved_by: null,
    resolved_at: null, completed_by: null, completed_at: null, swap_id: null,
    return_order_number: null, created_at: '2026-11-18T08:00:00.000Z'
  }, o);
}
function rep(o) {
  return Object.assign({
    id: 'rep-k', direction: 'supplier', store_name: 'Кърджали',
    counterpart: 'ТЕСИ ООД', document_number: '180000001', doc_date: '2026-11-18',
    submitted_by: 'Склад Кърджали', general_comment: '', photos: [{ url: JPG, name: 'стокова.jpg' }],
    created_at: '2026-11-18T08:00:00.000Z', reviewed: false, email_sent_at: null,
    email_pending: null, email_skipped_at: null
  }, o);
}
/* Фиксиран часовник: бланката е подадена 18.11 08:00 UTC, „сега“ е 19.11 12:00 —
   28 ч, в срока от 72 ч. Без това тестът би почервенял сам след 21.11. */
const NOW = Date.parse('2026-11-19T12:00:00.000Z');
const H72 = 72 * 3600 * 1000;
const L1 = () => line({ id: 'l-1', report_id: 'rep-k', attachments: [{ url: PNG, type: 'image' }] });
const L2 = () => line({ id: 'l-2', report_id: 'rep-k', material_code: '222' });

const USERS = {
  store:     { email: 'kj@temax.bg', display_name: 'Склад Кърджали', role: 'manager', store_name: 'Кърджали' },
  other:     { email: 'tr@temax.bg', display_name: 'Троян', role: 'manager', store_name: 'Троян' },
  warehouse: { email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: 'Логистичен склад Търговище' },
  accounting:{ email: 'acc@temax.bg', display_name: 'Цвети', role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Кърджали'] },
  logistics: { email: 'log@temax.bg', display_name: 'Логистика', role: 'logistics', store_name: 'Централен офис' },
  admin:     { email: 'ad@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' }
};

/* fresh — какво връща базата при свежата проверка (по подразбиране = екрана). */
function env(who, R, LINES, opts) {
  opts = opts || {};
  const fresh = opts.fresh || { rep: R, lines: LINES, swaps: opts.swaps || [], notes: [] };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: USERS[who],
    fail: opts.fail,
    data: {
      differences_reports: () => [fresh.rep].filter(Boolean),
      stock_differences: () => fresh.lines,
      stock_diff_swaps: () => fresh.swaps,
      storno_notes: () => fresh.notes,
      stock_returns: [], transport_orders: [], users: []
    }
  });
  h.w.Date.now = () => (opts.now !== undefined ? opts.now : NOW);
  h.w.sdData = JSON.parse(JSON.stringify(LINES));
  h.w.diffReports = JSON.parse(JSON.stringify([R]));
  h.w.sdSwaps = JSON.parse(JSON.stringify(opts.swaps || []));
  /* 22.11.2026 (razliki-co-findings т.3): подателят трябва да е потребител на
     обекта — както ги чете sdLoadStoreSubmitters. Бланката е от „Склад Кърджали“. */
  h.w.sdStoreSubmitters = { store: 'Кърджали', names: { 'Склад Кърджали': 1 } };
  h.w.transportOrders = [];
  h.w.sdView = 'reports';
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = R.direction || 'supplier';
  h.fresh = fresh;
  return h;
}
/* Само <button>, не span/бадж. */
const storeBtns = root => root ? Array.from(root.querySelectorAll('button[onclick*="sdStoreDeleteReport"]')) : [];
const adminBtns = root => root ? Array.from(root.querySelectorAll('button[onclick^="sdDeleteReport"]')) : [];
const mod = h => h.doc.getElementById('mod-stock-diff');

function seesButton(label, who, R, LINES, opts) {
  const h = env(who, R, LINES, opts);
  guard('рендер (' + label + ')', () => h.w.renderStockDiff());
  const n = storeBtns(mod(h)).length;
  h.close();
  return n;
}

section('1. обектът вижда бутона на непипната своя бланка');
{
  const h = env('store', rep(), [L1(), L2()]);
  guard('рендер', () => h.w.renderStockDiff());
  const card = h.doc.getElementById('diff-rep-rep-k');
  ok('картата е рендирана', !!card);
  const b = storeBtns(card);
  ok('точно един бутон „🗑 Изтрий бланката" в картата', b.length === 1, 'брой ' + b.length);
  ok('текстът е „🗑 Изтрий бланката"', b[0] && b[0].textContent.indexOf('🗑 Изтрий бланката') >= 0);
  ok('admin бутонът го няма за обекта', adminBtns(mod(h)).length === 0);
  h.close();
}
section('1б. бланка без редове (Троян, 16.09) — също');
ok('бланка с 0 реда показва бутона', seesButton('0 реда', 'store', rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище' }), []) === 1);
section('1в. междускладова непипната — също');
ok('междускладова показва бутона', seesButton('interstore', 'store', rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище' }), [L1()]) === 1);

section('2. НЯМА бутон при действие или чужд обект');
ok('чужд обект', seesButton('чужд', 'other', rep(), [L1()]) === 0);
ok('прегледана (reviewed + чака имейл)', seesButton('reviewed', 'store', rep({ reviewed: true, email_pending: true }), [L1()]) === 0);
ok('пратен имейл (Доставчик)', seesButton('email', 'store', rep({ email_sent_at: '2026-11-18T10:00:00Z' }), [L1()]) === 0);
ok('отговор на склада на ЕДИН от редовете', seesButton('wh', 'store', rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище' }), [L1(), Object.assign(L2(), { warehouse_response: 'sent' })]) === 0);
ok('store_response', seesButton('sr', 'store', rep(), [L1(), Object.assign(L2(), { store_response: 'received' })]) === 0);
ok('ред с type', seesButton('type', 'store', rep(), [L1(), Object.assign(L2(), { type: 'writein' })]) === 0);
ok('размяна по ред', seesButton('swap', 'store', rep(), [L1(), L2()], { swaps: [{ id: 's1', from_line_id: 'x', to_line_id: 'l-2', status: 'open' }] }) === 0);
ok('ред, пипан от офиса (resolution_comment)', seesButton('office', 'store', rep(), [L1(), Object.assign(L2(), { resolution_comment: 'чакаме кредитно' })]) === 0);
ok('сторно (само за четене за обекта)', seesButton('wr', 'store', rep({ direction: 'wrong_receipt' }), [L1()]) === 0);

section('2б. срок 72 ч от created_at');
{
  const T0 = Date.parse('2026-11-18T08:00:00.000Z');
  ok('точно 72 ч — позволено', seesButton('72ч', 'store', rep(), [L1()], { now: T0 + H72 }) === 1);
  ok('72 ч + 1 мин — НЕ', seesButton('72ч+1', 'store', rep(), [L1()], { now: T0 + H72 + 60000 }) === 0);
  ok('без created_at — НЕ', seesButton('null', 'store', rep({ created_at: null }), [L1()]) === 0);
  ok('невалиден created_at — НЕ', seesButton('bad', 'store', rep({ created_at: 'xx' }), [L1()]) === 0);
}

section('3. складът и офисът — без бутона; admin пази своя');
{
  const R = rep({ direction: 'interstore', counterpart: 'Логистичен склад Търговище' });
  ok('логистичен склад', seesButton('warehouse', 'warehouse', R, [L1()]) === 0);
  ok('accounting', seesButton('acc', 'accounting', rep(), [L1()]) === 0);
  ok('logistics', seesButton('log', 'logistics', rep(), [L1()]) === 0);
  const h = env('admin', rep(), [L1()]);
  guard('рендер admin', () => h.w.renderStockDiff());
  ok('admin няма бутона на обекта', storeBtns(mod(h)).length === 0);
  ok('admin си има своя 🗑 (sdDeleteReport)', adminBtns(h.doc.getElementById('diff-rep-rep-k')).length === 1);
  h.close();
}

(async () => {
  section('4. клик → модал → „🗑 Изтрий" → свеж GET → DELETE файлове/редове/бланка');
  {
    const h = env('store', rep(), [L1(), L2()]);
    guard('рендер', () => h.w.renderStockDiff());
    h.calls.get.length = 0; h.calls.del.length = 0;
    guard('клик на бутона', () => realClick(h.w, storeBtns(mod(h))[0]));
    const ov = h.doc.getElementById('sdsd-ov');
    ok('модалът е отворен', !!ov);
    ok('текстът за окончателно изтриване', ov && ov.textContent.indexOf('Бланката и снимките ѝ ще бъдат изтрити окончателно. Ползвайте само ако е подадена по грешка.') >= 0);
    const btns = ov ? Array.from(ov.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
    ok('бутони „Откажи" и „🗑 Изтрий"', btns.indexOf('Откажи') >= 0 && btns.indexOf('🗑 Изтрий') >= 0, btns.join(' | '));
    ok('до клика на „Изтрий" нула DELETE', h.calls.del.length === 0);
    guard('„Откажи" затваря', () => realClick(h.w, Array.from(ov.querySelectorAll('button')).find(b => b.textContent.trim() === 'Откажи')));
    ok('модалът е затворен, нищо не е изтрито', !h.doc.getElementById('sdsd-ov') && h.calls.del.length === 0);

    guard('клик отново', () => realClick(h.w, storeBtns(mod(h))[0]));
    guard('„🗑 Изтрий"', () => realClick(h.w, h.doc.getElementById('sdsd-go')));
    await ticks();
    ok('свеж GET на бланката', h.calls.get.some(u => u.indexOf('differences_reports?id=eq.rep-k') >= 0), h.calls.get.join(' | '));
    ok('свеж GET на редовете', h.calls.get.some(u => u.indexOf('stock_differences?report_id=eq.rep-k') >= 0));
    ok('свеж GET на размените по редовете', h.calls.get.some(u => u.indexOf('stock_diff_swaps?or=') >= 0 && u.indexOf('l-1') >= 0));
    const dels = h.calls.del.slice();
    const st = dels.filter(u => u.indexOf('/storage/v1/object/') >= 0);
    const li = dels.findIndex(u => u.indexOf('stock_differences?report_id=eq.rep-k') >= 0);
    const ri = dels.findIndex(u => u.indexOf('differences_reports?id=eq.rep-k') >= 0);
    ok('2 файла (снимка на бланката + прикачен на реда)', st.length === 2, st.join(' | '));
    ok('ред: файлове → редове → бланка', st.length === 2 && li === 2 && ri === 3, dels.join(' | '));
    ok('зелен toast', h.calls.toast.some(t => t.indexOf('Бланката е изтрита') >= 0), h.calls.toast.join(' | '));
    ok('няма PATCH/POST (без известие, без маркиране)', h.calls.patch.length === 0 && h.calls.post.length === 0);
    ok('списъкът е презареден (loadStockDiff)', h.calls.get.some(u => u.indexOf('differences_reports?order=') >= 0));
    h.close();
  }

  section('5. свежата проверка показва действие → 0 DELETE + червен toast');
  for (const [label, mut] of [
    ['складът отговори на ред', f => { f.lines[1] = Object.assign({}, f.lines[1], { warehouse_response: 'sent' }); }],
    ['бланката е прегледана', f => { f.rep = Object.assign({}, f.rep, { reviewed: true }); }],
    ['офисът сложи тип', f => { f.lines[0] = Object.assign({}, f.lines[0], { type: 'return' }); }],
    ['минаха 72 ч, докато модалът е отворен', (f, h) => { h.w.Date.now = () => Date.parse('2026-11-18T08:00:00.000Z') + H72 + 60000; }],
    ['появи се размяна', f => { f.swaps = [{ id: 's9', from_line_id: 'l-1', to_line_id: 'zz', status: 'open' }]; }]
  ]) {
    const h = env('store', rep(), [L1(), L2()], { fresh: { rep: rep(), lines: [L1(), L2()], swaps: [], notes: [] } });
    guard('рендер', () => h.w.renderStockDiff());
    h.calls.del.length = 0;
    guard('клик', () => realClick(h.w, storeBtns(mod(h))[0]));
    mut(h.fresh, h);
    guard('Изтрий', () => realClick(h.w, h.doc.getElementById('sdsd-go')));
    await ticks();
    ok(label + ': нула DELETE', h.calls.del.length === 0, h.calls.del.join(' | '));
    ok(label + ': червен toast', h.calls.toast.some(t => t.indexOf('Някой вече е действал по бланката — не може да се изтрие') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  section('6. провален DELETE на редовете → toast, бланката НЕ се трие');
  {
    const h = env('store', rep(), [L1(), L2()], {
      fail: { DELETE: { status: 409, body: { message: 'отказ от базата' }, url: /rest\/v1\/stock_differences/ } }
    });
    guard('рендер', () => h.w.renderStockDiff());
    h.calls.del.length = 0;
    guard('клик', () => realClick(h.w, storeBtns(mod(h))[0]));
    guard('Изтрий', () => realClick(h.w, h.doc.getElementById('sdsd-go')));
    await ticks();
    const dels = h.calls.del;
    ok('DELETE на редовете е опитан', dels.some(u => u.indexOf('stock_differences?report_id=eq.rep-k') >= 0));
    ok('DELETE на бланката НЕ е изпратен', !dels.some(u => u.indexOf('differences_reports') >= 0), dels.join(' | '));
    const t = h.calls.toast.join(' | ');
    ok('червен toast с причината', t.indexOf('Редовете НЕ бяха изтрити') >= 0 && t.indexOf('отказ от базата') >= 0, t);
    ok('без фалшив успех', t.indexOf('Бланката е изтрита') < 0, t);
    h.close();
  }

  section('7. провалено свежо четене → нищо не се трие');
  {
    const h = env('store', rep(), [L1()], { fail: { GET: { status: 500, body: { message: 'boom' }, url: /stock_differences\?report_id/ } } });
    guard('рендер', () => h.w.renderStockDiff());
    guard('клик', () => realClick(h.w, storeBtns(mod(h))[0]));
    guard('Изтрий', () => realClick(h.w, h.doc.getElementById('sdsd-go')));
    await ticks();
    ok('нула DELETE', h.calls.del.length === 0, h.calls.del.join(' | '));
    ok('червен toast „НЕ е изтрита"', h.calls.toast.some(t => t.indexOf('Бланката НЕ е изтрита') >= 0), h.calls.toast.join(' | '));
    h.close();
  }

  section('8. директно извикване от чужд обект → без модал');
  {
    const h = env('other', rep(), [L1()]);
    guard('рендер', () => h.w.renderStockDiff());
    guard('директно', () => h.w.sdStoreDeleteReport('rep-k'));
    ok('няма модал', !h.doc.getElementById('sdsd-ov'));
    ok('червен toast', h.calls.toast.some(t => t.indexOf('не може да се изтрие') >= 0));
    h.close();
  }

  report();
})();
