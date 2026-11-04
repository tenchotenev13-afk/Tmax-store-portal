/* transit.js — Стока на път (SAP формат) — v2 с incoming/outgoing */

var transitData   = [];
var transitFilter = 'pending';
var transitStore  = '';
var transitDir    = 'all'; /* 'all' | 'in' („📥 Получавам") | 'out' („📤 Изпращам") — спрямо transitViewpoint(), не direction */
var transitEditId = null;
var transitMonthFilter = ''; /* 'YYYY-MM' за филтър по месец */
var transitSearch = ''; /* търсене по документ / SAP код / описание */
var _transitPendingScrollY = null; /* мост между loadTransit() и renderTransit() за запазване на скрола */
var _transitSearchTimer = null;
var _transitVisible = []; /* показаният списък след филтрите — за „Провери всички чакащи" */
/* Архивът (archived_at, етап 1 от 03.11.2026): редове, чието ВД го няма в
   последния импорт. Държат се ОТДЕЛНО от transitData, за да не влизат в нито
   един брояч, банер или таб — виждат се само през чипа „🗄 Архив". */
var transitArchive = [];
/* Таблицата се рисува на порции (ускоряване, 04.11.2026) — виж renderTransit. */
var TRANSIT_PAGE = 200;
var transitShown = TRANSIT_PAGE;
var _transitListSig = null;

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
/* Кодовете на двата логистични склада (и „получаващ", и „изпращащ" тип) —
   доставка от тях е винаги 'incoming' за получателя (parseTransitRows). */
var TRANSIT_WAREHOUSE_CODES = { '5505':1, '5518':1, '2505':1, '2518':1 };
/* Ред от логистичен склад влиза при импорта направо като ИЗПРАТЕН (решение
   на Тенчо, 04.11.2026): ред влиза само с ВД, импортът е месечен — стоката
   почти винаги вече е тръгнала; складът ползва „↩ Върни изпращането" само за
   изключенията. sender_status_by = TRANSIT_IMPORT_SENDER_BY, за да личи, че
   не е натиснато от склада. Само НОВ ред — съществуващият не се пипа
   (transitImportBody). Трансферите между магазини — ръчно, без промяна.
   Складът се познава по името, в което parseSupplierName превежда кода. */
var TRANSIT_IMPORT_SENDER_BY = 'импорт';
function transitIsWarehouseSupplier(r){
  var s=r&&r.supplier; if(!s) return false;
  for(var c in TRANSIT_WAREHOUSE_CODES){ if(PLANT_ALL[c]===s) return true; }
  return false;
}

/* Истинските 18 магазина (без складове/сервиз/администрация) — използва се
   за разпознаване на "трансфер между магазини" при импорт, независимо дали
   кодът на доставчика е от "получаващ" или "изпращащ" тип. */
var REAL_STORE_NAMES = {
  'Враца':1,'Габрово':1,'Гоце Делчев':1,'Добрич':1,'Дупница':1,'Карлово':1,'Козлодуй':1,
  'Кърджали':1,'Монтана':1,'Петрич':1,'Пирдоп':1,'Раднево':1,'Севлиево':1,'Силистра':1,
  'Сливен':1,'Троян':1,'Търговище':1,'Шумен':1
};

/* Етап 3 (04.11.2026): status е статусът на ПОЛУЧАТЕЛЯ; изпращачът има свое
   поле sender_status ('sent' / NULL). Стойност status 'sent' повече не се
   пише — стар ред с нея (преди transit-status-split-data.sql) се показва като
   „получател pending + изпращач изпратена" (transitRecvStatus / transitSenderSent). */
var T_STATUS = {
  pending:  { label:'⏳ Все още недоставена', bg:'#fef9c3', color:'#92400e' },
  received: { label:'✅ Доставена',           bg:'#f0fdf4', color:'#16a34a' },
  rejected: { label:'✕ Неприето',            bg:'#fff1f2', color:'#dc2626' }
};
var T_SENDER = {
  none: { label:'📭 Неизпратена', bg:'#f1f5f9', color:'#64748b' },
  sent: { label:'📤 Изпратена',   bg:'#f5f3ff', color:'#7c3aed' }
};

