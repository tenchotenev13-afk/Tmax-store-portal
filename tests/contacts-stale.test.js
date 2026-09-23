/* Седмично обновяване на „Контакти": маркер ⚠️, филтър „За проверка",
   „✓ Данните са верни", лента „Последно обновяване" на Начало.

   Правило: contact с updated_at по-стар от CT_STALE_DAYS (30) или без
   updated_at е „за проверка". Доставчиците не влизат. Всичко това е само
   за админ — не-админът не вижда нито маркер, нито чип, нито лента.
   „✓" праща PATCH само с updated_by: датата я слага тригерът в базата.

   Датите са спрямо днес (не твърди), за да не гние тестът.
   Пускане: node tests/contacts-stale.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, bubbleClick, btn, ok, guard, section, report, ticks } = H;
const ROOT = process.argv[2] || (__dirname + '/..');

const ago = d => new Date(Date.now() - d * 86400000).toISOString();
const CONTACTS = [
  { id: 'f-1', type: 'contact', name: 'Прясна Петрова', category: 'IT', role_title: 'IT', updated_at: ago(3), updated_by: 'Цветелина' },
  { id: 'o-1', type: 'contact', name: 'Стара Стоянова', category: 'IT', role_title: 'IT', updated_at: ago(45) },
  { id: 'n-1', type: 'contact', name: 'Без Дата', category: 'Счетоводство', role_title: 'Счетоводител' },
  { id: 'b-1', type: 'contact', name: 'Точно Тридесет', category: 'Счетоводство', updated_at: ago(30) },
  { id: 's-1', type: 'contact', name: 'Управител Петрич', category: 'Персонал магазини', store_name: 'Петрич',
    store_role: 'manager', updated_at: ago(60) },
  { id: 's-2', type: 'contact', name: 'Снабдител Петрич', category: 'Персонал магазини', store_name: 'Петрич',
    store_role: 'supplier', updated_at: ago(1), updated_by: 'Юлиана' },
  { id: 'p-1', type: 'supplier', name: 'Доставчик Стар', category: 'Гр. 101', updated_at: ago(400) }
];
const ADMIN = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'admin', store_name: 'Централен офис' };
const STORE = { email: 'troyan@temax.bg', display_name: 'Троян', role: 'manager', store_name: 'Троян' };

async function env(user, tab) {
  const h = boot({ repo: ROOT, modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
    user: user, data: { contacts: CONTACTS, contact_topics: [], stores: [] } });
  guard('loadContacts()', () => h.w.loadContacts());
  await ticks(6);
  if (tab) guard('таб ' + tab, () => h.w.setContactsTab(tab));
  return h;
}
const grid = doc => doc.getElementById('contacts-grid');
const ids = doc => Array.from(grid(doc).querySelectorAll('.ct-row[data-id]')).map(r => r.getAttribute('data-id')).sort();
const hasBadge = (doc, id) => !!grid(doc).querySelector('.ct-row[data-id="' + id + '"] .ct-stale');

(async function run() {

  section('1. Отдели (админ): маркер ⚠️ по правилото');
  {
    const { doc } = await env(ADMIN, 'contact');
    ok('45 дни → ⚠️', hasBadge(doc, 'o-1'));
    ok('без дата → ⚠️', hasBadge(doc, 'n-1'));
    ok('3 дни → без маркер', !hasBadge(doc, 'f-1'));
    ok('точно 30 дни → без маркер (граница: над 30)', !hasBadge(doc, 'b-1'));
    const t = grid(doc).querySelector('.ct-row[data-id="n-1"] .ct-stale');
    ok('title „Никога не е проверяван"', !!t && t.getAttribute('title') === 'Никога не е проверяван');
    const t2 = grid(doc).querySelector('.ct-row[data-id="o-1"] .ct-stale');
    ok('title „Непроверен от 45 дни"', !!t2 && t2.getAttribute('title') === 'Непроверен от 45 дни', t2 && t2.getAttribute('title'));
    const nm = grid(doc).querySelector('.ct-row[data-id="o-1"] .ct-nm');
    ok('името остава отделен елемент (без ⚠️ в текста)', !!nm && nm.textContent === 'Стара Стоянова');
    ok('✓ има само при непроверени', !!grid(doc).querySelector('.ct-row[data-id="o-1"] button[title="Данните са верни"]') &&
      !grid(doc).querySelector('.ct-row[data-id="f-1"] button[title="Данните са верни"]'));
  }

  section('2. Чип „За проверка" в Отдели');
  {
    const { w, doc } = await env(ADMIN, 'contact');
    const chip = doc.getElementById('ct-stale-chip');
    ok('чипът е там', !!chip);
    ok('брой 2 (o-1, n-1)', !!chip && /За проверка\s*2/.test(chip.textContent), chip && chip.textContent);
    guard('клик чип', () => realClick(w, chip));
    ok('само o-1, n-1', JSON.stringify(ids(doc)) === '["n-1","o-1"]', JSON.stringify(ids(doc)));
    ok('чипът е активен', doc.getElementById('ct-stale-chip').classList.contains('on'));
    const acc = doc.querySelector('#ct-filters button.ct-chip[data-cat="Счетоводство"]');
    guard('+ Счетоводство', () => realClick(w, acc));
    ok('комбинира се с отдела → n-1', JSON.stringify(ids(doc)) === '["n-1"]', JSON.stringify(ids(doc)));
    guard('изключи чипа', () => realClick(w, doc.getElementById('ct-stale-chip')));
    ok('Счетоводство, всички → b-1, n-1', JSON.stringify(ids(doc)) === '["b-1","n-1"]', JSON.stringify(ids(doc)));
  }

  section('3. Магазини: чипът брои само магазинния персонал');
  {
    const { w, doc } = await env(ADMIN, 'stores');
    const chip = doc.getElementById('ct-stale-chip');
    ok('брой 1 (s-1)', !!chip && /За проверка\s*1/.test(chip.textContent), chip && chip.textContent);
    guard('клик', () => realClick(w, chip));
    ok('само s-1', JSON.stringify(ids(doc)) === '["s-1"]', JSON.stringify(ids(doc)));
  }

  section('4. „✓" в реда → PATCH само updated_by, презареждане');
  {
    const { w, doc, calls } = await env(ADMIN, 'contact');
    const b = grid(doc).querySelector('.ct-row[data-id="o-1"] button[title="Данните са верни"]');
    const before = calls.get.length;
    const ran = guard('клик ✓', () => bubbleClick(w, b));
    await ticks(6);
    ok('детайлът НЕ се отваря от клика', !doc.getElementById('ctd-ov'));
    const p = calls.patch.find(x => x.table === 'contacts');
    ok('PATCH contacts?id=eq.o-1', !!p && /id=eq\.o-1/.test(p.url));
    ok('тялото е само {updated_by}', !!p && JSON.stringify(Object.keys(p.body)) === '["updated_by"]', p && JSON.stringify(p.body));
    ok('updated_by = Цветелина Тенева', !!p && p.body.updated_by === 'Цветелина Тенева');
    ok('toast „проверен"', calls.toast.some(t => /проверен/.test(t)), JSON.stringify(calls.toast));
    ok('списъкът се презарежда', calls.get.slice(before).some(u => /contacts/.test(u)));
  }

  section('5. „✓ Данните са верни" в детайла; провал не е тих');
  {
    const { w, doc, calls } = await env(ADMIN, 'contact');
    guard('отвори n-1', () => bubbleClick(w, grid(doc).querySelector('.ct-row[data-id="n-1"] .ct-nm')));
    const ov = doc.getElementById('ctd-ov');
    const b = btn(ov, 'Данните са верни');
    ok('бутонът е в детайла', !!b);
    guard('клик', () => realClick(w, b));
    await ticks(6);
    ok('PATCH id=eq.n-1', calls.patch.some(x => x.table === 'contacts' && /id=eq\.n-1/.test(x.url)));
    ok('детайлът се затваря', !doc.getElementById('ctd-ov'));
  }
  {
    const h = boot({ repo: ROOT, modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
      user: ADMIN, data: { contacts: CONTACTS, contact_topics: [], stores: [] }, fail: { PATCH: true } });
    guard('load', () => h.w.loadContacts()); await ticks(6);
    h.w.setContactsTab('contact');
    guard('✓ при провал', () => h.w.confirmContact('o-1')); await ticks(6);
    ok('червен toast „НЕ е отбелязано"', h.calls.toast.some(t => /НЕ е отбелязано/.test(t)), JSON.stringify(h.calls.toast));
    ok('без „проверен"', !h.calls.toast.some(t => /— проверен/.test(t)));
  }
  {
    const { w, doc } = await env(ADMIN, 'supplier');
    w.openContactModal; 
    guard('детайл доставчик', () => w.openContactDetail('p-1'));
    ok('доставчик: без „Данните са верни"', !btn(doc.getElementById('ctd-ov'), 'Данните са верни'));
    ok('доставчик: „Редактирай" остава', !!btn(doc.getElementById('ctd-ov'), 'Редактирай'));
  }

  section('6. Начало (админ): лента „Последно обновяване"');
  {
    const { w, doc } = await env(ADMIN);
    const u = doc.querySelector('.ct-upd');
    ok('лентата е там', !!u);
    ok('най-новата промяна: Юлиана (преди 1 ден)', !!u && u.textContent.indexOf('Юлиана') >= 0, u && u.textContent);
    ok('3 за проверка (o-1, n-1, s-1; без доставчика)', !!u && /3 за проверка/.test(u.textContent), u && u.textContent);
    const b = btn(u, 'за проверка');
    guard('клик', () => realClick(w, b));
    ok('→ Отдели с включен филтър', w.contactsTab === 'contact' && w.contactsStaleOnly === true);
    ok('чипът е активен', doc.getElementById('ct-stale-chip').classList.contains('on'));
  }

  section('7. Не-админ: нищо от това');
  {
    let e = await env(STORE);
    ok('няма лента', !e.doc.querySelector('.ct-upd'));
    e = await env(STORE, 'contact');
    ok('няма ⚠️', !grid(e.doc).querySelector('.ct-stale'));
    ok('няма чип', !e.doc.getElementById('ct-stale-chip'));
    ok('всички 4 реда', ids(e.doc).length === 4, ids(e.doc).length);
    guard('детайл', () => e.w.openContactDetail('o-1'));
    ok('няма „Данните са верни"', !btn(e.doc.getElementById('ctd-ov'), 'Данните са верни'));
  }

  section('8. Всичко проверено: чип с 0 остава, празен филтър казва „Всичко е проверено"');
  {
    const fresh = CONTACTS.map(c => Object.assign({}, c, { updated_at: ago(2), updated_by: 'Цветелина' }));
    const h = boot({ repo: ROOT, modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
      user: ADMIN, data: { contacts: fresh, contact_topics: [], stores: [] } });
    guard('load', () => h.w.loadContacts()); await ticks(6);
    const u = h.doc.querySelector('.ct-upd');
    ok('лента: „Всичко е проверено"', !!u && /Всичко е проверено/.test(u.textContent));
    h.w.setContactsTab('contact');
    const chip = h.doc.getElementById('ct-stale-chip');
    ok('чипът е там с 0', !!chip && /За проверка\s*0/.test(chip.textContent));
    guard('клик', () => realClick(h.w, chip));
    ok('„Всичко е проверено."', grid(h.doc).textContent.indexOf('Всичко е проверено') >= 0);
    ok('без „+ Добави" в празното', !btn(grid(h.doc), '+ Добави'));
  }

  report();
})();
