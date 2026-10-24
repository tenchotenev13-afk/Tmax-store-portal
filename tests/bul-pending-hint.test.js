/* Бюлетин: колко чака обекта по автоматичните задачи — и в календара за деня,
   и в „План за деня", не само в главния списък (решение с Цветелина и
   Миглена, 22.10.2026; 16 от 19 хикса на 21.10 бяха по автоматичните задачи).

   Броячите и правилата НЕ са предмет на теста (те имат свои тестове) — тук
   bulAutoPending се задава наготово и се гледа САМО къде и как се показва.

   ТВЪРДЕНИЯТА (обект, сряда):
   · Разлики (1), „За връщане" diff (3), Зареждане (2 от 3) — забележимият
     надпис (.bul-auto-pending) е и в главния списък, и в календара, и в
     „План за деня", със СЪЩИЯ текст;
   · „Отвори →" е само в главния списък; в календара и плана бутонът към
     модула поема филтъра (без втори бутон);
   · клик → showModule с правилния модул; Разлики → междускладови +
     „Бланки за преглед" + само чакащите (от 24.10.2026, подробно в
     bul-pending-open.test.js); „За връщане" → подтаб diff + „Без актуализация";
     Зареждане → само модулът (филтър там няма);
   · отметната задача → „✓ от …", без бутон и без забележимия вид;
   · брой null (заявката не е минала) → „⏳ отмята се от …", без число, без
     бутон, бутонът към модула — както преди;
   · admin → нито един надпис.

   МУТАЦИИ (пускани ръчно на 23.10.2026, всяка пада):
   M1 надписът махнат от календара (постоянните задачи);
   M2 числото показано и при null (bulAutoHasPending връща true за null);
   M3 „Отвори" води към грешен модул (showModule('bulletin')).

   Пускане: node tests/bul-pending-hint.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks, realClick } = H;

const ANCHOR = (function () {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + (2 - ((d.getDay() + 6) % 7)));
  return d;
})();
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function isoWeekYear(d) { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); return t.getFullYear(); }
function freezeDate(w) {
  const Real = w.Date, ms = ANCHOR.getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}
const WED = isoOf(ANCHOR);
const STORE = 'Карлово';
const USER = { email: 'k@temax.bg', display_name: 'Склад Карлово', role: 'sklad', store_name: STORE };
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function task(id, title, linked, sort) {
  return { id: id, title: title, department: 'admin', task_type: 'info', active: true, sort_order: sort,
    due_weekday: 2, due_weekdays: [2], due_time: '20:00', due_window: false,
    target_stores: null, report_groups: null, linked_module: linked };
}
const TASKS = [
  task('r-sd', 'РАЗЛИКИ ЛОГИСТИЧНИ СКЛАДОВЕ', 'stock-diff', 1),
  task('r-srd', 'СПИСЪК СТОКА ЗА ИЗТЕГЛЯНЕ ПО РАЗЛИКИ', 'stock-returns-diff', 2),
  task('r-sup', 'ЗАРЕЖДАНЕ АРТИКУЛИ НА Л.М.', 'supply', 3)
];
const TXT = {
  'r-sd': '⏳ 1 ред чака отговор',
  'r-srd': '⏳ 3 записа без актуализация от понеделник',
  'r-sup': '⏳ попълнено 2 от 3 бланки'
};
const MOD = { 'r-sd': 'stock-diff', 'r-srd': 'stock-returns', 'r-sup': 'supply' };

function env(user, comps) {
  const h = boot({
    modules: ['transport.js', 'stock-returns.js', 'stock-differences.js', 'bulletin.js', 'today.js', 'report.js'],
    user: user,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      recurring_tasks: TASKS, recurring_task_periods: [], recurring_task_skips: [], recurring_task_versions: [],
      bulletins: () => [{
        id: 'b-1', week_number: h.w.weekNum(ANCHOR), year: isoWeekYear(ANCHOR),
        status: 'published', created_at: WED,
        content: { calendar: (function () { const c = {}; h.w.DKEYS.forEach(k => { c[k] = []; }); return c; })(),
                   columns: { trade: [], warehouse: [], admin: [] } }
      }],
      bulletin_tasks: [], task_completions: comps || [],
      stock_returns: [], stock_differences: [], differences_reports: [], goods_transit: [],
      supply_templates: [], supply_entries: [], supply_no_need: [],
      bulletin_promotions: [], task_subtasks: [], subtask_completions: [], notification_schedules: [], report_snapshots: []
    }
  });
  freezeDate(h.w);
  h.w.bulSelectedId = 'b-1';
  h.w.bulActiveDept = 'admin';
  h.w.reportableStoresCache = [STORE];
  h.w.allStoresCache = [STORE];
  return h;
}
async function settle(n) { for (let i = 0; i < (n || 40); i++) await ticks(); }
/* Зарежда Бюлетина, оставя броячите да се изпълнят, после задава числата
   наготово и пререндира — броячите не са предмет на теста. */
