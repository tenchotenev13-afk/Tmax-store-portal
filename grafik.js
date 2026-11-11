/* grafik.js — Работен график (етап 1г, 02.11.2026): месечният график на обекта и
   персоналът. Модулът е в разработка: табът се вижда само от имейлите в списъка
   beta (grafik_access, от 04.11.2026 — до тогава app_settings.grafik_beta_users;
   HIDDEN-FEATURES.md) — браузърът го научава от grafik-api „me“, защото списъкът не
   е публичен; данните са само през grafik-api (таблиците grafik_* са без права за anon).
   Изчисленията — в grafik-engine.js (GrafikEngine), общи с файла за ТРЗ (1д).

   Въвеждане: само клавиатура — буква / число 1–12, стрелки, Tab, Enter, Delete;
   поставяне от Excel (Ctrl+V); Ctrl+L — заключва/отключва официалния код на
   клетката. Автозапис по ред (grSaveSoon). */

var GR_LETTERS_FALLBACK = ['ЛД','ЗД','П','В','М','О','Б','НО','К','О4'];
var GR_WORK_LETTERS = ['ЛД','ЗД','П','В','М','К'];
var GR_DATED_WARN = { no_weekly_rest: 1, week_over_56: 1, daily_rest: 1 };   // текстът вече носи датите (ВТР чл. 19)
/* Заглавията на легендата — дословно от бланката v70 (ГРАФИК ЗА ЯВЯВАНЕ, A82 и A94; ВТР от 01.11.2026). */
var GR_LEGEND_TITLE = {
  'Л': 'Работните смени при лятно работно време (май–октомври) са:',
  'З': 'Работните смени при зимно работно време са (Зимно I: ноември, декември, март, април – до 19:30; Зимно II: януари, февруари – до 19:00):'
};
/* Цветовете в мрежата — от условното форматиране на бланката v70 (месечния лист). */
var GR_GRID_FILL = { o: '#FFF2CC', b: '#B4C6E7', outside: '#D9D9D9', leaving: '#BDD7EE', bad: '#FF8080', under: '#FF8080', over: '#FFC000' };
var GR_POSITIONS = ['Каса','Продавач','ОТЗ','Склад','Шофьор','Снабдител','Ръководител'];
var GR_MONTHS = ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
var GR_DOW = ['','Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
/* Фонетична кирилица: магазинът пише и на латиница (p → П, ld → ЛД). */
var GR_LATIN = {a:'А',b:'Б',v:'В',w:'В',g:'Г',d:'Д',e:'Е',z:'З',i:'И',k:'К',l:'Л',m:'М',n:'Н',o:'О',p:'П',r:'Р',s:'С',t:'Т',u:'У',f:'Ф',h:'Х',c:'Ц'};

var grTabOk = false, grTabRes = null, grUsersSeq = 0, grLoadSeq = 0;
var grMe = null;            // отговорът на action "me"
var grStore = '', grMonth = '';
var grView = 'grid';        // 'grid' | 'staff' | 'overview' | 'changes'
var grOverview = null;      // action "overview" за grMonth (етап 1е-1)
var grData = null;          // load_month
var grRows = {};            // staff_id → {letters:[], locked:{}}
var grCalc = null;          // GrafikEngine.computeMonth(...)
var grPrev = null;          // предходният месец {setup, ym, rows} — за седмицата през границата (или null)
var grSel = { r: 0, d: 0 }; // избрана клетка (ред в grVisible, ден 0..days-1)
var grEdit = '';            // буфер при въвеждане
var grAnc = null;           // котвата на избора (Shift+клик / Shift+стрелки); null = само избраната клетка
var grDrop = false;         // падащият списък в избраната клетка е отворен
var grFill = null;          // дърпане на квадратчето: { r0, r1, d0, d1, to }
var grGroupBy = null;       // 'sector' (по подразбиране) | 'flat' — помни се в браузъра
var grOrder = [];
var grMore = null;
var grPainted = null;        // редовете на избора при последното рисуване (за grUpdate)
var grTouched = {};         // редове (по екрана), сменени след последното рисуване          // „▸ още“ под мрежата е отворено — помни се в браузъра (по подразбиране сгънато)           // редът на екрана: индекси в grCalc.rows (данните остават по sort_order)
var grDirty = {}, grSaveTimer = null, grSavePromise = null, grSaveState = '';
var grSaved = {};           // staff_id → има ред в grafik_rows за този месец (сървърът го знае)
var GR_STK_W = [34, 150, 90];  // ширините на залепените колони (№, Служител, Сектор), px
var grViewKey = '';
var grVisible = [];         // служителите в графика за месеца (подредени)

/* ─── Достъп (бутонът) ─────────────────────────────────── */
function grCanSee(){ return grTabOk; }
function grSyncButton(){
  var b = document.getElementById('tab-grafik');
  if(b) b.style.display = grCanSee() ? '' : 'none';
}
/* Табът — по отговора на grafik-api „me“ (списъкът beta е в grafik_access, без права за
   anon): ок → показан, 403 not_beta / 401 / мрежа → скрит. Истинската проверка остава в
   grafik-api при всяка заявка; отговорът пълни и grMe. */
/* maxAgeMs (11.11.2026): отварянето на таба ползва отговора от влизането, ако е по-нов от
   това — или още тече (същата заявка, не втора). Влизането (shared.js) вика без аргумент,
   тоест винаги пита наново. Правата пак се проверяват от grafik-api при всяка заявка. */
var GR_ME_TTL = 5 * 60 * 1000, grMeAt = 0, grMePending = null;
function grLoadUsers(maxAgeMs){
  if(maxAgeMs){
    if(grMePending) return grMePending;
    if(grTabRes && Date.now() - grMeAt < maxAgeMs){ grSyncButton(); return Promise.resolve(grCanSee()); }
  }
  var seq = ++grUsersSeq;
  var p = grApi('me', {}).then(function(res){
    if(seq === grUsersSeq){ grTabOk = !!res.ok; grTabRes = res; grMe = res.ok ? res.data : null; grMeAt = Date.now(); }
    if(grMePending === p) grMePending = null;
    grSyncButton();
    return grCanSee();
  });
  grMePending = p;
  return p;
}

/* ─── grafik-api ───────────────────────────────────────── */
/* Връща {ok, status, data}. 401 → „влез отново“ (пропускът е 12 ч. и само в паметта). */
function grApi(action, payload){
  var body = { action: action, session: (typeof currentSession !== 'undefined' ? currentSession : null) };
  for(var k in (payload || {})) if(Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k];
  return fetch(SB_URL + '/functions/v1/grafik-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SB_KEY, 'apikey': SB_KEY },
    body: JSON.stringify(body)
  }).then(function(r){
    return r.json().catch(function(){ return null; }).then(function(d){
      return { ok: r.ok && !!d && d.ok === true, status: r.status, data: d || {} };
    });
  }).catch(function(e){
    return { ok: false, status: 0, data: { reason: 'network', message: 'Няма връзка със сървъра.' } };
  });
}
function grErrText(res){
  var d = res && res.data || {};
  if(res && res.status === 401) return 'Сесията е изтекла — излез и влез отново.';
  return d.message || ('Грешка ' + (res ? res.status : ''));
}

/* ─── Помощни ──────────────────────────────────────────── */
function grPad(n){ return (n < 10 ? '0' : '') + n; }
function grThisMonth(){ var d = new Date(); return d.getFullYear() + '-' + grPad(d.getMonth() + 1); }
function grShiftMonth(ym, n){
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + grPad(m + 1);
}
function grMonthLabel(ym){ return GR_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4) + ' г.'; }
function grAllowedLetters(){
  var s = {}, out = [];
  ((grData && grData.setup && grData.setup.letter_map) || []).forEach(function(l){ if(!s[l.letter]){ s[l.letter] = 1; out.push(l.letter); } });
  return out.length ? out : GR_LETTERS_FALLBACK.slice();
}
/* „p“, „ld“, „пп“ → буква/число или null. */
function grNormalize(v){
  var t = String(v == null ? '' : v).trim();
  if(!t) return '';
  if(/^\d+$/.test(t)) return GrafikEngine.isHours(t) ? String(+t) : null;
  var u = '';
  for(var i = 0; i < t.length; i++){
    var ch = t.charAt(i), lo = ch.toLowerCase();
    u += GR_LATIN[lo] || ch.toUpperCase();
  }
  if(u === '04' || u === 'О0') u = 'О4';
  u = u.replace(/^O/, 'О').replace(/0$/, '').replace(/^О(\d)$/, 'О$1');
  return grAllowedLetters().indexOf(u) >= 0 ? u : null;
}
function grStaffById(id){
  var list = (grData && grData.staff) || [];
  for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i];
  return null;
}
function grCanEdit(){ return !!(grData && grData.can_edit); }
/* Служител в графика за месеца без нито един ден — няма ред в grafik_rows или редът е
   празен (без букви и без заключени кодове). Изчисленията му дават цел 0 (както бланката),
   но по решение на Тенчо (04.11.2026) това е ИЗВЪН нормата: 0 ч. вместо нормата на човека
   (x.norm — работните дни от назначаването до напускането × договора). Норма 0 (назначен
   след последния работен ден) → нищо не се иска. Връща текста на бележката или ''. */
function grEmptyRow(x){
  if(!x || !grCalc) return '';
  var r = grRows[x.staff.id];
  var any = r && ((r.letters || []).some(function(v){ return !!v; }) || Object.keys(r.locked || {}).length);
  if(any || !x.norm) return '';
  var norm = x.norm;
  return (r && grSaved[x.staff.id] ? 'редът в графика е празен' : 'няма ред в графика за месеца') + ' (0 ч. вместо ' + grHrsTxt(norm) + ' ч.)';
}
function grOffCount(){ return grCalc.rows.filter(function(x){ return x.diff !== 0 || !!grEmptyRow(x); }).length; }
/* Секторът е от списъка на магазина (grafik_sectors → setup.sectors) по sector_id.
   Старият текст от бланката (staff.sector) НЕ се ползва — от него се разпадаше покритието. */
var GR_NO_SECTOR = 'Без сектор';
function grSectors(){ return (grData && grData.setup && grData.setup.sectors) || []; }
function grSectorById(id){
  var l = grSectors();
  for(var i = 0; i < l.length; i++) if(l[i].id === id) return l[i];
  return null;
}
function grSector(s){ var x = s && s.sector_id ? grSectorById(s.sector_id) : null; return x ? x.name : GR_NO_SECTOR; }
/* Пълното име на сезона (grafik_vtr_seasons.labels) — „З1“ се чете като „31“. */
function grSeasonLabel(setup){ return (setup && (setup.season_label || setup.season)) || '—'; }
/* Нов сектор — admin и регионалният (сървърът проверява същото). */
function grCanAddSector(){ return !!grMe && (grMe.kind === 'admin' || grMe.kind === 'regional') && grCanEditStaff(); }

/* ─── Зареждане ────────────────────────────────────────── */
function loadGrafik(){
  var el = document.getElementById('mod-grafik');
  if(!el) return Promise.resolve();
  var seq = ++grLoadSeq;
  if(!grMonth) grMonth = grThisMonth();
  el.innerHTML = grTitle() + '<div style="padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
  /* grLoadUsers() вече пита grafik-api „me“ — отговорът му е и достъпът, и grMe. */
  return grLoadUsers(GR_ME_TTL).then(function(see){
    if(seq !== grLoadSeq) return;
    var res = grTabRes || {};
    if(!see){
      var beta = !res.data || res.data.reason === 'not_beta' || res.data.reason === 'inactive';
      el.innerHTML = grTitle() + (beta ? '<div class="card" id="gr-noaccess">Нямаш достъп до този модул.</div>'
        : '<div class="card" id="gr-error" style="color:#dc2626;">' + escVal(grErrText(res)) + '</div>');
      return;
    }
    var names = (grMe.stores || []).map(function(s){ return s.name; });
    if(!grStore || names.indexOf(grStore) < 0){
      grStore = (currentUser && names.indexOf(currentUser.store_name) >= 0) ? currentUser.store_name : (names[0] || '');
    }
    /* ТРЗ започват от обзора (виждат само подадените); регионалният и admin — от своя график. */
    if(grMe.kind === 'trz') grView = 'overview';
    else if(grView === 'overview' && !grCanOverview()) grView = 'grid';
    if(grView === 'overview') return grLoadOverview(seq);
    if(!grStore){ el.innerHTML = grTitle() + '<div class="card" id="gr-nostore">Няма обект, чийто график да виждаш.</div>'; return; }
    return grLoadMonth(seq);
  });
}
function grLoadMonth(seq){
  seq = seq || ++grLoadSeq;
  return grApi('load_month', { store: grStore, month: grMonth, prev: true }).then(function(res){
    if(seq !== grLoadSeq) return;
    var el = document.getElementById('mod-grafik');
    if(!res.ok){
      grData = null;
      el.innerHTML = grTitle() + grToolbar() + '<div class="card" id="gr-error" style="color:#dc2626;">' + escVal(grErrText(res)) + '</div>';
      return;
    }
    grData = res.data;
    grRows = {};
    (grData.rows || []).forEach(function(r){ grRows[r.staff_id] = { letters: (r.letters || []).slice(), locked: r.locked || {} }; });
    grDirty = {}; grSaveState = ''; grSaved = {};
    (grData.rows || []).forEach(function(r){ grSaved[r.staff_id] = 1; });
    return grLoadPrev(seq).then(function(){ return grChLoad(); }).then(function(){
      if(seq !== grLoadSeq) return;
      grRecalc();
      grRender();
    });
  });
}
/* ─── Обзор по обекти (етап 1е-1, решение на Тенчо 04.11.2026) ───
   admin — всички обекти с ВТР; регионален — своите; ТРЗ — само подадените. Обхватът и правата
   са на сървъра (grafik-api overview). „Извън нормата“ — само за подадените (от снимката);
   за черновите — последната промяна (кой, кога). */
