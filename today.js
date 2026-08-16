/* today.js — Живо табло "Днес"
   Показва изпълнението по обекти за днешните задачи — както от текущия
   публикуван Бюлетин (bulletin_tasks, due_date=днес), така и постоянните
   задачи (recurring_tasks), които важат за днешния ден от седмицата.
   Постоянните задачи БЕЗ ден/час (напр. "ВАЖНО сесии САП!") се показват
   отделно в раздел "Текущи/без срок" и НЕ участват в дневния %.
   Само за преглед (read-only) — НЕ пише в task_completions; отбелязването
   на задачи си остава през таб Бюлетин, както досега.

   Зависимости: DEPTS, toLocalISO, recurringIsDueToday са дефинирани в
   bulletin.js — today.js трябва да се зарежда СЛЕД bulletin.js в index.html. */

var todayCache = null;        /* {items, noDueItems, comps, stores} — за филтриране без нова заявка */
var todayFilterStore = 'all'; /* избран магазин от филтъра, 'all' = всички */
var todayExpandedStore = null; /* кой магазин е разгънат в момента (accordion) - null = никой */
var todayYesterdaySnapshot = null; /* вчерашният snapshot, за тенденцията */
var todayTrendFetched = false;     /* пазим само 1 fetch на тенденцията на зареждане, не при всеки re-render */
var todayPhotosExpanded = false;   /* дали е разгъната секцията "Снимки за преглед" */
var todayPhotosCache = null;       /* заредените снимки - lazy, само при първо разгъване */

function loadTodayDashboard(){
  var wrap = document.getElementById('mod-today');
  if (!wrap) return;
  wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:300px;color:#94a3b8;font-size:15px;">⏳ Зареждане...</div>';
  todayCache = null;
  todayFilterStore = 'all';
  todayTrendFetched = false;
  todayYesterdaySnapshot = null;
  todayPhotosExpanded = false;
  todayPhotosCache = null;
  /* Deep-link от имейл: ?store=Име%20магазин -> автоматично разгъва точно
     този магазин, за да не се налага търсене след клик от репорта. */
  try {
    var qsStore = new URLSearchParams(window.location.search).get('store');
    todayExpandedStore = qsStore ? decodeURIComponent(qsStore) : null;
  } catch(e) { todayExpandedStore = null; }

  Promise.all([
    sbGet('bulletins','status=eq.published&order=created_at.desc&limit=1'),
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc')
  ]).then(function(results){
    var bul = (Array.isArray(results[0]) && results[0].length) ? results[0][0] : null;
    var allRecurring = Array.isArray(results[1]) ? results[1] : [];
    var recurringToday = allRecurring.filter(function(t){ return recurringIsDueToday(t); });
    /* "Текущи/без срок" — нямат нито ден, нито час; recurringIsDueToday() ги връща false,
       затова наборите са естествено разделени, без припокриване */
    var recurringNoDue = allRecurring.filter(function(t){
      return (t.due_weekday===null || t.due_weekday===undefined) && !t.due_time;
    });

    var todayISO = toLocalISO(new Date());
    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);

    bulTasksPromise.then(function(tasksRaw){
      var allBulTasks = Array.isArray(tasksRaw) ? tasksRaw : [];
      var regularToday = allBulTasks.filter(function(t){ return taskIsDueOnDate(t, todayISO); });

      /* обединяваме двата типа задачи в общ формат за таблото - пазим
         target_stores, за да не броим задача в знаменателя на магазин, за
         който изобщо не важи (recurring нямат target_stores - важат за всички) */
      var items = [];
      regularToday.forEach(function(t){ items.push({ id:t.id, title:t.title, department:t.department, kind:'regular', target_stores:t.target_stores||null }); });
      recurringToday.forEach(function(t){ items.push({ id:t.id, title:t.title, department:t.department, kind:'recurring', target_stores:t.target_stores||null }); });

      var noDueItems = recurringNoDue.map(function(t){ return { id:t.id, title:t.title, department:t.department, kind:'recurring' }; });

      if (!items.length && !noDueItems.length) { wrap.innerHTML = todayEmptyHtml('Няма задачи (нито от Бюлетин, нито постоянни).'); return; }

      var regIds = regularToday.map(function(t){ return t.id; });
      var recIds = recurringToday.map(function(t){ return t.id; });
      var noDueIds = recurringNoDue.map(function(t){ return t.id; });
      var allRecIds = recIds.concat(noDueIds); /* completion-и за двата recurring набора взимаме заедно */

      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')') : Promise.resolve([]),
        allRecIds.length ? sbGet('task_completions','recurring_task_id=in.('+allRecIds.join(',')+')') : Promise.resolve([]),
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

        if (!stores.length) { wrap.innerHTML = todayEmptyHtml('Няма намерени обекти.'); return; }

        /* нормализираме completion-ите в общ формат: {item_id, kind, store_name}
           - взимаме само status='done', за да не броим отложените (postponed)
           задачи като изпълнени в процента; пазим comment/photos, за да
           могат да се преглеждат директно тук, без да се отваря Бюлетин.
           За обикновени задачи филтрираме и по completion_date===днес -
           многодневна задача (Пон+Ср) не бива изпълнението от Понеделник
           да се показва като "изпълнено" и в сряда. */
        var comps = [];
        regComps.forEach(function(c){ if(c.status==='done' && (c.completion_date||null)===todayISO) comps.push({ item_id:c.task_id, kind:'regular', store_name:c.store_name, comment:c.comment, photos:c.photos }); });
        /* completion_date=null (стара постоянна задача - персистира завинаги)
           или съвпада с ДНЕС (нова многодневна постоянна задача - само
           днешното ѝ отмятане се брои за днес). */
        recComps.forEach(function(c){ if(c.status==='done' && (!c.completion_date || c.completion_date===todayISO)) comps.push({ item_id:c.recurring_task_id, kind:'recurring', store_name:c.store_name, comment:c.comment, photos:c.photos }); });

        todayCache = { items:items, noDueItems:noDueItems, comps:comps, stores:stores };
        renderTodayDashboard(wrap, items, noDueItems, comps, stores);
      }).catch(function(){
        wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане на статистиката.</div>';
      });
    }).catch(function(){
      wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане на задачите.</div>';
    });
  }).catch(function(){
    wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
  });
}

