/* transit.js — Стока на път (SAP формат) — v2 с incoming/outgoing */

var transitData   = [];
var transitFilter = 'pending';
var transitStore  = '';
var transitDir    = 'all'; /* 'all' | 'incoming' | 'outgoing' */
var transitEditId = null;
var transitMonthFilter = ''; /* 'YYYY-MM' за филтър по месец */

/* ── PLANT MAPPING ── */
var PLANT_INCOMING = {
  '5502':'Севлиево','5503':'Враца','5507':'Монтана','5508':'Кърджали',
  '5512':'Търговище','5513':'Сливен','5514':'Шумен','5515':'Габрово',
  '5516':'Добрич','5519':'Гоце Делчев','5520':'Силистра','5521':'Раднево',
  '5522':'Дупница','5523':'Петрич','5524':'Пирдоп','5525':'Троян',
  '5526':'Карлово','5527':'Козлодуй',
  '5518':'Логистичен склад Добрич','5505':'Логистичен склад Търговище',
  /* Допълнителни обекти */
  '5531':'Сервиз Троян','5510':'Администрация','5506':'Пазарджик'
};
var PLANT_OUTGOING = {
  '2502':'Севлиево','2503':'Враца','2513':'Сливен','2520':'Силистра',
  '2521':'Раднево','2522':'Дупница',
  '6527':'Козлодуй','6508':'Кърджали','6512':'Търговище','6514':'Шумен',
  '6525':'Троян','6516':'Добрич',
  '7526':'Карлово','7523':'Петрич','7519':'Гоце Делчев','7507':'Монтана',
  '7515':'Габрово','7524':'Пирдоп',
  '2505':'Логистичен склад Търговище','2518':'Логистичен склад Добрич'
};
var PLANT_ALL = Object.assign({}, PLANT_INCOMING, PLANT_OUTGOING);

var T_STATUS = {
  pending:  { label:'⏳ Не доставена', bg:'#fef9c3', color:'#92400e' },
  received: { label:'✅ Прието',       bg:'#f0fdf4', color:'#16a34a' },
  rejected: { label:'✕ Неприето',     bg:'#fff1f2', color:'#dc2626' }
};

