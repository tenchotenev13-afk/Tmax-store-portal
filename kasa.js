/* kasa.js — Касов модул
   Редактирай САМО тук когато правиш промени по касата.
   Структура: ПОС отчет → Чернова → Потвърден (заключен) */

var kasaReports = [];
var kasaEditId  = null;

/* ─── HELPERS ──────────────────────────────────────────────── */
function fmtMoney(v){
  var n=parseFloat(v)||0;
  var s=Math.abs(n).toFixed(2);
  return (n<0?'- ':'') + s + ' лв.';
}
function razlikaColor(v){
  var n=parseFloat(v)||0;
  if(n<0) return '#dc2626';
  if(n>0) return '#d97706';
  return '#16a34a';
}
function moneyBadge(v){
  var n=parseFloat(v)||0;
  var col=razlikaColor(n);
  return '<span style="font-weight:700;color:'+col+';">'+fmtMoney(n)+'</span>';
}

/* Деноминации */
var BILLS  = [500,200,100,50,20,10,5,2,1];
var COINS  = [0.5,0.2,0.1,0.05,0.02,0.01];
var DENOM_KEYS = {
  500:'bills_500',200:'bills_200',100:'bills_100',
  50:'bills_50',20:'bills_20',10:'bills_10',
  5:'bills_5',2:'bills_2',1:'bills_1',
  '0.5':'coins_50','0.2':'coins_20','0.1':'coins_10',
  '0.05':'coins_5','0.02':'coins_2','0.01':'coins_1'
};

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadKasa(){
  var q='order=date.desc,pos_number.asc';
  if(!isGlobal()) q+='&store_name=eq.'+encodeURIComponent(currentUser.store_name);
  sbGet('kasa_reports',q).then(function(data){
    kasaReports=Array.isArray(data)?data:[];
    renderKasa();
  }).catch(function(e){console.warn('kasa:',e);renderKasa();});
}