function canEditTransit(){
  return currentUser&&['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role)>=0;
}
function canAddTransit(){
  return currentUser&&['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
}

/* ── ДВЕ НЕЗАВИСИМИ СТРАНИ (етап 3, 04.11.2026) ──
   Получателят (store_name) отговаря за status, изпращачът (supplier) — за
   sender_status. Всеки отбелязва своето БЕЗ да чака другия; офисът може и
   двете. „Чака засечка" (recon_*) — и двете страни и офисът. Правилата по
   direction (outgoing, двустъпковият поток) отпадат. */
function transitRecvStatus(r){
  var s=r&&r.status;
  return (!s||s==='sent')?'pending':s;   /* стар 'sent' = получателят още не е отговорил */
}
function transitSenderSent(r){
  return !!r&&(r.sender_status==='sent'||r.status==='sent');
}
/* Моята страна в реда — обектът (store_name на акаунта) или складът. */
function transitMyParty(){
  if(!isGlobal()) return (currentUser&&currentUser.store_name)||'';
  return transitOwnWarehouse();
}
/* Офис = глобален акаунт, който не е склад (складът е в isGlobal()). */
function transitIsOffice(){
  return isGlobal()&&!transitOwnWarehouse();
}
function transitIsSenderOf(r){
  var me=transitMyParty();
  return !!(me&&r&&me===r.supplier);
}
function transitIsReceiverOf(r){
  var me=transitMyParty();
  return !!(me&&r&&me===r.store_name);
}
function transitCanMarkReceived(r){
  return !!r&&!r.archived_at&&canEditTransit()&&(transitIsOffice()||transitIsReceiverOf(r));
}
function transitCanMarkSent(r){
  return !!r&&!r.archived_at&&canEditTransit()&&(transitIsOffice()||transitIsSenderOf(r));
}
function transitCanRecon(r){
  return transitCanMarkReceived(r)||transitCanMarkSent(r);
}
/* Чака ли редът МЕН като получател: изпращачът го е изпратил, аз още не съм
   отговорил. Бутоните „✅ Доставена" / „✕ Неприето" НЕ зависят от това —
   получателят може да отбележи и неизпратен ред. */
function transitAwaitsMyReceive(r){
  return !!r&&transitSenderSent(r)&&transitRecvStatus(r)==='pending'&&transitCanMarkReceived(r);
}
/* Изпратени от мен, по които ходът е на получателя. */
function transitAwaitsOther(r){
  return !!r&&transitSenderSent(r)&&transitRecvStatus(r)==='pending'&&transitIsSenderOf(r)&&!transitIsReceiverOf(r);
}
/* Влизане в модула през навигацията (showModule) — НЕ при презареждане след
   клик. Има ли обектът трансфери за приемане, те са първото, което вижда:
   подтаб „📥 Получавам" + филтър „📥 Чакат мен" (до 03.11.2026 — подтаб
   „Трансфери"). Няма ли — нищо не се пипа.
   transitOpenFocusSkip: „Отвори →" от Бюлетина (задачата е за входящите
   доставки) иска модула както досега, без този скок. */
var _transitFocusOnLoad = false;
var transitOpenFocusSkip = false;
function transitOpenFocus(){
  _transitFocusOnLoad = !transitOpenFocusSkip;
  transitOpenFocusSkip = false;
}
function transitApplyOpenFocus(){
  if(!_transitFocusOnLoad) return;
  _transitFocusOnLoad = false;
  /* Обект ИЛИ склад (04.11.2026: складът е в isGlobal(), затова до тогава не
     скачаше и не виждаше връщанията, които чакат него). Офис — без скок. */
  if(!transitHasOwnViewpoint()||!transitData.some(transitAwaitsViewpoint)) return;
  transitDir='in'; transitFilter='mine';
  transitStore=''; transitMonthFilter=''; transitSearch='';
}

/* ── ТАБОВЕТЕ „📥 Получавам" / „📤 Изпращам" (етап 2, 03.11.2026) ──
   Табът не е посоката от импорта (direction), а РОЛЯТА на един обект в реда:
   „Получавам" = редовете, в които той е получател (store_name), „Изпращам" =
   в които е изпращач (supplier) — от склад и от магазин заедно. Този обект е
   „гледната точка": за обекта — самият той, за склада — складът, за офиса —
   избраният в падащото меню. Без гледна точка (офис без избран обект)
   табовете показват празна таблица и молба да се избере обект. */
function transitViewpoint(){
  if(!isGlobal()) return (currentUser&&currentUser.store_name)||'';
  var wh=transitOwnWarehouse();
  if(wh) return wh;
  return transitStore||'';
}
/* Собствена гледна точка — обект или склад (не офис с избран обект). Банерът
   и скокът при влизане са само за тях. */
function transitHasOwnViewpoint(){
  return !isGlobal()||!!transitOwnWarehouse();
}
/* „Чака гледната точка": изпращачът е отбелязал „📤 Изпратена", получателят е
   още „⏳ Все още недоставена", а гледната точка е ПОЛУЧАТЕЛЯТ. Чипът
   „📥 Чакат мен", банерът и скокът при влизане вървят по него. От етап 3
   (04.11.2026) — по sender_status при всяка посока, не само transfer + 'sent'. */
function transitAwaitsViewpoint(r){
  var vp=transitViewpoint();
  return !!r&&!!vp&&transitSenderSent(r)&&transitRecvStatus(r)==='pending'&&r.store_name===vp;
}
/* Чиповете по таб (етап 3): [ключ, надпис, клас]; '|' е разделител. */
var TRANSIT_TAB_DEFAULT = { all:'pending', 'in':'pending', out:'snone' };
function transitChipsFor(dir,vp){
  var H=' chip-hist', tail=[['|'],['all','Всички',H],['archive','🗄 Архив',H]];
  if(dir==='out') return [['snone','📭 Неизпратени',''],['ssent','📤 Изпратени',''],['recon','🔍 Чака засечка','']].concat(tail);
  var c=[['pending','⏳ Все още недоставени',''],['received','✅ Доставени',''],['rejected','✕ Неприети',''],['recon','🔍 Чака засечка','']];
  if(dir==='in'&&vp) c.push(['mine','📥 Чакат мен','']);
  return c.concat(tail);
}
/* Изпращачът е магазин (реален обект) или склад / сервиз / администрация. */
function transitSenderIsStore(r){
  return !!(r&&r.supplier&&REAL_STORE_NAMES[r.supplier]);
}
function transitSenderKindLabel(r){
  return transitSenderIsStore(r)?'🏬 От магазин':'🏭 От склад';
}
/* Баджът на реда: спрямо гледната точка („📥 Получавам" / „📤 Изпращам");
   без нея (офис без избран обект) — по вида на изпращача. */
function transitRowBadgeHtml(r,vp){
  var S='padding:2px 6px;border-radius:20px;font-size:9.5px;font-weight:700;white-space:nowrap;';
  if(vp&&r.store_name===vp) return '<span class="t-badge" style="background:#eff6ff;color:#1e40af;'+S+'">📥 Получавам</span>';
  if(vp&&r.supplier===vp)   return '<span class="t-badge" style="background:#f5f3ff;color:#7c3aed;'+S+'">📤 Изпращам</span>';
  return transitSenderIsStore(r)
    ? '<span class="t-badge" style="background:#fff7ed;color:#c2410c;'+S+'">'+transitSenderKindLabel(r)+'</span>'
    : '<span class="t-badge" style="background:#f1f5f9;color:#334155;'+S+'">'+transitSenderKindLabel(r)+'</span>';
}
/* Банерът над таблицата — за обекта и склада (не за офиса), само при брой > 0. */
function transitStoreBannerHtml(){
  if(!transitHasOwnViewpoint()) return '';
  var n=transitData.filter(transitAwaitsViewpoint).length;
  var m=transitData.filter(transitAwaitsOther).length;
  var h='';
  if(n){
    h+='<div id="t-recv-note" style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:9px 14px;margin-bottom:8px;font-size:12.5px;color:#92400e;">'+
      '📥 <b>'+n+'</b> '+(n===1?'изпратен ред чака да го приемете':'изпратени реда чакат да ги приемете')+'. Когато стоката пристигне, натиснете „'+T_STATUS.received.label+'“ или „'+T_STATUS.rejected.label+'“.</div>';
  }
  if(m){
    h+='<div id="t-other-note" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 14px;margin-bottom:8px;font-size:12px;color:#64748b;">'+
      '📤 '+m+(m===1?' ваш изпратен ред чака':' ваши изпратени реда чакат')+' получателя.</div>';
  }
  return h;
}

/* Складов профил (role 'logistics' със store_name) вижда само редовете на
   своя склад. Връща името на склада или '' (admin, accounting, логистик без
   store_name - те не се ограничават). */
function transitOwnWarehouse(){
  return (currentUser&&currentUser.role==='logistics'&&currentUser.store_name)?currentUser.store_name:'';
}

/* ── ТЕСЕН ЕКРАН (телефон) ──
   Таблицата е min-width 1060px (.tbl-tt-compact, index.html) и на телефон
   колоната „Действия" остава извън екрана — бутоните се виждаха чак след
   плъзгане надясно (Монтана, 24.10.2026). На тесен екран бутоните отиват в
   пълноширок под-ред под реда, залепен вляво (sticky), а колоната отпада.
   Прагът 600px е същият като за бутоните на Товарни листи (.ll-tbl, index.html).
   Широк екран — без промяна. */
var TRANSIT_NARROW_MQ = '(max-width:600px)';
function transitNarrow(){
  try{ return !!(window.matchMedia && window.matchMedia(TRANSIT_NARROW_MQ).matches); }catch(e){ return false; }
}
/* Завъртане на телефона / смяна на ширината през прага → наново, ако модулът е на екрана. */
(function(){
  try{
    var mq = window.matchMedia && window.matchMedia(TRANSIT_NARROW_MQ);
    if(mq && mq.addListener) mq.addListener(function(){
      var m=document.getElementById('mod-transit');
      if(m && m.style.display==='block' && transitData.length) renderTransit();
    });
  }catch(e){}
})();

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

  transitData=[]; transitArchive=[];
  var SB_URL='https://xiwkdiqqplgdcrkewgtv.supabase.co';
  var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';

  /* Една страница → {ok, data, total, err}. Не хвърля: дали грешката има
     значение, решава извикващият (страница 1 при непълна страница 0 е
     извън данните и PostgREST може да върне 416 — това не е грешка). */
  function fetchPage(from){
    return fetch(SB_URL+'/rest/v1/goods_transit?order=doc_date.desc,purchase_doc.asc,position.asc'+storeFilter,{
      headers:{
        'apikey':SB_KEY,
        'Authorization':'Bearer '+SB_KEY,
        'Range':from+'-'+(from+999),
        'Range-Unit':'items',
        'Prefer':'count=exact'
      }
    }).then(function(r){
      var range='';
      try{ range=(r.headers&&r.headers.get&&r.headers.get('content-range'))||''; }catch(e){}
      return r.json().then(function(data){
        var m=range.match(/\/(\d+)$/);
        if(r.ok===false||!Array.isArray(data)) return {ok:false,data:[],total:0,err:data||('HTTP '+r.status)};
        return {ok:true,data:data,total:m?parseInt(m[1]):0};
      });
    }).catch(function(e){ return {ok:false,data:[],total:0,err:e}; });
  }
  function fail(err){
    var w=document.getElementById('mod-transit');
    if(w)w.innerHTML='<div style="color:#dc2626;padding:40px;">Грешка: '+JSON.stringify(err&&err.message?err.message:err)+'</div>';
  }
  /* „Има още" — пълна страница и (ако броят е известен) не сме стигнали края. */
  function more(page,loaded){ return page.data.length===1000&&(!page.total||loaded<page.total); }
  /* Страница 3 и нататък — една след друга, както досега. */
  function rest(from){
    return fetchPage(from).then(function(p){
      if(!p.ok){ fail(p.err); return; }
      transitData=transitData.concat(p.data);
      if(more(p,transitData.length)) return rest(from+1000);
      renderTransit();
    });
  }
  /* Страници 0 и 1 — ЕДНОВРЕМЕННО (ускоряване, 04.11.2026): при 1 000–2 000
     реда (офис, склад Търговище) това е второто чакане по мрежата по-малко.
     Редът в transitData е по номер на страница, не по реда на пристигане.
     Провалена страница → съобщението за грешка, без непълна таблица. */
  Promise.all([fetchPage(0),fetchPage(1000)]).then(function(ps){
    var p0=ps[0], p1=ps[1];
    if(!p0.ok){ fail(p0.err); return; }
    transitData=p0.data.slice();
    if(!more(p0,transitData.length)){ renderTransit(); return; }
    if(!p1.ok){ fail(p1.err); return; }
    transitData=transitData.concat(p1.data);
    if(more(p1,transitData.length)) return rest(2000);
    renderTransit();
  });
}

/* Изважда архивираните редове от transitData в transitArchive. Вика се при
   всяко рисуване — идемпотентно, тоест няма значение откъде е дошъл редът. */
function transitSplitArchive(){
  if(!transitData.some(function(r){return !!r.archived_at;})) return;
  transitArchive=transitArchive.concat(transitData.filter(function(r){return !!r.archived_at;}));
  transitData=transitData.filter(function(r){return !r.archived_at;});
}

/* ИД се пази без водещите нули (0080472987 → 80472987); търсенето реже и
   въведеното, тоест ИД се намира и с нулите, и без тях. */
function transitStripZeros(v){
  return String(v==null?'':v).trim().replace(/^0+/,'');
}

/* ── RENDER ── */
function renderTransit(){
  var wrap=document.getElementById('mod-transit');if(!wrap)return;
  transitSplitArchive();
  transitApplyOpenFocus();
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
  var _qId=transitStripZeros(_q); /* само нули („00") → празно, не съвпада с всичко */
  var _vp=transitViewpoint();
  function transitRows(over){
    over=over||{};
    var dir=over.dir!==undefined?over.dir:transitDir;
    var status=over.status!==undefined?over.status:transitFilter;
    /* „🗄 Архив" сменя ИЗТОЧНИКА, не е статус: останалите филтри важат и там. */
    var rows=status==='archive'?transitArchive:transitData;
    /* „📥 Получавам" / „📤 Изпращам" — по ролята на гледната точка в реда, не по
       direction. Без гледна точка — нищо (офисът трябва да избере обект). */
    var vpTab=dir==='in'||dir==='out';
    if(vpTab){
      if(!_vp) rows=[];
      else rows=rows.filter(function(r){ return dir==='in' ? r.store_name===_vp : r.supplier===_vp; });
    }
    /* Чиповете (етап 3): получател — pending / received / rejected (по
       transitRecvStatus, стар 'sent' = pending); изпращач — snone / ssent (по
       sender_status); recon — „🔍 Чака засечка"; mine — „📥 Чакат мен". */
    if(status==='pending'||status==='received'||status==='rejected') rows=rows.filter(function(r){return transitRecvStatus(r)===status;});
    else if(status==='snone') rows=rows.filter(function(r){return !transitSenderSent(r);});
    else if(status==='ssent') rows=rows.filter(transitSenderSent);
    else if(status==='recon') rows=rows.filter(function(r){return !!r.recon_at;});
    else if(status==='mine') rows=rows.filter(transitAwaitsViewpoint);
    if(vpTab){
      /* В табовете падащото меню за офиса Е гледната точка (вече приложена).
         За обекта и склада то е ДРУГАТА страна: изпращачът в „Получавам",
         получателят в „Изпращам". */
      if(transitStore&&(transitOwnWarehouse()||!isGlobal())){
        rows=rows.filter(function(r){ return dir==='in' ? r.supplier===transitStore : r.store_name===transitStore; });
      }
    }else if(transitStore&&transitOwnWarehouse()){
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
            || (r.material_name&&String(r.material_name).toLowerCase().indexOf(_q)>=0)
            || (r.inbound_delivery&&String(r.inbound_delivery).toLowerCase().indexOf(_q)>=0)
            || (_qId&&r.outbound_delivery&&transitStripZeros(r.outbound_delivery).indexOf(_qId)>=0);
      });
    }
    return rows;
  }
  /* Чип, който го няма в този таб (напр. стар 'sent' или 'snone' в „Получавам"),
     → подразбиращият се за таба. */
  if(!transitChipsFor(transitDir,_vp).some(function(f){return f[0]===transitFilter;})) transitFilter=TRANSIT_TAB_DEFAULT[transitDir]||'pending';
  var list=transitRows();
  /* На порции по TRANSIT_PAGE (ускоряване, 04.11.2026): рисуват се първите N
     реда от ЦЕЛИЯ филтриран списък. Смяна на таб / чип / обект / месец /
     търсене (подписът на филтрите) → отново първите 200; действие на ред не
     сменя подписа и пази колко са показани. */
  var _sig=[transitDir,transitFilter,transitStore,transitMonthFilter,transitSearch].join('\u0001');
  if(_sig!==_transitListSig){ transitShown=TRANSIT_PAGE; _transitListSig=_sig; }
  var shownList=list.slice(0,transitShown);

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
    /* „🗑 Изчисти всички" е махнат (етап 1, 03.11.2026): импортът сверява по
       ВД и архивира липсващите, таблицата вече не се изчиства. */
  }
  h+='</div></div>';

  /* Табовете: „Получавам" / „Изпращам" спрямо гледната точка (етап 2).
     Клик на таб НУЛИРА чипа към подразбирания за таба (етап 3, 04.11.2026 —
     „Чакат мен" оставаше избран в „Изпращам" и таблицата беше празна), затова
     числото под таба = редовете след клик с подразбирания чип:
     „Всички" — получател „Все още недоставени"; „Получавам (N чакат)" —
     получател pending; „Изпращам (N за изпр.)" — изпращач „Неизпратени". */
  h+='<div style="display:flex;gap:0;margin-bottom:12px;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;max-width:640px;">';
  [['all','📦📤 Всички',(transitData.length?'('+transitRows({dir:'all',status:TRANSIT_TAB_DEFAULT.all}).length+')':'')],
   ['in','📥 Получавам',_vp?'('+transitRows({dir:'in',status:TRANSIT_TAB_DEFAULT['in']}).length+' чакат)':''],
   ['out','📤 Изпращам',_vp?'('+transitRows({dir:'out',status:TRANSIT_TAB_DEFAULT.out}).length+' за изпр.)':'']].forEach(function(t){
    var active=transitDir===t[0];
    h+='<button onclick="transitDir=\''+t[0]+'\';transitFilter=\''+TRANSIT_TAB_DEFAULT[t[0]]+'\';renderTransit()" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:'+(active?'#0f172a':'#fff')+';color:'+(active?'#fff':'#64748b')+';">'+t[1]+'<div style="font-size:10px;opacity:0.7;">'+t[2]+'</div></button>';
  });
  h+='</div>';

  /* Статус (чипове с брой) + магазин + месец — на един ред. Общият вид е .chips (index.html);
     атрибутът е data-tt-f (НЕ data-f — сблъсък с Разлики). Числото = редовете след клик на чипа. */
  h+='<div id="t-filters" class="filter-bar chips" style="margin:0 0 12px;">';
  h+='<span class="chips-label">Покажи:</span>';
  /* Чиповете по таб (етап 3) — винаги видими, и при 0 (правило 11); числото
     = редовете след клик. „📥 Чакат мен" — в „Получавам" при гледна точка. */
  transitChipsFor(transitDir,_vp).forEach(function(f){
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
  h+='<input type="text" id="t-search" placeholder="🔍 Търси по документ, ВД, ИД, SAP код, описание..."value="'+escVal(transitSearch)+'" oninput="setTSearch(this.value)" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:7px 32px 7px 10px;font-size:12.5px;font-family:inherit;">';
  if(transitSearch){
    h+='<button onclick="setTSearch(\'\');document.getElementById(\'t-search\').value=\'\';" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;">✕</button>';
  }
  h+='</div>';

  /* Архивът е само за четене — не влиза и в „Провери всички чакащи". */
  var inArchive=transitFilter==='archive';
  _transitVisible=inArchive?[]:list;
  h+=transitStoreBannerHtml();
  h+=tReviewCounterHtml(_transitVisible);
  if((transitDir==='in'||transitDir==='out')&&!_vp){
    h+='<div id="t-vp-note" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 14px;margin-bottom:8px;font-size:12.5px;color:#1e3a5f;">'+
      'Изберете обект от падащото меню — табът показва какво '+(transitDir==='in'?'получава':'изпраща')+' той.</div>';
  }
  if(inArchive){
    h+='<div id="t-archive-note" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 14px;margin-bottom:8px;font-size:12px;color:#64748b;">'+
      '🗄 Архив: редове, чиято доставка (ВД) я няма в последния импорт от SAP. Само за четене; появи ли се ВД-то пак, редът се връща сам.</div>';
  }

  /* Таблица */
  if(!list.length){
    h+='<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  }else{
    var narrow=transitNarrow();
    var ttCols=['Документ · Дата','От → Към','Описание','Количество','Статус'];
    if(!narrow) ttCols.push('Действия');
    h+='<div class="tbl-wrap tbl-compact tbl-tt-compact">';
    h+='<table style="border-collapse:collapse;font-size:12px;">';
    h+='<thead><tr style="background:#f8fafc;">';
    ttCols.forEach(function(c){
      h+='<th style="text-align:left;padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+c+'</th>';
    });
    h+='</tr></thead><tbody>';

    /* Неизпратени редове по (ВД, изпращач) — за „📤 Цялата доставка (N)“. */
    var _vdUnsent={};
    transitData.forEach(function(x){ if(x.inbound_delivery&&!x.archived_at&&!transitSenderSent(x)){ var k=transitVdSupKey(x); _vdUnsent[k]=(_vdUnsent[k]||0)+1; } });
    shownList.forEach(function(r){
      var rs=transitRecvStatus(r), st=T_STATUS[rs]||T_STATUS.pending, sentS=transitSenderSent(r), ss=sentS?T_SENDER.sent:T_SENDER.none;
      /* Отбелязано от импорта, не от склада — „📤 Изпратена · импорт". */
      var ssLabel=ss.label+(sentS&&r.sender_status_by===TRANSIT_IMPORT_SENDER_BY?' · импорт':'');
      var isOut=r.direction==='outgoing';
      var isTransfer=r.direction==='transfer';
      var isOver=rs==='pending'&&r.doc_date&&(new Date()-new Date(r.doc_date))>30*86400000;
      var dirBg=isOut?'rgba(124,58,237,.04)':(isTransfer?'rgba(194,65,12,.04)':'');
      var rowBg=(isOver?'background:#fffbeb;':dirBg);
      h+='<tr style="border-bottom:'+(narrow?'none':'1px solid #f1f5f9')+';'+rowBg+'">';
      /* 1. Документ · Дата + бадж за посока */
      h+='<td style="padding:7px 8px;">'+
        '<div style="font-family:DM Mono,monospace;font-size:11px;word-break:break-word;">'+esc(r.purchase_doc||'')+'</div>'+
        '<div style="font-size:10px;color:#94a3b8;">Поз. '+(r.position||'—')+'</div>'+
        (r.inbound_delivery?'<div class="t-vd" style="font-family:DM Mono,monospace;font-size:10.5px;color:#334155;margin-top:2px;white-space:nowrap;"><b style="font-family:inherit;color:#64748b;">ВД</b> '+esc(r.inbound_delivery)+(r.delivery_position?'<span style="color:#94a3b8;"> · '+esc(r.delivery_position)+'</span>':'')+'</div>':'')+
        (r.outbound_delivery?'<div class="t-id" style="font-family:DM Mono,monospace;font-size:10.5px;color:#334155;white-space:nowrap;"><b style="font-family:inherit;color:#64748b;">ИД</b> '+esc(transitStripZeros(r.outbound_delivery))+'</div>':'')+
        '<div style="font-family:DM Mono,monospace;font-size:11px;color:#94a3b8;margin-top:2px;">'+fmtDate(r.doc_date)+'</div>'+
        '<div style="margin-top:3px;">'+transitRowBadgeHtml(r,_vp)+'</div></td>';
      /* 2. От → Към: доставчикът (почистен както преди) → магазинът */
      h+='<td style="padding:7px 8px;" title="'+esc(r.supplier||'')+'">'+
        '<span style="font-size:11px;color:#64748b;">'+esc((r.supplier||'').replace(/^\d+\s+\d*\s*/,'').replace(/^\d+\s*/,'').replace(/^ТМ\s+/,''))+'</span>'+
        ' → <b style="font-weight:600;">'+esc(r.store_name||'')+'</b></td>';
      /* 3. Описание (реже се с …) + код */
      h+='<td style="padding:7px 8px;overflow:hidden;"><div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(r.material_name||'')+'">'+esc(r.material_name||'')+'</div><div style="font-size:10px;color:#94a3b8;">'+esc(r.material_code||'')+'</div></td>';
      /* 4. Количество + остатък + дата на трансфер */
      /* Основното количество е „К-во по доставка" (ВД); ред без ВД — поръчаното. */
      h+='<td style="padding:7px 8px;white-space:nowrap;">'+(r.delivery_qty!=null?r.delivery_qty:(r.ordered_qty||''))+'<span style="font-size:10px;color:#94a3b8;margin-left:2px;">'+esc(r.unit||'')+'</span>'+
        (r.remaining_qty?'<div style="font-size:10px;color:#64748b;font-weight:600;">остатък '+r.remaining_qty+'</div>':'')+
        (r.transfer_date?'<div style="font-family:DM Mono,monospace;font-size:10px;color:#94a3b8;">'+fmtDate(r.transfer_date)+'</div>':'')+'</td>';
      /* 5. Статус */
      h+='<td style="padding:7px 8px;">'+
          /* Две значки (етап 3): получател и изпращач; плюс „🔍 Чака засечка“. */
          '<div class="t-recv" title="Получател" style="white-space:nowrap;"><span style="background:'+st.bg+';color:'+st.color+';padding:2px 6px;border-radius:20px;font-size:10.5px;font-weight:600;white-space:nowrap;">'+st.label+'</span></div>'+
          '<div class="t-send" title="Изпращач'+(r.sender_status_by?' · '+esc(r.sender_status_by):'')+'" style="margin-top:3px;white-space:nowrap;"><span style="background:'+ss.bg+';color:'+ss.color+';padding:2px 6px;border-radius:20px;font-size:10px;font-weight:600;white-space:nowrap;">'+ssLabel+'</span></div>'+
          transitReconBadgeHtml(r)+
          tReviewedBadgeHtml(r)+
          (r.archived_at?'<div class="t-archived" style="font-size:10px;color:#64748b;font-weight:600;margin-top:2px;white-space:nowrap;">🗄 архив '+fmtDate(String(r.archived_at).slice(0,10))+'</div>':'')+
          (r.comment?'<div style="font-size:10px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(r.comment)+'">'+esc(r.comment)+'</div>':'')+
        '</td>';
      /* 6. Действия — същите бутони и условия като преди. Сглобяват се ВЕДНЪЖ и
         отиват или в колоната (широк екран), или в под-реда (тесен). */
      var actFrom=h.length;
      /* Архивиран ред — само за четене: никакви бутони (canEdit/isAdmin = false за реда). */
      var rowCanEdit=canEdit&&!r.archived_at, rowIsAdmin=isAdmin&&!r.archived_at;
      h+='<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      /* Получател (store_name / офис): „✅ Доставена" / „✕ Неприето" БЕЗ да
         чака изпращача; „↩ Върни" → status pending. Изпращач (supplier / офис):
         „📤 Изпратена" на реда и „📤 Цялата доставка (N)" (N > 1); „↩ Върни
         изпращането" → sender_status NULL. Засечка — и двете страни (етап 3). */
      var BTN='border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:700;cursor:pointer;white-space:nowrap;';
      var BACK='border:1px solid #94a3b8;background:#fff;color:#334155;'+BTN+'font-weight:600;';
      if(transitCanMarkReceived(r)){
        if(rs==='pending'){
          h+='<button data-id="'+r.id+'" data-side="recv" onclick="tMarkStatus(this.dataset.id,\'received\')" style="border:none;background:#16a34a;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);'+BTN+'">'+T_STATUS.received.label+'</button>';
          h+='<button data-id="'+r.id+'" data-side="recv" onclick="tMarkStatus(this.dataset.id,\'rejected\')" style="border:none;background:#dc2626;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);'+BTN+'">'+T_STATUS.rejected.label+'</button>';
          if(tCanReview(r)&&!r.reviewed_at){
            h+='<button data-id="'+r.id+'" onclick="tMarkReviewed(this.dataset.id)" style="border:1px solid #0369a1;background:#f0f9ff;color:#0369a1;'+BTN+'font-weight:600;">👁 Проверено, не е пристигнало</button>';
          }
        } else {
          h+='<button data-id="'+r.id+'" data-side="recv" onclick="tMarkStatus(this.dataset.id,\'pending\')" style="'+BACK+'">↩ Върни</button>';
        }
      }
      if(transitCanMarkSent(r)){
        if(!sentS){
          h+='<button data-id="'+r.id+'" data-side="send" onclick="tMarkSender(this.dataset.id,\'sent\')" style="border:none;background:#7c3aed;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15);'+BTN+'">📤 Изпратена</button>';
          var nDel=r.inbound_delivery?(_vdUnsent[transitVdSupKey(r)]||0):0;
          if(nDel>1){
            h+='<button data-id="'+r.id+'" data-side="send" onclick="tMarkDeliverySent(this.dataset.id)" title="Всички неизпратени редове от ВД '+esc(r.inbound_delivery)+' на '+esc(r.supplier||'')+'" style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;'+BTN+'">📤 Цялата доставка ('+nDel+')</button>';
          }
        } else {
          h+='<button data-id="'+r.id+'" data-side="send" onclick="tMarkSender(this.dataset.id,null)" style="'+BACK+'">↩ Върни изпращането</button>';
        }
      }
      if(transitCanRecon(r)){
        h+=r.recon_at
          ? '<button data-id="'+r.id+'" data-side="recon" onclick="tToggleRecon(this.dataset.id)" style="'+BACK+'">↩ Махни засечка</button>'
          : '<button data-id="'+r.id+'" data-side="recon" onclick="tToggleRecon(this.dataset.id)" style="border:1px solid #b45309;background:#fffbeb;color:#b45309;'+BTN+'font-weight:600;">🔍 Чака засечка</button>';
      }
      if(rowCanEdit){
        h+='<button data-id="'+r.id+'" onclick="openTransitEdit(this.dataset.id)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;">✏️ Редакция</button>';
      }
      if(rowIsAdmin){
        h+='<button data-id="'+r.id+'" onclick="tDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:4px 6px;font-size:10.5px;cursor:pointer;">✕</button>';
      }
      h+='</div>';
      var actHtml=h.slice(actFrom); h=h.slice(0,actFrom);
      if(narrow){
        h+='</tr><tr class="tt-act-row" style="border-bottom:1px solid #f1f5f9;'+rowBg+'"><td colspan="'+ttCols.length+'" style="padding:0 6px 8px;">'+
          '<div class="tt-act-phone" style="position:sticky;left:6px;display:inline-block;max-width:calc(100vw - 56px);">'+actHtml+'</div></td></tr>';
      }else{
        h+='<td style="padding:6px 6px;">'+actHtml+'</td></tr>';
      }
    });
    h+='</tbody></table></div>';
    /* „Показани X от Y" — X на екрана, Y във филтрирания списък; бутонът е там,
       докато има непоказани. Броячите и „Провери всички" са за целия списък. */
    var _total=(inArchive?transitArchive:transitData).length;
    h+='<div id="t-shown" style="font-size:12px;color:#94a3b8;margin-top:8px;">Показани '+shownList.length+' от '+list.length+' записа'+(inArchive?' в архива':'')+
      (list.length!==_total?' <span style="color:#cbd5e1;">(общо '+_total+')</span>':'')+'.</div>';
    if(shownList.length<list.length){
      var _next=Math.min(TRANSIT_PAGE,list.length-shownList.length);
      h+='<div style="text-align:center;margin-top:10px;"><button id="t-more" onclick="transitShowMore()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">Покажи още '+_next+'</button>'+
        '<div style="font-size:11.5px;color:#64748b;margin-top:4px;">Показани '+shownList.length+' от '+list.length+'</div></div>';
    }
  }
  h+='</div>';
  h+=transitModalHtml();
  wrap.innerHTML=h;

  /* Възстановяваме скрола (ако идваме от loadTransit()) и фокуса на полето
     за търсене (ако потребителят пишеше в него в момента на прерисуването). */
  if(_transitPendingScrollY!=null){
    var _y=_transitPendingScrollY;_transitPendingScrollY=null;
    /* След локалното обновяване (действие на ред) пътят минава оттук много по-често;
       без requestAnimationFrame (стара среда, jsdom) — setTimeout. */
    (window.requestAnimationFrame||function(f){return setTimeout(f,0);})(function(){window.scrollTo(0,_y);});
  }
  if(_searchHadFocus){
    var _si=document.getElementById('t-search');
    if(_si){
      _si.focus();
      if(_searchCursorPos!=null)_si.setSelectionRange(_searchCursorPos,_searchCursorPos);
    }
  }
}

/* „Покажи още 200" — без да мести скрола. */
function transitShowMore(){
  transitShown+=TRANSIT_PAGE;
  transitRerender();
}
function setTFilter(f){ transitFilter=f; renderTransit(); }
function setTStore(s){ transitStore=s; renderTransit(); }
function setTSearch(v){
  transitSearch=v;
  clearTimeout(_transitSearchTimer);
  _transitSearchTimer=setTimeout(function(){renderTransit();},180);
}

/* ── ЛОКАЛНО ОБНОВЯВАНЕ СЛЕД ЗАПИС (ускоряване, 04.11.2026) ──
   Действие на ред (статус, „Проверено", дата на трансфер, редакция,
   изтриване) вече НЕ вика loadTransit() — то тегли и рисува всичко наново
   (~3 сек при офиса). След УСПЕШЕН запис същите пратени полета се записват в
   реда в transitData и се рисува отново; скролът и колко реда са показани
   се пазят. При грешка — червен toast и нищо не се пипа. Пълното теглене
   остава при влизане в модула и след импорт. Тригерите в базата работят
   на сървъра както досега. */
function transitApplyLocal(ids,body){
  var set={};
  ids.forEach(function(i){ set[String(i)]=1; });
  transitData.forEach(function(r){ if(set[String(r.id)]) Object.assign(r,body); });
}
function transitRerender(){
  _transitPendingScrollY=window.scrollY||window.pageYOffset||0;
  renderTransit();
}
function transitWriteOk(res){ return !!res&&res.ok!==false; }

/* ── СТАТУС НА ПОЛУЧАТЕЛЯ ──
   Етап 3 (04.11.2026): само pending / received / rejected и само страната
   получател (или офисът). Не чака изпращача; правилата по direction отпадат.
   Стар ред със status 'sent' (преди data-миграцията): при отговор на
   получателя изпращането се пази в sender_status, за да не се изгуби. */
function tMarkStatus(id,status){
  var r=transitData.find(function(x){return String(x.id)===String(id);});
  if(!r)return;
  if(['pending','received','rejected'].indexOf(status)<0) return;
  if(!transitCanMarkReceived(r)){
    toast('Статуса на получателя отбелязва получателят ('+(r.store_name||'')+') или офисът','#dc2626');
    return;
  }
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  var body={status:status,updated_by:who,updated_at:at};
  if(r.status==='sent'&&r.sender_status!=='sent'){ body.sender_status='sent'; body.sender_status_at=r.updated_at||at; body.sender_status_by=r.updated_by||null; }
  /* Прието/неприето затваря реда — „проверено, не е пристигнало" вече не
     описва нищо. Иначе при „↩ Върни" редът би се върнал като проверен. */
  if(status==='received'||status==='rejected'){ body.reviewed_at=null; body.reviewed_by=null; }
  return sbPatch('goods_transit','id=eq.'+id,body).then(function(res){
    if(!transitWriteOk(res)){ toast('⚠️ Статусът НЕ е записан: '+sbErrMsg(res),'#dc2626'); return; }
    transitApplyLocal([id],body);
    transitRerender();
  });
}

/* ── СТАТУС НА ИЗПРАЩАЧА ── 'sent' или null („↩ Върни изпращането"). Пипа САМО
   sender_*; status (получателя) остава. Стар 'sent' в status: при „Върни
   изпращането" става 'pending' — иначе редът би останал „изпратен". */
function tMarkSender(id,val){
  var r=transitData.find(function(x){return String(x.id)===String(id);});
  if(!r)return;
  if(!transitCanMarkSent(r)){
    toast('„Изпратена" отбелязва изпращачът ('+(r.supplier||'')+') или офисът','#dc2626');
    return;
  }
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  var body=val==='sent'
    ? {sender_status:'sent',sender_status_at:at,sender_status_by:who}
    : {sender_status:null,sender_status_at:null,sender_status_by:null};
  if(val!=='sent'&&r.status==='sent') body.status='pending';
  return sbPatch('goods_transit','id=eq.'+id,body).then(function(res){
    if(!transitWriteOk(res)){ toast('⚠️ „Изпратена" НЕ е записано: '+sbErrMsg(res),'#dc2626'); return; }
    transitApplyLocal([id],body);
    transitRerender();
  });
}
function transitVdSupKey(r){ return String(r.inbound_delivery||'')+'\u0001'+String(r.supplier||''); }
/* „📤 Цялата доставка (N)": ЕДИН PATCH за всички редове със същото ВД и
   същия изпращач, които още не са изпратени. Филтърът е и в заявката
   (inbound_delivery + supplier + sender_status is null), и локално. */
function tMarkDeliverySent(id){
  var r=transitData.find(function(x){return String(x.id)===String(id);});
  if(!r||!r.inbound_delivery)return;
  if(!transitCanMarkSent(r)){
    toast('„Изпратена" отбелязва изпращачът ('+(r.supplier||'')+') или офисът','#dc2626');
    return;
  }
  var key=transitVdSupKey(r);
  var ids=transitData.filter(function(x){ return !x.archived_at&&transitVdSupKey(x)===key&&!transitSenderSent(x); }).map(function(x){return x.id;});
  if(!ids.length) return;
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  var body={sender_status:'sent',sender_status_at:at,sender_status_by:who};
  var f='inbound_delivery=eq.'+encodeURIComponent(r.inbound_delivery)+'&supplier=eq.'+encodeURIComponent(r.supplier||'')+
        '&sender_status=is.null&archived_at=is.null';
  return sbPatch('goods_transit',f,body).then(function(res){
    if(!transitWriteOk(res)){ toast('⚠️ Доставката НЕ е отбелязана: '+sbErrMsg(res),'#dc2626'); return; }
    transitApplyLocal(ids,body);
    toast('📤 Изпратени: '+ids.length+' реда от ВД '+r.inbound_delivery);
    transitRerender();
  });
}
/* ── „🔍 ЧАКА ЗАСЕЧКА" ── отделен знак, и от двете страни и от офиса. Пази
   кой, кога и от коя страна (recon_side). */
function tToggleRecon(id){
  var r=transitData.find(function(x){return String(x.id)===String(id);});
  if(!r)return;
  if(!transitCanRecon(r)){ toast('Засечката отбелязват получателят, изпращачът или офисът','#dc2626'); return; }
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  var side=transitIsReceiverOf(r)?'receiver':(transitIsSenderOf(r)?'sender':(transitViewpoint()&&r.supplier===transitViewpoint()?'sender':'receiver'));
  var body=r.recon_at ? {recon_at:null,recon_by:null,recon_side:null} : {recon_at:at,recon_by:who,recon_side:side};
  return sbPatch('goods_transit','id=eq.'+id,body).then(function(res){
    if(!transitWriteOk(res)){ toast('⚠️ Засечката НЕ е записана: '+sbErrMsg(res),'#dc2626'); return; }
    transitApplyLocal([id],body);
    transitRerender();
  });
}
function transitReconBadgeHtml(r){
  if(!r||!r.recon_at) return '';
  var d=new Date(r.recon_at), p=function(n){return (n<10?'0':'')+n;};
  var when=isNaN(d.getTime())?'':p(d.getDate())+'.'+p(d.getMonth()+1);
  var side=r.recon_side==='sender'?'изпращач':(r.recon_side==='receiver'?'получател':'');
  return '<div class="t-recon" style="font-size:10px;color:#b45309;font-weight:700;margin-top:3px;white-space:nowrap;" title="'+esc((r.recon_by||'')+(side?' · '+side:''))+'">🔍 Чака засечка'+
    (r.recon_by?' · '+esc(r.recon_by):'')+(when?' · '+when:'')+(side?' ('+side+')':'')+'</div>';
}

/* ── „ПРОВЕРЕНО, НЕ Е ПРИСТИГНАЛО" ──
   Изричното твърдение на обекта, че е гледал реда и стоката още я няма.
   Статусът остава pending; reviewed_at е отделна колона. Входящ ред без
   нито статус, нито reviewed_at е „необработен" — по него тригерът в базата
   решава дали задачата „Стока на път" е изпълнена (transit_store_done в
   transit-reviewed-schema.sql). Проверява получателят (или офисът). */
function tCanReview(r){
  /* Страната получател (етап 3): обектът-получател или офисът — не складът-изпращач. */
  return !!r&&r.direction==='incoming'&&transitRecvStatus(r)==='pending'&&transitCanMarkReceived(r);
}
function tReviewedBadgeHtml(r){
  if(!r||!r.reviewed_at||transitRecvStatus(r)!=='pending') return '';
  var d=new Date(r.reviewed_at);
  if(isNaN(d.getTime())) return '';
  var p=function(n){return (n<10?'0':'')+n;};
  return '<div class="t-reviewed" title="'+esc(r.reviewed_by||'')+'" style="font-size:10px;color:#0369a1;font-weight:600;margin-top:2px;white-space:nowrap;">👁 проверено '+p(d.getDate())+'.'+p(d.getMonth()+1)+'</div>';
}
/* Колоната „Проверено" в Excel: „дд.мм.гггг ЧЧ:ММ · кой". Само за чакащ ред —
   същото условие като баджа; затворен ред с останала стара стойност е празен. */
function tReviewedExcel(r){
  if(!r||!r.reviewed_at||transitRecvStatus(r)!=='pending') return '';
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
  var body={reviewed_at:at,reviewed_by:who,updated_by:who,updated_at:at};
  return sbPatch('goods_transit','id=eq.'+id,body).then(function(res){
    if(!transitWriteOk(res)){ toast('Грешка при запис','#dc2626'); return; }
    toast('👁 Отбелязано: проверено, не е пристигнало');
    transitApplyLocal([id],body);
    transitRerender();
  });
}
/* Всички чакащи редове от ФИЛТРИРАНИЯ списък (целия, не само показаните
   на екрана 200), които потребителят има право да провери.
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
  var failed=0, failedRows=0, body={reviewed_at:at,reviewed_by:who,updated_by:who,updated_at:at};
  function next(k){
    if(k>=chunks.length){
      if(failed) toast('Част от редовете не се записаха ('+failedRows+' реда в '+failed+' от '+chunks.length+' пакета)','#dc2626');
      else toast('👁 Проверени: '+ids.length);
      transitRerender();
      return;
    }
    return sbPatch('goods_transit','id=in.('+chunks[k].join(',')+')',body).then(function(res){
      /* Локално — само редовете от УСПЕШНИТЕ пакети. */
      if(transitWriteOk(res)) transitApplyLocal(chunks[k],body);
      else { failed++; failedRows+=chunks[k].length; }
      return next(k+1);
    });
  }
  return next(0);
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
      /* „🔍 Чака засечка" се брои като обработен — както reviewed_at (етап 3,
         същото правило като transit_store_done_since). */
      if(transitRecvStatus(r)!=='pending') done++;
      else if(r.reviewed_at||r.recon_at) rev++;
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
  return sbDelete('goods_transit','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('tDelete: редът НЕ беше изтрит',id,res.error);
      toast('⚠️ Редът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      return;
    }
    /* И при count 0 редът го няма в базата — маха се и от екрана. */
    transitData=transitData.filter(function(r){ return String(r.id)!==String(id); });
    if(res.count===0) toast('Нямаше какво да се изтрие — редът вече го няма','#64748b');
    else toast('✓ Изтрит');
    transitRerender();
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
  /* Износът е на активните редове — архивът (transitArchive) не влиза.
     Разделянето е и тук: износът не бива да зависи от това дали екранът е рисуван. */
  transitSplitArchive();
  var rows=[['Посока','Магазин','Доставчик/Склад','Документ','Позиция','ВД','ИД','Дата',
    'Материал','Описание','Кол.','К-во по ВД','МЕ','Остатък','Дата трансфер',
    'Получател — статус','Изпращач — статус','Чака засечка (кой, кога)','Проверено','Коментар',
    'Обновен от','Обновен на']];
  var _plain=function(lbl){ return lbl.replace(/^[^A-Za-zА-Яа-я]+/,''); };
  transitData.forEach(function(r){
    rows.push([
      /* „Посока" по вида на изпращача (етап 2), не по direction от импорта. */
      transitSenderIsStore(r)?'От магазин':'От склад',
      r.store_name||'',r.supplier||'',r.purchase_doc||'',r.position||'',
      r.inbound_delivery||'',r.outbound_delivery?transitStripZeros(r.outbound_delivery):'',
      r.doc_date||'',r.material_code||'',r.material_name||'',
      r.ordered_qty||'',r.delivery_qty!=null?r.delivery_qty:'',r.unit||'',r.remaining_qty||'',
      r.transfer_date||'',
      /* Етап 3: две страни + засечка. Стар 'sent' — получател „Все още
         недоставена", изпращач „Изпратена". Непознат статус — самата стойност. */
      T_STATUS[transitRecvStatus(r)]?_plain(T_STATUS[transitRecvStatus(r)].label):(r.status||''),
      _plain((transitSenderSent(r)?T_SENDER.sent:T_SENDER.none).label)+
        (transitSenderSent(r)&&r.sender_status_by?' · '+r.sender_status_by:''),
      r.recon_at?((r.recon_by||'')+(r.recon_by?', ':'')+String(r.recon_at).slice(0,16).replace('T',' ')+
        (r.recon_side?' ('+(r.recon_side==='sender'?'изпращач':'получател')+')':'')):'',
      tReviewedExcel(r),
      r.comment||'',r.updated_by||'',r.updated_at?r.updated_at.slice(0,16).replace('T',' '):''
    ]);
  });
  var ws=window.XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:14},{wch:16},{wch:22},{wch:14},{wch:8},{wch:12},{wch:10},{wch:12},{wch:10},{wch:30},
    {wch:8},{wch:10},{wch:6},{wch:8},{wch:14},{wch:20},{wch:22},{wch:30},{wch:26},{wch:20},{wch:16},{wch:18}];
  window.XLSX.utils.book_append_sheet(wb,ws,'Стока на път');
  var fname='ТеМАХ_Стока_на_път_'+today()+'.xlsx';
  window.XLSX.writeFile(wb,fname);
  toast('✅ Excel изтеглен! ('+transitData.length+' записа)');
}

