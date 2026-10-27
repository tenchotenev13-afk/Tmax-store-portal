/* minusi.js — под-таб „➖ Минуси" в таба „Ревизии и преоценка", етап 1 (20.10.2026).
   Схема: minusi-schema.sql — minus_plants, minus_uploads, minus_movements,
   minus_reasons, minus_uom_thresholds + app_settings.minus_stores.

   Модел (решение 19–20.10.2026). SAP пуска 955 „Недостиг AUTO" при продажба
   без наличност; 956 „Сторно Недостиг AUTO" е обратното (количество със знак
   минус). Автоматично зануляване НЯМА — закрива обектът (ревизия → MIGO 956).
   Контролингът качва експорт MB51, който е НАТРУПАН (всеки файл носи всичко
   от 05.10 насам) — затова качването е insert on conflict do nothing по
   (Документ за материал, Позиция, година) и попълненото от обекта не се
   презаписва никога. Работи и при дневен файл.

   Закриване (FIFO): по обект + материал (независимо от завода — 5519 и 7519 са
   един обект) сумата на 956 закрива 955 редовете от най-стария (дата, после
   документ, после позиция). 956 над сумата на 955 → нищо не е отворено, а
   артикулът е „свръхсторно" — грешка на магазина, вижда го и обектът, и
   контролингът (решение на Миглена, 21.10.2026; до тогава — само контролингът).

   „📋 Дневен" (от 22.10.2026, решение на Миглена от 21.10): ВСИЧКИ редове 955
   — история, от която нищо не изчезва, за да личи кога минусът се повтаря.
   Всеки ред има „Състояние": незакрит / закрит дд.мм (датата на 956, който
   го закрива докрай) / остатък под прага. „📦 Незакрити по артикул" — само
   отворените.

   Праг по мерна единица (minus_uom_thresholds): остатък под min_qty не е
   „незакрит" (в Дневен — „остатък под прага", в „по артикул" не излиза).
   Единица без ред → всеки остатък ≠ 0 е незакрит.

   СУМИ НЯМА. Колоната „Сума в МестВал." от файла не се чете в payload-а и не
   се показва никъде — магазинът не вижда суми.

   Кой какво:
   · обект (manager / sklad) — своя обект; попълва заметнат код, причина (само
     от списъка), служител, бележка. Обект извън app_settings.minus_stores
     вижда „Модулът още не е включен за вашия обект" (под-бутонът си стои);
   · контролинг (admin / accounting / controlling) — качва файла, вижда отчета
     на качването, двата изгледа с избор на обект, филтър „непопълнени",
     свръхсторно. Не попълва вместо обекта.
   „Качва само контролинг" / „попълва само обектът" е проверка тук, не в
   базата (общ anon ключ — виж хедъра на схемата).

   Търсене, „Всички обекти", Excel и печат (22.10.2026, Миглена — писмо от
   21.10 и телефон): поле „🔍 Код" (Дневен — материал ИЛИ заметнат код; по
   артикул — материал), И с отметките; броячите в бутоните не се филтрират.
   „Всички обекти" — само контролингът (първа опция в „Обект", колона „Обект").
   „📥 Excel" и „🖨️ Печат" — текущият изглед с текущите филтри и търсене, без
   суми. Печатът е в #mod-print (образец pkPrintDeviations в picking.js);
   правилата от CLAUDE.md т.12 са изрично в mnPrintCss().

   Етап 2 — повторения (22.10.2026; Теодор 06.10, Миглена 21–22.10), по
   обект + материал, независимо от завода:
   · „предишен минус" на ред 955 — най-близкият по-ранен 955 (дата, документ,
     позиция); значка „↻ предишен дд.мм" под описанието, цвят по давност
     (≤7 дни червено, 8–30 оранжево, >30 жълто), лилав „×N за 30 дни" при N ≥ 2
     (955 с дата в [датата − 29; датата]);
   · „повторение" — предишен минус до N дни включително, N =
     app_settings.minus_repeat_days (липсва / невалидно → 10). Само там има
     поле „Действие" (minus_movements.action) и при „Запази" е задължително;
   · „сторно преди минуса" — 956, който закрива реда (изцяло или частично), е
     с по-ранна дата от 955. Грешка на магазина: червено в „Състояние" и
     втора таблица в червената карта. Същата дата не е грешка.
   Ширината на „Дневен" не се мени — нищо от това не е нова колона.

   Задължителна бележка (22.10.2026, Тенчо): причина с
   minus_reasons.requires_note (днес само „клиентска поръчка (номер/дата)")
   не се записва без „Бележка" — номерът и датата на поръчката. Вече записан
   ред с такава причина и празна бележка показва „попълни номер/дата" под
   бележката и влиза в „само непопълнени".

   Брояч и „Днес" (23.10.2026, решение на Тенчо): „непопълнен" = НЕЗАКРИТ
   (calc.open) и mnUnfilled. Закритите не се броят. Обектът (manager / sklad)
   вижда „➖ Минуси (N)" на под-бутона — зарежда се при отваряне на „Ревизии и
   преоценка" (mnLoadBadge, вика го showModule) и се обновява при всяко
   прерисуване на модула; без polling, без push от браузъра (CLAUDE.md т.14 —
   известието е тема minus_unfilled в bulletin-notify, с копие на същото
   изчисление). „Днес" (today.js) чете mnLoadSummary. Клик по push-а отваря
   #mn → mnDeepLinkBoot.

   Етап 4а — връзка с Клиентски заявки (27.10.2026, решение на Тенчо
   „подсказка + избор"; повод — писмо на Миглена от 27.10). Ред 955 съвпада
   със заявка на СЪЩИЯ обект (client_orders.store_name, не fulfiller), с код =
   материала (items[].sap, при стар запис без items — колоната sap; trim,
   сравнение като низ), дата на заявката в [дата на минуса − 7; + 7], статус
   ≠ refused. Заявките се теглят с ЕДНА заявка (mnLoadCo) СЛЕД рисуването —
   грешка → без подсказки + сив ред „Клиентските заявки не се заредиха".
   „📋 Дневен": чип „🧾 КЗ <№> · <статус>" под описанието (клик → детайлът на
   заявката, openClientOrderDetail от client-orders.js), търсене и по № на КЗ,
   Excel колона „КЗ", печат — № под описанието. Обектът при причина с
   requires_note вижда „↳ <№> / <дата>" под бележката — кликът попълва
   бележката, не записва. „📦 По артикул", minus_unfilled, „Днес" и
   bulletin-notify не знаят за КЗ. */

var mnMovs = [];
var mnReasons = [];
var mnThresholds = {};   /* нормализирана мерна единица → min_qty */
var mnPlants = {};       /* завод → store_name */
var mnStoresOn = [];     /* app_settings.minus_stores */
var mnStore = '';
var mnView = 'daily';    /* 'daily' | 'bymat' */
var mnOnlyUnfilled = false;
var mnOnlyOpen = false;  /* „само незакрити" в Дневен — за обекта и контролинга */
var mnSearch = '';       /* „🔍 Код" — материал или заметнат код */
var MN_ALL = '__all__';  /* mnStore за „Всички обекти" — само контролингът */
var MN_REPEAT_DEFAULT = 10;
var mnRepeatDays = MN_REPEAT_DEFAULT; /* app_settings.minus_repeat_days */
var mnReport = null;     /* отчет на последното качване в тази сесия */
var mnLastUpload = null;
var mnDraft = {};        /* id → {real_code, reason_id, employee_name, note} — незаписаното */
var mnLoadErr = '';
var mnLoadSeq = 0;
var mnBusy = false;
var mnCoIdx = {};        /* store_name + \u0001 + код → [клиентски заявки] */
var mnCoErr = false;     /* клиентските заявки не се заредиха */
var MN_CO_DAYS = 7;

var MN_STORE_ROLES = ['manager', 'sklad'];
var MN_CO_ROLES = ['admin', 'accounting', 'controlling'];
var MN_EPS = 1e-9;
/* Колоните от файла „от САП" — търсят се по ИМЕ (нормализирано: интервали,
   малки букви). „Сума в МестВал." нарочно НЕ е тук. */
var MN_COLS = {
  plant: 'завод', material: 'материал', desc: 'описание на материал', mvt: 'вид движение',
  qty: 'колич. в ед. въвежд.', uom: 'единица на запис', doc: 'документ за материал',
  item: 'позиция докум.матер.', date: 'дата осчетоводяване', htext: 'текст общи данни док'
};
var MN_REQUIRED = ['plant', 'material', 'mvt', 'qty', 'uom', 'doc', 'item', 'date'];
var MN_COL_LABEL = {
  plant: 'Завод', material: 'Материал', desc: 'Описание на материал', mvt: 'Вид движение',
  qty: 'Колич. в ед. въвежд.', uom: 'Единица на запис', doc: 'Документ за материал',
  item: 'Позиция докум.матер.', date: 'Дата осчетоводяване', htext: 'Текст общи данни док'
};
var MN_MOV_COLS = 'id,plant,store_name,material,material_desc,mvt_type,qty,uom,mat_doc,doc_item,doc_year,posting_date,real_code,reason_id,employee_name,note,action,filled_by,filled_at';

