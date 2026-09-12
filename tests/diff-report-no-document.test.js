/* „Разлики": отметка „Без документ" в новата бланка.

   Магазините понякога получават стока без документ — няма какво да снимат,
   а формата спираше подаването заради задължителните снимки при категории
   като „Увредена стока". Колоната differences_reports.no_document (boolean,
   default false) вече е в базата.

   Отметката отменя ЕДИНСТВЕНО задължителните снимки. Рисува се само при
   посока доставчик; при междускладов трансфер и сторна по грешен прием
   <input> изобщо не съществува и no_document остава false.

   Пускане:  node tests/diff-report-no-document.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца',
                role: 'manager', store_name: 'Враца' };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
                role: 'admin', store_name: 'Централен офис', assigned_stores: ['Враца'] };

const NEW_REP = { id: 'r-new', store_name: 'Враца', direction: 'supplier',
                  counterpart: 'ТЕСИ ООД', reviewed: false, photos: [] };

function env(user, extra) {
  const h = boot({
    /* transport.js е тук заради getStoreInfo(), която печатът вика. */
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    data: Object.assign({
      stock_differences: [], differences_reports: [NEW_REP],
      stock_returns: [], product_catalog: [],
      contacts: [{ name: 'ТЕСИ ООД' }, { name: 'КАМ-04' }]
    }, extra || {})
  });
  h.w.sdData = []; h.w.diffReports = [];
  return h;
}

/* Отваря формата и превключва посоката — точно както потребителят. Редовете
   се попълват СЛЕД смяната: updateDiffCounterpartLabel() ги пренарисува. */
async function openForm(h, direction) {
  h.w.openDiffSubmitModal();
  h.doc.getElementById('diff-store').value = 'Враца';
  const dir = h.doc.getElementById('diff-direction');
  if (direction && dir.value !== direction) {
    dir.value = direction;
    fire(h.w, dir, 'change');
  }
  await ticks();
  const cp = h.doc.getElementById('diff-counterpart');
  if (cp && !cp.value && cp.options.length > 1) cp.selectedIndex = 1;
}
function fillRow(h, vals) {
  const row = h.doc.querySelectorAll('#diff-items .diff-item-row')[0];
  row.querySelector('.di-name').value = vals.name;
  if (vals.cat) row.querySelector('.di-cat').value = vals.cat;
  if (vals.qty) row.querySelector('.di-qty').value = vals.qty;
  return row;
}
async function submit(h) {
  realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай'));
  await ticks(); await ticks(); await ticks();
}
const repPosts = calls => calls.post.filter(p => p.table === 'differences_reports');
const photoToast = calls => calls.toast.some(t => /Снимки са задължителни/.test(String(t)));
const noDocInput = doc => doc.querySelector('input#diff-no-doc');
const hint = doc => (doc.getElementById('diff-photo-hint') || {}).textContent || '';

