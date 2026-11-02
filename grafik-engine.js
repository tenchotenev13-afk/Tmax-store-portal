/* grafik-engine.js — Работен график: изчисленията (етап 1б, 02.11.2026).
   Без DOM, без мрежа, без глобални имена освен GrafikEngine — за да може по-късно
   да се ползва и от grafik-api (claude/open/02-11-grafik-engine-es-module.md).
   Еталон: бланката Работен_график_*_v70.xlsx (Настройки, _авто, ПРОВЕРКА,
   ГРАФИК ЗА ЯВЯВАНЕ). Тест: tests/grafik-engine.test.js.

   Входът за месеца е `setup` от grafik-api (load_month → setup): season
   (Л / З1 / З2), codes [{code,hours,kind}], letter_map [{letter,day_kind,code}],
   extra_days [{day}]. Нищо не е твърдо в кода освен правилата от бланката:
   празниците, ходовете на изравняването и вътрешните часове по буква. */
(function (root) {
  'use strict';
  var E = {};

  /* ── Дати ─────────────────────────────────────────────────────────────── */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function toUtc(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function fromUtc(t) { var d = new Date(t); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  function addDays(s, n) { return fromUtc(toUtc(s) + n * 86400000); }
  // 1 = понеделник … 7 = неделя (WEEKDAY(…,2) в Excel)
  function dow(s) { var w = new Date(toUtc(s)).getUTCDay(); return w === 0 ? 7 : w; }
  E.dow = dow;

  // Православен Великден — формулата от Настройки!E2 (юлиански + 13 дни, 1900–2099).
  E.orthodoxEaster = function (y) {
    var a = (19 * (y % 19) + 15) % 30;
    var b = (2 * (y % 4) + 4 * (y % 7) - a + 34) % 7;
    var n = a + b + 114;
    var month = Math.floor(n / 31), day = (n % 31) + 1;
    return addDays(ymd(y, month, day), 13);
  };

  // Празниците на годината (Настройки!F2:F25): официалните дати и „ползваният
  // ден“ — при празник в събота/неделя (или зает от предходния) се взема
  // следващият работен ден: IF(AND(делник, d>prev), d, WORKDAY(MAX(d,prev),1)).
  E.holidays = function (y) {
    var easter = E.orthodoxEaster(y);
    var list = [
      [ymd(y, 1, 1), 'Нова година'], [ymd(y, 3, 3), 'Освобождение'],
      [addDays(easter, -2), 'Велики петък'], [addDays(easter, 1), 'Велики понеделник'],
      [ymd(y, 5, 1), 'Ден на труда'], [ymd(y, 5, 6), 'Гергьовден'], [ymd(y, 5, 24), '24 май'],
      [ymd(y, 9, 6), 'Съединение'], [ymd(y, 9, 22), 'Независимост'],
      [ymd(y, 12, 24), 'Бъдни вечер'], [ymd(y, 12, 25), 'Коледа'], [ymd(y, 12, 26), 'Коледа 2']
    ];
    var prev = null, out = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i][0], used;
      if (dow(d) < 6 && (prev === null || d > prev)) used = d;
      else {
        used = (prev !== null && prev > d) ? prev : d;
        do { used = addDays(used, 1); } while (dow(used) > 5);
      }
      out.push({ date: d, name: list[i][1], used: used });
      prev = used;
    }
    return out;
  };

  // Неработните дати (NETWORKDAYS(…, Настройки!F2:F30)): официалните + ползваните + допълнителните.
  E.nonWorking = function (y, extraDays) {
    var set = {}, h = E.holidays(y);
    for (var i = 0; i < h.length; i++) { set[h[i].date] = h[i].name; set[h[i].used] = h[i].name; }
    (extraDays || []).forEach(function (e) { var d = typeof e === 'string' ? e : e.day; if (d) set[d] = (e && e.note) || 'неработен ден'; });
    return set;
  };

  // Месецът: дни, ден от седмицата, празник, работни дни, норма (работни дни × 8).
  E.monthInfo = function (ym, extraDays) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var nw = E.nonWorking(y, extraDays);
    var dates = [], dws = [], hol = [], work = 0;
    for (var d = 1; d <= days; d++) {
      var s = ymd(y, m, d), w = dow(s);
      dates.push(s); dws.push(w); hol.push(nw[s] || '');
      if (w <= 5 && !nw[s]) work++;
    }
    return { year: y, month: m, ym: ymd(y, m, 1).slice(0, 7), start: dates[0], end: dates[days - 1], days: days,
      dates: dates, dow: dws, holiday: hol, workDays: work, norm: work * 8 };
  };

  /* ── Букви и кодове ───────────────────────────────────────────────────── */
  E.WORK_LETTERS = ['ЛД', 'ЗД', 'П', 'В', 'М', 'К'];          // „смяна“ за проверките (бланката)
  E.HOURS_RE = /^(?:[1-9]|1[0-2])$/;                           // „свободни часове“ (колона BD)
  E.isHours = function (v) { return typeof v === 'string' && E.HOURS_RE.test(v); };
  E.dayKind = function (season, w) { return w === 7 ? 'Н' : season; };

  // Подготовка на setup → бързи справочници.
  E.prepare = function (setup) {
    var map = {}, codes = {};
    // Общите редове (hours_per_day NULL) — за 8-часов договор; редовете с договор — само за него
    // (grafik_letter_map.hours_per_day, миграция 20261102095558). Без връщане към общите.
    var byHpd = {};
    (setup.letter_map || []).forEach(function (r) {
      if (r.hours_per_day === null || r.hours_per_day === undefined) map[r.letter + '|' + r.day_kind] = r.code;
      else (byHpd[String(+r.hours_per_day)] = byHpd[String(+r.hours_per_day)] || {})[r.letter + '|' + r.day_kind] = r.code;
    });
    (setup.codes || []).forEach(function (c) { codes[c.code] = { hours: c.hours === null || c.hours === undefined ? null : +c.hours, kind: c.kind || 'work' }; });
    var season = setup.season;
    var full = map['ЛД|' + season] || null;            // пълна дневна смяна за сезона
    var first = map['П|' + season] || null;            // първа смяна 8 ч.
    var fullH = full && codes[full] ? codes[full].hours : null;
    return {
      season: season, map: map, byHpd: byHpd, codes: codes, full: full, first: first, fullHours: fullH,
      // Междинната зимна (Д4/З, 10 ч.) — ход само в З1, където пълната е Д5/З.
      mid: season === 'З1' ? (map['ЗД|З1'] || null) : null,
      sunFull: map['ЛД|Н'] || null, sunFirst: map['П|Н'] || null
    };
  };

  // Буквите за договора: 8 ч. (или без договор) → общите; иначе само редовете за
  // този договор; няма такива → null (computeRow предупреждава, код не се поставя).
  E.lettersFor = function (P, hpd) {
    if (!hpd || +hpd === 8) return P.map;
    return P.byHpd[String(+hpd)] || null;
  };
  E.translate = function (P, letter, w, hpd) {
    if (!letter || E.isHours(letter)) return '';
    var m = E.lettersFor(P, hpd);
    return m ? (m[letter + '|' + E.dayKind(P.season, w)] || '') : '';
  };

  // Официалните часове на код. К (командировка) = пълната смяна на сезона,
  // докато ТРЗ не кажат друго (Тенчо, 01.11.2026). Отсъствия → 0.
  E.codeHours = function (P, code) {
    if (!code) return 0;
    var c = P.codes[code];
    if (!c) return 0;
    if (c.kind === 'trip') return P.fullHours || 0;
    if (c.kind === 'absence') return 0;
    return c.hours || 0;
  };
  E.isAbsence = function (P, code) { var c = P.codes[code]; return !!(c && c.kind === 'absence'); };

  // Вътрешните часове по буква (Настройки!L2:L12) + „свободни часове“.
  // О — по договора на служителя (8 или 4); О4 — 4.
  E.internalHours = function (P, letter, hpd) {
    if (!letter) return 0;
    if (E.isHours(letter)) return +letter;
    switch (letter) {
      case 'ЛД': case 'К': return P.season === 'Л' ? 11 : P.season === 'З1' ? 10.5 : 10;
      case 'ЗД': return 10;
      case 'П': case 'В': case 'М': return 8;
      case 'О': return hpd;
      case 'О4': return 4;
      default: return 0;
    }
  };

  /* ── Изравняване до нормата ───────────────────────────────────────────── */
  // Възможните ходове за един ден (делта в часове, нов код). Само Д-кодове,
  // само незаключени дни; реда на ходовете решава при равенство.
  function moves(P, code, w) {
    var h = P.codes[code] ? P.codes[code].hours : null, out = [];
    if (!code || code.charAt(0) !== 'Д') return out;
    if (w === 7) {
      if (h === 8 && P.sunFull && code !== P.sunFull) out.push([+1, P.sunFull]);     // Д6/2, Д6/3 → Д6/1
      if (code === P.sunFull && P.sunFirst) out.push([-1, P.sunFirst]);               // Д6/1 → Д6/2
      return out;
    }
    if (h === 8 && P.full) {
      out.push([P.fullHours - 8, P.full]);                                            // 8 ч. → пълна
      if (P.mid) out.push([P.codes[P.mid].hours - 8, P.mid]);                         // З1: 8 ч. → Д4/З
    }
    if (P.mid && code === P.mid) {
      out.push([P.fullHours - P.codes[P.mid].hours, P.full]);                         // З1: Д4/З → Д5/З
      if (P.first) out.push([8 - P.codes[P.mid].hours, P.first]);                     // З1: Д4/З → Д1/З
    }
    if (code === P.full && P.first) {
      out.push([8 - P.fullHours, P.first]);                                           // пълна → Д1
      if (P.mid) out.push([P.codes[P.mid].hours - P.fullHours, P.mid]);               // З1: Д5/З → Д4/З
    }
    return out;
  }
  E.moves = moves;

  // Точна комбинация с най-малко сменени дни; при равенство — най-ранните дати.
  // Делтите са в половин часове (цели числа). Връща [[ден, нов код], …] или null.
  E.balance = function (P, codes, dws, locked, need) {
    var unit = Math.round(need * 2);
    if (Math.abs(need * 2 - unit) > 1e-9) return null;
    if (unit === 0) return [];
    var n = codes.length, opts = [];
    for (var i = 0; i < n; i++) {
      opts.push(locked && locked[i + 1] ? [] : moves(P, codes[i], dws[i]).map(function (o) { return [Math.round(o[0] * 2), o[1]]; }));
    }
    var INF = 1e9, OFF = 0, maxAbs = 0;
    opts.forEach(function (o) { var m = 0; o.forEach(function (x) { m = Math.max(m, Math.abs(x[0])); }); maxAbs += m; });
    if (Math.abs(unit) > maxAbs) return null;
    OFF = maxAbs;
    var W = 2 * maxAbs + 1;
    // best[i][s] — най-малко смени в дните i..n-1, за да се събере s.
    var best = [];
    for (i = 0; i <= n; i++) { best.push(new Array(W)); for (var s = 0; s < W; s++) best[i][s] = INF; }
    best[n][OFF] = 0;
    for (i = n - 1; i >= 0; i--) {
      for (s = 0; s < W; s++) {
        var v = best[i + 1][s];
        for (var k = 0; k < opts[i].length; k++) {
          var t = s - opts[i][k][0];
          if (t >= 0 && t < W && best[i + 1][t] + 1 < v) v = best[i + 1][t] + 1;
        }
        best[i][s] = v;
      }
    }
    if (unit + OFF < 0 || unit + OFF >= W || best[0][unit + OFF] >= INF) return null;
    // Отпред назад: смени деня, щом това пази минимума — така сменените дни са възможно най-ранните.
    var out = [], rem = unit;
    for (i = 0; i < n; i++) {
      var want = best[i][rem + OFF], done = false;
      for (k = 0; k < opts[i].length && !done; k++) {
        var r2 = rem - opts[i][k][0];
        if (r2 + OFF >= 0 && r2 + OFF < W && best[i + 1][r2 + OFF] === want - 1) { out.push([i + 1, opts[i][k][1]]); rem = r2; done = true; }
      }
    }
    return out;
  };

  /* ── Един служител за месеца ─────────────────────────────────────────── */
  // staff: {hours_per_day, hired_on, left_on}; letters: масив до 31; locked: {"5":"Д1/З"}
  E.computeRow = function (P, M, staff, letters, locked) {
    var hpd = staff && staff.hours_per_day ? +staff.hours_per_day : 8;
    var codes = [], internal = 0, abs = 0, any = false, notes = [], warn = [];
    locked = locked || {};
    var noLetters = !E.lettersFor(P, hpd);
    for (var i = 0; i < M.days; i++) {
      var L = (letters && letters[i]) || '';
      if (L || locked[i + 1]) any = true;
      internal += E.internalHours(P, L, hpd);
      var c = locked[i + 1] ? locked[i + 1] : E.translate(P, L, M.dow[i], hpd);
      codes.push(c);
      if (E.isAbsence(P, c)) abs++;
      if (E.isHours(L)) notes.push({ day: i + 1, type: 'hours', text: L + ' свободни ч. — ръчен код' });
      if (L && E.WORK_LETTERS.indexOf(L) >= 0) {
        if (M.holiday[i]) warn.push({ day: i + 1, type: 'holiday', text: 'смяна на празник (' + M.holiday[i] + ')' });
        if (staff && staff.hired_on && M.dates[i] < staff.hired_on) warn.push({ day: i + 1, type: 'before_hire', text: 'смяна преди назначаване' });
        if (staff && staff.left_on && M.dates[i] > staff.left_on) warn.push({ day: i + 1, type: 'after_leave', text: 'смяна след напускане' });
      }
      if (L && !E.isHours(L) && !c && !locked[i + 1]) {
        if (!noLetters) warn.push({ day: i + 1, type: 'unknown', text: 'буквата „' + L + '“ няма код за този ден' });
        else warn.push({ day: i + 1, type: 'no_contract', text: 'няма букви за договор ' + hpd + ' ч.' });
      }
    }
    // Повече от 5 работни дни в 7 поредни (в рамките на месеца, както _help).
    var maxRun = 0;
    for (i = 0; i + 7 <= M.days; i++) {
      var cnt = 0;
      for (var j = i; j < i + 7; j++) if (letters && E.WORK_LETTERS.indexOf(letters[j]) >= 0) cnt++;
      if (cnt > maxRun) maxRun = cnt;
      if (cnt > 5 && !warn.some(function (x) { return x.type === 'over5'; })) warn.push({ day: i + 1, type: 'over5', text: cnt + ' работни дни в 7 поредни (от ' + (i + 1) + '-ви)' });
    }
    var target = any ? M.workDays * hpd - hpd * abs : 0;
    var off = codes.reduce(function (s, c) { return s + E.codeHours(P, c); }, 0);
    var before = codes.slice(), changed = [], reachable = true;
    if (Math.abs(off - target) > 1e-9 && hpd >= 8) {
      var sol = E.balance(P, codes, M.dow, locked, target - off);
      if (sol) {
        sol.forEach(function (x) { changed.push({ day: x[0], from: codes[x[0] - 1], to: x[1] }); codes[x[0] - 1] = x[1]; });
        off = codes.reduce(function (s, c) { return s + E.codeHours(P, c); }, 0);
      } else reachable = false;
    } else if (Math.abs(off - target) > 1e-9) reachable = false;    // договор под 8 ч. — само проверка
    var diff = Math.round((off - target) * 2) / 2;
    var manDays = codes.filter(function (c) { var k = P.codes[c]; return !!(c && k && k.kind !== 'absence'); }).length;
    return {
      codes: codes, before: before, changed: changed, internal: internal, official: off,
      target: target, diff: diff, reachable: diff === 0 ? true : reachable,
      message: diff === 0 ? 'OK' : diff < 0 ? 'не стигат ' + (-diff) + ' ч.' : 'над нормата с ' + diff + ' ч.',
      absences: abs, manDays: manDays, maxIn7: maxRun, notes: notes, warnings: warn
    };
  };

  // Кой е в графика за месеца: не е напуснал преди първия ден и не е назначен след последния.
  E.inMonth = function (M, staff) {
    return !(staff.left_on && staff.left_on < M.start) && !(staff.hired_on && staff.hired_on > M.end);
  };

  // Целият месец на обекта. rows: [{staff, letters, locked}] → редовете + сборовете.
  E.computeMonth = function (setup, ym, rows) {
    var P = E.prepare(setup), M = E.monthInfo(ym, setup.extra_days);
    var out = [], tot = { manDays: 0, manHours: 0, offNorm: 0, o: 0, b: 0, n: 0 };
    rows.forEach(function (r) {
      if (!E.inMonth(M, r.staff)) return;
      var x = E.computeRow(P, M, r.staff, r.letters, r.locked);
      x.staff = r.staff;
      out.push(x);
      tot.manDays += x.manDays; tot.manHours += x.official;
      if (x.diff !== 0) tot.offNorm++;
      x.codes.forEach(function (c) { if (c === 'О') tot.o++; else if (c === 'Б') tot.b++; else if (c === 'Н') tot.n++; });
    });
    return { month: M, rows: out, totals: tot };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.GrafikEngine = E;
})(this);
