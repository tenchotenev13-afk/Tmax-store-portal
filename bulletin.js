/* bulletin.js — Т-Бюлетин модул
   Редактирай САМО тук при промени по бюлетина. */

var currentBulletin = null;
var bulletinTasks   = [];
var taskCompletions = [];
var bulletinMode    = 'view'; /* view | edit | analysis */

/* ─── DEPT CONFIG ─────────────────────────────────────────── */
var DEPTS = {
  trade:     { label:'Търговска',      icon:'🛒', color:'#14532d', bg:'#f0fdf4', border:'#bbf7d0' },
  warehouse: { label:'Склад/Приемане', icon:'📦', color:'#1e3a5f', bg:'#eff6ff', border:'#bfdbfe' },
  admin:     { label:'Администрация',  icon:'⚙️', color:'#4c1d95', bg:'#f5f3ff', border:'#ddd6fe' }
};

function myDept() {
  var map = { manager:'trade', sklad:'warehouse', kasa:'admin', accounting:'admin',
              logistics:'admin', admin:'admin', info:'trade' };
  return currentUser ? (map[currentUser.role] || 'trade') : 'trade';
}
function canEditBulletin() {
  return currentUser && ['admin','accounting'].indexOf(currentUser.role) >= 0;
}

/* ─── WEEK HELPERS ────────────────────────────────────────── */
function getWeekNumber(d) {
  var date = new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay()+6)%7);
  var week1 = new Date(date.getFullYear(),0,4);
  return 1 + Math.round(((date-week1)/86400000 - 3 + (week1.getDay()+6)%7)/7);
}
function getWeekDates(weekNum, year) {
  var simple = new Date(year,0,1+7*(weekNum-1));
  var dow = simple.getDay(); var ISOweekStart = simple;
  if (dow<=4) ISOweekStart.setDate(simple.getDate()-simple.getDay()+1);
  else ISOweekStart.setDate(simple.getDate()+8-simple.getDay());
  var days = [];
  for (var i=0;i<5;i++) {
    var d = new Date(ISOweekStart); d.setDate(ISOweekStart.getDate()+i);
    days.push(d);
  }
  return days;
}
function fmtDay(d) { return d.getDate()+'.'+(d.getMonth()+1<10?'0':'')+(d.getMonth()+1); }
var DAY_NAMES = ['Понеделник','Вторник','Сряда','Четвъртък','Петък'];
var DAY_KEYS  = ['mon','tue','wed','thu','fri'];

/* ─── LOAD ────────────────────────────────────────────────── */
function loadBulletin() {
  var wrap = document.getElementById('mod-bulletin');
  if (!wrap) return;
  wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:300px;color:#94a3b8;">⏳ Зареждане...</div>';

  /* Вземи последния публикуван (или чернова за admin) */
  var q = canEditBulletin()
    ? 'order=created_at.desc&limit=1'
    : 'status=eq.published&order=published_at.desc&limit=1';

  sbGet('bulletins', q).then(function(data) {
    currentBulletin = (Array.isArray(data) && data.length) ? data[0] : null;
    if (!currentBulletin) {
      if (canEditBulletin()) {
        renderBulletinEmpty();
      } else {
        wrap.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;"><div style="font-size:40px;margin-bottom:10px;">📰</div><div>Няма публикуван бюлетин тази седмица.</div></div>';
      }
      return;
    }
    /* Зареди задачите */
    sbGet('bulletin_tasks', 'bulletin_id=eq.'+currentBulletin.id+'&order=due_date.asc').then(function(t) {
      bulletinTasks = Array.isArray(t) ? t : [];
      /* Зареди изпълненията за текущия магазин */
      var taskIds = bulletinTasks.map(function(t){return t.id;});
      if (!taskIds.length) { taskCompletions=[]; renderBulletin(); return; }
      var store = isGlobal() ? '' : currentUser.store_name;
      var cq = store
        ? 'store_name=eq.'+encodeURIComponent(store)+'&task_id=in.('+taskIds.join(',')+')'
        : 'task_id=in.('+taskIds.join(',')+')'
      sbGet('task_completions', cq).then(function(c) {
        taskCompletions = Array.isArray(c) ? c : [];
        renderBulletin();
      }).catch(function(){ taskCompletions=[]; renderBulletin(); });
    }).catch(function(){ bulletinTasks=[]; renderBulletin(); });
  }).catch(function() {
    wrap.innerHTML = '<div style="color:#dc2626;padding:20px;text-align:center;">Грешка при зареждане на бюлетина.</div>';
  });
}

