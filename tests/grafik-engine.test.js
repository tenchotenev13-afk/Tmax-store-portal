// Работен график, етап 1б — изчисленията (grafik-engine.js) срещу еталона.
// node tests/grafik-engine.test.js <root>
//
// Еталонът е обезличен (tests/fixtures/grafik-etalon.json) — бланката v70,
// преизчислена в Excel за месеца; setup-ите са от живата база. Сравнението е
// ПО СЛУЖИТЕЛ: официални часове, цел, разлика, вътрешни часове. Кодовете ден
// по ден — само там, където изравняване не е нужно (Тенчо, 02.11.2026).
// Празниците, Великден, работните дни и нормите 2026–2030 — срещу
// tests/fixtures/grafik-holidays-excel.json (пак от самата бланка).
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
var E = require(path.join(ROOT, 'grafik-engine.js'));
var ET = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'grafik-etalon.json'), 'utf8'));
var HX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'grafik-holidays-excel.json'), 'utf8'));

var ok = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function caseBy(key) { return ET.cases.filter(function (c) { return c.key === key; })[0]; }
function rowsOf(c) {
  return c.staff.map(function (s) {
    return { staff: { id: s.id, tag: s.tag, hired_on: s.hired_on, left_on: s.left_on, hours_per_day: 8 }, letters: s.letters, expect: s.expected };
  });
}
/* ── 1. Еталонът, по служител ─────────────────────────────────────────── */
function compareCase(key, setup) {
  var c = caseBy(key);
  var rows = rowsOf(c);
  var res = E.computeMonth(setup, c.ym, rows);
  var M = res.month;
  check(key + ': работни дни ' + c.workDays + ', норма ' + c.norm, M.workDays === c.workDays && M.norm === c.norm, M.workDays + '/' + M.norm);
  check(key + ': в графика ' + c.totals.inGrid, res.rows.length === c.totals.inGrid, res.rows.length);
  var bad = [], reachedWhereExcelNot = [], codeBad = [], onNorm = 0, cmpCodes = 0;
  res.rows.forEach(function (r) {
    var s = c.staff.filter(function (x) { return x.id === r.staff.id; })[0], e = s.expected;
    if (!e) { bad.push(r.staff.id + ' няма го в Excel'); return; }
    if (r.diff === 0) onNorm++;
    if (r.diff === 0 && e.diff !== 0) reachedWhereExcelNot.push(r.staff.id + ' (Excel ' + e.diff + ', сменени ' + r.changed.length + ')');
    if (r.official !== e.official || r.target !== e.target || r.diff !== e.diff || r.internal !== e.internal) {
      bad.push(r.staff.id + ': офиц ' + r.official + '/' + e.official + ' цел ' + r.target + '/' + e.target + ' разлика ' + r.diff + '/' + e.diff + ' вътр ' + r.internal + '/' + e.internal);
    }
    if (!r.changed.length && e.diff === 0) {
      cmpCodes++;
      var d = r.codes.filter(function (x, i) { return x !== e.codes[i]; });
      if (d.length) codeBad.push(r.staff.id);
    }
  });
  check(key + ': офиц. часове, цел, разлика и вътрешни часове — по всеки служител', !bad.length, bad.join(' | '));
  check(key + ': портът НЕ постига нормата там, където Excel не я постига', !reachedWhereExcelNot.length, reachedWhereExcelNot.join(', '));
  check(key + ': на нормата ' + c.totals.onNorm, onNorm === c.totals.onNorm, onNorm);
  check(key + ': кодове ден по ден (' + cmpCodes + ' души без изравняване)', cmpCodes > 0 && !codeBad.length, codeBad.join(', '));
  check(key + ': човекодни ' + c.totals.manDays + ', човекочасове ' + c.totals.manHours,
    res.totals.manDays === c.totals.manDays && res.totals.manHours === c.totals.manHours, res.totals.manDays + ' / ' + res.totals.manHours);
  check(key + ': О ' + c.totals.o + ', Б ' + c.totals.b, res.totals.o === c.totals.o && res.totals.b === c.totals.b, res.totals.o + ' / ' + res.totals.b);
  return res;
}