/* ─── RENDER MAIN ───────────────────────────────────────────── */
function renderKasa(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var todayStr=today();
  var todayRep=kasaReports.filter(function(r){return r.date===todayStr;});
  var histRep =kasaReports.filter(function(r){return r.date!==todayStr;});
  var canConfirm=['manager','admin'].indexOf(currentUser.role)>=0;

  var html='<div class="page">'+
    '<div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">Касови отчети — '+esc(currentUser.store_name)+'</div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'+
      '<div style="font-size:13px;color:var(--muted);">Днес: <b>'+todayRep.length+'</b> отчета</div>'+
      '<button class="btn btn-green" onclick="openKasaForm(null)">+ Нов ПОС отчет</button>'+
    '</div>';

  /* Днешни отчети */
  if(todayRep.length){
    var tTurn=0,tCash=0,tCard=0,tCount=0,tRaz=0;
    todayRep.forEach(function(r){
      tTurn +=parseFloat(r.total_turnover)||0;
      tCash +=parseFloat(r.cash_turnover)||0;
      tCard +=parseFloat(r.card_turnover)||0;
      tCount+=parseFloat(r.counted_cash)||0;
      tRaz  +=parseFloat(r.razlika)||0;
    });
    html+='<div class="card" style="margin-bottom:16px;">'+
      '<div class="card-title">📅 Днешни отчети — '+fmtDate(todayStr)+'</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr><th>ПОС</th><th>Касиер</th><th>Оборот</th><th>В брой</th><th>Карти</th><th>Налични</th><th>Разлика</th><th>Статус</th><th></th></tr></thead><tbody>';
    todayRep.forEach(function(r){
      var draft=r.status==='draft';
      html+='<tr>'+
        '<td><b>ПОС '+esc(String(r.pos_number||''))+'</b><br><small style="color:#94a3b8;">Каса '+esc(String(r.kasa_number||''))+'</small></td>'+
        '<td>'+esc(r.cashier_name||'')+'</td>'+
        '<td>'+fmtMoney(r.total_turnover)+'</td>'+
        '<td>'+fmtMoney(r.cash_turnover)+'</td>'+
        '<td>'+fmtMoney(r.card_turnover)+'</td>'+
        '<td>'+fmtMoney(r.counted_cash)+'</td>'+
        '<td>'+moneyBadge(r.razlika)+'</td>'+
        '<td>'+(draft?
          '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✏️ Чернова</span>':
          '<span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ Потвърден</span>')+'</td>'+
        '<td><div style="display:flex;gap:4px;">'+
          (draft?'<button onclick="editKasaReport(\''+r.id+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️ Редактирай</button>':'')+
          (draft&&canConfirm?'<button onclick="confirmKasaReport(\''+r.id+'\')" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✅ Потвърди</button>':'')+
        '</div></td>'+
      '</tr>';
    });
    html+='<tr style="background:#f8fafc;font-weight:700;">'+
      '<td colspan="2">ОБЩО</td>'+
      '<td>'+fmtMoney(tTurn)+'</td>'+
      '<td>'+fmtMoney(tCash)+'</td>'+
      '<td>'+fmtMoney(tCard)+'</td>'+
      '<td>'+fmtMoney(tCount)+'</td>'+
      '<td>'+moneyBadge(tRaz)+'</td>'+
      '<td colspan="2"></td></tr>';
    html+='</tbody></table></div></div>';
  } else {
    html+='<div class="card" style="text-align:center;padding:40px;">'+
      '<div style="font-size:40px;margin-bottom:10px;">📋</div>'+
      '<div style="font-size:14px;color:var(--muted);">Няма отчети за днес.<br>Натисни &quot;+ Нов ПОС отчет&quot;.</div>'+
    '</div>';
  }

  /* История */
  if(histRep.length){
    html+='<div class="card">'+
      '<div class="card-title">📜 История</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr><th>Дата</th><th>ПОС</th><th>Касиер</th><th>В брой</th><th>Налични</th><th>Разлика</th><th>Статус</th></tr></thead><tbody>';
    histRep.slice(0,40).forEach(function(r){
      html+='<tr>'+
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>ПОС '+esc(String(r.pos_number||''))+'</td>'+
        '<td>'+esc(r.cashier_name||'')+'</td>'+
        '<td>'+fmtMoney(r.cash_turnover)+'</td>'+
        '<td>'+fmtMoney(r.counted_cash)+'</td>'+
        '<td>'+moneyBadge(r.razlika)+'</td>'+
        '<td>'+(r.status==='confirmed'?'✅':'✏️')+'</td>'+
      '</tr>';
    });
    html+='</tbody></table></div></div>';
  }
  html+='</div>';
  wrap.innerHTML=html;
}

/* ─── FORM ──────────────────────────────────────────────────── */
function openKasaForm(report){
  kasaEditId=report?report.id:null;
  var r=report||{};
  var isEdit=!!kasaEditId;

  var denomRow=function(val,key,dbKey){
    var qty=r[dbKey]||0;
    var total=(parseFloat(val)*parseInt(qty)||0).toFixed(2);
    return '<tr>'+
      '<td style="text-align:right;padding:3px 8px;font-weight:600;">'+val+'</td>'+
      '<td style="padding:3px 4px;"><input type="number" min="0" id="kf-'+dbKey+'" value="'+qty+'" '+
        'oninput="kasaCalcDenom()" '+
        'style="width:70px;font-family:DM Mono,monospace;font-size:13px;text-align:center;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;"></td>'+
      '<td style="padding:3px 8px;font-family:DM Mono,monospace;font-size:12px;color:#64748b;" id="kf-tot-'+dbKey+'">'+total+'</td>'+
    '</tr>';
  };

  var inkRow=function(val,field){
    return '<tr>'+
      '<td style="text-align:right;padding:3px 8px;font-weight:600;">'+val+'</td>'+
      '<td style="padding:3px 4px;"><input type="number" min="0" id="kf-'+field+'" value="'+(r[field]||0)+'" '+
        'oninput="kasaCalcDenom()" '+
        'style="width:90px;font-family:DM Mono,monospace;font-size:13px;text-align:center;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;"></td>'+
    '</tr>';
  };

  var formHtml='<div style="max-width:700px;margin:0 auto;padding:20px 16px 60px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:18px;">'+
      '<div style="font-size:18px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Нов')+' ПОС отчет</div>'+
      '<div style="display:flex;gap:8px;">'+
        '<button onclick="submitKasaForm()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази чернова</button>'+
        '<button onclick="loadKasa();renderKasa();" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
      '</div>'+
    '</div>'+

    /* Header */
    '<div class="card" style="margin-bottom:14px;">'+
      '<div class="card-title">Данни за смяната</div>'+
      '<div class="form-grid">'+
        '<div><label class="fl">Дата</label><input type="date" class="fi" id="kf-date" value="'+(r.date||today())+'"></div>'+
        '<div><label class="fl">ПОС №</label>'+
          '<select class="fi" id="kf-pos">'+
            '<option value="1"'+(r.pos_number==1?' selected':'')+'>ПОС 1</option>'+
            '<option value="2"'+(r.pos_number==2?' selected':'')+'>ПОС 2</option>'+
            '<option value="3"'+(r.pos_number==3?' selected':'')+'>ПОС 3</option>'+
          '</select></div>'+
        '<div><label class="fl">Касиер</label><input class="fi" id="kf-cashier" value="'+esc(r.cashier_name||'')+'" placeholder="Три имена"></div>'+
        '<div><label class="fl">Каса №</label><input type="number" class="fi" id="kf-kasa" value="'+(r.kasa_number||1)+'" min="1"></div>'+
      '</div>'+
    '</div>'+

    /* Оборот */
    '<div class="card" style="margin-bottom:14px;">'+
      '<div class="card-title">Оборот</div>'+
      '<div class="form-grid">'+
        '<div><label class="fl">Общ оборот (лв.)</label>'+
          '<input type="number" step="0.01" class="fi" id="kf-total_turnover" value="'+(r.total_turnover||'')+'" oninput="kasaCalcDenom()" placeholder="0.00"></div>'+
        '<div></div>'+
        '<div><label class="fl">В брой (лв.)</label>'+
          '<input type="number" step="0.01" class="fi" id="kf-cash_turnover" value="'+(r.cash_turnover||'')+'" oninput="kasaCalcDenom()" placeholder="0.00"></div>'+
        '<div><label class="fl">Деб./кредитни (лв.)</label>'+
          '<input type="number" step="0.01" class="fi" id="kf-card_turnover" value="'+(r.card_turnover||'')+'" oninput="kasaCalcDenom()" placeholder="0.00"></div>'+
      '</div>'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'+

    /* Отчетени купюри */
    '<div class="card">'+
      '<div class="card-title">Отчетени купюри</div>'+
      '<table style="width:100%;font-size:12px;">'+
        '<thead><tr><th style="text-align:right;padding:3px 8px;color:#64748b;">Ном.</th><th style="padding:3px 4px;color:#64748b;text-align:center;">Бр.</th><th style="padding:3px 8px;color:#64748b;">Сума</th></tr></thead>'+
        '<tbody>'+
        BILLS.map(function(v){return denomRow(v,'',DENOM_KEYS[v]);}).join('')+
        COINS.map(function(v){return denomRow(v,'',DENOM_KEYS[String(v)]);}).join('')+
        '<tr style="border-top:2px solid #e2e8f0;font-weight:700;">'+
          '<td colspan="2" style="padding:5px 8px;">Общо налични:</td>'+
          '<td style="padding:5px 8px;font-family:DM Mono,monospace;" id="kf-counted-total">0.00</td>'+
        '</tr>'+
        '</tbody>'+
      '</table>'+
    '</div>'+

    /* Изведени за инкасо + Сторна */
    '<div>'+
      '<div class="card" style="margin-bottom:14px;">'+
        '<div class="card-title">Изведени за инкасо</div>'+
        '<table style="width:100%;font-size:12px;">'+
          '<tbody>'+
          inkRow(500,'inkaso_500')+
          inkRow(200,'inkaso_200')+
          inkRow(100,'inkaso_100')+
          inkRow(50,'inkaso_50')+
          inkRow(20,'inkaso_20')+
          inkRow(10,'inkaso_10')+
          '<tr style="border-top:2px solid #e2e8f0;font-weight:700;">'+
            '<td style="padding:5px 8px;">Общо инкасо:</td>'+
            '<td style="padding:5px 8px;font-family:DM Mono,monospace;" id="kf-inkaso-total">0.00</td>'+
          '</tr>'+
          '</tbody>'+
        '</table>'+
      '</div>'+
      '<div class="card">'+
        '<div class="card-title">Сторна</div>'+
        '<div><label class="fl">Сума сторна (лв.)</label>'+
          '<input type="number" step="0.01" class="fi" id="kf-storna" value="'+(r.storna_total||0)+'" oninput="kasaCalcDenom()" placeholder="0.00"></div>'+
      '</div>'+
    '</div></div>'+

    /* Резултат */
    '<div class="card" style="background:#f8fafc;">'+
      '<div class="card-title">📊 Резултат</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'+
        '<div style="text-align:center;padding:10px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;">'+
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">В брой (отчет)</div>'+
          '<div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;" id="kf-res-cash">0.00</div>'+
        '</div>'+
        '<div style="text-align:center;padding:10px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;">'+
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">Налични (броени)</div>'+
          '<div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;" id="kf-res-counted">0.00</div>'+
        '</div>'+
        '<div style="text-align:center;padding:12px;border-radius:8px;border:2px solid;" id="kf-res-box">'+
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">РАЗЛИКА</div>'+
          '<div style="font-size:20px;font-weight:700;font-family:DM Mono,monospace;" id="kf-res-razlika">0.00 лв.</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';

  var wrap=document.getElementById('mod-kasa');
  wrap.innerHTML=formHtml;
  kasaCalcDenom();
}

