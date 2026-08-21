/* notifications-poll.test.js — фалшива тревога „N нови заявки" при мрежов срив.

   Регресията: checkNewOrders() се върти на 30 сек. При мрежов срив sbGet
   резолвва с [], функцията строеше празен currentSet и презаписваше
   _seenIds={}. Следващият УСПЕШЕН цикъл виждаше ЦЯЛАТА таблица като нова →
   playSound() + toast „N нови заявки!" + пълен loadAll().

   Тук цикли се пускат ръчно, един по един, БЕЗ реални таймери — стартираме
   checkNewOrders() директно и чакаме промисите с ticks().

   Пускане:
     node tests/notifications-poll.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

/* ── 1. Среда ────────────────────────────────────────────────────────────── */

const USER = {
  email: 'sn@temax.bg', display_name: 'Снабдяване ЦО',
  role: 'supply', store_name: 'Централен офис'
};

const h = boot({
  /* transport.js / client-orders.js — това, което loadAll() пипа в реалния
     браузър. notifications.js обвива renderMetrics и startApp от shared.js,
     затова редът от index.html има значение и тук. */
  modules: ['transport.js', 'client-orders.js', 'notifications.js'],
  user: USER,
  data: {}
});

const w = h.w;
const calls = h.calls;

w.transportOrders = [];
w.clientOrders = [];

/* Броячи вместо реалните действия. playSound() ползва AudioContext, който
   jsdom няма; loadAll() би дръпнал три модула. И двете са глобални var-ове
   от notifications.js/shared.js, така че се подменят направо на window. */
let sounds = 0, loads = 0;
w.playSound = function () { sounds++; };
w.loadAll = function () { loads++; };

/* ── 2. Управляем fetch ──────────────────────────────────────────────────── */

/* 'ok' = мрежата работи, 'down' = fetch отхвърля преди да има отговор
   (истинският мрежов срив — точно това НЕ се симулира през opts.fail). */
let mode = 'ok';
let tIds = [];   /* id-та в transport_orders */
let cIds = [];   /* id-та в client_orders */

function res(body) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  });
}

w.fetch = function (url) {
  const u = String(url);
  if (mode === 'down') return Promise.reject(new TypeError('Failed to fetch'));
  if (/transport_orders/.test(u)) return res(tIds.map(id => ({ id: id })));
  if (/client_orders/.test(u)) return res(cIds.map(id => ({ id: id })));
  return res([]);
};

/* Броят видени id-та в baseline-а — прякото доказателство дали пазачът работи. */
function seenCount() {
  return w._seenIds === null ? null : Object.keys(w._seenIds).length;
}

/* Toast-овете от нотификацията (не от sbGet). */
function newOrderToasts() {
  return calls.toast.filter(m => /заявк/.test(String(m)) && /🔔/.test(String(m)));
}

async function cycle() {
  w.checkNewOrders();
  await ticks(4);
}

/* ── 3. Цикли ────────────────────────────────────────────────────────────── */

(async function () {

  section('1. Първи цикъл успешен — тих baseline');
  tIds = [1, 2];
  cIds = [10, 11];
  await cycle();
  ok('няма звук при първия цикъл', sounds === 0, 'sounds=' + sounds);
  ok('няма toast „нови заявки"', newOrderToasts().length === 0,
     JSON.stringify(calls.toast));
  ok('loadAll() не е викан', loads === 0, 'loads=' + loads);
  ok('baseline е записан с 4 id-та', seenCount() === 4, 'seen=' + seenCount());

  section('2. Втори цикъл — мрежов срив');
  const toastsBefore = calls.toast.length;
  mode = 'down';
  await cycle();
  ok('loadAll() НЕ е викан при срив', loads === 0, 'loads=' + loads);
  ok('няма звук при срив', sounds === 0, 'sounds=' + sounds);
  ok('няма toast „нови заявки" при срив', newOrderToasts().length === 0,
     JSON.stringify(calls.toast));
  /* silent=true → sbGet не крещи с червен toast за фонов пулс. */
  ok('sbGet мълчи (никакъв нов toast изобщо)', calls.toast.length === toastsBefore,
     'преди=' + toastsBefore + ' след=' + calls.toast.length);
  /* Сърцевината на поправката: baseline-ът НЕ е изтрит. */
  ok('baseline е непокътнат — пак 4 id-та', seenCount() === 4, 'seen=' + seenCount());

  section('3. Трети цикъл успешен, СЪЩИТЕ 4 id — регресията');
  mode = 'ok';
  await cycle();
  ok('loadAll() НЕ е викан', loads === 0, 'loads=' + loads);
  ok('няма звук', sounds === 0, 'sounds=' + sounds);
  ok('НЯМА toast „4 нови заявки!"', newOrderToasts().length === 0,
     JSON.stringify(calls.toast));
  ok('baseline пак е 4 id-та', seenCount() === 4, 'seen=' + seenCount());

  section('4. Четвърти цикъл — една истински нова заявка');
  cIds = [10, 11, 12];
  await cycle();
  ok('loadAll() е викан точно веднъж', loads === 1, 'loads=' + loads);
  ok('звукът се пуска', sounds === 1, 'sounds=' + sounds);
  const t = newOrderToasts();
  ok('един toast за нова заявка', t.length === 1, JSON.stringify(calls.toast));
  ok('текстът е в единствено число',
     t.length === 1 && t[0].indexOf('Нова заявка е постъпила!') >= 0,
     JSON.stringify(t));
  ok('baseline вече е 5 id-та', seenCount() === 5, 'seen=' + seenCount());

  section('5. silent не е протекъл глобално');
  mode = 'down';
  const before5 = calls.toast.length;
  const rows = await w.sbGet('users', 'select=store_name');
  await ticks(2);
  ok('sbGet без трети аргумент връща [] при срив',
     Array.isArray(rows) && rows.length === 0, JSON.stringify(rows));
  ok('sbGet без трети аргумент ВИКА toast', calls.toast.length === before5 + 1,
     'преди=' + before5 + ' след=' + calls.toast.length);
  ok('toast-ът е за грешка при зареждане',
     /Грешка при зареждане/.test(String(calls.toast[calls.toast.length - 1])),
     String(calls.toast[calls.toast.length - 1]));

  section('6. Все още тих baseline при обект с нула заявки');
  /* Приетият компромис: празен резултат никога не се приема за истина,
     затова _seenIds остава null и първата заявка минава без звук. */
  w._seenIds = null;
  mode = 'ok';
  tIds = []; cIds = [];
  await cycle();
  ok('празен резултат не записва baseline', seenCount() === null,
     'seen=' + seenCount());
  const soundsBefore = sounds;
  tIds = [77];
  await cycle();
  ok('първата заявка минава тихо (без фалшива тревога)',
     sounds === soundsBefore, 'sounds=' + sounds);
  ok('но вече има baseline', seenCount() === 1, 'seen=' + seenCount());

  h.close();
  report();
})();
