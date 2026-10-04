/* transit.js — Стока на път (SAP формат) — v2 с incoming/outgoing */

var transitData   = [];
var transitFilter = 'pending';
var transitStore  = '';
var transitDir    = 'all'; /* 'all' | 'incoming' | 'outgoing' */
var transitEditId = null;
var transitMonthFilter = ''; /* 'YYYY-MM' за филтър по месец */
var transitSearch = ''; /* търсене по документ / SAP код / описание */
var _transitPendingScrollY = null; /* мост между loadTransit() и renderTransit() за запазване на скрола */
var _transitSearchTimer = null;
var _transitVisible = []; /* показаният списък след филтрите — за „Провери всички чакащи" */

/* ── PLANT MAPPING ── */
var PLANT_INCOMING = {
  '5502':'Севлиево','5503':'Враца','5507':'Монтана','5508':'Кърджали',
  '5512':'Търговище','5513':'Сливен','5514':'Шумен','5515':'Габрово',
  '5516':'Добрич','5519':'Гоце Делчев','5520':'Силистра','5521':'Раднево',
  '5522':'Дупница','5523':'Петрич','5524':'Пирдоп','5525':'Троян',
  '5526':'Карлово','5527':'Козлодуй',
  '5518':'Логистичен склад Добрич','5505':'Логистичен склад Търговище',
  /* Допълнителни обекти */
  '5531':'Сервиз Троян','5510':'Администрация','5506':'Пазарджик'
};
var PLANT_OUTGOING = {
  '2502':'Севлиево','2503':'Враца','2513':'Сливен','2520':'Силистра',
  '2521':'Раднево','2522':'Дупница',
  '6527':'Козлодуй','6508':'Кърджали','6512':'Търговище','6514':'Шумен',
  '6525':'Троян','6516':'Добрич',
  '7526':'Карлово','7523':'Петрич','7519':'Гоце Делчев','7507':'Монтана',
  '7515':'Габрово','7524':'Пирдоп',
  '2505':'Логистичен склад Търговище','2518':'Логистичен склад Добрич'
};
var PLANT_ALL = Object.assign({}, PLANT_INCOMING, PLANT_OUTGOING);

/* Истинските 18 магазина (без складове/сервиз/администрация) — използва се
   за разпознаване на "трансфер между магазини" при импорт, независимо дали
   кодът на доставчика е от "получаващ" или "изпращащ" тип. */
var REAL_STORE_NAMES = {
  'Враца':1,'Габрово':1,'Гоце Делчев':1,'Добрич':1,'Дупница':1,'Карлово':1,'Козлодуй':1,
  'Кърджали':1,'Монтана':1,'Петрич':1,'Пирдоп':1,'Раднево':1,'Севлиево':1,'Силистра':1,
  'Сливен':1,'Троян':1,'Търговище':1,'Шумен':1
};

var T_STATUS = {
  pending:  { label:'⏳ Не доставена', bg:'#fef9c3', color:'#92400e' },
  received: { label:'✅ Прието',       bg:'#f0fdf4', color:'#16a34a' },
  rejected: { label:'✕ Неприето',     bg:'#fff1f2', color:'#dc2626' },
  sent:     { label:'📤 Изпратена',    bg:'#f5f3ff', color:'#7c3aed' }
};

