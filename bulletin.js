/* bulletin.js v4.1 — 2026-06-02 */
/* bulletin.js — Т-Бюлетин v4 */

/* CONFIG */
var BUL_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var BUL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var BUL_BKT = 'bulletin-files';
var BUL_PUB = BUL_SB + '/storage/v1/object/public/' + BUL_BKT + '/';

/* STATE */
var bulActiveDept = 'trade';
var curBul = null; var bulTasks = []; var bulComps = [];
var recurringTasks = []; var recurringComps = []; var subtaskComps = [];
var bulPromotions = [];
var bulMode = 'view'; var bulSaveT = null; var dragInfo = null;

/* DEPTS */
var DEPTS = {
  trade:     {label:'Търговска',      icon:'🛒', color:'#14532d', bg:'#f0fdf4', bdr:'#bbf7d0', hdr:'#166534'},
  warehouse: {label:'Склад/Приемане', icon:'📦', color:'#1e3a5f', bg:'#eff6ff', bdr:'#bfdbfe', hdr:'#1e40af'},
  admin:     {label:'Администрация',  icon:'⚙️', color:'#4c1d95', bg:'#f5f3ff', bdr:'#ddd6fe', hdr:'#5b21b6'}
};
var DCOLS  = ['trade','warehouse','admin'];
var DNAMES = ['Понеделник','Вторник','Сряда','Четвъртък','Петък'];
var DKEYS  = ['mon','tue','wed','thu','fri'];

function myDept(){
  var m={manager:'trade',sklad:'warehouse',kasa:'admin',accounting:'admin',logistics:'admin',admin:'admin',info:'trade'};
  return currentUser ? (m[currentUser.role]||'trade') : 'trade';
}
function canEdit(){return currentUser && ['admin','accounting'].indexOf(currentUser.role)>=0;}
function genId(){return Math.random().toString(36).slice(2,9);}

/* ═══════ ПРОМОЦИИ ══════════════════════════════════════════ */
function promoStatus(p){
  var t=new Date(); t.setHours(0,0,0,0);
  var s=new Date(p.start_date); s.setHours(0,0,0,0);
  var e=new Date(p.end_date); e.setHours(0,0,0,0);
  if(t<s) return 'upcoming';
  if(t>e) return 'expired';
  var daysLeft=Math.ceil((e-t)/86400000);
  if(daysLeft<=3) return 'expiring';
  return 'active';
}
var PROMO_STATUS_META={
  upcoming:{label:'⏳ Предстояща',bg:'#eff6ff',bdr:'#bfdbfe',c:'#1e40af'},
  active:{label:'✅ Активна',bg:'#f0fdf4',bdr:'#bbf7d0',c:'#166534'},
  expiring:{label:'⚠️ Изтича скоро',bg:'#fffbeb',bdr:'#fde68a',c:'#92400e'},
  expired:{label:'🔴 Изтекла',bg:'#fef2f2',bdr:'#fecaca',c:'#991b1b'}
};
function renderPromotionsSection(){
  if(!bulPromotions.length && !canEdit()) return '';
  var visible=bulPromotions.filter(function(p){ return canEdit() || promoStatus(p)!=='expired'; });
  var expiringCount=bulPromotions.filter(function(p){return promoStatus(p)==='expiring';}).length;
  var h='<div class="bcard" id="sec-promo">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  h+='<div class="bsec" style="margin-bottom:0;">🎯 Промоции</div>';
  if(canEdit())h+='<button onclick="openPromoModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави промоция</button>';
  h+='</div>';
  if(canEdit() && expiringCount>0){
    h+='<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:7px;padding:8px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">';
    h+='<span style="font-size:12px;color:#92400e;">⚠️ '+expiringCount+' промоци'+(expiringCount===1?'я изтича':'и изтичат')+' до 3 дни.</span>';
    h+='<button onclick="sendPromoExpiringNotification()" style="border:none;background:#d97706;color:#fff;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;">🔔 Изпрати нотификация</button>';
    h+='</div>';
  }
  if(!visible.length){
    h+='<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">Няма активни промоции.</div>';
  }else{
    h+='<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    visible.forEach(function(p){
      var st=promoStatus(p);
      var m=PROMO_STATUS_META[st];
      var dLabel=DEPTS[p.department]?DEPTS[p.department].label:'Всички';
      h+='<div style="background:'+m.bg+';border:1px solid '+m.bdr+';border-radius:7px;padding:9px 12px;flex:1;min-width:210px;position:relative;">';
      h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">';
      h+='<div style="font-size:12px;font-weight:600;color:'+m.c+';">'+esc(p.title||'')+'</div>';
      h+='<span style="font-size:9px;font-weight:700;color:'+m.c+';white-space:nowrap;">'+m.label+'</span>';
      h+='</div>';
      if(p.description)h+='<div style="font-size:11px;color:'+m.c+';opacity:.8;margin-top:2px;">'+linkify(p.description)+'</div>';
      h+='<div style="font-size:10px;color:'+m.c+';opacity:.7;margin-top:4px;">📅 '+fmtDate2(p.start_date)+' → '+fmtDate2(p.end_date)+' &nbsp;·&nbsp; '+dLabel+'</div>';
      if(canEdit()){
        h+='<div style="display:flex;gap:5px;margin-top:7px;">';
        if(st==='expiring'||st==='expired')h+='<button data-id="'+p.id+'" onclick="openExtendPromoModal(this.dataset.id)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">↻ Продължи</button>';
        h+='<button data-id="'+p.id+'" onclick="openPromoModal(this.dataset.id)" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">✏️</button>';
        h+='<button data-id="'+p.id+'" onclick="deletePromo(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">✕</button>';
        h+='</div>';
      }
      h+='</div>';
    });
    h+='</div>';
  }
  h+='</div>';
  return h;
}
function fmtDate2(d){ if(!d) return '—'; var p=String(d).slice(0,10).split('-'); return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : d; }

function openPromoModal(id){
  var p=id ? bulPromotions.find(function(x){return String(x.id)===String(id);}) : null;
  var existing=document.getElementById('promo-modal-ov'); if(existing)existing.remove();
  var ov=document.createElement('div');
  ov.className='bov open'; ov.id='promo-modal-ov';
  ov.innerHTML='<div class="bmod" style="width:440px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">🎯 '+(p?'Редактирай промоция':'Нова промоция')+'</div>'+
    '<label class="fl">Заглавие *</label><input class="fi" id="pm-title" value="'+esc(p?p.title:'')+'" placeholder="напр. -20% на градински инструменти">'+
    '<label class="fl">Описание</label><input class="fi" id="pm-desc" value="'+esc(p?p.description||'':'')+'" placeholder="Допълнителна информация, линк и т.н.">'+
    '<label class="fl">Отдел</label><select class="fi" id="pm-dept">'+
      '<option value="all"'+(!p||p.department==='all'?' selected':'')+'>Всички</option>'+
      DCOLS.map(function(dk){return '<option value="'+dk+'"'+(p&&p.department===dk?' selected':'')+'>'+DEPTS[dk].label+'</option>';}).join('')+
    '</select>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Начална дата *</label><input type="date" class="fi" id="pm-start" value="'+(p?String(p.start_date).slice(0,10):today())+'"></div>'+
    '<div><label class="fl">Крайна дата *</label><input type="date" class="fi" id="pm-end" value="'+(p?String(p.end_date).slice(0,10):'')+'"></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'+
    '<button onclick="var e=document.getElementById(\'promo-modal-ov\');if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-id="'+(p?p.id:'')+'" onclick="submitPromo(this.dataset.id)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(p?'💾 Запази':'Добави')+'</button>'+
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){var el=document.getElementById('pm-title'); if(el)el.focus();},80);
}
function submitPromo(id){
  var title=(document.getElementById('pm-title').value||'').trim();
  var start=document.getElementById('pm-start').value;
  var end=document.getElementById('pm-end').value;
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  if(!start||!end){toast('Въведи начална и крайна дата','#dc2626');return;}
  if(end<start){toast('Крайната дата трябва да е след началната','#dc2626');return;}
  var data={
    title:title, description:document.getElementById('pm-desc').value||'',
    department:document.getElementById('pm-dept').value,
    start_date:start, end_date:end
  };
  var p=id
    ? sbPatch('bulletin_promotions','id=eq.'+id,data)
    : sbPost('bulletin_promotions',Object.assign({active:true,created_by:currentUser.display_name||currentUser.email},data));
  p.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    var el=document.getElementById('promo-modal-ov'); if(el)el.remove();
    toast(id?'✅ Записано!':'✅ Промоцията е добавена!');
    sbGet('bulletin_promotions','active=eq.true&order=end_date.asc').then(function(pr){
      bulPromotions=Array.isArray(pr)?pr:[]; renderBulletin();
    });
  });
}
function deletePromo(id){
  if(!confirm('Изтрий промоцията?'))return;
  sbPatch('bulletin_promotions','id=eq.'+id,{active:false}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    bulPromotions=bulPromotions.filter(function(p){return String(p.id)!==String(id);});
    renderBulletin(); toast('✓ Изтрита');
  });
}
function openExtendPromoModal(id){
  var p=bulPromotions.find(function(x){return String(x.id)===String(id);});
  if(!p)return;
  var existing=document.getElementById('promo-ext-ov'); if(existing)existing.remove();
  var ov=document.createElement('div');
  ov.className='bov open'; ov.id='promo-ext-ov';
  ov.innerHTML='<div class="bmod" style="width:360px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">↻ Продължи промоцията</div>'+
    '<div style="font-size:13px;color:#64748b;margin-bottom:14px;">'+esc(p.title||'')+'</div>'+
    '<label class="fl">Нова крайна дата *</label><input type="date" class="fi" id="pmx-end" value="'+String(p.end_date).slice(0,10)+'">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'+
    '<button onclick="var e=document.getElementById(\'promo-ext-ov\');if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-id="'+p.id+'" onclick="submitExtendPromo(this.dataset.id)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">✓ Продължи</button>'+
    '</div></div>';
  document.body.appendChild(ov);
}
function submitExtendPromo(id){
  var newEnd=document.getElementById('pmx-end').value;
  if(!newEnd){toast('Въведи дата','#dc2626');return;}
  var p=bulPromotions.find(function(x){return String(x.id)===String(id);});
  if(p && newEnd<String(p.start_date).slice(0,10)){toast('Датата трябва да е след началото на промоцията','#dc2626');return;}
  sbPatch('bulletin_promotions','id=eq.'+id,{end_date:newEnd}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    if(p)p.end_date=newEnd;
    var el=document.getElementById('promo-ext-ov'); if(el)el.remove();
    renderBulletin(); toast('✅ Промоцията е удължена!');
  });
}
/* Композира заглавие+съобщение за изтичащите промоции. Връща null ако няма такива. */
function composePromoExpiringMessage(){
  var expiring=bulPromotions.filter(function(p){return promoStatus(p)==='expiring';});
  if(!expiring.length)return null;
  var titles=expiring.map(function(p){return p.title;}).join(', ');
  var title='⚠️ Изтичащи промоции';
  var msg=expiring.length===1 ? titles+' изтича до 3 дни.' : expiring.length+' промоции изтичат до 3 дни: '+titles;
  return {title:title,msg:msg,count:expiring.length};
}
function sendPromoExpiringNotification(){
  var m=composePromoExpiringMessage();
  if(!m){toast('Няма изтичащи промоции','#dc2626');return;}
  if(typeof pushToAll!=='function'){toast('Нотификациите не са налични в момента','#dc2626');return;}
  pushToAll(m.title,m.msg).then(function(res){
    if(res && res.ok) toast('🔔 Нотификацията е изпратена!');
    else toast('❌ Грешка при изпращане на нотификация','#dc2626');
  });
}
/* ═══════ АВТОМАТИЧНИ НОТИФИКАЦИИ (веднъж на ден, при зареждане) ══════
   Забележка: dedup-ът е през localStorage на браузъра, не централизирано —
   ако няколко админа заредят бюлетина в един и същ ден, е възможно нотификация
   да се изпрати повече от веднъж (по 1 на устройство). За истинска гаранция за
   еднократност е нужна сървърна (cron) задача — извън обхвата на клиентския код. */
function autoCheckBulletinNotifications(){
  if(!canEdit())return; /* само редактиращите роли инициират автоматични известия */
  autoCheckPromoNotifications();
  autoCheckDailyDeadlines();
}
function autoCheckPromoNotifications(){
  var key='auto_promo_notif_'+today();
  try{ if(localStorage.getItem(key))return; }catch(e){}
  var m=composePromoExpiringMessage();
  try{ localStorage.setItem(key,'1'); }catch(e){}
  if(!m || typeof pushToAll!=='function')return;
  pushToAll(m.title,m.msg);
}



/* WEEK */
function weekNum(d){
  var dt=new Date(d); dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  var w1=new Date(dt.getFullYear(),0,4);
  return 1+Math.round(((dt-w1)/86400000-3+(w1.getDay()+6)%7)/7);
}
function weekDays(wk,yr){
  var s=new Date(yr,0,1+7*(wk-1));
  var d=s.getDay(); if(d<=4)s.setDate(s.getDate()-d+1); else s.setDate(s.getDate()+8-d);
  return [0,1,2,3,4].map(function(i){var x=new Date(s);x.setDate(s.getDate()+i);return x;});
}
function fmtD(d){return d.getDate()+'.'+(d.getMonth()<9?'0':'')+(d.getMonth()+1);}