var kNov = compareCase('kardzhali-2026-11', ET.setups['2026-11']);
var pav = kNov.rows.filter(function (r) { return r.staff.tag === 'acc-128'; })[0];
check('Кърджали 11.2026: 41 в графика, 40 точно на нормата си (разлика 0)', kNov.rows.length === 41 && kNov.rows.filter(function (r) { return r.diff === 0; }).length === 40);
check('Кърджали 11.2026: случаят −128 ч. е маркиран, кодовете не са пипнати',
  pav && pav.diff === -128 && !pav.reachable && !pav.changed.length && JSON.stringify(pav.codes) === JSON.stringify(pav.before), pav && pav.diff);
check('Кърджали 11.2026: човекодни 618, човекочасове 5680', kNov.totals.manDays === 618 && kNov.totals.manHours === 5680);

// Октомври 2026: ТЕСТОВИ ДАННИ, НЕ РЕАЛЕН ГРАФИК (остатък от стара бланка — виж note във fixture-а).
// Остава като изчислителен случай за стария ВТР и лятото; не е импортиран в портала.
compareCase('kardzhali-2026-10', ET.setups['2026-10']);

// О4 → Д5/1 (къс ден 4 ч., целта не се намалява) — от базата след миграция 20261102095558,
// както в бланката. Раднево се сравнява с живите букви, без замяна.
var rNov = compareCase('radnevo-2026-11', ET.setups['2026-11']);
['acc-3a', 'acc-3b'].forEach(function (t) {
  var r = rNov.rows.filter(function (x) { return x.staff.tag === t; })[0];
  check('Раднево 11.2026: ' + t + ' −3 ч., маркиран, без смени', r && r.diff === -3 && !r.reachable && !r.changed.length, r && r.diff);
});
check('Раднево 11.2026: 15 в графика, 13 на нормата, 261 човекодни, 2370 ч.', rNov.rows.length === 15 && rNov.rows.filter(function (r) { return r.diff === 0; }).length === 13 &&
  rNov.totals.manDays === 261 && rNov.totals.manHours === 2370, rNov.totals.manDays + '/' + rNov.totals.manHours);
(function () {
  var c = caseBy('radnevo-2026-11'), withO4 = 0, bad = [];
  rNov.rows.forEach(function (r) {
    var L = c.staff.filter(function (s) { return s.id === r.staff.id; })[0].letters;
    L.forEach(function (v, i) { if (v === 'О4') { withO4++; if (r.codes[i] !== 'Д5/1') bad.push(r.staff.id + ':' + (i + 1)); } });
    if (r.warnings.some(function (w) { return /О4/.test(w.text); })) bad.push(r.staff.id + ' предупреждение за О4');
  });
  check('Раднево: 11-те О4 при 8 ч. → Д5/1, без предупреждение', withO4 === 11 && !bad.length, withO4 + ' ' + bad.join(' '));
})();

/* ── 2. Празници, Великден, норми 2026–2030 срещу Excel ───────────────── */
Object.keys(HX.years).forEach(function (y) {
  var X = HX.years[y], h = E.holidays(+y);
  check(y + ': Великден ' + X.easter, E.orthodoxEaster(+y) === X.easter, E.orthodoxEaster(+y));
  var mine = h.map(function (x) { return x.date; }).concat(h.map(function (x) { return x.used; }));
  check(y + ': празниците и ползваните дни (F2:F25)', JSON.stringify(mine) === JSON.stringify(X.F), mine.join(','));
  var bad = [];
  X.months.forEach(function (m, i) {
    var M = E.monthInfo(y + '-' + (i < 9 ? '0' : '') + (i + 1), []);
    if (M.workDays !== m.workDays || M.norm !== m.norm) bad.push((i + 1) + ': ' + M.workDays + '/' + m.workDays);
  });
  check(y + ': работни дни и норма за 12-те месеца', !bad.length, bad.join(' '));
});
check('2027: Великден 2.05.2027', E.orthodoxEaster(2027) === '2027-05-02');
var may27 = E.monthInfo('2027-05', []);
check('2027-05: 1 май (събота) → ползван 4 май (3 май е Велики понеделник); норма 136',
  may27.holiday[3] !== '' && may27.holiday[2] !== '' && may27.norm === 136, may27.norm);
