/* push.js — OneSignal Push нотификации */

var OS_APP_ID  = 'a326639e-4ace-46f5-baa7-3f6259431d18';
var OS_API_KEY = 'os_v2_app_umtghhskzzdplovhh5rfsqy5dc236yo6m3audceswsow4phydw43skbrewfawzapgha7mf7s3dckm2sh2zpgxsexihcw2hhnfqhy5mi';
var OS_PORTAL  = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* ─── INIT ──────────────────────────────────────────────── */
function initPush(user) {
  /* Init е в index.html — тук само задаваме таговете за потребителя */
  if (!user) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.User.addTags({
        store_name:   user.store_name   || '',
        role:         user.role         || '',
        display_name: user.display_name || user.email || ''
      });
      if (user.email) await OneSignal.login(user.email);
    } catch(e) { console.log('OneSignal tags:', e.message); }
  });
}

/* ─── ИЗПРАТИ НОТИФИКАЦИЯ ────────────────────────────────── */
var SB_NOTIFY_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/functions/v1/resend-email';
var SB_NOTIFY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';

function osSend(payload) {
  if (!payload.url) payload.url = OS_PORTAL;
  /* Викаме Supabase Edge Function като proxy */
  return fetch(SB_NOTIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'push',
      title: (payload.headings && (payload.headings.bg || payload.headings.en)) || '',
      message: (payload.contents && (payload.contents.bg || payload.contents.en)) || '',
      url: payload.url,
      filters: payload.filters || null
    })
  }).then(function(r) {
    return r.text().then(function(txt) {
      var d; try{d=JSON.parse(txt);}catch(e){d={message:txt};}
      return { ok: r.ok, status: r.status, data: d };
    });
  }).catch(function(err) {
    return { ok: false, status: 0, data: { message: 'Network error: ' + err.message } };
  });
}

/* ─── ДО ВСИЧКИ ─────────────────────────────────────────── */
function pushToAll(title, message) {
  return osSend({
    included_segments: ['All'],
    headings: { bg: title, en: title },
    contents: { bg: message, en: message }
  });
}

/* ─── ДО КОНКРЕТНИ МАГАЗИНИ ─────────────────────────────── */
function pushToStores(stores, title, message) {
  if (!stores || !stores.length) return pushToAll(title, message);
  /* OneSignal filters: store1 OR store2 OR ... */
  var filters = [];
  stores.forEach(function(store, i) {
    if (i > 0) filters.push({ operator: 'OR' });
    filters.push({ field: 'tag', key: 'store_name', relation: '=', value: store });
  });
  return osSend({
    filters: filters,
    headings: { bg: title, en: title },
    contents: { bg: message, en: message }
  });
}

/* ─── ДО РОЛЯ ───────────────────────────────────────────── */
function pushToRole(role, title, message) {
  return osSend({
    filters: [{ field: 'tag', key: 'role', relation: '=', value: role }],
    headings: { bg: title, en: title },
    contents: { bg: message, en: message }
  });
}

/* ═══════ БЮЛЕТИН НОТИФИКАЦИИ ════════════════════════════ */

/* При публикуване на бюлетина */
function pushBulletinPublished(wk, yr, taskCount) {
  var title = '📰 Т-Бюлетин С' + wk + ' · ' + yr + ' е публикуван';
  var msg   = taskCount
    ? 'Имате ' + taskCount + ' задачи тази седмица. Влез за подробности.'
    : 'Новият бюлетин е достъпен. Влез за подробности.';
  return pushToAll(title, msg).then(function(res) {
    if (res.ok) toast('🔔 Нотификацията е изпратена до всички!');
    else {
      var err = (res.data && (res.data.message || res.data.error)) || JSON.stringify(res.data);
      toast('❌ ' + res.status + ': ' + err, '#dc2626');
      console.error('Push error:', res);
    }
    return res;
  });
}

/* При задачи за днес (при влизане на управителя) */
function pushTasksToday(store, tasks) {
  if (!tasks || !tasks.length) return;
  var title = '📋 Задачи за днес — ' + store;
  var msg   = tasks.length === 1
    ? tasks[0].title
    : tasks.length + ' задачи чакат: ' + tasks.slice(0,2).map(function(t){return t.title;}).join(', ') + (tasks.length>2?'...':'');
  return pushToStores([store], title, msg);
}

/* При просрочени задачи (петък) */
function pushOverdue(overdueByStore, onDone) {
  var stores = Object.keys(overdueByStore);
  if (!stores.length) {
    toast('✅ Всички задачи са изпълнени — няма нотификации.');
    if (onDone) onDone(); return;
  }
  /* Нотификация до регионалните и контролинг */
  var storeList = stores.join(', ');
  var title = '⚠️ Незавършени задачи';
  var msg   = 'Магазини без изпълнение: ' + storeList;
  var sent  = 0;
  var total = 2; /* до logistics и accounting */
  function checkDone() { sent++; if (sent >= total && onDone) onDone(); }
  pushToRole('logistics', title, msg).then(checkDone);
  pushToRole('accounting', title, msg).then(checkDone);
  toast('🔔 Изпратено до регионалните и контролинг');
}

