/* email.js — Имейл нотификации чрез Resend API
   Тест: изпраща от onboarding@resend.dev
   Продукция: след верификация на temax.bg домейн в Resend */

var RESEND_KEY = 're_fUTBSVW2_P76jnDkZheuT4XtgXfiSPsck';
var EMAIL_FROM = 'ТеМАХ Бюлетин <onboarding@resend.dev>';
var EMAIL_TEST = ''; /* попълва се автоматично от currentUser */

/* ─── BASE SEND ─────────────────────────────────────────── */
function sendEmail(to, subject, html) {
  var toArr = Array.isArray(to) ? to : [to];
  /* Използваме Supabase Edge Function като proxy (решава CORS) */
  return fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/functions/v1/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: toArr, subject: subject, html: html })
  }).then(function(r) {
    return r.json().then(function(d) { return { ok: r.ok, data: d }; });
  });
}

/* ─── EMAIL TEMPLATES ────────────────────────────────────── */
function emailWrap(content, footer) {
  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' +
    'body{font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px;}' +
    '.wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}' +
    '.hdr{background:#0f172a;padding:20px 24px;text-align:center;}' +
    '.hdr-title{color:#fff;font-size:20px;font-weight:700;margin:0;}' +
    '.hdr-sub{color:#94a3b8;font-size:12px;margin-top:4px;}' +
    '.body{padding:20px 24px;}' +
    '.task{border-left:3px solid #2563eb;padding:8px 12px;margin-bottom:8px;background:#f8fafc;border-radius:0 6px 6px 0;}' +
    '.task-done{border-color:#16a34a;background:#f0fdf4;}' +
    '.task-over{border-color:#dc2626;background:#fff5f5;}' +
    '.task-title{font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px;}' +
    '.task-meta{font-size:11px;color:#64748b;}' +
    '.day-hdr{background:#1e293b;color:#fff;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:600;margin:14px 0 6px;}' +
    '.dept{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;margin-bottom:4px;}' +
    '.dept-trade{background:#f0fdf4;color:#14532d;}' +
    '.dept-warehouse{background:#eff6ff;color:#1e40af;}' +
    '.dept-admin{background:#f5f3ff;color:#4c1d95;}' +
    '.footer{background:#f8fafc;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;}' +
    '.btn{display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;margin-top:14px;}' +
    '</style></head><body>' +
    '<div class="wrap">' +
    '<div class="hdr"><div class="hdr-title">Т-Бюлетин ТеМАХ</div><div class="hdr-sub">Вътрешна платформа · temax.bg</div></div>' +
    '<div class="body">' + content + '</div>' +
    '<div class="footer">' + (footer||'ТеМАХ Вътрешна платформа · Автоматично съобщение') + '</div>' +
    '</div></body></html>';
}

