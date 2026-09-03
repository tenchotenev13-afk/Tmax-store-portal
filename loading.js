/* loading.js — Транспорт > Товарни листи (СКЛАДОВА СТРАНА)

   Логистичният склад описва какво товари за кой обект: палет, руло или
   насипна стока, срещу коя покупка и коя стокова разписка изчиства.
   Досега това вървеше на хартия и по телефона — обектът разбираше какво е
   тръгнало към него чак когато камионът дойде.

   Схемата (loading_lists + loading_list_items) е в loading-lists-schema.sql.
   ТУК е само складовата страна. Магазинската (отмятане на получено) е
   следваща стъпка — затова обектът вижда само „Няма товари за …", а подтабът
   НЕ се крие: скрит таб не подсказва, че нещо предстои.

   Всички глобални имена са с префикс ll* / LL_*.

   ЗАВИСИМОСТИ ОТ ДРУГИ ФАЙЛОВЕ (редът в index.html ги гарантира):
     shared.js            - sbGet/sbPost/sbPostReturn/sbPatch/sbDelete, esc,
                            escVal, toast, fmtDate, LOGISTICS_WAREHOUSES,
                            loadReportableStores, isReportableStore
     bulletin.js          - toLocalISO()
     stock-differences.js - isLogisticsWarehouseUser()
   Трите стоят ПРЕДИ loading.js (позиции 1, 6 и 19 срещу 21). Тестът ги
   зарежда явно по същата причина. */

var llLists = [];          /* заглавията на листите (loading_lists) */
var llItems = [];          /* редовете на ОТВОРЕНИЯ лист (loading_list_items) */
var llView = 'list';       /* 'list' | 'edit' | 'view' */
var llCurrentId = null;    /* отвореният/редактираният лист */
var llStatusFilter = 'open';
var llWarehouse = '';      /* избраният склад — за admin/logistics */
var llDraft = null;        /* {list_date, executed_by, comment, items:[…]} */
var llPendingDocs = [];    /* чакащите стокови документи, вече групирани */
var llStores = [];         /* обектите от users (isReportableStore) */
/* Листи, чието заглавие е записано, но редовете НЕ са. Живее само в тази
   сесия на браузъра — колона за това няма и няма да се добавя заради един
   преходен случай. Смисълът е човекът да ВИДИ, че записът е половинчат, а не
   да го научи, като преброи редовете. */
var llIncompleteSaves = {};

var LL_KINDS = [
  ['pallet', '📦 Палет'],
  ['roll',   '🧻 Рула'],
  ['bulk',   '🧱 Насип']
];
/* [ключ, етикет, цвят, фон] — един източник за чиповете, баджовете и
   филтъра. Нов статус се добавя тук, не на четири места. */
var LL_STATUSES = [
  ['draft', '📝 Чернова',   '#92400e', '#fffbeb'],
  ['sent',  '📤 Изпратен',  '#1e40af', '#eff6ff'],
  ['done',  '✅ Приключен', '#16a34a', '#f0fdf4']
];

/* ─── ПРАВА И КОНТЕКСТ ──────────────────────────────────────── */
/* Складът пише по СВОИТЕ листи; admin/logistics — по кой да е, но избират
   склада явно. Всеки друг е само читател. */
function llCanEdit(){
  if(!currentUser) return false;
  return isLogisticsWarehouseUser() ||
    ['admin','logistics'].indexOf(currentUser.role) >= 0;
}
/* Кой склад гледаме. За складовия потребител това е неговият собствен и НЕ
   се избира — иначе би могъл да пише в чужд лист. */
function llActiveWarehouse(){
  if(isLogisticsWarehouseUser()) return currentUser.store_name;
  return llWarehouse || '';
}
function llActor(){ return currentUser ? (currentUser.display_name || currentUser.email) : ''; }
/* НЕ today() от shared.js: то е new Date().toISOString().slice(0,10), тоест
   UTC. В ранните часове по българско време (UTC+2/+3) UTC още е вчера и
   новият товарен лист би тръгвал с вчерашна дата. Същата причина, поради
   която Бюлетинът ползва toLocalISO (виж bulTodayISO там). */
function llTodayISO(){ return toLocalISO(new Date()); }

function llKindLabel(it){
  if(it.kind === 'pallet'){
    return (it.pallet_no && it.pallet_total)
      ? 'палет ' + it.pallet_no + ' от ' + it.pallet_total
      : 'палет';
  }
  if(it.kind === 'roll') return 'рула';
  if(it.kind === 'bulk') return 'насип';
  return it.kind || '—';
}
function llStatusMeta(key){
  var f = LL_STATUSES.find(function(s){ return s[0] === key; });
  return f || [key, key, '#64748b', '#f1f5f9'];
}
function llStatusBadge(key){
  var m = llStatusMeta(key);
  return '<span style="background:'+m[3]+';color:'+m[2]+';padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">'+esc(m[1])+'</span>';
}

