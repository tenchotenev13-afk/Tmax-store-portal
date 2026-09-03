/* Известие в портала при нов ИЗПРАТЕН товарен лист за обекта.

   Досега складът пускаше лист и обектът разбираше само ако сам отвореше таба.
   Сега пулсът го хваща (звук + toast), а при вход излиза карта в банера.

   ЗАЩО ВОДЕН ЗНАК ПО ВРЕМЕ, А НЕ МНОЖЕСТВО ОТ id-та
   Листите се четат с limit=20. Множество от id-та би „забравило" лист,
   изпаднал от прозореца, и би го обявил за нов при следващото му появяване.
   Оттам и най-важната проверка тук (сценарий „г"): празен резултат — мрежов
   срив — НЕ бива да мести водния знак, иначе следващият успешен цикъл обявява
   всички стари листи за нови и обектът чува звънец за нищо.

   Пускане:  node tests/loading-lists-notify.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, ticks } = H;

const WH = 'Логистичен склад Търговище';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };
const ADMIN = { email: 'admin@temax.bg', display_name: 'Админ',
                role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
const WAREHOUSE = { email: 'sklad.tg@temax.bg', display_name: 'Склад Търговище',
                    role: 'sklad', store_name: WH, assigned_stores: [] };

const L1 = { id: 'L1', warehouse: WH, sent_at: '2026-09-02T07:00:00.000Z' };
const L2 = { id: 'L2', warehouse: 'Логистичен склад Добрич', sent_at: '2026-09-03T07:00:00.000Z' };
const L3 = { id: 'L3', warehouse: WH, sent_at: '2026-09-04T07:00:00.000Z' };

/* `lists` и `items` са ФУНКЦИИ на текущото състояние, за да може един тест да
   смени отговора между два цикъла на пулса. */
function env(user, state) {
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js', 'notifications.js'],
    user: user, confirm: true,
    data: {
      loading_lists: function (url) {
        const rows = state.lists();
        /* Гейтът, който сценарий „е" пази: черновите не се броят. */
        return /status=eq\.sent/.test(url) ? rows.filter(r => r.status !== 'draft') : rows;
      },
      loading_list_items: () => state.items(),
      transport_orders: [], client_orders: [], users: [], stores: [], contacts: [],
      kasa_reports: [], kasa_storno: [], bulletin_tasks: [], recurring_tasks: [],
      task_completions: [], stock_differences: [], differences_reports: [],
      stock_returns: [], goods_transit: []
    }
  });
  h.w.transportOrders = []; h.w.clientOrders = [];
  h.sounds = 0;
  h.w.playSound = function () { h.sounds++; };
  return h;
}
/* Ред от loading_list_items — за обекта и НЕполучен, освен ако не е казано друго. */
const row = (list_id, o) => Object.assign({ list_id: list_id, store_name: 'Петрич', received: false }, o);

