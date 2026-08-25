/* bulletin.js v4.1 — 2026-06-02 */
/* bulletin.js — Т-Бюлетин v4 */

/* CONFIG */
var BUL_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var BUL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var BUL_BKT = 'bulletin-files';
var BUL_PUB = BUL_SB + '/storage/v1/object/public/' + BUL_BKT + '/';

/* STATE */
var bulActiveDept = 'trade';
var curBul = null; var bulTasks = []; var bulComps = [];
var recurringTasks = []; var recurringComps = []; var subtaskComps = [];
var bulPromotions = [];
var bulMode = 'view'; var bulSaveT = null; var dragInfo = null;
var bulSelectedId = null; /* избран ръчно бюлетин (превключвател) - null = автоматично поведение (последен) */
var bulListCache = []; /* кратък списък с бюлетини за превключвателя (само admin/accounting) */

/* DEPTS */
var DEPTS = {
  trade:     {label:'Търговска',      icon:'🛒', color:'#14532d', bg:'#f0fdf4', bdr:'#bbf7d0', hdr:'#166534'},
  warehouse: {label:'Склад/Приемане', icon:'📦', color:'#1e3a5f', bg:'#eff6ff', bdr:'#bfdbfe', hdr:'#1e40af'},
  admin:     {label:'Администрация',  icon:'⚙️', color:'#4c1d95', bg:'#f5f3ff', bdr:'#ddd6fe', hdr:'#5b21b6'}
};
var DCOLS  = ['trade','warehouse','admin'];
/* <option>-и за отдел — по същия модел като taskTypeOptsHtml() и
   linkedModuleOptsHtml() по-долу. Списъкът е DCOLS/DEPTS, за да не се
   разминат при бъдеща промяна. Нарочно БЕЗ стойност по подразбиране:
   при празно `selected` браузърът показва първата опция, точно както
   беше в модала за промоция, откъдето този ред е изнесен. */
function deptOptsHtml(selected){
  return DCOLS.map(function(dk){
    return '<option value="'+dk+'"'+(dk===selected?' selected':'')+'>'+DEPTS[dk].label+'</option>';
  }).join('');
}

/* ВИДОВЕ ЗАДАЧА — определят какво трябва магазинът, за да отбележи
   задачата изпълнена, и производен приоритет (само за визуализация,
   не се пази отделно в базата — извежда се от task_type). */
/* needsFile е ТРЕТИ флаг, не разновидност на needsPhoto: документът се иска
   отделно и се показва различно (връзка с име, не миниатюра).
   Комбинация снимка + документ нарочно НЯМА — няма такъв случай, а всяка
   комбинация удължава падащото меню. Ако потрябва, е един ред.
   Старите четири ключа НЕ се преименуват: 55 задачи ги ползват. */
var TASK_TYPES = {
  info:          {label:'Информативна',            short:'Инфо',        needsPhoto:false, needsFile:false, needsComment:false, priority:'Нисък',     color:'#64748b', bg:'#f1f5f9', bdr:'#e2e8f0'},
  photo:         {label:'Потвърждение със снимка',  short:'📷 Снимка',   needsPhoto:true,  needsFile:false, needsComment:false, priority:'Среден',    color:'#b6841e', bg:'#fffbeb', bdr:'#fde68a'},
  file:          {label:'Потвърждение с документ',  short:'📄 Документ', needsPhoto:false, needsFile:true,  needsComment:false, priority:'Среден',    color:'#b6841e', bg:'#fffbeb', bdr:'#fde68a'},
  comment:       {label:'Потвърждение с коментар',  short:'💬 Коментар', needsPhoto:false, needsFile:false, needsComment:true,  priority:'Висок',     color:'#c2410c', bg:'#fff7ed', bdr:'#fed7aa'},
  photo_comment: {label:'Коментар и снимка',        short:'💬📷 И двете', needsPhoto:true,  needsFile:false, needsComment:true,  priority:'Най-висок', color:'#b91c1c', bg:'#fef2f2', bdr:'#fecaca'},
  file_comment:  {label:'Документ и коментар',      short:'📄💬 Документ+коментар', needsPhoto:false, needsFile:true, needsComment:true, priority:'Най-висок', color:'#b91c1c', bg:'#fef2f2', bdr:'#fecaca'}
};

/* ─── КАКЪВ ФАЙЛ Е ДОПУСТИМ ─────────────────────────────────
   accept="" в <input type=file> е само подсказка към диалога за избор и
   НЕ спира нищо — качва се каквото му подадеш. Затова проверката е тук,
   в JavaScript, преди качването. Иначе .xlsx влиза в photos и после
   излиза като счупена картинка в имейла (три такива записа в базата към
   26.08.2026). */
var TC_PHOTO_EXT = ['jpg','jpeg','png','gif','webp','heic','heif'];
var TC_FILE_EXT  = ['pdf','doc','docx','xls','xlsx','csv','ppt','pptx'];
function tcExtOf(name){
  var p = String(name||'').split('.');
  return p.length>1 ? p.pop().toLowerCase() : '';
}
function tcIsPhotoName(name){ return TC_PHOTO_EXT.indexOf(tcExtOf(name))>=0; }
/* Един прикачен запис -> HTML. Снимка става миниатюра, всичко останало —
   връзка с името на файла.
   Проверката по разширение важи и за СТАРАТА колона photos: в нея лежат три
   .xlsx отпреди отделната колона files и без нея излизат като счупени
   картинки в имейла и в таб „Днес". Това е и защитата, ако някой пак качи
   документ през полето за снимка. */
function tcAttachHtml(a, px){
  if (!a || !a.url) return '';
  var nm = a.filename || a.name || '';
  px = px || 44;
  /* Без име не съдим — всичките 9 заварени записа с photos имат filename на
     ВСЕКИ елемент, тоест липсващото име значи стар или чужд запис и старото
     поведение (миниатюра) е по-безопасното. Разширението НЕ се чете от
     URL-а: там може да има query низ или кавичка и вадене на разширение
     оттам превръща проверката в гадаене. */
  if (!nm || tcIsPhotoName(nm)) {
    return '<a href="'+a.url+'" target="_blank"><img src="'+a.url+'" style="width:'+px+'px;height:'+px+'px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;"></a>';
  }
  return '<a href="'+a.url+'" target="_blank" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#2563eb;text-decoration:none;border:1px solid #e2e8f0;border-radius:5px;padding:3px 8px;background:#fff;">📄 '+esc(nm||'документ')+'</a>';
}
/* Прикаченото към едно отмятане: снимки + документи, в един ред. */
function tcAttachListHtml(c, px){
  return (((c&&c.photos)||[]).concat(((c&&c.files)||[])))
    .map(function(a){ return tcAttachHtml(a, px); }).join('');
}
/* Съобщението казва КАКВО се очаква, не „невалиден файл": магазинът е на
   смяна в 20 ч. и трябва да разбере какво да направи, не че е сгрешил. */
function tcExtReject(name, allowed, what){
  var ext = tcExtOf(name);
  return 'Това е '+(ext?'.'+ext:'файл без разширение')+', а тук се качва '+what+
         ' ('+allowed.map(function(e){return '.'+e;}).join(', ')+')';
}
function taskTypeOptsHtml(selected){
  return Object.keys(TASK_TYPES).map(function(k){
    var tt=TASK_TYPES[k];
    return '<option value="'+k+'"'+(k===(selected||'info')?' selected':'')+'>'+tt.label+' — приоритет: '+tt.priority+'</option>';
  }).join('');
}
function taskTypeBadgeHtml(taskType,taskId,kind,clickable,completionDate){
  var tt=TASK_TYPES[taskType||'info'];
  if(!tt||taskType==='info')return '';
  /* Заключен ден -> баджът не е пряк път към модала (иначе заобикаля чекбокса) */
  if(clickable&&taskId&&!bulDateLockReason(completionDate||null)){
    return '<span data-task-id="'+taskId+'" data-kind="'+(kind||'regular')+'" data-cdate="'+(completionDate||'')+'" onclick="taskTypeBadgeClick(this)" style="cursor:pointer;font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:'+tt.bg+';color:'+tt.color+';border:1px solid '+tt.bdr+';white-space:nowrap;">'+tt.short+'</span>';
  }
  return '<span style="font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:'+tt.bg+';color:'+tt.color+';border:1px solid '+tt.bdr+';white-space:nowrap;">'+tt.short+'</span>';
}
/* Клик направо върху баджа "💬 Коментар"/"📷 Снимка" - пряк път към модала за
   изпълнение, вместо да се минава задължително през чекбокса. Само за
   store роли, само за незавършени еднодневни задачи (баджът не е кликаем
   за admin/офиса, за вече изпълнени, или за многодневни - там няма единен
   "ден" контекст в главния списък). Подава СЪЩИЯ completion_date, който
   чекбоксът до него използва - иначе клик на бадж vs. чекбокс биха
   създали ДВА различни записа за една и съща задача, разсинхронизирани
   помежду си и с календара. */
function taskTypeBadgeClick(el){
  openTaskCompletionModal(el.dataset.taskId, el.dataset.kind, el.dataset.cdate||null);
}

/* ГРУПИ ЗА ДОКЛАДВАНЕ — до кого отива известие/седмичен репорт за дадена
   задача, избрано при създаването й (multi-select). "regional" няма фиксирани
   хора - извежда се динамично при изпращане на репорт, по assigned_stores
   на потребителите с users.is_regional=true спрямо target_stores на
   задачата. Признакът е отделна колона, а НЕ ролята accounting: тя се носи
   и от счетоводството, което не е регионално, а В. Филев е регионален с
   роля admin. Отбелязва се от Администрация → Потребители. */
var REPORT_GROUPS = {
  co:          {label:'Ц.О (Жеко, Васка)',        people:[{name:'Жеко Желязков',   email:'j.jeliazkov@temax.bg'},{name:'Василка Шикова',  email:'v.shikova@temax.bg'}]},
  controlling: {label:'Контролинг (Меги, Цвети)',  people:[{name:'Миглена Павлова', email:'m.pavlova@temax.bg'},{name:'Цветелина Тенева', email:'c.teneva@temax.bg'}]},
  regional:    {label:'Регионален (по магазин)',   dynamic:true},
  owner:       {label:'Т.Тенев',                   people:[{name:'Теодор Тенев',    email:'t.tenev@temax.bg'}]}
};
function reportGroupsCheckboxesHtml(selId, selectedArr){
  selectedArr = selectedArr || [];
  return '<div id="'+selId+'" style="display:flex;flex-direction:column;gap:5px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">' +
    Object.keys(REPORT_GROUPS).map(function(k){
      var g=REPORT_GROUPS[k];
      return '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#374151;cursor:pointer;">' +
        '<input type="checkbox" value="'+k+'"'+(selectedArr.indexOf(k)>=0?' checked':'')+' style="width:14px;height:14px;cursor:pointer;">' + esc(g.label) +
        '</label>';
    }).join('') +
    '</div>';
}
function readReportGroupsCheckboxes(selId){
  var wrap = document.getElementById(selId);
  if (!wrap) return [];
  return Array.prototype.slice.call(wrap.querySelectorAll('input[type=checkbox]:checked')).map(function(cb){ return cb.value; });
}

/* СВЪРЗАН ТАБ — динамичен бутон в седмичния календар, водещ директно към
   модула, за който се отнася задачата (напр. "Отчитане на каса" -> Каса). */
var LINKED_MODULES = [
  { value:'', label:'— Няма —' },
  { value:'kasa', label:'🧾 Каса' },
  { value:'transit', label:'🚚 Стока на път' },
  { value:'transport', label:'📦 Транспорт' },
  { value:'client', label:'🛒 Клиентски поръчки' },
  { value:'stock-diff', label:'⚖️ Разлики' },
  { value:'stock-returns', label:'📥 За връщане' },
  { value:'contacts', label:'📇 Контакти' },
  { value:'reference', label:'🛡️ Гаранции' },
  { value:'history', label:'📊 История' },
  { value:'pallets', label:'🟫 Палети' },
  /* Не е самостоятелен модул, а подтаб на Каса. showModule() го пренасочва —
     виж клона за 'oborot' там. */
  { value:'oborot', label:'💰 Вечерен оборот' }
];
function linkedModuleOptsHtml(selected){
  return LINKED_MODULES.map(function(m){
    return '<option value="'+m.value+'"'+(m.value===(selected||'')?' selected':'')+'>'+m.label+'</option>';
  }).join('');
}
function linkedModuleLabel(value){
  var m = LINKED_MODULES.find(function(x){ return x.value===value; });
  return m ? m.label : null;
}
/* Бутонът "свързан модул" се показва само ако ролята изобщо вижда този таб.
   Огледало на setupTabsForRole() в shared.js: История = само isGlobal(),
   Каса = kasa/admin/manager, останалите модули са видими за всички
   (Палети е под-таб на Транспорт и не се ограничава). */
function linkedModuleAllowed(value){
  if(!value) return false;
  if(value==='history') return isGlobal();
  /* 'oborot' е подтаб на Каса и се пуска по същото право като нея. Без този
     ред бутонът в календара би бил път до формата за роли, които през самия
     таб Каса не стигат до нея — kasaTabBar() връща празна лента за тях. */
  if(value==='kasa'||value==='oborot') return ['kasa','admin','manager'].indexOf(currentUser&&currentUser.role)>=0;
  return true;
}

/* Живи бройки/статус за елемент в седмичния календар.
   isGlobal() -> "X/Y обекта" (обхватът е target_stores на задачата, или
   reportableStoresCache ако е за всички и кешът е зареден).
   Магазин -> малка цветна точка за СОБСТВЕНИЯ му статус (зелено=изпълнена,
   оранжево=отложена, сиво=чака). Постоянните задачи ползват recurringComps
   (recurring_task_id), обикновените — bulComps (task_id). */
function calItemStatusHtml(itemId,kind,targetStores,dateStr,windowDates){
  var compsArr = kind==='recurring' ? recurringComps : bulComps;
  var idField = kind==='recurring' ? 'recurring_task_id' : 'task_id';
  /* Ако извикващият подаде dateStr - completion_date трябва да съвпада с
     ТОЗИ ден (многодневна задача, обикновена или постоянна). Ако не подаде
     dateStr (стара постоянна задача - 1 ден/всеки ден) - без филтър по дата,
     изпълнението остава завинаги, както досега.
     windowDates (задача с прозорец) бие dateStr: отметка на кой да е ден от
     прозореца брои за целия — иначе офисът вижда 3 различни числа за една и
     съща единица работа, по едно на ден от прозореца. */
  var dateMatches = function(c){
    if(windowDates&&windowDates.length) return windowDates.indexOf(c.completion_date||'')>=0;
    return !dateStr || (c.completion_date||null)===dateStr;
  };
  if(isGlobal()){
    /* Знаменателят са обектите, които РЕАЛНО могат да отметнат — същият
       източник като седмичния имейл (report.js). Преди тук стоеше
       allStoresCache (таблицата stores, 23 записа): броеше Централен офис,
       двата логистични склада и обекти без нито един акаунт, затова задача,
       изпълнена от всичките 18, показваше 18/23 и никога не позеленяваше.
       target_stores също минава през същия филтър — задача, насочена към
       обект без акаунт, иначе пак би броила недостижим обект. */
    var reach = (typeof reportableStoresCache!=='undefined'&&reportableStoresCache&&reportableStoresCache.length) ? reportableStoresCache : null;
    if(!reach) return '';
    var scope = (targetStores&&targetStores.length)
      ? targetStores.filter(function(s){ return reach.indexOf(s)>=0; })
      : reach;
    /* Обхватът се е изпразнил след филтъра — задачата е насочена само към
       обекти без достъп. Не връщаме празно: изчезнала контрола изглежда като
       счупен рендер (правило 11). Тире с обяснение казва истината. */
    if(!scope.length) return '<span title="Няма обект с достъп до тази задача" style="font-size:11px;font-weight:700;color:#94a3b8;margin-left:4px;white-space:nowrap;cursor:help;">—</span>';
    var done = scope.filter(function(s){
      return compsArr.some(function(c){ return c[idField]===itemId && c.store_name===s && dateMatches(c) && (c.status||'done')==='done'; });
    }).length;
    return '<span style="font-size:11px;font-weight:700;color:'+(done===scope.length&&scope.length?'#16a34a':'#94a3b8')+';margin-left:4px;white-space:nowrap;">'+done+'/'+scope.length+'</span>';
  }
  var store = currentUser && currentUser.store_name;
  if(!store) return '';
  var mine = compsArr.find(function(c){ return c[idField]===itemId && c.store_name===store && dateMatches(c); });
  if(!mine) return '<span style="width:6px;height:6px;border-radius:50%;background:#cbd5e1;display:inline-block;margin-left:4px;flex-shrink:0;margin-top:4px;"></span>';
  var color = mine.status==='postponed' ? '#d97706' : '#16a34a';
  return '<span style="width:6px;height:6px;border-radius:50%;background:'+color+';display:inline-block;margin-left:4px;flex-shrink:0;margin-top:4px;"></span>';
}

var DNAMES = ['Понеделник','Вторник','Сряда','Четвъртък','Петък','Събота','Неделя'];
var DKEYS  = ['mon','tue','wed','thu','fri','sat','sun'];

/* ═══ МНОГОДНЕВНИ ЗАДАЧИ — задача може да е дължима на НЯКОЛКО конкретни дни
   (напр. Пон+Вт+Ср), не само 1. Ново поле due_dates (масив) с fallback към
   старото due_date (единично) за обратна съвместимост със съществуващите
   задачи. Всеки ден се отмята ОТДЕЛНО (completion_date на всеки запис). ═══ */
function taskDueDates(t){
  if(t.due_dates && t.due_dates.length) return t.due_dates.map(function(d){return String(d).slice(0,10);});
  if(t.due_date) return [String(t.due_date).slice(0,10)];
  return [];
}
function taskIsDueOnDate(t, dateStr){
  return taskDueDates(t).indexOf(dateStr) >= 0;
}
function taskIsMultiDay(t){ return taskDueDates(t).length > 1; }
function taskDueLabel(t){
  var dates = taskDueDates(t);
  if(!dates.length) return '';
  return dates.map(function(d){
    var dt = new Date(d+'T00:00:00');
    return dt.toLocaleDateString('bg-BG',{day:'numeric',month:'numeric'});
  }).join(', ');
}
/* Multi-select checkbox списък за избор на конкретни дни (Пон-Нед) при
   поставяне/редакция на задача. selectedDates: масив от YYYY-MM-DD низове. */
function dueDatesCheckboxesHtml(selId, days, selectedDates){
  selectedDates = selectedDates || [];
  var h = '<div id="'+selId+'" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">';
  DKEYS.forEach(function(key,i){
    var iso = toLocalISO(days[i]);
    var checked = selectedDates.indexOf(iso)>=0;
    h += '<label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#374151;cursor:pointer;">' +
      '<input type="checkbox" value="'+iso+'"'+(checked?' checked':'')+' style="width:13px;height:13px;cursor:pointer;">' + DNAMES[i].slice(0,3) +
      '</label>';
  });
  h += '</div>';
  return h;
}
function readDueDatesCheckboxes(selId){
  var wrap = document.getElementById(selId);
  if (!wrap) return [];
  return Array.prototype.slice.call(wrap.querySelectorAll('input[type=checkbox]:checked')).map(function(cb){ return cb.value; });
}

/* ═══ МНОГОДНЕВНИ ПОСТОЯННИ ЗАДАЧИ — постоянна задача може да важи за
   НЯКОЛКО дни от седмицата (напр. Пон+Ср+Пет), не само 1/всеки ден. Ново
   поле due_weekdays (масив от 0-6) с fallback към старото due_weekday
   (единично) или "всеки ден" (due_time зададен, без due_weekday).
   За разлика от единичните постоянни задачи (изпълнението им е БЕЗ дата,
   веднъж завинаги), многодневна постоянна задача се отмята ОТДЕЛНО всеки
   ден ВСЯКА седмица - completion_date сочи КОНКРЕТНАТА календарна дата на
   тазседмичното Пон/Ср/Пет, затова нулирането следващата седмица идва
   естествено (нова дата), без нужда от отделна reset логика. */
function recTaskWeekdays(t){
  if(t.due_weekdays && t.due_weekdays.length) return t.due_weekdays.slice();
  if(t.due_weekday!==null && t.due_weekday!==undefined) return [t.due_weekday];
  return []; /* "всеки ден" (due_time) или без срок - без конкретни дни */
}
function recTaskIsMultiDay(t){ return recTaskWeekdays(t).length > 1; }
/* recWeekdaysCheckboxesHtml() / readRecWeekdaysCheckboxes() са дефинирани
   по-долу, до openRecurringModal() - виж там. */

function myDept(){
  var m={manager:'trade',sklad:'warehouse',kasa:'admin',accounting:'admin',logistics:'admin',admin:'admin',info:'trade'};
  return currentUser ? (m[currentUser.role]||'trade') : 'trade';
}
function canEdit(){return currentUser && ['admin','accounting'].indexOf(currentUser.role)>=0;}
function genId(){return Math.random().toString(36).slice(2,9);}

/* ═══════ ПРОМОЦИИ ══════════════════════════════════════════ */
function promoStatus(p,refDate){
  var t=refDate?new Date(refDate):new Date(); t.setHours(0,0,0,0);
  var s=new Date(p.start_date); s.setHours(0,0,0,0);
  var e=new Date(p.end_date); e.setHours(0,0,0,0);
  if(t>e) return 'expired';
  var daysToEnd=Math.ceil((e-t)/86400000);
  if(daysToEnd<=5) return 'expiring'; /* краят е близо (≤5 дни) - приоритет пред "стартираща", важи и за еднодневни маркери */
  if(t<s) return 'upcoming';
  return 'active';
}
/* Връща [понеделник, неделя] за дадена седмица/година - за филтриране и оценка на
   промоциите спрямо седмицата на РАЗГЛЕЖДАНИЯ бюлетин, не спрямо реалната дата днес.
   Позволява промоциите да са "автономни" за всяка седмица (стар бюлетин показва
   промоциите, важащи за тогавашната седмица, не текущите). */
function promoWeekRange(wk,yr){
  var days=weekDays(wk,yr); /* [пон..пет] */
  var mon=days[0];
  var sun=new Date(mon); sun.setDate(mon.getDate()+6);
  return {start:toLocalISO(mon), end:toLocalISO(sun), monday:mon};
}
var PROMO_STATUS_META={
  upcoming:{label:'⏳ Предстояща',bg:'#eff6ff',bdr:'#bfdbfe',c:'#1e40af'},
  active:{label:'✅ Активна',bg:'#f0fdf4',bdr:'#bbf7d0',c:'#166534'},
  expiring:{label:'⚠️ Изтича скоро',bg:'#fffbeb',bdr:'#fde68a',c:'#92400e'},
  expired:{label:'🔴 Изтекла',bg:'#fef2f2',bdr:'#fecaca',c:'#991b1b'}
};
function renderPromotionsSection(){
  if(!bulPromotions.length && !canEdit()) return '';
  var wr = (curBul && curBul.week_number && curBul.year) ? promoWeekRange(curBul.week_number, curBul.year) : null;
  var refDate = wr ? wr.monday : null;
  var visible=bulPromotions.filter(function(p){ return canEdit() || promoStatus(p,refDate)!=='expired'; });
  var expiringCount=bulPromotions.filter(function(p){return promoStatus(p,refDate)==='expiring';}).length;
  var h='<div class="bcard" id="sec-promo">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  h+='<div class="bsec" style="margin-bottom:0;">🎯 Промоции</div>';
  if(canEdit())h+='<button onclick="openPromoModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави промоция</button>';
  h+='</div>';
  if(canEdit() && expiringCount>0){
    h+='<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:7px;padding:8px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">';
    h+='<span style="font-size:12px;color:#92400e;">⚠️ '+expiringCount+' промоци'+(expiringCount===1?'я изтича':'и изтичат')+' до 3 дни.</span>';
    h+='<button onclick="sendPromoExpiringNotification()" style="border:none;background:#d97706;color:#fff;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;">🔔 Изпрати нотификация</button>';
    h+='</div>';
  }
  if(!visible.length){
    h+='<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">Няма активни промоции.</div>';
  }else{
    var groups=[
      {key:'upcoming',label:'🆕 Стартиращи скоро'},
      {key:'expiring',label:'⚠️ Изтичащи скоро'},
      {key:'active',label:'✅ Активни'},
      {key:'expired',label:'🔴 Изтекли'}
    ];
    groups.forEach(function(g){
      var inGroup=visible.filter(function(p){return promoStatus(p,refDate)===g.key;});
      if(!inGroup.length)return;
      h+='<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;">'+g.label+' ('+inGroup.length+')</div>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;">';
      inGroup.forEach(function(p){
        h+=renderPromoCard(p,refDate);
      });
      h+='</div>';
    });
  }
  h+='</div>';
  return h;
}
function renderPromoCard(p,refDate){
  var st=promoStatus(p,refDate);
  var m=PROMO_STATUS_META[st];
  var dLabel=DEPTS[p.department]?DEPTS[p.department].label:'Всички';
  var h='<div style="background:'+m.bg+';border:1px solid '+m.bdr+';border-radius:7px;padding:9px 12px;flex:1;min-width:210px;position:relative;">';
  h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">';
  h+='<div style="font-size:12px;font-weight:600;color:'+m.c+';">'+esc(p.title||'')+'</div>';
  h+='<span style="font-size:9px;font-weight:700;color:'+m.c+';white-space:nowrap;">'+m.label+'</span>';
  h+='</div>';
  if(p.description)h+='<div style="font-size:11px;color:'+m.c+';opacity:.8;margin-top:2px;">'+linkify(p.description)+'</div>';
  h+='<div style="font-size:10px;color:'+m.c+';opacity:.7;margin-top:4px;">📅 '+fmtDate2(p.start_date)+' → '+fmtDate2(p.end_date)+' &nbsp;·&nbsp; '+dLabel+'</div>';
  if(canEdit()){
    h+='<div style="display:flex;gap:5px;margin-top:7px;">';
    if(st==='expiring'||st==='expired')h+='<button data-id="'+p.id+'" onclick="openExtendPromoModal(this.dataset.id)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">↻ Продължи</button>';
    h+='<button data-id="'+p.id+'" data-etitle="'+esc(p.title)+'" onclick="openNotifyScheduleModal(\'promotion\',this.dataset.id,this.dataset.etitle)" style="border:1px solid #fde68a;background:#fffbeb;color:#d97706;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">🔔</button>';
    h+='<button data-id="'+p.id+'" onclick="openPromoModal(this.dataset.id)" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">✏️</button>';
    h+='<button data-id="'+p.id+'" onclick="deletePromo(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;">✕</button>';
    h+='</div>';
  }
  h+='</div>';
  return h;
}
function fmtDate2(d){ if(!d) return '—'; var p=String(d).slice(0,10).split('-'); return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : d; }

