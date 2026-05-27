/* kasa.js — Касов модул
   ПОС отчети + Главна каса
   Всички изчисления съответстват точно на Excel файла */

var kasaReports = [];
var kasaGlavna  = null;
var kasaEditId  = null;
var kasaView    = 'pos'; /* 'pos' | 'glavna' */

/* ─── ДЕНОМИНАЦИИ ───────────────────────────────────────────── */
var BILLS = [500,200,100,50,20,10,5,2,1];
var COINS = [0.5,0.2,0.1,0.05,0.02,0.01];
var ALL_DENOM = BILLS.concat(COINS);

var DENOM_KEY = {};
[500,200,100,50,20,10,5,2,1].forEach(function(v){ DENOM_KEY[v]='bills_'+v; });
DENOM_KEY[0.5]='coins_50'; DENOM_KEY[0.2]='coins_20'; DENOM_KEY[0.1]='coins_10';
DENOM_KEY[0.05]='coins_5'; DENOM_KEY[0.02]='coins_2'; DENOM_KEY[0.01]='coins_1';

var INKASO_DENOM = [500,200,100,50,20,10];

/* ─── HELPERS ───────────────────────────────────────────────── */
function fmtMoney(v){
  var n=parseFloat(v)||0;
  return (n<0?'–':'')+Math.abs(n).toFixed(2)+' EUR';
}
function razCol(v){
  var n=parseFloat(v)||0;
  return n<0?'#dc2626':n>0?'#d97706':'#16a34a';
}
function moneyBadge(v){
  return '<span style="font-weight:700;color:'+razCol(v)+';">'+fmtMoney(v)+'</span>';
}
function calcCounted(r){
  /* Сумира всички купюри: брой × деноминация */
  var s=0;
  ALL_DENOM.forEach(function(v){
    s+=Math.round((parseInt(r[DENOM_KEY[v]])||0)*v*100)/100;
  });
  return Math.round(s*100)/100;
}
function calcInkaso(r){
  /* Инкасо: брой × деноминация */
  var s=0;
  INKASO_DENOM.forEach(function(v){
    s+=(parseInt(r['inkaso_'+v])||0)*v;
  });
  return Math.round(s*100)/100;
}
function calcRazlika(r){
  /* counted_cash - (в_брой - инкасо + сторна) */
  var cash    = parseFloat(r.cash_turnover)||0;
  var inkaso  = calcInkaso(r);
  var storna  = parseFloat(r.storna_total)||0;
  var counted = parseFloat(r.counted_cash)||calcCounted(r);
  return Math.round((counted-(cash-inkaso+storna))*100)/100;
}

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadKasa(){
  var q='order=date.desc,pos_number.asc';
  if(!isGlobal()) q+='&store_name=eq.'+encodeURIComponent(currentUser.store_name);
  sbGet('kasa_reports',q).then(function(data){
    kasaReports=Array.isArray(data)?data:[];
    if(kasaView==='pos') renderKasa();
    else renderGlavna();
  }).catch(function(){renderKasa();});
  /* Главна каса за днес */
  var gq='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+today();
  sbGet('kasa_glavna',gq).then(function(data){
    kasaGlavna=(Array.isArray(data)&&data.length)?data[0]:null;
    if(kasaView==='glavna') renderGlavna();
  }).catch(function(){});
}

/* ─── TABS ──────────────────────────────────────────────────── */
function kasaTab(tab){
  kasaView=tab;
  ['pos','glavna'].forEach(function(t){
    var el=document.getElementById('ktab-'+t);
    if(el) el.style.background=t===tab?'#2f2f2f':'#fff',
            el.style.color=t===tab?'#fff':'#64748b';
  });
  if(tab==='pos') renderKasa();
  else renderGlavna();
}

function kasaTabBar(){
  var canGlavna=['manager','admin','kasa'].indexOf(currentUser.role)>=0;
  if(!canGlavna) return '';
  return '<div style="display:flex;gap:0;margin-bottom:18px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">'+
    '<button id="ktab-pos" onclick="kasaTab(\'pos\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:#2f2f2f;color:#fff;">📋 ПОС Отчети</button>'+
    '<button id="ktab-glavna" onclick="kasaTab(\'glavna\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:#fff;color:#64748b;">🏦 Главна каса</button>'+
  '</div>';
}

