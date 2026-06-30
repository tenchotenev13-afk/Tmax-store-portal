/* transit.js — Стока на път (SAP формат) */

var transitData   = [];
var transitFilter = 'pending';
var transitStore  = '';
var transitEditId = null;
var transitView   = 'all';

var T_STATUS = {
  pending:  { label: '⏳ Не доставена', bg: '#fef9c3', color: '#92400e' },
  received: { label: '✅ Прието',       bg: '#f0fdf4', color: '#16a34a' },
  rejected: { label: '✕ Неприето',      bg: '#fff1f2', color: '#dc2626' }
};

function canEditTransit() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
function canAddTransit() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}

/* ── LOAD ── */
function loadTransit() {
  var wrap = document.getElementById('mod-transit');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  var q = 'order=doc_date.desc,purchase_doc.asc,position.asc' + storeQ();
  sbGet('goods_transit', q).then(function(data) {
    transitData = Array.isArray(data) ? data : [];
    try {
      renderTransit();
    } catch(e) {
      console.error('renderTransit error:', e);
      var w = document.getElementById('mod-transit');
      if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Render грешка: ' + e.message + '</div>';
    }
  }).catch(function(err) {
    var w = document.getElementById('mod-transit');
    var msg = err && err.message ? err.message : JSON.stringify(err);
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">DB грешка: ' + msg + '<br><small>Заявка: ' + q + '</small></div>';
    console.error('loadTransit DB error:', err);
  });
}

