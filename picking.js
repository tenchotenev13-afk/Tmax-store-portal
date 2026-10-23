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
   (решение на сесията — иначе старите седмици трупат „Отворени" завинаги).

   ЕТАП 2, част А (22.10.2026) — единици. Схема: picking-pallets-schema.sql
   (picking_pallets, picking_pallet_items). Вътрешна лента „📦 Събиране" /
   „🚚 Изпращане" (второто — етап 2б); обектът вижда само „Изпращане".
   „✓ Взето" записва реда И го слага в ТЕКУЩАТА единица на обекта с този
   брой (без текуща → нов палет; текущата затворена → отказ). Един ред може
   да е в няколко единици: взето = qty_picked ?? qty_requested, остатък =
   взето − Σ qty по единици; „➕ В единицата" добавя към СБОРА (не
   презаписва). „↩ Върни" на ред в единица — отказ. „Събрано" не е колона:
   няма отворени редове, остатък и отворени единици. Етикети (само
   затворените, 4 на A4) с QR #pk=<id> — библиотеката на Товарни листи
   (llLoadQrLib / llQrSvg от loading.js, само се викат); „🖨 Опис" по единица.

   ЕТАП 2, част Б (23.10.2026) — изпращане и приемане. Схема:
   picking-shipments-schema.sql (picking_shipments; FK от
   picking_pallets.shipment_id). Склад / ЦО: обект → „➕ Нов транспорт" →
   отметка „на камиона" (или QR #pk= при отворен транспорт за обекта) →
   „🚚 Тръгна": статусът е departed ПРЕДИ известието; push + имейл САМО до
   активните акаунти на обекта, чийто имейл е в picking_users (решение на
   Тенчо 23.10, вариант б — само те виждат „Пристигащи"): push през osSend
   (push.js) с таг store_name И display_name, имейл през llMailTo (loading.js)
   — само се викат. Без получател в пилота → жълто предупреждение, без
   маркер. Паднало известие → notify_error + „🔁 Прати пак" (правило 13).
   Обект: „Пристигащи" — „✓ Получен" (с артикулите: различно → коментар) /
   „⛔ Липсва" (коментар), „Приключи приемането" → received | partial;
   отклоненията се виждат и на склада. Автоматична Разлика — НЕ (решение в
   log-а: иска сверка на формата на stock_differences). */

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
var pkSub = 'collect';  /* collect | ship — вътрешната лента */
var pkPallets = [];     /* единиците на склада: отворени + от последните PK_DAYS дни */
var pkItems = [];       /* picking_pallet_items на тези единици */
var pkExtraLines = {};  /* id → ред от по-старо качване, който е в заредена единица */
var pkCurByStore = {};  /* обект → id на текущата единица */
var pkNewOpen = false;  /* отворен ли е изборът „➕ Нова единица" */
var pkFinish = {};      /* обект → {ok} | {issues:[…]} — резултатът от „Приключи" */
var pkDeepLink = null;  /* чакащият #pk=<id> */
var pkShipments = [];   /* част Б: транспортите (на склада или към моя обект) */
var pkShipFilter = 'active';
var pkShipStore = '';   /* избраният обект в „🚚 Изпращане" на склада */
var pkShipOpenId = null;/* отвореният транспорт */
var pkShipNewOpen = false;
var pkPendingLoad = null; /* {pid, sid} — QR на етикет при отворен транспорт */
var pkRecvHighlight = null; /* id на единицата от QR при обекта */

var PK_DAYS = 14;
var PK_CHUNK = 500;
var PK_LINE_COLS = 'id,batch_id,warehouse,store_name,sap_code,product_name,unit,qty_requested,supply_group,sap_order,sap_item,line_no,status,qty_picked,comment,done_by,done_at,created_at';
var PK_FILTER_LABEL = { open: 'Отворени', picked: 'Взети', skipped: 'Пропуснати', all: 'Всички' };
var PK_KIND = { pallet: { icon: '📦', label: 'Палет' }, bulk: { icon: '🧱', label: 'Насип' }, carton: { icon: '🗃', label: 'Кашон' } };
var PK_ITEM_COLS = 'id,pallet_id,line_id,qty,qty_received,receive_comment,created_at';
var PK_EPS = 1e-9;
var PK_SHIP_LABEL = { loading: 'Товари се', departed: 'Тръгнал', received: 'Приет', partial: 'Приет с отклонения' };
var PK_SHIP_FILTER = { active: 'Активни', loading: 'Товари се', departed: 'Тръгнали', received: 'Приети', partial: 'С отклонения', all: 'Всички' };

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
/* Обект (не склад, не ЦО, не глобална роля) — вижда само „🚚 Изпращане". */
function pkIsStoreSide(){
  if(!currentUser || !currentUser.store_name || pkFixedWarehouse() || isGlobal()) return false;
  return !(typeof isCentralOffice === 'function' && isCentralOffice(currentUser.store_name));
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
    if(!pkCanSee()){ pkDeepLink = null; el.innerHTML = pkTitle() + '<div class="card" id="pk-noaccess">Нямаш достъп до този модул.</div>'; return; }
    /* Обектът: само „🚚 Изпращане" → „Пристигащи" (част Б). */
    if(pkIsStoreSide()){
      pkSub = 'ship';
      var pre = pkDeepLink ? pkDeepLinkResolveStore(seq) : Promise.resolve();
      return pre.then(function(){ if(seq === pkLoadSeq) return pkLoadReceive(seq); });
    }
    var next = function(){ if(seq === pkLoadSeq) return pkSub === 'ship' ? pkLoadShip(seq) : pkLoadData(seq); };
    if(pkDeepLink) return pkDeepLinkResolve(seq).then(next);
    return next();
  });
}
function pkLoadData(seq){
  var el = document.getElementById('mod-picking');
  return Promise.resolve().then(function(){
    var wh = pkActiveWarehouse();
    if(!wh){ pkBatches = []; pkLines = []; pkPallets = []; pkItems = []; pkExtraLines = {}; pkRender(); return; }
    if(!pkBatches.length) el.innerHTML = pkTitle() + '<div style="padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
    var since = new Date(Date.now() - PK_DAYS * 86400000).toISOString();
    return sbGetOk('picking_batches', 'select=*&warehouse=eq.' + encodeURIComponent(wh) + '&uploaded_at=gte.' + encodeURIComponent(since) + '&order=uploaded_at.desc').then(function(rb){
      if(seq !== pkLoadSeq) return;
      if(!rb.ok){ pkLoadErr = rb.error; pkRenderErr(); return; }
      var batches = rb.rows;
      var linesP = batches.length
        ? sbGetAll('picking_lines', 'select=' + PK_LINE_COLS + '&batch_id=in.(' + batches.map(function(b){ return b.id; }).join(',') + ')&order=created_at.asc,line_no.asc,id.asc')
        : Promise.resolve([]);
      return linesP.then(function(lines){
        if(seq !== pkLoadSeq) return;
        if(lines.partial){ pkLoadErr = 'редовете не се заредиха изцяло'; pkRenderErr(); return; }
        return pkLoadUnits(wh, lines).then(function(u){
          if(seq !== pkLoadSeq) return;
          if(u.error){ pkLoadErr = u.error; pkRenderErr(); return; }
          pkLoadErr = '';
          pkBatches = batches;
          pkLines = lines;
          pkPallets = u.pallets;
          pkItems = u.items;
          pkExtraLines = u.extra;
          pkRender();
        });
      });
    });
  });
}
/* GET с in.(…) на порции — дълъг списък id-та не бива да удари лимита на URL. */
function pkGetIn(table, col, ids, select, order){
  var parts = [];
  for(var i = 0; i < ids.length; i += 80) parts.push(ids.slice(i, i + 80));
  return Promise.all(parts.map(function(p){
    return sbGetAll(table, 'select=' + select + '&' + col + '=in.(' + p.join(',') + ')&order=' + order);
  })).then(function(rs){
    var out = [], partial = false;
    rs.forEach(function(r){ if(r.partial) partial = true; out = out.concat(r); });
    if(partial) out.partial = true;
    return out;
  });
}
/* Единиците на склада (отворени + от последните PK_DAYS дни), редовете в тях
   и редовете от по-стари качвания, които са в тях. → {pallets, items, extra} | {error} */
