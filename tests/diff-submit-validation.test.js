/* Валидацията на формата за нова бланка "Разлики" сочи кой ред е проблемният.

   Преди: collectDiffItems() изхвърляше тихо всеки ред без наименование, а
   съобщението беше общото "Добави поне един артикул с наименование" - при
   бланка с един попълнен ред (баркод + количества, но без име) това звучеше
   като "не си добавил артикул".

   Пускане:  node tests/diff-submit-validation.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, ticks } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца',
                role: 'manager', store_name: 'Враца' };

const REPORT_ROW = { id: 'r-new', store_name: 'Враца', direction: 'supplier',
                     counterpart: 'ТЕСИ ООД', reviewed: false, photos: [] };

function env() {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: STORE,
    data: { stock_differences: [], differences_reports: [REPORT_ROW],
            stock_returns: [], product_catalog: [] }
  });
  h.w.sdData = []; h.w.diffReports = [];
  h.w.openDiffSubmitModal();
  h.doc.getElementById('diff-store').value = 'Враца';
  /* Насрещната страна НЕ се избира тук: селектът се пълни асинхронно от
     updateDiffCounterpartLabel(), значи присвояване в този момент не се
     задържа. Избира се в submit(), след ticks(). */
  return h;
}

function rows(doc) { return doc.querySelectorAll('#diff-items .diff-item-row'); }
function fillRow(doc, i, vals) {
  const row = rows(doc)[i];
  if (vals.sap !== undefined) row.querySelector('.di-sap').value = vals.sap;
  if (vals.name !== undefined) row.querySelector('.di-name').value = vals.name;
  if (vals.qty !== undefined) row.querySelector('.di-qty').value = vals.qty;
  if (vals.real !== undefined) row.querySelector('.di-qty-real').value = vals.real;
  return row;
}
async function submit(h) {
  /* Празен counterpart вече спира подаването (посоката междускладов тръгва
     от празна опция) - избираме първия реален склад, както го прави и
     потребителят. Проверката на самия гейт живее в
     tests/interstore-counterpart-select.test.js. */
  await ticks();
  const cp = h.doc.getElementById('diff-counterpart');
  if (cp && !cp.value && cp.options.length > 1) cp.selectedIndex = 1;
  const ov = h.doc.getElementById('diff-submit-ov');
  const b = btn(ov, 'Изпрати') || btn(ov, 'Подай');
  realClick(h.w, b);
  await ticks(); await ticks(); await ticks();
  return h.calls;
}

