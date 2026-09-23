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
     push.js              - pushToStores()
     email.js             - sendEmail(), emailWrap()
   Петте стоят ПРЕДИ loading.js (позиции 1, 7, 19, 20 и 21 срещу 23). Тестът
   ги зарежда явно по същата причина. */

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

/* ── Артикули по палет (Пакет В1) ── */
/* Редовете идват с артикулите си наведнъж — PostgREST embed по FK-а
   item_id → loading_list_items(id). Втора заявка item_id=in.(…) би растяла
   с броя на редовете на ВСИЧКИ листи на склада и би ударила тавана на URL-а. */
var LL_ITEM_SELECT = '*,loading_list_products(*)';
var llTransitSnapshot = null; /* max(created_at) на чакащите документи — „снимка към“ */
var llAcTimer = null;         /* debounce на автодопълването */
var llAcSeq = 0;              /* срещу разбъркани отговори: печели последната заявка */
var llAcResults = {};         /* {rowIdx: [каталожни редове]} — последните подсказки */
var llScan = null;            /* {row, inst, pending, choices, busy} — отвореният скенер */
var llScanLibPromise = null;  /* зареждането на html5-qrcode — ЕДНО за сесията */
var llViewProdOpen = {};      /* {itemId:true} — разгънати артикули в прегледа на склада */
var llStoreProdOpen = {};     /* {itemId:true} — разгънати артикули при обекта */
var llDocQuery = '';          /* търсене в „Документи от Стока на път" */
var llListQuery = '';         /* търсене в списъка на листите (складът) */
var llStoreQuery = '';        /* търсене в картите на обекта */
/* Кой раздел гледа магазинът-изпращач: 'in' (към мен) | 'out' (от мен).
   По подразбиране „към мен" — получаването е всекидневната работа, а
   изпращането е изключение. */
var llStoreTab = 'in';
var llDocStore = '';          /* чип по обект; '' = всички */
var llTransitError = false;   /* снимката НЕ се зареди — различно от „няма документи" */
/* Показва ли се блокът „Документи от Стока на път" в редактора. Ключът е
   app_settings 'loading_transit_docs' и се чете при всяко отваряне на
   редактора (llLoadEditorData). Изключено по подразбиране И в базата, И тук:
   снимката е месечна и складът се обърка от документи отпреди седмици.
   НЯМА бутон за превключване — пуска се от SQL Editor, когато решим. */
var llTransitDocsOn = false;
var LL_TRANSIT_PAGE = 1000;   /* PostgREST реже отговора на 1000 реда */

var LL_KINDS = [
  ['pallet', '📦 Палет'],
  ['oversize', '📐 Извънгабаритен'],
  ['roll',   '🧻 Рула'],
  ['bulk',   '🧱 Насип']
];
/* Видовете, които се НОМЕРИРАТ („N от M") и получават опис за печат. Всеки
   има СОБСТВЕНА поредица в рамките на обекта: палет 1 и извънгабаритен 1
   съществуват едновременно и не са едно и също нещо. */
var LL_NUMBERED = ['pallet', 'oversize', 'roll'];
function llIsNumbered(kind){ return LL_NUMBERED.indexOf(kind) >= 0; }
/* Кратката дума за етикета — „палет 2 от 5", „извънгабаритен 1 от 3",
   „руло 2 от 4". */
var LL_KIND_WORD = { pallet: 'палет', oversize: 'извънгабаритен', roll: 'руло' };
/* За извънгабаритния ред „какъв е товарът" е ЕДИНСТВЕНОТО описание: той няма
   артикули по документ и няма стандартен вид. Затова warehouse_comment му е
   задължителен — изискването живее ТУК, не като CHECK в базата: базата не
   може да различи „складът още пише" от „складът приключи, без да напише". */
function llIsOversize(kind){ return kind === 'oversize'; }
function llOversizeNeedsComment(it){
  return !!it && llIsOversize(it.kind) && !String(it.warehouse_comment || '').trim();
}
/* [ключ, етикет, цвят, фон] — един източник за чиповете, баджовете и
   филтъра. Нов статус се добавя тук, не на четири места. */
var LL_STATUSES = [
  ['draft', '📝 Чернова',   '#92400e', '#fffbeb'],
  ['sent',  '📤 Изпратен',  '#1e40af', '#eff6ff'],
  ['done',  '✅ Приключен', '#16a34a', '#f0fdf4'],
  /* Листът е обработен докрай, но поне един ред е отбелязан „неполучен".
     Отделен статус, а не done с бележка: складът търси точно тези листи,
     а в done те биха се смесили с приетите без забележка. */
  ['partial', '⛔ Частично приключен', '#dc2626', '#fef2f2']
];

/* ─── ПРАВА И КОНТЕКСТ ──────────────────────────────────────── */
/* Магазин, който може да ИЗПРАЩА — междускладов трансфер. Изпращачът на
   лист вече не е задължително логистичен склад: loading_lists.warehouse е
   текст и приема име на обект.
   Централният офис и служебните имена отпадат през isReportableStore, а
   admin/logistics минават по другия клон — те избират изпращача явно. */
function llIsSenderStore(){
  if(!currentUser) return false;
  if(isLogisticsWarehouseUser()) return false;
  if(['admin','logistics'].indexOf(currentUser.role) >= 0) return false;
  return isReportableStore(currentUser.store_name);
}
/* Складът пише по СВОИТЕ листи; admin/logistics — по кой да е, но избират
   склада явно; магазинът — по своите, които сам изпраща. Всеки друг е само
   читател.
   ВНИМАНИЕ: това вече НЕ решава кой изглед се рендира. Магазинът има и двете
   страни и renderLoadingLists() пита llIsSenderStore() първо — иначе
   картата за получаване би изчезнала в мига, в който обектът стане изпращач. */
function llCanEdit(){
  if(!currentUser) return false;
  return isLogisticsWarehouseUser() ||
    ['admin','logistics'].indexOf(currentUser.role) >= 0 ||
    llIsSenderStore();
}
/* Кой изпращач гледаме. За складовия потребител и за магазина-изпращач това е
   неговият собствен обект и НЕ се избира — иначе би могъл да пише в чужд лист. */
function llActiveWarehouse(){
  if(isLogisticsWarehouseUser()) return currentUser.store_name;
  if(llIsSenderStore()) return currentUser.store_name;
  return llWarehouse || '';
}
function llActor(){ return currentUser ? (currentUser.display_name || currentUser.email) : ''; }
/* Местна дата за новия товарен лист. Писано, когато today() от shared.js беше
   new Date().toISOString().slice(0,10) (UTC) и в ранните часове по българско
   време (UTC+2/+3) листът тръгваше с вчерашна дата. От 13.09.2026 today() е
   местна (localDateISO) и дава същото — llTodayISO() остава. */
function llTodayISO(){ return toLocalISO(new Date()); }