/* ─── СЕДМИЧЕН ДАЙДЖЕСТ (Понеделник) ──────────────────── */
function buildWeeklyDigestHtml(storeName, tasks, wk, yr) {
  var DNAMES = ['Понеделник','Вторник','Сряда','Четвъртък','Петък'];
  var DKEYS  = ['mon','tue','wed','thu','fri'];
  var deptLabel = {trade:'🛒 Търговска', warehouse:'📦 Склад/Приемане', admin:'⚙️ Администрация'};
  var deptClass = {trade:'dept-trade', warehouse:'dept-warehouse', admin:'dept-admin'};

  var content = '<h2 style="color:#0f172a;margin:0 0 4px;">Добро утро! 👋</h2>' +
    '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">Задачи за <b>' + esc(storeName) + '</b> — Седмица ' + wk + ' · ' + yr + '</p>';

  /* Групирай по ден */
  var byDay = {};
  tasks.forEach(function(t) {
    if (!t.due_date) return;
    var d = new Date(t.due_date);
    var dow = (d.getDay() + 6) % 7; /* 0=Mon */
    if (dow >= 0 && dow <= 4) {
      if (!byDay[dow]) byDay[dow] = [];
      byDay[dow].push(t);
    }
  });

  /* Задачи без ден */
  var noDayTasks = tasks.filter(function(t) { return !t.due_date; });

  var hasTasks = false;
  [0,1,2,3,4].forEach(function(i) {
    if (!byDay[i] || !byDay[i].length) return;
    hasTasks = true;
    content += '<div class="day-hdr">📅 ' + DNAMES[i] + '</div>';
    byDay[i].forEach(function(t) {
      var dc = deptClass[t.department] || 'dept-admin';
      var dl = deptLabel[t.department] || t.department;
      content += '<div class="task">' +
        '<span class="dept ' + dc + '">' + dl + '</span>' +
        '<div class="task-title">' + esc(t.title || '') + '</div>' +
        (t.description ? '<div class="task-meta">' + esc(t.description) + '</div>' : '') +
        '</div>';
    });
  });

  if (noDayTasks.length) {
    hasTasks = true;
    content += '<div class="day-hdr">📋 За цялата седмица</div>';
    noDayTasks.forEach(function(t) {
      var dc = deptClass[t.department] || 'dept-admin';
      var dl = deptLabel[t.department] || t.department;
      content += '<div class="task">' +
        '<span class="dept ' + dc + '">' + dl + '</span>' +
        '<div class="task-title">' + esc(t.title || '') + '</div>' +
        '</div>';
    });
  }

  if (!hasTasks) {
    content += '<div style="text-align:center;padding:20px;color:#94a3b8;">Няма специални задачи за тази седмица.</div>';
  }

  content += '<div style="text-align:center;"><a href="https://tenchotenev13-afk.github.io/Tmax-store-portal/" class="btn">Отвори портала →</a></div>';

  return emailWrap(content,
    'Изпратено от ТеМАХ Вътрешна платформа · Понеделник ' + new Date().toLocaleDateString('bg-BG')
  );
}

/* ─── ПРОСРОЧЕНИ ЗАДАЧИ (Петък) ────────────────────────── */
function buildOverdueHtml(recipientName, overdueItems) {
  /* overdueItems = [{storeName, taskTitle, dept, due_date}] */
  var content = '<h2 style="color:#dc2626;margin:0 0 4px;">⚠️ Незавършени задачи</h2>' +
    '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">До <b>' + esc(recipientName) + '</b> — ' +
    new Date().toLocaleDateString('bg-BG') + '</p>';

  /* Групирай по магазин */
  var byStore = {};
  overdueItems.forEach(function(item) {
    if (!byStore[item.storeName]) byStore[item.storeName] = [];
    byStore[item.storeName].push(item);
  });

  var stores = Object.keys(byStore);
  if (!stores.length) {
    content += '<div style="text-align:center;padding:20px;color:#16a34a;font-size:15px;">✅ Всички задачи са изпълнени!</div>';
  } else {
    stores.forEach(function(store) {
      content += '<div style="font-weight:600;color:#0f172a;margin:12px 0 6px;font-size:14px;">🏪 ' + esc(store) + '</div>';
      byStore[store].forEach(function(item) {
        content += '<div class="task task-over">' +
          '<div class="task-title">🔴 ' + esc(item.taskTitle) + '</div>' +
          '<div class="task-meta">Срок: ' + (item.due_date ? new Date(item.due_date).toLocaleDateString('bg-BG') : 'тази седмица') + '</div>' +
          '</div>';
      });
    });
    content += '<p style="font-size:12px;color:#94a3b8;margin-top:16px;">Моля свържете се с магазините за уточнение.</p>';
  }

  content += '<div style="text-align:center;"><a href="https://tenchotenev13-afk.github.io/Tmax-store-portal/" class="btn">Виж анализа →</a></div>';

  return emailWrap(content,
    'Изпратено от ТеМАХ Вътрешна платформа · Петък ' + new Date().toLocaleDateString('bg-BG')
  );
}