check('2027-01-01 е петък', E.dow('2027-01-01') === 5);
check('допълнителен неработен ден маха работен ден от нормата',
  E.monthInfo('2026-11', [{ day: '2026-11-16' }]).norm === 160 && E.monthInfo('2026-11', []).norm === 168);

/* ── 3. Непълен работен ден — буквите по договор ─────────────────────── */
var S11 = ET.setups['2026-11'], P11 = E.prepare(S11), M11 = E.monthInfo('2026-11', []);
function workdayLetters(letter, except) {
  var L = new Array(M11.days).fill('');
  for (var i = 0; i < M11.days; i++) if (M11.dow[i] <= 5 && !M11.holiday[i] && (except || []).indexOf(i + 1) < 0) L[i] = letter;
  return L;
}
var four = { hours_per_day: 4 };
var r4 = E.computeRow(P11, M11, four, workdayLetters('П'), {});
check('4 ч. договор: 21 × П → 21 × Д5/1 = 84 ч. = цел 84, разлика 0 (ред 37 от образеца)', r4.official === 84 && r4.target === 84 && r4.diff === 0 &&
  r4.codes.filter(function (c) { return c === 'Д5/1'; }).length === 21, r4.official + '/' + r4.target);
var r4b = E.computeRow(P11, M11, four, workdayLetters('В'), {});
check('4 ч. договор: 21 × В → Д5/2 = 84 ч. (ред 38)', r4b.official === 84 && r4b.diff === 0 && r4b.codes[1] === 'Д5/2', r4b.official);
var Pl4 = E.prepare(ET.setups['2026-10']), Ml4 = E.monthInfo('2026-10', []), lv = new Array(31).fill(''); lv[0] = 'П'; lv[1] = 'В';
var rl4 = E.computeRow(Pl4, Ml4, four, lv, {});
check('4 ч. договор през лятото: П → Д5/1, В → Д5/2', rl4.codes[0] === 'Д5/1' && rl4.codes[1] === 'Д5/2', rl4.codes.slice(0, 2).join());
var lO = workdayLetters('П'); lO[1] = 'О';                                       // 2.11 — понеделник
var r4o = E.computeRow(P11, M11, four, lO, {});
check('4 ч. договор: О вади 4 ч. от целта (84 → 80), 20 × Д5/1 = 80', r4o.target === 80 && r4o.official === 80 && r4o.diff === 0, r4o.target + '/' + r4o.official);
check('4 ч. договор: вътрешните часове с О — 20 × 8 (П) + 4 (О по договор)', r4o.internal === 164, r4o.internal);
var lO4 = workdayLetters('П'); lO4[1] = 'О4';
var r4o4 = E.computeRow(P11, M11, four, lO4, {});
check('4 ч. договор: О4 → Д5/1 (къс ден), целта не се намалява', r4o4.codes[1] === 'Д5/1' && r4o4.target === 84 && r4o4.diff === 0, r4o4.codes[1] + ' ' + r4o4.target);
var lSun = workdayLetters('П'); lSun[0] = 'П';                                   // 1.11 — неделя
var r4sun = E.computeRow(P11, M11, four, lSun, {});
check('4 ч. договор: П в неделя → без код + предупреждение (няма 4-часов неделен код)', r4sun.codes[0] === '' &&
  r4sun.warnings.some(function (w) { return w.day === 1 && w.type === 'unknown'; }) && r4sun.official === 84, r4sun.codes[0] + ' ' + r4sun.official);