/* Смяна на филтъра по магазин — рендира наново от кеша, без нова заявка */
function todayFilterChange(sel){
  todayFilterStore = sel.value;
  /* при филтриране към конкретен магазин - разгъваме го автоматично, за да
     не се налага двоен клик (избери от dropdown + после пак кликни картата) */
  todayExpandedStore = sel.value==='all' ? null : sel.value;
  var wrap = document.getElementById('mod-today');
  if (!wrap || !todayCache) return;
  renderTodayDashboard(wrap, todayCache.items, todayCache.noDueItems, todayCache.comps, todayCache.stores);
}

/* Смяна на разгънатия магазин (accordion) - рендира наново от кеша */
function todayToggleStore(el){
  var storeName = el.dataset.store;
  todayExpandedStore = (todayExpandedStore===storeName) ? null : storeName;
  var wrap = document.getElementById('mod-today');
  if (!wrap || !todayCache) return;
  renderTodayDashboard(wrap, todayCache.items, todayCache.noDueItems, todayCache.comps, todayCache.stores);
}

function todayEmptyHtml(msg){
  return '<div style="padding:60px 20px;text-align:center;color:#94a3b8;">' +
    '<div style="font-size:34px;margin-bottom:10px;">📭</div>' +
    '<div style="font-size:14px;">' + esc(msg) + '</div></div>';
}

/* items: [{id, title, department, kind:'regular'|'recurring'}]
   comps: [{item_id, kind, store_name}] */
/* items: [{id, title, department, kind:'regular'|'recurring', target_stores}]
   comps: [{item_id, kind, store_name}]
   Само задачите, за които store е в обхват (target_stores празно/null = всички,
   или store е изрично включен), влизат в знаменателя на конкретния магазин. */
