/* report.js — Дневен/седмичен имейл репорт (за собственика + admin/logistics)
   ФАЗА 1 (текущата): ръчен тестов тригер от таб "Днес" — изпраща до подаден
   имейл, за да се провери съдържанието/визията преди да минем към истинска
   автоматика (pg_cron + Edge Function), която ще замести ръчния бутон.

   Използва sendEmail() от email.js за реалното изпращане (resend-email Edge
   Function). Използва DEPTS, toLocalISO, recurringIsDueToday от bulletin.js.
   Зарежда се СЛЕД bulletin.js и email.js в index.html.

   Важна особеност на данните: completion-ите на постоянните задачи вече
   НОСЯТ дата (completion_date) — след 17fdc7d всяка постоянна задача е
   date-scoped и се нулира на всяко следващо явяване. Стари записи отпреди
   това (и всяко "Отложи", което не пише дата) имат completion_date=null и
   се третират отделно на всяко място, където се четат. */

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
      var regularToday = allBulTasks.filter(function(t){ return taskIsDueOnDate(t, todayISO); });

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
          if (!isReportableStore(u.store_name) || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });

        var comps = [];
        /* Само completion-и от ТОЗИ ден за обикновени задачи - многодневна
           задача (Пон+Ср) не бива изпълнението от Понеделник да се показва
           като "изпълнено" (или "отложено") и в сряда. */
        regComps.forEach(function(c){ if((c.completion_date||null)===todayISO) comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });
        /* Постоянна задача: completion_date=null (стара - персистира
           завинаги) или съвпада с ДНЕС (нова многодневна - само днешното). */
        recComps.forEach(function(c){ if(!c.completion_date || c.completion_date===todayISO) comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });

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

/* items:[{id,kind,title,date?}] comps:[{item_id,kind,store_name,status,comment,completion_date?}] →
   обобщена статистика, споделена между дневния и седмичния builder.
   Само status='done' се брои за изпълнено; 'postponed' се извежда отделно
   в postponedList (за секцията "Отложени" в репорта), не участва в %.
   Ако елемент носи .date (многодневна задача, разгъната на под-елементи по
   ден), сравнението изисква и completion_date да съвпада с точно този ден. */
function reportItemMatchesComp(it, c){
  if (it.id!==c.item_id || it.kind!==c.kind) return false;
  if (it.date) return (c.completion_date||null)===it.date;
  /* Явяване за цяла седмица (задача от бюлетина без собствен срок) - брои се
     отмятане ВЪТРЕ в диапазона, не кое да е. Отмятане без дата не може да се
     отнесе към седмица, затова не съвпада. */
  if (it.dateFrom) {
    var d = c.completion_date || null;
    return !!d && d >= it.dateFrom && d <= it.dateTo;
  }
  /* Нито дата, нито диапазон - дневният репорт, чиито явявания нямат дата,
     защото самият той вече е стеснил comps до днешния ден в JS. */
  return true;
}
/* Датите от една седмица, в които постоянна задача е дължима - огледално на
   recurringForDay в седмичния календар (bulletin.js ~708), където всеки такъв
   ден получава собствен чекбокс с data-cdate, тоест е отделна единица работа:
     - няколко избрани дни (due_weekdays) -> точно тези дни
     - един ден (due_weekdays с 1 елемент или старото due_weekday) -> само той
     - "всеки ден" (due_time без избран ден) -> и седемте дни от седмицата
   Двойката (wk, yr) идва от самия бюлетин, затова тук няма разминаване между
   ISO седмица и календарна година (капанът около Нова година). */
