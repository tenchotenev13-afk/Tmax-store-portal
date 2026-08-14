/* report.js — Дневен/седмичен имейл репорт (за собственика + admin/logistics)
   ФАЗА 1 (текущата): ръчен тестов тригер от таб "Днес" — изпраща до подаден
   имейл, за да се провери съдържанието/визията преди да минем към истинска
   автоматика (pg_cron + Edge Function), която ще замести ръчния бутон.

   Използва sendEmail() от email.js за реалното изпращане (resend-email Edge
   Function). Използва DEPTS, toLocalISO, recurringIsDueToday от bulletin.js.
   Зарежда се СЛЕД bulletin.js и email.js в index.html.

   Важна особеност на данните: completion-ите на постоянните задачи
   (recurring_tasks) НЯМАТ дата — веднъж отметната постоянна задача остава
   отметната, докато някой не я отметне обратно (не се "нулира" всеки ден).
   Затова за постоянните задачи текстът в репорта casually казва "текущ
   статус", не "изпълнени днес". */

/* Базов адрес на живия портал — за deep-link редовете на магазините
   (?store=Име) и бутона "Отвори в портала". today.js/shared.js четат
   същия ?store= параметър и разгъват точно този магазин при отваряне. */
var PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* ═══════ ДНЕВЕН РЕПОРТ ═══════════════════════════════════ */

/* Събира данните за дневния репорт — идентична логика на today.js, за да
   съвпадат числата между живото табло и имейла. cb(data|null) */
function collectDailyReportData(cb){
  Promise.all([
    sbGet('bulletins','status=eq.published&order=created_at.desc&limit=1'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = (Array.isArray(results[0]) && results[0].length) ? results[0][0] : null;
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var recurringToday = allRecurring.filter(function(t){ return recurringIsDueToday(t); });
    var recurringNoDue = allRecurring.filter(function(t){
      return (t.due_weekday===null || t.due_weekday===undefined) && !t.due_time;
    });

    var todayISO = toLocalISO(new Date());
    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      var regularToday = allBulTasks.filter(function(t){ return t.due_date && String(t.due_date).slice(0,10)===todayISO; });

      var items = [];
      regularToday.forEach(function(t){ items.push({ id:t.id, kind:'regular', title:t.title, target_stores:t.target_stores||null }); });
      recurringToday.forEach(function(t){ items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null }); });

      var regIds = regularToday.map(function(t){ return t.id; });
      var recIds = recurringToday.map(function(t){ return t.id; });

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')') : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')') : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name')
      ]).then(function(r2){
        var regComps = Array.isArray(r2[0]) ? r2[0] : [];
        var recComps = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!u.store_name || u.store_name==='Централен офис' || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });

        var comps = [];
        regComps.forEach(function(c){ comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });
        recComps.forEach(function(c){ comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });

        var summary = reportBuildSummary(items, comps, stores, recurringNoDue.length);
        var todayKey = toLocalISO(new Date());
        var yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
        var yKey = toLocalISO(yesterday);
        reportSaveSnapshot('daily', todayKey, summary.overallPct, summary.totalDone, summary.totalAll);
        reportFetchSnapshot('daily', yKey, function(snap){
          summary.trendYesterday = snap;
          cb(summary);
        });
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* Записва тих snapshot (upsert по period_type+period_key) - захранва
   тенденцията на следващия ден/седмица. Не блокира и не гърми грешки -
   ако не мине, просто няма да има тенденция следващия път, не е критично. */
function reportSaveSnapshot(periodType, periodKey, overallPct, totalDone, totalAll){
  sbGet('report_snapshots','period_type=eq.'+periodType+'&period_key=eq.'+periodKey).then(function(rows){
    var existing = Array.isArray(rows) && rows.length ? rows[0] : null;
    var payload = { overall_pct: overallPct, total_done: totalDone, total_all: totalAll };
    if (existing) sbPatch('report_snapshots','id=eq.'+existing.id, payload);
    else {
      payload.period_type = periodType; payload.period_key = periodKey;
      sbPost('report_snapshots', payload);
    }
  }).catch(function(){});
}
function reportFetchSnapshot(periodType, periodKey, cb){
  sbGet('report_snapshots','period_type=eq.'+periodType+'&period_key=eq.'+periodKey).then(function(rows){
    cb(Array.isArray(rows) && rows.length ? rows[0] : null);
  }).catch(function(){ cb(null); });
}
function reportTrendHtml(currentPct, snapshot, label){
  if (!snapshot) return '';
  var diff = currentPct - snapshot.overall_pct;
  var arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  var color = diff > 0 ? '#2F9E5C' : diff < 0 ? '#C0392B' : '#94a3b8';
  var sign = diff > 0 ? '+' : '';
  return '<div style="text-align:center;font-size:12px;color:'+color+';font-weight:700;margin:6px 0 0;">'+arrow+' '+sign+diff+'% '+label+'</div>';
}