/* ─── RENDER ──────────────────────────────────────────────── */
function renderBulletin() {
  if (bulletinMode === 'analysis') { renderBulletinAnalysis(); return; }
  if (bulletinMode === 'edit')     { renderBulletinEdit();     return; }
  renderBulletinView();
}

function renderBulletinView() {
  var wrap = document.getElementById('mod-bulletin'); if (!wrap) return;
  var b = currentBulletin;
  var content = (b && b.content) ? b.content : {};
  var weekNum = b ? b.week_number : getWeekNumber(new Date());
  var year    = b ? b.year : new Date().getFullYear();
  var weekDates = getWeekDates(weekNum, year);
  var isDraft = b && b.status === 'draft';

  var html = bulletinHeader(weekNum, year, isDraft) +
    '<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';

  /* Дайджест */
  var digest = content.digest || [];
  if (digest.length || canEditBulletin()) {
    html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
    html += '<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">📋 Дайджест — ключови точки</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    digest.forEach(function(item) {
      var colors = {ok:'#f0fdf4:#bbf7d0:#14532d', warn:'#fffbeb:#fde68a:#92400e', urgent:'#fff1f2:#fecaca:#991b1b', info:'#eff6ff:#bfdbfe:#1e3a5f'};
      var c = (colors[item.type]||'#f8fafc:#e2e8f0:#374151').split(':');
      html += '<div style="background:'+c[0]+';border:1px solid '+c[1]+';border-radius:7px;padding:8px 11px;flex:1;min-width:185px;">' +
        '<div style="font-size:12px;font-weight:600;color:'+c[2]+';">'+esc(item.title||'')+'</div>' +
        (item.sub?'<div style="font-size:11px;color:'+c[2]+';opacity:.7;">'+esc(item.sub)+'</div>':'') +
        '</div>';
    });
    if (!digest.length) html += '<div style="color:#94a3b8;font-size:13px;">Няма елементи. Кликни Редактирай за да добавиш.</div>';
    html += '</div></div>';
  }

  /* Календар */
  html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
  html += '<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">📅 Седмичен календар</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">';
  var cal = content.calendar || {};
  DAY_KEYS.forEach(function(key, i) {
    var entries = cal[key] || [];
    var dateStr = fmtDay(weekDates[i]);
    var isToday = weekDates[i].toISOString().slice(0,10) === today();
    html += '<div style="border:1px solid '+(isToday?'#2563eb':'#e2e8f0')+';border-radius:7px;padding:10px 12px;'+
      (isToday?'background:#eff6ff;':'')+'min-height:76px;">';
    html += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">'+DAY_NAMES[i]+'</div>';
    html += '<div style="font-family:DM Mono,monospace;font-size:20px;font-weight:500;color:'+(isToday?'#2563eb':'#0f172a')+';">'+dateStr+'</div>';
    if (entries.length) {
      entries.forEach(function(e) {
        var dc = {trade:'#22c55e',warehouse:'#3b82f6',admin:'#8b5cf6',general:'#94a3b8'}[e.dept]||'#94a3b8';
        html += '<div style="display:flex;gap:5px;padding:3px 0;border-bottom:1px dashed #e2e8f0;align-items:flex-start;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:'+dc+';flex-shrink:0;margin-top:4px;"></span>' +
          '<div><div style="font-size:11.5px;font-weight:500;">'+esc(e.title||'')+'</div>' +
          (e.desc?'<div style="font-size:10px;color:#64748b;">'+esc(e.desc)+'</div>':'') +
          '</div></div>';
      });
    } else {
      html += '<div style="font-size:11px;color:#cbd5e1;font-style:italic;margin-top:4px;">Свободен</div>';
    }
    html += '</div>';
  });
  html += '</div></div>';

  /* 3 колони с задачи */
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;">';
  Object.keys(DEPTS).forEach(function(deptKey) {
    var dept = DEPTS[deptKey];
    var deptTasks = bulletinTasks.filter(function(t){return t.department===deptKey;});
    var deptBlocks = (content.columns && content.columns[deptKey]) ? content.columns[deptKey] : [];
    var isMyDept = !isGlobal() && myDept()===deptKey;

    html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">';
    html += '<div style="background:'+dept.color+';padding:12px 15px;display:flex;align-items:center;gap:9px;">';
    html += '<div style="width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:14px;">'+dept.icon+'</div>';
    html += '<div><div style="font-size:13px;font-weight:600;color:#fff;">'+dept.label+'</div></div></div>';
    html += '<div style="padding:13px;">';

    /* Текстови блокове */
    deptBlocks.forEach(function(block) {
      html += '<div style="margin-bottom:10px;">';
      if (block.label) html += '<div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #e2e8f0;">'+esc(block.label)+'</div>';
      if (block.type==='alert') {
        var colors={red:'#fff1f2:#ef4444:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#22c55e:#14532d',blu:'#eff6ff:#3b82f6:#1e3a5f'};
        var c=(colors[block.color]||'#f8fafc:#e2e8f0:#374151').split(':');
        html += '<div style="background:'+c[0]+';border-left:3px solid '+c[1]+';color:'+c[2]+';border-radius:0 7px 7px 0;padding:8px 11px;font-size:13px;margin-bottom:6px;">'+esc(block.text||'')+'</div>';
      } else {
        html += '<div style="font-size:13px;color:#374151;margin-bottom:6px;">'+esc(block.text||'')+'</div>';
      }
      html += '</div>';
    });

    /* Задачи */
    if (deptTasks.length) {
      html += '<div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #e2e8f0;">✅ Задачи тази седмица</div>';
      deptTasks.forEach(function(task) {
        var comp = taskCompletions.find(function(c){
          return c.task_id===task.id &&
            (isGlobal() || c.store_name===currentUser.store_name);
        });
        var isDone = !!comp;
        var isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isDone;
        var cbId = 'task-'+task.id;
        html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:7px;margin-bottom:5px;'+
          (isDone?'background:#f0fdf4;':'isOverdue'?'background:#fff5f5;':'background:#f8fafc;')+
          'border:1px solid '+(isDone?'#bbf7d0':isOverdue?'#fecaca':'#e2e8f0')+';">';
        if (isMyDept && !isGlobal()) {
          html += '<input type="checkbox" id="'+cbId+'" '+(isDone?'checked':'')+
            ' onchange="toggleTask(\''+task.id+'\',this.checked)" '+
            'style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:2px;">';
        } else {
          html += '<span style="width:16px;height:16px;border-radius:4px;border:1.5px solid #e2e8f0;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;background:'+(isDone?'#16a34a':'#fff')+';color:#fff;font-size:10px;">'+(isDone?'✓':'')+'</span>';
        }
        html += '<div style="flex:1;">';
        html += '<div style="font-size:12.5px;font-weight:500;'+(isDone?'text-decoration:line-through;color:#94a3b8;':'')+'">'+esc(task.title||'')+'</div>';
        if (task.description) html += '<div style="font-size:11px;color:#64748b;">'+esc(task.description)+'</div>';
        if (task.due_date) html += '<div style="font-size:10px;color:'+(isOverdue?'#dc2626':isDone?'#16a34a':'#94a3b8')+';">'+
          (isOverdue?'🔴 Просрочена: ':isDone?'✅ Изпълнена: ':'📅 Срок: ')+fmtDate(task.due_date)+'</div>';
        if (isDone && comp) html += '<div style="font-size:10px;color:#94a3b8;">'+esc(comp.completed_by||'')+'</div>';
        html += '</div></div>';
      });
    }

    if (!deptBlocks.length && !deptTasks.length) {
      html += '<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0;">Няма съдържание.</div>';
    }

    html += '</div></div>';
  });
  html += '</div>';

  /* Статистика за задачите */
  if (bulletinTasks.length) {
    var total = bulletinTasks.length;
    var done  = isGlobal()
      ? (function(){var s={};taskCompletions.forEach(function(c){s[c.task_id]=1;});return Object.keys(s).length;})()
      : taskCompletions.length;
    var pct = total ? Math.round(done/total*100) : 0;
    html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '<div style="font-size:13px;font-weight:600;">📊 Изпълнение на задачите</div>';
    if (canEditBulletin()) {
      html += '<button onclick="bulletinMode=\'analysis\';renderBulletin();" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">Детайлен анализ →</button>';
    }
    html += '</div>';
    html += '<div style="background:#e2e8f0;border-radius:20px;height:8px;overflow:hidden;margin-bottom:6px;">';
    html += '<div style="height:100%;border-radius:20px;background:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';width:'+pct+'%;transition:width .5s;"></div></div>';
    html += '<div style="font-size:12px;color:#64748b;">'+done+' от '+total+' задачи изпълнени ('+pct+'%)</div>';
    html += '</div>';
  }

  html += '</div>';
  wrap.innerHTML = html;
}

