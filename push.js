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

/* ═══════ ТЕМИ ОТ bulletin-notify ════════════════════════
   Порталът НЕ смята сам кой е просрочен, кой получава и как изглежда
   писмото. Това го прави едж функцията `bulletin-notify` (крон 15 я вика на
   всеки 15 минути) и тя е ЕДИНСТВЕНИЯТ източник. Тук стояха pushOverdue(),
   checkPushTriggers() и showPushPrompt() — втора реализация на същото в
   браузъра. Разминат ли се двете, никой не забелязва: ръчното и
   автоматичното просто започват да казват различни неща.

   Функцията има вход точно за това: POST с тяло {"topic_key":"..."} пуска
   темата НЕЗАБАВНО, независимо от часа и от `active`. ({"dry_run":true}
   връща получателите, без да праща — не се ползва оттук.)

   Отговорът при topic_key е {ok, mode:'manual', bg_date, result}, а result е
   едно от трите:
     · {skipped:'Няма просрочени задачи', recipients:0}   — няма какво
     · {recipients, sent_emails, failed_emails, items}    — пратено
     · при 404/500 идва {ok:false, error} със съответния HTTP код

   Заглавните редове са същите като при auth-login (shared.js ред 771) и
   auth-set-password (admin.js ред 512): verify_jwt е включен, затова без
   Authorization функцията връща 401. */
function runNotifyTopic(topicKey, onDone) {
  toast('⏳ Изпращане...');
  fetch(SB_URL + '/functions/v1/bulletin-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SB_KEY, 'apikey': SB_KEY },
    body: JSON.stringify({ topic_key: topicKey })
  }).then(function(r) {
    /* Тялото се чете като текст и чак после се парсва — при 401 от gateway-я
       отговорът не е JSON и .json() би хвърлил, вместо да покаже кода. */
    return r.text().then(function(txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { d = { message: txt }; }
      return { ok: r.ok, status: r.status, data: d };
    });
  }).then(function(res) {
    var d = res.data || {};
    if (!res.ok || d.ok === false) {
      var err = d.error || d.message || ('HTTP ' + res.status);
      toast('❌ Известието НЕ тръгна: ' + String(err).slice(0, 150), '#dc2626');
      console.error('bulletin-notify error:', res);
      return;
    }
    var out = d.result || {};
    /* „Няма просрочени задачи" НЕ е успех и НЕ е грешка — нищо не е тръгнало.
       Затова toast-ът е неутрален и onDone не се вика: менюто остава
       отворено, за да се види съобщението. */
    if (out.skipped) { toast(String(out.skipped), '#64748b'); return; }
    var n = out.recipients || 0;
    var mails = out.sent_emails;
    toast('🔔 Изпратено до ' + n + (n === 1 ? ' получател' : ' получатели') +
          (typeof mails === 'number' ? ' (' + mails + ' писма)' : ''));
    if (onDone) onDone();
  }).catch(function(err) {
    /* Мрежов срив — fetch отхвърля, преди да има отговор. Мълчанието тук
       изглежда точно като успех, затова toast-ът е червен. */
    toast('❌ Мрежова грешка: ' + err.message, '#dc2626');
    console.error('bulletin-notify network error:', err);
  });
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