/* ═══════════════════════════════════════════════════════════════
   ПОС ОТЧЕТИ
══════════════════════════════════════════════════════════════ */
function renderKasa(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var todayStr=today();
  var todayRep=kasaReports.filter(function(r){return r.date===todayStr;});
  var histRep =kasaReports.filter(function(r){return r.date!==todayStr;});
  var canConfirm=['manager','admin'].indexOf(currentUser.role)>=0;
  var canUnlock=['admin','accounting'].indexOf(currentUser.role)>=0;

  var html='<div class="page">'+
    '<div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+'</div>'+
    kasaTabBar()+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'+
      '<div style="font-size:13px;color:var(--muted);">Днес: <b>'+todayRep.length+'</b> отчета</div>'+
      '<button class="btn btn-green" onclick="openKasaForm(null)">+ Нов ПОС отчет</button>'+
      '<button onclick="printKasaReport()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:500;cursor:pointer;">🖨 Разпечатай отчет</button>'+
    '</div>';

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
      '<thead><tr><th>ПОС</th><th>Касиер</th><th>Оборот</th><th>В брой</th><th>Карти</th><th>Инкасо</th><th>Налични</th><th>Разлика</th><th>Статус</th><th></th></tr></thead><tbody>';
    todayRep.forEach(function(r){
      var draft=r.status==='draft';
      var inkaso=calcInkaso(r);
      html+='<tr>'+
        '<td><b>ПОС '+esc(String(r.pos_number||''))+'</b><br><small style="color:#94a3b8;">Каса '+esc(String(r.kasa_number||''))+'</small></td>'+
        '<td>'+esc(r.cashier_name||'')+'</td>'+
        '<td>'+fmtMoney(r.total_turnover)+'</td>'+
        '<td>'+fmtMoney(r.cash_turnover)+'</td>'+
        '<td>'+fmtMoney(r.card_turnover)+'</td>'+
        '<td>'+fmtMoney(inkaso)+'</td>'+
        '<td>'+fmtMoney(r.counted_cash)+'</td>'+
        '<td>'+moneyBadge(r.razlika)+'</td>'+
        '<td>'+(draft?
          '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✏️ Чернова</span>':
          '<span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ Потвърден</span>')+'</td>'+
        '<td><div style="display:flex;gap:4px;">'+
          (draft?'<button onclick="editKasaReport(\''+r.id+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️ Редактирай</button>':'')+
          (draft&&canConfirm?'<button onclick="confirmKasaReport(\''+r.id+'\')" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✅ Потвърди</button>':'')+
          (!draft&&canUnlock?'<button onclick="unlockKasaReport(\''+r.id+'\')" style="border:1px solid #d97706;background:#fffbeb;color:#d97706;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🔓 Разключи</button>':'')+
        '</div></td></tr>';
    });
    html+='<tr style="background:#f8fafc;font-weight:700;">'+
      '<td colspan="2">ОБЩО</td>'+
      '<td>'+fmtMoney(tTurn)+'</td>'+
      '<td>'+fmtMoney(tCash)+'</td>'+
      '<td>'+fmtMoney(tCard)+'</td>'+
      '<td>—</td>'+
      '<td>'+fmtMoney(tCount)+'</td>'+
      '<td>'+moneyBadge(tRaz)+'</td>'+
      '<td colspan="2"></td></tr>';
    html+='</tbody></table></div></div>';
  } else {
    html+='<div class="card" style="text-align:center;padding:40px;">'+
      '<div style="font-size:40px;margin-bottom:10px;">📋</div>'+
      '<div style="font-size:14px;color:var(--muted);">Няма отчети за днес.</div></div>';
  }
  if(histRep.length){
    html+='<div class="card"><div class="card-title">📜 История</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr><th>Дата</th><th>ПОС</th><th>Касиер</th><th>В брой</th><th>Инкасо</th><th>Налични</th><th>Разлика</th><th>Статус</th></tr></thead><tbody>';
    histRep.slice(0,40).forEach(function(r){
      html+='<tr>'+
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>ПОС '+esc(String(r.pos_number||''))+'</td>'+
        '<td>'+esc(r.cashier_name||'')+'</td>'+
        '<td>'+fmtMoney(r.cash_turnover)+'</td>'+
        '<td>'+fmtMoney(calcInkaso(r))+'</td>'+
        '<td>'+fmtMoney(r.counted_cash)+'</td>'+
        '<td>'+moneyBadge(r.razlika)+'</td>'+
        '<td>'+(r.status==='confirmed'?'✅':'✏️')+'</td></tr>';
    });
    html+='</tbody></table></div></div>';
  }
  html+='</div>';
  wrap.innerHTML=html;
}