function canEditTransit(){
  return currentUser&&['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role)>=0;
}
function canAddTransit(){
  return currentUser&&['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
}

/* ── LOAD с pagination чрез Range header ── */
function loadTransit(){
  var wrap=document.getElementById('mod-transit');
  if(wrap)wrap.innerHTML='<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';

  var storeFilter='';
  if(!isGlobal()){
    var store=currentUser.store_name||'';
    var se=encodeURIComponent(store);
    storeFilter='&or=(store_name.eq.'+se+',supplier.ilike.*'+se+'*)';
  }

  transitData=[];
  var SB_URL='https://xiwkdiqqplgdcrkewgtv.supabase.co';
  var SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';

  function loadPage(from){
    var to=from+999;
    fetch(SB_URL+'/rest/v1/goods_transit?order=doc_date.desc,purchase_doc.asc,position.asc'+storeFilter,{
      headers:{
        'apikey':SB_KEY,
        'Authorization':'Bearer '+SB_KEY,
        'Range':from+'-'+to,
        'Range-Unit':'items',
        'Prefer':'count=exact'
      }
    }).then(function(r){
      var range=r.headers.get('content-range')||'';
      return r.json().then(function(data){
        return {data:data,range:range};
      });
    }).then(function(res){
      var data=Array.isArray(res.data)?res.data:[];
      transitData=transitData.concat(data);
      /* Парсваме total от content-range: "0-999/1305" */
      var total=0;
      var m=res.range.match(/\/(\d+)$/);
      if(m)total=parseInt(m[1]);
      var loaded=transitData.length;
      if(total>0&&loaded<total&&data.length===1000){
        /* Има още - зареждаме следващата страница */
        loadPage(from+1000);
      }else{
        renderTransit();
      }
    }).catch(function(err){
      var w=document.getElementById('mod-transit');
      if(w)w.innerHTML='<div style="color:#dc2626;padding:40px;">Грешка: '+JSON.stringify(err)+'</div>';
    });
  }
  loadPage(0);
}

/* ── RENDER ── */
function renderTransit(){
  var wrap=document.getElementById('mod-transit');if(!wrap)return;
  var isAdmin=currentUser&&['admin','accounting','logistics'].indexOf(currentUser.role)>=0;
  var canEdit=canEditTransit();
  var canAdd=canAddTransit();

  /* Приложи direction филтър */
  var viewData=transitData;
  if(transitDir==='incoming') viewData=transitData.filter(function(r){return r.direction!=='outgoing';});
  else if(transitDir==='outgoing') viewData=transitData.filter(function(r){return r.direction==='outgoing';});

  /* Статус филтър */
  var list=viewData.filter(function(r){
    if(transitFilter==='pending')  return r.status==='pending';
    if(transitFilter==='received') return r.status==='received';
    if(transitFilter==='rejected') return r.status==='rejected';
    return true;
  });
  if(transitStore) list=list.filter(function(r){return r.store_name===transitStore;});
  if(transitMonthFilter) list=list.filter(function(r){
    return r.doc_date&&r.doc_date.slice(0,7)===transitMonthFilter;
  });

  /* Статистика */
  var counts={pending:0,received:0,rejected:0,incCount:0,outCount:0};
  viewData.forEach(function(r){
    if(counts[r.status]!==undefined)counts[r.status]++;
    if(r.direction==='outgoing') counts.outCount++;
    else counts.incCount++;
  });
  var allCounts={pending:0,received:0,rejected:0};
  transitData.forEach(function(r){if(allCounts[r.status]!==undefined)allCounts[r.status]++;});

  /* Магазини за dropdown */
  var stores={};
  transitData.forEach(function(r){if(r.store_name)stores[r.store_name]=1;});
  var storeList=Object.keys(stores).sort();

  var h='<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие + бутони */
  h+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h+='<div style="font-size:20px;font-weight:600;">📦 Стока на път</div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  if(canAdd){
    h+='<button onclick="openTransitImportModal()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📥 Импорт Excel</button>';
    h+='<button onclick="openTransitAdd()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави ред</button>';
  }
  if(isAdmin){
    h+='<button onclick="exportTransitExcel()" style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📊 Експорт Excel</button>';
    h+='<button onclick="confirmClearTransit()" style="border:1px solid #dc2626;background:#fff5f5;color:#dc2626;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">🗑 Изчисти всички</button>';
  }
  h+='</div></div>';

  /* Stat карти */
  h+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px;">';
  h+=tStatCard('📦 Incoming',counts.incCount,'#2563eb');
  h+=tStatCard('📤 Outgoing',counts.outCount,'#7c3aed');
  h+=tStatCard('⏳ Не доставени',counts.pending,'#d97706');
  h+=tStatCard('✅ Прието',counts.received,'#16a34a');
  h+=tStatCard('✕ Неприето',counts.rejected,'#dc2626');
  h+='</div>';

  /* Direction tabs */
  h+='<div style="display:flex;gap:0;margin-bottom:12px;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;max-width:500px;">';
  [['all','📦📤 Всички','all'+(transitData.length?' ('+transitData.length+')':'')],
   ['incoming','📦 Получавам','('+allCounts.pending+' чакат)'],
   ['outgoing','📤 Изпращам','']].forEach(function(t){
    var active=transitDir===t[0];
    h+='<button onclick="transitDir=\''+t[0]+'\';renderTransit()" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:'+(active?'#0f172a':'#fff')+';color:'+(active?'#fff':'#64748b')+';">'+t[1]+'<div style="font-size:10px;opacity:0.7;">'+t[2]+'</div></button>';
  });
  h+='</div>';

  /* Статус + магазин + дата филтри */
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">';
  [['all','Всички'],['pending','⏳ Не доставени'],['received','✅ Прието'],['rejected','✕ Неприето']].forEach(function(f){
    var a=transitFilter===f[0];
    var cnt=f[0]==='all'?viewData.length:counts[f[0]]||0;
    h+='<button onclick="transitFilter=\''+f[0]+'\';renderTransit()" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+' ('+cnt+')</button>';
  });
  /* Магазин dropdown - всички уникални магазини от данните */
  var allStores={};
  transitData.forEach(function(r){if(r.store_name)allStores[r.store_name]=1;});
  var allStoreList=Object.keys(allStores).sort();
  if(allStoreList.length>0){
    h+='<select onchange="setTStore(this.value)" style="border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;">';
    h+='<option value="">Всички магазини</option>';
    allStoreList.forEach(function(s){h+='<option value="'+esc(s)+'"'+(transitStore===s?' selected':'')+'>'+esc(s)+'</option>';});
    h+='</select>';
  }
  /* Филтър по месец */
  h+='<input type="month" id="t-month" value="'+transitMonthFilter+'" onchange="transitMonthFilter=this.value;renderTransit()" style="border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;" title="Филтър по месец">';
  if(transitMonthFilter){
    h+='<button onclick="transitMonthFilter=\'\';document.getElementById(\'t-month\').value=\'\';renderTransit()" style="border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">✕ Всички</button>';
  }
  h+='</div>';

  /* Таблица */
  if(!list.length){
    h+='<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📦</div><div style="margin-top:8px;">Няма записи.</div></div>';
  }else{
    h+='<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:800px;">';
    h+='<thead><tr style="background:#f8fafc;">';
    ['Посока','Магазин','Доставчик','Документ','Дата','Описание','Кол./МЕ','Остатък','Трансфер','Статус',''].forEach(function(c){
      h+='<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
    });
    h+='</tr></thead><tbody>';

    list.forEach(function(r){
      var st=T_STATUS[r.status]||T_STATUS.pending;
      var isOut=r.direction==='outgoing';
      var isOver=r.status==='pending'&&r.doc_date&&(new Date()-new Date(r.doc_date))>30*86400000;
      var dirBg=isOut?'rgba(124,58,237,.04)':'';
      h+='<tr style="border-bottom:1px solid #f1f5f9;'+(isOver?'background:#fffbeb;':dirBg)+'">';
      /* Посока */
      h+='<td style="padding:6px 10px;white-space:nowrap;">';
      h+=isOut?
        '<span style="background:#f5f3ff;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">📤 Изпращам</span>':
        '<span style="background:#eff6ff;color:#1e40af;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">📦 Получавам</span>';
      h+='</td>';
      h+=
        '<td style="padding:7px 10px;font-weight:500;white-space:nowrap;">'+esc(r.store_name||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#64748b;max-width:130px;">'+
        esc((r.supplier||'').replace(/^\d+\s+\d*\s*/,'').replace(/^\d+\s*/,'').replace(/^ТМ\s+/,''))+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;white-space:nowrap;">'+esc(r.purchase_doc||'')+'<div style="font-size:10px;color:#94a3b8;">Поз. '+(r.position||'—')+'</div></td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;white-space:nowrap;">'+fmtDate(r.doc_date)+'</td>'+
        '<td style="padding:7px 10px;max-width:220px;"><div style="font-size:11px;font-weight:500;">'+esc(r.material_name||'')+'</div><div style="font-size:10px;color:#94a3b8;">'+esc(r.material_code||'')+'</div></td>'+
        '<td style="padding:7px 10px;text-align:right;white-space:nowrap;">'+(r.ordered_qty||'')+'<span style="font-size:10px;color:#94a3b8;margin-left:2px;">'+esc(r.unit||'')+'</span></td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+(r.remaining_qty||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.transfer_date)+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">'+
          '<span style="background:'+st.bg+';color:'+st.color+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+st.label+'</span>'+
          (r.comment?'<div style="font-size:10px;color:#94a3b8;margin-top:2px;">'+esc(r.comment)+'</div>':'')+
        '</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';
      if(canEdit&&r.status==='pending'){
        h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'received\')" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✅</button>';
        h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'rejected\')" style="border:1px solid #fecaca;background:#fff1f2;color:#dc2626;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✕</button>';
      }
      if(canEdit&&r.status!=='pending'){
        h+='<button data-id="'+r.id+'" onclick="tMarkStatus(this.dataset.id,\'pending\')" style="border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">↩</button>';
      }
      if(canEdit){
        h+='<button data-id="'+r.id+'" onclick="openTransitEdit(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
      }
      if(isAdmin){
        h+='<button data-id="'+r.id+'" onclick="tDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button>';
      }
      h+='</td></tr>';
    });
    h+='</tbody></table></div>';
    h+='<div style="font-size:12px;color:#94a3b8;margin-top:8px;">Показани '+list.length+' от '+transitData.length+' записа.</div>';
  }
  h+='</div>';
  h+=transitModalHtml();
  wrap.innerHTML=h;
}

function tStatCard(label,val,color){
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid '+color+';">'+
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">'+label+'</div>'+
    '<div style="font-size:22px;font-weight:700;color:'+color+';font-family:DM Mono,monospace;">'+val+'</div>'+
  '</div>';
}

function setTFilter(f){ transitFilter=f; renderTransit(); }
function setTStore(s){ transitStore=s; renderTransit(); }

/* ── СТАТУС ПРОМЯНА ── */
function tMarkStatus(id,status){
  sbPatch('goods_transit','id=eq.'+id,{status:status,updated_by:currentUser.display_name||currentUser.email,updated_at:new Date().toISOString()})
  .then(function(){ loadTransit(); }).catch(function(){ toast('Грешка','#dc2626'); });
}

/* ── ИЗТРИЙ РЕД ── */
function tDelete(id){
  if(!confirm('Изтрий този ред?'))return;
  sbDelete('goods_transit','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadTransit(); });
}

/* ── ИЗЧИСТИ ВСИЧКИ (admin) ── */
function confirmClearTransit(){
  if(currentUser.role!=='admin'){toast('Само за admin','#dc2626');return;}
  if(!confirm('ВНИМАНИЕ: Ще се изтрият ВСИЧКИ записи в Стока на път!\n\nПродължи ли?'))return;
  if(!confirm('Потвърди повторно — това е необратимо!'))return;
  /* Изтриваме на batch-ове — sbDelete без id изтрива всичко */
  fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/rest/v1/goods_transit?id=neq.00000000-0000-0000-0000-000000000000',{
    method:'DELETE',
    headers:{
      'apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
      'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA'
    }
  }).then(function(r){
    if(r.ok){toast('🗑 Всички записи са изтрити');transitData=[];renderTransit();}
    else toast('Грешка при изчистване','#dc2626');
  });
}

/* ── ЕКСПОРТ EXCEL ── */
function exportTransitExcel(){
  if(!window.XLSX){
    var s=document.createElement('script');
    s.src='https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=exportTransitExcel;
    s.onerror=function(){toast('Грешка при зареждане на SheetJS','#dc2626');};
    document.head.appendChild(s);return;
  }
  var wb=window.XLSX.utils.book_new();
  var rows=[['Посока','Магазин','Доставчик/Склад','Документ','Позиция','Дата',
    'Материал','Описание','Кол.','МЕ','Остатък','Дата трансфер','Статус','Коментар',
    'Обновен от','Обновен на']];
  transitData.forEach(function(r){
    rows.push([
      r.direction==='outgoing'?'📤 Изпращам':'📦 Получавам',
      r.store_name||'',r.supplier||'',r.purchase_doc||'',r.position||'',
      r.doc_date||'',r.material_code||'',r.material_name||'',
      r.ordered_qty||'',r.unit||'',r.remaining_qty||'',
      r.transfer_date||'',
      r.status==='received'?'Прието':r.status==='rejected'?'Неприето':'Не доставена',
      r.comment||'',r.updated_by||'',r.updated_at?r.updated_at.slice(0,16).replace('T',' '):''
    ]);
  });
  var ws=window.XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:14},{wch:16},{wch:22},{wch:14},{wch:8},{wch:12},{wch:10},{wch:30},
    {wch:8},{wch:6},{wch:8},{wch:14},{wch:12},{wch:20},{wch:16},{wch:18}];
  window.XLSX.utils.book_append_sheet(wb,ws,'Стока на път');
  var fname='ТеМАХ_Стока_на_път_'+today()+'.xlsx';
  window.XLSX.writeFile(wb,fname);
  toast('✅ Excel изтеглен! ('+transitData.length+' записа)');

  /* Питаме дали да изчистим след експорта */
  if(currentUser.role==='admin'){
    setTimeout(function(){
      if(confirm('Да изчистя ли всички записи след експорта?\n(За да се качи новият месечен файл чисто)')){
        confirmClearTransit();
      }
    },1000);
  }
}

