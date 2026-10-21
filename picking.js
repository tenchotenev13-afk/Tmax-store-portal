/* picking.js — под-таб „📦 Пикинг" в Транспорт, етап 1 (21.10.2026).
   Схема: picking-schema.sql — picking_batches, picking_lines +
   app_settings.picking_users.

   Предложение на В. Филев (17.10.2026). Складът качва седмичните SAP износи
   „Планиран трансфер" и „Непланиран трансфер"; тук те стават списък за пикинг
   по обект и снабдителска група. Работникът отмята „✓ Взето" (с корекция на
   броя) или „⤼ Пропусни" (само с коментар); „🖨 Отклонения" е списъкът за
   Данчето вместо бележките по хартията.
   Етап 1 — БЕЗ сканиране, палети, износ към SAP и известия. Нищо оттук не
   влиза в История, „Днес", имейли и отчети.

   Достъп (пилот): само имейлите от app_settings.picking_users (списък със
   запетая, НЕ 'on' — виж HIDDEN-FEATURES.md). Ключът се чете при вход
   (setupTabsForRole в shared.js) и пак в loadPicking(); без достъп
   под-бутонът е скрит, а loadPicking() не чете нито една picking_* таблица.

   Склад: потребител със store_name = логистичен склад е фиксиран към него;
   всеки друг избира от двата (селектът стои и при един избор).

   Файлът се разпознава по заглавния ред, колоните се търсят ПО ИМЕ (trim):
     „За трансфер" + „Oт къде" (латинско O; допуска се и кирилско)  → planned
     „Магазин изпълнител"                                          → unplanned
   Номер на магазин → обект: SR_SHEET_TO_STORE от stock-returns.js
   ('5' и '18' са складовете). Непознат номер — редът се пропуска и брои,
   импортът не спира.
   Повторно качване на същия планиран файл: insert on conflict do nothing по
   (warehouse, sap_order, sap_item). Непланираният няма номер на заявка —
   повторното му качване ДУБЛИРА (етап 1, известно).

   Видими редове: от качванията за последните PK_DAYS дни на избрания склад
   (решение на сесията — иначе старите седмици трупат „Отворени" завинаги). */

var pkUsersOn = [];     /* app_settings.picking_users — малки букви */
var pkUsersSeq = 0;
var pkWarehouse = '';   /* изборът на не-складов потребител */
var pkBatches = [];
var pkLines = [];
var pkStore = '';
var pkFilter = 'open';  /* open | picked | skipped | all */
var pkSearch = '';
var pkEdit = null;      /* {id, mode:'pick'|'skip'} — отвореното поле на ред */
var pkLoadSeq = 0;
var pkLoadErr = '';
var pkBusy = false;

var PK_DAYS = 14;
var PK_CHUNK = 500;
var PK_LINE_COLS = 'id,batch_id,warehouse,store_name,sap_code,product_name,unit,qty_requested,supply_group,sap_order,sap_item,line_no,status,qty_picked,comment,done_by,done_at,created_at';
var PK_FILTER_LABEL = { open: 'Отворени', picked: 'Взети', skipped: 'Пропуснати', all: 'Всички' };

/* ─── Достъп ───────────────────────────────────────────── */
function pkParseUsers(v){
  return String(v == null ? '' : v).split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
}
function pkCanSee(){
  return !!currentUser && !!currentUser.email && pkUsersOn.indexOf(String(currentUser.email).trim().toLowerCase()) >= 0;
}
function pkSyncButton(){
  var b = document.getElementById('tps-picking');
  if(b) b.style.display = pkCanSee() ? '' : 'none';
}
/* Чете ключа и показва/скрива под-бутона. Само app_settings, нищо друго. */
function pkLoadUsers(){
  var seq = ++pkUsersSeq;
  return sbGet('app_settings', 'key=eq.picking_users&select=key,value', true).then(function(rows){
    var row = (Array.isArray(rows) ? rows : []).filter(function(r){ return r && r.key === 'picking_users'; })[0];
    if(seq === pkUsersSeq) pkUsersOn = pkParseUsers(row && row.value);
    pkSyncButton();
    return pkCanSee();
  });
}
function pkFixedWarehouse(){
  return currentUser && LOGISTICS_WAREHOUSES.indexOf(currentUser.store_name) >= 0 ? currentUser.store_name : '';
}
function pkActiveWarehouse(){
  return pkFixedWarehouse() || (LOGISTICS_WAREHOUSES.indexOf(pkWarehouse) >= 0 ? pkWarehouse : '');
}

