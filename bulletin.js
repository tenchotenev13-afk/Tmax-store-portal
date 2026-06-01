/* bulletin.js — Т-Бюлетин Block Editor
   Пълен block-based редактор с drag&drop, upload, авторутинг */

/* ─── КОНФИГУРАЦИЯ ───────────────────────────────────────── */
var SB_BUL_URL  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1';
var SB_BUL_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var SB_BUL_BUCKET = 'bulletin-files';

var currentBulletin  = null;
var bulletinTasks    = [];
var taskCompletions  = [];
var bulletinMode     = 'view'; /* view | edit | analysis */
var _bulSaveTimer    = null;
var _dragBlock       = null;
var _dragCol         = null;

/* ─── ОТДЕЛИ ─────────────────────────────────────────────── */
var DEPTS = {
  trade:     { label:'Търговска',      icon:'🛒', color:'#14532d', bg:'#f0fdf4', border:'#bbf7d0', hdr:'#14532d' },
  warehouse: { label:'Склад/Приемане', icon:'📦', color:'#1e3a5f', bg:'#eff6ff', border:'#bfdbfe', hdr:'#1e3a5f' },
  admin:     { label:'Администрация',  icon:'⚙️', color:'#4c1d95', bg:'#f5f3ff', border:'#ddd6fe', hdr:'#4c1d95' }
};
var DEPT_KEYS = ['trade','warehouse','admin'];

function myDept() {
  var map = {manager:'trade',sklad:'warehouse',kasa:'admin',accounting:'admin',logistics:'admin',admin:'admin',info:'trade'};
  return currentUser ? (map[currentUser.role]||'trade') : 'trade';
}
function canEditBulletin() { return currentUser && ['admin','accounting'].indexOf(currentUser.role)>=0; }