/* ── ДАТА НА ТРАНСФЕР ── */
function tSetTransferDate(id){
  var d=prompt('Дата на трансфер (ГГГГ-ММ-ДД):',today());
  if(!d)return;
  sbPatch('goods_transit','id=eq.'+id,{transfer_date:d,updated_by:currentUser.display_name||currentUser.email,updated_at:new Date().toISOString()})
  .then(function(){loadTransit();});
}

/* ── МОДАЛ ДОБАВЯНЕ/РЕДАКТИРАНЕ ── */
function transitModalHtml(){
  return '<div class="bov" id="transit-modal" onclick="if(event.target===this)closeTransitModal()">'+
    '<div class="bmod" style="width:560px;">'+
    '<div style="font-size:16px;font-weight:700;margin-bottom:16px;" id="transit-modal-title">+ Добави ред</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+
    '<div style="grid-column:1/-1;"><label class="fl">Посока *</label>'+
      '<select class="fi" id="tr-direction">'+
        '<option value="incoming">📦 Получавам (incoming)</option>'+
        '<option value="outgoing">📤 Изпращам (outgoing)</option>'+
      '</select></div>'+
    '<div><label class="fl">Магазин *</label>'+
      '<select class="fi" id="tr-store">'+
        '<option value="">-- Избери --</option>'+
        Object.values(PLANT_INCOMING).filter(function(v,i,a){return a.indexOf(v)===i;}).sort().map(function(s){
          return '<option value="'+esc(s)+'">'+esc(s)+'</option>';
        }).join('')+
      '</select></div>'+
    '<div><label class="fl">Доставчик / Склад</label><input class="fi" id="tr-supplier" placeholder="напр. 5518 Логистичен склад Добрич"></div>'+
    '<div><label class="fl">Документ за покупка</label><input class="fi" id="tr-purchase-doc" placeholder="напр. 4600123456"></div>'+
    '<div><label class="fl">Позиция</label><input class="fi" type="number" id="tr-position" placeholder="10"></div>'+
    '<div><label class="fl">Дата на документ</label><input class="fi" type="date" id="tr-doc-date"></div>'+
    '<div><label class="fl">Материален код</label><input class="fi" id="tr-material-code" placeholder="напр. 96466"></div>'+
    '<div><label class="fl">МЕ поръчка</label><input class="fi" id="tr-unit" placeholder="БР, M2, ПАК..."></div>'+
    '<div style="grid-column:1/-1;"><label class="fl">Описание на материала</label><input class="fi" id="tr-material-name"></div>'+
    '<div><label class="fl">Количество поръчка</label><input class="fi" type="number" step="0.001" id="tr-qty"></div>'+
    '<div><label class="fl">Остатък (недоставено)</label><input class="fi" type="number" step="0.001" id="tr-remaining"></div>'+
    '<div><label class="fl">Дата на трансфер</label><input class="fi" type="date" id="tr-transfer-date"></div>'+
    '<div><label class="fl">Статус</label>'+
      '<select class="fi" id="tr-status">'+
        '<option value="pending">⏳ Не доставена</option>'+
        '<option value="received">✅ Прието</option>'+
        '<option value="rejected">✕ Неприето</option>'+
      '</select></div>'+
    '<div style="grid-column:1/-1;"><label class="fl">Коментар</label><input class="fi" id="tr-comment" placeholder="прието / неприето / изпратена на... / все още не доставена"></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">'+
      '<button onclick="closeTransitModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button onclick="submitTransit()" style="border:none;background:#0f172a;color:#fff;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>'+
    '</div>'+
    '</div></div>';
}