function llKindLabel(it){
  if(llIsNumbered(it.kind)){
    var w = LL_KIND_WORD[it.kind] || it.kind;
    return (it.pallet_no && it.pallet_total)
      ? w + ' ' + it.pallet_no + ' от ' + it.pallet_total
      : w;
  }
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
/* Количеството, което още чака, е remaining_qty — към 21.09.2026 при 22 от
   270 чакащи реда то е различно от ordered_qty (частично доставени). Копие по
   ordered_qty би обещало на обекта стока, която вече е получил. null значи
   „не е попълнено" — тогава поръчаното. Нула НЕ е null: нищо не остава, и
   копието я пропуска (llDocProductsCopy). */
function llTransitQty(r){
  return (r && r.remaining_qty !== null && r.remaining_qty !== undefined) ? r.remaining_qty : (r ? r.ordered_qty : null);
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
        pallet_spec: '1',
        /* Съдържанието на документа — за да го види складът ПРЕДИ да го
           отметне, и за да се копира в реда при отмятане. */
        products: [],
        _open: false
      };
      out.push(byKey[key]);
    }
    byKey[key].items++;
    if(r.material_code){
      byKey[key].products.push({
        sap_code: String(r.material_code), product_name: r.material_name || '',
        unit: r.unit || '', qty: llTransitQty(r), _pos: parseInt(r.position, 10) || 0
      });
    }
    /* Най-ранната дата на документа — редовете му може да са въведени на
       части, а документът е един. */
    if(r.doc_date && (!byKey[key].doc_date || r.doc_date < byKey[key].doc_date)){
      byKey[key].doc_date = r.doc_date;
    }
  });
  /* position е ТЕКСТ в goods_transit — „10" < „2" лексикографски. */
  out.forEach(function(d){
    d.products.sort(function(a, b){ return a._pos - b._pos; });
    d.products.forEach(function(p){ delete p._pos; });
  });
  /* Най-новите документи отгоре. Заявката вече е подредена по id (нужно за
     страниците), затова редът по дата се прави тук. sort е стабилен —
     документи с една дата остават в реда на въвеждане. */
  out.sort(function(a, b){
    var x = a.doc_date || '', y = b.doc_date || '';
    return x < y ? 1 : (x > y ? -1 : 0);
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
  return JSON.stringify([String(it.store_name || ''), String(it.kind), Number(it.pallet_no)]);
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
    var key = (llIsNumbered(it.kind) && it.pallet_no != null)
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
  /* Ключът е ОБЕКТ + ВИД: „палет 2 от 5" и „извънгабаритен 2 от 3" са две
     различни обещания към един и същ обект. Обща поредица би дала „палет 4
     от 8" при четири палета и четири извънгабаритни. */
  var byKey = {};
  var keyOf = function(it){ return JSON.stringify([it.store_name || '', it.kind]); };
  (items || []).forEach(function(it){
    if(!llIsNumbered(it.kind) || it.pallet_no == null) return;
    var k = keyOf(it);
    if(!byKey[k]) byKey[k] = {};
    byKey[k][Number(it.pallet_no)] = true;
  });
  var map = {};
  Object.keys(byKey).forEach(function(k){
    var nums = Object.keys(byKey[k]).map(Number).sort(function(a, b){ return a - b; });
    map[k] = { total: nums.length, at: {} };
    nums.forEach(function(n, i){ map[k].at[n] = i + 1; });
  });
  (items || []).forEach(function(it){
    if(!llIsNumbered(it.kind) || it.pallet_no == null) return;
    var m = map[keyOf(it)];
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
  /* Отхвърленият извънреден ред не се брои никъде (Пакет Г2). Филтърът е ТУК,
     а не в осемте call site-а — едно копие по-малко, което да се разминава. */
  items = llLiveRows(items);
  var c = { pallet:0, oversize:0, roll:0, bulk:0, stores:0, received:0, missing:0, total:0 };
  var seen = {};
  /* Броят се ТОВАРНИТЕ ЕДИНИЦИ, не редовете: четири документа на един палет
     са един палет. Преди консолидацията двете съвпадаха и това число лъжеше. */
  llPalletGroups(items).forEach(function(g){
    if(c.hasOwnProperty(g.kind)) c[g.kind]++;
  });
  (items || []).forEach(function(it){
    c.total++;
    if(it.received) c.received++;
    if(it.missing)  c.missing++;
    if(it.store_name && !seen[it.store_name]){ seen[it.store_name] = 1; c.stores++; }
  });
  return c;
}
/* Обобщение по ОБЕКТ — това гледа шофьорът, преди да тръгне. */
function llSummaryByStore(items){
  items = llLiveRows(items);   /* същото като в llCounts() */
  var by = {}, order = [];
  var ensure = function(s){
    if(!by[s]){ by[s] = { store:s, pallet:0, oversize:0, roll:0, bulk:0, received:0, missing:0, total:0, products:0, qty:0 }; order.push(s); }
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
    if(it.missing)  e.missing++;
    /* Бройките се сумират НАПРАВО, през мерните единици — така е поискано.
       Смесен палет (бр. + кв.м) дава число, което не е нито едното; колоната
       е за бърз поглед „има ли стока", не за инвентаризация. */
    e.products += (it.products || []).length;
    e.qty = Math.round((e.qty + llProdSum(it.products)) * 1000) / 1000;
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
  /* Магазинът-изпращач зарежда и двете страни: чиповете показват броя на
     получаваните листи и когато гледа „От мен". */
  if(llIsSenderStore() && llStoreTab === 'in'){ llLoadStoreSide(); return; }
  if(!llCanEdit()){ llLoadStoreSide(); return; }
  var wh = llActiveWarehouse();
  if(!wh){
    llView = 'list';
    /* Списъкът на изпращачите иска имената на обектите — иначе селектът
       показва само логистичните складове при първо отваряне. */
    loadReportableStores().then(function(rows){
      llStores = Array.isArray(rows) ? rows : [];
      renderLoadingLists();
    });
    return;
  }
  sbGet('loading_lists','warehouse=eq.'+encodeURIComponent(wh)+'&order=list_date.desc,created_at.desc')
    .then(function(rows){
      llLists = Array.isArray(rows) ? rows : [];
      var ids = llLists.map(function(l){ return l.id; });
      if(!ids.length){ llItems = []; renderLoadingLists(); return; }
      /* Редовете на ВСИЧКИ листи наведнъж — броячите в списъка се смятат от
         тях, а втора заявка на всеки клик би била по-бавна от една обща. */
      return sbGet('loading_list_items','list_id=in.('+ids.join(',')+')&order=position.asc&select='+LL_ITEM_SELECT)
        .then(function(items){
          llItems = llNormProducts(Array.isArray(items) ? items : []);
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
/* PostgREST връща артикулите под ключа loading_list_products. Тук стават
   it.products, подредени по position — embed-ът не гарантира ред, а описът
   на палета се печата в реда, в който складът ги е въвел. Суровият ключ се
   маха, за да няма два източника за едно и също нещо в паметта. */
function llNormProducts(items){
  (items || []).forEach(function(it){
    var raw = it.loading_list_products;
    delete it.loading_list_products;
    if(!Array.isArray(it.products)) it.products = Array.isArray(raw) ? raw.slice().sort(llByPosition) : [];
  });
  return items;
}

/* ─── ЗАРЕЖДАНЕ: МАГАЗИНСКА СТРАНА ──────────────────────────
   Тръгва се от РЕДОВЕТЕ, не от листите: обектът се интересува от своите
   палети, а един лист обслужва няколко обекта. storeQ() дава филтъра —
   един обект, няколко назначени или никакъв за глобален профил. */
function llLoadStoreSide(){
  sbGet('loading_list_items','order=position.asc&select='+LL_ITEM_SELECT+storeQ()).then(function(items){
    var mine = llNormProducts(Array.isArray(items) ? items : []);
    var ids = {}, keys = [];
    mine.forEach(function(i){ if(i.list_id && !ids[i.list_id]){ ids[i.list_id] = 1; keys.push(i.list_id); } });
    if(!keys.length){ llStoreItems = []; llStoreLists = []; renderLoadingLists(); return; }
    /* status=in.(sent,done,partial) е ГЕЙТЪТ: черновата е работен документ на
       склада и обектът няма работа да я вижда — тя още се пренарежда.
       'partial' ВЛИЗА в списъка: приключеният с липси лист е точно този, който
       обектът после търси, за да покаже кога и какво е заявил като липсващо.
       Изпадне ли оттук, собствената му карта изчезва в мига на приключването. */
    return sbGet('loading_lists','id=in.('+keys.join(',')+')&status=in.(sent,done,partial)&order=list_date.desc,created_at.desc')
      .then(function(rows){
        llStoreLists = Array.isArray(rows) ? rows : [];
        var ok = {};
        llStoreLists.forEach(function(l){ ok[l.id] = 1; });
        /* Втори филтър от СЪЩИЯ гейт: редовете дойдоха преди листите, тоест
           сред тях има и такива от чернови. */
        llStoreItems = mine.filter(function(i){ return ok[i.list_id]; });
        /* Приключеният лист е история — свит по подразбиране. Пипне ли го
           веднъж човек, изборът му се пази (llCollapsed вече има ключ).
           „Приключен" е по СТАТУСА на листа, не по редовете на този обект:
           лист, по който всеки ред е обработен, но който още чака „🏁 Приключи
           приемането", има какво да се прави в него — свиването го скрива
           заедно с единствения бутон, който го придвижва. Дотук условието
           беше „всички received" и точно този случай не съществуваше. */
        llStoreLists.forEach(function(l){
          if(llCollapsed[l.id] !== undefined) return;
          if(l.status !== 'done' && l.status !== 'partial') return;
          var it = llStoreItemsOf(l.id);
          if(it.length && it.every(function(x){ return x.received || x.missing; })) llCollapsed[l.id] = true;
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
  if(llIsSenderStore()){
    /* Магазинът е и получател, и изпращач. Двата въпроса са различни —
       „какво идва при мен" и „какво пращам аз" — и не се побират в един
       екран, затова раздели, а не смесен списък. */
    h = llStoreTabsHtml() + (llStoreTab === 'out' ? llWarehouseSideHtml() : llStoreBodyHtml());
  } else if(!llCanEdit()){
    h = llStoreHtml();
  } else {
    h = llWarehouseSideHtml();
  }
  wrap.innerHTML = h;
  /* Формата за извънреден ред живее ИЗВЪН #mod-loading (на body), затова не
     се обновява от реда горе. Помощниците на артикулите (llAddProduct,
     llRemoveProduct, llToggleProducts) викат renderLoadingLists() — без реда
     долу добавеният артикул не се появява в модала. */
  if(llStoreAdd) llStoreAddRender();
}
/* Складовият изглед — трите му състояния на едно място, защото вече се вика
   от два пътя: чистия склад и раздела „От мен" на магазина. */
function llWarehouseSideHtml(){
  if(llView === 'edit') return llEditorHtml();
  if(llView === 'view') return llViewHtml();
  return llListHtml();
}
/* Чиповете на магазина-изпращач. Заглавието е ТУК, а не в двете тела, за да
   не се удвоява — llStoreHtml() го носи само когато е сам на екрана. */
function llStoreTabsHtml(){
  var chip = function(key, label){
    var on = llStoreTab === key;
    return '<button data-t="'+key+'" onclick="llSetStoreTab(this.dataset.t)" '+
      'style="border:1px solid '+(on?'#2563eb':'#e2e8f0')+';background:'+(on?'#eff6ff':'#fff')+
      ';color:'+(on?'#1e40af':'#475569')+';border-radius:20px;padding:5px 14px;font-size:12.5px;'+
      'font-weight:'+(on?'700':'500')+';cursor:pointer;">'+label+'</button>';
  };
  return '<div class="pg-title">🚛 Товарни листи</div>'+
    '<div class="pg-sub">Какво идва при обекта и какво обектът изпраща.</div>'+
    '<div data-ll-store-tabs="1" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">'+
      chip('in','📥 Към мен')+chip('out','📤 От мен')+'</div>';
}
function llSetStoreTab(t){
  llStoreTab = (t === 'out') ? 'out' : 'in';
  /* Връщане в списъка при смяна: редакторът на чужд раздел няма смисъл и
     при обратно превключване би се отворил насред недовършена чернова. */
  if(llStoreTab === 'in'){ llView = 'list'; }
  loadLoadingLists();
}

/* ─── ИЗГЛЕД ЗА ОБЕКТА ──────────────────────────────────────── */
/* При обекта се търси по изходящ № (по неговите редове), по склад и по дата.
   Датата се сверява И в двата вида — 23.09.2026 и 2026-09-23 — защото на
   екрана пише първото, а човек често пише второто. */
function llStoreMatches(l, q){
  var t = String(q == null ? '' : q).trim().toLowerCase();
  if(!t) return true;
  if(String(l.warehouse || '').toLowerCase().indexOf(t) >= 0) return true;
  if(String(l.list_date || '').toLowerCase().indexOf(t) >= 0) return true;
  if(String(fmtDate(l.list_date) || '').toLowerCase().indexOf(t) >= 0) return true;
  return llStoreItemsOf(l.id).some(function(i){
    return String(i.purchase_doc || '').toLowerCase().indexOf(t) >= 0;
  });
}
function llSetStoreQuery(v){
  llStoreQuery = String(v == null ? '' : v);
  renderLoadingLists();
  var el = document.getElementById('ll-store-q');
  if(el){
    if(el.focus) el.focus();
    try { var n = el.value.length; el.setSelectionRange(n, n); } catch(e){}
  }
}
function llStoreHtml(){
  return '<div class="pg-title">🚛 Товарни листи</div>'+
    '<div class="pg-sub">Какво е натоварено към обекта.</div>'+
    llStoreBodyHtml();
}
/* Само тялото — без заглавие. Разделено, защото магазинът-изпращач слага
   своето заглавие веднъж, над чиповете. */
function llStoreBodyHtml(){
  var h = '';
  if(!llStoreLists.length){
    var store = (currentUser && currentUser.store_name) || 'вашия обект';
    return h + '<div style="text-align:center;padding:50px 20px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">'+
      '<div style="font-size:40px;">🚛</div>'+
      '<div style="margin-top:8px;font-size:14px;">Няма товари за '+esc(store)+'.</div>'+
    '</div>';
  }
  /* Полето се показва ВИНАГИ, щом има поне един лист — включително когато
     търсенето е отсяло всичко (правило 11): иначе няма как да се изчисти. */
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">'+
    '<input id="ll-store-q" value="'+llAttr(llStoreQuery)+'" placeholder="Търси: изходящ №, склад, дата" autocomplete="off" '+
      'oninput="llSetStoreQuery(this.value)" style="flex:1 1 240px;min-width:180px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:13px;">'+
    (llStoreQuery ? '<button onclick="llSetStoreQuery(\'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 12px;font-size:12.5px;cursor:pointer;">✕ Изчисти</button>' : '')+
    '</div>';
  var shown = llStoreLists.filter(function(l){ return llStoreMatches(l, llStoreQuery); });
  if(!shown.length){
    return h + '<div style="text-align:center;padding:40px 20px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">'+
      'Нищо не отговаря на „'+esc(llStoreQuery)+'".</div>';
  }
  shown.forEach(function(l){ h += llStoreCardHtml(l); });
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
/* Редът е „обработен", когато обектът се е произнесъл по него — получено ИЛИ
   неполучено. Неотметнатият ред НЕ е трето състояние: той е чакащ. Две от
   местата долу (броячът и „Приключи приемането") питат точно това. */
function llHandled(it){ return !!(it && (it.received || it.missing)); }
/* Може ли обектът още да се произнесе по този ред. Едно определение — иначе
   бутоните на реда и гейтът на „Приключи приемането" се разминават и
   бутонът остава сив при нула видими действия. */
function llOpenForStore(it){ return !llHandled(it) && llCanReceive(it); }

/* ══════════════════════════════════════════════════════════
   ИЗВЪНРЕДЕН РЕД ОТ ПОЛУЧАТЕЛЯ (Пакет Г2)

   На рампата пристига палет, който го няма в листа — или в кашона има стока
   над описаната. Дотук обектът нямаше къде да го запише: отмяташе каквото е
   описано и звънеше по телефона. Сега добавя ред САМ, с коментар защо, а
   редът чака одобрение.

   ФАКТЪТ И РАЗРЕШЕНИЕТО СА РАЗЛИЧНИ НЕЩА. Редът се записва с received=true
   веднага: стоката Е получена, това не подлежи на одобрение. Одобрява се
   дали влиза в ДОКУМЕНТИТЕ на листа — броячи, печат, PDF, писмо.

   КОЙ РЕШАВА: складът-изпращач (акаунтът на самия склад) ИЛИ регионалният
   на обекта-получател, плюс admin. Първото решение е окончателно — PATCH-ът
   носи филтър approval_status=eq.pending, тоест вторият натиснал получава
   „вече е решено" вместо да презапише чуждото решение.

   НЕ Е НАПРАВЕНО НАРОЧНО: напомняне за pending ред, който стои повече от
   24 часа. Темата loading_lists_pending в bulletin-notify гледа само
   НЕОТМЕТНАТИТЕ редове и не знае нищо за одобренията; това е отделно
   решение, не пропуск. */

/* Състоянието на реда — едно определение за всички места. */
function llRowRejected(it){ return !!it && it.approval_status === 'rejected'; }
function llRowPending(it){ return !!it && it.approval_status === 'pending'; }
/* Отхвърленият ред НЕ СЪЩЕСТВУВА за листа: не се брои, не се печата, не влиза
   в PDF-а и в писмото. Остава видим на екрана, зачертан, за да се знае какво
   е било поискано и отказано — изтриването му би изтрило и обяснението. */
function llRowCounts(it){ return !llRowRejected(it); }
function llLiveRows(items){ return (items || []).filter(llRowCounts); }

/* text[] от PostgREST идва като масив. currentUser обаче минава през
   auth-login и в по-стари сесии е носил Postgres литерала {"А","Б"} като
   низ — затова и двете форми. */
function llParseStores(v){
  if(Array.isArray(v)) return v;
  if(typeof v === 'string' && v.length > 2){
    return v.replace(/^\{|\}$/g, '').split(',').map(function(s){
      return s.trim().replace(/^"|"$/g, '');
    }).filter(function(s){ return !!s; });
  }
  return [];
}
/* Обектите, които ТОЗИ човек покрива като регионален. Чете се ПРАВО от
   currentUser.assigned_stores, не през assignedStores(): онази функция връща
   [собствения обект] за всеки, който не е admin/accounting/logistics. Днес
   всичките шестима регионални са accounting или admin, тоест двете съвпадат —
   но направи ли се регионален с роля manager, assignedStores() мълчаливо би
   му дало собствения обект: щеше да одобрява за обекта, в който седи, и да не
   може за своя регион. */
function llMyRegionStores(){
  if(!currentUser || !currentUser.is_regional) return [];
  return llParseStores(currentUser.assigned_stores);
}
/* Складът-изпращач, регионалният на обекта-получател или admin. Ролята
   „logistics" сама по себе си НЕ одобрява: тя пише листи за кой да е склад,
   а решението е на изпращача или на регионалния. */
function llCanApprove(list, row){
  if(!currentUser || !list || !row) return false;
  if(currentUser.role === 'admin') return true;
  var wh = list.warehouse || '';
  if(wh && currentUser.store_name === wh) return true;
  return llMyRegionStores().indexOf(row.store_name) >= 0;
}
/* Маркерът на реда — един за картата на обекта и за прегледа на склада. */
function llApprovalBadge(it){
  if(!it || !it.added_by_store) return '';
  if(llRowPending(it)){
    return '<span data-ll-appr="pending" title="Добавен от обекта — чака одобрение" style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;white-space:nowrap;">⏳ чака одобрение</span>';
  }
  if(llRowRejected(it)){
    return '<span data-ll-appr="rejected" title="Отхвърлен — не влиза в документите на листа" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;white-space:nowrap;">⛔ отхвърлен</span>';
  }
  return '<span data-ll-appr="approved" title="Добавен от обекта и одобрен" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;white-space:nowrap;">➕ добавен от обекта</span>';
}
/* Решението с кой и кога — под маркера, на едно място. */
function llApprovalNote(it){
  if(!it || !it.added_by_store || llRowPending(it)) return '';
  var who = it.approval_by || '—';
  return '<div style="font-size:10px;color:#64748b;margin-top:2px;">'+
    (llRowRejected(it) ? 'отхвърлил: ' : 'одобрил: ')+esc(who)+
    (it.approval_at ? ' · '+llFmtStamp(it.approval_at) : '')+
    (it.approval_comment ? ' · '+esc(it.approval_comment) : '')+'</div>';
}

/* ─── ДОБАВЯНЕ ОТ ОБЕКТА ─────────────────────────────────────
   Формата за артикули е СЪЩАТА като в редактора на склада (Пакет В1):
   сканиране, автодопълване, проверка на дублирани кодове. За да се ползва без
   копие, новият ред временно живее в llDraft — помощниците там работят върху
   llDraft.items[i]. Предишната чернова се пази и се връща при затваряне. */
var llStoreAdd = null;   /* {listId, store, savedDraft, savedView} */

function llStoreAddOpen(listId){
  var l = llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  if(!l){ toast('Товарният лист не е намерен','#dc2626'); return; }
  if(l.status !== 'sent'){ toast('Листът вече е приключен','#d97706'); return; }
  var mine = llStoreItemsOf(listId);
  var store = (currentUser && currentUser.store_name) || '';
  /* Глобален профил вижда няколко обекта в един лист — тогава обектът се
     взима от редовете на картата, а не от собствения му store_name. При
     повече от един обект в картата не е ясно за кого е редът и не се гадае. */
  var seen = {};
  mine.forEach(function(i){ seen[i.store_name || ''] = 1; });
  var keys = Object.keys(seen);
  if(keys.length === 1) store = keys[0];
  else if(keys.length > 1 && keys.indexOf(store) < 0){
    toast('Картата е за няколко обекта — не е ясно за кой е редът','#dc2626');
    return;
  }
  if(!store){ toast('Не е ясно за кой обект е редът','#dc2626'); return; }

  llStoreAdd = { listId: listId, store: store, savedDraft: llDraft, savedView: llView };
  llDraft = { list_date: l.list_date, executed_by: '', comment: '', _storeAdd: true, items: [{
    id: null, kind: 'pallet', pallet_no: null, pallet_total: null,
    purchase_doc: null, clears_doc: null, store_name: store,
    warehouse_comment: '', store_comment: '', partial: false,
    products: [], _prodOpen: true
  }] };
  llStoreAddRender();
}
function llStoreAddClose(){
  if(!llStoreAdd) return;
  llDraft = llStoreAdd.savedDraft;
  llView = llStoreAdd.savedView || llView;
  llStoreAdd = null;
  llScanClose();
  var m = document.getElementById('ll-add-modal');
  if(m && m.parentNode) m.parentNode.removeChild(m);
}
function llStoreAddRender(){
  if(!llStoreAdd || !llDraft || !llDraft.items[0]) return;
  var it = llDraft.items[0];
  var m = document.getElementById('ll-add-modal');
  if(!m){
    m = document.createElement('div');
    m.id = 'll-add-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:380;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow-y:auto;';
    document.body.appendChild(m);
  }
  m.innerHTML =
    '<div style="width:100%;max-width:640px;background:#fff;border-radius:12px;padding:14px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">'+
        '<div style="font-size:15px;font-weight:700;">➕ Извънреден ред · '+esc(llStoreAdd.store)+'</div>'+
        '<button onclick="llStoreAddClose()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 13px;font-size:13px;cursor:pointer;">✕</button>'+
      '</div>'+
      '<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:10px;">'+
        'Редът се записва като ПОЛУЧЕН веднага, но влиза в документите на листа чак след одобрение от склада или от регионалния мениджър.</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">'+
        '<select id="ll-add-kind" onchange="llStoreAddField(\'kind\',this.value)" style="border:1px solid #cbd5e1;border-radius:6px;padding:7px 8px;font-size:13px;">'+
          LL_KINDS.map(function(k){ return '<option value="'+k[0]+'"'+(it.kind===k[0]?' selected':'')+'>'+k[1]+'</option>'; }).join('')+
        '</select>'+
        '<input id="ll-add-doc" value="'+llAttr(it.purchase_doc)+'" placeholder="Изходящ № (по желание)" '+
          'oninput="llStoreAddField(\'purchase_doc\',this.value)" style="flex:1 1 180px;border:1px solid #cbd5e1;border-radius:6px;padding:7px 8px;font-size:13px;font-family:DM Mono,monospace;">'+
      '</div>'+
      /* esc('') връща „—" — за textarea трябва ПРАЗНО, иначе полето тръгва с тире. */
      '<textarea id="ll-add-comment" placeholder="Какво и защо — задължително (напр. „дойде палет с плочки, който не е описан“)" '+
        'oninput="llStoreAddField(\'store_comment\',this.value)" style="width:100%;box-sizing:border-box;min-height:64px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font-size:13px;margin-bottom:8px;">'+(it.store_comment ? esc(it.store_comment) : '')+'</textarea>'+
      /* СЪЩИЯТ блок като в редактора на склада — сканиране, автодопълване, проверки. */
      llProductsBlockHtml(it, 0)+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">'+
        '<button onclick="llStoreAddClose()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
        '<button id="ll-add-submit" onclick="llStoreAddSubmit()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">➕ Добави реда</button>'+
      '</div>'+
    '</div>';
}
function llStoreAddField(field, val){
  if(!llStoreAdd || !llDraft || !llDraft.items[0]) return;
  llDraft.items[0][field] = (val === '') ? (field === 'kind' ? 'pallet' : '') : val;
}
function llStoreAddSubmit(){
  if(!llStoreAdd || !llDraft || !llDraft.items[0]) return Promise.resolve(false);
  var it = llDraft.items[0];
  var comment = String(it.store_comment || '').trim();
  if(!comment){
    /* Без обяснение редът е безполезен: одобряващият няма по какво да реши. */
    toast('Опиши какво и защо — коментарът е задължителен','#dc2626');
    var c = document.getElementById('ll-add-comment');
    if(c && c.focus) c.focus();
    return Promise.resolve(false);
  }
  var listId = llStoreAdd.listId, store = llStoreAdd.store;
  var products = (it.products || []).slice();
  var kind = it.kind || 'pallet';
  var doc = String(it.purchase_doc || '').trim();
  var at = new Date().toISOString(), by = llActor();
  /* Позицията е след последния ред на ЦЕЛИЯ лист, не на моите: обектът вижда
     само своите редове, а position е уникална в рамките на листа. */
  return sbGet('loading_list_items','list_id=eq.'+listId+'&select=position&order=position.desc&limit=1').then(function(rows){
    var last = (Array.isArray(rows) && rows.length) ? (Number(rows[0].position) || 0) : 0;
    return sbPostReturn('loading_list_items', {
      list_id: listId, position: last + 1,
      kind: kind,
      /* Без номер: „палет 3 от 5" е обещание на СКЛАДА за курса и добавен
         отвън ред не бива да го разваля. */
      pallet_no: null, pallet_total: null,
      purchase_doc: doc || null, clears_doc: null,
      store_name: store, warehouse_comment: null,
      store_comment: comment, partial: false,
      /* Стоката Е получена — това е факт, не искане. */
      received: true, received_by: by, received_at: at,
      missing: false,
      added_by_store: true, approval_status: 'pending'
    });
  }).then(function(res){
    if(!res.ok || !res.row || !res.row.id){
      toast('Редът НЕ беше добавен: '+sbErrMsg(res),'#dc2626');
      return false;
    }
    var newId = res.row.id;
    return llWriteStoreRowProducts(newId, products).then(function(){
      llStoreAddClose();
      toast('➕ Редът е добавен и чака одобрение');
      /* Известието е СЛЕД записа: провалът му не отменя реда. */
      llNotifyRowAdded(listId, store, kind, doc, comment, products);
      loadLoadingLists();
      return true;
    });
  });
}
/* Артикулите на НОВИЯ ред. НЕ през llWriteProducts: той съпоставя редовете на
   листа по position спрямо llDraft.items и с една-единствена чернова би
   закачил артикулите за ПЪРВИЯ ред на листа, не за новия. */
function llWriteStoreRowProducts(itemId, products){
  if(!products || !products.length) return Promise.resolve(true);
  var rows = products.map(function(pr, j){
    return { item_id: itemId, position: j + 1, sap_code: pr.sap_code,
             product_name: pr.product_name, unit: pr.unit || null, qty: pr.qty,
             cartons: (pr.cartons === null || pr.cartons === undefined || pr.cartons === '') ? null : pr.cartons };
  });
  return sbPost('loading_list_products', rows).then(function(res){
    if(!res.ok){
      /* Редът е записан, артикулите не са — казва се на глас, вместо да
         изглежда като палет без съдържание. */
      llDocFailures[itemId] = true;
      console.error('llWriteStoreRowProducts', res.error);
      toast('⚠️ Редът е добавен, но артикулите НЕ бяха записани: '+sbErrMsg(res),'#dc2626');
      return false;
    }
    return true;
  });
}

/* ─── РЕШЕНИЕТО ──────────────────────────────────────────────
   PATCH с филтър approval_status=eq.pending и Prefer: count=exact.
   PostgREST връща броя засегнати редове в Content-Range, тоест нула значи
   „някой вече е решил". Обикновеният sbPatch не върши работа тук: той праща
   return=minimal без count и не може да различи „нула засегнати" от успех —
   вторият натиснал би видял „одобрено" за ред, който е отхвърлен.
   НЕ се ползва return=representation (виж бележката при sbDelete в
   shared.js): то иска SELECT право върху всяка върната колона. */
function llPatchIfPending(itemId, body){
  var url = API + '/loading_list_items?id=eq.' + encodeURIComponent(itemId) + '&approval_status=eq.pending';
  return fetch(url, {
    method: 'PATCH',
    headers: Object.assign({}, H, { 'Prefer': 'return=minimal,count=exact' }),
    body: JSON.stringify(body)
  }).then(function(r){
    if(!r.ok) return { ok:false, rows:0, error:'HTTP ' + r.status };
    /* count:null значи „не можах да разбера" (отрязан хедър) — тогава се
       приема, че е минало, вместо да се измисля нула. */
    var n = sbCountFromRange(r);
    return { ok:true, rows: (n === null ? 1 : n) };
  }).catch(function(e){ return { ok:false, rows:0, error:String((e && e.message) || e) }; });
}
function llApproveBtnsHtml(list, row){
  if(!llCanApprove(list, row) || !llRowPending(row)) return '';
  /* Коментарът е ПОЛЕ, не prompt(): prompt блокира страницата, а в jsdom
     изобщо го няма. Същият модел като „Неполучен целия палет" в Пакет А. */
  return '<div data-ll-approve="'+escAttr(row.id)+'" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:5px;align-items:center;">'+
    '<input id="ll-apr-'+escAttr(row.id)+'" placeholder="коментар (задължителен при отхвърляне)" style="flex:1 1 170px;min-width:140px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 7px;font-size:11.5px;">'+
    '<button data-l="'+escAttr(list.id)+'" data-i="'+escAttr(row.id)+'" onclick="llDecideRow(this.dataset.l,this.dataset.i,1)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">✅ Одобри</button>'+
    '<button data-l="'+escAttr(list.id)+'" data-i="'+escAttr(row.id)+'" onclick="llDecideRow(this.dataset.l,this.dataset.i,0)" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">⛔ Отхвърли</button>'+
    '</div>';
}
/* ЕДНО място за решението — прегледът на склада и картата на обекта го викат
   еднакво. Две копия щяха да се разминат по това кой какво записва. */
function llDecideRow(listId, itemId, approve){
  var list = llLists.find(function(x){ return String(x.id) === String(listId); }) ||
             llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  var row = llItems.concat(llStoreItems).find(function(x){ return String(x.id) === String(itemId); });
  if(!list || !row) return Promise.resolve(false);
  if(!llCanApprove(list, row)){ toast('Нямаш права да решаваш по този ред','#dc2626'); return Promise.resolve(false); }
  if(!llRowPending(row)){ toast('Редът вече е решен','#d97706'); return Promise.resolve(false); }
  var inp = document.getElementById('ll-apr-' + itemId);
  var comment = inp ? String(inp.value == null ? '' : inp.value).trim() : '';
  if(!approve && !comment){
    /* Отхвърляне без причина е безполезно за обекта — стоката вече е при него
       и той трябва да знае какво да я прави. */
    toast('Отхвърлянето иска коментар','#d97706');
    if(inp && inp.focus) inp.focus();
    return Promise.resolve(false);
  }
  return llPatchIfPending(itemId, {
    approval_status: approve ? 'approved' : 'rejected',
    approval_by: llActor(),
    approval_at: new Date().toISOString(),
    approval_comment: comment || null
  }).then(function(res){
    if(!res.ok){ toast('Решението НЕ беше записано: '+(res.error || ''),'#dc2626'); return false; }
    if(!res.rows){
      toast('Редът вече е решен от някой друг','#d97706');
      loadLoadingLists();
      return false;
    }
    toast(approve ? '✅ Редът е одобрен' : '⛔ Редът е отхвърлен', approve ? undefined : '#dc2626');
    llNotifyRowDecided(list, row, approve, comment);
    /* Решението може да е било последното, което е пречело листът да се
       затвори — затова проверката тръгва веднага, не на следващото отмятане. */
    return llAutoDoneList(listId).then(function(){
      loadLoadingLists();
      return true;
    });
  });
}

/* ─── ИЗВЕСТИЯ ПО ИЗВЪНРЕДНИЯ РЕД ───────────────────────────
   Push-ът отива САМО до склада: регионалните седят в „Централен офис" и push
   по обект там би отишъл до целия централен офис. До тях — имейл. */
function llRegionalEmails(store){
  if(!store) return Promise.resolve([]);
  return sbGet('users','active=eq.true&is_regional=eq.true&select=email,assigned_stores').then(function(rows){
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function(u){
      if(!u.email) return;
      if(llParseStores(u.assigned_stores).indexOf(store) < 0) return;
      if(out.indexOf(u.email) < 0) out.push(u.email);
    });
    return out;
  }).catch(function(){ return []; });
}
function llAddedRowHtmlFor(list, store, kind, doc, comment, products){
  var body = '<h2 style="color:#92400e;margin:0 0 4px;font-size:19px;">➕ Извънреден ред от обекта</h2>'+
    '<p style="color:#64748b;font-size:13px;margin:0 0 16px;"><b>'+esc(store)+
      '</b> е добавил ред към товарния лист и той <b>чака одобрение</b>.</p>'+
    llMailMeta(list);
  body += '<table style="width:100%;border-collapse:collapse;"><tr>'+
    '<th '+LL_MAIL_TH+'>Товарна единица</th><th '+LL_MAIL_TH+'>Изходящ №</th>'+
    '<th '+LL_MAIL_TH+'>Обект</th><th '+LL_MAIL_TH+'>Обяснение на обекта</th></tr>'+
    '<tr>'+
    '<td '+LL_MAIL_TD+'><b>'+esc((LL_KINDS.find(function(k){ return k[0] === kind; }) || [null,kind])[1])+'</b></td>'+
    '<td '+LL_MAIL_TD+'>'+(doc ? esc(doc) : 'без')+'</td>'+
    '<td '+LL_MAIL_TD+'>'+esc(store)+'</td>'+
    '<td '+LL_MAIL_TD+'>'+esc(comment)+'</td></tr>';
  if((products || []).length){
    body += '<tr><td colspan="4" style="padding:3px 7px 7px 18px;font-size:11px;color:#64748b;border:1px solid #e2e8f0;border-top:none;line-height:1.5;">'+
      products.map(function(p){
        return esc(p.sap_code)+' · '+esc(p.product_name)+' — '+llFmtQty(p.qty)+' '+esc(p.unit || '')+
          (p.cartons != null && p.cartons !== '' ? ' ('+esc(String(p.cartons))+' каш.)' : '');
      }).join('<br>')+'</td></tr>';
  }
  body += '</table>'+llMailBtn();
  return emailWrap(body, 'Товарен лист · ТеМАХ Вътрешна платформа');
}
function llNotifyRowAdded(listId, store, kind, doc, comment, products){
  var list = llStoreLists.find(function(x){ return String(x.id) === String(listId); }) ||
             llLists.find(function(x){ return String(x.id) === String(listId); });
  if(!list) return Promise.resolve(null);
  var wh = list.warehouse || '';
  var dateTxt = fmtDate(list.list_date);
  var title = '➕ Извънреден ред от ' + store;
  var msg = 'Товарен лист ' + dateTxt + ' · чака одобрение.';
  var subject = 'Извънреден ред от ' + store + ' · товарен лист ' + dateTxt;
  return Promise.all([llStoreEmails([wh]), llRegionalEmails(store)]).then(function(r){
    var to = (r[0][wh] || []).slice();
    r[1].forEach(function(e){ if(to.indexOf(e) < 0) to.push(e); });
    return Promise.all([
      llPushTo(wh, title, msg),
      llMailTo(to, subject, function(){
        return llAddedRowHtmlFor(list, store, kind, doc, comment, products);
      })
    ]);
  }).then(function(r){
    if(!r[0].ok && !r[1].ok){
      console.error('llNotifyRowAdded: известието не тръгна', wh, store, r);
      toast('⚠️ Редът е добавен, но известието до ' + (wh || 'склада') + ' не тръгна', '#d97706');
    }
    return { push: r[0], mail: r[1] };
  }).catch(function(err){
    console.error('llNotifyRowAdded: грешка', err);
    return null;
  });
}
function llNotifyRowDecided(list, row, approve, comment){
  if(!list || !row) return Promise.resolve(null);
  var store = row.store_name || '';
  var dateTxt = fmtDate(list.list_date);
  var title = approve ? '✅ Извънредният ред е одобрен' : '⛔ Извънредният ред е отхвърлен';
  var msg = 'Товарен лист ' + dateTxt + ' · ' + (list.warehouse || '') +
    (comment ? ' · ' + comment : '');
  var subject = (approve ? 'Одобрен извънреден ред · ' : 'Отхвърлен извънреден ред · ') + dateTxt;
  return llStoreEmails([store]).then(function(byStore){
    return Promise.all([
      llPushTo(store, title, msg),
      llMailTo(byStore[store] || [], subject, function(){
        var body = '<h2 style="color:'+(approve?'#16a34a':'#b91c1c')+';margin:0 0 4px;font-size:19px;">'+
            (approve ? '✅ Извънредният ред е одобрен' : '⛔ Извънредният ред е отхвърлен')+'</h2>'+
          '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">Решил: <b>'+esc(llActor())+'</b>'+
            (comment ? ' · '+esc(comment) : '')+'</p>'+
          llMailMeta(list)+
          '<div style="background:#f8fafc;border-radius:6px;padding:8px 12px;font-size:12.5px;">'+
            esc(llKindLabel(row))+' · '+(row.purchase_doc ? esc(row.purchase_doc) : 'без документ')+
            ' · '+esc(row.store_comment || '—')+'</div>'+
          (approve ? '' : '<p style="color:#b91c1c;font-size:12.5px;">Редът НЕ влиза в документите на листа. Стоката остава при обекта — уточни какво да се прави с нея.</p>')+
          llMailBtn();
        return emailWrap(body, 'Товарен лист · ТеМАХ Вътрешна платформа');
      })
    ]);
  }).then(function(r){
    if(!r[0].ok && !r[1].ok){
      console.error('llNotifyRowDecided: известието не тръгна', store, r);
    }
    return { push: r[0], mail: r[1] };
  }).catch(function(err){
    console.error('llNotifyRowDecided: грешка', err);
    return null;
  });
}

function llStoreCardHtml(l){
  var items = llStoreItemsOf(l.id).slice().sort(llByPosition);
  if(!items.length) return '';
  /* Отхвърленият ред се ПОКАЗВА (зачертан), но не се брои и не пречи на
     приключването — за листа той не съществува. */
  var live = llLiveRows(items);
  var got  = live.filter(function(i){ return i.received; }).length;
  var miss = live.filter(function(i){ return i.missing; }).length;
  var open = !llCollapsed[l.id];
  var canAny = live.some(llOpenForStore);
  /* Гейтът на „Приключи приемането": нито един ред без произнасяне. */
  var pending = live.filter(function(i){ return !llHandled(i); }).length;
  /* ВТОРИ гейт: ред, който чака одобрение. Затвори ли се листът дотогава,
     писмото до склада тръгва с ред, по който още никой не се е произнесъл —
     а после одобрението няма къде да влезе. */
  var aprPending = items.filter(llRowPending).length;
  var allDone = pending === 0 && aprPending === 0;
  var gateTitle = pending
    ? 'Отметни всеки ред като получен или неполучен'
    : 'Има ред, който чака одобрение';
  var canAdd = l.status === 'sent' && items.some(llCanReceive);
  /* Обектът на картата — за печата. При глобален профил в един лист може да
     има няколко обекта; тогава филтър няма и се печата целият лист. */
  var seenS = {}, onlyStore = '';
  items.forEach(function(i){ seenS[i.store_name || ''] = 1; });
  var sKeys = Object.keys(seenS);
  if(sKeys.length === 1) onlyStore = sKeys[0];

  /* Три състояния на картата: чака (синьо), приета изцяло (зелено), приета
     с липси (червено). Липсата не бива да изглежда като приключено наред. */
  var edge = !allDone ? ['#e2e8f0','#2563eb','#eff6ff','#1e40af']
           : (miss    ? ['#fecaca','#dc2626','#fef2f2','#dc2626']
                      : ['#bbf7d0','#16a34a','#f0fdf4','#16a34a']);
  var h = '<div id="ll-card-'+l.id+'" style="background:#fff;border:1px solid '+edge[0]+';border-left:4px solid '+edge[1]+';border-radius:10px;padding:12px;margin-bottom:10px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'+
      '<div style="font-size:13.5px;font-weight:700;">🚛 '+esc(l.warehouse||'')+' · '+fmtDate(l.list_date)+
        ' <span style="background:'+edge[2]+';color:'+edge[3]+';padding:2px 8px;border-radius:20px;font-size:10.5px;">получени '+got+' · неполучени '+miss+' / '+live.length+'</span> '+
        (aprPending ? ' <span data-ll-apr-wait="'+aprPending+'" style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">⏳ '+aprPending+' чака одобрение</span> ' : '')+
        llStatusBadge(l.status)+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
        (open && canAny ? '<button data-id="'+l.id+'" onclick="llMarkAllReceived(this.dataset.id)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;">✅ Всичко получено</button>' : '')+
        /* Приемането се приключва ЯВНО от обекта. Дотук листът се затваряше
           сам, чак когато всеки ред на всеки обект е получен — с липси този
           момент просто не настъпваше и листът висеше „изпратен" завинаги. */
        (open && canAdd ? '<button data-id="'+l.id+'" onclick="llStoreAddOpen(this.dataset.id)" title="Дошло е нещо, което не е в листа" style="border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;">➕ Добави ред</button>' : '')+
        (open && l.status === 'sent'
          ? '<button data-id="'+l.id+'"'+(allDone?'':' disabled title="'+escAttr(gateTitle)+'"')+
            ' onclick="llFinishReceiving(this.dataset.id)" style="border:none;background:'+(allDone?'#0f172a':'#e2e8f0')+';color:'+(allDone?'#fff':'#94a3b8')+';border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:'+(allDone?'pointer':'not-allowed')+';">🏁 Приключи приемането</button>'
          : '')+
        '<button data-id="'+l.id+'" data-s="'+escAttr(onlyStore)+'" onclick="llPrint(this.dataset.id,this.dataset.s)" title="Печат само на моята част от листа" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;">🖨 Печат</button>'+
        '<button data-id="'+l.id+'" data-s="'+escAttr(onlyStore)+'" onclick="llDownloadPdf(this.dataset.id,this.dataset.s)" title="Сваля моята част като PDF" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;">⬇ PDF</button>'+
        '<button data-id="'+l.id+'" onclick="llToggleCard(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:6px 13px;font-size:12px;cursor:pointer;">'+(open?'▲ Свий':'▼ Разгъни')+'</button>'+
      '</div>'+
    '</div>';
  if(l.comment) h += '<div style="font-size:11.5px;color:#374151;background:#f8fafc;border-radius:6px;padding:5px 8px;margin-top:8px;">💬 '+esc(l.comment)+'</div>';
  if(!open) return h + '</div>';

  h += '<div style="overflow-x:auto;margin-top:10px;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px;"><thead><tr style="background:#f8fafc;">';
  ['Товарна единица','Стокова №','Коментар склад','Моят коментар','Получено'].forEach(function(c){
    h += '<th style="text-align:left;padding:6px 9px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
  });
  h += '</tr></thead><tbody>';
  /* Палетът е една физическа единица с няколко документа — показва се като
     заглавен ред с бутон „целия палет", а документите под него. Иначе човекът
     на рампата вижда четири отделни „палет 2 от 5" и не разбира, че е един. */
  llPalletGroups(items).forEach(function(g){
    var multi = g.rows.length > 1;
    if(multi){
      var gGot  = g.rows.filter(function(r){ return r.received; }).length;
      var gMiss = g.rows.filter(function(r){ return r.missing; }).length;
      var gCan  = g.rows.some(llOpenForStore);
      h += '<tr data-pallet-group="1" style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">'+
        '<td colspan="4" style="padding:6px 9px;font-weight:700;font-size:11.5px;">'+
          esc(llKindLabel(g.rows[0]))+' · '+g.rows.length+' документа · получени '+gGot+
          (gMiss?' · неполучени '+gMiss:'')+'/'+g.rows.length+
          (g.rows.some(function(r){ return r.partial; })?' '+llPartialBadge():'')+
          /* Коментарът на ЦЕЛИЯ палет. Стои тук, а не в prompt(): обяснението
             какво липсва се пише веднъж и се записва във всеки ред на палета,
             а полето остава на екрана, докато човекът го дописва. */
          (gCan?'<div style="margin-top:5px;font-weight:400;"><input id="ll-pc-'+l.id+'-'+g.kind+'-'+g.pallet_no+'" placeholder="какво липсва — задължително за „Неполучен целия палет“" style="width:100%;max-width:420px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 7px;font-size:11.5px;"></div>':'')+
        '</td>'+
        '<td style="padding:6px 9px;white-space:nowrap;">'+(gCan
          ? '<button data-id="'+l.id+'" data-p="'+g.pallet_no+'" data-k="'+escAttr(g.kind)+'" onclick="llMarkPalletReceived(this.dataset.id,this.dataset.p,this.dataset.k)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">✅ Целият '+esc(LL_KIND_WORD[g.kind] || 'палет')+'</button>'+
            ' <button data-id="'+l.id+'" data-p="'+g.pallet_no+'" data-k="'+escAttr(g.kind)+'" onclick="llMarkPalletMissing(this.dataset.id,this.dataset.p,this.dataset.k)" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">⛔ Неполучен целия '+esc(LL_KIND_WORD[g.kind] || 'палет')+'</button>'
          : '')+
          /* Разлика по ЦЕЛИЯ палет само докато е недокоснат: започне ли да се
             отмята по редове, въпросът вече е за конкретния ред. */
          (gGot===0 && gMiss===0 && gCan ? llDiffBtn(g.rows[0].id) : '')+'</td></tr>';
    }
    g.rows.forEach(function(it){
    var failed = !!llDocFailures[it.id];
    /* Три фона, защото трите състояния трябва да се различават от два метра:
       зелен = получено, червен = обектът е заявил липса, бял = още чака.
       Извънредният ред има свои два: жълт (чака) и сив (отхвърлен) — те бият
       зеленото, защото received=true е вярно и за двата, а въпросът на
       екрана е друг: влиза ли този ред в листа. */
    var bg = llRowPending(it) ? 'background:#fffbeb;'
           : (llRowRejected(it) ? 'background:#f8fafc;color:#94a3b8;'
           : (it.received ? 'background:#f0fdf4;' : (it.missing ? 'background:#fef2f2;' : '')));
    h += '<tr'+(failed?' data-doc-failed="1"':'')+(it.missing?' data-missing="1"':'')+
      (it.added_by_store?' data-ll-added="'+escAttr(it.approval_status||'')+'"':'')+
      ' style="border-bottom:1px solid #f1f5f9;'+bg+(llRowRejected(it)?'text-decoration:line-through;':'')+'">'+
      '<td style="padding:6px 9px;font-weight:600;white-space:nowrap;'+(multi?'padding-left:22px;color:#94a3b8;':'')+'">'+(multi?'↳':esc(llKindLabel(it)))+
        (it.added_by_store?'<div style="margin-top:3px;text-decoration:none;font-weight:400;">'+llApprovalBadge(it)+llApprovalNote(it)+llApproveBtnsHtml(l, it)+'</div>':'')+'</td>'+
      '<td style="padding:6px 9px;font-family:DM Mono,monospace;">'+(it.purchase_doc?esc(it.purchase_doc):'<span style="color:#cbd5e1;">без</span>')+
        (it.partial?' '+llPartialBadge():'')+'</td>'+
      '<td style="padding:6px 9px;color:#64748b;">'+esc(it.warehouse_comment||'—')+'</td>'+
      /* Коментарът на обекта остава редактируем и СЛЕД отмятането: разминаването
         често се вижда чак при подреждане на стоката, не при разтоварването. */
      /* id-то е за llMarkMissing(): бутонът чете ТОЗИ input, а не it.store_comment.
         Кликът по бутона blur-ва полето и onchange се задейства пръв само в
         истински браузър; текстът трябва да се хване и когато не е. */
      '<td style="padding:6px 9px;">'+(llCanReceive(it)
        ? '<input id="ll-sc-'+it.id+'" value="'+escVal(it.store_comment)+'" data-id="'+it.id+'" onchange="llSaveStoreComment(this.dataset.id,this.value)" placeholder="напр. кашонът е мокър" style="width:100%;min-width:130px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;font-size:12px;">'
        : esc(it.store_comment||'—'))+'</td>'+
      '<td style="padding:6px 9px;white-space:nowrap;">'+(it.received
        ? '<span style="color:#16a34a;font-weight:600;">✅ '+esc(it.received_by||'')+(it.received_at?' · '+llFmtStamp(it.received_at):'')+'</span>'
        : (it.missing
          ? '<span style="color:#dc2626;font-weight:600;">⛔ '+esc(it.missing_by||'')+(it.missing_at?' · '+llFmtStamp(it.missing_at):'')+'</span>'+
            /* Отмяната е за сгрешен клик и за стока, която е дошла по-късно. */
            (llCanReceive(it)?' <button data-id="'+it.id+'" onclick="llUnmarkMissing(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">↩ Отмени</button>':'')
          : (llCanReceive(it)
            ? '<button data-id="'+it.id+'" onclick="llMarkReceived(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">✅ Получено</button>'+
              ' <button data-id="'+it.id+'" onclick="llMarkMissing(this.dataset.id)" title="Редът НЕ е пристигнал — описва се в „Моят коментар“" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">⛔ Неполучено</button>'+llDiffBtn(it.id)
            : '<span style="color:#cbd5e1;">—</span>')))+
      (failed?'<div style="margin-top:3px;font-size:10px;color:#b45309;font-weight:600;">⚠️ документът не е затворен</div>':'')+
      '</td></tr>';
    /* Какво има на палета — само за четене. Отмятането остава по ред/палет
       както в Пакет А; по артикул е следващата стъпка (В2). 6 колони: първата
       остава за отстъпа, артикулите — в останалите пет. */
    if((it.products || []).length){
      var so = !!llStoreProdOpen[it.id];
      h += '<tr data-ll-sprod="'+it.id+'" style="border-bottom:1px solid #f1f5f9;'+(it.received?'background:#f0fdf4;':(it.missing?'background:#fef2f2;':''))+'">'+
        '<td></td><td colspan="4" style="padding:0 9px 6px;">'+
        llProductsToggleHtml(it, so, 'llToggleStoreProducts')+(so ? llProductsTableHtml(it.products) : '')+'</td></tr>';
    }
    });
  });
  h += '</tbody></table></div></div>';
  return h;
}

/* „⚠️ Разлика" по НЕПОЛУЧЕН палет — отваря бланката за разлики, попълнена от
   товарния лист и от стоковия документ. Магазинът вече е описал веднъж какво
   чака; преписването на склада, документа и артикулите на ръка е точно мястото,
   където се греши.
   Бутонът НЕ отмята реда и НЕ пише НИЩО в базата: „получих палета" и „имам
   разлика по него" са две различни твърдения и не бива да се случват с един
   клик. Магазинът подава бланката, после отмята — или обратно. */
/* Едно определение на бутона: стои и на реда, и в заглавния ред на палета. */
function llDiffBtn(itemId){
  return ' <button data-id="'+itemId+'" onclick="llOpenDiffForItem(this.dataset.id)" title="Подай бланка за разлики — попълва се от товарния лист и стоковия документ" style="border:1px solid #fed7aa;background:#fff7ed;color:#c2410c;border-radius:5px;padding:3px 9px;font-size:11.5px;font-weight:600;cursor:pointer;">⚠️ Разлика</button>';
}
function llOpenDiffForItem(itemId){
  var it = llStoreItems.find(function(x){ return String(x.id) === String(itemId); });
  if(!it) return;
  /* Разликите живеят в друг файл, който може изобщо да не е зареден. */
  if(typeof openDiffSubmitModal !== 'function'){
    toast('Модулът „Разлики" не е зареден — отвори таба и опитай пак','#dc2626');
    return;
  }
  var l = llStoreLists.find(function(x){ return String(x.id) === String(it.list_id); });
  var doc = llItemDocKey(it);
  var where = (it.kind === 'pallet' && it.pallet_no != null)
    ? 'палет ' + it.pallet_no + (it.pallet_total != null ? ' от ' + it.pallet_total : '')
    : llKindLabel(it);
  var comment = 'Товарен лист ' + ((l && l.warehouse) || '') + ' от ' + fmtDate(l && l.list_date) +
    ', ' + where + ' (позиция ' + (it.position != null ? it.position : '—') + ')' +
    ', стокова № ' + (doc || 'без документ') + '.';
  if(it.warehouse_comment) comment += ' Коментар склад: ' + it.warehouse_comment;

  var open = function(items){
    openDiffSubmitModal({
      direction: 'interstore',
      counterpart: (l && l.warehouse) || '',
      document_number: doc || '',
      doc_date: (l && l.list_date) || '',
      comment: comment,
      items: items
    });
  };
  /* Редът носи собствените си артикули (Пакет В1) — те са ТОЧНО това, което
     е натоварено, докато „Стока на път" е месечна снимка. Щом ги има, бланката
     се пълни от тях и goods_transit изобщо не се пита. */
  if((it.products || []).length){
    open(it.products.map(function(p){
      return { sap: p.sap_code, name: p.product_name, qty: p.qty, unit: p.unit };
    }));
    return;
  }
  /* Ред без документ няма откъде да вземе артикули — бланката тръгва празна. */
  if(!doc){ open([]); return; }
  sbGet('goods_transit','purchase_doc=eq.' + encodeURIComponent(doc) +
    '&store_name=eq.' + encodeURIComponent(it.store_name || '') +
    '&select=material_code,material_name,ordered_qty,unit&order=position').then(function(rows){
    open((Array.isArray(rows) ? rows : []).map(function(r){
      return { sap: r.material_code, name: r.material_name, qty: r.ordered_qty, unit: r.unit };
    }));
  }).catch(function(){ open([]); });
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
  /* „Получено" и „неполучено" са взаимно изключващи се. Базата НЕ го налага
     (виж миграцията loading_missing — check няма заради огледалото), значи
     единственото място, където правилото живее, е тук. */
  if(it.missing){ toast('Редът е отбелязан като неполучен — отмени го първо','#d97706'); return; }
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
/* kind е по избор заради съвместимост с по-стари извиквания — без него
   действието е за палет, както беше. */
function llMarkPalletReceived(listId, palletNo, kind){
  var n = parseInt(palletNo, 10), k = kind || 'pallet';
  var mine = llStoreItemsOf(listId).filter(function(i){
    return llOpenForStore(i) && i.kind === k && Number(i.pallet_no) === n;
  });
  if(!mine.length){ toast('Няма неполучени редове по този палет','#64748b'); return; }
  llPatchReceived(mine, 'палета');
}
function llMarkAllReceived(listId){
  /* САМО редовете на този обект. Един лист обслужва няколко обекта и бутонът
     стои във всяка от картите им - без филтъра единият би отмятал за другия. */
  var mine = llStoreItemsOf(listId).filter(llOpenForStore);
  if(!mine.length){ toast('Няма неотметнати редове','#64748b'); return; }
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


/* ═══ „НЕПОЛУЧЕНО" ═══════════════════════════════════════════
   Досега редът имаше само received true/false и неотметнатият ред значеше
   „още не е дошъл". Обектът нямаше как да каже „това НЕ дойде" — значи и
   нямаше как да приключи приемането си с липси, а листът ставаше done само
   когато ВСИЧКИ редове на ВСИЧКИ обекти са получени. На практика лист с
   липсващ палет висеше „изпратен" завинаги и никой не научаваше нищо.

   Липсата е ТВЪРДЕНИЕ, не отсъствие на отметка, затова иска обяснение:
   „неполучено" без коментар е точно толкова безполезно, колкото и празен ред.
   Оттам и единственото условие долу — непразен store_comment.

   И трите функции НЕ викат llAutoCloseDoc(): документът в „Стока на път"
   остава чакащ. Точно това означава липса. */

/* Полето „Моят коментар" на реда — ТЕКУЩАТА му стойност на екрана, а не
   записаната. Кликът по бутона blur-ва input-а и onchange го записва пръв,
   но това е поведение на истинския браузър; тук не се разчита на него. */
function llStoreCommentInput(itemId){
  return document.getElementById('ll-sc-' + itemId);
}
function llMarkMissing(itemId){
  var it = llStoreItems.find(function(x){ return String(x.id) === String(itemId); });
  if(!it || it.missing) return;
  if(it.received){ toast('Редът вече е отметнат като получен','#d97706'); return; }
  if(!llCanReceive(it)){ toast('Само обектът получател може да отмята','#dc2626'); return; }

  var inp = llStoreCommentInput(itemId);
  var txt = inp ? String(inp.value == null ? '' : inp.value).trim()
                : String(it.store_comment == null ? '' : it.store_comment).trim();
  if(!txt){
    toast('Опиши какво липсва в коментара','#dc2626');
    if(inp && inp.focus) inp.focus();
    return;                                  /* НИЩО не се записва */
  }
  var at = new Date().toISOString(), by = llActor();
  /* Коментарът влиза в СЪЩИЯ PATCH, ако още не е записан. Два записа биха
     значели, че липсата може да се запише, а обяснението ѝ — не. */
  var body = { missing:true, missing_by:by, missing_at:at };
  if(txt !== String(it.store_comment == null ? '' : it.store_comment)) body.store_comment = txt;
  sbPatch('loading_list_items','id=eq.'+itemId, body).then(function(res){
    if(!res.ok){ toast('Грешка при отмятане: '+sbErrMsg(res),'#dc2626'); return; }
    it.missing = true; it.missing_by = by; it.missing_at = at;
    if(body.store_comment !== undefined) it.store_comment = txt;
    toast('⛔ Отбелязано като неполучено','#dc2626');
    renderLoadingLists();
  });
}
/* Целият палет наведнъж — човекът на рампата вижда ЕДНА липсваща единица,
   не четири документа. Коментарът е ЕДИН и отива във всичките ѝ редове:
   иначе същото изречение се преписва толкова пъти, колкото са документите. */
function llMarkPalletMissing(listId, palletNo, kind){
  var n = parseInt(palletNo, 10), k = kind || 'pallet';
  var mine = llStoreItemsOf(listId).filter(function(i){
    return llOpenForStore(i) && i.kind === k && Number(i.pallet_no) === n;
  });
  if(!mine.length){ toast('Няма неотметнати редове по този палет','#64748b'); return; }
  var inp = document.getElementById('ll-pc-' + listId + '-' + k + '-' + n);
  var txt = inp ? String(inp.value == null ? '' : inp.value).trim() : '';
  if(!txt){
    toast('Опиши какво липсва в коментара','#dc2626');
    if(inp && inp.focus) inp.focus();
    return;
  }
  if(!confirm('Отбележи '+mine.length+' реда от палета като НЕполучени?')) return;
  var at = new Date().toISOString(), by = llActor();
  Promise.all(mine.map(function(it){
    return sbPatch('loading_list_items','id=eq.'+it.id,
      { missing:true, missing_by:by, missing_at:at, store_comment:txt })
      .then(function(res){ return { it:it, res:res }; });
  })).then(function(all){
    var bad = all.filter(function(r){ return !r.res.ok; });
    all.filter(function(r){ return r.res.ok; }).forEach(function(r){
      r.it.missing = true; r.it.missing_by = by; r.it.missing_at = at; r.it.store_comment = txt;
    });
    if(bad.length){
      console.error('llMarkPalletMissing: '+bad.length+' реда не бяха отбелязани', bad[0].res.error);
      toast('⚠️ '+bad.length+' реда НЕ бяха отбелязани: '+sbErrMsg(bad[0].res),'#dc2626');
    } else {
      toast('⛔ Палетът е отбелязан като неполучен','#dc2626');
    }
    renderLoadingLists();
  });
}
/* Отмяна — сгрешен клик или стока, дошла с по-късен курс. Връща реда в
   изходно състояние, тоест пак „чакащ", а не „получен". */
function llUnmarkMissing(itemId){
  var it = llStoreItems.find(function(x){ return String(x.id) === String(itemId); });
  if(!it || !it.missing) return;
  if(!llCanReceive(it)){ toast('Само обектът получател може да отмята','#dc2626'); return; }
  sbPatch('loading_list_items','id=eq.'+itemId,
    { missing:false, missing_by:null, missing_at:null }).then(function(res){
    if(!res.ok){ toast('Отмяната НЕ беше записана: '+sbErrMsg(res),'#dc2626'); return; }
    it.missing = false; it.missing_by = null; it.missing_at = null;
    toast('↩ Върнато в изчакване');
    renderLoadingLists();
  });
}
/* Обектът приключва СВОЕТО приемане. Листът се затваря само ако и другите
   обекти по него са приключили — това решава llAutoDoneList() със заявка,
   не от llStoreItems (чуждите редове са невидими тук). */
function llFinishReceiving(listId){
  var mine = llStoreItemsOf(listId);
  if(!mine.length) return;
  var left = llLiveRows(mine).filter(function(i){ return !llHandled(i); }).length;
  if(left){ toast('Отметни всеки ред като получен или неполучен','#d97706'); return; }
  /* Гейтът е и тук, не само в disabled атрибута на бутона: бутонът може да
     бъде извикан и от конзолата, а и disabled-ът се смята при рендиране —
     между него и клика някой може да е добавил ред. */
  if(mine.some(llRowPending)){ toast('Има ред, който чака одобрение','#d97706'); return; }
  var l = llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  var was = l && l.status;
  llAutoDoneList(listId).then(function(){
    /* Листът обслужва няколко обекта. Приключи ли този пръв, статусът не се
       мести — llAutoDoneList мълчи, защото няма какво да запише. Без реда
       долу човекът натиска бутон и НИЩО не се случва на екрана, тоест
       натиска пак. Съобщението е единственото, което го различава от провал. */
    if(l && l.status === was){
      toast('Готово за този обект. Листът чака и останалите обекти.','#2563eb');
    }
    renderLoadingLists();
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
  /* Отхвърленият ред не участва: той не е част от доставката. */
  var siblings = llLiveRows(llStoreItemsOf(d.listId)).filter(function(i){
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
    /* Прието затваря реда, тоест „проверено, не е пристигнало" вече не
       описва нищо — същото правило като tMarkStatus() в transit.js. */
    return sbPatch('goods_transit', f, {
      status: 'received',
      reviewed_at: null,
      reviewed_by: null,
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
/* Листът се затваря, когато ВСЕКИ ред на ВСИЧКИ обекти е ОБРАБОТЕН — получен
   ИЛИ неполучен. Дотук условието беше „всички received" и лист с една липса
   не настъпваше никога.

   Има ли поне една липса, статусът е 'partial', не 'done': складът търси
   точно тези листи, а done би ги скрил сред приетите без забележка.

   Желаният статус се СМЯТА и се сравнява с текущия, вместо да има изход
   „вече е приключен". Иначе „↩ Отмени" върху липса по вече partial лист би
   оставил статуса partial завинаги — редът се получава по-късно, липси вече
   няма, а листът продължава да твърди обратното. */
function llAutoDoneList(listId){
  var l = llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  if(!l) return Promise.resolve();
  /* Обектът вижда САМО своите редове, затова проверката е със заявка, не от
     llStoreItems: другите обекти на същия лист са невидими тук и листът би
     се приключвал още на първия готов обект. */
  return sbGet('loading_list_items','list_id=eq.'+listId+'&select=id,received,missing,approval_status').then(function(all){
    if(!Array.isArray(all) || !all.length) return;
    /* Ред, който чака одобрение, ДЪРЖИ листа отворен: решението още може да го
       извади от него или да го добави към писмото до склада. */
    if(all.some(llRowPending)) return;
    var rows = llLiveRows(all);
    if(!rows.length) return;
    if(!rows.every(function(r){ return r.received || r.missing; })) return;
    var want = rows.some(function(r){ return r.missing; }) ? 'partial' : 'done';
    if(l.status === want) return;
    return sbPatch('loading_lists','id=eq.'+listId,{status:want, done_at:new Date().toISOString()}).then(function(res){
      if(!res.ok){ toast('⚠️ Листът НЕ беше приключен: '+sbErrMsg(res),'#dc2626'); return; }
      l.status = want;
      toast(want === 'partial'
        ? '⛔ Товарният лист е приключен с липси'
        : '✅ Товарният лист е приключен');
      /* Тук смяната Е реална: горе има изход при l.status === want. */
      llNotifyClosed(l);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   PDF НА ТОВАРНИЯ ЛИСТ

   Печатът (llRenderPrint) е HTML в страницата и минава през диалога на
   браузъра. За имейла и за „свали го на телефона" трябва ФАЙЛ, затова тук е
   втори път до същото съдържание — с jsPDF.

   ДВЕ ВЪНШНИ ЗАВИСИМОСТИ, И ДВЕТЕ ЛЕНИВИ:
     · jsPDF от cdnjs — 4.2.1, с integrity (SRI). Зарежда се при ПЪРВОТО
       поискване на PDF, както html5-qrcode при първото сканиране.
     · шрифт с кирилица — fonts/Roboto-Regular.ttf от репото. Вградените в
       jsPDF шрифтове са WinAnsi: без този файл целият документ излиза с
       въпросителни, БЕЗ да гръмне. Точно затова шрифтът е в репото, а не на
       CDN, и точно затова провалът му отменя PDF-а вместо да го пусне
       нечетим.

   ПРОВАЛЪТ НЕ СПИРА ПИСМОТО. Листът е изпратен; липсващото приложение е
   по-малката щета от неизпратено известие (llNotifySent). */
var LL_PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js';
var LL_PDF_SRI = 'sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj+tiDLffZ4FVUj5a8vyKJ9pIgl8JCAHEJ4D1iUKBecswg==';
var LL_PDF_FONT_URL  = 'fonts/Roboto-Regular.ttf';
var LL_PDF_FONT_FILE = 'Roboto-Regular.ttf';
var LL_PDF_FONT_NAME = 'Roboto';
var llPdfLibPromise = null;   /* зареждането на jsPDF — едно за сесията */
var LL_PDF_TIMEOUT = 20000;   /* таван на цялото генериране (мс) */
var llPdfFontPromise = null;  /* шрифтът като base64 — едно за сесията */

/* Обещание със срок. Отменя се с изрична грешка, за да се види в toast-а
   каква е причината, вместо да виси мълчаливо. */
function llPdfTimeout(promise, ms, what){
  return new Promise(function(resolve, reject){
    var done = false;
    var t = setTimeout(function(){
      if(done) return;
      done = true;
      reject(new Error(what + ' не се зареди навреме'));
    }, ms);
    promise.then(function(v){
      if(done) return;
      done = true; clearTimeout(t); resolve(v);
    }, function(e){
      if(done) return;
      done = true; clearTimeout(t); reject(e);
    });
  });
}
function llPdfCtor(){
  return (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || null;
}
function llLoadPdfLib(){
  if(llPdfCtor()) return Promise.resolve(true);
  if(llPdfLibPromise) return llPdfLibPromise;
  llPdfLibPromise = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = LL_PDF_LIB;
    s.setAttribute('integrity', LL_PDF_SRI);
    s.setAttribute('crossorigin', 'anonymous');
    s.setAttribute('referrerpolicy', 'no-referrer');
    s.onload = function(){ llPdfCtor() ? resolve(true) : reject(new Error('jsPDF не се появи')); };
    /* Провалът НЕ остава кеширан — мрежата на склада идва и си отива. */
    s.onerror = function(){ llPdfLibPromise = null; reject(new Error('jsPDF не се зареди')); };
    document.head.appendChild(s);
  });
  return llPdfLibPromise;
}
/* Шрифтът: fetch → blob → base64. През FileReader, а не btoa(String.fromCharCode…)
   — вторият хвърля „Maximum call stack size exceeded" при 142 KB наведнъж. */
function llPdfFont(){
  if(llPdfFontPromise) return llPdfFontPromise;
  llPdfFontPromise = fetch(LL_PDF_FONT_URL).then(function(r){
    if(!r.ok) throw new Error('шрифтът не се зареди (HTTP ' + r.status + ')');
    return r.blob();
  }).then(function(b){
    return new Promise(function(resolve, reject){
      var fr = new FileReader();
      fr.onload = function(){
        var s = String(fr.result || '');
        var i = s.indexOf('base64,');
        if(i < 0) return reject(new Error('шрифтът не се прочете'));
        resolve(s.slice(i + 7));
      };
      fr.onerror = function(){ reject(new Error('шрифтът не се прочете')); };
      fr.readAsDataURL(b);
    });
  }).catch(function(e){
    llPdfFontPromise = null;   /* и тук провалът не се кешира */
    throw e;
  });
  return llPdfFontPromise;
}

/* Име на файла: ASCII. Кирилицата в име на приложение минава през различни
   кодирания при различните пощи и стига до получателя като „=?UTF-8?…" или
   като въпросителни; латиницата стига навсякъде еднаква. */
var LL_TRANSLIT = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ж:'zh', з:'z', и:'i', й:'y',
  к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u',
  ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'sht', ъ:'a', ь:'y', ю:'yu', я:'ya'
};
function llTranslit(txt){
  var out = '';
  String(txt == null ? '' : txt).toLowerCase().split('').forEach(function(ch){
    if(LL_TRANSLIT[ch]) out += LL_TRANSLIT[ch];
    else if(/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  });
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'list';
}
function llPdfName(list, store){
  return 'tovaren-list-' + String(list.list_date || '').slice(0, 10) + '-' +
    llTranslit(store || list.warehouse || '') + '.pdf';
}

/* Документът. Подредбата е като печата: обект, после палет, после позиция;
   артикулите — под своя ред. */
function llPdfRows(items, storeFilter){
  /* Отхвърленият ред НЕ влиза в бланката (Пакет Г2). */
  return llLiveRows(items).filter(function(i){
    return !storeFilter || i.store_name === storeFilter;
  }).slice().sort(function(a, b){
    var s = String(a.store_name || '').localeCompare(String(b.store_name || ''));
    if(s) return s;
    var an = a.pallet_no == null ? 9999 : Number(a.pallet_no);
    var bn = b.pallet_no == null ? 9999 : Number(b.pallet_no);
    if(an !== bn) return an - bn;
    return (a.position || 0) - (b.position || 0);
  });
}
function llBuildPdf(list, items, storeFilter){
  return llPdfTimeout(Promise.all([llLoadPdfLib(), llPdfFont()]), LL_PDF_TIMEOUT, 'PDF').then(function(res){
    var Ctor = llPdfCtor();
    if(!Ctor) throw new Error('jsPDF липсва');
    var doc = new Ctor({ unit: 'mm', format: 'a4' });
    doc.addFileToVFS(LL_PDF_FONT_FILE, res[1]);
    doc.addFont(LL_PDF_FONT_FILE, LL_PDF_FONT_NAME, 'normal');
    doc.setFont(LL_PDF_FONT_NAME, 'normal');

    var L = 12, R = 198, y = 16;
    var line = function(txt, size, step){
      doc.setFontSize(size || 10);
      var parts = doc.splitTextToSize(String(txt), R - L);
      for(var k = 0; k < parts.length; k++){
        if(y > 282){ doc.addPage(); doc.setFont(LL_PDF_FONT_NAME, 'normal'); y = 16; }
        doc.text(parts[k], L, y);
        y += (step || 5);
      }
    };
    line('ТОВАРЕН ЛИСТ' + (storeFilter ? ' — ' + storeFilter : ''), 15, 7);
    line('Склад изпращач: ' + (list.warehouse || '—'), 10, 5);
    line('Дата на товарене: ' + fmtDate(list.list_date), 10, 5);
    line('Товарил: ' + (list.executed_by || '—'), 10, 5);
    if(list.comment) line('Коментар: ' + list.comment, 10, 5);
    y += 2;

    var rows = llPdfRows(items, storeFilter);
    if(!rows.length) line('Листът няма редове.', 10, 5);
    rows.forEach(function(it, n){
      line((n + 1) + '. ' + llKindLabel(it) +
        (llIsOversize(it.kind) && it.warehouse_comment ? ' — ' + it.warehouse_comment : '') +
        '   изходящ № ' + (it.purchase_doc || 'без') +
        (storeFilter ? '' : '   обект: ' + (it.store_name || '—')), 11, 5.5);
      /* При извънгабаритния коментарът вече е до вида — втори път би бил шум. */
      if(it.warehouse_comment && !llIsOversize(it.kind)) line('    коментар склад: ' + it.warehouse_comment, 9, 4.5);
      (it.products || []).forEach(function(p){
        line('    · ' + p.sap_code + '  ' + p.product_name +
          '  —  ' + llFmtQty(p.qty) + ' ' + (p.unit || '') +
          (p.cartons != null ? '  (' + p.cartons + ' каш.)' : ''), 9, 4.5);
      });
      y += 1.5;
    });
    y += 4;
    line('Товарил: ............................        Приел: ............................', 10, 5);

    /* datauristring е „data:application/pdf;filename=…;base64,AAAA" — взима
       се ПОСЛЕДНОТО „base64,", защото в началото има и filename с точки. */
    var uri = String(doc.output('datauristring') || '');
    var at = uri.lastIndexOf('base64,');
    if(at < 0) throw new Error('PDF-ът не се получи');
    return { filename: llPdfName(list, storeFilter), base64: uri.slice(at + 7) };
  });
}

/* „⬇ PDF" — сваля файла на устройството. Същият генератор като приложението
   в писмото: един източник, за да не се разминат. */
function llDownloadPdf(listId, storeFilter){
  var l = llLists.find(function(x){ return String(x.id) === String(listId); }) ||
          llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  if(!l){ toast('Товарният лист не е намерен','#dc2626'); return Promise.resolve(false); }
  var items = llItemsOf(listId);
  if(!items.length) items = llStoreItemsOf(listId);
  toast('⏳ Готви се PDF…');
  return llBuildPdf(l, items, storeFilter || '').then(function(pdf){
    var a = document.createElement('a');
    a.href = 'data:application/pdf;base64,' + pdf.base64;
    a.download = pdf.filename;
    document.body.appendChild(a);
    a.click();
    if(a.parentNode) a.parentNode.removeChild(a);
    toast('⬇ ' + pdf.filename);
    return true;
  }).catch(function(e){
    console.error('llDownloadPdf', e);
    toast('PDF не се получи: ' + (e && e.message ? e.message : e), '#dc2626');
    return false;
  });
}

/* ══════════════════════════════════════════════════════════
   ИЗВЕСТИЯ ПО ТОВАРНИТЕ ЛИСТИ

   Дотук листът тръгваше мълчаливо: обектът разбираше, че има товар, само ако
   сам отвореше таба, а складът разбираше как е минало приемането — никога.
   Моментите, в които има какво да се каже, са точно два: изпращането и
   приключването.

   ЗАЩО ОТ БРАУЗЪРА, А НЕ ОТ bulletin-notify (CLAUDE.md т.14)
   Правилото там забранява известие, което тръгва „защото някой е отворил
   таб" — такова зависи от това кой е влязъл, отива до всички и не знае колко
   е часът. Тук нито едно от трите не важи: тръгва от ЧОВЕШКО ДЕЙСТВИЕ
   (натиснат бутон или отметнат последен ред), получателят е изведен от самия
   лист, а моментът е самото събитие. Човек, който натиска бутон, е съвсем
   различно нещо от таб, който се отваря.
   Периодичното напомняне — „листът стои неприет 48 часа" — НЕ е тук: зад него
   няма човешко действие и живее в bulletin-notify, тема loading_lists_pending.

   ПРОВАЛЪТ НЕ ВРЪЩА СТАТУСА НАЗАД. Листът Е изпратен/приключен — това е факт
   и не се отменя, защото второ, независимо действие не е минало. Жълт toast
   и console.error: човекът трябва да ВИДИ, че известието не е тръгнало, и да
   вдигне телефона. Същото решение като при llAutoCloseDoc() в Пакет А. */

/* Копие на низа от push.js (OS_PORTAL) нарочно: сглобяването на ЛИНК в писмо
   не бива да зависи от това дали push.js е зареден. */
var LL_PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* Редовете, групирани по обект получател. Един лист адресира РАЗНИ обекти и
   всеки получава СВОЯТА част — чужди редове в чуждо писмо са изтичане на
   информация между обекти, не просто шум. */
function llRowsByStore(items){
  var by = {}, order = [];
  (items || []).forEach(function(it){
    var st = it.store_name || '';
    if(!st) return;
    if(!by[st]){ by[st] = { store: st, rows: [] }; order.push(st); }
    by[st].rows.push(it);
  });
  order.sort();
  return order.map(function(k){ return by[k]; });
}

/* Имейлите на активните потребители на изброените обекти, групирани по обект.
   Един обект може да има няколко акаунта (управител + заместник) — всички
   получават. Обект без нито един акаунт връща празен масив и писмо не тръгва. */
function llStoreEmails(stores){
  var list = (stores || []).filter(function(s){ return !!s; });
  if(!list.length) return Promise.resolve({});
  return sbGet('users','active=eq.true&select=email,store_name&store_name=in.('+
      list.map(encodeURIComponent).join(',')+')').then(function(rows){
    var by = {};
    (Array.isArray(rows) ? rows : []).forEach(function(u){
      if(!u.email || !u.store_name) return;
      if(!by[u.store_name]) by[u.store_name] = [];
      if(by[u.store_name].indexOf(u.email) < 0) by[u.store_name].push(u.email);
    });
    return by;
  }).catch(function(){ return {}; });
}

/* ⚠️ pushToStores() при ПРАЗЕН списък пада към pushToAll() — известието би
   отишло до целия портал. Същият капан е описан в push.js при
   pushNewClientOrder/pushInterstoreDiff. Затова празният получател се спира
   ТУК, преди извикването, а не се разчита на pushToStores. */
function llPushTo(store, title, msg){
  var t = String(store || '').trim();
  if(!t) return Promise.resolve({ ok:false, status:0, data:{ message:'Няма получател' } });
  if(typeof pushToStores !== 'function'){
    return Promise.resolve({ ok:false, status:0, data:{ message:'push.js не е зареден' } });
  }
  return pushToStores([t], title, msg);
}
/* „Няма имейл" е ОТДЕЛНО от провал — виж llNotifySent(). Низът се сверява по
   стойност, затова се пипа само заедно с проверката там.

   htmlFn е ФУНКЦИЯ, не готов низ: сглобяването минава през emailWrap() от
   email.js и няма смисъл да се прави, преди да е ясно, че изобщо има кому да
   се прати. Така обект без акаунт не плаща за таблица, която никой няма да
   види, а липсващ email.js връща подреден отговор вместо ReferenceError по
   средата на известието. */
function llMailTo(emails, subject, htmlFn, attachments){
  var to = (emails || []).filter(function(e){ return !!e; });
  if(!to.length) return Promise.resolve({ ok:false, status:0, data:{ message:'Няма имейл' } });
  if(typeof sendEmail !== 'function' || typeof emailWrap !== 'function'){
    return Promise.resolve({ ok:false, status:0, data:{ message:'email.js не е зареден' } });
  }
  /* Празен масив НЕ се подава: sendEmail слага attachments само при дължина,
     но по-малко полета в тялото значи по-малко за грешене. */
  return (attachments && attachments.length)
    ? sendEmail(to, subject, htmlFn(), { attachments: attachments })
    : sendEmail(to, subject, htmlFn());
}

/* ─── HTML на писмата ───────────────────────────────────────
   emailWrap() идва от email.js и дава рамката (заглавка, footer, стилове).
   Таблиците долу са inline-стилизирани: имейл клиентите режат <style> блока
   в <head> при препращане, а бланка без рамки е нечетима. */
var LL_MAIL_TH = 'style="text-align:left;padding:5px 7px;font-size:11px;font-weight:700;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;"';
var LL_MAIL_TD = 'style="padding:5px 7px;font-size:12px;border:1px solid #e2e8f0;vertical-align:top;"';

function llMailMeta(list){
  var row = function(k, v){
    return '<tr><td style="padding:2px 10px 2px 0;font-size:12px;color:#64748b;">'+k+'</td>'+
           '<td style="padding:2px 0;font-size:12px;font-weight:600;">'+v+'</td></tr>';
  };
  var h = '<table style="border-collapse:collapse;margin-bottom:14px;">'+
    row('Склад:', esc(list.warehouse || '—'))+
    row('Дата на товарене:', fmtDate(list.list_date))+
    row('Товарил:', esc(list.executed_by || '—'))+
    '</table>';
  if(list.comment){
    h += '<div style="background:#f8fafc;border-left:3px solid #2563eb;padding:8px 12px;'+
      'border-radius:0 6px 6px 0;font-size:12.5px;margin-bottom:14px;">&#128172; '+esc(list.comment)+'</div>';
  }
  return h;
}
function llMailBtn(){
  return '<div style="text-align:center;margin-top:18px;">'+
    '<a href="'+LL_PORTAL_URL+'" style="display:inline-block;background:#2563eb;color:#fff;'+
    'padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">'+
    'Отвори портала &rarr;</a></div>';
}

/* Писмото ДО ОБЕКТА при изпращане — САМО неговите редове. */
function llSentHtmlFor(list, store, rows){
  var body = '<h2 style="color:#0f172a;margin:0 0 4px;font-size:19px;">🚛 Нов товарен лист</h2>'+
    '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">За <b>'+esc(store)+'</b> · '+
      llPalletGroups(rows).length+' товарни единици ('+rows.length+' реда)</p>'+
    llMailMeta(list);
  body += '<table style="width:100%;border-collapse:collapse;"><tr>'+
    '<th '+LL_MAIL_TH+'>Товарна единица</th><th '+LL_MAIL_TH+'>Стокова №</th>'+
    '<th '+LL_MAIL_TH+'>Коментар склад</th></tr>';
  rows.slice().sort(llByPosition).forEach(function(it){
    body += '<tr>'+
      '<td '+LL_MAIL_TD+'><b>'+esc(llKindLabel(it))+'</b>'+
        (llIsOversize(it.kind) && it.warehouse_comment
          ? '<div style="font-size:10.5px;color:#475569;font-weight:600;">'+esc(it.warehouse_comment)+'</div>' : '')+'</td>'+
      '<td '+LL_MAIL_TD+'>'+(it.purchase_doc ? esc(it.purchase_doc) : 'без')+
        (it.partial ? '<div style="font-size:10px;color:#92400e;">частично</div>' : '')+'</td>'+
      '<td '+LL_MAIL_TD+'>'+esc(it.warehouse_comment || '—')+'</td></tr>';
    /* Какво има на палета — компактно и сиво: писмото е „идва товар", не
       опис; описът е на хартия върху самия палет. Отделен ред с colspan,
       за да не разтяга колоните на таблицата с дълги имена. */
    if((it.products || []).length){
      body += '<tr><td colspan="3" style="padding:3px 7px 7px 18px;font-size:11px;color:#64748b;border:1px solid #e2e8f0;border-top:none;line-height:1.5;">'+
        it.products.map(function(p){
          return esc(p.sap_code)+' · '+esc(p.product_name)+' — '+llFmtQty(p.qty)+' '+esc(p.unit || '')+
            (p.cartons != null ? ' ('+p.cartons+' каш.)' : '');
        }).join('<br>')+'</td></tr>';
    }
  });
  body += '</table>'+llMailBtn();
  return emailWrap(body, 'Товарен лист · ТеМАХ Вътрешна платформа');
}

/* Писмото ДО СКЛАДА при приключване — ВСИЧКИ редове, по обекти. Складът е
   изпращачът: за него въпросът не е „какво получих", а „как мина курсът". */
function llClosedHtmlFor(list, items){
  items = llLiveRows(items);   /* отхвърленият ред не влиза в писмото (Г2) */
  var c = llCounts(items);
  var miss = c.missing > 0;
  var body = '<h2 style="color:'+(miss?'#b91c1c':'#16a34a')+';margin:0 0 4px;font-size:19px;">'+
      (miss ? '⛔ Товарен лист — приключен с липси' : '✅ Товарен лист — приключен')+'</h2>'+
    '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">получени <b>'+c.received+
      '</b> · неполучени <b style="color:'+(miss?'#b91c1c':'#64748b')+';">'+c.missing+
      '</b> от '+c.total+' реда</p>'+
    llMailMeta(list);
  body += '<table style="width:100%;border-collapse:collapse;"><tr>'+
    '<th '+LL_MAIL_TH+'>Товарна единица</th><th '+LL_MAIL_TH+'>Стокова №</th>'+
    '<th '+LL_MAIL_TH+'>Обект</th><th '+LL_MAIL_TH+'>Резултат</th>'+
    '<th '+LL_MAIL_TH+'>Коментар обект</th></tr>';
  llRowsByStore(items).forEach(function(g){
    g.rows.slice().sort(llByPosition).forEach(function(it){
      /* Червеният ред е СЪДЪРЖАНИЕ, не украса: писмото се чете по диагонал и
         липсата трябва да се хване от първия поглед. */
      var bg = it.missing ? ' style="background:#fef2f2;"' : '';
      var res = it.received
        ? '<span style="color:#16a34a;font-weight:600;">✅ получено</span>'
        : (it.missing
          ? '<span style="color:#dc2626;font-weight:700;">⛔ НЕПОЛУЧЕНО</span>'
          : '<span style="color:#94a3b8;">не е отметнато</span>');
      var who = it.received ? it.received_by : (it.missing ? it.missing_by : null);
      var when = it.received ? it.received_at : (it.missing ? it.missing_at : null);
      if(who || when){
        res += '<div style="font-size:10.5px;color:#64748b;">'+esc(who || '—')+
          (when ? ' · '+llFmtStamp(when) : '')+'</div>';
      }
      body += '<tr'+bg+'>'+
        '<td '+LL_MAIL_TD+'><b>'+esc(llKindLabel(it))+'</b>'+
          (llIsOversize(it.kind) && it.warehouse_comment
            ? '<div style="font-size:10.5px;color:#475569;font-weight:600;">'+esc(it.warehouse_comment)+'</div>' : '')+'</td>'+
        '<td '+LL_MAIL_TD+'>'+(it.purchase_doc ? esc(it.purchase_doc) : 'без')+'</td>'+
        '<td '+LL_MAIL_TD+'>'+esc(it.store_name || '—')+'</td>'+
        '<td '+LL_MAIL_TD+'>'+res+'</td>'+
        '<td '+LL_MAIL_TD+'>'+esc(it.store_comment || '—')+'</td></tr>';
    });
  });
  body += '</table>'+llMailBtn();
  return emailWrap(body, 'Товарен лист · ТеМАХ Вътрешна платформа');
}

/* ─── ПРИ ИЗПРАЩАНЕ ────────────────────────────────────────
   Вика се СЛЕД успешния PATCH. Не блокира екрана: бутонът вече е свършил
   работата си, а чакането на push + имейл по обект би замразило интерфейса
   за секунди при лист с десет обекта. */
function llNotifySent(list, items){
  var groups = llRowsByStore(items);
  if(!groups.length) return Promise.resolve([]);
  var dateTxt = fmtDate(list.list_date);
  var wh = list.warehouse || '';
  return llStoreEmails(groups.map(function(g){ return g.store; })).then(function(byStore){
    return Promise.all(groups.map(function(g){
      var units = llPalletGroups(g.rows).length;
      var title = '🚛 Нов товарен лист от ' + wh;
      var msg = units + ' товарни единици · ' + dateTxt +
        '. Отвори Транспорт → Товарни листи.';
      var subject = 'Товарен лист от ' + wh + ' · ' + dateTxt;
      /* Бланката като PDF. Провалът ѝ (липсваща библиотека, липсващ шрифт,
         паднала мрежа) НЕ спира писмото — то тръгва без приложение, а
         човекът разбира от жълтия toast долу. */
      var pdf = ((byStore[g.store] || []).length)
        ? llBuildPdf(list, g.rows, g.store).catch(function(e){
            console.error('llNotifySent: PDF', g.store, e);
            return null;
          })
        : Promise.resolve(null);
      return pdf.then(function(file){
        return Promise.all([
          llPushTo(g.store, title, msg),
          llMailTo(byStore[g.store] || [], subject, function(){
            return llSentHtmlFor(list, g.store, g.rows);
          }, file ? [{ filename: file.filename, content: file.base64 }] : null)
        ]).then(function(r){
          return { store: g.store, push: r[0], mail: r[1], pdf: !!file };
        });
      });
    }));
  }).then(function(all){
    /* Обект без нито един активен акаунт НЕ е провал на известието — няма кому
       да се прати. Брои се отделно, за да не вдига тревога за нещо, което се
       оправя в Администрация, а не по телефона. */
    var noMail = function(r){ return (r.mail.data || {}).message === 'Няма имейл'; };
    var bad = all.filter(function(r){ return !r.push.ok && !r.mail.ok && !noMail(r); });
    var missing = all.filter(noMail);
    /* Писмото е стигнало, но без бланката — отделно от провал на известието. */
    var noPdf = all.filter(function(r){ return r.mail.ok && !r.pdf; });
    if(bad.length){
      console.error('llNotifySent: известието не тръгна', bad);
      toast('⚠️ Листът е изпратен, но известието до ' +
        bad.map(function(r){ return r.store; }).join(', ') + ' не тръгна', '#d97706');
    } else if(missing.length){
      toast('⚠️ Листът е изпратен. Без имейл акаунт: ' +
        missing.map(function(r){ return r.store; }).join(', '), '#d97706');
    } else if(noPdf.length){
      toast('⚠️ Писмото тръгна БЕЗ PDF към ' +
        noPdf.map(function(r){ return r.store; }).join(', '), '#d97706');
    }
    return all;
  });
}

/* ─── ПРИ ПРИКЛЮЧВАНЕ ──────────────────────────────────────
   ЕДИН helper за двата пътя — автоматичния (последният ред на последния
   обект) и ръчния бутон на склада. Две копия щяха да се разминат при първата
   промяна на текста, а разминаването тук не гърми: складът просто получава
   различно писмо според това кой е затворил листа.

   Вика се САМО когато статусът РЕАЛНО е сменен. Извикване „за всеки случай"
   би пращало писмо при всяко отмятане по вече приключен лист.

   Редовете се ТЕГЛЯТ, не се подават: от магазинската страна llStoreItems
   съдържа само моите редове, а писмото до склада е за целия курс. */
function llNotifyClosed(list){
  if(!list || !list.id) return Promise.resolve(null);
  var wh = list.warehouse || '';
  var failed = function(){
    toast('⚠️ Листът е приключен, но известието до ' + (wh || 'склада') + ' не тръгна', '#d97706');
  };
  return sbGet('loading_list_items','list_id=eq.'+list.id+'&order=position.asc').then(function(rows){
    var items = Array.isArray(rows) ? rows : [];
    var c = llCounts(items);
    var miss = c.missing > 0;
    var dateTxt = fmtDate(list.list_date);
    var title = miss
      ? '⛔ Товарен лист ' + dateTxt + ' — с липси'
      : '✅ Товарен лист ' + dateTxt + ' приключен';
    var msg = 'получени ' + c.received + ' · неполучени ' + c.missing + ' от ' + c.total;
    var subject = (miss ? 'Товарен лист с ЛИПСИ · ' : 'Товарен лист приключен · ') + dateTxt;
    return llStoreEmails([wh]).then(function(byStore){
      return Promise.all([
        llPushTo(wh, title, msg),
        llMailTo(byStore[wh] || [], subject, function(){ return llClosedHtmlFor(list, items); })
      ]);
    }).then(function(r){
      if(!r[0].ok && !r[1].ok){
        console.error('llNotifyClosed: известието до склада не тръгна', wh, r);
        failed();
      }
      return { push: r[0], mail: r[1] };
    });
  }).catch(function(err){
    console.error('llNotifyClosed: грешка', err);
    failed();
    return null;
  });
}

/* ─── ИЗБОР НА СКЛАД (само за admin/logistics) ──────────────── */
/* Изпращачът може да е логистичен склад ИЛИ магазин (междускладов трансфер).
   Двете групи са разделени с optgroup, защото списъкът иначе става двайсет
   имена без ред и складовете се губят сред обектите.
   Собственият потребител на склад/магазин не избира — за него изпращачът е
   зададен и llActiveWarehouse() го връща. */
function llWarehouseSelectHtml(){
  if(isLogisticsWarehouseUser() || llIsSenderStore()) return '';
  var opt = function(w){
    return '<option'+(w===llWarehouse?' selected':'')+'>'+esc(w)+'</option>';
  };
  /* llStores идва от loadReportableStores(), а isReportableStore вече
     изключва логистичните складове и Централния офис — втори филтър тук би
     бил мъртъв код, който изглежда като защита. Смени ли се правилото,
     сменя се на ЕДНО място. */
  var shops = llStores || [];
  return '<select id="ll-wh" class="fi" onchange="llSetWarehouse(this.value)" style="max-width:260px;display:inline-block;width:auto;">'+
    '<option value="">-- Избери изпращач --</option>'+
    '<optgroup label="Логистични складове">'+LOGISTICS_WAREHOUSES.map(opt).join('')+'</optgroup>'+
    (shops.length ? '<optgroup label="Магазини">'+shops.map(opt).join('')+'</optgroup>' : '')+
    '</select>';
}
function llSetWarehouse(v){
  llWarehouse = v || '';
  llLists = []; llItems = [];
  loadLoadingLists();
}

/* Черновата е работен документ на склада — обектите не я виждат изобщо
   (llLoadStoreSide пуска само sent/done/partial). Това не личи отникъде и
   складът пита „защо не го виждат"; надписът отговаря, преди да се попита. */
function llDraftNoticeHtml(){
  return '<div data-ll-draft-notice="1" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:12.5px;">'+
    '📝 Черновата се вижда само тук. Обектите получават листа след „📤 Изпрати към обектите".</div>';
}

/* ─── СПИСЪК НА ЛИСТИТЕ ─────────────────────────────────────── */
function llSetStatusFilter(f){ llStatusFilter = f; renderLoadingLists(); }
/* Съвпада ли листът с търсенето: изходящ № (съдържа) по редовете му, обект
   по редовете му, склад по самия лист. Празно търсене пуска всичко. */
function llListMatches(l, q){
  var t = String(q == null ? '' : q).trim().toLowerCase();
  if(!t) return true;
  if(String(l.warehouse || '').toLowerCase().indexOf(t) >= 0) return true;
  return llItemsOf(l.id).some(function(i){
    return String(i.purchase_doc || '').toLowerCase().indexOf(t) >= 0 ||
           String(i.store_name || '').toLowerCase().indexOf(t) >= 0;
  });
}
function llSetListQuery(v){
  llListQuery = String(v == null ? '' : v);
  renderLoadingLists();
  var el = document.getElementById('ll-list-q');
  if(el){
    if(el.focus) el.focus();
    try { var n = el.value.length; el.setSelectionRange(n, n); } catch(e){}
  }
}
function llVisibleLists(){
  return llLists.filter(function(l){
    /* Търсенето И статусът се комбинират — чипът не се нулира от писането. */
    if(!llListMatches(l, llListQuery)) return false;
    if(llStatusFilter === 'all') return true;
    /* По подразбиране „Чернови + Изпратени": приключените са история и само
       биха удължавали списъка на човека, който товари днес. */
    if(llStatusFilter === 'open') return l.status === 'draft' || l.status === 'sent';
    /* „Приключени" показва и частично приключените: за склада и двете значат
       „обектът приключи с този лист". Разликата е ВИДИМА (бадж + отделен
       филтър), но не бива да я СКРИВА от общия изглед. */
    if(llStatusFilter === 'done') return l.status === 'done' || l.status === 'partial';
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

  var counts = { open:0, draft:0, sent:0, done:0, partial:0, all:llLists.length };
  llLists.forEach(function(l){
    if(counts.hasOwnProperty(l.status)) counts[l.status]++;
    if(l.status === 'draft' || l.status === 'sent') counts.open++;
  });
  /* Полето е НАД чиповете: първо се стеснява по текст, после по статус.
     Чиповете си остават видими и при търсене (правило 11) — иначе от „нищо
     не се намери" няма как да се излезе обратно към по-широк изглед. */
  h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center;">'+
    '<input id="ll-list-q" value="'+llAttr(llListQuery)+'" placeholder="Търси: изходящ №, обект, склад" autocomplete="off" '+
      'oninput="llSetListQuery(this.value)" style="flex:1 1 240px;min-width:180px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:13px;">'+
    (llListQuery ? '<button onclick="llSetListQuery(\'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 12px;font-size:12.5px;cursor:pointer;">✕ Изчисти</button>' : '')+
    '</div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  [['open','Текущи ('+counts.open+')'],
   ['draft','📝 Чернови ('+counts.draft+')'],
   ['sent','📤 Изпратени ('+counts.sent+')'],
   /* Броячът съвпада с това, което филтърът показва — done + partial. */
   ['done','✅ Приключени ('+(counts.done+counts.partial)+')'],
   ['partial','⛔ Частично ('+counts.partial+')'],
   ['all','Всички ('+counts.all+')']].forEach(function(f){
    var a = llStatusFilter === f[0];
    h += '<button data-f="'+f[0]+'" onclick="llSetStatusFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  var list = llVisibleLists();
  if(!list.length){
    return h + '<div style="text-align:center;padding:50px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:40px;">🚛</div><div style="margin-top:8px;">'+
      (llListQuery ? 'Нищо не отговаря на „'+esc(llListQuery)+'" в този статус.' : 'Няма товарни листи в този изглед.')+'</div></div>';
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
/* Складът пише лист от десет реда на хартия и ги попълва отгоре надолу.
   Празен редактор го кара да натиска „➕ Ред без документ" десет пъти, преди
   да започне работа. Незапълнените редове отпадат тихо при запис (виж
   llBlankRow) — затова десет предварителни реда не са „боклук в базата".
   СЪЩЕСТВУВАЩИТЕ чернови не се допълват: човек, който е оставил три реда, ги
   намира три. */
var LL_NEW_ROWS = 10;
function llBlankDraftRow(){
  return { id: null, kind: 'pallet', pallet_no: null, pallet_total: null,
           purchase_doc: null, clears_doc: null, store_name: '',
           warehouse_comment: '', partial: false, _docKey: null, products: [] };
}
/* Ред, който човекът НЕ е пипнал: без обект, без документ и без артикули.
   Коментарът и номерът на палет не го правят „попълнен" сами по себе си —
   без обект редът и без друго не може да се запише. */
function llBlankRow(it){
  return !!it && !String(it.store_name || '').trim() && !it.purchase_doc &&
    !(it.products && it.products.length);
}
function llNewList(){
  llCurrentId = null;
  llDocQuery = ''; llDocStore = '';
  llDraft = { list_date: llTodayISO(), executed_by: llActor(), comment: '', items: [] };
  for(var bi = 0; bi < LL_NEW_ROWS; bi++) llDraft.items.push(llBlankDraftRow());
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
  llDocQuery = ''; llDocStore = '';
  llDraft = {
    list_date: l.list_date, executed_by: l.executed_by || '',
    comment: l.comment || '',
    items: llItemsOf(l.id).map(function(it){
      return {
        id: it.id, kind: it.kind, pallet_no: it.pallet_no, pallet_total: it.pallet_total,
        purchase_doc: it.purchase_doc, clears_doc: it.clears_doc,
        store_name: it.store_name, warehouse_comment: it.warehouse_comment || '',
        partial: !!it.partial,
        /* _inCat е неизвестно за вече записан артикул — колона за това няма.
           Приема се, че е от каталога: маркерът „не е в каталога“ е за
           човека, който въвежда СЕГА, не история. */
        products: (it.products || []).map(function(pr){
          return { sap_code: pr.sap_code, product_name: pr.product_name, unit: pr.unit || '',
                   qty: pr.qty, cartons: pr.cartons, _inCat: true };
        })
      };
    })
  };
  llDraft._hadProducts = llDraft.items.some(function(it){ return (it.products || []).length; });
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
/* ВСИЧКИ чакащи редове на склада, на страници. Образецът е supplyGetAll() в
   supply.js — копие, не извикване: товарните листи не бива да зависят от
   модула за зареждане. Нарочно НЕ през sbGet: той връща [] при провал и
   паднала втора страница би изглеждала като „край на данните" — документ би
   изгубил половината си артикули, без да личи. Тук провалът отхвърля.
   order=id.asc е заради страниците: без стабилен ред един ред може да се
   падне на две страници, а друг — на нито една. */
function llTransitGetAll(query){
  var all = [];
  function page(offset){
    var url = API + '/goods_transit?' + query + '&order=id.asc&limit=' + LL_TRANSIT_PAGE + '&offset=' + offset;
    return fetch(url, { headers: H }).then(function(r){
      return r.json().catch(function(){ return null; }).then(function(d){
        if(!r.ok || !Array.isArray(d)) throw new Error((d && (d.message || d.hint)) || ('HTTP ' + r.status));
        all = all.concat(d);
        return d.length === LL_TRANSIT_PAGE ? page(offset + LL_TRANSIT_PAGE) : all;
      });
    });
  }
  return page(0);
}
/* Стойността е ТЕКСТ (app_settings е key/value от text). Само 'on' пуска
   блока: всичко останало — липсващ ключ, празно, боклук, паднала заявка —
   значи изключено. Образецът е reportKasaThreshold в report.js; разликата е,
   че тук безопасната посока е ИЗКЛЮЧЕНО, а не стойност по подразбиране. */
function llLoadTransitFlag(){
  return sbGet('app_settings','key=eq.loading_transit_docs&select=value&limit=1')
    .then(function(rows){
      var row = Array.isArray(rows) && rows.length ? rows[0] : null;
      var raw = row && row.value != null ? String(row.value).trim().toLowerCase() : '';
      return raw === 'on';
    })
    .catch(function(){ return false; });
}
function llLoadEditorData(){
  var wh = llActiveWarehouse();
  llTransitError = false;
  /* Флагът се чете ПРЕДИ снимката, не успоредно с нея: при изключен блок
     заявката към goods_transit изобщо не бива да тръгва — тя е най-скъпата
     в модула (хиляди реда) и без блок никой няма да види резултата ѝ. */
  return llLoadTransitFlag().then(function(on){
    llTransitDocsOn = on;
    return Promise.all([
      on
        ? llTransitGetAll('supplier=eq.' + encodeURIComponent(wh) + '&status=eq.pending' +
            '&select=purchase_doc,store_name,doc_date,created_at,material_code,material_name,ordered_qty,remaining_qty,unit,position')
            .catch(function(e){
              /* Снимката не се зареди — казва се, вместо да изглежда като „няма
                 документи". Редакторът продължава: листът се пише и без нея. */
              console.error('llLoadEditorData: goods_transit', e);
              llTransitError = true;
              toast('Стока на път не се зареди: ' + (e && e.message ? e.message : e), '#dc2626');
              return [];
            })
        : Promise.resolve([]),
      loadReportableStores()
    ]);
  }).then(function(res){
    llPendingDocs = llGroupTransitDocs(res[0]);
    /* Кога е наливана снимката. max, не min: при частично доналиване най-
       новото показва, че данните са поне толкова пресни. */
    llTransitSnapshot = null;
    (Array.isArray(res[0]) ? res[0] : []).forEach(function(r){
      if(r && r.created_at && (!llTransitSnapshot || r.created_at > llTransitSnapshot)) llTransitSnapshot = r.created_at;
    });
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
/* Копие на съдържанието на документа от снимката — за артикулите на реда.
   КОПИЕ: редът после се редактира свободно, а снимката остава каквато е. */
function llDocProductsCopy(d){
  var out = [], skipped = 0;
  (d && d.products || []).forEach(function(p){
    var q = llParseQty(p.qty);
    if(!p.sap_code || q == null){ skipped++; return; }
    out.push({ sap_code: p.sap_code, product_name: p.product_name, unit: p.unit || '',
               qty: q, cartons: null, _inCat: true });
  });
  return { list: out, skipped: skipped };
}
function llMaterializeDoc(d){
  /* pallet_total се оставя празно: то е „от колко" за ЦЕЛИЯ обект и се знае
     чак когато всички документи са разпределени. Смята се при запис
     (llRenumberPallets), а в редактора се показва от групирането. */
  var nums = llParsePalletSpec(d.pallet_spec);
  /* Артикулите отиват САМО в ПЪРВИЯ ред на документа. Документ върху палети
     1-3 не се разпределя сам, а копие във всеки ред би утроило стоката в
     описите, в писмото до обекта и в „⚠️ Разлика". Складът разпределя. */
  var copy = llDocProductsCopy(d);
  nums.forEach(function(n, k){
    llDraft.items.push({
      id: null, kind: 'pallet', pallet_no: n, pallet_total: null,
      purchase_doc: d.purchase_doc, clears_doc: null,
      store_name: d.store_name, warehouse_comment: '', partial: false,
      _docKey: llDocKey(d),
      products: k === 0 ? copy.list : []
    });
  });
  if(!copy.list.length) return;
  if(nums.length > 1){
    toast('📦 ' + copy.list.length + ' артикула от ' + d.purchase_doc + ' са на палет ' + nums[0] +
      ' — документът е на ' + nums.length + ' палета, премести каквото не е на него', '#d97706');
  } else {
    toast('📦 Копирани ' + copy.list.length + ' артикула от ' + d.purchase_doc +
      (copy.skipped ? ' (' + copy.skipped + ' без количество — пропуснати)' : ''));
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
  /* Обектът остава празен: при десет предварителни реда „първият обект по
     азбучен ред" би сложил мълчаливо грешен получател на всеки недокоснат ред. */
  llDraft.items.push(llBlankDraftRow());
  renderLoadingLists();
}
/* Подсказките на автодопълването са по ИНДЕКС на реда — преместен или махнат
   ред размества индексите и стара подсказка (или заявка, тръгнала преди
   300 ms) би паднала върху чужд ред. */
function llAcReset(){
  if(llAcTimer){ clearTimeout(llAcTimer); llAcTimer = null; }
  llAcSeq++;
  llAcResults = {};
}
function llRemoveRow(i){
  if(!llDraft) return;
  var it = llDraft.items[i];
  if(!it) return;
  llAcReset();
  if(it.id) sbDelete('loading_list_items','id=eq.'+it.id);
  llDraft.items.splice(i, 1);
  renderLoadingLists();
}
function llMoveRow(i, dir){
  if(!llDraft) return;
  var j = i + dir;
  if(j < 0 || j >= llDraft.items.length) return;
  llAcReset();
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
    if(!llIsNumbered(val)){ it.pallet_no = null; it.pallet_total = null; }
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

function llStoreOptions(sel){
  /* Изпращачът отпада от получателите: лист от Петрич за Петрич не е товар,
     а грешка, и би стигнал до собствената карта „Към мен" на същия човек.
     Заварена стойност се пази видима — иначе редакция на стар лист би я
     изтрила тихо при първото пре-рендиране. */
  var from = llActiveWarehouse();
  var opts = (llStores || []).filter(function(s){ return s !== from || s === sel; });
  /* „— избери обект —" е реален избор, не украса: редът без обект е празен
     ред, който при запис отпада. Без него селектът показва първия обект и
     човек може да запише лист за когото не трябва. */
  return '<option value=""'+(!sel?' selected':'')+'>— избери обект —</option>'+
    opts.map(function(s){
      return '<option'+(s===sel?' selected':'')+'>'+esc(s)+'</option>';
    }).join('');
}

/* ══════════════════════════════════════════════════════════
   АРТИКУЛИ ПО ПАЛЕТ (Пакет В1)

   „Стока на път" е месечна снимка (пълно зачистване и наливане, последно
   01.09.2026, документи до 25.08) и НЕ е оперативен източник. Товарният лист
   носи собственото си съдържание: всеки ред (палет / руло / насип) има своите
   артикули, защото всеки палет получава печатен опис.

   Артикулът е закачен за РЕДА в loading_list_items, не за документа.
   product_name и unit са КОПИЯ от каталога към момента на добавяне — листът е
   документ за това какво е натоварено ТОГАВА, и преименуван артикул в
   каталога не бива да пренаписва вече изпратен лист.

   Складът работи на телефон/таблет — затова двата пътя за добавяне са
   скенер и автодопълване, а не падащо меню със 106 000 реда. */

/* ─── Общи дребни ───────────────────────────────────────── */
/* Стойност за value="…". escVal() от shared.js НЕ бяга кавичката, а в
   каталога 1542 имена я съдържат (инчове: 1/2", 16") — всяко от тях би
   затворило атрибута и изсипало остатъка като markup. escAttr() бяга
   кавичката, но връща "—" за празно (през esc()), а празно поле трябва да
   е ПРАЗНО. Нулата също е стойност — escVal(0) дава "", което за „0 кашона"
   е грешно. */
function llAttr(v){
  if(v === null || v === undefined || v === "") return "";
  return escAttr(String(v));
}
/* „12,5" → 12.5. Празно, нула, отрицателно и боклук → null: количеството е
   задължително и строго положително, а „0 бройки" на палет е грешка при
   въвеждане, не информация. */
function llParseQty(v){
  var s = String(v == null ? '' : v).replace(',', '.').trim();
  if(!s || !/^\d*\.?\d+$/.test(s)) return null;
  var n = parseFloat(s);
  return (isFinite(n) && n > 0) ? n : null;
}
/* Кашоните са по желание: празно → null (не е попълнено), иначе цяло ≥ 0.
   undefined значи „невалидно" и спира добавянето — различно от „празно". */
function llParseCartons(v){
  var s = String(v == null ? '' : v).trim();
  if(!s) return null;
  if(!/^\d+$/.test(s)) return undefined;
  return parseInt(s, 10);
}
function llFmtQty(n){
  if(n == null || n === '') return '—';
  var x = Number(n);
  if(!isFinite(x)) return esc(String(n));
  return String(Math.round(x * 1000) / 1000).replace('.', ',');
}
function llProdSum(products){
  var s = 0;
  (products || []).forEach(function(p){ var x = Number(p.qty); if(isFinite(x)) s += x; });
  return Math.round(s * 1000) / 1000;
}
/* Празната форма на ред. Пази се в самия ред (it._pf), не в DOM-а: всяко
   пре-рендиране на редактора (стрелка, смяна на обект) би изтрило наполовина
   въведен артикул, ако стойностите живееха само в полетата. */
function llEmptyPf(){
  return { sap_code:'', product_name:'', unit:'', qty:'', cartons:'', _picked:false, _inCat:null };
}
function llPfOf(i){
  var it = llDraft && llDraft.items[i];
  if(!it) return null;
  if(!it._pf) it._pf = llEmptyPf();
  if(!Array.isArray(it.products)) it.products = [];
  return it._pf;
}
/* Термин за PostgREST or=(…): запетая, скоби, звезда и кавички са СИНТАКСИС
   там. Оставени в термина, те разцепват списъка и заявката или гърми, или —
   по-лошо — тихо търси нещо друго. */
function llCatTerm(q){
  return String(q == null ? '' : q).replace(/[,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
/* Един и същ баркод се чете различно според формата: UPC-A (12 цифри) идва
   като 12 или като EAN-13 с водеща нула. В каталога към 21.09.2026 има и
   двете форми (186 с 12 цифри, 204 с 13 и водеща 0) без нито едно
   припокриване, затова търсенето по двете форми не може да създаде фалшив
   дубликат — само хваща баркода, който иначе би бил „няма такъв". */
function llEanVariants(code){
  var c = String(code == null ? '' : code).replace(/\D/g, '');
  if(!c) return [];
  var out = [c];
  if(c.length === 12) out.push('0' + c);
  if(c.length === 13 && c.charAt(0) === '0') out.push(c.slice(1));
  return out;
}
/* Палетът е физическата единица: „два пъти на един палет" значи в който и да
   е ред със същия обект и номер. Руло/насип — само самият ред. */
function llSamePalletRows(i){
  var it = llDraft.items[i];
  if(!it) return [];
  if(it.kind !== 'pallet' || it.pallet_no == null) return [it];
  return llDraft.items.filter(function(x){
    return x.kind === 'pallet' && x.pallet_no != null &&
      Number(x.pallet_no) === Number(it.pallet_no) &&
      (x.store_name || '') === (it.store_name || '');
  });
}

/* ─── Разгъване на блока ────────────────────────────────── */
function llToggleProducts(i){
  var it = llDraft && llDraft.items[i];
  if(!it) return;
  /* Спрямо ДЕЙСТВИТЕЛНОТО състояние, не спрямо флага: редът се ражда без
     него, а !undefined е true — тоест първият клик „свиваше" вече отворен
     блок и на екрана не се случваше нищо. */
  it._prodOpen = (it._prodOpen === false);
  renderLoadingLists();
  if(it._prodOpen) llFocusPf(i, 'sap');
}
function llFocusPf(i, f){
  var el = document.getElementById('ll-pf-' + f + '-' + i);
  if(el && el.focus) el.focus();
}

/* ─── Полетата на формата ───────────────────────────────── */
/* Пише в it._pf БЕЗ пре-рендиране: пре-рендиране при всеки клавиш би взело
   фокуса от полето, в което човекът пише. */
function llPfInput(i, field, val){
  var pf = llPfOf(i);
  if(!pf) return;
  pf[field] = val;
  if(field === 'sap_code'){
    /* Промененият код вече не е този, който е избран от каталога. */
    pf._picked = false; pf._inCat = null;
    llAcSchedule(i, val);
  }
  if(field === 'product_name' && !pf._picked) pf._inCat = null;
}
function llPfKey(i, field, ev){
  if(!ev || (ev.key !== 'Enter' && ev.keyCode !== 13)) return;
  if(ev.preventDefault) ev.preventDefault();
  if(field === 'sap_code'){
    /* Една подсказка — Enter я взима. Иначе фокусът отива към бройките и
       кодът ще се провери точно при добавяне. */
    var r = llAcResults[i] || [];
    if(r.length === 1){ llAcPick(i, 0); return; }
    llFocusPf(i, 'qty');
    return;
  }
  if(field === 'qty' || field === 'cartons') llAddProduct(i);
}

/* ─── Автодопълване от каталога ─────────────────────────── */
function llAcSchedule(i, val){
  if(llAcTimer) clearTimeout(llAcTimer);
  var term = llCatTerm(val);
  if(term.length < 3){ llAcResults[i] = []; llAcRender(i); return; }
  llAcTimer = setTimeout(function(){ llAcTimer = null; llAcFetch(i, term); }, 300);
}
function llAcFetch(i, term){
  var seq = ++llAcSeq;
  var t = encodeURIComponent(term);
  return sbGet('product_catalog',
    'or=(sap_code.ilike.' + t + '*,product_name.ilike.*' + t + '*)' +
    '&select=sap_code,product_name,default_unit&order=sap_code.asc&limit=8'
  ).then(function(rows){
    /* По-стар отговор, дошъл след по-нов, не бива да презапише списъка —
       иначе подсказките отговарят на „шуро", когато в полето пише „шуроп". */
    if(seq !== llAcSeq) return;
    llAcResults[i] = Array.isArray(rows) ? rows : [];
    llAcRender(i);
  });
}
function llAcRender(i){
  var box = document.getElementById('ll-pf-ac-' + i);
  if(!box) return;
  var r = llAcResults[i] || [];
  if(!r.length){ box.innerHTML = ''; box.style.display = 'none'; return; }
  box.innerHTML = r.map(function(p, k){
    return '<div data-i="'+i+'" data-k="'+k+'" onmousedown="event.preventDefault()" onclick="llAcPick(+this.dataset.i,+this.dataset.k)" '+
      'style="padding:7px 9px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12.5px;">'+
      '<b style="font-family:DM Mono,monospace;">'+esc(p.sap_code)+'</b> · '+esc(p.product_name)+
      (p.default_unit ? ' <span style="color:#94a3b8;">('+esc(p.default_unit)+')</span>' : '')+'</div>';
  }).join('');
  box.style.display = 'block';
}
/* Избор на подсказка: попълва и трите полета И паметта, после фокус в
   бройките — там е следващото, което човекът трябва да въведе. */
function llAcPick(i, k){
  var p = (llAcResults[i] || [])[k];
  var pf = llPfOf(i);
  if(!p || !pf) return;
  llPfFromCatalog(i, p);
  llAcResults[i] = [];
  llAcRender(i);
  llFocusPf(i, 'qty');
}
function llPfFromCatalog(i, p){
  var pf = llPfOf(i);
  if(!pf) return;
  pf.sap_code = p.sap_code || '';
  pf.product_name = p.product_name || '';
  pf.unit = p.default_unit || '';
  pf._picked = true; pf._inCat = true;
  [['sap', pf.sap_code], ['name', pf.product_name], ['unit', pf.unit]].forEach(function(x){
    var el = document.getElementById('ll-pf-' + x[0] + '-' + i);
    if(el) el.value = x[1];
  });
}

/* ─── Добавяне ──────────────────────────────────────────── */
/* Кодът, въведен на ръка (без избрана подсказка), се проверява ТОЧНО срещу
   каталога. Намерен — името и мярката идват оттам. Не е намерен — складът НЕ
   се спира: иска се име на ръка и редът се маркира „не е в каталога".
   Проверката е при добавяне, не при писане, за да няма заявка на всеки клавиш. */
function llAddProduct(i){
  var it = llDraft && llDraft.items[i];
  var pf = llPfOf(i);
  if(!it || !pf) return Promise.resolve(false);
  var code = String(pf.sap_code || '').trim();
  if(!code){ toast('Въведи SAP код','#dc2626'); llFocusPf(i, 'sap'); return Promise.resolve(false); }
  var qty = llParseQty(pf.qty);
  if(qty == null){ toast('Бройките трябва да са число по-голямо от 0','#dc2626'); llFocusPf(i, 'qty'); return Promise.resolve(false); }
  var cartons = llParseCartons(pf.cartons);
  if(cartons === undefined){ toast('Кашоните са цяло число','#dc2626'); llFocusPf(i, 'ctn'); return Promise.resolve(false); }

  var ready = pf._picked
    ? Promise.resolve(true)
    : sbGet('product_catalog', 'sap_code=eq.' + encodeURIComponent(code) +
        '&select=sap_code,product_name,default_unit&limit=1').then(function(rows){
        var hit = Array.isArray(rows) && rows.length ? rows[0] : null;
        if(hit){
          pf.product_name = hit.product_name || pf.product_name;
          pf.unit = hit.default_unit || pf.unit;
          pf._inCat = true;
          return true;
        }
        pf._inCat = false;
        return true;
      });

  return ready.then(function(){
    var name = String(pf.product_name || '').trim();
    if(!name){
      toast('Кодът го няма в каталога — въведи име на ръка','#d97706');
      llFocusPf(i, 'name');
      return false;
    }
    /* Един и същ код два пъти на един палет е ПОЗВОЛЕН — различни партиди
       съществуват. Но двойното сканиране по погрешка е много по-често,
       затова се казва на глас. */
    var dup = llSamePalletRows(i).some(function(r){
      return (r.products || []).some(function(p){ return String(p.sap_code) === code; });
    });
    it.products.push({
      sap_code: code, product_name: name, unit: String(pf.unit || '').trim(),
      qty: qty, cartons: cartons, _inCat: pf._inCat !== false
    });
    if(dup) toast('⚠️ ' + code + ' вече е на този палет — добавен отново (друга партида?)','#d97706');
    it._pf = llEmptyPf();
    it._prodOpen = true;
    llAcResults[i] = [];
    renderLoadingLists();
    llFocusPf(i, 'sap');
    return true;
  });
}
function llRemoveProduct(i, j){
  var it = llDraft && llDraft.items[i];
  if(!it || !it.products || !it.products[j]) return;
  it.products.splice(j, 1);
  renderLoadingLists();
}

/* ─── „Вземи артикулите" от Стока на път ─────────────────
   Документът от снимката може да е остарял — затова копирането е с бутон, а
   не автоматично при отмятане на документа: складът решава дали съдържанието
   от 01.09 още е вярно. Документ, разстлан върху няколко палета, НЕ се
   разпределя сам — копира се в този ред и излишното се маха на ръка. */
/* „↺ Отново от Стока на път" — за реда, чиито артикули складът е изтрил или
   объркал и иска отначало. ЗАМЕНЯ, не добавя: добавяне към вече копираните би
   дублирало всичко. Ако на реда има артикули — пита, защото ръчните промени
   се губят. Снимката е вече заредена в llPendingDocs — нова заявка само ако
   документът го няма там (напр. снимката е наливана наново). */
function llTakeTransitProducts(i){
  var it = llDraft && llDraft.items[i];
  if(!it || !it.purchase_doc) return Promise.resolve(0);
  if((it.products || []).length &&
     !confirm('Замени ' + it.products.length + ' артикула на реда с тези от Стока на път?')) return Promise.resolve(0);
  var key = llDocKey({ purchase_doc: it.purchase_doc, store_name: it.store_name });
  var d = llPendingDocs.find(function(x){ return llDocKey(x) === key; });
  if(d) return Promise.resolve(llApplyTransitProducts(i, d.products));
  return sbGet('goods_transit', 'purchase_doc=eq.' + encodeURIComponent(it.purchase_doc) +
    '&store_name=eq.' + encodeURIComponent(it.store_name || '') +
    '&select=material_code,material_name,ordered_qty,remaining_qty,unit,position').then(function(rows){
    var list = (Array.isArray(rows) ? rows : []).slice().sort(function(a, b){
      /* position е ТЕКСТ в goods_transit — „10" < „2" лексикографски. */
      return (parseInt(a.position, 10) || 0) - (parseInt(b.position, 10) || 0);
    }).map(function(r){
      return { sap_code: r.material_code ? String(r.material_code) : '', product_name: r.material_name || '',
               unit: r.unit || '', qty: llTransitQty(r) };
    });
    return llApplyTransitProducts(i, list);
  });
}
function llApplyTransitProducts(i, source){
  var it = llDraft && llDraft.items[i];
  if(!it) return 0;
  var copy = llDocProductsCopy({ products: source });
  if(!copy.list.length){ toast('Документът няма артикули в Стока на път','#d97706'); return 0; }
  it.products = copy.list;
  it._prodOpen = true;
  var n = copy.list.length;
  /* Документ върху няколко реда (напр. палети 1-3) НЕ се разпределя сам:
     целият списък отива в този ред. Казва се на глас, иначе описът на
     палет 1 ще носи стоката и на 2 и 3. */
  var docKey = llItemDocKey(it), rowsOfDoc = llDraft.items.filter(function(x){
    return llItemDocKey(x) === docKey && (x.store_name || '') === (it.store_name || '');
  }).length;
  if(rowsOfDoc > 1){
    toast('📦 Взети ' + n + ' артикула — документът е на ' + rowsOfDoc + ' реда, махни от този каквото не е на него','#d97706');
  } else {
    toast('📦 Взети ' + n + ' артикула от документ ' + it.purchase_doc);
  }
  renderLoadingLists();
  return n;
}

/* ─── Блокът в редактора ────────────────────────────────── */
var LL_PF_IN = 'border:1px solid #cbd5e1;border-radius:6px;padding:7px 8px;font-size:13px;';
function llProductsBlockHtml(it, i){
  var pr = it.products || [];
  /* РАЗГЪНАТ по подразбиране: артикулите са същината на реда, а зад бутон
     складът просто не ги въвеждаше. Тества се срещу false, не срещу истина —
     редовете се раждат на четири места (празна чернова, „Добави нов ред",
     материализиран документ, извънреден ред от обекта) и нито едно от тях не
     бива да помни да вдига флага. Свиването остава: llToggleProducts пише
     изричното false. */
  var open = it._prodOpen !== false;
  var h = '<div style="padding:4px 0 6px;">'+
    '<button data-i="'+i+'" onclick="llToggleProducts(+this.dataset.i)" style="border:none;background:none;color:#4f46e5;font-size:12px;font-weight:600;cursor:pointer;padding:2px 0;">'+
      (open ? '▾' : '▸')+' Артикули ('+pr.length+')'+
      (pr.length ? ' <span style="color:#94a3b8;font-weight:400;">· '+llFmtQty(llProdSum(pr))+'</span>' : '')+
    '</button>';
  if(!open) return h + '</div>';

  var pf = it._pf || llEmptyPf();
  h += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px;margin-top:4px;">';
  /* Формата — flex-wrap, защото складът е на телефон: на тесен екран полетата
     слизат едно под друго, вместо да изтичат вдясно. */
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;">'+
    '<button data-i="'+i+'" onclick="llOpenScanner(+this.dataset.i)" style="border:none;background:#0f172a;color:#fff;border-radius:6px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;">📷 Сканирай</button>'+
    '<div style="position:relative;flex:1 1 130px;min-width:120px;">'+
      '<input id="ll-pf-sap-'+i+'" data-i="'+i+'" value="'+llAttr(pf.sap_code)+'" placeholder="SAP код или име" autocomplete="off" '+
        'oninput="llPfInput(+this.dataset.i,\'sap_code\',this.value)" onkeydown="llPfKey(+this.dataset.i,\'sap_code\',event)" '+
        'style="'+LL_PF_IN+'width:100%;box-sizing:border-box;font-family:DM Mono,monospace;">'+
      '<div id="ll-pf-ac-'+i+'" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:20;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 6px 16px rgba(0,0,0,.12);max-height:260px;overflow-y:auto;"></div>'+
    '</div>'+
    '<input id="ll-pf-name-'+i+'" data-i="'+i+'" value="'+llAttr(pf.product_name)+'" placeholder="Име" '+
      'oninput="llPfInput(+this.dataset.i,\'product_name\',this.value)" style="'+LL_PF_IN+'flex:2 1 180px;min-width:150px;">'+
    '<input id="ll-pf-unit-'+i+'" data-i="'+i+'" value="'+llAttr(pf.unit)+'" placeholder="Мярка" '+
      'oninput="llPfInput(+this.dataset.i,\'unit\',this.value)" style="'+LL_PF_IN+'width:64px;">'+
    '<input id="ll-pf-qty-'+i+'" data-i="'+i+'" value="'+llAttr(pf.qty)+'" placeholder="Бройки *" inputmode="decimal" '+
      'oninput="llPfInput(+this.dataset.i,\'qty\',this.value)" onkeydown="llPfKey(+this.dataset.i,\'qty\',event)" style="'+LL_PF_IN+'width:84px;">'+
    '<input id="ll-pf-ctn-'+i+'" data-i="'+i+'" value="'+llAttr(pf.cartons)+'" placeholder="Кашони" inputmode="numeric" '+
      'oninput="llPfInput(+this.dataset.i,\'cartons\',this.value)" onkeydown="llPfKey(+this.dataset.i,\'cartons\',event)" style="'+LL_PF_IN+'width:74px;">'+
    '<button data-i="'+i+'" onclick="llAddProduct(+this.dataset.i)" style="border:none;background:#16a34a;color:#fff;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;">➕ Добави</button>'+
    /* „Отново от Стока на път" върши работа само докато снимката я има. */
    (it.purchase_doc && llTransitDocsOn
      ? '<button data-i="'+i+'" onclick="llTakeTransitProducts(+this.dataset.i)" title="Заменя артикулите на реда с тези на документа от Стока на път (снимката)" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#6d28d9;border-radius:6px;padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer;">↺ Отново от Стока на път</button>'
      : '')+
    '</div>';

  if(pr.length){
    /* Кодовете, които се повтарят на палета — за маркера „×2". */
    var seen = {};
    llSamePalletRows(i).forEach(function(r){
      (r.products || []).forEach(function(p){ seen[p.sap_code] = (seen[p.sap_code] || 0) + 1; });
    });
    h += '<div style="overflow-x:auto;margin-top:8px;"><table data-ll-products="'+i+'" style="width:100%;border-collapse:collapse;font-size:12.5px;">'+
      '<tr style="color:#64748b;text-align:left;"><th style="padding:4px 6px;">SAP код</th><th style="padding:4px 6px;">Име</th>'+
      '<th style="padding:4px 6px;">Мярка</th><th style="padding:4px 6px;text-align:right;">Бройки</th>'+
      '<th style="padding:4px 6px;text-align:right;">Кашони</th><th></th></tr>';
    pr.forEach(function(p, j){
      h += '<tr style="border-top:1px solid #e2e8f0;">'+
        '<td style="padding:4px 6px;font-family:DM Mono,monospace;white-space:nowrap;">'+esc(p.sap_code)+
          (seen[p.sap_code] > 1 ? ' <span title="Същият код е на палета повече от веднъж" style="color:#d97706;font-weight:700;">×'+seen[p.sap_code]+'</span>' : '')+'</td>'+
        '<td style="padding:4px 6px;">'+esc(p.product_name)+
          (p._inCat === false ? ' <span data-not-in-catalog="1" style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:20px;padding:0 6px;font-size:10px;font-weight:700;white-space:nowrap;">не е в каталога</span>' : '')+'</td>'+
        '<td style="padding:4px 6px;color:#64748b;">'+esc(p.unit || '—')+'</td>'+
        '<td style="padding:4px 6px;text-align:right;font-weight:600;">'+llFmtQty(p.qty)+'</td>'+
        '<td style="padding:4px 6px;text-align:right;">'+(p.cartons != null ? p.cartons : '—')+'</td>'+
        '<td style="padding:4px 6px;text-align:right;"><button data-i="'+i+'" data-j="'+j+'" onclick="llRemoveProduct(+this.dataset.i,+this.dataset.j)" title="Махни артикула" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:4px;padding:1px 7px;font-size:11px;cursor:pointer;">✕</button></td>'+
        '</tr>';
    });
    h += '</table></div>';
  }
  h += '</div></div>';
  return h;
}

/* ─── Скенер (html5-qrcode) ─────────────────────────────
   Зарежда се САМО при първото „Сканирай" — 375 KB и достъп до камера нямат
   работа в сесия, в която никой не сканира. Образецът е SheetJS в supply.js,
   плюс integrity: скрипт с достъп до камерата се взима само ако е байт в байт
   този, който е проверен (SRI от cdnjs за 2.3.8).

   ГЛОБАЛИ ОТ БИБЛИОТЕКАТА (не от този файл): __Html5QrcodeLibrary__,
   Html5Qrcode, Html5QrcodeScanner, Html5QrcodeSupportedFormats,
   Html5QrcodeScannerState, Html5QrcodeScanType — шест имена, сверени на
   21.09.2026 с 0 колизии в портала. Тукашният код ползва само Html5Qrcode и
   Html5QrcodeSupportedFormats. */
var LL_SCAN_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
var LL_SCAN_SRI = 'sha512-r6rDA7W6ZeQhvl8S7yRVQUKVHdexq+GAlNkNNqVC7YyIV+NwqCTJe2hDWCiffTyRNOeGEzRRJ9ifvRm/HCzGYg==';

function llLoadScanLib(){
  if(window.Html5Qrcode) return Promise.resolve(true);
  /* Второ натискане, докато първото още зарежда, чака СЪЩОТО зареждане —
     иначе скриптът се вмъква два пъти. */
  if(llScanLibPromise) return llScanLibPromise;
  llScanLibPromise = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = LL_SCAN_LIB;
    s.setAttribute('integrity', LL_SCAN_SRI);
    s.setAttribute('crossorigin', 'anonymous');
    s.setAttribute('referrerpolicy', 'no-referrer');
    s.onload = function(){ resolve(true); };
    s.onerror = function(){
      /* Провалът НЕ остава кеширан — следващото натискане опитва наново
         (мрежата на склада идва и си отива). */
      llScanLibPromise = null;
      reject(new Error('scan lib'));
    };
    document.head.appendChild(s);
  });
  return llScanLibPromise;
}

function llOpenScanner(i){
  if(!llDraft || !llDraft.items[i]) return;
  llLoadScanLib().then(function(){
    llScanShowModal(i);
  }, function(){
    toast('Скенерът не се зареди — въведи SAP кода на ръка','#dc2626');
    llFocusPf(i, 'sap');
  });
}
/* ─── Камерата: фокус, резолюция, рамка, фенер ───────────────
   Гланцираното фолио отразява лампата точно върху черните линии и
   автофокусът „ловува" по отблясъка. Първата версия искаше само
   facingMode и декодерът получаваше размазан кадър в ниска резолюция.

   КЪДЕ ОТИВА КАКВО (сверено с html5-qrcode 2.3.8, 21.09.2026):
     · formatsToSupport и experimentalFeatures се четат от КОНСТРУКТОРА
       (new Html5Qrcode(id, config)). Подадени на start(), библиотеката ги
       пренебрегва мълчаливо — затова стоят там.
     · videoConstraints, qrbox, fps — в конфигурацията на start().
     · Фокусът/зумът/фенерът се прилагат СЛЕД старта върху живия трак.

   Всичко е ideal/advanced, нищо не е „задължително": непостижима стойност
   се пропуска, вместо getUserMedia да откаже камерата изобщо. */
function llScanStartConfig(){
  return {
    fps: 15,
    /* 1D кодът е широк и нисък — рамка ~85% ширина × 30% височина от
       визьора. Библиотеката отказва рамка под 50px, затова долна граница. */
    qrbox: function(vw, vh){
      var w = Math.floor((vw || 0) * 0.85), h = Math.floor((vh || 0) * 0.30);
      return { width: Math.max(50, Math.min(w, vw || w)), height: Math.max(50, Math.min(h, vh || h)) };
    },
    videoConstraints: {
      facingMode: 'environment',
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }]
    }
  };
}
/* applyVideoConstraints може да ХВЪРЛИ синхронно (невалидни ограничения,
   скенерът вече спрян) или да ОТХВЪРЛИ (телефонът не поддържа). И двете са
   „не стана" — никое не бива да спре сканирането. Връща true/false. */
function llScanApply(inst, c){
  try {
    if(!inst || typeof inst.applyVideoConstraints !== 'function') return Promise.resolve(false);
    var p = inst.applyVideoConstraints(c);
    /* Библиотеката връща обещание; синхронен отговор без хвърляне е успех. */
    if(!p || typeof p.then !== 'function') return Promise.resolve(true);
    return p.then(function(){ return true; }, function(e){
      console.warn('llScan: ограниченията не бяха приети', c, e);
      return false;
    });
  } catch(e){
    console.warn('llScan: ограниченията не бяха приети', c, e);
    return Promise.resolve(false);
  }
}
function llScanAfterStart(inst){
  /* Модалът може да е затворен, докато камерата е тръгвала. */
  if(!llScan || llScan.inst !== inst) return Promise.resolve(false);
  var caps = null;
  try { caps = inst.getRunningTrackCapabilities ? inst.getRunningTrackCapabilities() : null; } catch(e){ caps = null; }
  var adv = [{ focusMode: 'continuous' }];
  /* Зум 2 — по-близо до малкия код, без човекът да доближава телефона
     толкова, че да излезе от фокус. Щом тракът казва обхвата си — не повече
     от максимума; казва ли, че зум няма — не се иска. Не казва ли нищо —
     опитва се, провалът е безвреден. */
  if(caps && caps.zoom && typeof caps.zoom.max === 'number'){
    var z = Math.min(2, caps.zoom.max);
    if(z > (typeof caps.zoom.min === 'number' ? caps.zoom.min : 1)) adv.push({ zoom: z });
  } else if(!caps){
    adv.push({ zoom: 2 });
  }
  var done = llScanApply(inst, { advanced: adv });
  llScan.torchOk = !!(caps && caps.torch);
  var tb = document.getElementById('ll-scan-torch');
  if(tb) tb.style.display = llScan.torchOk ? '' : 'none';
  return done;
}
/* Фенерът помага и при отблясък (равномерна светлина отпред гаси
   петното от лампата на тавана), и на тъмна рампа. */
function llScanToggleTorch(){
  if(!llScan || !llScan.inst || !llScan.torchOk) return Promise.resolve(false);
  var on = !llScan.torch, s = llScan;
  return llScanApply(s.inst, { advanced: [{ torch: on }] }).then(function(ok){
    if(!ok){ toast('Фенерът не се включи на този телефон','#d97706'); return false; }
    s.torch = on;
    var tb = document.getElementById('ll-scan-torch');
    if(tb){
      tb.style.background = on ? '#fde68a' : '#fff';
      tb.textContent = on ? '🔦 Изключи' : '🔦 Фенер';
    }
    return true;
  });
}
function llScanShowModal(i){
  llScanClose();
  var m = document.createElement('div');
  m.id = 'll-scan-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(15,23,42,.85);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:14px;overflow-y:auto;';
  m.innerHTML =
    '<div style="width:100%;max-width:480px;background:#fff;border-radius:12px;padding:12px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'+
        '<div style="font-size:15px;font-weight:700;">📷 Сканиране — поредно</div>'+
        '<div style="display:flex;gap:6px;">'+
          /* Скрит, докато не се знае дали тракът има фенер — виж llScanAfterStart. */
          '<button id="ll-scan-torch" onclick="llScanToggleTorch()" style="display:none;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:8px 12px;font-size:14px;font-weight:600;cursor:pointer;">🔦 Фенер</button>'+
          '<button onclick="llScanClose()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:600;cursor:pointer;">Готово</button>'+
        '</div>'+
      '</div>'+
      '<div id="ll-scan-view" style="width:100%;min-height:220px;background:#000;border-radius:8px;overflow:hidden;"></div>'+
      /* Подсказката е ИЗВЪН панела: панелът се пренаписва при всяко
         сканиране и би я изтрил. Ъгълът е реалният трик срещу отблясъка —
         директно отгоре лампата се отразява точно върху черните линии. */
      '<div id="ll-scan-hint" style="margin-top:6px;font-size:12px;color:#64748b;text-align:center;">Дръж кода в рамката, леко под ъгъл при гланц</div>'+
      '<div id="ll-scan-panel" style="margin-top:10px;font-size:13px;color:#475569;">Насочи камерата към баркода.</div>'+
    '</div>';
  document.body.appendChild(m);
  llScan = { row: i, inst: null, pending: null, choices: null, busy: false, last: '', lastAt: 0,
             torchOk: false, torch: false };

  var fmts;
  try {
    var F = window.Html5QrcodeSupportedFormats;
    /* Само линейните кодове по стоката — по-бързо и без фалшиви попадения от
       QR кодове по опаковките. */
    fmts = F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128] : undefined;
  } catch(e){ fmts = undefined; }
  try {
    var inst = new window.Html5Qrcode('ll-scan-view', {
      formatsToSupport: fmts,
      /* Родният BarcodeDetector (Chrome на Android) чете EAN много по-добре от
         JS декодера; където го няма, библиотеката пада към своя. */
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
    llScan.inst = inst;
    /* Първият аргумент остава: библиотеката го ползва, ако videoConstraints
       бъде отхвърлен. Приеме ли ги, facingMode оттук се пренебрегва — затова
       е и вътре във videoConstraints. */
    inst.start({ facingMode: 'environment' }, llScanStartConfig(),
      function(text){ llScanOnRead(text); }, function(){ /* кадър без код — нормално */ }
    ).then(function(){
      llScanAfterStart(inst);
    }, function(){
      llScanPanel('<span style="color:#dc2626;font-weight:600;">Няма достъп до камерата.</span> Разреши камерата в браузъра или въведи кода на ръка.');
    });
  } catch(e){
    llScanPanel('<span style="color:#dc2626;font-weight:600;">Скенерът не тръгна.</span> Въведи кода на ръка.');
  }
}
function llScanPanel(html){
  var p = document.getElementById('ll-scan-panel');
  if(p) p.innerHTML = html;
}
/* Камерата вижда един и същ баркод в няколко поредни кадъра. Без паузата
   едно физическо сканиране би добавило артикула пет пъти. */
function llScanOnRead(text){
  if(!llScan || llScan.busy || llScan.pending || llScan.choices) return;
  var now = Date.now();
  if(text === llScan.last && now - llScan.lastAt < 1500) return;
  llScan.last = text; llScan.lastAt = now;
  llScan.busy = true;
  try { if(llScan.inst && llScan.inst.pause) llScan.inst.pause(true); } catch(e){}
  llHandleScannedEan(llScan.row, text).then(function(){ if(llScan) llScan.busy = false; });
}
function llScanResume(){
  if(!llScan) return;
  llScan.pending = null; llScan.choices = null;
  try { if(llScan.inst && llScan.inst.resume) llScan.inst.resume(); } catch(e){}
  llScanPanel('Насочи камерата към следващия баркод.');
}
function llScanClose(){
  var s = llScan;
  llScan = null;
  if(s && s.inst){
    try {
      var st = s.inst.stop();
      if(st && st.then) st.then(function(){ try { s.inst.clear(); } catch(e){} }, function(){});
    } catch(e){}
  }
  var m = document.getElementById('ll-scan-modal');
  if(m && m.parentNode) m.parentNode.removeChild(m);
}

/* ОБРАБОТКАТА НА ПРОЧЕТЕН КОД — единствената част от скенера, която се
   тества: камерата и библиотеката не съществуват в jsdom.
     0 резултата → „Няма такъв баркод", скенерът се затваря и фокусът е в
                   „SAP код": артикулът иска човешко внимание;
     1 резултат  → попълва кода/името/мярката и пита за бройки в модала;
     2+          → малък избор. */
function llHandleScannedEan(i, code){
  var vars = llEanVariants(code);
  if(!vars.length){
    toast('Прочетеният код не е баркод','#d97706');
    llScanResume();
    return Promise.resolve(0);
  }
  var q = vars.length === 1
    ? 'ean_code=eq.' + encodeURIComponent(vars[0])
    : 'ean_code=in.(' + vars.map(encodeURIComponent).join(',') + ')';
  return sbGet('product_catalog', q + '&select=sap_code,product_name,default_unit&limit=2').then(function(rows){
    var r = Array.isArray(rows) ? rows : [];
    if(!r.length){
      toast('Няма такъв баркод в каталога','#d97706');
      llScanClose();
      var pf = llPfOf(i);
      if(pf){ pf._picked = false; pf._inCat = null; }
      llFocusPf(i, 'sap');
      return 0;
    }
    if(r.length === 1){ llScanOffer(i, r[0]); return 1; }
    if(llScan) llScan.choices = r;
    llScanPanel('<div style="font-weight:600;margin-bottom:6px;">Баркодът съвпада с '+r.length+' артикула — избери:</div>'+
      r.map(function(p, k){
        return '<button data-k="'+k+'" onclick="llScanPick(+this.dataset.k)" style="display:block;width:100%;text-align:left;border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:8px 10px;margin-bottom:5px;font-size:13px;cursor:pointer;">'+
          '<b style="font-family:DM Mono,monospace;">'+esc(p.sap_code)+'</b> · '+esc(p.product_name)+'</button>';
      }).join('')+
      '<button onclick="llScanResume()" style="border:none;background:none;color:#64748b;font-size:12px;cursor:pointer;">Пропусни</button>');
    return r.length;
  });
}
function llScanPick(k){
  if(!llScan || !llScan.choices) return;
  var p = llScan.choices[k];
  llScan.choices = null;
  if(p) llScanOffer(llScan.row, p);
}
/* Намереният артикул влиза във формата на реда (it._pf) — ЕДНО място за
   състоянието, независимо дали кодът е дошъл от камерата или от клавиатурата.
   Модалът само показва бройките и „Добави". */
function llScanOffer(i, p){
  llPfFromCatalog(i, p);
  var pf = llPfOf(i);
  if(llScan) llScan.pending = p;
  var qid = 'll-scan-qty', cid = 'll-scan-ctn';
  llScanPanel(
    '<div style="font-weight:700;color:#0f172a;margin-bottom:6px;"><span style="font-family:DM Mono,monospace;">'+esc(p.sap_code)+'</span> · '+esc(p.product_name)+'</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'+
      '<input id="'+qid+'" data-i="'+i+'" value="'+llAttr(pf ? pf.qty : '')+'" placeholder="Бройки *" inputmode="decimal" '+
        'oninput="llPfInput(+this.dataset.i,\'qty\',this.value)" onkeydown="llScanKey(event)" style="'+LL_PF_IN+'width:110px;font-size:16px;">'+
      '<input id="'+cid+'" data-i="'+i+'" value="'+llAttr(pf ? pf.cartons : '')+'" placeholder="Кашони" inputmode="numeric" '+
        'oninput="llPfInput(+this.dataset.i,\'cartons\',this.value)" onkeydown="llScanKey(event)" style="'+LL_PF_IN+'width:90px;font-size:16px;">'+
      '<button onclick="llScanAdd()" style="border:none;background:#16a34a;color:#fff;border-radius:6px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer;">➕ Добави</button>'+
      '<button onclick="llScanResume()" style="border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:9px 12px;font-size:13px;cursor:pointer;">Пропусни</button>'+
    '</div>'+
    '<div style="font-size:11.5px;color:#94a3b8;margin-top:6px;">Мярка: '+esc(p.default_unit || '—')+'</div>');
  var q = document.getElementById(qid);
  if(q && q.focus) q.focus();
}
function llScanKey(ev){
  if(!ev || (ev.key !== 'Enter' && ev.keyCode !== 13)) return;
  if(ev.preventDefault) ev.preventDefault();
  llScanAdd();
}
/* „Добави" в модала е СЪЩИЯТ llAddProduct() — валидацията е една. След успех
   скенерът продължава (режим „поредно"); при провал модалът остава, за да се
   поправят бройките. */
function llScanAdd(){
  if(!llScan) return Promise.resolve(false);
  var i = llScan.row;
  return llAddProduct(i).then(function(okAdd){
    if(!okAdd){
      var q = document.getElementById('ll-scan-qty');
      if(q && q.focus) q.focus();
      return false;
    }
    llScanResume();
    return true;
  });
}

/* ─── Документите от Стока на път: разгъване, търсене, чипове ─── */
/* Какво има в документа — само четене, ПРЕДИ отмятане. */
function llDocItemsHtml(d){
  var pr = d.products || [];
  if(!pr.length) return '<div style="font-size:12px;color:#94a3b8;padding:4px 0;">Документът няма артикули в снимката.</div>';
  var h = '<table data-ll-doc-prod="1" style="width:100%;border-collapse:collapse;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">'+
    '<tr style="color:#64748b;text-align:left;"><th style="padding:4px 7px;">Код</th><th style="padding:4px 7px;">Име</th>'+
    '<th style="padding:4px 7px;text-align:right;">Количество</th><th style="padding:4px 7px;">Мярка</th></tr>';
  pr.forEach(function(p){
    h += '<tr style="border-top:1px solid #e2e8f0;">'+
      '<td style="padding:3px 7px;font-family:DM Mono,monospace;white-space:nowrap;">'+esc(p.sap_code)+'</td>'+
      '<td style="padding:3px 7px;">'+esc(p.product_name)+'</td>'+
      '<td style="padding:3px 7px;text-align:right;font-weight:600;">'+llFmtQty(p.qty)+'</td>'+
      '<td style="padding:3px 7px;color:#64748b;">'+esc(p.unit || '—')+'</td></tr>';
  });
  return h + '</table>';
}
function llToggleDocOpen(idx){
  var d = llPendingDocs[idx];
  if(!d) return;
  d._open = !d._open;
  renderLoadingLists();
}
/* Филтърът: текст (номер на документ — съдържа, или име на обект) И чип по
   обект. Двете се комбинират: „Петрич" + „4600" значи документите на Петрич,
   чийто номер съдържа 4600. */
function llDocShown(){
  var q = String(llDocQuery || '').trim().toLowerCase();
  return llPendingDocs.filter(function(d){
    if(llDocStore && d.store_name !== llDocStore) return false;
    if(!q) return true;
    return String(d.purchase_doc || '').toLowerCase().indexOf(q) >= 0 ||
           String(d.store_name || '').toLowerCase().indexOf(q) >= 0;
  });
}
/* Чиповете по обект се рендират ВИНАГИ — и при един обект (правило 11):
   иначе човек, който е избрал чип и после филтърът по текст остави един
   обект, няма откъде да се върне към „Всички". Броят в чипа е по ТЕКСТОВИЯ
   филтър, без чипа — за да казва какво ще види, ако го избере. */
function llDocFilterHtml(){
  var q = String(llDocQuery || '').trim().toLowerCase();
  var byText = llPendingDocs.filter(function(d){
    return !q || String(d.purchase_doc || '').toLowerCase().indexOf(q) >= 0 ||
                 String(d.store_name || '').toLowerCase().indexOf(q) >= 0;
  });
  var stores = [], cnt = {};
  llPendingDocs.forEach(function(d){
    var st = d.store_name || '';
    if(stores.indexOf(st) < 0) stores.push(st);
  });
  stores.sort();
  byText.forEach(function(d){ cnt[d.store_name || ''] = (cnt[d.store_name || ''] || 0) + 1; });
  var chip = function(val, label, n){
    var a = llDocStore === val;
    return '<button data-s="'+escAttr(val)+'" onclick="llSetDocStore(this.dataset.s)" style="border:none;padding:4px 11px;border-radius:40px;font-size:11.5px;font-weight:600;cursor:pointer;'+
      'background:'+(a?'#5b21b6':'#ede9fe')+';color:'+(a?'#fff':'#5b21b6')+';">'+esc(label)+' ('+n+')</button>';
  };
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;">'+
    '<input id="ll-doc-q" value="'+llAttr(llDocQuery)+'" placeholder="Търси документ / обект" autocomplete="off" '+
      'oninput="llSetDocQuery(this.value)" style="flex:1 1 200px;min-width:160px;border:1px solid #ddd6fe;border-radius:6px;padding:6px 9px;font-size:13px;">'+
    '</div>'+
    '<div data-ll-doc-chips="1" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">'+
      chip('', 'Всички', byText.length)+
      stores.map(function(st){ return chip(st, st || '—', cnt[st] || 0); }).join('')+
    '</div>';
}
/* Търсенето пре-рендира редактора — и връща фокуса и курсора в полето, иначе
   всеки клавиш би изхвърлял човека от него. */
function llSetDocQuery(v){
  llDocQuery = String(v == null ? '' : v);
  renderLoadingLists();
  var el = document.getElementById('ll-doc-q');
  if(el){
    if(el.focus) el.focus();
    try { var n = el.value.length; el.setSelectionRange(n, n); } catch(e){}
  }
}
function llSetDocStore(st){
  /* Повторен клик по избрания чип го маха — същото като „Всички". */
  llDocStore = (llDocStore === st) ? '' : String(st || '');
  renderLoadingLists();
}

function llEditorHtml(){
  if(!llDraft) return '';
  var isNew = !llCurrentId;
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">'+
    '<div class="pg-title" style="margin:0;">'+(isNew?'➕ Нов товарен лист':'✏️ Редакция на товарен лист')+'</div>'+
    '<button onclick="llBackToList()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">← Назад</button>'+
    '</div>';
  h += llDraftNoticeHtml();
  if(llCurrentId && llIncompleteSaves[llCurrentId]){
    h += '<div data-ll-incomplete="1" style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:13px;font-weight:600;">'+
      '⚠️ Последният запис не е довършен — артикулите в базата може да не отговарят на екрана. Натисни „💾 Запази черновата" пак.</div>';
  }

  /* а) Заглавие */
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">'+
    '<div><label class="fl">Дата *</label><input type="date" class="fi" id="ll-date" value="'+esc(llDraft.list_date||'')+'" onchange="llSetDraftField(\'list_date\',this.value)"></div>'+
    '<div><label class="fl">Товарил</label><input class="fi" id="ll-by" value="'+escVal(llDraft.executed_by)+'" oninput="llSetDraftField(\'executed_by\',this.value)"></div>'+
    '<div><label class="fl">Коментар</label><input class="fi" id="ll-comment" value="'+escVal(llDraft.comment)+'" oninput="llSetDraftField(\'comment\',this.value)"></div>'+
    '</div></div>';

  /* б) Чакащи стокови документи — само при app_settings loading_transit_docs='on'.
     Изключен, блокът не се рендира ИЗОБЩО (не се крие със CSS): скритият
     блок пак иска снимката и пак лъже, че е налична. */
  if(llTransitDocsOn){
  h += '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:12px;">'+
    /* „Стока на път" е МЕСЕЧНА снимка, не оперативен източник. Датата стои в
       заглавието, за да не изглежда документ от 25.08 като днешен. */
    '<div style="font-size:13px;font-weight:700;color:#5b21b6;margin-bottom:8px;">📄 Документи от Стока на път ('+
      (llDocShown().length === llPendingDocs.length ? llPendingDocs.length : llDocShown().length+' от '+llPendingDocs.length)+')'+
      (llTransitSnapshot ? ' <span style="font-weight:400;color:#7c3aed;">· снимка към '+llFmtStamp(llTransitSnapshot)+'</span>' : '')+'</div>';
  if(llTransitError){
    h += '<div data-ll-transit-error="1" style="font-size:12px;color:#dc2626;font-weight:600;">⚠️ Стока на път не се зареди — документите не са показани. Листът може да се пише и без тях.</div>';
  } else if(!llPendingDocs.length){
    h += '<div style="font-size:12px;color:#7c3aed;">Няма чакащи документи от този склад.</div>';
  } else {
    h += llDocFilterHtml();
    var shown = llDocShown();
    if(!shown.length){
      h += '<div style="font-size:12px;color:#7c3aed;padding:6px 0;">Нищо не отговаря на търсенето.</div>';
    }
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="color:#7c3aed;text-align:left;">'+
      '<th style="padding:3px 6px;"></th><th style="padding:3px 6px;">Документ</th><th style="padding:3px 6px;">Обект</th>'+
      '<th style="padding:3px 6px;">Дата</th><th style="padding:3px 6px;text-align:right;">Артикули</th>'+
      '<th style="padding:3px 6px;">Палет №</th></tr>';
    /* data-i е индексът в llPendingDocs, НЕ в показания списък: филтърът
       крие редове, а llToggleDoc/llSetDocPallet търсят по пълния списък. */
    llPendingDocs.forEach(function(d, i){
      if(shown.indexOf(d) < 0) return;
      /* Клик по целия ред разгъва; чекбоксът и „Палет №" спират клика —
         иначе отмятането би разгъвало, а писането в полето — свивало. */
      h += '<tr data-ll-doc="'+i+'" data-i="'+i+'" onclick="llToggleDocOpen(this.dataset.i)" style="border-top:1px solid #ede9fe;cursor:pointer;'+(d._open?'background:#ede9fe;':'')+'">'+
        '<td style="padding:3px 6px;white-space:nowrap;" onclick="event.stopPropagation()">'+
          '<input type="checkbox" data-i="'+i+'" onclick="event.stopPropagation()" onchange="llToggleDoc(this.dataset.i)"'+(d.checked?' checked':'')+'></td>'+
        '<td style="padding:3px 6px;font-family:DM Mono,monospace;white-space:nowrap;">'+
          '<span style="color:#7c3aed;display:inline-block;width:12px;">'+(d._open?'▾':'▸')+'</span>'+esc(d.purchase_doc)+'</td>'+
        '<td style="padding:3px 6px;">'+esc(d.store_name)+'</td>'+
        '<td style="padding:3px 6px;">'+fmtDate(d.doc_date)+'</td>'+
        '<td style="padding:3px 6px;text-align:right;">'+d.items+'</td>'+
        '<td style="padding:3px 6px;" onclick="event.stopPropagation()"><input value="'+escVal(d.pallet_spec)+'" data-i="'+i+'" onclick="event.stopPropagation()" onchange="llSetDocPallet(this.dataset.i,this.value)" title="На кой палет отива този документ. Еднакъв номер за един обект = един палет. Обхват (1-3) за документ върху няколко палета." style="width:62px;border:1px solid #ddd6fe;border-radius:5px;padding:2px 6px;font-size:12px;"></td>'+
        '</tr>';
      if(d._open) h += '<tr data-ll-doc-items="'+i+'"><td></td><td colspan="5" style="padding:0 6px 8px;">'+llDocItemsHtml(d)+'</td></tr>';
    });
    h += '</table>';
    h += '<div style="font-size:11px;color:#7c3aed;margin-top:6px;">Стоковата № не се пише на ръка — избира се оттук. '+
      '<b>Палет №</b> е <i>на кой палет</i>: еднакъв номер за един обект значи един палет с няколко документа. '+
      'За документ върху няколко палета — обхват, напр. <code>1-3</code>.</div>';
  }
  h += '</div>';
  }

  /* в–д) Редовете */
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'+
    '<div style="font-size:13px;font-weight:700;">📦 Редове ('+llDraft.items.length+')</div>'+
    '<button onclick="llAddFreeRow()" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;">➕ Добави нов ред</button>'+
    '</div>';
  if(!llDraft.items.length){
    h += '<div style="color:#94a3b8;font-size:12px;padding:10px 0;">Още няма редове. Отметни документ отгоре или добави нов ред.</div>';
  } else {
    h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;">'+
      '<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">#</th><th style="padding:3px 6px;">Вид</th>'+
      '<th style="padding:3px 6px;">№ / от</th><th style="padding:3px 6px;">Изходящ №</th>'+
      '<th style="padding:3px 6px;">Обект</th>'+
      '<th style="padding:3px 6px;">Коментар склад</th>'+
      '<th style="padding:3px 6px;" title="С този палет тръгва само част от документа">Частично</th>'+
      '<th style="padding:3px 6px;"></th></tr>';
    llDraft.items.forEach(function(it, i){
      var isPallet = llIsNumbered(it.kind);
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
        '<td style="padding:3px 6px;"><select data-i="'+i+'" onchange="llSetRowField(this.dataset.i,\'store_name\',this.value)" style="border:1px solid #e2e8f0;border-radius:5px;padding:2px 4px;font-size:12px;">'+llStoreOptions(it.store_name)+'</select></td>'+
        '<td style="padding:3px 6px;">'+
          /* При извънгабаритния полето сменя смисъла си: то вече не е бележка
             встрани, а ОПИСАНИЕТО на товара. Затова получава заглавие и
             червена рамка, докато е празно — иначе складът го подминава като
             всяко друго незадължително поле. */
          (llIsOversize(it.kind) ? '<div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:2px;">Какъв е товарът *</div>' : '')+
          '<input id="ll-wc-'+i+'" value="'+escVal(it.warehouse_comment)+'" data-i="'+i+'"'+
          (llIsOversize(it.kind) ? ' placeholder="напр. стелажи, ламперия…"' : '')+
          ' oninput="llSetRowField(this.dataset.i,\'warehouse_comment\',this.value)" style="width:100%;min-width:120px;border:1px solid '+(llOversizeNeedsComment(it)?'#fca5a5':'#e2e8f0')+';border-radius:5px;padding:2px 6px;font-size:12px;"></td>'+
        '<td style="padding:3px 6px;text-align:center;white-space:nowrap;">'+(!docOf
          ? '<span style="color:#cbd5e1;" title="Ред без документ — няма какво да остане чакащо">—</span>'
          : (first === i
            ? '<input type="checkbox" data-i="'+i+'" onchange="llSetRowPartial(this.dataset.i,this.checked)"'+(it.partial?' checked':'')+' title="Само част от документа тръгва с този товар — отмятането няма да го затвори в Стока на път">'
            : '<span style="color:#94a3b8;" title="Следва отметката на първия палет от същия документ">'+(it.partial?'✓':'↳')+'</span>'))+'</td>'+
        '<td style="padding:3px 6px;white-space:nowrap;">'+
          '<button data-i="'+i+'" onclick="llMoveRow(+this.dataset.i,-1)" title="Нагоре" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;">↑</button>'+
          '<button data-i="'+i+'" onclick="llMoveRow(+this.dataset.i,1)" title="Надолу" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;margin-left:2px;">↓</button>'+
          '<button data-i="'+i+'" onclick="llRemoveRow(+this.dataset.i)" title="Махни реда" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;margin-left:2px;">✕</button>'+
        '</td></tr>'+
        '<tr data-ll-prodrow="'+i+'"><td></td><td colspan="7" style="padding:0 6px 6px;">'+llProductsBlockHtml(it, i)+'</td></tr>';
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
      pallet_no: llIsNumbered(it.kind) ? (it.pallet_no != null ? it.pallet_no : null) : null,
      pallet_total: llIsNumbered(it.kind) ? (it.pallet_total != null ? it.pallet_total : null) : null,
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
  /* Недокоснатите редове от новия лист отпадат ТИХО — те не са грешка, а
     непопълнена бланка. Редът, който човекът Е започнал (сложил е документ
     или артикули) без да избере обект, СИ Е грешка и спира записа.
     Списъкът се смалява на място: при провал по-нататък редакторът остава
     отворен и в него стои точно това, което ще бъде записано. */
  var kept = llDraft.items.filter(function(it){ return !llBlankRow(it); });
  var dropped = llDraft.items.length - kept.length;
  llDraft.items = kept;
  if(!llDraft.items.length){ toast('Добави поне един ред','#dc2626'); renderLoadingLists(); return; }
  var missing = llDraft.items.filter(function(it){ return !String(it.store_name || '').trim(); }).length;
  if(missing){ toast('Има ред с документ или артикули, но без обект получател','#dc2626'); renderLoadingLists(); return; }
  /* Извънгабаритен ред без описание НЕ се записва. На рампата обектът вижда
     „извънгабаритен 1 от 2" и нищо друго — нито артикули, нито документ му
     казват какво чака. Проверката е СЛЕД отпадането на празните редове:
     недокоснат ред с вид „извънгабаритен" е непопълнена бланка, не грешка. */
  var noDesc = llDraft.items.findIndex(llOversizeNeedsComment);
  if(noDesc >= 0){
    toast('Извънгабаритният ред иска описание — какъв е товарът','#dc2626');
    renderLoadingLists();
    var wc = document.getElementById('ll-wc-' + noDesc);
    if(wc && wc.focus) wc.focus();
    return;
  }
  if(dropped) renderLoadingLists();
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
    if(!fresh.length){ llWriteProducts(listId); return; }
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
      llWriteProducts(listId);
    });
  });
}
/* ─── ЗАПИС НА АРТИКУЛИТЕ ──────────────────────────────────
   Вика се СЛЕД като редовете са записани. Два проблема, които определят реда:

   1) Новите редове се вмъкват със sbPost (return=minimal) и id-тата им НЕ се
      връщат, а артикулът иска item_id. Затова редовете на листа се четат
      наново (id, position) и се съпоставят по position: тя е 1..N от екрана
      и е уникална в рамките на листа. Две с една позиция значи, че някъде
      стои ред, който не е на екрана — това спира записа на глас, вместо да
      закачи артикулите за грешния палет.

   2) Първо ВМЪКВАНЕ, после триене на старите — не обратно. Складът е на
      телефон с мрежа, която идва и си отива: „изтрий, после вмъкни" при
      паднала връзка по средата оставя палета БЕЗ опис. Обратният ред в
      най-лошия случай дава дубликат, който се вижда и се оправя със следващ
      запис. Старите се различават от новите по created_at на СЪРВЪРА: всички
      редове от едно INSERT получават едно и също now() (началото на
      транзакцията), а старите са от по-ранна транзакция. Часовникът на
      телефона не участва.

   Провалът НЕ връща към списъка: черновата остава отворена с артикулите в
   паметта, редовете вече имат id, и „Запази" пак довършва записа.

   ЗА В2: всеки запис на черновата ПРЕПИСВА артикулите (нови id-та, стари
   изтрити). Безопасно е само защото received_qty не може да съществува върху
   чернова — обектът не вижда черновите. Щом В2 започне да пише received_qty,
   то трябва да става САМО след status='sent', иначе следващото „Запази" го
   изтрива мълчаливо. */
function llWriteProducts(listId){
  var anyNow = llDraft.items.some(function(it){ return (it.products || []).length; });
  /* Лист, който не ползва артикули нито сега, нито преди — нула заявки. Така
     записът на всички стари листи остава точно какъвто беше. */
  if(!anyNow && !llDraft._hadProducts){ llFinishSave(listId); return Promise.resolve(true); }

  return sbGet('loading_list_items','list_id=eq.'+listId+'&select=id,position').then(function(rows){
    var byPos = {}, dup = false;
    (Array.isArray(rows) ? rows : []).forEach(function(r){
      if(byPos[r.position]) dup = true;
      byPos[r.position] = r.id;
    });
    var noId = 0;
    llDraft.items.forEach(function(it, i){
      var id = byPos[i + 1];
      if(id) it.id = id; else noId++;
    });
    if(dup) return llProductsFailed(listId, 'в листа има два реда с една и съща позиция');
    if(noId) return llProductsFailed(listId, noId + ' реда не бяха намерени след записа');

    var ids = llDraft.items.map(function(it){ return it.id; });
    var out = [];
    llDraft.items.forEach(function(it){
      (it.products || []).forEach(function(pr, j){
        out.push({
          item_id: it.id, position: j + 1,
          sap_code: pr.sap_code, product_name: pr.product_name,
          unit: pr.unit || null, qty: pr.qty,
          cartons: (pr.cartons === null || pr.cartons === undefined || pr.cartons === '') ? null : pr.cartons
        });
      });
    });
    var mine = 'item_id=in.(' + ids.join(',') + ')';

    if(!out.length){
      /* Всички артикули са махнати на екрана — махат се и в базата. */
      return sbDelete('loading_list_products', mine).then(function(d){
        if(!d.ok) return llProductsFailed(listId, 'старите артикули НЕ бяха изтрити: ' + sbErrMsg(d));
        llFinishSave(listId);
        return true;
      });
    }
    return sbPostReturn('loading_list_products', out).then(function(res){
      if(!res.ok || !res.row) return llProductsFailed(listId, 'артикулите НЕ бяха записани: ' + sbErrMsg(res));
      var t = res.row.created_at;
      /* Без часа на новите няма как да се различат от старите — триене „на
         сляпо" би изтрило и тях. По-добре дубликат, отколкото празен палет. */
      if(!t) return llProductsFailed(listId, 'сървърът не върна час на записа — старите артикули НЕ са изтрити');
      return sbDelete('loading_list_products', mine + '&created_at=lt.' + encodeURIComponent(t)).then(function(d){
        if(!d.ok) return llProductsFailed(listId, 'старите артикули НЕ бяха изтрити — има дублирани редове: ' + sbErrMsg(d));
        llFinishSave(listId);
        return true;
      });
    });
  });
}
function llProductsFailed(listId, why){
  llIncompleteSaves[listId] = true;
  console.error('llWriteProducts: ' + why);
  toast('⚠️ Редовете са записани, но ' + why + '. Натисни „Запази" пак.', '#dc2626');
  /* Остава в редактора — виж коментара над llWriteProducts. */
  llView = 'edit';
  renderLoadingLists();
  return false;
}
function llFinishSave(listId){
  delete llIncompleteSaves[listId];
  toast('✅ Черновата е записана');
  llBackToList();
}

/* ─── ПРЕХОДИ ───────────────────────────────────────────────── */
function llSendList(id){
  if(!llCanEdit()){ toast('Нямаш права за това действие','#dc2626'); return; }
  /* Редовете се снимат ПРЕДИ PATCH-а: loadLoadingLists() по-долу презарежда
     llItems асинхронно и известието би тръгнало срещу празен масив, ако ги
     четеше след това. */
  var rows = llItemsOf(id).slice();
  var noProd = rows.filter(function(it){ return !(it.products || []).length; }).length;
  /* Питането за описа е ПЪРВО: отговори ли човекът „не" на него, няма смисъл
     да го питаме и второто. Обратният ред би значел два диалога за отказ. */
  if(noProd && !confirm(noProd + (noProd === 1 ? ' ред е без артикули.' : ' реда са без артикули.') +
     ' Изпращаш ли така?')) return;
  if(!confirm('Изпрати товарния лист към обектите?')) return;
  sbPatch('loading_lists','id=eq.'+id,{status:'sent', sent_at:new Date().toISOString()}).then(function(res){
    if(!res.ok){ toast('Грешка при изпращане: '+sbErrMsg(res),'#dc2626'); return; }
    toast('📤 Товарният лист е изпратен');
    var l = llLists.find(function(x){ return String(x.id) === String(id); });
    if(l) l.status = 'sent';
    /* Fire-and-forget: провалът не връща листа в draft — той ВЕЧЕ е изпратен. */
    if(l) llNotifySent(l, rows);
    loadLoadingLists();
  });
}
/* Ръчното приключване от склада следва СЪЩОТО правило като автоматичното:
   има ли поне един ред, заявен като неполучен, статусът е 'partial'. Иначе
   натискането на бутона би изтрило разликата между „прието наред" и „прието
   с липси" — и то точно от страната, която липсата засяга. */
function llDoneList(id){
  if(!llCanEdit()){ toast('Нямаш права за това действие','#dc2626'); return; }
  /* Същият гейт като при обекта (Пакет Г2), и то ПРЕДИ confirm-а: складът е
     точно онзи, който може и да одобри, и да затвори. Затвори ли преди
     решението, писмото тръгва с ред, по който никой не се е произнесъл. */
  if(llItemsOf(id).some(llRowPending)){
    toast('Има извънреден ред, който чака одобрение','#d97706');
    return;
  }
  if(!confirm('Приключи товарния лист?')) return;
  /* Отхвърленият ред не е липса — за листа той не съществува. */
  var miss = llLiveRows(llItemsOf(id)).some(function(i){ return i.missing; });
  var want = miss ? 'partial' : 'done';
  var l0 = llLists.find(function(x){ return String(x.id) === String(id); });
  /* Листът вече е в търсения статус — PATCH-ът минава, но НИЩО не се сменя.
     Известие тук би значело второ писмо за едно и също приключване. */
  var changed = !l0 || l0.status !== want;
  sbPatch('loading_lists','id=eq.'+id,{status:want, done_at:new Date().toISOString()}).then(function(res){
    if(!res.ok){ toast('Грешка при приключване: '+sbErrMsg(res),'#dc2626'); return; }
    toast(miss ? '⛔ Товарният лист е приключен с липси' : '✅ Товарният лист е приключен',
      miss ? '#dc2626' : undefined);
    var l = llLists.find(function(x){ return String(x.id) === String(id); });
    if(l) l.status = want;
    if(changed) llNotifyClosed(l || { id:id, warehouse:llActiveWarehouse() });
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

/* ─── АРТИКУЛИТЕ — САМО ЧЕТЕНЕ ────────────────────────────────
   Един изглед за прегледа на склада и за картата на обекта. Две копия щяха
   да се разминат по колоните — а обектът и складът трябва да гледат ЕДНА
   и съща таблица, когато спорят за един палет. */
function llProductsTableHtml(products){
  var pr = products || [];
  if(!pr.length) return '<div style="font-size:12px;color:#94a3b8;padding:4px 0;">Без артикули.</div>';
  var h = '<table data-ll-prodlist="1" style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">'+
    '<tr style="color:#64748b;text-align:left;"><th style="padding:3px 6px;">SAP код</th><th style="padding:3px 6px;">Име</th>'+
    '<th style="padding:3px 6px;">Мярка</th><th style="padding:3px 6px;text-align:right;">Бройки</th>'+
    '<th style="padding:3px 6px;text-align:right;">Кашони</th></tr>';
  pr.forEach(function(p){
    h += '<tr style="border-top:1px solid #f1f5f9;">'+
      '<td style="padding:3px 6px;font-family:DM Mono,monospace;white-space:nowrap;">'+esc(p.sap_code)+'</td>'+
      '<td style="padding:3px 6px;">'+esc(p.product_name)+'</td>'+
      '<td style="padding:3px 6px;color:#64748b;">'+esc(p.unit || '—')+'</td>'+
      '<td style="padding:3px 6px;text-align:right;font-weight:600;">'+llFmtQty(p.qty)+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+(p.cartons != null ? p.cartons : '—')+'</td></tr>';
  });
  return h + '</table>';
}
/* Разгъващият бутон. fn е ИМЕТО на глобалната функция за превключване —
   прегледът на склада и картата на обекта държат отделно състояние. */
function llProductsToggleHtml(it, open, fn){
  var pr = it.products || [];
  return '<button data-id="'+it.id+'" onclick="'+fn+'(this.dataset.id)" style="border:none;background:none;color:#4f46e5;font-size:11.5px;font-weight:600;cursor:pointer;padding:2px 0;">'+
    (open ? '▾' : '▸')+' Артикули ('+pr.length+') <span style="color:#94a3b8;font-weight:400;">· '+llFmtQty(llProdSum(pr))+'</span></button>';
}
function llToggleViewProducts(id){ llViewProdOpen[id] = !llViewProdOpen[id]; renderLoadingLists(); }
function llToggleStoreProducts(id){ llStoreProdOpen[id] = !llStoreProdOpen[id]; renderLoadingLists(); }

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
      (l.status==='draft'?'<button data-id="'+l.id+'" onclick="llSendList(this.dataset.id)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">📤 Изпрати към обектите</button>':'')+
      (l.status==='sent'?'<button data-id="'+l.id+'" onclick="llDoneList(this.dataset.id)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">✅ Приключи</button>':'')+
      '<button data-id="'+l.id+'" onclick="llPrint(this.dataset.id)" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">🖨 Печат</button>'+
      '<button data-id="'+l.id+'" onclick="llDownloadPdf(this.dataset.id)" title="Сваля бланката като PDF" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">⬇ PDF</button>'+
      '<button onclick="llBackToList()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:12.5px;cursor:pointer;">← Назад</button>'+
    '</div></div>';

  if(l.status === 'draft') h += llDraftNoticeHtml();
  h += '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">🏭 '+esc(l.warehouse||'')+
    (l.executed_by?' · Товарил: '+esc(l.executed_by):'')+
    (l.sent_at?' · Изпратен: '+llFmtStamp(l.sent_at):'')+
    (l.done_at?' · Приключен: '+llFmtStamp(l.done_at):'')+'</div>';
  if(l.comment) h += '<div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-bottom:10px;">💬 '+esc(l.comment)+'</div>';

  /* Обобщението по обект — СМЯТА СЕ от редовете, не от заглавието. */
  var sum = llSummaryByStore(items);
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px;">'+
    '<div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">📊 По обекти ('+c.stores+' обекта · '+c.pallet+' палета · '+c.oversize+' извънгабаритни · '+c.roll+' рула · '+c.bulk+' насип'+
      (c.missing?' · <span style="color:#dc2626;">'+c.missing+' неполучени</span>':'')+')</div>'+
    '<table id="ll-summary" style="width:100%;border-collapse:collapse;font-size:12px;">'+
    '<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">Обект</th><th style="padding:3px 6px;text-align:right;">Палети</th><th style="padding:3px 6px;text-align:right;">Извънгаб.</th><th style="padding:3px 6px;text-align:right;">Рула</th><th style="padding:3px 6px;text-align:right;">Насип</th><th style="padding:3px 6px;text-align:right;">Получени</th><th style="padding:3px 6px;text-align:right;">Неполучени</th>'+
    '<th style="padding:3px 6px;text-align:right;">Артикули</th><th style="padding:3px 6px;text-align:right;">Бройки</th></tr>';
  sum.forEach(function(s){
    h += '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:3px 6px;font-weight:600;">'+esc(s.store)+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.pallet+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.oversize+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.roll+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.bulk+'</td>'+
      '<td style="padding:3px 6px;text-align:right;">'+s.received+'/'+s.total+'</td>'+
      /* Нулата остава сива — червено число, което значи „няма липси", е точно
         толкова подвеждащо, колкото липсващата колона. */
      '<td style="padding:3px 6px;text-align:right;'+(s.missing?'color:#dc2626;font-weight:700;':'color:#cbd5e1;')+'">'+s.missing+'</td>'+
      '<td style="padding:3px 6px;text-align:right;'+(s.products?'':'color:#cbd5e1;')+'">'+s.products+'</td>'+
      '<td style="padding:3px 6px;text-align:right;'+(s.qty?'':'color:#cbd5e1;')+'">'+llFmtQty(s.qty)+'</td></tr>';
  });
  h += '</table></div>';

  if(!items.length){
    return h + '<div style="text-align:center;padding:40px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">Листът няма редове.</div>';
  }
  var locked = l.status !== 'draft';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;"><thead><tr style="background:#f8fafc;">';
  ['#','Товарна единица','Изходящ №','Коментар склад','Обект','Коментар обект','Получено'].forEach(function(cc){
    h += '<th style="text-align:left;padding:7px 9px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+cc+'</th>';
  });
  h += '</tr></thead><tbody>';
  /* „🖨 Опис" — на ПЪРВИЯ ред от всеки палет: палетът е една физическа
     единица с един опис, дори да носи няколко документа (няколко реда). */
  var descSeen = {};
  items.forEach(function(it){
    /* „1" = палет 1; „rc1" = извънгабаритен 1; „rl1" = руло 1; иначе id на
       реда (насип). Без вида в препратката палет 1 и руло 1 на един обект се
       смесват в един опис. Представката „rc" е от предишното име на вида
       („рол контейнер") и се пази нарочно: тя не се записва никъде, но стои
       в data-u на бутоните и смяната ѝ би счупила вече отворен печат. */
    var uref = (llIsNumbered(it.kind) && it.pallet_no != null)
      ? (it.kind === 'pallet' ? String(it.pallet_no)
        : (it.kind === 'roll' ? 'rl' + it.pallet_no : 'rc' + it.pallet_no))
      : String(it.id);
    var ukey = JSON.stringify([it.store_name || '', uref]);
    var firstOfUnit = !descSeen[ukey];
    descSeen[ukey] = true;
    h += '<tr'+(it.missing?' data-missing="1"':'')+
      (it.added_by_store?' data-ll-added="'+escAttr(it.approval_status||'')+'"':'')+
      ' style="border-bottom:1px solid #f1f5f9;'+
      (llRowPending(it)?'background:#fffbeb;':(llRowRejected(it)?'background:#f8fafc;color:#94a3b8;text-decoration:line-through;':
        (it.received?'background:#f0fdf4;':(it.missing?'background:#fef2f2;':''))))+'">'+
      '<td style="padding:6px 9px;color:#94a3b8;">'+(it.position!=null?it.position:'—')+'</td>'+
      '<td style="padding:6px 9px;font-weight:600;white-space:nowrap;">'+esc(llKindLabel(it))+
        (it.added_by_store?'<div style="margin-top:3px;text-decoration:none;font-weight:400;white-space:normal;">'+llApprovalBadge(it)+llApprovalNote(it)+llApproveBtnsHtml(l, it)+'</div>':'')+
        (firstOfUnit && llRowCounts(it)
          ? ' <button data-l="'+l.id+'" data-s="'+escAttr(it.store_name||'')+'" data-u="'+escAttr(uref)+'" onclick="llPrint(this.dataset.l,this.dataset.s,this.dataset.u)" title="Опис на палета — за залепване" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:5px;padding:1px 7px;font-size:10.5px;font-weight:600;cursor:pointer;margin-left:4px;">🖨 Опис</button>'
          : '')+'</td>'+
      '<td style="padding:6px 9px;font-family:DM Mono,monospace;">'+(it.purchase_doc?esc(it.purchase_doc):'<span style="color:#cbd5e1;">без</span>')+
        (it.partial?' '+llPartialBadge():'')+'</td>'+
      /* Единственото, което остава редактируемо след изпращане. */
      '<td style="padding:6px 9px;">'+(locked
        ? '<input value="'+escVal(it.warehouse_comment)+'" data-id="'+it.id+'" onchange="llSaveWarehouseComment(this.dataset.id,this.value)" style="width:100%;min-width:120px;border:1px solid #e2e8f0;border-radius:5px;padding:2px 6px;font-size:12px;">'
        : esc(it.warehouse_comment||'—'))+'</td>'+
      '<td style="padding:6px 9px;font-weight:500;">'+esc(it.store_name||'')+'</td>'+
      /* Коментарът на обекта е ОБЯСНЕНИЕТО на липсата — при missing той не е
         бележка встрани, а самото съдържание на реда, затова е откроен. */
      '<td style="padding:6px 9px;'+(it.missing?'color:#b91c1c;font-weight:600;':'color:#64748b;')+'">'+esc(it.store_comment||'—')+'</td>'+
      '<td style="padding:6px 9px;white-space:nowrap;">'+(it.received
        ? '<span style="color:#16a34a;font-weight:600;">✔ '+esc(it.received_by||'')+(it.received_at?' · '+llFmtStamp(it.received_at):'')+'</span>'
        : (it.missing
          ? '<span style="color:#dc2626;font-weight:700;">⛔ Неполучено'+
            (it.missing_by?' · '+esc(it.missing_by):'')+(it.missing_at?' · '+llFmtStamp(it.missing_at):'')+'</span>'
          : '<span style="color:#cbd5e1;">—</span>'))+'</td>'+
      '</tr>';
    /* Артикулите — разгъваем под-ред, само ако има какво да се разгъне. */
    if((it.products || []).length){
      var vo = !!llViewProdOpen[it.id];
      h += '<tr data-ll-vprod="'+it.id+'" style="border-bottom:1px solid #f1f5f9;"><td></td><td colspan="6" style="padding:0 9px 6px;">'+
        llProductsToggleHtml(it, vo, 'llToggleViewProducts')+(vo ? llProductsTableHtml(it.products) : '')+'</td></tr>';
    } else if(l.status === 'draft'){
      /* В черновата липсващият опис още може да се поправи и точно затова се
         казва — след изпращането същият надпис би бил само упрек. */
      h += '<tr data-ll-noprod="'+it.id+'" style="border-bottom:1px solid #f1f5f9;"><td></td><td colspan="6" style="padding:0 9px 6px;">'+
        '<span style="font-size:11.5px;color:#b45309;">Няма артикули</span> '+
        '<button data-id="'+l.id+'" onclick="llOpenEdit(this.dataset.id)" style="border:none;background:none;color:#4f46e5;font-size:11.5px;font-weight:600;cursor:pointer;padding:2px 0;">✏️ Редакция</button></td></tr>';
    }
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

/* ══════════════════════════════════════════
   ПЕЧАТ НА ТОВАРЕН ЛИСТ („Протокол за товарене")
   По образеца на renderDiffPrint() в stock-differences.js — същият in-page
   модел: пише в #mod-print и вика showModule('print'), без window.open и без
   библиотека. „Запази като PDF" е диалогът на самия браузър.
══════════════════════════════════════════ */

/* Логото е КОПИЕ на низа, не референция към DIFF_PRINT_LOGO. Дублирано
   нарочно на две основания: вграденото base64 не зависи от мрежата (външен
   <img src> може да не се дозареди преди диалога за печат и бланката излиза
   без лого), и печатът тук не бива да зависи от това дали
   stock-differences.js изобщо е зареден. */
var LL_PRINT_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAqCAIAAABDSv52AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAFGklEQVR42u1YW2hcVRRde59z7507M5lkkia1tS9atTRqa4kgaD8UHyBqqVAMgtQHKIJIP9ovoVToTxEKRX/8ED9ExEKRCoIUaREflFIUtahVsNbUhqbmNTOZuc9zth95OElnkpi2mkLP14V7zr7rnrPW2nsf2tB9BxbHYAAi8j8iEJFxAAyAiOacfe1wTD3r+SyYE+uCR31kxqIZ1zmUa0Qdnp3VC6bO7HAbxtfXiKezR2j49gZtr1co/302aAyFRBTAQDPuEUAi9YjroYsIREgEIuPRMI8fa6AgAUImCzDIgWg7Hm+aQ6dAzOyLgAgiDNj6/yNKAENwBQwkRBBxgNnhqM7OrmmnQqRENkTmlihttZISSopZJtImABJUFbUbWR8nF7XSQMJUIQLImdywkNBh7KrEjDFHJDelooGASQECWAikgZz1jNOqELYEyXt9owYAUFJ8vMXd15k3zAoAEBNui9KDF0oxYduadhGsic091fhkzv3DVY4gJKxMzDt9o2uj9P2O7M7lrbsHy3fXkt5VRQJyxr52qXKgq2VQsyPT9olnWI8CjTErK64VAJ2p7R2q3V+NA0IEWCBkenG42l2LFJA3NmC8Mljd1z+6Z6BigAhYG6WHzw3fnBom3BqljpWfPd1TjW4PkwHNz44EW8sRNRLFNCgWyIj86unXlxW+zrtacNrXz68unsloC6xO0oKxFmhNxRJ1pRZATy15rBRaUgpQIjWmp0rBqKJDbb4IIuaMyPcZB8wbw3RzkLw8OHbW08OKtcwUbAPaKuDNjtyAovsqUYvFVzm3wrR7sPrSUO2XjO5dVWw1lkBLUvt4OdpaCQOmFmPLTDUiV+ThsXhvZ36pAYkd1GSBPx0+lXWeHgm2lwLXypc5p6y43YqZngq4kZLRIrI6tQCGNSKi3tFw919j/a76uJARQU4sATGwv780qPmnjBaRfs0ZKztGasXU3hmZJyqhZXVvNdkcJkNaHW7NdAfJplpSdvWHrX7WznVAUyMlKhoL4FjOCwkvjATG4t02/2BHtsNYQ/RR0fetOdnivdWeWxenBPzu6RWp2XNxrJCaXQPlLZXIElWZzjtqfZg8N1QDoab41eUt3/qObiRs3dC/SGRpakH4NO/lLbLWKpHHKlFe8EnBM6C327PH8t6JrLs+TJbE9kzW/SznDbjqtO/84Osv8t72UvjoSG3XsuKQ4qN9Qxui9POC11NL2lP7ZCXqc9Q5R7l1gBofkAU8kTVxeqiYPesqgrzRlf/NdzYFaUAoExnAEB0pZC44/GA1vuTwzuWFc67qDhNDsr8z/0Gbf97ho23+dxlnY2xO5dxH1i15ZmXxQGdu76Wxh8aiIUXq8h24vA8SQIk8UI2OZ92USIOqjLwVAkpMOSvbKuGxnFdVHBPtGKme8N0fPa0JPUGyIjZHCpmcyF1B/I3vpgQNqhIU4AsCpqKxJSYGZphKEygiAEImf3IuCwxNQBSigODJRIYKCErgCSwhBVKCLxAgAlwRAjC58xZgIJnkxLy4Mu7JWSsyac6WJugt018JkBUIYAkAtIgjJAQBMjI5R8ROxQF080zUvLadniSkLoSdTqx/hEkkNJGGppbPSDa2eYqeb+lU79T10RdQ1jRbMt8yu1nZ/G8L8lnm36htb0BZxFCaKYivcD1m7a7njFbfPPOCHWJ8vixIz1fUMzdzGpp09wV3+VOR+arcHlyVG7LFoiAR4UWCY+a9rSxIDvP/4OyS/BsnQaRclmJE7gAAAABJRU5ErkJggg==';

/* ОПИС НА ПАЛЕТ — лепи се на самия палет. Един физически палет може да носи
   няколко документа (няколко реда с един pallet_no); описът е ЕДИН и изброява
   артикулите на всичките, в реда на въвеждане.
   Сумата на бройките НЕ се показва: палетът смесва мерни единици (бр., кв.м,
   л.м) и общото число не би значело нищо. Кашоните са една мярка — те се
   сумират. Колоните: 8+26+88+18+24+26 = 190mm, полезната ширина на A4. */
function llRenderPalletPrint(list, rows){
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var first = rows[0];
  var store = first.store_name || '';
  var unit = (llIsNumbered(first.kind) && first.pallet_no != null)
    ? (LL_KIND_WORD[first.kind] || 'палет').charAt(0).toUpperCase() + (LL_KIND_WORD[first.kind] || 'палет').slice(1) +
      ' ' + first.pallet_no + (first.pallet_total != null ? ' от ' + first.pallet_total : '')
    : llKindLabel(first).charAt(0).toUpperCase() + llKindLabel(first).slice(1);
  var docs = [];
  rows.forEach(function(r){ if(r.purchase_doc && docs.indexOf(r.purchase_doc) < 0) docs.push(r.purchase_doc); });
  var prods = [];
  rows.forEach(function(r){ (r.products || []).forEach(function(p){ prods.push(p); }); });
  var ctn = 0, hasCtn = false;
  prods.forEach(function(p){ if(p.cartons != null && p.cartons !== ''){ ctn += Number(p.cartons) || 0; hasCtn = true; } });

  var body = prods.length
    ? prods.map(function(p, k){
        return '<tr class="lp-row"><td class="lp-num">'+(k + 1)+'</td>'+
          '<td>'+esc(p.sap_code)+'</td>'+
          '<td>'+esc(p.product_name)+'</td>'+
          '<td>'+esc(p.unit || '—')+'</td>'+
          '<td class="lp-num">'+llFmtQty(p.qty)+'</td>'+
          '<td class="lp-num">'+(p.cartons != null ? p.cartons : '')+'</td></tr>';
      }).join('') +
      '<tr class="lp-row lp-sum"><td colspan="4">Общо: '+prods.length+(prods.length === 1 ? ' артикул' : ' артикула')+'</td>'+
        '<td class="lp-num"></td><td class="lp-num">'+(hasCtn ? ctn : '')+'</td></tr>'
    : '<tr class="lp-row"><td colspan="6" style="text-align:center;color:#777;">Няма въведени артикули</td></tr>';

  var now = new Date();
  var pad = function(x){ return (x < 10 ? '0' : '') + x; };
  var stamp = pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear()+' '+
              pad(now.getHours())+':'+pad(now.getMinutes());

  wrap.innerHTML =
    '<style>'+llPrintCss()+'</style>'+
    '<div style="max-width:820px;margin:0 auto;padding:16px 16px 40px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Опис на палет</div>'+
        '<div style="display:flex;gap:8px;align-items:center;">'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>'+
          '<button onclick="showModule(\'loading\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>'+
        '</div>'+
      '</div>'+
      '<div class="lp-wrap" data-ll-pallet-print="1">'+
        '<div class="lp-head">'+
          '<div><div class="lp-wh">'+esc(list.warehouse || '')+'</div></div>'+
          '<img src="'+LL_PRINT_LOGO+'" class="lp-logo" alt="TeMAX">'+
        '</div>'+
        '<div class="lp-title">ОПИС НА ТОВАРНА ЕДИНИЦА</div>'+
        '<div class="lp-unit">'+esc(unit)+'</div>'+
        '<table class="lp-meta">'+
          '<tr><td>Обект получател:</td><td><b>'+esc(store || '—')+'</b></td></tr>'+
          '<tr><td>Склад изпращач:</td><td>'+esc(list.warehouse || '—')+'</td></tr>'+
          '<tr><td>Дата на товарене:</td><td>'+fmtDate(list.list_date)+'</td></tr>'+
          '<tr><td>Изходящ №:</td><td>'+(docs.length ? docs.map(esc).join(', ') : 'без')+'</td></tr>'+
        '</table>'+
        '<table class="lp-tbl">'+
          '<colgroup><col style="width:8mm;"><col style="width:26mm;"><col style="width:88mm;"><col style="width:18mm;"><col style="width:24mm;"><col style="width:26mm;"></colgroup>'+
          '<tr><th>№</th><th>SAP код</th><th>Име</th><th>Мярка</th><th>Бройки</th><th>Кашони</th></tr>'+
          body+
        '</table>'+
        '<div class="lp-sign">'+
          '<div class="lp-sign-item"><div class="lp-dots"></div>Товарил: име и подпис</div>'+
          '<div class="lp-sign-item"><div class="lp-dots"></div>Приел: име и подпис</div>'+
        '</div>'+
        '<div class="lp-foot">Отпечатано '+esc(stamp)+' от '+esc(llActor())+'</div>'+
      '</div>'+
    '</div>';
}

/* storeFilter (по избор) — печата САМО частта на този обект. Магазинът
   получава своя лист, не чуждите редове от същия курс. */
/* unitRef (по избор) — „Опис на палет" вместо целия лист. Цифри = номер на
   палет (с storeFilter, защото палет 1 има всеки обект); иначе id на ред —
   рулото и насипът нямат номер и описът е за самия ред. */
function llPrint(listId, storeFilter, unitRef){
  var l = llLists.find(function(x){ return String(x.id) === String(listId); }) ||
          llStoreLists.find(function(x){ return String(x.id) === String(listId); });
  if(!l){ toast('Товарният лист не е намерен','#dc2626'); return; }
  /* Складът държи редовете в llItems, обектът — в llStoreItems. */
  var items = llItemsOf(listId);
  if(!items.length) items = llStoreItemsOf(listId);
  items = llLiveRows(items);   /* отхвърленият ред не се печата (Пакет Г2) */
  if(unitRef !== undefined && unitRef !== null && unitRef !== ''){
    var ref = String(unitRef), m = /^(rc|rl)?(\d+)$/.exec(ref);
    var wantKind = m ? (m[1] === 'rc' ? 'oversize' : (m[1] === 'rl' ? 'roll' : 'pallet')) : null;
    var rows = m
      ? items.filter(function(i){
          return i.kind === wantKind && String(i.pallet_no) === m[2] &&
            (!storeFilter || i.store_name === storeFilter);
        })
      : items.filter(function(i){ return String(i.id) === ref; });
    if(!rows.length){ toast('Товарната единица не е намерена','#dc2626'); return; }
    llRenderPalletPrint(l, rows.slice().sort(llByPosition));
    showModule('print');
    return;
  }
  llRenderPrint(l, items, storeFilter);
  showModule('print');
}

/* CSS-ът на ВСИЧКИ печати от този модул — целия лист и описа на палет.
   ЕДНО копие: трите правила долу (white-space, box-sizing, долната рамка)
   идват от CLAUDE.md т.12 и второ копие, което ги изпуска, не гърми —
   просто излиза с колони извън листа. */
function llPrintCss(){
  return (
    '@media print{'+
      '@page{size:A4 portrait;margin:10mm;}'+
      '.no-print{display:none!important;}'+
      'body{margin:0;padding:0;}'+
      '.lp-row{page-break-inside:avoid;}'+
    '}'+
    '.lp-wrap{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;width:190mm;max-width:190mm;margin:0 auto;}'+
    '.lp-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm;}'+
    '.lp-wh{font-size:12pt;font-weight:700;margin-bottom:1mm;}'+
    '.lp-logo{height:24pt;width:auto;flex-shrink:0;margin-left:8mm;}'+
    '.lp-title{font-size:13pt;font-weight:700;text-align:center;letter-spacing:.04em;margin:2mm 0 1mm;}'+
    '.lp-sub{font-size:9pt;text-align:center;color:#444;margin-bottom:4mm;}'+
    '.lp-meta{width:100%;border-collapse:collapse;margin-bottom:3.5mm;}'+
    '.lp-meta td{padding:.6mm 0;font-size:9pt;vertical-align:top;line-height:1.35;}'+
    '.lp-meta td:first-child{width:42mm;font-weight:600;}'+
    '.lp-note{border:1px solid #bbb;border-radius:1.5mm;padding:2mm 2.5mm;font-size:8.5pt;margin-bottom:3.5mm;}'+
    '.lp-sec{font-size:9.5pt;font-weight:700;margin:0 0 2mm;}'+
    '.lp-tbl{width:100%;border-collapse:collapse;margin-bottom:4mm;table-layout:fixed;}'+
    /* Трите правила долу са заради ГЛОБАЛНИЯ CSS на index.html — печатът се
       рендира В страницата и наследява целия ѝ стил (CLAUDE.md т.12):
       1) white-space:normal бие index.html:67 th{white-space:nowrap}; без него
          заглавия като „Коментар склад" не се пречупват и излизат от клетките;
       2) box-sizing:border-box е задължително при table-layout:fixed — иначе
          padding-ът се ДОБАВЯ върху ширината и последната колона пада извън
          листа;
       3) долната рамка на последния ред се възстановява, защото index.html:69
          tr:last-child td{border-bottom:none} бие „.lp-tbl td" по специфичност
          (0,1,2 срещу 0,1,1) и оставя таблицата отворена отдолу. */
    '.lp-tbl th{box-sizing:border-box;border:1px solid #999;padding:1.2mm 0.8mm;font-size:7.5pt;text-align:left;background:#eee;font-weight:700;white-space:normal;word-break:normal;overflow-wrap:break-word;}'+
    '.lp-tbl td{box-sizing:border-box;border:1px solid #bbb;padding:1.2mm 0.8mm;font-size:8pt;vertical-align:top;word-break:normal;overflow-wrap:break-word;}'+
    '.lp-tbl tr:last-child td{border-bottom:1px solid #bbb;}'+
    '.lp-num{text-align:right;}'+
    '.lp-kind{font-weight:700;}'+
    '.lp-tag{font-size:7pt;color:#92400e;white-space:nowrap;}'+
    '.lp-mtag{font-size:7pt;color:#111;white-space:normal;overflow-wrap:break-word;}'+
    /* Черно на сиво, не цветно: бланката се печата и на черно-бял принтер,
       а там светлочервен текст става почти невидим. */
    '.lp-miss{font-size:7.5pt;font-weight:700;color:#000;background:#ddd;border:1px solid #666;padding:0 1mm;white-space:nowrap;}'+
    '.lp-who{font-size:7pt;}'+
    /* Празното каре за ръчна отметка — листът често се разписва на хартия. */
    '.lp-box{display:inline-block;width:4mm;height:4mm;border:1px solid #555;}'+
    '.lp-sign{display:flex;flex-wrap:wrap;gap:6mm;border-top:1px dotted #999;padding-top:3mm;margin-top:2mm;}'+
    '.lp-sign-item{flex:1 1 60mm;font-size:8.5pt;}'+
    '.lp-dots{border-bottom:1px dotted #555;height:6mm;margin-bottom:1mm;}'+
    '.lp-foot{font-size:7.5pt;color:#555;margin-top:3mm;}' +
    /* Артикулите под реда в печата на целия лист — малки, но пречупващи се:
       името на артикула е свободен текст и в тясна колона иначе излиза. */
    '.lp-plist{font-size:7.5pt;color:#333;white-space:normal;overflow-wrap:break-word;line-height:1.35;}' +
    /* Описът на палет: едър номер, защото се чете от метър разстояние. */
    '.lp-unit{font-size:16pt;font-weight:700;text-align:center;margin:1mm 0 3mm;}' +
    '.lp-sum td{font-weight:700;background:#f4f4f4;}'
  );
}

function llRenderPrint(list, items, storeFilter){
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  /* Отхвърлените редове са отсяти вече в llPrint() — ЕДНО място, а не
     второ копие тук, което да се разминава при следващата промяна. */
  var rows = (items || []).filter(function(i){
    return !storeFilter || i.store_name === storeFilter;
  });
  /* Подредба: обект, после палет №, после позиция. Групирането по-долу пази
     реда на входа, тоест сортирането ТУК е това, което подрежда листа. */
  rows = rows.slice().sort(function(a, b){
    var s = String(a.store_name || '').localeCompare(String(b.store_name || ''));
    if(s) return s;
    var an = a.pallet_no == null ? 9999 : Number(a.pallet_no);
    var bn = b.pallet_no == null ? 9999 : Number(b.pallet_no);
    if(an !== bn) return an - bn;
    return (a.position || 0) - (b.position || 0);
  });

  var PRINT_CSS = llPrintCss();

  /* Обобщение по обект — същата сметка като llSummaryByStore() на екрана. */
  var sum = llSummaryByStore(rows);
  var sumHtml = sum.length
    ? sum.map(function(s){
        return '<tr class="lp-row"><td>'+esc(s.store)+'</td>'+
          '<td class="lp-num">'+s.pallet+'</td>'+
          '<td class="lp-num">'+s.oversize+'</td>'+
          '<td class="lp-num">'+s.roll+'</td>'+
          '<td class="lp-num">'+s.bulk+'</td>'+
          '<td class="lp-num">'+s.received+'/'+s.total+'</td></tr>';
      }).join('')
    : '<tr class="lp-row"><td>—</td><td class="lp-num">0</td><td class="lp-num">0</td><td class="lp-num">0</td><td class="lp-num">0</td><td class="lp-num">0/0</td></tr>';

  /* Таблицата по товарни единици. Документ върху няколко палета дава по един
     ред във ВСЕКИ палет — точно както е в базата. Няколко документа на един
     палет дават редове един под друг, а видът се изписва веднъж с rowspan. */
  var n = 0;
  /* Под-редът с артикулите е ОТДЕЛЕН <tr> — затова rowspan-ът на „Вид"
     брои и тях. Иначе всички колони под него се изместват с една наляво. */
  var withProds = function(it){ return (it.products || []).length > 0; };
  var bodyHtml = llPalletGroups(rows).map(function(g){
    var span = g.rows.reduce(function(a, it){ return a + 1 + (withProds(it) ? 1 : 0); }, 0);
    return g.rows.map(function(it, k){
      n++;
      var doc = it.purchase_doc ? esc(it.purchase_doc) : '<span style="color:#777;">без</span>';
      if(it.partial)    doc += '<div class="lp-tag">частично</div>';
      return '<tr class="lp-row" data-store="'+escVal(it.store_name || '')+'">'+
        '<td class="lp-num">'+n+'</td>'+
        (k === 0 ? '<td class="lp-kind" rowspan="'+span+'">'+esc(llKindLabel(g.rows[0]))+
          /* Извънгабаритният няма артикули по документ — „какъв е товарът" е
             единственото, което казва какво се вози. Стои до вида, не в
             колоната за коментар: там се чете като бележка встрани. */
          (llIsOversize(g.rows[0].kind) && g.rows[0].warehouse_comment
            ? '<div class="lp-tag">'+esc(g.rows[0].warehouse_comment)+'</div>' : '')+'</td>' : '')+
        '<td>'+doc+'</td>'+
        '<td>'+esc(it.store_name || '—')+'</td>'+
        '<td>'+esc(it.warehouse_comment || '—')+'</td>'+
        '<td>'+esc(it.store_comment || '—')+'</td>'+
        /* Празното каре значи „още не е разписано". Заявената липса НЕ е
           празно каре — тя е попълнен ред и на хартия трябва да се чете така,
           иначе разпечатката твърди, че палетът просто не е проверен. */
        '<td class="lp-who">'+(it.received
          ? '✔ '+esc(it.received_by || '')+(it.received_at ? '<div class="lp-tag">'+llFmtStamp(it.received_at)+'</div>' : '')
          : (it.missing
            ? '<span class="lp-miss">НЕПОЛУЧЕНО</span>'+
              (it.store_comment ? '<div class="lp-mtag">'+esc(it.store_comment)+'</div>' : '')+
              (it.missing_at ? '<div class="lp-tag">'+llFmtStamp(it.missing_at)+'</div>' : '')
            : '<span class="lp-box"></span>'))+'</td>'+
      '</tr>'+
      /* 7 колони: № (празна) + Вид (покрита от rowspan) + 5 за артикулите. */
      (withProds(it)
        ? '<tr class="lp-row lp-prow"><td></td><td colspan="5" class="lp-plist">'+
            it.products.map(function(p){
              return esc(p.sap_code)+' · '+esc(p.product_name)+' — <b>'+llFmtQty(p.qty)+'</b> '+esc(p.unit || '')+
                (p.cartons != null ? ' ('+p.cartons+' каш.)' : '');
            }).join('<br>')+'</td></tr>'
        : '');
    }).join('');
  }).join('');
  if(!bodyHtml){
    bodyHtml = '<tr class="lp-row"><td colspan="7" style="text-align:center;color:#777;">Няма редове</td></tr>';
  }

  var now = new Date();
  var pad = function(x){ return (x < 10 ? '0' : '') + x; };
  var stamp = pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear()+' '+
              pad(now.getHours())+':'+pad(now.getMinutes());

  wrap.innerHTML =
    '<style>'+PRINT_CSS+'</style>'+
    '<div style="max-width:820px;margin:0 auto;padding:16px 16px 40px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Товарен лист</div>'+
        '<div style="display:flex;gap:8px;align-items:center;">'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>'+
          '<button onclick="showModule(\'loading\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>'+
        '</div>'+
      '</div>'+
      '<div class="lp-wrap">'+
        '<div class="lp-head">'+
          '<div><div class="lp-wh">'+esc(list.warehouse || '')+'</div></div>'+
          '<img src="'+LL_PRINT_LOGO+'" class="lp-logo" alt="TeMAX">'+
        '</div>'+
        '<div class="lp-title">ТОВАРЕН ЛИСТ'+(storeFilter ? ' — '+esc(storeFilter) : '')+'</div>'+
        '<div class="lp-sub">Протокол за товарене</div>'+
        '<table class="lp-meta">'+
          '<tr><td>Склад изпращач:</td><td>'+esc(list.warehouse || '—')+'</td></tr>'+
          '<tr><td>Дата на товарене:</td><td>'+fmtDate(list.list_date)+'</td></tr>'+
          '<tr><td>Товарил:</td><td>'+esc(list.executed_by || '—')+'</td></tr>'+
          '<tr><td>Статус:</td><td>'+esc(llStatusMeta(list.status)[1])+'</td></tr>'+
          '<tr><td>Изпратен:</td><td>'+llFmtStamp(list.sent_at)+'</td></tr>'+
          '<tr><td>Приключен:</td><td>'+llFmtStamp(list.done_at)+'</td></tr>'+
        '</table>'+
        (list.comment ? '<div class="lp-note"><b>Коментар:</b> '+esc(list.comment)+'</div>' : '')+
        '<div class="lp-sec">Обобщение по обекти</div>'+
        '<table class="lp-tbl">'+
          /* 60+26+26+26+26+26 = 190 */
          '<colgroup><col style="width:60mm;"><col style="width:26mm;"><col style="width:26mm;"><col style="width:26mm;"><col style="width:26mm;"><col style="width:26mm;"></colgroup>'+
          '<tr><th>Обект</th><th>Палети</th><th>Извънгаб.</th><th>Рула</th><th>Насип</th><th>Получени</th></tr>'+
          sumHtml+
        '</table>'+
        '<div class="lp-sec">Товарни единици</div>'+
        '<table class="lp-tbl">'+
          /* Фиксирани ширини, сума точно 190mm (полезната ширина на A4 при
             10mm полета). Спазват се дословно само защото клетките са с
             box-sizing:border-box — виж PRINT_CSS.
             8+26+34+26+34+30+32 = 190 */
          '<colgroup><col style="width:8mm;"><col style="width:26mm;"><col style="width:34mm;"><col style="width:26mm;"><col style="width:34mm;"><col style="width:30mm;"><col style="width:32mm;"></colgroup>'+
          '<tr><th>№</th><th>Вид</th><th>Стокова №</th><th>Обект</th><th>Коментар склад</th><th>Коментар обект</th><th>Получено</th></tr>'+
          bodyHtml+
        '</table>'+
        '<div class="lp-sign">'+
          '<div class="lp-sign-item"><div class="lp-dots"></div>Товарил: име и подпис</div>'+
          '<div class="lp-sign-item"><div class="lp-dots"></div>Приел: име и подпис</div>'+
        '</div>'+
        '<div class="lp-foot">Отпечатано '+esc(stamp)+' от '+esc(llActor())+'</div>'+
      '</div>'+
    '</div>';
}
