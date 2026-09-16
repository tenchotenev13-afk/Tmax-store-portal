/* stock-differences.js — Стока за изтегляне по разлики */

var sdData   = [];
var sdFilter = 'pending';
var sdTypeFilter = 'all';
var sdDirTab = 'supplier'; /* 'supplier' | 'interstore' - разделя И новите бланки, И главната таблица */
var sdEditId = null;
var sdSearch = '';
var sdStoreFilter = ''; /* точен филтър по магазин (чипове), отделен от свободното търсене */
/* Кои вече решени редове са с разгънати бутони за смяна на решението.
   По подразбиране решеният ред показва само спокоен чип с избора. */
var sdExpandedResolve = {};

/* ── Запазване на позицията при пре-рендиране ──
   renderStockDiff() пре-строява целия модул с innerHTML, което връщаше
   потребителя най-отгоре при всяко решение по разлика. Пазим или точна
   котва към бланката, по която се работи, или скрол позицията. */
var sdScrollY = null, sdScrollAnchor = null;
function sdKeepScroll(anchorReportId){
  if(anchorReportId) sdScrollAnchor = anchorReportId;
  if(sdScrollY == null) sdScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
}
function sdRestoreScroll(){
  var y = sdScrollY, a = sdScrollAnchor;
  sdScrollY = null; sdScrollAnchor = null;
  if(y == null && !a) return;
  var apply = function(){
    var el = a ? document.getElementById('diff-rep-'+a) : null;
    if(el && el.scrollIntoView){ el.scrollIntoView({block:'center'}); }
    else if(y != null){ window.scrollTo(0, y); }
  };
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  else apply();
}

/* line (по избор) — ред от посока 'wrong_receipt' е САМО ЗА ЧЕТЕНЕ за магазина.
   От тези редове излизат глоби (удръжки от гъвкавата част на обекта), затова
   обектът ги вижда и ги проследява, но не пипа количествата им. Без аргумент
   функцията се държи както преди — общ въпрос "тази роля пипа ли изобщо". */
function canEditSD(line) {
  if (!currentUser) return false;
  if (isWrongReceiptReadOnly(line)) return false;
  return ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
function canAddSD() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}
/* Подаване на нова бланка за разлики - магазинска страна (същите роли като canEditTransit) */
function canSubmitDiff() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
/* Решение по разликата (Заприхождаване/Връщане/Липса) - само централен офис */
function canReviewDiff() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}
/* Подаване на бланка в посока "Сторна по грешен прием" - САМО централен офис.
   Оперативните счетоводители по обекти са accounting профили с разпределение в
   users.assigned_stores (store_name им е "Централен офис"), затова ролята стига
   и нова роля не е нужна. Магазинските роли (manager/sklad/info) виждат тези
   бланки, но не ги създават - от тях излизат глоби. */
function canSubmitWrongReceipt(){
  return currentUser && ['admin','accounting'].indexOf(currentUser.role) >= 0;
}
/* Един израз за "този ред е сторна по грешен прием и аз съм магазинът".
   Ползва се от canEditSD, от модала за корекция и от модала за редакция -
   за да не се разминат трите места. */
function isWrongReceiptReadOnly(line){
  return !!line && sdLineDirection(line) === 'wrong_receipt' && !canReviewDiff();
}
/* Прикачване на снимка/документ към КОНКРЕТЕН ред: централният офис навсякъде,
   магазинът - само по своите редове. Обектът трябва да може да докаже какво е
   заприходил, без да може да пипне количествата. */
function canAttachSDLine(line){
  if (!currentUser || !line) return false;
  if (['admin','accounting'].indexOf(currentUser.role) >= 0) return true;
  var mine = assignedStores();
  if (!mine) return false; /* глобален профил без разпределение - не е "магазин" */
  return mine.indexOf(line.store_name) >= 0;
}
/* Прикачване на снимка/документ към ЦЯЛАТА бланка, след като тя вече е подадена.
   Дотук снимките се пълнеха само при подаване (diffPendingPhotos), тоест
   пропусната снимка нямаше как да догони бланката. Правата са същите като по
   ред, но се броят по бланката: централният офис навсякъде, магазинът - само
   по своята. canAttachSDLine НЕ се пипа - той решава друг въпрос. */
function canAttachDiffReport(rep){
  if (!currentUser || !rep) return false;
  if (['admin','accounting'].indexOf(currentUser.role) >= 0) return true;
  var mine = assignedStores();
  if (!mine) return false; /* глобален профил без разпределение - не е "магазин" */
  return mine.indexOf(rep.store_name) >= 0;
}
/* Кой извършва действието - едно място за начина, по който се записва авторът
   в resolved_by/completed_by. Същият израз се ползва и за created_by. */
function sdActor(){ return currentUser.display_name || currentUser.email; }
/* fmtDate() в shared.js разчита, че стойността е чиста дата - прави split('-')
   и слепва частите наобратно. Подаден timestamptz ('2026-08-19T12:13:19+00:00')
   излиза като "19T12:13:19+00:00.08.2026". Затова колоните от тип timestamptz
   (created_at, email_sent_at, resolved_at, completed_at) минават оттук:
   отрязваме часа и чак тогава форматираме. fmtDate не се пипа - него го ползват
   десетки места с реални date колони. */
function sdFmtDateTime(val){
  if(val===null||val===undefined||val==='') return '—';
  var s=String(val);
  var t=s.indexOf('T');
  return fmtDate(t>=0?s.slice(0,t):s);
}
/* Логистични складове - отделни физически обекти (не роля), чиито служители
   влизат с обичайните си профили, но с store_name = точно името на склада.
   Те виждат само разликите, при които ТЕ са насрещната страна (counterpart)
   на междускладов трансфер - Цвети се грижи за доставчиците, складовете се
   разбират директно с магазините получатели.
   Самият списък LOGISTICS_WAREHOUSES живее в shared.js (зарежда се пръв),
   защото го ползват и отчетите през isReportableStore - две копия щяха да
   се разминат при следващия нов склад. */
function isLogisticsWarehouseUser(){
  return currentUser && LOGISTICS_WAREHOUSES.indexOf(currentUser.store_name) >= 0;
}
var WH_RESPONSE_LABELS = {sent:'📤 Изпратено',will_send:'⏳ Ще се изпрати','return':'↩️ Обратно движение'};

/* ══ Регистър на посоките ══
   ЕДИН източник за подтабовете, броячите и всеки етикет по посока. Преди трета
   посока беше невъзможна тихо: броячите бяха литерали {supplier:0,interstore:0}
   (с hasOwnProperty guard, тоест нов ключ се брои като 0), а всеки етикет беше
   тернар `direction==='supplier' ? A : 'Междускладов'`, тоест всичко непознато
   се показваше като междускладово.
     [0] ключ = differences_reports.direction
     [1] етикет на подтаба
     [2] кратък етикет до бланката в списъка
     [3] подзаглавие на печатната бланка
     [4] как се казва насрещната страна (етикет на полето и в имейла)
     [5] "Установени са разлики при ___" в имейла */
var DIFF_DIRECTIONS = [
  ['supplier','📦 Разлики от доставчици','📦 Доставчик',
   'Разлика при приемане на доставка от доставчик','Доставчик','приемане на доставка'],
  ['interstore','🔄 Разлики от междускладови трансфери','🔄 Междускладов',
   'Разлика при междускладов трансфер','Обект изпращач','междускладов трансфер'],
  ['wrong_receipt','🧾 Сторна по грешен прием','🧾 Сторна по грешен прием',
   'Сторно по грешен прием — разлика между фактура и заприходена стока','Доставчик','сторно по грешен прием']
];
function diffDirKeys(){ return DIFF_DIRECTIONS.map(function(d){ return d[0]; }); }
/* Липсваща/непозната посока пада на "Доставчик" - същият fallback, който
   sdLineDirection ползва за ръчно добавените редове без report_id. */
function diffDirMeta(dir){
  var f = DIFF_DIRECTIONS.find(function(d){ return d[0] === dir; });
  return f || DIFF_DIRECTIONS[0];
}
function diffDirShortLabel(dir){ return diffDirMeta(dir)[2]; }
function diffDirPrintSub(dir){ return diffDirMeta(dir)[3]; }
function diffDirCounterpartLabel(dir){ return diffDirMeta(dir)[4]; }
function diffDirEmailPhrase(dir){ return diffDirMeta(dir)[5]; }
/* Падежите на насрещната страна в модала за имейл. Стоят ОТДЕЛНО от [4],
   защото българският иска две различни форми на едно и също нещо:
     заглавие  "Изпрати имейл до изпращач"     - нечленувана
     поле "До" "(имейл на доставчика)"          - членувана, родителен
   Обединяването им в един етикет ги изравни към именителен и даде
   "имейл на доставчик" / "имейл до обект изпращач". */
var DIFF_EMAIL_CASES = {
  supplier:      {to:'доставчик', of:'доставчика'},
  interstore:    {to:'изпращач',  of:'обекта изпращач'},
  wrong_receipt: {to:'доставчик', of:'доставчика'}
};
function diffDirEmailTo(dir){ return (DIFF_EMAIL_CASES[dir]||DIFF_EMAIL_CASES.supplier).to; }
function diffDirEmailOf(dir){ return (DIFF_EMAIL_CASES[dir]||DIFF_EMAIL_CASES.supplier).of; }
/* Заглавия на двете количествени колони. Схемата не се пипа - quantity и
   quantity_received носят различен СМИСЪЛ според посоката: при сторната по
   грешен прием сравнението е фактура ↔ заприходено, не доставка ↔ получено.
   Знакът носи вида на разликата: заприходено > фактура = приета нефактурирана;
   заприходено < фактура = фактурирана неприета.
   doc/real     - пълните етикети (форма за подаване, имейл)
   docShort/... - за тесните таблици на екрана
   printDoc/... - за печата, където колоните са 11mm и 13mm; там думите остават
                  възможно най-къси, за да не се пречупват на три реда.
                  „По фактура" в 11mm се пречупваше на три реда - в печата
                  остава само „Фактура".
                  printReal е „Реално", не „Получено": на 30.08.2026 реален
                  print preview показа „Получе|но" - осем знака не се побират
                  в 13mm при 7.5pt, дори след като страничният padding падна
                  на 0.8mm. „Реално" е СЪЩАТА дума, която realShort вече
                  ползва за същото поле, не ново съкращение. Ширините не се
                  пипат: 190mm са заковани в
                  tests/diff-print-supplier-col.test.js.
   „Количество … (бр.)", а не „По вх. доставка": към 13.09.2026 в
   stock_differences стояха 21 реда с quantity = номер на входяща доставка
   (1804…/8046…) - подсказката се четеше като „впиши вх. доставка". „(бр.)"
   казва, че тук се пише БРОЙ. При сторна по грешен прием смисълът остава
   фактура ↔ заприходено, затова там думите са други. Печатът не се пипа. */
function diffQtyLabels(dir){
  if (dir === 'wrong_receipt') return {doc:'Количество по фактура (бр.)', docShort:'Кол. по фактура',
                                       real:'Реално заприходено (бр.)',  realShort:'Заприходено',
                                       printDoc:'Фактура',     printReal:'Заприх.'};
  return {doc:'Количество по документ (бр.)', docShort:'Кол. по док.',
          real:'Реално получено (бр.)',        realShort:'Реално',
          printDoc:'Кол.',        printReal:'Реално'};
}
/* Изпращане на имейл до доставчик - Цветелина Тенева + admin (за тестване/подпомагане) */
function canSendDiffEmail() {
  if (!currentUser) return false;
  if ((currentUser.email||'').toLowerCase() === 'c.teneva@temax.bg') return true;
  return currentUser.role === 'admin';
}

var DIFF_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var DIFF_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var DIFF_BKT = 'bulletin-files'; /* преизползваме съществуващия bucket, отделен префикс на пътя */

var diffReports = [];       /* differences_reports - заредени бланки */
var sdSwaps = [];           /* stock_diff_swaps - размените, в които участват заредените междускладови редове */
var diffPendingPhotos = []; /* снимки, качени в текущо отворената форма за подаване, преди submit */

function loadStockDiff() {
  var wrap = document.getElementById('mod-stock-diff');
  sdKeepScroll();
  /* Показваме "Зареждане..." САМО при първо отваряне. При опресняване след
     действие (напр. решение по разлика) старото съдържание остава на екрана -
     иначе височината на страницата се срива до 200px и браузърът сам изтрива
     скрол позицията, преди да успеем да я върнем. */
  if (wrap && !wrap.innerHTML.trim()) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  Promise.all([
    sbGet('stock_differences', 'order=created_at.desc.nullslast' + storeQ()),
    sbGet('differences_reports', 'order=created_at.desc' + storeQ())
  ]).then(function(res){
    sdData = Array.isArray(res[0]) ? res[0] : [];
    diffReports = Array.isArray(res[1]) ? res[1] : [];
    /* Размените зависят от id-тата на вече заредените редове - затова
       след Promise.all, не в него. */
    return sdLoadSwaps();
  }).then(function(){
    renderStockDiff();
  }).catch(function(err) {
    var w = document.getElementById('mod-stock-diff');
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
    console.error(err);
  });
}