/* ─── WEEK HELPERS ───────────────────────────────────────── */
function getWeekNum(d) {
  var dt=new Date(d); dt.setHours(0,0,0,0); dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  var w1=new Date(dt.getFullYear(),0,4);
  return 1+Math.round(((dt-w1)/86400000-3+(w1.getDay()+6)%7)/7);
}
function getWeekDays(wk,yr) {
  var s=new Date(yr,0,1+7*(wk-1));
  var dow=s.getDay(); if(dow<=4) s.setDate(s.getDate()-s.getDay()+1); else s.setDate(s.getDate()+8-s.getDay());
  return [0,1,2,3,4].map(function(i){var d=new Date(s);d.setDate(s.getDate()+i);return d;});
}
var DAY_NAMES=['Понеделник','Вторник','Сряда','Четвъртък','Петък'];
var DAY_KEYS=['mon','tue','wed','thu','fri'];
function fmtD(d){return d.getDate()+'.'+(d.getMonth()<9?'0':'')+(d.getMonth()+1);}
function genId(){return Math.random().toString(36).slice(2,9);}
function rawUrl(url){return (url||'').replace(/"/g,'%22');} /* для src/href - не escape-ваме & */

/* ─── LOAD ───────────────────────────────────────────────── */
function loadBulletin() {
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  wrap.innerHTML='<div style="display:flex;justify-content:center;align-items:center;height:300px;color:#94a3b8;font-size:16px;">⏳ Зареждане на бюлетин...</div>';
  var q=canEditBulletin()?'order=created_at.desc&limit=1':'status=eq.published&order=published_at.desc&limit=1';
  sbGet('bulletins',q).then(function(data){
    currentBulletin=(Array.isArray(data)&&data.length)?data[0]:null;
    if(!currentBulletin){renderBulletinEmpty();return;}
    if(currentBulletin.content&&typeof currentBulletin.content==='string'){
      try{currentBulletin.content=JSON.parse(currentBulletin.content);}catch(e){currentBulletin.content={};}
    }
    initContent();
    Promise.all([
      sbGet('bulletin_tasks','bulletin_id=eq.'+currentBulletin.id+'&order=due_date.asc'),
      sbGet('task_completions','task_id=in.('+([0].map(function(){return 'x';}).join(','))+')')
        .catch(function(){return[];})
    ]).then(function(r){
      bulletinTasks=Array.isArray(r[0])?r[0]:[];
      if(bulletinTasks.length){
        var ids=bulletinTasks.map(function(t){return t.id;}).join(',');
        var sq='task_id=in.('+ids+')';
        if(!isGlobal()) sq+='&store_name=eq.'+encodeURIComponent(currentUser.store_name);
        sbGet('task_completions',sq).then(function(c){taskCompletions=Array.isArray(c)?c:[];renderBulletin();});
      } else {taskCompletions=[];renderBulletin();}
    });
  }).catch(function(){wrap.innerHTML='<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';});
}

function initContent() {
  var c=currentBulletin.content||{};
  if(!c.columns){c.columns={trade:[],warehouse:[],admin:[]};}
  DEPT_KEYS.forEach(function(k){if(!c.columns[k])c.columns[k]=[];});
  if(!c.digest)c.digest=[];
  if(!c.calendar)c.calendar={};
  DAY_KEYS.forEach(function(k){if(!c.calendar[k])c.calendar[k]=[];});
  currentBulletin.content=c;
}

/* ─── SAVE (debounced) ───────────────────────────────────── */
function schedSave(){
  clearTimeout(_bulSaveTimer);
  _bulSaveTimer=setTimeout(function(){saveBulContent();},800);
}
function saveBulContent(){
  if(!currentBulletin)return;
  sbPatch('bulletins','id=eq.'+currentBulletin.id,{content:currentBulletin.content}).then(function(r){
    if(r.ok){showBulToast('💾 Запазено');}
  });
}
function showBulToast(msg){
  var t=document.getElementById('bul-toast');
  if(!t)return; t.textContent=msg; t.style.opacity='1';
  setTimeout(function(){t.style.opacity='0';},1800);
}

/* ─── ROUTE ──────────────────────────────────────────────── */
function renderBulletin(){
  if(bulletinMode==='analysis'){renderBulAnalysis();return;}
  if(bulletinMode==='edit'){renderBulEdit();return;}
  renderBulView();
}

/* ═══════════════════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════════════════ */
function bulHeader(){
  var b=currentBulletin;
  var wk=b?b.week_number:getWeekNum(new Date());
  var yr=b?b.year:new Date().getFullYear();
  var isDraft=b&&b.status==='draft';
  var canEdit=canEditBulletin();
  return '<div id="bul-toast" style="position:fixed;bottom:20px;right:20px;background:#16a34a;color:#fff;padding:7px 16px;border-radius:40px;font-size:12px;font-weight:600;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;"></div>'+
  '<div style="background:#0f172a;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;position:sticky;top:58px;z-index:99;box-shadow:0 2px 10px rgba(0,0,0,.4);">'+
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'+
      '<div style="font-size:17px;font-weight:600;color:#fff;">Т-Бюлетин <span style="color:#64748b;font-weight:400;">| Седмица '+wk+'</span></div>'+
      '<span style="font-family:DM Mono,monospace;font-size:11px;color:#94a3b8;padding:3px 10px;background:#1e293b;border-radius:40px;border:1px solid #334155;">С'+wk+' · '+yr+'</span>'+
      (isDraft?'<span style="background:#f59e0b;color:#78350f;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;">✏ Чернова</span>':'')+
    '</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+
      (canEdit&&bulletinMode!=='edit'?'<button onclick="bulletinMode=\'edit\';renderBulletin();" class="bul-btn">✏️ Редактирай</button>':'')+
      (canEdit&&bulletinMode==='edit'?'<button onclick="bulletinMode=\'view\';renderBulletin();" class="bul-btn">👁 Преглед</button>':'')+
      (canEdit?'<button onclick="bulletinMode=\'analysis\';renderBulletin();" class="bul-btn">📊 Анализ</button>':'')+
      (canEdit&&isDraft?'<button onclick="publishBulletin()" style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">📤 Публикувай</button>':'')+
      (canEdit?'<button onclick="newBulletin()" style="background:#2563eb;color:#fff;border:none;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">+ Нов бюлетин</button>':'')+
    '</div>'+
  '</div>';
}

/* ═══════════════════════════════════════════════════════════
   VIEW MODE
══════════════════════════════════════════════════════════ */
function renderBulView(){
  var wrap=document.getElementById('mod-bulletin');if(!wrap)return;
  var c=currentBulletin.content;
  var wk=currentBulletin.week_number; var yr=currentBulletin.year;
  var days=getWeekDays(wk,yr);
  var html=bulHeader()+'<style>.bul-btn{background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;}</style>'+
  '<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';

  /* Дайджест (important blocks + explicit digest) */
  var importantBlocks=[];
  DEPT_KEYS.forEach(function(k){
    (c.columns[k]||[]).forEach(function(bl){if(bl.type==='important')importantBlocks.push(bl);});
  });
  var allDigest=importantBlocks.concat(c.digest||[]);
  if(allDigest.length){
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
    html+='<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">⭐ Важно тази седмица</div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    allDigest.forEach(function(item){
      var ug=item.urgency||item.type||'info';
      var cols={ok:'#f0fdf4:#bbf7d0:#14532d',warn:'#fffbeb:#fde68a:#92400e',urgent:'#fff1f2:#fecaca:#991b1b',info:'#eff6ff:#bfdbfe:#1e3a5f'};
      var cl=(cols[ug]||cols.info).split(':');
      html+='<div style="background:'+cl[0]+';border:1px solid '+cl[1]+';border-radius:7px;padding:9px 12px;flex:1;min-width:180px;">';
      html+='<div style="font-size:12px;font-weight:600;color:'+cl[2]+';">'+esc(item.title||item.content||'')+'</div>';
      if(item.sub||item.subtitle) html+='<div style="font-size:11px;color:'+cl[2]+';opacity:.75;">'+esc(item.sub||item.subtitle)+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
  }

  /* Календар — auto from tasks + manual entries */
  html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html+='<div style="font-size:14px;font-weight:600;">📅 Седмичен календар — С'+wk+' · '+yr+'</div>';
  if(canEditBulletin()) html+='<button onclick="openCalModal()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави събитие</button>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">';
  DAY_KEYS.forEach(function(dayKey,i){
    var isToday=days[i].toISOString().slice(0,10)===today();
    var dayTasks=bulletinTasks.filter(function(t){return t.due_date===days[i].toISOString().slice(0,10);});
    var manualEntries=c.calendar[dayKey]||[];
    html+='<div style="border:1px solid '+(isToday?'#2563eb':'#e2e8f0')+';border-radius:7px;padding:10px 12px;min-height:80px;'+(isToday?'background:#eff6ff;':'')+'">'+
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">'+DAY_NAMES[i]+'</div>'+
      '<div style="font-family:DM Mono,monospace;font-size:19px;font-weight:500;color:'+(isToday?'#2563eb':'#0f172a')+';">'+fmtD(days[i])+'</div>';
    dayTasks.forEach(function(t){
      var d=DEPTS[t.department]||{color:'#94a3b8'};
      html+='<div style="display:flex;gap:4px;padding:2px 0;align-items:flex-start;">'+
        '<span style="width:6px;height:6px;border-radius:50%;background:'+d.color+';flex-shrink:0;margin-top:4px;"></span>'+
        '<span style="font-size:11px;font-weight:500;">'+esc(t.title||'')+'</span></div>';
    });
    manualEntries.forEach(function(e){
      html+='<div style="display:flex;gap:4px;padding:2px 0;align-items:flex-start;">'+
        '<span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;flex-shrink:0;margin-top:4px;"></span>'+
        '<span style="font-size:11px;">'+esc(e.title||'')+'</span></div>';
    });
    manualEntries.forEach(function(e,ei){
      html+='<div style="display:flex;gap:4px;padding:2px 0;align-items:center;">'+
        '<span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;flex-shrink:0;"></span>'+
        '<span style="font-size:11px;flex:1;">'+esc(e.title||'')+'</span>'+
        (canEditBulletin()?'<button onclick="removeCalEntry(\''+dayKey+'\','+ei+')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:11px;padding:0;line-height:1;">✕</button>':'')+
      '</div>';
    });
    if(!dayTasks.length&&!manualEntries.length) html+='<div style="font-size:11px;color:#cbd5e1;font-style:italic;margin-top:4px;">Свободен</div>';
    if(canEditBulletin()) html+='<button onclick="addCalEntryDay(\''+dayKey+'\')" style="width:100%;margin-top:4px;padding:3px;border:1px dashed #cbd5e1;border-radius:4px;background:none;color:#94a3b8;font-size:10px;cursor:pointer;">+ Добави</button>';
    html+='</div>';
  });
  html+='</div></div>';
  html+=calModal();

  /* 3 Колони */
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;">';
  DEPT_KEYS.forEach(function(deptKey){
    var dept=DEPTS[deptKey];
    var blocks=(c.columns[deptKey]||[]).filter(function(b){return b.type!=='task'&&b.type!=='important';});
    var tasks=bulletinTasks.filter(function(t){return t.department===deptKey;});
    var isMyDept=!isGlobal()&&myDept()===deptKey;
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">';
    html+='<div style="background:'+dept.hdr+';padding:12px 15px;display:flex;align-items:center;gap:9px;">'+
      '<div style="width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:14px;">'+dept.icon+'</div>'+
      '<div style="font-size:13px;font-weight:600;color:#fff;">'+dept.label+'</div></div>';
    html+='<div style="padding:13px;">';

    /* Блокове */
    blocks.forEach(function(bl){html+=renderBlockView(bl);});

    /* Задачи */
    if(tasks.length){
      html+='<div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin:10px 0 6px;padding-bottom:3px;border-bottom:1px solid #e2e8f0;">✅ Задачи тази седмица</div>';
      tasks.forEach(function(task){
        var comp=taskCompletions.find(function(c){return c.task_id===task.id&&(isGlobal()||c.store_name===currentUser.store_name);});
        var isDone=!!comp;
        var isOver=task.due_date&&new Date(task.due_date)<new Date()&&!isDone;
        html+='<div style="display:flex;align-items:flex-start;gap:8px;padding:7px;border-radius:7px;margin-bottom:4px;background:'+(isDone?'#f0fdf4':isOver?'#fff5f5':'#f8fafc')+';border:1px solid '+(isDone?'#bbf7d0':isOver?'#fecaca':'#e2e8f0')+';">';
        if(isMyDept&&!isGlobal()){
          html+='<input type="checkbox" '+(isDone?'checked':'')+' onchange="toggleTask(\''+task.id+'\',this.checked)" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:2px;">';
        } else {
          html+='<span style="width:16px;height:16px;border-radius:4px;border:1.5px solid '+(isDone?'#16a34a':'#e2e8f0')+';display:inline-flex;align-items:center;justify-content:center;background:'+(isDone?'#16a34a':'#fff')+';color:#fff;font-size:10px;flex-shrink:0;margin-top:2px;">'+(isDone?'✓':'')+'</span>';
        }
        html+='<div style="flex:1;"><div style="font-size:12.5px;font-weight:500;'+(isDone?'text-decoration:line-through;color:#94a3b8;':'')+'">'+esc(task.title||'')+'</div>';
        if(task.description) html+='<div style="font-size:11px;color:#64748b;">'+esc(task.description)+'</div>';
        if(task.due_date) html+='<div style="font-size:10px;color:'+(isOver?'#dc2626':isDone?'#16a34a':'#94a3b8')+';">'+(isOver?'🔴 Просрочена ':isDone?'✅ ':'📅 ')+fmtDate(task.due_date)+(isDone&&comp?' · '+esc(comp.completed_by||''):'')+'</div>';
        html+='</div></div>';
      });
    }

    if(!blocks.length&&!tasks.length) html+='<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0;">Няма съдържание.</div>';
    html+='</div></div>';
  });
  html+='</div>';

  /* Прогрес */
  if(bulletinTasks.length){
    var doneSet={};taskCompletions.forEach(function(c){doneSet[c.task_id]=1;});
    var done=Object.keys(doneSet).length; var total=bulletinTasks.length;
    var pct=Math.round(done/total*100);
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html+='<div style="font-size:13px;font-weight:600;">📊 Изпълнение на задачите</div>';
    if(canEditBulletin()) html+='<button onclick="bulletinMode=\'analysis\';renderBulletin();" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">Детайлен анализ →</button>';
    html+='</div>';
    html+='<div style="background:#e2e8f0;border-radius:20px;height:8px;overflow:hidden;"><div style="height:100%;border-radius:20px;background:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';width:'+pct+'%;"></div></div>';
    html+='<div style="font-size:12px;color:#64748b;margin-top:4px;">'+done+' от '+total+' задачи изпълнени ('+pct+'%)</div></div>';
  }
  html+='</div>';
  wrap.innerHTML=html;
}

function renderBlockView(bl){
  if(!bl||!bl.type)return '';
  if(bl.type==='text') return '<div style="font-size:13px;color:#374151;margin-bottom:8px;line-height:1.6;">'+esc(bl.content||'').replace(/\n/g,'<br>')+'</div>';
  if(bl.type==='alert'){
    var cols={red:'#fff1f2:#ef4444:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#22c55e:#14532d',blu:'#eff6ff:#3b82f6:#1e3a5f',pur:'#f5f3ff:#8b5cf6:#4c1d95'};
    var cl=(cols[bl.color||'blu']||cols.blu).split(':');
    return '<div style="background:'+cl[0]+';border-left:3px solid '+cl[1]+';color:'+cl[2]+';border-radius:0 7px 7px 0;padding:8px 11px;font-size:13px;margin-bottom:8px;">'+(bl.label?'<div style="font-size:10px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">'+esc(bl.label)+'</div>':'')+esc(bl.content||'').replace(/\n/g,'<br>')+'</div>';
  }
  if(bl.type==='list'){
    var items=(bl.content||'').split('\n').filter(Boolean);
    return '<ul style="list-style:none;margin-bottom:8px;">'+(items.map(function(i){return '<li style="padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:13px;display:flex;gap:6px;align-items:baseline;"><span style="color:#94a3b8;">›</span>'+esc(i)+'</li>';}).join(''))+'</ul>';
  }
  if(bl.type==='image'&&bl.url){
    return '<div style="margin-bottom:8px;border-radius:8px;overflow:hidden;"><img src="'+esc(bl.url)+'" style="width:100%;display:block;">'+(bl.caption?'<div style="font-size:11px;color:#64748b;padding:4px 2px;font-style:italic;">'+esc(bl.caption)+'</div>':'')+'</div>';
  }
  if(bl.type==='file'&&bl.url){
    return '<a href="'+rawUrl(bl.url)+'" target="_blank" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:7px;text-decoration:none;color:#0f172a;background:#f8fafc;margin-bottom:8px;">'+
      '<span style="font-size:20px;">📎</span><div><div style="font-size:12.5px;font-weight:500;">'+esc(bl.filename||'Файл')+'</div><div style="font-size:11px;color:#64748b;">Натисни за изтегляне</div></div></a>';
  }
  if(bl.type==='divider') return '<hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0;">';
  return '';
}


/* ─── CALENDAR FUNCTIONS ─────────────────────────────────── */
function calModal(){
  var dayOpts=DAY_KEYS.map(function(k,i){return '<option value=\''+k+'\'>'+DAY_NAMES[i]+'</option>';}).join('');
  var m=document.createElement('div');
  m.id='cal-modal';
  m.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;';
  m.innerHTML='<div style="background:#fff;border-radius:14px;padding:22px;width:420px;max-width:95vw;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">📅 Добави събитие в календара</div>' +
    '<label class="fl">Ден</label><select class="fi" id="cal-day">'+dayOpts+'</select>' +
    '<label class="fl">Заглавие</label><input class="fi" id="cal-title" placeholder="напр. Инвентаризация на склада">' +
    '<label class="fl">Описание (по избор)</label><input class="fi" id="cal-desc" placeholder="Допълнителна информация">' +
    '<label class="fl">Отдел</label>' +
    '<select class="fi" id="cal-dept"><option value="general">— Общо</option><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад</option><option value="admin">⚙️ Администрация</option></select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button id="cal-cancel" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitCalEntry()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div>';
  m.addEventListener('click',function(e){if(e.target===m)m.style.display='none';});
  return m.outerHTML;
}

function closeCalModal2(){var m=document.getElementById('cal-modal');if(m)m.style.display='none';}
function closeCalModal(e){if(e&&e.target!==e.currentTarget)return;document.getElementById('cal-modal').style.display='none';}
function openCalModal(dayKey){
  document.getElementById('cal-modal').style.display='flex';
  if(dayKey&&document.getElementById('cal-day'))document.getElementById('cal-day').value=dayKey;
}
function addCalEntryDay(dayKey){ openCalModal(dayKey); }

function submitCalEntry(){
  var title=(document.getElementById('cal-title').value||'').trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  var dayKey=document.getElementById('cal-day').value;
  var desc=document.getElementById('cal-desc').value;
  var dept=document.getElementById('cal-dept').value;
  var c=currentBulletin.content;
  if(!c.calendar)c.calendar={};
  if(!c.calendar[dayKey])c.calendar[dayKey]=[];
  c.calendar[dayKey].push({title:title,desc:desc,dept:dept});
  document.getElementById('cal-modal').style.display='none';
  document.getElementById('cal-title').value='';
  schedSave(); renderBulletin();
  toast('✅ Събитието е добавено!');
}

function removeCalEntry(dayKey,idx){
  var c=currentBulletin.content;
  if(c.calendar&&c.calendar[dayKey])c.calendar[dayKey].splice(idx,1);
  schedSave(); renderBulletin();
}

/* ─── TASK TOGGLE ────────────────────────────────────────── */
function toggleTask(taskId,checked){
  var store=currentUser.store_name, by=currentUser.display_name||currentUser.email;
  if(checked){
    sbPost('task_completions',{task_id:taskId,store_name:store,completed_by:by}).then(function(r){
      if(!r.ok){toast('Грешка','#dc2626');return;}
      toast('✅ Задачата е изпълнена!'); loadBulletin();
    });
  } else {
    sbDelete('task_completions','task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)).then(function(){
      toast('↩ Размаркирано'); loadBulletin();
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   EDIT MODE — Block Editor
══════════════════════════════════════════════════════════ */
function renderBulEdit(){
  var wrap=document.getElementById('mod-bulletin');if(!wrap)return;
  var c=currentBulletin.content;
  var wk=currentBulletin.week_number; var yr=currentBulletin.year;
  var days=getWeekDays(wk,yr);

  var html=bulHeader()+
  '<style>'+
  '.bul-btn{background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;}'+
  '.blk{border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#fff;position:relative;cursor:grab;transition:border-color .15s,box-shadow .15s;}'+
  '.blk:hover{border-color:#94a3b8;box-shadow:0 2px 8px rgba(0,0,0,.06);}'+
  '.blk.drag-over{border-color:#2563eb;background:#eff6ff;}'+
  '.blk-drag{position:absolute;left:-18px;top:50%;transform:translateY(-50%);color:#cbd5e1;cursor:grab;font-size:14px;user-select:none;}'+
  '.blk-del{position:absolute;right:4px;top:4px;width:20px;height:20px;border:none;background:#fee2e2;color:#dc2626;border-radius:50%;font-size:11px;cursor:pointer;display:none;align-items:center;justify-content:center;font-weight:700;line-height:1;}'+
  '.blk:hover .blk-del{display:flex;}'+
  '.blk-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:4px;}'+
  '.blk-ta{width:100%;border:none;background:none;font-family:DM Sans,sans-serif;font-size:13px;color:#0f172a;resize:none;outline:none;min-height:40px;}'+
  '.add-blk{width:100%;padding:7px;border:1.5px dashed #cbd5e1;border-radius:7px;background:none;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;margin-top:4px;transition:.15s;}'+
  '.add-blk:hover{border-color:#64748b;background:#f8fafc;color:#374151;}'+
  '.col-edit{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;}'+
  '.col-body{padding:14px;position:relative;}'+
  '</style>'+
  '<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">'+
  '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:#92400e;">✏️ <b>Режим на редактиране</b> — Промените се записват автоматично. Натисни <b>+ Добави блок</b> за да добавиш съдържание.</div>';

  /* Задачи секция */
  html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  html+='<div style="font-size:13px;font-weight:600;">✅ Задачи за седмицата</div>';
  html+='<button onclick="openTaskModal()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">+ Добави задача</button></div>';
  if(bulletinTasks.length){
    html+='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>'+
      '<th style="text-align:left;padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Задача</th>'+
      '<th style="text-align:left;padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th>'+
      '<th style="text-align:left;padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th>'+
      '<th style="padding:5px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;"></th>'+
      '</tr></thead><tbody>';
    bulletinTasks.forEach(function(task){
      var d=DEPTS[task.department]||{label:task.department,color:'#94a3b8',bg:'#f3f4f6',border:'#e2e8f0'};
      html+='<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:6px 8px;"><div style="font-weight:500;">'+esc(task.title||'')+'</div>'+(task.description?'<div style="font-size:11px;color:#64748b;">'+esc(task.description)+'</div>':'')+'</td>'+
        '<td style="padding:6px 8px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.border+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+d.label+'</span></td>'+
        '<td style="padding:6px 8px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(task.due_date)+'</td>'+
        '<td style="padding:6px 8px;"><button onclick="deleteTask(\''+task.id+'\')" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕</button></td>'+
        '</tr>';
    });
    html+='</tbody></table></div>';
  } else {
    html+='<div style="color:#94a3b8;font-size:13px;padding:8px 0;">Няма задачи. Добави за магазините с бутона горе вдясно.</div>';
  }
  html+='</div>';

  /* 3 Колони с блок едитор */
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">';
  DEPT_KEYS.forEach(function(deptKey){
    var dept=DEPTS[deptKey];
    var blocks=c.columns[deptKey]||[];
    html+='<div class="col-edit">'+
      '<div style="background:'+dept.hdr+';padding:12px 15px;display:flex;align-items:center;justify-content:space-between;">'+
        '<div style="font-size:13px;font-weight:600;color:#fff;">'+dept.icon+' '+dept.label+'</div>'+
      '</div>'+
      '<div class="col-body" id="col-'+deptKey+'" ondragover="event.preventDefault()" ondrop="onDropCol(event,\''+deptKey+'\')">';
    blocks.forEach(function(bl,i){
      html+=renderBlockEdit(bl,deptKey,i);
    });
    html+='<button class="add-blk" onclick="openBlockPicker(\''+deptKey+'\')">+ Добави блок</button>';
    html+='</div></div>';
  });
  html+='</div></div>';

  /* Модали */
  html+=taskModalHtml()+blockPickerHtml();
  wrap.innerHTML=html;
}

function renderBlockEdit(bl,deptKey,i){
  var typeLabels={text:'📝 Текст',alert:'🚨 Алерт',list:'📋 Списък',image:'📷 Снимка',file:'📎 Файл',divider:'— Разделител',important:'⭐ Важно'};
  var html='<div class="blk" id="blk-'+bl.id+'" draggable="true" '+
    'ondragstart="onDragStart(event,\''+deptKey+'\','+i+')" '+
    'ondragover="event.preventDefault();this.classList.add(\'drag-over\');" '+
    'ondragleave="this.classList.remove(\'drag-over\');" '+
    'ondrop="onDropBlock(event,\''+deptKey+'\','+i+')">';
  html+='<button class="blk-del" onclick="deleteBlock(\''+deptKey+'\',\''+bl.id+'\')" title="Изтрий">✕</button>';
  html+='<div class="blk-lbl">'+( typeLabels[bl.type]||bl.type)+'</div>';

  if(bl.type==='text'){
    html+='<textarea class="blk-ta" rows="3" placeholder="Въведи текст..." oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'content\',this.value);schedSave()">'+esc(bl.content||'')+'</textarea>';
  } else if(bl.type==='alert'){
    var cols=['red','amb','grn','blu','pur'];
    var colNames={red:'Червено',amb:'Жълто',grn:'Зелено',blu:'Синьо',pur:'Лилаво'};
    html+='<select onchange="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'color\',this.value);schedSave()" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;">'+
      cols.map(function(c){return '<option value="'+c+'"'+(bl.color===c?' selected':'')+'>'+colNames[c]+'</option>';}).join('')+'</select><br>';
    html+='<input placeholder="Заглавие (по избор)" value="'+esc(bl.label||'')+'" oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'label\',this.value);schedSave()" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;margin-bottom:4px;font-family:inherit;"><br>';
    html+='<textarea class="blk-ta" rows="2" placeholder="Съдържание..." oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'content\',this.value);schedSave()">'+esc(bl.content||'')+'</textarea>';
  } else if(bl.type==='list'){
    html+='<textarea class="blk-ta" rows="4" placeholder="Всеки ред е нова точка от списъка..." oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'content\',this.value);schedSave()">'+esc(bl.content||'')+'</textarea>';
  } else if(bl.type==='important'){
    var urgOpts=['ok','warn','urgent','info'];
    var urgLabels={ok:'✅ OK',warn:'⚠️ Предупреждение',urgent:'🔴 Спешно',info:'ℹ️ Инфо'};
    html+='<select onchange="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'urgency\',this.value);schedSave()" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;">'+
      urgOpts.map(function(u){return '<option value="'+u+'"'+(bl.urgency===u?' selected':'')+'>'+urgLabels[u]+'</option>';}).join('')+'</select><br>';
    html+='<input placeholder="Заглавие *" value="'+esc(bl.title||'')+'" oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'title\',this.value);schedSave()" style="width:100%;font-size:13px;font-weight:600;border:1px solid #e2e8f0;border-radius:5px;padding:5px 7px;margin-bottom:4px;font-family:inherit;"><br>';
    html+='<input placeholder="Подзаглавие (по избор)" value="'+esc(bl.sub||'')+'" oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'sub\',this.value);schedSave()" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-family:inherit;">';
    html+='<div style="font-size:10px;color:#f59e0b;margin-top:4px;">⭐ Ще се покаже в &quot;Важно тази седмица&quot; секцията</div>';
  } else if(bl.type==='image'){
    if(bl.url){
      html+='<img src="'+rawUrl(bl.url)+'" style="width:100%;border-radius:5px;margin-bottom:4px;">';
      html+='<input placeholder="Подпис на снимката (по избор)" value="'+esc(bl.caption||'')+'" oninput="updateBlockField(\''+deptKey+'\',\''+bl.id+'\',\'caption\',this.value);schedSave()" style="width:100%;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 7px;font-family:inherit;">';
    } else {
      html+='<label style="display:flex;flex-direction:column;align-items:center;padding:16px;border:1.5px dashed #cbd5e1;border-radius:7px;cursor:pointer;color:#64748b;font-size:12px;">'+
        '<span style="font-size:28px;margin-bottom:6px;">📷</span>Избери снимка (JPG/PNG)'+
        '<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" onchange="uploadBulFile(\''+deptKey+'\',\''+bl.id+'\',this,\'image\')">'+
        '</label>';
    }
  } else if(bl.type==='file'){
    if(bl.url){
      html+='<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:6px;">'+
        '<span style="font-size:20px;">📎</span>'+
        '<div><div style="font-size:12px;font-weight:500;">'+esc(bl.filename||'Файл')+'</div>'+
        '<a href="'+rawUrl(bl.url)+'" target="_blank" style="font-size:11px;color:#2563eb;">Изтегли</a></div></div>';
    } else {
      html+='<label style="display:flex;flex-direction:column;align-items:center;padding:16px;border:1.5px dashed #cbd5e1;border-radius:7px;cursor:pointer;color:#64748b;font-size:12px;">'+
        '<span style="font-size:28px;margin-bottom:6px;">📎</span>Избери файл (PDF/Word/Excel)'+
        '<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" onchange="uploadBulFile(\''+deptKey+'\',\''+bl.id+'\',this,\'file\')">'+
        '</label>';
    }
  } else if(bl.type==='divider'){
    html+='<hr style="border:none;border-top:1px solid #e2e8f0;">';
  }
  html+='</div>';
  return html;
}

/* ─── DRAG & DROP ────────────────────────────────────────── */
function onDragStart(e,col,idx){
  _dragBlock={col:col,idx:idx};
  e.dataTransfer.effectAllowed='move';
}
function onDropBlock(e,col,idx){
  e.preventDefault(); e.stopPropagation();
  if(!_dragBlock)return;
  var c=currentBulletin.content;
  var from=c.columns[_dragBlock.col];
  var bl=from.splice(_dragBlock.idx,1)[0];
  if(!bl)return;
  var to=c.columns[col];
  if(col!==_dragBlock.col||idx!==_dragBlock.idx){
    to.splice(idx,0,bl);
    schedSave(); renderBulletin();
  }
  _dragBlock=null;
}
function onDropCol(e,col){
  e.preventDefault();
  if(!_dragBlock)return;
  var c=currentBulletin.content;
  var from=c.columns[_dragBlock.col];
  var bl=from.splice(_dragBlock.idx,1)[0];
  if(!bl)return;
  c.columns[col].push(bl);
  schedSave(); renderBulletin();
  _dragBlock=null;
}

/* ─── BLOCK ACTIONS ──────────────────────────────────────── */
function updateBlockField(col,id,field,val){
  var blocks=currentBulletin.content.columns[col];
  var bl=blocks.find(function(b){return b.id===id;});
  if(bl)bl[field]=val;
}
function deleteBlock(col,id){
  if(!confirm('Изтрий блока?'))return;
  var c=currentBulletin.content;
  c.columns[col]=c.columns[col].filter(function(b){return b.id!==id;});
  schedSave(); renderBulletin();
}

/* ─── BLOCK PICKER ───────────────────────────────────────── */
var _pickerDept=null;
function openBlockPicker(dept){
  _pickerDept=dept;
  document.getElementById('block-picker-overlay').style.display='flex';
}
function closeBlockPicker(){document.getElementById('block-picker-overlay').style.display='none';}
function addBlock(type){
  closeBlockPicker();
  var bl={id:genId(),type:type,content:''};
  if(type==='alert')bl.color='blu';
  if(type==='important')bl.urgency='info';
  currentBulletin.content.columns[_pickerDept].push(bl);
  schedSave(); renderBulletin();
}
function blockPickerHtml(){
  var types=[
    {type:'text',icon:'📝',label:'Текст',desc:'Обикновен параграф'},
    {type:'alert',icon:'🚨',label:'Алерт',desc:'Цветна кутия — важно съобщение'},
    {type:'important',icon:'⭐',label:'Важно',desc:'Автоматично → секция Важно горе'},
    {type:'list',icon:'📋',label:'Списък',desc:'Точки с информация'},
    {type:'image',icon:'📷',label:'Снимка',desc:'Качи JPG/PNG от компютъра'},
    {type:'file',icon:'📎',label:'Файл',desc:'PDF/Word/Excel за изтегляне'},
    {type:'divider',icon:'—',label:'Разделител',desc:'Хоризонтална линия'},
  ];
  return '<div id="block-picker-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;" onclick="if(event.target===this)closeBlockPicker();">'+
    '<div style="background:#fff;border-radius:16px;padding:22px;width:480px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:15px;font-weight:600;">Избери тип блок</div>'+
    '<button onclick="closeBlockPicker()" style="border:none;background:none;font-size:18px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">'+
    types.map(function(t){
      return '<div onclick="addBlock(\''+t.type+'\')" style="border:1px solid #e2e8f0;border-radius:9px;padding:12px 14px;cursor:pointer;transition:.15s;" onmouseover="this.style.borderColor=\'#94a3b8\';this.style.background=\'#f8fafc\';" onmouseout="this.style.borderColor=\'#e2e8f0\';this.style.background=\'#fff\';">'+
        '<div style="font-size:20px;margin-bottom:4px;">'+t.icon+'</div>'+
        '<div style="font-size:13px;font-weight:600;">'+t.label+'</div>'+
        '<div style="font-size:11px;color:#64748b;">'+t.desc+'</div></div>';
    }).join('')+
    '</div></div></div>';
}

/* ─── FILE UPLOAD ────────────────────────────────────────── */
function uploadBulFile(col,blockId,input,fileType){
  var file=input.files[0]; if(!file)return;
  var ext=file.name.split('.').pop();
  var path='bulletin/'+currentBulletin.id+'/'+blockId+'.'+ext;
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(SB_BUL_URL+'/object/'+SB_BUL_BUCKET+'/'+encodeURIComponent(path),{
      method:'POST',
      headers:{'Authorization':'Bearer '+SB_BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      if(!r.ok){toast('Грешка при качване','#dc2626');return;}
      /* Вземи signed URL */
      fetch(SB_BUL_URL+'/object/sign/'+SB_BUL_BUCKET+'/'+encodeURIComponent(path),{
        method:'POST',headers:{'Authorization':'Bearer '+SB_BUL_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({expiresIn:31536000})
      }).then(function(r2){return r2.json();}).then(function(d){
        var url=d.signedURL?'https://xiwkdiqqplgdcrkewgtv.supabase.co'+d.signedURL:'';
        var c=currentBulletin.content;
        var bl=c.columns[col].find(function(b){return b.id===blockId;});
        if(bl){
          bl.url=url;
          if(fileType==='file'){bl.filename=file.name;}
          schedSave(); renderBulletin();
          toast('✅ Файлът е качен!');
        }
      });
    });
  };
  reader.readAsArrayBuffer(file);
}

/* ─── TASK MODAL ─────────────────────────────────────────── */
function taskModalHtml(){
  return '<div id="task-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;" onclick="if(event.target===this)closeTaskModal();">'+
    '<div style="background:#fff;border-radius:16px;padding:22px;width:460px;max-width:95vw;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✅ Нова задача</div>'+
    '<label class="fl">Заглавие *</label><input class="fi" id="tk-title" placeholder="напр. Провери наличностите"><br>'+
    '<label class="fl">Описание</label><input class="fi" id="tk-desc" placeholder="Допълнителна информация"><br>'+
    '<label class="fl">Отдел</label>'+
    '<select class="fi" id="tk-dept"><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад/Приемане</option><option value="admin">⚙️ Администрация</option></select><br>'+
    '<label class="fl">Срок (дата)</label><input type="date" class="fi" id="tk-due"><br>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'+
    '<button onclick="closeTaskModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitTask()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави задача</button>'+
    '</div></div></div>';
}
function openTaskModal(){
  document.getElementById('task-modal-overlay').style.display='flex';
  document.getElementById('tk-title').value='';
  document.getElementById('tk-desc').value='';
  document.getElementById('tk-due').value='';
}
function closeTaskModal(){document.getElementById('task-modal-overlay').style.display='none';}
function submitTask(){
  var title=(document.getElementById('tk-title').value||'').trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  sbPost('bulletin_tasks',{
    bulletin_id:currentBulletin.id,
    week_number:currentBulletin.week_number,
    year:currentBulletin.year,
    department:document.getElementById('tk-dept').value,
    title:title,
    description:document.getElementById('tk-desc').value,
    due_date:document.getElementById('tk-due').value||null
  }).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    closeTaskModal();toast('✅ Задачата е добавена!');loadBulletin();
  });
}
function deleteTask(id){
  if(!confirm('Изтрий задачата?'))return;
  sbDelete('bulletin_tasks','id=eq.'+id).then(function(){toast('Изтрита');loadBulletin();});
}

/* ─── PUBLISH / NEW ──────────────────────────────────────── */
function publishBulletin(){
  if(!currentBulletin||!confirm('Публикувай бюлетина? Всички потребители ще го видят.'))return;
  sbPatch('bulletins','id=eq.'+currentBulletin.id,{status:'published',published_at:new Date().toISOString(),published_by:currentUser.display_name||currentUser.email}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('📤 Бюлетинът е публикуван!');bulletinMode='view';loadBulletin();
  });
}
function newBulletin(){
  var now=new Date(); var wk=getWeekNum(now); var yr=now.getFullYear();
  if(!confirm('Създай нов бюлетин за Седмица '+wk+' · '+yr+'?'))return;
  sbPost('bulletins',{week_number:wk,year:yr,title:'Т-Бюлетин С'+wk+' · '+yr,content:{digest:[],calendar:{mon:[],tue:[],wed:[],thu:[],fri:[]},columns:{trade:[],warehouse:[],admin:[]}},status:'draft'}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Нов бюлетин е създаден!');bulletinMode='edit';loadBulletin();
  });
}
function renderBulletinEmpty(){
  var wrap=document.getElementById('mod-bulletin');if(!wrap)return;
  wrap.innerHTML='<div style="text-align:center;padding:60px;">'+
    '<div style="font-size:50px;margin-bottom:14px;">📰</div>'+
    '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">Няма бюлетин за тази седмица</div>'+
    '<div style="font-size:14px;color:#64748b;margin-bottom:20px;">Създай нов бюлетин за текущата седмица.</div>'+
    (canEditBulletin()?'<button onclick="newBulletin()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;">+ Създай бюлетин</button>':'<div style="color:#94a3b8;font-size:13px;">Бюлетинът ще бъде публикуван скоро.</div>')+
  '</div>';
}

/* ═══════════════════════════════════════════════════════════
   АНАЛИЗ
══════════════════════════════════════════════════════════ */
function renderBulAnalysis(){
  var wrap=document.getElementById('mod-bulletin');if(!wrap)return;
  var b=currentBulletin;
  var wk=b?b.week_number:getWeekNum(new Date());
  var html=bulHeader()+
  '<style>.bul-btn{background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;}</style>'+
  '<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';
  html+='<div style="font-size:18px;font-weight:600;margin-bottom:16px;">📊 Анализ — Седмица '+wk+'</div>';
  if(!bulletinTasks.length){
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:30px;text-align:center;color:#94a3b8;">Няма задачи за тази седмица.</div>';
    wrap.innerHTML=html+'</div>';return;
  }
  var doneSet={};taskCompletions.forEach(function(c){doneSet[c.task_id]=1;});
  var done=Object.keys(doneSet).length; var total=bulletinTasks.length;
  var storeSet={};taskCompletions.forEach(function(c){storeSet[c.store_name]=1;});
  var storesDone=Object.keys(storeSet).length;
  var overdueCount=bulletinTasks.filter(function(t){return t.due_date&&new Date(t.due_date)<new Date()&&!doneSet[t.id];}).length;
  html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
  [['📋 Задачи',total,'общо','#2563eb'],['✅ Изпълнени',done,'задачи','#16a34a'],['🔴 Просрочени',overdueCount,'без изпълнение','#dc2626'],['🏪 Магазини',storesDone,'са отметнали','#d97706']].forEach(function(card){
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+card[3]+';">'+
      '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+card[0]+'</div>'+
      '<div style="font-size:26px;font-weight:700;color:'+card[3]+';font-family:DM Mono,monospace;">'+card[1]+'</div>'+
      '<div style="font-size:11px;color:#94a3b8;">'+card[2]+'</div></div>';
  });
  html+='</div>';
  html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;">';
  html+='<div style="font-size:13px;font-weight:600;margin-bottom:12px;">Задачи — детайлно</div>';
  html+='<div id="analysis-table-wrap"><div style="text-align:center;padding:20px;color:#94a3b8;">⏳ Зареждане...</div></div>';
  html+='</div></div>';
  wrap.innerHTML=html;
  /* Зареди магазини и попълни таблицата */
  sbGet('stores','select=name&order=name').then(function(sd){
    var allStores=Array.isArray(sd)?sd.map(function(s){return s.name;}):[];
    var tbl='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>'+
      '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Задача</th>'+
      '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th>'+
      '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th>'+
      '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Изпълнили</th>'+
      '<th style="text-align:right;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">%</th>'+
      '</tr></thead><tbody>';
    bulletinTasks.forEach(function(task){
      var comps=taskCompletions.filter(function(c){return c.task_id===task.id;});
      var pct=allStores.length?Math.round(comps.length/allStores.length*100):0;
      var isOver=task.due_date&&new Date(task.due_date)<new Date()&&!doneSet[task.id];
      var d=DEPTS[task.department]||{label:task.department,color:'#94a3b8',bg:'#f3f4f6',border:'#e2e8f0'};
      tbl+='<tr style="border-bottom:1px solid #f1f5f9;'+(isOver?'background:#fff5f5;':'')+'">'+
        '<td style="padding:7px 10px;font-weight:500;">'+esc(task.title||'')+'</td>'+
        '<td style="padding:7px 10px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.border+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+d.label+'</span></td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:'+(isOver?'#dc2626':'#64748b')+';">'+fmtDate(task.due_date)+(isOver?' 🔴':'')+'</td>'+
        '<td style="padding:7px 10px;">'+
          (comps.length?comps.map(function(c){return '<span style="background:#dcfce7;color:#14532d;font-size:10px;padding:1px 6px;border-radius:20px;margin:1px 2px;display:inline-block;">'+esc(c.store_name)+'</span>';}).join(''):'<span style="color:#94a3b8;font-size:11px;">—</span>')+
        '</td>'+
        '<td style="padding:7px 10px;text-align:right;font-family:DM Mono,monospace;font-weight:700;color:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';">'+pct+'%</td>'+
      '</tr>';
    });
    tbl+='</tbody></table></div>';
    var tw=document.getElementById('analysis-table-wrap');
    if(tw)tw.innerHTML=tbl;
  });
}
