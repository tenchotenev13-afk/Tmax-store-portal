/* Роля 'controlling' („Контролинг") и група 'revaluation'.
   От 18.10.2026 (решение на Тенчо, wt-roli-tabove): общите табове + „Ревизии
   и преоценка" с ДВАТА под-таба (графикът — само гледане) + „Днес". Без
   Каса, История, Чек лист, Администрация. В Преоценка работи като ЦО.
   (До 18.10.2026 виждаше САМО Преоценка — скриването на всички табове,
   data-ctrl-hidden и спрените банер / polling / loadAll са махнати.)
   Известието за подадена бланка — по групата 'revaluation' (+ регионалния).
   Минава през ИСТИНСКИЯ startApp() (shared.js + обвивката от notifications.js)
   и през реалните revaluation.js / revisions.js / admin.js / checklist.js.

   Мутационна проверка (18.10.2026) — всеки вариант е пуснат и е паднал:
     K1 rvRecipients обратно на 'controlling'
        → пада „получава само групата revaluation";
     K2 controlling без „Днес" (roleCanSeeToday)
        → пада „Днес — да";
     K3 rsCanSee без 'controlling'
        → пада „„Ревизии и преоценка" — да";
     K4 Чек лист по група 'controlling' и за ролята (без изричното изключване)
        → пада „Чек лист — не (дори в група controlling)".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const CTRL = { id: 'u-c', email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'controlling', store_name: 'Централен офис',
  notify_groups: ['controlling', 'revaluation'] };
const ADMIN = { id: 'u-a', email: 'ten.tenev@temax.bg', display_name: 'Тен Тенев', role: 'admin', store_name: 'Централен офис' };

function env(user) {
  return boot({
    modules: ['admin.js', 'stock-returns.js', 'checklist.js', 'notifications.js', 'revaluation.js', 'revisions.js'],
    user: Object.assign({}, user),
    data: { revaluation_campaigns: [], revaluation_submissions: [], revaluation_items: [], revaluation_codes: [],
      revision_schedule: [], stores: [], app_settings: [], transport_orders: [], client_orders: [], docs: [],
      users: url => url.indexOf('id=eq.') >= 0 ? [{ is_regional: false, assigned_stores: [] }] : [] }
  });
}
const vis = (h, id) => { const el = h.doc.getElementById(id); return !!el && el.style.display !== 'none'; };
const shown = (h, id) => { const m = h.doc.getElementById(id); return !!m && m.style.display === 'block'; };

(async function run() {

  section('1. Вход като Контролинг');
  {
    const h = env(CTRL);
    let loadAllCalls = 0; h.w.loadAll = () => { loadAllCalls++; };
    guard('startApp()', () => h.w.startApp()); await ticks(8);
    ['tab-transport', 'tab-client', 'tab-bulletin', 'tab-docs', 'tab-contacts', 'tab-reference'].forEach(id =>
      ok('общ таб ' + id + ' — да', vis(h, id)));
    ok('„Ревизии и преоценка" — да', vis(h, 'tab-revaluation'));
    ok('Днес — да', vis(h, 'tab-today'));
    ok('Каса — не', !vis(h, 'tab-kasa'));
    ok('История — не', !vis(h, 'tab-history'));
    ok('Чек лист — не (дори в група controlling)', !vis(h, 'tab-checklist'));
    ok('Администрация — не', !vis(h, 'tab-admin') && !vis(h, 'sep-admin'));
    ok('под-таб „📅 График ревизии" — да', vis(h, 'rvs-schedule'));
    ok('под-таб „🏷️ Преоценка" — да', vis(h, 'rvs-revaluation'));
    ok('отвореният модул е revaluation', shown(h, 'mod-revaluation') && !shown(h, 'mod-transport'));
    ok('rvIsCO() === true, rvCanSee() === true', h.w.rvIsCO() === true && h.w.rvCanSee() === true);
    ok('rsCanEdit() === false (графикът — само гледане)', h.w.rsCanEdit() === false);
    ok('isGlobal() === false', h.w.isGlobal() === false);
    ok('loadAll() се вика (Транспорт / Клиентски / Документи)', loadAllCalls === 1, loadAllCalls);
    realClick(h.w, h.doc.getElementById('tab-revaluation')); await ticks(6);
    ok('клик по главния таб → Преоценка', shown(h, 'mod-revaluation'));
    realClick(h.w, h.doc.getElementById('rvs-schedule')); await ticks(6);
    ok('„📅 График ревизии" се отваря, без „Нямаш достъп"', shown(h, 'mod-rev-schedule') && h.doc.getElementById('mod-rev-schedule').textContent.indexOf('Нямаш достъп') < 0);
    ok('в графика — без „＋ Седмица" (само гледане)', !btn(h.doc.getElementById('mod-rev-schedule'), '＋ Седмица'));
    guard('showModule(revaluation)', () => h.w.showModule('revaluation')); await ticks(6);
    ok('в Преоценка: бутоните на ЦО („📅 График на кампаниите")', !!btn(h.doc.getElementById('mod-revaluation'), 'График на кампаниите'));
  }

  section('2. Вход като admin — без промяна');
  {
    const h = env(ADMIN);
    guard('startApp()', () => h.w.startApp()); await ticks(8);
    ['tab-transport', 'tab-client', 'tab-bulletin', 'tab-history', 'tab-today', 'tab-admin', 'tab-revaluation', 'tab-docs', 'tab-kasa'].forEach(id =>
      ok('admin вижда ' + id, vis(h, id)));
    ok('#rvs-schedule видим', vis(h, 'rvs-schedule'));
    ok('главният таб отваря графика', h.doc.getElementById('tab-revaluation').getAttribute('onclick') === "showModule('rev-schedule')");
    ok('стартовият модул е Транспорт', shown(h, 'mod-transport'));
  }

  section('3. Смяна на потребителя без презареждане');
  {
    const h = env(CTRL);
    guard('startApp(controlling)', () => h.w.startApp()); await ticks(6);
    h.w.currentUser = Object.assign({}, ADMIN);
    guard('startApp(admin)', () => h.w.startApp()); await ticks(6);
    ok('след admin: главният таб пак отваря графика, История и Администрация се виждат',
      h.doc.getElementById('tab-revaluation').getAttribute('onclick') === "showModule('rev-schedule')" && vis(h, 'tab-history') && vis(h, 'tab-admin'));
  }

  section('4. Известието за подадена бланка — група revaluation');
  {
    const h = env(ADMIN);
    const USERS = [
      { email: 'c@temax.bg', display_name: 'Само Контролинг', notify_groups: ['controlling'], is_regional: false, assigned_stores: [] },
      { email: 'e@temax.bg', display_name: 'Преоценка', notify_groups: ['revaluation'], is_regional: false, assigned_stores: [] },
      { email: 'r@temax.bg', display_name: 'Регионален Шумен', notify_groups: [], is_regional: true, assigned_stores: ['Шумен'] },
      { email: 'x@temax.bg', display_name: 'Регионален друг', notify_groups: [], is_regional: true, assigned_stores: ['Петрич'] }
    ];
    const rec = h.w.rvRecipients(USERS, 'Шумен').map(u => u.display_name);
    ok('получава само групата revaluation (+ регионалния на обекта)', rec.join(',') === 'Преоценка,Регионален Шумен', rec.join(','));
    ok('Админ: групата „Преоценка" е в редактора на групите', h.w.NOTIFY_GROUP_LABELS.revaluation === 'Преоценка' && h.w.NOTIFY_GROUP_USER_ONLY.indexOf('revaluation') >= 0);
    ok('…но НЕ в матрицата (CHECK в базата) и НЕ в реда на отчетите', !h.w.NOTIF_GROUPS.some(g => g.key === 'revaluation') && h.w.NOTIFY_GROUP_ORDER.indexOf('revaluation') < 0);
  }

  report();
})();
