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
   артикулът е „свръхсторно" — вижда го само контролингът.

   Праг по мерна единица (minus_uom_thresholds): остатък под min_qty не се
   показва. Единица без ред → показва се всеки остатък ≠ 0.

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
   базата (общ anon ключ — виж хедъра на схемата). */

var mnMovs = [];
var mnReasons = [];
var mnThresholds = {};   /* нормализирана мерна единица → min_qty */
var mnPlants = {};       /* завод → store_name */
var mnStoresOn = [];     /* app_settings.minus_stores */
var mnStore = '';
var mnView = 'daily';    /* 'daily' | 'bymat' */
var mnOnlyUnfilled = false;
var mnReport = null;     /* отчет на последното качване в тази сесия */
var mnLastUpload = null;
var mnDraft = {};        /* id → {real_code, reason_id, employee_name, note} — незаписаното */
var mnLoadErr = '';
var mnLoadSeq = 0;
var mnBusy = false;

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
var MN_MOV_COLS = 'id,plant,store_name,material,material_desc,mvt_type,qty,uom,mat_doc,doc_item,doc_year,posting_date,real_code,reason_id,employee_name,note,filled_by,filled_at';

/* ─── Роли ─────────────────────────────────────────────── */
function mnIsStoreUser(){ return !!currentUser && MN_STORE_ROLES.indexOf(currentUser.role) >= 0; }
function mnIsCO(){ return !!currentUser && MN_CO_ROLES.indexOf(currentUser.role) >= 0; }
function mnCanSee(){ return mnIsStoreUser() || mnIsCO(); }
function mnCanFill(){ return mnIsStoreUser() && !!mnStore && mnStore === currentUser.store_name; }
function mnParseStores(v){
  return String(v == null ? '' : v).split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}
function mnStoreOn(store){ return !!store && mnStoresOn.indexOf(store) >= 0; }

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
/* Чисто изчисление, без DOM. → {open:[ред 955 + _rest], byMat:[…], over:[…]}
   open — редовете 955 с остатък над прага; byMat — един ред на материал с
   остатък над прага; over — свръхсторно (956 над 955). */