function canEditTransit(){
  return currentUser&&['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role)>=0;
}
function canAddTransit(){
  return currentUser&&['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
}

/* ── ПРАВА ЗА ДВУСТЪПКОВИЯ ПОТОК ПРИ TRANSFER ── */
function transitIsSenderOf(r){
  return !!(currentUser&&currentUser.store_name&&currentUser.store_name===r.supplier);
}
function transitIsReceiverOf(r){
  return !!(currentUser&&currentUser.store_name&&currentUser.store_name===r.store_name);
}
/* За transfer: pending→sent само подателят (или global); sent→received само получателят (или global) */
function transitCanMarkSent(r){
  return canEditTransit()&&(isGlobal()||transitIsSenderOf(r));
}
function transitCanMarkReceived(r){
  return canEditTransit()&&(isGlobal()||transitIsReceiverOf(r));
}

/* Складов профил (role 'logistics' със store_name) вижда само редовете на
   своя склад. Връща името на склада или '' (admin, accounting, логистик без
   store_name - те не се ограничават). */
function transitOwnWarehouse(){
  return (currentUser&&currentUser.role==='logistics'&&currentUser.store_name)?currentUser.store_name:'';
}

/* ── LOAD с pagination чрез Range header ── */
function loadTransit(){
  var wrap=document.getElementById('mod-transit');
  /* Улавяме позицията на скрола ПРЕДИ да покажем краткия loading placeholder —
     иначе страницата рязко се смалява (200px), браузърът "закача" скрола на 0,
     и след като данните се заредят обратно, вече не се връща сам. */
  _transitPendingScrollY=window.scrollY||window.pageYOffset||0;
  if(wrap)wrap.innerHTML='<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';

  var storeFilter='';
  var ownWh=transitOwnWarehouse();
  if(ownWh){
    /* Складът е и подател (supplier), и получател (store_name) в своите
       редове; чуждите складове и трансферите между магазини не се теглят. */
    var we=encodeURIComponent(ownWh);
    storeFilter='&or=(supplier.eq.'+we+',store_name.eq.'+we+')';
  }else if(!isGlobal()){
    var store=currentUser.store_name||'';
    var se=encodeURIComponent(store);
    /* Обектът вижда СВОИТЕ редове плюс трансферите, които САМ е изпратил.
       Подателят се сравнява ТОЧНО и само при direction='transfer'.
       Досега тук стоеше supplier.ilike.*<обект>*, което лови и всеки друг
       доставчик, съдържащ името на обекта: "Логистичен склад Търговище" при
       обект "Търговище", "Сервиз Троян" при "Троян". Следствието не е
       козметично - Търговище виждаше 1710 реда вместо 91 (68 свои + 23
       изпратени трансфера), а Добрич 520 вместо 110. Останалите обекти
       губеха по няколко чужди реда, напр. Троян виждаше три доставки на
       Карлово, Козлодуй и Търговище само защото подателят е "Сервиз Троян".
       Складовите профили не минават оттук - role 'logistics' е вътре в
       isGlobal(), тоест за тях storeFilter остава празен. */
    storeFilter='&or=(store_name.eq.'+se+',and(direction.eq.transfer,supplier.eq.'+se+'))';
  }

  transitData=[];
  var SB_URL='https://xiwkdiqqplgdcrkewgtv.supabase.co';
  var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';

  function loadPage(from){
    var to=from+999;
    fetch(SB_URL+'/rest/v1/goods_transit?order=doc_date.desc,purchase_doc.asc,position.asc'+storeFilter,{
      headers:{
        'apikey':SB_KEY,
        'Authorization':'Bearer '+SB_KEY,
        'Range':from+'-'+to,
        'Range-Unit':'items',
        'Prefer':'count=exact'
      }
    }).then(function(r){
      var range=r.headers.get('content-range')||'';
      return r.json().then(function(data){
        return {data:data,range:range};
      });
    }).then(function(res){
      var data=Array.isArray(res.data)?res.data:[];
      transitData=transitData.concat(data);
      /* Парсваме total от content-range: "0-999/1305" */
      var total=0;
      var m=res.range.match(/\/(\d+)$/);
      if(m)total=parseInt(m[1]);
      var loaded=transitData.length;
      if(total>0&&loaded<total&&data.length===1000){
        /* Има още - зареждаме следващата страница */
        loadPage(from+1000);
      }else{
        renderTransit();
      }
    }).catch(function(err){
      var w=document.getElementById('mod-transit');
      if(w)w.innerHTML='<div style="color:#dc2626;padding:40px;">Грешка: '+JSON.stringify(err)+'</div>';
    });
  }
  loadPage(0);
}

/* ── RENDER ── */
function renderTransit(){
  var wrap=document.getElementById('mod-transit');if(!wrap)return;
  /* Ако полето за търсене е фокусирано в момента, запазваме позицията на
     курсора, за да не губи фокус потребителят на всяка натисната буква
     (цялата таблица се прерисува наново при всеки renderTransit()). */
  var _searchHadFocus=document.activeElement&&document.activeElement.id==='t-search';
  var _searchCursorPos=_searchHadFocus?document.activeElement.selectionStart:null;
  var isAdmin=currentUser&&['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
  var canEdit=canEditTransit();
  var canAdd=canAddTransit();

  /* Приложи direction филтър — 3 отделни посоки, не се препокриват */

  /* Редовете при зададени филтри (посока → статус → магазин → месец → търсене).
     over={dir,status} подменя само това измерение; останалите филтри остават.
     Така число върху бутон = редовете след клик на него (правилото на Разлики).
     Без over това е точно списъкът в таблицата. */
  var _matchByStoreName=true;
  if(transitStore&&!transitOwnWarehouse()){
    /* За transfer редове ВИНАГИ проверяваме и двете полета — магазинът
       легитимно може да е подател (supplier) в един ред и получател
       (store_name) в друг, и искаме да видим всичко, докато гледаме
       таб "Трансфери" (напр. Кърджали трябва да види и 123-те си incoming
       реда, И 6-те transfer реда, където Е supplier — мажоритарното
       правило по-долу би скрило вторите, защото Кърджали се среща много
       по-често като store_name общо взето).

       За incoming/outgoing редове (не transfer) прилагаме мажоритарно
       правило: ако избраният се среща ПРЕОБЛАДАВАЩО като store_name
       (истински магазин), филтрираме само по store_name — иначе редове
       на ЧУЖДИ магазини се промъкват само защото името съвпада с полето
       supplier. Ако се среща ПРЕОБЛАДАВАЩО като supplier (логистичен
       склад — напр. "Логистичен склад Търговище" има само 1 случаен ред
       като store_name срещу 1988 легитимни като supplier), филтрираме
       по supplier. Устойчиво на единични аномални редове в данните, за
       разлика от обикновена проверка "среща ли се изобщо". */
    var _ownCount=0,_asSupplierCount=0;
    transitData.forEach(function(r){
      if(r.store_name===transitStore)_ownCount++;
      if(r.supplier===transitStore)_asSupplierCount++;
    });
    _matchByStoreName=_ownCount>=_asSupplierCount;
  }
  var _q=transitSearch?transitSearch.trim().toLowerCase():'';
  function transitRows(over){
    over=over||{};
    var dir=over.dir!==undefined?over.dir:transitDir;
    var status=over.status!==undefined?over.status:transitFilter;
    var rows=transitData;
    if(dir==='incoming'||dir==='transfer'||dir==='outgoing') rows=rows.filter(function(r){return r.direction===dir;});
    if(status==='pending'||status==='received'||status==='rejected'||status==='sent') rows=rows.filter(function(r){return r.status===status;});
    if(transitStore&&transitOwnWarehouse()){
      /* Складовият профил има само своите редове (филтър на сървъра), затова
         магазинът в падащото меню е получателят - без supplier и без
         мажоритарно правило. */
      rows=rows.filter(function(r){return r.store_name===transitStore;});
    }else if(transitStore){
      rows=rows.filter(function(r){
        if(r.direction==='transfer') return r.store_name===transitStore||r.supplier===transitStore;
        return _matchByStoreName ? r.store_name===transitStore : r.supplier===transitStore;
      });
    }
    if(transitMonthFilter) rows=rows.filter(function(r){
      return r.doc_date&&r.doc_date.slice(0,7)===transitMonthFilter;
    });
    if(_q){
      rows=rows.filter(function(r){
        return (r.purchase_doc&&String(r.purchase_doc).toLowerCase().indexOf(_q)>=0)
            || (r.material_code&&String(r.material_code).toLowerCase().indexOf(_q)>=0)
            || (r.material_name&&String(r.material_name).toLowerCase().indexOf(_q)>=0);
      });
    }
    return rows;
  }
  var list=transitRows();

  /* Магазини за dropdown */
  var stores={};
  transitData.forEach(function(r){if(r.store_name)stores[r.store_name]=1;});
  var storeList=Object.keys(stores).sort();

  var h='<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие + бутони */
  h+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h+='<div style="font-size:20px;font-weight:600;">📦 Стока на път</div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  if(canAdd){
    h+='<button onclick="openTransitImportModal()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📥 Импорт Excel</button>';
    h+='<button onclick="openTransitAdd()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави ред</button>';
  }
  if(isAdmin){
    h+='<button onclick="exportTransitExcel()" style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📊 Експорт Excel</button>';
    h+='<button onclick="confirmClearTransit()" style="border:1px solid #dc2626;background:#fff5f5;color:#dc2626;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">🗑 Изчисти всички</button>';
  }
  h+='</div></div>';

  /* Direction tabs — "Изпращам" (outgoing) е скрит по същата причина.
     Ако някога се появи такъв ред, ще се вижда под "Всички". */
  h+='<div style="display:flex;gap:0;margin-bottom:12px;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;max-width:640px;">';
  [['all','📦📤 Всички',(transitData.length?'('+transitRows({dir:'all'}).length+')':'')],
   ['incoming','📦 Получавам','('+transitRows({dir:'incoming',status:'pending'}).length+' чакат)'],
   ['transfer','🔄 Трансфери','('+transitRows({dir:'transfer',status:'pending'}).length+' за изпр. / '+transitRows({dir:'transfer',status:'sent'}).length+' за получ.)']].forEach(function(t){
    var active=transitDir===t[0];
    h+='<button onclick="transitDir=\''+t[0]+'\';renderTransit()" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:'+(active?'#0f172a':'#fff')+';color:'+(active?'#fff':'#64748b')+';">'+t[1]+'<div style="font-size:10px;opacity:0.7;">'+t[2]+'</div></button>';
  });
  h+='</div>';

  /* Статус (чипове с брой) + магазин + месец — на един ред. Общият вид е .chips (index.html);
     атрибутът е data-tt-f (НЕ data-f — сблъсък с Разлики). Числото = редовете след клик на чипа. */
  h+='<div id="t-filters" class="filter-bar chips" style="margin:0 0 12px;">';
  h+='<span class="chips-label">Покажи:</span>';
  [['pending','⏳ Не доставени',''],['sent','📤 Изпратена',''],['|'],['received','✅ Прието',' chip-hist'],['rejected','✕ Неприето',' chip-hist'],['all','Всички',' chip-hist']].forEach(function(f){
    if(f[0]==='|'){h+='<span class="chips-sep"></span>';return;}
    var a=transitFilter===f[0];
    var cnt=transitRows({status:f[0]}).length;
    h+='<button class="filter-btn'+f[2]+(a?' active':'')+'" data-tt-f="'+f[0]+'" onclick="transitFilter=\''+f[0]+'\';renderTransit()">'+f[1]+' <span class="chips-n">'+cnt+'</span></button>';
  });
  /* Магазин dropdown - получатели + доставчици */
  var allStores={};
  transitData.forEach(function(r){
    if(r.store_name)allStores[r.store_name]=1;
    if(r.supplier&&!transitOwnWarehouse())allStores[r.supplier]=1;
  });
  /* Складът не е опция в собственото си меню - в базата има и случаен ред
     със store_name=склада, който иначе би го върнал. */
  if(transitOwnWarehouse())delete allStores[transitOwnWarehouse()];
  var allStoreList=Object.keys(allStores).sort(function(a,b){return a.localeCompare(b,'bg');});
  if(allStoreList.length>0){
    h+='<select onchange="setTStore(this.value)" style="border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;">';
    h+='<option value="">Всички магазини</option>';
    allStoreList.forEach(function(s){h+='<option value="'+esc(s)+'"'+(transitStore===s?' selected':'')+'>'+esc(s)+'</option>';});
    h+='</select>';
  }
  /* Филтър по месец */
  h+='<input type="month" id="t-month" value="'+transitMonthFilter+'" onchange="transitMonthFilter=this.value;renderTransit()" style="border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;" title="Филтър по месец">';
  if(transitMonthFilter){
    h+='<button onclick="transitMonthFilter=\'\';document.getElementById(\'t-month\').value=\'\';renderTransit()" style="border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">✕ Всички</button>';
  }
  h+='</div>';

  /* Търсене по документ / SAP код / описание — debounce 180ms, за да не
     прерисува таблицата на всяка буква; фокусът/курсорът се пазят от
     логиката горе/долу в renderTransit(). */
  h+='<div style="margin-bottom:12px;position:relative;max-width:340px;">';
  h+='<input type="text" id="t-search" placeholder="🔍 Търси по документ, SAP код, описание..." value="'+escVal(transitSearch)+'" oninput="setTSearch(this.value)" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:7px 32px 7px 10px;font-size:12.5px;font-family:inherit;">';
  if(transitSearch){
    h+='<button onclick="setTSearch(\'\');document.getElementById(\'t-search\').value=\'\';" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;">✕</button>';
  }
  h+='</div>';

  _transitVisible=list;
  h+=tReviewCounterHtml(list);

  /* Таблица */
  if(!list.length){
    h+='<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  }else{
    h+='<div class="tbl-wrap tbl-compact tbl-tt-compact">';
    h+='<table style="border-collapse:collapse;font-size:12px;">';
    h+='<thead><tr style="background:#f8fafc;">';
    ['Документ · Дата','От → Към','Описание','Количество','Статус','Действия'].forEach(function(c){
      h+='<th style="text-align:left;padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+c+'</th>';
    });
    h+='</tr></thead><tbody>';

    list.forEach(function(r){
      var st=T_STATUS[r.status]||T_STATUS.pending;
      var isOut=r.direction==='outgoing';
      var isTransfer=r.direction==='transfer';
      var isOver=r.status==='pending'&&r.doc_date&&(new Date()-new Date(r.doc_date))>30*86400000;
      var dirBg=isOut?'rgba(124,58,237,.04)':(isTransfer?'rgba(194,65,12,.04)':'');
      h+='<tr style="border-bottom:1px solid #f1f5f9;'+(isOver?'background:#fffbeb;':dirBg)+'">';
      /* 1. Документ · Дата + бадж за посока */
      h+='<td style="padding:7px 8px;">'+
        '<div style="font-family:DM Mono,monospace;font-size:11px;word-break:break-word;">'+esc(r.purchase_doc||'')+'</div>'+
        '<div style="font-size:10px;color:#94a3b8;">Поз. '+(r.position||'—')+'</div>'+
        '<div style="font-family:DM Mono,monospace;font-size:11px;color:#94a3b8;margin-top:2px;">'+fmtDate(r.doc_date)+'</div>'+
        '<div style="margin-top:3px;">'+
        (isOut?
          '<span style="background:#f5f3ff;color:#7c3aed;padding:2px 6px;border-radius:20px;font-size:9.5px;font-weight:700;white-space:nowrap;">📤 Изпращам</span>':
          isTransfer?
          '<span style="background:#fff7ed;color:#c2410c;padding:2px 6px;border-radius:20px;font-size:9.5px;font-weight:700;white-space:nowrap;">🔄 Трансфер</span>':
          '<span style="background:#eff6ff;color:#1e40af;padding:2px 6px;border-radius:20px;font-size:9.5px;font-weight:700;white-space:nowrap;">📦 Получавам</span>')+
        '</div></td>';
      /* 2. От → Към: доставчикът (почистен както преди) → магазинът */
      h+='<td style="padding:7px 8px;" title="'+esc(r.supplier||'')+'">'+
        '<span style="font-size:11px;color:#64748b;">'+esc((r.supplier||'').replace(/^\d+\s+\d*\s*/,'').replace(/^\d+\s*/,'').replace(/^ТМ\s+/,''))+'</span>'+
        ' → <b style="font-weight:600;">'+esc(r.store_name||'')+'</b></td>';
      /* 3. Описание (реже се с …) + код */
      h+='<td style="padding:7px 8px;overflow:hidden;"><div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(r.material_name||'')+'">'+esc(r.material_name||'')+'</div><div style="font-size:10px;color:#94a3b8;">'+esc(r.material_code||'')+'</div></td>';
      /* 4. Количество + остатък + дата на трансфер */
      h+='<td style="padding:7px 8px;white-space:nowrap;">'+(r.ordered_qty||'')+'<span style="font-size:10px;color:#94a3b8;margin-left:2px;">'+esc(r.unit||'')+'</span>'+
        (r.remaining_qty?'<div style="font-size:10px;color:#64748b;font-weight:600;">остатък '+r.remaining_qty+'</div>':'')+
        (r.transfer_date?'<div style="font-family:DM Mono,monospace;font-size:10px;color:#94a3b8;">'+fmtDate(r.transfer_date)+'</div>':'')+'</td>';
      /* 5. Статус */
      h+='<td style="padding:7px 8px;">'+
          '<span style="background:'+st.bg+';color:'+st.color+';padding:2px 6px;border-radius:20px;font-size:10.5px;font-weight:600;white-space:nowrap;">'+st.label+'</span>'+
          tReviewedBadgeHtml(r)+
          (r.comment?'<div style="font-size:10px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(r.comment)+'">'+esc(r.comment)+'</div>':'')+
        '</td>';
      /* 6. Действия — същите бутони и условия като преди */
      h+='<td style="padding:6px 6px;">';
      h+='<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      if(canEdit&&isTransfer){
        /* Двустъпков поток: pending→sent само подателят, sent→received само получателят */
        if(r.status==='pending'){
          if(transitCanMarkSent(r)){
            h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'sent\')" style="border:none;background:#7c3aed;color:#fff;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap;">📤 Изпратена</button>';
          } else {
            h+='<span style="font-size:10px;color:#94a3b8;white-space:nowrap;">⏳ чака '+esc(r.supplier||'подателя')+'</span>';
          }
        } else if(r.status==='sent'){
          if(transitCanMarkReceived(r)){
            h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'received\')" style="border:none;background:#16a34a;color:#fff;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap;">✅ Прието</button>';
            h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'rejected\')" style="border:none;background:#dc2626;color:#fff;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap;">✕ Неприето</button>';
          } else {
            h+='<span style="font-size:10px;color:#94a3b8;white-space:nowrap;">📤 чака '+esc(r.store_name||'получателя')+'</span>';
          }
        }
        /* Върни: sent→pending само подателят; received→sent само получателят; global винаги */
        if(r.status==='sent'&&(isGlobal()||transitIsSenderOf(r))){
          h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'pending\')" style="border:1px solid #94a3b8;background:#fff;color:#334155;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">↩ Върни</button>';
        } else if(r.status==='received'&&(isGlobal()||transitIsReceiverOf(r))){
          h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'sent\')" style="border:1px solid #94a3b8;background:#fff;color:#334155;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">↩ Върни</button>';
        } else if(r.status==='rejected'&&isGlobal()){
          h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'pending\')" style="border:1px solid #94a3b8;background:#fff;color:#334155;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">↩ Върни</button>';
        }
      }
      if(canEdit&&!isTransfer&&r.status==='pending'){
        if(isOut){
          h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'sent\')" style="border:none;background:#7c3aed;color:#fff;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap;">📤 Изпратена</button>';
        } else {
          h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'received\')" style="border:none;background:#16a34a;color:#fff;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap;">✅ Прието</button>';
        }
        h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'rejected\')" style="border:none;background:#dc2626;color:#fff;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap;">✕ Неприето</button>';
        if(tCanReview(r)&&!r.reviewed_at){
          h+='<button data-id="'+r.id+'" onclick="tMarkReviewed(this.dataset.id)" style="border:1px solid #0369a1;background:#f0f9ff;color:#0369a1;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">👁 Проверено, не е пристигнало</button>';
        }
      }
      if(canEdit&&!isTransfer&&r.status!=='pending'){
        h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'pending\')" style="border:1px solid #94a3b8;background:#fff;color:#334155;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">↩ Върни</button>';
      }
      if(canEdit){
        h+='<button data-id="'+r.id+'" onclick="openTransitEdit(this.dataset.id)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">✏️ Редакция</button>';
      }
      if(isAdmin){
        h+='<button data-id="'+r.id+'" onclick="tDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:4px 6px;font-size:10.5px;cursor:pointer;">✕</button>';
      }
      h+='</div>';
      h+='</td></tr>';
    });
    h+='</tbody></table></div>';
    h+='<div style="font-size:12px;color:#94a3b8;margin-top:8px;">Показани '+list.length+' от '+transitData.length+' записа.</div>';
  }
  h+='</div>';
  h+=transitModalHtml();
  wrap.innerHTML=h;

  /* Възстановяваме скрола (ако идваме от loadTransit()) и фокуса на полето
     за търсене (ако потребителят пишеше в него в момента на прерисуването). */
  if(_transitPendingScrollY!=null){
    var _y=_transitPendingScrollY;_transitPendingScrollY=null;
    requestAnimationFrame(function(){window.scrollTo(0,_y);});
  }
  if(_searchHadFocus){
    var _si=document.getElementById('t-search');
    if(_si){
      _si.focus();
      if(_searchCursorPos!=null)_si.setSelectionRange(_searchCursorPos,_searchCursorPos);
    }
  }
}

function setTFilter(f){ transitFilter=f; renderTransit(); }
function setTStore(s){ transitStore=s; renderTransit(); }
function setTSearch(v){
  transitSearch=v;
  clearTimeout(_transitSearchTimer);
  _transitSearchTimer=setTimeout(function(){renderTransit();},180);
}

/* ── СТАТУС ПРОМЯНА ── */
function tMarkStatus(id,status){
  var r=transitData.find(function(x){return String(x.id)===String(id);});
  if(!r)return;
  if(r.direction==='outgoing'&&status==='received'){
    toast('Изпращащ магазин/склад не може да отбележи "Прието" — само "Изпратена"','#dc2626');
    return;
  }
  if(r.direction==='transfer'){
    /* Двустъпков поток: pending→sent само подателят; sent→received само получателят */
    if(status==='sent'&&!transitCanMarkSent(r)){
      toast('Само изпращащият магазин ('+(r.supplier||'')+') може да маркира "Изпратена"','#dc2626');
      return;
    }
    if(status==='received'&&!transitCanMarkReceived(r)){
      toast('Само получаващият магазин ('+(r.store_name||'')+') може да маркира "Прието"','#dc2626');
      return;
    }
  }
  var body={status:status,updated_by:currentUser.display_name||currentUser.email,updated_at:new Date().toISOString()};
  /* Прието/неприето затваря реда — „проверено, не е пристигнало" вече не
     описва нищо. Иначе при „↩ Върни" редът би се върнал като проверен. */
  if(status==='received'||status==='rejected'){ body.reviewed_at=null; body.reviewed_by=null; }
  sbPatch('goods_transit','id=eq.'+id,body)
  .then(function(){ loadTransit(); }).catch(function(){ toast('Грешка','#dc2626'); });
}

/* ── „ПРОВЕРЕНО, НЕ Е ПРИСТИГНАЛО" ──
   Изричното твърдение на обекта, че е гледал реда и стоката още я няма.
   Статусът остава pending; reviewed_at е отделна колона. Входящ ред без
   нито статус, нито reviewed_at е „необработен" — по него тригерът в базата
   решава дали задачата „Стока на път" е изпълнена (transit_store_done в
   transit-reviewed-schema.sql). Проверява получателят (или офисът). */
function tCanReview(r){
  return !!r&&canEditTransit()&&r.direction==='incoming'&&(r.status||'pending')==='pending'&&
         (isGlobal()||transitIsReceiverOf(r));
}
function tReviewedBadgeHtml(r){
  if(!r||!r.reviewed_at||(r.status||'pending')!=='pending') return '';
  var d=new Date(r.reviewed_at);
  if(isNaN(d.getTime())) return '';
  var p=function(n){return (n<10?'0':'')+n;};
  return '<div class="t-reviewed" title="'+esc(r.reviewed_by||'')+'" style="font-size:10px;color:#0369a1;font-weight:600;margin-top:2px;white-space:nowrap;">👁 проверено '+p(d.getDate())+'.'+p(d.getMonth()+1)+'</div>';
}
/* Колоната „Проверено" в Excel: „дд.мм.гггг ЧЧ:ММ · кой". Само за чакащ ред —
   същото условие като баджа; затворен ред с останала стара стойност е празен. */
function tReviewedExcel(r){
  if(!r||!r.reviewed_at||(r.status||'pending')!=='pending') return '';
  var d=new Date(r.reviewed_at);
  if(isNaN(d.getTime())) return '';
  var p=function(n){return (n<10?'0':'')+n;};
  return p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes())+
         (r.reviewed_by?' · '+r.reviewed_by:'');
}
function tMarkReviewed(id){
  var r=transitData.find(function(x){return String(x.id)===String(id);});
  if(!tCanReview(r)) return;
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  sbPatch('goods_transit','id=eq.'+id,{reviewed_at:at,reviewed_by:who,updated_by:who,updated_at:at}).then(function(res){
    if(res&&res.ok===false){ toast('Грешка при запис','#dc2626'); return; }
    toast('👁 Отбелязано: проверено, не е пристигнало');
    loadTransit();
  });
}
/* Всички ПОКАЗАНИ чакащи редове, които потребителят има право да провери.
   Пакети по 100 id — адресът на PATCH-а не бива да расте без край (офисът
   може да гледа стотици редове). Всеки пакет е една заявка, тоест тригерът
   тръгва веднъж на обект на пакет. */
function tReviewAllPending(){
  var todo=(_transitVisible||[]).filter(function(r){return tCanReview(r)&&!r.reviewed_at;});
  if(!todo.length){ toast('Няма чакащи редове за проверка','#64748b'); return; }
  if(!confirm('Отбележи '+todo.length+' чакащи реда като „Проверено, не е пристигнало"?\n\nПотвърждаваш, че си ги проверил и стоката още я няма.')) return;
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  var ids=todo.map(function(r){return r.id;}), chunks=[];
  for(var i=0;i<ids.length;i+=100) chunks.push(ids.slice(i,i+100));
  var failed=0;
  function next(k){
    if(k>=chunks.length){
      if(failed) toast('Част от редовете не се записаха ('+failed+' от '+chunks.length+' пакета)','#dc2626');
      else toast('👁 Проверени: '+ids.length);
      loadTransit();
      return;
    }
    sbPatch('goods_transit','id=in.('+chunks[k].join(',')+')',{reviewed_at:at,reviewed_by:who,updated_by:who,updated_at:at}).then(function(res){
      if(res&&res.ok===false) failed++;
      next(k+1);
    });
  }
  next(0);
}
/* „Обработени X / проверени Y / необработени Z" за входящите редове на
   обекта — собственият за магазин, избраният във филтъра за офиса; без обект
   броячът не се показва. Числата са за ЦЕЛИЯ обект, не за филтрирания
   изглед: точно по тях тригерът решава за задачата. Бутонът „Провери всички
   чакащи" работи върху ПОКАЗАНИЯ списък. */
function tReviewCounterHtml(list){
  var store=isGlobal()?transitStore:(currentUser&&currentUser.store_name);
  var inner='';
  if(store){
    var done=0,rev=0,open=0;
    transitData.forEach(function(r){
      if(r.store_name!==store||r.direction!=='incoming') return;
      if(r.status&&r.status!=='pending') done++;
      else if(r.reviewed_at) rev++;
      else open++;
    });
    if(done+rev+open){
      inner+='<div id="t-review-counter" style="font-size:12.5px;color:#334155;">📦 '+esc(store)+': '+
        '<b style="color:#16a34a;">Обработени '+done+'</b> / '+
        '<b style="color:#0369a1;">проверени '+rev+'</b> / '+
        '<b style="color:'+(open?'#dc2626':'#16a34a')+';">необработени '+open+'</b></div>';
    }
  }
  var todo=(list||[]).filter(function(r){return tCanReview(r)&&!r.reviewed_at;});
  if(todo.length){
    inner+='<button id="t-review-all" onclick="tReviewAllPending()" style="border:1px solid #0369a1;background:#f0f9ff;color:#0369a1;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">👁 Провери всички чакащи ('+todo.length+')</button>';
  }
  if(!inner) return '';
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin-bottom:12px;">'+inner+'</div>';
}

/* ── ИЗТРИЙ РЕД ── */
function tDelete(id){
  if(!confirm('Изтрий този ред?'))return;
  sbDelete('goods_transit','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('tDelete: редът НЕ беше изтрит',id,res.error);
      toast('⚠️ Редът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadTransit(); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadTransit(); return; }
    toast('✓ Изтрит'); loadTransit();
  });
}

/* ── ИЗЧИСТИ ВСИЧКИ (admin) ── */
function confirmClearTransit(){
  if(currentUser.role!=='admin'){toast('Само за admin','#dc2626');return;}
  if(!confirm('ВНИМАНИЕ: Ще се изтрият ВСИЧКИ записи в Стока на път!\n\nПродължи ли?'))return;
  if(!confirm('Потвърди повторно — това е необратимо!'))return;
  /* Изтриваме на batch-ове — sbDelete без id изтрива всичко */
  fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/rest/v1/goods_transit?id=neq.00000000-0000-0000-0000-000000000000',{
    method:'DELETE',
    headers:{
      'apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
      'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA'
    }
  }).then(function(r){
    if(r.ok){toast('🗑 Всички записи са изтрити');transitData=[];renderTransit();}
    else toast('Грешка при изчистване','#dc2626');
  });
}