/* ── RENDER ── */
function renderTransit() {
  var wrap = document.getElementById('mod-transit');
  if (!wrap) return;
  var isAdmin  = currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
  var canEdit  = canEditTransit();
  var canAdd   = canAddTransit();

  /* viewData — филтрирано за логистичния склад */
  var isLogistics = currentUser && currentUser.role === 'logistics';
  var myWarehouse = isLogistics ? (currentUser.store_name || '') : '';
  var wKey = myWarehouse.indexOf('Добрич') >= 0 ? 'Добрич' : myWarehouse.indexOf('Търговище') >= 0 ? 'Търговище' : '';
  var viewData = transitData;
  if (isLogistics && transitView === 'outgoing' && wKey) {
    viewData = transitData.filter(function(r){ return (r.supplier||'').indexOf(wKey) >= 0; });
  }

  /* Филтрирай */
  var list = viewData.filter(function(r) {
    if (transitFilter === 'pending')  return r.status === 'pending';
    if (transitFilter === 'received') return r.status === 'received';
    if (transitFilter === 'rejected') return r.status === 'rejected';
    return true;
  });
  if (transitStore) {
    list = list.filter(function(r){ return r.store_name === transitStore; });
  }

  /* Изглед за логистичните складове */
  /* Статистика */
  var counts = {pending:0, received:0, rejected:0};
  viewData.forEach(function(r){ if(counts[r.status]!==undefined) counts[r.status]++; });

  /* Магазини за dropdown */
  var stores = {};
  viewData.forEach(function(r){ stores[r.store_name]=1; });
  var storeList = Object.keys(stores).sort();

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📦 Стока на път</div>';
  if (canAdd) h += '<div style="display:flex;gap:8px;">'+
    '<button onclick="openTransitImportModal()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📥 Импорт Excel</button>'+
    '<button onclick="openTransitAdd()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави ред</button>'+
    '</div>';
  h += '</div>';

  /* Карти */
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">';
  h += tStatCard('⏳ Не доставени', counts.pending, '#d97706');
  h += tStatCard('✅ Прието', counts.received, '#16a34a');
  h += tStatCard('✕ Неприето', counts.rejected, '#dc2626');
  h += '</div>';

  /* Банер за логистичния склад */
  if (isLogistics && myWarehouse) {
    var v = transitView;
    h += '<div style="display:flex;gap:8px;margin-bottom:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 14px;align-items:center;flex-wrap:wrap;">';
    h += '<div style="font-size:12px;font-weight:600;color:#16a34a;">🏭 ' + esc(myWarehouse) + '</div>';
    h += '<button onclick="transitView=\'all\';renderTransit()" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:' + (v==='all'?'#0f172a':'#e2e8f0') + ';color:' + (v==='all'?'#fff':'#374151') + ';">📥 Всички магазини</button>';
    h += '<button onclick="transitView=\'outgoing\';renderTransit()" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:' + (v==='outgoing'?'#16a34a':'#e2e8f0') + ';color:' + (v==='outgoing'?'#fff':'#374151') + ';">📤 За изпращане от моя склад</button>';
    h += '</div>';
  }

  /* Филтри */
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">';
  var filters = [['all','Всички'],['pending','⏳ Не доставени'],['received','✅ Прието'],['rejected','✕ Неприето']];
  filters.forEach(function(f){
    var a = transitFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setTFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+' '+(f[0]==='all'?'('+transitData.length+')':f[0]==='pending'?'('+counts.pending+')':f[0]==='received'?'('+counts.received+')':'('+counts.rejected+')')+'</button>';
  });
  if (isAdmin && storeList.length > 1) {
    h += '<select onchange="setTStore(this.value)" style="border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;cursor:pointer;">';
    h += '<option value="">Всички магазини</option>';
    storeList.forEach(function(s){ h += '<option value="'+esc(s)+'"'+(transitStore===s?' selected':'')+'>'+esc(s)+'</option>'; });
    h += '</select>';
  }
  h += '</div>';

  /* Таблица */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  } else {
    h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    var cols = ['Магазин','Доставчик/Склад','Документ','Позиция','Дата','Материал','Описание','Кол.','МЕ','Остатък','Дата трансфер','Статус',''];
    cols.forEach(function(c){
      h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
    });
    h += '</tr></thead><tbody>';

    list.forEach(function(r) {
      var st = T_STATUS[r.status] || T_STATUS.pending;
      var isOver = r.status==='pending' && r.doc_date && (new Date()-new Date(r.doc_date))>30*86400000;
      h += '<tr style="border-bottom:1px solid #f1f5f9;'+(isOver?'background:#fffbeb;':'')+'">'+
        '<td style="padding:7px 10px;font-weight:500;white-space:nowrap;">'+esc(r.store_name||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#64748b;max-width:150px;">'+esc(r.supplier||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;white-space:nowrap;">'+esc(r.purchase_doc||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:center;color:#94a3b8;">'+((r.position)||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;white-space:nowrap;">'+fmtDate(r.doc_date)+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;color:#64748b;">'+esc(r.material_code||'')+'</td>'+
        '<td style="padding:7px 10px;max-width:200px;">'+esc(r.material_name||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;">'+((r.ordered_qty)||'')+'</td>'+
        '<td style="padding:7px 10px;color:#94a3b8;">'+esc(r.unit||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+((r.remaining_qty)||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.transfer_date)+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">'+
          '<span style="background:'+st.bg+';color:'+st.color+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+st.label+'</span>'+
          (r.comment?'<div style="font-size:10px;color:#94a3b8;margin-top:2px;">'+esc(r.comment)+'</div>':'')+
        '</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';

      if (canEdit && r.status==='pending') {
        h += '<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'received\')" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✅</button>';
        h += '<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'rejected\')" style="border:1px solid #fecaca;background:#fff1f2;color:#dc2626;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✕</button>';
      }
      if (canEdit && r.status !== 'pending') {
        h += '<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'pending\')" style="border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">↩</button>';
      }
      if (canEdit) {
        h += '<button data-id="'+r.id+'" onclick="openTransitEdit(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
      }
      if (isAdmin) {
        h += '<button data-id="'+r.id+'" onclick="tDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button>';
      }
      h += '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">Показани '+list.length+' от '+transitData.length+' записа.</div>';
  }
  h += '</div>';
  h += transitModalHtml();
  wrap.innerHTML = h;
}

function tStatCard(label, val, color) {
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid '+color+';">'+
    '<div style="font-size:11px;color:#64748b;margin-bottom:2px;">'+label+'</div>'+
    '<div style="font-size:24px;font-weight:700;color:'+color+';font-family:DM Mono,monospace;">'+val+'</div>'+
    '</div>';
}

function setTFilter(f) { transitFilter=f; renderTransit(); }
function setTStore(s)  { transitStore=s;  renderTransit(); }

function tMarkStatus(id, status) {
  var labels = {received:'Маркирай като ПРИЕТО?', rejected:'Маркирай като НЕПРИЕТО?', pending:'Върни в ЧАКАЩО?'};
  if (!confirm(labels[status]||'Промени статус?')) return;
  sbPatch('goods_transit','id=eq.'+id,{
    status:status,
    updated_by:currentUser.display_name||currentUser.email,
    updated_at:new Date().toISOString()
  }).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Статусът е обновен!'); loadTransit();
  });
}
function tDelete(id) {
  if(!confirm('Изтрий записа?'))return;
  sbDelete('goods_transit','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadTransit(); });
}

/* ── МОДАЛ ── */
function transitModalHtml() {
  var r = transitEditId ? (transitData.find(function(x){return x.id===transitEditId;})||{}) : {};
  var isEdit = !!transitEditId;

  /* Магазини */


  return '<div class="bov" id="transit-ov"><div class="bmod" style="width:580px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай ред':'+ Добави ред — Стока на път')+'</div>'+
    '<button onclick="closeTransitModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Магазин *</label>'+(function(){
    var myS=assignedStores();
    if(myS&&myS.length===1)return '<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="tr-store" value="'+esc(myS[0])+'">';
    if(myS&&myS.length>1)return '<select class="fi" id="tr-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>';
    return '<select class="fi" id="tr-store"><option value="">-- Зарежда се... --</option></select>';
  })()+'</div>'+
    '<div><label class="fl">Доставчик / Склад</label><input class="fi" id="tr-supplier" value="'+esc(r.supplier||'')+'" placeholder="напр. 5518 Логистичен склад Добрич"></div>'+
    '<div><label class="fl">Документ за покупка</label><input class="fi" id="tr-doc" value="'+esc(r.purchase_doc||'')+'" placeholder="напр. 4600164280"></div>'+
    '<div><label class="fl">Позиция</label><input class="fi" type="number" id="tr-pos" value="'+(r.position||'')+'" placeholder="напр. 10"></div>'+
    '<div><label class="fl">Дата на документ</label><input type="date" class="fi" id="tr-docdate" value="'+(r.doc_date||'')+'"></div>'+
    '<div><label class="fl">Код на материал (SAP)</label><input class="fi" id="tr-mat" value="'+esc(r.material_code||'')+'" placeholder="напр. 96466"></div>'+
    '</div>'+

    '<label class="fl">Описание на стоката *</label>'+
    '<input class="fi" id="tr-name" value="'+esc(r.material_name||'')+'" placeholder="напр. ГРАНИТОГРЕС COSMOS WHITE 40/40">'+

    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Кол. поръчка</label><input class="fi" type="number" step="0.01" id="tr-qty" value="'+(r.ordered_qty||'')+'"></div>'+
    '<div><label class="fl">МЕ</label><input class="fi" id="tr-unit" value="'+esc(r.unit||'')+'" placeholder="БР / M2 / ПАК"></div>'+
    '<div><label class="fl">Остатък недост.</label><input class="fi" type="number" step="0.01" id="tr-rem" value="'+(r.remaining_qty||'')+'"></div>'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Дата на трансфер</label><input type="date" class="fi" id="tr-tdate" value="'+(r.transfer_date||'')+'"></div>'+
    '<div><label class="fl">Статус</label>'+
    '<select class="fi" id="tr-status">'+
    '<option value="pending"'+(r.status==='pending'?' selected':'')+'>⏳ Не доставена</option>'+
    '<option value="received"'+(r.status==='received'?' selected':'')+'>✅ Прието</option>'+
    '<option value="rejected"'+(r.status==='rejected'?' selected':'')+'>✕ Неприето</option>'+
    '</select></div>'+
    '</div>'+

    '<label class="fl">Коментар</label>'+
    '<input class="fi" id="tr-comment" value="'+esc(r.comment||'')+'" placeholder="напр. все още не доставена">'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeTransitModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitTransit()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
}

function openTransitAdd() {
  transitEditId = null;
  renderTransit();
  var ov = document.getElementById('transit-ov');
  if (!ov) return;
  var myStores = assignedStores();
  var storeEl = document.getElementById('tr-store');
  if (storeEl) {
    if (myStores && myStores.length === 1) {
      /* Един магазин — автоматично попълване */
      storeEl.outerHTML = '<div class="fi" style="background:#f8fafc;font-weight:500;">🏪 '+esc(myStores[0])+'</div><input type="hidden" id="tr-store" value="'+esc(myStores[0])+'">';
    } else if (myStores && myStores.length > 1) {
      storeEl.innerHTML = '<option value="">-- Избери --</option>'+myStores.map(function(s){return '<option>'+esc(s)+'</option>';}).join('');
    } else {
      sbGet('users','select=store_name&order=store_name').then(function(data){
        var el = document.getElementById('tr-store');
        if(Array.isArray(data)&&el){
          var seen={};
          el.innerHTML='<option value="">-- Избери --</option>'+data.filter(function(u){
            if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
            seen[u.store_name]=1;return true;
          }).map(function(u){return '<option>'+esc(u.store_name)+'</option>';}).join('');
          /* Избери текущия магазин при редактиране */
          var cur = transitEditId ? (transitData.find(function(x){return x.id===transitEditId;}))||{} : {};
          if(cur.store_name) el.value = cur.store_name;
        }
      });
    }
  }
  ov.classList.add('open');
}

function openTransitEdit(id) {
  transitEditId = id;
  renderTransit();
  var ov = document.getElementById('transit-ov');
  if (ov) {
    var r = transitData.find(function(x){return x.id===id;});
    if (r) {
      var sel=document.getElementById('tr-store');
      if(sel) sel.innerHTML='<option>'+esc(r.store_name)+'</option>';
    }
    ov.classList.add('open');
  }
}

function closeTransitModal() {
  var ov=document.getElementById('transit-ov');
  if(ov)ov.classList.remove('open');
  transitEditId=null;
}

function submitTransit() {
  var store=(document.getElementById('tr-store').value||'').trim();
  var name=(document.getElementById('tr-name').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!name){toast('Въведи описание','#dc2626');return;}
  var data={
    store_name:   store,
    supplier:     document.getElementById('tr-supplier').value,
    purchase_doc: document.getElementById('tr-doc').value,
    position:     parseInt(document.getElementById('tr-pos').value)||null,
    doc_date:     document.getElementById('tr-docdate').value||null,
    material_code:document.getElementById('tr-mat').value,
    material_name:name,
    ordered_qty:  parseFloat(document.getElementById('tr-qty').value)||null,
    unit:         document.getElementById('tr-unit').value,
    remaining_qty:parseFloat(document.getElementById('tr-rem').value)||null,
    transfer_date:document.getElementById('tr-tdate').value||null,
    status:       document.getElementById('tr-status').value,
    comment:      document.getElementById('tr-comment').value,
    updated_by:   currentUser.display_name||currentUser.email,
    updated_at:   new Date().toISOString()
  };
  var p = transitEditId
    ? sbPatch('goods_transit','id=eq.'+transitEditId,data)
    : sbPost('goods_transit',data);
  p.then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeTransitModal();
    toast('✅ '+(transitEditId?'Записано!':'Добавено!'));
    loadTransit();
  });
}

