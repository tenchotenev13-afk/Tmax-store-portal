/* ═══════════════════════════════════════════════════════════════
   ВЕЧЕРЕН ОБОРОТ — подтаб в Каса (таблица public.daily_turnover)

   НЕ е счетоводен запис. Истинската каса остава в kasa_reports /
   kasa_glavna / kasa_zoborot и се попълва на следващия ден. Тук се
   въвежда веднъж вечерта това, което магазините днес пращат по имейл.

   ЗА МАГАЗИНА записът не се коригира, не се връща за преработка и няма
   статус — само днешният ден, без бутон за редакция. Това правило не се
   променя.

   ЦЕНТРАЛНИЯТ ОФИС от 03.09.2026 може да въвежда за минал ден и да коригира
   вече подаден запис за която и да е дата. Поводът са два реални случая от
   25.08.2026: Дупница пропуснаха вечерния оборот за 24.08 и на следващата
   сутрин го въведоха — формата приема само днешния ден, затова вчерашните
   числа влязоха с ДНЕШНА дата и изглеждаха валидни. Поправката изискваше
   ръчен SQL, което не е процедура.

   ⚠️ КЛЮЧОВОТО РАЗДЕЛЯНЕ: записът от МАГАЗИН отмята задачата „Вечерен оборот"
   в Бюлетина (изпълнението идва от данните, не от твърдение). Записът или
   корекцията от ЦО НЕ създава и НЕ пипа отметка. Ако магазинът е пропуснал
   задачата, ЦО покрива числото, но работата не е свършена от магазина —
   отметка оттук би показала изпълнение, което не се е случило.
   Критерият е КОЙ въвежда, не ЗА КОГА: ЦО не отмята и когато въвежда за
   днешния ден. Заковано в dtAfterSave() и в tests/oborot-co-entry.test.js.

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
var oborotCOStore='';      /* обектът, избран във формата за въвеждане от ЦО */
var oborotEditRow=null;    /* редът, отворен в модала за корекция */
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
/* EUR, не лв. — от 01.01.2026 това е официалната валута. Числата в
   daily_turnover открай време са в евро; грешен беше само етикетът.
   Самостоятелна е нарочно, не ползва fmtMoney(): fmtMoney е дефинирана
   ДВА пъти — kasa.js:31 със ' EUR' (интервал) и history.js:399 с 'EUR'
   (без). В браузъра печели history.js, защото се зарежда след kasa.js.
   Следствие: Вечерен оборот показва ' EUR' с интервал, а Каса и История —
   без. Козметично разминаване, което съществува и днес между Каса и
   История; поправя се, като двете fmtMoney се уеднаквят, не оттук. */
function dtMoney(n){return (parseFloat(n)||0).toFixed(2)+' EUR';}
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
/* Банковото плащане е рядко: в обичаен ден всички обекти са на нула. Затова
   колоната „Банка" се показва само когато има какво да покаже — колона, пълна
   с тирета в 95% от дните, прави справката по-трудна за четене без полза.
   Същият подход като в имейла. */
function dtBankOf(r){ return parseFloat(r&&r.bank_turnover)||0; }
function dtAnyBank(list){
  for(var i=0;i<(list||[]).length;i++){ if(dtBankOf(list[i])>0) return true; }
  return false;
}
/* Нула се показва като тире, не като 0.00 — за да личи, че няма банка,
   а не че е въведена нула. */
function dtBankCell(r){
  var b=dtBankOf(r);
  return b>0?dtMoney(b):'—';
}
/* Разминаване между общия оборот и сбора по начини на плащане. Законно е —
   клиент плаща по банка, а касиерът маркира „в брой" — затова не блокира
   записа. Но се вижда в справката, както се вижда и в имейла: иначе
   Централният офис няма как да разбере кой обект да провери. */
function dtDiffOf(r){
  if(!r) return 0;
  var t=parseFloat(r.total_turnover)||0;
  return Math.round((t-(parseFloat(r.cash_turnover)||0)-(parseFloat(r.card_turnover)||0)-dtBankOf(r))*100)/100;
}
function dtMismatchMark(r){
  var d=dtDiffOf(r);
  if(Math.abs(d)<=1) return '';
  return ' <span class="dt-mismatch" title="Разминаване '+dtMoney(Math.abs(d))+
    ' между общия оборот и сбора по начини на плащане"'+
    ' style="color:#d97706;font-weight:700;cursor:help;">&#9888;</span>';
}

