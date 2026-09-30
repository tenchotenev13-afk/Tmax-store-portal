/* Междускладови трансфери — етап 4: застояли товари, броячи, бързи филтри,
   секция в седмичния отчет.

   ПРАВИЛОТО е едно — reportTransferStale() в report.js (копие в
   send-scheduled-report, report-edge-sync), transfers.js го вика. Мери се
   по последното звено на веригата; застоял = СТРОГО над прага
   (app_settings 'transfer_stale_days', липсва / невалиден → 7); дни — цели,
   между локални полунощи.

   Какво заковава файлът:
     A) трите вида на границата N-1 / N / N+1: в път (по depart_date; куриер —
        от „Предаден на куриер"), чака прехвърляне, отворен проблем; решеният
        проблем не брои; получен и прехвърлен товар не е застоял; прагът.
     B) порталът: 4 брояча, клик → филтър; видимост (обект — своите, admin —
        всички); застояването по последното звено; бързите филтри (статус,
        вид, период) и съчетаването им с търсенето и с броячите.
     C) отчетът: секцията по обект с причина и дни; празно → „Няма застояли
        товари"; само в седмичния (таб „Днес" — без секция); ЗАЩИТА — целият
        седмичен отчет без новата секция = отчетът отпреди промяната (b4d027e),
        байт по байт (фикстура tests/fixtures/weekly-before-transfers-stale.html).

   Пускане:  node tests/transfers-stale.test.js .
   Фикстурата се прави наново само от СТАРИЯ код:
     GEN_OLD_FIXTURE=<чекаут на b4d027e> node tests/transfers-stale.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks, realClick, fire } = H;

const FIXTURE = path.join(__dirname, 'fixtures', 'weekly-before-transfers-stale.html');
const STORES = ['Козлодуй', 'Пирдоп', 'Карлово', 'Троян', 'Сливен', 'Варна', 'Централен офис'];
const U = (store, role) => ({ id: 'u-' + store, email: store + '@temax.bg', display_name: 'Управител ' + store, role: role || 'manager', store_name: store });
const ADMIN = { id: 'adm', email: 'adm@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' };

function freeze(w, iso) {
  const Real = w.Date, ms = new Real(iso).getTime();
  w.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
}

/* ── Мини-PostgREST, който филтрира (като в transfers-reship). ── */
function q(url) { return decodeURIComponent((url.split('?')[1] || '')); }
function inList(qs, col) { const m = new RegExp('(?:^|&)' + col + '=in\\.\\(([^)]*)\\)').exec(qs); return m ? m[1].split(',') : null; }
function orMatch(qs, row) {
  const m = /(?:^|&)or=\((.*?)\)(?=&|$)/.exec(qs);
  if (!m) return true;
  return m[1].split(',').some(function (cond) {
    const p = /^([a-z_]+)\.(eq|cs)\.(.*)$/.exec(cond);
    if (!p) return false;
    if (p[2] === 'eq') return row[p[1]] === p[3];
    return (row[p[1]] || []).indexOf(p[3].replace(/^\{"|"\}$/g, '')) >= 0;
  });
}
function rowsOf(rows, cols) {
  return function (url) {
    const qs = q(url);
    return rows.filter(function (r) {
      for (const c of cols) { const l = inList(qs, c); if (l && l.indexOf(String(r[c])) < 0) return false; }
      return orMatch(qs, r);
    }).map(r => JSON.parse(JSON.stringify(r)));
  };
}

/* ── Данни за портала: „сега" = 30.09.2026 12:00 (сряда). ── */
const bus = (id, num, from, depart, stops, end, created) => ({ id, transfer_num: num, from_store: from, mode: 'bus', depart_date: depart, depart_time: '08:00',
  stops: stops, end_store: end, status: 'planned', created_at: created || depart + 'T05:00:00Z' });
