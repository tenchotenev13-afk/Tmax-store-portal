/* „Разлики": подсказките на количествата и пазачът срещу номер на документ
   в количеството.

   Към 13.09.2026 в stock_differences стоят 21 реда с quantity = номер на
   входяща доставка (1804…/8046…). Подсказката на полето беше „По вх.
   доставка" и магазините я четяха като „впиши вх. доставка", а примерът в
   „Документ №" беше 4600179694, докато те работят с 180486328.
   Най-голямото истинско количество в базата е 600.

   - подсказките казват „(бр.)", а „Документ №" дава и двата вида номер;
   - над 99999 подаването и корекцията спират с посочен ред и без запис;
   - в изгледа на Цвети такава клетка казва „⚠️ номер на документ?", а
     пълната стойност стои в title. Старите редове в базата не се пипат.

   Пускане:  node tests/diff-qty-guard.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца',
                role: 'manager', store_name: 'Враца' };
const CVETI = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
                role: 'admin', store_name: 'Централен офис', assigned_stores: ['Враца'] };

const OLD_DOC = 'По вх. доставка';
const VD = '180486328';

const REPS = [
  { id: 'r-open', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
    document_number: VD, doc_date: '2026-09-10', reviewed: false, photos: [] },
  { id: 'r-done', direction: 'supplier', store_name: 'Враца', counterpart: 'ТЕСИ ООД',
    document_number: '4600179694', doc_date: '2026-09-01', reviewed: true, photos: [] }
];
const line = o => Object.assign({ store_name: 'Враца', supplier: 'ТЕСИ ООД', material_code: '111',
  difference_category: 'undelivered', type: null, status: 'new' }, o);
const LINES = [
  /* нерешени - секцията с новите бланки */
  line({ id: 'o-big', report_id: 'r-open', material_name: 'ОТВОРЕН ВД НОМЕР', quantity: 180493275, quantity_received: 2 }),
  line({ id: 'o-ok',  report_id: 'r-open', material_name: 'ОТВОРЕН НОРМАЛЕН', quantity: 12, quantity_received: 10 }),
  /* PostgREST връща числата като низове */
  line({ id: 'o-rec', report_id: 'r-open', material_name: 'ОТВОРЕН ВД В РЕАЛНО', quantity: 3, quantity_received: VD }),
  /* решени - долната таблица */
  line({ id: 'd-big', report_id: 'r-done', material_name: 'РЕШЕН ВД НОМЕР', quantity: '180493275', type: 'missing', status: 'pending' }),
  line({ id: 'd-ok',  report_id: 'r-done', material_name: 'РЕШЕН НОРМАЛЕН', quantity: 12, type: 'missing', status: 'pending' })
];

function env(user) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: user,
    data: {
      stock_differences: [], differences_reports: [], stock_returns: [], product_catalog: [],
      contacts: [{ name: 'ТЕСИ ООД' }, { name: 'КАМ-04' }]
    }
  });
  h.w.sdData = []; h.w.diffReports = [];
  return h;
}
async function openForm(h, direction) {
  h.w.openDiffSubmitModal();
  h.doc.getElementById('diff-store').value = 'Враца';
  const dir = h.doc.getElementById('diff-direction');
  if (direction && dir.value !== direction) { dir.value = direction; fire(h.w, dir, 'change'); }
  await ticks();
  const cp = h.doc.getElementById('diff-counterpart');
  if (cp && !cp.value && cp.options.length > 1) cp.selectedIndex = 1;
}
const rowsOf = h => h.doc.querySelectorAll('#diff-items .diff-item-row');
function fillRow(row, vals) {
  row.querySelector('.di-name').value = vals.name;
  if (vals.qty != null) row.querySelector('.di-qty').value = vals.qty;
  if (vals.real != null) row.querySelector('.di-qty-real').value = vals.real;
}
async function submit(h) {
  realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай'));
  await ticks(); await ticks(); await ticks();
}
const posts = (calls, table) => calls.post.filter(p => p.table === table);
const qtyToasts = calls => calls.toast.filter(t => String(t).indexOf('номер на документ') >= 0);
const ph = (doc, sel) => (doc.querySelector(sel) || { getAttribute: () => null }).getAttribute('placeholder');

/* Клетката с количество на реда по име на артикула. Колоната се намира по
   позицията СПРЯМО „Категория"/„Наименование", не по заглавието - то също се
   сменя в тази промяна и не бива да скрива провал на клетката. */
