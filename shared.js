/* shared.js — конфигурация, state, utils, auth
   Зарежда се ПЪРВО. Не пипай освен ако не знаеш какво правиш. */

var SB_URL='https://xiwkdiqqplgdcrkewgtv.supabase.co',SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',API=SB_URL+'/rest/v1';
var H={'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'};

/* sbGet резолвва ВИНАГИ с масив — никога не хвърля и никога не връща обект.
   Преди: `.then(r.json())` хвърляше при 401 с празно тяло (промисът се
   отхвърляше, а 103 от 166 извиквания нямат .catch → нищо не се показваше
   никъде), а при грешка с тяло връщаше обекта на грешката, който 162-те
   `Array.isArray(x)?x:[]` проверки третираха като празен списък — тихо
   празен екран без съобщение.
   Сега всяка грешка е видима (toast) и проследима (console.error с URL-а),
   а извикващите получават това, което вече очакват — масив. */
function sbGet(t,q,silent){
  var url=API+'/'+t+(q?'?'+q:'');
  function fail(status,d){
    var msg=(d&&(d.message||d.hint))||('HTTP '+(status||'—'));
    try{console.error('sbGet '+url+' → '+(status||'мрежов срив')+': '+msg);}catch(e){}
    /* toast пипа DOM — ако #toast липсва, това не бива да върне грешката
       обратно във веригата, която току-що обезопасихме. */
    if(!silent){ try{toast('Грешка при зареждане: '+msg,'#dc2626');}catch(e){} }
    return [];
  }
  return fetch(url,{headers:H}).then(function(r){
    /* .catch около json() — празното тяло при 401 хвърля SyntaxError.
       Същият шаблон като в sbPostReturn по-долу. */
    return r.json().catch(function(){return null;}).then(function(d){
      /* GET към PostgREST връща масив при успех и обект при грешка;
         обект (или нищо) значи, че заявката не е минала. */
      if(Array.isArray(d))return d;
      return fail(r.status,d);
    });
  }).catch(function(e){
    /* Мрежов срив: fetch отхвърля, преди изобщо да има отговор. Без този
       клон 103-те вериги без .catch пак биха мълчали при офлайн. */
    return fail(0,{message:String((e&&e.message)||e)});
  });
}
function sbPost(t,b){
  var url=API+'/'+t;
  return fetch(url,{method:'POST',headers:H,body:JSON.stringify(b)})
    .then(function(r){return sbWriteResult('sbPost',url,r);})
    .catch(sbNetFail('sbPost',url));
}
/* Като sbPost, но връща и създадения ред. Нужно е, когато базата попълва поле
   при записа (номерът на клиентската заявка се раздава от тригер по обект) и
   клиентът няма как да го знае предварително. */
function sbPostReturn(t,b){
  var url=API+'/'+t;
  return fetch(url,{
    method:'POST',
    headers:Object.assign({},H,{'Prefer':'return=representation'}),
    body:JSON.stringify(b)
  }).then(function(r){
    return r.json().catch(function(){return null;}).then(function(d){
      if(!r.ok)return sbWriteFail('sbPostReturn',url,r.status,d);
      return {ok:true,row:(Array.isArray(d)?d[0]:d)||null};
    });
  }).catch(sbNetFail('sbPostReturn',url));
}
/* Общ провал за пишещите заявки. Три неща наведнъж:
   - причината от PostgREST стига до извикващия в .error (преди се губеше и
     call site-овете можеха да покажат само думата "Грешка" без съдържание);
   - редът в конзолата е същият като на sbGet — URL, статус, причина;
   - връща се ОБЕКТ, не отхвърляне, за да не мълчат веригите без .catch.
   Тук нарочно НЯМА toast: за разлика от четенето, при запис всеки call site
   вече показва свое съобщение и второ би било двойно. */
function sbWriteFail(fn,url,status,d){
  var msg=(d&&(d.message||d.hint))||('HTTP '+(status||'—'));
  try{console.error(fn+' '+url+' → '+(status||'мрежов срив')+': '+msg);}catch(e){}
  return {ok:false,status:status||0,error:(d||{message:msg})};
}
/* .json() може да хвърли (празно тяло при 401) — затова се минава през
   .catch, преди тялото да стигне до sbWriteFail. */
function sbWriteResult(fn,url,r){
  if(r.ok)return {ok:true};
  return r.json().catch(function(){return null;}).then(function(d){
    return sbWriteFail(fn,url,r.status,d);
  });
}
function sbNetFail(fn,url){
  return function(e){ return sbWriteFail(fn,url,0,{message:String((e&&e.message)||e)}); };
}
function sbPatch(t,f,b){
  var url=API+'/'+t+'?'+f;
  return fetch(url,{method:'PATCH',headers:Object.assign({},H,{'Prefer':'return=minimal'}),body:JSON.stringify(b)})
    .then(function(r){return sbWriteResult('sbPatch',url,r);})
    .catch(sbNetFail('sbPatch',url));
}
/* Готово съобщение за потребителя от провалила се пишеща заявка. Причината
   от PostgREST, ако я има; иначе поне статусът. */
function sbErrMsg(res){
  var e = res && res.error;
  return (e && (e.message || e.hint)) || ('HTTP ' + ((res && res.status) || '—'));
}
/* PostgREST връща броя засегнати редове в Content-Range — низ, който завършва
   с наклонена черта и числото (при нула изтрити последните два символа са
   "/0") — САМО при Prefer: count=exact. Хедърът е в
   access-control-expose-headers, тоест браузърът има право да го чете.
   Връща null, ако броят не може да се определи — тогава извикващият НЕ бива
   да твърди "нищо не съвпадна". */
function sbCountFromRange(r){
  var cr = null;
  try { cr = r && r.headers && r.headers.get ? r.headers.get('Content-Range') : null; } catch(e){}
  if(!cr) return null;
  var m = /\/(\d+)\s*$/.exec(cr);
  return m ? parseInt(m[1],10) : null;
}
/* DELETE има ТРИ различими изхода, не два:
     {ok:false, …}          — отказано (401/403/409, мрежов срив)
     {ok:true, count:0}     — минало е, но НИЩО не е съвпаднало
     {ok:true, count:>0}    — реално изтрито
   Без count=exact вторият и третият са неразличими: PostgREST връща 204 и
   когато не е изтрил нищо, тоест RLS отказ или вече изтрит ред изглеждат
   като успех. count:null значи "не можах да разбера" (напр. хедърът е
   отрязан от прокси) — тогава се приема успех, не се измисля нула.
   НЕ се ползва return=representation: то иска SELECT право върху всяка
   върната колона и би гръмнало с 403 при колонни права. */
