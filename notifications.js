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
    /* Заявка, която ЦО е обработил и която още е в срока на доставчика, не е
       "без отговор" — отговорът е даден, чака се стоката. */
    if(typeof coWaitingSupplier==='function'&&coWaitingSupplier(o)) return false;
    var days=o.created_at?Math.floor((now2-new Date(o.created_at))/86400000):0;
    return days>=7&&['done','refused','postponed'].indexOf(o._status)<0&&o._isFulfiller;
  });
  var td=all.filter(function(o){return o._status==='today';});
  var tm=all.filter(function(o){return o._status==='tomorrow';});
  /* Клиентски заявки >5 дни (предупреждение) */
  var oldOrders=clientOrders.filter(function(o){
    if(typeof coWaitingSupplier==='function'&&coWaitingSupplier(o)) return false;
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

  /* Сторно бележки с разминаване (нова сума < върната) — само за admin/accounting,
     последните 30 дни, за да не се налага да влизат в История, за да разберат. */
  if(['admin','accounting'].indexOf(currentUser.role)>=0){
    var stFrom=new Date();stFrom.setDate(stFrom.getDate()-30);
    sbGet('kasa_storno','storno_date=gte.'+stFrom.toISOString().slice(0,10)+'&select=store_name,returned_sum,new_sum').then(function(rows){
      if(!Array.isArray(rows)||!rows.length) return;
      var flagged=rows.filter(function(r){return (parseFloat(r.new_sum)||0)<(parseFloat(r.returned_sum)||0);});
      if(!flagged.length) return;
      var el=document.getElementById('notif-banner');if(!el)return;
      var stores={};flagged.forEach(function(r){stores[r.store_name]=(stores[r.store_name]||0)+1;});
      var storeList=Object.keys(stores).map(function(s){return s+' ('+stores[s]+')';}).join(', ');
      var card='<div class="notif-card urgent"><div class="notif-icon">🧾</div><div class="notif-text">'+
        '<div class="notif-title">'+flagged.length+' сторно бележк'+(flagged.length===1?'а':'и')+' с по-малка сума на новата покупка!</div>'+
        '<div class="notif-sub">'+esc(storeList)+' &nbsp;·&nbsp; последните 30 дни</div>'+
        '</div><button onclick="goToStornoHistory()" style="border:none;background:#dc2626;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Виж →</button>'+
        '<span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
      el.innerHTML=card+el.innerHTML;el.style.display='block';
    }).catch(function(){});
  }

  if(!od.length&&!td.length&&!tm.length) html='<div class="notif-card success"><div class="notif-icon">✅</div><div class="notif-text"><div class="notif-title">Всичко е наред!</div><div class="notif-sub">Няма просрочени или спешни заявки.</div></div><span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
  banner.innerHTML=html;banner.style.display='block';

  /* Товарни листи за получаване. Картата е ЗА ОБЕКТА: глобалният профил и
     самият склад отпадат вътре в notifLoadingListsPending(). */
  notifLoadingListsPending(function(lists){
    if(!lists || !lists.length) return;
    var el=document.getElementById('notif-banner'); if(!el) return;
    var n=lists.length;
    /* onclick е на цялата карта, затова ✕ спира разпространението — иначе
       затварянето би отваряло таба. */
    var card='<div class="notif-card info" data-notif="loading" onclick="showModule(\'loading\')" style="cursor:pointer;">'+
      '<div class="notif-icon">🚛</div><div class="notif-text">'+
      '<div class="notif-title">'+n+(n===1?' товарен лист':' товарни листа')+' за получаване</div>'+
      '<div class="notif-sub">Отметни палетите в Транспорт → Товарни листи</div>'+
      '</div><span class="notif-close" onclick="event.stopPropagation();dismissCard(this)">✕</span></div>';
    el.innerHTML=card+el.innerHTML; el.style.display='block';
  });

  /* Нови задачи от Бюлетин през последните 3 дни, все още неотметнати от
     този магазин — само за store роли (не и за офиса, който сам ги пише). */
  if(!isGlobal() && currentUser.store_name) checkNewBulletinTasksBanner();
}

/* Показва карта за нови задачи (последните 3 дни) от Бюлетин И постоянни
   задачи, които този магазин още не е отбелязал (нито изпълнени, нито
   отложени). Самостоятелна заявка - не разчита bulTasks/bulComps/
   recurringTasks да са заредени (Бюлетин табът може изобщо да не е
   отварян тази сесия). И двата вида задачи се филтрират по target_stores -
   постоянните също го имат (submitRecurring() го записва), макар че по-стар
   коментар тук твърдеше обратното. */

/* Датите, за които се брои отмятането на постоянна задача - огледално на
   renderRecurringTasks() в bulletin.js (след 17fdc7d ВСЯКА постоянна задача
   е date-scoped):
     - няколко избрани дни (due_weekdays) -> всеки от тези дни от ТАЗИ седмица;
     - един ден (due_weekdays с 1 елемент или старото due_weekday) -> датата
       на този ден от ТАЗИ седмица (затова отметка от понеделник важи цялата
       седмица, а не само в понеделник);
     - "всеки ден" / без избран ден -> днешната дата (нулира се ежедневно).
   Датите са ЛОКАЛНИ (toLocalISO от bulletin.js, зареден ПРЕДИ този файл),
   НЕ today() от shared.js - toISOString() бута датата ден назад в ранните
   сутрешни часове по българско време (UTC+2/+3).
   Седмицата е текущата календарна, не curBul - банерът се показва при login,
   когато Бюлетин табът още може изобщо да не е зареждан.
   Понеделникът се смята директно от локалната дата, а НЕ през
   weekDays(weekNum(now), now.getFullYear()) - weekNum() връща ISO седмица
   (напр. 53 от 2026 за 01.01.2027), а getFullYear() дава календарната
   година; двойката се разминава около Нова година и връща дата от съвсем
   друга седмица. */
function notifRecurringDueDates(t){
  var now=new Date();
  var wds=recTaskWeekdays(t);
  if(!wds.length) return [toLocalISO(now)];
  var jsDay=now.getDay();                 /* 0=Нед,1=Пон...6=Съб */
  var idxToday=jsDay===0?6:jsDay-1;       /* 0=Пон..6=Нед - както DNAMES/due_weekdays */
  var mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-idxToday);
  return wds.map(function(idx){
    return toLocalISO(new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+idx));
  });
}
/* Важи ли задачата за този магазин - същото условие като bulletin.js
   (recurringForDay ~708-711) и за двата вида задачи тук. ПРАЗНО/липсващо
   target_stores = "за всички магазини", НЕ "за никой". Банерът се показва
   само на store роли (вика се под !isGlobal()), затова офис клаузата
   (isGlobal()||...) от bulletin.js не е нужна. */
