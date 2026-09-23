/* Вътрешен указател (contacts.js v4): табове Отдели / Магазини / Доставчици.

   Покрива:
   1. Отдели — групиране по отдел, колоните от таблицата, чипове по отдел,
      търсене, подсказка „N в Магазини →" при търсене без съвпадение.
   2. Магазини — персоналът е подреден по длъжност (Управител → МТЗ →
      Снабдител ...), общият телефон е в заглавието, не като човек;
      търсене по име на обекта показва целия обект.
   3. Детайл — снимката е в детайла, заместникът е линк към своя детайл,
      „Замества", „Последна промяна".
   4. Модал — категорията НЕ се сменя тихо при редакция (Счетоводство,
      Гр. 101); '—' от базата не влиза в полетата; нов запис от таб
      Магазини е type 'contact' с категория „Персонал магазини";
      длъжност в обект без магазин не се записва; PATCH носи новите полета
      и updated_by; toast-ът казва „Записано!" при редакция.
   5. Не-админ — няма бутони за редакция в редовете.

   Кликовете са истински (realClick / bubbleClick от harness-а).
   Пускане: node tests/contacts-directory.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, bubbleClick, fire, btn, btnExact, ok, guard, section, report, ticks } = H;
const ROOT = process.argv[2] || (__dirname + '/..');

const CONTACTS = [
  { id: 'd-1', type: 'contact', name: 'Иван Иванов', role_title: 'Мениджър логистика', category: 'Централно снабдяване',
    direction: 'Транспорт', phone: '0888 111 111', email: 'ivan@temax.bg', deputy_id: 'd-2', store_name: '',
    photo_url: 'https://example.org/ivan.jpg', updated_at: '2026-09-20T10:00:00+03:00', updated_by: 'Плами' },
  { id: 'd-2', type: 'contact', name: 'Петър Петров', role_title: 'Логистик', category: 'Централно снабдяване',
    direction: 'Транспорт', phone: '0888 222 222', email: '', store_name: '—' },
  { id: 'd-3', type: 'contact', name: 'Анна Колева', role_title: 'Счетоводител', category: 'Счетоводство',
    phone: '—', email: 'anna@temax.bg', notes: '—', store_name: '' },
  /* Магазин Петрич — в обратен ред нарочно, за да се види подредбата */
  { id: 's-1', type: 'contact', name: 'Снабдител Петрич', role_title: 'Снабдител', category: 'Персонал магазини',
    store_name: 'Петрич', store_role: 'supplier', phone: '0877 000 003' },
  { id: 's-2', type: 'contact', name: 'Любомир Лилков', role_title: 'МТЗ', category: 'Персонал магазини',
    store_name: 'Петрич', store_role: 'deputy_mtz', phone: '0877 000 002' },
  { id: 's-3', type: 'contact', name: 'Управител Петрич', role_title: 'Управител', category: 'Персонал магазини',
    store_name: 'Петрич', store_role: 'manager', phone: '0877 000 001' },
  { id: 's-4', type: 'contact', name: 'Обект Петрич', role_title: '', category: 'Персонал магазини',
    store_name: 'Петрич', store_role: 'store', phone: '073 000 000' },
  { id: 's-5', type: 'contact', name: 'Управител Троян', role_title: 'Управител', category: 'Персонал магазини',
    store_name: 'Троян', store_role: 'manager', phone: '0877 999 999' },
  { id: 'p-1', type: 'supplier', name: 'Дървопласт ООД', category: 'Гр. 101', phone: '02 987 65 43' }
];

const ADMIN = { email: 'pl@temax.bg', display_name: 'Плами', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'troyan@temax.bg', display_name: 'Троян', role: 'manager', store_name: 'Троян' };

async function env(user) {
  const h = boot({
    repo: ROOT,
    modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
    user: user,
    data: { contacts: CONTACTS, stores: [{ id: 1, name: 'Петрич' }, { id: 2, name: 'Троян' }, { id: 3, name: 'Пазарджик' }] }
  });
  guard('loadContacts()', () => h.w.loadContacts());
  await ticks();
  /* Началният таб е „Начало" (виж contacts-home.test.js); тук се тестват
     списъците, затова се отваря Отдели. */
  guard('таб Отдели', () => h.w.setContactsTab('contact'));
  return h;
}
const grid = doc => doc.getElementById('contacts-grid');
const rows = doc => Array.from(grid(doc).querySelectorAll('.ct-row[data-id]'));
const rowIds = doc => rows(doc).map(r => r.getAttribute('data-id'));
const tab = (w, doc, t) => { const b = doc.querySelector('#c-tabs button[data-tab="' + t + '"]'); guard('таб ' + t, () => realClick(w, b)); };
const search = (w, doc, q) => { const i = doc.getElementById('contacts-search'); i.value = q; guard('търсене ' + q, () => fire(w, i, 'input')); };

