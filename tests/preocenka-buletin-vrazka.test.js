/* „ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА" в Бюлетина ↔ 🏷️ Преоценка (05.11.2026, само данни).

   Данните са КОПИЕ на реалните след DML-а от 05.11.2026 (задача a5e1e6f8…):
     · версия 12.10..12.10 и 19.10..02.11 — linked_module null;
     · версия 09.11..null — linked_module 'revaluation', иначе същата;
     · recurring_tasks.store_hints — жокер за Кърджали, Шумен, Габрово
       (НЕ се версионира — важи за всички седмици);
     · app_settings.revaluation_stores = 'Кърджали, Шумен, Габрово'.

   Какво заковава:
     1. седмица 09.11, управител Шумен: задачата е там, с „🏷️ Преоценка →",
        истински клик → mod-revaluation; жокерът „Жокер за Шумен" с текста;
     2. седмица 09.11, управител Добрич (извън revaluation_stores): задачата
        е там, БЕЗ бутон и БЕЗ жокер;
     3. седмица 02.11, Шумен: без бутон (версията 19.10..02.11 е без
        linked_module). Жокерът СЕ вижда — store_hints е общ за седмиците;
        отбелязано в отчета, тук е заковано като факт, не като желание;
     4. седмица 02.11, Добрич: както преди — без бутон, без жокер.

   Пускане: node tests/preocenka-buletin-vrazka.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w, at) {
  const Real = w.Date, ms = at.getTime();
  class Frozen extends Real { constructor(...a) { if (a.length === 0) super(ms); else super(...a); } static now() { return ms; } }
  w.Date = Frozen;
}

const TID = 'a5e1e6f8-5b47-43ce-bfa4-5ab3ee7f70a6';
const HINT = 'Попълни и подай бланката в 🏷️ Преоценка (бутонът долу). После прикачи тук файла от „📥 Изтегли моята бланка“.';
const STORES3 = 'Кърджали, Шумен, Габрово';

const BASE = { id: TID, title: 'ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА', active: true, due_time: null, task_type: 'file_comment',
  department: 'admin', due_window: false, sort_order: 9, attachments: null,
  description: 'Подаване на файл с преоценка към Елица Гюрова-прикачена бланка', due_weekday: null,
  store_hints: { 'Кърджали': HINT, 'Шумен': HINT, 'Габрово': HINT }, due_weekdays: null, linked_module: null,
  report_groups: ['controlling', 'user:e.gurova@temax.bg'], target_stores: null, allow_postpone: false, allow_not_applicable: false };
const VCONTENT = { title: 'ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА', description: BASE.description, due_weekday: 0, due_weekdays: [0, 1],
  due_window: true, due_time: null, task_type: 'file_comment', department: 'admin', target_stores: null,
  report_groups: ['controlling', 'user:e.gurova@temax.bg'] };
const VERSIONS = [
  Object.assign({ id: 'v1', recurring_task_id: TID, from_monday: '2026-10-12', to_monday: '2026-10-12', linked_module: null }, VCONTENT),
  Object.assign({ id: 'v2', recurring_task_id: TID, from_monday: '2026-10-19', to_monday: '2026-11-02', linked_module: null }, VCONTENT),
  Object.assign({ id: 'v3', recurring_task_id: TID, from_monday: '2026-11-09', to_monday: null, linked_module: 'revaluation' }, VCONTENT)
];

const SHUMEN = { email: 'shumen@temax.bg', display_name: 'Управител Шумен', role: 'manager', store_name: 'Шумен', assigned_stores: [] };
const DOBRICH = { email: 'dobrich@temax.bg', display_name: 'Управител Добрич', role: 'manager', store_name: 'Добрич', assigned_stores: [] };

function settingsRows(settings) {
  return url => {
    const u = decodeURIComponent(url);
    const m = /key=eq\.([^&]+)/.exec(u) || /key=in\.\(([^)]*)\)/.exec(u);
    const keys = m ? m[1].split(',') : Object.keys(settings);
    return keys.filter(k => settings[k] !== undefined).map(k => ({ key: k, value: settings[k] }));
  };
}

/* at — замразеният „сега" (понеделник на седмицата, обед). */
function env(user, at) {
  const h = boot({
    modules: ['bulletin.js', 'revaluation.js', 'revisions.js', 'minusi.js'],
    user: user, confirm: true,
    data: {
      app_settings: settingsRows({ revaluation_stores: STORES3 }),
      users: [user], stores: ['Кърджали', 'Шумен', 'Габрово', 'Добрич'].map(n => ({ name: n })),
      recurring_tasks: [BASE],
      recurring_task_periods: [{ id: 'p1', recurring_task_id: TID, from_monday: '2026-08-31', to_monday: null }],
      recurring_task_skips: [], recurring_task_versions: VERSIONS,
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(at), year: isoWeekYear(at), status: 'published', created_at: isoOf(at),
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: [], bulletin_promotions: [], task_subtasks: [], subtask_completions: [],
      notification_schedules: [], report_snapshots: [],
      revaluation_campaigns: [], revaluation_submissions: [], revaluation_items: [], revaluation_codes: [],
      revision_schedule: [], minus_plants: [], minus_reasons: [], minus_uom_thresholds: [], minus_movements: [], minus_uploads: []
    }
  });
  freezeDate(h.w, at);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [user.store_name];
  h.w.allStoresCache = [user.store_name];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 40); i++) await ticks(); }
