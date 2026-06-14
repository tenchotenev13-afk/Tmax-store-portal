/* transit.js — Стока на път */

var transitData   = [];
var transitFilter = 'pending'; /* pending | received | all */

function loadTransit() {
  var wrap = document.getElementById('mod-transit');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  var q = 'order=expected_date.asc' + storeQ();
  sbGet('goods_transit', q).then(function(data) {
    transitData = Array.isArray(data) ? data : [];
    renderTransit();
  }).catch(function(err) {
    console.error('loadTransit error:', err);
    var w = document.getElementById('mod-transit');
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
  });
}

function renderTransit() {
  var wrap = document.getElementById('mod-transit');
  if (!wrap) return;
  var isAdmin = currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
  var canAdd  = currentUser && ['admin','accounting','logistics','manager'].indexOf(currentUser.role) >= 0;
  var today   = new Date(); today.setHours(0,0,0,0);

  var list = transitData.filter(function(r) {
    if (transitFilter === 'pending')  return r.status === 'pending';
    if (transitFilter === 'received') return r.status === 'received';
    return true;
  });

  /* Статистика */
  var pending  = transitData.filter(function(r){ return r.status==='pending'; }).length;
  var overdue  = transitData.filter(function(r){ return r.status==='pending' && r.expected_date && new Date(r.expected_date)<today; }).length;
  var received = transitData.filter(function(r){ return r.status==='received'; }).length;

  var h = '<div style="max-width:1320px;margin:0 auto;padding:16px;">';

  /* Заглавие + бутон */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">';
  h += '<div style="font-size:20px;font-weight:600;">📦 Стока на път</div>';
  if (canAdd) h += '<button onclick="openTransitModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави запис</button>';
  h += '</div>';

  /* Карти статистика */
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">';
  h += statCard('📦 Чакащи', pending, '#2563eb');
  h += statCard('🔴 Просрочени', overdue, '#dc2626');
  h += statCard('✅ Получени', received, '#16a34a');
  h += '</div>';

  /* Филтри */
  h += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
  [['pending','⏳ Чакащи'],['received','✅ Получени'],['all','Всички']].forEach(function(f){
    var a = transitFilter === f[0];
    h += '<button data-f="'+f[0]+'" onclick="setTransitFilter(this.dataset.f)" style="border:none;padding:6px 16px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  /* Таблица */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  } else {
    h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    ['Магазин','От','Описание','Поръчано','Очаквано','Статус',''].forEach(function(col){
      h += '<th style="text-align:left;padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">'+col+'</th>';
    });
    h += '</tr></thead><tbody>';

    list.forEach(function(r) {
      var isOver = r.status==='pending' && r.expected_date && new Date(r.expected_date) < today;
      var srcLabel = r.source_type==='logistics' ? '🏭 Логистичен склад' : '🚚 Доставчик';
      var statusBadge = r.status==='pending'
        ? '<span style="background:'+(isOver?'#fee2e2':'#fef9c3')+';color:'+(isOver?'#dc2626':'#92400e')+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+(isOver?'🔴 Просрочено':'⏳ Чакащо')+'</span>'
        : r.status==='received'
        ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ Получено</span>'
        : '<span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✕ Отменено</span>';

      h += '<tr style="border-bottom:1px solid #f1f5f9;'+(isOver?'background:#fff5f5;':'')+'">'+
        '<td style="padding:10px 12px;font-weight:500;">'+esc(r.store_name||'')+'</td>'+
        '<td style="padding:10px 12px;"><div style="font-size:12px;">'+srcLabel+'</div>'+(r.source_name?'<div style="font-size:11px;color:#64748b;">'+esc(r.source_name)+'</div>':'')+'</td>'+
        '<td style="padding:10px 12px;">'+esc(r.description||'')+(r.notes?'<div style="font-size:11px;color:#94a3b8;">'+esc(r.notes)+'</div>':'')+'</td>'+
        '<td style="padding:10px 12px;font-family:DM Mono,monospace;font-size:12px;">'+fmtDate(r.order_date)+'</td>'+
        '<td style="padding:10px 12px;font-family:DM Mono,monospace;font-size:12px;color:'+(isOver?'#dc2626':'#374151')+';">'+fmtDate(r.expected_date)+'</td>'+
        '<td style="padding:10px 12px;">'+statusBadge+'</td>'+
        '<td style="padding:10px 12px;">';

      if (canAdd && r.status==='pending') {
        h += '<button data-id="'+r.id+'" onclick="markTransitReceived(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;margin-right:4px;">✅ Получено</button>';
      }
      if (isAdmin) {
        h += '<button data-id="'+r.id+'" onclick="deleteTransit(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button>';
      }
      h += '</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  h += '</div>';
  h += transitModalHtml();
  wrap.innerHTML = h;
}

function statCard(label, val, color) {
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+color+';">' +
    '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+label+'</div>' +
    '<div style="font-size:28px;font-weight:700;color:'+color+';font-family:DM Mono,monospace;">'+val+'</div>' +
    '</div>';
}

function setTransitFilter(f) { transitFilter=f; renderTransit(); }

function markTransitReceived(id) {
  if (!confirm('Маркирай стоката като получена?')) return;
  sbPatch('goods_transit','id=eq.'+id,{status:'received',received_date:new Date().toISOString().slice(0,10)}).then(function(){
    toast('✅ Маркирана като получена!'); loadTransit();
  });
}
function deleteTransit(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('goods_transit','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadTransit(); });
}

/* ── МОДАЛ ── */
function transitModalHtml() {
  /* Вземи магазините за dropdown */
  var storeOpts = '<option value="">-- Избери магазин --</option>';
  var stores = assignedStores();
  if (stores) {
    stores.forEach(function(s){ storeOpts += '<option>'+esc(s)+'</option>'; });
  }
  return '<div class="bov" id="transit-ov"><div class="bmod" style="width:500px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">+ Добави стока на път</div>'+
    '<button onclick="closeTransitModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<label class="fl">Магазин *</label>'+
    '<select class="fi" id="tr-store">'+storeOpts+'</select>'+
    '<label class="fl">Източник</label>'+
    '<select class="fi" id="tr-src"><option value="logistics">🏭 Логистичен склад</option><option value="supplier">🚚 Доставчик</option></select>'+
    '<label class="fl">Наименование на доставчика / склада</label>'+
    '<input class="fi" id="tr-srcname" placeholder="напр. Склад София / Доставчик ООД">'+
    '<label class="fl">Описание на стоката *</label>'+
    '<textarea class="fi" id="tr-desc" rows="2" style="resize:none;" placeholder="напр. 10 бр. смесители, арт. 12345"></textarea>'+
    '<label class="fl">Дата на поръчка</label>'+
    '<input type="date" class="fi" id="tr-odate">'+
    '<label class="fl">Очаквана дата на доставка</label>'+
    '<input type="date" class="fi" id="tr-edate">'+
    '<label class="fl">Бележки</label>'+
    '<input class="fi" id="tr-notes" placeholder="Допълнителна информация">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeTransitModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitTransit()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>'+
    '</div></div></div>';
}

function openTransitModal() {
  /* Зареди магазини в dropdown */
  renderTransit(); /* за да се рендира модала */
  var ov = document.getElementById('transit-ov');
  if (ov) {
    /* Попълни магазина ако е само един */
    var stores = assignedStores();
    if (stores && stores.length===1) {
      var sel = document.getElementById('tr-store');
      if (sel) { sel.innerHTML='<option>'+esc(stores[0])+'</option>'; }
    } else if (!stores) {
      /* Admin — зареди всички магазини */
      sbGet('stores','select=name&order=name').then(function(data){
        var sel=document.getElementById('tr-store');
        if(sel&&Array.isArray(data)){
          sel.innerHTML='<option value="">-- Избери магазин --</option>'+
            data.map(function(s){return '<option>'+esc(s.name)+'</option>';}).join('');
        }
      });
    }
    ov.classList.add('open');
  }
}
function closeTransitModal() {
  var ov=document.getElementById('transit-ov'); if(ov)ov.classList.remove('open');
}

function submitTransit() {
  var store=(document.getElementById('tr-store').value||'').trim();
  var desc=(document.getElementById('tr-desc').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!desc){toast('Въведи описание','#dc2626');return;}
  sbPost('goods_transit',{
    store_name:store,
    source_type:document.getElementById('tr-src').value,
    source_name:document.getElementById('tr-srcname').value,
    description:desc,
    order_date:document.getElementById('tr-odate').value||null,
    expected_date:document.getElementById('tr-edate').value||null,
    notes:document.getElementById('tr-notes').value,
    created_by:currentUser.display_name||currentUser.email,
    status:'pending'
  }).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeTransitModal(); toast('✅ Записът е добавен!'); loadTransit();
  });
}
