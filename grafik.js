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
var GR_POSITIONS = ['Каса','Продавач','ОТЗ','Склад','Шофьор','Снабдител','Ръководител'];
var GR_MONTHS = ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
var GR_DOW = ['','Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
/* Фонетична кирилица: магазинът пише и на латиница (p → П, ld → ЛД). */
var GR_LATIN = {a:'А',b:'Б',v:'В',w:'В',g:'Г',d:'Д',e:'Е',z:'З',i:'И',k:'К',l:'Л',m:'М',n:'Н',o:'О',p:'П',r:'Р',s:'С',t:'Т',u:'У',f:'Ф',h:'Х',c:'Ц'};

var grTabOk = false, grTabRes = null, grUsersSeq = 0, grLoadSeq = 0;
var grMe = null;            // отговорът на action "me"
var grStore = '', grMonth = '';
var grView = 'grid';        // 'grid' | 'staff' | 'overview'
var grOverview = null;      // action "overview" за grMonth (етап 1е-1)
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
function grCanSee(){ return grTabOk; }
function grSyncButton(){
  var b = document.getElementById('tab-grafik');
  if(b) b.style.display = grCanSee() ? '' : 'none';
}
/* Табът — по отговора на grafik-api „me“ (списъкът beta е в grafik_access, без права за
   anon): ок → показан, 403 not_beta / 401 / мрежа → скрит. Истинската проверка остава в
   grafik-api при всяка заявка; отговорът пълни и grMe. */
function grLoadUsers(){
  var seq = ++grUsersSeq;
  return grApi('me', {}).then(function(res){
    if(seq === grUsersSeq){ grTabOk = !!res.ok; grTabRes = res; grMe = res.ok ? res.data : null; }
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
  return grLoadUsers().then(function(see){
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
    return grLoadPrev(seq).then(function(){
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
  grStore = s.store; grView = 'grid'; grSel = { r: 0, d: 0 };
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
      (trz ? '' : '<th>Служители</th>') + '<th>Извън нормата</th><th></th></tr></thead><tbody>';
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
  grVisible = grCalc.rows.map(function(x){ return x.staff; });
  if(grSel.r >= grVisible.length) grSel.r = Math.max(0, grVisible.length - 1);
  if(grSel.d >= grCalc.month.days) grSel.d = grCalc.month.days - 1;
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
function grRender(){
  var el = document.getElementById('mod-grafik');
  if(!el) return;
  if(grView === 'overview'){ el.innerHTML = grTitle() + grToolbar() + grOverviewHtml(); return; }
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
  h += '<button class="btn-sm" onclick="grExportTrz()" title="Excel файл по образеца на ТРЗ">📥 Excel за ТРЗ</button>';
  h += '<button class="btn-sm" onclick="grPrintGrafik()" title="График за явяване на работа — A4 хоризонтално, с подписи">🖨 Печат</button>';
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
    var er = grEmptyRow(x), tg = er ? x.norm : x.target, df = er ? -tg : x.diff;
    var dc = df === 0 ? '#16a34a' : '#dc2626';
    h += '<td>' + x.internal + '</td><td>' + x.official + '</td><td>' + tg + '</td>' +
      '<td class="gr-diff" style="color:' + dc + ';font-weight:700;" title="' + escAttrVal(er || x.message) + '">' + (df > 0 ? '+' : '') + df + '</td></tr>';
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
    var er = grEmptyRow(x);
    if(er) list.push({ t: 'norow', s: name + ': ' + er });
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
  return grFlushThen(function(){ grMonth = grShiftMonth(grMonth, n); grSel = { r: 0, d: 0 }; return grView === 'overview' ? grLoadOverview() : grLoadMonth(); });
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
  grView = v; grEdit = '';
  if(from === 'overview' || !grData) return grLoadMonth();
  grRender();
}
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
   часове 1–12 и служител без ред / с празен ред. Същото проверява и grafik-api (submit → 409
   off_norm със същия списък) — браузърът е само първата преграда. */
var GR_SUBMIT_HINT = 'Сложи кодове за дните или О/Б/Н; ако човекът не работи този месец — махни го от месеца.';
function grSubmitIssues(){
  var M = grCalc.month, out = [];
  grCalc.rows.forEach(function(x){
    var name = x.staff.full_name || x.staff.short_name || '', er = grEmptyRow(x);
    if(er) out.push(name + ': ' + er);
    else if(x.diff !== 0) out.push(name + ': ' + grHrsTxt(x.official) + ' ч. вместо ' + grHrsTxt(x.target) + ' ч.');
    var L = (grRows[x.staff.id] || {}).letters || [];
    for(var d = 0; d < M.days; d++) if(GrafikEngine.isHours(L[d] || '')) out.push(name + ': ' + L[d] + ' свободни ч. на ' + grPad(d + 1) + '.' + grPad(M.month) + ' — сложи код');
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
  var legend = (setup.codes || []).filter(function(c){
    var k = P.codes[c.code];
    return k && k.kind === 'work' && c.legend && (!c.seasons || !c.seasons.length || c.seasons.indexOf(season.charAt(0)) >= 0);
  }).map(function(c){ return c.code + ' – ' + c.legend; });
  ['О', 'Н', 'Б'].forEach(function(c){ var x = (setup.codes || []).filter(function(k){ return k.code === c; })[0]; if(x && x.legend) legend.push(c + ' – ' + x.legend); });
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
  var D0 = 3, DL = D0 + nd - 1, cDays = DL + 1, cHrs = DL + 2, cSig = DL + 3, cO = DL + 4, cB = DL + 5, cN = DL + 6;
  var C = function(i){ return grColName(i); }, thin = { style: 'thin' }, box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 22 }].concat(Array.apply(null, Array(nd)).map(function(){ return { width: 5.6 }; }))
    .concat([{ width: 8 }, { width: 9 }, { width: 11 }, { width: 6 }, { width: 6 }, { width: 6 }]);
  var put = function(addr, v, st){ var c = ws.getCell(addr); c.value = v; if(st){ for(var k in st) c[k] = st[k]; } return c; };
  var bold = { font: { name: 'Arial', size: 9, bold: true } }, norm9 = { font: { name: 'Arial', size: 9 } };
  ws.mergeCells('A1:C2'); put('A1', 'Предприятие: ' + H.company + ', ЕИК ' + H.eik, { font: { name: 'Arial', size: 9, bold: true }, alignment: { wrapText: true, vertical: 'top' } });
  ws.mergeCells(C(D0) + '1:' + C(DL) + '2');
  put(C(D0) + '1', (m.draft ? 'ЧЕРНОВА — ' : '') + 'График за явяване на работа ' + H.workDays + ' раб.дни/ ' + H.norm + ' часа',
    { font: { name: 'Arial', size: 12, bold: true, color: { argb: m.draft ? 'FFDC2626' : 'FF000000' } }, alignment: { horizontal: 'center', vertical: 'middle' } });
  ws.mergeCells(C(cDays) + '1:' + C(cN) + '4');
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
  [[cO, 'отпуск (О) дни'], [cB, 'болничен (Б) дни'], [cN, 'неплатен (Н) дни']].forEach(function(x){ ws.mergeCells(C(x[0]) + '5:' + C(x[0]) + '11'); put(C(x[0]) + '5', x[1], hd); });
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
  });
  var last = r0 + m.rows.length - 1, tr = last + 1, sum = function(col, key){
    var tot = m.rows.reduce(function(s, r){ return s + r[key]; }, 0);
    return { formula: m.rows.length ? 'SUM(' + col + r0 + ':' + col + last + ')' : '0', result: tot };
  };
  var tot = { font: { name: 'Arial', size: 9, bold: true }, border: box, alignment: { horizontal: 'center', vertical: 'middle' } };
  ws.mergeCells('A' + tr + ':' + C(DL) + tr); put('A' + tr, 'ВСИЧКО за обекта:', { font: { name: 'Arial', size: 9, bold: true }, border: box, alignment: { horizontal: 'right' } });
  put(C(cDays) + tr, sum(C(cDays), 'days'), tot); put(C(cHrs) + tr, sum(C(cHrs), 'hours'), tot); put(C(cSig) + tr, null, tot);
  put(C(cO) + tr, sum(C(cO), 'o'), tot); put(C(cB) + tr, sum(C(cB), 'b'), tot); put(C(cN) + tr, sum(C(cN), 'n'), tot);
  var lr = tr + 2;
  put('A' + lr, 'Работните смени при ' + (H.seasonLabel.indexOf('Лято') === 0 ? 'лятно' : 'зимно') + ' работно време (' + H.seasonLabel + ') са:', bold);
  m.legend.forEach(function(t, i){ put('A' + (lr + 1 + i), t, norm9); });
  put('A' + (lr + 2 + m.legend.length), 'Графиците се изготвят с междудневна почивка – не по-малко от 12 часа и междуседмична почивка – не по-малко от 36 часа.', norm9);
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
    '.grp-legend{columns:2;column-gap:8mm;font-size:6.5px;line-height:1.2;margin-top:1.5mm;}' +
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
    '<col style="width:7mm;"><col style="width:8mm;"><col style="width:5mm;"><col style="width:5mm;"><col style="width:5mm;"><col style="width:8mm;"><col style="width:17mm;">';
  var head = '<tr><th rowspan="2">№</th><th rowspan="2">Трите имена</th><th rowspan="2">Длъжност</th>';
  for(var d = 0; d < nd; d++) head += '<th class="' + (M.holiday[d] ? 'grp-hol' : M.dow[d] >= 6 ? 'grp-we' : '') + '">' + (d + 1) + '</th>';
  head += '<th rowspan="2">чов.<br>дни</th><th rowspan="2">чов.<br>часове</th><th rowspan="2">О</th><th rowspan="2">Б</th><th rowspan="2">Н</th><th rowspan="2">общо ч. вкл. О/Б/Н</th><th rowspan="2">Запознат / подпис</th></tr><tr>';
  for(d = 0; d < nd; d++) head += '<th class="' + (M.holiday[d] ? 'grp-hol' : M.dow[d] >= 6 ? 'grp-we' : '') + '">' + GR_DOW1[M.dow[d]] + '</th>';
  head += '</tr>';
  var body = m.rows.map(function(r, i){
    var h = '<tr class="grp-row' + (r.off ? ' grp-off' : '') + '"><td>' + (i + 1) + '</td><td class="grp-name">' + escVal(r.name) +
      (r.off ? '<span class="grp-off-note">' + escVal(r.off) + '</span>' : '') + '</td><td>' + escVal(r.title) + '</td>';
    for(var d = 0; d < nd; d++){
      var meta = r.cell[d + 1], cls = meta ? (meta.fill === GR_FILL.trip ? 'grp-trip' : 'grp-bad') : (M.holiday[d] ? 'grp-hol' : M.dow[d] >= 6 ? 'grp-we' : '');
      h += '<td class="' + cls + '"' + (meta && meta.note ? ' title="' + escAttrVal(meta.note) + '"' : '') + '>' + escVal(r.codes[d] || (meta && meta.text) || '') + '</td>';
    }
    return h + '<td>' + r.days + '</td><td>' + grHrsTxt(r.hours) + '</td><td>' + r.o + '</td><td>' + r.b + '</td><td>' + r.n + '</td><td>' + grHrsTxt(r.total) + '</td><td></td></tr>';
  }).join('');
  var tot = function(k){ return m.rows.reduce(function(s, r){ return s + r[k]; }, 0); };
  body += '<tr class="grp-total"><td colspan="' + (3 + nd) + '" style="text-align:right;font-weight:700;">ВСИЧКО за обекта:</td><td>' + tot('days') + '</td><td>' + grHrsTxt(tot('hours')) +
    '</td><td>' + tot('o') + '</td><td>' + tot('b') + '</td><td>' + tot('n') + '</td><td>' + grHrsTxt(tot('total')) + '</td><td></td></tr>';
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
          '<div class="grp-legend" id="grp-legend">' + m.legend.map(function(t){ return '<div>' + escVal(t) + '</div>'; }).join('') + '</div>' +
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
