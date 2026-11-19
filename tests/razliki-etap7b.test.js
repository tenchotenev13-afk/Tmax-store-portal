/* Разлики, етап 7б — „➕ В регистъра“ от ред „грешен баркод“ + значка
   „🏷️ Проблемен артикул“ в Минуси (решение на Тенчо 22.10 — регистърът се
   пълни от офиса и по сигнал на обекта; Минуси само чете). Регистърът — 7а
   (problem_articles, право за писане razliki_co / razliki_barcode).

   1. Разлики, ред с категория wrong_barcode (междускладов и доставчик,
      отворен или приключен):
      · код БЕЗ активен запис + право → бутон „➕ В регистъра“; admin без
        групата, обект, склад → няма бутон (само по <button>);
      · код С активен запис → надпис „🏷️ В регистъра“ за всички роли, без
        бутона; кликът → под-табът с търсене по кода;
      · затворен запис не е „в регистъра“; ред с друга категория — нищо;
      · клик на бутона → модалът от 7а, попълнен от реда; запис → точният POST
        със source 'diff' и source_line_id; отказ от базата → червен toast,
        модалът остава.
   2. Минуси (заредени ЗАЕДНО с Разлики, в реда от index.html — правило 8):
      значка по material_code и по reads_as_code, с текста на кутийката от 7а
      (sdPaWarnText); затворен запис / непознат код → без значка; паднало
      четене → без значка, console.error, без toast; регистърът се чете
      веднъж при отваряне на Минуси.
   3. 7а не е счупен: кутийката във формата — същият текст.

   Мутационна проверка (19.11.2026, мутант върху stock-differences.js / minusi.js,
   файловете — върнати от копие и сверени с cmp; чистият код: exit 0, 67/67,
   razliki-etap7a — exit 0):
     М1  бутонът и при съществуващ запис (без надписа)          → 13 ❌
     М2  POST без source_line_id                                → 2 ❌
     М3  значка (и кутийка) и за затворен запис                 → 2 ❌
     М4  бутонът без право (admin без група, обект, склад)      → 9 ❌
     М5  source остава office                                   → 1 ❌
     М6  Минуси четат регистъра при всяко зареждане             → 1 ❌
     М7  значката — копие само по material_code (без reads_as)  → 1 ❌
   Всички — exit 1.

   Пускане:  node tests/razliki-etap7b.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const U = {
  admin: { id: 'u-adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  vas:   { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  wh:    { id: 'u-wh', email: 'wh@temax.bg', display_name: 'Склад Търговище', role: 'logistics', store_name: WH },
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
  pa('p4', '11111', 'СТАР ЗАПИС', '22222', 'СТАР ДРУГ', { status: 'closed', closed_by: 'Миглена Павлова', closed_at: '2026-11-01T10:00:00Z' })
];
const REPS = [
  { id: 'r1', direction: 'interstore', store_name: 'Карлово', counterpart: WH, document_number: 'D1', doc_date: '2026-11-17', submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' },
  { id: 'r2', direction: 'supplier', store_name: 'Карлово', counterpart: 'ТЕСИ ООД', document_number: 'D2', doc_date: '2026-11-17', submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' }
];
const ln = (id, rid, code, cat, extra) => Object.assign({ id, report_id: rid, store_name: 'Карлово', supplier: rid === 'r1' ? WH : 'ТЕСИ ООД', material_code: code,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new', comment: null,
  warehouse_response: null, store_response: null, attachments: [] }, extra || {});
const LINES = [
  ln('w1', 'r1', '62081', 'wrong_barcode'),                                       /* има активен запис → надпис */
  ln('w2', 'r1', '77777', 'wrong_barcode', { comment: 'чете като стола' }),       /* няма запис → бутон */
  ln('w3', 'r1', '88888', 'undelivered'),                                         /* друга категория → нищо */
  ln('w4', 'r2', '66666', 'wrong_barcode'),                                       /* доставчик, няма запис → бутон */
  ln('w6', 'r2', '11111', 'wrong_barcode')                                        /* само затворен запис → бутон */
];