/* ═══════ AUTO CHECK при влизане ═════════════════════════ */
function checkPushTriggers(bulletin, tasks, completions) {
  if (!canEdit() || !bulletin || bulletin.status !== 'published') return;
  var now    = new Date();
  var dow    = now.getDay(); /* 1=Пон, 5=Петък */
  var today  = now.toISOString().slice(0, 10);

  /* Петък — просрочени */
  if (dow === 5) {
    var overdue = {};
    tasks.forEach(function(t) {
      if (!t.due_date || new Date(t.due_date) >= now) return;
      /* Намери магазини без изпълнение */
      sbGet('stores', 'select=name').then(function(stores) {
        if (!Array.isArray(stores)) return;
        stores.forEach(function(s) {
          var done = completions.some(function(c) {
            return c.task_id === t.id && c.store_name === s.name;
          });
          if (!done) {
            if (!overdue[s.name]) overdue[s.name] = [];
            overdue[s.name].push(t.title);
          }
        });
        if (Object.keys(overdue).length) showPushPrompt('overdue', overdue);
      });
    });
  }
}

function showPushPrompt(type, data) {
  var body = document.getElementById('bul-body'); if (!body) return;
  if (document.getElementById('push-prompt-banner')) return;
  var banner = document.createElement('div');
  banner.id = 'push-prompt-banner';
  banner.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;';
  if (type === 'overdue') {
    var count = Object.keys(data).length;
    banner.innerHTML =
      '<div style="font-size:13px;color:#856404;">⚠️ <b>' + count + ' магазина</b> имат незавършени задачи. Изпрати нотификация до регионалните?</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="push-send-btn" style="border:none;background:#dc3545;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Изпрати</button>' +
      '<button onclick="document.getElementById(\'push-prompt-banner\').remove()" style="border:1px solid #ccc;background:#fff;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Пропусни</button>' +
      '</div>';
    body.insertBefore(banner, body.firstChild);
    document.getElementById('push-send-btn').onclick = function() {
      pushOverdue(data, function() { banner.remove(); });
    };
  }
}

/* ═══════ НАПОМНЯЩИ НОТИФИКАЦИИ ЗА ЗАДАЧИ ════════════════ */
function checkTaskReminders(tasks, completions, storeName) {
  if (!tasks || !tasks.length) return;
  var today = new Date(); today.setHours(0,0,0,0);
  var urgent = [];
  var overdue = [];

  tasks.forEach(function(t) {
    if (!t.due_date) return;
    var done = completions.some(function(c){
      return c.task_id===t.id && c.store_name===storeName;
    });
    if (done) return;
    var due = new Date(t.due_date); due.setHours(0,0,0,0);
    var diff = Math.ceil((due-today)/86400000);
    if (diff < 0) overdue.push(t);
    else if (diff <= 2) urgent.push(t);
  });

  /* Изпрати само ако не е изпращано днес */
  var lastKey = 'task_reminder_' + today.toISOString().slice(0,10);
  if (localStorage.getItem(lastKey)) return;

  var title, msg;
  if (overdue.length) {
    title = '⚠️ Просрочени задачи — ' + storeName;
    msg = overdue.length + ' задачи са просрочени: ' +
      overdue.slice(0,2).map(function(t){return t.title;}).join(', ') +
      (overdue.length>2?'...':'');
  } else if (urgent.length) {
    title = '🔔 Спешни задачи — ' + storeName;
    msg = urgent.length + ' задачи изтичат скоро: ' +
      urgent.slice(0,2).map(function(t){return t.title;}).join(', ') +
      (urgent.length>2?'...':'');
  }

  if (title) {
    osSend({
      headings: {bg: title, en: title},
      contents: {bg: msg, en: msg},
      filters: [{field:'tag', key:'store_name', relation:'=', value: storeName}]
    }).then(function(res){
      if (res.ok) localStorage.setItem(lastKey, '1');
    });
  }
}

/* Понеделник сутрин — напомни за всички задачи */
function sendWeeklyTasksReminder(tasks, storeName) {
  if (!tasks || !tasks.length) return;
  var lastKey = 'weekly_reminder_' + new Date().toISOString().slice(0,10);
  if (localStorage.getItem(lastKey)) return;

  var title = '📋 ' + tasks.length + ' задачи за седмицата — ' + storeName;
  var msg = tasks.slice(0,3).map(function(t){return t.title;}).join(' · ') +
    (tasks.length>3?' · ...':'');

  osSend({
    headings: {bg: title, en: title},
    contents: {bg: msg, en: msg},
    filters: [{field:'tag', key:'store_name', relation:'=', value: storeName}]
  }).then(function(res){
    if (res.ok) localStorage.setItem(lastKey, '1');
  });
}
