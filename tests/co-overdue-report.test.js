/* ОТЧЕТ „ПРОСРОЧЕНИ КЛИЕНТСКИ ЗАЯВКИ — ЦО" (type 'co_overdue').
   Зарежда РЕАЛНИЯ supabase/functions/send-scheduled-report/index.ts (типовете
   махнати с node:module.stripTypeScriptTypes) във vm с Deno/fetch стъбове и
   вика истинския Deno.serve handler — тоест проверява маршрутизацията, празника,
   получателите и тялото на писмото, не копие на логиката.

   Покрива: pending късна/в срок; processed с co_eta вчера / днес / утре;
   processed без co_eta; sent/arrived; друг изпълнител; 0 реда; празник
   (22.09.2026); dry_run; получатели; сверка bgHolidaysForYear/isBgWorkday на
   копието с shared.js (всички дни 2020–2035).

   Пускане:  node tests/co-overdue-report.test.js .
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const EDGE = path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts');
const SRC = fs.readFileSync(EDGE, 'utf8');
/* stripTypeScriptTypes е експериментална и пише предупреждение — не е грешка */
const _w = process.emitWarning; process.emitWarning = function () {};
const JS = nodeModule.stripTypeScriptTypes(SRC);
process.emitWarning = _w;

const CO = 'Централен офис';
const mk = (id, over) => Object.assign({
  id, in_num: id, store_name: 'Троян', customer_name: 'Клиент ' + id, fulfiller: CO,
  status: 'pending', delivery: '2026-10-20', co_eta: null, co_note: null, co_processed_by: null,
  date: '2026-10-01', created_at: '2026-10-01T08:00:00.000Z', awaiting_stock: false
}, over || {});

/* Часовник: сряда 07.10.2026, 08:00 по София (05:00 UTC) */
const CLOCK = '2026-10-07T05:00:00Z';

function load(tables, clock) {
  const posts = [], gets = [];
  let handler = null;
  const Real = Date, fixed = new Real(clock || CLOCK).getTime();
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
      const rows = (t && tables[t[1]]) || [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(rows))) });
    }
  };
  vm.createContext(ctx);
  vm.runInContext(JS, ctx, { filename: 'send-scheduled-report.js' });
  const call = async body => {
    const res = await handler({ json: () => Promise.resolve(body) });
    return res.json();
  };
  return { ctx, call, posts, gets };
}

const RECIP = [
  { email: 't.tenev@temax.bg', name: 'Теодор', active: true, co_overdue: true },
  { email: 'V.Shikova@temax.bg', name: 'Васка', active: true, co_overdue: true },
  { email: 'v.shikova@temax.bg', name: 'Васка (дубликат)', active: true, co_overdue: true },
  { email: 'off@temax.bg', name: 'Неактивен', active: false, co_overdue: true },
  { email: 'other@temax.bg', name: 'Без флаг', active: true, co_overdue: false }
];

const ORDERS = [
  mk('P-LATE', { delivery: '2026-10-02' }),                                   /* 5 дни просрочие → секция 1 */
  mk('P-OLDER', { delivery: '2026-09-25', store_name: 'Враца' }),            /* 12 дни → секция 1, най-отгоре */
  mk('P-OK', { delivery: '2026-10-20' }),                                     /* в срок → не */
  mk('P-TODAY', { delivery: '2026-10-07' }),                                  /* срок днес → не */
  mk('P-LOWER', { fulfiller: ' централен ОФИС ', delivery: '2026-10-05' }),   /* същото сравнение като isCentralOffice */
  mk('Q-YDAY', { status: 'processed', delivery: '2026-10-01', co_eta: '2026-10-06', co_note: 'ТЕСИ <поръчка> 45', co_processed_by: 'Снабдяване' }),
  mk('Q-TODAY', { status: 'processed', delivery: '2026-10-01', co_eta: '2026-10-07' }),
  mk('Q-TMRW', { status: 'processed', delivery: '2026-10-01', co_eta: '2026-10-08' }),
  mk('Q-NOETA', { status: 'processed', delivery: '2026-09-30', co_eta: null }),
  mk('Q-NOETA-OK', { status: 'processed', delivery: '2026-10-30', co_eta: null }),
  mk('S-SENT', { status: 'sent', delivery: '2026-09-01' }),
  mk('S-ARR', { status: 'arrived', delivery: '2026-09-01' }),
  mk('S-DONE', { status: 'done', delivery: '2026-09-01' }),
  mk('S-REF', { status: 'refused', delivery: '2026-09-01' }),
  mk('S-POST', { status: 'postponed', delivery: '2026-09-01' }),
  mk('X-OTHER', { fulfiller: 'Логистичен склад Добрич', delivery: '2026-09-01' })
];

