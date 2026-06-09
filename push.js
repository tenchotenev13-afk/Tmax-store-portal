/* push.js — OneSignal Push нотификации */

var OS_APP_ID  = 'a326639e-4ace-46f5-baa7-3f6259431d18';
var OS_API_KEY = 'os_v2_app_umtghhskzzdplovhh5rfsqy5dc236yo6m3audceswsow4phydw43skbrewfawzapgha7mf7s3dckm2sh2zpgxsexihcw2hhnfqhy5mi';
var OS_PORTAL  = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* ─── INIT ──────────────────────────────────────────────── */
function initPush(user) {
  if (!window.OneSignal) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({
      appId: OS_APP_ID,
      serviceWorkerPath: 'OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: './' },
      promptOptions: {
        slidedown: {
          prompts: [{
            type: 'push',
            autoPrompt: true,
            delay: { pageViews: 1, timeDelay: 3 },
            text: {
              actionMessage: 'ТеМАХ Портал — Разреши нотификации за задачи и бюлетини',
              acceptButton: 'Разреши',
              cancelButton: 'По-късно'
            }
          }]
        }
      }
    });
    /* Задай тагове за потребителя */
    if (user) {
      await OneSignal.User.addTags({
        store_name: user.store_name || '',
        role:       user.role || '',
        display_name: user.display_name || user.email || ''
      });
      if (user.email) {
        await OneSignal.login(user.email);
      }
    }
  });
}

/* ─── ИЗПРАТИ НОТИФИКАЦИЯ ────────────────────────────────── */
function osSend(payload) {
  payload.app_id = OS_APP_ID;
  if (!payload.url) payload.url = OS_PORTAL;
  return fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + OS_API_KEY
    },
    body: JSON.stringify(payload)
  }).then(function(r) {
    return r.json().then(function(d) { return { ok: r.ok, data: d }; });
  }).catch(function(err) {
    return { ok: false, data: { message: err.message } };
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
    else        toast('❌ Грешка: ' + (res.data.message || ''), '#dc2626');
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
