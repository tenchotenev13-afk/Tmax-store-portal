/* Инструкции → папка „🔒 Само за офиса" (docs.js + index.html, 18.11.2026).
   Документ с category 'Само за офиса' се вижда САМО от role 'admin' — и при
   „Всички", и с бутона. Бутонът във #doc-filters и опцията в #d-cat ги има
   само за admin. accounting вижда „+ Добави документ", но не и папката —
   не може да качи в нея (опцията е disabled, а submitDoc отказва).

   Мутанти (18.11.2026, всеки събаря теста):
   М1. docsOfficeVisible() с role 'accounting' вместо 'admin'  → секции 1–4 падат.
   М2. без `d.category===DOCS_OFFICE_CAT&&!officeOk` във филтъра
       (документът изтича при „Всички")                          → секция 1 пада.
   М3. docsApplyOfficeUi() показва бутона винаги (display:'')    → секция 2 пада.
   М4. опцията в #d-cat не се пипа (остава hidden/disabled)      → секция 4 пада.
   М5. без проверката в submitDoc                                 → секция 5 пада.

   Пускане:  node tests/docs-office-only.test.js .
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const OFFICE = 'Само за офиса';
const DOCS = [
  { id: 'd1', title: 'SAP ръководство 1', category: 'SAP', url: 'https://x/1.pdf', description: '', created_at: '2026-11-01T08:00:00Z' },
  { id: 'd2', title: 'SAP ръководство 2', category: 'SAP', url: 'https://x/2.pdf', description: '', created_at: '2026-11-02T08:00:00Z' },
  { id: 'd3', title: 'Заплати ЦО', category: OFFICE, url: 'https://x/3.pdf', description: '', created_at: '2026-11-03T08:00:00Z' }
];
const USERS = {
  manager:    { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' },
  accounting: { email: 'acc@temax.bg', display_name: 'Счетоводство', role: 'accounting', store_name: 'Централен офис' },
  admin:      { email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' }
};

function env(role) {
  const h = boot({ modules: ['docs.js'], user: USERS[role], data: { documents: DOCS } });
  h.w.docs = JSON.parse(JSON.stringify(DOCS));
  h.w.docFilter = 'all';
  return h;
}
const cards = doc => doc.querySelectorAll('#doc-grid [data-url]');
const officeBtn = doc => Array.from(doc.querySelectorAll('#doc-filters button'))
  .find(b => (b.textContent || '').indexOf('Само за офиса') >= 0) || null;
const shown = el => !!el && el.style.display !== 'none';

(async function run() {

  section('1. Брой карти при „Всички": manager 2 / accounting 2 / admin 3');
  for (const [role, n] of [['manager', 2], ['accounting', 2], ['admin', 3]]) {
    const { w, doc } = env(role);
    if (guard(role + ': renderDocs() не хвърля', () => w.renderDocs())) {
      const c = cards(doc);
      ok(role + ': ' + n + ' карти', c.length === n, 'получени ' + c.length);
      const hasOffice = Array.from(c).some(x => x.textContent.indexOf('Заплати ЦО') >= 0);
      ok(role + ': офис документът ' + (role === 'admin' ? 'се вижда' : 'НЕ се вижда'),
        hasOffice === (role === 'admin'));
      if (role === 'admin') {
        const card = Array.from(c).find(x => x.textContent.indexOf('Заплати ЦО') >= 0);
        ok('admin: иконата на офис картата е 🔒', !!card && card.textContent.indexOf('🔒') >= 0);
      }
    }
  }

  section('2. Бутонът „🔒 Само за офиса" — само за admin');
  for (const role of ['manager', 'accounting', 'admin']) {
    const { w, doc } = env(role);
    guard('рендер', () => w.renderDocs());
    const b = officeBtn(doc);
    ok(role + ': <button> съществува в markup-а', !!b && b.tagName === 'BUTTON');
    ok(role + ': бутонът ' + (role === 'admin' ? 'е видим' : 'е скрит'), shown(b) === (role === 'admin'));
  }

  section('3. Истински клик по бутона като admin → точно 1 карта');
  {
    const { w, doc } = env('admin');
    guard('рендер', () => w.renderDocs());
    const b = officeBtn(doc);
    if (ok('admin: бутонът е видим', shown(b))) {
      guard('клик', () => realClick(w, b, '🔒 Само за офиса'));
      const c = cards(doc);
      ok('точно 1 карта след клика', c.length === 1, 'получени ' + c.length);
      ok('картата е офис документът', c.length === 1 && c[0].textContent.indexOf('Заплати ЦО') >= 0);
      ok('бутонът е активен', b.classList.contains('active'));
    }
    /* Същият прозорец, друг потребител — филтърът пада на „Всички" */
    w.currentUser = USERS.accounting;
    guard('рендер като accounting след admin', () => w.renderDocs());
    ok('accounting след admin: бутонът е скрит', !shown(officeBtn(doc)));
    ok('accounting след admin: филтърът е върнат на „Всички"', w.docFilter === 'all');
    ok('accounting след admin: 2 карти', cards(doc).length === 2, 'получени ' + cards(doc).length);
  }
  {
    const { w, doc } = env('accounting');
    guard('рендер', () => w.renderDocs());
    ok('accounting: бутонът го няма (скрит)', !shown(officeBtn(doc)));
  }

  section('4. Опцията „Само за офиса" в #d-cat — само за admin (след „+ Добави документ")');
  for (const role of ['accounting', 'admin']) {
    const { w, doc } = env(role);
    guard('рендер', () => w.renderDocs());
    const add = doc.getElementById('btn-doc-add');
    guard(role + ': клик „+ Добави документ"', () => realClick(w, add, '+ Добави документ'));
    const opt = Array.from(doc.querySelectorAll('#d-cat option')).find(o => o.value === OFFICE);
    ok(role + ': <option> съществува', !!opt);
    const usable = !!opt && !opt.disabled && !opt.hidden && opt.style.display !== 'none';
    ok(role + ': опцията ' + (role === 'admin' ? 'е избираема' : 'е скрита и disabled'), usable === (role === 'admin'));
  }
  {
    const { w } = env('manager');
    guard('manager: resetDocModal()', () => w.resetDocModal());
    const opt = w.document.getElementById('d-cat-office');
    ok('manager: опцията е disabled', !!opt && opt.disabled);
  }

  section('5. submitDoc: accounting не може да запише в папката, admin може');
  {
    const { w, doc, calls } = env('accounting');
    w.resetDocModal();
    doc.getElementById('d-title').value = 'Опит';
    doc.getElementById('d-url').value = 'https://x/y.pdf';
    const sel = doc.getElementById('d-cat');
    doc.getElementById('d-cat-office').disabled = false; /* принудително, като от конзолата */
    sel.value = OFFICE;
    guard('submitDoc', () => w.submitDoc());
    await ticks();
    ok('accounting: няма POST към documents', !calls.post.some(p => p.table === 'documents'));
  }
  {
    const { w, doc, calls } = env('admin');
    w.resetDocModal();
    doc.getElementById('d-title').value = 'Офис';
    doc.getElementById('d-url').value = 'https://x/z.pdf';
    doc.getElementById('d-cat').value = OFFICE;
    guard('submitDoc', () => w.submitDoc());
    await ticks();
    const p = calls.post.find(p => p.table === 'documents');
    ok('admin: POST към documents с category „Само за офиса"',
      !!p && JSON.stringify(p.body || p.data || p).indexOf(OFFICE) >= 0, p ? JSON.stringify(p).slice(0, 200) : 'няма POST');
  }

  section('6. Другите категории са непокътнати');
  {
    const { w, doc } = env('manager');
    guard('рендер', () => w.renderDocs());
    const b = Array.from(doc.querySelectorAll('#doc-filters button')).find(x => x.textContent.trim() === 'SAP');
    guard('клик SAP', () => realClick(w, b, 'SAP'));
    ok('manager: SAP → 2 карти', cards(doc).length === 2);
    ok('бутонът „Противопожарна безопасност" е непокътнат',
      !!Array.from(doc.querySelectorAll('#doc-filters button')).find(x => x.getAttribute('onclick') === "filterDocs('Процедури',this)" && x.textContent.trim() === 'Противопожарна безопасност'));
  }

  report();
})();
