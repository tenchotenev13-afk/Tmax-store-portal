/* transport.js — Транспортни заявки + бланка за шофьора */

function loadTransport(){
  var q='order=created_at.desc';
  if(!isGlobal())q+='&store_name=eq.'+encodeURIComponent(currentUser.store_name);
  sbGet('transport_orders',q).then(function(data){
    transportOrders=Array.isArray(data)?data:[];
    transportOrders.forEach(function(o){o._status=calcStatus(o.delivery,o.status);});
    /* Зареди адресите на магазините за бланките */
    sbGet('stores','select=name,addr,phone&order=name').then(function(sd){
      if(Array.isArray(sd))window._storeData=sd;
    }).catch(function(){});
    renderTransport();renderMetrics();updateBadges();
  }).catch(function(e){console.warn('transport:',e);});
}

function getStoreInfo(storeName){
  var list=window._storeData||[];
  return list.find(function(s){return s.name===storeName;})||null;
}

function renderTransport(){
  var list=transportOrders.filter(function(o){
    return transportFilter==='all'||o._status===transportFilter||o.status===transportFilter;
  });
  var body=document.getElementById('tr-body');if(!body)return;
  if(!list.length){body.innerHTML='<tr><td colspan="11" style="text-align:center;padding:30px;color:#94a3b8;">Няма транспортни заявки.</td></tr>';return;}
  body.innerHTML=list.map(function(o){
    var bdrColor={overdue:'#dc2626',today:'#2563eb',tomorrow:'#d97706'}[o._status]||'transparent';
    var anim='';
    if(o._status==='overdue'||o._status==='today') anim='animation:rowPulse 1.8s infinite;';
    else if(o._status==='tomorrow') anim='animation:rowPulseSoft 2.5s infinite;';
    return '<tr style="border-left:3px solid '+bdrColor+';'+anim+'">'+
      '<td style="font-size:11px;">'+esc(o.date||'')+'<br><small style="color:#94a3b8;">'+esc(o.hour||'')+'</small></td>'+
      '<td><b>'+esc(o.customer_name||'')+'</b><br><small style="color:#94a3b8;">Бон: '+esc(o.bon||'—')+'</small></td>'+
      '<td style="font-family:monospace;font-size:11px;">'+esc(o.sap||'—')+'</td>'+
      '<td style="font-family:monospace;">'+esc(o.phone||'')+'</td>'+
      '<td style="font-size:12px;">'+esc(o.address||'')+'</td>'+
      '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+esc(o.color||'')+'</small></td>'+
      '<td style="text-align:center;">'+esc(String(o.qty||1))+'</td>'+
      '<td><b>'+fmtDate(o.delivery)+'</b></td>'+
      '<td>'+statusBadge(o._status)+'</td>'+
      '<td>'+esc(o.store_name||'')+'</td>'+
      '<td>'+actionBtns(o.id,'transport_orders',o._status)+'</td></tr>';
  }).join('');
}

