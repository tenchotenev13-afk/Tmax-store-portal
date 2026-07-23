/* transport.js — Транспортни заявки + бланка за шофьора */

/* Адреси на магазините — вградени за бланките */
var STORE_INFO = {
  'Враца': {addr:'бул. \"Васил Кънчов\" - Източна промишлена зона',phone:'092 620 027'},
  'Габрово': {addr:'кв. Войново, Западна Промишлена зона',phone:'0 6680 0002'},
  'Гоце Делчев': {addr:'ул. \"Панаирски ливади\"',phone:'0 7512 9028'},
  'Добрич': {addr:'бул. \"25-ти Септември\" №43',phone:'0 5860 3564'},
  'Дупница': {addr:'Ритейл Парк, ул. \"Отовица\" №1',phone:'0 7015 6077'},
  'Карлово': {addr:'Ритейл Парк, ул. \"Ген. Заимов\" №32',phone:'033 138 225'},
  'Козлодуй': {addr:'Ритейл парк Зита, ул. \"Южна Индустриална Зона\" №2',phone:'0885 306 610'},
  'Кърджали': {addr:'бул. \"България\" №115',phone:'0 3612 2146'},
  'Монтана': {addr:'Местност \"Лъката\" - Южна промишлена зона',phone:'0 9630 0058'},
  'Петрич': {addr:'ул. \"Свобода\" №33',phone:'0 7455 0045'},
  'Пирдоп': {addr:'Ритейл Парк Средногорие',phone:'0 7142 6923'},
  'Раднево': {addr:'ул. \"Заводска\"',phone:'0 4178 2049'},
  'Севлиево': {addr:'ул. \"Велика и Георги Ченчеви\"',phone:'0 675 300 11'},
  'Силистра': {addr:'бул. \"Тутракан\" №27',phone:'0 8682 0198'},
  'Сливен': {addr:'кв. \"Дружба\" 4',phone:'0 4466 7312'},
  'Троян': {addr:'Ритейл Парк, ул. \"Минко Радковски\" №3',phone:'067 092 093'},
  'Търговище': {addr:'бул. \"Цар Освободител\" №44',phone:'0 882 86 46 83'},
  'Шумен': {addr:'бул. \"Ришки проход\" №191',phone:'0 54 830 399'},
};

function getStoreInfo(name){
  return STORE_INFO[name]||window._storeDB&&window._storeDB[name]||null;
}

var TR_BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
function trMonthLabel(ym){
  var p=ym.split('-'); var idx=parseInt(p[1],10)-1;
  return (TR_BG_MONTHS[idx]||ym)+' '+p[0];
}
function trBuildMonthOptions(){
  var sel=document.getElementById('tr-month'); if(!sel) return;
  var cur=sel.value;
  var months={};
  transportOrders.forEach(function(o){ if(o.date) months[o.date.slice(0,7)]=1; });
  var sorted=Object.keys(months).sort().reverse();
  sel.innerHTML='<option value="">Всички месеци</option>'+sorted.map(function(ym){
    return '<option value="'+ym+'"'+(ym===cur?' selected':'')+'>'+trMonthLabel(ym)+'</option>';
  }).join('');
  if (sorted.indexOf(cur)>=0) sel.value=cur;
}

function loadTransport(){
  var q='order=created_at.desc'+storeQ();
  sbGet('transport_orders',q).then(function(data){
    transportOrders=Array.isArray(data)?data:[];
    transportOrders.forEach(function(o){o._status=calcStatus(o.delivery,o.status);});
    trBuildMonthOptions();
    /* Зареди от stores таблица за евентуални допълнителни магазини */
    sbGet('stores','select=name,addr,phone').then(function(sd){
      if(Array.isArray(sd)){
        window._storeDB={};
        sd.forEach(function(s){if(s.name)window._storeDB[s.name]=s;});
      }
    }).catch(function(){});
    renderTransport();renderMetrics();updateBadges();
  }).catch(function(e){console.warn('transport:',e);});
}