/* ── ЕКСПОРТ EXCEL ── */
function exportTransitExcel(){
  if(!window.XLSX){
    var s=document.createElement('script');
    s.src='https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=exportTransitExcel;
    s.onerror=function(){toast('Грешка при зареждане на SheetJS','#dc2626');};
    document.head.appendChild(s);return;
  }
  var wb=window.XLSX.utils.book_new();
  var rows=[['Посока','Магазин','Доставчик/Склад','Документ','Позиция','Дата',
    'Материал','Описание','Кол.','МЕ','Остатък','Дата трансфер','Статус','Проверено','Коментар',
    'Обновен от','Обновен на']];
  transitData.forEach(function(r){
    rows.push([
      r.direction==='outgoing'?'📤 Изпращам':r.direction==='transfer'?'🔄 Трансфер':'📦 Получавам',
      r.store_name||'',r.supplier||'',r.purchase_doc||'',r.position||'',
      r.doc_date||'',r.material_code||'',r.material_name||'',
      r.ordered_qty||'',r.unit||'',r.remaining_qty||'',
      r.transfer_date||'',
      T_STATUS[r.status]?T_STATUS[r.status].label.replace(/^[^A-Za-zА-Яа-я]+/,''):(r.status||''),
      tReviewedExcel(r),
      r.comment||'',r.updated_by||'',r.updated_at?r.updated_at.slice(0,16).replace('T',' '):''
    ]);
  });
  var ws=window.XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:14},{wch:16},{wch:22},{wch:14},{wch:8},{wch:12},{wch:10},{wch:30},
    {wch:8},{wch:6},{wch:8},{wch:14},{wch:12},{wch:26},{wch:20},{wch:16},{wch:18}];
  window.XLSX.utils.book_append_sheet(wb,ws,'Стока на път');
  var fname='ТеМАХ_Стока_на_път_'+today()+'.xlsx';
  window.XLSX.writeFile(wb,fname);
  toast('✅ Excel изтеглен! ('+transitData.length+' записа)');

  /* Питаме дали да изчистим след експорта */
  if(currentUser.role==='admin'){
    setTimeout(function(){
      if(confirm('Да изчистя ли всички записи след експорта?\n(За да се качи новият месечен файл чисто)')){
        confirmClearTransit();
      }
    },1000);
  }
}