function grCanOverview(){ return !!grMe && (grMe.kind === 'admin' || grMe.kind === 'regional' || grMe.kind === 'trz'); }
function grLoadOverview(seq){
  seq = seq || ++grLoadSeq;
  grOverview = null;
  return grApi('overview', { month: grMonth }).then(function(res){
    if(seq !== grLoadSeq) return;
    if(!res.ok){
      var el = document.getElementById('mod-grafik');
      if(el) el.innerHTML = grTitle() + grToolbar() + '<div class="card" id="gr-error" style="color:#dc2626;">' + escVal(grErrText(res)) + '</div>';
      return;
    }
    grOverview = res.data;
    grRender();
  });
}
function grOpenStoreAt(i){
  var s = grOverview && (grOverview.stores || [])[i];
  if(!s) return;
  grStore = s.store; grView = 'grid'; grSel = { r: 0, d: 0 }; grAnc = null; grDrop = false;
  return grLoadMonth();
}
function grFmtAt(iso){
  if(!iso) return '';
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return grPad(d.getDate()) + '.' + grPad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + grPad(d.getHours()) + ':' + grPad(d.getMinutes());
}
function grOverviewHtml(){
  if(!grOverview) return '<div class="card" style="color:#94a3b8;">⏳ Зареждане...</div>';
  var list = grOverview.stores || [], trz = !!grMe && grMe.kind === 'trz';
  var sub = list.filter(function(s){ return s.status === 'submitted'; }).length;
  var h = '<div class="card" id="gr-overview"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px;">' +
    '<b>Обекти — ' + escVal(grMonthLabel(grMonth)) + '</b>' +
    '<span id="gr-ov-count" style="color:#64748b;font-size:12px;">' + (trz ? sub + ' подадени' : sub + ' подадени от ' + list.length) + '</span>' +
    (trz ? '<span style="color:#64748b;font-size:12px;">· ТРЗ: само подадените графици, без редакция</span>' : '') + '</div>';
  if(!list.length){
    h += '<div id="gr-ov-empty" style="color:#64748b;padding:8px 0;">' + (trz ? 'Няма подадени графици за ' + escVal(grMonthLabel(grMonth)) : 'Няма обекти за показване.')   /* grMonthLabel завършва на „г.“ */ + '</div>';
  } else {
    h += '<div class="tbl-wrap"><table id="gr-ov-tbl"><thead><tr><th>Обект</th><th>Статус</th><th>' + (trz ? 'Подаден' : 'Подаден / последна промяна') + '</th>' +
      (trz ? '' : '<th>Служители</th>') + '<th>Извън нормата</th><th>Промени</th><th></th></tr></thead><tbody>';
    list.forEach(function(s, i){
      var st = s.status === 'submitted' ? '<span class="gr-ov-st" style="background:#dcfce7;color:#166534;border-radius:10px;padding:1px 8px;font-weight:600;">✔ Подаден</span>'
        : s.status === 'draft' ? '<span class="gr-ov-st" style="background:#fef3c7;color:#92400e;border-radius:10px;padding:1px 8px;font-weight:600;">✎ Чернова</span>'
        : '<span class="gr-ov-st" style="color:#94a3b8;">— не е започнат</span>';
      var when = s.status === 'submitted' ? (s.submitted_by_name ? 'от ' + escVal(s.submitted_by_name) + ' · ' : '') + escVal(grFmtAt(s.submitted_at))
        : s.last_at ? escVal(s.last_by || '') + ' · ' + escVal(grFmtAt(s.last_at)) : '<span style="color:#94a3b8;">—</span>';
      var off = s.status !== 'submitted' ? '<span style="color:#94a3b8;font-size:12px;">само за подадени</span>'
        : !Array.isArray(s.off_norm) ? '<span style="color:#94a3b8;">—</span>'                 // сървър без off_norm — не твърдим „на нормата“
        : s.off_norm.length ? '<div class="gr-ov-off" style="color:#dc2626;font-size:12px;">' + s.off_norm.map(function(t){ return escVal(t); }).join('<br>') + '</div>'
        : '<span style="color:#16a34a;font-weight:600;">всички на нормата</span>';
      h += '<tr id="gr-ov-' + i + '"><td><b>' + escVal(s.store) + '</b><div style="color:#94a3b8;font-size:11px;">' + escVal(s.company || '') + '</div></td><td>' + st + '</td>' +
        '<td class="gr-ov-when" style="font-size:12px;">' + when + '</td>' + (trz ? '' : '<td>' + (+s.staff || 0) + '</td>') + '<td>' + off + '</td>' +
        '<td class="gr-ov-ch" style="font-size:12px;">' + (s.status === 'submitted' && typeof s.changes === 'number' ? s.changes + (s.changes ? ' · <span style="color:' + (s.changes_open ? '#dc2626' : '#16a34a') + ';">неотразени ' + (s.changes_open || 0) + '</span>' : '') : '<span style="color:#94a3b8;">—</span>') + '</td>' +
        '<td><button class="btn-sm" onclick="grOpenStoreAt(' + i + ')">Отвори →</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  if(grOverview.no_company && grOverview.no_company.length){
    h += '<div id="gr-ov-nocomp" style="color:#94a3b8;font-size:12px;margin-top:8px;">Без дружество (не са в обзора): ' + escVal(grOverview.no_company.join(', ')) + ' — Администрация.</div>';
  }
  return h + '</div>';
}

/* Предходният месец — само ако първата седмица (пон–нед) почва в него и месецът го има в
   базата. Нужен е за 56-те часа и за поредните дни през границата (ВТР чл. 19). Няма ли го
   (или няма достъп — ТРЗ виждат само подадени) — grPrev = null и седмицата е „непълна“. */
function grLoadPrev(seq){
  grPrev = null;
  var first = GrafikEngine.monthInfo(grMonth, []);
  if(first.dow[0] === 1) return Promise.resolve();
  var pym = grShiftMonth(grMonth, -1);
  return grApi('load_month', { store: grStore, month: pym }).then(function(res){
    if(seq !== grLoadSeq || !res.ok || !res.data || !res.data.month_row) return;
    var rows = {};
    (res.data.rows || []).forEach(function(r){ rows[r.staff_id] = { letters: r.letters || [], locked: r.locked || {} }; });
    grPrev = { setup: res.data.setup || {}, ym: pym, rows: rows };
  });
}

/* ─── Изчисляване ──────────────────────────────────────── */
function grRecalc(){
  if(!grData){ grCalc = null; grVisible = []; return; }
  var staff = (grData.staff || []).slice().sort(function(a, b){
    return (a.sort_order || 0) - (b.sort_order || 0) || String(a.short_name).localeCompare(String(b.short_name), 'bg');
  });
  var input = staff.map(function(s){
    var r = grRows[s.id] || { letters: [], locked: {} };
    return { staff: s, letters: r.letters, locked: r.locked };
  });
  grCalc = GrafikEngine.computeMonth(grData.setup || {}, grMonth, input, grPrev);
  /* Групите по сектор са САМО на екрана: grCalc.rows остава по sort_order, затова снимката при
     „Подай“, Excel за ТРЗ и печатът не се променят. grVisible / grSel.r са по реда на екрана. */
  grOrder = grViewOrder();
  grVisible = grOrder.map(function(i){ return grCalc.rows[i].staff; });
  if(grSel.r >= grVisible.length) grSel.r = Math.max(0, grVisible.length - 1);
  if(grSel.d >= grCalc.month.days) grSel.d = grCalc.month.days - 1;
  // Котвата на избора — също (по-малко хора след „Персонал“ → иначе grVisible[r] е undefined).
  if(grAnc){ grAnc.r = Math.max(0, Math.min(grAnc.r, grVisible.length - 1)); grAnc.d = Math.min(grAnc.d, grCalc.month.days - 1); }
}

/* т.3: по сектори (по подразбиране) или плосък списък — изборът се помни в браузъра. */
function grGroupMode(){
  if(grGroupBy === null){
    var v = null;
    try { v = localStorage.getItem('gr-grid-group'); } catch(e){}
    grGroupBy = v === 'flat' ? 'flat' : 'sector';
  }
  return grGroupBy;
}
/* По реда на секторите на магазина; непознат сектор — след тях по име; „Без сектор“ — последен.
   Вътре в групата — както в данните (sort_order, после името). */
function grViewOrder(){
  var idx = grCalc.rows.map(function(x, i){ return i; });
  if(grGroupMode() !== 'sector') return idx;
  var pos = {};
  grSectors().forEach(function(x, i){ pos[x.name] = i; });
  var key = function(i){ var k = grSector(grCalc.rows[i].staff); return { k: k, p: k === GR_NO_SECTOR ? 1e9 : (pos[k] === undefined ? 1e8 : pos[k]) }; };
  return idx.sort(function(a, b){
    var x = key(a), y = key(b);
    return x.p - y.p || (x.p === 1e8 ? x.k.localeCompare(y.k, 'bg') : 0) || a - b;
  });
}
function grCalcRow(r){ return grCalc.rows[grOrder[r]]; }
function grToggleGroup(){
  if(!grCalc) return;
  var cur = grVisible[grSel.r], id = cur && cur.id;
  grCommitEdit();
  grGroupBy = grGroupMode() === 'sector' ? 'flat' : 'sector';
  try { localStorage.setItem('gr-grid-group', grGroupBy); } catch(e){}
  grAnc = null; grDrop = false;
  grRecalc();
  var r = grVisible.map(function(x){ return x.id; }).indexOf(id);
  if(r >= 0) grSel.r = r;                     // избраният човек остава избран
  grRender();
}
function grGroupMembers(sk){ return grOrder.filter(function(i){ return grSector(grCalc.rows[i].staff) === sk; }); }
function grGroupHeadHtml(sk){
  var M = grCalc.month;
  return '<tr class="gr-grp" data-sector="' + escAttrVal(sk) + '"><td colspan="3" class="gr-stk gr-stk0 gr-stk-last" style="text-align:left;font-weight:700;background:#e2e8f0;white-space:nowrap;">' +
    escVal(sk) + ' <span style="font-weight:400;color:#64748b;">(' + grGroupMembers(sk).length + ')</span></td><td colspan="' + (M.days + 4) + '" style="background:#e2e8f0;"></td></tr>';
}
/* „На смяна“ под групата — същото броене като картата „Покритие“ (работна буква). 0 → червено. */
function grGroupCovHtml(sk){
  var M = grCalc.month, c = new Array(M.days).fill(0);
  grGroupMembers(sk).forEach(function(i){
    var L = (grRows[grCalc.rows[i].staff.id] || { letters: [] }).letters || [];
    for(var d = 0; d < M.days; d++) if(GR_WORK_LETTERS.indexOf(L[d]) >= 0) c[d]++;
  });
  var h = '<tr class="gr-grp-cov" data-sector="' + escAttrVal(sk) + '"><td colspan="3" class="gr-stk gr-stk0 gr-stk-last" style="text-align:right;font-size:11px;color:#64748b;white-space:nowrap;">на смяна</td>';
  c.forEach(function(n){ h += '<td class="gr-gcov' + (n ? '' : ' gr-gcov0') + '" style="text-align:center;font-size:11px;' + (n ? 'color:#64748b;' : 'background:#fecaca;color:#991b1b;font-weight:700;') + '">' + n + '</td>'; });
  return h + '<td colspan="4"></td></tr>';
}

/* ─── Рендер ───────────────────────────────────────────── */
function grTitle(){ return '<div class="pg-title">🗓️ Работен график <span style="font-size:12px;color:#f59e0b;font-weight:600;">· в разработка</span></div>'; }
function grToolbar(){
  var stores = (grMe && grMe.stores) || [], trz = !!grMe && grMe.kind === 'trz';
  /* ТРЗ: в избора — само обектите с подаден график за месеца (от обзора). */
  if(trz && grOverview) stores = (grOverview.stores || []).map(function(s){ return { name: s.store }; });
  var h = '<div class="card" id="gr-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(grView === 'overview') h += '<b>Всички обекти</b>';
  else if(stores.length > 1){
    h += '<select id="gr-store" onchange="grPickStore(this.value)">' + stores.map(function(s){
      return '<option value="' + escAttrVal(s.name) + '"' + (s.name === grStore ? ' selected' : '') + '>' + escVal(s.name) + '</option>';
    }).join('') + '</select>';
  } else h += '<b>' + escVal(grStore) + '</b>';
  h += '<button class="btn-sm" onclick="grGoMonth(-1)" title="Предходен месец">◀</button>' +
       '<b id="gr-month-label" style="min-width:150px;text-align:center;">' + escVal(grMonthLabel(grMonth)) + '</b>' +
       '<button class="btn-sm" onclick="grGoMonth(1)" title="Следващ месец">▶</button>';
  h += '<span style="flex:1"></span>';
  if(grCanOverview()) h += '<button class="filter-btn' + (grView === 'overview' ? ' active' : '') + '" onclick="grSetView(\'overview\')">🏬 Обекти</button>';
  h += '<button class="filter-btn' + (grView === 'grid' ? ' active' : '') + '" onclick="grSetView(\'grid\')">📅 График</button>';
  h += '<button class="filter-btn' + (grView === 'changes' ? ' active' : '') + '" onclick="grSetView(\'changes\')">✎ Промени</button>';
  if(!trz) h += '<button class="filter-btn' + (grView === 'staff' ? ' active' : '') + '" onclick="grSetView(\'staff\')">👥 Персонал</button>';
  h += '</div>';
  return h;
}
function grStatusBadge(){
  if(!grData) return '';
  if(grData.status === 'submitted'){
    var m = grData.month_row || {};
    return '<span id="gr-status" style="background:#dcfce7;color:#166534;border-radius:10px;padding:2px 10px;font-weight:600;">✔ Подаден' +
      (m.submitted_by_name ? ' от ' + escVal(m.submitted_by_name) : '') + (m.submitted_at ? ' · ' + escVal(fmtDate(String(m.submitted_at).slice(0, 10))) : '') + '</span>';
  }
  return '<span id="gr-status" style="background:#fef3c7;color:#92400e;border-radius:10px;padding:2px 10px;font-weight:600;">✎ Чернова</span>';
}
/* Бързото обновяване (11.11.2026): при писане, избор, списък, дърпане и поставяне — само
   засегнатите редове, редовете „на смяна“, долният блок, предупрежденията и броячът. Целият
   модул (grRender) прерисуваше 395 KB HTML за всеки клавиш — 50–110 ms на 41 души. Резултатът
   е същият като при grRender (тестът го сверява). Няма ли мрежа на екрана — пълен рендер. */
function grUpdate(){
  var grid = document.getElementById('gr-grid');
  if(!grid){ grTouched = {}; return grRender(); }      // друг изглед / без данни — #gr-grid го няма
  var ctx = grRowCtx(), rows = {}, k, calc = false;
  for(k in grTouched){ rows[k] = 1; calc = true; }
  for(k = grPainted.r0; k <= grPainted.r1; k++) rows[k] = 1;
  for(k = ctx.rg.r0; k <= ctx.rg.r1; k++) rows[k] = 1;
  grTouched = {};
  grPainted = { r0: ctx.rg.r0, r1: ctx.rg.r1 };
  for(k in rows){
    var r = +k, ci = grOrder[r];
    if(ci === undefined) continue;
    var tr = document.getElementById('gr-row-' + grCalc.rows[ci].staff.id);
    if(tr) tr.outerHTML = grRowHtml(ci, r, ctx);
  }
  if(calc){
    Array.prototype.forEach.call(grid.querySelectorAll('tr.gr-grp-cov'), function(tr){ tr.outerHTML = grGroupCovHtml(tr.getAttribute('data-sector')); });
    var ft = grid.querySelector('tbody.gr-foot');
    if(ft) ft.outerHTML = grFootHtml();
    var wb = document.getElementById('gr-warn-box');
    if(wb){
      var was = document.getElementById('gr-warnings'), open = was ? was.open : null;
      wb.innerHTML = grWarningsHtml();
      var now = document.getElementById('gr-warnings');
      if(now && open !== null) now.open = open;
    }
    var off = grOffCount(), oe = document.getElementById('gr-offnorm');
    if(oe){ oe.textContent = off ? off + ' извън нормата' : 'всички на нормата'; oe.style.color = off ? '#dc2626' : '#16a34a'; }
  }
  var ds = grDrop ? document.getElementById('gr-drop-sel') : null;
  if(ds){ try { ds.focus({ preventScroll: true }); } catch(e){ ds.focus(); } } else grFocusGrid();
}
function grRender(){
  var el = document.getElementById('mod-grafik');
  if(!el) return;
  if(grView === 'overview'){ el.innerHTML = grTitle() + grToolbar() + grOverviewHtml(); return; }
  if(!grData){ el.innerHTML = grTitle() + grToolbar(); return; }
  var h = grTitle() + grToolbar();
  if(grView === 'staff') h += grStaffHtml();
  else if(grView === 'changes') h += grChangesHtml();
  else h += grGridPageHtml();
  var keep = grKeepView(el);
  grTouched = {};
  el.innerHTML = h;
  grRestoreView(el, keep);
  if(grView !== 'grid') grDrop = false;
  if(grView === 'grid'){
    grStickyLeft();
    var ds = grDrop ? document.getElementById('gr-drop-sel') : null;
    if(ds){ try { ds.focus({ preventScroll: true }); } catch(e){ ds.focus(); } } else grFocusGrid();
  }
}
/* Рендерът сглобява модула наново (innerHTML) и новата кутия на мрежата тръгва от скрол 0 —
   кликът в 25-и ден връщаше изгледа в началото на месеца (Раднево, 05.11.2026). Пазим скрола
   (за същия обект / месец / изглед) и отвореното / затвореното на сгъваемите блокове. */
function grKeepView(el){
  var w = document.getElementById('gr-grid-wrap'), open = {};
  Array.prototype.forEach.call(el.querySelectorAll('details[id]'), function(d){ open[d.id] = d.open; });
  return { key: grViewKey, x: w ? w.scrollLeft : 0, y: w ? w.scrollTop : 0, open: open, had: !!w };
}
function grRestoreView(el, k){
  Array.prototype.forEach.call(el.querySelectorAll('details[id]'), function(d){ if(k.open.hasOwnProperty(d.id)) d.open = k.open[d.id]; });
  // Ключът е на ПОКАЗАНОТО досега (grViewKey), не на текущите grStore / grMonth — при смяна на месеца
  // те вече са новите, а кутията още е от стария.
  var w = document.getElementById('gr-grid-wrap'), now = grStore + '|' + grMonth + '|' + grView;
  if(w && k.had && k.key === now){ w.scrollLeft = k.x; w.scrollTop = k.y; }
  grViewKey = now;
}
/* т.2: №, Служител и Сектор залепват вляво. Отместването на втората и третата колона — по
   реалната ширина на първите (padding-ът и рамките идват от общите правила на таблиците). */
function grStickyLeft(){
  var g = document.getElementById('gr-grid'), st = document.getElementById('gr-stk-css');
  if(!g || !st) return;
  var th = g.querySelectorAll('thead th.gr-stk');
  if(th.length < 3) return;
  var a = th[0].offsetWidth || GR_STK_W[0], b = a + (th[1].offsetWidth || GR_STK_W[1]);
  st.textContent = '#gr-grid .gr-stk1{left:' + a + 'px;}#gr-grid .gr-stk2{left:' + b + 'px;}';
}
/* При стрелки / Tab / Enter: избраната клетка да се вижда — мести се само кутията, не страницата,
   и клетката не остава под залепените колони. */
function grEnsureVisible(){
  var w = document.getElementById('gr-grid-wrap'), c = document.getElementById('gr-c-' + grSel.r + '-' + grSel.d);
  if(!w || !c || !c.getBoundingClientRect) return;
  var wr = w.getBoundingClientRect(), cr = c.getBoundingClientRect(), sticky = 0, head = 0;
  var last = document.querySelector('#gr-grid thead th.gr-stk2'), hd = document.querySelector('#gr-grid thead');
  if(last) sticky = last.getBoundingClientRect().right - wr.left;
  if(hd) head = hd.getBoundingClientRect().height;
  if(cr.left < wr.left + sticky) w.scrollLeft -= (wr.left + sticky - cr.left);
  else if(cr.right > wr.right) w.scrollLeft += (cr.right - wr.right);
  if(cr.top < wr.top + head) w.scrollTop -= (wr.top + head - cr.top);
  else if(cr.bottom > wr.bottom) w.scrollTop += (cr.bottom - wr.bottom);
}
function grGridPageHtml(){
  var M = grCalc.month, setup = grData.setup || {}, h = '';
  if(setup.missing && setup.missing.length){
    h += '<div class="card" id="gr-missing" style="border-left:4px solid #dc2626;color:#991b1b;">⚠ Липсват данни за дружеството — админ (' + escVal(setup.missing.join(', ')) + '). Графикът може да се попълва, но не и да се подаде.</div>';
  }
  var off = grOffCount();
  h += '<div class="card" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">' + grStatusBadge() +
    '<span>Работни дни: <b>' + M.workDays + '</b> · норма <b>' + M.norm + ' ч.</b> · <b id="gr-season">' + escVal(grSeasonLabel(setup)) + '</b></span>' +
    '<span id="gr-offnorm" style="color:' + (off ? '#dc2626' : '#16a34a') + ';font-weight:600;">' + (off ? off + ' извън нормата' : 'всички на нормата') + '</span>' +
    '<span id="gr-save" style="color:#64748b;font-size:12px;">' + escVal(grSaveState) + '</span><span style="flex:1"></span>';
  if(grCanEdit()){
    h += '<button class="btn-sm" onclick="grCopyRhythm()" title="Попълва празните клетки по дните от седмицата на предходния месец">📋 Ритъмът от предходния месец</button>';
    h += '<button class="btn-sm" onclick="grToggleLock()" title="Ctrl+L">🔒 Заключи / отключи кода</button>';
    h += '<button class="btn btn-green" onclick="grSubmit()">📤 Подай</button>';
  }
  if(grData.can_reopen) h += '<button class="btn-sm" onclick="grReopen()">↩ Върни в чернова</button>';
  /* 1д: файл за ТРЗ и печат — за всеки, който вижда графика (засега само beta списъка). */
  h += '<button class="btn-sm" id="gr-group-btn" onclick="grToggleGroup()" title="Редовете — по сектори или един общ списък (само на екрана; печатът и Excel са по реда на персонала)">' + (grGroupMode() === 'sector' ? '☰ Плосък списък' : '▤ По сектори') + '</button>';
  h += '<button class="btn-sm" onclick="grExportTrz()" title="Excel файл по образеца на ТРЗ">📥 Excel за ТРЗ</button>';
  h += '<button class="btn-sm" onclick="grPrintGrafik()" title="График за явяване на работа — A4 хоризонтално, с подписи">🖨 Печат</button>';
  if(grData.status === 'submitted') h += grPresenceButtons();
  h += '</div>';
  h += '<div id="gr-warn-box">' + grWarningsHtml() + '</div>';
  /* Подсказката е НАД мрежата: кутията на мрежата залепва под лентата и трябва да е последна в
     модула — иначе редът под нея я избутва нагоре при скрол докрай (index.html, .gr-grid-wrap). */
  h += '<div id="gr-hint" style="font-size:12px;color:#64748b;margin:6px 2px;">Букви: ' + escVal(grAllowedLetters().join(', ')) +
    ' · число 1–12 = свободни часове · стрелки / Tab / Enter · Shift+клик / Shift+стрелки — избор · Ctrl+C / Ctrl+V (и от / към Excel) · Delete изтрива избраното · ▾, двоен клик или Alt+↓ — списък · квадратчето долу вдясно — дръпни надясно, повтаря избраното · Ctrl+L заключва кода · ' +
    '<span style="background:#fde68a;padding:0 4px;">жълто</span> = кодът е сменен автоматично до нормата · 🔒 = заключен код</div>';
  h += grGridHtml();
  return h;
}
function grStkW(i){ var w = GR_STK_W[i]; return 'box-sizing:border-box;width:' + w + 'px;min-width:' + w + 'px;max-width:' + w + 'px;'; }
function grDayHead(i){
  var M = grCalc.month, w = M.dow[i], hol = M.holiday[i];
  var bg = hol ? '#fecaca' : (w >= 6 ? '#e2e8f0' : '');
  return '<th class="gr-dh" title="' + escAttrVal(M.dates[i] + (hol ? ' · ' + hol : '')) + '" style="padding:2px 3px;min-width:30px;' + (bg ? 'background:' + bg + ';' : '') + '">' +
    (i + 1) + '<br><span style="font-weight:400;font-size:10px;">' + GR_DOW[w] + '</span></th>';
}
function grGridHtml(){
  var M = grCalc.month;
  /* 31 колони → хоризонтален скрол; в такъв контейнер заглавието не може да залепне под лентата
     на страницата, затова мрежата е кутия с височината на екрана и заглавието залепва в нейния
     горен край (index.html, .gr-grid-wrap thead th), без да закрива редове. */
  var h = '<style id="gr-stk-css">#gr-grid .gr-stk1{left:' + GR_STK_W[0] + 'px;}#gr-grid .gr-stk2{left:' + (GR_STK_W[0] + GR_STK_W[1]) + 'px;}</style>';
  h += '<div class="tbl-wrap gr-grid-wrap" id="gr-grid-wrap"><table id="gr-grid" tabindex="0" onkeydown="grKey(event)" onpaste="grPaste(event)" oncopy="grCopy(event)" onmouseover="grFillOver(event)" style="border-collapse:collapse;font-size:12px;-webkit-user-select:none;user-select:none;">';
  h += '<thead><tr><th class="gr-stk gr-stk0" style="' + grStkW(0) + '">№</th><th class="gr-stk gr-stk1" style="text-align:left;' + grStkW(1) + '">Служител</th><th class="gr-stk gr-stk2 gr-stk-last" style="' + grStkW(2) + '">Сектор</th>';
  for(var i = 0; i < M.days; i++) h += grDayHead(i);
  h += '<th title="Вътрешни часове (буквите + свободните часове)">Вътр.</th><th title="Официални часове по кодовете">Офиц.</th><th>Цел</th><th>Разл.</th></tr></thead><tbody>';
  var grp = grGroupMode() === 'sector', ctx = grRowCtx(), prevSec = null;
  grPainted = { r0: ctx.rg.r0, r1: ctx.rg.r1 };
  grOrder.forEach(function(ci, r){
    var x = grCalc.rows[ci];
    if(grp){
      var sk = grSector(x.staff);
      if(sk !== prevSec){ if(prevSec !== null) h += grGroupCovHtml(prevSec); h += grGroupHeadHtml(sk); prevSec = sk; }
    }
    h += grRowHtml(ci, r, ctx);
  });
  if(grp && prevSec !== null) h += grGroupCovHtml(prevSec);
  if(!grCalc.rows.length) h += '<tr><td colspan="' + (M.days + 7) + '" style="padding:14px;color:#64748b;">Няма служители в графика за месеца — добави ги от „👥 Персонал“.</td></tr>';
  h += '</tbody>' + grFootHtml() + '</table></div>';
  return h;
}
/* Един ред на мрежата (11.11.2026 — изваден, за да може писането да подменя само него, grUpdate). */
function grRowHtml(ci, r, ctx){
  var M = ctx.M, chMap = ctx.chMap, rg = ctx.rg, edit = ctx.edit, x = grCalc.rows[ci], out = '';
  var s = x.staff, row = grRows[s.id] || { letters: [], locked: {} };
  var changed = {};
  x.changed.forEach(function(c){ changed[c.day] = c; });
  var warnDays = {}, sunLd = {};
  x.warnings.forEach(function(w){ (warnDays[w.day] = warnDays[w.day] || []).push(w.text); if(w.type === 'sunday_ld') sunLd[w.day] = 1; });
  /* Напуска през месеца — маркиран (бланката: L5:L80, светлосиньо). */
  var leaving = s.left_on && s.left_on >= M.start && s.left_on <= M.end;
  out += '<tr id="gr-row-' + escAttrVal(s.id) + '"><td class="gr-stk gr-stk0" style="' + grStkW(0) + '" title="Номерът в печата и в Excel за ТРЗ">' + (ci + 1) + '</td><td class="gr-name gr-stk gr-stk1' + (leaving ? ' gr-leaving' : '') + '" style="text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + grStkW(1) + (leaving ? 'background:' + GR_GRID_FILL.leaving + ';' : '') + '" title="' + escAttrVal((s.full_name || '') + (s.contract_title ? ' · ' + s.contract_title : '') + (+s.hours_per_day && +s.hours_per_day !== 8 ? ' · ' + s.hours_per_day + ' ч.' : '') + (leaving ? ' · напуска на ' + fmtDate(s.left_on) : '')) + '">' +
    escVal(s.short_name || s.full_name) + (+s.hours_per_day && +s.hours_per_day !== 8 ? ' <span style="color:#64748b;">(' + escVal(String(+s.hours_per_day)) + ' ч.)</span>' : '') + '</td><td class="gr-stk gr-stk2 gr-stk-last" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + grStkW(2) + '" title="' + escAttrVal(s.sector_id ? grSector(s) : '') + '">' + escVal(s.sector_id ? grSector(s) : '') + '</td>';
  for(var d = 0; d < M.days; d++){
    var L = row.letters[d] || '', code = x.codes[d] || '', lk = row.locked && row.locked[d + 1];
    var ch = changed[d + 1], w = M.dow[d], hol = M.holiday[d];
    var outside = (s.hired_on && M.dates[d] < s.hired_on) || (s.left_on && M.dates[d] > s.left_on);
    /* Цветовете от бланката (05.11.2026): ЛД в неделя — червено; О / Б — техните; дни извън
       назначението — сиво; после празник и събота/неделя. Автоматично сменен код — жълто, най-отгоре. */
    /* Подаден месец: денят с промяна („Промени“) — оранжев, най-отгоре (бланката: присъствената). */
    var dev = chMap[s.id + '|' + (d + 1)];
    var bg = dev ? GR_CH_FILL : ch ? '#fde68a' : sunLd[d + 1] ? GR_GRID_FILL.bad : L === 'О' ? GR_GRID_FILL.o : L === 'Б' ? GR_GRID_FILL.b :
      outside ? GR_GRID_FILL.outside : (hol ? '#fee2e2' : (w >= 6 ? '#f1f5f9' : ''));
    var title = M.dates[d] + (code ? ' · ' + code : '') + (dev ? ' · промяна: ' + (dev.planned_letter || 'почивка') + ' → ' + dev.actual + ' (' + dev.reason + ')' : '') + (ch ? ' · автоматично: ' + ch.from + ' → ' + ch.to : '') + (lk ? ' · заключен' : '') + (warnDays[d + 1] ? ' · ⚠ ' + warnDays[d + 1].join('; ') : '');
    var sel = (grSel.r === r && grSel.d === d);
    var inR = rg.multi && r >= rg.r0 && r <= rg.r1 && d >= rg.d0 && d <= rg.d1;
    var corner = edit && r === rg.r1 && d === rg.d1, btnDrop = edit && sel && !grEdit;
    out += '<td class="gr-c' + (inR ? ' gr-insel' : '') + '" id="gr-c-' + r + '-' + d + '" data-r="' + r + '" data-d="' + d + '" onclick="grSelect(' + r + ',' + d + ',event)" ondblclick="grDropOpen(' + r + ',' + d + ')" title="' + escAttrVal(title) + '" style="text-align:center;border:1px solid #e2e8f0;cursor:cell;min-width:30px;height:24px;' +
      (bg ? 'background:' + bg + ';' : '') + (sel ? 'outline:2px solid #2563eb;outline-offset:-2px;' : '') + (inR ? 'box-shadow:inset 0 0 0 1000px rgba(37,99,235,.15);' : '') +
      (sel || corner ? 'position:relative;' : '') + (warnDays[d + 1] ? 'color:#dc2626;font-weight:700;' : '') + '">' +
      escVal(sel && grEdit ? grEdit : L) + (lk ? '<span style="font-size:9px;">🔒</span>' : '') +
      (btnDrop ? '<span class="gr-drop-btn" onclick="event.stopPropagation();grDropOpen(' + r + ',' + d + ')" title="Списък с буквите (Alt+↓)" style="position:absolute;top:0;right:1px;font-size:9px;line-height:9px;color:#2563eb;cursor:pointer;">▾</span>' : '') +
      (corner ? '<span class="gr-fill" onmousedown="grFillStart(event)" title="Дръпни надясно — повтаря избраното по дните" style="position:absolute;right:-3px;bottom:-3px;width:6px;height:6px;background:#2563eb;border:1px solid #fff;cursor:crosshair;z-index:0;"></span>' : '') +
      (sel && grDrop && edit ? grDropHtml(r) : '') + '</td>';
  }
  var er = grEmptyRow(x), tg = er ? x.norm : x.target, df = er ? -tg : x.diff;
  var dc = df === 0 ? '#16a34a' : '#dc2626';
  /* „Вътр.“ като колона BE на бланката: под нормата — червено, над нормата + 3 ч. — оранжево.
     Прагът е нормата на човека без дните Б / НО (internalNorm, grafik-engine.js). */
  var inC = x.internal < x.internalNorm ? GR_GRID_FILL.under : x.internal > x.internalNorm + 3 ? GR_GRID_FILL.over : '';
  out += '<td class="gr-int" style="' + (inC ? 'background:' + inC + ';' : '') + '" title="' + escAttrVal('вътрешни ' + grHrsTxt(x.internal) + ' ч. · праг ' + grHrsTxt(x.internalNorm) + ' ч. (норма без Б / НО)') + '">' + x.internal + '</td><td>' + x.official + '</td><td>' + tg + '</td>' +
    '<td class="gr-diff" style="color:' + dc + ';font-weight:700;white-space:nowrap;" title="' + escAttrVal(er || x.message) + '">' + (df > 0 ? '+' : '') + df +
    (function(){ var ht = er ? '' : grHintText(grNormHint(x)); return ht ? ' <span class="gr-hint" title="' + escAttrVal('💡 ' + ht) + '" style="cursor:help;">💡</span>' : ''; })() + '</td></tr>';
  return out;
}
function grRowCtx(){ return { M: grCalc.month, chMap: grChMap(), rg: grRange(), edit: grCanEdit() }; }
/* Долният блок на мрежата (08.11.2026, вместо картите „Покритие“ и „Дневни сборове“): в същите
   колони за дните, със същия хоризонтален скрол и залепените леви колони. Отгоре — „На смяна“,
   „Сутрин“, „Вечер“, „Сектори без човек“; под „▸ още“ (сгънато, помни се) — по буква, „Общо на
   ден“, по позиция и в плоския изглед — по сектор (в изгледа по сектори той е под всяка група). */
function grMoreOpen(){
  if(grMore === null){ var v = null; try { v = localStorage.getItem('gr-grid-more'); } catch(e){} grMore = v === '1'; }
  return grMore;
}
function grToggleMore(){
  grMore = !grMoreOpen();
  try { localStorage.setItem('gr-grid-more', grMore ? '1' : '0'); } catch(e){}
  grRender();
}
function grFootHtml(){
  if(!grCalc.rows.length) return '';
  var M = grCalc.month, t = grDaily(), c = grCoverage(), more = grMoreOpen(), flat = grGroupMode() !== 'sector';
  var on = new Array(M.days).fill(0), empty = [];
  grCalc.rows.forEach(function(x){
    var L = (grRows[x.staff.id] || { letters: [] }).letters || [];
    for(var d = 0; d < M.days; d++) if(GR_WORK_LETTERS.indexOf(L[d]) >= 0) on[d]++;
  });
  var secs = c.order.filter(function(k){ return k !== GR_NO_SECTOR; });   // „Без сектор“ не е сектор
  for(var d = 0; d < M.days; d++) empty.push(secs.filter(function(k){ return !c.sec[k][d]; }));
  var first = true;
  var line = function(id, label, arr, o){
    o = o || {};
    var top = first ? 'border-top:2px solid #94a3b8;' : '';
    first = false;
    var h = '<tr id="' + id + '" class="gr-foot-row"><td colspan="3" class="gr-stk gr-stk0 gr-stk-last" style="text-align:left;white-space:nowrap;font-size:11px;' + top + (o.bold ? 'font-weight:700;' : '') + '">' + escVal(label) + '</td>';
    arr.forEach(function(n, i){
      var st = o.red0 && !n ? 'background:#fecaca;color:#991b1b;font-weight:700;' : o.redPos && n ? 'background:#fecaca;color:#991b1b;font-weight:700;' : (n ? '' : 'color:#cbd5e1;');
      h += '<td style="text-align:center;font-size:11px;' + top + st + '"' + (o.titles && o.titles[i].length ? ' title="' + escAttrVal(o.titles[i].join(', ')) + '"' : '') + '>' + n + '</td>';
    });
    return h + '<td colspan="4" style="' + top + '"></td></tr>';
  };
  var h = line('gr-foot-onshift', 'На смяна', on, { bold: true, red0: true }) +
    line('gr-daily-morning', 'Сутрин (ЛД+ЗД+П)', t.morning, { bold: true }) +
    line('gr-daily-evening', 'Вечер (ЛД+ЗД+В+М)', t.evening, { bold: true }) +
    line('gr-foot-nosec', 'Сектори без човек', empty.map(function(l){ return l.length; }), { redPos: true, titles: empty });
  h += '<tr id="gr-foot-more" class="gr-foot-row"><td colspan="3" class="gr-stk gr-stk0 gr-stk-last" onclick="grToggleMore()" style="text-align:left;white-space:nowrap;font-size:11px;color:#2563eb;cursor:pointer;" title="По буква, „Общо на ден“, по позиция (хората на смяна — работна буква или свободни часове)' + (flat ? ', по сектор' : '') + '">' +
    (more ? '▾ по-малко' : '▸ още') + '</td><td colspan="' + (M.days + 4) + '"></td></tr>';
  if(more){
    h += GR_DAILY_LETTERS.map(function(l){ return line('gr-daily-l-' + l, l, t.by[l]); }).join('') +
      line('gr-daily-total', 'Общо на ден (буквите)', t.total, { bold: true }) +
      t.posOrder.map(function(k){ return line('gr-daily-p-' + k, k, t.pos[k]); }).join('');
    if(flat) h += c.order.map(function(k){ return line('gr-foot-sec-' + k, 'на смяна: ' + k, c.sec[k], { red0: k !== GR_NO_SECTOR }); }).join('');
  }
  return '<tbody class="gr-foot">' + h + '</tbody>';
}
/* Покритие по сектор и ден: колко души са на смяна (ЛД, ЗД, П, В, М, К). 0 → червено. */
function grCoverage(){
  var M = grCalc.month, sec = {}, order = [];
  grCalc.rows.forEach(function(x){
    var k = grSector(x.staff);
    if(!sec[k]){ sec[k] = new Array(M.days).fill(0); order.push(k); }
    var L = (grRows[x.staff.id] || { letters: [] }).letters;
    for(var d = 0; d < M.days; d++) if(GR_WORK_LETTERS.indexOf(L[d]) >= 0) sec[k][d]++;
  });
  /* По реда на списъка на магазина; „Без сектор“ — последен. */
  var pos = {};
  grSectors().forEach(function(x, i){ pos[x.name] = i; });
  order.sort(function(a, b){
    var pa = a === GR_NO_SECTOR ? 1e9 : (pos[a] === undefined ? 1e8 : pos[a]);
    var pb = b === GR_NO_SECTOR ? 1e9 : (pos[b] === undefined ? 1e8 : pos[b]);
    return pa - pb || a.localeCompare(b, 'bg');
  });
  return { order: order, sec: sec };
}
/* Дневни сборове (бланката: месечният лист, редове 80–100), 05.11.2026: колко души по буква,
   „Общо на ден“ (сборът на буквите), „Сутрин общо“ = ЛД + ЗД + П, „Вечер общо“ = ЛД + ЗД + В + М
   и по позиция. По позиция се броят хората НА СМЯНА (работна буква или свободни часове) —
   бланката брои всяка непразна клетка без „О“, т.е. и Б / НО. */
var GR_DAILY_LETTERS = ['ЛД', 'ЗД', 'П', 'В', 'М', 'К', 'Б', 'О', 'НО', 'О4'];
var GR_DAILY_POSITIONS = ['Продавач', 'Ръководител', 'Склад', 'Шофьор', 'Каса', 'Снабдител', 'ОТЗ'];
function grDaily(){
  var M = grCalc.month, zero = function(){ return new Array(M.days).fill(0); };
  var by = {}, pos = {}, total = zero(), morning = zero(), evening = zero();
  GR_DAILY_LETTERS.forEach(function(l){ by[l] = zero(); });
  grCalc.rows.forEach(function(x){
    var L = (grRows[x.staff.id] || { letters: [] }).letters || [], p = x.staff.position || '';
    for(var d = 0; d < M.days; d++){
      var v = L[d] || '';
      if(by[v]){ by[v][d]++; total[d]++; }
      if(v === 'ЛД' || v === 'ЗД' || v === 'П') morning[d]++;
      if(v === 'ЛД' || v === 'ЗД' || v === 'В' || v === 'М') evening[d]++;
      if(GR_WORK_LETTERS.indexOf(v) >= 0 || GrafikEngine.isHours(v)){ var k = p || 'без позиция'; (pos[k] = pos[k] || zero())[d]++; }
    }
  });
  var posOrder = GR_DAILY_POSITIONS.filter(function(k){ return pos[k]; }).concat(Object.keys(pos).filter(function(k){ return GR_DAILY_POSITIONS.indexOf(k) < 0; }));
  return { by: by, total: total, morning: morning, evening: evening, pos: pos, posOrder: posOrder };
}
/* Подсказка как да се стигне нормата (11.11.2026): само при разлика, само предложение — не се
   записва. Кешира се по буквите и заключените на човека (сметката пробва десетки варианта). */
var grHintCache = {};
function grNormHint(x){
  if(!x || x.diff === 0) return null;                  // празният ред е с разлика 0 в двигателя
  var r = grRows[x.staff.id] || { letters: [], locked: {} };
  var key = grMonth + '|' + x.staff.id, sig = JSON.stringify([r.letters, r.locked, x.staff.hours_per_day, x.staff.hired_on, x.staff.left_on]);
  var c = grHintCache[key];
  if(c && c.sig === sig) return c.hint;
  var setup = grData.setup || {}, E = GrafikEngine;
  var h = E.normHint(E.prepare(setup), E.monthInfo(grMonth, setup.extra_days), x.staff, r.letters || [], r.locked || {}) || { kind: 'many', diff: x.diff };
  grHintCache[key] = { sig: sig, hint: h };
  return h;
}
var GR_COUNT_WORD = { 1: 'една', 2: 'две', 3: 'три', 4: 'четири' };
function grHintText(h){
  if(!h) return '';
  if(h.kind === 'many') return h.diff < 0 ? 'не стигат и четири смени повече — попълни още дни' : 'над четири смени в повече — махни дни';
  var cnt = GR_COUNT_WORD[h.count] || h.count, days = h.days.slice().sort(function(p, q){ return p - q; }).map(grChDayLabel).join(', ').replace(/, ([^,]*)$/, ' и $1');
  var rng = h.range ? ' (' + (h.range[0] === h.range[1] ? grHrsTxt(h.range[0]) : grHrsTxt(h.range[0]) + '–' + grHrsTxt(h.range[1])) + ' ч.)' : '';
  if(h.kind === 'add') return 'добави ' + cnt + ' ' + h.letter + rng + ', напр. на ' + days;
  return 'махни ' + cnt + ' ' + h.from + ', напр. на ' + days;
}
function grWarningsHtml(){
  var list = [];
  grCalc.rows.forEach(function(x){
    var name = x.staff.short_name || x.staff.full_name;
    var er = grEmptyRow(x);
    if(er) list.push({ t: 'norow', s: name + ': ' + er });
    if(x.diff !== 0){
      var ht = er ? '' : grHintText(grNormHint(x));
      list.push({ t: 'norm', s: name + ': ' + x.message + (x.reachable ? '' : ' — изравняването не намира точна комбинация, кодовете не са пипнати') + (ht ? ' · 💡 ' + ht : '') });
    }
    var seen = {};
    x.warnings.forEach(function(w){
      var key = w.type + ':' + w.day;
      if(seen[key]) return; seen[key] = 1;
      /* Почивките и седмиците носят датите си в текста („7 поредни работни дни (02.11–08.11) …“). */
      list.push({ t: w.type, s: name + ': ' + (GR_DATED_WARN[w.type] ? w.text : w.day + '-ви — ' + w.text) });
    });
  });
  (grCalc.notes || []).forEach(function(n){ list.push({ t: 'month', s: n }); });
  if(!list.length) return '';
  return '<details class="card" id="gr-warnings" style="border-left:4px solid #f59e0b;"' + (list.length <= 12 ? ' open' : '') + '><summary style="cursor:pointer;font-weight:600;">⚠ Предупреждения (' + list.length + ')</summary><ul style="margin:6px 0 0 18px;font-size:12px;">' +
    list.map(function(x){ return '<li class="gr-warn gr-warn-' + escAttrVal(x.t) + '">' + escVal(x.s) + '</li>'; }).join('') + '</ul></details>';
}

/* ─── Навигация ────────────────────────────────────────── */
/* Първо запис на текущия обект/месец, ПОСЛЕ смяната — иначе чакащите редове
   тръгват с новия обект. Откаже ли човекът да изостави незаписаното — остава. */
function grPickStore(v){
  return grFlushThen(function(){ grStore = v; grSel = { r: 0, d: 0 }; grAnc = null; grDrop = false; return grLoadMonth(); }, function(){ grRender(); });
}
function grGoMonth(n){
  return grFlushThen(function(){ grMonth = grShiftMonth(grMonth, n); grSel = { r: 0, d: 0 }; grAnc = null; grDrop = false; return grView === 'overview' ? grLoadOverview() : grLoadMonth(); });
}
/* Обзорът е за всички обекти и тегли сам; от него към графика / персонала — графикът на
   grStore за grMonth наново (месецът може да е сменен в обзора). */
function grSetView(v){
  if(v === 'overview'){
    if(!grCanOverview()) return;
    return grFlushThen(function(){ grView = 'overview'; grEdit = ''; return grLoadOverview(); });
  }
  if(v === 'staff' && grMe && grMe.kind === 'trz') return;
  var from = grView;
  grView = v; grEdit = ''; grAnc = null; grDrop = false;
  if(from === 'overview' || !grData) return grLoadMonth();
  grRender();
}
function grSelect(r, d, ev){
  /* Втори клик в същата избрана клетка — без рендер: двойният клик (списъкът) пада върху
     елемента от втория клик; прерисуван, той вече е откачен от страницата. */
  if(!(ev && ev.shiftKey) && !grAnc && !grDrop && !grEdit && grSel.r === r && grSel.d === d && document.getElementById('gr-c-' + r + '-' + d)){ grFocusGrid(); return; }
  grCommitEdit(); grDrop = false;
  if(ev && ev.shiftKey){ if(!grAnc) grAnc = { r: grSel.r, d: grSel.d }; }
  else grAnc = null;
  grSel = { r: r, d: d }; grUpdate();
}
/* т.5: изборът — правоъгълникът между котвата и избраната клетка. */
function grRange(){
  var a = grAnc || grSel;
  return { r0: Math.min(a.r, grSel.r), r1: Math.max(a.r, grSel.r), d0: Math.min(a.d, grSel.d), d1: Math.max(a.d, grSel.d), multi: !!grAnc && (a.r !== grSel.r || a.d !== grSel.d) };
}
function grRangeText(){
  var rg = grRange(), out = [];
  for(var r = rg.r0; r <= rg.r1; r++){
    var L = (grRows[grVisible[r].id] || { letters: [] }).letters || [], line = [];
    for(var d = rg.d0; d <= rg.d1; d++) line.push(L[d] || '');
    out.push(line.join('\t'));
  }
  return out.join('\r\n');
}
/* Ctrl+C: текст с табулации (Excel го поставя по клетки). Става и за потребителя, който само чете. */
function grCopy(e){
  if(!grData || grView !== 'grid' || !grCalc || !grVisible.length) return;
  if(e.target && e.target.id === 'gr-drop-sel') return;
  var cd = e.clipboardData || window.clipboardData;
  if(!cd) return;
  e.preventDefault();
  cd.setData(e.clipboardData ? 'text/plain' : 'Text', grRangeText());
  var rg = grRange(), n = (rg.r1 - rg.r0 + 1) * (rg.d1 - rg.d0 + 1);
  toast('Копирани ' + n + (n === 1 ? ' клетка.' : ' клетки.'));
}
/* т.6: квадратчето в долния десен ъгъл — дърпане надясно повтаря избраното по дните,
   всеки ред своя шаблон (2 на 2, 5+2 …). Докато се дърпа — само рамка; записът е при пускане. */
function grFillStart(e){
  if(!grCanEdit() || !grCalc) return;
  if(e.preventDefault) e.preventDefault();
  if(e.stopPropagation) e.stopPropagation();
  grCommitEdit();
  var rg = grRange();
  grFill = { r0: rg.r0, r1: rg.r1, d0: rg.d0, d1: rg.d1, to: rg.d1 };
  document.addEventListener('mouseup', grFillEnd);
}
function grFillOver(e){
  if(!grFill) return;
  var td = e.target && e.target.closest ? e.target.closest('td.gr-c') : null;
  if(!td) return;
  grFill.to = +td.getAttribute('data-d');                // наляво (≤ d1) — нищо: рамка и запис само надясно
  Array.prototype.forEach.call(document.querySelectorAll('#gr-grid td.gr-fillto'), function(c){ c.classList.remove('gr-fillto'); c.style.outline = ''; });
  for(var r = grFill.r0; r <= grFill.r1; r++) for(var d = grFill.d1 + 1; d <= grFill.to; d++){
    var c = document.getElementById('gr-c-' + r + '-' + d);
    if(c){ c.classList.add('gr-fillto'); c.style.outline = '1px dashed #2563eb'; c.style.outlineOffset = '-2px'; }
  }
}
function grFillEnd(){
  document.removeEventListener('mouseup', grFillEnd);
  var f = grFill;
  grFill = null;
  if(!f) return;
  if(f.to <= f.d1){ grUpdate(); return; }
  var len = f.d1 - f.d0 + 1, n = 0;
  for(var r = f.r0; r <= f.r1; r++){
    var L = ((grRows[grVisible[r].id] || {}).letters || []).slice();
    for(var d = f.d1 + 1; d <= f.to; d++) if(grSetCell(r, d, L[f.d0 + (d - f.d0) % len] || '')) n++;
  }
  grSel = { r: f.r0, d: f.d0 }; grAnc = { r: f.r1, d: f.to };   // изборът — целият попълнен правоъгълник
  if(n){ grRecalc(); grSaveSoon(); }
  grUpdate();
  toast(n ? 'Попълнени ' + n + ' клетки.' : 'Нищо не се промени — клетките вече са такива.');
}
/* т.4: списъкът в клетката (като валидацията в Excel) — двоен клик, ▾ или Alt+↓. */
function grDropOpen(r, d){
  if(!grCanEdit() || !grCalc) return;
  grCommitEdit();
  grAnc = null; grSel = { r: r, d: d }; grDrop = true;
  grUpdate();
}
function grDropHtml(r){
  var cur = ((grRows[grVisible[r].id] || {}).letters || [])[grSel.d] || '';
  var opts = [''].concat(grAllowedLetters());
  var up = grVisible.length > 6 && r >= grVisible.length - 5;       // долните редове — нагоре
  return '<div class="gr-drop" style="position:absolute;' + (up ? 'bottom:100%;' : 'top:100%;') + 'left:0;z-index:6;background:#fff;border:1px solid #94a3b8;box-shadow:0 4px 12px rgba(0,0,0,.18);text-align:left;">' +
    '<select id="gr-drop-sel" size="' + Math.min(opts.length, 12) + '" onclick="event.stopPropagation();grDropPick()" onkeydown="grDropKey(event)" style="font-size:12px;min-width:96px;border:none;outline:none;">' +
    opts.map(function(l){ return '<option value="' + escAttrVal(l) + '"' + (l === cur ? ' selected' : '') + '>' + escVal(l || '— празно —') + '</option>'; }).join('') + '</select></div>';
}
function grDropPick(){
  var sl = document.getElementById('gr-drop-sel');
  if(!sl || !grDrop) return;
  var v = sl.value;
  grDrop = false;
  if(grSetCell(grSel.r, grSel.d, v)){ grRecalc(); grSaveSoon(); }
  grUpdate();
}
function grDropKey(e){
  if(e.stopPropagation) e.stopPropagation();               // стрелките са за списъка, не за мрежата
  if(e.key === 'Enter'){ e.preventDefault(); grDropPick(); return; }
  if(e.key === 'Escape' || e.key === 'Tab'){ e.preventDefault(); grDrop = false; grUpdate(); }
}
function grFocusGrid(){ var t = document.getElementById('gr-grid'); if(t && t.focus) try { t.focus({ preventScroll: true }); } catch(e){ t.focus(); } }

/* ─── Въвеждане ────────────────────────────────────────── */
function grSetCell(r, d, value){
  var s = grVisible[r];
  if(!s) return false;
  var row = grRows[s.id] || (grRows[s.id] = { letters: [], locked: {} });
  while(row.letters.length < grCalc.month.days) row.letters.push('');
  if(row.letters[d] === value) return false;
  row.letters[d] = value;
  grDirty[s.id] = true;
  grTouched[r] = 1;
  return true;
}
function grCommitEdit(){
  if(!grEdit) return true;
  var v = grNormalize(grEdit);
  grEdit = '';
  if(v === null){ toast('Непозната стойност. Позволени: ' + grAllowedLetters().join(', ') + ' или число 1–12.', '#dc2626'); return false; }
  if(grSetCell(grSel.r, grSel.d, v)){ grRecalc(); grSaveSoon(); }
  return true;
}
function grMove(dr, dd){
  var M = grCalc.month, r = grSel.r + dr, d = grSel.d + dd;
  if(d >= M.days){ d = 0; r++; }
  if(d < 0){ d = M.days - 1; r--; }
  r = Math.max(0, Math.min(grVisible.length - 1, r));
  grSel = { r: r, d: d };
}
/* Shift+стрелки — без прескачане на следващия ред (за разлика от стрелките). */
function grMoveClamp(dr, dd){
  grSel = { r: Math.max(0, Math.min(grVisible.length - 1, grSel.r + dr)), d: Math.max(0, Math.min(grCalc.month.days - 1, grSel.d + dd)) };
}
function grKey(e){
  if(!grData || grView !== 'grid' || !grCalc || !grVisible.length) return;
  if(e.target && e.target.id === 'gr-drop-sel') return;    // клавишите на списъка
  var k = e.key, edit = grCanEdit();
  if((e.ctrlKey || e.metaKey) && (k === 'l' || k === 'L' || k === 'л' || k === 'Л')){ e.preventDefault(); grToggleLock(); return; }
  if(e.altKey && k === 'ArrowDown'){ e.preventDefault(); grDropOpen(grSel.r, grSel.d); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;           // Ctrl+V → grPaste, Ctrl+C → grCopy
  var nav = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  if(nav[k]){
    e.preventDefault();
    if(grCommitEdit()){
      if(e.shiftKey){ if(!grAnc) grAnc = { r: grSel.r, d: grSel.d }; grMoveClamp(nav[k][0], nav[k][1]); }
      else { grAnc = null; grMove(nav[k][0], nav[k][1]); }
    }
    grUpdate(); grEnsureVisible(); return;
  }
  if(k === 'Tab'){ e.preventDefault(); grAnc = null; if(grCommitEdit()) grMove(0, e.shiftKey ? -1 : 1); grUpdate(); grEnsureVisible(); return; }
  if(k === 'Enter'){ e.preventDefault(); grAnc = null; if(grCommitEdit()) grMove(1, 0); grUpdate(); grEnsureVisible(); return; }
  if(k === 'Escape'){ grEdit = ''; grAnc = null; grUpdate(); return; }
  if(!edit) return;
  if(k === 'Delete' || k === 'Backspace'){
    e.preventDefault();
    if(grEdit){ grEdit = grEdit.slice(0, -1); grUpdate(); return; }
    var rg = grRange(), nd = 0;                             // целият избор
    for(var rr = rg.r0; rr <= rg.r1; rr++) for(var dd = rg.d0; dd <= rg.d1; dd++) if(grSetCell(rr, dd, '')) nd++;
    if(nd){ grRecalc(); grSaveSoon(); }
    grUpdate(); return;
  }
  if(k && k.length === 1 && /[\wА-Яа-я]/.test(k)){
    e.preventDefault();
    grAnc = null;
    /* 11.11.2026: завършена стойност → курсорът надясно (следващия ден). „О“ (може да е „О4“) и
       „1“ (10–12) чакат следващия клавиш; не продължи ли той стойността, тя се записва и клавишът
       почва следващия ден. Enter — надолу, Tab — надясно, както досега. */
    if(grEdit && grNormalize(grEdit) !== null && !grCouldBe(grEdit + k)){
      if(grCommitEdit()) grMove(0, 1);
    }
    grEdit = (grEdit + k).slice(0, 3);
    if(grNormalize(grEdit) !== null && !grHasLonger(grEdit)){
      if(grCommitEdit()) grMove(0, 1);
      grUpdate(); grEnsureVisible(); return;
    }
    grUpdate();
  }
}
/* Частично въведеното, нормализирано като в grNormalize (латиница → кирилица, 0 → О). */
function grPartial(t){
  t = String(t || '');
  if(/^\d+$/.test(t)) return t;
  var u = '';
  for(var i = 0; i < t.length; i++){ var ch = t.charAt(i); u += GR_LATIN[ch.toLowerCase()] || ch.toUpperCase(); }
  return u.replace(/^O/, 'О').replace(/^О0$/, 'О');
}
function grCandidates(){ return grAllowedLetters().concat(['1','2','3','4','5','6','7','8','9','10','11','12']); }
function grCouldBe(t){ var p = grPartial(t); return grCandidates().some(function(c){ return c.indexOf(p) === 0; }); }
function grHasLonger(t){ var p = grPartial(t); return grCandidates().some(function(c){ return c.length > p.length && c.indexOf(p) === 0; }); }
/* Поставяне от Excel: редове с табулации, от избраната клетка надясно и надолу. */
function grPaste(e){
  if(!grCanEdit() || !grCalc) return;
  var txt = (e.clipboardData || window.clipboardData) ? (e.clipboardData || window.clipboardData).getData('text') : '';
  if(!txt) return;
  e.preventDefault();
  grEdit = '';
  var lines = String(txt).replace(/\r/g, '').split('\n');
  if(lines.length && lines[lines.length - 1] === '') lines.pop();
  var bad = [], n = 0, rg = grRange();
  if(rg.multi && lines.length === 1 && lines[0].indexOf('\t') < 0){
    var one = grNormalize(lines[0]);
    if(one === null){ toast('Непозната стойност: „' + String(lines[0]).trim() + '“.', '#dc2626'); return; }
    for(var r1 = rg.r0; r1 <= rg.r1; r1++) for(var d1 = rg.d0; d1 <= rg.d1; d1++) if(grSetCell(r1, d1, one)) n++;
    grRecalc(); grUpdate();
    if(n) grSaveSoon();
    toast('Поставени ' + n + ' клетки.');
    return;
  }
  lines.forEach(function(line, i){
    line.split('\t').forEach(function(cell, j){
      var r = rg.r0 + i, d = rg.d0 + j;
      if(r >= grVisible.length || d >= grCalc.month.days) return;
      var v = grNormalize(cell);
      if(v === null){ bad.push((grVisible[r].short_name || '') + ' ' + (d + 1) + '-ви: „' + String(cell).trim() + '“'); return; }
      if(grSetCell(r, d, v)) n++;
    });
  });
  grRecalc(); grUpdate();
  if(n) grSaveSoon();
  if(bad.length) toast('Поставени ' + n + '; непознати (пропуснати) ' + bad.length + ': ' + bad.slice(0, 5).join('; ') + (bad.length > 5 ? '…' : ''), '#dc2626');
  else if(n) toast('Поставени ' + n + ' клетки.');
}
/* Заключва официалния код на клетката (такъв, какъвто е сега — вкл. автоматично сменен). */
function grToggleLock(){
  if(!grCanEdit() || !grCalc) return;
  grCommitEdit();
  var s = grVisible[grSel.r];
  if(!s) return;
  var row = grRows[s.id] || (grRows[s.id] = { letters: [], locked: {} });
  var key = String(grSel.d + 1);
  if(row.locked[key]){ delete row.locked[key]; }
  else {
    var code = grCalcRow(grSel.r).codes[grSel.d];
    if(!code){ toast('Няма код за заключване в тази клетка.', '#dc2626'); return; }
    row.locked[key] = code;
  }
  grDirty[s.id] = true;
  grTouched[grSel.r] = 1;
  grRecalc(); grUpdate(); grSaveSoon();
}
/* Ритъмът: за всеки ден — същият ден от седмицата 4 (или 5) седмици назад в
   предходния месец. Само работните букви и „свободните часове“, само в
   ПРАЗНИ клетки; отсъствията (О, Б, НО) не се пренасят. */
function grCopyRhythm(){
  if(!grCanEdit() || !grCalc) return;
  var prev = {};
  (grData.prev_rows || []).forEach(function(r){ prev[r.staff_id] = r.letters || []; });
  var M = grCalc.month, pm = GrafikEngine.monthInfo(grShiftMonth(grMonth, -1), []), n = 0;
  grVisible.forEach(function(s, r){
    var src = prev[s.id];
    if(!src) return;
    for(var d = 0; d < M.days; d++){
      var cur = (grRows[s.id] && grRows[s.id].letters[d]) || '';
      if(cur) continue;
      var back = d + 1 - 28;                      // ден в предходния месец (отрицателен → от края му)
      while(back > 0) back -= 7;
      var pd = pm.days + back;                    // 1..pm.days
      var v = src[pd - 1] || '';
      if(v && (GR_WORK_LETTERS.indexOf(v) >= 0 || v === 'О4' || GrafikEngine.isHours(v)) && grSetCell(r, d, v)) n++;
    }
  });
  if(!n){ toast('Няма какво да се пренесе (празен предходен месец или клетките вече са попълнени).'); return; }
  grRecalc(); grRender(); grSaveSoon();
  toast('Пренесени ' + n + ' клетки от ' + GR_MONTHS[+grShiftMonth(grMonth, -1).slice(5, 7) - 1] + '.');
}

/* ─── Автозапис ────────────────────────────────────────── */
function grSaveSoon(){
  if(grSaveTimer) clearTimeout(grSaveTimer);
  grSetSaveState('● Има незаписани промени');
  grSaveTimer = setTimeout(function(){ grSaveTimer = null; grSaveNow(); }, 800);
}
function grSetSaveState(t){ grSaveState = t; var el = document.getElementById('gr-save'); if(el) el.textContent = t; }
/* Записва мръсните редове. Тече ли запис — изчаква го и записва остатъка, тоест
   никога два паралелни save_rows. Връща true, ако след него няма незаписано. */
function grSaveNow(){
  if(grSavePromise) return grSavePromise.then(function(){ return grSaveNow(); });
  var ids = Object.keys(grDirty);
  if(!ids.length || !grData) return Promise.resolve(true);
  grDirty = {};
  var store = grStore, month = grMonth, days = grCalc.month.days;
  var rows = ids.map(function(id){
    var r = grRows[id] || { letters: [], locked: {} };
    var L = r.letters.slice(0, days);
    while(L.length && L[L.length - 1] === '') L.pop();
    return { staff_id: id, letters: L, locked: r.locked || {} };
  });
  grSetSaveState('⏳ Записва…');
  grSavePromise = grApi('save_rows', { store: store, month: month, rows: rows }).then(function(res){
    grSavePromise = null;
    var same = (store === grStore && month === grMonth);
    if(res.ok){
      if(same){
        ids.forEach(function(id){ grSaved[id] = 1; });
        var t = new Date();
        grSetSaveState('💾 Записано ' + grPad(t.getHours()) + ':' + grPad(t.getMinutes()));
      }
      return Object.keys(grDirty).length ? grSaveNow() : true;
    }
    var msg = grErrText(res);
    if(res.data && res.data.errors) msg += ' ' + res.data.errors.map(function(e){
      var s = grStaffById(e.staff_id); return (s ? s.short_name : '') + ' ' + e.cells.join(', ');
    }).join('; ');
    if(same){
      ids.forEach(function(id){ grDirty[id] = true; });        // нищо не се губи — пак при следващия запис
      grSetSaveState('⚠ Незаписано');
      toast('Графикът НЕ е записан: ' + msg, '#dc2626');
    } else {
      /* Обектът / месецът е сменен — тези редове не бива да тръгнат с чужд обект. */
      toast('Промените за ' + store + ' (' + grMonthLabel(month) + ') НЕ са записани: ' + msg, '#dc2626');
    }
    return false;
  });
  return grSavePromise;
}
/* Записва веднага всичко чакащо; true = няма незаписано. */
function grFlush(){
  if(grSaveTimer){ clearTimeout(grSaveTimer); grSaveTimer = null; }
  return grSaveNow();
}
/* Смяна на обект / месец: първо запис; паднал ли е — пита, преди да изостави промените. */
function grFlushThen(fn, onStay){
  return grFlush().then(function(ok){
    if(!ok && !confirm('Има НЕЗАПИСАНИ промени в графика. Да продължа без тях?')){ if(onStay) onStay(); return; }
    return fn();
  });
}

/* ─── Подаване / връщане ───────────────────────────────── */
function grSnapshot(){
  /* Всички служители в графика за месеца (grSubmit им е осигурил ред). Редовете на
     хора извън месеца (сменена дата на назначаване/напускане) не влизат — сървърът
     ги пропуска при сверката (handler.ts, submit). */
  var M = grCalc.month;
  return {
    rows: grCalc.rows.map(function(x){
      return { staff_id: x.staff.id, short_name: x.staff.short_name, full_name: x.staff.full_name, contract_title: x.staff.contract_title || '',
        hours_per_day: +x.staff.hours_per_day || 8, codes: x.codes.slice(0, M.days), official: x.official, target: x.target, diff: x.diff, norm: x.norm,
        internal: x.internal, man_days: x.manDays, notes: x.notes, warnings: x.warnings.length };
    }),
    totals: { man_days: grCalc.totals.manDays, man_hours: grCalc.totals.manHours, off_norm: grCalc.totals.offNorm, o: grCalc.totals.o, b: grCalc.totals.b, n: grCalc.totals.n },
    work_days: M.workDays, norm: M.norm, engine: 'grafik-engine.js 1г'
  };
}
function grSubmit(){
  if(!grCanEdit() || !grCalc) return;
  var setup = grData.setup || {};
  if(setup.missing && setup.missing.length){ toast('Не може да се подаде: липсват данни за дружеството — админ (' + setup.missing.join(', ') + ').', '#dc2626'); return; }
  grCommitEdit();
  var issues = grSubmitIssues();
  if(issues.length){ grSubmitBlocked(issues); return; }
  var q = 'Подаване на графика за ' + grMonthLabel(grMonth) + ' — ' + grStore + '?\nСлед подаване промени се правят само след връщане в чернова (admin / регионален).';
  if(!confirm(q)) return;
  return grFlush().then(function(saved){
    if(!saved){ toast('Не е подаден: първо графикът трябва да се запише.', '#dc2626'); return; }
    /* Всеки служител в графика за месеца трябва да има ред — дори празен. */
    var missing = grCalc.rows.filter(function(x){ return !grSaved[x.staff.id]; });
    var pre = missing.length ? grApi('save_rows', { store: grStore, month: grMonth, rows: missing.map(function(x){ return { staff_id: x.staff.id, letters: [], locked: {} }; }) }) : Promise.resolve({ ok: true });
    return pre.then(function(r0){
      if(!r0.ok){ toast('Не може да се подаде: ' + grErrText(r0), '#dc2626'); return; }
      missing.forEach(function(x){ grSaved[x.staff.id] = 1; if(!grRows[x.staff.id]) grRows[x.staff.id] = { letters: [], locked: {} }; });
      return grApi('submit', { store: grStore, month: grMonth, snapshot: grSnapshot() }).then(function(res){
        var d = res.data || {};
        if(!res.ok && d.reason === 'off_norm' && d.issues && d.issues.length){ grSubmitBlocked(d.issues); return; }
        if(!res.ok){ toast('Не е подаден: ' + grErrText(res), '#dc2626'); return; }
        toast('✔ Графикът е подаден.');
        return grLoadMonth();
      });
    });
  });
}
/* „Подай“ спира (решение на Тенчо 04.11.2026, вариант а): служител извън нормата, свободни
   часове 1–12 и служител без ред / с празен ред; от 05.11.2026 и ЛД в неделя. Същото проверява
   и grafik-api (submit → 409 off_norm със същия списък) — браузърът е само първата преграда. */
var GR_SUBMIT_HINT = 'Сложи кодове за дните или О/Б/Н; ако човекът не работи този месец — махни го от месеца.';
function grSubmitIssues(){
  var M = grCalc.month, out = [];
  grCalc.rows.forEach(function(x){
    var name = x.staff.full_name || x.staff.short_name || '', er = grEmptyRow(x);
    if(er) out.push(name + ': ' + er);
    else if(x.diff !== 0) out.push(name + ': ' + grHrsTxt(x.official) + ' ч. вместо ' + grHrsTxt(x.target) + ' ч.');
    var L = (grRows[x.staff.id] || {}).letters || [];
    for(var d = 0; d < M.days; d++){
      if(GrafikEngine.isHours(L[d] || '')) out.push(name + ': ' + L[d] + ' свободни ч. на ' + grPad(d + 1) + '.' + grPad(M.month) + ' — сложи код');
      else if(L[d] === 'ЛД' && M.dow[d] === 7) out.push(name + ': ЛД в неделя на ' + grPad(d + 1) + '.' + grPad(M.month) + ' — ползвай ЗД');
    }
  });
  return out;
}
function grSubmitBlocked(issues){
  var old = document.getElementById('gr-submit-modal');
  if(old) old.parentNode.removeChild(old);
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg open" id="gr-submit-modal"><div class="modal"><h3>⛔ Графикът не може да се подаде</h3>' +
    '<ul id="gr-submit-issues" style="margin:6px 0 0 18px;font-size:13px;">' + issues.map(function(t){ return '<li>' + escVal(t) + '</li>'; }).join('') + '</ul>' +
    '<p id="gr-submit-hint" style="font-size:13px;margin:10px 0 0;">' + escVal(GR_SUBMIT_HINT) + '</p>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal(\'gr-submit-modal\')">Затвори</button></div></div></div>');
}
function grReopen(){
  if(!grData || !grData.can_reopen) return;
  var nCh = (grChanges || []).length;
  if(!confirm('Връщане на графика за ' + grMonthLabel(grMonth) + ' — ' + grStore + ' в чернова?' + (nCh ? '\nИма ' + nCh + (nCh === 1 ? ' промяна — остава' : ' промени — остават') + ' за новото подаване.' : ''))) return;
  return grApi('reopen', { store: grStore, month: grMonth }).then(function(res){
    if(!res.ok){ toast('Не е върнат: ' + grErrText(res), '#dc2626'); return; }
    toast('Графикът е върнат в чернова.');
    return grLoadMonth();
  });
}

/* ─── „Промени“ (П2, план одобрен 05.11.2026; решения а–з) ─────────────
   Реалните отклонения от ПОДАДЕН график — лист „Промени“ в бланката v70. Пишат manager /
   регионален / admin за своя обект; „Отразено в ТРЗ“ отмятат ТРЗ и admin; отразената се пипа
   само от admin. Всички проверки са в grafik-api (changes_*); тук са само за бърза подсказка.
   ВТР чл. 19, ал. 4: всяка промяна е актуализация на графика с подпис — „🖨 Промени за подпис“. */
var GR_CH_ACTUALS = [
  ['ЛД', 'ЛД — работена смяна'], ['ЗД', 'ЗД — работена смяна'], ['П', 'П — работена смяна'], ['В', 'В — работена смяна'], ['М', 'М — работена смяна'],
  ['почивка', 'почивка — не е дошъл / почивен по размяна'], ['О', 'О — платен отпуск'], ['Б', 'Б — болничен'], ['Н', 'Н — неплатен отпуск'],
  ['Д', 'Д — държавни задължения'], ['А', 'А — с разрешение на администрацията'], ['С', 'С — самоотлъчка'], ['Майч', 'Майч — майчинство']
];
var GR_CH_FILL = '#F8CBAD';   // „ден с отклонение“ — оранжевото от бланката (ПРИСЪСТВЕНА ФОРМА)
var grChanges = null;         // changes_list за подадения месец; null — чернова или не е зареден
function grChCanEdit(){ return grCanEditStaff(); }
function grChCanTrz(){ return !!grMe && (grMe.kind === 'trz' || !!grMe.can_admin); }
function grChLoad(){
  grChanges = null;
  if(!grData || grData.status !== 'submitted') return Promise.resolve();
  var store = grStore, month = grMonth;
  return grApi('changes_list', { store: store, month: month }).then(function(res){
    if(store !== grStore || month !== grMonth) return;
    grChanges = res.ok ? (res.data.rows || []) : [];
    if(!res.ok) toast('Промените не се заредиха: ' + grErrText(res), '#dc2626');
  });
}
function grChMap(){
  var m = {};
  (grChanges || []).forEach(function(c){ m[c.staff_id + '|' + c.day] = c; });
  return m;
}
function grChSnapRows(){
  var s = grData && grData.month_row && grData.month_row.snapshot;
  return (s && s.rows) || [];
}
function grChName(staffId){
  var r = grChSnapRows().filter(function(x){ return x.staff_id === staffId; })[0];
  if(r) return r.full_name || r.short_name || '';
  var s = grStaffById(staffId);
  return s ? (s.full_name || s.short_name) : '—';
}
function grChDayLabel(day){
  var M = grCalc.month;
  return grPad(day) + '.' + grPad(M.month) + ' ' + GR_DOW[M.dow[day - 1]];
}
/* „По график“ — същото, което сървърът ще запише: буквата от графика и кодът от снимката. */
function grChPlanned(staffId, day){
  var L = ((grRows[staffId] || {}).letters || [])[day - 1] || '';
  var r = grChSnapRows().filter(function(x){ return x.staff_id === staffId; })[0];
  var code = r && r.codes ? (r.codes[day - 1] || '') : '';
  return { letter: L, code: code, text: (L || 'почивка') + (code ? ' / ' + code : '') };
}
// Работната буква трябва да има код за договора (часовете — от снимката) и вида ден (сезон / неделя) — както на сървъра.
function grChLetterOk(staffId, day, actual){
  if(['ЛД','ЗД','П','В','М'].indexOf(actual) < 0) return true;
  var r = grChSnapRows().filter(function(x){ return x.staff_id === staffId; })[0];
  var hpd = r && +r.hours_per_day ? +r.hours_per_day : 8;
  var E = GrafikEngine, setup = grData.setup || {}, M = E.monthInfo(grMonth, setup.extra_days);
  return !!E.translate(E.prepare(setup), actual, M.dow[day - 1], hpd);
}
function grChSame(actual, letter){
  var p = letter === 'НО' ? 'Н' : (letter === '' ? 'почивка' : letter);
  return actual === p;
}
function grChangesHtml(){
  if(grData.status !== 'submitted'){
    return '<div class="card" id="gr-ch-draft" style="color:#64748b;">Промените се въвеждат след подаване на графика. По ВТР чл. 19, ал. 4 всяка промяна в утвърдения график е актуализация с подпис.</div>';
  }
  var list = (grChanges || []).slice().sort(function(a, b){ return a.day - b.day || grChName(a.staff_id).localeCompare(grChName(b.staff_id), 'bg'); });
  var open = list.filter(function(c){ return !c.trz_done; }).length, edit = grChCanEdit(), trz = grChCanTrz(), adm = !!(grMe && grMe.can_admin);
  var h = '<div class="card" id="gr-changes"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px;">' +
    '<b>Промени — ' + escVal(grStore) + ', ' + escVal(grMonthLabel(grMonth)) + '</b>' +
    '<span id="gr-ch-count" style="color:#64748b;font-size:12px;">' + list.length + (list.length === 1 ? ' промяна' : ' промени') + ' · неотразени в ТРЗ: ' + open + '</span><span style="flex:1"></span>' +
    (edit ? '<button class="btn btn-green" onclick="grChOpen(\'\')">➕ Промяна</button>' : '') +
    (list.length ? '<button class="btn-sm" onclick="grPrintChanges()" title="ВТР чл. 19, ал. 4 — актуализация с подпис">🖨 Промени за подпис</button>' : '') + grPresenceButtons() + '</div>';
  if(!list.length){
    h += '<div id="gr-ch-empty" style="color:#64748b;padding:6px 0;">Няма въведени промени за месеца.</div>';
  } else {
    h += '<div class="tbl-wrap"><table id="gr-ch-tbl"><thead><tr><th>Дата</th><th style="text-align:left;">Служител</th><th>По график</th><th>Реално</th><th style="text-align:left;">Основание / документ</th><th>Въведено от</th><th>Отразено в ТРЗ</th>' + (edit || adm ? '<th></th>' : '') + '</tr></thead><tbody>';
    list.forEach(function(c){
      var who = (c.updated_by || c.created_by || '') + (c.updated_at || c.created_at ? ' · ' + grFmtAt(c.updated_at || c.created_at) : '');
      var tz = trz ? '<input type="checkbox" class="gr-ch-trz" ' + (c.trz_done ? 'checked ' : '') + 'onchange="grChTrz(\'' + escAttrVal(c.id) + '\',this.checked)" title="' + escAttrVal(c.trz_done ? 'отметнато от ' + (c.trz_done_by || '') + ' · ' + grFmtAt(c.trz_done_at) : 'отметни, когато е отразено в ТРЗ') + '">'
        : (c.trz_done ? '<span style="color:#16a34a;font-weight:600;" title="' + escAttrVal((c.trz_done_by || '') + ' · ' + grFmtAt(c.trz_done_at)) + '">✔ да</span>' : '<span style="color:#94a3b8;">не</span>');
      var can = (edit && !c.trz_done) || adm;
      h += '<tr id="gr-ch-' + escAttrVal(c.id) + '"><td style="white-space:nowrap;">' + escVal(grChDayLabel(c.day)) + '</td><td style="text-align:left;">' + escVal(grChName(c.staff_id)) + '</td>' +
        '<td>' + escVal((c.planned_letter || 'почивка') + (c.planned_code ? ' / ' + c.planned_code : '')) + '</td><td style="font-weight:700;">' + escVal(c.actual) + '</td>' +
        '<td style="text-align:left;">' + escVal(c.reason) + '</td><td style="font-size:11px;color:#64748b;">' + escVal(who) + '</td><td style="text-align:center;">' + tz + '</td>' +
        (edit || adm ? '<td style="white-space:nowrap;">' + (can ? '<button class="btn-sm" onclick="grChOpen(\'' + escAttrVal(c.id) + '\')">✏️</button> <button class="btn-sm" onclick="grChDelete(\'' + escAttrVal(c.id) + '\')">✕</button>'
          : '<span style="font-size:11px;color:#94a3b8;" title="Отразена в ТРЗ — само admin">🔒</span>') + '</td>' : '') + '</tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '<div style="font-size:11px;color:#64748b;margin-top:6px;">Една промяна за служител и ден. Отразената в ТРЗ се променя само от admin. Денят с промяна е оранжев в графика.</div>';
  return h + '</div>' + grPresenceCheckHtml();
}
function grChOpen(id){
  if(!grChCanEdit() && !(grMe && grMe.can_admin)) return;
  var c = id ? (grChanges || []).filter(function(x){ return x.id === id; })[0] : null;
  if(id && !c) return;
  var M = grCalc.month, rows = grChSnapRows();
  var staffId = c ? c.staff_id : (rows[0] ? rows[0].staff_id : ''), day = c ? c.day : 1;
  var days = ''; for(var d = 1; d <= M.days; d++) days += '<option value="' + d + '"' + (d === day ? ' selected' : '') + '>' + escVal(grChDayLabel(d)) + '</option>';
  var ppl = rows.map(function(r){ return '<option value="' + escAttrVal(r.staff_id) + '"' + (r.staff_id === staffId ? ' selected' : '') + '>' + escVal(r.full_name || r.short_name || '') + '</option>'; }).join('');
  var act = GR_CH_ACTUALS.map(function(a){ return '<option value="' + escAttrVal(a[0]) + '"' + (c && c.actual === a[0] ? ' selected' : '') + '>' + escVal(a[1]) + '</option>'; }).join('');
  var f = function(lbl, inner){ return '<label style="display:block;margin:6px 0;font-size:13px;">' + lbl + '<br>' + inner + '</label>'; };
  var old = document.getElementById('gr-ch-modal');
  if(old) old.parentNode.removeChild(old);
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg open" id="gr-ch-modal"><div class="modal"><h3>' + (c ? '✏️ Промяна' : '➕ Промяна в графика') + '</h3>' +
    f('Дата', '<select id="gr-ch-day" style="width:100%;" onchange="grChPlannedShow()">' + days + '</select>') +
    f('Служител', '<select id="gr-ch-staff" style="width:100%;" onchange="grChPlannedShow()">' + ppl + '</select>') +
    f('По график', '<b id="gr-ch-planned"></b>') +
    f('Реално *', '<select id="gr-ch-actual" style="width:100%;">' + (c ? '' : '<option value="">— избери —</option>') + act + '</select>') +
    f('Основание / документ № *', '<input id="gr-ch-reason" style="width:100%;" maxlength="300" value="' + escAttrVal(c ? c.reason : '') + '">') +
    '<div class="modal-actions"><button class="btn" onclick="closeModal(\'gr-ch-modal\')">Откажи</button><button class="btn btn-green" onclick="grChSave(\'' + escAttrVal(id || '') + '\')">Запиши</button></div></div></div>');
  grChPlannedShow();
}
function grChPlannedShow(){
  var el = document.getElementById('gr-ch-planned');
  if(el) el.textContent = grChPlanned(v('gr-ch-staff'), +v('gr-ch-day')).text;
}
function grChSave(id){
  var staffId = v('gr-ch-staff'), day = +v('gr-ch-day'), actual = v('gr-ch-actual'), reason = v('gr-ch-reason');
  if(!staffId || !day){ toast('Избери дата и служител.', '#dc2626'); return; }
  if(!actual){ toast('Избери какво е станало реално.', '#dc2626'); return; }
  if(!reason){ toast('Основанието / документът е задължително.', '#dc2626'); return; }
  var p = grChPlanned(staffId, day);
  if(grChSame(actual, p.letter)){ toast('Няма отклонение — по график е същото (' + (p.letter || 'почивка') + ').', '#dc2626'); return; }
  if(!grChLetterOk(staffId, day, actual)){ toast('Буквата „' + actual + '“ няма код за договора на служителя в този ден — избери друга.', '#dc2626'); return; }
  var payload = { store: grStore, month: grMonth, staff_id: staffId, day: day, actual: actual, reason: reason };
  if(id) payload.id = id;
  return grApi('changes_save', payload).then(function(res){
    if(!res.ok){ toast('Не е записана: ' + grErrText(res), '#dc2626'); return; }
    closeModal('gr-ch-modal');
    toast(id ? 'Промяната е обновена.' : 'Промяната е записана.');
    return grChLoad().then(function(){ grRender(); });
  });
}
function grChDelete(id){
  var c = (grChanges || []).filter(function(x){ return x.id === id; })[0];
  if(!c || !confirm('Да махна промяната за ' + grChName(c.staff_id) + ' на ' + grChDayLabel(c.day) + ' (' + c.actual + ')?')) return;
  return grApi('changes_delete', { store: grStore, month: grMonth, id: id }).then(function(res){
    if(!res.ok){ toast('Не е махната: ' + grErrText(res), '#dc2626'); return; }
    toast('Промяната е махната.');
    return grChLoad().then(function(){ grRender(); });
  });
}
function grChTrz(id, done){
  return grApi('changes_trz', { store: grStore, month: grMonth, id: id, done: !!done }).then(function(res){
    if(!res.ok) toast('Не е отметнато: ' + grErrText(res), '#dc2626');
    return grChLoad().then(function(){ grRender(); });
  });
}
/* Печат за подпис (ВТР чл. 19, ал. 4) — в #mod-print, както графикът; заглавката е от снимката. */
function grPrintChanges(){
  if(!grData || grData.status !== 'submitted' || !(grChanges || []).length) return;
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var snap = (grData.month_row && grData.month_row.snapshot) || {}, H = snap.header || {};
  var list = grChanges.slice().sort(function(a, b){ return a.day - b.day || grChName(a.staff_id).localeCompare(grChName(b.staff_id), 'bg'); });
  var css = '@page{size:A4 landscape;margin:8mm 10mm;}' +
    '#grc-wrap{font-family:Arial,sans-serif;color:#000;}' +
    '.grc-head{display:flex;justify-content:space-between;gap:8mm;font-size:9px;margin-bottom:2mm;}' +
    '.grc-title{text-align:center;font-size:13px;font-weight:700;margin:1mm 0;}' +
    '.grc-tbl{width:277mm;border-collapse:collapse;table-layout:fixed;font-size:8px;}' +
    '.grc-tbl th,.grc-tbl td{box-sizing:border-box;border:1px solid #333;padding:1mm 0.8mm;white-space:normal;word-wrap:break-word;vertical-align:middle;}' +
    '.grc-tbl tr:last-child td{border-bottom:1px solid #333;}' +
    '.grc-tbl th{background:#f1f5f9;font-weight:700;text-align:center;}' +
    '.grc-tbl tr{page-break-inside:avoid;break-inside:avoid;}' +
    '.grc-sign{display:flex;justify-content:space-between;gap:10mm;margin-top:6mm;font-size:9px;break-inside:avoid;}' +
    '@media print{#grc-page{padding:0 !important;}}';
  var cols = '<col style="width:7mm;"><col style="width:20mm;"><col style="width:48mm;"><col style="width:24mm;"><col style="width:20mm;"><col style="width:66mm;"><col style="width:42mm;"><col style="width:50mm;">';
  var rows = list.map(function(c, i){
    return '<tr><td style="text-align:center;">' + (i + 1) + '</td><td style="text-align:center;">' + escVal(grChDayLabel(c.day)) + '</td><td>' + escVal(grChName(c.staff_id)) + '</td>' +
      '<td style="text-align:center;">' + escVal((c.planned_letter || 'почивка') + (c.planned_code ? ' / ' + c.planned_code : '')) + '</td><td style="text-align:center;font-weight:700;">' + escVal(c.actual) + '</td>' +
      '<td>' + escVal(c.reason) + '</td><td>' + escVal(c.created_by || '') + '</td><td></td></tr>';
  }).join('');
  wrap.innerHTML = '<style>' + css + '</style>' +
    '<div id="grc-page" style="padding:12px 12px 30px;">' +
      '<div class="no-print" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
        '<b style="font-size:16px;">🖨 Промени в графика</b><span style="flex:1"></span>' +
        '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
        '<button onclick="showModule(\'grafik\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
      '</div>' +
      '<div id="grc-wrap">' +
        '<div class="grc-head"><div>Предприятие: <b>' + escVal(H.company_name || '') + '</b>, ЕИК ' + escVal(H.company_eik || '') + '<br>Адрес: ' + escVal(H.company_addr || '') + '<br>Обект: <b>' + escVal(H.store_blank_name || grStore) + '</b></div>' +
          '<div style="text-align:right;">Утвърдил: ' + escVal(H.approver || '') + '<br>подпис и печат: ………………</div></div>' +
        '<div class="grc-title" id="grc-title">ПРОМЕНИ В ГРАФИКА ЗА ЯВЯВАНЕ НА РАБОТА</div>' +
        '<div style="text-align:center;font-size:10px;margin-bottom:2mm;">за месец ' + escVal(grMonthLabel(grMonth)) + ' · актуализация по ВТР, чл. 19, ал. 4</div>' +
        '<table class="grc-tbl" id="grc-tbl"><colgroup>' + cols + '</colgroup><thead><tr><th>№</th><th>Дата</th><th>Служител</th><th>По график</th><th>Реално</th><th>Основание / документ №</th><th>Въведено от</th><th>Подпис на служителя</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="grc-sign"><div id="grc-made">Изготвил: ………………………… (ръководител обект)</div><div id="grc-appr">Утвърдил: ' + escVal(H.approver || '') + ' ………………………… (управител)</div></div>' +
      '</div>' +
    '</div>';
  showModule('print');
}

/* ─── ПРИСЪСТВЕНА ФОРМА (П3, план одобрен 05.11.2026) ─────────────────
   = подаденият график (снимката) + „Промени“ — изчисленията са в GrafikEngine.presence.
   Печат (A4 хоризонтално, 1 лист до 43 реда — мерено в PDF) и Excel за ТРЗ по модела на графика.
   „Съставил“ — влезлият (решение е). Само за подаден месец. */
var GR_PRESENCE_LEGEND = 'Оранжево = ден с отклонение от „Промени“. Легенда неявявания: О платен отпуск · М майчинство · Б болест · Д държавни задължения · А с разрешение на администрацията · С самоотлъчка · Н неплатен отпуск';
var GR_PRESENCE_COLS = [['О', 'Платен отпуск'], ['М', 'Майчинство'], ['Б', 'Болест'], ['Д', 'Изпълн. държ. задълж.'], ['А', 'С разреш. на админ.'], ['С', 'Самоотлъчка'], ['Н', 'Неплатен отпуск']];
function grPresenceButtons(){
  return '<button class="btn-sm" onclick="grPrintPresence()" title="График + промени — A4 хоризонтално">🖨 Присъствена</button>' +
    '<button class="btn-sm" onclick="grExportPresence()" title="Присъствената форма — Excel за ТРЗ">📥 Присъствена Excel</button>';
}
function grPresenceModel(){
  if(!grData || grData.status !== 'submitted' || !grData.month_row || !grData.month_row.snapshot) return null;
  var snap = grData.month_row.snapshot, H = snap.header || {};
  var p = GrafikEngine.presence(grData.setup || {}, grMonth, snap.rows || [], grChanges || []);
  var M = p.month;
  return { p: p, M: M, header: { company: H.company_name || '', eik: H.company_eik || '', addr: H.company_addr || '', store: H.store_blank_name || grStore,
    compiledBy: (grMe && grMe.name) || '', monthText: GR_MONTHS[M.month - 1] + ' ' + M.year + ' г.', workDays: M.workDays, norm: M.norm, storeName: grStore, ym: grMonth } };
}
// Като Excel за ТРЗ: непознат код или буква без код — файлът не се прави, а се казва къде.
function grPresenceBlocked(m){
  var bad = [];
  m.p.rows.forEach(function(r){ r.issues.forEach(function(t){ bad.push(r.name + ' — ' + t); }); });
  if(!bad.length) return false;
  toast('Присъствената не се прави: ' + bad.slice(0, 3).join('; ') + (bad.length > 3 ? ' и още ' + (bad.length - 3) : '') + '.', '#dc2626');
  return true;
}
function grPresenceCell(c){ return typeof c.v === 'number' ? grHrsTxt(c.v) : (c.v || ''); }
function grPrintPresence(){
  var m = grPresenceModel();
  if(!m || grPresenceBlocked(m)) return;
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var M = m.M, H = m.header, nd = M.days, dayCls = function(d){ return M.holiday[d] ? 'grq-hol' : M.dow[d] >= 6 ? 'grq-we' : ''; };
  var css = '@page{size:A4 landscape;margin:8mm 10mm;}' +
    '#grq-wrap{font-family:Arial,sans-serif;color:#000;}' +
    '.grq-head{display:flex;justify-content:space-between;gap:8mm;font-size:9px;margin-bottom:1.5mm;}' +
    '.grq-title{text-align:center;font-size:13px;font-weight:700;margin:1mm 0;}' +
    '.grq-tbl{width:277mm;border-collapse:collapse;table-layout:fixed;font-size:7px;}' +
    '.grq-tbl th,.grq-tbl td{box-sizing:border-box;border:1px solid #333;padding:0.15mm 0.2mm;white-space:normal;word-wrap:break-word;text-align:center;vertical-align:middle;overflow:hidden;}' +
    '.grq-tbl tr:last-child td{border-bottom:1px solid #333;}' +
    '.grq-tbl th{background:#f1f5f9;font-weight:700;}' +
    '.grq-tbl td.grq-name{text-align:left;}' +
    '.grq-we{background:#e2e8f0;}.grq-hol{background:#fecaca;}.grq-chg{background:' + GR_CH_FILL + ';}' +
    '#grq-foot{break-inside:avoid;page-break-inside:avoid;font-size:7px;margin-top:2mm;}' +
    '@media print{.grq-tbl tr{page-break-inside:avoid;}#grq-page{padding:0 !important;}}';
  var cols = '<col style="width:5mm;"><col style="width:35mm;"><col style="width:24mm;">' + Array.apply(null, Array(nd)).map(function(){ return '<col style="width:5mm;">'; }).join('') +
    '<col style="width:6mm;"><col style="width:8mm;">' + GR_PRESENCE_COLS.map(function(){ return '<col style="width:4.5mm;">'; }).join('') + '<col style="width:8mm;">';
  var head = '<tr><th rowspan="2">№</th><th rowspan="2">Трите имена</th><th rowspan="2">Длъжност</th>';
  for(var d = 0; d < nd; d++) head += '<th class="' + dayCls(d) + '">' + (d + 1) + '</th>';
  head += '<th rowspan="2">дни</th><th rowspan="2">часове</th>' + GR_PRESENCE_COLS.map(function(c){ return '<th rowspan="2" title="' + escAttrVal(c[1]) + '">' + escVal(c[0]) + '</th>'; }).join('') +
    '<th rowspan="2">общо ч. вкл. О/Б/Н</th></tr><tr>';
  for(d = 0; d < nd; d++) head += '<th class="' + dayCls(d) + '">' + GR_DOW1[M.dow[d]] + '</th>';
  head += '</tr>';
  var body = m.p.rows.map(function(r, i){
    var h = '<tr class="grq-row"><td>' + (i + 1) + '</td><td class="grq-name">' + escVal(r.name) + '</td><td>' + escVal(r.title) + '</td>';
    r.cells.forEach(function(c, d){ h += '<td class="' + (c.change ? 'grq-chg' : dayCls(d)) + '">' + escVal(grPresenceCell(c)) + '</td>'; });
    return h + '<td>' + r.days + '</td><td>' + grHrsTxt(r.hours) + '</td>' + GR_PRESENCE_COLS.map(function(c){ return '<td>' + r[c[0]] + '</td>'; }).join('') + '<td>' + grHrsTxt(r.total) + '</td></tr>';
  }).join('');
  var T = m.p.totals;
  body += '<tr class="grq-total"><td colspan="' + (3 + nd) + '" style="text-align:right;font-weight:700;">ВСИЧКО за обекта:</td><td>' + T.days + '</td><td>' + grHrsTxt(T.hours) + '</td>' +
    GR_PRESENCE_COLS.map(function(c){ return '<td>' + T[c[0]] + '</td>'; }).join('') + '<td>' + grHrsTxt(T.total) + '</td></tr>';
  wrap.innerHTML = '<style>' + css + '</style>' +
    '<div id="grq-page" style="padding:12px 12px 30px;">' +
      '<div class="no-print" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
        '<b style="font-size:16px;">🖨 Присъствена форма</b><span style="flex:1"></span>' +
        '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
        '<button onclick="showModule(\'grafik\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
      '</div>' +
      '<div id="grq-wrap">' +
        '<div class="grq-head"><div>Предприятие: <b>' + escVal(H.company) + '</b>, ЕИК ' + escVal(H.eik) + '<br>Адрес: ' + escVal(H.addr) + '<br>Обект: <b>' + escVal(H.store) + '</b></div>' +
          '<div style="text-align:right;" id="grq-made">Съставил: ' + escVal(H.compiledBy) + '<br>(име и фамилия)<br>………………………… (подпис)</div></div>' +
        '<div class="grq-title" id="grq-title">ПРИСЪСТВЕНА ФОРМА</div>' +
        '<div style="text-align:center;font-size:10px;margin-bottom:2mm;">за месец ' + escVal(H.monthText) + ' · ' + H.workDays + ' раб. дни · ' + H.norm + ' часа</div>' +
        '<table class="grq-tbl" id="grq-tbl"><colgroup>' + cols + '</colgroup><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
        '<div id="grq-foot">' + escVal(GR_PRESENCE_LEGEND) + '</div>' +
      '</div>' +
    '</div>';
  showModule('print');
}
/* Excel за ТРЗ — като файла на графика: без защита, формулите в реда, празният ден е празна клетка. */
function grBuildPresenceWorkbook(m, ExcelJS){
  var M = m.M, H = m.header, nd = M.days;
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet(H.ym.slice(5, 7) + '.' + H.ym.slice(0, 4), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }, printTitlesRow: '5:11' }
  });
  var D0 = 3, DL = D0 + nd - 1, cDays = DL + 1, cHrs = DL + 2, cL0 = DL + 3, cTot = cL0 + GR_PRESENCE_COLS.length;
  var C = function(i){ return grColName(i); }, thin = { style: 'thin' }, box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 22 }].concat(Array.apply(null, Array(nd)).map(function(){ return { width: 5.6 }; }))
    .concat([{ width: 7 }, { width: 8 }]).concat(GR_PRESENCE_COLS.map(function(){ return { width: 6 }; })).concat([{ width: 9 }]);
  var put = function(addr, v, st){ var c = ws.getCell(addr); c.value = v; if(st){ for(var k in st) c[k] = st[k]; } return c; };
  var bold = { font: { name: 'Arial', size: 9, bold: true } }, norm9 = { font: { name: 'Arial', size: 9 } };
  ws.mergeCells('A1:C2'); put('A1', 'Предприятие: ' + H.company + ', ЕИК ' + H.eik, { font: { name: 'Arial', size: 9, bold: true }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells(C(D0) + '1:' + C(DL) + '2');
  put(C(D0) + '1', 'ПРИСЪСТВЕНА ФОРМА ' + H.workDays + ' раб.дни/ ' + H.norm + ' часа', { font: { name: 'Arial', size: 12, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(C(cDays) + '1:' + C(cTot) + '4');
  put(C(cDays) + '1', 'Съставил: ' + H.compiledBy + '\n(име и фамилия)\n………………… (подпис)', { font: { name: 'Arial', size: 9, bold: true }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells('A3:C3'); put('A3', 'Адрес: ' + H.addr, norm9);
  ws.mergeCells('A4:C4'); put('A4', 'Обект: ' + H.store, bold);
  ws.mergeCells(C(D0) + '4:' + C(DL) + '4'); put(C(D0) + '4', 'за месец ' + H.monthText, { font: { name: 'Arial', size: 10, bold: true }, alignment: { horizontal: 'center' } });
  var hd = { font: { name: 'Arial', size: 8, bold: true }, alignment: { wrapText: true, horizontal: 'center', vertical: 'middle' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GR_FILL.head } }, border: box };
  [['A', '№'], ['B', 'Трите имена по документ за самоличност'], ['C', 'Длъжност']].forEach(function(x){ ws.mergeCells(x[0] + '5:' + x[0] + '11'); put(x[0] + '5', x[1], hd); });
  ws.mergeCells(C(D0) + '5:' + C(DL) + '6'); put(C(D0) + '5', 'Дни на месеца', hd);
  ws.mergeCells(C(cDays) + '5:' + C(cHrs) + '6'); put(C(cDays) + '5', 'Явявания на работа', hd);
  ws.mergeCells(C(cL0) + '5:' + C(cTot - 1) + '6'); put(C(cL0) + '5', 'Неявявания', hd);
  ws.mergeCells(C(cDays) + '7:' + C(cDays) + '11'); put(C(cDays) + '7', 'дни', hd);
  ws.mergeCells(C(cHrs) + '7:' + C(cHrs) + '11'); put(C(cHrs) + '7', 'часове', hd);
  GR_PRESENCE_COLS.forEach(function(x, i){ var col = C(cL0 + i); ws.mergeCells(col + '7:' + col + '10'); put(col + '7', x[1], hd); put(col + '11', x[0], hd); });
  ws.mergeCells(C(cTot) + '5:' + C(cTot) + '11'); put(C(cTot) + '5', 'общо часове вкл. О/Б/Н (по договора)', hd);
  for(var d = 0; d < nd; d++){
    var col = C(D0 + d), w = M.dow[d], dayFill = M.holiday[d] ? GR_FILL.holiday : (w >= 6 ? GR_FILL.weekend : GR_FILL.head);
    var dh = { font: { name: 'Arial', size: 8, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border: box, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: dayFill } } };
    ws.mergeCells(col + '7:' + col + '9'); put(col + '7', '', dh);
    put(col + '10', GR_DOW1[w], dh); put(col + '11', d + 1, dh);
  }
  var r0 = 12, num = { font: { name: 'Arial', size: 9 }, border: box, alignment: { horizontal: 'center', vertical: 'middle' } };
  m.p.rows.forEach(function(r, i){
    var row = r0 + i, rng = C(D0) + row + ':' + C(DL) + row, base = { font: { name: 'Arial', size: 9 }, border: box, alignment: { vertical: 'middle' } };
    put('A' + row, i + 1, base); put('B' + row, r.name, base);
    put('C' + row, r.title, { font: { name: 'Arial', size: 8 }, border: box, alignment: { vertical: 'middle', wrapText: true } });
    r.cells.forEach(function(c, d){
      var cell = ws.getCell(C(D0 + d) + row), w = M.dow[d];
      if(c.v !== '') cell.value = c.v;                 // празен ден — наистина празна клетка
      cell.font = { name: 'Arial', size: 8 }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = box;
      var f = c.change ? 'FF' + GR_CH_FILL.slice(1) : (M.holiday[d] ? GR_FILL.holiday : (w >= 6 ? GR_FILL.weekend : null));
      if(f) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f } };
      if(c.change) cell.note = 'промяна: ' + (c.change.planned_letter || 'почивка') + ' → ' + c.change.actual + (c.change.reason ? ' (' + c.change.reason + ')' : '');
    });
    put(C(cDays) + row, { formula: 'COUNT(' + rng + ')', result: r.days }, num);
    put(C(cHrs) + row, { formula: 'SUM(' + rng + ')', result: r.hours }, num);
    GR_PRESENCE_COLS.forEach(function(x, j){ put(C(cL0 + j) + row, { formula: 'COUNTIF(' + rng + ',"' + x[0] + '")', result: r[x[0]] }, num); });
    var cO = C(cL0), cB = C(cL0 + 2), cN = C(cL0 + 6);
    put(C(cTot) + row, { formula: C(cHrs) + row + '+' + r.hpd + '*(' + cO + row + '+' + cB + row + '+' + cN + row + ')', result: r.total }, num);
  });
  var last = r0 + m.p.rows.length - 1, tr = last + 1, T = m.p.totals;
  var tot = { font: { name: 'Arial', size: 9, bold: true }, border: box, alignment: { horizontal: 'center', vertical: 'middle' } };
  var sum = function(col, v){ return { formula: m.p.rows.length ? 'SUM(' + col + r0 + ':' + col + last + ')' : '0', result: v }; };
  ws.mergeCells('A' + tr + ':' + C(DL) + tr); put('A' + tr, 'ВСИЧКО за обекта:', { font: { name: 'Arial', size: 9, bold: true }, border: box, alignment: { horizontal: 'right' } });
  put(C(cDays) + tr, sum(C(cDays), T.days), tot); put(C(cHrs) + tr, sum(C(cHrs), T.hours), tot);
  GR_PRESENCE_COLS.forEach(function(x, j){ put(C(cL0 + j) + tr, sum(C(cL0 + j), T[x[0]]), tot); });
  put(C(cTot) + tr, sum(C(cTot), T.total), tot);
  put('A' + (tr + 2), GR_PRESENCE_LEGEND, norm9);
  return wb;
}
function grPresenceFileName(m){ return 'Присъствена_' + String(m.header.storeName || '').replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + m.header.ym + '.xlsx'; }
function grExportPresence(){
  var m = grPresenceModel();
  if(!m || grPresenceBlocked(m)) return;
  return grWithExcelJS().then(function(X){
    var wb = grBuildPresenceWorkbook(m, X);
    return wb.xlsx.writeBuffer().then(function(buf){ grDownload(buf, grPresenceFileName(m)); toast('📥 ' + grPresenceFileName(m)); });
  }).catch(function(e){ toast('Файлът не се направи: ' + (e && e.message ? e.message : e), '#dc2626'); });
}
/* ПРОВЕРКА L / M / N — реално (присъствената): реални часове, реално − норма, макс. дни в 7,
   правилата по ВТР чл. 19 върху реалните дни. Под „Промени“, сгъваемо. */
function grPresenceCheckHtml(){
  var m = grPresenceModel();
  if(!m) return '';
  var bad = m.p.rows.filter(function(r){ return r.realDiff !== 0 || r.maxIn7 > 5 || r.warnings.length || r.issues.length; }).length;
  var h = '<details class="card" id="gr-real"' + (bad ? ' open' : '') + '><summary style="cursor:pointer;font-weight:600;">Проверка — реално (присъствената)' + (bad ? ' · <span style="color:#dc2626;">' + bad + ' за внимание</span>' : ' · всичко наред') + '</summary>' +
    '<div class="tbl-wrap"><table id="gr-real-tbl"><thead><tr><th style="text-align:left;">Служител</th><th>Реални часове</th><th>Реално − норма</th><th>Макс. дни в 7</th><th style="text-align:left;">ВТР чл. 19 (реално)</th></tr></thead><tbody>';
  m.p.rows.forEach(function(r){
    h += '<tr><td style="text-align:left;">' + escVal(r.name) + '</td><td>' + grHrsTxt(r.hours) + '</td>' +
      '<td class="gr-real-diff" style="' + (r.realDiff !== 0 ? 'color:#dc2626;font-weight:700;' : 'color:#16a34a;') + '">' + (r.realDiff > 0 ? '+' : '') + grHrsTxt(r.realDiff) + '</td>' +
      '<td style="' + (r.maxIn7 > 5 ? 'color:#dc2626;font-weight:700;' : '') + '">' + r.maxIn7 + '</td>' +
      '<td style="text-align:left;font-size:11px;">' + (r.issues.length ? '<span class="gr-real-issue" style="color:#dc2626;font-weight:700;">' + escVal(r.issues.join('; ')) + '</span>' + (r.warnings.length ? '; ' : '') : '') +
        escVal(r.warnings.map(function(w){ return w.text; }).join('; ')) + '</td></tr>';
  });
  return h + '</tbody></table></div></details>';
}

/* ─── Персонал ─────────────────────────────────────────── */
function grStaffHtml(){
  var list = (grData.staff || []).slice().sort(function(a, b){
    return (a.left_on ? 1 : 0) - (b.left_on ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0) || String(a.short_name).localeCompare(String(b.short_name), 'bg');
  });
  var edit = grCanEditStaff();
  var h = '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><b>Персонал — ' + escVal(grStore) + '</b><span style="color:#64748b;font-size:12px;">' + list.length + ' души</span><span style="flex:1"></span>' +
    (grCanAddSector() ? '<button class="btn-sm" onclick="grSectorOpen()" title="Нов сектор в списъка на магазина">➕ Сектор</button>' : '') +
    (edit ? '<button class="btn btn-green" onclick="grStaffOpen(\'\')">➕ Нов служител</button>' : '') + '</div>';
  /* tbl-compact е на обвивката (както навсякъде в портала): от 1200px тя сваля скрола и
     заглавието залепва под лентата (index.html, .tbl-compact thead th). Върху самата <table>
     вътре в .tbl-wrap заглавието залепваше на --nav-h ВЪТРЕ в кутията — върху първите редове. */
  h += '<div class="tbl-wrap tbl-compact tbl-auto" id="gr-staff-wrap"><table id="gr-staff"><thead><tr><th>Име в графика</th><th>Три имена</th><th>Длъжност</th><th>Позиция</th><th>Сектор</th><th>Ч./ден</th><th>Назначен</th><th>Напуснал</th>' + (edit ? '<th></th>' : '') + '</tr></thead><tbody>';
  list.forEach(function(s){
    h += '<tr id="gr-st-' + escAttrVal(s.id) + '" style="' + (s.left_on ? 'color:#94a3b8;' : '') + '"><td>' + escVal(s.short_name) + '</td><td>' + escVal(s.full_name) + '</td><td>' + escVal(s.contract_title || '') + '</td><td>' + escVal(s.position || '') + '</td><td>' + escVal(s.sector_id ? grSector(s) : '') + '</td><td>' + escVal(String(+s.hours_per_day || 8)) + '</td><td>' + (s.hired_on ? escVal(fmtDate(s.hired_on)) : '') + '</td><td>' + (s.left_on ? escVal(fmtDate(s.left_on)) : '') + '</td>' +
      (edit ? '<td><button class="btn-sm" onclick="grStaffOpen(\'' + escAttrVal(s.id) + '\')">✏️</button></td>' : '') + '</tr>';
  });
  if(!list.length) h += '<tr><td colspan="9" style="color:#64748b;padding:12px;">Няма въведен персонал.</td></tr>';
  return h + '</tbody></table></div></div>';
}
/* Персоналът се пише от тези, които пишат графика (manager, регионален, admin). */
function grCanEditStaff(){
  if(!grMe) return false;
  return (grMe.stores || []).some(function(s){ return s.name === grStore && s.can_edit; });
}
function grStaffOpen(id){
  if(!grCanEditStaff()) return;
  var s = id ? grStaffById(id) : null;
  if(id && !s) return;
  s = s || { short_name: '', full_name: '', contract_title: '', position: '', sector_id: null, hours_per_day: 8, hired_on: '', left_on: '', note: '', sort_order: ((grData.staff || []).length + 1) * 10 };
  var old = document.getElementById('gr-staff-modal');
  if(old) old.parentNode.removeChild(old);
  var f = function(lbl, inner){ return '<label style="display:block;margin:6px 0;font-size:13px;">' + lbl + '<br>' + inner + '</label>'; };
  var inp = function(idx, val, type){ return '<input id="' + idx + '" type="' + (type || 'text') + '" value="' + escAttrVal(val == null ? '' : String(val)) + '" style="width:100%;">'; };
  var h = '<div class="modal-bg open" id="gr-staff-modal"><div class="modal"><h3>' + (id ? '✏️ Служител' : '➕ Нов служител') + '</h3>' +
    f('Име в графика *', inp('gr-sf-short', s.short_name)) +
    f('Три имена (по документ) *', inp('gr-sf-full', s.full_name)) +
    f('Длъжност по договор', inp('gr-sf-title', s.contract_title)) +
    f('Позиция в графика', '<select id="gr-sf-pos" style="width:100%;"><option value=""></option>' + GR_POSITIONS.map(function(p){ return '<option' + (p === s.position ? ' selected' : '') + '>' + escVal(p) + '</option>'; }).join('') + '</select>') +
    f('Сектор', '<select id="gr-sf-sector" style="width:100%;"><option value="">— без сектор —</option>' + grSectors().map(function(x){
      return '<option value="' + escAttrVal(x.id) + '"' + (x.id === s.sector_id ? ' selected' : '') + '>' + escVal(x.name) + '</option>';
    }).join('') + '</select>' + (s.sector && !s.sector_id ? '<span style="font-size:11px;color:#64748b;">в бланката: ' + escVal(s.sector) + '</span>' : '')) +
    f('Часове по договор на ден', '<select id="gr-sf-hpd" style="width:100%;">' + [8, 7, 6, 5, 4].map(function(n){ return '<option value="' + n + '"' + (+s.hours_per_day === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>') +
    f('Назначен на', inp('gr-sf-hired', s.hired_on || '', 'date')) +
    f('Напуснал на', inp('gr-sf-left', s.left_on || '', 'date')) +
    f('Бележка', inp('gr-sf-note', s.note)) +
    f('Ред в графика', inp('gr-sf-sort', s.sort_order || 0, 'number')) +
    '<div class="modal-actions"><button class="btn" onclick="closeModal(\'gr-staff-modal\')">Откажи</button><button class="btn btn-green" onclick="grStaffSave(\'' + escAttrVal(id || '') + '\')">Запиши</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', h);
}
function grStaffSave(id){
  var v = function(k){ var e = document.getElementById(k); return e ? String(e.value).trim() : ''; };
  var fields = {
    short_name: v('gr-sf-short'), full_name: v('gr-sf-full'), contract_title: v('gr-sf-title') || null,
    position: v('gr-sf-pos') || null, sector_id: v('gr-sf-sector') || null, hours_per_day: +v('gr-sf-hpd') || 8,
    hired_on: v('gr-sf-hired') || null, left_on: v('gr-sf-left') || null, note: v('gr-sf-note') || null, sort_order: parseInt(v('gr-sf-sort'), 10) || 0
  };
  if(!fields.short_name || !fields.full_name){ toast('Име в графика и три имена са задължителни.', '#dc2626'); return; }
  if(fields.hired_on && fields.left_on && fields.left_on < fields.hired_on){ toast('Напуснал е преди назначаването.', '#dc2626'); return; }
  var payload = { store: grStore, fields: fields };
  if(id) payload.id = id;
  return grApi('staff_save', payload).then(function(res){
    if(!res.ok){ toast('Не е записан: ' + grErrText(res), '#dc2626'); return; }
    closeModal('gr-staff-modal');
    toast(id ? 'Служителят е обновен.' : 'Служителят е добавен.');
    return grLoadMonth();
  });
}

/* ─── Нов сектор (admin / регионален) ──────────────────── */
function grSectorOpen(){
  if(!grCanAddSector()) return;
  var old = document.getElementById('gr-sector-modal');
  if(old) old.parentNode.removeChild(old);
  var have = grSectors().map(function(x){ return escVal(x.name); }).join(', ') || 'няма';
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg open" id="gr-sector-modal"><div class="modal"><h3>➕ Нов сектор — ' + escVal(grStore) + '</h3>' +
    '<div class="modal-sub" style="font-size:12px;">Сега: ' + have + '</div>' +
    '<label style="display:block;margin:6px 0;font-size:13px;">Име<br><input id="gr-sec-name" type="text" maxlength="60" style="width:100%;"></label>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal(\'gr-sector-modal\')">Откажи</button><button class="btn btn-green" onclick="grSectorSave()">Добави</button></div></div></div>');
}
function grSectorSave(){
  var el = document.getElementById('gr-sec-name');
  var name = el ? String(el.value).trim().replace(/\s+/g, ' ') : '';
  if(!name){ toast('Въведи име на сектора.', '#dc2626'); return; }
  var dup = grSectors().some(function(x){ return x.name.toLowerCase() === name.toLowerCase(); });
  if(dup){ toast('Секторът „' + name + '“ вече го има.', '#dc2626'); return; }
  return grApi('sector_save', { store: grStore, name: name }).then(function(res){
    if(!res.ok){ toast('Не е добавен: ' + grErrText(res), '#dc2626'); return; }
    closeModal('gr-sector-modal');
    toast('Секторът „' + name + '“ е добавен.');
    return grLoadMonth();
  });
}

/* ─── 1д: файл за ТРЗ (Excel) и печат „График за явяване на работа“ ────────
   Модел (grExportModel) → два изхода от едни и същи данни: grBuildTrzWorkbook (ExcelJS,
   по образеца docs/grafik/график.xlsx) и grPrintGrafik (#mod-print, A4 хоризонтално).
   Подаден месец — от снимката при „Подай“ (замразени кодове и заглавка); чернова — от
   текущото изчисление, с „ЧЕРНОВА“. Магазинът не попълва нищо.
   Спира (без файл / печат) при: липсващи данни за дружеството; код извън ВТР за месеца;
   а за ПОДАДЕН месец — и при служител извън нормата или „свободни часове“ без код.
   В черновата последните две се оцветяват червено с бележка (решение на Тенчо, 04.11.2026). */
var GR_EXCELJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
var GR_DOW1 = ['', 'П', 'В', 'С', 'Ч', 'П', 'С', 'Н'];
var GR_FILL = { weekend: 'FFE2E8F0', holiday: 'FFFECACA', trip: 'FFFED7AA', bad: 'FFFCA5A5', offRow: 'FFFEE2E2', head: 'FFF1F5F9' };

function grWithExcelJS(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise(function(res, rej){
    var sc = document.createElement('script');
    sc.src = GR_EXCELJS_SRC;
    sc.onload = function(){ window.ExcelJS ? res(window.ExcelJS) : rej(new Error('ExcelJS не се зареди')); };
    sc.onerror = function(){ rej(new Error('ExcelJS не се зареди')); };
    document.head.appendChild(sc);
  });
}
/* Сваляне — отделно, за да се подменя в теста. */
function grDownload(buf, name){
  var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.parentNode && a.parentNode.removeChild(a); }, 1000);
}
function grColName(n){ var s = ''; n++; while(n > 0){ var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function grNum(x){ return Math.round(x * 10) / 10; }
function grHrsTxt(x){ return String(grNum(x)).replace('.', ','); }

/* Ред от снимката без нито един ден. Нормата — от снимката (r.norm, от 04.11.2026); в по-старите
   снимки я няма → работните дни на месеца × договора. */
function grSnapEmpty(r, hd, M){
  if((r.codes || []).some(function(c){ return !!c; }) || hd.length) return '';
  var norm = typeof r.norm === 'number' ? r.norm : M.workDays * (+r.hours_per_day || 8);
  return norm ? 'няма ред в графика за месеца (0 ч. вместо ' + grHrsTxt(norm) + ' ч.)' : '';
}
function grExportModel(){
  if(!grData || !grCalc) return null;
  var setup = grData.setup || {}, P = GrafikEngine.prepare(setup), M = GrafikEngine.monthInfo(grMonth, setup.extra_days);
  var mr = grData.month_row || null, snap = grData.status === 'submitted' && mr && mr.snapshot ? mr.snapshot : null;
  var draft = !snap, blocking = [];
  /* Заглавка — от снимката (подаден) или от setup (чернова). */
  var h = snap && snap.header ? snap.header : {};
  var company = snap ? { name: h.company_name, eik: h.company_eik, addr: h.company_addr } : (setup.company || {});
  var store = snap ? { blank_name: h.store_blank_name } : (setup.store || {});
  var approver = snap ? h.approver : setup.approver;
  var missing = (setup.missing || []).slice();
  if(!company.name && missing.indexOf('име на дружеството') < 0) missing.push('име на дружеството');
  if(!company.eik) missing.push('ЕИК на дружеството');
  if(!company.addr && missing.indexOf('адрес на дружеството') < 0) missing.push('адрес на дружеството');
  if(!store.blank_name && missing.indexOf('обект → дружество') < 0) missing.push('име на обекта за бланката');
  if(!approver && missing.indexOf('утвърдил / ВТР') < 0) missing.push('утвърдил');
  if(missing.length) blocking.push('Липсват данни за дружеството — админ: ' + missing.join(', ') + '.');
  /* Кодовете за формулите: всички работни за месеца + К (часовете на пълната смяна). */
  var fcodes = [];
  (setup.codes || []).forEach(function(c){
    var k = P.codes[c.code];
    if(!k || k.kind === 'absence') return;
    var hrs = GrafikEngine.codeHours(P, c.code);
    if(hrs > 0) fcodes.push({ code: c.code, hours: hrs, kind: k.kind });
  });
  var src = snap ? (snap.rows || []).map(function(r){
    var hd = (r.notes || []).filter(function(n){ return n.type === 'hours'; }).map(function(n){ return { day: n.day, hours: parseFloat(n.text) || 0 }; });
    return { name: r.full_name || r.short_name || '', title: r.contract_title || '', hpd: +r.hours_per_day || 8, codes: (r.codes || []).slice(0, M.days),
      official: +r.official || 0, target: +r.target || 0, diff: +r.diff || 0, hoursDays: hd,
      empty: grSnapEmpty(r, hd, M) };
  }) : grCalc.rows.map(function(x){
    var L = (grRows[x.staff.id] || { letters: [] }).letters || [], hd = [];
    for(var d = 0; d < M.days; d++) if(GrafikEngine.isHours(L[d] || '')) hd.push({ day: d + 1, hours: +L[d] });
    return { name: x.staff.full_name || x.staff.short_name || '', title: x.staff.contract_title || '', hpd: +x.staff.hours_per_day || 8,
      codes: x.codes.slice(0, M.days), official: x.official, target: x.target, diff: x.diff, hoursDays: hd, empty: grEmptyRow(x) };
  });
  var rows = src.map(function(r){
    var cell = {}, o = 0, b = 0, n = 0, days = 0;
    r.codes.forEach(function(c, i){
      if(!c) return;
      var k = P.codes[c];
      if(!k){ blocking.push(r.name + ': ' + (i + 1) + '-ви — код „' + c + '“ не е във ВТР за месеца.'); return; }
      if(c === 'О') o++; else if(c === 'Б') b++; else if(c === 'Н') n++;
      if(k.kind !== 'absence') days++;
      if(k.kind === 'trip') cell[i + 1] = { fill: GR_FILL.trip, note: 'командировка — ' + grHrsTxt(GrafikEngine.codeHours(P, c)) + ' ч. (пълната смяна) до отговор от ТРЗ' };
    });
    r.hoursDays.forEach(function(x){
      if(snap) blocking.push(r.name + ': ' + x.day + '-ви — ' + grHrsTxt(x.hours) + ' свободни ч. без код.');
      else cell[x.day] = { fill: GR_FILL.bad, note: grHrsTxt(x.hours) + ' свободни ч. — сложи код', text: grHrsTxt(x.hours) + ' ч.' };
    });
    var off = r.diff !== 0;
    if(r.empty && snap) blocking.push(r.name + ': ' + r.empty + '.');
    if(off && snap) blocking.push(r.name + ': ' + grHrsTxt(r.official) + ' ч. вместо ' + grHrsTxt(r.target) + ' ч. — извън нормата.');
    return { name: r.name, title: r.title, hpd: r.hpd, codes: r.codes, cell: cell, days: days, hours: r.official, o: o, b: b, n: n,
      total: r.official + (o + b + n) * r.hpd, off: r.empty ? r.empty : off ? (grHrsTxt(r.official) + ' ч. вместо ' + grHrsTxt(r.target) + ' ч. — извън нормата') : '' };
  });
  var season = setup.season || (h.season || ''), sl = (setup.season_label || season);
  /* Легендата — за ДВАТА сезона, както под графика в бланката (решение 05.11.2026): лятото и
     зимата поотделно (кодовете без сезон — и в двете), после О / Н / Б. */
  var bySeason = function(ch){
    return (setup.codes || []).filter(function(c){
      var k = P.codes[c.code];
      return k && k.kind === 'work' && c.legend && (!c.seasons || !c.seasons.length || c.seasons.indexOf(ch) >= 0);
    }).map(function(c){ return c.code + ' – ' + c.legend; });
  };
  var absences = [];
  ['О', 'Н', 'Б'].forEach(function(c){ var x = (setup.codes || []).filter(function(k){ return k.code === c; })[0]; if(x && x.legend) absences.push(c + ' – ' + x.legend); });
  var legend = [
    { title: GR_LEGEND_TITLE.Л, items: bySeason('Л') },
    { title: GR_LEGEND_TITLE.З, items: bySeason('З') },
    { title: '', items: absences }
  ];
  return { draft: draft, blocking: blocking, M: M, fcodes: fcodes, rows: rows, legend: legend,
    header: { company: company.name || '', eik: company.eik || '', addr: company.addr || '', store: store.blank_name || '', approver: approver || '',
      compiledBy: snap ? (h.compiled_by || '') : '', monthText: GR_MONTHS[M.month - 1] + ' ' + M.year + ' г.', seasonLabel: sl, workDays: M.workDays, norm: M.norm,
      storeName: grStore, ym: grMonth } };
}
function grExportBlocked(m, what){
  var old = document.getElementById('gr-export-modal');
  if(old) old.parentNode.removeChild(old);
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg open" id="gr-export-modal"><div class="modal"><h3>⛔ ' + escVal(what) + ' не може да се направи</h3>' +
    '<ul id="gr-export-issues" style="margin:6px 0 0 18px;font-size:13px;">' + m.blocking.map(function(t){ return '<li>' + escVal(t) + '</li>'; }).join('') + '</ul>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal(\'gr-export-modal\')">Затвори</button></div></div></div>');
}

/* Excel по образеца на ТРЗ. Без защита, без препратки към други листове; формулите са в
   реда на служителя; празните дни са наистина празни клетки. */
function grBuildTrzWorkbook(m, ExcelJS){
  var M = m.M, H = m.header, nd = M.days;
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet(H.ym.slice(5, 7) + '.' + H.ym.slice(0, 4), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }, printTitlesRow: '5:11' }
  });
  var D0 = 3, DL = D0 + nd - 1, cDays = DL + 1, cHrs = DL + 2, cSig = DL + 3, cO = DL + 4, cB = DL + 5, cN = DL + 6, cTot = DL + 7;   // cTot — AO: общо вкл. О/Б/Н (по договора, 05.11.2026)
  var C = function(i){ return grColName(i); }, thin = { style: 'thin' }, box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 22 }].concat(Array.apply(null, Array(nd)).map(function(){ return { width: 5.6 }; }))
    .concat([{ width: 8 }, { width: 9 }, { width: 11 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 9 }]);
  var put = function(addr, v, st){ var c = ws.getCell(addr); c.value = v; if(st){ for(var k in st) c[k] = st[k]; } return c; };
  var bold = { font: { name: 'Arial', size: 9, bold: true } }, norm9 = { font: { name: 'Arial', size: 9 } };
  ws.mergeCells('A1:C2'); put('A1', 'Предприятие: ' + H.company + ', ЕИК ' + H.eik, { font: { name: 'Arial', size: 9, bold: true }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells(C(D0) + '1:' + C(DL) + '2');
  put(C(D0) + '1', (m.draft ? 'ЧЕРНОВА — ' : '') + 'График за явяване на работа ' + H.workDays + ' раб.дни/ ' + H.norm + ' часа',
    { font: { name: 'Arial', size: 12, bold: true, color: { argb: m.draft ? 'FFDC2626' : 'FF000000' } }, alignment: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(C(cDays) + '1:' + C(cTot) + '4');
  put(C(cDays) + '1', 'Утвърдил: ' + H.approver, { font: { name: 'Arial', size: 9, bold: true }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells('A3:C3'); put('A3', 'Адрес: ' + H.addr, norm9);
  ws.mergeCells('A4:C4'); put('A4', 'Обект: ' + H.store, bold);
  ws.mergeCells(C(D0) + '4:' + C(DL) + '4');
  put(C(D0) + '4', 'за месец ' + H.monthText + ' · ' + H.seasonLabel, { font: { name: 'Arial', size: 10, bold: true }, alignment: { horizontal: 'center' } });
  var hd = { font: { name: 'Arial', size: 8, bold: true }, alignment: { wrapText: true, horizontal: 'center', vertical: 'middle' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GR_FILL.head } }, border: box };
  [['A', '№'], ['B', 'Трите имена по документ за самоличност'], ['C', 'Длъжност']].forEach(function(x){ ws.mergeCells(x[0] + '5:' + x[0] + '11'); put(x[0] + '5', x[1], hd); });
  ws.mergeCells(C(D0) + '5:' + C(DL) + '5'); put(C(D0) + '5', '', hd);
  ws.mergeCells(C(D0) + '6:' + C(DL) + '6'); put(C(D0) + '6', 'Дни на месеца', hd);
  ws.mergeCells(C(cDays) + '5:' + C(cHrs) + '6'); put(C(cDays) + '5', 'Явявания на работа', hd);
  ws.mergeCells(C(cDays) + '7:' + C(cDays) + '11'); put(C(cDays) + '7', 'всичко човекодни', hd);
  ws.mergeCells(C(cHrs) + '7:' + C(cHrs) + '11'); put(C(cHrs) + '7', 'всичко човекочасове', hd);
  ws.mergeCells(C(cSig) + '5:' + C(cSig) + '11'); put(C(cSig) + '5', 'ПОДПИС', hd);
  [[cO, 'отпуск (О) дни'], [cB, 'болничен (Б) дни'], [cN, 'неплатен (Н) дни'], [cTot, 'общо часове вкл. О/Б/Н (по договора)']].forEach(function(x){ ws.mergeCells(C(x[0]) + '5:' + C(x[0]) + '11'); put(C(x[0]) + '5', x[1], hd); });
  for(var d = 0; d < nd; d++){
    var col = C(D0 + d), w = M.dow[d], dayFill = M.holiday[d] ? GR_FILL.holiday : (w >= 6 ? GR_FILL.weekend : GR_FILL.head);
    var dh = { font: { name: 'Arial', size: 8, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border: box,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: dayFill } } };
    ws.mergeCells(col + '7:' + col + '9'); put(col + '7', '', dh);
    put(col + '10', GR_DOW1[w], dh);
    put(col + '11', d + 1, dh);
  }
  var r0 = 12, rng;
  m.rows.forEach(function(r, i){
    var row = r0 + i, ex = row;
    rng = C(D0) + ex + ':' + C(DL) + ex;
    var base = { font: { name: 'Arial', size: 9 }, border: box, alignment: { vertical: 'middle' } };
    if(r.off) base.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GR_FILL.offRow } };
    put('A' + row, i + 1, base);
    var nc = put('B' + row, r.name, base); if(r.off) nc.note = r.off;
    put('C' + row, r.title, { font: { name: 'Arial', size: 8 }, border: box, alignment: { vertical: 'middle', wrapText: true }, fill: base.fill });
    for(var d = 0; d < nd; d++){
      var c = ws.getCell(C(D0 + d) + row), code = r.codes[d] || '', meta = r.cell[d + 1], w = M.dow[d];
      if(code) c.value = code;                       // празен ден — наистина празна клетка
      c.font = { name: 'Arial', size: 8 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = box;
      var f = meta ? meta.fill : (M.holiday[d] ? GR_FILL.holiday : (w >= 6 ? GR_FILL.weekend : null));
      if(f) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f } };
      if(meta && meta.note) c.note = meta.note;
    }
    var hrsF = m.fcodes.map(function(k){ return 'COUNTIF(' + rng + ',"' + k.code + '")*' + k.hours; }).join('+') || '0';
    var num = { font: { name: 'Arial', size: 9 }, border: box, alignment: { horizontal: 'center', vertical: 'middle' } };
    put(C(cDays) + row, { formula: 'COUNTIFS(' + rng + ',"?*",' + rng + ',"<>О",' + rng + ',"<>Б",' + rng + ',"<>Н")', result: r.days }, num);
    put(C(cHrs) + row, { formula: hrsF, result: r.hours }, num);
    put(C(cSig) + row, null, num);
    put(C(cO) + row, { formula: 'COUNTIF(' + rng + ',"О")', result: r.o }, num);
    put(C(cB) + row, { formula: 'COUNTIF(' + rng + ',"Б")', result: r.b }, num);
    put(C(cN) + row, { formula: 'COUNTIF(' + rng + ',"Н")', result: r.n }, num);
    put(C(cTot) + row, { formula: C(cHrs) + row + '+' + r.hpd + '*(' + C(cO) + row + '+' + C(cB) + row + '+' + C(cN) + row + ')', result: r.total }, num);
  });
  var last = r0 + m.rows.length - 1, tr = last + 1, sum = function(col, key){
    var tot = m.rows.reduce(function(s, r){ return s + r[key]; }, 0);
    return { formula: m.rows.length ? 'SUM(' + col + r0 + ':' + col + last + ')' : '0', result: tot };
  };
  var tot = { font: { name: 'Arial', size: 9, bold: true }, border: box, alignment: { horizontal: 'center', vertical: 'middle' } };
  ws.mergeCells('A' + tr + ':' + C(DL) + tr); put('A' + tr, 'ВСИЧКО за обекта:', { font: { name: 'Arial', size: 9, bold: true }, border: box, alignment: { horizontal: 'right' } });
  put(C(cDays) + tr, sum(C(cDays), 'days'), tot); put(C(cHrs) + tr, sum(C(cHrs), 'hours'), tot); put(C(cSig) + tr, null, tot);
  put(C(cO) + tr, sum(C(cO), 'o'), tot); put(C(cB) + tr, sum(C(cB), 'b'), tot); put(C(cN) + tr, sum(C(cN), 'n'), tot); put(C(cTot) + tr, sum(C(cTot), 'total'), tot);
  /* Легендата — двата сезона, както в бланката (A82 лято, A94 зима, после О / Н / Б). */
  var lr = tr + 1;
  m.legend.forEach(function(g){
    lr++;
    if(g.title) put('A' + lr++, g.title, bold);
    g.items.forEach(function(t){ put('A' + lr++, t, norm9); });
  });
  put('A' + (lr + 1), 'Графиците се изготвят с междудневна почивка – не по-малко от 12 часа и междуседмична почивка – не по-малко от 36 часа.', norm9);
  return wb;
}
function grTrzFileName(m){
  var s = String(m.header.storeName || '').replace(/[\\/:*?"<>|\s]+/g, '_');
  return 'График_' + s + '_' + m.header.ym + (m.draft ? '_ЧЕРНОВА' : '') + '.xlsx';
}
function grExportTrz(){
  var m = grExportModel();
  if(!m) return;
  if(m.blocking.length){ grExportBlocked(m, 'Файлът за ТРЗ'); return; }
  return grWithExcelJS().then(function(X){
    var wb = grBuildTrzWorkbook(m, X);
    return wb.xlsx.writeBuffer().then(function(buf){
      grDownload(buf, grTrzFileName(m));
      toast('📥 ' + grTrzFileName(m));
    });
  }).catch(function(e){ toast('Файлът не се направи: ' + (e && e.message ? e.message : e), '#dc2626'); });
}

/* Печат — в #mod-print (правило 12: глобалните правила за таблиците важат и тук, затова
   white-space, рамката на последния ред и box-sizing са зададени изрично). Ширините са в
   мм и се събират в 277 мм (A4 хоризонтално с 10 мм полета) при 31 дни. */
function grPrintCss(){
  return '@page{size:A4 landscape;margin:8mm 10mm;}' +
    '#grp-wrap{font-family:Arial,sans-serif;color:#000;}' +
    '.grp-head{display:flex;justify-content:space-between;gap:8mm;font-size:9px;margin-bottom:1.5mm;}' +
    '.grp-title{text-align:center;font-size:13px;font-weight:700;margin:1mm 0;}' +
    '.grp-tbl{width:277mm;border-collapse:collapse;table-layout:fixed;font-size:7px;}' +
    '.grp-tbl th,.grp-tbl td{box-sizing:border-box;border:1px solid #333;padding:0.15mm 0.2mm;white-space:normal;word-wrap:break-word;text-align:center;vertical-align:middle;overflow:hidden;}' +
    '.grp-tbl tr:last-child td{border-bottom:1px solid #333;}' +
    '.grp-tbl th{background:#f1f5f9;font-weight:700;}' +
    '.grp-tbl td.grp-name{text-align:left;}' +
    '.grp-we{background:#e2e8f0;}.grp-hol{background:#fecaca;}.grp-trip{background:#fed7aa;}.grp-bad{background:#fca5a5;font-weight:700;}' +
    '.grp-off td{background:#fee2e2;}.grp-off-note{display:block;color:#b91c1c;font-size:6px;}' +
    /* Подписи + ВТР + легенда — един блок, който не се къса: Кърджали 11.2026 (41 реда) се
       събира на 1 лист (измерено — PDF от Edge); при повече редове блокът отива цял на втория. */
    '#grp-foot{break-inside:avoid;page-break-inside:avoid;}' +
    '.grp-sign{display:flex;justify-content:space-between;gap:10mm;margin-top:3mm;font-size:9px;}' +
    '.grp-legend{columns:3;column-gap:6mm;font-size:6.5px;line-height:1.2;margin-top:1.5mm;}' +
    '.grp-leg-title{font-weight:700;break-after:avoid;page-break-after:avoid;}' +
    '@media print{#grp-page{padding:0 !important;}}' +
    '.grp-draft{position:fixed;top:35%;left:18%;font-size:96px;font-weight:700;color:rgba(220,38,38,.16);transform:rotate(-22deg);pointer-events:none;z-index:5;}' +
    '@media print{.grp-tbl tr{page-break-inside:avoid;}}';
}
function grPrintGrafik(){
  var m = grExportModel();
  if(!m) return;
  if(m.blocking.length){ grExportBlocked(m, 'Печатът'); return; }
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var M = m.M, H = m.header, nd = M.days;
  var cols = '<col style="width:5mm;"><col style="width:38mm;"><col style="width:24mm;">' + Array.apply(null, Array(nd)).map(function(){ return '<col style="width:5mm;">'; }).join('') +
    '<col style="width:7mm;"><col style="width:8mm;"><col style="width:17mm;"><col style="width:5mm;"><col style="width:5mm;"><col style="width:5mm;"><col style="width:8mm;">';   // ПОДПИС между часовете и О — както AI–AO в бланката
  var head = '<tr><th rowspan="2">№</th><th rowspan="2">Трите имена</th><th rowspan="2">Длъжност</th>';
  for(var d = 0; d < nd; d++) head += '<th class="' + (M.holiday[d] ? 'grp-hol' : M.dow[d] >= 6 ? 'grp-we' : '') + '">' + (d + 1) + '</th>';
  head += '<th rowspan="2">чов.<br>дни</th><th rowspan="2">чов.<br>часове</th><th rowspan="2">Запознат / подпис</th><th rowspan="2">О</th><th rowspan="2">Б</th><th rowspan="2">Н</th><th rowspan="2">общо ч. вкл. О/Б/Н</th></tr><tr>';
  for(d = 0; d < nd; d++) head += '<th class="' + (M.holiday[d] ? 'grp-hol' : M.dow[d] >= 6 ? 'grp-we' : '') + '">' + GR_DOW1[M.dow[d]] + '</th>';
  head += '</tr>';
  var body = m.rows.map(function(r, i){
    var h = '<tr class="grp-row' + (r.off ? ' grp-off' : '') + '"><td>' + (i + 1) + '</td><td class="grp-name">' + escVal(r.name) +
      (r.off ? '<span class="grp-off-note">' + escVal(r.off) + '</span>' : '') + '</td><td>' + escVal(r.title) + '</td>';
    for(var d = 0; d < nd; d++){
      var meta = r.cell[d + 1], cls = meta ? (meta.fill === GR_FILL.trip ? 'grp-trip' : 'grp-bad') : (M.holiday[d] ? 'grp-hol' : M.dow[d] >= 6 ? 'grp-we' : '');
      h += '<td class="' + cls + '"' + (meta && meta.note ? ' title="' + escAttrVal(meta.note) + '"' : '') + '>' + escVal(r.codes[d] || (meta && meta.text) || '') + '</td>';
    }
    return h + '<td>' + r.days + '</td><td>' + grHrsTxt(r.hours) + '</td><td></td><td>' + r.o + '</td><td>' + r.b + '</td><td>' + r.n + '</td><td>' + grHrsTxt(r.total) + '</td></tr>';
  }).join('');
  var tot = function(k){ return m.rows.reduce(function(s, r){ return s + r[k]; }, 0); };
  body += '<tr class="grp-total"><td colspan="' + (3 + nd) + '" style="text-align:right;font-weight:700;">ВСИЧКО за обекта:</td><td>' + tot('days') + '</td><td>' + grHrsTxt(tot('hours')) +
    '</td><td></td><td>' + tot('o') + '</td><td>' + tot('b') + '</td><td>' + tot('n') + '</td><td>' + grHrsTxt(tot('total')) + '</td></tr>';
  wrap.innerHTML = '<style>' + grPrintCss() + '</style>' +
    '<div id="grp-page" style="padding:12px 12px 30px;">' +
      '<div class="no-print" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">' +
        '<b style="font-size:16px;">🖨 График за явяване на работа</b><span style="flex:1"></span>' +
        '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
        '<button onclick="showModule(\'grafik\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
      '</div>' +
      '<div id="grp-wrap">' + (m.draft ? '<div class="grp-draft" id="grp-draft">ЧЕРНОВА</div>' : '') +
        '<div class="grp-head"><div>Предприятие: <b>' + escVal(H.company) + '</b>, ЕИК ' + escVal(H.eik) + '<br>Адрес: ' + escVal(H.addr) + '<br>Обект: <b>' + escVal(H.store) + '</b></div>' +
          '<div style="text-align:right;">Утвърдил: ' + escVal(H.approver) + '<br>подпис и печат: ………………</div></div>' +
        '<div class="grp-title" id="grp-title">' + (m.draft ? 'ЧЕРНОВА — ' : '') + 'ГРАФИК ЗА ЯВЯВАНЕ НА РАБОТА</div>' +
        '<div style="text-align:center;font-size:10px;margin-bottom:2mm;">за месец ' + escVal(H.monthText) + ' · ' + escVal(H.seasonLabel) + ' · ' + H.workDays + ' раб. дни · ' + H.norm + ' часа</div>' +
        '<table class="grp-tbl" id="grp-tbl"><colgroup>' + cols + '</colgroup><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
        '<div id="grp-foot">' +
          '<div class="grp-sign"><div id="grp-made">Изготвил: ' + (H.compiledBy ? escVal(H.compiledBy) + ' ' : '') + '………………………… (ръководител обект)</div>' +
            '<div id="grp-appr">Утвърдил: ' + escVal(H.approver) + ' ………………………… (управител)</div></div>' +
          '<div style="font-size:7px;margin-top:1mm;">ВТР, чл. 19, ал. 4. Графиците се изготвят с междудневна почивка – не по-малко от 12 часа и междуседмична почивка – не по-малко от 36 часа.</div>' +
          '<div class="grp-legend" id="grp-legend">' + m.legend.map(function(g){
            return (g.title ? '<div class="grp-leg-title">' + escVal(g.title) + '</div>' : '') + g.items.map(function(t){ return '<div>' + escVal(t) + '</div>'; }).join('');
          }).join('') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  showModule('print');
}

/* ─── Администрация → „📆 График“ (етап 1е-3, 04.11.2026) ────────────────
   Само admin (и то от списъка beta — иначе grafik-api не отговаря); картата се
   вмъква от loadAdmin() (admin.js) и се маха, ако „me“ не е admin. Всичко минава през
   grafik-api: списъците beta / ТРЗ (grafik_access — access_*), дружества, обект →
   дружество, ВТР и утвърдил, неработни дни (admin_*). Сървърът пази бял списък на
   полетата и одит; собственият имейл в списъците не се пипа (сървърът отказва). */
var grAdm = null;            // { access: [...], data: admin_get }
var GR_ADM_SPEC = {
  companies: { title: 'Дружество', fields: [
    { k: 'name', l: 'Име (както в бланката)', req: 1 }, { k: 'eik', l: 'ЕИК' }, { k: 'mol', l: 'МОЛ' }, { k: 'addr', l: 'Адрес (седалище)' }] },
  grafik_store_company: { title: 'Обект → дружество', fields: [
    { k: 'store_name', l: 'Обект', t: 'store', req: 1 }, { k: 'company_id', l: 'Дружество', t: 'company', req: 1 },
    { k: 'blank_name', l: 'Име на обекта за бланката', req: 1 }, { k: 'address', l: 'Адрес на обекта' },
    { k: 'valid_from', l: 'В сила от', t: 'date' }, { k: 'valid_to', l: 'В сила до', t: 'date' }] },
  grafik_company_terms: { title: 'ВТР и утвърдил', fields: [
    { k: 'company_id', l: 'Дружество', t: 'company', req: 1 }, { k: 'vtr_id', l: 'ВТР', t: 'vtr', req: 1 },
    { k: 'approver', l: 'Утвърдил (управител)', req: 1 }, { k: 'valid_from', l: 'В сила от', t: 'date' }, { k: 'valid_to', l: 'В сила до', t: 'date' }] },
  grafik_extra_days: { title: 'Неработен ден', fields: [
    { k: 'day', l: 'Дата', t: 'date', req: 1 }, { k: 'store_name', l: 'Обект (празно = всички)', t: 'store_opt' }, { k: 'note', l: 'Бележка' }] }
};
function grAdminLoad(){
  var mod = document.getElementById('mod-admin');
  if(!mod) return Promise.resolve();
  var card = document.getElementById('gr-admin-card');
  if(!card){ card = document.createElement('div'); card.className = 'card'; card.id = 'gr-admin-card'; mod.appendChild(card); }
  card.innerHTML = '<div class="card-title">📆 График</div><div style="padding:12px;color:#94a3b8;font-size:12px;">⏳ Зареждане...</div>';
  return grApi('me', {}).then(function(me){
    if(!me.ok || !me.data || !me.data.can_admin){ if(card.parentNode) card.parentNode.removeChild(card); return; }
    return Promise.all([grApi('access_list', {}), grApi('admin_get', {})]).then(function(r){
      if(!r[0].ok || !r[1].ok){ card.innerHTML = '<div class="card-title">📆 График</div><div id="gr-adm-error" style="color:#dc2626;">' + escVal(grErrText(r[0].ok ? r[1] : r[0])) + '</div>'; return; }
      grAdm = { access: r[0].data.rows || [], data: r[1].data };
      grAdminRender();
    });
  });
}
function grAdmCompany(id){ var c = (grAdm.data.companies || []).filter(function(x){ return x.id === id; })[0]; return c ? c.name : '—'; }
function grAdmVtr(id){ var x = (grAdm.data.vtrs || []).filter(function(y){ return y.id === id; })[0]; return x ? x.name : '—'; }
function grAdmPeriod(r){ return (r.valid_from ? fmtDate(r.valid_from) : '…') + ' – ' + (r.valid_to ? fmtDate(r.valid_to) : '…'); }
function grAdmTable(id, head, rows){
  return '<div class="tbl-wrap"><table id="' + id + '"><thead><tr>' + head.map(function(t){ return '<th>' + t + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" style="color:#94a3b8;">няма</td></tr>') + '</tbody></table></div>';
}
function grAdmEditBtn(t, id){ return '<button class="btn-sm" onclick="grAdmEdit(\'' + t + '\',\'' + escAttrVal(id) + '\')">✏️</button>'; }
function grAdminRender(){
  var card = document.getElementById('gr-admin-card');
  if(!card || !grAdm) return;
  var d = grAdm.data;
  var lists = ['beta', 'trz'].map(function(l){
    var rows = grAdm.access.filter(function(a){ return a.list === l; }).map(function(a){
      return '<tr><td>' + escVal(a.email) + '</td><td>' + escVal(a.note || '') + '</td><td style="font-size:11px;color:#64748b;">' + escVal(a.created_by || '') + (a.created_at ? ' · ' + escVal(grFmtAt(a.created_at)) : '') + '</td>' +
        '<td><button class="btn-sm" onclick="grAdmAccessRemove(\'' + escAttrVal(a.id) + '\')">✕ Махни</button></td></tr>';
    });
    return '<div style="margin:10px 0 4px;font-weight:600;">' + (l === 'beta' ? '👁 Beta — кой вижда таба „График“' : '🧾 ТРЗ — само подадените графици, без редакция (не е нужно и в beta; има предимство пред admin)') + '</div>' +
      grAdmTable('gr-adm-' + l, ['Имейл', 'Бележка', 'Добавен', ''], rows);
  }).join('');
  var h = '<div class="card-title">📆 График</div>' +
    '<div style="font-size:12px;color:#64748b;">Работен график (в разработка). Всяка промяна минава през grafik-api и се записва в одита. Собствения си имейл не променяш оттук.</div>' +
    lists +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;">' +
      '<input class="fi" id="gr-adm-email" placeholder="имейл" style="flex:2;min-width:180px;">' +
      '<select class="fi" id="gr-adm-list" style="flex:0 0 auto;"><option value="beta">Beta</option><option value="trz">ТРЗ</option></select>' +
      '<input class="fi" id="gr-adm-note" placeholder="бележка (по избор)" style="flex:2;min-width:140px;">' +
      '<button class="btn btn-green" onclick="grAdmAccessAdd()">➕ Добави</button></div>';
  h += '<div style="margin:16px 0 4px;font-weight:600;">🏢 Дружества <button class="btn-sm" onclick="grAdmEdit(\'companies\')">➕ Дружество</button></div>' +
    grAdmTable('gr-adm-companies', ['Име', 'ЕИК', 'МОЛ', 'Адрес', ''], (d.companies || []).map(function(c){
      return '<tr><td>' + escVal(c.name || '') + '</td><td>' + escVal(c.eik || '') + '</td><td>' + escVal(c.mol || '') + '</td><td' + (c.addr ? '' : ' style="color:#dc2626;"') + '>' + escVal(c.addr || 'липсва') + '</td><td>' + grAdmEditBtn('companies', c.id) + '</td></tr>';
    }));
  h += '<div style="margin:16px 0 4px;font-weight:600;">🏬 Обект → дружество <button class="btn-sm" onclick="grAdmEdit(\'grafik_store_company\')">➕ Връзка</button></div>' +
    grAdmTable('gr-adm-store-company', ['Обект', 'Дружество', 'Име за бланката', 'Адрес', 'Период', ''], (d.grafik_store_company || []).slice().sort(function(a, b){
      return String(a.store_name).localeCompare(String(b.store_name), 'bg') || String(a.valid_from || '').localeCompare(String(b.valid_from || ''));
    }).map(function(s){
      return '<tr><td>' + escVal(s.store_name) + '</td><td>' + escVal(grAdmCompany(s.company_id)) + '</td><td>' + escVal(s.blank_name || '') + '</td><td>' + escVal(s.address || '') + '</td><td>' + escVal(grAdmPeriod(s)) + '</td><td>' + grAdmEditBtn('grafik_store_company', s.id) + '</td></tr>';
    }));
  h += '<div style="margin:16px 0 4px;font-weight:600;">📜 ВТР и утвърдил по дружество <button class="btn-sm" onclick="grAdmEdit(\'grafik_company_terms\')">➕ ВТР</button></div>' +
    grAdmTable('gr-adm-terms', ['Дружество', 'ВТР', 'Утвърдил', 'Период', ''], (d.grafik_company_terms || []).map(function(t){
      return '<tr><td>' + escVal(grAdmCompany(t.company_id)) + '</td><td>' + escVal(grAdmVtr(t.vtr_id)) + '</td><td>' + escVal(t.approver || '') + '</td><td>' + escVal(grAdmPeriod(t)) + '</td><td>' + grAdmEditBtn('grafik_company_terms', t.id) + '</td></tr>';
    }));
  h += '<div style="margin:16px 0 4px;font-weight:600;">📅 Допълнителни неработни дни <button class="btn-sm" onclick="grAdmEdit(\'grafik_extra_days\')">➕ Ден</button></div>' +
    grAdmTable('gr-adm-extra', ['Дата', 'Обект', 'Бележка', ''], (d.grafik_extra_days || []).slice().sort(function(a, b){ return String(a.day).localeCompare(String(b.day)); }).map(function(e){
      return '<tr><td>' + escVal(fmtDate(e.day)) + '</td><td>' + escVal(e.store_name || 'всички') + '</td><td>' + escVal(e.note || '') + '</td>' +
        '<td>' + grAdmEditBtn('grafik_extra_days', e.id) + ' <button class="btn-sm" onclick="grAdmExtraDelete(\'' + escAttrVal(e.id) + '\')">✕</button></td></tr>';
    }));
  card.innerHTML = h;
}
function grAdmAccessAdd(){
  var email = String(v('gr-adm-email') || '').trim().toLowerCase(), list = v('gr-adm-list'), note = v('gr-adm-note');
  if(!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)){ toast('Невалиден имейл.', '#dc2626'); return; }
  return grApi('access_add', { list: list, email: email, note: note }).then(function(res){
    if(!res.ok){ toast('Не е добавен: ' + grErrText(res), '#dc2626'); return; }
    toast('✔ ' + email + ' е добавен в ' + (list === 'trz' ? 'ТРЗ' : 'beta') + '.');
    return grAdminLoad();
  });
}
function grAdmAccessRemove(id){
  var a = ((grAdm && grAdm.access) || []).filter(function(x){ return x.id === id; })[0];
  if(!a || !confirm('Да махна ' + a.email + ' от ' + (a.list === 'trz' ? 'ТРЗ' : 'beta') + '?')) return;
  return grApi('access_remove', { id: id }).then(function(res){
    if(!res.ok){ toast('Не е махнат: ' + grErrText(res), '#dc2626'); return; }
    toast('✔ ' + a.email + ' е махнат.');
    return grAdminLoad();
  });
}
function grAdmExtraDelete(id){
  if(!confirm('Да махна неработния ден?')) return;
  return grApi('admin_delete', { table: 'grafik_extra_days', id: id }).then(function(res){
    if(!res.ok){ toast('Не е махнат: ' + grErrText(res), '#dc2626'); return; }
    return grAdminLoad();
  });
}
/* Един формуляр за четирите таблици (GR_ADM_SPEC); празно поле → null. */
function grAdmEdit(table, id){
  var spec = GR_ADM_SPEC[table];
  if(!spec || !grAdm) return;
  var row = id ? ((grAdm.data[table] || []).filter(function(x){ return x.id === id; })[0] || {}) : {};
  var opts = function(list, cur, empty){
    return (empty ? '<option value="">' + empty + '</option>' : '') + list.map(function(o){ return '<option value="' + escAttrVal(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + escVal(o.l) + '</option>'; }).join('');
  };
  var stores = (grAdm.data.stores || []).map(function(n){ return { v: n, l: n }; });
  var companies = (grAdm.data.companies || []).map(function(c){ return { v: c.id, l: c.name }; });
  var vtrs = (grAdm.data.vtrs || []).map(function(c){ return { v: c.id, l: c.name }; });
  var f = spec.fields.map(function(x){
    var cur = row[x.k] == null ? '' : String(row[x.k]), fid = 'gr-adm-f-' + x.k, inp;
    if(x.t === 'store') inp = '<select class="fi" id="' + fid + '">' + opts(stores, cur, '— избери —') + '</select>';
    else if(x.t === 'store_opt') inp = '<select class="fi" id="' + fid + '">' + opts(stores, cur, 'всички обекти') + '</select>';
    else if(x.t === 'company') inp = '<select class="fi" id="' + fid + '">' + opts(companies, cur, '— избери —') + '</select>';
    else if(x.t === 'vtr') inp = '<select class="fi" id="' + fid + '">' + opts(vtrs, cur, '— избери —') + '</select>';
    else inp = '<input class="fi" id="' + fid + '" type="' + (x.t === 'date' ? 'date' : 'text') + '" value="' + escAttrVal(cur) + '">';
    return '<label style="display:block;margin:6px 0;font-size:12px;">' + escVal(x.l) + (x.req ? ' *' : '') + inp + '</label>';
  }).join('');
  var old = document.getElementById('gr-adm-modal');
  if(old) old.parentNode.removeChild(old);
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg open" id="gr-adm-modal"><div class="modal"><h3>' + (id ? '✏️ ' : '➕ ') + escVal(spec.title) + '</h3>' + f +
    '<div class="modal-actions"><button class="btn" onclick="closeModal(\'gr-adm-modal\')">Отказ</button>' +
    '<button class="btn btn-green" onclick="grAdmSave(\'' + table + '\',\'' + escAttrVal(id || '') + '\')">Запиши</button></div></div></div>');
}
function grAdmSave(table, id){
  var spec = GR_ADM_SPEC[table], fields = {}, miss = [];
  spec.fields.forEach(function(x){
    var val = String(v('gr-adm-f-' + x.k) || '').trim();
    if(x.req && !val) miss.push(x.l);
    fields[x.k] = val || null;
  });
  if(miss.length){ toast('Попълни: ' + miss.join(', ') + '.', '#dc2626'); return; }
  if(fields.eik && !/^\d{9}(\d{4})?$/.test(fields.eik)){ toast('ЕИК е 9 или 13 цифри.', '#dc2626'); return; }
  if(fields.valid_from && fields.valid_to && fields.valid_to < fields.valid_from){ toast('„До“ е преди „от“.', '#dc2626'); return; }
  return grApi('admin_save', { table: table, id: id || null, fields: fields }).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + grErrText(res), '#dc2626'); return; }
    closeModal('gr-adm-modal');
    toast('✔ Записано.');
    return grAdminLoad();
  });
}
