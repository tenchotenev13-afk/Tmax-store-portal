/* history.js — История & Търсене
   Видим за: accounting, admin, logistics
   Редактирай САМО тук при промени по модула. */

var histData   = { transport:[], client:[], kasa:[] };
var histFilter = { from:'', to:'', store:'', type:'all' };
var histStores = [];
var _histPoll  = null;

/* ── АВТОМАТИЧНО ОПРЕСНЯВАНЕ на 60 сек, само докато История е активен таб ── */
function startHistoryPolling(){
  if(_histPoll) clearInterval(_histPoll);
  _histPoll = setInterval(function(){
    if(window._currentModule!=='history'){ clearInterval(_histPoll); _histPoll=null; return; }
    if(histFilter.from && histFilter.to) runHistorySearch(true);
  }, 60000);
}

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadHistory(){
  renderHistoryShell();
  loadHistoryStores();
  startHistoryPolling();
  setTimeout(function(){
    var dw=document.getElementById('daily-overview');
    if(dw&&typeof loadDailyOverview==='function'){
      dw.innerHTML='<div style="padding:10px;color:#94a3b8;">⏳ Зареждане дневен преглед...</div>';
      loadDailyOverview();
    }
  },200);
}

function loadHistoryStores(){
  sbGet('stores','select=name&order=name'+storeQ('name')).then(function(data){
    histStores=Array.isArray(data)?data.map(function(s){return s.name;}):[]; 
    /* Попълни dropdown */
    var sel=document.getElementById('h-store');
    if(sel){
      histStores.forEach(function(name){
        var o=document.createElement('option');o.value=name;o.textContent=name;sel.appendChild(o);
      });
    }
  }).catch(function(){});
}

function runHistorySearch(silent){
  var from=document.getElementById('h-from').value;
  var to  =document.getElementById('h-to').value;
  var store=document.getElementById('h-store').value;
  var type =document.getElementById('h-type').value;
  histFilter={from:from,to:to,store:store,type:type};
  if(!from||!to){if(!silent)toast('Избери период от — до','#dc2626');return;}

  if(!silent) document.getElementById('h-results').innerHTML=
    '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div>';

  var promises=[];

  /* Ако е избран конкретен магазин от dropdown - използваме него,
     иначе ограничаваме до назначените магазини на потребителя */
  var sFilter = store
    ? '&store_name=eq.'+encodeURIComponent(store)
    : storeQ();

  if(type==='all'||type==='transport'){
    var q='order=created_at.desc&date=gte.'+from+'&date=lte.'+to+sFilter;
    promises.push(sbGet('transport_orders',q).then(function(d){histData.transport=Array.isArray(d)?d:[];}));
  } else { histData.transport=[]; }

  if(type==='all'||type==='client'){
    var q2='order=created_at.desc&date=gte.'+from+'&date=lte.'+to+sFilter;
    promises.push(sbGet('client_orders',q2).then(function(d){histData.client=Array.isArray(d)?d:[];}));
  } else { histData.client=[]; }

  if(type==='all'||type==='kasa'){
    var q3='order=date.desc&date=gte.'+from+'&date=lte.'+to+sFilter;
    promises.push(sbGet('kasa_reports',q3).then(function(d){histData.kasa=Array.isArray(d)?d:[];}));
  } else { histData.kasa=[]; }

  Promise.all(promises).then(function(){
    renderHistoryResults();
  }).catch(function(e){
    document.getElementById('h-results').innerHTML=
      '<div style="text-align:center;padding:30px;color:#dc2626;">Грешка при зареждане.</div>';
  });
}

/* ─── RENDER SHELL ──────────────────────────────────────────── */
function renderHistoryShell(){
  var wrap=document.getElementById('mod-history');if(!wrap)return;
  /* Default period: current month */
  var now=new Date();
  var firstDay=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
  var lastDay =new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().slice(0,10);

  wrap.innerHTML='<div class="page">'+
    '<div class="pg-title">📊 История & Търсене</div>'+
    '<div class="pg-sub">Преглед на всички записи по период, магазин и тип</div>'+

    '<div id="daily-overview" style="margin-bottom:16px;"></div>'+
    '<div class="card" style="margin-bottom:16px;">'+
      '<div class="card-title">🔍 Търсене по период</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:flex-end;flex-wrap:wrap;">'+
        '<div><label class="fl">От дата</label>'+
          '<input type="date" class="fi" id="h-from" value="'+firstDay+'"></div>'+
        '<div><label class="fl">До дата</label>'+
          '<input type="date" class="fi" id="h-to" value="'+lastDay+'"></div>'+
        '<div><label class="fl">Магазин</label>'+
          '<select class="fi" id="h-store"><option value="">— Всички —</option></select></div>'+
        '<div><label class="fl">Тип</label>'+
          '<select class="fi" id="h-type">'+
            '<option value="all">Всички</option>'+
            '<option value="transport">Транспортни заявки</option>'+
            '<option value="client">Клиентски заявки</option>'+
            '<option value="kasa">Касови отчети</option>'+
          '</select></div>'+
        '<div><label class="fl">&nbsp;</label>'+
          '<button onclick="runHistorySearch()" class="btn btn-green" style="width:100%;margin-top:0;">Търси →</button></div>'+
      '</div>'+
    '</div>'+

    '<div id="h-results">'+
      '<div style="text-align:center;padding:40px;color:#94a3b8;">'+
        '<div style="font-size:32px;margin-bottom:8px;">🔍</div>'+
        'Избери период и натисни Търси'+
      '</div>'+
    '</div>'+
  '</div>';

  loadHistoryStores();
}

