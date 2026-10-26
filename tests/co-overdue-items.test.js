/* АРТИКУЛИТЕ В „ПРОСРОЧЕНИ КЛИЕНТСКИ ЗАЯВКИ — ЦО" (type 'co_overdue', v60).
   Повод: Теодор, 15.10.2026 — „би било удобно да се виждат артикулите".
   Зарежда РЕАЛНИЯ supabase/functions/send-scheduled-report/index.ts (типовете
   махнати с node:module.stripTypeScriptTypes) във vm и вика истинския
   Deno.serve handler. Фалшивият fetch връща САМО колоните от select= — тоест
   липсващо items/product/sap/qty/unit в заявката изпразва артикулите, както би
   станало срещу PostgREST.

   Покрива: 1 артикул; 3 артикула в реда на items; color празен / „7016";
   резервният ред от product/sap/qty/unit; нищо попълнено → без сив ред;
   „—" се пропуска; <script> е ескейпнат; обработена заявка — артикули И
   коментар, артикулите преди коментара; dry_run носи броя артикули.

   Мутации (ръчно, всяка събаря теста): items махнато от select; esc() махнат
   около реда; .reverse() върху артикулите. Не се хваща: смяна на стила
   (цвят/размер) на сивия ред — проверява се само наличието на color:#64748b.

   Пускане:  node tests/co-overdue-items.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const EDGE = path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts');
const SRC = fs.readFileSync(EDGE, 'utf8');
const _w = process.emitWarning; process.emitWarning = function () {};
const JS = nodeModule.stripTypeScriptTypes(SRC);
process.emitWarning = _w;

const CO = 'Централен офис';
const mk = (id, over) => Object.assign({
  id, in_num: id, store_name: 'Троян', customer_name: 'Клиент ' + id, fulfiller: CO,
  status: 'pending', delivery: '2026-10-02', co_eta: null, co_note: null, co_processed_by: null,
  date: '2026-10-01', created_at: '2026-10-01T08:00:00.000Z',
  items: null, product: null, sap: null, qty: null, unit: null
}, over || {});

/* Часовник: сряда 07.10.2026, 08:00 по София */
const CLOCK = '2026-10-07T05:00:00Z';

