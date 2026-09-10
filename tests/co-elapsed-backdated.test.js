/* Клиентски заявки — броячът „Изминало" при заявка със ЗАДНА ДАТА.

   Поводът: на 09.09.2026 магазин Петрич въведе заявка с дата 06.09 и
   „Изминало" показа 0 дни, защото calcElapsed() смяташе от created_at
   (кога е НАТИСНАТ бутонът), а не от date (кога е ЗАЯВЕНО). Тоест
   закъснялото въвеждане нулираше ескалацията — точно заявките, за които
   броячът има смисъл, стартираха от нула.

   Какво заковава тестът:
     1. calcElapsed() тръгва от ПО-РАННАТА от created_at и date;
     2. границите: липсваща date, невалидна date, БЪДЕЩА date (броячът не
        бива да става отрицателен), липсващ created_at;
     3. извикването в loadClientOrders() наистина подава o.date — минава се
        през реалния load, не през преписан forEach в теста;
     4. таблицата показва ескалирания бадж, а не спокойните „0 дни";
     5. същата начална точка и в notifications.js — банерът и таблицата не
        бива да се разминават;
     6. submitClientOrder() пита с confirm() при задна дата и НЕ записва при
        отказ; при днешна дата не пита изобщо; задна дата не е забранена.

   Пускане:  node tests/co-elapsed-backdated.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btnExact, ok, guard, section, report,
        dayOffset, tsOffset, ticks } = H;

/* Потребител в обект, който е ИЗПЪЛНИТЕЛ по чужди заявки — само така
   _isFulfiller става true, а без него банерът в notifications.js мълчи. */
const USER = {
  email: 'co@temax.bg', display_name: 'Снабдяване ЦО',
  role: 'supply', store_name: 'Централен офис'
};

function order(over) {
  return Object.assign({
    id: 'x', in_num: 'Троян-0001', store_name: 'Троян', fulfiller: 'Централен офис',
    status: 'pending', hour: '10:00', bon: '',
    customer_name: 'Иван Петров', phone: '0888111222',
    product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.',
    items: [{ product: 'ПАРКЕТ', sap: '111', qty: 1, unit: 'бр.' }],
    delivery: null, note: '', co_eta: null, co_note: null,
    paid_transport: false, transport_id: null
  }, over);
}

/* Заявката е ВЪВЕДЕНА днес, но е от преди 6 дни — случаят на Петрич. */
const BACKDATED = order({
  id: 'co-back', in_num: 'Троян-0001',
  date: dayOffset(-6), created_at: tsOffset(0)
});
/* Въведена в деня, за който е — нищо не бива да се променя. */
const SAME_DAY = order({
  id: 'co-same', in_num: 'Троян-0002',
  date: dayOffset(-2), created_at: tsOffset(-2)
});
/* Без дата — старото поведение, брои се от created_at. */
const NO_DATE = order({
  id: 'co-nodate', in_num: 'Троян-0003',
  date: null, created_at: tsOffset(-8)
});

function env(over) {
  over = over || {};
  return boot(Object.assign({}, over, {
    /* transport.js — client-orders.js пипа transportOrders при платен
       транспорт; notifications.js — заради updateBadges() и банера. */
    modules: ['transport.js', 'client-orders.js', 'notifications.js'],
    user: USER,
    data: Object.assign({
      client_orders: [BACKDATED, SAME_DAY, NO_DATE],
      transport_orders: [], stores: [], users: [],
      order_restrictions: [], sap_catalog: [], kasa_reports: []
    }, over.data || {})
  }));
}

