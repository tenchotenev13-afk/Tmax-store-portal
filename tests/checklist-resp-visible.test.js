/* Чек лист — становищата да се виждат (27.10.2026, Тенчо: „не виждам такава
   клетка").

   Какво заковава файлът:
   1. знакът 📝 е ДО стойността (в потока, не position:absolute в ъгъла),
      клетката има оцветена рамка; textContent на .cl-val остава стойността;
      реален клик по знака отваря прозорчето само за четене и НЕ завърта
      клетката;
   2. блок „Становища на обектите — седмица N": ред на становище (ескейпнат
      текст, кой, кога, „след срока"), червено „няма становище" за „не" без
      становище при изпратена седмица; неизпратена → сивият ред „не е
      изпратена … не се искат"; изпратена без нищо → „Няма становища";
   3. регионален accounting (is_regional + обекти): табът се показва след
      rolesLoadRegional; мрежата и заявките — само неговите обекти (in.(…));
      клик по клетка → 0 записа; без „Изпрати"; знакът и блокът — само за
      неговите обекти;
   4. регионален без обекти и нерегионален accounting — без таб;
      управителят на обект — без знак и без блока (непроменен режим).

   Пускане:  node tests/checklist-resp-visible.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 42;   /* пон 12.10 … нд 18.10; срок за становище — пт 23.10, 18:00 */
const METRICS = [
  ['revizia_953',    'ревизия',                 'yes_no'],
  ['zanulyavane_lm', 'таблица зануляване л.м.', 'yes_no'],
  ['storna_priem',   'Сторна',                  'number']
].map(function (a, i) {
  return { key: a[0], label: a[1], sublabel: '', value_type: a[2], source: 'manual',
           sort_order: i + 1, active: true, deadline_day: null };
});
const KEYS = METRICS.map(function (m) { return m.key; });
const STORES = ['Враца', 'Кърджали', 'Шумен'];

function cl(store, key, f) {
  return Object.assign({ id: 'r-' + store + key, year: YEAR, week_number: WEEK, store_name: store, metric_key: key,
                         portal_value: null, control_value: null, control_num: null, comment: null }, f || {});
}
const ROWS = [
  cl('Кърджали', 'zanulyavane_lm', { portal_value: 'ne' }),
  cl('Шумен', 'revizia_953', { control_value: 'ne' }),
  cl('Шумен', 'storna_priem', { control_num: 5 }),
  cl('Враца', 'revizia_953', { control_value: 'da' }),
  cl('Враца', 'zanulyavane_lm', { portal_value: 'ne' })
];
const RESP = [
  { id: 'x1', year: YEAR, week_number: WEEK, store_name: 'Кърджали', metric_key: 'zanulyavane_lm',
    text: 'проверка <b>23.10</b>', created_by: 'Управител Кърджали', updated_at: '2026-10-23T12:25:56Z' },
  { id: 'x2', year: YEAR, week_number: WEEK, store_name: 'Враца', metric_key: 'zanulyavane_lm',
    text: 'късно', created_by: 'Управител Враца', updated_at: '2026-10-23T15:01:00Z' }   /* 18:01 София → след срока */
];
const SENT = [{ year: YEAR, week_number: WEEK, version: 1 }];

const ADMIN = { id: 'u-1', email: 'm.pavlova@temax.bg', display_name: 'М. Павлова', role: 'admin', store_name: 'Централен офис' };
const REGIONAL = { id: 'u-r', email: 't.ivanova@temax.bg', display_name: 'Т. Иванова', role: 'accounting', store_name: 'Централен офис' };
const MANAGER = { id: 'u-2', email: 'managerkardjali@temax.bg', display_name: 'Управител Кърджали', role: 'manager', store_name: 'Кърджали' };

function env(opts) {
  opts = opts || {};
  const regional = opts.regional || null;   /* { is_regional, assigned_stores } от „след входа" */
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: Object.assign({}, opts.user || ADMIN),
    data: {
      users: function (url) {
        if (url.indexOf('id=eq.') >= 0) return regional ? [regional] : [];
        return STORES.concat(['Централен офис']).map(function (s) { return { store_name: s }; });
      },
      weekly_checklist_metrics: METRICS,
      weekly_checklist: JSON.parse(JSON.stringify(opts.rows || ROWS)),
      weekly_checklist_freezes: [{ year: YEAR, week_number: WEEK }],
      weekly_checklist_sends: opts.sends === undefined ? SENT : opts.sends,
      weekly_checklist_responses: opts.resp === undefined ? RESP : opts.resp,
      rpc: [], recurring_tasks: [], task_completions: [], stock_returns: [], goods_transit: []
    }
  };
  const h = boot(b);
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  return h;
}
async function open(h) { h.w.loadChecklist(); await ticks(); await ticks(); }
/* Регионалният — както след rolesLoadRegional. */
function asRegional(h, stores) {
  h.w.currentUser.is_regional = true;
  h.w.currentUser.assigned_stores = stores;
}

