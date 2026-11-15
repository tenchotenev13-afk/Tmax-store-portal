/* „🎨 Зареждане" — под-таб на „Ревизии и преоценка" (15.11.2026, сесия
   zarezhdane-v-revizii). Решение на Тенчо по предложение на Теодор (30.10):
   бутонът tps-supply излиза от под-лентата на Транспорт, на негово място е
   rvs-supply в под-лентата на Ревизии — след „📅 График ревизии", преди
   „🏷️ Преоценка". Видим по rsCanSee() (revisions.js), без отделен ключ.

   1. manager и supply: rvs-supply се вижда, редът е График, Зареждане,
      Преоценка, Минуси; реален клик → mod-supply, под-лентата на Ревизии
      видима, rvs-supply и tab-revaluation активни, Транспорт — скрит и
      неактивен, в под-лентата му няма tps-supply.
   2. Роли извън Ревизии (kasa, user, logistics, info, marketing): бутонът
      скрит, табът Ревизии скрит. В базата (15.11.2026) за 60 дни никой от тях
      не е писал в supply_entries / supply_store_notes / supply_no_need.
   3. Бюлетин: бутонът „🎨 Зареждане →" от задача с linked_module 'supply'
      стига до същото място (реалният showModule от shared.js).

   Мутации, които трябва да го съборят (проверени при писането):
   - rvs-supply не се показва за manager (setupTabsForRole);
   - showModule('supply') маркира tab-transport / показва под-лентата на Транспорт;
   - tps-supply пак в под-лентата на Транспорт.

   Пускане: node tests/supply-in-revisions.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, realClick, ok, guard, section, report, ticks } = H;

const STORE = 'Троян';
const MODULES = ['bulletin.js', 'supply.js', 'revisions.js', 'revaluation.js', 'minusi.js'];

function env(role) {
  return boot({
    modules: MODULES,
    user: { email: 'x-' + role + '@temax.bg', display_name: 'Тест ' + role, role: role,
      store_name: (role === 'manager' || role === 'sklad' || role === 'kasa' || role === 'user') ? STORE : 'Централен офис' },
    data: {}
  });
}

function vis(h, id) { const el = h.doc.getElementById(id); return !!el && el.style.display !== 'none'; }
function active(h, id) { const el = h.doc.getElementById(id); return !!el && el.classList.contains('active'); }

/* Общите проверки след отваряне на Зареждане — от под-лентата или от Бюлетина. */
function checkLanded(h, who) {
  ok(who + ': #mod-supply е видим', h.doc.getElementById('mod-supply').style.display === 'block');
  ok(who + ': под-лентата на Ревизии е видима', h.doc.getElementById('rev-subnav').style.display === 'block');
  ok(who + ': rvs-supply е активен', active(h, 'rvs-supply'));
  ok(who + ': „📅 График ревизии" не е активен', !active(h, 'rvs-schedule'));
  ok(who + ': горният таб tab-revaluation е активен', active(h, 'tab-revaluation'));
  ok(who + ': горният таб tab-transport НЕ е активен', !active(h, 'tab-transport'));
  ok(who + ': под-лентата на Транспорт е скрита', h.doc.getElementById('transport-pallets-subnav').style.display === 'none');
  ok(who + ': в под-лентата на Транспорт няма tps-supply',
    !h.doc.querySelector('#transport-pallets-subnav #tps-supply') && !h.doc.getElementById('tps-supply'));
}

(async function run() {
  section('1. manager и supply — под-бутонът и реален клик');
  for (const role of ['manager', 'supply']) {
    const h = env(role);
    h.w.setupTabsForRole(); await ticks(4);
    ok(role + ': горният таб Ревизии се вижда', vis(h, 'tab-revaluation'));
    ok(role + ': rvs-supply се вижда', vis(h, 'rvs-supply'));
    const ids = Array.from(h.doc.querySelectorAll('#rev-subnav button')).map(b => b.id);
    const want = ['rvs-schedule', 'rvs-supply', 'rvs-revaluation', 'rvs-minusi'];
    ok(role + ': редът е ' + want.join(', '), JSON.stringify(ids) === JSON.stringify(want), ids.join(','));
    ok(role + ': името е „🎨 Зареждане"', h.doc.getElementById('rvs-supply').textContent.trim() === '🎨 Зареждане');
    /* Стартово състояние: стоим в Транспорт — кликът трябва да го смени. */
    h.w.showModule('transport'); await ticks(2);
    ok(role + ': предпоставка — Транспорт е активен преди клика', active(h, 'tab-transport'));
    realClick(h.w, h.doc.getElementById('rvs-supply')); await ticks(6);
    checkLanded(h, role);
  }

  section('2. Роли извън Ревизии — без Зареждане');
  for (const role of ['kasa', 'user', 'logistics', 'info', 'marketing']) {
    const h = env(role);
    h.w.setupTabsForRole(); await ticks(4);
    ok(role + ': табът Ревизии е скрит', !vis(h, 'tab-revaluation'));
    ok(role + ': rvs-supply е скрит', !vis(h, 'rvs-supply'));
    ok(role + ': tps-supply го няма', !h.doc.getElementById('tps-supply'));
    ok(role + ': linkedModuleAllowed(supply) = false', h.w.linkedModuleAllowed('supply') === false);
  }

  section('3. Бюлетин — „🎨 Зареждане →" от задача с linked_module supply');
  {
    const h = env('manager');
    const w = h.w;
    h.w.setupTabsForRole(); await ticks(4);
    const yr = new Date().getFullYear();
    const wk = w.weekNum(new Date());
    const monday = w.toLocalISO(w.weekDays(wk, yr)[0]);
    const cal = {}; w.DKEYS.forEach(k => { cal[k] = []; });
    w.curBul = { id: 'b-1', week_number: wk, year: yr, status: 'published',
      content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
    w.bulListCache = []; w.bulComps = []; w.recurringComps = [];
    w.allStoresCache = [STORE];
    w.recurringTasks = [];
    w.bulTasks = [{ id: 't-1', title: 'ЗАРЕЖДАНЕ', department: 'trade',
      due_dates: [monday], target_stores: [STORE], linked_module: 'supply' }];
    if (guard('renderBulView() не хвърля', () => w.renderBulView())) {
      const b = Array.from(h.doc.querySelectorAll('button[data-mod="supply"]'))[0];
      if (ok('бутонът data-mod="supply" съществува', !!b)) {
        ok('носи „🎨 Зареждане"', b.textContent.indexOf('🎨 Зареждане') >= 0, b.textContent);
        realClick(w, b); await ticks(6);
        checkLanded(h, 'от Бюлетина');
      }
    }
  }

  report();
})();
