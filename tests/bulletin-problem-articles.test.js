/* Проблемни артикули в Бюлетина (сесия bulletin-problem-articles, 23.11.2026;
   решения на Тенчо 22.11 и 23.11).

   1. Разлики — модалът на записа: нов → bulletin_on true, bulletin_stores NULL,
      photo_required false; избрани обекти → масив; „Избрани“ без отметнат →
      червен toast, 0 POST; съществуващ запис без bulletin_on остава false
      (PATCH); photo_required отметнат → true.
   2. Разлики — колоната „Бюлетин“: „✓ X/Y обекта“ при NULL (Y = всички) и при
      списък (Y = избраните, отметка извън списъка не се брои); без
      bulletin_on → „—“; кликът отваря модала по обекти (кой, кога, снимка,
      „Още не са“).
   3. Бюлетин — блокът: обект в списъка вижда реда, обект извън — не; NULL =
      всички; затворен и bulletin_on false не идват (заявката ги филтрира);
      без записи — няма блок; офис без избран обект — няма блок; блокът е
      точно над „План за деня“.
   4. Бюлетин — реален клик „✅ Направено“: photo_required без снимка → червен
      toast, 0 POST; със снимка → качване в bulletin-files/problem-articles/ и
      POST с точните полета; без photo_required → минава без снимка; паднал
      POST → червен toast, модалът и бутонът остават; паднало качване →
      червен toast, 0 POST към problem_article_done; отметнат ред →
      „✓ Направено дд.мм от <кой>“ и няма <button> в реда.
   5. Разлики — повторно отваряне (сесия bulletin-pa-refresh, 23.11.2026):
      отметка, появила се в базата след първото зареждане, се вижда като
      „✓ 1/1 обекта“ след реален клик по бутона на под-таба; докато чете —
      досегашните данни. Мутант М6 (setSDView без force) → 2 ❌, exit 1.
   Интеграционно: bulletin.js + stock-differences.js заредени заедно в реда от
   index.html (секции 3–4 ползват helper-ите за снимки от Разлики).

   Мутационна проверка (23.11.2026, мутант върху копие, файлът — върнат и
   сверен с cmp; чистият код: exit 0):
     М1  bulPaForStore: NULL не значи „всички“                     → 3 ❌
     М2  bulPaConfirm: photo_required не се проверява              → 2 ❌
     М3  нов запис в модала — bulletin_on по подразбиране false    → 2 ❌
     М4  sdPaBulCell: X брои и отметки извън целевите обекти       → 1 ❌
     М5  паднал POST — бутонът не се отключва                      → 1 ❌
   Всички — exit 1; чистият код — 68/68, exit 0.
   Неуловени: визуалният ред/подредба на блока (jsdom не смята лейаут) —
   проверка на живо 24-11-bulletin-problem-articles-live.

   Пускане:  node tests/bulletin-problem-articles.test.js .
*/
'use strict';
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, ticks } = H;

const clone = x => JSON.parse(JSON.stringify(x));
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
async function settle(cond, max) {
  for (let i = 0; i < (max || 80); i++) { if (cond()) return true; await ticks(); }
  return cond();
}
const STORES = ['Троян', 'Ловеч', 'Карлово'];

