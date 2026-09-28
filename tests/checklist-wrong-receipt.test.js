/* Чек лист — „Сторна по грешни приеми" се попълва автоматично (module:wrong_receipt).

   ПРАВИЛО (договорено 28.09.2026):
     · източник — бланките с direction='wrong_receipt' (differences_reports) и
       редовете им (stock_differences); НЕ касата;
     · клетката е „бланки/редове": „2/5" = 2 сторнирани поръчки с общо 5 позиции;
     · само бланките, ПОДАДЕНИ (created_at) в показаната седмица — пн 00:00 до
       следващия пн 00:00 българско време, по същия weekDays() като целия чек лист;
     · всички сторна еднакво — от ЦО и от магазина;
     · обект без сторна → „0/0"; бъдеща седмица → нищо не се пише;
     · control_value / control_num на контролинга не се пипат.

   Пускане:  node tests/checklist-wrong-receipt.test.js .
*/
/* Git Bash не подава TZ към Node — задава се тук, ПРЕДИ да се създаде jsdom,
   и се проверява по-долу, че наистина важи. */
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const METRICS = [
  { key:'stoka_vrashtane', label:'Стока за връщане', sublabel:'', value_type:'yes_no',
    sort_order:1, active:true, source:'module:returns', deadline_day:null },
  { key:'storna_priem', label:'Сторна по грешни приеми', sublabel:'брой сторнирани поръчки/позиции',
    value_type:'number', sort_order:2, active:true, source:'module:wrong_receipt', deadline_day:null }
];
const USERS = ['Раднево', 'Петрич', 'Централен офис'].map(s => ({ store_name: s }));
const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

/* „Сега" е понеделник 28.09.2026 12:00 → седмица 40; по подразбиране чек
   листът показва приключилата — 39 (21–27.09). */
const NOW = { y: 2026, m: 8, d: 28 };

let seq = 0;
function rep(store, createdUtc, dir, lines, by) {
  const id = 'rep-' + (++seq);
  return { r: { id, store_name: store, direction: dir || 'wrong_receipt', created_at: createdUtc, submitted_by: by || 'ЦО' },
           lines: Array.from({ length: lines }, (_, i) => ({ id: id + '-l' + i, report_id: id, store_name: store })) };
}

/* Стъб на PostgREST за двете таблици — филтрира по заявката, както базата. */
function filterReports(all, url) {
  const q = decodeURIComponent(url);
  let out = all.slice();
  const dir = /direction=eq\.([^&]+)/.exec(q);
  if (dir) out = out.filter(r => r.direction === dir[1]);
  const gte = /created_at=gte\.([^&]+)/.exec(q);
  const lt = /created_at=lt\.([^&]+)/.exec(q);
  if (gte) out = out.filter(r => new Date(r.created_at) >= new Date(gte[1]));
  if (lt) out = out.filter(r => new Date(r.created_at) < new Date(lt[1]));
  return out;
}
function filterLines(all, url) {
  const m = /report_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
  if (!m) return all;
  const ids = m[1].split(',');
  return all.filter(l => ids.indexOf(l.report_id) >= 0);
}

function env(set, opts) {
  opts = opts || {};
  const reports = set.map(x => x.r);
  const lines = [].concat(...set.map(x => x.lines));
  const h = boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: opts.rows || [],
      recurring_tasks: [], task_completions: [], stock_returns: [], goods_transit: [],
      differences_reports: url => filterReports(reports, url),
      stock_differences: url => filterLines(lines, url)
    }
  });
  const RealDate = h.w.Date;
  const fixed = new RealDate(NOW.y, NOW.m, NOW.d, 12, 0, 0);
  function FakeDate() {
    if (arguments.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...arguments);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixed.getTime();
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  h.w.Date = FakeDate;
  if (opts.week) { h.w.checklistYear = 2026; h.w.checklistWeek = opts.week; }
  return h;
}
const writes = h => h.calls.post.filter(p => (p.url || '').indexOf('/weekly_checklist') >= 0);
function written(h, store, key) {
  let out = null;
  writes(h).forEach(p => (Array.isArray(p.body) ? p.body : [p.body]).forEach(r => {
    if (r.store_name === store && r.metric_key === key) out = r;
  }));
  return out;
}
function valText(h, store, key) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.find.call(t.querySelectorAll('tbody tr'), x => {
    const f = x.querySelector('td'); return f && f.textContent.trim() === store;
  });
  if (!tr) return null;
  const c = tr.querySelectorAll('td')[METRICS.map(m => m.key).indexOf(key) + 1];
  const v = c && c.querySelector('.cl-val');
  return v ? v.textContent.trim() : '';
}
const settle = async () => { for (let i = 0; i < 6; i++) await ticks(); };

