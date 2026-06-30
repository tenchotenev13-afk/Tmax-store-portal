/* notifications.js — Банери, брояч, звук, polling
   Зарежда се ПОСЛЕДНО — след всички модули.
   Редактирай САМО тук когато правиш промени по нотификациите. */

var _lastT=0,_lastC=0,_poll=null,_notifShown=false;

function updateBadges(){
  var tU=transportOrders.filter(function(o){return o._status==='overdue'||o._status==='today';}).length;
  var cU=clientOrders.filter(function(o){return o._status==='overdue'||o._status==='today';}).length;
  var bt=document.getElementById('badge-transport');
  var bc=document.getElementById('badge-client');
  if(bt){if(tU>0){bt.textContent=tU;bt.style.display='inline';}else bt.style.display='none';}
  if(bc){if(cU>0){bc.textContent=cU;bc.style.display='inline';}else bc.style.display='none';}
}
function showLoginBanner(){
  var banner=document.getElementById('notif-banner');if(!banner)return;
  var all=transportOrders.concat(clientOrders);
  /* Просрочени по дата на доставка + клиентски заявки >7 дни без отговор */
  var now2=new Date();now2.setHours(0,0,0,0);
  var od=all.filter(function(o){
    if(o._status==='overdue') return true;
    var days=o.created_at?Math.floor((now2-new Date(o.created_at))/86400000):0;
    return days>=7&&['done','refused','postponed'].indexOf(o._status)<0&&o._isFulfiller;
  });
  var td=all.filter(function(o){return o._status==='today';});
  var tm=all.filter(function(o){return o._status==='tomorrow';});
  /* Клиентски заявки >5 дни (предупреждение) */
  var oldOrders=clientOrders.filter(function(o){
    var days=o.created_at?Math.floor((now2-new Date(o.created_at))/86400000):0;
    return days>=5&&days<7&&['done','refused','postponed'].indexOf(o._status)<0&&o._isFulfiller;
  });
  var html='';
  if(od.length) html+='<div class="notif-card urgent"><div class="notif-icon">🚨</div><div class="notif-text"><div class="notif-title">'+od.length+' просрочен'+(od.length===1?'а заявка':'и заявки')+'!</div><div class="notif-sub">Трябва незабавно внимание.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  if(td.length) html+='<div class="notif-card info"><div class="notif-icon">🔵</div><div class="notif-text"><div class="notif-title">'+td.length+' доставк'+(td.length===1?'а':'и')+' ДНЕС</div><div class="notif-sub">Заявки с дата на доставка за днес.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  if(oldOrders&&oldOrders.length) html+='<div class="notif-card warning"><div class="notif-icon">⏳</div><div class="notif-text"><div class="notif-title">'+oldOrders.length+' клиентска заявка за изпълнение над 5 дни!</div><div class="notif-sub">Заявките трябва да се изпълнят в рамките на 7-10 дни.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  if(tm.length) html+='<div class="notif-card warning"><div class="notif-icon">🟡</div><div class="notif-text"><div class="notif-title">'+tm.length+' доставк'+(tm.length===1?'а':'и')+' УТРЕ</div><div class="notif-sub">Подготви стоката навреме.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  /* Върнати за корекция */
  sbGet('kasa_reports','store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&status=eq.returned&select=return_reason,returned_by').then(function(ret){
    if(Array.isArray(ret)&&ret.length){
      var r=ret[0];
      var el=document.getElementById('notif-banner');
      if(el){
        var card='<div class="notif-card urgent"><div class="notif-icon">↩</div><div class="notif-text">'+
          '<div class="notif-title">Касов отчет е върнат за корекция!</div>'+
          '<div class="notif-sub">Причина: '+esc(r.return_reason||'')+'&nbsp;·&nbsp;Върнат от: '+esc(r.returned_by||'')+'</div>'+
          '</div></div>';
        el.innerHTML=card+el.innerHTML;el.style.display='block';
      }
    }
  }).catch(function(){});
  if(!od.length&&!td.length&&!tm.length) html='<div class="notif-card success"><div class="notif-icon">✅</div><div class="notif-text"><div class="notif-title">Всичко е наред!</div><div class="notif-sub">Няма просрочени или спешни заявки.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  banner.innerHTML=html;banner.style.display='block';
}
function dismissCard(el){
  var card=el.closest('.notif-card');
  if(card){card.style.opacity='0';card.style.transform='translateY(-6px)';card.style.transition='.2s';setTimeout(function(){card.remove();},200);}
}
function playSound(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    [523,659,784].forEach(function(freq,i){
      var osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type='sine';
      gain.gain.setValueAtTime(0,ctx.currentTime+i*.12);
      gain.gain.linearRampToValueAtTime(.15,ctx.currentTime+i*.12+.04);
      gain.gain.linearRampToValueAtTime(0,ctx.currentTime+i*.12+.18);
      osc.start(ctx.currentTime+i*.12);osc.stop(ctx.currentTime+i*.12+.2);
    });
  }catch(e){}
}
var _seenIds=null; /* Set от id-та на вече видени заявки — избягва фалшиви звуци при простo презареждане */

