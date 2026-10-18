/* Видимост на табовете по роли (решение на Тенчо, 18.10.2026), през
   ИСТИНСКИЯ startApp(): shared.js + checklist.js + revaluation.js +
   revisions.js + notifications.js. is_regional идва след входа
   (rolesLoadRegional → users id=eq.<id>), затова „Днес" за регионален
   accounting се проверява и ПРЕДИ, и СЛЕД отговора.

   Правилата: История — admin, accounting; Днес — admin, controlling,
   accounting само при is_regional; Администрация — само admin; Каса —
   kasa, admin, manager; Чек лист — admin; „Ревизии и преоценка" — admin,
   accounting, supply, manager, sklad, controlling. Общите табове —
   всички. isGlobal() НЕ е пипан.

   Мутационна проверка (18.10.2026) — всеки вариант е пуснат и е паднал:
     T1 logistics върнат в История → пада „logistics: История";
     T2 accounting върнат в Администрация → пада „accounting: Администрация";
     T3 is_regional игнориран (всеки accounting вижда Днес)
        → пада „accounting: Днес".
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const COMMON = ['tab-transport', 'tab-client', 'tab-bulletin', 'tab-docs', 'tab-contacts', 'tab-reference'];
/* [роля, is_regional, Каса, История, Днес, Чек лист, Администрация, Ревизии] */
const MATRIX = [
  ['admin',       false, 1, 1, 1, 1, 1, 1],
  ['accounting',  false, 0, 1, 0, 0, 0, 1],
  ['accounting',  true,  0, 1, 1, 0, 0, 1],
  ['logistics',   false, 0, 0, 0, 0, 0, 0],
  ['manager',     false, 1, 0, 0, 0, 0, 1],
  ['sklad',       false, 0, 0, 0, 0, 0, 1],
  ['kasa',        false, 1, 0, 0, 0, 0, 0],
  ['supply',      false, 0, 0, 0, 0, 0, 1],
  ['marketing',   false, 0, 0, 0, 0, 0, 0],
  ['info',        false, 0, 0, 0, 0, 0, 0],
  ['user',        false, 0, 0, 0, 0, 0, 0],
  ['controlling', false, 0, 0, 1, 0, 0, 1]
];
const IDS = ['tab-kasa', 'tab-history', 'tab-today', 'tab-checklist', 'tab-admin', 'tab-revaluation'];
const NAMES = { 'tab-kasa': 'Каса', 'tab-history': 'История', 'tab-today': 'Днес', 'tab-checklist': 'Чек лист', 'tab-admin': 'Администрация', 'tab-revaluation': 'Ревизии' };

function env(role, regional) {
  const store = ['manager', 'sklad', 'kasa', 'info'].indexOf(role) >= 0 ? 'Шумен' : 'Централен офис';
  const me = { id: 'u-' + role, email: role + '@temax.bg', display_name: role, role: role, store_name: store, assigned_stores: regional ? ['Шумен', 'Добрич'] : [] };
  return boot({
    modules: ['checklist.js', 'notifications.js', 'revaluation.js', 'revisions.js'],
    user: me,
    data: {
      users: url => url.indexOf('id=eq.') >= 0 ? [{ is_regional: !!regional, assigned_stores: me.assigned_stores }] : [],
      app_settings: [], transport_orders: [], client_orders: [], docs: [], revaluation_campaigns: [], revision_schedule: [], stores: []
    }
  });
}
const vis = (h, id) => { const el = h.doc.getElementById(id); return !!el && el.style.display !== 'none'; };

(async function run() {

  section('1. Матрица роля → видими табове');
  for (const row of MATRIX) {
    const [role, regional] = row;
    const label = role + (regional ? '+is_regional' : '');
    const h = env(role, regional);
    guard(label + ': startApp()', () => h.w.startApp());
    const todayBefore = vis(h, 'tab-today');
    await ticks(8);
    IDS.forEach((id, i) => {
      const want = !!row[2 + i];
      ok(label + ': ' + NAMES[id] + (want ? ' — да' : ' — не'), vis(h, id) === want, h.doc.getElementById(id).style.display);
    });
    ok(label + ': разделителят на Администрация е в синхрон', vis(h, 'sep-admin') === !!row[6]);
    const commonMissing = COMMON.filter(id => !vis(h, id));
    ok(label + ': общите табове са видими', commonMissing.length === 0, commonMissing.join(','));
    if (role === 'accounting' && regional) ok('accounting+is_regional: Днес е скрит ДО отговора за is_regional', todayBefore === false);
    ok(label + ': isGlobal() непроменен', h.w.isGlobal() === (['admin', 'accounting', 'logistics'].indexOf(role) >= 0));
    h.close();
  }

  section('2. Контролинг — под-табовете и стартът');
  {
    const h = env('controlling', false);
    guard('startApp()', () => h.w.startApp()); await ticks(8);
    ok('controlling: „📅 График ревизии" — да', vis(h, 'rvs-schedule'));
    ok('controlling: „🏷️ Преоценка" — да', vis(h, 'rvs-revaluation'));
    ok('controlling: стартира в Преоценка', h.doc.getElementById('mod-revaluation').style.display === 'block');
    ok('controlling: главният таб отваря Преоценка', h.doc.getElementById('tab-revaluation').getAttribute('onclick') === "showModule('revaluation')");
    guard('showModule(rev-schedule)', () => h.w.showModule('rev-schedule')); await ticks(6);
    ok('controlling: графикът се вижда (не „Нямаш достъп")', h.doc.getElementById('mod-rev-schedule').textContent.indexOf('Нямаш достъп') < 0);
    ok('controlling: графикът е само за гледане (rsCanEdit === false)', h.w.rsCanEdit() === false);
    ok('controlling: is_regional е слят в currentUser', h.w.currentUser.is_regional === false);
  }

  section('3. Регионален accounting — currentUser след входа');
  {
    const h = env('accounting', true);
    guard('startApp()', () => h.w.startApp()); await ticks(8);
    ok('is_regional и assigned_stores са в currentUser', h.w.currentUser.is_regional === true && h.w.currentUser.assigned_stores.join(',') === 'Шумен,Добрич');
    ok('roleRegionalScope() = зачислените', JSON.stringify(h.w.roleRegionalScope()) === '["Шумен","Добрич"]');
    ok('заявката е само за собствения ред и безопасни колони',
      h.calls.get.some(u => u.indexOf('/users?id=eq.u-accounting&select=is_regional,assigned_stores') >= 0) &&
      !h.calls.get.some(u => u.indexOf('password') >= 0 || u.indexOf('hash') >= 0));
  }

  report();
})();
