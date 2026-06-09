/* bulletin.js v4.1 — 2026-06-02 */
/* bulletin.js — Т-Бюлетин v4 */

/* CONFIG */
var BUL_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var BUL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var BUL_BKT = 'bulletin-files';
var BUL_PUB = BUL_SB + '/storage/v1/object/public/' + BUL_BKT + '/';

/* STATE */
var curBul = null; var bulTasks = []; var bulComps = [];
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
  var q=canEdit()?'order=created_at.desc&limit=1':'status=eq.published&order=published_at.desc&limit=1';
  sbGet('bulletins',q).then(function(data){
    curBul=(Array.isArray(data)&&data.length)?data[0]:null;
    if(!curBul){renderBulEmpty();return;}
    if(typeof curBul.content==='string'){try{curBul.content=JSON.parse(curBul.content);}catch(e){curBul.content={};}}
    initCols();
    sbGet('bulletin_tasks','bulletin_id=eq.'+curBul.id+'&order=due_date.asc').then(function(t){
      bulTasks=Array.isArray(t)?t:[];
      if(!bulTasks.length){bulComps=[];renderBulletin();return;}
      var ids=bulTasks.map(function(x){return x.id;}).join(',');
      var cq='task_id=in.('+ids+')'+(isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name));
      sbGet('task_completions',cq).then(function(c){bulComps=Array.isArray(c)?c:[];renderBulletin();}).catch(function(){bulComps=[];renderBulletin();});
    }).catch(function(){bulTasks=[];bulComps=[];renderBulletin();});
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
  if(bulMode==='edit'){renderBulEdit();return;}
  renderBulView();
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

  /* Calendar */
  html+='<div class="bcard" id="sec-calendar">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html+='<div style="font-size:14px;font-weight:600;">📅 Седмичен календар — С'+wk+' · '+yr+'</div>';
  if(canEdit())html+='<button onclick="openCalModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави събитие</button>';
  html+='</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">';
  DKEYS.forEach(function(key,i){
    var isToday=days[i].toISOString().slice(0,10)===today();
    var dateStr=days[i].toISOString().slice(0,10);
    var dTasks=bulTasks.filter(function(t){return t.due_date===dateStr;});
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

  /* 3 columns */
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;">';
  DCOLS.forEach(function(dk){
    var dept=DEPTS[dk];
    var blocks=(c.columns[dk]||[]).filter(function(b){return b.type!=='task'&&b.type!=='important';});
    var dTasks=bulTasks.filter(function(t){return t.department===dk;});
    var isMyDept=!isGlobal()&&myDept()===dk;
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;" id="sec-'+dk+'">';
    html+='<div style="background:'+dept.hdr+';padding:12px 15px;display:flex;align-items:center;gap:9px;"><div style="width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:14px;">'+dept.icon+'</div><div style="font-size:13px;font-weight:600;color:#fff;">'+dept.label+'</div></div>';
    html+='<div style="padding:13px;">';
    blocks.forEach(function(b){html+=viewBlock(b);});
    if(dTasks.length){
      html+='<div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin:10px 0 6px;padding-bottom:3px;border-bottom:1px solid #e2e8f0;">✅ Задачи тази седмица</div>';
      dTasks.forEach(function(task){
        var comp=bulComps.find(function(c){return c.task_id===task.id&&(isGlobal()||c.store_name===currentUser.store_name);});
        var done=!!comp; var over=task.due_date&&new Date(task.due_date)<new Date()&&!done;
        html+='<div style="display:flex;align-items:flex-start;gap:8px;padding:7px;border-radius:7px;margin-bottom:4px;background:'+(done?'#f0fdf4':over?'#fff5f5':'#f8fafc')+';border:1px solid '+(done?'#bbf7d0':over?'#fecaca':'#e2e8f0')+'">';
        if(isMyDept&&!isGlobal()){
          html+='<input type="checkbox" data-task-id="'+task.id+'" '+(done?'checked':'')+' onchange="bulToggleTask(this)" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:2px;">';
        }else{
          html+='<span style="width:16px;height:16px;border-radius:4px;border:1.5px solid '+(done?'#16a34a':'#e2e8f0')+';background:'+(done?'#16a34a':'#fff')+';color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">'+(done?'✓':'')+'</span>';
        }
        html+='<div style="flex:1;"><div style="font-size:12.5px;font-weight:500;'+(done?'text-decoration:line-through;color:#94a3b8;':'')+'">'+esc(task.title||'')+'</div>';
        if(task.description)html+='<div style="font-size:11px;color:#64748b;">'+esc(task.description)+'</div>';
        if(task.due_date)html+='<div style="font-size:10px;color:'+(over?'#dc2626':done?'#16a34a':'#94a3b8')+'">'+(over?'🔴 Просрочена ':done?'✅ ':'📅 ')+fmtDate(task.due_date)+(done&&comp?' · '+esc(comp.completed_by||''):'')+'</div>';
        html+='</div></div>';
      });
    }
    if(!blocks.length&&!dTasks.length)html+='<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0;">Няма съдържание.</div>';
    html+='</div></div>';
  });
  html+='</div>';

  /* Progress */
  if(bulTasks.length){
    var ds={};bulComps.forEach(function(c){ds[c.task_id]=1;});
    var done=Object.keys(ds).length; var tot=bulTasks.length; var pct=Math.round(done/tot*100);
    html+='<div class="bcard"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><div style="font-size:13px;font-weight:600;">📊 Изпълнение на задачите</div>';
    if(canEdit())html+='<button onclick="setBulAnalysis()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">Детайлен анализ →</button>';
    html+='</div><div style="background:#e2e8f0;border-radius:20px;height:8px;overflow:hidden;"><div style="height:100%;border-radius:20px;background:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';width:'+pct+'%;"></div></div>';
    html+='<div style="font-size:12px;color:#64748b;margin-top:4px;">'+done+' от '+tot+' задачи ('+pct+'%)</div></div>';
  }
  html+='</div>';
  html+=calModalHtml()+printMenuHtml()+emailMenuHtml()+pushMenuHtml();
  wrap.innerHTML=html;
  /* Auto-check за имейл тригери (само за admin) */
  if(typeof checkPushTriggers==='function') setTimeout(function(){checkPushTriggers(curBul,bulTasks,bulComps);},500);
}

/* View block */
function viewBlock(b){
  if(!b||!b.type)return '';
  var w=b.width||100;
  if(b.type==='text')return '<div style="font-size:13px;color:#374151;margin-bottom:8px;line-height:1.6;">'+esc(b.content||'').replace(/\n/g,'<br>')+'</div>';
  if(b.type==='divider')return '<hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0;">';
  if(b.type==='list'){
    var items=(b.content||'').split('\n').filter(Boolean);
    return '<ul style="list-style:none;margin-bottom:8px;">'+(items.map(function(i){return '<li style="padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:13px;display:flex;gap:6px;align-items:baseline;"><span style="color:#94a3b8;">›</span>'+esc(i)+'</li>';}).join(''))+'</ul>';
  }
  if(b.type==='alert'){
    var C=({red:'#fff1f2:#ef4444:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#22c55e:#166534',blu:'#eff6ff:#3b82f6:#1e40af',pur:'#f5f3ff:#8b5cf6:#4c1d95'}[b.color||'blu']||'#eff6ff:#3b82f6:#1e40af').split(':');
    return '<div style="background:'+C[0]+';border-left:3px solid '+C[1]+';color:'+C[2]+';border-radius:0 7px 7px 0;padding:8px 11px;font-size:13px;margin-bottom:8px;">'+(b.label?'<div style="font-size:10px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">'+esc(b.label)+'</div>':'')+esc(b.content||'').replace(/\n/g,'<br>')+'</div>';
  }
  if(b.type==='image'&&b.url){
    return '<div style="margin-bottom:8px;width:'+w+'%;margin-left:auto;margin-right:auto;"><img src="'+b.url+'" style="width:100%;border-radius:8px;display:block;">'+(b.caption?'<div style="font-size:11px;color:#64748b;padding:4px 2px;font-style:italic;">'+esc(b.caption)+'</div>':'')+'</div>';
  }
  if(b.type==='file'&&b.url){
    return '<a href="'+b.url+'" target="_blank" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:7px;text-decoration:none;color:#0f172a;background:#f8fafc;margin-bottom:8px;"><span style="font-size:20px;">📎</span><div><div style="font-size:12.5px;font-weight:500;">'+esc(b.filename||'Файл')+'</div><div style="font-size:11px;color:#64748b;">Натисни за изтегляне</div></div></a>';
  }
  return '';
}

/* Task toggle via data attr */
function bulToggleTask(cb){toggleTask(cb.getAttribute('data-task-id'),cb.checked);}
function toggleTask(id,checked){
  var store=currentUser.store_name, by=currentUser.display_name||currentUser.email;
  if(checked){
    sbPost('task_completions',{task_id:id,store_name:store,completed_by:by}).then(function(r){
      if(!r.ok){toast('Грешка','#dc2626');return;}
      toast('✅ Изпълнена!'); loadBulletin();
    });
  }else{
    sbDelete('task_completions','task_id=eq.'+id+'&store_name=eq.'+encodeURIComponent(store)).then(function(){
      toast('↩ Размаркирана'); loadBulletin();
    });
  }
}

/* ════════ EDIT MODE ════════════════════════════════════════ */
function renderBulEdit(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  var c=curBul.content;
  var html=bulHdr(true)+BULCSS+'<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';
  html+='<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:#92400e;">✏️ <b>Режим на редактиране</b> — Промените се записват автоматично.</div>';

  /* Tasks */
  html+='<div class="bcard"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div style="font-size:13px;font-weight:600;">✅ Задачи за седмицата</div><button onclick="openTaskModal()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">+ Добави задача</button></div>';
  if(bulTasks.length){
    html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Задача</th><th style="text-align:left;padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th><th style="text-align:left;padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th><th style="padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;"></th></tr></thead><tbody>';
    bulTasks.forEach(function(t){
      var d=DEPTS[t.department]||{label:t.department,color:'#94a3b8',bg:'#f3f4f6',bdr:'#e2e8f0'};
      html+='<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 8px;"><div style="font-weight:500;">'+esc(t.title||'')+'</div>'+(t.description?'<div style="font-size:11px;color:#64748b;">'+esc(t.description)+'</div>':'')+'</td><td style="padding:6px 8px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.bdr+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+d.label+'</span></td><td style="padding:6px 8px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(t.due_date)+'</td><td style="padding:6px 8px;"><button data-task-id="'+t.id+'" onclick="bulDelTask(this)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕</button></td></tr>';
    });
    html+='</tbody></table></div>';
  }else{html+='<div style="color:#94a3b8;font-size:13px;padding:8px 0;">Няма задачи.</div>';}
  html+='</div>';

  /* Columns */
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">';
  DCOLS.forEach(function(dk){
    var dept=DEPTS[dk];
    var blocks=c.columns[dk]||[];
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">';
    html+='<div style="background:'+dept.hdr+';padding:12px 15px;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:13px;font-weight:600;color:#fff;">'+dept.icon+' '+dept.label+'</div></div>';
    html+='<div style="padding:13px;" id="ecol-'+dk+'" ondragover="event.preventDefault()" data-col="'+dk+'" ondrop="bulDropCol(this)">';
    blocks.forEach(function(b,i){html+=editBlock(b,dk,i);});
    html+='<button class="addblk" data-dept="'+dk+'" onclick="bulOpenPicker(this)">+ Добави блок</button>';
    html+='</div></div>';
  });
  html+='</div></div>';
  html+=blockPickerHtml()+taskModalHtml()+calModalHtml();
  wrap.innerHTML=html;
}

/* Edit block */
function editBlock(b,dk,i){
  var tl={text:'📝 Текст',alert:'🚨 Алерт',list:'📋 Списък',image:'📷 Снимка',file:'📎 Файл',divider:'— Разделител',important:'⭐ Важно'}[b.type]||b.type;
  var h='<div class="blk" id="eb-'+b.id+'" draggable="true" data-col="'+dk+'" data-idx="'+i+'" ondragstart="bulDragStart(this)" ondragover="bulDragOver(this)" ondragleave="bulDragLeave(this)" ondrop="bulDropBlock(this)">';
  h+='<button class="blk-del" data-col="'+dk+'" data-id="'+b.id+'" onclick="bulDelBlock(this)">✕</button>';
  h+='<div class="blk-type">'+tl+'</div>';

  if(b.type==='text'){
    h+='<textarea class="blk-ta" rows="3" placeholder="Въведи текст..." data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
  }else if(b.type==='divider'){
    h+='<hr style="border:none;border-top:1px solid #e2e8f0;">';
  }else if(b.type==='list'){
    h+='<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Всеки ред = нова точка</div>';
    h+='<textarea class="blk-ta" rows="4" placeholder="Ред 1..." data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
  }else if(b.type==='alert'){
    var cOpts=[['red','🔴 Червено'],['amb','🟡 Жълто'],['grn','🟢 Зелено'],['blu','🔵 Синьо'],['pur','🟣 Лилаво']];
    h+='<select data-col="'+dk+'" data-id="'+b.id+'" data-field="color" onchange="bulSetBlk(this)" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;width:100%;">';
    cOpts.forEach(function(o){h+='<option value="'+o[0]+'"'+(b.color===o[0]?' selected':'')+'>'+o[1]+'</option>';});
    h+='</select><br>';
    h+='<input placeholder="Заглавие (по избор)" value="'+esc(b.label||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="label" oninput="bulSetBlk(this)" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;margin-bottom:4px;font-family:inherit;box-sizing:border-box;"><br>';
    h+='<textarea class="blk-ta" rows="2" placeholder="Съдържание..." data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
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
  var b={id:genId(),type:type,content:''};
  if(type==='alert')b.color='blu';
  if(type==='important')b.urgency='info';
  if(type==='image')b.width=100;
  curBul.content.columns[_pkDept].push(b);
  schedSave(); renderBulletin();
}
function blockPickerHtml(){
  var types=[['text','📝','Текст','Параграф'],['alert','🚨','Алерт','Цветна кутия'],['important','⭐','Важно','→ секция Важно горе'],['list','📋','Списък','Точки с информация'],['image','📷','Снимка','JPG / PNG'],['file','📎','Файл','PDF / Word / Excel'],['divider','—','Разделител','Хоризонтална линия']];
  var h='<div class="bov" id="bp-ov"><div class="bmod"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><div style="font-size:15px;font-weight:600;">Избери тип блок</div><button onclick="closeBlockPicker()" style="border:none;background:none;font-size:18px;color:#94a3b8;cursor:pointer;">✕</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">';
  types.forEach(function(t){
    h+='<div data-type="'+t[0]+'" onclick="addBlock(this.getAttribute(\"data-type\"))" style="border:1px solid #e2e8f0;border-radius:9px;padding:12px 14px;cursor:pointer;"><div style="font-size:20px;margin-bottom:4px;">'+t[1]+'</div><div style="font-size:13px;font-weight:600;">'+t[2]+'</div><div style="font-size:11px;color:#64748b;">'+t[3]+'</div></div>';
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

/* PUBLISH / NEW */
function publishBul(){
  if(!curBul||!confirm('Публикувай бюлетина за всички потребители?'))return;
  sbPatch('bulletins','id=eq.'+curBul.id,{status:'published',published_at:new Date().toISOString(),published_by:currentUser.display_name||currentUser.email}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('📤 Бюлетинът е публикуван!');
    /* Изпрати push нотификация до всички */
    if(typeof pushBulletinPublished==='function'){
      pushBulletinPublished(curBul.week_number,curBul.year,bulTasks.length);
    }
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
      var dt=bulTasks.filter(function(t){return t.due_date===ds;});
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