/* ─── Роли ─────────────────────────────────────────────── */
function mnIsStoreUser(){ return !!currentUser && MN_STORE_ROLES.indexOf(currentUser.role) >= 0; }
function mnIsCO(){ return !!currentUser && MN_CO_ROLES.indexOf(currentUser.role) >= 0; }
function mnCanSee(){ return mnIsStoreUser() || mnIsCO(); }
function mnCanFill(){ return mnIsStoreUser() && !!mnStore && mnStore === currentUser.store_name; }
function mnParseStores(v){
  return String(v == null ? '' : v).split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}
function mnStoreOn(store){ return !!store && mnStoresOn.indexOf(store) >= 0; }
/* Под-бутонът „➖ Минуси" (25.10.2026, пилот): контролингът — винаги; обектът
   — само ако е в minus_stores. Пазачът вътре (mnCanSee + „още не е включен")
   остава. До отговора на mnLoadStoresFlag() бутонът на обекта е скрит. */
function mnTabVisible(){ return mnIsCO() || (mnIsStoreUser() && mnStoreOn(currentUser.store_name)); }
var mnStoresSeq = 0;
var mnStoresReady = null; /* обещанието на последното четене — Бюлетинът го чака */
var mnStoresDone = false;
function mnLoadStoresFlag(){
  var seq = ++mnStoresSeq;
  mnStoresDone = false;
  mnStoresReady = sbGetOk('app_settings', 'key=eq.minus_stores&select=key,value').then(function(r){
    var row = r && r.ok ? r.rows.filter(function(x){ return x && x.key === 'minus_stores'; })[0] : null;
    if(seq === mnStoresSeq){ mnStoresOn = mnParseStores(row && row.value); mnStoresDone = true; }
  }).catch(function(){
    if(seq === mnStoresSeq){ mnStoresOn = []; mnStoresDone = true; }
  });
  return mnStoresReady;
}
function mnIsAll(){ return mnIsCO() && mnStore === MN_ALL; }
function mnStoreLabel(){ return mnIsAll() ? 'Всички обекти' : mnStore; }

/* ─── Числа, дати, единици ─────────────────────────────── */
function mnRound(x){ return Math.round(Number(x) * 1e6) / 1e6; }
function mnNum(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/\s/g, '');
  if(!s) return null;
  if(s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if(!/^-?\d*\.?\d+$/.test(s)) return null;
  return parseFloat(s);
}
function mnFmtQty(n){
  if(n == null || !isFinite(n)) return '';
  return String(mnRound(Math.round(Number(n) * 1000) / 1000)).replace('.', ',');
}
/* „Бр.“ = „БР“; кирилските двойници на латински букви се свеждат до латиница,
   за да не зависи прагът от това с какво е написано „M2“ в SAP. */
