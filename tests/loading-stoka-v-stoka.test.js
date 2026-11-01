/* Товарни листи — „📦 Стока в стока" (loading_list_items.nested_codes), етап 1.
   01.11.2026, сесия loading-stoka-v-stoka (искане на Теодор, 29.10: коледните
   кутии 98235/98234/98233 и 98247/98246/98243 идват една в друга — обектът не
   отваря кашона и подава разлика за вътрешните).

   Правилото:
     · складът (llCanEdit) пише в редактора по една група на ред, кодовете с „/";
       при запис — тримване, празните редове махнати, само цифри и „/", поне 2
       кода в група; невалидна група → червен toast и НУЛА записи; празно → null;
     · палетът с N документа е N реда — всеки носи същата стойност;
     · обектът вижда жълт бадж „📦 Стока в стока: … — отворете кашона" по група,
       само при непразно nested_codes; полето за редакция го няма;
     · печатът, PDF-ът, писмото до обекта при изпращане и бланката за Разлика
       носят групите. Етикетът с QR и писмото до склада при приключване — НЕ
       (етикетът е фиксиран размер; писмото до склада не показва и коментара).

   Мутационна проверка (01.11.2026) — всеки вариант пуснат срещу loading.js и паднал:
     N1 празно записва '' вместо null (llNestedParse)                    → пада
     N2 приема група с 1 код (`+` → `*` в регекса)                       → пада
     N3 баджът се показва и при null (без групи — пак един бадж)          → пада
     N4 невалидната група не спира записа (без проверката в llSaveDraft)  → пада
     N5 редакцията не зарежда стойността от реда (llUnitsFromRows)        → пада
     N6 съдържанието на textarea през esc() — празното става „—" и
        блокира записа на всеки ред (хванато при писането, 01.11)        → пада
   Пускане:  node tests/loading-stoka-v-stoka.test.js .
*/
'use strict';
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, realClick, fire, btn, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище', role: 'sklad', store_name: WH, assigned_stores: [] };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич', role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const STORE_ROLE = { email: 'st@temax.bg', display_name: 'Обект Петрич', role: 'store', store_name: 'Петрич', assigned_stores: [] };

const L_DRAFT = { id: 'L1', warehouse: WH, list_date: '2026-11-01', status: 'draft', executed_by: 'Иван', comment: '',
  created_at: '2026-11-01T06:00:00.000Z', sent_at: null, done_at: null };
const L_SENT = Object.assign({}, L_DRAFT, { id: 'L2', status: 'sent', sent_at: '2026-11-01T07:00:00.000Z' });
function item(o) {
  return Object.assign({ list_id: 'L2', kind: 'pallet', pallet_no: 1, pallet_total: 1, purchase_doc: null, clears_doc: null,
    store_name: 'Петрич', warehouse_comment: null, nested_codes: null, store_comment: null, partial: false,
    received: false, received_by: null, received_at: null, missing: false, missing_by: null, missing_at: null,
    added_by_store: false, approval_status: null, created_at: 'x' }, o);
}
const TWO = '98235/98234/98233\n98247/98246/98243';

function env(user, lists, items) {
  const h = boot({
    modules: ['transport.js', 'bulletin.js', 'stock-returns.js', 'stock-differences.js', 'push.js', 'email.js', 'loading.js'],
    user: user, confirm: true,
    data: {
      loading_lists: lists || [],
      loading_list_items: () => (items || []).map(it => Object.assign({}, it, { loading_list_products: [] })),
      users: [{ store_name: 'Петрич' }, { store_name: 'Гоце Делчев' }, { store_name: WH }],
      loading_list_products: [], stores: [], contacts: [], transport_orders: [], stock_differences: [],
      differences_reports: [], stock_returns: [], goods_transit: [], app_settings: []
    }
  });
  h.toasts = [];
  const orig = h.w.toast;
  h.w.toast = function (m, c) { h.toasts.push({ msg: String(m), col: c }); return orig(m, c); };
  return h;
}
const mod = h => h.doc.getElementById('mod-loading');
/* Истинско писане в полето: стойност + събитие input (oninput в markup-а). */
function typeInto(h, el, val) { el.value = val; fire(h.w, el, 'input'); }
function saveBtn(h) { return btn(mod(h), 'Запази черновата'); }
const itemBodies = (h, kind) => h.calls[kind].filter(p => p.table === 'loading_list_items')
  .reduce((a, p) => a.concat(Array.isArray(p.body) ? p.body : [p.body]), []);