const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, o) {
  o = o || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true, fail: o.fail,
    data: {
      stock_differences: clone(o.lines || LINES), differences_reports: clone(o.reps || REPS), stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: DBU, storno_notes: [], storno_note_replies: [],
      contacts: [{ name: WH }, { name: 'ТЕСИ ООД' }],
      problem_articles: () => clone(o.pa || PA)
    }
  });
  return h;
}
async function open(h, view) {
  h.w.sdView = view || 'reports';
  h.w.loadStockDiff(); await settle();
  h.w.sdShowDone = { r1: true, r2: true };
  h.w.renderStockDiff(); await settle();
}
/* Офисът вижда бланките по подтаб (Доставчици / Междускладови) — редът се
   търси в подтаба на своята бланка; складът няма подтабове. */
const DIR_OF = { w1: 'interstore', w2: 'interstore', w3: 'interstore', w4: 'supplier', w6: 'supplier' };
const row = (h, id) => {
  if (DIR_OF[id] && h.w.sdDirTabsActive() && h.w.sdView === 'reports' && h.w.sdDirTab !== DIR_OF[id]) { h.w.sdDirTab = DIR_OF[id]; h.w.renderStockDiff(); }
  return rowNow(h, id);
};
const rowNow = (h, id) => Array.prototype.find.call(h.doc.querySelectorAll('[id^="diff-rep-"] tr'), tr => {
  const td = tr.querySelectorAll('td')[1]; return td && td.textContent.indexOf('АРТ ' + id) === 0;
}) || null;
const addBtn = (h, id) => { const r = row(h, id); return r ? r.querySelector('button.sd-pa-add') : null; };
const label = (h, id) => { const r = row(h, id); return r ? r.querySelector('.sd-pa-in') : null; };
const anyAdd = h => Array.prototype.filter.call(h.doc.querySelectorAll('button'), b => /openSDPaFromLine/.test(b.getAttribute('onclick') || ''));
const toasts = h => h.calls.toast.join(' | ');
const paPosts = h => h.calls.post.filter(p => p.table === 'problem_articles');

/* ── Минуси: фалшив PostgREST, като в minusi-open-diff.test.js ── */
const PD = 'Карлово';
const PLANTS = [{ plant: '7701', store_name: PD }];
let mseq = 0;
const mv = material => ({ id: 'mv-' + (++mseq), plant: '7701', store_name: PD, material, material_desc: 'АРТИКУЛ ' + material,
  mvt_type: '955', qty: 2, uom: 'БР', mat_doc: '49100' + String(mseq).padStart(5, '0'), doc_item: '1', doc_year: 2026, posting_date: '2026-11-10',
  real_code: null, reason_id: null, employee_name: null, note: null, action: null, filled_by: null, filled_at: null });
function resp(status, body) {
  const t = body == null ? '' : JSON.stringify(body);
  return Promise.resolve({ ok: status < 300, status, json: () => t ? Promise.resolve(JSON.parse(t)) : Promise.reject(new SyntaxError('empty')), text: () => Promise.resolve(t) });
}
function envMn(user, db) {
  const h = boot({ modules: ['client-orders.js', 'stock-returns.js', 'stock-differences.js', 'revaluation.js', 'revisions.js', 'notifications.js', 'minusi.js'], user, data: {} });
  h.errs = [];
  h.w.console.error = function(){ h.errs.push(Array.prototype.join.call(arguments, ' ')); };
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    const tbl = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    const q = decodeURIComponent(u.split('?')[1] || '');
    db.log.push({ m, tbl, q });
    if (m !== 'GET') return resp(405, { message: 'not in fake' });
    if (tbl === 'app_settings') return resp(200, [{ key: 'minus_stores', value: PD }]);
    if (tbl === 'minus_plants') return resp(200, PLANTS);
    if (/offset=[1-9]/.test(q)) return resp(200, []);
    if (tbl === 'minus_movements') return resp(200, db.movs.map(x => Object.assign({}, x)));
    if (tbl === 'problem_articles') return db.failPa ? resp(500, { message: 'boom' }) : resp(200, clone(db.pa || PA));
    return resp(200, []);
  };
  return h;
}
const mnRow = (h, id) => h.doc.getElementById('mn-row-' + id);
const mnPa = (h, id) => { const r = mnRow(h, id); const b = r ? r.querySelector('.mn-pa') : null; return b ? b.textContent.trim() : null; };