function renderTransport(){
  var search=((document.getElementById('tr-search')||{}).value||'').trim().toLowerCase();
  var month=(document.getElementById('tr-month')||{}).value||'';
  var list=transportOrders.filter(function(o){
    return transportFilter==='all'||o._status===transportFilter||o.status===transportFilter;
  });
  if (month) list=list.filter(function(o){ return o.date && o.date.slice(0,7)===month; });
  if (search) {
    list=list.filter(function(o){
      if((o.customer_name||'').toLowerCase().indexOf(search)>=0)return true;
      if((o.phone||'').indexOf(search)>=0)return true;
      if((o.bon||'').toLowerCase().indexOf(search)>=0)return true;
      if((o.address||'').toLowerCase().indexOf(search)>=0)return true;
      /* Проверяваме ВСИЧКИ артикули на заявката (не само първия) — resolveItems()
         връща o.items ако има, иначе fallback към старите единични полета */
      var items=resolveItems(o);
      for(var i=0;i<items.length;i++){
        if((items[i].sap||'').toLowerCase().indexOf(search)>=0)return true;
        if((items[i].product||'').toLowerCase().indexOf(search)>=0)return true;
      }
      return false;
    });
  }
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
      '<td style="font-family:monospace;font-size:11px;"><div style="max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(o.sap||'')+'">'+esc(o.sap||'—')+'</div></td>'+
      '<td style="font-family:monospace;">'+esc(o.phone||'')+'</td>'+
      '<td style="font-size:12px;">'+esc(o.address||'')+'</td>'+
      '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+esc(o.color||'')+'</small></td>'+
      '<td style="text-align:center;">'+esc(String(o.qty||1))+(o.unit&&o.unit!=='бр.'?'<br><small style="color:#94a3b8;">'+esc(o.unit)+'</small>':'')+'</td>'+
      '<td><b>'+fmtDate(o.delivery)+'</b></td>'+
      '<td>'+statusBadge(o._status)+'</td>'+
      '<td>'+esc(o.store_name||'')+'</td>'+
      '<td>'+actionBtns(o.id,'transport_orders',o._status,o.store_name)+'</td></tr>';
  }).join('');
}

function filterTransport(f,btn){
  transportFilter=f;
  document.querySelectorAll('#tr-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderTransport();
}

/* Превръща "HH:MM" в минути от полунощ, за сравнение на близост на часове */
function hourToMinutes(h){
  if(!h) return null;
  var p=h.split(':');
  if(p.length<2) return null;
  var hh=parseInt(p[0],10), mm=parseInt(p[1],10);
  if(isNaN(hh)||isNaN(mm)) return null;
  return hh*60+mm;
}

/* Проверява дали вече има друга активна транспортна заявка от същия магазин,
   в рамките на +/-2ч на същия ден — предотвратява двойно ангажиране на шофьора
   в различни посоки по едно и също време. */
function checkTransportConflict(date, hour, onResolved){
  var newMin=hourToMinutes(hour);
  if(!date||newMin===null){ onResolved([]); return; }
  sbGet('transport_orders','store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+encodeURIComponent(date)).then(function(rows){
    var list=Array.isArray(rows)?rows:[];
    var conflicts=list.filter(function(o){
      if(['done','refused','postponed'].indexOf(o.status)>=0) return false;
      var m=hourToMinutes(o.hour);
      if(m===null) return false;
      return Math.abs(m-newMin)<=30; /* +/- 30 минути */
    });
    onResolved(conflicts);
  }).catch(function(){ onResolved([]); });
}