var lB = workdayLetters('П'); lB[0] = 'Б';
check('4 ч. договор: Б в неделя → Б (отсъствията са вписани и за неделя)', E.computeRow(P11, M11, four, lB, {}).codes[0] === 'Б');
var r4short = E.computeRow(P11, M11, four, workdayLetters('П', [3]), {});
check('4 ч. договор: −4 ч. → само маркира', r4short.diff === -4 && !r4short.reachable && !r4short.changed.length, r4short.diff);
// Изравняване при договор под 8 ч. — не. Ако някой ден договорът има 8-часов код с ход
// (тук: изкуствено П → Д1/З за 4 ч.), пак не се пипа.
var Sx = clone(S11); Sx.letter_map.forEach(function (l) { if (+l.hours_per_day === 4 && l.letter === 'П') l.code = 'Д1/З'; });
var tenP = new Array(30).fill(''); [1, 2, 3, 4, 5, 8, 9, 10, 11, 12].forEach(function (d) { tenP[d] = 'П'; });
var r4p = E.computeRow(E.prepare(Sx), M11, four, tenP, {});
check('договор 4 ч. с 8-часови кодове (80/84): НЕ се изравнява (+2 +2 би стигнало), само маркира', r4p.diff === -4 && !r4p.changed.length && !r4p.reachable, r4p.diff + ' ' + JSON.stringify(r4p.changed));
// Договор без нито един ред (6 ч.) — НЕ пада към общите букви.
var six = E.computeRow(P11, M11, { hours_per_day: 6 }, workdayLetters('П'), {});
check('6 ч. договор (без редове): кодове не се поставят', six.codes.every(function (c) { return c === ''; }) && six.official === 0, six.codes.filter(Boolean).join());
check('6 ч. договор: всеки ден с буква — „няма букви за договор 6 ч.“', six.warnings.filter(function (w) { return w.type === 'no_contract' && w.text === 'няма букви за договор 6 ч.'; }).length === 21,
  six.warnings.filter(function (w) { return w.type === 'no_contract'; }).length);
check('6 ч. договор: целта е по договора (21 × 6 = 126), разликата се вижда', six.target === 126 && six.diff === -126, six.target);
var lk6 = {}; lk6[2] = 'Д8';
var six2 = E.computeRow(P11, M11, { hours_per_day: 6 }, workdayLetters('П'), lk6);
check('6 ч. договор: ръчно заключен код се приема и без предупреждение за деня', six2.codes[1] === 'Д8' && !six2.warnings.some(function (w) { return w.day === 2; }), six2.codes[1]);
var lkAll = {}; workdayLetters('x').forEach(function (v, i) { if (v) lkAll[i + 1] = 'Д1/З'; });
var rLk = E.computeRow(P11, M11, { hours_per_day: 8 }, [], lkAll);
check('ред само със заключени кодове (без букви) има цел — 21 × Д1/З = 168 = цел', rLk.target === 168 && rLk.official === 168 && rLk.diff === 0, rLk.target + '/' + rLk.official);
check('8 ч. договор: общите букви (П → Д1/З)', E.computeRow(P11, M11, { hours_per_day: 8 }, workdayLetters('П'), {}).codes[1] === 'Д1/З');

/* ── 3б. К — командировка ─────────────────────────────────────────────── */
var kL = new Array(30).fill(''); kL[1] = 'К'; kL[0] = 'К';                  // пн 2.11 и нд 1.11
var rk = E.computeRow(P11, M11, { hours_per_day: 8 }, kL, {});
check('К → код К, часовете на пълната смяна за сезона (З1: 10.5) и в неделя', rk.codes[1] === 'К' && rk.codes[0] === 'К' && rk.official === 21, rk.codes[1] + ' ' + rk.official);
check('К е човекоден, не е отсъствие', rk.manDays === 2 && rk.absences === 0 && rk.target === 168, rk.manDays + '/' + rk.absences);
var Pl = E.prepare(ET.setups['2026-10']), Ml = E.monthInfo('2026-10', []), kl = new Array(31).fill(''); kl[0] = 'К';
check('К през лятото (Л) = 11 ч.', E.computeRow(Pl, Ml, { hours_per_day: 8 }, kl, {}).official === 11);

/* ── 4. „Свободни часове“ 1–12 ────────────────────────────────────────── */
var base = new Array(30).fill('');
var withNum = base.slice(); withNum[1] = 'П'; withNum[2] = '9';
var onlyP = base.slice(); onlyP[1] = 'П';
var rn = E.computeRow(P11, M11, { hours_per_day: 8 }, withNum, {});
var rp = E.computeRow(P11, M11, { hours_per_day: 8 }, onlyP, {});
check('числото 9 → +9 вътрешни часа', rn.internal === rp.internal + 9, rn.internal + ' / ' + rp.internal);
check('числото 9 → официалните часове и целта не се променят', rn.target === rp.target && rn.before.join() === rp.before.join() && rn.codes[2] === '', rn.target + '/' + rp.target);
check('числото 9 → бележка „ръчен код“', rn.notes.some(function (n) { return n.day === 3 && n.type === 'hours'; }));
check('числото не се брои като човекоден', rn.manDays === rp.manDays);

