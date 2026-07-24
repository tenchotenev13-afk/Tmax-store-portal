/* stock-returns.js — Стока за връщане */

var srData   = [];
var srFilter = 'pending';
var srEditId = null;
var srTab    = 'diff'; /* 'diff' = по разлики (автоматично) | 'complaint' = по рекламации/срок на годност */
function setSRTab(t){ srTab=t; srEditId=null; renderStockReturns(); }

function canEditSR() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
function canAddSR() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}

function loadStockReturns() {
  var wrap = document.getElementById('mod-stock-returns');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  sbGet('stock_returns', 'order=doc_date.desc' + storeQ()).then(function(data) {
    srData = Array.isArray(data) ? data : [];
    renderStockReturns();
  }).catch(function(err) {
    var w = document.getElementById('mod-stock-returns');
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
    console.error(err);
  });
}

function renderStockReturns() {
  var wrap = document.getElementById('mod-stock-returns');
  if (!wrap) return;
  var isAdmin = currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
  var canEdit = canEditSR();
  var canAdd  = canAddSR();

  var tabData = srData.filter(function(r){ return (r.source||'diff') === srTab; });
  var list = tabData.filter(function(r) {
    if (srFilter === 'pending')  return r.status === 'pending';
    if (srFilter === 'taken')    return r.status === 'taken';
    return true;
  });

  var pending = tabData.filter(function(r){ return r.status==='pending'; }).length;
  var taken   = tabData.filter(function(r){ return r.status==='taken'; }).length;

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📦 Стока за връщане</div>';
  h += '<div style="display:flex;gap:8px;">';
  if (canAdd) h += '<button onclick="openSRModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
  if (canAdd) h += '<button onclick="openReturnsImportModal()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📤 Импорт от Excel</button>';
  h += '</div></div>';

  /* Подтабове */
  h += '<div style="display:flex;gap:0;margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;max-width:560px;">';
  [['diff','🔄 По разлики'],['complaint','📋 По рекламации / срок на годност']].forEach(function(t){
    var a=srTab===t[0];
    h+='<button onclick="setSRTab(\''+t[0]+'\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:'+(a?'#2f2f2f':'#fff')+';color:'+(a?'#fff':'#64748b')+';">'+t[1]+'</button>';
  });
  h += '</div>';

  /* Карти */
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;max-width:400px;">';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #f59e0b;"><div style="font-size:11px;color:#64748b;">⏳ Невзета</div><div style="font-size:28px;font-weight:700;color:#f59e0b;font-family:DM Mono,monospace;">'+pending+'</div></div>';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #16a34a;"><div style="font-size:11px;color:#64748b;">✅ Взета</div><div style="font-size:28px;font-weight:700;color:#16a34a;font-family:DM Mono,monospace;">'+taken+'</div></div>';
  h += '</div>';

  /* Важна бележка */
  if (srTab==='diff') {
    h += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;">ℹ️ Записите тук се наливат автоматично, когато Цветелина маркира разлика като "Връщане" (излишък, получен в повече). Стоката се маркира като ВЗЕТА само след като е физически предадена на куриер/транспорт.</div>';
  } else {
    h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#856404;">⚠️ Стоката се маркира като ВЗЕТА само след като е физически предадена на куриер или транспорт.</div>';
  }

  /* Филтри */
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  [['all','Всички ('+tabData.length+')'],['pending','⏳ Невзета ('+pending+')'],['taken','✅ Взета ('+taken+')']].forEach(function(f){
    var a = srFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setSRFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
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

/* Таблица за подтаб "По разлики" - комбинира старите ERP полета (ПВ-ЕВР/ИД-ЕВРО/Завод,
   ползвани от 28-те съществуващи ръчно добавени записа) И новите продукт/SAP/количество
   полета (попълвани автоматично при наливане от разлика) - нищо не се губи визуално. */
function renderSRTableDiff(list, canEdit, isAdmin) {
  var h = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1300px;">';
  h += '<thead><tr style="background:#f8fafc;">';
  ['Продукт','SAP','Кол.','ПВ-ЕВР','ИД-ЕВРО','Магазин','Доставчик','Дата докум.','Завод','Статус','Дата изтегляне','Изтеглена с','Коментар',''].forEach(function(c){
    h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
  });
  h += '</tr></thead><tbody>';
  list.forEach(function(r) {
    var isTaken = r.status === 'taken';
    var statusBadge = isTaken
      ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ ВЗЕТА</span>'
      : '<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⏳ НЕВЗЕТА</span>';
    h += '<tr style="border-bottom:1px solid #f1f5f9;'+(r.diff_line_id?'background:#f5f3ff;':'')+'">' +
      '<td style="padding:7px 10px;max-width:180px;">'+esc(r.product_name||'')+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.sap_code||'')+'</td>'+
      '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+((r.quantity)||'')+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.purchase_order||'')+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:#64748b;">'+esc(r.id_euro||'')+'</td>'+
      '<td style="padding:7px 10px;font-weight:500;">'+esc(r.store_name||'')+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#64748b;max-width:130px;">'+esc(r.supplier||'')+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.doc_date)+'</td>'+
      '<td style="padding:7px 10px;text-align:center;color:#94a3b8;">'+esc(r.plant||'')+'</td>'+
      '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.withdrawal_date)+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;max-width:140px;color:#374151;">'+esc(r.courier_info||'')+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:500;max-width:150px;">'+esc(r.reason||r.control_comment||r.controller_comment||'')+'</td>'+
      '<td style="padding:7px 10px;white-space:nowrap;">'+srRowActions(r,isTaken,canEdit,isAdmin)+'</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div style="font-size:11px;color:#94a3b8;margin-top:6px;">🟣 Лилав фон = автоматично наляно от разлика</div>';
  return h;
}

/* Таблица за подтаб "По рекламации / срок на годност" - нови, специфични колони */
function renderSRTableComplaint(list, canEdit, isAdmin) {
  var h = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1000px;">';
  h += '<thead><tr style="background:#f8fafc;">';
  ['Продукт','SAP','Кол.','Магазин','Доставчик','Срок на годност','Причина','Статус','Коментар',''].forEach(function(c){
    h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
  });
  h += '</tr></thead><tbody>';
  list.forEach(function(r) {
    var isTaken = r.status === 'taken';
    var statusBadge = isTaken
      ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ ВЗЕТА</span>'
      : '<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⏳ НЕВЗЕТА</span>';
    var expSoon = r.expiry_date && (new Date(r.expiry_date) - new Date()) < 14*86400000;
    h += '<tr style="border-bottom:1px solid #f1f5f9;">' +
      '<td style="padding:7px 10px;max-width:200px;">'+esc(r.product_name||'')+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.sap_code||'')+'</td>'+
      '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+((r.quantity)||'')+'</td>'+
      '<td style="padding:7px 10px;font-weight:500;">'+esc(r.store_name||'')+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#64748b;max-width:150px;">'+esc(r.supplier||'')+'</td>'+
      '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;'+(expSoon?'color:#dc2626;font-weight:700;':'')+'">'+(r.expiry_date?fmtDate(r.expiry_date):'—')+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#374151;max-width:160px;">'+esc(r.reason||'')+'</td>'+
      '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:500;">'+esc(r.control_comment||'')+'</td>'+
      '<td style="padding:7px 10px;white-space:nowrap;">'+srRowActions(r,isTaken,canEdit,isAdmin)+'</td></tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

/* Общи бутони за действие на ред (взета/редактирай/изтрий) - споделени от двете таблици */
function srRowActions(r,isTaken,canEdit,isAdmin){
  var h='';
  if (canEdit && !isTaken) {
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
  renderStockReturns();
  var ov = document.getElementById('sr-ov');
  if (ov) {
    var r = srData.find(function(x){return x.id===id;});
    if (r) {
      var el = document.getElementById('sr-status');
      if (el) el.value = 'taken';
      var ed = document.getElementById('sr-wdate');
      if (ed) ed.value = new Date().toISOString().slice(0,10);
    }
    ov.classList.add('open');
  }
}

function srDelete(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('stock_returns','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadStockReturns(); });
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
    '<div><label class="fl">Доставчик</label><input class="fi" id="sr-supplier" value="'+esc(r.supplier||'')+'" placeholder="напр. ДЕНИ-А 8583 ООД"></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Продукт</label><input class="fi" id="sr-product" value="'+esc(r.product_name||'')+'" placeholder="Наименование"></div>'+
    '<div><label class="fl">SAP №</label><input class="fi" id="sr-sap" value="'+esc(r.sap_code||'')+'" placeholder="напр. 34989"></div>'+
    '<div><label class="fl">Количество</label><input type="number" step="0.001" class="fi" id="sr-qty" value="'+(r.quantity!=null?r.quantity:'')+'"></div>'+
    '</div>';

  if (tab==='complaint') {
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
      '<div><label class="fl">Срок на годност</label><input type="date" class="fi" id="sr-expiry" value="'+(r.expiry_date||'')+'"></div>'+
      '<div><label class="fl">Причина</label><input class="fi" id="sr-reason" value="'+esc(r.reason||'')+'" placeholder="напр. Рекламация - счупен продукт"></div>'+
      '</div>';
  } else {
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
      '<div><label class="fl">НОВА ПВ-ЕВР</label><input class="fi" id="sr-po" value="'+esc(r.purchase_order||'')+'" placeholder="напр. 4200014948"></div>'+
      '<div><label class="fl">НОВА ИД-ЕВРО</label><input class="fi" id="sr-ie" value="'+esc(r.id_euro||'')+'" placeholder="напр. 80413769"></div>'+
      '<div><label class="fl">Завод</label><input class="fi" id="sr-plant" value="'+(r.plant||'5521')+'" placeholder="5521"></div>'+
      '</div>'+
      '<label class="fl">Дата на документ</label><input type="date" class="fi" id="sr-docdate" value="'+(r.doc_date||'')+'" style="max-width:200px;margin-bottom:10px;">';
  }

  h += '<label class="fl">Статус</label>'+
    '<select class="fi" id="sr-status">'+
    '<option value="pending"'+(r.status==='pending'||!r.status?' selected':'')+'>⏳ НЕВЗЕТА</option>'+
    '<option value="taken"'+(r.status==='taken'?' selected':'')+'>✅ ВЗЕТА</option>'+
    '</select>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Дата на изтегляне</label><input type="date" class="fi" id="sr-wdate" value="'+(r.withdrawal_date||'')+'"></div>'+
    '<div><label class="fl">Дата потвърдена актуализация</label><input type="date" class="fi" id="sr-cdate" value="'+(r.confirmed_date||'')+'"></div>'+
    '</div>'+

    '<label class="fl">Изтеглена от/с куриер (номер на товарителница)</label>'+
    '<input class="fi" id="sr-courier" value="'+esc(r.courier_info||'')+'" placeholder="напр. по буса на Кърджали към Сливен / Еконт 5300...">'+
    '<label class="fl">Коментар'+(tab==='complaint'?'':' Контрол')+'</label>'+
    '<input class="fi" id="sr-cc" value="'+esc(r.control_comment||'')+'" placeholder="напр. ИЗД КИ">';

  if (tab!=='complaint') {
    h += '<label class="fl">Коментар Контролер</label>'+
      '<input class="fi" id="sr-ctrl" value="'+esc(r.controller_comment||'')+'" placeholder="напр. КЪМ ЛС ТЪРГОВИЩЕ / ИЗПРАЩАЙТЕ">';
  }

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeSRModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSR()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
  return h;
}

function openSRModal(id) {
  srEditId = id;
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
   Excel Date обект, ISO низ. При неразпознат текст (напр. свободен коментар,
   вмъкнат по грешка в дата колона) връща null, вместо да гърми. */
function srParseFlexibleDate(v){
  if(!v) return null;
  if(v instanceof Date) return isNaN(v.getTime())?null:v.toISOString().slice(0,10);
  var s=String(v).trim();
  if(!s) return null;
  var m=s.match(/^(\d{1,2})[.,\/](\d{1,2})[.,\/](\d{4})$/);
  if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  var m2=s.match(/^(\d{1,2})[.,\/](\d{1,2})[.,\/](\d{2})$/); /* 2-цифрена година */
  if(m2) return '20'+m2[3]+'-'+m2[2].padStart(2,'0')+'-'+m2[1].padStart(2,'0');
  var m3=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); /* вече ISO/pandas Timestamp низ */
  if(m3) return m3[1]+'-'+m3[2].padStart(2,'0')+'-'+m3[3].padStart(2,'0');
  return null; /* неразпознат текст (напр. свободен коментар в дата клетка) - пропускаме тихо */
}
/* Импорт на многолистовия ERP формат "Обобщен списък - стока за връщане" за
   подтаб "По разлики". Позиционно четене на колоните (не по заглавие), защото
   файлът има 2 колони с ИДЕНТИЧНО заглавие "коментар Контролер". */
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
      var status=statusRaw.indexOf('ВЗЕТА')===0?'taken':'pending'; /* "ВЗЕТА" преди "НЕВЗЕТА" проверка, за да не съвпадне грешно */
      if(statusRaw.indexOf('НЕВЗЕТА')>=0) status='pending';
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
function srParseExcelDate(v){
  if(!v) return null;
  if(v instanceof Date) return v.toISOString().slice(0,10);
  var s=String(v).trim();
  var m=s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); /* дд.мм.гггг */
  if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  var d=new Date(s);
  return isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
function srImportModalHtml(){
  var hint = srTab==='diff'
    ? 'Многолистов Excel файл (1 лист на магазин), формат "Обобщен списък - стока за връщане" — колони: НОВА ПВ-ЕВРО, НОВА ИД-ЕВРО, Доставчик, Дата на документ, Завод, Коментар (статус ВЗЕТА/НЕВЗЕТА), Дата на изтегляне, Куриер, Дата на потвърдена актуализация, коментари.'
    : 'Файлът трябва да съдържа колони за продукт, SAP код, количество, магазин. По желание: доставчик, срок на годност, причина. Имената на колоните може да варират леко (автоматично разпознаване).';
  return '<div class="bov" id="sr-import-ov"><div class="bmod" style="width:460px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:15px;font-weight:700;">📤 Импорт от Excel — '+(srTab==='diff'?'по разлики':'рекламации/срок на годност')+'</div>'+
    '<button onclick="closeReturnsImportModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">'+hint+'</div>'+
    '<input type="file" id="sr-import-file" accept=".xlsx,.xls" style="margin-bottom:14px;">'+
    '<div id="sr-import-progress" style="font-size:12px;color:#94a3b8;"></div>'+
    '<button onclick="startReturnsImport()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;">Започни импорт</button>'+
    '</div></div>';
}
function openReturnsImportModal(){
  var ov=document.getElementById('sr-import-ov');
  if(ov) ov.classList.add('open');
}
function closeReturnsImportModal(){
  var ov=document.getElementById('sr-import-ov');
  if(ov) ov.classList.remove('open');
  var prog=document.getElementById('sr-import-progress');
  if(prog) prog.innerHTML='';
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
  var importTab=srTab; /* пазим коя таб-логика да ползваме, преди евентуален async delay */
  progEl.textContent='⏳ Четене на файла...';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=window.XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      var mapped = importTab==='diff'
        ? parseDiffReturnsWorkbook(wb)
        : parseComplaintReturnsSheet(wb,progEl);
      if(mapped===null) return; /* грешката вече е показана вътре в парсъра */
      if(!mapped.length){
        progEl.innerHTML='<span style="color:#dc2626;">Няма разпознати редове за импорт.</span>';
        return;
      }
      progEl.textContent='⏳ Качване на 0 / '+mapped.length+'...';
      srBatchImport(mapped,function(done,total){
        progEl.textContent='⏳ Качване на '+done+' / '+total+'...';
      },function(errorCount){
        if(errorCount>0){
          progEl.innerHTML='<span style="color:#dc2626;">⚠️ Завърши с '+errorCount+' грешки. Виж конзолата (F12).</span>';
        } else {
          progEl.innerHTML='<span style="color:#16a34a;">✅ Готово! Импортирани '+mapped.length+' записа.</span>';
          toast('✅ Импортът приключи успешно!');
        }
        loadStockReturns();
      });
    }catch(err){
      console.error('Грешка при четене на Excel:',err);
      progEl.innerHTML='<span style="color:#dc2626;">Грешка при четене на файла: '+esc(err.message||String(err))+'</span>';
    }
  };
  reader.readAsArrayBuffer(file);
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
      expiry_date:colExpiry?srParseExcelDate(row[colExpiry]):null,
      reason:colReason?String(row[colReason]||'').trim():'',
      source:'complaint',
      status:'pending',
      created_by:currentUser.display_name||currentUser.email
    };
  }).filter(function(x){return x.product_name;});
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

function submitSR() {
  var store=(document.getElementById('sr-store').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  var tab=(document.getElementById('sr-source')||{}).value||srTab;
  var data={
    store_name:     store,
    supplier:       document.getElementById('sr-supplier').value,
    product_name:   document.getElementById('sr-product').value,
    sap_code:       document.getElementById('sr-sap').value,
    quantity:       parseFloat(document.getElementById('sr-qty').value)||null,
    source:         tab,
    status:         document.getElementById('sr-status').value,
    withdrawal_date:document.getElementById('sr-wdate').value||null,
    confirmed_date: document.getElementById('sr-cdate').value||null,
    courier_info:   document.getElementById('sr-courier').value,
    control_comment:document.getElementById('sr-cc').value,
    created_by:     currentUser.display_name||currentUser.email
  };
  if (tab==='complaint') {
    var expEl=document.getElementById('sr-expiry'), reasonEl=document.getElementById('sr-reason');
    data.expiry_date = expEl?(expEl.value||null):null;
    data.reason = reasonEl?reasonEl.value:'';
  } else {
    var poEl=document.getElementById('sr-po'), ieEl=document.getElementById('sr-ie'),
        plantEl=document.getElementById('sr-plant'), docdateEl=document.getElementById('sr-docdate'),
        ctrlEl=document.getElementById('sr-ctrl');
    data.purchase_order = poEl?poEl.value:'';
    data.id_euro = ieEl?ieEl.value:'';
    data.plant = plantEl?(plantEl.value||'5521'):'5521';
    data.doc_date = docdateEl?(docdateEl.value||null):null;
    data.controller_comment = ctrlEl?ctrlEl.value:'';
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
