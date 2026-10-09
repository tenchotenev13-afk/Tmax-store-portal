/* СЕДМИЧЕН ОТЧЕТ: четенията без прозорец минават на страници.

   PostgREST реже отговора на 1000 реда, БЕЗ грешка. На 08.10.2026
   stock_differences е 1011, differences_reports 445, а отворените
   goods_transit 1650 — тоест секциите „Необработени разлики над N дни" и
   „Стока на път" в седмичния отчет броят по непълни данни.

   Стъбът ПАЗИ тавана: връща най-много 1000 реда на заявка и уважава
   limit/offset/order=id.asc, както би направил PostgREST. Без страниране
   в report.js отчетът вижда точно 1000 и броячите излизат 1000, не 1050/1100.

   Тестът чете и ЕДЖ копието (send-scheduled-report/index.ts): reportGetAll там
   трябва да е същият код (заковава се и от report-edge-sync), а заявките —
   същите три, през него.

   Пускане:  node tests/report-paging-1000.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const STORES = ['Враца', 'Габрово', 'Троян', 'Раднево', 'Централен офис'].map(s => ({ store_name: s }));

function dayShift(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function stampShift(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); }

const N_SUP_REPORTS = 1050;   /* непрегледани бланки към доставчик, на 10 дни */
const N_IS_LINES = 1100;      /* редове на една междускладова бланка, без отговор на склада */
const N_TRANSIT = 1100;       /* отворени позиции, doc_date преди 20 дни */

const REPORTS = [];
for (let i = 0; i < N_SUP_REPORTS; i++) {
  REPORTS.push({ id: 'r-' + String(i).padStart(5, '0'), store_name: 'Троян', direction: 'supplier',
                 reviewed: false, created_at: stampShift(-10) });
}
REPORTS.push({ id: 'r-is', store_name: 'Враца', direction: 'interstore', reviewed: false, created_at: stampShift(-10) });

const LINES = [];
for (let i = 0; i < N_IS_LINES; i++) {
  LINES.push({ id: 'l-' + String(i).padStart(5, '0'), report_id: 'r-is', store_name: 'Враца',
               status: 'pending', warehouse_response: null, store_response: null });
}
const TRANSIT = [];
for (let i = 0; i < N_TRANSIT; i++) {
  TRANSIT.push({ id: 't-' + String(i).padStart(5, '0'), store_name: 'Габрово', supplier: 'ТЕСИ',
                 material_name: 'АРТ ' + i, remaining_qty: 1, unit: 'бр', doc_date: dayShift(-20),
                 status: 'pending', direction: 'incoming', created_at: stampShift(-1) });
}

/* PostgREST: най-много 1000 реда на заявка; limit/offset се уважават.
   Брои заявките, за да се види, че страниците наистина са поискани. */
