/* Разлики: бутон „🧾 Грешен прием" — магазинът подава „Сторна по грешен прием"
   за СВОЯ обект. (Решение на Цвети, 28.09.2026.)

   Досега тази посока подаваше само ЦО (canSubmitWrongReceipt: admin/accounting).
   canSubmitWrongReceipt се ползва на ДВЕ места и двете са за подаването
   (опцията в селекта и гейтът в submitDiffReport) — но ограничението „само за
   своя обект" важи само за магазина, затова правото му е отделна функция
   canStoreSubmitWrongReceipt (canSubmitDiff && !isGlobal = manager/sklad/info).

   Сторната се третират ЕДНАКВО, независимо кой ги е подал: справката
   (report.js) гледа само direction — заковано с двата файла, заредени заедно.

   Пускане:  node tests/wrong-receipt-store-submit.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks } = H;

const STORE = { email: 'radnevo@temax.bg', display_name: 'Склад Раднево',
  role: 'sklad', store_name: 'Раднево', assigned_stores: [] };
const MANAGER = { email: 'mgr.radnevo@temax.bg', display_name: 'Управител Раднево',
  role: 'manager', store_name: 'Раднево', assigned_stores: [] };
const ACCOUNTANT = { email: 'a.simeonova@temax.bg', display_name: 'А. Симеонова',
  role: 'accounting', store_name: 'Централен офис', assigned_stores: ['Раднево', 'Гоце Делчев'] };
/* Без право да подава бланки изобщо (canSubmitDiff е false). */
const SUPPLY = { email: 'supply@temax.bg', display_name: 'Снабдяване',
  role: 'supply', store_name: 'Централен офис', assigned_stores: [] };
const LOGI = { email: 'ls@temax.bg', display_name: 'ЛС Търговище',
  role: 'logistics', store_name: 'Логистичен склад Търговище', assigned_stores: [] };

/* „Базата": POST-натите бланки и редове се връщат при следващия GET, за да
   видим бланката в подтаба и в справката — както на живо. Една вече подадена
   от ЦО сторна (Гоце Делчев) е там отначало. */
function env(user) {
  let h;
  const reps = () => {
    const out = [{ id: 'rep-co', store_name: 'Гоце Делчев', direction: 'wrong_receipt', reviewed: false,
      counterpart: 'ТЕСИ ООД', submitted_by: 'А. Симеонова', created_at: '2026-09-20T08:00:00Z', photos: [] }];
    (h ? h.calls.post : []).filter(p => p.table === 'differences_reports').forEach((p, i) => {
      out.push(Object.assign({ id: 'rep-' + (i + 1), created_at: '2026-09-28T10:0' + i + ':00Z' }, p.body));
    });
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  };
  const lines = () => {
    const out = [];
    (h ? h.calls.post : []).filter(p => p.table === 'stock_differences').forEach((p, i) => {
      (Array.isArray(p.body) ? p.body : [p.body]).forEach((b, j) => out.push(Object.assign({ id: 'l-' + i + '-' + j }, b)));
    });
    return out;
  };
  h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'bulletin.js', 'report.js'],
    user: user, confirm: true,
    data: {
      differences_reports: (url) => {
        const all = reps();
        const m = /store_name=eq\.([^&]+)/.exec(url);
        return m ? all.filter(r => r.store_name === decodeURIComponent(m[1])) : all;
      },
      stock_differences: () => lines(),
      stock_returns: [], transport_orders: [], kasa_storno: [], kasa_zoborot: [],
      goods_transit: [], transport_pallets: [], app_settings: [],
      users: [{ store_name: 'Раднево' }, { store_name: 'Гоце Делчев' }],
      stores: [{ name: 'Раднево' }, { name: 'Гоце Делчев' }],
      bulletins: [], recurring_tasks: [], bulletin_tasks: [], task_completions: [], report_snapshots: []
    }
  });
  h.w.sdData = []; h.w.diffReports = reps(); h.w.transportOrders = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'supplier';
  h.w.invalidateStoreCaches(); h.w.invalidateSuppliersCache();
  h.w.loadAllSuppliers = () => Promise.resolve(['ТЕСИ ООД', 'КАМ-04']);
  h.w.renderStockDiff();
  return h;
}
const modBtn = (h, label) => btn(h.doc.getElementById('mod-stock-diff') || h.doc, label);
const reportPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const settle = () => new Promise(res => setTimeout(res, 60));

