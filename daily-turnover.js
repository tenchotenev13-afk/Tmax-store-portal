/* ═══════════════════════════════════════════════════════════════
   ВЕЧЕРЕН ОБОРОТ — подтаб в Каса (таблица public.daily_turnover)

   НЕ е счетоводен запис. Истинската каса остава в kasa_reports /
   kasa_glavna / kasa_zoborot и се попълва на следващия ден. Тук се
   въвежда веднъж вечерта това, което магазините днес пращат по имейл.
   Записът не се коригира, не се връща за преработка и няма статус —
   при грешка истината идва от ПОС отчета на следващия ден.

   Логиката е в отделен файл, а не в kasa.js, защото kasa.js е голям и
   се пипа от други сесии. В kasa.js влизат само три реда: името на
   таба в масива, клонът в kasaTab() и петият бутон в kasaTabBar().

   Емоджитата са HTML entity-та, не сурови символи в JS низ — виж
   „Emoji в JS низове" в docs/PATTERNS.md (surrogate pair грешки в стар
   Android Chrome). Съседните бутони в kasa.js са със сурови емоджита;
   те не се пипат в тази задача.
══════════════════════════════════════════════════════════════ */

/* ─── STATE ─────────────────────────────────────────────────── */
var oborotToday=null;      /* днешният запис за моя обект, или null */
var oborotRecent=[];       /* моите записи за последните 30 дни (desc) */
var oborotCORows=[];       /* редовете за избраната дата — изглед ЦО */
var oborotCOStores=[];     /* имената на всички обекти — изглед ЦО */
var oborotCODate=null;     /* избраната дата в изгледа ЦО */
var oborotSubmitting=false;/* пази от двоен клик, докато POST-ът е във въздуха */
var oborotTaskWarn=false;  /* оборотът е записан, но отмятането в Бюлетина не мина */

/* ─── HELPERS ───────────────────────────────────────────────── */
/* toLocalISO() живее в bulletin.js:466 и НЕ се предефинира тук.
   Вика се по време на действие, не при зареждане на файла, така че
   редът на скриптовете не е проблем.
   today() от shared.js нарочно не се ползва — той е
   toISOString().slice(0,10) и в ранните часове по българско време
   (UTC+2/+3) дава вчерашна дата. Виж „Дати и часови зони" в PATTERNS.md. */
function dtToday(){return toLocalISO(new Date());}
function dtDay(n){var d=new Date();d.setDate(d.getDate()-n);return toLocalISO(d);}
function dtPad(n){return (n<10?'0':'')+n;}
function dtMoney(n){return (parseFloat(n)||0).toFixed(2)+' лв.';}
/* Запетаята като десетичен знак е рефлекс на българската клавиатура.
   При type="number" браузърът връща празно, тоест проверката за празно
   поле я хваща — това тук е за случаите, в които стойността все пак стигне. */
function dtNum(s){return parseFloat(String(s).replace(',','.'));}
function dtAvgCheck(total,customers){
  var c=parseInt(customers,10)||0;
  if(c<=0)return '—';
  return dtMoney((parseFloat(total)||0)/c);
}
function dtTime(ts){
  if(!ts)return '';
  var d=new Date(ts);
  if(isNaN(d.getTime()))return '';
  return dtPad(d.getHours())+':'+dtPad(d.getMinutes());
}
/* Среден оборот за обекта от последните 30 дни, БЕЗ днешния запис.
   Служи само за предупреждението „необичайно високо" при запис. */
function dtAvg30(){
  var t=dtToday(),sum=0,n=0;
  for(var i=0;i<oborotRecent.length;i++){
    var r=oborotRecent[i];
    if(r.date===t)continue;
    sum+=parseFloat(r.total_turnover)||0;
    n++;
  }
  return n?sum/n:0;
}

/* ─── ПРАВО НА ДОСТЪП ───────────────────────────────────────── */
/* Същият списък като в linkedModuleAllowed() (bulletin.js) и същият, по който
   kasaTabBar() решава дали изобщо да върне лента. Проверката стои и ТУК, а не
   само на входа: loadOborot() е глобална и се вика от kasaTab(), от loadKasa()
   и от конзолата. Скрит бутон не е защита — точно както disabled в markup-а на
   чекбокса не спира прякото извикване на обработчика. */
