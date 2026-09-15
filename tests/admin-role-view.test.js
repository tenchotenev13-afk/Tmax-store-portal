/* Таб „Администрация" по роля.

   От 15.09.2026 табът е за admin и accounting. Accounting вижда вътре САМО
   картата „Известия" — матрицата и „📧 Общи отчети" без „📤 Изпрати сега";
   потребители, магазини, забрани и каталог не се рисуват и заявките за тях
   не тръгват. Магазинските роли не виждат таба.

   Какво заковава тестът (истински клик по бутона на таба):
     1. табът и разделителят: admin и accounting — да; manager, kasa, sklad,
        info, logistics, user — не;
     2. accounting: една видима карта (notif-admin-card); матрицата е там,
        темите/изключенията/насрочените — не; „Общи отчети" с 4 × „Тест до
        мен" и без „Изпрати сега"; нула заявки за users/stores/забрани/каталог;
     3. admin: всички карти, всички заявки, „Изпрати сега" на Дневен и Седмичен;
     4. manager, стигнал до модула през конзолата: нито една карта, нула заявки.

   Пускане: node tests/admin-role-view.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const user = (role, store) => ({ id: 'u-' + role, email: role + '@temax.bg', display_name: role, role: role,
                                 store_name: store || 'Централен офис' });

const TOPICS = [
  { key: 'overdue_tasks', label: 'Просрочени задачи', active: true, schedule_type: 'daily',
    weekdays: [1, 2, 3, 4, 5], scheduled_time: '09:00:00', sort_order: 1 },
  { key: 'today_deadlines', label: 'Срокове днес', active: true, schedule_type: 'daily',
    weekdays: [1, 2, 3, 4, 5], scheduled_time: '08:00:00', sort_order: 2 }
];

function env(u) {
  const h = boot({
    modules: ['bulletin.js', 'email.js', 'admin.js', 'report.js'],
    user: u,
    data: {
      notification_topics: TOPICS,
      notification_matrix: [{ topic_key: 'overdue_tasks', group_key: 'co', channel: 'email', scope: 'all' }],
      notification_overrides: [], notification_schedules: [], users: [], stores: [], order_restrictions: [],
      report_recipients: [{ id: 'r1', name: 'Т', email: 't@temax.bg', daily: true, weekly: true, active: true, scope_stores: null }]
    }
  });
  /* Каталогът брои редовете с HEAD заявка и чете content-range — stub-ът на
     harness-а няма headers. Тук се мери само ДАЛИ се вика. */
  h.catalogCalls = 0;
  h.w.loadCatalogAdmin = function () { h.catalogCalls++; };
  return h;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function settle() { await wait(80); for (let i = 0; i < 4; i++) await ticks(); }
const cards = h => Array.prototype.slice.call(h.doc.querySelectorAll('#mod-admin .card'));
const shown = h => cards(h).filter(c => c.style.display !== 'none');
const hidden = (h, id) => h.doc.getElementById(id).style.display === 'none';
const got = (h, s) => h.calls.get.some(u => u.indexOf(s) >= 0);
const reportBtns = (h, text) => Array.prototype.filter.call(
  h.doc.querySelectorAll('#notif-reports-body button'), b => b.textContent.trim() === text);

async function openAdminTab(h) {
  guard('setupTabsForRole', () => h.w.setupTabsForRole());
  const tab = h.doc.getElementById('tab-admin');
  const okClick = ok('табът е видим за клик', tab.style.display !== 'none', tab.style.display) &&
    guard('клик по „Администрация"', () => realClick(h.w, tab, 'tab-admin'));
  await settle();
  return okClick;
}

