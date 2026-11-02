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
// Бланката превежда О4 → Д5/1 (4 ч. работа). От 01.11.2026 в базата О4 → О.
// За сравнението с бланката се ползва нейният превод — виж отделния блок за Раднево.
function withOldO4(setup) {
  var s = clone(setup);
  s.letter_map.forEach(function (l) { if (l.letter === 'О4') l.code = 'Д5/1'; });
  return s;
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

compareCase('kardzhali-2026-10', ET.setups['2026-10']);

var rNov = compareCase('radnevo-2026-11', withOldO4(ET.setups['2026-11']));
['acc-3a', 'acc-3b'].forEach(function (t) {
  var r = rNov.rows.filter(function (x) { return x.staff.tag === t; })[0];
  check('Раднево 11.2026 (О4 като в бланката): ' + t + ' −3 ч., маркиран, без смени', r && r.diff === -3 && !r.reachable && !r.changed.length, r && r.diff);
});
check('Раднево 11.2026: 15 в графика, 13 на нормата', rNov.rows.length === 15 && rNov.rows.filter(function (r) { return r.diff === 0; }).length === 13);

// Раднево с превода от базата (О4 → О): О4 при 8-часов договор → предупреждение на всеки ред.
(function () {
  var c = caseBy('radnevo-2026-11');
  var res = E.computeMonth(ET.setups['2026-11'], c.ym, rowsOf(c));
  var withO4 = res.rows.filter(function (r) { return r.staff && c.staff.filter(function (s) { return s.id === r.staff.id; })[0].letters.indexOf('О4') >= 0; });
  check('Раднево (О4 → О от базата): всеки ред с О4 при 8 ч. носи предупреждение o4_full', withO4.length === 11 &&
    withO4.every(function (r) { return r.warnings.some(function (w) { return w.type === 'o4_full'; }); }), withO4.length);
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

/* ── 3. Непълен работен ден (4 ч.) ────────────────────────────────────── */
var S11 = ET.setups['2026-11'], P11 = E.prepare(S11), M11 = E.monthInfo('2026-11', []);
function lockAllWorkdays(code, except) {
  var lk = {};
  for (var i = 0; i < M11.days; i++) if (M11.dow[i] <= 5 && !M11.holiday[i] && (except || []).indexOf(i + 1) < 0) lk[i + 1] = code;
  return lk;
}
var four = { hours_per_day: 4 };
var r4 = E.computeRow(P11, M11, four, [], lockAllWorkdays('Д5/1'));
check('4 ч. договор: 21 × Д5/1 през 11.2026 → 84 ч. = цел 84, разлика 0', r4.official === 84 && r4.target === 84 && r4.diff === 0, r4.official + '/' + r4.target);
var r4b = E.computeRow(P11, M11, four, [], lockAllWorkdays('Д5/2'));
check('4 ч. договор: 21 × Д5/2 → 84 ч. (ред 38 от образеца)', r4b.official === 84 && r4b.diff === 0, r4b.official);
var lettersO = new Array(30).fill(''); lettersO[1] = 'О';                 // 2.11 — понеделник
var r4o = E.computeRow(P11, M11, four, lettersO, lockAllWorkdays('Д5/1', [2]));
check('4 ч. договор: О вади 4 ч. от целта (84 → 80), 20 × Д5/1 = 80', r4o.target === 80 && r4o.official === 80 && r4o.diff === 0, r4o.target + '/' + r4o.official);
var lettersO4 = new Array(30).fill(''); lettersO4[1] = 'О4';
var r4o4 = E.computeRow(P11, M11, four, lettersO4, lockAllWorkdays('Д5/1', [2]));
check('4 ч. договор: О4 = отпуск 4 ч. (код О), цел 80', r4o4.codes[1] === 'О' && r4o4.target === 80 && r4o4.diff === 0 &&
  !r4o4.warnings.some(function (w) { return w.type === 'o4_full'; }), r4o4.codes[1] + ' ' + r4o4.target);
var r4short = E.computeRow(P11, M11, four, [], lockAllWorkdays('Д5/1', [3]));
check('4 ч. договор: изравняването не пипа — само маркира (−4 ч.)', r4short.diff === -4 && !r4short.reachable && !r4short.changed.length, r4short.diff);

check('4 ч. договор: вътрешните часове на О са 4, не 8', r4o.internal === 4, r4o.internal);
var tenP = new Array(30).fill(''); [1, 2, 3, 4, 5, 8, 9, 10, 11, 12].forEach(function (d) { tenP[d] = 'П'; });   // 10 делника × Д1/З = 80 ч.
var r4p = E.computeRow(P11, M11, four, tenP, {});
check('4 ч. договор с 8-часови смени (80/84): НЕ се изравнява (+2 +2 би стигнало), само маркира', r4p.diff === -4 && !r4p.changed.length && !r4p.reachable, r4p.diff + ' ' + JSON.stringify(r4p.changed));

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
check('над 5 работни дни в 7 поредни', rw.warnings.some(function (x) { return x.type === 'over5'; }));
check('смяна преди назначаване', rw.warnings.some(function (x) { return x.type === 'before_hire' && x.day === 2; }));
check('смяна след напускане', rw.warnings.some(function (x) { return x.type === 'after_leave' && x.day === 26; }));
var dec = E.monthInfo('2026-12', []), Pd = E.prepare(S11);
var wd = new Array(31).fill(''); wd[23] = 'П';
check('смяна на празник (24.12.2026)', E.computeRow(Pd, dec, { hours_per_day: 8 }, wd, {}).warnings.some(function (x) { return x.type === 'holiday' && x.day === 24; }));
check('кой е в графика: напуснал преди месеца — не; назначен след него — не; в месеца — да',
  !E.inMonth(M11, { left_on: '2026-10-31' }) && !E.inMonth(M11, { hired_on: '2026-12-01' }) && E.inMonth(M11, { left_on: '2026-11-01', hired_on: '2026-11-30' }));

console.log('\n' + ok + ' успешни, ' + fail + ' неуспешни');
process.exit(fail ? 1 : 0);