function reportRecurringWeekDates(t, wk, yr){
  var out = [];
  weekDays(wk, yr).forEach(function(d, idx){
    if (recurringIsDueOnWeekday(t, idx)) out.push(toLocalISO(d));
  });
  return out;
}
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
      return doneComps.some(function(c){ return c.store_name===s && reportItemMatchesComp(it,c); });
    }).length;
    var pct = total ? Math.round(done/total*100) : 0;
    totalDone += done; totalAll += total;
    if (pct < 50) laggards++;
    return { name:s, done:done, total:total, pct:pct };
  });
  rows.sort(function(a,b){ return a.pct - b.pct; }); /* изоставащите най-отгоре */
  var overallPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;
  var byPct = rows.slice().sort(function(a,b){ return b.pct - a.pct; });
  /* Прозорецът на СПИСЪЦИТЕ е същият като на процента.
     Досега двата списъка нямаха никакъв филтър по дата: процентът минаваше
     през reportItemMatchesComp (точно съвпадение на completion_date с датата
     на явяването), а списъците взимаха всяко отмятане, което заявката е
     върнала - тоест цялата история. Оттам идваше противоречието: „0 от 27"
     по обекти и 213 изброени коментара в едно и също писмо за една седмица.
     Един и същи предикат за трите места, за да не се разминат отново. */
  var inWindow = function(c){
    return items.some(function(it){ return reportItemMatchesComp(it, c); });
  };
  /* След филтъра find() винаги намира явяването, тоест „(неизвестна задача)"
     става недостижимо - точно записите, които го показваха, бяха тези извън
     прозореца. Пазим го като предпазител, не като очакван изход. */
  var titleOf = function(c){
    var it = items.find(function(x){ return reportItemMatchesComp(x,c); }) || items.find(function(x){ return x.id===c.item_id && x.kind===c.kind; });
    return it ? it.title : '(неизвестна задача)';
  };
  var postponedList = postponedComps.filter(inWindow).map(function(c){
    return { title: titleOf(c), store: c.store_name, comment: c.comment || '' };
  });
  /* Изпълнени задачи С коментар/снимка - иначе съдържанието е невидимо в
     репорта, освен ако не отвориш конкретната задача в Бюлетин. */
  var commentedList = doneComps.filter(inWindow).filter(function(c){
    return c.comment || (c.photos && c.photos.length);
  }).map(function(c){
    return { title: titleOf(c), store: c.store_name, comment: c.comment || '', photos: c.photos || [] };
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

/* ── Коя седмица обобщава седмичният отчет ──
   ПРИКЛЮЧИЛАТА, не текущата. Преди тук се взимаше просто последният
   публикуван бюлетин (order=created_at.desc&limit=1), а той се публикува
   ПРЕДВАРИТЕЛНО за идващата седмица. Следствие: всяко явяване имаше дата в
   бъдещето, reportItemMatchesComp не намираше нито едно съвпадение и всеки
   понеделнишки отчет излизаше 9-11% - не защото обектите не работят, а
   защото седмицата тъкмо започва. При пускане в петък същият дефект дава
   чисто 0%.
   Сега: в понеделник 24.08 отчетът покрива 17-23.08. */

/* Понеделникът на ПРЕДХОДНАТА седмица спрямо подадената дата. */
function reportPrevWeekMonday(now){
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var js = d.getDay();                 /* 0=неделя */
  var idx = js === 0 ? 6 : js - 1;     /* 0=понеделник */
  d.setDate(d.getDate() - idx - 7);
  return d;
}
/* Номерът на седмицата за даден понеделник. Търси се през СЪЩАТА weekDays(),
   която после разгъва бюлетина на дати - иначе двете броения могат да се
   разминат в началото на годината.
   Редът на годините НЕ е произволен: по-късната се пробва ПЪРВА. Един и същи
   понеделник може да съвпадне с два номера - 29.12.2025 е и „седмица 53 на
   2025" (преливане на формулата), и седмица 1 на 2026. Бюлетините се номерират
   по второто, затова печели по-късната година. */
function reportWeekOfMonday(monday){
  var target = toLocalISO(monday);
  var yr = monday.getFullYear();
  var years = [yr + 1, yr, yr - 1];
  for (var i = 0; i < years.length; i++) {
    for (var w = 1; w <= 53; w++) {
      if (toLocalISO(weekDays(w, years[i])[0]) === target) return { week: w, year: years[i] };
    }
  }
  return null;
}
/* Бюлетинът за отчетната седмица. Точно съвпадение, ако го има; иначе
   най-новият публикуван, който НЕ е след нея - никога бюлетин за бъдеща
   седмица, защото точно това чупеше отчета. */
function reportPickWeeklyBulletin(list, target){
  if (!target || !Array.isArray(list)) return null;
  var exact = list.find(function(b){
    return b.year === target.year && b.week_number === target.week;
  });
  if (exact) return exact;
  return list.find(function(b){
    return b.year < target.year || (b.year === target.year && b.week_number <= target.week);
  }) || null;
}

/* За разлика от дневния, седмичният взима ВСИЧКИ задачи на бюлетина за
   приключилата седмица (не само днешните) + всички постоянни задачи, които
   имат ден ИЛИ час зададен (т.е. не са от "без срок" групата). */
function collectWeeklyReportData(cb){
  var target = reportWeekOfMonday(reportPrevWeekMonday(new Date()));
  Promise.all([
    /* Списък, не limit=1 - изборът на правилната седмица става по-долу. */
    sbGet('bulletins','status=eq.published&order=year.desc,week_number.desc&limit=20'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = reportPickWeeklyBulletin(results[0], target);
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var recurringScheduled = allRecurring.filter(function(t){
      return (t.due_weekday!==null && t.due_weekday!==undefined) || !!t.due_time;
    });
    var noDueCount = allRecurring.length - recurringScheduled.length;

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];

      /* Датите на отчетната седмица - нужни са и при СТРОЕНЕТО на явяванията
         (по-долу), не само за прозореца на заявката. */
      var wkDates = bul ? weekDays(bul.week_number, bul.year).map(toLocalISO) : null;

      var items = [];
      /* Многодневна задача (Пон+Ср) се разгъва на ОТДЕЛЕН елемент за всеки
         ден - реално отразява обема работа (2 отделни отмятания = 2 единици
         в седмичната статистика, не 1). За еднодневна задача .date просто
         съвпада с единствения ѝ due_date - работи еднакво с новата
         completion_date логика навсякъде другаде. */
      allBulTasks.forEach(function(t){
        var dates = taskDueDates(t);
        if (dates.length > 1) {
          dates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'regular', title:t.title+' ('+dLabel+')', target_stores:t.target_stores||null, date:d });
          });
        } else {
          /* 30 от 43 задачи в бюлетините НЯМАТ собствен срок - те важат за
             седмицата като цяло, не за конкретен ден. Такова явяване получава
             ДИАПАЗОН вместо дата: изпълнено е, ако има отмятане някъде в
             седмицата. Преди тук оставаше само date:null и
             reportItemMatchesComp приемаше кое да е отмятане на задачата,
             включително от други седмици. */
          var d0 = dates[0] || null;
          var reg = { id:t.id, kind:'regular', title:t.title, target_stores:t.target_stores||null, date: d0 };
          if (!d0 && wkDates) { reg.dateFrom = wkDates[0]; reg.dateTo = wkDates[6]; }
          items.push(reg);
        }
      });
      /* Постоянна задача се разгъва на ОТДЕЛЕН елемент за всяко свое явяване
         през седмицата, с конкретна дата - точно както многодневните
         обикновени задачи по-горе и както седмичният календар в bulletin.js
         (recurringForDay, ~708), където всеки дължим ден получава СОБСТВЕН
         чекбокс с data-cdate. Затова .date се попълва и при едно явяване:
         иначе reportItemMatchesComp() приема кой да е completion и задача,
         отметната някога, се брои за изпълнена завинаги - и следващата
         седмица. Без публикуван бюлетин няма от коя седмица да смятаме дати,
         затова тогава елементът остава без .date (старото поведение), за да
         не изчезне от репорта. */
      var recWithOcc = [];
      recurringScheduled.forEach(function(t){
        var occDates = bul ? reportRecurringWeekDates(t, bul.week_number, bul.year) : [];
        /* НЯМА явяване тази седмица - задачата изобщо не влиза в набора.
           Преди тук се добавяше елемент с date:null, който едновременно
           надуваше знаменателя (задача, която не е дължима) и през
           reportItemMatchesComp приемаше кое да е отмятане на същата задача.
           Оттам идваха „изпълнените" в стария snapshot. */
        if (!occDates.length) return;
        recWithOcc.push(t.id);
        if (occDates.length > 1) {
          occDates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'recurring', title:t.title+' ('+dLabel+')', target_stores:t.target_stores||null, date:d });
          });
        } else {
          items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null, date: occDates[0] });
        }
      });

      var regIds = allBulTasks.map(function(t){ return t.id; });
      /* Само задачите, които РЕАЛНО имат явяване тази седмица - няма смисъл
         да се теглят отмятания за задачи, които не са в набора. */
      var recIds = recWithOcc;

      /* Прозорец и на самата ЗАЯВКА, не само в JS. Без него за 10-те
         постоянни задачи се теглеше всяко отмятане, правено някога - и като
         трафик, и като материал за списъците, които после ги изброяваха
         всичките под заглавие за една седмица.
         Отмятанията с completion_date=NULL отпадат нарочно: те не могат да
         бъдат отнесени към коя да е седмица (184 такива в базата, всичките
         отпреди полето да се пълни).
         wkDates е сметнато по-горе - ползва се и при строенето на явяванията. */
      var dateQ = wkDates
        ? '&completion_date=gte.' + wkDates[0] + '&completion_date=lte.' + wkDates[6]
        : '';

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')'+dateQ) : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')'+dateQ) : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name')
      ]).then(function(r2){
        var regComps = Array.isArray(r2[0]) ? r2[0] : [];
        var recComps = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!isReportableStore(u.store_name) || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });

        /* completion_date ЗАДЪЛЖИТЕЛНО минава нататък - reportItemMatchesComp()
           сравнява точно него срещу .date на елемента. Без него всеки елемент
           с дата (а тук вече всички имат) не намираше нито един completion и
           се броеше за неизпълнен, колкото и отмятания да има. */
        var comps = [];
        regComps.forEach(function(c){ comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, completion_date:c.completion_date||null }); });
        recComps.forEach(function(c){ comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, completion_date:c.completion_date||null }); });

        var summary = reportBuildSummary(items, comps, stores, noDueCount);
        summary.weekLabel = bul ? ('Седмица ' + bul.week_number + ' · ' + bul.year) : 'Няма публикуван бюлетин';
        var finish = function(){
          collectCrossModuleWeeklySummary(function(cross){
            summary.cross = cross; /* null при грешка - секцията просто не се показва, не гърми */
            cb(summary);
          });
        };
        if (bul) {
          var thisKey = bul.year + '-W' + String(bul.week_number).padStart(2,'0');
          /* Опростено "предходна седмица" - не пресича година в edge-case
             седмица 1 (там просто няма да намери snapshot, деградира тихо
             до "без тенденция", не гърми). */
          var prevKey = bul.year + '-W' + String(bul.week_number-1).padStart(2,'0');
          reportSaveSnapshot('weekly', thisKey, summary.overallPct, summary.totalDone, summary.totalAll);
          reportFetchSnapshot('weekly', prevKey, function(snap){
            summary.trendPrevWeek = snap;
            finish();
          });
        } else {
          finish();
        }
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* ═══════ КРОСМОДУЛНО ОБОБЩЕНИЕ ЗА СЕДМИЦАТА ═══════════════════
   Добавя към седмичния репорт "какво е свършено/не е" в останалите
   табове извън Бюлетин. Обхват (потвърден с потребителя):
   - Разлики: САМО ниво доклад (differences_reports.reviewed) - не и
     отделните артикули в stock_differences.
   - За връщане: текущо отворени (pending/taken) vs приключени (completed) -
     моментна снимка, не "тази седмица", защото приключването не носи
     собствена дата в схемата.
   - Каса Сторно: нови тази седмица + разбивка по статус.
   - Каса Равнение: колко обекта НЕ са потвърдили равнение тази седмица
     (draft) от общо подадените.
   - Стока на път: САМО "застояли" pending по-стари от 7 дни (изрично
     предпочетено пред "промяна тази седмица").
   - Палети: "без данни" + "остарели >7 дни" - огледално на
     palletsStaleness()/renderPalletsAdmin() логиката в pallets.js (7-дневен
     праг вече е установена конвенция в проекта, не нов избор).
   - Гаранции/Рекламации: НЕ участва - reference.js е статичен справочник,
     няма работен процес "свършено/несвършено" в схемата.
   cb(data|null) - при грешка cb(null), buildWeeklyReportHtml пропуска
   секцията мълчаливо (сравнено с "data.cross &&" преди рендиране). */