/* ─── СЛЕДА ОТ ЦО В ЗАБЕЛЕЖКАТА ─────────────────────────────── */
/* Схемата не се пипа в тази задача, а колона „кой тип потребител е писал"
   няма. Затова следата живее в note — полето, което ВЕЧЕ се показва в
   имейла (send-oborot-report/index.ts:247). Това е нарочно: корекция без
   следа е тихо презаписване, а следа, която не стига до отчета за онзи ден,
   не е следа.

   Оттук идва и баджът „ЦО" в справката (Част 4) — БЕЗ втора заявка: редът
   вече носи note, а справката вече го е изтеглила. Алтернативата беше да се
   чете ролята на created_by от users, тоест втори GET на всяко зареждане, при
   положение че loadReportableStores() дърпа само store_name.

   Редовете са РАЗДЕЛЕНИ с \n и се разпознават по началото си. Затова
   регексът е закотвен в началото на реда — забележка на магазин, в която
   случайно се среща думата „Коригирано", не се брои за следа. */
var DT_CO_MARK='Въведено от ЦО на ';
var DT_FIX_MARK='Коригирано ';
var DT_TRAIL_RE=/^(?:Въведено от ЦО на|Коригирано) \d{2}\.\d{2}\.\d{4} /;
/* Няколко корекции подред не бива да раздуват note безкрайно — пазят се
   последните три реда следа, по-старите отпадат. */
var DT_TRAIL_MAX=3;

function dtTrailLines(note){
  var out=[],lines=String(note||'').split('\n');
  for(var i=0;i<lines.length;i++) if(DT_TRAIL_RE.test(lines[i])) out.push(lines[i]);
  return out;
}
/* Собствената забележка на обекта, без редовете на следата. Точно тя се
   зарежда в полето „Забележка" на модала за корекция — иначе ЦО би трябвало
   да преписва наум чуждата следа. */
function dtNoteBase(note){
  var out=[],lines=String(note||'').split('\n');
  for(var i=0;i<lines.length;i++){
    if(!DT_TRAIL_RE.test(lines[i])&&lines[i]!=='') out.push(lines[i]);
  }
  return out.join('\n');
}
function dtBuildNote(oldNote,newBase,line){
  var trail=dtTrailLines(oldNote);
  if(line) trail.push(line);
  while(trail.length>DT_TRAIL_MAX) trail.shift();
  var all=[];
  if(newBase) all.push(newBase);
  all=all.concat(trail);
  return all.length?all.join('\n'):null;
}
/* Записът е пипан от Централен офис, ако носи поне един ред следа. */
function dtByCO(r){ return !!r&&dtTrailLines(r.note).length>0; }
function dtCOBadge(r){
  if(!dtByCO(r)) return '';
  return ' <span class="dt-co-badge" title="Въведено или коригирано от Централен офис"'+
    ' style="display:inline-block;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;'+
    'border-radius:6px;padding:0 5px;font-size:10px;font-weight:600;line-height:16px;'+
    'vertical-align:middle;">ЦО</span>';
}
/* Какво точно е променено — влиза след двоеточието в реда на следата.
   Само реално различните полета, за да не пише „общ 1000.00 → 1000.00". */
function dtChangeSummary(oldRow,neu){
  var parts=[];
  function cents(x){ return Math.round((parseFloat(x)||0)*100); }
  function money(lbl,a,b){ if(cents(a)!==cents(b)) parts.push(lbl+' '+dtMoney(a)+' → '+dtMoney(b)); }
  money('общ',oldRow.total_turnover,neu.total_turnover);
  money('в брой',oldRow.cash_turnover,neu.cash_turnover);
  money('с карта',oldRow.card_turnover,neu.card_turnover);
  money('по банка',dtBankOf(oldRow),neu.bank_turnover);
  var oc=parseInt(oldRow.customers,10)||0;
  if(oc!==neu.customers) parts.push('клиенти '+oc+' → '+neu.customers);
  if(neu.date&&neu.date!==oldRow.date) parts.push('дата '+fmtDate(oldRow.date)+' → '+fmtDate(neu.date));
  if(dtNoteBase(oldRow.note)!==String(neu.note||'')) parts.push('забележка');
  return parts.length?parts.join(', '):'без промяна по числата';
}
function dtWho(){
  return (currentUser&&(currentUser.display_name||currentUser.email))||'Централен офис';
}

/* ─── ОБЩА ПРОВЕРКА НА ЧИСЛАТА ──────────────────────────────── */
/* ЕДНА проверка за трите пътя — магазин, въвеждане от ЦО, корекция от ЦО.
   Втора проверка не се пише: разминат ли се двете, никой не забелязва, а
   двата пътя просто започват да казват различни неща.
   Не пипа DOM и не показва toast — само решава. Съобщенията се показват от
   извикващия, за да остане еднакъв текстът навсякъде.

   Прагът е този от 26.08.2026: блокира се разминаване над
   greatest(1, total*0.1). Виж дългия коментар в submitOborot(). */
