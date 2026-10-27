/* Чек лист — жива и замразена седмица (checklist-live-calc, етап 2; 26.10.2026).

   Решение на Тенчо 26.10: стойностите не се пазят като снимка от последното
   отваряне на таба. Незатворената седмица се показва ЖИВО от
   checklist_portal_values() (RPC) — нищо не се пише; затворената
   (weekly_checklist_freezes) — от записаното в weekly_checklist.

   Какво заковава файлът:
   1. незатворена → ТОЧНО 1 RPC rpc/checklist_portal_values за показаната
      седмица, НУЛА записа в weekly_checklist при отваряне; живото бие
      старото portal_value; живо NULL изпразва клетката; живо без ред в базата
      → клетка с „Стойност от портала"; ръчното на контролинга пак бие;
   2. затворена → 0 RPC, клетките са записаното;
   3. провал на RPC → червен toast, мрежата е там със записаното;
   4. отметка на контролинга върху жива клетка → upsert само на control_value
      (+ updated_at, updated_by), без portal_value; отговорът на upsert-а НЕ
      заменя живото portal_value в паметта (на затворена седмица — заменя);
   5. режим на обекта (manager Шумен), изпратена и незатворена седмица →
      1 RPC, само неговият ред, 0 записа.

   Пускане:  node tests/checklist-live-frozen.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 43;
const METRICS = [
  ['revizia_953',    'ревизия',        'yes_no',  'recurring:74da41e4-494f-48cc-a434-79bfc04fc243'],
  ['spravka_minusi', 'справка минуси', 'yes_no',  'recurring:03c44560-9572-4274-ad53-5228d61b4de7'],
  ['stoka_na_pat',   'стока на път',   'yes_no',  'module:transit'],
  ['razhodi',        'разходи',        'yes_no',  'manual']
].map(function (a, i) {
  return { key: a[0], label: a[1], sublabel: '', value_type: a[2], source: a[3],
           sort_order: i + 1, active: true, deadline_day: null };
});
const KEYS = METRICS.map(function (m) { return m.key; });
const USERS = ['Враца', 'Габрово', 'Шумен', 'Централен офис'].map(function (s) { return { store_name: s }; });
const ADMIN = { id: 'u-1', email: 'm.pavlova@temax.bg', display_name: 'М. Павлова', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { id: 'u-2', email: 'managershumen@temax.bg', display_name: 'Шумен', role: 'manager', store_name: 'Шумен' };

function cl(store, key, f) {
  return Object.assign({ id: 'r-' + store + key, year: YEAR, week_number: WEEK, store_name: store, metric_key: key,
                         portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
/* В базата: Враца/ревизия — старо „ne" (снимка); Габрово/минуси — старо „2/5";
   Шумен/ревизия — ръчно „da" от контролинга. */
const ROWS = [
  cl('Враца', 'revizia_953', { portal_value: 'ne' }),
  cl('Габрово', 'spravka_minusi', { portal_value: '2/5' }),
  cl('Шумен', 'revizia_953', { portal_value: 'ne', control_value: 'da' })
];
/* Живо: Враца/ревизия → da; Габрово/минуси → NULL (напр. изключена задача);
   Враца/стока на път → 5/7 (ред в базата няма); Шумен/ревизия → ne. */
const LIVE = [
  { store_name: 'Враца',   metric_key: 'revizia_953',    value: 'da' },
  { store_name: 'Враца',   metric_key: 'spravka_minusi', value: '4/5' },
  { store_name: 'Враца',   metric_key: 'stoka_na_pat',   value: '5/7' },
  { store_name: 'Габрово', metric_key: 'spravka_minusi', value: null },
  { store_name: 'Шумен',   metric_key: 'revizia_953',    value: 'ne' },
  { store_name: 'Шумен',   metric_key: 'stoka_na_pat',   value: '9/9' }
];

function env(opts) {
  opts = opts || {};
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: opts.user || ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: JSON.parse(JSON.stringify(ROWS)),
      weekly_checklist_freezes: opts.frozen ? [{ year: YEAR, week_number: WEEK }] : [],
      weekly_checklist_sends: opts.sends || [],
      weekly_checklist_responses: [],
      rpc: LIVE,
      recurring_tasks: [], recurring_task_versions: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], goods_transit: [], stock_returns: [], differences_reports: [], stock_differences: []
    }
  };
  if (opts.fail) b.fail = opts.fail;
  const h = boot(b);
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  return h;
}
async function open(h) { h.w.loadChecklist(); await ticks(); await ticks(); }