/* ─── ИЗПРАТИ СЕДМИЧЕН ДАЙДЖЕСТ ────────────────────────── */
function sendWeeklyDigest(bulletin, tasks, onDone) {
  var wk = bulletin.week_number;
  var yr = bulletin.year;

  /* Вземи всички manager потребители */
  sbGet('users', 'role=eq.manager&active=eq.true&select=email,display_name,store_name').then(function(users) {
    if (!Array.isArray(users) || !users.length) {
      toast('Няма активни управители', '#dc2626'); return;
    }

    var sent = 0; var errors = 0;
    var pending = users.length;

    users.forEach(function(u) {
      if (!u.email) { pending--; return; }
      var storeTasks = tasks.filter(function(t) {
        return !t.target_stores || !t.target_stores.length ||
          t.target_stores.indexOf(u.store_name) >= 0;
      });
      var subject = 'Т-Бюлетин С' + wk + ' · ' + yr + ' — Задачи за седмицата';
      var html = buildWeeklyDigestHtml(u.store_name, storeTasks, wk, yr);
      sendEmail(u.email, subject, html).then(function(res) {
        if (res.ok) sent++; else errors++;
        pending--;
        if (pending <= 0) {
          /* Маркирай като изпратен */
          sbPatch('bulletins', 'id=eq.' + bulletin.id, {
            reminder_sent_at: new Date().toISOString()
          });
          toast('📧 Изпратени: ' + sent + ' имейла' + (errors ? ' | Грешки: ' + errors : ''));
          if (onDone) onDone();
        }
      }).catch(function() {
        errors++; pending--;
        if (pending <= 0) {
          toast('📧 Изпратени: ' + sent + ' | Грешки: ' + errors, errors ? '#d97706' : undefined);
          if (onDone) onDone();
        }
      });
    });
  });
}

/* ─── ИЗПРАТИ ПРОСРОЧЕНИ ЗАДАЧИ ────────────────────────── */
function sendOverdueAlerts(bulletin, tasks, completions, onDone) {
  /* Намери просрочени задачи */
  var now = new Date(); now.setHours(0,0,0,0);
  var overdueTasks = tasks.filter(function(t) {
    return t.due_date && new Date(t.due_date) < now;
  });

  if (!overdueTasks.length) {
    toast('✅ Няма просрочени задачи!');
    if (onDone) onDone();
    return;
  }

  /* Всички магазини */
  sbGet('stores', 'select=name').then(function(stores) {
    var allStores = Array.isArray(stores) ? stores.map(function(s) { return s.name; }) : [];

    /* За всеки просрочен task — кои магазини НЕ са го изпълнили */
    var overdueItems = [];
    overdueTasks.forEach(function(task) {
      allStores.forEach(function(store) {
        var done = completions.some(function(c) {
          return c.task_id === task.id && c.store_name === store;
        });
        if (!done) {
          overdueItems.push({
            storeName: store,
            taskTitle: task.title,
            dept: task.department,
            due_date: task.due_date
          });
        }
      });
    });

    if (!overdueItems.length) {
      toast('✅ Всички задачи са изпълнени!');
      if (onDone) onDone(); return;
    }

    /* Вземи регионални (logistics) + контролинг (accounting) */
    sbGet('users', 'role=in.(logistics,accounting)&active=eq.true&select=email,display_name,assigned_stores').then(function(recipients) {
      if (!Array.isArray(recipients) || !recipients.length) {
        toast('Няма получатели за просрочени задачи', '#d97706'); return;
      }

      var sent = 0; var errors = 0; var pending = recipients.length;

      recipients.forEach(function(u) {
        if (!u.email) { pending--; return; }

        /* Филтрирай само магазините, за които отговаря */
        var myStores = u.assigned_stores;
        var myItems = overdueItems;
        if (Array.isArray(myStores) && myStores.length) {
          myItems = overdueItems.filter(function(i) {
            return myStores.indexOf(i.storeName) >= 0;
          });
        }
        if (!myItems.length) { pending--; return; }

        var subject = '⚠️ Незавършени задачи — С' + bulletin.week_number + ' · ' + bulletin.year;
        var html = buildOverdueHtml(u.display_name || u.email, myItems);

        sendEmail(u.email, subject, html).then(function(res) {
          if (res.ok) sent++; else errors++;
          pending--;
          if (pending <= 0) {
            sbPatch('bulletins', 'id=eq.' + bulletin.id, {
              overdue_sent_at: new Date().toISOString()
            });
            toast('📧 Изпратени: ' + sent + (errors ? ' | Грешки: ' + errors : ''));
            if (onDone) onDone();
          }
        }).catch(function() {
          errors++; pending--;
          if (pending <= 0) {
            toast('📧 ' + sent + ' изпратени', errors ? '#d97706' : undefined);
            if (onDone) onDone();
          }
        });
      });
    });
  });
}

