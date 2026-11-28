/* Разлики — ИД № / ВД № при междускладов (razliki-id-nomer, решение на Тенчо
   28.11.2026).

   Складът изпраща по ИЗХОДЯЩА доставка (ИД, 80…), обектът приема по своя
   ВХОДЯЩА (ВД, 180…). Досега имаше едно поле „Документ №“ и складът ровеше в
   SAP за ИД. Сега при посока Междускладов:
     „ВД № (вашата входяща, по избор)“ → differences_reports.document_number
     „ИД № *“ (изходящата на склада)   → differences_reports.outbound_doc
   ИД е задължителен, само цифри (интервали отпред/отзад се режат); не започва
   ли с 80 — жълто предупреждение, не спиране. Доставчик и Сторна — без промяна.

   Проверява:
     1. междускладова без ИД / с нецифров ИД не се подава (няма POST);
     2. с ИД (вкл. интервали отпред и отзад) — POST носи outbound_doc и
        document_number поотделно; ИД, който не е 80… — предупреждение и POST;
     3. доставчик и сторна — без полето, без проверката, outbound_doc = null,
        етикет „Документ №“; ИД се пази при смяна на посоката напред-назад;
     4. prefill пълни ИД; бутонът „⚠️ Разлика“ от товарния лист — 80… → ИД,
        180… и свободен текст → ВД / Документ № (както преди);
     5. картата: при склада ИД първи, при обекта ВД първи; бланка без ИД —
        „Док. …“ както преди;
     6. търсене по ИД — в бланките и в редовете;
     7. Excel — колона „ИД №“ до „Документ №“ само когато има междускладова;
     8. печат (ред „ИД №“), имейл (тема и текст по ИД), „Действия на магазините“.

   Мутационна проверка (28.11.2026; мутант върху stock-differences.js /
   loading.js, файлът върнат от копие и сверен с cmp; чистият код: exit 0, 55/55):
     М1  ИД не е задължителен (diffOutboundValid → true)          → 2 ❌
     М2  outbound_doc не се праща (винаги null)                    → 2 ❌
     М3  товарен лист → всичко в document_number (старото)         → 2 ❌
     М10 товарен лист → всичко в ИД (и текст, и 180…)               → 4 ❌
     М4  ИД винаги след ВД (и при склада)                          → 1 ❌
     М5  без колона „ИД №“ в Excel                                 → 3 ❌
     М6  без trim на ИД                                            → 4 ❌
     М7  търсенето в бланките не гледа outbound_doc                → 1 ❌
     М8  търсенето по редове без документите на бланката           → 2 ❌
     М9  тема на имейла по ВД вместо по ИД                         → 1 ❌
   И десетте — exit 1. (Първият кръг: М7 оцеля — ВД 180111222 съдържаше ИД
   80111222 като подниз; данните на r3 са сменени.)

   Пускане:  node tests/razliki-id-nomer.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const U = {
  wh:  { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  mgr: { id: 'u-pm', email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич' }
};
const DBU = [
  { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', store_name: WH, notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-pm', email: 'petrich@temax.bg', display_name: 'Управител Петрич', store_name: 'Петрич', notify_groups: [], is_regional: false, assigned_stores: [], active: true }
];
function usersFor(url) {
  const m = /store_name=eq\.([^&]+)/.exec(url);
  if (!m) return DBU;
  const st = decodeURIComponent(m[1]);
  return DBU.filter(u => u.store_name === st);
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const recent = () => new Date(Date.now() - 3600 * 1000).toISOString();

const line = (id, rid, extra) => Object.assign({ id, report_id: rid, store_name: 'Петрич', supplier: WH, material_code: 'S' + id,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр.', difference_category: 'undelivered', type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [], created_by: 'Склад Петрич', created_at: recent() }, extra || {});
const rep = (id, extra) => Object.assign({ id, direction: 'interstore', store_name: 'Петрич', counterpart: WH,
  document_number: '180514303', outbound_doc: '80478143',
  doc_date: '2026-11-20', submitted_by: 'Склад Петрич', general_comment: '', photos: [], reviewed: false, created_at: recent(),
  email_sent_at: null, email_pending: null, email_skipped_at: null }, extra || {});

function env(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true,
    data: Object.assign({
      stock_differences: () => JSON.parse(JSON.stringify(opts.lines || [])), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: usersFor, contacts: [{ name: 'ТЕСИ ООД' }],
      differences_reports: () => JSON.parse(JSON.stringify(opts.reps || [])), storno_notes: [], storno_note_replies: [],
      sd_problem_articles: []
    }, opts.data || {})
  });
  h.w.pushToPeople = () => Promise.resolve({ ok: true });
  h.w.sendEmail = () => Promise.resolve({ ok: true });
  h.w.transportOrders = [];
  return h;
}
async function load(h, view, search) {
  h.w.sdView = view || 'reports';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = search || '';
  h.w.sdDirTab = 'interstore';
  h.w.loadStockDiff(); await settle();
}
const ov = h => h.doc.getElementById('diff-submit-ov');
const val = (h, id) => { const e = h.doc.getElementById(id); return e ? e.value : null; };
const toasts = h => h.calls.toast.join(' | ');
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const repBody = h => { const p = repPosts(h)[0]; if (!p) return null; return Array.isArray(p.body) ? p.body[0] : p.body; };

async function setDir(h, dir) {
  const sel = h.doc.getElementById('diff-direction');
  if (sel.value !== dir) { sel.value = dir; fire(h.w, sel, 'change'); await settle(); }
}
/* Попълва междускладова бланка с един ред — без ИД (тестът го задава). */
async function openInterstore(h) {
  h.w.openDiffSubmitModal(); await settle();
  await setDir(h, 'interstore');
  h.doc.getElementById('diff-counterpart').value = WH;
  const st = h.doc.getElementById('diff-store'); if (st && !st.value) st.value = 'Петрич';
  const r = h.doc.querySelector('#diff-items .diff-item-row');
  r.querySelector('.di-sap').value = '87790';
  r.querySelector('.di-name').value = 'КАПАК';
  r.querySelector('.di-qty').value = '3';
  r.querySelector('.di-qty-real').value = '1';
  r.querySelector('.di-cat').value = 'undelivered';
}
async function submit(h) { realClick(h.w, btn(ov(h), 'Подай бланка')); await settle(); }