/* ── ДАТА НА ТРАНСФЕР ── */
function tSetTransferDate(id){
  var d=prompt('Дата на трансфер (ГГГГ-ММ-ДД):',today());
  if(!d)return;
  var body={transfer_date:d,updated_by:currentUser.display_name||currentUser.email,updated_at:new Date().toISOString()};
  return sbPatch('goods_transit','id=eq.'+id,body).then(function(res){
    if(!transitWriteOk(res)){ toast('⚠️ Датата НЕ е записана: '+sbErrMsg(res),'#dc2626'); return; }
    transitApplyLocal([id],body);
    transitRerender();
  });
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
  updateTrStatusOptions(transitRecvStatus(r));
  document.getElementById('tr-comment').value=r.comment||'';
  m.classList.add('open');
}

/* Статус опциите зависят от посоката: outgoing и transfer имат "Изпратена",
   transfer допълнително позволява и "Прието" (двустъпков поток) */
function updateTrStatusOptions(preferredStatus){
  var dirEl=document.getElementById('tr-direction'); if(!dirEl)return;
  var statusEl=document.getElementById('tr-status'); if(!statusEl)return;
  var dir=dirEl.value;
  /* Етап 3: статусът тук е на ПОЛУЧАТЕЛЯ — еднакъв за всяка посока; „Изпратена"
     е отделно поле (sender_status) и се отбелязва с бутона на реда. */
  void dir;
  var opts='<option value="pending">'+T_STATUS.pending.label+'</option>'+
           '<option value="received">'+T_STATUS.received.label+'</option>'+
           '<option value="rejected">'+T_STATUS.rejected.label+'</option>';
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
  /* Етап 3: правилото „outgoing не може Прието" отпада — status е на получателя. */
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
  /* Редакция → PATCH и същите полета в реда; нов ред → POST с
     return=representation (sbPostReturn), за да влезе в списъка с id-то си —
     без loadTransit (ускоряване, 04.11.2026). */
  var editId=transitEditId;
  var req=editId?
    sbPatch('goods_transit','id=eq.'+editId,data):
    sbPostReturn('goods_transit',data);
  return req.then(function(res){
    if(!res||!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast(editId?'✅ Записано!':'✅ Добавено!');
    closeTransitModal();
    if(editId) transitApplyLocal([editId],data);
    else if(res.row) transitData.unshift(res.row);
    else { loadTransit(); return; }   /* без върнат ред няма какво да се покаже — пълно теглене */
    transitRerender();
  });
}


/* ═══════════════════════════════════════════════════════════════
   ИМПОРТ ОТ SAP EXCEL
═══════════════════════════════════════════════════════════════ */

/* Импортът иска ДВА файла от SAP (етап 1, 03.11.2026):
     1) „Стока на път" — досегашният формат (Завод, Доставчик, Документ, …);
     2) „ВД и ИД"      — Доставка (ВД), Позиция в доставката, … , Външен
        идентиф. на доставка (ИД).
   Кой е кой се разпознава по header-а, не по името на файла. Редът влиза само
   ако има ВД — връзката е Документ за покупка + Материал. Без двата файла
   импортът не тръгва. */
var _transitImportFiles={transit:null,vd:null}; /* {name, rows} */
var _transitImportPlan=null;

function openTransitImportModal(){
  if(!canAddTransit()){toast('Нямаш права за импорт','#dc2626');return;}
  _transitImportFiles={transit:null,vd:null};
  _transitImportPlan=null;
  transitRenderImportFiles();
}

/* Модалът с двата слота. Файловете се добавят наведнъж (multiple) или един по един. */
function transitRenderImportFiles(){
  var old=document.getElementById('transit-import-ov');
  if(old&&old.remove)old.remove();
  function slot(key,title,hint){
    var f=_transitImportFiles[key];
    return '<div class="t-imp-slot" data-slot="'+key+'" style="border:1px solid '+(f?'#86efac':'#e2e8f0')+';background:'+(f?'#f0fdf4':'#f8fafc')+';border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:12.5px;">'+
      '<b>'+title+'</b> — '+(f?'✅ '+esc(f.name)+' <span style="color:#64748b;">('+Math.max(f.rows.length-1,0)+' реда)</span>':'<span style="color:#dc2626;">липсва</span>')+
      '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">'+hint+'</div></div>';
  }
  var both=!!(_transitImportFiles.transit&&_transitImportFiles.vd);
  var h='<div class="bov open" id="transit-import-ov" onclick="if(event.target===this)closeTransitImport()">'+
    '<div class="bmod" style="width:560px;max-height:85vh;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
      '<div style="font-size:16px;font-weight:700;">📥 Импорт от SAP — два файла</div>'+
      '<button onclick="closeTransitImport()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    slot('transit','Файл 1 „Стока на път"','Завод, Доставчик, Документ за покупка, Позиция, Материал, Количество поръчка…')+
    slot('vd','Файл 2 „ВД и ИД"','Доставка, Позиция, Материал, К-во по доставка, Документ за покупка, Външен идентиф. на доставка…')+
    '<div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap;">'+
      '<button onclick="transitPickImportFiles()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;">📂 Избери файлове</button>'+
      '<span style="display:flex;gap:8px;">'+
      '<button onclick="closeTransitImport()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button id="t-imp-next" onclick="transitImportPrepare()" style="border:none;background:'+(both?'#16a34a':'#94a3b8')+';color:#fff;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">Напред →</button>'+
      '</span>'+
    '</div>'+
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
}

function transitPickImportFiles(){
  var input=document.createElement('input');
  input.type='file';input.accept='.xlsx,.xls';input.multiple=true;
  input.onchange=function(e){
    var files=[].slice.call(e.target.files||[]);
    files.forEach(function(f){ handleTransitExcelFile(f); });
  };
  input.click();
}

/* Кой файл е това: 'vd' (има „Доставка" и „Външен идентиф. на доставка" в
   header-а) или 'transit' (всичко останало — форматът се разпознава после). */
function transitFileKind(rows){
  var head=(rows&&rows[0]||[]).map(function(c){return String(c==null?'':c).trim();});
  return (head.indexOf('Доставка')>=0&&head.indexOf('Външен идентиф. на доставка')>=0)?'vd':'transit';
}

/* Слага прочетените редове (с header-а) в правилния слот. */
function transitImportSetFile(name,rows){
  if(!rows||!rows.length){toast('Файлът „'+name+'" е празен или невалиден','#dc2626');return;}
  var kind=transitFileKind(rows);
  _transitImportFiles[kind]={name:name,rows:rows};
  _transitImportPlan=null;
  transitRenderImportFiles();
}

function handleTransitExcelFile(file){
  toast('⏳ Зареждане на '+file.name+'...');
  function doImport(){
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var data=new Uint8Array(e.target.result);
        var wb=window.XLSX.read(data,{type:'array',cellDates:true});
        /* ВСИЧКИ sheet-ове; header-ът на следващите се пропуска, ако е същият. */
        var allRows=[];
        wb.SheetNames.forEach(function(sheetName){
          var rows=window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:true});
          if(!rows.length)return;
          if(allRows.length&&String(rows[0][0]==null?'':rows[0][0]).trim()===String(allRows[0][0]==null?'':allRows[0][0]).trim()) rows=rows.slice(1);
          allRows=allRows.concat(rows);
        });
        transitImportSetFile(file.name,allRows);
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
  if(!rows||!rows.length){toast('Файлът е празен','#dc2626');return [];}
  
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
    }else if(TRANSIT_WAREHOUSE_CODES[supplierFirstCode]){
      /* Доставчикът е логистичен склад → входяща доставка към обекта,
         независимо от кода на завода (етап 2, 03.11.2026). SAP подава и
         „изпращащ" код на завода (2520 / 2521 / 2522) за доставки от склад
         Търговище — те ставаха 'outgoing', обектът не ги виждаше в
         „Получавам" и нямаше „Прието" (3 реда в импорта от 03.11.2026). */
      direction='incoming';
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
  return parsed;
}

