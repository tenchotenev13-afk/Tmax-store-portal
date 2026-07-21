/* shared.js — конфигурация, state, utils, auth
   Зарежда се ПЪРВО. Не пипай освен ако не знаеш какво правиш. */

var SB_URL='https://xiwkdiqqplgdcrkewgtv.supabase.co',SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',API=SB_URL+'/rest/v1';
var H={'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'};

function sbGet(t,q){return fetch(API+'/'+t+(q?'?'+q:''),{headers:H}).then(function(r){return r.json();});}
function sbPost(t,b){return fetch(API+'/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){return r.ok?{ok:true}:r.json().then(function(e){return{ok:false,error:e};});});}
function sbPatch(t,f,b){return fetch(API+'/'+t+'?'+f,{method:'PATCH',headers:Object.assign({},H,{'Prefer':'return=minimal'}),body:JSON.stringify(b)}).then(function(r){return{ok:r.ok};});}
function sbDelete(t,f){return fetch(API+'/'+t+'?'+f,{method:'DELETE',headers:H}).then(function(r){return{ok:r.ok};});}

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
/* За value="" на input/textarea полета - празно поле трябва да е ИСТИНСКИ празно, не тире (esc() връща тире за показване на данни, тук е грешно) */
function escVal(s){return s?esc(s):'';}
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(d){if(!d||d==='—')return'—';var p=String(d).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:d;}
function v(id){var el=document.getElementById(id);return el?(el.value||'').trim():'';}
function closeModal(id){var el=document.getElementById(id);if(el)el.classList.remove('open');}
function toast(msg,col){var t=document.getElementById('toast');t.textContent=msg;t.style.background=col||'#16a34a';t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2500);}

var TODAY=new Date();TODAY.setHours(0,0,0,0);
function calcStatus(delivery,status){
  if(['done','refused','postponed','approved'].indexOf(status)>=0)return status;
  if(!delivery)return'pending';
  var d=new Date(delivery);d.setHours(0,0,0,0);
  var diff=Math.round((d-TODAY)/86400000);
  if(diff<0)return'overdue';if(diff===0)return'today';if(diff===1)return'tomorrow';return'pending';
}
function statusBadge(s){
  var m={overdue:{l:'🔴 Просрочена',bg:'#fee2e2',c:'#991b1b'},today:{l:'🔵 Днес',bg:'#dbeafe',c:'#1e3a5f'},
    tomorrow:{l:'🟡 Утре',bg:'#fef3c7',c:'#92400e'},pending:{l:'⏳ Изчаква',bg:'#f3f4f6',c:'#374151'},
    approved:{l:'✓ Одобрена',bg:'#dbeafe',c:'#1e3a5f'},
    done:{l:'✅ Изпълнена',bg:'#dcfce7',c:'#14532d'},refused:{l:'✕ Отказана',bg:'#fee2e2',c:'#991b1b'},
    postponed:{l:'⏱ Отложена',bg:'#f3e8ff',c:'#4c1d95'}};
  var x=m[s]||m.pending;
  return '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;background:'+x.bg+';color:'+x.c+'">'+x.l+'</span>';
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
function loadAllStores(){
  if(allStoresCache)return Promise.resolve(allStoresCache);
  return sbGet('stores','select=name&order=name').then(function(data){
    allStoresCache=Array.isArray(data)?data.map(function(s){return s.name;}):[];
    return allStoresCache;
  }).catch(function(){allStoresCache=[];return allStoresCache;});
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
function lookupCatalogBySap(inputEl){
  var sap=inputEl.value.trim();
  if(!sap)return;
  var row=inputEl.closest('.item-row')||inputEl.closest('.diff-item-row');
  if(!row)return;
  var nameEl=row.querySelector('.item-product')||row.querySelector('.di-name');
  var unitEl=row.querySelector('.item-unit')||row.querySelector('.di-unit');
  fetch(API+'/product_catalog?sap_code=eq.'+encodeURIComponent(sap)+'&limit=1',{headers:H}).then(function(res){
    if(!res.ok){
      return res.text().then(function(errText){
        console.error('product_catalog GET грешка (SAP '+sap+'):',errText);
      });
    }
    return res.json().then(function(data){
      var item=Array.isArray(data)&&data[0]?data[0]:null;
      if(!item){console.log('SAP '+sap+' не е намерен в каталога.');return;}
      if(nameEl && !nameEl.value.trim()) nameEl.value=item.product_name;
      if(unitEl && item.default_unit){
        var opts=[].map.call(unitEl.options,function(o){return o.value;});
        if(opts.indexOf(item.default_unit)>=0) unitEl.value=item.default_unit;
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
  document.getElementById('status-modal').classList.add('open');
}
function setStatus(status){
  if(!statusTargetId)return;
  sbPatch(statusTargetTable,'id=eq.'+statusTargetId,{status:status}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeModal('status-modal');toast('✓ Статусът е обновен');loadAll();
  });
}
function revertStatus(id,table){
  var list=table==='transport_orders'?transportOrders:clientOrders;
  var rec=list.find(function(o){return String(o.id)===String(id);});
  if(!rec)return;
  sbPatch(table,'id=eq.'+id,{status:'pending'}).then(function(){toast('↩ Върнато');loadAll();});
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
  ['transport','client','bulletin','docs','handbook','kasa','history','admin','print','contacts','reference','transit','calendar','stock-returns','stock-diff'].forEach(function(m){
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
  if(mod==='admin')loadAdmin();
  if(mod==='transport')loadTransport();
  if(mod==='client')loadClientOrders();
  if(mod==='bulletin')loadBulletin();
  if(mod==='docs')loadDocs();
  if(mod==='kasa')loadKasa();
  if(mod==='history')loadHistory();
  if(mod==='contacts')loadContacts();
  if(mod==='transit')loadTransit();
  if(mod==='calendar')loadCalendar();
  if(mod==='stock-returns')loadStockReturns();
  if(mod==='stock-diff')loadStockDiff();
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