function collectCrossModuleWeeklySummary(cb){
  var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  var weekAgoISO = toLocalISO(weekAgo);
  var weekAgoStamp = weekAgo.toISOString();

  Promise.all([
    /* store_name и direction са нужни, за да се отдели сторната по грешен
       прием от другите две посоки и да се разбие по обект. Само reviewed
       не стигаше - разбивка по магазин беше физически невъзможна. */
    sbGet('differences_reports','created_at=gte.'+weekAgoStamp+'&select=store_name,direction,reviewed'),
    sbGet('stock_returns','select=status'),
    sbGet('kasa_storno','created_at=gte.'+weekAgoStamp+'&select=status'),
    sbGet('kasa_zoborot','date=gte.'+weekAgoISO+'&select=status'),
    sbGet('goods_transit','status=eq.pending&created_at=lt.'+weekAgoStamp+'&select=id'),
    sbGet('transport_pallets','order=report_date.desc&select=store_name,report_date'),
    sbGet('users','select=store_name&order=store_name')
  ]).then(function(r){
    var diffReports = Array.isArray(r[0]) ? r[0] : [];
    var returns = Array.isArray(r[1]) ? r[1] : [];
    var storno = Array.isArray(r[2]) ? r[2] : [];
    var zoborot = Array.isArray(r[3]) ? r[3] : [];
    var stalePending = Array.isArray(r[4]) ? r[4] : [];
    var palletsRows = Array.isArray(r[5]) ? r[5] : [];
    var allUsers = Array.isArray(r[6]) ? r[6] : [];

    var seenS = {};
    var storeNames = allUsers.filter(function(u){
      if (!isReportableStore(u.store_name) || seenS[u.store_name]) return false;
      seenS[u.store_name] = 1; return true;
    }).map(function(u){ return u.store_name; });

    /* Сторната по грешен прием ИЗЛИЗА от числата за другите две посоки -
       иначе всяка бланка се брои по два пъти: веднъж в "Разлики" и втори
       път в собствения си ред. Липсваща посока пада на 'supplier', както
       навсякъде другаде (виж sdLineDirection в stock-differences.js). */
    var wrReports = diffReports.filter(function(x){ return x.direction==='wrong_receipt'; });
    var otherReports = diffReports.filter(function(x){ return x.direction!=='wrong_receipt'; });

    var diffs = {
      total: otherReports.length,
      reviewed: otherReports.filter(function(x){ return x.reviewed===true; }).length,
      unreviewed: otherReports.filter(function(x){ return x.reviewed!==true; }).length
    };
    /* Разбивка по обект - само обектите с поне една бланка, подредени по
       брой (най-натоварените отгоре), при равен брой по азбучен ред. */
    var wrByStore = {};
    wrReports.forEach(function(x){
      var s = x.store_name || '—';
      wrByStore[s] = (wrByStore[s] || 0) + 1;
    });
    var wrongReceipt = {
      total: wrReports.length,
      unreviewed: wrReports.filter(function(x){ return x.reviewed!==true; }).length,
      byStore: Object.keys(wrByStore).map(function(s){
        return { store: s, count: wrByStore[s] };
      }).sort(function(a,b){
        return b.count - a.count || a.store.localeCompare(b.store);
      })
    };
    var ret = {
      open: returns.filter(function(x){ return x.status!=='completed'; }).length,
      completed: returns.filter(function(x){ return x.status==='completed'; }).length
    };
    var stornoSummary = {
      total: storno.length,
      draft: storno.filter(function(x){ return x.status==='draft'; }).length,
      returned: storno.filter(function(x){ return x.status==='returned'; }).length,
      resubmitted: storno.filter(function(x){ return x.status==='resubmitted'; }).length,
      confirmed: storno.filter(function(x){ return x.status==='confirmed'; }).length
    };
    var zoborotSummary = {
      total: zoborot.length,
      draft: zoborot.filter(function(x){ return x.status==='draft'; }).length,
      confirmed: zoborot.filter(function(x){ return x.status==='confirmed'; }).length
    };

    /* Палети: последен report_date на всеки обект спрямо днес (>7 дни =
       остарели; изобщо няма запис = без данни) - огледално на pallets.js. */
    var latestByStore = {};
    palletsRows.forEach(function(p){
      if (!latestByStore[p.store_name]) latestByStore[p.store_name] = p.report_date;
    });
    var todayD = new Date();
    var palletsMissing = 0, palletsStale = 0;
    storeNames.forEach(function(s){
      var d = latestByStore[s];
      if (!d) { palletsMissing++; return; }
      var diffDays = Math.floor((todayD - new Date(d+'T00:00:00')) / 86400000);
      if (diffDays > 7) palletsStale++;
    });

    cb({
      diffs: diffs, wrongReceipt: wrongReceipt,
      returns: ret, storno: stornoSummary, zoborot: zoborotSummary,
      transitStale: stalePending.length,
      pallets: { missing: palletsMissing, stale: palletsStale, total: storeNames.length }
    });
  }).catch(function(){ cb(null); });
}

