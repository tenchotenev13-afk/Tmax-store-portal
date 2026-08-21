/* Кои обекти влизат в статистиките по магазини — isReportableStore().

   Заварено: филтърът беше `u.store_name !== 'Централен офис'`, преписан на
   8 места (report.js ×4, today.js, едж функцията ×3). Логистичните складове
   минаваха през него и се появяваха като обекти:

     Логистичен склад Добрич    0 от 27 задачи   0%
     Логистичен склад Търговище 0 от 27 задачи   0%

   Оттам „20 обекта общо" вместо 18 и total_all = 20×27 = 540 вместо 486.
   Складовете НЕ участват в седмичния бюлетин — в task_completions няма нито
   един запис с тяхното име — тоест стояха на 0% завинаги и всяка седмица
   влизаха в „обекта под 50%".

   Списъкът живее на ЕДНО място (shared.js), защото го ползват две различни
   неща: Разлики (isLogisticsWarehouseUser) и отчетите (isReportableStore).

   Пускане:  node tests/report-store-list.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Точно това, което връща sbGet('users','select=store_name&order=store_name')
   в живата база: 18 обекта + 2 склада + ЦО, с повторения. */
const REAL_STORES = [
  'Враца','Габрово','Гоце Делчев','Добрич','Дупница','Карлово','Козлодуй',
  'Кърджали','Монтана','Петрич','Пирдоп','Раднево','Севлиево','Силистра',
  'Сливен','Троян','Търговище','Шумен'
];
const USERS = REAL_STORES.concat(REAL_STORES)          /* по двама на обект */
  .concat(['Логистичен склад Добрич','Логистичен склад Търговище'])
  .concat(['Централен офис','Централен офис'])
  .map(s => ({ store_name: s }));

function env(data) {
  return boot({
    modules: ['bulletin.js', 'today.js', 'stock-differences.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: USERS,
      bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], report_snapshots: [],
      differences_reports: [], stock_returns: [], kasa_storno: [],
      kasa_zoborot: [], goods_transit: [], transport_pallets: [],
      stock_differences: []
    }, data || {})
  });
}

/* Същият филтър, който всички колектори прилагат върху users. */
function storeList(w) {
  const seen = {};
  return USERS.filter(function (u) {
    if (!w.isReportableStore(u.store_name) || seen[u.store_name]) return false;
    seen[u.store_name] = 1; return true;
  }).map(u => u.store_name);
}

(async function () {

  section('1. isReportableStore — кой влиза и кой не');
  {
    const { w } = env();
    ok('обикновен обект влиза', w.isReportableStore('Раднево') === true);
    ok('Централен офис НЕ влиза', w.isReportableStore('Централен офис') === false);
    ok('Логистичен склад Добрич НЕ влиза',
      w.isReportableStore('Логистичен склад Добрич') === false);
    ok('Логистичен склад Търговище НЕ влиза',
      w.isReportableStore('Логистичен склад Търговище') === false);
    ok('празно име НЕ влиза', w.isReportableStore('') === false);
    ok('null НЕ хвърля и НЕ влиза', w.isReportableStore(null) === false);
    ok('undefined НЕ хвърля и НЕ влиза', w.isReportableStore(undefined) === false);
  }

  section('2. ЯДРОТО: обектите стават 18');
  {
    const { w } = env();
    const list = storeList(w);
    ok('точно 18 обекта, не 20', list.length === 18, String(list.length));
    ok('нито един „Логистичен склад" в списъка',
      !list.some(s => s.indexOf('Логистичен') === 0), list.join(', '));
    ok('Централен офис също го няма', list.indexOf('Централен офис') < 0);
    ok('и всички 18 реални обекта са вътре',
      REAL_STORES.every(s => list.indexOf(s) >= 0),
      REAL_STORES.filter(s => list.indexOf(s) < 0).join(', '));
    ok('без повторения', list.length === new Set(list).size);
  }

  section('3. Списъкът е ЕДИН — shared.js, не по копие на модул');
  {
    const { w } = env();
    ok('LOGISTICS_WAREHOUSES съществува глобално',
      Array.isArray(w.LOGISTICS_WAREHOUSES) && w.LOGISTICS_WAREHOUSES.length === 2,
      JSON.stringify(w.LOGISTICS_WAREHOUSES));
    ok('REPORT_EXCLUDED_STORES е ЦО + двата склада',
      w.REPORT_EXCLUDED_STORES.length === 3 &&
      w.REPORT_EXCLUDED_STORES.indexOf('Централен офис') >= 0,
      JSON.stringify(w.REPORT_EXCLUDED_STORES));
    /* Разлики ползва СЪЩИЯ списък - ако някой добави трети склад, двете
       места се движат заедно. */
    ok('isLogisticsWarehouseUser чете същия списък',
      typeof w.isLogisticsWarehouseUser === 'function');
    w.currentUser = { email: 'x@temax.bg', role: 'logistics',
                      store_name: 'Логистичен склад Добрич' };
    ok('и разпознава склад', w.isLogisticsWarehouseUser() === true);
    w.currentUser = { email: 'y@temax.bg', role: 'sklad', store_name: 'Раднево' };
    ok('но не и обикновен обект', !w.isLogisticsWarehouseUser());
    w.currentUser = ADMIN;
  }

  section('4. Колекторите наистина ползват филтъра');
  {
    /* Дневният - най-простият път до summary.storeCount. */
    const h = env({
      bulletins: [{ id: 'b-1', week_number: 34, year: 2026, status: 'published' }],
      recurring_tasks: [{ id: 'r-1', active: true, due_weekday: 0, title: 'Каса' }],
      bulletin_tasks: []
    });
    let daily = null;
    h.w.collectDailyReportData(function (d) { daily = d; });
    await ticks();
    if (ok('дневният връща обобщение', !!daily)) {
      ok('storeCount е 18, не 20', daily.storeCount === 18, String(daily.storeCount));
      ok('нито един ред за склад',
        !daily.rows.some(r => r.name.indexOf('Логистичен') === 0),
        daily.rows.map(r => r.name).join(', '));
    }
  }

  section('5. И кросмодулната секция брои 18 обекта');
  {
    const h = env({ transport_pallets: [] });
    let cross = null;
    h.w.collectCrossModuleWeeklySummary(function (c) { cross = c; });
    await ticks();
    if (ok('обобщението се събира', !!cross)) {
      /* „обекта общо" в реда Палети идва от същия списък. */
      ok('палетите броят 18 обекта', cross.pallets.total === 18,
        String(cross.pallets.total));
      ok('и всичките 18 са без данни (няма transport_pallets)',
        cross.pallets.missing === 18, String(cross.pallets.missing));
    }
  }

  section('6. Таб ДНЕС ползва същия филтър');
  {
    const { w, doc } = env({
      bulletins: [{ id: 'b-1', week_number: 34, year: 2026, status: 'published' }],
      recurring_tasks: [{ id: 'r-1', active: true, due_weekday: 0, due_time: '09:00', title: 'Каса' }]
    });
    if (guard('loadTodayDashboard() не хвърля', () => w.loadTodayDashboard())) {
      await ticks();
      const html = doc.getElementById('mod-today').innerHTML;
      ok('в таблото няма „Логистичен склад"',
        html.indexOf('Логистичен склад') < 0);
    }
  }

  report();
})();
