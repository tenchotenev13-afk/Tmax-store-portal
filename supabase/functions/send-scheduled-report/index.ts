/* send-scheduled-report — Edge Function за АВТОМАТИЧНОТО (cron) изпращане
   на общия дневен/седмичен репорт, без нужда от отворен браузър.

   v4: синхронизирано със report.js след commit 193411a („ДНЕС: собствен ред
   за сторната по грешен прием, с разбивка по магазин“) - заявката тегли
   store_name,direction,reviewed; сторните излизат от числата на другите две
   посоки (иначе всяка бланка се брои два пъти); добавен
   buildWrongReceiptRowHtml() и новото заглавие на стария ред. Без това
   редът излизаше само в таб „Днес“ и в ръчното изпращане, но НЕ и в
   автоматичния седмичен имейл, който минава оттук.

   v3: синхронизирано със report.js след commit 37bcd06 („Седмичен репорт:
   постоянните задачи се броят по явяване, не завинаги“) - добавен
   reportRecurringWeekDates() + completion_date в comps normalization. Без това
   постоянна задача, отметната веднъж, се броеше за изпълнена завинаги във
   автоматичните имейли - точно както описано в commit съобщението на 37bcd06.

   Тригерира се от pg_cron с POST {"type":"daily"} всеки делничен ден в
   8:00 (Sofia) и {"type":"weekly"} всеки понеделник в 8:00 (Sofia).

   Данните/HTML логиката по-долу е ТОЧНО копие на съответните функции в
   report.js. При промяна на логиката в report.js, отрази промяната и тук.

   Разлика спрямо браузъра: sbGet/sbPost/sbPatch тук говорят директно към
   PostgREST със SERVICE ROLE ключ (обикаля RLS) вместо sbGet от shared.js.
   Получателите се четат от таблица report_recipients - редактируеми от
   таб "Днес" в портала. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REST = SUPABASE_URL + '/rest/v1/';

function sbGet(t: string, q?: string) {
  return fetch(REST + t + (q ? '?' + q : ''), {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  }).then(function(r){ return r.json(); });
}
function sbPost(t: string, b: any) {
  return fetch(REST + t, {
    method: 'POST',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body: JSON.stringify(b)
  }).then(function(r){ return { ok: r.ok }; });
}
function sbPatch(t: string, f: string, b: any) {
  return fetch(REST + t + '?' + f, {
    method: 'PATCH',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body: JSON.stringify(b)
  }).then(function(r){ return { ok: r.ok }; });
}

/* ═══════ ПОМОЩНИ ФУНКЦИИ — копие от bulletin.js/shared.js (чисти, без DOM) ═══════ */
function esc(s: any){ return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '—'; }
function toLocalISO(d: Date){
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function taskDueDates(t: any){
  if(t.due_dates && t.due_dates.length) return t.due_dates.map(function(d: any){return String(d).slice(0,10);});
  if(t.due_date) return [String(t.due_date).slice(0,10)];
  return [];
}
function taskIsDueOnDate(t: any, dateStr: string){
  return taskDueDates(t).indexOf(dateStr) >= 0;
}
function recurringIsMultiDay(t: any){ return !!(t.due_weekdays && t.due_weekdays.length>1); }
function recurringIsDueOnWeekday(t: any, weekdayIdx: number){
  if(t.due_weekdays && t.due_weekdays.length) return t.due_weekdays.indexOf(weekdayIdx)>=0;
  if(t.due_weekday===null||t.due_weekday===undefined){
    return !!t.due_time;
  }
  return t.due_weekday===weekdayIdx;
}
function recurringIsDueToday(t: any){
  var jsDay=new Date().getDay();
  var idx=jsDay===0?6:jsDay-1;
  return recurringIsDueOnWeekday(t, idx);
}
function weekDays(wk: number, yr: number){
  var s: any = new Date(yr,0,1+7*(wk-1));
  var d=s.getDay(); if(d<=4)s.setDate(s.getDate()-d+1); else s.setDate(s.getDate()+8-d);
  return [0,1,2,3,4,5,6].map(function(i){var x=new Date(s);x.setDate(s.getDate()+i);return x;});
}

/* ═══════ РЕПОРТ ЛОГИКА — ТОЧНО копие от report.js ═══════════════════ */
var PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

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
          if (!u.store_name || u.store_name==='Централен офис' || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });

        var comps = [];
        regComps.forEach(function(c){ if((c.completion_date||null)===todayISO) comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });
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