/* Компактна карта за 1 метрика в кросмодулната секция - число + етикет,
   опционален "изисква внимание" акцент (червено outline) ако warn=true. */
function crossMetricCard(num, label, warn){
  return '<div style="flex:1;min-width:110px;background:'+(warn?'#FDEEEA':'#F9FAFC')+';border:1px solid '+(warn?'#F3C6BA':'#eef1f6')+';border-radius:8px;padding:10px 12px;text-align:center;">' +
    '<div style="font-size:18px;font-weight:800;color:'+(warn?'#C0392B':'#1E2761')+';">'+num+'</div>' +
    '<div style="font-size:10px;color:#6B7280;margin-top:2px;line-height:1.3;">'+label+'</div></div>';
}
function crossModuleRow(icon, title, cardsHtml){
  return '<div style="margin-top:12px;">' +
    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">'+icon+' '+title+'</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+cardsHtml+'</div>' +
    '</div>';
}
/* Ред "Сторна по грешен прием" - единственият с разбивка ПО МАГАЗИН.
   От тези бланки излизат глоби (удръжки от гъвкавата част на обекта),
   затова е важно кой обект колко има, не само общото число.
   Показват се САМО обектите с поне една бланка - празните редове само
   биха разредили таблото.
   Ползва същите примитиви (crossModuleRow/crossMetricCard) като другите
   редове, защото същият HTML отива и в седмичния имейл, където сложен
   лейаут не се рендира надеждно.
   Старо cross без това поле (напр. кеширано от предишен зареден таб) не
   бива да чупи секцията - тогава редът просто отпада. */
