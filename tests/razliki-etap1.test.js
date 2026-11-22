/* Разлики, етап 1 (среща 12.11.2026 — Цвети, Миглена, Виктор Филев, Тенчо).

   1. Чиповете по тип в изглед „Редове“: обектът (manager / sklad / info, не
      склад, не офис) НЕ вижда „❓ Липса“ и „🧾 Не са фактурирани“. Офисът и
      логистичните складове — и петте. Останал филтър 'missing' при обекта
      пада на „Всички типове“. Нарочно скрит контрол, не пропуск.
   2. Междускладова бланка: категорията е задължителна на всеки ред.
      Доставчик — без промяна. Предпопълнената бланка от товарен лист идва
      без категория — обектът я избира и подава.
   3. 🗑 на ред от новоподадена бланка за обекта: само собствен ред, без тип,
      без отговор на склада/обекта, статус 'new', без размяна, без тръгнало
      писмо до доставчика. Последният ред не се трие оттук (решение А,
      16.11.2026).

   Находки от проверката на живо (чатът, Пирдоп, 16.11.2026, на 2238ea6):
     а) 🗑 се рисуваше и на единствения ред на бланката;
     б) 🗑 се рисуваше на ред с коментар на контролера (resolution_comment)
        и други полета, които пише офисът — sdLineTouchedByOthers;
     в) падането на 'all' беше СЛЕД sdTableRows — първото прерисуване
        показваше само скрития тип под „Всички типове“.

   Мутационна проверка (16.11.2026, след находките; всеки мутант върху
   stock-differences.js, файлът — върнат от копие; чистият код: exit 0, 88/88):
     М1  sdTypeChipHidden() винаги false (чиповете се връщат за обекта) → 11 ❌
     М2  проверката за категория важи и за supplier (if(true))          →  2 ❌
     М3  sdCanStoreDeleteLine() без warehouse_response                  →  2 ❌
     М4  предпазителят в sdStoreDeleteLine пуска последния ред          →  1 ❌
     М5  без проверката за размяна                                      →  2 ❌
     М6  без проверката за тръгнало писмо до доставчика                 →  1 ❌
     М7  без падането на „Всички типове“                                →  8 ❌
     М8  🗑 и на единствения ред (находка а)                            →  2 ❌
     М9  без sdLineTouchedByOthers (находка б)                          →  6 ❌
     М9б само resolution_comment не брои (находка б, примерът на живо)  →  1 ❌
     М10 падането след sdTableRows — старото място (находка в)          →  4 ❌
   И единадесетте — exit 1.

   Етап 2 на Разлики (16.11.2026): обектът вижда само чакащите Заприхождаване/Връщане — очакванията за обекта са сменени нарочно.
   (§2 и §3: „редовете остават в Всички типове“ → „при обекта не се виждат“;
   чиповете остават скрити — непроменено.)

   Пускане:  node tests/razliki-etap1.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const WH    = { email: 'tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: 'Логистичен склад Търговище' };
const VIEWER = { email: 'sn@temax.bg', display_name: 'Снабдяване ЦО', role: 'supply', store_name: 'Централен офис' };
const OTHER = { email: 'montana@temax.bg', display_name: 'Управител Монтана', role: 'manager', store_name: 'Монтана' };

function line(o) {
  return Object.assign({
    store_name: 'Враца', supplier: 'Логистичен склад Търговище', material_code: '111',
    /* 22.11.2026 (razliki-co-findings т.3): обектът трие само ред, подаден от
       потребител на обекта — created_by = display_name на такъв. */
    created_by: 'Управител Враца',
    material_name: 'АРТИКУЛ', quantity: 1, quantity_received: 0, comment: null,
    resolution_comment: null, attachments: [], difference_category: 'undelivered', unit: 'бр.',
    status: 'new', type: null, warehouse_response: null, store_response: null,
    created_at: '2026-11-15T08:00:00Z'
  }, o);
}
const REP = { id: 'rep-1', direction: 'interstore', store_name: 'Враца', counterpart: 'Логистичен склад Търговище',
  document_number: '180486328', doc_date: '2026-11-15', submitted_by: 'Управител Враца', general_comment: '',
  photos: [], reviewed: false, email_pending: false, created_at: '2026-11-15T08:00:00Z' };