/* ── 5. Изравняването ─────────────────────────────────────────────────── */
// Синтетичен месец 11.2026 (З1): делниците П (Д1/З, 8 ч.), неделите П (Д6/2).
function synth(mod) {
  var L = new Array(30).fill('');
  for (var i = 0; i < 30; i++) if (M11.dow[i] <= 5 || M11.dow[i] === 7) L[i] = 'П';
  (mod || []).forEach(function (m) { L[m[0] - 1] = m[1]; });
  return L;
}
function sum(codes) { return codes.reduce(function (s, c) { return s + E.codeHours(P11, c); }, 0); }
// Празник на делник няма през 11.2026 → 21 делника × 8 = 168 + 5 недели × 8 = 40 → 208. Махаме недели и дни до близо 168.
var L1 = synth([[1, ''], [8, ''], [15, ''], [22, ''], [29, ''], [2, 'О']]);   // без неделите, 1 О → цел 160, офиц 160
var a = E.computeRow(P11, M11, { hours_per_day: 8 }, L1, {});
check('синтетичен: точно на нормата → без смени', a.diff === 0 && a.changed.length === 0, a.diff);
var L2 = L1.slice(); L2[2] = '';                                               // −8 → нужни +8
var b = E.computeRow(P11, M11, { hours_per_day: 8 }, L2, {});
check('+8 ч.: най-малко смени (4 × Д1/З → Д4/З по +2), най-ранните дни', b.diff === 0 && b.changed.length === 4 &&
  b.changed.every(function (x) { return x.from === 'Д1/З' && x.to === 'Д4/З'; }) && b.changed[0].day === 4, JSON.stringify(b.changed));
var L3 = L1.slice(); L3[29] = 'ЛД';                                            // 30.11 (пн) ЛД → Д5/З = +2.5
var c3 = E.computeRow(P11, M11, { hours_per_day: 8 }, L3, {});
check('ЛД вместо П (+2.5 над нормата) → един ход надолу −2.5 на НАЙ-РАННИЯ възможен ден',
  c3.diff === 0 && c3.changed.length === 1 && c3.changed[0].day === 30 && c3.changed[0].to === 'Д1/З', JSON.stringify(c3.changed));
// Смесено: −1.5 = −1 (Д6/1→Д6/2) + −0.5 (Д5/З→Д4/З) — нагоре и надолу в един месец.
var L4 = L1.slice(); L4[0] = 'ЛД'; L4[2] = 'ЛД'; L4[3] = '';                   // нд 1.11 ЛД (+9), вт 3.11 ЛД (+10.5 вм. 8), ср 4.11 празно (−8)
var d4 = E.computeRow(P11, M11, { hours_per_day: 8 }, L4, {});
check('смесено +9 +2.5 −8 = +3.5 → изравнено с 2 хода (−1 и −2.5 или подобни), точно 0', d4.diff === 0 && d4.changed.length === 2, JSON.stringify(d4.changed) + ' diff ' + d4.diff);
check('детерминистично — същият вход, същите смени', JSON.stringify(E.computeRow(P11, M11, { hours_per_day: 8 }, L4, {}).changed) === JSON.stringify(d4.changed));
check('сборът на часовете след изравняването = целта', sum(d4.codes) === d4.target, sum(d4.codes) + '/' + d4.target);
var lk = {}; lk[4] = 'Д1/З';
var c5 = E.computeRow(P11, M11, { hours_per_day: 8 }, L2, lk);
check('заключен ден не се пипа — изравнява се на следващите (без 4-ти)', c5.codes[3] === 'Д1/З' && c5.diff === 0 && c5.changed.length === 4 && !c5.changed.some(function (x) { return x.day === 4; }) && c5.changed[0].day === 5, JSON.stringify(c5.changed));
var L6 = L1.slice(); L6[3] = '9';                                              // празно с 9 свободни часа: −8 официално
var r6 = E.computeRow(P11, M11, { hours_per_day: 8 }, L6, {});
check('ден със „свободни часове“ не се изравнява като Д-код', r6.codes[3] === '' && !r6.changed.some(function (x) { return x.day === 4; }));
// Непостижимо: +0.5 с само 8-часови делници и без Д4/З / Д5/З → няма точна комбинация.
var L7 = L1.slice();
var P7 = E.prepare(S11); P7.mid = null;                                        // без междинната — само +2.5
var r7 = E.balance(P7, E.computeRow(P11, M11, { hours_per_day: 8 }, L7, {}).codes, M11.dow, {}, 0.5);
check('няма точна комбинация → null (кодовете не се пипат)', r7 === null);
check('целта е 0 за служител без нито един ден', E.computeRow(P11, M11, { hours_per_day: 8 }, [], {}).target === 0);