function reportCell(doc, name, offset) {
  const tr = Array.from(doc.querySelectorAll('#mod-stock-diff tr'))
    .find(r => r.children[1] && r.children[1].textContent.indexOf(name) === 0);
  if (!tr) return null;
  const head = Array.from(tr.closest('table').querySelector('tr').children).map(c => c.textContent);
  return { td: tr.children[head.indexOf('Категория') + offset], head: head };
}
function mainCell(doc, name) {
  const tr = Array.from(doc.querySelectorAll('#mod-stock-diff tbody tr'))
    .find(r => r.children[4] && r.children[4].textContent === name);
  if (!tr) return null;
  const head = Array.from(tr.closest('table').querySelectorAll('thead th')).map(c => c.textContent);
  return { td: tr.children[head.indexOf('Наименование') + 1], head: head };
}

(async function run() {

  section('а) Подсказките: „бр." в количествата, 180486328 в „Документ №"');
  for (const dir of [null, 'supplier']) {
    const h = env(STORE);
    await openForm(h, dir);
    const d = h.doc.getElementById('diff-direction').value;
    const q = ph(h.doc, '#diff-items .di-qty'), r = ph(h.doc, '#diff-items .di-qty-real');
    ok('[' + d + '] „По документ" съдържа „бр."', !!q && q.indexOf('бр.') >= 0, JSON.stringify(q));
    ok('[' + d + '] „Реално получено" съдържа „бр."', !!r && r.indexOf('бр.') >= 0, JSON.stringify(r));
    const dn = ph(h.doc, '#diff-docnum');
    ok('[' + d + '] „Документ №" съдържа 180486328', !!dn && dn.indexOf(VD) >= 0, JSON.stringify(dn));
    ok('[' + d + '] „Документ №" пази и 4600179694', !!dn && dn.indexOf('4600179694') >= 0, JSON.stringify(dn));
    const all = Array.from(h.doc.querySelectorAll('#diff-submit-ov [placeholder]')).map(e => e.getAttribute('placeholder'));
    ok('[' + d + '] нито една подсказка в модала не е „' + OLD_DOC + '"',
      all.length > 0 && all.every(p => p.indexOf(OLD_DOC) < 0), JSON.stringify(all));
  }

  section('б) 180486328 в количеството → „Ред 1 … номер на документ", без POST');
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    fillRow(rowsOf(h)[0], { name: 'БОЙЛЕР 80Л', qty: VD, real: '2' });
    await submit(h);
    const t = qtyToasts(h.calls);
    ok('точно един toast за номер на документ', t.length === 1, h.calls.toast.join(' | '));
    ok('казва „Ред 1"', !!t[0] && t[0].indexOf('Ред 1:') === 0, t[0]);
    ok('и показва стойността (180486328)', !!t[0] && t[0].indexOf('(' + VD + ')') >= 0, t[0]);
    ok('и казва „напиши брой"', !!t[0] && t[0].indexOf('напиши брой') >= 0, t[0]);
    ok('НЯМА POST към differences_reports', posts(h.calls, 'differences_reports').length === 0,
      'брой: ' + posts(h.calls, 'differences_reports').length);
    ok('НЯМА POST към stock_differences', posts(h.calls, 'stock_differences').length === 0);
    /* Без пазача бланката минава и модалът се затваря - редът вече го няма. */
    const r0 = rowsOf(h)[0];
    ok('фокусът е на сгрешеното поле', !!r0 && h.doc.activeElement === r0.querySelector('.di-qty'));
  }
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    h.w.addDiffItemRow();
    fillRow(rowsOf(h)[0], { name: 'БОЙЛЕР 80Л', qty: '5', real: '4' });
    fillRow(rowsOf(h)[1], { name: 'ЛАМПА LED', qty: '3', real: VD });
    await submit(h);
    const t = qtyToasts(h.calls);
    ok('в „Реално получено" на втория ред → „Ред 2"', t.length === 1 && t[0].indexOf('Ред 2:') === 0, h.calls.toast.join(' | '));
    ok('и пак без POST', posts(h.calls, 'differences_reports').length === 0);
  }
  {
    const h = env(STORE);
    await openForm(h, 'supplier');
    fillRow(rowsOf(h)[0], { name: 'БОЙЛЕР 80Л', qty: '100000' });
    await submit(h);
    ok('граница: 100000 спира', qtyToasts(h.calls).length === 1 && posts(h.calls, 'differences_reports').length === 0,
      h.calls.toast.join(' | '));
  }

  section('в) Истинско количество минава');
  for (const qty of ['600', '99999']) {
    const h = env(STORE);
    await openForm(h, 'supplier');
    fillRow(rowsOf(h)[0], { name: 'БОЙЛЕР 80Л', qty: qty, real: '1' });
    await submit(h);
    ok(qty + ' → няма toast за номер на документ', qtyToasts(h.calls).length === 0, h.calls.toast.join(' | '));
    ok(qty + ' → POST към differences_reports', posts(h.calls, 'differences_reports').length === 1,
      h.calls.toast.join(' | '));
  }

  section('г) Изгледът на Цвети: ред с 180493275 → „⚠️", ред с 12 → не');
  {
    const h = env(CVETI);
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    if (guard('renderStockDiff не хвърля', () => h.w.renderStockDiff())) {
      const big = reportCell(h.doc, 'ОТВОРЕН ВД НОМЕР', 1);
      if (ok('бланка: редът с 180493275 е на екрана', !!(big && big.td), big && big.head.join('|'))) {
        ok('бланка: заглавието е „Кол. по док."', big.head[big.head.indexOf('Категория') + 1] === 'Кол. по док.', big.head.join('|'));
        ok('бланка: клетката съдържа „⚠️ номер на документ?"', big.td.textContent.indexOf('⚠️ номер на документ?') >= 0, big.td.innerHTML);
        const sp = big.td.querySelector('[title]');
        ok('бланка: title е пълната стойност 180493275', !!sp && sp.getAttribute('title') === '180493275', big.td.innerHTML);
      }
      const small = reportCell(h.doc, 'ОТВОРЕН НОРМАЛЕН', 1);
      ok('бланка: редът с 12 → „12", без ⚠️', !!(small && small.td) && small.td.textContent === '12', small && small.td && small.td.innerHTML);
      const realCol = reportCell(h.doc, 'ОТВОРЕН ВД В РЕАЛНО', 3);
      ok('бланка: „180486328" като низ в „Реално" → ⚠️', !!(realCol && realCol.td) && realCol.td.textContent.indexOf('⚠️') >= 0,
        realCol && realCol.td && realCol.td.innerHTML);
      const realOk = reportCell(h.doc, 'ОТВОРЕН ВД НОМЕР', 3);
      ok('бланка: „Реално" 2 на същия ред остава „2"', !!(realOk && realOk.td) && realOk.td.textContent === '2',
        realOk && realOk.td && realOk.td.innerHTML);

      const mBig = mainCell(h.doc, 'РЕШЕН ВД НОМЕР');
      if (ok('долна таблица: редът с „180493275" е на екрана', !!(mBig && mBig.td))) {
        ok('долна таблица: колоната е „Кол."', mBig.head[mBig.head.indexOf('Наименование') + 1] === 'Кол.', mBig.head.join('|'));
        ok('долна таблица: клетката съдържа „⚠️"', mBig.td.textContent.indexOf('⚠️') >= 0, mBig.td.innerHTML);
        const sp = mBig.td.querySelector('[title]');
        ok('долна таблица: title е 180493275', !!sp && sp.getAttribute('title') === '180493275', mBig.td.innerHTML);
      }
      const mOk = mainCell(h.doc, 'РЕШЕН НОРМАЛЕН');
      ok('долна таблица: редът с 12 → „12", без ⚠️', !!(mOk && mOk.td) && mOk.td.textContent === '12', mOk && mOk.td && mOk.td.innerHTML);
    }
    ok('граница: 99999 → без ⚠️', h.w.sdQtyCell(99999, 'X') === 'X');
    ok('граница: 100000 → ⚠️', String(h.w.sdQtyCell(100000, 'X')).indexOf('⚠️') >= 0);
    ok('празно / null → досегашното съдържание', h.w.sdQtyCell(null, '—') === '—' && h.w.sdQtyCell('', '') === '');
  }

  section('д) Никоя посока не казва „По вх. доставка"');
  {
    const h = env(CVETI);
    for (const d of ['supplier', 'interstore', 'wrong_receipt']) {
      const L = h.w.diffQtyLabels(d);
      const txt = [L.doc, L.docShort, L.real, L.realShort].join(' | ');
      ok('[' + d + '] етикетите нямат „По вх. дост…"', txt.indexOf('По вх. дост') < 0, txt);
      ok('[' + d + '] doc и real казват „(бр.)"', L.doc.indexOf('(бр.)') >= 0 && L.real.indexOf('(бр.)') >= 0, txt);
    }
    for (const d of ['interstore', 'wrong_receipt']) {
      const hf = env(CVETI);
      await openForm(hf, d);
      const q = ph(hf.doc, '#diff-items .di-qty'), r = ph(hf.doc, '#diff-items .di-qty-real');
      ok('[' + d + '] формата е в тази посока', hf.doc.getElementById('diff-direction').value === d);
      ok('[' + d + '] подсказките нямат „' + OLD_DOC + '"', !!q && !!r && (q + r).indexOf(OLD_DOC) < 0, q + ' / ' + r);
      ok('[' + d + '] и казват „бр."', !!q && !!r && q.indexOf('бр.') >= 0 && r.indexOf('бр.') >= 0, q + ' / ' + r);
    }
  }

  section('е) Корекция от магазина: същата проверка, после минава');
  {
    const h = env(STORE);
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    if (guard('модалът за корекция се отваря', () => h.w.openSDCorrectModal('o-big'))) {
      const ov = h.doc.getElementById('sdc-ov');
      const labels = Array.from(ov.querySelectorAll('label.fl')).map(l => l.textContent);
      ok('етикетите казват „Количество по документ (бр.)" / „Реално получено (бр.)"',
        labels.indexOf('Количество по документ (бр.)') >= 0 && labels.indexOf('Реално получено (бр.)') >= 0, labels.join('|'));
      ok('старото 180493275 стои в полето', h.doc.getElementById('sdc-qty').value === '180493275');
      realClick(h.w, btn(ov, 'Запази корекцията'));
      await ticks();
      const t = qtyToasts(h.calls);
      ok('без промяна → toast за номер на документ', t.length === 1 && t[0].indexOf('(180493275)') >= 0, h.calls.toast.join(' | '));
      ok('и НЯМА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch.map(p => p.body)));
      /* Без пазача корекцията минава и модалът се затваря - нататък няма какво да се пипа. */
      if (ok('модалът остава отворен', !!h.doc.getElementById('sdc-ov'))) {
      h.doc.getElementById('sdc-qty').value = '6';
      h.doc.getElementById('sdc-qty-real').value = VD;
      realClick(h.w, btn(h.doc.getElementById('sdc-ov'), 'Запази корекцията'));
      await ticks();
      ok('„Реално получено" 180486328 → също спира', qtyToasts(h.calls).length === 2 && h.calls.patch.length === 0,
        h.calls.toast.join(' | '));

      h.doc.getElementById('sdc-qty-real').value = '2';
      realClick(h.w, btn(h.doc.getElementById('sdc-ov'), 'Запази корекцията'));
      await ticks();
      const p = h.calls.patch[0];
      if (ok('6 / 2 → PATCH', !!p, h.calls.toast.join(' | '))) {
        ok('quantity е 6', Number(p.body.quantity) === 6, JSON.stringify(p.body.quantity));
        ok('quantity_received е 2', Number(p.body.quantity_received) === 2, JSON.stringify(p.body.quantity_received));
      }
      }
    }
  }

  const RESOLVE_MSG = 'Количеството прилича на номер на документ — коригирай го през ✏️ преди решение';
  function resolveBtn(doc, name, type) {
    const tr = Array.from(doc.querySelectorAll('#mod-stock-diff tr'))
      .find(r => r.children[1] && r.children[1].textContent.indexOf(name) === 0);
    if (!tr) return null;
    return Array.from(tr.querySelectorAll('button')).find(b => {
      const oc = b.getAttribute('onclick') || '';
      return oc.indexOf('resolveDiffLine') >= 0 && oc.indexOf("'" + type + "'") >= 0;
    }) || null;
  }
  function cvetiView() {
    const h = env(CVETI);
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    h.w.renderStockDiff();
    return h;
  }

  section('ж) Решение върху ред с номер на документ → toast, нищо не се записва');
  {
    const h = cvetiView();
    const b = resolveBtn(h.doc, 'ОТВОРЕН ВД НОМЕР', 'missing');
    if (ok('бутонът „❓ Липса" на реда с 180493275 е на екрана', !!b)) {
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();
      ok('червен toast „' + RESOLVE_MSG + '"', h.calls.toast.length === 1 && h.calls.toast[0] === RESOLVE_MSG,
        h.calls.toast.join(' | '));
      ok('НЯМА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch.map(p => p.table + ' ' + JSON.stringify(p.body))));
      ok('НЯМА POST', h.calls.post.length === 0, JSON.stringify(h.calls.post.map(p => p.table)));
      /* Без пазача записът минава и loadStockDiff() презарежда sdData - редът може да го няма. */
      const ob = h.w.sdData.find(x => x.id === 'o-big');
      ok('редът в паметта остава нерешен', !!ob && ob.type === null, ob ? JSON.stringify(ob.type) : 'няма го');
    }
  }
  {
    /* „Реално получено" = номер на документ; при Връщане иначе щеше да тръгне и POST към stock_returns */
    const h = cvetiView();
    const b = resolveBtn(h.doc, 'ОТВОРЕН ВД В РЕАЛНО', 'return');
    if (ok('бутонът „↩️ Връщане" на реда с 180486328 в „Реално" е на екрана', !!b)) {
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();
      ok('toast-ът е същият', h.calls.toast[0] === RESOLVE_MSG, h.calls.toast.join(' | '));
      ok('без PATCH и без POST', h.calls.patch.length === 0 && h.calls.post.length === 0,
        h.calls.patch.length + ' / ' + h.calls.post.length);
    }
  }
  {
    /* решен ред от долната таблица - същата функция */
    const h = cvetiView();
    h.w.resolveDiffLine('d-big', 'writein');
    await ticks(); await ticks();
    ok('решен ред с „180493275" (низ) → пак без PATCH', h.calls.patch.length === 0 && h.calls.toast[0] === RESOLVE_MSG,
      h.calls.toast.join(' | '));
  }
  {
    /* контрол: същият клик върху нормален ред ЗАПИСВА - иначе горните проверки не доказват нищо */
    const h = cvetiView();
    const b = resolveBtn(h.doc, 'ОТВОРЕН НОРМАЛЕН', 'missing');
    if (ok('контрол: „❓ Липса" на реда с 12 е на екрана', !!b)) {
      realClick(h.w, b);
      await ticks(); await ticks(); await ticks();
      const p = h.calls.patch.find(x => x.table === 'stock_differences');
      ok('контрол: PATCH към stock_differences с type missing', !!p && p.body.type === 'missing',
        h.calls.toast.join(' | '));
      ok('контрол: без toast за номер на документ', h.calls.toast.indexOf(RESOLVE_MSG) < 0);
    }
  }

  section('з) Модалът на Цвети (submitSD): 180493275 → без PATCH; 12 → PATCH');
  {
    const h = env(CVETI);
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    if (guard('openSDModal("o-big") не хвърля', () => h.w.openSDModal('o-big'))) {
      const q = h.doc.getElementById('sd-qty');
      ok('„Количество" е редактируемо поле с 180493275', !!q && q.type === 'number' && q.value === '180493275',
        q ? q.outerHTML : 'няма');
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await ticks(); await ticks();
      const t = qtyToasts(h.calls);
      ok('toast: „Количеството прилича на номер на документ (180493275), напиши брой в „Количество""',
        t.length === 1 && t[0] === 'Количеството прилича на номер на документ (180493275), напиши брой в „Количество"',
        h.calls.toast.join(' | '));
      ok('НЯМА PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch.map(p => p.body)));
      /* sd-ov стои в DOM и след затваряне (closeSDModal маха само класа open),
         а след успешен запис renderStockDiff го рисува наново като „Добави" -
         затова се проверяват класът и бутонът „Запази", не самото съществуване. */
      const sdOv = h.doc.getElementById('sd-ov');
      if (ok('модалът остава отворен', !!sdOv && sdOv.classList.contains('open') &&
            Array.from(sdOv.querySelectorAll('button')).some(b => b.textContent === 'Запази'))) {
        h.doc.getElementById('sd-qty').value = '12';
        realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
        await ticks(); await ticks();
        const p = h.calls.patch.find(x => x.table === 'stock_differences');
        if (ok('12 → PATCH към stock_differences', !!p, h.calls.toast.join(' | '))) {
          ok('quantity е 12', Number(p.body.quantity) === 12, JSON.stringify(p.body.quantity));
        }
      }
    }
  }
  {
    /* Магазинът на решен ред вижда количеството като текст и не може да го
       поправи - статусът му („Взета") не бива да се спира заради него. */
    const h = env(STORE);
    h.w.sdData = JSON.parse(JSON.stringify(LINES));
    h.w.diffReports = JSON.parse(JSON.stringify(REPS));
    if (guard('магазин: openSDModal("d-big") не хвърля', () => h.w.openSDModal('d-big'))) {
      const q = h.doc.getElementById('sd-qty');
      ok('магазин: „Количество" е заключено (hidden)', !!q && q.type === 'hidden', q ? q.outerHTML : 'няма');
      realClick(h.w, btn(h.doc.getElementById('sd-ov'), 'Запази'));
      await ticks(); await ticks();
      const p = h.calls.patch.find(x => x.table === 'stock_differences');
      ok('магазин: записът минава (PATCH)', !!p, h.calls.toast.join(' | '));
      ok('магазин: без toast за номер на документ', qtyToasts(h.calls).length === 0, h.calls.toast.join(' | '));
      if (p) ok('магазин: количеството не е пипнато', String(p.body.quantity) === '180493275', JSON.stringify(p.body.quantity));
    }
  }

  report();
})();
