/* push.js — OneSignal Push нотификации */

var OS_APP_ID  = 'a326639e-4ace-46f5-baa7-3f6259431d18';
var OS_API_KEY = 'os_v2_app_umtghhskzzdplovhh5rfsqy5daarybjwzqye5s4e2gsgrdgac7i5p4nzrdycy77iqhoja5x35xbqmgr46fhymhzunaenysvpfznfkey';
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
  var body = {
    title: (payload.headings && (payload.headings.bg || payload.headings.en)) || '',
    message: (payload.contents && (payload.contents.bg || payload.contents.en)) || '',
    url: payload.url,
    filters: payload.filters || null,
    included_segments: payload.included_segments || null
  };
  return fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/functions/v1/portal-push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SB_NOTIFY_KEY
    },
    body: JSON.stringify(body)
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

/* ─── ДО КОНКРЕТНИ ХОРА ─────────────────────────────────── */
/* Адресът на устройството е тагът display_name — initPush() задава само
   store_name, role и display_name, таг is_regional няма. Затова списъкът с
   хора се чете от базата (users.is_regional), а тагът служи единствено за
   адрес. Нов таг беше отхвърлен съзнателно: пише се чак при следващо влизане
   на човека, тоест известията щяха да са грешни, докато всички не се
   прелогнат, и щеше да се появи втори източник на истината до колоната.

   ⚠️ При празен списък НЕ пада към pushToAll(), за разлика от pushToStores():
   тук това би пратило известието до целия портал. */
function pushToPeople(displayNames, title, message) {
  var list = (Array.isArray(displayNames) ? displayNames : []).filter(function(n) {
    return n && typeof n === 'string';
  });
  if (!list.length) {
    return Promise.resolve({ ok: false, status: 0, data: { message: 'Няма получатели' } });
  }
  /* OneSignal filters: име1 OR име2 OR ... */
  var filters = [];
  list.forEach(function(name, i) {
    if (i > 0) filters.push({ operator: 'OR' });
    filters.push({ field: 'tag', key: 'display_name', relation: '=', value: name });
  });
  return osSend({
    filters: filters,
    headings: { bg: title, en: title },
    contents: { bg: message, en: message }
  });
}

/* ═══════ БЮЛЕТИН НОТИФИКАЦИИ ════════════════════════════ */

/* При добавяне на нова задача (от submitTask в bulletin.js) — до конкретните
   магазини, ако е таргетирана, иначе до всички. Не показва toast за успех/
   грешка тук - извикващият код (submitTask) вече показва свой toast. */