(async function run() {

  section('а) Отметката: има я при доставчик, няма я при междускладов');
  {
    const h = env(STORE);
    await openForm(h, null);
    ok('посоката по подразбиране е междускладов', h.doc.getElementById('diff-direction').value === 'interstore');
    ok('при междускладов НЯМА <input id="diff-no-doc">', !noDocInput(h.doc));

    const dir = h.doc.getElementById('diff-direction');
    dir.value = 'supplier'; fire(h.w, dir, 'change'); await ticks();
    const cb = noDocInput(h.doc);
    if (ok('при доставчик <input id="diff-no-doc"> съществува', !!cb)) {
      ok('това е checkbox', cb.getAttribute('type') === 'checkbox');
      ok('тръгва изключена', cb.checked === false);
      ok('надписът е „📄 Стоката е без документ (снимки не са задължителни)"',
        cb.parentNode.textContent.trim() === '📄 Стоката е без документ (снимки не са задължителни)',
        JSON.stringify(cb.parentNode.textContent.trim()));
      /* Отметката стои под полето за документ, не някъде другаде във формата. */
      const docnum = h.doc.getElementById('diff-docnum');
      ok('стои след полето „Документ №"', !!(docnum.compareDocumentPosition(cb) & 4));
    }

    dir.value = 'interstore'; fire(h.w, dir, 'change'); await ticks();
    ok('обратно на междускладов — <input> изчезва', !noDocInput(h.doc));

    const h2 = env(CVETI);
    await openForm(h2, 'wrong_receipt');
    ok('при сторна по грешен прием НЯМА <input id="diff-no-doc">',
      h2.doc.getElementById('diff-direction').value === 'wrong_receipt' && !noDocInput(h2.doc),
      h2.doc.getElementById('diff-direction').value);
  }

  section('б) Задължителни снимки, 0 снимки, отметка изключена → спира');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    fillRow(h, { name: 'УВРЕДЕН КАШОН', cat: 'damaged', qty: '2' });
    await submit(h);
    ok('toast „Снимки са задължителни"', photoToast(h.calls), h.calls.toast.join(' | '));
    ok('НЯМА POST към differences_reports', repPosts(h.calls).length === 0,
      'брой: ' + repPosts(h.calls).length);
  }

  section('в) Същото, отметка ВКЛЮЧЕНА → минава с no_document:true');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    fillRow(h, { name: 'УВРЕДЕН КАШОН', cat: 'damaged', qty: '2' });
    const cb = noDocInput(h.doc);
    ok('отметката е на екрана', !!cb);
    ok('преди отметката надписът изброява задължителните', /задължителни при/.test(hint(h.doc)), hint(h.doc));
    cb.checked = true; fire(h.w, cb, 'change');
    ok('надписът под „Снимки" е „(без документ — по избор)"', hint(h.doc) === '(без документ — по избор)',
      JSON.stringify(hint(h.doc)));
    await submit(h);
    ok('НЯМА toast за снимки', !photoToast(h.calls), h.calls.toast.join(' | '));
    const p = repPosts(h.calls)[0];
    if (ok('има POST към differences_reports', !!p, h.calls.toast.join(' | '))) {
      ok('no_document е true', p.body.no_document === true, JSON.stringify(p.body.no_document));
      ok('посоката е supplier', p.body.direction === 'supplier');
    }

    /* Изключване обратно връща надписа — не остава „по избор". */
    const h2 = env(STORE);
    await openForm(h2, 'supplier');
    const cb2 = noDocInput(h2.doc);
    cb2.checked = true; fire(h2.w, cb2, 'change');
    cb2.checked = false; fire(h2.w, cb2, 'change');
    ok('при изключване надписът се връща', /задължителни при/.test(hint(h2.doc)), hint(h2.doc));
  }

  section('г) Отметка изключена → POST носи no_document:false, не undefined');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    fillRow(h, { name: 'ЛИПСВАЩ АРТИКУЛ', cat: 'undelivered', qty: '1' });
    await submit(h);
    const p = repPosts(h.calls)[0];
    if (ok('има POST към differences_reports', !!p, h.calls.toast.join(' | '))) {
      ok('ключът no_document присъства', Object.prototype.hasOwnProperty.call(p.body, 'no_document'),
        Object.keys(p.body).join(','));
      ok('стойността е точно false', p.body.no_document === false, JSON.stringify(p.body.no_document));
    }

    /* Междускладов — също false, не липсващ ключ. */
    const h2 = env(STORE);
    await openForm(h2, 'interstore');
    fillRow(h2, { name: 'ЛИПСВАЩ АРТИКУЛ', cat: 'undelivered', qty: '1' });
    await submit(h2);
    const p2 = repPosts(h2.calls)[0];
    if (ok('междускладов: има POST', !!p2, h2.calls.toast.join(' | '))) {
      ok('междускладов: no_document е точно false', p2.body.no_document === false,
        JSON.stringify(p2.body.no_document));
    }
  }

  section('д) Бадж „Без документ" в заглавието на бланката за преглед');
  {
    const REPS = [
      { id: 'r-nodoc', store_name: 'Враца', direction: 'supplier', counterpart: 'ТЕСИ ООД',
        document_number: '', doc_date: '2026-09-12', submitted_by: 'Враца',
        general_comment: '', photos: [], reviewed: false, no_document: true },
      { id: 'r-doc', store_name: 'Враца', direction: 'supplier', counterpart: 'КАМ-04',
        document_number: '4600179694', doc_date: '2026-09-12', submitted_by: 'Враца',
        general_comment: '', photos: [], reviewed: false, no_document: false }
    ];
    const LINES = [
      { id: 'l1', report_id: 'r-nodoc', store_name: 'Враца', supplier: 'ТЕСИ ООД',
        material_code: '', material_name: 'АРТ 1', quantity: 1, type: null, status: 'new', attachments: [] },
      { id: 'l2', report_id: 'r-doc', store_name: 'Враца', supplier: 'КАМ-04',
        material_code: '', material_name: 'АРТ 2', quantity: 1, type: null, status: 'new', attachments: [] }
    ];
    const h = env(CVETI, { differences_reports: REPS, stock_differences: LINES });
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
    h.w.sdDirTab = 'supplier';
    if (guard('renderStockDiff() не хвърля', () => h.w.renderStockDiff())) {
      const a = h.doc.getElementById('diff-rep-r-nodoc');
      const b = h.doc.getElementById('diff-rep-r-doc');
      if (ok('двете бланки са на екрана', !!a && !!b)) {
        ok('no_document:true → има бадж „📄 Без документ"', a.textContent.indexOf('📄 Без документ') >= 0,
          a.textContent.slice(0, 160));
        ok('no_document:false → няма бадж', b.textContent.indexOf('Без документ') < 0,
          b.textContent.slice(0, 160));
        /* Баджът е в заглавието, до „Доставчик — X", не някъде в редовете. */
        const badge = Array.prototype.find.call(a.querySelectorAll('span'),
          x => x.textContent === '📄 Без документ');
        ok('баджът е сив #64748b', !!badge && /color:#64748b/.test(badge.getAttribute('style') || ''),
          badge ? badge.getAttribute('style') : 'няма span');
        ok('баджът стои веднага след „— ТЕСИ ООД"',
          !!badge && !!badge.previousElementSibling &&
          /— ТЕСИ ООД/.test(badge.previousElementSibling.textContent),
          badge && badge.previousElementSibling ? badge.previousElementSibling.textContent : '');
      }
    }
  }

  section('е) Печатната справка и имейлът до доставчика казват „без документ"');
  {
    const REP = { id: 'r-nodoc', store_name: 'Враца', direction: 'supplier', counterpart: 'ТЕСИ ООД',
      document_number: '', doc_date: '2026-09-12', submitted_by: 'Враца',
      general_comment: '', photos: [], reviewed: false, no_document: true,
      created_at: '2026-09-12T10:00:00.000Z' };
    const LINE = { id: 'l1', report_id: 'r-nodoc', store_name: 'Враца', supplier: 'ТЕСИ ООД',
      material_code: '', material_name: 'АРТ 1', quantity: 1, quantity_received: 0,
      difference_category: 'damaged', type: null, status: 'new', attachments: [], comment: '' };
    const h = env(CVETI, { differences_reports: [REP], stock_differences: [LINE] });
    h.w.sdData = [JSON.parse(JSON.stringify(LINE))];
    h.w.diffReports = [JSON.parse(JSON.stringify(REP))];

    let mail = '';
    if (guard('diffEmailBodyHtml не хвърля', () => { mail = h.w.diffEmailBodyHtml(REP, [LINE], ''); })) {
      ok('имейлът казва „документ: няма (стока без документ)"',
        mail.indexOf('документ: няма (стока без документ)') >= 0, mail.slice(0, 300));
      ok('имейлът НЕ казва „документ №"', mail.indexOf('документ №') < 0);
    }
    const withDoc = Object.assign({}, REP, { no_document: false, document_number: '4600179694' });
    const mail2 = h.w.diffEmailBodyHtml(withDoc, [LINE], '');
    ok('при документ имейлът си пише „документ №4600179694"', mail2.indexOf('документ №4600179694') >= 0);
    ok('и без „без документ"', mail2.indexOf('без документ') < 0);

    let out;
    if (guard('renderDiffPrint не хвърля', () => { out = h.w.renderDiffPrint(REP); })) {
      const print = (typeof out === 'string' ? out : '') +
        ((h.doc.getElementById('mod-print') || {}).innerHTML || '');
      ok('печатът казва „няма (стока без документ)"',
        print.indexOf('няма (стока без документ)') >= 0, print.slice(0, 200));
    }
  }

  report();
})();
