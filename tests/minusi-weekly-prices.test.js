/* „Ценови разлики (минус ↔ заметнат)“ в писмото minus_multi и писмата до обектите
   „Минуси с отворена разлика“ (23.11.2026, сесия minusi-weekly-prices-stores;
   Теодор 23.11, решения А и Б на Тенчо).

   (А) 955 за седмицата [ref − 6; ref] със заметнат код, без клиентската поръчка.
       Стойностите и разликата — функцията на офиса от таб Минуси (mnValRow:
       количество × цена; заметнат само при ЕДИН код; разлика от закръглените до
       2 знака), но по ЦЯЛОТО количество на 955 (qty), не по незакрития остатък
       (решение на Тенчо 23.11) — закрит с 956 минус пак носи разлика. Без цена / няколко кода — в реда, извън
       разликата, преброени. Сума по обект и „Общо за седмицата“. Регионалният —
       само своите обекти.
   (Б) Писмо до обекта: само неговите редове от „Минуси с отворена разлика“, без
       цени; до управителите (manager, активни, с имейл САМО на @temax.bg — друг
       адрес → skipped); без редове / без имейл → без писмо.

   Порталът (report.js върху истинския minusi.js) и send-scheduled-report
   (функциите и копията, изпълнени във vm) се пускат върху едни и същи редове и се
   сравняват помежду си и с ръчно сметнатото.

   Мутационна проверка (23.11.2026) — върху чистия код (report.js + .ts заедно):
     M1 цени в писмото на обекта (reportMinusStoreHtml добавя reportMinusPriceHtml);
     M2 друг обект в писмото на обекта (reportMinusStoreJobs не филтрира по обект);
     M3 код без цена влиза в сумата (липсващата цена на заметнатия = 0);
     M4 пак по остатъка (количеството минус 956 по същия материал на обекта);
     M5 без филтъра @temax.bg (всеки адрес на управител получава).
   Броят паднали — в отчета на сесията. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const J = JSON.stringify;
const MT = 'Монтана', SH = 'Шумен', PE = 'Петрич';
const STORES = [MT, SH, PE];
const REF = '2026-11-22';
const near = (a, b) => Math.abs(a - b) < 1e-9;

let q = 0;
const mv = (store, code, date, type, qty, real, o) => Object.assign({ id: 'm' + String(++q).padStart(2, '0'), store_name: store, material: code, material_desc: 'АРТИКУЛ ' + code,
  mvt_type: type, qty: qty, uom: 'БР', mat_doc: String(4900000000 + q), doc_item: '1', posting_date: date, real_code: real || null, reason_id: null }, o || {});
const MOVS = [
  /* m01 */ mv(MT, 'A1', '2026-11-17', '955', 2, 'B1'),               /* 2×10 − 2×7,5 = 5,00 */
  /* m02 */ mv(MT, 'A2', '2026-11-18', '955', 1, '38554 и 38619'),    /* няколко кода → без заметнат */
  /* m03 */ mv(MT, 'A3', '2026-11-19', '955', 3, 'NOP'),              /* заметнатият без цена */
  /* m04 */ mv(MT, 'A4', '2026-11-20', '955', 2, 'B1'),               /* 956 закрива 1, но се смята по 2: 12 − 15 = −3,00 */
  /* m05 */ mv(MT, 'A4', '2026-11-21', '956', -1),
  /* m06 */ mv(MT, 'A5', '2026-11-10', '955', 1, 'B1'),               /* предходната седмица → не */
  /* m07 */ mv(MT, 'A6', '2026-11-18', '955', 1, null),               /* без заметнат → не */
  /* m08 */ mv(MT, 'A7', '2026-11-18', '955', 1, 'B1', { reason_id: 9 }), /* клиентска поръчка → не */
  /* m09 */ mv(SH, 'C1', '2026-11-16', '955', 1, 'D1'),               /* 3,33 − 1,11 = 2,22 */
  /* m10 */ mv(SH, 'C2', '2026-11-23', '955', 1, 'D1'),               /* след неделята → не */
  /* m11 */ mv('Добрич', 'X1', '2026-11-18', '955', 1, 'B1'),        /* не е в minus_stores */
  /* m12 */ mv(MT, 'A8', '2026-11-19', '955', 1, 'B1'),               /* изцяло закрит с 956 → пак 9 − 7,5 = 1,50 (≠ 0) */
  /* m13 */ mv(MT, 'A8', '2026-11-20', '956', -1)
];
const REASONS = [{ id: 9, label: 'Клиентска поръчка', requires_note: true }, { id: 1, label: 'Грешен код', requires_note: false }];
const CAT = {
  prices: { A1: { price: 10, unit: 'БР' }, A2: { price: 5, unit: 'БР' }, A3: { price: 4, unit: 'БР' }, A4: { price: 6, unit: 'БР' }, B1: { price: 7.5, unit: 'БР' },
    A8: { price: 9, unit: 'БР' }, C1: { price: 3.333, unit: 'БР' }, D1: { price: 1.111, unit: 'БР' } },
  names: { B1: 'ЗАМЕТНАТ B1', D1: 'ЗАМЕТНАТ D1', NOP: 'БЕЗ ЦЕНА' },
  at: '2026-11-09T09:40:50.839+00:00'
};
/* Ръчно, по количеството на 955: Монтана — A1, A2, A3, A8, A4 (5 реда); Шумен — C1. */
const HAND = {
  [MT]: { rows: 5, minus: 20 + 5 + 12 + 9 + 12, nMinus: 5, real: 15 + 7.5 + 15, nReal: 3, diff: 5 + 1.5 - 3, nDiff: 3, noPrice: 1, multi: 1 },
  [SH]: { rows: 1, minus: 3.333, nMinus: 1, real: 1.111, nReal: 1, diff: 2.22, nDiff: 1, noPrice: 0, multi: 0 }
};