/* ─── ПОС ФОРМА ─────────────────────────────────────────────── */
function openKasaForm(report){
  kasaEditId=report?report.id:null;
  var r=report||{};
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;

  /* Ред за купюра (отчетени) */
  function denomRow(val,dbKey){
    var qty=parseInt(r[dbKey])||0;
    var sub=Math.round(qty*val*100)/100;
    return '<tr style="border-bottom:1px solid #f1f5f9;">'+
      '<td style="text-align:right;padding:4px 10px;font-size:13px;font-weight:600;color:#374151;">'+val+'</td>'+
      '<td style="padding:3px 6px;">'+
        '<input type="number" min="0" id="kf-'+dbKey+'" value="'+qty+'" oninput="kasaLiveCalc()"'+
        ' style="width:72px;text-align:center;font-family:DM Mono,monospace;font-size:13px;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;">'+
      '</td>'+
      '<td style="padding:4px 10px;font-family:DM Mono,monospace;font-size:12px;color:#64748b;min-width:80px;" id="kf-sub-'+dbKey+'">'+sub.toFixed(2)+'</td>'+
    '</tr>';
  }

  /* Ред за инкасо купюра (брой × стойност) */
  function inkRow(val){
    var qty=parseInt(r['inkaso_'+val])||0;
    var sub=qty*val;
    return '<tr style="border-bottom:1px solid #f1f5f9;">'+
      '<td style="text-align:right;padding:4px 10px;font-size:13px;font-weight:600;color:#374151;">'+val+'</td>'+
      '<td style="padding:3px 6px;">'+
        '<input type="number" min="0" id="kf-inkaso_'+val+'" value="'+qty+'" oninput="kasaLiveCalc()"'+
        ' style="width:72px;text-align:center;font-family:DM Mono,monospace;font-size:13px;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;">'+
      '</td>'+
      '<td style="padding:4px 10px;font-family:DM Mono,monospace;font-size:12px;color:#64748b;min-width:80px;" id="kf-sub-inkaso_'+val+'">'+sub.toFixed(2)+'</td>'+
    '</tr>';
  }

  var html='<div style="max-width:780px;margin:0 auto;padding:20px 16px 60px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:18px;">'+
      '<div style="font-size:18px;font-weight:600;">'+(kasaEditId?'✏️ Редактирай':'+ Нов')+' ПОС отчет</div>'+
      '<div style="display:flex;gap:8px;">'+
        '<button onclick="submitKasaForm()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази чернова</button>'+
        '<button onclick="kasaView=\'pos\';loadKasa();" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
      '</div>'+
    '</div>'+

    /* Данни */
    '<div class="card" style="margin-bottom:14px;"><div class="card-title">Данни за смяната</div>'+
    '<div class="form-grid">'+
      '<div><label class="fl">Дата</label><input type="date" class="fi" id="kf-date" value="'+(r.date||today())+'"></div>'+
      '<div><label class="fl">ПОС №</label><select class="fi" id="kf-pos">'+
        [1,2,3].map(function(n){return '<option value="'+n+'"'+(r.pos_number==n?' selected':'')+'>ПОС '+n+'</option>';}).join('')+
      '</select></div>'+
      '<div><label class="fl">Касиер (три имена)</label><input class="fi" id="kf-cashier" value="'+esc(r.cashier_name||'')+'"></div>'+
      '<div><label class="fl">Каса №</label><input type="number" class="fi" id="kf-kasa" value="'+(r.kasa_number||1)+'"></div>'+
    '</div></div>'+

    /* Оборот */
    '<div class="card" style="margin-bottom:14px;"><div class="card-title">Оборот</div>'+
    '<div class="form-grid">'+
      '<div><label class="fl">Общ оборот (EUR)</label><input type="number" step="0.01" class="fi" id="kf-total_turnover" value="'+(r.total_turnover||'')+'" oninput="kasaLiveCalc()" placeholder="0.00"></div>'+
      '<div></div>'+
      '<div><label class="fl">В брой (EUR)</label><input type="number" step="0.01" class="fi" id="kf-cash_turnover" value="'+(r.cash_turnover||'')+'" oninput="kasaLiveCalc()" placeholder="0.00"></div>'+
      '<div><label class="fl">Деб./кредитни (EUR)</label><input type="number" step="0.01" class="fi" id="kf-card_turnover" value="'+(r.card_turnover||'')+'" oninput="kasaLiveCalc()" placeholder="0.00"></div>'+
    '</div></div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'+

    /* Отчетени купюри */
    '<div class="card"><div class="card-title">Отчетени купюри</div>'+
    '<table style="width:100%;"><thead><tr>'+
      '<th style="text-align:right;padding:4px 10px;font-size:11px;color:#64748b;">Ном.</th>'+
      '<th style="padding:4px 6px;font-size:11px;color:#64748b;text-align:center;">Брой</th>'+
      '<th style="padding:4px 10px;font-size:11px;color:#64748b;">Сума</th>'+
    '</tr></thead><tbody>'+
    BILLS.map(function(v){return denomRow(v,DENOM_KEY[v]);}).join('')+
    COINS.map(function(v){return denomRow(v,DENOM_KEY[v]);}).join('')+
    '<tr style="border-top:2px solid #e2e8f0;"><td colspan="2" style="padding:6px 10px;font-weight:700;">Общо налични:</td>'+
    '<td style="padding:6px 10px;font-family:DM Mono,monospace;font-weight:700;" id="kf-counted-total">0.00</td></tr>'+
    '</tbody></table></div>'+

    /* Инкасо + Сторна */
    '<div>'+
    '<div class="card" style="margin-bottom:14px;"><div class="card-title">Изведени за инкасо (брой банкноти)</div>'+
    '<table style="width:100%;"><thead><tr>'+
      '<th style="text-align:right;padding:4px 10px;font-size:11px;color:#64748b;">Ном.</th>'+
      '<th style="padding:4px 6px;font-size:11px;color:#64748b;text-align:center;">Брой</th>'+
      '<th style="padding:4px 10px;font-size:11px;color:#64748b;">Сума</th>'+
    '</tr></thead><tbody>'+
    INKASO_DENOM.map(function(v){return inkRow(v);}).join('')+
    '<tr style="border-top:2px solid #e2e8f0;"><td colspan="2" style="padding:6px 10px;font-weight:700;">Общо инкасо:</td>'+
    '<td style="padding:6px 10px;font-family:DM Mono,monospace;font-weight:700;" id="kf-inkaso-total">0.00</td></tr>'+
    '</tbody></table></div>'+
    '<div class="card"><div class="card-title">Сторна</div>'+
    '<label class="fl">Сума сторна (EUR)</label>'+
    '<input type="number" step="0.01" class="fi" id="kf-storna" value="'+(r.storna_total||0)+'" oninput="kasaLiveCalc()" placeholder="0.00">'+
    '</div></div></div>'+

    /* Резултат */
    '<div class="card" style="background:#f8fafc;"><div class="card-title">📊 Резултат</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">'+
      resBox('В брой (отчет)','kf-r-cash','#e0f2fe','#0369a1')+
      resBox('– Инкасо','kf-r-inkaso','#fef9c3','#92400e')+
      resBox('Налични (броени)','kf-r-counted','#f0fdf4','#166534')+
      '<div style="text-align:center;padding:12px;border-radius:8px;border:2px solid #e2e8f0;" id="kf-res-box">'+
        '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">РАЗЛИКА</div>'+
        '<div style="font-size:20px;font-weight:700;font-family:DM Mono,monospace;" id="kf-r-razlika">0.00</div>'+
      '</div>'+
    '</div></div>'+
  '</div>';

  wrap.innerHTML=html;
  kasaLiveCalc();
}

function resBox(label,id,bg,col){
  return '<div style="text-align:center;padding:10px;border-radius:8px;background:'+bg+';">'+
    '<div style="font-size:10px;color:'+col+';text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">'+label+'</div>'+
    '<div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;color:'+col+';" id="'+id+'">0.00</div>'+
  '</div>';
}