function transitCell(v){ return String(v==null?'':v).trim(); }

/* Файл 2 „ВД и ИД" → [{inbound_delivery, delivery_position, material_code,
   purchase_doc, delivery_qty, outbound_delivery}]. Колоните се търсят по
   ИМЕ в header-а. Липсва ли задължителна — null (импортът спира). */
function transitParseVdRows(rows){
  var head=(rows&&rows[0]||[]).map(transitCell);
  var need={vd:'Доставка',pos:'Позиция',mat:'Материал',qty:'К-во по доставка',doc:'Документ за покупка',id:'Външен идентиф. на доставка'};
  var ix={},miss=[];
  Object.keys(need).forEach(function(k){ ix[k]=head.indexOf(need[k]); if(ix[k]<0) miss.push(need[k]); });
  if(miss.length){ toast('Файл „ВД и ИД": липсват колони '+miss.join(', '),'#dc2626'); return null; }
  var out=[];
  rows.slice(1).forEach(function(r){
    if(!r) return;
    var vd=transitCell(r[ix.vd]);
    if(!vd) return;
    out.push({
      inbound_delivery:vd,
      delivery_position:transitCell(r[ix.pos])||null,
      material_code:transitCell(r[ix.mat]),
      purchase_doc:transitCell(r[ix.doc]),
      delivery_qty:parseExcelNum(r[ix.qty]),
      outbound_delivery:transitStripZeros(r[ix.id])||null
    });
  });
  return out;
}

