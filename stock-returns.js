/* stock-returns.js — Стока за връщане */

var srData   = [];
/* Storage за снимки на товарителница/документ при връщане - преизползва
   същия bucket като модул "Разлики", отделен префикс на пътя */
var SR_SB    = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var SR_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var SR_BKT   = 'bulletin-files';
var srPendingPhotos = []; /* снимки, качени в текущо отворения модал, преди submit */
var srFilter = 'pending';
var srEditId = null;
var srTab    = 'diff'; /* 'diff' = по разлики (автоматично) | 'complaint' = по рекламации/срок на годност */
var srSearch = '';
var srStoreFilter = '';
/* Приключил ли е импорт в отворения в момента модал. Държи се извън него,
   защото затварянето може да стане по няколко пътя, а презареждането трябва
   да се случи по всеки от тях - и точно веднъж. */
var srImportFinished = false;
/* Точен филтър по доставчик - в "По рекламации" доставчиците са 46, тоест
   чипове като при магазините биха заели половин екран. Оттук и падащото меню. */
var srSupplierFilter = '';
function setSRStoreFilter(val){ srStoreFilter=val; renderStockReturns(); }
function setSRSupplierFilter(val){ srSupplierFilter=val||''; renderStockReturns(); }
/* Двата подтаба са различни набори и доставчици, и магазини - запазен избор от
   другия таб би дал празен екран. */
function setSRTab(t){ srTab=t; srEditId=null; srStoreFilter=''; srSupplierFilter=''; renderStockReturns(); }
/* Пре-рендира при търсене, но запазва фокуса/позицията на курсора в полето */
function setSRSearch(val){
  srSearch=val;
  var hadFocus = document.activeElement && document.activeElement.id==='sr-search-input';
  var cursorPos = hadFocus ? document.activeElement.selectionStart : null;
  renderStockReturns();
  if(hadFocus){
    var el=document.getElementById('sr-search-input');
    if(el){ el.focus(); if(cursorPos!=null) el.setSelectionRange(cursorPos,cursorPos); }
  }
}

/* ═══ КОЙ ПОСТАВИ „ДАТА ПОТВЪРДЕНА АКТУАЛИЗАЦИЯ" (02.10.2026) ══════════════
   confirmed_date се пише по ЧЕТИРИ пътя и само един е обектът — ръчната форма.
   Другите три са Excel импорти, достъпни единствено на офиса (canAddSR), и
   ПРЕЗАПИСВАТ съществуващи редове; многолистовият дори изтрива датата при
   празна клетка („файлът е авторитетен за тези колони").

   Автоматичното отмятане на „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" брои САМО
   актуализация, направена от самия обект. Без следа кой я е направил, файл,
   качен от офиса в сряда сутрин, щеше да отметне обектите наготово — тоест
   автоматиката щеше да произведе същата лъжа като ръчната отметка.

   Следата се пише САМО когато датата наистина се променя: иначе всеки импорт
   би „освежавал" чужда актуализация и колоната би станала безполезна.
   Виж stock-returns-confirmed-by-schema.sql. */
function srSameDate(a, b){
  var x=a?String(a).slice(0,10):null, y=b?String(b).slice(0,10):null;
  return x===y;
}
/* Кой пише при РЪЧНАТА форма: потребител на самия обект → 'store:<обект>',
   всеки друг (офис, логистика, admin) → 'office:<име>'. Решава store_name на
   РЕДА, не ролята: управител, който редактира чужд обект, не е този обект. */
function srConfirmedActor(storeName){
  var me=currentUser||{};
  var mine=me.store_name && storeName && String(me.store_name)===String(storeName);
  return mine ? ('store:'+storeName) : ('office:'+(me.display_name||me.email||'?'));
}
/* Полетата за записа — или празен обект, ако датата не се мени. newDate може
   да е null (изтриване): следата пак се пише, защото изтриването е промяна. */
function srConfirmedTrace(oldDate, newDate, actor){
  if(srSameDate(oldDate, newDate)) return {};
  return { confirmed_by: actor, confirmed_at: new Date().toISOString() };
}
/* Двата импорта пишат 'import:<име>' — и когато ИЗТРИВАТ датата. */
function srImportActor(){
  var me=currentUser||{};
  return 'import:'+(me.display_name||me.email||'?');
}
/* ОТСТЪПВА ЛИ ИМПОРТЪТ пред потвърждение на обекта (решение от 02.10.2026).
   Файлът на офиса е авторитетен за всичко останало, но НЕ бива да изтрива или
   да връща назад актуализация, която обектът е направил сам: точно по нея се
   отмята задачата „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ", а файлът често се подготвя
   по-рано и носи стара или празна стойност.

   Запазва се САМО когато редът е потвърден от ОБЕКТА (confirmed_by 'store:…')
   и файлът носи ПО-СТАРА дата или празна клетка. По-нова дата от файла се
   пише нормално — тя е нова информация, не връщане назад.
   Еднаква дата не е „запазване": нищо не се променя и не бива да влиза в
   брояча, който се показва на Цвети. */
function srImportKeepsDate(hit, fileDate){
  if(!hit) return false;
  if(String(hit.confirmed_by||'').indexOf('store:')!==0) return false;
  var oldD=hit.confirmed_date?String(hit.confirmed_date).slice(0,10):null;
  if(!oldD) return false;
  var newD=fileDate?String(fileDate).slice(0,10):null;
  return !newD || newD < oldD;
}

/* ═══════ „БЕЗ АКТУАЛИЗАЦИЯ ОТ ПОНЕДЕЛНИК" ═══════════════════════════════
   Ръчната отметка на постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" вече я
   няма — базата я слага сама. Затова ТУК трябва да се вижда какво остава, и
   то по СЪЩОТО правило, иначе екранът обещава едно, а Бюлетинът показва
   друго: невзет запис се брои за актуализиран само когато датата е в
   прозореца понеделник→днес И е поставена ОТ САМИЯ ОБЕКТ.
   Горната граница е ДНЕС, а не денят на срока: надписът казва какво остава
   днес. Бъдеща дата затова също не се зачита. */
var SR_AUTO_START='2026-10-05';   /* = v_start в stock_returns_sync_completions */

/* Понеделникът на седмицата на todayISO. Смята се с местни дати (new Date от
   'YYYY-MM-DD' + T00:00:00), не с UTC — иначе след 21:00 българско време
   денят подскача и прозорецът се мести с един ден. */
function srWeekStartISO(todayISO){
  var d=new Date((todayISO||today())+'T00:00:00');
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  var m=d.getMonth()+1, dd=d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd;
}
/* Преди седмицата с понеделник SR_AUTO_START правилото не важи и броячът
   мълчи: иначе още сега щеше да покаже 221 „неактуализирани" записа за
   седмица, в която никой нищо не дължи. */
function srAutoActive(todayISO){ return srWeekStartISO(todayISO) >= SR_AUTO_START; }

function srUpdatedByStore(r, monISO, todayISO){
  var d=(r&&r.confirmed_date)?String(r.confirmed_date).slice(0,10):null;
  if(!d || d<monISO || d>todayISO) return false;
  return String((r&&r.confirmed_by)||'') === ('store:'+((r&&r.store_name)||''));
}
function srNeedsUpdate(r, monISO, todayISO){
  if(!r || (r.status||'pending')!=='pending') return false;
  return !srUpdatedByStore(r, monISO, todayISO);
}

/* Кой е поставил датата — за малкия надпис в реда и във формата. Форматът е
   '<вид>:<кой>' и се пише от submitSR и от двата импорта. Заварен ред
   (confirmed_by NULL) няма надпис: не се знае, а измисленото е по-лошо. */
function srConfirmedWho(r){
  var by=String((r&&r.confirmed_by)||'');
  if(!by) return null;
  var i=by.indexOf(':');
  var kind=i<0?by:by.slice(0,i), who=i<0?'':by.slice(i+1);
  if(kind==='store')  return {label:'потвърдено от обекта', who:who, color:'#16a34a'};
  if(kind==='office') return {label:'потвърдено от офиса',  who:who, color:'#b45309'};
  if(kind==='import') return {label:'от импорт',            who:who, color:'#b45309'};
  return {label:'от '+kind, who:who, color:'#64748b'};
}
/* Датата в надписа е confirmed_at (КОГА е записано), не confirmed_date —
   самата дата си стои в съседната колона и повтарянето ѝ не казва нищо. */
function srConfirmedNote(r){
  var w=srConfirmedWho(r);
  if(!w) return '';
  var at=(r&&r.confirmed_at)?fmtDate(String(r.confirmed_at).slice(0,10)):'';
  return w.label+(at?' '+at:'');
}
function srConfirmedNoteHtml(r){
  var w=srConfirmedWho(r);
  if(!w) return '';
  return '<div class="sr-cby" title="'+escAttr(w.label+(w.who?' — '+w.who:''))+
         '" style="font-size:10px;color:'+w.color+';white-space:nowrap;margin-top:2px;">'+
         esc(srConfirmedNote(r))+'</div>';
}

/* Само Цветелина (контролинг) или admin могат да маркират запис като
   "Приключена" - финален статус, различен от обикновеното "Взета". */
function canCompleteSR() {
  if (!currentUser) return false;
  if ((currentUser.email||'').toLowerCase() === 'c.teneva@temax.bg') return true;
  return currentUser.role === 'admin';
}
function canEditSR() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
function canAddSR() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}

/* Решението по реда в "Разлики" за връщанията, дошли оттам (diff_line_id).
   Отделна заявка, не embed: stock_returns.diff_line_id НЯМА външен ключ към
   stock_differences, а PostgREST вгражда само по външен ключ - нов ключ би бил
   схемна промяна. Заявката е една, само за редовете с diff_line_id, и я няма
   изобщо, когато такива няма.
   Флаг се слага САМО на ред, чиято разлика е ДОШЛА с тип различен от 'return'.
   sbGet връща [] и при грешка - липсващ отговор не бива да изглежда като
   "решението е сменено", нито изтрита разлика (за нея стои отделно, извън
   тази проверка). */
var srDiffTypes = {};
/* id-та на заявка. 100 × 37 знака (uuid + запетая) + основата ≈ 3,8 KB URL —
   далеч под тавана на гейтуея. Същият размер като порциите в transit.js. */
var SR_DIFF_CHUNK = 100;
/* ПОРЦИИ, не един списък: id-тата растат с всяко решение „Връщане" (15 към
   27.09.2026) и един ден биха направили URL-а по-дълъг от тавана — точно това
   се случи в Разлики с ~45 KB адрес и 400 (c8d0cd0). Филтър по друг признак
   (обект/статус/период) НЕ върши работа тук: без id-та единствената
   алтернатива е „всички редове, които не са Връщане" — 646 от 665 реда днес и
   +597 за последните 30 дни, тоест теглим цялата история, за да проверим 15
   реда. Затова порции с точните id-та.
   Заявките са ПОСЛЕДОВАТЕЛНИ (както в transit.js) — не заливаме гейтуея.
   Паднала порция не отменя останалите: картата остава непълна, но за реда без
   отговор просто няма етикет (srDecisionChanged гледа наличието на ключ), а
   потребителят вижда червен toast, не тишина. */
function srLoadDiffTypes(){
  srDiffTypes = {};
  var ids = [];
  srData.forEach(function(r){ if(r.diff_line_id && ids.indexOf(r.diff_line_id)<0) ids.push(r.diff_line_id); });
  if(!ids.length) return Promise.resolve();
  var chunks = [];
  for(var i=0;i<ids.length;i+=SR_DIFF_CHUNK) chunks.push(ids.slice(i,i+SR_DIFF_CHUNK));
  var failed = 0;
  return chunks.reduce(function(p, part){
    return p.then(function(){
      return sbGetOk('stock_differences','select=id,type&id=in.('+part.join(',')+')').then(function(res){
        if(!res.ok){
          failed++;
          try{ console.error('srLoadDiffTypes: '+res.url+' → '+(res.status||'мрежов срив')+': '+res.error); }catch(e){}
          return;
        }
        res.rows.forEach(function(x){ srDiffTypes[x.id] = x.type; });
      });
    });
  }, Promise.resolve()).then(function(){
    if(failed){
      toast('Решенията по разликите не се заредиха'+
        (chunks.length>1 ? ' ('+failed+' от '+chunks.length+' пакета)' : ''),'#dc2626');
    }
  });
}
function srDecisionChanged(r){
  return !!r && !!r.diff_line_id && Object.prototype.hasOwnProperty.call(srDiffTypes, r.diff_line_id) &&
    srDiffTypes[r.diff_line_id] !== 'return';
}
function loadStockReturns() {
  var wrap = document.getElementById('mod-stock-returns');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  sbGet('stock_returns', 'order=doc_date.desc' + storeQ()).then(function(data) {
    srData = Array.isArray(data) ? data : [];
    return srLoadDiffTypes();
  }).then(function(){
    renderStockReturns();
  }).catch(function(err) {
    var w = document.getElementById('mod-stock-returns');
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
    console.error(err);
  });
}