/* ─── LIVE CALC ─────────────────────────────────────────────── */
function kasaLiveCalc(){
  /* Купюри */
  var counted=0;
  ALL_DENOM.forEach(function(v){
    var key=DENOM_KEY[v];
    var el=document.getElementById('kf-'+key);
    var qty=el?parseInt(el.value)||0:0;
    var sub=Math.round(qty*v*100)/100;
    counted+=sub;
    var s=document.getElementById('kf-sub-'+key);
    if(s) s.textContent=sub.toFixed(2);
  });
  counted=Math.round(counted*100)/100;
  var ct=document.getElementById('kf-counted-total');
  if(ct) ct.textContent=counted.toFixed(2);

  /* Инкасо */
  var inkaso=0;
  INKASO_DENOM.forEach(function(v){
    var el=document.getElementById('kf-inkaso_'+v);
    var qty=el?parseInt(el.value)||0:0;
    var sub=qty*v;
    inkaso+=sub;
    var s=document.getElementById('kf-sub-inkaso_'+v);
    if(s) s.textContent=sub.toFixed(2);
  });
  inkaso=Math.round(inkaso*100)/100;
  var it=document.getElementById('kf-inkaso-total');
  if(it) it.textContent=inkaso.toFixed(2);

  /* Сторна */
  var storna=parseFloat((document.getElementById('kf-storna')||{}).value)||0;
  /* В брой */
  var cash=parseFloat((document.getElementById('kf-cash_turnover')||{}).value)||0;
  /* Резултат = в_брой - инкасо + сторна */
  var result=Math.round((cash-inkaso+storna)*100)/100;
  /* Разлика = налични - резултат */
  var razlika=Math.round((counted-result)*100)/100;

  var set=function(id,val){ var el=document.getElementById(id); if(el)el.textContent=val.toFixed(2); };
  set('kf-r-cash',result);
  set('kf-r-inkaso',inkaso);
  set('kf-r-counted',counted);

  var rEl=document.getElementById('kf-r-razlika');
  var box=document.getElementById('kf-res-box');
  if(rEl){
    var col=razCol(razlika);
    var bg=razlika<0?'#fff5f5':razlika>0?'#fffbeb':'#f0fdf4';
    rEl.textContent=(razlika<0?'– ':'')+Math.abs(razlika).toFixed(2)+' EUR';
    rEl.style.color=col;
    if(box){box.style.borderColor=col;box.style.background=bg;}
  }
}

/* ─── SUBMIT ────────────────────────────────────────────────── */
function submitKasaForm(){
  var cashier=(document.getElementById('kf-cashier')||{}).value||'';
  cashier=cashier.trim();
  if(!cashier){toast('Въведи името на касиера','#dc2626');return;}

  /* Пресметни counted */
  var counted=0;
  ALL_DENOM.forEach(function(v){
    var key=DENOM_KEY[v];
    var el=document.getElementById('kf-'+key);
    var qty=el?parseInt(el.value)||0:0;
    counted+=Math.round(qty*v*100)/100;
  });
  counted=Math.round(counted*100)/100;

  /* Инкасо */
  var inkaso=0;
  INKASO_DENOM.forEach(function(v){
    var el=document.getElementById('kf-inkaso_'+v);
    inkaso+=(el?parseInt(el.value)||0:0)*v;
  });
  inkaso=Math.round(inkaso*100)/100;

  var cash=parseFloat((document.getElementById('kf-cash_turnover')||{}).value)||0;
  var storna=parseFloat((document.getElementById('kf-storna')||{}).value)||0;
  var razlika=Math.round((counted-(cash-inkaso+storna))*100)/100;

  var p={
    store_name:currentUser.store_name,
    date:(document.getElementById('kf-date')||{}).value||today(),
    pos_number:parseInt((document.getElementById('kf-pos')||{}).value)||1,
    cashier_name:cashier,
    kasa_number:parseInt((document.getElementById('kf-kasa')||{}).value)||1,
    total_turnover:parseFloat((document.getElementById('kf-total_turnover')||{}).value)||0,
    cash_turnover:cash,
    card_turnover:parseFloat((document.getElementById('kf-card_turnover')||{}).value)||0,
    storna_total:storna,
    counted_cash:counted,
    razlika:razlika,
    status:'draft'
  };
  ALL_DENOM.forEach(function(v){ var key=DENOM_KEY[v]; var el=document.getElementById('kf-'+key); p[key]=el?parseInt(el.value)||0:0; });
  INKASO_DENOM.forEach(function(v){ var el=document.getElementById('kf-inkaso_'+v); p['inkaso_'+v]=el?parseInt(el.value)||0:0; });

  var req=kasaEditId?sbPatch('kasa_reports','id=eq.'+kasaEditId,p):sbPost('kasa_reports',p);
  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('💾 Черновата е запазена!');
    kasaEditId=null;kasaView='pos';loadKasa();
  });
}