/* ── 6. Предупреждения ────────────────────────────────────────────────── */
var w = synth([]);
var rw = E.computeRow(P11, M11, { hours_per_day: 8, hired_on: '2026-11-10', left_on: '2026-11-25' }, w, {});
check('„6 работни дни в 7“ вече НЕ е предупреждение (ВТР чл. 19)', !rw.warnings.some(function (x) { return x.type === 'over5'; }));

/* ── 6б. Почивки и седмични часове (ВТР чл. 19 от 01.11.2026) ─────────── */
// Ноември 2026: 1.11 = неделя, 2.11 = понеделник. Седмици пон–нед: 26.10–1.11, 2–8, 9–15, 16–22, 23–29, 30.11–6.12.
function monthRows(letters, hpd) { return [{ staff: { id: 'x', hours_per_day: hpd || 8 }, letters: letters, locked: {} }]; }
function warnsOf(letters, prev) { return E.computeMonth(S11, '2026-11', monthRows(letters), prev).rows[0].warnings; }
function L30(map) { var a = new Array(30).fill(''); Object.keys(map).forEach(function (d) { a[+d - 1] = map[d]; }); return a; }
function onDays(from, to, letter) { var m = {}; for (var d = from; d <= to; d++) m[d] = letter; return m; }
var only = function (ws, t) { return ws.filter(function (x) { return x.type === t; }); };

var w7 = warnsOf(L30(onDays(2, 8, 'П')));                                       // пон 2 – нед 8: точно 7
check('точно 7 поредни работни дни → „няма 36 ч. седмична почивка“', only(w7, 'no_weekly_rest').length === 1 &&
  /^7 поредни работни дни \(02\.11–08\.11\) — няма 36 ч\. седмична почивка$/.test(only(w7, 'no_weekly_rest')[0].text) && only(w7, 'no_weekly_rest')[0].day === 2,
  JSON.stringify(only(w7, 'no_weekly_rest')));
var w6 = warnsOf(L30(onDays(2, 7, 'П')));                                       // 6 дни, после свободна неделя
check('6 поредни работни дни → без предупреждение', !only(w6, 'no_weekly_rest').length);
var w10 = warnsOf(L30(onDays(2, 11, 'П')));
check('10 поредни → ЕДНО предупреждение за цялата поредица', only(w10, 'no_weekly_rest').length === 1 && /^10 поредни/.test(only(w10, 'no_weekly_rest')[0].text));
var wAbs = warnsOf(L30(Object.assign(onDays(2, 11, 'П'), { 5: 'О' })));
check('отсъствие (О) по средата = почивка → няма поредица от 7', !only(wAbs, 'no_weekly_rest').length);
var wB = warnsOf(L30(Object.assign(onDays(2, 11, 'П'), { 5: 'Б', 9: 'НО' })));
check('Б и НО също са почивка', !only(wB, 'no_weekly_rest').length);
var wH = warnsOf(L30(Object.assign(onDays(2, 7, 'П'), { 8: '6' })));              // 6 смени + 6 свободни часа в неделя
check('„свободни часове“ са работен ден → 7 поредни', only(wH, 'no_weekly_rest').length === 1);

