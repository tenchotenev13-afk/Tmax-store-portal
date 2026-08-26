/* Каса — статус „върнат за корекция" в kasa-docs.js.

   Три неща наведнъж, защото са едно и също поведение, видяно от два края:
   1. returnKasaForRevision() маркира и ТРИТЕ документа като 'returned'
      (не 'draft'), нулира ready_at/ready_by на ПОС отчетите и потвържденията
      на другите два — и НЕ подава confirmed_at към kasa_zoborot, която няма
      такава колона.
   2. Провали ли се един PATCH, потребителят вижда червен toast с кое точно
      не е минало, а не зелено „готово" върху три документа в разнобой.
   3. Дневният преглед разпознава върнатия ден — включително когато ready_at
      е останал попълнен от стар запис — и брои само магазините, които
      изобщо подават отчет (18 от 23 реда в stores).

   Пускане:
     node tests/kasa-return-status.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset, tsOffset, ticks } = H;

/* ── 1. Данни ─────────────────────────────────────────────────────────────── */

const D = dayOffset(-1);           /* вчера — стойността по подразбиране в прегледа */

const ACC_USER = {
  email: 'sch@temax.bg', display_name: 'Счетоводство',
  role: 'accounting', store_name: 'Централен офис'
};

/* Точно каквото връща stores днес: 23 имена, от които 5 не подават отчет. */
const NOT_REPORTABLE = ['Централен офис', 'Логистичен склад Добрич',
  'Логистичен склад Търговище', 'Пазарджик', 'Сервиз Троян'];
const REPORTABLE = ['Троян', 'Ловеч', 'Плевен', 'Русе', 'Варна', 'Бургас',
  'Стара Загора', 'Хасково', 'Ямбол', 'Сливен', 'Шумен', 'Добрич',
  'Търговище', 'Разград', 'Силистра', 'Габрово', 'Велико Търново',
  'Гоце Делчев'];
const ALL_STORE_ROWS = REPORTABLE.concat(NOT_REPORTABLE)
  .map(function (n) { return { name: n }; });

function reps(over) {
  over = over || {};
  return [
    Object.assign({
      id: 'r-1', store_name: 'Троян', date: D, pos_number: 1,
      status: 'confirmed', razlika: 0, ready_at: tsOffset(-1), ready_by: 'Касиер Троян'
    }, over),
    Object.assign({
      id: 'r-2', store_name: 'Троян', date: D, pos_number: 2,
      status: 'confirmed', razlika: -1.5, ready_at: tsOffset(-1), ready_by: 'Касиер Троян'
    }, over)
  ];
}

function env(over) {
  over = over || {};
  const h = boot(Object.assign({
    /* kasa.js е тук, защото returnKasaForRevision вика kasaSetDate() от него.
       Без него извикването мълчи зад typeof-проверката и тестът не вижда
       нищо — но и не доказва, че веригата в браузъра се затваря. */
    modules: ['kasa.js', 'kasa-docs.js'],
    user: ACC_USER,
    data: {}
  }, over));
  /* Контейнерът на дневния преглед се ражда в history.js; тук го подаваме
     наготово, за да не влачим целия модул. */
  h.doc.body.insertAdjacentHTML('beforeend', '<div id="daily-overview"></div>');
  return h;
}

/* Тялото на PATCH-а към дадена таблица (последният, ако са няколко). */
function patchTo(calls, table) {
  const hits = calls.patch.filter(function (p) { return p.table === table; });
  return hits.length ? hits[hits.length - 1].body : null;
}
/* Клетките на реда за даден магазин от таблицата „Статус по магазини". */
function rowFor(doc, name) {
  const rows = Array.prototype.slice.call(doc.querySelectorAll('#daily-overview tbody tr'));
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].cells;
    if (c.length && c[0].textContent.trim() === name) {
      return { tr: rows[i], pos: c[1].textContent, ravn: c[2].textContent, status: c[5].textContent };
    }
  }
  return null;
}

