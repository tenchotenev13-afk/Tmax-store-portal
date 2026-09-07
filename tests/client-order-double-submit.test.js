/* Двойно/тройно натискане на „✓ Запази заявката“ в Клиентски заявки.

   От 13.08.2026 в базата стоят десетки дублирани заявки — Петрич-0170/0171/0172,
   Петрич-0175/0176, 0178/0179, 0143/0144, Враца-0131/0132, Добрич-0053 два пъти.
   Записите са на 7 µs до 150 ms един от друг, тоест не са два отделни пъти,
   в които човек е попълвал модала: това е второ натискане на бутона, докато
   първият POST още пътува. Всяко натискане правеше нов uuid4() и нов ред,
   затова нито уникален индекс, нито дедупликация в базата биха ги хванали.

   Тестът кара РЕАЛНИЯ бутон да бъде натиснат два пъти подред, докато отговорът
   от сървъра още не е дошъл (Promise, разрешаван РЪЧНО от теста — не
   Promise.resolve, който би се уредил на първия tick и би скрил точно
   прозореца, който проверяваме).

   Пускане:
     node tests/client-order-double-submit.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const USER = {
  email: 'petrich@temax.bg', display_name: 'Магазин Петрич',
  role: 'store', store_name: 'Петрич'
};

function env() {
  const h = boot({
    /* notifications.js е тук, защото client-orders.js вика updateBadges()
       от него по пътя след записа. */
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: USER,
    data: { client_orders: [], transport_orders: [], stores: [] }
  });
  h.w.clientOrders = [];
  h.w.transportOrders = [];
  return h;
}

/* Попълва модала така, че ВСИЧКИ валидации в submitClientOrder да минат
   (име, телефон, поне един артикул с продукт, без платен транспорт). */
function fillModal(w, doc) {
  w.openClientModal();
  doc.getElementById('c-name').value = 'Иван Петров';
  doc.getElementById('c-phone').value = '0888111222';
  const row = doc.querySelector('#c-items .item-row');
  if (!row) throw new Error('няма ред за артикул в #c-items');
  row.querySelector('.item-product').value = 'ПАРКЕТ';
  row.querySelector('.item-qty').value = '5';
  return doc.getElementById('co-submit');
}

/* Подменя sbPostReturn с обещание, което тестът разрешава РЪЧНО. */
function deferPost(w) {
  const state = { n: 0, resolvers: [], bodies: [] };
  w.sbPostReturn = function (table, body) {
    state.n++;
    state.bodies.push({ table: table, body: body });
    return new Promise(function (res) { state.resolvers.push(res); });
  };
  return state;
}