// 56 ч.: 6 × Д5/З (10.5) = 63 ч.
var w63 = warnsOf(L30(onDays(2, 7, 'ЛД')));
check('6 × Д5/З = 63 ч. в седмицата → „над 56 ч.“', only(w63, 'week_over_56').length === 1 &&
  /^63 ч\. в седмицата 02\.11–08\.11 \(пон–нед\) — над 56 ч\.$/.test(only(w63, 'week_over_56')[0].text), JSON.stringify(only(w63, 'week_over_56')));
check('…и 6 дни без 7-и → без „поредни дни“', !only(w63, 'no_weekly_rest').length);
var w56 = warnsOf(L30(onDays(2, 6, 'ЛД')));                                       // 5 × 10.5 = 52.5
check('52.5 ч. → без предупреждение', !only(w56, 'week_over_56').length);
var w56b = warnsOf(L30({ 2: 'П', 3: 'П', 4: 'П', 5: 'П', 6: 'П', 7: 'П', 8: '8' }));   // 6 × 8 + 8 свободни = 56
check('точно 56 ч. (6 × 8 + 8 свободни часа) → НЕ е над 56', !only(w56b, 'week_over_56').length);
var w57 = warnsOf(L30({ 2: 'П', 3: 'П', 4: 'П', 5: 'П', 6: 'П', 7: 'П', 8: '9' }));   // 57
check('57 ч. (свободните часове влизат в сбора) → над 56', only(w57, 'week_over_56').length === 1 && /^57 ч\./.test(only(w57, 'week_over_56')[0].text));

// Седмица през границата на месеца: 26.10–1.11.
var nov1 = L30({ 1: 'ЛД' });                                                     // нд 1.11 → Д6/1 = 9 ч.
var octL = new Array(31).fill(''); [25, 26, 27, 28, 29, 30].forEach(function (d) { octL[d] = 'ЛД'; });  // 26–31.10, Л: Д4/Л = 11 ч.
var PREV = { setup: ET.setups['2026-10'], ym: '2026-10', rows: { x: { letters: octL, locked: {} } } };
var wb = warnsOf(nov1, PREV);
check('седмица 26.10–1.11 с октомври от базата: 6 × 11 + 9 = 75 ч. → над 56', only(wb, 'week_over_56').length === 1 &&
  /^75 ч\. в седмицата 26\.10–01\.11/.test(only(wb, 'week_over_56')[0].text) && !/непълна/.test(only(wb, 'week_over_56')[0].text), JSON.stringify(only(wb, 'week_over_56')));
check('…и 7 поредни дни през границата (26.10–1.11) → предупреждение с ден 1-ви', only(wb, 'no_weekly_rest').length === 1 &&
  only(wb, 'no_weekly_rest')[0].day === 1 && /\(26\.10–01\.11\)/.test(only(wb, 'no_weekly_rest')[0].text), JSON.stringify(only(wb, 'no_weekly_rest')));
var wnp = warnsOf(nov1);
check('без октомври: 9 ч. → без „над 56“, без „поредни“', !only(wnp, 'week_over_56').length && !only(wnp, 'no_weekly_rest').length);
var cm = E.computeMonth(S11, '2026-11', monthRows(nov1));
check('без октомври: бележка за месеца „непълна седмица“', cm.notes.length === 1 && /^Седмицата 26\.10–01\.11 е непълна/.test(cm.notes[0]), cm.notes.join());
check('с октомври: без бележка', E.computeMonth(S11, '2026-11', monthRows(nov1), PREV).notes.length === 0);
var octOnly = new Array(31).fill(''); [18, 19, 20, 21, 22, 23, 24].forEach(function (d) { octOnly[d] = 'П'; });   // 19–25.10 — изцяло в октомври
check('поредица изцяло в предходния месец — не се отчита в ноември', !only(warnsOf(L30({}), { setup: ET.setups['2026-10'], ym: '2026-10', rows: { x: { letters: octOnly, locked: {} } } }), 'no_weekly_rest').length);
// Последната седмица (30.11–6.12) излиза в декември — над 56 само ако вече е над.
var wEnd = warnsOf(L30({ 30: 'ЛД' }));
check('последната седмица (през декември) с 10.5 ч. → нищо', !only(wEnd, 'week_over_56').length);