const cg = (id, tid, pos, rec, pts, extra) => Object.assign({ id, transfer_id: tid, position: pos, kind: 'pallet', qty: 1, recipient_store: rec,
  transfer_points: pts || [], note: null, client_order_ids: [], transport_order_ids: [], claim_numbers: [], goods_doc: null }, extra || {});
const ev = (id, tid, cid, store, kind, ts, extra) => Object.assign({ id, transfer_id: tid, cargo_id: cid, store_name: store, event: kind, created_at: ts, photos: [] }, extra || {});

const T = [
  bus('t1', 'Козлодуй-0001', 'Козлодуй', '2026-09-20', ['Сливен'], 'Троян'),      /* a1 в път 10 дни → застоял */
  bus('t2', 'Пирдоп-0002', 'Пирдоп', '2026-09-28', ['Карлово'], 'Троян'),         /* b1 чака 8 дни → застоял; b2 проблем 1 ден */
  { id: 't3', transfer_num: 'Варна-0001', from_store: 'Варна', mode: 'courier', courier_company: 'Econt', depart_date: null,
    stops: [], end_store: 'Троян', status: 'partial', created_at: '2026-09-25T09:00:00Z' },              /* k1 предаден преди 1 ден */
  bus('t4', 'Сливен-0003', 'Сливен', '2026-09-15', ['Карлово'], 'Варна'),         /* c1 чакал 14 дни, но е прехвърлен */
  bus('t5', 'Карлово-0004', 'Карлово', '2026-09-29', [], 'Троян')                 /* c2 — продължението, в път 1 ден */
];
const C = [
  cg('a1', 't1', 1, 'Троян'), cg('a2', 't1', 2, 'Сливен', [], { goods_doc: 'СР-1' }),
  cg('b1', 't2', 1, 'Троян', ['Карлово']), cg('b2', 't2', 2, 'Троян', [], { kind: 'roll' }),
  cg('k1', 't3', 1, 'Троян'),
  cg('c1', 't4', 1, 'Троян', ['Карлово']), cg('c2', 't5', 1, 'Троян', [], { prev_cargo_id: 'c1' })
];
const E = [
  ev('e1', 't1', 'a2', 'Сливен', 'received', '2026-09-21T10:00:00Z'),
  ev('e2', 't2', 'b1', 'Карлово', 'unloaded', '2026-09-22T09:00:00Z'),
  ev('e3', 't2', 'b2', 'Троян', 'problem', '2026-09-29T09:00:00Z', { problem_kind: 'damaged', comment: 'мокро' }),
  ev('e4', 't3', 'k1', 'Варна', 'handed_to_courier', '2026-09-29T09:00:00Z', { waybill_no: 'W1' }),
  ev('e5', 't4', 'c1', 'Карлово', 'unloaded', '2026-09-16T09:00:00Z')
];

function envUI(user, opts) {
  opts = opts || {};
  const h = boot({
    modules: ['bulletin.js', 'report.js', 'stock-differences.js', 'transfers.js'],
    user: user,
    data: {
      users: STORES.map(s => ({ store_name: s })),
      transfers: rowsOf(opts.transfers || T, ['id']),
      transfer_cargo: rowsOf(opts.cargo || C, ['id', 'transfer_id', 'prev_cargo_id']),
      transfer_cargo_events: rowsOf(opts.events || E, ['transfer_id']),
      app_settings: opts.settings || [],
      client_orders: [], transport_orders: [], loading_lists: [], loading_list_items: []
    }
  });
  freeze(h.w, '2026-09-30T12:00:00');
  return h;
}
const $ = (h, s) => h.doc.querySelector(s);
const $$ = (h, s) => Array.prototype.slice.call(h.doc.querySelectorAll(s));
const counter = (h, k) => { const b = $(h, '.trf-counter[data-k="' + k + '"]'); return b ? Number(b.querySelector('.trf-counter-n').textContent) : null; };
async function open(h) { h.w.showModule('transfers'); await ticks(); await ticks(); await ticks(); }
async function clickCounter(h, k) { realClick(h.w, $(h, '.trf-counter[data-k="' + k + '"]')); await ticks(); }
async function quick(h, g, v) { realClick(h.w, $(h, '.trf-q[data-g="' + g + '"][data-v="' + v + '"]')); await ticks(); }
const tableIds = h => $$(h, '#trf-table tbody tr[data-id]').map(r => r.getAttribute('data-id'));
const staleRows = h => $$(h, '.trf-stale-row').map(r => r.getAttribute('data-c') + ':' + r.getAttribute('data-reason'));