/* Решени редове от петте типа — за изгледа „Редове“. */
const RESOLVED = [
  line({ id: 'r-w', report_id: 'rep-x', type: 'writein', status: 'pending', material_name: 'ЗАПРИХ' }),
  line({ id: 'r-r', report_id: 'rep-x', type: 'return', status: 'pending', material_name: 'ВРЪЩ' }),
  line({ id: 'r-m', report_id: 'rep-x', type: 'missing', status: 'pending', material_name: 'ЛИПСА-РЕД' }),
  line({ id: 'r-n', report_id: 'rep-x', type: 'not_invoiced', status: 'pending', material_name: 'НЕФАКТ-РЕД' })
];
const REP_X = Object.assign({}, REP, { id: 'rep-x', reviewed: true, counterpart: 'Логистичен склад Търговище' });

function env(user, o) {
  o = o || {};
  const lines = o.lines || [];
  const reps = o.reps || [REP];
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: o.confirm === undefined ? true : o.confirm,
    fail: o.fail,
    data: { stock_differences: lines, differences_reports: reps, stock_returns: [],
      stock_diff_swaps: o.swaps || [], transport_orders: [], users: [], product_catalog: [] }
  });
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reps));
  h.w.sdSwaps = JSON.parse(JSON.stringify(o.swaps || []));
  /* Подателите на обекта — както ги чете sdLoadStoreSubmitters (22.11.2026). */
  h.w.sdStoreSubmitters = { store: 'Враца', names: { 'Управител Враца': 1 } };
  h.w.transportOrders = [];
  h.w.sdDirTab = 'interstore';
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = o.typeFilter || 'all';
  return h;
}
const typeChips = doc => Array.from(doc.querySelectorAll('#mod-stock-diff button[onclick*="setSDTypeFilter"]'));
const chipKeys = doc => typeChips(doc).map(b => b.dataset.f);