/* ── ДАТА НА ТРАНСФЕР ── */
function tSetTransferDate(id){
  var d=prompt('Дата на трансфер (ГГГГ-ММ-ДД):',today());
  if(!d)return;
  sbPatch('goods_transit','id=eq.'+id,{transfer_date:d,updated_by:currentUser.display_name||currentUser.email,updated_at:new Date().toISOString()})
  .then(function(){loadTransit();});
}

/* ── МОДАЛ ДОБАВЯНЕ/РЕДАКТИРАНЕ ── */
function transitModalHtml(){
  return '<div class="bov" id="transit-modal" onclick="if(event.target===this)closeTransitModal()">'+
    '<div class="bmod" style="width:560px;">'+
    '<div style="font-size:16px;font-weight:700;margin-bottom:16px;" id="transit-modal-title">+ Добави ред</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+
    '<div style="grid-column:1/-1;"><label class="fl">Посока *</label>'+
      '<select class="fi" id="tr-direction" onchange="updateTrStatusOptions()">'+
        '<option value="incoming">📦 Получавам (incoming)</option>'+
        '<option value="transfer">🔄 Трансфер между магазини</option>'+
        '<option value="outgoing">📤 Изпращам (outgoing)</option>'+
      '</select></div>'+
    '<div><label class="fl">Магазин *</label>'+
      '<select class="fi" id="tr-store">'+
        '<option value="">-- Избери --</option>'+
        Object.values(PLANT_INCOMING).filter(function(v,i,a){return a.indexOf(v)===i;}).sort().map(function(s){
          return '<option value="'+esc(s)+'">'+esc(s)+'</option>';
        }).join('')+
      '</select></div>'+
    '<div><label class="fl">Доставчик / Склад</label><input class="fi" id="tr-supplier" placeholder="напр. 5518 Логистичен склад Добрич"></div>'+
    '<div><label class="fl">Документ за покупка</label><input class="fi" id="tr-purchase-doc" placeholder="напр. 4600123456"></div>'+
    '<div><label class="fl">Позиция</label><input class="fi" type="number" id="tr-position" placeholder="10"></div>'+
    '<div><label class="fl">Дата на документ</label><input class="fi" type="date" id="tr-doc-date"></div>'+
    '<div><label class="fl">Материален код</label><input class="fi" id="tr-material-code" placeholder="напр. 96466"></div>'+
    '<div><label class="fl">МЕ поръчка</label><input class="fi" id="tr-unit" placeholder="БР, M2, ПАК..."></div>'+
    '<div style="grid-column:1/-1;"><label class="fl">Описание на материала</label><input class="fi" id="tr-material-name"></div>'+
    '<div><label class="fl">Количество поръчка</label><input class="fi" type="number" step="0.001" id="tr-qty"></div>'+
    '<div><label class="fl">Остатък (недоставено)</label><input class="fi" type="number" step="0.001" id="tr-remaining"></div>'+
    '<div><label class="fl">Дата на трансфер</label><input class="fi" type="date" id="tr-transfer-date"></div>'+
    '<div><label class="fl">Статус</label>'+
      '<select class="fi" id="tr-status">'+
        '<option value="pending">⏳ Не доставена</option>'+
        '<option value="received">✅ Прието</option>'+
        '<option value="rejected">✕ Неприето</option>'+
      '</select></div>'+
    '<div style="grid-column:1/-1;"><label class="fl">Коментар</label><input class="fi" id="tr-comment" placeholder="прието / неприето / изпратена на... / все още не доставена"></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">'+
      '<button onclick="closeTransitModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button onclick="submitTransit()" style="border:none;background:#0f172a;color:#fff;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>'+
    '</div>'+
    '</div></div>';
}