function buildWrongReceiptRowHtml(wr){
  if (!wr) return '';
  if (!wr.total) {
    return crossModuleRow('🧾','Сторна по грешен прием (нови тази седмица)',
      crossMetricCard(0,'няма нови'));
  }
  var cards = crossMetricCard(wr.total,'общо нови') +
              crossMetricCard(wr.unreviewed,'непрегледани', wr.unreviewed>0);
  cards += wr.byStore.map(function(s){
    return crossMetricCard(s.count, esc(s.store), true);
  }).join('');
  return crossModuleRow('🧾','Сторна по грешен прием (нови тази седмица)', cards);
}
function buildCrossModuleSectionHtml(cross){
  if (!cross) return '';
  var h = '<div style="margin-top:18px;padding-top:14px;border-top:2px solid #eef1f6;">';
  h += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">🗂 Друго от седмицата — по табове</div>';

  /* Числата тук са БЕЗ сторната по грешен прием - тя има собствен ред
     по-долу и иначе би се броила два пъти. */
  h += crossModuleRow('📋','Разлики от доставчици и междускладови (нови тази седмица)',
    crossMetricCard(cross.diffs.total,'нови доклада') +
    crossMetricCard(cross.diffs.reviewed,'прегледани',false) +
    crossMetricCard(cross.diffs.unreviewed,'непрегледани', cross.diffs.unreviewed>0));

  h += buildWrongReceiptRowHtml(cross.wrongReceipt);

  h += crossModuleRow('📥','За връщане (текущо състояние)',
    crossMetricCard(cross.returns.open,'отворени (чакат/взети)', cross.returns.open>0) +
    crossMetricCard(cross.returns.completed,'приключени'));

  h += crossModuleRow('💳','Каса — Сторно бележки (нови тази седмица)',
    crossMetricCard(cross.storno.total,'общо нови') +
    crossMetricCard(cross.storno.draft,'чакат счетоводство', cross.storno.draft>0) +
    crossMetricCard(cross.storno.returned,'върнати за коментар', cross.storno.returned>0) +
    crossMetricCard(cross.storno.confirmed,'приключени'));

  h += crossModuleRow('🧾','Каса — Равнение (тази седмица)',
    crossMetricCard(cross.zoborot.total,'общо записа') +
    crossMetricCard(cross.zoborot.draft,'непотвърдени от обект', cross.zoborot.draft>0) +
    crossMetricCard(cross.zoborot.confirmed,'потвърдени'));

  h += crossModuleRow('🚚','Стока на път',
    crossMetricCard(cross.transitStale,'застояли pending (>7 дни)', cross.transitStale>0));

  h += crossModuleRow('📦','Палети',
    crossMetricCard(cross.pallets.missing,'обекта без данни', cross.pallets.missing>0) +
    crossMetricCard(cross.pallets.stale,'остарели (>7 дни)', cross.pallets.stale>0) +
    crossMetricCard(cross.pallets.total,'обекта общо'));

  h += '</div>';
  return h;
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
  body += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;font-style:italic;">Забележка: постоянните задачи участват с по едно явяване за всеки ден, в който са дължими през седмицата (задача „всеки ден" = 7 явявания) — точно както се отмятат в Седмичния календар. Отметка от предишна седмица не се брои за текущата.</div>';
  body += buildCrossModuleSectionHtml(data.cross);
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
      if (!routedTasks.length) { cb({ bul:bul, tasks:[], comps:[], stores:[], accountingUsers:[], creatorMap:{} }); return; }
      var regIds = routedRegular.map(function(t){ return t.id; });
      var recIds = routedRecurring.map(function(t){ return t.id; });
      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')') : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')') : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name'),
        sbGet('users','role=eq.accounting&select=email,display_name,assigned_stores'),
        sbGet('users','select=display_name,email') /* за резолвиране на created_by (display_name) -> email на създателя */
      ]).then(function(r2){
        var regCompsRaw = Array.isArray(r2[0]) ? r2[0] : [];
        var recCompsRaw = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var accountingUsers = Array.isArray(r2[3]) ? r2[3] : [];
        var allUsers = Array.isArray(r2[4]) ? r2[4] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!isReportableStore(u.store_name) || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });
        var comps = regCompsRaw.map(function(c){ return { item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment }; })
          .concat(recCompsRaw.map(function(c){ return { item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment }; }));
        var creatorMap = {};
        allUsers.forEach(function(u){ if (u.display_name && u.email) creatorMap[u.display_name] = u.email; });
        cb({ bul:bul, tasks:routedTasks, comps:comps, stores:stores, accountingUsers:accountingUsers, creatorMap:creatorMap });
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* За една задача връща кой получава известие за нея — 'co'/'controlling'/
   'owner' са фиксирани хора; 'regional' се извежда динамично от accounting
   потребителите, чиито assigned_stores пресичат target_stores на задачата
   (ако задачата е за ВСИЧКИ магазини — включва всички accounting с назначени
   обекти). Освен избраните report_groups, СЪЗДАТЕЛЯТ на задачата (created_by,
   само за обикновени bulletin_tasks - recurring_tasks нямат това поле)
   винаги се добавя автоматично като получател, ако имейлът му може да бъде
   резолвнат през creatorMap (display_name -> email от users). */
