/* Балончето "Разлики" не бива да пита сървъра, докато табът е скрит.

   Пулсът sdRefreshTabBadge() тече на всеки 60 сек във ВСЯКА отворена сесия -
   при ~36 постоянно отворени раздела това е ~36 заявки/минута към
   differences_reports, повечето от тях от минимизирани прозорци, които никой
   не гледа. Проверката тук заковава три неща:
     - при document.hidden === true не тръгва нито една заявка,
     - при видим таб заявката е същата както преди (нищо не е счупено),
     - връщането към видим таб опреснява веднага, а слушателят се закача
       точно веднъж, дори ако startSDBadgePolling() бъде извикан повторно.

   Пускане:  node tests/sd-badge-hidden-tab.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const REPORTS = [
  { id: 'rep-1', store_name: 'Шумен', counterpart: 'ТЕСИ ООД', reviewed: false },
  { id: 'rep-2', store_name: 'Шумен', counterpart: 'ТЕСИ ООД', reviewed: false }
];

const STORE_USER = {
  email: 'shumen@temax.bg', display_name: 'Шумен',
  role: 'store', store_name: 'Шумен'
};

function env(user) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: user || STORE_USER,
    data: { differences_reports: REPORTS, stock_differences: [], stock_returns: [] }
  });
  /* jsdom стартира с visibilityState 'prerender' (hidden === true), а истинският
     браузър дава 'visible'. Затова задаваме стойността явно и в двата случая -
     иначе тестът щеше да мери подразбирането на jsdom, не поведението. */
  setHidden(h, false);
  return h;
}

function setHidden(h, val) {
  Object.defineProperty(h.doc, 'hidden', { configurable: true, get: function () { return val; } });
  Object.defineProperty(h.doc, 'visibilityState', {
    configurable: true, get: function () { return val ? 'hidden' : 'visible'; }
  });
}

/* Заявките към differences_reports от пулса - другите GET-ове не ни интересуват. */
function badgeGets(h) {
  return h.calls.get.filter(function (u) {
    return u.indexOf('/differences_reports') >= 0 && u.indexOf('counterpart') >= 0;
  });
}

(async function () {

  /* ── 1. Скрит таб ───────────────────────────────────────────────────────── */
  section('1. Скрит таб не праща заявка');
  {
    const h = env();
    setHidden(h, true);
    h.calls.get.length = 0;

    guard('sdRefreshTabBadge() не хвърля при скрит таб', () => h.w.sdRefreshTabBadge());
    await ticks();

    ok('нула заявки към differences_reports', badgeGets(h).length === 0,
       'реално: ' + badgeGets(h).length + ' → ' + badgeGets(h).join(' | '));
    ok('нула заявки изобщо', h.calls.get.length === 0,
       'реално: ' + h.calls.get.join(' | '));

    /* Повторни тикове на интервала също мълчат - не е еднократно спиране. */
    h.w.sdRefreshTabBadge();
    h.w.sdRefreshTabBadge();
    await ticks();
    ok('три поредни тика при скрит таб = нула заявки', badgeGets(h).length === 0,
       'реално: ' + badgeGets(h).length);
    h.close();
  }

  /* ── 2. Видим таб ───────────────────────────────────────────────────────── */
  section('2. Видим таб праща заявката както преди');
  {
    const h = env();
    setHidden(h, false);
    h.calls.get.length = 0;

    guard('sdRefreshTabBadge() не хвърля при видим таб', () => h.w.sdRefreshTabBadge());
    await ticks();

    const gets = badgeGets(h);
    if (ok('точно една заявка към differences_reports', gets.length === 1,
           'реално: ' + gets.length + ' → ' + h.calls.get.join(' | '))) {
      const u = decodeURIComponent(gets[0]);
      ok('заявката е непроменена: reviewed=eq.false', u.indexOf('reviewed=eq.false') >= 0, u);
      ok('заявката е непроменена: select с counterpart',
         u.indexOf('select=id,store_name,counterpart,reviewed') >= 0, u);
      ok('заявката е непроменена: филтър по магазин',
         u.indexOf('store_name=eq.Шумен') >= 0, u);
    }
    h.close();
  }

  /* ── 3. Липсващ currentUser остава по-силният изход ─────────────────────── */
  section('3. Без currentUser - пак нула заявки, дори видим таб');
  {
    const h = env();
    setHidden(h, false);
    h.w.currentUser = null;
    h.calls.get.length = 0;

    guard('sdRefreshTabBadge() не хвърля без потребител', () => h.w.sdRefreshTabBadge());
    await ticks();
    ok('нула заявки', badgeGets(h).length === 0, 'реално: ' + badgeGets(h).length);
    h.close();
  }

  /* ── 4. visibilitychange ────────────────────────────────────────────────── */
  section('4. Връщане към видим таб опреснява веднага');
  {
    const h = env();
    setHidden(h, true);
    h.calls.get.length = 0;

    /* Стартът при скрит таб не праща нищо, но закача слушателя. */
    guard('startSDBadgePolling() не хвърля', () => h.w.startSDBadgePolling());
    await ticks();
    ok('стартът при скрит таб не праща заявка', badgeGets(h).length === 0,
       'реално: ' + badgeGets(h).length);

    /* Събитие, докато табът още е скрит - слушателят не бива да се подлъже. */
    h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
    await ticks();
    ok('visibilitychange при все още скрит таб не праща заявка',
       badgeGets(h).length === 0, 'реално: ' + badgeGets(h).length);

    setHidden(h, false);
    h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
    await ticks();
    ok('връщането към видим таб праща точно една заявка',
       badgeGets(h).length === 1, 'реално: ' + badgeGets(h).length);
    h.close();
  }

  /* ── 5. Слушателят се закача веднъж ─────────────────────────────────────── */
  section('5. Повторен startSDBadgePolling() не дублира слушателя');
  {
    const h = env();
    setHidden(h, true);

    h.w.startSDBadgePolling();
    h.w.startSDBadgePolling();   /* нов логин без презареждане на страницата */
    h.w.startSDBadgePolling();
    await ticks();

    setHidden(h, false);
    h.calls.get.length = 0;
    h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
    await ticks();

    ok('едно събитие = една заявка, не три', badgeGets(h).length === 1,
       'реално: ' + badgeGets(h).length + ' → ' + badgeGets(h).join(' | '));
    h.close();
  }

  report();
})();