/* items:[{id,kind,title}] comps:[{item_id,kind,store_name,status,comment}] →
   обобщена статистика, споделена между дневния и седмичния builder.
   Само status='done' се брои за изпълнено; 'postponed' се извежда отделно
   в postponedList (за секцията "Отложени" в репорта), не участва в %. */
function reportBuildSummary(items, comps, stores, noDueCount){
  var totalDone=0, totalAll=0, laggards=0;
  var doneComps = comps.filter(function(c){ return c.status==='done'; });
  var postponedComps = comps.filter(function(c){ return c.status==='postponed'; });
  var rows = stores.map(function(s){
    /* само задачите, за които s е в обхват (target_stores празно/null = всички,
       или изрично включен), влизат в знаменателя на ТОЗИ магазин */
    var scoped = items.filter(function(it){
      return !it.target_stores || !it.target_stores.length || it.target_stores.indexOf(s)>=0;
    });
    var total = scoped.length;
    var done = scoped.filter(function(it){
      return doneComps.some(function(c){ return c.item_id===it.id && c.kind===it.kind && c.store_name===s; });
    }).length;
    var pct = total ? Math.round(done/total*100) : 0;
    totalDone += done; totalAll += total;
    if (pct < 50) laggards++;
    return { name:s, done:done, total:total, pct:pct };
  });
  rows.sort(function(a,b){ return a.pct - b.pct; }); /* изоставащите най-отгоре */
  var overallPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;
  var byPct = rows.slice().sort(function(a,b){ return b.pct - a.pct; });
  var postponedList = postponedComps.map(function(c){
    var it = items.find(function(x){ return x.id===c.item_id && x.kind===c.kind; });
    return { title: it ? it.title : '(неизвестна задача)', store: c.store_name, comment: c.comment || '' };
  });
  /* Изпълнени задачи С коментар/снимка - иначе съдържанието е невидимо в
     репорта, освен ако не отвориш конкретната задача в Бюлетин. */
  var commentedList = doneComps.filter(function(c){
    return c.comment || (c.photos && c.photos.length);
  }).map(function(c){
    var it = items.find(function(x){ return x.id===c.item_id && x.kind===c.kind; });
    return { title: it ? it.title : '(неизвестна задача)', store: c.store_name, comment: c.comment || '', photos: c.photos || [] };
  });
  return {
    overallPct: overallPct, totalDone: totalDone, totalAll: totalAll,
    laggards: laggards, storeCount: stores.length, rows: rows,
    top3: byPct.slice(0,3), bottom3: byPct.slice(-3).reverse(),
    noDueCount: noDueCount || 0, postponedList: postponedList, commentedList: commentedList
  };
}

function reportDotColor(p){ return p===100 ? '#2F9E5C' : p>=50 ? '#E0A425' : '#D4483A'; }
function reportPctColor(p){ return p===100 ? '#2F9E5C' : p>=50 ? '#B6841E' : '#C0392B'; }