function checkNewOrders(){
  if(!currentUser)return;
  var stores=assignedStores();
  var tq='order=created_at.desc';
  var cq='order=created_at.desc';
  if(stores){
    if(stores.length===1){
      var s=encodeURIComponent(stores[0]);
      tq+='&store_name=eq.'+s;
      cq+='&or=(store_name.eq.'+s+',fulfiller.eq.'+s+')';
    } else {
      tq+=storeQ();
      var orP=stores.map(function(st){var s=encodeURIComponent(st);return 'store_name.eq.'+s+',fulfiller.eq.'+s;}).join(',');
      cq+='&or=('+orP+')';
    }
  }
  Promise.all([sbGet('transport_orders',tq+'&select=id'),sbGet('client_orders',cq+'&select=id')]).then(function(r){
    var allIds=[];
    if(Array.isArray(r[0])) r[0].forEach(function(o){allIds.push('t_'+o.id);});
    if(Array.isArray(r[1])) r[1].forEach(function(o){allIds.push('c_'+o.id);});
    var currentSet={}; allIds.forEach(function(id){currentSet[id]=1;});

    if(_seenIds===null){
      /* Първо извикване — само записваме базовото състояние, без звук */
      _seenIds=currentSet;
      return;
    }

    /* Намираме реално НОВИ id-та (не са били в предишния snapshot) */
    var newOnes=allIds.filter(function(id){return !_seenIds[id];});
    if(newOnes.length>0){
      playSound();
      toast('🔔 '+(newOnes.length===1?'Нова заявка е постъпила!':newOnes.length+' нови заявки!'),'#2563eb');
      loadAll();
    }
    _seenIds=currentSet;
  }).catch(function(){});
}
function startPolling(){
  if(_poll)clearInterval(_poll);
  _seenIds=null; /* нулираме при всеки нов старт, за да хванем правилния базов snapshot */
  _poll=setInterval(checkNewOrders,30000);
}

/* Hook into renderMetrics — показва банера след като данните са заредени
   Брои 2 извиквания (транспорт + клиентски), след което е сигурно, че имаме данни */
var _origMetrics=renderMetrics;
var _metricsCount=0;
renderMetrics=function(){
  _origMetrics();
  updateBadges();
  _metricsCount++;
  /* След 2+ рендера данните са готови — показваме банера */
  if(_metricsCount>=2 && !_notifShown && currentUser){
    _notifShown=true;
    showLoginBanner();
  }
};

/* Hook into startApp — стартира polling и нулира брояча */
var _origStart=startApp;
startApp=function(){
  _origStart();
  _notifShown=false;
  _metricsCount=0;
  setTimeout(startPolling,3000);
};