/* LOAD */
function loadBulletin(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  wrap.innerHTML='<div style="display:flex;justify-content:center;align-items:center;height:300px;color:#94a3b8;font-size:15px;">⏳ Зареждане...</div>';
  var q=canEdit()?'order=created_at.desc&limit=1':'status=eq.published&order=created_at.desc&limit=1';
  /* Зарежда рекъринг задачи и промоции ПЪРВО, след това рендира */
  sbGet('bulletin_promotions','active=eq.true&order=end_date.asc').then(function(pr){
    bulPromotions=Array.isArray(pr)?pr:[];
  }).catch(function(){bulPromotions=[];}).then(function(){
    return sbGet('recurring_tasks','active=eq.true&order=sort_order.asc');
  }).then(function(rt){
    recurringTasks=Array.isArray(rt)?rt:[];
    return sbGet('bulletins',q);
  }).catch(function(){
    recurringTasks=[];
    return sbGet('bulletins',q);
  }).then(function(data){
    curBul=(Array.isArray(data)&&data.length)?data[0]:null;
    if(!curBul){renderBulEmpty();return;}
    if(typeof curBul.content==='string'){try{curBul.content=JSON.parse(curBul.content);}catch(e){curBul.content={};}}
    initCols();
    sbGet('bulletin_tasks','bulletin_id=eq.'+curBul.id+'&order=due_date.asc').then(function(t){
      bulTasks=Array.isArray(t)?t:[];
      if(!bulTasks.length){
        bulComps=[];subtaskComps=[];recurringComps=[];
        renderBulletin();autoCheckBulletinNotifications();return;
      }
      var ids=bulTasks.map(function(x){return x.id;}).join(',');
      var cq='task_id=in.('+ids+')'+(isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name));
      sbGet('task_completions',cq).then(function(c){
        bulComps=Array.isArray(c)?c:[];
        var storeF=isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name);
        sbGet('subtask_completions','select=*'+storeF).then(function(sc){
          subtaskComps=Array.isArray(sc)?sc:[];
          var rq='bulletin_id=eq.'+curBul.id+(isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name));
          sbGet('task_completions',rq+'&task_id=is.null').then(function(rc){
            recurringComps=Array.isArray(rc)?rc:[];
            renderBulletin();autoCheckBulletinNotifications();
          }).catch(function(){recurringComps=[];renderBulletin();autoCheckBulletinNotifications();});
        }).catch(function(){subtaskComps=[];renderBulletin();autoCheckBulletinNotifications();});
      }).catch(function(){bulComps=[];subtaskComps=[];recurringComps=[];renderBulletin();autoCheckBulletinNotifications();});
    }).catch(function(){bulTasks=[];bulComps=[];renderBulletin();autoCheckBulletinNotifications();});
  }).catch(function(){
    var wrap=document.getElementById('mod-bulletin');
    if(wrap)wrap.innerHTML='<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
  });
}

function initCols(){
  var c=curBul.content||{};
  if(!c.columns)c.columns={trade:[],warehouse:[],admin:[]};
  DCOLS.forEach(function(k){if(!c.columns[k])c.columns[k]=[];});
  if(!c.calendar)c.calendar={};
  DKEYS.forEach(function(k){if(!c.calendar[k])c.calendar[k]=[];});
  curBul.content=c;
}

/* SAVE */
function schedSave(){clearTimeout(bulSaveT);bulSaveT=setTimeout(doSave,900);}
function doSave(){
  if(!curBul)return;
  sbPatch('bulletins','id=eq.'+curBul.id,{content:curBul.content}).then(function(r){
    if(r.ok)showBulToast('💾 Запазено');
  });
}
function showBulToast(msg){
  var t=document.getElementById('bul-toast');
  if(!t)return; t.textContent=msg; t.style.opacity='1';
  setTimeout(function(){t.style.opacity='0';},2000);
}

/* ROUTER */
function renderBulletin(){
  if(bulMode==='analysis'){renderBulAnalysis();return;}
  try {
    renderBulView();
  } catch(e) {
    console.error('renderBulView error:', e);
    var w = document.getElementById('mod-bulletin');
    if(w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка: ' + e.message + '</div>';
  }
}
function setBulView(){bulMode='view';renderBulletin();}
function setBulEdit(){bulMode='edit';renderBulletin();}
function setBulAnalysis(){bulMode='analysis';renderBulletin();}

/* CSS */
var BULCSS = '<style>' +
'.bbtn{background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;}' +
'.bcard{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;}' +
'.bsec{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:10px;}' +
'.blk{border:1.5px solid #e2e8f0;border-radius:8px;padding:9px 11px;margin-bottom:6px;background:#fff;position:relative;}' +
'.blk:hover{border-color:#94a3b8;}' +
'.blk[draggable=true]{cursor:grab;}' +
'.blk.drag-hi{border-color:#2563eb;background:#eff6ff;}' +
'.blk-del{position:absolute;right:4px;top:4px;width:20px;height:20px;border:none;background:#fee2e2;color:#dc2626;border-radius:50%;font-size:11px;cursor:pointer;display:none;align-items:center;justify-content:center;font-weight:700;}' +
'.blk:hover .blk-del{display:flex;}' +
'.blk-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px;}' +
'.blk-ta{width:100%;border:none;background:none;font-family:DM Sans,sans-serif;font-size:13px;color:#0f172a;resize:none;outline:none;}' +
'.addblk{width:100%;padding:7px;border:1.5px dashed #cbd5e1;border-radius:7px;background:none;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;margin-top:6px;}' +
'.addblk:hover{border-color:#64748b;background:#f8fafc;color:#374151;}' +
'.bov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;}' +
'.bov.open{display:flex;}' +
'.bmod{background:#fff;border-radius:14px;padding:22px;width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;}' +
'</style>';

/* HEADER */
function bulHdr(isDraft){
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var yr=curBul?curBul.year:new Date().getFullYear();
  return '<div id="bul-toast" style="position:fixed;bottom:20px;right:20px;background:#16a34a;color:#fff;padding:7px 16px;border-radius:40px;font-size:12px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;"></div>' +
  '<div style="background:#0f172a;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;position:sticky;top:58px;z-index:99;box-shadow:0 2px 10px rgba(0,0,0,.4);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<div style="font-size:17px;font-weight:600;color:#fff;">Т-Бюлетин <span style="color:#64748b;font-weight:400;">| Седмица '+wk+'</span></div>' +
      '<span style="font-family:DM Mono,monospace;font-size:11px;color:#94a3b8;padding:3px 10px;background:#1e293b;border-radius:40px;border:1px solid #334155;">С'+wk+' · '+yr+'</span>' +
      (isDraft ? '<span style="background:#f59e0b;color:#78350f;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;">✏ Чернова</span>' : '') +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      (canEdit() && bulMode!=='edit' ? '<button onclick="setBulEdit()" class="bbtn">✏️ Редактирай</button>' : '') +
      (canEdit() && bulMode==='edit'  ? '<button onclick="setBulView()" class="bbtn">👁 Преглед</button>' : '') +
      (canEdit() ? '<button onclick="setBulAnalysis()" class="bbtn">📊 Анализ</button>' : '') +
      (canEdit() ? '<button onclick="openPrintMenu()" class="bbtn">🖨 Печат</button>' : '') +
      (canEdit() && isDraft ? '<button onclick="publishBul()" style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">📤 Публикувай</button>' : '') +
      (canEdit() ? '<button onclick="openPushMenu()" style="background:#7c3aed;color:#fff;border:none;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Нотификации</button>' : '') +
      (canEdit() ? '<button onclick="newBulletin()" style="background:#2563eb;color:#fff;border:none;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">+ Нов</button>' : '') +
    '</div>' +
  '</div>';
}

/* ════════ VIEW MODE ════════════════════════════════════════ */

function bulSetDept(dk) {
  bulActiveDept = dk;
  renderBulletin();
}

function bulPrintDept(dk) {
  var d = DEPTS[dk];
  var panelEl = document.getElementById('dept-panel-' + dk);
  if (!panelEl) return;
  var win = window.open('', '_blank', 'width=800,height=600');
  win.document.write('<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">'+
    '<style>body{font-family:Arial,sans-serif;padding:20px;max-width:900px;margin:0 auto;}'+
    '.block{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:12px;}'+
    'h2{color:'+d.color+';border-bottom:2px solid '+d.hdr+';padding-bottom:8px;}'+
    '@media print{button{display:none!important;}}'+
    '</style></head><body>');
  win.document.write('<h2>'+d.icon+' '+d.label+' — Т-Бюлетин С'+(curBul?curBul.week_number:'')+'·'+new Date().getFullYear()+'</h2>');
  win.document.write(panelEl.innerHTML);
  win.document.write('<div style="text-align:center;margin-top:20px;"><button onclick="window.print()" style="background:'+d.hdr+';color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;">🖨 Принтирай / PDF</button></div>');
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.focus();}, 300);
}

