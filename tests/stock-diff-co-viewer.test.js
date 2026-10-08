/* Разлики — режим „само преглед“ за ЦО (supply / marketing / user).

   Потребител със store_name='Централен офис' и роля без право на действие
   (не admin/accounting/logistics) преди виждаше празен списък (storeQ филтрира
   по обект „Централен офис“, който няма редове). Сега вижда ВСИЧКИ обекти и
   нито един бутон за промяна.

   Тестът минава през истинския loadStockDiff() (заявките се записват), рисува
   всички изгледи и гледа САМО <button> — всеки, чийто onclick не е от белия
   списък „преглед/навигация/печат/износ“, е изтекло действие.

   Пускане:  node tests/stock-diff-co-viewer.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick } = H;

/* Бутони, които са ПРЕГЛЕД: навигация, филтри, печат, износ. */
const VIEW_ONLY = /^(setSDDirTab|setSDView|setSDTypeFilter|setSDFilter|setSDStoreFilter|exportSDExcel|loadDiffPrint|sdToggleDone|sdActionsGoto|sdClearFilters|sdSetActionsDays|sdToggleActions)\(|^window\.print\(\)|^showModule\('stock-diff'\)/;

function row(o) {
  return Object.assign({
    report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    confirmed_date: null, comment: null, resolution_comment: null,
    order_number: null, created_at: '2026-10-01T08:00:00Z', photos: []
  }, o);
}

/* Реда на покритие: всички типове, статуси и посоки, при които САМО за
   нормален потребител се рисува бутон. */
const DESIGNED = [
  row({ id: 'a1', report_id: 'rep-r1', type: 'writein', status: 'pending' }),
  row({ id: 'a2', report_id: 'rep-r1', type: 'return', status: 'pending', store_name: 'Раднево' }),
  row({ id: 'a3', report_id: 'rep-r2', type: 'missing', status: 'pending', store_name: 'Гълъбово' }),
  row({ id: 'a4', report_id: 'rep-r2', type: 'not_invoiced', status: 'pending', store_name: 'Гълъбово' }),
  row({ id: 'a5', report_id: 'rep-r2', type: 'writein', status: 'taken', store_name: 'Гълъбово' }),
  row({ id: 'a6', report_id: 'rep-r3', type: 'missing', status: 'pending', store_name: 'Троян', credit_note_issued: false }),
  /* междускладови — всяко състояние, което рисува бутон за магазин/склад */
  row({ id: 'i1', report_id: 'rep-i1', type: 'missing', status: 'pending', store_name: 'Троян', warehouse_response: 'sent' }),
  row({ id: 'i2', report_id: 'rep-i1', type: 'missing', status: 'pending', store_name: 'Троян', warehouse_response: 'sent_sap' }),
  row({ id: 'i3', report_id: 'rep-i1', type: 'missing', status: 'pending', store_name: 'Троян', warehouse_response: 'return' }),
  row({ id: 'i4', report_id: 'rep-i1', type: 'missing', status: 'pending', store_name: 'Троян', warehouse_response: null }),
  row({ id: 'i5', report_id: 'rep-i1', type: 'missing', status: 'received', store_name: 'Троян', warehouse_response: 'sent' }),
  /* без тип — „За преглед“ */
  row({ id: 'u1', report_id: 'rep-new', type: null, status: 'new', store_name: 'Русе' }),
  row({ id: 'u2', report_id: 'rep-new', type: null, status: 'new', store_name: 'Русе' })
];
/* Пълнеж над 1000 реда — проверява страницирането (1000 е таванът на PostgREST). */
const FILLER = [];
for (let i = 0; i < 1100; i++) {
  FILLER.push(row({ id: 'f' + i, report_id: 'rep-r1', type: 'writein', status: 'taken',
    store_name: i % 2 ? 'Варна' : 'Бургас', created_at: '2026-09-01T08:00:00Z' }));
}
const ROWS = DESIGNED.concat(FILLER);

const REPORTS = [
  { id: 'rep-r1', store_name: 'Раднево', direction: 'supplier', reviewed: true,  report_date: '2026-10-01', supplier: 'ТЕСИ ООД', created_at: '2026-10-01T08:00:00Z' },
  { id: 'rep-r2', store_name: 'Гълъбово', direction: 'supplier', reviewed: true, report_date: '2026-10-01', supplier: 'ТЕСИ ООД', created_at: '2026-10-01T08:00:00Z' },
  { id: 'rep-r3', store_name: 'Троян', direction: 'supplier', reviewed: true, report_date: '2026-10-01', supplier: 'ТЕСИ ООД', created_at: '2026-10-01T08:00:00Z' },
  { id: 'rep-i1', store_name: 'Троян', direction: 'interstore', counterpart: 'Склад Пловдив', reviewed: false, report_date: '2026-10-01', created_at: '2026-10-01T08:00:00Z' },
  { id: 'rep-new', store_name: 'Русе', direction: 'supplier', reviewed: false, report_date: '2026-10-02', supplier: 'ТЕСИ ООД', created_at: '2026-10-02T08:00:00Z', email_pending: true }
];

function page(all, url) {
  const off = +((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
  const lim = +((url.match(/[?&]limit=(\d+)/) || [])[1] || 1000);
  /* PostgREST реже на 1000 и без limit */
  return all.slice(off, off + Math.min(lim, 1000));
}

function user(role, store) {
  return { email: role + '@temax.bg', display_name: role, role: role,
           store_name: store || 'Централен офис', assigned_stores: null };
}

function env(u) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: u,
    data: {
      stock_differences: url => page(ROWS, url),
      differences_reports: url => page(REPORTS, url),
      stock_returns: [], stock_diff_swaps: []
    }
  });
  return h;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/* Всички бутони, които не са от белия списък, в целия таб. */
function leaked(doc) {
  const out = [];
  doc.querySelectorAll('#mod-stock-diff button, [id$="-ov"] button, #sd-modal button').forEach(b => {
    const oc = (b.getAttribute('onclick') || '').trim();
    if (!VIEW_ONLY.test(oc)) out.push((oc || '(без onclick)') + ' « ' + b.textContent.trim().slice(0, 30));
  });
  return out;
}

/* Минава през всички изгледи, които рисуват различни бутони. */
function sweep(w, doc) {
  const seen = {};
  const collect = () => leaked(doc).forEach(x => { seen[x] = 1; });
  ['supplier', 'interstore'].forEach(dir => {
    w.sdDirTab = dir;
    ['reports', 'rows'].forEach(view => {
      w.sdView = view;
      ['all', 'pending', 'taken'].forEach(f => {
        w.sdFilter = f; w.sdTypeFilter = 'all';
        w.sdShowDone = { 'rep-r1': true, 'rep-r2': true, 'rep-r3': true, 'rep-i1': true, 'rep-new': true };
        w.sdExpandedResolve = { a1: true, a2: true, a3: true, a4: true, a5: true, i1: true };
        w.renderStockDiff();
        collect();
      });
    });
  });
  return Object.keys(seen);
}

(async function () {

  ['supply', 'marketing', 'user'].forEach(function () {});

  for (const role of ['supply', 'marketing', 'user']) {
    section('1. ' + role + ' от ЦО — вижда всички обекти, без бутони за действие');
    const { w, doc, calls } = env(user(role));
    w.loadStockDiff();
    await wait(60);

    const sdGets = calls.get.filter(u => /stock_differences|differences_reports/.test(u));
    ok('заявките към stock_differences/differences_reports са без store_name филтър',
       sdGets.length > 0 && sdGets.every(u => !/store_name=/.test(u)), sdGets.join(' | '));
    ok('страницира: редовете над 1000 се взимат (' + ROWS.length + ')',
       w.sdData.length === ROWS.length, w.sdData.length);
    ok('бланките са заредени', w.diffReports.length === REPORTS.length, w.diffReports.length);

    ok('sdIsCOViewer() е true', w.sdIsCOViewer() === true);
    ok('лентата „Режим преглед“ е видима', !!doc.getElementById('sd-viewer-bar'));
    ok('sdWaitingVisible() е null', w.sdWaitingVisible() === null);
    ok('чипът/бележката „Чакат моя отговор“ липсва',
       !/Чакат моя отговор|чака вашия отговор/.test(doc.getElementById('mod-stock-diff').textContent) &&
       !doc.getElementById('sd-waiting-note'));

    /* редове от 2+ обекта са нарисувани (главната таблица) */
    w.sdView = 'rows'; w.sdFilter = 'all'; w.sdDirTab = 'supplier'; w.renderStockDiff();
    const tbl = doc.getElementById('mod-stock-diff').textContent;
    ok('виждат се редове от Раднево и Гълъбово', /Раднево/.test(tbl) && /Гълъбово/.test(tbl));
    const chips = Array.from(doc.querySelectorAll('button[data-store]')).map(b => b.dataset.store);
    ok('чиповете по магазин показват ≥3 обекта', chips.filter(Boolean).length >= 3, chips.join(','));

    const bad = sweep(w, doc);
    ok('нито един <button> за действие във всички изгледи', bad.length === 0, bad.join('\n   '));

    ok('бутоните за подаване липсват', !canNot(w));
    ok('канеше/права: canEditSD / canAddSD / canSubmitDiff / canReviewDiff са false',
       !w.canEditSD({}) && !w.canAddSD() && !w.canSubmitDiff() && !w.canReviewDiff());

    /* бадж и известия */
    w.sdBadgePulse(0);
    ok('sdUnreviewedCountFor() връща 0 (няма бадж)', w.sdUnreviewedCountFor(REPORTS, ROWS) === 0);
    const getsBefore = calls.get.length;
    w.sdRefreshTabBadge();
    ok('пулсът не праща заявка за този потребител', calls.get.length === getsBefore);
    ok('няма toast/звук', !calls.toast.some(t => /Разлики/.test(t)));

    /* филтрите, търсенето и подтабовете остават работещи */
    w.sdView = 'rows'; w.renderStockDiff();
    const dirBtn = doc.querySelector('button[data-dir="interstore"]');
    ok('подтабовете остават (посока)', !!dirBtn);
    if (dirBtn) { realClick(w, dirBtn); ok('клик по подтаб сменя посоката', w.sdDirTab === 'interstore'); }
    ok('износът в Excel остава', !!doc.querySelector('button[onclick^="exportSDExcel"]'));
    ok('търсенето остава', !!doc.getElementById('sd-search-input'));
  }

  section('2. admin и accounting от ЦО — непроменени (бутоните са налице)');
  for (const role of ['admin', 'accounting']) {
    const { w, doc, calls } = env(user(role));
    w.loadStockDiff();
    await wait(60);
    ok(role + ': sdIsCOViewer() е false', w.sdIsCOViewer() === false);
    ok(role + ': няма лента „Режим преглед“', !doc.getElementById('sd-viewer-bar'));
    ok(role + ': има „Подай бланка“', !!doc.querySelector('button[onclick^="openDiffSubmitModal"]'));
    const acts = sweep(w, doc).join(' ; ');
    ok(role + ': има бутони за действие (> 0 изтекли)', acts.length > 0);
    ok(role + ': fixture-ът покрива решение/приключване/редакция/кредитно',
       /resolveDiffLine/.test(acts) && /sdMarkTaken/.test(acts) && /openSDModal/.test(acts) && /sdToggleCreditNote/.test(acts), acts.slice(0, 300));
    /* Таванът на PostgREST е 1000: всички редове трябва да стигнат до рендера и за глобалните */
    ok(role + ': всички ' + ROWS.length + ' реда са заредени (страницира се)', w.sdData.length === ROWS.length, w.sdData.length);
    ok(role + ': втората страница е поискана (offset=1000)',
       calls.get.some(u => /stock_differences/.test(u) && /offset=1000/.test(u)));
    w.sdView = 'rows'; w.sdFilter = 'all'; w.sdDirTab = 'supplier'; w.sdTypeFilter = 'all'; w.renderStockDiff();
    ok(role + ': редовете над тавана стигат до таблицата (рендер)',
       w.sdTableRows({ status: 'all' }).length >= FILLER.length, w.sdTableRows({ status: 'all' }).length);
    ok(role + ': и бланките са заредени', w.diffReports.length === REPORTS.length);
  }

  section('3. manager на обект — непроменен: вижда само своя обект');
  {
    const { w, doc, calls } = env(user('manager', 'Троян'));
    w.currentUser.assigned_stores = ['Троян'];
    w.loadStockDiff();
    await wait(60);
    const q = calls.get.filter(u => /stock_differences/.test(u));
    ok('заявката е с филтър по обект', q.length > 0 && q.every(u => /store_name=eq\./.test(u)), q.join(' | '));
    ok('магазинът също чете на страници (limit=1000, филтърът по обект остава)',
       q.every(u => /limit=1000/.test(u) && /store_name=eq\./.test(u)), q.join(' | '));
    ok('sdIsCOViewer() е false', w.sdIsCOViewer() === false);
    ok('няма лента „Режим преглед“', !doc.getElementById('sd-viewer-bar'));
    ok('има „Подай бланка“', !!doc.querySelector('button[onclick^="openDiffSubmitModal"]'));
    const acts = sweep(w, doc).join(' ; ');
    ok('fixture-ът покрива отговора на магазина по междускладов ред (контрола за покритие)',
       /sdConfirmInterstore|sdSetStoreResponse/.test(acts), acts.slice(0, 300));
  }

  section('4. supply НЕ от ЦО (в обект) — не е „преглед“');
  {
    const { w } = env(user('supply', 'Раднево'));
    ok('sdIsCOViewer() е false', w.sdIsCOViewer() === false);
  }

  report();
})();

/* помощник: има ли изобщо бутон за подаване/добавяне */
function canNot(w) {
  return !!w.document.querySelector('button[onclick^="openDiffSubmitModal"], button[onclick^="openSDModal"]');
}