/* Попълва минимално валидна бланка и натиска „Подай бланка". */
async function fillAndSubmit(h, over) {
  over = over || {};
  const doc = h.doc;
  doc.getElementById('diff-counterpart').value = 'ТЕСИ ООД';
  doc.getElementById('diff-docnum').value = over.docnum || 'ФК-4600179694';
  doc.querySelector('#diff-items .di-name').value = over.name || 'ЛАЙСНА АЛ. 10ММ';
  doc.querySelector('#diff-items .di-qty').value = '3';
  if (over.store !== undefined) doc.getElementById('diff-store').value = over.store;
  realClick(h.w, btn(doc.getElementById('diff-submit-ov'), 'Подай бланка'));
  await settle(); await ticks();
}

(async function run() {

  section('а) Магазинер: бутон → форма с посока wrong_receipt → „Подай" → POST');
  {
    const h = env(STORE);
    const b = modBtn(h, '🧾 Грешен прием');
    if (ok('бутонът „🧾 Грешен прием" се вижда', !!b)) {
      ok('до „📝 Подай бланка"', !!modBtn(h, '📝 Подай бланка'));
      realClick(h.w, b);
      await ticks(); await ticks();
      const dir = h.doc.getElementById('diff-direction');
      ok('формата е с посока wrong_receipt', dir && dir.value === 'wrong_receipt', dir && dir.value);
      ok('надписът на насрещната страна е за доставчик',
        /доставчик/i.test((h.doc.getElementById('diff-counterpart-label') || {}).textContent || ''),
        (h.doc.getElementById('diff-counterpart-label') || {}).textContent);
      const store = h.doc.getElementById('diff-store');
      ok('обектът е заключен на неговия (Раднево)', store && store.type === 'hidden' && store.value === 'Раднево',
        store && (store.type + ':' + store.value));
      await fillAndSubmit(h);
      const p = reportPosts(h);
      if (ok('POST в differences_reports', p.length === 1, 'toast: ' + h.calls.toast.join(' | '))) {
        ok('direction = wrong_receipt', p[0].body.direction === 'wrong_receipt', JSON.stringify(p[0].body.direction));
        ok('store_name = Раднево', p[0].body.store_name === 'Раднево', JSON.stringify(p[0].body.store_name));
        ok('submitted_by = магазинерът', p[0].body.submitted_by === 'Склад Раднево', JSON.stringify(p[0].body.submitted_by));
        ok('reviewed = false (както всяка нова бланка)', p[0].body.reviewed === false);
      }
      ok('и редовете са записани', h.calls.post.some(x => x.table === 'stock_differences'));
    }
    /* Управителят е също магазин. */
    const m = env(MANAGER);
    ok('manager също вижда бутона', !!modBtn(m, '🧾 Грешен прием'));
  }

  section('б) Магазинер НЕ може да подаде за чужд обект (подправено поле)');
  {
    const h = env(STORE);
    realClick(h.w, modBtn(h, '🧾 Грешен прием'));
    await ticks(); await ticks();
    await fillAndSubmit(h, { store: 'Гоце Делчев' });
    ok('няма POST на бланка', reportPosts(h).length === 0, JSON.stringify(reportPosts(h).map(p => p.body)));
    ok('няма POST на редове', !h.calls.post.some(x => x.table === 'stock_differences'));
    ok('toast „само за твоя обект"', h.calls.toast.some(t => String(t).indexOf('само за твоя обект') >= 0),
      h.calls.toast.join(' | '));
  }

  section('в) accounting: без бутон, подава през селекта както досега — и за друг обект');
  {
    const h = env(ACCOUNTANT);
    ok('няма бутон „🧾 Грешен прием" (ЦО избира от селекта)', !modBtn(h, '🧾 Грешен прием'));
    realClick(h.w, modBtn(h, '📝 Подай бланка'));
    await ticks(); await ticks();
    const dir = h.doc.getElementById('diff-direction');
    ok('опцията wrong_receipt е в селекта', dir && !!dir.querySelector('option[value="wrong_receipt"]'));
    dir.value = 'wrong_receipt';
    h.w.updateDiffCounterpartLabel();
    await ticks(); await ticks();
    h.doc.getElementById('diff-store').value = 'Гоце Делчев';
    await fillAndSubmit(h);
    const p = reportPosts(h);
    ok('POST с wrong_receipt за Гоце Делчев', p.length === 1 && p[0].body.direction === 'wrong_receipt' &&
      p[0].body.store_name === 'Гоце Делчев', JSON.stringify(p.map(x => x.body)) + ' | ' + h.calls.toast.join(' | '));
  }

  section('г) Роли без право: без бутон, без опция, и гейтът спира');
  {
    for (const u of [SUPPLY, LOGI]) {
      const h = env(u);
      ok(u.role + ': няма бутон „🧾 Грешен прием"', !modBtn(h, '🧾 Грешен прием'));
      ok(u.role + ': canStoreSubmitWrongReceipt() е false', h.w.canStoreSubmitWrongReceipt() === false);
    }
    /* supply няма и canSubmitDiff — отваряме формата директно и подправяме. */
    const h = env(SUPPLY);
    ok('supply: canSubmitDiff() е false', h.w.canSubmitDiff() === false);
    h.w.openDiffSubmitModal();
    await ticks(); await ticks();
    const sel = h.doc.getElementById('diff-direction');
    ok('supply: опцията wrong_receipt я няма в селекта', !sel.querySelector('option[value="wrong_receipt"]'), sel.innerHTML);
    sel.innerHTML += '<option value="wrong_receipt">🧾</option>';
    sel.value = 'wrong_receipt';
    const st = h.doc.getElementById('diff-store');
    if (st.tagName === 'SELECT') st.innerHTML = '<option>Раднево</option>';
    st.value = 'Раднево';
    h.doc.getElementById('diff-counterpart').innerHTML = '<option>ТЕСИ ООД</option>';
    await fillAndSubmit(h);
    ok('supply: гейтът в submitDiffReport спира — няма POST', reportPosts(h).length === 0,
      JSON.stringify(reportPosts(h).map(p => p.body)));
    ok('supply: toast „Нямаш право"', h.calls.toast.some(t => String(t).indexOf('Нямаш право') >= 0),
      h.calls.toast.join(' | '));
  }

  section('д) Подадената от магазина бланка излиза в подтаб „Сторна по грешен прием"');
  {
    const h = env(STORE);
    realClick(h.w, modBtn(h, '🧾 Грешен прием'));
    await ticks(); await ticks();
    await fillAndSubmit(h, { name: 'АРТИКУЛ ОТ МАГАЗИНА' });
    await settle();
    const tab = h.doc.querySelector('button[data-dir="wrong_receipt"]');
    if (ok('подтабът „Сторна по грешен прием" е на екрана', !!tab)) {
      realClick(h.w, tab);
      await ticks();
      const txt = h.doc.getElementById('mod-stock-diff').textContent;
      ok('бланката (редът ѝ) е в подтаба', txt.indexOf('АРТИКУЛ ОТ МАГАЗИНА') >= 0,
        'sdDirTab=' + h.w.sdDirTab + ' | диф: ' + h.w.diffReports.map(r => r.store_name + ':' + r.direction).join(','));
      realClick(h.w, h.doc.querySelector('button[data-dir="supplier"]'));
      ok('и НЕ е в подтаб „Доставчик"',
        h.doc.getElementById('mod-stock-diff').textContent.indexOf('АРТИКУЛ ОТ МАГАЗИНА') < 0);
    }
  }

  section('е) Интеграция с report.js: брои се като всяка друга сторна');
  {
    const h = env(STORE);
    realClick(h.w, modBtn(h, '🧾 Грешен прием'));
    await ticks(); await ticks();
    await fillAndSubmit(h);
    ok('подадена е', reportPosts(h).length === 1);
    const sum = await new Promise(res => h.w.collectCrossModuleWeeklySummary(res, undefined, null));
    if (ok('справката връща данни', !!sum && !!sum.wrongReceipt)) {
      ok('сторна: 2 (1 от ЦО + 1 от магазина)', sum.wrongReceipt.total === 2, 'реално: ' + sum.wrongReceipt.total);
      ok('неприключени: 2', sum.wrongReceipt.unreviewed === 2, 'реално: ' + sum.wrongReceipt.unreviewed);
      const by = {}; sum.wrongReceipt.byStore.forEach(x => { by[x.store] = x.count; });
      ok('разбивка: Раднево 1, Гоце Делчев 1', by['Раднево'] === 1 && by['Гоце Делчев'] === 1, JSON.stringify(by));
      ok('НЕ е преброена и в „Разлики"', sum.diffs.total === 0, 'реално: ' + sum.diffs.total);
    }
  }

  report();
})();