/* Сдвояване по Документ за покупка + Материал. Ред от файл 1 без двойка — без
   ВД; от 04.11.2026 такъв ред СПИРА целия импорт (transitImportPrepare),
   дотогава се пропускаше. Ред от файл 2 без двойка — „само във файл
   2", не влиза. При повтарящ се ключ двойките вървят по реда във файловете. */
function transitMatchVd(parsed,vd){
  var byKey={};
  vd.forEach(function(v){
    var k=v.purchase_doc+'\u0001'+v.material_code;
    (byKey[k]=byKey[k]||[]).push(v);
  });
  var rows=[],skipped=[];
  parsed.forEach(function(r){
    var k=String(r.purchase_doc||'')+'\u0001'+String(r.material_code||'');
    var v=byKey[k]&&byKey[k].shift();
    if(!v){ skipped.push(r); return; }
    rows.push(Object.assign({},r,{
      inbound_delivery:v.inbound_delivery, delivery_position:v.delivery_position,
      outbound_delivery:v.outbound_delivery, delivery_qty:v.delivery_qty
    }));
  });
  var only2=[];
  Object.keys(byKey).forEach(function(k){ only2=only2.concat(byKey[k]); });
  return {rows:rows,skipped:skipped,only2:only2};
}

function transitVdKey(vd,pos){ return String(vd||'')+'\u0001'+String(pos==null?'':pos); }

