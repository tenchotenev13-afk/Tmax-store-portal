/* checklist.js — таб „Чек лист"
   Седмичният контрол на контролинга: ред на обект, колона на показател.
   Огледало на лист „общо" от бланката, която дотук се водеше в Excel.

   ЧЕТЕ И РЕДАКТИРА control_value / control_num / comment. НЯМА попълване на
   portal_value, няма имейл и няма износ — това са отделни задачи.

   ДВЕТЕ СТОЙНОСТИ НА КЛЕТКАТА
   portal_value е това, което казва порталът (пълни се автоматично, но
   ЗАСЕГА никой не го пише — колоната стои празна). control_value е това,
   което отмята контролингът. Показва се control_value, ако е попълнена;
   иначе portal_value, но по-бледо и в курсив. Разликата във вида е
   съществена, не козметика: бледото е ПРЕДПОЛОЖЕНИЕ на портала, не
   потвърдена отметка, и не бива да се чете като свършена работа.

   РЕДАКЦИЯТА НЕ ПИПА portal_value. Тялото на upsert-а нарочно НЕ съдържа
   тази колона: PostgREST при resolution=merge-duplicates обновява само
   подадените полета, тоест липсата ѝ в тялото е самата защита. Добави ли я
   някой „за пълнота", отметката на контролинга ще започне да презаписва
   това, което порталът твърди — и двете стойности стават една.

   ЗАЩО СЛУШАТЕЛИ, А НЕ inline onclick
   Клетките се закачат с addEventListener в checklistWireCells(), не с
   onclick= в низа. Две причини, и втората е по-важната:
     · имената на обектите влизат само в data-si/data-mi (индекси), тоест
       апостроф в име на обект няма как да счупи handler — класическият бъг
       на string-concat HTML в този проект;
     · inline onclick НЕ се изпълнява при element.click() под
       jsdom с runScripts:'outside-only' (проверено), тоест истинският
       клик изобщо не може да се тества. harness.realClick() заобикаля това
       с eval на атрибута, но тогава се тества атрибутът, не кликът.
   Стрелките за седмица си остават с inline onclick — те не са пипани.

   ПРАЗНА КЛЕТКА
   Няма ли ред в weekly_checklist за (седмица, обект, показател), клетката е
   празна. Не се измисля 'не', не се измисля тире. Два отделни пазача:
   ранното `if (!row) return ''` за липсващ ред, и `if (text !== '')` за ред,
   който съществува, но е с нулеви стойности (запис само заради коментар).
   Вторият е важният: esc() в shared.js връща '—' за празен низ, тоест без
   него мрежата се напълва с тирета, които изглеждат като данни. Затова и
   стойностите минават през escVal(), не през esc().

   ЗАЩО ТАБЛИЦАТА НЕ ИЗЧЕЗВА ПРИ ЛИПСА НА ДАННИ
   При седмица без нито един ред се рендира пълната мрежа — 18 обекта × 6
   показателя, всичките клетки празни. НЕ „няма данни". Контрол, който
   изчезва според данните, изглежда като счупен, а и точно празната мрежа
   е информацията: никой нищо не е отметнал. */

/* ── Състояние ───────────────────────────────────────────────────────────── */
var checklistYear = null;      /* ISO година на показаната седмица */
var checklistWeek = null;      /* номер на показаната седмица */
var checklistMetrics = [];     /* weekly_checklist_metrics, активните, по sort_order */
var checklistRows = [];        /* weekly_checklist за показаната седмица */
var checklistStores = [];      /* 18-те отчетни обекта */

/* Стойностите се пазят в базата на латиница, за да не зависи схемата от
   изписването. Превеждат се само тук, при показване. */
var CHECKLIST_VALUE_LABELS = { da: 'да', ne: 'не', nyamat: 'нямат' };

/* ═══════════════════════════════════════════════════════════════════════════
   ДОСТЪП
   ═══════════════════════════════════════════════════════════════════════════ */

/* notify_groups идва от Postgres като масив, но PostgREST го подава и като
   низ '{co,controlling}' в някои пътища — затова и двете форми.

   ⚠️ admin.js има свой notifyGroupsOf() за същата колона. Двете НЕ са
   слети нарочно: admin.js е за списъка с потребители и се зарежда след
   този файл, а сливането им иска пипане на трети файл. Разминат ли се,
   единственото, което ще се различи, е кой вижда таба. */
function checklistGroupsOf(u) {
  var g = u && u.notify_groups;
  if (Array.isArray(g)) return g;
  if (typeof g === 'string' && g.length > 2) {
    return g.replace(/^{|}$/g, '').split(',')
      .map(function (s) { return s.trim().replace(/^"|"$/g, ''); })
      .filter(Boolean);
  }
  return [];
}

/* Роля admin ИЛИ notify_groups съдържа 'controlling'.

   ⚠️ ВТОРАТА ПОЛОВИНА ДНЕС Е СПЯЩА. Едж функцията auth-login връща
   currentUser без notify_groups (select-ът ѝ е
   id,email,password,password_hash,store_name,role,display_name,
   assigned_stores,active), тоест полето стига дотук като undefined и
   проверката пада на false. Двамата с 'controlling' в базата към
   01.09.2026 са Цветелина Тенева и Миглена Павлова — и двете с роля
   admin, затова днес разлика не се вижда. Даде ли се 'controlling' на
   не-админ, той няма да види таба, докато notify_groups не влезе в
   select-а на auth-login (и функцията не се преразпредели ръчно).
   Заковано е в tests/checklist-view.test.js. */
function canSeeChecklist() {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  return checklistGroupsOf(currentUser).indexOf('controlling') >= 0;
}

/* Редакцията е за същите хора, които виждат таба. Отделна функция, а не
   canSeeChecklist() на самото място, за да има ЕДНО място за промяна, ако
   утре табът се отвори за роля само за четене — тогава се пипа само тук и
   мрежата автоматично става read-only (клетките не се закачат и handler-ът
   пази втори път). */
function canEditChecklist() {
  return canSeeChecklist();
}

/* ═══════════════════════════════════════════════════════════════════════════
   СЕДМИЦА
   ═══════════════════════════════════════════════════════════════════════════ */

/* ISO годината не е календарната: 1 януари може да падне в седмица 52/53 на
   предходната година. Четвъртъкът на седмицата винаги е в нейната ISO
   година — същото изместване, което ползва и weekNum() в bulletin.js. */
function checklistIsoYear(d) {
  var dt = new Date(d); dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  return dt.getFullYear();
}

/* По подразбиране се показва ПРИКЛЮЧИЛАТА седмица, не текущата: контролингът
   отмята постфактум, а текущата седмица още не е приключила и мрежата ѝ би
   била празна по съвсем законна причина — което изглежда точно като
   „никой нищо не е отметнал". */