/* ─── Числа и дати ─────────────────────────────────────── */
function pkNum(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/\s/g, '');
  if(!s) return null;
  if(s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if(!/^-?\d*\.?\d+$/.test(s)) return null;
  return parseFloat(s);
}
/* esc() връща „—“ за празно — тук празното трябва да остане празно. */
function pkE(v){ return v == null || v === '' ? '' : esc(String(v)); }
function pkCode(v){ return String(v == null ? '' : v).trim().replace(/\.0+$/, ''); }
function pkTxt(v){ var s = String(v == null ? '' : v).trim(); return s || null; }
function pkFmtQty(n){
  if(n == null || n === '' || !isFinite(Number(n))) return '';
  return String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');
}
function pkPad(n){ return String(n).padStart(2, '0'); }
function pkFmtTs(ts){
  if(!ts) return '';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '';
  return pkPad(d.getDate()) + '.' + pkPad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pkPad(d.getHours()) + ':' + pkPad(d.getMinutes());
}
/* Срокът: първият петък СЛЕД деня на качването, 12:00 (само текст). */
function pkDeadline(ts){
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '';
  var add = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return 'петък ' + pkPad(d.getDate()) + '.' + pkPad(d.getMonth() + 1) + ' 12:00';
}

/* ─── Файлът ───────────────────────────────────────────── */
function pkHdrIdx(hdr, names){
  for(var i = 0; i < names.length; i++){ var k = hdr.indexOf(names[i]); if(k >= 0) return k; }
  return -1;
}
/* Без запис — отделено за теста. → {error} или
   {source, rows, total, skipped, zero, other, s2s, unknown:{номер:брой}} */
