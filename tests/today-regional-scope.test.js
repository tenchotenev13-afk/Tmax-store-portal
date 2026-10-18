/* „Днес" за регионален accounting (18.10.2026): САМО зачислените обекти —
   без „всички", без чужди; процентът му НЕ се записва като общия дневен
   snapshot (иначе презаписва тенденцията на компанията); „Снимки за преглед"
   — само от неговите обекти. admin — всички, snapshot-ът се записва.
   Средата е от today-current-week-bulletin.test.js (замразен часовник).

   Мутационна проверка (18.10.2026) — всеки вариант е пуснат и е паднал:
     D1 обектите не се филтрират по roleRegionalScope → пада „обектите = зачислените";
     D2 „Всички обекти" остава за регионалния → пада „без „Всички обекти"";
     D3 snapshot-ът се записва и за регионалния → пада „НЕ записва общия snapshot".
*/
'use strict';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const ADMIN = { id: 'u-a', email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const REG = { id: 'u-r', email: 't.ivanova@temax.bg', display_name: 'Т. Иванова', role: 'accounting', store_name: 'Централен офис',
  is_regional: true, assigned_stores: ['Шумен', 'Добрич'] };
const B = { id: 'b-42', week_number: 42, year: 2026, status: 'published', created_at: '2026-10-08T10:00:00Z' };
const mkContent = w => { const c = { calendar: {}, columns: { trade: [], warehouse: [], admin: [] } }; w.DKEYS.forEach(k => { c.calendar[k] = []; }); return c; };

function env(user) {
  const h = boot({ modules: ['bulletin.js', 'today.js', 'report.js'], user: user, data: {} });
  const w = h.w;
  const Real = w.Date, fixed = new Real('2026-10-14T12:00:00').getTime();
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  };
  const all = [Object.assign({ content: mkContent(w) }, B)];
  h.setData('bulletins', () => all);
  /* една ежедневна постоянна задача — иначе таблото е „Няма задачи“ без избор на обект */
  h.setData('recurring_tasks', [{ id: 'r-1', title: 'ВЕЧЕРЕН ОБОРОТ', department: 'trade', task_type: 'info', active: true, sort_order: 1,
    due_weekdays: [0, 1, 2, 3, 4, 5, 6], due_weekday: 2, due_time: null, due_window: false, target_stores: null, report_groups: null, linked_module: null, description: null }]);
  h.setData('bulletin_tasks', []); h.setData('task_completions', []);
  h.setData('users', [{ store_name: 'Добрич' }, { store_name: 'Кърджали' }, { store_name: 'Шумен' }, { store_name: 'Троян' }]);
  h.setData('report_snapshots', []);
  ['differences_reports', 'stock_returns', 'kasa_storno', 'kasa_zoborot', 'goods_transit', 'transport_pallets',
    'stock_differences', 'client_orders', 'transport_orders', 'daily_turnover', 'report_recipients', 'recurring_task_skips',
    'recurring_task_versions'].forEach(t => h.setData(t, []));
  return h;
}
async function dash(h) { h.w.loadTodayDashboard(); for (let i = 0; i < 8; i++) await ticks(); }
const opts = h => Array.from(h.doc.querySelectorAll('#mod-today select option')).map(o => o.value);
const snapWrites = h => h.calls.post.filter(p => p.table === 'report_snapshots').length + h.calls.patch.filter(p => p.table === 'report_snapshots').length;

(async function run() {

  section('1. Регионален accounting — само своите обекти');
  {
    const h = env(REG);
    guard('loadTodayDashboard()', () => {}); await dash(h);
    const o = opts(h);
    ok('обектите = зачислените (Добрич, Шумен)', o.join(',') === 'Добрич,Шумен', o.join(','));
    ok('без „Всички обекти"', o.indexOf('all') < 0);
    ok('избран е първият му обект', h.w.todayFilterStore === 'Добрич', h.w.todayFilterStore);
    const txt = h.doc.getElementById('mod-today').textContent;
    ok('чужди обекти не се виждат (Кърджали, Троян)', txt.indexOf('Кърджали') < 0 && txt.indexOf('Троян') < 0);
    ok('НЕ записва общия snapshot (report_snapshots)', snapWrites(h) === 0, snapWrites(h));
    const sel = h.doc.querySelector('#mod-today select');
    sel.value = 'Шумен'; guard('todayFilterChange(Шумен)', () => h.w.todayFilterChange(sel));
    ok('смяна към свой обект', h.w.todayFilterStore === 'Шумен');
    guard('todayFilterChange(чужд)', () => h.w.todayFilterChange({ value: 'Троян' }));
    ok('смяна към чужд обект → отказ', h.w.todayFilterStore === 'Шумен');
    guard('todayFilterChange(all)', () => h.w.todayFilterChange({ value: 'all' }));
    ok('„all" отвън → отказ', h.w.todayFilterStore === 'Шумен');
  }

  section('2. Снимки за преглед — само от своите обекти');
  {
    const h = env(REG); await dash(h);
    h.w.todayLoadPhotoQueue = cb => cb([
      { title: 'А', store: 'Шумен', photos: [{ url: 'x/1.jpg', filename: '1.jpg' }], completedAt: '2026-10-14T08:00:00Z' },
      { title: 'Б', store: 'Троян', photos: [{ url: 'x/2.jpg', filename: '2.jpg' }], completedAt: '2026-10-14T09:00:00Z' }
    ]);
    guard('todayTogglePhotoQueue()', () => h.w.todayTogglePhotoQueue()); await ticks(3);
    const st = (h.w.todayPhotosCache || []).map(e => e.store);
    ok('само Шумен, без Троян', st.join(',') === 'Шумен', st.join(','));
  }

  section('3. admin — всички, със snapshot');
  {
    const h = env(ADMIN); await dash(h);
    const o = opts(h);
    ok('„Всички обекти" + 4 обекта', o[0] === 'all' && o.length === 5, o.join(','));
    ok('по подразбиране — всички', h.w.todayFilterStore === 'all');
    ok('записва дневния snapshot', snapWrites(h) === 1, snapWrites(h));
  }

  report();
})();