(async function run() {

  section('1. Чиповете по тип — обект / admin / склад / ЦО зрител');
  for (const [who, u, exp] of [
    ['обект (manager)', STORE, ['all', 'writein', 'return']],
    ['обект (sklad)', Object.assign({}, STORE, { role: 'sklad' }), ['all', 'writein', 'return']],
    ['обект (info)', Object.assign({}, STORE, { role: 'info' }), ['all', 'writein', 'return']],
    ['admin', ADMIN, ['all', 'writein', 'return', 'missing', 'not_invoiced']],
    ['логистичен склад', WH, ['all', 'writein', 'return', 'missing', 'not_invoiced']],
    ['ЦО зрител', VIEWER, ['all', 'writein', 'return', 'missing', 'not_invoiced']]
  ]) {
    const h = env(u, { lines: RESOLVED, reps: [REP_X] });
    h.w.sdView = 'rows';
    if (guard(who + ': renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      ok(who + ': чипове ' + exp.join(','), JSON.stringify(chipKeys(h.doc)) === JSON.stringify(exp), JSON.stringify(chipKeys(h.doc)));
    }
    h.close();
  }

  section('2. Обектът: редовете „Липса“ / „Не са фактурирани“ НЕ се виждат (етап 2)');
  {
    const h = env(STORE, { lines: RESOLVED, reps: [REP_X] });
    h.w.sdView = 'rows';
    h.w.renderStockDiff();
    const t = h.doc.getElementById('mod-stock-diff').textContent;
    ok('редът „Липса“ НЕ е в таблицата', t.indexOf('ЛИПСА-РЕД') < 0);
    ok('редът „Не са фактурирани“ НЕ е в таблицата', t.indexOf('НЕФАКТ-РЕД') < 0);
    h.close();
  }

  section('3. Обект със запомнен филтър — пада на „Всички типове“');
  for (const f of ['missing', 'not_invoiced']) {
    const h = env(STORE, { lines: RESOLVED, reps: [REP_X], typeFilter: f });
    h.w.sdView = 'rows';
    h.w.renderStockDiff();
    ok('[' + f + '] sdTypeFilter = all', h.w.sdTypeFilter === 'all', h.w.sdTypeFilter);
    const act = typeChips(h.doc).filter(b => /#0f172a/.test(b.getAttribute('style') || '') && /background:#0f172a/.test(b.getAttribute('style')));
    ok('[' + f + '] активният чип е „Всички типове“', act.length === 1 && act[0].dataset.f === 'all', act.map(b => b.dataset.f).join(','));
    /* ПЪРВОТО прерисуване — таблицата, не само променливата (Пирдоп, 16.11.2026:
       падането беше след sdTableRows и под „Всички типове“ стоеше само скритият тип). */
    const trs = Array.from(h.doc.querySelectorAll('#sd-tbl-wrap tbody tr'));
    /* Етап 2: обектът вижда само чакащите „Заприхождаване“ / „Връщане“. */
    const names = ['ЗАПРИХ', 'ВРЪЩ'];
    ok('[' + f + '] таблицата: 2 реда при първото прерисуване', trs.length === 2, trs.length + ': ' + trs.map(t => t.textContent.slice(0, 30)).join(' | '));
    ok('[' + f + '] „Заприхождаване“ и „Връщане“ са в таблицата, „Липса“ / „Не са фактурирани“ — не',
      names.every(n => trs.some(t => t.textContent.indexOf(n) >= 0)) &&
      !trs.some(t => /ЛИПСА-РЕД|НЕФАКТ-РЕД/.test(t.textContent)));
    h.close();
  }
  {
    /* Офисът със същия филтър си го пази. */
    const h = env(ADMIN, { lines: RESOLVED, reps: [REP_X], typeFilter: 'missing' });
    h.w.sdView = 'rows';
    h.w.renderStockDiff();
    ok('admin: филтърът „Липса“ остава', h.w.sdTypeFilter === 'missing', h.w.sdTypeFilter);
    h.close();
  }

  /* ── Подаване ── */
  function formEnv(user) {
    const h = boot({
      modules: ['stock-returns.js', 'stock-differences.js'],
      user: user || STORE,
      data: { stock_differences: [], differences_reports: [Object.assign({}, REP, { id: 'r-new' })], stock_returns: [], product_catalog: [], suppliers: [] }
    });
    h.w.sdData = []; h.w.diffReports = [];
    return h;
  }
  async function pickCounterpart(h) {
    await ticks();
    const cp = h.doc.getElementById('diff-counterpart');
    if (cp.options.length > 1) cp.selectedIndex = 1;
    else { cp.innerHTML = '<option>ТЕСИ ООД</option>'; cp.value = 'ТЕСИ ООД'; }
  }
  const rowsOf = h => h.doc.querySelectorAll('#diff-items .diff-item-row');
  async function submit(h) {
    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка'));
    await ticks(); await ticks(); await ticks();
  }
  const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
  const linePosts = h => h.calls.post.filter(p => p.table === 'stock_differences');

  section('4. Междускладова бланка без категория → 0 POST-а и toast с номера на реда');
  {
    const h = formEnv();
    h.w.openDiffSubmitModal();
    h.doc.getElementById('diff-store').value = 'Враца';
    ok('посоката по подразбиране е междускладов', h.doc.getElementById('diff-direction').value === 'interstore');
    h.w.addDiffItemRow();
    const r = rowsOf(h);
    r[0].querySelector('.di-name').value = 'ЛАЙСНА'; r[0].querySelector('.di-qty').value = '2'; r[0].querySelector('.di-cat').value = 'excess';
    r[1].querySelector('.di-name').value = 'ЩУЦЕР'; r[1].querySelector('.di-qty').value = '1';
    await pickCounterpart(h);
    await submit(h);
    ok('0 POST-а', h.calls.post.length === 0, 'POST: ' + h.calls.post.length);
    ok('toast „Ред 2: избери категория“', h.calls.toast.some(t => t === 'Ред 2: избери категория'), h.calls.toast.join(' | '));
    ok('модалът остава отворен', !!h.doc.getElementById('diff-submit-ov'));
    /* Избира категорията → минава */
    r[1].querySelector('.di-cat').value = 'undelivered';
    await submit(h);
    ok('с категория → POST на бланката', repPosts(h).length === 1, h.calls.toast.join(' | '));
    ok('с категория → редовете с категориите си', linePosts(h).length === 1 &&
      JSON.stringify(linePosts(h)[0].body.map(l => l.difference_category)) === '["excess","undelivered"]',
      JSON.stringify(linePosts(h).map(p => p.body)));
    h.close();
  }
  {
    const h = formEnv();
    h.w.openDiffSubmitModal();
    h.doc.getElementById('diff-store').value = 'Враца';
    h.w.addDiffItemRow(); h.w.addDiffItemRow();
    const r = rowsOf(h);
    r[0].querySelector('.di-name').value = 'А';
    r[1].querySelector('.di-name').value = 'Б'; r[1].querySelector('.di-cat').value = 'excess';
    r[2].querySelector('.di-name').value = 'В';
    await pickCounterpart(h);
    await submit(h);
    ok('два реда без категория → „Редове 1, 3“', h.calls.toast.some(t => t === 'Редове 1, 3: избери категория'), h.calls.toast.join(' | '));
    ok('и 0 POST-а', h.calls.post.length === 0);
    h.close();
  }

  section('5. Бланка към доставчик без категория → POST както досега');
  {
    const h = formEnv();
    h.w.openDiffSubmitModal({ direction: 'supplier' });
    h.doc.getElementById('diff-store').value = 'Враца';
    await pickCounterpart(h);
    h.doc.getElementById('diff-order-num').value = '4100135756';
    h.doc.getElementById('diff-docnum').value = '180486328';
    if (h.doc.getElementById('diff-stokova-block')) h.w.diffPendingPhotos.push({ url: 'https://x/stokova.pdf', name: 'stokova.pdf', kind: 'stokova' }); /* етап 3: стоковата е задължителна */
    const r = rowsOf(h);
    r[0].querySelector('.di-name').value = 'ПЛАНКА'; r[0].querySelector('.di-qty').value = '3';
    ok('редът е без категория', r[0].querySelector('.di-cat').value === '');
    await submit(h);
    ok('POST на бланката', repPosts(h).length === 1 && repPosts(h)[0].body.direction === 'supplier', h.calls.toast.join(' | '));
    ok('без toast за категория', !h.calls.toast.some(t => /избери категория/.test(t)), h.calls.toast.join(' | '));
    h.close();
  }

  section('6. Предпопълнена бланка от товарен лист (без категория) — обектът я избира и подава');
  {
    const h = formEnv();
    h.w.openDiffSubmitModal({ direction: 'interstore', counterpart: 'Логистичен склад Търговище', document_number: '180486328',
      comment: 'Товарен лист', items: [{ sap: '900001', name: 'ПЛАНКА ЪГЛОВА', qty: 3, unit: 'бр.' }] });
    h.doc.getElementById('diff-store').value = 'Враца';
    await pickCounterpart(h);
    const sel = rowsOf(h)[0].querySelector('.di-cat');
    ok('селектът за категория е във формата', !!sel && sel.options.length > 1, sel && sel.options.length);
    await submit(h);
    ok('без категория → спира', h.calls.post.length === 0 && h.calls.toast.some(t => t === 'Ред 1: избери категория'), h.calls.toast.join(' | '));
    sel.value = 'undelivered';
    await submit(h);
    ok('след избор → подадена', repPosts(h).length === 1 && linePosts(h).length === 1, h.calls.toast.join(' | '));
    h.close();
  }

  /* ── 🗑 на ред ── */
  const L1 = line({ id: 'l-1', report_id: 'rep-1', material_name: 'ПЛАНКА ЪГЛОВА' });
  const L2 = line({ id: 'l-2', report_id: 'rep-1', material_name: 'ЩУЦЕР' });
  const delOf = (doc, id) => doc.querySelector('#diff-rep-rep-1 button[onclick*="sdStoreDeleteLine"][data-lid="' + id + '"]');
  function cardEnv(user, lines, o) {
    o = o || {};
    const h = env(user, Object.assign({ lines: lines }, o));
    h.w.sdView = 'reports';
    h.w.renderStockDiff();
    return h;
  }

  section('7. 🗑 се вижда / не се вижда');
  {
    const h = cardEnv(STORE, [L1, L2]);
    ok('картата е рендирана', !!h.doc.getElementById('diff-rep-rep-1'));
    ok('нов ред на собствения обект → 🗑', !!delOf(h.doc, 'l-1') && !!delOf(h.doc, 'l-2'));
    h.close();
  }
  for (const [why, l, u, extra] of [
    ['ред с отговор на склада', line({ id: 'l-1', report_id: 'rep-1', warehouse_response: 'sent' }), STORE],
    ['ред с отговор на обекта', line({ id: 'l-1', report_id: 'rep-1', store_response: 'no_stock' }), STORE],
    ['ред с type', line({ id: 'l-1', report_id: 'rep-1', type: 'writein', status: 'pending' }), STORE],
    ['ред със статус pending', line({ id: 'l-1', report_id: 'rep-1', status: 'pending' }), STORE],
    ['чужд обект', L1, OTHER],
    ['ЦО зрител', L1, VIEWER],
    ['ред с размяна', L1, STORE, { swaps: [{ id: 's-1', from_line_id: 'l-x', to_line_id: 'l-1', status: 'open' }] }]
  ]) {
    const h = cardEnv(u, [l, L2], extra);
    ok('няма 🗑: ' + why, !delOf(h.doc, 'l-1'));
    /* Празна проверка, ако картата изобщо я няма — затова и правилото направо. */
    const rl = h.w.sdData.find(x => x.id === 'l-1'), rr = h.w.diffReports[0];
    ok('  sdCanStoreDeleteLine = false: ' + why, h.w.sdCanStoreDeleteLine(rl, rr) === false);
    if (u !== OTHER) ok('  картата е на екрана: ' + why, !!h.doc.getElementById('diff-rep-rep-1'));
    h.close();
  }
  {
    /* Доставчик с тръгнало писмо → не; без писмо → да. */
    const repSup = Object.assign({}, REP, { direction: 'supplier', counterpart: 'ТЕСИ ООД' });
    const h = env(STORE, { lines: [L1, L2], reps: [Object.assign({}, repSup, { email_sent_at: '2026-11-15T09:00:00Z' })] });
    h.w.sdDirTab = 'supplier'; h.w.sdView = 'reports'; h.w.renderStockDiff();
    ok('доставчик, писмото е тръгнало → няма 🗑', !!h.doc.getElementById('diff-rep-rep-1') && !delOf(h.doc, 'l-1'));
    h.close();
    const h2 = env(STORE, { lines: [L1, L2], reps: [repSup] });
    h2.w.sdDirTab = 'supplier'; h2.w.sdView = 'reports'; h2.w.renderStockDiff();
    ok('доставчик без писмо → 🗑', !!delOf(h2.doc, 'l-1'));
    h2.close();
  }

  section('8. Истински клик → потвърждение с името → DELETE към точния id');
  {
    const h = cardEnv(STORE, [L1, L2]);
    realClick(h.w, delOf(h.doc, 'l-1'));
    await ticks(); await ticks();
    ok('потвърждението носи името на артикула', h.calls.confirm.length === 1 && h.calls.confirm[0].indexOf('ПЛАНКА ЪГЛОВА') >= 0, h.calls.confirm.join(' | '));
    ok('точно един DELETE', h.calls.del.length === 1, h.calls.del.join(' | '));
    ok('DELETE към stock_differences?id=eq.l-1', /\/stock_differences\?id=eq\.l-1$/.test(h.calls.del[0] || ''), h.calls.del[0]);
    ok('нищо по differences_reports', !h.calls.del.some(u => /differences_reports/.test(u)) && !h.calls.patch.some(p => p.table === 'differences_reports'));
    h.close();
  }
  {
    const h = cardEnv(STORE, [L1, L2], { confirm: false });
    realClick(h.w, delOf(h.doc, 'l-1'));
    await ticks();
    ok('отказ в потвърждението → 0 DELETE', h.calls.del.length === 0);
    h.close();
  }
  {
    const h = cardEnv(STORE, [L1, L2], { fail: { DELETE: { status: 403, body: { message: 'permission denied' } } } });
    realClick(h.w, delOf(h.doc, 'l-1'));
    await ticks(); await ticks(); await ticks(); await ticks();
    ok('грешка от базата → червен toast', h.calls.toast.some(t => /НЕ беше изтрит/.test(t)), h.calls.toast.join(' | '));
    ok('редът остава в данните', h.w.sdData.some(l => l.id === 'l-1'));
    ok('и на екрана', !!h.doc.getElementById('diff-rep-rep-1') && h.doc.getElementById('diff-rep-rep-1').textContent.indexOf('ПЛАНКА ЪГЛОВА') >= 0);
    h.close();
  }

  section('9. Последният ред на бланката не се трие оттук (решение А)');
  {
    /* Пирдоп, 16.11.2026: на единствения ред 🗑 не се рисува изобщо. */
    const h = cardEnv(STORE, [L1]);
    ok('картата е на екрана', !!h.doc.getElementById('diff-rep-rep-1'));
    ok('единствен ред → няма 🗑', !delOf(h.doc, 'l-1'));
    ok('sdCanStoreDeleteLine = false', h.w.sdCanStoreDeleteLine(h.w.sdData[0], h.w.diffReports[0]) === false);
    /* Предпазителят — пряко извикване. */
    h.w.sdStoreDeleteLine('l-1');
    await ticks();
    ok('пряко извикване → 0 DELETE', h.calls.del.length === 0, h.calls.del.join(' | '));
    ok('без потвърждение', h.calls.confirm.length === 0);
    ok('toast „последният ред … обадете се на офиса“', h.calls.toast.some(t => /последният ред на бланката/.test(t)), h.calls.toast.join(' | '));
    h.close();
  }

  section('10. По реда е действал офисът или складът → няма 🗑');
  for (const [why, extra] of [
    ['коментар на контролера (resolution_comment)', { resolution_comment: 'Това нали го бяхте пуснали като разлика?' }],
    ['решение, върнато на празно (resolved_by)', { resolved_by: 'Цветелина Тенева', resolved_at: '2026-11-15T09:00:00Z' }],
    ['кредитно (credit_note_issued)', { credit_note_issued: true }],
    ['поръчка за връщане (return_order_number)', { return_order_number: '4200017097' }],
    ['коментар на склада (warehouse_comment)', { warehouse_comment: 'проверяваме' }],
    ['размяна по реда (swap_id)', { swap_id: 's-9' }]
  ]) {
    const h = cardEnv(STORE, [Object.assign({}, L1, extra), L2]);
    ok('няма 🗑: ' + why, !!h.doc.getElementById('diff-rep-rep-1') && !delOf(h.doc, 'l-1'));
    ok('  а на съседния непипнат ред има', !!delOf(h.doc, 'l-2'));
    h.close();
  }
  {
    /* Празни стойности не броят: '' / интервал / false / null. */
    const h = cardEnv(STORE, [Object.assign({}, L1, { resolution_comment: '  ', credit_note_issued: false, return_order_number: '', warehouse_comment: null }), L2]);
    ok('празни полета → 🗑 си стои', !!delOf(h.doc, 'l-1'));
    h.close();
  }

  report();
})();
