/* Разлики — „Чете се като (код)“ на реда „грешен баркод“ и ✏️ по подател
   (решения на Тенчо 22–23.11.2026 след теста на Миглена Павлова, писмо 20.11
   „тест проблемни артикули“; сесия razliki-chete-se-kato).

   1. Формата: поле „Чете се като (код)“ само при wrong_barcode; смяна към
      друга категория го маха и изчиства. Реален change по <select>.
   2. POST към stock_differences носи reads_as_code (trim), null при празно и
      при друга категория. Имейлът и push-ът при насочване (sdRouteNotify) —
      „87790 КАПАК … · чете се като 87798“.
   3. Надписът на реда — картата на бланката, „Решени редове“, печатът; с
      име от product_catalog и без; при друга категория — нищо. Excel —
      колона „Чете се като“ (последна).
   4. „➕ В регистъра“ предпопълва reads_as_code и reads_as_name (каталога).
   5. ✏️ „Коригирай количество/SAP код“ за обекта — само на бланка, подадена от
      потребител на същия обект (sdIsStoreSubmitter, правилото на 🗑 от
      8c5b811): Управител Петрич — няма на бланката на „Миглена Павлова“, има
      на бланката на „Склад Петрич“; директното отваряне също спира.
   Проверките „няма бутон“ гледат само <button>.

   Мутационна проверка (23.11.2026; мутант върху stock-differences.js, файлът
   върнат с git checkout и сверен с git diff; чистият код: exit 0):
     М1  sdReadsAsFieldSync не маха полето при друга категория   → 2 ❌
     М2  POST без reads_as_code                                    → 5 ❌
     М3  openSDPaFromLine без reads_as_code / reads_as_name        → 3 ❌
     М4  correctBtn без sdStoreMayCorrect                          → 2 ❌
   И четирите — exit 1. Чистият код: 45/45.

   Пускане:  node tests/razliki-chete-se-kato.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  mgr:   { id: 'u-pm', email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич' },
  sklad: { id: 'u-ps', email: 'sklad.petrich@temax.bg', display_name: 'Склад Петрич', role: 'sklad', store_name: 'Петрич' }
};
const DBU = [
  { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', store_name: 'Централен офис', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', store_name: 'Централен офис', notify_groups: ['razliki_co', 'razliki_barcode'], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-pm', email: 'petrich@temax.bg', display_name: 'Управител Петрич', store_name: 'Петрич', notify_groups: [], is_regional: false, assigned_stores: [], active: true },
  { id: 'u-ps', email: 'sklad.petrich@temax.bg', display_name: 'Склад Петрич', store_name: 'Петрич', notify_groups: [], is_regional: false, assigned_stores: [], active: true }
];
function usersFor(url) {
  const m = /store_name=eq\.([^&]+)/.exec(url);
  if (m) { const st = decodeURIComponent(m[1]); return DBU.filter(u => u.store_name === st); }
  const id = /id=eq\.([^&]+)/.exec(url);
  if (id) return DBU.filter(u => u.id === decodeURIComponent(id[1]));
  return DBU;
}
const CAT = [{ sap_code: '87798', product_name: 'КАПАК СЕДАЛО БЯЛ', default_unit: 'бр.' }];
function catalogFor(url) {
  const u = decodeURIComponent(url);
  const m = /sap_code=in\.\(([^)]*)\)/.exec(u);
  if (m) { const codes = m[1].split(',').map(s => s.replace(/"/g, '')); return CAT.filter(c => codes.indexOf(c.sap_code) >= 0); }
  const e = /sap_code=eq\.([^&]+)/.exec(u);
  if (e) return CAT.filter(c => c.sap_code === e[1]);
  return [];
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const recent = () => new Date(Date.now() - 3600 * 1000).toISOString();
const line = (id, rid, cat, extra) => Object.assign({ id, report_id: rid, store_name: 'Петрич', supplier: WH, material_code: '8779' + id.slice(-1),
  material_name: 'КАПАК ' + id, quantity: 2, unit: 'бр.', difference_category: cat, type: null, status: 'new',
  warehouse_response: null, store_response: null, attachments: [], created_by: 'Склад Петрич', created_at: recent(), reads_as_code: null }, extra || {});
const rep = (id, extra) => Object.assign({ id, direction: 'interstore', store_name: 'Петрич', counterpart: WH, document_number: '1800' + id,
  doc_date: '2026-11-20', submitted_by: 'Склад Петрич', general_comment: '', photos: [], reviewed: false, created_at: recent(),
  email_sent_at: null, email_pending: null, email_skipped_at: null }, extra || {});

function env(user, opts) {
  opts = opts || {};
  const fake = { push: [], mail: [] };
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true,
    data: {
      stock_differences: () => JSON.parse(JSON.stringify(opts.lines || [])), stock_returns: [], product_catalog: catalogFor, suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: usersFor, contacts: [{ name: WH }],
      differences_reports: () => JSON.parse(JSON.stringify(opts.reps || [])), storno_notes: [], storno_note_replies: [],
      problem_articles: []
    }
  });
  h.w.pushToPeople = (names, title, msg) => { fake.push.push({ names, title, msg }); return Promise.resolve({ ok: true }); };
  h.w.sendEmail = (to, subject, html) => { fake.mail.push({ to, subject, html }); return Promise.resolve({ ok: true }); };
  h.w.transportOrders = [];
  h.fake = fake;
  return h;
}
async function load(h, view) {
  h.w.sdView = view || 'reports';
  h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all'; h.w.sdStoreFilter = ''; h.w.sdSearch = '';
  h.w.sdDirTab = 'interstore';
  h.w.loadStockDiff(); await settle();
}
const card = (h, rid) => h.doc.getElementById('diff-rep-' + rid);
const toasts = h => h.calls.toast.join(' | ');
const rows = h => h.doc.querySelectorAll('#diff-items .diff-item-row');
async function setCat(h, row, cat) { const s = row.querySelector('.di-cat'); s.value = cat; fire(h.w, s, 'change'); await settle(); }
const correctBtns = el => el ? Array.prototype.filter.call(el.querySelectorAll('button'), b => /openSDCorrectModal\(/.test(b.getAttribute('onclick') || '')) : [];

(async function run() {

  async function openForm(h) {
    h.w.openDiffSubmitModal(); await settle();
    const sel = h.doc.getElementById('diff-direction');
    if (sel.value !== 'interstore') { sel.value = 'interstore'; fire(h.w, sel, 'change'); await settle(); }
    h.doc.getElementById('diff-counterpart').value = WH;
    const st = h.doc.getElementById('diff-store'); if (st && !st.value) st.value = 'Петрич';
  }

  section('1. Формата — полето само при „грешен баркод“');
  {
    const h = env(U.sklad, { reps: [rep('rn')] });
    await openForm(h);
    const r0 = rows(h)[0];
    ok('без категория — полето го няма', !r0.querySelector('.di-reads'));
    await setCat(h, r0, 'undelivered');
    ok('„недоставен“ — полето го няма', !r0.querySelector('.di-reads'));
    await setCat(h, r0, 'wrong_barcode');
    const inp = r0.querySelector('.di-reads');
    ok('„грешен баркод“ — полето се появява', !!inp);
    ok('… с надпис „Чете се като (код)“', !!inp && /Чете се като \(код\)/.test(inp.getAttribute('placeholder') || ''));
    if (inp) inp.value = '87798';
    await setCat(h, r0, 'wrong_barcode');
    ok('повторен change на същата категория не трие въведеното', !!r0.querySelector('.di-reads') && r0.querySelector('.di-reads').value === '87798');
    await setCat(h, r0, 'pack_mismatch');
    ok('смяна към друга категория — полето изчезва', !r0.querySelector('.di-reads'));
    await setCat(h, r0, 'wrong_barcode');
    ok('обратно към „грешен баркод“ — полето е празно', !!r0.querySelector('.di-reads') && r0.querySelector('.di-reads').value === '');
    h.close();
  }

  section('2. POST носи reads_as_code; имейл и push при насочване');
  {
    const h = env(U.sklad, { reps: [rep('rn')] });
    await openForm(h);
    h.w.addDiffItemRow(); h.w.addDiffItemRow();
    const rs = rows(h);
    const fill = (r, i) => { r.querySelector('.di-sap').value = '8779' + i; r.querySelector('.di-name').value = 'КАПАК ' + i; r.querySelector('.di-qty').value = '3'; };
    rs.forEach(fill);
    await setCat(h, rs[0], 'wrong_barcode'); rs[0].querySelector('.di-reads').value = '  87798 ';
    await setCat(h, rs[1], 'wrong_barcode'); rs[1].querySelector('.di-reads').value = '   ';
    await setCat(h, rs[2], 'wrong_barcode'); rs[2].querySelector('.di-reads').value = '55555';
    await setCat(h, rs[2], 'undelivered');
    const pi = h.doc.querySelector('#diff-submit-ov input[onchange="diffUploadPhoto(this)"][multiple]');
    const file = new h.w.File([new h.w.Uint8Array([1, 2, 3])], 'снимка.jpg', { type: 'application/octet-stream' });
    Object.defineProperty(pi, 'files', { value: [file], configurable: true });
    fire(h.w, pi, 'change'); await settle();
    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай бланка')); await settle();
    const post = h.calls.post.find(p => p.table === 'stock_differences');
    const body = post && Array.isArray(post.body) ? post.body : [];
    ok('POST с 3 реда', body.length === 3, toasts(h));
    ok('ред 1: reads_as_code „87798“ (trim)', body[0] && body[0].reads_as_code === '87798', JSON.stringify(body[0]));
    ok('ред 2: празно → null (ключът го има)', body[1] && 'reads_as_code' in body[1] && body[1].reads_as_code === null, JSON.stringify(body[1]));
    ok('ред 3: друга категория → null, въпреки въведеното преди смяната', body[2] && 'reads_as_code' in body[2] && body[2].reads_as_code === null, JSON.stringify(body[2]));
    const m = h.fake.mail.find(x => x.html.indexOf('КАПАК 0') >= 0);
    ok('имейл: „87790 КАПАК 0 — 3 бр. · чете се като 87798“', !!m && m.html.indexOf('<li>87790 КАПАК 0 — 3 бр. · чете се като 87798</li>') >= 0, m && m.html);
    ok('имейл: ред без код — без „чете се като“', !!m && m.html.indexOf('<li>87791 КАПАК 1 — 3 бр.</li>') >= 0, m && m.html);
    const p = h.fake.push.find(x => x.msg.indexOf('КАПАК 0') >= 0);
    ok('push: „… · чете се като 87798“', !!p && p.msg.indexOf('87790 КАПАК 0 — 3 бр. · чете се като 87798') >= 0, p && p.msg);
    ok('sdRouteItemText: друга категория — без „чете се като“',
      h.w.sdRouteItemText({ material_code: '1', material_name: 'X', quantity: null, difference_category: 'undelivered', reads_as_code: '5' }) === '1 X');
    h.close();
  }

  const RD = rep('rd', { submitted_by: 'Склад Петрич' });
  const LD = [
    line('l1', 'rd', 'wrong_barcode', { material_code: '87793', material_name: 'КАПАК СЕДАЛО', reads_as_code: '87798' }),
    line('l2', 'rd', 'wrong_barcode', { material_code: '87794', material_name: 'КАПАК ДРУГ', reads_as_code: '55555' }),
    line('l3', 'rd', 'undelivered', { material_code: '87795', material_name: 'КАПАК ТРЕТИ', reads_as_code: '12345' }),
    line('l4', 'rd', 'wrong_barcode', { material_code: '87796', material_name: 'КАПАК БЕЗ', reads_as_code: null })
  ];

  section('3. Надписът на реда — картата, печатът, Excel');
  {
    const h = env(U.admin, { reps: [RD], lines: LD });
    await load(h);
    const c = card(h, 'rd');
    ok('картата я има', !!c);
    const ra = c ? Array.prototype.map.call(c.querySelectorAll('.sd-reads-as'), x => x.textContent.trim()) : [];
    ok('карта: „чете се като 87798 КАПАК СЕДАЛО БЯЛ“ (име от каталога)', ra.indexOf('🔎 чете се като 87798 КАПАК СЕДАЛО БЯЛ') >= 0, JSON.stringify(ra));
    ok('карта: без име в каталога — само кодът', ra.indexOf('🔎 чете се като 55555') >= 0, JSON.stringify(ra));
    ok('карта: точно 2 надписа (другата категория и празното — без)', ra.length === 2, JSON.stringify(ra));
    ok('карта: надписът е под категорията', !!c && Array.prototype.some.call(c.querySelectorAll('td'), td => /Грешен баркод/.test(td.textContent) && td.querySelector('.sd-reads-as')));
    ok('каталогът е четен веднъж, само с кодовете от редовете', h.calls.get.filter(u => /product_catalog/.test(u)).length === 1 &&
      /sap_code=in\./.test(h.calls.get.find(u => /product_catalog/.test(u)) || '') && (h.calls.get.find(u => /product_catalog/.test(u)) || '').indexOf('12345') < 0);
    h.w.renderDiffPrint(RD);
    const pr = h.doc.getElementById('mod-print');
    const pt = pr ? Array.prototype.map.call(pr.querySelectorAll('.dp-reads'), x => x.textContent.trim()) : [];
    ok('печат: „чете се като 87798 КАПАК СЕДАЛО БЯЛ“ и „чете се като 55555“', pt.length === 2 && pt[0] === 'чете се като 87798 КАПАК СЕДАЛО БЯЛ' && pt[1] === 'чете се като 55555', JSON.stringify(pt));
    const aoa = h.w.sdExcelRows(h.w.sdData.filter(l => l.report_id === 'rd'));
    const hdr = aoa[0], col = hdr.indexOf('Чете се като');
    ok('Excel: колона „Чете се като“ — последна', col === hdr.length - 1, JSON.stringify(hdr));
    const byName = n => aoa.find(r => r[4] === n) || [];
    ok('Excel: 87798 + име', byName('КАПАК СЕДАЛО')[col] === '87798 КАПАК СЕДАЛО БЯЛ', JSON.stringify(byName('КАПАК СЕДАЛО')));
    ok('Excel: без име — само кодът', byName('КАПАК ДРУГ')[col] === '55555');
    ok('Excel: друга категория — празно', byName('КАПАК ТРЕТИ')[col] === '');
    ok('Excel: без код — празно', byName('КАПАК БЕЗ')[col] === '');
    ok('Excel: всеки ред е с дължината на заглавието', aoa.every(r => r.length === hdr.length));
    h.close();
  }

  section('3б. „Решени редове“ — надписът под артикула');
  {
    const lines = [line('t1', 'rt', 'wrong_barcode', { material_name: 'КАПАК РЕШЕН', reads_as_code: '87798', type: 'return', status: 'new' })];
    const h = env(U.admin, { reps: [rep('rt', { reviewed: true })], lines });
    await load(h, 'rows');
    const tr = h.doc.getElementById('sd-line-t1');
    ok('редът е в „Решени редове“', !!tr);
    const ra = tr ? tr.querySelector('.sd-reads-as') : null;
    ok('„Решени редове“: „чете се като 87798 КАПАК СЕДАЛО БЯЛ“', !!ra && ra.textContent.trim() === '🔎 чете се като 87798 КАПАК СЕДАЛО БЯЛ', ra && ra.textContent);
    h.close();
  }

  section('4. „➕ В регистъра“ — предпопълва двете полета');
  {
    const h = env(U.migl, { reps: [RD], lines: LD });
    await load(h);
    const b1 = h.doc.querySelector('button.sd-pa-add[data-lid="l1"]');
    ok('бутон „➕ В регистъра“ на реда', !!b1);
    if (b1) { realClick(h.w, b1); await settle(); }
    const v = id => { const el = h.doc.getElementById(id); return el ? el.value : null; };
    ok('код по система 87793', v('sdpa-code') === '87793');
    ok('„чете като — код“ = 87798', v('sdpa-rcode') === '87798', v('sdpa-rcode'));
    ok('„чете като — име“ = КАПАК СЕДАЛО БЯЛ (каталога)', v('sdpa-rname') === 'КАПАК СЕДАЛО БЯЛ', v('sdpa-rname'));
    ok('„Какво прави обектът“ — без промяна', v('sdpa-action') === 'за преналепяне');
    const ov = h.doc.getElementById('sdpa-ov'); if (ov) ov.remove();
    const b2 = h.doc.querySelector('button.sd-pa-add[data-lid="l2"]');
    if (b2) { realClick(h.w, b2); await settle(); }
    ok('без име в каталога: код 55555, име празно', v('sdpa-rcode') === '55555' && v('sdpa-rname') === '');
    const ov2 = h.doc.getElementById('sdpa-ov'); if (ov2) ov2.remove();
    const b4 = h.doc.querySelector('button.sd-pa-add[data-lid="l4"]');
    if (b4) { realClick(h.w, b4); await settle(); }
    ok('ред без код: двете полета празни', v('sdpa-rcode') === '' && v('sdpa-rname') === '');
    h.close();
  }

  section('5. ✏️ „Коригирай количество/SAP код“ — по подател');
  {
    const RM = rep('rm', { submitted_by: 'Миглена Павлова' });
    const RS = rep('rs', { submitted_by: 'Склад Петрич' });
    const lines = [line('m1', 'rm', 'undelivered', { created_by: 'Миглена Павлова' }), line('s1', 'rs', 'undelivered')];
    const h = env(U.mgr, { reps: [RM, RS], lines });
    await load(h);
    ok('картите са на екрана', !!card(h, 'rm') && !!card(h, 'rs'));
    ok('Управител Петрич: без ✏️ на бланката на Миглена Павлова', correctBtns(card(h, 'rm')).length === 0);
    ok('Управител Петрич: ✏️ на бланката на Склад Петрич', correctBtns(card(h, 'rs')).length >= 1);
    h.w.openSDCorrectModal('m1'); await settle();
    ok('директното отваряне на реда на Миглена — без модал', !h.doc.getElementById('sdc-ov'));
    ok('… с червен toast', /обектът коригира само свои бланки/.test(toasts(h)), toasts(h));
    const b = correctBtns(card(h, 'rs'))[0];
    if (b) { realClick(h.w, b); await settle(); }
    ok('клик ✏️ на бланката на Склад Петрич — модалът се отваря', !!h.doc.getElementById('sdc-ov'));
    h.close();
    /* Непрочетен списък с подателите — без бутон (както 🗑). */
    const h2 = env(U.mgr, { reps: [RS], lines: [line('s1', 'rs', 'undelivered')] });
    h2.w.sdLoadStoreSubmitters = () => { h2.w.sdStoreSubmitters = { store: 'Петрич', names: null }; return Promise.resolve(); };
    await load(h2);
    ok('непрочетен списък — без ✏️', correctBtns(card(h2, 'rs')).length === 0);
    h2.close();
    /* Офисът — както досега (sdStoreMayCorrect не го пипа). */
    const h3 = env(U.admin, {});
    ok('admin: sdStoreMayCorrect → true (не е обект)', h3.w.sdStoreMayCorrect(RM) === true);
    h3.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