/* ── Разлики ─────────────────────────────────────────────── */
const MIGL = { id: 'u-mp', email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова', role: 'accounting', store_name: 'Централен офис', assigned_stores: [] };
const DBU = [{ id: 'u-mp', notify_groups: ['controlling', 'razliki_co'], is_regional: false, assigned_stores: [], store_name: 'Централен офис' }]
  .concat(STORES.map((s, i) => ({ id: 'u-s' + i, store_name: s, notify_groups: [], is_regional: false, assigned_stores: [] })));
const pa = (id, code, extra) => Object.assign({ id, material_code: code, material_name: 'АРТ ' + code, reads_as_code: '9' + code, reads_as_name: 'ДРУГ ' + code,
  store_action: 'за преналепяне', note: null, photos: [], valid_from: '2026-11-23', status: 'active', source: 'office',
  bulletin_on: false, bulletin_stores: null, photo_required: false }, extra || {});
const PA = [
  pa('p-all', '100', { bulletin_on: true, bulletin_stores: null }),
  pa('p-sel', '200', { bulletin_on: true, bulletin_stores: ['Троян', 'Ловеч'], photo_required: true }),
  pa('p-old', '300', { source: 'seed' })
];
const DONE = [
  { id: 'd1', article_id: 'p-all', store_name: 'Троян', done_by: 'Управител Троян', done_at: '2026-11-23T08:15:00Z', photos: [{ url: 'https://x/a.jpg', name: 'a.jpg' }] },
  { id: 'd2', article_id: 'p-sel', store_name: 'Ловеч', done_by: 'Управител Ловеч', done_at: '2026-11-23T09:00:00Z', photos: [] },
  { id: 'd3', article_id: 'p-sel', store_name: 'Карлово', done_by: 'Карлово', done_at: '2026-11-23T09:30:00Z', photos: [] }
];

function sdEnv(o) {
  o = o || {};
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js'],
    user: MIGL, confirm: true, fail: o.fail,
    data: {
      stock_differences: [], differences_reports: [], stock_returns: [], product_catalog: [], suppliers: [],
      transport_orders: [], stock_diff_swaps: [], users: DBU, storno_notes: [], storno_note_replies: [],
      contacts: STORES.map(s => ({ name: s })),
      problem_articles: () => clone(o.pa || PA),
      problem_article_done: () => clone(o.done || DONE)
    }
  });
  h.w.reportableStoresCache = STORES.slice();
  wrapToast(h);
  return h;
}
async function openPa(h) {
  guard('loadStockDiff()', () => h.w.loadStockDiff());
  await settle(() => h.w.sdPaLoaded && h.w.sdMe);
  await ticks();
  h.w.sdView = 'problems';
  h.w.renderStockDiff();
  await settle(() => !!h.doc.getElementById('sd-pa'));
}
const paPosts = h => h.calls.post.filter(p => p.table === 'problem_articles');
const paPatches = h => h.calls.patch.filter(p => p.table === 'problem_articles');
const rowOf = (h, id) => h.doc.querySelector('#sd-pa-body tr.sd-pa-row[data-id="' + id + '"]');
const setVal = (h, id, v) => { h.doc.getElementById(id).value = v; };