function reportStatCell(num,label,color){
  return '<td style="width:25%;padding:4px;">' +
    '<div style="background:#F4F6FB;border-radius:8px;padding:14px 6px;text-align:center;">' +
    '<div style="font-size:20px;font-weight:800;color:'+color+';line-height:1.1;">'+num+'</div>' +
    '<div style="font-size:10px;color:#6B7280;margin-top:4px;">'+label+'</div></div></td>';
}
function reportStoreRow(r){
  var dc = reportDotColor(r.pct), pc = reportPctColor(r.pct);
  var href = PORTAL_URL + '?store=' + encodeURIComponent(r.name);
  return '<a href="'+href+'" style="display:table;width:100%;background:#F9FAFC;border-radius:8px;margin-bottom:8px;padding:12px 14px;box-sizing:border-box;text-decoration:none;color:inherit;">' +
    '<div style="display:table-cell;vertical-align:middle;width:20px;"><span style="width:11px;height:11px;border-radius:50%;display:inline-block;background:'+dc+';"></span></div>' +
    '<div style="display:table-cell;vertical-align:middle;"><div style="font-size:14px;font-weight:700;color:#1F2937;">'+esc(r.name)+'</div><div style="font-size:11px;color:#6B7280;margin-top:2px;">'+r.done+' от '+r.total+' задачи</div></div>' +
    '<div style="display:table-cell;vertical-align:middle;text-align:right;width:80px;"><span style="font-size:15px;font-weight:800;color:'+pc+';">'+r.pct+'%</span><span style="font-size:10px;color:#9CA3AF;margin-left:4px;">→</span></div>' +
    '</a>';
}
function reportTopBottomTable(top3, bottom3){
  var goodRows = top3.map(function(s,i){ return '<div style="font-size:12.5px;color:#1f2937;margin-bottom:4px;">'+(i+1)+'. '+esc(s.name)+' — '+s.pct+'%</div>'; }).join('');
  var badRows = bottom3.map(function(s,i){ return '<div style="font-size:12.5px;color:#1f2937;margin-bottom:4px;">'+(i+1)+'. '+esc(s.name)+' — '+s.pct+'%</div>'; }).join('');
  return '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:6px;"><tr>' +
    '<td style="width:50%;background:#E9F5EF;border-radius:8px;padding:12px 14px;vertical-align:top;"><div style="font-size:11px;font-weight:800;color:#2F7D5C;margin-bottom:8px;">🏆 ТОП 3</div>'+goodRows+'</td>' +
    '<td style="width:50%;background:#FDEEEA;border-radius:8px;padding:12px 14px;vertical-align:top;"><div style="font-size:11px;font-weight:800;color:#B4442E;margin-bottom:8px;">⚠️ ИЗИСКВАТ ВНИМАНИЕ</div>'+badRows+'</td>' +
    '</tr></table>';
}

function reportEmailShell(headerTitle, headerSub, bodyHtml, footerText){
  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:20px;background:#e8ecf3;font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;">' +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 18px rgba(30,39,97,.12);">' +
      '<div style="background:#1E2761;padding:26px 24px;">' +
        '<p style="color:#CADCFC;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">ТеМАХ Портал</p>' +
        '<h1 style="color:#fff;font-size:22px;margin:0 0 4px;font-weight:700;">'+headerTitle+'</h1>' +
        '<p style="color:#9DB3E8;font-size:13px;margin:0;">'+headerSub+'</p>' +
      '</div>' +
      '<div style="padding:20px;">' + bodyHtml + '</div>' +
      '<div style="padding:20px 24px 26px;text-align:center;">' +
        '<a href="'+PORTAL_URL+'" style="display:inline-block;background:#1E2761;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 26px;border-radius:7px;">Отвори в портала →</a>' +
        '<div style="font-size:11px;color:#9aa4b2;margin-top:14px;">'+footerText+'</div>' +
      '</div>' +
    '</div></body></html>';
}

function reportPostponedSectionHtml(postponedList){
  if (!postponedList || !postponedList.length) return '';
  var rows = postponedList.map(function(p){
    return '<div style="padding:8px 10px;border-bottom:1px solid #FDE68A;">' +
      '<div style="font-size:12.5px;font-weight:700;color:#78350f;">'+esc(p.title)+' <span style="font-weight:500;color:#92400e;">— '+esc(p.store)+'</span></div>' +
      (p.comment ? '<div style="font-size:11.5px;color:#92400e;margin-top:2px;">💬 '+esc(p.comment)+'</div>' : '') +
      '</div>';
  }).join('');
  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">⏱ Отложени задачи ('+postponedList.length+')</div>' +
    '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;">'+rows+'</div>' +
    '</div>';
}

/* Изпълнени задачи с коментар/снимка - за "вид задача с коментар/снимка" да
   се преглежда съдържанието директно в репорта, без да се отваря Бюлетин. */