function todayStoreStats(store, items, comps){
  var scoped = items.filter(function(it){
    return !it.target_stores || !it.target_stores.length || it.target_stores.indexOf(store)>=0;
  });
  var total = scoped.length;
  var done = scoped.filter(function(it){
    return comps.some(function(c){ return c.item_id===it.id && c.kind===it.kind && c.store_name===store; });
  }).length;
  var pct = total ? Math.round(done/total*100) : 0;
  return { done:done, total:total, pct:pct };
}
function todayDotColor(p){ return p===100 ? '#16a34a' : p>=50 ? '#e0a425' : '#dc2626'; }
function todayPctColor(p){ return p===100 ? '#16a34a' : p>=50 ? '#b6841e' : '#dc2626'; }

function todayStatCard(num, label, color, extraHtml){
  return '<div style="background:#fff;border:1px solid #eef1f6;border-radius:10px;padding:16px;text-align:center;">' +
    '<div style="font-size:26px;font-weight:800;color:' + color + ';">' + num + '</div>' +
    '<div style="font-size:11.5px;color:#64748b;margin-top:4px;">' + label + '</div>' +
    (extraHtml || '') + '</div>';
}

/* Тенденция спрямо вчера — стрелка + delta в проценти */
function todayTrendHtml(currentPct, snapshot){
  if (!snapshot) return '';
  var diff = currentPct - snapshot.overall_pct;
  var arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  var color = diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#94a3b8';
  var sign = diff > 0 ? '+' : '';
  return '<div style="font-size:10px;color:' + color + ';margin-top:4px;font-weight:600;">' + arrow + ' ' + sign + diff + '% спрямо вчера</div>';
}

/* Записва тих snapshot на днешните числа (upsert по period_type+period_key) -
   захранва утрешната тенденция. Не блокира и не показва грешки на потребителя
   - ако не мине, просто няма да има тенденция утре, не е критично. */
function todaySaveSnapshot(overallPct, totalDone, totalAll){
  var todayKey = toLocalISO(new Date());
  sbGet('report_snapshots','period_type=eq.daily&period_key=eq.'+todayKey).then(function(rows){
    var existing = Array.isArray(rows) && rows.length ? rows[0] : null;
    var payload = { overall_pct: overallPct, total_done: totalDone, total_all: totalAll };
    if (existing) sbPatch('report_snapshots','id=eq.'+existing.id, payload);
    else {
      payload.period_type = 'daily'; payload.period_key = todayKey;
      sbPost('report_snapshots', payload);
    }
  }).catch(function(){});
}
/* Взима вчерашния snapshot, за да изчислим тенденцията днес. */
function todayFetchYesterdaySnapshot(cb){
  var y = new Date(); y.setDate(y.getDate()-1);
  var yKey = toLocalISO(y);
  sbGet('report_snapshots','period_type=eq.daily&period_key=eq.'+yKey).then(function(rows){
    cb(Array.isArray(rows) && rows.length ? rows[0] : null);
  }).catch(function(){ cb(null); });
}

function todayStoreFilterHtml(stores, selected){
  var h = '<select onchange="todayFilterChange(this)" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;background:#fff;color:#0f172a;cursor:pointer;">';
  h += '<option value="all"' + (selected==='all' ? ' selected' : '') + '>Всички обекти</option>';
  stores.forEach(function(s){
    h += '<option value="' + esc(s) + '"' + (selected===s ? ' selected' : '') + '>' + esc(s) + '</option>';
  });
  h += '</select>';
  return h;
}

/* Тестова лента за ръчно изпращане на дневен/седмичен репорт — само за
   admin/accounting (canEdit), докато не минем към pg_cron автоматика */
