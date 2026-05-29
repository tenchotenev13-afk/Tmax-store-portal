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
  var od=all.filter(function(o){return o._status==='overdue';});
  var td=all.filter(function(o){return o._status==='today';});
  var tm=all.filter(function(o){return o._status==='tomorrow';});
  var html='';
  if(od.length) html+='<div class="notif-card urgent"><div class="notif-icon">🚨</div><div class="notif-text"><div class="notif-title">'+od.length+' просрочен'+(od.length===1?'а заявка':'и заявки')+'!</div><div class="notif-sub">Трябва незабавно внимание.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  if(td.length) html+='<div class="notif-card info"><div class="notif-icon">🔵</div><div class="notif-text"><div class="notif-title">'+td.length+' доставк'+(td.length===1?'а':'и')+' ДНЕС</div><div class="notif-sub">Заявки с дата на доставка за днес.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  if(tm.length) html+='<div class="notif-card warning"><div class="notif-icon">🟡</div><div class="notif-text"><div class="notif-title">'+tm.length+' доставк'+(tm.length===1?'а':'и')+' УТРЕ</div><div class="notif-sub">Подготви стоката навреме.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
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
function checkNewOrders(){
  if(!currentUser)return;
  var q='order=created_at.desc';
  if(!isGlobal())q+='&store_name=eq.'+encodeURIComponent(currentUser.store_name);
  Promise.all([sbGet('transport_orders',q),sbGet('client_orders',q)]).then(function(r){
    var nt=Array.isArray(r[0])?r[0].length:0;
    var nc=Array.isArray(r[1])?r[1].length:0;
    if((_lastT>0&&nt>_lastT)||(_lastC>0&&nc>_lastC)){playSound();toast('🔔 Нова заявка е постъпила!','#2563eb');}
    if(nt!==_lastT||nc!==_lastC){_lastT=nt;_lastC=nc;loadAll();}
  }).catch(function(){});
}
function startPolling(){
  if(_poll)clearInterval(_poll);
  _lastT=transportOrders.length;_lastC=clientOrders.length;
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