function pkParse(aoa, warehouse){
  if(!Array.isArray(aoa) || !aoa.length) return { error: 'Файлът е празен' };
  var map = (typeof SR_SHEET_TO_STORE !== 'undefined') ? SR_SHEET_TO_STORE : {};
  var hdr = (aoa[0] || []).map(function(c){ return String(c == null ? '' : c).trim(); });
  var FROM = ['Oт къде', 'От къде'];
  var source = (hdr.indexOf('За трансфер') >= 0 && pkHdrIdx(hdr, FROM) >= 0) ? 'planned'
    : (hdr.indexOf('Магазин изпълнител') >= 0 ? 'unplanned' : '');
  if(!source) return { error: 'Не е трансферен файл' };
  var cols = source === 'planned'
    ? { code: 'Материал', store: 'Магазин', name: 'Описание на материал', unit: 'Базова мерна единица', qty: 'За трансфер',
        group: 'Снабдителска група', order: 'Заявка за доставка', item: 'Позиция на заявка' }
    : { code: 'Материал', store: 'Магазин заявител', exec: 'Магазин изпълнител', name: 'Описание на материал',
        unit: 'Мерна единица', qty: 'Заявено количество' };
  var idx = {}, missing = [];
  Object.keys(cols).forEach(function(k){ idx[k] = hdr.indexOf(cols[k]); if(idx[k] < 0) missing.push('„' + cols[k] + '"'); });
  if(source === 'planned') idx.from = pkHdrIdx(hdr, FROM);
  if(missing.length) return { error: 'Липсва колона: ' + missing.join(', ') };
  var out = { source: source, rows: [], total: 0, skipped: 0, zero: 0, other: 0, s2s: 0, unknown: {} };
  var unk = function(n){ n = n || '—'; out.unknown[n] = (out.unknown[n] || 0) + 1; out.skipped++; };
  for(var r = 1; r < aoa.length; r++){
    var row = aoa[r] || [];
    if(!row.some(function(c){ return c !== '' && c != null; })) continue;
    out.total++;
    var qty, store;
    if(source === 'planned'){
      qty = pkNum(row[idx.qty]);
      if(!(qty > 0)){ out.zero++; out.skipped++; continue; }
      if(map[pkCode(row[idx.from])] !== warehouse){ out.other++; out.skipped++; continue; }
    } else {
      var ex = map[pkCode(row[idx.exec])];
      if(!ex){ unk(pkCode(row[idx.exec])); continue; }
      if(ex !== warehouse){
        if(LOGISTICS_WAREHOUSES.indexOf(ex) >= 0) out.other++; else out.s2s++;
        out.skipped++; continue;
      }
      qty = pkNum(row[idx.qty]);
      if(!(qty > 0)){ out.zero++; out.skipped++; continue; }
    }
    var num = pkCode(row[idx.store]);
    store = map[num];
    if(!store){ unk(num); continue; }
    var code = pkCode(row[idx.code]);
    if(!code){ out.skipped++; continue; }
    out.rows.push({
      store_name: store, sap_code: code,
      product_name: pkTxt(row[idx.name]), unit: pkTxt(row[idx.unit]), qty_requested: qty,
      supply_group: source === 'planned' ? pkTxt(pkCode(row[idx.group])) : null,
      sap_order: source === 'planned' ? pkTxt(pkCode(row[idx.order])) : null,
      sap_item: source === 'planned' ? pkTxt(pkCode(row[idx.item])) : null,
      line_no: r + 1
    });
  }
  return out;
}
function pkWithXlsx(cb){
  if(window.XLSX){ cb(); return; }
  var sc = document.createElement('script');
  sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  sc.onload = cb;
  sc.onerror = function(){ toast('Грешка при зареждане на SheetJS', '#dc2626'); };
  document.head.appendChild(sc);
}
function pkImportFile(input){
  var f = input && input.files && input.files[0];
  if(!f) return;
  input.value = '';
  if(!pkActiveWarehouse()){ toast('Първо избери склад', '#dc2626'); return; }
  pkWithXlsx(function(){
    var rd = new FileReader();
    rd.onload = function(e){
      var aoa;
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
      } catch(err){ toast('Файлът не може да се прочете: ' + err.message, '#dc2626'); return; }
      pkImportAoa(aoa, f.name);
    };
    rd.readAsArrayBuffer(f);
  });
}
/* POST с on conflict do nothing — връща само реално вмъкнатите редове. */
function pkPostIgnoreDup(rows){
  var url = API + '/picking_lines?on_conflict=warehouse,sap_order,sap_item&select=id';
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({}, H, { 'Prefer': 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify(rows)
  }).then(function(r){
    return r.json().catch(function(){ return null; }).then(function(d){
      if(!r.ok) return sbWriteFail('pkPostIgnoreDup', url, r.status, d);
      return { ok: true, inserted: Array.isArray(d) ? d.length : 0 };
    });
  }).catch(sbNetFail('pkPostIgnoreDup', url));
}
function pkImportAoa(aoa, fileName){
  if(!pkCanSee()){ toast('Нямаш достъп', '#dc2626'); return Promise.resolve(null); }
  var wh = pkActiveWarehouse();
  if(!wh){ toast('Първо избери склад', '#dc2626'); return Promise.resolve(null); }
  if(pkBusy) return Promise.resolve(null);
  var p = pkParse(aoa, wh);
  if(p.error){ toast(p.error + ' — нищо не е качено', '#dc2626'); return Promise.resolve({ error: p.error }); }
  var unkKeys = Object.keys(p.unknown);
  var notes = [];
  if(p.s2s) notes.push(p.s2s + ' реда са обект → обект — не са за склада');
  if(unkKeys.length) notes.push('непознат номер на магазин: ' + unkKeys.map(function(k){ return k + ' × ' + p.unknown[k]; }).join(', '));
  if(!p.rows.length){
    toast('Нито един ред за ' + wh + ' — нищо не е качено' + (notes.length ? ' · ' + notes.join(' · ') : ''), '#dc2626');
    return Promise.resolve({ error: 'empty', parse: p });
  }
  pkBusy = true;
  var who = currentUser.display_name || currentUser.email || '';
  var rep = { source: p.source, total: p.total, candidates: p.rows.length, inserted: 0, skipped: p.skipped, s2s: p.s2s, unknown: p.unknown, failed: false };
  return sbPostReturn('picking_batches', {
    warehouse: wh, source: p.source, file_name: fileName || null,
    rows_total: p.total, rows_imported: 0, rows_skipped: p.skipped, uploaded_by: who
  }).then(function(res){
    if(!res.ok || !res.row){ pkBusy = false; toast('Качването не е записано: ' + sbErrMsg(res), '#dc2626'); return { error: sbErrMsg(res) }; }
    var bId = res.row.id;
    var chain = Promise.resolve(true);
    for(var i = 0; i < p.rows.length; i += PK_CHUNK){
      (function(chunk){
        chain = chain.then(function(okSoFar){
          if(!okSoFar) return false;
          return pkPostIgnoreDup(chunk.map(function(x){ return Object.assign({ batch_id: bId, warehouse: wh }, x); })).then(function(r){
            if(r.ok){ rep.inserted += r.inserted; return true; }
            rep.err = sbErrMsg(r);
            return false;
          });
        });
      })(p.rows.slice(i, i + PK_CHUNK));
    }
    return chain.then(function(allOk){
      if(!allOk){
        /* Първата заявка не бива да изглежда успешна (правило 13): махаме
           качването — каскадата трие и вече влезлите му редове. */
        rep.failed = true;
        return sbDelete('picking_batches', 'id=eq.' + encodeURIComponent(bId)).then(function(){
          pkBusy = false;
          toast('Редовете не са записани (' + (rep.err || 'грешка') + ') — качването е отменено, качи файла пак', '#dc2626');
          return loadPicking().then(function(){ return rep; });
        });
      }
      return sbPatch('picking_batches', 'id=eq.' + encodeURIComponent(bId), { rows_imported: rep.inserted }).then(function(){
        pkBusy = false;
        var already = rep.candidates - rep.inserted;
        var msg = (p.source === 'planned' ? 'Планиран' : 'Непланиран') + ': нови ' + rep.inserted +
          (already ? ', вече качени ' + already : '') + ', пропуснати ' + rep.skipped +
          (notes.length ? ' · ' + notes.join(' · ') : '');
        toast(msg, unkKeys.length ? '#dc2626' : '#16a34a');
        rep.message = msg;
        return loadPicking().then(function(){ return rep; });
      });
    });
  });
}