function openPromoModal(id){
  var p=id ? bulPromotions.find(function(x){return String(x.id)===String(id);}) : null;
  var existing=document.getElementById('promo-modal-ov'); if(existing)existing.remove();
  var ov=document.createElement('div');
  ov.className='bov open'; ov.id='promo-modal-ov';
  ov.innerHTML='<div class="bmod" style="width:440px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">🎯 '+(p?'Редактирай промоция':'Нова промоция')+'</div>'+
    '<label class="fl">Заглавие *</label><input class="fi" id="pm-title" value="'+esc(p?p.title:'')+'" placeholder="напр. -20% на градински инструменти">'+
    '<label class="fl">Описание</label><input class="fi" id="pm-desc" value="'+esc(p?p.description||'':'')+'" placeholder="Допълнителна информация, линк и т.н.">'+
    '<label class="fl">Отдел</label><select class="fi" id="pm-dept">'+
      '<option value="all"'+(!p||p.department==='all'?' selected':'')+'>Всички</option>'+
      deptOptsHtml(p&&p.department)+
    '</select>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Начална дата *</label><input type="date" class="fi" id="pm-start" value="'+(p?String(p.start_date).slice(0,10):today())+'"></div>'+
    '<div><label class="fl">Крайна дата *</label><input type="date" class="fi" id="pm-end" value="'+(p?String(p.end_date).slice(0,10):'')+'"></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'+
    '<button onclick="var e=document.getElementById(\'promo-modal-ov\');if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-id="'+(p?p.id:'')+'" onclick="submitPromo(this.dataset.id)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(p?'💾 Запази':'Добави')+'</button>'+
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){var el=document.getElementById('pm-title'); if(el)el.focus();},80);
}
/* Заявка към bulletin_promotions, филтрирана спрямо седмицата на curBul (ако е известна) */
function promoQueryForCurBul(){
  if(curBul && curBul.week_number && curBul.year){
    var wr=promoWeekRange(curBul.week_number,curBul.year);
    return 'active=eq.true&start_date=lte.'+wr.end+'&end_date=gte.'+wr.start+'&order=end_date.asc';
  }
  return 'active=eq.true&order=end_date.asc';
}
/* Презарежда bulPromotions спрямо текущо избраната седмица и рендира наново */
function reloadPromotions(){
  return sbGet('bulletin_promotions',promoQueryForCurBul()).then(function(pr){
    bulPromotions=Array.isArray(pr)?pr:[];
    renderBulletin();
  });
}
function submitPromo(id){
  var title=(document.getElementById('pm-title').value||'').trim();
  var start=document.getElementById('pm-start').value;
  var end=document.getElementById('pm-end').value;
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  if(!start||!end){toast('Въведи начална и крайна дата','#dc2626');return;}
  if(end<start){toast('Крайната дата трябва да е след началната','#dc2626');return;}
  var data={
    title:title, description:document.getElementById('pm-desc').value||'',
    department:document.getElementById('pm-dept').value,
    start_date:start, end_date:end
  };
  var p=id
    ? sbPatch('bulletin_promotions','id=eq.'+id,data)
    : sbPost('bulletin_promotions',Object.assign({active:true,created_by:currentUser.display_name||currentUser.email},data));
  p.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    var el=document.getElementById('promo-modal-ov'); if(el)el.remove();
    toast(id?'✅ Записано!':'✅ Промоцията е добавена!');
    reloadPromotions();
  });
}
function deletePromo(id){
  if(!confirm('Изтрий промоцията?'))return;
  sbPatch('bulletin_promotions','id=eq.'+id,{active:false}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    bulPromotions=bulPromotions.filter(function(p){return String(p.id)!==String(id);});
    renderBulletin(); toast('✓ Изтрита');
  });
}
function openExtendPromoModal(id){
  var p=bulPromotions.find(function(x){return String(x.id)===String(id);});
  if(!p)return;
  var existing=document.getElementById('promo-ext-ov'); if(existing)existing.remove();
  var ov=document.createElement('div');
  ov.className='bov open'; ov.id='promo-ext-ov';
  ov.innerHTML='<div class="bmod" style="width:360px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">↻ Продължи промоцията</div>'+
    '<div style="font-size:13px;color:#64748b;margin-bottom:14px;">'+esc(p.title||'')+'</div>'+
    '<label class="fl">Нова крайна дата *</label><input type="date" class="fi" id="pmx-end" value="'+String(p.end_date).slice(0,10)+'">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'+
    '<button onclick="var e=document.getElementById(\'promo-ext-ov\');if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-id="'+p.id+'" onclick="submitExtendPromo(this.dataset.id)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">✓ Продължи</button>'+
    '</div></div>';
  document.body.appendChild(ov);
}
function submitExtendPromo(id){
  var newEnd=document.getElementById('pmx-end').value;
  if(!newEnd){toast('Въведи дата','#dc2626');return;}
  var p=bulPromotions.find(function(x){return String(x.id)===String(id);});
  if(p && newEnd<String(p.start_date).slice(0,10)){toast('Датата трябва да е след началото на промоцията','#dc2626');return;}
  sbPatch('bulletin_promotions','id=eq.'+id,{end_date:newEnd}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    if(p)p.end_date=newEnd;
    var el=document.getElementById('promo-ext-ov'); if(el)el.remove();
    renderBulletin(); toast('✅ Промоцията е удължена!');
  });
}
/* Композира заглавие+съобщение за изтичащите промоции. Връща null ако няма такива. */
function composePromoExpiringMessage(){
  var expiring=bulPromotions.filter(function(p){return promoStatus(p)==='expiring';});
  if(!expiring.length)return null;
  var titles=expiring.map(function(p){return p.title;}).join(', ');
  var title='⚠️ Изтичащи промоции';
  var msg=expiring.length===1 ? titles+' изтича до 3 дни.' : expiring.length+' промоции изтичат до 3 дни: '+titles;
  return {title:title,msg:msg,count:expiring.length};
}
function sendPromoExpiringNotification(){
  var m=composePromoExpiringMessage();
  if(!m){toast('Няма изтичащи промоции','#dc2626');return;}
  if(typeof pushToAll!=='function'){toast('Нотификациите не са налични в момента','#dc2626');return;}
  pushToAll(m.title,m.msg).then(function(res){
    if(res && res.ok) toast('🔔 Нотификацията е изпратена!');
    else toast('❌ Грешка при изпращане на нотификация','#dc2626');
  });
}
/* ═══════ АВТОМАТИЧНИ НОТИФИКАЦИИ (веднъж на ден, при зареждане) ══════
   Забележка: dedup-ът е през localStorage на браузъра, не централизирано —
   ако няколко админа заредят бюлетина в един и същ ден, е възможно нотификация
   да се изпрати повече от веднъж (по 1 на устройство). За истинска гаранция за
   еднократност е нужна сървърна (cron) задача — извън обхвата на клиентския код. */
function autoCheckBulletinNotifications(){
  if(!canEdit())return; /* само редактиращите роли инициират автоматични известия */
  autoCheckPromoNotifications();
  autoCheckDailyDeadlines();
}
function autoCheckPromoNotifications(){
  var key='auto_promo_notif_'+today();
  try{ if(localStorage.getItem(key))return; }catch(e){}
  var m=composePromoExpiringMessage();
  try{ localStorage.setItem(key,'1'); }catch(e){}
  if(!m || typeof pushToAll!=='function')return;
  pushToAll(m.title,m.msg);
}



/* WEEK */
function weekNum(d){
  var dt=new Date(d); dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  var w1=new Date(dt.getFullYear(),0,4);
  return 1+Math.round(((dt-w1)/86400000-3+(w1.getDay()+6)%7)/7);
}
function weekDays(wk,yr){
  var s=new Date(yr,0,1+7*(wk-1));
  var d=s.getDay(); if(d<=4)s.setDate(s.getDate()-d+1); else s.setDate(s.getDate()+8-d);
  return [0,1,2,3,4,5,6].map(function(i){var x=new Date(s);x.setDate(s.getDate()+i);return x;});
}
function fmtD(d){return d.getDate()+'.'+(d.getMonth()<9?'0':'')+(d.getMonth()+1);}
/* Локален YYYY-MM-DD без UTC конверсия - toISOString() бута датата с 1 ден назад за UTC+2/+3 (България) */
function toLocalISO(d){
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

/* ─── ЗАКЛЮЧВАНЕ НА ОТМЯТАНЕТО ПО ДАТА ──────────────────────
   Отмятане се допуска САМО за днешния ден. Всеки друг ден е заключен.
   Защо не се допуска наваксване в рамките на седмицата (както беше между
   65e75f9 и този комит): отмятането е твърдение КОГА е свършена работата.
   Ако в петък може да се отметне понеделник, отметката значи „твърдя, че съм
   го свършил", а не „свърших го тогава" — проверка, която се попълва със
   задна дата, престава да е проверка.
   Защо НЕ today() от shared.js: то е new Date().toISOString().slice(0,10),
   тоест UTC. В ранните часове по българско време (UTC+3 лятно) UTC още е вчера
   и магазинът би губил първите часове от работния ден. Клетките на календара
   се строят с toLocalISO(), затова и сравнението е с него.
   completion_date === null (стари постоянни задачи) НЕ се заключва — тези
   отмятания персистират завинаги по съществуващия дизайн. */
function bulTodayISO(){ return toLocalISO(new Date()); }
/* null = отключено · 'future' = денят още не е настъпил · 'past' = денят е приключил */
function bulDateLockReason(cdate){
  if(!cdate) return null;
  var t=bulTodayISO();
  if(cdate===t) return null;
  return cdate>t ? 'future' : 'past';
}
/* Втора причина за заключване, независима от датата: задача, чието изпълнение
   се доказва от данни, а не от твърдение. Вечерният оборот се отмята сам при
   записа в daily_turnover, затова ръчният чекбокс е затворен и за днешния ден
   — иначе обект може да се отметне, без да е подал оборот, и Бюлетинът ще
   брои друго число от имейла. */
function bulAutoLocked(linkedModule){ return linkedModule==='oborot'; }
/* Автоматичното бие датата: за такава задача чекбоксът е заключен винаги,
   независимо кой ден се гледа. */
function bulLockReason(cdate,linkedModule){
  if(bulAutoLocked(linkedModule)) return 'auto';
  return bulDateLockReason(cdate);
}
function bulLockLabel(reason){
  if(reason==='auto') return 'Отмята се автоматично при запис на оборота';
  return reason==='future' ? 'Денят още не е настъпил' : 'Денят е приключил';
}
/* Заключената контрола НЕ се крие — стои видима, само не се натиска.
   Контрола, която изчезва според данните, изглежда като счупена. */
function bulLockAttr(cdate,linkedModule){
  var r=bulLockReason(cdate,linkedModule);
  return r ? ' disabled title="'+bulLockLabel(r)+'"' : '';
}
function bulLockStyle(cdate,linkedModule){
  return bulLockReason(cdate,linkedModule) ? 'opacity:.45;cursor:not-allowed;' : '';
}
/* Втора защита в обработчиците: disabled в markup-а не спира извикване от
   конзолата и не предпазва, ако функцията бъде преизползвана отдругаде.
   Връща true, ако кликът е отхвърлен, и връща чекбокса в състоянието му
   отпреди клика (важи и за отмятане, и за разотмятане). */
function bulLockRejected(cb){
  var ds=(cb&&cb.dataset)||{};
  var r=bulLockReason(ds.cdate||null,ds.linked||null);
  if(!r) return false;
  cb.checked=!cb.checked;
  toast(bulLockLabel(r),'#d97706');
  return true;
}

/* ─── ПРЕВКЛЮЧВАТЕЛ МЕЖДУ БЮЛЕТИНИ (само admin/accounting) ─── */
function loadBulletinList(){
  var q='select=id,week_number,year,status,created_at&order=created_at.desc&limit=20';
  if(!canEdit()) q+='&status=eq.published'; /* обикновените служители виждат само публикувани, не чернови */
  return sbGet('bulletins',q).then(function(rows){
    bulListCache=Array.isArray(rows)?rows:[];
    return bulListCache;
  }).catch(function(){bulListCache=[];return [];});
}
function bulletinSwitcherHtml(){
  if(!bulListCache.length)return '';
  var statusLbl={draft:' (чернова)',published:' (публикуван)'};
  var opts=bulListCache.map(function(b){
    var label='Седмица '+b.week_number+' · '+b.year+(statusLbl[b.status]||'');
    return '<option value="'+b.id+'"'+(curBul&&String(curBul.id)===String(b.id)?' selected':'')+'>'+label+'</option>';
  }).join('');
  return '<select onchange="selectBulletin(this.value)" style="border:1px solid #334155;border-radius:6px;padding:4px 8px;font-size:11px;background:#1e293b;color:#e2e8f0;">'+opts+'</select>';
}

/* Лента за контекст над тялото на бюлетина. Подразбиращият се бюлетин вече е
   този за ДНЕШНАТА седмица (виж loadBulletin), затова следващият трябва да се
   обади сам - в петък по него върви оперативката. Обратно: когато гледаш чужда
   седмица, лентата казва къде са отметките за днес.
   Само обяснява контекста - НЕ заключва и не скрива чекбоксчета.
   Връща '' , когато няма какво да се каже. */
function bulWeekBannerHtml(){
  if(!curBul||!curBul.week_number||!curBul.year)return '';
  var nowWk=weekNum(new Date()), nowYr=new Date().getFullYear();
  var cmp=(curBul.year-nowYr)||(curBul.week_number-nowWk); /* <0 минала, 0 текуща, >0 бъдеща */
  var BLUE=['#eff6ff','#bfdbfe','#1e40af'], AMBER=['#fffbeb','#fde68a','#92400e'];
  /* Диапазонът на седмицата - същите weekDays()/fmtD() като календара. */
  var range=function(wk,yr){ var d=weekDays(wk,yr); return fmtD(d[0])+' – '+fmtD(d[6]); };
  var box=function(cl,txt,btn){
    return '<div style="background:'+cl[0]+';border:1px solid '+cl[1]+';border-radius:8px;padding:9px 13px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">'+
      '<span style="font-size:12.5px;color:'+cl[2]+';">'+txt+'</span>'+(btn||'')+'</div>';
  };
  var goBtn=function(id,label,cl){
    return '<button onclick="selectBulletin(\''+id+'\')" style="border:1px solid '+cl[1]+';background:#fff;color:'+cl[2]+';border-radius:6px;padding:3px 11px;font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;">'+label+'</button>';
  };

  if(cmp===0){
    /* А) Гледаш текущата, но вече има публикуван по-нов. Взимаме най-БЛИЗКИЯ
       напред, не най-далечния - петъчната оперативка е по следващата седмица. */
    var newer=bulListCache.filter(function(b){
      return b.status==='published'&&((b.year-nowYr)||(b.week_number-nowWk))>0;
    }).sort(function(a,b){ return (a.year-b.year)||(a.week_number-b.week_number); })[0];
    if(!newer)return '';
    return box(BLUE,'📢 Публикуван е нов бюлетин за С'+newer.week_number+' ('+range(newer.week_number,newer.year)+') — за оперативката.',
      goBtn(newer.id,'Отвори →',BLUE));
  }

  /* Бюлетинът за текущата седмица - целта на "← Към текущата".
     Липсва ли в кеша, лентата остава, но без бутон - няма къде да води. */
  var curWeek=bulListCache.filter(function(b){
    return b.week_number===nowWk&&b.year===nowYr&&(canEdit()||b.status==='published');
  })[0];
  var back=curWeek?goBtn(curWeek.id,'← Към текущата',AMBER):'';

  if(cmp>0){
    /* Б) Бъдеща седмица. */
    return box(AMBER,'📅 Гледаш следваща седмица ('+range(curBul.week_number,curBul.year)+'). Отметките за днес са в С'+nowWk+'.',back);
  }
  /* В) Минала седмица. */
  return box(AMBER,'📅 Гледаш минала седмица ('+range(curBul.week_number,curBul.year)+').',back);
}
function selectBulletin(id){
  bulSelectedId=id;
  loadBulletin();
}

/* LOAD */
function loadBulletin(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  wrap.innerHTML='<div style="display:flex;justify-content:center;align-items:center;height:300px;color:#94a3b8;font-size:15px;">⏳ Зареждане...</div>';
  /* Кешовете трябва да са заредени, преди да се рендира: allStoresCache за
     multi-select-а при избор на магазини, reportableStoresCache за живите
     бройки в календара (calItemStatusHtml). Другите модули ги зареждат при
     отваряне, но Бюлетин може да е първият таб, който потребителят отваря.
     Топъл кеш връща веднага, без нова заявка. */
  if(!allStoresCache)loadAllStores().then(function(){ if(curBul)renderBulletin(); });
  if(!reportableStoresCache)loadReportableStores().then(function(){ if(curBul)renderBulletin(); });
  /* Зареждаме бюлетина ПЪРВО (за да знаем неговата седмица/година), после промоциите
     филтрирани спрямо ТАЗИ седмица - за да са "автономни" за всяка седмица, не спрямо
     реалната дата днес. Рекъринг задачите вървят паралелно, не зависят от седмицата. */
  loadBulletinList().then(function(){
    /* q се сглобява ТУК, не преди loadBulletinList() - bulListCache се пълни
       точно в неговия .then, така че по-рано кешът е празен (първо отваряне)
       или от предишното зареждане. */
    var q;
    if(bulSelectedId){
      q='id=eq.'+bulSelectedId;
    } else {
      /* Подразбиращият се бюлетин е този, който покрива ДНЕШНАТА дата - управителят
         отваря това, по което работи днес, а не последния публикуван. */
      var nowWk=weekNum(new Date()), nowYr=new Date().getFullYear();
      var curWeek=bulListCache.filter(function(b){
        return b.week_number===nowWk&&b.year===nowYr&&(canEdit()||b.status==='published');
      })[0];
      /* Резерва: няма бюлетин за текущата седмица - последният по created_at,
         точно както беше досега. */
      q=curWeek?('id=eq.'+curWeek.id)
        :(canEdit()?'order=created_at.desc&limit=1':'status=eq.published&order=created_at.desc&limit=1');
    }
    return sbGet('bulletins',q);
  }).then(function(data){
    curBul=(Array.isArray(data)&&data.length)?data[0]:null;
    if(!curBul){bulPromotions=[];renderBulEmpty();return null;}
    if(typeof curBul.content==='string'){try{curBul.content=JSON.parse(curBul.content);}catch(e){curBul.content={};}}
    initCols();
    var promoQ=promoQueryForCurBul();
    return Promise.all([
      sbGet('bulletin_promotions',promoQ).catch(function(){return [];}),
      sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').catch(function(){return [];})
    ]);
  }).then(function(results){
    if(!results)return; /* curBul беше null - вече показахме renderBulEmpty() по-горе */
    bulPromotions=Array.isArray(results[0])?results[0]:[];
    recurringTasks=Array.isArray(results[1])?results[1]:[];
    sbGet('bulletin_tasks','bulletin_id=eq.'+curBul.id+'&order=sort_order.asc,due_date.asc').then(function(t){
      bulTasks=Array.isArray(t)?t:[];
      if(!bulTasks.length){
        bulComps=[];subtaskComps=[];recurringComps=[];
        renderBulletin();autoCheckBulletinNotifications();return;
      }
      var ids=bulTasks.map(function(x){return x.id;}).join(',');
      var cq='task_id=in.('+ids+')'+(isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name));
      sbGet('task_completions',cq).then(function(c){
        bulComps=Array.isArray(c)?c:[];
        var storeF=isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name);
        sbGet('subtask_completions','select=*'+storeF).then(function(sc){
          subtaskComps=Array.isArray(sc)?sc:[];
          var rq='recurring_task_id=not.is.null'+(isGlobal()?'':'&store_name=eq.'+encodeURIComponent(currentUser.store_name));
          fetch(API+'/task_completions?'+rq,{headers:H}).then(function(r){
            if(!r.ok){
              return r.text().then(function(errText){
                console.error('task_completions (recurring) GET грешка:', errText);
                toast('Грешка при постоянните задачи: '+errText.slice(0,150),'#dc2626');
                recurringComps=[];renderBulletin();autoCheckBulletinNotifications();
              });
            }
            return r.json().then(function(rc){
              recurringComps=Array.isArray(rc)?rc:[];
              renderBulletin();autoCheckBulletinNotifications();
            });
          }).catch(function(){recurringComps=[];renderBulletin();autoCheckBulletinNotifications();});
        }).catch(function(){subtaskComps=[];renderBulletin();autoCheckBulletinNotifications();});
      }).catch(function(){bulComps=[];subtaskComps=[];recurringComps=[];renderBulletin();autoCheckBulletinNotifications();});
    }).catch(function(){bulTasks=[];bulComps=[];renderBulletin();autoCheckBulletinNotifications();});
  }).catch(function(){
    var wrap=document.getElementById('mod-bulletin');
    if(wrap)wrap.innerHTML='<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
  });
}

function initCols(){
  var c=curBul.content||{};
  if(!c.columns)c.columns={trade:[],warehouse:[],admin:[]};
  DCOLS.forEach(function(k){if(!c.columns[k])c.columns[k]=[];});
  if(!c.calendar)c.calendar={};
  DKEYS.forEach(function(k){if(!c.calendar[k])c.calendar[k]=[];});
  curBul.content=c;
}

/* SAVE */
function schedSave(){clearTimeout(bulSaveT);bulSaveT=setTimeout(doSave,900);}
function doSave(){
  if(!curBul)return;
  sbPatch('bulletins','id=eq.'+curBul.id,{content:curBul.content}).then(function(r){
    if(r.ok)showBulToast('💾 Запазено');
  });
}
function showBulToast(msg){
  var t=document.getElementById('bul-toast');
  if(!t)return; t.textContent=msg; t.style.opacity='1';
  setTimeout(function(){t.style.opacity='0';},2000);
}

