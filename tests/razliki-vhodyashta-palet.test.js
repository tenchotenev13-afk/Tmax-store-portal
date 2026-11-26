/* Разлики — „🟫 Входяща за палет“ (pallet_inbound) при посока Доставчик
   (решение Д1 от срещата на 12.11.2026 + решение на Тенчо 26.11.2026; сесия
   razliki-vhodyashta-palet).

   1. Категорията я има САМО при доставчик (не при междускладов и сторна),
      и не се предлага в модала за смяна на посоката.
   2. Изборът ѝ: падащо „Палет на *“ от app_settings 'diff_pallet_suppliers';
      SAP код и наименование — само за четене, пълнят се от избора;
      „По входяща доставка“ = 0 (само за четене); „Брой палети *“; мярка „бр.“.
   3. Брой палети празно / 0 / дробно / отрицателно → отказ, без POST; без
      избран палет → отказ.
   4. Смяна на категорията обратно — отключва и чисти код, име, 0-та.
   5. Настройката паднала / празна / липсваща → червен toast, категорията се
      връща на празно, без POST (и при подаване в обход на change).
   6. Реален клик „✅ Подай бланка“ → POST към stock_differences с точните
      полета; 5-цифреният код НЕ задейства „баркод → снимка“.
   7. Заварен ред без категорията се рисува както досега; ред pallet_inbound
      — етикетът в картата и в имейла до доставчика.
   8. Нов доставчик, добавен само в настройката, излиза в падащото.
   9. Смяна на посоката от доставчик към междускладов маха категорията.

   Мутационна проверка (26.11.2026; мутант върху stock-differences.js, файлът
   върнат от копие и сверен с cmp; чистият код: exit 0, 114/114):
     М1  pallet_inbound и към 'interstore'                         → 2 ❌
     М2  diffPalletRowsProblem приема дробно (parseFloat > 0)        → 2 ❌
     М3  sdPalletRowOff не чисти кода и името                        → 1 ❌
     М4  collectDiffItems: qty от полето (parseFloat||null → null)   → 1 ❌
     М5  submitDiffReport без diffPalletRowsProblem                  → 14 ❌
     М6  sdPalletCatChange не проверява празен / паднал списък       → 13 ❌
   И шестте — exit 1. Неуловени: няма.

   Пускане:  node tests/razliki-vhodyashta-palet.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const STORE = { email: 'vraca@temax.bg', display_name: 'Управител Враца', role: 'manager', store_name: 'Враца' };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const SUP = 'ОРГАХИМ АД';

const PALLETS = [
  { label: 'Оргахим', code: '41247', name: 'ПАЛЕТ ОРГАХИМ' },
  { label: 'Интер Керамик Трейдинг', code: '66740', name: 'СКАРА ДЪРВЕНА ИНТЕР КЕРАМИК' },
  { label: 'Боро Теракол', code: '92373', name: 'ПАЛЕ БОРО 120Х80СМ' },
  { label: 'Сен-Гобен (Вебер)', code: '73869', name: 'ПАЛЕТ WEBER 120X80СМ' }
];
const settingRow = list => [{ key: 'diff_pallet_suppliers', value: JSON.stringify(list) }];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };

function env(opts) {
  opts = opts || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: opts.user || STORE, confirm: true,
    fail: opts.fail,
    data: {
      stock_differences: () => JSON.parse(JSON.stringify(opts.lines || [])), stock_returns: [], product_catalog: [],
      suppliers: [], transport_orders: [], stock_diff_swaps: [], users: [], contacts: [{ name: SUP }],
      differences_reports: () => JSON.parse(JSON.stringify(opts.reps || [{ id: 'r-new', direction: 'supplier', store_name: 'Враца',
        counterpart: SUP, photos: [], reviewed: false, created_at: '2026-11-26T08:00:00Z' }])),
      storno_notes: [], storno_note_replies: [], problem_articles: [],
      app_settings: url => (opts.settings !== undefined ? opts.settings : settingRow(PALLETS))
        .filter(r => decodeURIComponent(url).indexOf('key=eq.' + r.key) >= 0)
    }
  });
  if (!opts.lines) { h.w.sdData = []; h.w.diffReports = []; }
  return h;
}
const ov = h => h.doc.getElementById('diff-submit-ov');
const rows = h => h.doc.querySelectorAll('#diff-items .diff-item-row');
const toasts = h => h.calls.toast.join(' | ');
const repPosts = h => h.calls.post.filter(p => p.table === 'differences_reports');
const linePosts = h => h.calls.post.filter(p => p.table === 'stock_differences');
const catValues = row => Array.prototype.map.call(row.querySelector('.di-cat').options, o => o.value);

async function setDir(h, dir) {
  const sel = h.doc.getElementById('diff-direction');
  if (sel.value !== dir) { sel.value = dir; fire(h.w, sel, 'change'); }
  await settle();
  const cp = h.doc.getElementById('diff-counterpart');
  if (!cp.value) {
    if (cp.options.length > 1) cp.selectedIndex = 1;
    else { cp.innerHTML = '<option>' + SUP + '</option>'; cp.value = SUP; }
  }
}
async function openForm(h, dir) {
  h.w.openDiffSubmitModal();
  await settle();
  await setDir(h, dir || 'supplier');
  const st = h.doc.getElementById('diff-store');
  if (st && !st.value) st.value = 'Враца';
  const ord = h.doc.getElementById('diff-order-num');
  if (ord) ord.value = '4100135756';
  h.doc.getElementById('diff-docnum').value = '180486328';
}
async function setCat(h, row, cat) { const s = row.querySelector('.di-cat'); s.value = cat; fire(h.w, s, 'change'); await settle(); }
async function pick(h, row, code) { const s = row.querySelector('.di-pallet'); s.value = code; fire(h.w, s, 'change'); await settle(); }
async function addStokova(h) {
  const i = h.doc.getElementById('diff-stokova-file');
  if (!ok('има контрол за стокова', !!i)) return;
  const file = new h.w.File([new h.w.Uint8Array([1, 2, 3])], 'стокова.pdf', { type: 'application/pdf' });
  Object.defineProperty(i, 'files', { value: [file], configurable: true });
  fire(h.w, i, 'change');
  await settle();
}
async function submit(h) { realClick(h.w, btn(ov(h), 'Подай бланка')); await settle(); }
const realLbl = row => row.querySelector('.di-qty-real').closest('.di-fld').querySelector('.di-lbl').textContent;
const FAIL_MSG = 'Списъкът с палети не се зареди — опитайте пак';

(async function run() {

  section('1. Категорията — само при доставчик');
  {
    const h = env();
    await openForm(h, 'interstore');
    ok('междускладов: няма pallet_inbound', catValues(rows(h)[0]).indexOf('pallet_inbound') < 0, catValues(rows(h)[0]).join(','));
    await setDir(h, 'supplier');
    const r = rows(h)[0];
    ok('доставчик: има pallet_inbound', catValues(r).indexOf('pallet_inbound') >= 0, catValues(r).join(','));
    const opt = Array.prototype.find.call(r.querySelector('.di-cat').options, o => o.value === 'pallet_inbound');
    ok('надпис „🟫 Входяща за палет“', !!opt && opt.textContent === '🟫 Входяща за палет', opt && opt.textContent);
    ok('доставчик: другите 5 категории са си там',
      ['undelivered', 'excess', 'wrong_item', 'damaged', 'wrong_barcode'].every(c => catValues(r).indexOf(c) >= 0));
    ok('мета: без задължителни снимки, без имейл, кратко име',
      (m => m && m[2].join() === 'supplier' && m[3] === false && m[4] === null && m[5] === 'входяща за палет')(h.w.diffCatMeta('pallet_inbound')));
    ok('надписът под „Снимки“ при доставчик не я изброява', !/палет/.test(h.w.diffPhotoHintText('supplier')));
    ok('в реда още няма „Палет на“', !r.querySelector('.di-pallet'));
    ok('настройката е прочетена точно по ключа',
      h.calls.get.some(u => decodeURIComponent(u).indexOf('/app_settings?key=eq.diff_pallet_suppliers&') >= 0));
    await setDir(h, 'wrong_receipt');
    ok('сторна: няма pallet_inbound', catValues(rows(h)[0]).indexOf('pallet_inbound') < 0);
    ok('модалът за смяна на посоката я изключва (опциите)',
      h.w.diffCategoryOptionsForDirection('supplier', '', ['pallet_inbound']).indexOf('pallet_inbound') < 0 &&
      h.w.diffCategoryOptionsForDirection('supplier', '').indexOf('pallet_inbound') >= 0);
    h.close();
  }

  section('1б. Модалът за смяна на посоката (сторна → доставчик) не я предлага');
  {
    const rep = { id: 'r-wr', direction: 'wrong_receipt', store_name: 'Враца', counterpart: SUP, photos: [], reviewed: false,
      created_at: '2026-11-20T08:00:00Z', document_number: 'Ф1' };
    const ln = { id: 'l-wr', report_id: 'r-wr', store_name: 'Враца', supplier: SUP, material_code: '123', material_name: 'ЛАЙСНА',
      quantity: 2, difference_category: 'unbilled_received', type: null, status: 'new', created_at: '2026-11-20T08:00:00Z', order_number: '4100135756' };
    const h = env({ user: ADMIN, reps: [rep], lines: [ln] });
    h.w.diffReports = [rep]; h.w.sdData = [ln];
    h.w.openSDMoveModal('r-wr'); await settle();
    const sel = h.doc.querySelector('#sdm-ov .sdm-cat');
    if (ok('модалът се отваря с избор на категория', !!sel)) {
      const vals = Array.prototype.map.call(sel.options, o => o.value);
      ok('без pallet_inbound', vals.indexOf('pallet_inbound') < 0, vals.join(','));
      ok('excess е предложен (аналог)', sel.value === 'excess');
      /* В обход на опциите — твърдата защита в submitSDMove. */
      sel.insertAdjacentHTML('beforeend', '<option value="pallet_inbound">x</option>'); sel.value = 'pallet_inbound';
      realClick(h.w, btn(h.doc.getElementById('sdm-ov'), 'Върни')); await settle();
      ok('ръчно вкарана pallet_inbound → „избери категория“, без PATCH', /Ред 1: избери категория/.test(toasts(h)) && h.calls.patch.length === 0, toasts(h));
    }
    h.close();
  }

  section('2. Изборът — „Палет на *“, заключени полета, 0, брой палети');
  {
    const h = env();
    await openForm(h);
    const r = rows(h)[0];
    r.querySelector('.di-sap').value = '999'; r.querySelector('.di-name').value = 'НЕЩО ДРУГО';
    const lblBefore = realLbl(r);
    await setCat(h, r, 'pallet_inbound');
    const ps = r.querySelector('.di-pallet');
    if (ok('появява се падащо „Палет на“', !!ps)) {
      ok('надпис „Палет на *“', /Палет на \*/.test(r.querySelector('.di-pallet-wrap').textContent));
      const labels = Array.prototype.slice.call(ps.options, 1).map(o => o.textContent);
      ok('етикетите от настройката, в реда ѝ', JSON.stringify(labels) === JSON.stringify(PALLETS.map(p => p.label)), labels.join(' | '));
      ok('първата опция е празна', ps.options[0].value === '');
    }
    const sap = r.querySelector('.di-sap'), name = r.querySelector('.di-name'), qty = r.querySelector('.di-qty');
    ok('SAP и име — само за четене', sap.readOnly && name.readOnly);
    ok('SAP и име — изчистени до избор на палет', sap.value === '' && name.value === '');
    ok('„По входяща доставка“ = 0, само за четене', qty.value === '0' && qty.readOnly);
    ok('надписът става „Брой палети *“', realLbl(r) === 'Брой палети *', realLbl(r));
    ok('мярка „бр.“, заключена', r.querySelector('.di-unit').value === 'бр.' && r.querySelector('.di-unit').disabled);
    ok('без подсказка за снимки / имейл', r.querySelector('.di-hint').innerHTML === '');
    await pick(h, r, '92373');
    ok('изборът попълва кода', sap.value === '92373', sap.value);
    ok('изборът попълва името', name.value === 'ПАЛЕ БОРО 120Х80СМ', name.value);
    await pick(h, r, '41247');
    ok('друг избор — друг код и име', sap.value === '41247' && name.value === 'ПАЛЕТ ОРГАХИМ');
    await setCat(h, r, 'pallet_inbound');
    ok('повторен change на същата категория не трие избора', sap.value === '41247' && r.querySelector('.di-pallet').value === '41247');
    h.lblBefore = lblBefore;

    section('4. Смяна на категорията обратно — отключва и чисти');
    r.querySelector('.di-qty-real').value = '3';
    await setCat(h, r, 'excess');
    ok('SAP и име — отключени', !sap.readOnly && !name.readOnly);
    ok('кодът и името от палета — изчистени', sap.value === '' && name.value === '');
    ok('0-та — изчистена и отключена', qty.value === '' && !qty.readOnly);
    ok('надписът е върнат', realLbl(r) === lblBefore, realLbl(r) + ' / ' + lblBefore);
    ok('мярката — отключена', !r.querySelector('.di-unit').disabled);
    ok('„Палет на“ — махнат', !r.querySelector('.di-pallet'));
    ok('броят, писан от човека, остава', r.querySelector('.di-qty-real').value === '3');
    await setCat(h, r, '');
    ok('към „-- категория --“ — нищо не се чупи', !r.querySelector('.di-pallet') && !sap.readOnly);
    h.close();
  }

  section('3. Отказ при брой палети празно / 0 / дробно / отрицателно и без палет');
  {
    const cases = [['', 'празно'], ['0', '0'], ['2.5', 'дробно'], ['-1', 'отрицателно']];
    for (const [val, nm] of cases) {
      const h = env();
      await openForm(h);
      await addStokova(h);
      const r = rows(h)[0];
      await setCat(h, r, 'pallet_inbound');
      await pick(h, r, '41247');
      r.querySelector('.di-qty-real').value = val;
      await submit(h);
      ok('брой ' + nm + ' → „брой палети — цяло число над 0“', /Ред 1: брой палети — цяло число над 0/.test(toasts(h)), toasts(h));
      ok('брой ' + nm + ' → без POST', repPosts(h).length === 0 && linePosts(h).length === 0);
      h.close();
    }
    const h = env();
    await openForm(h);
    await addStokova(h);
    const r = rows(h)[0];
    await setCat(h, r, 'pallet_inbound');
    r.querySelector('.di-qty-real').value = '2';
    await submit(h);
    ok('без избран палет → „избери „Палет на““', /Ред 1: избери „Палет на"/.test(toasts(h)), toasts(h));
    ok('без избран палет → не казва „впиши наименование“', !/наименование/.test(toasts(h)));
    ok('без избран палет → без POST', repPosts(h).length === 0);
    h.close();
  }

  section('5. Настройката паднала / празна / липсваща');
  {
    const variants = [
      ['паднало четене (500)', { fail: { GET: /app_settings/ } }],
      ['празен масив', { settings: settingRow([]) }],
      ['ключът липсва', { settings: [] }],
      ['счупен JSON', { settings: [{ key: 'diff_pallet_suppliers', value: '[{"label":' }] }]
    ];
    for (const [nm, o] of variants) {
      const h = env(o);
      await openForm(h);
      await addStokova(h);
      const r = rows(h)[0];
      ok(nm + ': категорията стои в списъка', catValues(r).indexOf('pallet_inbound') >= 0);
      await setCat(h, r, 'pallet_inbound');
      ok(nm + ': червен toast', h.calls.toast.indexOf(FAIL_MSG) >= 0, toasts(h));
      ok(nm + ': категорията е върната на празно', r.querySelector('.di-cat').value === '');
      ok(nm + ': няма „Палет на“, полетата не са заключени', !r.querySelector('.di-pallet') && !r.querySelector('.di-sap').readOnly);
      /* В обход на change — твърдата защита при подаване. */
      r.querySelector('.di-cat').value = 'pallet_inbound';
      r.querySelector('.di-name').value = 'ПАЛЕТ'; r.querySelector('.di-qty-real').value = '2';
      h.calls.toast.length = 0;
      await submit(h);
      ok(nm + ': подаване → същият toast, без POST', h.calls.toast.indexOf(FAIL_MSG) >= 0 && repPosts(h).length === 0 && linePosts(h).length === 0, toasts(h));
      h.close();
    }
    /* „опитайте пак“: след паднало четене следващият избор чете наново. */
    let n = 0;
    const h = env({ fail: { GET: url => /app_settings/.test(url) && n++ === 0 } });
    await openForm(h);
    const r = rows(h)[0];
    await setCat(h, r, 'pallet_inbound');
    ok('първи опит — toast', h.calls.toast.indexOf(FAIL_MSG) >= 0);
    await settle();
    await setCat(h, r, 'pallet_inbound');
    ok('втори опит след ново четене — „Палет на“ се появява', !!r.querySelector('.di-pallet'), toasts(h));
    h.close();
  }

  section('6. Реален клик „✅ Подай бланка“ → POST с точните полета');
  {
    const h = env();
    await openForm(h);
    await addStokova(h);
    h.w.addDiffItemRow();
    const rs = rows(h);
    await setCat(h, rs[0], 'pallet_inbound');
    await pick(h, rs[0], '66740');
    rs[0].querySelector('.di-qty-real').value = '4';
    rs[0].querySelector('.di-comment').value = 'дойдоха с доставката';
    rs[1].querySelector('.di-sap').value = '123456'; rs[1].querySelector('.di-name').value = 'ЛАЙСНА';
    rs[1].querySelector('.di-qty').value = '5'; rs[1].querySelector('.di-qty-real').value = '3';
    await setCat(h, rs[1], 'undelivered');
    const b = btn(ov(h), 'Подай бланка');
    ok('бутонът е „✅ Подай бланка“', !!b && /✅/.test(b.textContent), b && b.textContent);
    await submit(h);
    ok('без „баркод → снимка“ (5 цифри)', !/баркод/.test(toasts(h)), toasts(h));
    ok('POST на бланката', repPosts(h).length === 1, toasts(h));
    const lp = linePosts(h)[0];
    const body = lp ? lp.body : [];
    ok('POST на редовете — 2', Array.isArray(body) && body.length === 2, JSON.stringify(body));
    const p = body[0] || {};
    ok('material_code 66740', p.material_code === '66740', p.material_code);
    ok('material_name от настройката', p.material_name === 'СКАРА ДЪРВЕНА ИНТЕР КЕРАМИК', p.material_name);
    ok('quantity 0 (число, не null)', p.quantity === 0, JSON.stringify(p.quantity));
    ok('quantity_received 4', p.quantity_received === 4, JSON.stringify(p.quantity_received));
    ok('difference_category pallet_inbound', p.difference_category === 'pallet_inbound');
    ok('unit „бр.“', p.unit === 'бр.');
    ok('reads_as_code null', p.reads_as_code === null);
    ok('коментарът е там', p.comment === 'дойдоха с доставката');
    ok('поръчката е на реда', p.order_number === '4100135756');
    ok('статус new', p.status === 'new');
    ok('без нови колони (същите ключове като обикновения ред)',
      JSON.stringify(Object.keys(p).sort()) === JSON.stringify(Object.keys(body[1] || {}).sort()), Object.keys(p).join(','));
    const q = body[1] || {};
    ok('обикновеният ред не е пипнат', q.material_code === '123456' && q.quantity === 5 && q.quantity_received === 3 && q.difference_category === 'undelivered', JSON.stringify(q));
    h.close();
  }

  section('6б. Правилата към доставчик остават (поръчка, стокова, баркод)');
  {
    const h = env();
    await openForm(h);
    const r = rows(h)[0];
    await setCat(h, r, 'pallet_inbound'); await pick(h, r, '41247');
    r.querySelector('.di-qty-real').value = '2';
    await submit(h);
    ok('без стокова → „Прикачете стоковата разписка“', /Прикачете стоковата разписка на доставчика/.test(toasts(h)) && repPosts(h).length === 0, toasts(h));
    h.doc.getElementById('diff-order-num').value = '180486328';
    h.calls.toast.length = 0;
    await addStokova(h);
    await submit(h);
    ok('входяща вместо поръчка → отказ', /Поръчка №/.test(toasts(h)) && repPosts(h).length === 0, toasts(h));
    ok('diffRowsBarcodeLike не хваща 5-цифрения код', h.w.diffRowsBarcodeLike().length === 0);
    h.close();
  }

  section('7. Заварен ред без категорията; ред pallet_inbound в картата и имейла');
  {
    const rep = { id: 'r-old', direction: 'supplier', store_name: 'Враца', counterpart: SUP, photos: [], reviewed: false,
      created_at: new Date(Date.now() - 3600e3).toISOString(), document_number: '1800', submitted_by: 'Управител Враца', general_comment: '' };
    const mk = (id, cat, code, name, q, qr) => ({ id, report_id: 'r-old', store_name: 'Враца', supplier: SUP, material_code: code,
      material_name: name, quantity: q, quantity_received: qr, quantity_supplier_doc: null, unit: 'бр.', difference_category: cat, type: null, status: 'new',
      warehouse_response: null, store_response: null, attachments: [], created_by: 'Управител Враца', created_at: rep.created_at, order_number: '4100135756' });
    const lines = [mk('l-1', null, '41247', 'ПАЛЕТ ОРГАХИМ', null, 42), mk('l-2', 'excess', '92373', 'ПАЛЕ БОРО 120Х80СМ', 1, 2),
      mk('l-3', 'pallet_inbound', '66740', 'СКАРА ДЪРВЕНА ИНТЕР КЕРАМИК', 0, 8)];
    const h = env({ user: ADMIN, reps: [rep], lines });
    h.w.sdView = 'reports'; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
    h.w.sdDirTab = 'supplier';
    h.w.loadStockDiff(); await settle();
    const card = h.doc.getElementById('diff-rep-r-old');
    if (ok('картата е там', !!card)) {
      const trs = Array.prototype.filter.call(card.querySelectorAll('tr'), tr => /41247|92373|66740/.test(tr.textContent));
      const cellOf = code => { const tr = trs.find(t => t.textContent.indexOf(code) >= 0); return tr ? tr.querySelectorAll('td')[2].textContent : null; };
      ok('ред без категория → „—“', cellOf('41247') === '—', cellOf('41247'));
      ok('заварен „излишък“ — както досега', /Излишък/.test(cellOf('92373') || ''), cellOf('92373'));
      ok('новият ред → „🟫 Входяща за палет“', /🟫 Входяща за палет/.test(cellOf('66740') || ''), cellOf('66740'));
      ok('новият ред — 0 по входяща (не „—“)', trs.find(t => t.textContent.indexOf('66740') >= 0).querySelectorAll('td')[3].textContent === '0');
    }
    const mail = h.w.diffEmailBodyHtml(rep, lines, '');
    ok('имейлът до доставчика: етикетът', mail.indexOf('🟫 Входяща за палет') >= 0);
    ok('имейлът: редът без категория — без етикета на палета', (mail.match(/Входяща за палет/g) || []).length === 1);
    ok('sdLineRoute: доставчик не се насочва', h.w.sdLineRoute(lines[2], rep) === 'warehouse');
    ok('sdRespCat: доставчик → празно', h.w.sdRespCat(lines[2], rep) === '');
    h.close();
  }

  section('8. Нов доставчик само в настройката → в падащото, без промяна в кода');
  {
    const more = PALLETS.concat([{ label: 'Билка', code: '55501', name: 'ПАЛЕТ БИЛКА' }, { label: '', code: '1', name: 'X' }]);
    const h = env({ settings: settingRow(more) });
    await openForm(h);
    const r = rows(h)[0];
    await setCat(h, r, 'pallet_inbound');
    const labels = Array.prototype.slice.call(r.querySelector('.di-pallet').options, 1).map(o => o.textContent);
    ok('„Билка“ е в падащото', labels.indexOf('Билка') >= 0, labels.join(' | '));
    ok('елемент без етикет се пропуска', labels.length === 5, labels.length);
    await pick(h, r, '55501');
    ok('изборът попълва кода и името на новия', r.querySelector('.di-sap').value === '55501' && r.querySelector('.di-name').value === 'ПАЛЕТ БИЛКА');
    h.close();
  }

  section('9. Смяна на посоката: доставчик → междускладов и обратно');
  {
    const h = env();
    await openForm(h);
    let r = rows(h)[0];
    await setCat(h, r, 'pallet_inbound'); await pick(h, r, '73869');
    r.querySelector('.di-qty-real').value = '6';
    await setDir(h, 'wrong_receipt');
    await setDir(h, 'supplier');
    r = rows(h)[0];
    /* сторна → без категорията; връщането към доставчик не я възкресява. */
    ok('през сторна: категорията е махната', r.querySelector('.di-cat').value === '', r.querySelector('.di-cat').value);
    ok('през сторна: кодът и името са махнати', r.querySelector('.di-sap').value === '' && r.querySelector('.di-name').value === '');
    ok('… и не са заключени', !r.querySelector('.di-sap').readOnly && !r.querySelector('.di-pallet'));
    h.close();
  }

  report();
})();