/* ─── Зареждане ────────────────────────────────────────── */
function pkTitle(){ return '<div class="pg-title">📦 Пикинг</div>'; }
function loadPicking(){
  var el = document.getElementById('mod-picking');
  if(!el) return Promise.resolve();
  var seq = ++pkLoadSeq;
  return pkLoadUsers().then(function(){
    if(seq !== pkLoadSeq) return;
    if(!pkCanSee()){ el.innerHTML = pkTitle() + '<div class="card" id="pk-noaccess">Нямаш достъп до този модул.</div>'; return; }
    var wh = pkActiveWarehouse();
    if(!wh){ pkBatches = []; pkLines = []; pkRender(); return; }
    if(!pkBatches.length) el.innerHTML = pkTitle() + '<div style="padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
    var since = new Date(Date.now() - PK_DAYS * 86400000).toISOString();
    return sbGetOk('picking_batches', 'select=*&warehouse=eq.' + encodeURIComponent(wh) + '&uploaded_at=gte.' + encodeURIComponent(since) + '&order=uploaded_at.desc').then(function(rb){
      if(seq !== pkLoadSeq) return;
      if(!rb.ok){ pkLoadErr = rb.error; pkRenderErr(); return; }
      var batches = rb.rows;
      if(!batches.length){ pkLoadErr = ''; pkBatches = []; pkLines = []; pkRender(); return; }
      var ids = batches.map(function(b){ return b.id; }).join(',');
      return sbGetAll('picking_lines', 'select=' + PK_LINE_COLS + '&batch_id=in.(' + ids + ')&order=created_at.asc,line_no.asc,id.asc').then(function(lines){
        if(seq !== pkLoadSeq) return;
        if(lines.partial){ pkLoadErr = 'редовете не се заредиха изцяло'; pkRenderErr(); return; }
        pkLoadErr = '';
        pkBatches = batches;
        pkLines = lines;
        pkRender();
      });
    });
  });
}
function pkRenderErr(){
  var el = document.getElementById('mod-picking');
  if(el) el.innerHTML = pkTitle() + '<div id="pk-load-err" class="card" style="color:#b91c1c;">⚠ Пикингът не се зареди: ' + esc(pkLoadErr) + '</div>';
  toast('Пикингът не се зареди: ' + pkLoadErr, '#dc2626');
}