/* ─── RENDER RESULTS ────────────────────────────────────────── */
function renderHistoryResults(){
  var wrap=document.getElementById('h-results');if(!wrap)return;
  var from=histFilter.from,to=histFilter.to,store=histFilter.store;
  var totalT=histData.transport.length;
  var totalC=histData.client.length;
  var totalK=histData.kasa.length;
  var totalAll=totalT+totalC+totalK;

  if(!totalAll){
    wrap.innerHTML='<div class="card" style="text-align:center;padding:30px;color:#94a3b8;">'+
      '<div style="font-size:32px;margin-bottom:8px;">📭</div>'+
      'Няма записи за избрания период и филтри.</div>';
    return;
  }

  var html='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'+
    '<div style="font-size:13px;color:var(--muted);">'+
      'Период: <b>'+fmtDate(from)+' — '+fmtDate(to)+'</b>'+
      (store?' &nbsp;|&nbsp; Магазин: <b>'+esc(store)+'</b>':'')+
      ' &nbsp;|&nbsp; Общо: <b>'+totalAll+'</b> записа'+
    '</div>'+
    '<div style="display:flex;gap:8px;">'+
    '<button onclick="printHistoryReport()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:500;cursor:pointer;">🖨 Разпечатай отчета</button>'+
    '<button onclick="exportKasaToExcel()" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;">📊 Експорт Excel</button>'+
    '</div>'+
  '</div>';

  /* Статистически карти */
  html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">';
  if(histData.transport.length){
    html+=metricCard('🚚 Транспортни заявки',histData.transport.length,'записа','#2563eb');
  }
  if(histData.client.length){
    var doneC=histData.client.filter(function(o){return o.status==='done';}).length;
    html+=metricCard('📋 Клиентски заявки',histData.client.length,'общо / '+doneC+' изпълнени','#16a34a');
  }
  if(histData.kasa.length){
    var totalRaz=histData.kasa.reduce(function(s,r){return s+(parseFloat(r.razlika)||0);},0);
    var razStr=(totalRaz<0?'–':'')+Math.abs(totalRaz).toFixed(2)+' EUR разлика';
    html+=metricCard('💰 Касови отчети',histData.kasa.length,'ПОС отчета / '+razStr,'#d97706');
  }
  html+='</div>';

  /* Транспортни заявки */
  if(histData.transport.length){
    html+='<div class="card" style="margin-bottom:14px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
        '<div class="card-title" style="margin:0;">🚚 Транспортни заявки ('+histData.transport.length+')</div>'+
      '</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr><th>Дата</th><th>Магазин</th><th>Клиент</th><th>Продукт</th><th>Адрес</th><th>Доставка</th><th>Статус</th></tr></thead>'+
      '<tbody>'+
      histData.transport.map(function(o){
        return '<tr>'+
          '<td>'+esc(o.date||'')+'<br><small style="color:#94a3b8;">'+esc(o.hour||'')+'</small></td>'+
          '<td>'+esc(o.store_name||'')+'</td>'+
          '<td><b>'+esc(o.customer_name||'')+'</b><br><small style="color:#94a3b8;">'+esc(o.phone||'')+'</small></td>'+
          '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+(o.sap?'SAP: '+esc(o.sap):'')+'</small></td>'+
          '<td style="font-size:11px;">'+esc(o.address||'')+'</td>'+
          '<td><b>'+fmtDate(o.delivery)+'</b></td>'+
          '<td>'+statusBadge(calcStatus(o.delivery,o.status))+'</td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  /* Клиентски заявки */
  if(histData.client.length){
    html+='<div class="card" style="margin-bottom:14px;">'+
      '<div class="card-title">📋 Клиентски заявки ('+histData.client.length+')</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr><th>№</th><th>Дата</th><th>Магазин</th><th>Клиент</th><th>Продукт</th><th>Доставка</th><th>Статус</th></tr></thead>'+
      '<tbody>'+
      histData.client.map(function(o){
        return '<tr>'+
          '<td style="font-family:monospace;font-size:11px;">'+esc(o.in_num||'—')+'</td>'+
          '<td>'+esc(o.date||'')+'<br><small style="color:#94a3b8;">'+esc(o.hour||'')+'</small></td>'+
          '<td>'+esc(o.store_name||'')+'</td>'+
          '<td><b>'+esc(o.customer_name||'')+'</b><br><small style="color:#94a3b8;">'+esc(o.phone||'')+'</small></td>'+
          '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+(o.sap?'SAP: '+esc(o.sap):'')+'</small></td>'+
          '<td><b>'+fmtDate(o.delivery)+'</b></td>'+
          '<td>'+statusBadge(calcStatus(o.delivery,o.status))+'</td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  /* Касови отчети */
  if(histData.kasa.length){
    /* Групирай по дата */
    var byDate={};
    histData.kasa.forEach(function(r){
      var d=r.date||'';
      if(!byDate[d])byDate[d]={date:d,store:r.store_name,reports:[],tCash:0,tCount:0,tRaz:0,tInkaso:0};
      byDate[d].reports.push(r);
      byDate[d].tCash  +=parseFloat(r.cash_turnover)||0;
      byDate[d].tCount +=parseFloat(r.counted_cash)||0;
      byDate[d].tRaz   +=parseFloat(r.razlika)||0;
      byDate[d].tInkaso+=r._inkaso||0;
    });
    var dates=Object.keys(byDate).sort().reverse();
    var allRaz=histData.kasa.reduce(function(s,r){return s+(parseFloat(r.razlika)||0);},0);
    var razCol=allRaz<0?'#dc2626':allRaz>0?'#d97706':'#16a34a';

    html+='<div class="card">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
        '<div class="card-title" style="margin:0;">💰 Касови отчети ('+histData.kasa.length+' ПОС отчета)</div>'+
        '<div style="font-size:13px;font-weight:700;color:'+razCol+';">Обща разлика: '+(allRaz<0?'–':'')+Math.abs(allRaz).toFixed(2)+' EUR</div>'+
      '</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr><th>Дата</th><th>Магазин</th><th>ПОС</th><th>Касиер</th><th>В брой</th><th>Инкасо</th><th>Налични</th><th>Разлика</th><th>Статус</th></tr></thead>'+
      '<tbody>'+
      histData.kasa.map(function(r){
        var inkaso=calcInkaso(r);
        var raz=parseFloat(r.razlika)||0;
        var razC=raz<0?'#dc2626':raz>0?'#d97706':'#16a34a';
        return '<tr>'+
          '<td>'+fmtDate(r.date)+'</td>'+
          '<td>'+esc(r.store_name||'')+'</td>'+
          '<td style="text-align:center;font-weight:600;">'+esc(String(r.pos_number||''))+'</td>'+
          '<td>'+esc(r.cashier_name||'')+'</td>'+
          '<td style="font-family:monospace;">'+fmtMoney(r.cash_turnover)+'</td>'+
          '<td style="font-family:monospace;">'+fmtMoney(inkaso)+'</td>'+
          '<td style="font-family:monospace;">'+fmtMoney(r.counted_cash)+'</td>'+
          '<td style="font-family:monospace;font-weight:700;color:'+razC+';">'+(raz<0?'–':'')+Math.abs(raz).toFixed(2)+' EUR</td>'+
          '<td>'+(r.status==='confirmed'?'✅':r.status==='returned'?'↩':'✏️')+'</td>'+
        '<td><button onclick="openKasaDetail(\''+r.store_name+'\',' + '\''+r.date+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 9px;font-size:11px;cursor:pointer;">Детайли →</button></td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  /* Секция Документи за периода */
  if(histData.kasa.length){
    sbGet('kasa_documents','order=date.desc,store_name.asc,created_at.desc&date=gte.'+histFilter.from+'&date=lte.'+histFilter.to+(histFilter.store?'&store_name=eq.'+encodeURIComponent(histFilter.store):storeQ())).then(function(docs){
      if(!Array.isArray(docs)||!docs.length) return;
      var docTypes={pos:'ПОС',glavna:'Главна каса',zoborot:'Равнение',other:'Друго'};
      var docHtml='<div class="card" style="margin-top:14px;">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
          '<div class="card-title" style="margin:0;">📎 Прикачени документи ('+docs.length+')</div>'+
          '<div style="font-size:11px;color:#64748b;">Преглед в портала · Изтегляне от Supabase Storage</div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">';
      docs.forEach(function(d){
        var isPdf = /\.pdf$/i.test(d.file_name||'');
        var icon = isPdf ? '📄' : '🖼️';
        var bg = isPdf ? '#eff6ff' : '#f0fdf4';
        var border = isPdf ? '#bfdbfe' : '#bbf7d0';
        docHtml+='<div style="border:1px solid '+border+';background:'+bg+';border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;">'+
          '<div style="font-size:22px;text-align:center;">'+icon+'</div>'+
          '<div style="font-size:11px;font-weight:600;color:#0f172a;text-align:center;word-break:break-all;">'+esc(d.file_name||'')+'</div>'+
          '<div style="font-size:10px;color:#64748b;text-align:center;">'+esc(d.store_name||'')+' · '+fmtDate(d.date)+'</div>'+
          '<div style="font-size:10px;color:#64748b;text-align:center;">'+(docTypes[d.report_type]||d.report_type||'')+'</div>'+
          '<button data-path="'+esc(d.file_url)+'" onclick="previewKasaDoc(this.dataset.path)" style="border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;font-weight:600;">👁 Преглед</button>'+
        '</div>';
      });
      docHtml+='</div></div>';
      var existing=document.getElementById('h-results');
      if(existing) existing.innerHTML+=docHtml;
    }).catch(function(){});
  }

  wrap.innerHTML=html;
}

function metricCard(label,val,sub,col){
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+col+';">'+
    '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+label+'</div>'+
    '<div style="font-size:24px;font-weight:700;color:'+col+';font-family:DM Mono,monospace;">'+val+'</div>'+
    '<div style="font-size:11px;color:#94a3b8;">'+sub+'</div>'+
  '</div>';
}

function fmtMoney(v){
  var n=parseFloat(v)||0;
  return (n<0?'–':'')+Math.abs(n).toFixed(2)+'EUR';
}

/* ─── PRINT HISTORY REPORT ──────────────────────────────────── */
function printHistoryReport(){
  var from=histFilter.from,to=histFilter.to,store=histFilter.store;
  var totalT=histData.transport.length;
  var totalC=histData.client.length;
  var totalK=histData.kasa.length;

  var tCash=histData.kasa.reduce(function(s,r){return s+(parseFloat(r.cash_turnover)||0);},0);
  var tRaz =histData.kasa.reduce(function(s,r){return s+(parseFloat(r.razlika)||0);},0);
  var tDone=histData.client.filter(function(o){return o.status==='done';}).length;
  var razC =tRaz<0?'#dc2626':tRaz>0?'#d97706':'#16a34a';

  var kasaRows=histData.kasa.map(function(r){
    var ink=calcInkaso(r);
    var raz=parseFloat(r.razlika)||0;
    var rc=raz<0?'color:#dc2626':raz>0?'color:#d97706':'color:#16a34a';
    return '<tr>'+
      '<td>'+fmtDate(r.date)+'</td>'+
      '<td>'+esc(r.store_name||'')+'</td>'+
      '<td style="text-align:center;">'+esc(String(r.pos_number||''))+'</td>'+
      '<td>'+esc(r.cashier_name||'')+'</td>'+
      '<td style="text-align:right;font-family:monospace;">'+fmtMoney(r.cash_turnover)+'</td>'+
      '<td style="text-align:right;font-family:monospace;">'+fmtMoney(ink)+'</td>'+
      '<td style="text-align:right;font-family:monospace;">'+fmtMoney(r.counted_cash)+'</td>'+
      '<td style="text-align:right;font-family:monospace;font-weight:700;'+rc+'">'+(raz<0?'–':'')+Math.abs(raz).toFixed(2)+' EUR</td>'+
      '<td style="text-align:center;">'+(r.status==='confirmed'?'✅':r.status==='returned'?'↩':'✏️')+'</td>'+
    '</tr>';
  }).join('');

  var transportRows=histData.transport.map(function(o){
    return '<tr>'+
      '<td>'+esc(o.date||'')+'</td>'+
      '<td>'+esc(o.store_name||'')+'</td>'+
      '<td>'+esc(o.customer_name||'')+'</td>'+
      '<td>'+esc(o.phone||'')+'</td>'+
      '<td>'+(o.sap?esc(o.sap)+' — ':'')+esc(o.product||'')+'</td>'+
      '<td>'+esc(o.address||'')+'</td>'+
      '<td>'+fmtDate(o.delivery)+'</td>'+
      '<td>'+esc(o.status||'')+'</td>'+
    '</tr>';
  }).join('');

  var clientRows=histData.client.map(function(o){
    return '<tr>'+
      '<td>'+esc(o.in_num||'—')+'</td>'+
      '<td>'+esc(o.date||'')+'</td>'+
      '<td>'+esc(o.store_name||'')+'</td>'+
      '<td>'+esc(o.customer_name||'')+'</td>'+
      '<td>'+esc(o.phone||'')+'</td>'+
      '<td>'+(o.sap?esc(o.sap)+' — ':'')+esc(o.product||'')+'</td>'+
      '<td>'+fmtDate(o.delivery)+'</td>'+
      '<td>'+esc(o.status||'')+'</td>'+
    '</tr>';
  }).join('');

  var win=window.open('','_blank','width=1000,height=700');
  win.document.write('<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">'+
    '<title>История — '+fmtDate(from)+' до '+fmtDate(to)+'</title>'+
    '<style>'+
    '@page{size:A4 landscape;margin:10mm;}'+
    '*{box-sizing:border-box;margin:0;padding:0;}'+
    'body{font-family:Arial,sans-serif;font-size:9pt;color:#111;}'+
    'h1{font-size:14pt;margin-bottom:1mm;}'+
    'h2{font-size:11pt;margin:5mm 0 2mm;color:#2f2f2f;border-bottom:1px solid #ccc;padding-bottom:1mm;}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:5mm;font-size:8.5pt;}'+
    'th{background:#2f2f2f;color:#fff;padding:3px 6px;text-align:left;font-size:8pt;}'+
    'td{padding:2px 6px;border-bottom:1px solid #e5e7eb;}'+
    'tr:nth-child(even) td{background:#f8fafc;}'+
    '.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:3mm 0 5mm;}'+
    '.metric{border:1px solid #ccc;border-radius:4px;padding:3mm;text-align:center;}'+
    '.metric-val{font-size:16pt;font-weight:700;font-family:monospace;}'+
    '.metric-lbl{font-size:7.5pt;color:#666;}'+
    '@media print{button{display:none;}}'+
    '</style></head><body>'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm;">'+
      '<div>'+
        '<h1>ТЕМАКС — Исторически отчет</h1>'+
        '<div style="font-size:10pt;color:#444;">Период: '+fmtDate(from)+' — '+fmtDate(to)+(store?' &nbsp;|&nbsp; Магазин: '+esc(store):'&nbsp;|&nbsp; Всички магазини')+'</div>'+
        '<div style="font-size:8pt;color:#888;margin-top:1mm;">Изготвен: '+new Date().toLocaleString('bg-BG')+' от '+esc(currentUser.display_name||currentUser.email)+'</div>'+
      '</div>'+
      '<div style="text-align:right;font-size:9pt;color:#666;">'+
        'TeMAX Вътрешна платформа'+
      '</div>'+
    '</div>'+
    '<div class="summary">'+
      '<div class="metric"><div class="metric-lbl">Транспортни заявки</div><div class="metric-val" style="color:#2563eb;">'+totalT+'</div></div>'+
      '<div class="metric"><div class="metric-lbl">Клиентски заявки</div><div class="metric-val" style="color:#16a34a;">'+totalC+'</div><div class="metric-lbl">'+tDone+' изпълнени</div></div>'+
      '<div class="metric"><div class="metric-lbl">ПОС отчети</div><div class="metric-val" style="color:#d97706;">'+totalK+'</div></div>'+
      '<div class="metric" style="border-color:'+razC+'"><div class="metric-lbl">Обща касова разлика</div><div class="metric-val" style="color:'+razC+';">'+(tRaz<0?'–':'')+Math.abs(tRaz).toFixed(2)+'</div><div class="metric-lbl">EUR</div></div>'+
    '</div>'+
    (totalK?
      '<h2>💰 Касови отчети ('+totalK+')</h2>'+
      '<table><thead><tr><th>Дата</th><th>Магазин</th><th>ПОС</th><th>Касиер</th><th style="text-align:right;">В брой</th><th style="text-align:right;">Инкасо</th><th style="text-align:right;">Налични</th><th style="text-align:right;">Разлика</th><th>Статус</th></tr></thead>'+
      '<tbody>'+kasaRows+'</tbody></table>':'')+
    (totalT?
      '<h2>🚚 Транспортни заявки ('+totalT+')</h2>'+
      '<table><thead><tr><th>Дата</th><th>Магазин</th><th>Клиент</th><th>Телефон</th><th>Продукт</th><th>Адрес</th><th>Доставка</th><th>Статус</th></tr></thead>'+
      '<tbody>'+transportRows+'</tbody></table>':'')+
    (totalC?
      '<h2>📋 Клиентски заявки ('+totalC+')</h2>'+
      '<table><thead><tr><th>№</th><th>Дата</th><th>Магазин</th><th>Клиент</th><th>Телефон</th><th>Продукт</th><th>Доставка</th><th>Статус</th></tr></thead>'+
      '<tbody>'+clientRows+'</tbody></table>':'')+
    '<div style="text-align:center;margin-top:5mm;">'+
      '<button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;padding:7px 20px;border-radius:5px;font-size:10pt;cursor:pointer;">🖨 Принтирай / Запази PDF</button>'+
    '</div>'+
  '</body></html>');
  win.document.close();
  setTimeout(function(){win.focus();},300);
}

/* ═══════════════════════════════════════════════════════════════
   EXCEL ЕКСПОРТ НА КАСОВИ ОТЧЕТИ
   Използва SheetJS (CDN) — зарежда се при първо извикване
══════════════════════════════════════════════════════════════ */

function exportKasaToExcel(){
  var from = histFilter.from;
  var to   = histFilter.to;
  var store = histFilter.store;

  if(!from||!to){toast('Първо избери период и натисни Търси','#dc2626');return;}

  toast('⏳ Подготвя се Excel файлът...');

  /* Зареждаме SheetJS ако не е зареден */
  function doExport(){
    var XLSX = window.XLSX;
    if(!XLSX){toast('Грешка при зареждане на SheetJS','#dc2626');return;}

    var wb = XLSX.utils.book_new();

    /* ── Лист 1: ПОС Отчети ── */
    var posRows = [['Дата','Магазин','ПОС №','Каса №','Касиер',
      'Общ оборот (EUR)','В брой (EUR)','Карта (EUR)','Ваучери (EUR)',
      'Сторна (EUR)','Нето в брой (EUR)',
      'Инкасо 500','Инкасо 200','Инкасо 100','Инкасо 50',
      'Инкасо 20','Инкасо 10','Инкасо 5','Общо инкасо (EUR)',
      'Налични (EUR)','Разлика (EUR)','Статус','Върнат от','Причина за връщане']];

    histData.kasa.forEach(function(r){
      /* inkaso_500, inkaso_200, inkaso_100, inkaso_50, inkaso_20, inkaso_10, inkaso_5 */
      var inkaso = [500,200,100,50,20,10,5].map(function(v){
        return parseInt(r['inkaso_'+v])||0;
      });
      var inkasoTotal = inkaso.reduce(function(s,qty,i){
        return s + qty * [500,200,100,50,20,10,5][i];
      }, 0);
      var statusStr = r.status==='confirmed' ? 'Потвърден' :
                      r.status==='returned'  ? 'Върнат за корекция' : 'Чернова';
      posRows.push([
        r.date||'',
        r.store_name||'',
        r.pos_number||'',
        r.kasa_number||'',
        r.cashier_name||'',
        parseFloat(r.total_turnover)||0,
        parseFloat(r.cash_turnover)||0,
        parseFloat(r.card_turnover)||0,
        parseFloat(r.voucher_turnover)||0,
        parseFloat(r.storna_total)||0,
        Math.round(((parseFloat(r.cash_turnover)||0)-(parseFloat(r.storna_total)||0))*100)/100,
        inkaso[0], inkaso[1], inkaso[2], inkaso[3], inkaso[4], inkaso[5], inkaso[6],
        Math.round(inkasoTotal*100)/100,
        parseFloat(r.counted_cash)||0,
        parseFloat(r.razlika)||0,
        statusStr,
        r.returned_by||'',
        r.return_reason||''
      ]);
    });

    var wsPos = XLSX.utils.aoa_to_sheet(posRows);
    /* Ширини на колоните */
    wsPos['!cols'] = [
      {wch:12},{wch:16},{wch:7},{wch:7},{wch:18},
      {wch:14},{wch:14},{wch:14},{wch:12},
      {wch:12},{wch:14},
      {wch:11},{wch:11},{wch:11},{wch:11},{wch:11},{wch:11},{wch:11},{wch:14},
      {wch:14},{wch:14},{wch:16},{wch:16},{wch:24}
    ];
    XLSX.utils.book_append_sheet(wb, wsPos, 'ПОС Отчети');

    /* ── Лист 2: Равнение (Zoborot) ── */
    var sFilter2 = store
      ? '&store_name=eq.'+encodeURIComponent(store)
      : storeQ();
    var qZ = 'order=date.desc&date=gte.'+from+'&date=lte.'+to+sFilter2;

    sbGet('kasa_zoborot', qZ).then(function(zobData){
      var zRows = [['Дата','Магазин',
        'В брой BGN (EUR)','В брой EUR (EUR)','Карта EUR','Банков път EUR','Ваучери EUR',
        'POS оборот без банков (EUR)',
        'ФУ1 Общ','ФУ1 Сторно','ФУ1 Нето',
        'ФУ2 Общ','ФУ2 Сторно','ФУ2 Нето',
        'ФУ3 Общ','ФУ3 Сторно','ФУ3 Нето',
        'Общо ФУ Нето (EUR)','Разлика (EUR)','Статус']];

      if(Array.isArray(zobData)){
        zobData.forEach(function(z){
          var statusStr = z.status==='confirmed' ? 'Потвърдено' : 'Чернова';
          zRows.push([
            z.date||'',
            z.store_name||'',
            parseFloat(z.cash_bgn)||0,
            parseFloat(z.cash_eur)||0,
            parseFloat(z.card_eur)||0,
            parseFloat(z.bank_eur)||0,
            parseFloat(z.voucheri)||0,
            parseFloat(z.pos_no_bank)||0,
            parseFloat(z.fu1_gross)||0, parseFloat(z.fu1_discount)||0, parseFloat(z.fu1_net)||0,
            parseFloat(z.fu2_gross)||0, parseFloat(z.fu2_discount)||0, parseFloat(z.fu2_net)||0,
            parseFloat(z.fu3_gross)||0, parseFloat(z.fu3_discount)||0, parseFloat(z.fu3_net)||0,
            parseFloat(z.fu_total_net)||0,
            parseFloat(z.razlika)||0,
            statusStr
          ]);
        });
      }

      var wsZob = XLSX.utils.aoa_to_sheet(zRows);
      wsZob['!cols'] = [
        {wch:12},{wch:16},
        {wch:14},{wch:14},{wch:12},{wch:14},{wch:12},{wch:18},
        {wch:10},{wch:12},{wch:10},
        {wch:10},{wch:12},{wch:10},
        {wch:10},{wch:12},{wch:10},
        {wch:16},{wch:14},{wch:12}
      ];
      XLSX.utils.book_append_sheet(wb, wsZob, 'Равнение (Zoborot)');

      /* ── Лист 3: Главна каса ── */
      sbGet('kasa_glavna', 'order=date.desc&date=gte.'+from+'&date=lte.'+to+sFilter2).then(function(glData){
        var glRows = [['Дата','Магазин',
          'SAP Баланс (EUR)','Служебно (EUR)',
          '500лв','200лв','100лв','50лв','20лв','10лв','5лв','2лв','1лв',
          '0.50ст','0.20ст','0.10ст','0.05ст','0.02ст','0.01ст',
          'Общо налични (EUR)','Разлика (EUR)','Статус']];

        if(Array.isArray(glData)){
          glData.forEach(function(g){
            var statusStr = g.status==='confirmed' ? 'Потвърдена' : 'Чернова';
            glRows.push([
              g.date||'',
              g.store_name||'',
              parseFloat(g.sap_balance)||0,
              parseFloat(g.slujebno)||0,
              parseInt(g.bills_500)||0, parseInt(g.bills_200)||0,
              parseInt(g.bills_100)||0, parseInt(g.bills_50)||0,
              parseInt(g.bills_20)||0,  parseInt(g.bills_10)||0,
              parseInt(g.bills_5)||0,   parseInt(g.bills_2)||0,
              parseInt(g.bills_1)||0,
              parseInt(g.coins_50)||0,  parseInt(g.coins_20)||0,
              parseInt(g.coins_10)||0,  parseInt(g.coins_5)||0,
              parseInt(g.coins_2)||0,   parseInt(g.coins_1)||0,
              parseFloat(g.counted_cash)||0,
              parseFloat(g.razlika)||0,
              statusStr
            ]);
          });
        }

        var wsGl = XLSX.utils.aoa_to_sheet(glRows);
        wsGl['!cols'] = [{wch:12},{wch:16},{wch:14},{wch:14},
          {wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},
          {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
          {wch:16},{wch:14},{wch:12}];
        XLSX.utils.book_append_sheet(wb, wsGl, 'Главна каса');

        /* ── Лист 4: Обобщение по магазин ── */
        var summary = {};
        histData.kasa.forEach(function(r){
          var s = r.store_name||'Неизвестен';
          if(!summary[s]) summary[s] = {store:s, posCount:0, turnover:0, cash:0, card:0, inkaso:0, counted:0, razlika:0, confirmed:0, returned:0, draft:0};
          summary[s].posCount++;
          summary[s].turnover += parseFloat(r.total_turnover)||0;
          summary[s].cash     += parseFloat(r.cash_turnover)||0;
          summary[s].card     += parseFloat(r.card_turnover)||0;
          summary[s].inkaso   += calcInkaso ? (calcInkaso(r)||0) : 0;
          summary[s].counted  += parseFloat(r.counted_cash)||0;
          summary[s].razlika  += parseFloat(r.razlika)||0;
          if(r.status==='confirmed') summary[s].confirmed++;
          else if(r.status==='returned') summary[s].returned++;
          else summary[s].draft++;
        });

        var sumRows = [['Магазин','ПОС Отчети','Общ оборот (EUR)','В брой (EUR)',
          'Карта (EUR)','Инкасо (EUR)','Налични (EUR)','Разлика (EUR)',
          'Потвърдени','Върнати','Чернови']];
        Object.values(summary).sort(function(a,b){return a.store.localeCompare(b.store,'bg');}).forEach(function(s){
          sumRows.push([
            s.store,
            s.posCount,
            Math.round(s.turnover*100)/100,
            Math.round(s.cash*100)/100,
            Math.round(s.card*100)/100,
            Math.round(s.inkaso*100)/100,
            Math.round(s.counted*100)/100,
            Math.round(s.razlika*100)/100,
            s.confirmed, s.returned, s.draft
          ]);
        });
        /* Общо ред */
        var totTurn=Object.values(summary).reduce(function(s,r){return s+r.turnover;},0);
        var totRaz=Object.values(summary).reduce(function(s,r){return s+r.razlika;},0);
        sumRows.push(['ОБЩО','','',Math.round(totTurn*100)/100,'','','',Math.round(totRaz*100)/100,'','','']);

        var wsSum = XLSX.utils.aoa_to_sheet(sumRows);
        wsSum['!cols'] = [{wch:18},{wch:12},{wch:16},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:12},{wch:10},{wch:10}];
        XLSX.utils.book_append_sheet(wb, wsSum, 'Обобщение');

        /* ── Лист 5: Документи (линкове) ── */
        sbGet('kasa_documents','order=date.desc,store_name.asc,created_at.desc&date=gte.'+from+'&date=lte.'+to+sFilter2).then(function(docsData){
          var docRows = [['Дата','Магазин','Тип отчет','Тип документ','Файл','Качен от','Дата качване','Линк за преглед']];
          var docTypes = {pos:'ПОС Отчет', glavna:'Главна каса', zoborot:'Равнение', other:'Друго'};
          if(Array.isArray(docsData)){
            docsData.forEach(function(d){
              var signedUrl = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/sign/kasa-docs/' + d.file_url;
              docRows.push([
                d.date||'',
                d.store_name||'',
                docTypes[d.report_type]||d.report_type||'',
                docTypes[d.doc_type]||d.doc_type||'',
                d.file_name||'',
                d.uploaded_by||'',
                d.created_at ? d.created_at.slice(0,16).replace('T',' ') : '',
                '⚠️ Преглед само в портала'
              ]);
            });
          }
          if(docRows.length > 1){
            var wsDoc = XLSX.utils.aoa_to_sheet(docRows);
            wsDoc['!cols'] = [{wch:12},{wch:16},{wch:14},{wch:14},{wch:28},{wch:18},{wch:18},{wch:28}];
            XLSX.utils.book_append_sheet(wb, wsDoc, 'Документи');
          }

          /* Генерираме файла */
          var fname = 'ТеМАХ_Каса_' + (store||'Всички') + '_' + from + '_' + to + '.xlsx';
          XLSX.writeFile(wb, fname);
          var docCount = docRows.length - 1;
          toast('✅ Excel изтеглен!' + (docCount?' ('+docCount+' документа в лист Документи)':''));
        }).catch(function(){
          /* Ако документите не се заредят — пак генерираме Excel без тях */
          var fname = 'ТеМАХ_Каса_' + (store||'Всички') + '_' + from + '_' + to + '.xlsx';
          XLSX.writeFile(wb, fname);
          toast('✅ Excel изтеглен!');
        });
      }).catch(function(){ toast('Грешка при зареждане на Главна каса','#dc2626'); });
    }).catch(function(){ toast('Грешка при зареждане на Равнение','#dc2626'); });
  }

  /* Зареждаме SheetJS ако не е наличен */
  if(window.XLSX){
    doExport();
  } else {
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = doExport;
    script.onerror = function(){ toast('Грешка при зареждане на SheetJS','#dc2626'); };
    document.head.appendChild(script);
  }
}


/* ── ПРЕГЛЕД НА ДОКУМЕНТ ── */
function previewKasaDoc(path){
  if(!path){toast('Липсва path','#dc2626');return;}
  var SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
  /* Encode по сегменти */
  var encPath = path.split('/').map(function(s){return encodeURIComponent(s);}).join('/');
  toast('⏳ Зареждане...');
  fetch(SB+'/storage/v1/object/sign/kasa-docs/'+encPath,{
    method:'POST',
    headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn:3600})
  }).then(function(r){return r.json();})
  .then(function(d){
    if(d.signedURL){
      /* signedURL = "/object/sign/..." — добавяме /storage/v1 */
      var fullUrl = SB + '/storage/v1' + d.signedURL;
      window.open(fullUrl,'_blank');
    } else {
      toast('Грешка: '+(d.error||JSON.stringify(d)),'#dc2626');
    }
  }).catch(function(e){toast('Грешка: '+e.message,'#dc2626');});
}