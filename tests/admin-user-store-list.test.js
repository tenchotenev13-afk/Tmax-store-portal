/* Администрация → колега: списъкът с обекти и запазването на store_name.

   Какво заковава файлът:
   1. ОБЕКТИТЕ ИДВАТ ОТ ТАБЛИЦА stores (loadAllStores), не от ръчен масив —
      затова „Сервиз Троян" и „Пазарджик" са избираеми. „Централен офис" е
      първи, останалите по азбучен ред.
   2. РЕДАКЦИЯ НА КОЛЕГА ОТ „Сервиз Троян" — опцията е избрана.
   3. НЕПОЗНАТ ОБЕКТ (store_name, който го няма в stores) — показва се като
      избрана опция и „Запази" без промяна праща СЪЩИЯ store_name. Досега
      <select> показваше първата опция и колегата тихо отиваше в ЦО.
   4. stores не се зареди → резервата пак има „Сервиз Троян".
   5. Нов колега — модалът е наличен веднага (синхронно), по подразбиране ЦО.

   Пускане:  node tests/admin-user-store-list.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, btn } = H;

const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Враца', 'Централен офис', 'Логистичен склад Добрич', 'Пазарджик', 'Сервиз Троян', 'Троян', 'Шумен']
  .map(function (n) { return { name: n }; });

function env(user, opts) {
  opts = opts || {};
  return boot({
    modules: ['admin.js'],
    user: ADMIN,
    data: { users: user ? [user] : [], stores: opts.noStores ? [] : STORES },
    fail: opts.fail
  });
}
const sel = function (h) { return h.doc.getElementById('um-store'); };
const opts = function (h) { return Array.prototype.slice.call(sel(h).options).map(function (o) { return o.value; }); };
const patches = function (h) { return h.calls.patch.filter(function (p) { return p.table === 'users'; }); };

(async function () {

  section('1–2. Колега от „Сервиз Троян": обектите са от stores, опцията е избрана');
  {
    const h = env({ id: 'u-1', email: 'service.troyan@temax.bg', display_name: 'Сервиз Троян', store_name: 'Сервиз Троян', role: 'user', active: true });
    h.w.openUserModal('u-1'); await ticks();
    ok('модалът е отворен', !!sel(h));
    ok('„Сервиз Троян" е избран', sel(h).value === 'Сервиз Троян', sel(h).value);
    const o = opts(h);
    ok('списъкът е от stores (има „Пазарджик")', o.indexOf('Пазарджик') >= 0, o.join(','));
    ok('„Централен офис" е първи, останалите по азбучен ред',
       o[0] === 'Централен офис' && o.slice(1).join(',') === ['Враца', 'Логистичен склад Добрич', 'Пазарджик', 'Сервиз Троян', 'Троян', 'Шумен'].join(','), o.join(','));
    ok('без дубликати', o.length === 7, String(o.length));
    realClick(h.w, btn(h.doc.getElementById('user-modal-ov'), 'Запази')); await ticks();
    const p = patches(h)[0];
    ok('„Запази" без промяна праща store_name „Сервиз Троян"', p && p.body.store_name === 'Сервиз Троян', JSON.stringify(p && p.body));
    h.close();
  }

  section('3. Непознат обект: пази се при запис');
  {
    const h = env({ id: 'u-2', email: 'x@temax.bg', display_name: 'Х', store_name: 'Стар обект', role: 'manager', active: true });
    h.w.openUserModal('u-2'); await ticks();
    ok('непознатият обект е опция и е избран', sel(h).value === 'Стар обект', sel(h).value);
    ok('появява се веднъж, в края', opts(h).filter(function (s) { return s === 'Стар обект'; }).length === 1 && opts(h)[opts(h).length - 1] === 'Стар обект');
    realClick(h.w, btn(h.doc.getElementById('user-modal-ov'), 'Запази')); await ticks();
    const p = patches(h)[0];
    ok('тялото носи СЪЩИЯ store_name, не „Централен офис"', p && p.body.store_name === 'Стар обект', JSON.stringify(p && p.body));
    h.close();
  }

  section('4. stores не се зареди → резервата');
  {
    const h = env({ id: 'u-3', email: 'y@temax.bg', display_name: 'У', store_name: 'Троян', role: 'manager', active: true }, { noStores: true });
    h.w.openUserModal('u-3'); await ticks();
    ok('резервата има „Сервиз Троян" и „Пазарджик"', opts(h).indexOf('Сервиз Троян') >= 0 && opts(h).indexOf('Пазарджик') >= 0, opts(h).join(','));
    ok('„Троян" остава избран', sel(h).value === 'Троян');
    h.close();
  }

  section('5. Нов колега: модалът е наличен веднага, по подразбиране ЦО');
  {
    const h = env(null);
    h.w.openUserModal(null);
    ok('полето за обект е там синхронно', !!sel(h));
    await ticks();
    ok('след зареждане на stores — „Сервиз Троян" е в списъка', opts(h).indexOf('Сервиз Троян') >= 0, opts(h).join(','));
    ok('по подразбиране е „Централен офис"', sel(h).value === 'Централен офис', sel(h).value);
    /* Избор, направен ПРЕДИ stores да дойде, не се губи при допълването. */
    const h2 = env(null);
    h2.w.openUserModal(null);
    sel(h2).value = 'Троян';
    await ticks();
    ok('изборът преди зареждането се пази', sel(h2).value === 'Троян', sel(h2).value);
    h.close(); h2.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