function reportCommentedSectionHtml(commentedList){
  if (!commentedList || !commentedList.length) return '';
  var rows = commentedList.map(function(p){
    var h = '<div style="padding:8px 10px;border-bottom:1px solid #BBF7D0;">' +
      '<div style="font-size:12.5px;font-weight:700;color:#14532d;">'+esc(p.title)+' <span style="font-weight:500;color:#166534;">— '+esc(p.store)+'</span></div>';
    if (p.comment) h += '<div style="font-size:11.5px;color:#166534;margin-top:2px;">💬 '+esc(p.comment)+'</div>';
    if (p.photos && p.photos.length) {
      h += '<div style="margin-top:5px;">';
      p.photos.forEach(function(ph){
        h += '<img src="'+ph.url+'" style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid #bbf7d0;margin-right:5px;">';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }).join('');
  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">💬 Изпълнени с коментар/снимка ('+commentedList.length+')</div>' +
    '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;overflow:hidden;">'+rows+'</div>' +
    '</div>';
}

function buildDailyReportHtml(data){
  var body = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:6px;"><tr>' +
    reportStatCell(data.overallPct+'%','изпълнение за деня', data.overallPct===100?'#2F9E5C':data.overallPct>=50?'#1E2761':'#C0392B') +
    reportStatCell(data.totalDone+'/'+data.totalAll,'изпълнени задачи','#1E2761') +
    reportStatCell(String(data.laggards),'обекта без напредък', data.laggards>0?'#C0392B':'#2F9E5C') +
    reportStatCell(String(data.storeCount),'обекта общо','#1E2761') +
    '</tr></table>';
  body += reportTrendHtml(data.overallPct, data.trendYesterday, 'спрямо вчера');
  body += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти — изоставащите най-отгоре</div>';
  body += data.rows.map(reportStoreRow).join('');
  body += reportTopBottomTable(data.top3, data.bottom3);
  body += reportPostponedSectionHtml(data.postponedList);
  body += reportCommentedSectionHtml(data.commentedList);
  if (data.noDueCount > 0) {
    body += '<div style="margin-top:14px;padding:10px 14px;background:#FDF3E3;border-radius:8px;font-size:11.5px;color:#8A5A12;">'+
      '📋 '+data.noDueCount+' постоянни задачи без конкретен срок чакат преглед (не участват в % по-горе) — виж ги в таб „Днес".</div>';
  }
  var dateStr = new Date().toLocaleDateString('bg-BG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  return reportEmailShell('📋 Дневен репорт — Задачи', dateStr, body,
    'Автоматичен репорт · ТеМАХ Портал');
}

function sendDailyReportTest(toEmail){
  if (!toEmail) { toast('Въведи имейл','#dc2626'); return; }
  toast('⏳ Подготвям дневния репорт...');
  collectDailyReportData(function(data){
    if (!data) { toast('Грешка при събиране на данните','#dc2626'); return; }
    var html = buildDailyReportHtml(data);
    sendEmail(toEmail, '📋 ТеМАХ — Дневен репорт (тест)', html).then(function(res){
      if (res.ok) toast('✅ Дневен репорт изпратен на ' + toEmail);
      else toast('❌ ' + res.status + ': ' + ((res.data && (res.data.message||res.data.error)) || 'грешка'), '#dc2626');
    });
  });
}

/* ═══════ СЕДМИЧЕН РЕПОРТ ═══════════════════════════════════ */

/* За разлика от дневния, седмичният взима ВСИЧКИ задачи на текущия
   публикуван бюлетин (не само днешните) + всички постоянни задачи, които
   имат ден ИЛИ час зададен (т.е. не са от "без срок" групата). */
function collectWeeklyReportData(cb){
  Promise.all([
    sbGet('bulletins','status=eq.published&order=created_at.desc&limit=1'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = (Array.isArray(results[0]) && results[0].length) ? results[0][0] : null;
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var recurringScheduled = allRecurring.filter(function(t){
      return (t.due_weekday!==null && t.due_weekday!==undefined) || !!t.due_time;
    });
    var noDueCount = allRecurring.length - recurringScheduled.length;

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];

      var items = [];
      allBulTasks.forEach(function(t){ items.push({ id:t.id, kind:'regular', title:t.title, target_stores:t.target_stores||null }); });
      recurringScheduled.forEach(function(t){ items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null }); });

      var regIds = allBulTasks.map(function(t){ return t.id; });
      var recIds = recurringScheduled.map(function(t){ return t.id; });

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')') : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')') : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name')
      ]).then(function(r2){
        var regComps = Array.isArray(r2[0]) ? r2[0] : [];
        var recComps = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!u.store_name || u.store_name==='Централен офис' || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });

        var comps = [];
        regComps.forEach(function(c){ comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });
        recComps.forEach(function(c){ comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });

        var summary = reportBuildSummary(items, comps, stores, noDueCount);
        summary.weekLabel = bul ? ('Седмица ' + bul.week_number + ' · ' + bul.year) : 'Няма публикуван бюлетин';
        if (bul) {
          var thisKey = bul.year + '-W' + String(bul.week_number).padStart(2,'0');
          /* Опростено "предходна седмица" - не пресича година в edge-case
             седмица 1 (там просто няма да намери snapshot, деградира тихо
             до "без тенденция", не гърми). */
          var prevKey = bul.year + '-W' + String(bul.week_number-1).padStart(2,'0');
          reportSaveSnapshot('weekly', thisKey, summary.overallPct, summary.totalDone, summary.totalAll);
          reportFetchSnapshot('weekly', prevKey, function(snap){
            summary.trendPrevWeek = snap;
            cb(summary);
          });
        } else {
          cb(summary);
        }
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

