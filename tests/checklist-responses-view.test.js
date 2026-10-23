/* Чек лист — контролингът вижда становищата на обектите (етап 3А, 23.10.2026).

   Какво заковава файлът:
   1. CONTROLLER вижда 📝 САМО в клетката със становище; клетка без
      становище — без иконка; textContent на .cl-val остава „не".
   2. Реален клик по 📝 → прозорче само за четене: обект, колона, текст,
      кой/кога; клетката НЕ се завърта (нищо не се записва).
   3. Заявката за становищата е за показаната седмица.

   Пускане:  node tests/checklist-responses-view.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 42;

const METRICS = [
  ['revizia_953',    'ревизия',        'yes_no'],
  ['spravka_minusi', 'справка минуси', 'yes_no'],
  ['razhodi',        'разходи',        'yes_no']
].map(function (a, i) {
  return { key: a[0], label: a[1], sublabel: '', value_type: a[2], source: 'manual',
           sort_order: i + 1, active: true, deadline_day: null };
});
const KEYS = METRICS.map(function (m) { return m.key; });

const USERS = ['Враца', 'Шумен', 'Централен офис'].map(function (s) { return { store_name: s }; });

const CONTROLLER = { id: 'u-3', email: 'm.pavlova@temax.bg', display_name: 'М. Павлова', role: 'accounting',
                     store_name: 'Централен офис', notify_groups: ['controlling'] };

function cl(store, key, v) {
  return { year: YEAR, week_number: WEEK, store_name: store, metric_key: key,
           portal_value: null, control_value: v, control_num: null, comment: null };
}
const ROWS = [
  cl('Шумен', 'revizia_953', 'ne'),
  cl('Шумен', 'spravka_minusi', 'ne'),
  cl('Враца', 'revizia_953', 'ne'),
  cl('Враца', 'razhodi', 'da')
];
const RESPONSES = [{ id: 'r-1', year: YEAR, week_number: WEEK, store_name: 'Шумен', metric_key: 'revizia_953',
                     text: 'Протоколът е при РУ <b>утре</b>', created_by: 'Шумен',
                     created_at: '2026-10-21T07:00:00Z', updated_at: '2026-10-21T07:05:00Z' }];

function env(user) {
  const h = boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: user || CONTROLLER,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: ROWS,
      weekly_checklist_sends: [],
      weekly_checklist_responses: RESPONSES,
      recurring_tasks: [], recurring_task_versions: [], recurring_task_periods: [],
      recurring_task_skips: [], task_completions: [], stock_returns: [], goods_transit: [],
      differences_reports: [], stock_differences: []
    }
  });
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  return h;
}

function cellOf(h, store, key) {
  const tr = Array.prototype.slice.call(h.doc.querySelectorAll('#checklist-table tbody tr')).filter(function (x) {
    return x.querySelector('td').textContent.trim() === store;
  })[0];
  return tr ? tr.querySelectorAll('td')[KEYS.indexOf(key) + 1] : null;
}
function writes(h) { return h.calls.post.length + h.calls.patch.length; }

(async function () {

  section('1. 📝 само в клетката със становище');
  {
    const h = env();
    h.w.loadChecklist(); await ticks(); await ticks();
    const q = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist_responses') >= 0; })[0] || '';
    ok('становищата се искат за седмица 42/2026', /year=eq\.2026/.test(q) && /week_number=eq\.42/.test(q), q);
    const all = h.doc.querySelectorAll('#checklist-table .cl-resp');
    ok('точно една 📝 в мрежата', all.length === 1, String(all.length));
    const c = cellOf(h, 'Шумен', 'revizia_953');
    ok('📝 е в Шумен / ревизия', !!c && !!c.querySelector('.cl-resp'));
    ok('Шумен / справка минуси („не" без становище) — без 📝', !cellOf(h, 'Шумен', 'spravka_minusi').querySelector('.cl-resp'));
    ok('Враца / ревизия — без 📝', !cellOf(h, 'Враца', 'revizia_953').querySelector('.cl-resp'));
    ok('textContent на стойността остава „не"', c.querySelector('.cl-val').textContent.trim() === 'не',
       c.querySelector('.cl-val').textContent);
    ok('💬 си остава за контролинга', !!c.querySelector('.cl-cmt'));
    h.close();
  }

  section('2. Клик по 📝 → прозорче само за четене');
  {
    const h = env();
    h.w.loadChecklist(); await ticks(); await ticks();
    const before = writes(h);
    const c = cellOf(h, 'Шумен', 'revizia_953');
    c.querySelector('.cl-resp').click(); await ticks();
    const ov = h.doc.getElementById('cl-resp-ov');
    ok('прозорчето се отваря', !!ov);
    const t = ov ? ov.textContent : '';
    ok('обект и колона', t.indexOf('Шумен') >= 0 && t.indexOf('ревизия') >= 0, t);
    const view = h.doc.getElementById('cl-resp-view');
    ok('текстът дословно (без HTML)', !!view && view.textContent === 'Протоколът е при РУ <b>утре</b>' && !view.querySelector('b'),
       view ? view.innerHTML : '—');
    ok('кой / кога: „Шумен · 21.10 10:05"', t.indexOf('Шумен · 21.10 10:05') >= 0, t);
    ok('прозорчето няма поле за писане', !ov.querySelector('textarea') && !ov.querySelector('input'));
    ok('кликът не завърта клетката (нищо не се записва)', writes(h) === before, String(writes(h) - before));
    ok('клетката е пак „не"', cellOf(h, 'Шумен', 'revizia_953').querySelector('.cl-val').textContent.trim() === 'не');
    h.doc.getElementById('cl-resp-close').click();
    ok('„Затвори" маха прозорчето', !h.doc.getElementById('cl-resp-ov'));

    /* Клик по самата клетка (не по 📝) си върти стойността както досега. */
    cellOf(h, 'Шумен', 'spravka_minusi').click(); await ticks();
    ok('клик по клетка без 📝 записва както досега', writes(h) === before + 1, String(writes(h) - before));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
