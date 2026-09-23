/* Начален екран на „Контакти" (contacts.js v4, по макета от 23.09.2026).

   Покрива:
   1. Начало е табът по подразбиране; търсачката е в банера; 4-те бързи
      карти; плочки на отделите с брой → клик отваря Отдели с филтър.
   2. Нашите магазини — управителят под името; клик → таб Магазини с обекта.
   3. Често търсени — отметнатите (featured); без отметнати → ръководството
      и бележка само за админ.
   4. Кой за какво — клик: отговорник → детайл; само отдел → Отдели с
      филтър; нищо → админ редактира, не-админ вижда съобщение. Филтърът
      по тема не пресъздава полето. Модалът записва PATCH/POST.
   5. Търсене от банера — хора от отдели И магазини + темите; полето
      остава същият елемент.
   6. Телефони без водеща нула (885949400) и с 359 отпред → tel:0885949400.
   7. „⭐ Често търсен" в модала → PATCH featured.
   8. Провал при зареждане на темите: червен toast, но контактите се виждат.

   Пускане: node tests/contacts-home.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, bubbleClick, fire, btn, btnExact, ok, guard, section, report, ticks } = H;
const ROOT = process.argv[2] || (__dirname + '/..');

const CONTACTS = [
  { id: 'r-1', type: 'contact', name: 'Теодор Тенев', role_title: 'Управител верига', category: 'Ръководство', phone: '0885298547' },
  { id: 'd-1', type: 'contact', name: 'Иван Иванов', role_title: 'Мениджър логистика', category: 'Централно снабдяване',
    phone: '885949400', email: 'ivan@temax.bg', featured: true },
  { id: 'd-2', type: 'contact', name: 'Петър Петров', role_title: 'Логистик', category: 'Централно снабдяване', phone: '359882790094' },
  { id: 'h-1', type: 'contact', name: 'Елена Стоянова', role_title: 'HR специалист', category: 'Човешки ресурси',
    phone: '0888 456 789', email: 'hr@temax.bg' },
  { id: 's-1', type: 'contact', name: 'Стефан Стефанов', role_title: 'Управител', category: 'Персонал магазини',
    store_name: 'Петрич', store_role: 'manager', phone: '0877 100 100' },
  { id: 's-2', type: 'contact', name: 'Даниела Костова', role_title: 'Снабдител', category: 'Персонал магазини',
    store_name: 'Петрич', store_role: 'supplier', phone: '0877 100 300' },
  { id: 's-3', type: 'contact', name: 'Обект Петрич', category: 'Персонал магазини', store_name: 'Петрич',
    store_role: 'store', phone: '073 000 000', photo_url: 'https://example.org/petrich.jpg' },
  { id: 'p-1', type: 'supplier', name: 'Дървопласт ООД', category: 'Гр. 101' }
];
const TOPICS = [
  { id: 't-1', topic: 'SAP проблем', icon: '🖥️', category: 'IT', contact_id: null, sort_order: 10 },
  { id: 't-2', topic: 'Доставка към магазин', icon: '🚚', category: null, contact_id: 'd-1', sort_order: 20 },
  { id: 't-3', topic: 'Грешна цена', icon: '🏷️', category: null, contact_id: null, sort_order: 30 },
  { id: 't-4', topic: 'Персонал', icon: '👥', category: 'Човешки ресурси', contact_id: null, sort_order: 40 }
];
const ADMIN = { email: 'pl@temax.bg', display_name: 'Плами', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'troyan@temax.bg', display_name: 'Троян', role: 'manager', store_name: 'Троян' };

async function env(user, opts) {
  opts = opts || {};
  const h = boot({
    repo: ROOT,
    modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
    user: user,
    data: { contacts: opts.contacts || CONTACTS, contact_topics: TOPICS, stores: [{ id: 1, name: 'Петрич' }] },
    fail: opts.fail
  });
  guard('loadContacts()', () => h.w.loadContacts());
  await ticks(6);
  return h;
}
const grid = doc => doc.getElementById('contacts-grid');
const search = (w, doc, q) => { const i = doc.getElementById('contacts-search'); i.value = q; guard('търсене ' + q, () => fire(w, i, 'input')); };

(async function run() {

  section('1. Начало по подразбиране: банер, бързи карти, плочки на отделите');
  {
    const { w, doc } = await env(ADMIN);
    ok('табът е home', w.contactsTab === 'home');
    const inp = doc.getElementById('contacts-search');
    ok('търсачката е в банера', !!inp && !!inp.closest('.ct-hero'));
    ok('полето е едно', doc.querySelectorAll('#contacts-search').length === 1);
    const q = Array.from(doc.querySelectorAll('.ct-qcard'));
    ok('4 бързи карти', q.length === 4, q.length);
    ['Търси човек', 'Отдели', 'Кой за какво отговаря?', 'Магазини'].forEach(t =>
      ok('карта „' + t + '"', q.some(c => c.textContent.indexOf(t) >= 0)));
    ok('банерът взима снимката на обект', /petrich\.jpg/.test(doc.querySelector('.ct-hero').getAttribute('style') || ''));
    const tiles = Array.from(grid(doc).querySelectorAll('.ct-tile'));
    const cs = tiles.find(t => t.getAttribute('data-cat') === 'Централно снабдяване');
    ok('плочка „Централно снабдяване" с 2 лица', !!cs && cs.textContent.indexOf('2 лица') >= 0, cs && cs.textContent);
    ok('плочка „Ръководство" с 1 лице', tiles.some(t => t.getAttribute('data-cat') === 'Ръководство' && t.textContent.indexOf('1 лице') >= 0));
    ok('плочка Магазини: 1 локация', tiles.some(t => /Магазини/.test(t.textContent) && /1 локация/.test(t.textContent)));
    ok('няма плочка за „Персонал магазини"', !tiles.some(t => t.getAttribute('data-cat') === 'Персонал магазини'));
    guard('клик плочка', () => realClick(w, cs));
    ok('→ таб Отдели', w.contactsTab === 'contact');
    ok('филтър „Централно снабдяване"', w.contactsCat === 'Централно снабдяване');
    const ids = Array.from(grid(doc).querySelectorAll('.ct-row[data-id]')).map(r => r.getAttribute('data-id'));
    ok('само d-1, d-2', JSON.stringify(ids.sort()) === '["d-1","d-2"]', JSON.stringify(ids));
    ok('търсачката вече е горе, не в банер', !!doc.getElementById('contacts-search') && !doc.querySelector('.ct-hero'));
    guard('обратно към Начало', () => realClick(w, doc.querySelector('#c-tabs button[data-tab="home"]')));
    ok('пак Начало с банер', w.contactsTab === 'home' && !!doc.querySelector('.ct-hero #contacts-search'));
  }

  section('2. Нашите магазини');
  {
    const { w, doc } = await env(ADMIN);
    const sc = grid(doc).querySelector('.ct-scard[data-store="Петрич"]');
    ok('карта Петрич', !!sc);
    ok('„Управител: Стефан Стефанов"', !!sc && sc.textContent.indexOf('Управител: Стефан Стефанов') >= 0, sc && sc.textContent);
    ok('снимката на обекта', !!sc && !!sc.querySelector('img[src="https://example.org/petrich.jpg"]'));
    guard('клик Петрич', () => realClick(w, sc));
    ok('→ Магазини, филтър Петрич', w.contactsTab === 'stores' && w.contactsStore === 'Петрич');
  }

  section('3. Често търсени');
  {
    const { w, doc } = await env(ADMIN);
    const f = Array.from(grid(doc).querySelectorAll('.ct-fcard')).map(c => c.getAttribute('data-id'));
    ok('само отметнатият d-1', JSON.stringify(f) === '["d-1"]', JSON.stringify(f));
    ok('няма бележка (има отметнати)', !grid(doc).querySelector('.ct-note'));
    const nm = grid(doc).querySelector('.ct-fcard[data-id="d-1"] .ct-fname');
    guard('клик', () => bubbleClick(w, nm));
    ok('детайлът се отваря', !!doc.getElementById('ctd-ov'));
    w.closeContactDetail();
    const tel = grid(doc).querySelector('.ct-fcard[data-id="d-1"] a[href^="tel:"]');
    ok('tel: с добавена нула', !!tel && tel.getAttribute('href') === 'tel:0885949400', tel && tel.getAttribute('href'));
    ok('текстът е „0885 949 400"', !!tel && tel.textContent.indexOf('0885 949 400') >= 0);
  }
  {
    const noFeat = CONTACTS.map(c => Object.assign({}, c, { featured: false }));
    let e = await env(ADMIN, { contacts: noFeat });
    let f = Array.from(grid(e.doc).querySelectorAll('.ct-fcard')).map(c => c.getAttribute('data-id'));
    ok('без отметнати → ръководството (r-1)', JSON.stringify(f) === '["r-1"]', JSON.stringify(f));
    ok('админ вижда бележка как се попълва', !!grid(e.doc).querySelector('.ct-note'));
    e = await env(STORE, { contacts: noFeat });
    ok('не-админ: без бележка', !grid(e.doc).querySelector('.ct-note'));
    ok('не-админ: блокът пак е пълен', grid(e.doc).querySelectorAll('.ct-fcard').length === 1);
  }

  section('4. Кой за какво отговаря');
  {
    const { w, doc, calls } = await env(STORE);
    const rows = () => Array.from(doc.querySelectorAll('#ct-topics-list .ct-trow'));
    ok('4 теми', rows().length === 4, rows().length);
    const r2 = doc.querySelector('.ct-trow[data-id="t-2"]');
    ok('тема с отговорник показва името', !!r2 && r2.textContent.indexOf('Иван Иванов') >= 0);
    const r3 = doc.querySelector('.ct-trow[data-id="t-3"]');
    ok('тема без нищо: „не е зададен"', !!r3 && r3.textContent.indexOf('не е зададен') >= 0);
    ok('не-админ: без ✏️', !doc.querySelector('#ct-topics-list button'));
    const tq = doc.getElementById('ct-topic-q');
    tq.value = 'цена'; guard('филтър тема', () => fire(w, tq, 'input'));
    ok('филтър „цена" → 1', rows().length === 1);
    ok('полето за филтър е същото', doc.getElementById('ct-topic-q') === tq);
    guard('клик „Грешна цена" (не-админ)', () => realClick(w, rows()[0]));
    ok('съобщение „още няма зададен отговорник"', calls.toast.some(t => /няма зададен отговорник/.test(t)), JSON.stringify(calls.toast));
    ok('модал не се отваря', !doc.querySelector('#ctt-ov.open'));
    tq.value = ''; fire(w, tq, 'input');
    guard('клик „Доставка"', () => realClick(w, doc.querySelector('.ct-trow[data-id="t-2"]')));
    const ov = doc.getElementById('ctd-ov');
    ok('→ детайл на Иван Иванов', !!ov && ov.textContent.indexOf('Иван Иванов') >= 0);
    w.closeContactDetail();
    guard('клик „SAP проблем"', () => realClick(w, doc.querySelector('.ct-trow[data-id="t-1"]')));
    ok('→ Отдели, филтър IT', w.contactsTab === 'contact' && w.contactsCat === 'IT');
  }
  {
    const { w, doc, calls } = await env(ADMIN);
    const e3 = doc.querySelector('.ct-trow[data-id="t-3"] button[title="Редактирай темата"]');
    ok('админ: ✏️ на темата', !!e3);
    guard('✏️ Грешна цена', () => bubbleClick(w, e3));
    const ov = doc.getElementById('ctt-ov');
    ok('модалът е отворен', !!ov && ov.classList.contains('open'));
    ok('полето тема е попълнено', doc.getElementById('ctt-topic').value === 'Грешна цена');
    ok('няма „Персонал магазини" в отделите', !Array.from(doc.getElementById('ctt-cat').options).some(o => o.value === 'Персонал магазини'));
    doc.getElementById('ctt-cat').value = 'Централно снабдяване';
    doc.getElementById('ctt-contact').value = 'd-2';
    guard('Запази', () => realClick(w, btnExact(ov, 'Запази')));
    await ticks(6);
    const p = calls.patch.find(x => x.table === 'contact_topics');
    ok('PATCH contact_topics?id=eq.t-3', !!p && /id=eq\.t-3/.test(p.url));
    ok('category + contact_id + updated_by', !!p && p.body.category === 'Централно снабдяване' && p.body.contact_id === 'd-2' && p.body.updated_by === 'Плами', p && JSON.stringify(p.body));
    ok('toast „Записано!"', calls.toast.some(t => /Записано/.test(t)));
    const plus = btn(doc.getElementById('ct-topics'), '+ Тема');
    guard('+ Тема', () => realClick(w, plus));
    const ov2 = doc.getElementById('ctt-ov');
    ok('празен модал', !!ov2 && doc.getElementById('ctt-topic').value === '' && !btnExact(ov2, 'Изтрий'));
    guard('Добави без текст', () => realClick(w, btnExact(ov2, 'Добави')));
    ok('блокирано без тема', calls.toast.some(t => /Въведи проблем/.test(t)) && !calls.post.some(x => x.table === 'contact_topics'));
    doc.getElementById('ctt-topic').value = 'Касов апарат';
    doc.getElementById('ctt-sort').value = '55';
    guard('Добави', () => realClick(w, btnExact(ov2, 'Добави')));
    await ticks(6);
    const po = calls.post.find(x => x.table === 'contact_topics');
    const b = po && (Array.isArray(po.body) ? po.body[0] : po.body);
    ok('POST: topic, sort_order 55, category null', !!b && b.topic === 'Касов апарат' && b.sort_order === 55 && b.category === null, b && JSON.stringify(b));
  }

  section('5. Търсене от банера: отдели + магазини + теми');
  {
    const { w, doc } = await env(ADMIN);
    const inp = doc.getElementById('contacts-search');
    search(w, doc, 'петрич');
    const ids = Array.from(grid(doc).querySelectorAll('.ct-row[data-id]')).map(r => r.getAttribute('data-id')).sort();
    ok('хората от Петрич (без реда на обекта)', JSON.stringify(ids) === '["s-1","s-2"]', JSON.stringify(ids));
    ok('полето е същият елемент', doc.getElementById('contacts-search') === inp);
    ok('таблото е скрито докато се търси', !grid(doc).querySelector('.ct-home'));
    search(w, doc, 'sap');
    ok('„sap" → темата', !!grid(doc).querySelector('.ct-trow[data-id="t-1"]'));
    search(w, doc, '0882 790');
    ok('търсене по телефон с нула намира 359882790094', !!grid(doc).querySelector('.ct-row[data-id="d-2"]'));
    const tel = grid(doc).querySelector('.ct-row[data-id="d-2"] a[href^="tel:"]');
    ok('359… → tel:0882790094', !!tel && tel.getAttribute('href') === 'tel:0882790094', tel && tel.getAttribute('href'));
    search(w, doc, '');
    ok('празно търсене → таблото пак', !!grid(doc).querySelector('.ct-home'));
  }

  section('6. Нуждаеш се от помощ');
  {
    const { doc } = await env(STORE);
    const help = grid(doc).querySelector('.ct-help');
    ok('блокът е там', !!help);
    const call = help && help.querySelector('a[href^="tel:"]');
    ok('„Свържи се с HR" → tel на HR', !!call && call.getAttribute('href') === 'tel:0888456789', call && call.getAttribute('href'));
    const m = help && help.querySelector('a[href^="mailto:"]');
    ok('„Изпрати запитване" → mailto HR', !!m && m.getAttribute('href') === 'mailto:hr@temax.bg');
  }

  section('7. ⭐ Често търсен в модала → PATCH featured');
  {
    const { w, doc, calls } = await env(ADMIN);
    w.openContactModal('d-2');
    const fe = doc.getElementById('ct-featured');
    ok('отметката я има и е празна', !!fe && !fe.checked);
    fe.checked = true;
    guard('Запази', () => realClick(w, btnExact(doc.getElementById('contact-ov'), 'Запази')));
    await ticks(6);
    const p = calls.patch.find(x => x.table === 'contacts');
    ok('PATCH featured: true', !!p && p.body.featured === true, p && JSON.stringify(p.body));
    w.openContactModal('d-1');
    ok('при d-1 отметката е сложена', doc.getElementById('ct-featured').checked === true);
    w.closeContactModal();
    w.setContactsTab('supplier');
    w.openContactModal('p-1');
    ok('доставчик: без отметка', !doc.getElementById('ct-featured'));
  }

  section('8. Провал на contact_topics не спира контактите, но не е тих');
  {
    const { doc, calls } = await env(ADMIN, { fail: { GET: /contact_topics/ } });
    ok('червен toast за грешката', calls.toast.some(t => /Грешка при зареждане/.test(t)), JSON.stringify(calls.toast));
    ok('плочките на отделите са там', grid(doc).querySelectorAll('.ct-tile').length > 0);
    ok('темите: „Няма въведени теми."', (doc.getElementById('ct-topics-list') || {}).textContent === 'Няма въведени теми.');
  }

  report();
})();