function pkLoadUnits(wh, lines){
  var since = new Date(Date.now() - PK_DAYS * 86400000);
  var sinceD = since.getFullYear() + '-' + pkPad(since.getMonth() + 1) + '-' + pkPad(since.getDate());
  return sbGetOk('picking_pallets', 'select=*&warehouse=eq.' + encodeURIComponent(wh) +
    '&or=(status.eq.open,created_on.gte.' + sinceD + ')&order=created_at.asc,id.asc').then(function(rp){
    if(!rp.ok) return { error: rp.error };
    var pallets = rp.rows;
    if(!pallets.length) return { pallets: [], items: [], extra: {} };
    return pkGetIn('picking_pallet_items', 'pallet_id', pallets.map(function(p){ return p.id; }), PK_ITEM_COLS, 'created_at.asc,id.asc').then(function(items){
      if(items.partial) return { error: 'единиците не се заредиха изцяло' };
      var have = {};
      lines.forEach(function(l){ have[l.id] = 1; });
      var miss = [];
      items.forEach(function(it){ if(!have[it.line_id] && miss.indexOf(it.line_id) < 0) miss.push(it.line_id); });
      if(!miss.length) return { pallets: pallets, items: items, extra: {} };
      return pkGetIn('picking_lines', 'id', miss, PK_LINE_COLS, 'id.asc').then(function(ex){
        if(ex.partial) return { error: 'редовете на единиците не се заредиха изцяло' };
        var extra = {};
        ex.forEach(function(l){ extra[l.id] = l; });
        return { pallets: pallets, items: items, extra: extra };
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
  if(pkIsStoreSide()) pkSub = 'ship';
  el.innerHTML = pkTitle() + pkSubnavHtml() + (pkSub === 'ship' ? pkRenderShip() : pkRenderCollect());
}
/* Вътрешната лента (образец #rev-subnav). Обектът вижда само „Изпращане". */
function pkSubnavHtml(){
  var h = '<div id="pk-subnav" class="no-print" style="display:flex;gap:8px;margin:0 0 10px;">';
  if(!pkIsStoreSide()) h += '<button id="pks-collect" class="filter-btn' + (pkSub === 'collect' ? ' active' : '') + '" onclick="pkSetSub(\'collect\')">📦 Събиране</button>';
  h += '<button id="pks-ship" class="filter-btn' + (pkSub === 'ship' ? ' active' : '') + '" onclick="pkSetSub(\'ship\')">🚚 Изпращане</button>';
  return h + '</div>';
}
function pkSetSub(s){
  pkSub = (s === 'ship' || pkIsStoreSide()) ? 'ship' : 'collect';
  pkEdit = null;
  return loadPicking();
}
function pkRenderCollect(){
  var wh = pkActiveWarehouse();
  var h = '';
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
  if(!wh) return h + '<div class="card" id="pk-need-wh" style="color:#64748b;">Избери склад, за да качиш файл и да видиш списъка.</div>';
  h += pkBatchesHtml();
  var stats = pkStoreStats();
  if(!stats.length) return h + '<div class="card" id="pk-empty" style="color:#64748b;">Няма редове за пикинг за последните ' + PK_DAYS + ' дни.</div>';
  if(!pkStore || !stats.some(function(s){ return s.store === pkStore; })) pkStore = stats[0].store;
  h += '<div class="card" id="pk-chips" style="display:flex;flex-wrap:wrap;gap:6px;">';
  stats.forEach(function(s){
    h += '<button class="filter-btn pk-chip' + (s.store === pkStore ? ' active' : '') + '" data-pk-store="' + escAttr(s.store) + '" onclick="pkSetStore(this.getAttribute(\'data-pk-store\'))">' +
      esc(s.store) + ' · взети ' + s.picked + ' от ' + s.total + (s.skipped ? ' · ⤼ ' + s.skipped : '') +
      (pkStoreCollected(s.store) ? ' · ✅ събрано' : '') + '</button>';
  });
  h += '</div>';
  h += pkUnitsHtml(pkStore);
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
  return h;
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
    var rest = l.status === 'picked' ? pkRest(l) : 0;
    if(rest > PK_EPS && ed === 'add'){
      h += ' <input id="pk-add-' + id + '" type="number" step="any" value="' + escAttrVal(String(pkRound(rest))) + '" style="width:80px;"> ' +
        '<button class="btn btn-sm btn-primary" onclick="pkSaveAdd(\'' + id + '\')">Добави</button> <button class="btn btn-sm" onclick="pkCancel()">Отказ</button>';
    } else if(rest > PK_EPS){
      h += ' <button class="btn btn-sm pk-add" onclick="pkStartEdit(\'' + id + '\',\'add\')">➕ В единицата (' + esc(pkFmtQty(rest)) + ')</button>';
    }
    h += ' <button class="btn btn-sm" onclick="pkUndo(\'' + id + '\')">↩ Върни</button>';
  }
  h += '</td></tr>';
  var parts = pkItemsOfLine(l.id);
  if(parts.length){
    h += '<tr class="pk-parts" data-pk-parts="' + id + '"><td colspan="4" style="font-size:12px;color:#475569;padding-top:0;">' +
      parts.map(function(it){
        var p = pkPalletById(it.pallet_id);
        return '<span class="pk-part" data-pk-item="' + escAttr(it.id) + '">' + (p ? esc(pkUnitName(p)) : 'единица') + ' × ' + esc(pkFmtQty(it.qty)) +
          ' <button class="btn btn-sm pk-part-x" title="Махни от единицата" onclick="pkRemoveItem(\'' + escAttr(it.id) + '\')">✕</button></span>';
      }).join(' · ') + '</td></tr>';
  }
  return h;
}

/* ─── Действия ─────────────────────────────────────────── */
function pkSetWarehouse(v){
  pkWarehouse = v || '';
  pkBatches = []; pkLines = []; pkStore = ''; pkEdit = null;
  pkPallets = []; pkItems = []; pkExtraLines = {}; pkCurByStore = {}; pkFinish = {}; pkNewOpen = false;
  pkShipments = []; pkShipStore = ''; pkShipOpenId = null; pkShipNewOpen = false;
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
  /* Редът влиза в ТЕКУЩАТА единица с целия взет брой. Затворена текуща →
     отказ ПРЕДИ всеки запис; без текуща → нов палет. */
  return pkTargetUnit(l.store_name).then(function(u){
    if(!u) return false;
    var body = { status: 'picked', qty_picked: same ? null : n, comment: null, done_by: pkWho(), done_at: new Date().toISOString() };
    return sbPatch('picking_lines', 'id=eq.' + encodeURIComponent(l.id), body).then(function(res){
      if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
      Object.keys(body).forEach(function(k){ l[k] = body[k]; });
      return pkAddToUnit(u, l, n).then(function(ok){
        pkEdit = null;
        pkRender();
        if(ok) toast('✓ Взето · ' + pkUnitName(u));
        else toast('Взето, но не влезе в единицата — „➕ В единицата"', '#dc2626');
        return ok;
      });
    });
  });
}
/* „➕ В единицата" — остатъкът на взет ред; сборът, не презапис. */
function pkSaveAdd(id){
  var l = pkFind(id);
  if(!l || !pkCanSee() || l.status !== 'picked') return Promise.resolve(false);
  var rest = pkRest(l);
  var inp = document.getElementById('pk-add-' + id);
  var n = pkNum(inp ? inp.value : null);
  if(n == null || !(n > PK_EPS)){ toast('Броят трябва да е над 0', '#dc2626'); return Promise.resolve(false); }
  if(n > rest + PK_EPS){ toast('Над остатъка (' + pkFmtQty(rest) + ')', '#dc2626'); return Promise.resolve(false); }
  return pkTargetUnit(l.store_name).then(function(u){
    if(!u) return false;
    return pkAddToUnit(u, l, n).then(function(ok){
      pkEdit = null;
      pkRender();
      if(ok) toast('➕ ' + pkFmtQty(n) + ' в ' + pkUnitName(u));
      return ok;
    });
  });
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
  if(pkInUnits(l.id) > PK_EPS){ toast('Махни го от единиците първо', '#dc2626'); return Promise.resolve(false); }
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

/* ─── Единици (етап 2, част А) ─────────────────────────── */
function pkRound(x){ return Math.round(Number(x) * 1e6) / 1e6; }
function pkLineById(id){ return pkFind(id) || pkExtraLines[id] || null; }
/* Взето на реда: qty_picked, ако го има, иначе заявеното; невзет ред — 0. */
function pkTaken(l){
  if(!l || l.status !== 'picked') return 0;
  return Number(l.qty_picked != null ? l.qty_picked : l.qty_requested) || 0;
}
function pkItemsOfLine(lineId){ return pkItems.filter(function(it){ return it.line_id === lineId; }); }
function pkItemsOfUnit(pid){ return pkItems.filter(function(it){ return it.pallet_id === pid; }); }
function pkInUnits(lineId){
  var s = 0;
  pkItemsOfLine(lineId).forEach(function(it){ s += Number(it.qty) || 0; });
  return pkRound(s);
}
function pkRest(l){ return pkRound(pkTaken(l) - pkInUnits(l.id)); }
function pkPalletById(id){ return pkPallets.filter(function(p){ return p.id === id; })[0] || null; }
function pkUnitName(p){ var k = PK_KIND[p.kind] || PK_KIND.pallet; return k.icon + ' ' + k.label + ' №' + p.no; }
function pkUnitsOf(store){ return pkPallets.filter(function(p){ return p.store_name === store; }); }
function pkUnitSum(pid){
  var s = 0;
  pkItemsOfUnit(pid).forEach(function(it){ s += Number(it.qty) || 0; });
  return pkRound(s);
}
/* Текущата единица на обекта; ако няма избрана — последната отворена. */
function pkCurUnit(store){
  var p = pkPalletById(pkCurByStore[store]);
  if(p && p.store_name === store) return p;
  var open = pkUnitsOf(store).filter(function(x){ return x.status === 'open'; });
  p = open.length ? open[open.length - 1] : null;
  if(p) pkCurByStore[store] = p.id; else delete pkCurByStore[store];
  return p;
}
/* Къде отива взетото: текущата (ако е отворена) или нов палет. null = отказ. */
function pkTargetUnit(store){
  var cur = pkCurUnit(store);
  if(cur){
    if(cur.status !== 'open'){ toast('Текущата единица е затворена — отвори единица', '#dc2626'); return Promise.resolve(null); }
    return Promise.resolve(cur);
  }
  return pkCreateUnit(store, 'pallet').then(function(u){
    if(u) toast(PK_KIND.pallet.label + ' №' + u.no + ' е създаден');
    return u;
  });
}
function pkNextNo(store, kind, day){
  var wh = pkActiveWarehouse(), mx = 0;
  pkPallets.forEach(function(p){
    if(p.warehouse === wh && p.store_name === store && p.kind === kind && String(p.created_on) === day && Number(p.no) > mx) mx = Number(p.no);
  });
  return mx + 1;
}
function pkIsDupErr(res){ return !!res && (res.status === 409 || !!(res.error && res.error.code === '23505')); }
/* № = max+1 от заредените; сблъсък с друго устройство → един опит с +1. */
function pkCreateUnit(store, kind){
  var wh = pkActiveWarehouse();
  if(!wh || !store) return Promise.resolve(null);
  var day = today();
  var no = pkNextNo(store, kind, day);
  var post = function(n){
    return sbPostReturn('picking_pallets', { warehouse: wh, store_name: store, kind: kind, no: n, created_on: day, status: 'open', created_by: pkWho() });
  };
  return post(no).then(function(res){
    if(!res.ok && pkIsDupErr(res)) return post(no + 1);
    return res;
  }).then(function(res){
    if(!res.ok || !res.row){ toast('Единицата не е създадена: ' + sbErrMsg(res), '#dc2626'); return null; }
    pkPallets.push(res.row);
    pkCurByStore[store] = res.row.id;
    delete pkFinish[store];
    return res.row;
  });
}
/* Добавя n от реда l в единица u — към СБОРА, ако редът вече е там. */
function pkAddToUnit(u, l, n){
  var ex = pkItemsOfUnit(u.id).filter(function(it){ return it.line_id === l.id; })[0];
  delete pkFinish[l.store_name];
  if(ex){
    var q = pkRound(Number(ex.qty) + n);
    return sbPatch('picking_pallet_items', 'id=eq.' + encodeURIComponent(ex.id), { qty: q }).then(function(res){
      if(!res.ok){ toast('Не е записано в единицата: ' + sbErrMsg(res), '#dc2626'); return false; }
      ex.qty = q;
      return true;
    });
  }
  return sbPostReturn('picking_pallet_items', { pallet_id: u.id, line_id: l.id, qty: pkRound(n) }).then(function(res){
    if(!res.ok || !res.row){
      toast(pkIsDupErr(res) ? 'Редът вече е в единицата от друго устройство — обнови' : 'Не е записано в единицата: ' + sbErrMsg(res), '#dc2626');
      return false;
    }
    pkItems.push(res.row);
    return true;
  });
}
function pkSetCurrent(id){
  var p = pkPalletById(id);
  if(!p) return;
  pkCurByStore[p.store_name] = p.id;
  pkNewOpen = false;
  pkRender();
}
function pkToggleNew(){ pkNewOpen = !pkNewOpen; pkRender(); }
function pkNewUnit(kind){
  if(!PK_KIND[kind] || !pkCanSee()) return Promise.resolve(null);
  return pkCreateUnit(pkStore, kind).then(function(u){
    pkNewOpen = false;
    pkRender();
    if(u) toast(pkUnitName(u) + ' — текуща');
    return u;
  });
}
function pkPatchUnit(p, body, okMsg){
  return sbPatch('picking_pallets', 'id=eq.' + encodeURIComponent(p.id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(body).forEach(function(k){ p[k] = body[k]; });
    delete pkFinish[p.store_name];
    pkRender();
    toast(okMsg);
    return true;
  });
}
function pkCloseUnit(id){
  var p = pkPalletById(id);
  if(!p || !pkCanSee() || p.status !== 'open') return Promise.resolve(false);
  if(!pkItemsOfUnit(p.id).length){ toast('Празна единица — изтрий я', '#dc2626'); return Promise.resolve(false); }
  return pkPatchUnit(p, { status: 'closed', closed_by: pkWho(), closed_at: new Date().toISOString() }, '🔒 ' + pkUnitName(p) + ' — затворен');
}
function pkReopenUnit(id){
  var p = pkPalletById(id);
  if(!p || !pkCanSee() || p.status !== 'closed') return Promise.resolve(false);
  if(p.shipment_id){ toast('Единицата е изпратена — не се отваря', '#dc2626'); return Promise.resolve(false); }
  pkCurByStore[p.store_name] = p.id;
  return pkPatchUnit(p, { status: 'open', closed_by: null, closed_at: null }, '🔓 ' + pkUnitName(p) + ' — отворен');
}
/* 🗑 — само празна единица. Без confirm: няма какво да се загуби. */
function pkDeleteUnit(id){
  var p = pkPalletById(id);
  if(!p || !pkCanSee()) return Promise.resolve(false);
  if(pkItemsOfUnit(p.id).length){ toast('Единицата не е празна', '#dc2626'); return Promise.resolve(false); }
  if(p.shipment_id){ toast('Единицата е изпратена', '#dc2626'); return Promise.resolve(false); }
  return sbDelete('picking_pallets', 'id=eq.' + encodeURIComponent(p.id)).then(function(res){
    if(!res.ok){ toast('Не е изтрита: ' + sbErrMsg(res), '#dc2626'); return false; }
    pkPallets = pkPallets.filter(function(x){ return x.id !== p.id; });
    if(pkCurByStore[p.store_name] === p.id) delete pkCurByStore[p.store_name];
    delete pkFinish[p.store_name];
    pkRender();
    toast('Единицата е изтрита');
    return true;
  });
}
/* ✕ — маха частта на реда от единицата. Само от отворена, неизпратена единица. */
function pkRemoveItem(itemId){
  var it = pkItems.filter(function(x){ return x.id === itemId; })[0];
  if(!it || !pkCanSee()) return Promise.resolve(false);
  var p = pkPalletById(it.pallet_id);
  if(p && (p.status !== 'open' || p.shipment_id)){ toast('Отвори единицата първо', '#dc2626'); return Promise.resolve(false); }
  return sbDelete('picking_pallet_items', 'id=eq.' + encodeURIComponent(it.id)).then(function(res){
    if(!res.ok){ toast('Не е махнато: ' + sbErrMsg(res), '#dc2626'); return false; }
    pkItems = pkItems.filter(function(x){ return x.id !== it.id; });
    if(p) delete pkFinish[p.store_name];
    pkRender();
    toast('Махнато от единицата');
    return true;
  });
}
/* Какво пречи обектът да е „събран": неотметнати редове, остатък извън
   единица, отворени единици. Празен списък = събрано. */
function pkFinishIssues(store){
  var out = [];
  pkLines.forEach(function(l){
    if(l.store_name !== store) return;
    if(l.status === 'open') out.push('Неотметнат ред: ' + l.sap_code + ' · ' + (l.product_name || ''));
    else if(l.status === 'picked'){
      var r = pkRest(l);
      if(r > PK_EPS) out.push('Извън единица: ' + l.sap_code + ' · ' + (l.product_name || '') + ' — ' + pkFmtQty(r));
    }
  });
  pkUnitsOf(store).forEach(function(p){ if(p.status === 'open') out.push('Отворена единица: ' + pkUnitName(p)); });
  return out;
}
function pkStoreCollected(store){
  return pkLines.some(function(l){ return l.store_name === store; }) && !pkFinishIssues(store).length;
}
/* „✅ Приключи събирането" — без запис: само проверка и съобщение. */
function pkFinishCollect(){
  var store = pkStore;
  if(!store) return false;
  var issues = pkFinishIssues(store);
  pkFinish[store] = issues.length ? { issues: issues } : { ok: true };
  pkRender();
  if(issues.length) toast('Не е събрано — виж списъка', '#dc2626');
  return !issues.length;
}
function pkUnitsHtml(store){
  var units = pkUnitsOf(store), cur = pkCurUnit(store);
  var h = '<div class="card" id="pk-units" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"><b style="margin-right:4px;">Единици:</b>';
  units.forEach(function(p){
    var n = pkItemsOfUnit(p.id).length;
    h += '<button class="filter-btn pk-unit' + (cur && cur.id === p.id ? ' active' : '') + '" data-pk-unit="' + escAttr(p.id) + '"' +
      (cur && cur.id === p.id ? ' style="outline:2px solid #2563eb;"' : '') +
      ' onclick="pkSetCurrent(this.getAttribute(\'data-pk-unit\'))">' + esc(pkUnitName(p)) + ' · ' + n + (n === 1 ? ' ред' : ' реда') + ' · ' + esc(pkFmtQty(pkUnitSum(p.id)) || '0') +
      (p.status === 'closed' ? ' ✅' : '') + (p.shipment_id ? ' 🚚' : '') + '</button>';
  });
  if(!units.length) h += '<span style="color:#94a3b8;">няма — първото „✓ Взето" прави палет</span>';
  h += '<button id="pk-unit-new" class="btn btn-sm" onclick="pkToggleNew()">➕ Нова единица</button>';
  if(pkNewOpen){
    Object.keys(PK_KIND).forEach(function(k){
      h += '<button id="pk-new-' + k + '" class="btn btn-sm" onclick="pkNewUnit(\'' + k + '\')">' + PK_KIND[k].icon + ' ' + PK_KIND[k].label + '</button>';
    });
  }
  if(cur || units.length){
    var sel = cur || null;
    if(sel){
      var sid = escAttr(sel.id), empty = !pkItemsOfUnit(sel.id).length;
      h += '<span style="margin-left:8px;color:#475569;">Текуща: <b id="pk-cur-name">' + esc(pkUnitName(sel)) + '</b></span>';
      if(sel.status === 'open') h += '<button id="pk-unit-close" class="btn btn-sm" onclick="pkCloseUnit(\'' + sid + '\')">🔒 Затвори</button>';
      else if(!sel.shipment_id) h += '<button id="pk-unit-open" class="btn btn-sm" onclick="pkReopenUnit(\'' + sid + '\')">🔓 Отвори</button>';
      if(empty && !sel.shipment_id) h += '<button id="pk-unit-del" class="btn btn-sm" onclick="pkDeleteUnit(\'' + sid + '\')">🗑</button>';
      if(!empty) h += '<button id="pk-unit-opis" class="btn btn-sm" onclick="pkPrintUnit(\'' + sid + '\')">🖨 Опис</button>';
    }
  }
  h += '<span style="margin-left:auto;display:flex;gap:6px;">';
  h += '<button id="pk-finish" class="btn btn-sm btn-primary" onclick="pkFinishCollect()">✅ Приключи събирането</button>';
  if(units.some(function(p){ return p.status === 'closed'; })) h += '<button id="pk-labels" class="btn btn-sm" onclick="pkLabels()">🏷 Етикети</button>';
  h += '</span>';
  var f = pkFinish[store];
  if(f && f.issues){
    h += '<div id="pk-finish-issues" style="flex-basis:100%;border-left:4px solid #dc2626;padding:6px 10px;background:#fef2f2;"><b>Не е събрано:</b><ul style="margin:4px 0 0 18px;">' +
      f.issues.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
  } else if(f && f.ok){
    var lineIds = {};
    pkLines.forEach(function(l){ if(l.store_name === store && pkInUnits(l.id) > PK_EPS) lineIds[l.id] = 1; });
    h += '<div id="pk-finish-ok" style="flex-basis:100%;border-left:4px solid #16a34a;padding:6px 10px;background:#f0fdf4;">✅ Събрано: ' + units.length + (units.length === 1 ? ' единица' : ' единици') +
      ' · ' + Object.keys(lineIds).length + ' реда <button id="pk-finish-labels" class="btn btn-sm" onclick="pkLabels()">🏷 Етикети</button></div>';
  }
  return h + '</div>';
}

/* ─── Етикети и опис (етап 2, част А) ──────────────────── */
function pkUnitUrl(id){ return LL_PORTAL_URL + '#pk=' + encodeURIComponent(String(id)); }
function pkLabelCss(){
  return '@page{size:A4;margin:10mm;}' +
    '.pk-lbl-page{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:136mm;gap:4mm;page-break-after:always;break-after:page;}' +
    '.pk-lbl-page:last-child{page-break-after:auto;break-after:auto;}' +
    '.pk-lbl{box-sizing:border-box;border:1px dashed #94a3b8;padding:4mm;overflow:hidden;white-space:normal;}' +
    '.pk-lbl-wh{font-size:10pt;color:#333;}' +
    '.pk-lbl-store{font-size:26pt;font-weight:800;line-height:1.1;margin:1mm 0;}' +
    '.pk-lbl-unit{font-size:22pt;font-weight:800;line-height:1.1;}' +
    '.pk-lbl-date{font-size:10pt;margin-top:1mm;}' +
    '.pk-lbl-mid{display:flex;gap:4mm;align-items:flex-start;margin:3mm 0;}' +
    '.pk-lbl-box{box-sizing:border-box;width:30mm;height:30mm;border:2px solid #000;font-size:8pt;padding:1mm;color:#555;}' +
    '.pk-lbl-rows{font-size:8.5pt;line-height:1.35;}';
}
/* „🏷 Етикети" — само ЗАТВОРЕНИТЕ единици на обекта, 4 на A4. */
function pkLabels(){
  var units = pkUnitsOf(pkStore).filter(function(p){ return p.status === 'closed'; });
  if(!units.length){ toast('Няма затворени единици за етикети', '#d97706'); return Promise.resolve(0); }
  return llLoadQrLib().then(function(){
    var n = pkRenderLabels(units);
    showModule('print');
    return n;
  }).catch(function(e){
    toast('Етикетите не се получиха: ' + (e && e.message ? e.message : e), '#dc2626');
    return 0;
  });
}
function pkRenderLabels(units){
  var wrap = document.getElementById('mod-print');
  if(!wrap) return 0;
  var labels = units.map(function(p){
    var items = pkItemsOfUnit(p.id), url = pkUnitUrl(p.id), k = PK_KIND[p.kind] || PK_KIND.pallet;
    var rows = items.slice(0, 6).map(function(it){
      var l = pkLineById(it.line_id) || {};
      return '<div>' + pkE(l.sap_code) + ' · ' + pkE(l.product_name) + ' · <b>' + esc(pkFmtQty(it.qty)) + '</b></div>';
    }).join('') + (items.length > 6 ? '<div>… още ' + (items.length - 6) + '</div>' : '');
    return '<div class="pk-lbl" data-pk-label="' + escAttr(p.id) + '" data-pk-qr-text="' + escAttr(url) + '">' +
      '<div class="pk-lbl-wh">' + esc(p.warehouse) + ' →</div>' +
      '<div class="pk-lbl-store">' + esc(String(p.store_name).toUpperCase()) + '</div>' +
      '<div class="pk-lbl-unit">' + k.icon + ' ' + esc(k.label) + ' № ' + esc(String(p.no)) + '</div>' +
      '<div class="pk-lbl-date">' + esc(fmtDate(p.created_on)) + '</div>' +
      '<div class="pk-lbl-mid"><div class="pk-lbl-box">№ за маркер</div><div class="pk-lbl-qr">' + llQrSvg(url, 30) + '</div></div>' +
      '<div class="pk-lbl-rows">' + rows + '</div></div>';
  });
  var pages = [];
  for(var i = 0; i < labels.length; i += 4) pages.push('<div class="pk-lbl-page">' + labels.slice(i, i + 4).join('') + '</div>');
  wrap.innerHTML = '<style>' + pkLabelCss() + '</style>' +
    '<div style="max-width:820px;margin:0 auto;padding:16px 16px 40px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">' +
        '<div style="font-size:18px;font-weight:600;">🏷 Етикети · ' + esc(pkStore) + ' · ' + labels.length + (labels.length === 1 ? ' етикет' : ' етикета') + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
          '<button onclick="showModule(\'picking\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
        '</div>' +
      '</div>' +
      '<div id="pk-labels-wrap" data-pk-labels="1">' + pages.join('') + '</div>' +
    '</div>';
  return labels.length;
}
/* „🖨 Опис" — всички редове на единицата, A4. */
function pkPrintUnit(id){
  var p = pkPalletById(id);
  var wrap = document.getElementById('mod-print');
  if(!p || !wrap) return false;
  var items = pkItemsOfUnit(p.id);
  var body = items.map(function(it, i){
    var l = pkLineById(it.line_id) || {};
    return '<tr class="pk-opis-row" data-pk-line="' + escAttr(it.line_id) + '"><td>' + (i + 1) + '</td><td>' + pkE(l.sap_code) + '</td><td>' + pkE(l.product_name) + '</td>' +
      '<td>' + esc(pkFmtQty(it.qty)) + ' ' + pkE(l.unit) + '</td><td>' + (l.sap_order ? esc(l.sap_order) + ' / ' + pkE(l.sap_item) : '') + '</td>' +
      '<td>' + pkE(l.done_by || p.created_by) + '</td><td>' + esc(pkFmtTs(it.created_at)) + '</td></tr>';
  }).join('');
  wrap.innerHTML = '<style>' + pkPrintCss() + '</style>' +
    '<div style="max-width:820px;margin:0 auto;padding:16px 16px 40px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">' +
        '<div style="font-size:18px;font-weight:600;">🖨 Опис · ' + esc(pkUnitName(p)) + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>' +
          '<button onclick="showModule(\'picking\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
        '</div>' +
      '</div>' +
      '<div id="pk-opis" data-pk-opis="' + escAttr(p.id) + '">' +
        '<div style="font-size:16px;font-weight:700;">Опис — ' + esc(pkUnitName(p)) + ' · ' + esc(p.store_name) + '</div>' +
        '<div style="font-size:12px;color:#555;margin-bottom:6px;">' + esc(p.warehouse) + ' · ' + esc(fmtDate(p.created_on)) + ' · създал ' + pkE(p.created_by) +
          (p.status === 'closed' ? ' · затворен ' + esc(pkFmtTs(p.closed_at)) : ' · ОТВОРЕН') + '</div>' +
        '<table class="pk-tbl"><colgroup><col style="width:8mm;"><col style="width:20mm;"><col style="width:70mm;"><col style="width:16mm;"><col style="width:30mm;"><col style="width:26mm;"><col style="width:20mm;"></colgroup>' +
        '<tr><th>№</th><th>Код</th><th>Име</th><th>Брой</th><th>SAP заявка / поз.</th><th>Събрал</th><th>Дата</th></tr>' + body + '</table>' +
      '</div>' +
    '</div>';
  showModule('print');
  return true;
}

/* ─── Deep link #pk=<id> (етикетът на единица) ─────────── */
function pkParseDeep(text){
  var s = String(text == null ? '' : text), i = s.indexOf('#');
  if(i < 0) return null;
  var id = null;
  s.slice(i + 1).split('&').forEach(function(part){
    var k = part.indexOf('=');
    if(k < 0 || part.slice(0, k) !== 'pk') return;
    try { id = decodeURIComponent(part.slice(k + 1)); } catch(e){ id = null; }
  });
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
/* Вика се от startApp() (shared.js) след #tl= и #tf=. false = хешът не е наш.
   Достъпът се проверява в loadPicking — без него „Нямаш достъп", нищо не се чете. */
function pkDeepLinkBoot(hash){
  var id = pkParseDeep(hash === undefined ? (window.location.hash || '') : hash);
  if(!id) return false;
  if(typeof llClearUrlHash === 'function') llClearUrlHash();
  pkDeepLink = id;
  showModule('picking');
  return true;
}
/* Единицата → склад, обект, текуща. Складът с фиксиран склад не отваря чужда. */
function pkDeepLinkResolve(seq){
  var id = pkDeepLink;
  pkDeepLink = null;
  return sbGetOk('picking_pallets', 'select=id,warehouse,store_name,status,shipment_id&id=eq.' + encodeURIComponent(id)).then(function(r){
    if(seq !== pkLoadSeq) return;
    if(!r.ok || !r.rows.length){ toast('Единицата не е намерена', '#dc2626'); return; }
    var p = r.rows[0], fx = pkFixedWarehouse();
    if(fx && fx !== p.warehouse){ toast('Единицата е от ' + p.warehouse, '#dc2626'); return; }
    if(!fx && pkWarehouse !== p.warehouse){ pkWarehouse = p.warehouse; pkBatches = []; pkLines = []; }
    /* Част Б: затворена неизпратена единица + отворен транспорт за същия
       обект → „на камиона" (същото като отметката). Иначе — „Събиране". */
    var loadP = (p.status === 'closed' && !p.shipment_id)
      ? sbGetOk('picking_shipments', 'select=id&warehouse=eq.' + encodeURIComponent(p.warehouse) + '&store_name=eq.' + encodeURIComponent(p.store_name) +
          '&status=eq.loading&order=created_at.desc&limit=1')
      : Promise.resolve({ ok: true, rows: [] });
    return loadP.then(function(rs){
      if(seq !== pkLoadSeq) return;
      var s = rs.ok && rs.rows[0];
      if(s){
        pkSub = 'ship'; pkShipStore = p.store_name; pkShipOpenId = s.id; pkPendingLoad = { pid: p.id, sid: s.id };
        return;
      }
      pkSub = 'collect';
      pkStore = p.store_name;
      pkCurByStore[p.store_name] = p.id;
    });
  });
}
/* QR при обекта: единицата трябва да е за моя обект и вече изпратена. */
function pkDeepLinkResolveStore(seq){
  var id = pkDeepLink;
  pkDeepLink = null;
  return sbGetOk('picking_pallets', 'select=id,store_name,shipment_id&id=eq.' + encodeURIComponent(id)).then(function(r){
    if(seq !== pkLoadSeq) return;
    if(!r.ok || !r.rows.length){ toast('Единицата не е намерена', '#dc2626'); return; }
    var p = r.rows[0];
    if(p.store_name !== currentUser.store_name){ toast('Единицата е за ' + p.store_name + ', не за вашия обект', '#dc2626'); return; }
    if(!p.shipment_id){ toast('Единицата още не е изпратена', '#d97706'); return; }
    pkRecvHighlight = p.id;
  });
}

/* ─── Изпращане и приемане (етап 2, част Б) ────────────── */
/* Редовете на единиците и редовете за пикинг към тях. → {items, extra} | {error} */
function pkLoadDetails(pallets){
  if(!pallets.length) return Promise.resolve({ items: [], extra: {} });
  return pkGetIn('picking_pallet_items', 'pallet_id', pallets.map(function(p){ return p.id; }), PK_ITEM_COLS, 'created_at.asc,id.asc').then(function(items){
    if(items.partial) return { error: 'редовете на единиците не се заредиха изцяло' };
    var ids = [];
    items.forEach(function(it){ if(ids.indexOf(it.line_id) < 0) ids.push(it.line_id); });
    if(!ids.length) return { items: items, extra: {} };
    return pkGetIn('picking_lines', 'id', ids, PK_LINE_COLS, 'id.asc').then(function(ls){
      if(ls.partial) return { error: 'артикулите не се заредиха изцяло' };
      var extra = {};
      ls.forEach(function(l){ extra[l.id] = l; });
      return { items: items, extra: extra };
    });
  });
}
function pkSinceIso(){ return new Date(Date.now() - PK_DAYS * 86400000).toISOString(); }
/* Склад / ЦО: транспортите на склада (активните + от последните PK_DAYS
   дни), затворените неизпратени единици и единиците в тези транспорти. */
function pkLoadShip(seq){
  var wh = pkActiveWarehouse();
  if(!wh){ pkShipments = []; pkPallets = []; pkItems = []; pkRender(); return Promise.resolve(); }
  return sbGetOk('picking_shipments', 'select=*&warehouse=eq.' + encodeURIComponent(wh) +
    '&or=(status.in.(loading,departed,partial),created_at.gte.' + pkSinceIso() + ')&order=created_at.desc,id.asc').then(function(rs){
    if(seq !== pkLoadSeq) return;
    if(!rs.ok){ pkLoadErr = rs.error; pkRenderErr(); return; }
    var ships = rs.rows, ids = ships.map(function(s){ return s.id; });
    return Promise.all([
      sbGetAll('picking_pallets', 'select=*&warehouse=eq.' + encodeURIComponent(wh) + '&status=eq.closed&shipment_id=is.null&order=created_at.asc,id.asc'),
      ids.length ? pkGetIn('picking_pallets', 'shipment_id', ids, '*', 'created_at.asc,id.asc') : Promise.resolve([])
    ]).then(function(r2){
      if(seq !== pkLoadSeq) return;
      if(r2[0].partial || r2[1].partial){ pkLoadErr = 'единиците не се заредиха изцяло'; pkRenderErr(); return; }
      var pallets = r2[0].concat(r2[1]);
      return pkLoadDetails(pallets).then(function(d){
        if(seq !== pkLoadSeq) return;
        if(d.error){ pkLoadErr = d.error; pkRenderErr(); return; }
        pkLoadErr = '';
        pkShipments = ships; pkPallets = pallets; pkItems = d.items; pkExtraLines = d.extra;
        pkRender();
        if(pkPendingLoad) return pkApplyPendingLoad();
      });
    });
  });
}
/* Обект: транспортите към моя обект — тръгнали / с отклонения + приетите
   от последните PK_DAYS дни. */
function pkLoadReceive(seq){
  var store = currentUser.store_name;
  return sbGetOk('picking_shipments', 'select=*&store_name=eq.' + encodeURIComponent(store) +
    '&or=(status.in.(departed,partial),received_at.gte.' + pkSinceIso() + ')&order=departed_at.desc,id.asc').then(function(rs){
    if(seq !== pkLoadSeq) return;
    if(!rs.ok){ pkLoadErr = rs.error; pkRenderErr(); return; }
    var ships = rs.rows.filter(function(s){ return s.status !== 'loading'; }), ids = ships.map(function(s){ return s.id; });
    return (ids.length ? pkGetIn('picking_pallets', 'shipment_id', ids, '*', 'created_at.asc,id.asc') : Promise.resolve([])).then(function(pallets){
      if(seq !== pkLoadSeq) return;
      if(pallets.partial){ pkLoadErr = 'единиците не се заредиха изцяло'; pkRenderErr(); return; }
      return pkLoadDetails(pallets).then(function(d){
        if(seq !== pkLoadSeq) return;
        if(d.error){ pkLoadErr = d.error; pkRenderErr(); return; }
        pkLoadErr = '';
        pkShipments = ships; pkPallets = pallets; pkItems = d.items; pkExtraLines = d.extra;
        pkRender();
      });
    });
  });
}
function pkShipById(id){ return pkShipments.filter(function(s){ return s.id === id; })[0] || null; }
function pkUnitsOfShip(sid){ return pkPallets.filter(function(p){ return p.shipment_id === sid; }); }
function pkShipMatches(s, f){
  if(f === 'all') return true;
  if(f === 'active') return s.status === 'loading' || s.status === 'departed' || s.status === 'partial';
  return s.status === f;
}
function pkItemDiffers(it){ return it.qty_received != null && Math.abs(Number(it.qty_received) - Number(it.qty)) > PK_EPS; }

/* ── Склад / ЦО ── */
function pkRenderShip(){
  if(pkIsStoreSide()) return pkRenderReceive();
  var wh = pkActiveWarehouse();
  var h = '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(pkFixedWarehouse()) h += '<b id="pk-wh-fixed">' + esc(wh) + '</b>';
  else {
    h += '<select id="pk-wh" class="fi" onchange="pkSetWarehouse(this.value)" style="max-width:260px;display:inline-block;width:auto;"><option value="">-- Избери склад --</option>';
    LOGISTICS_WAREHOUSES.forEach(function(w){ h += '<option' + (w === wh ? ' selected' : '') + '>' + esc(w) + '</option>'; });
    h += '</select>';
  }
  h += '</div>';
  if(!wh) return h + '<div class="card" id="pk-need-wh" style="color:#64748b;">Избери склад, за да видиш транспортите.</div>';
  /* Обектите: със затворени неизпратени единици или с транспорт. */
  var free = {}, stores = [];
  var add = function(st){ if(st && stores.indexOf(st) < 0) stores.push(st); };
  pkPallets.forEach(function(p){ if(p.status === 'closed' && !p.shipment_id){ free[p.store_name] = (free[p.store_name] || 0) + 1; add(p.store_name); } });
  pkShipments.forEach(function(s){ add(s.store_name); });
  stores.sort(function(a, b){ return a.localeCompare(b, 'bg'); });
  if(!stores.length) return h + '<div class="card" id="pk-ship-empty" style="color:#64748b;">Няма затворени единици за изпращане и няма транспорти.</div>';
  if(!pkShipStore || stores.indexOf(pkShipStore) < 0) pkShipStore = stores[0];
  h += '<div class="card" id="pk-ship-chips" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
  stores.forEach(function(st){
    h += '<button class="filter-btn pk-ship-chip' + (st === pkShipStore ? ' active' : '') + '" data-pk-store="' + escAttr(st) + '" onclick="pkSetShipStore(this.getAttribute(\'data-pk-store\'))">' +
      esc(st) + ' · ' + (free[st] || 0) + ' за изпращане</button>';
  });
  h += '<button id="pk-ship-new" class="btn btn-sm btn-primary" style="margin-left:auto;" onclick="pkToggleShipNew()">➕ Нов транспорт · ' + esc(pkShipStore) + '</button>';
  if(pkShipNewOpen){
    h += '<div id="pk-ship-form" style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">' +
      '<input id="pk-sh-vehicle" class="fi" placeholder="Превозно средство" style="max-width:180px;">' +
      '<input id="pk-sh-driver" class="fi" placeholder="Шофьор" style="max-width:180px;">' +
      '<input id="pk-sh-note" class="fi" placeholder="Бележка" style="max-width:240px;">' +
      '<button id="pk-sh-create" class="btn btn-sm btn-primary" onclick="pkCreateShipment()">Създай</button>' +
      '<button class="btn btn-sm" onclick="pkToggleShipNew()">Отказ</button></div>';
  }
  h += '</div>';
  var cnt = {};
  Object.keys(PK_SHIP_FILTER).forEach(function(f){ cnt[f] = pkShipments.filter(function(s){ return pkShipMatches(s, f); }).length; });
  h += '<div class="card" style="display:flex;flex-wrap:wrap;gap:6px;">';
  Object.keys(PK_SHIP_FILTER).forEach(function(f){
    h += '<button id="pk-sf-' + f + '" class="filter-btn' + (pkShipFilter === f ? ' active' : '') + '" onclick="pkSetShipFilter(\'' + f + '\')">' + PK_SHIP_FILTER[f] + ' (' + cnt[f] + ')</button>';
  });
  h += '</div>';
  var list = pkShipments.filter(function(s){ return pkShipMatches(s, pkShipFilter); });
  if(!list.length) h += '<div class="card" id="pk-ship-none" style="color:#64748b;">Няма транспорти.</div>';
  else {
    h += '<div class="card" style="overflow-x:auto;"><table id="pk-ships"><tbody>';
    list.forEach(function(s){
      var n = pkUnitsOfShip(s.id).length;
      h += '<tr class="pk-ship-row" data-pk-ship="' + escAttr(s.id) + '"' + (s.id === pkShipOpenId ? ' style="background:#eff6ff;"' : '') + '>' +
        '<td><b>' + esc(s.store_name) + '</b></td><td>' + esc(PK_SHIP_LABEL[s.status] || s.status) + '</td><td>' + n + (n === 1 ? ' единица' : ' единици') + '</td>' +
        '<td>' + esc(pkFmtTs(s.departed_at || s.created_at)) + '</td><td>' + pkE(s.vehicle) + '</td>' +
        '<td>' + (s.notify_error ? '<span class="pk-notify-flag" title="' + escAttr(s.notify_error) + '">⚠ известието не тръгна</span>' : '') + (s.status === 'partial' ? ' ⚠️ отклонения' : '') + '</td>' +
        '<td><button class="btn btn-sm" onclick="pkOpenShipment(\'' + escAttr(s.id) + '\')">Отвори</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  var open = pkShipById(pkShipOpenId);
  if(open) h += pkShipCardHtml(open);
  return h;
}
function pkUnitLine(p){
  var n = pkItemsOfUnit(p.id).length;
  return esc(pkUnitName(p)) + ' · ' + n + (n === 1 ? ' ред' : ' реда') + ' · ' + esc(pkFmtQty(pkUnitSum(p.id)) || '0');
}
function pkShipCardHtml(s){
  var sid = escAttr(s.id);
  var h = '<div class="card" id="pk-ship-card" data-pk-ship="' + sid + '" style="border-left:4px solid #2563eb;">' +
    '<div style="font-weight:700;">🚚 ' + esc(s.warehouse) + ' → ' + esc(s.store_name) + ' · ' + esc(PK_SHIP_LABEL[s.status] || s.status) + '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:6px;">' + [s.vehicle, s.driver, s.note].filter(Boolean).map(esc).join(' · ') +
      (s.created_by ? ' · създал ' + esc(s.created_by) : '') + (s.departed_at ? ' · тръгнал ' + esc(pkFmtTs(s.departed_at)) + ' ' + pkE(s.departed_by) : '') + '</div>';
  if(s.status === 'loading'){
    var cand = pkPallets.filter(function(p){ return p.store_name === s.store_name && p.status === 'closed' && (!p.shipment_id || p.shipment_id === s.id); });
    if(!cand.length) h += '<div style="color:#64748b;">Няма затворени единици за ' + esc(s.store_name) + '.</div>';
    cand.forEach(function(p){
      var pid = escAttr(p.id);
      h += '<label class="pk-load" data-pk-unit="' + pid + '" style="display:block;padding:3px 0;"><input type="checkbox" id="pk-load-' + pid + '"' + (p.shipment_id === s.id ? ' checked' : '') +
        ' onchange="pkToggleLoad(\'' + pid + '\',this.checked,\'' + sid + '\')"> на камиона · ' + pkUnitLine(p) + '</label>';
    });
    var n = pkUnitsOfShip(s.id).length;
    h += '<div style="display:flex;gap:6px;margin-top:8px;"><button id="pk-depart" class="btn btn-sm btn-primary" onclick="pkDepart(\'' + sid + '\')">🚚 Тръгна (' + n + ')</button>' +
      '<button id="pk-ship-del" class="btn btn-sm" onclick="pkDeleteShipment(\'' + sid + '\')">🗑</button></div>';
  } else {
    pkUnitsOfShip(s.id).forEach(function(p){
      h += '<div class="pk-ship-unit" data-pk-unit="' + escAttr(p.id) + '" style="padding:3px 0;">' + pkUnitLine(p) + ' · ' +
        (p.received_status === 'received' ? '✓ получен' : p.received_status === 'missing' ? '⛔ липсва' : 'очаква приемане') + '</div>';
    });
    if(s.notify_error){
      h += '<div id="pk-notify-err" style="margin-top:6px;border-left:4px solid #dc2626;padding:6px 10px;background:#fef2f2;">⚠ Известието до обекта не тръгна: ' + esc(s.notify_error) +
        ' <button id="pk-renotify" class="btn btn-sm" onclick="pkRenotify(\'' + sid + '\')">🔁 Прати пак</button></div>';
    }
  }
  return h + pkDeviationsHtml(s) + '</div>';
}
/* „⚠️ Отклонения при приемане" — вижда се и на склада, и в ЦО, и при обекта. */
function pkDeviationsHtml(s){
  var rows = [];
  pkUnitsOfShip(s.id).forEach(function(p){
    if(p.received_status === 'missing') rows.push('Липсва ' + pkUnitName(p) + (p.receive_note ? ' — ' + p.receive_note : ''));
    pkItemsOfUnit(p.id).forEach(function(it){
      if(!pkItemDiffers(it)) return;
      var l = pkLineById(it.line_id) || {};
      rows.push(pkUnitName(p) + ' · ' + (l.sap_code || '') + ' ' + (l.product_name || '') + ': изпратено ' + pkFmtQty(it.qty) + ', получено ' + pkFmtQty(it.qty_received) +
        (it.receive_comment ? ' — ' + it.receive_comment : ''));
    });
  });
  if(!rows.length) return '';
  return '<div class="pk-deviations" id="pk-dev-' + escAttr(s.id) + '" style="margin-top:8px;border-left:4px solid #f59e0b;padding:6px 10px;background:#fffbeb;"><b>⚠️ Отклонения при приемане</b><ul style="margin:4px 0 0 18px;">' +
    rows.map(function(r){ return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
}
function pkSetShipStore(st){ pkShipStore = st; pkShipNewOpen = false; pkRender(); }
function pkSetShipFilter(f){ pkShipFilter = PK_SHIP_FILTER[f] ? f : 'active'; pkRender(); }
function pkToggleShipNew(){ pkShipNewOpen = !pkShipNewOpen; pkRender(); }
function pkOpenShipment(id){
  var s = pkShipById(id);
  if(!s) return;
  pkShipOpenId = s.id; pkShipStore = s.store_name;
  pkRender();
}
function pkCreateShipment(){
  if(!pkCanSee() || pkIsStoreSide()) return Promise.resolve(null);
  var wh = pkActiveWarehouse(), store = pkShipStore;
  if(!wh || !store) return Promise.resolve(null);
  var g = function(id){ var e = document.getElementById(id); return e ? (String(e.value || '').trim() || null) : null; };
  return sbPostReturn('picking_shipments', { warehouse: wh, store_name: store, status: 'loading', vehicle: g('pk-sh-vehicle'), driver: g('pk-sh-driver'), note: g('pk-sh-note'), created_by: pkWho() }).then(function(res){
    if(!res.ok || !res.row){ toast('Транспортът не е създаден: ' + sbErrMsg(res), '#dc2626'); return null; }
    pkShipments.unshift(res.row);
    pkShipOpenId = res.row.id; pkShipNewOpen = false;
    pkRender();
    toast('🚚 Нов транспорт към ' + store);
    return res.row;
  });
}
/* „на камиона" — отметка / махане (и QR на етикета при отворен транспорт). */
function pkToggleLoad(pid, on, sid){
  var p = pkPalletById(pid), s = pkShipById(sid);
  if(!p || !s || !pkCanSee() || pkIsStoreSide()) return Promise.resolve(false);
  if(s.status !== 'loading'){ toast('Транспортът вече е тръгнал', '#dc2626'); pkRender(); return Promise.resolve(false); }
  if(on && p.status !== 'closed'){ toast('Единицата не е затворена', '#dc2626'); pkRender(); return Promise.resolve(false); }
  if(on && p.shipment_id && p.shipment_id !== sid){ toast('Единицата е в друг транспорт', '#dc2626'); pkRender(); return Promise.resolve(false); }
  var body = on ? { shipment_id: sid, loaded_by: pkWho(), loaded_at: new Date().toISOString() } : { shipment_id: null, loaded_by: null, loaded_at: null };
  return sbPatch('picking_pallets', 'id=eq.' + encodeURIComponent(p.id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); pkRender(); return false; }
    Object.keys(body).forEach(function(k){ p[k] = body[k]; });
    pkRender();
    toast(pkUnitName(p) + (on ? ' — на камиона' : ' — свален от камиона'));
    return true;
  });
}
function pkApplyPendingLoad(){
  var pl = pkPendingLoad;
  pkPendingLoad = null;
  var p = pkPalletById(pl.pid), s = pkShipById(pl.sid);
  if(!p || !s){ toast('Единицата или транспортът не са намерени', '#dc2626'); return Promise.resolve(false); }
  if(p.shipment_id === s.id){ toast(pkUnitName(p) + ' — вече е на камиона', '#d97706'); return Promise.resolve(true); }
  return pkToggleLoad(p.id, true, s.id);
}
/* 🗑 — само транспорт, който още се товари; единиците му се освобождават. */
function pkDeleteShipment(sid){
  var s = pkShipById(sid);
  if(!s || !pkCanSee() || pkIsStoreSide()) return Promise.resolve(false);
  if(s.status !== 'loading'){ toast('Тръгнал транспорт не се трие', '#dc2626'); return Promise.resolve(false); }
  return sbPatch('picking_pallets', 'shipment_id=eq.' + encodeURIComponent(sid), { shipment_id: null, loaded_by: null, loaded_at: null }).then(function(r1){
    if(!r1.ok){ toast('Единиците не са освободени: ' + sbErrMsg(r1), '#dc2626'); return false; }
    return sbDelete('picking_shipments', 'id=eq.' + encodeURIComponent(sid)).then(function(res){
      if(!res.ok){ toast('Транспортът не е изтрит: ' + sbErrMsg(res), '#dc2626'); return false; }
      pkPallets.forEach(function(p){ if(p.shipment_id === sid){ p.shipment_id = null; p.loaded_by = null; p.loaded_at = null; } });
      pkShipments = pkShipments.filter(function(x){ return x.id !== sid; });
      if(pkShipOpenId === sid) pkShipOpenId = null;
      pkRender();
      toast('Транспортът е изтрит, единиците са свободни');
      return true;
    });
  });
}
/* „🚚 Тръгна" — статусът е departed ПРЕДИ известието; падне ли известието,
   статусът остава, а транспортът носи маркер и „🔁 Прати пак". */
function pkDepart(sid){
  var s = pkShipById(sid);
  if(!s || !pkCanSee() || pkIsStoreSide() || s.status !== 'loading') return Promise.resolve(false);
  var n = pkUnitsOfShip(s.id).length;
  if(!n){ toast('Няма единици на камиона', '#dc2626'); return Promise.resolve(false); }
  var body = { status: 'departed', departed_by: pkWho(), departed_at: new Date().toISOString() };
  return sbPatch('picking_shipments', 'id=eq.' + encodeURIComponent(s.id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(body).forEach(function(k){ s[k] = body[k]; });
    pkRender();
    return pkNotifyShipment(s);
  });
}
function pkRenotify(sid){
  var s = pkShipById(sid);
  if(!s || !pkCanSee() || s.status === 'loading') return Promise.resolve(false);
  return pkNotifyShipment(s);
}
function pkResMsg(r){ return (r && r.data && r.data.message) || ('HTTP ' + ((r && r.status) || '—')); }
/* Получателите в ПИЛОТА (решение на Тенчо 23.10, вариант б): активните
   акаунти на обекта, чийто имейл е в picking_users — само те виждат
   „Пристигащи" и могат да приемат. sbGetOk, не sbGet: паднала заявка трябва
   да се различава от „няма получател" (иначе срив изглежда като празен
   списък). → {ok, rows:[{email, tag}]} | {ok:false, error} */
function pkPilotRecipients(store){
  return sbGetOk('users', 'active=eq.true&select=email,display_name,store_name&store_name=eq.' + encodeURIComponent(store)).then(function(r){
    if(!r.ok) return { ok: false, error: r.error };
    var out = [], seen = {};
    r.rows.forEach(function(u){
      var em = String(u.email || '').trim().toLowerCase();
      if(!em || seen[em] || pkUsersOn.indexOf(em) < 0 || u.store_name !== store) return;
      seen[em] = 1;
      /* Тагът на устройството е display_name || email (initPush в push.js). */
      out.push({ email: u.email, tag: u.display_name || u.email });
    });
    return { ok: true, rows: out };
  });
}
/* Push САМО до устройствата на тези акаунти: (обект И име) ИЛИ … — osSend от
   push.js, само се вика. Тагът display_name не е уникален, затова винаги в
   двойка с тага store_name. */
function pkPushPilot(store, tags, title, msg){
  if(typeof osSend !== 'function') return Promise.resolve({ ok: false, status: 0, data: { message: 'push.js не е зареден' } });
  var filters = [];
  tags.forEach(function(t, i){
    if(i > 0) filters.push({ operator: 'OR' });
    filters.push({ field: 'tag', key: 'store_name', relation: '=', value: store });
    filters.push({ field: 'tag', key: 'display_name', relation: '=', value: t });
  });
  return osSend({ filters: filters, headings: { bg: title, en: title }, contents: { bg: msg, en: msg } });
}
/* Push + имейл до получателите в пилота. Без такива — жълто предупреждение,
   без маркер (нищо не е паднало). Резултатът се записва в транспорта. */
function pkNotifyShipment(s){
  var units = pkUnitsOfShip(s.id), n = units.length;
  var title = 'Пикинг: ' + n + (n === 1 ? ' единица тръгна към вас' : ' единици тръгнаха към вас');
  var msg = 'От ' + s.warehouse + (s.vehicle ? ' · ' + s.vehicle : '') + (s.driver ? ' · ' + s.driver : '');
  var subject = 'Пикинг — ' + s.warehouse + ' → ' + s.store_name + ', ' + n + (n === 1 ? ' единица' : ' единици');
  var fail = function(e){ return { ok: false, status: 0, data: { message: String((e && e.message) || e) } }; };
  var safe = function(fn){ try { return Promise.resolve(fn()).catch(fail); } catch(e){ return Promise.resolve(fail(e)); } };
  return pkPilotRecipients(s.store_name).then(function(rec){
    if(!rec.ok) return { errs: ['получатели: ' + rec.error] };
    if(!rec.rows.length) return { none: true, errs: [] };
    return Promise.all([
      safe(function(){ return pkPushPilot(s.store_name, rec.rows.map(function(x){ return x.tag; }), title, msg); }),
      safe(function(){ return llMailTo(rec.rows.map(function(x){ return x.email; }), subject, function(){ return pkShipEmailHtml(s, units); }); })
    ]).then(function(rs){
      var errs = [];
      if(!rs[0] || !rs[0].ok) errs.push('push: ' + pkResMsg(rs[0]));
      if(!rs[1] || !rs[1].ok) errs.push('имейл: ' + pkResMsg(rs[1]));
      return { errs: errs };
    });
  }).then(function(r){
    var errs = r.errs;
    var body = errs.length ? { notify_error: errs.join('; ') } : (r.none ? { notify_error: null } : { notify_error: null, notified_at: new Date().toISOString() });
    return sbPatch('picking_shipments', 'id=eq.' + encodeURIComponent(s.id), body).then(function(res){
      if(res.ok) Object.keys(body).forEach(function(k){ s[k] = body[k]; });
      else if(errs.length) s.notify_error = body.notify_error;
      pkRender();
      if(errs.length) toast('🚚 Тръгна, но известието НЕ тръгна (' + errs.join('; ') + ') — „🔁 Прати пак"', '#dc2626');
      else if(r.none) toast('🚚 Тръгна · ' + s.store_name + ': няма получател в пилота — нито push, нито имейл', '#d97706');
      else toast('🚚 Тръгна · ' + s.store_name + ' е известен');
      return !errs.length;
    });
  });
}
function pkShipEmailHtml(s, units){
  var TH = 'style="text-align:left;padding:5px 7px;font-size:11px;font-weight:700;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;"';
  var TD = 'style="padding:5px 7px;font-size:12px;border:1px solid #e2e8f0;vertical-align:top;"';
  var rows = units.map(function(p){
    var k = PK_KIND[p.kind] || PK_KIND.pallet, items = pkItemsOfUnit(p.id);
    var inner = items.map(function(it){
      var l = pkLineById(it.line_id) || {};
      return '<tr><td ' + TD + '>' + pkE(l.sap_code) + '</td><td ' + TD + '>' + pkE(l.product_name) + '</td><td ' + TD + '>' + esc(pkFmtQty(it.qty)) + ' ' + pkE(l.unit) + '</td></tr>';
    }).join('');
    return '<tr><td ' + TD + '><b>' + esc(k.label + ' №' + p.no) + '</b></td><td ' + TD + '>' + esc(k.label) + '</td><td ' + TD + '>' + esc(String(p.no)) + '</td><td ' + TD + '>' + items.length + '</td><td ' + TD + '>' + esc(pkFmtQty(pkUnitSum(p.id)) || '0') + '</td></tr>' +
      '<tr><td ' + TD + ' colspan="5"><table style="border-collapse:collapse;width:100%;" data-pk-mail-items="' + escAttr(p.id) + '"><tr><th ' + TH + '>Код</th><th ' + TH + '>Име</th><th ' + TH + '>Брой</th></tr>' + inner + '</table></td></tr>';
  }).join('');
  var body = '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">🚚 ' + esc(s.warehouse) + ' → ' + esc(s.store_name) + '</div>' +
    '<div style="font-size:12px;color:#475569;margin-bottom:10px;">' + units.length + (units.length === 1 ? ' единица' : ' единици') +
      (s.vehicle ? ' · ' + esc(s.vehicle) : '') + (s.driver ? ' · шофьор ' + esc(s.driver) : '') + (s.note ? ' · ' + esc(s.note) : '') +
      (s.departed_at ? ' · тръгнал ' + esc(pkFmtTs(s.departed_at)) : '') + '</div>' +
    '<table style="border-collapse:collapse;width:100%;"><tr><th ' + TH + '>Единица</th><th ' + TH + '>Вид</th><th ' + TH + '>№</th><th ' + TH + '>Редове</th><th ' + TH + '>Σ</th></tr>' + rows + '</table>' +
    '<p style="font-size:12px;margin-top:12px;">Приемане: портала → Транспорт → 📦 Пикинг → 🚚 Изпращане (или QR на етикета). <a href="' + LL_PORTAL_URL + '">' + LL_PORTAL_URL + '</a></p>';
  return emailWrap(body, 'Пикинг · ТеМАХ Вътрешна платформа');
}

/* ── Обект: „Пристигащи" ── */
function pkRenderReceive(){
  var store = currentUser.store_name;
  var h = '<div class="card"><b>Пристигащи — ' + esc(store) + '</b> <span style="color:#94a3b8;font-size:12px;">(тръгнали и с отклонения + приетите за последните ' + PK_DAYS + ' дни)</span></div>';
  if(!pkShipments.length) return h + '<div class="card" id="pk-recv-none" style="color:#64748b;">Няма пристигащи транспорти.</div>';
  pkShipments.forEach(function(s){ h += pkRecvCardHtml(s); });
  return h;
}
function pkRecvCardHtml(s){
  var sid = escAttr(s.id), live = s.status === 'departed';
  var h = '<div class="card pk-recv-card" data-pk-ship="' + sid + '" style="border-left:4px solid ' + (live ? '#2563eb' : '#94a3b8') + ';">' +
    '<div style="font-weight:700;">🚚 ' + esc(s.warehouse) + ' → ' + esc(s.store_name) + ' · ' + esc(PK_SHIP_LABEL[s.status] || s.status) + '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:6px;">' + (s.departed_at ? 'тръгнал ' + esc(pkFmtTs(s.departed_at)) : '') + [s.vehicle, s.driver, s.note].filter(Boolean).map(function(x){ return ' · ' + esc(x); }).join('') + '</div>';
  pkUnitsOfShip(s.id).forEach(function(p){
    var pid = escAttr(p.id), hl = pkRecvHighlight === p.id;
    h += '<div class="pk-recv-unit" data-pk-unit="' + pid + '" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;margin:6px 0;' + (hl ? 'outline:3px solid #2563eb;' : '') + '">';
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"><b>' + pkUnitLine(p) + '</b>';
    if(p.received_status === 'received') h += '<span class="pk-recv-badge" style="color:#166534;">✓ получен</span>';
    else if(p.received_status === 'missing') h += '<span class="pk-recv-badge" style="color:#b91c1c;">⛔ липсва — ' + pkE(p.receive_note) + '</span>';
    if(live && !p.received_status){
      if(pkEdit && pkEdit.id === p.id && pkEdit.mode === 'miss'){
        h += '<input id="pk-rcv-note-' + pid + '" placeholder="Какво липсва (задължително)" style="width:220px;"> <button id="pk-rcv-miss-save-' + pid + '" class="btn btn-sm btn-primary" onclick="pkRecvMiss(\'' + pid + '\')">Запиши</button> <button class="btn btn-sm" onclick="pkCancel()">Отказ</button>';
      } else {
        h += '<button id="pk-rcv-ok-' + pid + '" class="btn btn-sm btn-primary" onclick="pkRecvOk(\'' + pid + '\')">✓ Получен</button>' +
          '<button id="pk-rcv-miss-' + pid + '" class="btn btn-sm" onclick="pkStartEdit(\'' + pid + '\',\'miss\')">⛔ Липсва</button>';
      }
    } else if(live){
      h += '<button id="pk-rcv-reset-' + pid + '" class="btn btn-sm" onclick="pkRecvReset(\'' + pid + '\')">↩ Промени</button>';
    }
    h += '</div><table style="margin-top:4px;"><tbody>';
    pkItemsOfUnit(p.id).forEach(function(it){
      var l = pkLineById(it.line_id) || {}, iid = escAttr(it.id);
      var editable = live && !p.received_status;
      var got = it.qty_received != null ? it.qty_received : it.qty;
      h += '<tr class="pk-recv-item" data-pk-item="' + iid + '"><td>' + pkE(l.sap_code) + '</td><td>' + pkE(l.product_name) + '</td><td style="text-align:right;">' + esc(pkFmtQty(it.qty)) + ' ' + pkE(l.unit) + '</td>';
      if(editable){
        h += '<td>получено <input id="pk-rcv-qty-' + iid + '" type="number" step="any" value="' + escAttrVal(String(got)) + '" style="width:70px;"></td>' +
          '<td><input id="pk-rcv-cmt-' + iid + '" placeholder="коментар при различно" value="' + escAttrVal(it.receive_comment) + '" style="width:180px;"></td>';
      } else {
        h += '<td>' + (pkItemDiffers(it) ? '⚠ получено ' + esc(pkFmtQty(it.qty_received)) + (it.receive_comment ? ' — ' + esc(it.receive_comment) : '') : '') + '</td><td></td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });
  if(live) h += '<button id="pk-rcv-finish-' + sid + '" class="btn btn-sm btn-primary" onclick="pkRecvFinish(\'' + sid + '\')">Приключи приемането</button>';
  return h + pkDeviationsHtml(s) + '</div>';
}
function pkRecvCanEdit(p){
  var s = p && pkShipById(p.shipment_id);
  return !!s && pkCanSee() && pkIsStoreSide() && s.store_name === currentUser.store_name && s.status === 'departed';
}
/* „✓ Получен" — записва и артикулите вътре: различно получено → qty_received
   + задължителен коментар; равно → NULL. Липсва коментар → нищо не се пише. */
function pkRecvOk(pid){
  var p = pkPalletById(pid);
  if(!pkRecvCanEdit(p)) return Promise.resolve(false);
  var plan = [];
  var items = pkItemsOfUnit(p.id);
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    var qi = document.getElementById('pk-rcv-qty-' + it.id), ci = document.getElementById('pk-rcv-cmt-' + it.id);
    var n = pkNum(qi ? qi.value : String(it.qty)), c = String(ci ? ci.value : '').trim();
    if(n == null || n < 0){ toast('Невалиден брой при ' + ((pkLineById(it.line_id) || {}).sap_code || 'артикул'), '#dc2626'); return Promise.resolve(false); }
    var diff = Math.abs(n - Number(it.qty)) > PK_EPS;
    if(diff && !c){ toast('Различен брой при ' + ((pkLineById(it.line_id) || {}).sap_code || 'артикул') + ' — напиши коментар', '#dc2626'); return Promise.resolve(false); }
    var want = diff ? { qty_received: n, receive_comment: c } : { qty_received: null, receive_comment: null };
    if(want.qty_received !== (it.qty_received == null ? null : Number(it.qty_received)) || want.receive_comment !== (it.receive_comment || null)) plan.push({ it: it, body: want });
  }
  var chain = Promise.resolve(true);
  plan.forEach(function(x){
    chain = chain.then(function(okSoFar){
      if(!okSoFar) return false;
      return sbPatch('picking_pallet_items', 'id=eq.' + encodeURIComponent(x.it.id), x.body).then(function(res){
        if(!res.ok){ toast('Артикулът не е записан: ' + sbErrMsg(res), '#dc2626'); return false; }
        Object.keys(x.body).forEach(function(k){ x.it[k] = x.body[k]; });
        return true;
      });
    });
  });
  return chain.then(function(okAll){
    if(!okAll){ pkRender(); return false; }
    return pkPatchRecv(p, { received_status: 'received', received_by: pkWho(), received_at: new Date().toISOString(), receive_note: null }, '✓ ' + pkUnitName(p) + ' — получен');
  });
}
function pkRecvMiss(pid){
  var p = pkPalletById(pid);
  if(!pkRecvCanEdit(p)) return Promise.resolve(false);
  var inp = document.getElementById('pk-rcv-note-' + p.id);
  var c = String(inp ? inp.value : '').trim();
  if(!c){ toast('Напиши какво липсва', '#dc2626'); return Promise.resolve(false); }
  return pkPatchRecv(p, { received_status: 'missing', receive_note: c, received_by: pkWho(), received_at: new Date().toISOString() }, '⛔ ' + pkUnitName(p) + ' — липсва');
}
function pkRecvReset(pid){
  var p = pkPalletById(pid);
  if(!pkRecvCanEdit(p)) return Promise.resolve(false);
  return pkPatchRecv(p, { received_status: null, receive_note: null, received_by: null, received_at: null }, '↩ ' + pkUnitName(p));
}
function pkPatchRecv(p, body, okMsg){
  return sbPatch('picking_pallets', 'id=eq.' + encodeURIComponent(p.id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(body).forEach(function(k){ p[k] = body[k]; });
    pkEdit = null;
    pkRender();
    toast(okMsg);
    return true;
  });
}
/* „Приключи приемането" — всяка единица с отметка; received само ако всички
   са получени и няма артикул с различно получено; иначе partial. */
function pkRecvFinish(sid){
  var s = pkShipById(sid);
  if(!s || !pkCanSee() || !pkIsStoreSide() || s.store_name !== currentUser.store_name || s.status !== 'departed') return Promise.resolve(false);
  var units = pkUnitsOfShip(s.id);
  var left = units.filter(function(p){ return !p.received_status; });
  if(left.length){ toast('Без отметка: ' + left.map(pkUnitName).join(', '), '#dc2626'); return Promise.resolve(false); }
  var clean = units.every(function(p){ return p.received_status === 'received'; }) &&
    !units.some(function(p){ return pkItemsOfUnit(p.id).some(pkItemDiffers); });
  var body = { status: clean ? 'received' : 'partial', received_by: pkWho(), received_at: new Date().toISOString() };
  return sbPatch('picking_shipments', 'id=eq.' + encodeURIComponent(s.id), body).then(function(res){
    if(!res.ok){ toast('Не е записано: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(body).forEach(function(k){ s[k] = body[k]; });
    pkRender();
    toast(clean ? '✅ Приемането е приключено' : '⚠️ Прието с отклонения — складът ги вижда', clean ? '#16a34a' : '#d97706');
    return true;
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