function openTransitAdd(){
  transitEditId=null;
  var m=document.getElementById('transit-modal');if(!m)return;
  document.getElementById('transit-modal-title').textContent='+ Добави ред';
  document.getElementById('tr-direction').value='incoming';
  document.getElementById('tr-store').value=currentUser.store_name||'';
  document.getElementById('tr-supplier').value='';
  document.getElementById('tr-purchase-doc').value='';
  document.getElementById('tr-position').value='';
  document.getElementById('tr-doc-date').value=today();
  document.getElementById('tr-material-code').value='';
  document.getElementById('tr-unit').value='';
  document.getElementById('tr-material-name').value='';
  document.getElementById('tr-qty').value='';
  document.getElementById('tr-remaining').value='';
  document.getElementById('tr-transfer-date').value='';
  document.getElementById('tr-status').value='pending';
  document.getElementById('tr-comment').value='';
  m.classList.add('open');
}

function openTransitEdit(id){
  var r=transitData.find(function(x){return x.id===id;});if(!r)return;
  transitEditId=id;
  var m=document.getElementById('transit-modal');if(!m)return;
  document.getElementById('transit-modal-title').textContent='✏️ Редактирай ред';
  document.getElementById('tr-direction').value=r.direction||'incoming';
  document.getElementById('tr-store').value=r.store_name||'';
  document.getElementById('tr-supplier').value=r.supplier||'';
  document.getElementById('tr-purchase-doc').value=r.purchase_doc||'';
  document.getElementById('tr-position').value=r.position||'';
  document.getElementById('tr-doc-date').value=r.doc_date||'';
  document.getElementById('tr-material-code').value=r.material_code||'';
  document.getElementById('tr-unit').value=r.unit||'';
  document.getElementById('tr-material-name').value=r.material_name||'';
  document.getElementById('tr-qty').value=r.ordered_qty||'';
  document.getElementById('tr-remaining').value=r.remaining_qty||'';
  document.getElementById('tr-transfer-date').value=r.transfer_date||'';
  document.getElementById('tr-status').value=r.status||'pending';
  document.getElementById('tr-comment').value=r.comment||'';
  m.classList.add('open');
}

