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

  /* ══════════ 5. submitClientOrder — предупреждение при задна дата ══════════ */
  section('5. Запис със задна дата — confirm() пита, отказът НЕ записва');

  function fillForm(w, doc, dateVal) {
    w.openClientModal();
    doc.getElementById('c-name').value = 'Нов Клиент';
    doc.getElementById('c-phone').value = '0899123456';
    doc.querySelector('#c-items .item-product').value = 'ТЕСТ ПРОДУКТ';
    doc.querySelector('#c-items .item-qty').value = '1';
    doc.getElementById('c-date').value = dateVal;
  }
  const BACKDATE_MSG = 'Датата на заявката е преди днес';

  {
    /* 5а. вчера + отказ → нищо не се записва */
    const { w, doc, calls } = env({ confirm: false });
    fillForm(w, doc, dayOffset(-1));
    realClick(w, btnExact(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await ticks();
    ok('при дата вчера confirm() се вика',
      calls.confirm.some(m => String(m).indexOf(BACKDATE_MSG) >= 0),
      JSON.stringify(calls.confirm));
    ok('при отказ НЯМА POST към client_orders',
      !calls.post.some(p => /client_orders/.test(p.url)),
      JSON.stringify(calls.post.map(p => p.url)));
    ok('модалът остава отворен, за да може датата да се поправи',
      doc.getElementById('client-modal').classList.contains('open'));
  }
  {
    /* 5б. вчера + потвърждение → записва се, задната дата НЕ е забранена */
    const { w, doc, calls } = env({ confirm: true });
    const y = dayOffset(-1);
    fillForm(w, doc, y);
    realClick(w, btnExact(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await ticks();
    const post = calls.post.find(p => /client_orders/.test(p.url));
    ok('при потвърждение заявката се записва', !!post);
    ok('задната дата стига до базата непроменена', !!post && post.body.date === y,
      post && String(post.body.date));
  }
  {
    /* 5в. днес → не пита изобщо */
    const { w, doc, calls } = env({ confirm: false });
    fillForm(w, doc, w.today());
    realClick(w, btnExact(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await ticks();
    ok('при днешна дата confirm() за задна дата НЕ се вика',
      !calls.confirm.some(m => String(m).indexOf(BACKDATE_MSG) >= 0),
      JSON.stringify(calls.confirm));
    ok('и заявката се записва без питане',
      calls.post.some(p => /client_orders/.test(p.url)),
      JSON.stringify(calls.post.map(p => p.url)));
  }
  {
    /* 5г. БЪДЕЩА дата → също не пита (проверката е „преди днес", не „различна от днес") */
    const { w, doc, calls } = env({ confirm: false });
    fillForm(w, doc, dayOffset(3));
    realClick(w, btnExact(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await ticks();
    ok('при бъдеща дата confirm() за задна дата НЕ се вика',
      !calls.confirm.some(m => String(m).indexOf(BACKDATE_MSG) >= 0),
      JSON.stringify(calls.confirm));
  }
  {
    /* 5д. празна дата → не пита и не гърми */
    const { w, doc, calls } = env({ confirm: false });
    fillForm(w, doc, '');
    realClick(w, btnExact(doc.getElementById('client-modal'), '✓ Запази заявката'));
    await ticks();
    ok('при празна дата confirm() за задна дата НЕ се вика',
      !calls.confirm.some(m => String(m).indexOf(BACKDATE_MSG) >= 0),
      JSON.stringify(calls.confirm));
    ok('записът минава и без дата',
      calls.post.some(p => /client_orders/.test(p.url)));
  }

  report();
})();