function todayReportTestBarHtml(){
  if (typeof canEdit !== 'function' || !canEdit()) return '';
  if (typeof sendDailyReportTest !== 'function') return ''; /* report.js не е зареден */
  return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#f8fafc;border:1px solid #eef1f6;border-radius:10px;padding:10px 14px;margin:14px 0;">' +
    '<span style="font-size:12px;color:#64748b;">✉️ Тест на автоматичния репорт:</span>' +
    '<input id="today-report-email" placeholder="имейл за тест" value="ten.tenev@temax.bg" style="flex:1;min-width:180px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:6px 9px;">' +
    '<button onclick="sendDailyReportTest(document.getElementById(\'today-report-email\').value)" style="border:none;background:#1E2761;color:#fff;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">📋 Дневен</button>' +
    '<button onclick="sendWeeklyReportTest(document.getElementById(\'today-report-email\').value)" style="border:none;background:#4c1d95;color:#fff;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">📊 Седмичен</button>' +
    (typeof sendWeeklyReportRouted==='function' ? '<button onclick="sendWeeklyReportRouted(document.getElementById(\'today-report-email\').value)" style="border:none;background:#b45309;color:#fff;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;" title="Изчислява маршрутизацията по групи, но всичко се изпраща на тестовия имейл">📬 Маршрутизация (тест)</button>' : '') +
    '</div>';
}

/* Рендира задачите без срок за конкретен обект — визуално отделени, не участват в % */
/* Показва коментар/снимки на вече изпълнена задача - за да не се налага
   отваряне на Бюлетин, за да се прегледа съдържанието на "вид задача с
   коментар/снимка". */
