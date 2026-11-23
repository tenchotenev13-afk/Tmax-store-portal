/* Разлики, етап 7а — регистър „🏷️ Проблемни артикули“ (решения на Миглена
   14.10 и 22.10; Тенчо 22.10 — отделен под-таб в Разлики).

   1. Под-табът (трети бутон в превключвателя): списък с активните, търсене по
      кода и по „чете се като“ (и по имената), чип „Затворени (N)“ — видим и
      при 0, кликът показва затворените.
   2. Писане — видимо за 'razliki_co' и 'razliki_barcode', невидимо за admin
      без групата, обект и склад (проверки само по <button>); нов запис →
      точният POST; задължителни полета; дубликат на активен код → червен
      toast, 0 POST; отказ от базата (23505) → червен toast с кода, не се
      поглъща; редакция → точният PATCH; затваряне → точният PATCH.
   3. Предупреждението във формата за подаване: по material_code, по
      reads_as_code — ВСИЧКИ активни записи с този reads_as_code (проверка на
      живо 19.11: 53597 → 62081 и 53598; 54229 → трите оградки), смесен
      случай в една кутийка; затворен запис → няма; паднало четене → няма кутийка,
      няма toast към обекта, подаването минава.

   Мутационна проверка (19.11.2026, мутант върху stock-differences.js, файлът —
   върнат от копие и сверен с cmp; чистият код: exit 0, 54/54; след поправката 19.11 — 59/59):
     М1  admin пише без групата                                  → 2 ❌
     М2  дубликатът на активен код минава                        → 3 ❌
     М3  предупреждение и за затворен запис                      → 3 ❌
     М4  отказът от базата (23505) се поглъща                    → 2 ❌
     М5  търсенето без „чете се като“                            → 1 ❌
     М6  паднало четене — toast към обекта                       → 2 ❌
     М7  регистърът се чете при всяко презареждане на модула      → 1 ❌
     М8  само първия запис по „чете се като“ (53597, 54229)      → 3 ❌
     М9  смесеният случай губи другите записи                    → 1 ❌
   Всички — exit 1.

   Пускане:  node tests/razliki-etap7a.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, btn, ticks, fire } = H;

const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  vas:   { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:    { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: 'Логистичен склад Търговище' },
  store: { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: 'Карлово' }
};
const DBU = [
  { id: 'u-adm', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-vs', notify_groups: ['co', 'razliki_barcode'], is_regional: false, assigned_stores: [] },
  { id: 'u-wh', notify_groups: [], is_regional: false, assigned_stores: [] },
  { id: 'u-st', notify_groups: [], is_regional: false, assigned_stores: [] }
];
const pa = (id, code, name, rcode, rname, extra) => Object.assign({ id, material_code: code, material_name: name, reads_as_code: rcode, reads_as_name: rname,
  store_action: 'за преналепяне', note: null, photos: [], valid_from: '2026-10-22', status: 'active', source: 'seed' }, extra || {});
const PA = [
  pa('p1', '62081', 'СТОЛ PVC MEGA БЯЛ', '53597', 'СТОЛ PVC MEGA T.ЗЕЛЕН'),
  pa('p2', '78500', 'РЪКАВИЦИ TPE L', '78499', 'РЪКАВИЦИ TPE S/M'),
  pa('p3', '34924', 'ФИЛТЪР ЗА ВОДА', null, null, { note: 'ситен, неясен, не се чете от четец' }),
  pa('p4', '11111', 'СТАР ЗАПИС', '22222', 'СТАР ДРУГ', { status: 'closed', closed_by: 'Миглена Павлова', closed_at: '2026-11-01T10:00:00Z' })
];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, o) {
  o = o || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true, fail: o.fail,
    data: Object.assign({
      stock_differences: [], differences_reports: [], stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: DBU, storno_notes: [], storno_note_replies: [],
      contacts: [{ name: 'Логистичен склад Търговище' }, { name: 'Пловдив' }],
      problem_articles: () => clone(o.pa || PA)
    }, o.data || {})
  });
  h.errs = [];
  const ce = h.w.console.error;
  h.w.console.error = function(){ h.errs.push(Array.prototype.join.call(arguments, ' ')); };
  return h;
}
async function openPa(h) {
  h.w.loadStockDiff(); await settle();
  realClick(h.w, h.doc.querySelector('button[data-sd-view="problems"]')); await settle();
}
const codes = h => Array.prototype.map.call(h.doc.querySelectorAll('#sd-pa-body tr.sd-pa-row'), tr => tr.querySelector('td').textContent.trim()).join(',');
const writeBtns = h => Array.prototype.filter.call(h.doc.querySelectorAll('button'),
  b => b.id === 'sd-pa-new' || /openSDPaModal|closeSDPa/.test(b.getAttribute('onclick') || ''));
const clickSave = h => { const b = h.doc.getElementById('sdpa-save'); if (b) realClick(h.w, b); };
const toasts = h => h.calls.toast.join(' | ');
const paPosts = h => h.calls.post.filter(p => p.table === 'problem_articles');
const paPatches = h => h.calls.patch.filter(p => p.table === 'problem_articles');
/* Липсващо поле (модалът се е затворил) не хвърля — иначе мутант, който пуска
   дубликата, събаря теста с изключение вместо с паднали проверки. */