function closeTransitModal(){
  var m=document.getElementById('transit-modal');
  if(m)m.classList.remove('open');
  transitEditId=null;
}

function submitTransit(){
  var store=document.getElementById('tr-store').value;
  var material=document.getElementById('tr-material-name').value.trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!material){toast('Въведи описание на материала','#dc2626');return;}
  var data={
    direction:document.getElementById('tr-direction').value||'incoming',
    store_name:store,
    supplier:document.getElementById('tr-supplier').value.trim(),
    purchase_doc:String(document.getElementById('tr-purchase-doc').value.trim()),
    position:parseInt(document.getElementById('tr-position').value)||null,
    doc_date:document.getElementById('tr-doc-date').value||null,
    material_code:document.getElementById('tr-material-code').value.trim(),
    unit:document.getElementById('tr-unit').value.trim(),
    material_name:material,
    ordered_qty:parseFloat(document.getElementById('tr-qty').value)||null,
    remaining_qty:parseFloat(document.getElementById('tr-remaining').value)||null,
    transfer_date:document.getElementById('tr-transfer-date').value||null,
    status:document.getElementById('tr-status').value||'pending',
    comment:document.getElementById('tr-comment').value.trim(),
    updated_by:currentUser.display_name||currentUser.email,
    updated_at:new Date().toISOString()
  };
  var req=transitEditId?
    sbPatch('goods_transit','id=eq.'+transitEditId,data):
    sbPost('goods_transit',data);
  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast(transitEditId?'✅ Записано!':'✅ Добавено!');
    closeTransitModal();loadTransit();
  });
}