function sbDelete(t,f){
  var url=API+'/'+t+'?'+f;
  return fetch(url,{method:'DELETE',headers:Object.assign({},H,{'Prefer':'count=exact'})})
    .then(function(r){
      if(!r.ok) return sbWriteResult('sbDelete',url,r);
      return {ok:true, count:sbCountFromRange(r)};
    })
    .catch(sbNetFail('sbDelete',url));
}

/* ОДИТ ЛОГ — тих запис (никога не блокира и не чупи основния поток при грешка) */
function logAudit(event,extra){
  extra=extra||{};
  var payload={
    event:event,
    user_email:extra.email||(currentUser&&currentUser.email)||null,
    user_role:(currentUser&&currentUser.role)||null,
    store_name:(currentUser&&currentUser.store_name)||null,
    success:extra.success!==false,
    details:extra.details||null
  };
  sbPost('audit_log',payload).catch(function(){/* тих fail — одитът не трябва да чупи логин/логаут */});
}

/* STATE */
var currentUser=null; /* {email,display_name,store_name,role} */
var transportOrders=[],clientOrders=[],docs=[];
var transportFilter='all',orderFilter='all',docFilter='all';
var statusTargetId=null,statusTargetTable=null;
var correctionTargetId=null,correctionTargetTable=null;
var orderRestrictions=[]; /* активни ограничения на заявки към складове/ЦО за определен период */