function buildWeeklyReportHtml(data){
  var body = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:6px;"><tr>' +
    reportStatCell(data.overallPct+'%','изпълнение за седмицата', data.overallPct===100?'#2F9E5C':data.overallPct>=50?'#1E2761':'#C0392B') +
    reportStatCell(data.totalDone+'/'+data.totalAll,'изпълнени задачи','#1E2761') +
    reportStatCell(String(data.laggards),'обекта под 50%', data.laggards>0?'#C0392B':'#2F9E5C') +
    reportStatCell(String(data.storeCount),'обекта общо','#1E2761') +
    '</tr></table>';
  body += reportTrendHtml(data.overallPct, data.trendPrevWeek, 'спрямо предходната седмица');
  body += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти за седмицата — изоставащите най-отгоре</div>';
  body += data.rows.map(reportStoreRow).join('');
  body += reportTopBottomTable(data.top3, data.bottom3);
  body += reportPostponedSectionHtml(data.postponedList);
  body += reportCommentedSectionHtml(data.commentedList);
  if (data.noDueCount > 0) {
    body += '<div style="margin-top:14px;padding:10px 14px;background:#FDF3E3;border-radius:8px;font-size:11.5px;color:#8A5A12;">'+
      '📋 '+data.noDueCount+' постоянни задачи без конкретен срок не участват в тази статистика.</div>';
  }
  body += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;font-style:italic;">Забележка: статусът на постоянните задачи не се "нулира" в началото на седмицата — веднъж отметната задача остава отметната, докато някой не я отметне обратно.</div>';
  return reportEmailShell('📊 Седмичен репорт — ' + (data.weekLabel||''), 'Обобщение за седмицата', body,
    'Автоматичен репорт · ТеМАХ Портал');
}

function sendWeeklyReportTest(toEmail){
  if (!toEmail) { toast('Въведи имейл','#dc2626'); return; }
  toast('⏳ Подготвям седмичния репорт...');
  collectWeeklyReportData(function(data){
    if (!data) { toast('Грешка при събиране на данните','#dc2626'); return; }
    var html = buildWeeklyReportHtml(data);
    sendEmail(toEmail, '📊 ТеМАХ — Седмичен репорт (тест)', html).then(function(res){
      if (res.ok) toast('✅ Седмичен репорт изпратен на ' + toEmail);
      else toast('❌ ' + res.status + ': ' + ((res.data && (res.data.message||res.data.error)) || 'грешка'), '#dc2626');
    });
  });
}

