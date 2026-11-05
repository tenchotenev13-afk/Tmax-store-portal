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
  // „08:00“ / „08:00:00“ → минути от полунощ; празно → null.
  E.toMin = function (t) {
    if (!t || typeof t !== 'string') return null;
    var m = t.match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
  };

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
    (setup.codes || []).forEach(function (c) {
      codes[c.code] = { hours: c.hours === null || c.hours === undefined ? null : +c.hours, kind: c.kind || 'work',
        start: E.toMin(c.start_time), end: E.toMin(c.end_time) };
    });
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
    // Нормата е само за дните на работа: назначен / напуснал в месеца → работните дни от
    // hired_on до left_on (вкл.) × договора; отсъствията извън тях не я намаляват (04.11.2026).
    var lo = staff && staff.hired_on && staff.hired_on > M.start ? staff.hired_on : M.start;
    var hi = staff && staff.left_on && staff.left_on < M.end ? staff.left_on : M.end;
    var wd = 0, absIn = 0, unpaidIn = 0;
    for (var i = 0; i < M.days; i++) {
      var L = (letters && letters[i]) || '';
      if (L || locked[i + 1]) any = true;
      internal += E.internalHours(P, L, hpd);
      // ЛД в неделя е грешка (бланката: червено + ПРОВЕРКА „ЛД в неделя“; неделята е ЗД) — не се
      // превежда тихо към Д6/1: кодът остава празен, докато не се смени буквата (05.11.2026).
      var sunLd = L === 'ЛД' && M.dow[i] === 7;
      var c = locked[i + 1] ? locked[i + 1] : sunLd ? '' : E.translate(P, L, M.dow[i], hpd);
      codes.push(c);
      var emp = M.dates[i] >= lo && M.dates[i] <= hi;
      if (emp && M.dow[i] <= 5 && !M.holiday[i]) wd++;
      if (E.isAbsence(P, c)) { abs++; if (emp) absIn++; }
      if (emp && (L === 'Б' || L === 'НО')) unpaidIn++;
      if (sunLd) warn.push({ day: i + 1, type: 'sunday_ld', text: 'ЛД в неделя — ползвай ЗД' });
      if (E.isHours(L)) notes.push({ day: i + 1, type: 'hours', text: L + ' свободни ч. — ръчен код' });
      if (L && E.WORK_LETTERS.indexOf(L) >= 0) {
        if (M.holiday[i]) warn.push({ day: i + 1, type: 'holiday', text: 'смяна на празник (' + M.holiday[i] + ')' });
        if (staff && staff.hired_on && M.dates[i] < staff.hired_on) warn.push({ day: i + 1, type: 'before_hire', text: 'смяна преди назначаване' });
        if (staff && staff.left_on && M.dates[i] > staff.left_on) warn.push({ day: i + 1, type: 'after_leave', text: 'смяна след напускане' });
      }
      if (L && !E.isHours(L) && !c && !locked[i + 1] && !sunLd) {
        if (!noLetters) warn.push({ day: i + 1, type: 'unknown', text: 'буквата „' + L + '“ няма код за този ден' });
        else warn.push({ day: i + 1, type: 'no_contract', text: 'няма букви за договор ' + hpd + ' ч.' });
      }
    }
    var target = any ? wd * hpd - hpd * absIn : 0;
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
      absences: abs, manDays: manDays, notes: notes, warnings: warn,
      workDays: wd, norm: wd * hpd,                                  // норма на човека (дните на работа)
      // За „Вътр.“ (бланката BE срещу BL): вътрешните часове броят О по договора, а Б и НО — 0,
      // затова прагът е нормата без дните Б / НО в периода на работа.
      internalNorm: wd * hpd - hpd * unpaidIn
    };
  };

  /* ── Почивки и седмични часове (ВТР чл. 19, от 01.11.2026; ТЦД 3 / ТЦД 4 / Темакс Юг) ──
     смяна до 12 ч.; работна седмица до 56 ч.; междудневна почивка ≥ 12 ч.; междуседмична ≥ 36 ч.
     От 04.11.2026 кодовете имат начало/край (grafik_vtr_codes.start_time / end_time — рамката
     на смяната; hours са нетните часове и не се сверяват с нея). По часовник:
       - междудневна почивка: от края на смяната до началото на следващата, ≥ 12 ч.;
       - междуседмична: във всеки 7 поредни дни поне една непрекъсната почивка ≥ 36 ч.
     Ден без часове (свободни часове 1–12, „К“, отпаднал код) → за 7-те дни, които го съдържат,
     остава проверката по дни (7 поредни работни дни = няма 36 ч.), а 12-те часа не се смятат.
     Отсъствия (О, Б, Н) и празен ден = почивка. „Свободните часове“ са работен ден с тези часове. */
  function dayInfo(P, code, letter) {
    var hrs = E.codeHours(P, code) + (E.isHours(letter) ? +letter : 0);
    var k = code ? P.codes[code] : null;
    var worked = !!(k && k.kind !== 'absence') || E.isHours(letter);
    var timed = worked && !E.isHours(letter) && !!k && k.start !== null && k.end !== null && k.end > k.start;
    return { worked: worked, hours: hrs, shift: E.codeHours(P, code), start: timed ? k.start : null, end: timed ? k.end : null };
  }
  function hm(min) { var m = ((min % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function hrsTxt(min) { return String(Math.round(min / 30) / 2).replace('.', ','); }
  function ddmm(s) { return s.slice(8, 10) + '.' + s.slice(5, 7); }
  // days: [{date, worked, hours, shift, own}] — own = денят е от текущия месец.
  // known: дали дните преди месеца са известни (иначе първата седмица е „непълна“).
  E.restWarnings = function (days, M, knownBefore) {
    var warn = [], i, first = null;   // first — индексът на първия ден от месеца в days
    for (i = 0; i < days.length; i++) if (days[i].own) { first = i; break; }
    // 1а) Междудневна почивка ≥ 12 ч. — между две смени в поредни дни, и двете с часове.
    for (i = 0; i + 1 < days.length; i++) {
      var a = days[i], b = days[i + 1];
      if (!b.own || !a.worked || !b.worked || a.start === null || b.start === null) continue;
      var gap = 1440 + b.start - a.end;
      if (gap < 12 * 60) warn.push({ day: +b.date.slice(8, 10), type: 'daily_rest',
        text: 'почивка ' + hrsTxt(gap) + ' ч. между смените (' + ddmm(a.date) + ' ' + hm(a.end) + ' → ' + ddmm(b.date) + ' ' + hm(b.start) + ') — под 12 ч.' });
    }
    // 1б) Междуседмична почивка ≥ 36 ч. във всеки 7 поредни дни. Заетото време: смените с часове
    //     точно, работен ден без часове — цял ден. Почивка = празнина между заетите отрязъци;
    //     празнината преди първата / след последната известна смяна е неограничена.
    //     Почивката „принадлежи“ на 7-те дни, ако е ≥ 36 ч. И поне 24 ч. от нея (цяло денонощие)
    //     са в тези 7 дни. Само „застъпва“ е малко: 7 работни дни пон–нед минаваха, защото
    //     почивката до 08:00 в понеделник застъпва прозореца с 8 ч. „Изцяло вътре“ е много:
    //     „6 дни + свободна неделя“ (Сб 19:30 → Пн 08:00) се реже в края на седмицата и гърми
    //     фалшиво. При смени 08:00–20:00 правилото съвпада със „свободен ден на всеки 7“.
    var busy = [];
    days.forEach(function (x, k) {
      if (!x.worked) return;
      if (x.start !== null) busy.push([k * 1440 + x.start, k * 1440 + x.end]);
      else busy.push([k * 1440, (k + 1) * 1440]);
    });
    var gaps = [], prevEnd = -Infinity;
    busy.forEach(function (bz) { gaps.push([prevEnd, bz[0]]); prevEnd = bz[1]; });
    gaps.push([prevEnd, Infinity]);
    var bad = [];                                   // [начален ден на прозореца, режим, най-дългата почивка]
    for (var w = 0; first !== null && w + 7 <= days.length; w++) {
      if (w + 6 < first) continue;                  // прозорецът трябва да докосва месеца
      var win = days.slice(w, w + 7);
      var untimed = win.some(function (x) { return x.worked && x.start === null; });
      if (untimed) {
        if (win.every(function (x) { return x.worked; })) bad.push([w, 'day', 0]);
        continue;
      }
      var ws = w * 1440, we = (w + 7) * 1440, best = 0;
      var okRest = false;
      gaps.forEach(function (g) {
        var inside = Math.min(g[1], we) - Math.max(g[0], ws);
        if (inside <= 0) return;
        var len = g[1] - g[0];
        if (isFinite(len)) best = Math.max(best, len);
        if (len >= 36 * 60 && inside >= 24 * 60) okRest = true;
      });
      if (!okRest) bad.push([w, 'clock', best]);
    }
    // Съседните прозорци със същия режим → едно предупреждение за целия отрязък.
    for (i = 0; i < bad.length; i++) {
      var j = i;
      while (j + 1 < bad.length && bad[j + 1][0] === bad[j][0] + 1 && bad[j + 1][1] === bad[i][1]) j++;
      var from = bad[i][0], to = bad[j][0] + 6, dIn = Math.max(from, first), txt;
      if (bad[i][1] === 'day') txt = (to - from + 1) + ' поредни работни дни (' + ddmm(days[from].date) + '–' + ddmm(days[to].date) + ') — няма 36 ч. седмична почивка';
      else {
        var longest = Infinity;
        for (var q = i; q <= j; q++) longest = Math.min(longest, bad[q][2]);
        txt = 'няма непрекъсната почивка ≥ 36 ч. в 7 поредни дни (' + ddmm(days[from].date) + '–' + ddmm(days[to].date) + ') — най-дългата е ' + hrsTxt(longest) + ' ч.';
      }
      warn.push({ day: +days[dIn].date.slice(8, 10), type: 'no_weekly_rest', text: txt });
      i = j;
    }
    // 2) Календарни седмици пон–нед, които докосват месеца.
    var byDate = {};
    days.forEach(function (d) { byDate[d.date] = d; });
    var d0 = M.start;
    while (dow(d0) !== 1) d0 = addDays(d0, -1);
    for (var wk = d0; wk <= M.end; wk = addDays(wk, 7)) {
      var sum = 0, missing = false;
      for (var k = 0; k < 7; k++) {
        var dd = addDays(wk, k), x = byDate[dd];
        if (x) sum += x.hours;
        else if (dd < M.start ? !knownBefore : true) missing = true;
      }
      if (sum > 56 + 1e-9) {
        var dIn = wk < M.start ? M.start : wk;
        warn.push({ day: +dIn.slice(8, 10), type: 'week_over_56',
          text: (Math.round(sum * 2) / 2) + ' ч. в седмицата ' + ddmm(wk) + '–' + ddmm(addDays(wk, 6)) + ' (пон–нед) — над 56 ч.' + (missing ? ' (непълна седмица)' : '') });
      }
    }
    // 3) Смяна над 12 ч. — по часовете на кода (свободните часове 1–12 никога не са над 12).
    days.forEach(function (x) {
      if (x.own && x.shift > 12 + 1e-9) warn.push({ day: +x.date.slice(8, 10), type: 'shift_over_12', text: 'смяна ' + x.shift + ' ч. — над 12 ч.' });
    });
    return warn;
  };

  // Кой е в графика за месеца: не е напуснал преди първия ден и не е назначен след последния.
  E.inMonth = function (M, staff) {
    return !(staff.left_on && staff.left_on < M.start) && !(staff.hired_on && staff.hired_on > M.end);
  };

  // Целият месец на обекта. rows: [{staff, letters, locked}] → редовете + сборовете.
  // prev (по избор): {setup, ym, rows: {staff_id: {letters, locked}}} — предходният месец,
  // за седмицата и поредните дни през границата. Без него първата седмица е „непълна“.
  E.computeMonth = function (setup, ym, rows, prev) {
    var P = E.prepare(setup), M = E.monthInfo(ym, setup.extra_days);
    var out = [], tot = { manDays: 0, manHours: 0, offNorm: 0, o: 0, b: 0, n: 0 }, notes = [];
    var PP = prev && prev.setup ? E.prepare(prev.setup) : null, PM = PP ? E.monthInfo(prev.ym, prev.setup.extra_days) : null;
    var firstMon = M.start; while (dow(firstMon) !== 1) firstMon = addDays(firstMon, -1);
    if (firstMon < M.start && !PP) {
      notes.push('Седмицата ' + ddmm(firstMon) + '–' + ddmm(addDays(firstMon, 6)) + ' е непълна — няма данни за предходния месец; проверките за 56 ч. и за поредните дни ползват само дните от този месец.');
    }
    rows.forEach(function (r) {
      if (!E.inMonth(M, r.staff)) return;
      var x = E.computeRow(P, M, r.staff, r.letters, r.locked);
      x.staff = r.staff;
      var days = [];
      if (PP) {
        var pr = (prev.rows && r.staff && prev.rows[r.staff.id]) || { letters: [], locked: {} };
        var px = E.computeRow(PP, PM, r.staff, pr.letters, pr.locked);
        for (var p = 0; p < PM.days; p++) {
          var pi = dayInfo(PP, px.codes[p], (pr.letters || [])[p] || '');
          days.push({ date: PM.dates[p], worked: pi.worked, hours: pi.hours, shift: pi.shift, start: pi.start, end: pi.end, own: false });
        }
      }
      for (var d = 0; d < M.days; d++) {
        var di = dayInfo(P, x.codes[d], (r.letters || [])[d] || '');
        days.push({ date: M.dates[d], worked: di.worked, hours: di.hours, shift: di.shift, start: di.start, end: di.end, own: true });
      }
      E.restWarnings(days, M, !!PP).forEach(function (w) { x.warnings.push(w); });
      x.warnings.sort(function (a, b) { return a.day - b.day; });
      out.push(x);
      tot.manDays += x.manDays; tot.manHours += x.official;
      if (x.diff !== 0) tot.offNorm++;
      x.codes.forEach(function (c) { if (c === 'О') tot.o++; else if (c === 'Б') tot.b++; else if (c === 'Н') tot.n++; });
    });
    return { month: M, rows: out, totals: tot, notes: notes };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.GrafikEngine = E;
})(this);