/* Кой ПОДАВА оборот — от обект. Същият списък като в linkedModuleAllowed()
   (bulletin.js) и същият, по който kasaTabBar() решава дали да върне лента. */
var OBOROT_ROLES=['kasa','admin','manager'];
/* Кой ВИЖДА справката по цялата верига — от Централен офис.
   Нарочно по-тесен от „всички в ЦО": там има 58 активни потребителя (проверено
   23.08.2026 — 20 accounting, 15 supply, 12 admin, 9 marketing, 2 user), а
   оборотът на веригата досега стигаше до трима души по имейл. Отваряне на
   справката за целия офис би било тихо разширяване на достъпа, а не следствие
   от тази задача. */
var OBOROT_CO_ROLES=['admin','accounting'];

function oborotCanSubmit(){
  return !!currentUser&&OBOROT_ROLES.indexOf(currentUser.role)>=0;
}
/* Двата случая са РАЗЛИЧНИ права, не едно с изключение: обект подава, ЦО чете.
   Затова и списъците са два — 'kasa' подава, но не чете чуждите обороти;
   'accounting' чете, но не подава. */
function oborotAllowed(){
  if(!currentUser) return false;
  return isCentralOfficeUser()
    ? OBOROT_CO_ROLES.indexOf(currentUser.role)>=0
    : oborotCanSubmit();
}
/* Празен екран изглежда като счупен. Казва се кой подава оборота и какво да
   направи този, който смята, че трябва да има достъп. */
function dtNoAccessBlock(){
  return '<div class="card">'+
    '<div style="display:flex;align-items:center;gap:8px;background:#f8fafc;'+
      'border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;'+
      'font-size:13px;color:#64748b;">'+
      '<span>&#128274;</span>'+
      '<span>Вечерният оборот се подава от управител, каса или администратор. '+
      'Ако смяташ, че трябва да имаш достъп, обади се в офиса.</span>'+
    '</div>'+
  '</div>';
}

/* ─── ЗАРЕЖДАНЕ ─────────────────────────────────────────────── */
function loadOborot(){
  /* Без право не се пращат и заявки — не само формата не се рендира. */
  if(!oborotAllowed()){ renderOborot(); return; }
  if(isCentralOfficeUser()){
    /* Датата се решава при отваряне, не при зареждане на файла — таб,
       оставен отворен през полунощ, иначе би питал за вчера. */
    if(!oborotCODate) oborotCODate=dtToday();
    Promise.all([
      sbGet('stores','select=name&order=name'),
      sbGet('daily_turnover','date=eq.'+oborotCODate+'&order=store_name.asc')
    ]).then(function(res){
      var st=Array.isArray(res[0])?res[0]:[];
      oborotCOStores=st.map(function(s){return s.name;});
      oborotCORows=Array.isArray(res[1])?res[1]:[];
      renderOborot();
    }).catch(function(){renderOborot();});
    return;
  }
  /* Един прочит покрива и трите нужди: днешния запис, таблицата за 7 дни
     и средното за 30 дни. */
  var q='store_name=eq.'+encodeURIComponent(currentUser.store_name)+
        '&date=gte.'+dtDay(29)+'&order=date.desc';
  sbGet('daily_turnover',q).then(function(data){
    oborotRecent=Array.isArray(data)?data:[];
    var t=dtToday();
    oborotToday=null;
    for(var i=0;i<oborotRecent.length;i++){
      if(oborotRecent[i].date===t){oborotToday=oborotRecent[i];break;}
    }
    renderOborot();
  }).catch(function(){renderOborot();});
}

function oborotSetDate(d){
  oborotCODate=d||dtToday();
  loadOborot();
}

/* ─── РЕНДЕР ────────────────────────────────────────────────── */
/* Обвивката .page + заглавие + подзаглавие е същата като на другите четири
   рендера в kasa.js. Без нея отварянето на таба махаше надписа „Каса" от
   страницата — оставаше само лентата, увиснала без заглавие над себе си. */
