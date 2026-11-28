/* Разлики — логистичният склад не вижда и не изпълнява офисните бутони
   (28.11.2026, сесия razliki-sklad-prava).

   Складовете („Логистичен склад Добрич“ / „… Търговище“) са с роля logistics
   и до тази дата минаваха през canAddSD / canSubmitDiff / canReviewDiff /
   canEditSD като офиса. Сега четирите предиката връщат false за склада, а
   обработчиците имат собствена ключалка (скрит бутон не е защита).

   Проверява:
   1. Склад, „Бланки към мен“: няма „+ Добави ръчно“ и „📝 Подай бланка“; има
      бутоните за отговор (SD_WH_BY_CAT), „➡️ Към Контролинг“ и
      „📬 Прието обратно“.
   2. Склад, „Приети редове“: няма ✏️ и ✕.
   3. Склад, директно извикване на обработчиците: 0 POST / PATCH / DELETE,
      модалите не се отварят.
   4. Admin и Цвети (accounting): бутоните и модалите са както преди.

   Мутационна проверка (28.11.2026, мутант върху копие на stock-differences.js
   в работното дърво, файлът върнат и сверен с cmp; чистият код: exit 0):
     M1 canAddSD без проверката за склада          → пада
     M2 canEditSD без проверката за склада         → пада
     M3 ✕ без !isLogisticsWarehouseUser()          → пада
     M4 openSDModal без ключалката                 → пада (след проверката
        за toast; без нея оцеляваше — модалът и без това го няма в DOM-а)
     M5 canReviewDiff без проверката за склада     → пада
     M6 submitDiffReport без ключалката            → пада
     M7 canSubmitDiff без проверката за склада     → пада
     M8 sdDelete без ключалката                    → пада
     M9 sdModalHtml() пак се рисува за склада      → пада
   9 от 9 мутанта убити.

   Пускане:  node tests/razliki-sklad-prava.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const WH = 'Логистичен склад Търговище';
const STORE = 'Карлово';
const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  cveti: { id: 'u-ct', email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:    { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH }
};
const DBU = Object.keys(U).map(k => ({ id: U[k].id, email: U[k].email, display_name: U[k].display_name,
  notify_groups: [], is_regional: false, assigned_stores: [], active: true }));

const REP = { id: 'r1', direction: 'interstore', store_name: STORE, counterpart: WH, document_number: 'Dr1', doc_date: '2026-11-17',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' };
const REP_S = { id: 'r2', direction: 'supplier', store_name: STORE, counterpart: 'Доставчик ООД', document_number: 'Ds2', doc_date: '2026-11-17',
  submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' };
const line = (id, rid, cat, extra) => Object.assign({ id, report_id: rid, store_name: STORE, supplier: rid === 'r1' ? WH : 'Доставчик ООД',
  material_code: 'S' + id, material_name: 'АРТ ' + id, quantity: 2, quantity_received: 1, quantity_supplier_doc: 2, unit: 'бр',
  difference_category: cat, type: null, status: 'new', warehouse_response: null, store_response: null,
  attachments: [], created_at: '2026-11-17T08:00:00Z' }, extra || {});
const L = {
  c1: line('c1', 'r1', 'undelivered'),                                                          /* без отговор → бутони за отговор + Към Контролинг */
  c3: line('c3', 'r1', 'excess', { warehouse_response: 'return', store_response: 'sap_done', zstr_number: '4500012345' }), /* Прието обратно */
  a1: line('a1', 'r1', 'undelivered', { warehouse_response: 'sent', status: 'received', completed_by: 'Карлово', completed_at: '2026-11-20T10:00:00Z' }), /* приет ред на склада */
  s1: line('s1', 'r2', 'undelivered'),                                                          /* доставчик — решение на Цвети */
  s2: line('s2', 'r2', 'undelivered', { type: 'missing', status: 'new' })                       /* решен — Липса (кредитно) */
};
const ALL = Object.keys(L).map(k => L[k]);
const REPS = [REP, REP_S];

