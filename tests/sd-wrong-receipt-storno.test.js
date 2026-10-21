/* „🧾 Сторнирано" — решение по ред от „Сторна по грешен прием"
   (differences_reports.direction='wrong_receipt'), 21.10.2026.

   Цветелина не можеше да приключи тези бланки: бланката излиза от „за
   преглед" само когато всеки ред има тип, а нито Заприх./Връщане/Липса
   пасва на сторно. Решение на Тенчо (19-20.10.2026): един бутон
   „Сторнирано" и БЕЗ имейл до доставчика.

   а) Цвети/admin на сторно бланка вижда САМО „Сторнирано" (<button>)
   б) клик → PATCH stock_differences {type:'storno', status:'taken',
      completed_by/at}, после PATCH differences_reports с ТОЧНО {reviewed:true}
   в) бланка с 2 реда: след първия клик не е прегледана, след втория — е
   г) доставчикова бланка: трите бутона както преди, email_pending=true
   д) магазинът вижда „✓ 🧾 Сторнирано" и „ИЗЧИСТЕНА", без бутони
   е) провал на PATCH-а за бланката → червеното съобщение, не „✅"
   ж) checklistWrongReceiptValue — същият брой преди и след решаването
   з) модалът за редакция познава storno (не изтрива типа тихо)
   и) ✉️ до доставчика (само <button>): при сторно го няма нито в горната
      карта, нито в „Решени редове"; при доставчик го има и на двете места

   Мутационна проверка (21.10.2026, всяка поотделно върху stock-differences.js,
   тестът пада с exit 1 при всяка):
     1. storno без status='taken' (payload остава 'pending')       → пада (б)
     2. email_pending остава за wrong_receipt (условието махнато)   → пада (б)
     3. бутонът „Сторнирано" и при доставчикова бланка              → пада (г)
     4. без storno опцията в селекта на модала                       → пада (з)
     5. без storno в TYPE_LABELS на diffLineResolveButtons            → пада (д)
     6. ✉️ в горната карта и при сторно (условието по посока махнато) → пада (и)
     7. ✉️ в „Решени редове" и при сторно (условието махнато)         → пада (и)

   Пускане:  node tests/sd-wrong-receipt-storno.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

function row(o) {
  return Object.assign({
    store_name: 'Троян', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ',
    quantity: 10, quantity_received: 10, quantity_supplier_doc: null,
    order_number: '4100135756', confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'unbilled_received', unit: 'бр.', status: 'new', type: null,
    resolved_by: null, resolved_at: null, completed_by: null, completed_at: null,
    store_corrected_at: null, warehouse_response: null, warehouse_comment: null,
    store_response: null
  }, o);
}
const NOW_ISO = new Date().toISOString();
function rep(o) {
  return Object.assign({
    store_name: 'Троян', counterpart: 'ТЕСИ ООД', document_number: '5000123456',
    doc_date: '2026-10-12', submitted_by: 'Склад Троян', general_comment: '',
    photos: [], reviewed: false, email_pending: false, email_sent_at: null,
    email_skipped_at: null, created_at: NOW_ISO
  }, o);
}

/* Реалната форма от базата (21.10.2026, 6 бланки): 1 ред, unbilled_received, type null. */
const REP_WR1 = rep({ id: 'rep-wr1', direction: 'wrong_receipt' });
/* Кърджали 01.10: quantity е null, получено 6 — празното количество не спира решението. */
const WR1 = row({ id: 'wr-1', report_id: 'rep-wr1', material_name: 'ЛАМИНАТ 8ММ', quantity: null, quantity_received: 6 });
/* Две позиции в една бланка — за (в). */
const REP_WR2 = rep({ id: 'rep-wr2', direction: 'wrong_receipt', store_name: 'Враца' });
const WR2A = row({ id: 'wr-2a', report_id: 'rep-wr2', store_name: 'Враца', material_name: 'ПЛОЧКИ А' });
const WR2B = row({ id: 'wr-2b', report_id: 'rep-wr2', store_name: 'Враца', material_name: 'ПЛОЧКИ Б' });
/* Доставчикова — за (г). */
const REP_SUP = rep({ id: 'rep-sup', direction: 'supplier' });
const SUP1 = row({ id: 'sup-1', report_id: 'rep-sup', difference_category: 'excess', quantity: 10, quantity_received: 12 });