function tSetTransferDate(id) {
  var date = prompt('Въведи дата на трансфер (ГГГГ-ММ-ДД):', new Date().toISOString().slice(0,10));
  if (!date) return;
  sbPatch('goods_transit','id=eq.'+id,{
    transfer_date: date,
    updated_by: currentUser.display_name||currentUser.email,
    updated_at: new Date().toISOString()
  }).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Датата е записана!'); loadTransit();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ИМПОРТ ОТ SAP EXCEL — "Стока на път"
   Видимост: само admin / accounting / logistics могат да импортират
══════════════════════════════════════════════════════════════ */

var PLANT_TO_STORE = {
  '5502':'Севлиево', '5503':'Враца', '5507':'Монтана', '5508':'Кърджали',
  '5512':'Търговище', '5513':'Сливен', '5514':'Шумен', '5515':'Габрово',
  '5516':'Добрич', '5519':'Гоце Делчев', '5520':'Силистра', '5521':'Раднево',
  '5522':'Дупница', '5523':'Петрич', '5524':'Пирдоп', '5525':'Троян',
  '5526':'Карлово', '5527':'Козлодуй',
  /* Логистични складове */
  '5518':'Логистичен склад Добрич', '5505':'Логистичен склад Търговище'
};

function canImportTransit(){
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
}

function openTransitImportModal(){
  if(!canImportTransit()){toast('Нямаш права за импорт','#dc2626');return;}
  var input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    handleTransitExcelFile(file);
  };
  input.click();
}