const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user) {
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'report.js'],
    user, confirm: true,
    data: {
      stock_differences: clone(ALL), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: DBU, contacts: [],
      differences_reports: clone(REPS), storno_notes: [], storno_note_replies: []
    }
  });
  h.w.pushInterstoreDiff = () => Promise.resolve({ ok: true });
  h.w.pushToPeople = () => Promise.resolve({ ok: true });
  h.w.sendEmail = () => Promise.resolve({ ok: true });
  return h;
}
async function render(h, o) {
  o = o || {};
  h.w.sdData = clone(ALL);
  h.w.diffReports = clone(REPS);
  h.w.sdSwaps = [];
  h.w.sdNotes = [];
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = o.dir || 'interstore'; h.w.sdView = o.view || 'reports';
  h.w.sdShowDone = { r1: true, r2: true };
  await h.w.sdLoadMe(); await settle();
  h.w.renderStockDiff();
}
/* Само <button> в целия документ. */
const allBtns = h => Array.prototype.slice.call(h.doc.querySelectorAll('button')).map(b => b.textContent.trim());
const hasBtn = (h, re) => allBtns(h).some(t => re.test(t));
const onclickBtns = (h, fn) => Array.prototype.slice.call(h.doc.querySelectorAll('button[onclick]'))
  .filter(b => b.getAttribute('onclick').indexOf(fn + '(') === 0);
const writes = h => h.calls.post.length + h.calls.patch.length + h.calls.del.length;

