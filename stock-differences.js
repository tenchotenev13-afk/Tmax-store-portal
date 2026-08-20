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

function canEditSD() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
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
   разбират директно с магазините получатели. */
var LOGISTICS_WAREHOUSES = ['Логистичен склад Добрич','Логистичен склад Търговище'];
function isLogisticsWarehouseUser(){
  return currentUser && LOGISTICS_WAREHOUSES.indexOf(currentUser.store_name) >= 0;
}
var WH_RESPONSE_LABELS = {sent:'📤 Изпратено',will_send:'⏳ Ще се изпрати','return':'↩️ Обратно движение'};
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
  var canEdit = canEditSD();
  var canAdd  = canAddSD();

  var list = sdTableRows();

  var TYPE_LABELS = { writein:'📥 Заприхождаване', 'return':'↩️ Връщане', missing:'❓ Липса' };
  var TYPE_COLORS = { writein:'#2563eb', 'return':'#7c3aed', missing:'#dc2626' };

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
    var dirCounts = {supplier:0, interstore:0};
    sdData.forEach(function(r){
      if(!r.type) return;
      if(dirCounts.hasOwnProperty(sdLineDirection(r))) dirCounts[sdLineDirection(r)]++;
    });
    /* Брой НОВИ (непрегледани) бланки по посока - за да се вижда още от таба,
       че от другата страна чака нещо, без да се превключва. */
    var dirNew = {supplier:0, interstore:0};
    sdVisibleUnreviewedReports().forEach(function(rep){
      var d = rep.direction || 'supplier';
      if(dirNew.hasOwnProperty(d)) dirNew[d]++;
    });
    h += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
    [['supplier','📦 Разлики от доставчици'],['interstore','🔄 Разлики от междускладови трансфери']].forEach(function(t){
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
    missing:  sdTableRows({type:'missing'}).length
  };
  h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
  [['all','Всички типове'],['writein','📥 Заприхождаване ('+typeCounts.writein+')'],['return','↩️ Връщане ('+typeCounts['return']+')'],['missing','❓ Липса ('+typeCounts.missing+')']].forEach(function(f){
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
        '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+((r.quantity)||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.order_number||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.confirmed_date)+'</td>'+
        '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">'+creditCell+'</td>'+
        /* Снимките са прикачени на ниво БЛАНКА (differences_reports.photos), не
           на реда - затова не се виждаха тук, след като редът бъде решен и
           излезе от секцията "Нови подадени бланки" (напр. при директно
           решение "Липса" без коментар). */
        '<td style="padding:7px 10px;">'+diffReportPhotoThumbs(r.report_id)+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:500;">'+esc(r.comment||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#7c3aed;font-weight:500;">'+esc(r.resolution_comment||'')+(normSDAttachments(r.attachments).length?' 📎'+normSDAttachments(r.attachments).length:'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;">'+(r.warehouse_response?('<span style="color:#16a34a;font-weight:600;">'+(WH_RESPONSE_LABELS[r.warehouse_response]||r.warehouse_response)+'</span>'+(r.warehouse_comment?'<div style="font-size:10px;color:#64748b;">💬 '+esc(r.warehouse_comment)+'</div>':'')):'<span style="color:#cbd5e1;">—</span>')+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';

      if (canEdit && !isTaken) {
        var takenLabel = r.type==='return' ? '✅ Върната' : r.type==='missing' ? '✅ Изписана' : r.type==='writein' ? '📥 Заприходена' : '✅ Приета';
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
    if (!r.type) return false; /* още не е прегледан от Цветелина - показва се само в секцията "За преглед" */
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
function sdStatusWords(type){
  if(type==='writein') return {pending:'Незаприходена', taken:'Заприходена', pIcon:'⏳', tIcon:'📥'};
  return {pending:'Невзета', taken:'Взета', pIcon:'⏳', tIcon:'✅'};
}
/* За сборните карти и чипове, където изгледът смесва типове ("Всички типове"
   или "Липса"), нито "Взета", нито "Заприходена" е вярно за всички редове -
   там думите са неутрални. */
function sdCounterWords(typeFilter){
  if(typeFilter==='writein') return sdStatusWords('writein');
  if(typeFilter==='return')  return sdStatusWords('return');
  return {pending:'Чакащи', taken:'Приключени', pIcon:'⏳', tIcon:'✅'};
}
/* Баджът в реда знае типа на самия ред, затова там думата е точна винаги. */
function sdRowStatusBadge(r){
  function badge(bg,fg,txt){
    return '<span style="background:'+bg+';color:'+fg+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+txt+'</span>';
  }
  if(r.status==='received') return badge('#f0fdfa','#0d9488','📬 ПРИЕТА');
  var w = sdStatusWords(r.type);
  if(sdIsTaken(r)){
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
  var TYPE_LABELS={writein:'📥 Заприх.',return:'↩️ Връщане',missing:'❓ Липса'};
  /* Логистичните складове НИКОГА не виждат/пипат решението на Цвети - то е
     само за разлики с доставчици, независимо каква роля има складовият
     профил технически (напр. 'logistics'). */
  if(isLogisticsWarehouseUser()){
    if(l.type) return '<span style="color:#94a3b8;">— (за доставчици, не за вас)</span>';
    return '<span style="color:#cbd5e1;">—</span>';
  }
  if(!canReviewDiff()){
    if(l.type) return '<span style="color:#16a34a;font-weight:600;">✓ '+(TYPE_LABELS[l.type]||l.type)+'</span>';
    return '<span style="color:#94a3b8;">чака преглед</span>';
  }
  var TYPE_COLORS={writein:'#2563eb',return:'#7c3aed',missing:'#dc2626'};
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
    if(l.warehouse_comment) h2+='<div style="font-size:10px;color:#64748b;">💬 '+esc(l.warehouse_comment)+'</div>';
    return h2;
  }
  return '<span style="color:#94a3b8;">чака склада</span>';
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
      reason:'Излишък от разлика'+(line.supplier?' — '+line.supplier:''),
      status:'pending',
      source:'diff',
      diff_line_id:line.id,
      created_by:currentUser.display_name||currentUser.email
    };
    sbPost('stock_returns',data).then(function(){ cb(); }).catch(function(){ cb(); });
  }).catch(function(){ cb(); });
}
function resolveDiffLine(id,type){
  if(!canReviewDiff()){toast('Нямаш права за това действие','#dc2626');return;}
  var line=sdData.find(function(x){return String(x.id)===String(id);});
  if(!line)return;
  /* Котва към бланката, по която се работи - след пре-рендирането оставаме на
     нея, вместо да ни връща най-отгоре на списъка. */
  sdKeepScroll(line.report_id);
  var resolvedAt=new Date().toISOString();
  sbPatch('stock_differences','id=eq.'+id,{type:type,status:'pending',resolved_by:sdActor(),resolved_at:resolvedAt}).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    line.type=type; line.status='pending'; line.resolved_by=sdActor(); line.resolved_at=resolvedAt; /* локално, за незабавна проверка по-долу без чакане на reload */
    var finish=function(){
      var siblingLines=sdData.filter(function(x){return x.report_id===line.report_id;});
      var allResolved = siblingLines.length>0 && siblingLines.every(function(x){return !!x.type;});
      if(allResolved && line.report_id){
        sbPatch('differences_reports','id=eq.'+line.report_id,{reviewed:true}).then(function(){
          toast('✅ Решено — бланката е напълно прегледана!');
          loadStockDiff();
        });
      } else {
        toast('✅ Записано!');
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

function sdDelete(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('stock_differences','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadStockDiff(); });
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
  var storeLocked = isResolved && !canReview;
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
      '</select>';
  } else {
    var typeLabels={writein:'📥 Заприхождаване',return:'↩️ Връщане',missing:'❓ Липса'};
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
    var finish=function(){
      closeSDModal();
      toast('✅ '+(sdEditId?'Записано!':'Добавено!'));
      loadStockDiff();
    };
    var lineId = sdEditId || (res.row && res.row.id);
    if(needsReturn && lineId){
      /* Наследява поведението на autoCreateReturnFromDiff: тя поглъща
         собствените си грешки тихо и вика cb() при всякакъв изход. */
      autoCreateReturnFromDiff({
        id:            lineId,
        store_name:    data.store_name,
        supplier:      data.supplier,
        material_name: data.material_name,
        material_code: data.material_code,
        quantity:      data.quantity
      },finish);
      return;
    }
    finish();
  });
}

/* ══════════════════════════════════════════
   ПОДАВАНЕ НА БЛАНКА ЗА РАЗЛИКИ (магазинска страна)
══════════════════════════════════════════ */

var DIFF_CATEGORIES = [
  /* [key, label, посоки[], снимки задължителни?, подсказка за доп. имейл] */
  ['undelivered','📦 Недоставен артикул (липса)', ['supplier','interstore'], false, null],
  ['excess','📈 Излишък (получен в повече)', ['supplier','interstore'], false, null],
  ['wrong_item','❌ Грешен артикул (не е поръчван)', ['supplier'], false, null],
  ['pack_mismatch','📦 Разлика от фабрична опаковка', ['interstore'], true, 'm.pavlova@temax.bg'],
  ['damaged','💔 Увредена стока / липсват части', ['supplier','interstore'], true, null],
  ['wrong_barcode','🏷️ Грешен баркод / етикет / описание', ['supplier','interstore'], true, 'j.jeliazkov@temax.bg, m.pavlova@temax.bg'],
  ['similar_item','🎨 Сходен артикул (различен цвят/размер)', ['interstore'], false, 'm.pavlova@temax.bg (за ZPACK корекция)']
];
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
     (sdDirTabsActive()?' <span style="font-weight:500;color:#7c3aed;">· '+(sdDirTab==='supplier'?'📦 Доставчик':'🔄 Междускладов трансфер')+'</span>':'')+'</div>';
  unreviewed.forEach(function(rep){
    var lines = sdData.filter(function(x){return x.report_id===rep.id;});
    var wasCorrected = lines.some(function(l){return !!l.store_corrected_at;});
    /* Прогрес по бланката - колко реда вече са решени от Цвети. Без това
       трябваше да се изчете всеки ред, за да се разбере докъде е стигнала. */
    var doneCount = lines.filter(function(l){return !!l.type;}).length;
    var totalCount = lines.length;
    var inProgress = doneCount > 0 && doneCount < totalCount;
    var pct = totalCount ? Math.round(doneCount*100/totalCount) : 0;
    /* id-то е котвата, към която се връщаме след пре-рендиране (виж sdKeepScroll) */
    h+='<div id="diff-rep-'+rep.id+'" style="background:#fff;border:1px solid '+(wasCorrected?'#fbbf24':(inProgress?'#a7f3d0':'#e9d5ff'))+';border-left:4px solid '+(wasCorrected?'#f59e0b':(inProgress?'#10b981':'#c4b5fd'))+';border-radius:8px;padding:12px;margin-bottom:8px;'+(wasCorrected?'box-shadow:0 0 0 1px #fde68a;':'')+'">';
    h+='<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
    h+='<div><span style="font-weight:700;">🏪 '+esc(rep.store_name||'')+'</span>'+
       (wasCorrected?' <span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">✏️ КОРИГИРАНА</span>':'')+
       (totalCount?' <span title="Решени редове от тази бланка" style="background:'+(inProgress?'#ecfdf5':'#f5f3ff')+';color:'+(inProgress?'#047857':'#6d28d9')+';padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">'+(doneCount?'⏳ '+doneCount+'/'+totalCount+' решени':'⬜ 0/'+totalCount+' — недокосната')+'</span>':'')+
       '<span style="color:#94a3b8;font-size:12px;margin-left:8px;">'+(rep.direction==='supplier'?'📦 Доставчик':'🔄 Междускладов')+' — '+esc(rep.counterpart||'')+'</span></div>'+
       '<div style="display:flex;align-items:center;gap:8px;">'+
       '<span style="font-size:11px;color:#94a3b8;">'+fmtDate(rep.doc_date)+(rep.document_number?' · Док. '+esc(rep.document_number):'')+'</span>'+
       (rep.email_sent_at?'<span style="font-size:10.5px;color:#16a34a;font-weight:600;">✉️ Изпратен '+sdFmtDateTime(rep.email_sent_at)+'</span>':'')+
       '<button data-rid="'+rep.id+'" onclick="loadDiffPrint(this.dataset.rid)" title="Печат на бланката" style="border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">🖨 Печат</button>'+
       (canSendDiffEmail()?'<button data-rid="'+rep.id+'" onclick="openDiffEmailModal(this.dataset.rid)" style="border:none;background:#0ea5e9;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">✉️ Изпрати имейл</button>':'')+
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
      h+='<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6px;">';
      h+='<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">SAP</th><th style="padding:3px 6px;">Артикул</th><th style="padding:3px 6px;">Категория</th><th style="padding:3px 6px;text-align:right;">По вх. дост.</th>'+
        (repIsSupplier?'<th style="padding:3px 6px;text-align:right;">По стокова</th>':'')+
        '<th style="padding:3px 6px;text-align:right;">Реално</th><th style="padding:3px 6px;">Коментар (магазин)</th><th style="padding:3px 6px;">Коментар (Цвети)</th><th style="padding:3px 6px;">Решение (Цвети)</th><th style="padding:3px 6px;">Отговор на склада</th></tr>';
      lines.forEach(function(l){
        /* Решените редове затихват в зелено, за да изпъкват НЕрешените -
           корекцията от магазина (жълто) има приоритет, тя е по-спешна. */
        var rowBg = l.store_corrected_at ? 'background:#fffbeb;' : (l.type ? 'background:#f0fdf4;color:#64748b;' : '');
        h+='<tr style="border-top:1px solid #f1f5f9;'+rowBg+'">'+
          '<td style="padding:3px 6px;font-family:DM Mono,monospace;">'+esc(l.material_code||'')+'</td>'+
          '<td style="padding:3px 6px;">'+esc(l.material_name||'')+(l.store_corrected_at?' <span title="Коригирано от магазина">✏️</span>':'')+'</td>'+
          '<td style="padding:3px 6px;">'+diffCategoryLabel(l.difference_category)+'</td>'+
          '<td style="padding:3px 6px;text-align:right;">'+(l.quantity!=null?l.quantity:'—')+'</td>'+
          (repIsSupplier?'<td style="padding:3px 6px;text-align:right;">'+(l.quantity_supplier_doc!=null?l.quantity_supplier_doc:'—')+'</td>':'')+
          '<td style="padding:3px 6px;text-align:right;">'+(l.quantity_received!=null?l.quantity_received:'—')+'</td>'+
          '<td style="padding:3px 6px;color:#64748b;">'+esc(l.comment||'')+'</td>'+
          '<td style="padding:3px 6px;color:#7c3aed;">'+esc(l.resolution_comment||'')+diffAttachmentThumbs(l)+'</td>'+
          '<td style="padding:3px 6px;white-space:nowrap;">'+diffLineResolveButtons(l)+
          (canReviewDiff()&&!isLogisticsWarehouseUser()?' <button data-lid="'+l.id+'" onclick="openSDModal(this.dataset.lid)" title="Добави коментар/прикачи документ" style="border:1px solid #ddd6fe;background:#f5f3ff;color:#5b21b6;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">💬</button>':'')+
          (canEditSD()&&!l.type&&currentUser.store_name===rep.store_name?' <button data-lid="'+l.id+'" onclick="openSDCorrectModal(this.dataset.lid)" title="Коригирай количество/SAP код" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">✏️</button>':'')+
          '</td>'+
          '<td style="padding:3px 6px;white-space:nowrap;">'+diffWarehouseResolveButtons(l,rep)+'</td>'+
        '</tr>';
      });
      h+='</table>';
    }
    if(rep.general_comment) h+='<div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-bottom:6px;">💬 '+esc(rep.general_comment)+'</div>';
    var photos = Array.isArray(rep.photos)?rep.photos:[];
    if(photos.length){
      h+='<div style="display:flex;gap:6px;flex-wrap:wrap;">';
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
  var existing = document.getElementById('sdc-ov'); if(existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = '<div class="bov open" id="sdc-ov"><div class="bmod" style="width:420px;">'+
    '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">✏️ Коригирай подадената разлика</div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Ако сте открили стоката или сте сгрешили бройка/код при подаването.</div>'+
    '<div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;">'+
    '<div><label class="fl">SAP код</label><input class="fi" id="sdc-sap" value="'+escVal(l.material_code)+'"></div>'+
    '<div><label class="fl">Наименование</label><input class="fi" id="sdc-name" value="'+escVal(l.material_name)+'"></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">По документ</label><input type="number" step="0.001" class="fi" id="sdc-qty" value="'+(l.quantity!=null?l.quantity:'')+'"></div>'+
    '<div><label class="fl">Реално получено</label><input type="number" step="0.001" class="fi" id="sdc-qty-real" value="'+(l.quantity_received!=null?l.quantity_received:'')+'"></div>'+
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
    '<div style="display:grid;grid-template-columns:'+(direction==='supplier'?'1fr 1fr 1fr 1fr':'1fr 1fr 1fr')+';gap:6px;margin-bottom:6px;">'+
      '<input type="number" step="0.001" class="fi di-qty" placeholder="По вх. доставка" value="'+(item.qty!=null?item.qty:'')+'">'+
      (direction==='supplier'?'<input type="number" step="0.001" class="fi di-qty-supdoc" placeholder="По стокова на дост." value="'+(item.qtySupplierDoc!=null?item.qtySupplierDoc:'')+'">':'')+
      '<input type="number" step="0.001" class="fi di-qty-real" placeholder="Реално получено" value="'+(item.qtyReal!=null?item.qtyReal:'')+'">'+
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
    '<div><label class="fl">Посока *</label><select class="fi" id="diff-direction" onchange="updateDiffCounterpartLabel()">'+
      '<option value="interstore">🔄 Междускладов трансфер</option>'+
      '<option value="supplier">📦 Доставчик</option>'+
    '</select></div>'+
    '<div><label class="fl">Магазин *</label>'+storeField+'</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'+
    '<div><label class="fl" id="diff-counterpart-label">Обект изпращач</label><select class="fi" id="diff-counterpart"></select></div>'+
    '<div><label class="fl">Документ №</label><input class="fi" id="diff-docnum" placeholder="напр. 4600179694"></div>'+
    '</div>'+
    '<div style="margin-bottom:12px;"><label class="fl">Дата на получаване/доставка</label><input type="date" class="fi" id="diff-docdate" value="'+today()+'" style="max-width:200px;"></div>'+

    '<label class="fl">Артикули с разлика *</label>'+
    '<div id="diff-items"></div>'+
    '<button type="button" onclick="addDiffItemRow()" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-bottom:12px;">+ Добави артикул</button>'+

    '<label class="fl">Снимки <span style="color:#94a3b8;font-weight:400;">(задължителни при увредена стока, грешен баркод, разлика от опаковка, липса)</span></label>'+
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
  if(dir==='supplier'){
    lbl.textContent='Доставчик';
    loadAllSuppliers().then(function(list){
      sel.innerHTML='<option value="">-- Избери доставчик --</option>'+list.map(function(n){return '<option>'+esc(n)+'</option>';}).join('');
    });
  } else {
    lbl.textContent='Обект изпращач';
    loadAllStores().then(function(){
      fillStoreSelect(sel,'');
    });
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

function openDiffSubmitModal(){
  diffPendingPhotos=[];
  var old=document.getElementById('diff-submit-ov'); if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',diffSubmitModalHtml());
  renderDiffItemRows([{}]);
  var ov=document.getElementById('diff-submit-ov');
  ov.classList.add('open');
  updateDiffCounterpartLabel(); /* зарежда магазини (посоката по подразбиране е "Междускладов")*/

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
  /* Започнат ред без наименование спира подаването и се посочва поименно -
     иначе се губеше тихо (collectDiffItems го изхвърля). */
  var missingName=diffRowsMissingName();
  if(missingName.length){
    toast((missingName.length===1?'Ред ':'Редове ')+missingName.join(', ')+': впиши наименование на артикула','#dc2626');
    diffFocusRowName(missingName[0]);
    return;
  }
  if(!items.length){toast('Добави поне един артикул с наименование','#dc2626');return;}

  /* Реална проверка за задължителни снимки (не само текстова подсказка) -
     ако поне 1 артикул е с категория, изискваща снимки, а няма качена нито 1 */
  var needsPhotos=items.some(function(it){
    var meta=it.category?diffCatMeta(it.category):null;
    return meta&&meta[3];
  });
  if(needsPhotos&&!diffPendingPhotos.length){
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

function diffEmailBodyHtml(rep,lines,note){
  var h='<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">';
  h+='<p>Здравейте,</p>';
  h+='<p>Установени са разлики при '+(rep.direction==='supplier'?'приемане на доставка':'междускладов трансфер')+' — '+esc(rep.counterpart||'')+
     (rep.document_number?', документ №'+esc(rep.document_number):'')+
     (rep.doc_date?', дата '+fmtDate(rep.doc_date):'')+'.</p>';
  var isSupplier=rep.direction==='supplier';
  h+='<table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;">';
  h+='<tr style="background:#f3f4f6;"><th style="border:1px solid #ccc;padding:6px;text-align:left;">SAP №</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Артикул</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Категория</th><th style="border:1px solid #ccc;padding:6px;text-align:right;">По вх. доставка</th>'+
    (isSupplier?'<th style="border:1px solid #ccc;padding:6px;text-align:right;">По стокова на дост.</th>':'')+
    '<th style="border:1px solid #ccc;padding:6px;text-align:right;">Реално</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Коментар</th></tr>';
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
  /* Коментар на Цветелина (resolution_comment) - полето е на ниво ред, не на
     ниво бланка, затова събираме тези от всички редове с непразен коментар. */
  var tsvetiComments = lines.filter(function(l){return l.resolution_comment;});
  if(tsvetiComments.length){
    h+='<p>💬 <strong>Коментар:</strong><br>';
    tsvetiComments.forEach(function(l){
      h+=esc(l.material_name||l.material_code||'')+' — '+esc(l.resolution_comment)+'<br>';
    });
    h+='</p>';
  }
  h+='<p>Поздрави,<br>'+esc(currentUser.display_name||currentUser.email)+'<br>ТеМАХ</p>';
  h+='</div>';
  return h;
}

function diffEmailModalHtml(rep,lines){
  var subject=(rep.document_number?rep.document_number+' - ':'')+'РАЗЛИКИ ('+esc(rep.store_name||'')+')';
  return '<div class="bov" id="diff-email-ov"><div class="bmod" style="width:680px;max-height:90vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:16px;font-weight:700;">✉️ Изпрати имейл до '+(rep.direction==='supplier'?'доставчик':'изпращач')+'</div>'+
    '<button onclick="closeDiffEmailModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<label class="fl">До (имейл на '+(rep.direction==='supplier'?'доставчика':'обекта изпращач')+') *</label>'+
    '<input class="fi" id="de-to" list="de-supplier-list" placeholder="name@supplier.bg">'+
    '<datalist id="de-supplier-list"></datalist>'+

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

    '<div style="font-size:12px;color:#64748b;margin-top:8px;" id="de-photos-note">📎 Ще бъдат прикачени '+((rep.photos||[]).length)+' снимк'+((rep.photos||[]).length===1?'а':'и')+' от бланката.</div>'+

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
}

function diffUrlToBase64(url){
  return fetch(url).then(function(r){return r.blob();}).then(function(blob){
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onloadend=function(){ resolve(String(reader.result).split(',')[1]||''); };
      reader.onerror=reject;
      reader.readAsDataURL(blob);
    });
  });
}

function sendDiffEmail(reportId){
  if(!canSendDiffEmail()){toast('Нямаш права за това действие','#dc2626');return;}
  var rep=diffReports.find(function(r){return String(r.id)===String(reportId);});
  if(!rep){toast('Бланката не е намерена','#dc2626');return;}
  var to=(document.getElementById('de-to').value||'').trim();
  if(!to){toast('Въведи имейл на получателя','#dc2626');return;}
  var cc=(document.getElementById('de-cc').value||'').trim();
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
    var attachments=atts.filter(Boolean);
    if(btn) btn.textContent='⏳ Изпращане...';
    return sendEmail(to,subject,bodyHtml,{cc:cc||undefined,reply_to:replyTo||undefined,attachments:attachments});
  }).then(function(res){
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
  var isSupplier = rep.direction==='supplier';
  var photos = Array.isArray(rep.photos) ? rep.photos : [];
  var imgs  = photos.filter(function(p){ return p && p.url && DIFF_IMG_RE.test(p.url); });
  var files = photos.filter(function(p){ return p && p.url && !DIFF_IMG_RE.test(p.url); });
  /* general_comment е празен НИЗ, не NULL, във всичките заварени бланки -
     затова проверката е по trim(), не по истинност. */
  var genComment = (rep.general_comment||'').trim();

  var TYPE_LABELS = { writein:'📥 Заприхождаване', 'return':'↩️ Връщане', missing:'❓ Липса' };
  /* Същата логика като sdRowStatusBadge, но без цветната таблетка - на хартия
     остава само думата. */
  var statusText = function(r){
    if(r.status==='received') return '📬 ПРИЕТА';
    var w = sdStatusWords(r.type);
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
       padding-ът се ДОБАВЯ върху зададената ширина и десетте колони излизат
       32mm извън листа (10 × 3.2mm), тоест последната се отрязва. */
    /* white-space:normal бие глобалното th{white-space:nowrap} от index.html
       (ред 67). Печатът се рендира В страницата, тоест наследява целия ѝ CSS -
       без това заглавия като "Тип на решение" отказват да се пречупят и
       изпъпват извън клетките си. Глобалното правило не се пипа: то обслужва
       всички останали таблици в портала. */
    '.dp-tbl th{box-sizing:border-box;border:1px solid #999;padding:1.2mm 1.6mm;font-size:7.5pt;text-align:left;background:#eee;font-weight:700;white-space:normal;word-break:normal;overflow-wrap:break-word;}'+
    '.dp-tbl td{box-sizing:border-box;border:1px solid #bbb;padding:1.2mm 1.6mm;font-size:8pt;vertical-align:top;word-break:normal;overflow-wrap:break-word;}'+
    /* Възстановява долната граница на последния ред. index.html:69 има
       tr:last-child td{border-bottom:none}, което бие ".dp-tbl td" по
       специфичност (0,1,2 срещу 0,1,1) и оставя рамката на таблицата отворена
       отдолу. Тук специфичността е изравнена, а правилото идва по-късно. */
    '.dp-tbl tr:last-child td{border-bottom:1px solid #bbb;}'+
    '.dp-num{text-align:right;}'+
    '.p-sub{font-size:7pt;color:#555;}'+
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
      '<td class="dp-num">'+(l.quantity_received!=null?l.quantity_received:'—')+'</td>'+
      '<td>'+(l.type?(TYPE_LABELS[l.type]||l.type):'—')+'</td>'+
      '<td>'+statusText(l)+'</td>'+
      '<td>'+whoWhen(l.resolved_by,l.resolved_at)+'</td>'+
      '<td>'+whoWhen(l.completed_by,l.completed_at)+'</td>'+
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
        '<div class="dp-sub">'+(isSupplier?'Разлика при приемане на доставка от доставчик':'Разлика при междускладов трансфер')+'</div>'+
        '<table class="dp-meta">'+
          '<tr><td>'+(isSupplier?'Доставчик:':'Обект изпращач:')+'</td><td>'+esc(rep.counterpart||'—')+'</td></tr>'+
          '<tr><td>Документ №:</td><td>'+esc(rep.document_number||'—')+'</td></tr>'+
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
             Без него сумата тук е подвеждаща: реалната ширина беше 222mm. */
          '<thead><tr>'+
            '<th style="width:8mm;">№</th>'+
            '<th style="width:18mm;">SAP</th>'+
            '<th style="width:44mm;">Наименование</th>'+
            '<th style="width:11mm;">Кол.</th>'+
            '<th style="width:13mm;">Получено</th>'+
            '<th style="width:22mm;">Тип на решение</th>'+
            '<th style="width:20mm;">Статус</th>'+
            '<th style="width:15mm;">Решил</th>'+
            '<th style="width:15mm;">Изпълнил</th>'+
            '<th style="width:24mm;">Коментар</th>'+
          '</tr></thead>'+
          '<tbody>'+(rowsHtml||'<tr><td colspan="10" style="text-align:center;color:#666;">Няма редове по тази бланка.</td></tr>')+'</tbody>'+
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
      /* Бланка, по която складът вече е отговорил на ВСИЧКИ редове, вече не
         чака него - не бива да виси като спешна на таба. */
      var repLines = (lines||[]).filter(function(x){ return x.report_id===r.id; });
      if(!repLines.length) return true;
      return !repLines.every(function(l){ return !!l.warehouse_response; });
    }).length;
  }
  if(canReviewDiff()) return unrev.length;
  /* Магазин - само своите (сървърната заявка вече е ограничена по store_name,
     но филтрираме и тук, за да е коректно и при няколко назначени обекта). */
  var mine = assignedStores();
  if(!mine) return unrev.length;
  return unrev.filter(function(r){ return mine.indexOf(r.store_name) >= 0; }).length;
}
function sdUpdateTabBadgeFromData(){
  sdSetTabBadge(sdUnreviewedCountFor(diffReports, sdData));
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
  var qLines = 'select=report_id,warehouse_response';
  if(isLogisticsWarehouseUser()){
    q += '&counterpart=eq.' + encodeURIComponent(currentUser.store_name);
  } else if(!canReviewDiff()){
    q += storeQ();
  }
  sbGet('differences_reports', q).then(function(reports){
    if(!Array.isArray(reports)){ return; }
    if(!isLogisticsWarehouseUser()){
      sdSetTabBadge(sdUnreviewedCountFor(reports, []));
      return;
    }
    /* Само за складовете ни трябват и редовете (за да пропуснем бланките,
       на които вече са отговорили изцяло). */
    if(!reports.length){ sdSetTabBadge(0); return; }
    sbGet('stock_differences', qLines + '&report_id=in.(' + reports.map(function(r){return r.id;}).join(',') + ')')
      .then(function(lines){
        sdSetTabBadge(sdUnreviewedCountFor(reports, Array.isArray(lines)?lines:[]));
      }).catch(function(){ sdSetTabBadge(reports.length); });
  }).catch(function(){});
}
function startSDBadgePolling(){
  if(_sdBadgePoll) clearInterval(_sdBadgePoll);
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