function openTransportModal(){
  ['o-bon','o-name','o-phone','o-addr','o-agent','o-notes'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('o-date').value=today();
  document.getElementById('o-hour').value='10:00';
  document.getElementById('o-delivery').value='';
  renderItemRows('o-items',[{}]);
  document.getElementById('transport-modal').classList.add('open');
}

function submitTransport(){
  var name=v('o-name'),phone=v('o-phone'),addr=v('o-addr');
  var items=collectItems('o-items');
  if(!name||!phone||!addr){toast('Попълни задължителните полета *','#dc2626');return;}
  if(!items.length){toast('Добави поне един артикул с продукт','#dc2626');return;}

  var date=v('o-date'), hour=v('o-hour');
  checkTransportConflict(date, hour, function(conflicts){
    if(conflicts.length){
      showTransportConflictModal(conflicts);
    } else {
      doSubmitTransport();
    }
  });
}

/* Показва блокиращо предупреждение при засечен конфликт - изисква изрично
   потвърждение от колегата, преди да позволи запис. */
function showTransportConflictModal(conflicts){
  var rows=conflicts.map(function(o){
    return '<div style="padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:6px;font-size:12.5px;">'+
      '<b>'+esc(o.hour||'')+'ч.</b> — '+esc(o.customer_name||'')+'<br>'+
      '<span style="color:#64748b;">'+esc(o.address||'')+'</span>'+
      '</div>';
  }).join('');
  var html='<div class="bov" id="transport-conflict-ov"><div class="bmod" style="width:480px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
    '<div style="font-size:15px;font-weight:600;color:#991b1b;">⚠️ Възможен конфликт в графика</div>'+
    '<button onclick="closeTransportConflictModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:13px;color:#374151;margin-bottom:10px;">Вече '+(conflicts.length===1?'има заявка':'има '+conflicts.length+' заявки')+' в рамките на 30 минути от избрания час, за същия магазин:</div>'+
    rows+
    '<div style="font-size:12px;color:#94a3b8;margin:10px 0 14px;">Провери дали шофьорът реално може да покрие двете направления навреме, преди да продължиш.</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
    '<button onclick="closeTransportConflictModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Отказ, ще проверя</button>'+
    '<button onclick="confirmTransportDespiteConflict()" style="border:none;background:#dc2626;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Продължи и запиши</button>'+
    '</div></div></div>';
  var existing=document.getElementById('transport-conflict-ov'); if(existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}
function closeTransportConflictModal(){
  var el=document.getElementById('transport-conflict-ov'); if(el) el.remove();
}
function confirmTransportDespiteConflict(){
  closeTransportConflictModal();
  doSubmitTransport();
}

function doSubmitTransport(){
  var name=v('o-name'),phone=v('o-phone'),addr=v('o-addr');
  var items=collectItems('o-items');
  var first=items[0];
  var delivery=v('o-delivery')||null;
  sbPost('transport_orders',{
    store_name:currentUser.store_name,
    date:v('o-date'),hour:v('o-hour'),bon:v('o-bon'),
    customer_name:name,phone:phone,address:addr,
    product:first.product,color:first.color,sap:first.sap,qty:first.qty,unit:first.unit,
    items:items,
    agent:v('o-agent')||currentUser.display_name,
    notes:v('o-notes'),delivery:delivery,status:'pending'
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    closeModal('transport-modal');toast('✓ Заявката е подадена!');loadTransport();
  });
}

/* БЛАНКА ЗА ШОФЬОРА — 1 лист А4, 2 половини */
function loadTransportPrint(id){
  var o=transportOrders.find(function(x){return String(x.id)===String(id);});
  if(!o)return;renderTransportPrint(o);showModule('print');
}

function renderTransportPrint(o){
  var wrap=document.getElementById('mod-print');
  var sn=o.store_name||currentUser.store_name||'';
  var si=getStoreInfo(sn)||{};

  var PRINT_CSS=
    '@media print{'+
      '@page{size:A4 portrait;margin:10mm;}'+
      '.no-print{display:none!important;}'+
      'body{margin:0;padding:0;}'+
    '}'+
    '.p-wrap{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111;width:190mm;max-width:190mm;margin:0 auto;}'+
    '.p-half{padding:5mm 0 4mm;}'+
    '.p-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3.5mm;}'+
    '.p-store-name{font-size:12pt;font-weight:700;margin-bottom:1mm;}'+
    '.p-store-addr{font-size:8.5pt;color:#444;}'+
    '.p-logo{height:24pt;width:auto;flex-shrink:0;margin-left:8mm;}'+
    '.p-table{width:100%;border-collapse:collapse;margin-bottom:3mm;}'+
    '.p-table td{padding:.6mm 0;font-size:9pt;vertical-align:top;line-height:1.35;}'+
    '.p-table td:first-child{width:44mm;font-weight:600;}'+
    '.p-deliv{display:flex;gap:10mm;font-size:9pt;margin-bottom:3.5mm;}'+
    '.p-sign{border-top:1px dotted #999;padding-top:2.5mm;}'+
    '.p-dots{font-size:8.5pt;letter-spacing:1px;margin-bottom:1.5mm;}'+
    '.p-recv{font-size:9pt;margin-bottom:2mm;}'+
    '.p-ok{font-size:9.5pt;font-weight:700;}'+
    '.p-cut{border-top:2px dashed #bbb;text-align:center;font-size:7.5pt;color:#aaa;padding:1mm 0;letter-spacing:.12em;}';

  var half=function(){
    return '<div class="p-half">'+
      '<div class="p-head">'+
        '<div>'+
          '<div class="p-store-name">'+esc(sn)+'</div>'+
          (si.addr?'<div class="p-store-addr">'+esc(si.addr)+(si.phone?' &nbsp;&nbsp; '+esc(si.phone):'')+'</div>':'')+
        '</div>'+
        '<img src="data:image/png;base64,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" class="p-logo" alt="TeMAX">'+
      '</div>'+
      '<table class="p-table">'+
        '<tr><td>Изискване за транспорт от дата:</td><td>'+esc(fmtDate(o.date||today()))+'</td></tr>'+
        '<tr><td>Касов бон:</td><td>'+esc(o.bon||'—')+'</td></tr>'+
        '<tr><td>Клиент:</td><td>'+esc(o.customer_name||'')+'</td></tr>'+
        '<tr><td>Адрес:</td><td>'+esc(o.address||'')+'</td></tr>'+
        '<tr><td>Телефон за връзка:</td><td>'+esc(o.phone||'')+'</td></tr>'+
        '<tr><td>Продукти:</td><td>'+itemsPrintLine(o)+'</td></tr>'+
        (o.notes?'<tr><td>Забележка:</td><td>'+esc(o.notes)+'</td></tr>':'')+
      '</table>'+
      '<div class="p-deliv">'+
        '<span><b>Дата за доставка:</b> '+fmtDate(o.delivery)+'</span>'+
        '<span><b>Час за доставка:</b> '+esc(o.hour||'—')+'</span>'+
      '</div>'+
      '<div class="p-sign">'+
        '<div class="p-dots">.....................................................................................................</div>'+
        '<div class="p-recv"><b>Получил:</b> ................................................................</div>'+
        '<div class="p-ok">Получих стоката без забележка!</div>'+
      '</div>'+
    '</div>';
  };

  wrap.innerHTML=
    '<style>'+PRINT_CSS+'</style>'+
    '<div style="max-width:680px;margin:0 auto;padding:16px 16px 40px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Бланка за шофьора</div>'+
        '<div style="display:flex;gap:8px;">'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай</button>'+
          '<button onclick="showModule(\'transport\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px;padding:9px 13px;margin-bottom:12px;" class="no-print">'+
        '📄 1 лист А4. Откъсвате по пунктираната линия — едно за шофьора, едно за магазина.</div>'+
      '<div class="p-wrap">'+half()+'<div class="p-cut">— — — — — — — — — ОТКЪСВАТЕ ТУК — — — — — — — — —</div>'+half()+'</div>'+
    '</div>';
}