function filterTransport(f,btn){
  transportFilter=f;
  document.querySelectorAll('#tr-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderTransport();
}

function openTransportModal(){
  ['o-bon','o-sap','o-name','o-phone','o-addr','o-product','o-color','o-agent','o-notes'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('o-date').value=today();
  document.getElementById('o-hour').value='10:00';
  document.getElementById('o-qty').value='1';
  document.getElementById('o-delivery').value='';
  document.getElementById('transport-modal').classList.add('open');
}

function submitTransport(){
  var name=v('o-name'),phone=v('o-phone'),product=v('o-product');
  if(!name||!phone||!product){toast('Попълни задължителните полета *','#dc2626');return;}
  var delivery=v('o-delivery')||null;
  sbPost('transport_orders',{
    store_name:currentUser.store_name,
    date:v('o-date'),hour:v('o-hour'),bon:v('o-bon'),sap:v('o-sap'),
    customer_name:name,phone:phone,address:v('o-addr'),
    product:product,color:v('o-color'),qty:parseInt(v('o-qty'))||1,
    agent:v('o-agent')||currentUser.display_name,
    notes:v('o-notes'),delivery:delivery,status:calcStatus(delivery,'new')
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    closeModal('transport-modal');toast('✓ Заявката е подадена!');loadTransport();
  });
}

/* БЛАНКА ЗА ШОФЬОРА — 1 лист А4, 2 идентични половини */
function loadTransportPrint(id){
  var o=transportOrders.find(function(x){return String(x.id)===String(id);});
  if(!o)return;renderTransportPrint(o);showModule('print');
}

function renderTransportPrint(o){
  var wrap=document.getElementById('mod-print');
  var si=getStoreInfo(o.store_name)||{};
  var storeName=o.store_name||currentUser.store_name||'';
  var storeAddr=si.addr||'';
  var storePhone=si.phone||'';
  var storeHeader=storeName+(storeAddr?' — '+storeAddr:'')+(storePhone?'   '+storePhone:'');
  var prod=(o.sap?o.sap+' - ':'')+esc(o.product||'')+(o.color?' ('+esc(o.color)+')':'');

  var half=function(){
    return '<div class="blank-half">'+
      '<div class="blank-row-header">'+
        '<div class="blank-store">'+
          '<div class="blank-store-name">'+esc(storeName)+'</div>'+
          (storeAddr?'<div class="blank-store-addr">'+esc(storeAddr)+(storePhone?' &nbsp;|&nbsp; '+esc(storePhone):'')+'</div>':'')+
        '</div>'+
        '<img src="data:image/png;base64,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" class="blank-logo" alt="TeMAX">'+
      '</div>'+
      '<table class="blank-table">'+
        '<tr><td class="bl"><b>Изискване за транспорт от дата:</b></td><td>'+esc(fmtDate(o.date||today()))+'</td></tr>'+
        '<tr><td class="bl"><b>Касов бон:</b></td><td>'+esc(o.bon||'—')+'</td></tr>'+
        '<tr><td class="bl"><b>Клиент:</b></td><td>'+esc(o.customer_name||'')+'</td></tr>'+
        '<tr><td class="bl"><b>Адрес:</b></td><td>'+esc(o.address||'')+'</td></tr>'+
        '<tr><td class="bl"><b>Телефон за връзка:</b></td><td>'+esc(o.phone||'')+'</td></tr>'+
        '<tr><td class="bl"><b>Продукти:</b></td><td>'+prod+' ('+esc(String(o.qty||1))+' бр.)</td></tr>'+
      '</table>'+
      '<div class="blank-delivery">'+
        '<span><b>Дата за доставка:</b> '+fmtDate(o.delivery)+'</span>'+
        '<span><b>Час за доставка:</b> '+esc(o.hour||'—')+'</span>'+
      '</div>'+
      '<div class="blank-sign">'+
        '<div class="blank-dots">.................................................................................</div>'+
        '<div class="blank-recv"><b>Получил:</b> ...................................................................</div>'+
        '<div class="blank-ok"><b>Получих стоката без забележка!</b></div>'+
      '</div>'+
    '</div>';
  };

  wrap.innerHTML=
    '<style>'+
    '@media print{'+
      '@page{size:A4 portrait;margin:8mm;}'+
      '.no-print{display:none!important;}'+
      '.print-a4{box-shadow:none!important;border:none!important;}'+
    '}'+
    '.print-a4{background:#fff;width:190mm;margin:0 auto;font-family:Arial,sans-serif;font-size:11pt;}'+
    '.blank-half{padding:6mm 0;min-height:120mm;}'+
    '.blank-half + .blank-cut{border-top:2px dashed #aaa;text-align:center;font-size:8pt;color:#aaa;padding:1mm 0;letter-spacing:.15em;}'+
    '.blank-row-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm;}'+
    '.blank-store-name{font-size:13pt;font-weight:700;}'+
    '.blank-store-addr{font-size:9pt;color:#444;margin-top:1mm;}'+
    '.blank-logo{height:28pt;width:auto;}'+
    '.blank-table{width:100%;border-collapse:collapse;margin-bottom:3mm;}'+
    '.blank-table td{padding:1mm 0;font-size:10.5pt;vertical-align:top;}'+
    '.blank-table td.bl{width:52mm;}'+
    '.blank-delivery{display:flex;gap:12mm;font-size:10.5pt;margin-bottom:4mm;}'+
    '.blank-sign{border-top:1px dotted #888;padding-top:3mm;}'+
    '.blank-dots{font-size:10pt;margin-bottom:2mm;letter-spacing:1px;}'+
    '.blank-recv{font-size:10.5pt;margin-bottom:3mm;}'+
    '.blank-ok{font-size:11pt;font-weight:700;}'+
    '</style>'+
    '<div style="max-width:680px;margin:0 auto;padding:16px 16px 40px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Бланка за шофьора</div>'+
        '<div style="display:flex;gap:8px;">'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай</button>'+
          '<button onclick="showModule(\'transport\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px;padding:9px 13px;margin-bottom:12px;" class="no-print">'+
        '📄 1 лист А4, разделен на 2 половини. Откъсвате по пунктираната линия — едно за шофьора, едно за магазина.</div>'+
      '<div class="print-a4">'+
        half()+
        '<div class="blank-cut">— — — — — — — — — — ОТКЪСВАТЕ ТУК — — — — — — — — — —</div>'+
        half()+
      '</div>'+
    '</div>';
}