/* ═══════ МАРШРУТИЗАЦИЯ ПО ГРУПИ ЗА ДОКЛАДВАНЕ ═══════════════
   За разлика от sendWeeklyReportTest (общ репорт за целия бизнес), тук всеки
   човек получава ЛИЧЕН репорт само със задачите, за които е избран в
   report_groups при създаването им ('co'/'controlling'/'regional'/'owner').

   ФАЗА НА ТЕСТВАНЕ: reportGroups сочат към РЕАЛНИ хора (Жеко, Васка, Меги,
   Цвети, Теодор) — затова тук НИКОГА не изпращаме на техните истински
   имейли. Всичко отива на подадения тестов адрес, ясно надписано за кого е
   било предназначено. Истинско изпращане до тях е отделна, изрично
   потвърдена стъпка по-късно. */

/* Събира само задачите с зададени report_groups от текущия публикуван
   бюлетин + completion-ите им + accounting потребителите (за 'regional'). */
function collectWeeklyRoutingData(cb){
  Promise.all([
    sbGet('bulletins','status=eq.published&order=created_at.desc&limit=1'),
    sbGet('recurring_tasks','active=eq.true')
  ]).then(function(results){
    var bul = (Array.isArray(results[0]) && results[0].length) ? results[0][0] : null;
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var routedRecurring = allRecurring.filter(function(t){ return t.report_groups && t.report_groups.length; });

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);
    bulTasksPromise.then(function(tasksRaw){
      var allTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      var routedRegular = allTasks.filter(function(t){ return t.report_groups && t.report_groups.length; });
      var routedTasks = routedRegular.map(function(t){ t.kind='regular'; return t; })
        .concat(routedRecurring.map(function(t){ t.kind='recurring'; return t; }));
      if (!routedTasks.length) { cb({ bul:bul, tasks:[], comps:[], stores:[], accountingUsers:[] }); return; }
      var regIds = routedRegular.map(function(t){ return t.id; });
      var recIds = routedRecurring.map(function(t){ return t.id; });
      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')') : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')') : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name'),
        sbGet('users','role=eq.accounting&select=email,display_name,assigned_stores')
      ]).then(function(r2){
        var regCompsRaw = Array.isArray(r2[0]) ? r2[0] : [];
        var recCompsRaw = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var accountingUsers = Array.isArray(r2[3]) ? r2[3] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!u.store_name || u.store_name==='Централен офис' || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });
        var comps = regCompsRaw.map(function(c){ return { item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment }; })
          .concat(recCompsRaw.map(function(c){ return { item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment }; }));
        cb({ bul:bul, tasks:routedTasks, comps:comps, stores:stores, accountingUsers:accountingUsers });
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* За една задача връща кой получава известие за нея — 'co'/'controlling'/
   'owner' са фиксирани хора; 'regional' се извежда динамично от accounting
   потребителите, чиито assigned_stores пресичат target_stores на задачата
   (ако задачата е за ВСИЧКИ магазини — включва всички accounting с назначени
   обекти). */
function resolveRecipientsForTask(task, accountingUsers){
  var out = [];
  (task.report_groups||[]).forEach(function(g){
    var grp = REPORT_GROUPS[g];
    if (!grp) return;
    if (g==='regional') {
      var scope = task.target_stores;
      accountingUsers.forEach(function(u){
        if (!u.email) return;
        var as = Array.isArray(u.assigned_stores) ? u.assigned_stores : [];
        if (!as.length) return;
        var matches = (!scope || !scope.length) ? true : as.some(function(s){ return scope.indexOf(s)>=0; });
        if (matches) out.push({ name:u.display_name||u.email, email:u.email });
      });
    } else if (grp.people) {
      grp.people.forEach(function(p){ out.push({ name:p.name, email:p.email }); });
    }
  });
  return out;
}

/* Обединява всички задачи по получател (email) - дедуплицирано по email,
   натрупва списък със задачи, за които точно този човек е адресат.
   Сравнява id+kind заедно, за да не се бъркат обикновена и постоянна задача
   с case теоретично съвпадащ id. */
function buildRecipientMap(tasks, accountingUsers){
  var map = {};
  tasks.forEach(function(t){
    resolveRecipientsForTask(t, accountingUsers).forEach(function(r){
      if (!map[r.email]) map[r.email] = { name:r.name, tasks:[] };
      var already = map[r.email].tasks.some(function(x){ return x.id===t.id && x.kind===t.kind; });
      if (!already) map[r.email].tasks.push(t);
    });
  });
  return map;
}