/* ROUTER */
function renderBulletin(){
  if(bulMode==='analysis'){renderBulAnalysis();return;}
  try {
    renderBulView();
  } catch(e) {
    console.error('renderBulView error:', e);
    var w = document.getElementById('mod-bulletin');
    if(w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка: ' + e.message + '</div>';
  }
}
function setBulView(){bulMode='view';renderBulletin();}
function setBulEdit(){bulMode='edit';renderBulletin();}
function setBulAnalysis(){bulMode='analysis';renderBulletin();}

/* CSS */
var BULCSS = '<style>' +
'.bbtn{background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;}' +
'.bcard{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:14px;}' +
'.bsec{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:10px;}' +
'.blk{border:1.5px solid #e2e8f0;border-radius:8px;padding:9px 11px;margin-bottom:6px;background:#fff;position:relative;}' +
'.blk:hover{border-color:#94a3b8;}' +
'.blk[draggable=true]{cursor:grab;}' +
'.blk.drag-hi{border-color:#2563eb;background:#eff6ff;}' +
'.blk-del{position:absolute;right:4px;top:4px;width:20px;height:20px;border:none;background:#fee2e2;color:#dc2626;border-radius:50%;font-size:11px;cursor:pointer;display:none;align-items:center;justify-content:center;font-weight:700;}' +
'.blk:hover .blk-del{display:flex;}' +
'.blk-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px;}' +
'.blk-ta{width:100%;border:none;background:none;font-family:DM Sans,sans-serif;font-size:13px;color:#0f172a;resize:none;outline:none;}' +
'.addblk{width:100%;padding:7px;border:1.5px dashed #cbd5e1;border-radius:7px;background:none;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;margin-top:6px;}' +
'.addblk:hover{border-color:#64748b;background:#f8fafc;color:#374151;}' +
'.bov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;}' +
'.bov.open{display:flex;}' +
'.bmod{background:#fff;border-radius:14px;padding:22px;width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;}' +
'</style>';

/* HEADER */
function bulHdr(isDraft){
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var yr=curBul?curBul.year:new Date().getFullYear();
  return '<div id="bul-toast" style="position:fixed;bottom:20px;right:20px;background:#16a34a;color:#fff;padding:7px 16px;border-radius:40px;font-size:12px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;"></div>' +
  '<div style="background:#0f172a;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;position:sticky;top:58px;z-index:99;box-shadow:0 2px 10px rgba(0,0,0,.4);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<div style="font-size:17px;font-weight:600;color:#fff;">Т-Бюлетин <span style="color:#64748b;font-weight:400;">| Седмица '+wk+'</span></div>' +
      '<span style="font-family:DM Mono,monospace;font-size:11px;color:#94a3b8;padding:3px 10px;background:#1e293b;border-radius:40px;border:1px solid #334155;">С'+wk+' · '+yr+'</span>' +
      (isDraft ? '<span style="background:#f59e0b;color:#78350f;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;">✏ Чернова</span>' : '') +
      bulletinSwitcherHtml() +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      (canEdit() && bulMode!=='edit' ? '<button onclick="setBulEdit()" class="bbtn">✏️ Редактирай</button>' : '') +
      (canEdit() && bulMode==='edit'  ? '<button onclick="setBulView()" class="bbtn">👁 Преглед</button>' : '') +
      (canEdit() ? '<button onclick="setBulAnalysis()" class="bbtn">📊 Анализ</button>' : '') +
      (canEdit()||currentUser.role==='manager' ? '<button onclick="openPrintMenu()" class="bbtn">🖨 Печат</button>' : '') +
      (canEdit() && isDraft ? '<button onclick="publishBul()" style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">📤 Публикувай</button>' : '') +
      (canEdit() ? '<button onclick="openPushMenu()" style="background:#7c3aed;color:#fff;border:none;padding:6px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Нотификации</button>' : '') +
      (canEdit() ? '<button onclick="newBulletin()" style="background:#2563eb;color:#fff;border:none;padding:6px 12px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;">+ Нов</button>' : '') +
    '</div>' +
  '</div>';
}

/* ════════ VIEW MODE ════════════════════════════════════════ */

function bulSetDept(dk) {
  bulActiveDept = dk;
  renderBulletin();
}

/* Преизползва printSection() (правилната печатна логика с mm-размери за
   снимките), вместо да копира сурово екранното съдържание - старото
   поведение показваше винаги малките 52px екранни миниатюри, независимо
   от избрания размер за печат. */
function bulPrintDept(dk) {
  printSection(dk);
}

function renderBulView(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  var c=curBul.content;
  var wk=curBul.week_number; var yr=curBul.year;
  var days=weekDays(wk,yr);
  var isDraft=curBul.status==='draft';
  var html=bulHdr(isDraft)+BULCSS+'<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;" id="bul-body">';
  html+=bulWeekBannerHtml();

  /* Important */
  var imp=[];
  DCOLS.forEach(function(k){(c.columns[k]||[]).forEach(function(b){if(b.type==='important')imp.push(b);});});
  if(imp.length){
    html+='<div class="bcard" id="sec-important"><div class="bsec">⭐ Важно тази седмица</div><div style="display:flex;flex-wrap:wrap;gap:8px;">';
    imp.forEach(function(b){
      var ug=b.urgency||'info';
      var cl=({ok:'#f0fdf4:#bbf7d0:#166534',warn:'#fffbeb:#fde68a:#92400e',urgent:'#fff1f2:#fecaca:#991b1b',info:'#eff6ff:#bfdbfe:#1e40af'}[ug]||'#eff6ff:#bfdbfe:#1e40af').split(':');
      html+='<div style="background:'+cl[0]+';border:1px solid '+cl[1]+';border-radius:7px;padding:9px 12px;flex:1;min-width:180px;">';
      html+='<div style="font-size:12px;font-weight:600;color:'+cl[2]+';">'+esc(b.title||'')+'</div>';
      if(b.sub)html+='<div style="font-size:11px;color:'+cl[2]+';opacity:.75;">'+esc(b.sub)+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
  }

  /* Промоции */
  html+=renderPromotionsSection();

  /* Calendar */
  html+='<div class="bcard" id="sec-calendar">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html+='<div style="font-size:14px;font-weight:600;">📅 Седмичен календар — С'+wk+' · '+yr+'</div>';
  if(canEdit())html+='<button onclick="openCalModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">+ Добави събитие</button>';
  html+='</div><div style="display:grid;grid-template-columns:repeat(7,minmax(155px,1fr));gap:8px;overflow-x:auto;">';
  DKEYS.forEach(function(key,i){
    var isToday=toLocalISO(days[i])===today();
    var dateStr=toLocalISO(days[i]);
    var store=currentUser&&currentUser.store_name;
    /* Обикновени задачи за деня - зачитаме target_stores, точно както в
       главния списък: магазин вижда само своите/общите, офисът вижда всичко. */
    var regularForDay=bulTasks.filter(function(t){
      if(!taskIsDueOnDate(t,dateStr))return false;
      return isGlobal()||!t.target_stores||!t.target_stores.length||(store&&t.target_stores.indexOf(store)>=0);
    });
    /* Постоянни задачи, важащи за ТОЗИ ден от седмицата (не само "днес") */
    var recurringForDay=recurringTasks.filter(function(t){
      if(!recurringIsDueOnWeekday(t,i))return false;
      return isGlobal()||!t.target_stores||!t.target_stores.length||(store&&t.target_stores.indexOf(store)>=0);
    });
    var manualAll=(c.calendar[key]||[]).map(function(e,ei){return {e:e,idx:ei};});

    html+='<div style="border:1px solid '+(isToday?'#2563eb':'#e2e8f0')+';border-radius:8px;padding:12px 14px;min-height:100px;background:'+(isToday?'#eff6ff':'#fff')+'">';
    html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.02em;">'+DNAMES[i]+'</div>';
    html+='<div style="font-family:DM Mono,monospace;font-size:23px;font-weight:600;color:'+(isToday?'#2563eb':'#0f172a')+';margin-bottom:8px;">'+fmtD(days[i])+'</div>';

    var hasAnything=false;
    DCOLS.forEach(function(dk){
      var dept=DEPTS[dk];
      var regItems=regularForDay.filter(function(t){return t.department===dk;});
      var recItems=recurringForDay.filter(function(t){return t.department===dk;});
      var manItems=manualAll.filter(function(mi){return mi.e.dept===dk;});
      if(!regItems.length&&!recItems.length&&!manItems.length)return;
      hasAnything=true;
      html+='<div style="margin-bottom:8px;">';
      html+='<div style="font-size:10.5px;font-weight:800;text-transform:uppercase;color:'+dept.color+';letter-spacing:.03em;margin-bottom:4px;">'+dept.icon+' '+dept.label+'</div>';
      regItems.forEach(function(t){
        html+='<div style="display:flex;gap:5px;padding:2px 0;align-items:flex-start;">';
        if(isGlobal()){
          html+='<span style="font-size:11px;flex-shrink:0;margin-top:1px;" title="Бюлетин">📰</span>';
          html+='<span style="font-size:13px;font-weight:500;flex:1;line-height:1.35;">'+esc(t.title||'')+(taskIsMultiDay(t)?'<span style="font-size:9px;color:#94a3b8;font-weight:400;"> ('+taskDueLabel(t)+')</span>':'')+'</span>';
          html+=calItemStatusHtml(t.id,'regular',t.target_stores,dateStr);
        } else {
          var doneReg=store&&bulComps.some(function(cc){return cc.task_id===t.id&&cc.store_name===store&&cc.status==='done'&&(cc.completion_date||null)===dateStr;});
          html+='<input type="checkbox" '+(doneReg?'checked ':'')+'data-tid="'+t.id+'" data-cdate="'+dateStr+'" data-linked="'+(t.linked_module||'')+'" onchange="bulCheckboxChanged(this)"'+bulLockAttr(dateStr,t.linked_module)+' style="margin-top:2px;width:15px;height:15px;cursor:pointer;flex-shrink:0;accent-color:'+dept.color+';'+bulLockStyle(dateStr,t.linked_module)+'">';
          html+='<span style="font-size:13px;font-weight:500;flex:1;line-height:1.35;'+(doneReg?'color:#94a3b8;text-decoration:line-through;':'')+'">'+esc(t.title||'')+'</span>';
        }
        html+='</div>';
        if(t.linked_module&&linkedModuleAllowed(t.linked_module)){
          var lbl=linkedModuleLabel(t.linked_module);
          if(lbl)html+='<button data-mod="'+t.linked_module+'" onclick="showModule(this.dataset.mod)" style="margin:2px 0 4px 16px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:4px;padding:2px 8px;font-size:10.5px;cursor:pointer;">'+esc(lbl)+' →</button>';
        }
      });
      recItems.forEach(function(t){
        var recDateScoped=recurringIsDateScoped(t);
        var recCdate=recDateScoped?dateStr:null;
        /* Прозорец: отметка на КОЙ ДА Е ден от прозореца затваря задачата за
           цялата седмица. Чекбоксът не се крие на останалите дни (правило
           11) — показва се отметнат и заключен, с датата на реалното
           изпълнение. Няма ли отметка, дните се държат както досега:
           отключен е само днешният, през bulDateLockReason(). */
        var recWinComp=recurringWindowComp(t,store,days);
        html+='<div style="display:flex;gap:5px;padding:2px 0;align-items:flex-start;">';
        if(isGlobal()){
          html+='<span style="font-size:11px;flex-shrink:0;margin-top:1px;" title="Постоянна задача">🔁</span>';
          html+='<span style="font-size:13px;font-weight:500;flex:1;line-height:1.35;">'+esc(t.title||'')+'</span>';
          html+=calItemStatusHtml(t.id,'recurring',t.target_stores,recCdate,recurringIsWindow(t)?recurringWindowDatesInWeek(t,days):null);
        } else {
          var doneRec=recWinComp?true:(store&&recurringComps.some(function(cc){return cc.recurring_task_id===t.id&&cc.store_name===store&&cc.status==='done'&&(cc.completion_date||null)===recCdate;}));
          html+='<input type="checkbox" '+(doneRec?'checked ':'')+'data-rtid="'+t.id+'" data-cdate="'+(recCdate||'')+'" data-linked="'+(t.linked_module||'')+'" onchange="bulRecurringCheckboxChanged(this)"'+(recWinComp?recurringWindowDoneAttr(recWinComp):bulLockAttr(recCdate,t.linked_module))+' style="margin-top:2px;width:15px;height:15px;cursor:pointer;flex-shrink:0;accent-color:'+dept.color+';'+(recWinComp?'opacity:.45;cursor:not-allowed;':bulLockStyle(recCdate,t.linked_module))+'">';
          html+='<span style="font-size:13px;font-weight:500;flex:1;line-height:1.35;'+(doneRec?'color:#94a3b8;text-decoration:line-through;':'')+'">'+esc(t.title||'')+'</span>';
        }
        html+='</div>';
        if(t.linked_module&&linkedModuleAllowed(t.linked_module)){
          var lblRec=linkedModuleLabel(t.linked_module);
          if(lblRec)html+='<button data-mod="'+t.linked_module+'" onclick="showModule(this.dataset.mod)" style="margin:2px 0 4px 16px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:4px;padding:2px 8px;font-size:10.5px;cursor:pointer;">'+esc(lblRec)+' →</button>';
        }
      });
      manItems.forEach(function(mi){
        var e=mi.e,ei=mi.idx;
        html+='<div style="padding:3px 0;">';
        html+='<div style="display:flex;gap:5px;align-items:flex-start;">';
        html+='<span style="font-size:11px;flex-shrink:0;margin-top:1px;" title="Друг модул">🚚</span>';
        html+='<span style="font-size:13px;flex:1;line-height:1.35;">'+esc(e.title||'')+'</span>';
        if(canEdit())html+='<button data-key="'+key+'" data-idx="'+ei+'" onclick="bulRmCal(this)" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:13px;padding:0;line-height:1;">✕</button>';
        html+='</div>';
        html+=renderCalEntryAttachments(e,key,ei);
        html+='</div>';
      });
      html+='</div>';
    });

    /* Ръчни събития без конкретен отдел ("general") - отделен блок, както досега */
    var generalItems=manualAll.filter(function(mi){return DCOLS.indexOf(mi.e.dept)<0;});
    if(generalItems.length){
      hasAnything=true;
      generalItems.forEach(function(mi){
        var e=mi.e,ei=mi.idx;
        html+='<div style="padding:3px 0;">';
        html+='<div style="display:flex;gap:5px;align-items:flex-start;">';
        html+='<span style="width:7px;height:7px;border-radius:50%;background:#64748b;flex-shrink:0;margin-top:5px;"></span>';
        html+='<span style="font-size:13px;flex:1;line-height:1.35;">'+esc(e.title||'')+'</span>';
        if(canEdit())html+='<button data-key="'+key+'" data-idx="'+ei+'" onclick="bulRmCal(this)" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:13px;padding:0;line-height:1;">✕</button>';
        html+='</div>';
        html+=renderCalEntryAttachments(e,key,ei);
        html+='</div>';
      });
    }

    if(!hasAnything)html+='<div style="font-size:12.5px;color:#cbd5e1;font-style:italic;margin-top:4px;">Свободен</div>';
    if(canEdit())html+='<button data-key="'+key+'" onclick="bulOpenCal(this)" style="width:100%;margin-top:6px;padding:4px;border:1px dashed #cbd5e1;border-radius:5px;background:none;color:#94a3b8;font-size:11.5px;cursor:pointer;font-family:inherit;">+ Добави</button>';
    html+='</div>';
  });
  html+='</div></div>';


  /* Задачи панел */
  html += renderTasksPanel();

  /* ── ОТДЕЛНИ ТАБОВЕ ПО ОТДЕЛ ── */
  /* Таб навигация */
  html+='<div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:0;border-bottom:2px solid #e2e8f0;">';
  DCOLS.forEach(function(dk){
    var d=DEPTS[dk];
    var isAct=dk===bulActiveDept;
    html+='<button data-dk="'+dk+'" onclick="bulSetDept(this.dataset.dk)" id="dtab-'+dk+'" ondragover="taskTabDragOver(event,this)" ondragleave="taskTabDragLeave(this)" ondrop="taskTabDrop(event,this)" style="'+
      'border:none;background:'+(isAct?d.hdr:'#f8fafc')+';color:'+(isAct?'#fff':d.color)+';'+
      'padding:10px 20px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;'+
      'border-radius:8px 8px 0 0;border-bottom:none;transition:all .15s;">'+
      d.icon+' '+d.label+
    '</button>';
  });
  /* Принтирай бутон вдясно */
  html+='<div style="margin-left:auto;padding-bottom:4px;">';
  DCOLS.forEach(function(dk){
    var d=DEPTS[dk];
    var isAct=dk===bulActiveDept;
    if(isAct){
      html+='<button onclick="bulPrintDept(\'' +dk+ '\')" style="border:1px solid '+d.hdr+';background:#fff;color:'+d.color+';border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🖨 Принтирай секцията</button>';
    }
  });
  html+='</div>';
  html+='</div>';

  /* Съдържание на активния таб */
  DCOLS.forEach(function(dk){
    var dept=DEPTS[dk];
    var blocks=(c.columns[dk]||[]).filter(function(b){return b.type!=='task'&&b.type!=='important';});
    var dTasks=bulTasks.filter(function(t){return t.department===dk;});
    /* Магазин вижда само задачи БЕЗ target_stores (= за всички) или такива,
       в които изрично е посочен; глобалните роли (admin/accounting/logistics)
       виждат винаги всичко, за да могат да управляват. */
    (function(){
      var storeForFilter=currentUser&&currentUser.store_name;
      dTasks=dTasks.filter(function(t){
        return isGlobal() || !t.target_stores || !t.target_stores.length || (storeForFilter && t.target_stores.indexOf(storeForFilter)>=0);
      });
    })();
    var isMyDept=!isGlobal()&&myDept()===dk;
    var isAct=dk===bulActiveDept;
    html+='<div id="dept-panel-'+dk+'" style="display:'+(isAct?'block':'none')+';">';
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:16px 20px;min-height:200px;">';
    /* Задачи */
    if(dTasks.length){
      html+='<div style="margin-bottom:14px;">';
      html+='<div style="font-size:12px;font-weight:700;color:'+dept.color+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">✅ Задачи</div>';
      var store=currentUser&&currentUser.store_name;
      dTasks.forEach(function(t){
        var isMulti=taskIsMultiDay(t);
        var singleDate=isMulti?null:(taskDueDates(t)[0]||null);
        var done=store&&!isMulti&&bulComps.some(function(cc){return cc.task_id===t.id&&cc.store_name===store&&cc.status==='done'&&(cc.completion_date||null)===singleDate;});
        var postponed=store&&!isMulti&&bulComps.some(function(cc){return cc.task_id===t.id&&cc.store_name===store&&cc.status==='postponed'&&(cc.completion_date||null)===singleDate;});
        var compObj=store&&!isMulti&&bulComps.find(function(cc){return cc.task_id===t.id&&cc.store_name===store&&(cc.completion_date||null)===singleDate;});
        var due=singleDate?new Date(singleDate+'T00:00:00'):null;
        var today=new Date();today.setHours(0,0,0,0);
        var diff=due?Math.ceil((due-today)/86400000):null;
        var dueColor=diff===null?'#94a3b8':diff<0?'#dc2626':diff<=2?'#d97706':'#94a3b8';
        var deptTasksForNav=bulTasks.filter(function(x){return x.department===t.department;});
        var taskIdxInDept=deptTasksForNav.findIndex(function(x){return String(x.id)===String(t.id);});
        var isFirstTask=taskIdxInDept===0, isLastTask=taskIdxInDept===deptTasksForNav.length-1;
        var titleColor=done?'#94a3b8':postponed?'#b45309':'#0f172a';
        html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;"'+(canEdit()?' draggable="true" data-tid="'+t.id+'" ondragstart="taskDragStart(event,this)" ondragend="taskDragEnd(this)"':'')+'>';
        if(canEdit()){
          html+='<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;margin-top:1px;">'+
            '<button data-task-id="'+t.id+'" onclick="taskMoveUp(this.dataset.taskId)" '+(isFirstTask?'disabled':'')+' style="border:1px solid #e2e8f0;background:'+(isFirstTask?'#f8fafc':'#fff')+';color:'+(isFirstTask?'#cbd5e1':'#64748b')+';border-radius:3px;width:16px;height:14px;font-size:9px;line-height:1;cursor:'+(isFirstTask?'default':'pointer')+';padding:0;">▲</button>'+
            '<button data-task-id="'+t.id+'" onclick="taskMoveDown(this.dataset.taskId)" '+(isLastTask?'disabled':'')+' style="border:1px solid #e2e8f0;background:'+(isLastTask?'#f8fafc':'#fff')+';color:'+(isLastTask?'#cbd5e1':'#64748b')+';border-radius:3px;width:16px;height:14px;font-size:9px;line-height:1;cursor:'+(isLastTask?'default':'pointer')+';padding:0;">▼</button>'+
            '</div>';
        }
        if(isMulti){
          html+='<div style="width:16px;flex-shrink:0;margin-top:2px;text-align:center;font-size:12px;" title="Многодневна — отмятай в Седмичен календар">📅</div>';
        } else {
          html+='<input type="checkbox" '+(done?'checked ':'')+' data-tid="'+t.id+'" data-cdate="'+(singleDate||'')+'" data-linked="'+(t.linked_module||'')+'" onchange="bulCheckboxChanged(this)"'+bulLockAttr(singleDate,t.linked_module)+' style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:'+dept.color+';flex-shrink:0;'+bulLockStyle(singleDate,t.linked_module)+'">';
        }
        html+='<div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><div style="font-size:13px;font-weight:500;color:'+titleColor+';'+(done?'text-decoration:line-through;':'')+'">'+esc(t.title||'')+'</div>'+taskTypeBadgeHtml(t.task_type,t.id,'regular',!isGlobal()&&!isMulti&&!done,singleDate)+(postponed?'<span style="font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:#fff7ed;color:#b45309;border:1px solid #fed7aa;white-space:nowrap;">⏱ Отложена</span>':'')+'</div>';
        if(t.description)html+='<div style="font-size:11px;color:#94a3b8;overflow-wrap:break-word;">'+linkify(t.description)+'</div>';
        if(isMulti){
          var multiDates=taskDueDates(t);
          html+='<div style="font-size:10px;color:#7c3aed;margin-top:2px;">📅 Дни: '+taskDueLabel(t)+'</div>';
          if(!isGlobal()&&store){
            var doneDaysCount=multiDates.filter(function(d){return bulComps.some(function(cc){return cc.task_id===t.id&&cc.store_name===store&&cc.status==='done'&&(cc.completion_date||null)===d;});}).length;
            html+='<div style="font-size:10px;color:#7c3aed;margin-top:2px;">✅ '+doneDaysCount+'/'+multiDates.length+' дни отметнати — отмятай в 📅 Седмичен календар по-горе</div>';
          } else if(isGlobal()){
            html+='<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Живи бройки по дни виж в 📅 Седмичен календар по-горе</div>';
          }
        } else if(due){
          html+='<div style="font-size:10px;color:'+dueColor+';margin-top:2px;">📅 Срок: '+due.toLocaleDateString('bg-BG')+(diff<0?' ⚠️':diff===0?' (Днес!)':diff<=2?' ('+diff+' дни)':'')+"</div>";
        }
        if(isGlobal()&&t.target_stores&&t.target_stores.length)html+='<div style="font-size:10px;color:#7c3aed;margin-top:2px;">🏬 Само за: '+t.target_stores.map(esc).join(', ')+'</div>';
        if(isGlobal()&&t.created_by)html+='<div style="font-size:10px;color:#94a3b8;margin-top:2px;">👤 Поставена от: '+esc(t.created_by)+'</div>';
        if(compObj&&(compObj.comment||(compObj.photos&&compObj.photos.length)))html+=renderCompletionExtras(compObj);
        html+=renderTaskAttachments(t);
        html+=renderSubtasks(t.id, dk);
        html+='</div>';
        if(!isGlobal()&&!isMulti&&!done){
          html+='<div style="flex-shrink:0;">';
          if(postponed)html+='<button data-task-id="'+t.id+'" data-cdate="'+(singleDate||'')+'" onclick="cancelPostpone(this.dataset.taskId,\'regular\',this.dataset.cdate||null)" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#7c3aed;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;white-space:nowrap;">↩ Отмени</button>';
          else html+='<button data-task-id="'+t.id+'" data-cdate="'+(singleDate||'')+'" onclick="openPostponeModal(this.dataset.taskId,\'regular\',this.dataset.cdate||null)" style="border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;white-space:nowrap;">⏱ Отложи</button>';
          html+='</div>';
        }
        if(canEdit()){html+='<div style="display:flex;gap:4px;flex-shrink:0;">'
          +'<button data-task-id="'+t.id+'" onclick="openEditTaskModal(this.dataset.taskId)" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#2563eb;">✏️</button>'
          +'<button data-task-id="'+t.id+'" data-etitle="'+esc(t.title)+'" onclick="openNotifyScheduleModal(\'task\',this.dataset.taskId,this.dataset.etitle)" style="border:1px solid #fde68a;background:#fffbeb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#d97706;">🔔</button>'
          +'<button data-task-id="'+t.id+'" onclick="bulDelTask(this)" style="border:1px solid #fecaca;background:#fff5f5;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#dc2626;">✕</button>'
          +'</div>';}
        html+='</div>';
      });
      html+='</div>';
    }
    /* Постоянни задачи в dept panel */
    html += renderRecurringTasks(dk);
    /* Блокове */
    if(!blocks.length&&!dTasks.length){
      html+='<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px;">Няма информация за тази секция тази седмица.</div>';
    } else {
      blocks.forEach(function(b,i){html+=editBlock(b,dk,i);});
    }
    if(canEdit()){
      html+='<div style="display:flex;gap:8px;margin-top:8px;">';
      html+='<button class="addblk" data-dept="'+dk+'" onclick="bulOpenPicker(this)">+ Добави блок</button>';
      html+='<button onclick="openTaskModalForDept(\'' +dk+ '\')" style="border:1px dashed #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">✅ + Добави задача</button>';
      html+='</div>';
    }
    html+='</div></div>';
  });

  html+=blockPickerHtml()+taskModalHtml()+calModalHtml()+pushMenuHtml()+printMenuHtml();
  wrap.innerHTML=html;
}



/* Edit block */
/* Превръща http(s):// линкове в текста в кликаеми <a> тагове (текстът вече е escape-нат за безопасност) */
function linkify(text){
  var escaped=esc(text||'');
  return escaped.replace(/(https?:\/\/[^\s<]+)/g,function(url){
    var trail='';
    var m=url.match(/[.,;:!?)]+$/);
    if(m){trail=m[0]; url=url.slice(0,url.length-trail.length);}
    return '<a href="'+url+'" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;word-break:break-all;">'+url+'</a>'+trail;
  });
}

/* ═══════ ДОПЪЛНИТЕЛНА СНИМКА/ФАЙЛ В ЕДИН БЛОК (заедно с текста му) ══════ */
function renderBlockExtras(b,dk){
  var isEditing=canEdit()&&bulMode==='edit';
  var h='';
  var hasExtra=b.image_url||b.file_url;
  if(hasExtra)h+='<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">';
  if(b.image_url){
    h+='<div style="position:relative;">';
    h+='<img src="'+b.image_url+'" style="max-width:140px;max-height:100px;border-radius:6px;border:1px solid #e2e8f0;display:block;" onerror="bulImgErr(this)">';
    if(isEditing)h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulRemoveBlockImage(this.dataset.col,this.dataset.id)" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:10px;cursor:pointer;">✕</button>';
    h+='</div>';
  }
  if(b.file_url){
    h+='<div style="position:relative;">';
    h+='<a href="'+b.file_url+'" target="_blank" style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;">📎 '+esc(b.file_name||'Файл')+'</a>';
    if(isEditing)h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulRemoveBlockFile(this.dataset.col,this.dataset.id)" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:10px;cursor:pointer;">✕</button>';
    h+='</div>';
  }
  if(hasExtra)h+='</div>';
  if(isEditing){
    h+='<div style="display:flex;gap:6px;margin-top:6px;">';
    if(!b.image_url)h+='<label style="display:inline-flex;align-items:center;gap:3px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">📷 + Снимка<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadBlockImage(this)"></label>';
    if(!b.file_url)h+='<label style="display:inline-flex;align-items:center;gap:3px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">📎 + Файл<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadBlockFile(this)"></label>';
    h+='</div>';
  }
  return h;
}
function bulUploadBlockImage(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  var path='bulletin/'+curBul.id+'/'+id+'_extra_'+Date.now()+'.'+ext;
  showBulToast('⏳ Качване на снимка...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.image_url=pub; schedSave(); renderBulletin(); toast('✅ Снимката е добавена!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function bulRemoveBlockImage(col,id){
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.image_url=''; schedSave(); renderBulletin();}
}
function bulUploadBlockFile(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var path='bulletin/'+curBul.id+'/'+id+'_extrafile_'+Date.now()+'.'+ext;
  showBulToast('⏳ Качване на файл...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.file_url=pub; b.file_name=file.name; schedSave(); renderBulletin(); toast('✅ Файлът е добавен!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function bulRemoveBlockFile(col,id){
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.file_url=''; b.file_name=''; schedSave(); renderBulletin();}
}

function editBlock(b,dk,i){
  var tl={text:'📝 Текст',alert:'🚨 Алерт',list:'📋 Списък',image:'📷 Снимка',file:'📎 Файл',divider:'— Разделител',important:'⭐ Важно'}[b.type]||b.type;
  var isEditing=canEdit()&&bulMode==='edit';
  var h='<div class="blk" id="eb-'+b.id+'" '+(isEditing?'draggable="true" ':'')+'data-col="'+dk+'" data-idx="'+i+'"'+(isEditing?' ondragstart="bulDragStart(this)" ondragover="bulDragOver(this)" ondragleave="bulDragLeave(this)" ondrop="bulDropBlock(this)"':'')+'>';
  if(canEdit())h+='<button class="blk-del" data-col="'+dk+'" data-id="'+b.id+'" onclick="bulDelBlock(this)">✕</button>';
  h+='<div class="blk-type">'+tl+'</div>';

  if(b.type==='text'){
    if(isEditing){
      h+='<textarea class="blk-ta" rows="3" placeholder="Въведи текст... (линковете стават кликаеми в изглед за преглед)" data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
    }else{
      h+='<div style="font-size:13px;color:#0f172a;white-space:pre-wrap;line-height:1.5;">'+linkify(b.content||'')+'</div>';
    }
    h+=renderBlockExtras(b,dk);
  }else if(b.type==='divider'){
    h+='<hr style="border:none;border-top:1px solid #e2e8f0;">';
  }else if(b.type==='list'){
    if(isEditing){
      h+='<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Всеки ред = нова точка (линковете стават кликаеми в изглед за преглед)</div>';
      h+='<textarea class="blk-ta" rows="4" placeholder="Ред 1..." data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
    }else{
      var items=(b.content||'').split('\n').filter(Boolean);
      h+='<ul style="margin:0;padding-left:18px;">'+items.map(function(it){return '<li style="font-size:13px;color:#0f172a;padding:2px 0;">'+linkify(it)+'</li>';}).join('')+'</ul>';
    }
    h+=renderBlockExtras(b,dk);
  }else if(b.type==='alert'){
    if(isEditing){
      var cOpts=[['red','🔴 Червено'],['amb','🟡 Жълто'],['grn','🟢 Зелено'],['blu','🔵 Синьо'],['pur','🟣 Лилаво']];
      h+='<select data-col="'+dk+'" data-id="'+b.id+'" data-field="color" onchange="bulSetBlk(this)" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;width:100%;">';
      cOpts.forEach(function(o){h+='<option value="'+o[0]+'"'+(b.color===o[0]?' selected':'')+'>'+o[1]+'</option>';});
      h+='</select><br>';
      h+='<input placeholder="Заглавие (по избор)" value="'+esc(b.label||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="label" oninput="bulSetBlk(this)" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;margin-bottom:4px;font-family:inherit;box-sizing:border-box;"><br>';
      h+='<textarea class="blk-ta" rows="2" placeholder="Съдържание... (линковете стават кликаеми в изглед за преглед)" data-col="'+dk+'" data-id="'+b.id+'" data-field="content" oninput="bulSetBlk(this)">'+esc(b.content||'')+'</textarea>';
    }else{
      var aC={red:'#fff1f2:#dc2626:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#16a34a:#14532d',blu:'#eff6ff:#2563eb:#1e40af',pur:'#f5f3ff:#8b5cf6:#4c1d95'}[b.color||'blu']||'#eff6ff:#2563eb:#1e40af';
      var aC2=aC.split(':');
      h+='<div style="background:'+aC2[0]+';border-left:3px solid '+aC2[1]+';color:'+aC2[2]+';border-radius:0 6px 6px 0;padding:8px 12px;">'+
         (b.label?'<div style="font-size:10px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">'+esc(b.label)+'</div>':'')+
         '<div style="font-size:13px;white-space:pre-wrap;">'+linkify(b.content||'')+'</div></div>';
    }
    h+=renderBlockExtras(b,dk);
  }else if(b.type==='important'){
    if(isEditing){
      var uOpts=[['ok','✅ OK'],['warn','⚠️ Предупреждение'],['urgent','🔴 Спешно'],['info','ℹ️ Инфо']];
      h+='<select data-col="'+dk+'" data-id="'+b.id+'" data-field="urgency" onchange="bulSetBlk(this)" style="font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 6px;margin-bottom:5px;background:#f8fafc;width:100%;">';
      uOpts.forEach(function(o){h+='<option value="'+o[0]+'"'+(b.urgency===o[0]?' selected':'')+'>'+o[1]+'</option>';});
      h+='</select><br>';
      h+='<input placeholder="Заглавие *" value="'+esc(b.title||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="title" oninput="bulSetBlk(this)" style="width:100%;font-size:13px;font-weight:600;border:1px solid #e2e8f0;border-radius:5px;padding:5px 7px;margin-bottom:4px;font-family:inherit;box-sizing:border-box;"><br>';
      h+='<input placeholder="Подзаглавие (по избор)" value="'+esc(b.sub||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="sub" oninput="bulSetBlk(this)" style="width:100%;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:4px 7px;font-family:inherit;box-sizing:border-box;"><br>';
      h+='<div style="font-size:10px;color:#f59e0b;margin-top:4px;">⭐ → показва се в секция Важно</div>';
    }else{
      var uC={ok:'#f0fdf4:#16a34a:#14532d',warn:'#fffbeb:#f59e0b:#92400e',urgent:'#fff1f2:#dc2626:#991b1b',info:'#eff6ff:#2563eb:#1e40af'}[b.urgency||'info']||'#eff6ff:#2563eb:#1e40af';
      var uC2=uC.split(':');
      h+='<div style="background:'+uC2[0]+';border-left:3px solid '+uC2[1]+';color:'+uC2[2]+';border-radius:0 6px 6px 0;padding:8px 12px;">'+
         '<div style="font-size:13px;font-weight:700;">'+esc(b.title||'')+'</div>'+
         (b.sub?'<div style="font-size:12px;margin-top:2px;">'+esc(b.sub)+'</div>':'')+'</div>';
    }
  }else if(b.type==='image'){
    if(isEditing){
      var sizes=[['33','1/3'],['50','1/2'],['66','2/3'],['100','Пълна']];
      h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">';
      sizes.forEach(function(s){
        var active=String(b.width||100)===s[0];
        h+='<button data-col="'+dk+'" data-id="'+b.id+'" data-w="'+s[0]+'" onclick="bulSetWidth(this)" style="border:1px solid '+(active?'#2563eb':'#e2e8f0')+';background:'+(active?'#eff6ff':'#fff')+';color:'+(active?'#2563eb':'#64748b')+';border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">'+s[1]+'</button>';
      });
      h+='</div>';
      if(b.url){
        h+='<img src="'+b.url+'" style="width:'+(b.width||100)+'%;border-radius:7px;display:block;margin-bottom:4px;" onerror="bulImgErr(this)">'; 
        h+='<input placeholder="Подпис (по избор)" value="'+esc(b.caption||'')+'" data-col="'+dk+'" data-id="'+b.id+'" data-field="caption" oninput="bulSetBlk(this)" style="width:100%;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;padding:3px 7px;font-family:inherit;box-sizing:border-box;"><br>';
        h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulClearImg(this)" style="margin-top:4px;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕ Смени снимката</button>';
      }else{
        h+='<label style="display:flex;flex-direction:column;align-items:center;padding:18px;border:1.5px dashed #cbd5e1;border-radius:7px;cursor:pointer;color:#64748b;font-size:12px;">';
        h+='<span style="font-size:30px;margin-bottom:6px;">📷</span>Избери снимка (JPG / PNG / GIF)';
        h+='<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadImg(this)">';
        h+='</label>';
      }
    }else{
      if(b.url){
        h+='<img src="'+b.url+'" style="width:'+(b.width||100)+'%;border-radius:7px;display:block;margin-bottom:4px;" onerror="bulImgErr(this)">';
        if(b.caption)h+='<div style="font-size:11px;color:#64748b;">'+esc(b.caption)+'</div>';
      }
    }
  }else if(b.type==='file'){
    if(isEditing){
      if(b.url){
        h+='<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:6px;"><span style="font-size:20px;">📎</span><div style="flex:1;"><div style="font-size:12px;font-weight:500;">'+esc(b.filename||'Файл')+'</div><a href="'+b.url+'" target="_blank" style="font-size:11px;color:#2563eb;">Изтегли</a></div>';
        h+='<button data-col="'+dk+'" data-id="'+b.id+'" onclick="bulClearFile(this)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕</button></div>';
      }else{
        h+='<label style="display:flex;flex-direction:column;align-items:center;padding:18px;border:1.5px dashed #cbd5e1;border-radius:7px;cursor:pointer;color:#64748b;font-size:12px;">';
        h+='<span style="font-size:30px;margin-bottom:6px;">📎</span>Избери файл (PDF / Word / Excel)';
        h+='<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-col="'+dk+'" data-id="'+b.id+'" onchange="bulUploadFile(this)">';
        h+='</label>';
      }
    }else{
      if(b.url){
        h+='<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:6px;"><span style="font-size:20px;">📎</span><div style="flex:1;"><div style="font-size:12px;font-weight:500;">'+esc(b.filename||'Файл')+'</div><a href="'+b.url+'" target="_blank" style="font-size:11px;color:#2563eb;">Изтегли</a></div></div>';
      }
    }
  }
  h+='</div>';
  return h;
}

/* DATA ATTR HANDLERS */
function bulSetBlk(el){
  var col=el.getAttribute('data-col'), id=el.getAttribute('data-id'), field=el.getAttribute('data-field');
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b[field]=el.value; schedSave();}
}
function bulSetWidth(btn){
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id'), w=parseInt(btn.getAttribute('data-w'));
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.width=w; schedSave(); renderBulletin();}
}
function bulClearImg(btn){
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id');
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.url=''; schedSave(); renderBulletin();}
}
function bulClearFile(btn){
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id');
  var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
  if(b){b.url='';b.filename=''; schedSave(); renderBulletin();}
}
function bulDelBlock(btn){
  if(!confirm('Изтрий блока?'))return;
  var col=btn.getAttribute('data-col'), id=btn.getAttribute('data-id');
  curBul.content.columns[col]=curBul.content.columns[col].filter(function(b){return b.id!==id;});
  schedSave(); renderBulletin();
}
function bulDelTask(btn){
  if(!canEdit()){toast('Нямаш права за това действие','#dc2626');return;}
  var id=btn.getAttribute('data-task-id');
  if(!confirm('Изтрий задачата?'))return;
  sbDelete('bulletin_tasks','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('изтриване на задача: НЕ беше изтрита',id,res.error);
      toast('⚠️ Задачата НЕ беше изтрита: '+sbErrMsg(res),'#dc2626');
      loadBulletin(); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadBulletin(); return; }
    toast('Изтрита');loadBulletin();
  });
}
function bulRmCal(btn){
  var key=btn.getAttribute('data-key'), idx=parseInt(btn.getAttribute('data-idx'));
  curBul.content.calendar[key].splice(idx,1); schedSave(); renderBulletin();
}
function bulOpenCal(btn){openCalModal(btn.getAttribute('data-key'));}
function bulOpenPicker(btn){openBlockPicker(btn.getAttribute('data-dept'));}

/* ── Прикачени снимки/файлове към ръчен календарен запис (компактен изглед) ── */
function renderCalEntryAttachments(entry,key,idx){
  var atts=normAttachments(entry.attachments);
  var h='';
  if(atts.length){
    h+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin:2px 0 2px 12px;">';
    atts.forEach(function(a,ai){
      h+='<div style="position:relative;">';
      if(a.type==='image'){
        h+='<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:26px;height:26px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;"></a>';
      }else{
        h+='<a href="'+a.url+'" target="_blank" title="'+esc(a.filename||'Файл')+'" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;text-decoration:none;">📎</a>';
      }
      if(canEdit())h+='<button data-key="'+key+'" data-idx="'+idx+'" data-aidx="'+ai+'" onclick="calRemoveAttachment(this)" style="position:absolute;top:-4px;right:-4px;width:13px;height:13px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(canEdit()){
    h+='<label style="display:inline-flex;align-items:center;gap:3px;margin:2px 0 2px 12px;border:1px dashed #cbd5e1;border-radius:4px;padding:1px 6px;font-size:9.5px;color:#94a3b8;cursor:pointer;">'+
      '📎 +<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-key="'+key+'" data-idx="'+idx+'" onchange="calUploadAttachment(this)"></label>';
  }
  return h;
}
function calUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  var key=input.getAttribute('data-key'), idx=parseInt(input.getAttribute('data-idx'));
  var entry=curBul.content.calendar[key][idx];
  if(!entry)return;
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname='cal_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.'+ext;
  var path='bulletin/'+curBul.id+'/'+fname;
  showBulToast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var atts=normAttachments(entry.attachments).slice();
      atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
      entry.attachments=atts;
      schedSave(); renderBulletin(); toast('✅ Прикачено!');
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function calRemoveAttachment(btn){
  var key=btn.getAttribute('data-key'), idx=parseInt(btn.getAttribute('data-idx')), aidx=parseInt(btn.getAttribute('data-aidx'));
  var entry=curBul.content.calendar[key][idx];
  if(!entry)return;
  var atts=normAttachments(entry.attachments).slice();
  atts.splice(aidx,1);
  entry.attachments=atts;
  schedSave(); renderBulletin();
}

/* DRAG DROP */

function bulImgErr(img){img.outerHTML='<div style="color:#dc2626;font-size:11px;padding:8px;">Снимката не се зарежда</div>';}
function bulDragOver(el){event.preventDefault();el.classList.add('drag-hi');}
function bulDragLeave(el){el.classList.remove('drag-hi');}
function bulDragStart(el){dragInfo={col:el.getAttribute('data-col'),idx:parseInt(el.getAttribute('data-idx'))};}
function bulDropBlock(el){
  if(!dragInfo)return;
  var tCol=el.getAttribute('data-col'), tIdx=parseInt(el.getAttribute('data-idx'));
  el.classList.remove('drag-hi');
  var c=curBul.content;
  var bl=c.columns[dragInfo.col].splice(dragInfo.idx,1)[0];
  if(!bl){dragInfo=null;return;}
  c.columns[tCol].splice(tIdx,0,bl);
  dragInfo=null; schedSave(); renderBulletin();
}
function bulDropCol(el){
  if(!dragInfo)return;
  var tCol=el.getAttribute('data-col');
  var c=curBul.content;
  var bl=c.columns[dragInfo.col].splice(dragInfo.idx,1)[0];
  if(!bl){dragInfo=null;return;}
  c.columns[tCol].push(bl);
  dragInfo=null; schedSave(); renderBulletin();
}

/* BLOCK PICKER */
var _pkDept=null;
function openBlockPicker(dept){_pkDept=dept; document.getElementById('bp-ov').classList.add('open');}
function closeBlockPicker(){document.getElementById('bp-ov').classList.remove('open');}
function addBlock(type){
  closeBlockPicker();
  if(!_pkDept){console.error('addBlock: _pkDept is null');toast('Грешка: не е избран отдел','#dc2626');return;}
  if(!curBul||!curBul.content||!curBul.content.columns){console.error('addBlock: curBul not ready');return;}
  if(!curBul.content.columns[_pkDept]){curBul.content.columns[_pkDept]=[];}
  var b={id:genId(),type:type,content:''};
  if(type==='alert')b.color='blu';
  if(type==='important')b.urgency='info';
  if(type==='image')b.width=100;
  curBul.content.columns[_pkDept].push(b);
  console.log('addBlock: added',type,'to',_pkDept,'total blocks:',curBul.content.columns[_pkDept].length);
  /* Switch to edit mode so the new block is editable */
  bulMode='edit';
  bulActiveDept=_pkDept;
  schedSave(); renderBulletin();
}
function blockPickerHtml(){
  var types=[
    ['text','📝','Текст','Параграф'],
    ['alert','🚨','Алерт','Цветна кутия'],
    ['important','⭐','Важно','→ секция горе'],
    ['list','📋','Списък','Точки с информация'],
    ['image','📷','Снимка','JPG / PNG'],
    ['file','📎','Файл','PDF / Word / Excel'],
    ['divider','—','Разделител','Хоризонтална линия']
  ];
  var h='<div class="bov" id="bp-ov"><div class="bmod" style="width:520px;">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
  h+='<div style="font-size:15px;font-weight:600;">Избери тип блок</div>';
  h+='<button onclick="closeBlockPicker()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>';
  h+='</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">';
  types.forEach(function(t){
    h+='<button type="button" data-btype="'+t[0]+'" onclick="addBlock(this.dataset.btype)" style="border:1px solid #e2e8f0;border-radius:9px;padding:12px 14px;cursor:pointer;background:#fff;text-align:left;font-family:inherit;transition:border-color .15s;">';
    h+='<div style="font-size:20px;margin-bottom:4px;">'+t[1]+'</div>';
    h+='<div style="font-size:13px;font-weight:600;color:#0f172a;">'+t[2]+'</div>';
    h+='<div style="font-size:11px;color:#64748b;">'+t[3]+'</div>';
    h+='</button>';
  });
  h+='</div></div></div>';
  return h;
}


/* FILE UPLOAD */
function bulUploadImg(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  var fname=id+'_'+Date.now()+'.'+ext;
  var path='bulletin/'+curBul.id+'/'+fname;
  showBulToast('⏳ Качване на снимка...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      return r.text().then(function(txt){return {ok:r.ok,status:r.status,txt:txt};});
    }).then(function(res){
      if(!res.ok){
        var msg='';
        try{msg=JSON.parse(res.txt).message||JSON.parse(res.txt).error||res.txt;}catch(e){msg=res.txt;}
        toast('Грешка '+res.status+': '+msg,'#dc2626');
        console.error('Upload error:',res);
        return;
      }
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.url=pub; schedSave(); renderBulletin(); toast('✅ Снимката е качена!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');console.error(err);});
  };
  reader.readAsArrayBuffer(file);
}
function bulUploadFile(input){
  var file=input.files[0]; if(!file)return;
  var col=input.getAttribute('data-col'), id=input.getAttribute('data-id');
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname=id+'_file_'+Date.now()+'.'+ext;
  var path='bulletin/'+curBul.id+'/'+fname;
  showBulToast('⏳ Качване на файл...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      return r.text().then(function(txt){return {ok:r.ok,status:r.status,txt:txt};});
    }).then(function(res){
      if(!res.ok){
        var msg='';
        try{msg=JSON.parse(res.txt).message||JSON.parse(res.txt).error||res.txt;}catch(e){msg=res.txt;}
        toast('Грешка '+res.status+': '+msg,'#dc2626');
        return;
      }
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var b=(curBul.content.columns[col]||[]).find(function(x){return x.id===id;});
      if(b){b.url=pub;b.filename=file.name; schedSave(); renderBulletin(); toast('✅ Файлът е качен!');}
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');console.error(err);});
  };
  reader.readAsArrayBuffer(file);
}

/* CALENDAR MODAL */
function calModalHtml(){
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var yr=curBul?curBul.year:new Date().getFullYear();
  var days=weekDays(wk,yr);
  var opts=DKEYS.map(function(k,i){return '<option value="'+k+'">'+DNAMES[i]+' ('+fmtD(days[i])+')</option>';}).join('');
  return '<div class="bov" id="cal-ov"><div class="bmod" style="width:420px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">📅 Добави събитие в календара</div>' +
    '<label class="fl">Ден</label><select class="fi" id="cal-day">'+opts+'</select>' +
    '<label class="fl">Заглавие</label><input class="fi" id="cal-title" placeholder="напр. Инвентаризация на склада">' +
    '<label class="fl">Описание (по избор)</label><input class="fi" id="cal-desc" placeholder="Допълнителна информация">' +
    '<label class="fl">Отдел</label><select class="fi" id="cal-dept"><option value="general">— Общо</option><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад</option><option value="admin">⚙️ Администрация</option></select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="closeCal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitCal()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div></div>';
}
function openCalModal(dayKey){
  document.getElementById('cal-ov').classList.add('open');
  document.getElementById('cal-title').value='';
  document.getElementById('cal-desc').value='';
  if(dayKey){var sel=document.getElementById('cal-day');if(sel)sel.value=dayKey;}
}
function closeCal(){document.getElementById('cal-ov').classList.remove('open');}
function submitCal(){
  var title=(document.getElementById('cal-title').value||'').trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  var key=document.getElementById('cal-day').value;
  curBul.content.calendar[key]=curBul.content.calendar[key]||[];
  curBul.content.calendar[key].push({title:title,desc:document.getElementById('cal-desc').value,dept:document.getElementById('cal-dept').value,attachments:[]});
  closeCal(); schedSave(); renderBulletin(); toast('✅ Добавено!');
}

/* TASK MODAL */
function taskModalHtml(){
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var yr=curBul?curBul.year:new Date().getFullYear();
  var days=weekDays(wk,yr);
  return '<div class="bov" id="tk-ov"><div class="bmod" style="width:460px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✅ Нова задача</div>' +
    '<label class="fl">Заглавие *</label><input class="fi" id="tk-title" placeholder="напр. Провери наличностите">' +
    '<label class="fl">Описание</label><input class="fi" id="tk-desc" placeholder="Допълнителна информация">' +
    '<label class="fl">Отдел</label><select class="fi" id="tk-dept"><option value="trade">🛒 Търговска</option><option value="warehouse">📦 Склад/Приемане</option><option value="admin">⚙️ Администрация</option></select>' +
    '<label class="fl">Вид задача</label><select class="fi" id="tk-type">'+taskTypeOptsHtml('info')+'</select>' +
    '<label class="fl">Срок — избери един или няколко дни (по избор)</label>' +
    dueDatesCheckboxesHtml('tk-due-dates', days, []) +
    '<label class="fl">Магазини — остави без избор за ВСИЧКИ</label>' +
    '<select class="fi" id="tk-stores" multiple size="6" style="height:120px;"></select>' +
    '<label class="fl">Групи за докладване (получават известие/седмичен репорт)</label>' +
    reportGroupsCheckboxesHtml('tk-report-groups', []) +
    '<label class="fl">Свързан таб (по избор — бутон в календара към него)</label>' +
    '<select class="fi" id="tk-linked-module">'+linkedModuleOptsHtml('')+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="closeTk()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitTask()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави задача</button>' +
    '</div></div></div>';
}
/* Пълни multi-select с всички магазини (кеширани в allStoresCache от shared.js);
   зарежда кеша, ако още не е зареден. selectedArr - вече избраните (за редакция). */
function bulFillStoreMultiSelect(selId, selectedArr){
  selectedArr = selectedArr || [];
  loadAllStores().then(function(names){
    var sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = names.map(function(name){
      return '<option value="'+esc(name)+'"'+(selectedArr.indexOf(name)>=0?' selected':'')+'>'+esc(name)+'</option>';
    }).join('');
  });
}
function bulReadStoreMultiSelect(selId){
  var sel = document.getElementById(selId);
  if (!sel) return [];
  return Array.prototype.slice.call(sel.selectedOptions||[]).map(function(o){ return o.value; });
}
function openTaskModalForDept(dk){
  openTaskModal();
  var sel=document.getElementById('tk-dept');
  if(sel)sel.value=dk;
}

/* ─── РЕДАКЦИЯ НА ЗАДАЧА ───────────────────────────────────── */
function openEditTaskModal(taskId) {
  if (!canEdit()) { toast('Нямаш права за това действие','#dc2626'); return; }
  var t = bulTasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) { toast('Задачата не е намерена','#dc2626'); return; }
  var wk = curBul ? curBul.week_number : weekNum(new Date());
  var yr = curBul ? curBul.year : new Date().getFullYear();
  var days = weekDays(wk, yr);
  var existing = document.getElementById('edit-tk-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'edit-tk-ov';
  ov.innerHTML =
    '<div class="bmod" style="width:460px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✏️ Редактирай задача</div>' +
    '<label class="fl">Заглавие *</label>' +
    '<input class="fi" id="etk-title" value="'+esc(t.title||'')+'">' +
    '<label class="fl">Описание</label>' +
    '<input class="fi" id="etk-desc" value="'+esc(t.description||'')+'">' +
    '<label class="fl">Отдел</label>' +
    '<select class="fi" id="etk-dept">' +
      '<option value="trade"'+(t.department==='trade'?' selected':'')+'>🛒 Търговска</option>' +
      '<option value="warehouse"'+(t.department==='warehouse'?' selected':'')+'>📦 Склад/Приемане</option>' +
      '<option value="admin"'+(t.department==='admin'?' selected':'')+'>⚙️ Администрация</option>' +
    '</select>' +
    '<label class="fl">Вид задача</label><select class="fi" id="etk-type">'+taskTypeOptsHtml(t.task_type)+'</select>' +
    '<label class="fl">Срок — избери един или няколко дни (по избор)</label>' +
    dueDatesCheckboxesHtml('etk-due-dates', days, taskDueDates(t)) +
    '<label class="fl">Магазини — остави без избор за ВСИЧКИ</label>' +
    '<select class="fi" id="etk-stores" multiple size="6" style="height:120px;"></select>' +
    '<label class="fl">Групи за докладване (получават известие/седмичен репорт)</label>' +
    reportGroupsCheckboxesHtml('etk-report-groups', t.report_groups||[]) +
    '<label class="fl">Свързан таб (по избор — бутон в календара към него)</label>' +
    '<select class="fi" id="etk-linked-module">'+linkedModuleOptsHtml(t.linked_module||'')+'</select>' +
    (t.created_by ? '<div style="font-size:11px;color:#94a3b8;margin-top:8px;">Поставена от: '+esc(t.created_by)+'</div>' : '') +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="var e=document.getElementById(&#39;edit-tk-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-task-id="'+taskId+'" onclick="submitEditTask(this.dataset.taskId)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  bulFillStoreMultiSelect('etk-stores', t.target_stores||[]);
  setTimeout(function(){ var el=document.getElementById('etk-title'); if(el)el.focus(); }, 80);
}

function submitEditTask(taskId) {
  if (!canEdit()) { toast('Нямаш права за това действие','#dc2626'); return; }
  var title = (document.getElementById('etk-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var dept = document.getElementById('etk-dept').value;
  var taskType = document.getElementById('etk-type').value||'info';
  var desc = document.getElementById('etk-desc').value||'';
  var dueDates = readDueDatesCheckboxes('etk-due-dates');
  var stores = bulReadStoreMultiSelect('etk-stores');
  var reportGroups = readReportGroupsCheckboxes('etk-report-groups');
  var linkedModule = (document.getElementById('etk-linked-module')||{}).value||null;
  var body = {title:title,description:desc,department:dept,due_date:dueDates.length?dueDates[0]:null,due_dates:dueDates.length?dueDates:null,target_stores:stores.length?stores:null,task_type:taskType,report_groups:reportGroups.length?reportGroups:null,linked_module:linkedModule||null};
  /* sort_order влиза САМО при истинска смяна на отдела - иначе всяко
     отваряне и запазване на задачата би я хвърлило най-отдолу. */
  var t = bulTasks.find(function(x){ return String(x.id) === String(taskId); });
  var newOrder = null;
  if (t && t.department !== dept) {
    var maxOrder = bulTasks.filter(function(x){return x.department===dept;}).reduce(function(m,x){return Math.max(m,x.sort_order||0);},0);
    newOrder = maxOrder+1;
    body.sort_order = newOrder;
  }
  sbPatch('bulletin_tasks','id=eq.'+taskId,body).then(function(r){
    if (!r.ok) { toast('Грешка при запис','#dc2626'); return; }
    if (t && newOrder !== null) { t.department = dept; t.sort_order = newOrder; }
    var el = document.getElementById('edit-tk-ov');
    if (el) el.remove();
    toast('✅ Задачата е обновена!');
    loadBulletin();
  });
}

/* ─── РЕДАКЦИЯ НА ПОСТОЯННА ЗАДАЧА ───────────────────────── */
function openEditRecurringModal(taskId) {
  var t = recurringTasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) { toast('Задачата не е намерена','#dc2626'); return; }
  var existing = document.getElementById('edit-rec-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'edit-rec-ov';
  ov.innerHTML =
    '<div class="bmod" style="width:420px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">✏️ Редактирай постоянна задача</div>' +
    '<label class="fl">Заглавие *</label>' +
    '<input class="fi" id="erec-title" value="'+esc(t.title||'')+'">' +
    '<label class="fl">Описание</label>' +
    '<input class="fi" id="erec-desc" value="'+esc(t.description||'')+'">' +
    '<label class="fl">Повтарящи се дни (по избор)</label>' +
    recWeekdaysCheckboxesHtml('erec-weekdays', t.due_weekdays||(t.due_weekday!==null&&t.due_weekday!==undefined?[t.due_weekday]:[])) +
    recWindowToggleHtml('erec-window','erec-weekdays', !!t.due_window, (t.due_weekdays||[]).length) +
    '<label class="fl">Час (по избор)</label><input type="time" class="fi" id="erec-time" value="'+esc(t.due_time||'')+'">' +
    '<label class="fl">Вид задача</label><select class="fi" id="erec-type">'+taskTypeOptsHtml(t.task_type)+'</select>' +
    /* Отделът се задава при създаване от блока, в който е натиснат бутонът.
       Сгрешеният отдел досега можеше да се поправи само с ръчен SQL — а
       календарът групира по отдел (DCOLS) и стрелките ▲▼ местят само в
       рамките на отдела, тоест задачата не можеше да стигне до мястото си
       по никакъв начин от екрана. */
    '<label class="fl">Отдел</label><select class="fi" id="erec-dept">'+deptOptsHtml(t.department)+'</select>' +
    '<label class="fl">Магазини — остави без избор за ВСИЧКИ</label>' +
    '<select class="fi" id="erec-stores" multiple size="6" style="height:120px;"></select>' +
    '<label class="fl">Групи за докладване</label>' +
    reportGroupsCheckboxesHtml('erec-report-groups', t.report_groups||[]) +
    '<label class="fl">Свързан таб (по избор)</label>' +
    '<select class="fi" id="erec-linked-module">'+linkedModuleOptsHtml(t.linked_module||'')+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="var e=document.getElementById(&#39;edit-rec-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-task-id="'+taskId+'" onclick="submitEditRecurring(this.dataset.taskId)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  bulFillStoreMultiSelect('erec-stores', t.target_stores||[]);
  recWindowBindDays('erec-weekdays','erec-window');
  setTimeout(function(){ var el=document.getElementById('erec-title'); if(el)el.focus(); }, 80);
}

function submitEditRecurring(taskId) {
  var title = (document.getElementById('erec-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var desc = document.getElementById('erec-desc').value||'';
  var weekdays = readRecWeekdaysCheckboxes('erec-weekdays');
  var due_weekday = weekdays.length ? weekdays[0] : null;
  var due_time = document.getElementById('erec-time').value || null;
  var taskType = document.getElementById('erec-type').value||'info';
  var stores = bulReadStoreMultiSelect('erec-stores');
  var reportGroups = readReportGroupsCheckboxes('erec-report-groups');
  var linkedModule = (document.getElementById('erec-linked-module')||{}).value||null;
  var cur = recurringTasks.find(function(x){ return String(x.id)===String(taskId); });
  var dept = (document.getElementById('erec-dept')||{}).value || (cur&&cur.department) || DCOLS[0];
  var payload = {title:title,description:desc,department:dept,due_weekday:due_weekday,due_weekdays:weekdays.length?weekdays:null,due_window:readRecWindow('erec-window','erec-weekdays'),due_time:due_time,task_type:taskType,target_stores:stores.length?stores:null,report_groups:reportGroups.length?reportGroups:null,linked_module:linkedModule||null};
  /* Смяна на отдел -> задачата отива на ДЪНОТО на новия. sort_order е
     глобален, а moveRecInDept() преномерира 1..N в рамките на отдела, тоест
     числата се повтарят между отделите: днес „Администрация" заема 1–11, а
     единствената задача в „Склад" е с 9. Без това преместената задача би се
     появила по средата на чуждия списък, без потребителят да разбере защо.
     Взима се max, не броят — гарантира последно място и при дупки. */
  if (cur && cur.department !== dept) {
    payload.sort_order = recurringTasks.filter(function(x){ return x.department===dept; })
      .reduce(function(m,x){ return Math.max(m, x.sort_order||0); }, 0) + 1;
  }
  sbPatch('recurring_tasks','id=eq.'+taskId,payload).then(function(r){
    if (!r.ok) { toast('Грешка при запис','#dc2626'); return; }
    var el = document.getElementById('edit-rec-ov');
    if (el) el.remove();
    toast('✅ Задачата е обновена!');
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

function deleteRecurring(taskId) {
  /* Проверяваме първо дали има история на изпълнение - FK-то към
     task_completions няма CASCADE, затова директно изтриване на задача с
     история гърми 409 Conflict. Питаме изрично, преди да трием и двете. */
  sbGet('task_completions','recurring_task_id=eq.'+taskId+'&select=id').then(function(comps){
    var compCount = Array.isArray(comps) ? comps.length : 0;
    var msg = compCount > 0
      ? 'Тази задача има '+compCount+' запис'+(compCount===1?'':'a')+' за изпълнение от магазините. Изтриването ще изтрие ЗАВИНАГИ и тях (кой, кога, от кой магазин). Продължи?'
      : 'Изтрий постоянната задача завинаги?';
    if (!confirm(msg)) return;
    var delCompsPromise = compCount > 0 ? sbDelete('task_completions','recurring_task_id=eq.'+taskId) : Promise.resolve({ok:true});
    delCompsPromise.then(function(delCompRes){
      if (compCount > 0 && !delCompRes.ok) { toast('Грешка при изтриване на историята','#dc2626'); return; }
      sbDelete('recurring_tasks','id=eq.'+taskId).then(function(r){
        if (!r.ok) { toast('Грешка при изтриване','#dc2626'); return; }
        toast('🗑 Постоянната задача'+(compCount>0?' и историята ѝ':'')+' са изтрити');
        sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
          recurringTasks = Array.isArray(rt) ? rt : [];
          renderBulletin();
        });
      });
    });
  }).catch(function(){
    toast('Грешка при проверка на историята','#dc2626');
  });
}

function openTaskModal(){document.getElementById('tk-ov').classList.add('open');document.getElementById('tk-title').value='';document.getElementById('tk-desc').value='';bulFillStoreMultiSelect('tk-stores',[]);}
function closeTk(){document.getElementById('tk-ov').classList.remove('open');}
function submitTask(){
  var title=(document.getElementById('tk-title').value||'').trim();
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  var dept=document.getElementById('tk-dept').value;
  var taskType=document.getElementById('tk-type').value||'info';
  var maxOrder=bulTasks.filter(function(t){return t.department===dept;}).reduce(function(m,t){return Math.max(m,t.sort_order||0);},0);
  var stores=bulReadStoreMultiSelect('tk-stores');
  var reportGroups=readReportGroupsCheckboxes('tk-report-groups');
  var linkedModule=(document.getElementById('tk-linked-module')||{}).value||null;
  var dueDates=readDueDatesCheckboxes('tk-due-dates');
  sbPost('bulletin_tasks',{bulletin_id:curBul.id,week_number:curBul.week_number,year:curBul.year,department:dept,title:title,description:document.getElementById('tk-desc').value,due_date:dueDates.length?dueDates[0]:null,due_dates:dueDates.length?dueDates:null,target_stores:stores.length?stores:null,task_type:taskType,report_groups:reportGroups.length?reportGroups:null,linked_module:linkedModule||null,created_by:currentUser.display_name||currentUser.email,sort_order:maxOrder+1}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    closeTk(); toast('✅ Задачата е добавена!'); loadBulletin();
    /* Push само ако бюлетинът вече е публикуван - иначе магазините още не
       виждат задачата и известието би било подвеждащо. */
    if(curBul.status==='published' && typeof pushNewBulletinTask==='function'){
      pushNewBulletinTask(title, stores.length?stores:null);
    }
  });
}

/* ═══════ ПРИКАЧЕНИ ФАЙЛОВЕ КЪМ ПОСТОЯННИ ЗАДАЧИ ══════════════ */
function renderRecurringAttachments(t){
  var atts=normAttachments(t.attachments);
  var h='';
  if(atts.length){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;">';
    atts.forEach(function(a,i){
      h+='<div style="position:relative;">';
      if(a.type==='image'){
        h+='<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
        if(canEdit())h+=attSizePickerHtml('recurring',t.id,i,a.width);
      }else{
        h+='<a href="'+a.url+'" target="_blank" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;max-width:110px;">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.filename||'Файл')+'</span></a>';
      }
      if(canEdit())h+='<button data-rtid="'+t.id+'" data-idx="'+i+'" onclick="recurringRemoveAttachment(this.dataset.rtid,this.dataset.idx)" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(canEdit()){
    h+='<label style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">'+
      '📎 + Снимка/файл<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-rtid="'+t.id+'" onchange="recurringUploadAttachment(this)"></label>';
  }
  return h;
}
function recurringUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  var rtid=input.getAttribute('data-rtid');
  var t=recurringTasks.find(function(x){return String(x.id)===String(rtid);});
  if(!t)return;
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname='rec_'+rtid+'_'+Date.now()+'.'+ext;
  var path='bulletin-tasks/'+fname;
  showBulToast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var atts=normAttachments(t.attachments).slice();
      atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
      sbPatch('recurring_tasks','id=eq.'+rtid,{attachments:atts}).then(function(res){
        if(!res.ok){toast('Грешка при запис','#dc2626');return;}
        t.attachments=atts; renderBulletin(); toast('✅ Прикачено!');
      });
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function recurringRemoveAttachment(rtid,idx){
  var t=recurringTasks.find(function(x){return String(x.id)===String(rtid);});
  if(!t)return;
  var atts=normAttachments(t.attachments).slice();
  atts.splice(idx,1);
  sbPatch('recurring_tasks','id=eq.'+rtid,{attachments:atts}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    t.attachments=atts; renderBulletin(); toast('✓ Премахнато');
  });
}

/* ═══════ ПРИКАЧЕНИ ФАЙЛОВЕ КЪМ ЗАДАЧИ ══════════════════════ */
function normAttachments(atts){
  if(typeof atts==='string'){try{atts=JSON.parse(atts);}catch(e){atts=[];}}
  return Array.isArray(atts)?atts:[];
}
/* Малки бутони за избор на размер (33/50/66/100%) под снимка в задача/
   постоянна задача - същия модел като размера на снимки в блоковете,
   но по-компактен. Размерът определя показването при ПЕЧАТ. */
function attSizePickerHtml(kind,entityId,attIdx,currentWidth){
  var sizes=[['33','S'],['50','M'],['66','L'],['100','XL']];
  var h='<div style="display:flex;gap:2px;margin-top:2px;">';
  sizes.forEach(function(s){
    var active=String(currentWidth||100)===s[0];
    h+='<button data-kind="'+kind+'" data-eid="'+entityId+'" data-aidx="'+attIdx+'" data-w="'+s[0]+'" onclick="attSetWidth(this)" title="'+s[0]+'% (за печат)" style="border:1px solid '+(active?'#2563eb':'#e2e8f0')+';background:'+(active?'#eff6ff':'#fff')+';color:'+(active?'#2563eb':'#94a3b8')+';border-radius:3px;padding:0 3px;font-size:8px;line-height:14px;cursor:pointer;">'+s[1]+'</button>';
  });
  h+='</div>';
  return h;
}
/* Записва избрания размер на снимка в задача (kind='task') или постоянна
   задача (kind='recurring') - засяга само печатния изглед, не екрана. */
function attSetWidth(btn){
  var kind=btn.getAttribute('data-kind'), eid=btn.getAttribute('data-eid'),
      aidx=parseInt(btn.getAttribute('data-aidx')), w=parseInt(btn.getAttribute('data-w'));
  var list = kind==='task' ? bulTasks : recurringTasks;
  var table = kind==='task' ? 'bulletin_tasks' : 'recurring_tasks';
  var entity=list.find(function(x){return String(x.id)===String(eid);});
  if(!entity)return;
  var atts=normAttachments(entity.attachments).slice();
  if(!atts[aidx])return;
  atts[aidx]=Object.assign({},atts[aidx],{width:w});
  entity.attachments=atts;
  sbPatch(table,'id=eq.'+eid,{attachments:atts}).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    renderBulletin();
  });
}
function renderTaskAttachments(t){
  var atts=normAttachments(t.attachments);
  var h='';
  if(atts.length){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;">';
    atts.forEach(function(a,i){
      h+='<div style="position:relative;">';
      if(a.type==='image'){
        h+='<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
        if(canEdit())h+=attSizePickerHtml('task',t.id,i,a.width);
      }else{
        h+='<a href="'+a.url+'" target="_blank" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;max-width:110px;">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.filename||'Файл')+'</span></a>';
      }
      if(canEdit())h+='<button data-tid="'+t.id+'" data-idx="'+i+'" onclick="taskRemoveAttachment(this.dataset.tid,this.dataset.idx)" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(canEdit()){
    h+='<label style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;border:1px dashed #cbd5e1;border-radius:5px;padding:2px 8px;font-size:10px;color:#94a3b8;cursor:pointer;">'+
      '📎 + Снимка/файл<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-tid="'+t.id+'" onchange="taskUploadAttachment(this)"></label>';
  }
  return h;
}
function taskUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  var tid=input.getAttribute('data-tid');
  var t=bulTasks.find(function(x){return String(x.id)===String(tid);});
  if(!t)return;
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname=tid+'_'+Date.now()+'.'+ext;
  var path='bulletin-tasks/'+fname;
  showBulToast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      var atts=normAttachments(t.attachments).slice();
      atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
      fetch(BUL_SB+'/rest/v1/bulletin_tasks?id=eq.'+tid,{
        method:'PATCH',
        headers:{'apikey':BUL_KEY,'Authorization':'Bearer '+BUL_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify({attachments:atts})
      }).then(function(res){
        if(!res.ok){
          res.text().then(function(errText){
            console.error('bulletin_tasks PATCH грешка:', errText);
            toast('Грешка при запис: '+errText.slice(0,120),'#dc2626');
          });
          return;
        }
        t.attachments=atts; renderBulletin(); toast('✅ Прикачено!');
      });
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function taskRemoveAttachment(tid,idx){
  var t=bulTasks.find(function(x){return String(x.id)===String(tid);});
  if(!t)return;
  var atts=normAttachments(t.attachments).slice();
  atts.splice(idx,1);
  sbPatch('bulletin_tasks','id=eq.'+tid,{attachments:atts}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    t.attachments=atts; renderBulletin(); toast('✓ Премахнато');
  });
}

/* ═══════ ПРЕМЕСТВАНЕ НА ЗАДАЧА МЕЖДУ ТАБОВЕ (drag&drop) ══════ */
var _taskDragId = null;
function taskDragStart(e,el){
  _taskDragId=el.getAttribute('data-tid');
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',_taskDragId);}catch(err){}
}
function taskDragEnd(el){_taskDragId=null;}
/* Пренарежда задача нагоре/надолу в рамките на СЪЩИЯ отдел - заменя старото
   drag&drop пренареждане в списъка (нестабилно в реални браузъри), докато
   местенето МЕЖДУ отдели през табовете (taskDragStart/taskTabDrop) остава. */
function taskMoveUp(id){ moveTaskInDept(id,-1); }
function taskMoveDown(id){ moveTaskInDept(id,1); }
function moveTaskInDept(id,dir){
  var task=bulTasks.find(function(t){return String(t.id)===String(id);});
  if(!task)return;
  var dept=task.department;
  var deptTasks=bulTasks.filter(function(t){return t.department===dept;});
  var idx=deptTasks.findIndex(function(t){return String(t.id)===String(id);});
  var newIdx=idx+dir;
  if(newIdx<0||newIdx>=deptTasks.length)return; /* вече е на края */
  var tmp=deptTasks[idx]; deptTasks[idx]=deptTasks[newIdx]; deptTasks[newIdx]=tmp;
  var patches=deptTasks.map(function(t,i){
    t.sort_order=i+1;
    return sbPatch('bulletin_tasks','id=eq.'+t.id,{sort_order:i+1});
  });
  bulTasks.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
  Promise.all(patches).then(function(){ renderBulletin(); });
}
function taskTabDragOver(e,btn){
  if(!_taskDragId)return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  btn.style.outline='2px dashed #2563eb';
  btn.style.outlineOffset='-2px';
}
function taskTabDragLeave(btn){btn.style.outline='';}
function taskTabDrop(e,btn){
  e.preventDefault();
  btn.style.outline='';
  var tid=_taskDragId; _taskDragId=null;
  if(!tid)return;
  var newDept=btn.getAttribute('data-dk');
  var t=bulTasks.find(function(x){return String(x.id)===String(tid);});
  if(!t||t.department===newDept)return;
  /* Задачата отива най-отдолу в новия отдел. Старият sort_order е от
     подредбата на СТАРИЯ отдел и в новия я хвърля на случайно място. */
  var maxOrder=bulTasks.filter(function(x){return x.department===newDept;}).reduce(function(m,x){return Math.max(m,x.sort_order||0);},0);
  sbPatch('bulletin_tasks','id=eq.'+tid,{department:newDept,sort_order:maxOrder+1}).then(function(res){
    if(!res.ok){toast('Грешка при преместване','#dc2626');return;}
    t.department=newDept; t.sort_order=maxOrder+1; renderBulletin();
    toast('✅ Преместено в '+((DEPTS[newDept]||{}).label||newDept));
  });
}

/* PUBLISH / NEW */
function publishBul(){
  if(!curBul||!confirm('Публикувай бюлетина за всички потребители?'))return;
  sbPatch('bulletins','id=eq.'+curBul.id,{status:'published',published_at:new Date().toISOString(),published_by:currentUser.display_name||currentUser.email}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('📤 Бюлетинът е публикуван!');
    bulMode='view'; loadBulletin();
  });
}
function newBulletin(){
  sbGet('bulletins','select=week_number,year&order=created_at.desc&limit=20').then(function(rows){
    var existing=Array.isArray(rows)?rows:[];
    function exists(wk,yr){return existing.some(function(b){return b.week_number===wk&&b.year===yr;});}
    var d=new Date(); var wk=weekNum(d); var yr=d.getFullYear();
    var guard=0;
    while(exists(wk,yr)&&guard<12){ d.setDate(d.getDate()+7); wk=weekNum(d); yr=d.getFullYear(); guard++; }
    if(!confirm('Нов бюлетин за Седмица '+wk+' · '+yr+(guard?' (текущата вече има бюлетин - подготвяш предварително)':'')+'?'))return;
    var cal={};DKEYS.forEach(function(k){cal[k]=[];});
    sbPost('bulletins',{week_number:wk,year:yr,title:'Т-Бюлетин С'+wk+' · '+yr,content:{calendar:cal,columns:{trade:[],warehouse:[],admin:[]}},status:'draft'}).then(function(r){
      if(!r.ok){toast('Грешка при създаване','#dc2626');return;}
      toast('✅ Нов бюлетин е създаден — Седмица '+wk+' · '+yr+'!'); bulMode='edit'; bulSelectedId=null; loadBulletin();
    });
  });
}

/* ─── EMAIL MENU ─────────────────────────────────────────── */
function emailMenuHtml(){
  return '<div class="bov" id="em-ov"><div class="bmod" style="width:400px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">📧 Имейл нотификации</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;">'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">📋 Седмичен дайджест</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпраща задачите за седмицата до всички управители.</div>'+
      '<button onclick="sendWeeklyDigest(curBul,bulTasks,function(){closeEmailMenu();loadBulletin();})" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати до всички магазини</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">⚠️ Просрочени задачи</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпраща до регионални и контролинг за неизпълнените задачи.</div>'+
      '<button onclick="sendOverdueAlerts(curBul,bulTasks,bulComps,function(){closeEmailMenu();loadBulletin();})" style="border:none;background:#dc2626;color:#fff;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати нотификации</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">🔬 Тестов имейл</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпрати тест до твоя имейл за проверка.</div>'+
      '<div style="display:flex;gap:6px;">'+
      '<input id="test-email-inp" placeholder="твоя@имейл.com" value="'+(currentUser?currentUser.email:'')+'" style="flex:1;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;padding:5px 8px;font-family:inherit;">'+
      '<button onclick="bulSendTest()" style="border:none;background:#16a34a;color:#fff;border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;">Изпрати</button>'+
      '</div>'+
    '</div>'+
    '</div>'+
    '<button onclick="closeEmailMenu()" style="width:100%;margin-top:12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;color:#64748b;">Затвори</button>'+
    '</div></div>';
}
function bulSendTest(){var inp=document.getElementById('test-email-inp');if(inp)sendTestEmail(inp.value);}

function pushMenuHtml(){
  return '<div class="bov" id="pm2-ov"><div class="bmod" style="width:420px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">🔔 Push нотификации</div>'+
    '<div style="display:flex;flex-direction:column;gap:10px;">'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">📰 Бюлетин публикуван</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">До всички потребители на портала.</div>'+
      '<button onclick="pushBulletinPublished(curBul.week_number,curBul.year,bulTasks.length);closePushMenu();" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">📤 Изпрати до всички</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">⚠️ Просрочени задачи</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">До регионалните и контролинг.</div>'+
      '<button onclick="sendPushOverdueNow();closePushMenu();" style="border:none;background:#dc2626;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Изпрати нотификация</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">📅 Днешни срокове</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Задачи, под-задачи и постоянни задачи със срок днес — до всички.</div>'+
      '<button onclick="sendDailyDeadlinesNotification();closePushMenu();" style="border:none;background:#7c3aed;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Изпрати нотификация</button>'+
    '</div>'+
    '<div style="padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:3px;">🔬 Тест</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Изпрати тестова нотификация до себе си.</div>'+
      '<button onclick="bulPushTest()" style="border:none;background:#16a34a;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">🔔 Тест</button>'+
    '</div>'+
    '</div>'+
    '<button onclick="closePushMenu()" style="width:100%;margin-top:12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;color:#64748b;">Затвори</button>'+
    '</div></div>';
}
function bulPushTest(){
  closePushMenu();
  showBulToast('⏳ Изпращане...');
  pushToAll('🔔 Тест ТеМАХ Портал','Push нотификациите работят!').then(function(r){
    console.log('Push test result:', JSON.stringify(r));
    var ok = r.ok && r.data && !r.data.errors;
    var msg = ok
      ? '✅ Изпратена! Провери браузъра.'
      : '❌ Грешка: ' + ((r.data&&(r.data.message||r.data.error||(r.data.errors&&r.data.errors[0])))||r.status);
    showBulToast(msg);
    toast(msg, ok ? '#16a34a' : '#dc2626');
    if(!ok) alert('Push грешка: ' + JSON.stringify(r.data));
  }).catch(function(err){
    console.error('Push catch:', err);
    showBulToast('❌ ' + err.message);
    alert('Push грешка: ' + err.message);
  });
}
function openPushMenu(){document.getElementById('pm2-ov').classList.add('open');}
function closePushMenu(){document.getElementById('pm2-ov').classList.remove('open');}

/* Събира заглавията на всички задачи/под-задачи/постоянни задачи със срок ДНЕС.
   cb(items) се вика винаги (items може да е празен масив). */
function collectTodayDeadlineItems(cb){
  var todayStr = today();
  var mainTasks = bulTasks.filter(function(t){ return taskIsDueOnDate(t, todayStr); });
  var recTasks = recurringTasks.filter(function(t){ return recurringIsDueToday(t); });
  sbGet('task_subtasks','due_date=eq.'+todayStr).then(function(subs){
    var subTasks = Array.isArray(subs) ? subs : [];
    /* Всеки елемент носи отдел + час (ако има), вместо голо заглавие -
       за да можем да групираме по отдел и подредим по спешност/час,
       вместо всичко да се лее в едно изречение, разделено със запетаи. */
    var items = [];
    mainTasks.forEach(function(t){ items.push({title:t.title,time:null,department:t.department||null}); });
    subTasks.forEach(function(s){
      var parent=bulTasks.find(function(t){return t.id===s.task_id;});
      items.push({title:s.title,time:null,department:parent?parent.department:null});
    });
    recTasks.forEach(function(t){ items.push({title:t.title,time:t.due_time||null,department:t.department||null}); });
    cb(items);
  }).catch(function(){ cb([]); });
}
/* Групира по отдел (📦 Склад/Приемане, 🛒 Търговска, ⚙️ Администрация), сортира
   по час в рамките на отдела (със зададен час - най-напред, по-ранните преди),
   и разделя редовете с нов ред вместо запетая - много по-лесно за бърз прочит
   в push нотификация, отколкото едно дълго изречение с всичко накуп. */
function formatDeadlinesMessage(items){
  var groups={};
  var order=[]; /* пазим реда на първа поява на отдела */
  items.forEach(function(it){
    var key=it.department||'other';
    if(!groups[key]){groups[key]=[];order.push(key);}
    groups[key].push(it);
  });
  var lines=order.map(function(key){
    var group=groups[key].slice().sort(function(a,b){
      if(a.time&&b.time)return a.time.localeCompare(b.time);
      if(a.time)return -1;
      if(b.time)return 1;
      return 0;
    });
    var info=DEPTS[key];
    var label=info?(info.icon+' '+info.label):'📋 Общи';
    var groupText=group.map(function(it){return it.title+(it.time?' ('+it.time+')':'');}).join(', ');
    return label+': '+groupText;
  });
  return lines.join('\n');
}
function sendDailyDeadlinesNotification(){
  collectTodayDeadlineItems(function(items){
    if(!items.length){ showBulToast('Няма задачи със срок днес.'); return; }
    var title = '📅 '+items.length+' срок'+(items.length===1?'':'а')+' днес';
    var msg = formatDeadlinesMessage(items);
    showBulToast('⏳ Изпращане...');
    pushToAll(title,msg).then(function(res){
      if(res && res.ok) showBulToast('🔔 Изпратена!');
      else showBulToast('❌ Грешка при изпращане');
    });
  });
}
function autoCheckDailyDeadlines(){
  var key='auto_deadlines_notif_'+today();
  try{ if(localStorage.getItem(key))return; }catch(e){}
  collectTodayDeadlineItems(function(items){
    try{ localStorage.setItem(key,'1'); }catch(e){}
    if(!items.length || typeof pushToAll!=='function')return;
    var title = '📅 '+items.length+' срок'+(items.length===1?'':'а')+' днес';
    var msg = formatDeadlinesMessage(items);
    pushToAll(title,msg);
  });
}

function sendPushOverdueNow(){
  if(!bulTasks.length){toast('Няма задачи за проверка');return;}
  /* Същият източник за „днес", който заключва чекбокса — bulTodayISO() е
     toLocalISO(new Date()). Така задача не може да е едновременно отметваема
     и закъсняла. */
  var todayISO=bulTodayISO();
  /* Само обектите, които реално могат да отметнат — същият източник като
     бройките в календара. Преди тук стоеше sbGet('stores'): Централният
     офис (58 акаунта) и двата склада получаваха известие за чужда работа,
     която не е тяхна и която нямат как да свършат.
     Заявката е ВЪН от цикъла, а pushOverdue() се вика веднъж след него:
     докато стояха вътре във forEach-а, пет просрочени задачи пращаха пет
     отделни известия. */
  loadReportableStores().then(function(stores){
    /* Проверката тук беше `if(!Array.isArray(stores))return;` — мъртва,
       защото функцията винаги връща масив, включително [] при срив
       (shared.js ред 453). Тихият return превръщаше срива в „нищо не се
       случи". Нула обекта при осемнайсет в базата е срив. */
    if(!stores||!stores.length){toast('❌ Списъкът с обекти не се зареди','#dc2626');return;}
    var overdue={};
    bulTasks.forEach(function(t){
      var dates = taskDueDates(t);
      if(!dates.length) return;
      /* Сравнение НИЗ с НИЗ, не през Date: new Date('2026-08-25') е UTC
         полунощ = 03:00 наше време, тоест задача с последна дата днес
         минаваше за просрочена от 03:00. 'YYYY-MM-DD' се подрежда
         лексикографски и UTC не участва. */
      if(dates[dates.length-1]>=todayISO)return;
      /* Задача, насочена към конкретни обекти, важи само за тях — същото
         правило като в главния списък и в календара. Иначе задача за три
         обекта вдигаше известие за всичките 18. */
      var scope=(t.target_stores&&t.target_stores.length)
        ? stores.filter(function(name){return t.target_stores.indexOf(name)>=0;})
        : stores;
      scope.forEach(function(name){
        var done=bulComps.some(function(c){return c.task_id===t.id&&c.store_name===name;});
        if(!done){if(!overdue[name])overdue[name]=[];overdue[name].push(t.title);}
      });
    });
    if(Object.keys(overdue).length) pushOverdue(overdue,null);
    else toast('✅ Всички задачи са изпълнени!');
  });
}

function openEmailMenu(){document.getElementById('em-ov').classList.add('open');}
function closeEmailMenu(){document.getElementById('em-ov').classList.remove('open');}

function renderBulEmpty(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  wrap.innerHTML='<div style="text-align:center;padding:60px;"><div style="font-size:50px;margin-bottom:14px;">📰</div><div style="font-size:18px;font-weight:600;margin-bottom:8px;">Няма бюлетин за тази седмица</div>'+(canEdit()?'<button onclick="newBulletin()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;">+ Създай бюлетин</button>':'<div style="color:#94a3b8;">Бюлетинът ще бъде публикуван скоро.</div>')+'</div>';
}

/* ════════ PRINT ════════════════════════════════════════════ */
var _printOrientation='portrait';
function printSetOrientation(o){
  _printOrientation=o;
  var pBtn=document.getElementById('po-portrait'), lBtn=document.getElementById('po-landscape');
  if(pBtn)pBtn.style.cssText=o==='portrait'?'border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;flex:1;':'border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;flex:1;';
  if(lBtn)lBtn.style.cssText=o==='landscape'?'border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;flex:1;':'border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;flex:1;';
}
function printMenuHtml(){
  return '<div class="bov" id="pm-ov"><div class="bmod" style="width:380px;"><div style="font-size:15px;font-weight:600;margin-bottom:14px;">🖨 Избери какво да принтираш</div>' +
    '<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">Ориентация на страницата</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:14px;">' +
    '<button id="po-portrait" onclick="printSetOrientation(\'portrait\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;flex:1;">📄 Портрет</button>' +
    '<button id="po-landscape" onclick="printSetOrientation(\'landscape\')" style="border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;flex:1;">📃 Пейзаж</button>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;">' +
    '<button data-what="all" onclick="bulPrint(this)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;">📄 Целия бюлетин</button>' +
    '<button data-what="cal" onclick="bulPrint(this)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;">📅 Само Календар + Важно</button>' +
    '<button data-what="trade" onclick="bulPrint(this)" style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;color:#166534;">🛒 Само Търговска</button>' +
    '<button data-what="warehouse" onclick="bulPrint(this)" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;color:#1e40af;">📦 Само Склад/Приемане</button>' +
    '<button data-what="admin" onclick="bulPrint(this)" style="border:1px solid #ddd6fe;background:#f5f3ff;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;text-align:left;color:#4c1d95;">⚙️ Само Администрация</button>' +
    '</div><button onclick="closePrintMenu()" style="width:100%;margin-top:12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;color:#64748b;">Откажи</button></div></div>';
}
function openPrintMenu(){_printOrientation='portrait';document.getElementById('pm-ov').classList.add('open');}
function closePrintMenu(){document.getElementById('pm-ov').classList.remove('open');}
function bulPrint(btn){closePrintMenu();printSection(btn.getAttribute('data-what'));}

function printSection(what){
  var c=curBul.content; var wk=curBul.week_number; var yr=curBul.year;
  var days=weekDays(wk,yr); var isDraft=curBul.status==='draft';
  var imp2=[];
  DCOLS.forEach(function(k){(c.columns[k]||[]).forEach(function(b){if(b.type==='important')imp2.push(b);});});

  var PRINT_CSS = '@page{size:A4 '+(_printOrientation==='landscape'?'landscape':'portrait')+';margin:14mm;}' +
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:Arial,sans-serif;font-size:14pt;color:#111;background:#fff;line-height:1.55;}' +
    'h1{font-size:20pt;font-weight:700;margin-bottom:3mm;}' +
    'h2{font-size:16pt;font-weight:700;color:#0f172a;border-bottom:2pt solid #e2e8f0;padding-bottom:2mm;margin:5mm 0 3mm;}' +
    'h3{font-size:14pt;font-weight:700;margin:4mm 0 2mm;}' +
    '.hdr{background:#0f172a;color:#fff;padding:8mm 10mm;border-radius:3mm;margin-bottom:5mm;display:flex;justify-content:space-between;align-items:center;}' +
    '.hdr-title{font-size:19pt;font-weight:700;}' +
    '.hdr-sub{font-size:12pt;color:#94a3b8;margin-top:1mm;}' +
    '.draft-badge{background:#f59e0b;color:#78350f;font-size:11pt;font-weight:700;padding:2mm 4mm;border-radius:20mm;}' +
    '.week-badge{background:#1e293b;color:#94a3b8;font-family:monospace;font-size:12pt;padding:2mm 5mm;border-radius:20mm;}' +
    /* Important section */
    '.imp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm;margin-bottom:5mm;}' +
    '.imp-card{border-radius:2mm;padding:4mm 5mm;}' +
    '.imp-ok{background:#f0fdf4;border-left:3pt solid #16a34a;}' +
    '.imp-warn{background:#fffbeb;border-left:3pt solid #f59e0b;}' +
    '.imp-urgent{background:#fff1f2;border-left:3pt solid #dc2626;}' +
    '.imp-info{background:#eff6ff;border-left:3pt solid #2563eb;}' +
    '.imp-title{font-size:14pt;font-weight:700;margin-bottom:1mm;}' +
    '.imp-sub{font-size:12pt;opacity:.8;}' +
    /* Calendar */
    '.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3mm;margin-bottom:5mm;}' +
    '.cal-day{border:1pt solid #e2e8f0;border-radius:2mm;padding:3mm 4mm;min-height:35mm;}' +
    '.cal-day-name{font-size:9.5pt;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:1mm;}' +
    '.cal-date{font-family:monospace;font-size:19pt;font-weight:700;color:#0f172a;margin-bottom:2mm;}' +
    '.cal-entry{display:flex;gap:2mm;padding:1mm 0;border-bottom:1pt dashed #f1f5f9;align-items:flex-start;font-size:12.5pt;}' +
    '.cal-dot{width:5pt;height:5pt;border-radius:50%;flex-shrink:0;margin-top:2.5pt;}' +
    '.cal-empty{font-size:12pt;color:#cbd5e1;font-style:italic;}' +
    /* Department */
    '.dept-hdr{color:#fff;padding:5mm 7mm;border-radius:2mm 2mm 0 0;font-size:16pt;font-weight:700;}' +
    '.dept-body{border:1pt solid #e2e8f0;border-top:none;border-radius:0 0 2mm 2mm;padding:5mm 7mm;margin-bottom:5mm;}' +
    /* Blocks */
    '.block-text{font-size:14pt;color:#374151;margin-bottom:3mm;line-height:1.6;}' +
    '.block-alert{border-radius:0 2mm 2mm 0;padding:3mm 5mm;margin-bottom:3mm;font-size:14pt;}' +
    '.block-list{margin-bottom:3mm;}' +
    '.block-list li{font-size:14pt;color:#374151;padding:1mm 0;border-bottom:1pt solid #f1f5f9;}' +
    '.block-img{margin-bottom:3mm;}' +
    '.block-img img{border-radius:2mm;display:block;}' +
    '.block-img-cap{font-size:11pt;color:#64748b;font-style:italic;margin-top:1mm;}' +
    /* Tasks */
    '.tasks-hdr{font-size:10.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;border-bottom:1.5pt solid #e2e8f0;padding-bottom:2mm;margin:4mm 0 2mm;}' +
    '.task-row{display:flex;gap:3mm;padding:2.5mm 0;border-bottom:1pt solid #f1f5f9;align-items:flex-start;}' +
    '.task-cb{width:15pt;height:15pt;border:1.5pt solid #e2e8f0;border-radius:2pt;flex-shrink:0;margin-top:1pt;}' +
    '.task-title{font-size:14pt;font-weight:600;margin-bottom:0.5mm;}' +
    '.task-desc{font-size:12pt;color:#64748b;overflow-wrap:break-word;}' +
    '.task-due{font-size:11pt;color:#94a3b8;margin-top:0.5mm;}' +
    '.task-attachments{display:flex;flex-wrap:wrap;gap:3mm;margin-top:2mm;}' +
    '.task-att-img{object-fit:contain;border-radius:2mm;border:1pt solid #e2e8f0;background:#f8fafc;}' +
    '.task-att-file{display:inline-block;padding:2mm 4mm;border:1pt solid #e2e8f0;border-radius:2mm;font-size:11pt;color:#64748b;}' +
    '.dept-badge{display:inline-block;padding:1mm 3mm;border-radius:20mm;font-size:11pt;font-weight:600;margin-bottom:2mm;}' +
    '.badge-trade{background:#f0fdf4;color:#14532d;}' +
    '.badge-wh{background:#eff6ff;color:#1e40af;}' +
    '.badge-admin{background:#f5f3ff;color:#4c1d95;}' +
    '@media print{button{display:none!important;}}';

  /* Прикачени снимки към задача в печатния изглед - на екрана са малки (52px,
     за компактност в списъка), но при печат трябва да се виждат ясно на
     хартия, затова са значително по-големи тук. Файлове (не снимки) се
     показват само като текстов етикет - хартията не може да се "кликне". */
  function pTaskAttachments(t){
    var atts=normAttachments(t.attachments);
    if(!atts.length)return '';
    var mmBySize={33:'45mm',50:'70mm',66:'95mm',100:'140mm'};
    var s='<div class="task-attachments">';
    atts.forEach(function(a){
      if(a.type==='image'){
        var mm=mmBySize[a.width]||mmBySize[100];
        s+='<img src="'+a.url+'" class="task-att-img" style="width:'+mm+';max-height:'+mm+';">';
      }else{
        s+='<span class="task-att-file">📎 '+esc(a.filename||'Файл')+'</span>';
      }
    });
    s+='</div>';
    return s;
  }
  function pBlock(b){
    if(!b||!b.type)return '';
    if(b.type==='text')return '<div class="block-text">'+esc(b.content||'').replace(/\n/g,'<br>')+'</div>';
    if(b.type==='divider')return '<hr style="border:none;border-top:1pt solid #e2e8f0;margin:3mm 0;">';
    if(b.type==='list'){
      var it=(b.content||'').split('\n').filter(Boolean);
      return '<ul class="block-list" style="list-style:none;padding:0;">'+(it.map(function(i){return '<li>› '+esc(i)+'</li>';}).join(''))+'</ul>';
    }
    if(b.type==='alert'){
      var aC={red:'#fff1f2:#dc2626:#991b1b',amb:'#fffbeb:#f59e0b:#92400e',grn:'#f0fdf4:#16a34a:#14532d',blu:'#eff6ff:#2563eb:#1e40af',pur:'#f5f3ff:#8b5cf6:#4c1d95'}[b.color||'blu']||'#eff6ff:#2563eb:#1e40af';
      var aC2=aC.split(':');
      return '<div class="block-alert" style="background:'+aC2[0]+';border-left:3pt solid '+aC2[1]+';color:'+aC2[2]+';">'+(b.label?'<div style="font-size:10pt;font-weight:700;text-transform:uppercase;margin-bottom:1mm;">'+esc(b.label)+'</div>':'')+esc(b.content||'')+'</div>';
    }
    if(b.type==='image'&&b.url){
      var w=b.width||100;
      return '<div class="block-img" style="width:'+w+'%;"><img src="'+b.url+'" style="width:100%;border-radius:2mm;">'+(b.caption?'<div class="block-img-cap">'+esc(b.caption)+'</div>':'')+'</div>';
    }
    if(b.type==='file'&&b.url){
      return '<div style="padding:2mm 4mm;border:1pt solid #e2e8f0;border-radius:2mm;font-size:10.5pt;margin-bottom:2mm;">📎 <b>'+esc(b.filename||'Файл')+'</b></div>';
    }
    return '';
  }

  function pImp(){
    if(!imp2.length)return '';
    var cls={ok:'imp-ok',warn:'imp-warn',urgent:'imp-urgent',info:'imp-info'};
    var cols={ok:'#14532d',warn:'#92400e',urgent:'#991b1b',info:'#1e40af'};
    var s='<h2>⭐ Важно тази седмица</h2><div class="imp-grid">';
    imp2.forEach(function(b){
      var ug=b.urgency||'info';
      s+='<div class="imp-card '+(cls[ug]||'imp-info')+'">';
      s+='<div class="imp-title" style="color:'+(cols[ug]||'#1e40af')+'">'+esc(b.title||'')+'</div>';
      if(b.sub)s+='<div class="imp-sub" style="color:'+(cols[ug]||'#1e40af')+'">'+esc(b.sub)+'</div>';
      s+='</div>';
    });
    s+='</div>';
    return s;
  }

  function pCal(){
    var dotC={trade:'#14532d',warehouse:'#1e40af',admin:'#5b21b6',general:'#64748b'};
    var printStore=currentUser&&currentUser.store_name;
    var s='<h2>📅 Седмичен календар — Седмица '+wk+' · '+yr+'</h2>';
    s+='<div class="cal-grid">';
    DKEYS.forEach(function(key,i){
      var ds=toLocalISO(days[i]);
      var dt=bulTasks.filter(function(t){
        if(!taskIsDueOnDate(t,ds))return false;
        return isGlobal()||!t.target_stores||!t.target_stores.length||(printStore&&t.target_stores.indexOf(printStore)>=0);
      });
      var rdt=recurringTasks.filter(function(t){return recurringIsDueOnWeekday(t,i);});
      var mn=c.calendar[key]||[];
      s+='<div class="cal-day">';
      s+='<div class="cal-day-name">'+DNAMES[i]+'</div>';
      s+='<div class="cal-date">'+fmtD(days[i])+'</div>';
      dt.forEach(function(t){
        var dc=dotC[t.department]||'#64748b';
        s+='<div class="cal-entry"><span class="cal-dot" style="background:'+dc+'"></span><span style="font-weight:600;">'+esc(t.title||'')+'</span></div>';
      });
      rdt.forEach(function(t){
        var dc=dotC[t.department]||'#64748b';
        s+='<div class="cal-entry"><span class="cal-dot" style="background:'+dc+'"></span><span style="font-weight:600;">🔁 '+esc(t.title||'')+'</span></div>';
      });
      mn.forEach(function(e){
        var dc=dotC[e.dept]||'#64748b';
        s+='<div class="cal-entry"><span class="cal-dot" style="background:'+dc+'"></span><span>'+esc(e.title||'')+'</span></div>';
      });
      if(!dt.length&&!rdt.length&&!mn.length)s+='<div class="cal-empty">Свободен</div>';
      s+='</div>';
    });
    s+='</div>';
    return s;
  }

  function pDept(dk){
    var dept=DEPTS[dk];
    var hdrC={trade:'#166534',warehouse:'#1e40af',admin:'#5b21b6'}[dk]||'#1e293b';
    var blocks=(c.columns[dk]||[]).filter(function(b){return b.type!=='task'&&b.type!=='important';});
    var printStore=currentUser&&currentUser.store_name;
    /* Печатаме само задачите, видими за печатащия - същия target_stores
       филтър като навсякъде другаде (офисът вижда всичко). */
    var dt=bulTasks.filter(function(t){
      if(t.department!==dk)return false;
      return isGlobal()||!t.target_stores||!t.target_stores.length||(printStore&&t.target_stores.indexOf(printStore)>=0);
    });
    var bdg={trade:'badge-trade',warehouse:'badge-wh',admin:'badge-admin'}[dk]||'badge-admin';
    var s='<div class="dept-hdr" style="background:'+hdrC+';">'+dept.icon+' '+dept.label+'</div>';
    s+='<div class="dept-body">';
    blocks.forEach(function(b){s+=pBlock(b);});
    if(dt.length){
      s+='<div class="tasks-hdr">✅ Задачи за изпълнение тази седмица</div>';
      dt.forEach(function(t){
        var isMulti=taskIsMultiDay(t);
        var singleDate=isMulti?null:(taskDueDates(t)[0]||null);
        /* Статус СПРЯМО КОНКРЕТНИЯ печатащ магазин и КОНКРЕТНИЯ ден (за
           многодневна задача status е неопределен без ден - показваме
           обобщение вместо чекмарк). status==='done' изрично - отложена
           задача не бива да излиза с ✓. */
        var comp=(!isMulti&&printStore)?bulComps.find(function(cc){return cc.task_id===t.id&&cc.store_name===printStore&&cc.status==='done'&&(cc.completion_date||null)===singleDate;}):null;
        var postponedComp=(!isMulti&&printStore)?bulComps.find(function(cc){return cc.task_id===t.id&&cc.store_name===printStore&&cc.status==='postponed'&&(cc.completion_date||null)===singleDate;}):null;
        var isDone=!!comp;
        s+='<div class="task-row">';
        if(isMulti){
          s+='<div class="task-cb" style="display:flex;align-items:center;justify-content:center;font-size:9pt;">📅</div>';
        } else {
          s+='<div class="task-cb" style="'+(isDone?'background:#16a34a;border-color:#16a34a;':'')+'">'+
            (isDone?'<div style="color:#fff;font-size:9pt;text-align:center;line-height:13pt;">✓</div>':'')+'</div>';
        }
        s+='<div style="flex:1;">';
        s+='<div class="task-title">'+esc(t.title||'')+' '+taskTypeBadgeHtml(t.task_type)+(postponedComp?'<span style="font-size:8pt;font-weight:700;padding:1pt 5pt;border-radius:8pt;background:#fff7ed;color:#b45309;border:0.5pt solid #fed7aa;">⏱ Отложена</span>':'')+'</div>';
        if(t.description)s+='<div class="task-desc">'+linkify(t.description)+'</div>';
        if(isMulti)s+='<div class="task-due">📅 Дни: '+taskDueLabel(t)+' (виж бройки по дни в календара по-горе)</div>';
        else if(singleDate)s+='<div class="task-due">📅 Срок: '+new Date(singleDate+'T00:00:00').toLocaleDateString('bg-BG')+(isDone&&comp?' &nbsp; ✅ '+esc(comp.completed_by||''):'')+'</div>';
        if(comp&&(comp.comment||(comp.photos&&comp.photos.length)))s+=renderCompletionExtras(comp);
        if(postponedComp&&postponedComp.comment)s+='<div class="task-desc" style="color:#b45309;">⏱ '+esc(postponedComp.comment)+'</div>';
        s+=pTaskAttachments(t);
        s+='</div></div>';
      });
    }
    var rdt=recurringTasks.filter(function(t){return t.department===dk;});
    if(rdt.length){
      s+='<div class="tasks-hdr">🔁 Постоянни задачи</div>';
      rdt.forEach(function(t){
        var isMultiRecPrint = recurringIsMultiDay(t);
        var singleRecDatePrint = isMultiRecPrint ? null : (recTaskWeekdays(t).length ? toLocalISO(days[recTaskWeekdays(t)[0]]) : toLocalISO(new Date()));
        var rComp=(!isMultiRecPrint&&printStore)?recurringComps.find(function(cc){return cc.recurring_task_id===t.id&&cc.store_name===printStore&&(cc.completion_date||null)===singleRecDatePrint;}):null;
        var rDone=!!rComp;
        s+='<div class="task-row">';
        if(isMultiRecPrint){
          s+='<div class="task-cb" style="display:flex;align-items:center;justify-content:center;font-size:9pt;">📅</div>';
        } else {
          s+='<div class="task-cb" style="'+(rDone?'background:#16a34a;border-color:#16a34a;':'')+'">'+
            (rDone?'<div style="color:#fff;font-size:9pt;text-align:center;line-height:13pt;">✓</div>':'')+'</div>';
        }
        s+='<div style="flex:1;">';
        s+='<div class="task-title">'+esc(t.title||'')+'</div>';
        if(t.description)s+='<div class="task-desc">'+linkify(t.description)+'</div>';
        var dueLbl=recurringDueLabel(t);
        if(dueLbl)s+='<div class="task-due">🔁 '+esc(dueLbl)+(isMultiRecPrint?' (виж бройки по дни в календара по-горе)':'')+'</div>';
        s+=pTaskAttachments(t);
        s+='</div></div>';
      });
    }
    if(!blocks.length&&!dt.length&&!rdt.length)s+='<div style="color:#94a3b8;text-align:center;padding:5mm;">Няма съдържание.</div>';
    s+='</div>';
    return s;
  }

  var sections='';
  var printTitle='Т-Бюлетин Седмица '+wk+' · '+yr;
  var sectionTitle='';

  if(what==='all'){
    sections=pImp()+pCal()+DCOLS.map(function(dk){return '<div style="margin-bottom:6mm;">'+pDept(dk)+'</div>';}).join('');
    sectionTitle='Пълен';
  } else if(what==='cal'){
    sections=pImp()+pCal();
    sectionTitle='Календар & Важно';
  } else if(DEPTS[what]){
    sections='<div>'+pDept(what)+'</div>';
    sectionTitle=DEPTS[what].label;
  }

  var win=window.open('','_blank','width=900,height=700');
  var fullTitle=printTitle+(sectionTitle?' — '+sectionTitle:'');
  win.document.write('<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">'+
    '<title>'+fullTitle+'</title>'+
    '<style>'+PRINT_CSS+'</style></head><body>');
  win.document.write('<div class="hdr">'+
    '<div><div class="hdr-title">'+fullTitle+'</div>'+
    '<div class="hdr-sub">ТеМАХ Вътрешна платформа · '+new Date().toLocaleDateString('bg-BG')+'</div></div>'+
    '<div style="display:flex;gap:4mm;align-items:center;">'+
    '<span class="week-badge">С'+wk+' · '+yr+'</span>'+
    (isDraft?'<span class="draft-badge">✏ Чернова</span>':'')+'</div>'+
  '</div>');
  win.document.write(sections);
  win.document.write('<div style="text-align:center;margin-top:8mm;"><button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;padding:8pt 20pt;border-radius:5mm;font-size:12pt;cursor:pointer;">🖨 Принтирай / Запази PDF</button></div>');
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.focus();},300);
}



/* ═══════ ЗАДАЧИ — ПАНЕЛ ═══════════════════════════════ */
function renderTasksPanel() {
  var isAdmin = canEdit();
  var DEPT = DEPTS;

  if (!bulTasks.length) return '';

  var h = '<div style="margin-bottom:20px;">';
  h += '<div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:12px;">✅ Задачи за седмицата</div>';

  if (!isAdmin) {
    /* ── ИЗГЛЕД ЗА МАГАЗИНА ── */
    var store = currentUser.store_name;
    var depts = ['trade','warehouse','admin'];

    depts.forEach(function(dk) {
      var dTasks = bulTasks.filter(function(t){ return t.department===dk; });
      /* Същият филтър по target_stores като в основния изглед по-горе —
         тази функция рендира отделен, паралелен "мобилен" панел за същите
         задачи и трябва да остане консистентна с него. */
      dTasks = dTasks.filter(function(t){
        return !t.target_stores || !t.target_stores.length || (store && t.target_stores.indexOf(store)>=0);
      });
      if (!dTasks.length) return;
      var d = DEPT[dk];
      var done = dTasks.filter(function(t){
        return bulComps.some(function(c){return c.task_id===t.id && c.store_name===store && c.status==='done';});
      }).length;
      var pct = Math.round(done/dTasks.length*100);

      h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden;">';
      h += '<div style="background:'+d.hdr+';padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">';
      h += '<div style="font-size:13px;font-weight:600;color:#fff;">'+d.icon+' '+d.label+'</div>';
      h += '<div style="display:flex;align-items:center;gap:8px;">';
      h += '<div style="font-size:11px;color:rgba(255,255,255,.7);">'+done+'/'+dTasks.length+'</div>';
      h += '<div style="background:rgba(255,255,255,.2);border-radius:20px;width:80px;height:6px;">';
      h += '<div style="background:'+(pct===100?'#4ade80':'#fff')+';width:'+pct+'%;height:6px;border-radius:20px;transition:.3s;"></div>';
      h += '</div></div></div>';
      h += '<div style="padding:8px 14px;">';

      dTasks.forEach(function(t) {
        var isMulti = taskIsMultiDay(t);
        var singleDate = isMulti ? null : (taskDueDates(t)[0]||null);
        var isDone = !isMulti && bulComps.some(function(c){return c.task_id===t.id && c.store_name===store && c.status==='done' && (c.completion_date||null)===singleDate;});
        var isPostponed = !isMulti && bulComps.some(function(c){return c.task_id===t.id && c.store_name===store && c.status==='postponed' && (c.completion_date||null)===singleDate;});
        var compInfo = !isMulti && (bulComps.find(function(c){return c.task_id===t.id && c.store_name===store && (c.completion_date||null)===singleDate;}) || null);
        h += '<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;">';
        if (isMulti) {
          h += '<div style="width:16px;flex-shrink:0;margin-top:2px;text-align:center;font-size:12px;" title="Многодневна — отмятай в Седмичен календар">📅</div>';
        } else {
          h += '<input type="checkbox" '+(isDone?'checked ':'')+ 'data-tid="'+t.id+'" data-cdate="'+(singleDate||'')+'" data-linked="'+(t.linked_module||'')+'" onchange="bulCheckboxChanged(this)"'+bulLockAttr(singleDate,t.linked_module)+' style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:'+d.color+';'+bulLockStyle(singleDate,t.linked_module)+'">' ;
        }
        h += '<div style="flex:1;">';
        h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><div style="font-size:13px;font-weight:500;color:'+(isDone?'#94a3b8':isPostponed?'#b45309':'#0f172a')+';'+(isDone?'text-decoration:line-through;':'')+'">';
        h += esc(t.title||'')+'</div>'+taskTypeBadgeHtml(t.task_type,t.id,'regular',!isGlobal()&&!isMulti&&!isDone,singleDate)+(isPostponed?'<span style="font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:#fff7ed;color:#b45309;border:1px solid #fed7aa;white-space:nowrap;">⏱ Отложена</span>':'')+'</div>';
        if (t.description) h += '<div style="font-size:11px;color:#94a3b8;overflow-wrap:break-word;">'+linkify(t.description)+'</div>';
        h += renderTaskAttachments(t);
        if (isMulti) {
          h += '<div style="font-size:10px;color:#7c3aed;margin-top:2px;">📅 Дни: '+taskDueLabel(t)+' — отмятай в 📅 Седмичен календар</div>';
        } else if (singleDate) {
          var due = new Date(singleDate+'T00:00:00');
          var today = new Date(); today.setHours(0,0,0,0);
          var diff = Math.ceil((due-today)/86400000);
          var dueColor = diff < 0 ? '#dc2626' : diff <= 2 ? '#d97706' : '#94a3b8';
          h += '<div style="font-size:10px;color:'+dueColor+';margin-top:2px;">📅 Срок: '+due.toLocaleDateString("bg-BG")+(diff<0?' ⚠️ Просрочено':diff===0?' (Днес!)':diff<=2?' ('+diff+' дни)':'')+'</div>';
        }
        if (isDone && compInfo) {
          h += '<div style="font-size:10px;color:#16a34a;margin-top:2px;">✓ '+esc(compInfo.completed_by||'')+'</div>';
        }
        if (compInfo && (compInfo.comment||(compInfo.photos&&compInfo.photos.length))) h += renderCompletionExtras(compInfo);
        h += renderSubtasks(t.id, dk);
        h += '</div>';
        h += '<div style="display:flex;gap:4px;flex-shrink:0;">';
        if (!isGlobal() && !isMulti && !isDone) {
          if (isPostponed) h += '<button data-task-id="'+t.id+'" data-cdate="'+(singleDate||'')+'" onclick="cancelPostpone(this.dataset.taskId,\'regular\',this.dataset.cdate||null)" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#7c3aed;border-radius:5px;padding:2px 7px;font-size:10px;cursor:pointer;white-space:nowrap;">↩ Отмени</button>';
          else h += '<button data-task-id="'+t.id+'" data-cdate="'+(singleDate||'')+'" onclick="openPostponeModal(this.dataset.taskId,\'regular\',this.dataset.cdate||null)" style="border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:5px;padding:2px 7px;font-size:10px;cursor:pointer;white-space:nowrap;">⏱ Отложи</button>';
        }
        if (canEdit()) {
          h += '<button data-task-id="'+t.id+'" onclick="openEditTaskModal(this.dataset.taskId)" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#2563eb;">✏️</button>';
          h += '<button data-task-id="'+t.id+'" data-etitle="'+esc(t.title)+'" onclick="openNotifyScheduleModal(\'task\',this.dataset.taskId,this.dataset.etitle)" style="border:1px solid #fde68a;background:#fffbeb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#d97706;">🔔</button>';
          h += '<button data-task-id="'+t.id+'" onclick="bulDelTask(this)" style="border:1px solid #fecaca;background:#fff5f5;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;color:#dc2626;">✕</button>';
        }
        h += '</div>';
        h += '</div>';
      });
      /* Постоянни задачи за отдела */
      h += renderRecurringTasks(dk);
      h += '</div></div>';
    });

  } else {
    /* ── СТАТИСТИКА ЗА АДМИН ── */
    h += '<div id="tasks-stat-wrap">⏳ Зареждане на статистика...</div>';
    setTimeout(loadTasksStats, 100);
  }

  h += '</div>';
  return h;
}


/* toggleTask — отбелязване/разотбелязване на задача */
function toggleTask(taskId, checked, extra, completionDate) {
  var store = currentUser && currentUser.store_name;
  if (!store) { toast('Грешка: няма магазин','#dc2626'); return; }
  completionDate = completionDate || null; /* null = еднодневна/стара задача, старо поведение */
  if (checked) {
    extra = extra || {};
    /* Съществуващ запис за СЪЩИЯ ден (completion_date) - UPDATE вместо
       INSERT. За многодневна задача всеки ден си има собствен ред, затова
       completion_date участва в проверката, не само task_id+store_name. */
    var existing = bulComps.find(function(c){ return c.task_id===taskId && c.store_name===store && (c.completion_date||null)===completionDate; });
    var completedBy = currentUser.display_name || currentUser.email;
    var basePayload = {
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      status: 'done',
      comment: extra.comment || null,
      photos: (extra.photos && extra.photos.length) ? extra.photos : null,
      files: (extra.files && extra.files.length) ? extra.files : null,
      completion_date: completionDate
    };
    var matchQuery = 'task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)+(completionDate?'&completion_date=eq.'+completionDate:'&completion_date=is.null');
    var req = existing
      ? sbPatch('task_completions', matchQuery, basePayload)
      : sbPost('task_completions', Object.assign({task_id:taskId, bulletin_id: curBul?curBul.id:null, store_name:store}, basePayload));
    req.then(function(r){
      if (!r.ok) { toast('Грешка','#dc2626'); return; }
      toast('✅ Задачата е отбелязана!');
      bulComps = bulComps.filter(function(c){ return !(c.task_id===taskId && c.store_name===store && (c.completion_date||null)===completionDate); });
      bulComps.push(Object.assign({task_id: taskId, store_name: store, completed_by: completedBy, status:'done', completion_date: completionDate}, extra.comment?{comment:extra.comment}:{}, (extra.photos&&extra.photos.length)?{photos:extra.photos}:{}, (extra.files&&extra.files.length)?{files:extra.files}:{}));
      renderBulletin();
    });
  } else {
    var delQuery = 'task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)+(completionDate?'&completion_date=eq.'+completionDate:'&completion_date=is.null');
    sbDelete('task_completions', delQuery).then(function(res){
      /* Локалното почистване на bulComps СТАВА САМО при успех — иначе екранът
         показва "неизпълнена", а базата пази отмятането до следващия reload. */
      if(!res.ok){
        console.error('отмяна на изпълнение: НЕ беше изтрито',taskId,store,res.error);
        toast('⚠️ Отмяната НЕ мина: '+sbErrMsg(res),'#dc2626');
        loadBulletin(); return;
      }
      if(res.count===0){ toast('Нямаше какво да се отмени — обновено','#64748b'); loadBulletin(); return; }
      toast('↩ Отбелязана като неизпълнена');
      bulComps = bulComps.filter(function(c){return !(c.task_id===taskId && c.store_name===store && (c.completion_date||null)===completionDate);});
      renderBulletin();
    });
  }
}

function bulToggleTask(cb){toggleTask(cb.dataset.tid, cb.checked);}

/* Маршрутизира чекбокса според вида на задачата: 'info' -> директно отбелязване
   (както досега); 'photo'/'comment'/'photo_comment' -> отваря модал, който
   събира изисканото, преди да се запише изпълнението. Разотбелязване (uncheck)
   винаги е директно - не се пита повторно за коментар/снимка. */
function bulCheckboxChanged(cb){
  if (bulLockRejected(cb)) return;
  var taskId = cb.dataset.tid;
  var completionDate = cb.dataset.cdate || null; /* конкретен ден за многодневна задача, ако е зададен */
  if (!cb.checked) { toggleTask(taskId, false, null, completionDate); return; }
  var t = bulTasks.find(function(x){ return String(x.id)===String(taskId); });
  var tt = TASK_TYPES[(t&&t.task_type)||'info'];
  if (!tt || (!tt.needsPhoto && !tt.needsComment)) { toggleTask(taskId, true, null, completionDate); return; }
  cb.checked = false; /* до потвърждение от модала */
  openTaskCompletionModal(taskId, 'regular', completionDate);
}

function renderCompletionExtras(compInfo){
  var h = '<div style="margin-top:4px;padding:6px 9px;background:#f8fafc;border-radius:6px;border:1px solid #f1f5f9;">';
  if (compInfo.comment) h += '<div style="font-size:11px;color:#475569;">💬 '+esc(compInfo.comment)+'</div>';
  var att = tcAttachListHtml(compInfo, 44);
  if (att) {
    h += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:'+(compInfo.comment?'5px':'0')+';">'+att+'</div>';
  }
  h += '</div>';
  return h;
}

/* ─── МОДАЛ ЗА ЗАВЪРШВАНЕ (коментар, снимка и/или документ) ─────────── */
var tcPendingPhotos = []; /* качени снимки за текущия отворен модал, преди запис */
var tcPendingFiles  = []; /* качени документи — отделен буфер, отделна колона */
function openTaskCompletionModal(taskId, kind, completionDate){
  kind = kind || 'regular';
  completionDate = completionDate || null;
  var t = (kind==='recurring' ? recurringTasks : bulTasks).find(function(x){ return String(x.id)===String(taskId); });
  if (!t) return;
  var tt = TASK_TYPES[t.task_type||'info'];
  /* Трета защита: единственият вход към модала, който не минава през чекбокс,
     е клик върху баджа (taskTypeBadgeClick). Проверката е тук, за да покрие и
     него, и всяко бъдещо извикване отдругаде. */
  var lockReason = bulDateLockReason(completionDate);
  if (lockReason) { toast(bulLockLabel(lockReason),'#d97706'); return; }
  tcPendingPhotos = [];
  tcPendingFiles = [];
  var existing = document.getElementById('tc-modal-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'tc-modal-ov';
  var body = '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">✅ Отбележи като изпълнена</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">'+esc(t.title||'')+(completionDate?' — '+new Date(completionDate+'T00:00:00').toLocaleDateString('bg-BG'):'')+'</div>';
  if (tt.needsComment) {
    body += '<label class="fl">Коментар *</label><textarea class="fi" id="tc-comment" rows="3" placeholder="Опиши какво е свършено / защо не е..."></textarea>';
  }
  if (tt.needsPhoto) {
    body += '<label class="fl">Снимка *</label>' +
      '<div id="tc-photos-preview" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>' +
      '<label style="display:inline-flex;align-items:center;gap:4px;border:1px dashed #cbd5e1;border-radius:5px;padding:5px 10px;font-size:12px;color:#475569;cursor:pointer;">' +
      '📷 + Добави снимка<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif" style="display:none;" onchange="tcUploadPhoto(this)"></label>';
  }
  if (tt.needsFile) {
    body += '<label class="fl">Документ *</label>' +
      '<div id="tc-files-preview" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;"></div>' +
      '<label style="display:inline-flex;align-items:center;gap:4px;border:1px dashed #cbd5e1;border-radius:5px;padding:5px 10px;font-size:12px;color:#475569;cursor:pointer;">' +
      '📄 + Добави документ<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx" style="display:none;" onchange="tcUploadFile(this)"></label>';
  }
  body += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="var e=document.getElementById(&#39;tc-modal-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-task-id="'+taskId+'" data-kind="'+kind+'" data-cdate="'+(completionDate||'')+'" onclick="submitTaskCompletion(this.dataset.taskId,this.dataset.kind,this.dataset.cdate||null)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">✓ Потвърди</button>' +
    '</div>';
  ov.innerHTML = '<div class="bmod" style="width:420px;">'+body+'</div>';
  document.body.appendChild(ov);
}
/* Общото качване. Разширението се проверява ПРЕДИ мрежата — accept не спира
   нищо. buf/prevId/label различават двата вида, останалото е едно и също. */
function tcUpload(input, allowed, what, buf, prevId, renderPrev, okMsg){
  var file = input.files[0]; if (!file) return;
  if (allowed.indexOf(tcExtOf(file.name)) < 0) {
    toast(tcExtReject(file.name, allowed, what), '#dc2626');
    input.value = ''; /* иначе същият файл не може да се избере повторно */
    return;
  }
  var ext = tcExtOf(file.name);
  var fname = 'completion_'+Date.now()+'.'+ext;
  var path = 'task-completions/'+fname;
  showBulToast('⏳ Качване...');
  var reader = new FileReader();
  reader.onload = function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if (!ok) { toast('Грешка при качване','#dc2626'); return; }
      buf.push({url:BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path, filename:file.name});
      var prev = document.getElementById(prevId);
      if (prev) prev.innerHTML = buf.map(renderPrev).join('');
      toast(okMsg);
    }).catch(function(){ toast('Грешка при качване','#dc2626'); });
  };
  reader.readAsArrayBuffer(file);
}
function tcUploadPhoto(input){
  tcUpload(input, TC_PHOTO_EXT, 'снимка', tcPendingPhotos, 'tc-photos-preview',
    function(p){ return '<img src="'+p.url+'" style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;">'; },
    '✅ Снимката е качена');
}
function tcUploadFile(input){
  tcUpload(input, TC_FILE_EXT, 'документ', tcPendingFiles, 'tc-files-preview',
    function(f){ return '<div style="font-size:12px;color:#475569;">📄 '+esc(f.filename)+'</div>'; },
    '✅ Документът е качен');
}
function submitTaskCompletion(taskId, kind, completionDate){
  kind = kind || 'regular';
  completionDate = completionDate || null;
  var t = (kind==='recurring' ? recurringTasks : bulTasks).find(function(x){ return String(x.id)===String(taskId); });
  if (!t) return;
  var tt = TASK_TYPES[t.task_type||'info'];
  var comment = tt.needsComment ? (document.getElementById('tc-comment').value||'').trim() : '';
  if (tt.needsComment && !comment) { toast('Въведи коментар','#dc2626'); return; }
  if (tt.needsPhoto && !tcPendingPhotos.length) { toast('Добави поне 1 снимка','#dc2626'); return; }
  if (tt.needsFile && !tcPendingFiles.length) { toast('Добави поне 1 документ','#dc2626'); return; }
  var el = document.getElementById('tc-modal-ov');
  if (el) el.remove();
  var extra = { comment: comment, photos: tcPendingPhotos.slice(), files: tcPendingFiles.slice() };
  if (kind==='recurring') toggleRecurringTask(taskId, true, extra, completionDate);
  else toggleTask(taskId, true, extra, completionDate);
  tcPendingPhotos = [];
  tcPendingFiles = [];
}

/* ─── ОТЛАГАНЕ НА ЗАДАЧА (изисква коментар, вижда се в седмичния репорт) ───
   kind: 'regular' (по подразбиране) или 'recurring' - работи еднакво и за
   двата вида, за да могат постоянните задачи да се отлагат както обикновените. */
/* completionDate = датата на явяването, за което се отлага - СЪЩАТА, която
   compObj съпоставянето очаква (singleDate за обикновена задача ~840,
   singleRecDate за постоянна ~2764). Без нея редът се записваше с null и
   след 17fdc7d (recurringIsDateScoped() винаги true, значи singleRecDate
   никога не е null) вече не съвпадаше с нищо - значката "⏱ Отложена" не се
   появяваше и бутонът оставаше "Отложи". Същото важи и за обикновена задача
   с дата. Носи се през dataset, точно както data-cdate на чекбокса. */
function openPostponeModal(taskId, kind, completionDate){
  kind = kind || 'regular';
  var t = (kind==='recurring' ? recurringTasks : bulTasks).find(function(x){ return String(x.id)===String(taskId); });
  if (!t) return;
  var existing = document.getElementById('pp-modal-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'pp-modal-ov';
  ov.innerHTML = '<div class="bmod" style="width:400px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">⏱ Отложи задачата</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">'+esc(t.title||'')+'</div>' +
    '<label class="fl">Причина за отлагане *</label>' +
    '<textarea class="fi" id="pp-comment" rows="3" placeholder="Защо не може да се изпълни сега..."></textarea>' +
    '<div style="font-size:11px;color:#94a3b8;margin-top:6px;">Ще се вижда в седмичния репорт до офиса.</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="var e=document.getElementById(&#39;pp-modal-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-task-id="'+taskId+'" data-kind="'+kind+'" data-cdate="'+(completionDate||'')+'" onclick="submitPostpone(this.dataset.taskId,this.dataset.kind,this.dataset.cdate||null)" style="border:none;background:#d97706;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">⏱ Отложи</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var el=document.getElementById('pp-comment'); if(el)el.focus(); }, 80);
}
function submitPostpone(taskId, kind, completionDate){
  kind = kind || 'regular';
  completionDate = completionDate || null;
  var comment = (document.getElementById('pp-comment').value||'').trim();
  if (!comment) { toast('Въведи причина за отлагането','#dc2626'); return; }
  var store = currentUser && currentUser.store_name;
  if (!store) { toast('Грешка: няма магазин','#dc2626'); return; }
  var idField = kind==='recurring' ? 'recurring_task_id' : 'task_id';
  var payload = {
    store_name: store,
    completed_by: currentUser.display_name || currentUser.email,
    completed_at: new Date().toISOString(),
    status: 'postponed',
    comment: comment,
    completion_date: completionDate
  };
  payload[idField] = taskId;
  if (kind!=='recurring') payload.bulletin_id = curBul ? curBul.id : null;
  sbPost('task_completions', payload).then(function(r){
    if (!r.ok) { toast('Грешка','#dc2626'); return; }
    var el = document.getElementById('pp-modal-ov');
    if (el) el.remove();
    toast('⏱ Задачата е отложена');
    /* completion_date и в локалния обект - иначе renderBulletin() веднага
       след това пак не намира съвпадение и значката не се появява до reload */
    var pushObj = { store_name: store, completed_by: currentUser.display_name||currentUser.email, status:'postponed', comment: comment, completion_date: completionDate };
    pushObj[idField] = taskId;
    if (kind==='recurring') recurringComps.push(pushObj); else bulComps.push(pushObj);
    renderBulletin();
  });
}
/* Маха САМО реда за отлагане. Досега филтърът беше само task+store, тоест
   изтриваше ВСИЧКИ completion-и за задачата в този магазин - включително
   легитимни "done" отмятания за други дни. При многодневна задача с отметнат
   вторник отмяната на отлагане отнасяше и вторника.
   submitPostpone() записва status='postponed' И completion_date на явяването,
   затова филтърът е по двете - точно както toggleTask()/toggleRecurringTask()
   скопират своя INSERT/DELETE. Стар ред отпреди датата има completion_date=
   null и се хваща от completion_date=is.null клона. */
function cancelPostpone(taskId, kind, completionDate){
  kind = kind || 'regular';
  completionDate = completionDate || null;
  var store = currentUser && currentUser.store_name;
  if (!store) return;
  var idField = kind==='recurring' ? 'recurring_task_id' : 'task_id';
  var dateQ = completionDate ? '&completion_date=eq.'+completionDate : '&completion_date=is.null';
  sbDelete('task_completions', idField+'=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)+'&status=eq.postponed'+dateQ).then(function(res){
    if(!res.ok){
      console.error('отмяна на отлагане: НЕ беше изтрито',taskId,store,res.error);
      toast('⚠️ Отмяната НЕ мина: '+sbErrMsg(res),'#dc2626');
      loadBulletin(); return;
    }
    if(res.count===0){ toast('Нямаше отлагане за отмяна — обновено','#64748b'); loadBulletin(); return; }
    toast('↩ Отлагането е отменено');
    /* String()===String() е само защитно. id-тата в схемата са uuid, значи
       и dataset низът, и стойността от PostgREST са низове и обикновеното
       === работи - по-ранен коментар тук твърдеше, че не работи, което беше
       грешка. Оставено за симетрия с recurringTasks.find() по-долу. */
    if (kind==='recurring') recurringComps = recurringComps.filter(function(c){return !(String(c.recurring_task_id)===String(taskId) && c.store_name===store && c.status==='postponed' && (c.completion_date||null)===completionDate);});
    else bulComps = bulComps.filter(function(c){return !(String(c.task_id)===String(taskId) && c.store_name===store && c.status==='postponed' && (c.completion_date||null)===completionDate);});
    renderBulletin();
  });
}

function loadTasksStats() {
  var wrap = document.getElementById('tasks-stat-wrap');
  if (!wrap || !bulTasks.length) return;

  /* Филтърът беше преписан тук с твърдо 'Централен офис' и пропускаше двата
     логистични склада — 20 обекта вместо 18. Един източник за всички бройки
     (виж loadReportableStores() в shared.js), не осмо копие на условието. */
  loadReportableStores().then(function(stores){
    if (!stores.length) { wrap.innerHTML=''; return; }

    /* Датите от бюлетинската седмица, в които всяка постоянна задача е
       дължима - същият принцип като report.js:reportRecurringWeekDates() и
       като седмичния календар по-горе (recurringForDay, ~690): всеки дължим
       ден получава СОБСТВЕН чекбокс, тоест е отделна единица работа и влиза
       като ОТДЕЛЕН елемент в знаменателя, а не 1 на задача. Задача "без
       срок" (без ден И без час) дава 0 дати и не участва никъде - точно
       както report.js я изважда от recurringScheduled в noDueCount.
       Двойката (wk,yr) идва от самия бюлетин, за да няма разминаване между
       ISO седмица и календарна година (капанът около Нова година).
       Смята се ВЕДНЪЖ, не наново за всеки магазин × отдел. */
    var statWk = curBul ? curBul.week_number : weekNum(new Date());
    var statYr = curBul ? curBul.year : new Date().getFullYear();
    var statWeekDays = weekDays(statWk, statYr).map(function(d){ return toLocalISO(d); });
    var statRecDates = {}, statRecWindow = {};
    recurringTasks.forEach(function(t){
      var out = [];
      /* Прозоречната задача е ЕДНА единица работа за седмицата, не N —
         затова тук се явява веднъж, в деня на срока. Отмятането обаче може
         да е на кой да е ден от прозореца, затова съпоставянето по-долу
         минава през целия прозорец. */
      statWeekDays.forEach(function(iso, idx){ if (recurringReportDueOnWeekday(t, idx)) out.push(iso); });
      if (recurringIsWindow(t)) statRecWindow[t.id] = recurringWindowDatesInWeek(t, weekDays(statWk, statYr));
      statRecDates[t.id] = out;
    });

    var depts = ['trade','warehouse','admin'];
    var h = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    h += '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;">Магазин</th>';
    depts.forEach(function(dk){
      h += '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid #e2e8f0;">'+DEPTS[dk].icon+' '+DEPTS[dk].label+'</th>';
    });
    h += '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid #e2e8f0;">Общо</th>';
    h += '</tr></thead><tbody>';

    stores.forEach(function(store) {
      var totalDone=0, totalAll=0;
      h += '<tr style="border-bottom:1px solid #f1f5f9;">';
      h += '<td style="padding:7px 12px;font-weight:500;">'+esc(store)+'</td>';
      depts.forEach(function(dk){
        /* Само задачите, за които този магазин е в обхват (target_stores
           празно/null = всички, или изрично включен) - иначе магазин без
           достъп до дадена задача пак се брои в знаменателя ѝ, изкуствено
           занижавайки % му. Същият модел като в today.js/report.js. */
        var dTasks = bulTasks.filter(function(t){
          if(t.department!==dk)return false;
          return !t.target_stores||!t.target_stores.length||t.target_stores.indexOf(store)>=0;
        });
        var done = dTasks.filter(function(t){
          return bulComps.some(function(c){return c.task_id===t.id&&c.store_name===store&&c.status==='done';});
        }).length;
        /* Постоянните задачи също влизат в таблицата - иначе отдел, в който
           тази седмица има САМО постоянни задачи (напр. Администрация),
           показва "—" за всички магазини, все едно там няма никаква работа.
           Обхватът по target_stores е същият модел като при обикновените
           по-горе и в notifications.js/report.js. */
        var dRec = recurringTasks.filter(function(t){
          if(t.department!==dk)return false;
          return !t.target_stores||!t.target_stores.length||t.target_stores.indexOf(store)>=0;
        });
        var recAll=0, recDone=0;
        dRec.forEach(function(t){
          var winDates = statRecWindow[t.id] || null;
          (statRecDates[t.id]||[]).forEach(function(iso){
            recAll++;
            /* Прозорец: брои се отмятане на КОЙ ДА Е ден от прозореца, не само
               в деня на срока — иначе задача, свършена по-рано, излиза
               неизпълнена. */
            if (recurringComps.some(function(c){
              if(c.recurring_task_id!==t.id||c.store_name!==store||c.status!=='done')return false;
              return winDates ? winDates.indexOf(c.completion_date||'')>=0 : (c.completion_date||null)===iso;
            })) recDone++;
          });
        });
        var doneCnt = done + recDone, allCnt = dTasks.length + recAll;
        totalDone+=doneCnt; totalAll+=allCnt;
        var pct = allCnt ? Math.round(doneCnt/allCnt*100) : null;
        var bg = pct===null?'#f8fafc':pct===100?'#f0fdf4':pct>50?'#fffbeb':'#fff5f5';
        var color = pct===null?'#94a3b8':pct===100?'#16a34a':pct>50?'#d97706':'#dc2626';
        h += '<td style="text-align:center;padding:7px 12px;background:'+bg+';">';
        if (pct !== null) h += '<span style="color:'+color+';font-weight:600;">'+doneCnt+'/'+allCnt+'</span>';
        else h += '<span style="color:#cbd5e1;">—</span>';
        h += '</td>';
      });
      var totalPct = totalAll ? Math.round(totalDone/totalAll*100) : 0;
      var totBg = totalPct===100?'#f0fdf4':totalPct>50?'#fffbeb':'#fff5f5';
      var totColor = totalPct===100?'#16a34a':totalPct>50?'#d97706':'#dc2626';
      h += '<td style="text-align:center;padding:7px 12px;background:'+totBg+';"><b style="color:'+totColor+';">'+totalPct+'%</b></td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
    wrap.innerHTML = h;
  });
}

function renderBulAnalysis(){
  var wrap=document.getElementById('mod-bulletin'); if(!wrap)return;
  var wk=curBul?curBul.week_number:weekNum(new Date());
  var html=bulHdr(curBul&&curBul.status==='draft')+BULCSS+'<div style="max-width:1320px;margin:0 auto;padding:16px 16px 60px;">';
  html+='<div style="font-size:18px;font-weight:600;margin-bottom:16px;">📊 Анализ — Седмица '+wk+'</div>';
  if(!bulTasks.length){html+='<div class="bcard" style="text-align:center;padding:30px;color:#94a3b8;">Няма задачи.</div>';wrap.innerHTML=html+'</div>';return;}
  var ds={};bulComps.forEach(function(c){ds[c.task_id]=1;});
  var done=Object.keys(ds).length; var tot=bulTasks.length;
  var ss={};bulComps.forEach(function(c){ss[c.store_name]=1;});
  var over=bulTasks.filter(function(t){var dts=taskDueDates(t);return dts.length&&new Date(dts[dts.length-1])<new Date()&&!ds[t.id];}).length;
  html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">';
  [['📋 Задачи',tot,'общо','#2563eb'],['✅ Изпълнени',done,'задачи','#16a34a'],['🔴 Просрочени',over,'без изпълнение','#dc2626'],['🏪 Магазини',Object.keys(ss).length,'са отметнали','#d97706']].forEach(function(card){
    html+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+card[3]+';"><div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+card[0]+'</div><div style="font-size:26px;font-weight:700;color:'+card[3]+';font-family:DM Mono,monospace;">'+card[1]+'</div><div style="font-size:11px;color:#94a3b8;">'+card[2]+'</div></div>';
  });
  html+='</div>';
  html+='<div class="bcard"><div style="font-size:13px;font-weight:600;margin-bottom:12px;">Задачи по магазини</div><div id="an-tbl"><div style="text-align:center;padding:20px;color:#94a3b8;">⏳ Зареждане...</div></div></div></div>';
  wrap.innerHTML=html;
  /* Знаменателят на процента е броят обекти, които реално могат да отметнат
     — същият източник като календара и седмичния имейл. Таблицата stores
     броеше и ЦО, двата склада и обектите без акаунт, тоест всеки процент
     тук беше занижен. */
  loadReportableStores().then(function(all){
    var tbl='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Задача</th><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Отдел</th><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Срок</th><th style="text-align:left;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Изпълнили</th><th style="text-align:right;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">%</th></tr></thead><tbody>';
    bulTasks.forEach(function(task){
      var comps=bulComps.filter(function(c){return c.task_id===task.id;});
      var pct=all.length?Math.round(comps.length/all.length*100):0;
      var isOv=(function(){var dts=taskDueDates(task);return dts.length&&new Date(dts[dts.length-1])<new Date()&&!ds[task.id];})();
      var d=DEPTS[task.department]||{label:task.department,color:'#94a3b8',bg:'#f3f4f6',bdr:'#e2e8f0'};
      tbl+='<tr style="border-bottom:1px solid #f1f5f9;'+(isOv?'background:#fff5f5;':'')+'"><td style="padding:7px 10px;font-weight:500;">'+esc(task.title||'')+'</td><td style="padding:7px 10px;"><span style="background:'+d.bg+';color:'+d.color+';border:1px solid '+d.bdr+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+d.label+'</span></td><td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:'+(isOv?'#dc2626':'#64748b')+';">'+(taskDueLabel(task)||'—')+(isOv?' 🔴':'')+'</td><td style="padding:7px 10px;">'+(comps.length?comps.map(function(c){return '<span style="background:#dcfce7;color:#14532d;font-size:10px;padding:1px 6px;border-radius:20px;margin:1px 2px;display:inline-block;">'+esc(c.store_name)+'</span>';}).join(''):'<span style="color:#94a3b8;font-size:11px;">—</span>')+'</td><td style="padding:7px 10px;text-align:right;font-family:DM Mono,monospace;font-weight:700;color:'+(pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626')+';">'+pct+'%</td></tr>';
    });
    tbl+='</tbody></table></div>';
    var el=document.getElementById('an-tbl'); if(el)el.innerHTML=tbl;
  });
}

/* ═══════ ПОСТОЯННИ ЗАДАЧИ ════════════════════════════════════ */
function renderRecurringTasks(dk) {
  var store = currentUser && currentUser.store_name;
  var dTasksAll = recurringTasks.filter(function(t){return t.department===dk;});
  /* Магазин вижда само постоянни задачи БЕЗ target_stores (= всички) или
     изрично таргетирани към него - огледално на обикновените задачи. */
  var dTasks = dTasksAll.filter(function(t){
    return isGlobal()||!t.target_stores||!t.target_stores.length||(store&&t.target_stores.indexOf(store)>=0);
  });
  if (!dTasks.length && !canEdit()) return '';
  var d = DEPTS[dk];
  /* За многодневни (due_weekdays) постоянни задачи трябва конкретната дата
     ОТ ТАЗИ седмица за всеки избран ден от седмицата, за да работи
     completion_date проверката коректно (същия механизъм като обикновените
     многодневни задачи). */
  var wkNum = curBul ? curBul.week_number : weekNum(new Date());
  var wkYr = curBul ? curBul.year : new Date().getFullYear();
  var weekDaysArr = weekDays(wkNum, wkYr);
  function weekdayIdxToDate(idx){ return toLocalISO(weekDaysArr[idx]); }

  var h = '<div style="background:#fff;border:1px solid ' + d.bdr + ';border-left:4px solid ' + d.hdr + ';border-radius:8px;margin-bottom:12px;overflow:hidden;">';
  h += '<div style="background:' + d.bg + ';padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">';
  h += '<div style="font-size:12px;font-weight:700;color:' + d.color + ';text-transform:uppercase;letter-spacing:.06em;">🔁 Постоянни задачи</div>';
  if (canEdit()) {
    h += '<button onclick="openRecurringModal(\'' + dk + '\')" style="border:1px solid ' + d.hdr + ';background:#fff;color:' + d.color + ';border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;">+ Добави</button>';
  }
  h += '</div>';

  if (dTasks.length) {
    h += '<div style="padding:8px 14px;">';
    dTasks.forEach(function(t,recIdxInDept) {
      var isMultiRec = recurringIsMultiDay(t);
      /* Прозоречната задача има ЕДНО състояние, затова минава по
         единично-дневния път. Датата ѝ е днешната, ако днес е в прозореца
         (тогава чекбоксът е отключен), иначе срокът — така заключването само
         казва „още не е настъпил"/„приключил". */
      var isWinRec = recurringIsWindow(t);
      var winComp = isWinRec ? recurringWindowComp(t,store,weekDaysArr) : null;
      var singleRecDate = isMultiRec ? null
        : (isWinRec ? recurringWindowCheckDate(t,weekDaysArr)
          : (recTaskWeekdays(t).length ? weekdayIdxToDate(recTaskWeekdays(t)[0]) : toLocalISO(new Date())));
      var compObj = winComp || (store && !isMultiRec && recurringComps.find(function(c){return c.recurring_task_id===t.id && c.store_name===store && (c.completion_date||null)===singleRecDate;}));
      var done = !!compObj && compObj.status==='done';
      var postponed = !!compObj && compObj.status==='postponed';
      var dueToday = recurringIsDueToday(t);
      var isFirstRec=recIdxInDept===0, isLastRec=recIdxInDept===dTasks.length-1;
      var titleColor = done?'#94a3b8':postponed?'#b45309':'#0f172a';
      h += '<div class="rec-task-row" style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;">';
      if (canEdit()) {
        h += '<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;margin-top:1px;">'+
          '<button data-rtid2="'+t.id+'" onclick="recMoveUp(this.dataset.rtid2)" '+(isFirstRec?'disabled':'')+' style="border:1px solid #e2e8f0;background:'+(isFirstRec?'#f8fafc':'#fff')+';color:'+(isFirstRec?'#cbd5e1':'#64748b')+';border-radius:3px;width:16px;height:14px;font-size:9px;line-height:1;cursor:'+(isFirstRec?'default':'pointer')+';padding:0;">▲</button>'+
          '<button data-rtid2="'+t.id+'" onclick="recMoveDown(this.dataset.rtid2)" '+(isLastRec?'disabled':'')+' style="border:1px solid #e2e8f0;background:'+(isLastRec?'#f8fafc':'#fff')+';color:'+(isLastRec?'#cbd5e1':'#64748b')+';border-radius:3px;width:16px;height:14px;font-size:9px;line-height:1;cursor:'+(isLastRec?'default':'pointer')+';padding:0;">▼</button>'+
          '</div>';
      }
      if (isMultiRec) {
        h += '<div style="width:16px;flex-shrink:0;margin-top:2px;text-align:center;font-size:12px;" title="Многодневна — отмятай в Седмичен календар">📅</div>';
      } else {
        h += '<input type="checkbox" ' + (done?'checked ':'') + 'data-rtid="' + t.id + '" data-cdate="'+(singleRecDate||'')+'" data-linked="'+(t.linked_module||'')+'" onchange="bulRecurringCheckboxChanged(this)"' + (winComp?recurringWindowDoneAttr(winComp):bulLockAttr(singleRecDate,t.linked_module)) + ' ' +
          'style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:' + d.color + ';flex-shrink:0;' + (winComp?'opacity:.45;cursor:not-allowed;':bulLockStyle(singleRecDate,t.linked_module)) + '">';
      }
      h += '<div style="flex:1;">';
      h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><div style="font-size:13px;font-weight:500;color:' + titleColor + ';' + (done?'text-decoration:line-through;':'') + '">' + esc(t.title||'') + '</div>'+taskTypeBadgeHtml(t.task_type,t.id,'recurring',!isGlobal()&&!isMultiRec&&!done,singleRecDate)+(postponed?'<span style="font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:#fff7ed;color:#b45309;border:1px solid #fed7aa;white-space:nowrap;">⏱ Отложена</span>':'')+'</div>';
      if (t.description) h += '<div style="font-size:11px;color:#94a3b8;overflow-wrap:break-word;">' + linkify(t.description) + '</div>';
      var dueLbl = recurringDueLabel(t);
      if (isMultiRec) {
        h += '<div style="font-size:10px;color:#7c3aed;margin-top:2px;">🔁 Дни: '+dueLbl+'</div>';
        if (!isGlobal() && store) {
          var doneDaysCountRec = t.due_weekdays.filter(function(idx){
            var d2 = weekdayIdxToDate(idx);
            return recurringComps.some(function(c){return c.recurring_task_id===t.id&&c.store_name===store&&c.status==='done'&&(c.completion_date||null)===d2;});
          }).length;
          h += '<div style="font-size:10px;color:#7c3aed;margin-top:2px;">✅ '+doneDaysCountRec+'/'+t.due_weekdays.length+' дни отметнати тази седмица — отмятай в 📅 Седмичен календар по-горе</div>';
        } else if (isGlobal()) {
          h += '<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Живи бройки по дни виж в 📅 Седмичен календар по-горе</div>';
        }
      } else if (dueLbl) {
        h += '<div style="font-size:10px;color:'+(dueToday&&!done?'#d97706':'#94a3b8')+';margin-top:2px;">🔁 '+dueLbl+(dueToday&&!done?' (днес!)':'')+'</div>';
      }
      if(isGlobal()&&t.target_stores&&t.target_stores.length)h+='<div style="font-size:10px;color:#7c3aed;margin-top:2px;">🏬 Само за: '+t.target_stores.map(esc).join(', ')+'</div>';
      if(compObj&&(compObj.comment||(compObj.photos&&compObj.photos.length)))h+=renderCompletionExtras(compObj);
      h += renderRecurringAttachments(t);
      h += '</div>';
      var showBtns='';
      if(!isGlobal()&&!isMultiRec&&!done){
        if(postponed)showBtns+='<button data-task-id="'+t.id+'" data-cdate="'+(singleRecDate||'')+'" onclick="cancelPostpone(this.dataset.taskId,\'recurring\',this.dataset.cdate||null)" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#7c3aed;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;white-space:nowrap;">↩ Отмени</button>';
        else showBtns+='<button data-task-id="'+t.id+'" data-cdate="'+(singleRecDate||'')+'" onclick="openPostponeModal(this.dataset.taskId,\'recurring\',this.dataset.cdate||null)" style="border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;white-space:nowrap;">⏱ Отложи</button>';
      }
      if (showBtns) h += '<div style="flex-shrink:0;align-self:flex-start;">'+showBtns+'</div>';
      if (canEdit()) {
        h += '<div style="display:flex;gap:4px;">';
        h += '<button onclick="openEditRecurringModal(\'' + t.id + '\')" style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#2563eb;">✏️</button>';
        h += '<button data-rid="'+t.id+'" data-etitle="'+esc(t.title)+'" onclick="openNotifyScheduleModal(\'recurring_task\',this.dataset.rid,this.dataset.etitle)" style="border:1px solid #fde68a;background:#fffbeb;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#d97706;">🔔</button>';
        h += '<button onclick="toggleRecurringActive(\'' + t.id + '\',' + (!t.active) + ')" style="border:1px solid #e2e8f0;background:#fff;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#64748b;">' + (t.active?'⏸ Спри':'▶ Активирай') + '</button>';
        h += '<button onclick="deleteRecurring(\'' + t.id + '\')" style="border:1px solid #fecaca;background:#fff5f5;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:#dc2626;">✕</button>';
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  } else if (canEdit()) {
    h += '<div style="padding:12px 14px;color:#94a3b8;font-size:12px;font-style:italic;">Няма постоянни задачи. Добави с бутона горе.</div>';
  }
  h += '</div>';
  return h;
}

/* ── ▲/▼ пренареждане на постоянни задачи (в рамките на отдела) - заменя
   нестабилния drag&drop подход. ── */
function recMoveUp(id){ moveRecInDept(id,-1); }
function recMoveDown(id){ moveRecInDept(id,1); }
function moveRecInDept(id,dir){
  var task=recurringTasks.find(function(t){return String(t.id)===String(id);});
  if(!task)return;
  var dept=task.department;
  var deptTasks=recurringTasks.filter(function(t){return t.department===dept;});
  var idx=deptTasks.findIndex(function(t){return String(t.id)===String(id);});
  var newIdx=idx+dir;
  if(newIdx<0||newIdx>=deptTasks.length)return;
  var tmp=deptTasks[idx]; deptTasks[idx]=deptTasks[newIdx]; deptTasks[newIdx]=tmp;
  var patches=deptTasks.map(function(t,i){
    t.sort_order=i+1;
    return sbPatch('recurring_tasks','id=eq.'+t.id,{sort_order:i+1});
  });
  recurringTasks.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
  Promise.all(patches).then(function(){ renderBulletin(); });
}
function toggleRecurringTask(taskId, checked, extra, completionDate) {
  var store = currentUser && currentUser.store_name;
  if (!store) { toast('Грешка: няма магазин','#dc2626'); return; }
  completionDate = completionDate || null; /* null = стара постоянна задача (1 ден/всеки ден) - изпълнението остава завинаги, както досега */
  if (checked) {
    extra = extra || {};
    /* Upsert - ако вече има запис за СЪЩИЯ ден, UPDATE вместо INSERT. За
       многодневна (due_weekdays) постоянна задача всеки ден си има
       собствен ред, затова completion_date участва в проверката. */
    var existing = recurringComps.find(function(c){ return c.recurring_task_id===taskId && c.store_name===store && (c.completion_date||null)===completionDate; });
    var completedBy = currentUser.display_name || currentUser.email;
    var basePayload = {
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      status: 'done',
      comment: extra.comment || null,
      photos: (extra.photos && extra.photos.length) ? extra.photos : null,
      files: (extra.files && extra.files.length) ? extra.files : null,
      completion_date: completionDate
    };
    var matchQuery = 'recurring_task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)+(completionDate?'&completion_date=eq.'+completionDate:'&completion_date=is.null');
    var req = existing
      ? sbPatch('task_completions', matchQuery, basePayload)
      : sbPost('task_completions', Object.assign({recurring_task_id:taskId, store_name:store}, basePayload));
    req.then(function(r){
      if (!r.ok) { toast('Грешка','#dc2626'); return; }
      toast('✅ Отбелязана!');
      recurringComps = recurringComps.filter(function(c){ return !(c.recurring_task_id===taskId && c.store_name===store && (c.completion_date||null)===completionDate); });
      recurringComps.push(Object.assign({recurring_task_id: taskId, store_name: store, completed_by: completedBy, status:'done', completion_date: completionDate}, extra.comment?{comment:extra.comment}:{}, (extra.photos&&extra.photos.length)?{photos:extra.photos}:{}, (extra.files&&extra.files.length)?{files:extra.files}:{}));
      renderBulletin();
    });
  } else {
    var delQuery = 'recurring_task_id=eq.'+taskId+'&store_name=eq.'+encodeURIComponent(store)+(completionDate?'&completion_date=eq.'+completionDate:'&completion_date=is.null');
    sbDelete('task_completions', delQuery).then(function(res){
      if(!res.ok){
        console.error('отмяна на изпълнение (постоянна): НЕ беше изтрито',taskId,store,res.error);
        toast('⚠️ Отмяната НЕ мина: '+sbErrMsg(res),'#dc2626');
        loadBulletin(); return;
      }
      if(res.count===0){ toast('Нямаше какво да се отмени — обновено','#64748b'); loadBulletin(); return; }
      toast('↩ Отбелязана като неизпълнена');
      recurringComps = recurringComps.filter(function(c){return !(c.recurring_task_id===taskId && c.store_name===store && (c.completion_date||null)===completionDate);});
      renderBulletin();
    });
  }
}
/* Маршрутизира чекбокса на постоянна задача според вида ѝ - огледално на
   bulCheckboxChanged() за обикновените задачи. */
function bulRecurringCheckboxChanged(cb){
  if (bulLockRejected(cb)) return;
  var taskId = cb.dataset.rtid;
  var completionDate = cb.dataset.cdate || null;
  if (!cb.checked) { toggleRecurringTask(taskId, false, null, completionDate); return; }
  var t = recurringTasks.find(function(x){ return String(x.id)===String(taskId); });
  var tt = TASK_TYPES[(t&&t.task_type)||'info'];
  if (!tt || (!tt.needsPhoto && !tt.needsComment)) { toggleRecurringTask(taskId, true, null, completionDate); return; }
  cb.checked = false;
  openTaskCompletionModal(taskId, 'recurring', completionDate);
}

function toggleRecurringActive(id, active) {
  sbPatch('recurring_tasks','id=eq.'+id,{active:active}).then(function(){
    toast(active ? '▶ Активирана' : '⏸ Спряна');
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

function openRecurringModal(dk) {
  var d = DEPTS[dk];
  var existing = document.getElementById('rec-modal-ov');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'rec-modal-ov';
  ov.innerHTML = '<div class="bmod" style="width:420px;">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:14px;">🔁 Нова постоянна задача — ' + d.label + '</div>' +
    '<label class="fl">Заглавие *</label><input class="fi" id="rec-title" placeholder="напр. Провери наличностите">' +
    '<label class="fl">Описание</label><input class="fi" id="rec-desc" placeholder="Допълнителна информация">' +
    '<label class="fl">Повтарящи се дни (по избор)</label>' +
    recWeekdaysCheckboxesHtml('rec-weekdays', []) +
    recWindowToggleHtml('rec-window','rec-weekdays', false, 0) +
    '<label class="fl">Час (по избор)</label><input type="time" class="fi" id="rec-time">' +
    '<label class="fl">Вид задача</label><select class="fi" id="rec-type">'+taskTypeOptsHtml('info')+'</select>' +
    '<label class="fl">Магазини — остави без избор за ВСИЧКИ</label>' +
    '<select class="fi" id="rec-stores" multiple size="6" style="height:120px;"></select>' +
    '<label class="fl">Групи за докладване</label>' +
    reportGroupsCheckboxesHtml('rec-report-groups', []) +
    '<label class="fl">Свързан таб (по избор)</label>' +
    '<select class="fi" id="rec-linked-module">'+linkedModuleOptsHtml('')+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
    '<button onclick="var e=document.getElementById(&#39;rec-modal-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-dk="' + dk + '" onclick="submitRecurring(this.dataset.dk)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  bulFillStoreMultiSelect('rec-stores', []);
  recWindowBindDays('rec-weekdays','rec-window');
  setTimeout(function(){ var el=document.getElementById('rec-title'); if(el)el.focus(); }, 100);
}
/* Опции за dropdown "повтарящ се ден" — value="" означава "всеки ден" (due_weekday=null) */
/* Multi-select checkbox списък за избор на НЯКОЛКО дни от седмицата (за
   постоянна задача - напр. винаги Пон+Сряд+Пет). selectedIdxs: масив от
   индекси 0=Пон..6=Нед. Празен избор = старото поведение ("Всеки ден", ако
   има час, иначе без конкретен ден) - due_weekdays е ЧИСТО ДОПЪЛНЕНИЕ. */
function recWeekdaysCheckboxesHtml(selId, selectedIdxs){
  selectedIdxs = selectedIdxs || [];
  var h = '<div id="'+selId+'" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">';
  DNAMES.forEach(function(name,i){
    var checked = selectedIdxs.indexOf(i)>=0;
    h += '<label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#374151;cursor:pointer;">' +
      '<input type="checkbox" value="'+i+'"'+(checked?' checked':'')+' style="width:13px;height:13px;cursor:pointer;">' + name.slice(0,3) +
      '</label>';
  });
  h += '<div style="grid-column:1/-1;font-size:10px;color:#94a3b8;margin-top:2px;">Остави без избор = всеки ден (ако е зададен час)</div>';
  h += '</div>';
  return h;
}
function readRecWeekdaysCheckboxes(selId){
  var wrap = document.getElementById(selId);
  if (!wrap) return [];
  return Array.prototype.slice.call(wrap.querySelectorAll('input[type=checkbox]:checked')).map(function(cb){ return parseInt(cb.value,10); });
}
/* Превключвателят „прозорец" виси на избора на дни: смисъл има само при
   2..6 избрани. Контролата НЕ се крие — стои видима и disabled, с
   обяснение защо (правило 11). */
function recWindowToggleHtml(selId, daysId, checked, dayCount){
  var usable = dayCount>1 && dayCount<7;
  return '<label id="'+selId+'-wrap" style="display:flex;align-items:center;gap:7px;font-size:12.5px;margin-top:6px;'+(usable?'color:#374151;cursor:pointer;':'color:#94a3b8;cursor:not-allowed;opacity:.6;')+'"'+
    (usable?'':' title="Изисква между 2 и 6 избрани дни"')+'>'+
    '<input type="checkbox" id="'+selId+'" data-days="'+daysId+'"'+((checked&&usable)?' checked':'')+(usable?'':' disabled')+
    ' onchange="recWindowToggleChanged(this)" style="width:14px;height:14px;cursor:inherit;">'+
    'Прозорец до последния ден (една отметка за цялата седмица)</label>';
}
/* Преоценява достъпността след всяка промяна по дните. Излиза ли изборът от
   2..6, превключвателят се изключва И се размаркира — иначе би останал
   включен с невалидна стойност, която клиентът и без това игнорира. */
function recWindowSyncToggle(selId, daysId){
  var cb = document.getElementById(selId), wrap = document.getElementById(selId+'-wrap');
  if(!cb||!wrap) return;
  var n = readRecWeekdaysCheckboxes(daysId).length;
  var usable = n>1 && n<7;
  cb.disabled = !usable;
  if(!usable) cb.checked = false;
  wrap.style.color = usable ? '#374151' : '#94a3b8';
  wrap.style.cursor = usable ? 'pointer' : 'not-allowed';
  wrap.style.opacity = usable ? '1' : '.6';
  if(usable) wrap.removeAttribute('title'); else wrap.setAttribute('title','Изисква между 2 и 6 избрани дни');
}
function recWindowToggleChanged(cb){ recWindowSyncToggle(cb.id, cb.dataset.days); }
/* Закача се на контейнера с дните, за да не се пише onchange на седем места. */
function recWindowBindDays(daysId, selId){
  var wrap = document.getElementById(daysId);
  if(!wrap) return;
  wrap.addEventListener('change', function(){ recWindowSyncToggle(selId, daysId); });
  recWindowSyncToggle(selId, daysId);
}
/* Стойността за запис. Връща false, ако изборът на дни не позволява прозорец
   — така невалидна комбинация не стига до базата. */
function readRecWindow(selId, daysId){
  var cb = document.getElementById(selId);
  if(!cb||!cb.checked) return false;
  var n = readRecWeekdaysCheckboxes(daysId).length;
  return n>1 && n<7;
}
function recurringDueLabel(t){
  /* Прозорец: „Пон–Сря до 16:00" — тире, не плюс. Плюсът чете като три
     отделни задължения, а тук денят е един, с разрешено по-рано. */
  if(recurringIsWindow(t)){
    var w=recurringWindowIdxs(t);
    return DNAMES[w[0]].slice(0,3)+'–'+DNAMES[w[w.length-1]].slice(0,3)+(t.due_time?(' до '+t.due_time):'');
  }
  if(t.due_weekdays && t.due_weekdays.length){
    var names = t.due_weekdays.slice().sort(function(a,b){return a-b;}).map(function(i){return DNAMES[i].slice(0,3);}).join('+');
    return names + (t.due_time ? (' до '+t.due_time) : '');
  }
  var hasWeekday = t.due_weekday!==null && t.due_weekday!==undefined;
  if(!hasWeekday){
    return t.due_time ? ('Всеки ден до '+t.due_time) : '';
  }
  var dayName = DNAMES[t.due_weekday]||'';
  return dayName + (t.due_time ? (' до '+t.due_time) : '');
}
/* Постоянна задача с НЯКОЛКО избрани дни (due_weekdays) - изпълнението е
   истински обвързано с конкретния ден/седмица (completion_date), огледално
   на многодневните обикновени задачи.
   ВСЯКА постоянна задача е date-scoped, вкл. единично-дневните (старо поле
   due_weekday) и "всеки ден" (без due_weekday/due_weekdays) - иначе
   изпълнението се записва с completion_date=null и задачата остава
   "изпълнена" завинаги, вместо да се нулира на всяко следващо явяване. */
/* ─── ПРОЗОРЕЦ ЗА ИЗПЪЛНЕНИЕ ────────────────────────────────
   due_window превключва смисъла на due_weekdays: последният ден е СРОК,
   предходните са „разрешено по-рано", и ЕДНА отметка където и да е в
   прозореца затваря задачата за цялата седмица — един елемент в
   статистиката, не N. Без него [0,1,2] са три отделни задължения: три
   чекбокса, три отмятания, три пъти в знаменателя. „Справка до сряда",
   свършена в понеделник, е свършена.
   Смисъл има само при 2..6 избрани дни: при 0 или 1 няма какво да е
   „по-рано", а при всичките 7 задачата е „всеки ден" (така е зададен
   „Вечерен оборот"). Извън този диапазон стойността се ИГНОРИРА, вместо
   поведението да се промени мълчаливо. */
function recurringIsWindow(t){
  if(!t||!t.due_window) return false;
  var d=(t.due_weekdays&&t.due_weekdays.length)?t.due_weekdays:[];
  return d.length>1 && d.length<7;
}
function recurringWindowIdxs(t){
  return ((t&&t.due_weekdays)||[]).slice().sort(function(a,b){return a-b;});
}
function recurringWindowDeadlineIdx(t){
  var d=recurringWindowIdxs(t); return d.length?d[d.length-1]:null;
}
/* Датите на прозореца в подадената седмица. weekArr е [Пон..Нед]. */
function recurringWindowDatesInWeek(t,weekArr){
  if(!recurringIsWindow(t)||!weekArr) return [];
  return recurringWindowIdxs(t).map(function(i){ return toLocalISO(weekArr[i]); });
}
/* Същото, но за седмицата на КОНКРЕТНА дата. Смята се от понеделника ѝ, не
   през weekNum/година — така няма разминаване между ISO седмица и
   календарна година около Нова година. */
function recurringWindowDatesForDate(t,d){
  if(!recurringIsWindow(t)) return [];
  var mon=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
  return recurringWindowIdxs(t).map(function(i){
    var x=new Date(mon); x.setDate(mon.getDate()+i); return toLocalISO(x);
  });
}
/* Отмятането, което затваря прозореца за тази седмица, или null. */
function recurringWindowComp(t,store,weekArr){
  if(!store||!recurringIsWindow(t)) return null;
  var dates=recurringWindowDatesInWeek(t,weekArr), found=null;
  recurringComps.forEach(function(c){
    if(found)return;
    if(c.recurring_task_id===t.id&&c.store_name===store&&c.status==='done'&&dates.indexOf(c.completion_date||'')>=0)found=c;
  });
  return found;
}
/* Датата, с която прозоречна задача се отмята от блока „Постоянни задачи":
   днес, ако е В прозореца (тогава bulDateLockReason я отключва), иначе
   срокът — така самото заключване казва „още не е настъпил"/„приключил",
   вместо да отвори отмятане извън прозореца. */
function recurringWindowCheckDate(t,weekArr){
  var dates=recurringWindowDatesInWeek(t,weekArr);
  if(!dates.length) return null;
  var td=bulTodayISO();
  return dates.indexOf(td)>=0 ? td : dates[dates.length-1];
}
/* Атрибути за вече затворен прозорец: отметнат и заключен на ВСЕКИ ден от
   прозореца, с датата на реалното изпълнение в title. */
function recurringWindowDoneAttr(comp){
  return ' disabled title="Изпълнена на '+esc(fmtDate(comp.completion_date))+'"';
}
/* Постоянна задача с НЯКОЛКО избрани дни, които са ОТДЕЛНИ задължения.
   Прозоречната задача НЕ е такава — тя има едно състояние и минава по
   единично-дневния път навсякъде (календар, блок, печат). */
function recurringIsMultiDay(t){ return !recurringIsWindow(t) && recTaskWeekdays(t).length>1; }
function recurringIsDateScoped(t){ return true; }
function recurringIsDueOnWeekday(t,weekdayIdx){
  if(t.due_weekdays && t.due_weekdays.length) return t.due_weekdays.indexOf(weekdayIdx)>=0;
  if(t.due_weekday===null||t.due_weekday===undefined){
    return !!t.due_time; /* "всеки ден" - важи за всеки делничен ден */
  }
  return t.due_weekday===weekdayIdx;
}
/* За ОТЧЕТИТЕ: прозоречна задача се явява ВЕДНЪЖ — в деня на срока.
   Календарът пази recurringIsDueOnWeekday(), защото там чекбоксът стои на
   всеки ден от прозореца; отчетът брои единици работа, а те са една. */
function recurringReportDueOnWeekday(t,weekdayIdx){
  if(recurringIsWindow(t)) return weekdayIdx===recurringWindowDeadlineIdx(t);
  return recurringIsDueOnWeekday(t,weekdayIdx);
}
function recurringIsDueToday(t){
  var jsDay=new Date().getDay(); /* 0=Нед,1=Пон...6=Съб */
  var idx=jsDay===0?6:jsDay-1; /* превръщаме в 0=Пон..5=Съб,6=Нед */
  return recurringReportDueOnWeekday(t, idx);
}

function submitRecurring(dk) {
  var title = (document.getElementById('rec-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var desc = document.getElementById('rec-desc').value||'';
  var weekdays = readRecWeekdaysCheckboxes('rec-weekdays');
  var due_weekday = weekdays.length ? weekdays[0] : null; /* първия избран - обратна съвместимост */
  var due_time = document.getElementById('rec-time').value || null;
  var taskType = document.getElementById('rec-type').value||'info';
  var stores = bulReadStoreMultiSelect('rec-stores');
  var reportGroups = readReportGroupsCheckboxes('rec-report-groups');
  var linkedModule = (document.getElementById('rec-linked-module')||{}).value||null;
  sbPost('recurring_tasks',{department:dk,title:title,description:desc,active:true,sort_order:recurringTasks.length,due_weekday:due_weekday,due_weekdays:weekdays.length?weekdays:null,due_window:readRecWindow('rec-window','rec-weekdays'),due_time:due_time,task_type:taskType,target_stores:stores.length?stores:null,report_groups:reportGroups.length?reportGroups:null,linked_module:linkedModule||null}).then(function(r){
    if (!r.ok) { toast('Грешка','#dc2626'); return; }
    var el = document.getElementById('rec-modal-ov');
    if (el) el.remove();
    toast('✅ Постоянната задача е добавена!');
    /* Постоянните задачи не са част от чернова/публикуван цикъл на бюлетина -
       веднага след създаване са видими за таргетираните магазини, затова
       push-ът тръгва без чакане за публикуване (за разлика от обикновените). */
    if(typeof pushNewBulletinTask==='function'){
      pushNewBulletinTask(title, stores.length?stores:null);
    }
    sbGet('recurring_tasks','active=eq.true&order=sort_order.asc').then(function(rt){
      recurringTasks = Array.isArray(rt) ? rt : [];
      renderBulletin();
    });
  });
}

/* ═══════ ПОД-ЗАДАЧИ ══════════════════════════════════════════ */
function renderSubtasks(taskId, dept) {
  var store = currentUser && currentUser.store_name;
  var d = DEPTS[dept] || DEPTS.trade;
  var containerId = 'sub-' + taskId;
  setTimeout(function(){
    sbGet('task_subtasks','task_id=eq.'+taskId+'&order=sort_order.asc').then(function(subs){
      var el = document.getElementById(containerId);
      if (!el) return;
      if (!Array.isArray(subs) || !subs.length) {
        if (canEdit()) {
          var addBtn = document.createElement('button');
          addBtn.style.cssText = 'border:1px dashed #cbd5e1;background:none;color:#94a3b8;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;margin-top:4px;';
          addBtn.textContent = '+ Добави под-задача';
          addBtn.setAttribute('data-tid', taskId);
          addBtn.setAttribute('data-dept', dept);
          addBtn.onclick = function(){ openSubtaskModal(this.getAttribute('data-tid'), this.getAttribute('data-dept')); };
          el.appendChild(addBtn);
        }
        return;
      }
      var h = '<div style="padding:4px 0 4px 20px;border-left:2px solid '+d.bdr+';margin-top:4px;">';
      subs.forEach(function(s){
        var done = store && subtaskComps.some(function(c){return c.subtask_id===s.id && c.store_name===store;});
        var due = s.due_date ? new Date(s.due_date) : null;
        var t0 = new Date(); t0.setHours(0,0,0,0);
        var diff = due ? Math.ceil((due-t0)/86400000) : null;
        var dueColor = diff===null?'#94a3b8':diff<0?'#dc2626':diff<=1?'#d97706':'#94a3b8';
        h += '<div style="padding:4px 0;">';
        h += '<div style="display:flex;align-items:center;gap:8px;">';
        h += '<input type="checkbox" '+(done?'checked ':'')+' data-stid="'+s.id+'" onchange="bulToggleSubtask(this)" style="width:13px;height:13px;cursor:pointer;accent-color:'+d.color+';">';
        h += '<span style="font-size:12px;color:'+(done?'#94a3b8':'#374151')+';'+(done?'text-decoration:line-through;':'')+'">' + esc(s.title) + '</span>';
        if(due) h += '<span style="font-size:10px;color:'+dueColor+';">📅 '+fmtDate2(s.due_date)+(diff<0?' ⚠️':'')+'</span>';
        if (canEdit()) h += '<button data-stid="'+s.id+'" data-etitle="'+esc(s.title)+'" onclick="openNotifyScheduleModal(\'subtask\',this.dataset.stid,this.dataset.etitle)" style="border:none;background:none;color:#d97706;font-size:10px;cursor:pointer;padding:0;line-height:1;">🔔</button>';
        if (canEdit()) h += '<button data-stid="'+s.id+'" data-tid="'+taskId+'" data-dept="'+dept+'" onclick="deleteSubtask(this.dataset.stid,this.dataset.tid,this.dataset.dept)" style="border:none;background:none;color:#dc2626;font-size:10px;cursor:pointer;padding:0;line-height:1;">✕</button>';
        h += '</div>';
        if(s.description) h += '<div style="font-size:11px;color:#94a3b8;margin:2px 0 0 21px;overflow-wrap:break-word;">'+linkify(s.description)+'</div>';
        h += '<div style="margin-left:21px;">'+renderSubtaskAttachments(s)+'</div>';
        h += '</div>';
      });
      if (canEdit()) {
        h += '<button data-tid="'+taskId+'" data-dept="'+dept+'" onclick="openSubtaskModal(this.dataset.tid,this.dataset.dept)" style="border:1px dashed #cbd5e1;background:none;color:#94a3b8;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer;margin-top:4px;">+ Добави под-задача</button>';
      }
      h += '</div>';
      el.innerHTML = h;
    });
  }, 50);
  return '<div id="' + containerId + '"></div>';
}

function bulToggleSubtask(cb) {
  var stid = cb.dataset.stid;
  var store = currentUser && currentUser.store_name;
  if (!store) return;
  if (cb.checked) {
    sbPost('subtask_completions',{subtask_id:stid,store_name:store,completed_by:currentUser.display_name||currentUser.email,completed_at:new Date().toISOString()}).then(function(r){
      if (!r.ok) { toast('Грешка','#dc2626'); cb.checked=false; return; }
      subtaskComps.push({subtask_id:stid,store_name:store});
      toast('✅ Под-задачата е отбелязана!');
    });
  } else {
    sbDelete('subtask_completions','subtask_id=eq.'+stid+'&store_name=eq.'+encodeURIComponent(store)).then(function(res){
      if(!res.ok){
        console.error('отмяна на подзадача: НЕ беше изтрито',stid,store,res.error);
        toast('⚠️ Отмяната НЕ мина: '+sbErrMsg(res),'#dc2626');
        return;
      }
      if(res.count===0){ toast('Нямаше какво да се отмени','#64748b'); return; }
      subtaskComps = subtaskComps.filter(function(c){return !(c.subtask_id===stid&&c.store_name===store);});
      toast('↩ Отбелязана като неизпълнена');
    });
  }
}

function openSubtaskModal(taskId, dept) {
  var existing = document.getElementById('st-modal-ov');
  if (existing) existing.remove();
  var wk = curBul ? curBul.week_number : weekNum(new Date());
  var yr = curBul ? curBul.year : new Date().getFullYear();
  var days = weekDays(wk, yr);
  var dueOpts = '<option value="">— Без срок —</option>' + DKEYS.map(function(k,i){
    return '<option value="'+toLocalISO(days[i])+'">'+DNAMES[i]+' ('+fmtD(days[i])+')</option>';
  }).join('');
  var ov = document.createElement('div');
  ov.className = 'bov open';
  ov.id = 'st-modal-ov';
  ov.innerHTML = '<div class="bmod" style="width:380px;">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">+ Нова под-задача</div>' +
    '<label class="fl">Заглавие *</label><input class="fi" id="st-title" placeholder="напр. Провери склад А">' +
    '<label class="fl">Описание</label><textarea class="fi" id="st-desc" rows="2" placeholder="Допълнителни детайли..."></textarea>' +
    '<label class="fl">Срок — ден от седмицата</label><select class="fi" id="st-due">'+dueOpts+'</select>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
    '<button onclick="var e=document.getElementById(&#39;st-modal-ov&#39;);if(e)e.remove();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button data-tid="' + taskId + '" data-dept="' + dept + '" onclick="submitSubtask(this.dataset.tid,this.dataset.dept)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  setTimeout(function(){var el=document.getElementById('st-title');if(el)el.focus();},100);
}

function submitSubtask(taskId, dept) {
  var title = (document.getElementById('st-title').value||'').trim();
  if (!title) { toast('Въведи заглавие','#dc2626'); return; }
  var desc = (document.getElementById('st-desc')||{}).value||'';
  var due = (document.getElementById('st-due')||{}).value || null;
  sbPost('task_subtasks',{task_id:taskId,title:title,description:desc,sort_order:0,due_date:due}).then(function(r){
    if (!r.ok) { toast('Грешка','#dc2626'); return; }
    var el = document.getElementById('st-modal-ov');
    if (el) el.remove();
    toast('✅ Под-задачата е добавена!');
    sbGet('subtask_completions','store_name=eq.'+encodeURIComponent(currentUser.store_name)).then(function(sc){
      subtaskComps = Array.isArray(sc)?sc:[];
      renderSubtasks(taskId, dept);
    });
  });
}

function deleteSubtask(stId, taskId, dept) {
  if (!confirm('Изтрий под-задачата?')) return;
  sbDelete('task_subtasks','id=eq.'+stId).then(function(res){
    if(!res.ok){
      console.error('deleteSubtask: под-задачата НЕ беше изтрита',stId,res.error);
      toast('⚠️ Под-задачата НЕ беше изтрита: '+sbErrMsg(res),'#dc2626');
      renderSubtasks(taskId, dept); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — обновено','#64748b'); renderSubtasks(taskId, dept); return; }
    toast('Изтрита');
    renderSubtasks(taskId, dept);
  });
}

function renderSubtaskAttachments(s){
  var atts=normAttachments(s.attachments);
  var h='';
  if(atts.length){
    h+='<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px;">';
    atts.forEach(function(a,i){
      h+='<div style="position:relative;">';
      if(a.type==='image'){
        h+='<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:40px;height:40px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;"></a>';
      }else{
        h+='<a href="'+a.url+'" target="_blank" style="display:flex;align-items:center;gap:3px;padding:3px 6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;font-size:10px;color:#2563eb;text-decoration:none;max-width:90px;">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.filename||'Файл')+'</span></a>';
      }
      if(canEdit())h+='<button data-stid="'+s.id+'" data-idx="'+i+'" data-tid="'+s.task_id+'" onclick="subtaskRemoveAttachment(this.dataset.stid,this.dataset.idx,this.dataset.tid)" style="position:absolute;top:-5px;right:-5px;width:14px;height:14px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(canEdit()){
    h+='<label style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;border:1px dashed #cbd5e1;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#94a3b8;cursor:pointer;">'+
      '📎 + Снимка/файл<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none;" data-stid="'+s.id+'" data-tid="'+s.task_id+'" onchange="subtaskUploadAttachment(this)"></label>';
  }
  return h;
}
function subtaskUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  var stId=input.getAttribute('data-stid');
  var taskId=input.getAttribute('data-tid');
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname='sub_'+stId+'_'+Date.now()+'.'+ext;
  var path='bulletin-tasks/'+fname;
  showBulToast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(BUL_SB+'/storage/v1/object/'+BUL_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+BUL_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=BUL_SB+'/storage/v1/object/public/'+BUL_BKT+'/'+path;
      sbGet('task_subtasks','id=eq.'+stId).then(function(rows){
        var cur=Array.isArray(rows)&&rows[0]?rows[0]:{};
        var atts=normAttachments(cur.attachments).slice();
        atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
        sbPatch('task_subtasks','id=eq.'+stId,{attachments:atts}).then(function(res){
          if(!res.ok){toast('Грешка при запис','#dc2626');return;}
          toast('✅ Прикачено!');
          /* намираме dept на задачата за пре-рендиране */
          var t=bulTasks.find(function(x){return String(x.id)===String(taskId);});
          renderSubtasks(taskId, t?t.department:'trade');
        });
      });
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function subtaskRemoveAttachment(stId,idx,taskId){
  sbGet('task_subtasks','id=eq.'+stId).then(function(rows){
    var cur=Array.isArray(rows)&&rows[0]?rows[0]:{};
    var atts=normAttachments(cur.attachments).slice();
    atts.splice(idx,1);
    sbPatch('task_subtasks','id=eq.'+stId,{attachments:atts}).then(function(res){
      if(!res.ok){toast('Грешка','#dc2626');return;}
      var t=bulTasks.find(function(x){return String(x.id)===String(taskId);});
      renderSubtasks(taskId, t?t.department:'trade');
    });
  });
}

/* ══════════════════════════════════════════
   ГРАФИК ЗА НОТИФИКАЦИИ (ръчно зададени, изпращат се от сървъра)
══════════════════════════════════════════ */
var DOW_LABELS={mon:'Понеделник',tue:'Вторник',wed:'Сряда',thu:'Четвъртък',fri:'Петък',sat:'Събота',sun:'Неделя'};
var notifyCurrentEntity=null;

function openNotifyScheduleModal(entityType,entityId,entityTitle){
  notifyCurrentEntity={type:entityType,id:entityId,title:entityTitle};
  var old=document.getElementById('notify-modal-ov'); if(old)old.remove();
  var ov=document.createElement('div');
  ov.className='bov open'; ov.id='notify-modal-ov';
  ov.innerHTML='<div class="bmod" style="width:460px;max-height:85vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'+
    '<div style="font-size:15px;font-weight:700;">🔔 Нотификации</div>'+
    '<button onclick="closeNotifyScheduleModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="font-size:12px;color:#94a3b8;margin-bottom:14px;">за: <b style="color:#374151;">'+esc(entityTitle||'')+'</b></div>'+
    '<div id="notify-list-wrap"><div style="text-align:center;padding:12px;color:#94a3b8;font-size:12px;">⏳ Зареждане...</div></div>'+
    '<div style="border-top:1px solid #e2e8f0;margin:16px 0;padding-top:14px;">'+
    '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">+ Нов график</div>'+
    '<select class="fi" id="ns-type" onchange="updateNotifyTypeFields()" style="margin-bottom:8px;">'+
      '<option value="once">Еднократно</option>'+
      '<option value="daily">Всеки ден</option>'+
      '<option value="weekly">Всяка седмица</option>'+
    '</select>'+
    '<div id="ns-date-wrap" style="margin-bottom:8px;"><input type="date" class="fi" id="ns-date" value="'+today()+'"></div>'+
    '<div id="ns-dow-wrap" style="margin-bottom:8px;display:none;"><select class="fi" id="ns-dow">'+
      Object.keys(DOW_LABELS).map(function(k){return '<option value="'+k+'">'+DOW_LABELS[k]+'</option>';}).join('')+
    '</select></div>'+
    '<input type="time" class="fi" id="ns-time" value="09:00" style="margin-bottom:8px;">'+
    '<input class="fi" id="ns-message" placeholder="Текст на нотификацията (по избор - иначе автоматично)" style="margin-bottom:8px;">'+
    '<button onclick="submitNotifySchedule()" style="border:none;background:#d97706;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">+ Добави график</button>'+
    '</div>'+
    '</div>';
  document.body.appendChild(ov);
  loadNotifySchedules();
}
function updateNotifyTypeFields(){
  var type=document.getElementById('ns-type').value;
  document.getElementById('ns-date-wrap').style.display=type==='once'?'':'none';
  document.getElementById('ns-dow-wrap').style.display=type==='weekly'?'':'none';
}
function closeNotifyScheduleModal(){
  var ov=document.getElementById('notify-modal-ov'); if(ov)ov.remove();
  notifyCurrentEntity=null;
}
function loadNotifySchedules(){
  if(!notifyCurrentEntity)return;
  sbGet('notification_schedules','entity_type=eq.'+notifyCurrentEntity.type+'&entity_id=eq.'+notifyCurrentEntity.id+'&order=created_at.desc').then(function(data){
    var list=Array.isArray(data)?data:[];
    var wrap=document.getElementById('notify-list-wrap'); if(!wrap)return;
    if(!list.length){wrap.innerHTML='<div style="text-align:center;padding:10px;color:#94a3b8;font-size:12px;">Няма зададени графици.</div>';return;}
    wrap.innerHTML=list.map(function(s){
      var typeLabel=s.schedule_type==='once'?('Еднократно · '+fmtDate2(s.scheduled_date))
        :s.schedule_type==='daily'?'Всеки ден'
        :('Всяка седмица · '+(DOW_LABELS[s.day_of_week]||s.day_of_week));
      var sentLabel=s.last_sent_at?('<span style="color:#16a34a;">✓ изпратено последно '+fmtDate2(s.last_sent_at)+'</span>'):'<span style="color:#94a3b8;">още не е изпратено</span>';
      return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:12px;'+(s.active?'':'opacity:.5;')+'">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;">'+
        '<div><b>'+typeLabel+'</b> в '+esc(s.scheduled_time.slice(0,5))+'ч.</div>'+
        '<div style="display:flex;gap:4px;">'+
        '<button data-id="'+s.id+'" data-active="'+(!s.active)+'" onclick="toggleNotifySchedule(this.dataset.id,this.dataset.active===\'true\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:2px 7px;font-size:10px;cursor:pointer;">'+(s.active?'⏸':'▶')+'</button>'+
        '<button data-id="'+s.id+'" onclick="deleteNotifySchedule(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 7px;font-size:10px;cursor:pointer;">✕</button>'+
        '</div></div>'+
        (s.message?'<div style="color:#64748b;margin-top:3px;">💬 '+esc(s.message)+'</div>':'')+
        '<div style="margin-top:3px;font-size:10.5px;">'+sentLabel+'</div>'+
        '</div>';
    }).join('');
  });
}
function submitNotifySchedule(){
  if(!notifyCurrentEntity)return;
  var type=document.getElementById('ns-type').value;
  var time=document.getElementById('ns-time').value;
  if(!time){toast('Задай час','#dc2626');return;}
  var data={
    entity_type:notifyCurrentEntity.type,
    entity_id:String(notifyCurrentEntity.id),
    schedule_type:type,
    scheduled_time:time,
    message:document.getElementById('ns-message').value.trim(),
    active:true,
    created_by:currentUser.display_name||currentUser.email
  };
  if(type==='once'){
    var d=document.getElementById('ns-date').value;
    if(!d){toast('Избери дата','#dc2626');return;}
    data.scheduled_date=d;
  }
  if(type==='weekly'){
    data.day_of_week=document.getElementById('ns-dow').value;
  }
  sbPost('notification_schedules',data).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('✅ Графикът е зададен!');
    document.getElementById('ns-message').value='';
    loadNotifySchedules();
  });
}
function toggleNotifySchedule(id,active){
  sbPatch('notification_schedules','id=eq.'+id,{active:active}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    loadNotifySchedules();
  });
}
function deleteNotifySchedule(id){
  if(!confirm('Изтрий този график?'))return;
  sbDelete('notification_schedules','id=eq.'+id).then(function(res){
    if(!res.ok){toast('Грешка при изтриване','#dc2626');return;}
    toast('✅ Изтрито!');
    loadNotifySchedules();
  });
}