/* ─── ТЕСТ ИМЕЙЛ ─────────────────────────────────────────── */
function sendTestEmail(toEmail) {
  var html = emailWrap(
    '<h2 style="color:#0f172a;">✅ Тестов имейл от ТеМАХ Портал</h2>' +
    '<p style="color:#64748b;font-size:13px;">Имейл нотификациите работят правилно!</p>' +
    '<p style="font-size:13px;margin-top:12px;">Ще получавате:</p>' +
    '<ul style="font-size:13px;color:#374151;line-height:2;">' +
    '<li>📋 <b>Понеделник сутринта</b> — задачи за седмицата</li>' +
    '<li>⚠️ <b>Петък</b> — просрочени задачи (само ако има)</li>' +
    '</ul>' +
    '<div style="text-align:center;"><a href="https://tenchotenev13-afk.github.io/Tmax-store-portal/" class="btn">Отвори портала</a></div>'
  );
  sendEmail(toEmail, 'ТеМАХ Портал — Тест на имейл нотификации', html).then(function(res) {
    if (res.ok) toast('✅ Тестов имейл изпратен на ' + toEmail);
    else toast('❌ Грешка: ' + (res.data.message || JSON.stringify(res.data)), '#dc2626');
  }).catch(function(e) {
    toast('❌ Грешка: ' + e.message, '#dc2626');
  });
}

/* ─── AUTO CHECK (при зареждане на бюлетин) ─────────────── */
function checkBulletinEmailTriggers(bulletin, tasks, completions) {
  if (!canEdit() || !bulletin) return;

  var now = new Date();
  var dow = now.getDay(); /* 0=Sun, 1=Mon, ..., 5=Fri */
  var todayStr = now.toISOString().slice(0, 10);

  /* Понеделник — покажи бутон ако не е изпратен днес */
  if (dow === 1 && bulletin.status === 'published') {
    var lastSent = bulletin.reminder_sent_at ? bulletin.reminder_sent_at.slice(0,10) : null;
    if (lastSent !== todayStr) {
      showEmailPrompt('monday', bulletin, tasks, completions);
    }
  }

  /* Петък — покажи бутон ако не е изпратен днес */
  if (dow === 5 && bulletin.status === 'published') {
    var lastOver = bulletin.overdue_sent_at ? bulletin.overdue_sent_at.slice(0,10) : null;
    if (lastOver !== todayStr) {
      showEmailPrompt('friday', bulletin, tasks, completions);
    }
  }
}

function showEmailPrompt(type, bulletin, tasks, completions) {
  var existing = document.getElementById('email-prompt-banner');
  if (existing) return; /* вече показан */

  var bul_body = document.getElementById('bul-body');
  if (!bul_body) return;

  var banner = document.createElement('div');
  banner.id = 'email-prompt-banner';
  banner.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;';

  if (type === 'monday') {
    banner.innerHTML = '<div style="font-size:13px;color:#92400e;">📧 <b>Понеделник</b> — Изпрати седмичен дайджест до всички магазини?</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button onclick="sendWeeklyDigest(curBul,bulTasks,function(){document.getElementById(\'email-prompt-banner\').remove();})" style="border:none;background:#f59e0b;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати</button>' +
      '<button onclick="document.getElementById(\'email-prompt-banner\').remove()" style="border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Пропусни</button>' +
      '</div>';
  } else {
    banner.innerHTML = '<div style="font-size:13px;color:#92400e;">⚠️ <b>Петък</b> — Изпрати нотификации за незавършени задачи до регионалните?</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button onclick="sendOverdueAlerts(curBul,bulTasks,bulComps,function(){document.getElementById(\'email-prompt-banner\').remove();})" style="border:none;background:#dc2626;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати</button>' +
      '<button onclick="document.getElementById(\'email-prompt-banner\').remove()" style="border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Пропусни</button>' +
      '</div>';
  }

  bul_body.insertBefore(banner, bul_body.firstChild);
}