/* „Минуси с отворена разлика“ — минимални редове за писмата до обектите. */
const rep = (store, dir) => ({ store_name: store, reviewed: false, direction: dir, doc_date: '2026-11-10' });
const LINES = [
  { id: 'L1', store_name: MT, material_code: 'A1', material_name: 'АРТИКУЛ A1', type: 'writein', status: 'pending', differences_reports: rep(MT, 'supplier'), created_at: '2026-11-10T08:00:00Z' },
  { id: 'L2', store_name: SH, material_code: 'C1', material_name: 'АРТИКУЛ C1', type: null, status: 'new', differences_reports: rep(SH, 'interstore'), created_at: '2026-11-10T08:00:00Z' }
];
const USERS = [
  { email: 'mgr.montana@temax.bg', store_name: MT, role: 'manager', active: true },
  { email: 'MGR.MONTANA@temax.bg', store_name: MT, role: 'manager', active: true },   /* същият имейл → веднъж */
  { email: 'two.montana@TEMAX.BG', store_name: MT, role: 'manager', active: null },   /* active null = активен; главни в домейна — пак temax */
  { email: 'test.montana@gmail.com', store_name: MT, role: 'manager', active: true }, /* gmail → skipped, не получава */
  { email: 'old.montana@temax.bg', store_name: MT, role: 'manager', active: false },  /* неактивен → не */
  { email: 'seller.montana@temax.bg', store_name: MT, role: 'store', active: true },  /* не е manager → не */
  { email: 'sh@temax.bg', store_name: SH, role: 'manager', active: false },           /* Шумен — неактивен … */
  { email: 'sh.test@gmail.com', store_name: SH, role: 'manager', active: true },      /* … и само gmail → без имейл */
  { email: '  ', store_name: SH, role: 'manager', active: true },
  { email: 'pe@temax.bg', store_name: PE, role: 'manager', active: true }             /* Петрич — без редове */
];