/* ─── TOGGLE TASK ─────────────────────────────────────────── */
function toggleTask(taskId, checked) {
  var store = currentUser.store_name;
  var by    = currentUser.display_name || currentUser.email;
  if (checked) {
    sbPost('task_completions', {
      task_id: taskId, store_name: store, completed_by: by
    }).then(function(res) {
      if (!res.ok) { toast('Грешка при отмятане','#dc2626'); return; }
      toast('✅ Задачата е маркирана като изпълнена!');
      loadBulletin();
    });
  } else {
    sbDelete('task_completions', 'task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)).then(function() {
      toast('↩ Задачата е размаркирана');
      loadBulletin();
    });
  }
}

/* ─── HEADER ──────────────────────────────────────────────── */
function bulletinHeader(weekNum, year, isDraft) {
  var canEdit = canEditBulletin();
  return '<div style="background:#0f172a;padding:13px 22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;position:sticky;top:58px;z-index:99;">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<div style="font-size:18px;font-weight:600;color:#fff;">Т-Бюлетин <span style="color:#64748b;font-weight:400;">| Седмица '+weekNum+'</span></div>' +
      '<span style="font-family:DM Mono,monospace;font-size:12px;color:#94a3b8;padding:4px 12px;background:#1e293b;border-radius:40px;border:1px solid #334155;">С'+weekNum+' · '+year+'</span>' +
      (isDraft?'<span style="background:#f59e0b;color:#78350f;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✏ Чернова</span>':'') +
    '</div>' +
    '<div style="display:flex;gap:7px;flex-wrap:wrap;">' +
      (canEdit && bulletinMode==='view'?'<button onclick="bulletinMode=\'edit\';renderBulletin();" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">✏️ Редактирай</button>':'') +
      (canEdit && bulletinMode==='edit'?'<button onclick="bulletinMode=\'view\';renderBulletin();" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">👁 Преглед</button>':'') +
      (canEdit?'<button onclick="bulletinMode=\'analysis\';renderBulletin();" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">📊 Анализ</button>':'') +
      (canEdit && isDraft?'<button onclick="publishBulletin()" style="background:#16a34a;color:#fff;border:none;padding:6px 16px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">📤 Публикувай</button>':'') +
      (canEdit?'<button onclick="newBulletin()" style="background:#2563eb;color:#fff;border:none;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">+ Нов бюлетин</button>':'') +
    '</div>' +
  '</div>';
}