/* ─── LIVE CALCULATION ──────────────────────────────────────── */
function kasaCalcDenom(){
  /* Купюри */
  var counted=0;
  BILLS.forEach(function(v){
    var el=document.getElementById('kf-'+DENOM_KEYS[v]);
    var qty=el?parseInt(el.value)||0:0;
    var sub=qty*v;
    counted+=sub;
    var tot=document.getElementById('kf-tot-'+DENOM_KEYS[v]);
    if(tot)tot.textContent=sub.toFixed(2);
  });
  COINS.forEach(function(v){
    var key=DENOM_KEYS[String(v)];
    var el=document.getElementById('kf-'+key);
    var qty=el?parseInt(el.value)||0:0;
    var sub=Math.round(qty*v*100)/100;
    counted+=sub;
    var tot=document.getElementById('kf-tot-'+key);
    if(tot)tot.textContent=sub.toFixed(2);
  });
  counted=Math.round(counted*100)/100;
  var ctEl=document.getElementById('kf-counted-total');
  if(ctEl)ctEl.textContent=counted.toFixed(2);

  /* Инкасо */
  var inkaso=0;
  [500,200,100,50,20,10].forEach(function(v){
    var el=document.getElementById('kf-inkaso_'+v);
    inkaso+=el?parseFloat(el.value)||0:0;
  });
  var itEl=document.getElementById('kf-inkaso-total');
  if(itEl)itEl.textContent=inkaso.toFixed(2);

  /* Разлика */
  var cash=parseFloat((document.getElementById('kf-cash_turnover')||{}).value)||0;
  var storna=parseFloat((document.getElementById('kf-storna')||{}).value)||0;
  var razlika=Math.round((counted-(cash-inkaso+storna))*100)/100;

  var rcEl=document.getElementById('kf-res-cash');
  var rcoEl=document.getElementById('kf-res-counted');
  var rrEl=document.getElementById('kf-res-razlika');
  var boxEl=document.getElementById('kf-res-box');

  if(rcEl)rcEl.textContent=(cash-inkaso+storna).toFixed(2);
  if(rcoEl)rcoEl.textContent=counted.toFixed(2);
  if(rrEl)rrEl.textContent=(razlika<0?'- ':'')+Math.abs(razlika).toFixed(2)+' лв.';
  if(boxEl){
    var col=razlika<0?'#dc2626':razlika>0?'#d97706':'#16a34a';
    var bg=razlika<0?'#fff5f5':razlika>0?'#fffbeb':'#f0fdf4';
    boxEl.style.borderColor=col;boxEl.style.background=bg;
    if(rrEl)rrEl.style.color=col;
  }
}

