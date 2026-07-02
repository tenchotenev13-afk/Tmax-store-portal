/* history.js — История & Търсене
   Видим за: accounting, admin, logistics
   Редактирай САМО тук при промени по модула. */

var histData   = { transport:[], client:[], kasa:[] };
var histFilter = { from:'', to:'', store:'', type:'all' };
var histStores = [];
var _histPoll  = null;

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
  if(!from||!to){toast('Избери период от — до','#dc2626');return;}

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
  /* Default period: от началото на месеца до вчера */
  var now=new Date();
  var firstDay=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
  var yest=new Date(); yest.setDate(yest.getDate()-1);
  var lastDay=yest.toISOString().slice(0,10);

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
    '<button onclick="printHistoryReport()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:500;cursor:pointer;">🖨 Разпечатай отчета</button>'+
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
    html+='<div class="card" style="margin-top:14px;border-top:3px solid #0f172a;">'+
      '<div class="card-title">💵 Купюрен опис (ПОС + Главна каса)</div>'+
      '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">Разбивка по купюри — брой бройки и обща сума по дата и магазин</div>'+
      '<div id="h-denom-overview">⏳ Зареждане...</div>'+
    '</div>';
  }

  wrap.innerHTML=html;

  if(histData.kasa.length){
    var sF3=histFilter.store?'&store_name=eq.'+encodeURIComponent(histFilter.store):storeQ();
    sbGet('kasa_glavna','order=date.desc&date=gte.'+histFilter.from+'&date=lte.'+histFilter.to+sF3).then(function(glD){
      loadHistoryDenomOverview(glD);
    }).catch(function(){});
  }
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