/* ─── PUBLISH ─────────────────────────────────────────────── */
function publishBulletin() {
  if (!currentBulletin) return;
  if (!confirm('Публикувай бюлетина? Всички потребители ще го видят.')) return;
  sbPatch('bulletins','id=eq.'+currentBulletin.id,{
    status:'published',
    published_at: new Date().toISOString(),
    published_by: currentUser.display_name||currentUser.email
  }).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('📤 Бюлетинът е публикуван!');
    loadBulletin();
  });
}

/* ─── NEW BULLETIN ────────────────────────────────────────── */
function newBulletin() {
  var now = new Date();
  var wk  = getWeekNumber(now);
  var yr  = now.getFullYear();
  if (!confirm('Създай нов бюлетин за Седмица '+wk+' · '+yr+'?')) return;
  sbPost('bulletins',{
    week_number: wk, year: yr,
    title: 'Т-Бюлетин С'+wk+' · '+yr,
    content: { digest:[], calendar:{}, columns:{trade:[],warehouse:[],admin:[]} },
    status: 'draft'
  }).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Нов бюлетин е създаден!');
    bulletinMode='edit';
    loadBulletin();
  });
}

/* ─── EMPTY STATE ─────────────────────────────────────────── */
function renderBulletinEmpty() {
  var wrap = document.getElementById('mod-bulletin'); if(!wrap)return;
  wrap.innerHTML = '<div style="text-align:center;padding:60px;">' +
    '<div style="font-size:40px;margin-bottom:14px;">📰</div>' +
    '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">Няма бюлетин за тази седмица</div>' +
    '<div style="font-size:14px;color:#64748b;margin-bottom:20px;">Създай нов бюлетин за текущата седмица.</div>' +
    '<button onclick="newBulletin()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;">+ Създай бюлетин</button>' +
  '</div>';
}

