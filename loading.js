/* loading.js — Транспорт > Товарни листи (СКЛАДОВА СТРАНА)

   Логистичният склад описва какво товари за кой обект: палет, руло или
   насипна стока, срещу коя покупка и коя стокова разписка изчиства.
   Досега това вървеше на хартия и по телефона — обектът разбираше какво е
   тръгнало към него чак когато камионът дойде.

   Схемата (loading_lists + loading_list_items) е в loading-lists-schema.sql.
   Файлът носи ДВЕТЕ страни: складът пише листа (llCanEdit), обектът отмята
   полученото. Кой изглед се рендира решава llCanEdit() в renderLoadingLists().

   ОТМЯТАНЕТО ЗАТВАРЯ И СТОКОВИЯ ДОКУМЕНТ. Когато всички палети по един
   документ за един обект са получени, редът в „Стока на път" се маркира като
   приет автоматично. Дотук това беше втора ръчна стъпка в друг таб и по
   правило не се правеше — документите стояха pending с месеци.

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

/* ── Магазинска страна ── */
var llStoreLists = [];     /* изпратените/приключените листи с редове за мен */
var llStoreItems = [];     /* МОИТЕ редове от тях (филтърът е в заявката) */
var llCollapsed = {};      /* {listId:true} — свити карти */
/* Редове, чийто палет Е получен, но стоковият документ НЕ се затвори.
   Живее само в тази сесия: колона за това няма. Смисълът е човекът да ВИДИ
   провала веднага, вместо да го открие след седмица в „Стока на път". */
var llDocFailures = {};

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
        pallet_spec: '1'
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

/* ══ ПАЛЕТЪТ Е ФИЗИЧЕСКА ЕДИНИЦА, НЕ ДОКУМЕНТ ══
   Проверка в базата на 03.09.2026: 1987 чакащи реда се събират в 563
   документа (обект+документ), от които 324 — 58% — са с ЕДИН артикул.
   Габрово чака 56 документа, Силистра и Дупница по 50. Никой не кара 56
   палета до Габрово: тези документи се консолидират върху три-четири палета.
   Тоест реалната връзка е МНОГО ДОКУМЕНТА → ЕДИН ПАЛЕТ, а не обратното.

   Схемата не се пипа. Един палет е НЯКОЛКО реда в loading_list_items, които
   споделят store_name + pallet_no; всеки ред носи своя стоков документ.
   Обратната посока (голям документ върху няколко палета) е същите редове с
   различни pallet_no. Интерфейсът групира и показва един палет.

   Следствие, което трябва да се знае: „получено" е на ниво документ-в-палет,
   не на физически палет. Така е нарочно — автозатварянето на стоковия
   документ пита точно това, а бутонът „целия палет" отмята групата наведнъж. */
function llPalletKey(it){
  return JSON.stringify([String(it.store_name || ''), Number(it.pallet_no)]);
}
/* „2" → [2]; „1,3" → [1,3]; „1-3" → [1,2,3]. Едно поле за двете посоки:
   документ на един палет (преобладаващият случай) и документ, разстлан върху
   няколко. Празно или боклук → [1], защото документ без палет няма смисъл. */
function llParsePalletSpec(spec){
  var out = {};
  String(spec == null ? '' : spec).split(',').forEach(function(part){
    part = part.trim();
    if(!part) return;
    var m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if(m){
      var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if(a < 1 || b < 1) return;
      if(a > b){ var t = a; a = b; b = t; }
      /* Таван срещу „1-9999" от изпуснат клавиш: това не е пратка, а авария. */
      if(b - a > 99) b = a + 99;
      for(var i = a; i <= b; i++) out[i] = true;
      return;
    }
    var n = parseInt(part, 10);
    if(!isNaN(n) && n >= 1) out[n] = true;
  });
  var nums = Object.keys(out).map(Number).sort(function(a, b){ return a - b; });
  return nums.length ? nums : [1];
}
/* Редовете, събрани в товарни единици. Палетите се групират по (обект, №);
   рулото и насипът са сами за себе си — там номерация няма. */