/* ─── ГРУПИРАНЕ НА ЧАКАЩИТЕ СТОКОВИ ДОКУМЕНТИ ───────────────
   goods_transit държи по ЕДИН РЕД НА АРТИКУЛ. Един документ с 28 позиции е
   28 реда там, а на товарния лист е ЕДИН избираем документ. Без групиране
   складът щеше да вижда списък от стотици редове и да отмята един и същи
   документ по 28 пъти.

   Ключът е документ + обект, не само документът. На практика един документ
   отива до един обект и разликата не се вижда; попадне ли обаче същият номер
   при два обекта, групиране само по номер би приписало целия документ на
   обекта, чийто ред е дошъл пръв — тихо и без следа. */
/* Ключът на един документ. ЕДНО определение, ползвано и при групирането, и
   при материализирането/махането на редовете: разминат ли се двете, отмятането
   на документ би добавяло редове, които отмятането обратно не намира.
   JSON масив, а не слепени низове с разделител — всеки разделител може да се
   окаже и в самия номер на документа, а сгрешено групиране не гърми: просто
   слива два документа в един ред. */
function llDocKey(d){
  return JSON.stringify([String(d.purchase_doc), String(d.store_name || '')]);
}
function llGroupTransitDocs(rows){
  var byKey = {}, out = [];
  (Array.isArray(rows) ? rows : []).forEach(function(r){
    if(!r || !r.purchase_doc) return;
    var key = llDocKey(r);
    if(!byKey[key]){
      byKey[key] = {
        purchase_doc: r.purchase_doc,
        store_name: r.store_name || '',
        doc_date: r.doc_date || null,
        items: 0,
        checked: false,
        pallets: 1
      };
      out.push(byKey[key]);
    }
    byKey[key].items++;
    /* Най-ранната дата на документа — редовете му може да са въведени на
       части, а документът е един. */
    if(r.doc_date && (!byKey[key].doc_date || r.doc_date < byKey[key].doc_date)){
      byKey[key].doc_date = r.doc_date;
    }
  });
  return out;
}

/* ─── ОБОБЩЕНИЯ (СМЯТАТ СЕ ОТ РЕДОВЕТЕ, НЕ СЕ ПАЗЯТ) ────────
   Броят палети/рула/насип НЕ е колона в заглавието нарочно: копие там се
   разминава при първата редакция на ред и не гърми — просто показва грешно
   число, докато някой не го забележи. */
function llCounts(items){
  var c = { pallet:0, roll:0, bulk:0, stores:0, received:0, total:0 };
  var seen = {};
  (items || []).forEach(function(it){
    if(c.hasOwnProperty(it.kind)) c[it.kind]++;
    c.total++;
    if(it.received) c.received++;
    if(it.store_name && !seen[it.store_name]){ seen[it.store_name] = 1; c.stores++; }
  });
  return c;
}
/* Обобщение по ОБЕКТ — това гледа шофьорът, преди да тръгне. */
function llSummaryByStore(items){
  var by = {}, order = [];
  (items || []).forEach(function(it){
    var s = it.store_name || '—';
    if(!by[s]){ by[s] = { store:s, pallet:0, roll:0, bulk:0, received:0, total:0 }; order.push(s); }
    if(by[s].hasOwnProperty(it.kind)) by[s][it.kind]++;
    by[s].total++;
    if(it.received) by[s].received++;
  });
  order.sort();
  return order.map(function(s){ return by[s]; });
}

/* ─── ЗАРЕЖДАНЕ ─────────────────────────────────────────────── */
function loadLoadingLists(){
  var wrap = document.getElementById('mod-loading');
  if(!wrap) return;
  if(!wrap.innerHTML.trim()){
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">⏳ Зареждане...</div>';
  }
  /* Магазинската страна е следваща стъпка — дотогава обектът вижда явно, че
     тук още няма нищо за него, вместо празен екран без обяснение. */
  if(!llCanEdit()){
    llView = 'list';
    renderLoadingLists();
    return;
  }
  var wh = llActiveWarehouse();
  if(!wh){ llView = 'list'; renderLoadingLists(); return; }
  sbGet('loading_lists','warehouse=eq.'+encodeURIComponent(wh)+'&order=list_date.desc,created_at.desc')
    .then(function(rows){
      llLists = Array.isArray(rows) ? rows : [];
      var ids = llLists.map(function(l){ return l.id; });
      if(!ids.length){ llItems = []; renderLoadingLists(); return; }
      /* Редовете на ВСИЧКИ листи наведнъж — броячите в списъка се смятат от
         тях, а втора заявка на всеки клик би била по-бавна от една обща. */
      return sbGet('loading_list_items','list_id=in.('+ids.join(',')+')&order=position.asc')
        .then(function(items){
          llItems = Array.isArray(items) ? items : [];
          renderLoadingLists();
        });
    });
}
function llItemsOf(listId){
  return llItems.filter(function(i){ return String(i.list_id) === String(listId); });
}