function reportItemMatchesComp(it, c){
  if (it.id!==c.item_id || it.kind!==c.kind) return false;
  if (it.date) return (c.completion_date||null)===it.date;
  return true;
}
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
  rows.sort(function(a,b){ return a.pct - b.pct; });
  var overallPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;
  var byPct = rows.slice().sort(function(a,b){ return b.pct - a.pct; });
  var postponedList = postponedComps.map(function(c){
    var it = items.find(function(x){ return reportItemMatchesComp(x,c); }) || items.find(function(x){ return x.id===c.item_id && x.kind===c.kind; });
    return { title: it ? it.title : '(неизвестна задача)', store: c.store_name, comment: c.comment || '' };
  });
  var commentedList = doneComps.filter(function(c){
    return c.comment || (c.photos && c.photos.length);
  }).map(function(c){
    var it = items.find(function(x){ return reportItemMatchesComp(x,c); }) || items.find(function(x){ return x.id===c.item_id && x.kind===c.kind; });
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

      var items = [];
      allBulTasks.forEach(function(t){
        var dates = taskDueDates(t);
        if (dates.length > 1) {
          dates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'regular', title:t.title+' ('+dLabel+')', target_stores:t.target_stores||null, date:d });
          });
        } else {
          items.push({ id:t.id, kind:'regular', title:t.title, target_stores:t.target_stores||null, date: dates[0]||null });
        }
      });
      recurringScheduled.forEach(function(t){
        var occDates = bul ? reportRecurringWeekDates(t, bul.week_number, bul.year) : [];
        if (occDates.length > 1) {
          occDates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'recurring', title:t.title+' ('+dLabel+')', target_stores:t.target_stores||null, date:d });
          });
        } else {
          items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null, date: occDates[0]||null });
        }
      });

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
        regComps.forEach(function(c){ comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, completion_date:c.completion_date||null }); });
        recComps.forEach(function(c){ comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, completion_date:c.completion_date||null }); });

        var summary = reportBuildSummary(items, comps, stores, noDueCount);
        summary.weekLabel = bul ? ('Седмица ' + bul.week_number + ' · ' + bul.year) : 'Няма публикуван бюлетин';
        var finish = function(){
          collectCrossModuleWeeklySummary(function(cross){
            summary.cross = cross;
            cb(summary);
          });
        };
        if (bul) {
          var thisKey = bul.year + '-W' + String(bul.week_number).padStart(2,'0');
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
      if (!u.store_name || u.store_name==='Централен офис' || seenS[u.store_name]) return false;
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
   Старо cross без това поле не бива да чупи секцията - тогава редът
   просто отпада. */
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
  body += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;font-style:italic;">Забележка: постоянните задачи участват с по едно явяване за всеки ден, в който са дължими през седмицата (задача „всеки ден“ = 7 явявания) — точно както се отмятат в Седмичния календар. Отметка от предишна седмица не се брои за текущата.</div>';
  body += buildCrossModuleSectionHtml(data.cross);
  return reportEmailShell('📊 Седмичен репорт — ' + (data.weekLabel||''), 'Обобщение за седмицата', body,
    'Автоматичен репорт · ТеМАХ Портал');
}


Deno.serve(async (req: Request) => {
  try {
    var body: any = {};
    try { body = await req.json(); } catch(e) {}
    var type = body && body.type === 'weekly' ? 'weekly' : 'daily';

    var data: any = await new Promise(function(resolve){
      if (type === 'weekly') collectWeeklyReportData(resolve);
      else collectDailyReportData(resolve);
    });

    if (!data) {
      return new Response(JSON.stringify({ ok:false, error:'collect_failed', type:type }), { status:500, headers:{'Content-Type':'application/json'} });
    }

    var html = type === 'weekly' ? buildWeeklyReportHtml(data) : buildDailyReportHtml(data);

    var flagFilter = type === 'weekly' ? 'weekly=eq.true' : 'daily=eq.true';
    var recipientsRes: any = await sbGet('report_recipients', 'active=eq.true&' + flagFilter);
    var recipients = Array.isArray(recipientsRes) ? recipientsRes : [];
    var emails = recipients.map(function(r: any){ return r.email; }).filter(Boolean);

    if (!emails.length) {
      return new Response(JSON.stringify({ ok:true, sent:false, reason:'no_recipients', type:type }), { status:200, headers:{'Content-Type':'application/json'} });
    }

    var subject = type === 'weekly' ? '📊 ТеМАХ — Седмичен репорт' : '📋 ТеМАХ — Дневен репорт';

    var emailRes = await fetch(SUPABASE_URL + '/functions/v1/resend-email', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+SERVICE_KEY, 'apikey':SERVICE_KEY },
      body: JSON.stringify({ to: emails, subject: subject, html: html })
    });
    var emailOk = emailRes.ok;
    var emailStatus = emailRes.status;

    return new Response(JSON.stringify({ ok:true, sent:emailOk, email_status:emailStatus, recipients:emails.length, type:type }), { status:200, headers:{'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{'Content-Type':'application/json'} });
  }
});