/* За една задача - кои обекти (от нейния target_stores, или всички обекти
   ако е за всички) са изпълнили/отложили/все още чакат. Сравнява item_id+kind
   заедно - обикновена и постоянна задача пазят completion-ите си в една и
   съща таблица с различни ID колони, но теоретично биха могли да съвпаднат. */
function taskStoreBreakdown(task, comps, allStores){
  var scope = (task.target_stores && task.target_stores.length) ? task.target_stores : allStores;
  var done=[], postponed=[], pending=[];
  var taskKind = task.kind||'regular';
  scope.forEach(function(s){
    var c = comps.find(function(x){ return x.item_id===task.id && x.kind===taskKind && x.store_name===s; });
    if (c && c.status==='done') done.push(s);
    else if (c && c.status==='postponed') postponed.push({ store:s, comment:c.comment||'' });
    else pending.push(s);
  });
  return { done:done, postponed:postponed, pending:pending, scope:scope };
}

function personalizedTaskCardHtml(task, comps, allStores){
  var bd = taskStoreBreakdown(task, comps, allStores);
  var srcIcon = (task.kind==='recurring') ? '🔁 ' : '';
  var h = '<div style="background:#F9FAFC;border-radius:8px;padding:12px 14px;margin-bottom:8px;">';
  h += '<div style="font-size:13px;font-weight:700;color:#1F2937;">'+srcIcon+esc(task.title)+'</div>';
  h += '<div style="font-size:11px;color:#6B7280;margin-top:2px;">'+bd.done.length+' от '+bd.scope.length+' обекта изпълнили</div>';
  if (bd.postponed.length) {
    h += '<div style="margin-top:6px;">';
    bd.postponed.forEach(function(p){
      h += '<div style="font-size:11px;color:#92400e;">⏱ '+esc(p.store)+(p.comment?': '+esc(p.comment):'')+'</div>';
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}
function personalizedSectionHtml(tasks, comps, allStores){
  if (!tasks.length) return '<div style="font-size:12.5px;color:#94a3b8;">Няма задачи, адресирани лично към теб тази седмица.</div>';
  var h = '<div>';
  tasks.forEach(function(t){ h += personalizedTaskCardHtml(t, comps, allStores); });
  h += '</div>';
  return h;
}

/* Тестов режим — изчислява реалната маршрутизация, но ВСИЧКИ имейли отиват
   на testEmail (по един за всеки резолвнат получател), с надпис за кого е
   било предназначено. Не докосва истинските имейли на Жеко/Васка/Меги/
   Цвети/Теодор, докато не потвърдиш изрично, че съдържанието е коректно. */
function sendWeeklyReportRouted(testEmail){
  if (!testEmail) { toast('Въведи имейл','#dc2626'); return; }
  toast('⏳ Изчислявам маршрутизацията...');
  collectWeeklyRoutingData(function(data){
    if (!data) { toast('Грешка при зареждане','#dc2626'); return; }
    if (!data.tasks.length) { toast('Няма задачи с зададени групи за докладване тази седмица'); return; }
    var map = buildRecipientMap(data.tasks, data.accountingUsers);
    var emails = Object.keys(map);
    if (!emails.length) { toast('Няма разрешени получатели — провери групите на задачите','#dc2626'); return; }
    var sent = 0, total = emails.length;
    emails.forEach(function(email){
      var rec = map[email];
      var body = personalizedSectionHtml(rec.tasks, data.comps, data.stores);
      var html = reportEmailShell('📬 Твоите задачи (ТЕСТ)', 'Предназначено за: '+rec.name+' ('+email+')', body,
        'Тестов режим — реално изпратено до '+testEmail+', не до истинския получател');
      sendEmail(testEmail, '📬 [ТЕСТ за '+rec.name+'] Седмичен репорт по задачи', html).then(function(res){
        sent++;
        if (!res.ok) { toast('❌ Грешка за '+rec.name,'#dc2626'); }
        if (sent===total) toast('✅ '+total+' тестови репорта изпратени на '+testEmail);
      });
    });
  });
}