(async function run() {

  section('1. Бутонът има id и модалът се попълва');
  {
    const { w, doc } = env();
    guard('попълване на модала', () => fillModal(w, doc));
    const b = doc.getElementById('co-submit');
    ok('бутонът „Запази заявката“ има id="co-submit"', !!b);
    ok('id-то е точно на бутона за подаване', !!b &&
      (b.getAttribute('onclick') || '').indexOf('submitClientOrder()') >= 0,
      b ? b.getAttribute('onclick') : 'няма бутон');
    ok('стартовият текст е „✓ Запази заявката“',
      !!b && b.textContent.trim() === '✓ Запази заявката',
      b ? JSON.stringify(b.textContent) : '');
  }

  section('2. Два клика подред при заявка в ход → ЕДИН POST');
  {
    const { w, doc } = env();
    const b = fillModal(w, doc);
    const post = deferPost(w);

    realClick(w, b, 'Запази заявката (1)');
    await ticks();

    ok('след първия клик бутонът е деактивиран', b.disabled === true);
    ok('текстът се сменя на „Записване...“', b.textContent === 'Записване...',
      JSON.stringify(b.textContent));
    ok('първият клик е направил точно 1 заявка', post.n === 1, 'n=' + post.n);

    /* Вторият клик — отговорът още НЕ е дошъл. Точно тук се раждаха
       Петрич-0171 и 0172. */
    realClick(w, b, 'Запази заявката (2)');
    await ticks();
    realClick(w, b, 'Запази заявката (3)');
    await ticks();

    ok('вторият и третият клик НЕ правят нова заявка', post.n === 1, 'n=' + post.n);
    ok('бутонът е още деактивиран, докато отговорът пътува', b.disabled === true);

    /* Отговорът пристига — успех */
    post.resolvers[0]({ ok: true, row: { in_num: 'Петрич-0180' } });
    await ticks(6);

    ok('след успешен отговор бутонът е активен пак', b.disabled === false);
    ok('текстът се връща в изходно състояние',
      b.textContent === '✓ Запази заявката', JSON.stringify(b.textContent));
    ok('модалът е затворен', !doc.getElementById('client-modal').classList.contains('open'));
    ok('общо остава 1 записана заявка', post.n === 1, 'n=' + post.n);
  }

  section('3. Грешка от сървъра → бутонът се връща и ретраят е разрешен');
  {
    const { w, doc } = env();
    const b = fillModal(w, doc);
    const post = deferPost(w);

    realClick(w, b, 'Запази заявката');
    await ticks();
    ok('заявката тръгва', post.n === 1, 'n=' + post.n);
    ok('бутонът е заключен', b.disabled === true);

    post.resolvers[0]({ ok: false, error: { message: 'boom' } });
    await ticks(6);

    ok('при грешка бутонът се отключва веднага', b.disabled === false);
    ok('и текстът се връща', b.textContent === '✓ Запази заявката',
      JSON.stringify(b.textContent));
    ok('модалът ОСТАВА отворен, за да не се загубят попълнените данни',
      doc.getElementById('client-modal').classList.contains('open'));

    /* Ретраят е целта на отключването — вторият клик ТРЯБВА да мине. */
    realClick(w, b, 'Запази заявката (ретрай)');
    await ticks();
    ok('вторият клик след грешка прави ВТОРА заявка', post.n === 2, 'n=' + post.n);
    ok('и пак заключва бутона', b.disabled === true);
  }

  section('4. Провалена валидация НЕ заключва бутона');
  {
    const { w, doc } = env();
    const b = fillModal(w, doc);
    const post = deferPost(w);

    /* Липсва задължителното име */
    doc.getElementById('c-name').value = '';
    realClick(w, b, 'Запази заявката (без име)');
    await ticks();

    ok('без име не се праща заявка', post.n === 0, 'n=' + post.n);
    ok('бутонът остава активен', b.disabled === false);
    ok('текстът е непроменен', b.textContent === '✓ Запази заявката',
      JSON.stringify(b.textContent));

    /* Липсва артикул */
    doc.getElementById('c-name').value = 'Иван Петров';
    doc.querySelector('#c-items .item-row .item-product').value = '';
    realClick(w, b, 'Запази заявката (без артикул)');
    await ticks();
    ok('без артикул също не се праща заявка', post.n === 0, 'n=' + post.n);
    ok('бутонът пак остава активен', b.disabled === false);

    /* След поправка записът минава — тоест заключването не е останало вдигнато */
    doc.querySelector('#c-items .item-row .item-product').value = 'ПАРКЕТ';
    realClick(w, b, 'Запази заявката (поправено)');
    await ticks();
    ok('след поправка записът тръгва', post.n === 1, 'n=' + post.n);
  }

  section('5. Флагът се сваля и за СЛЕДВАЩО отваряне на модала');
  {
    const { w, doc } = env();
    const b1 = fillModal(w, doc);
    const post = deferPost(w);

    realClick(w, b1, 'първа заявка');
    await ticks();
    post.resolvers[0]({ ok: true, row: { in_num: 'Петрич-0181' } });
    await ticks(6);

    /* Нов клиент, нов модал — бутонът трябва да е чист */
    const b2 = fillModal(w, doc);
    ok('при повторно отваряне бутонът е активен', b2.disabled === false);
    realClick(w, b2, 'втора заявка');
    await ticks();
    ok('втората заявка (истинска, не дубликат) минава', post.n === 2, 'n=' + post.n);
  }

  report();
})();