/* ── Excel Export ── */
function exportKasaToExcel(){
  var from=histFilter.from, to=histFilter.to, store=histFilter.store;
  if(!from||!to){toast('Първо търси по период','#dc2626');return;}
  if(!window.XLSX){
    var s=document.createElement('script');
    s.src='https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=function(){exportKasaToExcel();};
    document.head.appendChild(s);return;
  }
  toast('⏳ Подготвя се Excel файлът...');
  var wb=XLSX.utils.book_new();
  var sFilter2=store?'&store_name=eq.'+encodeURIComponent(store):storeQ();

  /* Лист 1: ПОС Отчети */
  var posRows=[['Дата','Магазин','ПОС №','Касиер','Оборот (EUR)','В брой (EUR)',
    'Карта (EUR)','Налични (EUR)','Разлика (EUR)','Статус']];
  histData.kasa.forEach(function(r){
    var raz=parseFloat(r.razlika)||0;
    posRows.push([r.date||'',r.store_name||'',r.pos_number||'',r.cashier_name||'',
      parseFloat(r.total_turnover)||0, parseFloat(r.cash_turnover)||0,
      parseFloat(r.card_turnover)||0, parseFloat(r.counted_cash)||0,
      raz, r.status==='confirmed'?'Потвърден':r.status==='returned'?'Върнат':'Чернова']);
  });
  var wsPos=XLSX.utils.aoa_to_sheet(posRows);
  wsPos['!cols']=[{wch:12},{wch:16},{wch:8},{wch:18},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:12}];
  XLSX.utils.book_append_sheet(wb,wsPos,'ПОС Отчети');

  /* Лист 2: Равнение (Zoborot) */
  sbGet('kasa_zoborot','order=date.desc&date=gte.'+from+'&date=lte.'+to+sFilter2).then(function(zobData){
    var zobRows=[['Дата','Магазин','Брой EUR','Карта EUR','Bank EUR','Ваучери EUR',
      'ФУ1 Оборот','ФУ2 Оборот','ФУ3 Оборот','ФУ Net Total','Разлика','Статус']];
    if(Array.isArray(zobData)){
      zobData.forEach(function(z){
        zobRows.push([z.date||'',z.store_name||'',
          parseFloat(z.cash_bgn)||0,parseFloat(z.card_eur)||0,
          parseFloat(z.bank_eur)||0,parseFloat(z.voucheri)||0,
          parseFloat(z.fu1_gross)||0,parseFloat(z.fu2_gross)||0,parseFloat(z.fu3_gross)||0,
          parseFloat(z.fu_total_net)||0,parseFloat(z.razlika)||0,
          z.status==='confirmed'?'Потвърдена':'Чернова']);
      });
    }
    var wsZob=XLSX.utils.aoa_to_sheet(zobRows);
    XLSX.utils.book_append_sheet(wb,wsZob,'Равнение (Zoborot)');

    /* Лист 3: Главна каса */
    sbGet('kasa_glavna','order=date.desc&date=gte.'+from+'&date=lte.'+to+sFilter2).then(function(glData){
      var glRows=[['Дата','Магазин','SAP Баланс (EUR)','Служебно (EUR)',
        '500лв','200лв','100лв','50лв','20лв','10лв','5лв','2лв','1лв',
        '0.50ст','0.20ст','0.10ст','0.05ст','0.02ст','0.01ст',
        'Общо налични (EUR)','Разлика (EUR)','Статус']];
      if(Array.isArray(glData)){
        glData.forEach(function(g){
          glRows.push([g.date||'',g.store_name||'',
            parseFloat(g.sap_balance)||0,parseFloat(g.slujebno)||0,
            parseInt(g.bills_500)||0,parseInt(g.bills_200)||0,
            parseInt(g.bills_100)||0,parseInt(g.bills_50)||0,
            parseInt(g.bills_20)||0,parseInt(g.bills_10)||0,
            parseInt(g.bills_5)||0,parseInt(g.bills_2)||0,
            parseInt(g.bills_1)||0,
            parseInt(g.coins_50)||0,parseInt(g.coins_20)||0,
            parseInt(g.coins_10)||0,parseInt(g.coins_5)||0,
            parseInt(g.coins_2)||0,parseInt(g.coins_1)||0,
            parseFloat(g.counted_cash)||0,parseFloat(g.razlika)||0,
            g.status==='confirmed'?'Потвърдена':'Чернова']);
        });
      }
      var wsGl=XLSX.utils.aoa_to_sheet(glRows);
      wsGl['!cols']=[{wch:12},{wch:16},{wch:14},{wch:14},
        {wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},{wch:7},
        {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
        {wch:16},{wch:14},{wch:12}];
      XLSX.utils.book_append_sheet(wb,wsGl,'Главна каса');

      /* Лист 4: Обобщение по магазин */
      var summary={};
      histData.kasa.forEach(function(r){
        var s=r.store_name||'Неизвестен';
        if(!summary[s])summary[s]={store:s,posCount:0,turnover:0,cash:0,card:0,inkaso:0,counted:0,razlika:0,confirmed:0,returned:0,draft:0};
        summary[s].posCount++;
        summary[s].turnover+=parseFloat(r.total_turnover)||0;
        summary[s].cash+=parseFloat(r.cash_turnover)||0;
        summary[s].card+=parseFloat(r.card_turnover)||0;
        summary[s].inkaso+=typeof calcInkaso==='function'?(calcInkaso(r)||0):0;
        summary[s].counted+=parseFloat(r.counted_cash)||0;
        summary[s].razlika+=parseFloat(r.razlika)||0;
        if(r.status==='confirmed')summary[s].confirmed++;
        else if(r.status==='returned')summary[s].returned++;
        else summary[s].draft++;
      });
      var sumRows=[['Магазин','ПОС Отчети','Общ оборот (EUR)','В брой (EUR)',
        'Карта (EUR)','Инкасо (EUR)','Налични (EUR)','Разлика (EUR)',
        'Потвърдени','Върнати','Чернови']];
      Object.values(summary).sort(function(a,b){return a.store.localeCompare(b.store,'bg');}).forEach(function(s){
        sumRows.push([s.store,s.posCount,
          Math.round(s.turnover*100)/100,Math.round(s.cash*100)/100,
          Math.round(s.card*100)/100,Math.round(s.inkaso*100)/100,
          Math.round(s.counted*100)/100,Math.round(s.razlika*100)/100,
          s.confirmed,s.returned,s.draft]);
      });
      var totTurn=Object.values(summary).reduce(function(s,r){return s+r.turnover;},0);
      var totRaz=Object.values(summary).reduce(function(s,r){return s+r.razlika;},0);
      sumRows.push(['ОБЩО','','',Math.round(totTurn*100)/100,'','','',Math.round(totRaz*100)/100,'','','']);
      var wsSum=XLSX.utils.aoa_to_sheet(sumRows);
      wsSum['!cols']=[{wch:18},{wch:12},{wch:16},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:12},{wch:10},{wch:10}];
      XLSX.utils.book_append_sheet(wb,wsSum,'Обобщение');

      /* Лист 5: Купюрен опис (ПОС + Главна) */
      var BILLS2=[500,200,100,50,20,10,5,2,1];
      var COINS2=[0.5,0.2,0.1,0.05,0.02,0.01];
      var ALL_D2=BILLS2.concat(COINS2);
      var DKEY2={};
      BILLS2.forEach(function(v){DKEY2[v]='bills_'+v;});
      DKEY2[0.5]='coins_50';DKEY2[0.2]='coins_20';DKEY2[0.1]='coins_10';
      DKEY2[0.05]='coins_5';DKEY2[0.02]='coins_2';DKEY2[0.01]='coins_1';

      var denomByDS={};
      histData.kasa.forEach(function(r){
        var key=(r.date||'')+'|'+(r.store_name||'');
        if(!denomByDS[key])denomByDS[key]={date:r.date,store:r.store_name,pos:{},gl:{}};
        ALL_D2.forEach(function(v){
          var k=DKEY2[v];
          denomByDS[key].pos[k]=(denomByDS[key].pos[k]||0)+(parseInt(r[k])||0);
        });
      });
      if(Array.isArray(glData))glData.forEach(function(g){
        var key=(g.date||'')+'|'+(g.store_name||'');
        if(!denomByDS[key])denomByDS[key]={date:g.date,store:g.store_name,pos:{},gl:{}};
        ALL_D2.forEach(function(v){denomByDS[key].gl[DKEY2[v]]=parseInt(g[DKEY2[v]])||0;});
      });

      var dHdr=['Дата','Магазин'];
      ALL_D2.forEach(function(v){dHdr.push(v>=1?v+'лв-ПОС':v+'ст-ПОС');});
      ALL_D2.forEach(function(v){dHdr.push(v>=1?v+'лв-Сейф':v+'ст-Сейф');});
      ALL_D2.forEach(function(v){dHdr.push(v>=1?v+'лв-Общо':v+'ст-Общо');});
      dHdr.push('Сума EUR');
      var dRows=[dHdr];
      Object.values(denomByDS).sort(function(a,b){return (a.date+a.store).localeCompare(b.date+b.store,'bg');}).forEach(function(e){
        var row=[e.date||'',e.store||''],gt=0;
        ALL_D2.forEach(function(v){row.push(e.pos[DKEY2[v]]||0);});
        ALL_D2.forEach(function(v){row.push(e.gl[DKEY2[v]]||0);});
        ALL_D2.forEach(function(v){
          var t=(e.pos[DKEY2[v]]||0)+(e.gl[DKEY2[v]]||0);
          row.push(t);
          gt=Math.round((gt+t*v)*100)/100;
        });
        row.push(gt);
        dRows.push(row);
      });
      var wsDen=XLSX.utils.aoa_to_sheet(dRows);
      var dCols=[{wch:12},{wch:18}];
      for(var _i=0;_i<ALL_D2.length*3;_i++)dCols.push({wch:8});
      dCols.push({wch:14});
      wsDen['!cols']=dCols;
      XLSX.utils.book_append_sheet(wb,wsDen,'Купюрен опис');

      /* Лист 6: Документи */
      sbGet('kasa_documents','order=date.desc,store_name.asc,created_at.desc&date=gte.'+from+'&date=lte.'+to+sFilter2).then(function(docsData){
        var docRows=[['Дата','Магазин','Тип отчет','Тип документ','Файл','Качен от','Дата качване','Линк']];
        var docTypes={pos:'ПОС Отчет',glavna:'Главна каса',zoborot:'Равнение',other:'Друго'};
        if(Array.isArray(docsData)){
          docsData.forEach(function(d){
            docRows.push([d.date||'',d.store_name||'',
              docTypes[d.report_type]||d.report_type||'',
              docTypes[d.doc_type]||d.doc_type||'',
              d.file_name||'',d.uploaded_by||'',
              d.created_at?d.created_at.slice(0,16).replace('T',' '):'',
              'Преглед само в портала']);
          });
        }
        if(docRows.length>1){
          var wsDoc=XLSX.utils.aoa_to_sheet(docRows);
          wsDoc['!cols']=[{wch:12},{wch:16},{wch:14},{wch:14},{wch:28},{wch:18},{wch:18},{wch:24}];
          XLSX.utils.book_append_sheet(wb,wsDoc,'Документи');
        }
        var fname='ТеМАХ_Каса_'+(store||'Всички')+'_'+from+'_'+to+'.xlsx';
        XLSX.writeFile(wb,fname);
        var docCount=docRows.length-1;
        toast('✅ Excel изтеглен!'+(docCount?' ('+docCount+' документа)':''));
      }).catch(function(){
        var fname='ТеМАХ_Каса_'+(store||'Всички')+'_'+from+'_'+to+'.xlsx';
        XLSX.writeFile(wb,fname);
        toast('✅ Excel изтеглен!');
      });
    }).catch(function(){toast('Грешка при Главна каса','#dc2626');});
  }).catch(function(){toast('Грешка при Zoborot','#dc2626');});
}