/* ── send-scheduled-report: функциите + копията във vm ── */
function edgeCtx(){
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts'), 'utf8').replace(/\r\n/g, '\n');
  const grabFn = name => { const i = src.indexOf('\nfunction ' + name + '('); if (i < 0) throw new Error('няма ' + name);
    let d = 0, st = false; for (let j = src.indexOf('{', i); j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); } } };
  const grabVar = name => { const i = src.indexOf('\nvar ' + name + ' = '); if (i < 0) throw new Error('няма var ' + name); return src.slice(i, src.indexOf('\n', i + 1)); };
  const fns = ['reportMinusPriceSum', 'reportMinusPriceAdd', 'reportMinusPriceGroup', 'reportMinusPriceForStores', 'reportMinusPriceHtml',
    'reportMinusStorePlan', 'reportMinusStoreJobs', 'reportMinusStoreSubject', 'reportMinusStoreHtml',
    'reportMinusOdTurn', 'reportMinusOdStatus', 'reportMinusOdComments', 'reportMinusOdGroup', 'reportMinusOdHtml', 'reportDiffIsRouted',
    'reportMinusMultiDM', 'reportMinusMultiAddDays', 'reportMinusMultiCoIds', 'reportMinusMultiIsCo', 'reportEmailShell',
    'sdIsClosed', 'sdIsTaken', 'sdIsCompleted', 'sdRowAwaitsMark', 'sdStoreMustAct', 'sdStatusWords', 'bulDiffLineWaitsStore', 'bulDiffStoreWaiting', 'diffLineWaitsStore',
    'mnRound', 'mnFmtQty', 'mnNormUom', 'mnCoKey', 'mnRealOne', 'mnValRow', 'mnValUomWarn', 'mnFmtEur', 'mnRevIsCode', 'mnRevRealCodes', 'esc', 'escAttr'];
  const vars = ['REPORT_MINUS_OD_DIR', 'REPORT_MINUS_OD_TURN', 'SD_CLOSED_STATUSES', 'SD_STATUS_NEW_LABEL', 'MN_LOOKALIKE', 'REPORT_MINUS_PRICE_BATCH', 'PORTAL_URL'];
  const ctx = {};
  vm.createContext(ctx);
  const code = 'var mnReasons = []; var mnPrices = {}; var mnRepeatDays = 0; var mnMultiCount = 1; var mnMultiDays = 1;\n' +
    vars.map(grabVar).join('\n') + '\n' + fns.map(grabFn).join('\n');
  vm.runInContext(code.replace(/\((\w+): any\)/g, '($1)').replace(/function (\w+)\(s: any\)/g, 'function $1(s)') +
    '\n;this.getPrices = function(){ return mnPrices; };', ctx);
  return ctx;
}
const prShape = pr => J({ from: pr.from, to: pr.to, at: pr.at, total: pr.total, stores: pr.stores.map(s => ({ store: s.store, sum: s.sum, items: s.items })) });

