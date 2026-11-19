/* „Минуси с отворена разлика" — секцията в понеделничното писмо minus_multi
   (19.11.2026, сесия minusi-open-diff-weekly; Теодор 18–19.11, стъпка 3 от 3).

   Ред на код (уникален код с поне един ред 955 на обекта, закрит или не):
   минус от (най-ранният 955) + за всяка НЕприключена разлика (sdIsClosed) —
   дата на бланката, вид, статус (надписът от Разлики), ход, коментарите.
   Влизат ВСИЧКИ неприключени, не само с ход на обекта.
   Ход: 'store' = sdStoreMustAct ИЛИ bulDiffStoreWaiting (А ∪ Б, правилото на
   bulletin-notify v27); иначе за междускладов — по sdInterstoreTurn; доставчик
   и грешен прием → офис.

   Порталът (report.js върху истинските stock-differences.js / bulletin.js) и
   send-scheduled-report (функциите и копията, изпълнени във vm) се пускат
   върху едни и същи редове и се сравняват помежду си и с ръчно очакваното.

   Мутационна проверка (19.11.2026) — върху чистия код (report.js + .ts заедно):
     M1 приключена влиза (без sdIsClosed в reportMinusOdGroup и без not.in в
        заявката);
     M2 само с ход на обекта (редовете с друг ход отпадат);
     M3 без филтър по обекти на регионалния (reportMinusMultiForStores не реже od).
   Броят паднали — в отчета на сесията. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const J = JSON.stringify;
const MT = 'Монтана', SH = 'Шумен', PE = 'Петрич';
const STORES = [MT, SH, PE];

const rep = (store, direction, reviewed, doc_date) => ({ store_name: store, reviewed: !!reviewed, direction, doc_date: doc_date || '2026-11-10' });
let n = 0;
const L = (store, code, dir, reviewed, o) => Object.assign({ id: 'L' + String(++n).padStart(2, '0'), store_name: store, material_code: code, material_name: 'ИМЕ ' + String(code).trim(),
  type: null, status: 'new', warehouse_response: null, store_response: null, difference_category: null, comment: null, store_response_comment: null,
  resolution_comment: null, warehouse_comment: null, created_at: '2026-11-10T08:00:00Z', differences_reports: rep(store, dir, reviewed) }, o || {});
const LINES = [
  /* L01 */ L(MT, '98572', 'interstore', false, { warehouse_response: 'return', difference_category: 'excess', comment: 'има в повече' }),   /* обект (Б) */
  /* L02 */ L(SH, '91019', 'interstore', false, { difference_category: 'excess', differences_reports: rep(SH, 'interstore', false, '2026-11-15') }), /* склад */
  /* L03 */ L(SH, '17236', 'supplier', true, { type: 'missing', status: 'pending', resolution_comment: 'чакаме кредитно', differences_reports: rep(SH, 'supplier', true, '2026-10-15') }), /* офис */
  /* L04 */ L(PE, '101559', 'interstore', false, { differences_reports: rep(PE, 'interstore', false, '2026-08-28') }),                   /* склад */
  /* L05 */ L(MT, 'W1', 'supplier', true, { type: 'writein', status: 'pending' }),                                                       /* обект (А) */
  /* L06 */ L(MT, 'T1', 'interstore', false, { warehouse_response: 'sent' }),                                                           /* на път */
  /* L07 */ L(MT, 'NS1', 'interstore', false, { warehouse_response: 'return', store_response: 'no_stock', store_response_comment: 'няма в склада' }), /* офис (ЦО) */
  /* L08 */ L(MT, 'DM1', 'interstore', false, { difference_category: 'damaged' }),                                                      /* регионален */
  /* L09 */ L(MT, 'SAP1', 'interstore', false, { warehouse_response: 'return', store_response: 'sap_done', warehouse_comment: 'ще приемем' }), /* склад */
  /* L10 */ L(MT, 'C1', 'supplier', true, { type: 'writein', status: 'taken' }),                                                        /* приключена */
  /* L11 */ L(MT, 'C2', 'interstore', false, { status: 'received' }),                                                                    /* приключена */
  /* L12 */ L(MT, 'WR1', 'wrong_receipt', true, { type: 'storno', status: 'pending' }),                                                 /* офис, „Неизчистена" */
  /* L13 */ L(MT, 'NOMIN', 'supplier', true, { type: 'writein', status: 'pending' }),                                                   /* няма минус */
  /* L14 */ L(MT, 'W1', 'interstore', false, { differences_reports: rep(MT, 'interstore', false, '2026-11-01') }),                      /* втора разлика по W1, склад */
  /* L15 */ L(MT, 'SW1', 'interstore', false, { warehouse_response: 'sent' })                                                           /* размяна към мен → обект */
];
const SWAPS = [{ id: 's1', from_line_id: 'X', to_line_id: 'L15', from_store: 'Добрич', to_store: MT, status: 'sent' }];
let q = 0;
const mv = (store, code, date, type) => ({ id: 'm' + (++q), store_name: store, material: code, material_desc: 'АРТИКУЛ ' + code, mvt_type: type || '955', posting_date: date });
const MOVS = [
  mv(MT, '98572', '2026-10-29'), mv(MT, '98572', '2026-11-05', '956'),       /* закрит — пак влиза */
  mv(SH, '91019', '2026-11-01'), mv(SH, '17236', '2026-11-15'), mv(PE, '101559', '2026-11-04'),
  mv(MT, 'W1', '2026-11-12'), mv(MT, 'W1', '2026-10-20'), mv(MT, 'W1', '2026-11-02'), /* три минуса → един ред, от 20.10 */
  mv(MT, 'T1', '2026-11-01'), mv(MT, 'NS1', '2026-11-01'), mv(MT, 'DM1', '2026-11-01'), mv(MT, 'SAP1', '2026-11-01'),
  mv(MT, 'C1', '2026-11-01'), mv(MT, 'C2', '2026-11-01'), mv(MT, 'WR1', '2026-11-01'), mv(MT, 'SW1', '2026-11-01'),
  mv(MT, 'NOMIN', '2026-11-01', '956')                                           /* само 956 → без минус */
];
const HAND_TURN = { L01: 'store', L02: 'warehouse', L03: 'co', L04: 'warehouse', L05: 'store', L06: 'transit', L07: 'co', L08: 'regional', L09: 'warehouse', L12: 'co', L14: 'warehouse', L15: 'store' };

