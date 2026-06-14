/* shared.js — конфигурация, state, utils, auth
   Зарежда се ПЪРВО. Не пипай освен ако не знаеш какво правиш. */

var SB_URL='https://xiwkdiqqplgdcrkewgtv.supabase.co',SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',API=SB_URL+'/rest/v1';
var H={'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'};

function sbGet(t,q){return fetch(API+'/'+t+(q?'?'+q:''),{headers:H}).then(function(r){return r.json();});}
function sbPost(t,b){return fetch(API+'/'+t,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){return r.ok?{ok:true}:r.json().then(function(e){return{ok:false,error:e};});});}
function sbPatch(t,f,b){return fetch(API+'/'+t+'?'+f,{method:'PATCH',headers:Object.assign({},H,{'Prefer':'return=minimal'}),body:JSON.stringify(b)}).then(function(r){return{ok:r.ok};});}
function sbDelete(t,f){return fetch(API+'/'+t+'?'+f,{method:'DELETE',headers:H}).then(function(r){return{ok:r.ok};});}

/* STATE */
var currentUser=null; /* {email,display_name,store_name,role} */
var transportOrders=[],clientOrders=[],docs=[];
var transportFilter='all',orderFilter='all',docFilter='all';
var statusTargetId=null,statusTargetTable=null;

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
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(d){if(!d||d==='—')return'—';var p=String(d).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:d;}
function v(id){var el=document.getElementById(id);return el?(el.value||'').trim():'';}
function closeModal(id){var el=document.getElementById(id);if(el)el.classList.remove('open');}
function toast(msg,col){var t=document.getElementById('toast');t.textContent=msg;t.style.background=col||'#16a34a';t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2500);}

