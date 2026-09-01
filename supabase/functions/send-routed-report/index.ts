/* send-routed-report — Edge Function за ЛИЧНИЯ седмичен отчет по задачи.

   v1 (01.09.2026) — първи файл, БЕЗ деплой и БЕЗ крон.

   Какво прави: в понеделник сутрин всеки, отметнат в report_groups на дадена
   задача, получава писмо САМО за своите задачи от приключилата седмица —
   заглавие, колко обекта са изпълнили, кои НЕ са, коментарите и прикачените
   файлове на тези, които са.

   Разликата спрямо send-scheduled-report е кому се праща, не какво се смята:
   там едно писмо с общата картина отива до фиксиран списък получатели
   (report_recipients); тук всеки получава РАЗЛИЧНО писмо, а списъкът се
   извежда от самите задачи през report_groups.

   ═══ ПРЕНЕСЕНА, НЕ НАПИСАНА НАНОВО ═══
   Логиката долу е ТОЧНО копие от report.js — collectWeeklyRoutingData,
   reportRoutedTaskWindow, resolveRecipientsForTask, buildRecipientMap,
   taskStoreBreakdown, personalizedTaskCardHtml, personalizedSectionHtml,
   reportAttachmentsHtml, плюс помощниците, които те викат. При промяна в
   report.js промяната се отразява и тук; tests/report-edge-sync.test.js
   пада, ако двете се разминат.

   Не пресмятам прозореца наново: приключилата седмица идва от същите
   reportPrevWeekMonday / reportWeekOfMonday / reportPickWeeklyBulletin,
   които ползва и ръчното изпращане от портала (sendWeeklyReportRouted).
   Отделна сметка тук би значела, че порталът и кронът показват различни
   седмици на един и същ човек.

   ═══ ТЕСТОВ РЕЖИМ ═══
   Редът 'weekly_routed' в notification_topics управлява функцията:
     · active=false          → нищо не се праща, връща се skipped;
     · test_email попълнен   → ВСИЧКИ писма отиват на този адрес, всяко с
                               жълта лента за кого е било предназначено;
     · test_email празен     → писмата отиват на истинските адреси.
   Същата уговорка като в bulletin-notify — един ред в базата, без втори
   превключвател в кода.

   ═══ КОЙ НЕ ПОЛУЧАВА ═══
   Човек без нито една задача за приключилата седмица НЕ получава писмо.
   Правилото живее в routedMailPlan(), а не като условие вътре в цикъла на
   изпращането — така се тества пряко (tests/routed-empty-recipient.test.js),
   вместо да се доказва чрез четене на кода.

   Разлика спрямо браузъра: sbGet/sbPatch тук говорят директно към PostgREST
   със SERVICE ROLE ключ (обикаля RLS) вместо sbGet от shared.js. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REST = SUPABASE_URL + '/rest/v1/';
const TOPIC_KEY = 'weekly_routed';

function sbGet(t: string, q?: string) {
  return fetch(REST + t + (q ? '?' + q : ''), {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  }).then(function(r){ return r.json(); });
}
function sbPatch(t: string, f: string, b: any) {
  return fetch(REST + t + '?' + f, {
    method: 'PATCH',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body: JSON.stringify(b)
  }).then(function(r){ return { ok: r.ok }; });
}


/* ═══════ ПОМОЩНИ ФУНКЦИИ — копие от shared.js/bulletin.js (чисти, без DOM) ═══════ */