function isGlobal(){
  if(!currentUser)return false;
  return ['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
}

/* Нормализиран телефон — само цифри, +359/359 се свежда до 0.
   В базата един и същ номер е въвеждан по няколко начина ("0888 12 34 56",
   "+359888123456"), затова сравненията между заявки минават оттук. */
function normPhone(p){
  var d=String(p||'').replace(/\D/g,'');
  if(d.indexOf('359')===0&&d.length>9) d='0'+d.slice(3);
  return d;
}

/* Централен офис — обработва заявките, които магазините пускат към доставчици.
   Сравнява се без регистър и без интервали, защото в базата има стари записи
   с различно изписване ("ЦЕНТРАЛЕН ОФИС", " Централен офис"). */
var CENTRAL_OFFICE='Централен офис';
function isCentralOffice(name){
  if(!name)return false;
  return String(name).trim().toLowerCase()===CENTRAL_OFFICE.toLowerCase();
}
/* Текущият потребител работи в ЦО (независимо от ролята: supply, accounting, admin...) */
function isCentralOfficeUser(){
  return !!currentUser&&isCentralOffice(currentUser.store_name);
}

/* Логистични складове — отделни физически обекти (не роля), чиито служители
   влизат с обичайните си профили, но с store_name = точно името на склада.
   Списъкът живее ТУК, а не в модул, защото го ползват две различни неща:
   Разлики (isLogisticsWarehouseUser) и отчетите (isReportableStore). */
var LOGISTICS_WAREHOUSES=['Логистичен склад Добрич','Логистичен склад Търговище'];

/* Обекти, които НЕ участват в статистиките по магазини (дневен/седмичен
   репорт, таб „Днес"). Складовете не влизат в седмичния бюлетин — нямат
   нито едно отмятане в task_completions — и стояха на 0% завинаги, теглейки
   надолу „обекта под 50%". Централният офис никога не е бил обект.
   ЕДНА проверка на едно място: преди условието `store_name!=='Централен офис'`
   стоеше преписано на 8 места и всяко можеше да се размине с другите. */
/* Обекти без оборот за подаване. Пазарджик и Сервиз Троян днес и без това не
   се появяват в отчетите, защото имат по НУЛА акаунта (проверено в базата на
   25.08.2026) и всички списъци се строят от users. Тук са изрично, защото
   отсъствието им е случайност, а не правило: получи ли Сервиз Троян акаунт за
   гаранциите, утре щеше да изникне в „не са подали оборот".
   ВНИМАНИЕ: send-scheduled-report/index.ts държи СВОЕ копие на този списък
   (ред ~217) и НЕ се обновява оттук — виж „sbGet има ДВА договора" в
   docs/PATTERNS.md за същия шаблон. Днес разминаване няма (и двете страни
   четат users), но появи ли се акаунт, седмичният имейл ще брои обект,
   който порталът не брои. */
var REPORT_EXCLUDED_STORES=[CENTRAL_OFFICE].concat(LOGISTICS_WAREHOUSES).concat(['Пазарджик','Сервиз Троян']);
function isReportableStore(name){
  return !!name && REPORT_EXCLUDED_STORES.indexOf(name)<0;
}

/* Списък магазини за потребителя: null = всички, [] = само своя, [...] = назначени */
function assignedStores(){
  if(!currentUser)return null;
  if(!isGlobal())return [currentUser.store_name];
  var arr=currentUser.assigned_stores;
  if(Array.isArray(arr)&&arr.length>0)return arr;
  if(typeof arr==='string'&&arr.length>2){
    try{return arr.replace(/^{|}$/g,'').split(',').map(function(s){return s.trim().replace(/^"|"$/g,'');});}catch(e){}
  }
  return null;
}

/* Supabase query string за филтриране по магазин */
function storeQ(col){
  col=col||'store_name';
  var stores=assignedStores();
  if(!stores)return '';
  if(stores.length===1)return '&'+col+'=eq.'+encodeURIComponent(stores[0]);
  return '&'+col+'=in.('+stores.map(encodeURIComponent).join(',')+')';
}

/* UTILS */
function esc(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'—';}
/* esc() покрива & < > — достатъчно за ТЕКСТ между тагове, но НЕ за стойност
   на атрибут: кавичка вътре в src="…" затваря атрибута и всичко след нея
   се чете като markup. За стойности, които влизат в кавички (URL-и, имена
   на файлове), се ползва това. */
function escAttr(s){return esc(s).replace(/"/g,'&quot;');}
/* За value="" на input/textarea полета - празно поле трябва да е ИСТИНСКИ празно, не тире (esc() връща тире за показване на данни, тук е грешно) */
function escVal(s){return s?esc(s):'';}
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(d){if(!d||d==='—')return'—';var p=String(d).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:d;}
function v(id){var el=document.getElementById(id);return el?(el.value||'').trim():'';}
function closeModal(id){var el=document.getElementById(id);if(el)el.classList.remove('open');}
/* UUID v4 — нужен е, за да свържем клиентска заявка и транспортна заявка ЕДНА С ДРУГА
   в момента на записа. sbPost() не връща създадения ред (Prefer: return=minimal),
   затова генерираме id-то от клиента и го подаваме и на двата INSERT-а. */
function uuid4(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  if(window.crypto&&crypto.getRandomValues){
    var b=new Uint8Array(16);crypto.getRandomValues(b);
    b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
    var h=[];for(var i=0;i<16;i++)h.push(('0'+b[i].toString(16)).slice(-2));
    return h.slice(0,4).join('')+'-'+h.slice(4,6).join('')+'-'+h.slice(6,8).join('')+'-'+h.slice(8,10).join('')+'-'+h.slice(10,16).join('');
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
    var r=Math.random()*16|0,vv=c==='x'?r:(r&0x3|0x8);return vv.toString(16);
  });
}
function toast(msg,col){var t=document.getElementById('toast');t.textContent=msg;t.style.background=col||'#16a34a';t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2500);}

var TODAY=new Date();TODAY.setHours(0,0,0,0);
/* TODAY се задаваше само веднъж при зареждане на страницата — ако табът остане отворен
   през полунощ, статусите (Просрочена/Днес/Утре) и "Изминало" броячите изоставаха с 1 ден.
   Опресняваме периодично + при връщане на фокус в таба. */
function refreshToday(){ TODAY=new Date(); TODAY.setHours(0,0,0,0); }
setInterval(refreshToday, 5*60*1000); /* на всеки 5 минути */
document.addEventListener('visibilitychange', function(){ if(!document.hidden) refreshToday(); });
function calcStatus(delivery,status){
  if(['done','refused','postponed','approved','arrived','sent','processed'].indexOf(status)>=0)return status;
  if(!delivery)return'pending';
  var d=new Date(delivery);d.setHours(0,0,0,0);
  var diff=Math.round((d-TODAY)/86400000);
  if(diff<0)return'overdue';if(diff===0)return'today';if(diff===1)return'tomorrow';return'pending';
}
function statusBadge(s){
  var m={overdue:{l:'🔴 Просрочена',bg:'#fee2e2',c:'#991b1b'},today:{l:'🔵 Днес',bg:'#dbeafe',c:'#1e3a5f'},
    tomorrow:{l:'🟡 Утре',bg:'#fef3c7',c:'#92400e'},pending:{l:'⏳ Изчаква',bg:'#f3f4f6',c:'#374151'},
    approved:{l:'✓ Одобрена',bg:'#dbeafe',c:'#1e3a5f'},
    /* Централен офис е обработил заявката и я е пуснал към доставчика.
       НЕ е същото като "Изпратена" — там стоката вече пътува към магазина. */
    processed:{l:'✅ Обработена от ЦО',bg:'#ecfdf5',c:'#047857'},
    sent:{l:'📤 Изпратена',bg:'#ede9fe',c:'#5b21b6'},
    arrived:{l:'📦 Пристигнала в магазина',bg:'#e0f2fe',c:'#0369a1'},
    /* Транспорт, създаден от клиентска заявка, чиято стока още не е пристигнала —
       НЕ трябва да се брои за просрочен, защото срокът се води по клиентската заявка. */
    awaiting:{l:'⏳ Чака стока',bg:'#fef9c3',c:'#854d0e'},
    done:{l:'✅ Изпълнена',bg:'#dcfce7',c:'#14532d'},refused:{l:'✕ Отказана',bg:'#fee2e2',c:'#991b1b'},
    postponed:{l:'⏱ Отложена',bg:'#f3e8ff',c:'#4c1d95'}};
  var x=m[s]||m.pending;
  return '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;background:'+x.bg+';color:'+x.c+'">'+x.l+'</span>';
}
/* Само текстът на статуса, без стилове — за печат и износ, където досега
   излизаше суровата английска стойност ("pending", "processed"). */
function statusLabel(s){
  var m={overdue:'Просрочена',today:'Доставка днес',tomorrow:'Доставка утре',pending:'Изчаква',
    approved:'Одобрена',processed:'Обработена от ЦО',sent:'Изпратена',
    arrived:'Пристигнала в магазина',awaiting:'Чака стока',
    done:'Изпълнена',refused:'Отказана',postponed:'Отложена'};
  return m[s]||s||'';
}
/* Заявка, която Централен офис вече е обработил и която чака доставчика:
   докато очакваната дата не е минала, тя НЕ бива да ескалира като закъсняла —
   срокът се води по доставчика, не по датата на подаване. Щом очакваната дата
   мине, ескалацията се връща (тогава закъснението е реално). */
function coWaitingSupplier(o){
  if(!o||o.status!=='processed')return false;
  if(!o.co_eta)return false;
  var d=new Date(o.co_eta);d.setHours(0,0,0,0);
  return d>=TODAY;
}
/* "Закъсняла" е ПРИЗНАК на заявката, не статус — и затова стои отделно от
   calcStatus(). calcStatus() връща статуса непроменен за
   ['done','refused','postponed','approved','arrived','sent','processed'],
   тоест щом заявката веднъж тръгне, тя вече НИКОГА не може да стане
   'overdue'. Срокът към клиента обаче продължава да тече. Следствието се
   виждаше в интерфейса: чипът "Просрочени" връщаше празна таблица дори
   когато имаше заявки с изтекла дата на доставка.
   isLate() гледа само датата и изключенията; статусът остава какъвто е. */
function isLate(o){
  if(!o||!o.delivery)return false;
  /* Приключените и отложените нямат срок, който да тече. */
  if(['done','refused','postponed'].indexOf(o.status)>=0)return false;
  /* ЦО е обработил и доставчикът още е в срок — виж coWaitingSupplier(). */
  if(coWaitingSupplier(o))return false;
  /* Транспорт, чакащ стока по клиентска заявка: срокът се води по клиентската
     заявка, не по транспорта (същото правило като '_status===awaiting' в
     transport.js). Проверката за done/refused/postponed вече мина отгоре,
     затова тук е достатъчно голото условие. */
  if(o.awaiting_stock)return false;
  var dl=new Date(o.delivery);dl.setHours(0,0,0,0);
  return dl<TODAY;
}
/* Малък чип до статусния бадж. Не замества statusBadge() — двата стоят
   един до друг, защото носят различна информация: докъде е стигнала
   заявката и с колко е закъсняла. */
function lateBadge(o){
  if(!isLate(o))return '';
  var dl=new Date(o.delivery);dl.setHours(0,0,0,0);
  var days=Math.round((TODAY-dl)/86400000);
  return '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;background:#fee2e2;color:#991b1b;margin-left:4px;">🔴 +'+days+(days===1?' ден':' дни')+'</span>';
}
/* ===== МНОЖЕСТВО АРТИКУЛИ (items[]) - споделено между клиентски и транспортни заявки ===== */
function unitOptionsHtml(sel){
  var opts=[['бр.','Бр.'],['кашон','Кашон'],['кв.м','Кв.м'],['л.м','Л.м'],['компл.','Компл.'],['пакет','Пакет'],['чифт','Чифт']];
  sel=sel||'бр.';
  var h='';
  for(var i=0;i<opts.length;i++)h+='<option value="'+opts[i][0]+'"'+(opts[i][0]===sel?' selected':'')+'>'+opts[i][1]+'</option>';
  return h;
}
function itemRowHtml(item){
  item=item||{};
  return '<div class="item-row" style="display:grid;grid-template-columns:100px 2fr 1fr 70px 90px 26px;gap:5px;margin-bottom:6px;align-items:center;">'+
    '<input class="fi item-sap" placeholder="SAP код" value="'+escVal(item.sap)+'" onblur="lookupCatalogBySap(this)">'+
    '<input class="fi item-product" placeholder="Продукт *" value="'+escVal(item.product)+'">'+
    '<input class="fi item-color" placeholder="Цвят/Модел" value="'+escVal(item.color)+'">'+
    '<input type="text" inputmode="decimal" class="fi item-qty" placeholder="Кол." value="'+esc(item.qty!=null?String(item.qty).replace('.',','):'1')+'">'+
    '<select class="fi item-unit">'+unitOptionsHtml(item.unit)+'</select>'+
    '<button type="button" onclick="removeItemRow(this)" title="Премахни артикула" style="border:none;background:#fee2e2;color:#991b1b;border-radius:5px;height:30px;cursor:pointer;font-size:13px;">✕</button>'+
  '</div>';
}
function renderItemRows(containerId,items){
  var el=document.getElementById(containerId);if(!el)return;
  if(!items||!items.length)items=[{}];
  var h='';for(var i=0;i<items.length;i++)h+=itemRowHtml(items[i]);
  el.innerHTML=h;
}
function addItemRow(containerId){
  var el=document.getElementById(containerId);if(!el)return;
  el.insertAdjacentHTML('beforeend',itemRowHtml({}));
}
function removeItemRow(btn){
  var row=btn.closest('.item-row');if(!row)return;
  var container=row.parentNode;
  if(container.querySelectorAll('.item-row').length<=1){toast('Трябва поне 1 артикул','#dc2626');return;}
  row.parentNode.removeChild(row);
}
function collectItems(containerId){
  var el=document.getElementById(containerId);if(!el)return[];
  var rows=el.querySelectorAll('.item-row');
  var items=[];
  rows.forEach(function(row){
    var product=row.querySelector('.item-product').value.trim();
    if(!product)return;
    items.push({
      product:product,
      color:row.querySelector('.item-color').value.trim(),
      sap:row.querySelector('.item-sap').value.trim(),
      qty:parseFloat(row.querySelector('.item-qty').value.replace(',','.'))||1,
      unit:row.querySelector('.item-unit').value||'бр.'
    });
  });
  return items;
}
/* За стари записи без items[] (преди миграцията) - fallback към единичните колони */
function resolveItems(o){
  if(o.items&&o.items.length)return o.items;
  return [{product:o.product,color:o.color,sap:o.sap,qty:o.qty,unit:o.unit}];
}
function itemsPrintLine(o){
  return resolveItems(o).map(function(it){
    return (it.sap?esc(it.sap)+' - ':'')+esc(it.product||'')+(it.color?' ('+esc(it.color)+')':'')+' — '+esc(String(it.qty||1))+' '+esc(it.unit||'бр.');
  }).join('<br>');
}
function itemsPrintBlock(o){
  var items=resolveItems(o);
  var rows=items.map(function(it,i){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 9px;'+(i<items.length-1?'border-bottom:1px solid #eee;':'')+'">'+
      '<div><div style="font-size:12px;font-weight:700;">'+esc(it.product||'')+'</div>'+
      (it.color?'<div style="font-size:10px;color:#888;">'+esc(it.color)+'</div>':'')+
      (it.sap?'<div style="font-size:9px;color:#aaa;">SAP: '+esc(it.sap)+'</div>':'')+'</div>'+
      '<div style="font-size:12px;font-weight:700;white-space:nowrap;">'+esc(String(it.qty||1))+' '+esc(it.unit||'бр.')+'</div>'+
    '</div>';
  }).join('');
  return '<div style="grid-column:1/-1;background:#f9f8f6;border-radius:5px;overflow:hidden;">'+
    '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;padding:7px 9px 0;">Артикули</div>'+rows+'</div>';
}

/* Право на корекция: за client_orders - само магазина-заявител (store_name) или admin/accounting;
   за transport_orders - само собствения магазин или глобална роля (admin/accounting/logistics). */
/* ── Списък на всички магазини/складове (кеширан) - за dropdown полета вместо свободен текст ── */
var allStoresCache=null;
/* Нулира ДВАТА кеша с обекти - извиква се от Администрация при промяна на
   магазин (добавяне/изтриване) И на потребител (създаване/редакция/изтриване),
   за да се вижда веднага навсякъде, без презареждане на страницата.
   Потребителите също са в списъка нарочно: reportableStoresCache се строи от
   users, затова първият акаунт за обект без такъв мени знаменателя на
   бройките в Бюлетина. Затова и името е "StoreCaches", не "StoresCache" —
   вторият кеш не идва от таблицата stores. */
function invalidateStoreCaches(){ allStoresCache=null; reportableStoresCache=null; }
function loadAllStores(){
  if(allStoresCache)return Promise.resolve(allStoresCache);
  return sbGet('stores','select=name&order=name').then(function(data){
    allStoresCache=Array.isArray(data)?data.map(function(s){return s.name;}):[];
    return allStoresCache;
  }).catch(function(){allStoresCache=[];return allStoresCache;});
}

/* ── Обектите, които РЕАЛНО могат да отметнат/подадат нещо (кеширан) ──
   Уникалните store_name от users, минус REPORT_EXCLUDED_STORES.
   НЕ таблицата stores: тя брои и обекти без нито един акаунт (Пазарджик,
   Сервиз Троян), тоест физически няма кой да отметне, и знаменателят никога
   не се затваря — задача, изпълнена от всичките 18 обекта, показваше 18/23.
   Този кеш НЕ замества allStoresCache и не го пипа: там пълните записи са
   правилни (падащите менюта за избор на магазин). Двата живеят паралелно.
   Същият списък се строеше inline на 6 места (report.js ×4, today.js,
   pallets.js) — тук е, за да не стане седмо. */
var reportableStoresCache=null;
function loadReportableStores(){
  if(reportableStoresCache)return Promise.resolve(reportableStoresCache);
  return sbGet('users','select=store_name&order=store_name').then(function(data){
    var seen={};
    reportableStoresCache=Array.isArray(data)?data.filter(function(u){
      if(!isReportableStore(u.store_name)||seen[u.store_name])return false;
      seen[u.store_name]=1;return true;
    }).map(function(u){return u.store_name;}):[];
    return reportableStoresCache;
  }).catch(function(){reportableStoresCache=[];return reportableStoresCache;});
}
function fillStoreSelect(selectEl,selectedValue){
  if(!selectEl||!allStoresCache)return;
  var opts=allStoresCache.slice();
  if(selectedValue&&opts.indexOf(selectedValue)<0)opts.push(selectedValue); /* пази стара/невалидна стойност видима, не я трие тихо */
  selectEl.innerHTML=opts.map(function(name){
    return '<option'+(name===selectedValue?' selected':'')+'>'+esc(name)+'</option>';
  }).join('');
}

/* ── Списък на доставчици (от Контакти, категория "supplier") - за dropdown при посока "Доставчик" в разликите ── */
var allSuppliersCache=null;
/* Нулира кеша с доставчици - извиква се от Контакти при добавяне/редакция/
   изтриване на доставчик, за да се вижда веднага навсякъде, без презареждане
   на страницата (следващото отваряне на кой да е таб с падащо меню за
   доставчик ще дръпне свеж списък). */
function invalidateSuppliersCache(){ allSuppliersCache=null; }
function loadAllSuppliers(){
  if(allSuppliersCache)return Promise.resolve(allSuppliersCache);
  return fetch(API+'/contacts?type=eq.supplier&select=name&order=name',{headers:H}).then(function(res){
    if(!res.ok){
      return res.text().then(function(errText){
        console.error('contacts (supplier) GET грешка:',errText);
        allSuppliersCache=[];
        return allSuppliersCache;
      });
    }
    return res.json().then(function(data){
      allSuppliersCache=Array.isArray(data)?data.map(function(s){return s.name;}):[];
      if(!allSuppliersCache.length)console.log('Заявката към Контакти е успешна, но няма нито един контакт с категория "supplier".');
      return allSuppliersCache;
    });
  }).catch(function(err){console.error('contacts заявка неуспешна:',err);allSuppliersCache=[];return allSuppliersCache;});
}

/* ── Автоматично зареждане на наименование/мярка по SAP код от каталога (product_catalog) ──
   Работи и с редовете от Клиентски/Транспорт (.item-row) и с тези от Разлики (.diff-item-row) */
/* Бележка към реда за артикул. Елементът .di-lookup-hint го има само формата за
   разлики; в клиентски заявки/транспорт няма такъв и функцията мълчи, за да не
   им се променя видът. */
function setCatalogHint(row,kind,html){
  var el=row.querySelector('.di-lookup-hint');
  if(!el)return;
  if(!html){el.innerHTML='';return;}
  var c=kind==='warn'
    ? {bg:'#fffbeb',br:'#fde68a',fg:'#92400e'}
    : {bg:'#eff6ff',br:'#bfdbfe',fg:'#1e40af'};
  el.innerHTML='<div style="background:'+c.bg+';border:1px solid '+c.br+';border-radius:5px;padding:5px 8px;font-size:11px;color:'+c.fg+';margin:-2px 0 6px;">'+html+'</div>';
}

/* Търси артикул в каталога по въведеното в полето SAP.
   Работи и с редовете от Клиентски/Транспорт (.item-row), и с тези от Разлики
   (.diff-item-row).

   При нов артикул магазините често пишат БАРКОДА в полето SAP, затова при
   несполука по sap_code се пробва и ean_code. Ако артикулът се намери по
   баркод, полето се заменя с истинския sap_code - иначе в material_code влиза
   баркод за артикул, който има валиден SAP.

   ean_code НЕ е уникален (около 105 дублирани стойности при 89 588 попълнени),
   затова при повече от един РАЗЛИЧЕН sap_code не се гадае: полето остава както
   е въведено и потребителят получава бележка с намерените кодове. Мълчаливо
   попълване с грешен артикул е по-скъпо от едно ръчно въвеждане. */
function lookupCatalogBySap(inputEl){
  var code=inputEl.value.trim();
  if(!code)return;
  var row=inputEl.closest('.item-row')||inputEl.closest('.diff-item-row');
  if(!row)return;
  var nameEl=row.querySelector('.item-product')||row.querySelector('.di-name');
  var unitEl=row.querySelector('.item-unit')||row.querySelector('.di-unit');

  /* Никога не презаписва вече въведено от потребителя име. */
  function fill(item){
    if(nameEl && !nameEl.value.trim() && item.product_name) nameEl.value=item.product_name;
    if(unitEl && item.default_unit){
      var opts=[].map.call(unitEl.options,function(o){return o.value;});
      if(opts.indexOf(item.default_unit)>=0) unitEl.value=item.default_unit;
    }
  }
  function askManual(msg){
    setCatalogHint(row,'warn',msg);
    if(nameEl && !nameEl.value.trim() && row.querySelector('.di-lookup-hint')) nameEl.focus();
  }
  /* null = заявката се провали (вече логната); масив = резултат */
  function catalogGet(q){
    return fetch(API+'/product_catalog?'+q,{headers:H}).then(function(res){
      if(!res.ok){
        return res.text().then(function(t){
          console.error('product_catalog GET грешка ('+q+'):',t);
          return null;
        });
      }
      return res.json().then(function(d){return Array.isArray(d)?d:[];});
    });
  }

  return catalogGet('sap_code=eq.'+encodeURIComponent(code)+'&limit=1').then(function(bySap){
    if(bySap===null)return;
    if(bySap.length){ setCatalogHint(row,'',''); fill(bySap[0]); return; }
    /* Не е SAP код - пробваме баркод. limit=5 стига, за да различим
       "един артикул, дублиран ред" от "две различни стоки с един баркод". */
    return catalogGet('ean_code=eq.'+encodeURIComponent(code)+'&limit=5').then(function(byEan){
      if(byEan===null)return;
      if(!byEan.length){
        askManual('❗ Артикулът не е в каталога - нито по SAP, нито по баркод. Впиши наименованието ръчно; кодът остава както си го въвел.');
        return;
      }
      var codes=[],i;
      for(i=0;i<byEan.length;i++){
        if(byEan[i].sap_code && codes.indexOf(byEan[i].sap_code)<0) codes.push(byEan[i].sap_code);
      }
      if(codes.length>1){
        askManual('⚠️ Баркод '+esc(code)+' сочи към '+codes.length+' различни артикула (SAP '+esc(codes.join(', '))+'). Въведи верния SAP код и наименованието ръчно.');
        return;
      }
      fill(byEan[0]);
      if(codes.length===1){
        inputEl.value=codes[0];
        setCatalogHint(row,'info','ℹ️ Разпознат по баркод '+esc(code)+' - SAP кодът е попълнен автоматично: <b>'+esc(codes[0])+'</b>');
      } else {
        /* намерен по баркод, но без sap_code в каталога - кодът остава баркод */
        askManual('ℹ️ Артикулът е намерен по баркод, но няма SAP код в каталога. Провери кода, преди да подадеш.');
      }
    });
  }).catch(function(err){console.error('product_catalog заявка неуспешна:',err);});
}

/* ── Ограничение на клиентски заявки към складове/ЦО за определен период (Администрация) ── */
function loadOrderRestrictions(){
  return sbGet('order_restrictions','active=eq.true').then(function(data){
    orderRestrictions=Array.isArray(data)?data:[];
  }).catch(function(){orderRestrictions=[];});
}
/* Връща обекта на ограничението, ако fulfillerName е забранен ДНЕС, иначе null */
function checkFulfillerRestriction(fulfillerName){
  if(!fulfillerName||!orderRestrictions.length)return null;
  var todayStr=today();
  var hit=orderRestrictions.find(function(r){
    var stores=Array.isArray(r.restricted_stores)?r.restricted_stores:[];
    if(stores.indexOf(fulfillerName)<0)return false;
    if(r.start_date&&todayStr<r.start_date)return false;
    if(r.end_date&&todayStr>r.end_date)return false;
    return true;
  });
  return hit||null;
}

function canCorrectRecord(rec,table){
  if(!rec||!currentUser)return false;
  if(table==='client_orders'){
    var isAdmin=['admin','accounting'].indexOf(currentUser.role)>=0;
    return isAdmin||rec.store_name===currentUser.store_name;
  }
  if(table==='transport_orders')return isGlobal()||rec.store_name===currentUser.store_name;
  return false;
}
function actionBtns(id,table,status,storeName){
  var done=status==='done'||status==='refused';
  var h='<div style="display:flex;gap:4px;flex-wrap:wrap;">';
  if(!done)h+='<button onclick="openStatus(\''+id+'\',\''+table+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">Статус</button>';
  else h+='<button onclick="revertStatus(\''+id+'\',\''+table+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">↩ Върни</button>';
  if(done&&canCorrectRecord({store_name:storeName},table))h+='<button onclick="openCorrection(\''+id+'\',\''+table+'\')" style="border:1px solid #d97706;background:#fffbeb;color:#d97706;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️ Корекция</button>';
  if(table==='client_orders')h+='<button onclick="loadPrint(\''+id+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🖨 Бланка</button>';
  if(table==='transport_orders')h+='<button onclick="loadTransportPrint(\''+id+'\')" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🖨 Бланка</button>';
  return h+'</div>';
}
function openStatus(id,table){
  statusTargetId=id;statusTargetTable=table;
  var list=table==='transport_orders'?transportOrders:clientOrders;
  var rec=list.find(function(o){return String(o.id)===String(id);});
  document.getElementById('status-info').textContent=rec?(rec.customer_name||rec.name||''):'';
  var corrBtn=document.getElementById('status-correct-btn');
  if(corrBtn)corrBtn.style.display=canCorrectRecord(rec,table)?'':'none';
  /* "Пристигнала в магазина" е специфичен за клиентски заявки - складът маркира
     физическото пристигане на стоката, преди тя да бъде предадена на клиента. */
  var sentBtn=document.getElementById('status-btn-sent');
  if(sentBtn)sentBtn.style.display=(table==='client_orders')?'':'none';
  var arrivedBtn=document.getElementById('status-btn-arrived');
  if(arrivedBtn)arrivedBtn.style.display=(table==='client_orders')?'':'none';
  /* "Обработена от ЦО" е стъпка на Централен офис — показва се само на хора от ЦО
     и само за заявки, които реално са насочени към ЦО. */
  var coBtn=document.getElementById('status-btn-processed');
  if(coBtn)coBtn.style.display=(table==='client_orders'&&rec&&isCentralOffice(rec.fulfiller)&&isCentralOfficeUser())?'':'none';
  document.getElementById('status-modal').classList.add('open');
}
function setStatus(status){
  if(!statusTargetId)return;
  var id=statusTargetId,table=statusTargetTable;
  var apply=function(){
    sbPatch(table,'id=eq.'+id,{status:status}).then(function(res){
      if(!res.ok){toast('Грешка','#dc2626');return;}
      if(table==='client_orders'&&typeof syncLinkedTransport==='function')syncLinkedTransport(id,status);
      closeModal('status-modal');toast('✓ Статусът е обновен');loadAll();
    });
  };
  /* Същата проверка като от бутона на реда: не затваряме една заявка от обща
     поръчка, без да предупредим за останалите. */
  if(status==='done'&&table==='client_orders'&&typeof coConfirmGroupDone==='function'){
    closeModal('status-modal');
    coConfirmGroupDone(id,apply);
    return;
  }
  apply();
}
function revertStatus(id,table){
  var list=table==='transport_orders'?transportOrders:clientOrders;
  var rec=list.find(function(o){return String(o.id)===String(id);});
  if(!rec)return;
  var target='pending';
  if(table==='client_orders'){
    /* "Обработена от ЦО" се връща директно в "Изчаква" — стъпката не е задължителна
       за всички заявки (само за тези към ЦО), затова "Изпратена" не се връща в нея. */
    var prevMap={done:'arrived',arrived:'sent',sent:'pending',processed:'pending'};
    target=prevMap[rec.status]||'pending';
  }
  var patch={status:target};
  /* При връщане от "Обработена от ЦО" изчистваме и данните от ЦО — иначе на
     заявка със статус "Изчаква" остава да виси стара очаквана дата и подвежда. */
  if(table==='client_orders'&&rec.status==='processed'){patch.co_eta=null;patch.co_note=null;}
  sbPatch(table,'id=eq.'+id,patch).then(function(){
    if(table==='client_orders'&&typeof syncLinkedTransport==='function')syncLinkedTransport(id,target);
    toast('↩ Върнато');loadAll();
  });
}

/* КОРЕКЦИЯ на съществуваща заявка (клиентска или транспортна).
   id/table по избор - ако липсват, ползва statusTargetId/statusTargetTable (извикано от status-modal). */
function openCorrection(id,table){
  id=id||statusTargetId;table=table||statusTargetTable;
  if(!id||!table)return;
  var list=table==='transport_orders'?transportOrders:clientOrders;
  var rec=list.find(function(o){return String(o.id)===String(id);});
  if(!rec){toast('Записът не е намерен','#dc2626');return;}
  if(!canCorrectRecord(rec,table)){toast('Нямаш права за корекция на тази заявка','#dc2626');return;}
  correctionTargetId=id;correctionTargetTable=table;
  document.getElementById('edt-date').value=rec.date||'';
  document.getElementById('edt-hour').value=rec.hour||'10:00';
  document.getElementById('edt-name').value=rec.customer_name||'';
  document.getElementById('edt-phone').value=rec.phone||'';
  renderItemRows('edt-items',resolveItems(rec));
  document.getElementById('edt-bon').value=rec.bon||'';
  document.getElementById('edt-delivery').value=rec.delivery||'';
  document.getElementById('edt-agent').value=rec.agent||'';
  var isClient=table==='client_orders';
  document.getElementById('edt-note').value=(isClient?rec.note:rec.notes)||'';
  document.getElementById('edt-addr-wrap').style.display=isClient?'none':'';
  document.getElementById('edt-fromstore-wrap').style.display=isClient?'':'none';
  document.getElementById('edt-fulfiller-wrap').style.display=isClient?'':'none';
  if(isClient){
    loadAllStores().then(function(){
      fillStoreSelect(document.getElementById('edt-from-store'),rec.from_store||'');
      fillStoreSelect(document.getElementById('edt-fulfiller'),rec.fulfiller||'');
    });
  } else {
    document.getElementById('edt-addr').value=rec.address||'';
  }
  closeModal('status-modal');
  document.getElementById('correction-modal').classList.add('open');
}
function submitCorrection(){
  if(!correctionTargetId||!correctionTargetTable)return;
  var name=v('edt-name'),phone=v('edt-phone');
  var items=collectItems('edt-items');
  if(!name||!phone){toast('Попълни задължителните полета *','#dc2626');return;}
  if(!items.length){toast('Добави поне един артикул с продукт','#dc2626');return;}
  var first=items[0];
  var patch={
    date:v('edt-date'),hour:v('edt-hour'),customer_name:name,phone:phone,
    product:first.product,color:first.color,sap:first.sap,qty:first.qty,unit:first.unit,
    items:items,
    bon:v('edt-bon'),
    agent:v('edt-agent'),delivery:v('edt-delivery')||null
  };
  if(correctionTargetTable==='client_orders'){
    var fulfillerVal=v('edt-fulfiller');
    var restriction=checkFulfillerRestriction(fulfillerVal);
    if(restriction){
      toast('🚫 '+fulfillerVal+' не приема заявки от '+fmtDate(restriction.start_date)+' до '+fmtDate(restriction.end_date)+(restriction.note?' — '+restriction.note:''),'#dc2626');
      return;
    }
    patch.from_store=v('edt-from-store');
    patch.fulfiller=fulfillerVal;
    patch.note=v('edt-note');
  } else {
    patch.address=v('edt-addr');
    patch.notes=v('edt-note');
  }
  sbPatch(correctionTargetTable,'id=eq.'+correctionTargetId,patch).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    closeModal('correction-modal');toast('✓ Заявката е коригирана!');loadAll();
  });
}
function renderMetrics(){
  var all=transportOrders.concat(clientOrders);
  var mc=document.getElementById('tr-metrics');
  if(!mc)return;
  mc.innerHTML=['overdue','today','tomorrow','done'].map(function(s,i){
    var labels=['Просрочени','Доставки днес','За утре','Изпълнени'];
    var colors=['#dc2626','#2563eb','#d97706','#16a34a'];
    var cnt=all.filter(function(o){return o._status===s;}).length;
    return '<div class="metric"><div class="metric-val" style="color:'+colors[i]+';">'+cnt+'</div><div class="metric-lbl">'+labels[i]+'</div></div>';
  }).join('');
}
function loadAll(){loadTransport();loadClientOrders();loadDocs();}