/* Редовете, които в момента се виждат на екрана - активният подтаб плюс всички
   филтри. Изнесено от renderStockReturns(), защото Excel износът трябва да дава
   ТОЧНО видяното: два отделни списъка неминуемо се разминават, а разминаването
   се забелязва чак когато доставчикът получи грешния файл. */
function srFilteredList(){
  var tabData = srData.filter(function(r){ return (r.source||'diff') === srTab; });
  var list = tabData.filter(function(r) {
    if (srFilter === 'pending')  { if (r.status !== 'pending') return false; }
    else if (srFilter === 'taken') { if (r.status !== 'taken') return false; }
    else if (srFilter === 'completed') { if (r.status !== 'completed') return false; }
    /* „Без актуализация" е подмножество на невзетите — srNeedsUpdate сам
       отсява статуса, затова тук няма втора проверка. */
    else if (srFilter === 'needs') { if (!srNeedsUpdate(r, srWeekStartISO(), today())) return false; }
    /* Точните филтри по магазин и доставчик са ОТДЕЛНИ от свободното търсене
       по-долу, за да не се влияят от текст в коментари/причини, споменаващи
       друг магазин или друга фирма (напр. коментар "изпратено към ЛС
       Търговище" не бива да кара запис на друг магазин да се показва при
       филтър "Търговище"). */
    if (srStoreFilter && r.store_name !== srStoreFilter) return false;
    if (srSupplierFilter && r.supplier !== srSupplierFilter) return false;
    if (srSearch) {
      var q = srSearch.toLowerCase();
      var hay = [r.store_name,r.supplier,r.product_name,r.sap_code,r.order_number,r.purchase_order,r.id_euro,r.reason,r.control_comment,r.controller_comment,r.store_comment,r.courier_info].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  /* "По рекламации" се чете по ПВ-ЕВР от най-стария към най-новия номер,
     независимо от датите (заявката идва с order=doc_date.desc заради
     "По разлики" - той остава точно така). Тук, а не в таблицата, за да
     важи еднакво и за exportSRExcel(). Редове без ПВ-ЕВР - най-отдолу. */
  if (srTab !== 'diff') {
    list.sort(function(a, b) {
      var pa = String(a.purchase_order == null ? '' : a.purchase_order).trim();
      var pb = String(b.purchase_order == null ? '' : b.purchase_order).trim();
      if (!pa || !pb) return (pa ? 0 : 1) - (pb ? 0 : 1);
      if (/^\d+$/.test(pa) && /^\d+$/.test(pb)) return Number(pa) - Number(pb);
      return pa.localeCompare(pb);
    });
  }
  return list;
}

function renderStockReturns() {
  var wrap = document.getElementById('mod-stock-returns');
  if (!wrap) return;
  var isAdmin = currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
  var canEdit = canEditSR();
  var canAdd  = canAddSR();

  var tabData = srData.filter(function(r){ return (r.source||'diff') === srTab; });
  var list = srFilteredList();

  var pending = tabData.filter(function(r){ return r.status==='pending'; }).length;
  var taken   = tabData.filter(function(r){ return r.status==='taken'; }).length;
  var completed = tabData.filter(function(r){ return r.status==='completed'; }).length;

  /* „Без актуализация от понеделник" — по правилото, по което базата отмята
     задачата. Брои се и в ДРУГИЯ подтаб: задачата гледа всички невзети
     записи на обекта, а човек, който е изчистил „По разлики", иначе би
     решил, че е готов, и би чакал отметка, която няма да дойде. */
  var srToday = today(), srMon = srWeekStartISO(srToday);
  var srAutoOn = srAutoActive(srToday);
  var needs = tabData.filter(function(r){ return srNeedsUpdate(r, srMon, srToday); }).length;
  var needsOther = srData.filter(function(r){
    return (r.source||'diff') !== srTab && srNeedsUpdate(r, srMon, srToday);
  }).length;

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📦 Стока за връщане</div>';
  h += '<div style="display:flex;gap:8px;">';
  if (canAdd) h += '<button onclick="openSRModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
  /* Импортът е и в двата подтаба - всеки със свой формат (виж startReturnsImport). */
  if (canAdd) h += '<button onclick="openReturnsImportModal()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📤 Импорт от Excel</button>';
  h += '</div></div>';

  /* Подтабове */
  h += '<div style="display:flex;gap:0;margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;max-width:560px;">';
  [['diff','🔄 По разлики'],['complaint','📋 По рекламации / срок на годност']].forEach(function(t){
    var a=srTab===t[0];
    h+='<button onclick="setSRTab(\''+t[0]+'\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:'+(a?'#2f2f2f':'#fff')+';color:'+(a?'#fff':'#64748b')+';">'+t[1]+'</button>';
  });
  h += '</div>';

  /* Търсене + табове по магазин - вече еднакво и за двата подтаба */
  var storesInTab=tabData.map(function(r){return r.store_name;}).filter(function(s,i,arr){return s&&arr.indexOf(s)===i;}).sort();
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">';
  h += '<input id="sr-search-input" value="'+escVal(srSearch)+'" oninput="setSRSearch(this.value)" placeholder="🔍 Търси по магазин, доставчик, артикул, SAP, поръчка, ПВ-ЕВР, ИД-ЕВРО..." style="flex:1;min-width:260px;max-width:460px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px;font-size:12.5px;font-family:inherit;">';
  h += '</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">';
  h += '<button onclick="setSRStoreFilter(\'\')" style="border:1px solid '+(!srStoreFilter?'#2563eb':'#e2e8f0')+';background:'+(!srStoreFilter?'#eff6ff':'#fff')+';color:'+(!srStoreFilter?'#2563eb':'#64748b')+';border-radius:20px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer;">🏪 Всички ('+tabData.length+')</button>';
  storesInTab.forEach(function(s){
    var cnt=tabData.filter(function(r){return r.store_name===s;}).length;
      var active=srStoreFilter===s;
      h += '<button onclick="setSRStoreFilter(\''+esc(s).replace(/'/g,"\\'")+'\')" style="border:1px solid '+(active?'#2563eb':'#e2e8f0')+';background:'+(active?'#eff6ff':'#fff')+';color:'+(active?'#2563eb':'#64748b')+';border-radius:20px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer;">'+esc(s)+' ('+cnt+')</button>';
    });
    h += '</div>';

  /* Падащо меню по доставчик. В "По рекламации" доставчиците са 46 - чипове
     като при магазините не стават. Празен доставчик не се предлага: опция
     без стойност би изглеждала като втори "Всички". */
  var suppliersInTab = tabData.map(function(r){ return r.supplier; })
    .filter(function(sp,i,arr){ return sp && String(sp).trim() && arr.indexOf(sp)===i; })
    .sort(function(a,b){ return String(a).localeCompare(String(b),'bg'); });
  h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">';
  h += '<label for="sr-supplier-select" style="font-size:11.5px;font-weight:600;color:#64748b;">Доставчик</label>';
  h += '<select id="sr-supplier-select" onchange="setSRSupplierFilter(this.value)" style="min-width:260px;max-width:420px;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12.5px;font-family:inherit;background:#fff;color:#0f172a;cursor:pointer;">';
  h += '<option value=""'+(srSupplierFilter?'':' selected')+'>-- Всички доставчици --</option>';
  suppliersInTab.forEach(function(sp){
    var cnt = tabData.filter(function(r){ return r.supplier===sp; }).length;
    h += '<option value="'+escAttr(sp)+'"'+(srSupplierFilter===sp?' selected':'')+'>'+esc(sp)+' ('+cnt+')</option>';
  });
  h += '</select></div>';

  /* Важна бележка */
  if (srTab==='diff') {
    h += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;">ℹ️ Записите тук се наливат автоматично, когато Цветелина маркира разлика като "Връщане" (излишък, получен в повече). Стоката се маркира като ВЗЕТА само след като е физически предадена на куриер/транспорт.</div>';
  } else {
    h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#856404;">⚠️ Стоката се маркира като ВЗЕТА само след като е физически предадена на куриер или транспорт.</div>';
  }

  /* Какво остава да се направи. Показва се чак от седмицата, в която
     правилото влиза в сила — дотогава щеше да обещава отметка, която базата
     още не прави. */
  if (srAutoOn) {
    var srAll = needs + needsOther;
    h += '<div style="background:'+(srAll?'#fef2f2':'#f0fdf4')+';border:1px solid '+(srAll?'#fecaca':'#bbf7d0')+';border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:'+(srAll?'#991b1b':'#166534')+';">'+
         (srAll
           ? '📝 <b>'+srAll+'</b> невзети записа все още нямат „Дата потвърдена актуализация" от '+fmtDate(srMon)+' насам.'
           : '✅ Всички невзети записи са актуализирани тази седмица.')+
         ' Задачата „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" в Бюлетина се отмята САМА, когато няма нито един такъв запис — ръчна отметка няма. Броят се двата подтаба заедно. Дата, поставена от офиса или от импорт, не се брои за актуализация на обекта.'+
         (needsOther?'<div id="sr-needs-other" style="margin-top:4px;font-weight:600;">+ '+needsOther+' в другия подтаб</div>':'')+
         '</div>';
  }

  /* Статус чипове (общият вид .chips) + Excel вдясно на същия ред. Атрибутът е data-sr-f
     (НЕ data-f — сблъсък с Разлики); числото е редовете на този статус в подтаба. */
  h += '<div id="sr-filters" class="filter-bar chips" style="margin:0 0 12px;">';
  h += '<span class="chips-label">Покажи:</span>';
  var srFilters=[['pending','⏳ Невзета',pending,'']];
  if (srAutoOn) srFilters.push(['needs','📝 Без актуализация',needs,'']);
  srFilters.push(['|'],['taken','✅ Взета',taken,' chip-hist'],['completed','🏁 Приключени',completed,' chip-hist'],['all','Всички',tabData.length,' chip-hist']);
  srFilters.forEach(function(f){
    if (f[0]==='|') { h += '<span class="chips-sep"></span>'; return; }
    var a = srFilter===f[0];
    h += '<button class="filter-btn'+f[3]+(a?' active':'')+'" data-sr-f="'+f[0]+'" onclick="setSRFilter(this.dataset.srF)">'+f[1]+' <span class="chips-n"'+(f[0]==='needs'?' id="sr-needs-n"':'')+'>'+f[2]+'</span></button>';
  });
  /* Показва се винаги, включително при празен списък - иначе изчезването на
     бутона изглежда като счупен екран. Празният случай се хваща вътре. */
  h += '<button onclick="exportSRExcel()" style="margin-left:auto;border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:40px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;">📥 Excel</button>';
  /* Втори износ само в „По рекламации": всички редове в ЕДИН лист (справка по
     доставчик). Многолистовият бутон отляво не се пипа. */
  if (srTab==='complaint') h += '<button onclick="exportSRExcel(true)" style="border:1px solid #16a34a;background:#fff;color:#16a34a;border-radius:40px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;">📥 Excel (един лист)</button>';
  h += '</div>';

  /* Таблица */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  } else if (srTab==='diff') {
    h += renderSRTableDiff(list, canEdit, isAdmin);
  } else {
    h += renderSRTableComplaint(list, canEdit, isAdmin);
  }
  h += '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">'+list.length+' от '+tabData.length+' записа.</div>';
  h += '</div>';
  h += srModalHtml();
  h += srImportModalHtml();
  wrap.innerHTML = h;
}

/* Общи клетки на компактните таблици (По разлики / По рекламации). Само за показване —
   Excel износът чете данните, не този HTML. */
function srLbl(label, val, extra) {
  if (val == null || val === '') return '';
  return '<div style="font-size:10.5px;color:#64748b;'+(extra||'')+'"><span style="color:#94a3b8;">'+label+'</span> '+esc(val)+'</div>';
}
/* Документ: Поръчка (само в „По разлики“ — в „По рекламации“ я няма и не се показва), ПВ-ЕВР, ИД-ЕВРО,
   дата докум., завод — всяко с кратък етикет, сиво, моно. */
function srDocCell(r, withOrder) {
  var mono = 'font-family:DM Mono,monospace;';
  var s = (withOrder ? srLbl('Пор.', r.order_number, mono) : '') + srLbl('ПВ-ЕВР', r.purchase_order, mono) + srLbl('ИД-ЕВРО', r.id_euro, mono) +
    (r.doc_date ? '<div style="font-size:10.5px;color:#64748b;'+mono+'"><span style="color:#94a3b8;">Док.</span> '+fmtDate(r.doc_date)+'</div>' : '') +
    srLbl('Завод', r.plant, mono);
  return '<td style="padding:7px 10px;">'+(s || '<span style="color:#94a3b8;">—</span>')+'</td>';
}
function srStoreSupplierCell(r) {
  return '<td style="padding:7px 10px;"><div style="font-weight:600;">'+esc(r.store_name||'')+'</div>'+
    '<div style="font-size:11px;color:#64748b;">'+esc(r.supplier||'')+'</div></td>';
}
/* Статус: баджът, отдолу дата изтегляне, „изтеглена с …“, „потвърдена акт. …“ + бележката за потвърждението. */
function srStatusCell(r) {
  var mono = 'font-family:DM Mono,monospace;';
  return '<td style="padding:7px 10px;">'+srStatusBadge(r)+
    (r.withdrawal_date ? '<div style="font-size:10.5px;color:#64748b;margin-top:3px;'+mono+'"><span style="color:#94a3b8;">изтеглена</span> '+fmtDate(r.withdrawal_date)+'</div>' : '')+
    (r.courier_info ? '<div style="font-size:10.5px;color:#374151;"><span style="color:#94a3b8;">изтеглена с</span> '+esc(r.courier_info)+'</div>' : '')+
    (r.confirmed_date ? '<div style="font-size:10.5px;color:#64748b;'+mono+'"><span style="color:#94a3b8;">потвърдена акт.</span> '+fmtDate(r.confirmed_date)+'</div>' : '')+
    srConfirmedNoteHtml(r)+'</td>';
}
/* Коментари: всяко непразно поле на свой ред С ЕТИКЕТ (преди беше reason||control||controller —
   не личеше кое поле е). */
function srCommentsCell(r) {
  var s = '';
  if (r.store_comment) s += '<div style="font-size:11px;color:#0f766e;"><b style="font-weight:600;">Обект:</b> '+esc(r.store_comment)+'</div>';
  if (r.reason) s += '<div style="font-size:11px;color:#d97706;font-weight:500;"><b style="font-weight:600;">Причина:</b> '+esc(r.reason)+'</div>';
  if (r.control_comment) s += '<div style="font-size:11px;color:#d97706;font-weight:500;"><b style="font-weight:600;">Контрол:</b> '+esc(r.control_comment)+'</div>';
  if (r.controller_comment) s += '<div style="font-size:11px;color:#7c3aed;font-weight:500;"><b style="font-weight:600;">Контролер:</b> '+esc(r.controller_comment)+'</div>';
  return '<td style="padding:7px 10px;">'+(s || '<span style="color:#cbd5e1;">—</span>')+'</td>';
}
function srTh(cols) {
  var h = '<thead><tr style="background:#f8fafc;">';
  cols.forEach(function(c){
    h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
  });
  return h + '</tr></thead>';
}

/* Таблица за подтаб "По разлики" - 6 колони: Артикул / Документ / Магазин · Доставчик / Статус / Коментари /
   Действия. Комбинира старите ERP полета (ПВ-ЕВР/ИД-ЕВРО/Завод, ползвани от ръчно добавените записи) И новите
   продукт/SAP/количество полета (попълвани автоматично при наливане от разлика) - нищо не се губи визуално.
   "Поръчка" е номерът на поръчката от изходната разлика (order_number) - различно поле от "ПВ-ЕВР"
   (purchase_order), което е от стария ERP износ. */
function renderSRTableDiff(list, canEdit, isAdmin) {
  var h = '<div class="tbl-wrap tbl-compact tbl-sr-compact tbl-sr-diff">';
  h += '<table style="border-collapse:collapse;font-size:12px;">';
  h += srTh(['Артикул','Документ','Магазин · Доставчик','Статус','Коментари','Действия']);
  h += '<tbody>';
  list.forEach(function(r) {
    var isTaken = r.status === 'taken' || r.status === 'completed'; /* без „Взета“ и на приключен ред */
    h += '<tr style="border-bottom:1px solid #f1f5f9;'+(r.diff_line_id?'background:#f5f3ff;':'')+'">' +
      '<td style="padding:7px 10px;overflow:hidden;"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+escAttr(r.product_name||'')+'">'+esc(r.product_name||'')+'</div>'+
        '<div style="font-size:10.5px;color:#64748b;"><span style="font-family:DM Mono,monospace;">SAP '+esc(r.sap_code||'—')+'</span>'+(r.quantity?' · <b>'+r.quantity+'</b>':'')+'</div></td>'+
      srDocCell(r, true)+
      srStoreSupplierCell(r)+
      srStatusCell(r)+
      srCommentsCell(r)+
      '<td style="padding:7px 10px;">'+srRowActions(r,isTaken,canEdit,isAdmin)+'</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="font-size:11px;color:#94a3b8;margin-top:6px;">🟣 Лилав фон = автоматично наляно от разлика</div>';
  return h;
}

/* Таблица за подтаб "По рекламации / срок на годност" - същите колони без "Артикул" (5). */
function renderSRTableComplaint(list, canEdit, isAdmin) {
  var h = '<div class="tbl-wrap tbl-compact tbl-sr-compact tbl-sr-complaint">';
  h += '<table style="border-collapse:collapse;font-size:12px;">';
  h += srTh(['Документ','Магазин · Доставчик','Статус','Коментари','Действия']);
  h += '<tbody>';
  list.forEach(function(r) {
    var isTaken = r.status === 'taken' || r.status === 'completed'; /* без „Взета“ и на приключен ред */
    h += '<tr style="border-bottom:1px solid #f1f5f9;">' +
      srDocCell(r)+
      srStoreSupplierCell(r)+
      srStatusCell(r)+
      srCommentsCell(r)+
      '<td style="padding:7px 10px;">'+srRowActions(r,isTaken,canEdit,isAdmin)+'</td></tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

/* Бадж за статус + маркер "без документ" - споделен от двете таблици.
   Маркерът е чисто информативен: показва редовете, отчетени като взети/приключени
   без прикачена товарителница. При спор с доставчик за тях нямаме доказателство.
   Не блокира нищо и не изчезва при редакция - заварените записи си остават
   каквито са, маркерът само ги прави видими. */
function srStatusBadge(r){
  var h = r.status==='completed'
    ? '<span style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">🏁 ПРИКЛЮЧЕНА</span>'
    : r.status==='taken'
    ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ ВЗЕТА</span>'
    : '<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⏳ НЕВЗЕТА</span>';
  var proven = Array.isArray(r.photos) && r.photos.length>0;
  if((r.status==='taken'||r.status==='completed') && !proven){
    h += '<span title="Няма прикачена товарителница — при спор с доставчика нямаме доказателство" style="background:#fffbeb;color:#92400e;padding:2px 6px;border-radius:20px;font-size:10px;font-weight:600;margin-left:4px;white-space:nowrap;">⚠️ без документ</span>';
  }
  return h;
}

/* Общи бутони за действие на ред (взета/редактирай/изтрий) - споделени от двете таблици */
function srRowActions(r,isTaken,canEdit,isAdmin){
  var h='';
  /* Решението в "Разлики" вече не е "Връщане" (синхронът при смяната е
     пропаднал) - вместо "Взета" с товарителница, изрично предупреждение. */
  if (!isTaken && srDecisionChanged(r)) {
    h += '<span data-decision-changed="1" title="Решението по този ред в Разлики вече не е „Връщане“ — този запис не бива да се взима" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;margin-right:2px;white-space:nowrap;">⚠ решението е сменено</span>';
  } else if (canEdit && !isTaken) {
    h += '<button data-id="'+r.id+'" onclick="srMarkTaken(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">✅ Взета</button>';
  }
  if (canEdit) {
    h += '<button data-id="'+r.id+'" onclick="openSRModal(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
  }
  if (isAdmin) {
    h += '<button data-id="'+r.id+'" onclick="srDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button>';
  }
  return h;
}

function setSRFilter(f) { srFilter=f; renderStockReturns(); }

function srMarkTaken(id) {
  /* Отвори модал за попълване на куриер инфо */
  srEditId = id;
  var existingR = srData.find(function(x){return x.id===id;});
  srPendingPhotos = (existingR && Array.isArray(existingR.photos)) ? existingR.photos.slice() : [];
  renderStockReturns();
  var ov = document.getElementById('sr-ov');
  if (ov) {
    var r = srData.find(function(x){return x.id===id;});
    if (r) {
      /* Магазинът е вече известен от самия запис (редактираме съществуващ) -
         попълваме го директно, вместо да разчитаме на асинхронно зареждане
         на списъка (което тук не се случваше изобщо - засядаше на "Зарежда се..."). */
      var storeEl = document.getElementById('sr-store');
      if (storeEl && r.store_name) {
        storeEl.outerHTML = '<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(r.store_name)+'</div><input type="hidden" id="sr-store" value="'+esc(r.store_name)+'">';
      }
      var el = document.getElementById('sr-status');
      if (el) el.value = 'taken';
      updateSRPhotoHint(); /* JS value промяна не тригерира onchange - извикваме ръчно */
      var ed = document.getElementById('sr-wdate');
      if (ed) ed.value = localDateISO();
    }
    ov.classList.add('open');
  }
}

function srDelete(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('stock_returns','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('srDelete: записът НЕ беше изтрит',id,res.error);
      toast('⚠️ Записът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadStockReturns(); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadStockReturns(); return; }
    toast('✓ Изтрит'); loadStockReturns();
  });
}

/* ── МОДАЛ ── */
function srModalHtml() {
  var r = srEditId ? (srData.find(function(x){return x.id===srEditId;})||{}) : {};
  var isEdit = !!srEditId;
  var tab = isEdit ? (r.source||'diff') : srTab;
  var storeSelectHtml=(function(){
    var myS=assignedStores();
    if(myS&&myS.length===1)return '<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="sr-store" value="'+esc(myS[0])+'">';
    if(myS&&myS.length>1)return '<select class="fi" id="sr-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option'+(r.store_name===s?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select>';
    return '<select class="fi" id="sr-store"><option value="">-- Зарежда се... --</option></select>';
  })();

  var h='<div class="bov" id="sr-ov"><div class="bmod" style="width:580px;max-height:88vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':(tab==='complaint'?'+ Добави рекламация/срок на годност':'+ Добави стока за връщане'))+'</div>'+
    '<button onclick="closeSRModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<input type="hidden" id="sr-source" value="'+tab+'">';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Магазин *</label>'+storeSelectHtml+'</div>'+
    /* list="sr-supplier-list": подсказки от справочника (openSRModal ги пълни) -
       точното име вместо нов вариант на ръка, свободен текст остава възможен.
       escVal, НЕ esc: esc('') връща "—", тоест новият запис тръгваше със
       стойност "—" - datalist-ът филтрира по написаното и не показваше нищо. */
    '<div><label class="fl">Доставчик</label><input class="fi" id="sr-supplier" list="sr-supplier-list" value="'+escVal(r.supplier)+'" placeholder="напр. ДЕНИ-А 8583 ООД"><datalist id="sr-supplier-list"></datalist></div>'+
    '</div>';

  if (tab!=='complaint') {
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Продукт</label><input class="fi" id="sr-product" value="'+esc(r.product_name||'')+'" placeholder="Наименование"></div>'+
    '<div><label class="fl">SAP №</label><input class="fi" id="sr-sap" value="'+esc(r.sap_code||'')+'" placeholder="напр. 34989"></div>'+
    '<div><label class="fl">Количество</label><input type="number" step="0.001" class="fi" id="sr-qty" value="'+(r.quantity!=null?r.quantity:'')+'"></div>'+
    '</div>';
  }

  if (tab==='complaint') {
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
      '<div><label class="fl">Срок на годност</label><input type="date" class="fi" id="sr-expiry" value="'+(r.expiry_date||'')+'"></div>'+
      '<div><label class="fl">Причина</label><input class="fi" id="sr-reason" value="'+esc(r.reason||'')+'" placeholder="напр. Рекламация - счупен продукт"></div>'+
      '</div>'+
      '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Полета от ERP импорт (по избор):</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
      '<div><label class="fl">НОВА ПВ-ЕВР</label><input class="fi" id="sr-po" value="'+escVal(r.purchase_order)+'"></div>'+
      '<div><label class="fl">НОВА ИД-ЕВРО</label><input class="fi" id="sr-ie" value="'+escVal(r.id_euro)+'"></div>'+
      '<div><label class="fl">Завод</label><input class="fi" id="sr-plant" value="'+escVal(r.plant)+'"></div>'+
      '</div>'+
      '<label class="fl">Дата на документ</label><input type="date" class="fi" id="sr-docdate" value="'+(r.doc_date||'')+'" style="max-width:200px;margin-bottom:10px;">';
  } else {
    /* "Поръчка" (order_number). При ред от разлика (diff_line_id) номерът идва
       оттам и се синхронизира от submitSD - тук е само за четене, за да няма
       два пътя за една стойност. Ръчният ред няма друг източник. */
    var orderFromDiff = !!r.diff_line_id;
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;">'+
      '<div><label class="fl">Поръчка</label><input class="fi" id="sr-order" value="'+escVal(r.order_number)+'" placeholder="напр. 4100196440"'+
        (orderFromDiff?' readonly title="Идва от разликата — редактира се в Разлики" style="background:#f8fafc;color:#64748b;"':'')+'></div>'+
      '<div><label class="fl">НОВА ПВ-ЕВР</label><input class="fi" id="sr-po" value="'+escVal(r.purchase_order)+'" placeholder="напр. 4200014948"></div>'+
      '<div><label class="fl">НОВА ИД-ЕВРО</label><input class="fi" id="sr-ie" value="'+escVal(r.id_euro)+'" placeholder="напр. 80413769"></div>'+
      '<div><label class="fl">Завод</label><input class="fi" id="sr-plant" value="'+(r.plant||'5521')+'" placeholder="5521"></div>'+
      '</div>'+
      '<label class="fl">Дата на документ</label><input type="date" class="fi" id="sr-docdate" value="'+(r.doc_date||'')+'" style="max-width:200px;margin-bottom:10px;">';
  }

  h += '<label class="fl">Статус</label>'+
    '<select class="fi" id="sr-status" onchange="updateSRPhotoHint()">'+
    '<option value="pending"'+(r.status==='pending'||!r.status?' selected':'')+'>⏳ НЕВЗЕТА</option>'+
    '<option value="taken"'+(r.status==='taken'?' selected':'')+'>✅ ВЗЕТА / ИЗПРАТЕНА</option>'+
    (canCompleteSR()?'<option value="completed"'+(r.status==='completed'?' selected':'')+'>🏁 ПРИКЛЮЧЕНА</option>':'')+
    '</select>'+
    (!canCompleteSR()&&r.status==='completed'?'<div style="font-size:11px;color:#94a3b8;margin-top:-4px;margin-bottom:6px;">🏁 Записът е приключен от Цветелина - статусът може да се смени само от нея/admin.</div>':'')+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Дата на изтегляне</label><input type="date" class="fi" id="sr-wdate" value="'+(r.withdrawal_date||'')+'"></div>'+
    '<div><label class="fl">Дата потвърдена актуализация</label><input type="date" class="fi" id="sr-cdate" value="'+(r.confirmed_date||'')+'">'+
      (srConfirmedWho(r)?'<div id="sr-cdate-by" style="font-size:10.5px;margin-top:-4px;margin-bottom:6px;color:'+srConfirmedWho(r).color+';">'+esc(srConfirmedNote(r))+(srConfirmedWho(r).who?' ('+esc(srConfirmedWho(r).who)+')':'')+'</div>':'')+
      '</div>'+
    '</div>'+

    '<label class="fl">Изтеглена от/с куриер (номер на товарителница)</label>'+
    '<input class="fi" id="sr-courier" value="'+esc(r.courier_info||'')+'" placeholder="напр. по буса на Кърджали към Сливен / Еконт 5300...">'+

    '<div id="sr-photo-hint" style="display:'+((r.status==='taken'||r.status==='completed')?'block':'none')+';background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11.5px;color:#92400e;">'+srPhotoHintHtml(r.controller_comment)+'</div>'+
    '<label class="fl">Снимка на товарителница/документ</label>'+
    '<div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;">'+
      '<label style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'+
        '📷 Снимай сега<input type="file" accept="image/*" capture="environment" onchange="srUploadPhoto(this)" style="display:none;">'+
      '</label>'+
      '<label style="border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'+
        '🖼️ Избери от галерия<input type="file" accept="image/*" multiple onchange="srUploadPhoto(this)" style="display:none;">'+
      '</label>'+
    '</div>'+
    '<div id="sr-photos-wrap" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">'+
      (Array.isArray(r.photos)?r.photos.map(function(p){return '<a href="'+esc(p.url)+'" target="_blank"><img src="'+esc(p.url)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';}).join(''):'')+
    '</div>'+

    '<label class="fl">Коментар</label>'+
    '<input class="fi" id="sr-cc" value="'+esc(r.control_comment||'')+'" placeholder="напр. ИЗД КИ"'+srCmtRoAttr(tab)+'>';

  h += '<label class="fl">Коментар Контролер</label>'+
    '<input class="fi" id="sr-ctrl" value="'+esc(r.controller_comment||'')+'" placeholder="напр. КЪМ ЛС ТЪРГОВИЩЕ / ИЗПРАЩАЙТЕ" oninput="updateSRPhotoHint()"'+srCmtRoAttr(tab)+'>';

  /* „Коментар обект" - свободен текст от магазина (и Цвети/admin). И в двата
     подтаба (от 30.09.2026 и в „По разлики" - импортът там пише колони G+H). */
  h += '<label class="fl">Коментар обект</label>'+
    '<input class="fi" id="sr-store-cmt" value="'+esc(r.store_comment||'')+'" placeholder="свободен текст от обекта">';

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeSRModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSR()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
  return h;
}

function openSRModal(id) {
  srEditId = id;
  var existing = id ? srData.find(function(x){return x.id===id;}) : null;
  srPendingPhotos = (existing && Array.isArray(existing.photos)) ? existing.photos.slice() : [];
  renderStockReturns();
  var ov = document.getElementById('sr-ov');
  if (!ov) return;
  /* Магазин: автоматично или dropdown */
  var myStores = assignedStores();
  var storeEl = document.getElementById('sr-store');
  if (storeEl) {
    if (myStores && myStores.length === 1) {
      storeEl.outerHTML = '<div class="fi" style="background:#f8fafc;font-weight:500;">🏪 '+esc(myStores[0])+'</div><input type="hidden" id="sr-store" value="'+esc(myStores[0])+'">';
    } else if (myStores && myStores.length > 1) {
      storeEl.innerHTML = '<option value="">-- Избери --</option>'+myStores.map(function(s){return '<option>'+esc(s)+'</option>';}).join('');
    } else {
      sbGet('users','select=store_name&order=store_name').then(function(data){
        var el = document.getElementById('sr-store');
        if(Array.isArray(data)&&el){
          var seen={};
          el.innerHTML='<option value="">-- Избери --</option>'+data.filter(function(u){
            if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
            seen[u.store_name]=1;return true;
          }).map(function(u){return '<option>'+esc(u.store_name)+'</option>';}).join('');
          /* Избери текущия магазин при редактиране */
          var cur = srEditId ? (srData.find(function(x){return x.id===srEditId;}))||{} : {};
          if(cur.store_name) el.value = cur.store_name;
        }
      });
    }
  }
    ov.classList.add('open');
  /* Опциите се строят през DOM (o.value), не с низ - в имената има кавички. */
  loadAllSuppliers().then(function(list){
    var dl=document.getElementById('sr-supplier-list');
    if(!dl)return;
    dl.innerHTML='';
    list.forEach(function(name){ var o=document.createElement('option'); o.value=name; dl.appendChild(o); });
  });
}
function srCompressImage(file,maxDim,quality){
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
function srUploadPhoto(input){
  var files=Array.from(input.files||[]);
  if(!files.length)return;
  var wrap=document.getElementById('sr-photos-wrap');
  files.forEach(function(file){
    var placeholderId='srph-'+Math.random().toString(36).slice(2,10);
    if(wrap) wrap.insertAdjacentHTML('beforeend','<div id="'+placeholderId+'" style="width:56px;height:56px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;">⏳</div>');
    srCompressImage(file,1600,0.75).then(function(compressed){
      var isImg=file.type&&file.type.indexOf('image/')===0;
      var ext=isImg?'jpg':((file.name.split('.').pop()||'bin').toLowerCase());
      var ctype=isImg?'image/jpeg':(file.type||'application/octet-stream');
      var path='stock-returns/'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.'+ext;
      var reader=new FileReader();
      reader.onload=function(e){
        fetch(SR_SB+'/storage/v1/object/'+SR_BKT+'/'+path,{
          method:'POST',
          headers:{'Authorization':'Bearer '+SR_KEY,'Content-Type':ctype,'x-upsert':'true'},
          body:e.target.result
        }).then(function(r){return r.ok;}).then(function(ok){
          var ph=document.getElementById(placeholderId);
          if(!ok){ if(ph) ph.outerHTML='<div style="width:56px;height:56px;border-radius:6px;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:16px;">⚠️</div>'; return; }
          var pub=SR_SB+'/storage/v1/object/public/'+SR_BKT+'/'+path;
          srPendingPhotos.push({url:pub,name:file.name});
          if(ph) ph.outerHTML='<a href="'+esc(pub)+'" target="_blank"><img src="'+esc(pub)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
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
/* Показва/скрива изискването за товарителница според избрания статус - и за
   "Взета", и за "Приключена" ("Приключена" се задава директно и може да
   прескочи "Взета", а доказателство трябва и в двата случая). */
function updateSRPhotoHint(){
  var statusEl=document.getElementById('sr-status');
  var hintEl=document.getElementById('sr-photo-hint');
  if(!statusEl||!hintEl)return;
  hintEl.style.display = (statusEl.value==='taken'||statusEl.value==='completed') ? 'block' : 'none';
  var ctrlEl=document.getElementById('sr-ctrl');
  hintEl.innerHTML = srPhotoHintHtml(ctrlEl?ctrlEl.value:'');
}
/* "Изхвърляне": контролерът е написал в "Коментар контролер" стоката да се
   изхвърли (ИЗХВЪРЛЯЙТЕ / изхвърляте / изхвърлена). Тогава тя не минава през
   куриер и товарителница няма - изисква се само дата (на изхвърлянето).
   По корена "изхвърл", без значение от главни/малки букви. */
/* „Коментар" и „Коментар контролер" в „По рекламации" са САМО за Цвети/admin
   (canCompleteSR, 29.09.2026): в първия тя отбелязва КИ, във втория дава
   насоки към обекта. За останалите полетата са само за четене - input с
   readonly, не текст, защото srIsDiscard/updateSRPhotoHint четат sr-ctrl.
   При запис двата ключа изобщо не се пращат (submitSR) - readonly е за
   човека, не защита. */
function srCommentsLocked(tab){ return tab==='complaint' && !canCompleteSR(); }
function srCmtRoAttr(tab){
  return srCommentsLocked(tab) ? ' readonly title="Попълва се от Цвети" style="background:#f8fafc;color:#64748b;"' : '';
}
function srIsDiscard(text){
  return String(text||'').toLowerCase().indexOf('изхвърл')>=0;
}
function srPhotoHintHtml(ctrlText){
  return srIsDiscard(ctrlText)
    ? '🗑️ <b>Изхвърляне:</b> нужна е само дата.'
    : '📸 <b>Задължително:</b> снимка на товарителницата, дата на изтегляне и куриер.';
}
function closeSRModal() {
  var ov=document.getElementById('sr-ov'); if(ov)ov.classList.remove('open');
  srEditId=null;
}

/* ── ИМПОРТ ОТ EXCEL (рекламации / срок на годност) ── */
/* Карта номер на лист -> магазин (същата карта, използвана при импорта на контакти) */
var SR_SHEET_TO_STORE = {
  '2':'Севлиево','3':'Враца','7':'Монтана','8':'Кърджали','12':'Търговище',
  '13':'Сливен','14':'Шумен','15':'Габрово','16':'Добрич','19':'Гоце Делчев',
  '20':'Силистра','21':'Раднево','22':'Дупница','23':'Петрич','24':'Пирдоп',
  '25':'Троян','26':'Карлово','27':'Козлодуй',
  '5':'Логистичен склад Търговище','18':'Логистичен склад Добрич'
};
/* Парсва дата в различни разпространени формати, срещани във файла:
   дд.мм.гггг, дд,мм,гггг (запетаи вместо точки), дд.мм.гг (2-цифрена година),
   Excel Date обект, ISO низ, Excel сериен номер. При неразпознат текст (напр.
   свободен коментар, вмъкнат по грешка в дата колона) връща null, вместо да гърми.
   Серийният номер: XLSX.read се вика без cellDates, тоест клетка, форматирана
   като ИСТИНСКА дата, идва като число (46236 = 02.08.2026). Без този клон
   такава дата се губеше тихо - към 28.09.2026 нито един от 378-те реда в
   "По рекламации" нямаше doc_date. Броят е в дни от 30.12.1899 (UTC, така че
   часовата зона не мести деня); дробната част е час и се реже. Долната граница
   61 заобикаля фалшивия 29.02.1900 на Excel, горната (31.12.9999) не пуска
   10-цифрени номера (ПВ-ЕВР), попаднали по грешка в колоната. */
function srParseFlexibleDate(v){
  if(typeof v==='number'){
    if(!isFinite(v) || v<61 || v>=2958466) return null;
    return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
  }
  if(!v) return null;
  if(v instanceof Date) return isNaN(v.getTime())?null:v.toISOString().slice(0,10);
  var s=String(v).trim();
  if(!s) return null;
  var m=s.match(/^(\d{1,2})[.,\/](\d{1,2})[.,\/](\d{4})$/);
  if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  var m2=s.match(/^(\d{1,2})[.,\/](\d{1,2})[.,\/](\d{2})$/); /* 2-цифрена година */
  if(m2) return '20'+m2[3]+'-'+m2[2].padStart(2,'0')+'-'+m2[1].padStart(2,'0');
  var m3=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); /* ISO/pandas Timestamp низ; и гггг/мм/дд, гггг.мм.дд */
  if(m3) return m3[1]+'-'+m3[2].padStart(2,'0')+'-'+m3[3].padStart(2,'0');
  return null; /* неразпознат текст (напр. свободен коментар в дата клетка) - пропускаме тихо */
}
/* Импорт на многолистовия ERP формат "Обобщен списък - стока за връщане".
   Редовете отиват в подтаб "По рекламации / срок на годност", НЕ в "По
   разлики": startReturnsImport презаписва source на 'complaint' веднага след
   парсването, за двата формата еднакво. Полето source:'diff' по-долу е
   заварено и няма ефект - живее до първия ред след връщането оттук.
   ("По разлики" се пълни само автоматично, от решение на разлика.)
   Позиционно четене на колоните (не по заглавие), защото файлът има 2 колони
   с ИДЕНТИЧНО заглавие "коментар Контролер". */
function parseDiffReturnsWorkbook(wb){
  var rows=[];
  wb.SheetNames.forEach(function(sheetName){
    var storeName=SR_SHEET_TO_STORE[sheetName.trim()];
    if(!storeName) return; /* лист "Обяснение" и др. непознати листове - прескачаме */
    var sheet=wb.Sheets[sheetName];
    var aoa=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
    for(var i=1;i<aoa.length;i++){ /* ред 0 = заглавия, прескачаме */
      var row=aoa[i];
      if(!row||!row.length) continue;
      var po=(row[0]||'').toString().trim();
      var ideuro=(row[1]||'').toString().trim();
      var supplier=(row[2]||'').toString().trim();
      if(!po && !ideuro && !supplier) continue; /* напълно празен ред */
      var statusRaw=(row[5]||'').toString().trim().toUpperCase();
      /* Ред: ПРИКЛЮЧ -> НЕВЗЕТА -> ВЗЕТА ("НЕВЗЕТА" съдържа "ВЗЕТА", затова е
         преди нея). "ПРИКЛЮЧЕНА" я пише нашият износ; дали потребителят има
         право да приключва, решава startReturnsImport, не парсърът. */
      var status;
      if(statusRaw.indexOf('ПРИКЛЮЧ')===0) status='completed';
      else if(statusRaw.indexOf('НЕВЗЕТА')>=0) status='pending';
      else if(statusRaw.indexOf('ВЗЕТА')===0) status='taken';
      else status='pending';
      rows.push({
        store_name:storeName,
        purchase_order:po,
        id_euro:ideuro,
        supplier:supplier,
        doc_date:srParseFlexibleDate(row[3]),
        plant:(row[4]||'').toString().trim(),
        status:status,
        withdrawal_date:srParseFlexibleDate(row[6]),
        courier_info:(row[7]||'').toString().trim(),
        confirmed_date:srParseFlexibleDate(row[8]),
        control_comment:(row[9]||'').toString().trim(),
        controller_comment:(row[10]||'').toString().trim(),
        source:'diff',
        created_by:currentUser.display_name||currentUser.email
      });
    }
  });
  return rows;
}

/* ══ ИМПОРТ ЗА ПОДТАБ „ПО РАЗЛИКИ" (29.09.2026) ══
   Цвети води паралелно Excel „Стока за изтегляне по разлики" и го качва, докато
   спре да го попълва. Формат: лист „Обяснение" + листове с номерата от
   SR_SHEET_TO_STORE; ред 1 = заглавия ДОСТАВЧИК, МАТЕРИАЛ, НАИМЕНОВАНИЕ,
   КОЛИЧЕСТВО, ПОРЪЧКА, ДАТА НА ПОТВЪРДЕНА АКТУАЛИЗАЦИЯ, КОМЕНТАР (понякога с
   интервал накрая). Колоните се търсят ПО ЗАГЛАВИЕ (trim, без значение от
   главни/малки). Бележката (H) стои в колоната СЛЕД „КОМЕНТАР" - често без
   заглавие, затова се търси по позиция спрямо него, не по име. */
var SR_DIFF_LIST_COLS = {
  supplier:'доставчик', sap:'материал', name:'наименование', qty:'количество',
  order:'поръчка', cdate:'дата на потвърдена актуализация', comment:'коментар'
};
/* Статус от колона G. „невзет" се проверява ПРЕДИ „взет" - иначе „НЕВЗЕТА"
   съдържа „взет" и става 'taken'. „Приключена" само при canComplete (както в
   многолистовия импорт), иначе 'taken'. */
function srDiffListStatus(text, canComplete){
  var t=String(text==null?'':text).trim().toLowerCase();
  if(!t) return 'pending';
  if(t.indexOf('невзет')>=0 || t.indexOf('не е взет')>=0 || t.indexOf('не взет')>=0 || t==='тук е') return 'pending';
  if(t.indexOf('заприход')>=0 || t.indexOf('изхвърл')>=0 || t.indexOf('прието при')>=0) return canComplete ? 'completed' : 'taken';
  if(t.indexOf('взет')>=0 || t.indexOf('спиди')>=0 || t.indexOf('еконт')>=0 || t.indexOf('изпрат')>=0 || t.indexOf('върнат')>=0) return 'taken';
  return 'pending';
}
/* Име на доставчик за сравнение: главни букви, без правна форма
   (ЕООД/ООД/ЕАД/АД/ЕТ) и без пунктуация. „ЕЛМАК" и „ЕЛМАК ЕООД" → „ЕЛМАК". */
function srSupplierNorm(name){
  return String(name||'').toUpperCase()
    .replace(/[„"“”'`.,;:()\-–—\/\\]/g,' ')
    .replace(/(^|\s)(ЕООД|ООД|ЕАД|АД|ЕТ)(?=\s|$)/g,' ')
    .replace(/\s+/g,' ').trim();
}
/* Число/текст от клетка → текст без „.0" (SAP 20923.0 → „20923"). */
function srCellText(v){
  if(v===null||v===undefined) return '';
  if(typeof v==='number') return isFinite(v) ? String(v) : '';
  return String(v).trim().replace(/^(\d+)\.0+$/,'$1');
}
/* Парсва файла → {rows, badDates}. Не пише нищо. */
function srParseDiffListWorkbook(wb, canComplete){
  var rows=[], badDates=0;
  wb.SheetNames.forEach(function(sheetName){
    var store=SR_SHEET_TO_STORE[String(sheetName).trim()];
    if(!store) return; /* „Обяснение" и непознати листове */
    var aoa=window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:''});
    if(!aoa.length) return;
    var head=(aoa[0]||[]).map(function(h){ return String(h==null?'':h).trim().toLowerCase(); });
    var col={};
    Object.keys(SR_DIFF_LIST_COLS).forEach(function(k){ col[k]=head.indexOf(SR_DIFF_LIST_COLS[k]); });
    if(col.name<0 && col.sap<0) return; /* не е този формат */
    var noteCol = col.comment>=0 ? col.comment+1 : -1;
    var cell=function(r,i){ return i>=0 ? r[i] : ''; };
    for(var i=1;i<aoa.length;i++){
      var r=aoa[i]||[];
      var supplier=srCellText(cell(r,col.supplier)), sap=srCellText(cell(r,col.sap)), name=srCellText(cell(r,col.name));
      /* Празен ред - и „ред" само с текст в колоната на доставчика (банер като
         „ЗАПРИХОЖДАВАТЕ САМО АКО…" в образеца): без SAP и наименование не е запис. */
      if(!sap && !name) continue;
      var rawDate=cell(r,col.cdate);
      var cdate=srParseFlexibleDate(rawDate);
      if(cdate===null && String(rawDate==null?'':rawDate).trim()!=='') badDates++;
      var g=srCellText(cell(r,col.comment)), note=srCellText(cell(r,noteCol));
      var q=parseFloat(cell(r,col.qty));
      rows.push({
        store_name:store, supplier:supplier, sap_code:sap, product_name:name,
        quantity:isNaN(q)?null:q, order_number:srCellText(cell(r,col.order))||null,
        confirmed_date:cdate, status:srDiffListStatus(g,canComplete),
        /* G + H - свободният текст на обекта. control_comment и
           controller_comment НЕ се пипат (те са на Цвети). */
        store_comment:[g,note].filter(function(x){return !!x;}).join(' · ')||null,
        source:'diff'
      });
    }
  });
  return {rows:rows, badDates:badDates};
}
/* Ключ за съвпадение със съществуващ ред: магазин + поръчка + SAP; без
   поръчка - магазин + SAP + наименование. */
function srDiffListKey(r){
  var st=String(r.store_name||'').trim(), sap=String(r.sap_code||'').trim();
  var ord=String(r.order_number||'').trim();
  return ord ? ('o|'+st+'|'+ord+'|'+sap) : ('n|'+st+'|'+sap+'|'+String(r.product_name||'').trim().toUpperCase());
}
/* Импортът на „По разлики": парсва, съпоставя доставчиците, обновява по ключ
   или вмъква; приключените в портала не се пипат, липсващите във файла - също. */
function srImportDiffList(wb, progEl){
  var canComplete=canCompleteSR();
  var parsed=srParseDiffListWorkbook(wb, canComplete);
  var rows=parsed.rows;
  if(!rows.length){ progEl.innerHTML='<span style="color:#dc2626;">Няма разпознати редове за импорт.</span>'; return; }
  progEl.textContent='⏳ Проверка за съществуващи записи...';
  var stores=rows.map(function(r){return r.store_name;}).filter(function(s,i,a){return a.indexOf(s)===i;});
  Promise.all([
    /* sbGetOk, не sbGet: провалена заявка НЕ бива да изглежда като „няма
       нищо" - тогава всеки ред би станал дубликат. */
    /* confirmed_date се тегли, за да се разбере дали импортът я СМЕНЯ: само
       тогава се пише следа (confirmed_by/confirmed_at). Без нея всеки импорт
       би „освежавал" чужда актуализация и следата би станала безполезна. */
    sbGetOk('stock_returns','source=eq.diff&select=id,store_name,order_number,sap_code,product_name,status,confirmed_date,confirmed_by&store_name=in.('+
      stores.map(function(s){return '"'+encodeURIComponent(s)+'"';}).join(',')+')'),
    sbGetOk('stock_returns','select=supplier')
  ]).then(function(res){
    if(!res[0].ok || !res[1].ok){
      var err=(!res[0].ok?res[0]:res[1]).error;
      progEl.innerHTML='<span style="color:#dc2626;">Грешка при проверка на съществуващите: '+esc(err)+'</span>';
      return;
    }
    /* Доставчик: пълното име със същото нормализирано име. В базата често стоят
       и двата вида („ЕЛМАК" и „ЕЛМАК ЕООД") - затова: ако сред съвпаденията има
       ТОЧНО ЕДНО с правна форма, то; иначе ако съвпадението е едно - то; иначе
       името от файла. Двойни интервали не правят второ име („ТЕКРА  ЕООД"). */
    var byNorm={};
    var LEGAL=/(^|\s)(ЕООД|ООД|ЕАД|АД|ЕТ)(\s|$)/;
    res[1].rows.forEach(function(x){
      var full=String(x.supplier||'').replace(/\s+/g,' ').trim(); if(!full) return;
      var k=srSupplierNorm(full); if(!k) return;
      if(!byNorm[k]) byNorm[k]=[];
      if(byNorm[k].indexOf(full)<0) byNorm[k].push(full);
    });
    var unmatched=[];
    rows.forEach(function(r){
      if(!r.supplier) return;
      var cand=byNorm[srSupplierNorm(r.supplier)]||[];
      var withLegal=cand.filter(function(c){ return LEGAL.test(c.toUpperCase()); });
      var pick = withLegal.length===1 ? withLegal[0] : (cand.length===1 ? cand[0] : null);
      if(pick) r.supplier=pick;
      else if(unmatched.indexOf(r.supplier)<0) unmatched.push(r.supplier);
    });
    var existing={};
    res[0].rows.forEach(function(x){ var k=srDiffListKey(x); if(!existing[k]) existing[k]=x; });
    var created=currentUser.display_name||currentUser.email;
    var toInsert=[], toUpdate=[], skippedCompleted=0, keptByStore=0;
    rows.forEach(function(r){
      var hit=existing[srDiffListKey(r)];
      if(!hit){
        r.created_by=created;
        /* Нов ред с дата ОТ ФАЙЛА — следата е на импорта. Без нея редът влиза
           с confirmed_by NULL: правилото и така не би го броил, но колоната
           трябва да казва истината, а не да мълчи. 32 заварени реда са точно
           такива (дата по-ранна от създаването им).
           Ключовете се слагат на ВСЕКИ ред, дори празни: srBatchImport праща
           партиди по 300 с ЕДИН POST, а PostgREST иска еднакви колони —
           условно добавяне би счупило цялата партида. */
        r.confirmed_by = r.confirmed_date ? srImportActor() : null;
        r.confirmed_at = r.confirmed_date ? new Date().toISOString() : null;
        toInsert.push(r); return;
      }
      if(hit.status==='completed'){ skippedCompleted++; return; }
      var upd={
        supplier:r.supplier, sap_code:r.sap_code, product_name:r.product_name, quantity:r.quantity,
        order_number:r.order_number, confirmed_date:r.confirmed_date, status:r.status, store_comment:r.store_comment
      };
      /* Потвърдено от обекта и файлът носи по-стара дата или празна клетка —
         датата и следата ѝ НЕ се пипат; останалите колони се обновяват както
         досега. Виж srImportKeepsDate(). */
      if(srImportKeepsDate(hit, r.confirmed_date)){
        delete upd.confirmed_date;
        keptByStore++;
      } else {
        /* Импортът е на ОФИСА: смени ли датата (включително на null), следата
           става 'import:<име>' и правилото спира да брои реда за актуализиран
           от обекта. Не пипа ли датата — колоните остават както са. */
        var trImp=srConfirmedTrace(hit.confirmed_date, r.confirmed_date, srImportActor());
        for(var ki in trImp){ if(Object.prototype.hasOwnProperty.call(trImp,ki)) upd[ki]=trImp[ki]; }
      }
      toUpdate.push({ id:hit.id, purchase_order:r.order_number||r.product_name, data:upd });
    });
    var done=function(insertErrors, failed){
      var h='<span style="color:#16a34a;">✅ Нови: '+toInsert.length+' · Обновени: '+(toUpdate.length-failed.length)+
            ' · Пропуснати (приключени): '+skippedCompleted+'</span>';
      /* Видимо за Цвети: кои редове файлът НЕ е пипнал и защо. Без този ред
         тя ще реши, че импортът е сработил наполовина. */
      if(keptByStore) h+='<div style="color:#2563eb;">🛡 '+keptByStore+' '+(keptByStore===1?'ред не е пипан':'реда не са пипани')+
                         ' — потвърдени от обекта с по-нова дата</div>';
      if(unmatched.length) h+='<div style="color:#d97706;">⚠️ Несъпоставени доставчици (остават с името от файла): '+esc(unmatched.join(', '))+'</div>';
      if(parsed.badDates) h+='<div style="color:#d97706;">⚠️ Нечетими дати (записани празни): '+parsed.badDates+'</div>';
      if(failed.length) h+='<div style="color:#dc2626;">⚠️ Не бяха обновени: '+esc(failed.join(', '))+'</div>';
      if(insertErrors>0) h+='<div style="color:#dc2626;">⚠️ '+insertErrors+' партиди с нови записи не минаха. Виж конзолата (F12).</div>';
      progEl.innerHTML=h;
      if(!failed.length && !insertErrors) toast('✅ Импортът приключи успешно!');
      srImportFinish();
    };
    var runUpdates=function(insertErrors){
      if(!toUpdate.length){ done(insertErrors, []); return; }
      srBatchUpdate(toUpdate,function(d,t){ progEl.textContent='⏳ Обновяване на '+d+' / '+t+'...'; },function(failed){ done(insertErrors, failed); });
    };
    if(!toInsert.length){ runUpdates(0); return; }
    srBatchImport(toInsert,function(d,t){ progEl.textContent='⏳ Качване на '+d+' / '+t+'...'; },runUpdates);
  });
}

/* Гъвкаво разпознаване на колони (за подтаб "рекламации") - приема няколко
   разпространени варианта на заглавия, тъй като няма фиксиран формат. */
var SR_IMPORT_COL_ALIASES = {
  product:  ['продукт','наименование','артикул','material','описание'],
  sap:      ['sap','sap №','sap no','sap номер','материал','код'],
  qty:      ['количество','кол.','кол','qty','бр'],
  store:    ['магазин','обект','store'],
  supplier: ['доставчик','supplier'],
  expiry:   ['срок на годност','годност','expiry','срок'],
  reason:   ['причина','основание','reason','коментар']
};
function srFindCol(headers,aliases){
  for(var i=0;i<headers.length;i++){
    var h=(headers[i]||'').toString().trim().toLowerCase();
    for(var j=0;j<aliases.length;j++){
      if(h===aliases[j]||h.indexOf(aliases[j])>=0) return headers[i];
    }
  }
  return null;
}
function srImportModalHtml(){
  var hint = 'Приема 2 формата: (1) Многолистов Excel (1 лист на магазин), формат "Обобщен списък - стока за връщане" — колони НОВА ПВ-ЕВРО, НОВА ИД-ЕВРО, Доставчик, Завод, статус ВЗЕТА/НЕВЗЕТА/ПРИКЛЮЧЕНА и т.н.; или (2) единичен лист с колони за продукт, SAP, количество, магазин, срок на годност, причина. Разпознава автоматично кой от двата е. Импортът само ДОБАВЯ нови редове: ред с ПВ-ЕВР, който вече е в портала, се пропуска и нищо по него не се променя — статусите, датите, куриерът и коментарите се поддържат в портала. Редове без ПВ-ЕВР и повторени ПВ-ЕВР във файла също се пропускат. Единичният лист няма ПВ-ЕВР — там ред се пропуска, ако същият магазин + SAP + срок на годност вече е в портала или се повтаря във файла.';
  /* „По разлики" има свой формат - „Стока за изтегляне по разлики". */
  if(srTab==='diff') hint = 'Файлът „Стока за изтегляне по разлики": 1 лист на магазин (номерата като в многолистовия), колони ДОСТАВЧИК, МАТЕРИАЛ, НАИМЕНОВАНИЕ, КОЛИЧЕСТВО, ПОРЪЧКА, ДАТА НА ПОТВЪРДЕНА АКТУАЛИЗАЦИЯ, КОМЕНТАР. Съществуващ ред (магазин + поръчка + SAP, или без поръчка: магазин + SAP + наименование) се ОБНОВЯВА; приключените в портала не се пипат; редове, които ги няма във файла, остават. Коментарът от файла отива в „Коментар обект".';
  return '<div class="bov" id="sr-import-ov"><div class="bmod" style="width:460px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:15px;font-weight:700;">📤 Импорт от Excel — '+(srTab==='diff'?'по разлики':'рекламации/срок на годност')+'</div>'+
    '<button onclick="closeReturnsImportModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">'+hint+'</div>'+
    '<input type="file" id="sr-import-file" accept=".xlsx,.xls" style="margin-bottom:14px;">'+
    '<div id="sr-import-progress" style="font-size:12px;color:#94a3b8;"></div>'+
    '<button id="sr-import-btn" onclick="startReturnsImport()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;">Започни импорт</button>'+
    '</div></div>';
}
function openReturnsImportModal(){
  var ov=document.getElementById('sr-import-ov');
  if(ov) ov.classList.add('open');
}
/* Затварянето е и моментът на презареждане. Досега loadStockReturns() се
   викаше веднага след импорта, а тя подменя целия модул - заедно с модала и
   с обобщението в него. Тоест резултатът (и особено червеният ред с ПВ
   номерата на непреминалите) мигваше за колкото трае GET-ът и изчезваше,
   преди Цветелина да го е прочела. Сега таблицата се опреснява чак когато
   човекът затвори прозореца. */
function closeReturnsImportModal(){
  var ov=document.getElementById('sr-import-ov');
  if(ov) ov.classList.remove('open');
  var prog=document.getElementById('sr-import-progress');
  if(prog) prog.innerHTML='';
  var btnEl=document.getElementById('sr-import-btn');
  if(btnEl){ btnEl.textContent='Започни импорт'; btnEl.setAttribute('onclick','startReturnsImport()'); }
  if(srImportFinished){
    srImportFinished=false;
    loadStockReturns();
  }
}
/* Превключва бутона на "Затвори" и вдига флага - вика се в края на импорта,
   независимо дали е минал чисто. */
function srImportFinish(){
  srImportFinished=true;
  var btnEl=document.getElementById('sr-import-btn');
  if(btnEl){ btnEl.textContent='Затвори'; btnEl.setAttribute('onclick','closeReturnsImportModal()'); }
}
function startReturnsImport(){
  var fileInp=document.getElementById('sr-import-file');
  var file=fileInp&&fileInp.files[0];
  if(!file){toast('Избери файл','#dc2626');return;}
  var progEl=document.getElementById('sr-import-progress');
  progEl.textContent='⏳ Зареждане...';
  if(!window.XLSX){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=function(){startReturnsImport();};
    document.head.appendChild(s);
    return;
  }
  progEl.textContent='⏳ Четене на файла...';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=window.XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      /* „По разлики" има свой формат („Стока за изтегляне по разлики") и свой
         път - „По рекламации" продължава по-долу, непроменен. */
      if(srTab==='diff'){ srImportDiffList(wb,progEl); return; }
      /* Автоматично разпознаване на формата - опитваме първо многолистовия ERP
         формат (по познати номера на листове); ако не намери нищо разпознаваемо,
         прехвърляме към единичния гъвкав лист. И в двата случая резултатът е
         за подтаб "Рекламации/срок на годност" - маркираме source изрично. */
      var mapped = parseDiffReturnsWorkbook(wb);
      var isWorkbook = mapped.length > 0;
      if(!mapped.length){
        mapped = parseComplaintReturnsSheet(wb,progEl);
        if(mapped===null) return; /* грешката вече е показана вътре в парсъра */
      }
      mapped.forEach(function(row){ row.source='complaint'; });
      if(!mapped.length){
        progEl.innerHTML='<span style="color:#dc2626;">Няма разпознати редове за импорт.</span>';
        return;
      }
      /* Импортът САМО ДОБАВЯ НОВИ редове (Цвети, 02.10.2026): тя качва
         списъка само за текущата седмица, а статусите, датите, куриерът и
         коментарите се поддържат в портала. Затова и при двата формата:
         · ПВ-ЕВР (purchase_order), който вече е в портала -> пропусни, нищо
           не се обновява (до 02.10.2026 многолистовият файл презаписваше реда
           и празна клетка триеше стойност в портала);
         · ред без ПВ-ЕВР -> пропусни и покажи поименно: при второ качване на
           същата седмица иначе става дубликат (към 02.10.2026 в базата няма
           такъв запис - 377 от 377 са с ПВ-ЕВР);
         · повтарящ се ПВ-ЕВР в самия файл -> влиза веднъж.
         Единичният лист („срок на годност") няма колона ПВ-ЕВР изобщо - там
         „същият ред" е магазин + SAP (без SAP - наименование) + срок на
         годност (srSingleSheetKey; решение на Тенчо от 02.10.2026). Иначе
         правилото „без ПВ-ЕВР -> пропусни" би спряло всеки негов ред. */
      progEl.textContent='⏳ Проверка за дублирани записи...';
      var poOf=function(r){ return String(r.purchase_order==null?'':r.purchase_order).trim(); };
      var keyOf=isWorkbook ? function(r){ var p=poOf(r); return p?'p|'+p:''; } : srSingleSheetKey;
      var posInFile=isWorkbook ? mapped.map(poOf).filter(function(p){return p;}) : [];
      /* Проверката е на партиди по 200 ПВ-ЕВР номера наведнъж - при файл с
         много редове, всички номера в 1 заявка биха надхвърлили лимита за
         дължина на URL адреса. */
      var uniquePos=posInFile.filter(function(p,i){return posInFile.indexOf(p)===i;});
      var DEDUP_BATCH=200;
      var dedupBatches=[];
      for(var di=0; di<uniquePos.length; di+=DEDUP_BATCH){
        dedupBatches.push(uniquePos.slice(di,di+DEDUP_BATCH));
      }
      /* sbGetOk, не sbGet: провалена проверка НЕ бива да изглежда като „няма
         нищо" - при импорт само на нови редове всеки ред би станал дубликат. */
      var storesInFile=mapped.map(function(r){ return String(r.store_name||'').trim(); });
      var dedupCheck = !isWorkbook
        /* Единичният лист: по обектите от файла (без обект в някой ред - всички
           записи „По рекламации"). */
        ? sbGetOk('stock_returns','source=eq.complaint&select=id,store_name,sap_code,product_name,expiry_date'+
            (storesInFile.every(function(x){return x;})
              ? '&store_name=in.('+storesInFile.filter(function(x,i,a){return a.indexOf(x)===i;}).map(function(x){return '"'+encodeURIComponent(x)+'"';}).join(',')+')'
              : '')).then(function(res){ if(!res.ok) throw new Error(res.error); return res.rows; })
        : dedupBatches.length
        ? Promise.all(dedupBatches.map(function(batchPos){
            return sbGetOk('stock_returns','source=eq.complaint&select=id,purchase_order&purchase_order=in.('+batchPos.map(function(p){return encodeURIComponent(p);}).join(',')+')');
          })).then(function(results){
            var bad=results.filter(function(r){ return !r.ok; })[0];
            if(bad) throw new Error(bad.error);
            var merged=[];
            results.forEach(function(r){ merged=merged.concat(r.rows); });
            return merged;
          })
        : Promise.resolve([]);
      dedupCheck.then(function(existing){
        var existingByKey={};
        existing.forEach(function(r){ var k=keyOf(r); if(k) existingByKey[k]=1; });

        /* "ПРИКЛЮЧЕНА" от файла - само за който може да приключва и в модала
           (canCompleteSR). Без това право новият ред влиза като "Взета". */
        var canComplete=canCompleteSR();
        var noRightNew=0;
        var toInsert=[], skippedExisting=0, repeatedInFile=0, noPoNames=[], seenKey={};
        /* „Коментар" и „Коментар контролер" са само на Цвети/admin (както в
           модала): без canCompleteSR() импортът не ги пише. Ключовете се махат
           от ВСИЧКИ редове еднакво, за да остане партидата с еднакви колони
           (PostgREST го изисква). */
        mapped.forEach(function(r){
          if(!canComplete){ delete r.control_comment; delete r.controller_comment; }
          var k=keyOf(r);
          if(!k){ noPoNames.push(r.product_name||r.sap_code||'(без наименование)'); return; }
          if(existingByKey[k]){ skippedExisting++; return; }
          if(seenKey[k]){ repeatedInFile++; return; }
          seenKey[k]=1;
          if(isWorkbook) r.purchase_order=poOf(r);
          if(r.status==='completed' && !canComplete){ r.status='taken'; noRightNew++; }
          /* Следата и при НОВ ред: файлът може да носи дата, а колоната трябва
             да казва, че е от импорт, не от обекта. Ключовете се слагат на
             ВСЕКИ ред еднакво (с null, когато дата няма) — партидата на
             srBatchImport иска еднакви колони. */
          r.confirmed_by = r.confirmed_date ? srImportActor() : null;
          r.confirmed_at = r.confirmed_date ? new Date().toISOString() : null;
          toInsert.push(r);
        });

        var summary=function(color, prefix){
          var h='<span style="color:'+color+';">'+prefix+'Нови: '+toInsert.length+
                ' · Пропуснати (вече в портала): '+skippedExisting+
                ' · Пропуснати (без ПВ-ЕВР): '+noPoNames.length+
                ' · Повторени във файла: '+repeatedInFile+'</span>';
          if(noPoNames.length){
            h+='<div style="color:#d97706;">⚠️ Без ПВ-ЕВР (не са качени): '+esc(noPoNames.join(', '))+'</div>';
          }
          if(noRightNew){
            h+='<div style="color:#d97706;">⚠️ „ПРИКЛЮЧЕНА" без право да приключваш: '+noRightNew+' (вмъкнати като „Взета")</div>';
          }
          return h;
        };
        if(!toInsert.length){
          progEl.innerHTML=summary('#d97706','⚠️ Няма нови редове. ');
          return;
        }
        progEl.textContent='⏳ Качване на 0 / '+toInsert.length+'...';
        srBatchImport(toInsert,function(done,total){
          progEl.textContent='⏳ Качване на '+done+' / '+total+'...';
        },function(insertErrors){
          var h=summary('#16a34a','✅ ');
          if(insertErrors>0){
            h+='<div style="color:#dc2626;">⚠️ '+insertErrors+' партиди с нови записи не минаха. Виж конзолата (F12).</div>';
          }
          progEl.innerHTML=h;
          if(!insertErrors) toast('✅ Импортът приключи успешно!');
          /* Без loadStockReturns() тук - виж closeReturnsImportModal(). */
          srImportFinish();
        });
      }).catch(function(err){
        progEl.innerHTML='<span style="color:#dc2626;">Грешка при проверка за дублирани: '+esc(err.message||String(err))+'</span>';
      });
    }catch(err){
      console.error('Грешка при четене на Excel:',err);
      progEl.innerHTML='<span style="color:#dc2626;">Грешка при четене на файла: '+esc(err.message||String(err))+'</span>';
    }
  };
  reader.readAsArrayBuffer(file);
}
/* Ключ „същият ред" за единичния лист, който няма ПВ-ЕВР (02.10.2026):
   магазин + SAP (без SAP - наименованието с главни букви) + срок на годност.
   Важи еднакво за ред от файла и за запис от базата. */
function srSingleSheetKey(r){
  var sap=String(r.sap_code||'').trim();
  return 's|'+String(r.store_name||'').trim()+'|'+(sap?sap:'n:'+String(r.product_name||'').trim().toUpperCase())+'|'+String(r.expiry_date||'').slice(0,10);
}
/* Парсва единичен лист "рекламации/срок на годност" с гъвкаво разпознати колони.
   Връща null (не []), ако вече е показал грешка в progEl - за да спре потока. */
function parseComplaintReturnsSheet(wb,progEl){
  var sheet=wb.Sheets[wb.SheetNames[0]];
  var rows=window.XLSX.utils.sheet_to_json(sheet,{defval:''});
  if(!rows.length){progEl.innerHTML='<span style="color:#dc2626;">Файлът е празен.</span>';return null;}
  var headers=Object.keys(rows[0]);
  var colProduct=srFindCol(headers,SR_IMPORT_COL_ALIASES.product);
  var colSap=srFindCol(headers,SR_IMPORT_COL_ALIASES.sap);
  var colQty=srFindCol(headers,SR_IMPORT_COL_ALIASES.qty);
  var colStore=srFindCol(headers,SR_IMPORT_COL_ALIASES.store);
  var colSupplier=srFindCol(headers,SR_IMPORT_COL_ALIASES.supplier);
  var colExpiry=srFindCol(headers,SR_IMPORT_COL_ALIASES.expiry);
  var colReason=srFindCol(headers,SR_IMPORT_COL_ALIASES.reason);
  if(!colProduct){
    progEl.innerHTML='<span style="color:#dc2626;">Не бе разпозната колона за продукт/наименование. Провери заглавията на колоните.</span>';
    return null;
  }
  return rows.map(function(row){
    return {
      product_name:String(row[colProduct]||'').trim(),
      sap_code:colSap?String(row[colSap]||'').trim():'',
      quantity:colQty?(parseFloat(row[colQty])||null):null,
      store_name:colStore?String(row[colStore]||'').trim():'',
      supplier:colSupplier?String(row[colSupplier]||'').trim():'',
      /* Същата функция като многолистовия импорт - чете и Excel сериен номер. */
      expiry_date:colExpiry?srParseFlexibleDate(row[colExpiry]):null,
      reason:colReason?String(row[colReason]||'').trim():'',
      source:'complaint',
      status:'pending',
      created_by:currentUser.display_name||currentUser.email
    };
  }).filter(function(x){return x.product_name;});
}
/* ── ЕКСПОРТ EXCEL ──
   Цветелина праща на доставчика какво има да вземе при него; досега това
   ставаше със скрийншот. Изнася се ТОЧНО текущо филтрираният списък
   (srFilteredList), не целият подтаб - два отделни списъка неминуемо се
   разминават, а разминаването се вижда чак когато доставчикът получи грешния
   файл.

   Двата подтаба имат НАРОЧНО различен формат:
   · "По разлики" - заглавен блок с приложените филтри, файл за четене от човек;
   · "По рекламации" - ОГЛЕДАЛО на многолистовия ERP импорт
     (parseDiffReturnsWorkbook), не на единичния лист: редовете в този подтаб
     идват оттам и полетата на единичния формат (продукт, SAP, срок) често са
     празни. Един лист на магазин, името му е номерът от SR_SHEET_TO_STORE.
     БЕЗ заглавен блок - импортът прескача точно един ред (заглавията) и чете
     колоните ПОЗИЦИОННО 0-10, тоест всеки ред отгоре би станал "запис", а
     разместена колона - грешно поле. Колоните 11+ (продукт, SAP, ...) импортът
     не чете; излизат само ако поне един ред ги има. */
/* Колоните на „По рекламации" - ЕДНО място за двата износа (един лист на
   магазин и един общ лист). 0-10 - позиционно, както ги чете
   parseDiffReturnsWorkbook; 11+ (продукт, SAP, ...) - само ако поне един
   ред ги има. Главни букви в статуса - както ги пише ERP файлът. Празна
   дата - празна клетка: клетката се чете обратно от импорта, а „—" там е
   боклук, не липсваща стойност. */
var SR_XL_STATUS={pending:'НЕВЗЕТА',taken:'ВЗЕТА',completed:'ПРИКЛЮЧЕНА'};
function srXlHasExtra(list){
  return list.some(function(r){
    return r.product_name||r.sap_code||r.quantity!=null||r.expiry_date||r.reason;
  });
}
function srXlHead(hasExtra){
  var head=['НОВА ПВ-ЕВР','НОВА ИД-ЕВРО','Доставчик','Дата на документ','Завод','Статус',
            'Дата на изтегляне','Изтеглена с','Потвърдена акт.','Коментар','Коментар контролер'];
  return hasExtra ? head.concat(['Продукт','SAP','Кол.','Срок на годност','Причина']) : head;
}
function srXlRow(r,hasExtra){
  var fd=function(v){ return v?fmtDate(v):''; };
  var line=[
    r.purchase_order||'', r.id_euro||'', r.supplier||'', fd(r.doc_date), r.plant||'',
    SR_XL_STATUS[r.status]||r.status||'', fd(r.withdrawal_date), r.courier_info||'',
    fd(r.confirmed_date), r.control_comment||'', r.controller_comment||''
  ];
  return hasExtra ? line.concat([
    r.product_name||'', r.sap_code||'', (r.quantity!=null?r.quantity:''),
    fd(r.expiry_date), r.reason||''
  ]) : line;
}
function srXlCols(hasExtra){
  var c=[{wch:14},{wch:12},{wch:22},{wch:12},{wch:8},{wch:12},{wch:14},{wch:18},
         {wch:14},{wch:26},{wch:26}];
  return hasExtra ? c.concat([{wch:34},{wch:10},{wch:7},{wch:14},{wch:26}]) : c;
}
/* oneSheet - „📥 Excel (един лист)" в „По рекламации"; иначе както досега. */
function exportSRExcel(oneSheet){
  if(!window.XLSX){
    var sc=document.createElement('script');
    /* Същият CDN като при импорта (startReturnsImport) - един източник, за да
       не се теглят две различни копия на SheetJS в една сесия. */
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    sc.onload=function(){ exportSRExcel(oneSheet); };
    sc.onerror=function(){ toast('Грешка при зареждане на SheetJS','#dc2626'); };
    document.head.appendChild(sc);
    return;
  }
  var list=srFilteredList();
  if(!list.length){ toast('Няма редове за износ','#dc2626'); return; }

  /* Етикети, не кодове: файлът отива при доставчика, "taken" не му говори. */
  var ROW_STATUS={pending:'Невзета',taken:'Взета',completed:'Приключена'};
  var FILTER_LABEL={all:'Всички',pending:'Невзета',taken:'Взета',completed:'Приключени'};
  /* Празната дата излиза празна, не с тире: в "По рекламации" клетката се чете
     обратно от импорта, а "—" там е боклук, не липсваща стойност. */
  var fd=function(v){ return v?fmtDate(v):''; };
  /* Локална транслитерация само за името на файла - "КАМ-04" става "kam-04".
     Кирилица в име на файл оцелява през браузъра, но не и през всеки пощенски
     клиент и споделена папка по пътя до доставчика. */
  var translit=function(str){
    var M={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i',
           'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s',
           'т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sht',
           'ъ':'a','ь':'y','ю':'yu','я':'ya'};
    return String(str||'').toLowerCase().split('').map(function(ch){
      return M.hasOwnProperty(ch)?M[ch]:ch;
    }).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  };

  var sheets=[]; /* [{name, aoa, cols}] - "По разлики" е един лист, "По рекламации" - по един на магазин */
  var aoa, cols;
  if(srTab==='diff'){
    aoa=[
      ['ТеМАХ — Стока за връщане'],
      ['Доставчик: '+(srSupplierFilter||'всички')],
      ['Магазин: '+(srStoreFilter||'всички')],
      ['Статус: '+(FILTER_LABEL[srFilter]||srFilter)],
      ['Дата: '+fmtDate(today())],
      [],
      ['Продукт','SAP','Кол.','Поръчка','ПВ-ЕВР','ИД-ЕВРО','Магазин','Доставчик',
       'Дата докум.','Завод','Статус','Дата изтегляне','Изтеглена с','Потвърдена акт.','Коментар обект','Коментар']
    ];
    list.forEach(function(r){
      aoa.push([
        r.product_name||'', r.sap_code||'', (r.quantity!=null?r.quantity:''),
        r.order_number||'', r.purchase_order||'', r.id_euro||'',
        r.store_name||'', r.supplier||'', fd(r.doc_date), r.plant||'',
        ROW_STATUS[r.status]||r.status||'', fd(r.withdrawal_date),
        r.courier_info||'', fd(r.confirmed_date), r.store_comment||'',
        /* Същият низ, който стои в колоната "Коментар" на екрана. */
        r.reason||r.control_comment||r.controller_comment||''
      ]);
    });
    cols=[{wch:34},{wch:10},{wch:7},{wch:14},{wch:14},{wch:12},{wch:16},{wch:22},
          {wch:12},{wch:8},{wch:12},{wch:14},{wch:18},{wch:14},{wch:26},{wch:26}];
    sheets.push({name:'По разлики', aoa:aoa, cols:cols});
  } else {
    /* Главни букви - както ги пише ERP файлът. Импортът разпознава и трите
       (parseDiffReturnsWorkbook); "ПРИКЛЮЧЕНА" се прилага само при право да
       приключваш (canCompleteSR) - иначе нов ред влиза като "Взета", а
       съществуващ си пази статуса. Приключен в портала ред не се пипа при
       обратно качване (hit.status==='completed' -> пропуск в startReturnsImport). */
    var hasExtra=srXlHasExtra(list);
    /* „📥 Excel (един лист)": същите колони (srXlHead/srXlRow), плюс „Магазин"
       най-отпред, в реда от екрана - за справка по доставчик наведнъж. Не се
       връща през импорта (листът не е номер от SR_SHEET_TO_STORE). */
    if(oneSheet){
      /* „Коментар обект" - на мястото си от екрана: след „Изтеглена с" (7),
         преди „Потвърдена акт." (8). Тук няма импорт, който да го мести. */
      var withCmt=function(arr,v){ var c=arr.slice(); c.splice(8,0,v); return c; };
      var one=[['Магазин'].concat(withCmt(srXlHead(hasExtra),'Коментар обект'))];
      list.forEach(function(r){ one.push([r.store_name||''].concat(withCmt(srXlRow(r,hasExtra),r.store_comment||''))); });
      sheets.push({name:'По рекламации', aoa:one, cols:[{wch:16}].concat(withCmt(srXlCols(hasExtra),{wch:26}))});
    }
    var storeToSheet={};
    Object.keys(SR_SHEET_TO_STORE).forEach(function(k){ storeToSheet[SR_SHEET_TO_STORE[k]]=k; });
    var byStore={}, order=[];
    list.forEach(function(r){
      var s=r.store_name||'';
      if(!byStore[s]){ byStore[s]=[]; order.push(s); }
      byStore[s].push(r);
    });
    /* Листовете в реда на номерата (като в ERP файла); магазини без номер - накрая. */
    order.sort(function(a,b){
      var ka=storeToSheet[a], kb=storeToSheet[b];
      if(ka&&kb) return Number(ka)-Number(kb);
      return (ka?0:1)-(kb?0:1);
    });
    var usedNames={};
    if(!oneSheet) order.forEach(function(s){
      /* Магазин без номер в SR_SHEET_TO_STORE: листът се казва като магазина,
         за да не се губят редове от износа - но импортът НЕ го разпознава и
         при обратно качване го прескача. Към 28.09.2026 всички магазини с
         рекламации имат номер. Excel не приема []:*?/\ и имена над 31 знака. */
      var name=storeToSheet[s]||(s.replace(/[\[\]:*?\/\\]/g,' ').trim().slice(0,31)||'Без магазин');
      var base=name, n=2;
      while(usedNames[name]){ name=base.slice(0,28)+'_'+n; n++; }
      usedNames[name]=true;
      /* „Коментар обект" - НАЙ-НАКРАЯ, след 0-10 и 11+: колоните 0-10 са
         огледало на импорта и не се местят, а импортът чете позиционно само тях. */
      var a=[srXlHead(hasExtra).concat(['Коментар обект'])];
      byStore[s].forEach(function(r){ a.push(srXlRow(r,hasExtra).concat([r.store_comment||''])); });
      sheets.push({name:name, aoa:a, cols:srXlCols(hasExtra).concat([{wch:26}])});
    });
  }

  var wb=window.XLSX.utils.book_new();
  sheets.forEach(function(sh){
    var ws=window.XLSX.utils.aoa_to_sheet(sh.aoa);
    ws['!cols']=sh.cols;
    window.XLSX.utils.book_append_sheet(wb,ws,sh.name);
  });
  var fname='za-vrashtane-'+(srTab==='diff'?'razliki':'reklamacii')+'-'+
            (srSupplierFilter?translit(srSupplierFilter):'vsichki')+
            (oneSheet&&srTab!=='diff'?'-edin-list':'')+'-'+today()+'.xlsx';
  window.XLSX.writeFile(wb,fname);
  toast('✅ Excel изтеглен! ('+list.length+' реда)');
}
function srBatchImport(rows,onProgress,onDone){
  var BATCH=300;
  var i=0;
  var errorCount=0;
  function next(){
    if(i>=rows.length){onDone(errorCount);return;}
    var batch=rows.slice(i,i+BATCH);
    sbPost('stock_returns',batch).then(function(res){
      if(!res.ok) errorCount++;
      i+=BATCH;
      onProgress(Math.min(i,rows.length),rows.length);
      next();
    }).catch(function(){errorCount++;i+=BATCH;next();});
  }
  next();
}

/* Обновява съществуващи редове по id. За разлика от srBatchImport тук всеки
   ред е ОТДЕЛНА заявка - PostgREST не приема различни тела в един PATCH -
   затова вървят на групи по 20 успоредно, вместо всичките наведнъж.
   Провалите се връщат ПОИМЕННО (ПВ-ЕВР номер), не като брой: числото "3
   грешки" не казва кой ред да се провери на ръка. Един провален ред не спира
   останалите. */
function srBatchUpdate(updates,onProgress,onDone){
  var BATCH=20;
  var i=0;
  var failed=[];
  function next(){
    if(i>=updates.length){onDone(failed);return;}
    var batch=updates.slice(i,i+BATCH);
    Promise.all(batch.map(function(u){
      return sbPatch('stock_returns','id=eq.'+u.id,u.data).then(function(res){
        if(!res.ok) failed.push(u.purchase_order||u.id);
      });
    })).then(function(){
      i+=BATCH;
      onProgress(Math.min(i,updates.length),updates.length);
      next();
    });
  }
  next();
}

function submitSR() {
  var store=(document.getElementById('sr-store').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  var tab=(document.getElementById('sr-source')||{}).value||srTab;
  var productEl=document.getElementById('sr-product'), sapEl=document.getElementById('sr-sap'), qtyEl=document.getElementById('sr-qty');
  /* Защита: ако записът вече е "completed" и текущият потребител няма права
     да задава/маха този статус (опцията липсва в dropdown-а му), не пипаме
     полето status изобщо - предотвратява случайно връщане към "pending"
     само защото select-ът визуално не показва избраната опция. */
  var origRecord = srEditId ? srData.find(function(x){return String(x.id)===String(srEditId);}) : null;
  var lockStatus = origRecord && origRecord.status==='completed' && !canCompleteSR();
  var data={
    store_name:     store,
    supplier:       document.getElementById('sr-supplier').value,
    source:         tab,
    withdrawal_date:document.getElementById('sr-wdate').value||null,
    confirmed_date: document.getElementById('sr-cdate').value||null,
    courier_info:   document.getElementById('sr-courier').value,
    control_comment:document.getElementById('sr-cc').value,
    photos:         srPendingPhotos,
    created_by:     currentUser.display_name||currentUser.email
  };
  if(!lockStatus) data.status = document.getElementById('sr-status').value;
  /* Бъдеща дата се отказва ТУК, не с CHECK в базата (решение на Тенчо,
     02.10.2026): два заварени реда носят 2028-09-02 и 2029-09-02 и CHECK би
     ги направил нередактируеми. Правилото и без това не ги зачита за
     актуализация — отказът е, за да не се появят нови. Проверява се винаги,
     включително когато датата не се мени: точно така двата стари реда ще
     излязат наяве при първата редакция. */
  if(data.confirmed_date && String(data.confirmed_date) > today()){
    toast('„Дата потвърдена актуализация" не може да е в бъдещето','#dc2626');
    return;
  }
  /* Следата за „кой постави датата" — само ако датата СЕ МЕНИ. При нов ред
     (няма origRecord) старата е null, тоест въведена дата веднага оставя
     следа. Актьорът се решава по ОБЕКТА НА РЕДА: потребител на същия обект е
     'store:<обект>', всеки друг — 'office:<име>'. */
  (function(){
    var trace=srConfirmedTrace(origRecord?origRecord.confirmed_date:null,
                               data.confirmed_date, srConfirmedActor(store));
    for(var k in trace){ if(Object.prototype.hasOwnProperty.call(trace,k)) data[k]=trace[k]; }
  })();
  /* Коментарите на Цвети - не се пращат изобщо от други (и с подправен DOM),
     иначе запис от магазина би изтрил написаното от нея. */
  var cmtLocked = srCommentsLocked(tab);
  if(cmtLocked) delete data.control_comment;
  /* Доказателство при ИЗЛИЗАНЕ ОТ "Невзета". Без товарителница доставчикът
     оспорва, че е получил стоката, и сумата по разликата не се възстановява -
     затова снимка, дата и куриер са задължителни, а не подсказка.
     Вързано е към прехода, не към самия статус: "Приключена" се задава директно
     и може да прескочи "Взета", иначе прескачането би заобиколило проверката.
     wasProven пази заварените записи - маркираните преди тази промяна не се
     блокират при следваща редакция (същият модел като isNowCompleted &&
     !wasCompleted в submitSD). При lockStatus статусът изобщо не се изпраща,
     значи няма преход и не се проверява нищо. Важи за двата таба - модалът е общ. */
  if(!lockStatus && (data.status==='taken' || data.status==='completed')){
    var wasProven = !!origRecord && (origRecord.status==='taken' || origRecord.status==='completed');
    if(!wasProven){
      /* data.controller_comment се попълва по-долу, по таба - затова тук се
         чете направо от полето. Какво се записва, не се променя. */
      var ctrlNow=document.getElementById('sr-ctrl');
      /* Заключен ли е коментарът (магазин в „По рекламации") - решава
         ЗАПИСАНОТО от Цвети, не полето: подправено „изхвърл…" в DOM-а иначе
         би отменило снимката. */
      var discard=srIsDiscard(cmtLocked ? (origRecord&&origRecord.controller_comment) : (ctrlNow?ctrlNow.value:''));
      var missing=[];
      if(!discard && !(Array.isArray(srPendingPhotos) && srPendingPhotos.length)) missing.push('снимка на товарителницата');
      if(!data.withdrawal_date) missing.push(discard?'дата на изхвърляне':'дата на изтегляне');
      var courier=(data.courier_info||'').trim();
      /* "—" и "-" не са куриер - махаме тиретата и празното място и проверяваме
         дали изобщо е останало нещо. */
      if(!discard && (courier.length<3 || !courier.replace(/[—–\-\s]/g,''))) missing.push('изтеглена от/с куриер');
      if(missing.length){
        toast((discard?'Изхвърляне — липсва ':'Липсва товарителница — ')+missing.join(', '),'#dc2626');
        return;
      }
    }
  }
  if (tab==='complaint') {
    var expEl=document.getElementById('sr-expiry'), reasonEl=document.getElementById('sr-reason');
    data.expiry_date = expEl?(expEl.value||null):null;
    data.reason = reasonEl?reasonEl.value:'';
    var poEl2=document.getElementById('sr-po'), ieEl2=document.getElementById('sr-ie'), plantEl2=document.getElementById('sr-plant');
    data.purchase_order = poEl2?poEl2.value:'';
    data.id_euro = ieEl2?ieEl2.value:'';
    data.plant = plantEl2?plantEl2.value:'';
    var docdateEl2=document.getElementById('sr-docdate');
    data.doc_date = docdateEl2?(docdateEl2.value||null):null;
    var ctrlEl2=document.getElementById('sr-ctrl');
    if(!cmtLocked) data.controller_comment = ctrlEl2?ctrlEl2.value:'';
    var storeCmtEl=document.getElementById('sr-store-cmt');
    if(storeCmtEl) data.store_comment = storeCmtEl.value.trim()||null;
  } else {
    data.product_name = productEl?productEl.value:'';
    data.sap_code     = sapEl?sapEl.value:'';
    data.quantity     = qtyEl?(parseFloat(qtyEl.value)||null):null;
    var poEl=document.getElementById('sr-po'), ieEl=document.getElementById('sr-ie'),
        plantEl=document.getElementById('sr-plant'), docdateEl=document.getElementById('sr-docdate'),
        ctrlEl=document.getElementById('sr-ctrl');
    data.purchase_order = poEl?poEl.value:'';
    data.id_euro = ieEl?ieEl.value:'';
    data.plant = plantEl?(plantEl.value||'5521'):'5521';
    data.doc_date = docdateEl?(docdateEl.value||null):null;
    var storeCmtEl1=document.getElementById('sr-store-cmt');
    if(storeCmtEl1) data.store_comment = storeCmtEl1.value.trim()||null;
    data.controller_comment = ctrlEl?ctrlEl.value:'';
    /* Само за ръчен ред. При ред от разлика не се праща изобщо - там номерът
       го пише submitSD. Решава записът (diff_line_id), не атрибутът readonly:
       той е за човека, а не защита. */
    var orderEl=document.getElementById('sr-order');
    if(orderEl && !(origRecord && origRecord.diff_line_id)){
      data.order_number = (orderEl.value||'').trim()||null;
    }
  }
  var p = srEditId
    ? sbPatch('stock_returns','id=eq.'+srEditId,data)
    : sbPost('stock_returns',data);
  p.then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeSRModal();
    toast('✅ '+(srEditId?'Записано!':'Добавено!'));
    loadStockReturns();
  });
}