function esc(s: any){ return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '—'; }
function escAttr(s: any){ return esc(s).replace(/"/g,'&quot;'); }
function toLocalISO(d){
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function weekDays(wk,yr){
  var s=new Date(yr,0,1+7*(wk-1));
  var d=s.getDay(); if(d<=4)s.setDate(s.getDate()-d+1); else s.setDate(s.getDate()+8-d);
  return [0,1,2,3,4,5,6].map(function(i){var x=new Date(s);x.setDate(s.getDate()+i);return x;});
}
function taskDueDates(t){
  if(t.due_dates && t.due_dates.length) return t.due_dates.map(function(d){return String(d).slice(0,10);});
  if(t.due_date) return [String(t.due_date).slice(0,10)];
  return [];
}
function recurringIsDueOnWeekday(t,weekdayIdx){
  if(t.due_weekdays && t.due_weekdays.length) return t.due_weekdays.indexOf(weekdayIdx)>=0;
  if(t.due_weekday===null||t.due_weekday===undefined){
    return !!t.due_time; /* "всеки ден" - важи за всеки делничен ден */
  }
  return t.due_weekday===weekdayIdx;
}
var LOGISTICS_WAREHOUSES = ['Логистичен склад Добрич','Логистичен склад Търговище'];
var REPORT_EXCLUDED_STORES = ['Централен офис'].concat(LOGISTICS_WAREHOUSES);
function isReportableStore(name){
  return !!name && REPORT_EXCLUDED_STORES.indexOf(name) < 0;
}

/* Групите за докладване — дословно от bulletin.js. */
var REPORT_GROUPS = {
  co:          {label:'Ц.О (Жеко, Васка)',        people:[{name:'Жеко Желязков',   email:'j.jeliazkov@temax.bg'},{name:'Василка Шикова',  email:'v.shikova@temax.bg'}]},
  controlling: {label:'Контролинг (Меги, Цвети)',  people:[{name:'Миглена Павлова', email:'m.pavlova@temax.bg'},{name:'Цветелина Тенева', email:'c.teneva@temax.bg'}]},
  regional:    {label:'Регионален (по магазин)',   dynamic:true},
  owner:       {label:'Т.Тенев',                   people:[{name:'Теодор Тенев',    email:'t.tenev@temax.bg'}]}
};

/* Имената на хората от Централен офис, за 'user:<имейл>' в report_groups.
   В браузъра кешът се пълни от loadCentralOfficePeople() в bulletin.js; тук
   го пълни обработчикът долу, ПРЕДИ да повика колектора. Държи се като
   променлива, а не се подава като аргумент, за да остане
   resolveRecipientsForTask() дословно същата като в report.js.
   Празен кеш не чупи нищо — coPersonName() връща самия имейл. */
var coPeopleCache = null;

function coPersonName(email){
  var list=coPeopleCache||[];
  for(var i=0;i<list.length;i++){ if(list[i].email===email) return list[i].display_name||list[i].email; }
  return email;
}

/* ═══════ РЕПОРТ ЛОГИКА — ТОЧНО копие от report.js ═══════════════════ */
var PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';

/* JS getDay() (0=Нед) -> индекса на портала (0=Пон..6=Нед). Същото
   преобразуване като в recurringIsDueToday(), но за ПРОИЗВОЛНА дата -
   дневният отчет пита за вчерашния делник, не за днешния. */
function reportWeekdayIdx(d){
  var js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

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

/* „23.08" — един формат на едно място. Ползва се и от подзаглавието, и от
   темите на писмата; разминат ли се, същата седмица излиза записана по два
   различни начина в едно и също писмо. */
function reportDayMonth(d){
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');
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

/* Прикачените към едно отмятане: снимка -> миниатюра, документ -> връзка с
   името. Проверката по разширение важи и за СТАРАТА колона photos: в нея
   лежат три .xlsx отпреди отделната колона files и досега излизаха в
   писмото като счупени картинки.

   Живее отделно, защото се ползва на ДВЕ места - коментарите по обекти в
   общия отчет и личните картички по задачи. Остане ли вградена в едното,
   другото се разминава при следващата промяна, без никой да забележи. */
function reportAttachmentsHtml(photos, files){
  var att = (photos||[]).concat(files||[]);
  if (!att.length) return '';
  var h = '<div style="margin-top:5px;">';
  att.forEach(function(ph){
    var nm = ph.filename || ph.name || '';
    var ext = nm.indexOf('.')>=0 ? nm.split('.').pop().toLowerCase() : '';
    /* Без име не съдим — виж tcAttachHtml() в bulletin.js. */
    if (!nm || ['jpg','jpeg','png','gif','webp','heic','heif'].indexOf(ext) >= 0) {
      h += '<img src="'+escAttr(ph.url)+'" style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid #D8DEE9;margin-right:5px;">';
    } else {
      h += '<a href="'+escAttr(ph.url)+'" style="display:inline-block;font-size:12px;color:#1E2761;text-decoration:none;border:1px solid #D8DEE9;border-radius:5px;padding:3px 8px;margin:0 5px 5px 0;">📄 '+esc(nm||'документ')+'</a>';
    }
  });
  return h + '</div>';
}

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
        /* photos/files минават нататък - личната картичка ги показва.
           Дотук се изхвърляха точно тук, тоест задачите от тип photo/file
           стигаха до получателя само като число. */
        var comps = regCompsRaw.map(function(c){ return { item_id:c.task_id, kind:'regular', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, files:c.files, completion_date:c.completion_date||null }; })
          .concat(recCompsRaw.map(function(c){ return { item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, status:c.status, comment:c.comment, photos:c.photos, files:c.files, completion_date:c.completion_date||null }; }));
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
  var out = [], byEmail = {};
  /* Дедупликацията е ПО ИМЕЙЛ. Дотук я вършеше само buildRecipientMap надолу;
     тук е, защото след 'user:<имейл>' застъпването е нормален случай, а не
     рядкост — човек може да е и в група, и отметнат поименно, и трябва да
     получи ЕДНО писмо. Първото име печели, точно както в buildRecipientMap,
     за да не зависи резултатът от реда на групите. */
  var add = function(name, email){
    if (!email || byEmail[email]) return;
    byEmail[email] = 1;
    out.push({ name:name||email, email:email });
  };
  (task.report_groups||[]).forEach(function(g){
    /* 'user:<имейл>' — отделен човек от Централен офис, отметнат поименно във
       формата (reportGroupsCheckboxesHtml в bulletin.js). Клонът стои ПРЕДИ
       проверката за REPORT_GROUPS, защото тя пропуска мълчаливо всичко, което
       не е един от четирите ключа: без него седмичната маршрутизация би
       подминала новите получатели без грешка и без следа.
       Името идва от кеша с хората от ЦО, ако е зареден; иначе имейлът. */
    if (typeof g==='string' && g.indexOf('user:')===0) {
      var em = g.slice(5);
      add(coPersonName(em), em);
      return;
    }
    var grp = REPORT_GROUPS[g];
    if (!grp) return;
    if (g==='regional') {
      var scope = task.target_stores;
      regionalUsers.forEach(function(u){
        if (!u.email) return;
        var as = Array.isArray(u.assigned_stores) ? u.assigned_stores : [];
        if (!as.length) return;
        var matches = (!scope || !scope.length) ? true : as.some(function(s){ return scope.indexOf(s)>=0; });
        if (matches) add(u.display_name||u.email, u.email);
      });
    } else if (grp.people) {
      grp.people.forEach(function(p){ add(p.name, p.email); });
    }
  });
  if (task.created_by && creatorMap && creatorMap[task.created_by]) {
    add(task.created_by, creatorMap[task.created_by]);
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
    if (c && c.status==='done') done.push({ store:s, comment:c.comment||'', photos:c.photos||[], files:c.files||[] });
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
  /* Кой НЕ е изпълнил - точно това получателят търси първо, а дотук
     картичката казваше само числото. Имената са обикновен текст, без
     reportStoreLinkHtml: редът е изброяване, не покана да се отвори всеки
     обект поотделно. */
  if (bd.pending.length) {
    h += '<div style="font-size:11px;color:#B91C1C;margin-top:4px;">Не са изпълнили: '+
      bd.pending.map(function(s){ return esc(s); }).join(', ')+'</div>';
  }
  if (bd.postponed.length) {
    h += '<div style="margin-top:6px;">';
    bd.postponed.forEach(function(p){
      h += '<div style="font-size:11px;color:#92400e;">⏱ '+esc(p.store)+(p.comment?': '+esc(p.comment):'')+'</div>';
    });
    h += '</div>';
  }
  /* Какво са казали и качили изпълнилите - смисълът на задачите от тип
     photo/file. Без този блок писмото свежда снимката до единица в „X от Y".
     Обект без коментар и без прикачени не заема ред. */
  var withContent = bd.done.filter(function(d){
    return d.comment || (d.photos && d.photos.length) || (d.files && d.files.length);
  });
  if (withContent.length) {
    h += '<div style="margin-top:8px;">';
    withContent.forEach(function(d){
      h += '<div style="padding:6px 0 0;margin-top:6px;border-top:1px solid #E5E9F0;">' +
        '<div style="font-size:12px;font-weight:600;color:#1F2937;">'+esc(d.store)+'</div>';
      if (d.comment) h += '<div style="font-size:12px;color:#4B5563;margin-top:2px;">💬 '+esc(d.comment)+'</div>';
      h += reportAttachmentsHtml(d.photos, d.files);
      h += '</div>';
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


/* ═══════ САМО ТУК — изпращане, тема, тестов режим ═══════════════════ */

/* КОЙ реално получава писмо.

   Отделна функция, а не условие вътре в цикъла на изпращането: правилото
   „човек без нито една задача за приключилата седмица НЕ получава писмо" е
   единственото, което пази хората от празни писма всеки понеделник, и трябва
   да се тества пряко, а не чрез четене на кода.

   buildRecipientMap() на практика не създава запис без задачи, но това е
   негово вътрешно свойство, не договор — промени ли се, тишината тук би
   била празно писмо до реален човек. Проверката е евтина и явна. */
function routedMailPlan(map){
  var out = [];
  Object.keys(map || {}).forEach(function(email){
    var rec = map[email];
    if (!email || !rec || !rec.tasks || !rec.tasks.length) return;
    out.push({ email: email, name: rec.name || email, tasks: rec.tasks });
  });
  return out;
}

/* Лентата над тялото на писмото в тестов режим. Пише за КОГО е било
   предназначено — иначе пет писма на един адрес са неразличими. */
function routedTestBannerHtml(name, email){
  return '<div style="background:#fef3c7;padding:8px 10px;border-radius:6px;margin-bottom:10px;font-size:12px;">' +
    'ТЕСТОВ РЕЖИМ — предназначено за ' + esc(name) + ' &lt;' + esc(email) + '&gt;</div>';
}

/* Темата е в стила на останалите писма от портала — reportDailySubject и
   reportWeeklySubject в report.js.

   Датата идва от ДАННИТЕ (седмицата на бюлетина), не от часовника на
   изпращането: иначе темата и шапката се разминават при всяко забавено
   изпращане. Липсват или са счупени данните — тема без дати, вместо
   „NaN.NaN" в темата на писмо до управители. */
function routedWeeklySubject(wkDates){
  if (!wkDates || wkDates.length < 7) return '📬 ТеМАХ — Личен седмичен отчет';
  var a = new Date(wkDates[0]+'T00:00:00'), b = new Date(wkDates[6]+'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '📬 ТеМАХ — Личен седмичен отчет';
  return '📬 ТеМАХ — Личен седмичен отчет ' + reportDayMonth(a) + ' – ' + reportDayMonth(b) + '.' + b.getFullYear();
}

function routedSendEmail(to: string, subject: string, html: string) {
  return fetch(SUPABASE_URL + '/functions/v1/resend-email', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+SERVICE_KEY, 'apikey':SERVICE_KEY },
    body: JSON.stringify({ to: [to], subject: subject, html: html })
  }).then(function(r){ return r.ok; }).catch(function(){ return false; });
}


Deno.serve(async (req: Request) => {
  try {
    var body: any = {};
    try { body = await req.json(); } catch (_e) { body = {}; }
    var dryRun = body && body.dry_run === true;

    /* ═══ 1. Темата от notification_topics ═══ */
    var topicsRes: any = await sbGet('notification_topics', 'key=eq.' + TOPIC_KEY + '&limit=1');
    var topics = Array.isArray(topicsRes) ? topicsRes : [];
    if (!topics.length) {
      return new Response(JSON.stringify({ ok:false, error:'no_topic', topic:TOPIC_KEY }),
        { status:404, headers:{'Content-Type':'application/json'} });
    }
    var topic: any = topics[0];

    /* Изключената тема не праща НИЩО — включително в dry_run. Превключвателят
       в Администрация трябва да значи едно и също нещо навсякъде. */
    if (!topic.active) {
      return new Response(JSON.stringify({ ok:true, skipped:'темата е изключена', topic:TOPIC_KEY, sent:0 }),
        { status:200, headers:{'Content-Type':'application/json'} });
    }
    var testEmail = topic.test_email || null;

    /* ═══ 2. Имената от Централен офис, преди колектора ═══ */
    var coRes: any = await sbGet('users', 'store_name=eq.' + encodeURIComponent('Централен офис') +
      '&active=eq.true&select=email,display_name&order=display_name');
    coPeopleCache = Array.isArray(coRes) ? coRes.filter(function(u: any){ return u && u.email; }) : [];

    /* ═══ 3. Данните за приключилата седмица ═══ */
    var data: any = await new Promise(function(resolve){ collectWeeklyRoutingData(resolve); });
    if (!data) {
      return new Response(JSON.stringify({ ok:false, error:'collect_failed', topic:TOPIC_KEY }),
        { status:500, headers:{'Content-Type':'application/json'} });
    }

    var wkDates = data.bul ? weekDays(data.bul.week_number, data.bul.year).map(toLocalISO) : null;
    var subject = routedWeeklySubject(wkDates);
    var map = buildRecipientMap(data.tasks, data.regionalUsers, data.creatorMap);
    var plan = routedMailPlan(map);

    if (dryRun) {
      return new Response(JSON.stringify({ ok:true, dry_run:true, topic:TOPIC_KEY,
        week: data.weekLabel, subject: subject, test_email: testEmail,
        tasks: data.tasks.length, recipients: plan.length,
        planned: plan.map(function(p: any){ return { email:p.email, name:p.name, zadachi:p.tasks.length }; })
      }), { status:200, headers:{'Content-Type':'application/json'} });
    }

    /* ═══ 4. По едно писмо на получател ═══ */
    var sent = 0, failed = 0;
    for (var i = 0; i < plan.length; i++) {
      var p: any = plan[i];
      var bodyHtml = (testEmail ? routedTestBannerHtml(p.name, p.email) : '') +
        personalizedSectionHtml(p.tasks, data.comps, data.stores);
      var html = reportEmailShell('📬 Твоите задачи — ' + (data.weekLabel||''),
        'Обобщение за приключилата седмица', bodyHtml,
        testEmail ? ('Тестов режим — реално изпратено до ' + testEmail)
                  : 'Автоматичен репорт · ТеМАХ Портал');
      var okOne = await routedSendEmail(testEmail || p.email, subject, html);
      if (okOne) { sent++; } else { failed++; }
    }

    /* ═══ 5. Следата в реда на темата ═══ */
    await sbPatch('notification_topics', 'key=eq.' + TOPIC_KEY, {
      last_run_at: new Date().toISOString(),
      last_recipients: plan.length,
      last_status: (failed ? 'ГРЕШКА: ' : 'ok: ') + sent + ' писма, ' + failed +
        ' неуспешни, ' + data.tasks.length + ' задачи' + (testEmail ? ' (тест)' : '')
    });

    return new Response(JSON.stringify({ ok:true, topic:TOPIC_KEY, week:data.weekLabel,
      tasks:data.tasks.length, recipients:plan.length, sent:sent, failed:failed,
      test_email:testEmail }), { status:200, headers:{'Content-Type':'application/json'} });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{'Content-Type':'application/json'} });
  }
});
