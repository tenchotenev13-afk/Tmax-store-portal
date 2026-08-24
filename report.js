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

/* Денят, който дневният отчет ОПИСВА - приключилият вчерашен, не текущият.
   Кронът "daily-report-8am" пуска функцията в 05:00 UTC = 08:00 българско.
   В 8 сутринта задачите за ТЕКУЩИЯ ден още не са отметнати, тоест писмото
   излизаше с почти нули и с днешната дата в шапката - тревога без покритие.
   Един ден за ВСИЧКО: дължими задачи, прозорец на отмятанията, ключ на
   snapshot-а и датата в шапката. Разминат ли се, писмото пак ще лъже, само
   по-тихо.
   now се подава като аргумент, за да е тестваемо без пипане на часовника. */
function reportDailyTargetDate(now){
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - 1);
  return d;
}
/* JS getDay() (0=Нед) -> индекса на портала (0=Пон..6=Нед). Същото
   преобразуване като в recurringIsDueToday(), но за ПРОИЗВОЛНА дата -
   дневният отчет пита за вчерашния делник, не за днешния. */
function reportWeekdayIdx(d){
  var js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

/* Събира данните за дневния репорт — идентична логика на today.js, за да
   съвпадат числата между живото табло и имейла. cb(data|null) */
function collectDailyReportData(cb){
  var reportDay = reportDailyTargetDate(new Date());
  var dayISO = toLocalISO(reportDay);
  var dayIdx = reportWeekdayIdx(reportDay);
  /* Бюлетинът на СЕДМИЦАТА НА ОТЧЕТНИЯ ДЕН, не последният публикуван.
     Бюлетините се публикуват предварително: в понеделник 24.08 най-новият
     е за седмица 35 (24-30.08), а отчетът описва 23.08 - ден от седмица 34.
     Оттам задачите на грешната седмица влизаха в дневния набор, а тези на
     вярната липсваха. Същият избор като в седмичния (списък + точно
     съвпадение, иначе най-новият, който НЕ е след отчетната седмица). */
  var dayTarget = reportWeekOfMonday(reportMondayOfWeek(reportDay));
  Promise.all([
    sbGet('bulletins','status=eq.published&order=year.desc,week_number.desc&limit=20'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = reportPickWeeklyBulletin(results[0], dayTarget);
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    /* Прозоречната задача се явява ВЕДНЪЖ — в деня на срока. Иначе обект,
       свършил я в понеделник, излиза неизпълнил във вторник и в сряда, и се
       брои три пъти. */
    var recurringToday = allRecurring.filter(function(t){ return recurringReportDueOnWeekday(t, dayIdx); });
    /* Прозорците за отчетния ден — отмятане от кой да е техен ден затваря
       задачата. Смятат се от самата дата, не през weekNum/година. */
    var recWinDates = {};
    recurringToday.forEach(function(t){ if(recurringIsWindow(t)) recWinDates[t.id]=recurringWindowDatesForDate(t, reportDay); });
    var recurringNoDue = allRecurring.filter(function(t){
      return (t.due_weekday===null || t.due_weekday===undefined) && !t.due_time;
    });

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      var regularToday = allBulTasks.filter(function(t){ return taskIsDueOnDate(t, dayISO); });

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
        /* Само completion-и от ОТЧЕТНИЯ ден за обикновени задачи - многодневна
           задача (Пон+Ср) не бива изпълнението от Понеделник да се показва
           като "изпълнено" (или "отложено") и в сряда. */
        regComps.forEach(function(c){ if((c.completion_date||null)===dayISO) comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos }); });
        /* Постоянна задача: отмятането трябва да носи ОТЧЕТНИЯ ден.
           Дотук `!c.completion_date ||` пускаше и старите записи без дата -
           184 такива в базата, всичките отпреди полето да се пълни. Те се
           броят за изпълнени всеки ден завинаги: за неделя 23.08 от 21
           „изпълнени" в писмото 15 бяха реални и 6 фантоми, тоест 39%
           вместо верните 28%. Седмичният ги изключва нарочно още от v3
           („не могат да бъдат отнесени към коя да е седмица") - тук важи
           същото, само че за ден.
           Прозоречната задача и без това изисква реална дата. */
        recComps.forEach(function(c){
          var win = recWinDates[c.recurring_task_id];
          var hit = win ? (!!c.completion_date && win.indexOf(c.completion_date)>=0)
                        : (c.completion_date === dayISO);
          if(hit) comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos });
        });

        var summary = reportBuildSummary(items, comps, stores, recurringNoDue.length);
        summary.reportDate = dayISO;
        var prevISO = toLocalISO(reportDailyTargetDate(reportDay));
        reportSaveSnapshot('daily', dayISO, summary.overallPct, summary.totalDone, summary.totalAll);
        reportFetchSnapshot('daily', prevISO, function(snap){
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
    /* По една клетка за всяко явяване, в реда на items. Решетката в дневния
       имейл чете точно този масив по редове, а срезът „по задачи" - по
       колони, тоест двата изгледа не могат да се разминат.

       Състоянията са ЧЕТИРИ, защото „не важи за този обект" не е същото
       като „неизпълнена": задача с target_stores извън обхвата не влиза
       нито в числителя, нито в знаменателя на ТОЗИ обект. Само задачите в
       обхват се броят - същото правило като преди, само че вече се вижда
       и клетка по клетка, не само в сбора. */
    var cells = items.map(function(it){
      var inScope = !it.target_stores || !it.target_stores.length || it.target_stores.indexOf(s)>=0;
      if (!inScope) return 'na';
      if (doneComps.some(function(c){ return c.store_name===s && reportItemMatchesComp(it,c); })) return 'done';
      if (postponedComps.some(function(c){ return c.store_name===s && reportItemMatchesComp(it,c); })) return 'postponed';
      return 'missing';
    });
    /* Отложената задача НЕ се брои за изпълнена, но остава в знаменателя -
       точно както досега (в процента влизаше само status='done'). */
    var total = 0, done = 0;
    cells.forEach(function(st){
      if (st === 'na') return;
      total++;
      if (st === 'done') done++;
    });
    var pct = total ? Math.round(done/total*100) : 0;
    totalDone += done; totalAll += total;
    if (pct < 50) laggards++;
    return { name:s, done:done, total:total, pct:pct, cells:cells };
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
    /* Легендата на решетката и заглавията в среза „по задачи" - в СЪЩИЯ
       ред, в който са клетките на всеки ред. Номерът на колоната е просто
       индексът тук + 1. */
    items: items,
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
/* Класация има смисъл само когато има какво да се класира. При еднакъв
   процент за ВСИЧКИ обекти двете кутии показват едни и същи числа под
   заглавия „🏆 ТОП 3" и „⚠️ ИЗИСКВАТ ВНИМАНИЕ" - три случайни обекта се
   оказват похвалени, други три посочени, без нищо да ги отличава. Точно
   това се случваше всеки понеделник, докато седмичният прозорец беше
   сбъркан и всички излизаха на 0%.

   top3 е подредено по низходящ процент, bottom3 - по възходящ (виж
   reportBuildSummary), тоест top3[0] е най-добрият, а bottom3[0] -
   най-слабият. Равни ли са тези двама, равни са всички. Празен списък
   обекти също не е класация. */
function reportRankingIsMeaningful(top3, bottom3){
  if (!top3 || !bottom3 || !top3.length || !bottom3.length) return false;
  return top3[0].pct !== bottom3[0].pct;
}
function reportTopBottomTable(top3, bottom3){
  if (!reportRankingIsMeaningful(top3, bottom3)) return '';
  var goodRows = top3.map(function(s,i){ return '<div style="font-size:13px;color:#1f2937;margin-bottom:4px;">'+(i+1)+'. '+esc(s.name)+' — '+s.pct+'%</div>'; }).join('');
  var badRows = bottom3.map(function(s,i){ return '<div style="font-size:13px;color:#1f2937;margin-bottom:4px;">'+(i+1)+'. '+esc(s.name)+' — '+s.pct+'%</div>'; }).join('');
  return '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:6px;"><tr>' +
    '<td style="width:50%;background:#E9F5EF;border-radius:8px;padding:12px 14px;vertical-align:top;"><div style="font-size:11px;font-weight:800;color:#2F7D5C;margin-bottom:8px;">🏆 ТОП 3</div>'+goodRows+'</td>' +
    '<td style="width:50%;background:#FDEEEA;border-radius:8px;padding:12px 14px;vertical-align:top;"><div style="font-size:11px;font-weight:800;color:#B4442E;margin-bottom:8px;">⚠️ ИЗИСКВАТ ВНИМАНИЕ</div>'+badRows+'</td>' +
    '</tr></table>';
}

/* Бележката за постоянните задачи без срок. Числото управлява прилагателното,
   съществителното, глагола И местоимението наведнъж - „1 постоянни задачи
   без конкретен срок чакат преглед ... виж ги" беше сгрешено на четири места
   в едно изречение. Затова двата варианта се пишат цели, а не със слепени
   окончания. weekly сменя само втората половина на изречението. */
function reportNoDueNoticeHtml(n, weekly){
  if (!n || n < 1) return '';
  var txt = weekly
    ? (n === 1
        ? '1 постоянна задача без конкретен срок не участва в тази статистика.'
        : n + ' постоянни задачи без конкретен срок не участват в тази статистика.')
    : (n === 1
        ? '1 постоянна задача без конкретен срок чака преглед (не участва в % по-горе) — виж я в таб „Днес".'
        : n + ' постоянни задачи без конкретен срок чакат преглед (не участват в % по-горе) — виж ги в таб „Днес".');
  return '<div style="margin-top:14px;padding:10px 14px;background:#FDF3E3;border-radius:8px;font-size:12px;color:#8A5A12;">📋 '+txt+'</div>';
}

function reportEmailShell(headerTitle, headerSub, bodyHtml, footerText){
  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:20px;background:#e8ecf3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;">' +
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
      '<div style="font-size:13px;font-weight:700;color:#78350f;">'+esc(p.title)+' <span style="font-weight:500;color:#92400e;">— '+esc(p.store)+'</span></div>' +
      (p.comment ? '<div style="font-size:12px;color:#92400e;margin-top:2px;">💬 '+esc(p.comment)+'</div>' : '') +
      '</div>';
  }).join('');
  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">⏱ Отложени задачи ('+postponedList.length+')</div>' +
    '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;overflow:hidden;">'+rows+'</div>' +
    '</div>';
}

/* ═══════ РЕШЕТКА „ОБЕКТ × ЗАДАЧА" (дневен) ═══════════════════════════
   Досега дневният имейл казваше КОЛКО, но не и КАКВО: ред „Добрич — 0 от 6
   задачи" не показва кои са тези шест, тоест писмото носеше тревога без
   материал и всеки път трябваше да се отваря порталът.

   Ширини при 600px обвивка: reportEmailShell слага padding:20px около
   тялото, значи полезното е 560px. 110px за името на обекта (най-дългото
   отчетно име е „Гоце Делчев" - складовете и ЦО падат в isReportableStore)
   + 44px за „X/N" оставят 406px за колоните. При 12 колони това е ~34px на
   клетка, което стига за номер и икона. */
var REPORT_GRID_MAX_COLS = 12;

/* Заглавията на задачите са дълги и в колона не се събират, затова в
   решетката стоят само номера, а пълните имена - в легендата над нея. */
function reportGridLegendHtml(items){
  var rows = items.map(function(it, i){
    return '<div style="font-size:11px;color:#4B5563;margin-bottom:3px;">' +
      '<b style="color:#1F2937;">'+(i+1)+'.</b> '+esc(it.title)+'</div>';
  }).join('');
  return '<div style="background:#F4F6FB;border-radius:8px;padding:10px 12px;margin-bottom:10px;">'+rows+'</div>';
}

/* Четирите състояния на клетката. Сивата точка значи „задачата не важи за
   този обект" - показва се нарочно, защото иначе различният знаменател
   („4/5" до „5/5") се чете като бъг в отчета. */
function reportGridCellHtml(state){
  var glyph = state==='done' ? '✓' : state==='missing' ? '✖' : state==='postponed' ? '⏳' : '·';
  var color = state==='done' ? '#2F9E5C' : state==='missing' ? '#C0392B' : state==='postponed' ? '#B6841E' : '#C7CDD6';
  return '<td align="center" style="padding:7px 2px;border-bottom:1px solid #EEF1F6;font-size:13px;color:'+color+';">'+glyph+'</td>';
}

/* Линк към обекта. ?store= е ЕДИНСТВЕНИЯТ параметър, който порталът
   разбира (shared.js/today.js) - затова имената остават кликаеми и в
   решетката, и в зеления ред. */
function reportStoreLinkHtml(name, color){
  return '<a href="'+escAttr(PORTAL_URL + '?store=' + encodeURIComponent(name))+'" ' +
    'style="color:'+color+';text-decoration:none;font-weight:700;">'+esc(name)+'</a>';
}

function reportGridHtml(data){
  var items = data.items || [];
  var rows = data.rows || [];
  if (!items.length || !rows.length) return '';
  /* Резервният вариант се проверява на ВСЯКО пускане, не еднократно: броят
     дължими задачи се мени от ден на ден. Над прага решетката отпада и
     остава само срезът „по задачи". */
  if (items.length > REPORT_GRID_MAX_COLS) return '';

  var behind = rows.filter(function(r){ return r.pct < 100; });
  var perfect = rows.filter(function(r){ return r.pct === 100; })
    .map(function(r){ return r.name; }).sort();

  var h = '';
  if (behind.length) {
    h += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 8px;">По обекти и задачи — изоставащите най-отгоре</div>';
    h += reportGridLegendHtml(items);
    h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">';
    h += '<tr><td width="110" style="padding:4px 6px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;">Обект</td>';
    items.forEach(function(it, i){
      h += '<td align="center" style="padding:4px 2px;font-size:11px;font-weight:700;color:#94a3b8;">'+(i+1)+'</td>';
    });
    h += '<td width="44" align="right" style="padding:4px 6px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;">Общо</td></tr>';
    behind.forEach(function(r){
      h += '<tr><td width="110" style="padding:7px 6px;border-bottom:1px solid #EEF1F6;font-size:12px;">' +
        reportStoreLinkHtml(r.name, '#1F2937') + '</td>';
      (r.cells || []).forEach(function(st){ h += reportGridCellHtml(st); });
      h += '<td width="44" align="right" style="padding:7px 6px;border-bottom:1px solid #EEF1F6;font-size:12px;font-weight:800;color:'+reportPctColor(r.pct)+';">' +
        r.done+'/'+r.total+'</td></tr>';
    });
    h += '</table>';
  }
  if (perfect.length) {
    /* Стопроцентовите се свиват в един ред, но имената им остават линкове -
       иначе добре работещите обекти щяха да са единствените, до които не се
       стига с клик от писмото. */
    var names = perfect.map(function(n){ return reportStoreLinkHtml(n, '#14532d'); }).join(', ');
    h += '<div style="margin-top:10px;padding:10px 14px;background:#E9F5EF;border-radius:8px;font-size:12px;color:#14532d;">' +
      '✅ 100%: '+names+'</div>';
  }
  return h;
}

/* ═══════ „ПО ЗАДАЧИ" - обратният срез ═══════════════════════════════
   Решетката отговаря „кой изостава". Тази секция отговаря „коя задача
   изостава" - случаят, в който цяла задача е пропусната навсякъде и
   проблемът е в самата задача или в срока ѝ, не в обектите.
   weekly сменя мярката: в дневния мери пропуски, в седмичния - процент
   изпълнение през цялата седмица. */
function reportByTaskHtml(data, weekly){
  var items = data.items || [];
  var rows = data.rows || [];
  if (!items.length || !rows.length) return '';
  /* В седмичния една задача е разгъната на по едно явяване за всеки ден, в
     който е дължима („Каса (17.8)", „Каса (18.8)" …) - 31 явявания за 12
     задачи. Тук те се СЪБИРАТ обратно по задача, защото въпросът на
     секцията е „коя задача системно не се изпълнява", а не „кой ден".
     Дневният няма какво да събира: там всяка задача е точно едно явяване,
     тоест групирането по id+kind е тъждествено. */
  var groups = [], byKey = {};
  items.forEach(function(it, i){
    var key = it.kind + '|' + it.id;
    if (!byKey[key]) {
      byKey[key] = { title: it.baseTitle || it.title, scope: 0, done: 0 };
      groups.push(byKey[key]);
    }
    var g = byKey[key];
    rows.forEach(function(r){
      var st = (r.cells || [])[i];
      if (!st || st === 'na') return;   /* извън обхват - не влиза в знаменателя */
      g.scope++;
      if (st === 'done') g.done++;
    });
  });
  var stats = groups.map(function(g){
    return { title: g.title, scope: g.scope, done: g.done,
             missing: g.scope - g.done,
             pct: g.scope ? Math.round(g.done/g.scope*100) : 0 };
  }).filter(function(s){
    /* Дневният показва само задачите с поне един пропуск - пълните редове
       вече ги има в решетката. Седмичният показва всички, защото там
       въпросът е коя задача системно куца, не коя куца днес. */
    return s.scope > 0 && (weekly || s.missing > 0);
  });
  if (!stats.length) return '';
  stats.sort(function(a,b){ return weekly ? (a.pct - b.pct) : (b.missing - a.missing); });

  var body = stats.map(function(s){
    var right = weekly
      ? '<span style="font-weight:800;color:'+reportPctColor(s.pct)+';">'+s.pct+'%</span>' +
        '<span style="color:#9CA3AF;margin-left:5px;">'+s.done+'/'+s.scope+'</span>'
      : '<span style="font-weight:700;color:#C0392B;">липсва при '+s.missing+' от '+s.scope+' обекта</span>';
    return '<tr><td style="padding:7px 10px;border-bottom:1px solid #EEF1F6;font-size:12px;color:#1F2937;">' +
      esc(s.title) + '</td>' +
      '<td align="right" style="padding:7px 10px;border-bottom:1px solid #EEF1F6;font-size:12px;white-space:nowrap;">' +
      right + '</td></tr>';
  }).join('');

  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">' +
    (weekly ? 'По задачи за седмицата — най-слабата най-отгоре' : 'По задачи — най-пропусканата най-отгоре') + '</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">' +
    body + '</table></div>';
}

/* ═══════ КОМЕНТАРИ ПО ОБЕКТИ ═══════════════════════════════════════
   Заварено: редовете бяха „Заглавие на задачата — Магазин", тоест три
   коментара от Добрич по три задачи излизаха на три различни места и
   обектът никога не се събираше на едно.

   Отложените влизат в СЪЩИЯ блок, отбелязани като отложени - те са
   съобщение от обекта точно както коментарът, само с друг статус. */
function reportCommentsByStoreHtml(data){
  var entries = [];
  (data.commentedList || []).forEach(function(c){
    entries.push({ store:c.store, title:c.title, comment:c.comment||'', photos:c.photos||[], postponed:false });
  });
  (data.postponedList || []).forEach(function(p){
    entries.push({ store:p.store, title:p.title, comment:p.comment||'', photos:[], postponed:true });
  });
  if (!entries.length) return '';

  /* Редът: изоставащите както в решетката, после стопроцентовите по азбучен
     ред. Правилото е нужно, защото решетката НЕ показва стопроцентовите -
     а точно те имат всичките си задачи изпълнени, тоест най-много редове
     тук (commentedList се строи от изпълнените отмятания). */
  var rows = data.rows || [];
  var order = rows.filter(function(r){ return r.pct < 100; }).map(function(r){ return r.name; })
    .concat(rows.filter(function(r){ return r.pct === 100; }).map(function(r){ return r.name; }).sort());
  var rank = {};
  order.forEach(function(n, i){ rank[n] = i; });

  var byStore = {}, seen = [];
  entries.forEach(function(e){
    if (!byStore[e.store]) { byStore[e.store] = []; seen.push(e.store); }
    byStore[e.store].push(e);
  });
  /* Обект извън rows (не бива да се случва) отива най-отзад, вместо
     съдържанието му да изчезне. */
  seen.sort(function(a,b){
    var ra = rank[a]===undefined ? 9999 : rank[a];
    var rb = rank[b]===undefined ? 9999 : rank[b];
    return ra - rb;
  });

  var blocks = seen.map(function(store){
    var lines = byStore[store].map(function(e){
      var h = '<div style="padding:6px 0 0;">' +
        '<div style="font-size:12px;color:#374151;">' +
        (e.postponed ? '<span style="color:#B45309;font-weight:700;">⏳ отложена · </span>' : '') +
        '<b>'+esc(e.title)+'</b></div>';
      if (e.comment) h += '<div style="font-size:12px;color:#4B5563;margin-top:2px;">💬 '+esc(e.comment)+'</div>';
      if (e.photos.length) {
        h += '<div style="margin-top:5px;">';
        e.photos.forEach(function(ph){
          h += '<img src="'+escAttr(ph.url)+'" style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid #D8DEE9;margin-right:5px;">';
        });
        h += '</div>';
      }
      return h + '</div>';
    }).join('');
    return '<div style="padding:10px 12px;border-bottom:1px solid #E5E9F0;">' +
      '<div style="font-size:13px;">'+reportStoreLinkHtml(store, '#1E2761')+'</div>' + lines + '</div>';
  }).join('');

  return '<div style="margin-top:14px;">' +
    '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">💬 Коментари по обекти ('+entries.length+')</div>' +
    '<div style="background:#F9FAFC;border:1px solid #E5E9F0;border-radius:8px;overflow:hidden;">'+blocks+'</div>' +
    '</div>';
}

/* Седмичният не изброява коментарите - 187 реда за седмица 34 са
   неизползваеми в имейл. Остава числото и пътят до тях. */
function reportCommentsCountHtml(commentedList){
  var n = (commentedList || []).length;
  if (!n) return '';
  var txt = n === 1
    ? '1 отмятане с коментар или снимка през седмицата — виж го в портала.'
    : n + ' отмятания с коментар или снимка през седмицата — виж ги в портала.';
  return '<div style="margin-top:14px;padding:10px 14px;background:#F4F6FB;border-radius:8px;font-size:12px;color:#4B5563;">💬 '+txt+'</div>';
}

function buildDailyReportHtml(data){
  var body = '<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:6px;"><tr>' +
    reportStatCell(data.overallPct+'%','изпълнение за деня', data.overallPct===100?'#2F9E5C':data.overallPct>=50?'#1E2761':'#C0392B') +
    reportStatCell(data.totalDone+'/'+data.totalAll,'изпълнени задачи','#1E2761') +
    reportStatCell(String(data.laggards),'обекта без напредък', data.laggards>0?'#C0392B':'#2F9E5C') +
    reportStatCell(String(data.storeCount),'обекта общо','#1E2761') +
    '</tr></table>';
  body += reportTrendHtml(data.overallPct, data.trendYesterday, 'спрямо предходния ден');
  /* Решетката поглъща стария списък от 18 реда „X от Y задачи" - той
     повтаряше числата, без да казва кои задачи липсват. Отпадат и кутиите
     ТОП 3 / ИЗИСКВАТ ВНИМАНИЕ: те преповтаряха краищата на списък, който и
     без това беше подреден изоставащите отгоре. През един ден класация
     няма самостоятелна стойност - остава само в седмичния.
     Отложените задачи вече са вътре в „Коментари по обекти", отбелязани
     като отложени, вместо в собствена секция. */
  body += reportGridHtml(data);
  body += reportByTaskHtml(data, false);
  body += reportCommentsByStoreHtml(data);
  body += reportNoDueNoticeHtml(data.noDueCount, false);
  /* Датата идва от ДАННИТЕ, не от часовника: писмото се пише в 8:00 на
     следващия ден и трябва да носи датата на деня, който описва. Fallback-ът
     към часовника пази само ръчно повикване със стар обект без reportDate. */
  var reportD = data.reportDate ? new Date(data.reportDate+'T00:00:00') : new Date();
  var dateStr = reportD.toLocaleDateString('bg-BG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  return reportEmailShell('📋 Дневен репорт — Задачи', dateStr, body,
    'Автоматичен репорт · ТеМАХ Портал');
}

function sendDailyReportTest(toEmail){
  if (!toEmail) { toast('Въведи имейл','#dc2626'); return; }
  toast('⏳ Подготвям дневния репорт...');
  collectDailyReportData(function(data){
    if (!data) { toast('Грешка при събиране на данните','#dc2626'); return; }
    var html = buildDailyReportHtml(data);
    sendEmail(toEmail, reportDailySubject(data.reportDate) + ' (тест)', html).then(function(res){
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

/* Понеделникът на СОБСТВЕНАТА седмица на подадената дата.
   Дневният отчет пита точно това: „от коя седмица е денят, който описвам" -
   за да вземе бюлетина на ТАЗИ седмица, а не последния публикуван. */
function reportMondayOfWeek(d){
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - reportWeekdayIdx(x));
  return x;
}
/* Понеделникът на ПРЕДХОДНАТА седмица спрямо подадената дата - седмичният
   отчет обобщава приключилата, не текущата. */
function reportPrevWeekMonday(now){
  var d = reportMondayOfWeek(now);
  d.setDate(d.getDate() - 7);
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
            items.push({ id:t.id, kind:'regular', title:t.title+' ('+dLabel+')', baseTitle:t.title, target_stores:t.target_stores||null, date:d });
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
        /* Прозорец: ЕДИН елемент за седмицата, с ДИАПАЗОН вместо дата.
           reportItemMatchesComp() вече брои отмятане вътре в dateFrom..dateTo
           (същият механизъм като задачите от бюлетина без собствен срок),
           затова тук НЕ се разгъва на под-елементи по ден: иначе задача
           "до сряда" влиза три пъти в знаменателя, а свършена в понеделник
           излиза изпълнена само за понеделник. */
        if (recurringIsWindow(t)) {
          items.push({ id:t.id, kind:'recurring', title:t.title, target_stores:t.target_stores||null,
                       dateFrom: occDates[0], dateTo: occDates[occDates.length-1] });
          return;
        }
        if (occDates.length > 1) {
          occDates.forEach(function(d){
            var dLabel = new Date(d+'T00:00:00').toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
            items.push({ id:t.id, kind:'recurring', title:t.title+' ('+dLabel+')', baseTitle:t.title, target_stores:t.target_stores||null, date:d });
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
        summary.weekDates = wkDates; /* същите дати, които стесняват задачите - в шапката */
        var finish = function(){
          /* ЕДИН прозорец за целия имейл: същите wkDates, които стесняват
             задачите и заявките за task_completions по-горе, стесняват и
             кросмодулните броячи. Без бюлетин wkDates е null и секцията
             пада обратно на подвижни 7 дни - тогава и шапката пише
             "Няма публикуван бюлетин", тоест няма с какво да се разминат. */
          collectCrossModuleWeeklySummary(function(cross){
            summary.cross = cross; /* null при грешка - секцията просто не се показва, не гърми */
            cb(summary);
          }, wkDates ? { from: wkDates[0], to: wkDates[6] } : null);
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

/* ── Прозорецът на кросмодулната секция ──
   Два различни повикващи, два законни прозореца:

   win = {from,to} (локални ISO дати, понеделник и неделя) - СЕДМИЧНИЯТ
     отчет. Той носи шапка "Седмица 34 · 2026" и всеки ред пише "нови за
     периода", затова числата под шапката трябва да са за СЪЩАТА календарна
     седмица. Досега тук минаваха подвижни 7 дни назад от момента на
     пускането: в едно и също писмо за седмица 33 процентът по обекти
     покриваше 17-23.08, а кросмодулните броячи - 14-21.08. Ръчно пуснат
     отчет в сряда мереше съвсем трети интервал.

   win = null - таб ДНЕС и дневният отчет. Там подвижните 7 дни са ВЕРНИЯТ
     прозорец: няма шапка с номер на седмица, а въпросът е "какво се е
     случило напоследък". Не се пипат.

   Горната граница е ИЗКЛЮЧВАЩА (< понеделник 00:00 на следващата седмица),
   за да влезе цялата неделя - `lte.` върху дата на timestamptz отрязва
   всичко след неделя 00:00:00. */
function reportCrossWindow(win){
  if (win && win.from && win.to) {
    var end = new Date(win.to + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    return {
      fromISO: win.from, toISO: win.to,
      fromStamp: new Date(win.from + 'T00:00:00').toISOString(),
      toStamp: end.toISOString()
    };
  }
  var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  return {
    fromISO: toLocalISO(weekAgo), toISO: null,
    fromStamp: weekAgo.toISOString(), toStamp: null
  };
}

function collectCrossModuleWeeklySummary(cb, win){
  var W = reportCrossWindow(win);
  var upStamp = W.toStamp ? '&created_at=lt.' + W.toStamp : '';
  var upDate = W.toISO ? '&date=lte.' + W.toISO : '';

  /* "Застояли" и "остарели" НЕ следват прозореца - те са моментна снимка
     спрямо ДНЕС ("pending от повече от 7 дни"), а не "случило се през
     седмицата". Затова прагът им се смята отделно и остава подвижен и в
     двата режима. Същото важи за stock_returns и transport_pallets, които
     изобщо нямат филтър по дата. */
  var staleAgo = new Date(); staleAgo.setDate(staleAgo.getDate() - 7);
  var staleStamp = staleAgo.toISOString();

  Promise.all([
    /* store_name и direction са нужни, за да се отдели сторната по грешен
       прием от другите две посоки и да се разбие по обект. Само reviewed
       не стигаше - разбивка по магазин беше физически невъзможна. */
    sbGet('differences_reports','created_at=gte.'+W.fromStamp+upStamp+'&select=store_name,direction,reviewed'),
    sbGet('stock_returns','select=status'),
    sbGet('kasa_storno','created_at=gte.'+W.fromStamp+upStamp+'&select=status'),
    sbGet('kasa_zoborot','date=gte.'+W.fromISO+upDate+'&select=status'),
    sbGet('goods_transit','status=eq.pending&created_at=lt.'+staleStamp+'&select=id'),
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
      pallets: { missing: palletsMissing, stale: palletsStale, total: storeNames.length },
      /* Прозорецът пътува заедно с числата, за да го изпише заглавието -
         иначе читателят няма как да разбере кой интервал са мерили. */
      window: { from: W.fromISO, to: W.toISO }
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
    return crossModuleRow('🧾','Сторна по грешен прием (нови за периода)',
      crossMetricCard(0,'няма нови'));
  }
  var cards = crossMetricCard(wr.total,'общо нови') +
              crossMetricCard(wr.unreviewed,'непрегледани', wr.unreviewed>0);
  cards += wr.byStore.map(function(s){
    return crossMetricCard(s.count, esc(s.store), true);
  }).join('');
  return crossModuleRow('🧾','Сторна по грешен прием (нови за периода)', cards);
}
/* "17.08 – 23.08" за затворен прозорец; "последните 7 дни" за подвижния.
   Датите се изписват, защото един и същ HTML отива на две места с два
   различни прозореца - без тях "за периода" в редовете не значи нищо. */
function reportCrossWindowLabel(win){
  if (!win || !win.to) return 'последните 7 дни';
  var f = function(d){
    return new Date(d + 'T00:00:00').toLocaleDateString('bg-BG', { day:'numeric', month:'numeric' });
  };
  return f(win.from) + ' – ' + f(win.to);
}
function buildCrossModuleSectionHtml(cross){
  if (!cross) return '';
  var h = '<div style="margin-top:18px;padding-top:14px;border-top:2px solid #eef1f6;">';
  h += '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">🗂 Друго от периода ('+reportCrossWindowLabel(cross.window)+') — по табове</div>';

  /* Числата тук са БЕЗ сторната по грешен прием - тя има собствен ред
     по-долу и иначе би се броила два пъти. */
  h += crossModuleRow('📋','Разлики от доставчици и междускладови (нови за периода)',
    crossMetricCard(cross.diffs.total,'нови доклада') +
    crossMetricCard(cross.diffs.reviewed,'прегледани',false) +
    crossMetricCard(cross.diffs.unreviewed,'непрегледани', cross.diffs.unreviewed>0));

  h += buildWrongReceiptRowHtml(cross.wrongReceipt);

  h += crossModuleRow('📥','За връщане (текущо състояние)',
    crossMetricCard(cross.returns.open,'отворени (чакат/взети)', cross.returns.open>0) +
    crossMetricCard(cross.returns.completed,'приключени'));

  h += crossModuleRow('💳','Каса — Сторно бележки (нови за периода)',
    crossMetricCard(cross.storno.total,'общо нови') +
    crossMetricCard(cross.storno.draft,'чакат счетоводство', cross.storno.draft>0) +
    crossMetricCard(cross.storno.returned,'върнати за коментар', cross.storno.returned>0) +
    crossMetricCard(cross.storno.confirmed,'приключени'));

  h += crossModuleRow('🧾','Каса — Равнение (за периода)',
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

/* Подзаглавието на седмичния отчет - „Обобщение за 17.08 – 23.08.2026".
   Само „Обобщение за седмицата" не казваше КОЯ седмица. Номерът стои в
   заглавието, но отчетите не се четат по номер на седмица, а по дати.
   Без бюлетин wkDates е null и се пада обратно на общия текст - тогава
   заглавието и без това пише „Няма публикуван бюлетин". */
function reportWeekRangeLabel(wkDates){
  if (!wkDates || wkDates.length < 7) return 'Обобщение за седмицата';
  var a = new Date(wkDates[0]+'T00:00:00'), b = new Date(wkDates[6]+'T00:00:00');
  return 'Обобщение за ' + reportDayMonth(a) + ' – ' + reportDayMonth(b) + '.' + b.getFullYear();
}

/* „23.08" — един формат на едно място. Ползва се и от подзаглавието, и от
   темите на писмата; разминат ли се, същата седмица излиза записана по два
   различни начина в едно и също писмо. */
function reportDayMonth(d){
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');
}

/* ═══════ ТЕМИТЕ НА ПИСМАТА ═══════════════════════════════════════════
   Досега всяко дневно писмо носеше една и съща тема и в пощата се
   превръщаха в неразличима поредица — не можеш да отвориш „онзи от
   вторник", нито да видиш дали днешният изобщо е дошъл.

   След като отчетът описва ПРИКЛЮЧИЛИЯ ден, темата без дата е и
   подвеждаща: писмото идва сутринта на 24-ти, а е за 23-ти.

   Датата идва от ДАННИТЕ (същия reportDate/weekDates, които пълнят
   шапката), не от часовника на изпращането — иначе темата и шапката ще
   се разминават при всяко забавено изпращане.

   Липсват или са счупени данните — темата пада на старата. По-добре без
   дата, отколкото „NaN.NaN" в темата на писмо до управители.

   Бележка: resend-email прекарва темата през transliterate() и тя излиза
   на латиница. Цифрите оцеляват — точно те носят смисъла тук. */
function reportDailySubject(reportDate){
  var d = reportDate ? new Date(reportDate+'T00:00:00') : null;
  if (!d || isNaN(d.getTime())) return '📋 ТеМАХ — Дневен репорт';
  return '📋 ТеМАХ — Дневен репорт ' + reportDayMonth(d) + '.' + d.getFullYear();
}
function reportWeeklySubject(wkDates){
  if (!wkDates || wkDates.length < 7) return '📊 ТеМАХ — Седмичен репорт';
  var a = new Date(wkDates[0]+'T00:00:00'), b = new Date(wkDates[6]+'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '📊 ТеМАХ — Седмичен репорт';
  return '📊 ТеМАХ — Седмичен репорт ' + reportDayMonth(a) + ' – ' + reportDayMonth(b) + '.' + b.getFullYear();
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
  /* Решетка не става за седмица - 31 явявания са твърде широки за 600px.
     Затова двата среза стоят поотделно: по обекти (горе) и по задачи
     (тук). Вторият липсваше изцяло, тоест не се виждаше коя задача
     системно не се изпълнява. */
  body += reportByTaskHtml(data, true);
  body += reportTopBottomTable(data.top3, data.bottom3);
  body += reportPostponedSectionHtml(data.postponedList);
  body += reportCommentsCountHtml(data.commentedList);
  body += reportNoDueNoticeHtml(data.noDueCount, true);
  body += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;font-style:italic;">Забележка: постоянните задачи участват с по едно явяване за всеки ден, в който са дължими през седмицата (задача „всеки ден" = 7 явявания) — точно както се отмятат в Седмичния календар. Отметка от предишна седмица не се брои за текущата.</div>';
  body += buildCrossModuleSectionHtml(data.cross);
  return reportEmailShell('📊 Седмичен репорт — ' + (data.weekLabel||''), reportWeekRangeLabel(data.weekDates), body,
    'Автоматичен репорт · ТеМАХ Портал');
}

function sendWeeklyReportTest(toEmail){
  if (!toEmail) { toast('Въведи имейл','#dc2626'); return; }
  toast('⏳ Подготвям седмичния репорт...');
  collectWeeklyReportData(function(data){
    if (!data) { toast('Грешка при събиране на данните','#dc2626'); return; }
    var html = buildWeeklyReportHtml(data);
    sendEmail(toEmail, reportWeeklySubject(data.weekDates) + ' (тест)', html).then(function(res){
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

/* Прозорецът на ЕДНА маршрутизирана задача.

   Общият отчет разгъва всяка задача на по едно ЯВЯВАНЕ на ден (постоянна
   задача „всеки ден" = 7 явявания). Личният имейл показва по една картичка
   на ЗАДАЧА, не на явяване, затова тук прозорецът се свива до едно поле:
     · един срок в седмицата   → точна дата
     · няколко или никакъв     → диапазонът на седмицата
     · няма бюлетин            → wildcard (старото поведение, за да не
                                 остане имейлът празен без публикуван бюлетин)
   И трите се разбират от reportItemMatchesComp - същата функция, която мери
   процента в общия отчет.

   null = задачата изобщо не влиза. Постоянна задача без нито едно явяване
   тази седмица иначе получава картичка, в която ВСИЧКИ обекти са изброени
   като „не изпълнили" за седмица, в която тя не е била дължима. */
function reportRoutedTaskWindow(t, wkDates, bul){
  if (!wkDates || !bul) return { date:null };
  var dates = (t.kind === 'recurring')
    ? reportRecurringWeekDates(t, bul.week_number, bul.year)
    : taskDueDates(t);
  if (t.kind === 'recurring' && !dates.length) return null;
  if (dates.length === 1) return { date:dates[0], dateFrom:null, dateTo:null };
  return { date:null, dateFrom:wkDates[0], dateTo:wkDates[6] };
}

/* Събира само задачите с зададени report_groups от бюлетина на ПРИКЛЮЧИЛАТА
   седмица + отмятанията им от СЪЩАТА седмица + accounting потребителите
   (за 'regional').

   Прозорецът минава през същите функции като общия седмичен отчет -
   reportPrevWeekMonday / reportWeekOfMonday / reportPickWeeklyBulletin за
   избора на бюлетин, reportRecurringWeekDates за явяванията на постоянните
   задачи, reportItemMatchesComp за съвпадението. Дотук личните имейли носеха
   и трите дефекта, които общият отчет вече няма:

     · взимаше се последният публикуван бюлетин (created_at.desc&limit=1), а
       той се публикува ПРЕДВАРИТЕЛНО за идващата седмица - всяка картичка
       описваше седмица, която още не е започнала, тоест нулеви резултати;
     · task_completions се теглеха без филтър по дата - всяко отмятане,
       правено някога, влизаше в набора;
     · разбивката по обекти съвпадаше само по item_id+kind+store_name, без
       никаква дата - обект, отметнал задачата преди месец, излизаше като
       „изпълнил я" тази седмица.

   Двата дефекта се компенсираха взаимно и точно затова имейлът изглеждаше
   правдоподобен: грешната седмица дърпаше числата надолу, липсващият
   прозорец ги дърпаше нагоре. */
function collectWeeklyRoutingData(cb){
  var target = reportWeekOfMonday(reportPrevWeekMonday(new Date()));
  Promise.all([
    /* Списък, не limit=1 - изборът на правилната седмица е по-долу. */
    sbGet('bulletins','status=eq.published&order=year.desc,week_number.desc&limit=20'),
    sbGet('recurring_tasks','active=eq.true')
  ]).then(function(results){
    var bul = reportPickWeeklyBulletin(results[0], target);
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var routedRecurring = allRecurring.filter(function(t){ return t.report_groups && t.report_groups.length; });
    var wkDates = bul ? weekDays(bul.week_number, bul.year).map(toLocalISO) : null;
    var weekLabel = bul ? ('Седмица ' + bul.week_number + ' · ' + bul.year) : 'Няма публикуван бюлетин';

    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);
    bulTasksPromise.then(function(tasksRaw){
      var allTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      var routedRegular = allTasks.filter(function(t){ return t.report_groups && t.report_groups.length; });

      /* Прозорецът се закача на самата задача - taskStoreBreakdown после го
         подава на reportItemMatchesComp. */
      var routedTasks = [];
      var addRouted = function(t, kind){
        t.kind = kind;
        var win = reportRoutedTaskWindow(t, wkDates, bul);
        if (!win) return;
        t.date = win.date; t.dateFrom = win.dateFrom; t.dateTo = win.dateTo;
        routedTasks.push(t);
      };
      routedRegular.forEach(function(t){ addRouted(t, 'regular'); });
      routedRecurring.forEach(function(t){ addRouted(t, 'recurring'); });

      if (!routedTasks.length) { cb({ bul:bul, weekLabel:weekLabel, tasks:[], comps:[], stores:[], regionalUsers:[], creatorMap:{} }); return; }

      /* ID-тата идват от ФИЛТРИРАНИЯ набор, не от суровия - няма смисъл да
         се теглят отмятания за задача, която не е дължима тази седмица. */
      var regIds = [], recIds = [];
      routedTasks.forEach(function(t){
        if (t.kind === 'recurring') recIds.push(t.id); else regIds.push(t.id);
      });

      /* Прозорец и на самата ЗАЯВКА, не само при съвпадението. Отмятанията
         с completion_date=NULL отпадат нарочно - те не могат да бъдат
         отнесени към коя да е седмица. */
      var dateQ = wkDates
        ? '&completion_date=gte.' + wkDates[0] + '&completion_date=lte.' + wkDates[6]
        : '';

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')'+dateQ) : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')'+dateQ) : Promise.resolve([]),
        sbGet('users','select=store_name&order=store_name'),
        sbGet('users','is_regional=eq.true&select=email,display_name,assigned_stores'),
        sbGet('users','select=display_name,email') /* за резолвиране на created_by (display_name) -> email на създателя */
      ]).then(function(r2){
        var regCompsRaw = Array.isArray(r2[0]) ? r2[0] : [];
        var recCompsRaw = Array.isArray(r2[1]) ? r2[1] : [];
        var users = Array.isArray(r2[2]) ? r2[2] : [];
        var regionalUsers = Array.isArray(r2[3]) ? r2[3] : [];
        var allUsers = Array.isArray(r2[4]) ? r2[4] : [];
        var seen = {};
        var stores = users.filter(function(u){
          if (!isReportableStore(u.store_name) || seen[u.store_name]) return false;
          seen[u.store_name] = 1; return true;
        }).map(function(u){ return u.store_name; });
        /* completion_date ЗАДЪЛЖИТЕЛНО минава нататък - reportItemMatchesComp
           сравнява точно него срещу прозореца на задачата. */
        var comps = regCompsRaw.map(function(c){ return { item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, completion_date:c.completion_date||null }; })
          .concat(recCompsRaw.map(function(c){ return { item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, completion_date:c.completion_date||null }; }));
        var creatorMap = {};
        allUsers.forEach(function(u){ if (u.display_name && u.email) creatorMap[u.display_name] = u.email; });
        cb({ bul:bul, weekLabel:weekLabel, tasks:routedTasks, comps:comps, stores:stores, regionalUsers:regionalUsers, creatorMap:creatorMap });
      }).catch(function(){ cb(null); });
    }).catch(function(){ cb(null); });
  }).catch(function(){ cb(null); });
}

/* За една задача връща кой получава известие за нея — 'co'/'controlling'/
   'owner' са фиксирани хора; 'regional' се извежда динамично от
   потребителите с users.is_regional=true, чиито assigned_stores пресичат
   target_stores на задачата (ако задачата е за ВСИЧКИ магазини — включва
   всички регионални с назначени обекти).

   Признакът е ОТДЕЛНА колона, не роля: дотук списъкът идваше от
   role=eq.accounting и грешеше в двете посоки — 9 счетоводителки получаваха
   задачите, без да са регионални, а В. Филев е регионален, но е admin и
   никога не ги получаваше. Ролята не може да се смени, тя е ключ за достъп
   на 43 места. is_regional е независим и от oborot_report: онова поле значи
   „какъв вечерен оборот получава", не „каква длъжност заема".

   Освен избраните report_groups, СЪЗДАТЕЛЯТ на задачата (created_by,
   само за обикновени bulletin_tasks - recurring_tasks нямат това поле)
   винаги се добавя автоматично като получател, ако имейлът му може да бъде
   резолвнат през creatorMap (display_name -> email от users). */
function resolveRecipientsForTask(task, regionalUsers, creatorMap){
  var out = [];
  (task.report_groups||[]).forEach(function(g){
    var grp = REPORT_GROUPS[g];
    if (!grp) return;
    if (g==='regional') {
      var scope = task.target_stores;
      regionalUsers.forEach(function(u){
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
function buildRecipientMap(tasks, regionalUsers, creatorMap){
  var map = {};
  tasks.forEach(function(t){
    resolveRecipientsForTask(t, regionalUsers, creatorMap).forEach(function(r){
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
  /* Същият предикат като процента в общия отчет. Дотук съвпадението беше
     само item_id+kind+store_name - обект, отметнал задачата преди месец,
     излизаше като „изпълнил я" тази седмица. Прозорецът се закача на
     задачата в collectWeeklyRoutingData; ако липсва (стар повикващ), полетата
     са null и reportItemMatchesComp се държи както преди. */
  var matcher = { id:task.id, kind:taskKind, date:task.date||null,
                  dateFrom:task.dateFrom||null, dateTo:task.dateTo||null };
  scope.forEach(function(s){
    /* В диапазон един обект може да има повече от едно отмятане (отложил
       във вторник, изпълнил в четвъртък). „Изпълнено" печели - същото,
       което прави reportBuildSummary, като брои doneComps отделно. Без
       този избор резултатът зависи от реда, в който PostgREST е върнал
       редовете. */
    var mine = comps.filter(function(x){ return x.store_name===s && reportItemMatchesComp(matcher, x); });
    var c = mine.find(function(x){ return x.status==='done'; }) ||
            mine.find(function(x){ return x.status==='postponed'; }) || mine[0];
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
  if (!tasks.length) return '<div style="font-size:13px;color:#94a3b8;">Няма задачи, адресирани лично към теб тази седмица.</div>';
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
    var map = buildRecipientMap(data.tasks, data.regionalUsers, data.creatorMap);
    var emails = Object.keys(map);
    if (!emails.length) { toast('Няма разрешени получатели — провери групите на задачите','#dc2626'); return; }
    var sent = 0, total = emails.length;
    emails.forEach(function(email){
      var rec = map[email];
      var body = personalizedSectionHtml(rec.tasks, data.comps, data.stores);
      /* Седмицата се изписва в шапката - иначе получателят няма как да
         разбере кой период описват картичките, а точно това беше сбъркано. */
      var html = reportEmailShell('📬 Твоите задачи — '+(data.weekLabel||'')+' (ТЕСТ)', 'Предназначено за: '+rec.name+' ('+email+')', body,
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
      sendEmail(emails, reportDailySubject(data.reportDate), html).then(function(res){
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
      sendEmail(emails, reportWeeklySubject(data.weekDates), html).then(function(res){
        if (res.ok) toast('✅ Седмичен репорт изпратен на ' + emails.length + ' получатели');
        else toast('❌ ' + res.status + ': ' + ((res.data && (res.data.message||res.data.error)) || 'грешка'), '#dc2626');
      });
    });
  });
}