var MN_LOOKALIKE = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X' };
function mnNormUom(u){
  return String(u == null ? '' : u).trim().toUpperCase().replace(/\.+$/, '').replace(/[АВЕКМНОРСТХ]/g, function(c){ return MN_LOOKALIKE[c]; });
}
function mnCode(v){ return String(v == null ? '' : v).trim().replace(/\.0+$/, ''); }
function mnItem(v){ var s = mnCode(v); return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s; }
function mnPad(n){ return String(n).padStart(2, '0'); }
/* Дата от клетка: dd.mm.yyyy, yyyy-mm-dd, Date или сериен номер на Excel. → 'yyyy-mm-dd' | null */
function mnDate(v){
  if(v == null || v === '') return null;
  if(v instanceof Date && !isNaN(v.getTime())) return v.getFullYear() + '-' + mnPad(v.getMonth() + 1) + '-' + mnPad(v.getDate());
  if(typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000){
    var d = new Date(Math.round((v - 25569) * 86400000));
    return d.getUTCFullYear() + '-' + mnPad(d.getUTCMonth() + 1) + '-' + mnPad(d.getUTCDate());
  }
  var s = String(v).trim(), m;
  if((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return m[3] + '-' + mnPad(m[2]) + '-' + mnPad(m[1]);
  if((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}
/* Цяло число ≥ 1, иначе 10 (липсващ ключ, празно, боклук). */
function mnParseRepeatDays(v){
  var s = String(v == null ? '' : v).trim();
  if(!/^\d+$/.test(s)) return MN_REPEAT_DEFAULT;
  var n = parseInt(s, 10);
  return n >= 1 ? n : MN_REPEAT_DEFAULT;
}
/* Дни от a до b ('yyyy-mm-dd'); b по-късна → положително. */
function mnDays(a, b){
  var pa = String(a).split('-'), pb = String(b).split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
}
function mnReasonNeedsNote(id){
  for(var i = 0; i < mnReasons.length; i++) if(String(mnReasons[i].id) === String(id)) return mnReasons[i].requires_note === true;
  return false;
}
/* Записан ред с причина, която иска бележка, а бележката е празна. */
function mnNoteMissing(r){ return r.reason_id != null && mnReasonNeedsNote(r.reason_id) && !String(r.note || '').trim(); }
function mnUnfilled(r){ return r.reason_id == null || (!!r._repeat && !String(r.action || '').trim()) || mnNoteMissing(r); }
var MN_NOTE_MISSING = '<div class="mn-note-missing" style="color:#b91c1c;font-size:11px;font-weight:600;margin-top:2px;">попълни номер/дата</div>';
function mnFmtTs(ts){
  if(!ts) return '';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '';
  return mnPad(d.getDate()) + '.' + mnPad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + mnPad(d.getHours()) + ':' + mnPad(d.getMinutes());
}

/* ─── Закриване (FIFO) и праг ──────────────────────────── */
function mnCmp955(a, b){
  var x = String(a.posting_date).localeCompare(String(b.posting_date));
  if(x) return x;
  x = String(a.mat_doc).localeCompare(String(b.mat_doc), undefined, { numeric: true });
  if(x) return x;
  return String(a.doc_item).localeCompare(String(b.doc_item), undefined, { numeric: true });
}
/* Видим ли е остатък rest в мерна единица uom (праг по единица). */
function mnPassThreshold(rest, uom, thr){
  rest = mnRound(rest);
  if(!(rest > MN_EPS)) return false;
  var k = mnNormUom(uom);
  if(thr && Object.prototype.hasOwnProperty.call(thr, k)) return rest >= mnRound(thr[k]) - MN_EPS;
  return true;
}
/* Чисто изчисление, без DOM. → {all:[…], open:[…], byMat:[…], over:[…]}
   all — всеки ред 955 + _rest, _state, _closedOn; open — само незакритите;
   byMat — един ред на материал с остатък над прага; over — свръхсторно
   (956 над 955). */
function mnCompute(movs, thr, repeatDays){
  var N = repeatDays != null ? repeatDays : mnRepeatDays;
  var groups = {}, order = [];
  (movs || []).forEach(function(m){
    var k = m.store_name + '\u0001' + m.material;
    if(!groups[k]){ groups[k] = { store_name: m.store_name, material: m.material, desc: '', uom: '', r955: [], r956: [], s955: 0, s956: 0 }; order.push(k); }
    var g = groups[k], q = Number(m.qty) || 0;
    if(m.material_desc) g.desc = m.material_desc;
    if(String(m.mvt_type) === '955'){ g.r955.push(m); g.s955 += q; if(m.uom) g.uom = m.uom; }
    else if(String(m.mvt_type) === '956'){ g.r956.push(m); g.s956 += q; if(!g.uom && m.uom) g.uom = m.uom; }
  });
  /* all — ВСИЧКИ редове 955 (история; решение на Миглена 21.10.2026: от
     „Дневен" нищо не изчезва), всеки със _state: 'open' (остатък ≥ прага),
     'under' (0 < остатък < прага) или 'closed' (остатък 0; _closedOn = датата
     на 956, който го е закрил ДОКРАЙ). open — само 'open' (броячът и
     „само незакрити"). FIFO: 956 се подреждат по дата, документ, позиция и
     закриват 955 от най-стария. */
  /* early — двойки (955, 956) „сторно преди минуса" за червената карта. */
  var out = { all: [], open: [], byMat: [], over: [], early: [] };
  order.forEach(function(k){
    var g = groups[k];
    var net = mnRound(g.s955 + g.s956);
    if(net < -MN_EPS) out.over.push({ store_name: g.store_name, material: g.material, desc: g.desc, uom: g.uom, s955: mnRound(g.s955), s956: mnRound(g.s956), rest: net });
    var q956 = g.r956.slice().sort(mnCmp955), qi = 0;
    var avail = q956.map(function(m){ return mnRound(-(Number(m.qty) || 0)); });
    var s955 = g.r955.slice().sort(mnCmp955);
    s955.forEach(function(r, i){
      var need = Number(r.qty) || 0, lastDate = null, early = [];
      while(need > MN_EPS && qi < q956.length){
        if(!(avail[qi] > MN_EPS)){ qi++; continue; }
        var take = Math.min(need, avail[qi]);
        need = mnRound(need - take);
        avail[qi] = mnRound(avail[qi] - take);
        lastDate = q956[qi].posting_date;
        if(take > MN_EPS && String(q956[qi].posting_date) < String(r.posting_date)) early.push(q956[qi]);
        if(!(avail[qi] > MN_EPS)) qi++;
      }
      var rest = mnRound(need);
      var st = !(rest > MN_EPS) ? 'closed' : mnPassThreshold(rest, r.uom, thr) ? 'open' : 'under';
      var prev = i > 0 ? s955[i - 1] : null;
      var prevDays = prev ? mnDays(prev.posting_date, r.posting_date) : null;
      var cnt30 = s955.filter(function(x){ var d = mnDays(x.posting_date, r.posting_date); return d >= 0 && d <= 29; }).length;
      var row = Object.assign({}, r, {
        _rest: rest, _state: st, _closedOn: st === 'closed' ? lastDate : null,
        _prevDate: prev ? prev.posting_date : null, _prevDays: prevDays, _cnt30: cnt30,
        _repeat: !!prev && prevDays <= N, _early: early.length > 0
      });
      out.all.push(row);
      if(st === 'open') out.open.push(row);
      early.forEach(function(m6){ out.early.push({ row: row, m956: m6 }); });
    });
    if(net >= -MN_EPS && mnPassThreshold(net, g.uom, thr)) out.byMat.push({ store_name: g.store_name, material: g.material, desc: g.desc, uom: g.uom, s955: mnRound(g.s955), s956: mnRound(g.s956), rest: net });
  });
  var newest = function(a, b){ return String(b.posting_date).localeCompare(String(a.posting_date)) || String(a.material).localeCompare(String(b.material), undefined, { numeric: true }); };
  out.all.sort(newest);
  out.open.sort(newest);
  var byMatSort = function(a, b){ return String(a.material).localeCompare(String(b.material), undefined, { numeric: true }) || String(a.store_name).localeCompare(String(b.store_name), 'bg'); };
  out.byMat.sort(byMatSort);
  out.over.sort(byMatSort);
  out.early.sort(function(a, b){ return byMatSort(a.row, b.row) || mnCmp955(a.row, b.row); });
  return out;
}

/* ─── Файлът „от САП" ──────────────────────────────────── */
function mnHdr(x){ return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase(); }
/* Чете aoa и връща {error} или {rows, total, unknown:{завод:брой}, other:{вид:брой}, bad, dupes, dateFrom, dateTo}.
   Без запис — отделено за теста. Сумата не се чете. */
function mnParseSap(aoa, plants){
  if(!Array.isArray(aoa) || !aoa.length) return { error: 'Файлът е празен' };
  var hi = -1, hdr = null;
  for(var i = 0; i < Math.min(aoa.length, 10); i++){
    var h = (aoa[i] || []).map(mnHdr);
    if(h.indexOf(MN_COLS.doc) >= 0 || h.indexOf(MN_COLS.plant) >= 0){ hi = i; hdr = h; break; }
  }
  if(hi < 0){ hi = 0; hdr = (aoa[0] || []).map(mnHdr); }
  var idx = {};
  Object.keys(MN_COLS).forEach(function(k){ idx[k] = hdr.indexOf(MN_COLS[k]); });
  var missing = MN_REQUIRED.filter(function(k){ return idx[k] < 0; });
  if(missing.length) return { error: 'Липсва колона: ' + missing.map(function(k){ return '„' + MN_COL_LABEL[k] + '"'; }).join(', ') };
  var out = { rows: [], total: 0, unknown: {}, other: {}, bad: 0, dupes: 0, dateFrom: null, dateTo: null };
  var seen = {};
  for(var r = hi + 1; r < aoa.length; r++){
    var row = aoa[r] || [];
    if(!row.some(function(c){ return c !== '' && c != null; })) continue;
    out.total++;
    var mvt = mnCode(row[idx.mvt]);
    if(mvt !== '955' && mvt !== '956'){ out.other[mvt || '—'] = (out.other[mvt || '—'] || 0) + 1; continue; }
    var plant = mnCode(row[idx.plant]);
    var store = plants && plants[plant];
    if(!store){ out.unknown[plant || '—'] = (out.unknown[plant || '—'] || 0) + 1; continue; }
    var date = mnDate(row[idx.date]);
    var qty = mnNum(row[idx.qty]);
    var material = mnCode(row[idx.material]);
    var doc = mnCode(row[idx.doc]), item = mnItem(row[idx.item]);
    if(!date || qty == null || !material || !doc || !item){ out.bad++; continue; }
    var year = parseInt(date.slice(0, 4), 10);
    var key = doc + '|' + item + '|' + year;
    if(seen[key]){ out.dupes++; continue; }
    seen[key] = 1;
    out.rows.push({
      plant: plant, store_name: store, material: material,
      material_desc: idx.desc >= 0 ? String(row[idx.desc] == null ? '' : row[idx.desc]).trim() : '',
      mvt_type: mvt, qty: qty, uom: String(row[idx.uom] == null ? '' : row[idx.uom]).trim(),
      mat_doc: doc, doc_item: item, doc_year: year, posting_date: date,
      header_text: idx.htext >= 0 ? (String(row[idx.htext] == null ? '' : row[idx.htext]).trim() || null) : null
    });
    if(!out.dateFrom || date < out.dateFrom) out.dateFrom = date;
    if(!out.dateTo || date > out.dateTo) out.dateTo = date;
  }
  return out;
}
function mnWithXlsx(cb){
  if(window.XLSX){ cb(); return; }
  var sc = document.createElement('script');
  sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  sc.onload = cb;
  sc.onerror = function(){ toast('Грешка при зареждане на SheetJS', '#dc2626'); };
  document.head.appendChild(sc);
}
function mnImportFile(input){
  var f = input && input.files && input.files[0];
  if(!f) return;
  input.value = '';
  mnWithXlsx(function(){
    var rd = new FileReader();
    rd.onload = function(e){
      var aoa;
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
      } catch(err){ toast('Файлът не може да се прочете: ' + err.message, '#dc2626'); return; }
      mnImportAoa(aoa, f.name);
    };
    rd.readAsArrayBuffer(f);
  });
}
/* POST с on conflict do nothing — връща само реално вмъкнатите редове. */
function mnPostIgnoreDup(rows){
  var url = API + '/minus_movements?on_conflict=mat_doc,doc_item,doc_year&select=id';
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({}, H, { 'Prefer': 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify(rows)
  }).then(function(r){
    return r.json().catch(function(){ return null; }).then(function(d){
      if(!r.ok) return sbWriteFail('mnPostIgnoreDup', url, r.status, d);
      return { ok: true, inserted: Array.isArray(d) ? d.length : 0 };
    });
  }).catch(sbNetFail('mnPostIgnoreDup', url));
}
function mnImportAoa(aoa, fileName){
  if(!mnIsCO()){ toast('Качването е само за контролинга', '#dc2626'); return Promise.resolve(null); }
  if(mnBusy) return Promise.resolve(null);
  var p = mnParseSap(aoa, mnPlants);
  if(p.error){ toast(p.error + ' — нищо не е качено', '#dc2626'); return Promise.resolve({ error: p.error }); }
  var rep = { file: fileName || '', total: p.total, valid: p.rows.length, inserted: 0, already: 0, failed: 0,
    unknown: p.unknown, other: p.other, bad: p.bad, dupes: p.dupes, dateFrom: p.dateFrom, dateTo: p.dateTo };
  mnBusy = true;
  var who = currentUser.display_name || currentUser.email || '';
  return sbPostReturn('minus_uploads', { uploaded_by: who, file_name: fileName || null, rows_total: p.rows.length, rows_new: 0, date_from: p.dateFrom, date_to: p.dateTo }).then(function(res){
    if(!res.ok || !res.row){ mnBusy = false; toast('Качването не е записано: ' + sbErrMsg(res), '#dc2626'); return { error: sbErrMsg(res) }; }
    var upId = res.row.id;
    var chain = Promise.resolve();
    for(var i = 0; i < p.rows.length; i += 500){
      (function(chunk){
        chain = chain.then(function(){
          return mnPostIgnoreDup(chunk.map(function(x){ return Object.assign({ upload_id: upId }, x); })).then(function(r){
            if(r.ok) rep.inserted += r.inserted; else rep.failed += chunk.length;
          });
        });
      })(p.rows.slice(i, i + 500));
    }
    return chain.then(function(){
      rep.already = rep.valid - rep.inserted - rep.failed;
      return sbPatch('minus_uploads', 'id=eq.' + encodeURIComponent(upId), { rows_new: rep.inserted });
    }).then(function(){
      mnBusy = false;
      mnReport = rep;
      var bad = rep.failed || Object.keys(rep.unknown).length;
      toast('Качване: нови ' + rep.inserted + ', вече качени ' + rep.already + (rep.failed ? ', НЕЗАПИСАНИ ' + rep.failed : ''), bad ? '#dc2626' : '#16a34a');
      return loadMinusi().then(function(){ return rep; });
    });
  });
}

/* ─── Зареждане ────────────────────────────────────────── */
function mnTitle(){ return '<div class="pg-title">➖ Минуси</div>'; }
function loadMinusi(){
  var el = document.getElementById('mod-minusi');
  if(!el) return Promise.resolve();
  if(!mnCanSee()){ el.innerHTML = mnTitle() + '<div class="card">Нямаш достъп до този модул.</div>'; return Promise.resolve(); }
  var seq = ++mnLoadSeq;
  if(!mnMovs.length) el.innerHTML = mnTitle() + '<div style="padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
  return Promise.all([
    sbGetOk('app_settings', 'key=in.(minus_stores,minus_repeat_days)&select=key,value'),
    sbGetOk('minus_plants', 'select=plant,store_name'),
    sbGetOk('minus_reasons', 'select=id,label,active,sort,requires_note&order=sort.asc,id.asc'),
    sbGetOk('minus_uom_thresholds', 'select=uom,min_qty')
  ]).then(function(rs){
    if(seq !== mnLoadSeq) return;
    var bad = rs.filter(function(r){ return !r.ok; })[0];
    if(bad){ mnLoadErr = bad.error; mnRenderErr(); return; }
    mnApplyConfig(rs[0].rows, rs[2].rows, rs[3].rows);
    mnPlants = {};
    rs[1].rows.forEach(function(p){ mnPlants[mnCode(p.plant)] = p.store_name; });
    if(mnIsStoreUser()) mnStore = currentUser.store_name || '';
    else if(mnStore !== MN_ALL && (!mnStore || mnStoreList().indexOf(mnStore) < 0)) mnStore = mnStoresOn.filter(function(s){ return mnStoreList().indexOf(s) >= 0; })[0] || mnStoreList()[0] || '';
    if(mnIsStoreUser() && !mnStoreOn(mnStore)){ mnMovs = []; mnRender(); return; }
    /* „Всички обекти" (само контролингът) — без филтър по обект. */
    var q = 'select=' + MN_MOV_COLS + (mnIsAll() ? '' : '&store_name=eq.' + encodeURIComponent(mnStore)) + '&order=posting_date.asc,mat_doc.asc,doc_item.asc,id.asc';
    var reads = [sbGetAll('minus_movements', q)];
    if(mnIsCO()) reads.push(sbGetOk('minus_uploads', 'select=*&order=uploaded_at.desc&limit=1'));
    return Promise.all(reads).then(function(r2){
      if(seq !== mnLoadSeq) return;
      if(r2[0].partial){ mnLoadErr = 'движенията не се заредиха изцяло'; mnRenderErr(); return; }
      mnLoadErr = '';
      mnMovs = r2[0];
      mnLastUpload = r2[1] && r2[1].ok ? (r2[1].rows[0] || null) : null;
      mnRender();
      return mnLoadCo(seq);
    });
  });
}
/* Настройките, причините и праговете — общо за loadMinusi и mnLoadSummary. */
function mnApplyConfig(settingsRows, reasonsRows, thrRows){
  var row = settingsRows.filter(function(r){ return r && r.key === 'minus_stores'; })[0];
  mnStoresOn = mnParseStores(row && row.value);
  var rd = settingsRows.filter(function(r){ return r && r.key === 'minus_repeat_days'; })[0];
  mnRepeatDays = mnParseRepeatDays(rd && rd.value);
  mnReasons = reasonsRows;
  mnThresholds = {};
  thrRows.forEach(function(t){ mnThresholds[mnNormUom(t.uom)] = Number(t.min_qty); });
}
function mnRenderErr(){
  var el = document.getElementById('mod-minusi');
  if(el) el.innerHTML = mnTitle() + '<div id="mn-load-err" class="card" style="color:#b91c1c;">⚠ Минусите не се заредиха: ' + esc(mnLoadErr) + '</div>';
  toast('Минусите не се заредиха: ' + mnLoadErr, '#dc2626');
}
function mnStoreList(){
  var seen = {}, out = [];
  Object.keys(mnPlants).forEach(function(k){ var s = mnPlants[k]; if(s && !seen[s]){ seen[s] = 1; out.push(s); } });
  return out.sort(function(a, b){ return a.localeCompare(b, 'bg'); });
}

/* ─── Клиентски заявки (етап 4а) ───────────────────────── */
function mnAddDays(d, n){
  var p = String(d).split('-'), x = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return x.getUTCFullYear() + '-' + mnPad(x.getUTCMonth() + 1) + '-' + mnPad(x.getUTCDate());
}
function mnCoKey(v){ return String(v == null ? '' : v).trim(); }
/* Кодовете на заявката: items[].sap, а при стар запис без items — колоната sap. */
function mnCoCodes(o){
  var its = Array.isArray(o.items) && o.items.length ? o.items.map(function(it){ return it && it.sap; }) : [o.sap];
  var seen = {}, out = [];
  its.forEach(function(c){ var k = mnCoKey(c); if(k && !seen[k]){ seen[k] = 1; out.push(k); } });
  return out;
}
/* Чисто: заявки → индекс по обект + код. Отказаните и без валидна дата — вън. */
function mnCoBuildIdx(rows){
  var idx = {};
  (rows || []).forEach(function(o){
    if(!o || o.status === 'refused' || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.date || ''))) return;
    mnCoCodes(o).forEach(function(c){
      var k = o.store_name + '\u0001' + c;
      (idx[k] = idx[k] || []).push(o);
    });
  });
  return idx;
}
/* Заявките за ред 955: същият обект, същият код, |дата − дата на минуса| ≤ 7. */
function mnCoMatches(r){
  var list = mnCoIdx[r.store_name + '\u0001' + mnCoKey(r.material)] || [];
  return list.filter(function(o){ return Math.abs(mnDays(r.posting_date, o.date)) <= MN_CO_DAYS; })
    .sort(function(a, b){ return String(a.date).localeCompare(String(b.date)) || String(a.in_num || '').localeCompare(String(b.in_num || ''), 'bg', { numeric: true }); });
}
/* Една заявка за показаните обекти и прозореца от дати. Вика се СЛЕД
   mnRender — таблицата не чака; при отговор се прерисува само #mn-body. */
function mnLoadCo(seq){
  var r955 = mnMovs.filter(function(m){ return String(m.mvt_type) === '955' && m.posting_date; });
  if(!r955.length){ mnCoIdx = {}; mnCoErr = false; return Promise.resolve(); }
  var stores = [], seen = {}, from = null, to = null;
  r955.forEach(function(m){
    if(!seen[m.store_name]){ seen[m.store_name] = 1; stores.push(m.store_name); }
    if(!from || m.posting_date < from) from = m.posting_date;
    if(!to || m.posting_date > to) to = m.posting_date;
  });
  var q = 'select=id,in_num,store_name,date,status,sap,items' +
    '&store_name=in.(' + stores.map(function(s){ return '"' + encodeURIComponent(s) + '"'; }).join(',') + ')' +
    '&date=gte.' + mnAddDays(from, -MN_CO_DAYS) + '&date=lte.' + mnAddDays(to, MN_CO_DAYS) + '&order=date.asc,id.asc';
  return sbGetAll('client_orders', q).then(function(rows){
    if(seq !== mnLoadSeq) return;
    mnCoErr = !!rows.partial;
    mnCoIdx = mnCoErr ? {} : mnCoBuildIdx(rows);
  }).catch(function(){
    if(seq !== mnLoadSeq) return;
    mnCoErr = true; mnCoIdx = {};
  }).then(function(){
    if(seq === mnLoadSeq && document.getElementById('mn-body')) mnRenderBody();
  });
}
/* Чип „🧾 КЗ <№> · <статус>" под описанието — пренася се, не разширява колоната. */
function mnCoChipsHtml(r){
  var ms = mnCoMatches(r);
  if(!ms.length) return '';
  var open = typeof openClientOrderDetail === 'function';
  return '<div class="mn-co" style="margin-top:3px;font-size:11px;">' + ms.map(function(o){
    return '<span class="mn-co-chip" data-co-id="' + escAttr(String(o.id)) + '"' +
      (open ? ' onclick="mnOpenCo(this.getAttribute(\'data-co-id\'))" title="Отвори заявката"' : '') +
      ' style="display:inline-block;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:0 4px;margin:1px 2px 0 0;' + (open ? 'cursor:pointer;' : '') + '">🧾 КЗ ' +
      esc(o.in_num || '—') + ' · ' + esc(typeof statusLabel === 'function' ? statusLabel(o.status || 'pending') : (o.status || '')) + '</span>';
  }).join('') + '</div>';
}
/* Детайлът на заявката е в client-orders.js и търси реда в заредените масиви;
   тук се дочита пълният ред и се слага в _coNotifyRows — същият път, по който
   звънецът отваря заявка без зареден списък (notifications.js). */
function mnOpenCo(id){
  if(typeof openClientOrderDetail !== 'function') return Promise.resolve(false);
  return sbGetOk('client_orders', 'id=eq.' + encodeURIComponent(id) + '&select=*').then(function(res){
    var o = res && res.ok ? res.rows[0] : null;
    if(!o){ toast('Заявката не се зареди', '#dc2626'); return false; }
    if(typeof _coNotifyRows !== 'undefined' && _coNotifyRows) _coNotifyRows[String(o.id)] = o;
    openClientOrderDetail(o.id);
    return true;
  });
}
/* „↳ <№> / <дата>" под бележката — само за обекта, само при причина с requires_note. */
function mnCoPickHtml(id, reasonId){
  if(!reasonId || !mnReasonNeedsNote(reasonId)) return '';
  var r = null;
  mnMovs.forEach(function(m){ if(String(m.id) === String(id)) r = m; });
  if(!r) return '';
  return mnCoMatches(r).map(function(o){
    var lbl = (o.in_num || '—') + ' / ' + fmtDate(o.date);
    return '<button type="button" class="mn-co-use" data-co-txt="' + escAttrVal('КЗ ' + lbl) + '"' +
      ' onclick="mnCoUse(\'' + escAttr(String(id)) + '\',this.getAttribute(\'data-co-txt\'))"' +
      ' style="display:block;max-width:110px;white-space:normal;text-align:left;margin-top:3px;font-size:11px;padding:1px 5px;border:1px solid #7dd3fc;background:#f0f9ff;color:#0369a1;border-radius:4px;cursor:pointer;">↳ ' + esc(lbl) + '</button>';
  }).join('');
}
function mnCoPickToggle(id, reasonId){
  var el = document.getElementById('mn-co-pick-' + id);
  if(el) el.innerHTML = mnCoPickHtml(id, reasonId);
}
/* Попълва бележката — не записва; „Запази" остава отделно. */
function mnCoUse(id, txt){
  var e = document.getElementById('mn-note-' + id);
  if(e) e.value = txt;
}

/* ─── Рендер ───────────────────────────────────────────── */
function mnReasonLabel(id){
  for(var i = 0; i < mnReasons.length; i++) if(String(mnReasons[i].id) === String(id)) return mnReasons[i].label;
  return '';
}
function mnCaptureDrafts(){
  var root = document.getElementById('mod-minusi');
  if(!root) return;
  root.querySelectorAll('tr[data-mn-id]').forEach(function(tr){
    var id = tr.getAttribute('data-mn-id');
    var g = function(p){ var e = document.getElementById(p + id); return e ? e.value : null; };
    if(g('mn-code-') == null) return;
    mnDraft[id] = { real_code: g('mn-code-'), reason_id: g('mn-reason-'), employee_name: g('mn-emp-'), note: g('mn-note-'), action: g('mn-action-') };
  });
}
function mnRender(){
  var el = document.getElementById('mod-minusi');
  if(!el) return;
  mnCaptureDrafts();
  var h = mnTitle();
  if(mnIsStoreUser() && !mnStoreOn(mnStore)){
    el.innerHTML = h + '<div id="mn-off" class="card" style="color:#64748b;">Модулът още не е включен за вашия обект.</div>';
    mnSetBadge(0);
    return;
  }
  if(mnIsCO()) h += mnUploadHtml();
  var calc = mnCompute(mnMovs, mnThresholds);
  if(mnIsStoreUser()) mnSetBadge(calc.open.filter(mnUnfilled).length);
  h += '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(mnIsCO()){
    h += '<label style="font-weight:600;">Обект:</label><select id="mn-store" onchange="mnSetStore(this.value)">';
    h += '<option value="' + MN_ALL + '"' + (mnIsAll() ? ' selected' : '') + '>Всички обекти</option>';
    mnStoreList().forEach(function(s){ h += '<option value="' + escAttr(s) + '"' + (s === mnStore ? ' selected' : '') + '>' + esc(s) + (mnStoreOn(s) ? '' : ' (не е включен)') + '</option>'; });
    h += '</select>';
  } else h += '<b>' + esc(mnStore) + '</b>';
  h += '<button id="mn-v-daily" class="filter-btn' + (mnView === 'daily' ? ' active' : '') + '" onclick="mnSetView(\'daily\')">📋 Дневен (общо ' + calc.all.length + ' · незакрити ' + calc.open.length + ')</button>';
  h += '<button id="mn-v-bymat" class="filter-btn' + (mnView === 'bymat' ? ' active' : '') + '" onclick="mnSetView(\'bymat\')">📦 Незакрити по артикул (' + calc.byMat.length + ')</button>';
  if(mnView === 'daily'){
    h += '<label style="margin-left:auto;"><input type="checkbox" id="mn-onlyopen"' + (mnOnlyOpen ? ' checked' : '') + ' onchange="mnSetOnlyOpen(this.checked)"> само незакрити</label>';
    if(mnIsCO()){
      var nUnf = (mnOnlyOpen ? calc.open : calc.all).filter(mnUnfilled).length;
      h += '<label><input type="checkbox" id="mn-unfilled"' + (mnOnlyUnfilled ? ' checked' : '') + ' onchange="mnSetUnfilled(this.checked)"> само непопълнени (' + nUnf + ')</label>';
    }
  }
  h += '<input id="mn-search" type="search" placeholder="🔍 Код" value="' + escAttrVal(mnSearch) + '" oninput="mnSetSearch(this.value)" style="width:140px;">';
  h += '<button id="mn-excel" class="filter-btn" onclick="mnExportExcel()">📥 Excel</button>';
  h += '<button id="mn-print" class="filter-btn" onclick="mnPrint()">🖨️ Печат</button>';
  h += '</div>';
  /* Таблиците са в #mn-body — търсенето прерисува само тях, за да не губи
     полето фокуса при всяка буква. */
  h += '<div id="mn-body">' + mnBodyHtml(calc) + '</div>';
  el.innerHTML = h;
}
/* Редовете на текущия изглед — с отметките и търсенето. Общо за екрана,
   Excel и печата, за да не се разминат. */