const recRow = h => h.doc.querySelector('#mod-bulletin [data-rec-row="' + TID + '"]');
const rvBtns = root => root ? Array.from(root.querySelectorAll('button[data-mod="revaluation"]')) : [];
const calBtns = h => rvBtns(h.doc.getElementById('mod-bulletin')).filter(b => !!b.closest('.bcard'));
const hints = root => root ? Array.from(root.querySelectorAll('details.bul-hint')) : [];
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

async function open(user, at) {
  const h = env(user, at);
  guard('setupTabsForRole', () => h.w.setupTabsForRole());
  guard('loadBulletin()', () => h.w.loadBulletin());
  await settle(80);
  return h;
}

const W46 = new Date(2026, 10, 9, 12, 0, 0);   /* пн 09.11.2026 */
const W45 = new Date(2026, 10, 2, 12, 0, 0);   /* пн 02.11.2026 */

(async function run() {

  section('0. Седмиците — коя версия важи');
  {
    const h = env(SHUMEN, W46);
    const v46 = h.w.recurringVersionForWeek(TID, '2026-11-09', VERSIONS);
    const v45 = h.w.recurringVersionForWeek(TID, '2026-11-02', VERSIONS);
    ok('09.11 → версия v3 (revaluation)', !!v46 && v46.id === 'v3' && v46.linked_module === 'revaluation', v46 && v46.id);
    ok('02.11 → версия v2 (без linked_module)', !!v45 && v45.id === 'v2' && v45.linked_module === null, v45 && v45.id);
    h.close();
  }

  section('1. Седмица 09.11 — управител Шумен');
  {
    const h = await open(SHUMEN, W46);
    const row = recRow(h);
    if (ok('задачата е в Бюлетина', !!row && /ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА/.test(row.textContent))) {
      /* Бутонът към модул го няма в реда на списъка „Постоянни" при НИКОЯ
         задача — той е в картата на деня (календар) и в „План за деня". */
      const b = calBtns(h);
      ok('бутон „🏷️ Преоценка →" в картата на деня (пн / вт)', b.length >= 1 && b.every(x => x.textContent === '🏷️ Преоценка →'), b.map(x => x.textContent).join('|'));
      ok('… картата с бутона е на ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА', b.length >= 1 && b.every(x => /ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА/.test((x.closest('.bcard') || {}).textContent || '')));
      const hs = hints(row);
      ok('точно един жокер — „Жокер за Шумен"', hs.length === 1 && txt(hs[0].querySelector('summary')) === '💡 Жокер за Шумен', hs.map(x => txt(x.querySelector('summary'))).join('|'));
      ok('текстът на жокера', hs.length === 1 && hs[0].textContent.indexOf('📥 Изтегли моята бланка') >= 0);
      if (b.length) {
        realClick(h.w, b[0]); await settle(30);
        ok('клик → mod-revaluation е показан', h.doc.getElementById('mod-revaluation').style.display === 'block');
      }
    }
    h.close();
  }

  section('2. Седмица 09.11 — управител Добрич (извън пилота)');
  {
    const h = await open(DOBRICH, W46);
    const row = recRow(h);
    if (ok('задачата е в Бюлетина (за всички обекти)', !!row && /ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА/.test(row.textContent))) {
      ok('без жокер', hints(row).length === 0, hints(row).length);
      ok('… а задачата е и в календара (за всички обекти)', Array.from(h.doc.querySelectorAll('#mod-bulletin .bcard')).some(c => /ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА/.test(c.textContent)));
    }
    ok('нигде в Бюлетина няма бутон към Преоценка', rvBtns(h.doc.getElementById('mod-bulletin')).length === 0);
    h.close();
  }

  section('3. Седмица 02.11 — Шумен: без бутон (жокерът е общ за седмиците)');
  {
    const h = await open(SHUMEN, W45);
    const row = recRow(h);
    if (ok('задачата е в Бюлетина', !!row)) {
      ok('без бутон „🏷️ Преоценка →" никъде в Бюлетина (v2 е без linked_module)', rvBtns(h.doc.getElementById('mod-bulletin')).length === 0);
      ok('… а задачата е и в календара (не е изчезнала)', Array.from(h.doc.querySelectorAll('#mod-bulletin .bcard')).some(c => /ПРЕОЦЕНКА-ЗАДЪЛЖИТЕЛНА/.test(c.textContent)));
      ok('жокерът СЕ вижда — store_hints не е по седмици', hints(row).length === 1, hints(row).length);
    }
    h.close();
  }

  section('4. Седмица 02.11 — Добрич: непроменено');
  {
    const h = await open(DOBRICH, W45);
    const row = recRow(h);
    if (ok('задачата е в Бюлетина', !!row)) {
      ok('без бутон никъде в Бюлетина', rvBtns(h.doc.getElementById('mod-bulletin')).length === 0);
      ok('без жокер', hints(row).length === 0);
    }
    h.close();
  }

  report();
})();
