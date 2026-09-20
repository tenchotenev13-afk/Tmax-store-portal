/* Товарни листи — ТРАЙНО известие при обекта, когато лист дойде НАСРЕД сесията.

   Дотук пулсът викаше toast(): балонче, което изчезва след 2.5 секунди и не
   води НИКЪДЕ. Човек на рампата гледа стоката, не екрана — известието беше
   видимо само ако случайно е гледал портала в точната секунда.

   Сега същият модел като при Разлики (sdBadgePulse в stock-differences.js):
     · coNotifyToast() — 8 секунди И бутон, който отваря таба;
     · карта в #notif-banner, която ОСТАВА, докато не бъде затворена.

   Трите неща, в които е лесно да се сбърка тихо, и затова са заковани тук:
     · картата се ДУБЛИРА при втори нов лист — два реда за едно и също нещо;
     · броят в нея е на fresh вместо на lists, тоест казва „1 товарен лист",
       когато чакат три. Картата отговаря на „колко има за правене", не на
       „колко дойдоха в последната минута";
     · цикъл БЕЗ нов лист пак пипа банера — тогава картата, която човекът
       току-що е затворил с ✕, се връща сама.

   Пускане:  node tests/loading-lists-notify-live.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
/* realClick го няма нарочно: co-toast носи handler-а като СВОЙСТВО
   (t.onclick = ...), а realClick изпълнява onclick АТРИБУТА. Кликът по
   балончето е t.onclick(). */
const { boot, ok, section, report, ticks } = H;

const WH = 'Логистичен склад Търговище';
const WH2 = 'Логистичен склад Добрич';

const STORE = { email: 'petrich@temax.bg', display_name: 'Управител Петрич',
                role: 'manager', store_name: 'Петрич', assigned_stores: [] };

const L1 = { id: 'L1', warehouse: WH,  sent_at: '2026-09-02T07:00:00.000Z', status: 'sent' };
const L2 = { id: 'L2', warehouse: WH,  sent_at: '2026-09-03T07:00:00.000Z', status: 'sent' };
const L3 = { id: 'L3', warehouse: WH2, sent_at: '2026-09-04T07:00:00.000Z', status: 'sent' };

/* `lists` и `items` са ФУНКЦИИ на текущото състояние — един тест сменя
   отговора между два цикъла на пулса. */
function env(user, state) {
  const h = boot({
    modules: ['transport.js', 'pallets.js', 'bulletin.js', 'stock-returns.js',
              'stock-differences.js', 'loading.js', 'notifications.js'],
    user: user, confirm: true,
    data: {
      loading_lists: function (url) {
        const rows = state.lists();
        return /status=eq\.sent/.test(url) ? rows.filter(r => r.status !== 'draft') : rows;
      },
      loading_list_items: function (url) {
        let rows = state.items();
        /* Точно филтрите на notifLoadingListsPending. Мокът ги прилага —
           иначе „чакащо е само неотметнатото" минава и с махнат филтър. */
        if (/received=eq\.false/.test(url)) rows = rows.filter(r => !r.received);
        if (/missing=eq\.false/.test(url)) rows = rows.filter(r => !r.missing);
        return rows;
      },
      transport_orders: [], client_orders: [], users: [], stores: [], contacts: [],
      kasa_reports: [], kasa_storno: [], bulletin_tasks: [], recurring_tasks: [],
      task_completions: [], stock_differences: [], differences_reports: [],
      stock_returns: [], goods_transit: []
    }
  });
  h.w.transportOrders = []; h.w.clientOrders = [];
  h.sounds = 0;
  h.w.playSound = function () { h.sounds++; };
  /* coNotifyToast е РЕАЛНАТА (от notifications.js) — тук само се записва, че
     е викана и с какво, после се оставя да построи елемента. Така кликът
     по-долу минава през истинския onclick, а не през тестов дубъл. */
  h.notify = [];
  const realNotify = h.w.coNotifyToast;
  h.w.coNotifyToast = function (text, id, hover, onClick) {
    h.notify.push({ text: text, id: id, hover: hover, onClick: onClick });
    return realNotify(text, id, hover, onClick);
  };
  h.modules = [];
  h.w.showModule = function (m) { h.modules.push(m); };
  return h;
}