function openTransitAdd(){
  transitEditId=null;
  var m=document.getElementById('transit-modal');if(!m)return;
  document.getElementById('transit-modal-title').textContent='+ Добави ред';
  document.getElementById('tr-direction').value='incoming';
  document.getElementById('tr-store').value=currentUser.store_name||'';
  document.getElementById('tr-supplier').value='';
  document.getElementById('tr-purchase-doc').value='';
  document.getElementById('tr-position').value='';
  document.getElementById('tr-doc-date').value=today();
  document.getElementById('tr-material-code').value='';
  document.getElementById('tr-unit').value='';
  document.getElementById('tr-material-name').value='';
  document.getElementById('tr-qty').value='';
  document.getElementById('tr-remaining').value='';
  document.getElementById('tr-transfer-date').value='';
  updateTrStatusOptions('pending');
  document.getElementById('tr-comment').value='';
  m.classList.add('open');
}

function openTransitEdit(id){
  var r=transitData.find(function(x){return x.id===id;});if(!r)return;
  transitEditId=id;
  var m=document.getElementById('transit-modal');if(!m)return;
  document.getElementById('transit-modal-title').textContent='✏️ Редактирай ред';
  document.getElementById('tr-direction').value=r.direction||'incoming';
  document.getElementById('tr-store').value=r.store_name||'';
  document.getElementById('tr-supplier').value=r.supplier||'';
  document.getElementById('tr-purchase-doc').value=r.purchase_doc||'';
  document.getElementById('tr-position').value=r.position||'';
  document.getElementById('tr-doc-date').value=r.doc_date||'';
  document.getElementById('tr-material-code').value=r.material_code||'';
  document.getElementById('tr-unit').value=r.unit||'';
  document.getElementById('tr-material-name').value=r.material_name||'';
  document.getElementById('tr-qty').value=r.ordered_qty||'';
  document.getElementById('tr-remaining').value=r.remaining_qty||'';
  document.getElementById('tr-transfer-date').value=r.transfer_date||'';
  updateTrStatusOptions(r.status||'pending');
  document.getElementById('tr-comment').value=r.comment||'';
  m.classList.add('open');
}

