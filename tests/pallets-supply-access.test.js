/* ПАЛЕТИ — ДОСТЪП НА СНАБДЯВАНЕ (role 'supply').

   Снабдяване заявява транспорт за прибиране на палети, затова вижда
   обобщената матрица по всички обекти и изнася Excel за всички — през
   локалния palletsIsGlobal() в pallets.js. isGlobal() в shared.js НЕ е
   разширен: извън палетите supply остава обикновена роля.

   Контролен случай — manager на обект: остава магазинският изглед.

   Пускане:  node tests/pallets-supply-access.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const USERS = ['Враца', 'Габрово', 'Шумен', 'Централен офис'].map(s => ({ store_name: s }));
function pal(store, date, e) {
  return { id: store + '-' + date, store_name: store, report_date: date,
           euro_pallets: e, small_pallets: 1, nonstandard_pallets: 0,
           grate_pallets: 0, bilka_pallets: 0, sent_note: null,
           updated_by: null, created_by: 'x' };
}
const ROWS = [pal('Враца', '2026-09-18', 20), pal('Габрово', '2026-09-17', 5), pal('Шумен', '2026-09-16', 3)];

function fakeXlsx() {
  return { utils: {
    book_new: () => ({ names: [], sheets: {} }),
    aoa_to_sheet: aoa => ({ aoa: aoa }),
    book_append_sheet: (wb, ws, name) => { wb.names.push(name); wb.sheets[name] = ws; }
  }, writeFile: () => {} };
}
function env(user) {
  return boot({ modules: ['pallets.js'], user: user, data: { users: USERS, transport_pallets: ROWS } });
}
const SUPPLY = { email: 's@temax.bg', display_name: 'Снабдяване', role: 'supply', store_name: 'Централен офис' };
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител', role: 'manager', store_name: 'Враца' };

const palletGets = calls => calls.get.filter(u => u.indexOf('transport_pallets') >= 0);

(async function () {

  section('1. supply → обобщената матрица по всички обекти');
  {
    const h = env(SUPPLY);
    ok('isGlobal() за supply остава false (shared.js не е пипан)', h.w.isGlobal() === false);
    ok('palletsIsGlobal() за supply е true', h.w.palletsIsGlobal() === true);
    h.w.loadPallets(); await ticks(); await ticks();
    const gets = palletGets(h.calls);
    ok('една заявка към transport_pallets', gets.length === 1, gets.join(' | '));
    ok('заявката е report_date=gte…', gets.length === 1 && /transport_pallets\?report_date=gte\./.test(gets[0]), gets[0]);
    ok('БЕЗ филтър store_name', gets.length === 1 && gets[0].indexOf('store_name=') < 0, gets[0]);
    ok('users се тегли за списъка обекти', h.calls.get.some(u => /users\?select=store_name/.test(u)));
    const tfoot = h.doc.querySelector('#mod-pallets tfoot');
    ok('матрицата е рендирана (tfoot с ОБЩО)', !!tfoot && tfoot.textContent.indexOf('ОБЩО') >= 0);
    const body = h.doc.querySelector('#mod-pallets tbody');
    const txt = body ? body.textContent : '';
    ok('в матрицата са и трите обекта', ['Враца', 'Габрово', 'Шумен'].every(s => txt.indexOf(s) >= 0), txt.slice(0, 200));

    const src = h.w.palletsExportSource();
    ok('експортът взема всички обекти (stores > 1)', src.stores.length > 1, JSON.stringify(src.stores));
    const res = h.w.palletsBuildWorkbook(fakeXlsx(), 10);
    ok('palletsBuildWorkbook връща stores > 1', !!res && res.stores > 1, res && String(res.stores));
    const P = res && res.wb.sheets['Палети'] ? res.wb.sheets['Палети'].aoa : [];
    const inSheet = {}; P.slice(1).forEach(r => { inSheet[r[0]] = 1; });
    ok('palletsBuildWorkbook: листът „Палети" е по >1 обект', Object.keys(inSheet).length > 1, Object.keys(inSheet).join(','));
    h.close();
  }

  section('2. Контрол: manager → магазинският изглед');
  {
    const h = env(MANAGER);
    ok('palletsIsGlobal() за manager е false', h.w.palletsIsGlobal() === false);
    h.w.loadPallets(); await ticks(); await ticks();
    const gets = palletGets(h.calls);
    ok('заявката е филтрирана по своя обект',
      gets.length === 1 && gets[0].indexOf('store_name=eq.' + encodeURIComponent('Враца')) >= 0, gets.join(' | '));
    ok('няма матрица (без tfoot ОБЩО)', !h.doc.querySelector('#mod-pallets tfoot'));
    const src = h.w.palletsExportSource();
    ok('експортът е само за своя обект', src.stores.length === 1 && src.stores[0] === 'Враца', JSON.stringify(src.stores));
    h.close();
  }

  report();
})();