function mnMatchSearch(r, daily){
  var q = String(mnSearch || '').trim().toLowerCase();
  if(!q) return true;
  if(String(r.material == null ? '' : r.material).toLowerCase().indexOf(q) >= 0) return true;
  if(!daily) return false;
  if(String(r.real_code == null ? '' : r.real_code).toLowerCase().indexOf(q) >= 0) return true;
  return mnCoMatches(r).some(function(o){ return String(o.in_num || '').toLowerCase().indexOf(q) >= 0; });
}
function mnViewRows(calc){
  if(mnView === 'bymat') return calc.byMat.filter(function(r){ return mnMatchSearch(r, false); });
  var rows = calc.all;
  if(mnOnlyOpen) rows = rows.filter(function(r){ return r._state === 'open'; });
  /* „Непопълнен" е и повторение с причина, но без действие. */
  if(mnIsCO() && mnOnlyUnfilled) rows = rows.filter(mnUnfilled);
  return rows.filter(function(r){ return mnMatchSearch(r, true); });
}
function mnBodyHtml(calc){
  var rows = mnViewRows(calc);
  var h = mnView === 'bymat' ? mnByMatHtml(rows) : mnDailyHtml(rows);
  if(mnView === 'daily' && mnCoErr) h = '<div id="mn-co-err" style="color:#94a3b8;font-size:12px;margin:0 0 6px 4px;">Клиентските заявки не се заредиха</div>' + h;
  /* Свръхсторното е грешка на магазина — вижда го и обектът (Миглена, 21.10.2026). */
  if(calc.over.length || calc.early.length) h += mnOverHtml(calc.over, calc.early);
  return h;
}
function mnRenderBody(){
  var b = document.getElementById('mn-body');
  if(!b){ mnRender(); return; }
  mnCaptureDrafts();
  b.innerHTML = mnBodyHtml(mnCompute(mnMovs, mnThresholds));
}
function mnUploadHtml(){
  var h = '<div class="card" id="mn-upload">';
  h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;"><b>Качване от SAP (MB51, лист „от САП“)</b>';
  h += '<label class="btn btn-green" style="cursor:pointer;">📤 Качи файл<input type="file" id="mn-file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="mnImportFile(this)"></label>';
  if(mnLastUpload) h += '<span style="color:#64748b;font-size:13px;">Последно: ' + esc(mnFmtTs(mnLastUpload.uploaded_at)) + ' · ' + esc(mnLastUpload.uploaded_by || '') + ' · ' + esc(mnLastUpload.file_name || '') + ' · нови ' + esc(String(mnLastUpload.rows_new == null ? '—' : mnLastUpload.rows_new)) + '</span>';
  h += '</div>';
  if(mnReport) h += mnReportHtml(mnReport);
  return h + '</div>';
}
function mnReportHtml(r){
  var h = '<div id="mn-upload-report" style="margin-top:8px;font-size:13px;line-height:1.6;">';
  h += '<div>Файл: <b>' + esc(r.file) + '</b>' + (r.dateFrom ? ' · период ' + esc(fmtDate(r.dateFrom)) + ' – ' + esc(fmtDate(r.dateTo)) : '') + '</div>';
  h += '<div>Общо редове: <b id="mn-rep-total">' + r.total + '</b> · 955/956: <b>' + r.valid + '</b> · нови: <b id="mn-rep-new">' + r.inserted + '</b> · вече качени: <b id="mn-rep-already">' + r.already + '</b></div>';
  var oth = Object.keys(r.other);
  if(oth.length) h += '<div id="mn-rep-other">Други видове движение: ' + oth.map(function(k){ return esc(k) + ' × ' + r.other[k]; }).join(', ') + ' — не се ползват</div>';
  var unk = Object.keys(r.unknown);
  if(unk.length) h += '<div id="mn-rep-unknown" style="color:#b91c1c;font-weight:600;">⚠ Непознат завод — НЕ са записани: ' + unk.map(function(k){ return 'завод ' + esc(k) + ' × ' + r.unknown[k] + ' реда'; }).join(', ') + '</div>';
  if(r.bad) h += '<div style="color:#b91c1c;">⚠ Невалидни редове (без дата / количество / документ): ' + r.bad + '</div>';
  if(r.dupes) h += '<div style="color:#64748b;">Повторени в самия файл: ' + r.dupes + '</div>';
  if(r.failed) h += '<div id="mn-rep-failed" style="color:#b91c1c;font-weight:600;">⚠ Незаписани поради грешка: ' + r.failed + ' — качи файла пак</div>';
  return h + '</div>';
}
function mnDailyHtml(rows){
  if(!rows.length) return '<div class="card" id="mn-empty" style="color:#64748b;">' + (mnSearch.trim() ? 'Няма редове за „' + esc(mnSearch.trim()) + '“.' : mnOnlyOpen ? 'Няма незакрити минуси.' : 'Няма минуси.') + '</div>';
  var fill = mnCanFill(), all = mnIsAll();
  var yel = 'background:#fef9c3;';
  var h = '<div class="card" style="overflow-x:auto;"><table id="mn-daily"><thead><tr>' + (all ? '<th>Обект</th>' : '') + '<th>Материал</th><th>Описание</th><th>Дата</th><th>Количество</th><th style="width:90px;">Състояние</th>';
  h += '<th style="' + yel + '">Заметнат код</th><th style="' + yel + '">Причина</th><th style="' + yel + '">Име на служител</th><th style="' + yel + '">Бележка</th><th></th></tr></thead><tbody>';
  rows.forEach(function(r){
    var id = String(r.id), done = r.reason_id != null;
    var d = mnDraft[id] || {};
    var val = function(k){ return d[k] != null ? d[k] : (r[k] == null ? '' : r[k]); };
    /* Закритите и под прага — сив текст; жълтите колони си остават жълти. */
    var gray = r._state === 'open' ? '' : ' style="color:#94a3b8;"';
    h += '<tr data-mn-id="' + escAttr(id) + '" id="mn-row-' + escAttr(id) + '" class="mn-st-' + escAttr(r._state || 'open') + '"' + gray + '>' + (all ? '<td class="mn-store">' + esc(r.store_name) + '</td>' : '') + '<td>' + esc(r.material) + '</td><td>' + esc(r.material_desc) + mnBadgeHtml(r) + mnCoChipsHtml(r) + '</td><td>' + esc(fmtDate(r.posting_date)) + '</td>';
    /* Мерната единица е в „Количество", „Състояние" се пренася на два реда,
       служител / бележка — 110px: с отделна колона „Мерна ед." таблицата беше
       1342 px срещу карта 1246 и „Запази" излизаше навън (Playwright, 22.10). */
    h += '<td class="mn-qty" style="text-align:right;white-space:nowrap;">' + esc(mnFmtQty(Number(r.qty))) + (r.uom ? ' ' + esc(r.uom) : '') + '</td>';
    h += '<td class="mn-state"' + (r._early ? ' style="color:#b91c1c;font-weight:600;"' : '') + '>' + esc(mnStateText(r)) + '</td>';
    if(fill){
      h += '<td style="' + yel + '"><input id="mn-code-' + escAttr(id) + '" value="' + escAttrVal(val('real_code')) + '" style="width:90px;"></td>';
      var cur = String(val('reason_id'));
      /* Фиксирана ширина: най-дългата причина разтягаше менюто до ~378 px и
         „Запази“ излизаше извън картата (21.10.2026). Целият текст — в title. */
      h += '<td style="' + yel + '"><select id="mn-reason-' + escAttr(id) + '" style="width:180px;max-width:180px;" title="' + escAttrVal(mnReasonLabel(cur)) + '"' +
        ' onchange="this.title=this.value?this.options[this.selectedIndex].text:\'\';mnCoPickToggle(\'' + escAttr(id) + '\',this.value)"><option value="">— избери —</option>';
      mnReasons.forEach(function(x){
        if(x.active === false && String(x.id) !== cur) return;
        h += '<option value="' + escAttr(String(x.id)) + '"' + (String(x.id) === cur ? ' selected' : '') + '>' + esc(x.label) + '</option>';
      });
      h += '</select></td>';
      h += '<td style="' + yel + '"><input id="mn-emp-' + escAttr(id) + '" value="' + escAttrVal(val('employee_name')) + '" style="width:110px;"></td>';
      /* „Действие" — само на повторенията, под „Бележка" (без нова колона). */
      h += '<td style="' + yel + '"><input id="mn-note-' + escAttr(id) + '" value="' + escAttrVal(val('note')) + '" style="width:110px;">' +
        (mnNoteMissing(r) ? MN_NOTE_MISSING : '') +
        '<div id="mn-co-pick-' + escAttr(id) + '">' + mnCoPickHtml(id, cur) + '</div>' +
        (r._repeat ? '<input id="mn-action-' + escAttr(id) + '" value="' + escAttrVal(val('action')) + '" placeholder="Действие срещу повторение" style="width:110px;display:block;margin-top:4px;">' : '') + '</td>';
      h += '<td style="white-space:nowrap;">' + (done ? '<span class="mn-done" title="' + escAttr('Попълнено: ' + (r.filled_by || '') + ' ' + mnFmtTs(r.filled_at)) + '">✅</span> ' : '') + '<button class="btn btn-green" onclick="mnSave(\'' + escAttr(id) + '\')">Запази</button></td>';
    } else {
      h += '<td>' + esc(r.real_code || '') + '</td><td>' + esc(mnReasonLabel(r.reason_id)) + '</td><td>' + esc(r.employee_name || '') + '</td><td>' + esc(r.note || '') +
        (mnNoteMissing(r) ? MN_NOTE_MISSING : '') +
        (r.action ? '<div class="mn-action-txt" style="margin-top:2px;">Действие: ' + esc(r.action) + '</div>' : '') + '</td>';
      h += '<td>' + (done ? '<span class="mn-done" title="' + escAttr((r.filled_by || '') + ' ' + mnFmtTs(r.filled_at)) + '">✅</span>' : '') + '</td>';
    }
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}
/* „↻ предишен дд.мм" (цвят по давност) + „×N за 30 дни" при N ≥ 2. */
function mnAgeClass(days){ return days <= 7 ? 'red' : days <= 30 ? 'orange' : 'yellow'; }
var MN_AGE_STYLE = { red: 'background:#fee2e2;color:#b91c1c;', orange: 'background:#ffedd5;color:#c2410c;', yellow: 'background:#fef9c3;color:#a16207;' };
function mnBadgeHtml(r){
  if(!r._prevDate) return '';
  var c = mnAgeClass(r._prevDays);
  /* Две части, всяка nowrap, с обикновен интервал между тях: при тясна
     колона броячът минава на втори ред, вместо да разширява „Описание". */
  var h = '<div class="mn-badges" style="margin-top:3px;font-size:11px;">' +
    '<span class="mn-prev mn-age-' + c + '" style="' + MN_AGE_STYLE[c] + 'border-radius:4px;padding:0 4px;white-space:nowrap;">↻ предишен ' + esc(fmtDate(r._prevDate).slice(0, 5)) + '</span>';
  if(r._cnt30 >= 2) h += ' <span class="mn-cnt30" style="background:#ede9fe;color:#6d28d9;border-radius:4px;padding:0 4px;white-space:nowrap;">×' + r._cnt30 + ' за 30 дни</span>';
  return h + '</div>';
}
/* „незакрит" / „незакрит N от M" (частично закрит) / „закрит дд.мм" /
   „остатък под прага"; + „⚠ сторно преди минуса" (956 преди 955). */
function mnStateText(r){
  var t;
  if(r._state === 'closed') t = 'закрит' + (r._closedOn ? ' ' + fmtDate(r._closedOn).slice(0, 5) : '');
  else if(r._state === 'under') t = 'остатък под прага';
  else {
    var q = mnRound(Number(r.qty) || 0);
    t = mnRound(r._rest) < q - MN_EPS ? 'незакрит ' + mnFmtQty(r._rest) + ' от ' + mnFmtQty(q) : 'незакрит';
  }
  return r._early ? t + ' ⚠ сторно преди минуса' : t;
}
function mnByMatHtml(rows){
  if(!rows.length) return '<div class="card" id="mn-empty" style="color:#64748b;">' + (mnSearch.trim() ? 'Няма артикули за „' + esc(mnSearch.trim()) + '“.' : 'Няма незакрити артикули.') + '</div>';
  var all = mnIsAll();
  var h = '<div class="card" style="overflow-x:auto;"><table id="mn-bymat"><thead><tr>' + (all ? '<th>Обект</th>' : '') + '<th>Материал</th><th>Описание</th><th>955</th><th>956</th><th>Остатък</th><th>Мерна ед.</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h += '<tr id="mn-mat-' + escAttr((all ? r.store_name + '-' : '') + r.material) + '">' + (all ? '<td class="mn-store">' + esc(r.store_name) + '</td>' : '') + '<td>' + esc(r.material) + '</td><td>' + esc(r.desc) + '</td>';
    h += '<td class="mn-s955" style="text-align:right;">' + esc(mnFmtQty(r.s955)) + '</td><td class="mn-s956" style="text-align:right;">' + esc(mnFmtQty(r.s956)) + '</td>';
    h += '<td class="mn-rest" style="text-align:right;font-weight:600;">' + esc(mnFmtQty(r.rest)) + '</td><td>' + esc(r.uom) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}
function mnOverHtml(rows, early){
  rows = rows || []; early = early || [];
  var h = '<div class="card" id="mn-over" style="border-left:4px solid #dc2626;">';
  var all = mnIsAll();
  if(rows.length){
  h += '<b style="color:#b91c1c;">⚠ Свръхсторно — 956 над 955</b>';
  h += '<table><thead><tr>' + (all ? '<th>Обект</th>' : '') + '<th>Материал</th><th>Описание</th><th>955</th><th>956</th><th>Разлика</th><th>Мерна ед.</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h += '<tr>' + (all ? '<td class="mn-store">' + esc(r.store_name) + '</td>' : '') + '<td>' + esc(r.material) + '</td><td>' + esc(r.desc) + '</td><td>' + esc(mnFmtQty(r.s955)) + '</td><td>' + esc(mnFmtQty(r.s956)) + '</td><td>' + esc(mnFmtQty(r.rest)) + '</td><td>' + esc(r.uom) + '</td></tr>';
  });
  h += '</tbody></table>';
  }
  /* 956 с дата ПРЕДИ минуса 955, който закрива — грешка на магазина и след
     като нетът стане 0 (Миглена, 22.10.2026; пример 17279). */
  if(early.length){
    h += '<div id="mn-early"' + (rows.length ? ' style="margin-top:12px;"' : '') + '><b style="color:#b91c1c;">⚠ Сторно преди минуса (956 преди 955)</b>';
    h += '<table><thead><tr>' + (all ? '<th>Обект</th>' : '') + '<th>Материал</th><th>Описание</th><th>Дата 955</th><th>Дата 956</th><th>Документ 956</th></tr></thead><tbody>';
    early.forEach(function(e){
      h += '<tr class="mn-early-row">' + (all ? '<td class="mn-store">' + esc(e.row.store_name) + '</td>' : '') + '<td>' + esc(e.row.material) + '</td><td>' + esc(e.row.material_desc) + '</td>' +
        '<td>' + esc(fmtDate(e.row.posting_date)) + '</td><td>' + esc(fmtDate(e.m956.posting_date)) + '</td><td>' + esc(e.m956.mat_doc) + '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  return h + '</div>';
}

/* ─── Действия ─────────────────────────────────────────── */
function mnSetView(v){ mnView = v === 'bymat' ? 'bymat' : 'daily'; mnRender(); }
function mnSetUnfilled(on){ mnOnlyUnfilled = !!on; mnRender(); }
function mnSetOnlyOpen(on){ mnOnlyOpen = !!on; mnRender(); }
function mnSetSearch(v){ mnSearch = String(v == null ? '' : v); mnRenderBody(); }

/* ─── Excel и печат на текущия изглед ──────────────────── */
function mnViewLabel(){ return mnView === 'bymat' ? 'Незакрити по артикул' : 'Дневен'; }
function mnFilterText(){
  var f = [];
  if(mnView === 'daily' && mnOnlyOpen) f.push('само незакрити');
  if(mnView === 'daily' && mnIsCO() && mnOnlyUnfilled) f.push('само непопълнени');
  if(String(mnSearch || '').trim()) f.push('търсене „' + String(mnSearch).trim() + '“');
  return f.length ? 'Филтри: ' + f.join(' · ') : 'Без филтри';
}
/* aoa за Excel: колоните като на екрана, без полета за въвеждане; БЕЗ СУМИ. */
function mnExportAoa(){
  var calc = mnCompute(mnMovs, mnThresholds), rows = mnViewRows(calc), all = mnIsAll();
  var aoa;
  if(mnView === 'bymat'){
    aoa = [(all ? ['Обект'] : []).concat(['Материал', 'Описание', '955', '956', 'Остатък', 'Мерна ед.'])];
    rows.forEach(function(r){
      aoa.push((all ? [r.store_name] : []).concat([r.material, r.desc || '', r.s955, r.s956, r.rest, r.uom || '']));
    });
  } else {
    aoa = [(all ? ['Обект'] : []).concat(['Материал', 'Описание', 'Дата', 'Количество', 'Мерна ед.', 'Състояние', 'Заметнат код', 'Причина', 'Име на служител', 'Бележка', 'Предишен минус', 'Брой за 30 дни', 'Действие', 'КЗ'])];
    rows.forEach(function(r){
      aoa.push((all ? [r.store_name] : []).concat([r.material, r.material_desc || '', fmtDate(r.posting_date), mnRound(Number(r.qty) || 0), r.uom || '',
        mnStateText(r), r.real_code || '', mnReasonLabel(r.reason_id), r.employee_name || '', r.note || '',
        r._prevDate ? fmtDate(r._prevDate) : '', r._cnt30 || 0, r.action || '',
        mnCoMatches(r).map(function(o){ return o.in_num || ''; }).join(', ')]));
    });
  }
  return aoa;
}
function mnExportName(){
  return 'Минуси_' + (mnIsAll() ? 'Всички' : mnStore) + '_' + (mnView === 'bymat' ? 'Незакрити' : 'Дневен') + '_' + fmtDate(today()) + '.xlsx';
}
function mnExportExcel(){
  var aoa = mnExportAoa();
  if(aoa.length < 2){ toast('Няма редове за износ', '#d97706'); return; }
  var name = mnExportName();
  mnWithXlsx(function(){
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), mnView === 'bymat' ? 'Незакрити' : 'Дневен');
    XLSX.writeFile(wb, name);
  });
}
/* CLAUDE.md т.12: глобалните правила от index.html (th nowrap, без долна
   рамка на последния ред) важат и тук — затова са изрично; border-box, за да
   не излиза таблицата извън 190 mm. */
function mnPrintCss(){
  return '.mn-ptbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;}' +
    '.mn-ptbl th,.mn-ptbl td{box-sizing:border-box;border:1px solid #333;padding:1.2mm 0.8mm;white-space:normal;word-wrap:break-word;vertical-align:top;text-align:left;}' +
    '.mn-ptbl tr:last-child td{border-bottom:1px solid #333;}' +
    '.mn-ptbl th{background:#f1f5f9;}' +
    '.mn-ptbl tr.mn-p-gray td{color:#888;}';
}
function mnCoPrint(r){
  var ms = mnCoMatches(r);
  return ms.length ? '<br><span class="mn-p-co">' + mnP('КЗ ' + ms.map(function(o){ return o.in_num || '—'; }).join(', ')) + '</span>' : '';
}
function mnP(v){ return v == null || v === '' ? '' : esc(String(v)); }
function mnPrint(){
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var calc = mnCompute(mnMovs, mnThresholds), rows = mnViewRows(calc), all = mnIsAll();
  var cols, head, body;
  if(mnView === 'bymat'){
    cols = all ? [24, 18, 78, 16, 16, 20, 18] : [18, 102, 16, 16, 20, 18];
    head = (all ? ['Обект'] : []).concat(['Материал', 'Описание', '955', '956', 'Остатък', 'Мерна ед.']);
    body = rows.map(function(r){
      return '<tr>' + (all ? '<td>' + mnP(r.store_name) + '</td>' : '') + '<td>' + mnP(r.material) + '</td><td>' + mnP(r.desc) + '</td><td>' + mnP(mnFmtQty(r.s955)) + '</td><td>' + mnP(mnFmtQty(r.s956)) + '</td><td>' + mnP(mnFmtQty(r.rest)) + '</td><td>' + mnP(r.uom) + '</td></tr>';
    }).join('');
  } else {
    cols = all ? [18, 16, 34, 16, 16, 18, 16, 22, 18, 16] : [16, 44, 16, 16, 18, 16, 30, 18, 16];
    /* „Кол-во", не „Количество": в колона от 16 mm думата се пречупваше по
       средата („Количест / во") — Тенчо, Chrome → PDF, 22.10.2026. */
    head = (all ? ['Обект'] : []).concat(['Материал', 'Описание', 'Дата', 'Кол-во', 'Състояние', 'Заметнат код', 'Причина', 'Име на служител', 'Бележка']);
    body = rows.map(function(r){
      return '<tr' + (r._state === 'open' ? '' : ' class="mn-p-gray"') + '>' + (all ? '<td>' + mnP(r.store_name) + '</td>' : '') +
        '<td>' + mnP(r.material) + '</td><td>' + mnP(r.material_desc) +
        (r._prevDate ? '<br><span class="mn-p-prev">' + mnP('↻ ' + fmtDate(r._prevDate).slice(0, 5) + (r._cnt30 >= 2 ? ' ×' + r._cnt30 : '')) + '</span>' : '') +
        mnCoPrint(r) + '</td><td>' + mnP(fmtDate(r.posting_date)) + '</td>' +
        '<td>' + mnP(mnFmtQty(Number(r.qty)) + (r.uom ? ' ' + r.uom : '')) + '</td><td>' + mnP(mnStateText(r)) + '</td>' +
        '<td>' + mnP(r.real_code) + '</td><td>' + mnP(mnReasonLabel(r.reason_id)) + '</td><td>' + mnP(r.employee_name) + '</td><td>' + mnP(r.note) +
        (r.action ? (r.note ? '<br>' : '') + '<span class="mn-p-action">' + mnP('Действие: ' + r.action) + '</span>' : '') + '</td></tr>';
    }).join('');
  }
  var title = 'Минуси — ' + mnStoreLabel() + ' — ' + mnViewLabel() + ' — ' + fmtDate(today());
  var tbl = rows.length
    ? '<table class="mn-ptbl"><colgroup>' + cols.map(function(w){ return '<col style="width:' + w + 'mm;">'; }).join('') + '</colgroup>' +
      '<tr>' + head.map(function(x){ return '<th>' + esc(x) + '</th>'; }).join('') + '</tr>' + body + '</table>'
    : '<div style="padding:12px;color:#777;">Няма редове.</div>';
  wrap.innerHTML = '<style>' + mnPrintCss() + '</style>' +
    '<div style="max-width:190mm;margin:0 auto;padding:16px 0 40px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">' +
        '<div style="font-size:18px;font-weight:600;">🖨️ Минуси</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
          '<button onclick="showModule(\'minusi\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
        '</div>' +
      '</div>' +
      '<div id="mn-print-wrap">' +
        '<div id="mn-print-title" style="font-size:15px;font-weight:700;">' + esc(title) + '</div>' +
        '<div id="mn-print-filters" style="font-size:11px;color:#555;margin-bottom:6px;">' + esc(mnFilterText()) + ' · редове: ' + rows.length + '</div>' +
        tbl +
      '</div>' +
    '</div>';
  showModule('print');
}
function mnSetStore(s){
  if(!mnIsCO()) return;
  mnStore = s; mnMovs = []; mnDraft = {};
  loadMinusi();
}
function mnSave(id){
  if(!mnCanFill()){ toast('Попълва само обектът', '#dc2626'); return Promise.resolve(false); }
  var row = null;
  mnMovs.forEach(function(m){ if(String(m.id) === String(id)) row = m; });
  if(!row) return Promise.resolve(false);
  var g = function(p){ var e = document.getElementById(p + id); return e ? String(e.value || '').trim() : ''; };
  var reason = g('mn-reason-'), emp = g('mn-emp-');
  if(!reason){ toast('Избери причина от списъка', '#dc2626'); return Promise.resolve(false); }
  if(!mnReasonLabel(reason)){ toast('Непозната причина', '#dc2626'); return Promise.resolve(false); }
  if(!emp){ toast('Попълни име на служител', '#dc2626'); return Promise.resolve(false); }
  /* Повторение до N дни → „Действие" е задължително (Теодор, 06.10.2026). */
  var crow = null;
  mnCompute(mnMovs, mnThresholds).all.forEach(function(x){ if(String(x.id) === String(id)) crow = x; });
  var isRep = !!(crow && crow._repeat), action = g('mn-action-');
  if(isRep && !action){ toast('Повторен минус до ' + mnRepeatDays + ' дни — попълни действие', '#dc2626'); return Promise.resolve(false); }
  if(mnReasonNeedsNote(reason) && !g('mn-note-')){ toast('За тази причина попълни номер и дата на поръчката в „Бележка"', '#dc2626'); return Promise.resolve(false); }
  var body = {
    real_code: g('mn-code-') || null,
    reason_id: parseInt(reason, 10),
    employee_name: emp,
    note: g('mn-note-') || null,
    filled_by: currentUser.display_name || currentUser.email || '',
    filled_at: new Date().toISOString()
  };
  if(isRep) body.action = action;
  return sbPatch('minus_movements', 'id=eq.' + encodeURIComponent(id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(body).forEach(function(k){ row[k] = body[k]; });
    delete mnDraft[id];
    var el = document.getElementById('mod-minusi');
    if(el){ var tr = document.getElementById('mn-row-' + id); if(tr) tr.removeAttribute('data-mn-id'); }
    mnRender();
    toast('Записано');
    return true;
  });
}

/* ─── Брояч на под-бутона, „Днес", дълбока връзка ──────── */
/* По обект: { store, open (незакрити), unfilled (незакрити и непопълнени),
   over (свръхсторно) }. onlyStores — стесняване (обектът: само своя);
   null = всички включени. { ok:false } при грешка в коя да е заявка или
   непълни движения — по-добре „Непълни данни", отколкото грешно число. */
function mnLoadSummary(onlyStores){
  return Promise.all([
    sbGetOk('app_settings', 'key=in.(minus_stores,minus_repeat_days)&select=key,value'),
    sbGetOk('minus_reasons', 'select=id,label,active,sort,requires_note&order=sort.asc,id.asc'),
    sbGetOk('minus_uom_thresholds', 'select=uom,min_qty')
  ]).then(function(rs){
    var bad = rs.filter(function(r){ return !r.ok; })[0];
    if(bad) return { ok: false, error: bad.error };
    mnApplyConfig(rs[0].rows, rs[1].rows, rs[2].rows);
    var stores = mnStoresOn.filter(function(s){ return !onlyStores || onlyStores.indexOf(s) >= 0; });
    if(!stores.length) return { ok: true, rows: [] };
    var q = 'select=' + MN_MOV_COLS + '&store_name=in.(' + stores.map(encodeURIComponent).join(',') + ')&order=posting_date.asc,mat_doc.asc,doc_item.asc,id.asc';
    return sbGetAll('minus_movements', q).then(function(movs){
      if(movs.partial) return { ok: false, error: 'движенията не се заредиха изцяло' };
      return { ok: true, rows: stores.map(function(s){
        var c = mnCompute(movs.filter(function(m){ return m.store_name === s; }), mnThresholds);
        return { store: s, open: c.open.length, unfilled: c.open.filter(mnUnfilled).length, over: c.over.length };
      }) };
    });
  }).catch(function(e){ return { ok: false, error: String((e && e.message) || e) }; });
}
function mnSetBadge(n){
  var b = document.getElementById('rvs-minusi');
  if(!b) return;
  n = n > 0 ? n : 0;
  b.textContent = '➖ Минуси' + (n ? ' (' + n + ')' : '');
  b.setAttribute('data-mn-n', String(n));
}
var mnBadgeSeq = 0;
/* Само за обекта (manager / sklad); невключен обект → без брояч. Тихо: при
   грешка бутонът остава без брояч, без toast. */
function mnLoadBadge(){
  if(!mnIsStoreUser()) return Promise.resolve();
  var seq = ++mnBadgeSeq;
  return mnLoadSummary([currentUser.store_name]).then(function(res){
    if(seq !== mnBadgeSeq) return;
    var r = res && res.ok ? res.rows[0] : null;
    mnSetBadge(r ? r.unfilled : 0);
  });
}
/* Клик по известието minus_unfilled → портала на #mn (след входа). */
function mnDeepLinkBoot(hash){
  var h = hash === undefined ? (window.location.hash || '') : hash;
  if(h !== '#mn') return false;
  if(typeof llClearUrlHash === 'function') llClearUrlHash();
  if(!mnCanSee()) return false;
  showModule('minusi');
  return true;
}
