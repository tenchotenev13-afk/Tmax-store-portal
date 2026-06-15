/* stock-returns.js — Стока за връщане */

var srData   = [];
var srFilter = 'pending';
var srEditId = null;

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

  var list = srData.filter(function(r) {
    if (srFilter === 'pending')  return r.status === 'pending';
    if (srFilter === 'taken')    return r.status === 'taken';
    return true;
  });

  var pending = srData.filter(function(r){ return r.status==='pending'; }).length;
  var taken   = srData.filter(function(r){ return r.status==='taken'; }).length;

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📦 Стока за връщане</div>';
  if (canAdd) h += '<button onclick="openSRModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
  h += '</div>';

  /* Карти */
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;max-width:400px;">';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #f59e0b;"><div style="font-size:11px;color:#64748b;">⏳ Невзета</div><div style="font-size:28px;font-weight:700;color:#f59e0b;font-family:DM Mono,monospace;">'+pending+'</div></div>';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #16a34a;"><div style="font-size:11px;color:#64748b;">✅ Взета</div><div style="font-size:28px;font-weight:700;color:#16a34a;font-family:DM Mono,monospace;">'+taken+'</div></div>';
  h += '</div>';

  /* Важна бележка */
  h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#856404;">⚠️ Стоката се маркира като ВЗЕТА само след като е физически предадена на куриер или транспорт.</div>';

  /* Филтри */
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  [['all','Всички ('+srData.length+')'],['pending','⏳ Невзета ('+pending+')'],['taken','✅ Взета ('+taken+')']].forEach(function(f){
    var a = srFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setSRFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  /* Таблица */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  } else {
    h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1000px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    ['НОВА ПВ-ЕВР','НОВА ИД-ЕВРО','Доставчик','Дата докум.','Завод','Статус','Дата изтегляне','Изтеглена с','Потвъ. дата','Коментар Контрол','Коментар Контролер',''].forEach(function(c){
      h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
    });
    h += '</tr></thead><tbody>';

    list.forEach(function(r) {
      var isTaken   = r.status === 'taken';
      var statusBadge = isTaken
        ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ ВЗЕТА</span>'
        : '<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⏳ НЕВЗЕТА</span>';

      h += '<tr style="border-bottom:1px solid #f1f5f9;">' +
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.purchase_order||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:#64748b;">'+esc(r.id_euro||'')+'</td>'+
        '<td style="padding:7px 10px;font-weight:500;max-width:150px;">'+esc(r.supplier||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.doc_date)+'</td>'+
        '<td style="padding:7px 10px;text-align:center;color:#94a3b8;">'+esc(r.plant||'')+'</td>'+
        '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.withdrawal_date)+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;max-width:160px;color:#374151;">'+esc(r.courier_info||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.confirmed_date)+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#2563eb;">'+esc(r.control_comment||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:600;">'+esc(r.controller_comment||'')+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';

      if (canEdit && !isTaken) {
        h += '<button data-id="'+r.id+'" onclick="srMarkTaken(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">✅ Взета</button>';
      }
      if (canEdit) {
        h += '<button data-id="'+r.id+'" onclick="openSRModal(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
      }
      if (isAdmin) {
        h += '<button data-id="'+r.id+'" onclick="srDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button>';
      }
      h += '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">'+list.length+' от '+srData.length+' записа.</div>';
  }
  h += '</div>';
  h += srModalHtml();
  wrap.innerHTML = h;
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
  var storeOpts = '<option value="">-- Избери магазин --</option>';
  var stores = assignedStores();
  if (stores) {
    stores.forEach(function(s){ storeOpts += '<option'+(r.store_name===s?' selected':'')+'>'+esc(s)+'</option>'; });
  }

  return '<div class="bov" id="sr-ov"><div class="bmod" style="width:560px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави стока за връщане')+'</div>'+
    '<button onclick="closeSRModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Магазин *</label>'+(function(){
    var myS=assignedStores();
    if(myS&&myS.length===1)return '<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="sr-store" value="'+esc(myS[0])+'">';
    if(myS&&myS.length>1)return '<select class="fi" id="sr-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>';
    return '<select class="fi" id="sr-store"><option value="">-- Зарежда се... --</option></select>';
  })()+'</div>'+
    '<div><label class="fl">Доставчик</label><input class="fi" id="sr-supplier" value="'+esc(r.supplier||'')+'" placeholder="напр. ДЕНИ-А 8583 ООД"></div>'+
    '<div><label class="fl">НОВА ПВ-ЕВР</label><input class="fi" id="sr-po" value="'+esc(r.purchase_order||'')+'" placeholder="напр. 4200014948"></div>'+
    '<div><label class="fl">НОВА ИД-ЕВРО</label><input class="fi" id="sr-ie" value="'+esc(r.id_euro||'')+'" placeholder="напр. 80413769"></div>'+
    '<div><label class="fl">Дата на документ</label><input type="date" class="fi" id="sr-docdate" value="'+(r.doc_date||'')+'"></div>'+
    '<div><label class="fl">Завод</label><input class="fi" id="sr-plant" value="'+(r.plant||'5521')+'" placeholder="5521"></div>'+
    '</div>'+

    '<label class="fl">Статус</label>'+
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
    '<label class="fl">Коментар Контрол</label>'+
    '<input class="fi" id="sr-cc" value="'+esc(r.control_comment||'')+'" placeholder="напр. ИЗД КИ">'+
    '<label class="fl">Коментар Контролер</label>'+
    '<input class="fi" id="sr-ctrl" value="'+esc(r.controller_comment||'')+'" placeholder="напр. КЪМ ЛС ТЪРГОВИЩЕ / ИЗПРАЩАЙТЕ">'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeSRModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSR()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
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

function submitSR() {
  var store=(document.getElementById('sr-store').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  var data={
    store_name:          store,
    supplier:            document.getElementById('sr-supplier').value,
    purchase_order:      document.getElementById('sr-po').value,
    id_euro:             document.getElementById('sr-ie').value,
    doc_date:            document.getElementById('sr-docdate').value||null,
    plant:               document.getElementById('sr-plant').value||'5521',
    status:              document.getElementById('sr-status').value,
    withdrawal_date:     document.getElementById('sr-wdate').value||null,
    confirmed_date:      document.getElementById('sr-cdate').value||null,
    courier_info:        document.getElementById('sr-courier').value,
    control_comment:     document.getElementById('sr-cc').value,
    controller_comment:  document.getElementById('sr-ctrl').value,
    created_by:          currentUser.display_name||currentUser.email
  };
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