function handleTransitExcelFile(file){
  toast('⏳ Зареждане на файла...');
  function doImport(){
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var data=new Uint8Array(e.target.result);
        var workbook=window.XLSX.read(data,{type:'array',cellDates:true});
        var sheetName=workbook.SheetNames[0];
        var sheet=workbook.Sheets[sheetName];
        var rows=window.XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,dateNF:'yyyy-mm-dd'});
        parseTransitRows(rows);
      }catch(err){
        toast('Грешка при четене на файла: '+err.message,'#dc2626');
      }
    };
    reader.readAsArrayBuffer(file);
  }
  if(window.XLSX){ doImport(); }
  else{
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=doImport;
    s.onerror=function(){toast('Грешка при зареждане на Excel библиотека','#dc2626');};
    document.head.appendChild(s);
  }
}

function parseExcelDate(val){
  if(!val)return null;
  if(val instanceof Date) return val.toISOString().slice(0,10);
  var s=String(val).trim();
  /* Формат DD.M.YYYY или D.M.YYYY */
  var m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  /* Вече ISO формат */
  var m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m2) return m2[0];
  return null;
}

function parseExcelNum(val){
  if(val===null||val===undefined||val==='')return null;
  var s=String(val).trim().replace(',', '.');
  var n=parseFloat(s);
  return isNaN(n)?null:n;
}

