/* Чек лист, етап 3Б — „Чек лист — становища за седмица M" в неделния отчет
   (report.js; едж копието е заковано в report-edge-sync.test.js).

   Кронът тече в неделя 25.10.2026 21:00 → отчетната седмица е 43, M = 42,
   срокът за M е петък 23.10, 18:00 Europe/Sofia.

   Какво заковава файлът:
   1. колекторът: още две заявки — историята (or=, 8 седмици 42…35, на
      страници) и становищата за 42; cross.checklist.prev = {year, week,
      rows, history, responses}, само за обектите на получателя;
   2. блокът: заглавие със седмица M и петъка; ред на клетка „не" от M
      (без числовите и без „да"); поредица; текстът (ескейпнат) или „няма
      становище" (червено); „след срока" при запис след 18:00 — 18:00 е в
      срок, 18:01 не е; подредба по поредица низходящо, после по обект;
   3. нула „не" → сив ред „няма „не" за седмица 42"; обект извън stores не
      влиза; провал на заявката → без блока, таблицата си остава;
   4. мястото: веднага след таблицата на чек листа; таб „Днес" — без блока.

   Пускане:  node tests/checklist-3b-report.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const SCOPE = ['Враца', 'Габрово', 'Шумен'];
const METRICS = [
  { key: 'revizia_953', label: 'ревизия', value_type: 'yes_no', sort_order: 1, active: true },
  { key: 'spravka_minusi', label: 'справка минуси', value_type: 'yes_no', sort_order: 2, active: true },
  { key: 'storna_priem', label: 'Сторна', value_type: 'number', sort_order: 3, active: true }
];
function r(store, key, week, f) {
  return Object.assign({ id: store + key + week, year: 2026, week_number: week, store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null,
    updated_at: '2026-10-20T07:00:00.000Z' }, f || {});
}
const CUR = [r('Враца', 'revizia_953', 43, { control_value: 'da' })];
/* M = 42: Шумен ревизия „не" (3-та: 40, 41, 42), Враца ревизия „не" (нова),
   Габрово минуси „не" от портала (2-ра), Враца минуси „да", сторна 4 —
   плюс Силистра „не" (извън stores). */
const HIST = [
  r('Шумен', 'revizia_953', 42, { control_value: 'ne' }),
  r('Шумен', 'revizia_953', 41, { control_value: 'ne' }),
  r('Шумен', 'revizia_953', 40, { control_value: 'ne' }),
  r('Шумен', 'revizia_953', 38, { control_value: 'ne' }),
  r('Враца', 'revizia_953', 42, { control_value: 'ne' }),
  r('Враца', 'spravka_minusi', 42, { control_value: 'da' }),
  r('Габрово', 'spravka_minusi', 42, { portal_value: 'ne' }),
  r('Габрово', 'spravka_minusi', 41, { portal_value: 'ne' }),
  r('Габрово', 'storna_priem', 42, { control_num: 4 }),
  r('Силистра', 'revizia_953', 42, { control_value: 'ne' })
];
/* 18:00 и 18:01 в София на 23.10 (EEST, UTC+3). */
const RESP = [
  { year: 2026, week_number: 42, store_name: 'Шумен', metric_key: 'revizia_953', text: 'Протоколът е <b>при РУ</b>',
    created_at: '2026-10-21T08:00:00Z', updated_at: '2026-10-23T15:00:59Z' },
  { year: 2026, week_number: 42, store_name: 'Габрово', metric_key: 'spravka_minusi', text: 'Подадена късно',
    created_at: '2026-10-23T15:01:00Z', updated_at: '2026-10-23T15:01:00Z' },
  { year: 2026, week_number: 42, store_name: 'Силистра', metric_key: 'revizia_953', text: 'ЧУЖД ОБЕКТ',
    updated_at: '2026-10-21T08:00:00Z' }
];