/* ── Бюлетин ─────────────────────────────────────────────── */
const ANCHOR = (function () { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7))); return d; })();
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class Frozen extends Real { constructor(...a) { if (a.length === 0) super(ms); else super(...a); } static now() { return ms; } }
  w.Date = Frozen;
}
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
const TROYAN = { email: 't@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };
const KARLOVO = { email: 'k@temax.bg', display_name: 'Управител Карлово', role: 'manager', store_name: 'Карлово' };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

/* problem_articles в базата: заявката от Бюлетина ТРЯБВА да филтрира
   status=active и bulletin_on=true — моделът връща само каквото тя иска. */
const DBPA = [
  pa('b-all', '100', { bulletin_on: true, bulletin_stores: null, note: 'бележка 100' }),
  pa('b-tl', '200', { bulletin_on: true, bulletin_stores: ['Троян', 'Ловеч'], photo_required: true }),
  pa('b-off', '300', { bulletin_on: false }),
  pa('b-closed', '400', { bulletin_on: true, status: 'closed' })
];
function paByUrl(rows, url) {
  return rows.filter(r => (url.indexOf('status=eq.active') < 0 || r.status === 'active') && (url.indexOf('bulletin_on=eq.true') < 0 || r.bulletin_on === true));
}
function bulEnv(user, o) {
  o = o || {};
  const db = { done: clone(o.done || []), pa: clone(o.pa || DBPA) };
  const h = boot({
    modules: ['bulletin.js', 'today.js', 'transport.js', 'stock-returns.js', 'stock-differences.js', 'report.js'],
    user, fail: o.fail,
    data: {
      users: STORES.map(s => ({ store_name: s })), stores: STORES.map(s => ({ name: s })),
      bulletins: () => h.buls, bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [],
      recurring_task_versions: [], recurring_task_skips: [], task_completions: [],
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [], goods_transit: [],
      problem_articles: url => paByUrl(db.pa, url),
      problem_article_done: () => clone(db.done)
    }
  });
  const cal = {}; h.w.DKEYS.forEach(k => { cal[k] = []; });
  h.buls = [{ id: 'b-0', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR), status: 'published', created_at: '2026-01-05',
    content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } }];
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-0';
  h.w.reportableStoresCache = STORES.slice();
  h.w.allStoresCache = STORES.slice();
  h.db = db;
  wrapToast(h);
  /* POST към problem_article_done → в модела (за опресняването след запис). */
  const orig = h.w.fetch;
  h.w.fetch = function (url, init) {
    const r = orig.call(this, url, init);
    if (String(url).indexOf('/problem_article_done') >= 0 && init && (init.method || '').toUpperCase() === 'POST') {
      return r.then(res => { if (res && res.ok) db.done.push(Object.assign({ id: 'dn' + db.done.length, done_at: '2026-11-23T10:00:00Z' }, JSON.parse(init.body))); return res; });
    }
    return r;
  };
  return h;
}
async function bulView(user, o) {
  const h = bulEnv(user, o);
  guard('loadBulletin()', () => h.w.loadBulletin());
  await settle(() => !!h.doc.getElementById('sec-dayplan'));
  for (let i = 0; i < 10; i++) await ticks();
  return h;
}
const blockOf = h => h.doc.getElementById('sec-problem-articles');
const bRow = (h, id) => h.doc.querySelector('#sec-problem-articles .bul-pa-row[data-id="' + id + '"]');
const donePosts = h => h.calls.post.filter(p => /\/problem_article_done/.test(p.url));
const storagePosts = h => h.calls.post.filter(p => /storage\/v1\/object\/bulletin-files\/problem-articles\//.test(p.url));
const redToasts = h => (h.toasts || []).filter(t => /#dc2626/i.test(String(t[1] || "")));
function wrapToast(h) { h.toasts = []; const o = h.w.toast; h.w.toast = function (m, c) { h.toasts.push([m, c]); return o.apply(this, arguments); }; }
function setFiles(h, n) {
  const fi = h.doc.getElementById('bulpa-file');
  const files = []; for (let i = 0; i < n; i++) files.push(new h.w.File(['x'], 'snimka' + i + '.jpg', { type: 'image/jpeg' }));
  Object.defineProperty(fi, 'files', { value: files });
}

(async function run() {

  section('1. Разлики — модалът на записа');
  {
    const h = sdEnv();
    await openPa(h);
    realClick(h.w, h.doc.getElementById('sd-pa-new'));
    ok('модалът е отворен', !!h.doc.getElementById('sdpa-ov'));
    ok('нов: „📰 Покажи в Бюлетина“ е отметнат', h.doc.getElementById('sdpa-bul').checked === true);
    ok('нов: „Всички обекти“ е избрано', h.doc.getElementById('sdpa-st-all').checked === true);
    ok('нов: „📸 Снимката е задължителна“ не е отметнат', h.doc.getElementById('sdpa-photo').checked === false);
    ok('чекбоксовете на обектите — списъкът на Бюлетина (3)', h.doc.querySelectorAll('#sdpa-stores .sdpa-st').length === 3);
    setVal(h, 'sdpa-code', '555'); setVal(h, 'sdpa-action', 'за преналепяне');
    realClick(h.w, h.doc.getElementById('sdpa-save'));
    await settle(() => paPosts(h).length > 0);
    const b = paPosts(h)[0] && paPosts(h)[0].body;
    ok('нов → bulletin_on true, bulletin_stores NULL, photo_required false',
      !!b && b.bulletin_on === true && b.bulletin_stores === null && b.photo_required === false, JSON.stringify(b));
  }
  {
    const h = sdEnv();
    await openPa(h);
    realClick(h.w, h.doc.getElementById('sd-pa-new'));
    setVal(h, 'sdpa-code', '556'); setVal(h, 'sdpa-action', 'за преналепяне');
    h.doc.getElementById('sdpa-st-sel').checked = true; h.doc.getElementById('sdpa-st-all').checked = false;
    h.w.sdPaStModeChanged();
    ok('„Избрани“ показва списъка', h.doc.getElementById('sdpa-stores').style.display === 'grid');
    realClick(h.w, h.doc.getElementById('sdpa-save'));
    await ticks(); await ticks();
    ok('„Избрани“ без отметнат обект → 0 POST', paPosts(h).length === 0);
    ok('… и червен toast', redToasts(h).length > 0);
    const cbs = h.doc.querySelectorAll('#sdpa-stores .sdpa-st');
    Array.prototype.forEach.call(cbs, c => { if (c.value === 'Троян' || c.value === 'Карлово') c.checked = true; });
    h.doc.getElementById('sdpa-photo').checked = true;
    realClick(h.w, h.doc.getElementById('sdpa-save'));
    await settle(() => paPosts(h).length > 0);
    const b = paPosts(h)[0] && paPosts(h)[0].body;
    ok('конкретни обекти → масив [Троян, Карлово]', !!b && JSON.stringify(b.bulletin_stores) === JSON.stringify(['Троян', 'Карлово']), JSON.stringify(b));
    ok('photo_required отметнат → true', !!b && b.photo_required === true);
  }
  {
    const h = sdEnv();
    await openPa(h);
    realClick(h.w, rowOf(h, 'p-old').querySelector('button.sd-pa-edit'));
    ok('съществуващ без bulletin_on: чекбоксът НЕ е отметнат', h.doc.getElementById('sdpa-bul').checked === false);
    realClick(h.w, h.doc.getElementById('sdpa-save'));
    await settle(() => paPatches(h).length > 0);
    const b = paPatches(h)[0] && paPatches(h)[0].body;
    ok('… и PATCH-ът пише bulletin_on false', !!b && b.bulletin_on === false && b.bulletin_stores === null, JSON.stringify(b));
  }
  {
    const h = sdEnv();
    await openPa(h);
    realClick(h.w, rowOf(h, 'p-sel').querySelector('button.sd-pa-edit'));
    ok('съществуващ със списък: „Избрани“ и Троян, Ловеч отметнати',
      h.doc.getElementById('sdpa-st-sel').checked === true &&
      Array.prototype.filter.call(h.doc.querySelectorAll('#sdpa-stores .sdpa-st'), c => c.checked).map(c => c.value).join(',') === 'Троян,Ловеч');
    ok('… photo_required от базата', h.doc.getElementById('sdpa-photo').checked === true);
  }

  section('2. Разлики — колоната „Бюлетин“');
  {
    const h = sdEnv();
    await openPa(h);
    const ths = Array.prototype.map.call(h.doc.querySelectorAll('#sd-pa thead th'), txt);
    ok('заглавие „Бюлетин“ в таблицата', ths.indexOf('Бюлетин') >= 0, JSON.stringify(ths));
    ok('NULL → „✓ 1/3 обекта“', txt(rowOf(h, 'p-all').querySelector('.sd-pa-bulcell')) === '✓ 1/3 обекта', txt(rowOf(h, 'p-all').querySelector('.sd-pa-bulcell')));
    ok('списък → „✓ 1/2 обекта“ (Карлово извън списъка не се брои)', txt(rowOf(h, 'p-sel').querySelector('.sd-pa-bulcell')) === '✓ 1/2 обекта', txt(rowOf(h, 'p-sel').querySelector('.sd-pa-bulcell')));
    ok('без bulletin_on → „—“, без бутон', txt(rowOf(h, 'p-old').querySelector('.sd-pa-bulcell')) === '—' && !rowOf(h, 'p-old').querySelector('.sd-pa-bulcell button'));
    realClick(h.w, rowOf(h, 'p-all').querySelector('button.sd-pa-bul'));
    const ov = h.doc.getElementById('sdpa-done-ov');
    ok('кликът отваря модала по обекти', !!ov);
    const dr = ov && ov.querySelector('.sdpa-done-row[data-store="Троян"]');
    ok('Троян: кой + час', !!dr && txt(dr).indexOf('Управител Троян') >= 0 && txt(dr).indexOf('23.11 10:15') >= 0, txt(dr));
    ok('Троян: миниатюрата сочи снимката (клик = пълен размер)', !!dr && !!dr.querySelector('a[href="https://x/a.jpg"] img'));
    ok('„Още не са“: Ловеч, Карлово', txt(h.doc.getElementById('sdpa-notyet')) === 'Ловеч, Карлово', txt(h.doc.getElementById('sdpa-notyet')));
  }
  {
    const h = sdEnv({ fail: { GET: /problem_article_done/ } });
    await openPa(h);
    ok('паднало четене на отметките → „⚠️“, не 0/Y', txt(rowOf(h, 'p-all').querySelector('.sd-pa-bulcell')) === '⚠️');
  }

  section('3. Бюлетин — блокът');
  {
    const h = await bulView(TROYAN);
    const b = blockOf(h);
    ok('Троян: блокът „🏷️ Проблемни артикули“ го има', !!b && txt(b).indexOf('Проблемни артикули') >= 0);
    ok('… точно над „📋 План за деня“', !!b && b.nextElementSibling && b.nextElementSibling.id === 'sec-dayplan');
    ok('Троян: NULL (всички) → редът 100', !!bRow(h, 'b-all'));
    ok('Троян: в списъка → редът 200', !!bRow(h, 'b-tl'));
    ok('bulletin_on false → няма', !bRow(h, 'b-off'));
    ok('затворен → няма', !bRow(h, 'b-closed'));
    const r = txt(bRow(h, 'b-all'));
    ok('редът: код, име, „чете се като“, действие, бележка',
      ['100', 'АРТ 100', 'Чете се като: 9100 ДРУГ 100', 'за преналепяне', 'бележка 100'].every(s => r.indexOf(s) >= 0), r);
    const q = h.calls.get.filter(u => /\/problem_articles\?/.test(u))[0] || '';
    ok('заявката филтрира status=active и bulletin_on=true', /status=eq\.active/.test(q) && /bulletin_on=eq\.true/.test(q), q);
  }
  {
    const h = await bulView(KARLOVO);
    ok('Карлово: NULL → редът 100', !!bRow(h, 'b-all'));
    ok('Карлово: извън списъка → няма реда 200', !bRow(h, 'b-tl'));
  }
  {
    const h = await bulView(KARLOVO, { pa: [DBPA[1], DBPA[2], DBPA[3]] });
    ok('без записи за обекта → няма блок', !blockOf(h));
  }
  {
    const h = await bulView(ADMIN);
    ok('офис без избран обект → няма блок', !blockOf(h));
    h.w.bulPlanStore = 'Троян'; h.w.renderBulletin();
    ok('офис с избран Троян → блокът, без бутон „Направено“', !!blockOf(h) && !blockOf(h).querySelector('button.bul-pa-btn'));
  }

  section('4. Бюлетин — „✅ Направено“');
  {
    const h = await bulView(TROYAN);
    realClick(h.w, bRow(h, 'b-tl').querySelector('button.bul-pa-btn'));
    ok('модалът е отворен, „(задължителна)“', !!h.doc.getElementById('bulpa-ov') && txt(h.doc.getElementById('bulpa-ov')).indexOf('задължителна') >= 0);
    realClick(h.w, h.doc.getElementById('bulpa-ok'));
    await ticks(); await ticks();
    ok('photo_required без снимка → 0 POST', donePosts(h).length === 0 && storagePosts(h).length === 0);
    ok('… червен toast', redToasts(h).length > 0);
    setFiles(h, 1);
    realClick(h.w, h.doc.getElementById('bulpa-ok'));
    await settle(() => donePosts(h).length > 0 && !h.doc.getElementById('bulpa-ov'));
    ok('снимката е качена в bulletin-files/problem-articles/', storagePosts(h).length === 1);
    const p = donePosts(h)[0];
    const b = p && p.body;
    ok('POST с точните полета', !!b && JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['article_id', 'done_by', 'photos', 'store_name']) &&
      b.article_id === 'b-tl' && b.store_name === 'Троян' && b.done_by === 'Управител Троян' &&
      Array.isArray(b.photos) && b.photos.length === 1 && /problem-articles\//.test(b.photos[0].url) && b.photos[0].name === 'snimka0.jpg', JSON.stringify(b));
    await settle(() => !!(bRow(h, 'b-tl') && bRow(h, 'b-tl').querySelector('.bul-pa-done')));
    const row = bRow(h, 'b-tl');
    ok('отметнатият ред: „✓ Направено 23.11 от Управител Троян“', !!row && txt(row).indexOf('✓ Направено 23.11 от Управител Троян') >= 0, txt(row));
    ok('… и няма <button> в реда', !!row && row.querySelectorAll('button').length === 0);
    ok('… редът остава видим', !!row);
  }
  {
    const h = await bulView(TROYAN);
    realClick(h.w, bRow(h, 'b-all').querySelector('button.bul-pa-btn'));
    ok('без photo_required: „(по избор)“', txt(h.doc.getElementById('bulpa-ov')).indexOf('по избор') >= 0);
    realClick(h.w, h.doc.getElementById('bulpa-ok'));
    await settle(() => donePosts(h).length > 0);
    const b = donePosts(h)[0] && donePosts(h)[0].body;
    ok('без photo_required → минава без снимка (photos [])', !!b && b.article_id === 'b-all' && Array.isArray(b.photos) && b.photos.length === 0, JSON.stringify(b));
  }
  {
    const h = await bulView(TROYAN, { fail: { POST: /problem_article_done/ } });
    realClick(h.w, bRow(h, 'b-all').querySelector('button.bul-pa-btn'));
    realClick(h.w, h.doc.getElementById('bulpa-ok'));
    await settle(() => redToasts(h).length > 0);
    ok('паднал POST → червен toast', redToasts(h).length > 0);
    const okb = h.doc.getElementById('bulpa-ok');
    ok('… модалът остава и „Потвърди“ е отключен', !!okb && okb.disabled === false && txt(okb) === 'Потвърди');
    ok('… бутонът „✅ Направено“ в реда остава', !!bRow(h, 'b-all').querySelector('button.bul-pa-btn'));
  }
  {
    const h = await bulView(TROYAN, { fail: { POST: /storage\/v1\/object/ } });
    realClick(h.w, bRow(h, 'b-tl').querySelector('button.bul-pa-btn'));
    setFiles(h, 1);
    realClick(h.w, h.doc.getElementById('bulpa-ok'));
    await settle(() => redToasts(h).length > 0);
    ok('паднало качване → червен toast, 0 POST към problem_article_done', redToasts(h).length > 0 && donePosts(h).length === 0);
    ok('… „Потвърди“ е отключен', h.doc.getElementById('bulpa-ok') && h.doc.getElementById('bulpa-ok').disabled === false);
  }
  {
    const h = await bulView(TROYAN, { done: [{ id: 'x', article_id: 'b-all', store_name: 'Ловеч', done_by: 'Ловеч', done_at: '2026-11-22T10:00:00Z', photos: [] }] });
    ok('отметка на ДРУГ обект не отмята моя ред', !!bRow(h, 'b-all').querySelector('button.bul-pa-btn'));
  }

  section('5. Разлики — повторно отваряне на под-таба чете наново');
  {
    const done = [];
    const h = sdEnv({ pa: [pa('p-one', '700', { bulletin_on: true, bulletin_stores: ['Троян'] })], done });
    guard('loadStockDiff()', () => h.w.loadStockDiff());
    await settle(() => h.w.sdPaLoaded && h.w.sdMe);
    await ticks();
    const swBtn = v => h.doc.querySelector('#sd-view-switch button[data-sd-view="' + v + '"]');
    const cell = () => { const r = rowOf(h, 'p-one'); return r ? txt(r.querySelector('.sd-pa-bulcell')) : null; };
    realClick(h.w, swBtn('problems'));
    await settle(() => !!rowOf(h, 'p-one'));
    for (let i = 0; i < 10; i++) await ticks();
    const before = cell();
    ok('първо отваряне: „✓ 0/1 обекта“', before === '✓ 0/1 обекта', before);
    /* Отметка на обекта, появила се в базата след първото зареждане. */
    done.push({ id: 'd-late', article_id: 'p-one', store_name: 'Троян', done_by: 'Управител Троян', done_at: '2026-11-23T11:00:00Z', photos: [] });
    realClick(h.w, swBtn('reports'));
    const gets0 = h.calls.get.filter(g => /problem_article_done/.test(String(g))).length;
    realClick(h.w, swBtn('problems'));
    ok('докато чете — досегашните данни, без празна таблица', cell() === before, cell());
    await settle(() => cell() === '✓ 1/1 обекта');
    ok('след повторно отваряне: „✓ 1/1 обекта“', cell() === '✓ 1/1 обекта', cell());
    ok('… с ново четене на problem_article_done', h.calls.get.filter(g => /problem_article_done/.test(String(g))).length > gets0);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