const row = (list_id, o) => Object.assign(
  { list_id: list_id, store_name: 'Петрич', received: false, missing: false }, o);

const banner = doc => doc.getElementById('notif-banner');
const cards = doc => banner(doc).querySelectorAll('[data-notif="loading"]');
const cardTitle = doc => {
  const c = cards(doc)[0];
  return c ? c.querySelector('.notif-title').textContent : null;
};

(async function () {

  section('а) Втори цикъл с нов лист → coNotifyToast + карта в банера');
  {
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);

    /* Цикъл 1 — баселайн. Тих по определение. */
    h.w.checkNewLoadingLists();
    await ticks();
    ok('водният знак застава на L1', h.w._llWatermark === L1.sent_at, String(h.w._llWatermark));
    ok('нула известия в базовия цикъл', h.notify.length === 0, JSON.stringify(h.notify));
    ok('и нула карти', cards(h.doc).length === 0, String(cards(h.doc).length));

    /* Цикъл 2 — нов лист със sent_at СЛЕД водния знак. */
    st.lists = () => [L1, L2];
    st.items = () => [row('L1'), row('L2')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();

    ok('звукът е пуснат', h.sounds === 1, String(h.sounds));
    if (ok('coNotifyToast е викан веднъж', h.notify.length === 1, JSON.stringify(h.notify))) {
      ok('текстът е за ЕДИН лист и носи склада',
        h.notify[0].text === '🚛 Нов товарен лист от ' + WH, h.notify[0].text);
      ok('подсказката е „Отвори Товарни листи"',
        h.notify[0].hover === 'Отвори Товарни листи', h.notify[0].hover);
      ok('id-то е празно — няма конкретна заявка за отваряне',
        h.notify[0].id === '', JSON.stringify(h.notify[0].id));
      ok('и има onClick', typeof h.notify[0].onClick === 'function');
    }

    /* Балончето е реален елемент — кликът минава през истинския onclick. */
    const t = h.doc.getElementById('co-toast');
    if (ok('балончето е на екрана', !!t && t.style.display === 'block',
      t && t.style.display)) {
      ok('и показва текста', t.textContent === '🚛 Нов товарен лист от ' + WH, t.textContent);
      t.onclick();
      ok('кликът отваря Товарни листи',
        h.modules.indexOf('loading') >= 0, JSON.stringify(h.modules));
      ok('и скрива балончето', t.style.display === 'none', t.style.display);
    }

    /* Трайната следа. */
    if (ok('картата се появява в банера', cards(h.doc).length === 1,
      banner(h.doc).innerHTML.slice(0, 200))) {
      /* Броят е на ЧАКАЩИТЕ листи (2), не на новите (1). */
      ok('и брои ЧАКАЩИТЕ, не новите', cardTitle(h.doc) === '2 товарни листа за получаване',
        cardTitle(h.doc));
      ok('банерът е видим', banner(h.doc).style.display === 'block',
        banner(h.doc).style.display);
      ok('картата води към Товарни листи',
        (cards(h.doc)[0].getAttribute('onclick') || '').indexOf("showModule('loading')") >= 0,
        cards(h.doc)[0].getAttribute('onclick'));
    }
    ok('водният знак се мести на L2', h.w._llWatermark === L2.sent_at, String(h.w._llWatermark));
  }

  section('б) Трети цикъл БЕЗ нов лист — нищо ново, без дублиране');
  {
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    st.lists = () => [L1, L2];
    st.items = () => [row('L1'), row('L2')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();
    const afterSecond = { notify: h.notify.length, sounds: h.sounds, cards: cards(h.doc).length };
    ok('след втория цикъл има една карта', afterSecond.cards === 1, String(afterSecond.cards));

    /* Трети цикъл: СЪЩИТЕ листи, нищо ново. */
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();

    ok('нула нови известия', h.notify.length === afterSecond.notify,
      h.notify.length + ' срещу ' + afterSecond.notify);
    ok('нула нови звуци', h.sounds === afterSecond.sounds,
      h.sounds + ' срещу ' + afterSecond.sounds);
    ok('картата НЕ се дублира', cards(h.doc).length === 1, String(cards(h.doc).length));
    ok('и водният знак стои на L2', h.w._llWatermark === L2.sent_at, String(h.w._llWatermark));
  }

  section('б2) Затворена карта НЕ се връща сама при тих цикъл');
  {
    /* Човекът е натиснал ✕. Цикъл без нов лист не бива да я върне —
       иначе бутонът за затваряне е декоративен. */
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();
    st.lists = () => [L1, L2];
    st.items = () => [row('L1'), row('L2')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();
    ok('картата е тук', cards(h.doc).length === 1);

    cards(h.doc)[0].remove();               /* каквото прави dismissCard */
    ok('и е махната', cards(h.doc).length === 0);

    h.w.checkNewLoadingLists();
    await ticks(); await ticks();
    ok('тихият цикъл НЕ я връща', cards(h.doc).length === 0, String(cards(h.doc).length));
  }

  section('в) Втори НОВ лист — картата се ОБНОВЯВА, не се дублира');
  {
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    st.lists = () => [L1, L2];
    st.items = () => [row('L1'), row('L2')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();
    ok('една карта, 2 чакащи', cards(h.doc).length === 1 &&
      cardTitle(h.doc) === '2 товарни листа за получаване', cardTitle(h.doc));

    /* Трети лист, от ДРУГ склад. */
    st.lists = () => [L1, L2, L3];
    st.items = () => [row('L1'), row('L2'), row('L3')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();

    ok('пак ЕДНА карта', cards(h.doc).length === 1, String(cards(h.doc).length));
    ok('но с обновен брой', cardTitle(h.doc) === '3 товарни листа за получаване',
      cardTitle(h.doc));
    ok('второ известие е излязло', h.notify.length === 2, JSON.stringify(h.notify.map(x => x.text)));
    ok('и е за новия склад',
      h.notify[1].text === '🚛 Нов товарен лист от ' + WH2, h.notify[1].text);
  }

  section('г) Два нови наведнъж — множествено число');
  {
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    st.lists = () => [L1, L2, L3];
    st.items = () => [row('L1'), row('L2'), row('L3')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();

    if (ok('едно известие за двата', h.notify.length === 1, JSON.stringify(h.notify))) {
      ok('текстът е „2 нови товарни листа"',
        h.notify[0].text === '🚛 2 нови товарни листа', h.notify[0].text);
    }
    ok('картата брои трите чакащи', cardTitle(h.doc) === '3 товарни листа за получаване',
      cardTitle(h.doc));
  }

  section('д) Единствено число в картата');
  {
    /* Обектът няма нищо, после идва първият му лист. */
    const st = { lists: () => [], items: () => [] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();
    ok('баселайнът е сложен и при празен обект', !!h.w._llWatermark,
      String(h.w._llWatermark));

    /* Лист със sent_at СЛЕД баселайна „сега". */
    const future = new Date(Date.now() + 60000).toISOString();
    const LF = { id: 'LF', warehouse: WH, sent_at: future, status: 'sent' };
    st.lists = () => [LF];
    st.items = () => [row('LF')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();

    ok('известие има', h.notify.length === 1, JSON.stringify(h.notify));
    ok('картата е в ЕДИНСТВЕНО число',
      cardTitle(h.doc) === '1 товарен лист за получаване', cardTitle(h.doc));
  }

  section('е) Отметнат ред — листът не влиза нито в известието, нито в картата');
  {
    /* Пулсът вика notifLoadingListsPending, а тя брои САМО неотметнатото и
       само нерешеното. Затова L1 отпада, щом редът му е получен. */
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    st.lists = () => [L1, L2];
    st.items = () => [row('L1', { received: true }), row('L2')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();

    ok('известие за новия лист има', h.notify.length === 1, JSON.stringify(h.notify));
    ok('но картата брои само ЕДИН чакащ',
      cardTitle(h.doc) === '1 товарен лист за получаване', cardTitle(h.doc));
  }

  section('е2) Ред, заявен като НЕПОЛУЧЕН, също не е чакащ');
  {
    const st = { lists: () => [L1], items: () => [row('L1')] };
    const h = env(STORE, st);
    h.w.checkNewLoadingLists();
    await ticks();

    st.lists = () => [L1, L2];
    st.items = () => [row('L1', { missing: true }), row('L2')];
    h.w.checkNewLoadingLists();
    await ticks(); await ticks();
    ok('картата брои само ЕДИН чакащ',
      cardTitle(h.doc) === '1 товарен лист за получаване', cardTitle(h.doc));
  }

  section('ж) Картата при ВХОД и картата от ПУЛСА са една и съща');
  {
    /* Двете се строят от notifLoadingCardHtml(). Разминат ли се, човек вижда
       различен текст според това дали листът е дошъл преди или след входа. */
    const h = env(STORE, { lists: () => [L1], items: () => [row('L1')] });
    const fromHelper = h.w.notifLoadingCardHtml(2);
    ok('helper-ът е глобален', typeof h.w.notifLoadingCardHtml === 'function');
    ok('и носи data-notif="loading"', fromHelper.indexOf('data-notif="loading"') >= 0);
    ok('заглавието минава през notifLoadingCardTitle',
      fromHelper.indexOf(h.w.notifLoadingCardTitle(2)) >= 0, fromHelper.slice(0, 200));
    ok('единствено число', h.w.notifLoadingCardTitle(1) === '1 товарен лист за получаване',
      h.w.notifLoadingCardTitle(1));
    ok('множествено число', h.w.notifLoadingCardTitle(5) === '5 товарни листа за получаване',
      h.w.notifLoadingCardTitle(5));
    ok('✕ спира разпространението — иначе затварянето отваря таба',
      fromHelper.indexOf('event.stopPropagation()') >= 0, fromHelper);

    /* И че showLoginBanner наистина го ползва, вместо собствено копие. */
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[2] || path.join(__dirname, '..');
    const src = fs.readFileSync(path.join(root, 'notifications.js'), 'utf8');
    ok('showLoginBanner вика helper-а',
      /notifLoadingCardHtml\(lists\.length\)/.test(src));
    /* Броят се само ПОСТРОЯВАНЕТО на картата — querySelector-ът в
       notifUpsertLoadingCard() съдържа същия атрибут и по него всяка
       проверка би върнала 2. */
    const built = (src.match(/notif-card info" data-notif="loading"/g) || []).length;
    ok('и няма второ копие на картата в кода', built === 1, String(built));
  }

  section('з) Нула карти, ако банерът не съществува');
  {
    /* notifUpsertLoadingCard се вика от пулса, който тече и преди банерът да
       е построен. Липсващ елемент не бива да хвърля насред известието. */
    const h = env(STORE, { lists: () => [L1], items: () => [row('L1')] });
    banner(h.doc).remove();
    let threw = false;
    try { h.w.notifUpsertLoadingCard(3); } catch (e) { threw = true; }
    ok('не хвърля без банер', !threw);
    ok('нула при n=0 също не хвърля', (function () {
      try { h.w.notifUpsertLoadingCard(0); return true; } catch (e) { return false; }
    })());
  }

  report();
})();
