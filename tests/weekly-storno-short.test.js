/* СЕДМИЧЕН ОТЧЕТ — секция „Сторна с по-малка нова сума" (Тенчо, 30.09.2026).

   Замества „Сторна под N €". Критерий: kasa_storno с storno_date в
   отчетната седмица и new_sum < returned_sum. Таблица по обект (брой +
   обща разлика) и под нея списък по обект: дата, върната, нова, разлика,
   причина, коментар на обекта, статус. storno_small_threshold не се чете.

   Какво заковава файлът:
     a) new < returned влиза; new = returned и new > returned — не;
        извън седмицата и извън обхвата — не
     b) таблицата по обект и списъкът с коментара на магазина и статуса
     c) празна седмица → „Няма сторна с по-малка нова сума тази седмица"
     d) заявката по storno_date носи new_sum, reason, store_comment, status;
        app_settings за storno_small_threshold не се чете
     e) НИЩО ДРУГО НЕ СЕ ПРОМЕНЯ: целият седмичен отчет със същите данни,
        без секцията на сторната, е байт по байт като отчета отпреди
        промяната (f0f070c), също без неговата секция „Сторна под 5 €".
        Отчетът отпреди е в tests/fixtures/weekly-before-storno-short.html —
        фикстура, защото CI чекаутът е плитък и стар блоб може да липсва.
   Двете копия (report.js и send-scheduled-report) — report-edge-sync.test.js.

   Пускане:  node tests/weekly-storno-short.test.js .
   Фикстурата се прави наново само от СТАРИЯ код:
     GEN_OLD_FIXTURE=<чекаут на f0f070c> node tests/weekly-storno-short.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const FIXTURE = path.join(__dirname, 'fixtures', 'weekly-before-storno-short.html');
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const SCOPE = ['Враца', 'Габрово', 'Шумен'];
const WEEK = { from: '2026-09-07', to: '2026-09-13' };   /* седмица 37 · 2026 */

function st(store, date, ret, nw, extra) {
  return Object.assign({ store_name: store, storno_date: date, returned_sum: ret, new_sum: nw,
    created_by: 'Касиер', article_name: 'Артикул', status: 'draft', reason: 'грешка',
    store_comment: null, created_at: date + 'T10:00:00.000Z' }, extra || {});
}
const STORNO = [
  st('Враца', '2026-09-08', 20, 15, { reason: 'грешен артикул', store_comment: 'клиентът взе по-евтин', status: 'resubmitted' }), /* влиза: 5.00 */
  st('Враца', '2026-09-10', 10, 10),                                  /* равни — не */
  st('Враца', '2026-09-11', 8, 12),                                   /* нова по-голяма — не */
  st('Враца', '2026-09-12', 3.5, 0, { status: 'returned', reason: 'отказ' }), /* влиза: 3.50, без коментар */
  st('Габрово', '2026-09-09', 50, 49.99),                             /* влиза: 0.01 */
  st('Габрово', '2026-09-13', 4.99, 4.99),                            /* равни (беше „под 5 €") — не */
  st('Габрово', '2026-09-06', 30, 1),                                 /* неделя ПРЕДИ седмицата — не */
  st('Габрово', '2026-09-14', 30, 1),                                 /* понеделник СЛЕД — не */
  st('Габрово', '2026-09-11', 2, 1.5, { created_at: '2026-10-02T10:00:00.000Z' }), /* въведена по-късно — влиза */
  st('Силистра', '2026-09-09', 9, 1)                                  /* извън обхвата — не */
];

/* Мини-PostgREST за kasa_storno: storno_date gte/lte и created_at gte/lt. */
function pgStorno(rows) {
  return function (url) {
    const q = decodeURIComponent(url.split('?')[1] || '');
    const get = re => (q.match(re) || [])[1];
    const sGte = get(/storno_date=gte\.([^&]+)/), sLte = get(/storno_date=lte\.([^&]+)/);
    const cGte = get(/created_at=gte\.([^&]+)/), cLt = get(/created_at=lt\.([^&]+)/);
    return rows.filter(r =>
      (!sGte || r.storno_date >= sGte) && (!sLte || r.storno_date <= sLte) &&
      (!cGte || r.created_at >= cGte) && (!cLt || r.created_at < cLt));
  };
}