(async function run() {

  /* ── 2. returnKasaForRevision — тялото на трите PATCH-а ─────────────────── */
  section('1. Връщането маркира и трите документа като „returned"');
  {
    const h = env({ data: { kasa_reports: reps() } });
    const { w, calls } = h;

    if (guard('returnKasaForRevision() не хвърля', () =>
      w.returnKasaForRevision('Троян', D, 'Липсва бележка за сторното'))) {
      await ticks();

      const posPatches = calls.patch.filter(function (p) { return p.table === 'kasa_reports'; });
      if (ok('и двата ПОС отчета са PATCH-нати', posPatches.length === 2,
        'намерени: ' + posPatches.length)) {
        const b = posPatches[0].body;
        ok('ПОС: status = returned', b.status === 'returned', JSON.stringify(b.status));
        ok('ПОС: причината е записана', b.return_reason === 'Липсва бележка за сторното');
        ok('ПОС: кой е върнал', b.returned_by === 'Счетоводство');
        ok('ПОС: кога е върнат', typeof b.returned_at === 'string' && b.returned_at.length > 10);
        /* Същината на поправката: без това магазинът остава в „изпратили". */
        ok('ПОС: ready_at е нулиран', b.ready_at === null, JSON.stringify(b.ready_at));
        ok('ПОС: ready_by е нулиран', b.ready_by === null, JSON.stringify(b.ready_by));
      }

      const g = patchTo(calls, 'kasa_glavna');
      if (ok('Главна каса е PATCH-ната', !!g)) {
        ok('Главна каса: status = returned (не draft)', g.status === 'returned',
          JSON.stringify(g.status));
        ok('Главна каса: причината е записана', g.return_reason === 'Липсва бележка за сторното');
        ok('Главна каса: кой/кога', g.returned_by === 'Счетоводство' && !!g.returned_at);
        ok('Главна каса: confirmed_at е нулиран', g.confirmed_at === null);
        ok('Главна каса: confirmed_by е нулиран', g.confirmed_by === null);
      }

      const z = patchTo(calls, 'kasa_zoborot');
      if (ok('Равнение е PATCH-нато', !!z)) {
        ok('Равнение: status = returned (не draft)', z.status === 'returned',
          JSON.stringify(z.status));
        ok('Равнение: причината е записана', z.return_reason === 'Липсва бележка за сторното');
        ok('Равнение: кой/кога', z.returned_by === 'Счетоводство' && !!z.returned_at);
        ok('Равнение: confirmed_by е нулиран', z.confirmed_by === null);
        /* kasa_zoborot НЯМА колона confirmed_at — подаването ѝ дава 400 и
           цялото връщане пада. Проверява се наличието на КЛЮЧА, не
           стойността: confirmed_at:null също би стигнало до PostgREST. */
        ok('Равнение: confirmed_at НЕ се подава (такава колона няма)',
          Object.keys(z).indexOf('confirmed_at') < 0, JSON.stringify(Object.keys(z)));
      }

      const msg = calls.toast.join(' | ');
      ok('успешен toast при минали PATCH-ове', msg.indexOf('върнат за корекция') >= 0, msg);
      ok('няма съобщение за провал', msg.indexOf('НЕ мина докрай') < 0, msg);
    }
    h.close();
  }

  /* ── 3. Провалил се PATCH → червено, не зелено ──────────────────────────── */
  section('2. Провален PATCH не се маскира с успешен toast');
  {
    const h = env({
      data: { kasa_reports: reps() },
      fail: { PATCH: /kasa_zoborot/ }
    });
    const { w, calls } = h;

    if (guard('returnKasaForRevision() не хвърля при провал', () =>
      w.returnKasaForRevision('Троян', D, 'Причина'))) {
      await ticks();
      const msg = calls.toast.join(' | ');
      ok('има съобщение за провал', msg.indexOf('НЕ мина докрай') >= 0, msg);
      ok('казва КОЕ не е минало', msg.indexOf('Равнение') >= 0, msg);
      ok('НЯМА успешен toast', msg.indexOf('↩ Отчетът е върнат за корекция') < 0, msg);
    }
    h.close();
  }

  section('3. Провален PATCH точно по ПОС отчетите се вижда също');
  {
    const h = env({
      data: { kasa_reports: reps() },
      fail: { PATCH: /kasa_reports/ }
    });
    const { w, calls } = h;
    if (guard('не хвърля', () => w.returnKasaForRevision('Троян', D, 'Причина'))) {
      await ticks();
      const msg = calls.toast.join(' | ');
      ok('съобщението сочи ПОС отчет', msg.indexOf('ПОС отчет') >= 0, msg);
      ok('НЯМА успешен toast', msg.indexOf('↩ Отчетът е върнат за корекция') < 0, msg);
    }
    h.close();
  }

  /* ── 4. Дневен преглед — върнатият ден се вижда като върнат ─────────────── */
  section('4. Дневният преглед разпознава върнат ден въпреки попълнен ready_at');
  {
    /* Троян: върнат, но с ОСТАНАЛ ready_at (стар запис отпреди поправката).
       Ловеч: нормално изпратен — контролата, че „За проверка" не е счупено. */
    const R = [
      { id: 'r-1', store_name: 'Троян', date: D, status: 'returned', razlika: -1.5,
        ready_at: tsOffset(-1), ready_by: 'Касиер', return_reason: 'Липсва бележка' },
      { id: 'r-2', store_name: 'Ловеч', date: D, status: 'confirmed', razlika: 0,
        ready_at: tsOffset(-1), ready_by: 'Касиер' },
      { id: 'r-3', store_name: 'Плевен', date: D, status: 'draft', razlika: 0,
        ready_at: null, ready_by: null }
    ];
    const Z = [
      /* Равнението стои 'confirmed' от преди връщането — точно случаят, в
         който колоната показваше ✅ върху върнат ден. */
      { id: 'z-1', store_name: 'Троян', date: D, status: 'confirmed' },
      { id: 'z-2', store_name: 'Ловеч', date: D, status: 'confirmed' }
    ];
    const h = env({
      data: { kasa_reports: R, kasa_zoborot: Z, kasa_documents: [], stores: ALL_STORE_ROWS }
    });
    const { w, doc } = h;

    if (guard('loadDailyOverview() не хвърля', () => w.loadDailyOverview(D))) {
      await ticks();

      const troyan = rowFor(doc, 'Троян');
      if (ok('редът за Троян съществува', !!troyan)) {
        ok('Статус: „Върнат за корекция"', troyan.status.indexOf('Върнат за корекция') >= 0,
          troyan.status.trim());
        ok('Статус: „За проверка" НЕ се показва', troyan.status.indexOf('За проверка') < 0,
          troyan.status.trim());
        ok('ПОС: собствен знак за върнато (↩)', troyan.pos.indexOf('↩') >= 0, troyan.pos.trim());
        ok('ПОС: не показва ✅', troyan.pos.indexOf('✅') < 0, troyan.pos.trim());
        ok('Равнение: собствен знак за върнато (↩)', troyan.ravn.indexOf('↩') >= 0,
          troyan.ravn.trim());
        ok('Равнение: не показва ✅ върху върнат ден', troyan.ravn.indexOf('✅') < 0,
          troyan.ravn.trim());
        ok('червената гама е приложена', /#fee2e2|#991b1b/.test(troyan.tr.innerHTML));
      }

      const lovech = rowFor(doc, 'Ловеч');
      if (ok('редът за Ловеч съществува', !!lovech)) {
        ok('нормалният изпратен ден си остава „За проверка"',
          lovech.status.indexOf('За проверка') >= 0, lovech.status.trim());
        ok('Ловеч няма знак за върнато', lovech.status.indexOf('↩') < 0, lovech.status.trim());
        ok('Ловеч: ПОС е ✅', lovech.pos.indexOf('✅') >= 0, lovech.pos.trim());
      }

      const pleven = rowFor(doc, 'Плевен');
      if (ok('редът за Плевен съществува', !!pleven)) {
        ok('черновата си остава „В процес"', pleven.status.indexOf('В процес') >= 0,
          pleven.status.trim());
        ok('черновата не е върната', pleven.status.indexOf('↩') < 0, pleven.status.trim());
      }
    }
    h.close();
  }

  /* ── 5. Знаменателят: 23 имена от stores → 18 реда ──────────────────────── */
  section('5. Броят магазини минава през isReportableStore()');
  {
    const h = env({
      data: { kasa_reports: [], kasa_zoborot: [], kasa_documents: [], stores: ALL_STORE_ROWS }
    });
    const { w, doc } = h;

    ok('stores връща 23 имена', ALL_STORE_ROWS.length === 23, String(ALL_STORE_ROWS.length));

    if (guard('loadDailyOverview() не хвърля', () => w.loadDailyOverview(D))) {
      await ticks();
      const rows = doc.querySelectorAll('#daily-overview tbody tr');
      ok('в таблицата има 18 реда, не 23', rows.length === 18, 'намерени: ' + rows.length);

      NOT_REPORTABLE.forEach(function (n) {
        ok('няма ред за „' + n + '"', !rowFor(doc, n));
      });
      ok('редът за „Троян" го има', !!rowFor(doc, 'Троян'));

      const cards = doc.getElementById('daily-overview').textContent;
      ok('знаменателят на картата е 18', /0\s*\/\s*18/.test(cards.replace(/\s+/g, ' ')),
        cards.replace(/\s+/g, ' ').slice(0, 160));
      ok('знаменателят НЕ е 23', cards.indexOf('/ 23') < 0);
    }
    h.close();
  }

  report();
})();
