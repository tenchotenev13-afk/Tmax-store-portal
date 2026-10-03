/* Масово качване на снимки в Контакти (03.10.2026).

   Покрива:
   1. Права: admin, accounting и изброените в CT_EDITOR_EMAILS (Пламена
      Павлова, роля user) виждат „📷 Качи снимки"; обикновен user — не.
   2. Разпознаване по име на файл: точно / първо+последно име / само
      фамилия (за потвърждение) / латиница / нищо.
   3. Прегледът не записва нищо преди „Запиши".
   4. Две снимки за един човек → „Запиши" е блокиран, докато не се избере.
   5. Ръчен избор от падащото меню.
   6. Запис: POST в storage (bucket contacts, photos/<id>-…) + PATCH
      contacts.photo_url към публичния адрес + updated_by.
   7. Неуспехи НЕ са тихи: провален POST → червен ред, без PATCH; провален
      PATCH → червен ред „не е закачена"; крайният toast казва колко НЕ са.

   Пускане: node tests/contacts-photos.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, fire, btn, btnExact, ok, guard, section, report, ticks } = H;
const ROOT = process.argv[2] || (__dirname + '/..');

const CONTACTS = [
  { id: 'p-1', type: 'contact', name: 'Росица Билбилева', category: 'Персонал магазини', store_name: 'Габрово', store_role: 'manager' },
  { id: 'p-2', type: 'contact', name: 'Василка Шикова', category: 'Централно снабдяване' },
  { id: 'p-3', type: 'contact', name: 'Яна Георгиева Инджова', category: 'Отдел Реклама', photo_url: 'https://example.org/old.jpg' },
  { id: 'p-4', type: 'contact', name: 'Даяна Иванова', category: 'Отдел контролинг' },
  { id: 'p-5', type: 'contact', name: 'Теодора Иванова', category: 'Регионално ръководство' },
  { id: 'p-6', type: 'contact', name: 'Живко Янев', category: 'IT' },
  { id: 's-1', type: 'contact', name: 'Обект Габрово', category: 'Персонал магазини', store_name: 'Габрово', store_role: 'store' },
  { id: 'x-1', type: 'supplier', name: 'Доставчик Иванов', category: 'Гр. 101' }
];
const PLAMENA = { email: 'p.pavlova@temax.bg', display_name: 'Пламена Павлова', role: 'user', store_name: 'Централен офис' };
const OTHER = { email: 'someone@temax.bg', display_name: 'Друг', role: 'user', store_name: 'Централен офис' };
const ACC = { email: 'v.shikova@temax.bg', display_name: 'Василка Шикова', role: 'accounting', store_name: 'Централен офис' };

async function env(user, fail) {
  const h = boot({ repo: ROOT, modules: ['transport.js', 'client-orders.js', 'contacts.js', 'notifications.js'],
    user: user, data: { contacts: CONTACTS, contact_topics: [], stores: [] }, fail: fail });
  guard('loadContacts()', () => h.w.loadContacts());
  await ticks(6);
  return h;
}
function choose(w, names) {
  const files = names.map(n => new w.File(['x'], n, { type: 'image/jpeg' }));
  guard('избор на ' + names.length + ' файла', () => w.ctPhotoFilesChosen({ files: files }));
}
const rowOf = (doc, file) => Array.from(doc.querySelectorAll('#ctp-ov tr')).find(tr => tr.textContent.indexOf(file) >= 0);
const selOf = (doc, file) => { const r = rowOf(doc, file); return r && r.querySelector('select'); };
const storagePosts = calls => calls.post.filter(p => /storage\/v1\/object\/contacts\//.test(p.url));

(async function run() {

  section('1. Права');
  {
    for (const [u, should] of [[PLAMENA, true], [ACC, true], [OTHER, false]]) {
      const { w, doc } = await env(u);
      const mod = doc.getElementById('mod-contacts');
      ok(u.display_name + ': „📷 Качи снимки" ' + (should ? 'има' : 'няма'), !!btn(mod, 'Качи снимки') === should);
      ok(u.display_name + ': „+ Добави" ' + (should ? 'има' : 'няма'), !!btnExact(mod, '+ Добави') === should);
      ok(u.display_name + ': isAdminContacts()=' + should, w.isAdminContacts() === should);
    }
    const { w } = await env(Object.assign({}, PLAMENA, { email: 'P.Pavlova@Temax.bg' }));
    ok('имейлът се сравнява без значение от главни букви', w.isAdminContacts() === true);
  }

  section('2. Разпознаване по име на файла');
  {
    const { w, doc, calls } = await env(PLAMENA);
    choose(w, ['Росица Билбилева.jpg', 'rosica_bilbileva (1).JPG', 'Васка Шикова.jpg', 'Яна Инджова.png', 'Иванова.jpg', 'IMG_2041.jpg', 'Обект Габрово.jpg']);
    ok('прегледът е отворен', !!doc.getElementById('ctp-ov'));
    ok('нищо не е записано преди „Запиши"', storagePosts(calls).length === 0 && calls.patch.length === 0);
    const s = n => (selOf(doc, n) || {}).value;
    ok('„Росица Билбилева.jpg" → p-1', s('Росица Билбилева.jpg') === 'p-1');
    ok('латиница „rosica_bilbileva (1).JPG" → p-1', s('rosica_bilbileva (1).JPG') === 'p-1');
    ok('„Васка Шикова" → p-2 (само фамилия)', s('Васка Шикова.jpg') === 'p-2');
    ok('… и е отбелязано „провери"', rowOf(doc, 'Васка Шикова.jpg').textContent.indexOf('провери') >= 0);
    ok('„Яна Инджова" → p-3 (първо + последно име)', s('Яна Инджова.png') === 'p-3');
    ok('… „ще замени сегашната снимка"', rowOf(doc, 'Яна Инджова.png').textContent.indexOf('ще замени') >= 0);
    ok('„Иванова" (две Иванови) → не е избран', s('Иванова.jpg') === '');
    const ivOpts = Array.from(selOf(doc, 'Иванова.jpg').querySelectorAll('optgroup[label="Възможни"] option')).map(o => o.value).sort();
    ok('… но двете Иванови са предложени отгоре', JSON.stringify(ivOpts) === '["p-4","p-5"]', JSON.stringify(ivOpts));
    ok('„IMG_2041" → не е разпознат', s('IMG_2041.jpg') === '' && rowOf(doc, 'IMG_2041.jpg').textContent.indexOf('не е разпознат') >= 0);
    ok('общият телефон на обекта не е в списъка с хора', !Array.from(selOf(doc, 'IMG_2041.jpg').options).some(o => o.value === 's-1'));
    ok('доставчиците не са в списъка', !Array.from(selOf(doc, 'IMG_2041.jpg').options).some(o => o.value === 'x-1'));
  }

  section('3. Две снимки за един човек → блокирано; ръчен избор го оправя');
  {
    const { w, doc } = await env(PLAMENA);
    choose(w, ['Росица Билбилева.jpg', 'rosica_bilbileva (1).JPG']);
    const save = doc.getElementById('ctp-save');
    ok('„Запиши" е забранен', !!save && save.disabled);
    ok('съобщение „две снимки"', doc.getElementById('ctp-msg').textContent.indexOf('две снимки') >= 0);
    const sel = selOf(doc, 'rosica_bilbileva (1).JPG');
    sel.value = '';
    guard('пропусни втората', () => fire(w, sel, 'change'));
    ok('„Запиши" е разрешен', !doc.getElementById('ctp-save').disabled);
    ok('„1 за запис"', doc.getElementById('ctp-msg').textContent.indexOf('1 за запис') >= 0);
  }

  section('4. Запис: storage + PATCH photo_url, ръчно избран човек');
  {
    const { w, doc, calls } = await env(PLAMENA);
    choose(w, ['Росица Билбилева.jpg', 'IMG_2041.jpg', 'Иванова.jpg']);
    const sel = selOf(doc, 'IMG_2041.jpg');
    sel.value = 'p-6';
    guard('ръчно: IMG → Живко Янев', () => fire(w, sel, 'change'));
    guard('Запиши', () => realClick(w, doc.getElementById('ctp-save')));
    await ticks(30);
    const posts = storagePosts(calls);
    ok('2 качвания (Иванова е пропусната)', posts.length === 2, posts.map(p => p.url).join(' | '));
    ok('пътят е photos/p-1-….jpg', posts.some(p => /\/contacts\/photos\/p-1-\d+\.jpg$/.test(p.url)));
    ok('пътят е photos/p-6-….jpg', posts.some(p => /\/contacts\/photos\/p-6-\d+\.jpg$/.test(p.url)));
    const patches = calls.patch.filter(p => p.table === 'contacts');
    ok('2 PATCH-а към contacts', patches.length === 2, patches.length);
    const p1 = patches.find(p => /id=eq\.p-1/.test(p.url));
    ok('photo_url = публичният адрес', !!p1 && /\/storage\/v1\/object\/public\/contacts\/photos\/p-1-\d+\.jpg$/.test(p1.body.photo_url), p1 && p1.body.photo_url);
    ok('updated_by = Пламена Павлова', !!p1 && p1.body.updated_by === 'Пламена Павлова');
    ok('редовете са „записана"', (rowOf(doc, 'Росица Билбилева.jpg').textContent.indexOf('записана') >= 0));
    ok('toast „Записани 2"', calls.toast.some(t => /Записани 2/.test(t)), JSON.stringify(calls.toast));
    const before = calls.get.length;
    guard('Затвори', () => realClick(w, btnExact(doc.getElementById('ctp-ov'), 'Затвори')));
    await ticks(6);
    ok('прегледът е затворен', !doc.getElementById('ctp-ov'));
    ok('контактите се презареждат', calls.get.slice(before).some(u => /contacts/.test(u)));
  }

  section('5. Провалено качване → червен ред, без PATCH, не е тихо');
  {
    const { w, doc, calls } = await env(PLAMENA, { POST: /storage\/v1\/object\/contacts\/photos\/p-1-/ });
    choose(w, ['Росица Билбилева.jpg', 'Живко Янев.jpg']);
    guard('Запиши', () => realClick(w, doc.getElementById('ctp-save')));
    await ticks(30);
    const r1 = rowOf(doc, 'Росица Билбилева.jpg');
    ok('редът на Росица е с грешка', !!r1 && r1.textContent.indexOf('качването отказано') >= 0, r1 && r1.textContent);
    ok('няма PATCH за p-1', !calls.patch.some(p => /id=eq\.p-1/.test(p.url)));
    ok('Живко е записан въпреки това', calls.patch.some(p => /id=eq\.p-6/.test(p.url)));
    ok('toast „НЕ са записани 1"', calls.toast.some(t => /НЕ са записани 1/.test(t)), JSON.stringify(calls.toast));
    ok('съобщение долу: „с грешка: 1"', doc.getElementById('ctp-msg').textContent.indexOf('с грешка: 1') >= 0);
    guard('втори опит (само грешния)', () => realClick(w, doc.getElementById('ctp-save')));
    await ticks(30);
    ok('вторият опит НЕ качва отново Живко', storagePosts(calls).filter(p => /photos\/p-6-/.test(p.url)).length === 1);
  }

  section('6. Качено, но PATCH пада → „не е закачена"');
  {
    const { w, doc, calls } = await env(PLAMENA, { PATCH: true });
    choose(w, ['Живко Янев.jpg']);
    guard('Запиши', () => realClick(w, doc.getElementById('ctp-save')));
    await ticks(30);
    const r = rowOf(doc, 'Живко Янев.jpg');
    ok('редът казва „не е закачена към Живко Янев"', !!r && r.textContent.indexOf('не е закачена към Живко Янев') >= 0, r && r.textContent);
    ok('toast „НЕ са записани 1"', calls.toast.some(t => /НЕ са записани 1/.test(t)));
  }

  report();
})();