function editKasaReport(id){
  var r=kasaReports.find(function(x){return x.id===id;});
  if(!r)return;
  if(r.status==='confirmed'){toast('Потвърденият отчет не може да се редактира','#dc2626');return;}
  kasaEditId=id;
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
    toast('✅ Отчетът е потвърден и заключен!');loadKasa();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ГЛАВНА КАСА
═══════════════════════════════════════════════════════════════ */
function renderGlavna(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var todayStr=today();
  var todayRep=kasaReports.filter(function(r){return r.date===todayStr;});
  var g=kasaGlavna||{};
  var isDraft=!g.id||(g.status==='draft');
  var canEdit=['manager','admin'].indexOf(currentUser.role)>=0;

  /* Сборна таблица по деноминации: ПОС1 + ПОС2 + ПОС3 + Главна */
  function sumDenom(v){
    var posSum=0;
    todayRep.forEach(function(r){posSum+=parseInt(r[DENOM_KEY[v]])||0;});
    var gl=parseInt(g[DENOM_KEY[v]])||0;
    var total=posSum+gl;
    return {pos:posSum,gl:gl,total:total,sum:Math.round(total*v*100)/100};
  }

  /* Изчисли общо налични (всички ПОС + Главна) */
  var totalCounted=0;
  ALL_DENOM.forEach(function(v){
    var d=sumDenom(v);totalCounted+=d.sum;
  });
  totalCounted=Math.round(totalCounted*100)/100;
  var slujebno=parseFloat(g.slujebno)||0;
  var sapBalance=parseFloat(g.sap_balance)||0;
  var razlika=Math.round((totalCounted+slujebno-sapBalance)*100)/100;

  /* Инкасо от ПОС отчети */
  var totalInkaso=0;
  todayRep.forEach(function(r){totalInkaso+=calcInkaso(r);});

  /* Сборна таблица инкасо */
  function inkSum(v){
    var s=0;todayRep.forEach(function(r){s+=parseInt(r['inkaso_'+v])||0;});
    return s;
  }

  var html='<div class="page">'+
    '<div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+' — Главна каса</div>'+
    kasaTabBar()+

    /* Сборна таблица деноминации */
    '<div class="card" style="margin-bottom:14px;">'+
    '<div class="card-title">📊 Обобщение по купюри — '+fmtDate(todayStr)+'</div>'+
    '<div class="tbl-wrap"><table style="font-size:12px;">'+
    '<thead><tr>'+
      '<th>Ном.</th>'+
      todayRep.map(function(r){return '<th style="text-align:center;">ПОС '+r.pos_number+'</th>';}).join('')+
      '<th style="text-align:center;background:#fef9c3;">Главна</th>'+
      '<th style="text-align:center;">Общо бр.</th>'+
      '<th style="text-align:right;">Сума</th>'+
    '</tr></thead><tbody>'+
    ALL_DENOM.map(function(v){
      var d=sumDenom(v);
      var glInput=isDraft&&canEdit?
        '<input type="number" min="0" id="gl-'+DENOM_KEY[v]+'" value="'+(parseInt(g[DENOM_KEY[v]])||0)+'" oninput="glavnaLiveCalc()" style="width:55px;text-align:center;border:1.5px solid #e2e8f0;border-radius:4px;font-family:DM Mono,monospace;font-size:12px;padding:2px 4px;background:#fffbeb;">':
        '<span style="font-family:DM Mono,monospace;">'+(parseInt(g[DENOM_KEY[v]])||0)+'</span>';
      return '<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="font-weight:600;text-align:right;padding:4px 10px;">'+v+'</td>'+
        todayRep.map(function(r){return '<td style="text-align:center;font-family:DM Mono,monospace;padding:4px 8px;">'+(parseInt(r[DENOM_KEY[v]])||0)+'</td>';}).join('')+
        '<td style="text-align:center;background:#fffbeb;padding:4px 6px;">'+glInput+'</td>'+
        '<td style="text-align:center;font-family:DM Mono,monospace;font-weight:600;padding:4px 8px;" id="gl-total-'+DENOM_KEY[v]+'">'+d.total+'</td>'+
        '<td style="text-align:right;font-family:DM Mono,monospace;padding:4px 10px;" id="gl-sum-'+DENOM_KEY[v]+'">'+d.sum.toFixed(2)+'</td>'+
      '</tr>';
    }).join('')+
    '<tr style="border-top:2px solid #e2e8f0;font-weight:700;background:#f8fafc;">'+
      '<td colspan="'+(1+todayRep.length)+'">ОБЩО НАЛИЧНИ</td>'+
      '<td></td><td></td>'+
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:14px;" id="gl-total-counted">'+totalCounted.toFixed(2)+' EUR</td>'+
    '</tr>'+
    '</tbody></table></div></div>'+

    /* Инкасо summary */
    '<div class="card" style="margin-bottom:14px;">'+
    '<div class="card-title">Изведени за инкасо — обобщение</div>'+
    '<div class="tbl-wrap"><table style="font-size:12px;">'+
    '<thead><tr><th>Ном.</th>'+
    todayRep.map(function(r){return '<th style="text-align:center;">ПОС '+r.pos_number+'</th>';}).join('')+
    '<th style="text-align:center;">Брой</th><th style="text-align:right;">Сума</th></tr></thead><tbody>'+
    INKASO_DENOM.map(function(v){
      var qty=inkSum(v);
      return '<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="font-weight:600;text-align:right;padding:4px 10px;">'+v+'</td>'+
        todayRep.map(function(r){return '<td style="text-align:center;font-family:DM Mono,monospace;padding:4px 8px;">'+(parseInt(r['inkaso_'+v])||0)+'</td>';}).join('')+
        '<td style="text-align:center;font-family:DM Mono,monospace;font-weight:600;padding:4px 8px;">'+qty+'</td>'+
        '<td style="text-align:right;font-family:DM Mono,monospace;padding:4px 10px;">'+(qty*v).toFixed(2)+'</td>'+
      '</tr>';
    }).join('')+
    '<tr style="border-top:2px solid #e2e8f0;font-weight:700;background:#f8fafc;">'+
      '<td colspan="'+(1+todayRep.length)+'">ОБЩО ИНКАСО</td>'+
      '<td></td>'+
      '<td style="text-align:right;font-family:DM Mono,monospace;">'+totalInkaso.toFixed(2)+' EUR</td>'+
    '</tr></tbody></table></div></div>'+

    /* Жълти полета — ръчно въвеждане */
    '<div class="card" style="margin-bottom:14px;background:#fffbeb;border-color:#f0c940;">'+
    '<div class="card-title" style="color:#92400e;">⭐ Ръчно въвеждане (жълти полета)</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'+
      '<div><label class="fl">Служебно въведени (EUR)</label>'+
        (isDraft&&canEdit?
          '<input type="number" step="0.01" class="fi" id="gl-slujebno" value="'+(g.slujebno||0)+'" oninput="glavnaLiveCalc()" style="background:#fffbeb;">':
          '<div class="fi" style="background:#f9f8f6;">'+(g.slujebno||0)+'</div>')+
      '</div>'+
      '<div><label class="fl">Наличност SAP (EUR)</label>'+
        (isDraft&&canEdit?
          '<input type="number" step="0.01" class="fi" id="gl-sap" value="'+(g.sap_balance||0)+'" oninput="glavnaLiveCalc()" style="background:#fffbeb;">':
          '<div class="fi" style="background:#f9f8f6;">'+(g.sap_balance||0)+'</div>')+
      '</div>'+
      '<div style="display:flex;flex-direction:column;justify-content:flex-end;">'+
        (isDraft&&canEdit?
          '<button onclick="saveGlavna()" class="btn btn-green" style="margin-top:20px;">💾 Запази</button>':
          '<span style="margin-top:20px;font-size:12px;color:#16a34a;font-weight:600;">✅ Потвърдена</span>')+
      '</div>'+
    '</div></div>'+

    /* Финален резултат */
    '<div class="card" style="background:#f8fafc;">'+
    '<div class="card-title">📊 Краен резултат</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">'+
      '<div style="text-align:center;padding:12px;border-radius:8px;background:#f0fdf4;">'+
        '<div style="font-size:10px;color:#166534;text-transform:uppercase;margin-bottom:4px;">Общо налични</div>'+
        '<div style="font-size:15px;font-weight:700;font-family:DM Mono,monospace;color:#166534;" id="gl-r-counted">'+totalCounted.toFixed(2)+' EUR</div>'+
      '</div>'+
      '<div style="text-align:center;padding:12px;border-radius:8px;background:#fef9c3;">'+
        '<div style="font-size:10px;color:#92400e;text-transform:uppercase;margin-bottom:4px;">Служебно въведени</div>'+
        '<div style="font-size:15px;font-weight:700;font-family:DM Mono,monospace;color:#92400e;" id="gl-r-slujebno">'+slujebno.toFixed(2)+' EUR</div>'+
      '</div>'+
      '<div style="text-align:center;padding:12px;border-radius:8px;background:#eff6ff;">'+
        '<div style="font-size:10px;color:#1e40af;text-transform:uppercase;margin-bottom:4px;">Наличност SAP</div>'+
        '<div style="font-size:15px;font-weight:700;font-family:DM Mono,monospace;color:#1e40af;" id="gl-r-sap">'+sapBalance.toFixed(2)+' EUR</div>'+
      '</div>'+
      '<div style="text-align:center;padding:12px;border-radius:8px;border:2px solid '+razCol(razlika)+';background:'+(razlika<0?'#fff5f5':razlika>0?'#fffbeb':'#f0fdf4')+';">'+
        '<div style="font-size:10px;text-transform:uppercase;margin-bottom:4px;color:'+razCol(razlika)+';">РАЗЛИКА</div>'+
        '<div style="font-size:20px;font-weight:700;font-family:DM Mono,monospace;color:'+razCol(razlika)+';" id="gl-r-razlika">'+(razlika<0?'– ':'')+Math.abs(razlika).toFixed(2)+' EUR</div>'+
      '</div>'+
    '</div></div>'+
  '</div>';

  wrap.innerHTML=html;
}

/* ─── ГЛАВНА КАСА LIVE CALC ──────────────────────────────────── */
function glavnaLiveCalc(){
  var todayStr=today();
  var todayRep=kasaReports.filter(function(r){return r.date===todayStr;});
  var g={};
  ALL_DENOM.forEach(function(v){
    var el=document.getElementById('gl-'+DENOM_KEY[v]);
    g[DENOM_KEY[v]]=el?parseInt(el.value)||0:0;
  });

  var total=0;
  ALL_DENOM.forEach(function(v){
    var posQty=0;
    todayRep.forEach(function(r){posQty+=parseInt(r[DENOM_KEY[v]])||0;});
    var glQty=g[DENOM_KEY[v]]||0;
    var combined=posQty+glQty;
    var sum=Math.round(combined*v*100)/100;
    total+=sum;
    var te=document.getElementById('gl-total-'+DENOM_KEY[v]);
    var se=document.getElementById('gl-sum-'+DENOM_KEY[v]);
    if(te)te.textContent=combined;
    if(se)se.textContent=sum.toFixed(2);
  });
  total=Math.round(total*100)/100;

  var slujebno=parseFloat((document.getElementById('gl-slujebno')||{}).value)||0;
  var sap=parseFloat((document.getElementById('gl-sap')||{}).value)||0;
  var razlika=Math.round((total+slujebno-sap)*100)/100;

  var set=function(id,v,sfx){ var el=document.getElementById(id); if(el)el.textContent=(v<0?'– ':'')+Math.abs(v).toFixed(2)+(sfx||''); };
  set('gl-total-counted',total,' EUR');
  set('gl-r-counted',total,' EUR');
  set('gl-r-slujebno',slujebno,' EUR');
  set('gl-r-sap',sap,' EUR');
  var rEl=document.getElementById('gl-r-razlika');
  if(rEl){rEl.textContent=(razlika<0?'– ':'')+Math.abs(razlika).toFixed(2)+' EUR';rEl.style.color=razCol(razlika);}
}

/* ─── SAVE ГЛАВНА КАСА ───────────────────────────────────────── */
function saveGlavna(){
  var p={store_name:currentUser.store_name,date:today(),status:'draft'};
  ALL_DENOM.forEach(function(v){
    var el=document.getElementById('gl-'+DENOM_KEY[v]);
    p[DENOM_KEY[v]]=el?parseInt(el.value)||0:0;
    p.counted_cash=(parseFloat(p.counted_cash)||0)+Math.round((p[DENOM_KEY[v]]||0)*v*100)/100;
  });
  p.counted_cash=Math.round((p.counted_cash||0)*100)/100;
  var sEl=document.getElementById('gl-slujebno');
  var sapEl=document.getElementById('gl-sap');
  p.slujebno=sEl?parseFloat(sEl.value)||0:0;
  p.sap_balance=sapEl?parseFloat(sapEl.value)||0:0;
  p.razlika=Math.round((p.counted_cash+p.slujebno-p.sap_balance)*100)/100;

  var req=kasaGlavna?
    sbPatch('kasa_glavna','id=eq.'+kasaGlavna.id,p):
    sbPost('kasa_glavna',p);
  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('💾 Главна каса е запазена!');
    /* Reload */
    var gq='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+today();
    sbGet('kasa_glavna',gq).then(function(data){
      kasaGlavna=(Array.isArray(data)&&data.length)?data[0]:null;
      renderGlavna();
    });
  });
}