/* ═══════════════════════════════════════════════════════════════
   ИМПОРТ ОТ SAP EXCEL
═══════════════════════════════════════════════════════════════ */

function openTransitImportModal(){
  if(!canAddTransit()){toast('Нямаш права за импорт','#dc2626');return;}
  var input=document.createElement('input');
  input.type='file';input.accept='.xlsx,.xls';
  input.onchange=function(e){
    var file=e.target.files[0];if(!file)return;
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
        var wb=window.XLSX.read(data,{type:'array',cellDates:true});
        /* Четем ВСИЧКИ sheet-ове, пропускаме header */
        var allRows=[];
        var detectedFmt='old';
        wb.SheetNames.forEach(function(sheetName){
          var ws=wb.Sheets[sheetName];
          var rows=window.XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'yyyy-mm-dd'});
          if(!rows.length)return;
          /* Определяме формата по ПЪРВИЯ ред (header или данни) */
          if(rows[0][0]&&isNaN(parseInt(String(rows[0][0]).trim()))){
            detectedFmt='new';
            /* Нов формат: пропускаме header */
            if(rows.length>1) allRows=allRows.concat(rows.slice(1));
          }else{
            /* Стар формат: без header */
            allRows=allRows.concat(rows);
          }
        });
        if(!allRows.length){toast('Файлът е празен или невалиден','#dc2626');return;}
        parseTransitRows(allRows, detectedFmt);
      }catch(err){
        toast('Грешка при четене: '+err.message,'#dc2626');
        console.error('Excel error:',err);
      }
    };
    reader.readAsArrayBuffer(file);
  }
  /* XLSX се зарежда от index.html - трябва да е готов */
  if(window.XLSX){
    doImport();
  } else {
    toast('⏳ Зарежда се Excel библиотека...','#2563eb');
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=function(){ setTimeout(doImport,200); };
    s.onerror=function(){
      var s2=document.createElement('script');
      s2.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s2.onload=function(){ setTimeout(doImport,200); };
      s2.onerror=function(){ toast('Грешка: Excel библиотеката не може да се зареди. Опитай с Chrome.','#dc2626'); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  }
}

function parseExcelDate(val){
  if(!val)return null;
  if(val instanceof Date)return val.toISOString().slice(0,10);
  var s=String(val).trim();
  var m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  var m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m2)return m2[0];
  return null;
}

function parseExcelNum(val){
  if(val===null||val===undefined||val==='')return null;
  var n=parseFloat(String(val).trim().replace(',','.'));
  return isNaN(n)?null:n;
}

/* Извличаме supplier store от "6508       Кърджали" или "5505 5005 Логистичен склад Търговищ" */
function parseSupplierName(raw){
  if(!raw)return '';
  var s=String(raw).trim();
  /* Вземаме първия код */
  var code=s.split(/\s+/)[0];
  /* Търсим в PLANT_ALL */
  if(PLANT_ALL[code])return PLANT_ALL[code];
  /* Вземаме текста след кода */
  var rest=s.replace(/^\d+\s*/,'').replace(/^\d+\s*/,'').trim();
  /* Почистваме "ТМ " prefix */
  return rest.replace(/^ТМ\s+/,'');
}