function load(tables) {
  const posts = [], gets = [];
  let handler = null;
  const Real = Date, fixed = new Real(CLOCK).getTime();
  class FakeDate extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  const ctx = {
    Date: FakeDate, Response, console, Intl, JSON, Math, Object, Array, String, Number, Promise, encodeURIComponent, setTimeout,
    Deno: { env: { get: k => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'KEY') }, serve: fn => { handler = fn; } },
    fetch: (url, init) => {
      init = init || {};
      if ((init.method || 'GET') === 'POST') {
        posts.push({ url, body: JSON.parse(init.body) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      gets.push(url);
      const t = /\/rest\/v1\/([a-z_]+)/.exec(url);
      let rows = JSON.parse(JSON.stringify((t && tables[t[1]]) || []));
      /* Само колоните от select= — като PostgREST */
      const m = /[?&]select=([^&]*)/.exec(url);
      if (m) {
        const cols = decodeURIComponent(m[1]).split(',');
        rows = rows.map(r => { const o = {}; cols.forEach(c => { if (c in r) o[c] = r[c]; }); return o; });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
    }
  };
  vm.createContext(ctx);
  vm.runInContext(JS, ctx, { filename: 'send-scheduled-report.js' });
  const call = async body => (await handler({ json: () => Promise.resolve(body) })).json();
  return { ctx, call, posts, gets };
}

const RECIP = [{ email: 't.tenev@temax.bg', name: 'Теодор', active: true, co_overdue: true }];

const ORDERS = [
  mk('A-ONE', { items: [{ product: 'Ламинат Дъб Натурал 8мм', sap: '48289', qty: 38.822, unit: 'кв.м', color: '' }] }),
  mk('B-THREE', { delivery: '2026-10-01', items: [
    { product: 'Първи артикул', sap: '111', qty: 1, unit: 'бр.', color: null },
    { product: 'Втори артикул', sap: '222', qty: 2, unit: 'бр.', color: '7016' },
    { product: 'Трети артикул', sap: '333', qty: 3, unit: 'бр.', color: '—' }
  ] }),
  mk('C-FALLBACK', { items: [], product: 'Резервен продукт', sap: '777', qty: 5, unit: 'л' }),
  mk('D-EMPTY', { items: [], product: '', sap: '—', qty: null, unit: '' }),
  mk('E-XSS', { items: [{ product: '<script>alert(1)</script>', sap: '9', qty: 1, unit: 'бр.' }] }),
  mk('F-PROC', { status: 'processed', delivery: '2026-10-01', co_eta: '2026-10-06', co_note: 'Поръчано при доставчика',
    co_processed_by: 'Снабдяване', items: [{ product: 'Боя фасадна', sap: '5050', qty: 4, unit: 'бр.', color: 'RAL 9010' }] })
];

/* Сивите редове (артикули/коментар) веднага след основния ред на заявка с № id */
function greyRowsAfter(html, id) {
  const start = html.indexOf('>' + id + '</td>');
  if (start < 0) return null;
  const rest = html.slice(html.indexOf('</tr>', start) + 5);
  const out = [];
  const re = /^<tr><td colspan="\d+" style="[^"]*color:#64748b;font-size:10\.5px;">(.*?)<\/td><\/tr>/;
  let s = rest, m;
  while ((m = re.exec(s))) { out.push(m[1]); s = s.slice(m[0].length); }
  return out;
}

(async function () {
  const L = load({ client_orders: ORDERS, report_recipients: RECIP });
  const r = await L.call({ type: 'co_overdue' });
  const html = (L.posts[0] && L.posts[0].body && L.posts[0].body.html) || '';

  section('0. Писмото тръгна, заявката тегли артикулите');
  {
    ok('едно писмо', L.posts.length === 1 && r.ok !== false, JSON.stringify(r));
    const q = L.gets.find(u => u.indexOf('/client_orders') >= 0) || '';
    const sel = decodeURIComponent((/select=([^&]*)/.exec(q) || [])[1] || '').split(',');
    ['items', 'product', 'sap', 'qty', 'unit'].forEach(c => ok('select съдържа ' + c, sel.indexOf(c) >= 0, sel.join(',')));
    ok('html не е празен', html.length > 500);
  }

  section('1. Един артикул');
  {
    const g = greyRowsAfter(html, 'A-ONE');
    ok('точно един сив ред', g && g.length === 1, JSON.stringify(g));
    ok('„… · SAP 48289 · 38.822 кв.м"', g && g[0] === 'Ламинат Дъб Натурал 8мм · SAP 48289 · 38.822 кв.м', g && g[0]);
    ok('празен color → без „цвят"', g && g[0].indexOf('цвят') < 0);
  }

  section('2. Три артикула — в реда на items');
  {
    const g = greyRowsAfter(html, 'B-THREE');
    ok('три сиви реда', g && g.length === 3, JSON.stringify(g));
    ok('първи', g && g[0] === 'Първи артикул · SAP 111 · 1 бр.', g && g[0]);
    ok('втори с цвят 7016', g && g[1] === 'Втори артикул · SAP 222 · 2 бр. · цвят 7016', g && g[1]);
    ok('трети: color „—" се пропуска', g && g[2] === 'Трети артикул · SAP 333 · 3 бр.', g && g[2]);
  }

  section('3. Резервен ред и празно');
  {
    const g = greyRowsAfter(html, 'C-FALLBACK');
    ok('items празен → ред от product/sap/qty/unit', g && g.length === 1 && g[0] === 'Резервен продукт · SAP 777 · 5 л', JSON.stringify(g));
    const e = greyRowsAfter(html, 'D-EMPTY');
    ok('нищо попълнено (и „—") → няма сив ред', e && e.length === 0, JSON.stringify(e));
    ok('заявката без артикули все пак е в писмото', html.indexOf('>D-EMPTY</td>') >= 0);
  }

  section('4. Ескейп');
  {
    ok('<script> не стои суров', html.indexOf('<script>alert(1)</script>') < 0);
    const g = greyRowsAfter(html, 'E-XSS');
    ok('ескейпнат в сивия ред', g && g[0] === '&lt;script&gt;alert(1)&lt;/script&gt; · SAP 9 · 1 бр.', g && g[0]);
  }

  section('5. Обработена заявка — артикули И коментар');
  {
    const g = greyRowsAfter(html, 'F-PROC');
    ok('два сиви реда: артикулът, после коментарът', g && g.length === 2, JSON.stringify(g));
    ok('артикулът с цвят', g && g[0] === 'Боя фасадна · SAP 5050 · 4 бр. · цвят RAL 9010', g && g[0]);
    ok('коментарът и обработил след артикулите', g && g[1] === 'Коментар от ЦО: Поръчано при доставчика · Обработил: Снабдяване', g && g[1]);
    ok('секция 2 е с 7 колони (colspan)', /<tr><td colspan="7"[^>]*>Боя фасадна/.test(html));
    ok('секция 1 е с 6 колони (colspan)', /<tr><td colspan="6"[^>]*>Ламинат/.test(html));
  }

  section('6. Колоните и темата не са пипнати');
  {
    ['Обект', '№', 'Клиент', 'Срок', 'Дата от ЦО', 'Просрочие (раб. дни)', 'Чака (раб. дни)'].forEach(c =>
      ok('колона „' + c + '"', html.indexOf('>' + c + '</th>') >= 0));
    ok('няма колона за артикул', html.indexOf('>Артикул</th>') < 0);
    ok('темата', /^Просрочени клиентски заявки — ЦО — 07\.10\.2026 \(6\)$/.test(L.posts[0].body.subject), L.posts[0].body.subject);
  }

  section('7. dry_run — броят артикули, без текста им');
  {
    const D = load({ client_orders: ORDERS, report_recipients: RECIP });
    const d = await D.call({ type: 'co_overdue', dry_run: true });
    const b = d.pending.first5.find(x => x.in_num === 'B-THREE');
    ok('B-THREE: items 3', b && b.items === 3, JSON.stringify(b));
    const e = d.pending.first5.find(x => x.in_num === 'D-EMPTY');
    ok('D-EMPTY (ако е в първите 5): items 0', !e || e.items === 0, JSON.stringify(e));
    ok('без текста на артикулите', JSON.stringify(d).indexOf('артикул') < 0 && JSON.stringify(d).indexOf('48289') < 0);
    ok('нищо не се праща', D.posts.length === 0);
  }

  report();
})().catch(e => { console.error(e); process.exit(1); });