function renderOborot(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  wrap.innerHTML='<div class="page">'+
    '<div class="pg-title">&#128176; Каса</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+' — Вечерен оборот</div>'+
    kasaTabBar()+
    /* Втора проверка на същото място, където се произвежда формата. Дори
       renderOborot() да бъде извикана директно, поле за въвеждане не излиза. */
    (oborotAllowed()?(isCentralOfficeUser()?dtCOView():dtStoreView()):dtNoAccessBlock())+
  '</div>';
}

/* ── Изглед МАГАЗИН ── */
/* Предупреждението е НАД картата, не вътре в нея: то важи и когато записът
   още не се е върнал от базата и долу пак се вижда формата. */
function dtStoreView(){
  return dtTaskWarnBand()+dtTodayBlock()+dtLast7Block();
}

function dtTodayBlock(){
  /* Вече подаден оборот — само за четене, без бутон за редакция.
     Записът не се коригира; при грешка истината идва от ПОС отчета. */
  if(oborotToday){
    var o=oborotToday;
    return '<div class="card" style="margin-bottom:18px;">'+
      '<div class="card-title">&#128176; Оборот за днес — '+fmtDate(dtToday())+'</div>'+
      '<div style="display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #16a34a;'+
        'border-radius:8px;padding:10px 12px;margin-bottom:14px;color:#16a34a;font-size:13px;">'+
        '<span>&#9989;</span><span>Оборотът за днес е записан'+
        (dtTime(o.created_at)?' в '+dtTime(o.created_at):'')+
        (o.created_by?' от '+esc(o.created_by):'')+'</span>'+
      '</div>'+
      '<table style="width:100%;font-size:13px;">'+
        dtRoRow('Общ оборот',dtMoney(o.total_turnover),true)+
        dtRoRow('В брой',dtMoney(o.cash_turnover))+
        dtRoRow('С карта',dtMoney(o.card_turnover))+
        dtRoRow('Брой клиенти',String(parseInt(o.customers,10)||0))+
        dtRoRow('Среден чек',dtAvgCheck(o.total_turnover,o.customers))+
        (o.note?dtRoRow('Забележка',esc(o.note)):'')+
      '</table>'+
    '</div>';
  }
  /* Формата е само за днес — няма избор на дата и не приема друга. */
  return '<div class="card" style="margin-bottom:18px;">'+
    '<div class="card-title">&#128176; Оборот за днес — '+fmtDate(dtToday())+'</div>'+
    '<table style="width:100%;font-size:13px;">'+
      dtInpRow('Общ оборот','dt-total','лв.')+
      dtInpRow('В брой','dt-cash','лв.')+
      dtInpRow('С карта','dt-card','лв.')+
      dtInpRow('Брой клиенти','dt-customers','',true)+
      '<tr><td style="padding:6px 4px;color:#64748b;">Забележка</td>'+
        '<td style="padding:6px 4px;">'+
          '<input type="text" id="dt-note" placeholder="по избор" '+
          'style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;'+
          'font-family:inherit;font-size:13px;">'+
        '</td><td></td></tr>'+
    '</table>'+
    '<div style="margin-top:14px;">'+
      '<button onclick="submitOborot()" class="btn btn-green">Запиши оборота</button>'+
    '</div>'+
  '</div>';
}

/* Toast-ът живее 2.5 секунди; разминаването между Бюлетина и оборота живее до
   ръчна намеса. Затова остава и написано в изгледа. */
function dtTaskWarnBand(){
  if(!oborotTaskWarn) return '';
  return '<div id="dt-task-warn" style="display:flex;align-items:center;gap:8px;background:#fffbeb;'+
    'border:1px solid #d97706;border-radius:8px;padding:10px 12px;margin-bottom:14px;'+
    'color:#d97706;font-size:13px;">'+
    '<span>&#9888;</span><span>Оборотът е записан, но задачата в Бюлетина не се отметна. '+
    'Обади се в офиса — тя не се отмята ръчно.</span></div>';
}

function dtRoRow(label,val,strong){
  return '<tr style="border-bottom:1px solid #f1f5f9;">'+
    '<td style="padding:6px 4px;color:#64748b;">'+label+'</td>'+
    '<td style="text-align:right;padding:6px 4px;font-family:DM Mono,monospace;'+
      (strong?'font-weight:600;':'')+'">'+val+'</td></tr>';
}