(async function run() {

  section('1. Отдели: групи, колони, заместник в реда');
  {
    const { w, doc } = await env(ADMIN);
    const t = grid(doc).textContent;
    ok('няма магазинен персонал в Отдели', rowIds(doc).every(id => id[0] === 'd'), JSON.stringify(rowIds(doc)));
    ok('три реда: d-1, d-2, d-3', rowIds(doc).length === 3, JSON.stringify(rowIds(doc)));
    ['Направление', 'Отговорник', 'Длъжност', 'Телефон', 'Имейл', 'Заместник'].forEach(k =>
      ok('колона „' + k + '"', t.indexOf(k) >= 0));
    ok('групи „Централно снабдяване" и „Счетоводство"', t.indexOf('Централно снабдяване') >= 0 && t.indexOf('Счетоводство') >= 0);
    const r1 = grid(doc).querySelector('[data-id="d-1"]');
    ok('заместникът „Петър Петров" е в реда на Иван', !!r1 && r1.querySelector('.ct-c-dep').textContent === 'Петър Петров');
    ok('направлението „Транспорт" е в реда', !!r1 && r1.querySelector('.ct-c-dir').textContent === 'Транспорт');
    ok('няма снимка в списъка', !grid(doc).querySelector('img'));
    const r3 = grid(doc).querySelector('[data-id="d-3"]');
    ok('телефон „—" от базата не е tel: линк', !!r3 && !r3.querySelector('a[href^="tel:"]'));
    ok('админ: ✏️ и ✕ в реда', !!r1 && !!r1.querySelector('button[title="Редактирай"]') && !!r1.querySelector('button[title="Изтрий"]'));
  }

  section('2. Отдели: чипове по отдел');
  {
    const { w, doc } = await env(ADMIN);
    /* Без чипа „⚠️ За проверка" (виж contacts-stale.test.js) — тук само отделите. */
    const chips = Array.from(doc.querySelectorAll('#ct-filters button.ct-chip:not(.ct-chip-warn)'));
    ok('чип „Всички" + 2 отдела', chips.length === 3, chips.map(c => c.textContent).join(' | '));
    const acc = chips.find(c => c.getAttribute('data-cat') === 'Счетоводство');
    if (acc) guard('клик Счетоводство', () => realClick(w, acc));
    ok('само d-3', JSON.stringify(rowIds(doc)) === '["d-3"]', JSON.stringify(rowIds(doc)));
    const on = doc.querySelector('#ct-filters button.ct-chip.on');
    ok('чипът е активен', !!on && on.getAttribute('data-cat') === 'Счетоводство');
    const all = doc.querySelector('#ct-filters button.ct-chip[data-cat=""]');
    guard('клик Всички', () => realClick(w, all));
    ok('пак 3 реда', rowIds(doc).length === 3);
  }

  section('3. Търсене: по човек, по направление, подсказка към Магазини');
  {
    const { w, doc } = await env(ADMIN);
    const inp0 = doc.getElementById('contacts-search');
    search(w, doc, 'петров');
    ok('„петров" → d-2 и d-1 (заместник Петров)', JSON.stringify(rowIds(doc).sort()) === '["d-1","d-2"]', JSON.stringify(rowIds(doc)));
    search(w, doc, 'транспорт');
    ok('„транспорт" (направление) → d-1, d-2', rowIds(doc).length === 2);
    ok('полето за търсене е същият елемент (не губи фокуса)', doc.getElementById('contacts-search') === inp0);
    search(w, doc, 'лилков');
    ok('в Отдели няма Лилков', rowIds(doc).length === 0);
    const hint = btn(grid(doc), 'в Магазини');
    ok('подсказка „1 в Магазини →"', !!hint && hint.textContent.indexOf('1') >= 0);
    if (hint) guard('клик подсказка', () => realClick(w, hint));
    ok('табът е Магазини', w.contactsTab === 'stores');
    ok('търсенето е запазено', doc.getElementById('contacts-search').value === 'лилков');
    ok('вижда се s-2', JSON.stringify(rowIds(doc)) === '["s-2"]', JSON.stringify(rowIds(doc)));
  }

  section('4. Магазини: подредба по длъжност, общ телефон в заглавието');
  {
    const { w, doc } = await env(ADMIN);
    tab(w, doc, 'stores');
    const boxes = Array.from(grid(doc).querySelectorAll('.ct-box'));
    ok('две карти: Петрич и Троян', boxes.length === 2, boxes.length);
    const pet = boxes.find(b => b.textContent.indexOf('Петрич') >= 0);
    const ids = pet ? Array.from(pet.querySelectorAll('.ct-row[data-id]')).map(r => r.getAttribute('data-id')) : [];
    ok('ред: Управител → МТЗ → Снабдител', JSON.stringify(ids) === '["s-3","s-2","s-1"]', JSON.stringify(ids));
    ok('„Обект Петрич" НЕ е ред с човек', ids.indexOf('s-4') < 0);
    const head = pet && pet.querySelector('.ct-box-h');
    ok('общият телефон е tel: линк в заглавието', !!head && !!head.querySelector('a[href="tel:073000000"]'));
    const mtz = pet && pet.querySelector('[data-id="s-2"] .ct-c-role');
    ok('МТЗ се показва като „Зам. управител (МТЗ)"', !!mtz && mtz.textContent === 'Зам. управител (МТЗ)', mtz && mtz.textContent);
    const sel = doc.getElementById('ct-store-filter');
    ok('падащо меню с обекти', !!sel && sel.options.length === 3, sel && sel.options.length);
    sel.value = 'Троян'; guard('избор Троян', () => fire(w, sel, 'change'));
    ok('само Троян', JSON.stringify(rowIds(doc)) === '["s-5"]', JSON.stringify(rowIds(doc)));
    sel.value = ''; fire(w, sel, 'change');
    search(w, doc, 'петрич');
    ok('търсене по обект показва целия обект (3 души)', rowIds(doc).length === 3, JSON.stringify(rowIds(doc)));
    search(w, doc, '0877 999');
    ok('търсене по телефон → s-5', JSON.stringify(rowIds(doc)) === '["s-5"]');
  }

  section('5. Детайл: снимка, заместник-линк, „Замества", последна промяна');
  {
    const { w, doc } = await env(ADMIN);
    const nm = grid(doc).querySelector('[data-id="d-1"] .ct-c-name');
    guard('клик по името', () => bubbleClick(w, nm));
    let ov = doc.getElementById('ctd-ov');
    ok('детайлът е отворен', !!ov);
    ok('снимката е в детайла', !!ov && !!ov.querySelector('img[src="https://example.org/ivan.jpg"]'));
    ok('Направление: Транспорт', !!ov && ov.textContent.indexOf('Транспорт') >= 0);
    ok('Последна промяна: 20.09.2026 · Плами', !!ov && ov.textContent.indexOf('20.09.2026 · Плами') >= 0, ov && ov.textContent);
    const dl = ov && Array.from(ov.querySelectorAll('a')).find(a => a.textContent === 'Петър Петров');
    ok('заместникът е линк', !!dl);
    if (dl) guard('клик заместник', () => realClick(w, dl));
    ov = doc.getElementById('ctd-ov');
    ok('отваря детайла на Петров', !!ov && ov.textContent.indexOf('Логистик') >= 0);
    ok('при Петров: „Замества Иван Иванов"', !!ov && ov.textContent.indexOf('Замества') >= 0 && ov.textContent.indexOf('Иван Иванов') >= 0);
    ok('магазин „—" не се показва', !!ov && ov.textContent.indexOf('Магазин') < 0);
    ok('само един #ctd-ov', doc.querySelectorAll('#ctd-ov').length === 1);
    w.closeContactDetail();
  }

  section('6. Модал: редакция пази категорията, без тирета, PATCH с новите полета');
  {
    const { w, doc, calls } = await env(ADMIN);
    const e3 = grid(doc).querySelector('[data-id="d-3"] button[title="Редактирай"]');
    guard('✏️ Анна', () => bubbleClick(w, e3));
    await ticks();
    const mod = doc.getElementById('contact-ov');
    ok('модалът е отворен', !!mod && mod.classList.contains('open'));
    ok('категорията остава „Счетоводство"', doc.getElementById('c-cat').value === 'Счетоводство', doc.getElementById('c-cat').value);
    ok('телефон „—" → празно поле', doc.getElementById('ct-phone').value === '');
    ok('бележки „—" → празно', doc.getElementById('c-notes').value === '');
    ['ct-dir', 'ct-srole', 'ct-deputy', 'c-store'].forEach(id => ok('поле #' + id, !!doc.getElementById(id)));
    const dep = doc.getElementById('ct-deputy');
    ok('заместник: без самата Анна', !Array.from(dep.options).some(o => o.value === 'd-3'));
    ok('заместник: без „Обект Петрич"', !Array.from(dep.options).some(o => o.value === 's-4'));
    doc.getElementById('ct-dir').value = 'Фактури';
    dep.value = 'd-1';
    const before = calls.patch.length;
    guard('Запази', () => realClick(w, btnExact(mod, 'Запази')));
    await ticks(6);
    const p = calls.patch.slice(before).find(x => x.table === 'contacts');
    ok('PATCH contacts', !!p);
    if (p) {
      const b = p.body;
      ok('category = Счетоводство', b.category === 'Счетоводство', b.category);
      ok('direction = Фактури', b.direction === 'Фактури');
      ok('deputy_id = d-1', b.deputy_id === 'd-1');
      ok('store_role = null', b.store_role === null);
      ok('phone е празен, не „—"', b.phone === '', JSON.stringify(b.phone));
      ok('updated_by = Плами', b.updated_by === 'Плами');
      ok('type = contact', b.type === 'contact');
    }
    ok('toast „Записано!"', calls.toast.some(t => /Записано/.test(t)), JSON.stringify(calls.toast));
  }

  section('7. Модал: доставчик от „Гр. 101" пази категорията');
  {
    const { w, doc, calls } = await env(ADMIN);
    tab(w, doc, 'supplier');
    w.openContactModal('p-1');
    ok('категорията е „Гр. 101"', doc.getElementById('c-cat').value === 'Гр. 101', doc.getElementById('c-cat').value);
    ok('няма поле за длъжност в обект', !doc.getElementById('ct-srole'));
    const mod = doc.getElementById('contact-ov');
    guard('Запази', () => realClick(w, btnExact(mod, 'Запази')));
    await ticks(6);
    const p = calls.patch.find(x => x.table === 'contacts');
    ok('PATCH: category Гр. 101, type supplier', !!p && p.body.category === 'Гр. 101' && p.body.type === 'supplier');
    ok('PATCH без store_role (доставчик)', !!p && !('store_role' in p.body));
  }

  section('8. Нов запис от таб Магазини');
  {
    const { w, doc, calls } = await env(ADMIN);
    tab(w, doc, 'stores');
    const mod0 = doc.getElementById('mod-contacts');
    guard('+ Добави', () => realClick(w, btnExact(mod0, '+ Добави')));
    await ticks(6);
    const mod = doc.getElementById('contact-ov');
    ok('категория по подразбиране „Персонал магазини"', doc.getElementById('c-cat').value === 'Персонал магазини');
    ok('празните полета са празни (не „—")', ['ct-name', 'c-role', 'ct-phone', 'c-email', 'ct-dir'].every(id => doc.getElementById(id).value === ''));
    const st = doc.getElementById('c-store');
    ok('обектите включват Пазарджик от stores', Array.from(st.options).some(o => o.value === 'Пазарджик'));
    doc.getElementById('ct-name').value = 'Нов МТЗ';
    doc.getElementById('ct-srole').value = 'deputy_mtz';
    st.value = '';
    guard('Добави без магазин', () => realClick(w, btnExact(mod, 'Добави')));
    await ticks(3);
    ok('блокирано: „Избери магазин"', calls.toast.some(t => /Избери магазин/.test(t)));
    ok('няма POST', !calls.post.some(x => x.table === 'contacts'));
    st.value = 'Троян';
    guard('Добави с магазин', () => realClick(w, btnExact(mod, 'Добави')));
    await ticks(6);
    const p = calls.post.find(x => x.table === 'contacts');
    const b = p && (Array.isArray(p.body) ? p.body[0] : p.body);
    ok('POST type=contact (не „stores")', !!b && b.type === 'contact', b && b.type);
    ok('store_role=deputy_mtz, store_name=Троян', !!b && b.store_role === 'deputy_mtz' && b.store_name === 'Троян');
    ok('toast „Добавено!"', calls.toast.some(t => /Добавено/.test(t)));
  }

  section('9. Не-админ: без бутони в редовете, без „+ Добави"');
  {
    const { w, doc } = await env(STORE);
    ok('няма ✏️ в Отдели', !grid(doc).querySelector('button[title="Редактирай"]'));
    ok('няма „+ Добави"', !btnExact(doc.getElementById('mod-contacts'), '+ Добави'));
    tab(w, doc, 'stores');
    ok('Магазини се виждат (4 души; общият телефон не е ред)', rowIds(doc).length === 4, rowIds(doc).length);
    ok('няма ✏️ в Магазини', !grid(doc).querySelector('button[title="Редактирай"]'));
  }

  report();
})();