function rowOf(h, store) {
  return Array.prototype.slice.call(h.doc.querySelectorAll('#checklist-table tbody tr')).filter(function (x) {
    return x.querySelector('td').textContent.trim() === store;
  })[0] || null;
}
function cellOf(h, store, key) { const tr = rowOf(h, store); return tr ? tr.querySelectorAll('td')[KEYS.indexOf(key) + 1] : null; }
function clWrites(h) { return h.calls.post.concat(h.calls.patch).filter(function (p) { return (p.url || '').indexOf('/weekly_checklist') >= 0; }); }
function ovRows(h) {
  return Array.prototype.slice.call(h.doc.querySelectorAll('#cl-resp-overview tr')).map(function (tr) {
    return Array.prototype.slice.call(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
  });
}

(async function () {

  section('1. Знакът в клетката — видим, до стойността');
  {
    const h = env();
    await open(h);
    const td = cellOf(h, 'Кърджали', 'zanulyavane_lm');
    const mk = td && td.querySelector('.cl-resp');
    ok('знакът го има в клетката със становище', !!mk);
    const st = mk ? (mk.getAttribute('style') || '') : '';
    ok('знакът НЕ е position:absolute и НЕ е в left:0', !/position\s*:\s*absolute/.test(st) && !/left\s*:\s*0/.test(st), st);
    ok('знакът е с размер като текста (font-size:12px)', /font-size:12px/.test(st), st);
    ok('знакът е СЛЕД стойността (.cl-val)', !!td.querySelector('.cl-val') &&
       Array.prototype.indexOf.call(td.children, td.querySelector('.cl-val')) < Array.prototype.indexOf.call(td.children, mk));
    ok('.cl-val остава „не"', td.querySelector('.cl-val').textContent.trim() === 'не', td.querySelector('.cl-val').textContent);
    ok('клетката е с оцветена рамка и data-resp', td.getAttribute('data-resp') === '1' && /box-shadow:inset 0 0 0 2px #f59e0b/.test(td.getAttribute('style')));
    ok('клетка без становище — без знак и без рамка', !cellOf(h, 'Шумен', 'revizia_953').querySelector('.cl-resp') &&
       !cellOf(h, 'Шумен', 'revizia_953').getAttribute('data-resp'));
    const before = clWrites(h).length;
    mk.click(); await ticks();
    const ov = h.doc.getElementById('cl-resp-ov');
    ok('реален клик по знака → прозорчето', !!ov);
    ok('… текстът ескейпнат и дословно', !!h.doc.getElementById('cl-resp-view') &&
       h.doc.getElementById('cl-resp-view').textContent === 'проверка <b>23.10</b>' && !h.doc.getElementById('cl-resp-view').querySelector('b'));
    ok('… само за четене (без поле)', !!ov && !ov.querySelector('textarea') && !ov.querySelector('input'));
    ok('… клетката не се завърта (0 записа)', clWrites(h).length === before);
    h.close();
  }

  section('2. Блок „Становища на обектите"');
  {
    const h = env();
    await open(h);
    const blk = h.doc.getElementById('cl-resp-overview');
    ok('блокът го има под таблицата', !!blk && /Становища на обектите — седмица 42/.test(blk.textContent));
    const r = ovRows(h);
    ok('3 реда: Враца (становище), Кърджали (становище), Шумен (няма)', r.length === 3, JSON.stringify(r));
    ok('Враца · зануляване · „късно" · след срока', r[0] && r[0][0] === 'Враца' && r[0][2] === 'късно' && /след срока/.test(r[0][3]), JSON.stringify(r[0]));
    ok('Кърджали · текстът ескейпнат · кой · кога · в срок', r[1] && r[1][0] === 'Кърджали' && r[1][2] === 'проверка <b>23.10</b>' &&
       /Управител Кърджали · 23\.10 15:25/.test(r[1][3]) && !/след срока/.test(r[1][3]), JSON.stringify(r[1]));
    ok('Шумен · ревизия · „няма становище" в червено', r[2] && r[2][0] === 'Шумен' && r[2][1] === 'ревизия' && r[2][2] === 'няма становище' &&
       !!blk.querySelector('.cl-ov-missing span[style*="#dc2626"]'), JSON.stringify(r[2]));
    ok('числова колона (Сторна 5) не иска становище', !r.some(function (x) { return x[1] === 'Сторна'; }));
    ok('<b> не е станал таг в блока', !blk.querySelector('.cl-ov-text b'));
    h.close();
  }
  {
    const h = env({ sends: [] });
    await open(h);
    const r = ovRows(h);
    ok('неизпратена: становищата + сив ред „не е изпратена … не се искат"',
       r.some(function (x) { return /Седмица 42 не е изпратена до обектите — становища не се искат\./.test(x[0]); }) &&
       !r.some(function (x) { return x[2] === 'няма становище'; }), JSON.stringify(r));
    h.close();
  }
  {
    const h = env({ resp: [], rows: [cl('Враца', 'revizia_953', { control_value: 'da' })] });
    await open(h);
    const r = ovRows(h);
    ok('изпратена, без „не" и без становища → „Няма становища за седмицата."', r.length === 1 && r[0][0] === 'Няма становища за седмицата.', JSON.stringify(r));
    h.close();
  }

  section('3. Регионален accounting — само своите обекти, само четене');
  {
    const h = env({ user: REGIONAL, regional: { is_regional: true, assigned_stores: ['Кърджали', 'Шумен'] } });
    h.w.setupTabsForRole();
    ok('преди is_regional: табът е скрит', h.doc.getElementById('tab-checklist').style.display === 'none');
    await h.w.rolesLoadRegional(); await ticks();
    ok('след rolesLoadRegional: табът се вижда', h.doc.getElementById('tab-checklist').style.display === 'flex');
    ok('checklistRegionalMode() === true, canEditChecklist() === false', h.w.checklistRegionalMode() === true && h.w.canEditChecklist() === false);
    await open(h);
    const names = Array.prototype.slice.call(h.doc.querySelectorAll('#checklist-table tbody tr')).map(function (tr) { return tr.querySelector('td').textContent.trim(); });
    ok('мрежата — само Кърджали и Шумен', JSON.stringify(names) === '["Кърджали","Шумен"]', JSON.stringify(names));
    const qRows = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist?') >= 0; })[0] || '';
    const qResp = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist_responses?') >= 0; })[0] || '';
    const inList = function (u) { const d = decodeURIComponent(u); return /store_name=in\.\("Кърджали","Шумен"\)/.test(d); };
    ok('заявката за клетките — store_name=in.(Кърджали,Шумен)', inList(qRows), decodeURIComponent(qRows));
    ok('заявката за становищата — същият филтър', inList(qResp), decodeURIComponent(qResp));
    ok('без бутон „Изпрати"', !h.doc.getElementById('cl-send-btn'));
    const before = clWrites(h).length;
    cellOf(h, 'Шумен', 'revizia_953').click(); await ticks();
    ok('клик по клетка → 0 записа', clWrites(h).length === before);
    ok('клетката е непроменена („не")', cellOf(h, 'Шумен', 'revizia_953').querySelector('.cl-val').textContent.trim() === 'не');
    const mk = cellOf(h, 'Кърджали', 'zanulyavane_lm').querySelector('.cl-resp');
    ok('знакът се вижда и за регионалния', !!mk);
    mk.click(); await ticks();
    ok('… кликът отваря прозорчето', !!h.doc.getElementById('cl-resp-ov'));
    const r = ovRows(h);
    ok('блокът — само неговите обекти (без Враца)', r.length === 2 && !r.some(function (x) { return x[0] === 'Враца'; }), JSON.stringify(r));
    h.close();
  }

  section('4. Без таб: регионален без обекти, нерегионален accounting; управителят — без промяна');
  {
    const h = env({ user: REGIONAL, regional: { is_regional: true, assigned_stores: [] } });
    h.w.setupTabsForRole();
    await h.w.rolesLoadRegional(); await ticks();
    ok('регионален без обекти → без таб', h.doc.getElementById('tab-checklist').style.display === 'none' && h.w.canSeeChecklist() === false);
    h.close();
  }
  {
    const h = env({ user: REGIONAL, regional: { is_regional: false, assigned_stores: ['Кърджали'] } });
    h.w.setupTabsForRole();
    await h.w.rolesLoadRegional(); await ticks();
    ok('нерегионален accounting → без таб', h.doc.getElementById('tab-checklist').style.display === 'none' && h.w.canSeeChecklist() === false);
    h.close();
  }
  {
    const h = env({ user: MANAGER });
    await open(h);
    ok('управител: режим на обекта, не регионален', h.w.checklistStoreMode() === true && h.w.checklistRegionalMode() === false);
    ok('управител: без знак 📝 в мрежата', !h.doc.querySelector('#checklist-table .cl-resp'));
    ok('управител: без блока „Становища на обектите"', !h.doc.getElementById('cl-resp-overview'));
    ok('управител: своят блок „Становище" си е там', !!h.doc.getElementById('cl-responses'));
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