var TODAY=new Date();TODAY.setHours(0,0,0,0);
function calcStatus(delivery,status){
  if(['done','refused','postponed'].indexOf(status)>=0)return status;
  if(!delivery)return'pending';
  var d=new Date(delivery);d.setHours(0,0,0,0);
  var diff=Math.round((d-TODAY)/86400000);
  if(diff<0)return'overdue';if(diff===0)return'today';if(diff===1)return'tomorrow';return'pending';
}
function statusBadge(s){
  var m={overdue:{l:'🔴 Просрочена',bg:'#fee2e2',c:'#991b1b'},today:{l:'🔵 Днес',bg:'#dbeafe',c:'#1e3a5f'},
    tomorrow:{l:'🟡 Утре',bg:'#fef3c7',c:'#92400e'},pending:{l:'⏳ Изчаква',bg:'#f3f4f6',c:'#374151'},
    done:{l:'✅ Изпълнена',bg:'#dcfce7',c:'#14532d'},refused:{l:'✕ Отказана',bg:'#fee2e2',c:'#991b1b'},
    postponed:{l:'⏱ Отложена',bg:'#f3e8ff',c:'#4c1d95'}};
  var x=m[s]||m.pending;
  return '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;background:'+x.bg+';color:'+x.c+'">'+x.l+'</span>';
}
function actionBtns(id,table,status){
  var done=status==='done'||status==='refused';
  var h='<div style="display:flex;gap:4px;flex-wrap:wrap;">';
  if(!done)h+='<button onclick="openStatus(\''+id+'\',\''+table+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">Статус</button>';
  else h+='<button onclick="revertStatus(\''+id+'\',\''+table+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">↩ Върни</button>';
  if(table==='client_orders')h+='<button onclick="loadPrint(\''+id+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🖨 Бланка</button>';
  if(table==='transport_orders')h+='<button onclick="loadTransportPrint(\''+id+'\')" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🖨 Бланка</button>';
  return h+'</div>';
}
function openStatus(id,table){
  statusTargetId=id;statusTargetTable=table;
  var list=table==='transport_orders'?transportOrders:clientOrders;
  var rec=list.find(function(o){return String(o.id)===String(id);});
  document.getElementById('status-info').textContent=rec?(rec.customer_name||rec.name||''):'';
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
  sbPatch(table,'id=eq.'+id,{status:calcStatus(rec.delivery,'pending')}).then(function(){toast('↩ Върнато');loadAll();});
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
  sbGet('users','email=eq.'+encodeURIComponent(email)+'&active=eq.true&select=email,password,store_name,role,display_name').then(function(data){
    document.getElementById('l-btn').disabled=false;
    document.getElementById('l-btn').textContent='Влез →';
    if(!Array.isArray(data)||!data.length){errEl.textContent='Непознат имейл адрес.';errEl.style.display='block';return;}
    var user=data[0];
    if(user.password!==pass){errEl.textContent='Грешна парола.';errEl.style.display='block';return;}
    currentUser=user; /* запазваме за проверка при смяна на парола */
    startApp();
  }).catch(function(){
    document.getElementById('l-btn').disabled=false;
    document.getElementById('l-btn').textContent='Влез →';
    errEl.textContent='Грешка при връзка. Опитай отново.';errEl.style.display='block';
  });
}
function doLogout(){
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
  if(isGlobal())document.getElementById('tr-metrics').style.display='grid';
  loadAll();
  /* Покажи подходящ таб според роля */
  var startTab=currentUser.role==='kasa'?'kasa':'transport';
  showModule(startTab);
}
function setupTabsForRole(){
  /* Таб Каса — само за kasa, manager, admin, accounting */
  var kasaRoles=['kasa','admin','manager']; /* kasa, управители и администратори */
  var kasaTab=document.getElementById('tab-kasa');
  if(kasaTab)kasaTab.style.display=kasaRoles.indexOf(currentUser.role)>=0?'':'none';
  /* Таб Администрация — само за admin */
  var histTab=document.getElementById('tab-history');
  if(histTab)histTab.style.display=isGlobal()?'':'none';
  /* Табове Контакти и Стока на път — за всички */
  var contactsTab=document.getElementById('tab-contacts');
  if(contactsTab)contactsTab.style.display='';
  var transitTab=document.getElementById('tab-transit');
  if(transitTab)transitTab.style.display='';
  var adminTab=document.getElementById('tab-admin');
  if(adminTab)adminTab.style.display=currentUser.role==='admin'?'':'none';

  /* Покажи .adm елементи (напр. бутон + Добави в Инструкции) за admin */
  var admRoles=['admin','accounting'];
  document.querySelectorAll('.adm').forEach(function(el){
    if(el.id==='tab-admin') return; /* вече е обработен */
    el.style.display=admRoles.indexOf(currentUser.role)>=0?'inline-flex':'none';
  });
}
function showModule(mod){
  ['transport','client','bulletin','docs','kasa','history','admin','print','contacts','transit'].forEach(function(m){
    var el=document.getElementById('mod-'+m);if(el)el.style.display=m===mod?'block':'none';
  });
  document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('active');});
  var tab=document.getElementById('tab-'+mod);if(tab)tab.classList.add('active');
  if(mod==='admin')loadAdmin();
  if(mod==='kasa')loadKasa();
  if(mod==='history')loadHistory();
  if(mod==='contacts')loadContacts();
  if(mod==='transit')loadTransit();
  if(mod==='bulletin')loadBulletin();
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
  if(oldPass!==currentUser.password){errEl.textContent='Старата парола е грешна.';errEl.style.display='block';return;}
  if(newPass.length<6){errEl.textContent='Новата парола трябва да е поне 6 символа.';errEl.style.display='block';return;}
  if(newPass!==confirm){errEl.textContent='Паролите не съвпадат.';errEl.style.display='block';return;}
  sbPatch('users','email=eq.'+encodeURIComponent(currentUser.email),{password:newPass}).then(function(res){
    if(!res.ok){errEl.textContent='Грешка при запис.';errEl.style.display='block';return;}
    currentUser.password=newPass;
    closeModal('change-pass-modal');
    toast('✓ Паролата е сменена успешно!');
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