(async function () {

  section('1. Парсване на полето');
  {
    const h = env(WAREHOUSE);
    const P = t => h.w.llNestedParse(t);
    ok('две групи с празен ред и интервали → нормализирано', P('  98235 / 98234/98233 \n\n 98247/98246/98243  \n').value === TWO, JSON.stringify(P('  98235 / 98234/98233 \n\n 98247/98246/98243  \n')));
    ok('празно → null', P('').value === null && P('').ok === true);
    ok('само интервали и празни редове → null', P('  \n \n').value === null && P('  \n \n').ok === true);
    ok('буква → невалидно', P('98235/98A34').ok === false);
    ok('един код → невалидно', P('98235').ok === false && P('98235').bad === '98235');
    ok('празен код („98235//98234") → невалидно', P('98235//98234').ok === false);
    ok('запетая вместо / → невалидно', P('98235,98234').ok === false);
    ok('точно 2 кода — валидно (границата)', P('1/2').ok === true && P('1/2').value === '1/2');
    h.close();
  }

  section('2. Складът записва 2 групи — нов лист, истински клик');
  {
    const h = env(WAREHOUSE);
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llSetRowField(0, 'store_name', 'Петрич');
    h.w.llUnitDocAdd(0, 'ИЗХ-1'); h.w.llUnitDocAdd(0, 'ИЗХ-2');
    h.w.renderLoadingLists();
    const ta = h.doc.getElementById('ll-nc-0');
    if (ok('полето „Стока в стока" го има (textarea)', ta && ta.tagName === 'TEXTAREA')) {
      ok('празно в началото (не „—" от esc(\'\') — иначе всеки ред би блокирал записа)', ta.value === '', JSON.stringify(ta.value));
      ok('с подсказката', (ta.getAttribute('placeholder') || '') === 'кодове един в друг, разделени с /, напр. 98235/98234/98233', ta.getAttribute('placeholder'));
      typeInto(h, ta, ' 98235/98234/98233 \n\n98247 / 98246 / 98243\n');
    }
    realClick(h.w, saveBtn(h));
    await ticks(); await ticks(); await ticks();
    const rows = itemBodies(h, 'post');
    ok('палетът с 2 документа → 2 реда', rows.length === 2, JSON.stringify(rows.map(r => r.purchase_doc)));
    ok('и двата носят двете групи, нормализирани', rows.length === 2 && rows.every(r => r.nested_codes === TWO), JSON.stringify(rows.map(r => r.nested_codes)));
    h.close();
  }

  section('3. Празно поле → null (не „")');
  {
    const h = env(ADMIN);
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llSetRowField(0, 'store_name', 'Петрич');
    h.w.llUnitDocAdd(0, 'ИЗХ-5');
    h.w.renderLoadingLists();
    typeInto(h, h.doc.getElementById('ll-nc-0'), '   \n  ');
    realClick(h.w, saveBtn(h));
    await ticks(); await ticks(); await ticks();
    const rows = itemBodies(h, 'post');
    ok('admin също вижда полето и записва', rows.length === 1);
    ok('nested_codes === null', rows.length === 1 && rows[0].nested_codes === null && 'nested_codes' in rows[0], JSON.stringify(rows[0]));
    h.close();
  }

  section('4. Невалидна група → червен toast и НУЛА записи');
  for (const bad of ['98235/98A34', '98235']) {
    const h = env(WAREHOUSE);
    h.w.llNewList();
    await ticks(); await ticks();
    h.w.llSetRowField(0, 'store_name', 'Петрич');
    h.w.llUnitDocAdd(0, 'ИЗХ-7');
    h.w.renderLoadingLists();
    typeInto(h, h.doc.getElementById('ll-nc-0'), '98247/98246\n' + bad);
    realClick(h.w, saveBtn(h));
    await ticks(); await ticks(); await ticks();
    ok('„' + bad + '": нула POST/PATCH', h.calls.post.length === 0 && h.calls.patch.length === 0,
      JSON.stringify(h.calls.post.map(p => p.table).concat(h.calls.patch.map(p => p.table))));
    ok('„' + bad + '": червен toast, който назовава групата', h.toasts.some(t => t.col === '#dc2626' && /Стока в стока/.test(t.msg) && t.msg.indexOf(bad) >= 0), JSON.stringify(h.toasts));
    ok('„' + bad + '": редакторът остава с написаното', h.doc.getElementById('ll-nc-0') && h.doc.getElementById('ll-nc-0').value === '98247/98246\n' + bad);
    h.close();
  }

  section('5. Редакция на съществуващ ред (чернова)');
  {
    const items = [item({ id: 'd1', list_id: 'L1', position: 1, purchase_doc: 'ИЗХ-1', nested_codes: '98235/98234/98233' }),
                   item({ id: 'd2', list_id: 'L1', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-2' })];
    const h = env(WAREHOUSE, [L_DRAFT], items);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llOpenEdit('L1');
    await ticks(); await ticks();
    const t0 = h.doc.getElementById('ll-nc-0'), t1 = h.doc.getElementById('ll-nc-1');
    ok('стойността от реда е заредена в полето', t0 && t0.value === '98235/98234/98233', t0 && t0.value);
    ok('редът без стока в стока — празно поле', t1 && t1.value === '', t1 && JSON.stringify(t1.value));
    typeInto(h, t0, '');                            /* махнато */
    typeInto(h, t1, '98247/98246/98243');           /* добавено */
    realClick(h.w, saveBtn(h));
    await ticks(); await ticks(); await ticks();
    const p = itemBodies(h, 'patch');
    const by = doc => p.filter(r => r.purchase_doc === doc)[0];
    ok('и двата реда са PATCH-нати', p.length === 2 && h.calls.post.filter(x => x.table === 'loading_list_items').length === 0, JSON.stringify(p.map(r => r.purchase_doc)));
    ok('изтритото → null', by('ИЗХ-1') && by('ИЗХ-1').nested_codes === null, JSON.stringify(by('ИЗХ-1')));
    ok('добавеното → „98247/98246/98243"', by('ИЗХ-2') && by('ИЗХ-2').nested_codes === '98247/98246/98243');
    ok('PATCH-ът е по id', h.calls.patch.some(x => x.table === 'loading_list_items' && /id=eq\.d2/.test(x.url)));
    h.close();
  }

  const SENT_ITEMS = [
    item({ id: 's1', position: 1, purchase_doc: 'ИЗХ-10', warehouse_comment: 'кашони отгоре', nested_codes: TWO }),
    item({ id: 's2', position: 2, pallet_no: 2, pallet_total: 2, purchase_doc: 'ИЗХ-11' })
  ];

  section('6. Обектът при приемане — бадж само при nested_codes');
  for (const u of [STORE, STORE_ROLE]) {
    const h = env(u, [L_SENT], SENT_ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks(); await ticks();
    const badges = Array.from(mod(h).querySelectorAll('.ll-nested'));
    ok(u.role + ': точно 2 баджа (2 групи на ред ИЗХ-10)', badges.length === 2, mod(h).innerHTML.slice(0, 300));
    ok(u.role + ': текстът', badges[0] && badges[0].textContent === '📦 Стока в стока: 98235 / 98234 / 98233 — отворете кашона' &&
      badges[1].textContent === '📦 Стока в стока: 98247 / 98246 / 98243 — отворете кашона', badges.map(b => b.textContent).join(' | '));
    ok(u.role + ': жълт', badges[0] && /background:#fef3c7/.test(badges[0].getAttribute('style')));
    const rowOf = doc => Array.from(mod(h).querySelectorAll('tr')).filter(tr => tr.textContent.indexOf(doc) >= 0 && !tr.hasAttribute('data-ll-unit-head'))[0];
    ok(u.role + ': баджът е на реда ИЗХ-10', rowOf('ИЗХ-10') && rowOf('ИЗХ-10').querySelectorAll('.ll-nested').length === 2);
    ok(u.role + ': ред ИЗХ-11 (null) — без бадж', rowOf('ИЗХ-11') && rowOf('ИЗХ-11').querySelectorAll('.ll-nested').length === 0);
    ok(u.role + ': полето за редакция го няма', !mod(h).querySelector('textarea[id^="ll-nc-"]') && !h.w.llCanEdit());
    h.close();
  }
  {
    const h = env(WAREHOUSE);
    ok('llNestedBadgeHtml(null) / ("") / ("  ") → ""', h.w.llNestedBadgeHtml(null) === '' && h.w.llNestedBadgeHtml('') === '' && h.w.llNestedBadgeHtml('  \n ') === '');
    h.close();
  }

  section('7. Печат, писмо до обекта, PDF, бланка за Разлика');
  {
    const h = env(WAREHOUSE, [L_SENT], SENT_ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    h.w.llPrint('L2');
    await ticks();
    const pr = h.doc.getElementById('mod-print');
    const nest = Array.from(pr.querySelectorAll('.lp-nest')).map(d => d.textContent);
    ok('печатът носи двете групи под реда', nest.join(' | ') === 'Стока в стока: 98235 / 98234 / 98233 | Стока в стока: 98247 / 98246 / 98243', nest.join(' | '));
    ok('… в клетката на реда ИЗХ-10', Array.from(pr.querySelectorAll('tr')).some(tr => tr.textContent.indexOf('ИЗХ-10') >= 0 && tr.querySelectorAll('.lp-nest').length === 2));
    ok('печатният CSS: .lp-nest с white-space:normal (не наследява nowrap на .lp-tag)', /\.lp-nest\{[^}]*white-space:normal/.test(pr.innerHTML));
    const mail = h.w.llSentHtmlFor(L_SENT, 'Петрич', h.w.llItems.filter(x => x.store_name === 'Петрич'), 0);
    ok('писмото до обекта при изпращане — двата баджа', (mail.match(/class="ll-nested"/g) || []).length === 2 && mail.indexOf('98247 / 98246 / 98243 — отворете кашона') >= 0);
    /* PDF — фалшив jsPDF, както в loading-lists-pdf.test.js */
    const lines = [];
    function Doc() {}
    Doc.prototype = { addFileToVFS() {}, addFont() {}, setFont() {}, setFontSize() {}, setTextColor() {}, setDrawColor() {}, setFillColor() {},
      splitTextToSize(t) { return [t]; }, text(t) { lines.push(Array.isArray(t) ? t.join(' ') : String(t)); }, line() {}, rect() {}, addPage() {},
      output() { return 'data:application/pdf;base64,AAAA'; }, getNumberOfPages() { return 1; }, setPage() {},
      internal: { pageSize: { getWidth() { return 210; }, getHeight() { return 297; } } } };
    h.w.jspdf = { jsPDF: Doc };
    h.w.llPdfFont = function () { return Promise.resolve('AAAA'); };
    try { await h.w.llBuildPdf(L_SENT, h.w.llItems, 'Петрич'); } catch (e) { lines.push('ERR ' + e.message); }
    ok('PDF-ът носи групите', lines.some(l => /стока в стока: 98235 \/ 98234 \/ 98233/.test(l)) && lines.some(l => /98247 \/ 98246 \/ 98243/.test(l)), lines.filter(l => /стока|ERR/.test(l)).join(' | ') || lines.slice(0, 5).join(' | '));
    h.close();
  }
  {
    const h = env(STORE, [L_SENT], SENT_ITEMS);
    h.w.loadLoadingLists();
    await ticks(); await ticks();
    let got = null;
    h.w.openDiffSubmitModal = function (o) { got = o; };
    h.w.llOpenDiffForItem('s1');
    await ticks(); await ticks();
    ok('бланката за Разлика: коментарът носи „Стока в стока: 98235/98234/98233; 98247/98246/98243."', got && /Стока в стока: 98235\/98234\/98233; 98247\/98246\/98243\./.test(got.comment), got && got.comment);
    got = null;
    h.w.llOpenDiffForItem('s2');
    await ticks(); await ticks();
    ok('… а за реда без — нищо', got && got.comment.indexOf('Стока в стока') < 0, got && got.comment);
    h.close();
  }
  report();
})().catch(function (e) { console.error(e); process.exit(1); });