/* Статус опциите зависят от посоката: outgoing и transfer имат "Изпратена",
   transfer допълнително позволява и "Прието" (двустъпков поток) */
function updateTrStatusOptions(preferredStatus){
  var dirEl=document.getElementById('tr-direction'); if(!dirEl)return;
  var statusEl=document.getElementById('tr-status'); if(!statusEl)return;
  var dir=dirEl.value;
  var opts='<option value="pending">⏳ Не доставена</option>';
  if(dir==='outgoing'){
    opts+='<option value="sent">📤 Изпратена</option>';
  }else if(dir==='transfer'){
    opts+='<option value="sent">📤 Изпратена (чака получателя)</option>';
    opts+='<option value="received">✅ Прието</option>';
  }else{
    opts+='<option value="received">✅ Прието</option>';
  }
  opts+='<option value="rejected">✕ Неприето</option>';
  statusEl.innerHTML=opts;
  var validValues=[].map.call(statusEl.options,function(o){return o.value;});
  var want = preferredStatus!==undefined ? preferredStatus : statusEl.value;
  statusEl.value = validValues.indexOf(want)>=0 ? want : 'pending';
}

function closeTransitModal(){
  var m=document.getElementById('transit-modal');
  if(m)m.classList.remove('open');
  transitEditId=null;
}

function submitTransit(){
  var store=document.getElementById('tr-store').value;
  var material=document.getElementById('tr-material-name').value.trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!material){toast('Въведи описание на материала','#dc2626');return;}
  var dirVal=document.getElementById('tr-direction').value||'incoming';
  var statusVal=document.getElementById('tr-status').value||'pending';
  if(dirVal==='outgoing'&&statusVal==='received'){
    toast('Изпращащ магазин/склад не може да отбележи "Прието" — избери "Изпратена"','#dc2626');
    return;
  }
  var data={
    direction:dirVal,
    store_name:store,
    supplier:document.getElementById('tr-supplier').value.trim(),
    purchase_doc:String(document.getElementById('tr-purchase-doc').value.trim()),
    position:parseInt(document.getElementById('tr-position').value)||null,
    doc_date:document.getElementById('tr-doc-date').value||null,
    material_code:document.getElementById('tr-material-code').value.trim(),
    unit:document.getElementById('tr-unit').value.trim(),
    material_name:material,
    ordered_qty:parseFloat(document.getElementById('tr-qty').value)||null,
    remaining_qty:parseFloat(document.getElementById('tr-remaining').value)||null,
    transfer_date:document.getElementById('tr-transfer-date').value||null,
    status:statusVal,
    comment:document.getElementById('tr-comment').value.trim(),
    updated_by:currentUser.display_name||currentUser.email,
    updated_at:new Date().toISOString()
  };
  /* Същото правило като в tMarkStatus: затворен ред не е „проверен, чака". */
  if(statusVal!=='pending'){ data.reviewed_at=null; data.reviewed_by=null; }
  var req=transitEditId?
    sbPatch('goods_transit','id=eq.'+transitEditId,data):
    sbPost('goods_transit',data);
  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast(transitEditId?'✅ Записано!':'✅ Добавено!');
    closeTransitModal();loadTransit();
  });
}