(async function () {

  section('1. Табът по роля');
  {
    [['admin', true], ['accounting', true], ['manager', false], ['kasa', false], ['sklad', false],
     ['info', false], ['logistics', false], ['user', false]].forEach(function (p) {
      const h = env(user(p[0], p[1] ? 'Централен офис' : 'Троян'));
      guard('setupTabsForRole(' + p[0] + ')', () => h.w.setupTabsForRole());
      const tab = h.doc.getElementById('tab-admin'), sep = h.doc.getElementById('sep-admin');
      const vis = tab.style.display !== 'none', sepVis = sep.style.display !== 'none';
      ok(p[0] + ': таб „Администрация" ' + (p[1] ? 'се вижда' : 'НЕ се вижда'), vis === p[1], tab.style.display);
      ok(p[0] + ': разделителят е в синхрон', sepVis === p[1], sep.style.display);
      h.close();
    });
  }

  section('2. accounting: само картата „Известия"');
  {
    const h = env(user('accounting'));
    if (await openAdminTab(h)) {
      ok('модулът е отворен', h.doc.getElementById('mod-admin').style.display !== 'none');
      const vis = shown(h);
      ok('една видима карта — „Известия"', vis.length === 1 && vis[0].id === 'notif-admin-card',
        vis.map(c => c.id || (c.querySelector('.card-title') || {}).textContent).join(' | '));
      ok('подзаглавието не говори за потребители', h.doc.querySelector('#mod-admin .pg-sub').textContent === 'Известия и общи отчети.');
      ok('матрицата е нарисувана (2 теми)', h.doc.querySelectorAll('#notif-matrix-body tbody tr').length === 2);
      ok('темите, изключенията и насрочените са скрити',
        hidden(h, 'notif-topics-body') && hidden(h, 'notif-overrides-body') && hidden(h, 'notif-schedules-body'));
      ok('„Общи отчети": 4 × „Тест до мен"', reportBtns(h, 'Тест до мен').length === 4, reportBtns(h, 'Тест до мен').length);
      ok('„Общи отчети": без „Изпрати сега"', reportBtns(h, '📤 Изпрати сега').length === 0);
      ok('нула заявки за списъка потребители', !got(h, 'order=role,email'), h.calls.get.join('\n'));
      ok('нула заявки за магазините', !got(h, '/stores?order=name'));
      ok('нула заявки за забраните', !got(h, 'order_restrictions'));
      ok('каталогът не се зарежда', h.catalogCalls === 0);
      ok('нула заявки за изключенията и насрочените',
        !got(h, 'notification_overrides') && !got(h, 'notification_schedules'));
    }
    h.close();
  }

  section('3. admin: всичко');
  {
    const h = env(user('admin'));
    if (await openAdminTab(h)) {
      ok('всички карти са видими', shown(h).length === cards(h).length && cards(h).length >= 5,
        shown(h).length + '/' + cards(h).length);
      ok('подзаглавието е старото', h.doc.querySelector('#mod-admin .pg-sub').textContent === 'Управление на магазини и потребители.');
      ok('потребителите се теглят (с изричен select=)', h.calls.get.some(u => u.indexOf('order=role,email&select=id,') >= 0));
      ok('магазините се теглят', got(h, '/stores?order=name'));
      ok('забраните се теглят', got(h, 'order_restrictions'));
      ok('каталогът се зарежда', h.catalogCalls === 1);
      ok('темите, изключенията и насрочените са видими',
        !hidden(h, 'notif-topics-body') && !hidden(h, 'notif-overrides-body') && !hidden(h, 'notif-schedules-body'));
      ok('„Изпрати сега" на Дневен и Седмичен', reportBtns(h, '📤 Изпрати сега').length === 2);
    }
    h.close();
  }

  section('4. manager през конзолата: нищо');
  {
    const h = env(user('manager', 'Троян'));
    guard('setupTabsForRole', () => h.w.setupTabsForRole());
    ok('табът е скрит', h.doc.getElementById('tab-admin').style.display === 'none');
    guard('showModule("admin") направо', () => h.w.showModule('admin'));
    await settle();
    ok('нито една видима карта', shown(h).length === 0, shown(h).map(c => c.id).join(' | '));
    ok('нула заявки за users / notification_ / report_recipients',
      !got(h, '/users') && !got(h, 'notification_') && !got(h, 'report_recipients'), h.calls.get.join('\n'));
    ok('каталогът не се зарежда', h.catalogCalls === 0);
    h.close();
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