/* ─── РЕНДЕР: ДИСПЕЧЕР ──────────────────────────────────────── */
function renderLoadingLists(){
  var wrap = document.getElementById('mod-loading');
  if(!wrap) return;
  var h;
  if(!llCanEdit())          h = llNoAccessHtml();
  else if(llView === 'edit') h = llEditorHtml();
  else if(llView === 'view') h = llViewHtml();
  else                       h = llListHtml();
  wrap.innerHTML = h;
}
function llNoAccessHtml(){
  var store = (currentUser && currentUser.store_name) || 'вашия обект';
  return '<div class="pg-title">🚛 Товарни листи</div>'+
    '<div class="pg-sub">Какво е натоварено от логистичния склад към обекта.</div>'+
    '<div style="text-align:center;padding:50px 20px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">'+
      '<div style="font-size:40px;">🚛</div>'+
      '<div style="margin-top:8px;font-size:14px;">Няма товари за '+esc(store)+'.</div>'+
      '<div style="margin-top:6px;font-size:12px;">Отмятането на получените палети предстои в следваща стъпка.</div>'+
    '</div>';
}

/* ─── ИЗБОР НА СКЛАД (само за admin/logistics) ──────────────── */
function llWarehouseSelectHtml(){
  if(isLogisticsWarehouseUser()) return '';
  return '<select id="ll-wh" class="fi" onchange="llSetWarehouse(this.value)" style="max-width:260px;display:inline-block;width:auto;">'+
    '<option value="">-- Избери склад --</option>'+
    LOGISTICS_WAREHOUSES.map(function(w){
      return '<option'+(w===llWarehouse?' selected':'')+'>'+esc(w)+'</option>';
    }).join('')+'</select>';
}
function llSetWarehouse(v){
  llWarehouse = v || '';
  llLists = []; llItems = [];
  loadLoadingLists();
}