/* ═══════════════════════════════════════════════════════════════
   ИМПОРТ ОТ SAP EXCEL
═══════════════════════════════════════════════════════════════ */

function openTransitImportModal(){
  if(!canAddTransit()){toast('Нямаш права за импорт','#dc2626');return;}
  var input=document.createElement('input');
  input.type='file';input.accept='.xlsx,.xls';
  input.onchange=function(e){
    var file=e.target.files[0];if(!file)return;
    handleTransitExcelFile(file);
  };
  input.click();
}

function handleTransitExcelFile(file){
  toast('⏳ Зареждане на файла...');
  function doImport(){
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var data=new Uint8Array(e.target.result);
        var wb=window.XLSX.read(data,{type:'array',cellDates:true});
        /* Четем ВСИЧКИ sheet-ове, пропускаме header */
        var allRows=[];
        var detectedFmt='old';
        wb.SheetNames.forEach(function(sheetName){
          var ws=wb.Sheets[sheetName];
          var rows=window.XLSX.utils.sheet_to_json(ws,{header:1,raw:true});
          if(!rows.length)return;
          /* Определяме формата по ПЪРВИЯ ред (header или данни) */
          if(rows[0][0]&&(isNaN(parseInt(String(rows[0][0]).trim()))||typeof rows[0][0]==='string'&&rows[0][0].trim()==='Завод')){
            detectedFmt='new';
            /* Нов формат: пропускаме header */
            if(rows.length>1) allRows=allRows.concat(rows.slice(1));
          }else{
            /* Стар формат: без header */
            allRows=allRows.concat(rows);
          }
        });
        if(!allRows.length){toast('Файлът е празен или невалиден','#dc2626');return;}
        parseTransitRows(allRows, detectedFmt);
      }catch(err){
        toast('Грешка при четене: '+err.message,'#dc2626');
        console.error('Excel error:',err);
      }
    };
    reader.readAsArrayBuffer(file);
  }
  /* XLSX се зарежда от index.html - трябва да е готов */
  if(window.XLSX){
    doImport();
  } else {
    toast('⏳ Зарежда се Excel библиотека...','#2563eb');
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=function(){ setTimeout(doImport,200); };
    s.onerror=function(){
      var s2=document.createElement('script');
      s2.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s2.onload=function(){ setTimeout(doImport,200); };
      s2.onerror=function(){ toast('Грешка: Excel библиотеката не може да се зареди. Опитай с Chrome.','#dc2626'); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  }
}

function parseExcelDate(val){
  if(!val)return null;
  /* Date обект от raw:true */
  if(val instanceof Date){
    if(isNaN(val.getTime()))return null;
    var y=val.getFullYear();
    var mo=String(val.getMonth()+1).padStart(2,'0');
    var d=String(val.getDate()).padStart(2,'0');
    return y+'-'+mo+'-'+d;
  }
  /* Excel serial number */
  if(typeof val==='number'){
    var d=new Date(Math.round((val-25569)*86400*1000));
    return parseExcelDate(d);
  }
  var s=String(val).trim();
  /* DD.MM.YYYY */
  var m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  /* YYYY-MM-DD */
  var m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m2)return m2[0];
  /* M/D/YY или M/D/YYYY */
  var m3=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m3){
    var y=m3[3].length===2?'20'+m3[3]:m3[3];
    return y+'-'+m3[1].padStart(2,'0')+'-'+m3[2].padStart(2,'0');
  }
  return null;
}

function parseExcelNum(val){
  if(val===null||val===undefined||val==='')return null;
  var n=parseFloat(String(val).trim().replace(',','.'));
  return isNaN(n)?null:n;
}

/* Извличаме supplier store от "6508       Кърджали" или "5505 5005 Логистичен склад Търговищ" */
function parseSupplierName(raw){
  if(!raw)return '';
  var s=String(raw).trim();
  /* Вземаме първия код */
  var code=s.split(/\s+/)[0];
  /* Търсим в PLANT_ALL */
  if(PLANT_ALL[code])return PLANT_ALL[code];
  /* Вземаме текста след кода */
  var rest=s.replace(/^\d+\s*/,'').replace(/^\d+\s*/,'').trim();
  /* Почистваме "ТМ " prefix */
  return rest.replace(/^ТМ\s+/,'');
}

var _transitImportRows=[];

function detectSapFormat(rows){
  /* Открива формата автоматично по header или по броя колони */
  if(!rows||!rows.length)return 'old';
  var first=rows[0];
  /* Ако първия ред е header (текст в кол.0) */
  if(first[0]&&isNaN(parseInt(first[0]))){
    /* Нов формат: 18 колони с header */
    /* Колони: Завод(0), Склад(1), Доставчик(2), Документ(3), Позиция(4),
       Вид(5), Търг.орг(6), Снаб.гр(7), Инд(8), История(9),
       Дата(10), Материал(11), Текст(12), Гр.мат(13), Кат(14),
       Кол(15), МЕ(16), Остатък(17) */
    return 'new';
  }
  /* Стар формат: без header, 13 колони */
  return 'old';
}

function parseTransitRows(rows, forceFmt){
  if(!rows||!rows.length){toast('Файлът е празен','#dc2626');return;}
  
  /* Ако форматът е подаден директно - използваме го, иначе го определяме */
  var fmt=forceFmt||detectSapFormat(rows);
  var dataRows=rows;
  /* Ако пак има header ред (текст в кол.0) - пропускаме го */
  if(dataRows.length>0&&dataRows[0][0]&&isNaN(parseInt(String(dataRows[0][0]).trim()))){
    dataRows=dataRows.slice(1);
  }
  
  var parsed=dataRows.map(function(row){
    if(!row[0])return null;
    var plant=String(row[0]||'').trim();
    /* Заводът определя КОЙ ПОЛУЧАВА стоката. Обикновено е с "получаващ"-тип
       код, но SAP подава и "изпращащ" (напр. 6512 Търговище ← 6516 Добрич,
       документ 4600185282 от 14.08.2026) — затова кодът на завода НЕ решава
       сам посоката, виж по-долу. */
    var plantIsOutgoingType = !PLANT_INCOMING[plant] && !!PLANT_OUTGOING[plant];
    var store=PLANT_INCOMING[plant]||PLANT_OUTGOING[plant]||null;
    if(!store)return null; /* Непознат завод */

    var supplierCodeRaw = (fmt==='new'?String(row[2]||''):String(row[1]||'')).trim();
    var supplierFirstCode = supplierCodeRaw.split(/\s+/)[0]||'';
    var supplierResolvedName = PLANT_ALL[supplierFirstCode]||null;

    var direction;
    if(supplierResolvedName && REAL_STORE_NAMES[supplierResolvedName] && supplierResolvedName!==store){
      /* Доставчикът е РЕАЛЕН магазин (не склад/сервиз/администрация),
         различен от получателя — истински трансфер между два магазина,
         независимо дали кодът му е от "получаващ" или "изпращащ" тип
         (SAP го записва различно според документа). Изисква двустъпково
         потвърждение: подателят маркира "Изпратена", после получателят —
         "Прието". Проверява се ПРЕДИ изпращащия код на завода: иначе
         6512 Търговище ← 6516 Добрич ставаше 'outgoing' и получателят
         нямаше бутон "Прието". */
      direction='transfer';
    }else if(plantIsOutgoingType){
      /* Заводът е с "изпращащ" код, а доставчикът НЕ е реален магазин
         (склад/сервиз/администрация или непознат код). */
      direction='outgoing';
    }else{
      direction='incoming';
    }
    
    var supplierRaw, purchase_doc, position, doc_date, 
        material_code, material_name, ordered_qty, unit, remaining_qty;
    
    if(fmt==='new'){
      /* Нов SAP формат — 18 колони с header */
      supplierRaw  = String(row[2]||'').trim();
      purchase_doc = String(row[3]||'').trim();
      position     = parseInt(row[4])||null;
      doc_date     = parseExcelDate(row[10]);
      material_code= String(row[11]||'').trim();
      material_name= String(row[12]||'').trim();
      ordered_qty  = parseExcelNum(row[15]);
      unit         = String(row[16]||'').trim();
      remaining_qty= parseExcelNum(row[17]);
    }else{
      /* Стар формат — 13 колони без header */
      supplierRaw  = String(row[1]||'').trim();
      purchase_doc = String(row[2]||'').trim();
      position     = parseInt(row[3])||null;
      doc_date     = parseExcelDate(row[4]);
      material_code= String(row[5]||'').trim();
      material_name= String(row[6]||'').trim();
      ordered_qty  = parseExcelNum(row[7]);
      unit         = String(row[8]||'').trim();
      remaining_qty= parseExcelNum(row[9]);
    }
    
    return {
      plant:plant, direction:direction, store_name:store,
      supplier:parseSupplierName(supplierRaw),
      purchase_doc:String(purchase_doc||''), position:position, doc_date:doc_date,
      material_code:material_code, material_name:material_name,
      ordered_qty:ordered_qty, unit:unit, remaining_qty:remaining_qty,
      comment:'',     /* Магазините попълват ръчно в портала */
      transfer_date:null,
    };
  }).filter(Boolean).filter(function(r){return r.material_code||r.material_name;});

  _transitImportRows=parsed;

  /* Summary по магазин и посока */
  var summary={};
  parsed.forEach(function(r){
    var key=r.store_name+'|'+r.direction;
    if(!summary[key])summary[key]={store:r.store_name,dir:r.direction,count:0};
    summary[key].count++;
  });

  renderTransitImportPreview(summary,parsed.length);
}