(async function () {

  section('1. Секция 1 — pending с изтекъл срок');
  {
    const L = load({ client_orders: ORDERS, report_recipients: RECIP });
    const refD = new L.ctx.Date('2026-10-07T00:00:00');
    const d = L.ctx.reportCoOverdueSections(JSON.parse(JSON.stringify(ORDERS)), refD);
    const p = d.pending.map(x => x.in_num);
    ok('просрочена pending влиза', p.indexOf('P-LATE') >= 0, p.join('|'));
    ok('pending в срок не влиза', p.indexOf('P-OK') < 0);
    ok('pending със срок днес не влиза (още не е просрочена)', p.indexOf('P-TODAY') < 0);
    ok('fulfiller се сравнява като isCentralOffice (регистър/интервали)', p.indexOf('P-LOWER') >= 0);
    ok('друг изпълнител не влиза', p.indexOf('X-OTHER') < 0);
    ok('sent / arrived / done / refused / postponed не влизат',
      ['S-SENT', 'S-ARR', 'S-DONE', 'S-REF', 'S-POST'].every(n => p.indexOf(n) < 0 && d.processed.map(x => x.in_num).indexOf(n) < 0));
    ok('сортиране: най-много дни просрочие отгоре', p.join('|') === 'P-OLDER|P-LATE|P-LOWER', p.join('|'));
    const late = d.pending.find(x => x.in_num === 'P-LATE');
    ok('lateDays = reportLateDays (5), waitDays = reportWaitDays (6)', late.lateDays === 5 && late.waitDays === 6, JSON.stringify(late));
  }

  section('2. Секция 2 — processed с минала/липсваща дата от ЦО');
  {
    const L = load({});
    const refD = new L.ctx.Date('2026-10-07T00:00:00');
    const d = L.ctx.reportCoOverdueSections(JSON.parse(JSON.stringify(ORDERS)), refD);
    const q = d.processed.map(x => x.in_num);
    ok('co_eta вчера → влиза', q.indexOf('Q-YDAY') >= 0, q.join('|'));
    ok('co_eta днес → не влиза', q.indexOf('Q-TODAY') < 0);
    ok('co_eta утре → не влиза', q.indexOf('Q-TMRW') < 0);
    ok('без co_eta и изтекъл срок → влиза', q.indexOf('Q-NOETA') >= 0);
    ok('без co_eta, срокът не е изтекъл → не влиза', q.indexOf('Q-NOETA-OK') < 0);
    const y = d.processed.find(x => x.in_num === 'Q-YDAY');
    ok('просрочието при минала co_eta е от датата на ЦО (1 ден)', y.lateDays === 1, JSON.stringify(y));
    const n = d.processed.find(x => x.in_num === 'Q-NOETA');
    ok('просрочието без co_eta е от срока (7 дни)', n.lateDays === 7, JSON.stringify(n));
    ok('сортиране в секция 2: най-много отгоре', q.join('|') === 'Q-NOETA|Q-YDAY', q.join('|'));
    ok('processed не попада в секция 1', d.pending.every(x => x.in_num.indexOf('Q-') !== 0));
  }

  section('3. Тялото на писмото');
  {
    const L = load({});
    const refD = new L.ctx.Date('2026-10-07T00:00:00');
    const sec = L.ctx.reportCoOverdueSections(JSON.parse(JSON.stringify(ORDERS)), refD);
    const data = { reportDate: '2026-10-07', pending: sec.pending, processed: sec.processed, total: sec.pending.length + sec.processed.length };
    const html = L.ctx.reportCoOverdueHtml(data);
    ok('секция 1 със заглавие', html.indexOf('Необработени с изтекъл срок') >= 0);
    ok('секция 2 със заглавие', html.indexOf('Обработени, но датата от ЦО е минала') >= 0);
    ok('празната co_eta е „без дата от ЦО"', html.indexOf('без дата от ЦО') >= 0);
    ok('показва коментар и обработил, ескейпнати', html.indexOf('Коментар от ЦО: ТЕСИ &lt;поръчка&gt; 45') >= 0 && html.indexOf('Обработил: Снабдяване') >= 0);
    ['Обект', '№', 'Клиент', 'Срок', 'Дата от ЦО', 'Просрочие', 'Чака'].forEach(c =>
      ok('колона „' + c + '"', html.indexOf('>' + c + '</th>') >= 0));
    ok('реда: P-OLDER преди P-LATE', html.indexOf('P-OLDER') < html.indexOf('P-LATE'));
    ok('темата: „Просрочени клиентски заявки — ЦО — 07.10.2026 (5)"',
      L.ctx.reportCoOverdueSubject(data) === 'Просрочени клиентски заявки — ЦО — 07.10.2026 (5)', L.ctx.reportCoOverdueSubject(data));
  }

  section('4. Handler: изпращане, получатели, 0 редa');
  {
    const L = load({ client_orders: ORDERS, report_recipients: RECIP });
    const r = await L.call({ type: 'co_overdue' });
    ok('ok и sent', r.ok === true && r.sent === true, JSON.stringify(r));
    ok('един POST към resend-email', L.posts.length === 1 && /resend-email/.test(L.posts[0].url), String(L.posts.length));
    const to = L.posts[0].body.to;
    ok('едно общо писмо до активните с co_overdue, без дубликат по имейл', to.length === 2 && to[0] === 't.tenev@temax.bg', JSON.stringify(to));
    ok('неактивен и без флаг не получават', to.indexOf('off@temax.bg') < 0 && to.indexOf('other@temax.bg') < 0);
    ok('темата е с ДД.ММ.ГГГГ и брой', /^Просрочени клиентски заявки — ЦО — 07\.10\.2026 \(\d+\)$/.test(L.posts[0].body.subject), L.posts[0].body.subject);
    const q = L.gets.filter(u => /client_orders/.test(u))[0] || '';
    ok('заявката е за pending+processed и Централен офис',
      q.indexOf('status=in.(pending,processed)') >= 0 && decodeURIComponent(q).indexOf('fulfiller=ilike.Централен офис') >= 0, q);
    const rq = L.gets.filter(u => /report_recipients/.test(u))[0] || '';
    ok('получателите: active=true и co_overdue=true', rq.indexOf('active=eq.true') >= 0 && rq.indexOf('co_overdue=eq.true') >= 0, rq);
    ok('отговорът не носи имейли', JSON.stringify(r).indexOf('@') < 0);

    const Z = load({ client_orders: [mk('P-OK'), mk('S-SENT', { status: 'sent', delivery: '2026-09-01' })], report_recipients: RECIP });
    const z = await Z.call({ type: 'co_overdue' });
    ok('0 просрочени → писмото пак тръгва', z.sent === true && Z.posts.length === 1, JSON.stringify(z));
    ok('с един ред „Няма просрочени заявки"', Z.posts[0].body.html.indexOf('Няма просрочени заявки') >= 0);
    ok('темата завършва на (0)', /\(0\)$/.test(Z.posts[0].body.subject), Z.posts[0].body.subject);

    const N = load({ client_orders: ORDERS, report_recipients: [] });
    const n = await N.call({ type: 'co_overdue' });
    ok('без получатели → не праща', n.sent === false && n.reason === 'no_recipients' && N.posts.length === 0, JSON.stringify(n));
  }

  section('4б. Грешка от базата не се превръща в „Няма просрочени"');
  {
    /* PostgREST връща ОБЕКТ при грешка (напр. несъществуваща колона в select) */
    const E = load({ client_orders: { code: '42703', message: 'column client_orders.awaiting_stock does not exist' }, report_recipients: RECIP });
    const e = await E.call({ type: 'co_overdue' });
    ok('обект вместо масив → collect_failed, не писмо', e.ok === false && e.error === 'collect_failed' && E.posts.length === 0, JSON.stringify(e));
    /* 06.10.2026: селектът искаше awaiting_stock, колона, която client_orders НЯМА
       (само transport_orders) — отчетът излезе 0/0 срещу 10 pending и 28 processed.
       Заявените колони трябва да са подмножество на реалните колони на таблицата. */
    const REAL = ['id', 'in_num', 'store_name', 'customer_name', 'fulfiller', 'delivery', 'status', 'co_eta', 'co_note',
      'co_processed_by', 'created_at', 'date', 'phone', 'product', 'sap', 'qty', 'unit', 'items', 'note', 'agent', 'bon',
      'from_store', 'group_id', 'paid_transport', 'transport_id', 'delivery_reason', 'co_processed_at'];
    const L = load({ client_orders: ORDERS, report_recipients: RECIP });
    await L.call({ type: 'co_overdue' });
    const q = decodeURIComponent(L.gets.filter(u => /client_orders/.test(u))[0] || '');
    const cols = (/select=([^&]+)/.exec(q) || [, ''])[1].split(',');
    const bad = cols.filter(c => REAL.indexOf(c) < 0);
    ok('select иска само колони на client_orders', cols.length > 5 && !bad.length, 'непознати: ' + bad.join(','));
  }

  section('5. Празник и уикенд — не се праща');
  {
    /* 22.09.2026 (вторник) — Ден на независимостта; 08:00 София = 05:00 UTC */
    const L = load({ client_orders: ORDERS, report_recipients: RECIP }, '2026-09-22T05:00:00Z');
    const r = await L.call({ type: 'co_overdue' });
    ok('22.09.2026 → sent:false, reason holiday', r.sent === false && r.reason === 'holiday' && r.date === '2026-09-22', JSON.stringify(r));
    ok('и нищо не е изпратено, и базата не е питана за заявки', L.posts.length === 0 && L.gets.filter(u => /client_orders/.test(u)).length === 0);
    const W = load({ client_orders: ORDERS, report_recipients: RECIP }, '2026-10-10T05:00:00Z');
    const w = await W.call({ type: 'co_overdue' });
    ok('събота → reason weekend', w.sent === false && w.reason === 'weekend', JSON.stringify(w));
    const D = load({ client_orders: ORDERS, report_recipients: RECIP }, '2026-09-22T05:00:00Z');
    const d = await D.call({ type: 'co_overdue', dry_run: true });
    ok('dry_run на празник работи, без изпращане и показва workday:false', d.dry_run === true && d.workday === false && D.posts.length === 0, JSON.stringify(d).slice(0, 200));
    /* Опорният ден е по София, не по UTC: 23:30 UTC на 06.10 е 02:30 на 07.10 в София */
    const S = load({ client_orders: ORDERS, report_recipients: RECIP }, '2026-10-06T23:30:00Z');
    const s = await S.call({ type: 'co_overdue', dry_run: true });
    ok('часовникът е Europe/Sofia (23:30 UTC → 07.10)', s.date === '2026-10-07', s.date);
  }

  section('6. dry_run — без изпращане и без лични данни');
  {
    const L = load({ client_orders: ORDERS, report_recipients: RECIP });
    const r = await L.call({ type: 'co_overdue', dry_run: true });
    ok('нищо не се праща', L.posts.length === 0 && r.sent === undefined);
    ok('броят по секции', r.pending.count === 3 && r.processed.count === 2, JSON.stringify([r.pending.count, r.processed.count]));
    ok('първите 5 са с № и обект', r.pending.first5.length === 3 && r.pending.first5[0].in_num === 'P-OLDER' && r.pending.first5[0].store === 'Враца');
    ok('само брой получатели', r.recipients === 2);
    const txt = JSON.stringify(r);
    ok('без имена на клиенти, телефони и имейли', txt.indexOf('Клиент ') < 0 && txt.indexOf('@') < 0 && txt.indexOf('customer') < 0);
  }

  section('7. Копието на празниците дава същото като shared.js');
  {
    const h = boot({ modules: [], user: { email: 'a@temax.bg', display_name: 'А', role: 'admin', store_name: CO }, data: {} });
    const L = load({});
    let diffs = [], n = 0;
    for (let y = 2020; y <= 2035; y++) {
      const a = h.w.bgHolidaysForYear(y), b = L.ctx.bgHolidaysForYear(y);
      const ka = Object.keys(a).sort().join(','), kb = Object.keys(b).sort().join(',');
      if (ka !== kb) diffs.push(y + ': ' + ka + ' ≠ ' + kb);
      for (let m = 0; m < 12; m++) for (let d = 1; d <= 31; d++) {
        const dt = new Date(y, m, d); if (dt.getMonth() !== m) continue;
        const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        n++;
        if (h.w.isBgWorkday(iso) !== L.ctx.isBgWorkday(iso)) diffs.push(iso);
      }
    }
    ok('bgHolidaysForYear — същите множества за 2020–2035', !diffs.length, diffs.slice(0, 3).join(' | '));
    ok('isBgWorkday — същото за всеки ден (' + n + ' дни)', !diffs.length);
    ok('22.09.2026 е празник и в копието', L.ctx.isBgWorkday('2026-09-22') === false && L.ctx.isBgWorkday('2026-10-07') === true);
    h.close();
  }

  section('8. Другите видове не са счупени');
  {
    const L = load({ client_orders: [], report_recipients: [], users: [] });
    const r = await L.call({ type: 'warehouse' });
    ok('type warehouse още стига до своя клон (no_recipients при празни таблици)', r.type === 'warehouse' && r.reason === 'no_recipients', JSON.stringify(r));
  }

  report();
})();