(async function run() {

  section('0. Предикатите');
  {
    const h = env(U.wh);
    ok('склад: isLogisticsWarehouseUser() === true', !!h.w.isLogisticsWarehouseUser());
    ok('склад: canAddSD() false', !h.w.canAddSD());
    ok('склад: canSubmitDiff() false', !h.w.canSubmitDiff());
    ok('склад: canReviewDiff() false', !h.w.canReviewDiff());
    ok('склад: canEditSD() false (без ред)', !h.w.canEditSD());
    ok('склад: canEditSD(ред) false', !h.w.canEditSD(L.a1));
    h.close();
    [['admin', U.admin], ['Цвети', U.cveti]].forEach(([n, u]) => {
      const g = env(u);
      ok(n + ': canAddSD / canSubmitDiff / canReviewDiff / canEditSD — true',
        !!g.w.canAddSD() && !!g.w.canSubmitDiff() && !!g.w.canReviewDiff() && !!g.w.canEditSD(L.a1));
      g.close();
    });
  }

  section('1. Склад — „Бланки към мен“: горната лента и бутоните по ред');
  {
    const h = env(U.wh);
    await render(h);
    ok('склад: няма бутон „+ Добави ръчно“', !hasBtn(h, /Добави ръчно/));
    ok('склад: няма бутон „📝 Подай бланка“', !hasBtn(h, /Подай бланка/));
    ok('склад: няма бутон с onclick openSDModal', onclickBtns(h, 'openSDModal').length === 0);
    ok('склад: бутонът за отговор „📤 Изпратено“ го има', hasBtn(h, /^📤 Изпратено/), allBtns(h).join(' | '));
    ok('склад: „⏳ Ще се изпрати…“ го има', hasBtn(h, /Ще се изпрати/));
    ok('склад: „➡️ Към Контролинг“ го има', hasBtn(h, /Към Контролинг/));
    ok('склад: „📬 Прието обратно“ го има', hasBtn(h, /Прието обратно/));
    ok('склад: няма бутони за решение (resolveDiffLine)', onclickBtns(h, 'resolveDiffLine').length === 0);
    ok('склад: няма „Смени посоката“ (openSDMoveModal)', onclickBtns(h, 'openSDMoveModal').length === 0);
    ok('склад: няма „🗑 Изтрий бланката“', !hasBtn(h, /Изтрий бланката/));
    h.close();
  }

  section('2. Склад — „Приети редове“: без ✏️ и ✕');
  {
    const h = env(U.wh);
    await render(h, { view: 'rows' });
    const html = h.doc.body.innerHTML;
    ok('склад: изгледът е „Приети редове“', html.indexOf('Приети редове') >= 0);
    ok('склад: редът a1 е в таблицата', html.indexOf('АРТ a1') >= 0);
    ok('склад: няма бутон ✏️', !hasBtn(h, /^✏️$/));
    ok('склад: няма бутон ✕ (sdDelete)', onclickBtns(h, 'sdDelete').length === 0);
    ok('склад: модалът на Контролинга (#sd-ov) не е в DOM-а', !h.doc.getElementById('sd-ov'));
    ok('склад: няма бутон кредитно (sdToggleCreditNote)', onclickBtns(h, 'sdToggleCreditNote').length === 0);
    h.close();
  }

  section('3. Склад — директно извикване на обработчиците не пише нищо');
  {
    const h = env(U.wh);
    await render(h);
    h.calls.post.length = 0; h.calls.patch.length = 0; h.calls.del.length = 0;
    const call = (name, fn) => { try { fn(); } catch (e) { ok(name + ' не хвърля', false, e.message); } };
    const t0 = h.calls.toast.length;
    call('openSDModal(null)', () => h.w.openSDModal(null));
    ok('openSDModal(null): ключалката в обработчика отказва с toast (не само липсващ модал)',
      h.calls.toast.slice(t0).some(t => /Нямаш права/.test(t)), h.calls.toast.slice(t0).join(' | '));
    ok('openSDModal(null): модалът #sd-ov не е отворен', !h.doc.getElementById('sd-ov'));
    call('openSDModal(a1)', () => h.w.openSDModal('a1'));
    ok('openSDModal(a1): модалът #sd-ov не е отворен', !h.doc.getElementById('sd-ov'));
    call('submitSD()', () => h.w.submitSD());
    call('sdDelete(a1)', () => h.w.sdDelete('a1'));
    call('resolveDiffLine(s1, missing)', () => h.w.resolveDiffLine('s1', 'missing'));
    call('sdToggleCreditNote(s2)', () => h.w.sdToggleCreditNote('s2'));
    call('openDiffSubmitModal()', () => h.w.openDiffSubmitModal());
    ok('openDiffSubmitModal(): #diff-submit-ov не е отворен', !h.doc.getElementById('diff-submit-ov'));
    call('submitDiffReport()', () => h.w.submitDiffReport());
    call('openSDMoveModal(r2)', () => h.w.openSDMoveModal('r2'));
    ok('openSDMoveModal(r2): #sdm-ov не е отворен', !h.doc.getElementById('sdm-ov'));
    call('submitSDMove(r2)', () => h.w.submitSDMove('r2'));
    await settle();
    ok('склад: 0 POST / PATCH / DELETE след всички обработчици', writes(h) === 0,
      JSON.stringify({ post: h.calls.post.map(x => x.table), patch: h.calls.patch.map(x => x.table), del: h.calls.del.map(x => x.table) }));
    ok('склад: confirm за триене не е питан', h.calls.confirm.length === 0, h.calls.confirm.join(' | '));
    ok('склад: червен toast „Нямаш права…“', h.calls.toast.some(t => /Нямаш права/.test(t)));
    await settle();
    h.close();
  }

  for (const [n, u] of [['admin', U.admin], ['Цвети', U.cveti]]) {
    section('4. ' + n + ' — всичко както преди');
    const h = env(u);
    await render(h, { dir: 'supplier' });
    ok(n + ': „+ Добави ръчно“ го има', hasBtn(h, /Добави ръчно/));
    ok(n + ': „📝 Подай бланка“ го има', hasBtn(h, /Подай бланка/));
    ok(n + ': бутони за решение по ред (resolveDiffLine) ги има', onclickBtns(h, 'resolveDiffLine').length > 0);
    await render(h, { dir: 'supplier', view: 'rows' });
    ok(n + ': „Решени редове“ — ✏️ го има', hasBtn(h, /^✏️$/));
    ok(n + ': „Решени редове“ — ✕ го има', onclickBtns(h, 'sdDelete').length > 0);
    ok(n + ': кредитното (sdToggleCreditNote) го има', onclickBtns(h, 'sdToggleCreditNote').length > 0);
    h.w.openSDModal(null);
    ok(n + ': openSDModal(null) отваря #sd-ov', !!h.doc.getElementById('sd-ov'));
    h.w.closeSDModal && h.w.closeSDModal();
    h.calls.del.length = 0;
    h.w.sdDelete('s1'); await settle();
    ok(n + ': sdDelete(s1) праща DELETE', h.calls.del.some(x => /stock_differences/.test(String(x))), JSON.stringify(h.calls.del));
    h.calls.patch.length = 0;
    h.w.resolveDiffLine('s1', 'writein'); await settle();
    ok(n + ': resolveDiffLine(s1) праща PATCH', h.calls.patch.some(x => x.table === 'stock_differences'));
    h.w.openDiffSubmitModal();
    ok(n + ': openDiffSubmitModal() отваря #diff-submit-ov', !!h.doc.getElementById('diff-submit-ov'));
    await settle();
    h.close();
  }

  report();
})();
