/* Разлики — „Смени посоката" Доставчик ↔ Сторна по грешен прием (Цвети, 30.09.2026).

   Решения от 01.10.2026:
     · само НЕДОКОСНАТА бланка (нито ред с тип, нито запис в „За връщане");
     · само за canReviewDiff();
     · диалогът иска категория за всеки ред (от списъка на НОВАТА посока) и
       „Поръчка №" 41… — и в двете посоки;
     · ред на записа: редовете (категория + номер) → посоката → audit_log
       (diff_report_moved) + push до магазина;
     · падне ли audit_log/push — посоката остава, но излиза ЖЪЛТ toast.

   Пускане:  node tests/sd-move-direction.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'kardzhali@temax.bg', display_name: 'Склад Кърджали', role: 'sklad', store_name: 'Кърджали', assigned_stores: [] };

function rep(o) {
  return Object.assign({ id: 'rep-s', direction: 'supplier', store_name: 'Кърджали', counterpart: 'ТЕСИ ООД',
    document_number: '180486328', doc_date: '2026-09-27', submitted_by: 'Склад Кърджали', general_comment: '',
    photos: [], reviewed: false, email_sent_at: null, created_at: '2026-09-28T09:00:00.000Z' }, o);
}
function line(o) {
  return Object.assign({ id: 'l-1', report_id: 'rep-s', store_name: 'Кърджали', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'ЛАЙСНА', quantity: 3, quantity_received: 5, quantity_supplier_doc: 3,
    difference_category: 'excess', order_number: null, type: null, status: 'new', comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false, warehouse_response: null,
    store_response: null, created_at: '2026-09-28T09:00:00.000Z' }, o);
}
const REPS = [
  rep(),
  rep({ id: 'rep-done', counterpart: 'КАМ-04' }),
  rep({ id: 'rep-w', direction: 'wrong_receipt', counterpart: 'КАМ-04' })
];
const LINES = [
  line({ id: 'l-1', difference_category: 'excess' }),
  line({ id: 'l-2', material_name: 'ЩУЦЕР', difference_category: 'damaged' }),
  line({ id: 'l-d', report_id: 'rep-done', type: 'missing', status: 'pending' }),
  line({ id: 'l-w', report_id: 'rep-w', difference_category: 'billed_not_received', order_number: '4100135756' })
];

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user, confirm: true, fail: opts.fail,
    data: {
      stock_differences: LINES, differences_reports: REPS, stock_diff_swaps: [], transport_orders: [],
      stock_returns: opts.returns || [], users: [], stores: [], contacts: [], audit_log: []
    }
  });
  h.pushes = [];
  h.w.pushInterstoreDiff = (t, title, msg) => { h.pushes.push({ t, title, msg }); return Promise.resolve({ ok: opts.pushOk !== false }); };
  h.w.sdData = JSON.parse(JSON.stringify(LINES));
  h.w.diffReports = JSON.parse(JSON.stringify(REPS));
  h.w.sdSwaps = []; h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = opts.tab || 'supplier'; h.w.sdShowDone = {};
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.renderStockDiff();
  return h;
}
const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const card = (h, id) => h.doc.getElementById('diff-rep-' + id);
const moveBtn = (h, id) => { const c = card(h, id); return c && c.querySelector('button[onclick^="openSDMoveModal"]'); };
const ov = h => h.doc.getElementById('sdm-ov');
const cat = (h, id) => h.doc.querySelector('#sdm-ov .sdm-cat[data-id="' + id + '"]');
const patches = (h, re) => h.calls.patch.filter(p => re.test(p.url));
const audits = h => h.calls.post.filter(p => p.table === 'audit_log');
const lastToast = h => String(h.calls.toast[h.calls.toast.length - 1] || '');
async function openMove(h, id) { realClick(h.w, moveBtn(h, id)); await settle(); }
async function confirmMove(h) { realClick(h.w, btn(ov(h), h.w.sdMoveTarget(h.w.diffReports.find(r => r.id === ov(h).querySelector('[data-rid]').dataset.rid)) === 'wrong_receipt' ? '🧾 Премести' : '📦 Върни')); await settle(); }

(async function run() {

  section('1. Бутонът: само за Цвети и само на недокосната бланка');
  {
    const h = env(STORE);
    ok('магазин: няма бутон за преместване никъде', !h.doc.querySelector('button[onclick^="openSDMoveModal"]'));
    h.w.openSDMoveModal('rep-s');
    ok('магазин: директно openSDMoveModal → отказ, без диалог', !ov(h) && /Цвети\/admin/.test(lastToast(h)), lastToast(h));
    h.w.submitSDMove('rep-s');
    await settle();
    ok('магазин: директно submitSDMove → без PATCH', h.calls.patch.length === 0);
    h.close();
  }
  {
    const h = env(CVETI);
    if (ok('Цвети: картата на недокоснатата бланка е на екрана', !!card(h, 'rep-s'))) {
      const b = moveBtn(h, 'rep-s');
      ok('Цвети: „🧾 Премести в Сторна" е там', !!b && b.textContent.trim() === '🧾 Премести в Сторна', b && b.textContent);
    }
    if (ok('Цвети: картата на РЕШЕНАТА бланка е на екрана', !!card(h, 'rep-done'))) {
      ok('решена бланка: бутон няма', !moveBtn(h, 'rep-done'));
    }
    h.w.openSDMoveModal('rep-done');
    ok('решена бланка: директно → отказ, без диалог', !ov(h) && /решен ред/.test(lastToast(h)), lastToast(h));
    h.w.submitSDMove('rep-done');
    await settle();
    ok('решена бланка: директно submitSDMove → без PATCH', h.calls.patch.length === 0);
    h.close();
  }

  section('2. Диалогът: без категория / без валиден 41… → отказ без PATCH');
  {
    const h = env(CVETI);
    await openMove(h, 'rep-s');
    if (ok('диалогът е отворен', !!ov(h))) {
      ok('„Излишък" е предложен като „Приета нефактурирана"', cat(h, 'l-1').value === 'unbilled_received', cat(h, 'l-1').value);
      ok('„Увредена" е без предложение', cat(h, 'l-2').value === '', cat(h, 'l-2').value);
      ok('опциите са само на сторната', Array.prototype.map.call(cat(h, 'l-2').options, o => o.value).filter(Boolean).join(',') === 'unbilled_received,billed_not_received');
      ok('говори за удръжката', ov(h).textContent.indexOf('удръжка за Кърджали') >= 0);
      h.doc.getElementById('sdm-order').value = '4100135756';
      await confirmMove(h);
      ok('ред без категория → червен toast „Ред 2: избери категория"', lastToast(h) === 'Ред 2: избери категория', lastToast(h));
      ok('… и без PATCH', h.calls.patch.length === 0);
      cat(h, 'l-2').value = 'billed_not_received';
      h.doc.getElementById('sdm-order').value = '180486328';
      await confirmMove(h);
      ok('180… → червен toast за поръчката', /Поръчка №/.test(lastToast(h)), lastToast(h));
      ok('… и без PATCH', h.calls.patch.length === 0);
      h.doc.getElementById('sdm-order').value = '';
      await confirmMove(h);
      ok('празен номер → отказ без PATCH', /Поръчка №/.test(lastToast(h)) && h.calls.patch.length === 0);
    }
    h.close();
  }
  {
    /* Запис в „За връщане", който sdData не вижда — проверката е в базата. */
    const h = env(CVETI, { returns: [{ id: 'sr-1', diff_line_id: 'l-1' }] });
    await openMove(h, 'rep-s');
    cat(h, 'l-2').value = 'billed_not_received';
    h.doc.getElementById('sdm-order').value = '4100135756';
    await confirmMove(h);
    ok('запис в „За връщане" → червен toast, без PATCH', /За връщане/.test(lastToast(h)) && h.calls.patch.length === 0, lastToast(h));
    h.close();
  }

  section('3. Успешно преместване → Сторна');
  {
    const h = env(CVETI);
    await openMove(h, 'rep-s');
    cat(h, 'l-2').value = 'billed_not_received';
    h.doc.getElementById('sdm-order').value = ' 4100135756 ';
    await confirmMove(h);
    const lp = patches(h, /stock_differences/);
    ok('PATCH на двата реда с новата категория и номера',
      lp.length === 2 &&
      lp.some(p => /id=eq\.l-1/.test(p.url) && p.body.difference_category === 'unbilled_received' && p.body.order_number === '4100135756') &&
      lp.some(p => /id=eq\.l-2/.test(p.url) && p.body.difference_category === 'billed_not_received' && p.body.order_number === '4100135756'),
      JSON.stringify(lp.map(p => [p.url.split('=').pop(), p.body])));
    const rp = patches(h, /differences_reports/);
    ok('PATCH на бланката: direction = wrong_receipt', rp.length === 1 && rp[0].body.direction === 'wrong_receipt' && /id=eq\.rep-s/.test(rp[0].url),
      JSON.stringify(rp.map(p => p.body)));
    const order = h.calls.patch.map(p => p.table);
    ok('редовете са ПРЕДИ бланката', order.lastIndexOf('stock_differences') < order.indexOf('differences_reports'), order.join(','));
    const a = audits(h);
    ok('POST в audit_log: diff_report_moved supplier → wrong_receipt',
      a.length === 1 && a[0].body.event === 'diff_report_moved' && a[0].body.details.from === 'supplier' &&
      a[0].body.details.to === 'wrong_receipt' && a[0].body.details.report_id === 'rep-s' &&
      a[0].body.details.categories_before['l-2'] === 'damaged', JSON.stringify(a.map(x => x.body)));
    ok('push до магазина с текста за сторната', h.pushes.length === 1 && h.pushes[0].t === 'Кърджали' &&
      /Сторна по грешен прием/.test(h.pushes[0].msg), JSON.stringify(h.pushes));
    ok('зелен toast', /Сторна по грешен прием/.test(lastToast(h)) && !/⚠️/.test(lastToast(h)), lastToast(h));
    ok('диалогът е затворен', !ov(h));
    ok('подтабът е „Сторна"', h.w.sdDirTab === 'wrong_receipt', h.w.sdDirTab);
    ok('картата на бланката е в подтаба „Сторна"', !!card(h, 'rep-s'));
    h.w.sdDirTab = 'supplier'; h.w.renderStockDiff();
    ok('и я няма в „Доставчици"', !card(h, 'rep-s'));
    h.close();
  }

  section('4. Обратният ход → Доставчици');
  {
    const h = env(CVETI, { tab: 'wrong_receipt' });
    const b = moveBtn(h, 'rep-w');
    if (ok('„📦 Върни в Доставчици" е на сторната', !!b && b.textContent.trim() === '📦 Върни в Доставчици', b && b.textContent)) {
      await openMove(h, 'rep-w');
      ok('„Фактурирана неприета" е предложена като „Недоставен"', cat(h, 'l-w').value === 'undelivered', cat(h, 'l-w').value);
      ok('номерът е попълнен от редовете', h.doc.getElementById('sdm-order').value === '4100135756');
      ok('без отметка „без документ"', !ov(h).querySelector('#diff-no-doc') && ov(h).textContent.indexOf('без документ') < 0);
      cat(h, 'l-w').value = 'wrong_item';
      await confirmMove(h);
      const lp = patches(h, /stock_differences/), rp = patches(h, /differences_reports/);
      ok('PATCH на реда: wrong_item + номера', lp.length === 1 && lp[0].body.difference_category === 'wrong_item' && lp[0].body.order_number === '4100135756',
        JSON.stringify(lp.map(p => p.body)));
      ok('PATCH на бланката: direction = supplier', rp.length === 1 && rp[0].body.direction === 'supplier');
      ok('audit_log: wrong_receipt → supplier', audits(h).length === 1 && audits(h)[0].body.details.to === 'supplier');
      ok('push с текста за връщане', h.pushes.length === 1 && /Разлики от доставчици/.test(h.pushes[0].msg), JSON.stringify(h.pushes));
      ok('подтабът е „Доставчици" и бланката е там', h.w.sdDirTab === 'supplier' && !!card(h, 'rep-w'));
    }
    h.close();
  }

  section('5. audit_log/push падат → посоката остава, жълт toast');
  {
    const h = env(CVETI, { fail: { POST: /audit_log/ }, pushOk: false });
    await openMove(h, 'rep-s');
    cat(h, 'l-2').value = 'billed_not_received';
    h.doc.getElementById('sdm-order').value = '4100135756';
    await confirmMove(h);
    ok('посоката е сменена (PATCH на бланката)', patches(h, /differences_reports/).length === 1);
    ok('жълт toast за двете', /⚠️/.test(lastToast(h)) && /audit_log/.test(lastToast(h)) && /известието/.test(lastToast(h)), lastToast(h));
    ok('бланката е в „Сторна"', h.w.diffReports.find(r => r.id === 'rep-s').direction === 'wrong_receipt');
    h.close();
  }
  {
    const h = env(CVETI, { fail: { PATCH: /differences_reports/ } });
    await openMove(h, 'rep-s');
    cat(h, 'l-2').value = 'billed_not_received';
    h.doc.getElementById('sdm-order').value = '4100135756';
    await confirmMove(h);
    ok('PATCH на бланката пада → червен toast', /посоката НЕ е сменена/.test(lastToast(h)), lastToast(h));
    ok('… без audit_log и без push', audits(h).length === 0 && h.pushes.length === 0);
    ok('… бланката остава „Доставчик"', h.w.diffReports.find(r => r.id === 'rep-s').direction === 'supplier');
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