function renderBulView(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  var c=curBul.content;
  var wk=curBul.week_number; var yr=curBul.year;
  var days=weekDays(wk,yr);
  var isDraft=curBul.status==='draft';
  var html=bulHdr(isDraft)+BULCSS+'<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;" id="bul-body">';

  /* Important */
  var imp=[];
  DCOLS.forEach(function(k){(c.columns[k]||[]).forEach(function(b){if(b.type==='important')imp.push(b);});});
  if(imp.length){
    html+='<div class="bcard" id="sec-important"><div class="bsec">⭐ Важно тази седмица</div><div style="display:flex;flex-wrap:wrap;gap:8px;">';
    imp.forEach(function(b){
      var ug=b.urgency||'info';
      var cl=({ok:'#f0fdf4:#bbf7d0:#166534',warn:'#fffbeb:#fde68a:#92400e',urgent:'#fff1f2:#fecaca:#991b1b',info:'#eff6ff:#bfdbfe:#1e40af'}[ug]||'#eff6ff:#bfdbfe:#1e40af').split(':');
      html+='<div style="background:'+cl[0]+';border:1px solid '+cl[1]+';border-radius:7px;padding:9px 12px;flex:1;min-width:180px;">';
      html+='<div style="font-size:12px;font-weight:600;color:'+cl[2]+';">'+esc(b.title||'')+'</div>';
      if(b.sub)html+='<div style="font-size:11px;color:'+cl[2]+';opacity:.75;">'+esc(b.sub)+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
  }

  /* Промоции */
  html+=renderPromotionsSection();

  /* Calendar */
  html+='<div class="bcard" id="sec-calendar">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html+='<div style="font-size:14px;font-weight:600;">📅 Седмичен календар — С'+wk+' · '+yr+'</div>';
  if(canEdit())html+='<button onclick="openCalModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави събитие</button>';
  html+='</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">';
  DKEYS.forEach(function(key,i){
    var isToday=days[i].toISOString().slice(0,10)===today();
    var dateStr=days[i].toISOString().slice(0,10);
    var dTasks=bulTasks.filter(function(t){return t.due_date&&t.due_date.slice(0,10)===dateStr;});
    var manual=c.calendar[key]||[];
    html+='<div style="border:1px solid '+(isToday?'#2563eb':'#e2e8f0')+';border-radius:7px;padding:10px 12px;min-height:90px;background:'+(isToday?'#eff6ff':'#fff')+'">';
    html+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">'+DNAMES[i]+'</div>';
    html+='<div style="font-family:DM Mono,monospace;font-size:19px;font-weight:500;color:'+(isToday?'#2563eb':'#0f172a')+';margin-bottom:6px;">'+fmtD(days[i])+'</div>';
    dTasks.forEach(function(t){
      var dc=(DEPTS[t.department]||{color:'#94a3b8'}).color;
      html+='<div style="display:flex;gap:4px;padding:2px 0;align-items:flex-start;"><span style="width:6px;height:6px;border-radius:50%;background:'+dc+';flex-shrink:0;margin-top:4px;"></span><span style="font-size:11px;font-weight:500;">'+esc(t.title||'')+'</span></div>';
    });
    manual.forEach(function(e,ei){
      var dc=({trade:'#166534',warehouse:'#1e40af',admin:'#5b21b6',general:'#64748b'}[e.dept])||'#64748b';
      html+='<div style="display:flex;gap:4px;padding:2px 0;align-items:flex-start;">';
      html+='<span style="width:6px;height:6px;border-radius:50%;background:'+dc+';flex-shrink:0;margin-top:4px;"></span>';
      html+='<span style="font-size:11px;flex:1;">'+esc(e.title||'')+'</span>';
      if(canEdit())html+='<button data-key="'+key+'" data-idx="'+ei+'" onclick="bulRmCal(this)" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:11px;padding:0;line-height:1;">✕</button>';
      html+='</div>';
    });
    if(!dTasks.length&&!manual.length)html+='<div style="font-size:11px;color:#cbd5e1;font-style:italic;margin-top:4px;">Свободен</div>';
    if(canEdit())html+='<button data-key="'+key+'" onclick="bulOpenCal(this)" style="width:100%;margin-top:5px;padding:3px;border:1px dashed #cbd5e1;border-radius:4px;background:none;color:#94a3b8;font-size:10px;cursor:pointer;font-family:inherit;">+ Добави</button>';
    html+='</div>';
  });
  html+='</div></div>';

  /* Задачи панел */
  html += renderTasksPanel();

  /* ── ОТДЕЛНИ ТАБОВЕ ПО ОТДЕЛ ── */
  /* Таб навигация */
  html+='<div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:0;border-bottom:2px solid #e2e8f0;">';
  DCOLS.forEach(function(dk){
    var d=DEPTS[dk];
    var isAct=dk===bulActiveDept;
    html+='<button data-dk="'+dk+'" onclick="bulSetDept(this.dataset.dk)" id="dtab-'+dk+'" ondragover="taskTabDragOver(event,this)" ondragleave="taskTabDragLeave(this)" ondrop="taskTabDrop(event,this)" style="'+
      'border:none;background:'+(isAct?d.hdr:'#f8fafc')+';color:'+(isAct?'#fff':d.color)+';'+
      'padding:10px 20px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;'+
      'border-radius:8px 8px 0 0;border-bottom:none;transition:all .15s;">'+
      d.icon+' '+d.label+
    '</button>';
  });
  /* Принтирай бутон вдясно */
  html+='<div style="margin-left:auto;padding-bottom:4px;">';
  DCOLS.forEach(function(dk){
    var d=DEPTS[dk];
    var isAct=dk===bulActiveDept;
    if(isAct){
      html+='<button onclick="bulPrintDept(\'' +dk+ '\')" style="border:1px solid '+d.hdr+';background:#fff;color:'+d.color+';border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🖨 Принтирай секцията</button>';
    }
  });
  html+='</div>';
  html+='</div>';

  /* Съдържание на активния таб */
  DCOLS.forEach(function(dk){
    var dept=DEPTS[dk];
    var blocks=(c.columns[dk]||[]).filter(function(b){return b.type!=='task'&&b.type!=='important';});
    var dTasks=bulTasks.filter(function(t){return t.department===dk;});
    var isMyDept=!isGlobal()&&myDept()===dk;
    var isAct=dk===bulActiveDept;
    html+='<div id="dept-panel-'+dk+'" style="display:'+(isAct?'block':'none')+';">';
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:16px 20px;min-height:200px;">';
    /* Задачи */
    if(dTasks.length){
      html+='<div style="margin-bottom:14px;">';
      html+='<div style="font-size:12px;font-weight:700;color:'+dept.color+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">✅ Задачи</div>';
      var store=currentUser&&currentUser.store_name;
      dTasks.forEach(function(t){
        var done=store&&bulComps.some(function(cc){return cc.task_id===t.id&&cc.store_name===store;});
        var due=t.due_date?new Date(t.due_date):null;
        var today=new Date();today.setHours(0,0,0,0);
        var diff=due?Math.ceil((due-today)/86400000):null;
        var dueColor=diff===null?'#94a3b8':diff<0?'#dc2626':diff<=2?'#d97706':'#94a3b8';
        html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;'+(canEdit()?'cursor:grab;':'')+'"'+(canEdit()?' draggable="true" data-tid="'+t.id+'" ondragstart="taskDragStart(event,this)" ondragend="taskDragEnd(this)"':'')+'>';
        if(canEdit())html+='<span style="color:#cbd5e1;font-size:13px;margin-top:3px;flex-shrink:0;" title="Провлачи върху таб, за да преместиш отдела">⠿</span>';
        html+='<input type="checkbox" '+(done?'checked ':'')+' data-tid="'+t.id+'" onchange="bulToggleTask(this)" style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:'+dept.color+';flex-shrink:0;">';
        html+='<div style="flex:1;"><div style="font-size:13px;font-weight:500;color:'+(done?'#94a3b8':'#0f172a')+';'+(done?'text-decoration:line-through;':'')+'">'+esc(t.title||'')+'</div>';
        if(t.description)html+='<div style="font-size:11px;color:#94a3b8;">'+esc(t.description)+'</div>';
        if(due)html+='<div style="font-size:10px;color:'+dueColor+';margin-top:2px;">📅 Срок: '+due.toLocaleDateString('bg-BG')+(diff<0?' ⚠️':diff===0?' (Днес!)':diff<=2?' ('+diff+' дни)':'')+"</div>";
        html+=renderTaskAttachments(t);
        html+=renderSubtasks(t.id, dk);
        html+='</div>';
        if(canEdit()){html+='<div style="display:flex;gap:4px;flex-shrink:0;">'
          +'<button data-task-id="'+t.id+'" onclick="openEditTaskModal(this.dataset.taskId)" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#2563eb;">✏️</button>'
          +'<button data-task-id="'+t.id+'" onclick="bulDelTask(this)" style="border:1px solid #fecaca;background:#fff5f5;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#dc2626;">✕</button>'
          +'</div>';}
        html+='</div>';
      });
      html+='</div>';
    }
    /* Постоянни задачи в dept panel */
    html += renderRecurringTasks(dk);
    /* Блокове */
    if(!blocks.length&&!dTasks.length){
      html+='<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px;">Няма информация за тази секция тази седмица.</div>';
    } else {
      blocks.forEach(function(b,i){html+=editBlock(b,dk,i);});
    }
    if(canEdit()){
      html+='<div style="display:flex;gap:8px;margin-top:8px;">';
      html+='<button class="addblk" data-dept="'+dk+'" onclick="bulOpenPicker(this)">+ Добави блок</button>';
      html+='<button onclick="openTaskModalForDept(\'' +dk+ '\')" style="border:1px dashed #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">✅ + Добави задача</button>';
      html+='</div>';
    }
    html+='</div></div>';
  });

  html+=blockPickerHtml()+taskModalHtml()+calModalHtml()+pushMenuHtml()+printMenuHtml();
  wrap.innerHTML=html;
}



/* Edit block */
/* Превръща http(s):// линкове в текста в кликаеми <a> тагове (текстът вече е escape-нат за безопасност) */
function linkify(text){
  var escaped=esc(text||'');
  return escaped.replace(/(https?:\/\/[^\s<]+)/g,function(url){
    var trail='';
    var m=url.match(/[.,;:!?)]+$/);
    if(m){trail=m[0]; url=url.slice(0,url.length-trail.length);}
    return '<a href="'+url+'" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;word-break:break-all;">'+url+'</a>'+trail;
  });
}

/* ═══════ ДОПЪЛНИТЕЛНА СНИМКА/ФАЙЛ В ЕДИН БЛОК (заедно с текста му) ══════ */
function renderBlockExtras(b,dk){
  var isEditing=canEdit()&&bulMode==='edit';
  var h='';
  var hasExtra=b.image_url||b.file_url;
  if(hasExtra)h+='<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">';
  if(b.image_url){
    h+='<div style="position:relative;">';
    h+='<img src="'+b.image_url+'" style="max-width:140px;max-height:100px;border-radius:6px;border:1px solid #e2e8f0;display:block;" onerror="bulImgErr(this)">';
    if(isEditing)h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulRemoveBlockImage(this.dataset.col,this.dataset.id)" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:10px;cursor:pointer;">✕</button>';
    h+='</div>';
  }
  if(b.file_url){
    h+='<div style="position:relative;">';
    h+='<a href="'+b.file_url+'" target="_blank" style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;">📎 '+esc(b.file_name||'Файл')+'</a>';
    if(isEditing)h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulRemoveBlockFile(this.dataset.col,this.dataset.id)" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:10px;cursor:pointer;">✕</button>';
    h+='</div>';
  }
  if(hasExtra)h+='</div>';
  if(isEditing){
    h+='<div style="display:flex;gap:6px;margin-top:6px;">';
    if(!b.image_url)h+='<label style="display:inline-flex;align-items:center;gap:3px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">📷 + Снимка<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadBlockImage(this)"></label>';
    if(!b.file_url)h+='<label style="display:inline-flex;align-items:center;gap:3px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">📎 + Файл<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadBlockFile(this)"></label>';
    h+='</div>';
  }
  return h;
}
function bulUploadBlockImage(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  var path='bulletin/'+curBul.id+'/'+id+'_extra_'+Date.now()+'.'+ext;
  showBulToast('⏳ Качване на снимка...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.image_url=pub; schedSave(); renderBulletin(); toast('✅ Снимката е добавена!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function bulRemoveBlockImage(col,id){
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.image_url=''; schedSave(); renderBulletin();}
}
function bulUploadBlockFile(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var path='bulletin/'+curBul.id+'/'+id+'_extrafile_'+Date.now()+'.'+ext;
  showBulToast('⏳ Качване на файл...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.file_url=pub; b.file_name=file.name; schedSave(); renderBulletin(); toast('✅ Файлът е добавен!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function bulRemoveBlockFile(col,id){
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.file_url=''; b.file_name=''; schedSave(); renderBulletin();}
}

function editBlock(b,dk,i){
  var tl={text:'📝 Текст',alert:'🚨 Алерт',list:'📋 Списък',image:'📷 Снимка',file:'📎 Файл',divider:'— Разделител',important:'⭐ Важно'}[b.type]||b.type;
  var isEditing=canEdit()&&bulMode==='edit';
  var h='<div class="blk" id="eb-'+b.id+'" draggable="true" data-col="'+dk+'" data-idx="'+i+'" ondragstart="bulDragStart(this)" ondragover="bulDragOver(this)" ondragleave="bulDragLeave(this)" ondrop="bulDropBlock(this)">';
  h+='<button class="blk-del" data-col="'+dk+'" data-id="'+b.id+'" onclick="bulDelBlock(this)">✕</button>';
  h+='<div class="blk-type">'+tl+'</div>';

  if(b.type==='text'){
    if(isEditing){
      h+='<textarea class="blk-ta" rows="3" placeholder="Въведи текст... (линковете стават кликаеми в изглед за преглед)" data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
    }else{
      h+='<div style="font-size:13px;color:#0f172a;white-space:pre-wrap;line-height:1.5;">'+linkify(b.content||'')+'</div>';
    }
    h+=renderBlockExtras(b,dk);
  }else if(b.type==='divider'){
    h+='<hr style="border:none;border-top:1px solid #e2e8f0;">';
  }else if(b.type==='list'){
    if(isEditing){
      h+='<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Всеки ред = нова точка (линковете стават кликаеми в изглед за преглед)</div>';
      h+='<textarea class="blk-ta" rows="4" placeholder="Ред 1..." data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
    }else{
      var items=(b.content||'').split('\n').filter(Boolean);
      h+='<ul style="margin:0;padding-left:18px;">'+items.map(function(it){return '<li style="font-size:13px;color:#0f172a;padding:2px 0;">'+linkify(it)+'</li>';}).join('')+'</ul>';
    }
    h+=renderBlockExtras(b,dk);
  }else if(b.type==='alert'){
    if(isEditing){
      var cOpts=[['red','🔴 Червено'],['amb','🟡 Жълто'],['grn','🟢 Зелено'],['blu','🔵 Синьо'],['pur','🟣 Лилаво']];
      h+='<select data-col="'+dk+'" data-id="'+b.id+'" data-field="color" onchange="bulSetBlk(this)" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;width:100%;">';
      cOpts.forEach(function(o){h+='<option value="'+o[0]+'"'+(b.color===o[0]?' selected':'')+'>'+o[1]+'</option>';});
      h+='</select><br>';
      h+='<input placeholder="Заглавие (по избор)" value="'+esc(b.label||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="label" oninput="bulSetBlk(this)" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;margin-bottom:4px;font-family:inherit;box-sizing:border-box;"><br>';
      h+='<textarea class="blk-ta" rows="2" placeholder="Съдържание... (линковете стават кликаеми в изглед за преглед)" data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
    }else{
      var aC={red:'#fff1f2:#dc2626:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#16a34a:#14532d',blu:'#eff6ff:#2563eb:#1e40af',pur:'#f5f3ff:#8b5cf6:#4c1d95'}[b.color||'blu']||'#eff6ff:#2563eb:#1e40af';
      var aC2=aC.split(':');
      h+='<div style="background:'+aC2[0]+';border-left:3px solid '+aC2[1]+';color:'+aC2[2]+';border-radius:0 6px 6px 0;padding:8px 12px;">'+
         (b.label?'<div style="font-size:10px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">'+esc(b.label)+'</div>':'')+
         '<div style="font-size:13px;white-space:pre-wrap;">'+linkify(b.content||'')+'</div></div>';
    }
    h+=renderBlockExtras(b,dk);
  }else if(b.type==='important'){
    var uOpts=[['ok','✅ OK'],['warn','⚠️ Предупреждение'],['urgent','🔴 Спешно'],['info','ℹ️ Инфо']];
    h+='<select data-col="'+dk+'" data-id="'+b.id+'" data-field="urgency" onchange="bulSetBlk(this)" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;width:100%;">';
    uOpts.forEach(function(o){h+='<option value="'+o[0]+'"'+(b.urgency===o[0]?' selected':'')+'>'+o[1]+'</option>';});
    h+='</select><br>';
    h+='<input placeholder="Заглавие *" value="'+esc(b.title||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="title" oninput="bulSetBlk(this)" style="width:100%;font-size:13px;font-weight:600;border:1px solid #e2e8f0;border-radius:5px;padding:5px 7px;margin-bottom:4px;font-family:inherit;box-sizing:border-box;"><br>';
    h+='<input placeholder="Подзаглавие (по избор)" value="'+esc(b.sub||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="sub" oninput="bulSetBlk(this)" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-family:inherit;box-sizing:border-box;"><br>';
    h+='<div style="font-size:10px;color:#f59e0b;margin-top:4px;">⭐ → показва се в секция Важно</div>';
  }else if(b.type==='image'){
    var sizes=[['33','1/3'],['50','1/2'],['66','2/3'],['100','Пълна']];
    h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">';
    sizes.forEach(function(s){
      var active=String(b.width||100)===s[0];
      h+='<button data-col="'+dk+'" data-id="'+b.id+'" data-w="'+s[0]+'" onclick="bulSetWidth(this)" style="border:1px solid '+(active?'#2563eb':'#e2e8f0')+';background:'+(active?'#eff6ff':'#fff')+';color:'+(active?'#2563eb':'#64748b')+';border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">'+s[1]+'</button>';
    });
    h+='</div>';
    if(b.url){
      h+='<img src="'+b.url+'" style="width:'+(b.width||100)+'%;border-radius:7px;display:block;margin-bottom:4px;" onerror="bulImgErr(this)">'; 
      h+='<input placeholder="Подпис (по избор)" value="'+esc(b.caption||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="caption" oninput="bulSetBlk(this)" style="width:100%;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 7px;font-family:inherit;box-sizing:border-box;"><br>';
      h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulClearImg(this)" style="margin-top:4px;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕ Смени снимката</button>';
    }else{
      h+='<label style="display:flex;flex-direction:column;align-items:center;padding:18px;border:1.5px dashed #cbd5e1;border-radius:7px;cursor:pointer;color:#64748b;font-size:12px;">';
      h+='<span style="font-size:30px;margin-bottom:6px;">📷</span>Избери снимка (JPG / PNG / GIF)';
      h+='<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadImg(this)">';
      h+='</label>';
    }
  }else if(b.type==='file'){
    if(b.url){
      h+='<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:6px;"><span style="font-size:20px;">📎</span><div style="flex:1;"><div style="font-size:12px;font-weight:500;">'+esc(b.filename||'Файл')+'</div><a href="'+b.url+'" target="_blank" style="font-size:11px;color:#2563eb;">Изтегли</a></div>';
      h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulClearFile(this)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕</button></div>';
    }else{
      h+='<label style="display:flex;flex-direction:column;align-items:center;padding:18px;border:1.5px dashed #cbd5e1;border-radius:7px;cursor:pointer;color:#64748b;font-size:12px;">';
      h+='<span style="font-size:30px;margin-bottom:6px;">📎</span>Избери файл (PDF / Word / Excel)';
      h+='<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadFile(this)">';
      h+='</label>';
    }
  }
  h+='</div>';
  return h;
}

/* DATA ATTR HANDLERS */
function bulSetBlk(el){
  var col=el.getAttribute('data-col'), id=el.getAttribute('data-id'), field=el.getAttribute('data-field');
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b[field]=el.value; schedSave();}
}
function bulSetWidth(btn){
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id'), w=parseInt(btn.getAttribute('data-w'));
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.width=w; schedSave(); renderBulletin();}
}
function bulClearImg(btn){
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id');
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.url=''; schedSave(); renderBulletin();}
}
function bulClearFile(btn){
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id');
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.url='';b.filename=''; schedSave(); renderBulletin();}
}
function bulDelBlock(btn){
  if(!confirm('Изтрий блока?'))return;
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id');
  curBul.content.columns[col]=curBul.content.columns[col].filter(function(b){return b.id!==id;});
  schedSave(); renderBulletin();
}
function bulDelTask(btn){
  var id=btn.getAttribute('data-task-id');
  if(!confirm('Изтрий задачата?'))return;
  sbDelete('bulletin_tasks','id=eq.'+id).then(function(){toast('Изтрита');loadBulletin();});
}
function bulRmCal(btn){
  var key=btn.getAttribute('data-key'), idx=parseInt(btn.getAttribute('data-idx'));
  curBul.content.calendar[key].splice(idx,1); schedSave(); renderBulletin();
}
function bulOpenCal(btn){openCalModal(btn.getAttribute('data-key'));}
function bulOpenPicker(btn){openBlockPicker(btn.getAttribute('data-dept'));}

/* DRAG DROP */

function bulImgErr(img){img.outerHTML='<div style="color:#dc2626;font-size:11px;padding:8px;">Снимката не се зарежда</div>';}
function bulDragOver(el){event.preventDefault();el.classList.add('drag-hi');}
function bulDragLeave(el){el.classList.remove('drag-hi');}
function bulDragStart(el){dragInfo={col:el.getAttribute('data-col'),idx:parseInt(el.getAttribute('data-idx'))};}
function bulDropBlock(el){
  if(!dragInfo)return;
  var tCol=el.getAttribute('data-col'), tIdx=parseInt(el.getAttribute('data-idx'));
  el.classList.remove('drag-hi');
  var c=curBul.content;
  var bl=c.columns[dragInfo.col].splice(dragInfo.idx,1)[0];
  if(!bl){dragInfo=null;return;}
  c.columns[tCol].splice(tIdx,0,bl);
  dragInfo=null; schedSave(); renderBulletin();
}
function bulDropCol(el){
  if(!dragInfo)return;
  var tCol=el.getAttribute('data-col');
  var c=curBul.content;
  var bl=c.columns[dragInfo.col].splice(dragInfo.idx,1)[0];
  if(!bl){dragInfo=null;return;}
  c.columns[tCol].push(bl);
  dragInfo=null; schedSave(); renderBulletin();
}

/* BLOCK PICKER */
var _pkDept=null;
function openBlockPicker(dept){_pkDept=dept; document.getElementById('bp-ov').classList.add('open');}
function closeBlockPicker(){document.getElementById('bp-ov').classList.remove('open');}
function addBlock(type){
  closeBlockPicker();
  if(!_pkDept){console.error('addBlock: _pkDept is null');toast('Грешка: не е избран отдел','#dc2626');return;}
  if(!curBul||!curBul.content||!curBul.content.columns){console.error('addBlock: curBul not ready');return;}
  if(!curBul.content.columns[_pkDept]){curBul.content.columns[_pkDept]=[];}
  var b={id:genId(),type:type,content:''};
  if(type==='alert')b.color='blu';
  if(type==='important')b.urgency='info';
  if(type==='image')b.width=100;
  curBul.content.columns[_pkDept].push(b);
  console.log('addBlock: added',type,'to',_pkDept,'total blocks:',curBul.content.columns[_pkDept].length);
  /* Switch to edit mode so the new block is editable */
  bulMode='edit';
  bulActiveDept=_pkDept;
  schedSave(); renderBulletin();
}
function blockPickerHtml(){
  var types=[
    ['text','📝','Текст','Параграф'],
    ['alert','🚨','Алерт','Цветна кутия'],
    ['important','⭐','Важно','→ секция горе'],
    ['list','📋','Списък','Точки с информация'],
    ['image','📷','Снимка','JPG / PNG'],
    ['file','📎','Файл','PDF / Word / Excel'],
    ['divider','—','Разделител','Хоризонтална линия']
  ];
  var h='<div class="bov" id="bp-ov"><div class="bmod" style="width:520px;">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
  h+='<div style="font-size:15px;font-weight:600;">Избери тип блок</div>';
  h+='<button onclick="closeBlockPicker()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>';
  h+='</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">';
  types.forEach(function(t){
    h+='<button type="button" data-btype="'+t[0]+'" onclick="addBlock(this.dataset.btype)" style="border:1px solid #e2e8f0;border-radius:9px;padding:12px 14px;cursor:pointer;background:#fff;text-align:left;font-family:inherit;transition:border-color .15s;">';
    h+='<div style="font-size:20px;margin-bottom:4px;">'+t[1]+'</div>';
    h+='<div style="font-size:13px;font-weight:600;color:#0f172a;">'+t[2]+'</div>';
    h+='<div style="font-size:11px;color:#64748b;">'+t[3]+'</div>';
    h+='</button>';
  });
  h+='</div></div></div>';
  return h;
}


/* FILE UPLOAD */
function bulUploadImg(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  var fname=id+'_'+Date.now()+'.'+ext;
  var path='bulletin/'+curBul.id+'/'+fname;
  showBulToast('⏳ Качване на снимка...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      return r.text().then(function(txt){return {ok:r.ok,status:r.status,txt:txt};});
    }).then(function(res){
      if(!res.ok){
        var msg='';
        try{msg=JSON.parse(res.txt).message||JSON.parse(res.txt).error||res.txt;}catch(e){msg=res.txt;}
        toast('Грешка '+res.status+': '+msg,'#dc2626');
        console.error('Upload error:',res);
        return;
      }
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.url=pub; schedSave(); renderBulletin(); toast('✅ Снимката е качена!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');console.error(err);});
  };
  reader.readAsArrayBuffer(file);
}
function bulUploadFile(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname=id+'_file_'+Date.now()+'.'+ext;
  var path='bulletin/'+curBul.id+'/'+fname;
  showBulToast('⏳ Качване на файл...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      return r.text().then(function(txt){return {ok:r.ok,status:r.status,txt:txt};});
    }).then(function(res){
      if(!res.ok){
        var msg='';
        try{msg=JSON.parse(res.txt).message||JSON.parse(res.txt).error||res.txt;}catch(e){msg=res.txt;}
        toast('Грешка '+res.status+': '+msg,'#dc2626');
        return;
      }
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.url=pub;b.filename=file.name; schedSave(); renderBulletin(); toast('✅ Файлът е качен!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');console.error(err);});
  };
  reader.readAsArrayBuffer(file);
}