/* ── Preview Kasa Doc ── */
function previewKasaDoc(path){
  if(!path){toast('Липсва path','#dc2626');return;}
  var SB='https://xiwkdiqqplgdcrkewgtv.supabase.co';
  var KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
  var encPath=path.split('/').map(function(s){return encodeURIComponent(s);}).join('/');
  toast('⏳ Зареждане...');
  fetch(SB+'/storage/v1/object/sign/kasa-docs/'+encPath,{
    method:'POST',
    headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn:3600})
  }).then(function(r){return r.json();})
  .then(function(d){
    if(d.signedURL){
      var fullUrl=SB+'/storage/v1'+d.signedURL;
      window.open(fullUrl,'_blank');
    }else{toast('Грешка: '+(d.error||JSON.stringify(d)),'#dc2626');}
  }).catch(function(e){toast('Грешка: '+e.message,'#dc2626');});
}

/* ── Visual дневен купюрен опис в История ── */
function loadHistoryDenomOverview(glData){
  var el=document.getElementById('h-denom-overview');
  if(!el)return;
  var BILLS3=[500,200,100,50,20,10,5,2,1];
  var COINS3=[0.5,0.2,0.1,0.05,0.02,0.01];
  var ALL_D3=BILLS3.concat(COINS3);
  var DKEY3={};
  BILLS3.forEach(function(v){DKEY3[v]='bills_'+v;});
  DKEY3[0.5]='coins_50';DKEY3[0.2]='coins_20';DKEY3[0.1]='coins_10';
  DKEY3[0.05]='coins_5';DKEY3[0.02]='coins_2';DKEY3[0.01]='coins_1';

  var byDS={};
  histData.kasa.forEach(function(r){
    var key=(r.date||'')+'|'+(r.store_name||'');
    if(!byDS[key])byDS[key]={date:r.date,store:r.store_name,pos:{},gl:{}};
    ALL_D3.forEach(function(v){var k=DKEY3[v];byDS[key].pos[k]=(byDS[key].pos[k]||0)+(parseInt(r[k])||0);});
  });
  if(Array.isArray(glData))glData.forEach(function(g){
    var key=(g.date||'')+'|'+(g.store_name||'');
    if(!byDS[key])byDS[key]={date:g.date,store:g.store_name,pos:{},gl:{}};
    ALL_D3.forEach(function(v){byDS[key].gl[DKEY3[v]]=parseInt(g[DKEY3[v]])||0;});
  });

  var entries=Object.values(byDS).sort(function(a,b){return (b.date+a.store).localeCompare(a.date+b.store,'bg');});
  if(!entries.length){el.innerHTML='<div style="color:#94a3b8;padding:10px;">Няма данни за купюрен опис.</div>';return;}

  var h='<div class="tbl-wrap"><table style="font-size:12px;"><thead><tr>'+
    '<th>Дата</th><th>Магазин</th>';
  ALL_D3.forEach(function(v){h+='<th style="text-align:center;">'+(v>=1?v+'лв':v+'ст')+'</th>';});
  h+='<th style="text-align:right;">Сума EUR</th></tr></thead><tbody>';
  entries.forEach(function(e){
    var gt=0;
    h+='<tr><td>'+fmtDate(e.date)+'</td><td>'+esc(e.store||'')+'</td>';
    ALL_D3.forEach(function(v){
      var k=DKEY3[v];
      var posQ=e.pos[k]||0,glQ=e.gl[k]||0,tot=posQ+glQ;
      gt=Math.round((gt+tot*v)*100)/100;
      h+='<td style="text-align:center;font-family:DM Mono,monospace;'+(tot===0?'color:#d1d5db;':'')+'">';
      if(tot===0){h+='—';}
      else{
        if(posQ>0)h+='<span style="color:#2563eb;font-size:10px;" title="ПОС">'+posQ+'</span>';
        if(posQ>0&&glQ>0)h+='+';
        if(glQ>0)h+='<span style="color:#92400e;font-size:10px;" title="Сейф">'+glQ+'</span>';
        h+='<br><small style="color:#475569;font-weight:600;">'+tot+'</small>';
      }
      h+='</td>';
    });
    h+='<td style="text-align:right;font-family:DM Mono,monospace;font-weight:700;">'+gt.toFixed(2)+' EUR</td></tr>';
  });
  h+='</tbody></table></div>';
  h+='<div style="font-size:11px;color:#94a3b8;margin-top:6px;">🔵 ПОС | 🟡 Сейф | Общо = всички купюри в магазина</div>';
  el.innerHTML=h;
}