function todayCompletionExtras(compObj){
  var h = '<div style="margin:6px 0 0 32px;padding:8px 10px;background:#f8fafc;border-radius:7px;border:1px solid #f1f5f9;">';
  if (compObj.comment) h += '<div style="font-size:12px;color:#475569;">💬 ' + esc(compObj.comment) + '</div>';
  if (compObj.photos && compObj.photos.length) {
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:' + (compObj.comment ? '6px' : '0') + ';">';
    compObj.photos.forEach(function(p){
      h += '<a href="' + p.url + '" target="_blank"><img src="' + p.url + '" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}

/* ═══ СНИМКИ ЗА ПРЕГЛЕД — bulk изглед на всички качени снимки тази седмица,
   за да не се налага отваряне на всяка задача поотделно. Lazy-loaded - само
   при първо разгъване на секцията, не при всяко зареждане на "Днес". ═══ */
function todayLoadPhotoQueue(cb){
  sbGet('bulletins','status=eq.published&order=created_at.desc&limit=1').then(function(bulRes){
    var bul = (Array.isArray(bulRes) && bulRes.length) ? bulRes[0] : null;
    var bulTasksPromise = bul ? sbGet('bulletin_tasks','bulletin_id=eq.'+bul.id) : Promise.resolve([]);
    Promise.all([bulTasksPromise, sbGet('recurring_tasks','active=eq.true')]).then(function(r2){
      var regTasks = Array.isArray(r2[0]) ? r2[0] : [];
      var recTasks = Array.isArray(r2[1]) ? r2[1] : [];
      var titleMap = {};
      regTasks.forEach(function(t){ titleMap['regular:'+t.id] = t.title; });
      recTasks.forEach(function(t){ titleMap['recurring:'+t.id] = t.title; });
      var regIds = regTasks.map(function(t){ return t.id; });
      var recIds = recTasks.map(function(t){ return t.id; });
      Promise.all([
        regIds.length ? sbGet('task_completions','task_id=in.('+regIds.join(',')+')&photos=not.is.null') : Promise.resolve([]),
        recIds.length ? sbGet('task_completions','recurring_task_id=in.('+recIds.join(',')+')&photos=not.is.null') : Promise.resolve([])
      ]).then(function(r3){
        var regComps = Array.isArray(r3[0]) ? r3[0] : [];
        var recComps = Array.isArray(r3[1]) ? r3[1] : [];
        var entries = [];
        regComps.forEach(function(c){
          if (c.photos && c.photos.length) entries.push({ title: titleMap['regular:'+c.task_id]||'(неизвестна задача)', store:c.store_name, comment:c.comment, photos:c.photos, completedAt:c.completed_at });
        });
        recComps.forEach(function(c){
          if (c.photos && c.photos.length) entries.push({ title: titleMap['recurring:'+c.recurring_task_id]||'(неизвестна задача)', store:c.store_name, comment:c.comment, photos:c.photos, completedAt:c.completed_at });
        });
        entries.sort(function(a,b){ return new Date(b.completedAt) - new Date(a.completedAt); }); /* най-новите отгоре */
        cb(entries);
      }).catch(function(){ cb([]); });
    }).catch(function(){ cb([]); });
  }).catch(function(){ cb([]); });
}
function todayPhotoQueueHtml(entries){
  if (!entries.length) return '<div style="padding:20px;color:#94a3b8;font-size:12.5px;text-align:center;">Няма качени снимки тази седмица.</div>';
  var h = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:6px 18px 16px;">';
  entries.forEach(function(e){
    e.photos.forEach(function(p){
      h += '<a href="' + p.url + '" target="_blank" style="display:block;text-decoration:none;color:inherit;">';
      h += '<div style="border:1px solid #eef1f6;border-radius:8px;overflow:hidden;background:#fff;">';
      h += '<img src="' + p.url + '" style="width:100%;height:100px;object-fit:cover;display:block;">';
      h += '<div style="padding:6px 8px;">';
      h += '<div style="font-size:11px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(e.title) + '</div>';
      h += '<div style="font-size:10px;color:#94a3b8;">' + esc(e.store) + '</div>';
      h += '</div></div></a>';
    });
  });
  h += '</div>';
  return h;
}
/* Разгъва/свива секцията; при първо разгъване извиква зареждането веднъж
   (todayPhotosCache===null означава "още не е зареждано"). */
function todayTogglePhotoQueue(){
  todayPhotosExpanded = !todayPhotosExpanded;
  var wrap = document.getElementById('mod-today');
  if (todayPhotosExpanded && todayPhotosCache===null) {
    todayLoadPhotoQueue(function(entries){
      todayPhotosCache = entries;
      if (wrap && todayCache) renderTodayDashboard(wrap, todayCache.items, todayCache.noDueItems, todayCache.comps, todayCache.stores);
    });
  }
  if (wrap && todayCache) renderTodayDashboard(wrap, todayCache.items, todayCache.noDueItems, todayCache.comps, todayCache.stores);
}
function todayPhotoQueueSectionHtml(){
  var photoCount = todayPhotosCache ? todayPhotosCache.reduce(function(s,e){ return s + e.photos.length; }, 0) : null;
  var h = '<div style="background:#fff;border:1px solid #eef1f6;border-radius:12px;margin-top:12px;overflow:hidden;">';
  h += '<div onclick="todayTogglePhotoQueue()" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;cursor:pointer;">';
  h += '<div style="font-size:14px;font-weight:700;">📷 Снимки за преглед' + (photoCount!==null ? ' (' + photoCount + ')' : '') + '</div>';
  h += '<span style="font-size:12px;color:#94a3b8;transform:rotate(' + (todayPhotosExpanded?'180deg':'0deg') + ');transition:transform .15s;">▾</span>';
  h += '</div>';
  if (todayPhotosExpanded) {
    h += todayPhotosCache===null
      ? '<div style="padding:24px;text-align:center;color:#94a3b8;">⏳ Зареждане...</div>'
      : todayPhotoQueueHtml(todayPhotosCache);
  }
  h += '</div>';
  return h;
}

function todayNoDueRowsHtml(noDueItems, comps, storeName){
  if (!noDueItems.length) return '';
  var h = '<div style="border-top:1px solid #f1f5f9;padding:10px 18px 12px;background:#fafbfc;">';
  h += '<div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">📋 Текущи / без срок — не участват в %</div>';
  noDueItems.forEach(function(it){
    var isDone = comps.some(function(c){ return c.item_id===it.id && c.kind===it.kind && c.store_name===storeName; });
    var d = DEPTS[it.department] || DEPTS.trade;
    h += '<div style="display:flex;align-items:center;gap:12px;padding:6px 0;">';
    h += '<div style="width:18px;height:18px;border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;' + (isDone ? 'background:#dcfce7;color:#16a34a;' : 'background:#eef1f6;color:transparent;border:1.5px dashed #cbd5e1;') + '">' + (isDone ? '✓' : '') + '</div>';
    h += '<div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:500;color:' + (isDone ? '#94a3b8;text-decoration:line-through;' : '#475569;') + '">🔁 ' + esc(it.title) + '</div></div>';
    h += '<span style="font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;background:' + d.bg + ';color:' + d.hdr + ';white-space:nowrap;">' + d.icon + ' ' + d.label + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function renderTodayDashboard(wrap, items, noDueItems, comps, stores){
  noDueItems = noDueItems || [];
  var totalDone=0, totalAll=0, laggards=0;
  var storeStatsArr = stores.map(function(s){
    var st = todayStoreStats(s, items, comps);
    totalDone += st.done; totalAll += st.total;
    if (st.pct < 50) laggards++;
    return { name:s, st:st };
  });
  storeStatsArr.sort(function(a,b){ return a.st.pct - b.st.pct; }); /* изоставащите най-отгоре */
  var overallPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;

  /* Тих snapshot + fetch на тенденцията - само веднъж на зареждане, не при
     всеки re-render (filter/expand toggle). */
  if (!todayTrendFetched) {
    todayTrendFetched = true;
    todaySaveSnapshot(overallPct, totalDone, totalAll);
    todayFetchYesterdaySnapshot(function(snap){
      todayYesterdaySnapshot = snap;
      renderTodayDashboard(wrap, items, noDueItems, comps, stores);
    });
  }

  var visibleRows = todayFilterStore==='all' ? storeStatsArr : storeStatsArr.filter(function(r){ return r.name===todayFilterStore; });

  var h = '<div style="padding:20px;max-width:980px;margin:0 auto;">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">';
  h += '<div><div class="pg-title">📊 Днес</div>';
  h += '<div class="pg-sub">Изпълнение по обекти за днешните задачи — Бюлетин + постоянни задачи · само за преглед</div></div>';
  h += todayStoreFilterHtml(stores, todayFilterStore);
  h += '</div>';

  h += todayReportTestBarHtml();


  /* STAT CARDS — винаги за всички обекти, за контекст, независимо от филтъра */
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0 22px;">';
  h += todayStatCard(overallPct + '%', 'изпълнение за деня', overallPct===100?'#16a34a':overallPct>=50?'#0f172a':'#dc2626', todayTrendHtml(overallPct, todayYesterdaySnapshot));
  h += todayStatCard(totalDone + '/' + totalAll, 'изпълнени задачи', '#0f172a');
  h += todayStatCard(String(laggards), 'обекта без напредък', laggards>0?'#dc2626':'#16a34a');
  h += todayStatCard(String(stores.length), 'обекта общо', '#0f172a');
  h += '</div>';

  if (!visibleRows.length) {
    h += todayEmptyHtml('Няма данни за избрания обект.');
  }

  /* STORE CARDS — accordion: хедърът е кликаем, детайлите се показват само
     за разгънатия магазин (todayExpandedStore). Deep-link от имейл (?store=)
     предварително задава кой да е разгънат при първо зареждане. */
  visibleRows.forEach(function(row){
    var dc = todayDotColor(row.st.pct), pc = todayPctColor(row.st.pct);
    var isExpanded = todayExpandedStore===row.name;
    h += '<div style="background:#fff;border:1px solid #eef1f6;border-radius:12px;margin-bottom:10px;overflow:hidden;">';
    h += '<div onclick="todayToggleStore(this)" data-store="' + esc(row.name) + '" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;flex-wrap:wrap;gap:10px;cursor:pointer;">';
    h += '<div style="display:flex;align-items:center;gap:12px;">';
    h += '<span style="width:11px;height:11px;border-radius:50%;background:' + dc + ';flex-shrink:0;"></span>';
    h += '<div><div style="font-size:14.5px;font-weight:700;">' + esc(row.name) + '</div><div style="font-size:11px;color:#94a3b8;">' + row.st.done + ' от ' + row.st.total + ' задачи</div></div>';
    h += '</div>';
    h += '<div style="display:flex;align-items:center;gap:14px;">';
    h += '<div style="width:110px;height:7px;background:#e5e9f1;border-radius:4px;overflow:hidden;"><div style="height:7px;border-radius:4px;width:' + row.st.pct + '%;background:' + dc + ';"></div></div>';
    h += '<div style="font-size:15px;font-weight:800;min-width:38px;text-align:right;color:' + pc + ';">' + row.st.pct + '%</div>';
    h += '<span style="font-size:11px;color:#94a3b8;transform:rotate(' + (isExpanded?'180deg':'0deg') + ');transition:transform .15s;">▾</span>';
    h += '</div></div>';

    if (isExpanded) {
      h += '<div style="border-top:1px solid #f1f5f9;padding:6px 18px 14px;">';
      var scopedItems = items.filter(function(it){
        return !it.target_stores || !it.target_stores.length || it.target_stores.indexOf(row.name)>=0;
      });
      scopedItems.forEach(function(it){
        var compObj = comps.find(function(c){ return c.item_id===it.id && c.kind===it.kind && c.store_name===row.name; });
        var isDone = !!compObj;
        var d = DEPTS[it.department] || DEPTS.trade;
        var srcIcon = it.kind==='recurring' ? '🔁 ' : '';
        h += '<div style="padding:8px 0;border-bottom:1px solid #f8fafc;">';
        h += '<div style="display:flex;align-items:center;gap:12px;">';
        h += '<div style="width:20px;height:20px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;' + (isDone ? 'background:#dcfce7;color:#16a34a;' : 'background:#f1f5f9;color:transparent;border:1.5px dashed #cbd5e1;') + '">' + (isDone ? '✓' : '') + '</div>';
        h += '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;' + (isDone ? 'color:#94a3b8;text-decoration:line-through;' : '') + '">' + srcIcon + esc(it.title) + '</div></div>';
        h += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:' + d.bg + ';color:' + d.hdr + ';white-space:nowrap;">' + d.icon + ' ' + d.label + '</span>';
        h += '</div>';
        if (compObj && (compObj.comment || (compObj.photos && compObj.photos.length))) h += todayCompletionExtras(compObj);
        h += '</div>';
      });
      h += '</div>';
      h += todayNoDueRowsHtml(noDueItems, comps, row.name);
    }
    h += '</div>';
  });

  /* TOP / BOTTOM — само в общия изглед, без смисъл при филтър по 1 обект */
  if (todayFilterStore==='all') {
    var byPct = storeStatsArr.slice().sort(function(a,b){ return b.st.pct - a.st.pct; });
    var top3 = byPct.slice(0,3), bottom3 = byPct.slice(-3).reverse();
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px;">';
    h += '<div style="background:#f0fdf4;border-radius:10px;padding:14px 16px;">';
    h += '<div style="font-size:11px;font-weight:800;color:#166534;margin-bottom:8px;">🏆 ТОП 3</div>';
    top3.forEach(function(s,i){ h += '<div style="font-size:12.5px;color:#1f2937;margin-bottom:4px;">' + (i+1) + '. ' + esc(s.name) + ' — ' + s.st.pct + '%</div>'; });
    h += '</div>';
    h += '<div style="background:#fef2f2;border-radius:10px;padding:14px 16px;">';
    h += '<div style="font-size:11px;font-weight:800;color:#b91c1c;margin-bottom:8px;">⚠️ ИЗИСКВАТ ВНИМАНИЕ</div>';
    bottom3.forEach(function(s,i){ h += '<div style="font-size:12.5px;color:#1f2937;margin-bottom:4px;">' + (i+1) + '. ' + esc(s.name) + ' — ' + s.st.pct + '%</div>'; });
    h += '</div></div>';
  }

  h += todayPhotoQueueSectionHtml();

  h += '</div>';
  wrap.innerHTML = h;
}
