/* История — „Магазин“ (#h-store) без дублирани обекти.

   На живо 12.10.2026 (admin, История → Търсене по период) всеки обект беше
   по два пъти: loadHistory() викаше renderHistoryShell(), която в края си
   вика loadHistoryStores(), и после пак loadHistoryStores(). Двата отговора
   от sbGet('stores', …) се appendChild-ваха в един и същ select.

   Покрива:
     1. loadHistory() → точно една заявка към stores, select = 1 + 3 опции.
     2. Второ викане на loadHistoryStores() → пак 1 + 3.
     3. Избран обект се запазва след повторно зареждане.

   Мутационна проверка (12.10.2026), всеки мутант пуснат срещу този тест:
     - върнато `loadHistoryStores();` в loadHistory()     — СЪБОРЕН
     - махнато нулирането `sel.length=1;`                 — СЪБОРЕН
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/history-store-dropdown.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис'
};
const STORES = [{ name: 'Карлово' }, { name: 'Кърджали' }, { name: 'Шумен' }];

function env() {
  return boot({
    modules: ['kasa.js', 'kasa-docs.js', 'history.js'],
    user: ADMIN,
    data: { stores: STORES, transport_orders: [], client_orders: [], kasa_reports: [], kasa_storno: [] }
  });
}
const opts = h => Array.prototype.map.call(h.doc.getElementById('h-store').options, o => o.value);
const storeGets = h => h.calls.get.filter(u => u.indexOf('/stores?') >= 0);

(async function () {

  section('1. loadHistory() — една заявка, 1 + 3 опции');
  {
    const h = env();
    guard('loadHistory() не хвърля', () => h.w.loadHistory());
    await ticks();
    ok('точно една заявка към stores', storeGets(h).length === 1, 'реално: ' + storeGets(h).length);
    const o = opts(h);
    ok('select-ът има точно 1 + 3 опции', o.length === 4, 'реално: ' + JSON.stringify(o));
    ok('първата е „— Всички —“ (празна стойност)', o[0] === '' &&
       h.doc.getElementById('h-store').options[0].textContent === '— Всички —');
    ok('обектите са по веднъж и в реда от заявката',
       JSON.stringify(o.slice(1)) === JSON.stringify(['Карлово', 'Кърджали', 'Шумен']), JSON.stringify(o));

    section('2. Второ викане на loadHistoryStores() — пак 1 + 3');
    h.w.loadHistoryStores();
    await ticks();
    ok('след второ викане — пак 4 опции', opts(h).length === 4, 'реално: ' + JSON.stringify(opts(h)));

    section('3. Избраният обект се запазва');
    h.doc.getElementById('h-store').value = 'Кърджали';
    h.w.loadHistoryStores();
    await ticks();
    ok('пак 4 опции', opts(h).length === 4, 'реално: ' + opts(h).length);
    ok('„Кърджали“ остава избран', h.doc.getElementById('h-store').value === 'Кърджали',
       'реално: ' + h.doc.getElementById('h-store').value);
    h.close();
  }

  report();
})();