(async function run() {

  section('1. Междускладова без ИД / с нецифров ИД — не се подава');
  {
    const h = env(U.mgr);
    await openInterstore(h);
    ok('полето „ИД №“ го има при междускладов', !!h.doc.getElementById('diff-outbound'));
    await submit(h);
    ok('без ИД: няма POST', repPosts(h).length === 0, toasts(h));
    ok('без ИД: toast „Впиши ИД №…“', h.calls.toast.some(t => t.indexOf('Впиши ИД №') === 0), toasts(h));

    h.calls.toast.length = 0;
    h.doc.getElementById('diff-outbound').value = '804 78143';
    await submit(h);
    ok('интервал вътре: няма POST', repPosts(h).length === 0, toasts(h));
    ok('интервал вътре: toast „само цифри“', h.calls.toast.some(t => t.indexOf('ИД №: само цифри') === 0), toasts(h));

    h.calls.toast.length = 0;
    h.doc.getElementById('diff-outbound').value = '   ';
    await submit(h);
    ok('само интервали: няма POST и „Впиши ИД №“', repPosts(h).length === 0 && h.calls.toast.some(t => t.indexOf('Впиши ИД №') === 0), toasts(h));
  }

  section('2. С ИД — POST носи outbound_doc и document_number поотделно');
  {
    const h = env(U.mgr);
    await openInterstore(h);
    h.doc.getElementById('diff-outbound').value = '  80478143  ';
    h.doc.getElementById('diff-docnum').value = '180514303';
    await submit(h);
    const b = repBody(h);
    ok('има POST', repPosts(h).length === 1, toasts(h));
    ok('outbound_doc = „80478143“ (интервалите отрязани)', !!b && b.outbound_doc === '80478143', b && JSON.stringify(b.outbound_doc));
    ok('document_number = „180514303“', !!b && b.document_number === '180514303', b && b.document_number);
  }
  {
    const h = env(U.mgr);
    await openInterstore(h);
    const ob = h.doc.getElementById('diff-outbound');
    ob.value = '12345678'; fire(h.w, ob, 'input');
    const warn = h.doc.getElementById('diff-outbound-warn');
    ok('ИД не е 80… → жълто предупреждение', !!warn && warn.textContent.indexOf('започва с 80') >= 0, warn && warn.textContent);
    ob.value = '80478143'; fire(h.w, ob, 'input');
    ok('ИД 80… → без предупреждение', warn.textContent === '', warn.textContent);
    ob.value = '12345678'; fire(h.w, ob, 'input');
    await submit(h);
    ok('… но POST минава (не спира)', repPosts(h).length === 1, toasts(h));
    ok('… с ИД 12345678', repBody(h) && repBody(h).outbound_doc === '12345678', repBody(h) && repBody(h).outbound_doc);
    ok('… ВД празно → document_number „“', repBody(h) && repBody(h).document_number === '', repBody(h) && JSON.stringify(repBody(h).document_number));
  }

  section('3. Доставчик и сторна — без полето и без проверката');
  {
    const h = env(U.mgr);
    h.w.openDiffSubmitModal(); await settle();
    const lbl = () => h.doc.getElementById('diff-docnum-label').textContent;
    ok('междускладов: етикет „ВД №…“', lbl().indexOf('ВД №') === 0, lbl());
    h.doc.getElementById('diff-outbound').value = '80478143';
    await setDir(h, 'supplier');
    ok('доставчик: полето „ИД №“ го няма', !h.doc.getElementById('diff-outbound'));
    ok('доставчик: етикет „Документ №“', lbl() === 'Документ №', lbl());
    ok('доставчик: подсказката е старата', h.doc.getElementById('diff-docnum').getAttribute('placeholder').indexOf('4600179694') >= 0);
    await setDir(h, 'wrong_receipt');
    ok('сторна: полето „ИД №“ го няма', !h.doc.getElementById('diff-outbound'));
    ok('сторна: етикет „Документ №“', lbl() === 'Документ №', lbl());
    await setDir(h, 'interstore');
    ok('обратно в междускладов: ИД е запазен', val(h, 'diff-outbound') === '80478143', val(h, 'diff-outbound'));
  }
  {
    const h = env(U.mgr);
    h.w.openDiffSubmitModal(); await settle();
    await setDir(h, 'supplier');
    const cp = h.doc.getElementById('diff-counterpart');
    if (!Array.prototype.some.call(cp.options, o => o.value === 'ТЕСИ ООД')) cp.innerHTML = '<option>ТЕСИ ООД</option>';
    cp.value = 'ТЕСИ ООД';
    const st = h.doc.getElementById('diff-store'); if (st && !st.value) st.value = 'Петрич';
    h.doc.getElementById('diff-order-num').value = '4100135756';
    h.doc.getElementById('diff-docnum').value = '180486328';
    h.w.diffPendingPhotos.push({ url: 'https://x/stokova.pdf', name: 'stokova.pdf', kind: 'stokova' });
    const r = h.doc.querySelector('#diff-items .diff-item-row');
    r.querySelector('.di-sap').value = '87790'; r.querySelector('.di-name').value = 'КАПАК';
    r.querySelector('.di-qty').value = '3'; r.querySelector('.di-qty-real').value = '1';
    await submit(h);
    const b = repBody(h);
    ok('доставчик без ИД: POST минава', repPosts(h).length === 1, toasts(h));
    ok('доставчик: outbound_doc = null', !!b && b.outbound_doc === null, b && JSON.stringify(b.outbound_doc));
    ok('доставчик: document_number непроменен', !!b && b.document_number === '180486328');
  }

  section('4. Prefill — ИД отива в „ИД №“');
  {
    const h = env(U.mgr);
    h.w.openDiffSubmitModal({ direction: 'interstore', counterpart: WH, outbound_doc: '80478143', document_number: '180514303' }); await settle();
    ok('ИД от prefill', val(h, 'diff-outbound') === '80478143', val(h, 'diff-outbound'));
    ok('ВД от prefill', val(h, 'diff-docnum') === '180514303', val(h, 'diff-docnum'));
  }
  for (const [pd, expId, expVd, nm] of [
    ['80478143', '80478143', '', 'purchase_doc 80… → ИД'],
    [' 80478143 ', '80478143', '', 'purchase_doc 80… с интервали → ИД (trim)'],
    ['180514303', '', '180514303', 'purchase_doc 180… (ВД) → ВД, не ИД'],
    ['без документ', '', 'без документ', 'свободен текст → ВД / Документ №, не ИД']
  ]) {
    /* Бутонът „⚠️ Разлика“ в Товарни листи. */
    const L = { id: 'L1', warehouse: WH, list_date: '2026-11-20', status: 'sent', created_at: recent(), sent_at: recent() };
    const it = { id: 'i1', list_id: 'L1', position: 3, kind: 'pallet', pallet_no: 1, pallet_total: 2, purchase_doc: pd,
      clears_doc: null, store_name: 'Петрич', received: false, products: [{ sap_code: '111', product_name: 'АРТ', qty: 2, unit: 'бр.' }],
      created_at: recent() };
    const h = boot({
      modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'loading.js'],
      user: U.mgr, confirm: true,
      data: { loading_list_items: [it], loading_lists: [L], goods_transit: [], users: [], stores: [], contacts: [],
              transport_orders: [], stock_differences: [], differences_reports: [], stock_returns: [] }
    });
    h.w.sdData = []; h.w.diffReports = [];
    h.w.llStoreItems = [it]; h.w.llStoreLists = [L];
    h.w.llOpenDiffForItem('i1'); await settle();
    ok('товарен лист, ' + nm + ': ИД', val(h, 'diff-outbound') === expId, val(h, 'diff-outbound'));
    ok('товарен лист, ' + nm + ': ВД', val(h, 'diff-docnum') === expVd, val(h, 'diff-docnum'));
  }

  section('5. Картата — при склада ИД първи, при обекта ВД първи');
  const reps = [rep('r1'), rep('r2', { outbound_doc: null, document_number: '180999999' }),
                rep('r3', { outbound_doc: '80111222', document_number: '180333444' })];
  const lines = [line('a', 'r1'), line('b', 'r2'), line('c', 'r3')];
  {
    const h = env(U.wh, { reps, lines });
    await load(h);
    const c = h.doc.getElementById('diff-rep-r1');
    const t = c ? c.textContent : '';
    ok('склад: картата показва ИД 80478143', t.indexOf('ИД 80478143') >= 0, t.slice(0, 300));
    ok('склад: ИД е преди ВД', t.indexOf('ИД 80478143') >= 0 && t.indexOf('ИД 80478143') < t.indexOf('ВД 180514303'), t.slice(0, 300));
    const c2 = h.doc.getElementById('diff-rep-r2');
    ok('бланка без ИД: „Док. 180999999“ както преди', !!c2 && c2.textContent.indexOf('Док. 180999999') >= 0 && c2.textContent.indexOf('ИД ') < 0);
    const act = h.w.sdActionsIdHtml('r1');
    ok('„Действия на магазините“: ИД до обекта', act.indexOf('ИД 80478143') >= 0, act);
  }
  {
    const h = env(U.mgr, { reps, lines });
    await load(h);
    const c = h.doc.getElementById('diff-rep-r1');
    const t = c ? c.textContent : '';
    ok('обект: ВД е преди ИД', t.indexOf('ВД 180514303') >= 0 && t.indexOf('ВД 180514303') < t.indexOf('ИД 80478143'), t.slice(0, 300));
  }

  section('6. Търсене по ИД');
  {
    const h = env(U.wh, { reps, lines });
    await load(h, 'reports', '80111222');
    ok('бланки: търсене по ИД намира r3', !!h.doc.getElementById('diff-rep-r3'));
    ok('… и не показва r1', !h.doc.getElementById('diff-rep-r1'));
  }
  {
    const tl = [line('a', 'r1', { type: 'missing' }), line('c', 'r3', { type: 'missing' })];
    const h = env(U.admin, { reps, lines: tl });
    await load(h, 'rows', '');
    h.w.sdSearch = '80111222';
    const ids = h.w.sdTableRows().map(r => r.id);
    ok('редове: търсене по ИД намира реда на r3', ids.indexOf('c') >= 0 && ids.indexOf('a') < 0, JSON.stringify(ids));
    h.w.sdSearch = '180514303';
    const ids2 = h.w.sdTableRows().map(r => r.id);
    ok('редове: търсене по ВД намира реда на r1', ids2.indexOf('a') >= 0 && ids2.indexOf('c') < 0, JSON.stringify(ids2));
  }

  section('7. Excel — „ИД №“ до „Документ №“ само при междускладов');
  {
    const sup = rep('s1', { direction: 'supplier', counterpart: 'ТЕСИ ООД', outbound_doc: null, document_number: '180486328' });
    const h = env(U.mgr, { reps: reps.concat([sup]), lines: lines.concat([line('s', 's1', { supplier: 'ТЕСИ ООД' })]) });
    await load(h);
    const L1 = h.w.sdData.find(l => l.id === 'a'), LS = h.w.sdData.find(l => l.id === 's');
    const aoa = h.w.sdExcelRows([L1, LS]);
    const hd = aoa[0], iD = hd.indexOf('Документ №'), iI = hd.indexOf('ИД №');
    ok('колоната „ИД №“ е веднага след „Документ №“', iD >= 0 && iI === iD + 1, JSON.stringify(hd));
    ok('междускладов ред: ИД 80478143', aoa[1][iI] === '80478143', aoa[1][iI]);
    ok('междускладов ред: Документ № = ВД', aoa[1][iD] === '180514303', aoa[1][iD]);
    ok('доставчик ред: ИД празно', aoa[2][iI] === '', aoa[2][iI]);
    ok('всички редове с еднаква дължина', aoa.every(r => r.length === hd.length), aoa.map(r => r.length).join(','));
    const aoaS = h.w.sdExcelRows([LS]);
    ok('само доставчик: колоната я няма', aoaS[0].indexOf('ИД №') < 0, JSON.stringify(aoaS[0]));
  }

  section('8. Печат, имейл');
  {
    const h = env(U.wh, { reps, lines });
    await load(h);
    h.w.renderDiffPrint(h.w.diffReports.find(r => r.id === 'r1'));
    const pr = h.doc.getElementById('mod-print');
    const idRow = pr && pr.querySelector('tr.dp-id');
    ok('печат: ред „ИД №: 80478143“', !!idRow && idRow.textContent === 'ИД №:80478143', idRow && idRow.textContent);
    ok('печат: ред „ВД №: 180514303“', !!pr && pr.textContent.indexOf('ВД №:180514303') >= 0);
    h.w.renderDiffPrint(h.w.diffReports.find(r => r.id === 'r2'));
    ok('печат без ИД: „Документ №“ както преди, без „ИД №“',
      h.doc.getElementById('mod-print').textContent.indexOf('Документ №:180999999') >= 0 && !h.doc.querySelector('#mod-print tr.dp-id'));

    const r1 = h.w.diffReports.find(r => r.id === 'r1');
    const r1lines = h.w.sdData.filter(l => l.report_id === 'r1');
    const m = h.w.diffEmailModalHtml(r1, r1lines);
    ok('имейл: темата е по ИД', m.indexOf('value="80478143 - РАЗЛИКИ (Петрич)"') >= 0, (m.match(/id="de-subject" value="[^"]*"/) || [''])[0]);
    const body = h.w.diffEmailBodyHtml(r1, r1lines, '');
    ok('имейл: текстът носи ИД и ВД', body.indexOf('изходяща доставка (ИД) №80478143') >= 0 && body.indexOf('входяща (ВД) №180514303') >= 0, body.slice(0, 300));
    const r2 = h.w.diffReports.find(r => r.id === 'r2');
    const m2 = h.w.diffEmailModalHtml(r2, []);
    ok('имейл без ИД: темата по ВД както преди', m2.indexOf('value="180999999 - РАЗЛИКИ (Петрич)"') >= 0);
  }

  report();
})();