(async function run() {
  const h = boot({ modules: ['bulletin.js', 'stock-returns.js', 'stock-differences.js', 'report.js', 'minusi.js'], user: { email: 'a@temax.bg', role: 'admin', store_name: 'Централен офис' }, data: {} });
  const w = h.w;
  const pr = w.reportMinusPriceGroup(MOVS, CAT, STORES, REF, REASONS);
  const byStore = {}; pr.stores.forEach(s => { byStore[s.store] = s; });
  const item = (s, c) => (byStore[s] ? byStore[s].items : []).find(it => it.material === c);

  section('1. Кои редове влизат (А)');
  ok('седмицата 16.11–22.11', pr.from === '2026-11-16' && pr.to === REF, pr.from + '–' + pr.to);
  ok('Монтана: A1, A2, A3, A8, A4 (по дата); Шумен: C1; Петрич и Добрич — нищо', J(pr.stores.map(s => [s.store, s.items.map(it => it.material)])) === J([[MT, ['A1', 'A2', 'A3', 'A8', 'A4']], [SH, ['C1']]]),
    J(pr.stores.map(s => [s.store, s.items.map(it => it.material)])));
  ok('не влизат: предходна седмица (A5), без заметнат (A6), клиентска поръчка (A7), след неделята (C2), извън minus_stores (X1)',
    !item(MT, 'A5') && !item(MT, 'A6') && !item(MT, 'A7') && !item(SH, 'C2'));

  section('2. Стойностите = правилото на офиса в таб Минуси');
  ok('един минус с един заметнат (A1): 20,00 − 15,00 = 5,00', near(item(MT, 'A1').minus, 20) && near(item(MT, 'A1').realVal, 15) && near(item(MT, 'A1').diff, 5), J(item(MT, 'A1')));
  ok('частично закрит с 956 (A4: 955 2 бр, 956 1 бр) → по цялото количество 2: 12,00 − 15,00 = −3,00', item(MT, 'A4').qty === 2 && near(item(MT, 'A4').diff, -3), J(item(MT, 'A4')));
  ok('изцяло закрит с 956 (A8) → разликата е по цялото количество: 9,00 − 7,50 = 1,50 (≠ 0)', item(MT, 'A8').qty === 1 && near(item(MT, 'A8').minus, 9) && near(item(MT, 'A8').diff, 1.5), J(item(MT, 'A8')));
  ok('няколко заметнати (A2: „38554 и 38619“) → без стойност заметнат, без разлика, multi', item(MT, 'A2').multi && item(MT, 'A2').realVal == null && item(MT, 'A2').diff == null && near(item(MT, 'A2').minus, 5));
  ok('заметнатият без цена (A3) → noReal, без разлика', item(MT, 'A3').noReal && item(MT, 'A3').realVal == null && item(MT, 'A3').diff == null);
  ok('разликата е от закръглените (C1: 3,333 − 1,111 → 3,33 − 1,11 = 2,22)', near(item(SH, 'C1').diff, 3.33 - 1.11), item(SH, 'C1').diff);
  /* Независимо: истинската mnValRow от minusi.js с цените в mnPrices и количеството на 955 като _rest. */
  const keep = w.mnPrices;
  w.eval('mnPrices = ' + J(CAT.prices));
  const tab = {}; MOVS.forEach(r => { if (r.mvt_type === '955') tab[r.id] = w.mnValRow(Object.assign({}, r, { _rest: r.qty })); });
  /* Таб Минуси (остатъкът) не е пипан: за закрития A8 там е 0. */
  const calc = w.mnCompute(MOVS.filter(m => STORES.indexOf(m.store_name) >= 0), {}, 0, { count: 1, days: 1 });
  const a8tab = w.mnValRow(calc.all.find(r => r.material === 'A8'));
  w.mnPrices = keep;
  ok('таб Минуси за същия закрит A8 остава по остатъка (0,00) — табът не е пипнат', a8tab.minus === 0 && a8tab.diff === 0, J(a8tab));
  ok('всеки ред = mnValRow (функцията на таба) с количеството на 955 (minus / real / diff)', pr.stores.every(s => s.items.every(it => { const v = tab[it.id];
    return v && v.minus === it.minus && v.real === it.realVal && v.diff === it.diff; })), J(pr.stores.map(s => s.items.map(it => [it.id, it.minus, it.realVal, it.diff, tab[it.id]]))));
  ok('глобалният mnPrices на таба е върнат след смятането', w.eval('mnPrices') === keep);

  section('3. Суми по обект и общо, „няма цена“ — преброени и извън сумата');
  const chk = (s, e) => s.rows === e.rows && near(s.minus, e.minus) && s.nMinus === e.nMinus && near(s.real, e.real) && s.nReal === e.nReal && near(s.diff, e.diff) && s.nDiff === e.nDiff && s.noPrice === e.noPrice && s.multi === e.multi;
  ok('Монтана: 5 реда, разлика 3,50 (5,00 + 1,50 − 3,00), 1 без цена, 1 с няколко кода', chk(byStore[MT].sum, HAND[MT]), J(byStore[MT].sum));
  ok('Шумен: 1 ред, разлика 2,22', chk(byStore[SH].sum, HAND[SH]), J(byStore[SH].sum));
  ok('Общо за седмицата: 6 реда, разлика 5,72 (3,50 + 2,22)', pr.total.rows === 6 && near(pr.total.diff, 5.72) && pr.total.noPrice === 1 && pr.total.multi === 1 && pr.total.nDiff === 4, J(pr.total));

  section('4. HTML (А)');
  const html = w.reportMinusPriceHtml(pr);
  const doc = new w.DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const txt = doc.body.textContent;
  ok('заглавие и „Цени от VKP2 към 09.11.2026, без промоции.“', /Ценови разлики \(минус ↔ заметнат\)/.test(txt) && /Цени от VKP2 към 09\.11\.2026, без промоции\./.test(txt), txt.slice(0, 200));
  ok('колоните: Код минус · Описание · К-во · Стойност минус · Заметнат код · Описание · Стойност заметнат · Разлика (€)',
    J(Array.from(doc.querySelector('table tr').cells).map(c => c.textContent)) === J(['Код минус', 'Описание', 'К-во', 'Стойност минус', 'Заметнат код', 'Описание', 'Стойност заметнат', 'Разлика (€)']));
  ok('6 реда; A3 носи „няма цена“, A2 — „няколко кода“', doc.querySelectorAll('tr.mm-pr-item').length === 6 && doc.querySelectorAll('.mm-pr-noprice').length === 1 && doc.querySelectorAll('.mm-pr-multi').length === 1);
  ok('броят над таблиците: без цена 1, с няколко кода 1 (не влизат в разликата)', /без цена: 1/.test(txt) && /няколко заметнати кода: 1/.test(txt) && /не влизат в разликата/.test(txt));
  const sums = Array.from(doc.querySelectorAll('tr.mm-pr-sum')).map(tr => tr.textContent);
  ok('сума по обект: „Общо Монтана … 3,50 €“ и „Общо Шумен … 2,22 €“', sums.length === 2 && /^Общо Монтана/.test(sums[0]) && /3,50 €$/.test(sums[0]) && /2,22 €$/.test(sums[1]), J(sums));
  ok('„Общо за седмицата … разлика 5,72 €“', /Общо за седмицата: .*разлика 5,72 €/.test(doc.querySelector('.mm-pr-total').textContent), doc.querySelector('.mm-pr-total').textContent);
  const a1 = Array.from(doc.querySelectorAll('tr.mm-pr-item')).find(tr => tr.cells[0].textContent === 'A1');
  ok('A1: 2 БР · 20,00 € · B1 · ЗАМЕТНАТ B1 · 15,00 € · 5,00 €', a1 && J(Array.from(a1.cells).map(c => c.textContent)) === J(['A1', 'АРТИКУЛ A1', '2 БР', '20,00 €', 'B1', 'ЗАМЕТНАТ B1', '15,00 €', '5,00 €']), a1 && J(Array.from(a1.cells).map(c => c.textContent)));
  ok('празно → „Няма минус със заметнат код за седмицата.“', /Няма минус със заметнат код/.test(w.reportMinusPriceHtml(w.reportMinusPriceGroup([], CAT, STORES, REF, REASONS))));
  ok('грешка → червен ред „Цените не се заредиха“', /Цените не се заредиха/.test(w.reportMinusPriceHtml({ error: true })));
  const full = w.reportMinusMultiHtml(Object.assign(w.reportMinusMultiGroup([], STORES, 3, 30, REF), { od: { stores: [], total: 0 }, pr: pr, co: { stores: [], total: 0 } }));
  ok('в писмото към офиса — секцията я има', full.indexOf('Ценови разлики') > 0 && full.indexOf('Ценови разлики') < full.indexOf('Повтарящи се по клиентски поръчки'));

  section('5. Регионалният — само своите обекти');
  const data = Object.assign(w.reportMinusMultiGroup([], STORES, 3, 30, REF), { pr: pr });
  const sub = w.reportMinusMultiForStores(data, [SH], true);
  ok('Шумен: само Шумен, разлика 2,22, 1 ред', J(sub.pr.stores.map(s => s.store)) === J([SH]) && sub.pr.total.rows === 1 && near(sub.pr.total.diff, 2.22), J(sub.pr.total));
  ok('… и в HTML-а му няма Монтана', !/Монтана/.test(w.reportMinusPriceHtml(sub.pr)));
  ok('без обхват — всичките 6', w.reportMinusMultiForStores(data, STORES, false).pr.total.rows === 6);
  ok('грешката остава грешка', w.reportMinusMultiForStores(Object.assign({}, data, { pr: { error: true } }), [SH], true).pr.error === true);

  section('6. Писма до обектите (Б)');
  const od = w.reportMinusOdGroup(MOVS, LINES, [], STORES);
  const plan = w.reportMinusStorePlan(USERS, STORES);
  ok('план: Монтана → двата активни на @temax.bg (без дубъла, неактивния, продавача; gmail → skipped); Шумен → никой (само gmail); Петрич → pe@temax.bg',
    J(plan) === J([{ store: MT, emails: ['mgr.montana@temax.bg', 'two.montana@TEMAX.BG'], skipped: ['test.montana@gmail.com'] },
      { store: SH, emails: [], skipped: ['sh.test@gmail.com'] }, { store: PE, emails: ['pe@temax.bg'], skipped: [] }]), J(plan));
  ok('управител с gmail не получава писмо', !plan.some(p => p.emails.some(e => /gmail/i.test(e))));
  const jobs = w.reportMinusStoreJobs(plan, od);
  const jb = {}; jobs.forEach(j => { jb[j.store] = j; });
  ok('Монтана с редове → писмо', jb[MT].send === true && jb[MT].reason === null && jb[MT].od.total === 1);
  ok('Шумен с редове, но само gmail на управител → пропуснат (no_email), адресът — в skipped', jb[SH].send === false && jb[SH].reason === 'no_email' && jb[SH].od.total === 1 && J(jb[SH].skipped) === J(['sh.test@gmail.com']));
  ok('Петрич без редове → без писмо (no_rows)', jb[PE].send === false && jb[PE].reason === 'no_rows');
  ok('секцията с грешка → никому (od_error)', w.reportMinusStoreJobs(plan, { error: true }).every(j => !j.send && j.reason === 'od_error'));
  const sh = w.reportMinusStoreHtml(MT, jb[MT].od, REF);
  const sdoc = new w.DOMParser().parseFromString(sh, 'text/html');
  const stxt = sdoc.body.textContent;
  ok('писмото на Монтана — само нейните редове (A1, не C1 / Шумен)', sdoc.querySelectorAll('tr.mm-od-item').length === 1 && sdoc.querySelector('tr.mm-od-item').cells[0].textContent === 'A1' && !/Шумен|C1/.test(stxt));
  ok('… с колоната „Ход“ и редът отгоре', /Ход/.test(stxt) && /Минусите по-долу имат неприключена разлика — приключете тези, при които ходът е ваш, в Разлики\./.test(stxt));
  ok('… БЕЗ цени (нито €, нито „Стойност“, нито „Ценови разлики“)', !/€|Стойност|Ценови разлики|VKP2/.test(sh));
  ok('тема: „Минуси с отворена разлика — Монтана — до 22.11.2026“ (≠ темата към офиса)', w.reportMinusStoreSubject(MT, REF) === 'Минуси с отворена разлика — Монтана — до 22.11.2026' &&
    w.reportMinusStoreSubject(MT, REF) !== w.reportMinusMultiSubject({ ref: REF }));

  section('7. send-scheduled-report = порталът');
  let ctx = null;
  try { ctx = edgeCtx(); ok('функциите и копията от .ts се изпълняват', true); } catch (e) { ok('функциите и копията от .ts се изпълняват', false, e.message); }
  if (ctx) {
    ok('MN_LOOKALIKE — същият като в minusi.js', J(vm.runInContext('MN_LOOKALIKE', ctx)) === J(w.eval('MN_LOOKALIKE')));
    const epr = ctx.reportMinusPriceGroup(JSON.parse(J(MOVS)), JSON.parse(J(CAT)), STORES, REF, REASONS);
    ok('reportMinusPriceGroup: .ts = порталът', prShape(epr) === prShape(pr), prShape(epr).slice(0, 300));
    ok('reportMinusPriceHtml: .ts = порталът', ctx.reportMinusPriceHtml(epr) === html);
    ok('reportMinusPriceForStores: .ts = порталът', prShape(ctx.reportMinusPriceForStores(epr, [SH])) === prShape(sub.pr));
    const eod = ctx.reportMinusOdGroup(JSON.parse(J(MOVS)), JSON.parse(J(LINES)), [], STORES);
    const ejobs = ctx.reportMinusStoreJobs(ctx.reportMinusStorePlan(USERS, STORES), eod);
    ok('reportMinusStorePlan / Jobs: .ts = порталът', J(ejobs) === J(jobs));
    ok('reportMinusStoreHtml: .ts = порталът', ctx.reportMinusStoreHtml(MT, ejobs[0].od, REF) === sh);
  }

  section('8. Колекторът — заявките, датата на VKP2 и грешка при цените');
  const route = { app_settings: [{ key: 'minus_stores', value: STORES.join(',') }], minus_movements: MOVS, minus_reasons: REASONS, stock_differences: LINES, stock_diff_swaps: [] };
  const run1 = async (failPrice) => {
    const log = [];
    w.fetch = function(url){
      const u = String(url), t = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1], qy = decodeURIComponent(u.split('?')[1] || '');
      log.push({ t, q: qy });
      const res = (st, b) => Promise.resolve({ ok: st < 300, status: st, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
      if (/offset=[1-9]/.test(qy)) return res(200, []);
      if (t === 'product_catalog') {
        if (failPrice) return res(500, { message: 'boom' });
        if (/sale_price_uploaded_at=not\.is\.null/.test(qy)) return res(200, [{ sale_price_uploaded_at: CAT.at }]);
        const codes = ((qy.match(/sap_code=in\.\(([^)]*)\)/) || [])[1] || '').split(',').map(c => c.replace(/"/g, ''));
        return res(200, codes.filter(c => CAT.prices[c] || CAT.names[c]).map(c => ({ sap_code: c, product_name: CAT.names[c] || null,
          sale_price: CAT.prices[c] ? CAT.prices[c].price : null, sale_price_unit: CAT.prices[c] ? CAT.prices[c].unit : null })));
      }
      let rows = route[t] || [];
      if (t === 'minus_movements' && /mvt_type=eq\.955/.test(qy)) rows = rows.filter(r => r.mvt_type === '955' && STORES.indexOf(r.store_name) >= 0);
      if (t === 'minus_movements' && /mvt_type=in\.\(955,956\)/.test(qy)) rows = rows.filter(r => STORES.indexOf(r.store_name) >= 0);
      return res(200, JSON.parse(JSON.stringify(rows)));
    };
    const got = await new Promise(r => w.collectMinusMultiReportData(REF, r));
    return { got, log };
  };
  const ok1 = await run1(false);
  const mq = ok1.log.filter(x => x.t === 'minus_movements' && /qty,uom/.test(x.q));
  ok('движенията: само 955 на обектите за седмицата, с qty / uom / real_code', mq.length === 1 && /mvt_type=eq\.955/.test(mq[0].q) && /posting_date=gte\.2026-11-16&posting_date=lte\.2026-11-22/.test(mq[0].q) && /real_code/.test(mq[0].q) &&
    /store_name=in\.\("Монтана","Шумен","Петрич"\)/.test(mq[0].q), mq[0] && mq[0].q);
  const pq = ok1.log.filter(x => x.t === 'product_catalog' && /sap_code=in/.test(x.q));
  ok('цените: само кодовете на седмицата със заметнат (минус + заметнатите, вкл. разделените 38554 / 38619; A7 — колекторът не знае причината, редът отпада после)', pq.length === 1 &&
    J(pq[0].q.match(/sap_code=in\.\(([^)]*)\)/)[1].replace(/"/g, '').split(',').sort()) === J(['38554', '38619', 'A1', 'A2', 'A3', 'A4', 'A7', 'A8', 'B1', 'C1', 'D1', 'NOP'].sort()), pq[0] && pq[0].q);
  ok('с успех: pr = чистото смятане, at = датата на качването', ok1.got && ok1.got.pr && prShape(ok1.got.pr) === prShape(pr), ok1.got && ok1.got.pr && prShape(ok1.got.pr).slice(0, 300));
  const bad = await run1(true);
  ok('цените паднаха → данните ги има (писмото тръгва), pr.error', !!bad.got && bad.got.pr && bad.got.pr.error === true);
  ok('… и в писмото е червеният ред', /Цените не се заредиха/.test(w.reportMinusMultiHtml(bad.got)));

  h.close();
  report();
})().catch(e => { console.error(e); process.exit(1); });