function pushNewBulletinTask(taskTitle, targetStores) {
  var title = '✅ Нова задача';
  var msg = taskTitle;
  return pushToStores(targetStores && targetStores.length ? targetStores : null, title, msg);
}

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
  var stores = Object.keys(overdueByStore || {});
  if (!stores.length) {
    toast('✅ Всички задачи са изпълнени — няма нотификации.');
    if (onDone) onDone(); return;
  }
  var storeList = stores.join(', ');
  var title = '⚠️ Незавършени задачи';
  var msg   = 'Магазини без изпълнение: ' + storeList;

  /* Получателите са регионалните по колоната users.is_regional — същият
     източник като бюлетина (report.js), не ново определение. Ролите не
     вършеха работа: 'logistics' са двата склада (общи акаунти, не хора),
     'accounting' са 20 счетоводителки, а В. Филев е регионален с роля admin.
     Контролингът, заради който е писана функцията, също е с роля admin и по
     старата заявка не получаваше нито едно известие. */
  sbGet('users', 'is_regional=eq.true&active=eq.true&select=email,display_name,assigned_stores')
  .then(function(regs) {
    /* sbGet НЕ отхвърля при грешка — при мрежов срив, 401 или счупена
       политика връща [] (shared.js ред 23). Празен списък при седем
       регионални в базата е СРИВ, не валидно състояние. Продължим ли,
       известието тръгва само до контролинга, а toast-ът отчита успех —
       същата поука като при autoCreateReturnFromDiff(). */
    if (!Array.isArray(regs) || !regs.length) {
      toast('❌ Списъкът с регионални не се зареди — известието НЕ е изпратено', '#dc2626');
      if (onDone) onDone(); return;
    }
    var names = [];
    regs.forEach(function(u) {
      var mine = u.assigned_stores;
      /* Регионален без зачисления или без пресичане — известието не го засяга. */
      if (!Array.isArray(mine) || !mine.length || !u.display_name) return;
      var hit = mine.some(function(s) { return stores.indexOf(s) >= 0; });
      if (hit) names.push(u.display_name);
    });
    /* Контролингът няма зачислени обекти и получава винаги. Защитата е за
       случая, в който тестов харнес зареди само push.js — в index.html
       bulletin.js стои преди него, тоест константата е налична.

       ⚠️ Адресът е тагът display_name, а имената идват от REPORT_GROUPS в
       bulletin.js. Проверено на 25.08.2026 — съвпадат точно с
       users.display_name в базата. Преименуване на човек от таб
       Администрация спира push-а към него ТИХО, без грешка, докато
       REPORT_GROUPS не бъде обновен. Регионалните не са засегнати —
       техните имена идват от същата заявка към users. */
    var ctl = (typeof REPORT_GROUPS === 'undefined' || !REPORT_GROUPS.controlling)
      ? [] : (REPORT_GROUPS.controlling.people || []);
    ctl.forEach(function(p) { if (p && p.name) names.push(p.name); });

    var uniq = [];
    names.forEach(function(n) { if (uniq.indexOf(n) < 0) uniq.push(n); });
    if (!uniq.length) {
      toast('Няма получатели за просрочени задачи', '#d97706');
      if (onDone) onDone(); return;
    }
    /* Едно известие до всички получатели, не по едно на човек. */
    return pushToPeople(uniq, title, msg).then(function(res) {
      if (res && res.ok) {
        toast('🔔 Изпратено до ' + uniq.length + (uniq.length === 1 ? ' получател' : ' получатели'));
      } else {
        var err = (res && res.data && (res.data.message || res.data.error)) || '';
        toast('❌ Известието не тръгна' + (err ? ': ' + err : ''), '#dc2626');
        console.error('Push overdue error:', res);
      }
      if (onDone) onDone();
    });
  });
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
  var overdue = [], dueSoon = [];

  tasks.forEach(function(t) {
    if (!t.due_date) return;
    var done = completions.some(function(c){
      return c.task_id===t.id && c.store_name===storeName;
    });
    if (done) return;
    var due = new Date(t.due_date); due.setHours(0,0,0,0);
    var diff = Math.ceil((due-today)/86400000);
    if (diff < 0)      overdue.push({task:t, diff:diff});
    else if (diff <= 3) dueSoon.push({task:t, diff:diff});
  });

  if (!overdue.length && !dueSoon.length) return;

  /* Изпрати само веднъж на ден */
  var lastKey = 'task_reminder_' + today.toISOString().slice(0,10) + '_' + storeName;
  try { if (localStorage.getItem(lastKey)) return; } catch(e){}

  var title, msg;
  if (overdue.length && dueSoon.length) {
    title = '⚠️ Задачи — ' + storeName;
    msg = overdue.length + ' просрочени · ' + dueSoon.length + ' изтичат скоро';
  } else if (overdue.length) {
    title = '⚠️ Просрочени задачи — ' + storeName;
    msg = overdue.slice(0,2).map(function(x){return x.task.title;}).join(', ') +
      (overdue.length>2?' и още '+(overdue.length-2):'');
  } else {
    var nearest = dueSoon.sort(function(a,b){return a.diff-b.diff;})[0];
    var daysLabel = nearest.diff===0?'Днес!':nearest.diff===1?'Утре':'след '+nearest.diff+' дни';
    title = '🔔 Задача изтича ' + daysLabel + ' — ' + storeName;
    msg = dueSoon.slice(0,2).map(function(x){return x.task.title;}).join(', ') +
      (dueSoon.length>2?' и още '+(dueSoon.length-2):'');
  }

  osSend({
    headings: {bg: title, en: title},
    contents: {bg: msg, en: msg},
    filters: [{field:'tag', key:'store_name', relation:'=', value: storeName}]
  }).then(function(res){
    if (res.ok) { try { localStorage.setItem(lastKey, '1'); } catch(e){} }
  });
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