/* ── Данни за седмичния отчет (като weekly-storno-short): неделя 13.09 21:00. ── */
const SCOPE = ['Пирдоп', 'Троян', 'Карлово'];
const RT = [
  bus('r1', 'Козлодуй-0010', 'Козлодуй', '2026-09-01', ['Пирдоп'], 'Троян'),   /* x1 в път 12 дни → Троян; x2 получен */
  bus('r2', 'Сливен-0011', 'Сливен', '2026-09-03', ['Пирдоп'], 'Варна'),       /* y1 чака в Пирдоп от 04.09 → 9 дни */
  bus('r3', 'Пирдоп-0012', 'Пирдоп', '2026-09-10', [], 'Варна')                /* z1 в път 3 дни — не; w1 → Варна извън обхвата */
];
const RC = [
  cg('x1', 'r1', 1, 'Троян', [], { qty: 3 }), cg('x2', 'r1', 2, 'Пирдоп'),
  cg('y1', 'r2', 1, 'Троян', ['Пирдоп'], { kind: 'carton' }),
  cg('z1', 'r3', 1, 'Варна'), cg('w1', 'r3', 2, 'Варна', [], { kind: 'bulk' })
];
const RE = [
  ev('re1', 'r1', 'x2', 'Пирдоп', 'received', '2026-09-02T10:00:00Z'),
  ev('re2', 'r2', 'y1', 'Пирдоп', 'unloaded', '2026-09-04T10:00:00Z')
];
const USERS = ['Пирдоп', 'Троян', 'Карлово', 'Варна', 'Централен офис'].map(s => ({ store_name: s }));
function envReport(opts, repo) {
  opts = opts || {};
  const h = boot({
    repo: repo,
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      users: USERS, bulletins: [{ id: 'b-37', week_number: 37, year: 2026, status: 'published' }],
      bulletin_tasks: [], recurring_tasks: [], recurring_task_periods: [], recurring_task_skips: [],
      task_completions: [], report_snapshots: [], app_settings: opts.settings || [],
      weekly_checklist_metrics: [], weekly_checklist: [],
      differences_reports: [{ id: 'd1', store_name: 'Пирдоп', direction: 'supplier', reviewed: false, created_at: '2026-09-08T09:00:00.000Z' }],
      stock_differences: [], stock_returns: [{ store_name: 'Троян', status: 'pending', supplier: 'Доставчик', created_at: '2026-09-01T09:00:00.000Z' }],
      kasa_storno: [], kasa_zoborot: [{ store_name: 'Пирдоп', date: '2026-09-09', status: 'draft', razlika: 1 }],
      goods_transit: [], transport_pallets: [{ store_name: 'Троян', report_date: '2026-09-11' }],
      client_orders: [], transport_orders: [],
      transfers: opts.transfers || RT, transfer_cargo: opts.cargo || RC, transfer_cargo_events: opts.events || RE
    }
  });
  freeze(h.w, '2026-09-13T21:00:00');
  return h;
}
const weekly = (h, scope) => new Promise(res => { h.w.collectWeeklyReportData(res, scope); });