(async function () {

  section('1. Един започнат ред без наименование — сочи точния ред');
  {
    const h = env();
    fillRow(h.doc, 0, { sap: '3800123456789', qty: '2', real: '1' });
    const calls = await submit(h);
    ok('съобщението сочи ред 1',
      calls.toast.some(t => /Ред 1: впиши наименование/.test(t)), calls.toast.join(' | '));
    ok('НЕ излиза старото общо съобщение',
      !calls.toast.some(t => /Добави поне един артикул/.test(t)), calls.toast.join(' | '));
    ok('нищо не се записва', calls.post.length === 0);
    ok('фокусът отива в полето за наименование на ред 1',
      h.doc.activeElement === rows(h.doc)[0].querySelector('.di-name'),
      h.doc.activeElement && h.doc.activeElement.className);
  }

  section('2. Втори ред без име НЕ се губи тихо');
  {
    const h = env();
    h.w.addDiffItemRow();
    fillRow(h.doc, 0, { sap: '34989', name: 'ЩУЦЕР МЕТАЛЕН', qty: '5', real: '4' });
    fillRow(h.doc, 1, { sap: '3800123456789', qty: '2', real: '1' });
    ok('формата има 2 реда', rows(h.doc).length === 2, String(rows(h.doc).length));
    const calls = await submit(h);
    ok('подаването е спряно', calls.post.length === 0, 'POST: ' + calls.post.length);
    ok('съобщението сочи ред 2',
      calls.toast.some(t => /Ред 2: впиши наименование/.test(t)), calls.toast.join(' | '));
  }

  section('3. Два проблемни реда — изброяват се и двата');
  {
    const h = env();
    h.w.addDiffItemRow(); h.w.addDiffItemRow();
    fillRow(h.doc, 0, { sap: '111', qty: '1' });
    fillRow(h.doc, 1, { sap: '34989', name: 'ЩУЦЕР', qty: '5' });
    fillRow(h.doc, 2, { sap: '222', qty: '3' });
    const calls = await submit(h);
    ok('съобщението е в множествено число и сочи 1 и 3',
      calls.toast.some(t => /Редове 1, 3: впиши наименование/.test(t)), calls.toast.join(' | '));
    ok('нищо не се записва', calls.post.length === 0);
  }

  section('4. Празен ред (нищо въведено) не спира подаването');
  {
    const h = env();
    h.w.addDiffItemRow();
    fillRow(h.doc, 0, { sap: '34989', name: 'ЩУЦЕР МЕТАЛЕН', qty: '5', real: '4' });
    /* ред 2 остава изцяло празен - това е нормално, не е грешка */
    const calls = await submit(h);
    ok('няма съобщение за наименование',
      !calls.toast.some(t => /впиши наименование/.test(t)), calls.toast.join(' | '));
    ok('бланката се подава', calls.post.length > 0, calls.toast.join(' | '));
  }

  section('5. Съвсем празна форма — старото общо съобщение');
  {
    const h = env();
    const calls = await submit(h);
    ok('излиза "Добави поне един артикул с наименование"',
      calls.toast.some(t => /Добави поне един артикул с наименование/.test(t)), calls.toast.join(' | '));
    ok('нищо не се записва', calls.post.length === 0);
  }

  section('6. Нов артикул без SAP — ръчното име минава до базата');
  {
    const h = env();
    fillRow(h.doc, 0, { sap: '3800123456789', name: 'НОВ АРТИКУЛ БЕЗ SAP', qty: '2', real: '1' });
    const calls = await submit(h);
    ok('няма грешка', !calls.toast.some(t => /впиши наименование|поне един артикул/.test(t)),
      calls.toast.join(' | '));
    const lines = calls.post.filter(p => /stock_differences/.test(p.url));
    if (ok('редът стига до stock_differences', lines.length > 0,
      calls.post.map(p => p.url.split('/').pop()).join(', '))) {
      const body = Array.isArray(lines[0].body) ? lines[0].body[0] : lines[0].body;
      ok('material_name е ръчното име', body.material_name === 'НОВ АРТИКУЛ БЕЗ SAP',
        JSON.stringify(body.material_name));
      ok('material_code е баркодът, както е въведен', body.material_code === '3800123456789',
        JSON.stringify(body.material_code));
    }
  }

  section('7. diffRowsMissingName() пряко');
  {
    const h = env();
    h.w.addDiffItemRow();
    fillRow(h.doc, 0, { name: 'ИМА ИМЕ', qty: '1' });
    fillRow(h.doc, 1, { comment: undefined, sap: '', qty: '' });
    ok('празен ред не се брои', h.w.diffRowsMissingName().length === 0,
      JSON.stringify(h.w.diffRowsMissingName()));
    rows(h.doc)[1].querySelector('.di-comment').value = 'нещо';
    ok('ред само с коментар вече се брои',
      JSON.stringify(h.w.diffRowsMissingName()) === '[2]', JSON.stringify(h.w.diffRowsMissingName()));
    rows(h.doc)[1].querySelector('.di-name').value = '  ';
    ok('име само от интервали не се брои за име',
      JSON.stringify(h.w.diffRowsMissingName()) === '[2]', JSON.stringify(h.w.diffRowsMissingName()));
    rows(h.doc)[1].querySelector('.di-name').value = 'вече има';
    ok('след въвеждане на име списъкът е празен',
      h.w.diffRowsMissingName().length === 0, JSON.stringify(h.w.diffRowsMissingName()));
  }

  report();
})();