(async function run() {

  /* ══════════ 1. calcElapsed — чистата аритметика ══════════ */
  section('1. calcElapsed — началната точка е ПО-РАННАТА от created_at и date');
  {
    const { w } = env();
    const ce = w.calcElapsed;

    ok('date ПРЕДИ created_at → дните се броят от date',
      ce(tsOffset(0), dayOffset(-6)) === 6, String(ce(tsOffset(0), dayOffset(-6))));
    ok('без втория аргумент старият случай е непокътнат',
      ce(tsOffset(0)) === 0, String(ce(tsOffset(0))));

    ok('date == created_at (същият ден) → без промяна',
      ce(tsOffset(-2), dayOffset(-2)) === 2, String(ce(tsOffset(-2), dayOffset(-2))));
    ok('date == created_at дава същото като без date',
      ce(tsOffset(-2), dayOffset(-2)) === ce(tsOffset(-2)));

    ok('липсваща date (null) → като досега',
      ce(tsOffset(-8), null) === 8, String(ce(tsOffset(-8), null)));
    ok('липсваща date (undefined) → като досега',
      ce(tsOffset(-8), undefined) === 8);
    ok('празен низ за date → като досега',
      ce(tsOffset(-8), '') === 8);
    ok('невалидна date („не-дата") → като досега, а не NaN',
      ce(tsOffset(-8), 'не-дата') === 8, String(ce(tsOffset(-8), 'не-дата')));

    /* Границата, заради която се взима ПО-РАННАТА, а не просто date. */
    ok('БЪДЕЩА date не прави брояча отрицателен',
      ce(tsOffset(-3), dayOffset(5)) === 3, String(ce(tsOffset(-3), dayOffset(5))));
    ok('date СЛЕД created_at (но в миналото) не скъсява брояча',
      ce(tsOffset(-9), dayOffset(-2)) === 9, String(ce(tsOffset(-9), dayOffset(-2))));

    ok('липсващ created_at пак дава 0, дори с валидна date',
      ce(null, dayOffset(-6)) === 0, String(ce(null, dayOffset(-6))));
    ok('точно на границата: date вчера, въведена днес → 1 ден',
      ce(tsOffset(0), dayOffset(-1)) === 1, String(ce(tsOffset(0), dayOffset(-1))));
  }

  /* ══════════ 2. Реалният loadClientOrders() подава o.date ══════════ */
  section('2. loadClientOrders() — извикването наистина подава o.date');
  {
    const { w } = env();
    if (guard('loadClientOrders() не хвърля', () => w.loadClientOrders())) {
      await ticks();
      const byId = {};
      (w.clientOrders || []).forEach(o => { byId[o.id] = o; });
      if (ok('трите заявки са заредени', Object.keys(byId).length === 3,
             JSON.stringify(Object.keys(byId)))) {
        ok('заявката със задна дата е с _days=6, не 0',
          byId['co-back']._days === 6, String(byId['co-back']._days));
        ok('заявката, въведена в деня си, е с _days=2',
          byId['co-same']._days === 2, String(byId['co-same']._days));
        ok('заявката без date пак се брои от created_at (_days=8)',
          byId['co-nodate']._days === 8, String(byId['co-nodate']._days));
      }
    }
  }

  /* ══════════ 3. Таблицата показва ескалирания бадж ══════════ */
  section('3. Таблицата — баджът „Изминало" отразява задната дата');
  {
    const { w, doc } = env();
    if (guard('load + рендер не хвърлят', () => w.loadClientOrders())) {
      await ticks();
      guard('renderClientOrders() не хвърля', () => w.renderClientOrders());
      const row = doc.getElementById('co-row-co-back');
      if (ok('редът за заявката със задна дата съществува', !!row)) {
        ok('показва 6 дни, а не 0', row.textContent.indexOf('6 дни') >= 0,
          row.textContent.replace(/\s+/g, ' ').slice(0, 200));
        ok('баджът е предупредителен (⚠️ при 5–6 дни), не спокоен',
          row.innerHTML.indexOf('⚠️') >= 0);
      }
      /* Обратната посока: заявка без date не бива да „порасне". */
      const rowNo = doc.getElementById('co-row-co-nodate');
      ok('заявката без date показва 8 дни (непроменено)',
        !!rowNo && rowNo.textContent.indexOf('8 дни') >= 0);
    }
  }

  /* ══════════ 4. notifications.js — банерът гледа същата начална точка ══════════ */
  section('4. Банерът при вход — същата начална точка като таблицата');
  {
    /* Въведена ДНЕС, но заявена преди 9 дни: по стария код 0 дни → банерът
       мълчи, докато таблицата вече свети. Точно разминаването, което не бива
       да се случва. */
    const OLD = order({ id: 'co-old', in_num: 'Троян-0009',
      date: dayOffset(-9), created_at: tsOffset(0) });
    const { w, doc } = env({ data: { client_orders: [OLD] } });
    w.transportOrders = [];
    w.clientOrders = [OLD];
    w.clientOrders.forEach(o => {
      o._status = w.calcStatus(o.delivery, o.status);
      o._days = w.calcElapsed(o.created_at, o.date);
      o._isFulfiller = !w.isGlobal() &&
        o.fulfiller === w.currentUser.store_name &&
        o.store_name !== w.currentUser.store_name;
    });
    ok('заявката се води за изпълнение от този обект', w.clientOrders[0]._isFulfiller === true);
    if (guard('showLoginBanner() не хвърля', () => w.showLoginBanner())) {
      const banner = doc.getElementById('notif-banner');
      const html = banner ? banner.innerHTML : '';
      /* Маркерът НЕ бива да е „просрочен" — спокойната карта („Всичко е наред!
         Няма просрочени или спешни заявки.") съдържа същия корен и проверката
         би минавала и срещу непоправен код. Затова се търси заглавието на
         спешната карта И изрично се отрича спокойната. */
      ok('банерът вдига спешната карта (≥7 дни от датата на заявката)',
        html.indexOf('просрочена заявка!') >= 0,
        html.replace(/\s+/g, ' ').slice(0, 220));
      ok('и НЕ показва спокойната карта „Всичко е наред"',
        html.indexOf('Всичко е наред') < 0);
    }
  }

  /* ══════════ 5. submitClientOrder — предупреждение при задна дата ══════════
     Часовникът се ЗАДАВА, не се чака. Порталът има два различни часовника:
     today() е toISOString() (UTC), а TODAY е локална полунощ — между 00:00 и
     03:00 местно време (UTC+3) се разминават с един ден. c-date се попълва от
     today(), затова проверката трябва да сверява със today(); срещу TODAY
     всяка нова заявка, въведена нощем, получаваше предупреждението без никой
     да е въвеждал задна дата.

     Ако тестът разчиташе на реалния час, щеше да е зелен 21 часа в денонощието
     и червен три — тоест щеше да „минава" точно когато не трябва. Затова
     today() се подменя с фиксирана стойност и двата случая се задават изрично:
     часовник, който съвпада с локалния ден, и часовник с един ден назад
     (прозорецът 00:00–03:00). Очакваното поведение е ЕДНО И СЪЩО за двата. */
  section('5. Запис със задна дата — confirm() пита, отказът НЕ записва');

  const BACKDATE_MSG = 'Датата на заявката е преди днес';

  /* Ден ± n върху 'YYYY-MM-DD' през UTC — никаква локална зона не участва,
     затова помощникът дава същия резултат в който и да е час. */
  function shiftISO(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* Подменя today() ПРЕДИ openClientModal() — модалът попълва c-date с него. */
  function formWithClock(over, clock, dateVal) {
    const h = env(over);
    h.w.today = function () { return clock; };
    h.w.openClientModal();
    if (dateVal !== undefined) h.doc.getElementById('c-date').value = dateVal;
    h.doc.getElementById('c-name').value = 'Нов Клиент';
    h.doc.getElementById('c-phone').value = '0899123456';
    h.doc.querySelector('#c-items .item-product').value = 'ТЕСТ ПРОДУКТ';
    h.doc.querySelector('#c-items .item-qty').value = '1';
    return h;
  }
  function submit(h) {
    realClick(h.w, btnExact(h.doc.getElementById('client-modal'), '✓ Запази заявката'));
  }
  const asked = calls => calls.confirm.some(m => String(m).indexOf(BACKDATE_MSG) >= 0);
  const posted = calls => calls.post.some(p => /client_orders/.test(p.url));

  /* Двата часовника. „Нощният" е с един ден НАЗАД спрямо локалната дата —
     точно каквото връща toISOString() между 00:00 и 03:00 при UTC+3. */
  const CLOCKS = [
    { ime: 'часовник = локалният ден',               clock: dayOffset(0) },
    { ime: 'часовник с ден назад (00:00–03:00 UTC)', clock: dayOffset(-1) }
  ];

  for (const C of CLOCKS) {
    section('5. ' + C.ime + ' (today() = ' + C.clock + ')');

    {
      /* Датата, с която модалът САМ се попълва → НЕ пита. Тук беше регресията:
         срещу TODAY вторият часовник питаше на празно място. */
      const h = formWithClock({ confirm: false }, C.clock, undefined);
      ok('c-date е попълнена от today()',
        h.doc.getElementById('c-date').value === C.clock,
        h.doc.getElementById('c-date').value);
      submit(h);
      await ticks();
      ok('непипната дата → confirm() НЕ се вика', !asked(h.calls),
        JSON.stringify(h.calls.confirm));
      ok('и заявката се записва без питане', posted(h.calls));
    }
    {
      /* ден преди часовника → пита; при отказ нищо не се записва */
      const h = formWithClock({ confirm: false }, C.clock, shiftISO(C.clock, -1));
      submit(h);
      await ticks();
      ok('ден назад → confirm() се вика', asked(h.calls), JSON.stringify(h.calls.confirm));
      ok('при отказ НЯМА POST към client_orders', !posted(h.calls),
        JSON.stringify(h.calls.post.map(p => p.url)));
      ok('модалът остава отворен, за да може датата да се поправи',
        h.doc.getElementById('client-modal').classList.contains('open'));
    }
    {
      /* ден преди часовника + потвърждение → записва се; задната дата НЕ е забранена */
      const back = shiftISO(C.clock, -1);
      const h = formWithClock({ confirm: true }, C.clock, back);
      submit(h);
      await ticks();
      const post = h.calls.post.find(p => /client_orders/.test(p.url));
      ok('при потвърждение заявката се записва', !!post);
      ok('задната дата стига до базата непроменена', !!post && post.body.date === back,
        post && String(post.body.date));
    }
    {
      /* бъдеща дата → не пита (правилото е „преди днес", не „различна от днес") */
      const h = formWithClock({ confirm: false }, C.clock, shiftISO(C.clock, 3));
      submit(h);
      await ticks();
      ok('бъдеща дата → confirm() НЕ се вика', !asked(h.calls),
        JSON.stringify(h.calls.confirm));
    }
    {
      /* празна дата → не пита и не спира записа */
      const h = formWithClock({ confirm: false }, C.clock, '');
      submit(h);
      await ticks();
      ok('празна дата → confirm() НЕ се вика', !asked(h.calls),
        JSON.stringify(h.calls.confirm));
      ok('записът минава и без дата', posted(h.calls));
    }
    {
      /* невалидна стойност в полето → не пита и не гърми */
      const h = formWithClock({ confirm: false }, C.clock, 'не-дата');
      submit(h);
      await ticks();
      ok('невалидна дата → confirm() НЕ се вика', !asked(h.calls),
        JSON.stringify(h.calls.confirm));
    }
  }

  report();
})();