function notifTaskForStore(t,store){
  return !t.target_stores || !t.target_stores.length || t.target_stores.indexOf(store)>=0;
}
/* Чакаща е постоянна задача, на която поне един от дните ѝ за тази седмица
   няма отбелязване. Запис БЕЗ completion_date важи винаги и я маха от
   чакащите - такива са старите отметки отпреди date-scoping И всяко
   "⏱ Отложи" (submitPostpone не записва дата). Същото условие като
   report.js:72 и today.js:106. */
function notifRecurringPending(taskId,dueDates,recComps){
  var mine=recComps.filter(function(c){return c.recurring_task_id===taskId;});
  if(mine.some(function(c){return !c.completion_date;})) return false;
  return dueDates.some(function(d){
    return !mine.some(function(c){return c.completion_date===d;});
  });
}
function checkNewBulletinTasksBanner(){
  var store=currentUser.store_name;
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-3);
  var cutoffISO=cutoff.toISOString();

  var bulTasksPromise=sbGet('bulletins','status=eq.published&order=created_at.desc&limit=1').then(function(bulRes){
    var bul=(Array.isArray(bulRes)&&bulRes.length)?bulRes[0]:null;
    if(!bul)return [];
    return sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id+'&created_at=gte.'+cutoffISO).then(function(tasksRaw){
      var tasks=Array.isArray(tasksRaw)?tasksRaw:[];
      return tasks.filter(function(t){return notifTaskForStore(t,store);})
                  .map(function(t){return {id:t.id,title:t.title,kind:'regular'};});
    });
  }).catch(function(){return [];});

  var recTasksPromise=sbGet('recurring_tasks','active=eq.true&created_at=gte.'+cutoffISO).then(function(rtRaw){
    var rt=Array.isArray(rtRaw)?rtRaw:[];
    return rt.filter(function(t){return notifTaskForStore(t,store);})
             .map(function(t){return {id:t.id,title:t.title,kind:'recurring',dueDates:notifRecurringDueDates(t)};});
  }).catch(function(){return [];});

  Promise.all([bulTasksPromise,recTasksPromise]).then(function(results){
    var relevant=results[0].concat(results[1]);
    if(!relevant.length)return;
    var regIds=results[0].map(function(t){return t.id;});
    var recIds=results[1].map(function(t){return t.id;});
    Promise.all([
      regIds.length?sbGet('task_completions','task_id=in.('+regIds.join(',')+')&store_name=eq.'+encodeURIComponent(store)):Promise.resolve([]),
      recIds.length?sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')&store_name=eq.'+encodeURIComponent(store)):Promise.resolve([])
    ]).then(function(compsResults){
      var regComps=Array.isArray(compsResults[0])?compsResults[0]:[];
      var recComps=Array.isArray(compsResults[1])?compsResults[1]:[];
      var pending=relevant.filter(function(t){
        if(t.kind==='regular')return !regComps.some(function(c){return c.task_id===t.id;});
        return notifRecurringPending(t.id,t.dueDates,recComps);
      });
      if(!pending.length)return;
      var el=document.getElementById('notif-banner');if(!el)return;
      var titles=pending.slice(0,3).map(function(t){return (t.kind==='recurring'?'🔁 ':'')+esc(t.title);}).join(', ')+(pending.length>3?'...':'');
      var card='<div class="notif-card info"><div class="notif-icon">✅</div><div class="notif-text">'+
        '<div class="notif-title">'+pending.length+' нов'+(pending.length===1?'а задача':'и задачи')+' от Бюлетин</div>'+
        '<div class="notif-sub">'+titles+'</div>'+
        '</div><button onclick="showModule(\'bulletin\')" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Виж →</button>'+
        '<span class="notif-close" onclick="dismissCard(this)">✕</span></div>';
      el.innerHTML=card+el.innerHTML;el.style.display='block';
    }).catch(function(){});
  });
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
/* Воден знак (ISO низ) за товарните листи, НЕ множество от id-та: листите са
   малко и се четат с limit=20, тоест множеството би „забравило" стар лист,
   изпаднал от прозореца, и би го обявил за нов при следващото му появяване.
   Времето не забравя. */
