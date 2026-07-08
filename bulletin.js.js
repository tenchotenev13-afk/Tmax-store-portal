/* bulletin.js v5 — 2026-07-08 — с редакция и изтриване на задачи */

/* CONFIG */
var BUL_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var BUL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var BUL_BKT = 'bulletin-files';
var BUL_PUB = BUL_SB + '/storage/v1/object/public/' + BUL_BKT + '/';

/* STATE */
var bulActiveDept = 'trade';
var curBul = null; var bulTasks = []; var bulComps = [];
var recurringTasks = []; var recurringComps = []; var subtaskComps = [];
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
function canEdit(){
  if(!currentUser) return false;
  var roles = ['admin','accounting','manager'];
  return roles.indexOf(currentUser.role) >= 0;
}
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
  var q=canEdit()?'order=created_at.desc&limit=1':'status=eq.published&order=created_at.desc&limit=1';
  sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
    recurringTasks=Array.isArray(rt)?rt:[];
  }).catch(function(){recurringTasks=[];});
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
      sbGet('task_completions',cq).then(function(c){
        bulComps=Array.isArray(c)?c:[];
        var storeF=isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name);
        sbGet('subtask_completions','select=*'+storeF).then(function(sc){
          subtaskComps=Array.isArray(sc)?sc:[];
          var rq='bulletin_id=eq.'+curBul.id+(isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name));
          sbGet('task_completions',rq+'&task_id=is.null').then(function(rc){
            recurringComps=Array.isArray(rc)?rc:[];
            renderBulletin();
          }).catch(function(){recurringComps=[];renderBulletin();});
        }).catch(function(){subtaskComps=[];renderBulletin();});
      }).catch(function(){bulComps=[];subtaskComps=[];recurringComps=[];renderBulletin();});
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
'.blk:hover .blk-copy{display:inline-block!important;}' +
'.blk-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px;}' +
'.blk-ta{width:100%;border:none;background:none;font-family:DM Sans,sans-serif;font-size:13px;color:#0f172a;resize:none;outline:none;}' +
'.task-overdue{outline:2px solid #dc2626;border-radius:6px;}' +
'.addblk{width:100%;padding:7px;border:1.5px dashed #cbd5e1;border-radius:7px;background:none;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;margin-top:6px;}' +
'.addblk:hover{border-color:#64748b;background:#f8fafc;color:#374151;}' +
'.bov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;}' +
'.bov.open{display:flex;}' +
'.bmod{background:#fff;border-radius:14px;padding:22px;width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;}' +
'.task-actions{display:inline-flex !important;gap:4px;flex-shrink:0;margin-left:8px;}' +
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
  win.document.write('<h2>'+d.icon+' '+d.label+' — Т-Бюлетин С'+curBul.week_number+'·'+curBul.year+'</h2>');
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
  html+='<div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:0;border-bottom:2px solid #e2e8f0;">';
  DCOLS.forEach(function(dk){
    var d=DEPTS[dk];
    var isAct=dk===bulActiveDept;
    html+='<button data-dk="'+dk+'" onclick="bulSetDept(this.dataset.dk)" id="dtab-'+dk+'" style="'+
      'border:none;background:'+(isAct?d.hdr:'#f8fafc')+';color:'+(isAct?'#fff':d.color)+';'+
      'padding:10px 20px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;'+
      'border-radius:8px 8px 0 0;border-bottom:none;transition:all .15s;">'+
      d.icon+' '+d.label+
    '</button>';
  });
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
        var isOverdue = due && diff < 0 && !done;
        html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;'+(isOverdue?'outline:2px solid #dc2626;border-radius:6px;padding:6px 8px;margin-bottom:2px;':'')+'">';
        html+='<input type="checkbox" '+(done?'checked ':'')+' data-tid="'+t.id+'" onchange="bulToggleTask(this)" style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:'+dept.color+';flex-shrink:0;">';
        html+='<div style="flex:1;"><div style="font-size:13px;font-weight:500;color:'+(done?'#94a3b8':'#0f172a')+';'+(done?'text-decoration:line-through;':'')+'">'+esc(t.title||'')+'</div>';
        if(t.description)html+='<div style="font-size:11px;color:#94a3b8;">'+esc(t.description)+'</div>';
        if(due)html+='<div style="font-size:10px;color:'+dueColor+';margin-top:2px;">📅 Срок: '+due.toLocaleDateString('bg-BG')+(diff<0?' ⚠️':diff===0?' (Днес!)':diff<=2?' ('+diff+' дни)':'')+"</div>";
        html+=renderSubtasks(t.id, dk);
        html+='</div>';
        /* БУТОНИ ЗА РЕДАКЦИЯ И ИЗТРИВАНЕ */
        if(canEdit()){
          html+='<div class="task-actions">';
          html+='<button onclick="openEditTaskModal(\'' + t.id + '\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;color:#2563eb;" title="Редактирай задача">✏️</button>';
          html+='<button onclick="bulDelTask(this)" data-task-id="' + t.id + '" style="border:1px solid #fecaca;background:#fff5f5;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;color:#dc2626;" title="Изтрий задача">✕</button>';
          html+='</div>';
        }
        html+='</div>';
      });
      html+='</div>';
    }
    /* Блокове */
    html += renderRecurringTasks(dk);
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
function editBlock(b,dk,i){
  var tl={text:'📝 Текст',alert:'🚨 Алерт',list:'📋 Списък',image:'📷 Снимка',file:'📎 Файл',divider:'— Разделител',important:'⭐ Важно'}[b.type]||b.type;
  var h='<div class="blk" id="eb-'+b.id+'" draggable="true" data-col="'+dk+'" data-idx="'+i+'" ondragstart="bulDragStart(this)" ondragover="bulDragOver(this)" ondragleave="bulDragLeave(this)" ondrop="bulDropBlock(this)">';
  h+='<button class="blk-del" data-col="'+dk+'" data-id="'+b.id+'" onclick="bulDelBlock(this)">✕</button>';
  h+='<button onclick="bulCopyToTab(\'' +dk+ '\',\'' +b.id+ '\')" style="position:absolute;right:28px;top:4px;border:none;background:#eff6ff;color:#2563eb;border-radius:4px;font-size:10px;padding:2px 6px;cursor:pointer;display:none;" class="blk-copy">→ Копирай</button>';
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
    h+='<textarea class="bl