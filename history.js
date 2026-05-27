/* history.js — История & Търсене
   Видим за: accounting, admin, logistics
   Редактирай САМО тук при промени по модула. */

var histData   = { transport:[], client:[], kasa:[] };
var histFilter = { from:'', to:'', store:'', type:'all' };
var histStores = [];

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadHistory(){
  renderHistoryShell();
  loadHistoryStores();
}

function loadHistoryStores(){
  sbGet('stores','select=name&order=name').then(function(data){
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

function runHistorySearch(){
  var from=document.getElementById('h-from').value;
  var to  =document.getElementById('h-to').value;
  var store=document.getElementById('h-store').value;
  var type =document.getElementById('h-type').value;
  histFilter={from:from,to:to,store:store,type:type};
  if(!from||!to){toast('Избери период от — до','#dc2626');return;}

  document.getElementById('h-results').innerHTML=
    '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div>';

  var promises=[];

  if(type==='all'||type==='transport'){
    var q='order=created_at.desc';
    q+='&date=gte.'+from+'&date=lte.'+to;
    if(store) q+='&store_name=eq.'+encodeURIComponent(store);
    promises.push(sbGet('transport_orders',q).then(function(d){histData.transport=Array.isArray(d)?d:[];}));
  } else { histData.transport=[]; }

  if(type==='all'||type==='client'){
    var q2='order=created_at.desc';
    q2+='&date=gte.'+from+'&date=lte.'+to;
    if(store) q2+='&store_name=eq.'+encodeURIComponent(store);
    promises.push(sbGet('client_orders',q2).then(function(d){histData.client=Array.isArray(d)?d:[];}));
  } else { histData.client=[]; }

  if(type==='all'||type==='kasa'){
    var q3='order=date.desc';
    q3+='&date=gte.'+from+'&date=lte.'+to;
    if(store) q3+='&store_name=eq.'+encodeURIComponent(store);
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

    '<div class="card" style="margin-bottom:16px;">'+
      '<div class="card-title">🔍 Филтри</div>'+
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
    var razStr=(totalRaz<0?'–':'')+Math.abs(totalRaz).toFixed(2)+' лв. разлика';
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
        '<div style="font-size:13px;font-weight:700;color:'+razCol+';">Обща разлика: '+(allRaz<0?'–':'')+Math.abs(allRaz).toFixed(2)+' лв.</div>'+
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
          '<td style="font-family:monospace;font-weight:700;color:'+razC+';">'+(raz<0?'–':'')+Math.abs(raz).toFixed(2)+' лв.</td>'+
          '<td>'+(r.status==='confirmed'?'✅':'✏️')+'</td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div></div>';
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
  return (n<0?'–':'')+Math.abs(n).toFixed(2)+' лв.';
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
      '<td style="text-align:right;font-family:monospace;font-weight:700;'+rc+'">'+(raz<0?'–':'')+Math.abs(raz).toFixed(2)+' лв.</td>'+
      '<td style="text-align:center;">'+(r.status==='confirmed'?'✅':'✏️')+'</td>'+
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
      '<div class="metric" style="border-color:'+razC+'"><div class="metric-lbl">Обща касова разлика</div><div class="metric-val" style="color:'+razC+';">'+(tRaz<0?'–':'')+Math.abs(tRaz).toFixed(2)+'</div><div class="metric-lbl">лв.</div></div>'+
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