function renderStockDiff() {
  var wrap = document.getElementById('mod-stock-diff');
  if (!wrap) return;
  var isAdmin = currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
  var canAdd  = canAddSD();

  var list = sdTableRows();

  var TYPE_LABELS = { writein:'📥 Заприхождаване', 'return':'↩️ Връщане', missing:'❓ Липса', not_invoiced:'🧾 Не са фактурирани' };
  var TYPE_COLORS = { writein:'#2563eb', 'return':'#7c3aed', missing:'#dc2626', not_invoiced:'#64748b' };

  /* Обхватът на КАРТИТЕ следва филтъра по тип - иначе етикетът казва
     "Заприходена", а числото брои и връщанията. При "Всички типове" остават
     сборни (там и думите са неутрални). Другите филтри (магазин, търсене,
     посока, статус) НЕ стесняват картите - те са преглед на модула, не на
     текущия изглед. Редовете без тип обаче отпадат и тук: те стоят в "За
     преглед" и не могат да се появят в таблицата при никой филтър. */
  var counted = sdData.filter(function(r){
    if (!r.type) return false;
    return sdTypeFilter==='all' || r.type===sdTypeFilter;
  });
  var pending = counted.filter(function(r){ return r.status==='pending'; }).length;
  var taken   = counted.filter(sdIsTaken).length;

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📋 Разлики</div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  if (canSubmitDiff()) h += '<button onclick="openDiffSubmitModal()" style="border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📝 Подай бланка</button>';
  if (canAdd) h += '<button onclick="openSDModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави ръчно</button>';
  h += '</div></div>';

  /* Важна бележка */
  h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;font-weight:600;color:#856404;">'+
    '⚠️ ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС И Е В ДОБЪР ТЪРГОВСКИ ВИД!'+
    '</div>';

  /* Подтабове по посока - разделят И новоподадените бланки, И главната
     (резолвирана) таблица, за да не се смесват доставчиковите разлики
     (грижа на Цвети) с междускладовите (грижа на логистичните складове).
     Не важи за самите складове - тяхната видимост вече е ограничена
     другояче (само собствените им насрещни). */
  if(sdDirTabsActive()){
    /* Броячите се СТРОЯТ от регистъра, а не са литерали - иначе всяка нова
       посока би се броила като 0, без нищо да се счупи видимо. */
    var dirCounts = {}, dirNew = {};
    diffDirKeys().forEach(function(k){ dirCounts[k]=0; dirNew[k]=0; });
    sdData.forEach(function(r){
      if(!r.type) return;
      if(dirCounts.hasOwnProperty(sdLineDirection(r))) dirCounts[sdLineDirection(r)]++;
    });
    /* Брой НОВИ (непрегледани) бланки по посока - за да се вижда още от таба,
       че от другата страна чака нещо, без да се превключва. */
    sdVisibleUnreviewedReports().forEach(function(rep){
      var d = rep.direction || 'supplier';
      if(dirNew.hasOwnProperty(d)) dirNew[d]++;
    });
    h += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
    DIFF_DIRECTIONS.forEach(function(t){
      var a = sdDirTab===t[0];
      h += '<button data-dir="'+t[0]+'" onclick="setSDDirTab(this.dataset.dir)" style="border:1px solid '+(a?'#0f172a':'#e2e8f0')+';padding:6px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;background:'+(a?'#0f172a':'#fff')+';color:'+(a?'#fff':'#64748b')+';">'+t[1]+' ('+dirCounts[t[0]]+')'+
        (dirNew[t[0]]?'<span style="margin-left:6px;background:#dc2626;color:#fff;border-radius:20px;padding:1px 7px;font-size:11px;">🆕 '+dirNew[t[0]]+'</span>':'')+'</button>';
    });
    h += '</div>';
  }

  /* Търсене + чипове по магазин - филтрират И новите бланки, И таблицата
     (както в таб "За връщане") */
  h += '<input id="sd-search-input" value="'+escVal(sdSearch)+'" oninput="setSDSearch(this.value)" placeholder="🔍 Търси по магазин, доставчик/изпращач, артикул, SAP, документ, поръчка..." style="width:100%;max-width:520px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px;font-size:12.5px;font-family:inherit;margin-bottom:10px;display:block;">';
  h += sdStoreChipsHtml();

  /* Новоподадени бланки - чакат преглед от Цветелина */
  h += renderDiffReportsSection();

  /* Карти */
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;max-width:400px;">';
  var cw = sdCounterWords(sdTypeFilter);
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #f59e0b;"><div style="font-size:11px;color:#64748b;">'+cw.pIcon+' '+cw.pending+'</div><div style="font-size:28px;font-weight:700;color:#f59e0b;font-family:DM Mono,monospace;">'+pending+'</div></div>';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #16a34a;"><div style="font-size:11px;color:#64748b;">'+cw.tIcon+' '+cw.taken+'</div><div style="font-size:28px;font-weight:700;color:#16a34a;font-family:DM Mono,monospace;">'+taken+'</div></div>';
  h += '</div>';

  /* Филтър по тип. Числото е "колко реда ще видиш при клик" - затова минава
     през sdTableRows със заменен само типа, а активният филтър по статус,
     магазин, търсене и посока остава. */
  var typeCounts = {
    writein:  sdTableRows({type:'writein'}).length,
    'return': sdTableRows({type:'return'}).length,
    missing:  sdTableRows({type:'missing'}).length,
    not_invoiced: sdTableRows({type:'not_invoiced'}).length
  };
  /* Втори ред чипове по магазин, точно над филтрите на долната таблица.
     Филтърът sdStoreFilter важи и за нея, но горният ред е екрани по-нагоре
     (над непрегледаните бланки) и оттук не се вижда. Същата функция - един
     филтър, едни бройки; кликът на който и да е от двата реда пренарисува
     целия модул, тоест маркирането винаги е еднакво и в двата. При 0 магазина
     функцията връща '' и двата реда изчезват заедно. */
  h += sdStoreChipsHtml();
  h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
  [['all','Всички типове'],['writein','📥 Заприхождаване ('+typeCounts.writein+')'],['return','↩️ Връщане ('+typeCounts['return']+')'],['missing','❓ Липса ('+typeCounts.missing+')'],['not_invoiced','🧾 Не са фактурирани ('+typeCounts.not_invoiced+')']].forEach(function(f){
    var a = sdTypeFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setSDTypeFilter(this.dataset.f)" style="border:1px solid '+(a?'#0f172a':'#e2e8f0')+';padding:4px 12px;border-radius:40px;font-size:11.5px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#fff')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  /* Филтри по статус. Същият критерий - числото е броят редове след клика,
     не общият брой в модула (за това са картите отгоре). */
  var chipAll     = sdTableRows({status:'all'}).length;
  var chipPending = sdTableRows({status:'pending'}).length;
  var chipTaken   = sdTableRows({status:'taken'}).length;
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  [['all','Всички ('+chipAll+')'],['pending',cw.pIcon+' '+cw.pending+' ('+chipPending+')'],['taken',cw.tIcon+' '+cw.taken+' ('+chipTaken+')']].forEach(function(f){
    var a = sdFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setSDFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  /* Таблица */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📋</div><div style="margin-top:8px;">Няма записи.</div></div>';
  } else {
    h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    ['Тип','Магазин','Доставчик','Материал','Наименование','Кол.','Поръчка','Дата потвърд.','Статус','Кредитно','Снимки','Коментар','Коментар Контролер','Отговор на склада',''].forEach(function(c){
      h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
    });
    h += '</tr></thead><tbody>';

    list.forEach(function(r) {
      var isTaken = r.status === 'taken';
      var statusBadge = sdRowStatusBadge(r);
      /* Правата се смятат ПО РЕД, не веднъж за целия рендер - редовете от
         "Сторна по грешен прием" са само за четене за магазина, а в един и същ
         изглед може да има редове от повече от една посока. */
      var canEdit = canEditSD(r);
      /* Кредитно известие - релевантно само за тип "Липса" (доставчикът не ни е
         доставил артикула, трябва финансово да ни компенсира) */
      var creditCell = '—';
      if (r.type === 'missing') {
        creditCell = canEdit
          ? '<button data-id="'+r.id+'" onclick="sdToggleCreditNote(this.dataset.id)" style="border:none;border-radius:20px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;background:'+(r.credit_note_issued?'#f0fdf4':'#fef2f2')+';color:'+(r.credit_note_issued?'#16a34a':'#dc2626')+';">'+(r.credit_note_issued?'✅ Издадено':'❌ Няма')+'</button>'
          : (r.credit_note_issued?'<span style="color:#16a34a;">✅ Издадено</span>':'<span style="color:#dc2626;">❌ Няма</span>');
      }

      h += '<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:7px 10px;white-space:nowrap;"><span style="background:'+(TYPE_COLORS[r.type]||'#94a3b8')+'1a;color:'+(TYPE_COLORS[r.type]||'#64748b')+';padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">'+(TYPE_LABELS[r.type]||r.type||'—')+'</span></td>'+
        '<td style="padding:7px 10px;font-weight:500;">'+esc(r.store_name||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#64748b;">'+esc(r.supplier||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.material_code||'')+'</td>'+
        '<td style="padding:7px 10px;max-width:200px;">'+esc(r.material_name||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+sdQtyCell(r.quantity,(r.quantity)||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.order_number||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.confirmed_date)+'</td>'+
        '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">'+creditCell+'</td>'+
        /* Снимките са прикачени на ниво БЛАНКА (differences_reports.photos), не
           на реда - затова не се виждаха тук, след като редът бъде решен и
           излезе от секцията "Нови подадени бланки" (напр. при директно
           решение "Липса" без коментар). Под тях стоят и прикачените към САМИЯ
           РЕД файлове (attachments) - там живеят снимките по сторната. */
        '<td style="padding:7px 10px;">'+diffReportPhotoThumbs(r.report_id)+sdLineAttachCell(r)+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:500;">'+esc(r.comment||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#7c3aed;font-weight:500;">'+esc(r.resolution_comment||'')+(normSDAttachments(r.attachments).length?' 📎'+normSDAttachments(r.attachments).length:'')+'</td>'+
        /* Под отговора на склада - отговорът на магазина. Само при зададен
           store_response: без него sdStoreResponseLabel казва "чака магазина",
           а тук стоят доставчикови и вече приключени редове. */
        '<td style="padding:7px 10px;font-size:11px;">'+(r.warehouse_response?('<span style="color:#16a34a;font-weight:600;">'+(WH_RESPONSE_LABELS[r.warehouse_response]||r.warehouse_response)+'</span>'+(r.warehouse_comment?'<div style="font-size:10px;color:#64748b;">💬 '+esc(r.warehouse_comment)+'</div>':'')):'<span style="color:#cbd5e1;">—</span>')+(r.store_response?sdStoreResponseLabel(r):'')+sdSwapSummary(r)+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';

      /* status='received' е КРАЯТ на междускладовия поток. Такъв ред няма
         type, тоест етикетът по-долу пада на "✅ Приета" и един клик би
         записал status='taken' върху потвърждението - тоест би изтрил края
         на потока и би върнал реда в "чакащи". Затова бутон няма. */
      /* "Не са фактурирани" чака крайно решение. Вместо бутона за приключване
         (той би го направил 'taken' без решение) редът предлага двете крайни
         решения - същият resolveDiffLine като бутоните в новите бланки, тоест
         сменя типа, при "Връщане" създава запис в "За връщане" и прилага
         автоматичното количество. Само за който има право да решава. */
      if (r.type==='not_invoiced' && !isTaken && canReviewDiff() && !isLogisticsWarehouseUser()) {
        h += '<button data-id="'+r.id+'" onclick="resolveDiffLine(this.dataset.id,\'writein\')" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">📥 Заприх.</button>';
        h += '<button data-id="'+r.id+'" onclick="resolveDiffLine(this.dataset.id,\'return\')" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#7c3aed;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">↩️ Връщане</button>';
      }
      if (canEdit && !isTaken && r.status !== 'received' && r.type !== 'not_invoiced') {
        var takenLabel = r.type==='return' ? '✅ Върната' : r.type==='missing' ? '✅ Изписана' : r.type==='writein' ? '📥 Заприходена' : r.type==='not_invoiced' ? '🧾 Приключена' : '✅ Приета';
        h += '<button data-id="'+r.id+'" onclick="sdMarkTaken(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">'+takenLabel+'</button>';
      }
      if (canEdit) {
        h += '<button data-id="'+r.id+'" onclick="openSDModal(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
      }
      /* Печат само за редове, дошли от бланка - ръчно добавените нямат
         report_id, тоест няма какво да се разпечата. */
      if (r.report_id) {
        h += '<button data-rid="'+r.report_id+'" onclick="loadDiffPrint(this.dataset.rid)" title="Печат на бланката" style="border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">🖨</button>';
      }
      if (isAdmin) {
        h += '<button data-id="'+r.id+'" onclick="sdDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button>';
      }
      /* Триене на ЦЯЛАТА бланка — второ място нарочно: картата горе изчезва,
         щом бланката бъде маркирана като прегледана (sdVisibleUnreviewedReports
         филтрира !reviewed), тоест стара сгрешена бланка иначе е недостижима. */
      if (r.report_id && sdCanDeleteReport()) {
        h += '<button data-rid="'+r.report_id+'" onclick="sdDeleteReport(this.dataset.rid)" title="Изтрий ЦЯЛАТА бланка — редове и файлове, необратимо" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-left:2px;">🗑</button>';
      }
      h += '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">'+list.length+' от '+sdData.length+' записа.</div>';
  }

  h += '</div>';
  h += sdModalHtml();
  wrap.innerHTML = h;
  sdRestoreScroll();
  sdUpdateTabBadgeFromData();
}

/* 'capitalized' е историческа стойност за СЪЩОТО състояние като 'taken' (виж
   sdModalHtml). Всяко място, което пита "приключен ли е редът", минава оттук -
   баджът, броячите и филтърът. Докато баджът я четеше, а броячът не, редът се
   показваше като ЗАПРИХОДЕНА, но не влизаше в нито едно число. */
function sdIsTaken(r){ return r.status==='taken' || r.status==='capitalized'; }

/* ЕДИН критерий за това кои редове влизат в главната таблица. Ползва се и от
   таблицата, и от числата по чиповете - иначе числото обещава едно, а кликът
   показва друго (чипът "Всички" броеше целия sdData, включително редовете без
   тип, които стоят в секцията "За преглед" и никога не влизат тук).

   `over` подменя ЕДИНСТВЕНО измерението, което самият чип управлява. Без това
   чипът "Липса" щеше да се брои през вече включения филтър "Заприхождаване" и
   винаги да показва 0. Останалите филтри (магазин, търсене, посока) остават
   активни нарочно - те стесняват и таблицата, значи стесняват и числото. */
function sdTableRows(over){
  over = over || {};
  var typeF   = over.hasOwnProperty('type')   ? over.type   : sdTypeFilter;
  var statusF = over.hasOwnProperty('status') ? over.status : sdFilter;
  return sdData.filter(function(r) {
    /* Ред без тип още не е минал през Цветелина - мястото му е в секцията
       "За преглед". Изключение: междускладов ред, потвърден от отсрещната
       страна (status='received'). Там решение от Цвети няма и никога няма да
       дойде - потокът свършва с потвърждението, а приключеният ред трябва да
       е видим и след като бланката се затвори. */
    if (!r.type && !(sdLineDirection(r)==='interstore' && r.status==='received')) return false;
    /* Логистичен склад - вижда само собствените си насрещни разлики.
       counterpart живее в differences_reports, не директно в реда - търсим
       през report_id. */
    if (isLogisticsWarehouseUser()) {
      var parentRep = diffReports.find(function(x){return x.id===r.report_id;});
      if (!parentRep || parentRep.counterpart !== currentUser.store_name) return false;
    } else {
      /* За всички останали - подтабовете "Доставчици"/"Междускладови" разделят
         главната таблица, за по-ясно разграничение (най-вече за Цвети, която
         управлява доставчиковите; междускладовите вече минават през склада). */
      var rp = diffReports.find(function(x){return x.id===r.report_id;});
      var rDir = rp ? rp.direction : 'supplier';
      if (rDir !== sdDirTab) return false;
    }
    if (typeF !== 'all' && r.type !== typeF) return false;
    if (statusF === 'pending') { if (r.status !== 'pending') return false; }
    else if (statusF === 'taken') { if (!sdIsTaken(r)) return false; }
    /* Точен филтър по магазин (чиповете) - ОТДЕЛЕН от свободното търсене
       по-долу, за да не се влияе от текст в коментари, споменаващ друг обект. */
    if (sdStoreFilter && r.store_name !== sdStoreFilter) return false;
    if (sdSearch) {
      var q = sdSearch.toLowerCase();
      var hay = [r.store_name,r.supplier,r.material_name,r.material_code,r.order_number,r.comment].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* Едно и също състояние в схемата (status='pending'/'taken') се казва различно
   според типа на решението: при връщане куриерът ВЗИМА стоката, при
   заприхождаване магазинът я ЗАПРИХОЖДАВА. Базата не се пипа - сменя се само
   думата. */
/* direction (по избор) - при сторна по грешен прием нито "Взета", нито
   "Заприходена" значи нещо: никой не идва да взима стока и нищо не се
   заприхождава наново. Там състоянието е "магазинът изчистил ли е реда".
   Без втори аргумент функцията се държи както преди. */
function sdStatusWords(type, direction){
  if(direction==='wrong_receipt') return {pending:'Неизчистена', taken:'Изчистена', pIcon:'⏳', tIcon:'✅'};
  if(type==='writein') return {pending:'Незаприходена', taken:'Заприходена', pIcon:'⏳', tIcon:'📥'};
  /* "Не са фактурирани" е междинно състояние - редът чака крайно решение
     (заприхождаване или връщане), тоест нито "Невзета", нито "Незаприходена"
     казва истината. 'taken' е недостижимо по нормалния път; думата стои само
     за да не излиза "Взета", ако такъв ред все пак се появи. */
  if(type==='not_invoiced') return {pending:'Чака решение', taken:'Приключена', pIcon:'⏳', tIcon:'🧾'};
  return {pending:'Невзета', taken:'Взета', pIcon:'⏳', tIcon:'✅'};
}
/* За сборните карти и чипове, където изгледът смесва типове ("Всички типове"
   или "Липса"), нито "Взета", нито "Заприходена" е вярно за всички редове -
   там думите са неутрални. */
function sdCounterWords(typeFilter){
  if(typeFilter==='writein') return sdStatusWords('writein');
  if(typeFilter==='return')  return sdStatusWords('return');
  if(typeFilter==='not_invoiced') return sdStatusWords('not_invoiced');
  return {pending:'Чакащи', taken:'Приключени', pIcon:'⏳', tIcon:'✅'};
}
/* Баджът в реда знае типа на самия ред, затова там думата е точна винаги. */
function sdRowStatusBadge(r){
  function badge(bg,fg,txt){
    return '<span style="background:'+bg+';color:'+fg+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+txt+'</span>';
  }
  if(r.status==='received') return badge('#f0fdfa','#0d9488','📬 ПРИЕТА');
  /* Посоката влиза ЕДИНСТВЕНО за да смени думата при сторна по грешен прием
     ("Неизчистена/Изчистена" вместо "Невзета/Взета") - вече го прави и
     печатът. За всяка друга посока sdStatusWords пада на заварените си
     клонове, тоест изходът тук е байт по байт същият. Цветовете не се
     пипат: те следват ТИПА на решението, не посоката. */
  var w = sdStatusWords(r.type, sdLineDirection(r));
  if(sdIsTaken(r)){
    if(r.type==='not_invoiced') return badge('#f1f5f9','#475569', w.tIcon+' '+w.taken.toUpperCase());
    return r.type==='writein'
      ? badge('#eff6ff','#1e40af', w.tIcon+' '+w.taken.toUpperCase())
      : badge('#f0fdf4','#16a34a', w.tIcon+' '+w.taken.toUpperCase());
  }
  return badge('#fffbeb','#92400e', w.pIcon+' '+w.pending.toUpperCase());
}

/* ── Помощни функции за посока / видимост / снимки ── */
/* Посоката на един ред идва от родителската бланка; ръчно добавените редове
   (без report_id) се третират като доставчикови - там винаги са били. */
function sdLineDirection(line){
  var rp = diffReports.find(function(x){return x.id===line.report_id;});
  return (rp && rp.direction) ? rp.direction : 'supplier';
}
/* Логистичните складове не виждат подтабовете по посока - тяхната видимост
   вече е ограничена до собствените им насрещни (винаги междускладови). */
function sdDirTabsActive(){ return !isLogisticsWarehouseUser(); }
/* Непрегледаните бланки, които ТОЗИ потребител изобщо има право да види -
   без филтрите по посока/магазин/търсене (те са за екрана, не за броячите). */
function sdVisibleUnreviewedReports(){
  var list = diffReports.filter(function(r){ return !r.reviewed; });
  if(isLogisticsWarehouseUser()){
    list = list.filter(function(r){ return r.counterpart === currentUser.store_name; });
  }
  return list;
}
/* Миниатюри на снимките, качени от МАГАЗИНА към бланката. Показват се и в
   главната таблица, и в модала - независимо дали редът е още непрегледан,
   или Цвети вече го е решила (напр. като "Липса"). */
function diffReportPhotoThumbs(reportId, size){
  if(!reportId) return '<span style="color:#cbd5e1;">—</span>';
  var rep = diffReports.find(function(x){return x.id===reportId;});
  var photos = (rep && Array.isArray(rep.photos)) ? rep.photos : [];
  if(!photos.length) return '<span style="color:#cbd5e1;">—</span>';
  var px = size || 30;
  var h = '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
  photos.forEach(function(p){
    if(!p || !p.url) return;
    /* Не всичко, качено през "Снимай сега/Избери от галерия", реално е снимка -
       служителите понякога прикачват сканирани PDF документи, които <img> не
       може да покаже вградено. */
    var isImg = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(p.url);
    if(isImg){
      h += '<a href="'+esc(p.url)+'" target="_blank" title="'+esc(p.name||'Снимка')+'"><img src="'+esc(p.url)+'" style="width:'+px+'px;height:'+px+'px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;"></a>';
    } else {
      h += '<a href="'+esc(p.url)+'" target="_blank" title="'+esc(p.name||'Файл')+'" style="display:inline-flex;align-items:center;justify-content:center;width:'+px+'px;height:'+px+'px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:13px;text-decoration:none;">📄</a>';
    }
  });
  h += '</div>';
  return h;
}

/* ── Чипове за филтриране по магазин (както в таб "За връщане") ── */
/* Списъкът се гради от магазините, реално налични в текущата посока - и от
   непрегледаните бланки, и от вече решените редове, за да не изчезва чипът
   на магазин точно след като бланката му бъде прегледана. */
function sdStoresInCurrentTab(){
  var seen = {}, out = [];
  var add = function(s){ if(s && !seen[s]){ seen[s]=1; out.push(s); } };
  sdVisibleUnreviewedReports().forEach(function(rep){
    if(sdDirTabsActive() && (rep.direction||'supplier') !== sdDirTab) return;
    add(rep.store_name);
  });
  sdData.forEach(function(r){
    if(!r.type) return;
    if(isLogisticsWarehouseUser()){
      var rp = diffReports.find(function(x){return x.id===r.report_id;});
      if(!rp || rp.counterpart !== currentUser.store_name) return;
    } else if(sdLineDirection(r) !== sdDirTab) return;
    add(r.store_name);
  });
  return out.sort();
}
function sdStoreCount(store){
  var n = 0;
  sdVisibleUnreviewedReports().forEach(function(rep){
    if(sdDirTabsActive() && (rep.direction||'supplier') !== sdDirTab) return;
    if(rep.store_name === store) n++;
  });
  sdData.forEach(function(r){
    if(!r.type) return;
    if(isLogisticsWarehouseUser()){
      var rp = diffReports.find(function(x){return x.id===r.report_id;});
      if(!rp || rp.counterpart !== currentUser.store_name) return;
    } else if(sdLineDirection(r) !== sdDirTab) return;
    if(r.store_name === store) n++;
  });
  return n;
}
function sdStoreChipsHtml(){
  var stores = sdStoresInCurrentTab();
  /* Показваме чиповете при ПОНЕ 1 магазин. По-рано се криеха при един-единствен
     магазин ("само заемат място") - но контрол, който ту го има, ту го няма
     според данните, изглежда като счупен филтър. Предсказуемостта е по-важна
     от спестения ред. */
  if(!stores.length) return '';
  var total = stores.reduce(function(m,s){ return m + sdStoreCount(s); }, 0);
  var h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">';
  h += '<button data-store="" onclick="setSDStoreFilter(this.dataset.store)" style="border:1px solid '+(!sdStoreFilter?'#2563eb':'#e2e8f0')+';background:'+(!sdStoreFilter?'#eff6ff':'#fff')+';color:'+(!sdStoreFilter?'#2563eb':'#64748b')+';border-radius:20px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer;">🏪 Всички ('+total+')</button>';
  stores.forEach(function(s){
    var a = sdStoreFilter===s;
    h += '<button data-store="'+esc(s)+'" onclick="setSDStoreFilter(this.dataset.store)" style="border:1px solid '+(a?'#2563eb':'#e2e8f0')+';background:'+(a?'#eff6ff':'#fff')+';color:'+(a?'#2563eb':'#64748b')+';border-radius:20px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer;">'+esc(s)+' ('+sdStoreCount(s)+')</button>';
  });
  h += '</div>';
  return h;
}

/* ── Бутони за решение по ред (само canReviewDiff) ── */
function diffLineResolveButtons(l){
  var TYPE_LABELS={writein:'📥 Заприх.',return:'↩️ Връщане',missing:'❓ Липса',not_invoiced:'🧾 Не са фактурирани'};
  /* Логистичните складове НИКОГА не виждат/пипат решението на Цвети - то е
     само за разлики с доставчици, независимо каква роля има складовият
     профил технически (напр. 'logistics'). */
  if(isLogisticsWarehouseUser()){
    if(l.type) return '<span style="color:#94a3b8;">— (за доставчици, не за вас)</span>';
    return '<span style="color:#cbd5e1;">—</span>';
  }
  if(!canReviewDiff()){
    if(l.type) return '<span style="color:#16a34a;font-weight:600;">✓ '+(TYPE_LABELS[l.type]||l.type)+'</span>';
    /* Междускладов ред: Цвети не решава изобщо - "чака преглед" караше
       магазина да чака решение, което никога няма да дойде. */
    if(sdLineDirection(l)==='interstore') return '<span style="color:#cbd5e1;">—</span>';
    return '<span style="color:#94a3b8;">чака преглед</span>';
  }
  var TYPE_COLORS={writein:'#2563eb',return:'#7c3aed',missing:'#dc2626',not_invoiced:'#64748b'};
  /* Вече решен ред - трите бутона се свиват до един спокоен чип с избора.
     Така нерешените редове изпъкват от само себе си при преглед на дълга
     бланка, вместо навсякъде да стоят по три еднакво тежки бутона. */
  if(l.type && !sdExpandedResolve[l.id]){
    var c=TYPE_COLORS[l.type]||'#16a34a';
    return '<div style="display:flex;align-items:center;gap:5px;white-space:nowrap;">'+
      '<span style="background:'+c+'1a;color:'+c+';border-radius:5px;padding:3px 8px;font-size:10.5px;font-weight:700;">✓ '+(TYPE_LABELS[l.type]||l.type)+'</span>'+
      '<button data-id="'+l.id+'" onclick="sdToggleResolveEdit(this.dataset.id)" title="Смени решението" style="border:none;background:none;color:#94a3b8;font-size:10.5px;cursor:pointer;text-decoration:underline;padding:0;">смени</button>'+
    '</div>';
  }
  /* Бутоните остават кликаеми и СЛЕД избор - текущият избор е открояван,
     но може да се коригира директно с 1 клик, ако е избран грешен тип. */
  var mk=function(type,label,color){
    var active=l.type===type;
    return '<button data-id="'+l.id+'" onclick="resolveDiffLine(this.dataset.id,\''+type+'\')" title="'+(active?'Текущ избор — кликни друг бутон, за да коригираш':'Кликни, за да избереш')+'" style="border:none;background:'+(active?color:color+'1a')+';color:'+(active?'#fff':color)+';border-radius:5px;padding:3px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">'+(active?'✓ ':'')+label+'</button>';
  };
  return '<div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">'+
    mk('writein','📥 Заприх.','#2563eb')+
    mk('return','↩️ Връщане','#7c3aed')+
    mk('missing','❓ Липса','#dc2626')+
    /* "Не са фактурирани" има смисъл само срещу доставчик: артикул в стоковата,
       който нито е доставен, нито фактуриран. Между складове и при сторна по
       грешен прием фактура няма, затова и бутон няма. */
    (sdLineDirection(l)==='supplier' ? mk('not_invoiced','🧾 Не са фактурирани','#64748b') : '')+
    (l.type?'<button data-id="'+l.id+'" onclick="sdToggleResolveEdit(this.dataset.id)" title="Затвори" style="border:none;background:none;color:#94a3b8;font-size:12px;cursor:pointer;padding:0 2px;">✕</button>':'')+
  '</div>';
}
/* Разгъва/свива трите бутона за вече решен ред (виж diffLineResolveButtons) */
function sdToggleResolveEdit(lineId){
  var line=sdData.find(function(x){return String(x.id)===String(lineId);});
  sdKeepScroll(line?line.report_id:null);
  if(sdExpandedResolve[lineId]) delete sdExpandedResolve[lineId];
  else sdExpandedResolve[lineId]=true;
  renderStockDiff();
}
/* Решение на ЛОГИСТИЧНИЯ СКЛАД (отделно от решението на Цветелина) - само за
   междускладови разлики, при които складът е насрещна страна (counterpart).
   Складът: Изпратено/Ще се изпрати/Обратно движение + коментар. Цвети/admin
   виждат резултата само за оглед, не могат да го сменят. */
function diffWarehouseResolveButtons(l, rep){
  var isMyWarehouse = isLogisticsWarehouseUser() && rep && rep.counterpart===currentUser.store_name;
  if(isMyWarehouse){
    var mk=function(val,label,color){
      var active=l.warehouse_response===val;
      return '<button data-lid="'+l.id+'" data-val="'+val+'" onclick="openWarehouseResponseModal(this.dataset.lid,this.dataset.val)" style="border:none;background:'+(active?color:color+'1a')+';color:'+(active?'#fff':color)+';border-radius:5px;padding:3px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">'+(active?'✓ ':'')+label+'</button>';
    };
    var h='<div style="display:flex;gap:3px;flex-wrap:wrap;">'+
      mk('sent','📤 Изпратено','#16a34a')+
      mk('will_send','⏳ Ще изпрати','#d97706')+
      mk('return','↩️ Обратно','#7c3aed')+
      '</div>';
    if(l.warehouse_comment) h+='<div style="font-size:10px;color:#64748b;margin-top:2px;">💬 '+esc(l.warehouse_comment)+'</div>';
    return h;
  }
  /* Цвети/admin/обикновени потребители - само за оглед, не могат да пипат */
  if(l.warehouse_response){
    var h2='<span style="color:#16a34a;font-weight:600;">'+(WH_RESPONSE_LABELS[l.warehouse_response]||l.warehouse_response)+'</span>';
    /* Коментарът на склада е за магазина - на 10px в сиво не го четеше никой.
       white-space:normal, защото клетката е nowrap и дълъг текст излизаше навън. */
    if(l.warehouse_comment) h2+='<div style="margin-top:3px;font-size:11px;color:#1e293b;border:1px solid #cbd5e1;background:#f8fafc;border-radius:5px;padding:3px 6px;white-space:normal;">💬 '+esc(l.warehouse_comment)+'</div>';
    return h2;
  }
  return '<span style="color:#94a3b8;">чака склада</span>';
}
/* Кой потвърждава получаването по междускладов ред - стои ПОД отговора на
   склада в същата колона, защото е следващата стъпка по същия ред.
   Правилото е "потвърждава този, при когото стоката отива":
     - "📤 Изпратено"        -> магазинът получател (rep.store_name);
     - "↩️ Обратно движение" -> складът, който я приема обратно (rep.counterpart).
   При "⏳ Ще се изпрати" още няма какво да се потвърждава - бутон не се
   рендира, за да не се потвърди стока, която не е тръгнала. */
function sdInterstoreConfirmButton(l, rep){
  if(!rep || rep.direction!=='interstore') return '';
  /* Вече потвърден ред - и двете страни виждат едно и също: кой и кога. */
  if(l.status==='received'){
    return '<div style="margin-top:3px;font-size:10.5px;color:#0d9488;font-weight:600;">📬 Получено'+
      (l.completed_by?' · '+esc(l.completed_by):'')+
      (l.completed_at?' · '+sdFmtDateTime(l.completed_at):'')+'</div>';
  }
  /* Отворена размяна замества пътя "приет / пуснато в SAP / прието обратно" -
     стоката отива в друг магазин, а размяната се води в sdSwapPanel. */
  if(sdSwapsForLine(l).some(function(s){ return s.status!=='closed'; })) return '';
  if(l.warehouse_response==='will_send'){
    return '<div style="margin-top:3px;font-size:10.5px;color:#94a3b8;">чака изпращане</div>';
  }
  /* as: 'store' = ПРИЕТО от магазина (записва и store_response), 'warehouse' =
     "Прието обратно" от склада (store_response не се пипа - той е на магазина). */
  var mk = function(label,color,as){
    return '<div style="margin-top:3px;"><button data-lid="'+l.id+'" data-as="'+as+'" onclick="sdConfirmInterstore(this.dataset.lid,this.dataset.as)" style="border:none;background:'+color+';color:#fff;border-radius:5px;padding:3px 8px;font-size:10.5px;font-weight:600;cursor:pointer;">'+label+'</button></div>';
  };
  var isStoreSide = sdIsInterstoreStoreSide(l, rep);
  if(l.warehouse_response==='sent'){
    return isStoreSide ? mk('✅ ПРИЕТО','#0d9488','store') : sdStoreResponseLabel(l);
  }
  /* Обратно движение: магазинът първо пуска движението в SAP (или казва, че
     не може - няма наличност в логистика), и чак тогава складът приема
     стоката обратно. Двата бутона на магазина остават кликаеми и след избор -
     "няма наличност" става "пуснато", когато складът оправи наличността. */
  if(l.warehouse_response==='return'){
    if(isStoreSide){
      var sb = function(val,label,color,onclick){
        var active = l.store_response===val;
        return '<button data-lid="'+l.id+'" onclick="'+onclick+'" style="border:none;background:'+(active?color:color+'1a')+';color:'+(active?'#fff':color)+';border-radius:5px;padding:3px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">'+(active?'✓ ':'')+label+'</button>';
      };
      var hs = '<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap;">'+
        sb('sap_done','📄 ПУСНАТО В SAP','#7c3aed',"sdSetStoreResponse(this.dataset.lid,'sap_done')")+
        sb('no_stock','⛔ НЯМА НАЛИЧНОСТ В ЛОГИСТИКА','#dc2626','openStoreNoStockModal(this.dataset.lid)')+
        '</div>';
      if(l.store_response==='no_stock' && l.store_response_comment){
        hs += '<div style="margin-top:3px;font-size:11px;color:#1e293b;white-space:normal;">💬 '+esc(l.store_response_comment)+'</div>';
      }
      return hs;
    }
    var isMyWh = isLogisticsWarehouseUser() && rep.counterpart===currentUser.store_name;
    var lbl = sdStoreResponseLabel(l);
    return (isMyWh && l.store_response==='sap_done') ? lbl+mk('📬 Прието обратно','#7c3aed','warehouse') : lbl;
  }
  return '';
}
/* Push до отсрещната страна по междускладов ред. Fire-and-forget: вика се
   след успешен запис и след toast-а на действието, не се чака, грешка в него
   не стига до записа. push.js се зарежда СЛЕД този файл - затова typeof. */
function sdNotifyInterstore(target, title, msg){
  if(typeof pushInterstoreDiff!=='function') return;
  try{ pushInterstoreDiff(target, title, msg).catch(function(){}); }catch(e){}
}
/* "Магазинът" по междускладов ред - същата проверка, която стоеше само при
   "Получено". Счетоводителят по обекти има store_name "Централен офис", а
   обектите му са в assigned_stores - затова двете проверки, не само store_name. */
function sdIsInterstoreStoreSide(l, rep){
  var mine = assignedStores() || [];
  return canEditSD(l) && !isLogisticsWarehouseUser() &&
    (currentUser.store_name===rep.store_name || mine.indexOf(rep.store_name)>=0);
}
/* Отговорът на магазина като текст - за склада и за всички, които не са
   магазинът (Цвети/admin). Без бутони. */
function sdStoreResponseLabel(l){
  if(l.store_response==='no_stock'){
    return '<div style="margin-top:3px;font-size:10.5px;color:#dc2626;font-weight:700;">⛔ Няма наличност в логистика</div>'+
      (l.store_response_comment?'<div style="margin-top:2px;font-size:11px;color:#1e293b;white-space:normal;">💬 '+esc(l.store_response_comment)+'</div>':'');
  }
  if(l.store_response==='sap_done' || l.store_response==='accepted'){
    return '<div style="margin-top:3px;font-size:10.5px;color:#7c3aed;font-weight:600;">'+
      (l.store_response==='sap_done'?'📄 Пуснато в SAP':'✅ Прието')+
      (l.store_response_by?' · '+esc(l.store_response_by):'')+
      (l.store_response_at?' · '+sdFmtDateTime(l.store_response_at):'')+'</div>';
  }
  return '<div style="margin-top:3px;font-size:10.5px;color:#94a3b8;">чака магазина</div>';
}
function openStoreNoStockModal(lineId){
  var l = sdData.find(function(x){return String(x.id)===String(lineId);});
  if(!l)return;
  var existing = document.getElementById('sdnostock-ov'); if(existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = '<div class="bov open" id="sdnostock-ov"><div class="bmod" style="width:380px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">⛔ Няма наличност в логистика</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">'+esc(l.material_name||'')+'</div>'+
    '<label class="fl">Коментар към склада (по избор)</label>'+
    '<input class="fi" id="sdnostock-comment" value="'+escVal(l.store_response_comment)+'" placeholder="напр. SAP отказва движението - наличност 0">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="document.getElementById(\'sdnostock-ov\').remove()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-lid="'+lineId+'" onclick="sdSetStoreResponse(this.dataset.lid,\'no_stock\',document.getElementById(\'sdnostock-comment\').value)" style="border:none;background:#dc2626;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>'+
    '</div></div></div>';
  document.body.appendChild(div.firstChild);
}
/* Записва отговора на магазина. status НЕ се пипа - редът остава 'new', докато
   складът не приеме стоката обратно. Коментарът е на "няма наличност": при
   "пуснато в SAP" не се трие (остава за история), просто не се показва. */
function sdSetStoreResponse(lineId,val,comment){
  var line = sdData.find(function(x){return String(x.id)===String(lineId);});
  if(!line) return;
  sdKeepScroll(line.report_id);
  var at = new Date().toISOString(), by = sdActor();
  var data = {store_response:val,store_response_by:by,store_response_at:at};
  if(val==='no_stock') data.store_response_comment = String(comment||'').trim() || null;
  sbPatch('stock_differences','id=eq.'+lineId,data).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    line.store_response=val; line.store_response_by=by; line.store_response_at=at;
    if(val==='no_stock') line.store_response_comment=data.store_response_comment;
    var ov=document.getElementById('sdnostock-ov'); if(ov) ov.remove();
    toast('✅ Записано');
    var rep = diffReports.find(function(x){return x.id===line.report_id;}) || {};
    var art = line.material_name||'';
    if(val==='sap_done') sdNotifyInterstore(rep.counterpart, '📄 Разлика: пуснато в SAP', (rep.store_name||'')+': '+art+' — приемете обратно');
    else if(val==='no_stock') sdNotifyInterstore(rep.counterpart, '⛔ Разлика: няма наличност в логистика', (rep.store_name||'')+': '+art);
    loadStockDiff();
  });
}
function openWarehouseResponseModal(lineId,val){
  var l = sdData.find(function(x){return String(x.id)===String(lineId);});
  if(!l)return;
  var existing = document.getElementById('whr-ov'); if(existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = '<div class="bov open" id="whr-ov"><div class="bmod" style="width:380px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">'+(WH_RESPONSE_LABELS[val]||val)+'</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">'+esc(l.material_name||'')+'</div>'+
    '<label class="fl">Коментар към магазина (по избор)</label>'+
    '<input class="fi" id="whr-comment" value="'+escVal(l.warehouse_comment)+'" placeholder="напр. Ще стигне до вторник с редовния курс">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="document.getElementById(\'whr-ov\').remove()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-lid="'+lineId+'" data-val="'+val+'" onclick="submitWarehouseResponse(this.dataset.lid,this.dataset.val)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>'+
    '</div></div></div>';
  document.body.appendChild(div.firstChild);
}
function submitWarehouseResponse(lineId,val){
  var commentEl = document.getElementById('whr-comment');
  var whLine = sdData.find(function(x){return String(x.id)===String(lineId);});
  sdKeepScroll(whLine?whLine.report_id:null);
  sbPatch('stock_differences','id=eq.'+lineId,{warehouse_response:val,warehouse_comment:commentEl?commentEl.value:''}).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    var el=document.getElementById('whr-ov'); if(el)el.remove();
    toast('✅ Отговорът е запазен!');
    /* И "Ще се изпрати" е отговор - магазинът научава и за него. */
    var whRep = (whLine && diffReports.find(function(x){return x.id===whLine.report_id;})) || {};
    sdNotifyInterstore(whRep.store_name, '📦 Разлика: отговор от склада',
      (whRep.counterpart||'')+': '+(WH_RESPONSE_LABELS[val]||val)+' · '+((whLine&&whLine.material_name)||''));
    loadStockDiff();
  });
}
/* Автоматично създава запис в "За връщане" (source='diff'), когато разлика бъде
   решена като "Връщане" - проверява за вече съществуващ, за да не дублира
   при евентуална повторна корекция (напр. Връщане -> Липса -> пак Връщане). */
function autoCreateReturnFromDiff(line,cb){
  sbGet('stock_returns','diff_line_id=eq.'+line.id+'&limit=1').then(function(existing){
    if(Array.isArray(existing)&&existing.length){ cb(); return; }
    var data={
      store_name:line.store_name,
      supplier:line.supplier,
      product_name:line.material_name,
      sap_code:line.material_code,
      quantity:line.quantity,
      /* Номерът на поръчката пътува заедно с реда - без него в "За връщане"
         не се вижда по коя поръчка е дошъл излишъкът и връзката се търси на
         ръка обратно в "Разлики". '' от празно поле става null. */
      order_number:line.order_number||null,
      reason:'Излишък от разлика'+(line.supplier?' — '+line.supplier:''),
      status:'pending',
      source:'diff',
      diff_line_id:line.id,
      created_by:currentUser.display_name||currentUser.email
    };
    sbPost('stock_returns',data).then(function(){ cb(); }).catch(function(){ cb(); });
  }).catch(function(){ cb(); });
}
/* Празно ли е количествено поле - null, undefined или само интервали.
   PostgREST връща числата като низове, а модалът пише '' за изчистено поле. */
function sdBlankQty(v){ return v===null||v===undefined||String(v).trim()===''; }
/* Реалното количество при решение "Липса"/"Връщане".
   База е quantity_supplier_doc (количеството по документа на доставчика), а при
   празна база се пада на quantity - при част от старите редове доставчиковото
   количество изобщо не е попълвано, а само общото. Липса = документ - получено;
   Връщане = получено - документ. PostgREST връща числата като низове, затова
   parseFloat. Резултат 0 или отрицателен значи, че редът не е това, за което е
   решен (или е грешно попълнен) - тогава връщаме null и количеството не се пипа.
   Закръгляме до 3 знака, колкото е step-ът на полетата: 0.3-0.1 в двоична
   плаваща запетая дава 0.19999999999999998 и точно това би отишло в базата. */
function diffResolvedQty(line,type){
  if(!line) return null;
  if(type!=='missing'&&type!=='return') return null;
  var baseRaw = sdBlankQty(line.quantity_supplier_doc) ? line.quantity : line.quantity_supplier_doc;
  if(sdBlankQty(baseRaw)||sdBlankQty(line.quantity_received)) return null;
  var base=parseFloat(baseRaw), rec=parseFloat(line.quantity_received);
  if(isNaN(base)||isNaN(rec)) return null;
  var q = (type==='missing') ? (base-rec) : (rec-base);
  q = Math.round(q*1000)/1000;
  return q>0 ? q : null;
}
function resolveDiffLine(id,type){
  if(!canReviewDiff()){toast('Нямаш права за това действие','#dc2626');return;}
  var line=sdData.find(function(x){return String(x.id)===String(id);});
  if(!line)return;
  /* Номер на документ в количеството: решение върху такъв ред пише глупост -
     Липса = 180486328 - получено отива в stock_differences, а при Връщане и в
     „За връщане". Нищо не се записва, докато количеството не се поправи. */
  if(diffQtyLooksLikeDocNum(line.quantity)||diffQtyLooksLikeDocNum(line.quantity_received)){
    toast('Количеството прилича на номер на документ — коригирай го през ✏️ преди решение','#dc2626');
    return;
  }
  /* Котва към бланката, по която се работи - след пре-рендирането оставаме на
     нея, вместо да ни връща най-отгоре на списъка. */
  sdKeepScroll(line.report_id);
  var resolvedAt=new Date().toISOString();
  /* "Не са фактурирани" НЕ приключва реда - то е междинно състояние, което чака
     крайно решение (заприхождаване или връщане). Затова статусът е 'pending'
     както при другите типове и completed_* не се пишат. */
  var payload={type:type,status:'pending',resolved_by:sdActor(),resolved_at:resolvedAt};
  /* Липса/Връщане: количеството е РЕАЛНАТА разлика, не това по документ.
     Досега Цветелина го пренаписваше на ръка след всяко решение. Останалите
     типове (Заприхождаване и т.н.) не се пипат - там количеството по документ
     си е количеството. Няма ли попълнено "Реално получено", формулата няма от
     какво да смята: записът минава без quantity и човекът се предупреждава. */
  var autoQty=null, qtyWarn='';
  if(type==='missing'||type==='return'){
    autoQty=diffResolvedQty(line,type);
    if(autoQty!==null) payload.quantity=autoQty;
    /* Двата случая без автоматично количество изглеждат еднакво в кода, но за
       човека са различни: единият е непопълнена бланка (има какво да се
       довърши), другият е бланка, по която просто няма разлика. */
    else qtyWarn = sdBlankQty(line.quantity_received)
      ? '⚠️ Реално получено не е попълнено — количеството остава по документ'
      : '⚠️ По данни няма разлика (получено = по документ) — количеството остава по документ';
  }
  sbPatch('stock_differences','id=eq.'+id,payload).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    line.type=type; line.status='pending'; line.resolved_by=sdActor(); line.resolved_at=resolvedAt; /* локално, за незабавна проверка по-долу без чакане на reload */
    /* ПРЕДИ autoCreateReturnFromDiff - тя чете line.quantity за stock_returns. */
    if(autoQty!==null) line.quantity=autoQty;
    /* Едно съобщение, не две: toast() презаписва един и същ елемент, затова
       отделен предупредителен toast би изял потвърждението за запис. */
    var say=function(msg){ toast(qtyWarn ? msg+' '+qtyWarn : msg, qtyWarn ? '#d97706' : null); };
    var finish=function(){
      var siblingLines=sdData.filter(function(x){return x.report_id===line.report_id;});
      var allResolved = siblingLines.length>0 && siblingLines.every(function(x){return !!x.type;});
      if(allResolved && line.report_id){
        sbPatch('differences_reports','id=eq.'+line.report_id,{reviewed:true}).then(function(){
          say('✅ Решено — бланката е напълно прегледана!');
          loadStockDiff();
        });
      } else {
        say('✅ Записано!');
        loadStockDiff();
      }
    };
    if(type==='return'){
      autoCreateReturnFromDiff(line,finish);
    } else {
      finish();
    }
  });
}

function setSDFilter(f) { sdFilter=f; renderStockDiff(); }
function setSDTypeFilter(f) { sdTypeFilter=f; renderStockDiff(); }
/* Смяната на посока нулира филтъра по магазин - магазините в двата таба са
   различни набори и запазен чип от другия таб би дал празен екран. */
function setSDDirTab(t) { sdDirTab=t; sdStoreFilter=''; renderStockDiff(); }
function setSDStoreFilter(s) { sdStoreFilter=s||''; renderStockDiff(); }
function sdClearFilters(){ sdStoreFilter=''; sdSearch=''; renderStockDiff(); }
/* Пре-рендира при търсене, но запазва фокуса/позицията на курсора в полето -
   иначе всяко натискане на клавиш би "изритвало" потребителя от полето. */
function setSDSearch(val){
  sdSearch=val;
  var hadFocus = document.activeElement && document.activeElement.id==='sd-search-input';
  var cursorPos = hadFocus ? document.activeElement.selectionStart : null;
  renderStockDiff();
  if(hadFocus){
    var el=document.getElementById('sd-search-input');
    if(el){ el.focus(); if(cursorPos!=null) el.setSelectionRange(cursorPos,cursorPos); }
  }
}

/* Превключва статус "Издадено кредитно известие" - релевантно само за тип "Липса" */
function sdToggleCreditNote(id){
  var line=sdData.find(function(x){return String(x.id)===String(id);});
  if(!line)return;
  var newVal=!line.credit_note_issued;
  sbPatch('stock_differences','id=eq.'+id,{credit_note_issued:newVal}).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    line.credit_note_issued=newVal;
    toast(newVal?'✅ Маркирано като издадено':'Маркирано като неиздадено');
    renderStockDiff();
  });
}
function sdMarkTaken(id) {
  if (!confirm('Маркирай стоката като ВЗЕТА?')) return;
  sbPatch('stock_differences','id=eq.'+id,{status:'taken',completed_by:sdActor(),completed_at:new Date().toISOString()}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Маркирана като взета!'); loadStockDiff();
  });
}

/* ── Край на междускладовия поток: потвърждение от отсрещната страна ──
   Доставковата разлика свършва с решение на Цвети (resolveDiffLine), която
   пише reviewed=true на бланката. За междускладов трансфер такова решение
   няма - затова досега всичките 24 бланки стояха reviewed=false завинаги,
   макар складът да беше отговорил по 16 от тях. Тук потвърждава страната,
   която РЕАЛНО е получила стоката: магазинът при "Изпратено", складът при
   "Обратно движение". Схемата не се пипа - ползват се status='received',
   completed_by и completed_at, същите колони като при sdMarkTaken. */
function sdConfirmInterstore(lineId, as){
  var line = sdData.find(function(x){return String(x.id)===String(lineId);});
  if(!line) return;
  if(!confirm('Потвърди, че стоката е получена и заприходена?')) return;
  /* Котва към бланката - иначе пре-рендирането връща потребителя най-отгоре. */
  sdKeepScroll(line.report_id);
  var at = new Date().toISOString(), by = sdActor();
  var data = {status:'received',completed_by:by,completed_at:at};
  /* ✅ ПРИЕТО на магазина е и неговият отговор по реда. "Прието обратно" на
     склада НЕ пише store_response - там отговорът вече е sap_done. */
  if(as==='store'){ data.store_response='accepted'; data.store_response_by=by; data.store_response_at=at; }
  sbPatch('stock_differences','id=eq.'+lineId,data).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    /* Локално ПРЕДИ проверката за останалите редове - точно както прави
       resolveDiffLine(). Иначе последният ред се брои по стария си статус и
       бланката никога не се затваря от самата себе си. */
    line.status='received'; line.completed_by=by; line.completed_at=at;
    if(as==='store'){ line.store_response='accepted'; line.store_response_by=by; line.store_response_at=at; }
    var cRep = diffReports.find(function(x){return x.id===line.report_id;}) || {};
    if(as==='store') sdNotifyInterstore(cRep.counterpart, '✅ Разлика: прието в '+(cRep.store_name||''), line.material_name||'');
    else if(as==='warehouse') sdNotifyInterstore(cRep.store_name, '📬 Разлика: прието обратно в '+(cRep.counterpart||''), line.material_name||'');
    var siblings = sdData.filter(function(x){return x.report_id===line.report_id;});
    var allReceived = siblings.length>0 && siblings.every(function(x){return x.status==='received';});
    if(allReceived && line.report_id){
      sbPatch('differences_reports','id=eq.'+line.report_id,{reviewed:true}).then(function(){
        toast('✅ Бланката е приключена');
        loadStockDiff();
      });
    } else {
      toast('✅ Записано');
      loadStockDiff();
    }
  });
}

function sdDelete(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('stock_differences','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('sdDelete: записът НЕ беше изтрит',id,res.error);
      toast('⚠️ Записът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadStockDiff(); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadStockDiff(); return; }
    toast('✓ Изтрит'); loadStockDiff();
  });
}

/* ── ТРИЕНЕ НА ЦЯЛА БЛАНКА ──
   Отделно право от sdDelete() на един ред: там isAdmin означава
   admin+accounting+logistics (те решават разлики), тук е САМО роля 'admin'.
   Бланката носи и файловете, и всичките си редове — това е необратимо. */
function sdCanDeleteReport(){ return !!currentUser && currentUser.role === 'admin'; }

/* Пътят вътре в bucket-а, извлечен от публичния URL. Връща '' при URL, който
   не сочи към нашия bucket — тогава файлът се брои за неизтрит, вместо да
   пратим DELETE към сглобен наслуки път. */
function sdStoragePathFromUrl(url){
  if(!url) return '';
  var marker = '/storage/v1/object/public/' + DIFF_BKT + '/';
  var s = String(url);
  var i = s.indexOf(marker);
  if(i < 0) return '';
  return s.slice(i + marker.length).split('?')[0];
}

/* Всички файлове на бланката: снимките, качени от магазина към САМАТА бланка
   (differences_reports.photos) + прикачените към отделните ѝ РЕДОВЕ
   (stock_differences.attachments). Един и същи URL може да стои и на двете
   места — затова се дедуплицира, иначе второто триене връща 404 и се брои
   като провал. */
function sdReportFileUrls(rep, lines){
  var urls = [], seen = {};
  function add(u){ if(u && !seen[u]){ seen[u] = true; urls.push(u); } }
  (Array.isArray(rep && rep.photos) ? rep.photos : []).forEach(function(p){ if(p) add(p.url); });
  (lines||[]).forEach(function(l){
    normSDAttachments(l.attachments).forEach(function(a){ if(a) add(a.url); });
  });
  return urls;
}

function sdDeleteReport(reportId){
  if(!sdCanDeleteReport()){ toast('⛔ Само администратор може да трие цяла бланка','#dc2626'); return; }
  var rep = diffReports.find(function(x){ return String(x.id)===String(reportId); });
  if(!rep){ toast('Бланката вече я няма — списъкът е опреснен','#64748b'); loadStockDiff(); return; }
  var lines = sdData.filter(function(x){ return String(x.report_id)===String(reportId); });
  var urls  = sdReportFileUrls(rep, lines);

  /* Първото потвърждение показва РЕАЛНИТЕ числа — иначе „изтрий бланката" е
     сляпо действие и никой не знае колко реда и файла отиват с нея. */
  if(!confirm('ИЗТРИВАНЕ НА ЦЯЛА БЛАНКА\n\n'+
    'Обект: '+(rep.store_name||'—')+'\n'+
    'Доставчик/насрещна страна: '+(rep.counterpart||'—')+'\n'+
    'Документ №: '+(rep.document_number||'—')+'\n'+
    'Дата: '+fmtDate(rep.doc_date)+'\n'+
    'Редове: '+lines.length+'\n'+
    'Файлове: '+urls.length)) return;
  if(!confirm('Действието е НЕОБРАТИМО. Файловете също се изтриват.')) return;

  /* (а) Файловете. Провал по един файл НЕ спира процеса — файл-сирак в
     Storage е безобиден, докато редове-сираци в базата не са. Броим ги и ги
     казваме накрая, вместо да мълчим. */
  var failedFiles = 0;
  var fileJobs = urls.map(function(u){
    var p = sdStoragePathFromUrl(u);
    if(!p){
      failedFiles++;
      try{ console.error('sdDeleteReport: непознат URL, файлът НЕ беше изтрит: '+u); }catch(e){}
      return Promise.resolve();
    }
    return fetch(DIFF_SB+'/storage/v1/object/'+DIFF_BKT+'/'+p, {
      method:'DELETE',
      headers:{'Authorization':'Bearer '+DIFF_KEY}
    }).then(function(r){
      if(!r.ok){
        failedFiles++;
        try{ console.error('sdDeleteReport: файлът НЕ беше изтрит: '+p+' → HTTP '+r.status); }catch(e){}
      }
    }).catch(function(e){
      failedFiles++;
      try{ console.error('sdDeleteReport: файлът НЕ беше изтрит: '+p+' → '+((e&&e.message)||e)); }catch(e2){}
    });
  });

  Promise.all(fileJobs).then(function(){
    /* (б) Редовете. count===0 е законен изход — бланка без редове. */
    return sbDelete('stock_differences','report_id=eq.'+reportId);
  }).then(function(res){
    if(!res.ok){
      try{ console.error('sdDeleteReport: редовете НЕ бяха изтрити',reportId,res.error); }catch(e){}
      toast('⚠️ Редовете НЕ бяха изтрити: '+sbErrMsg(res)+' — бланката остава','#dc2626');
      loadStockDiff();
      return null; /* СПИРАМЕ: бланка без редове е по-малкото зло от редове-сираци */
    }
    /* (в) Самата бланка — само след успешно (б). */
    return sbDelete('differences_reports','id=eq.'+reportId);
  }).then(function(res){
    if(res===null) return;
    if(!res.ok){
      try{ console.error('sdDeleteReport: бланката НЕ беше изтрита',reportId,res.error); }catch(e){}
      toast('⚠️ Редовете са изтрити, но бланката НЕ: '+sbErrMsg(res),'#dc2626');
      loadStockDiff();
      return;
    }
    var tail = failedFiles
      ? ' — '+(failedFiles===1 ? '1 файл не беше изтрит' : failedFiles+' файла не бяха изтрити')
      : '';
    toast('✓ Бланката е изтрита'+tail, failedFiles ? '#d97706' : '#16a34a');
    loadStockDiff();
  });
}

/* ── МОДАЛ ── */
function sdModalHtml() {
  var r = sdEditId ? (sdData.find(function(x){return x.id===sdEditId;})||{}) : {};
  var isEdit = !!sdEditId;
  var canReview = canReviewDiff();
  /* "Решено" = Цвети/admin/logistics вече е задала Тип на решение. От този
     момент нататък магазинът вече не може да пипа количество/тип - само
     статус (Невзета/Взета/Заприходена). */
  var isResolved = isEdit && !!r.type;
  /* Сторната по грешен прием е заключена за магазина ОТ САМОТО НАЧАЛО, не чак
     след решение - количествата по нея пораждат глоба и не се коригират от
     обекта, а само се проследяват. */
  var storeLocked = (isResolved || (isEdit && isWrongReceiptReadOnly(r))) && !canReview;
  var storeOpts = '<option value="">-- Избери магазин --</option>';
  var stores = assignedStores();
  if (stores) {
    stores.forEach(function(s){ storeOpts += '<option'+(r.store_name===s?' selected':'')+'>'+esc(s)+'</option>'; });
  }

  /* Помощна функция - поле, което става само за четене (не input), ако
     магазинът вече не може да го пипа. */
  function coreField(label, id, val, placeholder, type){
    /* 0 е валидна стойност за количество - val||'' (както и escVal(0)) би я
       превърнало в празно поле и после в null при запис. */
    var sv = (val===null||val===undefined)?'':String(val);
    if(storeLocked){
      return '<div><label class="fl">'+label+'</label><div class="fi" style="background:#f8fafc;color:#64748b;">'+esc(sv||'—')+'</div><input type="hidden" id="'+id+'" value="'+escVal(sv)+'"></div>';
    }
    return '<div><label class="fl">'+label+'</label><input'+(type?' type="'+type+'"':'')+(type==='number'?' step="0.01"':'')+' class="fi" id="'+id+'" value="'+escVal(sv)+'" placeholder="'+(placeholder||'')+'"></div>';
  }

  var h = '<div class="bov" id="sd-ov"><div class="bmod" style="width:540px;max-height:88vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави стока за изтегляне')+'</div>'+
    '<button onclick="closeSDModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>';

  if(storeLocked){
    h += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11.5px;color:#1e40af;">'+
      'ℹ️ Цветелина вече е взела решение по този запис — детайлите вече не могат да се променят. Можеш само да обновиш статуса по-долу.</div>';
  } else {
    h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:600;color:#856404;">'+
      '⚠️ ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС И Е В ДОБЪР ТЪРГОВСКИ ВИД!</div>';
  }

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Магазин *</label>'+(function(){
    var myS=assignedStores();
    if(myS&&myS.length===1)return '<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="sd-store" value="'+esc(myS[0])+'">';
    if(myS&&myS.length>1)return '<select class="fi" id="sd-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>';
    return '<select class="fi" id="sd-store"><option value="">-- Зарежда се... --</option></select>';
  })()+'</div>'+
    coreField('Доставчик','sd-supplier',r.supplier,'напр. ТАГЕМАЛ')+
    coreField('Код на материал (SAP)','sd-mat',r.material_code,'напр. 34989')+
    coreField('Количество','sd-qty',r.quantity,'',storeLocked?'':'number')+
    '</div>'+

    '<label class="fl">Наименование *</label>'+
    (storeLocked
      ? '<div class="fi" style="background:#f8fafc;color:#64748b;">'+esc(r.material_name||'—')+'</div><input type="hidden" id="sd-name" value="'+escVal(r.material_name)+'">'
      : '<input class="fi" id="sd-name" value="'+escVal(r.material_name)+'" placeholder="напр. ЩУЦЕР ЗА МАРКУЧ МЕТАЛЕН С РЕЗБА 1&quot; ПРАВ">')+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    coreField('Поръчка','sd-order',r.order_number,'напр. 4100135756')+
    coreField('Дата потвърдена актуализация','sd-cdate',r.confirmed_date,'','date')+
    '</div>';

  /* Тип на решение - само Цвети/admin/logistics могат да го задават/сменят;
     за магазина е само визуален показател. */
  if(canReview){
    h += '<label class="fl">Тип на решение</label>'+
      '<select class="fi" id="sd-type">'+
      '<option value=""'+(isEdit&&!r.type?' selected':'')+'>— Още не е решено —</option>'+
      '<option value="writein"'+((r.type==='writein'||!isEdit)?' selected':'')+'>📥 Заприхождаване</option>'+
      '<option value="return"'+(r.type==='return'?' selected':'')+'>↩️ Връщане</option>'+
      '<option value="missing"'+(r.type==='missing'?' selected':'')+'>❓ Липса</option>'+
      '<option value="not_invoiced"'+(r.type==='not_invoiced'?' selected':'')+'>🧾 Не са фактурирани</option>'+
      '</select>';
  } else {
    var typeLabels={writein:'📥 Заприхождаване',return:'↩️ Връщане',missing:'❓ Липса',not_invoiced:'🧾 Не са фактурирани'};
    h += '<label class="fl">Тип на решение</label>'+
      '<div class="fi" style="background:#f8fafc;color:#64748b;">'+(r.type?typeLabels[r.type]||r.type:'⏳ Още не е решено от Цветелина')+'</div>'+
      '<input type="hidden" id="sd-type" value="'+escVal(r.type)+'">';
  }

  /* Статус - думата зависи от типа на решението, за да не се бърка магазинът:
     при "Заприхождаване" завършващото състояние е "Заприходена", при "Връщане"
     е "Взета" (куриерът взима стоката). "Приета" е за отделния поток на
     междускладовите (логистичен склад), винаги достъпна.
     "ВЗЕТА" и "ЗАПРИХОДЕНА" са ЕДНО И СЪЩО състояние в схемата - status='taken';
     разликата е само в думата според типа. Преди тук се записваше отделна
     стойност 'capitalized', която броячите и чиповете не филтрират, така че
     редът изчезваше от всички изгледи. Стар ред с 'capitalized' се показва
     избран тук и се нормализира до 'taken' при първия запис. */
  /* 'new' е статусът, с който редът пристига от подадена бланка, но досега го
     нямаше сред опциите. Браузърът тогава избираше първата ('pending') и
     всяко отваряне на модала - включително само за да се добави коментар през
     бутона 💬 - тихо преобръщаше реда на "чакащ". Затова 'new' се показва като
     истинска опция, а докато няма тип на решение, селектът е заключен:
     статусът се движи чак след като Цвети реши какво става с реда. */
  var sw = sdStatusWords(r.type);
  var sdStatusIsNew = r.status === 'new';
  var sdNoTypeYet = isEdit && !r.type;
  h += '<label class="fl">Статус</label>'+
    '<select class="fi" id="sd-status"'+(sdNoTypeYet?' disabled':'')+'>'+
    (sdNoTypeYet||sdStatusIsNew
      ? '<option value="new"'+(sdStatusIsNew?' selected':'')+'>🆕 ПОДАДЕНА, НЕПРЕГЛЕДАНА</option>'
      : '')+
    '<option value="pending"'+(r.status==='pending'||!r.status?' selected':'')+'>'+sw.pIcon+' '+sw.pending.toUpperCase()+'</option>'+
    '<option value="taken"'+(r.status==='taken'||r.status==='capitalized'?' selected':'')+'>'+sw.tIcon+' '+sw.taken.toUpperCase()+'</option>'+
    '<option value="received"'+(r.status==='received'?' selected':'')+'>📬 ПРИЕТА</option>'+
    '</select>'+
    (sdNoTypeYet
      ? '<div style="font-size:11px;color:#94a3b8;margin-top:-6px;margin-bottom:8px;">Статусът се отключва, след като бъде зададен тип на решение.</div>'
      : '')+

    '<label class="fl">Коментар</label>'+
    '<input class="fi" id="sd-comment" value="'+escVal(r.comment)+'" placeholder="напр. ЗАПРИХОДЕТЕ С РЕВИЗИЯ / ЧАКАМЕ">';

  /* Снимките, качени от магазина към бланката - само за преглед. Показваме ги
     и тук, за да не се налага Цвети да търси бланката отделно, докато пише
     решението/коментара си. */
  if(isEdit && r.report_id){
    var repPhotos = (function(){
      var rep = diffReports.find(function(x){return x.id===r.report_id;});
      return (rep && Array.isArray(rep.photos)) ? rep.photos : [];
    })();
    if(repPhotos.length){
      h += '<label class="fl">Снимки от магазина ('+repPhotos.length+')</label>'+
        '<div style="margin-bottom:8px;">'+diffReportPhotoThumbs(r.report_id,56)+'</div>';
    }
  }

  /* Коментар Контролер + прикачване на документ - само за Цвети/admin/logistics */
  if(canReview){
    h += '<label class="fl">Коментар Контролер (Цветелина)</label>'+
      '<input class="fi" id="sd-ctrl-comment" value="'+escVal(r.resolution_comment)+'" placeholder="напр. Изчаква се кредитно от доставчика">';
    h += '<label class="fl">Прикачени документи</label>';
    var atts = normSDAttachments(r.attachments);
    if(atts.length){
      h += '<div id="sd-att-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">';
      atts.forEach(function(a,i){
        h += '<div style="position:relative;">';
        if(a.type==='image'){
          h += '<a href="'+a.url+'" target="_blank" style="display:block;"><img src="'+a.url+'" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
        } else {
          h += '<a href="'+a.url+'" target="_blank" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none;max-width:110px;">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(a.filename||'Файл')+'</span></a>';
        }
        h += '<button type="button" data-idx="'+i+'" onclick="sdRemoveAttachment(this.dataset.idx)" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:9px;cursor:pointer;">✕</button></div>';
      });
      h += '</div>';
    } else {
      h += '<div id="sd-att-list"></div>';
    }
    h += '<label style="display:inline-flex;align-items:center;gap:4px;border:1px dashed #cbd5e1;border-radius:5px;padding:3px 10px;font-size:11px;color:#94a3b8;cursor:pointer;">'+
      '📎 + Прикачи документ<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx" style="display:none;" onchange="sdUploadAttachment(this)"></label>';
  } else {
    h += '<input type="hidden" id="sd-ctrl-comment" value="'+escVal(r.resolution_comment)+'">';
  }

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeSDModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSD()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
  return h;
}
function normSDAttachments(atts){
  if(typeof atts==='string'){try{atts=JSON.parse(atts);}catch(e){atts=[];}}
  return Array.isArray(atts)?atts:[];
}
/* Компактни миниатюри/линкове за прикачените от Цвети документи, показвани
   директно в реда на таблицата (не само вътре в модала). */