/* ─── СПИСЪК НА ЛИСТИТЕ ─────────────────────────────────────── */
function llSetStatusFilter(f){ llStatusFilter = f; renderLoadingLists(); }
function llVisibleLists(){
  return llLists.filter(function(l){
    if(llStatusFilter === 'all') return true;
    /* По подразбиране „Чернови + Изпратени": приключените са история и само
       биха удължавали списъка на човека, който товари днес. */
    if(llStatusFilter === 'open') return l.status === 'draft' || l.status === 'sent';
    return l.status === llStatusFilter;
  });
}
function llListHtml(){
  var wh = llActiveWarehouse();
  var h = '<div class="pg-title">🚛 Товарни листи</div>'+
    '<div class="pg-sub">Какво е натоварено от склада към обектите.</div>';

  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">';
  h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+llWarehouseSelectHtml()+
       (wh?'<span style="font-size:13px;font-weight:600;">🏭 '+esc(wh)+'</span>':'')+'</div>';
  if(wh){
    h += '<button onclick="llNewList()" style="border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">➕ Нов товарен лист</button>';
  }
  h += '</div>';

  if(!wh){
    return h + '<div style="text-align:center;padding:50px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">Избери склад, за да видиш товарните листи.</div>';
  }

  var counts = { open:0, draft:0, sent:0, done:0, all:llLists.length };
  llLists.forEach(function(l){
    if(counts.hasOwnProperty(l.status)) counts[l.status]++;
    if(l.status === 'draft' || l.status === 'sent') counts.open++;
  });
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  [['open','Текущи ('+counts.open+')'],
   ['draft','📝 Чернови ('+counts.draft+')'],
   ['sent','📤 Изпратени ('+counts.sent+')'],
   ['done','✅ Приключени ('+counts.done+')'],
   ['all','Всички ('+counts.all+')']].forEach(function(f){
    var a = llStatusFilter === f[0];
    h += '<button data-f="'+f[0]+'" onclick="llSetStatusFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  var list = llVisibleLists();
  if(!list.length){
    return h + '<div style="text-align:center;padding:50px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:40px;">🚛</div><div style="margin-top:8px;">Няма товарни листи в този изглед.</div></div>';
  }
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:760px;"><thead><tr style="background:#f8fafc;">';
  ['Дата','Статус','Обекти','Палети','Рула','Насип','Изпълнил',''].forEach(function(c){
    h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
  });
  h += '</tr></thead><tbody>';
  list.forEach(function(l){
    var c = llCounts(llItemsOf(l.id));
    h += '<tr style="border-bottom:1px solid #f1f5f9;">'+
      '<td style="padding:7px 10px;font-weight:600;white-space:nowrap;">'+fmtDate(l.list_date)+'</td>'+
      '<td style="padding:7px 10px;white-space:nowrap;">'+llStatusBadge(l.status)+
        (llIncompleteSaves[l.id]?' <span title="Заглавието е записано, но редовете НЕ са. Отвори листа и запиши пак." style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">⚠️ непълен запис</span>':'')+'</td>'+
      '<td style="padding:7px 10px;text-align:center;">'+c.stores+'</td>'+
      '<td style="padding:7px 10px;text-align:center;">'+c.pallet+'</td>'+
      '<td style="padding:7px 10px;text-align:center;">'+c.roll+'</td>'+
      '<td style="padding:7px 10px;text-align:center;">'+c.bulk+'</td>'+
      '<td style="padding:7px 10px;color:#64748b;">'+esc(l.executed_by||'—')+'</td>'+
      '<td style="padding:7px 10px;white-space:nowrap;">'+
        '<button data-id="'+l.id+'" onclick="llOpenView(this.dataset.id)" style="border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;margin-right:3px;">👁 Преглед</button>'+
        (l.status==='draft'?'<button data-id="'+l.id+'" onclick="llOpenEdit(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;">✏️ Редакция</button>':'')+
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

/* ─── СЪЗДАВАНЕ / РЕДАКЦИЯ ──────────────────────────────────── */
function llNewList(){
  llCurrentId = null;
  llDraft = { list_date: llTodayISO(), executed_by: llActor(), comment: '', items: [] };
  llPendingDocs = [];
  llView = 'edit';
  renderLoadingLists();
  llLoadEditorData();
}
function llOpenEdit(id){
  var l = llLists.find(function(x){ return String(x.id) === String(id); });
  if(!l) return;
  if(l.status !== 'draft'){ toast('Само чернова се редактира','#d97706'); return; }
  llCurrentId = l.id;
  llDraft = {
    list_date: l.list_date, executed_by: l.executed_by || '',
    comment: l.comment || '',
    items: llItemsOf(l.id).map(function(it){
      return {
        id: it.id, kind: it.kind, pallet_no: it.pallet_no, pallet_total: it.pallet_total,
        purchase_doc: it.purchase_doc, clears_doc: it.clears_doc,
        store_name: it.store_name, warehouse_comment: it.warehouse_comment || ''
      };
    })
  };
  llPendingDocs = [];
  llView = 'edit';
  renderLoadingLists();
  llLoadEditorData();
}
function llBackToList(){
  llView = 'list'; llCurrentId = null; llDraft = null; llPendingDocs = [];
  loadLoadingLists();
}
/* Двете неща, които редакторът иска от сървъра: чакащите стокови документи
   на ТОЗИ склад и списъкът обекти. Обектите идват от users през
   isReportableStore, НЕ от stores — stores държи и ЦО, самите складове и
   обекти без нито един акаунт. */
function llLoadEditorData(){
  var wh = llActiveWarehouse();
  Promise.all([
    sbGet('goods_transit','supplier=eq.'+encodeURIComponent(wh)+'&status=eq.pending&select=purchase_doc,store_name,doc_date&order=doc_date.desc'),
    loadReportableStores()
  ]).then(function(res){
    llPendingDocs = llGroupTransitDocs(res[0]);
    llStores = Array.isArray(res[1]) ? res[1] : [];
    if(llView === 'edit') renderLoadingLists();
  });
}

/* Отмятането на документ МАТЕРИАЛИЗИРА редовете веднага, а не при запис.
   Така подредбата, стрелките и полето „изчиства друг документ" работят върху
   един и същи списък — иначе половината редове биха съществували само като
   намерение и не биха се виждали, докато не се запишат. */
function llToggleDoc(idx){
  var d = llPendingDocs[idx];
  if(!d || !llDraft) return;
  d.checked = !d.checked;
  if(d.checked) llMaterializeDoc(d);
  else llDropDocRows(d);
  renderLoadingLists();
}
function llSetDocPallets(idx, val){
  var d = llPendingDocs[idx];
  if(!d || !llDraft) return;
  var n = parseInt(val, 10);
  d.pallets = (isNaN(n) || n < 1) ? 1 : n;
  if(d.checked){ llDropDocRows(d); llMaterializeDoc(d); }
  renderLoadingLists();
}
function llMaterializeDoc(d){
  var n = d.pallets < 1 ? 1 : d.pallets;
  for(var i = 1; i <= n; i++){
    llDraft.items.push({
      id: null, kind: 'pallet', pallet_no: i, pallet_total: n,
      purchase_doc: d.purchase_doc, clears_doc: null,
      store_name: d.store_name, warehouse_comment: '',
      _docKey: llDocKey(d)
    });
  }
}
function llDropDocRows(d){
  var key = llDocKey(d);
  var keep = [];
  llDraft.items.forEach(function(it){
    if(it._docKey === key){
      /* Вече записан ред трябва да си отиде и от базата — черновата се
         редактира свободно, но записът трябва да следва екрана. */
      if(it.id) sbDelete('loading_list_items','id=eq.'+it.id);
      return;
    }
    keep.push(it);
  });
  llDraft.items = keep;
}
function llAddFreeRow(){
  if(!llDraft) return;
  llDraft.items.push({
    id: null, kind: 'pallet', pallet_no: null, pallet_total: null,
    purchase_doc: null, clears_doc: null,
    store_name: (llStores[0] || ''), warehouse_comment: '', _docKey: null
  });
  renderLoadingLists();
}
function llRemoveRow(i){
  if(!llDraft) return;
  var it = llDraft.items[i];
  if(!it) return;
  if(it.id) sbDelete('loading_list_items','id=eq.'+it.id);
  llDraft.items.splice(i, 1);
  renderLoadingLists();
}
function llMoveRow(i, dir){
  if(!llDraft) return;
  var j = i + dir;
  if(j < 0 || j >= llDraft.items.length) return;
  var tmp = llDraft.items[i];
  llDraft.items[i] = llDraft.items[j];
  llDraft.items[j] = tmp;
  renderLoadingLists();
}
function llSetRowField(i, field, val){
  if(!llDraft || !llDraft.items[i]) return;
  var it = llDraft.items[i];
  if(field === 'kind'){
    it.kind = val;
    /* Рулото и насипът нямат номерация — „палет 2 от 5" там не значи нищо. */
    if(val !== 'pallet'){ it.pallet_no = null; it.pallet_total = null; }
    renderLoadingLists();
    return;
  }
  if(field === 'pallet_no' || field === 'pallet_total'){
    var n = parseInt(val, 10);
    it[field] = isNaN(n) ? null : n;
    return;
  }
  it[field] = (val === '') ? null : val;
  if(field === 'store_name') renderLoadingLists(); /* сменя списъка „изчиства" */
}
function llSetDraftField(field, val){ if(llDraft) llDraft[field] = val; }

/* Полето „изчиства друг документ" предлага само чакащите документи на СЪЩИЯ
   обект: разписка на друг обект не може да бъде изчистена от този товар. */
function llClearsOptions(it){
  var opts = llPendingDocs.filter(function(d){ return d.store_name === it.store_name; });
  return '<option value="">—</option>' + opts.map(function(d){
    return '<option'+(d.purchase_doc===it.clears_doc?' selected':'')+'>'+esc(d.purchase_doc)+'</option>';
  }).join('');
}
function llStoreOptions(sel){
  return llStores.map(function(s){
    return '<option'+(s===sel?' selected':'')+'>'+esc(s)+'</option>';
  }).join('');
}

function llEditorHtml(){
  if(!llDraft) return '';
  var isNew = !llCurrentId;
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">'+
    '<div class="pg-title" style="margin:0;">'+(isNew?'➕ Нов товарен лист':'✏️ Редакция на товарен лист')+'</div>'+
    '<button onclick="llBackToList()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">← Назад</button>'+
    '</div>';

  /* а) Заглавие */
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">'+
    '<div><label class="fl">Дата *</label><input type="date" class="fi" id="ll-date" value="'+esc(llDraft.list_date||'')+'" onchange="llSetDraftField(\'list_date\',this.value)"></div>'+
    '<div><label class="fl">Товарил</label><input class="fi" id="ll-by" value="'+escVal(llDraft.executed_by)+'" oninput="llSetDraftField(\'executed_by\',this.value)"></div>'+
    '<div><label class="fl">Коментар</label><input class="fi" id="ll-comment" value="'+escVal(llDraft.comment)+'" oninput="llSetDraftField(\'comment\',this.value)"></div>'+
    '</div></div>';

  /* б) Чакащи стокови документи */
  h += '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:12px;">'+
    '<div style="font-size:13px;font-weight:700;color:#5b21b6;margin-bottom:8px;">📄 Чакащи стокови документи ('+llPendingDocs.length+')</div>';
  if(!llPendingDocs.length){
    h += '<div style="font-size:12px;color:#7c3aed;">Няма чакащи документи от този склад.</div>';
  } else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="color:#7c3aed;text-align:left;">'+
      '<th style="padding:3px 6px;"></th><th style="padding:3px 6px;">Документ</th><th style="padding:3px 6px;">Обект</th>'+
      '<th style="padding:3px 6px;">Дата</th><th style="padding:3px 6px;text-align:right;">Артикули</th>'+
      '<th style="padding:3px 6px;">Палети</th></tr>';
    llPendingDocs.forEach(function(d, i){
      h += '<tr style="border-top:1px solid #ede9fe;">'+
        '<td style="padding:3px 6px;"><input type="checkbox" data-i="'+i+'" onchange="llToggleDoc(this.dataset.i)"'+(d.checked?' checked':'')+'></td>'+
        '<td style="padding:3px 6px;font-family:DM Mono,monospace;">'+esc(d.purchase_doc)+'</td>'+
        '<td style="padding:3px 6px;">'+esc(d.store_name)+'</td>'+
        '<td style="padding:3px 6px;">'+fmtDate(d.doc_date)+'</td>'+
        '<td style="padding:3px 6px;text-align:right;">'+d.items+'</td>'+
        '<td style="padding:3px 6px;"><input type="number" min="1" value="'+d.pallets+'" data-i="'+i+'" onchange="llSetDocPallets(this.dataset.i,this.value)" style="width:62px;border:1px solid #ddd6fe;border-radius:5px;padding:2px 6px;font-size:12px;"></td>'+
        '</tr>';
    });
    h += '</table>';
    h += '<div style="font-size:11px;color:#7c3aed;margin-top:6px;">Стоковата № не се пише на ръка — избира се оттук.</div>';
  }
  h += '</div>';

  /* в–д) Редовете */
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'+
    '<div style="font-size:13px;font-weight:700;">📦 Редове ('+llDraft.items.length+')</div>'+
    '<button onclick="llAddFreeRow()" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;">➕ Ред без документ</button>'+
    '</div>';
  if(!llDraft.items.length){
    h += '<div style="color:#94a3b8;font-size:12px;padding:10px 0;">Още няма редове. Отметни документ отгоре или добави ред без документ.</div>';
  } else {
    h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;">'+
      '<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">#</th><th style="padding:3px 6px;">Вид</th>'+
      '<th style="padding:3px 6px;">№ / от</th><th style="padding:3px 6px;">Стокова №</th>'+
      '<th style="padding:3px 6px;">Изчиства</th><th style="padding:3px 6px;">Обект</th>'+
      '<th style="padding:3px 6px;">Коментар склад</th><th style="padding:3px 6px;"></th></tr>';
    llDraft.items.forEach(function(it, i){
      var isPallet = it.kind === 'pallet';
      h += '<tr style="border-top:1px solid #f1f5f9;">'+
        '<td style="padding:3px 6px;color:#94a3b8;">'+(i+1)+'</td>'+
        '<td style="padding:3px 6px;"><select data-i="'+i+'" onchange="llSetRowField(this.dataset.i,\'kind\',this.value)" style="border:1px solid #e2e8f0;border-radius:5px;padding:2px 4px;font-size:12px;">'+
          LL_KINDS.map(function(k){ return '<option value="'+k[0]+'"'+(it.kind===k[0]?' selected':'')+'>'+k[1]+'</option>'; }).join('')+
        '</select></td>'+
        '<td style="padding:3px 6px;white-space:nowrap;">'+(isPallet?
          '<input type="number" min="1" value="'+(it.pallet_no!=null?it.pallet_no:'')+'" data-i="'+i+'" oninput="llSetRowField(this.dataset.i,\'pallet_no\',this.value)" style="width:52px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 5px;font-size:12px;">'+
          ' от <input type="number" min="1" value="'+(it.pallet_total!=null?it.pallet_total:'')+'" data-i="'+i+'" oninput="llSetRowField(this.dataset.i,\'pallet_total\',this.value)" style="width:52px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 5px;font-size:12px;">'
          :'<span style="color:#cbd5e1;">—</span>')+'</td>'+
        '<td style="padding:3px 6px;font-family:DM Mono,monospace;">'+(it.purchase_doc?esc(it.purchase_doc):'<span style="color:#cbd5e1;">без</span>')+'</td>'+
        '<td style="padding:3px 6px;"><select data-i="'+i+'" onchange="llSetRowField(this.dataset.i,\'clears_doc\',this.value)" style="border:1px solid #e2e8f0;border-radius:5px;padding:2px 4px;font-size:12px;max-width:150px;">'+llClearsOptions(it)+'</select></td>'+
        '<td style="padding:3px 6px;"><select data-i="'+i+'" onchange="llSetRowField(this.dataset.i,\'store_name\',this.value)" style="border:1px solid #e2e8f0;border-radius:5px;padding:2px 4px;font-size:12px;">'+llStoreOptions(it.store_name)+'</select></td>'+
        '<td style="padding:3px 6px;"><input value="'+escVal(it.warehouse_comment)+'" data-i="'+i+'" oninput="llSetRowField(this.dataset.i,\'warehouse_comment\',this.value)" style="width:100%;min-width:120px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;font-size:12px;"></td>'+
        '<td style="padding:3px 6px;white-space:nowrap;">'+
          '<button data-i="'+i+'" onclick="llMoveRow(+this.dataset.i,-1)" title="Нагоре" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;">↑</button>'+
          '<button data-i="'+i+'" onclick="llMoveRow(+this.dataset.i,1)" title="Надолу" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;margin-left:2px;">↓</button>'+
          '<button data-i="'+i+'" onclick="llRemoveRow(+this.dataset.i)" title="Махни реда" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;margin-left:2px;">✕</button>'+
        '</td></tr>';
    });
    h += '</table></div>';
  }
  h += '</div>';

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
    '<button onclick="llBackToList()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="llSaveDraft()" style="border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази черновата</button>'+
    '</div>';
  return h;
}

/* Редовете за базата — преномерирани 1..N по реда на екрана. position НЕ се
   изчислява от created_at: редовете се записват накуп и таймстампите им
   съвпадат до милисекунда. */
function llBuildItemRows(listId, items){
  return (items || []).map(function(it, i){
    return {
      list_id: listId,
      position: i + 1,
      kind: it.kind,
      pallet_no: it.kind === 'pallet' ? (it.pallet_no != null ? it.pallet_no : null) : null,
      pallet_total: it.kind === 'pallet' ? (it.pallet_total != null ? it.pallet_total : null) : null,
      purchase_doc: it.purchase_doc || null,
      clears_doc: it.clears_doc || null,
      store_name: it.store_name,
      warehouse_comment: it.warehouse_comment || null
    };
  });
}
function llSaveDraft(){
  if(!llDraft) return;
  if(!llDraft.list_date){ toast('Избери дата','#dc2626'); return; }
  if(!llDraft.items.length){ toast('Добави поне един ред','#dc2626'); return; }
  var missing = llDraft.items.filter(function(it){ return !it.store_name; }).length;
  if(missing){ toast('Има ред без обект получател','#dc2626'); return; }

  var head = {
    warehouse: llActiveWarehouse(),
    list_date: llDraft.list_date,
    executed_by: llDraft.executed_by || null,
    comment: llDraft.comment || null,
    status: 'draft'
  };
  if(llCurrentId){
    sbPatch('loading_lists','id=eq.'+llCurrentId, head).then(function(res){
      if(!res.ok){ toast('Грешка при запис на листа: '+sbErrMsg(res),'#dc2626'); return; }
      llWriteItems(llCurrentId);
    });
    return;
  }
  head.created_by = llActor();
  sbPostReturn('loading_lists', head).then(function(res){
    if(!res.ok || !res.row){ toast('Грешка при запис на листа: '+sbErrMsg(res),'#dc2626'); return; }
    llCurrentId = res.row.id;
    llWriteItems(res.row.id);
  });
}
/* Съществуващите редове се PATCH-ват поименно, новите се вмъкват накуп.
   Провалът на редовете НЕ се поглъща: заглавието вече е записано, тоест в
   базата стои лист без съдържание — точно това казва маркерът. */
function llWriteItems(listId){
  var existing = llDraft.items.filter(function(it){ return !!it.id; });
  var fresh    = llDraft.items.filter(function(it){ return !it.id; });
  var pos = {};
  llDraft.items.forEach(function(it, i){ if(it.id) pos[it.id] = i + 1; });

  var patches = existing.map(function(it){
    var row = llBuildItemRows(listId, [it])[0];
    row.position = pos[it.id];
    delete row.list_id;
    return sbPatch('loading_list_items','id=eq.'+it.id, row);
  });
  Promise.all(patches).then(function(pres){
    var bad = pres.filter(function(r){ return !r.ok; });
    if(bad.length){
      llIncompleteSaves[listId] = true;
      console.error('llWriteItems: '+bad.length+' реда не бяха обновени', bad[0] && bad[0].error);
      toast('⚠️ '+bad.length+' реда НЕ бяха обновени: '+sbErrMsg(bad[0]),'#dc2626');
      llBackToList();
      return;
    }
    if(!fresh.length){ llFinishSave(listId); return; }
    /* Позициите на новите се смятат от ЦЕЛИЯ списък, не от подсписъка. */
    var rows = [];
    llDraft.items.forEach(function(it, i){
      if(it.id) return;
      var r = llBuildItemRows(listId, [it])[0];
      r.position = i + 1;
      rows.push(r);
    });
    sbPost('loading_list_items', rows).then(function(res){
      if(!res.ok){
        llIncompleteSaves[listId] = true;
        console.error('llWriteItems: редовете НЕ бяха записани', res.error);
        toast('⚠️ Листът е записан БЕЗ редовете: '+sbErrMsg(res),'#dc2626');
        llBackToList();
        return;
      }
      llFinishSave(listId);
    });
  });
}
function llFinishSave(listId){
  delete llIncompleteSaves[listId];
  toast('✅ Черновата е записана');
  llBackToList();
}

/* ─── ПРЕХОДИ ───────────────────────────────────────────────── */
function llSendList(id){
  if(!llCanEdit()){ toast('Нямаш права за това действие','#dc2626'); return; }
  if(!confirm('Изпрати товарния лист към обектите?')) return;
  sbPatch('loading_lists','id=eq.'+id,{status:'sent', sent_at:new Date().toISOString()}).then(function(res){
    if(!res.ok){ toast('Грешка при изпращане: '+sbErrMsg(res),'#dc2626'); return; }
    toast('📤 Товарният лист е изпратен');
    var l = llLists.find(function(x){ return String(x.id) === String(id); });
    if(l) l.status = 'sent';
    loadLoadingLists();
  });
}
function llDoneList(id){
  if(!llCanEdit()){ toast('Нямаш права за това действие','#dc2626'); return; }
  if(!confirm('Приключи товарния лист?')) return;
  sbPatch('loading_lists','id=eq.'+id,{status:'done', done_at:new Date().toISOString()}).then(function(res){
    if(!res.ok){ toast('Грешка при приключване: '+sbErrMsg(res),'#dc2626'); return; }
    toast('✅ Товарният лист е приключен');
    var l = llLists.find(function(x){ return String(x.id) === String(id); });
    if(l) l.status = 'done';
    loadLoadingLists();
  });
}
/* След „Изпратен" редовете са заключени — освен коментара на склада: той е
   каналът, по който складът дописва нещо, след като камионът е тръгнал. */
function llSaveWarehouseComment(itemId, val){
  sbPatch('loading_list_items','id=eq.'+itemId,{warehouse_comment: val || null}).then(function(res){
    if(!res.ok){ toast('Коментарът НЕ беше записан: '+sbErrMsg(res),'#dc2626'); return; }
    var it = llItems.find(function(x){ return String(x.id) === String(itemId); });
    if(it) it.warehouse_comment = val;
    toast('✅ Записано');
  });
}

/* ─── ПРЕГЛЕД НА ЛИСТ ───────────────────────────────────────── */
function llOpenView(id){
  llCurrentId = id;
  llView = 'view';
  renderLoadingLists();
}
function llViewHtml(){
  var l = llLists.find(function(x){ return String(x.id) === String(llCurrentId); });
  if(!l) return llListHtml();
  var items = llItemsOf(l.id).slice().sort(function(a,b){ return (a.position||0)-(b.position||0); });
  var c = llCounts(items);

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">'+
    '<div class="pg-title" style="margin:0;">🚛 Товарен лист · '+fmtDate(l.list_date)+' '+llStatusBadge(l.status)+'</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
      (l.status==='draft'?'<button data-id="'+l.id+'" onclick="llOpenEdit(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">✏️ Редакция</button>':'')+
      (l.status==='draft'?'<button data-id="'+l.id+'" onclick="llSendList(this.dataset.id)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">📤 Изпратен</button>':'')+
      (l.status==='sent'?'<button data-id="'+l.id+'" onclick="llDoneList(this.dataset.id)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">✅ Приключен</button>':'')+
      '<button onclick="llBackToList()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:12.5px;cursor:pointer;">← Назад</button>'+
    '</div></div>';

  h += '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">🏭 '+esc(l.warehouse||'')+
    (l.executed_by?' · Товарил: '+esc(l.executed_by):'')+
    (l.sent_at?' · Изпратен: '+llFmtStamp(l.sent_at):'')+
    (l.done_at?' · Приключен: '+llFmtStamp(l.done_at):'')+'</div>';
  if(l.comment) h += '<div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-bottom:10px;">💬 '+esc(l.comment)+'</div>';

  /* Обобщението по обект — СМЯТА СЕ от редовете, не от заглавието. */
  var sum = llSummaryByStore(items);
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px;">'+
    '<div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">📊 По обекти ('+c.stores+' обекта · '+c.pallet+' палета · '+c.roll+' рула · '+c.bulk+' насип)</div>'+
    '<table id="ll-summary" style="width:100%;border-collapse:collapse;font-size:12px;">'+
    '<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">Обект</th><th style="padding:3px 6px;text-align:right;">Палети</th><th style="padding:3px 6px;text-align:right;">Рула</th><th style="padding:3px 6px;text-align:right;">Насип</th><th style="padding:3px 6px;text-align:right;">Получени</th></tr>';
  sum.forEach(function(s){
    h += '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:3px 6px;font-weight:600;">'+esc(s.store)+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.pallet+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.roll+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.bulk+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.received+'/'+s.total+'</td></tr>';
  });
  h += '</table></div>';

  if(!items.length){
    return h + '<div style="text-align:center;padding:40px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">Листът няма редове.</div>';
  }
  var locked = l.status !== 'draft';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;"><thead><tr style="background:#f8fafc;">';
  ['#','Товарна единица','Стокова №','Изчиства','Коментар склад','Обект','Коментар обект','Получено'].forEach(function(cc){
    h += '<th style="text-align:left;padding:7px 9px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+cc+'</th>';
  });
  h += '</tr></thead><tbody>';
  items.forEach(function(it){
    h += '<tr style="border-bottom:1px solid #f1f5f9;'+(it.received?'background:#f0fdf4;':'')+'">'+
      '<td style="padding:6px 9px;color:#94a3b8;">'+(it.position!=null?it.position:'—')+'</td>'+
      '<td style="padding:6px 9px;font-weight:600;white-space:nowrap;">'+esc(llKindLabel(it))+'</td>'+
      '<td style="padding:6px 9px;font-family:DM Mono,monospace;">'+(it.purchase_doc?esc(it.purchase_doc):'<span style="color:#cbd5e1;">без</span>')+'</td>'+
      '<td style="padding:6px 9px;">'+(it.clears_doc?'изчиства '+esc(it.clears_doc):'<span style="color:#cbd5e1;">—</span>')+'</td>'+
      /* Единственото, което остава редактируемо след изпращане. */
      '<td style="padding:6px 9px;">'+(locked
        ? '<input value="'+escVal(it.warehouse_comment)+'" data-id="'+it.id+'" onchange="llSaveWarehouseComment(this.dataset.id,this.value)" style="width:100%;min-width:120px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;font-size:12px;">'
        : esc(it.warehouse_comment||'—'))+'</td>'+
      '<td style="padding:6px 9px;font-weight:500;">'+esc(it.store_name||'')+'</td>'+
      '<td style="padding:6px 9px;color:#64748b;">'+esc(it.store_comment||'—')+'</td>'+
      '<td style="padding:6px 9px;white-space:nowrap;">'+(it.received
        ? '<span style="color:#16a34a;font-weight:600;">✔ '+esc(it.received_by||'')+(it.received_at?' · '+llFmtStamp(it.received_at):'')+'</span>'
        : '<span style="color:#cbd5e1;">—</span>')+'</td>'+
      '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}
/* timestamptz -> дата. fmtDate() върху суров timestamptz прави split('-') и
   слепва частите наобратно ("01T09:00:00.000Z.09.2026"). Същият капан като
   sdFmtDateTime в stock-differences.js. */
function llFmtStamp(val){
  if(val === null || val === undefined || val === '') return '—';
  var s = String(val), t = s.indexOf('T');
  return fmtDate(t >= 0 ? s.slice(0, t) : s);
}
