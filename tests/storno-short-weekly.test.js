/* СЕДМИЧЕН ОТЧЕТ — „Сторна с по-малка нова сума" по правилото на портала
   (решение на Тенчо, 12.11.2026).

   Дотогава отчетът сравняваше сам new_sum < returned_sum и броеше капаро /
   ваучер (900001/900009), които История, банерът и Каса не броят
   (stornoIndicator, kasa.js). Седмици 13.10–08.11.2026: 13/9/8/14 срещу
   12/9/5/13. Сега report.js вика stornoIndicator, а send-scheduled-report носи
   дословно копие (report-edge-sync: COPIED_HELPERS + STORNO_EXEMPT_CODES).

   Покрива:
     1. report.js (kasa.js + bulletin.js + report.js, реалният ред): 2 по-малки,
        1 равна, 1 по-голяма, 1 капаро, 1 ваучер в списък „x / 900009“ (и
        двете с по-малка сума) → stornoShort.total = 2, само двата обекта;
        мокът връща само колоните от select= → без articles в заявката
        капарото и ваучерът биха влезли.
     2. Едж копието: STORNO_EXEMPT_CODES / stornoIsExempt / stornoIndicator,
        извадени от index.ts и подменени в същия колектор (кодът на
        collectCrossModuleWeeklySummary е идентичен в двата файла —
        report-edge-sync) → пак 2; и заявката в index.ts носи articles.
     3. Едж копието дава същото като kasa.js за всеки ред от решетка суми и
        кодове (вкл. липсващи суми и разлика под цент).

   Мутационна проверка (12.11.2026):
     - старото сравнение (new_sum < returned_sum) в report.js — СЪБОРЕН (5 ❌)
     - articles махнато от select-а в report.js              — СЪБОРЕН (4 ❌)
     - копието в index.ts без ваучера ('900009')             — СЪБОРЕН (2 ❌)
   И трите събарят и report-edge-sync (1 ❌ всеки).
   Неубити мутанти: няма. Базата преди кръга: exit 0.

   Пускане:  node tests/storno-short-weekly.test.js .
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const EDGE = path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts');

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };
const WEEK = { from: '2026-09-07', to: '2026-09-13' };

function st(id, store, ret, nw, articles) {
  return { id: id, store_name: store, storno_date: '2026-09-09', returned_sum: ret, new_sum: nw,
           articles: articles, status: 'draft', reason: 'грешка', store_comment: null,
           created_at: '2026-09-09T10:00:00.000Z' };
}
const SIX = [
  st('s1', 'Враца',   20, 15, '123456'),            /* по-малка */
  st('s2', 'Габрово', 50, 49.99, '234567'),         /* по-малка с цент */
  st('s3', 'Шумен',   10, 10, '345678'),            /* равна */
  st('s4', 'Шумен',   8, 12, '456789'),             /* по-голяма */
  st('s5', 'Добрич',  200, 0, '900001'),            /* капаро с по-малка — НЕ */
  st('s6', 'Троян',   90, 10, '567890 / 900009')    /* ваучер в списък — НЕ */
];

/* Мини-PostgREST: storno_date gte/lte и САМО колоните от select=. */
function pgStorno(rows) {
  return function (url) {
    const q = decodeURIComponent(url.split('?')[1] || '');
    const get = re => (q.match(re) || [])[1];
    const sGte = get(/storno_date=gte\.([^&]+)/), sLte = get(/storno_date=lte\.([^&]+)/);
    const sel = get(/select=([^&]+)/);
    const cols = sel ? sel.split(',') : null;
    return rows.filter(r => (!sGte || r.storno_date >= sGte) && (!sLte || r.storno_date <= sLte))
      .map(r => { if (!cols) return r; const o = {}; cols.forEach(c => { if (c in r) o[c] = r[c]; }); return o; });
  };
}

function env() {
  const h = boot({
    modules: ['kasa.js', 'bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: ['Враца', 'Габрово', 'Шумен', 'Добрич', 'Троян'].map(s => ({ store_name: s })),
      bulletins: [], bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], report_snapshots: [], app_settings: [], weekly_checklist_metrics: [], weekly_checklist: [],
      differences_reports: [], stock_differences: [], stock_returns: [], kasa_zoborot: [], goods_transit: [],
      transport_pallets: [], client_orders: [], transport_orders: [],
      kasa_storno: pgStorno(SIX)
    }
  });
  const Real = h.w.Date, fixedMs = new Real('2026-09-13T21:00:00').getTime();
  h.w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(fixedMs); else super(...a); }
    static now() { return fixedMs; }
  };
  return h;
}
const cross = h => new Promise(res => { h.w.collectCrossModuleWeeklySummary(res, WEEK, null); });