function dtValidate(total,cash,card,bank,cust){
  if(isNaN(total)||isNaN(cash)||isNaN(card)||isNaN(bank)||total<0||cash<0||card<0||bank<0){
    return {ok:false,error:'Сумите трябва да са числа, не по-малки от нула'};
  }
  if(isNaN(cust)||cust<0||Math.floor(cust)!==cust){
    return {ok:false,error:'Броят клиенти трябва да е цяло число, не по-малко от нула'};
  }
  /* Закръглянето до стотинки е ПРЕДИ сравнението: в плаваща запетая
     100.05-50-50 дава 0.049999999999997 и границата иначе се решава от
     двоичния шум, а не от правилото. */
  var diff=Math.round((total-cash-card-bank)*100)/100;
  var hardLimit=Math.round(Math.max(1,total*0.1)*100)/100;
  if(Math.abs(diff)>hardLimit){
    return {ok:false,diff:diff,
      error:'Разминаването е '+dtMoney(Math.abs(diff))+', допустимо е до '+
            dtMoney(hardLimit)+' (10% от оборота) — провери числата'};
  }
  /* Между 1 EUR и прага: минава, но НЕ мълчаливо. Под 1 EUR е закръгляне
     на фискалното устройство и не заслужава съобщение. */
  return {ok:true,diff:diff,soft:Math.abs(diff)>1};
}
function dtSoftToast(diff){
  toast('Сумите не се връзват с '+dtMoney(Math.abs(diff))+
        '. Записът ще бъде подаден и разминаването ще се отрази в отчета.','#d97706');
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
/* Въвеждането за минал ден и корекцията са НОВИ права на ЦО, не разширение
   на магазинското. Списъкът е същият като за четене на справката — задачата
   дава двете права на Централния офис, а не на нова роля, и всяко тихо
   разширяване тук би било решение, което никой не е вземал. */
function oborotCOCanWrite(){
  return !!currentUser&&isCentralOfficeUser()&&OBOROT_CO_ROLES.indexOf(currentUser.role)>=0;
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
    /* Обектите идват от users, не от таблицата stores. stores има 23 записа,
       сред които и такива без нито един акаунт (Пазарджик, Сервиз Троян) —
       физически няма кой да подаде оборот от тяхно име, а справката ги броеше
       като „не са подали" и показваше 20 срещу 18 в имейла за същия ден.
       loadReportableStores() е същият източник, който ползват седмичният
       отчет, таб „Днес" и Бюлетинът. allStoresCache НЕ се пипа — там пълните
       23 записа са правилни за падащите менюта при избор на магазин. */
    Promise.all([
      loadReportableStores(),
      sbGet('daily_turnover','date=eq.'+oborotCODate+'&order=store_name.asc')
    ]).then(function(res){
      oborotCOStores=Array.isArray(res[0])?res[0]:[];
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
/* Смяната на обекта НЕ праща заявка: редовете за деня вече са изтеглени и
   формата се решава от тях. */
function oborotSetCOStore(name){
  oborotCOStore=name||'';
  renderOborot();
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
        (dtBankOf(o)>0?dtRoRow('По банка',dtMoney(o.bank_turnover)):'')+
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
      dtInpRow('Общ оборот','dt-total','EUR')+
      dtInpRow('В брой','dt-cash','EUR')+
      dtInpRow('С карта','dt-card','EUR')+
      /* Фирмени клиенти плащат и по банка. Сумата влиза в оборота за деня, в
         който е ПОЛУЧЕНА, не в деня на продажбата. Полето не е задължително —
         празно значи 0. */
      dtInpRow('По банка','dt-bank','EUR')+
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

  /* Колоната „Банка" се решава ВЕДНЪЖ за целите 7 дни, а не за всеки ред —
     иначе редовете щяха да имат различен брой клетки. */
  var days=[];
  for(var q=0;q<7;q++){ var kk=dtDay(q); if(byDate[kk]) days.push(byDate[kk]); }
  var showBank=dtAnyBank(days);

  var rows='';
  for(var d=0;d<7;d++){
    var key=dtDay(d), r=byDate[key];
    if(r){
      rows+='<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:7px 4px;">'+fmtDate(key)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;font-weight:600;">'+dtMoney(r.total_turnover)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(r.cash_turnover)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(r.card_turnover)+'</td>'+
        (showBank?'<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtBankCell(r)+'</td>':'')+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+(parseInt(r.customers,10)||0)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtAvgCheck(r.total_turnover,r.customers)+'</td>'+
      '</tr>';
    } else {
      rows+='<tr style="border-bottom:1px solid #f1f5f9;color:#94a3b8;">'+
        '<td style="padding:7px 4px;">'+fmtDate(key)+'</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        '<td style="text-align:right;padding:7px 4px;">—</td>'+
        (showBank?'<td style="text-align:right;padding:7px 4px;">—</td>':'')+
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
        (showBank?'<th style="text-align:right;padding:7px 4px;font-weight:500;">Банка</th>':'')+
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

  /* Решава се ВЕДНЪЖ за целия ден: ако нито един обект няма банка,
     колоната изобщо не се появява и таблицата изглежда както досега. */
  var showBank=dtAnyBank(oborotCORows);
  var rows='',missing=[],tTotal=0,tCash=0,tCard=0,tBank=0,tCust=0,filed=0;
  for(var s=0;s<stores.length;s++){
    var name=stores[s], r=byStore[name];
    if(!r){ missing.push(name); continue; }
    filed++;
    var tot=parseFloat(r.total_turnover)||0, cash=parseFloat(r.cash_turnover)||0;
    var card=parseFloat(r.card_turnover)||0, cust=parseInt(r.customers,10)||0;
    var bank=dtBankOf(r);
    tTotal+=tot; tCash+=cash; tCard+=card; tBank+=bank; tCust+=cust;
    rows+='<tr style="border-bottom:1px solid #f1f5f9;">'+
      /* Баджът и моливът влизат В СЪЩАТА клетка, а не в нов стълб: броят
         колони се решава веднъж за целия ден (заради „Банка") и нов стълб би
         разминал редовете. Името остава В НАЧАЛОТО на клетката. */
      '<td style="padding:7px 4px;">'+esc(name)+dtCOBadge(r)+dtMismatchMark(r)+dtEditBtn(r)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;font-weight:600;">'+dtMoney(tot)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(cash)+'</td>'+
      '<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtMoney(card)+'</td>'+
      (showBank?'<td style="text-align:right;padding:7px 4px;font-family:DM Mono,monospace;">'+dtBankCell(r)+'</td>':'')+
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
    (showBank?'<td style="text-align:right;padding:8px 4px;font-family:DM Mono,monospace;">'+(tBank>0?dtMoney(tBank):'—')+'</td>':'')+
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
        (showBank?'<th style="text-align:right;padding:7px 4px;font-weight:500;">Банка</th>':'')+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">% карта</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Клиенти</th>'+
        '<th style="text-align:right;padding:7px 4px;font-weight:500;">Среден чек</th>'+
      '</tr>'+rows+totalRow+
    '</table></div>'+
    missBlock+
  '</div>'+
  dtCOEntryBlock(byStore);
}

/* Молив за корекция — само за ЦО и само когато редът има id. */
function dtEditBtn(r){
  if(!oborotCOCanWrite()||!r||!r.id) return '';
  return ' <button class="dt-edit" onclick="openOborotEdit(\''+escAttr(String(r.id))+'\')"'+
    ' title="Коригирай записа"'+
    ' style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:13px;'+
    'line-height:1;vertical-align:middle;">&#9999;&#65039;</button>';
}

/* ── ЧАСТ 1: ЦО въвежда за избраната дата ──
   Формата работи за датата ГОРЕ (dt-co-date) — една дата за целия изглед, за
   да няма два източника на истина за това „кой ден гледаме".
   Магазинската форма не се пипа: тя си остава само за днес и без избор. */
function dtCOEntryBlock(byStore){
  if(!oborotCOCanWrite()) return '';
  var date=oborotCODate||dtToday();
  var stores=oborotCOStores.filter(function(n){return isReportableStore(n);});
  if(!stores.length) return '';

  var sel=(oborotCOStore&&stores.indexOf(oborotCOStore)>=0)?oborotCOStore:'';
  var existing=sel?(byStore[sel]||null):null;
  /* ISO датите се сравняват като низове — YYYY-MM-DD е лексикографски
     подредена. Ползва се dtToday(), не today(): в ранните часове по
     българско време toISOString() дава вчера. */
  var future=date>dtToday();

  var opts='<option value="">— избери обект —</option>';
  for(var i=0;i<stores.length;i++){
    opts+='<option value="'+escAttr(stores[i])+'"'+(stores[i]===sel?' selected':'')+'>'+
      esc(stores[i])+'</option>';
  }

  var body;
  if(!sel){
    body='<div id="dtco-hint" style="font-size:13px;color:#64748b;">'+
      'Избери обект, за да въведеш оборот за '+fmtDate(date)+'.</div>';
  } else if(existing){
    /* Има запис → не форма, а самият запис с бутон за корекция (Част 2).
       Втори ред за същия обект и ден е невъзможен — уникално (store_name,date). */
    body='<div id="dtco-existing">'+
      '<div style="display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #16a34a;'+
        'border-radius:8px;padding:10px 12px;margin-bottom:12px;color:#16a34a;font-size:13px;">'+
        '<span>&#9989;</span><span>'+esc(sel)+' вече е подал оборот за '+fmtDate(date)+
        (existing.created_by?' — '+esc(existing.created_by):'')+'</span>'+
      '</div>'+
      '<table style="width:100%;font-size:13px;">'+
        dtRoRow('Общ оборот',dtMoney(existing.total_turnover),true)+
        dtRoRow('В брой',dtMoney(existing.cash_turnover))+
        dtRoRow('С карта',dtMoney(existing.card_turnover))+
        (dtBankOf(existing)>0?dtRoRow('По банка',dtMoney(existing.bank_turnover)):'')+
        dtRoRow('Брой клиенти',String(parseInt(existing.customers,10)||0))+
        (existing.note?dtRoRow('Забележка',esc(existing.note)):'')+
      '</table>'+
      '<div style="margin-top:12px;">'+
        '<button onclick="openOborotEdit(\''+escAttr(String(existing.id))+'\')" class="btn">'+
        '&#9999;&#65039; Коригирай записа</button>'+
      '</div>'+
    '</div>';
  } else {
    body='<table style="width:100%;font-size:13px;">'+
      dtInpRow('Общ оборот','dtco-total','EUR')+
      dtInpRow('В брой','dtco-cash','EUR')+
      dtInpRow('С карта','dtco-card','EUR')+
      dtInpRow('По банка','dtco-bank','EUR')+
      dtInpRow('Брой клиенти','dtco-customers','',true)+
      '<tr><td style="padding:6px 4px;color:#64748b;">Забележка</td>'+
        '<td style="padding:6px 4px;">'+
          '<input type="text" id="dtco-note" placeholder="по избор" '+
          'style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;'+
          'font-family:inherit;font-size:13px;">'+
        '</td><td></td></tr>'+
    '</table>'+
    '<div style="margin-top:14px;">'+
      /* Бъдещ ден: бутонът е disabled и КАЗВА защо, а не изчезва — скрит
         бутон оставя човека да гадае. Проверката се повтаря и в самия
         обработчик: disabled в markup-а не спира пряко извикване. */
      '<button onclick="submitOborotCO()" class="btn btn-green"'+
        (future?' disabled title="Денят още не е настъпил"':'')+
        '>Запиши оборота</button>'+
      (future?'<span style="margin-left:10px;font-size:12px;color:#d97706;">'+
        'Денят още не е настъпил.</span>':'')+
    '</div>';
  }

  return '<div class="card" id="dtco-form" style="margin-top:18px;">'+
    '<div class="card-title">&#9997;&#65039; Въвеждане от Централен офис</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">'+
      'За '+fmtDate(date)+'. Записът от офиса НЕ отмята задачата в Бюлетина — '+
      'работата остава неизпълнена от обекта.</div>'+
    '<div style="margin-bottom:12px;font-size:13px;color:#64748b;">Обект: '+
      '<select id="dtco-store" onchange="oborotSetCOStore(this.value)" '+
      'style="padding:6px 9px;border:1px solid #e2e8f0;border-radius:8px;'+
      'font-family:inherit;font-size:13px;">'+opts+'</select></div>'+
    body+
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

/* ⚠️ ЕДИНСТВЕНОТО МЯСТО, където се решава дали задачата да се отметне.
   Критерият е КОЙ въвежда (byCO), не за коя дата. ЦО не отмята и когато
   въвежда за днешния ден: ако магазинът е пропуснал задачата, офисът покрива
   числото, но работата не е свършена от магазина, а отметка оттук би дала
   статистика за изпълнение, което не се е случило.

   Махне ли се редът `if(byCO)`, tests/oborot-co-entry.test.js пада на
   проверката „POST към task_completions НЕ тръгва" — това е контролът, че
   тестът не е тавтологичен. */
function dtAfterSave(byCO){
  if(byCO){ loadOborot(); return; }
  dtMarkBulletinTask().then(function(){loadOborot();});
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
  /* „По банка" НЕ е задължително: празно значи 0, не липсваща стойност.
     Колоната е not null с default 0 — null никога не се праща. */
  var sBank=v('dt-bank');
  if(!sTotal||!sCash||!sCard||!sCust){
    toast('Попълни всички полета','#dc2626');return;
  }

  /* 2) и 3) Числата и разминаването — през dtValidate(), общата проверка за
        трите пътя (магазин, въвеждане от ЦО, корекция от ЦО). Правилото и
        текстовете живеят на ЕДНО място. */
  var total=dtNum(sTotal),cash=dtNum(sCash),card=dtNum(sCard),cust=dtNum(sCust);
  var bank=sBank?dtNum(sBank):0;

  /* 3) Разминаването САМО ПО СЕБЕ СИ не блокира. Клиент може да плати по
        банка, а касиерът да маркира продажбата „в брой" — тогава фискалният
        отчет и реалното разпределение се разминават със законна сума, и
        старият праг от 1 EUR правеше подаването невъзможно.
        Блокира се разминаване над 10% от оборота (свито от 50% на 26.08.2026
        по решение на Тенчо). 50% хващаше само изместената десетична точка
        (Раднево — 768 125 при реални 7 681,25, тоест 99%) и пропускаше
        по-малките грешки в преписването; 10% ги хваща, а законните разлики
        от начина на плащане остават под него.
          abs(total - cash - card - bank) <= greatest(1, total * 0.1)
        ⚠️ Базата към момента още пази стария праг 0.5 — CHECK-ът се сменя
        отделно. Докато това стане, клиентът е ПО-СТРОГ от базата, което е
        безопасната посока: отказът идва с разбираемо съобщение оттук,
        вместо базата да върне „нарушен CHECK", което не значи нищо за
        човека пред екрана. Обратната посока би пропуснала запис до базата,
        която да го отхвърли неразбираемо.
        Закръглянето до стотинки е ПРЕДИ сравнението, защото в плаваща запетая
        100.05-50-50 дава 0.049999999999997 и границата иначе се решава от
        двоичния шум, а не от правилото. */
  var chk=dtValidate(total,cash,card,bank,cust);
  if(!chk.ok){
    /* Съобщението казва КОЛКО е и ДОКЪДЕ се допуска — иначе касиерът знае
       само че е сгрешил, не какво да провери. */
    toast(chk.error,'#dc2626');return;
  }
  var diff=chk.diff,softMismatch=chk.soft;
  if(softMismatch) dtSoftToast(diff);

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
    bank_turnover:bank,
    customers:cust,
    note:note||null,
    created_by:currentUser.display_name
  };

  oborotSubmitting=true;
  sbPost('daily_turnover',body).then(function(res){
    oborotSubmitting=false;
    if(res&&res.ok){
      /* Разминаването влиза и в съобщението за успех. Предупреждението отпреди
         записа живее 2.5 секунди и зеленият toast го припокрива — човекът
         иначе остава с впечатление, че всичко се е вързало. */
      if(softMismatch) toast('Оборотът е записан с разминаване '+dtMoney(Math.abs(diff))+
                             ' — ще се отрази в отчета.','#d97706');
      else toast('Оборотът е записан');
      /* Отмятането е СЛЕД зеления toast и преди презареждането, за да е
         маркерът вече вдигнат, когато изгледът се рендира наново.
         false = въвежда МАГАЗИНЪТ, тоест задачата се отмята. */
      dtAfterSave(false);
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

/* ─── ЧАСТ 1: ЗАПИС ОТ ЦЕНТРАЛЕН ОФИС ───────────────────────── */
/* Същите проверки като при магазина (dtValidate), същият POST, но:
   - датата е ИЗБРАНАТА в изгледа, не задължително днешната;
   - обектът е избраният от падащото меню, не store_name на потребителя;
   - ⚠️ БЕЗ отмятане в Бюлетина — dtAfterSave(true). */
function submitOborotCO(){
  if(oborotSubmitting)return;
  /* Втора проверка в самия обработчик: submitOborotCO() е глобална и
     disabled бутон не е защита. */
  if(!oborotCOCanWrite()){ toast('Нямаш право да въвеждаш оборот','#dc2626'); return; }

  var store=oborotCOStore||v('dtco-store');
  if(!store){ toast('Избери обект','#dc2626'); return; }
  if(!isReportableStore(store)){ toast('Този обект не подава оборот','#dc2626'); return; }

  var date=oborotCODate||dtToday();
  /* Бъдещ ден не се приема. Проверката е и тук, не само в markup-а. */
  if(date>dtToday()){ toast('Денят още не е настъпил','#dc2626'); return; }

  var sTotal=v('dtco-total'),sCash=v('dtco-cash'),sCard=v('dtco-card'),sCust=v('dtco-customers');
  var sBank=v('dtco-bank');
  if(!sTotal||!sCash||!sCard||!sCust){ toast('Попълни всички полета','#dc2626'); return; }

  var total=dtNum(sTotal),cash=dtNum(sCash),card=dtNum(sCard),cust=dtNum(sCust);
  var bank=sBank?dtNum(sBank):0;
  var chk=dtValidate(total,cash,card,bank,cust);
  if(!chk.ok){ toast(chk.error,'#dc2626'); return; }
  if(chk.soft) dtSoftToast(chk.diff);

  /* Следата казва, че числото идва от офиса, а не от обекта. Оттук се ражда
     и баджът „ЦО" в справката, без втора заявка. */
  var line=DT_CO_MARK+fmtDate(dtToday())+' от '+dtWho();
  var body={
    store_name:store,
    date:date,
    total_turnover:total,
    cash_turnover:cash,
    card_turnover:card,
    bank_turnover:bank,
    customers:cust,
    note:dtBuildNote(null,v('dtco-note'),line),
    created_by:dtWho()
  };

  oborotSubmitting=true;
  sbPost('daily_turnover',body).then(function(res){
    oborotSubmitting=false;
    if(res&&res.ok){
      if(chk.soft) toast('Оборотът е записан с разминаване '+dtMoney(Math.abs(chk.diff))+
                         ' — ще се отрази в отчета.','#d97706');
      else toast('Оборотът за '+esc(store)+' е записан');
      /* true = въвежда ЦО → задачата в Бюлетина НЕ се отмята. */
      dtAfterSave(true);
      return;
    }
    var status=res&&res.status;
    if(status===409){
      toast('За тази дата вече има подаден оборот от този обект.','#d97706');
      loadOborot();
      return;
    }
    var msg=sbErrMsg(res);
    try{console.error('submitOborotCO daily_turnover → '+(status||'мрежов срив')+': '+msg);}catch(e){}
    toast('Грешка при запис: '+msg,'#dc2626');
  });
}

/* ─── ЧАСТ 2 и 3: КОРЕКЦИЯ ОТ ЦЕНТРАЛЕН ОФИС ────────────────── */
/* Модалът се строи в JS, а не в index.html — index.html не се пипа в тази
   задача, а шаблонът е същият като на прозорчето за коментар в checklist.js.
   Стойностите се задават през .value СЛЕД вмъкването, не в markup-а: кавичка
   в забележката иначе излиза от атрибута. */
function openOborotEdit(id){
  if(!oborotCOCanWrite()){ toast('Нямаш право да коригираш оборот','#dc2626'); return; }
  var r=null;
  for(var i=0;i<oborotCORows.length;i++){
    if(String(oborotCORows[i].id)===String(id)){ r=oborotCORows[i]; break; }
  }
  if(!r){ toast('Записът не е намерен — презареди справката','#dc2626'); return; }
  oborotEditRow=r;
  closeOborotEdit();

  var ov=document.createElement('div');
  ov.id='dt-edit-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;'+
    'align-items:center;justify-content:center;z-index:9999;';
  ov.innerHTML='<div style="background:#fff;border-radius:14px;padding:20px;'+
      'width:min(480px,94vw);max-height:90vh;overflow-y:auto;">'+
    '<div style="font-weight:700;margin-bottom:2px;">&#9999;&#65039; Корекция на оборот</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">'+
      esc(r.store_name)+' &middot; '+fmtDate(r.date)+
      '. Корекцията НЕ пипа отметката в Бюлетина.</div>'+
    '<table style="width:100%;font-size:13px;">'+
      dtInpRow('Общ оборот','dt-ed-total','EUR')+
      dtInpRow('В брой','dt-ed-cash','EUR')+
      dtInpRow('С карта','dt-ed-card','EUR')+
      dtInpRow('По банка','dt-ed-bank','EUR')+
      dtInpRow('Брой клиенти','dt-ed-customers','',true)+
      '<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:6px 4px;color:#64748b;">Забележка</td>'+
        '<td style="padding:6px 4px;" colspan="2">'+
          '<input type="text" id="dt-ed-note" '+
          'style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;'+
          'font-family:inherit;font-size:13px;"></td></tr>'+
      /* ЧАСТ 3 — случаят с Дупница беше ГРЕШНА ДАТА, не грешни числа. */
      '<tr><td style="padding:6px 4px;color:#64748b;">Дата</td>'+
        '<td style="padding:6px 4px;" colspan="2">'+
          '<input type="date" id="dt-ed-date" max="'+escAttr(dtToday())+'" '+
          'style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;'+
          'font-family:inherit;font-size:13px;"></td></tr>'+
    '</table>'+
    '<div style="font-size:12px;color:#64748b;margin-top:10px;">'+
      'Забележката ще носи следа „Коригирано …", която се вижда и в отчета за деня.</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'+
      '<button class="btn btn-ghost" onclick="closeOborotEdit()">Откажи</button>'+
      '<button class="btn btn-green" onclick="submitOborotEdit()">Запиши корекцията</button>'+
    '</div></div>';
  document.body.appendChild(ov);

  function set(elId,val){ var el=document.getElementById(elId); if(el) el.value=val; }
  set('dt-ed-total',String(parseFloat(r.total_turnover)||0));
  set('dt-ed-cash',String(parseFloat(r.cash_turnover)||0));
  set('dt-ed-card',String(parseFloat(r.card_turnover)||0));
  set('dt-ed-bank',String(dtBankOf(r)));
  set('dt-ed-customers',String(parseInt(r.customers,10)||0));
  /* Само собствената забележка на обекта — редовете на следата не се
     редактират на ръка и не се преписват. */
  set('dt-ed-note',dtNoteBase(r.note));
  set('dt-ed-date',r.date);
}

function closeOborotEdit(){
  var ov=document.getElementById('dt-edit-ov');
  if(ov&&ov.parentNode) ov.parentNode.removeChild(ov);
}

function submitOborotEdit(){
  if(oborotSubmitting)return;
  if(!oborotCOCanWrite()){ toast('Нямаш право да коригираш оборот','#dc2626'); return; }
  var r=oborotEditRow;
  if(!r){ toast('Няма отворен запис за корекция','#dc2626'); return; }

  var sTotal=v('dt-ed-total'),sCash=v('dt-ed-cash'),sCard=v('dt-ed-card'),sCust=v('dt-ed-customers');
  var sBank=v('dt-ed-bank');
  if(!sTotal||!sCash||!sCard||!sCust){ toast('Попълни всички полета','#dc2626'); return; }

  var total=dtNum(sTotal),cash=dtNum(sCash),card=dtNum(sCard),cust=dtNum(sCust);
  var bank=sBank?dtNum(sBank):0;
  /* СЪЩАТА проверка като при въвеждане — не втора. */
  var chk=dtValidate(total,cash,card,bank,cust);
  if(!chk.ok){ toast(chk.error,'#dc2626'); return; }

  var newDate=v('dt-ed-date')||r.date;
  if(newDate>dtToday()){ toast('Денят още не е настъпил','#dc2626'); return; }

  var base=v('dt-ed-note');
  var summary=dtChangeSummary(r,{
    total_turnover:total,cash_turnover:cash,card_turnover:card,
    bank_turnover:bank,customers:cust,date:newDate,note:base
  });
  var body={
    total_turnover:total,
    cash_turnover:cash,
    card_turnover:card,
    bank_turnover:bank,
    customers:cust,
    /* Следата се ДОБАВЯ, старата забележка не се трие — корекция без следа е
       тихо презаписване. Броят редове следа е ограничен (DT_TRAIL_MAX). */
    note:dtBuildNote(r.note,base,DT_FIX_MARK+fmtDate(dtToday())+' от '+dtWho()+': '+summary)
  };
  if(newDate!==r.date) body.date=newDate;

  if(chk.soft) dtSoftToast(chk.diff);

  oborotSubmitting=true;
  /* ЧАСТ 3 — предварителна проверка при смяна на датата. Уникалното
     ограничение (store_name, date) би върнало сурово „duplicate key value
     violates unique constraint", което не значи нищо за човека пред екрана.
     Проверката е ПРЕДИ PATCH-а, за да не тръгне заявка, обречена да падне.
     ⚠️ task_completions НЕ се пипа при никой път оттук: отметката не следва
     датата автоматично и преместването ѝ, ако изобщо трябва, е отделно
     решение на човек. */
  var pre=(newDate!==r.date)
    ? sbGet('daily_turnover','select=id&store_name=eq.'+encodeURIComponent(r.store_name)+
        '&date=eq.'+encodeURIComponent(newDate))
    : Promise.resolve([]);

  pre.then(function(rows){
    var taken=(Array.isArray(rows)?rows:[]).filter(function(x){
      return String(x.id)!==String(r.id);
    });
    if(taken.length){
      oborotSubmitting=false;
      toast('За тази дата вече има подаден оборот от този обект.','#dc2626');
      return;
    }
    return sbPatch('daily_turnover','id=eq.'+encodeURIComponent(r.id),body).then(function(res){
      oborotSubmitting=false;
      if(res&&res.ok){
        closeOborotEdit();
        oborotEditRow=null;
        toast('Корекцията е записана');
        /* true = пипа ЦО → отметката в Бюлетина остава каквато е. */
        dtAfterSave(true);
        return;
      }
      var status=res&&res.status;
      /* 409 пак е възможен: някой е записал същия ден между проверката и
         PATCH-а. Съобщението е същото, за да не се учи потребителят на две. */
      if(status===409){
        toast('За тази дата вече има подаден оборот от този обект.','#d97706');
        return;
      }
      var msg=sbErrMsg(res);
      try{console.error('submitOborotEdit daily_turnover → '+(status||'мрежов срив')+': '+msg);}catch(e){}
      toast('Грешка при корекция: '+msg,'#dc2626');
    });
  });
}
