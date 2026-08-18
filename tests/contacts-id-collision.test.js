/* Тест за колизията на id между контактния и клиентския модал.

   БЪГЪТ: contacts.js рендираше своя модал вътре в #mod-contacts (index.html)
   с id="c-name" / id="c-phone" — същите id-та, които клиентският модал
   #client-modal вече ползва. #mod-contacts стои ПРЕДИ #client-modal в дървото,
   затова getElementById връщаше контактните полета. Резултат: след като
   потребителят веднъж отвореше таб Контакти, submitClientOrder() четеше празни
   име/телефон и винаги казваше "Попълни задължителните полета *".

   ПОПРАВКАТА: контактните полета са преименувани на ct-name / ct-phone.

   Ключово за самия тест: стойностите се задават през
   querySelector('#client-modal #c-name'), НЕ през getElementById — иначе тестът
   и бъгът биха ползвали един и същи (грешен) елемент и тестът щеше да мине
   зелен и със стария код.

   Пускане:
     node tests/contacts-id-collision.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, section, report, guard, ticks } = H;

const ROOT = process.argv[2] || (__dirname + '/..');

const USER = {
  email: 'admin@temax.bg', display_name: 'Админ Централа',
  role: 'admin', store_name: 'Централен офис'
};

/* Един контакт — колкото да има какво да се рендира в грида и с какво да се
   тества редакцията на съществуващ запис. */
const CONTACTS = [{
  id: 'ct-1', name: 'Мария Иванова', type: 'contact', role_title: 'Управител',
  category: 'IT', store_name: 'Троян', phone: '0888111222',
  email: 'mariya@temax.bg', notes: '', photo_url: null
}];

/* notifications.js е тук, защото client-orders.js вика updateBadges() след
   записа — без него в конзолата тихо стои ReferenceError. */
const h = boot({
  repo: ROOT,
  modules: ['client-orders.js', 'contacts.js', 'notifications.js'],
  user: USER,
  data: {
    contacts: CONTACTS,
    client_orders: [],
    transport_orders: [],
    stores: [{ id: 1, name: 'Троян' }, { id: 2, name: 'Габрово' }]
  }
});
const { w, doc, calls } = h;

/* Задава стойност на поле в рамките на конкретен контейнер и се проваля
   чисто, ако полето липсва — вместо да убие теста с TypeError и да не се
   стигне до report() (което run-all.js чете). */
function fill(root, sel, val) {
  const el = root && root.querySelector(sel);
  if (!ok('полето ' + sel + ' съществува', !!el)) return false;
  el.value = val;
  return true;
}