/* ─── EDIT MODE ───────────────────────────────────────────── */
function renderBulletinEdit() {
  var wrap = document.getElementById('mod-bulletin'); if(!wrap)return;
  var b = currentBulletin;
  var content = (b&&b.content) ? (typeof b.content==='string'?JSON.parse(b.content):b.content) : {};
  var weekNum = b ? b.week_number : getWeekNumber(new Date());
  var year    = b ? b.year : new Date().getFullYear();
  var weekDates = getWeekDates(weekNum, year);

  content.digest    = content.digest || [];
  content.calendar  = content.calendar || {};
  content.columns   = content.columns || {trade:[],warehouse:[],admin:[]};
  DAY_KEYS.forEach(function(k){content.calendar[k]=content.calendar[k]||[];});

  var html = bulletinHeader(weekNum, year, true) +
    '<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">' +
    '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:#92400e;">✏️ <b>Режим на редактиране</b> — Промените се запазват автоматично при всяко действие. Натисни &quot;Публикувай&quot; за да стане видим за магазините.</div>';

  /* Дайджест редактиране */
  html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  html += '<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;">📋 Дайджест</div>';
  html += '<button onclick="addDigestItem()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави</button></div>';
  html += '<div id="digest-list">';
  content.digest.forEach(function(item, i) {
    html += digestItemEdit(item, i);
  });
  if (!content.digest.length) html += '<div style="color:#94a3b8;font-size:13px;">Няма елементи.</div>';
  html += '</div></div>';

  /* Задачи редактиране */
  html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  html += '<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;">✅ Задачи за изпълнение</div>';
  html += '<button onclick="openAddTaskModal()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави задача</button></div>';

  if (bulletinTasks.length) {
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>';
    html += '<th style="text-align:left;padding:6px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Задача</th>';
    html += '<th style="text-align:left;padding:6px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th>';
    html += '<th style="text-align:left;padding:6px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th>';
    html += '<th style="padding:6px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;"></th></tr></thead><tbody>';
    bulletinTasks.forEach(function(task) {
      var d = DEPTS[task.department]||{label:task.department,color:'#94a3b8'};
      html += '<tr style="border-bottom:1px solid #f1f5f9;">';
      html += '<td style="padding:6px 8px;"><div style="font-weight:500;">'+esc(task.title||'')+'</div>';
      html += (task.description?'<div style="font-size:11px;color:#64748b;">'+esc(task.description)+'</div>':'');
      html += '</td><td style="padding:6px 8px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.border+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+d.icon+' '+d.label+'</span></td>';
      html += '<td style="padding:6px 8px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(task.due_date)+'</td>';
      html += '<td style="padding:6px 8px;"><button onclick="deleteTask(\''+task.id+'\')" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  } else {
    html += '<div style="color:#94a3b8;font-size:13px;padding:10px 0;">Няма задачи. Добави задачи за магазините.</div>';
  }
  html += '</div>';

  /* Календар редактиране */
  html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">';
  html += '<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">📅 Седмичен календар</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">';
  DAY_KEYS.forEach(function(key, i) {
    var entries = content.calendar[key] || [];
    html += '<div style="border:1px solid #e2e8f0;border-radius:7px;padding:10px 12px;min-height:80px;">';
    html += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;">'+DAY_NAMES[i]+'</div>';
    html += '<div style="font-family:DM Mono,monospace;font-size:18px;font-weight:500;margin-bottom:6px;">'+fmtDay(weekDates[i])+'</div>';
    entries.forEach(function(e, ei) {
      html += '<div style="font-size:11px;padding:3px 0;border-bottom:1px dashed #f1f5f9;display:flex;justify-content:space-between;align-items:flex-start;">'+
        '<span>'+esc(e.title||'')+'</span>'+
        '<button onclick="removeCalEntry(\''+key+'\','+ei+')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:12px;padding:0 2px;">✕</button></div>';
    });
    html += '<button onclick="addCalEntry(\''+key+'\')" style="width:100%;margin-top:4px;padding:3px 6px;border:1px dashed #cbd5e1;border-radius:5px;background:none;color:#94a3b8;font-size:11px;cursor:pointer;">+ Добави</button>';
    html += '</div>';
  });
  html += '</div></div>';

  /* Колони редактиране */
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">';
  Object.keys(DEPTS).forEach(function(deptKey) {
    var dept = DEPTS[deptKey];
    var blocks = (content.columns && content.columns[deptKey]) ? content.columns[deptKey] : [];
    html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">';
    html += '<div style="background:'+dept.color+';padding:12px 15px;display:flex;align-items:center;justify-content:space-between;">';
    html += '<div style="font-size:13px;font-weight:600;color:#fff;">'+dept.icon+' '+dept.label+'</div>';
    html += '<button onclick="addColBlock(\''+deptKey+'\')" style="border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;">+ Блок</button></div>';
    html += '<div style="padding:13px;">';
    blocks.forEach(function(block, bi) {
      html += '<div style="border:1px solid #e2e8f0;border-radius:7px;padding:8px;margin-bottom:6px;background:#f8fafc;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">';
      html += '<input value="'+esc(block.label||'')+'" placeholder="Заглавие на блока" oninput="updateBlock(\''+deptKey+'\','+bi+',\'label\',this.value)" style="font-size:11px;font-weight:700;color:#64748b;border:none;background:none;width:100%;outline:none;">';
      html += '<button onclick="removeBlock(\''+deptKey+'\','+bi+')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:12px;flex-shrink:0;">✕</button></div>';
      html += '<textarea placeholder="Съдържание..." oninput="updateBlock(\''+deptKey+'\','+bi+',\'text\',this.value)" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:5px 8px;font-family:inherit;resize:vertical;min-height:50px;">'+esc(block.text||'')+'</textarea>';
      html += '</div>';
    });
    if (!blocks.length) html += '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:10px;">Натисни &quot;+ Блок&quot; за да добавиш.</div>';
    html += '</div></div>';
  });
  html += '</div></div>';

  /* Task modal */
  html += '<div id="task-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;">' +
    '<div style="background:#fff;border-radius:14px;padding:22px;width:460px;max-width:95vw;">' +
    '<h3 style="font-size:16px;font-weight:600;margin-bottom:14px;">+ Нова задача</h3>' +
    '<label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Заглавие *</label>' +
    '<input class="fi" id="task-title" placeholder="напр. Провери наличностите" style="margin-bottom:10px;"><br>' +
    '<label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Описание</label>' +
    '<input class="fi" id="task-desc" placeholder="Допълнителна информация" style="margin-bottom:10px;"><br>' +
    '<label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Отдел</label>' +
    '<select class="fi" id="task-dept" style="margin-bottom:10px;"><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад/Приемане</option><option value="admin">⚙️ Администрация</option></select>' +
    '<label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Срок</label>' +
    '<input type="date" class="fi" id="task-due" style="margin-bottom:16px;">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="closeTaskModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitTask()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави задача</button>' +
    '</div></div></div>';

  wrap.innerHTML = html;
}

function digestItemEdit(item, i) {
  var colors={ok:'✅ OK',warn:'⚠️ Предупреждение',urgent:'🔴 Спешно',info:'ℹ️ Информация'};
  return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;">' +
    '<select onchange="updateDigest('+i+',\'type\',this.value)" style="font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:4px;background:#f8fafc;">' +
    Object.keys(colors).map(function(k){return '<option value="'+k+'"'+(item.type===k?' selected':'')+'>'+colors[k]+'</option>';}).join('') +
    '</select>' +
    '<input value="'+esc(item.title||'')+'" placeholder="Заглавие" oninput="updateDigest('+i+',\'title\',this.value)" style="flex:1;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;">' +
    '<input value="'+esc(item.sub||'')+'" placeholder="Подзаглавие (по избор)" oninput="updateDigest('+i+',\'sub\',this.value)" style="flex:1;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;">' +
    '<button onclick="removeDigestItem('+i+')" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;">✕</button>' +
  '</div>';
}

/* Edit actions */
function saveBulletinContent(content) {
  if (!currentBulletin) return;
  sbPatch('bulletins','id=eq.'+currentBulletin.id,{content:content}).then(function(r){
    if(r.ok){currentBulletin.content=content;toast('💾 Запазено');}
    else toast('Грешка при запазване','#dc2626');
  });
}
function getEditContent(){return currentBulletin&&currentBulletin.content?
  (typeof currentBulletin.content==='string'?JSON.parse(currentBulletin.content):currentBulletin.content)
  :{digest:[],calendar:{},columns:{trade:[],warehouse:[],admin:[]}};}

function addDigestItem(){
  var c=getEditContent(); c.digest.push({type:'info',title:'',sub:''});
  saveBulletinContent(c); setTimeout(function(){renderBulletin();},300);
}
function removeDigestItem(i){var c=getEditContent();c.digest.splice(i,1);saveBulletinContent(c);setTimeout(function(){renderBulletin();},300);}
function updateDigest(i,field,val){var c=getEditContent();c.digest[i][field]=val;saveBulletinContent(c);}

function addCalEntry(dayKey){
  var title=prompt('Текст за '+DAY_NAMES[DAY_KEYS.indexOf(dayKey)]+':');
  if(!title)return;
  var dept=prompt('Отдел (trade/warehouse/admin/general):','general')||'general';
  var desc=prompt('Описание (по избор):');
  var c=getEditContent(); c.calendar[dayKey]=c.calendar[dayKey]||[];
  c.calendar[dayKey].push({title:title,dept:dept,desc:desc||''});
  saveBulletinContent(c);setTimeout(function(){renderBulletin();},300);
}
function removeCalEntry(dayKey,i){var c=getEditContent();c.calendar[dayKey].splice(i,1);saveBulletinContent(c);setTimeout(function(){renderBulletin();},300);}

function addColBlock(deptKey){
  var c=getEditContent(); c.columns=c.columns||{}; c.columns[deptKey]=c.columns[deptKey]||[];
  c.columns[deptKey].push({label:'',text:'',type:'text'});
  saveBulletinContent(c);setTimeout(function(){renderBulletin();},300);
}
function removeBlock(deptKey,i){var c=getEditContent();c.columns[deptKey].splice(i,1);saveBulletinContent(c);setTimeout(function(){renderBulletin();},300);}
function updateBlock(deptKey,i,field,val){var c=getEditContent();c.columns[deptKey][i][field]=val;saveBulletinContent(c);}

function openAddTaskModal(){document.getElementById('task-modal-overlay').style.display='flex';document.getElementById('task-title').value='';document.getElementById('task-desc').value='';document.getElementById('task-due').value='';}
function closeTaskModal(){document.getElementById('task-modal-overlay').style.display='none';}
function submitTask(){
  var title=document.getElementById('task-title').value.trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  sbPost('bulletin_tasks',{
    bulletin_id:currentBulletin.id,
    week_number:currentBulletin.week_number,
    year:currentBulletin.year,
    department:document.getElementById('task-dept').value,
    title:title,
    description:document.getElementById('task-desc').value,
    due_date:document.getElementById('task-due').value||null
  }).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    closeTaskModal();toast('✅ Задачата е добавена!');loadBulletin();
  });
}
function deleteTask(id){
  if(!confirm('Изтрий задачата?'))return;
  sbDelete('bulletin_tasks','id=eq.'+id).then(function(){toast('Изтрита');loadBulletin();});
}