const USERS = ['Враца', 'Габрово', 'Шумен', 'Силистра', 'Централен офис'].map(s => ({ store_name: s }));
/* Данни и за ОСТАНАЛИТЕ секции — сравнението в e) има смисъл само ако те
   рендират нещо. */
const OTHER = {
  differences_reports: [
    { id: 'd1', store_name: 'Враца', direction: 'supplier', reviewed: false, created_at: '2026-09-08T09:00:00.000Z' },
    { id: 'd2', store_name: 'Габрово', direction: 'inter', reviewed: true, created_at: '2026-08-20T09:00:00.000Z' }
  ],
  stock_differences: [
    { report_id: 'd1', store_name: 'Враца', status: 'open', warehouse_response: null, store_response: null },
    { report_id: 'd2', store_name: 'Габрово', status: 'open', warehouse_response: 'ok', store_response: null }
  ],
  stock_returns: [
    { store_name: 'Враца', status: 'pending', supplier: 'Доставчик А', created_at: '2026-09-01T09:00:00.000Z' },
    { store_name: 'Шумен', status: 'done', supplier: 'Доставчик Б', created_at: '2026-09-09T09:00:00.000Z' }
  ],
  kasa_zoborot: [
    { store_name: 'Враца', date: '2026-09-09', status: 'draft', razlika: 1 },
    { store_name: 'Габрово', date: '2026-09-10', status: 'returned', razlika: -2 }
  ],
  goods_transit: [
    { store_name: 'Габрово', supplier: 'Склад', doc_date: '2026-08-25', status: 'sent', direction: 'in', remaining_qty: 3, unit: 'бр', material_name: 'Стелаж' }
  ],
  transport_pallets: [{ store_name: 'Враца', report_date: '2026-09-11' }],
  client_orders: [
    { id: 'co1', in_num: 'Враца-0010', store_name: 'Враца', customer_name: 'Клиент', fulfiller: 'Враца', delivery: 'pickup', status: 'new', co_eta: '2026-09-01', created_at: '2026-08-20T09:00:00.000Z', date: '2026-08-20' }
  ],
  transport_orders: []
};

function env(storno, repo) {
  const h = boot({
    repo: repo,
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: Object.assign({
      users: USERS, bulletins: [{ id: 'b-37', week_number: 37, year: 2026, status: 'published' }],
      bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], report_snapshots: [], app_settings: [{ key: 'storno_small_threshold', value: '5' }],
      weekly_checklist_metrics: [], weekly_checklist: [],
      kasa_storno: pgStorno(storno || STORNO)
    }, OTHER)
  });
  /* Неделя 21:00 — моментът на крона; отчетната седмица е текущата (37). */
  const Real = h.w.Date, fixedMs = new Real('2026-09-13T21:00:00').getTime();
  h.w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  };
  return h;
}
const weekly = (h, scope) => new Promise(res => { h.w.collectWeeklyReportData(res, scope); });
const cross = (h, scope) => new Promise(res => { h.w.collectCrossModuleWeeklySummary(res, WEEK, scope); });

/* Отчетът без секцията на сторната: изрязва ТОЧНИЯ HTML на секцията
   (веднъж) — всичко друго остава байт по байт. */
function withoutSection(html, sec) {
  const i = html.indexOf(sec);
  if (!sec || i < 0 || html.indexOf(sec, i + 1) >= 0) return null;
  return html.slice(0, i) + html.slice(i + sec.length);
}