var _transitImportRows = [];

function parseTransitRows(rows){
  if(!rows||rows.length<2){toast('Файлът е празен или невалиден','#dc2626');return;}

  /* Очакван формат (13 колони, header на ред 1):
     Завод, Доставчик/доставящ завод, Документ за покупка, Позиция,
     Дата на документ, Материал, Кратък текст, Количество поръчка,
     МЕ поръчка, Все още недоставено, коментар, дата на трансфер, доп. коментар */

  var parsed = rows.slice(1).map(function(row){
    var plant = String(row[0]||'').trim();
    var store = PLANT_TO_STORE[plant] || null;
    return {
      plant: plant,
      store_name: store,
      supplier: String(row[1]||'').trim(),
      purchase_doc: String(row[2]||'').trim(),
      position: parseInt(row[3])||null,
      doc_date: parseExcelDate(row[4]),
      material_code: String(row[5]||'').trim(),
      material_name: String(row[6]||'').trim(),
      ordered_qty: parseExcelNum(row[7]),
      unit: String(row[8]||'').trim(),
      remaining_qty: parseExcelNum(row[9]),
      comment: String(row[10]||'').trim(),
      transfer_date: parseExcelDate(row[11]),
      extra_comment: String(row[12]||'').trim()
    };
  }).filter(function(r){ return r.material_code; });

  _transitImportRows = parsed;

  /* Групираме по завод за да покажем mapping екран */
  var byPlant = {};
  parsed.forEach(function(r){
    if(!byPlant[r.plant]) byPlant[r.plant] = {plant:r.plant, store:r.store_name, count:0};
    byPlant[r.plant].count++;
  });

  renderTransitImportPreview(byPlant, parsed.length);
}