(async function () {

  section('0. Часовата зона е наистина България');
  ok('offset за 28.09.2026 е −180 (UTC+3)', new Date(2026, 8, 28).getTimezoneOffset() === -180,
    String(new Date(2026, 8, 28).getTimezoneOffset()));

  section('1. Обект А: 2 бланки (3+2 реда) в седмицата + 1 в предишната → „2/5"; Б → „0/0"');
  {
    seq = 0;
    const h = env([
      rep('Раднево', '2026-09-22T08:00:00Z', 'wrong_receipt', 3, 'Склад Раднево'),  /* от магазина */
      rep('Раднево', '2026-09-25T13:00:00Z', 'wrong_receipt', 2, 'А. Симеонова'),   /* от ЦО */
      rep('Раднево', '2026-09-15T08:00:00Z', 'wrong_receipt', 4),                   /* седмица 38 */
      rep('Раднево', '2026-09-23T08:00:00Z', 'supplier', 6),                        /* друга посока */
      rep('Раднево', '2026-09-24T08:00:00Z', 'interstore', 1)                       /* друга посока */
    ]);
    h.w.loadChecklist();
    await settle();
    ok('показана е седмица 39', h.w.checklistWeek === 39, String(h.w.checklistWeek));
    const a = written(h, 'Раднево', 'storna_priem');
    ok('Раднево: записано „2/5"', !!a && a.portal_value === '2/5', JSON.stringify(a));
    ok('НЕ „3/9" — предишната седмица не се брои', !!a && a.portal_value !== '3/9');
    ok('НЕ „4/12" — другите посоки не се броят', !!a && a.portal_value !== '4/12');
    const b = written(h, 'Петрич', 'storna_priem');
    ok('Петрич (без сторна): „0/0"', !!b && b.portal_value === '0/0', JSON.stringify(b));
    ok('клетката на Раднево показва „2/5"', valText(h, 'Раднево', 'storna_priem') === '2/5',
      JSON.stringify(valText(h, 'Раднево', 'storna_priem')));
    ok('клетката на Петрич показва „0/0"', valText(h, 'Петрич', 'storna_priem') === '0/0',
      JSON.stringify(valText(h, 'Петрич', 'storna_priem')));
    ok('записът носи САМО portal_value (без control_*)',
      !!a && !('control_value' in a) && !('control_num' in a) && !('comment' in a), JSON.stringify(a));
    const lineGets = h.calls.get.filter(u => u.indexOf('/stock_differences') >= 0);
    ok('редовете се теглят само за бланките от седмицата (2 id)',
      lineGets.length === 1 && (decodeURIComponent(lineGets[0]).match(/rep-\d+/g) || []).length === 2,
      lineGets.map(decodeURIComponent).join(' | '));
    h.close();
  }

  section('2. control_num / control_value на контролинга не се презаписват');
  {
    seq = 0;
    const h = env([rep('Раднево', '2026-09-22T08:00:00Z', 'wrong_receipt', 3)], {
      rows: [{ year: 2026, week_number: 39, store_name: 'Раднево', metric_key: 'storna_priem',
               portal_value: null, control_value: 'ръчно', control_num: 7, comment: 'от Цвети' }]
    });
    h.w.loadChecklist();
    await settle();
    const a = written(h, 'Раднево', 'storna_priem');
    ok('portal_value се пише („1/3")', !!a && a.portal_value === '1/3', JSON.stringify(a));
    ok('тялото не съдържа control_value / control_num / comment',
      !!a && !('control_value' in a) && !('control_num' in a) && !('comment' in a), JSON.stringify(a));
    ok('клетката показва числото на контролинга (7), не „1/3"',
      valText(h, 'Раднево', 'storna_priem') === '7', JSON.stringify(valText(h, 'Раднево', 'storna_priem')));
    const row = h.w.checklistRows.find(r => r.store_name === 'Раднево' && r.metric_key === 'storna_priem');
    ok('местният ред пази control_value и comment', row && row.control_value === 'ръчно' && row.comment === 'от Цвети',
      JSON.stringify(row));
    h.close();
  }

  section('3. Бъдеща седмица → нищо не се пише');
  {
    seq = 0;
    const h = env([rep('Раднево', '2026-10-06T08:00:00Z', 'wrong_receipt', 3)], { week: 41 });
    h.w.loadChecklist();
    await settle();
    ok('показана е седмица 41', h.w.checklistWeek === 41, String(h.w.checklistWeek));
    ok('няма запис за storna_priem', !written(h, 'Раднево', 'storna_priem') && !written(h, 'Петрич', 'storna_priem'),
      JSON.stringify(writes(h).map(p => p.body)));
    ok('и няма заявка към differences_reports', !h.calls.get.some(u => u.indexOf('/differences_reports') >= 0));
    h.close();
  }

  section('4. Границата: неделя 23:30 и понеделник 00:30 българско време');
  {
    /* Неделя 27.09 23:30 (UTC+3) = 20:30Z → седмица 39.
       Понеделник 28.09 00:30 (UTC+3) = 27.09 21:30Z → седмица 40. */
    const SET = () => { seq = 0; return [
      rep('Раднево', '2026-09-27T20:30:00Z', 'wrong_receipt', 1),
      rep('Раднево', '2026-09-27T21:30:00Z', 'wrong_receipt', 2),
      /* Понеделник 21.09 00:30 = 20.09 21:30Z → седмица 39 (началото ѝ). */
      rep('Петрич', '2026-09-20T21:30:00Z', 'wrong_receipt', 4),
      /* Неделя 20.09 23:30 = 20:30Z → седмица 38. */
      rep('Петрич', '2026-09-20T20:30:00Z', 'wrong_receipt', 8)
    ]; };
    const h39 = env(SET());
    h39.w.loadChecklist();
    await settle();
    const a39 = written(h39, 'Раднево', 'storna_priem');
    ok('седмица 39: Раднево „1/1" — неделя 23:30 влиза, понеделник 00:30 не',
      !!a39 && a39.portal_value === '1/1', JSON.stringify(a39));
    const p39 = written(h39, 'Петрич', 'storna_priem');
    ok('седмица 39: Петрич „1/4" — понеделник 00:30 влиза, предишната неделя 23:30 не',
      !!p39 && p39.portal_value === '1/4', JSON.stringify(p39));
    h39.close();

    const h40 = env(SET(), { week: 40 });
    h40.w.loadChecklist();
    await settle();
    const a40 = written(h40, 'Раднево', 'storna_priem');
    ok('седмица 40 (текущата): Раднево „1/2" — понеделник 00:30 е тук',
      !!a40 && a40.portal_value === '1/2', JSON.stringify(a40));
    h40.close();
  }

  section('5. Бланка без редове се брои с 0 позиции');
  {
    seq = 0;
    const h = env([rep('Раднево', '2026-09-22T08:00:00Z', 'wrong_receipt', 0),
                   rep('Раднево', '2026-09-23T08:00:00Z', 'wrong_receipt', 2)]);
    h.w.loadChecklist();
    await settle();
    const a = written(h, 'Раднево', 'storna_priem');
    ok('„2/2"', !!a && a.portal_value === '2/2', JSON.stringify(a));
    h.close();
  }

  section('6. Провал на заявката за редовете → нищо не се пише (не частично)');
  {
    seq = 0;
    const set = [rep('Раднево', '2026-09-22T08:00:00Z', 'wrong_receipt', 3)];
    const h = boot({
      modules: ['bulletin.js', 'checklist.js'], user: ADMIN,
      data: {
        users: USERS, weekly_checklist_metrics: METRICS, weekly_checklist: [],
        recurring_tasks: [], task_completions: [], stock_returns: [], goods_transit: [],
        differences_reports: url => filterReports(set.map(x => x.r), url),
        stock_differences: []
      },
      fail: { GET: { status: 500, body: { message: 'boom' }, url: /stock_differences/ } }
    });
    h.w.checklistYear = 2026; h.w.checklistWeek = 39;
    h.w.loadChecklist();
    await settle();
    ok('няма запис за storna_priem', !written(h, 'Раднево', 'storna_priem') && !written(h, 'Петрич', 'storna_priem'),
      JSON.stringify(writes(h).map(p => p.body)));
    ok('показан е toast за грешката', h.calls.toast.some(t => String(t).indexOf('differences_reports') >= 0),
      JSON.stringify(h.calls.toast));
    h.close();
  }

  report();
})();
