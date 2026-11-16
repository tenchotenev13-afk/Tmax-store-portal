/* Снабдяване (supply) в „🔎 Ревизии и преоценка“ — САМО „🎨 Зареждане“
   (решение на Тенчо, 16.11.2026).

   1. supply: горният таб се вижда; реален клик по него → mod-supply
      (не графикът); rvs-schedule, rvs-revaluation, rvs-minusi — скрити;
      rvs-supply — видим и активен.
   2. supply: модулите сами отказват — showModule('rev-schedule') и
      showModule('revaluation') → „Нямаш достъп“; linkedModuleAllowed:
      'supply' — да, 'revaluation' — не.
   3. admin, accounting, controlling, manager, sklad — без промяна:
      кликът по таба отваря графика (контролингът — Преоценка), rvs-schedule
      се вижда, графикът НЕ казва „Нямаш достъп“; Преоценка — за ЦО ролите
      (за manager/sklad е по ключа revaluation_stores, тук без него → скрит).
   4. Смяна на потребителя без презареждане: supply → admin връща
      rvs-schedule и onclick на таба към графика.

   Мутационна проверка (16.11.2026) — всеки вариант пуснат и паднал:
     M1 rsCanSeeSchedule() пак = rsCanSee()  → падат 1 и 2 (rvs-schedule, „Нямаш достъп“ за графика);
     M2 supply върнат в rvCanSee()           → падат 1 и 2 (rvs-revaluation, Преоценка);
     M3 onclick на таба без клона за supply  → пада 1 (кликът отваря графика).

   Пускане: node tests/supply-rev-subtabs.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const STORE = 'Троян';
const MODULES = ['bulletin.js', 'supply.js', 'revisions.js', 'revaluation.js', 'minusi.js'];

function env(role) {
  return boot({
    modules: MODULES,
    user: { id: 'u-' + role, email: 'x-' + role + '@temax.bg', display_name: 'Тест ' + role, role: role,
      store_name: (role === 'manager' || role === 'sklad') ? STORE : 'Централен офис', assigned_stores: [] },
    data: { app_settings: [], revision_schedule: [], revaluation_campaigns: [], revaluation_submissions: [], stores: [], users: [] }
  });
}
const vis = (h, id) => { const el = h.doc.getElementById(id); return !!el && el.style.display !== 'none'; };
const active = (h, id) => { const el = h.doc.getElementById(id); return !!el && el.classList.contains('active'); };
const shown = (h, id) => h.doc.getElementById(id).style.display === 'block';
const txt = (h, id) => h.doc.getElementById(id).textContent;

(async function run() {

  section('1. supply — таб, под-лента, реален клик');
  {
    const h = env('supply');
    guard('setupTabsForRole', () => h.w.setupTabsForRole()); await ticks(6);
    ok('supply: горният таб Ревизии се вижда', vis(h, 'tab-revaluation'));
    ok('supply: rvs-supply се вижда', vis(h, 'rvs-supply'));
    ok('supply: rvs-schedule е скрит', !vis(h, 'rvs-schedule'));
    ok('supply: rvs-revaluation е скрит', !vis(h, 'rvs-revaluation'));
    ok('supply: rvs-minusi е скрит', !vis(h, 'rvs-minusi'));
    h.w.showModule('transport'); await ticks(2);
    realClick(h.w, h.doc.getElementById('tab-revaluation')); await ticks(6);
    ok('supply: кликът по таба отваря mod-supply', shown(h, 'mod-supply'));
    ok('supply: графикът НЕ е отворен', !shown(h, 'mod-rev-schedule'));
    ok('supply: rvs-supply е активен', active(h, 'rvs-supply'));
    ok('supply: tab-revaluation е активен', active(h, 'tab-revaluation'));
    ok('supply: под-лентата е видима', h.doc.getElementById('rev-subnav').style.display === 'block');
    h.close();
  }

  section('2. supply — модулите сами отказват');
  {
    const h = env('supply');
    h.w.setupTabsForRole(); await ticks(4);
    ok('rsCanSee() остава true за supply', h.w.rsCanSee() === true);
    ok('rsCanSeeSchedule() = false', h.w.rsCanSeeSchedule() === false);
    ok('rvCanSee() = false', h.w.rvCanSee() === false);
    ok('rvIsCoViewer() = false', h.w.rvIsCoViewer() === false);
    guard('showModule(rev-schedule)', () => h.w.showModule('rev-schedule')); await ticks(6);
    ok('графикът → „Нямаш достъп“', /Нямаш достъп/.test(txt(h, 'mod-rev-schedule')), txt(h, 'mod-rev-schedule').slice(0, 120));
    guard('showModule(revaluation)', () => h.w.showModule('revaluation')); await ticks(6);
    ok('Преоценка → „Нямаш достъп“', /Нямаш достъп/.test(txt(h, 'mod-revaluation')), txt(h, 'mod-revaluation').slice(0, 120));
    ok('Минуси: mnTabVisible() = false', h.w.mnTabVisible() === false);
    ok("linkedModuleAllowed('supply') = true", h.w.linkedModuleAllowed('supply') === true);
    ok("linkedModuleAllowed('revaluation') = false", h.w.linkedModuleAllowed('revaluation') === false);
    h.close();
  }

  section('3. Останалите роли — без промяна');
  /* [роля, кликът по таба отваря, вижда Преоценка] */
  const ROWS = [
    ['admin', 'mod-rev-schedule', true],
    ['accounting', 'mod-rev-schedule', true],
    ['controlling', 'mod-revaluation', true],
    ['manager', 'mod-rev-schedule', false],
    ['sklad', 'mod-rev-schedule', false]
  ];
  for (const [role, lands, rv] of ROWS) {
    const h = env(role);
    h.w.setupTabsForRole(); await ticks(6);
    ok(role + ': табът се вижда', vis(h, 'tab-revaluation'));
    ok(role + ': rvs-schedule се вижда', vis(h, 'rvs-schedule'));
    ok(role + ': rvs-supply се вижда', vis(h, 'rvs-supply'));
    ok(role + ': rvs-revaluation ' + (rv ? 'се вижда' : 'е скрит (без ключ)'), vis(h, 'rvs-revaluation') === rv);
    ok(role + ': rsCanSeeSchedule() = true', h.w.rsCanSeeSchedule() === true);
    h.w.showModule('transport'); await ticks(2);
    realClick(h.w, h.doc.getElementById('tab-revaluation')); await ticks(6);
    ok(role + ': кликът по таба отваря ' + lands, shown(h, lands));
    ok(role + ': Зареждане НЕ е отворено от таба', !shown(h, 'mod-supply'));
    h.w.showModule('rev-schedule'); await ticks(6);
    ok(role + ': графикът не казва „Нямаш достъп“', !/Нямаш достъп/.test(txt(h, 'mod-rev-schedule')));
    h.close();
  }

  section('4. Смяна на потребителя без презареждане: supply → admin');
  {
    const h = env('supply');
    h.w.setupTabsForRole(); await ticks(4);
    ok('предпоставка: supply — rvs-schedule скрит', !vis(h, 'rvs-schedule'));
    h.w.currentUser = { id: 'u-admin', email: 'x-admin@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис', assigned_stores: [] };
    h.w.setupTabsForRole(); await ticks(4);
    ok('admin: rvs-schedule пак се вижда', vis(h, 'rvs-schedule'));
    ok('admin: rvs-revaluation се вижда', vis(h, 'rvs-revaluation'));
    ok("admin: onclick на таба → showModule('rev-schedule')", /showModule\('rev-schedule'\)/.test(h.doc.getElementById('tab-revaluation').getAttribute('onclick')));
    h.close();
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