/* „Напред →": разбор на двата файла, сверка с базата, преглед. Нищо не пише. */
function transitImportPrepare(){
  var f1=_transitImportFiles.transit, f2=_transitImportFiles.vd;
  if(!f1||!f2){
    toast('Липсва '+(!f1&&!f2?'и двата файла — „Стока на път" и „ВД и ИД"':(!f1?'файл 1 „Стока на път"':'файл 2 „ВД и ИД"'))+'. Импортът иска и двата.','#dc2626');
    return Promise.resolve(null);
  }
  var vd=transitParseVdRows(f2.rows);
  if(!vd) return Promise.resolve(null);
  var hasHead=detectSapFormat(f1.rows)==='new';
  var f1Total=f1.rows.slice(hasHead?1:0).filter(function(r){return r&&transitCell(r[0]);}).length;
  var parsed=parseTransitRows(f1.rows);
  var m=transitMatchVd(parsed,vd);

  /* (ВД, позиция) е уникална — повторение би съборило цялата партида. */
  var seen={},dups=[];
  m.rows.forEach(function(r){
    var k=transitVdKey(r.inbound_delivery,r.delivery_position);
    if(seen[k]) dups.push(r.inbound_delivery+' / '+r.delivery_position);
    seen[k]=1;
  });
  if(dups.length){
    toast('Файлът носи повтарящи се ВД + позиция ('+dups.slice(0,3).join(', ')+(dups.length>3?'…':'')+') — импортът е спрян','#dc2626');
    return Promise.resolve(null);
  }

  /* Ред от „Стока на път“ без входяща доставка спира ЦЕЛИЯ импорт (решение
     от 04.11.2026, Тенчо с Миглена и Цвети; дотогава такъв ред се пропускаше).
     Нищо не се чете и не се пише — нито частично, нито архив. Прегледът
     показва редовете, за да се добави ВД в SAP и двата файла да се качат
     наново. Редовете само във файл 2 НЕ спират — те са за сведение. */
  if(m.skipped.length){
    _transitImportPlan={
      f1Total:f1Total, recognized:parsed.length, rows:m.rows, skipped:m.skipped, only2:m.only2,
      newRows:[], updRows:[], revived:0, archiveIds:[], blocked:true
    };
    renderTransitImportPreview(_transitImportPlan);
    return Promise.resolve(_transitImportPlan);
  }

  toast('⏳ Сверка със записаните редове...');
  /* Само редовете с ВД — ръчните (inbound_delivery = null) импортът не пипа.
     На страници: PostgREST реже на 1000. */
  return sbGetAll('goods_transit','select=id,inbound_delivery,delivery_position,archived_at&inbound_delivery=not.is.null&order=id.asc').then(function(ex){
    if(ex.partial){
      toast('⚠️ Записаните редове не се прочетоха докрай — импортът е спрян. Опитай пак.','#dc2626');
      return null;
    }
    var exMap={};
    ex.forEach(function(e){ if(e.inbound_delivery) exMap[transitVdKey(e.inbound_delivery,e.delivery_position)]=e; });
    var newRows=[],updRows=[],revived=0;
    m.rows.forEach(function(r){
      var e=exMap[transitVdKey(r.inbound_delivery,r.delivery_position)];
      if(e){ updRows.push(r); if(e.archived_at) revived++; }
      else newRows.push(r);
    });
    var archiveIds=ex.filter(function(e){
      return e.inbound_delivery&&!e.archived_at&&!seen[transitVdKey(e.inbound_delivery,e.delivery_position)];
    }).map(function(e){return e.id;});
    _transitImportPlan={
      f1Total:f1Total, recognized:parsed.length, rows:m.rows, skipped:m.skipped, only2:m.only2,
      newRows:newRows, updRows:updRows, revived:revived, archiveIds:archiveIds
    };
    renderTransitImportPreview(_transitImportPlan);
    return _transitImportPlan;
  });
}

