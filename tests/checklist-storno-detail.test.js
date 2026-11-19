/* Чек лист — „Сторна по грешни приеми": ▾ разгъва какво е сторнирано
   (Цветелина, 07.11.2026; сесия checklist-storno-detail, 19.11.2026).

   Стойността „бланки/редове" идва както досега от checklist_portal_values()
   (rpc) и НЕ се пипа. Подробностите се теглят ВЕДНЪЖ при отваряне на таба по
   правилото на checklistWrongReceiptRows() — без заявка при клик. Само в
   портала: писмото, седмичният отчет и „Днес" остават без промяна (Тенчо).

   Проверява:
     1. офис: седмица с 2 бланки на Раднево (1 и 2 реда) → клетката „2/3";
        правилото в браузъра пак дава „2/3"; Петрич „0/0" → без <button>;
     2. клик по ▾ → двете бланки (дата, № поръчка) и 3-те реда; име с „<b>"
        се показва като текст; кликът не стига до клетката (нула записи,
        няма поле за число); нула нови GET при клика; втори клик скрива;
     3. обект (Раднево, manager): същото ▾ и същият списък;
     4. провал на stock_differences / differences_reports → без ▾ и без
        списък, стойността „2/3" остава.

     3б. затворена седмица със записано „0/0", а бланки има → без ▾.

   МУТАЦИОННА ПРОВЕРКА (19.11.2026, база 53/0 exit 0; всеки вариант → exit 1):
     · без esc() за material_name                       → 2 ❌ (<b> като елемент)
     · без проверката за „0/0"                          → 1 ❌ (3б)
     · ▾ винаги (без проверка за бланки и за „0/0")     → 2 ❌ (Петрич, 3б)
     · само първият ред на бланка в списъка             → 4 ❌ (2 реда вместо 3)
     · lines: it.length + 1 в checklistWrongReceiptRows → 1 ❌ („2/4")
     · без stopPropagation в checklistWrToggleClick     → 1 ❌ (поле за число)

   Пускане:  node tests/checklist-storno-detail.test.js .
*/
process.env.TZ = 'Europe/Sofia';
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const YEAR = 2026, WEEK = 46;  /* 09–15.11.2026 */
const METRICS = [
  { key: 'storna_priem', label: 'Сторна по грешни приеми', sublabel: 'брой сторнирани поръчки/позиции',
    value_type: 'number', sort_order: 1, active: true, source: 'module:wrong_receipt', deadline_day: null }
];
const USERS = ['Раднево', 'Петрич', 'Централен офис'].map(s => ({ store_name: s }));
const ADMIN = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin', store_name: 'Централен офис' };
const MANAGER = { id: 'u-2', email: 'radnevo@temax.bg', display_name: 'Раднево', role: 'manager', store_name: 'Раднево' };
const SENT = [{ id: 's-1', year: YEAR, week_number: WEEK, version: 1, sent_at: '2026-11-16T08:00:00Z',
                sent_by: 'М. Павлова', recipients: ['a@b.bg'], note: null }];

const REPORTS = [
  { id: 'rep-1', store_name: 'Раднево', direction: 'wrong_receipt', created_at: '2026-11-10T08:00:00Z' },
  { id: 'rep-2', store_name: 'Раднево', direction: 'wrong_receipt', created_at: '2026-11-12T09:30:00Z' },
  { id: 'rep-0', store_name: 'Раднево', direction: 'wrong_receipt', created_at: '2026-11-03T08:00:00Z' }, /* С45 */
  { id: 'rep-9', store_name: 'Петрич',  direction: 'supplier',      created_at: '2026-11-11T08:00:00Z' }
];
const LINES = [
  { id: 'l1', report_id: 'rep-1', order_number: '4500001', material_code: '100200', material_name: 'Боя бяла 10л', quantity: 4 },
  { id: 'l2', report_id: 'rep-2', order_number: '4500002', material_code: '300400', material_name: '<b>Лепило</b>', quantity: 2 },
  { id: 'l3', report_id: 'rep-2', order_number: '4500002', material_code: '500600', material_name: 'Валяк 25см', quantity: 1.5 },
  { id: 'l0', report_id: 'rep-0', order_number: '4499999', material_code: '999999', material_name: 'Стара', quantity: 9 },
  { id: 'l9', report_id: 'rep-9', order_number: '4511111', material_code: '888888', material_name: 'Друга посока', quantity: 1 }
];
const LIVE = [
  { store_name: 'Раднево', metric_key: 'storna_priem', value: '2/3' },
  { store_name: 'Петрич',  metric_key: 'storna_priem', value: '0/0' }
];