(async function () {

  /* ─────────────────────────────────────────────────────────────────────── */
  section('1. Контактният модал рендира ct-name / ct-phone');

  guard('loadContacts() не хвърля', () => w.loadContacts());
  await ticks();

  const mod = doc.getElementById('mod-contacts');
  ok('контактният модал е в дървото', !!(mod && mod.querySelector('#contact-ov')));
  ok('#ct-name съществува в #mod-contacts', !!mod.querySelector('#ct-name'));
  ok('#ct-phone съществува в #mod-contacts', !!mod.querySelector('#ct-phone'));
  ok('в #mod-contacts вече НЯМА #c-name', !mod.querySelector('#c-name'));
  ok('в #mod-contacts вече НЯМА #c-phone', !mod.querySelector('#c-phone'));

  /* Непокътнатите id-та — за да не се окаже, че преименуването е бръснало
     по-широко от двете полета. */
  ['c-role', 'c-cat', 'c-store', 'c-email', 'c-notes'].forEach(function (id) {
    ok('#' + id + ' е непокътнат', !!mod.querySelector('#' + id));
  });

  /* ─────────────────────────────────────────────────────────────────────── */
  section('2. getElementById вече сочи където трябва');

  const gName = doc.getElementById('c-name');
  const gPhone = doc.getElementById('c-phone');
  ok("getElementById('c-name') е в #client-modal",
     !!(gName && gName.closest('#client-modal')));
  ok("getElementById('c-phone') е в #client-modal",
     !!(gPhone && gPhone.closest('#client-modal')));
  ok("getElementById('ct-name') е в #mod-contacts",
     !!(doc.getElementById('ct-name') && doc.getElementById('ct-name').closest('#mod-contacts')));
  ok("getElementById('ct-phone') е в #mod-contacts",
     !!(doc.getElementById('ct-phone') && doc.getElementById('ct-phone').closest('#mod-contacts')));

  /* ─────────────────────────────────────────────────────────────────────── */
  section('3. Регресията: клиентска заявка СЛЕД отваряне на таб Контакти');

  /* Истински клик по "+ Добави" — така потребителят реално стига до модала. */
  guard('клик по "+ Добави" в Контакти', () => realClick(w, btnExact(mod, '+ Добави')));
  await ticks();
  ok('контактният модал е отворен', !!doc.querySelector('#contact-ov.open'));

  guard('openClientModal() не хвърля', () => w.openClientModal());
  await ticks();

  const cm = doc.getElementById('client-modal');
  ok('клиентският модал е отворен', cm.classList.contains('open'));

  /* ВАЖНО: querySelector в рамките на #client-modal, не getElementById. */
  fill(cm, '#c-name', 'Иван Петров Иванов');
  fill(cm, '#c-phone', '0888000111');
  const row = cm.querySelector('#c-items .item-row');
  if (ok('има ред за артикул', !!row)) {
    row.querySelector('.item-product').value = 'ПАРКЕТ ДЪБ';
    row.querySelector('.item-qty').value = '2';
  }

  const before = calls.post.length;
  guard('клик по "✓ Запази заявката"',
        () => realClick(w, btnExact(cm, '✓ Запази заявката')));
  await ticks();

  const blocked = calls.toast.filter(function (t) {
    return /задължителните полета/.test(String(t));
  });
  ok('НЯМА "Попълни задължителните полета *"', blocked.length === 0,
     JSON.stringify(calls.toast));

  const co = calls.post.slice(before).filter(function (p) { return p.table === 'client_orders'; });
  if (ok('заявката е записана (POST client_orders)', co.length > 0,
         'POST-ове: ' + JSON.stringify(calls.post.slice(before).map(function (p) { return p.table; })))) {
    const b = Array.isArray(co[0].body) ? co[0].body[0] : co[0].body;
    ok('името е стигнало до базата', b.customer_name === 'Иван Петров Иванов', String(b.customer_name));
    ok('телефонът е стигнал до базата', b.phone === '0888000111', String(b.phone));
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  section('4. Обратната посока: submitContact() чете от ct-name / ct-phone');

  guard('затваряне на клиентския модал', () => w.closeModal('client-modal'));
  guard('пре-отваряне на контактния модал (нов запис)', () => w.openContactModal(null));
  await ticks();

  const ov = doc.getElementById('contact-ov');
  fill(ov, '#ct-name', 'Петър Георгиев');
  fill(ov, '#ct-phone', '0899777666');
  fill(ov, '#c-role', 'Снабдител');
  fill(ov, '#c-email', 'petar@temax.bg');

  const before2 = calls.post.length;
  guard('клик по "Добави" в контактния модал',
        () => realClick(w, btnExact(ov, 'Добави')));
  await ticks();

  ok('НЯМА "Въведи име"',
     !calls.toast.some(function (t) { return /Въведи име/.test(String(t)); }),
     JSON.stringify(calls.toast));

  const cp = calls.post.slice(before2).filter(function (p) { return p.table === 'contacts'; });
  if (ok('контактът е записан (POST contacts)', cp.length > 0)) {
    const b = Array.isArray(cp[0].body) ? cp[0].body[0] : cp[0].body;
    ok('името е прочетено от #ct-name', b.name === 'Петър Георгиев', String(b.name));
    ok('телефонът е прочетен от #ct-phone', b.phone === '0899777666', String(b.phone));
    ok('останалите полета не са пострадали',
       b.role_title === 'Снабдител' && b.email === 'petar@temax.bg',
       JSON.stringify({ role_title: b.role_title, email: b.email }));
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  section('5. Редакция на съществуващ контакт — стойностите се пълнят в ct-*');

  guard('openContactModal(съществуващ)', () => w.openContactModal('ct-1'));
  await ticks();

  const ov2 = doc.getElementById('contact-ov');
  const nEl = ov2.querySelector('#ct-name');
  const pEl = ov2.querySelector('#ct-phone');
  if (ok('полетата съществуват при редакция', !!nEl && !!pEl)) {
    ok('името е предварително попълнено', nEl.value === 'Мария Иванова', nEl.value);
    ok('телефонът е предварително попълнен', pEl.value === '0888111222', pEl.value);
  }

  const before3 = calls.patch.length;
  guard('клик по "Запази" (редакция)', () => realClick(w, btnExact(ov2, 'Запази')));
  await ticks();

  const pt = calls.patch.slice(before3).filter(function (p) { return p.table === 'contacts'; });
  if (ok('редакцията е записана (PATCH contacts)', pt.length > 0)) {
    const b = Array.isArray(pt[0].body) ? pt[0].body[0] : pt[0].body;
    ok('PATCH-ът носи името от #ct-name', b.name === 'Мария Иванова', String(b.name));
    ok('PATCH-ът носи телефона от #ct-phone', b.phone === '0888111222', String(b.phone));
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  section('6. Празно име — валидацията пак работи през новото id');

  guard('пре-отваряне на модала (нов запис)', () => w.openContactModal(null));
  await ticks();
  const ov3 = doc.getElementById('contact-ov');
  fill(ov3, '#ct-name', '   ');

  const before4 = calls.post.length;
  guard('клик по "Добави" с празно име', () => realClick(w, btnExact(ov3, 'Добави')));
  await ticks();

  ok('показва "Въведи име"',
     calls.toast.some(function (t) { return /Въведи име/.test(String(t)); }),
     JSON.stringify(calls.toast));
  ok('НЕ праща заявка към базата',
     calls.post.slice(before4).filter(function (p) { return p.table === 'contacts'; }).length === 0);

  /* ─────────────────────────────────────────────────────────────────────── */
  section('7. Markup-ът вече не произвежда колизиращите id-та');

  let html;
  if (guard('contactModalHtml() не хвърля', () => { html = w.contactModalHtml(); })) {
    ok('няма id="c-name" в markup-а', html.indexOf('id="c-name"') < 0);
    ok('няма id="c-phone" в markup-а', html.indexOf('id="c-phone"') < 0);
    ok('има id="ct-name"', html.indexOf('id="ct-name"') >= 0);
    ok('има id="ct-phone"', html.indexOf('id="ct-phone"') >= 0);
    ok('id="contact-ov" е непокътнат', html.indexOf('id="contact-ov"') >= 0);
  }

  report();
})();