/* CALENDAR MODAL */
function calModalHtml(){
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var yr=curBul?curBul.year:new Date().getFullYear();
  var days=weekDays(wk,yr);
  var opts=DKEYS.map(function(k,i){return '<option value="'+k+'">'+DNAMES[i]+' ('+fmtD(days[i])+')</option>';}).join('');
  return '<div class="bov" id="cal-ov"><div class="bmod" style="width:420px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">📅 Добави събитие в календара</div>' +
    '<label class="fl">Ден</label><select class="fi" id="cal-day">'+opts+'</select>' +
    '<label class="fl">Заглавие</label><input class="fi" id="cal-title" placeholder="напр. Инвентаризация на склада">' +
    '<label class="fl">Описание (по избор)</label><input class="fi" id="cal-desc" placeholder="Допълнителна информация">' +
    '<label class="fl">Отдел</label><select class="fi" id="cal-dept"><option value="general">— Общо</option><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад</option><option value="admin">⚙️ Администрация</option></select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="closeCal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitCal()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div></div>';
}
function openCalModal(dayKey){
  document.getElementById('cal-ov').classList.add('open');
  document.getElementById('cal-title').value='';
  document.getElementById('cal-desc').value='';
  if(dayKey){var sel=document.getElementById('cal-day');if(sel)sel.value=dayKey;}
}
function closeCal(){document.getElementById('cal-ov').classList.remove('open');}
function submitCal(){
  var title=(document.getElementById('cal-title').value||'').trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  var key=document.getElementById('cal-day').value;
  curBul.content.calendar[key]=curBul.content.calendar[key]||[];
  curBul.content.calendar[key].push({title:title,desc:document.getElementById('cal-desc').value,dept:document.getElementById('cal-dept').value});
  closeCal(); schedSave(); renderBulletin(); toast('✅ Добавено!');
}

/* TASK MODAL */
function taskModalHtml(){
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var yr=curBul?curBul.year:new Date().getFullYear();
  var days=weekDays(wk,yr);
  var opts='<option value="">— Без срок —</option>'+DKEYS.map(function(k,i){return '<option value="'+days[i].toISOString().slice(0,10)+'">'+DNAMES[i]+' ('+fmtD(days[i])+')</option>';}).join('');
  return '<div class="bov" id="tk-ov"><div class="bmod" style="width:460px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✅ Нова задача</div>' +
    '<label class="fl">Заглавие *</label><input class="fi" id="tk-title" placeholder="напр. Провери наличностите">' +
    '<label class="fl">Описание</label><input class="fi" id="tk-desc" placeholder="Допълнителна информация">' +
    '<label class="fl">Отдел</label><select class="fi" id="tk-dept"><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад/Приемане</option><option value="admin">⚙️ Администрация</option></select>' +
    '<label class="fl">Срок — ден от седмицата</label><select class="fi" id="tk-due">'+opts+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="closeTk()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitTask()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави задача</button>' +
    '</div></div></div>';
}
function openTaskModalForDept(dk){
  openTaskModal();
  var sel=document.getElementById('tk-dept');
  if(sel)sel.value=dk;
}

/* ─── РЕДАКЦИЯ НА ЗАДАЧА ───────────────────────────────────── */
function openEditTaskModal(taskId) {
  var t = bulTasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) { toast('Задачата не е намерена','#dc2626'); return; }
  var wk = curBul ? curBul.week_number : weekNum(new Date());
  var yr = curBul ? curBul.year : new Date().getFullYear();
  var days = weekDays(wk, yr);
  var dueOpts = '<option value="">— Без срок —</option>' +
    DKEYS.map(function(k,i){
      var val = days[i].toISOString().slice(0,10);
      var sel = t.due_date && t.due_date.slice(0,10) === val ? ' selected' : '';
      return '<option value="'+val+'"'+sel+'>'+DNAMES[i]+' ('+fmtD(days[i])+')</option>';
    }).join('');
  var existing = document.getElementById('edit-tk-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'edit-tk-ov';
  ov.innerHTML =
    '<div class="bmod" style="width:460px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✏️ Редактирай задача</div>' +
    '<label class="fl">Заглавие *</label>' +
    '<input class="fi" id="etk-title" value="'+esc(t.title||'')+'">' +
    '<label class="fl">Описание</label>' +
    '<input class="fi" id="etk-desc" value="'+esc(t.description||'')+'">' +
    '<label class="fl">Отдел</label>' +
    '<select class="fi" id="etk-dept">' +
      '<option value="trade"'+(t.department==='trade'?' selected':'')+'>🛒 Търговска</option>' +
      '<option value="warehouse"'+(t.department==='warehouse'?' selected':'')+'>📦 Склад/Приемане</option>' +
      '<option value="admin"'+(t.department==='admin'?' selected':'')+'>⚙️ Администрация</option>' +
    '</select>' +
    '<label class="fl">Срок — ден от седмицата</label>' +
    '<select class="fi" id="etk-due">'+dueOpts+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="var e=document.getElementById(&#39;edit-tk-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-task-id="'+taskId+'" onclick="submitEditTask(this.dataset.taskId)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var el=document.getElementById('etk-title'); if(el)el.focus(); }, 80);
}