var _transitImportRows=[];

function detectSapFormat(rows){
  /* Открива формата автоматично по header или по броя колони */
  if(!rows||!rows.length)return 'old';
  var first=rows[0];
  /* Ако първия ред е header (текст в кол.0) */
  if(first[0]&&isNaN(parseInt(first[0]))){
    /* Нов формат: 18 колони с header */
    /* Колони: Завод(0), Склад(1), Доставчик(2), Документ(3), Позиция(4),
       Вид(5), Търг.орг(6), Снаб.гр(7), Инд(8), История(9),
       Дата(10), Материал(11), Текст(12), Гр.мат(13), Кат(14),
       Кол(15), МЕ(16), Остатък(17) */
    return 'new';
  }
  /* Стар формат: без header, 13 колони */
  return 'old';
}

function parseTransitRows(rows, forceFmt){
  if(!rows||!rows.length){toast('Файлът е празен','#dc2626');return;}
  
  /* Ако форматът е подаден директно - използваме го, иначе го определяме */
  var fmt=forceFmt||detectSapFormat(rows);
  var dataRows=rows;
  /* Ако пак има header ред (текст в кол.0) - пропускаме го */
  if(dataRows.length>0&&dataRows[0][0]&&isNaN(parseInt(String(dataRows[0][0]).trim()))){
    dataRows=dataRows.slice(1);
  }
  
  var parsed=dataRows.map(function(row){
    if(!row[0])return null;
    var plant=String(row[0]||'').trim();
    /* Заводът определя КОЙ ПОЛУЧАВА стоката */
    var store=PLANT_INCOMING[plant]||PLANT_OUTGOING[plant]||null;
    if(!store)return null; /* Непознат завод */
    
    /* Посоката се определя от ДОСТАВЧИКА:
       Ако доставчикът е с outgoing код (2xxx/6xxx/7xxx) = магазин изпраща = outgoing
       Ако доставчикът е с incoming код (5xxx) = склад/логистика изпраща = incoming */
    var supplierCodeRaw = (fmt==='new'?String(row[2]||''):String(row[1]||'')).trim();
    var supplierFirstCode = supplierCodeRaw.split(/\s+/)[0]||'';
    var direction = PLANT_OUTGOING[supplierFirstCode] ? 'outgoing' : 'incoming';
    
    var supplierRaw, purchase_doc, position, doc_date, 
        material_code, material_name, ordered_qty, unit, remaining_qty;
    
    if(fmt==='new'){
      /* Нов SAP формат — 18 колони с header */
      supplierRaw  = String(row[2]||'').trim();
      purchase_doc = String(row[3]||'').trim();
      position     = parseInt(row[4])||null;
      doc_date     = parseExcelDate(row[10]);
      material_code= String(row[11]||'').trim();
      material_name= String(row[12]||'').trim();
      ordered_qty  = parseExcelNum(row[15]);
      unit         = String(row[16]||'').trim();
      remaining_qty= parseExcelNum(row[17]);
    }else{
      /* Стар формат — 13 колони без header */
      supplierRaw  = String(row[1]||'').trim();
      purchase_doc = String(row[2]||'').trim();
      position     = parseInt(row[3])||null;
      doc_date     = parseExcelDate(row[4]);
      material_code= String(row[5]||'').trim();
      material_name= String(row[6]||'').trim();
      ordered_qty  = parseExcelNum(row[7]);
      unit         = String(row[8]||'').trim();
      remaining_qty= parseExcelNum(row[9]);
    }
    
    return {
      plant:plant, direction:direction, store_name:store,
      supplier:parseSupplierName(supplierRaw),
      purchase_doc:String(purchase_doc||''), position:position, doc_date:doc_date,
      material_code:material_code, material_name:material_name,
      ordered_qty:ordered_qty, unit:unit, remaining_qty:remaining_qty,
      comment:'',     /* Магазините попълват ръчно в портала */
      transfer_date:null,
    };
  }).filter(Boolean).filter(function(r){return r.material_code||r.material_name;});

  _transitImportRows=parsed;

  /* Summary по магазин и посока */
  var summary={};
  parsed.forEach(function(r){
    var key=r.store_name+'|'+r.direction;
    if(!summary[key])summary[key]={store:r.store_name,dir:r.direction,count:0};
    summary[key].count++;
  });

  renderTransitImportPreview(summary,parsed.length);
}