var _llWatermark=null;

/* Кой изобщо получава известия за товарни листи. Отделен предикат, защото и
   помощната функция, и звънецът трябва да го знаят: звънецът пита ПРЕДИ да
   сложи воден знак, за да не заковава баселайн на потребител, който така или
   иначе няма да получи нищо.
   Глобалният профил няма „свой" обект, а логистичният склад е ИЗПРАЩАЧЪТ — на
   него не му трябва известие за собствения му лист. */
function notifWantsLoadingLists(){
  if(!currentUser) return false;
  if(!assignedStores()) return false;
  if(typeof isLogisticsWarehouseUser==='function' && isLogisticsWarehouseUser()) return false;
  return true;
}

/* ── Изпратените товарни листи, по които обектът има НЕПОЛУЧЕН ред ──
   Едно място, защото и звънецът (checkNewLoadingLists), и картата при вход
   (showLoginBanner) питат точно това. Две копия щяха да се разминат при
   първата промяна на филтъра.
   cb(null) значи „нямаме информация" — мрежов срив или празен резултат. Викащият
   НЕ бива да мести водния знак при null, иначе следващият успешен цикъл обявява
   всичко за ново. cb([...]) е реален отговор. */
function notifLoadingListsPending(cb){
  if(!notifWantsLoadingLists()){ cb(null); return; }
  Promise.all([
    sbGet('loading_lists','status=eq.sent&order=sent_at.desc&limit=20&select=id,warehouse,sent_at',true),
    sbGet('loading_list_items','received=eq.false&select=list_id'+storeQ(),true)
  ]).then(function(r){
    var lists=Array.isArray(r[0])?r[0]:[];
    var items=Array.isArray(r[1])?r[1]:[];
    if(!lists.length || !items.length){ cb(null); return; }
    var need={}; items.forEach(function(i){ if(i.list_id) need[i.list_id]=1; });
    cb(lists.filter(function(l){ return need[l.id]; }));
  }).catch(function(){ cb(null); });
}
/* Звънецът за нов товарен лист. Отделен от логиката за заявки нарочно: там
   критерият е множество от id-та, тук е време — вплитането им би значело едно
   от двете да работи наполовина. */