const CVETI = { id: 'u-c', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'accounting', store_name: 'Централен офис' };
const ADMIN = { id: 'u-a', email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORE = { id: 'u-s', email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян', assigned_stores: [] };

function env(user, lines, reps, over) {
  over = over || {};
  const h = boot(Object.assign({
    modules: ['transport.js', 'bulletin.js', 'checklist.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    confirm: true,
    data: {
      stock_differences: lines, differences_reports: reps,
      stock_returns: [], transport_orders: [], users: [],
      stores: [{ name: 'Троян' }, { name: 'Враца' }], contacts: [{ name: 'ТЕСИ ООД' }]
    }
  }, over));
  h.w.sdData = JSON.parse(JSON.stringify(lines));
  h.w.diffReports = JSON.parse(JSON.stringify(reps));
  h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = over.dirTab || 'wrong_receipt';
  h.w.sdView = over.view || 'reports';
  /* loadStockDiff() би презаредил sdData от статичните данни и би изтрил
     локалното решение — тук се проверява самият запис, не презареждането. */
  h.w.loadStockDiff = function () { h.loads = (h.loads || 0) + 1; };
  h.w.invalidateStoreCaches();
  h.w.invalidateSuppliersCache();
  return h;
}
function buttonsIn(el) {
  return Array.prototype.slice.call(el ? el.querySelectorAll('button') : []);
}
/* Бутоните за решение на ред — само тези, които викат resolveDiffLine. */
function resolveBtns(doc) {
  return buttonsIn(doc.getElementById('mod-stock-diff')).filter(b => /resolveDiffLine\(/.test(b.getAttribute('onclick') || ''));
}

(async function run() {

  section('а) Цвети на сторно бланка вижда САМО „Сторнирано"');
  for (const u of [CVETI, ADMIN]) {
    const { w, doc } = env(u, [WR1], [REP_WR1]);
    guard('рендер (' + u.role + ')', () => w.renderStockDiff());
    const rb = resolveBtns(doc);
    ok(u.role + ': точно един бутон за решение', rb.length === 1, rb.map(b => b.textContent).join(' | '));
    ok(u.role + ': той е „🧾 Сторнирано"', rb[0] && rb[0].textContent.indexOf('🧾 Сторнирано') >= 0);
    const all = buttonsIn(doc.getElementById('mod-stock-diff')).map(b => b.textContent);
    ok(u.role + ': няма <button> Заприх./Връщане/Липса',
      !all.some(t => /Заприх\.|↩️ Връщане|❓ Липса|Не са фактурирани/.test(t)), all.join(' | '));
  }

  section('б) клик → PATCH реда (storno/taken) → PATCH бланката с ТОЧНО {reviewed:true}');
  {
    const { w, doc, calls } = env(CVETI, [WR1], [REP_WR1]);
    w.renderStockDiff();
    const b = resolveBtns(doc)[0];
    if (ok('бутонът е намерен', !!b)) {
      realClick(w, b, 'Сторнирано');
      await ticks(20);
      const lp = calls.patch.filter(p => p.table === 'stock_differences');
      const body = lp[0] && lp[0].body || {};
      ok('един PATCH към stock_differences', lp.length === 1, JSON.stringify(lp));
      ok('по id на реда', lp[0] && /id=eq\.wr-1/.test(lp[0].url));
      ok("type='storno'", body.type === 'storno', JSON.stringify(body));
      ok("status='taken'", body.status === 'taken', body.status);
      ok('resolved_by/at', body.resolved_by === 'Ц. Тенева' && !!body.resolved_at, JSON.stringify(body));
      ok('completed_by/at', body.completed_by === 'Ц. Тенева' && !!body.completed_at, JSON.stringify(body));
      ok('без quantity (autoQty е само за Липса/Връщане)', !('quantity' in body));
      const rp = calls.patch.filter(p => p.table === 'differences_reports');
      ok('един PATCH към differences_reports', rp.length === 1, JSON.stringify(rp));
      ok('тялото е ТОЧНО {reviewed:true}', rp[0] && JSON.stringify(rp[0].body) === '{"reviewed":true}', rp[0] && JSON.stringify(rp[0].body));
      ok('нищо в „За връщане"', calls.post.filter(p => p.table === 'stock_returns').length === 0 && calls.del.length === 0);
      ok('„✅ Решено — бланката е напълно прегледана!"', calls.toast.some(t => /напълно прегледана/.test(t)), calls.toast.join(' | '));
      const line = w.sdData.find(x => x.id === 'wr-1');
      ok('локално: тип и статус', line.type === 'storno' && line.status === 'taken');
      ok('sdReviewedPatch за wrong_receipt без email_pending',
        JSON.stringify(w.sdReviewedPatch('rep-wr1')) === '{"reviewed":true}');
    }
  }

  section('в) бланка с 2 реда: прегледана чак след втория');
  {
    const { w, doc, calls } = env(CVETI, [WR2A, WR2B], [REP_WR2]);
    w.renderStockDiff();
    let rb = resolveBtns(doc);
    ok('два бутона „Сторнирано"', rb.length === 2 && rb.every(b => /Сторнирано/.test(b.textContent)));
    realClick(w, rb.find(b => b.dataset.id === 'wr-2a'), 'Сторнирано 1');
    await ticks(20);
    ok('след първия: няма PATCH към бланката', calls.patch.filter(p => p.table === 'differences_reports').length === 0);
    ok('след първия: „✅ Записано!"', calls.toast.some(t => t === '✅ Записано!'), calls.toast.join(' | '));
    w.renderStockDiff();
    rb = resolveBtns(doc);
    const second = rb.find(b => b.dataset.id === 'wr-2b');
    ok('вторият ред още има бутон', !!second);
    /* решеният ред е свит до чип + „смени" */
    const chipTxt = doc.getElementById('mod-stock-diff').textContent;
    ok('решеният ред е чип „✓ 🧾 Сторнирано"', chipTxt.indexOf('✓ 🧾 Сторнирано') >= 0);
    if (second) {
      realClick(w, second, 'Сторнирано 2');
      await ticks(20);
      const rp = calls.patch.filter(p => p.table === 'differences_reports');
      ok('след втория: бланката е прегледана', rp.length === 1 && JSON.stringify(rp[0].body) === '{"reviewed":true}', JSON.stringify(rp));
    }
  }

  section('г) доставчикова бланка — без промяна');
  {
    const { w, doc } = env(CVETI, [SUP1], [REP_SUP], { dirTab: 'supplier' });
    w.renderStockDiff();
    const txt = resolveBtns(doc).map(b => b.textContent);
    ok('четирите бутона на доставчика', txt.length === 4 &&
      /Заприх/.test(txt[0]) && /Връщане/.test(txt[1]) && /Липса/.test(txt[2]) && /Не са фактурирани/.test(txt[3]), txt.join(' | '));
    ok('няма „Сторнирано"', !txt.some(t => /Сторнирано/.test(t)));
    ok('sdReviewedPatch пак носи email_pending=true',
      JSON.stringify(w.sdReviewedPatch('rep-sup')) === '{"reviewed":true,"email_pending":true}');
    /* междускладова — без промяна */
    w.diffReports.push(rep({ id: 'rep-int', direction: 'interstore' }));
    ok('междускладова: само reviewed', JSON.stringify(w.sdReviewedPatch('rep-int')) === '{"reviewed":true}');
  }

  section('д) магазинът вижда „✓ 🧾 Сторнирано" и „ИЗЧИСТЕНА", без бутони');
  {
    const done = row({ id: 'wr-1', report_id: 'rep-wr1', type: 'storno', status: 'taken',
      resolved_by: 'Ц. Тенева', resolved_at: NOW_ISO, completed_by: 'Ц. Тенева', completed_at: NOW_ISO });
    const repDone = rep({ id: 'rep-wr1', direction: 'wrong_receipt', reviewed: true });
    const { w, doc } = env(STORE, [done], [repDone], { view: 'rows' });
    guard('рендер на магазина', () => w.renderStockDiff());
    const body = doc.getElementById('sd-rows');
    ok('редът е в „Решени редове" под „Всички типове"', !!body && body.querySelectorAll('tr').length === 1);
    ok('етикет „🧾 Сторнирано"', !!body && body.textContent.indexOf('🧾 Сторнирано') >= 0);
    ok('бадж „ИЗЧИСТЕНА"', !!body && body.textContent.indexOf('ИЗЧИСТЕНА') >= 0, body && body.textContent);
    ok('чипът „Приключени" го брои', /Приключени \(1\)/.test(doc.getElementById('mod-stock-diff').textContent));
    ok('без бутони за решение и без ✏️', resolveBtns(doc).length === 0 &&
      !buttonsIn(body).some(b => /sdMarkTaken|openSDModal/.test(b.getAttribute('onclick') || '')));
    ok('diffLineResolveButtons → „✓ 🧾 Сторнирано"', w.diffLineResolveButtons(w.sdData[0]).indexOf('✓ 🧾 Сторнирано') >= 0);
    ok('печатът: „ИЗЧИСТЕНА" и „Сторнирано"', (function () {
      try { w.loadDiffPrint('rep-wr1'); } catch (e) { return false; }
      const p = doc.getElementById('mod-print');
      return !!p && /ИЗЧИСТЕНА/.test(p.textContent) && /Сторнирано/.test(p.textContent);
    })());
  }

  section('е) провал на PATCH-а за бланката → червеното съобщение');
  {
    const { w, doc, calls } = env(CVETI, [WR1], [REP_WR1], { fail: { PATCH: /differences_reports/ } });
    w.renderStockDiff();
    realClick(w, resolveBtns(doc)[0], 'Сторнирано');
    await ticks(20);
    const last = calls.toast[calls.toast.length - 1] || '';
    ok('„НЕ е отбелязана"', /бланката НЕ е отбелязана/.test(last), calls.toast.join(' | '));
    ok('без „напълно прегледана"', !calls.toast.some(t => /напълно прегледана/.test(t)));
  }

  section('ж) Чек лист „Сторна по грешни приеми" — броят не се мени');
  {
    const lines = [WR1, WR2A, WR2B];
    const reps = [REP_WR1, REP_WR2];
    const { w } = env(ADMIN, lines, reps);
    const now = new Date();
    w.checklistYear = now.getFullYear();
    w.checklistWeek = w.weekNum(now);
    const before = await w.checklistWrongReceiptRows();
    const vBefore = before ? w.checklistWrongReceiptValue(before) : null;
    lines.forEach(l => { l.type = 'storno'; l.status = 'taken'; });
    reps.forEach(r => { r.reviewed = true; });
    const after = await w.checklistWrongReceiptRows();
    const vAfter = after ? w.checklistWrongReceiptValue(after) : null;
    ok('стойност преди = 2/3', vBefore === '2/3', vBefore);
    ok('същата след решаването', vAfter === vBefore, vBefore + ' → ' + vAfter);
    lines.forEach(l => { l.type = null; l.status = 'new'; });
    reps.forEach(r => { r.reviewed = false; });
  }

  section('з) модалът за редакция познава storno');
  {
    const done = row({ id: 'wr-1', report_id: 'rep-wr1', type: 'storno', status: 'taken' });
    const repDone = rep({ id: 'rep-wr1', direction: 'wrong_receipt', reviewed: true });
    const { w, doc } = env(CVETI, [done], [repDone], { view: 'rows' });
    w.renderStockDiff();
    guard('openSDModal', () => w.openSDModal('wr-1'));
    const sel = doc.getElementById('sd-type');
    ok('селектът е на „storno"', !!sel && sel.value === 'storno', sel && sel.value);
    const st = doc.getElementById('sd-status');
    ok('статусът е „Изчистена"', !!st && st.options[st.selectedIndex].textContent.indexOf('ИЗЧИСТЕНА') >= 0,
      st && st.options[st.selectedIndex].textContent);
    /* доставчиков ред — опцията я няма */
    const h2 = env(CVETI, [Object.assign({}, SUP1, { type: 'writein', status: 'pending' })], [REP_SUP], { dirTab: 'supplier', view: 'rows' });
    h2.w.renderStockDiff();
    h2.w.openSDModal('sup-1');
    const sel2 = h2.doc.getElementById('sd-type');
    ok('доставчиков ред: без опция storno', !!sel2 && !Array.prototype.some.call(sel2.options, o => o.value === 'storno'));
  }

  section('и) ✉️ до доставчика: при сторно няма на двете места, при доставчик има');
  {
    const emailBtns = doc => buttonsIn(doc.getElementById('mod-stock-diff'))
      .filter(b => /openDiffEmailModal\(/.test(b.getAttribute('onclick') || ''));
    /* горната карта — непрегледана бланка */
    const a = env(CVETI, [WR1], [REP_WR1]);
    a.w.renderStockDiff();
    ok('сторно, горна карта: няма ✉️', emailBtns(a.doc).length === 0, emailBtns(a.doc).map(b => b.textContent).join(' | '));
    const b = env(CVETI, [SUP1], [REP_SUP], { dirTab: 'supplier' });
    b.w.renderStockDiff();
    ok('доставчик, горна карта: „✉️ Изпрати имейл" е там', emailBtns(b.doc).some(x => /Изпрати имейл/.test(x.textContent)));
    /* „Решени редове" */
    const doneWr = row({ id: 'wr-1', report_id: 'rep-wr1', type: 'storno', status: 'taken' });
    const c = env(CVETI, [doneWr], [rep({ id: 'rep-wr1', direction: 'wrong_receipt', reviewed: true })], { view: 'rows' });
    c.w.renderStockDiff();
    ok('сторно, „Решени редове": редът е там, ✉️ няма', !!c.doc.getElementById('sd-rows') && emailBtns(c.doc).length === 0,
      emailBtns(c.doc).map(x => x.textContent).join(' | '));
    const doneSup = Object.assign({}, SUP1, { type: 'writein', status: 'pending' });
    const d = env(CVETI, [doneSup], [rep({ id: 'rep-sup', direction: 'supplier', reviewed: true })], { dirTab: 'supplier', view: 'rows' });
    d.w.renderStockDiff();
    ok('доставчик, „Решени редове": ✉️ е там', emailBtns(d.doc).length === 1, String(emailBtns(d.doc).length));
  }

  report();
})();