const seen = { differences_reports: [], stock_differences: [], goods_transit: [] };
function capped(table, all) {
  return function (url) {
    seen[table].push(url);
    const off = +((String(url).match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const lim = +((String(url).match(/[?&]limit=(\d+)/) || [])[1] || 1000);
    let rows = all;
    const st = String(url).match(/status=in\.\(([^)]*)\)/);
    if (st) { const a = st[1].split(','); rows = rows.filter(r => a.indexOf(r.status) >= 0); }
    return rows.slice(off, off + Math.min(lim, 1000));
  };
}

function env(failGet) {
  return boot({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    fail: failGet ? { GET: failGet } : undefined,
    data: {
      users: STORES,
      differences_reports: capped('differences_reports', REPORTS),
      stock_differences: capped('stock_differences', LINES),
      goods_transit: capped('goods_transit', TRANSIT),
      client_orders: [], transport_orders: [], stock_returns: [], kasa_storno: [],
      kasa_zoborot: [], transport_pallets: [], app_settings: []
    }
  });
}

(async function () {

  section('1. report.js: секциите броят ВСИЧКИ редове над тавана от 1000');
  {
    const h = env();
    const c = await new Promise(function (res) { h.w.collectCrossModuleWeeklySummary(res, null, null); });
    const ds = c && c.diffStale && c.diffStale.total;
    if (ok('колекторът връща обобщение с diffStale', !!ds)) {
      ok('бланки към доставчик: ' + N_SUP_REPORTS + ' (не 1000)', ds.control === N_SUP_REPORTS, 'реално: ' + ds.control);
      ok('междускладови редове: ' + N_IS_LINES + ' (не 1000)', ds.warehouse === N_IS_LINES, 'реално: ' + ds.warehouse);
    }
    ok('стока на път — застояли: ' + N_TRANSIT + ' (не 1000)', c && c.transitStale === N_TRANSIT, 'реално: ' + (c && c.transitStale));
    const g = ((c && c.transitByStore) || []).filter(x => x.store === 'Габрово')[0];
    ok('стока на път — отворени за Габрово: ' + N_TRANSIT, g && g.open === N_TRANSIT, g ? JSON.stringify(g) : 'няма');

    /* общият брой прочетени редове по таблица — това връща и dry_run */
    const rr = (c && c.rowsRead) || {};
    ok('rowsRead: goods_transit ' + N_TRANSIT + ', differences_reports ' + (N_SUP_REPORTS + 1) +
       ', stock_differences ' + N_IS_LINES,
       rr.goods_transit === N_TRANSIT && rr.differences_reports === N_SUP_REPORTS + 1 && rr.stock_differences === N_IS_LINES,
       JSON.stringify(rr));
    ok('пълно четене → няма partial', c && Array.isArray(c.partial) && c.partial.length === 0, JSON.stringify(c && c.partial));
    const okHtml = h.w.buildCrossModuleSectionHtml(c, false);
    ok('пълно четене → няма червен ред „Непълни данни“ в имейла', okHtml.indexOf('Непълни данни') < 0);

    /* страниците са поискани, в стабилен ред */
    const pageUrls = seen.stock_differences.concat(seen.goods_transit, seen.differences_reports.filter(u => /order=id\.asc/.test(u)));
    ok('поискана е втора страница (offset=1000)', seen.stock_differences.some(u => /offset=1000/.test(u)) &&
       seen.goods_transit.some(u => /offset=1000/.test(u)) &&
       seen.differences_reports.some(u => /offset=1000/.test(u)));
    ok('всяка от трите заявки е със стабилен ред order=id.asc и limit=1000',
       pageUrls.length > 0 && pageUrls.every(u => /order=id\.asc/.test(u) && /limit=1000/.test(u)),
       pageUrls.filter(u => !/order=id\.asc/.test(u) || !/limit=1000/.test(u)).slice(0, 2).join(' | '));
    h.close();
  }

  section('2. Едж копието (index.ts): същият помощник и същите три заявки през него');
  {
    const ts = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    ok('reportGetAll е дефиниран', /\nfunction reportGetAll\(t, q\)\{/.test(ts));
    ok('differences_reports през reportGetAll с order=id.asc',
       /reportGetAll\('differences_reports','select=id,store_name,direction,reviewed,created_at&order=id\.asc'\)/.test(ts));
    ok('stock_differences през reportGetAll с order=id.asc',
       /reportGetAll\('stock_differences','select=report_id,[^']*&order=id\.asc'\)/.test(ts));
    ok('goods_transit през reportGetAll с order=id.asc',
       /reportGetAll\('goods_transit','status=in\.\(pending,sent\)&select=[^']*&order=id\.asc'\)/.test(ts));
    ok('без голи sbGet към трите таблици в колектора',
       !/sbGet\('(stock_differences|goods_transit)'/.test(ts) &&
       !/sbGet\('differences_reports','select=id,store_name/.test(ts));
  }

  section('3. Провалена страница: НЕ се премълчава (.partial → червен ред в имейла)');
  {
    /* втората страница на stock_differences пада */
    const h = env(function (url) { return /stock_differences/.test(url) && /offset=1000/.test(url); });
    const c = await new Promise(function (res) { h.w.collectCrossModuleWeeklySummary(res, null, null); });
    ok('колекторът не хвърля и връща обобщение', !!c);
    const p = ((c && c.partial) || []).filter(x => x.table === 'stock_differences')[0];
    ok('cross.partial носи stock_differences с 1000 прочетени реда', p && p.rows === 1000, JSON.stringify(c && c.partial));
    ok('другите две таблици са пълни', ((c && c.partial) || []).length === 1, JSON.stringify(c && c.partial));
    const html = h.w.buildCrossModuleSectionHtml(c, false);
    ok('имейлът носи „⚠️ Непълни данни — прочетени 1000 реда, четенето прекъсна“',
       html.indexOf('⚠️ Непълни данни — прочетени 1000 реда, четенето прекъсна') >= 0);
    ok('редът е червен (#C0392B)', /#C0392B[^>]*>⚠️ Непълни данни/.test(html));
    h.close();
  }
  {
    /* първата страница на goods_transit пада — 0 прочетени, пак се казва */
    const h = env(function (url) { return /goods_transit/.test(url); });
    const c = await new Promise(function (res) { h.w.collectCrossModuleWeeklySummary(res, null, null); });
    const p = ((c && c.partial) || []).filter(x => x.table === 'goods_transit')[0];
    ok('първа страница на goods_transit пада → partial с 0 реда', p && p.rows === 0, JSON.stringify(c && c.partial));
    const html = h.w.buildCrossModuleSectionHtml(c, false);
    ok('„Непълни данни — прочетени 0 реда“ в имейла',
       html.indexOf('⚠️ Непълни данни — прочетени 0 реда, четенето прекъсна') >= 0);
    h.close();
  }

  section('4. Едж: dry_run за седмичния отчет — без писмо, без запис');
  {
    const ts = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
    const start = ts.indexOf("if (type === 'weekly' && body && body.dry_run === true) {");
    ok('клонът за weekly dry_run съществува', start > 0);
    const end = ts.indexOf('\n    }\n', start);
    const block = ts.slice(start, end);
    ok('вика само кросмодулния колектор', /collectCrossModuleWeeklySummary\(resolve, null, null\)/.test(block) &&
       !/collectWeeklyReportData/.test(block));
    ok('не праща писмо и не пише никъде',
       !/resend-email|sbPost|sbPatch|notification_log|reportSaveSnapshot|fetch\(/.test(block), block.slice(0, 120));
    ok('връща diffStale, transit, rows_read и partial',
       /diffStale:/.test(block) && /transit:/.test(block) && /rows_read: wkCross\.rowsRead/.test(block) && /partial: wkCross\.partial/.test(block));
    const before = ts.indexOf("var recipientsRes: any = await sbGet('report_recipients', 'active=eq.true&' + flagFilter");
    ok('е ПРЕДИ четенето на получателите (рано връщане)', start > 0 && start < before);
    ok('едж sbGetOk е дефиниран', /\nfunction sbGetOk\(t: string, q\?: string\) \{/.test(ts));
  }

  report();
})();