const setV = (h, id, v) => { const el = h.doc.getElementById(id); if (el) el.value = v; };

(async function run() {

  section('1. Под-табът — списък, търсене, „Затворени (N)“');
  {
    const h = env(U.store);
    await openPa(h);
    const sw = h.doc.querySelector('button[data-sd-view="problems"]');
    ok('бутонът „🏷️ Проблемни артикули (3)“ в превключвателя', !!sw && sw.textContent.trim() === '🏷️ Проблемни артикули (3)', sw && sw.textContent);
    ok('регистърът е на екрана', !!h.doc.getElementById('sd-pa'));
    ok('по подразбиране — само активните, по код', codes(h) === '34924,62081,78500', codes(h));
    ok('без търсенето на бланките в този изглед', !h.doc.getElementById('sd-search-input'));
    const row = h.doc.querySelector('#sd-pa-body tr.sd-pa-row[data-id="p1"]');
    const cells = row ? Array.prototype.map.call(row.querySelectorAll('td'), td => td.textContent.trim()) : [];
    ok('ред: код, име, „чете се като“, действие, бележка, от кога, статус',
      cells[0] === '62081' && cells[1] === 'СТОЛ PVC MEGA БЯЛ' && cells[2] === '53597 СТОЛ PVC MEGA T.ЗЕЛЕН' && cells[3] === 'за преналепяне' && cells[5] === '22.10.2026' && cells[6] === 'Активен', JSON.stringify(cells));
    const chip = h.doc.getElementById('sd-pa-closed-chip');
    ok('чип „Затворени (1)“', !!chip && chip.textContent.trim() === 'Затворени (1)', chip && chip.textContent);

    const s = h.doc.getElementById('sd-pa-search');
    s.value = '53597'; fire(h.w, s, 'input'); await ticks();
    ok('търсене по „чете се като“ 53597 → 62081', codes(h) === '62081', codes(h));
    s.value = '78500'; fire(h.w, s, 'input'); await ticks();
    ok('търсене по кода 78500 → 78500', codes(h) === '78500', codes(h));
    s.value = 'филтър'; fire(h.w, s, 'input'); await ticks();
    ok('търсене по име (малки букви) → 34924', codes(h) === '34924', codes(h));
    s.value = '99999'; fire(h.w, s, 'input'); await ticks();
    ok('няма съвпадение → ред „Няма активни записи по това търсене“', !!h.doc.getElementById('sd-pa-empty') && /по това търсене/.test(h.doc.getElementById('sd-pa-empty').textContent));
    s.value = ''; fire(h.w, s, 'input'); await ticks();

    realClick(h.w, h.doc.getElementById('sd-pa-closed-chip')); await settle();
    ok('клик „Затворени“ → само 11111', codes(h) === '11111', codes(h));
    const st = h.doc.querySelector('#sd-pa-body tr.sd-pa-row td:nth-child(7)');
    ok('статус „Затворен · 01.11 · Миглена Павлова“', !!st && /Затворен · 01\.11 · Миглена Павлова/.test(st.textContent), st && st.textContent);
    realClick(h.w, h.doc.getElementById('sd-pa-closed-chip')); await settle();
    ok('втори клик → пак активните', codes(h) === '34924,62081,78500', codes(h));
    h.close();
  }
  {
    const h = env(U.store, { pa: PA.filter(p => p.status === 'active') });
    await openPa(h);
    const chip = h.doc.getElementById('sd-pa-closed-chip');
    ok('без затворени — чипът „Затворени (0)“ е видим', !!chip && chip.textContent.trim() === 'Затворени (0)');
    realClick(h.w, chip); await settle();
    ok('… кликът → „Няма затворени записи“', !!h.doc.getElementById('sd-pa-empty') && /Няма затворени записи/.test(h.doc.getElementById('sd-pa-empty').textContent));
    h.close();
  }

  section('2. Писане — кой вижда бутоните');
  for (const [name, u, can] of [['Миглена (razliki_co)', U.migl, true], ['Василка (razliki_barcode)', U.vas, true],
    ['admin без група', U.admin, false], ['обект', U.store, false], ['склад', U.wh, false]]) {
    const h = env(u);
    await openPa(h);
    const b = writeBtns(h);
    ok(name + ': ' + (can ? '„➕ Нов запис“ + ✏️ и ✅ на 3 реда (7 бутона)' : '0 бутона за писане'), can ? b.length === 7 : b.length === 0, String(b.length));
    if (!can) {
      h.w.openSDPaModal(null); await ticks();
      ok(name + ': openSDPaModal направо — без модал', !h.doc.getElementById('sdpa-ov'));
    }
    h.close();
  }

  section('2б. Нов запис → POST; задължителни; дубликат; отказ от базата');
  {
    const h = env(U.migl);
    await openPa(h);
    realClick(h.w, h.doc.getElementById('sd-pa-new')); await ticks();
    ok('модалът е отворен, „Какво прави обектът“ = „за преналепяне“', !!h.doc.getElementById('sdpa-ov') && h.doc.getElementById('sdpa-action').value === 'за преналепяне');
    clickSave(h); await settle();
    ok('без код → toast, 0 POST', paPosts(h).length === 0 && /задължителни/.test(toasts(h)), toasts(h));
    setV(h, 'sdpa-code', ' 62081 ');
    clickSave(h); await settle();
    ok('дубликат на активен код 62081 → червен toast с кода, 0 POST', paPosts(h).length === 0 && /Вече има активен запис за код 62081/.test(toasts(h)), toasts(h));
    setV(h, 'sdpa-code', '11111');        /* затвореният не е пречка */
    setV(h, 'sdpa-name', 'НОВ АРТИКУЛ');
    setV(h, 'sdpa-rcode', '22222');
    setV(h, 'sdpa-rname', '');
    setV(h, 'sdpa-action', '');
    clickSave(h); await settle();
    ok('без „Какво прави обектът“ → 0 POST', paPosts(h).length === 0);
    setV(h, 'sdpa-action', 'за преналепяне');
    setV(h, 'sdpa-note', 'проверка 19.11');
    setV(h, 'sdpa-from', '2026-11-19');
    clickSave(h); await settle();
    const p = paPosts(h)[0];
    ok('точно 1 POST към problem_articles', paPosts(h).length === 1);
    ok('тялото — точно полетата', !!p && JSON.stringify(Object.keys(p.body).sort()) === JSON.stringify(['bulletin_on', 'bulletin_stores', 'created_by', 'material_code', 'material_name', 'note', 'photo_required', 'reads_as_code', 'reads_as_name', 'source', 'status', 'store_action', 'valid_from']), p && JSON.stringify(p.body));
    ok('стойностите', !!p && p.body.material_code === '11111' && p.body.material_name === 'НОВ АРТИКУЛ' && p.body.reads_as_code === '22222' && p.body.reads_as_name === null &&
      p.body.store_action === 'за преналепяне' && p.body.note === 'проверка 19.11' && p.body.valid_from === '2026-11-19' && p.body.status === 'active' && p.body.source === 'office' && p.body.created_by === 'Миглена Павлова', p && JSON.stringify(p.body));
    ok('след записа — регистърът се чете пак', h.calls.get.filter(u => /problem_articles/.test(u)).length === 2);
    ok('модалът е затворен', !h.doc.getElementById('sdpa-ov'));
    h.close();
  }
  {
    const h = env(U.migl, { fail: { POST: () => ({ status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "problem_articles_active_code_uq"' } }) } });
    await openPa(h);
    realClick(h.w, h.doc.getElementById('sd-pa-new')); await ticks();
    setV(h, 'sdpa-code', '55555');
    clickSave(h); await settle();
    ok('базата отказва (23505) → червен toast с кода', /Вече има активен запис за код 55555 \(базата отказа\)/.test(toasts(h)), toasts(h));
    ok('… модалът остава отворен (не е погълнато)', !!h.doc.getElementById('sdpa-ov'));
    h.close();
  }

  section('2в. Редакция и затваряне → PATCH');
  {
    const h = env(U.vas);
    await openPa(h);
    realClick(h.w, h.doc.querySelector('button.sd-pa-edit[data-id="p2"]')); await ticks();
    ok('редакция: полетата са попълнени', h.doc.getElementById('sdpa-code').value === '78500' && h.doc.getElementById('sdpa-rcode').value === '78499');
    setV(h, 'sdpa-note', 'кашон L');
    clickSave(h); await settle();
    const pt = paPatches(h)[0];
    ok('редакция: PATCH id=eq.p2', !!pt && /problem_articles\?id=eq\.p2$/.test(pt.url), pt && pt.url);
    ok('редакция: note + updated_by / updated_at, без status / source', !!pt && pt.body.note === 'кашон L' && pt.body.updated_by === 'Василка Шикова' && !!pt.body.updated_at && !('status' in pt.body) && !('source' in pt.body), pt && JSON.stringify(pt.body));
    ok('редакция на същия код — не е „дубликат“', !/Вече има активен/.test(toasts(h)));
    h.close();
  }
  {
    const h = env(U.migl);
    await openPa(h);
    realClick(h.w, h.doc.querySelector('button.sd-pa-close[data-id="p3"]')); await settle();
    const pt = paPatches(h)[0];
    ok('затваряне: PATCH id=eq.p3', !!pt && /problem_articles\?id=eq\.p3$/.test(pt.url), pt && pt.url);
    ok('затваряне: точно status / closed_by / closed_at', !!pt && JSON.stringify(Object.keys(pt.body).sort()) === JSON.stringify(['closed_at', 'closed_by', 'status']) &&
      pt.body.status === 'closed' && pt.body.closed_by === 'Миглена Павлова' && Math.abs(new Date(pt.body.closed_at) - Date.now()) < 60000, pt && JSON.stringify(pt.body));
    ok('затваряне: без DELETE', h.calls.del.length === 0);
    h.close();
  }

  section('3. Предупреждението във формата за подаване');
  const openForm = async h => {
    h.w.loadStockDiff(); await settle();
    h.w.openDiffSubmitModal(); await settle();
  };
  const typeSap = async (h, v) => {
    const inp = h.doc.querySelector('#diff-items .diff-item-row .di-sap');
    inp.value = v; fire(h.w, inp, 'input'); await ticks();
    const box = h.doc.querySelector('#diff-items .diff-item-row .di-pa-warn');
    return box ? box.textContent.trim() : null;
  };
  {
    const h = env(U.store);
    await openForm(h);
    let t = await typeSap(h, '62081');
    ok('по material_code: „⚠️ Проблемен артикул: 62081 … — баркодът чете като 53597 … В обектите: за преналепяне.“',
      t === '⚠️ Проблемен артикул: 62081 СТОЛ PVC MEGA БЯЛ — баркодът чете като 53597 СТОЛ PVC MEGA T.ЗЕЛЕН. В обектите: за преналепяне.', t);
    t = await typeSap(h, '53597');
    ok('по reads_as_code: „… 53597 … — този баркод се чете и за 62081 …“',
      t === '⚠️ Проблемен артикул: 53597 СТОЛ PVC MEGA T.ЗЕЛЕН — този баркод се чете и за 62081 СТОЛ PVC MEGA БЯЛ. В обектите: за преналепяне.', t);
    t = await typeSap(h, '34924');
    ok('без „чете като“ + бележка', /баркодът не се чете правилно\. В обектите: за преналепяне\. \(ситен, неясен, не се чете от четец\)$/.test(t || ''), t);
    t = await typeSap(h, '11111');
    ok('затворен запис (11111) → няма кутийка', t === '', t);
    t = await typeSap(h, '22222');
    ok('затворен запис по reads_as (22222) → няма кутийка', t === '', t);
    t = await typeSap(h, '99999');
    ok('непознат код → няма кутийка', t === '', t);
    t = await typeSap(h, ' 78500 ');
    ok('с интервали → пак намира 78500', /^⚠️ Проблемен артикул: 78500/.test(t || ''), t);
    h.close();
  }
  {
    const h = env(U.store, { fail: { GET: /problem_articles/ } });
    await openForm(h);
    const t = await typeSap(h, '62081');
    ok('паднало четене → няма кутийка', t === '', t);
    ok('… без toast към обекта', !/problem_articles|Проблемн/.test(toasts(h)), toasts(h));
    ok('… console.error', h.errs.some(e => /problem_articles/.test(e)), h.errs.join(' | '));
    /* Подаването минава: попълваме формата като обекта и „Подай“. */
    const dir = h.doc.getElementById('diff-direction');
    if (dir && dir.value !== 'interstore') { dir.value = 'interstore'; fire(h.w, dir, 'change'); await ticks(); }
    const cp = h.doc.getElementById('diff-counterpart');
    if (cp && !cp.value && cp.options.length > 1) cp.selectedIndex = 1;
    const dn = h.doc.getElementById('diff-docnum'); if (dn) dn.value = 'Т-123';
    const row = h.doc.querySelector('#diff-items .diff-item-row');
    row.querySelector('.di-sap').value = '62081';
    row.querySelector('.di-name').value = 'СТОЛ';
    row.querySelector('.di-qty').value = '2';
    row.querySelector('.di-qty-real').value = '1';
    const cat = row.querySelector('.di-cat'); cat.value = 'undelivered';
    realClick(h.w, btn(h.doc.getElementById('diff-submit-ov'), 'Подай')); await settle();
    ok('… подаването минава (POST differences_reports)', h.calls.post.some(p => p.table === 'differences_reports'), toasts(h));
    h.w.loadStockDiff(); await settle();
    realClick(h.w, h.doc.querySelector('button[data-sd-view="problems"]')); await settle();
    ok('… в под-таба — червен ред „не можа да се зареди“', !!h.doc.getElementById('sd-pa-failed'));
    h.close();
  }
  section('3б. Един баркод за няколко записа (проверка на живо 19.11)');
  {
    /* Реалните от регистъра: 53597 е „чете се като“ и за 62081, и за 53598;
       54229 — за трите оградки. Смесен случай: 53597 е и свой запис. */
    const MULTI = [
      pa('m1', '62081', 'СТОЛ PVC MEGA ПОД.56/42/78СМ БЯЛ', '53597', 'СТОЛ PVC MEGA ПОД.56/42/78СМ T.ЗЕЛЕН'),
      pa('m2', '53598', 'СТОЛ PVC MEGA ПОД.56/42/78СМ Т.КАФЯВ', '53597', 'СТОЛ PVC MEGA ПОД.56/42/78СМ T.ЗЕЛЕН'),
      pa('m3', '54489', 'ОГРАДКА ЗЕЛ.', '54229', 'ОГРАДКА КАФ.'),
      pa('m4', '54490', 'ОГРАДКА БЯЛА', '54229', 'ОГРАДКА КАФ.'),
      pa('m5', '54492', 'ОГРАДКА КЕРАМ', '54229', 'ОГРАДКА КАФ.', { note: 'кашонът е с етикет на кафява' }),
      pa('m6', '54493', 'ОГРАДКА ЗАТВОРЕНА', '54229', 'ОГРАДКА КАФ.', { status: 'closed' })
    ];
    const h = env(U.store, { pa: MULTI });
    await openForm(h);
    let t = await typeSap(h, '53597');
    ok('53597 → и двата записа (53598 и 62081)',
      t === '⚠️ Проблемен артикул: 53597 СТОЛ PVC MEGA ПОД.56/42/78СМ T.ЗЕЛЕН — този баркод се чете и за 53598 СТОЛ PVC MEGA ПОД.56/42/78СМ Т.КАФЯВ, 62081 СТОЛ PVC MEGA ПОД.56/42/78СМ БЯЛ. В обектите: за преналепяне.', t);
    t = await typeSap(h, '54229');
    ok('54229 → и трите оградки (не и затворената 54493), бележката на 54492',
      t === '⚠️ Проблемен артикул: 54229 ОГРАДКА КАФ. — този баркод се чете и за 54489 ОГРАДКА ЗЕЛ., 54490 ОГРАДКА БЯЛА, 54492 ОГРАДКА КЕРАМ. В обектите: за преналепяне. (кашонът е с етикет на кафява)', t);
    t = await typeSap(h, '62081');
    ok('по material_code — без промяна (62081 → чете като 53597)',
      t === '⚠️ Проблемен артикул: 62081 СТОЛ PVC MEGA ПОД.56/42/78СМ БЯЛ — баркодът чете като 53597 СТОЛ PVC MEGA ПОД.56/42/78СМ T.ЗЕЛЕН. В обектите: за преналепяне.', t);
    h.close();
  }
  {
    /* Смесен: 53597 е material_code на свой запис (чете като 99999) И
       reads_as_code на 62081 и 53598 — и двете в една кутийка. */
    const MIX = [
      pa('x1', '62081', 'СТОЛ БЯЛ', '53597', 'СТОЛ ЗЕЛЕН'),
      pa('x2', '53598', 'СТОЛ КАФЯВ', '53597', 'СТОЛ ЗЕЛЕН'),
      pa('x3', '53597', 'СТОЛ ЗЕЛЕН', '99999', 'ДРУГ АРТИКУЛ', { store_action: 'проверка в склада' })
    ];
    const h = env(U.store, { pa: MIX });
    await openForm(h);
    const t = await typeSap(h, '53597');
    ok('смесен: своят запис + „този баркод се чете и за“ двата, в една кутийка',
      t === '⚠️ Проблемен артикул: 53597 СТОЛ ЗЕЛЕН — баркодът чете като 99999 ДРУГ АРТИКУЛ. Този баркод се чете и за 53598 СТОЛ КАФЯВ, 62081 СТОЛ БЯЛ. В обектите: проверка в склада / за преналепяне.', t);
    ok('смесен: точно една кутийка', h.doc.querySelectorAll('#diff-items .diff-item-row .sd-pa-warn').length === 1);
    h.close();
  }
  {
    /* Регистърът се чете веднъж при отваряне на модула. */
    const h = env(U.store);
    h.w.loadStockDiff(); await settle();
    h.w.loadStockDiff(); await settle();
    ok('две презареждания на модула → 1 четене на регистъра', h.calls.get.filter(u => /problem_articles/.test(u)).length === 1, String(h.calls.get.filter(u => /problem_articles/.test(u)).length));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