function llPalletGroups(items){
  var by = {}, order = [];
  (items || []).forEach(function(it, i){
    var key = (it.kind === 'pallet' && it.pallet_no != null)
      ? llPalletKey(it)
      : JSON.stringify(['single', it.id || ('#' + i)]);
    if(!by[key]){
      by[key] = { key:key, kind:it.kind, store_name:it.store_name,
                  pallet_no:it.pallet_no, pallet_total:it.pallet_total, rows:[] };
      order.push(key);
    }
    by[key].rows.push(it);
  });
  return order.map(function(k){ return by[k]; });
}
/* Плътно преномериране 1..K В РАМКИТЕ НА ОБЕКТА, при запис. „Палет 2 от 5" е
   обещание към конкретния обект, не към целия курс. Въвел ли е складът 1, 2
   и 5, палетите са три — иначе обектът чака пети палет, който не съществува. */
function llRenumberPallets(items){
  var byStore = {};
  (items || []).forEach(function(it){
    if(it.kind !== 'pallet' || it.pallet_no == null) return;
    var s = it.store_name || '';
    if(!byStore[s]) byStore[s] = {};
    byStore[s][Number(it.pallet_no)] = true;
  });
  var map = {};
  Object.keys(byStore).forEach(function(s){
    var nums = Object.keys(byStore[s]).map(Number).sort(function(a, b){ return a - b; });
    map[s] = { total: nums.length, at: {} };
    nums.forEach(function(n, i){ map[s].at[n] = i + 1; });
  });
  (items || []).forEach(function(it){
    if(it.kind !== 'pallet' || it.pallet_no == null) return;
    var m = map[it.store_name || ''];
    if(!m) return;
    it.pallet_no = m.at[Number(it.pallet_no)];
    it.pallet_total = m.total;
  });
  return items;
}

/* ─── ОБОБЩЕНИЯ (СМЯТАТ СЕ ОТ РЕДОВЕТЕ, НЕ СЕ ПАЗЯТ) ────────
   Броят палети/рула/насип НЕ е колона в заглавието нарочно: копие там се
   разминава при първата редакция на ред и не гърми — просто показва грешно
   число, докато някой не го забележи. */