function mnCompute(movs, thr){
  var groups = {}, order = [];
  (movs || []).forEach(function(m){
    var k = m.store_name + '\u0001' + m.material;
    if(!groups[k]){ groups[k] = { store_name: m.store_name, material: m.material, desc: '', uom: '', r955: [], s955: 0, s956: 0 }; order.push(k); }
    var g = groups[k], q = Number(m.qty) || 0;
    if(m.material_desc) g.desc = m.material_desc;
    if(String(m.mvt_type) === '955'){ g.r955.push(m); g.s955 += q; if(m.uom) g.uom = m.uom; }
    else if(String(m.mvt_type) === '956'){ g.s956 += q; if(!g.uom && m.uom) g.uom = m.uom; }
  });
  var out = { open: [], byMat: [], over: [] };
  order.forEach(function(k){
    var g = groups[k];
    var net = mnRound(g.s955 + g.s956);
    if(net < -MN_EPS){ out.over.push({ store_name: g.store_name, material: g.material, desc: g.desc, uom: g.uom, s955: mnRound(g.s955), s956: mnRound(g.s956), rest: net }); return; }
    var closing = mnRound(-g.s956);
    g.r955.slice().sort(mnCmp955).forEach(function(r){
      var q = Number(r.qty) || 0;
      var used = Math.max(0, Math.min(q, closing));
      closing = mnRound(closing - used);
      var rest = mnRound(q - used);
      if(mnPassThreshold(rest, r.uom, thr)) out.open.push(Object.assign({}, r, { _rest: rest }));
    });
    if(mnPassThreshold(net, g.uom, thr)) out.byMat.push({ store_name: g.store_name, material: g.material, desc: g.desc, uom: g.uom, s955: mnRound(g.s955), s956: mnRound(g.s956), rest: net });
  });
  out.open.sort(function(a, b){ return String(b.posting_date).localeCompare(String(a.posting_date)) || String(a.material).localeCompare(String(b.material), undefined, { numeric: true }); });
  out.byMat.sort(function(a, b){ return String(a.material).localeCompare(String(b.material), undefined, { numeric: true }); });
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
    sbGetOk('app_settings', 'key=eq.minus_stores&select=key,value'),
    sbGetOk('minus_plants', 'select=plant,store_name'),
    sbGetOk('minus_reasons', 'select=id,label,active,sort&order=sort.asc,id.asc'),
    sbGetOk('minus_uom_thresholds', 'select=uom,min_qty')
  ]).then(function(rs){
    if(seq !== mnLoadSeq) return;
    var bad = rs.filter(function(r){ return !r.ok; })[0];
    if(bad){ mnLoadErr = bad.error; mnRenderErr(); return; }
    var row = rs[0].rows.filter(function(r){ return r && r.key === 'minus_stores'; })[0];
    mnStoresOn = mnParseStores(row && row.value);
    mnPlants = {};
    rs[1].rows.forEach(function(p){ mnPlants[mnCode(p.plant)] = p.store_name; });
    mnReasons = rs[2].rows;
    mnThresholds = {};
    rs[3].rows.forEach(function(t){ mnThresholds[mnNormUom(t.uom)] = Number(t.min_qty); });
    if(mnIsStoreUser()) mnStore = currentUser.store_name || '';
    else if(!mnStore || mnStoreList().indexOf(mnStore) < 0) mnStore = mnStoresOn.filter(function(s){ return mnStoreList().indexOf(s) >= 0; })[0] || mnStoreList()[0] || '';
    if(mnIsStoreUser() && !mnStoreOn(mnStore)){ mnMovs = []; mnRender(); return; }
    var q = 'select=' + MN_MOV_COLS + '&store_name=eq.' + encodeURIComponent(mnStore) + '&order=posting_date.asc,mat_doc.asc,doc_item.asc,id.asc';
    var reads = [sbGetAll('minus_movements', q)];
    if(mnIsCO()) reads.push(sbGetOk('minus_uploads', 'select=*&order=uploaded_at.desc&limit=1'));
    return Promise.all(reads).then(function(r2){
      if(seq !== mnLoadSeq) return;
      if(r2[0].partial){ mnLoadErr = 'движенията не се заредиха изцяло'; mnRenderErr(); return; }
      mnLoadErr = '';
      mnMovs = r2[0];
      mnLastUpload = r2[1] && r2[1].ok ? (r2[1].rows[0] || null) : null;
      mnRender();
    });
  });
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
    mnDraft[id] = { real_code: g('mn-code-'), reason_id: g('mn-reason-'), employee_name: g('mn-emp-'), note: g('mn-note-') };
  });
}
function mnRender(){
  var el = document.getElementById('mod-minusi');
  if(!el) return;
  mnCaptureDrafts();
  var h = mnTitle();
  if(mnIsStoreUser() && !mnStoreOn(mnStore)){
    el.innerHTML = h + '<div id="mn-off" class="card" style="color:#64748b;">Модулът още не е включен за вашия обект.</div>';
    return;
  }
  if(mnIsCO()) h += mnUploadHtml();
  var calc = mnCompute(mnMovs, mnThresholds);
  h += '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(mnIsCO()){
    h += '<label style="font-weight:600;">Обект:</label><select id="mn-store" onchange="mnSetStore(this.value)">';
    mnStoreList().forEach(function(s){ h += '<option value="' + escAttr(s) + '"' + (s === mnStore ? ' selected' : '') + '>' + esc(s) + (mnStoreOn(s) ? '' : ' (не е включен)') + '</option>'; });
    h += '</select>';
  } else h += '<b>' + esc(mnStore) + '</b>';
  h += '<button id="mn-v-daily" class="filter-btn' + (mnView === 'daily' ? ' active' : '') + '" onclick="mnSetView(\'daily\')">📋 Дневен (' + calc.open.length + ')</button>';
  h += '<button id="mn-v-bymat" class="filter-btn' + (mnView === 'bymat' ? ' active' : '') + '" onclick="mnSetView(\'bymat\')">📦 Незакрити по артикул (' + calc.byMat.length + ')</button>';
  if(mnIsCO() && mnView === 'daily'){
    var nUnf = calc.open.filter(function(r){ return r.reason_id == null; }).length;
    h += '<label style="margin-left:auto;"><input type="checkbox" id="mn-unfilled"' + (mnOnlyUnfilled ? ' checked' : '') + ' onchange="mnSetUnfilled(this.checked)"> само непопълнени (' + nUnf + ')</label>';
  }
  h += '</div>';
  h += mnView === 'bymat' ? mnByMatHtml(calc.byMat) : mnDailyHtml(calc.open);
  if(mnIsCO() && calc.over.length) h += mnOverHtml(calc.over);
  el.innerHTML = h;
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
  if(mnIsCO() && mnOnlyUnfilled) rows = rows.filter(function(r){ return r.reason_id == null; });
  if(!rows.length) return '<div class="card" id="mn-empty" style="color:#64748b;">Няма незакрити минуси.</div>';
  var fill = mnCanFill();
  var yel = 'background:#fef9c3;';
  var h = '<div class="card" style="overflow-x:auto;"><table id="mn-daily"><thead><tr><th>Материал</th><th>Описание</th><th>Дата</th><th>Количество</th><th>Мерна ед.</th>';
  h += '<th style="' + yel + '">Заметнат код</th><th style="' + yel + '">Причина</th><th style="' + yel + '">Име на служител</th><th style="' + yel + '">Бележка</th><th></th></tr></thead><tbody>';
  rows.forEach(function(r){
    var id = String(r.id), done = r.reason_id != null;
    var d = mnDraft[id] || {};
    var val = function(k){ return d[k] != null ? d[k] : (r[k] == null ? '' : r[k]); };
    h += '<tr data-mn-id="' + escAttr(id) + '" id="mn-row-' + escAttr(id) + '"><td>' + esc(r.material) + '</td><td>' + esc(r.material_desc) + '</td><td>' + esc(fmtDate(r.posting_date)) + '</td>';
    h += '<td class="mn-qty" style="text-align:right;">' + esc(mnFmtQty(r._rest)) + '</td><td>' + esc(r.uom) + '</td>';
    if(fill){
      h += '<td style="' + yel + '"><input id="mn-code-' + escAttr(id) + '" value="' + escAttrVal(val('real_code')) + '" style="width:90px;"></td>';
      var cur = String(val('reason_id'));
      /* Фиксирана ширина: най-дългата причина разтягаше менюто до ~378 px и
         „Запази“ излизаше извън картата (21.10.2026). Целият текст — в title. */
      h += '<td style="' + yel + '"><select id="mn-reason-' + escAttr(id) + '" style="width:180px;max-width:180px;" title="' + escAttrVal(mnReasonLabel(cur)) + '"' +
        ' onchange="this.title=this.value?this.options[this.selectedIndex].text:\'\'"><option value="">— избери —</option>';
      mnReasons.forEach(function(x){
        if(x.active === false && String(x.id) !== cur) return;
        h += '<option value="' + escAttr(String(x.id)) + '"' + (String(x.id) === cur ? ' selected' : '') + '>' + esc(x.label) + '</option>';
      });
      h += '</select></td>';
      h += '<td style="' + yel + '"><input id="mn-emp-' + escAttr(id) + '" value="' + escAttrVal(val('employee_name')) + '" style="width:120px;"></td>';
      h += '<td style="' + yel + '"><input id="mn-note-' + escAttr(id) + '" value="' + escAttrVal(val('note')) + '" style="width:140px;"></td>';
      h += '<td style="white-space:nowrap;">' + (done ? '<span class="mn-done" title="' + escAttr('Попълнено: ' + (r.filled_by || '') + ' ' + mnFmtTs(r.filled_at)) + '">✅</span> ' : '') + '<button class="btn btn-green" onclick="mnSave(\'' + escAttr(id) + '\')">Запази</button></td>';
    } else {
      h += '<td>' + esc(r.real_code || '') + '</td><td>' + esc(mnReasonLabel(r.reason_id)) + '</td><td>' + esc(r.employee_name || '') + '</td><td>' + esc(r.note || '') + '</td>';
      h += '<td>' + (done ? '<span class="mn-done" title="' + escAttr((r.filled_by || '') + ' ' + mnFmtTs(r.filled_at)) + '">✅</span>' : '') + '</td>';
    }
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}
function mnByMatHtml(rows){
  if(!rows.length) return '<div class="card" id="mn-empty" style="color:#64748b;">Няма незакрити артикули.</div>';
  var h = '<div class="card" style="overflow-x:auto;"><table id="mn-bymat"><thead><tr><th>Материал</th><th>Описание</th><th>955</th><th>956</th><th>Остатък</th><th>Мерна ед.</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h += '<tr id="mn-mat-' + escAttr(r.material) + '"><td>' + esc(r.material) + '</td><td>' + esc(r.desc) + '</td>';
    h += '<td class="mn-s955" style="text-align:right;">' + esc(mnFmtQty(r.s955)) + '</td><td class="mn-s956" style="text-align:right;">' + esc(mnFmtQty(r.s956)) + '</td>';
    h += '<td class="mn-rest" style="text-align:right;font-weight:600;">' + esc(mnFmtQty(r.rest)) + '</td><td>' + esc(r.uom) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}
function mnOverHtml(rows){
  var h = '<div class="card" id="mn-over" style="border-left:4px solid #dc2626;"><b>⚠ Свръхсторно — 956 над 955 (вижда само контролингът)</b>';
  h += '<table><thead><tr><th>Материал</th><th>Описание</th><th>955</th><th>956</th><th>Разлика</th><th>Мерна ед.</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h += '<tr><td>' + esc(r.material) + '</td><td>' + esc(r.desc) + '</td><td>' + esc(mnFmtQty(r.s955)) + '</td><td>' + esc(mnFmtQty(r.s956)) + '</td><td>' + esc(mnFmtQty(r.rest)) + '</td><td>' + esc(r.uom) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/* ─── Действия ─────────────────────────────────────────── */
function mnSetView(v){ mnView = v === 'bymat' ? 'bymat' : 'daily'; mnRender(); }
function mnSetUnfilled(on){ mnOnlyUnfilled = !!on; mnRender(); }
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
  var body = {
    real_code: g('mn-code-') || null,
    reason_id: parseInt(reason, 10),
    employee_name: emp,
    note: g('mn-note-') || null,
    filled_by: currentUser.display_name || currentUser.email || '',
    filled_at: new Date().toISOString()
  };
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
