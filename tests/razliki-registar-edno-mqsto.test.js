/* Разлики — „🏷️ Проблемни артикули“: снимки в записа, „📄 Бланката“ и едно
   записване вместо три (писмо на Миглена 27.11.2026, решения на Тенчо 27.11;
   сесия razliki-registar-edno-mqsto).

   1. Снимки: „📷 Добави снимка“ в нов запис и в ✏️ (качват се при „Запази“ в
      problem-articles/register/), „✕“ (нова — не се качва; запазена — маха се
      от масива и файлът се трие след записа; паднало триене → жълт toast,
      записът остава), паднало качване → червен toast и 0 запис. Запис от ред:
      „Снимки от бланката“ — снимките на бланката без стоковата и снимките на
      реда (без PDF), отметнати; при запис се КОПИРАТ на нов път (изтриването
      на бланката трие файловете ѝ). Миниатюри в реда на регистъра и до 3 в
      кутийката във формата.
   2. „📄 Бланката“: реален клик → бланката (горе — „Бланки за преглед“;
      приключена — „Решени редове“ с подчертан ред), за обекта също; изтрит
      ред → сив бутон с title „Бланката е изтрита“, без onclick.
   3. „✅ Приключи реда с това указание“: без право (razliki_barcode без
      насочване, ред от доставчик) — няма блок; с отметка → POST + PATCH на
      реда със същите полета като бутона и известия към обекта и склада;
      другият ред със същия код — само ако е отметнат; ред с друг код — не се
      предлага; паднал PATCH → червен toast, редът остава отворен; паднал
      POST → 0 PATCH.
   Заредени заедно с bulletin.js в реда от index.html.

   Мутационна проверка (28.11.2026, мутант върху stock-differences.js, файлът
   — върнат от копие и сверен с cmp; чистият код: exit 0, 56/56):
     Д1 М1  копие → връзка към файла на бланката                → 5 ❌
     Д1 М2  паднало качване не спира записа                     → 5 ❌
     Д1 М3  стоковата се предлага                                → 4 ❌
     Д1 М4  „✕“ на запазена не трие файла                       → 2 ❌
     Д1 М5  кутийката — до 5 миниатюри                           → 1 ❌
     Д2 М6  изтрит ред → активен бутон                           → 1 ❌
     Д2 М7  редът не се подчертава                               → 1 ❌
     Д2 М8  кликът не скача                                      → 4 ❌
     Д3 М9  отметка без право                                    → 2 ❌
     Д3 М10 вторият ред се приключва и неотметнат                → 3 ❌
     Д3 М11 приключва и при паднал POST                          → 1 ❌
     Д3 М12 паднало приключване — без червен toast               → 1 ❌
     Д3 М13 предлага ред с друг код                              → 5 ❌
   Всички — exit 1. Неуловени: няма.

   Пускане:  node tests/razliki-registar-edno-mqsto.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, ticks, fire } = H;

const WH = 'Логистичен склад Търговище';
const U = {
  migl:  { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  vas:   { id: 'u-vs', email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] },
  store: { id: 'u-st', email: 'karlovo@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: 'Карлово' }
};
const DBU = [
  { id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [] },
  { id: 'u-vs', notify_groups: ['co', 'razliki_barcode'], is_regional: false, assigned_stores: [] },
  { id: 'u-st', notify_groups: [], is_regional: false, assigned_stores: [] }
];
const SB = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
const PUB = SB + '/storage/v1/object/public/bulletin-files/';
const REG = 'problem-articles/register/';
const pa = (id, code, extra) => Object.assign({ id, material_code: code, material_name: 'АРТ ' + code, reads_as_code: null, reads_as_name: null,
  store_action: 'за преналепяне', note: null, photos: [], valid_from: '2026-11-20', status: 'active', source: 'seed', bulletin_on: false }, extra || {});
const PA = [
  pa('p1', '62081', { photos: [{ url: PUB + REG + 'old1.jpg', name: 'old1.jpg' }], reads_as_code: '53597' }),
  pa('p2', '34924', { source: 'diff', source_line_id: 'w5' }),
  pa('p3', '45454', { source: 'diff', source_line_id: 'gone1' }),
  pa('p4', '56565', { source: 'diff', source_line_id: 'w1', photos: [1, 2, 3, 4].map(i => ({ url: PUB + REG + 'q' + i + '.jpg', name: 'q' + i })) })
];
const REPS = [
  { id: 'r1', direction: 'interstore', store_name: 'Карлово', counterpart: WH, document_number: 'D1', doc_date: '2026-11-17', submitted_by: 'Карлово', general_comment: '',
    photos: [{ url: PUB + 'differences/a.jpg', name: 'a.jpg' }, { url: PUB + 'differences/st.jpg', name: 'st.jpg', kind: 'stokova' }, { url: PUB + 'differences/doc.pdf', name: 'doc.pdf' }],
    reviewed: false, created_at: '2026-11-17T08:00:00Z' },
  { id: 'r2', direction: 'supplier', store_name: 'Карлово', counterpart: 'ТЕСИ ООД', document_number: 'D2', doc_date: '2026-11-17', submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: false, created_at: '2026-11-17T08:00:00Z' },
  { id: 'r3', direction: 'interstore', store_name: 'Карлово', counterpart: WH, document_number: 'D3', doc_date: '2026-11-10', submitted_by: 'Карлово', general_comment: '', photos: [], reviewed: true, created_at: '2026-11-10T08:00:00Z' }
];
const ln = (id, rid, code, cat, extra) => Object.assign({ id, report_id: rid, store_name: 'Карлово', supplier: rid === 'r2' ? 'ТЕСИ ООД' : WH, material_code: code,
  material_name: 'АРТ ' + id, quantity: 2, unit: 'бр', difference_category: cat, type: null, status: 'new', comment: null,
  warehouse_response: null, store_response: null, attachments: [], created_at: '2026-11-17T08:00:00Z' }, extra || {});
const LINES = [
  ln('w1', 'r1', '77777', 'wrong_barcode', { comment: 'чете като стола', attachments: [{ type: 'image', url: PUB + 'stock-differences/l1.jpg', filename: 'l1.jpg' }, { type: 'file', url: PUB + 'stock-differences/l1.pdf', filename: 'l1.pdf' }] }),
  ln('w2', 'r1', '77777', 'wrong_barcode', { quantity: 3 }),
  ln('w3', 'r1', '87794', 'wrong_barcode'),
  ln('w4', 'r2', '66666', 'wrong_barcode'),
  ln('w5', 'r3', '34924', 'wrong_barcode', { status: 'received', completed_by: 'Миглена Павлова', completed_at: '2026-11-11T10:00:00Z' })
];

const settle = async () => { for (let i = 0; i < 10; i++) await ticks(); };
const clone = x => JSON.parse(JSON.stringify(x));

function env(user, o) {
  o = o || {};
  const lines = clone(o.lines || LINES), reps = clone(o.reps || REPS);
  const h = boot({
    modules: ['bulletin.js', 'transport.js', 'stock-returns.js', 'stock-differences.js'],
    user, confirm: true, fail: o.fail,
    data: {
      stock_differences: url => /differences_reports\(/.test(decodeURIComponent(url))
        ? lines.map(l => Object.assign({}, l, { differences_reports: reps.filter(r => r.id === l.report_id)[0] || null }))
        : lines,
      differences_reports: reps, stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: DBU, storno_notes: [], storno_note_replies: [],
      contacts: [{ name: WH }, { name: 'ТЕСИ ООД' }],
      problem_articles: () => clone(o.pa || PA), problem_article_done: []
    }
  });
  /* Storage: GET на публичен файл (копието) — с blob(); останалото — harness-ът. */
  h.storeGets = [];
  const base = h.w.fetch;
  h.w.fetch = function (url, init) {
    const m = ((init && init.method) || 'GET').toUpperCase();
    if (m === 'GET' && String(url).indexOf('/storage/v1/object/public/') >= 0) {
      h.storeGets.push(String(url));
      if (o.failCopy) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new h.w.Blob(['x'], { type: 'image/jpeg' })) });
    }
    return base(url, init);
  };
  h.notified = [];
  h.w.sdNotifyInterstore = function (t, title, msg) { h.notified.push(t + '|' + title + '|' + msg); };
  return h;
}
async function openPa(h) {
  h.w.loadStockDiff(); await settle();
  realClick(h.w, h.doc.querySelector('button[data-sd-view="problems"]')); await settle();
}
async function openReports(h) {
  h.w.sdView = 'reports';
  h.w.loadStockDiff(); await settle();
  h.w.sdShowDone = { r1: true, r2: true, r3: true };
  h.w.sdDirTab = 'interstore';
  h.w.renderStockDiff(); await settle();
}
const rowOf = (h, id) => Array.prototype.find.call(h.doc.querySelectorAll('[id^="diff-rep-"] tr'), tr => {
  const td = tr.querySelectorAll('td')[1]; return td && td.textContent.indexOf('АРТ ' + id) === 0;
}) || null;
const toasts = h => h.calls.toast.join(' | ');
const paPosts = h => h.calls.post.filter(p => p.table === 'problem_articles');
const paPatches = h => h.calls.patch.filter(p => p.table === 'problem_articles');
const sdPatches = h => h.calls.patch.filter(p => /\/rest\/v1\/stock_differences/.test(p.url));
const upPosts = h => h.calls.post.filter(p => String(p.url).indexOf('/storage/v1/object/bulletin-files/' + REG) >= 0);
const dels = h => h.calls.del.filter(u => String(u).indexOf('/storage/v1/object/bulletin-files/') >= 0);
const setV = (h, id, v) => { const el = h.doc.getElementById(id); if (el) el.value = v; };
function addFiles(h, names) {
  const inp = h.doc.getElementById('sdpa-ph-input');
  const files = names.map(n => new h.w.File(['img-' + n], n, { type: 'image/jpeg' }));
  Object.defineProperty(inp, 'files', { value: files, configurable: true });
  fire(h.w, inp, 'change');
}
const phCount = (h, kind) => h.doc.querySelectorAll('#sdpa-ph-list .sdpa-ph' + (kind ? '[data-kind="' + kind + '"]' : '')).length;
const clickSave = h => realClick(h.w, h.doc.getElementById('sdpa-save'));