function filterReports(url) {
  const q = decodeURIComponent(url);
  let out = REPORTS.slice();
  const dir = /direction=eq\.([^&]+)/.exec(q);
  if (dir) out = out.filter(r => r.direction === dir[1]);
  const gte = /created_at=gte\.([^&]+)/.exec(q);
  const lt = /created_at=lt\.([^&]+)/.exec(q);
  if (gte) out = out.filter(r => new Date(r.created_at) >= new Date(gte[1]));
  if (lt) out = out.filter(r => new Date(r.created_at) < new Date(lt[1]));
  return out;
}
function filterLines(url) {
  const m = /report_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
  if (!m) return LINES;
  const ids = m[1].split(',');
  return LINES.filter(l => ids.indexOf(l.report_id) >= 0);
}

function env(opts) {
  opts = opts || {};
  const b = {
    modules: ['bulletin.js', 'checklist.js'],
    user: opts.user || ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: opts.frozen
        ? [{ year: YEAR, week_number: WEEK, store_name: 'Раднево', metric_key: 'storna_priem',
             portal_value: '0/0', control_value: null, control_num: null, comment: null }]
        : [],
      weekly_checklist_freezes: opts.frozen ? [{ year: YEAR, week_number: WEEK }] : [],
      weekly_checklist_sends: SENT,
      weekly_checklist_responses: [],
      rpc: LIVE,
      recurring_tasks: [], recurring_task_versions: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], goods_transit: [], stock_returns: [],
      differences_reports: filterReports,
      stock_differences: filterLines
    }
  };
  if (opts.fail) b.fail = opts.fail;
  const h = boot(b);
  /* „Сега" — вторник 17.11.2026 12:00 (седмица 46 е минала). */
  const RealDate = h.w.Date;
  const fixed = new RealDate(2026, 10, 17, 12, 0, 0);
  function FakeDate() {
    if (arguments.length === 0) return new RealDate(fixed.getTime());
    return new RealDate(...arguments);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => fixed.getTime();
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  h.w.Date = FakeDate;
  h.w.checklistYear = YEAR; h.w.checklistWeek = WEEK;
  return h;
}
const settle = async () => { for (let i = 0; i < 8; i++) await ticks(); };
async function open(h) { h.w.loadChecklist(); await settle(); }

function cell(h, store) {
  const t = h.doc.getElementById('checklist-table');
  if (!t) return null;
  const tr = Array.prototype.find.call(t.querySelectorAll('tbody tr'), x => {
    const f = x.querySelector('td'); return f && f.textContent.trim() === store;
  });
  return tr ? tr.querySelectorAll('td')[1] : null;
}
const valOf = c => { const v = c && c.querySelector('.cl-val'); return v ? v.textContent.trim() : ''; };
const writes = h => h.calls.post.concat(h.calls.patch).filter(p => (p.url || '').indexOf('/weekly_checklist') >= 0);

/* Списъкът след клик — общо за офис и обект. */
async function checkOpenList(h, label) {
  const c = cell(h, 'Раднево');
  const btn = c && c.querySelector('button');
  ok(label + ': Раднево има <button> ▾', !!btn && btn.textContent.trim() === '▾', c ? c.innerHTML : 'няма клетка');
  ok(label + ': преди клик няма списък', !!c && !c.querySelector('.cl-wr-list'));
  if (!btn) return;
  const getsBefore = h.calls.get.length;
  btn.click();
  await settle();
  const list = c.querySelector('.cl-wr-list');
  ok(label + ': кликът показва списък', !!list);
  if (!list) return;
  const reps = list.querySelectorAll('.cl-wr-rep');
  const lines = list.querySelectorAll('.cl-wr-line');
  ok(label + ': 2 бланки', reps.length === 2, String(reps.length));
  ok(label + ': 3 реда', lines.length === 3, String(lines.length));
  const txt = list.textContent;
  ok(label + ': първата бланка — 10.11, поръчка 4500001',
    reps[0] && reps[0].textContent.indexOf('10.11') >= 0 && reps[0].textContent.indexOf('4500001') >= 0,
    reps[0] && reps[0].textContent);
  ok(label + ': втората бланка — 12.11, поръчка 4500002 (веднъж)',
    reps[1] && reps[1].textContent.indexOf('12.11') >= 0 &&
    reps[1].textContent.split('4500002').length === 2, reps[1] && reps[1].textContent);
  ok(label + ': ред с код, име и количество',
    txt.indexOf('100200') >= 0 && txt.indexOf('Боя бяла 10л') >= 0 && txt.indexOf('× 4') >= 0 &&
    txt.indexOf('500600') >= 0 && txt.indexOf('× 1.5') >= 0, txt);
  ok(label + ': „<b>Лепило</b>" е текст, не елемент',
    txt.indexOf('<b>Лепило</b>') >= 0 && !list.querySelector('b'), list.innerHTML);
  ok(label + ': без чужда седмица и чужда посока',
    txt.indexOf('4499999') < 0 && txt.indexOf('4511111') < 0, txt);
  ok(label + ': стойността остава „2/3"', valOf(c) === '2/3', valOf(c));
  ok(label + ': кликът не стига до клетката (без поле за число)', !c.querySelector('input'));
  ok(label + ': нула записи след клика', writes(h).length === 0, String(writes(h).length));
  ok(label + ': нула нови GET при клика', h.calls.get.length === getsBefore,
    h.calls.get.slice(getsBefore).join(' | '));
  ok(label + ': бутонът стана ▴', btn.textContent.trim() === '▴', btn.textContent);
  btn.click();
  await settle();
  ok(label + ': втори клик скрива списъка', !c.querySelector('.cl-wr-list'));
  ok(label + ': бутонът пак е ▾', btn.textContent.trim() === '▾', btn.textContent);
}