/* ─── SUBMIT ────────────────────────────────────────────────── */
function gv(id){var el=document.getElementById(id);return el?(el.value||'').trim():'';}
function gn(id){return parseFloat(gv(id))||0;}
function gi(id){return parseInt(gv(id))||0;}

function submitKasaForm(){
  var cashier=gv('kf-cashier');
  if(!cashier){toast('Въведи името на касиера','#dc2626');return;}

  /* Пресметни counted_cash */
  var counted=0;
  BILLS.forEach(function(v){counted+=gi('kf-'+DENOM_KEYS[v])*v;});
  COINS.forEach(function(v){counted+=Math.round(gi('kf-'+DENOM_KEYS[String(v)])*v*100)/100;});
  counted=Math.round(counted*100)/100;

  var inkaso=gn('kf-inkaso_500')+gn('kf-inkaso_200')+gn('kf-inkaso_100')+
             gn('kf-inkaso_50')+gn('kf-inkaso_20')+gn('kf-inkaso_10');
  var cash=gn('kf-cash_turnover');
  var storna=gn('kf-storna');
  var razlika=Math.round((counted-(cash-inkaso+storna))*100)/100;

  var payload={
    store_name:currentUser.store_name,
    date:gv('kf-date'),
    pos_number:gi('kf-pos'),
    cashier_name:cashier,
    kasa_number:gi('kf-kasa'),
    total_turnover:gn('kf-total_turnover'),
    cash_turnover:cash,
    card_turnover:gn('kf-card_turnover'),
    inkaso_500:gn('kf-inkaso_500'),inkaso_200:gn('kf-inkaso_200'),
    inkaso_100:gn('kf-inkaso_100'),inkaso_50:gn('kf-inkaso_50'),
    inkaso_20:gn('kf-inkaso_20'),inkaso_10:gn('kf-inkaso_10'),
    storna_total:storna,
    counted_cash:counted,
    razlika:razlika,
    status:'draft'
  };
  /* Купюри */
  BILLS.forEach(function(v){payload[DENOM_KEYS[v]]=gi('kf-'+DENOM_KEYS[v]);});
  COINS.forEach(function(v){payload[DENOM_KEYS[String(v)]]=gi('kf-'+DENOM_KEYS[String(v)]);});

  var req=kasaEditId?
    sbPatch('kasa_reports','id=eq.'+kasaEditId,payload):
    sbPost('kasa_reports',payload);

  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('💾 Черновата е запазена!');
    kasaEditId=null;
    loadKasa();
  });
}

/* ─── EDIT / CONFIRM ────────────────────────────────────────── */
function editKasaReport(id){
  var r=kasaReports.find(function(x){return x.id===id;});
  if(!r)return;
  if(r.status==='confirmed'){toast('Потвърденият отчет не може да се редактира','#dc2626');return;}
  openKasaForm(r);
}

function confirmKasaReport(id){
  if(!confirm('Потвърди отчета? След потвърждението не може да се редактира.'))return;
  sbPatch('kasa_reports','id=eq.'+id,{
    status:'confirmed',
    confirmed_at:new Date().toISOString(),
    confirmed_by:currentUser.display_name||currentUser.email
  }).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Отчетът е потвърден и заключен!');
    loadKasa();
  });
}