/* Daily Overview */
function loadDailyOverview(){
  var el=document.getElementById('daily-overview');
  if(!el)return;

  /* Определяме магазините за показване */
  var stores=assignedStores();
  /* assignedStores() връща null за admin/accounting (вижда всичко)
     или масив от назначени магазини */
  if(!stores&&currentUser&&currentUser.store_name){
    /* Обикновен потребител - само неговия магазин */
    stores=[currentUser.store_name];
  }
  if(!stores||!stores.length)return;

  var days=[];
  for(var i=1;i<=7;i++){ var d=new Date(); d.setDate(d.getDate()-i); days.push(d.toISOString().slice(0,10)); }
  var from=days[days.length-1], to=days[0];

  /* Заявка за всички магазини */
  var storeQ2=stores.map(function(s){return 'store_name=eq.'+encodeURIComponent(s);}).join(',');
  var q='or=('+storeQ2+')&date=gte.'+from+'&date=lte.'+to+'&select=date,store_name,status';

  sbGet('kasa_reports',q).then(function(data){
    /* reported[store][date] = status */
    var reported={};
    stores.forEach(function(s){reported[s]={};});
    if(Array.isArray(data))data.forEach(function(r){
      if(!reported[r.store_name])reported[r.store_name]={};
      /* Ако има confirmed - запазваме confirmed, иначе draft */
      if(!reported[r.store_name][r.date]||r.status==='confirmed'){
        reported[r.store_name][r.date]=r.status;
      }
    });

    var dayNames=['Нед','Пон','Вт','Ср','Чет','Пет','Съб'];
    var html='<div class="card" style="margin-bottom:16px;">';
    html+='<div class="card-title">📅 Статус отчети — последните 7 дни</div>';

    /* Таблица: редове = магазини, колони = дни */
    var isMulti=stores.length>1;
    if(isMulti){
      /* Таблична визуализация за счетоводител */
      html+='<div class="tbl-wrap"><table style="font-size:12px;width:100%;">';
      html+='<thead><tr><th style="text-align:left;padding:5px 8px;">Магазин</th>';
      days.slice().reverse().forEach(function(dateStr){
        var d=new Date(dateStr+'T12:00:00');
        var dow=d.getDay();
        html+='<th style="text-align:center;padding:5px 6px;min-width:54px;">'+
          dayNames[dow]+'<br><span style="font-size:10px;color:#94a3b8;">'+
          dateStr.slice(8)+'.'+dateStr.slice(5,7)+'</span></th>';
      });
      html+='</tr></thead><tbody>';
      stores.slice().sort().forEach(function(store){
        html+='<tr><td style="padding:5px 8px;font-weight:600;">'+esc(store)+'</td>';
        days.slice().reverse().forEach(function(dateStr){
          var d=new Date(dateStr+'T12:00:00'); var dow=d.getDay();
          var isWeekend=dow===0||dow===6;
          var status=reported[store]&&reported[store][dateStr];
          var bg,color,icon;
          if(status==='confirmed'){bg='#f0fdf4';color='#16a34a';icon='✅';}
          else if(status==='draft'){bg='#fef9c3';color='#92400e';icon='📝';}
          else if(isWeekend){bg='#f8fafc';color='#94a3b8';icon='🏖';}
          else{bg='#fff1f2';color='#dc2626';icon='⚠️';}
          html+='<td style="text-align:center;padding:4px;background:'+bg+';">';
          html+='<span style="font-size:14px;">'+icon+'</span>';
          html+='</td>';
        });
        html+='</tr>';
      });
      html+='</tbody></table></div>';
    } else {
      /* Карти за единичен магазин */
      html+='<div style="font-size:12px;color:#64748b;margin-bottom:8px;">'+esc(stores[0])+'</div>';
      html+='<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      days.slice().reverse().forEach(function(dateStr){
        var d=new Date(dateStr+'T12:00:00'); var dow=d.getDay();
        var isWeekend=dow===0||dow===6;
        var status=reported[stores[0]]&&reported[stores[0]][dateStr];
        var bg,color,icon,label;
        if(status==='confirmed'){bg='#f0fdf4';color='#16a34a';icon='✅';label='Потвърден';}
        else if(status==='draft'){bg='#fef9c3';color='#92400e';icon='📝';label='Чернова';}
        else if(isWeekend){bg='#f8fafc';color='#94a3b8';icon='🏖';label='Уикенд';}
        else{bg='#fff1f2';color='#dc2626';icon='⚠️';label='Липсва';}
        html+='<div data-date="'+dateStr+'" onclick="jumpToKasaDate(this.dataset.date)" style="background:'+bg+';border:1px solid '+(status?color:'#e2e8f0')+';border-radius:8px;padding:8px 12px;text-align:center;min-width:72px;cursor:pointer;" title="'+label+'">';
        html+='<div style="font-size:10px;color:#94a3b8;">'+dayNames[dow]+'</div>';
        html+='<div style="font-size:11px;font-weight:600;">'+dateStr.slice(8)+'.'+dateStr.slice(5,7)+'</div>';
        html+='<div style="font-size:14px;">'+icon+'</div>';
        html+='<div style="font-size:9px;color:'+color+';font-weight:600;">'+label+'</div>';
        html+='</div>';
      });
      html+='</div>';
    }

    html+='<div style="font-size:11px;color:#94a3b8;margin-top:8px;">✅ Потвърден &nbsp; 📝 Чернова &nbsp; ⚠️ Липсва &nbsp; 🏖 Уикенд</div>';
    html+='</div>';
    el.innerHTML=html;
  }).catch(function(){el.innerHTML='';});
}

function jumpToKasaDate(dateStr){
  if(typeof kasaSetDate==='function')kasaSetDate(dateStr);
  showModule('kasa');
}