(async function () {

  section('0. Часовата зона е България');
  ok('offset за 10.11.2026 е −120', new Date(2026, 10, 10).getTimezoneOffset() === -120,
    String(new Date(2026, 10, 10).getTimezoneOffset()));

  section('1. Офис: стойности и ▾ само при не-„0/0"');
  {
    const h = env();
    await open(h);
    ok('показана е седмица 46', h.w.checklistWeek === WEEK, String(h.w.checklistWeek));
    ok('Раднево показва „2/3"', valOf(cell(h, 'Раднево')) === '2/3', valOf(cell(h, 'Раднево')));
    ok('Петрич показва „0/0"', valOf(cell(h, 'Петрич')) === '0/0', valOf(cell(h, 'Петрич')));
    ok('Петрич („0/0") — без <button>', !!cell(h, 'Петрич') && !cell(h, 'Петрич').querySelector('button'),
      cell(h, 'Петрич') && cell(h, 'Петрич').innerHTML);
    ok('нула записи при отваряне', writes(h).length === 0, String(writes(h).length));
    /* Правилото в браузъра (еталонът за checklist_portal_values) — непроменено. */
    const rows = await h.w.checklistWrongReceiptRows();
    const rad = (rows || []).filter(r => r.store_name === 'Раднево');
    ok('checklistWrongReceiptValue за Раднево пак е „2/3"',
      h.w.checklistWrongReceiptValue(rad) === '2/3', JSON.stringify(rad));
    ok('checklistWrongReceiptValue за Петрич пак е „0/0"',
      h.w.checklistWrongReceiptValue([]) === '0/0');

    section('2. Офис: клик по ▾');
    await checkOpenList(h, 'офис');
    h.close();
  }

  section('3. Обект (Раднево): същият ▾');
  {
    const h = env({ user: MANAGER });
    await open(h);
    ok('обектът вижда само своя ред', !cell(h, 'Петрич') && !!cell(h, 'Раднево'));
    ok('Раднево показва „2/3"', valOf(cell(h, 'Раднево')) === '2/3', valOf(cell(h, 'Раднево')));
    await checkOpenList(h, 'обект');
    h.close();
  }

  section('3б. Показано „0/0" при заредени бланки (затворена седмица) → без ▾');
  {
    const h = env({ frozen: true });
    await open(h);
    const c = cell(h, 'Раднево');
    ok('Раднево показва записаното „0/0"', valOf(c) === '0/0', valOf(c));
    ok('бланките са заредени', !!(h.w.checklistWrDetails && h.w.checklistWrDetails['Раднево']));
    ok('„0/0" — без <button>', !!c && !c.querySelector('button'), c && c.innerHTML);
    h.close();
  }

  section('4. Провалена заявка → без ▾ и без списък, стойността остава');
  for (const re of [/stock_differences/, /differences_reports/]) {
    const h = env({ fail: { GET: { status: 500, body: { message: 'boom' }, url: re } } });
    await open(h);
    const c = cell(h, 'Раднево');
    ok(re.source + ': Раднево пак „2/3"', valOf(c) === '2/3', valOf(c));
    ok(re.source + ': без <button> никъде в таблицата',
      !h.doc.getElementById('checklist-table').querySelector('button'));
    ok(re.source + ': без списък', !h.doc.querySelector('.cl-wr-list'));
    h.close();
  }

  report();
})();