async function view(user, pending, comps) {
  const h = env(user, comps);
  if (!guard('loadBulletin() не хвърля', () => h.w.loadBulletin())) return null;
  await settle();
  Object.keys(pending).forEach(k => { h.w.bulAutoPending[k] = pending[k]; });
  guard('renderBulletin() не хвърля', () => h.w.renderBulletin());
  await settle(4);
  return h;
}
const PENDING = { 'stock-diff': 1, 'stock-returns-diff': 3, 'supply': { done: 2, total: 3 } };
const txt = el => el ? (el.textContent || '').trim() : null;
const mainRow = (h, id) => h.doc.querySelector('#dept-panel-admin [data-rec-row="' + id + '"]');
const planRow = (h, id) => h.doc.querySelector('#sec-dayplan [data-plan-row="' + id + '"]');
const cal = h => h.doc.getElementById('sec-calendar');
const calNotes = h => Array.prototype.map.call((cal(h) || { querySelectorAll: () => [] }).querySelectorAll('.bul-auto-pending'), txt);
const calModBtn = (h, linked) => (cal(h) || h.doc).querySelector('button[data-mod][data-linked="' + linked + '"]');

(async function () {

  section('1. Трите места показват забележимия надпис със същия текст');
  {
    const h = await view(USER, PENDING);
    if (!h) return report();
    ['r-sd', 'r-srd', 'r-sup'].forEach(id => {
      const m = mainRow(h, id);
      ok(id + ': главен списък — надписът', txt(m && m.querySelector('.bul-auto-pending')) === TXT[id], txt(m && m.querySelector('.bul-auto-note')));
      ok(id + ': главен списък — „Отвори →"', !!(m && m.querySelector('button.bul-auto-open')));
      ok(id + ': календар — надписът', calNotes(h).indexOf(TXT[id]) >= 0, calNotes(h).join(' | '));
      const p = planRow(h, id);
      ok(id + ': „План за деня" — надписът', txt(p && p.querySelector('.bul-auto-pending')) === TXT[id], txt(p));
      ok(id + ': „План за деня" — без втори бутон', !!p && !p.querySelector('button.bul-auto-open'));
      const pb = p && p.querySelector('button[data-mod]');
      ok(id + ': „План за деня" — бутонът към модула поема филтъра',
        !!pb && /bulOpenPending/.test(pb.getAttribute('onclick') || ''), pb && pb.getAttribute('onclick'));
    });
    ok('календар — без „Отвори" (бутонът към модула е там)', !cal(h).querySelector('button.bul-auto-open'));
    const cb = calModBtn(h, 'stock-returns-diff');
    ok('календар — бутонът към „За връщане" поема филтъра',
      !!cb && /bulOpenPending/.test(cb.getAttribute('onclick') || ''), cb && cb.getAttribute('onclick'));
    ok('надписът в календара е само в ДНЕШНАТА клетка (по 1 на задача)', calNotes(h).length === 3, calNotes(h).join(' | '));
    ok('класовете на модулите са запазени (bul-auto-diff / -returns / -supply)',
      !!mainRow(h, 'r-sd').querySelector('.bul-auto-note.bul-auto-diff') &&
      !!mainRow(h, 'r-srd').querySelector('.bul-auto-note.bul-auto-returns') &&
      !!mainRow(h, 'r-sup').querySelector('.bul-auto-note.bul-auto-supply'));
  }

  section('2. „Отвори" → правилният модул и филтър');
  {
    for (const id of ['r-sd', 'r-srd', 'r-sup']) {
      const h = await view(USER, PENDING);
      if (!h) continue;
      const seen = [];
      h.w.showModule = function (m) { seen.push(m); };
      h.w.sdFilter = 'pending'; h.w.sdView = 'rows'; h.w.sdDirTab = 'supplier'; h.w.sdOnlyWaiting = false; h.w.srFilter = 'pending'; h.w.srTab = 'complaint';
      const b = mainRow(h, id) && mainRow(h, id).querySelector('button.bul-auto-open');
      if (!ok(id + ': бутонът го има', !!b)) continue;
      realClick(h.w, b);
      ok(id + ': showModule("' + MOD[id] + '") точно веднъж', seen.length === 1 && seen[0] === MOD[id], seen.join(','));
      if (id === 'r-sd') {
        ok('Разлики: подтабът „междускладови"', h.w.sdDirTab === 'interstore', h.w.sdDirTab);
        ok('Разлики: изгледът „Бланки за преглед"', h.w.sdView === 'reports', h.w.sdView);
        ok('Разлики: само чакащите', h.w.sdOnlyWaiting === true, String(h.w.sdOnlyWaiting));
      }
      if (id === 'r-srd') {
        ok('„За връщане": подтабът „По разлики"', h.w.srTab === 'diff', h.w.srTab);
        ok('„За връщане": филтър „Без актуализация"', h.w.srFilter === 'needs', h.w.srFilter);
      }
      if (id === 'r-sup') {
        ok('Зареждане: чуждите филтри не са пипнати', h.w.sdView === 'rows' && h.w.sdOnlyWaiting === false && h.w.srFilter === 'pending');
      }
    }
    /* Бутонът към модула в календара — същото. */
    const h = await view(USER, PENDING);
    if (h) {
      const seen = [];
      h.w.showModule = function (m) { seen.push(m); };
      h.w.srFilter = 'pending'; h.w.srTab = 'complaint';
      const cb = calModBtn(h, 'stock-returns-diff');
      if (ok('бутонът в календара го има', !!cb)) {
        realClick(h.w, cb);
        ok('календар: showModule("stock-returns")', seen.length === 1 && seen[0] === 'stock-returns', seen.join(','));
        ok('календар: подтаб diff + „Без актуализация"', h.w.srTab === 'diff' && h.w.srFilter === 'needs', h.w.srTab + '/' + h.w.srFilter);
      }
    }
  }

  section('3. Отметната задача → „✓ от …", без бутон');
  {
    const comps = [{ id: 'c1', recurring_task_id: 'r-sup', store_name: STORE, completion_date: WED, status: 'done',
      completed_by: 'auto:supply', completed_at: ANCHOR.toISOString() }];
    const h = await view(USER, PENDING, comps);
    if (h) {
      const m = mainRow(h, 'r-sup');
      ok('главен списък: „✓ от Зареждане"', txt(m && m.querySelector('.bul-auto-note')) === '✓ от Зареждане', txt(m && m.querySelector('.bul-auto-note')));
      ok('главен списък: без забележимия вид', !(m && m.querySelector('.bul-auto-pending')));
      ok('главен списък: без „Отвори"', !(m && m.querySelector('button.bul-auto-open')));
      const p = planRow(h, 'r-sup');
      ok('„План за деня": „✓ от Зареждане"', txt(p && p.querySelector('.bul-auto-note')) === '✓ от Зареждане', txt(p));
      const pb = p && p.querySelector('button[data-mod]');
      ok('„План за деня": бутонът към модула — както преди', !!pb && pb.getAttribute('onclick') === 'showModule(this.dataset.mod)', pb && pb.getAttribute('onclick'));
      ok('календар: няма забележим надпис за Зареждане', calNotes(h).indexOf(TXT['r-sup']) < 0, calNotes(h).join(' | '));
    }
  }

  section('4. Брой null (заявката не е минала) → без число, без бутон');
  {
    const h = await view(USER, { 'stock-diff': null, 'stock-returns-diff': 0, 'supply': null });
    if (h) {
      const m = mainRow(h, 'r-sd');
      const n = txt(m && m.querySelector('.bul-auto-note'));
      ok('Разлики при null: „⏳ отмята се от Разлики"', n === '⏳ отмята се от Разлики', n);
      ok('… без нито една цифра', !!n && !/\d/.test(n), n);
      ok('… без забележимия вид и без „Отвори"', !m.querySelector('.bul-auto-pending') && !m.querySelector('button.bul-auto-open'));
      ok('„За връщане" при 0: старият надпис, без число',
        txt(mainRow(h, 'r-srd').querySelector('.bul-auto-note')) === '⏳ отмята се от „За връщане"', txt(mainRow(h, 'r-srd').querySelector('.bul-auto-note')));
      ok('няма нито един забележим надпис', h.doc.querySelectorAll('.bul-auto-pending').length === 0);
      const pb = planRow(h, 'r-sd') && planRow(h, 'r-sd').querySelector('button[data-mod]');
      ok('бутонът към модула — както преди (showModule)', !!pb && pb.getAttribute('onclick') === 'showModule(this.dataset.mod)', pb && pb.getAttribute('onclick'));
    }
  }

  section('5. admin → нито един надпис');
  {
    const h = await view(ADMIN, PENDING);
    if (h) {
      ok('няма .bul-auto-note', h.doc.querySelectorAll('.bul-auto-note').length === 0, String(h.doc.querySelectorAll('.bul-auto-note').length));
      ok('няма „Отвори"', h.doc.querySelectorAll('button.bul-auto-open').length === 0);
      const anyMod = Array.prototype.slice.call(h.doc.querySelectorAll('button[data-mod]'));
      ok('бутоните към модула — с showModule, както преди',
        anyMod.every(b => b.getAttribute('onclick') === 'showModule(this.dataset.mod)'), anyMod.map(b => b.getAttribute('onclick')).join(' | '));
    }
  }

  report();
})();