(async function run() {

  section('1. Разлики — „➕ В регистъра“ / „🏷️ В регистъра“ на ред wrong_barcode');
  for (const [name, u, can] of [['Миглена (razliki_co)', U.migl, true], ['Василка (razliki_barcode)', U.vas, true],
    ['admin без група', U.admin, false], ['обект', U.store, false], ['склад', U.wh, false]]) {
    const h = env(u);
    await open(h);
    if (u === U.wh) {
      /* Складът вижда само междускладовата бланка (r1). */
      ok(name + ': w1 — надпис „🏷️ В регистъра“', !!label(h, 'w1') && label(h, 'w1').textContent.trim() === '🏷️ В регистъра');
      ok(name + ': 0 бутона „➕ В регистъра“', anyAdd(h).length === 0, String(anyAdd(h).length));
      h.close(); continue;
    }
    ok(name + ': w1 (код с активен запис) — надпис, без бутон', !!label(h, 'w1') && !addBtn(h, 'w1'));
    ok(name + ': w1 — надписът не е <button>', !!label(h, 'w1') && label(h, 'w1').tagName !== 'BUTTON' && !label(h, 'w1').closest('button'));
    ['w2', 'w4', 'w6'].forEach(id => ok(name + ': ' + id + ' → ' + (can ? 'бутон' : 'няма бутон'), !!addBtn(h, id) === can));
    ['w2', 'w4', 'w6'].forEach(id => ok(name + ': ' + id + ' → без надпис', !label(h, id)));
    ok(name + ': w3 (друга категория) — нищо', !addBtn(h, 'w3') && !label(h, 'w3'));
    const tot = ['interstore', 'supplier'].reduce((n, d) => { h.w.sdDirTab = d; h.w.renderStockDiff(); return n + anyAdd(h).length; }, 0);
    ok(name + ': общо бутони в двата подтаба ' + (can ? 3 : 0), tot === (can ? 3 : 0), String(tot));
    h.close();
  }

  section('1б. Бутонът → модалът попълнен → POST със source diff');
  {
    const h = env(U.migl);
    await open(h);
    realClick(h.w, addBtn(h, 'w2')); await ticks();
    const v = id => (h.doc.getElementById(id) || {}).value;
    ok('модалът е отворен', !!h.doc.getElementById('sdpa-ov'));
    ok('попълнен: код, име, бележка = коментарът на обекта; „чете се като“ празно',
      v('sdpa-code') === '77777' && v('sdpa-name') === 'АРТ w2' && v('sdpa-note') === 'чете като стола' && v('sdpa-rcode') === '' && v('sdpa-rname') === '' && v('sdpa-action') === 'за преналепяне',
      JSON.stringify([v('sdpa-code'), v('sdpa-name'), v('sdpa-note'), v('sdpa-rcode'), v('sdpa-action')]));
    h.doc.getElementById('sdpa-rcode').value = '62082';
    realClick(h.w, h.doc.getElementById('sdpa-save')); await settle();
    const p = paPosts(h)[0];
    ok('точно 1 POST', paPosts(h).length === 1);
    ok('тялото — полетата на 7а + source_line_id', !!p && JSON.stringify(Object.keys(p.body).sort()) === JSON.stringify(['created_by', 'material_code', 'material_name', 'note', 'reads_as_code', 'reads_as_name', 'source', 'source_line_id', 'status', 'store_action', 'valid_from']), p && JSON.stringify(p.body));
    ok('source \'diff\', source_line_id = w2, код / бележка / чете като', !!p && p.body.source === 'diff' && p.body.source_line_id === 'w2' && p.body.material_code === '77777' &&
      p.body.note === 'чете като стола' && p.body.reads_as_code === '62082' && p.body.status === 'active' && p.body.created_by === 'Миглена Павлова', p && JSON.stringify(p.body));
    h.close();
  }
  {
    /* „➕ Нов запис“ от под-таба — пак source 'office', без source_line_id
       (атрибутите от предишен модал не остават). */
    const h = env(U.migl);
    await open(h);
    realClick(h.w, addBtn(h, 'w4')); await ticks();
    h.doc.getElementById('sdpa-ov').remove();
    realClick(h.w, h.doc.querySelector('button[data-sd-view="problems"]')); await settle();
    realClick(h.w, h.doc.getElementById('sd-pa-new')); await ticks();
    h.doc.getElementById('sdpa-code').value = '33333';
    realClick(h.w, h.doc.getElementById('sdpa-save')); await settle();
    const p = paPosts(h)[0];
    ok('„➕ Нов запис“ — source office, без source_line_id', !!p && p.body.source === 'office' && !('source_line_id' in p.body), p && JSON.stringify(p.body));
    h.close();
  }
  {
    const h = env(U.migl, { fail: { POST: () => ({ status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "problem_articles_active_code_uq"' } }) } });
    await open(h);
    realClick(h.w, addBtn(h, 'w2')); await ticks();
    realClick(h.w, h.doc.getElementById('sdpa-save')); await settle();
    ok('отказ от базата → червен toast с кода, модалът остава', /Вече има активен запис за код 77777 \(базата отказа\)/.test(toasts(h)) && !!h.doc.getElementById('sdpa-ov'), toasts(h));
    h.close();
  }
  {
    /* Дубликат: някой е добавил 77777 междувременно — регистърът в паметта го има. */
    const h = env(U.migl);
    await open(h);
    realClick(h.w, addBtn(h, 'w2')); await ticks();
    h.w.sdPa.push({ id: 'pz', material_code: '77777', status: 'active' });
    realClick(h.w, h.doc.getElementById('sdpa-save')); await settle();
    ok('дубликат на активен код → червен toast, 0 POST', paPosts(h).length === 0 && /Вече има активен запис за код 77777/.test(toasts(h)), toasts(h));
    h.close();
  }
  {
    const h = env(U.store);
    await open(h);
    const lb = label(h, 'w1');
    ok('обект: надписът „🏷️ В регистъра“ е там', !!lb);
    if (lb) { realClick(h.w, lb); await settle(); }
    const s = h.doc.getElementById('sd-pa-search');
    const codes = Array.prototype.map.call(h.doc.querySelectorAll('#sd-pa-body tr.sd-pa-row'), tr => tr.querySelector('td').textContent.trim()).join(',');
    ok('клик на надписа (обект) → под-табът, търсене „62081“', !!h.doc.getElementById('sd-pa') && !!s && s.value === '62081' && codes === '62081', codes);
    h.w.openSDPaFromLine('w2'); await ticks();
    ok('обект: openSDPaFromLine направо — без модал', !h.doc.getElementById('sdpa-ov'));
    h.close();
  }
  {
    /* „Решени редове“ — приключен ред wrong_barcode. */
    const lines = [ln('t1', 'r2', '44444', 'wrong_barcode', { type: 'writein', status: 'taken' })];
    const reps = [Object.assign({}, REPS[1], { reviewed: true })];
    const h = env(U.migl, { lines, reps });
    h.w.sdDirTab = 'supplier'; h.w.sdFilter = 'all'; h.w.sdTypeFilter = 'all';
    await open(h, 'rows');
    const b = h.doc.querySelector('button.sd-pa-add[data-lid="t1"]');
    ok('„Решени редове“: приключен ред wrong_barcode → бутон', !!b);
    h.close();
  }

  section('2. Минуси — значка „🏷️ Проблемен артикул“');
  {
    mseq = 0;
    const db = { movs: [mv('62081'), mv('53597'), mv('11111'), mv('99999'), mv('22222')], log: [] };
    const h = envMn(U.store, db);
    await h.w.loadMinusi(); for (let i = 0; i < 10; i++) await ticks();
    ok('по material_code (62081): значката с текста от 7а',
      mnPa(h, 'mv-1') === '🏷️ Проблемен артикул СТОЛ PVC MEGA БЯЛ'.replace('СТОЛ', '62081 СТОЛ') + ' — баркодът чете като 53597 СТОЛ PVC MEGA T.ЗЕЛЕН. В обектите: за преналепяне.', mnPa(h, 'mv-1'));
    ok('по reads_as_code (53597): „… този баркод се чете и за 62081 …“',
      mnPa(h, 'mv-2') === '🏷️ Проблемен артикул 53597 СТОЛ PVC MEGA T.ЗЕЛЕН — този баркод се чете и за 62081 СТОЛ PVC MEGA БЯЛ. В обектите: за преналепяне.', mnPa(h, 'mv-2'));
    ok('затворен запис (11111) → без значка', mnPa(h, 'mv-3') === null);
    ok('затворен запис по reads_as (22222) → без значка', mnPa(h, 'mv-5') === null);
    ok('непознат код → без значка', mnPa(h, 'mv-4') === null);
    ok('една логика с формата: текстът е sdPaWarnText', mnPa(h, 'mv-1') === '🏷️ Проблемен артикул ' + h.doc.createRange().createContextualFragment('<div>' + h.w.sdPaWarnText('62081') + '</div>').textContent);
    await h.w.loadMinusi(); for (let i = 0; i < 10; i++) await ticks();
    ok('регистърът се чете веднъж (две зареждания на Минуси)', db.log.filter(x => x.tbl === 'problem_articles').length === 1, String(db.log.filter(x => x.tbl === 'problem_articles').length));
    ok('значката остава след второто зареждане', !!mnPa(h, 'mv-1'));
    h.close();
  }
  {
    mseq = 0;
    const db = { movs: [mv('62081')], log: [], failPa: true };
    const h = envMn(U.store, db);
    await h.w.loadMinusi(); for (let i = 0; i < 10; i++) await ticks();
    ok('паднало четене → без значка', mnPa(h, 'mv-1') === null);
    ok('… console.error', h.errs.some(e => /problem_articles/.test(e)), h.errs.join(' | '));
    ok('… без toast', !h.calls.toast.some(t => /problem_articles|Проблемн/.test(String(t))), h.calls.toast.join(' | '));
    ok('… редът на минуса е на екрана', !!mnRow(h, 'mv-1'));
    h.close();
  }

  section('3. 7а не е счупен — кутийката във формата');
  {
    const h = env(U.store);
    await open(h);
    h.w.openDiffSubmitModal(); await settle();
    const inp = h.doc.querySelector('#diff-items .diff-item-row .di-sap');
    inp.value = '62081'; fire(h.w, inp, 'input'); await ticks();
    const box = h.doc.querySelector('#diff-items .diff-item-row .di-pa-warn');
    ok('същият текст като в 7а', !!box && box.textContent.trim() === '⚠️ Проблемен артикул: 62081 СТОЛ PVC MEGA БЯЛ — баркодът чете като 53597 СТОЛ PVC MEGA T.ЗЕЛЕН. В обектите: за преналепяне.', box && box.textContent);
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