function llCounts(items){
  var c = { pallet:0, roll:0, bulk:0, stores:0, received:0, total:0 };
  var seen = {};
  /* Броят се ТОВАРНИТЕ ЕДИНИЦИ, не редовете: четири документа на един палет
     са един палет. Преди консолидацията двете съвпадаха и това число лъжеше. */
  llPalletGroups(items).forEach(function(g){
    if(c.hasOwnProperty(g.kind)) c[g.kind]++;
  });
  (items || []).forEach(function(it){
    c.total++;
    if(it.received) c.received++;
    if(it.store_name && !seen[it.store_name]){ seen[it.store_name] = 1; c.stores++; }
  });
  return c;
}
/* Обобщение по ОБЕКТ — това гледа шофьорът, преди да тръгне. */
function llSummaryByStore(items){
  var by = {}, order = [];
  var ensure = function(s){
    if(!by[s]){ by[s] = { store:s, pallet:0, roll:0, bulk:0, received:0, total:0 }; order.push(s); }
    return by[s];
  };
  /* Товарните единици — по същата причина като в llCounts(). */
  llPalletGroups(items).forEach(function(g){
    var e = ensure(g.store_name || '—');
    if(e.hasOwnProperty(g.kind)) e[g.kind]++;
  });
  /* Отмятането обаче е по РЕД (документ-в-палет), затова знаменателят е такъв. */
  (items || []).forEach(function(it){
    var e = ensure(it.store_name || '—');
    e.total++;
    if(it.received) e.received++;
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
  if(!llCanEdit()){ llLoadStoreSide(); return; }
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
function llStoreItemsOf(listId){
  return llStoreItems.filter(function(i){ return String(i.list_id) === String(listId); });
}
function llByPosition(a, b){ return (a.position || 0) - (b.position || 0); }

/* ─── ЗАРЕЖДАНЕ: МАГАЗИНСКА СТРАНА ──────────────────────────
   Тръгва се от РЕДОВЕТЕ, не от листите: обектът се интересува от своите
   палети, а един лист обслужва няколко обекта. storeQ() дава филтъра —
   един обект, няколко назначени или никакъв за глобален профил. */
function llLoadStoreSide(){
  sbGet('loading_list_items','order=position.asc'+storeQ()).then(function(items){
    var mine = Array.isArray(items) ? items : [];
    var ids = {}, keys = [];
    mine.forEach(function(i){ if(i.list_id && !ids[i.list_id]){ ids[i.list_id] = 1; keys.push(i.list_id); } });
    if(!keys.length){ llStoreItems = []; llStoreLists = []; renderLoadingLists(); return; }
    /* status=in.(sent,done) е ГЕЙТЪТ: черновата е работен документ на склада
       и обектът няма работа да я вижда — тя още се пренарежда. */
    return sbGet('loading_lists','id=in.('+keys.join(',')+')&status=in.(sent,done)&order=list_date.desc,created_at.desc')
      .then(function(rows){
        llStoreLists = Array.isArray(rows) ? rows : [];
        var ok = {};
        llStoreLists.forEach(function(l){ ok[l.id] = 1; });
        /* Втори филтър от СЪЩИЯ гейт: редовете дойдоха преди листите, тоест
           сред тях има и такива от чернови. */
        llStoreItems = mine.filter(function(i){ return ok[i.list_id]; });
        /* Напълно полученият лист е история — свит по подразбиране. Пипне ли
           го веднъж човек, изборът му се пази (llCollapsed вече има ключ). */
        llStoreLists.forEach(function(l){
          if(llCollapsed[l.id] !== undefined) return;
          var it = llStoreItemsOf(l.id);
          if(it.length && it.every(function(x){ return x.received; })) llCollapsed[l.id] = true;
        });
        renderLoadingLists();
      });
  });
}

/* ─── РЕНДЕР: ДИСПЕЧЕР ──────────────────────────────────────── */
function renderLoadingLists(){
  var wrap = document.getElementById('mod-loading');
  if(!wrap) return;
  var h;
  if(!llCanEdit())          h = llStoreHtml();
  else if(llView === 'edit') h = llEditorHtml();
  else if(llView === 'view') h = llViewHtml();
  else                       h = llListHtml();
  wrap.innerHTML = h;
}
/* ─── ИЗГЛЕД ЗА ОБЕКТА ──────────────────────────────────────── */
function llStoreHtml(){
  var h = '<div class="pg-title">🚛 Товарни листи</div>'+
    '<div class="pg-sub">Какво е натоварено от логистичния склад към обекта.</div>';
  if(!llStoreLists.length){
    var store = (currentUser && currentUser.store_name) || 'вашия обект';
    return h + '<div style="text-align:center;padding:50px 20px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">'+
      '<div style="font-size:40px;">🚛</div>'+
      '<div style="margin-top:8px;font-size:14px;">Няма товари за '+esc(store)+'.</div>'+
    '</div>';
  }
  llStoreLists.forEach(function(l){ h += llStoreCardHtml(l); });
  return h;
}
function llToggleCard(id){
  llCollapsed[id] = !llCollapsed[id];
  renderLoadingLists();
}
/* Отмята обектът получател. Глобалните профили също - те покриват обекти без
   собствен акаунт, а иначе такъв палет не може да бъде отметнат от никого. */
function llCanReceive(it){
  if(!currentUser || !it) return false;
  return currentUser.store_name === it.store_name || isGlobal();
}
function llStoreCardHtml(l){
  var items = llStoreItemsOf(l.id).slice().sort(llByPosition);
  if(!items.length) return '';
  var got = items.filter(function(i){ return i.received; }).length;
  var open = !llCollapsed[l.id];
  var canAny = items.some(function(i){ return !i.received && llCanReceive(i); });

  var h = '<div id="ll-card-'+l.id+'" style="background:#fff;border:1px solid '+(got===items.length?'#bbf7d0':'#e2e8f0')+';border-left:4px solid '+(got===items.length?'#16a34a':'#2563eb')+';border-radius:10px;padding:12px;margin-bottom:10px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'+
      '<div style="font-size:13.5px;font-weight:700;">🚛 '+esc(l.warehouse||'')+' · '+fmtDate(l.list_date)+
        ' <span style="background:'+(got===items.length?'#f0fdf4':'#eff6ff')+';color:'+(got===items.length?'#16a34a':'#1e40af')+';padding:2px 8px;border-radius:20px;font-size:10.5px;">получени '+got+'/'+items.length+'</span> '+
        llStatusBadge(l.status)+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
        (open && canAny ? '<button data-id="'+l.id+'" onclick="llMarkAllReceived(this.dataset.id)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;">✅ Всичко получено</button>' : '')+
        '<button data-id="'+l.id+'" onclick="llToggleCard(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:6px 13px;font-size:12px;cursor:pointer;">'+(open?'▲ Свий':'▼ Разгъни')+'</button>'+
      '</div>'+
    '</div>';
  if(l.comment) h += '<div style="font-size:11.5px;color:#374151;background:#f8fafc;border-radius:6px;padding:5px 8px;margin-top:8px;">💬 '+esc(l.comment)+'</div>';
  if(!open) return h + '</div>';

  h += '<div style="overflow-x:auto;margin-top:10px;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px;"><thead><tr style="background:#f8fafc;">';
  ['Товарна единица','Стокова №','Изчиства','Коментар склад','Моят коментар','Получено'].forEach(function(c){
    h += '<th style="text-align:left;padding:6px 9px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
  });
  h += '</tr></thead><tbody>';
  /* Палетът е една физическа единица с няколко документа — показва се като
     заглавен ред с бутон „целия палет", а документите под него. Иначе човекът
     на рампата вижда четири отделни „палет 2 от 5" и не разбира, че е един. */
  llPalletGroups(items).forEach(function(g){
    var multi = g.rows.length > 1;
    if(multi){
      var gGot = g.rows.filter(function(r){ return r.received; }).length;
      var gCan = g.rows.some(function(r){ return !r.received && llCanReceive(r); });
      h += '<tr data-pallet-group="1" style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">'+
        '<td colspan="5" style="padding:6px 9px;font-weight:700;font-size:11.5px;">'+
          esc(llKindLabel(g.rows[0]))+' · '+g.rows.length+' документа · получени '+gGot+'/'+g.rows.length+
          (g.rows.some(function(r){ return r.partial; })?' '+llPartialBadge():'')+'</td>'+
        '<td style="padding:6px 9px;white-space:nowrap;">'+(gCan
          ? '<button data-id="'+l.id+'" data-p="'+g.pallet_no+'" onclick="llMarkPalletReceived(this.dataset.id,this.dataset.p)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">✅ Целият палет</button>'
          : '')+'</td></tr>';
    }
    g.rows.forEach(function(it){
    var failed = !!llDocFailures[it.id];
    h += '<tr'+(failed?' data-doc-failed="1"':'')+' style="border-bottom:1px solid #f1f5f9;'+(it.received?'background:#f0fdf4;':'')+'">'+
      '<td style="padding:6px 9px;font-weight:600;white-space:nowrap;'+(multi?'padding-left:22px;color:#94a3b8;':'')+'">'+(multi?'↳':esc(llKindLabel(it)))+'</td>'+
      '<td style="padding:6px 9px;font-family:DM Mono,monospace;">'+(it.purchase_doc?esc(it.purchase_doc):'<span style="color:#cbd5e1;">без</span>')+
        (it.partial?' '+llPartialBadge():'')+'</td>'+
      '<td style="padding:6px 9px;">'+(it.clears_doc?'изчиства '+esc(it.clears_doc):'<span style="color:#cbd5e1;">—</span>')+'</td>'+
      '<td style="padding:6px 9px;color:#64748b;">'+esc(it.warehouse_comment||'—')+'</td>'+
      /* Коментарът на обекта остава редактируем и СЛЕД отмятането: разминаването
         често се вижда чак при подреждане на стоката, не при разтоварването. */
      '<td style="padding:6px 9px;">'+(llCanReceive(it)
        ? '<input value="'+escVal(it.store_comment)+'" data-id="'+it.id+'" onchange="llSaveStoreComment(this.dataset.id,this.value)" placeholder="напр. кашонът е мокър" style="width:100%;min-width:130px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;font-size:12px;">'
        : esc(it.store_comment||'—'))+'</td>'+
      '<td style="padding:6px 9px;white-space:nowrap;">'+(it.received
        ? '<span style="color:#16a34a;font-weight:600;">✅ '+esc(it.received_by||'')+(it.received_at?' · '+llFmtStamp(it.received_at):'')+'</span>'
        : (llCanReceive(it)
          ? '<button data-id="'+it.id+'" onclick="llMarkReceived(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">✅ Получено</button>'
          : '<span style="color:#cbd5e1;">—</span>'))+
      (failed?'<div style="margin-top:3px;font-size:10px;color:#b45309;font-weight:600;">⚠️ документът не е затворен</div>':'')+
      '</td></tr>';
    });
  });
  h += '</tbody></table></div></div>';
  return h;
}

/* ─── ОТМЯТАНЕ ──────────────────────────────────────────────── */
function llSaveStoreComment(itemId, val){
  sbPatch('loading_list_items','id=eq.'+itemId,{store_comment: val || null}).then(function(res){
    if(!res.ok){ toast('Коментарът НЕ беше записан: '+sbErrMsg(res),'#dc2626'); return; }
    var it = llStoreItems.find(function(x){ return String(x.id) === String(itemId); });
    if(it) it.store_comment = val;
    toast('✅ Записано');
  });
}
function llMarkReceived(itemId){
  var it = llStoreItems.find(function(x){ return String(x.id) === String(itemId); });
  if(!it || it.received) return;
  if(!llCanReceive(it)){ toast('Само обектът получател може да отмята','#dc2626'); return; }
  var at = new Date().toISOString(), by = llActor();
  sbPatch('loading_list_items','id=eq.'+itemId,{received:true, received_by:by, received_at:at}).then(function(res){
    if(!res.ok){ toast('Грешка при отмятане: '+sbErrMsg(res),'#dc2626'); return; }
    it.received = true; it.received_by = by; it.received_at = at;
    toast('✅ Отмятено');
    llAfterReceive([it]);
  });
}
/* Един физически палет носи няколко документа — човекът на рампата вижда ЕДИН
   палет и го отмята веднъж. Записът обаче остава по документ, защото точно
   това пита автозатварянето. */
function llMarkPalletReceived(listId, palletNo){
  var n = parseInt(palletNo, 10);
  var mine = llStoreItemsOf(listId).filter(function(i){
    return !i.received && i.kind === 'pallet' && Number(i.pallet_no) === n && llCanReceive(i);
  });
  if(!mine.length){ toast('Няма неполучени редове по този палет','#64748b'); return; }
  llPatchReceived(mine, 'палета');
}
function llMarkAllReceived(listId){
  /* САМО редовете на този обект. Един лист обслужва няколко обекта и бутонът
     стои във всяка от картите им - без филтъра единият би отмятал за другия. */
  var mine = llStoreItemsOf(listId).filter(function(i){ return !i.received && llCanReceive(i); });
  if(!mine.length){ toast('Няма неполучени редове','#64748b'); return; }
  llPatchReceived(mine, 'листа');
}
/* Общото тяло на двата групови бутона („целия палет" и „всичко получено").
   Едно място, защото провалът трябва да се докладва еднакво и на двете:
   мълчаливо погълнат провал тук значи палет, който изглежда отметнат, но не е. */
function llPatchReceived(rows, what){
  if(!confirm('Маркирай '+rows.length+' реда от '+what+' като получени?')) return;
  var at = new Date().toISOString(), by = llActor();
  Promise.all(rows.map(function(it){
    return sbPatch('loading_list_items','id=eq.'+it.id,{received:true, received_by:by, received_at:at})
      .then(function(res){ return { it:it, res:res }; });
  })).then(function(all){
    var bad = all.filter(function(r){ return !r.res.ok; });
    var good = all.filter(function(r){ return r.res.ok; });
    good.forEach(function(r){ r.it.received = true; r.it.received_by = by; r.it.received_at = at; });
    if(bad.length){
      console.error('llPatchReceived: '+bad.length+' реда не бяха отметнати', bad[0].res.error);
      toast('⚠️ '+bad.length+' реда НЕ бяха отметнати: '+sbErrMsg(bad[0].res),'#dc2626');
    } else {
      toast('✅ Отметнато');
    }
    llAfterReceive(good.map(function(r){ return r.it; }));
  });
}

/* ─── СЛЕД ОТМЯТАНЕ: ДОКУМЕНТЪТ И ЛИСТЪТ ────────────────────
   Документът, който редът изчиства, е clears_doc, ако е зададен - иначе
   собствената му стокова. Точно затова полето съществува: палет по покупка А
   понякога изчиства покупка Б. */
/* Едно определение на маркера: показва се в реда на магазина, в заглавния
   ред на палета и в прегледа на склада. Три копия щяха да се разминат. */
function llPartialBadge(){
  return '<span data-partial="1" title="Само част от документа тръгва с този товар — той остава чакащ в Стока на път" style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;white-space:nowrap;">частично</span>';
}
function llItemDocKey(it){
  return (it && (it.clears_doc || it.purchase_doc)) || null;
}
function llAfterReceive(items){
  if(!items || !items.length){ renderLoadingLists(); return; }
  var listId = items[0].list_id;
  var seen = {}, docs = [];
  items.forEach(function(it){
    var doc = llItemDocKey(it);
    if(!doc) return;                      /* ред без документ - няма какво да се затваря */
    var k = JSON.stringify([doc, it.store_name || '']);
    if(seen[k]) return;
    seen[k] = 1;
    docs.push({ doc:doc, store:it.store_name || '', listId:it.list_id });
  });
  Promise.all(docs.map(llAutoCloseDoc))
    .then(function(){ return llAutoDoneList(listId); })
    .then(function(){ renderLoadingLists(); });
}
function llAutoCloseDoc(d){
  /* Документът се затваря чак когато ВСИЧКИ негови редове по този лист и за
     този обект са получени. Един палет от пет не значи, че доставката е приета. */
  var siblings = llStoreItemsOf(d.listId).filter(function(i){
    return (i.store_name || '') === d.store && llItemDocKey(i) === d.doc;
  });
  if(!siblings.length || !siblings.every(function(i){ return i.received; })) return Promise.resolve();
  /* Частична пратка: получен е ПАЛЕТЪТ, не документът. Останалото още пътува,
     затова редът в „Стока на път" стои чакащ. Проверката е по КОЙ ДА Е ред на
     документа — складът отмята частичността на цялата пратка, но ред, дошъл от
     по-ранна редакция, може да е останал без отметка. */
  if(siblings.some(function(i){ return i.partial; })){
    toast('📦 Палетът е приет; документ '+d.doc+' остава чакащ (частична пратка)','#d97706');
    return Promise.resolve();
  }
  var f = 'purchase_doc=eq.'+encodeURIComponent(d.doc)+
          '&store_name=eq.'+encodeURIComponent(d.store)+'&status=eq.pending';
  /* Първо ПИТАМЕ има ли какво да се затваря. sbPatch праща
     Prefer: return=minimal без count=exact, тоест res.count е null и "нула
     засегнати реда" е неразличимо от успех - а документ, който вече не е
     pending, не бива да ражда съобщение. */
  return sbGet('goods_transit', f+'&select=id&limit=1').then(function(rows){
    if(!Array.isArray(rows) || !rows.length) return;   /* вече не е pending - тихо */
    /* Същата конвенция като tSetStatus() в transit.js: status + updated_by +
       updated_at. transit.js НЕ се пипа - само се следва. */
    return sbPatch('goods_transit', f, {
      status: 'received',
      updated_by: llActor(),
      updated_at: new Date().toISOString()
    }).then(function(res){
      if(!res.ok){
        /* Палетът Е получен - това е факт и не се отменя заради провалил се
           втори запис. Но документът стои отворен и човекът трябва да го ВИДИ. */
        siblings.forEach(function(i){ llDocFailures[i.id] = true; });
        console.error('llAutoCloseDoc: документът НЕ беше затворен', d.doc, res.error);
        toast('⚠️ Документ '+d.doc+' НЕ беше затворен: '+sbErrMsg(res),'#dc2626');
        return;
      }
      siblings.forEach(function(i){ delete llDocFailures[i.id]; });
      toast('📦 Стоков документ '+d.doc+' е приет в Стока на път');
    });
  });
}
function llAutoDoneList(listId){
  var l = llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  if(!l || l.status === 'done') return Promise.resolve();
  /* Обектът вижда САМО своите редове, затова "всичко получено" се проверява
     със заявка, не от llStoreItems: другите обекти на същия лист са невидими
     тук и листът би се приключвал още на първия готов обект. */
  return sbGet('loading_list_items','list_id=eq.'+listId+'&select=id,received').then(function(rows){
    if(!Array.isArray(rows) || !rows.length) return;
    if(!rows.every(function(r){ return r.received; })) return;
    return sbPatch('loading_lists','id=eq.'+listId,{status:'done', done_at:new Date().toISOString()}).then(function(res){
      if(!res.ok){ toast('⚠️ Листът НЕ беше приключен: '+sbErrMsg(res),'#dc2626'); return; }
      l.status = 'done';
      toast('✅ Товарният лист е приключен');
    });
  });
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
        store_name: it.store_name, warehouse_comment: it.warehouse_comment || '',
        partial: !!it.partial
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
/* Полето е „на кой палет", не „колко палета". Два документа с еднакъв номер за
   един обект са на ЕДИН палет — това е консолидацията. Приема и „1-3" за
   документ, разстлан върху няколко палета. */
function llSetDocPallet(idx, val){
  var d = llPendingDocs[idx];
  if(!d || !llDraft) return;
  var nums = llParsePalletSpec(val);
  /* „1-25" от изпуснат клавиш ражда 25 реда, без нищо да попита. Прагът ПИТА,
     а не ограничава: наистина големи пратки съществуват. При отказ полето се
     връща на предишната стойност — тя идва от d.pallet_spec, затова е
     достатъчно да не я пипаме и да пре-рендираме. */
  if(nums.length > 20 && !confirm('Наистина ' + nums.length + ' палета за един документ?')){
    renderLoadingLists();
    return;
  }
  d.pallet_spec = String(val == null ? '' : val).trim() || '1';
  if(d.checked){ llDropDocRows(d); llMaterializeDoc(d); }
  renderLoadingLists();
}
function llMaterializeDoc(d){
  /* pallet_total се оставя празно: то е „от колко" за ЦЕЛИЯ обект и се знае
     чак когато всички документи са разпределени. Смята се при запис
     (llRenumberPallets), а в редактора се показва от групирането. */
  llParsePalletSpec(d.pallet_spec).forEach(function(n){
    llDraft.items.push({
      id: null, kind: 'pallet', pallet_no: n, pallet_total: null,
      purchase_doc: d.purchase_doc, clears_doc: null,
      store_name: d.store_name, warehouse_comment: '', partial: false,
      _docKey: llDocKey(d)
    });
  });
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
    store_name: (llStores[0] || ''), warehouse_comment: '', partial: false, _docKey: null
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
/* Частичността е свойство на ПРАТКАТА по документа, не на отделния палет:
   документ върху три палета тръгва или цял, или не. Затова отметката слиза на
   всичките му редове наведнъж — иначе llAutoCloseDoc() би виждал един partial
   и два не, а решението му е едно за целия документ. */
function llSetRowPartial(i, checked){
  if(!llDraft || !llDraft.items[i]) return;
  var it = llDraft.items[i];
  var doc = llItemDocKey(it);
  if(!doc){ it.partial = !!checked; renderLoadingLists(); return; }
  var store = it.store_name || '';
  llDraft.items.forEach(function(x){
    if(llItemDocKey(x) === doc && (x.store_name || '') === store) x.partial = !!checked;
  });
  renderLoadingLists();
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
      '<th style="padding:3px 6px;">Палет №</th></tr>';
    llPendingDocs.forEach(function(d, i){
      h += '<tr style="border-top:1px solid #ede9fe;">'+
        '<td style="padding:3px 6px;"><input type="checkbox" data-i="'+i+'" onchange="llToggleDoc(this.dataset.i)"'+(d.checked?' checked':'')+'></td>'+
        '<td style="padding:3px 6px;font-family:DM Mono,monospace;">'+esc(d.purchase_doc)+'</td>'+
        '<td style="padding:3px 6px;">'+esc(d.store_name)+'</td>'+
        '<td style="padding:3px 6px;">'+fmtDate(d.doc_date)+'</td>'+
        '<td style="padding:3px 6px;text-align:right;">'+d.items+'</td>'+
        '<td style="padding:3px 6px;"><input value="'+escVal(d.pallet_spec)+'" data-i="'+i+'" onchange="llSetDocPallet(this.dataset.i,this.value)" title="На кой палет отива този документ. Еднакъв номер за един обект = един палет. Обхват (1-3) за документ върху няколко палета." style="width:62px;border:1px solid #ddd6fe;border-radius:5px;padding:2px 6px;font-size:12px;"></td>'+
        '</tr>';
    });
    h += '</table>';
    h += '<div style="font-size:11px;color:#7c3aed;margin-top:6px;">Стоковата № не се пише на ръка — избира се оттук. '+
      '<b>Палет №</b> е <i>на кой палет</i>: еднакъв номер за един обект значи един палет с няколко документа. '+
      'За документ върху няколко палета — обхват, напр. <code>1-3</code>.</div>';
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
      '<th style="padding:3px 6px;">Коментар склад</th>'+
      '<th style="padding:3px 6px;" title="С този палет тръгва само част от документа">Частично</th>'+
      '<th style="padding:3px 6px;"></th></tr>';
    llDraft.items.forEach(function(it, i){
      var isPallet = it.kind === 'pallet';
      var docOf = llItemDocKey(it);
      /* Отметката е на ДОКУМЕНТА, не на реда: документ върху три палета е
         една пратка и е или частична, или не. Показва се на първия му ред,
         останалите носят само знак, че следват него. */
      var first = docOf ? llDraft.items.findIndex(function(x){
        return llItemDocKey(x) === docOf && (x.store_name||'') === (it.store_name||'');
      }) : -1;
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
        '<td style="padding:3px 6px;text-align:center;white-space:nowrap;">'+(!docOf
          ? '<span style="color:#cbd5e1;" title="Ред без документ — няма какво да остане чакащо">—</span>'
          : (first === i
            ? '<input type="checkbox" data-i="'+i+'" onchange="llSetRowPartial(this.dataset.i,this.checked)"'+(it.partial?' checked':'')+' title="Само част от документа тръгва с този товар — отмятането няма да го затвори в Стока на път">'
            : '<span style="color:#94a3b8;" title="Следва отметката на първия палет от същия документ">'+(it.partial?'✓':'↳')+'</span>'))+'</td>'+
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
      warehouse_comment: it.warehouse_comment || null,
      partial: !!it.partial
    };
  });
}
function llSaveDraft(){
  if(!llDraft) return;
  if(!llDraft.list_date){ toast('Избери дата','#dc2626'); return; }
  if(!llDraft.items.length){ toast('Добави поне един ред','#dc2626'); return; }
  var missing = llDraft.items.filter(function(it){ return !it.store_name; }).length;
  if(missing){ toast('Има ред без обект получател','#dc2626'); return; }
  /* Палетите се преномерират плътно ПРЕДИ записа — иначе „палет 2 от 5"
     обещава на обекта палет, който не съществува. */
  llRenumberPallets(llDraft.items);

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
      '<td style="padding:6px 9px;font-family:DM Mono,monospace;">'+(it.purchase_doc?esc(it.purchase_doc):'<span style="color:#cbd5e1;">без</span>')+
        (it.partial?' '+llPartialBadge():'')+'</td>'+
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