/* ═══════════════════════════════════════════════════════════════
   РАЗПЕЧАТВАНЕ НА ПЪЛЕН ОТЧЕТ
═══════════════════════════════════════════════════════════════ */
function printKasaReport(){
  var todayStr=today();
  var todayRep=kasaReports.filter(function(r){return r.date===todayStr;});
  var g=kasaGlavna||{};

  /* Изчисления */
  var tTurn=0,tCash=0,tCard=0,tCount=0,tRaz=0,tInkaso=0;
  todayRep.forEach(function(r){
    tTurn +=parseFloat(r.total_turnover)||0;
    tCash +=parseFloat(r.cash_turnover)||0;
    tCard +=parseFloat(r.card_turnover)||0;
    tCount+=parseFloat(r.counted_cash)||0;
    tRaz  +=parseFloat(r.razlika)||0;
    tInkaso+=calcInkaso(r);
  });

  var glCounted=0;
  ALL_DENOM.forEach(function(v){
    var posQ=0; todayRep.forEach(function(r){posQ+=parseInt(r[DENOM_KEY[v]])||0;});
    var glQ=parseInt(g[DENOM_KEY[v]])||0;
    glCounted+=Math.round((posQ+glQ)*v*100)/100;
  });
  glCounted=Math.round(glCounted*100)/100;
  var slujebno=parseFloat(g.slujebno)||0;
  var sapBal=parseFloat(g.sap_balance)||0;
  var glRaz=Math.round((glCounted+slujebno-sapBal)*100)/100;

  function rc(v){var n=parseFloat(v)||0;return n<0?'color:#dc2626':n>0?'color:#d97706':'color:#16a34a';}
  function fm(v){var n=parseFloat(v)||0;return(n<0?'–':'')+Math.abs(n).toFixed(2)+' EUR';}

  /* Таблица купюри */
  var denomRows='';
  ALL_DENOM.forEach(function(v){
    var posQtys=todayRep.map(function(r){return parseInt(r[DENOM_KEY[v]])||0;});
    var posSum=posQtys.reduce(function(a,b){return a+b;},0);
    var glQ=parseInt(g[DENOM_KEY[v]])||0;
    var total=posSum+glQ;
    var sum=Math.round(total*v*100)/100;
    if(total===0)return;
    denomRows+='<tr>'+
      '<td style="text-align:right;padding:2px 8px;font-weight:600;">'+v+'</td>'+
      posQtys.map(function(q){return '<td style="text-align:center;padding:2px 8px;">'+q+'</td>';}).join('')+
      '<td style="text-align:center;padding:2px 8px;background:#fffbeb;">'+glQ+'</td>'+
      '<td style="text-align:center;padding:2px 8px;font-weight:700;">'+total+'</td>'+
      '<td style="text-align:right;padding:2px 8px;font-family:monospace;">'+sum.toFixed(2)+'</td>'+
    '</tr>';
  });

  /* Инкасо таблица */
  var inkRows='';
  var totalInk=0;
  INKASO_DENOM.forEach(function(v){
    var posQtys=todayRep.map(function(r){return parseInt(r['inkaso_'+v])||0;});
    var total=posQtys.reduce(function(a,b){return a+b;},0);
    var sum=total*v;totalInk+=sum;
    if(total===0)return;
    inkRows+='<tr>'+
      '<td style="text-align:right;padding:2px 8px;font-weight:600;">'+v+'</td>'+
      posQtys.map(function(q){return '<td style="text-align:center;padding:2px 8px;">'+q+'</td>';}).join('')+
      '<td style="text-align:center;padding:2px 8px;font-weight:700;">'+total+'</td>'+
      '<td style="text-align:right;padding:2px 8px;font-family:monospace;">'+sum.toFixed(2)+' EUR</td>'+
    '</tr>';
  });

  var posHeaders=todayRep.map(function(r){return '<th style="text-align:center;padding:4px 8px;background:#2f2f2f;color:#fff;font-size:10pt;">ПОС '+r.pos_number+'<br><span style="font-weight:400;font-size:8pt;">'+esc(r.cashier_name||'')+'</span></th>';}).join('');

  var printWin=window.open('','_blank','width=900,height=700');
  printWin.document.write(`<!DOCTYPE html>
<html lang="bg"><head><meta charset="UTF-8">
<title>Касов отчет — ${esc(currentUser.store_name)} — ${fmtDate(todayStr)}</title>
<style>
  @page{size:A4;margin:12mm;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:10pt;color:#111;}
  h2{font-size:13pt;margin-bottom:2mm;}
  h3{font-size:11pt;margin:4mm 0 2mm;color:#2f2f2f;border-bottom:1px solid #ccc;padding-bottom:1mm;}
  table{width:100%;border-collapse:collapse;margin-bottom:4mm;font-size:9.5pt;}
  th{background:#2f2f2f;color:#fff;padding:4px 8px;text-align:left;font-size:9pt;}
  td{padding:3px 8px;border-bottom:1px solid #e5e7eb;}
  tr:last-child td{border-bottom:none;}
  .total-row{background:#f8fafc;font-weight:700;}
  .red{color:#dc2626;}.green{color:#16a34a;}.amber{color:#d97706;}
  .mono{font-family:monospace;}
  .box{border:1px solid #ccc;border-radius:4px;padding:3mm 4mm;margin-bottom:3mm;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:5mm;}
  .metric{border:1px solid #e2e8f0;border-radius:4px;padding:3mm;text-align:center;}
  .metric-val{font-size:14pt;font-weight:700;font-family:monospace;}
  .metric-lbl{font-size:8pt;color:#64748b;margin-bottom:1mm;}
  .sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm;margin-top:8mm;}
  .sign-box{border-top:1px solid #333;padding-top:2mm;font-size:8pt;color:#555;}
  @media print{button{display:none;}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4mm;">
  <div>
    <div style="font-size:16pt;font-weight:700;">ТЕМАКС — Касов отчет</div>
    <div style="font-size:11pt;color:#444;">${esc(currentUser.store_name)} &nbsp;|&nbsp; ${fmtDate(todayStr)}</div>
    <div style="font-size:8.5pt;color:#888;margin-top:1mm;">Изготвен: ${new Date().toLocaleString('bg-BG')} от ${esc(currentUser.display_name||currentUser.email)}</div>
  </div>
  <img src="data:image/png;base64,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" style="height:44pt;width:auto;">
</div>

<h3>📋 Резюме по ПОС терминали</h3>
<table>
  <thead><tr>
    <th>ПОС</th><th>Касиер</th><th>Каса №</th>
    <th style="text-align:right;">Общ оборот</th>
    <th style="text-align:right;">В брой</th>
    <th style="text-align:right;">Карти</th>
    <th style="text-align:right;">Инкасо</th>
    <th style="text-align:right;">Налични</th>
    <th style="text-align:right;">Разлика</th>
    <th style="text-align:center;">Статус</th>
  </tr></thead>
  <tbody>
  ${todayRep.map(function(r){
    var ink=calcInkaso(r);
    var raz=parseFloat(r.razlika)||0;
    return '<tr>'+
      '<td><b>ПОС '+r.pos_number+'</b></td>'+
      '<td>'+esc(r.cashier_name||'')+'</td>'+
      '<td style="text-align:center;">'+esc(String(r.kasa_number||''))+'</td>'+
      '<td style="text-align:right;" class="mono">'+fm(r.total_turnover)+'</td>'+
      '<td style="text-align:right;" class="mono">'+fm(r.cash_turnover)+'</td>'+
      '<td style="text-align:right;" class="mono">'+fm(r.card_turnover)+'</td>'+
      '<td style="text-align:right;" class="mono">'+fm(ink)+'</td>'+
      '<td style="text-align:right;" class="mono">'+fm(r.counted_cash)+'</td>'+
      '<td style="text-align:right;" class="mono '+rc(raz)+'"><b>'+fm(raz)+'</b></td>'+
      '<td style="text-align:center;">'+(r.status==='confirmed'?'✅ Потвърден':'✏️ Чернова')+'</td>'+
    '</tr>';
  }).join('')}
  <tr class="total-row">
    <td colspan="3">ОБЩО</td>
    <td style="text-align:right;" class="mono">${fm(tTurn)}</td>
    <td style="text-align:right;" class="mono">${fm(tCash)}</td>
    <td style="text-align:right;" class="mono">${fm(tCard)}</td>
    <td style="text-align:right;" class="mono">${fm(tInkaso)}</td>
    <td style="text-align:right;" class="mono">${fm(tCount)}</td>
    <td style="text-align:right;" class="mono ${rc(tRaz)}"><b>${fm(tRaz)}</b></td>
    <td></td>
  </tr>
  </tbody>
</table>

<h3>💵 Отчетени купюри по ПОС + Главна каса</h3>
<table>
  <thead><tr>
    <th>Ном.</th>${posHeaders}
    <th style="text-align:center;padding:4px 8px;background:#92400e;color:#fff;font-size:10pt;">Главна</th>
    <th style="text-align:center;padding:4px 8px;">Общо бр.</th>
    <th style="text-align:right;padding:4px 8px;">Сума</th>
  </tr></thead>
  <tbody>${denomRows}</tbody>
</table>

<h3>📤 Изведени за инкасо</h3>
<table>
  <thead><tr>
    <th>Ном.</th>${posHeaders}
    <th style="text-align:center;padding:4px 8px;">Общо бр.</th>
    <th style="text-align:right;padding:4px 8px;">Сума</th>
  </tr></thead>
  <tbody>${inkRows||'<tr><td colspan="10" style="text-align:center;color:#94a3b8;">Няма изведени за инкасо</td></tr>'}</tbody>
</table>

<h3>🏦 Главна каса</h3>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4mm;margin-bottom:5mm;">
  <div class="metric"><div class="metric-lbl">Общо налични</div><div class="metric-val green">${glCounted.toFixed(2)} EUR</div></div>
  <div class="metric"><div class="metric-lbl">Служебно въведени</div><div class="metric-val amber">${slujebno.toFixed(2)} EUR</div></div>
  <div class="metric"><div class="metric-lbl">Наличност SAP</div><div class="metric-val" style="color:#1e40af;">${sapBal.toFixed(2)} EUR</div></div>
  <div class="metric" style="border-color:${glRaz<0?'#dc2626':glRaz>0?'#d97706':'#16a34a'};">
    <div class="metric-lbl">РАЗЛИКА</div>
    <div class="metric-val ${rc(glRaz)}">${(glRaz<0?'– ':'')+Math.abs(glRaz).toFixed(2)} EUR</div>
  </div>
</div>

${kasaGlavna?'<div style="font-size:8.5pt;color:#888;margin-bottom:4mm;">Главна каса: '+(kasaGlavna.status==='confirmed'?'✅ Потвърдена':'✏️ Чернова')+'</div>':''}

<div class="sign-grid">
  <div>
    <div class="sign-box">Изготвил: ________________________</div>
    <div style="font-size:8pt;color:#888;margin-top:1mm;">${esc(currentUser.display_name||'')}</div>
  </div>
  <div>
    <div class="sign-box">Приел (гл. касиер): ________________________</div>
  </div>
  <div>
    <div class="sign-box">Управител: ________________________</div>
  </div>
</div>

<div style="text-align:center;margin-top:6mm;">
  <button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;padding:8px 24px;border-radius:6px;font-size:11pt;cursor:pointer;">🖨 Принтирай / Запази PDF</button>
</div>
</body></html>`);
  printWin.document.close();
  setTimeout(function(){printWin.focus();},300);
}

/* ─── РАЗКЛЮЧВАНЕ (admin / accounting) ─────────────────────── */
function unlockKasaReport(id){
  if(!confirm('Разключи отчета за редакция? Статусът ще се върне на Чернова.'))return;
  sbPatch('kasa_reports','id=eq.'+id,{status:'draft',confirmed_at:null,confirmed_by:null}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('🔓 Отчетът е разключен — може да се редактира');
    loadKasa();
  });
}