/* AUTH — без session restore */
function initApp(){
  /* Нищо не се зарежда автоматично — изчакваме логин */
}
function doLogin(){
  var email=v('l-email').toLowerCase();
  var pass=v('l-pass');
  var errEl=document.getElementById('l-err');
  if(!email||!pass){errEl.textContent='Въведи имейл и парола.';errEl.style.display='block';return;}
  errEl.style.display='none';
  document.getElementById('l-btn').disabled=true;
  document.getElementById('l-btn').textContent='Влизане...';
  fetch(SB_URL+'/functions/v1/auth-login',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY,'apikey':SB_KEY},
    body:JSON.stringify({email:email,password:pass})
  }).then(function(r){
    return r.json().catch(function(){return{};}).then(function(d){return{status:r.status,data:d};});
  }).then(function(res){
    document.getElementById('l-btn').disabled=false;
    document.getElementById('l-btn').textContent='Влез →';
    var d=res.data||{};
    if(!d.ok){
      errEl.textContent=d.message||'Грешка при вход.';errEl.style.display='block';
      logAudit('login_failed',{email:email,success:false,details:{reason:d.reason||'unknown'}});
      return;
    }
    currentUser=d.user;
    logAudit('login_success');
    startApp();
  }).catch(function(){
    document.getElementById('l-btn').disabled=false;
    document.getElementById('l-btn').textContent='Влез →';
    errEl.textContent='Грешка при връзка. Опитай отново.';errEl.style.display='block';
  });
}
function doLogout(){
  logAudit('logout');
  currentUser=null;
  transportOrders=[];clientOrders=[];docs=[];
  document.getElementById('s-app').style.display='none';
  document.getElementById('s-login').style.display='flex';
  document.getElementById('l-pass').value='';
  document.getElementById('l-err').style.display='none';
}
function startApp(){
  if(typeof initPush==='function') initPush(currentUser);
  document.getElementById('s-login').style.display='none';
  document.getElementById('s-app').style.display='flex';
  document.getElementById('nav-name').textContent=currentUser.display_name||currentUser.email;
  document.getElementById('nav-store').textContent=isGlobal()?'Всички магазини':currentUser.store_name;
  setupTabsForRole();
  if(typeof initTabDrag==='function')setTimeout(initTabDrag,200);
  if(isGlobal())document.getElementById('tr-metrics').style.display='grid';
  loadAll();
  /* Покажи подходящ таб според роля */
  var startTab=currentUser.role==='kasa'?'kasa':currentUser.role==='info'?'client':'transport';
  /* Deep-link от имейл репорт (?store=Име) - отвежда директно на "Днес",
     ако ролята изобщо има достъп до този таб (isGlobal). today.js сам чете
     същия параметър, за да разгъне точно този магазин. */
  try {
    if (new URLSearchParams(window.location.search).get('store') && isGlobal()) startTab='today';
  } catch(e){}
  showModule(startTab);
}
function setupTabsForRole(){
  /* Покажи Admin секцията само за admin */

  /* Таб Каса — само за kasa, manager, admin, accounting */
  var kasaRoles=['kasa','admin','manager']; /* kasa, управители и администратори */
  var kasaTab=document.getElementById('tab-kasa');
  if(kasaTab)kasaTab.style.display=kasaRoles.indexOf(currentUser.role)>=0?'flex':'none';
  /* Таб Администрация — само за admin */
  var histTab=document.getElementById('tab-history');
  if(histTab)histTab.style.display=isGlobal()?'flex':'none';
  /* Таб Днес — живо табло с изпълнението по обекти, само за глобални роли (admin/accounting/logistics) */
  var todayTab=document.getElementById('tab-today');
  if(todayTab)todayTab.style.display=isGlobal()?'flex':'none';
  /* Таб Чек лист — седмичният контрол на контролинга. Правилото кой го вижда
     (admin или notify_groups съдържа 'controlling') живее в checklist.js,
     защото там е и парсването на notify_groups. Този файл се зарежда пръв,
     затова проверката е с typeof — същият похват като initPush/initTabDrag
     в startApp(). Към момента на извикването (след логин) всички файлове
     са заредени. */
  var clTab=document.getElementById('tab-checklist');
  if(clTab)clTab.style.display=(typeof canSeeChecklist==='function'&&canSeeChecklist())?'flex':'none';
  /* Табове Контакти и Стока на път — за всички */
  var contactsTab=document.getElementById('tab-contacts');
  if(contactsTab)contactsTab.style.display='';
  var referenceTab=document.getElementById('tab-reference');
  if(referenceTab)referenceTab.style.display='';
  var transitTab=document.getElementById('tab-transit');
  if(transitTab)transitTab.style.display='';
  var calTab=document.getElementById('tab-calendar');
  if(calTab)calTab.style.display='';
  var srTab=document.getElementById('tab-stock-returns');
  if(srTab)srTab.style.display='';
  var sdTab=document.getElementById('tab-stock-diff');
  if(sdTab)sdTab.style.display='';
  var adminTab=document.getElementById('tab-admin');
  if(adminTab)adminTab.style.display=currentUser.role==='admin'?'':'none';
  var sepAdmin=document.getElementById('sep-admin');
  if(sepAdmin)sepAdmin.style.display=currentUser.role==='admin'?'':'none';

  /* Покажи .adm елементи (напр. бутон + Добави в Инструкции) за admin */
  var admRoles=['admin','accounting'];
  document.querySelectorAll('.adm').forEach(function(el){
    if(el.id==='tab-admin') return; /* вече е обработен */
    el.style.display=admRoles.indexOf(currentUser.role)>=0?'inline-flex':'none';
  });
}
function showModule(mod){
  /* 'oborot' НЕ е самостоятелен модул — няма контейнер mod-oborot и затова
     не влиза в списъка по-долу. Той е подтаб на Каса, така че показваме
     Каса и подсказваме кой подтаб да отвори. loadKasa() има switch по
     kasaView с клон за 'oborot', тоест зареждането не се дублира. */
  if(mod==='oborot'){
    if(typeof kasaView!=='undefined') kasaView='oborot';
    showModule('kasa');
    return;
  }
  ['transport','client','bulletin','docs','handbook','kasa','history','admin','print','contacts','reference','transit','calendar','stock-returns','stock-diff','pallets','today','checklist'].forEach(function(m){
    var el=document.getElementById('mod-'+m);if(el)el.style.display=m===mod?'block':'none';
  });
  document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('active');});
  var tab=document.getElementById('tab-'+mod);if(tab)tab.classList.add('active');
  /* "Наръчник" и "Инструкции" са обединени в 1 таб с 2 под-таба — поддържаме визуално коректно състояние */
  var dhSub=document.getElementById('docs-handbook-subnav');
  if(dhSub){
    dhSub.style.display=(mod==='docs'||mod==='handbook')?'block':'none';
    var btnH=document.getElementById('dhs-handbook'),btnD=document.getElementById('dhs-documents');
    if(btnH)btnH.classList.toggle('active',mod==='handbook');
    if(btnD)btnD.classList.toggle('active',mod==='docs');
  }
  if(mod==='handbook'){var docsTab=document.getElementById('tab-docs');if(docsTab)docsTab.classList.add('active');}
  /* "Транспорт" и "Палети" — под-таб в Транспорт (наличности на празни палети по обекти) */
  var tpSub=document.getElementById('transport-pallets-subnav');
  if(tpSub){
    tpSub.style.display=(mod==='transport'||mod==='pallets')?'block':'none';
    var btnT=document.getElementById('tps-transport'),btnP=document.getElementById('tps-pallets');
    if(btnT)btnT.classList.toggle('active',mod==='transport');
    if(btnP)btnP.classList.toggle('active',mod==='pallets');
  }
  if(mod==='pallets'){var trTab=document.getElementById('tab-transport');if(trTab)trTab.classList.add('active');}
  if(mod==='admin')loadAdmin();
  if(mod==='transport')loadTransport();
  if(mod==='client')loadClientOrders();
  if(mod==='bulletin')loadBulletin();
  if(mod==='docs')loadDocs();
  if(mod==='kasa')loadKasa();
  if(mod==='history')loadHistory();
  if(mod==='today')loadTodayDashboard();
  if(mod==='checklist')loadChecklist();
  if(mod==='contacts')loadContacts();
  if(mod==='transit')loadTransit();
  if(mod==='calendar')loadCalendar();
  if(mod==='stock-returns')loadStockReturns();
  if(mod==='stock-diff')loadStockDiff();
  if(mod==='pallets')loadPallets();
  if(mod==='reference')loadReference();
  if(mod==='handbook')loadHandbook();
}
/* Затваря модал САМО ако mousedown И mouseup са върху тъмния фон
   (предотвратява случайно затваряне при плъзгане на мишката) */
