/* Детайл на контакт при клик върху картичката (#ctd-ov).

   Тук bubbling-ът е същността („Редактирай" НЕ трябва да отваря детайла),
   затова кликовете минават през bubbleClick() от harness-а: от елемента
   нагоре по родителите, стоп при event.stopPropagation() — както браузърът.

   Всички проверки са с null-защита: срещу стария код тестът дава ЧИСТ
   доклад с ❌, не хвърлена грешка.

   Пускане: node tests/contact-detail.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, bubbleClick, btn, ok, guard, section, report, ticks } = H;

const LONG = 'Отговаря за доставките към всички обекти в Северна България. ' +
  'Звъни се само в работно време.\nПри спешност — на втория номер.\nКРАЙ-НА-БЕЛЕЖКАТА';

const CONTACTS = [
  { id: 'c-1', type: 'contact', name: 'Мария Иванова', role_title: 'Управител', phone: '0888 123 456',
    email: 'maria@temax.bg', notes: LONG, category: 'Централно снабдяване', store_name: 'Кърджали',
    address: 'гр. Кърджали, бул. България 1', photo_url: null, active: true, store_visible: true },
  { id: 's-1', type: 'supplier', name: 'Дървопласт ООД', role_title: 'Търговски представител',
    phone: '02/987 65 43', email: 'office@darvoplast.bg', notes: 'Минимална поръчка 500 лв. ' + LONG,
    category: 'Материали', store_name: '', address: '', photo_url: 'https://example.org/p.jpg',
    active: true, store_visible: false }
];

const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'troyan@temax.bg', display_name: 'Управител Троян', role: 'manager', store_name: 'Троян' };

async function env(user, tab) {
  const h = boot({
    modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
    user: user,
    data: { contacts: CONTACTS, stores: [] }
  });
  const w = h.w;
  const live = new Set();
  const add = w.document.addEventListener.bind(w.document);
  const rem = w.document.removeEventListener.bind(w.document);
  w.document.addEventListener = (t, fn, o) => { if (t === 'keydown') live.add(fn); return add(t, fn, o); };
  w.document.removeEventListener = (t, fn, o) => { if (t === 'keydown') live.delete(fn); return rem(t, fn, o); };
  h.keydownCount = () => live.size;
  guard('loadContacts()', () => w.loadContacts());
  await ticks();
  /* От v4 модулът се отваря на „Начало"; картичките/редовете, които този
     тест проверява, са в табовете Отдели и Доставчици — затова табът се
     избира винаги. */
  tab = tab || 'contact';
  guard('setContactsTab(' + tab + ')', () => w.setContactsTab(tab));
  return h;
}

const guardedBubble = (w, el, label) => guard(label, () => bubbleClick(w, el));

const card = (doc, id) => doc.querySelector('#contacts-grid [data-id="' + id + '"][onclick*="openContactDetail"]');
/* Името вътре в картичката — кликва се по него, не по самия div */
const nameIn = (doc, id, name) => {
  const c = doc.querySelector('#contacts-grid [data-id="' + id + '"]');
  const root = c && (c.closest('[onclick*="openContactDetail"]') || c);
  return root ? Array.prototype.filter.call(root.querySelectorAll('div'),
    d => d.children.length === 0 && d.textContent === name)[0] || null : null;
};
const escKey = w => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const onlyButtons = (root, text) => root ? Array.prototype.filter.call(root.querySelectorAll('button'),
  b => b.textContent.indexOf(text) >= 0) : [];