function dtInpRow(label,id,suffix,isInt){
  return '<tr style="border-bottom:1px solid #f1f5f9;">'+
    '<td style="padding:6px 4px;color:#64748b;width:40%;">'+label+'</td>'+
    '<td style="padding:6px 4px;">'+
      '<input type="number" '+(isInt?'step="1"':'step="0.01"')+' min="0" id="'+id+'" '+
      'style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;'+
      'font-family:DM Mono,monospace;font-size:13px;text-align:right;">'+
    '</td>'+
    '<td style="padding:6px 4px;color:#64748b;width:34px;">'+(suffix||'')+'</td></tr>';
}

/* Последните 7 дни за собствения обект. Ден без запис се показва като ред с
   тире, а не се пропуска — иначе липсата остава невидима. */
function dtLast7Block(){
  var byDate={};
  for(var i=0;i<oborotRecent.length;i++) byDate[oborotRecent[i].date]=oborotRecent[i];

  var rows='';
  for(var d=0;d<7;d++){
    var key=dtDay(d), r=byDate[key];
    if(r){
      rows+='<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:7px 4px;">'+fmtDate(key)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;font-weight:600;">'+dtMoney(r.total_turnover)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(r.cash_turnover)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(r.card_turnover)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+(parseInt(r.customers,10)||0)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtAvgCheck(r.total_turnover,r.customers)+'</td>'+
      '</tr>';
    } else {
      rows+='<tr style="border-bottom:1px solid #f1f5f9;color:#94a3b8;">'+
        '<td style="padding:7px 4px;">'+fmtDate(key)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
      '</tr>';
    }
  }
  return '<div class="card">'+
    '<div class="card-title">Последните 7 дни</div>'+
    '<div style="overflow-x:auto;">'+
    '<table id="dt-last7" style="width:100%;font-size:13px;border-collapse:collapse;">'+
      '<tr style="border-bottom:1px solid #e2e8f0;color:#64748b;">'+
        '<th style="text-align:left;padding:7px 4px;font-weight:500;">Дата</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Общ</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">В брой</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">С карта</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Клиенти</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Среден чек</th>'+
      '</tr>'+rows+
    '</table></div>'+
  '</div>';
}

/* ── Изглед ЦЕНТРАЛЕН ОФИС ──
   Критерият е ОБЕКТ, не роля: isGlobal() е ['admin','accounting','logistics'],
   а тук важи store_name. Управител admin в магазин подава оборот; счетоводител
   в ЦО не подава. Затова isCentralOfficeUser(). */