function submitEditTask(taskId) {
  var title = (document.getElementById('etk-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var dept = document.getElementById('etk-dept').value;
  var desc = document.getElementById('etk-desc').value||'';
  var due  = document.getElementById('etk-due').value||null;
  sbPatch('bulletin_tasks','id=eq.'+taskId,{title:title,description:desc,department:dept,due_date:due}).then(function(r){
    if (!r.ok) { toast('Грешка при запис','#dc2626'); return; }
    var el = document.getElementById('edit-tk-ov');
    if (el) el.remove();
    toast('✅ Задачата е обновена!');
    loadBulletin();
  });
}

/* ─── РЕДАКЦИЯ НА ПОСТОЯННА ЗАДАЧА ───────────────────────── */
function openEditRecurringModal(taskId) {
  var t = recurringTasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) { toast('Задачата не е намерена','#dc2626'); return; }
  var existing = document.getElementById('edit-rec-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'edit-rec-ov';
  ov.innerHTML =
    '<div class="bmod" style="width:420px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✏️ Редактирай постоянна задача</div>' +
    '<label class="fl">Заглавие *</label>' +
    '<input class="fi" id="erec-title" value="'+esc(t.title||'')+'">' +
    '<label class="fl">Описание</label>' +
    '<input class="fi" id="erec-desc" value="'+esc(t.description||'')+'">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Повтарящ се ден</label><select class="fi" id="erec-weekday">'+recWeekdayOpts(t.due_weekday)+'</select></div>' +
    '<div><label class="fl">Час (по избор)</label><input type="time" class="fi" id="erec-time" value="'+esc(t.due_time||'')+'"></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="var e=document.getElementById(&#39;edit-rec-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-task-id="'+taskId+'" onclick="submitEditRecurring(this.dataset.taskId)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var el=document.getElementById('erec-title'); if(el)el.focus(); }, 80);
}

function submitEditRecurring(taskId) {
  var title = (document.getElementById('erec-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var desc = document.getElementById('erec-desc').value||'';
  var wdRaw = document.getElementById('erec-weekday').value;
  var due_weekday = wdRaw==='' ? null : parseInt(wdRaw,10);
  var due_time = document.getElementById('erec-time').value || null;
  sbPatch('recurring_tasks','id=eq.'+taskId,{title:title,description:desc,due_weekday:due_weekday,due_time:due_time}).then(function(r){
    if (!r.ok) { toast('Грешка при запис','#dc2626'); return; }
    var el = document.getElementById('edit-rec-ov');
    if (el) el.remove();
    toast('✅ Задачата е обновена!');
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

function deleteRecurring(taskId) {
  if (!confirm('Изтрий постоянната задача завинаги?')) return;
  sbDelete('recurring_tasks','id=eq.'+taskId).then(function(r){
    if (!r.ok) { toast('Грешка при изтриване','#dc2626'); return; }
    toast('🗑 Постоянната задача е изтрита');
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

function openTaskModal(){document.getElementById('tk-ov').classList.add('open');document.getElementById('tk-title').value='';document.getElementById('tk-desc').value='';}
function closeTk(){document.getElementById('tk-ov').classList.remove('open');}
function submitTask(){
  var title=(document.getElementById('tk-title').value||'').trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  sbPost('bulletin_tasks',{bulletin_id:curBul.id,week_number:curBul.week_number,year:curBul.year,department:document.getElementById('tk-dept').value,title:title,description:document.getElementById('tk-desc').value,due_date:document.getElementById('tk-due').value||null}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    closeTk(); toast('✅ Задачата е добавена!'); loadBulletin();
  });
}

/* ═══════ ПРИКАЧЕНИ ФАЙЛОВЕ КЪМ ПОСТОЯННИ ЗАДАЧИ ══════════════ */
function renderRecurringAttachments(t){
  var atts=normAttachments(t.attachments);
  var h='';
  if(atts.length){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;">';
    atts.forEach(function(a,i){
      h+='<div style="position:relative;">';
      if(a.type==='image'){
        h+='<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
      }else{
        h+='<a href="'+a.url+'" target="_blank" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;max-width:110px;">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.filename||'Файл')+'</span></a>';
      }
      if(canEdit())h+='<button data-rtid="'+t.id+'" data-idx="'+i+'" onclick="recurringRemoveAttachment(this.dataset.rtid,this.dataset.idx)" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(canEdit()){
    h+='<label style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">'+
      '📎 + Снимка/файл<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-rtid="'+t.id+'" onchange="recurringUploadAttachment(this)"></label>';
  }
  return h;
}
function recurringUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  var rtid=input.getAttribute('data-rtid');
  var t=recurringTasks.find(function(x){return String(x.id)===String(rtid);});
  if(!t)return;
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname='rec_'+rtid+'_'+Date.now()+'.'+ext;
  var path='bulletin-tasks/'+fname;
  showBulToast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var atts=normAttachments(t.attachments).slice();
      atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
      sbPatch('recurring_tasks','id=eq.'+rtid,{attachments:atts}).then(function(res){
        if(!res.ok){toast('Грешка при запис','#dc2626');return;}
        t.attachments=atts; renderBulletin(); toast('✅ Прикачено!');
      });
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function recurringRemoveAttachment(rtid,idx){
  var t=recurringTasks.find(function(x){return String(x.id)===String(rtid);});
  if(!t)return;
  var atts=normAttachments(t.attachments).slice();
  atts.splice(idx,1);
  sbPatch('recurring_tasks','id=eq.'+rtid,{attachments:atts}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    t.attachments=atts; renderBulletin(); toast('✓ Премахнато');
  });
}

/* ═══════ ПРИКАЧЕНИ ФАЙЛОВЕ КЪМ ЗАДАЧИ ══════════════════════ */
function normAttachments(atts){
  if(typeof atts==='string'){try{atts=JSON.parse(atts);}catch(e){atts=[];}}
  return Array.isArray(atts)?atts:[];
}
function renderTaskAttachments(t){
  var atts=normAttachments(t.attachments);
  var h='';
  if(atts.length){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;">';
    atts.forEach(function(a,i){
      h+='<div style="position:relative;">';
      if(a.type==='image'){
        h+='<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
      }else{
        h+='<a href="'+a.url+'" target="_blank" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;max-width:110px;">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.filename||'Файл')+'</span></a>';
      }
      if(canEdit())h+='<button data-tid="'+t.id+'" data-idx="'+i+'" onclick="taskRemoveAttachment(this.dataset.tid,this.dataset.idx)" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(canEdit()){
    h+='<label style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">'+
      '📎 + Снимка/файл<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-tid="'+t.id+'" onchange="taskUploadAttachment(this)"></label>';
  }
  return h;
}
function taskUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  var tid=input.getAttribute('data-tid');
  var t=bulTasks.find(function(x){return String(x.id)===String(tid);});
  if(!t)return;
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname=tid+'_'+Date.now()+'.'+ext;
  var path='bulletin-tasks/'+fname;
  showBulToast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var atts=normAttachments(t.attachments).slice();
      atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
      sbPatch('bulletin_tasks','id=eq.'+tid,{attachments:atts}).then(function(res){
        if(!res.ok){toast('Грешка при запис','#dc2626');return;}
        t.attachments=atts; renderBulletin(); toast('✅ Прикачено!');
      });
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function taskRemoveAttachment(tid,idx){
  var t=bulTasks.find(function(x){return String(x.id)===String(tid);});
  if(!t)return;
  var atts=normAttachments(t.attachments).slice();
  atts.splice(idx,1);
  sbPatch('bulletin_tasks','id=eq.'+tid,{attachments:atts}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    t.attachments=atts; renderBulletin(); toast('✓ Премахнато');
  });
}

/* ═══════ ПРЕМЕСТВАНЕ НА ЗАДАЧА МЕЖДУ ТАБОВЕ (drag&drop) ══════ */
var _taskDragId = null;
function taskDragStart(e,el){
  _taskDragId=el.getAttribute('data-tid');
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',_taskDragId);}catch(err){}
}
function taskDragEnd(el){_taskDragId=null;}
function taskTabDragOver(e,btn){
  if(!_taskDragId)return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  btn.style.outline='2px dashed #2563eb';
  btn.style.outlineOffset='-2px';
}
function taskTabDragLeave(btn){btn.style.outline='';}
function taskTabDrop(e,btn){
  e.preventDefault();
  btn.style.outline='';
  var tid=_taskDragId; _taskDragId=null;
  if(!tid)return;
  var newDept=btn.getAttribute('data-dk');
  var t=bulTasks.find(function(x){return String(x.id)===String(tid);});
  if(!t||t.department===newDept)return;
  sbPatch('bulletin_tasks','id=eq.'+tid,{department:newDept}).then(function(res){
    if(!res.ok){toast('Грешка при преместване','#dc2626');return;}
    t.department=newDept; renderBulletin();
    toast('✅ Преместено в '+((DEPTS[newDept]||{}).label||newDept));
  });
}

/* PUBLISH / NEW */
function publishBul(){
  if(!curBul||!confirm('Публикувай бюлетина за всички потребители?'))return;
  sbPatch('bulletins','id=eq.'+curBul.id,{status:'published',published_at:new Date().toISOString(),published_by:currentUser.display_name||currentUser.email}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('📤 Бюлетинът е публикуван!');
    bulMode='view'; loadBulletin();
  });
}
function newBulletin(){
  var now=new Date(); var wk=weekNum(now); var yr=now.getFullYear();
  if(!confirm('Нов бюлетин за Седмица '+wk+' · '+yr+'?'))return;
  var cal={};DKEYS.forEach(function(k){cal[k]=[];});
  sbPost('bulletins',{week_number:wk,year:yr,title:'Т-Бюлетин С'+wk+' · '+yr,content:{calendar:cal,columns:{trade:[],warehouse:[],admin:[]}},status:'draft'}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Нов бюлетин е създаден!'); bulMode='edit'; loadBulletin();
  });
}

/* ─── EMAIL MENU ─────────────────────────────────────────── */
function emailMenuHtml(){
  return '<div class="bov" id="em-ov"><div class="bmod" style="width:400px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">📧 Имейл нотификации</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;">'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">📋 Седмичен дайджест</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпраща задачите за седмицата до всички управители.</div>'+
      '<button onclick="sendWeeklyDigest(curBul,bulTasks,function(){closeEmailMenu();loadBulletin();})" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати до всички магазини</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">⚠️ Просрочени задачи</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпраща до регионални и контролинг за неизпълнените задачи.</div>'+
      '<button onclick="sendOverdueAlerts(curBul,bulTasks,bulComps,function(){closeEmailMenu();loadBulletin();})" style="border:none;background:#dc2626;color:#fff;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати нотификации</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">🔬 Тестов имейл</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпрати тест до твоя имейл за проверка.</div>'+
      '<div style="display:flex;gap:6px;">'+
      '<input id="test-email-inp" placeholder="твоя@имейл.com" value="'+(currentUser?currentUser.email:'')+'" style="flex:1;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:5px 8px;font-family:inherit;">'+
      '<button onclick="bulSendTest()" style="border:none;background:#16a34a;color:#fff;border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;">Изпрати</button>'+
      '</div>'+
    '</div>'+
    '</div>'+
    '<button onclick="closeEmailMenu()" style="width:100%;margin-top:12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;color:#64748b;">Затвори</button>'+
    '</div></div>';
}
function bulSendTest(){var inp=document.getElementById('test-email-inp');if(inp)sendTestEmail(inp.value);}

function pushMenuHtml(){
  return '<div class="bov" id="pm2-ov"><div class="bmod" style="width:420px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">🔔 Push нотификации</div>'+
    '<div style="display:flex;flex-direction:column;gap:10px;">'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">📰 Бюлетин публикуван</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">До всички потребители на портала.</div>'+
      '<button onclick="pushBulletinPublished(curBul.week_number,curBul.year,bulTasks.length);closePushMenu();" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати до всички</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">⚠️ Просрочени задачи</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">До регионалните и контролинг.</div>'+
      '<button onclick="sendPushOverdueNow();closePushMenu();" style="border:none;background:#dc2626;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Изпрати нотификация</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">📅 Днешни срокове</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Задачи, под-задачи и постоянни задачи със срок днес — до всички.</div>'+
      '<button onclick="sendDailyDeadlinesNotification();closePushMenu();" style="border:none;background:#7c3aed;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Изпрати нотификация</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">🔬 Тест</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпрати тестова нотификация до себе си.</div>'+
      '<button onclick="bulPushTest()" style="border:none;background:#16a34a;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Тест</button>'+
    '</div>'+
    '</div>'+
    '<button onclick="closePushMenu()" style="width:100%;margin-top:12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;color:#64748b;">Затвори</button>'+
    '</div></div>';
}
function bulPushTest(){
  closePushMenu();
  showBulToast('⏳ Изпращане...');
  pushToAll('🔔 Тест ТеМАХ Портал','Push нотификациите работят!').then(function(r){
    console.log('Push test result:', JSON.stringify(r));
    var ok = r.ok && r.data && !r.data.errors;
    var msg = ok
      ? '✅ Изпратена! Провери браузъра.'
      : '❌ Грешка: ' + ((r.data&&(r.data.message||r.data.error||(r.data.errors&&r.data.errors[0])))||r.status);
    showBulToast(msg);
    toast(msg, ok ? '#16a34a' : '#dc2626');
    if(!ok) alert('Push грешка: ' + JSON.stringify(r.data));
  }).catch(function(err){
    console.error('Push catch:', err);
    showBulToast('❌ ' + err.message);
    alert('Push грешка: ' + err.message);
  });
}
function openPushMenu(){document.getElementById('pm2-ov').classList.add('open');}
function closePushMenu(){document.getElementById('pm2-ov').classList.remove('open');}

/* Събира заглавията на всички задачи/под-задачи/постоянни задачи със срок ДНЕС.
   cb(items) се вика винаги (items може да е празен масив). */
function collectTodayDeadlineItems(cb){
  var todayStr = today();
  var mainTasks = bulTasks.filter(function(t){ return t.due_date && t.due_date.slice(0,10)===todayStr; });
  var recTasks = recurringTasks.filter(function(t){ return recurringIsDueToday(t); });
  sbGet('task_subtasks','due_date=eq.'+todayStr).then(function(subs){
    var subTasks = Array.isArray(subs) ? subs : [];
    var items = [];
    mainTasks.forEach(function(t){ items.push(t.title); });
    subTasks.forEach(function(s){ items.push(s.title); });
    recTasks.forEach(function(t){ items.push(t.title + (t.due_time?(' ('+t.due_time+')'):'')); });
    cb(items);
  }).catch(function(){ cb([]); });
}
function sendDailyDeadlinesNotification(){
  collectTodayDeadlineItems(function(items){
    if(!items.length){ showBulToast('Няма задачи със срок днес.'); return; }
    var title = '📅 '+items.length+' срок'+(items.length===1?'':'а')+' днес';
    var msg = items.slice(0,5).join(', ') + (items.length>5 ? ' и още '+(items.length-5) : '');
    showBulToast('⏳ Изпращане...');
    pushToAll(title,msg).then(function(res){
      if(res && res.ok) showBulToast('🔔 Изпратена!');
      else showBulToast('❌ Грешка при изпращане');
    });
  });
}
function autoCheckDailyDeadlines(){
  var key='auto_deadlines_notif_'+today();
  try{ if(localStorage.getItem(key))return; }catch(e){}
  collectTodayDeadlineItems(function(items){
    try{ localStorage.setItem(key,'1'); }catch(e){}
    if(!items.length || typeof pushToAll!=='function')return;
    var title = '📅 '+items.length+' срок'+(items.length===1?'':'а')+' днес';
    var msg = items.slice(0,5).join(', ') + (items.length>5 ? ' и още '+(items.length-5) : '');
    pushToAll(title,msg);
  });
}

function sendPushOverdueNow(){
  var now=new Date(); var overdue={};
  bulTasks.forEach(function(t){
    if(!t.due_date||new Date(t.due_date)>=now)return;
    sbGet('stores','select=name').then(function(stores){
      if(!Array.isArray(stores))return;
      stores.forEach(function(s){
        var done=bulComps.some(function(c){return c.task_id===t.id&&c.store_name===s.name;});
        if(!done){if(!overdue[s.name])overdue[s.name]=[];overdue[s.name].push(t.title);}
      });
      if(Object.keys(overdue).length) pushOverdue(overdue,null);
      else toast('✅ Всички задачи са изпълнени!');
    });
  });
  if(!bulTasks.length)toast('Няма задачи за проверка');
}

function openEmailMenu(){document.getElementById('em-ov').classList.add('open');}
function closeEmailMenu(){document.getElementById('em-ov').classList.remove('open');}

function renderBulEmpty(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  wrap.innerHTML='<div style="text-align:center;padding:60px;"><div style="font-size:50px;margin-bottom:14px;">📰</div><div style="font-size:18px;font-weight:600;margin-bottom:8px;">Няма бюлетин за тази седмица</div>'+(canEdit()?'<button onclick="newBulletin()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;">+ Създай бюлетин</button>':'<div style="color:#94a3b8;">Бюлетинът ще бъде публикуван скоро.</div>')+'</div>';
}

/* ════════ PRINT ════════════════════════════════════════════ */
function printMenuHtml(){
  return '<div class="bov" id="pm-ov"><div class="bmod" style="width:380px;"><div style="font-size:15px;font-weight:600;margin-bottom:14px;">🖨 Избери какво да принтираш</div><div style="display:flex;flex-direction:column;gap:8px;">' +
    '<button data-what="all" onclick="bulPrint(this)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;">📄 Целия бюлетин</button>' +
    '<button data-what="cal" onclick="bulPrint(this)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;">📅 Само Календар + Важно</button>' +
    '<button data-what="trade" onclick="bulPrint(this)" style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;color:#166534;">🛒 Само Търговска</button>' +
    '<button data-what="warehouse" onclick="bulPrint(this)" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;color:#1e40af;">📦 Само Склад/Приемане</button>' +
    '<button data-what="admin" onclick="bulPrint(this)" style="border:1px solid #ddd6fe;background:#f5f3ff;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;color:#4c1d95;">⚙️ Само Администрация</button>' +
    '</div><button onclick="closePrintMenu()" style="width:100%;margin-top:12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;color:#64748b;">Откажи</button></div></div>';
}
function openPrintMenu(){document.getElementById('pm-ov').classList.add('open');}
function closePrintMenu(){document.getElementById('pm-ov').classList.remove('open');}
function bulPrint(btn){closePrintMenu();printSection(btn.getAttribute('data-what'));}

function printSection(what){
  var c=curBul.content; var wk=curBul.week_number; var yr=curBul.year;
  var days=weekDays(wk,yr); var isDraft=curBul.status==='draft';
  var imp2=[];
  DCOLS.forEach(function(k){(c.columns[k]||[]).forEach(function(b){if(b.type==='important')imp2.push(b);});});

  var PRINT_CSS = '@page{size:A4;margin:14mm;}' +
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:Arial,sans-serif;font-size:11.5pt;color:#111;background:#fff;line-height:1.55;}' +
    'h1{font-size:17pt;font-weight:700;margin-bottom:3mm;}' +
    'h2{font-size:13pt;font-weight:700;color:#0f172a;border-bottom:2pt solid #e2e8f0;padding-bottom:2mm;margin:5mm 0 3mm;}' +
    'h3{font-size:12pt;font-weight:700;margin:4mm 0 2mm;}' +
    '.hdr{background:#0f172a;color:#fff;padding:8mm 10mm;border-radius:3mm;margin-bottom:5mm;display:flex;justify-content:space-between;align-items:center;}' +
    '.hdr-title{font-size:16pt;font-weight:700;}' +
    '.hdr-sub{font-size:10pt;color:#94a3b8;margin-top:1mm;}' +
    '.draft-badge{background:#f59e0b;color:#78350f;font-size:9pt;font-weight:700;padding:2mm 4mm;border-radius:20mm;}' +
    '.week-badge{background:#1e293b;color:#94a3b8;font-family:monospace;font-size:10pt;padding:2mm 5mm;border-radius:20mm;}' +
    /* Important section */
    '.imp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm;margin-bottom:5mm;}' +
    '.imp-card{border-radius:2mm;padding:4mm 5mm;}' +
    '.imp-ok{background:#f0fdf4;border-left:3pt solid #16a34a;}' +
    '.imp-warn{background:#fffbeb;border-left:3pt solid #f59e0b;}' +
    '.imp-urgent{background:#fff1f2;border-left:3pt solid #dc2626;}' +
    '.imp-info{background:#eff6ff;border-left:3pt solid #2563eb;}' +
    '.imp-title{font-size:12pt;font-weight:700;margin-bottom:1mm;}' +
    '.imp-sub{font-size:10pt;opacity:.8;}' +
    /* Calendar */
    '.cal-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3mm;margin-bottom:5mm;}' +
    '.cal-day{border:1pt solid #e2e8f0;border-radius:2mm;padding:3mm 4mm;min-height:35mm;}' +
    '.cal-day-name{font-size:8pt;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:1mm;}' +
    '.cal-date{font-family:monospace;font-size:17pt;font-weight:700;color:#0f172a;margin-bottom:2mm;}' +
    '.cal-entry{display:flex;gap:2mm;padding:1mm 0;border-bottom:1pt dashed #f1f5f9;align-items:flex-start;font-size:10.5pt;}' +
    '.cal-dot{width:5pt;height:5pt;border-radius:50%;flex-shrink:0;margin-top:2.5pt;}' +
    '.cal-empty{font-size:10pt;color:#cbd5e1;font-style:italic;}' +
    /* Department */
    '.dept-hdr{color:#fff;padding:5mm 7mm;border-radius:2mm 2mm 0 0;font-size:13pt;font-weight:700;}' +
    '.dept-body{border:1pt solid #e2e8f0;border-top:none;border-radius:0 0 2mm 2mm;padding:5mm 7mm;margin-bottom:5mm;}' +
    /* Blocks */
    '.block-text{font-size:11.5pt;color:#374151;margin-bottom:3mm;line-height:1.6;}' +
    '.block-alert{border-radius:0 2mm 2mm 0;padding:3mm 5mm;margin-bottom:3mm;font-size:11.5pt;}' +
    '.block-list{margin-bottom:3mm;}' +
    '.block-list li{font-size:11.5pt;color:#374151;padding:1mm 0;border-bottom:1pt solid #f1f5f9;}' +
    '.block-img{margin-bottom:3mm;}' +
    '.block-img img{border-radius:2mm;display:block;}' +
    '.block-img-cap{font-size:9.5pt;color:#64748b;font-style:italic;margin-top:1mm;}' +
    /* Tasks */
    '.tasks-hdr{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;border-bottom:1.5pt solid #e2e8f0;padding-bottom:2mm;margin:4mm 0 2mm;}' +
    '.task-row{display:flex;gap:3mm;padding:2.5mm 0;border-bottom:1pt solid #f1f5f9;align-items:flex-start;}' +
    '.task-cb{width:13pt;height:13pt;border:1.5pt solid #e2e8f0;border-radius:2pt;flex-shrink:0;margin-top:1pt;}' +
    '.task-title{font-size:11.5pt;font-weight:600;margin-bottom:0.5mm;}' +
    '.task-desc{font-size:10pt;color:#64748b;}' +
    '.task-due{font-size:9.5pt;color:#94a3b8;margin-top:0.5mm;}' +
    '.dept-badge{display:inline-block;padding:1mm 3mm;border-radius:20mm;font-size:9.5pt;font-weight:600;margin-bottom:2mm;}' +
    '.badge-trade{background:#f0fdf4;color:#14532d;}' +
    '.badge-wh{background:#eff6ff;color:#1e40af;}' +
    '.badge-admin{background:#f5f3ff;color:#4c1d95;}' +
    '@media print{button{display:none!important;}}';

  function pBlock(b){
    if(!b||!b.type)return '';
    if(b.type==='text')return '<div class="block-text">'+esc(b.content||'').replace(/\n/g,'<br>')+'</div>';
    if(b.type==='divider')return '<hr style="border:none;border-top:1pt solid #e2e8f0;margin:3mm 0;">';
    if(b.type==='list'){
      var it=(b.content||'').split('\n').filter(Boolean);
      return '<ul class="block-list" style="list-style:none;padding:0;">'+(it.map(function(i){return '<li>› '+esc(i)+'</li>';}).join(''))+'</ul>';
    }
    if(b.type==='alert'){
      var aC={red:'#fff1f2:#dc2626:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#16a34a:#14532d',blu:'#eff6ff:#2563eb:#1e40af',pur:'#f5f3ff:#8b5cf6:#4c1d95'}[b.color||'blu']||'#eff6ff:#2563eb:#1e40af';
      var aC2=aC.split(':');
      return '<div class="block-alert" style="background:'+aC2[0]+';border-left:3pt solid '+aC2[1]+';color:'+aC2[2]+';">'+(b.label?'<div style="font-size:10pt;font-weight:700;text-transform:uppercase;margin-bottom:1mm;">'+esc(b.label)+'</div>':'')+esc(b.content||'')+'</div>';
    }
    if(b.type==='image'&&b.url){
      var w=b.width||100;
      return '<div class="block-img" style="width:'+w+'%;"><img src="'+b.url+'" style="width:100%;border-radius:2mm;">'+(b.caption?'<div class="block-img-cap">'+esc(b.caption)+'</div>':'')+'</div>';
    }
    if(b.type==='file'&&b.url){
      return '<div style="padding:2mm 4mm;border:1pt solid #e2e8f0;border-radius:2mm;font-size:10.5pt;margin-bottom:2mm;">📎 <b>'+esc(b.filename||'Файл')+'</b></div>';
    }
    return '';
  }

  function pImp(){
    if(!imp2.length)return '';
    var cls={ok:'imp-ok',warn:'imp-warn',urgent:'imp-urgent',info:'imp-info'};
    var cols={ok:'#14532d',warn:'#92400e',urgent:'#991b1b',info:'#1e40af'};
    var s='<h2>⭐ Важно тази седмица</h2><div class="imp-grid">';
    imp2.forEach(function(b){
      var ug=b.urgency||'info';
      s+='<div class="imp-card '+(cls[ug]||'imp-info')+'">';
      s+='<div class="imp-title" style="color:'+(cols[ug]||'#1e40af')+'">'+esc(b.title||'')+'</div>';
      if(b.sub)s+='<div class="imp-sub" style="color:'+(cols[ug]||'#1e40af')+'">'+esc(b.sub)+'</div>';
      s+='</div>';
    });
    s+='</div>';
    return s;
  }

  function pCal(){
    var DNAMES2=['Понеделник','Вторник','Сряда','Четвъртък','Петък'];
    var dotC={trade:'#14532d',warehouse:'#1e40af',admin:'#5b21b6',general:'#64748b'};
    var s='<h2>📅 Седмичен календар — Седмица '+wk+' · '+yr+'</h2>';
    s+='<div class="cal-grid">';
    DKEYS.forEach(function(key,i){
      var ds=days[i].toISOString().slice(0,10);
      var dt=bulTasks.filter(function(t){return t.due_date&&t.due_date.slice(0,10)===ds;});
      var mn=c.calendar[key]||[];
      s+='<div class="cal-day">';
      s+='<div class="cal-day-name">'+DNAMES2[i]+'</div>';
      s+='<div class="cal-date">'+fmtD(days[i])+'</div>';
      dt.forEach(function(t){
        var dc=dotC[t.department]||'#64748b';
        s+='<div class="cal-entry"><span class="cal-dot" style="background:'+dc+'"></span><span style="font-weight:600;">'+esc(t.title||'')+'</span></div>';
      });
      mn.forEach(function(e){
        var dc=dotC[e.dept]||'#64748b';
        s+='<div class="cal-entry"><span class="cal-dot" style="background:'+dc+'"></span><span>'+esc(e.title||'')+'</span></div>';
      });
      if(!dt.length&&!mn.length)s+='<div class="cal-empty">Свободен</div>';
      s+='</div>';
    });
    s+='</div>';
    return s;
  }

  function pDept(dk){
    var dept=DEPTS[dk];
    var hdrC={trade:'#166534',warehouse:'#1e40af',admin:'#5b21b6'}[dk]||'#1e293b';
    var blocks=(c.columns[dk]||[]).filter(function(b){return b.type!=='task'&&b.type!=='important';});
    var dt=bulTasks.filter(function(t){return t.department===dk;});
    var bdg={trade:'badge-trade',warehouse:'badge-wh',admin:'badge-admin'}[dk]||'badge-admin';
    var s='<div class="dept-hdr" style="background:'+hdrC+';">'+dept.icon+' '+dept.label+'</div>';
    s+='<div class="dept-body">';
    blocks.forEach(function(b){s+=pBlock(b);});
    if(dt.length){
      s+='<div class="tasks-hdr">✅ Задачи за изпълнение тази седмица</div>';
      dt.forEach(function(t){
        var comp=bulComps.find(function(cc){return cc.task_id===t.id;});
        var isDone=!!comp;
        s+='<div class="task-row">';
        s+='<div class="task-cb" style="'+(isDone?'background:#16a34a;border-color:#16a34a;':'')+'">'+
          (isDone?'<div style="color:#fff;font-size:9pt;text-align:center;line-height:13pt;">✓</div>':'')+'</div>';
        s+='<div style="flex:1;">';
        s+='<div class="task-title">'+esc(t.title||'')+'</div>';
        if(t.description)s+='<div class="task-desc">'+esc(t.description)+'</div>';
        if(t.due_date)s+='<div class="task-due">📅 Срок: '+new Date(t.due_date).toLocaleDateString('bg-BG')+(isDone&&comp?' &nbsp; ✅ '+esc(comp.completed_by||''):'')+'</div>';
        s+='</div></div>';
      });
    }
    if(!blocks.length&&!dt.length)s+='<div style="color:#94a3b8;text-align:center;padding:5mm;">Няма съдържание.</div>';
    s+='</div>';
    return s;
  }

  var sections='';
  var printTitle='Т-Бюлетин Седмица '+wk+' · '+yr;
  var sectionTitle='';

  if(what==='all'){
    sections=pImp()+pCal()+DCOLS.map(function(dk){return '<div style="margin-bottom:6mm;">'+pDept(dk)+'</div>';}).join('');
    sectionTitle='Пълен';
  } else if(what==='cal'){
    sections=pImp()+pCal();
    sectionTitle='Календар & Важно';
  } else if(DEPTS[what]){
    sections='<div>'+pDept(what)+'</div>';
    sectionTitle=DEPTS[what].label;
  }

  var win=window.open('','_blank','width=900,height=700');
  var fullTitle=printTitle+(sectionTitle?' — '+sectionTitle:'');
  win.document.write('<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">'+
    '<title>'+fullTitle+'</title>'+
    '<style>'+PRINT_CSS+'</style></head><body>');
  win.document.write('<div class="hdr">'+
    '<div><div class="hdr-title">'+fullTitle+'</div>'+
    '<div class="hdr-sub">ТеМАХ Вътрешна платформа · '+new Date().toLocaleDateString('bg-BG')+'</div></div>'+
    '<div style="display:flex;gap:4mm;align-items:center;">'+
    '<span class="week-badge">С'+wk+' · '+yr+'</span>'+
    (isDraft?'<span class="draft-badge">✏ Чернова</span>':'')+'</div>'+
  '</div>');
  win.document.write(sections);
  win.document.write('<div style="text-align:center;margin-top:8mm;"><button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;padding:8pt 20pt;border-radius:5mm;font-size:12pt;cursor:pointer;">🖨 Принтирай / Запази PDF</button></div>');
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.focus();},300);
}



/* ═══════ ЗАДАЧИ — ПАНЕЛ ═══════════════════════════════ */
function renderTasksPanel() {
  var isAdmin = canEdit();
  var DEPT = DEPTS;

  if (!bulTasks.length) return '';

  var h = '<div style="margin-bottom:20px;">';
  h += '<div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:12px;">✅ Задачи за седмицата</div>';

  if (!isAdmin) {
    /* ── ИЗГЛЕД ЗА МАГАЗИНА ── */
    var store = currentUser.store_name;
    var depts = ['trade','warehouse','admin'];

    depts.forEach(function(dk) {
      var dTasks = bulTasks.filter(function(t){ return t.department===dk; });
      if (!dTasks.length) return;
      var d = DEPT[dk];
      var done = dTasks.filter(function(t){
        return bulComps.some(function(c){return c.task_id===t.id && c.store_name===store;});
      }).length;
      var pct = Math.round(done/dTasks.length*100);

      h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden;">';
      h += '<div style="background:'+d.hdr+';padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">';
      h += '<div style="font-size:13px;font-weight:600;color:#fff;">'+d.icon+' '+d.label+'</div>';
      h += '<div style="display:flex;align-items:center;gap:8px;">';
      h += '<div style="font-size:11px;color:rgba(255,255,255,.7);">'+done+'/'+dTasks.length+'</div>';
      h += '<div style="background:rgba(255,255,255,.2);border-radius:20px;width:80px;height:6px;">';
      h += '<div style="background:'+(pct===100?'#4ade80':'#fff')+';width:'+pct+'%;height:6px;border-radius:20px;transition:.3s;"></div>';
      h += '</div></div></div>';
      h += '<div style="padding:8px 14px;">';

      dTasks.forEach(function(t) {
        var isDone = bulComps.some(function(c){return c.task_id===t.id && c.store_name===store;});
        var compInfo = isDone ? bulComps.find(function(c){return c.task_id===t.id && c.store_name===store;}) : null;
        h += '<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;">';
        h += '<input type="checkbox" '+(isDone?'checked ':'')+ 'data-tid="'+t.id+'" onchange="bulToggleTask(this)" style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:'+d.color+';">' ;
        h += '<div style="flex:1;">';
        h += '<div style="font-size:13px;font-weight:500;color:'+(isDone?'#94a3b8':'#0f172a')+';'+(isDone?'text-decoration:line-through;':'')+'">';
        h += esc(t.title||'')+'</div>';
        if (t.description) h += '<div style="font-size:11px;color:#94a3b8;">'+esc(t.description)+'</div>';
        h += renderTaskAttachments(t);
        if (t.due_date) {
          var due = new Date(t.due_date);
          var today = new Date(); today.setHours(0,0,0,0);
          var diff = Math.ceil((due-today)/86400000);
          var dueColor = diff < 0 ? '#dc2626' : diff <= 2 ? '#d97706' : '#94a3b8';
          h += '<div style="font-size:10px;color:'+dueColor+';margin-top:2px;">📅 Срок: '+due.toLocaleDateString("bg-BG")+(diff<0?' ⚠️ Просрочено':diff===0?' (Днес!)':diff<=2?' ('+diff+' дни)':'')+'</div>';
        }
        if (isDone && compInfo) {
          h += '<div style="font-size:10px;color:#16a34a;margin-top:2px;">✓ '+esc(compInfo.completed_by||'')+'</div>';
        }
        h += renderSubtasks(t.id, dk);
        h += '</div>';
        h += '<div style="display:flex;gap:4px;flex-shrink:0;">';
        h += '<button data-task-id="'+t.id+'" onclick="openEditTaskModal(this.dataset.taskId)" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#2563eb;">✏️</button>';
        h += '<button data-task-id="'+t.id+'" onclick="bulDelTask(this)" style="border:1px solid #fecaca;background:#fff5f5;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#dc2626;">✕</button>';
        h += '</div>';
        h += '</div>';
      });
      /* Постоянни задачи за отдела */
      h += renderRecurringTasks(dk);
      h += '</div></div>';
    });

  } else {
    /* ── СТАТИСТИКА ЗА АДМИН ── */
    h += '<div id="tasks-stat-wrap">⏳ Зареждане на статистика...</div>';
    setTimeout(loadTasksStats, 100);
  }

  h += '</div>';
  return h;
}


/* toggleTask — отбелязване/разотбелязване на задача */
function toggleTask(taskId, checked) {
  var store = currentUser && currentUser.store_name;
  if (!store) { toast('Грешка: няма магазин','#dc2626'); return; }
  if (checked) {
    sbPost('task_completions',{
      task_id: taskId,
      bulletin_id: curBul ? curBul.id : null,
      store_name: store,
      completed_by: currentUser.display_name || currentUser.email,
      completed_at: new Date().toISOString()
    }).then(function(r){
      if (!r.ok) { toast('Грешка','#dc2626'); return; }
      toast('✅ Задачата е отбелязана!');
      bulComps.push({task_id: taskId, store_name: store, completed_by: currentUser.display_name||currentUser.email});
      renderBulletin();
    });
  } else {
    sbDelete('task_completions','task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)).then(function(){
      toast('↩ Отбелязана като неизпълнена');
      bulComps = bulComps.filter(function(c){return !(c.task_id===taskId && c.store_name===store);});
      renderBulletin();
    });
  }
}

function bulToggleTask(cb){toggleTask(cb.dataset.tid, cb.checked);}
function loadTasksStats() {
  var wrap = document.getElementById('tasks-stat-wrap');
  if (!wrap || !bulTasks.length) return;

  sbGet('users','select=store_name&order=store_name').then(function(users){
    var seen={};
    var stores = users ? users.filter(function(u){
      if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
      seen[u.store_name]=1;return true;
    }).map(function(u){return u.store_name;}) : [];

    if (!stores.length) { wrap.innerHTML=''; return; }

    var depts = ['trade','warehouse','admin'];
    var h = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    h += '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;">Магазин</th>';
    depts.forEach(function(dk){
      h += '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid #e2e8f0;">'+DEPTS[dk].icon+' '+DEPTS[dk].label+'</th>';
    });
    h += '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid #e2e8f0;">Общо</th>';
    h += '</tr></thead><tbody>';

    stores.forEach(function(store) {
      var totalDone=0, totalAll=0;
      h += '<tr style="border-bottom:1px solid #f1f5f9;">';
      h += '<td style="padding:7px 12px;font-weight:500;">'+esc(store)+'</td>';
      depts.forEach(function(dk){
        var dTasks = bulTasks.filter(function(t){return t.department===dk;});
        var done = dTasks.filter(function(t){
          return bulComps.some(function(c){return c.task_id===t.id&&c.store_name===store;});
        }).length;
        totalDone+=done; totalAll+=dTasks.length;
        var pct = dTasks.length ? Math.round(done/dTasks.length*100) : null;
        var bg = pct===null?'#f8fafc':pct===100?'#f0fdf4':pct>50?'#fffbeb':'#fff5f5';
        var color = pct===null?'#94a3b8':pct===100?'#16a34a':pct>50?'#d97706':'#dc2626';
        h += '<td style="text-align:center;padding:7px 12px;background:'+bg+';">';
        if (pct !== null) h += '<span style="color:'+color+';font-weight:600;">'+done+'/'+dTasks.length+'</span>';
        else h += '<span style="color:#cbd5e1;">—</span>';
        h += '</td>';
      });
      var totalPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;
      var totBg = totalPct===100?'#f0fdf4':totalPct>50?'#fffbeb':'#fff5f5';
      var totColor = totalPct===100?'#16a34a':totalPct>50?'#d97706':'#dc2626';
      h += '<td style="text-align:center;padding:7px 12px;background:'+totBg+';"><b style="color:'+totColor+';">'+totalPct+'%</b></td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
    wrap.innerHTML = h;
  });
}

function renderBulAnalysis(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var html=bulHdr(curBul&&curBul.status==='draft')+BULCSS+'<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';
  html+='<div style="font-size:18px;font-weight:600;margin-bottom:16px;">📊 Анализ — Седмица '+wk+'</div>';
  if(!bulTasks.length){html+='<div class="bcard" style="text-align:center;padding:30px;color:#94a3b8;">Няма задачи.</div>';wrap.innerHTML=html+'</div>';return;}
  var ds={};bulComps.forEach(function(c){ds[c.task_id]=1;});
  var done=Object.keys(ds).length; var tot=bulTasks.length;
  var ss={};bulComps.forEach(function(c){ss[c.store_name]=1;});
  var over=bulTasks.filter(function(t){return t.due_date&&new Date(t.due_date)<new Date()&&!ds[t.id];}).length;
  html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
  [['📋 Задачи',tot,'общо','#2563eb'],['✅ Изпълнени',done,'задачи','#16a34a'],['🔴 Просрочени',over,'без изпълнение','#dc2626'],['🏪 Магазини',Object.keys(ss).length,'са отметнали','#d97706']].forEach(function(card){
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+card[3]+';"><div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+card[0]+'</div><div style="font-size:26px;font-weight:700;color:'+card[3]+';font-family:DM Mono,monospace;">'+card[1]+'</div><div style="font-size:11px;color:#94a3b8;">'+card[2]+'</div></div>';
  });
  html+='</div>';
  html+='<div class="bcard"><div style="font-size:13px;font-weight:600;margin-bottom:12px;">Задачи по магазини</div><div id="an-tbl"><div style="text-align:center;padding:20px;color:#94a3b8;">⏳ Зареждане...</div></div></div></div>';
  wrap.innerHTML=html;
  sbGet('stores','select=name&order=name').then(function(sd){
    var all=Array.isArray(sd)?sd.map(function(s){return s.name;}):[]; 
    var tbl='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Задача</th><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Изпълнили</th><th style="text-align:right;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">%</th></tr></thead><tbody>';
    bulTasks.forEach(function(task){
      var comps=bulComps.filter(function(c){return c.task_id===task.id;});
      var pct=all.length?Math.round(comps.length/all.length*100):0;
      var isOv=task.due_date&&new Date(task.due_date)<new Date()&&!ds[task.id];
      var d=DEPTS[task.department]||{label:task.department,color:'#94a3b8',bg:'#f3f4f6',bdr:'#e2e8f0'};
      tbl+='<tr style="border-bottom:1px solid #f1f5f9;'+(isOv?'background:#fff5f5;':'')+'"><td style="padding:7px 10px;font-weight:500;">'+esc(task.title||'')+'</td><td style="padding:7px 10px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.bdr+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+d.label+'</span></td><td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:'+(isOv?'#dc2626':'#64748b')+';">'+fmtDate(task.due_date)+(isOv?' 🔴':'')+'</td><td style="padding:7px 10px;">'+(comps.length?comps.map(function(c){return '<span style="background:#dcfce7;color:#14532d;font-size:10px;padding:1px 6px;border-radius:20px;margin:1px 2px;display:inline-block;">'+esc(c.store_name)+'</span>';}).join(''):'<span style="color:#94a3b8;font-size:11px;">—</span>')+'</td><td style="padding:7px 10px;text-align:right;font-family:DM Mono,monospace;font-weight:700;color:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';">'+pct+'%</td></tr>';
    });
    tbl+='</tbody></table></div>';
    var el=document.getElementById('an-tbl'); if(el)el.innerHTML=tbl;
  });
}

/* ═══════ ПОСТОЯННИ ЗАДАЧИ ════════════════════════════════════ */
function renderRecurringTasks(dk) {
  var store = currentUser && currentUser.store_name;
  var dTasks = recurringTasks.filter(function(t){return t.department===dk;});
  if (!dTasks.length && !canEdit()) return '';
  var d = DEPTS[dk];

  var h = '<div style="background:#fff;border:1px solid ' + d.bdr + ';border-left:4px solid ' + d.hdr + ';border-radius:8px;margin-bottom:12px;overflow:hidden;">';
  h += '<div style="background:' + d.bg + ';padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">';
  h += '<div style="font-size:12px;font-weight:700;color:' + d.color + ';text-transform:uppercase;letter-spacing:.06em;">🔁 Постоянни задачи</div>';
  if (canEdit()) {
    h += '<button onclick="openRecurringModal(\'' + dk + '\')" style="border:1px solid ' + d.hdr + ';background:#fff;color:' + d.color + ';border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;">+ Добави</button>';
  }
  h += '</div>';

  if (dTasks.length) {
    h += '<div style="padding:8px 14px;">';
    dTasks.forEach(function(t) {
      var done = store && recurringComps.some(function(c){return c.recurring_task_id===t.id && c.store_name===store;});
      var dueToday = recurringIsDueToday(t);
      h += '<div class="rec-task-row" style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;">';
      h += '<input type="checkbox" ' + (done?'checked ':'') + 'data-rtid="' + t.id + '" onchange="bulToggleRecurring(this)" ' +
        'style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:' + d.color + ';flex-shrink:0;">';
      h += '<div style="flex:1;">';
      h += '<div style="font-size:13px;font-weight:500;color:' + (done?'#94a3b8':'#0f172a') + ';' + (done?'text-decoration:line-through;':'') + '">' + esc(t.title||'') + '</div>';
      if (t.description) h += '<div style="font-size:11px;color:#94a3b8;">' + esc(t.description) + '</div>';
      var dueLbl = recurringDueLabel(t);
      if (dueLbl) h += '<div style="font-size:10px;color:'+(dueToday&&!done?'#d97706':'#94a3b8')+';margin-top:2px;">🔁 '+dueLbl+(dueToday&&!done?' (днес!)':'')+'</div>';
      h += renderRecurringAttachments(t);
      h += '</div>';
      if (canEdit()) {
        h += '<div style="display:flex;gap:4px;">';
        h += '<button onclick="openEditRecurringModal(\'' + t.id + '\')" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#2563eb;">✏️</button>';
        h += '<button onclick="toggleRecurringActive(\'' + t.id + '\',' + (!t.active) + ')" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#64748b;">' + (t.active?'⏸ Спри':'▶ Активирай') + '</button>';
        h += '<button onclick="deleteRecurring(\'' + t.id + '\')" style="border:1px solid #fecaca;background:#fff5f5;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#dc2626;">✕</button>';
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  } else if (canEdit()) {
    h += '<div style="padding:12px 14px;color:#94a3b8;font-size:12px;font-style:italic;">Няма постоянни задачи. Добави с бутона горе.</div>';
  }
  h += '</div>';
  return h;
}

function bulToggleRecurring(cb) {
  var rtid = cb.dataset.rtid;
  var store = currentUser && currentUser.store_name;
  if (!store) { toast('Грешка: няма магазин','#dc2626'); return; }
  if (cb.checked) {
    sbPost('task_completions', {
      task_id: null,
      recurring_task_id: rtid,
      bulletin_id: curBul ? curBul.id : null,
      store_name: store,
      completed_by: currentUser.display_name || currentUser.email,
      completed_at: new Date().toISOString()
    }).then(function(r){
      if (!r.ok) { toast('Грешка','#dc2626'); return; }
      toast('✅ Отбелязана!');
      recurringComps.push({recurring_task_id: rtid, store_name: store});
      renderBulletin();
    });
  } else {
    sbDelete('task_completions','recurring_task_id=eq.'+rtid+'&store_name=eq.'+encodeURIComponent(store)).then(function(){
      toast('↩ Отбелязана като неизпълнена');
      recurringComps = recurringComps.filter(function(c){return !(c.recurring_task_id===rtid && c.store_name===store);});
      renderBulletin();
    });
  }
}

function toggleRecurringActive(id, active) {
  sbPatch('recurring_tasks','id=eq.'+id,{active:active}).then(function(){
    toast(active ? '▶ Активирана' : '⏸ Спряна');
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

function openRecurringModal(dk) {
  var d = DEPTS[dk];
  var existing = document.getElementById('rec-modal-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'rec-modal-ov';
  ov.innerHTML = '<div class="bmod" style="width:420px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">🔁 Нова постоянна задача — ' + d.label + '</div>' +
    '<label class="fl">Заглавие *</label><input class="fi" id="rec-title" placeholder="напр. Провери наличностите">' +
    '<label class="fl">Описание</label><input class="fi" id="rec-desc" placeholder="Допълнителна информация">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Повтарящ се ден</label><select class="fi" id="rec-weekday">'+recWeekdayOpts()+'</select></div>' +
    '<div><label class="fl">Час (по избор)</label><input type="time" class="fi" id="rec-time"></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="var e=document.getElementById(&#39;rec-modal-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-dk="' + dk + '" onclick="submitRecurring(this.dataset.dk)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var el=document.getElementById('rec-title'); if(el)el.focus(); }, 100);
}
/* Опции за dropdown "повтарящ се ден" — value="" означава "всеки ден" (due_weekday=null) */
function recWeekdayOpts(sel){
  var h='<option value=""'+(sel===null||sel===undefined?' selected':'')+'>Всеки ден</option>';
  DNAMES.forEach(function(n,i){ h+='<option value="'+i+'"'+(String(sel)===String(i)?' selected':'')+'>'+n+'</option>'; });
  return h;
}
function recurringDueLabel(t){
  var hasWeekday = t.due_weekday!==null && t.due_weekday!==undefined;
  if(!hasWeekday){
    return t.due_time ? ('Всеки ден до '+t.due_time) : '';
  }
  var dayName = DNAMES[t.due_weekday]||'';
  return dayName + (t.due_time ? (' до '+t.due_time) : '');
}
function recurringIsDueToday(t){
  if(t.due_weekday===null||t.due_weekday===undefined){
    return !!t.due_time; /* "всеки ден" със зададен час -> винаги важи за днес */
  }
  var jsDay=new Date().getDay(); /* 0=Нед,1=Пон...6=Съб */
  var idx=jsDay===0?null:jsDay-1; /* превръщаме в 0=Пон..4=Пет, съб/нед -> null */
  return idx===t.due_weekday;
}

function submitRecurring(dk) {
  var title = (document.getElementById('rec-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var desc = document.getElementById('rec-desc').value||'';
  var wdRaw = document.getElementById('rec-weekday').value;
  var due_weekday = wdRaw==='' ? null : parseInt(wdRaw,10);
  var due_time = document.getElementById('rec-time').value || null;
  sbPost('recurring_tasks',{department:dk,title:title,description:desc,active:true,sort_order:recurringTasks.length,due_weekday:due_weekday,due_time:due_time}).then(function(r){
    if (!r.ok) { toast('Грешка','#dc2626'); return; }
    var el = document.getElementById('rec-modal-ov');
    if (el) el.remove();
    toast('✅ Постоянната задача е добавена!');
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

/* ═══════ ПОД-ЗАДАЧИ ══════════════════════════════════════════ */
function renderSubtasks(taskId, dept) {
  var store = currentUser && currentUser.store_name;
  var d = DEPTS[dept] || DEPTS.trade;
  var containerId = 'sub-' + taskId;
  setTimeout(function(){
    sbGet('task_subtasks','task_id=eq.'+taskId+'&order=sort_order.asc').then(function(subs){
      var el = document.getElementById(containerId);
      if (!el) return;
      if (!Array.isArray(subs) || !subs.length) {
        if (canEdit()) {
          var addBtn = document.createElement('button');
          addBtn.style.cssText = 'border:1px dashed #cbd5e1;background:none;color:#94a3b8;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;margin-top:4px;';
          addBtn.textContent = '+ Добави под-задача';
          addBtn.setAttribute('data-tid', taskId);
          addBtn.setAttribute('data-dept', dept);
          addBtn.onclick = function(){ openSubtaskModal(this.getAttribute('data-tid'), this.getAttribute('data-dept')); };
          el.appendChild(addBtn);
        }
        return;
      }
      var h = '<div style="padding:4px 0 4px 20px;border-left:2px solid '+d.bdr+';margin-top:4px;">';
      subs.forEach(function(s){
        var done = store && subtaskComps.some(function(c){return c.subtask_id===s.id && c.store_name===store;});
        var due = s.due_date ? new Date(s.due_date) : null;
        var t0 = new Date(); t0.setHours(0,0,0,0);
        var diff = due ? Math.ceil((due-t0)/86400000) : null;
        var dueColor = diff===null?'#94a3b8':diff<0?'#dc2626':diff<=1?'#d97706':'#94a3b8';
        h += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">';
        h += '<input type="checkbox" '+(done?'checked ':'')+' data-stid="'+s.id+'" onchange="bulToggleSubtask(this)" style="width:13px;height:13px;cursor:pointer;accent-color:'+d.color+';">';
        h += '<span style="font-size:12px;color:'+(done?'#94a3b8':'#374151')+';'+(done?'text-decoration:line-through;':'')+'">' + esc(s.title) + '</span>';
        if(due) h += '<span style="font-size:10px;color:'+dueColor+';">📅 '+fmtDate2(s.due_date)+(diff<0?' ⚠️':'')+'</span>';
        if (canEdit()) h += '<button data-stid="'+s.id+'" data-tid="'+taskId+'" data-dept="'+dept+'" onclick="deleteSubtask(this.dataset.stid,this.dataset.tid,this.dataset.dept)" style="border:none;background:none;color:#dc2626;font-size:10px;cursor:pointer;padding:0;line-height:1;">✕</button>';
        h += '</div>';
      });
      if (canEdit()) {
        h += '<button data-tid="'+taskId+'" data-dept="'+dept+'" onclick="openSubtaskModal(this.dataset.tid,this.dataset.dept)" style="border:1px dashed #cbd5e1;background:none;color:#94a3b8;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;margin-top:4px;">+ Добави под-задача</button>';
      }
      h += '</div>';
      el.innerHTML = h;
    });
  }, 50);
  return '<div id="' + containerId + '"></div>';
}

function bulToggleSubtask(cb) {
  var stid = cb.dataset.stid;
  var store = currentUser && currentUser.store_name;
  if (!store) return;
  if (cb.checked) {
    sbPost('subtask_completions',{subtask_id:stid,store_name:store,completed_by:currentUser.display_name||currentUser.email,completed_at:new Date().toISOString()}).then(function(r){
      if (!r.ok) { toast('Грешка','#dc2626'); cb.checked=false; return; }
      subtaskComps.push({subtask_id:stid,store_name:store});
      toast('✅ Под-задачата е отбелязана!');
    });
  } else {
    sbDelete('subtask_completions','subtask_id=eq.'+stid+'&store_name=eq.'+encodeURIComponent(store)).then(function(){
      subtaskComps = subtaskComps.filter(function(c){return !(c.subtask_id===stid&&c.store_name===store);});
      toast('↩ Отбелязана като неизпълнена');
    });
  }
}

function openSubtaskModal(taskId, dept) {
  var existing = document.getElementById('st-modal-ov');
  if (existing) existing.remove();
  var wk = curBul ? curBul.week_number : weekNum(new Date());
  var yr = curBul ? curBul.year : new Date().getFullYear();
  var days = weekDays(wk, yr);
  var dueOpts = '<option value="">— Без срок —</option>' + DKEYS.map(function(k,i){
    return '<option value="'+days[i].toISOString().slice(0,10)+'">'+DNAMES[i]+' ('+fmtD(days[i])+')</option>';
  }).join('');
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'st-modal-ov';
  ov.innerHTML = '<div class="bmod" style="width:380px;">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">+ Нова под-задача</div>' +
    '<label class="fl">Заглавие *</label><input class="fi" id="st-title" placeholder="напр. Провери склад А">' +
    '<label class="fl">Срок — ден от седмицата</label><select class="fi" id="st-due">'+dueOpts+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
    '<button onclick="var e=document.getElementById(&#39;st-modal-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-tid="' + taskId + '" data-dept="' + dept + '" onclick="submitSubtask(this.dataset.tid,this.dataset.dept)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){var el=document.getElementById('st-title');if(el)el.focus();},100);
}

function submitSubtask(taskId, dept) {
  var title = (document.getElementById('st-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var due = (document.getElementById('st-due')||{}).value || null;
  sbPost('task_subtasks',{task_id:taskId,title:title,sort_order:0,due_date:due}).then(function(r){
    if (!r.ok) { toast('Грешка','#dc2626'); return; }
    var el = document.getElementById('st-modal-ov');
    if (el) el.remove();
    toast('✅ Под-задачата е добавена!');
    sbGet('subtask_completions','store_name=eq.'+encodeURIComponent(currentUser.store_name)).then(function(sc){
      subtaskComps = Array.isArray(sc)?sc:[];
      renderSubtasks(taskId, dept);
    });
  });
}

function deleteSubtask(stId, taskId, dept) {
  if (!confirm('Изтрий под-задачата?')) return;
  sbDelete('task_subtasks','id=eq.'+stId).then(function(){
    toast('Изтрита');
    renderSubtasks(taskId, dept);
  });
}