function env(extra, fail) {
  const b = {
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: SCOPE.concat(['Силистра', 'Централен офис']).map(function (s) { return { store_name: s }; }),
      bulletins: [{ id: 'b-43', week_number: 43, year: 2026, status: 'published' }],
      bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], report_snapshots: [],
      differences_reports: [], stock_returns: [], kasa_storno: [], kasa_zoborot: [], goods_transit: [],
      transport_pallets: [], client_orders: [], transport_orders: [], app_settings: [],
      weekly_checklist_metrics: METRICS,
      weekly_checklist: function (url) { return url.indexOf('or=') >= 0 ? HIST : CUR; },
      weekly_checklist_responses: RESP
    }, extra || {})
  };
  if (fail) b.fail = fail;
  const h = boot(b);
  const Real = h.w.Date, fixedMs = new Real('2026-10-25T21:00:00').getTime();
  h.w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  };
  return h;
}
const weekly = (h, scope) => new Promise(res => { h.w.collectWeeklyReportData(res, scope); });
function rowsOf(h, html) {
  const div = h.doc.createElement('div');
  div.innerHTML = html;
  return Array.from(div.querySelectorAll('tr')).map(function (tr) {
    return Array.from(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
  });
}

(async function () {

  section('1. Колекторът');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const p = data && data.cross && data.cross.checklist && data.cross.checklist.prev;
    ok('cross.checklist.prev е тук', !!p, JSON.stringify(data && data.cross && data.cross.checklist && Object.keys(data.cross.checklist)));
    ok('prev е за 42/2026', p && p.year === 2026 && p.week === 42);
    const hq = decodeURIComponent(h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist?or=') >= 0; })[0] || '');
    ok('историята: 42…35 и без 43', ['42', '41', '40', '39', '38', '37', '36', '35'].every(function (w) { return hq.indexOf('week_number.eq.' + w + ')') >= 0; }) &&
       hq.indexOf('week_number.eq.43') < 0 && hq.indexOf('week_number.eq.34') < 0, hq);
    ok('историята е на страници (order=id&limit=1000)', /order=id&limit=1000&offset=0/.test(hq), hq);
    const rq = h.calls.get.filter(function (u) { return u.indexOf('/weekly_checklist_responses') >= 0; });
    ok('становищата — една заявка за 42', rq.length === 1 && rq[0].indexOf('week_number=eq.42') >= 0, rq.join(' | '));
    ok('Силистра не е в prev (нито редове, нито становища)', p && !p.history.some(function (x) { return x.store_name === 'Силистра'; }) &&
       !p.responses.some(function (x) { return x.store_name === 'Силистра'; }));
    ok('prev.rows — само 42', p && p.rows.length > 0 && p.rows.every(function (x) { return x.week_number === 42; }));
    h.close();
  }

  section('2. Блокът');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const html = h.w.reportChecklistResponsesHtml(data.cross);
    ok('заглавие: „Чек лист — становища за седмица 42 (срокът изтече петък 23.10)"',
       html.indexOf('Чек лист — становища за седмица 42 (срокът изтече петък 23.10)') >= 0);
    const rows = rowsOf(h, html);
    ok('3 реда (без „да", без числовата, без Силистра)', rows.length === 3, JSON.stringify(rows));
    ok('1: Шумен · ревизия · 3-та (най-дългата първа)', rows[0] && rows[0][0] === 'Шумен' && rows[0][1] === 'ревизия' && rows[0][2] === '3-та седмица подред', JSON.stringify(rows[0]));
    ok('2: Габрово · справка минуси · 2-ра', rows[1] && rows[1][0] === 'Габрово' && rows[1][2] === '2-ра седмица подред', JSON.stringify(rows[1]));
    ok('3: Враца · ревизия · нова', rows[2] && rows[2][0] === 'Враца' && rows[2][2] === 'нова', JSON.stringify(rows[2]));
    ok('Шумен: текстът ескейпнат', rows[0] && rows[0][3] === 'Протоколът е <b>при РУ</b>' && html.indexOf('<b>при РУ</b>') < 0, rows[0] && rows[0][3]);
    ok('Враца: „няма становище" в червено', rows[2] && rows[2][3] === 'няма становище' &&
       /color:#C0392B[^>]*>няма становище/.test(html));
    ok('18:00:59 София → в срок (без „след срока")', rows[0] && rows[0][3].indexOf('след срока') < 0, rows[0] && rows[0][3]);
    ok('18:01 София → „след срока"', rows[1] && rows[1][3] === 'Подадена късно след срока', rows[1] && rows[1][3]);
    ok('поредица 3+ оцветена', /<tr style="background:#FEF2F2;">/.test(html) && (html.match(/background:#FEF2F2/g) || []).length === 1);
    ok('чуждият обект го няма', html.indexOf('ЧУЖД ОБЕКТ') < 0 && html.indexOf('Силистра') < 0);
    h.close();
  }

  section('3. Нула „не", провал, „Днес"');
  {
    const h = env({ weekly_checklist: function (url) { return url.indexOf('or=') >= 0 ? HIST.filter(function (x) { return x.store_name === 'Силистра'; }) : CUR; } });
    const data = await weekly(h, SCOPE);
    const html = h.w.reportChecklistResponsesHtml(data.cross);
    ok('нула „не" → секцията остава с един сив ред', /color:#94a3b8;">няма „не" за седмица 42</.test(html) && rowsOf(h, html).length === 1, html.slice(0, 400));
    h.close();
  }
  {
    const h = env(null, { GET: /weekly_checklist_responses/ });
    const data = await weekly(h, SCOPE);
    ok('провал на становищата → без prev', data.cross.checklist && !data.cross.checklist.prev);
    ok('… без блока', h.w.reportChecklistResponsesHtml(data.cross) === '');
    ok('… таблицата на чек листа си остава', h.w.buildWeeklyReportHtml(data).indexOf('Чек лист (контролинг) — седмица 43') >= 0);
    h.close();
  }
  {
    const h = env(null, { GET: /weekly_checklist\?or=/ });
    const data = await weekly(h, SCOPE);
    ok('провал на историята → без prev', data.cross.checklist && !data.cross.checklist.prev);
    h.close();
  }
  {
    const h = env();
    const cross = await new Promise(function (res) { h.w.collectCrossModuleWeeklySummary(res, null, null); });
    const sec = h.w.buildCrossModuleSectionHtml(cross);
    ok('„Днес" (кросмодулният колектор направо) — без блока', sec.indexOf('становища за седмица') < 0);
    ok('reportChecklistResponsesHtml({}) → ""', h.w.reportChecklistResponsesHtml({}) === '');
    h.close();
  }

  section('4. Мястото в писмото');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const html = h.w.buildWeeklyReportHtml(data);
    const iTbl = html.indexOf('Чек лист (контролинг) — седмица 43'), iBlk = html.indexOf('Чек лист — становища за седмица 42');
    const iZob = html.indexOf('Каса — Равнение');
    ok('блокът е след таблицата и преди Равнението', iTbl >= 0 && iBlk > iTbl && iZob > iBlk, iTbl + ' / ' + iBlk + ' / ' + iZob);
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