function renderTransitImportPreview(summary,total){
  var old=document.getElementById('transit-import-ov');
  if(old&&old.remove)old.remove();

  var rows=Object.values(summary).sort(function(a,b){
    return a.store.localeCompare(b.store,'bg')||(a.dir>b.dir?1:-1);
  });
  var incoming=rows.filter(function(r){return r.dir==='incoming';});
  var transfer=rows.filter(function(r){return r.dir==='transfer';});
  var outgoing=rows.filter(function(r){return r.dir==='outgoing';});

  var h='<div class="bov open" id="transit-import-ov" onclick="if(event.target===this)closeTransitImport()">'+
    '<div class="bmod" style="width:660px;max-height:85vh;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
      '<div style="font-size:16px;font-weight:700;">📥 Импорт от SAP Excel</div>'+
      '<button onclick="closeTransitImport()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e3a5f;">'+
      'Разпознати <b>'+total+'</b> реда от SAP файла.'+
    '</div>'+

    /* Трансфери между магазини — най-важно да се провери преди импорт */
    '<div style="margin-bottom:14px;">'+
    '<div style="font-size:12px;font-weight:700;color:#c2410c;margin-bottom:8px;">🔄 ТРАНСФЕРИ МЕЖДУ МАГАЗИНИ (получател / брой) — '+transfer.reduce(function(s,r){return s+r.count;},0)+' реда</div>'+
    '<div style="max-height:150px;overflow-y:auto;border:1px solid #fed7aa;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    (transfer.length?transfer.map(function(r){
      return '<tr style="border-bottom:1px solid #fff7ed;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#c2410c;font-weight:600;">'+r.count+'</td></tr>';
    }).join(''):'<tr><td style="padding:10px;color:#94a3b8;text-align:center;">Няма трансфери между магазини</td></tr>')+
    '</table></div></div>'+

    /* Incoming + Outgoing */
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">'+
    '<div>'+
    '<div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">📦 ПОЛУЧАВАМ (от склад) — '+incoming.reduce(function(s,r){return s+r.count;},0)+' реда</div>'+
    '<div style="max-height:200px;overflow-y:auto;border:1px solid #dbeafe;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    incoming.map(function(r){
      return '<tr style="border-bottom:1px solid #eff6ff;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#1e40af;font-weight:600;">'+r.count+'</td></tr>';
    }).join('')+
    '</table></div></div>'+

    /* Outgoing */
    '<div>'+
    '<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px;">📤 ИЗПРАЩАМ (outgoing) — '+outgoing.reduce(function(s,r){return s+r.count;},0)+' реда</div>'+
    '<div style="max-height:200px;overflow-y:auto;border:1px solid #e9d5ff;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    (outgoing.length?outgoing.map(function(r){
      return '<tr style="border-bottom:1px solid #faf5ff;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#7c3aed;font-weight:600;">'+r.count+'</td></tr>';
    }).join(''):'<tr><td style="padding:10px;color:#94a3b8;text-align:center;">Няма outgoing записи</td></tr>')+
    '</table></div></div>'+
    '</div>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="closeTransitImport()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button onclick="confirmTransitImport()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✅ Импортирай '+total+' реда</button>'+
    '</div>'+
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend',h);
}

function closeTransitImport(){
  var ov=document.getElementById('transit-import-ov');
  if(ov&&ov.remove)ov.remove();
  _transitImportRows=[];
}

function confirmTransitImport(){
  var rows=_transitImportRows;
  if(!rows.length){toast('Няма редове за импорт','#dc2626');return;}
  toast('⏳ Импортиране на '+rows.length+' реда ('+Math.ceil(rows.length/25)+' batch-а)...');
  var batches=[];
  for(var i=0;i<rows.length;i+=50)batches.push(rows.slice(i,i+50));
  var inserted=0,failed=0;
  function next(idx){
    if(idx>=batches.length){
      closeTransitImport();
      toast('✅ Импортирани '+inserted+' реда'+(failed?', '+failed+' грешки':''));
      loadTransit();return;
    }
    var batch=batches[idx].map(function(r){
      return {
        direction:r.direction,store_name:r.store_name,supplier:String(r.supplier||''),
        purchase_doc:String(r.purchase_doc||''),position:r.position,doc_date:r.doc_date,
        material_code:String(r.material_code||''),material_name:String(r.material_name||''),
        ordered_qty:r.ordered_qty,unit:r.unit,remaining_qty:r.remaining_qty,
        comment:r.comment,transfer_date:r.transfer_date,
        status:'pending',
        updated_by:currentUser.display_name||currentUser.email,
        updated_at:new Date().toISOString()
      };
    });
    /* Batch INSERT директно - sbPost не поддържа масиви */
    fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/rest/v1/goods_transit',{
      method:'POST',
      headers:{
        'apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body:JSON.stringify(batch)
    }).then(function(r){
      if(r.ok){
        inserted+=batch.length;
        /* Показваме прогрес */
        if(idx%5===0) toast('⏳ Импортирани '+inserted+' от '+rows.length+'...');
      }else{
        r.json().then(function(e){
          console.error('Batch грешка:',JSON.stringify(e));
        }).catch(function(){});
        failed+=batch.length;
      }
      /* Малък delay между batch-овете за да не претоварим Supabase */
      setTimeout(function(){next(idx+1);}, 50);
    }).catch(function(e){console.error('Fetch грешка:',e);failed+=batch.length;setTimeout(function(){next(idx+1);},50);});
  }
  next(0);
}