(async function () {

  if (process.env.GEN_OLD_FIXTURE) {
    /* Само за СТАРИЯ код: секцията там е reportSmallStornoHtml. */
    const repo = path.resolve(process.env.GEN_OLD_FIXTURE);
    const h = env(null, repo);
    const data = await weekly(h, SCOPE);
    const html = h.w.buildWeeklyReportHtml(data);
    const rest = withoutSection(html, h.w.reportSmallStornoHtml(data.cross));
    if (!rest) { console.error('старата секция не е намерена точно веднъж'); process.exit(1); }
    fs.writeFileSync(FIXTURE, rest);
    console.log('фикстура: ' + FIXTURE + ' (' + rest.length + ' знака)');
    h.close();
    return;
  }

  section('a) критерият: new_sum < returned_sum, седмицата, обхватът');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const sh = c && c.stornoShort;
    if (ok('stornoShort го има при затворен прозорец', !!sh, JSON.stringify(c && Object.keys(c)))) {
      const byStore = {};
      sh.byStore.forEach(g => { byStore[g.store] = g; });
      ok('общо 4 бр.: Враца 2, Габрово 2', sh.total === 4 && byStore['Враца'].count === 2 && byStore['Габрово'].count === 2, JSON.stringify(sh.byStore.map(g => [g.store, g.count])));
      ok('обща разлика 9.01 (5.00 + 3.50 + 0.01 + 0.50)', sh.diff === 9.01, String(sh.diff));
      ok('Враца: разлика 8.50', byStore['Враца'].diff === 8.5, String(byStore['Враца'].diff));
      const vr = byStore['Враца'].items.map(i => i.date);
      ok('new = returned (10/10) и new > returned (8/12) НЕ влизат', vr.join(',') === '2026-09-08,2026-09-12', vr.join(','));
      const gb = byStore['Габрово'].items.map(i => i.date);
      ok('Габрово 4.99 = 4.99 (беше „под 5 €") НЕ влиза; 0.01 разлика влиза', gb.indexOf('2026-09-13') < 0 && gb.indexOf('2026-09-09') >= 0, gb.join(','));
      ok('неделя преди и понеделник след седмицата НЕ влизат', gb.indexOf('2026-09-06') < 0 && gb.indexOf('2026-09-14') < 0);
      ok('въведена седмици по-късно — влиза по storno_date', gb.indexOf('2026-09-11') >= 0);
      ok('Силистра (извън обхвата) не влиза, Шумен (без такива) — няма ред', !byStore['Силистра'] && !byStore['Шумен']);
      ok('списъкът е по дата', gb.join(',') === '2026-09-09,2026-09-11', gb.join(','));
    }
    const all = await cross(h, null);
    ok('контрола: без обхват Силистра Е вътре — решава scope', all.stornoShort.byStore.some(g => g.store === 'Силистра'));
    h.close();
  }

  section('b) рендер: таблица по обект + списък с коментара и статуса');
  {
    const h = env();
    const c = await cross(h, SCOPE);
    const html = h.w.reportStornoShortHtml(c);
    const div = h.doc.createElement('div'); div.innerHTML = html;
    const txt = div.textContent;
    ok('заглавие „Сторна с по-малка нова сума"', /Сторна с по-малка нова сума \(4 бр\., разлика 9\.01 €\)/.test(txt), txt.slice(0, 120));
    ok('подзаглавие', txt.indexOf('Новата бележка е по-малка от върнатата. Проверете дали има обяснение.') >= 0);
    const tables = div.querySelectorAll('table');
    ok('таблица по обект + по един списък на обект (3 таблици)', tables.length === 3, String(tables.length));
    const sumRows = Array.from(tables[0].querySelectorAll('tr')).slice(1).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()).join('|'));
    ok('таблицата: Враца 2 бр. 8.50 €, Габрово 2 бр. 0.51 €', sumRows.join(' / ') === 'Враца|2|8.50 € / Габрово|2|0.51 €', sumRows.join(' / '));
    const vrRows = Array.from(tables[1].querySelectorAll('tr')).slice(1).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));
    ok('Враца, ред 1: 08.09 · 20.00 · 15.00 · 5.00 · причина · коментар · статус',
      vrRows[0] && vrRows[0].join('|') === '08.09|20.00 €|15.00 €|5.00 €|грешен артикул|клиентът взе по-евтин|поправено от обекта', vrRows[0] && vrRows[0].join('|'));
    ok('Враца, ред 2: без коментар → „—", статус „върнато за коментар"',
      vrRows[1] && vrRows[1][5] === '—' && vrRows[1][6] === 'върнато за коментар', vrRows[1] && vrRows[1].join('|'));
    ok('няма праг „под 5 €" никъде', txt.indexOf('под 5') < 0);
    h.close();
  }

  section('c) празна седмица → „няма"');
  {
    const h = env([st('Враца', '2026-09-08', 10, 10), st('Враца', '2026-09-09', 5, 7)]);
    const c = await cross(h, SCOPE);
    ok('stornoShort е празен, но го има', c.stornoShort && c.stornoShort.total === 0);
    const html = h.w.reportStornoShortHtml(c);
    ok('„Няма сторна с по-малка нова сума тази седмица"', html.indexOf('Няма сторна с по-малка нова сума тази седмица') >= 0, html);
    const c2 = await new Promise(res => { h.w.collectCrossModuleWeeklySummary(res, null, SCOPE); });
    ok('подвижен прозорец (таб „Днес") → без секция', !c2.stornoShort && h.w.reportStornoShortHtml(c2) === '');
    h.close();
  }

  section('d) заявките');
  {
    const h = env();
    await cross(h, SCOPE);
    const byStorno = h.calls.get.filter(u => u.indexOf('/kasa_storno') >= 0 && u.indexOf('storno_date=') >= 0);
    ok('една заявка по storno_date за седмицата', byStorno.length === 1 &&
      byStorno[0].indexOf('storno_date=gte.2026-09-07') >= 0 && byStorno[0].indexOf('storno_date=lte.2026-09-13') >= 0, byStorno.join(' | '));
    ok('select носи new_sum, reason, store_comment, status',
      /select=store_name,storno_date,returned_sum,new_sum,reason,store_comment,status$/.test(byStorno[0] || ''), byStorno[0]);
    ok('storno_small_threshold не се чете', !h.calls.get.some(u => decodeURIComponent(u).indexOf('storno_small_threshold') >= 0));
    h.close();
  }

  section('e) останалото в седмичния отчет е байт по байт като преди промяната');
  {
    const h = env();
    const data = await weekly(h, SCOPE);
    const html = h.w.buildWeeklyReportHtml(data);
    const sec = h.w.reportStornoShortHtml(data.cross);
    ok('новата секция е вътре точно веднъж', sec.length > 0 && html.split(sec).length === 2);
    const rest = withoutSection(html, sec);
    const before = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : null;
    ok('фикстурата отпреди промяната я има', !!before);
    if (before && rest) {
      const same = rest === before;
      let at = -1;
      if (!same) { for (let i = 0; i < Math.max(rest.length, before.length); i++) if (rest[i] !== before[i]) { at = i; break; } }
      ok('целият отчет без секцията = отчетът отпреди без „Сторна под 5 €" (' + before.length + ' знака)', same,
        same ? '' : 'първа разлика на знак ' + at + ': „' + rest.slice(Math.max(0, at - 60), at + 60) + '" срещу „' + before.slice(Math.max(0, at - 60), at + 60) + '"');
      /* Мястото: секцията стои там, където беше старата — след сторно
         метриките, преди чек листа / Равнението. */
      const iSec = html.indexOf(sec), iMetrics = html.indexOf('Каса — Сторно бележки'), iZob = html.indexOf('Каса — Равнение');
      ok('мястото: след сторно метриките, преди Равнението', iMetrics >= 0 && iMetrics < iSec && iSec < iZob, iMetrics + ' / ' + iSec + ' / ' + iZob);
    }
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