function rpcCalls(h) { return h.calls.get.filter(function (u) { return u.indexOf('/rpc/checklist_portal_values') >= 0; }); }
function clWrites(h) { return h.calls.post.concat(h.calls.patch).filter(function (p) { return (p.url || '').indexOf('/weekly_checklist?') >= 0; }); }
function cellOf(h, store, key) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).filter(function (x) {
    return x.querySelector('td').textContent.trim() === store;
  })[0];
  return tr ? tr.querySelectorAll('td')[KEYS.indexOf(key) + 1] : null;
}
function cellVal(h, store, key) {
  const td = cellOf(h, store, key);
  const v = td && td.querySelector('.cl-val');
  return v ? v.textContent.trim() : '';
}
function cellTitle(h, store, key) {
  const td = cellOf(h, store, key);
  const v = td && td.querySelector('.cl-val');
  return v ? (v.getAttribute('title') || '') : '';
}
function memRow(h, store, key) {
  return h.w.checklistRows.filter(function (r) { return r.store_name === store && r.metric_key === key; })[0] || null;
}

(async function () {

  section('1. Незатворена седмица → живо, без запис');
  {
    const h = env();
    await open(h);
    const rc = rpcCalls(h);
    ok('ТОЧНО 1 RPC', rc.length === 1, JSON.stringify(rc));
    ok('RPC е за p_year=2026 и p_week=43', /p_year=2026/.test(rc[0] || '') && /p_week=43/.test(rc[0] || ''), rc[0]);
    ok('НУЛА записа в weekly_checklist при отваряне', clWrites(h).length === 0, String(clWrites(h).length));
    ok('checklistWeekFrozen === false', h.w.checklistWeekFrozen === false);
    ok('Враца/ревизия: живото „да" бие старото „не"', cellVal(h, 'Враца', 'revizia_953') === 'да', cellVal(h, 'Враца', 'revizia_953'));
    ok('… бледо — „Стойност от портала"', /Стойност от портала/.test(cellTitle(h, 'Враца', 'revizia_953')));
    ok('Габрово/минуси: живо NULL → празна клетка (старото 2/5 го няма)', cellVal(h, 'Габрово', 'spravka_minusi') === '',
       cellVal(h, 'Габрово', 'spravka_minusi'));
    ok('Враца/стока на път: живо без ред в базата → 5/7', cellVal(h, 'Враца', 'stoka_na_pat') === '5/7', cellVal(h, 'Враца', 'stoka_na_pat'));
    ok('… новият ред е само в паметта (без id)', !!memRow(h, 'Враца', 'stoka_na_pat') && !memRow(h, 'Враца', 'stoka_na_pat').id);
    ok('Шумен/ревизия: ръчното „да" бие живото „не"', cellVal(h, 'Шумен', 'revizia_953') === 'да', cellVal(h, 'Шумен', 'revizia_953'));
    ok('ръчна колона (разходи) — без стойност', cellVal(h, 'Враца', 'razhodi') === '');
    ok('portal_value на Шумен/ревизия в паметта е живото „ne"', memRow(h, 'Шумен', 'revizia_953').portal_value === 'ne');
    h.close();
  }

  section('2. Затворена седмица → записаното, без RPC');
  {
    const h = env({ frozen: true });
    await open(h);
    ok('0 RPC', rpcCalls(h).length === 0, JSON.stringify(rpcCalls(h)));
    ok('0 записа', clWrites(h).length === 0);
    ok('checklistWeekFrozen === true', h.w.checklistWeekFrozen === true);
    ok('Враца/ревизия: записаното „не"', cellVal(h, 'Враца', 'revizia_953') === 'не', cellVal(h, 'Враца', 'revizia_953'));
    ok('Габрово/минуси: записаното 2/5', cellVal(h, 'Габрово', 'spravka_minusi') === '2/5', cellVal(h, 'Габрово', 'spravka_minusi'));
    ok('Враца/стока на път: записано няма → празно', cellVal(h, 'Враца', 'stoka_na_pat') === '');
    h.close();
  }

  section('3. Провал на RPC → toast и мрежата със записаното');
  {
    const h = env({ fail: { GET: /\/rpc\/checklist_portal_values/ } });
    await open(h);
    ok('червен toast', h.calls.toast.some(function (t) { return /живите стойности не се заредиха/.test(String(t)); }), JSON.stringify(h.calls.toast));
    ok('мрежата е там (3 обекта)', !!h.doc.getElementById('checklist-table') &&
       h.doc.querySelectorAll('#checklist-table tbody tr').length === 3);
    ok('… със записаното (Враца/ревизия „не")', cellVal(h, 'Враца', 'revizia_953') === 'не', cellVal(h, 'Враца', 'revizia_953'));
    ok('0 записа', clWrites(h).length === 0);
    h.close();
  }

  section('4. Отметка на контролинга върху жива клетка');
  {
    const h = env();
    await open(h);
    cellOf(h, 'Враца', 'revizia_953').click(); await ticks(); await ticks();
    const w = clWrites(h);
    ok('1 upsert', w.length === 1, String(w.length));
    const b = w[0] ? (Array.isArray(w[0].body) ? w[0].body[0] : w[0].body) : {};
    ok('тялото: control_value „da"', b.control_value === 'da', JSON.stringify(b));
    ok('тялото: БЕЗ portal_value', !('portal_value' in b), JSON.stringify(b));
    ok('тялото: updated_at (сега) и updated_by', typeof b.updated_at === 'string' && Math.abs(Date.parse(b.updated_at) - Date.now()) < 60000 &&
       b.updated_by === 'М. Павлова', JSON.stringify(b));
    ok('on_conflict по уникалността', /on_conflict=year,week_number,store_name,metric_key/.test(w[0] && w[0].url));
    h.close();
  }
  {
    /* Отговорът на upsert-а носи portal_value от базата („ne" — старата снимка).
       На жива седмица не бива да замени живото „da" в паметта. */
    const h = env();
    await open(h);
    h.w.checklistUpsert = function () {
      return Promise.resolve({ ok: true, row: { id: 'r-Вр', portal_value: 'ne', control_value: 'ne', updated_at: '2026-10-26T20:00:00Z' } });
    };
    cellOf(h, 'Враца', 'revizia_953').click(); await ticks(); await ticks();
    ok('жива: portal_value в паметта остава живото „da"', memRow(h, 'Враца', 'revizia_953').portal_value === 'da',
       memRow(h, 'Враца', 'revizia_953').portal_value);
    ok('жива: control_value и id от отговора са взети', memRow(h, 'Враца', 'revizia_953').control_value === 'ne' &&
       memRow(h, 'Враца', 'revizia_953').id === 'r-Вр');
    h.close();
  }
  {
    const h = env({ frozen: true });
    await open(h);
    h.w.checklistUpsert = function () {
      return Promise.resolve({ ok: true, row: { id: 'r-Вр', portal_value: 'xx', control_value: 'da' } });
    };
    cellOf(h, 'Враца', 'revizia_953').click(); await ticks(); await ticks();
    ok('затворена: отговорът заменя portal_value както досега', memRow(h, 'Враца', 'revizia_953').portal_value === 'xx',
       memRow(h, 'Враца', 'revizia_953').portal_value);
    h.close();
  }

  section('5. Режим на обекта — изпратена, незатворена седмица');
  {
    const h = env({ user: MANAGER, sends: [{ year: YEAR, week_number: WEEK, version: 1 }] });
    await open(h);
    ok('1 RPC', rpcCalls(h).length === 1, JSON.stringify(rpcCalls(h)));
    ok('0 записа', clWrites(h).length === 0);
    const trs = h.doc.querySelectorAll('#checklist-table tbody tr');
    ok('само един ред — Шумен', trs.length === 1 && trs[0].querySelector('td').textContent.trim() === 'Шумен', String(trs.length));
    ok('Шумен/стока на път: живото 9/9', cellVal(h, 'Шумен', 'stoka_na_pat') === '9/9', cellVal(h, 'Шумен', 'stoka_na_pat'));
    ok('чужди живи стойности не влизат в паметта', !memRow(h, 'Враца', 'stoka_na_pat'));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