function dtCOView(){
  var date=oborotCODate||dtToday();
  var byStore={};
  for(var i=0;i<oborotCORows.length;i++) byStore[oborotCORows[i].store_name]=oborotCORows[i];

  /* Складовете и самият ЦО не подават оборот — isReportableStore() е същата
     проверка, която ползват седмичният отчет и табът „Днес". */
  var stores=oborotCOStores.filter(function(n){return isReportableStore(n);});

  var rows='',missing=[],tTotal=0,tCash=0,tCard=0,tCust=0,filed=0;
  for(var s=0;s<stores.length;s++){
    var name=stores[s], r=byStore[name];
    if(!r){ missing.push(name); continue; }
    filed++;
    var tot=parseFloat(r.total_turnover)||0, cash=parseFloat(r.cash_turnover)||0;
    var card=parseFloat(r.card_turnover)||0, cust=parseInt(r.customers,10)||0;
    tTotal+=tot; tCash+=cash; tCard+=card; tCust+=cust;
    rows+='<tr style="border-bottom:1px solid #f1f5f9;">'+
      '<td style="padding:7px 4px;">'+esc(name)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;font-weight:600;">'+dtMoney(tot)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(cash)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(card)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+(tot>0?(card/tot*100).toFixed(1)+'%':'—')+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+cust+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtAvgCheck(tot,cust)+'</td>'+
    '</tr>';
  }

  var totalRow='<tr style="border-top:2px solid #e2e8f0;font-weight:600;">'+
    '<td style="padding:8px 4px;">Общо ('+filed+' обекта)</td>'+
    '<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+dtMoney(tTotal)+'</td>'+
    '<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+dtMoney(tCash)+'</td>'+
    '<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+dtMoney(tCard)+'</td>'+
    '<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+(tTotal>0?(tCard/tTotal*100).toFixed(1)+'%':'—')+'</td>'+
    '<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+tCust+'</td>'+
    '<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+dtAvgCheck(tTotal,tCust)+'</td>'+
  '</tr>';

  /* Изричен списък на неподалите — това е смисълът на изгледа. */
  var missBlock;
  if(!stores.length){
    missBlock='<div style="margin-top:14px;font-size:13px;color:#64748b;">Няма обекти за показване.</div>';
  } else if(missing.length){
    missBlock='<div id="dt-missing" style="margin-top:14px;background:#fffbeb;border:1px solid #d97706;border-radius:8px;'+
      'padding:10px 12px;font-size:13px;color:#d97706;">'+
      '<b>Не са подали ('+missing.length+'):</b> '+
      missing.map(function(n){return esc(n);}).join(', ')+'</div>';
  } else {
    missBlock='<div id="dt-all-filed" style="margin-top:14px;background:#f0fdf4;border:1px solid #16a34a;border-radius:8px;'+
      'padding:10px 12px;font-size:13px;color:#16a34a;">Всички обекти са подали оборот.</div>';
  }

  return '<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'+
      '<div class="card-title" style="margin:0;">&#128176; Оборот по обекти</div>'+
      '<div style="font-size:13px;color:#64748b;">Дата: '+
        '<input type="date" id="dt-co-date" value="'+date+'" onchange="oborotSetDate(this.value)" '+
        'style="padding:6px 9px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;font-size:13px;">'+
      '</div>'+
    '</div>'+
    '<div style="overflow-x:auto;">'+
    '<table id="dt-co-table" style="width:100%;font-size:13px;border-collapse:collapse;">'+
      '<tr style="border-bottom:1px solid #e2e8f0;color:#64748b;">'+
        '<th style="text-align:left;padding:7px 4px;font-weight:500;">Обект</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Общ</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">В брой</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">С карта</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">% карта</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Клиенти</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Среден чек</th>'+
      '</tr>'+rows+totalRow+
    '</table></div>'+
    missBlock+
  '</div>';
}

/* ─── АВТОМАТИЧНО ОТМЯТАНЕ В БЮЛЕТИНА ──────────────────────── */
/* Изпълнението на задачата идва от ДАННИТЕ, не от твърдение: щом оборотът е
   записан, задачата се затваря сама и ръчен чекбокс няма (виж bulAutoLocked()
   в bulletin.js). Така статистиката в Бюлетина и списъкът „кой не е подал" в
   имейла броят едно и също, защото четат един източник.

   Липсваща или неактивна задача НЕ е грешка — оборотът е записан, просто няма
   какво да се отмята. Затова тихо излизане, без toast.

   Ограничение, което си струва да се знае: sbGet резолвва с [] и при успех без
   редове, и при провал на заявката. Двете не се различават оттук. Провалът
   обаче не е ням — самият sbGet показва червен toast и пише в конзолата,
   затова не добавяме второ съобщение. Виж „Тихи откази при sbGet" в
   docs/PATTERNS.md. */
function dtMarkBulletinTask(){
  var store=currentUser.store_name, day=dtToday();
  return sbGet('recurring_tasks','select=id&linked_module=eq.oborot&active=is.true')
    .then(function(rows){
      var list=Array.isArray(rows)?rows:[];
      if(!list.length) return;
      var rid=list[0].id;
      /* Второ отмятане за същия ден би дало дублиран ред — Бюлетинът брои
         редове, не уникални обекти. */
      var q='select=id&recurring_task_id=eq.'+encodeURIComponent(rid)+
            '&store_name=eq.'+encodeURIComponent(store)+
            '&completion_date=eq.'+day;
      return sbGet('task_completions',q).then(function(done){
        if(Array.isArray(done)&&done.length) return;
        return sbPost('task_completions',{
          recurring_task_id:rid,
          task_id:null,
          store_name:store,
          completed_by:currentUser.display_name,
          completion_date:day,
          status:'done'
        }).then(function(res){
          if(res&&res.ok) return;
          /* Оборотът е по-важният запис и НЕ се връща назад заради това. Но
             мълчанието тук значи Бюлетин и имейл да броят различно, затова
             се казва — и остава видимо в изгледа, не само за 2.5 секунди. */
          oborotTaskWarn=true;
          var msg=(res&&res.error&&(res.error.message||res.error.hint))||('HTTP '+((res&&res.status)||'—'));
          try{console.error('dtMarkBulletinTask task_completions → '+msg);}catch(e){}
          toast('Оборотът е записан, но задачата в Бюлетина не се отметна','#d97706');
        });
      });
    });
}