function checkNewLoadingLists(){
  if(!notifWantsLoadingLists()) return;
  notifLoadingListsPending(function(lists){
    /* ПЪРВИЯТ цикъл ВИНАГИ слага воден знак — и при празен отговор, и при
       мрежов срив. Баселайн „сега" е безопасен: стар лист никога не е по-нов
       от него, а лист, изпратен след това, се хваща. Оставането на null би
       значело, че обект без нито един лист не чува ПЪРВИЯ си — при него всеки
       цикъл щеше да е базов. Ако точно първият цикъл е попаднал на срив,
       заварените листи ги показва картата при вход. */
    if(_llWatermark===null){
      var base='';
      if(lists) lists.forEach(function(l){ if(l.sent_at && l.sent_at>base) base=l.sent_at; });
      _llWatermark = base || new Date().toISOString();
      return;
    }
    /* СЛЕД баселайна празният отговор е срив и знакът не мърда — иначе
       следващият успешен цикъл обявява всичко за ново. */
    if(!lists || !lists.length) return;
    var maxTs=lists.reduce(function(m,l){ return (l.sent_at && l.sent_at>m)?l.sent_at:m; },'');
    if(!maxTs) maxTs=_llWatermark; /* листи без sent_at — знакът не се връща назад */
    var fresh=lists.filter(function(l){ return l.sent_at && l.sent_at>_llWatermark; });
    if(fresh.length){
      playSound();
      toast(fresh.length===1
        ? '🚛 Нов товарен лист от '+(fresh[0].warehouse||'склада')
        : '🚛 '+fresh.length+' нови товарни листа','#2563eb');
      /* Отвореният таб се опреснява сам. Няма глобал за текущия модул, затова
         се пита самият контейнер — showModule() крие останалите с display. */
      var mod=document.getElementById('mod-loading');
      if(mod && mod.style.display!=='none' && typeof loadLoadingLists==='function') loadLoadingLists();
    }
    _llWatermark=maxTs;
  });
}

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
  Promise.all([sbGet('transport_orders',tq+'&select=id',true),sbGet('client_orders',cq+'&select=id',true)]).then(function(r){
    var allIds=[];
    if(Array.isArray(r[0])) r[0].forEach(function(o){allIds.push('t_'+o.id);});
    if(Array.isArray(r[1])) r[1].forEach(function(o){allIds.push('c_'+o.id);});
    var currentSet={}; allIds.forEach(function(id){currentSet[id]=1;});

    /* Празен резултат = мрежов срив (в базата винаги има заявки).
       Пропускаме цикъла БЕЗ да пипаме _seenIds — иначе следващият
       успешен цикъл обявява цялата таблица за „нова“.
       Компромис: обект с НУЛА заявки няма да чуе звук за първата си
       заявка (при нея _seenIds е още null → тих baseline). Съзнателно
       избрано пред фалшива тревога с целия списък заявки. */
    if(!allIds.length) return;

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
  /* Отделно от заявките и НЕ вплетено в тяхната логика. */
  checkNewLoadingLists();
}
function startPolling(){
  if(_poll)clearInterval(_poll);
  _seenIds=null; /* нулираме при всеки нов старт, за да хванем правилния базов snapshot */
  _llWatermark=null;
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