// Смяна над 12 ч.: в ВТР няма такъв код — проверка с изкуствен код от 13 ч.
var S13 = clone(S11); S13.codes.push({ code: 'Т13', hours: 13, kind: 'work' }); S13.letter_map.push({ letter: 'П', day_kind: 'З1', code: 'Т13', hours_per_day: null });
S13.letter_map = S13.letter_map.filter(function (l) { return !(l.letter === 'П' && l.day_kind === 'З1' && l.code !== 'Т13' && (l.hours_per_day === null || l.hours_per_day === undefined)); });
var w13 = E.computeMonth(S13, '2026-11', monthRows(L30({ 2: 'П' }))).rows[0].warnings;
check('смяна 13 ч. → „над 12 ч.“ с дата', only(w13, 'shift_over_12').length === 1 && only(w13, 'shift_over_12')[0].day === 2);
check('Д4/Л (11 ч.) и свободни 12 ч. → НЕ са над 12', !only(E.computeMonth(ET.setups['2026-10'], '2026-10', monthRows(new Array(31).fill('').map(function (v, i) { return i === 5 ? 'ЛД' : i === 6 ? '12' : ''; }))).rows[0].warnings, 'shift_over_12').length);
// Декември 2026: 1.12 = вторник → седмицата 30.11–06.12 има 6 дни в декември. Без ноември → „непълна“.
var D31 = function (map) { var a = new Array(31).fill(''); Object.keys(map).forEach(function (d) { a[+d - 1] = map[d]; }); return a; };
var dec = E.computeMonth(S11, '2026-12', [{ staff: { id: 'x', hours_per_day: 8 }, letters: D31(Object.assign(onDays(1, 6, 'ЛД'), { 24: 'П' })), locked: {} }]).rows[0].warnings;
var dw = only(dec, 'week_over_56');
check('декември без ноември: 5 × 10.5 + 9 (нд) = 61.5 ч. в седмицата 30.11–06.12 → „над 56 ч. (непълна седмица)“',
  dw.length === 1 && /^61\.5 ч\. в седмицата 30\.11–06\.12 \(пон–нед\) — над 56 ч\. \(непълна седмица\)$/.test(dw[0].text) && dw[0].day === 1, JSON.stringify(dw));
check('предупрежденията са подредени по ден (седмицата от 1-ви преди празника на 24-ти)', dec.length >= 2 &&
  dec.every(function (w, i) { return !i || dec[i - 1].day <= w.day; }) && dec[0].type === 'week_over_56' && dec[dec.length - 1].type === 'holiday', JSON.stringify(dec.map(function (w) { return w.day + ':' + w.type; })));
var S12 = clone(S11); S12.codes.push({ code: 'Т12', hours: 12, kind: 'work' });
S12.letter_map = S12.letter_map.filter(function (l) { return !(l.letter === 'П' && l.day_kind === 'З1' && (l.hours_per_day === null || l.hours_per_day === undefined)); });
S12.letter_map.push({ letter: 'П', day_kind: 'З1', code: 'Т12', hours_per_day: null });
check('смяна точно 12 ч. → НЕ е над 12', !only(E.computeMonth(S12, '2026-11', monthRows(L30({ 2: 'П' }))).rows[0].warnings, 'shift_over_12').length);
check('смяна преди назначаване', rw.warnings.some(function (x) { return x.type === 'before_hire' && x.day === 2; }));
check('смяна след напускане', rw.warnings.some(function (x) { return x.type === 'after_leave' && x.day === 26; }));
var dec = E.monthInfo('2026-12', []), Pd = E.prepare(S11);
var wd = new Array(31).fill(''); wd[23] = 'П';
check('смяна на празник (24.12.2026)', E.computeRow(Pd, dec, { hours_per_day: 8 }, wd, {}).warnings.some(function (x) { return x.type === 'holiday' && x.day === 24; }));
check('кой е в графика: напуснал преди месеца — не; назначен след него — не; в месеца — да',
  !E.inMonth(M11, { left_on: '2026-10-31' }) && !E.inMonth(M11, { hired_on: '2026-12-01' }) && E.inMonth(M11, { left_on: '2026-11-01', hired_on: '2026-11-30' }));

console.log('\n' + ok + ' успешни, ' + fail + ' неуспешни');
process.exit(fail ? 1 : 0);
