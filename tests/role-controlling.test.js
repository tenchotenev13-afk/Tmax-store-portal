/* Роля 'controlling' („Контролинг", 18.10.2026) — вижда САМО подтаба
   „🏷️ Преоценка" и работи в него като ЦО; група 'revaluation' — кой получава
   известието за подадена бланка.
   Минава през ИСТИНСКИЯ startApp() (shared.js + обвивката от notifications.js)
   и през реалните revaluation.js / revisions.js / admin.js.

   Мутационна проверка (18.10.2026) — всеки вариант е пуснат и е паднал:
     K1 rvRecipients обратно на 'controlling'
        → пада „получава само групата revaluation";
     K2 без скриването на табовете в setupTabsForRole
        → пада „видим е САМО #tab-revaluation";
     K3 rsCanSee без 'controlling'
        → пада „#tab-revaluation е видим";
     K4 без връщането на скритите табове при следващ вход (без презареждане)
        → пада „след admin: главният таб пак отваря графика, графикът е видим".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, btn, ok, guard, section, report, ticks } = H;

const CTRL = { email: 'e.gurova@temax.bg', display_name: 'Елица Гюрова', role: 'controlling', store_name: 'Централен офис' };
const ADMIN = { email: 'ten.tenev@temax.bg', display_name: 'Тен Тенев', role: 'admin', store_name: 'Централен офис' };

function env(user) {
  const h = boot({
    modules: ['admin.js', 'stock-returns.js', 'notifications.js', 'revaluation.js', 'revisions.js'],
    user: user,
    data: { revaluation_campaigns: [], revaluation_submissions: [], revaluation_items: [], revaluation_codes: [],
      revision_schedule: [], stores: [], users: [], app_settings: [], transport_orders: [], client_orders: [], docs: [] }
  });
  return h;
}
const visibleTabs = h => Array.from(h.doc.querySelectorAll('#nav-tabs-container .nav-tab')).filter(t => t.style.display !== 'none').map(t => t.id);
const shown = (h, id) => { const m = h.doc.getElementById(id); return !!m && m.style.display === 'block'; };

(async function run() {

  section('1. Вход като Контролинг');
  {
    const h = env(CTRL);
    guard('startApp()', () => h.w.startApp()); await ticks(8);
    const vis = visibleTabs(h);
    ok('видим е САМО #tab-revaluation', vis.length === 1 && vis[0] === 'tab-revaluation', vis.join(','));
    ok('#tab-revaluation е видим', h.doc.getElementById('tab-revaluation').style.display !== 'none');
    ok('разделителите са скрити', Array.from(h.doc.querySelectorAll('#nav-tabs-container .tab-sep')).every(s => s.style.display === 'none'));
    ok('#rvs-schedule скрит', h.doc.getElementById('rvs-schedule').style.display === 'none');
    ok('отвореният модул е revaluation', shown(h, 'mod-revaluation') && !shown(h, 'mod-transport') && !shown(h, 'mod-rev-schedule'));
    ok('rvIsCO() === true', h.w.rvIsCO() === true);
    ok('rvCanSee() === true', h.w.rvCanSee() === true);
    ok('rvIsCoViewer() === true', h.w.rvIsCoViewer() === true);
    ok('rsCanEdit() === false', h.w.rsCanEdit() === false);
    ok('isGlobal() === false (без История / Днес / Чек лист)', h.w.isGlobal() === false);
    ok('Транспорт / Клиентски не са заредени', !h.calls.get.some(u => u.indexOf('/transport_orders') >= 0 || u.indexOf('/client_orders') >= 0));
    realClick(h.w, h.doc.getElementById('tab-revaluation')); await ticks(6);
    ok('клик по главния таб → Преоценка, не графикът', shown(h, 'mod-revaluation') && !shown(h, 'mod-rev-schedule'));
    guard('showModule(rev-schedule)', () => h.w.showModule('rev-schedule')); await ticks(6);
    ok('графикът по друг път → „Нямаш достъп", не пада', h.doc.getElementById('mod-rev-schedule').textContent.indexOf('Нямаш достъп') >= 0);
    guard('showLoginBanner()', () => h.w.showLoginBanner()); await ticks(4);
    const b = h.doc.getElementById('notif-banner');
    ok('без банер при вход', !b || b.style.display === 'none' || !b.innerHTML.trim());
    guard('showModule(revaluation)', () => h.w.showModule('revaluation')); await ticks(6);
    ok('в Преоценка: бутоните на ЦО („📅 График на кампаниите")', !!btn(h.doc.getElementById('mod-revaluation'), 'График на кампаниите'));
  }

  section('2. Вход като admin — без промяна');
  {
    const h = env(ADMIN);
    guard('startApp()', () => h.w.startApp()); await ticks(8);
    const vis = visibleTabs(h);
    ['tab-transport', 'tab-client', 'tab-bulletin', 'tab-history', 'tab-today', 'tab-admin', 'tab-revaluation', 'tab-docs'].forEach(id => {
      ok('admin вижда ' + id, vis.indexOf(id) >= 0, vis.join(','));
    });
    ok('#rvs-schedule видим', h.doc.getElementById('rvs-schedule').style.display !== 'none');
    ok('главният таб отваря графика', h.doc.getElementById('tab-revaluation').getAttribute('onclick') === "showModule('rev-schedule')");
    ok('стартовият модул е Транспорт', shown(h, 'mod-transport'));
    ok('rsCanEdit() === true', h.w.rsCanEdit() === true);
  }

  section('3. Смяна на потребителя без презареждане');
  {
    const h = env(CTRL);
    guard('startApp(controlling)', () => h.w.startApp()); await ticks(6);
    h.w.currentUser = ADMIN;
    guard('startApp(admin)', () => h.w.startApp()); await ticks(6);
    ok('след admin: главният таб пак отваря графика, графикът е видим', h.doc.getElementById('tab-revaluation').getAttribute('onclick') === "showModule('rev-schedule')" &&
      h.doc.getElementById('rvs-schedule').style.display !== 'none' && visibleTabs(h).indexOf('tab-transport') >= 0);
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