/* ── send-scheduled-report: функциите + копията във vm ── */
function edgeCtx(){
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8');
  const grabFn = name => { const i = src.indexOf('\nfunction ' + name + '('); if (i < 0) throw new Error('няма ' + name);
    let d = 0, st = false; for (let j = src.indexOf('{', i); j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); } } };
  const grabVar = name => { const i = src.indexOf('\nvar ' + name + ' = '); if (i < 0) throw new Error('няма var ' + name); return src.slice(i, src.indexOf('\n', i + 1)); };
  const fns = ['reportMinusOdTurn', 'reportMinusOdStatus', 'reportMinusOdComments', 'reportMinusOdGroup', 'reportMinusOdHtml', 'reportMinusMultiDM', 'reportDiffIsRouted',
    'sdIsClosed', 'sdIsTaken', 'sdIsCompleted', 'sdRowAwaitsMark', 'sdStoreMustAct', 'sdStatusWords', 'bulDiffLineWaitsStore', 'bulDiffStoreWaiting', 'diffLineWaitsStore'];
  const vars = ['REPORT_MINUS_OD_DIR', 'REPORT_MINUS_OD_TURN', 'SD_CLOSED_STATUSES', 'SD_STATUS_NEW_LABEL'];
  const ctx = { esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  vm.createContext(ctx);
  vm.runInContext(vars.map(grabVar).join('\n') + '\n' + fns.map(grabFn).join('\n').replace(/\((\w+): any\)/g, '($1)') + '\n;this.SD_CLOSED_STATUSES = SD_CLOSED_STATUSES; this.SD_STATUS_NEW_LABEL = SD_STATUS_NEW_LABEL;', ctx);
  return ctx;
}
const shape = od => J(od.stores.map(s => ({ store: s.store, items: s.items.map(g => ({ code: g.code, desc: g.desc, from: g.minusFrom, diffs: g.diffs.map(d => [d.id, d.date, d.dir, d.status, d.turn, d.comments]) })) })));

