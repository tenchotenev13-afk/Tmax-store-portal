/* grafik.js — Работен график (етап 1г, 02.11.2026): месечният график на обекта и
   персоналът. Модулът е в разработка: табът се вижда само от имейлите в
   app_settings.grafik_beta_users (HIDDEN-FEATURES.md); данните са само през
   едж функцията grafik-api (таблиците grafik_* са без права за anon).
   Изчисленията — в grafik-engine.js (GrafikEngine), общи с файла за ТРЗ (1д).

   Въвеждане: само клавиатура — буква / число 1–12, стрелки, Tab, Enter, Delete;
   поставяне от Excel (Ctrl+V); Ctrl+L — заключва/отключва официалния код на
   клетката. Автозапис по ред (grSaveSoon). */

var GR_LETTERS_FALLBACK = ['ЛД','ЗД','П','В','М','О','Б','НО','К','О4'];
var GR_WORK_LETTERS = ['ЛД','ЗД','П','В','М','К'];
var GR_DATED_WARN = { no_weekly_rest: 1, week_over_56: 1 };   // текстът вече носи датите (ВТР чл. 19)
var GR_POSITIONS = ['Каса','Продавач','ОТЗ','Склад','Шофьор','Снабдител','Ръководител'];
var GR_MONTHS = ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
var GR_DOW = ['','Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
/* Фонетична кирилица: магазинът пише и на латиница (p → П, ld → ЛД). */
var GR_LATIN = {a:'А',b:'Б',v:'В',w:'В',g:'Г',d:'Д',e:'Е',z:'З',i:'И',k:'К',l:'Л',m:'М',n:'Н',o:'О',p:'П',r:'Р',s:'С',t:'Т',u:'У',f:'Ф',h:'Х',c:'Ц'};

var grUsersOn = [], grUsersSeq = 0, grLoadSeq = 0;
var grMe = null;            // отговорът на action "me"
var grStore = '', grMonth = '';
var grView = 'grid';        // 'grid' | 'staff'
var grData = null;          // load_month
var grRows = {};            // staff_id → {letters:[], locked:{}}
var grCalc = null;          // GrafikEngine.computeMonth(...)
var grPrev = null;          // предходният месец {setup, ym, rows} — за седмицата през границата (или null)
var grSel = { r: 0, d: 0 }; // избрана клетка (ред в grVisible, ден 0..days-1)
var grEdit = '';            // буфер при въвеждане
var grDirty = {}, grSaveTimer = null, grSavePromise = null, grSaveState = '';
var grSaved = {};           // staff_id → има ред в grafik_rows за този месец (сървърът го знае)
var grVisible = [];         // служителите в графика за месеца (подредени)

/* ─── Достъп (бутонът) ─────────────────────────────────── */
function grParseUsers(v){
  return String(v == null ? '' : v).split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
}
function grCanSee(){
  return !!currentUser && !!currentUser.email && grUsersOn.indexOf(String(currentUser.email).trim().toLowerCase()) >= 0;
}
function grSyncButton(){
  var b = document.getElementById('tab-grafik');
  if(b) b.style.display = grCanSee() ? '' : 'none';
}
/* Само скрива/показва таба; истинската проверка е в grafik-api при всяка заявка. */
function grLoadUsers(){
  var seq = ++grUsersSeq;
  return sbGet('app_settings', 'key=eq.grafik_beta_users&select=key,value', true).then(function(rows){
    var row = (Array.isArray(rows) ? rows : []).filter(function(r){ return r && r.key === 'grafik_beta_users'; })[0];
    if(seq === grUsersSeq) grUsersOn = grParseUsers(row && row.value);
    grSyncButton();
    return grCanSee();
  });
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
  return grLoadUsers().then(function(see){
    if(seq !== grLoadSeq) return;
    if(!see){ el.innerHTML = grTitle() + '<div class="card" id="gr-noaccess">Нямаш достъп до този модул.</div>'; return; }
    return grApi('me', {}).then(function(res){
      if(seq !== grLoadSeq) return;
      if(!res.ok){ el.innerHTML = grTitle() + '<div class="card" id="gr-error" style="color:#dc2626;">' + escVal(grErrText(res)) + '</div>'; return; }
      grMe = res.data;
      var names = (grMe.stores || []).map(function(s){ return s.name; });
      if(!grStore || names.indexOf(grStore) < 0){
        grStore = (currentUser && names.indexOf(currentUser.store_name) >= 0) ? currentUser.store_name : (names[0] || '');
      }
      if(!grStore){ el.innerHTML = grTitle() + '<div class="card" id="gr-nostore">Няма обект, чийто график да виждаш.</div>'; return; }
      return grLoadMonth(seq);
    });
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
    return grLoadPrev(seq).then(function(){
      if(seq !== grLoadSeq) return;
      grRecalc();
      grRender();
    });
  });
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
  grVisible = grCalc.rows.map(function(x){ return x.staff; });
  if(grSel.r >= grVisible.length) grSel.r = Math.max(0, grVisible.length - 1);
  if(grSel.d >= grCalc.month.days) grSel.d = grCalc.month.days - 1;
}

/* ─── Рендер ───────────────────────────────────────────── */
function grTitle(){ return '<div class="pg-title">🗓️ Работен график <span style="font-size:12px;color:#f59e0b;font-weight:600;">· в разработка</span></div>'; }
function grToolbar(){
  var stores = (grMe && grMe.stores) || [];
  var h = '<div class="card" id="gr-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(stores.length > 1){
    h += '<select id="gr-store" onchange="grPickStore(this.value)">' + stores.map(function(s){
      return '<option value="' + escAttrVal(s.name) + '"' + (s.name === grStore ? ' selected' : '') + '>' + escVal(s.name) + '</option>';
    }).join('') + '</select>';
  } else h += '<b>' + escVal(grStore) + '</b>';
  h += '<button class="btn-sm" onclick="grGoMonth(-1)" title="Предходен месец">◀</button>' +
       '<b id="gr-month-label" style="min-width:150px;text-align:center;">' + escVal(grMonthLabel(grMonth)) + '</b>' +
       '<button class="btn-sm" onclick="grGoMonth(1)" title="Следващ месец">▶</button>';
  h += '<span style="flex:1"></span>';
  h += '<button class="filter-btn' + (grView === 'grid' ? ' active' : '') + '" onclick="grSetView(\'grid\')">📅 График</button>';
  h += '<button class="filter-btn' + (grView === 'staff' ? ' active' : '') + '" onclick="grSetView(\'staff\')">👥 Персонал</button>';
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
function grRender(){
  var el = document.getElementById('mod-grafik');
  if(!el) return;
  if(!grData){ el.innerHTML = grTitle() + grToolbar(); return; }
  var h = grTitle() + grToolbar();
  if(grView === 'staff') h += grStaffHtml();
  else h += grGridPageHtml();
  el.innerHTML = h;
  if(grView === 'grid') grFocusGrid();
}
function grGridPageHtml(){
  var M = grCalc.month, setup = grData.setup || {}, h = '';
  if(setup.missing && setup.missing.length){
    h += '<div class="card" id="gr-missing" style="border-left:4px solid #dc2626;color:#991b1b;">⚠ Липсват данни за дружеството — админ (' + escVal(setup.missing.join(', ')) + '). Графикът може да се попълва, но не и да се подаде.</div>';
  }
  var off = grCalc.rows.filter(function(r){ return r.diff !== 0; }).length;
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
  h += '</div>';
  h += grWarningsHtml();
  h += grCoverageHtml();
  /* Подсказката е НАД мрежата: кутията на мрежата залепва под лентата и трябва да е последна в
     модула — иначе редът под нея я избутва нагоре при скрол докрай (index.html, .gr-grid-wrap). */
  h += '<div id="gr-hint" style="font-size:12px;color:#64748b;margin:6px 2px;">Букви: ' + escVal(grAllowedLetters().join(', ')) +
    ' · число 1–12 = свободни часове · стрелки / Tab / Enter · Delete изтрива · Ctrl+V поставя от Excel · Ctrl+L заключва кода · ' +
    '<span style="background:#fde68a;padding:0 4px;">жълто</span> = кодът е сменен автоматично до нормата · 🔒 = заключен код</div>';
  h += grGridHtml();
  return h;
}
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
  var h = '<div class="tbl-wrap gr-grid-wrap" id="gr-grid-wrap"><table id="gr-grid" tabindex="0" onkeydown="grKey(event)" onpaste="grPaste(event)" style="border-collapse:collapse;font-size:12px;">';
  h += '<thead><tr><th>№</th><th style="text-align:left;">Служител</th><th>Сектор</th>';
  for(var i = 0; i < M.days; i++) h += grDayHead(i);
  h += '<th title="Вътрешни часове (буквите + свободните часове)">Вътр.</th><th title="Официални часове по кодовете">Офиц.</th><th>Цел</th><th>Разл.</th></tr></thead><tbody>';
  grCalc.rows.forEach(function(x, r){
    var s = x.staff, row = grRows[s.id] || { letters: [], locked: {} };
    var changed = {};
    x.changed.forEach(function(c){ changed[c.day] = c; });
    var warnDays = {};
    x.warnings.forEach(function(w){ (warnDays[w.day] = warnDays[w.day] || []).push(w.text); });
    h += '<tr id="gr-row-' + escAttrVal(s.id) + '"><td>' + (r + 1) + '</td><td style="text-align:left;white-space:nowrap;" title="' + escAttrVal((s.full_name || '') + (s.contract_title ? ' · ' + s.contract_title : '') + (+s.hours_per_day && +s.hours_per_day !== 8 ? ' · ' + s.hours_per_day + ' ч.' : '')) + '">' +
      escVal(s.short_name || s.full_name) + (+s.hours_per_day && +s.hours_per_day !== 8 ? ' <span style="color:#64748b;">(' + escVal(String(+s.hours_per_day)) + ' ч.)</span>' : '') + '</td><td style="font-size:11px;">' + escVal(s.sector_id ? grSector(s) : '') + '</td>';
    for(var d = 0; d < M.days; d++){
      var L = row.letters[d] || '', code = x.codes[d] || '', lk = row.locked && row.locked[d + 1];
      var ch = changed[d + 1], w = M.dow[d], hol = M.holiday[d];
      var bg = ch ? '#fde68a' : (hol ? '#fee2e2' : (w >= 6 ? '#f1f5f9' : ''));
      var title = M.dates[d] + (code ? ' · ' + code : '') + (ch ? ' · автоматично: ' + ch.from + ' → ' + ch.to : '') + (lk ? ' · заключен' : '') + (warnDays[d + 1] ? ' · ⚠ ' + warnDays[d + 1].join('; ') : '');
      var sel = (grSel.r === r && grSel.d === d);
      h += '<td class="gr-c" id="gr-c-' + r + '-' + d + '" data-r="' + r + '" data-d="' + d + '" onclick="grSelect(' + r + ',' + d + ')" title="' + escAttrVal(title) + '" style="text-align:center;border:1px solid #e2e8f0;cursor:cell;min-width:30px;height:24px;' +
        (bg ? 'background:' + bg + ';' : '') + (sel ? 'outline:2px solid #2563eb;outline-offset:-2px;' : '') + (warnDays[d + 1] ? 'color:#dc2626;font-weight:700;' : '') + '">' +
        escVal(sel && grEdit ? grEdit : L) + (lk ? '<span style="font-size:9px;">🔒</span>' : '') + '</td>';
    }
    var dc = x.diff === 0 ? '#16a34a' : '#dc2626';
    h += '<td>' + x.internal + '</td><td>' + x.official + '</td><td>' + x.target + '</td>' +
      '<td class="gr-diff" style="color:' + dc + ';font-weight:700;" title="' + escAttrVal(x.message) + '">' + (x.diff > 0 ? '+' : '') + x.diff + '</td></tr>';
  });
  if(!grCalc.rows.length) h += '<tr><td colspan="' + (M.days + 7) + '" style="padding:14px;color:#64748b;">Няма служители в графика за месеца — добави ги от „👥 Персонал“.</td></tr>';
  h += '</tbody></table></div>';
  return h;
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
function grCoverageHtml(){
  var M = grCalc.month, c = grCoverage();
  if(!c.order.length) return '';
  var h = '<details class="card" id="gr-coverage" open><summary style="cursor:pointer;font-weight:600;">Покритие по сектор и ден</summary><div class="tbl-wrap" style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:11px;"><thead><tr><th style="text-align:left;">Сектор</th>';
  for(var i = 0; i < M.days; i++) h += '<th style="padding:1px 3px;' + (M.holiday[i] ? 'background:#fecaca;' : M.dow[i] >= 6 ? 'background:#e2e8f0;' : '') + '">' + (i + 1) + '</th>';
  h += '</tr></thead><tbody>';
  c.order.forEach(function(k){
    h += '<tr><td style="text-align:left;white-space:nowrap;">' + escVal(k) + '</td>';
    c.sec[k].forEach(function(n){ h += '<td class="gr-cov' + (n ? '' : ' gr-cov0') + '" style="text-align:center;' + (n ? '' : 'background:#fecaca;color:#991b1b;font-weight:700;') + '">' + n + '</td>'; });
    h += '</tr>';
  });
  return h + '</tbody></table></div></details>';
}
function grWarningsHtml(){
  var list = [];
  grCalc.rows.forEach(function(x){
    var name = x.staff.short_name || x.staff.full_name;
    if(x.diff !== 0) list.push({ t: 'norm', s: name + ': ' + x.message + (x.reachable ? '' : ' — изравняването не намира точна комбинация, кодовете не са пипнати') });
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
  return grFlushThen(function(){ grStore = v; grSel = { r: 0, d: 0 }; return grLoadMonth(); }, function(){ grRender(); });
}
function grGoMonth(n){
  return grFlushThen(function(){ grMonth = grShiftMonth(grMonth, n); grSel = { r: 0, d: 0 }; return grLoadMonth(); });
}
function grSetView(v){ grView = v; grEdit = ''; grRender(); }
function grSelect(r, d){ grCommitEdit(); grSel = { r: r, d: d }; grRender(); }
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
function grKey(e){
  if(!grData || grView !== 'grid' || !grCalc || !grVisible.length) return;
  var k = e.key, edit = grCanEdit();
  if((e.ctrlKey || e.metaKey) && (k === 'l' || k === 'L' || k === 'л' || k === 'Л')){ e.preventDefault(); grToggleLock(); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;           // Ctrl+V → grPaste
  var nav = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  if(nav[k]){ e.preventDefault(); if(grCommitEdit()) grMove(nav[k][0], nav[k][1]); grRender(); return; }
  if(k === 'Tab'){ e.preventDefault(); if(grCommitEdit()) grMove(0, e.shiftKey ? -1 : 1); grRender(); return; }
  if(k === 'Enter'){ e.preventDefault(); if(grCommitEdit()) grMove(1, 0); grRender(); return; }
  if(k === 'Escape'){ grEdit = ''; grRender(); return; }
  if(!edit) return;
  if(k === 'Delete' || k === 'Backspace'){
    e.preventDefault();
    if(grEdit){ grEdit = grEdit.slice(0, -1); grRender(); return; }
    if(grSetCell(grSel.r, grSel.d, '')){ grRecalc(); grSaveSoon(); }
    grRender(); return;
  }
  if(k && k.length === 1 && /[\wА-Яа-я]/.test(k)){
    e.preventDefault();
    grEdit = (grEdit + k).slice(0, 3);
    grRender();
  }
}
/* Поставяне от Excel: редове с табулации, от избраната клетка надясно и надолу. */
function grPaste(e){
  if(!grCanEdit() || !grCalc) return;
  var txt = (e.clipboardData || window.clipboardData) ? (e.clipboardData || window.clipboardData).getData('text') : '';
  if(!txt) return;
  e.preventDefault();
  grEdit = '';
  var lines = String(txt).replace(/\r/g, '').split('\n');
  if(lines.length && lines[lines.length - 1] === '') lines.pop();
  var bad = [], n = 0;
  lines.forEach(function(line, i){
    line.split('\t').forEach(function(cell, j){
      var r = grSel.r + i, d = grSel.d + j;
      if(r >= grVisible.length || d >= grCalc.month.days) return;
      var v = grNormalize(cell);
      if(v === null){ bad.push((grVisible[r].short_name || '') + ' ' + (d + 1) + '-ви: „' + String(cell).trim() + '“'); return; }
      if(grSetCell(r, d, v)) n++;
    });
  });
  grRecalc(); grRender();
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
    var code = grCalc.rows[grSel.r].codes[grSel.d];
    if(!code){ toast('Няма код за заключване в тази клетка.', '#dc2626'); return; }
    row.locked[key] = code;
  }
  grDirty[s.id] = true;
  grRecalc(); grRender(); grSaveSoon();
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
        hours_per_day: +x.staff.hours_per_day || 8, codes: x.codes.slice(0, M.days), official: x.official, target: x.target, diff: x.diff,
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
  var off = grCalc.rows.filter(function(x){ return x.diff !== 0; });
  var q = 'Подаване на графика за ' + grMonthLabel(grMonth) + ' — ' + grStore + '?\nСлед подаване промени се правят само след връщане в чернова (admin / регионален).';
  if(off.length) q += '\n\n⚠ ' + off.length + ' души са извън нормата:\n' + off.slice(0, 10).map(function(x){ return '· ' + (x.staff.short_name || '') + ' — ' + x.message; }).join('\n') + (off.length > 10 ? '\n…' : '');
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
        if(!res.ok){ toast('Не е подаден: ' + grErrText(res), '#dc2626'); return; }
        toast('✔ Графикът е подаден.');
        return grLoadMonth();
      });
    });
  });
}
function grReopen(){
  if(!grData || !grData.can_reopen) return;
  if(!confirm('Връщане на графика за ' + grMonthLabel(grMonth) + ' — ' + grStore + ' в чернова?')) return;
  return grApi('reopen', { store: grStore, month: grMonth }).then(function(res){
    if(!res.ok){ toast('Не е върнат: ' + grErrText(res), '#dc2626'); return; }
    toast('Графикът е върнат в чернова.');
    return grLoadMonth();
  });
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