(async function () {

  section('а) Първо извикване — тихо, водният знак застава на най-новия лист');
  {
    const st = { lists: () => [L1, L2], items: () => [row('L1'), row('L2')] };
    const h = env(STORE, st);
    ok('водният знак тръгва празен', h.w._llWatermark === null, String(h.w._llWatermark));

    h.w.checkNewLoadingLists();
    await ticks();

    ok('нула звуци', h.sounds === 0, String(h.sounds));
    ok('нула toast-ове', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));
    ok('водният знак е max(sent_at)', h.w._llWatermark === L2.sent_at, String(h.w._llWatermark));
  }

  section('а2) Обект БЕЗ нито един лист — баселайнът пак се слага');
  {
    /* Оставането на null тук значеше, че всеки следващ цикъл е базов и обектът
       НИКОГА не чува първия си товарен лист. */
    const st = { lists: () => [], items: () => [] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    const mark = h.w._llWatermark;
    ok('водният знак НЕ е null', mark !== null, String(mark));
    ok('и е ISO низ', typeof mark === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(mark), String(mark));
    ok('без звук', h.sounds === 0, String(h.sounds));
    ok('без toast', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));

    /* Първият лист на обекта пристига СЛЕД баселайна — часът се смята от него,
       за да не зависи тестът от реалния часовник на машината.
       `|| Date.now()` е за да не ХВЪРЛИ тестът, ако баселайнът е останал null:
       тогава проверките отгоре вече са паднали, а хвърлянето би отнесло
       следващите секции и би скрило дали и те хващат същата регресия. */
    const FIRST = { id: 'LF', warehouse: WH,
                    sent_at: new Date((Date.parse(mark) || Date.now()) + 3600000).toISOString() };
    st.lists = () => [FIRST];
    st.items = () => [row('LF')];
    h.w.checkNewLoadingLists();
    await ticks();

    ok('първият лист СЕ чува', h.sounds === 1, String(h.sounds));
    ok('и носи името на склада',
      h.calls.toast.some(t => String(t.msg || t) === '🚛 Нов товарен лист от ' + WH),
      JSON.stringify(h.calls.toast));
    ok('водният знак се мести на него', h.w._llWatermark === FIRST.sent_at,
      String(h.w._llWatermark));
  }

  section('а3) Първи цикъл при СРИВ — баселайнът пак се слага');
  {
    const st = { lists: () => [], items: () => [row('L1')] };  /* листите падат */
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();
    const mark = h.w._llWatermark;
    ok('водният знак е поставен въпреки срива', mark !== null, String(mark));

    /* Заварените листи са ПО-СТАРИ от баселайна, значи не гърмят фалшиво —
       човекът ги вижда в картата при вход, не като звънец. */
    st.lists = () => [L1, L2];
    h.w.checkNewLoadingLists();
    await ticks();
    ok('старите листи не се обявяват за нови', h.sounds === 0, String(h.sounds));
    ok('нула toast-ове', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));
  }

  section('б) Нов лист след водния знак — звук и съобщение с името на склада');
  {
    const st = { lists: () => [L1, L2], items: () => [row('L1'), row('L2')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    st.lists = () => [L1, L2, L3];
    st.items = () => [row('L1'), row('L2'), row('L3')];
    h.w.checkNewLoadingLists();
    await ticks();

    ok('един звук', h.sounds === 1, String(h.sounds));
    ok('съобщението носи името на склада',
      h.calls.toast.some(t => String(t.msg || t) === '🚛 Нов товарен лист от ' + WH),
      JSON.stringify(h.calls.toast));
    ok('водният знак се мести напред', h.w._llWatermark === L3.sent_at, String(h.w._llWatermark));
  }

  section('в) Лист със sent_at ≤ водния знак — нищо');
  {
    const st = { lists: () => [L2, L3], items: () => [row('L2'), row('L3')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();
    const mark = h.w._llWatermark;

    /* По-СТАР лист се появява в прозореца (напр. защото друг е приключил). */
    st.lists = () => [L1, L2, L3];
    st.items = () => [row('L1'), row('L2'), row('L3')];
    h.w.checkNewLoadingLists();
    await ticks();

    ok('нула звуци', h.sounds === 0, String(h.sounds));
    ok('нула toast-ове', h.calls.toast.length === 0, JSON.stringify(h.calls.toast));
    ok('водният знак не мърда', h.w._llWatermark === mark, String(h.w._llWatermark));
  }

  section('г) Празен резултат (срив) — водният знак ОСТАВА');
  {
    const st = { lists: () => [L1, L2], items: () => [row('L1'), row('L2')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();
    const mark = h.w._llWatermark;
    ok('водният знак е поставен', mark === L2.sent_at, String(mark));

    st.lists = () => [];                       /* мрежов срив */
    h.w.checkNewLoadingLists();
    await ticks();
    ok('при празен отговор знакът не се променя', h.w._llWatermark === mark,
      String(h.w._llWatermark));
    ok('и няма звук', h.sounds === 0, String(h.sounds));

    /* Възстановяване: същите два листа НЕ са нови. Точно това би се счупило,
       ако сривът беше нулирал или преместил знака. */
    st.lists = () => [L1, L2];
    h.w.checkNewLoadingLists();
    await ticks();
    ok('след възстановяване старите листи НЕ се обявяват за нови',
      h.sounds === 0 && h.calls.toast.length === 0,
      h.sounds + ' звука, toast: ' + JSON.stringify(h.calls.toast));

    /* И празен списък РЕДОВЕ е същият случай. */
    st.items = () => [];
    h.w.checkNewLoadingLists();
    await ticks();
    ok('празен списък редове също не мести знака', h.w._llWatermark === mark,
      String(h.w._llWatermark));
  }

  section('д) Лист, чиито редове за обекта са ПОЛУЧЕНИ — не се брои');
  {
    /* Заявката филтрира с received=eq.false, затова мокът връща само L2. */
    const st = { lists: () => [L1, L2], items: () => [row('L2')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();
    ok('водният знак е на L2, не на L1', h.w._llWatermark === L2.sent_at,
      String(h.w._llWatermark));

    let seen = null;
    h.w.notifLoadingListsPending(function (l) { seen = l; });
    await ticks();
    ok('L1 не влиза в резултата',
      Array.isArray(seen) && seen.length === 1 && seen[0].id === 'L2',
      JSON.stringify(seen && seen.map(x => x.id)));
  }

  section('е) Чернова с ред за обекта — не се брои');
  {
    const DRAFT = { id: 'LD', warehouse: WH, sent_at: null, status: 'draft' };
    const st = { lists: () => [DRAFT, L1], items: () => [row('LD'), row('L1')] };
    const h = env(STORE, st);
    let seen = null;
    h.w.notifLoadingListsPending(function (l) { seen = l; });
    await ticks();
    ok('в резултата е само изпратеният лист',
      Array.isArray(seen) && seen.length === 1 && seen[0].id === 'L1',
      JSON.stringify(seen && seen.map(x => x.id)));
    ok('заявката иска status=eq.sent',
      h.calls.get.some(u => /loading_lists/.test(u) && /status=eq\.sent/.test(u)),
      h.calls.get.filter(u => /loading_lists/.test(u)).join(' | '));
  }

  section('ж) Admin и складов потребител — нула заявки');
  {
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const a = env(ADMIN, st);
    a.w.checkNewLoadingLists();
    await ticks();
    ok('admin не пита за товарни листи',
      !a.calls.get.some(u => /loading_list/.test(u)),
      a.calls.get.filter(u => /loading/.test(u)).join(' | '));
    ok('водният знак остава празен', a.w._llWatermark === null, String(a.w._llWatermark));

    const w = env(WAREHOUSE, st);
    w.w.checkNewLoadingLists();
    await ticks();
    ok('складът не пита за товарни листи',
      !w.calls.get.some(u => /loading_list/.test(u)),
      w.calls.get.filter(u => /loading/.test(u)).join(' | '));
    ok('и неговият воден знак остава празен', w.w._llWatermark === null,
      String(w.w._llWatermark));
  }

  section('з) Карта в банера при вход');
  {
    const st = { lists: () => [L1, L2], items: () => [row('L1'), row('L2')] };
    const h = env(STORE, st);
    let went = null;
    h.w.showModule = function (m) { went = m; };

    if (guard('showLoginBanner() не хвърля', () => h.w.showLoginBanner())) {
      await ticks(); await ticks();
      /* Картата се търси по data-атрибут, не по текст: думата „товарни" стои
         и в подзаглавието на други карти. */
      const c = h.doc.querySelector('#notif-banner [data-notif="loading"]');
      if (ok('картата е налице', !!c, h.doc.getElementById('notif-banner').innerHTML.slice(0, 200))) {
        ok('брои двата листа', c.textContent.indexOf('2 товарни листа за получаване') >= 0,
          c.textContent);
        ok('и казва къде се отмятат',
          c.textContent.indexOf('Транспорт → Товарни листи') >= 0, c.textContent);
        realClick(h.w, c);
        ok('кликът отваря модула', went === 'loading', String(went));
      }
    }

    /* Единствено число. */
    const st1 = { lists: () => [L1], items: () => [row('L1')] };
    const h1 = env(STORE, st1);
    h1.w.showModule = function () {};
    h1.w.showLoginBanner();
    await ticks(); await ticks();
    const c1 = h1.doc.querySelector('#notif-banner [data-notif="loading"]');
    ok('един лист е в единствено число',
      !!c1 && c1.textContent.indexOf('1 товарен лист за получаване') >= 0,
      c1 && c1.textContent);
  }

  section('и) Без листи — няма карта');
  {
    const st = { lists: () => [], items: () => [] };
    const h = env(STORE, st);
    h.w.showModule = function () {};
    h.w.showLoginBanner();
    await ticks(); await ticks();
    ok('нула карти за товарни листи',
      h.doc.querySelectorAll('#notif-banner [data-notif="loading"]').length === 0,
      String(h.doc.querySelectorAll('#notif-banner [data-notif]').length));

    const w = env(WAREHOUSE, { lists: () => [L1], items: () => [row('L1')] });
    w.w.showModule = function () {};
    w.w.showLoginBanner();
    await ticks(); await ticks();
    ok('складът също не вижда карта',
      w.doc.querySelectorAll('#notif-banner [data-notif="loading"]').length === 0);
  }

  report();
})();