function checklistDefaultWeek() {
  var d = new Date(); d.setDate(d.getDate() - 7);
  return { year: checklistIsoYear(d), week: weekNum(d) };
}

/* Навигацията минава през реална дата (понеделника на показаната седмица
   ± 7 дни), а не през week±1. Така прескачането на година е за сметка на
   календара: седмица 1 назад дава 52 или 53 според годината, без тук да се
   пише кое от двете. */
function checklistShiftWeek(delta) {
  var mon = weekDays(checklistWeek, checklistYear)[0];
  mon.setDate(mon.getDate() + delta * 7);
  checklistYear = checklistIsoYear(mon);
  checklistWeek = weekNum(mon);
  loadChecklist();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ЗАРЕЖДАНЕ
   ═══════════════════════════════════════════════════════════════════════════ */
function loadChecklist() {
  var wrap = document.getElementById('mod-checklist');
  if (!wrap) return;

  if (!canSeeChecklist()) {
    wrap.innerHTML = '<div class="page"><div style="text-align:center;padding:40px;color:#94a3b8;">' +
      'Нямаш достъп до този модул.</div></div>';
    return;
  }

  if (checklistWeek === null) {
    var def = checklistDefaultWeek();
    checklistYear = def.year;
    checklistWeek = def.week;
  }

  wrap.innerHTML = '<div class="page"><div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div></div>';

  Promise.all([
    sbGet('weekly_checklist_metrics', 'active=eq.true&order=sort_order'),
    sbGet('weekly_checklist', 'year=eq.' + checklistYear + '&week_number=eq.' + checklistWeek),
    /* Обектите идват от users през общия филтър isReportableStore() — 18.
       НЕ таблицата stores: тя брои и ЦО, двата склада и обекти без нито
       един акаунт (23 реда), тоест мрежата би имала пет реда, които няма
       кой да отметне. Същият източник като отчетите, „Днес" и Палети. */
    loadReportableStores()
  ]).then(function (res) {
    checklistMetrics = Array.isArray(res[0]) ? res[0] : [];
    checklistRows = Array.isArray(res[1]) ? res[1] : [];
    checklistStores = Array.isArray(res[2]) ? res[2] : [];
    /* Рендерът е СЛЕД опита за попълване, не преди него — иначе мрежата
       мигва веднъж празна и втори път пълна. checklistFillPortalValues()
       никога не отхвърля: при провал сама вдига toast и не пипа редовете,
       тоест долният ред рисува това, което РЕАЛНО е записано. */
    return checklistFillPortalValues();
  }).then(function () {
    renderChecklist();
  }).catch(function () {
    checklistMetrics = []; checklistRows = []; checklistStores = [];
    renderChecklist();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PORTAL_VALUE — какво казва порталът
   ═══════════════════════════════════════════════════════════════════════════ */

/* КОИ показатели се пълнят автоматично и В КАКЪВ ВИД.
   Ключът е metric.key, а НЕ uuid: uuid-тата се четат от source в
   weekly_checklist_metrics и никъде тук не са заковани.

   Защо режимът стои в кода, а дните — не:
     · ДНИТЕ идват от recurring_tasks.due_weekdays на самата задача. Смени
       ли се срокът в Бюлетина, чек листът го следва — това е желаното.
     · РЕЖИМЪТ (да/не срещу брой) е формат на КОЛОНА от бланката на
       контролинга, не свойство на задачата. Изведеше ли се например от
       due_window, едно отмятане на превключвател в Бюлетина щеше тихо да
       смени „4/5" на „да" в чужд документ.

   Тук са ДВА ключа, а не три, макар три показателя да имат recurring:
   източник — „Стока за връщане- ТАБЛИЦИ" (0a20f6e8…) е с due_weekdays NULL
   и без договорено правило. Останалите четири остават празни нарочно. */
var CHECKLIST_PORTAL_MODE = {
  revizia_953:    'any',   /* има ли поне едно отмятане в прозореца → da/ne */
  spravka_minusi: 'count'  /* колко РАЗЛИЧНИ дни са отметнати → „4/5" */
};

/* 'recurring:<uuid>' → '<uuid>'. Всичко друго ('module:kasa', 'manual',
   празно) → null, тоест показателят не се пълни. */
function checklistRecurringId(metric) {
  var src = metric && metric.source;
  if (typeof src !== 'string' || src.indexOf('recurring:') !== 0) return null;
  var id = src.slice(10).trim();
  return id || null;
}

function checklistAutoMetrics() {
  return checklistMetrics.filter(function (m) {
    return !!CHECKLIST_PORTAL_MODE[m.key] && !!checklistRecurringId(m);
  });
}

/* Стойността за ЕДИН обект.
   hits е множеството РАЗЛИЧНИ дати с отмятане — оттам „два записа в един ден
   се броят за един". Denom е броят дни в срока на задачата, не заковано 5.

   ЧАСЪТ НЕ СЕ ПРОВЕРЯВА И НЕ СЕ ПРАВИМ, ЧЕ СЕ ПРОВЕРЯВА. Задачата има час
   (16:00 и 20:00), но task_completions пази completion_date — ДАТА, без
   час. Отмятане в 23:50 е неразличимо от отмятане в 9:00. Ако някой ден
   потрябва „в срок до часа", първо трябва да се пази часът. */
function checklistPortalValueFor(mode, hits, denom) {
  var n = hits ? Object.keys(hits).length : 0;
  if (mode === 'count') return n + '/' + denom;
  return n > 0 ? 'da' : 'ne';
}

/* Разбива отмятанията по обект и дата за ЕДИН показател.
   Връща null, когато правилото не е известно (липсва задача или тя няма
   due_weekdays) — тогава показателят не се пълни, вместо да се гадае. */
function checklistPortalPlan(metric, task, comps, weekISO) {
  var mode = CHECKLIST_PORTAL_MODE[metric.key];
  var days = (task && Array.isArray(task.due_weekdays)) ? task.due_weekdays : null;
  if (!mode || !days || !days.length) return null;

  /* Само дните от срока на задачата, преведени в дати от ПОКАЗАНАТА
     седмица. Отмятане в четвъртък по задача „Пон–Сря" не влиза. */
  var allowed = {};
  days.forEach(function (i) { if (weekISO[i]) allowed[weekISO[i]] = 1; });

  var hits = {};
  comps.forEach(function (c) {
    /* status !== 'done' не се брои: 'postponed' е отложена, не свършена.
       Липсваща completion_date също отпада — 19 такива записа стоят в
       базата отпреди полето да се пълни и иначе биха се броили за всяка
       седмица завинаги (същият фантом, който report.js вече изключва). */
    if (!c || c.status !== 'done' || !c.completion_date) return;
    if (!allowed[c.completion_date] || !c.store_name) return;
    if (!hits[c.store_name]) hits[c.store_name] = {};
    hits[c.store_name][c.completion_date] = 1;
  });
  return { mode: mode, denom: days.length, hits: hits };
}

/* Записва САМО portal_value. control_value, control_num и comment не влизат
   в тялото — при resolution=merge-duplicates PostgREST обновява единствено
   подадените колони, тоест отсъствието им е защитата на ръчната работа.
   По същата причина тук НЯМА updated_by/updated_at: те описват кой и кога е
   отметнал, а това не е отмятане на човек. */
function checklistWritePortalValues(changes) {
  var body = changes.map(function (ch) {
    return {
      year: checklistYear,
      week_number: checklistWeek,
      store_name: ch.store,
      metric_key: ch.metric_key,
      portal_value: ch.value
    };
  });
  var url = API + '/weekly_checklist?on_conflict=year,week_number,store_name,metric_key';
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body)
  }).then(function (r) {
    if (r.ok) return { ok: true };
    return r.json().catch(function () { return null; }).then(function (d) {
      return { ok: false, error: (d && (d.message || d.hint)) || ('HTTP ' + r.status) };
    });
  }).catch(function (e) {
    return { ok: false, error: (e && e.message) || 'мрежов срив' };
  });
}

/* 'module:<id>' → '<id>'. Другите източници → null. */
function checklistModuleId(metric) {
  var src = metric && metric.source;
  if (typeof src !== 'string' || src.indexOf('module:') !== 0) return null;
  var id = src.slice(7).trim();
  return id || null;
}

/* МОДУЛНИТЕ ИЗТОЧНИЦИ.
   Ключът е идентификаторът от source ('module:<id>'), не metric.key: така
   преименуван показател не изключва мълчаливо пълненето, а нов показател от
   вече познат модул работи без нито ред нов код.

   Всеки запис казва само три неща — коя таблица, кои колони и как се смята
   стойността за ЕДИН обект. Общият обход е един за всички (виж
   checklistModuleChanges) и точно затова тук няма отделен клон за transit и
   отделен за returns.

   'module:kasa' СЪЗНАТЕЛНО го няма: показателят „Сторна по грешни приеми"
   още няма договорено правило и остава празен, вместо да се гадае. Липсващ
   запис тук значи „не се пълни", не грешка. */
var CHECKLIST_MODULE_FILL = {
  transit: {
    table: 'goods_transit',
    query: 'select=store_name,direction,status',
    value: function (rows) { return checklistTransitValue(rows); }
  },
  returns: {
    table: 'stock_returns',
    query: 'select=store_name,status,confirmed_date',
    value: function (rows) { return checklistReturnsValue(rows); }
  }
};

/* Промените от постоянните задачи. Връща Promise с масив
   {store, metric_key, value} — само за клетките, чиято стойност се МЕНИ. */
function checklistRecurringChanges(idx) {
  var autos = checklistAutoMetrics();
  if (!autos.length) return Promise.resolve([]);

  var ids = autos.map(checklistRecurringId);
  var weekISO = weekDays(checklistWeek, checklistYear).map(toLocalISO);

  return Promise.all([
    sbGet('recurring_tasks', 'id=in.(' + ids.join(',') + ')&select=id,due_weekdays'),
    /* Прозорецът е самата показана седмица. Заявката вече изключва
       записите без дата — PostgREST не връща NULL при gte/lte. */
    sbGet('task_completions',
      'recurring_task_id=in.(' + ids.join(',') + ')' +
      '&completion_date=gte.' + weekISO[0] + '&completion_date=lte.' + weekISO[6] +
      '&select=recurring_task_id,store_name,status,completion_date')
  ]).then(function (r) {
    var tasks = Array.isArray(r[0]) ? r[0] : [];
    var comps = Array.isArray(r[1]) ? r[1] : [];
    var taskById = {};
    tasks.forEach(function (t) { taskById[t.id] = t; });

    var changes = [];
    autos.forEach(function (m) {
      var id = checklistRecurringId(m);
      var mine = comps.filter(function (c) { return c.recurring_task_id === id; });
      var plan = checklistPortalPlan(m, taskById[id], mine, weekISO);
      if (!plan) return;
      checklistStores.forEach(function (store) {
        var val = checklistPortalValueFor(plan.mode, plan.hits[store], plan.denom);
        var row = idx[store + ' ' + m.key];
        /* Нищо ново → нищо не се пише. Инак всяко отваряне на седмица би
           било 36 записа в базата без нито една променена стойност. */
        if (row && row.portal_value === val) return;
        changes.push({ store: store, metric_key: m.key, value: val });
      });
    });
    return changes;
  });
}

/* Дялът актуализирани ВХОДЯЩИ записи за един обект: „52/190".
   Връща null, когато обектът няма нито един входящ запис — тогава клетката
   остава празна. „0/0" би изглеждало като провал, а всъщност няма какво да
   се актуализира.

   ЗАЩО САМО incoming: при входящ запис обектът е ПОЛУЧАТЕЛЯТ и той
   отговаря за актуализацията. При outgoing и transfer отговаря другата
   страна, тоест влезли в знаменателя биха наказвали обекта за чужда
   работа. Към 02.09.2026 това са 53 и 153 записа срещу 2063 входящи.

   NULL статус се брои за НЕактуализиран — същото, което прави и
   `status <> 'pending'` в SQL, където NULL не минава сравнението. */
function checklistTransitValue(rows) {
  var incoming = rows.filter(function (t) { return t && t.direction === 'incoming'; });
  if (!incoming.length) return null;
  var done = incoming.filter(function (t) { return !!t.status && t.status !== 'pending'; });
  return done.length + '/' + incoming.length;
}

/* Дялът обработени записи за връщане: „29/40".
   ОБРАБОТЕН е записът, който обектът е поел по един от двата възможни
   начина: взет от куриер (status='taken') ИЛИ проверен и още невзет
   (confirmed_date е попълнена, статусът остава 'pending').

   Второто условие НЕ Е излишно. Към 02.09.2026 65 pending записа носят
   confirmed_date; без него Раднево излиза 22/40 вместо 29/40, тоест
   обектът е наказан за работа, която е свършил.

   Обект без нито един запис → null, клетката остава празна. „0/0" се чете
   като провал, а всъщност няма какво да се обработва — записите се
   появяват при разлика, не по график. */
function checklistReturnsValue(rows) {
  if (!rows.length) return null;
  var done = rows.filter(function (r) {
    return r && (r.status === 'taken' || !!r.confirmed_date);
  });
  return done.length + '/' + rows.length;
}

/* ЕДИН обход за всички модулни показатели.
   За всеки показател с познат module: източник се тегли неговата таблица и
   се смята стойност за всеки обект. Ако два показателя сочат към един
   модул, таблицата ще се дръпне два пъти — днес такъв случай няма и
   кеширане би било сложност без повод. */
function checklistModuleChanges(idx) {
  var jobs = [];

  checklistMetrics.forEach(function (m) {
    var id = checklistModuleId(m);
    var spec = id ? CHECKLIST_MODULE_FILL[id] : null;
    if (!spec) return;

    jobs.push(sbGet(spec.table, spec.query).then(function (r) {
      var rows = Array.isArray(r) ? r : [];
      var byStore = {};
      rows.forEach(function (x) {
        if (!x || !x.store_name) return;
        if (!byStore[x.store_name]) byStore[x.store_name] = [];
        byStore[x.store_name].push(x);
      });

      var changes = [];
      checklistStores.forEach(function (store) {
        var val = spec.value(byStore[store] || []);
        /* null значи „няма какво да се каже" — не се записва нищо, за да не
           се появи стойност там, където клетката трябва да е празна. */
        if (val === null) return;
        var row = idx[store + ' ' + m.key];
        if (row && row.portal_value === val) return;
        changes.push({ store: store, metric_key: m.key, value: val });
      });
      return changes;
    }));
  });

  if (!jobs.length) return Promise.resolve([]);
  return Promise.all(jobs).then(function (parts) {
    return parts.reduce(function (a, b) { return a.concat(b); }, []);
  });
}

/* Пълни portal_value от всички автоматични източници.
   ЕДИН запис и ЕДИН път за грешка за двата източника: две отделни заявки
   значат две отделни половини успех, тоест таблица, попълнена наполовина,
   без никой да е казал коя половина.
   НИКОГА не отхвърля — извикващият рендира след него във всички случаи. */
function checklistFillPortalValues() {
  if (!checklistStores.length) return Promise.resolve();
  var idx = checklistIndex();

  return Promise.all([
    checklistRecurringChanges(idx),
    checklistModuleChanges(idx)
  ]).then(function (parts) {
    var changes = parts[0].concat(parts[1]);
    if (!changes.length) return;

    return checklistWritePortalValues(changes).then(function (res) {
      if (!res.ok) {
        /* Нищо не се прилага местно: мрежата показва само това, което
           РЕАЛНО е в базата. Полупопълнена таблица, която изглежда
           записана, е по-лоша от празна. */
        toast('Грешка при попълване от портала: ' + res.error, '#dc2626');
        return;
      }
      changes.forEach(function (ch) {
        var row = idx[ch.store + ' ' + ch.metric_key];
        if (row) { row.portal_value = ch.value; return; }
        checklistRows.push({
          year: checklistYear, week_number: checklistWeek,
          store_name: ch.store, metric_key: ch.metric_key,
          portal_value: ch.value, control_value: null, control_num: null, comment: null
        });
      });
    });
  }).catch(function () {
    toast('Грешка при попълване от портала', '#dc2626');
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   РЕНДЕР
   ═══════════════════════════════════════════════════════════════════════════ */

/* Ключ обект+показател. Индексът се строи веднъж на рендер — иначе 18×6
   клетки значат 108 обхождания на масива. */
function checklistIndex() {
  var idx = {};
  checklistRows.forEach(function (r) {
    idx[r.store_name + ' ' + r.metric_key] = r;
  });
  return idx;
}

function checklistValueLabel(val) {
  if (val === null || val === undefined || val === '') return '';
  /* Непозната стойност се показва както е в базата. Не се превежда наум и
     не се скрива — новата стойност трябва да си личи, а не да изчезне. */
  return CHECKLIST_VALUE_LABELS[val] || String(val);
}

/* ── „ОЩЕ РАНО" ──────────────────────────────────────────────────────────
   Показател със срок в рамките на месеца (weekly_checklist_metrics.
   deadline_day). До този ден ВКЛЮЧИТЕЛНО стойността е междинна, не оценка.

   Прагът НЕ е закован в рендирането: тук няма нито дума „стока на път",
   нито числото 10. Следващият показател със свой срок иска ред в базата,
   не промяна по код. deadline_day = NULL значи „няма такъв срок", тоест
   показателят никога не е „още рано" — така е за петте останали.

   Сравнява се с ДНЕШНИЯ ден от месеца, не с показаната седмица: goods_transit
   е снимка на текущия месец и не пази история, тоест числото описва днешното
   състояние, независимо коя седмица е отворена. */
function checklistDeadlineDay(metric) {
  var d = metric && metric.deadline_day;
  if (d === null || d === undefined || d === '') return null;
  d = parseInt(d, 10);
  return isNaN(d) ? null : d;
}

function checklistIsEarly(metric, now) {
  var d = checklistDeadlineDay(metric);
  if (!d) return false;
  return (now || new Date()).getDate() <= d;
}

/* „10-то", „1-во", „2-ро", „7-мо". Само за текста в подсказката. */
var CHECKLIST_ORD_SUFFIX = { 1: '-во', 2: '-ро', 7: '-мо', 8: '-мо' };
function checklistDeadlineTitle(metric) {
  var d = checklistDeadlineDay(metric);
  if (!d) return '';
  return 'Срокът изтича на ' + d + (CHECKLIST_ORD_SUFFIX[d] || '-то') + ' число';
}

/* Балончето за коментар. ВИНАГИ се рендира — плътно при коментар, бледо без.
   Не се крие при празен коментар: контрол, който изчезва според данните,
   изглежда като счупен, а и няма как да добавиш първия коментар на клетка,
   чието балонче се появява само след като вече има коментар. */
function checklistCommentIconHtml(row) {
  var has = !!(row && row.comment);
  return '<span class="cl-cmt"' +
    ' title="' + (has ? escAttr(row.comment) : 'Добави коментар') + '"' +
    ' style="position:absolute;top:1px;right:2px;font-size:9px;line-height:1;' +
    'cursor:pointer;opacity:' + (has ? '1' : '.25') + ';">💬</span>';
}

/* Съдържанието на една клетка. Връща само вътрешността на <td>.
   Празният ред НЕ връща рано: балончето се рендира и когато ред няма. */
/* early/earlyTitle идват отгоре, от renderChecklist: смятат се ВЕДНЪЖ на
   показател, не веднъж на клетка, и така рендирането не знае нищо за срокове
   — то само рисува подадения флаг. */
function checklistCellInner(metric, row, early, earlyTitle) {
  var text = '', faint = false;

  if (!row) return checklistCommentIconHtml(null);

  if (metric.value_type === 'number') {
    /* При числов показател водещото е control_num. control_value не се
       ползва за този тип и нарочно не се показва вместо числото — иначе
       „да" би минало за брой. */
    if (row.control_num !== null && row.control_num !== undefined && row.control_num !== '') {
      text = String(row.control_num);
    } else if (row.portal_value) {
      text = checklistValueLabel(row.portal_value); faint = true;
    }
  } else {
    if (row.control_value !== null && row.control_value !== undefined && row.control_value !== '') {
      text = checklistValueLabel(row.control_value);
    } else if (row.portal_value !== null && row.portal_value !== undefined && row.portal_value !== '') {
      text = checklistValueLabel(row.portal_value); faint = true;
    }
  }

  var out = '';
  if (text !== '') {
    /* class="cl-val" отделя СТОЙНОСТТА от балончето за коментар в същата
       клетка. Без него textContent на клетката е „да💬" и всяка проверка
       за точна стойност би мерила и иконката.

       „Още рано" важи САМО за стойност от портала (faint). Попълни ли
       контролингът клетката, тя се рендира нормално: правилото „отметнатото
       от контролинга бие портала" няма изключения — човекът е гледал и е
       решил, независимо че срокът още тече. Затова условието е early И
       faint, а не само early.

       Класът е отделен (cl-early), а не просто faint, за да се вижда ЗАЩО
       е бледо: „още не е оценка", а не „порталът предполага". */
    if (early && faint) {
      out += '<span class="cl-val cl-early" title="' + escAttr(earlyTitle) +
        '" style="color:#94a3b8;font-style:italic;border-bottom:1px dotted #cbd5e1;">' +
        escVal(text) + '</span>';
    } else {
      out += faint
        ? '<span class="cl-val" title="Стойност от портала — не е потвърдена от контролинга" style="color:#94a3b8;font-style:italic;">' + escVal(text) + '</span>'
        : '<span class="cl-val" style="font-weight:600;color:#0f172a;">' + escVal(text) + '</span>';
    }
  }
  out += checklistCommentIconHtml(row);
  return out;
}

function checklistHeaderHtml() {
  var days = weekDays(checklistWeek, checklistYear);
  var range = fmtD(days[0]) + '–' + fmtD(days[6]);
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
    '<h2 style="margin:0;font-size:18px;">🗓️ Чек лист</h2>' +
    '<div style="display:flex;align-items:center;gap:6px;">' +
      '<button class="btn-sm" onclick="checklistShiftWeek(-1)" title="Предходна седмица">←</button>' +
      '<span style="font-weight:700;font-size:14px;min-width:150px;text-align:center;">' +
        'Седмица ' + checklistWeek + ' · ' + checklistYear +
        '<span style="display:block;font-weight:400;font-size:11px;color:#64748b;">' + range + '</span>' +
      '</span>' +
      '<button class="btn-sm" onclick="checklistShiftWeek(1)" title="Следваща седмица">→</button>' +
    '</div>' +
  '</div>';
}

/* Легендата ДОСЛОВНО от бланката, в ЕДИН източник за таба и за писмото.
   Дублирана, двете формулировки рано или късно се разминават и контролингът
   чете едно на екрана и друго в пощата. Не се преформулира — разликата
   между „не" и „нямат" е целият смисъл на тези три реда. */
var CHECKLIST_LEGEND_LINES = [
  ['ДА', 'има изпратена преоценка.'],
  ['НЕ', 'от магазина не са писали, че няма преоценка.'],
  ['НЯМАТ', 'не са подавали, но магазинът е писал, че няма преоценка.']
];

function checklistLegendHtml() {
  return '<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#334155;line-height:1.7;">' +
    CHECKLIST_LEGEND_LINES.map(function (l) {
      return '<div><b>' + l[0] + '</b> — ' + l[1] + '</div>';
    }).join('') +
  '</div>';
}

function renderChecklist() {
  var wrap = document.getElementById('mod-checklist');
  if (!wrap) return;

  var idx = checklistIndex();
  var cellCss = 'border:1px solid #e2e8f0;padding:6px 8px;text-align:center;font-size:12px;';

  var h = '<div class="page">' + checklistHeaderHtml();

  h += '<div style="overflow-x:auto;">' +
    '<table id="checklist-table" style="border-collapse:collapse;width:100%;min-width:760px;">';

  /* Шапка на две нива: label отгоре, sublabel отдолу и по-дребно. Двата реда
     са в един <th> с <div>-ове, не два <tr> с rowspan — така колоната на
     обекта не иска rowspan и подравняването не зависи от височината. */
  h += '<thead><tr>' +
    '<th style="' + cellCss + 'background:#f1f5f9;text-align:left;position:sticky;left:0;z-index:1;min-width:150px;">Обект</th>';
  checklistMetrics.forEach(function (m) {
    h += '<th style="' + cellCss + 'background:#f1f5f9;vertical-align:bottom;">' +
      '<div style="font-weight:700;color:#0f172a;">' + escVal(m.label) + '</div>' +
      (m.sublabel ? '<div style="font-weight:400;font-size:10px;color:#64748b;margin-top:2px;">' + escVal(m.sublabel) + '</div>' : '') +
    '</th>';
  });
  h += '</tr></thead><tbody>';

  var editable = canEditChecklist();

  /* Срокът се смята ВЕДНЪЖ на показател — 18 обекта × 6 показателя иначе
     значат 108 еднакви сметки за днешната дата. Един и същи „сега" за целия
     рендер: инак таблица, рисувана в 23:59:59.9, може да смени състоянието
     си по средата. */
  var now = new Date();
  var earlyBy = {}, earlyTitleBy = {};
  checklistMetrics.forEach(function (m) {
    earlyBy[m.key] = checklistIsEarly(m, now);
    earlyTitleBy[m.key] = checklistDeadlineTitle(m);
  });

  checklistStores.forEach(function (store, si) {
    h += '<tr>' +
      '<td style="' + cellCss + 'text-align:left;font-weight:600;background:#fff;position:sticky;left:0;">' + escVal(store) + '</td>';
    checklistMetrics.forEach(function (m, mi) {
      var busy = !!checklistSaving[store + ' ' + m.key];
      /* Обектът и показателят влизат само като ИНДЕКСИ. Никакво име не се
         вплита в атрибут-handler, тоест апостроф в име на обект е безопасен. */
      h += '<td data-si="' + si + '" data-mi="' + mi + '"' +
        (busy ? ' data-busy="1"' : '') +
        ' style="' + cellCss + 'position:relative;' +
        (editable ? 'cursor:pointer;' : '') +
        (busy ? 'opacity:.45;' : '') + '">' +
        checklistCellInner(m, idx[store + ' ' + m.key], earlyBy[m.key], earlyTitleBy[m.key]) + '</td>';
    });
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  h += checklistLegendHtml();
  h += '</div>';

  wrap.innerHTML = h;
  checklistWireCells();
}

/* ═══════════════════════════════════════════════════════════════════════════
   РЕДАКЦИЯ
   ═══════════════════════════════════════════════════════════════════════════ */

/* Кръгът на стойностите. Празното е ЧАСТ от кръга, не изходна точка —
   затова null стои в масива и последният клик се връща на него. */
var CHECKLIST_CYCLES = {
  yes_no:      [null, 'da', 'ne'],
  yes_no_none: [null, 'da', 'ne', 'nyamat']
};

/* Клетки със запис в момента: ключ „обект метрика" -> true. */
var checklistSaving = {};

function checklistNextValue(valueType, cur) {
  var cyc = CHECKLIST_CYCLES[valueType] || CHECKLIST_CYCLES.yes_no;
  if (cur === undefined || cur === '') cur = null;
  var i = cyc.indexOf(cur);
  /* Стойност извън кръга (напр. останала от по-стар набор) се ИЗЧИСТВА при
     следващия клик, вместо да се тълкува наум като някоя от валидните. */
  if (i < 0) return null;
  return cyc[(i + 1) % cyc.length];
}

function checklistWireCells() {
  var tbl = document.getElementById('checklist-table');
  if (!tbl) return;
  var cells = tbl.querySelectorAll('td[data-si]');
  for (var i = 0; i < cells.length; i++) {
    var td = cells[i];
    /* Балончето се закача ВИНАГИ при право на редакция — и на клетки без
       ред в базата, там се създава нов запис само с коментара. */
    if (canEditChecklist()) {
      td.addEventListener('click', checklistCellClick);
      var ic = td.querySelector('.cl-cmt');
      if (ic) ic.addEventListener('click', checklistCommentIconClick);
    }
  }
}

/* Обект и показател по индексите от data-атрибутите. */
function checklistCellCtx(td) {
  var si = parseInt(td.getAttribute('data-si'), 10);
  var mi = parseInt(td.getAttribute('data-mi'), 10);
  var store = checklistStores[si];
  var metric = checklistMetrics[mi];
  if (!store || !metric) return null;
  return { store: store, metric: metric, key: store + ' ' + metric.key };
}

function checklistCellClick(ev) {
  /* Втора проверка, независима от закачането. Закачането решава при рендер,
     тази — при самия клик; между двете currentUser може да се е сменил. */
  if (!canEditChecklist()) return;
  var td = this;
  var ctx = checklistCellCtx(td);
  if (!ctx) return;
  if (checklistSaving[ctx.key]) return;         /* тече запис — клетката мълчи */
  if (td.querySelector('input')) return;        /* отворено поле за число */

  if (ctx.metric.value_type === 'number') {
    checklistOpenNumberInput(td, ctx);
    return;
  }
  var row = checklistIndex()[ctx.key];
  var next = checklistNextValue(ctx.metric.value_type, row ? row.control_value : null);
  checklistApply(ctx, { control_value: next });
}

/* Числовият показател не се върти в кръг — отваря малко поле.
   Записва се при Enter или при напускане на полето; Escape отказва. */
function checklistOpenNumberInput(td, ctx) {
  var row = checklistIndex()[ctx.key];
  var cur = (row && row.control_num !== null && row.control_num !== undefined) ? row.control_num : '';
  td.innerHTML = '<input type="number" step="1" value="' + escAttr(String(cur)) + '"' +
    ' style="width:56px;text-align:center;font-size:12px;padding:2px;border:1px solid #2563eb;border-radius:4px;">' +
    checklistCommentIconHtml(row);
  var inp = td.querySelector('input');
  if (!inp) return;
  var done = false;
  function commit() {
    if (done) return; done = true;
    var raw = (inp.value || '').trim();
    /* Празно поле значи „изчисти числото", не нула. Нулата е валиден отговор
       (нула сторнирани поръчки) и не бива да се получава от празно поле. */
    var num = raw === '' ? null : Number(raw);
    if (num !== null && isNaN(num)) { renderChecklist(); return; }
    var prev = (row && row.control_num !== null && row.control_num !== undefined) ? row.control_num : null;
    if (num === prev) { renderChecklist(); return; }   /* нищо не се е променило — без заявка */
    checklistApply(ctx, { control_num: num });
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { commit(); }
    else if (e.key === 'Escape') { done = true; renderChecklist(); }
  });
  try { inp.focus(); } catch (e) {}
}

function checklistCommentIconClick(ev) {
  /* Без това кликът се качва до клетката и завърта стойността „в движение",
     докато човекът само е искал да пише коментар. */
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (!canEditChecklist()) return;
  var td = this.parentNode;
  var ctx = checklistCellCtx(td);
  if (!ctx) return;
  if (checklistSaving[ctx.key]) return;
  openChecklistCommentModal(ctx);
}

/* ── Прозорче за коментар ────────────────────────────────────────────────── */
var checklistCommentCtx = null;

function openChecklistCommentModal(ctx) {
  checklistCommentCtx = ctx;
  var row = checklistIndex()[ctx.key];
  var old = document.getElementById('cl-cmt-ov');
  if (old) old.remove();

  var ov = document.createElement('div');
  ov.id = 'cl-cmt-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;' +
    'align-items:center;justify-content:center;z-index:9999;';
  ov.innerHTML = '<div style="background:#fff;border-radius:10px;padding:18px;width:min(420px,92vw);">' +
    '<div style="font-weight:700;margin-bottom:4px;">💬 Коментар</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">' +
      escVal(ctx.store) + ' · ' + escVal(ctx.metric.label) + '</div>' +
    '<textarea id="cl-cmt-text" rows="4" style="width:100%;box-sizing:border-box;font-size:13px;' +
      'padding:8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;"></textarea>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button id="cl-cmt-cancel" class="btn-sm">Откажи</button>' +
      '<button id="cl-cmt-save" class="btn-sm" style="background:#2563eb;color:#fff;">Запази</button>' +
    '</div></div>';
  document.body.appendChild(ov);

  /* Текстът се задава като .value, а не в HTML-а: така кавички и по-малко/
     по-голямо в коментара нямат как да излязат от <textarea>. */
  var ta = document.getElementById('cl-cmt-text');
  if (ta) ta.value = (row && row.comment) || '';

  var save = document.getElementById('cl-cmt-save');
  if (save) save.addEventListener('click', submitChecklistComment);
  var cancel = document.getElementById('cl-cmt-cancel');
  if (cancel) cancel.addEventListener('click', closeChecklistCommentModal);
}

function closeChecklistCommentModal() {
  var ov = document.getElementById('cl-cmt-ov');
  if (ov) ov.remove();
  checklistCommentCtx = null;
}

function submitChecklistComment() {
  var ctx = checklistCommentCtx;
  if (!ctx) return;
  var ta = document.getElementById('cl-cmt-text');
  var txt = ta ? (ta.value || '').trim() : '';
  closeChecklistCommentModal();
  /* Празен текст изчиства коментара (NULL), не записва празен низ — иначе
     „има ли коментар" става различно от „не е null" на две места. */
  checklistApply(ctx, { comment: txt === '' ? null : txt });
}

/* ═══════════════════════════════════════════════════════════════════════════
   ЗАПИС
   ═══════════════════════════════════════════════════════════════════════════ */

/* upsert по (year, week_number, store_name, metric_key).
   on_conflict сочи УНИКАЛНОТО ОГРАНИЧЕНИЕ, не първичния ключ — без него
   PostgREST търси конфликт по id и втори клик би връщал 409.
   Проверено срещу живия PostgREST на 02.09.2026: първи POST → 201, втори със
   същия ключ → 200, същият id, един ред в таблицата.

   portal_value НЕ влиза в тялото. merge-duplicates обновява само подадените
   колони, тоест отсъствието ѝ е защитата — виж бележката в началото. */
function checklistUpsert(ctx, fields) {
  var body = {
    year: checklistYear,
    week_number: checklistWeek,
    store_name: ctx.store,
    metric_key: ctx.metric.key,
    updated_by: (currentUser && (currentUser.display_name || currentUser.email)) || null,
    /* Таблицата няма тригер: default now() важи само при INSERT, а при
       UPDATE стойността остава старата. Проверено на живо — вторият upsert
       без това поле остави updated_at непроменен. Затова се подава явно. */
    updated_at: new Date().toISOString()
  };
  Object.keys(fields).forEach(function (k) { body[k] = fields[k]; });

  var url = API + '/weekly_checklist?on_conflict=year,week_number,store_name,metric_key';
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify([body])
  }).then(function (r) {
    return r.json().catch(function () { return null; }).then(function (d) {
      if (!r.ok) {
        var msg = (d && (d.message || d.hint)) || ('HTTP ' + r.status);
        try { console.error('checklistUpsert ' + url + ' → ' + r.status + ': ' + msg); } catch (e) {}
        return { ok: false, error: msg };
      }
      return { ok: true, row: (Array.isArray(d) ? d[0] : d) || null };
    });
  }).catch(function (e) {
    try { console.error('checklistUpsert ' + url + ' → мрежов срив'); } catch (x) {}
    return { ok: false, error: (e && e.message) || 'мрежов срив' };
  });
}

/* Оптимистична промяна + ВРЪЩАНЕ НАЗАД при провал.
   Поуката е от autoCreateReturnFromDiff(): провалила се заявка, чийто
   резултат остава на екрана, е по-лоша от липсваща функция — човекът вижда
   отметка, базата не я знае и никой не разбира, докато не се сверят двете.
   Затова при грешка редът се възстановява ТОЧНО както е бил (включително
   пълното изчезване на реда, ако е бил създаден от този клик) и излиза
   червен toast. */
function checklistApply(ctx, fields) {
  if (!canEditChecklist()) return;
  if (checklistSaving[ctx.key]) return;
  checklistSaving[ctx.key] = true;

  var existing = checklistIndex()[ctx.key] || null;
  /* Копие, не референция: долу мутираме същия обект, а „старото" трябва да
     оцелее непроменено, за да има какво да се върне. */
  var snapshot = existing ? JSON.parse(JSON.stringify(existing)) : null;

  var row = existing;
  if (!row) {
    row = {
      year: checklistYear, week_number: checklistWeek,
      store_name: ctx.store, metric_key: ctx.metric.key,
      portal_value: null, control_value: null, control_num: null, comment: null
    };
    checklistRows.push(row);
  }
  Object.keys(fields).forEach(function (k) { row[k] = fields[k]; });
  renderChecklist();

  checklistUpsert(ctx, fields).then(function (res) {
    delete checklistSaving[ctx.key];

    if (res.ok) {
      /* Върнатият ред носи id и реалния updated_at — СЛИВА се в местния, не
         го ЗАМЕСТВА. Замяната изглежда по-чиста, но при отговор без тяло
         (Prefer се пренебрегва, прокси реже отговора, стъб в тест) res.row е
         празен обект и замяната би изтрила store_name/metric_key на реда —
         клетката се изпразва след успешен запис. Сливането на празен обект е
         безобидно, а на пълен върши същата работа. */
      if (res.row && typeof res.row === 'object') {
        Object.keys(res.row).forEach(function (k) { row[k] = res.row[k]; });
      }
      renderChecklist();
      return;
    }

    checklistRestore(ctx.key, snapshot);
    renderChecklist();
    toast('Грешка при запис: ' + res.error, '#dc2626');
  });
}

/* Връща реда на предишното му състояние. snapshot === null значи, че ред не
   е имало — тогава новосъздаденият се МАХА, а не се оставя празен: празен
   ред в масива е ред в базата, какъвто там няма. */
function checklistRestore(key, snapshot) {
  var i = -1;
  for (var j = 0; j < checklistRows.length; j++) {
    if (checklistRows[j].store_name + ' ' + checklistRows[j].metric_key === key) { i = j; break; }
  }
  if (snapshot === null) {
    if (i >= 0) checklistRows.splice(i, 1);
    return;
  }
  if (i >= 0) checklistRows[i] = snapshot; else checklistRows.push(snapshot);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ПИСМОТО
   ═══════════════════════════════════════════════════════════════════════════

   САМО СТРОИ. Нищо не праща, няма бутон и няма запис в
   weekly_checklist_sends — това е отделна задача.

   ПОЩЕНСКИТЕ ПРОГРАМИ НЕ РАЗБИРАТ ВЪНШЕН CSS.
   Всичко е inline style="…", лейаутът е <table>, не flex и не grid.
   Нито един class= в изхода: клас без таблица със стилове е просто невидим
   атрибут, а <style> блок Gmail изрязва. Същият подход като reportGridHtml.

   БЕЗ ЛИНКОВЕ КЪМ ПОРТАЛА. Затова тук НЕ се ползва reportEmailShell():
   тя завършва с бутон „Отвори в портала →", а писмото отива до обектите,
   които нямат достъп до таб „Чек лист". Линк, който води до отказан достъп,
   е по-лош от липсващ. Оформлението е нейно, съдържанието не. */

/* „17.08 – 23.08.2026" — по образеца на reportWeekRangeLabel. */
function checklistEmailWeekRange(year, weekNumber) {
  var d = weekDays(weekNumber, year);
  return fmtD(d[0]) + ' – ' + fmtD(d[6]) + '.' + d[6].getFullYear();
}

/* Текстът на една клетка за писмото: control бие portal, преводът е същият
   като в таба („da" → „да"), съотношенията остават както са.

   Липсва ли стойност — ПРАЗЕН НИЗ. Не „—", не „undefined", не „null".
   esc() в shared.js връща „—" за празно, затова навсякъде тук е escVal().

   Писмото НЕ различава визуално ръчното от портальното. В таба бледото
   значи „предположение на портала, не потвърдена отметка" и е адресирано до
   контролинга. Тук получателят е обектът: за него значение има само какво
   пише в клетката, а два нюанса сиво биха повдигнали въпрос, на който
   писмото не отговаря. */
function checklistEmailCellValue(metric, row) {
  if (!row) return '';
  if (metric.value_type === 'number') {
    if (row.control_num !== null && row.control_num !== undefined && row.control_num !== '') {
      return String(row.control_num);
    }
    return row.portal_value ? checklistValueLabel(row.portal_value) : '';
  }
  if (row.control_value !== null && row.control_value !== undefined && row.control_value !== '') {
    return checklistValueLabel(row.control_value);
  }
  if (row.portal_value !== null && row.portal_value !== undefined && row.portal_value !== '') {
    return checklistValueLabel(row.portal_value);
  }
  return '';
}

/* Лентата за поправена версия. При version = 1 НЯМА лента: първото
   изпращане не е поправка и надпис „версия 1" само би объркал.
   Датата е ДНЕШНАТА — функцията строи писмото сега и няма подадено sent_at.
   Подаде ли се някога такова, тук е мястото му. */
function checklistEmailVersionBanner(version, note) {
  var v = parseInt(version, 10);
  if (!(v > 1)) return '';
  var today = fmtDate(toLocalISO(new Date()));
  var h = '<div style="margin-bottom:14px;padding:11px 14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-size:13px;color:#9A3412;">' +
    '<b>Поправена версия ' + v + ' от ' + today + '</b>';
  if (note) {
    h += '<div style="margin-top:5px;font-size:12px;color:#7C2D12;">' + escVal(note) + '</div>';
  }
  return h + '</div>';
}

/* Списъкът с коментари. Само клетките с текст; нула коментари → секцията
   отпада изцяло, вместо празна кутия със заглавие. Редът следва таблицата:
   по обект, вътре по показател. */
function checklistEmailCommentsHtml(rows, metrics, stores) {
  var labelOf = {};
  metrics.forEach(function (m) { labelOf[m.key] = m.label; });

  var items = [];
  stores.forEach(function (store) {
    metrics.forEach(function (m) {
      var row = rows.filter(function (r) {
        return r.store_name === store && r.metric_key === m.key;
      })[0];
      if (row && row.comment) {
        items.push({ store: store, metric: labelOf[m.key] || m.key, text: row.comment });
      }
    });
  });
  if (!items.length) return '';

  return '<div style="margin-top:18px;">' +
    '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Коментари</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">' +
    items.map(function (it) {
      return '<tr><td style="padding:7px 10px;border-bottom:1px solid #E5E9F0;font-size:12px;color:#334155;">' +
        '<b>' + escVal(it.store) + '</b> · ' + escVal(it.metric) + ': ' + escVal(it.text) +
        '</td></tr>';
    }).join('') +
    '</table></div>';
}

/* Готовото писмо за една седмица. */
function checklistEmailHtml(year, weekNumber, version, rows, metrics, stores, note) {
  rows = Array.isArray(rows) ? rows : [];
  metrics = Array.isArray(metrics) ? metrics : [];
  stores = Array.isArray(stores) ? stores : [];

  var idx = {};
  rows.forEach(function (r) { idx[r.store_name + ' ' + r.metric_key] = r; });

  var cellCss = 'padding:6px 8px;border:1px solid #E5E9F0;font-size:12px;';
  var body = checklistEmailVersionBanner(version, note);

  body += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;border-collapse:collapse;">';

  /* Шапка на две нива в ЕДНА клетка — label отгоре, sublabel по-дребно.
     Не два реда с rowspan: rowspan е сред първите неща, които пощенските
     програми рендират различно. */
  body += '<thead><tr>' +
    '<th align="left" style="' + cellCss + 'background:#F1F5F9;font-weight:700;color:#0f172a;">Обект</th>';
  metrics.forEach(function (m) {
    body += '<th align="center" style="' + cellCss + 'background:#F1F5F9;vertical-align:bottom;">' +
      '<div style="font-weight:700;color:#0f172a;">' + escVal(m.label) + '</div>' +
      (m.sublabel
        ? '<div style="font-weight:400;font-size:10px;color:#64748b;margin-top:2px;">' + escVal(m.sublabel) + '</div>'
        : '') +
    '</th>';
  });
  body += '</tr></thead><tbody>';

  stores.forEach(function (store) {
    body += '<tr><td align="left" style="' + cellCss + 'font-weight:700;color:#1F2937;">' +
      escVal(store) + '</td>';
    metrics.forEach(function (m) {
      var txt = checklistEmailCellValue(m, idx[store + ' ' + m.key]);
      body += '<td align="center" style="' + cellCss + 'color:#0f172a;">' + escVal(txt) + '</td>';
    });
    body += '</tr>';
  });
  body += '</tbody></table>';

  body += checklistEmailCommentsHtml(rows, metrics, stores);
  body += checklistLegendHtml();

  return '<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:20px;background:#e8ecf3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;">' +
    '<div style="max-width:760px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 18px rgba(30,39,97,.12);">' +
      '<div style="background:#1E2761;padding:26px 24px;">' +
        '<p style="color:#CADCFC;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">ТеМАХ Портал</p>' +
        '<h1 style="color:#fff;font-size:22px;margin:0 0 4px;font-weight:700;">Чек лист — Седмица ' +
          weekNumber + ' · ' + year + '</h1>' +
        '<p style="color:#9DB3E8;font-size:13px;margin:0;">' +
          checklistEmailWeekRange(year, weekNumber) + '</p>' +
      '</div>' +
      '<div style="padding:20px;">' + body + '</div>' +
      '<div style="padding:0 24px 26px;text-align:center;">' +
        '<div style="font-size:11px;color:#9aa4b2;">Чек лист на контролинга · ТеМАХ</div>' +
      '</div>' +
    '</div></body></html>';
}