(async function run() {

  section('1а. Нов запис — „📷 Добави снимка“, „✕“, качване при „Запази“');
  {
    const h = env(U.migl);
    await openPa(h);
    realClick(h.w, h.doc.getElementById('sd-pa-new')); await settle();
    ok('модалът има „📷 Добави снимка“', !!h.doc.getElementById('sdpa-ph-input') && /📷 Добави снимка/.test(h.doc.getElementById('sdpa-ph-box').textContent));
    ok('нов запис от регистъра — без „Снимки от бланката“ и без „Приключи“', !h.doc.getElementById('sdpa-src-box') && !h.doc.getElementById('sdpa-close-box'));
    addFiles(h, ['e1.jpg', 'e2.jpg']); await settle();
    ok('две миниатюри след избора', phCount(h, 'new') === 2, phCount(h, 'new'));
    ok('0 качвания преди „Запази“', upPosts(h).length === 0);
    realClick(h.w, h.doc.querySelector('#sdpa-ph-list .sdpa-ph-x[data-kind="new"][data-i="1"]')); await settle();
    ok('„✕“ маха едната', phCount(h, 'new') === 1);
    setV(h, 'sdpa-code', '90001'); setV(h, 'sdpa-name', 'НОВ');
    clickSave(h); await settle();
    ok('едно качване в ' + REG, upPosts(h).length === 1, upPosts(h).map(p => p.url).join(','));
    const p = paPosts(h)[0];
    ok('POST с photos = [качената, name e1.jpg]', !!p && p.body.photos.length === 1 && p.body.photos[0].url.indexOf(PUB + REG) === 0 && p.body.photos[0].name === 'e1.jpg', p && JSON.stringify(p.body.photos));
    ok('модалът е затворен, „✅ Записано“', !h.doc.getElementById('sdpa-ov') && /✅ Записано/.test(toasts(h)));
    h.close();
  }

  section('1б. ✏️ — запазена снимка „✕“ + нова; паднало триене → жълт toast');
  {
    const h = env(U.migl);
    await openPa(h);
    realClick(h.w, h.doc.querySelector('button.sd-pa-edit[data-id="p1"]')); await settle();
    ok('запазената снимка е в модала', phCount(h, 'saved') === 1);
    realClick(h.w, h.doc.querySelector('#sdpa-ph-list .sdpa-ph-x[data-kind="saved"]')); await settle();
    addFiles(h, ['n1.jpg']); await settle();
    ok('0 триене преди „Запази“', dels(h).length === 0);
    clickSave(h); await settle();
    const p = paPatches(h)[0];
    ok('PATCH: photos = само новата', !!p && p.body.photos.length === 1 && p.body.photos[0].name === 'n1.jpg' && p.body.photos[0].url.indexOf(PUB + REG) === 0, p && JSON.stringify(p.body.photos));
    ok('старата е изтрита от хранилището', dels(h).length === 1 && /old1\.jpg$/.test(dels(h)[0]), dels(h).join(','));
    h.close();
  }
  {
    const h = env(U.migl, { fail: { DELETE: /storage/ } });
    await openPa(h);
    realClick(h.w, h.doc.querySelector('button.sd-pa-edit[data-id="p1"]')); await settle();
    realClick(h.w, h.doc.querySelector('#sdpa-ph-list .sdpa-ph-x[data-kind="saved"]')); await settle();
    clickSave(h); await settle();
    const p = paPatches(h)[0];
    ok('паднало триене: записът минава (photos = [])', !!p && Array.isArray(p.body.photos) && p.body.photos.length === 0);
    ok('… жълт toast', h.calls.toast.some(t => /не е изтрита от хранилището/.test(t)), toasts(h));
    h.close();
  }

  section('1в. Паднало качване → червен toast, 0 запис');
  {
    const h = env(U.migl, { fail: { POST: /storage\/v1\/object\/bulletin-files/ } });
    await openPa(h);
    realClick(h.w, h.doc.getElementById('sd-pa-new')); await settle();
    addFiles(h, ['e1.jpg']); await settle();
    setV(h, 'sdpa-code', '90002');
    clickSave(h); await settle();
    ok('0 POST в problem_articles', paPosts(h).length === 0);
    ok('червен toast „записът НЕ е направен“', /записът НЕ е направен/.test(toasts(h)), toasts(h));
    ok('модалът остава, бутонът — пак активен', !!h.doc.getElementById('sdpa-ov') && !h.doc.getElementById('sdpa-save').disabled);
    h.close();
  }

  section('1г. Запис от ред — „Снимки от бланката“ се копират; кутийката и редът');
  {
    const h = env(U.migl, { pa: PA.filter(p => p.id === 'p1') });
    await openReports(h);
    const r = rowOf(h, 'w1');
    realClick(h.w, r && r.querySelector('button.sd-pa-add')); await settle();
    const src = h.doc.querySelectorAll('#sdpa-src-box .sdpa-src-ph');
    const srcImgs = Array.prototype.map.call(h.doc.querySelectorAll('#sdpa-src-box img'), i => i.getAttribute('src').replace(PUB, ''));
    ok('предложени 2: снимката на бланката и на реда (без стокова и PDF)', src.length === 2 && srcImgs.join(',') === 'differences/a.jpg,stock-differences/l1.jpg', srcImgs.join(','));
    ok('… отметнати', Array.prototype.every.call(src, c => c.checked));
    src[1].checked = false;
    clickSave(h); await settle();
    ok('копието: изтеглен е само отметнатият файл', h.storeGets.length === 1 && /differences\/a\.jpg$/.test(h.storeGets[0]), h.storeGets.join(','));
    const p = paPosts(h)[0];
    ok('photos — НОВ път в ' + REG + ', не връзката към бланката', !!p && p.body.photos.length === 1 && p.body.photos[0].url.indexOf(PUB + REG) === 0 && p.body.photos[0].name === 'a.jpg', p && JSON.stringify(p.body.photos));
    h.close();
  }
  {
    const h = env(U.migl, { failCopy: true, pa: PA.filter(p => p.id === 'p1') });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    clickSave(h); await settle();
    ok('паднало копие → 0 POST и 0 PATCH на реда', paPosts(h).length === 0 && sdPatches(h).length === 0);
    ok('… червен toast', /записът НЕ е направен/.test(toasts(h)));
    h.close();
  }
  {
    const h = env(U.store);
    await openPa(h);
    const tr = h.doc.querySelector('#sd-pa-body tr.sd-pa-row[data-id="p1"]');
    ok('редът на регистъра — миниатюра под бележката', !!tr && tr.querySelectorAll('.sd-pa-notecell .sd-pa-photos img').length === 1);
    const a = tr && tr.querySelector('.sd-pa-photos a');
    ok('… клик — пълен размер (линк към файла, нов таб)', !!a && a.getAttribute('href') === PUB + REG + 'old1.jpg' && a.getAttribute('target') === '_blank');
    const box = h.w.sdPaWarnHtml('56565');
    ok('кутийката във формата — до 3 миниатюри (записът има 4)', (box.match(/<img /g) || []).length === 3, (box.match(/<img /g) || []).length);
    ok('кутийката по „чете се като“ 53597 — миниатюрата на 62081', (h.w.sdPaWarnHtml('53597').match(/<img /g) || []).length === 1);
    ok('Бюлетинът чете photos и ги рисува', /photos/.test(String(h.w.bulPaLoad)) && (h.w.bulPaThumbs(PA[0].photos).match(/<img /g) || []).length === 1);
    h.close();
  }

  section('2. „📄 Бланката“');
  {
    const h = env(U.store);
    await openPa(h);
    const b5 = h.doc.querySelector('#sd-pa-body tr[data-id="p2"] button.sd-pa-src');
    const bg = h.doc.querySelector('#sd-pa-body tr[data-id="p3"] button.sd-pa-src');
    ok('обектът вижда „📄 Бланката“', !!b5 && b5.textContent.trim() === '📄 Бланката' && !b5.disabled);
    ok('изтрит ред → сив бутон, title „Бланката е изтрита“, без onclick', !!bg && bg.disabled && bg.getAttribute('title') === 'Бланката е изтрита' && !bg.getAttribute('onclick'));
    ok('записът без source_line_id — без бутон', !h.doc.querySelector('#sd-pa-body tr[data-id="p1"] button.sd-pa-src'));
    h.close();
  }
  {
    const h = env(U.migl);
    await openPa(h);
    realClick(h.w, h.doc.querySelector('#sd-pa-body tr[data-id="p4"] button.sd-pa-src')); await settle();
    ok('бланка горе → „Бланки за преглед“, търсене 77777', h.w.sdView === 'reports' && h.w.sdSearch === '77777', h.w.sdView + ' ' + h.w.sdSearch);
    ok('… бланката r1 е на екрана', !!h.doc.getElementById('diff-rep-r1'));
    h.close();
  }
  {
    const h = env(U.migl);
    await openPa(h);
    realClick(h.w, h.doc.querySelector('#sd-pa-body tr[data-id="p2"] button.sd-pa-src')); await settle();
    const tr = h.doc.getElementById('sd-line-w5');
    ok('приключена бланка → „Решени редове“', h.w.sdView === 'rows', h.w.sdView);
    ok('… редът е подчертан', !!tr && tr.classList.contains('sd-line-hi'));
    h.close();
  }

  section('3. „✅ Приключи реда с това указание“');
  {
    /* Складът е отговорил → редът не е насочен (5а) → „Приключи“ само за razliki_co. */
    const h = env(U.vas, { pa: [], lines: LINES.map(l => l.id === 'w1' ? Object.assign({}, l, { warehouse_response: 'will_send' }) : l) });
    await openReports(h);
    ok('razliki_barcode, ненасочен ред — бутонът „Приключи“ го няма', !rowOf(h, 'w1').querySelector('button.sd-route-close'));
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    ok('… модалът е, отметката я няма', !!h.doc.getElementById('sdpa-ov') && !h.doc.getElementById('sdpa-close-box') && !h.doc.querySelector('.sdpa-close-ln'));
    h.close();
  }
  {
    const h = env(U.vas, { pa: [] });
    await openReports(h);
    ok('razliki_barcode, насочен ред — бутонът „Приключи“ е', !!rowOf(h, 'w1').querySelector('button.sd-route-close'));
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    ok('… и отметката е (същото правило)', !!h.doc.querySelector('#sdpa-close-box .sdpa-close-ln[data-lid="w1"]'));
    h.close();
  }
  {
    const h = env(U.migl, { pa: [] });
    await openReports(h);
    h.w.sdDirTab = 'supplier'; h.w.renderStockDiff(); await settle();
    realClick(h.w, rowOf(h, 'w4').querySelector('button.sd-pa-add')); await settle();
    ok('ред от доставчик (няма бутон „Приключи“) — няма отметка', !!h.doc.getElementById('sdpa-ov') && !h.doc.getElementById('sdpa-close-box'));
    h.close();
  }
  {
    const h = env(U.migl, { pa: [] });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    const cb = Array.prototype.slice.call(h.doc.querySelectorAll('#sdpa-close-box .sdpa-close-ln'));
    ok('отметки: w1 (отметната) и другият ред със същия код w2; 87794 — не', cb.map(c => c.getAttribute('data-lid')).join(',') === 'w1,w2' && cb[0].checked, cb.map(c => c.getAttribute('data-lid') + ':' + c.checked).join(','));
    ok('текстът „✅ Приключи реда с това указание“ над „💾 Запази“', /✅ Приключи реда с това указание/.test(h.doc.getElementById('sdpa-close-box').textContent) &&
      !!(h.doc.getElementById('sdpa-close-box').compareDocumentPosition(h.doc.getElementById('sdpa-save')) & 4));
    cb[1].checked = false;
    setV(h, 'sdpa-note', 'бележка М');
    clickSave(h); await settle();
    ok('POST в регистъра', paPosts(h).length === 1);
    const sp = sdPatches(h);
    ok('PATCH само на w1', sp.length === 1 && /id=eq\.w1/.test(sp[0].url), sp.map(p => p.url).join(','));
    const b = sp[0] && sp[0].body;
    ok('полетата на бутона: status, completed_by, completed_at, resolution_comment', !!b && JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['completed_at', 'completed_by', 'resolution_comment', 'status']) &&
      b.status === 'received' && b.completed_by === 'Миглена Павлова' && b.resolution_comment === 'за преналепяне · бележка М', b && JSON.stringify(b));
    ok('известия към обекта и склада', h.notified.length === 2 && h.notified[0].indexOf('Карлово|✅ Разлика: приключен ред|ЦО приключи ред 77777') === 0 && h.notified[1].indexOf(WH + '|') === 0, h.notified.join(' || '));
    ok('POST е преди PATCH', h.calls.post.indexOf(paPosts(h)[0]) >= 0 && /✅ Записано/.test(h.calls.toast[0] || ''), toasts(h));
    h.close();
  }
  {
    const h = env(U.migl, { pa: [] });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    clickSave(h); await settle();
    const ids = sdPatches(h).map(p => (p.url.match(/id=eq\.(\w+)/) || [])[1]).join(',');
    ok('отметнат и вторият → PATCH на w1 и w2 с бележката от реда', ids === 'w1,w2' && sdPatches(h)[1].body.resolution_comment === 'за преналепяне · чете като стола', ids + ' ' + JSON.stringify(sdPatches(h).map(p => p.body.resolution_comment)));
    h.close();
  }
  {
    const h = env(U.migl, { pa: [] });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    h.doc.querySelector('#sdpa-close-box .sdpa-close-ln[data-lid="w1"]').checked = false;
    h.doc.querySelector('#sdpa-close-box .sdpa-close-ln[data-lid="w2"]').checked = false;
    clickSave(h); await settle();
    ok('махнати отметки → POST, 0 PATCH на редове', paPosts(h).length === 1 && sdPatches(h).length === 0);
    h.close();
  }
  {
    const h = env(U.migl, { pa: [], fail: { PATCH: /stock_differences/ } });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    h.doc.querySelector('#sdpa-close-box .sdpa-close-ln[data-lid="w2"]').checked = false;
    clickSave(h); await settle();
    ok('паднал PATCH: записът е направен', paPosts(h).length === 1);
    ok('… червен toast „Записът е в регистъра, но редът не е приключен — приключете го ръчно“',
      h.calls.toast.some(t => t === 'Записът е в регистъра, но редът не е приключен — приключете го ръчно'), toasts(h));
    const l = h.w.sdData.filter(x => x.id === 'w1')[0];
    ok('… редът остава отворен (status new)', !!l && l.status === 'new' && h.notified.length === 0);
    h.close();
  }
  {
    const h = env(U.migl, { pa: [], fail: { POST: /problem_articles/ } });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w1').querySelector('button.sd-pa-add')); await settle();
    clickSave(h); await settle();
    ok('паднал POST → 0 PATCH на редове, 0 известия', sdPatches(h).length === 0 && h.notified.length === 0);
    ok('… копията от бланката са изтрити обратно', upPosts(h).length === 2 && dels(h).length === 2, upPosts(h).length + '/' + dels(h).length);
    h.close();
  }
  {
    /* Бутонът „✅ Приключи (от свое име)“ — същият път (sdRouteCloseApply). */
    const h = env(U.migl, { pa: [] });
    await openReports(h);
    realClick(h.w, rowOf(h, 'w3').querySelector('button.sd-route-close')); await settle();
    h.doc.getElementById('sdroute-comment').value = 'ръчно';
    realClick(h.w, h.doc.getElementById('sdroute-save')); await settle();
    const b = sdPatches(h)[0] && sdPatches(h)[0].body;
    ok('бутонът на реда пише същите полета', !!b && JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['completed_at', 'completed_by', 'resolution_comment', 'status']) && b.resolution_comment === 'ръчно');
    ok('… и „✅ Приключено“', /✅ Приключено/.test(toasts(h)));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