/* Копието от index.ts: декларацията на кодовете + двете функции, дословно. */
const edgeSrc = fs.readFileSync(EDGE, 'utf8');
function edgeBlock(re) { const m = edgeSrc.match(re); return m ? m[0] : null; }
function topFn(name) {
  const i = edgeSrc.indexOf('\nfunction ' + name + '(');
  if (i < 0) return null;
  const j = edgeSrc.indexOf('\n}\n', i);
  return j < 0 ? null : edgeSrc.slice(i + 1, j + 2);
}
const EDGE_CODE = [
  edgeBlock(/^var STORNO_EXEMPT_CODES = \[[^\]]*\];/m), topFn('stornoIsExempt'), topFn('stornoIndicator')
];
function edgeRule() {
  if (EDGE_CODE.some(x => !x)) return null;
  const ctx = {};
  vm.runInNewContext(EDGE_CODE.join('\n') + '\nthis.stornoIndicator = stornoIndicator;', ctx);
  return ctx.stornoIndicator;
}

(async function () {

  section('1. report.js — 2 по-малки + равна + по-голяма + капаро + ваучер → 2');
  {
    const h = env();
    const c = await cross(h);
    const sh = c && c.stornoShort;
    if (ok('stornoShort го има', !!sh, JSON.stringify(c && Object.keys(c)))) {
      ok('общо 2', sh.total === 2, 'реално: ' + sh.total);
      const stores = sh.byStore.map(g => g.store).sort().join(',');
      ok('обектите: Враца и Габрово', stores === 'Враца,Габрово', stores);
      ok('обща разлика 5.01 (5.00 + 0.01)', sh.diff === 5.01, String(sh.diff));
    }
    h.close();
  }

  section('2. Едж копието в същия колектор → 2; заявката в index.ts носи articles');
  {
    const rule = edgeRule();
    if (ok('копието (кодове + stornoIsExempt + stornoIndicator) се изважда от index.ts', !!rule, EDGE_CODE.map(x => !!x).join(','))) {
      const h = env();
      let calls = 0;
      h.w.stornoIndicator = function (a, b, c) { calls++; return rule(a, b, c); };
      const c = await cross(h);
      const sh = c && c.stornoShort;
      ok('контрола: колекторът вика подменената функция (по веднъж на ред)', calls === SIX.length, 'извиквания: ' + calls);
      ok('с правилото от index.ts: общо 2', !!sh && sh.total === 2, 'реално: ' + (sh && sh.total));
      h.close();
    }
    ok('заявката по storno_date в index.ts носи articles',
      /select=store_name,storno_date,returned_sum,new_sum,articles,reason,store_comment,status&/.test(edgeSrc));
    ok('и броенето в index.ts минава през stornoIndicator(x.returned_sum, x.new_sum, x.articles)',
      edgeSrc.indexOf('if (!stornoIndicator(x.returned_sum, x.new_sum, x.articles).flagged) return;') >= 0);
  }

  section('3. Едж копието = kasa.js за решетка от суми и кодове');
  {
    const rule = edgeRule();
    const h = env();
    const sums = [null, '', 0, 10, '10', 9.995, 10.004, 10.01, 9.99, '9.99', 0.005];
    const codes = [null, '', '123456', '900001', '900009', '123 / 900001', '900009/123', '9000010', ' 900001 '];
    let n = 0, bad = [];
    sums.forEach(a => sums.forEach(b => codes.forEach(c => {
      n++;
      const k = h.w.stornoIndicator(a, b, c), e = rule ? rule(a, b, c) : null;
      if (!e || k.flagged !== e.flagged || k.diff !== e.diff || !!k.exempt !== !!e.exempt) bad.push([a, b, c].join('|'));
    })));
    ok('еднакво за всичките ' + n + ' комбинации', bad.length === 0, bad.slice(0, 5).join('  ;  '));
    h.close();
  }

  report();
})();
