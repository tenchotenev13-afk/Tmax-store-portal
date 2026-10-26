/* Сверка: checklist.js срещу checklist_portal_values() в базата
   (checklist-live-calc, етап 1 от 3; 26.10.2026).

   Зарежда ИСТИНСКИТЕ shared.js + bulletin.js + checklist.js в jsdom, насочва
   fetch към живия PostgREST САМО ЗА ЧЕТЕНЕ (всеки метод, различен от GET, и
   всеки адрес извън REST хвърля), смята колоните с JS за дадените седмици
   (checklistRecurringChanges + checklistModuleChanges с празен индекс — тоест
   ВСИЧКИ стойности, не само промените) и ги сравнява клетка по клетка с
   GET /rpc/checklist_portal_values за същите седмици.

   Пускане:  node tools/checklist-parity.js [седмици…]     (по подразбиране 40 41 42 43)
             node tools/checklist-parity.js 40 41 --table   (+ пълната таблица в markdown)
   Exit 0 = нула разлики. Часовата зона е Europe/Sofia — като браузъра на обектите.

   ЗАБЕЛЕЖКА: „Стока на път" и „Стока за връщане" и в JS, и в SQL са снимка на
   цялата таблица към момента — не зависят от седмицата. Затова двете страни
   трябва да се пуснат в една и съща минута; скриптът го прави. */
process.env.TZ = 'Europe/Sofia';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const TABLE = args.indexOf('--table') >= 0;
const WEEKS = args.filter(a => /^\d+$/.test(a)).map(Number);
const YEAR = 2026;
if (!WEEKS.length) WEEKS.push(40, 41, 42, 43);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/' });
const w = dom.window;

/* ── само четене ── */
let API = null, H = null;
w.fetch = function (url, opts) {
  const method = String((opts && opts.method) || 'GET').toUpperCase();
  if (method !== 'GET') throw new Error('checklist-parity: забранен ' + method + ' ' + url);
  if (!API || String(url).indexOf(API + '/') !== 0) throw new Error('checklist-parity: адрес извън REST: ' + url);
  return fetch(url, { method: 'GET', headers: (opts && opts.headers) || H });
};
w.toast = function (m) { console.error('[toast] ' + m); };
w.console = console;

for (const f of ['shared.js', 'bulletin.js', 'checklist.js']) {
  w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
}
API = w.eval('API'); H = w.eval('H');
w.toast = function (m) { console.error('[toast] ' + m); };

async function jsValues(week) {
  w.eval('checklistYear = ' + YEAR + '; checklistWeek = ' + week + ';');
  const metrics = await w.sbGet('weekly_checklist_metrics', 'active=eq.true&order=sort_order');
  w.checklistMetrics = metrics;
  w.eval('checklistMetrics = window.checklistMetrics;');
  const stores = await w.loadReportableStores();
  w.eval('checklistStores = ' + JSON.stringify(stores) + ';');
  const parts = await Promise.all([w.checklistRecurringChanges({}), w.checklistModuleChanges({})]);
  const out = {};
  parts[0].concat(parts[1]).forEach(c => { out[c.store + '|' + c.metric_key] = c.value; });
  return { values: out, stores: stores, metrics: metrics };
}

async function sqlValues(week) {
  const r = await fetch(API + '/rpc/checklist_portal_values?p_year=' + YEAR + '&p_week=' + week, { headers: H });
  const d = await r.json();
  if (!r.ok || !Array.isArray(d)) throw new Error('rpc ' + r.status + ': ' + JSON.stringify(d).slice(0, 300));
  const out = {}, keys = {};
  d.forEach(x => { out[x.store_name + '|' + x.metric_key] = x.value; keys[x.metric_key] = 1; });
  return { values: out, rows: d.length, keys: Object.keys(keys) };
}

(async function () {
  let totalDiff = 0, totalCells = 0;
  const report = [];
  for (const week of WEEKS) {
    const [js, sql] = await Promise.all([jsValues(week), sqlValues(week)]);
    const keys = sql.keys.slice().sort((a, b) => {
      const ia = js.metrics.findIndex(m => m.key === a), ib = js.metrics.findIndex(m => m.key === b);
      return ia - ib;
    });
    const diffs = [];
    js.stores.forEach(s => keys.forEach(k => {
      totalCells++;
      const a = js.values[s + '|' + k];
      const b = sql.values[s + '|' + k];
      const av = (a === undefined || a === null) ? null : a;
      const bv = (b === undefined || b === null) ? null : b;
      if (av !== bv) diffs.push({ store: s, key: k, js: av, sql: bv });
    }));
    /* JS стойност за колона, която SQL изобщо не връща. */
    Object.keys(js.values).forEach(id => {
      const k = id.split('|')[1];
      if (keys.indexOf(k) < 0) diffs.push({ store: id.split('|')[0], key: k, js: js.values[id], sql: '(колоната липсва в SQL)' });
    });
    totalDiff += diffs.length;
    report.push('Седмица ' + week + '/' + YEAR + ': ' + js.stores.length + ' обекта × ' + keys.length + ' колони = ' +
      (js.stores.length * keys.length) + ' клетки; SQL редове ' + sql.rows + '; разлики: ' + diffs.length);
    diffs.forEach(d => report.push('  ≠ ' + d.store + ' · ' + d.key + ' · JS ' + JSON.stringify(d.js) + ' · SQL ' + JSON.stringify(d.sql)));
    if (TABLE) {
      report.push('', '| Обект | ' + keys.join(' | ') + ' |', '|---|' + keys.map(() => '---').join('|') + '|');
      js.stores.forEach(s => {
        report.push('| ' + s + ' | ' + keys.map(k => {
          const a = js.values[s + '|' + k], b = sql.values[s + '|' + k];
          const av = a == null ? '∅' : a, bv = b == null ? '∅' : b;
          return av === bv ? av : (av + ' ≠ ' + bv);
        }).join(' | ') + ' |');
      });
      report.push('');
    }
  }
  report.push('ОБЩО: ' + totalCells + ' клетки, ' + totalDiff + ' разлики');
  console.log(report.join('\n'));
  process.exitCode = totalDiff === 0 ? 0 : 1;
  w.close();
})().catch(e => { console.error(e); process.exitCode = 2; w.close(); });