/* Редовете без входяща доставка — едни и същи колони в прегледа и в Excel. */
var TRANSIT_SKIP_COLS=['Обект','Доставчик','Документ за покупка','Позиция','Материал','Описание','Недоставено','Дата'];
function transitSkipRow(r){
  var q=r.remaining_qty!=null?r.remaining_qty:(r.ordered_qty!=null?r.ordered_qty:'');
  return [r.store_name||'',r.supplier||'',r.purchase_doc||'',r.position!=null?String(r.position):'',
    r.material_code||'',r.material_name||'',(q===''?'':String(q)+(r.unit?' '+r.unit:'')),r.doc_date?fmtDate(r.doc_date):''];
}
/* „📊 Свали списъка" — същите колони като таблицата в прегледа. */
function transitExportSkipped(){
  var plan=_transitImportPlan;
  if(!plan||!plan.skipped||!plan.skipped.length){ toast('Няма редове без входяща доставка','#64748b'); return; }
  if(!window.XLSX){
    var s=document.createElement('script');
    s.src='https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=transitExportSkipped;
    s.onerror=function(){toast('Грешка при зареждане на SheetJS','#dc2626');};
    document.head.appendChild(s);return;
  }
  var aoa=[TRANSIT_SKIP_COLS.slice()].concat(plan.skipped.map(transitSkipRow));
  var wb=window.XLSX.utils.book_new();
  var ws=window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:22},{wch:24},{wch:14},{wch:8},{wch:10},{wch:40},{wch:12},{wch:12}];
  window.XLSX.utils.book_append_sheet(wb,ws,'Без входяща доставка');
  window.XLSX.writeFile(wb,'ТеМАХ_Стока_на_път_без_ВД_'+today()+'.xlsx');
  toast('✅ Списъкът е изтеглен ('+plan.skipped.length+' реда)');
}