(async function () {

  if (process.env.GEN_OLD_FIXTURE) {
    const h = envReport({}, path.resolve(process.env.GEN_OLD_FIXTURE));
    const data = await weekly(h, SCOPE);
    const html = h.w.buildWeeklyReportHtml(data);
    if (html.indexOf('Трансфери') >= 0) { console.error('старият код вече има секция за трансфери'); process.exit(1); }
    fs.writeFileSync(FIXTURE, html);
    console.log('фикстура: ' + FIXTURE + ' (' + html.length + ' знака)');
    h.close();
    return;
  }

  section('A) правилото на границата N-1 / N / N+1 (N = 7)');
  {
    const h = envUI(ADMIN);
    const w = h.w;
    const refD = new w.Date(2026, 8, 30);   /* 30.09.2026, местна полунощ */
    const st = (t, c, evs, succ, days) => w.reportTransferStale(t, c, evs || [], !!succ, days === undefined ? 7 : days, refD);
    const L = (y, mo, d, hh) => new w.Date(y, mo - 1, d, hh || 10, 0).toISOString();
    const tb = d => ({ id: 'x', mode: 'bus', depart_date: d, created_at: '2026-09-01T05:00:00Z' });
    const c0 = { id: 'c', transfer_id: 'x', recipient_store: 'Троян', transfer_points: [] };
    ok('в път: 6 дни (N-1) — не', st(tb('2026-09-24'), c0) === null);
    ok('в път: 7 дни (N) — не, прагът е „над"', st(tb('2026-09-23'), c0) === null);
    const tr = st(tb('2026-09-22'), c0);
    ok('в път: 8 дни (N+1) — застоял, причина „transit", 8 дни, обект = получателят', tr && tr.reason === 'transit' && tr.age === 8 && tr.store === 'Троян', JSON.stringify(tr));

    const cp = { id: 'c', transfer_id: 'x', recipient_store: 'Троян', transfer_points: ['Пирдоп'] };
    const un = d => [{ id: 'u', cargo_id: 'c', store_name: 'Пирдоп', event: 'unloaded', created_at: L(2026, 9, d, 23) }];
    ok('чака прехвърляне: 6 дни — не', st(tb('2026-09-01'), cp, un(24)) === null);
    ok('чака прехвърляне: 7 дни — не', st(tb('2026-09-01'), cp, un(23)) === null);
    const rs = st(tb('2026-09-01'), cp, un(22));
    ok('чака прехвърляне: 8 дни — застоял в Пирдоп (23:00 на 22.09 е пак 8 дни)', rs && rs.reason === 'reship' && rs.age === 8 && rs.store === 'Пирдоп', JSON.stringify(rs));
    ok('същото, но с наследник — НЕ е застоял (мери се последното звено)', st(tb('2026-09-01'), cp, un(22), true) === null);

    const pr = (d, resolved) => [{ id: 'p', cargo_id: 'c', store_name: 'Карлово', event: 'problem', created_at: L(2026, 9, d) }]
      .concat(resolved ? [{ id: 'r', cargo_id: 'c', store_name: 'Козлодуй', event: 'resolved', resolves_id: 'p', created_at: L(2026, 9, 29) }] : []);
    const fresh = tb('2026-09-29');
    ok('проблем: 6 дни — не', st(fresh, c0, pr(24)) === null);
    ok('проблем: 7 дни — не', st(fresh, c0, pr(23)) === null);
    const pp = st(fresh, c0, pr(22));
    ok('проблем: 8 дни — застоял, обект = който го е отбелязал', pp && pp.reason === 'problem' && pp.age === 8 && pp.store === 'Карлово', JSON.stringify(pp));
    ok('решен проблем не брои', st(fresh, c0, pr(22, true)) === null);
    const both = st(tb('2026-09-01'), c0, pr(22));
    ok('при няколко — проблемът печели пред „в път"', both && both.reason === 'problem', JSON.stringify(both));

    const got = [{ id: 'g', cargo_id: 'c', store_name: 'Троян', event: 'received', created_at: L(2026, 9, 2) }];
    ok('получен товар не е застоял — и с отворен проблем', st(tb('2026-09-01'), c0, got.concat(pr(2))) === null);
    const kt = { id: 'k', mode: 'courier', depart_date: null, created_at: '2026-09-01T05:00:00Z' };
    const kc = { id: 'kc', transfer_id: 'k', recipient_store: 'Троян', transfer_points: [] };
    ok('куриер: брои от „Предаден на куриер" (29.09 → 1 ден), не от създаването',
      st(kt, kc, [{ id: 'h', cargo_id: 'kc', store_name: 'Варна', event: 'handed_to_courier', created_at: L(2026, 9, 29) }]) === null &&
      st(kt, kc, []).age === 29);
    ok('прагът: липсва → 7; „3" → 3; „abc" → 7; „0" → 7',
      w.reportTransferStaleDays([]) === 7 && w.reportTransferStaleDays([{ key: 'transfer_stale_days', value: '3' }]) === 3 &&
      w.reportTransferStaleDays([{ key: 'transfer_stale_days', value: 'abc' }]) === 7 && w.reportTransferStaleDays([{ key: 'transfer_stale_days', value: '0' }]) === 7);
    ok('с праг 3: в път 4 дни е застоял', !!st(tb('2026-09-26'), c0, [], false, 3) && st(tb('2026-09-27'), c0, [], false, 3) === null);
    h.close();
  }

  section('B1) броячите — admin вижда всичко');
  {
    const h = envUI(ADMIN);
    await open(h);
    ok('4 брояча най-горе', $$(h, '.trf-counter').length === 4 && !!$(h, '#trf-counters'));
    ok('🚐 В път = 4 (a1, b2, k1 и продължението c2 — не c1)', counter(h, 'transit') === 4, String(counter(h, 'transit')));
    ok('⏳ Чакащи прехвърляне = 1 (b1; c1 вече е прехвърлен)', counter(h, 'reship') === 1, String(counter(h, 'reship')));
    ok('⚠️ Отворени проблеми = 1 (b2)', counter(h, 'problems') === 1, String(counter(h, 'problems')));
    ok('🕒 Застояли над 7 дни = 2 (a1 в път, b1 чака)', counter(h, 'stale') === 2, String(counter(h, 'stale')));
    ok('етикетът носи прага', /Застояли над 7 дни/.test($(h, '.trf-counter[data-k="stale"]').textContent));
    await clickCounter(h, 'stale');
    ok('клик „Застояли" → списък a1 (в път) и b1 (чака), по дни', staleRows(h).join(',') === 'a1:transit,b1:reship', staleRows(h).join(','));
    ok('с дните: 10 и 8', $$(h, '.trf-stale-days').map(x => x.getAttribute('data-days')).join(',') === '10,8');
    ok('c1 (чакал 14 дни, но прехвърлен) не е застоял', staleRows(h).every(x => x.indexOf('c1') !== 0));
    await clickCounter(h, 'transit');
    ok('клик „В път" → таблицата: t1, t2, t3, t5 (транспортът на последното звено)', tableIds(h).sort().join(',') === 't1,t2,t3,t5', tableIds(h).join(','));
    await clickCounter(h, 'problems');
    ok('клик „Проблеми" → b2', $$(h, '.trf-problem-row').length === 1);
    await clickCounter(h, 'reship');
    ok('клик „Чакащи" → b1', $$(h, '.trf-reship-row').map(r => r.getAttribute('data-c')).join(',') === 'b1');
    h.close();
  }

  section('B2) броячите спазват видимостта — Пирдоп вижда своите');
  {
    const h = envUI(U('Пирдоп'));
    await open(h);
    ok('Пирдоп вижда само t2', $$(h, '#trf-table tbody tr[data-id]').map(r => r.getAttribute('data-id')).join(',') === 't2');
    ok('В път = 1 (b2)', counter(h, 'transit') === 1, String(counter(h, 'transit')));
    ok('Чакащи при мен = 0 (b1 чака в Карлово, не в Пирдоп)', counter(h, 'reship') === 0, String(counter(h, 'reship')));
    ok('Застояли = 1 (b1 от неговия транспорт)', counter(h, 'stale') === 1, String(counter(h, 'stale')));
    h.close();
    const k = envUI(U('Карлово'));
    await open(k);
    ok('Карлово: Чакащи при мен = 1 (b1)', counter(k, 'reship') === 1, String(counter(k, 'reship')));
    ok('Карлово вижда и t4/t5 — застояването се мери по c2 (1 ден), не по c1', k.w.tfStaleItems('').every(x => x.c.id !== 'c1' && x.c.id !== 'c2'));
    k.close();
  }

  section('B3) праг от app_settings');
  {
    const h = envUI(ADMIN, { settings: [{ key: 'transfer_stale_days', value: '1' }] });
    await open(h);
    /* b2: проблемът е от вчера (1 ден — не „над"), но е в път от 28.09 (2 дни) → застоял като „в път". */
    ok('с праг 1: застояли 3 (a1, b1 и b2 — в път 2 дни)', counter(h, 'stale') === 3, String(counter(h, 'stale')));
    ok('b2 е застоял като „в път", не като проблем', (h.w.tfStaleItems('').filter(x => x.c.id === 'b2')[0] || {}).st.reason === 'transit');
    ok('етикетът: „над 1 дни"', /Застояли над 1 дни/.test($(h, '.trf-counter[data-k="stale"]').textContent));
    h.close();
  }

  section('B4) бързи филтри + търсене + броячи');
  {
    const h = envUI(ADMIN);
    await open(h);
    ok('лентата с бързите филтри е там', !!$(h, '#trf-quick') && $$(h, '.trf-q').length === 10);
    await quick(h, 'mode', 'courier');
    ok('вид „Куриер" → таблицата е само t3', tableIds(h).join(',') === 't3', tableIds(h).join(','));
    ok('и броячите следват: В път 1, Застояли 0', counter(h, 'transit') === 1 && counter(h, 'stale') === 0);
    await quick(h, 'mode', '');
    await quick(h, 'period', 'week');
    ok('„Тази седмица" (28.09–04.10) → t2 и t5', tableIds(h).sort().join(',') === 't2,t5', tableIds(h).join(','));
    await quick(h, 'period', 'month');
    ok('„Този месец" → всичките пет', tableIds(h).length === 5);
    await quick(h, 'period', '');
    await quick(h, 'status', 'partial');
    ok('статус „Частично" → t1 (a2 получен), t2, t3', tableIds(h).sort().join(',') === 't1,t2,t3', tableIds(h).join(','));
    await quick(h, 'status', 'done');
    ok('статус „Завършен" → t4 (единственият товар е разтоварен)', tableIds(h).join(',') === 't4', tableIds(h).join(','));
    await quick(h, 'status', 'planned');
    ok('статус „Планиран" → t5 (без отметки)', tableIds(h).join(',') === 't5', tableIds(h).join(','));
    await quick(h, 'status', '');
    /* Търсене + брояч. */
    const s = $(h, '#trf-search'); s.value = 'Козлодуй'; fire(h.w, s, 'input'); await ticks();
    ok('търсене „Козлодуй" → броячът Застояли = 1', counter(h, 'stale') === 1, String(counter(h, 'stale')));
    await clickCounter(h, 'stale');
    ok('и кликът показва само a1', staleRows(h).join(',') === 'a1:transit', staleRows(h).join(','));
    await quick(h, 'mode', 'courier');
    ok('+ „Куриер" → нищо', staleRows(h).length === 0 && /Няма застояли/.test($(h, '#trf-stale').textContent));
    h.close();
  }

  section('C1) секцията в седмичния отчет');
  {
    const h = envReport();
    const data = await weekly(h, SCOPE);
    const ts = data.cross.transfersStale;
    ok('transfersStale е в cross (седмичен прозорец)', !!ts && ts.days === 7, JSON.stringify(ts && { days: ts.days, total: ts.total }));
    const byStore = {};
    (ts.byStore || []).forEach(g => { byStore[g.store] = g.items.map(i => i.num + '#' + i.position + ':' + i.reason + ':' + i.age); });
    ok('Троян: x1 в път 12 дни (обектът е следващият по пътя)', JSON.stringify(byStore['Троян']) === '["Козлодуй-0010#1:transit:12"]', JSON.stringify(byStore));
    ok('Пирдоп: y1 чака прехвърляне 9 дни', JSON.stringify(byStore['Пирдоп']) === '["Сливен-0011#1:reship:9"]', JSON.stringify(byStore));
    ok('получен (x2), в път 3 дни (z1) и извън обхвата (w1 → Варна) — не', ts.total === 2, String(ts.total));
    const html = h.w.reportTransfersStaleHtml(data.cross);
    const div = h.doc.createElement('div'); div.innerHTML = html;
    const txt = div.textContent;
    ok('заглавие „🕒 Трансфери — застояли над 7 дни (2)"', txt.indexOf('🕒 Трансфери — застояли над 7 дни (2)') >= 0, txt.slice(0, 120));
    const rows = Array.from(div.querySelectorAll('tr')).slice(1).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()).join('|'));
    ok('ред: Троян | Козлодуй-0010 #1 | Палет ×3 | Троян | в път | 12', rows[0] === 'Троян|Козлодуй-0010 #1|Палет ×3|Троян|в път|12', rows.join(' / '));
    ok('ред: Пирдоп | Сливен-0011 #1 | Кашон | Троян | чака прехвърляне | 9', rows[1] === 'Пирдоп|Сливен-0011 #1|Кашон|Троян|чака прехвърляне|9', rows.join(' / '));
    const full = h.w.buildWeeklyReportHtml(data);
    const iTr = full.indexOf('Стока на път'), iTs = full.indexOf('🕒 Трансфери'), iPal = full.indexOf('Палети', iTs);
    ok('мястото: след „Стока на път", преди „Палети"', iTr >= 0 && iTr < iTs && iPal > iTs, iTr + ' / ' + iTs + ' / ' + iPal);
    h.close();

    const e = envReport({ transfers: [], cargo: [], events: [] });
    const d2 = await weekly(e, SCOPE);
    ok('празно → „Няма застояли товари"', e.w.reportTransfersStaleHtml(d2.cross).indexOf('Няма застояли товари') >= 0);
    const before = e.calls.get.length;
    const c3 = await new Promise(res => { e.w.collectCrossModuleWeeklySummary(res, null, SCOPE); });
    ok('подвижен прозорец (таб „Днес") → без секция и без заявки към трансферите',
      !c3.transfersStale && e.w.reportTransfersStaleHtml(c3) === '' &&
      !e.calls.get.slice(before).some(u => /\/transfer/.test(u)), e.calls.get.slice(before).filter(u => /transfer/.test(u)).join(' | '));
    e.close();
  }

  section('C2) ЗАЩИТА: всичко друго в седмичния отчет е байт по байт като преди');
  {
    const h = envReport();
    const data = await weekly(h, SCOPE);
    const html = h.w.buildWeeklyReportHtml(data);
    const sec = h.w.reportTransfersStaleHtml(data.cross);
    ok('новата секция е в отчета точно веднъж', sec.length > 0 && html.split(sec).length === 2);
    const i = html.indexOf(sec);
    const rest = html.slice(0, i) + html.slice(i + sec.length);
    const before = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : null;
    ok('фикстурата отпреди промяната я има', !!before);
    if (before) {
      let at = -1;
      if (rest !== before) { for (let k = 0; k < Math.max(rest.length, before.length); k++) if (rest[k] !== before[k]) { at = k; break; } }
      ok('целият отчет без новата секция = отчетът отпреди (' + before.length + ' знака)', rest === before,
        at < 0 ? '' : 'първа разлика на знак ' + at + ': „' + rest.slice(Math.max(0, at - 60), at + 60) + '" срещу „' + before.slice(Math.max(0, at - 60), at + 60) + '"');
    }
    h.close();
  }

  report();
})().catch(function (e) { console.error(e); process.exit(1); });