/* ─── Изчисления ───────────────────────────────────────── */
function pkStoreStats(){
  var by = {}, order = [];
  pkLines.forEach(function(l){
    if(!by[l.store_name]){ by[l.store_name] = { store: l.store_name, total: 0, picked: 0, skipped: 0 }; order.push(l.store_name); }
    var s = by[l.store_name];
    s.total++;
    if(l.status === 'picked') s.picked++;
    else if(l.status === 'skipped') s.skipped++;
  });
  return order.sort(function(a, b){ return a.localeCompare(b, 'bg'); }).map(function(k){ return by[k]; });
}
function pkIsDeviation(l){
  if(l.status === 'skipped') return true;
  return l.status === 'picked' && l.qty_picked != null && Number(l.qty_picked) !== Number(l.qty_requested);
}
function pkBatchDeletable(bId){
  return !pkLines.some(function(l){ return l.batch_id === bId && l.status !== 'open'; });
}

/* ─── Рендер ───────────────────────────────────────────── */
function pkRender(){
  var el = document.getElementById('mod-picking');
  if(!el) return;
  var wh = pkActiveWarehouse();
  var h = pkTitle();
  h += '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(pkFixedWarehouse()) h += '<b id="pk-wh-fixed">' + esc(wh) + '</b>';
  else {
    h += '<select id="pk-wh" class="fi" onchange="pkSetWarehouse(this.value)" style="max-width:260px;display:inline-block;width:auto;"><option value="">-- Избери склад --</option>';
    LOGISTICS_WAREHOUSES.forEach(function(w){ h += '<option' + (w === wh ? ' selected' : '') + '>' + esc(w) + '</option>'; });
    h += '</select>';
  }
  if(wh){
    h += '<label class="btn btn-primary" style="cursor:pointer;">📂 Качи файл<input type="file" id="pk-file" accept=".xlsx,.xls" style="display:none;" onchange="pkImportFile(this)"></label>';
    h += '<button id="pk-print" class="btn" onclick="pkPrintDeviations()">🖨 Отклонения</button>';
  }
  h += '</div>';
  if(!wh){ el.innerHTML = h + '<div class="card" id="pk-need-wh" style="color:#64748b;">Избери склад, за да качиш файл и да видиш списъка.</div>'; return; }
  h += pkBatchesHtml();
  var stats = pkStoreStats();
  if(!stats.length){ el.innerHTML = h + '<div class="card" id="pk-empty" style="color:#64748b;">Няма редове за пикинг за последните ' + PK_DAYS + ' дни.</div>'; return; }
  if(!pkStore || !stats.some(function(s){ return s.store === pkStore; })) pkStore = stats[0].store;
  h += '<div class="card" id="pk-chips" style="display:flex;flex-wrap:wrap;gap:6px;">';
  stats.forEach(function(s){
    h += '<button class="filter-btn pk-chip' + (s.store === pkStore ? ' active' : '') + '" data-pk-store="' + escAttr(s.store) + '" onclick="pkSetStore(this.getAttribute(\'data-pk-store\'))">' +
      esc(s.store) + ' · взети ' + s.picked + ' от ' + s.total + (s.skipped ? ' · ⤼ ' + s.skipped : '') + '</button>';
  });
  h += '</div>';
  var mine = pkLines.filter(function(l){ return l.store_name === pkStore; });
  var cnt = { open: 0, picked: 0, skipped: 0, all: mine.length };
  mine.forEach(function(l){ if(cnt[l.status] != null) cnt[l.status]++; });
  h += '<div class="card" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
  ['open', 'picked', 'skipped', 'all'].forEach(function(f){
    h += '<button id="pk-f-' + f + '" class="filter-btn' + (pkFilter === f ? ' active' : '') + '" onclick="pkSetFilter(\'' + f + '\')">' + PK_FILTER_LABEL[f] + ' (' + cnt[f] + ')</button>';
  });
  h += '<input id="pk-search" class="fi" placeholder="🔍 код или име" value="' + escAttrVal(pkSearch) + '" oninput="pkSetSearch(this.value)" style="max-width:240px;margin-left:auto;">';
  h += '</div>';
  h += '<div id="pk-list">' + pkListHtml() + '</div>';
  el.innerHTML = h;
}
function pkBatchesHtml(){
  if(!pkBatches.length) return '<div class="card" id="pk-batches" style="color:#64748b;">Няма качвания за последните ' + PK_DAYS + ' дни.</div>';
  var h = '<div class="card" style="overflow-x:auto;"><div id="pk-days-note" style="font-size:12px;color:#64748b;margin-bottom:6px;">Показани са качванията от последните ' + PK_DAYS + ' дни</div><table id="pk-batches"><thead><tr><th>Качено</th><th>Файл</th><th>Вид</th><th>Влезли</th><th>Пропуснати</th><th>Срок</th><th></th></tr></thead><tbody>';
  pkBatches.forEach(function(b){
    h += '<tr data-pk-batch="' + escAttr(b.id) + '"><td>' + esc(pkFmtTs(b.uploaded_at)) + '<div style="font-size:11px;color:#94a3b8;">' + pkE(b.uploaded_by) + '</div></td>' +
      '<td>' + pkE(b.file_name) + '</td><td>' + (b.source === 'planned' ? 'Планиран' : 'Непланиран') + '</td>' +
      '<td>' + esc(String(b.rows_imported == null ? '—' : b.rows_imported)) + '</td><td>' + esc(String(b.rows_skipped == null ? '—' : b.rows_skipped)) + '</td>' +
      '<td class="pk-deadline">срок: ' + esc(pkDeadline(b.uploaded_at)) + '</td>' +
      '<td>' + (pkBatchDeletable(b.id) ? '<button class="btn btn-sm pk-del" title="Изтрий качването" onclick="pkDeleteBatch(\'' + escAttr(b.id) + '\')">🗑</button>' : '') + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}
function pkListHtml(){
  var q = pkSearch.trim().toLowerCase();
  var rows = pkLines.filter(function(l){
    if(l.store_name !== pkStore) return false;
    if(pkFilter !== 'all' && l.status !== pkFilter) return false;
    if(q && String(l.sap_code).toLowerCase().indexOf(q) < 0 && String(l.product_name || '').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  if(!rows.length) return '<div class="card" id="pk-none" style="color:#64748b;">Няма редове.</div>';
  var groups = {}, order = [], NONE = '\u0000';
  rows.forEach(function(l){
    var g = l.supply_group || NONE;
    if(!groups[g]){ groups[g] = []; order.push(g); }
    groups[g].push(l);
  });
  order = order.filter(function(g){ return g !== NONE; }).concat(groups[NONE] ? [NONE] : []);
  var h = '';
  order.forEach(function(g){
    h += '<div class="card pk-group" data-pk-group="' + (g === NONE ? '' : escAttr(g)) + '"><div style="font-weight:600;margin-bottom:6px;">' +
      (g === NONE ? 'без група' : 'Снабдителска група ' + esc(g)) + ' <span style="color:#94a3b8;font-weight:400;">(' + groups[g].length + ')</span></div><table><tbody>';
    groups[g].forEach(function(l){ h += pkRowHtml(l); });
    h += '</tbody></table></div>';
  });
  return h;
}
function pkRowHtml(l){
  var id = escAttr(l.id);
  var h = '<tr class="pk-row" data-pk-id="' + id + '" id="pk-row-' + id + '"><td>' + esc(l.sap_code) + '</td><td>' + esc(l.product_name) + '</td>' +
    '<td style="text-align:right;white-space:nowrap;">' + esc(pkFmtQty(l.qty_requested)) + ' ' + pkE(l.unit) + '</td><td style="white-space:nowrap;">';
  var ed = pkEdit && pkEdit.id === l.id ? pkEdit.mode : '';
  if(l.status === 'open' && ed === 'pick'){
    h += '<input id="pk-qty-' + id + '" type="number" step="any" value="' + escAttrVal(String(l.qty_requested)) + '" style="width:80px;"> ' +
      '<button class="btn btn-sm btn-primary" onclick="pkSavePick(\'' + id + '\')">Запиши</button> <button class="btn btn-sm" onclick="pkCancel()">Отказ</button>';
  } else if(l.status === 'open' && ed === 'skip'){
    h += '<input id="pk-comment-' + id + '" placeholder="Защо е пропуснат (задължително)" style="width:220px;"> ' +
      '<button class="btn btn-sm btn-primary" onclick="pkSaveSkip(\'' + id + '\')">Запиши</button> <button class="btn btn-sm" onclick="pkCancel()">Отказ</button>';
  } else if(l.status === 'open'){
    h += '<button class="btn btn-sm btn-primary" onclick="pkStartEdit(\'' + id + '\',\'pick\')">✓ Взето</button> ' +
      '<button class="btn btn-sm" onclick="pkStartEdit(\'' + id + '\',\'skip\')">⤼ Пропусни</button>';
  } else {
    var who = escAttr((l.done_by || '') + ' ' + pkFmtTs(l.done_at));
    if(l.status === 'picked'){
      var got = l.qty_picked == null ? l.qty_requested : l.qty_picked;
      h += '<span class="pk-badge" title="' + who + '" style="background:#dcfce7;color:#166534;border-radius:6px;padding:2px 6px;' + (pkIsDeviation(l) ? 'outline:2px solid #f59e0b;' : '') + '">✓ ' + esc(pkFmtQty(got)) + ' от ' + esc(pkFmtQty(l.qty_requested)) + '</span>';
    } else {
      h += '<span class="pk-badge" title="' + who + '" style="background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 6px;">⤼ ' + pkE(l.comment) + '</span>';
    }
    h += ' <button class="btn btn-sm" onclick="pkUndo(\'' + id + '\')">↩ Върни</button>';
  }
  return h + '</td></tr>';
}

/* ─── Действия ─────────────────────────────────────────── */
function pkSetWarehouse(v){
  pkWarehouse = v || '';
  pkBatches = []; pkLines = []; pkStore = ''; pkEdit = null;
  return loadPicking();
}
function pkSetStore(s){ pkStore = s; pkEdit = null; pkRender(); }
function pkSetFilter(f){ pkFilter = PK_FILTER_LABEL[f] ? f : 'open'; pkEdit = null; pkRender(); }
function pkSetSearch(s){
  pkSearch = String(s || '');
  var box = document.getElementById('pk-list');
  if(box) box.innerHTML = pkListHtml();
}
function pkStartEdit(id, mode){ pkEdit = { id: id, mode: mode }; pkRender(); }
function pkCancel(){ pkEdit = null; pkRender(); }
function pkFind(id){ return pkLines.filter(function(l){ return String(l.id) === String(id); })[0] || null; }
function pkWrite(l, body, okMsg){
  return sbPatch('picking_lines', 'id=eq.' + encodeURIComponent(l.id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(body).forEach(function(k){ l[k] = body[k]; });
    pkEdit = null;
    pkRender();
    toast(okMsg);
    return true;
  });
}
function pkWho(){ return currentUser.display_name || currentUser.email || ''; }
function pkSavePick(id){
  var l = pkFind(id);
  if(!l || !pkCanSee()) return Promise.resolve(false);
  var inp = document.getElementById('pk-qty-' + id);
  var n = pkNum(inp ? inp.value : null);
  if(n == null || !(n > 0)){ toast('Броят трябва да е над 0', '#dc2626'); return Promise.resolve(false); }
  var same = Math.abs(n - Number(l.qty_requested)) < 1e-9;
  return pkWrite(l, { status: 'picked', qty_picked: same ? null : n, comment: null, done_by: pkWho(), done_at: new Date().toISOString() }, '✓ Взето');
}
function pkSaveSkip(id){
  var l = pkFind(id);
  if(!l || !pkCanSee()) return Promise.resolve(false);
  var inp = document.getElementById('pk-comment-' + id);
  var c = String(inp ? inp.value : '').trim();
  if(!c){ toast('Напиши защо е пропуснат', '#dc2626'); return Promise.resolve(false); }
  return pkWrite(l, { status: 'skipped', qty_picked: null, comment: c, done_by: pkWho(), done_at: new Date().toISOString() }, '⤼ Пропуснат');
}
function pkUndo(id){
  var l = pkFind(id);
  if(!l || !pkCanSee()) return Promise.resolve(false);
  return pkWrite(l, { status: 'open', qty_picked: null, comment: null, done_by: null, done_at: null }, '↩ Върнат');
}
function pkDeleteBatch(id){
  if(!pkCanSee()) return Promise.resolve(false);
  if(!pkBatchDeletable(id)){ toast('Има отметнати редове — качването не се трие', '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Изтриване на качването и всичките му редове?')) return Promise.resolve(false);
  return sbDelete('picking_batches', 'id=eq.' + encodeURIComponent(id)).then(function(res){
    if(!res.ok){ toast('Не е изтрито: ' + sbErrMsg(res), '#dc2626'); return false; }
    toast('Качването е изтрито');
    return loadPicking().then(function(){ return true; });
  });
}

/* ─── Печат „Отклонения" ───────────────────────────────── */
/* Списъкът за Данчето: по обект, само пропуснатите и взетите с различен брой.
   In-page в #mod-print (образец llPrint в loading.js). Трите правила от
   CLAUDE.md т.12 (white-space, box-sizing, долната рамка) са изрично тук. */
function pkPrintCss(){
  return '.pk-tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;margin-bottom:10px;}' +
    '.pk-tbl th,.pk-tbl td{box-sizing:border-box;border:1px solid #333;padding:1.2mm 0.8mm;white-space:normal;word-wrap:break-word;vertical-align:top;text-align:left;}' +
    '.pk-tbl tr:last-child td{border-bottom:1px solid #333;}' +
    '.pk-tbl th{background:#f1f5f9;}' +
    '.pk-store{font-size:14px;font-weight:700;margin:12px 0 4px;}';
}
function pkPrintDeviations(){
  var wh = pkActiveWarehouse();
  var rows = pkLines.filter(pkIsDeviation);
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var by = {}, stores = [];
  rows.forEach(function(l){ if(!by[l.store_name]){ by[l.store_name] = []; stores.push(l.store_name); } by[l.store_name].push(l); });
  stores.sort(function(a, b){ return a.localeCompare(b, 'bg'); });
  var body = stores.length ? stores.map(function(s){
    return '<div class="pk-store">' + esc(s) + '</div><table class="pk-tbl">' +
      '<colgroup><col style="width:22mm;"><col style="width:24mm;"><col style="width:16mm;"><col style="width:44mm;"><col style="width:14mm;"><col style="width:14mm;"><col style="width:32mm;"><col style="width:24mm;"></colgroup>' +
      '<tr><th>Обект</th><th>SAP заявка / поз.</th><th>Код</th><th>Име</th><th>Заявено</th><th>Взето</th><th>Коментар</th><th>Кой / кога</th></tr>' +
      by[s].map(function(l){
        var got = l.status === 'skipped' ? '0' : pkFmtQty(l.qty_picked);
        return '<tr class="pk-dev" data-pk-id="' + escAttr(l.id) + '"><td>' + esc(l.store_name) + '</td><td>' + (l.sap_order ? esc(l.sap_order) + ' / ' + pkE(l.sap_item) : '') + '</td>' +
          '<td>' + esc(l.sap_code) + '</td><td>' + esc(l.product_name) + '</td><td>' + esc(pkFmtQty(l.qty_requested)) + ' ' + pkE(l.unit) + '</td>' +
          '<td>' + esc(got) + '</td><td>' + (l.comment ? esc(l.comment) : '') + '</td><td>' + pkE(l.done_by) + '<br>' + esc(pkFmtTs(l.done_at)) + '</td></tr>';
      }).join('') + '</table>';
  }).join('') : '<div style="padding:12px;color:#777;">Няма отклонения.</div>';
  wrap.innerHTML = '<style>' + pkPrintCss() + '</style>' +
    '<div style="max-width:820px;margin:0 auto;padding:16px 16px 40px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">' +
        '<div style="font-size:18px;font-weight:600;">🖨 Отклонения при пикинг</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
          '<button onclick="showModule(\'picking\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
        '</div>' +
      '</div>' +
      '<div id="pk-print-wrap" data-pk-print="1">' +
        '<div style="font-size:16px;font-weight:700;">Отклонения при пикинг — ' + esc(wh) + '</div>' +
        '<div style="font-size:12px;color:#555;margin-bottom:6px;">Пропуснати и взети с различен брой · качвания за последните ' + PK_DAYS + ' дни · отпечатано ' + esc(pkFmtTs(new Date().toISOString())) + ' от ' + esc(pkWho()) + '</div>' +
        body +
      '</div>' +
    '</div>';
  showModule('print');
}