function renderTransitImportPreview(summary,total){
  var old=document.getElementById('transit-import-ov');
  if(old&&old.remove)old.remove();

  var rows=Object.values(summary).sort(function(a,b){
    return a.store.localeCompare(b.store,'bg')||(a.dir>b.dir?1:-1);
  });
  var incoming=rows.filter(function(r){return r.dir!=='outgoing';});
  var outgoing=rows.filter(function(r){return r.dir==='outgoing';});

  var h='<div class="bov open" id="transit-import-ov" onclick="if(event.target===this)closeTransitImport()">'+
    '<div class="bmod" style="width:660px;max-height:85vh;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
      '<div style="font-size:16px;font-weight:700;">📥 Импорт от SAP Excel</div>'+
      '<button onclick="closeTransitImport()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e3a5f;">'+
      'Разпознати <b>'+total+'</b> реда от SAP файла.'+
    '</div>'+

    /* Incoming */
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">'+
    '<div>'+
    '<div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">📦 ПОЛУЧАВАМ (incoming) — '+incoming.reduce(function(s,r){return s+r.count;},0)+' реда</div>'+
    '<div style="max-height:200px;overflow-y:auto;border:1px solid #dbeafe;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    incoming.map(function(r){
      return '<tr style="border-bottom:1px solid #eff6ff;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#1e40af;font-weight:600;">'+r.count+'</td></tr>';
    }).join('')+
    '</table></div></div>'+

    /* Outgoing */
    '<div>'+
    '<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px;">📤 ИЗПРАЩАМ (outgoing) — '+outgoing.reduce(function(s,r){return s+r.count;},0)+' реда</div>'+
    '<div style="max-height:200px;overflow-y:auto;border:1px solid #e9d5ff;border-radius:8px;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    (outgoing.length?outgoing.map(function(r){
      return '<tr style="border-bottom:1px solid #faf5ff;"><td style="padding:5px 10px;font-weight:500;">'+esc(r.store)+'</td><td style="padding:5px 10px;text-align:right;color:#7c3aed;font-weight:600;">'+r.count+'</td></tr>';
    }).join(''):'<tr><td style="padding:10px;color:#94a3b8;text-align:center;">Няма outgoing записи</td></tr>')+
    '</table></div></div>'+
    '</div>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="closeTransitImport()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button onclick="confirmTransitImport()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✅ Импортирай '+total+' реда</button>'+
    '</div>'+
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend',h);
}

function closeTransitImport(){
  var ov=document.getElementById('transit-import-ov');
  if(ov&&ov.remove)ov.remove();
  _transitImportRows=[];
}

function confirmTransitImport(){
  var rows=_transitImportRows;
  if(!rows.length){toast('Няма редове за импорт','#dc2626');return;}
  toast('⏳ Импортиране на '+rows.length+' реда ('+Math.ceil(rows.length/25)+' batch-а)...');
  var batches=[];
  for(var i=0;i<rows.length;i+=50)batches.push(rows.slice(i,i+50));
  var inserted=0,failed=0;
  function next(idx){
    if(idx>=batches.length){
      closeTransitImport();
      toast('✅ Импортирани '+inserted+' реда'+(failed?', '+failed+' грешки':''));
      loadTransit();return;
    }
    var batch=batches[idx].map(function(r){
      return {
        direction:r.direction,store_name:r.store_name,supplier:String(r.supplier||''),
        purchase_doc:String(r.purchase_doc||''),position:r.position,doc_date:r.doc_date,
        material_code:String(r.material_code||''),material_name:String(r.material_name||''),
        ordered_qty:r.ordered_qty,unit:r.unit,remaining_qty:r.remaining_qty,
        comment:r.comment,transfer_date:r.transfer_date,
        status:'pending',
        updated_by:currentUser.display_name||currentUser.email,
        updated_at:new Date().toISOString()
      };
    });
    /* Batch INSERT директно - sbPost не поддържа масиви */
    fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/rest/v1/goods_transit',{
      method:'POST',
      headers:{
        'apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body:JSON.stringify(batch)
    }).then(function(r){
      if(r.ok){
        inserted+=batch.length;
        /* Показваме прогрес */
        if(idx%5===0) toast('⏳ Импортирани '+inserted+' от '+rows.length+'...');
      }else{
        r.json().then(function(e){
          console.error('Batch грешка:',JSON.stringify(e));
        }).catch(function(){});
        failed+=batch.length;
      }
      /* Малък delay между batch-овете за да не претоварим Supabase */
      setTimeout(function(){next(idx+1);}, 50);
    }).catch(function(e){console.error('Fetch грешка:',e);failed+=batch.length;setTimeout(function(){next(idx+1);},50);});
  }
  next(0);
}