function diffAttachmentThumbs(l){
  var atts = normSDAttachments(l.attachments);
  if(!atts.length) return '';
  var h='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;">';
  atts.forEach(function(a){
    if(a.type==='image'){
      h+='<a href="'+esc(a.url)+'" target="_blank"><img src="'+esc(a.url)+'" style="width:28px;height:28px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;"></a>';
    } else {
      h+='<a href="'+esc(a.url)+'" target="_blank" title="'+esc(a.filename||'Файл')+'" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;text-decoration:none;">📎</a>';
    }
  });
  h+='</div>';
  return h;
}
/* Прикачените към САМИЯ РЕД файлове + бутон за качване, ако този потребител
   има право. Ползва се и в главната таблица (колона "Снимки"), и в списъка с
   непрегледани бланки - за да няма две различни места за едно и също нещо. */
function sdLineAttachCell(l){
  var thumbs = diffAttachmentThumbs(l);
  if(!canAttachSDLine(l)) return thumbs;
  return thumbs +
    '<label title="Прикачи снимка или документ към този ред" style="display:inline-flex;align-items:center;gap:3px;margin-top:3px;border:1px dashed #cbd5e1;border-radius:5px;padding:1px 7px;font-size:10.5px;color:#94a3b8;cursor:pointer;">'+
      '📎 +<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx" style="display:none;" data-lid="'+l.id+'" onchange="sdUploadLineAttachment(this,this.dataset.lid)">'+
    '</label>';
}
/* Прикачване към конкретен ред, независимо от отворен модал. Пътят следва
   sdUploadAttachment (същият bucket, същият шаблон на името), но с префикс по
   посока и с компресия на изображенията - тези снимки идват от телефон в
   магазина, не от сканер в офиса. Не-изображенията (сканирани PDF-и) минават
   непроменени и се разпознават от DIFF_IMG_RE при показване, както досега. */
