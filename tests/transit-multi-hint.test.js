/* Многодневна задача към Стока на път: подсказката НЕ казва „отмятай в".

   От 08.11.2026 задача с linked_module 'transit' се отмята автоматично
   винаги, и многодневна (transit-auto-always). Подсказките за многодневна
   еднократна задача казваха „отмятай в 📅 Седмичен календар" — за нея това е
   невярно. Сменени САМО за transit (bulMultiHint / bulMultiIconTitle):
     · панелът „Задачи за седмицата": „📅 Дни: … — отмята се автоматично
       (виж 📅 Седмичен календар)";
     · основният списък: „✅ N/N дни отметнати — отмята се автоматично
       (виж 📅 Седмичен календар по-горе)";
     · иконата 📅 (title) и на двете места.
   Друга многодневна задача — старите текстове. Постоянните задачи не са
   засегнати (там Стока на път не е автоматична).

   Истински рендер (renderBulView) като обект, shared.js + bulletin.js в реда
   от index.html.

   Пускане: node tests/transit-multi-hint.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, dayOffset } = H;

const KR = 'Кърджали';
const MANAGER = { email: 'm@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: KR };
const TODAY = dayOffset(0);
/* Втори ден в същата седмица — в неделя +1 би излязъл от бюлетина. */
const IDX = (new Date().getDay() + 6) % 7;
const OTHER = IDX === 0 ? dayOffset(1) : dayOffset(-1);
const DAYS = [OTHER, TODAY].sort();

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

function isoWeekYear(d) {
  const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear();
}
function btask(id, over) {
  return Object.assign({
    id: id, bulletin_id: 'b-1', title: 'Задача ' + id, department: 'warehouse', task_type: 'info',
    description: null, target_stores: null, due_date: DAYS[0], due_dates: DAYS.slice(),
    linked_module: null, auto_complete: false, report_groups: null, attachments: null, sort_order: 1
  }, over || {});
}
function bulEnv(tasks) {
  const h = boot({ modules: ['bulletin.js'], user: MANAGER,
                   data: { users: [{ store_name: KR }], goods_transit: [], task_completions: [] } });
  const w = h.w, now = new Date(), cal = {};
  w.DKEYS.forEach(k => { cal[k] = []; });
  w.curBul = { id: 'b-1', week_number: w.weekNum(now), year: isoWeekYear(now), status: 'published',
               content: { calendar: cal, columns: { trade: [], warehouse: [], admin: [] } } };
  w.bulListCache = []; w.bulComps = []; w.recurringComps = []; w.recurringTasks = [];
  w.allStoresCache = [KR]; w.reportableStoresCache = [KR];
  w.bulTasks = tasks;
  w.loadBulletin = function () {};
  return h;
}
(async function () {
  const T_TR = btask('t-tr', { title: 'СТОКА НА ПЪТ', linked_module: 'transit' });
  const T_OT = btask('t-ot', { title: 'ИНВЕНТАРИЗАЦИЯ', linked_module: 'contacts' });

  const h = bulEnv([T_TR, T_OT]);
  guard('renderBulView()', () => h.w.renderBulView());
  const page = norm(h.doc.getElementById('mod-bulletin') && h.doc.getElementById('mod-bulletin').textContent);

  section('1. Панелът „Задачи за седмицата" — ред „📅 Дни"');
  {
    const label = h.w.taskDueLabel(T_TR);
    const trLine = '📅 Дни: ' + label + ' — отмята се автоматично (виж 📅 Седмичен календар)';
    const otLine = '📅 Дни: ' + h.w.taskDueLabel(T_OT) + ' — отмятай в 📅 Седмичен календар';
    const dniLines = page.split('📅 Дни: ').slice(1).map(x => '📅 Дни: ' + x.slice(0, 70));
    ok('transit: „' + trLine + '"', page.indexOf(trLine) >= 0, dniLines.join(' | '));
    ok('друга многодневна: „' + otLine + '"', page.indexOf(otLine) >= 0);
  }

  section('2. Основният списък — „N/N дни отметнати"');
  {
    const trLine = '✅ 0/2 дни отметнати — отмята се автоматично (виж 📅 Седмичен календар по-горе)';
    const otLine = '✅ 0/2 дни отметнати — отмятай в 📅 Седмичен календар по-горе';
    ok('transit: „' + trLine + '"', page.indexOf(trLine) >= 0);
    ok('друга: „' + otLine + '"', page.indexOf(otLine) >= 0);
    ok('„отмятай в" е само при другата задача (2 пъти — двата реда)',
      (page.match(/отмятай в/g) || []).length === 2, (page.match(/отмятай в/g) || []).length);
  }

  section('3. Иконата 📅 (title)');
  {
    const titles = Array.prototype.map.call(h.doc.querySelectorAll('#mod-bulletin div[title^="Многодневна"]'), d => d.getAttribute('title'));
    ok('и двете места имат икона за двете задачи (4)', titles.length === 4, titles.join(' | '));
    ok('2× „отмята се автоматично" (transit)', titles.filter(t => t === 'Многодневна — отмята се автоматично (виж Седмичен календар)').length === 2, titles.join(' | '));
    ok('2× „отмятай в" (другата)', titles.filter(t => t === 'Многодневна — отмятай в Седмичен календар').length === 2, titles.join(' | '));
  }

  section('4. Помощниците');
  {
    ok('bulMultiHint(transit, auto_complete=false) — автоматично',
      h.w.bulMultiHint({ linked_module: 'transit', auto_complete: false }, '') === 'отмята се автоматично (виж 📅 Седмичен календар)');
    ok('bulMultiHint(без модул) — отмятай в',
      h.w.bulMultiHint({ linked_module: null }, 'по-горе') === 'отмятай в 📅 Седмичен календар по-горе');
    ok('bulMultiHint(oborot) — отмятай в (само transit е сменен)',
      h.w.bulMultiHint({ linked_module: 'oborot' }, '') === 'отмятай в 📅 Седмичен календар');
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
