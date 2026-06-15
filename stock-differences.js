/* stock-differences.js — Стока за изтегляне по разлики */

var sdData   = [];
var sdFilter = 'pending';
var sdEditId = null;

function canEditSD() {
  return currentUser && ['admin','accounting','logistics','manager','sklad'].indexOf(currentUser.role) >= 0;
}
function canAddSD() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}

function loadStockDiff() {
  var wrap = document.getElementById('mod-stock-diff');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  sbGet('stock_differences', 'order=confirmed_date.desc' + storeQ()).then(function(data) {
    sdData = Array.isArray(data) ? data : [];
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

  var list = sdData.filter(function(r) {
    if (sdFilter === 'pending') return r.status === 'pending';
    if (sdFilter === 'taken')   return r.status === 'taken';
    return true;
  });

  var pending = sdData.filter(function(r){ return r.status==='pending'; }).length;
  var taken   = sdData.filter(function(r){ return r.status==='taken'; }).length;

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📋 Стока за изтегляне по разлики</div>';
  if (canAdd) h += '<button onclick="openSDModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
  h += '</div>';

  /* Важна бележка */
  h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;font-weight:600;color:#856404;">'+
    '⚠️ ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС И Е В ДОБЪР ТЪРГОВСКИ ВИД!'+
    '</div>';

  /* Карти */
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;max-width:400px;">';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #f59e0b;"><div style="font-size:11px;color:#64748b;">⏳ Невзета</div><div style="font-size:28px;font-weight:700;color:#f59e0b;font-family:DM Mono,monospace;">'+pending+'</div></div>';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #16a34a;"><div style="font-size:11px;color:#64748b;">✅ Взета</div><div style="font-size:28px;font-weight:700;color:#16a34a;font-family:DM Mono,monospace;">'+taken+'</div></div>';
  h += '</div>';

  /* Филтри */
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  [['all','Всички ('+sdData.length+')'],['pending','⏳ Невзета ('+pending+')'],['taken','✅ Взета ('+taken+')']].forEach(function(f){
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
    ['Магазин','Доставчик','Материал','Наименование','Кол.','Поръчка','Дата потвърд.','Статус','Коментар',''].forEach(function(c){
      h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
    });
    h += '</tr></thead><tbody>';

    list.forEach(function(r) {
      var isTaken = r.status === 'taken';
      var statusBadge = isTaken
        ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ ВЗЕТА</span>'
        : '<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⏳ НЕВЗЕТА</span>';

      h += '<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:7px 10px;font-weight:500;">'+esc(r.store_name||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#64748b;">'+esc(r.supplier||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.material_code||'')+'</td>'+
        '<td style="padding:7px 10px;max-width:200px;">'+esc(r.material_name||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+((r.quantity)||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.order_number||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.confirmed_date)+'</td>'+
        '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:500;">'+esc(r.comment||'')+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';

      if (canEdit && !isTaken) {
        h += '<button data-id="'+r.id+'" onclick="sdMarkTaken(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">✅ Взета</button>';
      }
      if (canEdit) {
        h += '<button data-id="'+r.id+'" onclick="openSDModal(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
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
}

function setSDFilter(f) { sdFilter=f; renderStockDiff(); }

function sdMarkTaken(id) {
  if (!confirm('Маркирай стоката като ВЗЕТА?')) return;
  sbPatch('stock_differences','id=eq.'+id,{status:'taken'}).then(function(r){
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
  var storeOpts = '<option value="">-- Избери магазин --</option>';
  var stores = assignedStores();
  if (stores) {
    stores.forEach(function(s){ storeOpts += '<option'+(r.store_name===s?' selected':'')+'>'+esc(s)+'</option>'; });
  }

  return '<div class="bov" id="sd-ov"><div class="bmod" style="width:540px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави стока за изтегляне')+'</div>'+
    '<button onclick="closeSDModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:600;color:#856404;">'+
    '⚠️ ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС И Е В ДОБЪР ТЪРГОВСКИ ВИД!</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Магазин *</label><select class="fi" id="sd-store">'+storeOpts+'</select></div>'+
    '<div><label class="fl">Доставчик</label><input class="fi" id="sd-supplier" value="'+esc(r.supplier||'')+'" placeholder="напр. ТАГЕМАЛ"></div>'+
    '<div><label class="fl">Код на материал (SAP)</label><input class="fi" id="sd-mat" value="'+esc(r.material_code||'')+'" placeholder="напр. 34989"></div>'+
    '<div><label class="fl">Количество</label><input type="number" step="0.01" class="fi" id="sd-qty" value="'+(r.quantity||'')+'"></div>'+
    '</div>'+

    '<label class="fl">Наименование *</label>'+
    '<input class="fi" id="sd-name" value="'+esc(r.material_name||'')+'" placeholder="напр. ЩУЦЕР ЗА МАРКУЧ МЕТАЛЕН С РЕЗБА 1&quot; ПРАВ">'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Поръчка</label><input class="fi" id="sd-order" value="'+esc(r.order_number||'')+'" placeholder="напр. 4100135756"></div>'+
    '<div><label class="fl">Дата потвърдена актуализация</label><input type="date" class="fi" id="sd-cdate" value="'+(r.confirmed_date||'')+'"></div>'+
    '</div>'+

    '<label class="fl">Статус</label>'+
    '<select class="fi" id="sd-status">'+
    '<option value="pending"'+(r.status==='pending'||!r.status?' selected':'')+'>⏳ НЕВЗЕТА</option>'+
    '<option value="taken"'+(r.status==='taken'?' selected':'')+'>✅ ВЗЕТА</option>'+
    '</select>'+

    '<label class="fl">Коментар</label>'+
    '<input class="fi" id="sd-comment" value="'+esc(r.comment||'')+'" placeholder="напр. ЗАПРИХОДЕТЕ С РЕВИЗИЯ / ЧАКАМЕ">'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeSDModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSD()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
}

function openSDModal(id) {
  sdEditId = id;
  renderStockDiff();
  var ov = document.getElementById('sd-ov');
  if (!ov) return;
  var stores = assignedStores();
  if (!stores) {
    sbGet('stores','select=name&order=name').then(function(data){
      var sel=document.getElementById('sd-store');
      if(sel&&Array.isArray(data)){
        var r2=sdEditId?(sdData.find(function(x){return x.id===sdEditId;})||{}):{};
        sel.innerHTML='<option value="">-- Избери магазин --</option>'+
          data.map(function(s){return '<option'+(r2.store_name===s.name?' selected':'')+'>'+esc(s.name)+'</option>';}).join('');
      }
    });
  }
  ov.classList.add('open');
}
function closeSDModal() {
  var ov=document.getElementById('sd-ov'); if(ov)ov.classList.remove('open');
  sdEditId=null;
}

function submitSD() {
  var store=(document.getElementById('sd-store').value||'').trim();
  var name=(document.getElementById('sd-name').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!name){toast('Въведи наименование','#dc2626');return;}
  var data={
    store_name:     store,
    supplier:       document.getElementById('sd-supplier').value,
    material_code:  document.getElementById('sd-mat').value,
    material_name:  name,
    quantity:       parseFloat(document.getElementById('sd-qty').value)||null,
    order_number:   document.getElementById('sd-order').value,
    confirmed_date: document.getElementById('sd-cdate').value||null,
    status:         document.getElementById('sd-status').value,
    comment:        document.getElementById('sd-comment').value,
    created_by:     currentUser.display_name||currentUser.email
  };
  var p = sdEditId
    ? sbPatch('stock_differences','id=eq.'+sdEditId,data)
    : sbPost('stock_differences',data);
  p.then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeSDModal();
    toast('✅ '+(sdEditId?'Записано!':'Добавено!'));
    loadStockDiff();
  });
}