(async function run() {

  for (const [tab, id, name, extra] of [
    ['contact', 'c-1', 'Мария Иванова', ['Централно снабдяване', 'Кърджали', 'бул. България 1']],
    ['supplier', 's-1', 'Дървопласт ООД', ['Материали', '🏭 Доставчик']]
  ]) {
    section('Таб „' + tab + '": клик по картичката → #ctd-ov с пълните бележки');
    {
      const { w, doc, keydownCount } = await env(ADMIN, tab === 'supplier' ? 'supplier' : null);
      const cd = card(doc, id);
      ok('картичката е кликаема (onclick → openContactDetail)', !!cd);
      ok('cursor:pointer + title „Отвори контакта"',
        !!cd && /cursor:pointer/.test(cd.getAttribute('style') || '') && cd.getAttribute('title') === 'Отвори контакта');
      const nm = nameIn(doc, id, name);
      ok('името е в картичката', !!nm);
      const before = keydownCount();
      if (nm) guardedBubble(w, nm, 'клик по името (bubbling до картичката)');
      const ov = doc.getElementById('ctd-ov');
      ok('#ctd-ov се отваря', !!ov);
      const t = ov ? ov.textContent : '';
      ok('името', t.indexOf(name) >= 0);
      ok('бележките са ЦЕЛИ — краят „КРАЙ-НА-БЕЛЕЖКАТА" е там (над 80 знака)', t.indexOf('КРАЙ-НА-БЕЛЕЖКАТА') >= 0);
      ok('няма „..." от отрязването', !/\.\.\.$/.test((ov && ov.querySelector('[style*="pre-wrap"]') || {}).textContent || ''));
      const pre = ov && Array.prototype.filter.call(ov.querySelectorAll('div'),
        d => /white-space:pre-wrap/.test(d.getAttribute('style') || '') && d.textContent.indexOf('КРАЙ-НА-БЕЛЕЖКАТА') >= 0)[0];
      ok('бележките са в white-space:pre-wrap', !!pre);
      extra.forEach(s => ok('поле, което картичката не показва: ' + s, t.indexOf(s) >= 0));
      const tel = ov && ov.querySelector('a[href^="tel:"]');
      ok('телефонът е tel: линк', !!tel);
      const mail = ov && ov.querySelector('a[href^="mailto:"]');
      ok('имейлът е mailto: линк', !!mail);
      ok('един нов keydown listener', keydownCount() === before + 1, keydownCount() - before);
      guard('Escape', () => escKey(w));
      ok('Escape затваря', !doc.getElementById('ctd-ov'));
      ok('Escape маха listener-а', keydownCount() === before, keydownCount() - before);
      ok('втори Escape не хвърля', guard('втори Escape', () => escKey(w)));
    }

    section('Таб „' + tab + '": „Редактирай" / „✕" / телефон на картичката НЕ отварят детайла');
    {
      const { w, doc } = await env(ADMIN, tab === 'supplier' ? 'supplier' : null);
      const cd = card(doc, id);
      /* Доставчиците са картички с „✏️ Редактирай"; в списъка на Отдели
         бутонът е само ✏️ с title — търси се и по двете. */
      const edit = cd && (btn(cd, 'Редактирай') || cd.querySelector('button[title="Редактирай"]'));
      ok('„Редактирай" е на картичката', !!edit);
      const opened = [];
      w.openContactModal = x => opened.push(x);
      w.doDeleteContact = () => {};
      if (edit) {
        const ran = bubbleClick(w, edit);
        ok('bubbling-ът спира на бутона (1 onclick)', ran.length === 1, JSON.stringify(ran));
      }
      ok('openContactModal е извикана', JSON.stringify(opened) === JSON.stringify([id]), JSON.stringify(opened));
      ok('детайлът НЕ е отворен', !doc.getElementById('ctd-ov'));
      const del = cd && onlyButtons(cd, '✕')[0];
      if (del) bubbleClick(w, del);
      ok('„✕" също не отваря детайла', !!del && !doc.getElementById('ctd-ov'));
      const tel = cd && cd.querySelector('a[href^="tel:"]');
      if (tel) bubbleClick(w, tel);
      ok('кликът по телефона не отваря детайла', !!tel && !doc.getElementById('ctd-ov'));
    }

    section('Таб „' + tab + '": админ има „✏️ Редактирай" в детайла → openContactModal');
    {
      const { w, doc } = await env(ADMIN, tab === 'supplier' ? 'supplier' : null);
      const nm = nameIn(doc, id, name);
      if (nm) guardedBubble(w, nm, 'отваряне');
      const ov = doc.getElementById('ctd-ov');
      const b = onlyButtons(ov, 'Редактирай');
      ok('точно един <button> „✏️ Редактирай"', b.length === 1, b.length);
      const opened = [];
      w.openContactModal = x => opened.push(x);
      if (b[0]) guardedBubble(w, b[0], 'клик „Редактирай" в детайла');
      ok('openContactModal(' + id + ')', JSON.stringify(opened) === JSON.stringify([id]), JSON.stringify(opened));
      ok('детайлът се затваря', !doc.getElementById('ctd-ov'));
    }

    section('Таб „' + tab + '": не-админ — няма <button> „Редактирай"');
    {
      const { w, doc } = await env(STORE, tab === 'supplier' ? 'supplier' : null);
      const nm = nameIn(doc, id, name);
      if (nm) guardedBubble(w, nm, 'отваряне');
      const ov = doc.getElementById('ctd-ov');
      ok('детайлът се отваря и за не-админ', !!ov);
      ok('няма <button> „Редактирай"', !!ov && onlyButtons(ov, 'Редактирай').length === 0);
      ok('има „Затвори"', !!ov && onlyButtons(ov, 'Затвори').length === 1);
    }
  }

  section('Детайлът не се бие с trd-ov за Escape');
  {
    const { w, doc } = await env(ADMIN);
    const nm = nameIn(doc, 'c-1', 'Мария Иванова');
    if (nm) guardedBubble(w, nm, 'отваряне');
    doc.body.insertAdjacentHTML('beforeend', '<div id="trd-ov"></div>');
    guard('Escape', () => escKey(w));
    ok('при отворен trd-ov Escape не затваря контакта', !!doc.getElementById('ctd-ov'));
    doc.getElementById('trd-ov').remove();
    guard('Escape 2', () => escKey(w));
    ok('без trd-ov — затваря', !doc.getElementById('ctd-ov'));
  }

  report();
})();