/* ─── ANALYSIS ────────────────────────────────────────────── */
function renderBulletinAnalysis() {
  var wrap = document.getElementById('mod-bulletin'); if(!wrap)return;
  var b = currentBulletin;
  var weekNum = b?b.week_number:getWeekNumber(new Date());
  var year    = b?b.year:new Date().getFullYear();

  var html = bulletinHeader(weekNum, year, b&&b.status==='draft') +
    '<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';

  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">';
  html += '<div style="font-size:20px;font-weight:600;">📊 Анализ на задачите — Седмица '+weekNum+'</div>';
  html += '<button onclick="bulletinMode=\'view\';renderBulletin();" style="border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;">← Обратно</button>';
  html += '</div>';

  if (!bulletinTasks.length) {
    html += '<div class="card" style="text-align:center;padding:30px;color:#94a3b8;">Няма задачи за тази седмица.</div>';
    wrap.innerHTML=html+'</div>'; return;
  }

  /* Summary cards */
  var storeSet={}; taskCompletions.forEach(function(c){storeSet[c.store_name]=1;}); var stores=Object.keys(storeSet);
  var totalTasks = bulletinTasks.length;
  var doneSet={}; taskCompletions.forEach(function(c){doneSet[c.task_id]=1;}); var completedUniq=Object.keys(doneSet).length;
  var overdueTasks = bulletinTasks.filter(function(t){
    return t.due_date && new Date(t.due_date)<new Date() &&
      !taskCompletions.some(function(c){return c.task_id===t.id;});
  }).length;

  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
  html += mkAnalCard('📋 Задачи', totalTasks, 'общо', '#2563eb');
  html += mkAnalCard('✅ Изпълнени', completedUniq, 'задачи', '#16a34a');
  html += mkAnalCard('🔴 Просрочени', overdueTasks, 'без изпълнение', '#dc2626');
  html += mkAnalCard('🏪 Магазини', stores.length, 'са отметнали', '#d97706');
  html += '</div>';

  /* Per task completion */
  html += '<div class="card" style="margin-bottom:16px;"><div class="card-title">Задачи — детайлно изпълнение</div>';
  html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>';
  html += '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Задача</th>';
  html += '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th>';
  html += '<th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th>';
  html += '<th style="text-align:center;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Изпълнили магазини</th>';
  html += '<th style="text-align:right;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">%</th>';
  html += '</tr></thead><tbody>';

  sbGet('stores','select=name&order=name').then(function(storeData){
    var allStores = Array.isArray(storeData)?storeData.map(function(s){return s.name;}):[];
    var rows='';
    bulletinTasks.forEach(function(task){
      var comps = taskCompletions.filter(function(c){return c.task_id===task.id;});
      var deptStores = allStores; /* всички магазини трябва да изпълнят */
      var pct = deptStores.length ? Math.round(comps.length/deptStores.length*100) : 0;
      var isOver = task.due_date && new Date(task.due_date)<new Date() && comps.length<deptStores.length;
      var d = DEPTS[task.department]||{label:task.department,color:'#94a3b8',bg:'#f3f4f6',border:'#e2e8f0'};
      rows += '<tr style="border-bottom:1px solid #f1f5f9;'+(isOver?'background:#fff5f5;':'')+'">'+
        '<td style="padding:7px 10px;font-weight:500;">'+esc(task.title)+'</td>'+
        '<td style="padding:7px 10px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.border+';padding:2px 8px;border-radius:20px;font-size:11px;">'+d.label+'</span></td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:'+(isOver?'#dc2626':'#64748b')+';">'+fmtDate(task.due_date)+(isOver?' 🔴':'')+'</td>'+
        '<td style="padding:7px 10px;text-align:center;">'+
          comps.map(function(c){return '<span style="background:#dcfce7;color:#14532d;font-size:10px;padding:1px 7px;border-radius:20px;margin:1px;">'+esc(c.store_name)+'</span>';}).join('')+
          (comps.length===0?'<span style="color:#94a3b8;font-size:11px;">—</span>':'')+
        '</td>'+
        '<td style="padding:7px 10px;text-align:right;font-family:DM Mono,monospace;font-weight:700;color:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';">'+pct+'%</td>'+
      '</tr>';
    });
    var tbody = wrap.querySelector('tbody');
    if(tbody) tbody.innerHTML = rows;
  });

  html += '<tbody><tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">⏳ Зареждане...</td></tr></tbody>';
  html += '</table></div></div></div>';
  wrap.innerHTML = html;
}

function mkAnalCard(label, val, sub, col){
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+col+';">' +
    '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+label+'</div>' +
    '<div style="font-size:26px;font-weight:700;color:'+col+';font-family:DM Mono,monospace;">'+val+'</div>' +
    '<div style="font-size:11px;color:#94a3b8;">'+sub+'</div>' +
  '</div>';
}