function renderTransitImportPreview(plan){
  var old=document.getElementById('transit-import-ov');
  if(old&&old.remove)old.remove();

  function byStore(list){
    var s={};
    list.forEach(function(r){ var k=r.store_name+'|'+r.direction; if(!s[k])s[k]={store:r.store_name,dir:r.direction,count:0}; s[k].count++; });
    return Object.values(s).sort(function(a,b){ return a.store.localeCompare(b.store,'bg')||(a.dir>b.dir?1:-1); });
  }
  function sum(list){ return list.reduce(function(s,r){return s+r.count;},0); }
  var rows=byStore(plan.rows);
  var incoming=rows.filter(function(r){return r.dir==='incoming';});
  var transfer=rows.filter(function(r){return r.dir==='transfer';});
  var outgoing=rows.filter(function(r){return r.dir==='outgoing';});
  var blocked=!!plan.blocked;
  var dropped=plan.f1Total-plan.recognized;
  var TH='text-align:left;padding:5px 8px;font-size:10px;font-weight:700;text-transform:uppercase;color:#991b1b;border-bottom:1px solid #fecaca;white-space:nowrap;';
  var TD='padding:4px 8px;border-bottom:1px solid #fff1f2;vertical-align:top;';
  function stat(id,label,n,color){
    return '<div id="'+id+'" style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;"><span>'+label+'</span><b style="color:'+(color||'#0f172a')+';">'+n+'</b></div>';
  }

  var h='<div class="bov open" id="transit-import-ov" onclick="if(event.target===this)closeTransitImport()">'+
    '<div class="bmod" style="width:660px;max-height:85vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
      '<div style="font-size:16px;font-weight:700;">📥 Импорт от SAP — преглед</div>'+
      '<button onclick="closeTransitImport()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#1e3a5f;">'+
      '<div>'+
      stat('t-imp-f1','Редове във файл 1',plan.f1Total)+
      (dropped>0?stat('t-imp-drop','  без познат завод / материал',dropped,'#64748b'):'')+
      stat('t-imp-vd','С ВД — за запис',plan.rows.length,'#16a34a')+
      stat('t-imp-skip','Без ВД — спират импорта',plan.skipped.length,plan.skipped.length?'#dc2626':'#16a34a')+
      stat('t-imp-only2','Само във файл 2 — за сведение',plan.only2.length,plan.only2.length?'#d97706':'#16a34a')+
      '</div><div>'+
      /* При спрян импорт записаните редове не се четат — нови / обновени /
         архив не се знаят и не се показват. */
      (blocked?'<div style="color:#991b1b;font-weight:600;padding:3px 0;">Нищо не се записва.</div>':
      stat('t-imp-new','Нови',plan.newRows.length,'#16a34a')+
      stat('t-imp-wh','  от склад — влизат като изпратени',plan.newRows.filter(transitIsWarehouseSupplier).length,'#7c3aed')+
      stat('t-imp-upd','Обновяват се',plan.updRows.length,'#2563eb')+
      (plan.revived?stat('t-imp-revived','  от тях излизат от архива',plan.revived,'#64748b'):'')+
      stat('t-imp-arch','Отиват в архив',plan.archiveIds.length,plan.archiveIds.length?'#d97706':'#16a34a'))+
      '</div>'+
    '</div>'+

    (blocked?
    '<div id="t-imp-blocked" style="background:#fef2f2;border:1.5px solid #dc2626;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#991b1b;font-weight:600;">'+
      'Импортът е спрян: '+plan.skipped.length+' '+(plan.skipped.length===1?'ред':'реда')+' без входяща доставка. Добавете ВД в SAP и качете двата файла наново.'+
    '</div>'+
    '<div style="margin-bottom:14px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'+
      '<div style="font-size:12px;font-weight:700;color:#dc2626;">⛔ РЕДОВЕ БЕЗ ВХОДЯЩА ДОСТАВКА</div>'+
      '<button id="t-imp-skip-xls" onclick="transitExportSkipped()" style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">📊 Свали списъка</button>'+
    '</div>'+
    '<div style="max-height:220px;overflow:auto;border:1px solid #fecaca;border-radius:8px;">'+
    '<table id="t-imp-skip-list" style="width:100%;border-collapse:collapse;font-size:11.5px;">'+
    '<thead><tr>'+TRANSIT_SKIP_COLS.map(function(c){return '<th style="'+TH+'">'+c+'</th>';}).join('')+'</tr></thead><tbody>'+
    plan.skipped.map(function(r){
      return '<tr>'+transitSkipRow(r).map(function(v,i){
        return '<td style="'+TD+(i===5?'':'white-space:nowrap;')+'">'+esc(v)+'</td>';
      }).join('')+'</tr>';
    }).join('')+
    '</tbody></table></div></div>':'')+

    /* Трансфери между магазини — най-важно да се провери преди импорт */
    '<div style="margin-bottom:14px;">'+
    '<div style="font-size:12px;font-weight:700;color:#c2410c;margin-bottom:8px;">🔄 ТРАНСФЕРИ МЕЖДУ МАГАЗИНИ (получател / брой) — '+sum(transfer)+' реда</div>'+
    '<div style="max-height:150px;overflow-y:auto;border:1px solid #fed7aa;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    (transfer.length?transfer.map(function(r){
      return '<tr style="border-bottom:1px solid #fff7ed;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#c2410c;font-weight:600;">'+r.count+'</td></tr>';
    }).join(''):'<tr><td style="padding:10px;color:#94a3b8;text-align:center;">Няма трансфери между магазини</td></tr>')+
    '</table></div></div>'+

    /* Incoming + Outgoing */
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">'+
    '<div>'+
    '<div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">📦 ПОЛУЧАВАМ (от склад) — '+sum(incoming)+' реда</div>'+
    '<div style="max-height:200px;overflow-y:auto;border:1px solid #dbeafe;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    incoming.map(function(r){
      return '<tr style="border-bottom:1px solid #eff6ff;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#1e40af;font-weight:600;">'+r.count+'</td></tr>';
    }).join('')+
    '</table></div></div>'+

    /* Outgoing */
    '<div>'+
    '<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px;">📤 ИЗПРАЩАМ (outgoing) — '+sum(outgoing)+' реда</div>'+
    '<div style="max-height:200px;overflow-y:auto;border:1px solid #e9d5ff;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    (outgoing.length?outgoing.map(function(r){
      return '<tr style="border-bottom:1px solid #faf5ff;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#7c3aed;font-weight:600;">'+r.count+'</td></tr>';
    }).join(''):'<tr><td style="padding:10px;color:#94a3b8;text-align:center;">Няма outgoing записи</td></tr>')+
    '</table></div></div>'+
    '</div>'+

    /* Спрян импорт: бутонът остава видим, но неактивен, с обяснение защо
       (правило 11 — бутонът не изчезва според данните). */
    (blocked?'<div id="t-imp-go-why" style="font-size:12px;color:#991b1b;text-align:right;margin-bottom:6px;">Импортът е неактивен: има редове без входяща доставка (списъкът горе).</div>':'')+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="closeTransitImport()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
      (blocked?
      '<button id="t-imp-go" disabled title="Има редове без входяща доставка — добавете ВД в SAP и качете двата файла наново" style="border:none;background:#94a3b8;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:not-allowed;opacity:.7;">✅ Импортирай '+plan.rows.length+' реда</button>':
      '<button id="t-imp-go" onclick="confirmTransitImport()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✅ Импортирай '+plan.rows.length+' реда</button>')+
    '</div>'+
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend',h);
}

function closeTransitImport(){
  var ov=document.getElementById('transit-import-ov');
  if(ov&&ov.remove)ov.remove();
  _transitImportRows=[];
  _transitImportFiles={transit:null,vd:null};
  _transitImportPlan=null;
}

/* Тялото за upsert. Съществуващ ред: само полетата от SAP + archived_at=null
   (излиза от архива) — status, comment, reviewed_*, transfer_date и
   updated_* НЕ се пращат, тоест остават. Нов ред: и status 'pending'.
   imported_at — при ВСЕКИ upsert (нов и обновен): по нея е прозорецът на
   авто-отметката (starts_on − 7), не по created_at — ред, оцелял от стар
   импорт, пази стария created_at (решение А, 03.11.2026). */
function transitImportBody(r,isNew,who,at){
  var b={
    direction:r.direction,store_name:r.store_name,supplier:String(r.supplier||''),
    purchase_doc:String(r.purchase_doc||''),position:r.position,doc_date:r.doc_date,
    material_code:String(r.material_code||''),material_name:String(r.material_name||''),
    ordered_qty:r.ordered_qty,unit:r.unit,remaining_qty:r.remaining_qty,
    inbound_delivery:r.inbound_delivery,outbound_delivery:r.outbound_delivery,
    delivery_position:r.delivery_position,delivery_qty:r.delivery_qty,
    archived_at:null,imported_at:at
  };
  if(isNew){ b.status='pending'; b.comment=''; b.transfer_date=null; b.updated_by=who; b.updated_at=at; }
  /* Нов ред от склад → изпратен „· импорт" (виж TRANSIT_IMPORT_SENDER_BY).
     Съществуващ ред: sender_status* НЕ се пращат — каквото е отбелязал
     складът (вкл. върнато на NULL), остава. */
  if(isNew&&transitIsWarehouseSupplier(r)){ b.sender_status='sent'; b.sender_status_by=TRANSIT_IMPORT_SENDER_BY; b.sender_status_at=at; }
  return b;
}

/* Запис: първо нови + обновени (upsert по ВД + позиция в доставката), на
   партиди по 50. Архивирането е ПОСЛЕДНО и само ако всяка партида е минала —
   иначе червен toast и нищо не се архивира. Повторният импорт е безопасен:
   upsert-ът по същия ключ просто обновява. */
function confirmTransitImport(){
  var plan=_transitImportPlan;
  /* Втора защита: спрян план не пише нищо, дори ако бутонът се извика отвън. */
  if(plan&&plan.blocked){
    toast('Импортът е спрян: '+plan.skipped.length+' реда без входяща доставка. Добавете ВД в SAP и качете двата файла наново.','#dc2626');
    return Promise.resolve();
  }
  if(!plan||!plan.rows.length){toast('Няма редове за импорт','#dc2626');return Promise.resolve();}
  var who=currentUser.display_name||currentUser.email, at=new Date().toISOString();
  var batches=[],i;
  for(i=0;i<plan.newRows.length;i+=50) batches.push({rows:plan.newRows.slice(i,i+50),isNew:true});
  for(i=0;i<plan.updRows.length;i+=50) batches.push({rows:plan.updRows.slice(i,i+50),isNew:false});
  var archiveIds=plan.archiveIds.slice();
  var failed=0,written=0;
  toast('⏳ Импортиране на '+plan.rows.length+' реда ('+batches.length+' партиди)...');

  function postBatch(b){
    var url=API+'/goods_transit?on_conflict=inbound_delivery,delivery_position';
    /* Нов ред: ignore-duplicates — ако междувременно е влязъл, статусът му не се пипа. */
    var prefer=(b.isNew?'resolution=ignore-duplicates':'resolution=merge-duplicates')+',return=minimal';
    return fetch(url,{method:'POST',headers:Object.assign({},H,{'Prefer':prefer}),
      body:JSON.stringify(b.rows.map(function(r){return transitImportBody(r,b.isNew,who,at);}))})
    .then(function(r){
      if(r.ok){ written+=b.rows.length; return; }
      failed++;
      return r.text().then(function(t){console.error('Стока на път, импорт: партида НЕ е записана',r.status,t);}).catch(function(){});
    }).catch(function(e){ failed++; console.error('Стока на път, импорт: мрежова грешка',e); });
  }
  var chain=Promise.resolve();
  batches.forEach(function(b){ chain=chain.then(function(){ return postBatch(b); }); });

  return chain.then(function(){
    if(failed){
      closeTransitImport();
      toast('⚠️ '+failed+' от '+batches.length+' партиди НЕ се записаха — архивирането е пропуснато. Пусни импорта пак (повторният е безопасен).','#dc2626');
      loadTransit();
      return;
    }
    var chunks=[];
    for(var k=0;k<archiveIds.length;k+=100) chunks.push(archiveIds.slice(k,k+100));
    var archFailed=0;
    var ac=Promise.resolve();
    chunks.forEach(function(c){
      ac=ac.then(function(){
        return sbPatch('goods_transit','id=in.('+c.join(',')+')&archived_at=is.null',{archived_at:at}).then(function(res){
          if(!res||res.ok===false) archFailed++;
        });
      });
    });
    return ac.then(function(){
      closeTransitImport();
      if(archFailed){
        toast('⚠️ Редовете са записани, но архивирането не мина ('+archFailed+' от '+chunks.length+' пакета). Пусни импорта пак.','#dc2626');
      }else{
        toast('✅ Импорт: '+plan.newRows.length+' нови, '+plan.updRows.length+' обновени, '+archiveIds.length+' в архива');
      }
      loadTransit();
    });
  });
}