function sdUploadLineAttachment(input,lineId){
  var file=input.files[0]; if(!file)return;
  input.value='';
  var record=sdData.find(function(x){return String(x.id)===String(lineId);});
  if(!record){toast('Редът не е намерен','#dc2626');return;}
  if(!canAttachSDLine(record)){toast('Нямаш права да прикачваш към този ред','#dc2626');return;}
  var isImg=!!file.type && file.type.indexOf('image/')===0;
  var prefix=sdLineDirection(record)==='wrong_receipt' ? 'wrong-receipt/' : 'stock-differences/';
  toast('⏳ Качване...','#2563eb');
  diffCompressImage(file,1600,0.75).then(function(blob){
    var ext=isImg?'jpg':((file.name.split('.').pop()||'bin').toLowerCase());
    var ctype=isImg?'image/jpeg':(file.type||'application/octet-stream');
    var path=prefix+'sd_'+record.id+'_'+Date.now()+'.'+ext;
    var reader=new FileReader();
    reader.onload=function(e){
      fetch(DIFF_SB+'/storage/v1/object/'+DIFF_BKT+'/'+path,{
        method:'POST',
        headers:{'Authorization':'Bearer '+DIFF_KEY,'Content-Type':ctype,'x-upsert':'true'},
        body:e.target.result
      }).then(function(r){return r.ok;}).then(function(ok){
        if(!ok){toast('Грешка при качване','#dc2626');return;}
        var pub=DIFF_SB+'/storage/v1/object/public/'+DIFF_BKT+'/'+path;
        var atts=normSDAttachments(record.attachments).slice();
        atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
        sbPatch('stock_differences','id=eq.'+record.id,{attachments:atts}).then(function(res){
          if(!res.ok){toast('Грешка при запис','#dc2626');return;}
          record.attachments=atts;
          toast('✅ Прикачено!');
          sdKeepScroll(record.report_id);
          renderStockDiff();
        });
      }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
    };
    reader.readAsArrayBuffer(blob);
  });
}
/* Добавяне на пропусната снимка към ВЕЧЕ подадена бланка. Пътят е същият като
   при diffUploadPhoto ('differences/' + време + случаен суфикс), за да стоят
   всички снимки на бланки на едно място в bucket-а, а форматът на записа е
   {url,name} - точно както submitDiffReport записва photos. НЕ е форматът
   {type,url,filename} на attachments по ред: двете колони са различни. */
function sdUploadReportPhoto(input,reportId){
  var file=input.files[0]; if(!file)return;
  input.value='';
  var rep=diffReports.find(function(x){return String(x.id)===String(reportId);});
  if(!rep){toast('Бланката не е намерена','#dc2626');return;}
  if(!canAttachDiffReport(rep)){toast('Нямаш права да прикачваш към тази бланка','#dc2626');return;}
  var isImg=!!file.type && file.type.indexOf('image/')===0;
  toast('⏳ Качване...','#2563eb');
  diffCompressImage(file,1600,0.75).then(function(blob){
    var ext=isImg?'jpg':((file.name.split('.').pop()||'bin').toLowerCase());
    var ctype=isImg?'image/jpeg':(file.type||'application/octet-stream');
    var path='differences/'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.'+ext;
    var reader=new FileReader();
    reader.onload=function(e){
      fetch(DIFF_SB+'/storage/v1/object/'+DIFF_BKT+'/'+path,{
        method:'POST',
        headers:{'Authorization':'Bearer '+DIFF_KEY,'Content-Type':ctype,'x-upsert':'true'},
        body:e.target.result
      }).then(function(r){return r.ok;}).then(function(ok){
        if(!ok){toast('Грешка при качване','#dc2626');return;}
        var pub=DIFF_SB+'/storage/v1/object/public/'+DIFF_BKT+'/'+path;
        /* Копие на съществуващия масив + новият елемент. Записване на масив с
           един елемент би изтрило снимките от подаването. */
        var arr=(Array.isArray(rep.photos)?rep.photos:[]).slice();
        arr.push({url:pub,name:file.name});
        sbPatch('differences_reports','id=eq.'+reportId,{photos:arr}).then(function(res){
          if(!res.ok){toast('Грешка при запис','#dc2626');return;}
          rep.photos=arr;
          toast('✅ Прикачено!');
          sdKeepScroll(rep.id);
          renderStockDiff();
        });
      }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
    };
    reader.readAsArrayBuffer(blob);
  });
}
function sdUploadAttachment(input){
  var file=input.files[0]; if(!file)return;
  if(!sdEditId){toast('Запази записа първо, после прикачи документ','#dc2626');return;}
  var record = sdData.find(function(x){return x.id===sdEditId;});
  if(!record)return;
  var isImg=/\.(jpe?g|png|gif|webp)$/i.test(file.name);
  var ext=(file.name.split('.').pop()||'bin').toLowerCase();
  var fname='sd_'+sdEditId+'_'+Date.now()+'.'+ext;
  var path='stock-differences/'+fname;
  toast('⏳ Качване...','#2563eb');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(DIFF_SB+'/storage/v1/object/'+DIFF_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+DIFF_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){return r.ok;}).then(function(ok){
      if(!ok){toast('Грешка при качване','#dc2626');return;}
      var pub=DIFF_SB+'/storage/v1/object/public/'+DIFF_BKT+'/'+path;
      var atts=normSDAttachments(record.attachments).slice();
      atts.push({type:isImg?'image':'file',url:pub,filename:file.name});
      sbPatch('stock_differences','id=eq.'+sdEditId,{attachments:atts}).then(function(res){
        if(!res.ok){toast('Грешка при запис','#dc2626');return;}
        record.attachments=atts;
        openSDModal(sdEditId);
        toast('✅ Прикачено!');
      });
    }).catch(function(err){toast('Грешка: '+(err.message||err),'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}
function sdRemoveAttachment(idx){
  if(!sdEditId)return;
  var record = sdData.find(function(x){return x.id===sdEditId;});
  if(!record)return;
  var atts=normSDAttachments(record.attachments).slice();
  atts.splice(parseInt(idx),1);
  sbPatch('stock_differences','id=eq.'+sdEditId,{attachments:atts}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    record.attachments=atts;
    openSDModal(sdEditId);
  });
}

function openSDModal(id) {
  sdEditId = id;
  renderStockDiff();
  var ov = document.getElementById('sd-ov');
  if (!ov) return;
  /* Магазин: автоматично или dropdown */
  var myStores = assignedStores();
  var storeEl = document.getElementById('sd-store');
  if (storeEl) {
    if (myStores && myStores.length === 1) {
      storeEl.outerHTML = '<div class="fi" style="background:#f8fafc;font-weight:500;">🏪 '+esc(myStores[0])+'</div><input type="hidden" id="sd-store" value="'+esc(myStores[0])+'">';
    } else if (myStores && myStores.length > 1) {
      storeEl.innerHTML = '<option value="">-- Избери --</option>'+myStores.map(function(s){return '<option>'+esc(s)+'</option>';}).join('');
    } else {
      sbGet('users','select=store_name&order=store_name').then(function(data){
        var el = document.getElementById('sd-store');
        if(Array.isArray(data)&&el){
          var seen={};
          el.innerHTML='<option value="">-- Избери --</option>'+data.filter(function(u){
            if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
            seen[u.store_name]=1;return true;
          }).map(function(u){return '<option>'+esc(u.store_name)+'</option>';}).join('');
          /* Избери текущия магазин при редактиране */
          var cur = sdEditId ? (sdData.find(function(x){return x.id===sdEditId;}))||{} : {};
          if(cur.store_name) el.value = cur.store_name;
        }
      });
    }
  }
    ov.classList.add('open');
}
function closeSDModal() {
  var ov=document.getElementById('sd-ov'); if(ov)ov.classList.remove('open');
  sdEditId=null;
}

/* esc() връща '—' за празна стойност (shared.js) - тирето е САМО за показване.
   Ако попадне в payload-а, PostgREST връща 400:
   invalid input syntax for type date: "—". Затова непосредствено преди
   изпращане датите и количествата се нормализират: празно или '—' -> null. */
var SD_NULLABLE = ['confirmed_date','withdrawal_date','quantity','quantity_received','quantity_supplier_doc'];
function sdIsBlank(val){
  return val===null||val===undefined||String(val).trim()===''||String(val).trim()==='—';
}
function sdCleanPayload(data){
  SD_NULLABLE.forEach(function(k){
    if(!data.hasOwnProperty(k))return;
    if(sdIsBlank(data[k])){data[k]=null;return;}
    if(k.indexOf('quantity')===0){
      var n=parseFloat(data[k]);
      data[k]=isNaN(n)?null:n;
    }
  });
  return data;
}

function submitSD() {
  var store=(document.getElementById('sd-store').value||'').trim();
  var name=(document.getElementById('sd-name').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!name){toast('Въведи наименование','#dc2626');return;}
  var origRecord = sdEditId ? sdData.find(function(x){return x.id===sdEditId;}) : null;
  /* Втора ключалка след скритите бутони: дори модалът да бъде отворен по друг
     път, магазинът не може да запише промяна по ред от "Сторна по грешен прием". */
  if(isWrongReceiptReadOnly(origRecord)){
    toast('Редовете от „Сторна по грешен прием" се променят само от централния офис','#dc2626');
    return;
  }
  /* Модалът на Цвети е пътят, по който се поправят старите редове с номер на
     документ в количеството - затова съобщението казва какво да се напише.
     Проверява се само РЕДАКТИРУЕМО поле: на заключен ред магазинът вижда
     количеството като текст (hidden input), няма как да го поправи, а
     записът му пази стойността непроменена. */
  var sdQtyEl=document.getElementById('sd-qty');
  if(sdQtyEl && sdQtyEl.type!=='hidden' && diffQtyLooksLikeDocNum(sdQtyEl.value)){
    var qtyMsg=diffQtyDocNumMsg(sdQtyEl.value);
    toast(qtyMsg.charAt(0).toUpperCase()+qtyMsg.slice(1)+' в „Количество"','#dc2626');
    sdQtyEl.focus();
    return;
  }
  var data={
    store_name:     store,
    supplier:       document.getElementById('sd-supplier').value,
    material_code:  document.getElementById('sd-mat').value,
    material_name:  name,
    quantity:       document.getElementById('sd-qty').value,
    order_number:   document.getElementById('sd-order').value,
    confirmed_date: document.getElementById('sd-cdate').value,
    type:           document.getElementById('sd-type').value||null,
    status:         document.getElementById('sd-status').value,
    comment:        document.getElementById('sd-comment').value,
    resolution_comment: document.getElementById('sd-ctrl-comment').value,
    created_by:     currentUser.display_name||currentUser.email
  };
  /* Ако МАГАЗИНЪТ (не Цвети/admin/logistics) коригира запис, който Цвети
     ОЩЕ НЕ Е решила (type беше празно преди тази редакция) - маркираме
     момента на корекция, за да изскочи най-отгоре в списъка. */
  if(sdEditId && !canReviewDiff() && origRecord && !origRecord.type){
    data.store_corrected_at = new Date().toISOString();
  }
  /* Кой определи типа на решението. Записва се при нов запис с непразен тип и
     при РЕАЛНА смяна на типа - редакция, която не пипа типа (напр. само
     коментар), запазва първоначалния автор и час. */
  if(data.type && (!origRecord || data.type !== origRecord.type)){
    data.resolved_by = sdActor();
    data.resolved_at = new Date().toISOString();
  }
  /* Кой изпълни - пише се само при пресичане на границата приключен/неприключен,
     в двете посоки. Вътре в едно и също състояние не се пипа, за да не се
     презаписва изпълнителят при редакция на коментар.
     'capitalized' е заварена стойност за СЪЩОТО състояние като 'taken', затова
     старото състояние минава през sdIsTaken, не през сравнение на низа. */
  var isNowCompleted = data.status==='taken' || data.status==='capitalized';
  var wasCompleted = !!origRecord && sdIsTaken(origRecord);
  if(isNowCompleted && !wasCompleted){
    data.completed_by = sdActor();
    data.completed_at = new Date().toISOString();
  } else if(!isNowCompleted && wasCompleted){
    data.completed_by = null;
    data.completed_at = null;
  }
  sdCleanPayload(data);
  /* Тип "Връщане" трябва да породи запис в "За връщане" и когато решението е
     взето през модала, а не само през бутоните на реда (resolveDiffLine).
     Условието е САМО за крайния тип, БЕЗ сравнение с предишния: така всяка
     редакция на осиротял ред (маркиран за връщане, но без създадено връщане)
     го самолекува. Дублиране няма - autoCreateReturnFromDiff проверява по
     diff_line_id преди да пише. Нов ред минава през sbPostReturn, защото
     sbPost не връща id, а то е нужно за връзката. */
  var needsReturn = data.type==='return';
  var p = sdEditId
    ? sbPatch('stock_differences','id=eq.'+sdEditId,data)
    : (needsReturn ? sbPostReturn('stock_differences',data) : sbPost('stock_differences',data));
  p.then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    var returnSyncFailed = false;
    var finish=function(){
      /* Потвърждението се чете ПРЕДИ затварянето: closeSDModal() нулира
         sdEditId, тоест на реда след него тернарният оператор винаги хващаше
         "Добавено!" - и редакцията се потвърждаваше с думата за нов запис. */
      toast('✅ '+(sdEditId?'Записано!':'Добавено!'));
      closeSDModal();
      /* Червеното е ПОСЛЕДНО нарочно: toast() пише в един и същ елемент, значи
         по-ранно предупреждение би било изядено от потвърждението за запис. */
      if(returnSyncFailed) toast('Връщането не е обновено с номера на поръчката','#dc2626');
      loadStockDiff();
    };
    /* Номерът на поръчката се въвежда в модала СЛЕД като връщането вече е
       създадено: магазинската бланка (submitDiffReport) не пише order_number,
       а autoCreateReturnFromDiff излиза веднага при вече съществуващ ред по
       същия diff_line_id. Без този PATCH номерът никога не стига до "За
       връщане" при обичайния ред на работа (първо "↩️ Връщане" с бутона,
       после номерът в модала). Винаги презаписва - за редовете ОТ разлика
       колоната се пълни само оттук: модалът в „За връщане" държи полето
       readonly и не праща order_number, когато редът има diff_line_id. Ръчен
       номер има само на редове БЕЗ diff_line_id, а филтърът по-долу не ги стига.
       Няма ли още връщане, заявката засяга 0 реда и
       autoCreateReturnFromDiff по-долу го създава направо с номера. */
    var syncReturnOrder=function(next){
      if(!(sdEditId && data.type==='return')){ next(); return; }
      sbPatch('stock_returns','diff_line_id=eq.'+sdEditId+'&source=eq.diff',
              {order_number:data.order_number||null}).then(function(r){
        /* Провалът не отменя записа на самата разлика, но и не се поглъща
           тихо - иначе номерът просто липсва в другия модул без обяснение. */
        if(!r.ok) returnSyncFailed = true;
        next();
      });
    };
    var lineId = sdEditId || (res.row && res.row.id);
    if(needsReturn && lineId){
      /* Наследява поведението на autoCreateReturnFromDiff: тя поглъща
         собствените си грешки тихо и вика cb() при всякакъв изход. */
      syncReturnOrder(function(){
        autoCreateReturnFromDiff({
          id:            lineId,
          store_name:    data.store_name,
          supplier:      data.supplier,
          material_name: data.material_name,
          material_code: data.material_code,
          quantity:      data.quantity,
          order_number:  data.order_number
        },finish);
      });
      return;
    }
    finish();
  });
}

/* ══════════════════════════════════════════
   ПОДАВАНЕ НА БЛАНКА ЗА РАЗЛИКИ (магазинска страна)
══════════════════════════════════════════ */

var DIFF_CATEGORIES = [
  /* [key, label, посоки[], снимки задължителни?, подсказка за доп. имейл,
      кратко име за надписа под "Снимки"] */
  ['undelivered','📦 Недоставен артикул (липса)', ['supplier','interstore'], false, null, 'липса'],
  ['excess','📈 Излишък (получен в повече)', ['supplier','interstore'], false, null, 'излишък'],
  ['wrong_item','❌ Грешен артикул (не е поръчван)', ['supplier'], false, null, 'грешен артикул'],
  ['pack_mismatch','📦 Разлика от фабрична опаковка', ['interstore'], true, 'm.pavlova@temax.bg', 'разлика от опаковка'],
  ['damaged','💔 Увредена стока / липсват части', ['supplier','interstore'], true, null, 'увредена стока'],
  ['wrong_barcode','🏷️ Грешен баркод / етикет / описание', ['supplier','interstore'], true, 'j.jeliazkov@temax.bg, m.pavlova@temax.bg', 'грешен баркод'],
  ['similar_item','🎨 Сходен артикул (различен цвят/размер)', ['interstore'], false, 'm.pavlova@temax.bg (за ZPACK корекция)', 'сходен артикул'],
  /* Сторна по грешен прием - разликата е между ФАКТУРАТА и реално заприходеното
     по нея, не между поръчка и доставка. Затова двете стойности са отделни от
     undelivered/excess, макар да звучат близко: там мярката е входящата
     доставка. Съществуващите седем не се пипат - filter по посока ги пази. */
  ['unbilled_received','📥 Приета нефактурирана стока', ['wrong_receipt'], false, null, 'приета нефактурирана'],
  ['billed_not_received','🧾 Фактурирана неприета стока', ['wrong_receipt'], false, null, 'фактурирана неприета']
];
/* Надписът под "Снимки" във формата за подаване. Смята се ОТ САМИТЕ категории
   на текущата посока, а не се преписва на ръка - иначе обещава едно, а
   submitDiffReport() проверява друго. Заварената редакция изброяваше и
   "липса", която никога не е изисквала снимки (undelivered е с false).
   При посока без нито една задължителна категория надписът казва какво
   реално помага, вместо да изброява чужди случаи. */
function diffPhotoHintText(direction){
  var req = DIFF_CATEGORIES.filter(function(c){
    return c[2].indexOf(direction) >= 0 && c[3];
  }).map(function(c){ return c[5]; });
  if(!req.length) return '(по избор — прикачете фактурата или снимка на приетото)';
  return '(задължителни при: '+req.join(', ')+')';
}
function diffCatMeta(key){
  return DIFF_CATEGORIES.find(function(c){return c[0]===key;}) || null;
}
/* Опции за <select>, филтрирани по посока - доставчик и междускладов трансфер
   имат различни, невзаимозаменяеми списъци категории (по реалните бланки) */
function diffCategoryOptionsForDirection(direction,selected){
  var list=DIFF_CATEGORIES.filter(function(c){return c[2].indexOf(direction)>=0;});
  return '<option value="">-- категория --</option>'+list.map(function(c){
    return '<option value="'+c[0]+'"'+(selected===c[0]?' selected':'')+'>'+c[1]+'</option>';
  }).join('');
}
function diffCategoryLabel(v){
  var f=DIFF_CATEGORIES.find(function(c){return c[0]===v;});
  return f?f[1]:(v||'—');
}

/* ══ Сигнал за възможна размяна на артикул при експедиция ══
   Складът иска да види, когато ЕДИН И СЪЩ артикул е в междускладови бланки
   от ДВА РАЗНИ магазина към него: най-вероятно пратките са разменени и
   липсата на единия обект е излишъкът на другия. Смята се изцяло в браузъра
   от вече заредените sdData и diffReports - нова колона няма, заявка няма.

   Кодовете се сравняват НОРМАЛИЗИРАНО: в бланките един и същ SAP се пише и
   като "000123", и като "123" (Excel яде водещите нули при импорт, хората ги
   пишат както дойде). Сравнение "както е въведено" би пропуснало точно
   двойката, заради която целият сигнал съществува. */
/* Кандидатите за размяна на ЕДИН ред. Празен масив, ако редът няма код,
   не е междускладов или вече е потвърден - потвърденият ред е приключен и
   няма какво да се разменя по него. */
function sdSwapCandidates(line){
  /* Локална нарочно: и двете ѝ употреби са тук, а глобално име повече в
     ES5 global scope означава още един кандидат за тиха колизия. */
  var norm = function(code){
    return String(code==null?'':code).trim().replace(/^0+/,'');
  };
  if(!line || line.status==='received') return [];
  if(sdLineDirection(line)!=='interstore') return [];
  var code = norm(line.material_code);
  if(!code) return [];
  var myRep = diffReports.find(function(x){return x.id===line.report_id;});
  var myCp = myRep ? myRep.counterpart : null;
  if(!myCp) return [];
  var myTs = line.created_at ? Date.parse(line.created_at) : NaN;
  if(isNaN(myTs)) return []; /* без дата прозорецът е непроверим - не гадаем */
  var WINDOW = 14*24*60*60*1000;
  var out = [];
  sdData.forEach(function(other){
    if(String(other.id)===String(line.id)) return;
    if(other.store_name===line.store_name) return; /* същият обект - не е размяна */
    if(other.status==='received') return;
    if(norm(other.material_code)!==code) return;
    if(sdLineDirection(other)!=='interstore') return;
    var oRep = diffReports.find(function(x){return x.id===other.report_id;});
    if(!oRep || oRep.counterpart!==myCp) return;
    var oTs = other.created_at ? Date.parse(other.created_at) : NaN;
    if(isNaN(oTs) || Math.abs(oTs-myTs) > WINDOW) return;
    /* Плитко копие - флагът не бива да сяда върху самия ред в sdData. */
    var c = {};
    for(var k in other){ if(Object.prototype.hasOwnProperty.call(other,k)) c[k]=other[k]; }
    /* "Обратната" двойка е същинският сигнал: липса срещу излишък. Две липси
       по същия код са просто съвпадение и получават сивата бележка. */
    c.opposite = other.difference_category !== line.difference_category &&
      ['undelivered','excess'].indexOf(other.difference_category) >= 0 &&
      ['undelivered','excess'].indexOf(line.difference_category) >= 0;
    out.push(c);
  });
  return out;
}
/* Баджът под името на артикула. Вижда го САМО логистичният склад - това е
   негов инструмент при експедиция, а не поредното червено на екрана на
   магазина, който няма как да провери чуждата бланка. */
function sdSwapBadge(line){
  if(!isLogisticsWarehouseUser()) return '';
  var cands = sdSwapCandidates(line);
  if(!cands.length) return '';
  var opp = cands.filter(function(c){return c.opposite;});
  /* created_at е timestamptz - fmtDate() го реже наслуки и дава
     "01T09:00:00.000Z.09.2026". Затова минава през sdFmtDateTime(), който
     отрязва часа и чак тогава форматира (виж коментара при самата функция). */
  var box = function(kind,bg,bd,fg,txt){
    return '<div class="sd-swap" data-swap="'+kind+'" title="Същият артикул е и в бланка на друг обект към този склад. Проверете дали пратките не са разменени." '+
      'style="margin-top:3px;display:inline-block;background:'+bg+';border:1px solid '+bd+';color:'+fg+';border-radius:6px;padding:2px 6px;font-size:10px;font-weight:600;line-height:1.35;white-space:normal;">'+txt+'</div>';
  };
  if(opp.length){
    var parts = opp.map(function(c){
      var qty = (c.quantity!=null) ? c.quantity : (c.quantity_received!=null ? c.quantity_received : '—');
      return esc(c.store_name||'')+' ('+esc(diffCategoryLabel(c.difference_category))+', '+esc(String(qty))+' бр., '+esc(sdFmtDateTime(c.created_at))+')';
    }).join(' · ');
    /* Бутоните стоят ИЗВЪН кутията на сигнала - тя е текст за оглед, а
       бутонът е действие по конкретна двойка. */
    var linkBtns = opp.map(function(c){
      var ex = line.difference_category==='excess' ? line : c;
      var sh = ex===line ? c : line;
      if(!sdSwapLinkState(ex, sh)) return '';
      return '<button data-ex="'+esc(String(ex.id))+'" data-sh="'+esc(String(sh.id))+'" onclick="openSwapLinkModal(this.dataset.ex,this.dataset.sh)" '+
        'style="margin:3px 4px 0 0;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;">🔗 Свържи с '+esc(c.store_name||'')+'</button>';
    }).join('');
    return box('opposite','#fffbeb','#fde68a','#92400e','⚠️ Възможна размяна: '+parts)+
      (linkBtns ? '<div>'+linkBtns+'</div>' : '');
  }
  var same = cands.map(function(c){
    return esc(c.store_name||'')+' ('+esc(sdFmtDateTime(c.created_at))+')';
  }).join(' · ');
  return box('same','#f8fafc','#e2e8f0','#64748b','ℹ️ Същият артикул и в: '+same);
}

/* ══ Размяна между магазини (stock_diff_swaps) ══
   from = редът с ИЗЛИШЪК (магазинът изпраща), to = редът с ЛИПСА (получава).
   Една липса се покрива от една отворена размяна (partial unique по
   to_line_id); един излишък може да захрани няколко. stock_differences.swap_id
   се пише САМО на реда с липсата. Стъпка 2: складът свързва/развързва/
   приключва; магазинските действия (sent/received) са стъпка 3. */

/* Излишък и липса по реда - ЕДИН източник за модала, панела и стъпка 3.
   И двете количества зададени: излишък = реално - по док., липса = по док. -
   реално (отрицателното става 0). Само едното зададено: и двете са то.
   Нищо: null. suspect = количество над 100000 - на 16.09.2026 в базата стоеше
   номер на документ (80464309) в полето за количество. */
function sdLineDelta(line){
  var num = function(v){
    if(v===null || v===undefined || v==='') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  };
  var doc = num(line && line.quantity), real = num(line && line.quantity_received);
  var suspect = (doc!==null && doc>100000) || (real!==null && real>100000);
  if(doc!==null && real!==null){
    return {excess:Math.max(0, real-doc), shortage:Math.max(0, doc-real), suspect:suspect};
  }
  var one = doc!==null ? doc : real;
  return {excess:one, shortage:one, suspect:suspect};
}
/* Една заявка за размените на заредените междускладови редове (и отворени, и
   затворени). sbGet не отхвърля - при грешка връща []. */
function sdLoadSwaps(){
  var ids = sdData.filter(function(l){ return sdLineDirection(l)==='interstore'; })
    .map(function(l){ return l.id; });
  if(!ids.length){ sdSwaps = []; return Promise.resolve(); }
  var inList = '('+ids.join(',')+')';
  return sbGet('stock_diff_swaps', 'or=(from_line_id.in.'+inList+',to_line_id.in.'+inList+')&order=created_at.asc')
    .then(function(rows){ sdSwaps = Array.isArray(rows) ? rows : []; });
}
/* Всички размени, в които редът е from или to - отворени и затворени. */
function sdSwapsForLine(line){
  if(!line) return [];
  var id = String(line.id);
  return sdSwaps.filter(function(s){ return String(s.from_line_id)===id || String(s.to_line_id)===id; });
}
/* Може ли складът да свърже двойката излишък -> липса:
     'new'   - няма отворена размяна по липсата, двата реда не са приключени;
     'retry' - двойката ВЕЧЕ е записана, но липсата не е маркирана (swap_id) -
               кликът прави само PATCH-а, без нов INSERT;
     null    - бутон няма. */
function sdSwapLinkState(ex, sh){
  if(!ex || !sh || ex.status==='received' || sh.status==='received') return null;
  var open = sdSwaps.filter(function(s){ return s.status!=='closed' && String(s.to_line_id)===String(sh.id); });
  if(!open.length) return 'new';
  var pair = open.filter(function(s){ return String(s.from_line_id)===String(ex.id); })[0];
  if(pair && String(sh.swap_id||'')!==String(pair.id)) return 'retry';
  return null;
}
/* Числата за модала и за проверката при запис - едно място, за да не се
   разминат показаното и валидираното. */
function sdSwapLinkInfo(ex, sh){
  var dEx = sdLineDelta(ex), dSh = sdLineDelta(sh);
  var openSum = sdSwaps.filter(function(s){
    return s.status!=='closed' && String(s.from_line_id)===String(ex.id);
  }).reduce(function(sum, s){ return sum + (Number(s.qty)||0); }, 0);
  var available = (dEx.excess===null ? 0 : dEx.excess) - openSum;
  return {excess:dEx.excess, shortage:dSh.shortage, openSum:openSum, available:available,
          suspect:dEx.suspect || dSh.suspect};
}
function openSwapLinkModal(excessLineId, shortageLineId){
  if(!isLogisticsWarehouseUser()) return;
  var find = function(id){ return sdData.find(function(x){ return String(x.id)===String(id); }); };
  var ex = find(excessLineId), sh = find(shortageLineId);
  if(!ex || !sh) return;
  var state = sdSwapLinkState(ex, sh);
  if(!state) return;
  if(state==='retry'){
    var pair = sdSwaps.filter(function(s){
      return s.status!=='closed' && String(s.from_line_id)===String(ex.id) && String(s.to_line_id)===String(sh.id);
    })[0];
    sdMarkSwapLine(pair, sh);
    return;
  }
  var info = sdSwapLinkInfo(ex, sh);
  var fmtN = function(v){ return v===null ? '—' : String(v); };
  var side = function(l, title){
    var rp = diffReports.find(function(x){ return x.id===l.report_id; }) || {};
    var q = diffQtyLabels(rp.direction);
    return '<div style="flex:1 1 160px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px;">'+
      '<div style="font-weight:700;margin-bottom:4px;">'+title+'</div>'+
      '<div>🏪 '+esc(l.store_name||'')+'</div>'+
      '<div>'+esc(diffCategoryLabel(l.difference_category))+'</div>'+
      '<div>'+esc(q.docShort)+': '+fmtN(l.quantity)+' · '+esc(q.realShort)+': '+fmtN(l.quantity_received)+'</div>'+
      (l.comment ? '<div style="color:#64748b;white-space:normal;">💬 '+esc(l.comment)+'</div>' : '')+
    '</div>';
  };
  var canLink = info.available > 0;
  var defQty = (!info.suspect && canLink && info.shortage!==null && info.shortage>0) ? Math.min(info.available, info.shortage) : '';
  var existing = document.getElementById('sdswap-ov'); if(existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = '<div class="bov open" id="sdswap-ov"><div class="bmod" style="width:460px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">🔗 Размяна между магазини</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">'+esc(ex.material_code||'')+' · '+esc(ex.material_name||sh.material_name||'')+'</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">'+side(ex,'Излишък (изпраща)')+side(sh,'Липса (получава)')+'</div>'+
    '<div style="font-size:12px;margin-bottom:6px;">Посока: <b>'+esc(ex.store_name||'')+'</b> → <b>'+esc(sh.store_name||'')+'</b></div>'+
    '<div id="sdswap-nums" style="font-size:12px;margin-bottom:8px;">Излишък: '+fmtN(info.excess)+' · Липса: '+fmtN(info.shortage)+
      ' · В отворени размени: '+info.openSum+' · <b>Налично за размяна: '+info.available+'</b></div>'+
    (info.suspect ? '<div id="sdswap-suspect" style="color:#dc2626;font-weight:700;font-size:12px;margin-bottom:8px;">Проверете количеството по документ</div>' : '')+
    (!canLink ? '<div id="sdswap-why" style="color:#dc2626;font-size:12px;margin-bottom:8px;">Няма налично за размяна: излишък '+fmtN(info.excess)+', вече в отворени размени '+info.openSum+'.</div>' : '')+
    '<label class="fl">Количество</label>'+
    '<input class="fi" id="sdswap-qty" type="number" min="0" step="any" value="'+defQty+'">'+
    '<label class="fl">Бележка (по избор)</label>'+
    '<input class="fi" id="sdswap-note" value="">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="document.getElementById(\'sdswap-ov\').remove()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button data-ex="'+esc(String(ex.id))+'" data-sh="'+esc(String(sh.id))+'" onclick="submitSwapLink(this.dataset.ex,this.dataset.sh)"'+(canLink?'':' disabled')+
      ' style="border:none;background:'+(canLink?'#2563eb':'#94a3b8')+';color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:'+(canLink?'pointer':'not-allowed')+';">🔗 Свържи</button>'+
    '</div></div></div>';
  document.body.appendChild(div.firstChild);
}
/* Запис в два хода (правило 13): 1) INSERT на размяната, 2) swap_id на
   липсата. Падне ли вторият, размяната остава в sdSwaps локално, панелът
   показва ⚠, а бутонът "Свържи" за същата двойка прави само PATCH-а. */
function submitSwapLink(excessLineId, shortageLineId){
  var find = function(id){ return sdData.find(function(x){ return String(x.id)===String(id); }); };
  var ex = find(excessLineId), sh = find(shortageLineId);
  if(!ex || !sh || sdSwapLinkState(ex, sh)!=='new') return;
  var info = sdSwapLinkInfo(ex, sh);
  var qEl = document.getElementById('sdswap-qty'), nEl = document.getElementById('sdswap-note');
  var qty = Number(String(qEl ? qEl.value : '').replace(',', '.'));
  if(!(qty > 0)){ toast('Въведете количество, по-голямо от 0','#dc2626'); return; }
  if(qty > info.available){ toast('Количеството е над наличното за размяна ('+info.available+')','#dc2626'); return; }
  if(info.shortage!==null && qty > info.shortage){ toast('Количеството е над липсата ('+info.shortage+')','#dc2626'); return; }
  var repEx = diffReports.find(function(x){ return x.id===ex.report_id; }) || {};
  sdKeepScroll(sh.report_id);
  sbPostReturn('stock_diff_swaps', {
    from_line_id: ex.id, to_line_id: sh.id,
    from_store: ex.store_name, to_store: sh.store_name,
    warehouse: repEx.counterpart || (currentUser && currentUser.store_name) || '',
    material_code: ex.material_code || sh.material_code || null,
    material_name: ex.material_name || sh.material_name || null,
    qty: qty, note: (nEl && nEl.value.trim()) || null,
    created_by: sdActor(), status: 'linked'
  }).then(function(res){
    if(!res.ok){ toast('Размяната НЕ е записана: '+sbErrMsg(res),'#dc2626'); return; }
    var ov = document.getElementById('sdswap-ov'); if(ov) ov.remove();
    if(!res.row || !res.row.id){
      toast('Размяната е записана, но отговорът е без id — презаредете','#dc2626');
      loadStockDiff();
      return;
    }
    sdSwaps.push(res.row);
    sdMarkSwapLine(res.row, sh);
  });
}
/* Вторият ход на свързването - swap_id на реда с липсата. */
function sdMarkSwapLine(swap, sh){
  if(!swap || !sh) return;
  sdKeepScroll(sh.report_id);
  sbPatch('stock_differences', 'id=eq.'+sh.id, {swap_id: swap.id}).then(function(res){
    if(!res.ok){
      toast('Размяната е записана, но редът не е маркиран — натиснете отново','#dc2626');
      /* renderStockDiff, НЕ loadStockDiff - презареждането не бива да губи
         локалната размяна, докато потребителят не натисне отново. */
      renderStockDiff();
      return;
    }
    sh.swap_id = swap.id;
    toast('🔗 Размяната е свързана');
    loadStockDiff();
  });
}
/* Обратен ред спрямо свързването: първо swap_id=null, после DELETE - иначе
   при провал на DELETE-а би останал swap_id към изтрита размяна. */
function sdUnlinkSwap(swapId){
  var s = sdSwaps.find(function(x){ return String(x.id)===String(swapId); });
  if(!s || s.status!=='linked' || !isLogisticsWarehouseUser()) return;
  if(!confirm('Развържи размяната '+s.from_store+' → '+s.to_store+'?')) return;
  var sh = sdData.find(function(x){ return String(x.id)===String(s.to_line_id); });
  sdKeepScroll(sh ? sh.report_id : null);
  sbPatch('stock_differences', 'id=eq.'+s.to_line_id+'&swap_id=eq.'+s.id, {swap_id: null}).then(function(res){
    if(!res.ok){ toast('Развързването НЕ мина — редът не е размаркиран: '+sbErrMsg(res),'#dc2626'); return null; }
    if(sh && String(sh.swap_id||'')===String(s.id)) sh.swap_id = null;
    return sbDelete('stock_diff_swaps', 'id=eq.'+s.id);
  }).then(function(res){
    if(!res) return;
    if(!res.ok){ toast('Редът е размаркиран, но размяната НЕ е изтрита — натиснете отново: '+sbErrMsg(res),'#dc2626'); renderStockDiff(); return; }
    sdSwaps = sdSwaps.filter(function(x){ return x.id!==s.id; });
    toast('✖ Размяната е развързана');
    loadStockDiff();
  });
}
/* Приключване от склада, само при received: размяната -> closed, после двата
   реда -> received (като "Прието обратно"; store_response не се пипа).
   Всеки провал спира веригата с червен toast, който казва КОЙ запис падна.
   Ред с излишък, който захранва и друга отворена размяна, остава отворен.
   Бланка, чиито редове са вече всички received, се затваря (reviewed) -
   същото правило като sdConfirmInterstore. */
function sdCloseSwap(swapId){
  var s = sdSwaps.find(function(x){ return String(x.id)===String(swapId); });
  if(!s || s.status!=='received' || !isLogisticsWarehouseUser()) return;
  if(!confirm('Приключи размяната '+s.from_store+' → '+s.to_store+'? И двата реда стават приключени.')) return;
  var find = function(id){ return sdData.find(function(x){ return String(x.id)===String(id); }); };
  var fromL = find(s.from_line_id), toL = find(s.to_line_id);
  sdKeepScroll(toL ? toL.report_id : null);
  var at = new Date().toISOString(), by = sdActor();
  var STOP = {};
  var fail = function(msg, res){ toast(msg+': '+sbErrMsg(res),'#dc2626'); renderStockDiff(); throw STOP; };
  var markLine = function(id, l, store){
    return sbPatch('stock_differences', 'id=eq.'+id, {status:'received', completed_by:by, completed_at:at}).then(function(res){
      if(!res.ok) fail('Размяната е приключена, но редът на '+store+' НЕ е', res);
      if(l){ l.status='received'; l.completed_by=by; l.completed_at=at; }
    });
  };
  sbPatch('stock_diff_swaps', 'id=eq.'+s.id, {status:'closed', closed_by:by, closed_at:at}).then(function(res){
    if(!res.ok) fail('Размяната НЕ е приключена', res);
    s.status='closed'; s.closed_by=by; s.closed_at=at;
    var otherOpen = sdSwaps.some(function(x){
      return x.id!==s.id && x.status!=='closed' && String(x.from_line_id)===String(s.from_line_id);
    });
    return otherOpen ? null : markLine(s.from_line_id, fromL, s.from_store);
  }).then(function(){
    return markLine(s.to_line_id, toL, s.to_store);
  }).then(function(){
    var repIds = [fromL && fromL.report_id, toL && toL.report_id].filter(function(x, i, a){ return x && a.indexOf(x)===i; });
    return Promise.all(repIds.map(function(rid){
      var sib = sdData.filter(function(x){ return x.report_id===rid; });
      if(!sib.length || !sib.every(function(x){ return x.status==='received'; })) return {ok:true};
      return sbPatch('differences_reports', 'id=eq.'+rid, {reviewed:true});
    }));
  }).then(function(results){
    if(results.some(function(r){ return !r.ok; })) toast('Размяната е приключена, но бланката НЕ е затворена','#dc2626');
    else toast('🏁 Размяната е приключена');
    loadStockDiff();
  }).catch(function(e){ if(e!==STOP) toast('Грешка при приключване: '+e,'#dc2626'); });
}
/* "🔗 Размяна: A → B · qty бр. · статус" - един ред, общ за панела, главната
   таблица и стъпка 3. */
function sdSwapHeadline(s){
  var TR = {van:'бус', truck:'камион'};
  var st = s.status==='linked' ? 'чака изпращане от '+s.from_store :
           s.status==='sent' ? 'изпратено'+(s.transport_mode ? ' ('+(TR[s.transport_mode]||s.transport_mode)+')' : '') :
           s.status==='received' ? 'прието в '+s.to_store :
           s.status==='closed' ? 'приключена' : String(s.status||'');
  return '🔗 Размяна: '+esc(s.from_store||'')+' → '+esc(s.to_store||'')+' · '+esc(String(s.qty))+' бр. · '+esc(st);
}
/* Панелът на реда в колона "Отговор на склада". Складът (своята размяна):
   "✖ Развържи" при linked, "🏁 Приключи размяната" при received. Магазините и
   Цвети/admin - само за четене. */
function sdSwapPanel(line){
  var list = sdSwapsForLine(line);
  if(!list.length) return '';
  var TR = {van:'бус', truck:'камион'};
  return list.map(function(s){
    var h = '<div data-sdswap="'+esc(String(s.id))+'" style="margin-top:4px;border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:4px 6px;font-size:10.5px;color:#92400e;white-space:normal;">'+
      '<div style="font-weight:700;">'+sdSwapHeadline(s)+'</div>';
    if(s.status==='sent' || s.status==='received'){
      var when = s.status==='sent' ? s.sent_at : s.received_at;
      var bits = [];
      if(s.transport_mode) bits.push('превоз: '+(TR[s.transport_mode]||esc(s.transport_mode)));
      if(when) bits.push(sdFmtDateTime(when));
      if(s.sap_doc_num) bits.push('SAP '+esc(s.sap_doc_num));
      if(bits.length) h += '<div>'+bits.join(' · ')+'</div>';
    }
    /* ⚠: размяната е записана, но редът с липсата не носи swap_id (вторият
       ход на свързването е паднал). Виждат го само тези, при които редът с
       липсата е зареден. */
    var toL = sdData.find(function(x){ return String(x.id)===String(s.to_line_id); });
    if(s.status!=='closed' && toL && String(toL.swap_id||'')!==String(s.id)){
      h += '<div data-sdswap-warn="1" style="color:#dc2626;font-weight:700;">⚠ Редът с липсата не е маркиран</div>';
    }
    var mine = isLogisticsWarehouseUser() && s.warehouse===currentUser.store_name;
    if(mine && s.status==='linked'){
      h += '<button data-sid="'+esc(String(s.id))+'" onclick="sdUnlinkSwap(this.dataset.sid)" style="margin-top:3px;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;">✖ Развържи</button>';
    }
    if(mine && s.status==='received'){
      h += '<button data-sid="'+esc(String(s.id))+'" onclick="sdCloseSwap(this.dataset.sid)" style="margin-top:3px;border:none;background:#16a34a;color:#fff;border-radius:5px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;">🏁 Приключи размяната</button>';
    }
    return h + '</div>';
  }).join('');
}
/* Главната таблица: само текстов ред за всяка размяна, без бутони. */
function sdSwapSummary(line){
  return sdSwapsForLine(line).map(function(s){
    return '<div style="margin-top:3px;font-size:10.5px;color:#92400e;font-weight:600;white-space:normal;">'+sdSwapHeadline(s)+'</div>';
  }).join('');
}

/* ── Секция с подадени бланки (чакат преглед) ── */
function renderDiffReportsSection(){
  var allVisible = sdVisibleUnreviewedReports();
  var unreviewed = allVisible.slice();
  /* Подтаб по посока - Доставчик / Междускладов трансфер (искане на Цвети:
     двата потока да не се смесват в един списък). */
  if(sdDirTabsActive()){
    unreviewed = unreviewed.filter(function(r){ return (r.direction||'supplier') === sdDirTab; });
  }
  /* Чип по магазин + свободно търсене - същите контроли като за таблицата
     по-долу, за да не се търси на две различни места. */
  if(sdStoreFilter){
    unreviewed = unreviewed.filter(function(r){ return r.store_name === sdStoreFilter; });
  }
  if(sdSearch){
    var qRep = sdSearch.toLowerCase();
    unreviewed = unreviewed.filter(function(r){
      var lines = sdData.filter(function(x){return x.report_id===r.id;});
      var hay = [r.store_name,r.counterpart,r.document_number,r.general_comment,r.submitted_by]
        .concat(lines.map(function(l){ return [l.material_code,l.material_name,l.comment,l.resolution_comment].join(' '); }))
        .join(' ').toLowerCase();
      return hay.indexOf(qRep) !== -1;
    });
  }
  if(!unreviewed.length){
    /* Има непрегледани бланки, но текущите филтри ги крият - казваме го явно,
       вместо секцията просто да изчезне и да изглежда, че няма нищо за преглед. */
    if(allVisible.length && (sdStoreFilter || sdSearch)){
      return '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#5b21b6;">'+
        '🆕 Има '+allVisible.length+' непрегледан'+(allVisible.length===1?'а бланка':'и бланки')+', но нито една не отговаря на текущия филтър. '+
        '<button onclick="sdClearFilters()" style="border:none;background:#7c3aed;color:#fff;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;margin-left:6px;">Изчисти филтъра</button></div>';
    }
    return '';
  }
  /* Бланки с наскоро коригиран от магазина ред изскачат най-отгоре -
     иначе биха останали "погребани" в дъното на списъка. */
  /* Бланка, на която складът вече е отговорил напълно (всички редове имат
     warehouse_response), слиза надолу - вече не е спешна за преглед, чака
     магазина да потвърди получаването. */
  function warehouseFullyResponded(repId){
    var lines = sdData.filter(function(x){return x.report_id===repId;});
    return lines.length>0 && lines.every(function(l){return !!l.warehouse_response;});
  }
  unreviewed = unreviewed.slice().sort(function(a,b){
    var aResponded = warehouseFullyResponded(a.id);
    var bResponded = warehouseFullyResponded(b.id);
    if(aResponded&&!bResponded)return 1;
    if(bResponded&&!aResponded)return -1;
    var aLines=sdData.filter(function(x){return x.report_id===a.id;});
    var bLines=sdData.filter(function(x){return x.report_id===b.id;});
    var aCorr=aLines.reduce(function(m,l){return l.store_corrected_at&&l.store_corrected_at>m?l.store_corrected_at:m;},'');
    var bCorr=bLines.reduce(function(m,l){return l.store_corrected_at&&l.store_corrected_at>m?l.store_corrected_at:m;},'');
    if(aCorr&&!bCorr)return -1;
    if(bCorr&&!aCorr)return 1;
    if(aCorr&&bCorr)return bCorr.localeCompare(aCorr); /* по-скоро коригираните - по-напред */
    return 0; /* иначе пази оригиналния ред */
  });
  var h='<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:14px;">';
  h+='<div style="font-size:14px;font-weight:700;color:#5b21b6;margin-bottom:10px;">🆕 Нови подадени бланки — чакат преглед ('+unreviewed.length+(unreviewed.length!==allVisible.length?' от '+allVisible.length:'')+')'+
     (sdDirTabsActive()?' <span style="font-weight:500;color:#7c3aed;">· '+diffDirShortLabel(sdDirTab)+'</span>':'')+'</div>';
  unreviewed.forEach(function(rep){
    var lines = sdData.filter(function(x){return x.report_id===rep.id;});
    var wasCorrected = lines.some(function(l){return !!l.store_corrected_at;});
    /* Прогрес по бланката - колко реда вече са решени от Цвети. Без това
       трябваше да се изчете всеки ред, за да се разбере докъде е стигнала. */
    /* При междускладов трансфер решение от Цвети няма изобщо - прогресът там
       е "колко реда е потвърдила отсрещната страна" (status='received').
       Иначе картата вечно пишеше "⬜ 0/N — недокосната" за поток, който
       върви и по който складът вече е отговорил. */
    var repIsInterstore = (rep.direction==='interstore');
    var doneCount = repIsInterstore
      ? lines.filter(function(l){return l.status==='received';}).length
      : lines.filter(function(l){return !!l.type;}).length;
    var totalCount = lines.length;
    var inProgress = doneCount > 0 && doneCount < totalCount;
    var pct = totalCount ? Math.round(doneCount*100/totalCount) : 0;
    /* id-то е котвата, към която се връщаме след пре-рендиране (виж sdKeepScroll) */
    h+='<div id="diff-rep-'+rep.id+'" style="background:#fff;border:1px solid '+(wasCorrected?'#fbbf24':(inProgress?'#a7f3d0':'#e9d5ff'))+';border-left:4px solid '+(wasCorrected?'#f59e0b':(inProgress?'#10b981':'#c4b5fd'))+';border-radius:8px;padding:12px;margin-bottom:8px;'+(wasCorrected?'box-shadow:0 0 0 1px #fde68a;':'')+'">';
    h+='<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
    h+='<div><span style="font-weight:700;">🏪 '+esc(rep.store_name||'')+'</span>'+
       (wasCorrected?' <span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">✏️ КОРИГИРАНА</span>':'')+
       (totalCount?' <span title="'+(repIsInterstore?'Потвърдени редове от тази бланка':'Решени редове от тази бланка')+'" style="background:'+(inProgress?'#ecfdf5':'#f5f3ff')+';color:'+(inProgress?'#047857':'#6d28d9')+';padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">'+(repIsInterstore?'📬 '+doneCount+'/'+totalCount+' потвърдени':(doneCount?'⏳ '+doneCount+'/'+totalCount+' решени':'⬜ 0/'+totalCount+' — недокосната'))+'</span>':'')+
       '<span style="color:#94a3b8;font-size:12px;margin-left:8px;">'+diffDirShortLabel(rep.direction)+' — '+esc(rep.counterpart||'')+'</span>'+
       (rep.no_document?'<span style="margin-left:6px;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:10px;padding:1px 7px;font-size:10.5px;font-weight:600;">📄 Без документ</span>':'')+
       '</div>'+
       '<div style="display:flex;align-items:center;gap:8px;">'+
       '<span style="font-size:11px;color:#94a3b8;">'+fmtDate(rep.doc_date)+(rep.document_number?' · Док. '+esc(rep.document_number):'')+'</span>'+
       (rep.email_sent_at?'<span style="font-size:10.5px;color:#16a34a;font-weight:600;">✉️ Изпратен '+sdFmtDateTime(rep.email_sent_at)+'</span>':'')+
       '<button data-rid="'+rep.id+'" onclick="loadDiffPrint(this.dataset.rid)" title="Печат на бланката" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">🖨 Печат</button>'+
       (canSendDiffEmail()?'<button data-rid="'+rep.id+'" onclick="openDiffEmailModal(this.dataset.rid)" style="border:none;background:#0ea5e9;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">✉️ Изпрати имейл</button>':'')+
       (sdCanDeleteReport()?'<button data-rid="'+rep.id+'" onclick="sdDeleteReport(this.dataset.rid)" title="Изтрий ЦЯЛАТА бланка — редове и файлове, необратимо" style="border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">🗑 Изтрий бланката</button>':'')+
       '</div>';
    h+='</div>';
    /* Лента на прогреса - показва се само докато бланката е започната, но
       незавършена (при 0 решени няма какво да покаже, при 100% бланката вече
       е маркирана като прегледана и изчезва от тази секция). */
    if(inProgress){
      h+='<div title="'+doneCount+' от '+totalCount+' реда са решени" style="height:4px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin:-2px 0 8px;">'+
         '<div style="width:'+pct+'%;height:100%;background:#10b981;"></div></div>';
    }
    if(lines.length){
      var repIsSupplier=rep.direction==='supplier';
      var repQty=diffQtyLabels(rep.direction);
      h+='<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6px;">';
      h+='<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">SAP</th><th style="padding:3px 6px;">Артикул</th><th style="padding:3px 6px;">Категория</th><th style="padding:3px 6px;text-align:right;">'+repQty.docShort+'</th>'+
        (repIsSupplier?'<th style="padding:3px 6px;text-align:right;">По стокова</th>':'')+
        '<th style="padding:3px 6px;text-align:right;">'+repQty.realShort+'</th><th style="padding:3px 6px;">Коментар (магазин)</th><th style="padding:3px 6px;">Снимки</th><th style="padding:3px 6px;">Коментар (Цвети)</th><th style="padding:3px 6px;">Решение (Цвети)</th><th style="padding:3px 6px;">Отговор на склада</th></tr>';
      lines.forEach(function(l){
        /* Решените редове затихват в зелено, за да изпъкват НЕрешените -
           корекцията от магазина (жълто) има приоритет, тя е по-спешна.
           Над двете стои червеното: магазинът не може да пусне обратното
           движение (няма наличност в логистика) - ходът е на склада. При
           status='received' редът е приключен и червеното отпада. */
        var rowBg = (l.store_response==='no_stock' && l.status!=='received') ? 'background:#fef2f2;' :
          (l.store_corrected_at ? 'background:#fffbeb;' : (l.type ? 'background:#f0fdf4;color:#64748b;' : ''));
        h+='<tr style="border-top:1px solid #f1f5f9;'+rowBg+'">'+
          '<td style="padding:3px 6px;font-family:DM Mono,monospace;">'+esc(l.material_code||'')+'</td>'+
          /* Сигналът за размяна стои под ИМЕТО на артикула, а не в колоната на
             склада - там вече е отговорът плюс потвърждението, а въпросът
             "този ли е артикулът" е за самия артикул. Вижда го само складът. */
          '<td style="padding:3px 6px;">'+esc(l.material_name||'')+(l.store_corrected_at?' <span title="Коригирано от магазина">✏️</span>':'')+sdSwapBadge(l)+'</td>'+
          '<td style="padding:3px 6px;">'+diffCategoryLabel(l.difference_category)+'</td>'+
          '<td style="padding:3px 6px;text-align:right;">'+sdQtyCell(l.quantity,(l.quantity!=null?l.quantity:'—'))+'</td>'+
          (repIsSupplier?'<td style="padding:3px 6px;text-align:right;">'+(l.quantity_supplier_doc!=null?l.quantity_supplier_doc:'—')+'</td>':'')+
          '<td style="padding:3px 6px;text-align:right;">'+sdQtyCell(l.quantity_received,(l.quantity_received!=null?l.quantity_received:'—'))+'</td>'+
          '<td style="padding:3px 6px;color:#64748b;">'+esc(l.comment||'')+'</td>'+
          /* Снимките по РЕДА - тук магазинът доказва какво е заприходил, без да
             може да пипне количествата. Колоната е отделна от коментара на
             Цвети, защото качва и едната, и другата страна. */
          '<td style="padding:3px 6px;">'+sdLineAttachCell(l)+'</td>'+
          '<td style="padding:3px 6px;color:#7c3aed;">'+esc(l.resolution_comment||'')+'</td>'+
          '<td style="padding:3px 6px;white-space:nowrap;">'+diffLineResolveButtons(l)+
          (canReviewDiff()&&!isLogisticsWarehouseUser()?' <button data-lid="'+l.id+'" onclick="openSDModal(this.dataset.lid)" title="Добави коментар/прикачи документ" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#5b21b6;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">💬</button>':'')+
          (canEditSD(l)&&!l.type&&currentUser.store_name===rep.store_name?' <button data-lid="'+l.id+'" onclick="openSDCorrectModal(this.dataset.lid)" title="Коригирай количество/SAP код" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">✏️</button>':'')+
          '</td>'+
          '<td style="padding:3px 6px;white-space:nowrap;">'+diffWarehouseResolveButtons(l,rep)+sdInterstoreConfirmButton(l,rep)+sdSwapPanel(l)+'</td>'+
        '</tr>';
      });
      h+='</table>';
    }
    if(rep.general_comment) h+='<div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-bottom:6px;">💬 '+esc(rep.general_comment)+'</div>';
    var photos = Array.isArray(rep.photos)?rep.photos:[];
    /* Контейнерът се рендира и при НУЛА снимки, стига този потребител да може
       да прикачва - бланка, подадена без снимка, също трябва да може да получи
       такава. Преди целият блок беше под if(photos.length) и точно тези бланки
       оставаха без изход. */
    var canAddPhoto = canAttachDiffReport(rep);
    if(photos.length || canAddPhoto){
      h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">';
      photos.forEach(function(p){
        /* Не всичко, качено през "Снимай сега/Избери от галерия", реално е
           снимка - служителите понякога прикачват сканирани PDF документи.
           <img> не може да покаже PDF вградено (затова изглеждаше "счупено"
           на екрана, макар линкът да работеше коректно при директно отваряне). */
        var isImg = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(p.url);
        if(isImg){
          h+='<a href="'+esc(p.url)+'" target="_blank"><img src="'+esc(p.url)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
        } else {
          h+='<a href="'+esc(p.url)+'" target="_blank" title="'+esc(p.name||'Файл')+'" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:56px;height:56px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;text-decoration:none;font-size:20px;">📄</a>';
        }
      });
      /* Плътен бутон, не пунктираното квадратче с 📎 от sdLineAttachCell -
         магазините не разпознаваха пунктира като бутон и не го натискаха. */
      if(canAddPhoto){
        h+='<label title="Добави пропусната снимка към бланката" data-add-photo-rid="'+rep.id+'" style="display:inline-flex;align-items:center;gap:5px;border:1px solid #c4b5fd;background:#f5f3ff;color:#5b21b6;border-radius:6px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer;">'+
          '📷 Добави снимка<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx" style="display:none;" data-rid="'+rep.id+'" onchange="sdUploadReportPhoto(this,this.dataset.rid)">'+
        '</label>';
      }
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  return h;
}

/* ── Корекция на ред от магазина, докато още не е решен от Цвети ── */
var sdCorrectLineId = null;
function openSDCorrectModal(lineId){
  sdCorrectLineId = lineId;
  var l = sdData.find(function(x){return String(x.id)===String(lineId);});
  if(!l)return;
  /* Явен изход: количествата по сторна за грешен прием не се коригират от
     обекта - те са основата на глобата. Магазинът вижда реда и го проследява. */
  if(isWrongReceiptReadOnly(l)){
    toast('Редът е от „Сторна по грешен прием" — количествата се коригират само от централния офис','#d97706');
    return;
  }
  var existing = document.getElementById('sdc-ov'); if(existing) existing.remove();
  var sdcQty = diffQtyLabels(sdLineDirection(l));
  var div = document.createElement('div');
  div.innerHTML = '<div class="bov open" id="sdc-ov"><div class="bmod" style="width:420px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">✏️ Коригирай подадената разлика</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Ако сте открили стоката или сте сгрешили бройка/код при подаването.</div>'+
    '<div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;">'+
    '<div><label class="fl">SAP код</label><input class="fi" id="sdc-sap" value="'+escVal(l.material_code)+'"></div>'+
    '<div><label class="fl">Наименование</label><input class="fi" id="sdc-name" value="'+escVal(l.material_name)+'"></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">'+sdcQty.doc+'</label><input type="number" step="0.001" class="fi" id="sdc-qty" value="'+(l.quantity!=null?l.quantity:'')+'"></div>'+
    '<div><label class="fl">'+sdcQty.real+'</label><input type="number" step="0.001" class="fi" id="sdc-qty-real" value="'+(l.quantity_received!=null?l.quantity_received:'')+'"></div>'+
    '</div>'+
    '<label class="fl">Коментар (по избор)</label>'+
    '<input class="fi" id="sdc-comment" value="'+escVal(l.comment)+'" placeholder="напр. Намерена в склада при ревизия">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="document.getElementById(\'sdc-ov\').remove()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSDCorrection()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази корекцията</button>'+
    '</div></div></div>';
  document.body.appendChild(div.firstChild);
}
function submitSDCorrection(){
  var current = sdData.find(function(x){return String(x.id)===String(sdCorrectLineId);});
  /* Същата ключалка и на записа, не само на отварянето. */
  if(isWrongReceiptReadOnly(current)){
    toast('Редът е от „Сторна по грешен прием" — количествата се коригират само от централния офис','#d97706');
    var elWr=document.getElementById('sdc-ov'); if(elWr)elWr.remove();
    return;
  }
  if(current && current.type){
    toast('⚠️ Цветелина вече е дала решение по този запис - корекция вече не е възможна.','#d97706');
    var elLocked=document.getElementById('sdc-ov'); if(elLocked)elLocked.remove();
    loadStockDiff();
    return;
  }
  var sapEl=document.getElementById('sdc-sap'), nameEl=document.getElementById('sdc-name'),
      qtyEl=document.getElementById('sdc-qty'), qtyRealEl=document.getElementById('sdc-qty-real'),
      commentEl=document.getElementById('sdc-comment');
  var name=(nameEl.value||'').trim();
  if(!name){toast('Наименованието не може да е празно','#dc2626');return;}
  var qtyBad=[qtyEl,qtyRealEl].filter(function(el){ return diffQtyLooksLikeDocNum(el.value); })[0];
  if(qtyBad){
    toast('Корекция: '+diffQtyDocNumMsg(qtyBad.value),'#dc2626');
    qtyBad.focus();
    return;
  }
  var data={
    material_code: sapEl.value,
    material_name: name,
    quantity: qtyEl.value,
    quantity_received: qtyRealEl.value,
    comment: commentEl.value,
    store_corrected_at: new Date().toISOString()
  };
  sdCleanPayload(data);
  sdKeepScroll(current?current.report_id:null);
  sbPatch('stock_differences','id=eq.'+sdCorrectLineId,data).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    var el=document.getElementById('sdc-ov'); if(el)el.remove();
    toast('✅ Корекцията е запазена!');
    loadStockDiff();
  });
}

/* ── Динамични редове с артикули за формата за подаване ── */
/* lookupCatalogBySap() вече живее в shared.js - споделена с client-orders.js/transport.js */

function diffItemRowHtml(item,direction){
  item=item||{};
  direction=direction||'interstore';
  var catOpts=diffCategoryOptionsForDirection(direction,item.category);
  var meta=item.category?diffCatMeta(item.category):null;
  return '<div class="diff-item-row" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">'+
    '<div style="display:grid;grid-template-columns:1fr 2fr;gap:6px;margin-bottom:6px;">'+
      '<input class="fi di-sap" placeholder="SAP №" value="'+escVal(item.sap)+'" onblur="lookupCatalogBySap(this)">'+
      '<input class="fi di-name" placeholder="Наименование на артикула *" value="'+escVal(item.name)+'">'+
    '</div>'+
    /* Бележка от търсенето в каталога - пълни се от lookupCatalogBySap() */
    '<div class="di-lookup-hint"></div>'+
    /* Колоните са същите (quantity / quantity_received), сменя се само думата:
       при сторната сравнението е фактура ↔ заприходено. */
    '<div style="display:grid;grid-template-columns:'+(direction==='supplier'?'1fr 1fr 1fr 1fr':'1fr 1fr 1fr')+';gap:6px;margin-bottom:6px;">'+
      '<input type="number" step="0.001" class="fi di-qty" placeholder="'+diffQtyLabels(direction).doc+'" value="'+(item.qty!=null?item.qty:'')+'">'+
      (direction==='supplier'?'<input type="number" step="0.001" class="fi di-qty-supdoc" placeholder="По стокова на дост." value="'+(item.qtySupplierDoc!=null?item.qtySupplierDoc:'')+'">':'')+
      '<input type="number" step="0.001" class="fi di-qty-real" placeholder="'+diffQtyLabels(direction).real+'" value="'+(item.qtyReal!=null?item.qtyReal:'')+'">'+
      '<select class="fi di-unit">'+unitOptionsHtml(item.unit)+'</select>'+
    '</div>'+
    '<div style="margin-bottom:6px;"><select class="fi di-cat" style="width:100%;" onchange="updateDiffItemHint(this)">'+catOpts+'</select></div>'+
    '<div class="di-hint"></div>'+
    '<div style="display:flex;gap:6px;">'+
      '<input class="fi di-comment" placeholder="Коментар (незадължително)" style="flex:1;" value="'+escVal(item.comment)+'">'+
      '<button type="button" onclick="removeDiffItemRow(this)" style="border:none;background:#fee2e2;color:#991b1b;border-radius:5px;padding:0 10px;cursor:pointer;">✕</button>'+
    '</div>'+
  '</div>';
}
/* Показва инлайн подсказка под артикула, когато категорията е избрана -
   задължителни снимки и/или кой допълнително трябва да получи имейл */
function updateDiffItemHint(selectEl){
  var row=selectEl.closest('.diff-item-row');
  var hintEl=row?row.querySelector('.di-hint'):null;
  if(!hintEl)return;
  var meta=diffCatMeta(selectEl.value);
  if(!meta){hintEl.innerHTML='';return;}
  var photosReq=meta[3], notifyHint=meta[4];
  if(!photosReq&&!notifyHint){hintEl.innerHTML='';return;}
  var parts=[];
  if(photosReq)parts.push('📸 <b>Задължителни снимки</b> за тази категория');
  if(notifyHint)parts.push('✉️ Нужен доп. имейл до: <b>'+esc(notifyHint)+'</b>');
  hintEl.innerHTML='<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:5px 8px;font-size:11px;color:#92400e;margin:-2px 0 6px;">'+parts.join(' &nbsp;·&nbsp; ')+'</div>';
}
function renderDiffItemRows(items){
  var el=document.getElementById('diff-items'); if(!el)return;
  if(!items||!items.length)items=[{}];
  var dirEl=document.getElementById('diff-direction');
  var direction=dirEl?dirEl.value:'interstore';
  el.innerHTML=items.map(function(it){return diffItemRowHtml(it,direction);}).join('');
}
function addDiffItemRow(){
  var el=document.getElementById('diff-items'); if(!el)return;
  var dirEl=document.getElementById('diff-direction');
  var direction=dirEl?dirEl.value:'interstore';
  el.insertAdjacentHTML('beforeend',diffItemRowHtml({},direction));
}
function removeDiffItemRow(btn){
  var row=btn.closest('.diff-item-row'); if(!row)return;
  var container=row.parentNode;
  if(container.querySelectorAll('.diff-item-row').length<=1){toast('Трябва поне 1 артикул','#dc2626');return;}
  container.removeChild(row);
}
/* Като collectDiffItems(), но пази ВСИЧКИ редове (дори без въведено име) -
   ползва се само за запазване на въведените данни при смяна на посоката,
   когато layout-ът на редовете трябва да се пре-рендира (полето "По стокова
   на доставчика" се появява/скрива според избраната посока). */
function collectDiffItemsForRedraw(){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  var items=[];
  rows.forEach(function(row){
    var supDocEl=row.querySelector('.di-qty-supdoc');
    items.push({
      sap:row.querySelector('.di-sap').value,
      name:row.querySelector('.di-name').value,
      qty:parseFloat(row.querySelector('.di-qty').value)||null,
      qtySupplierDoc:supDocEl?(parseFloat(supDocEl.value)||null):null,
      qtyReal:parseFloat(row.querySelector('.di-qty-real').value)||null,
      unit:row.querySelector('.di-unit').value||'бр.',
      category:row.querySelector('.di-cat').value||null,
      comment:row.querySelector('.di-comment').value
    });
  });
  return items.length?items:[{}];
}
/* Редове, в които потребителят е въвел нещо, но е пропуснал наименованието.
   Номерата са 1-базирани, както ги брои потребителят на екрана.
   Нужни са, защото collectDiffItems() изхвърля такъв ред тихо - при една
   бланка с един ред това даваше "Добави поне един артикул", докато на екрана
   стои попълнен ред. */
function diffRowsMissingName(){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  var out=[];
  rows.forEach(function(row,i){
    if((row.querySelector('.di-name').value||'').trim())return;
    var supDocEl=row.querySelector('.di-qty-supdoc');
    var filled=[
      row.querySelector('.di-sap').value,
      row.querySelector('.di-qty').value,
      supDocEl?supDocEl.value:'',
      row.querySelector('.di-qty-real').value,
      row.querySelector('.di-cat').value,
      row.querySelector('.di-comment').value
    ];
    for(var k=0;k<filled.length;k++){
      if((filled[k]||'').trim()){ out.push(i+1); return; }
    }
  });
  return out;
}
/* Фокус в полето за наименование на посочения (1-базиран) ред. */
function diffFocusRowName(idx){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  var row=rows[idx-1]; if(!row)return;
  var el=row.querySelector('.di-name'); if(el)el.focus();
}
/* Количество над 99999 не е бройка, а номер на документ, вписан в грешното
   поле: вх. доставките са 9 цифри (180486328), документите - 10 (4600179694).
   Към 13.09.2026 най-голямото истинско количество в базата е 600, а между
   1000 и 99999 няма нито един ред. parseFloat - PostgREST връща числата като
   низове, а полетата на формата са низове по природа. */
var DIFF_QTY_MAX = 99999;
function diffQtyLooksLikeDocNum(v){
  if(sdBlankQty(v)) return false;
  var n=parseFloat(v);
  return !isNaN(n) && n>DIFF_QTY_MAX;
}
function diffQtyDocNumMsg(value){ return 'количеството прилича на номер на документ ('+String(value).trim()+'), напиши брой'; }
/* Първият ред на формата с такова количество: {row (1-базиран, както на
   екрана), value, el}. „По стокова на доставчика" НЕ се проверява - то е
   полето на централния офис. */
function diffRowQtyLikeDocNum(){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  for(var i=0;i<rows.length;i++){
    var els=[rows[i].querySelector('.di-qty'),rows[i].querySelector('.di-qty-real')];
    for(var j=0;j<els.length;j++){
      if(els[j]&&diffQtyLooksLikeDocNum(els[j].value)) return {row:i+1,value:els[j].value,el:els[j]};
    }
  }
  return null;
}
/* Клетка с количество в изгледа на Цвети. Старите редове в базата НЕ се
   пипат - вместо 180486328 бройки клетката казва какво вероятно е това, а
   пълната стойност стои в title. fallback е досегашното съдържание. */
function sdQtyCell(v,fallback){
  if(!diffQtyLooksLikeDocNum(v)) return fallback;
  return '<span title="'+escVal(String(v))+'" style="color:#d97706;font-weight:600;white-space:nowrap;">⚠️ номер на документ?</span>';
}
function collectDiffItems(){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  var items=[];
  rows.forEach(function(row){
    var name=row.querySelector('.di-name').value.trim();
    if(!name)return;
    var supDocEl=row.querySelector('.di-qty-supdoc');
    items.push({
      sap:row.querySelector('.di-sap').value.trim(),
      name:name,
      qty:parseFloat(row.querySelector('.di-qty').value)||null,
      qtySupplierDoc:supDocEl?(parseFloat(supDocEl.value)||null):null,
      qtyReal:parseFloat(row.querySelector('.di-qty-real').value)||null,
      unit:row.querySelector('.di-unit').value||'бр.',
      category:row.querySelector('.di-cat').value||null,
      comment:row.querySelector('.di-comment').value.trim()
    });
  });
  return items;
}

/* ── Снимки - качване към Storage, събрани преди submit ── */
/* Компресира снимка чрез canvas - смалява до maxDim по дългата страна и преизкодира като JPEG.
   Ако файлът не е снимка (напр. видео), се връща непроменен. */
function diffCompressImage(file,maxDim,quality){
  return new Promise(function(resolve){
    if(!file.type||file.type.indexOf('image/')!==0){ resolve(file); return; }
    try{
      var url=URL.createObjectURL(file);
      var img=new Image();
      img.onload=function(){
        URL.revokeObjectURL(url);
        try{
          var w=img.width,h=img.height;
          var scale=Math.min(1,maxDim/Math.max(w,h));
          var cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
          var canvas=document.createElement('canvas');
          canvas.width=cw; canvas.height=ch;
          var ctx=canvas.getContext('2d');
          if(!ctx){resolve(file);return;}
          ctx.drawImage(img,0,0,cw,ch);
          canvas.toBlob(function(blob){ resolve(blob||file); },'image/jpeg',quality);
        }catch(err){ resolve(file); }
      };
      img.onerror=function(){ try{URL.revokeObjectURL(url);}catch(e){} resolve(file); };
      img.src=url;
    }catch(err){ resolve(file); }
  });
}
/* Премахва грешно качена снимка/документ от бланката за подаване на разлика,
   преди тя изобщо да бъде подадена (само локално в diffPendingPhotos - самата
   снимка остава в storage-а, но вече не се прикача към бланката). */
function diffRemovePendingPhoto(url){
  diffPendingPhotos = diffPendingPhotos.filter(function(p){return p.url!==url;});
  var wrap=document.getElementById('diff-photos-wrap');
  if(!wrap)return;
  var btn=wrap.querySelector('button[data-url="'+url.replace(/"/g,'\\"')+'"]');
  if(btn && btn.parentElement) btn.parentElement.remove();
}
function diffUploadPhoto(input){
  var files=Array.from(input.files||[]);
  if(!files.length)return;
  var wrap=document.getElementById('diff-photos-wrap');
  files.forEach(function(file){
    var placeholderId='ph-'+Math.random().toString(36).slice(2,10);
    if(wrap) wrap.insertAdjacentHTML('beforeend','<div id="'+placeholderId+'" style="width:56px;height:56px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;">⏳</div>');
    diffCompressImage(file,1600,0.75).then(function(compressed){
      var isImg=file.type&&file.type.indexOf('image/')===0;
      var ext=isImg?'jpg':((file.name.split('.').pop()||'bin').toLowerCase());
      var ctype=isImg?'image/jpeg':(file.type||'application/octet-stream');
      var path='differences/'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.'+ext;
      var reader=new FileReader();
      reader.onload=function(e){
        fetch(DIFF_SB+'/storage/v1/object/'+DIFF_BKT+'/'+path,{
          method:'POST',
          headers:{'Authorization':'Bearer '+DIFF_KEY,'Content-Type':ctype,'x-upsert':'true'},
          body:e.target.result
        }).then(function(r){return r.ok;}).then(function(ok){
          var ph=document.getElementById(placeholderId);
          if(!ok){ if(ph) ph.outerHTML='<div style="width:56px;height:56px;border-radius:6px;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:16px;">⚠️</div>'; return; }
          var pub=DIFF_SB+'/storage/v1/object/public/'+DIFF_BKT+'/'+path;
          diffPendingPhotos.push({url:pub,name:file.name});
          var removeBtn='<button type="button" data-url="'+esc(pub)+'" onclick="diffRemovePendingPhoto(this.dataset.url)" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border:none;background:#dc2626;color:#fff;border-radius:50%;font-size:9px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>';
          if(ph){
            if(isImg){
              ph.outerHTML='<div style="position:relative;display:inline-block;"><a href="'+esc(pub)+'" target="_blank"><img src="'+esc(pub)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>'+removeBtn+'</div>';
            } else {
              ph.outerHTML='<div style="position:relative;display:inline-block;"><a href="'+esc(pub)+'" target="_blank" title="'+esc(file.name)+'" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;text-decoration:none;font-size:20px;">📄</a>'+removeBtn+'</div>';
            }
          }
        }).catch(function(){
          var ph2=document.getElementById(placeholderId);
          if(ph2) ph2.outerHTML='<div style="width:56px;height:56px;border-radius:6px;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:16px;">⚠️</div>';
        });
      };
      reader.readAsArrayBuffer(compressed);
    });
  });
  input.value='';
}

/* ── Модал за подаване ── */
function diffSubmitModalHtml(){
  var myS=assignedStores();
  var storeField;
  if(myS&&myS.length===1) storeField='<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="diff-store" value="'+esc(myS[0])+'">';
  else if(myS&&myS.length>1) storeField='<select class="fi" id="diff-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>';
  else storeField='<select class="fi" id="diff-store"><option value="">-- Зарежда се... --</option></select>';

  return '<div class="bov" id="diff-submit-ov"><div class="bmod" style="width:640px;max-height:88vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:16px;font-weight:700;">📝 Подай бланка за разлики</div>'+
    '<button onclick="closeDiffSubmitModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'+
    /* "Сторна по грешен прием" се показва като опция само на ЦО - магазинската
       роля не бива да може дори да я избере. Записът пак се проверява отделно
       в submitDiffReport(), скритата опция сама по себе си не е защита. */
    '<div><label class="fl">Посока *</label><select class="fi" id="diff-direction" onchange="updateDiffCounterpartLabel()">'+
      '<option value="interstore">🔄 Междускладов трансфер</option>'+
      '<option value="supplier">📦 Доставчик</option>'+
      (canSubmitWrongReceipt()?'<option value="wrong_receipt">🧾 Сторна по грешен прием</option>':'')+
    '</select></div>'+
    '<div><label class="fl">Магазин *</label>'+storeField+'</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'+
    '<div><label class="fl" id="diff-counterpart-label">Обект изпращач</label><select class="fi" id="diff-counterpart"></select></div>'+
    '<div><label class="fl">Документ №</label><input class="fi" id="diff-docnum" placeholder="вх. доставка 180486328 или документ 4600179694"></div>'+
    '</div>'+
    /* Отметката "без документ" се рисува тук от updateDiffCounterpartLabel() -
       само при посока доставчик. Празен контейнер значи, че при останалите
       посоки <input> изобщо не съществува, а не просто е скрит. */
    '<div id="diff-no-doc-wrap"></div>'+
    '<div style="margin-bottom:12px;"><label class="fl">Дата на получаване/доставка</label><input type="date" class="fi" id="diff-docdate" value="'+today()+'" style="max-width:200px;"></div>'+

    '<label class="fl">Артикули с разлика *</label>'+
    '<div id="diff-items"></div>'+
    '<button type="button" onclick="addDiffItemRow()" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-bottom:12px;">+ Добави артикул</button>'+

    /* Посоката по подразбиране в селекта по-горе е "interstore" - надписът
       тръгва от нея и се пренастройва от updateDiffCounterpartLabel(). */
    '<label class="fl">Снимки <span id="diff-photo-hint" style="color:#94a3b8;font-weight:400;">'+diffPhotoHintText('interstore')+'</span></label>'+
    '<div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;">'+
      '<label style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'+
        '📷 Снимай сега<input type="file" accept="image/*" capture="environment" onchange="diffUploadPhoto(this)" style="display:none;">'+
      '</label>'+
      '<label style="border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'+
        '🖼️ Избери от галерия<input type="file" accept="image/*" multiple onchange="diffUploadPhoto(this)" style="display:none;">'+
      '</label>'+
    '</div>'+
    '<div id="diff-photos-wrap" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div>'+

    '<label class="fl">Общ коментар</label>'+
    '<textarea class="fi" id="diff-comment" rows="2" placeholder="Допълнителна информация за случая..."></textarea>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeDiffSubmitModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitDiffReport()" style="border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✅ Подай бланка</button>'+
    '</div></div></div>';
}
function updateDiffCounterpartLabel(){
  var dir=document.getElementById('diff-direction').value;
  var lbl=document.getElementById('diff-counterpart-label');
  var sel=document.getElementById('diff-counterpart');
  lbl.textContent=diffDirCounterpartLabel(dir);
  /* Надписът под "Снимки" също следва посоката - категориите се сменят
     заедно с нея, значи и обещанието кои от тях искат снимка. */
  var hintEl=document.getElementById('diff-photo-hint');
  if(hintEl) hintEl.textContent=diffPhotoHintText(dir);
  /* Стоката понякога идва без документ - тогава няма какво да се снима.
     Отметката отменя САМО задължителните снимки; наименованието остава
     задължително. Има смисъл само срещу доставчик: при междускладов трансфер
     и при сторна по грешен прием документ винаги има. При смяна на посоката
     контейнерът се пренарисува, тоест отметката тръгва изключена, а надписът
     под "Снимки" вече е върнат от реда отгоре. */
  var noDocWrap=document.getElementById('diff-no-doc-wrap');
  if(noDocWrap){
    noDocWrap.innerHTML = dir==='supplier'
      ? '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;margin:-2px 0 10px;cursor:pointer;">'+
          '<input type="checkbox" id="diff-no-doc" onchange="var h=document.getElementById(\'diff-photo-hint\');if(h)h.textContent=this.checked?\'(без документ — по избор)\':diffPhotoHintText(\'supplier\');">'+
          ' 📄 Стоката е без документ (снимки не са задължителни)</label>'
      : '';
  }
  /* Сторната по грешен прием също тръгва от фактура на ДОСТАВЧИК - списъкът е
     същият като при посока "Доставчик", не списъкът с обекти. */
  if(dir==='supplier'||dir==='wrong_receipt'){
    loadAllSuppliers().then(function(list){
      sel.innerHTML='<option value="">-- Избери доставчик --</option>'+list.map(function(n){return '<option>'+esc(n)+'</option>';}).join('');
    });
  } else {
    /* Междускладов трансфер: изпращачът може да бъде САМО логистичен склад.
       Пълният списък с обекти (fillStoreSelect от allStoresCache - 23 записа)
       позволяваше да се избере "Търговище" вместо "Логистичен склад
       Търговище". Складът вижда бланките си по counterpart === store_name,
       тоест такава бланка не стига до никого - реален случай: 2 бланки от
       Петрич от 30.08.2026. Списъкът е константа (LOGISTICS_WAREHOUSES в
       shared.js), затова тук няма заявка. */
    sel.innerHTML='<option value="">-- Избери склад --</option>'+
      LOGISTICS_WAREHOUSES.map(function(n){return '<option>'+esc(n)+'</option>';}).join('');
  }
  /* Пре-рендираме редовете с layout-а на новата посока (полето "По стокова на
     доставчика" се появява само за посока "Доставчик") - пазим вече въведените данни */
  var preserved=collectDiffItemsForRedraw();
  renderDiffItemRows(preserved);
  preserved.forEach(function(it,i){
    if(!it.category)return;
    var rows=document.querySelectorAll('#diff-items .diff-item-row');
    var catSel=rows[i]?rows[i].querySelector('.di-cat'):null;
    if(catSel)updateDiffItemHint(catSel);
  });
}

/* prefill (по избор) — предварително попълнена бланка, подадена отвън:
     {direction, counterpart, document_number, doc_date, comment,
      items:[{sap,name,qty}]}
   Днес единственият ѝ ползвател е бутонът „⚠️ Разлика" по неполучен палет в
   Товарни листи (llOpenDiffForItem в loading.js): магазинът вече е описал
   веднъж какво е получил и няма смисъл да преписва склада, документа и
   артикулите на ръка.
   БЕЗ аргумент функцията се държи точно както преди — това е заковано със
   снимка на HTML-а на модала в tests/loading-diff-prefill.test.js.
   Категорията на редовете НАРОЧНО остава празна: тя е преценка на магазина
   (липса, излишък, увредена стока), а не нещо, което подателят може да знае.
   Полето „Магазин" също не се пипа — то идва от самия потребител. */
function openDiffSubmitModal(prefill){
  diffPendingPhotos=[];
  var old=document.getElementById('diff-submit-ov'); if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',diffSubmitModalHtml());
  renderDiffItemRows([{}]);
  var ov=document.getElementById('diff-submit-ov');
  ov.classList.add('open');
  updateDiffCounterpartLabel(); /* зарежда магазини (посоката по подразбиране е "Междускладов")*/

  if(prefill){
    var setVal=function(id,val){
      var el=document.getElementById(id);
      if(el && val!==undefined && val!==null && val!=='') el.value=val;
    };
    var dirEl=document.getElementById('diff-direction');
    if(dirEl && prefill.direction && dirEl.value!==prefill.direction){
      dirEl.value=prefill.direction;
      /* Списъкът с насрещни страни зависи от посоката — при смяна се строи
         наново, иначе counterpart-ът по-долу не намира опцията си. */
      updateDiffCounterpartLabel();
    }
    setVal('diff-counterpart',prefill.counterpart);
    setVal('diff-docnum',prefill.document_number);
    setVal('diff-docdate',prefill.doc_date);
    setVal('diff-comment',prefill.comment);
    /* Редовете се рендират ПОСЛЕДНИ: updateDiffCounterpartLabel() по-горе сам
       ги пре-рендира според посоката и би изтрил подадените. */
    if(Array.isArray(prefill.items) && prefill.items.length) renderDiffItemRows(prefill.items);
  }

  var myStores=assignedStores();
  if(!(myStores&&myStores.length)){
    sbGet('users','select=store_name&order=store_name').then(function(data){
      var el=document.getElementById('diff-store');
      if(Array.isArray(data)&&el){
        var seen={};
        el.innerHTML='<option value="">-- Избери --</option>'+data.filter(function(u){
          if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
          seen[u.store_name]=1;return true;
        }).map(function(u){return '<option>'+esc(u.store_name)+'</option>';}).join('');
      }
    });
  }
}
function closeDiffSubmitModal(){
  var ov=document.getElementById('diff-submit-ov'); if(ov)ov.remove();
  diffPendingPhotos=[];
}

function submitDiffReport(){
  var store=(document.getElementById('diff-store').value||'').trim();
  var direction=document.getElementById('diff-direction').value||'interstore';
  var counterpart=document.getElementById('diff-counterpart').value.trim();
  var items=collectDiffItems();
  if(!store){toast('Избери магазин','#dc2626');return;}
  /* Твърдият гейт за посоката е ТУК, не само в скритата опция на селекта -
     подаването ражда глоба и не бива да зависи от това какво е рендирано. */
  if(direction==='wrong_receipt'&&!canSubmitWrongReceipt()){
    toast('Бланка „Сторна по грешен прием" се подава само от централния офис','#dc2626');
    return;
  }
  /* Празната насрещна страна минаваше тихо. Бланка без изпращач/доставчик не
     стига до никого - и двата списъка тръгват от празна опция, значи "не съм
     избрал" е стойност по подразбиране, не изключение. */
  if(!counterpart){
    toast(direction==='interstore'?'Избери склад изпращач':'Избери доставчик','#dc2626');
    return;
  }
  /* Започнат ред без наименование спира подаването и се посочва поименно -
     иначе се губеше тихо (collectDiffItems го изхвърля). */
  var missingName=diffRowsMissingName();
  if(missingName.length){
    toast((missingName.length===1?'Ред ':'Редове ')+missingName.join(', ')+': впиши наименование на артикула','#dc2626');
    diffFocusRowName(missingName[0]);
    return;
  }
  if(!items.length){toast('Добави поне един артикул с наименование','#dc2626');return;}
  /* Номер на документ в количеството спира подаването ПРЕДИ качването на
     снимките и POST-а - иначе стига до базата като 180486328 бройки. */
  var qtyDocNum=diffRowQtyLikeDocNum();
  if(qtyDocNum){
    toast('Ред '+qtyDocNum.row+': '+diffQtyDocNumMsg(qtyDocNum.value),'#dc2626');
    qtyDocNum.el.focus();
    return;
  }

  /* Реална проверка за задължителни снимки (не само текстова подсказка) -
     ако поне 1 артикул е с категория, изискваща снимки, а няма качена нито 1 */
  var needsPhotos=items.some(function(it){
    var meta=it.category?diffCatMeta(it.category):null;
    return meta&&meta[3];
  });
  /* "Без документ" важи само при посока доставчик - при другите посоки
     отметката не се рисува, но проверката е и тук, за да не зависи от DOM-а. */
  var noDocEl=document.getElementById('diff-no-doc');
  var noDocument = direction==='supplier' && !!(noDocEl && noDocEl.checked);
  if(needsPhotos&&!noDocument&&!diffPendingPhotos.length){
    var catsNeeding=items.filter(function(it){var m=it.category?diffCatMeta(it.category):null;return m&&m[3];})
      .map(function(it){return diffCategoryLabel(it.category);})
      .filter(function(v,i,arr){return arr.indexOf(v)===i;});
    toast('📸 Снимки са задължителни за: '+catsNeeding.join(', '),'#dc2626');
    return;
  }

  var reportData={
    direction:direction,
    store_name:store,
    counterpart:counterpart,
    document_number:document.getElementById('diff-docnum').value.trim(),
    doc_date:document.getElementById('diff-docdate').value||null,
    submitted_by:currentUser.display_name||currentUser.email,
    general_comment:document.getElementById('diff-comment').value.trim(),
    photos:diffPendingPhotos,
    /* Винаги булев - false, а не липсващ ключ, когато отметката е изключена. */
    no_document:noDocument,
    reviewed:false
  };

  sbPost('differences_reports',reportData).then(function(res){
    if(!res.ok){toast('Грешка при запис на бланката','#dc2626');return;}
    /* PostgREST с Prefer:return=minimal не връща id - взимаме последния запис по store+created_at */
    sbGet('differences_reports','store_name=eq.'+encodeURIComponent(store)+'&order=created_at.desc&limit=1').then(function(rows){
      var report=Array.isArray(rows)&&rows[0]?rows[0]:null;
      if(!report){toast('Бланката е записана, но има забавяне при синхронизация - опреснете страницата','#d97706');closeDiffSubmitModal();loadStockDiff();return;}
      var lines=items.map(function(it){
        return {
          report_id:report.id,
          store_name:store,
          supplier:counterpart,
          material_code:it.sap,
          material_name:it.name,
          quantity:it.qty,
          quantity_supplier_doc:it.qtySupplierDoc,
          quantity_received:it.qtyReal,
          difference_category:it.category,
          unit:it.unit,
          comment:it.comment,
          status:'new',
          created_by:currentUser.display_name||currentUser.email
        };
      });
      fetch(DIFF_SB+'/rest/v1/stock_differences',{
        method:'POST',
        headers:{'apikey':DIFF_KEY,'Authorization':'Bearer '+DIFF_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify(lines)
      }).then(function(r2){
        if(!r2.ok){toast('Бланката е записана, но артикулите не се записаха - виж конзолата','#dc2626');console.error('stock_differences batch insert failed');closeDiffSubmitModal();loadStockDiff();return;}
        closeDiffSubmitModal();
        toast('✅ Бланката е подадена! Цветелина ще я прегледа.');
        loadStockDiff();
      });
    });
  });
}

/* ══════════════════════════════════════════
   ИМЕЙЛ ДО ДОСТАВЧИК/ИЗПРАЩАЧ (само Цветелина Тенева)
══════════════════════════════════════════ */

/* ── ПОЛУЧАТЕЛИ И ДОПЪЛНИТЕЛНИ ФАЙЛОВЕ ЗА ПИСМОТО ДО ДОСТАВЧИКА ──
   Полето "До" приемаше един низ и го подаваше непокътнат: "a@x.bg, b@y.bg"
   стигаше до SMTP като ЕДИН адрес със запетая вътре и писмото не тръгваше
   доникъде. sendEmail() (email.js) от самото начало приема масив - грешката
   беше само в извикващия, затова email.js не се пипа. */
var DIFF_MAIL_MAX_BYTES = 15 * 1024 * 1024; /* общо за ВСИЧКИ прикачени */

/* Разделя по запетая И точка-запетая (Outlook лепи с точка-запетая), trim-ва,
   изхвърля празните и дедуплицира БЕЗ разлика в регистъра - "A@x.bg" и
   "a@X.BG" са един и същи адрес и вторият само би дублирал писмото. */
function sdSplitEmails(str){
  var seen = {}, out = [];
  String(str||'').split(/[,;]/).forEach(function(part){
    var e = part.trim();
    if(!e) return;
    var k = e.toLowerCase();
    if(seen[k]) return;
    seen[k] = true;
    out.push(e);
  });
  return out;
}

/* Груба проверка, НЕ RFC валидатор: има ли @, има ли точка след него с поне
   един знак между двете, и не свършва ли на точка. Смисълът е да се хване
   очевидната грешка ПРЕДИ изпращане - SMTP отказва ЦЯЛОТО писмо заради един
   сгрешен адрес и не казва кой е, тоест Цвети вижда само "не се изпрати". */
function sdInvalidEmails(arr){
  return (arr||[]).filter(function(e){
    var at = e.indexOf('@');
    if(at < 1) return true;
    if(/\s/.test(e)) return true;
    var dot = e.indexOf('.', at);
    if(dot < at + 2) return true;
    return e.charAt(e.length-1) === '.';
  });
}

/* Размерът, който РЕАЛНО тръгва по мрежата: дължината на base64 низовете,
   както стоят в JSON payload-а. НЕ суровите байтове на файловете -
   кодирането раздува с около 33% и проверка върху суровия размер пуска
   комплект от 14 MB, който заминава като ~18.7 MB. SMTP го отрязва, след
   като потребителят вече е видял зелено - тоест по-лошо, отколкото изобщо
   да няма проверка. */
function sdAttachPayloadBytes(atts){
  return (atts||[]).reduce(function(sum,a){ return sum + String((a&&a.content)||'').length; }, 0);
}
function sdFmtSize(bytes){
  var b = Number(bytes)||0;
  if(b < 1024) return b + ' B';
  if(b < 1024*1024) return (b/1024).toFixed(0) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
}

/* Файловете, добавени РЪЧНО в текущо отвореното писмо. Държат се тук, а не в
   DOM-а, защото минават през компресия и base64 четене, тоест не са готови в
   момента на избора.
   ИЗЧИСТВА СЕ и при отваряне, и при затваряне на модала. Без това файловете
   от предишното писмо заминават със следващото - тихо и към ДРУГ доставчик. */
var diffEmailExtraFiles = [];

function diffEmailResetExtras(){
  diffEmailExtraFiles = [];
  var box = document.getElementById('de-extra-list');
  if(box) box.innerHTML = '';
  diffEmailUpdateCounts();
}

/* Броячът отразява ДВАТА източника - снимките от бланката и ръчно добавените.
   Броят на снимките стои в data-photos на самия ред, за да не зависи функцията
   от глобално състояние (и за да работи при пряко рендиране на модала). */
function diffEmailUpdateCounts(){
  var note = document.getElementById('de-photos-note');
  if(!note) return;
  var n = parseInt(note.getAttribute('data-photos')||'0',10) || 0;
  var m = diffEmailExtraFiles.length;
  note.textContent = '📎 Ще бъдат прикачени ' + n + ' снимк' + (n===1?'а':'и') + ' от бланката' +
    (m ? ' и ' + m + ' допълнител' + (m===1?'ен файл':'ни файла') : '') + '.';
}

function diffEmailRenderExtras(){
  var box = document.getElementById('de-extra-list');
  if(box){
    box.innerHTML = diffEmailExtraFiles.map(function(f){
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;font-size:12px;">'+
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(f.pending?'⏳ ':'📄 ')+esc(f.name)+
        ' <span style="color:#94a3b8;">'+sdFmtSize(f.size)+'</span></span>'+
        '<button data-fid="'+esc(f.id)+'" onclick="diffEmailRemoveExtra(this.dataset.fid)" title="Махни файла" '+
        'style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:1px 7px;font-size:11px;cursor:pointer;flex-shrink:0;">✕</button>'+
      '</div>';
    }).join('');
  }
  diffEmailUpdateCounts();
}

function diffEmailRemoveExtra(id){
  diffEmailExtraFiles = diffEmailExtraFiles.filter(function(f){ return f.id !== id; });
  diffEmailRenderExtras();
}

/* Изображенията минават през същата компресия като снимките към бланката
   (diffUploadPhoto), останалите файлове се четат както са. */
function diffEmailAddFiles(input){
  var files = Array.prototype.slice.call((input && input.files) || []);
  if(!files.length) return;
  /* Нулира се, за да може СЪЩИЯТ файл да бъде избран пак, ако е бил махнат
     с ✕ - иначе change не се вдига втори път. */
  try{ input.value = ''; }catch(e){}
  files.forEach(function(file){
    var id = 'ef-' + Math.random().toString(36).slice(2,10);
    var isImg = !!(file.type && file.type.indexOf('image/') === 0);
    diffEmailExtraFiles.push({ id:id, name:file.name||'файл', size:file.size||0, content:'', pending:true });
    diffEmailRenderExtras();
    diffCompressImage(file, 1600, 0.75).then(function(blob){
      return diffBlobToBase64(blob).then(function(b64){
        var rec = diffEmailExtraFiles.find(function(x){ return x.id === id; });
        if(!rec) return; /* махнат е с ✕, докато се е четял */
        rec.content = b64;
        rec.size = (blob && blob.size) || rec.size;
        /* Разширението става .jpg САМО ако компресията наистина е върнала
           jpeg - при неуспех diffCompressImage връща оригинала. */
        if(isImg && blob && blob.type === 'image/jpeg') rec.name = diffEmailJpgName(file.name);
        rec.pending = false;
        diffEmailRenderExtras();
      });
    }).catch(function(){
      diffEmailExtraFiles = diffEmailExtraFiles.filter(function(x){ return x.id !== id; });
      toast('⚠️ Файлът не можа да се прочете: ' + (file.name||''), '#dc2626');
      diffEmailRenderExtras();
    });
  });
}

function diffEmailJpgName(name){
  return String(name||'снимка').replace(/\.[^.]+$/,'') + '.jpg';
}

function diffEmailBodyHtml(rep,lines,note){
  var h='<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">';
  h+='<p>Здравейте,</p>';
  h+='<p>Установени са разлики при '+diffDirEmailPhrase(rep.direction)+' — '+esc(rep.counterpart||'')+
     (rep.no_document?', документ: няма (стока без документ)':(rep.document_number?', документ №'+esc(rep.document_number):''))+
     (rep.doc_date?', дата '+fmtDate(rep.doc_date):'')+'.</p>';
  var isSupplier=rep.direction==='supplier';
  h+='<table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;">';
  var emQty=diffQtyLabels(rep.direction);
  h+='<tr style="background:#f3f4f6;"><th style="border:1px solid #ccc;padding:6px;text-align:left;">SAP №</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Артикул</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Категория</th><th style="border:1px solid #ccc;padding:6px;text-align:right;">'+emQty.doc+'</th>'+
    (isSupplier?'<th style="border:1px solid #ccc;padding:6px;text-align:right;">По стокова на дост.</th>':'')+
    '<th style="border:1px solid #ccc;padding:6px;text-align:right;">'+emQty.realShort+'</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Коментар</th></tr>';
  lines.forEach(function(l){
    h+='<tr><td style="border:1px solid #ccc;padding:6px;">'+esc(l.material_code||'')+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;">'+esc(l.material_name||'')+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;">'+diffCategoryLabel(l.difference_category)+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;text-align:right;">'+(l.quantity!=null?l.quantity:'—')+'</td>'+
       (isSupplier?'<td style="border:1px solid #ccc;padding:6px;text-align:right;">'+(l.quantity_supplier_doc!=null?l.quantity_supplier_doc:'—')+'</td>':'')+
       '<td style="border:1px solid #ccc;padding:6px;text-align:right;">'+(l.quantity_received!=null?l.quantity_received:'—')+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;">'+esc(l.comment||'')+'</td></tr>';
  });
  h+='</table>';
  if(rep.general_comment) h+='<p><strong>Допълнителна информация:</strong> '+esc(rep.general_comment)+'</p>';
  var photos=Array.isArray(rep.photos)?rep.photos:[];
  if(photos.length) h+='<p>📎 Прикачени са '+photos.length+' снимк'+(photos.length===1?'а':'и')+' към този имейл.</p>';
  if(note) h+='<p>'+esc(note).replace(/\n/g,'<br>')+'</p>';
  /* resolution_comment НЕ влиза в писмото. Той е вътрешният коментар на
     счетоводството към МАГАЗИНА - реално изпратено писмо е носило „Няма
     качена стокова на доставчика! 1 бр е изписан- 4200017186", което няма
     работа при доставчика. Остава видим вътре в портала: таблицата в таба
     (ред 370), картата на бланката (1499) и свободното търсене (1404).
     В печатната бланка го няма и досега - там колоната „Коментар" е
     l.comment, същото поле като в имейла.
     Към доставчика тръгва само това, което е за него: l.comment в колоната
     „Коментар" (пише го магазинът), rep.general_comment и свободният текст
     от полето „Съдържание".
     Не връщай блока и не го прави условен - функцията храни И
     предварителния преглед, И самото изпращане, тоест преглед, различен от
     изпратеното, е по-лошо от изтичането. Заковано в
     tests/diff-email-internal-comment.test.js. */
  h+='<p>Поздрави,<br>'+esc(currentUser.display_name||currentUser.email)+'<br>ТеМАХ</p>';
  h+='</div>';
  return h;
}

function diffEmailModalHtml(rep,lines){
  var subject=(rep.document_number?rep.document_number+' - ':'')+'РАЗЛИКИ ('+esc(rep.store_name||'')+')';
  return '<div class="bov" id="diff-email-ov"><div class="bmod" style="width:680px;max-height:90vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:16px;font-weight:700;">✉️ Изпрати имейл до '+diffDirEmailTo(rep.direction)+'</div>'+
    '<button onclick="closeDiffEmailModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<label class="fl">До (имейл на '+diffDirEmailOf(rep.direction)+') *</label>'+
    '<input class="fi" id="de-to" list="de-supplier-list" placeholder="name@supplier.bg">'+
    '<datalist id="de-supplier-list"></datalist>'+
    '<div style="font-size:11.5px;color:#94a3b8;margin-top:3px;" id="de-to-hint">Няколко адреса се разделят със запетая.</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">'+
    '<div><label class="fl">Копие до (CC)</label><input class="fi" id="de-cc" value="'+esc(currentUser.email||'')+'"></div>'+
    '<div><label class="fl">Отговори на (Reply-To)</label><input class="fi" id="de-reply" value="'+esc(currentUser.email||'')+'"></div>'+
    '</div>'+

    '<label class="fl" style="margin-top:8px;">Тема</label>'+
    '<input class="fi" id="de-subject" value="'+esc(subject)+'">'+

    '<label class="fl" style="margin-top:8px;">Съдържание</label>'+
    '<textarea class="fi" id="de-body-note" rows="2" placeholder="(незадължително) допълнителен текст под таблицата и прикачените файлове..."></textarea>'+

    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-top:8px;max-height:220px;overflow-y:auto;font-size:12px;">'+
    diffEmailBodyHtml(rep,lines)+
    '</div>'+

    '<div style="font-size:12px;color:#64748b;margin-top:8px;" id="de-photos-note" data-photos="'+((rep.photos||[]).length)+'">📎 Ще бъдат прикачени '+((rep.photos||[]).length)+' снимк'+((rep.photos||[]).length===1?'а':'и')+' от бланката.</div>'+
    /* Ръчно добавени файлове - отделни от снимките на бланката. Списъкът се
       пълни от diffEmailAddFiles() и се ИЗЧИСТВА при всяко отваряне и
       затваряне на модала. */
    '<label class="fl" style="margin-top:8px;">Допълнителни файлове</label>'+
    '<input type="file" id="de-extra-files" multiple onchange="diffEmailAddFiles(this)" style="font-size:12px;">'+
    '<div id="de-extra-list" style="margin-top:4px;"></div>'+
    /* Явно казано, защото тихата липса подвежда точно колкото тихото
       изпращане: без този ред Цвети пише вътрешния коментар и предполага,
       че доставчикът го чете. */
    '<div style="font-size:11.5px;color:#94a3b8;margin-top:4px;" id="de-internal-note">🔒 Вътрешните коментари по редовете не се изпращат на доставчика.</div>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeDiffEmailModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button id="de-send-btn" data-rid="'+rep.id+'" onclick="sendDiffEmail(this.dataset.rid)" style="border:none;background:#0ea5e9;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✉️ Изпрати</button>'+
    '</div></div></div>';
}

function openDiffEmailModal(reportId){
  if(!canSendDiffEmail()){toast('Само Цветелина Тенева може да изпраща имейли до доставчици','#dc2626');return;}
  var rep=diffReports.find(function(r){return String(r.id)===String(reportId);});
  if(!rep){toast('Бланката не е намерена','#dc2626');return;}
  var lines=sdData.filter(function(x){return x.report_id===rep.id;});
  var old=document.getElementById('diff-email-ov'); if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',diffEmailModalHtml(rep,lines));
  document.getElementById('diff-email-ov').classList.add('open');
  /* И при отваряне, и при затваряне: остатък от предишното писмо би заминал
     към ДРУГ доставчик, без някой да го е избирал. */
  diffEmailResetExtras();
  if(rep.counterpart) document.getElementById('de-to').value=''; /* оставяме празно - Цветелина избира от списъка или пише ръчно */

  /* Автоматично предлагане на имейл на доставчика от Контакти */
  sbGet('contacts','type=eq.supplier&order=name').then(function(rows){
    if(!Array.isArray(rows))return;
    var dl=document.getElementById('de-supplier-list');
    if(!dl)return;
    dl.innerHTML=rows.filter(function(c){return c.email;}).map(function(c){
      return '<option value="'+esc(c.email)+'">'+esc(c.name||'')+'</option>';
    }).join('');
    /* ако името на доставчика/изпращача съвпада приблизително с контакт - предлагаме директно */
    if(rep.counterpart){
      var match=rows.find(function(c){return c.email && c.name && c.name.toLowerCase().indexOf(rep.counterpart.toLowerCase())>=0;});
      var toEl=document.getElementById('de-to');
      if(match && toEl) toEl.value=match.email;
    }
  });
}
function closeDiffEmailModal(){
  var ov=document.getElementById('diff-email-ov'); if(ov)ov.remove();
  diffEmailExtraFiles = [];
}

/* Blob/File -> base64 без префикса data:*;base64,. Изваден от
   diffUrlToBase64, защото ръчно добавените файлове тръгват от File, не от
   URL - двата пътя трябва да четат по един и същи начин. */
function diffBlobToBase64(blob){
  return new Promise(function(resolve,reject){
    var reader=new FileReader();
    reader.onloadend=function(){ resolve(String(reader.result).split(',')[1]||''); };
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });
}
function diffUrlToBase64(url){
  return fetch(url).then(function(r){return r.blob();}).then(diffBlobToBase64);
}

function sendDiffEmail(reportId){
  if(!canSendDiffEmail()){toast('Нямаш права за това действие','#dc2626');return;}
  var rep=diffReports.find(function(r){return String(r.id)===String(reportId);});
  if(!rep){toast('Бланката не е намерена','#dc2626');return;}
  /* Низ само от запетаи и интервали минаваше за валиден получател при
     старата проверка if(!to) - затова критерият е БРОЯТ адреси. */
  var toArr=sdSplitEmails(document.getElementById('de-to').value);
  if(!toArr.length){toast('Въведи имейл на получателя','#dc2626');return;}
  var ccArr=sdSplitEmails(document.getElementById('de-cc').value);
  /* Един сгрешен адрес проваля ЦЯЛОТО писмо на ниво SMTP, без да се разбере
     кой е. Затова се казва изрично и не се изпраща нищо. */
  var bad=sdInvalidEmails(toArr.concat(ccArr));
  if(bad.length){toast('⚠️ Невалиден адрес: '+bad.join(', '),'#dc2626');return;}
  var replyTo=(document.getElementById('de-reply').value||'').trim();
  var subject=(document.getElementById('de-subject').value||'').trim()||'РАЗЛИКИ';
  var note=(document.getElementById('de-body-note').value||'').trim();
  var lines=sdData.filter(function(x){return x.report_id===rep.id;});

  var bodyHtml=diffEmailBodyHtml(rep,lines,note);

  var btn=document.getElementById('de-send-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Подготвям снимките...';}

  var photos=Array.isArray(rep.photos)?rep.photos:[];
  Promise.all(photos.map(function(p){
    return diffUrlToBase64(p.url).then(function(b64){ return {filename:p.name||'снимка.jpg',content:b64}; }).catch(function(){ return null; });
  })).then(function(atts){
    var attachments=atts.filter(Boolean).concat(
      diffEmailExtraFiles.filter(function(x){return x.content;})
        .map(function(x){ return {filename:x.name,content:x.content}; })
    );
    /* Два независими източника на файлове - без общ лимит писмото пада на
       ниво SMTP мълчаливо или с неясна грешка. Казваме реалния размер. */
    var total=sdAttachPayloadBytes(attachments);
    if(total>DIFF_MAIL_MAX_BYTES){
      /* Изрично „след кодиране": числото е с ~33% над сбора на файловете в
         списъка и иначе изглежда сгрешено. */
      toast('⚠️ Прикачените файлове са '+sdFmtSize(total)+' след кодиране — лимитът е '+sdFmtSize(DIFF_MAIL_MAX_BYTES)+'. Махни някой файл.','#dc2626');
      if(btn){btn.disabled=false;btn.textContent='✉️ Изпрати';}
      return null;
    }
    if(btn) btn.textContent='⏳ Изпращане...';
    return sendEmail(toArr,subject,bodyHtml,{cc:ccArr.length?ccArr:undefined,reply_to:replyTo||undefined,attachments:attachments});
  }).then(function(res){
    if(res===null) return; /* спряно заради лимита - вече е казано */
    if(!res.ok){
      toast('Грешка при изпращане: '+(res.data&&res.data.message?res.data.message:'—'),'#dc2626');
      if(btn){btn.disabled=false;btn.textContent='✉️ Изпрати';}
      return;
    }
    toast('✅ Имейлът е изпратен!');
    sbPatch('differences_reports','id=eq.'+rep.id,{email_sent_at:new Date().toISOString()}).then(function(){
      closeDiffEmailModal();
      loadStockDiff();
    });
  }).catch(function(err){
    toast('Грешка: '+(err.message||err),'#dc2626');
    if(btn){btn.disabled=false;btn.textContent='✉️ Изпрати';}
  });
}

/* ══════════════════════════════════════════
   БРОЯЧ-НОТИФИКАЦИЯ ВЪРХУ ТАБ "РАЗЛИКИ"
   Червено балонче с брой върху самия таб, за да се види нова подадена
   разлика, без табът да е отворен. Броят е РАЗЛИЧЕН според ролята:
     · Цвети / ЦО (admin, accounting, logistics) - всички непрегледани бланки
     · логистичен склад - само бланките, при които той е насрещна страна
       и още не е отговорил по всички редове
     · магазин - собствените му непрегледани бланки
   Елементът се създава динамично - index.html не се пипа.
══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   ПЕЧАТ НА БЛАНКА ЗА РАЗЛИКИ
   По образеца на renderTransportPrint() в transport.js - същият in-page модел
   (пише в #mod-print и вика showModule('print')), без window.open и без
   библиотека. "Запази като PDF" е диалогът на самия браузър.
══════════════════════════════════════════ */

/* Логото е копие на низа от transport.js. Дублирано нарочно: вграденото
   base64 не зависи от мрежата, а външен <img src> към Pages може да не се
   дозареди преди диалога за печат и бланката излиза без лого. */
var DIFF_PRINT_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAqCAIAAABDSv52AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAFGklEQVR42u1YW2hcVRRde59z7507M5lkkia1tS9atTRqa4kgaD8UHyBqqVAMgtQHKIJIP9ovoVToTxEKRX/8ED9ExEKRCoIUaREflFIUtahVsNbUhqbmNTOZuc9zth95OElnkpi2mkLP14V7zr7rnrPW2nsf2tB9BxbHYAAi8j8iEJFxAAyAiOacfe1wTD3r+SyYE+uCR31kxqIZ1zmUa0Qdnp3VC6bO7HAbxtfXiKezR2j49gZtr1co/302aAyFRBTAQDPuEUAi9YjroYsIREgEIuPRMI8fa6AgAUImCzDIgWg7Hm+aQ6dAzOyLgAgiDNj6/yNKAENwBQwkRBBxgNnhqM7OrmmnQqRENkTmlihttZISSopZJtImABJUFbUbWR8nF7XSQMJUIQLImdywkNBh7KrEjDFHJDelooGASQECWAikgZz1jNOqELYEyXt9owYAUFJ8vMXd15k3zAoAEBNui9KDF0oxYduadhGsic091fhkzv3DVY4gJKxMzDt9o2uj9P2O7M7lrbsHy3fXkt5VRQJyxr52qXKgq2VQsyPT9olnWI8CjTErK64VAJ2p7R2q3V+NA0IEWCBkenG42l2LFJA3NmC8Mljd1z+6Z6BigAhYG6WHzw3fnBom3BqljpWfPd1TjW4PkwHNz44EW8sRNRLFNCgWyIj86unXlxW+zrtacNrXz68unsloC6xO0oKxFmhNxRJ1pRZATy15rBRaUgpQIjWmp0rBqKJDbb4IIuaMyPcZB8wbw3RzkLw8OHbW08OKtcwUbAPaKuDNjtyAovsqUYvFVzm3wrR7sPrSUO2XjO5dVWw1lkBLUvt4OdpaCQOmFmPLTDUiV+ThsXhvZ36pAYkd1GSBPx0+lXWeHgm2lwLXypc5p6y43YqZngq4kZLRIrI6tQCGNSKi3tFw919j/a76uJARQU4sATGwv780qPmnjBaRfs0ZKztGasXU3hmZJyqhZXVvNdkcJkNaHW7NdAfJplpSdvWHrX7WznVAUyMlKhoL4FjOCwkvjATG4t02/2BHtsNYQ/RR0fetOdnivdWeWxenBPzu6RWp2XNxrJCaXQPlLZXIElWZzjtqfZg8N1QDoab41eUt3/qObiRs3dC/SGRpakH4NO/lLbLWKpHHKlFe8EnBM6C327PH8t6JrLs+TJbE9kzW/SznDbjqtO/84Osv8t72UvjoSG3XsuKQ4qN9Qxui9POC11NL2lP7ZCXqc9Q5R7l1gBofkAU8kTVxeqiYPesqgrzRlf/NdzYFaUAoExnAEB0pZC44/GA1vuTwzuWFc67qDhNDsr8z/0Gbf97ho23+dxlnY2xO5dxH1i15ZmXxQGdu76Wxh8aiIUXq8h24vA8SQIk8UI2OZ92USIOqjLwVAkpMOSvbKuGxnFdVHBPtGKme8N0fPa0JPUGyIjZHCpmcyF1B/I3vpgQNqhIU4AsCpqKxJSYGZphKEygiAEImf3IuCwxNQBSigODJRIYKCErgCSwhBVKCLxAgAlwRAjC58xZgIJnkxLy4Mu7JWSsyac6WJugt018JkBUIYAkAtIgjJAQBMjI5R8ROxQF080zUvLadniSkLoSdTqx/hEkkNJGGppbPSDa2eYqeb+lU79T10RdQ1jRbMt8yu1nZ/G8L8lnm36htb0BZxFCaKYivcD1m7a7njFbfPPOCHWJ8vixIz1fUMzdzGpp09wV3+VOR+arcHlyVG7LFoiAR4UWCY+a9rSxIDvP/4OyS/BsnQaRclmJE7gAAAABJRU5ErkJggg==';
/* Същият израз като в diffReportPhotoThumbs - не всичко, качено през "Снимай
   сега", е изображение; служителите прикачват и сканирани PDF-и. */
var DIFF_IMG_RE = /\.(jpe?g|png|gif|webp)(\?|$)/i;

function loadDiffPrint(reportId){
  var rep = diffReports.find(function(x){return String(x.id)===String(reportId);});
  if(!rep){ toast('Бланката не е намерена','#dc2626'); return; }
  renderDiffPrint(rep);
  showModule('print');
}

function renderDiffPrint(rep){
  var wrap = document.getElementById('mod-print');
  if(!wrap) return;
  var lines = sdData.filter(function(x){ return x.report_id===rep.id; });
  var si = getStoreInfo(rep.store_name) || {};
  var pQty = diffQtyLabels(rep.direction);
  /* Количеството по стоковата разписка на доставчика има смисъл САМО при
     посока 'доставчик'. При трансфер и при сторна по грешен прием колоната
     изобщо не се рендира - празна колона на хартия се чете като липсващи
     данни, не като неприложима. Същото условие като repIsSupplier в картата
     и isSupplier в имейла. */
  var printSupplierDoc = (rep.direction||'supplier') === 'supplier';
  var photos = Array.isArray(rep.photos) ? rep.photos : [];
  var imgs  = photos.filter(function(p){ return p && p.url && DIFF_IMG_RE.test(p.url); });
  var files = photos.filter(function(p){ return p && p.url && !DIFF_IMG_RE.test(p.url); });
  /* general_comment е празен НИЗ, не NULL, във всичките заварени бланки -
     затова проверката е по trim(), не по истинност. */
  var genComment = (rep.general_comment||'').trim();

  var TYPE_LABELS = { writein:'📥 Заприхождаване', 'return':'↩️ Връщане', missing:'❓ Липса', not_invoiced:'🧾 Не са фактурирани' };
  /* Същата логика като sdRowStatusBadge, но без цветната таблетка - на хартия
     остава само думата. */
  var statusText = function(r){
    if(r.status==='received') return '📬 ПРИЕТА';
    var w = sdStatusWords(r.type, rep.direction);
    return sdIsTaken(r) ? (w.tIcon+' '+w.taken.toUpperCase()) : (w.pIcon+' '+w.pending.toUpperCase());
  };
  /* "Кой + кога" в една клетка: името горе, датата отдолу с дребен шрифт. */
  var whoWhen = function(who,when){
    if(!who) return '—';
    return esc(who)+(when?'<div class="p-sub">'+sdFmtDateTime(when)+'</div>':'');
  };

  var PRINT_CSS =
    '@media print{'+
      '@page{size:A4 portrait;margin:10mm;}'+
      '.no-print{display:none!important;}'+
      'body{margin:0;padding:0;}'+
      '.dp-row{page-break-inside:avoid;}'+
    '}'+
    '.dp-wrap{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;width:190mm;max-width:190mm;margin:0 auto;}'+
    '.dp-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm;}'+
    '.dp-store-name{font-size:12pt;font-weight:700;margin-bottom:1mm;}'+
    '.dp-store-addr{font-size:8.5pt;color:#444;}'+
    '.dp-logo{height:24pt;width:auto;flex-shrink:0;margin-left:8mm;}'+
    '.dp-title{font-size:13pt;font-weight:700;text-align:center;letter-spacing:.04em;margin:2mm 0 1mm;}'+
    '.dp-sub{font-size:9pt;text-align:center;color:#444;margin-bottom:4mm;}'+
    '.dp-meta{width:100%;border-collapse:collapse;margin-bottom:3.5mm;}'+
    '.dp-meta td{padding:.6mm 0;font-size:9pt;vertical-align:top;line-height:1.35;}'+
    '.dp-meta td:first-child{width:42mm;font-weight:600;}'+
    '.dp-note{border:1px solid #bbb;border-radius:1.5mm;padding:2mm 2.5mm;font-size:8.5pt;margin-bottom:3.5mm;}'+
    '.dp-tbl{width:100%;border-collapse:collapse;margin-bottom:4mm;table-layout:fixed;}'+
    /* overflow-wrap:break-word чупи ПО ДУМИ и слиза до буквите само когато една
       дума сама по себе си не се побира. word-break:break-all би нарязал всяко
       наименование по средата на думата.
       box-sizing:border-box е задължително при table-layout:fixed - без него
       padding-ът се ДОБАВЯ върху зададената ширина и колоните излизат извън
       листа, тоест последната се отрязва. (Заварената грешка беше при
       страничен padding 1.6mm: 10 × 3.2mm = 32mm надхвърляне. Сега padding-ът
       е 0.8mm, значи 1.6mm на колона - числото се е сменило, изводът не.) */
    /* white-space:normal бие глобалното th{white-space:nowrap} от index.html
       (ред 67). Печатът се рендира В страницата, тоест наследява целия ѝ CSS -
       без това заглавия като "Тип на решение" отказват да се пречупят и
       изпъпват извън клетките си. Глобалното правило не се пипа: то обслужва
       всички останали таблици в портала. */
    /* Страничният padding е 0.8mm, не 1.6mm. При box-sizing:border-box той се
       ВАДИ от зададената ширина: 13mm колона оставаше с 9.8mm полезни, а
       „Стокова" при 7.5pt иска ~9.5mm - overflow-wrap:break-word тогава реже
       по средата на думата („Стоков|а", „Получ|ено", „Изпълн|ил"). 0.8mm
       връща по 1.6mm на всяка колона, без да мести нито една ширина.
       Вертикалният 1.2mm не се пипа - той не участва в тази сметка.
       Потвърдено на реален print preview, не изчислено на теория. */
    '.dp-tbl th{box-sizing:border-box;border:1px solid #999;padding:1.2mm 0.8mm;font-size:7.5pt;text-align:left;background:#eee;font-weight:700;white-space:normal;word-break:normal;overflow-wrap:break-word;}'+
    '.dp-tbl td{box-sizing:border-box;border:1px solid #bbb;padding:1.2mm 0.8mm;font-size:8pt;vertical-align:top;word-break:normal;overflow-wrap:break-word;}'+
    /* Възстановява долната граница на последния ред. index.html:69 има
       tr:last-child td{border-bottom:none}, което бие ".dp-tbl td" по
       специфичност (0,1,2 срещу 0,1,1) и оставя рамката на таблицата отворена
       отдолу. Тук специфичността е изравнена, а правилото идва по-късно. */
    '.dp-tbl tr:last-child td{border-bottom:1px solid #bbb;}'+
    '.dp-num{text-align:right;}'+
    /* Датата под името е ЕДНА стойност - „28.08.2026 14:32", счупена като
       „28.08.202|6", не значи нищо. nowrap я оставя цяла или я реже накрая,
       което поне се чете. Само този клас: .dp-sub (подзаглавието на цялата
       бланка) е друго нещо и нарочно се пречупва. */
    '.p-sub{font-size:7pt;color:#555;white-space:nowrap;}'+
    /* Имената в „Решил"/„Изпълн." са на 7pt, не на 8pt като останалите
       клетки: при 8pt „Цветелина" иска повече от наличните 13.4mm и се
       чупеше като „Цветелин|а". Датата отдолу вече е 7pt (.p-sub), тоест
       двата реда сега са с един размер. */
    '.dp-who{font-size:7pt;}'+
    '.dp-sec{font-size:9.5pt;font-weight:700;margin:0 0 2mm;}'+
    '.dp-photos{display:flex;flex-wrap:wrap;gap:3mm;margin-bottom:4mm;}'+
    '.dp-photos img{width:40mm;height:auto;border:1px solid #ccc;}'+
    '.dp-files{font-size:8.5pt;margin-bottom:4mm;}'+
    '.dp-sign{display:flex;flex-wrap:wrap;gap:6mm;border-top:1px dotted #999;padding-top:3mm;margin-top:2mm;}'+
    '.dp-sign-item{flex:1 1 40mm;font-size:8.5pt;}'+
    '.dp-dots{border-bottom:1px dotted #555;height:6mm;margin-bottom:1mm;}';

  var rowsHtml = lines.map(function(l,i){
    var att = normSDAttachments(l.attachments).length;
    return '<tr class="dp-row">'+
      '<td class="dp-num">'+(i+1)+'</td>'+
      '<td>'+esc(l.material_code||'')+'</td>'+
      '<td>'+esc(l.material_name||'')+'</td>'+
      '<td class="dp-num">'+(l.quantity!=null?l.quantity:'—')+'</td>'+
      /* !=null, не истинност: 0 е валидно количество и трябва да се отпечата
         като 0, а не да падне в тирето. */
      (printSupplierDoc?'<td class="dp-num">'+(l.quantity_supplier_doc!=null?l.quantity_supplier_doc:'—')+'</td>':'')+
      '<td class="dp-num">'+(l.quantity_received!=null?l.quantity_received:'—')+'</td>'+
      '<td>'+(l.type?(TYPE_LABELS[l.type]||l.type):'—')+'</td>'+
      '<td>'+statusText(l)+'</td>'+
      '<td class="dp-who">'+whoWhen(l.resolved_by,l.resolved_at)+'</td>'+
      '<td class="dp-who">'+whoWhen(l.completed_by,l.completed_at)+'</td>'+
      '<td>'+esc(l.comment||'')+(att?' 📎'+att:'')+'</td>'+
    '</tr>';
  }).join('');

  wrap.innerHTML =
    '<style>'+PRINT_CSS+'</style>'+
    '<div style="max-width:820px;margin:0 auto;padding:16px 16px 40px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Бланка за разлики</div>'+
        '<div style="display:flex;gap:8px;align-items:center;">'+
          '<span id="dp-imgwait" style="font-size:12px;color:#d97706;">⏳ Снимките още се зареждат</span>'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / Запази PDF</button>'+
          '<button onclick="showModule(\'stock-diff\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
        '</div>'+
      '</div>'+
      '<div class="dp-wrap">'+
        '<div class="dp-head">'+
          '<div>'+
            '<div class="dp-store-name">'+esc(rep.store_name||'')+'</div>'+
            (si.addr?'<div class="dp-store-addr">'+esc(si.addr)+(si.phone?' &nbsp;&nbsp; '+esc(si.phone):'')+'</div>':'')+
          '</div>'+
          '<img src="'+DIFF_PRINT_LOGO+'" class="dp-logo" alt="TeMAX">'+
        '</div>'+
        '<div class="dp-title">БЛАНКА ЗА РАЗЛИКИ</div>'+
        '<div class="dp-sub">'+diffDirPrintSub(rep.direction)+'</div>'+
        '<table class="dp-meta">'+
          '<tr><td>'+diffDirCounterpartLabel(rep.direction)+':</td><td>'+esc(rep.counterpart||'—')+'</td></tr>'+
          '<tr><td>Документ №:</td><td>'+(rep.no_document?'няма (стока без документ)':esc(rep.document_number||'—'))+'</td></tr>'+
          '<tr><td>Дата на документа:</td><td>'+fmtDate(rep.doc_date)+'</td></tr>'+
          '<tr><td>Подал:</td><td>'+esc(rep.submitted_by||'—')+'</td></tr>'+
          '<tr><td>Дата на подаване:</td><td>'+sdFmtDateTime(rep.created_at)+'</td></tr>'+
        '</table>'+
        (genComment?'<div class="dp-note"><b>Общ коментар:</b> '+esc(genComment)+'</div>':'')+
        '<table class="dp-tbl">'+
          /* Фиксирани ширини, сума точно 190mm (= полезната ширина на A4 при
             10mm полета). С table-layout:fixed браузърът ги спазва дословно,
             вместо да преразпределя колоните според съдържанието - но само
             защото клетките са с box-sizing:border-box (виж PRINT_CSS).
             Без него сумата тук е подвеждаща: реалната ширина беше 222mm.
             ДВА набора, според printSupplierDoc - и двата сумират 190mm:
               10 колони:  8+18+44+11   +13+22+20+15+15+24 = 190
               11 колони:  8+18+36+11+13+13+20+19+15+15+22 = 190
             Загубените 13mm за новата колона са взети от Наименование (-8),
             Тип на решение (-2), Статус (-1) и Коментар (-2), а не от една
             колона - иначе тя става неизползваемо тясна. Надхвърляне на
             190mm НЕ изглежда като грешка: последната колона просто се
             отрязва тихо. Сумите са заковани в
             tests/diff-print-supplier-col.test.js. */
          '<thead><tr>'+
            '<th style="width:8mm;">№</th>'+
            '<th style="width:18mm;">SAP</th>'+
            '<th style="width:'+(printSupplierDoc?'36':'44')+'mm;">Наименование</th>'+
            /* Думата се сменя според посоката (Кол./Фактура). th е с
               white-space:normal, така че по-дългият етикет се пречупва
               вътре в клетката си, вместо да изпъпва навън. */
            '<th style="width:11mm;">'+pQty.printDoc+'</th>'+
            (printSupplierDoc?'<th style="width:13mm;">Стокова</th>':'')+
            '<th style="width:13mm;">'+pQty.printReal+'</th>'+
            '<th style="width:'+(printSupplierDoc?'20':'22')+'mm;">Тип на решение</th>'+
            '<th style="width:'+(printSupplierDoc?'19':'20')+'mm;">Статус</th>'+
            '<th style="width:15mm;">Решил</th>'+
            /* Съкратено САМО тук. Таблицата на екрана, имейлът и подписният
               блок долу остават с пълната дума - там място има. */
            '<th style="width:15mm;">Изпълн.</th>'+
            '<th style="width:'+(printSupplierDoc?'22':'24')+'mm;">Коментар</th>'+
          '</tr></thead>'+
          '<tbody>'+(rowsHtml||'<tr><td colspan="'+(printSupplierDoc?11:10)+'" style="text-align:center;color:#666;">Няма редове по тази бланка.</td></tr>')+'</tbody>'+
        '</table>'+
        (imgs.length?'<div class="dp-sec">Снимки към бланката ('+imgs.length+')</div>'+
          '<div class="dp-photos" id="dp-photos">'+imgs.map(function(p){
            return '<img src="'+esc(p.url)+'" alt="'+esc(p.name||'снимка')+'">';
          }).join('')+'</div>':'')+
        (files.length?'<div class="dp-sec">Прикачени документи ('+files.length+')</div>'+
          '<div class="dp-files">'+files.map(function(p,i){
            return (i+1)+'. '+esc(p.name||p.url);
          }).join('<br>')+'</div>':'')+
        /* Пунктирът е за подпис на ръка - имената от базата вече са в
           таблицата, тук не се дублират. */
        '<div class="dp-sign">'+
          ['Подал','Решил','Изпълнил','Приел'].map(function(role){
            return '<div class="dp-sign-item"><div class="dp-dots"></div>'+role+': ......................<br>Дата: ....................</div>';
          }).join('')+
        '</div>'+
      '</div>'+
    '</div>';

  /* Индикаторът изчезва чак когато и последната снимка е дошла (или е паднала -
     иначе един счупен URL го оставя да виси завинаги). Ако снимки няма, се
     маха веднага. */
  var note = document.getElementById('dp-imgwait');
  if(!note) return;
  var imgEls = wrap.querySelectorAll('#dp-photos img');
  var pending = imgEls.length;
  if(!pending){ note.style.display='none'; return; }
  var done = function(){ pending--; if(pending<=0) note.style.display='none'; };
  Array.prototype.forEach.call(imgEls, function(im){
    if(im.complete){ done(); return; }
    im.onload = done; im.onerror = done;
  });
}

var SD_BADGE_POLL_MS = 60000;
var _sdBadgePoll = null;
var _sdVisBound = false;
var _sdPulseCount = null; /* броят от последния пулс; null = още няма пулс след логин (виж sdBadgePulse) */

function sdTabBadgeEl(){
  var tab = document.getElementById('tab-stock-diff');
  if(!tab) return null;
  var b = document.getElementById('badge-stock-diff');
  if(!b){
    if(!tab.style.position) tab.style.position = 'relative';
    b = document.createElement('span');
    b.id = 'badge-stock-diff';
    b.style.cssText = 'position:absolute;top:2px;right:4px;min-width:16px;height:16px;padding:0 4px;'+
      'background:#dc2626;color:#fff;border-radius:20px;font-size:10px;font-weight:700;line-height:16px;'+
      'text-align:center;display:none;pointer-events:none;box-shadow:0 0 0 2px #0f172a;';
    tab.appendChild(b);
  }
  return b;
}
function sdSetTabBadge(n){
  var b = sdTabBadgeEl();
  if(!b) return;
  if(n > 0){ b.textContent = n > 99 ? '99+' : String(n); b.style.display = 'block'; }
  else { b.style.display = 'none'; }
}
/* Брои от вече заредените в паметта данни - използва се след всеки рендер,
   за да не изостава балончето спрямо това, което потребителят вижда. */
function sdUnreviewedCountFor(reports, lines){
  if(!currentUser) return 0;
  var unrev = (reports||[]).filter(function(r){ return !r.reviewed; });
  if(isLogisticsWarehouseUser()){
    return unrev.filter(function(r){
      if(r.counterpart !== currentUser.store_name) return false;
      /* Бланката чака склада, ако има ред без отговор от него ИЛИ ред, по
         който магазинът вече е отговорил на обратното движение (пуснато в SAP
         -> складът да приеме; няма наличност -> складът да оправи
         наличността) и редът още не е приключен. */
      var repLines = (lines||[]).filter(function(x){ return x.report_id===r.id; });
      if(!repLines.length) return true;
      return repLines.some(function(l){
        if(!l.warehouse_response) return true;
        return (l.store_response==='sap_done' || l.store_response==='no_stock') && l.status!=='received';
      });
    }).length;
  }
  if(canReviewDiff()) return unrev.length;
  /* Магазин - "чака МОЕТО действие", не "всички мои неприключени" (това беше
     постоянен шум). Бланка се брои, ако има ред, по който складът е отговорил
     с изпратено/обратно движение, а магазинът още не (store_response null) и
     редът не е приключен. no_stock не се брои - там магазинът чака склада;
     will_send също - стоката още не е тръгнала. Доставчиковите бланки чакат
     Цвети. Само своите обекти: сървърната заявка е по store_name, но при
     няколко назначени обекта филтрираме и тук. */
  var mine = assignedStores();
  return unrev.filter(function(r){
    if(mine && mine.indexOf(r.store_name) < 0) return false;
    return (lines||[]).some(function(l){
      return l.report_id===r.id && (l.warehouse_response==='sent' || l.warehouse_response==='return') &&
        !l.store_response && l.status!=='received';
    });
  }).length;
}
function sdUpdateTabBadgeFromData(){
  sdSetTabBadge(sdUnreviewedCountFor(diffReports, sdData));
}
/* Пулсът задава балончето и известява, ако броят е ПОРАСНАЛ спрямо предишния
   пулс. Първият пулс след логин (_sdPulseCount===null) само запомня - иначе
   всяко влизане би звъняло за вече известните бланки. Спад или равен брой -
   тихо. Паметта е само в тази сесия, нарочно не в localStorage.
   Рендерът (sdUpdateTabBadgeFromData) не пипа паметта - сравнението е пулс
   срещу пулс, за да не звъни от собствения клик на потребителя.
   ИЗВЕСТЕН КОМПРОМИС (решение 15.09.2026): sbGet() връща [] и при грешка, тоест
   провалено четене не се различава от празен резултат. Паднал пулс запомня
   0, а следващият успешен изглежда като ръст и звъни веднъж излишно. Това
   идва веднага след видимия toast "Грешка при зареждане" от самия sbGet.
   sbGet НЕ се пипа заради това - споделена е в ~20 файла и рискът от промяна
   там е по-голям от една излишна нотификация. */
function sdBadgePulse(n){
  sdSetTabBadge(n);
  var prev = _sdPulseCount;
  _sdPulseCount = n;
  if(prev===null || n<=prev) return;
  if(typeof coNotifyToast==='function'){
    coNotifyToast('🔔 Разлики: '+n+(n===1?' бланка чака':' бланки чакат')+' вашата реакция', '', 'Отвори Разлики',
      function(){ if(typeof showModule==='function') showModule('stock-diff'); });
  }
  if(typeof playSound==='function') playSound();
}
/* Самостоятелна лека заявка - работи и когато табът "Разлики" изобщо не е
   отварян тази сесия (тогава diffReports/sdData са празни). */
function sdRefreshTabBadge(){
  if(!currentUser) return;
  /* Скрит таб (друг раздел или минимизиран прозорец) - не питаме сървъра.
     Пулсът е на 60 сек и тече във всяка отворена сесия, така че фоновите
     раздели дават основната част от трафика към differences_reports.
     Слушателят в startSDBadgePolling() опреснява веднага щом табът стане
     видим, затова балончето не изостава. */
  if(document.hidden) return;
  var q = 'select=id,store_name,counterpart,reviewed&reviewed=eq.false';
  var qLines = 'select=report_id,warehouse_response,store_response,status';
  if(isLogisticsWarehouseUser()){
    q += '&counterpart=eq.' + encodeURIComponent(currentUser.store_name);
  } else if(!canReviewDiff()){
    q += storeQ();
  }
  sbGet('differences_reports', q).then(function(reports){
    if(!Array.isArray(reports)){ return; }
    /* Цвети/admin броят бланки - редовете не им трябват. */
    if(canReviewDiff() && !isLogisticsWarehouseUser()){
      sdBadgePulse(sdUnreviewedCountFor(reports, []));
      return;
    }
    /* Складът и магазинът броят "чака моето действие" - трябват и редовете. */
    if(!reports.length){ sdBadgePulse(0); return; }
    sbGet('stock_differences', qLines + '&report_id=in.(' + reports.map(function(r){return r.id;}).join(',') + ')')
      .then(function(lines){
        sdBadgePulse(sdUnreviewedCountFor(reports, Array.isArray(lines)?lines:[]));
      }).catch(function(){ sdSetTabBadge(reports.length); });
  }).catch(function(){});
}
function startSDBadgePolling(){
  if(_sdBadgePoll) clearInterval(_sdBadgePoll);
  /* Нов логин (и без презареждане) - първият пулс пак само запомня. */
  _sdPulseCount = null;
  sdRefreshTabBadge();
  _sdBadgePoll = setInterval(sdRefreshTabBadge, SD_BADGE_POLL_MS);
  /* Закача се само веднъж. startSDBadgePolling() може да се извика повторно
     (нов логин без презареждане на страницата), а втори слушател би значел по
     две заявки при всяко връщане към таба - точно обратното на целта. */
  if(!_sdVisBound){
    _sdVisBound = true;
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) sdRefreshTabBadge();
    });
  }
}
/* Закачаме се за startApp (както прави notifications.js) - стартира се след
   логин, за всяка роля. Този файл се зарежда ПРЕДИ notifications.js, така че
   веригата от обвивки остава коректна. */
if(typeof startApp === 'function'){
  var _sdOrigStartApp = startApp;
  startApp = function(){
    _sdOrigStartApp();
    setTimeout(startSDBadgePolling, 2500);
  };
}