function renderTransitImportPreview(byPlant, totalRows){
  var unmapped = Object.values(byPlant).filter(function(p){ return !p.store; });
  var mapped   = Object.values(byPlant).filter(function(p){ return p.store; });

  var h = '<div class="bov open" id="transit-import-ov" onclick="if(event.target===this)closeTransitImport()">'+
    '<div class="bmod" style="width:640px;max-height:85vh;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
      '<div style="font-size:16px;font-weight:700;">📥 Импорт от SAP Excel</div>'+
      '<button onclick="closeTransitImport()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e3a5f;">'+
      'Намерени <b>'+totalRows+'</b> реда в '+(mapped.length+unmapped.length)+' завода. '+
      mapped.length+' завода са разпознати автоматично.'+
    '</div>';

  if(unmapped.length){
    h += '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;margin-bottom:14px;">'+
      '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px;">⚠️ '+unmapped.length+' непознат(и) завод(и) — избери магазин ръчно:</div>';
    unmapped.forEach(function(p){
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'+
        '<span style="font-family:monospace;font-size:12px;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;min-width:50px;">'+esc(p.plant)+'</span>'+
        '<span style="font-size:11px;color:#92400e;">('+p.count+' реда)</span>'+
        '<select class="fi" data-plant="'+esc(p.plant)+'" style="flex:1;padding:4px 8px;font-size:12px;" onchange="_updateUnmappedPlant(this)">'+
          '<option value="">-- Пропусни тези редове --</option>'+
          Object.values(PLANT_TO_STORE).sort().map(function(s){return '<option value="'+esc(s)+'">'+esc(s)+'</option>';}).join('')+
        '</select>'+
      '</div>';
    });
    h += '</div>';
  }

  h += '<div style="max-height:240px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    '<thead><tr style="background:#f8fafc;"><th style="padding:6px 10px;text-align:left;">Завод</th><th style="padding:6px 10px;text-align:left;">Магазин</th><th style="padding:6px 10px;text-align:right;">Редове</th></tr></thead><tbody>';
  mapped.concat(unmapped).sort(function(a,b){return a.plant.localeCompare(b.plant);}).forEach(function(p){
    h += '<tr style="border-top:1px solid #f1f5f9;">'+
      '<td style="padding:5px 10px;font-family:monospace;">'+esc(p.plant)+'</td>'+
      '<td style="padding:5px 10px;'+(p.store?'':'color:#dc2626;font-style:italic;')+'">'+(p.store?esc(p.store):'непознат')+'</td>'+
      '<td style="padding:5px 10px;text-align:right;">'+p.count+'</td>'+
    '</tr>';
  });
  h += '</tbody></table></div>';

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
    '<button onclick="closeTransitImport()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="confirmTransitImport()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✅ Импортирай</button>'+
  '</div>'+
  '</div></div>';

  var old=document.getElementById('transit-import-ov');
  if(old && typeof old.remove==='function') old.remove();
  document.body.insertAdjacentHTML('beforeend', h);
}

function _updateUnmappedPlant(sel){
  var plant = sel.dataset.plant;
  var store = sel.value;
  _transitImportRows.forEach(function(r){
    if(r.plant === plant) r.store_name = store || null;
  });
}

function closeTransitImport(){
  var ov=document.getElementById('transit-import-ov');
  if(ov && typeof ov.remove==='function') ov.remove();
  _transitImportRows = [];
}

function confirmTransitImport(){
  var rows = _transitImportRows.filter(function(r){ return r.store_name; });
  var skipped = _transitImportRows.length - rows.length;
  if(!rows.length){toast('Няма редове за импорт — избери магазини','#dc2626');return;}

  toast('⏳ Импортиране на '+rows.length+' реда...');

  /* Batch insert по 50 записа */
  var batches = [];
  for(var i=0; i<rows.length; i+=50){
    batches.push(rows.slice(i, i+50));
  }

  var inserted = 0;
  var failed = 0;

  function processBatch(idx){
    if(idx >= batches.length){
      closeTransitImport();
      var msg = '✅ Импортирани '+inserted+' реда';
      if(failed) msg += ', '+failed+' грешки';
      if(skipped) msg += ', '+skipped+' пропуснати (непознат завод)';
      toast(msg, failed?'#d97706':'#16a34a');
      loadTransit();
      return;
    }
    var batch = batches[idx].map(function(r){
      return {
        store_name: r.store_name,
        supplier: r.supplier,
        purchase_doc: r.purchase_doc,
        position: r.position,
        doc_date: r.doc_date,
        material_code: r.material_code,
        material_name: r.material_name,
        ordered_qty: r.ordered_qty,
        unit: r.unit,
        remaining_qty: r.remaining_qty,
        comment: r.comment,
        transfer_date: r.transfer_date,
        status: 'pending',
        updated_by: currentUser.display_name||currentUser.email,
        updated_at: new Date().toISOString()
      };
    });
    sbPost('goods_transit', batch).then(function(res){
      if(res.ok) inserted += batch.length;
      else failed += batch.length;
      processBatch(idx+1);
    }).catch(function(){
      failed += batch.length;
      processBatch(idx+1);
    });
  }

  processBatch(0);
}