(async function run() {
  const h = boot({ modules: ['bulletin.js', 'stock-returns.js', 'stock-differences.js', 'report.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const w = h.w;
  const od = w.reportMinusOdGroup(MOVS, LINES, SWAPS, STORES);
  const items = {}; od.stores.forEach(s => s.items.forEach(g => { items[s.store + '|' + g.code] = g; }));
  const turnOf = {}; od.stores.forEach(s => s.items.forEach(g => g.diffs.forEach(d => { turnOf[d.id] = d.turn; })));

  section('1. Порталът — кои редове и с какъв ход');
  ok('ходът по всеки ред = ръчно очакваното', Object.keys(HAND_TURN).every(k => turnOf[k] === HAND_TURN[k]) && Object.keys(turnOf).length === Object.keys(HAND_TURN).length, J(turnOf));
  ok('ред с ход на обекта (Б: Монтана 98572)', turnOf.L01 === 'store');
  ok('ред с ход на обекта (А: Заприхождаване W1)', turnOf.L05 === 'store');
  ok('ред с ход на склада (Шумен 91019, Петрич 101559)', turnOf.L02 === 'warehouse' && turnOf.L04 === 'warehouse');
  ok('ред с ход на офиса (Шумен 17236 Липса; return + няма наличност)', turnOf.L03 === 'co' && turnOf.L07 === 'co');
  ok('приключени (taken / received) → не влизат', !('L10' in turnOf) && !('L11' in turnOf) && !items[MT + '|C1'] && !items[MT + '|C2']);
  ok('код само с 956 (без минус) → не влиза', !items[MT + '|NOMIN']);
  ok('закрит минус (98572: 955 + 956) → влиза', !!items[MT + '|98572'] && items[MT + '|98572'].minusFrom === '2026-10-29');
  ok('код с три минуса (W1) → ЕДИН ред, минус от най-ранния (20.10), две разлики', od.stores.find(s => s.store === MT).items.filter(g => g.code === 'W1').length === 1 &&
    items[MT + '|W1'].minusFrom === '2026-10-20' && items[MT + '|W1'].diffs.length === 2 && items[MT + '|W1'].diffs[0].date === '2026-11-01', J(items[MT + '|W1']));
  ok('влизат и разликите с ход НЕ на обекта (всички неприключени): Монтана — 9 разлики в 8 кода', items[MT + '|SAP1'] && od.stores.find(s => s.store === MT).items.length === 8, od.stores.find(s => s.store === MT).items.map(g => g.code).join(','));
  ok('общо кодове: Монтана 8 + Шумен 2 + Петрич 1 = 11', od.total === 11, od.total);
  ok('коментарите от реда (обект / обект-отговор / офис / склад)', J(items[MT + '|98572'].diffs[0].comments) === J(['Обект: има в повече']) && J(items[SH + '|17236'].diffs[0].comments) === J(['Офис: чакаме кредитно']) &&
    J(items[MT + '|NS1'].diffs[0].comments) === J(['Обект (отговор): няма в склада']) && J(items[MT + '|SAP1'].diffs[0].comments) === J(['Склад: ще приемем']));

  section('2. Надписът на статуса и ходът — като в Разлики');
  const open = LINES.filter(l => !w.sdIsClosed(l));
  ok('статус = баджът на реда в Разлики (sdRowStatusBadge), за всеки отворен ред', open.every(l => w.reportMinusOdStatus(l, l.differences_reports.direction) === w.sdHtmlText(w.sdRowStatusBadge(l, l.differences_reports.direction)) ||
    (l.status === 'new' && w.reportMinusOdStatus(l, l.differences_reports.direction) === w.SD_STATUS_NEW_LABEL)), J(open.map(l => [l.id, w.reportMinusOdStatus(l, l.differences_reports.direction), w.sdHtmlText(w.sdRowStatusBadge(l, l.differences_reports.direction))])));
  ok('грешен прием → „⏳ НЕИЗЧИСТЕНА“', items[MT + '|WR1'].diffs[0].status === '⏳ НЕИЗЧИСТЕНА', items[MT + '|WR1'].diffs[0].status);
  ok('ходът „обект“ = А ∪ Б на портала (sdStoreMustAct ИЛИ bulDiffStoreWaiting)', open.every(l => (turnOf[l.id] === 'store') === (w.sdStoreMustAct(l) || w.bulDiffStoreWaiting([l], SWAPS, l.store_name).length > 0) || !(l.id in turnOf)));
  const map = { warehouse: 'warehouse', co: 'co', regional: 'regional', swap: 'swap' };
  ok('междускладов, не на обекта: склад / ЦО / регионален = sdInterstoreTurn', open.filter(l => l.differences_reports.direction === 'interstore' && turnOf[l.id] && turnOf[l.id] !== 'store' && turnOf[l.id] !== 'transit')
    .every(l => { const t = w.sdInterstoreTurn(l, l.differences_reports); return t && map[t.who] === turnOf[l.id]; }));
  ok('„на път“ — там, където Разлики казва „обекта — да потвърди ПРИЕТО, когато стоката пристигне“', (() => { const t = w.sdInterstoreTurn(LINES[5], LINES[5].differences_reports); return turnOf.L06 === 'transit' && t.who === 'store' && /пристигне/.test(t.text); })());

  section('3. send-scheduled-report = порталът');
  let ctx = null;
  try { ctx = edgeCtx(); ok('функциите и копията от .ts се изпълняват', true); } catch (e) { ok('функциите и копията от .ts се изпълняват', false, e.message); }
  if (ctx) {
    ok('SD_CLOSED_STATUSES и SD_STATUS_NEW_LABEL — същите като в stock-differences.js', J(ctx.SD_CLOSED_STATUSES) === J(w.SD_CLOSED_STATUSES) && ctx.SD_STATUS_NEW_LABEL === w.SD_STATUS_NEW_LABEL);
    const eod = ctx.reportMinusOdGroup(MOVS, LINES, SWAPS, STORES);
    ok('reportMinusOdGroup: .ts = порталът', shape(eod) === shape(od), shape(eod).slice(0, 300));
    ok('reportMinusOdHtml: .ts = порталът', ctx.reportMinusOdHtml(eod) === w.reportMinusOdHtml(od));
  }

  section('4. HTML');
  const doc = new h.w.DOMParser().parseFromString('<div>' + w.reportMinusOdHtml(od) + '</div>', 'text/html');
  ok('заглавие „Минуси с отворена разлика“ и 11 реда', /Минуси с отворена разлика/.test(doc.body.textContent) && doc.querySelectorAll('tr.mm-od-item').length === 11);
  const w1 = Array.from(doc.querySelectorAll('tr.mm-od-item')).find(tr => tr.cells[0].textContent === 'W1');
  ok('W1: минус от 20.10.2026, две дати на разлика, ход „склад“ и „обект“', w1 && w1.cells[2].textContent === '20.10.2026' && w1.cells[3].innerHTML.split('<br>').length === 2 && w1.cells[6].textContent === 'складобект', w1 && w1.cells[6].textContent);
  ok('колоните: Код · Описание · Минус от · Разлика от · Вид · Статус · Ход · Коментар', J(Array.from(doc.querySelector('table tr').cells).map(c => c.textContent)) === J(['Код', 'Описание', 'Минус от', 'Разлика от', 'Вид', 'Статус', 'Ход', 'Коментар']));
  ok('празна секция → нищо', w.reportMinusOdHtml({ stores: [], total: 0 }) === '' && w.reportMinusOdHtml(null) === '');
  ok('грешка → червен ред „Разликите не се заредиха“', /Разликите не се заредиха/.test(w.reportMinusOdHtml({ error: true })) && /C0392B/.test(w.reportMinusOdHtml({ error: true })));
  ok('в писмото — след повтарящите се, преди клиентските поръчки', (() => { const html = w.reportMinusMultiHtml(Object.assign(w.reportMinusMultiGroup([], STORES, 3, 30, '2026-11-16'), { od: od, co: { stores: [], total: 0 } }));
    return html.indexOf('Минуси с отворена разлика') > html.indexOf('Няма артикул с') && html.indexOf('Минуси с отворена разлика') < html.indexOf('Повтарящи се по клиентски поръчки'); })());

  section('5. Регионалният — само своите обекти');
  const data = Object.assign(w.reportMinusMultiGroup([], STORES, 3, 30, '2026-11-16'), { od: od });
  const sub = w.reportMinusMultiForStores(data, [SH], true);
  ok('Шумен: 2 кода, само Шумен', sub.od.total === 2 && J(sub.od.stores.map(s => s.store)) === J([SH]), J(sub.od && sub.od.stores.map(s => s.store)));
  ok('без обхват — всичките 11', w.reportMinusMultiForStores(data, STORES, false).od.total === 11);
  ok('грешката остава грешка след срязването', w.reportMinusMultiForStores(Object.assign({}, data, { od: { error: true } }), [SH], true).od.error === true);

  section('6. Колекторът — грешка при разликите → писмото тръгва с червен ред');
  const route = { app_settings: [{ key: 'minus_stores', value: STORES.join(',') }], minus_movements: MOVS, minus_reasons: [], stock_differences: LINES, stock_diff_swaps: SWAPS };
  const run1 = async (failDiff) => {
    const log = [];
    w.fetch = function(url, init){
      const u = String(url), t = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1], qy = decodeURIComponent(u.split('?')[1] || '');
      log.push({ t, q: qy });
      const res = (st, b) => Promise.resolve({ ok: st < 300, status: st, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
      if (/offset=[1-9]/.test(qy)) return res(200, []);
      if (t === 'stock_differences' && failDiff) return res(500, { message: 'boom' });
      let rows = route[t] || [];
      if (t === 'minus_movements' && /posting_date=gte/.test(qy)) rows = [];
      const ni = (qy.match(/status=not\.in\.\(([^)]*)\)/) || [])[1];
      if (ni) rows = rows.filter(r => ni.split(',').indexOf(r.status) < 0);
      return res(200, JSON.parse(JSON.stringify(rows)));
    };
    const got = await new Promise(r => w.collectMinusMultiReportData('2026-11-16', r));
    return { got, log };
  };
  const ok1 = await run1(false);
  const sq = ok1.log.filter(x => x.t === 'stock_differences');
  ok('заявката: обектите от minus_stores, без приключените (not.in), с вградената бланка и коментарите', sq.length === 1 && /status=not\.in\.\(received,taken,capitalized,completed\)/.test(sq[0].q) &&
    /store_name=in\.\("Монтана","Шумен","Петрич"\)/.test(sq[0].q) && /differences_reports\(store_name,reviewed,direction,doc_date\)/.test(sq[0].q) && /resolution_comment/.test(sq[0].q), sq[0] && sq[0].q);
  ok('с успех: od.total = 11', ok1.got && ok1.got.od && ok1.got.od.total === 11, ok1.got && J(ok1.got.od && ok1.got.od.total));
  const bad = await run1(true);
  ok('разликите паднаха → данните ги има (писмото тръгва), od.error', !!bad.got && bad.got.od && bad.got.od.error === true);
  ok('… и в писмото е червеният ред', /Разликите не се заредиха/.test(w.reportMinusMultiHtml(bad.got)));

  h.close();
  report();
})().catch(e => { console.error(e); process.exit(1); });