/* ─── ЗАПИС ─────────────────────────────────────────────────── */
function submitOborot(){
  if(oborotSubmitting)return;
  /* Третата проверка е в самия обработчик. Формата вече не се рендира без
     право, но submitOborot() е глобална — липсващи полета не са защита. */
  if(!oborotCanSubmit()){ toast('Нямаш право да подаваш оборот','#dc2626'); return; }
  oborotTaskWarn=false;

  /* 1) Всички задължителни полета са попълнени. */
  var sTotal=v('dt-total'),sCash=v('dt-cash'),sCard=v('dt-card'),sCust=v('dt-customers');
  if(!sTotal||!sCash||!sCard||!sCust){
    toast('Попълни всички полета','#dc2626');return;
  }

  /* 2) Числата са валидни и неотрицателни; клиентите са цяло число. */
  var total=dtNum(sTotal),cash=dtNum(sCash),card=dtNum(sCard),cust=dtNum(sCust);
  if(isNaN(total)||isNaN(cash)||isNaN(card)||total<0||cash<0||card<0){
    toast('Сумите трябва да са числа, не по-малки от нула','#dc2626');return;
  }
  if(isNaN(cust)||cust<0||Math.floor(cust)!==cust){
    toast('Броят клиенти трябва да е цяло число, не по-малко от нула','#dc2626');return;
  }

  /* 3) Толеранс 1 лв. заради закръгляния на фискалното устройство.
        Закръглянето до стотинки е ПРЕДИ сравнението, защото в плаваща
        запетая 100.05-50-50 дава 0.049999999999997 — без него граничните
        случаи се решават от двоичния шум, не от правилото. */
  var diff=Math.round((total-cash-card)*100)/100;
  if(Math.abs(diff)>1){
    toast('Общият оборот не съвпада със сбора от брой и карта','#dc2626');return;
  }

  /* 4) Предупреждение, не забрана — изместена запетая е най-честата грешка. */
  var avg=dtAvg30();
  if(avg>0&&total>avg*5){
    if(!confirm('Числото изглежда необичайно високо. Сигурен ли си?'))return;
  }

  var note=v('dt-note');
  var body={
    store_name:currentUser.store_name,
    date:dtToday(),
    total_turnover:total,
    cash_turnover:cash,
    card_turnover:card,
    customers:cust,
    note:note||null,
    created_by:currentUser.display_name
  };

  oborotSubmitting=true;
  sbPost('daily_turnover',body).then(function(res){
    oborotSubmitting=false;
    if(res&&res.ok){
      toast('Оборотът е записан');
      /* Отмятането е СЛЕД зеления toast и преди презареждането, за да е
         маркерът вече вдигнат, когато изгледът се рендира наново. */
      dtMarkBulletinTask().then(function(){loadOborot();});
      return;
    }
    var status=res&&res.status;
    /* 409 = UNIQUE (store_name,date). Двоен клик или втори отворен таб.
       Презарежда, за да се види вече записаното — не се игнорира мълчаливо. */
    if(status===409){
      toast('Оборотът за днес вече е записан','#d97706');
      loadOborot();
      return;
    }
    /* Причината стига до потребителя, а формата остава попълнена, за да не
       се въвежда наново. Виж „Тихи откази при запис" в docs/PATTERNS.md. */
    var msg=(res&&res.error&&(res.error.message||res.error.hint))||('HTTP '+(status||'—'));
    try{console.error('submitOborot daily_turnover → '+(status||'мрежов срив')+': '+msg);}catch(e){}
    toast('Грешка при запис: '+msg,'#dc2626');
  });
}