function resolveRecipientsForTask(task, accountingUsers, creatorMap){
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
  if (task.created_by && creatorMap && creatorMap[task.created_by]) {
    out.push({ name:task.created_by, email:creatorMap[task.created_by] });
  }
  return out;
}

/* Обединява всички задачи по получател (email) - дедуплицирано по email,
   натрупва списък със задачи, за които точно този човек е адресат.
   Сравнява id+kind заедно, за да не се бъркат обикновена и постоянна задача
   с case теоретично съвпадащ id. */
function buildRecipientMap(tasks, accountingUsers, creatorMap){
  var map = {};
  tasks.forEach(function(t){
    resolveRecipientsForTask(t, accountingUsers, creatorMap).forEach(function(r){
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
    var map = buildRecipientMap(data.tasks, data.accountingUsers, data.creatorMap);
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

/* ═══════ ПОЛУЧАТЕЛИ НА ОБЩИЯ РЕПОРТ (report_recipients) ═══════════
   Редактируем списък (name/email/daily/weekly флагове) - управлява се от
   UI-то в таб "Днес" (виж today.js). Използва се от sendDailyReportToRecipients/
   sendWeeklyReportToRecipients по-долу за РЕАЛНО ръчно изпращане до целия
   списък наведнъж, докато не минем към pg_cron автоматика (Фаза 2) - тогава
   същата таблица ще захранва и автоматичния Edge Function репорт. */
function loadReportRecipients(cb){
  sbGet('report_recipients','active=eq.true&order=created_at.asc').then(function(rows){
    cb(Array.isArray(rows) ? rows : []);
  }).catch(function(){ cb([]); });
}
function addReportRecipient(name, email, daily, weekly, cb){
  if (!email) { cb(false); return; }
  sbPost('report_recipients', { name: name||null, email: email, daily: !!daily, weekly: !!weekly }).then(function(res){
    cb(!!res.ok);
  }).catch(function(){ cb(false); });
}
function deleteReportRecipient(id, cb){
  sbDelete('report_recipients','id=eq.'+id).then(function(res){ cb(!!res.ok); }).catch(function(){ cb(false); });
}

/* РЕАЛНО изпращане (не тест) - до всички активни получатели с daily=true.
   Едно писмо, всички в общо поле "to" (вътрешен екип, не е проблем да се
   виждат взаимно). */
function sendDailyReportToRecipients(){
  loadReportRecipients(function(recipients){
    var targets = recipients.filter(function(r){ return r.daily; });
    if (!targets.length) { toast('Няма получатели с включен дневен репорт','#dc2626'); return; }
    toast('⏳ Подготвям и изпращам дневния репорт...');
    collectDailyReportData(function(data){
      if (!data) { toast('Грешка при събиране на данните','#dc2626'); return; }
      var html = buildDailyReportHtml(data);
      var emails = targets.map(function(r){ return r.email; });
      sendEmail(emails, '📋 ТеМАХ — Дневен репорт', html).then(function(res){
        if (res.ok) toast('✅ Дневен репорт изпратен на ' + emails.length + ' получатели');
        else toast('❌ ' + res.status + ': ' + ((res.data && (res.data.message||res.data.error)) || 'грешка'), '#dc2626');
      });
    });
  });
}
/* РЕАЛНО изпращане на седмичния репорт - до всички активни получатели с weekly=true. */
function sendWeeklyReportToRecipients(){
  loadReportRecipients(function(recipients){
    var targets = recipients.filter(function(r){ return r.weekly; });
    if (!targets.length) { toast('Няма получатели с включен седмичен репорт','#dc2626'); return; }
    toast('⏳ Подготвям и изпращам седмичния репорт...');
    collectWeeklyReportData(function(data){
      if (!data) { toast('Грешка при събиране на данните','#dc2626'); return; }
      var html = buildWeeklyReportHtml(data);
      var emails = targets.map(function(r){ return r.email; });
      sendEmail(emails, '📊 ТеМАХ — Седмичен репорт', html).then(function(res){
        if (res.ok) toast('✅ Седмичен репорт изпратен на ' + emails.length + ' получатели');
        else toast('❌ ' + res.status + ': ' + ((res.data && (res.data.message||res.data.error)) || 'грешка'), '#dc2626');
      });
    });
  });
}