var _mouseDownOnBg = false;

/* СМЯНА НА ПАРОЛА */
function openChangePassword(){
  document.getElementById('cp-old').value='';
  document.getElementById('cp-new').value='';
  document.getElementById('cp-confirm').value='';
  document.getElementById('cp-err').style.display='none';
  document.getElementById('change-pass-modal').classList.add('open');
}
function submitChangePassword(){
  var oldPass=v('cp-old'), newPass=v('cp-new'), confirm=v('cp-confirm');
  var errEl=document.getElementById('cp-err');
  if(!oldPass||!newPass||!confirm){errEl.textContent='Попълни всички полета.';errEl.style.display='block';return;}
  if(newPass.length<6){errEl.textContent='Новата парола трябва да е поне 6 символа.';errEl.style.display='block';return;}
  if(newPass!==confirm){errEl.textContent='Паролите не съвпадат.';errEl.style.display='block';return;}
  fetch(SB_URL+'/functions/v1/auth-set-password',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY,'apikey':SB_KEY},
    body:JSON.stringify({user_id:currentUser.id,old_password:oldPass,new_password:newPass})
  }).then(function(r){return r.json().catch(function(){return{};});}).then(function(d){
    if(!d.ok){errEl.textContent=d.message||'Грешка при запис.';errEl.style.display='block';return;}
    logAudit('password_changed');
    closeModal('change-pass-modal');
    toast('✓ Паролата е сменена успешно!');
  }).catch(function(){
    errEl.textContent='Грешка при връзка. Опитай отново.';errEl.style.display='block';
  });
}

document.addEventListener('mousedown', function(e){
  _mouseDownOnBg = e.target.classList.contains('modal-bg') || e.target.classList.contains('pin-overlay');
});
document.addEventListener('click', function(e){
  if(!_mouseDownOnBg) return;
  if(e.target.classList.contains('modal-bg') || e.target.classList.contains('pin-overlay'))
    e.target.classList.remove('open');
  _mouseDownOnBg = false;
});
document.addEventListener('DOMContentLoaded',initApp);
