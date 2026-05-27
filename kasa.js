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
  ['pos','glavna','zoborot'].forEach(function(t){
    var el=document.getElementById('ktab-'+t);
    if(el) el.style.background=t===tab?'#2f2f2f':'#fff',
            el.style.color=t===tab?'#fff':'#64748b';
  });
  if(tab==='pos') renderKasa();
  else if(tab==='glavna') renderGlavna();
  else if(tab==='zoborot'){loadZoborot();}
}

function kasaTabBar(){
  var canGlavna=['manager','admin','kasa'].indexOf(currentUser.role)>=0;
  if(!canGlavna) return '';
  return '<div style="display:flex;gap:0;margin-bottom:18px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">'+
    '<button id="ktab-pos" onclick="kasaTab(\'pos\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:#2f2f2f;color:#fff;">📋 ПОС Отчети</button>'+
    '<button id="ktab-glavna" onclick="kasaTab(\'glavna\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:#fff;color:#64748b;">🏦 Главна каса</button>'+
    '<button id="ktab-zoborot" onclick="kasaTab(\'zoborot\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;background:#fff;color:#64748b;">📊 Равнение</button>'+
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

/* ═══════════════════════════════════════════════════════════════
   РАВНЕНИЕ НА ОБОРОТА (Zoborot)
   ПОС данни от системата vs Фискални устройства (ФУ)
═══════════════════════════════════════════════════════════════ */
var zoborotData = null;

function loadZoborot(){
  var q='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+today()+'&order=created_at.desc';
  sbGet('kasa_zoborot',q).then(function(data){
    zoborotData=(Array.isArray(data)&&data.length)?data[0]:null;
    renderZoborot();
  }).catch(function(){renderZoborot();});
}

function renderZoborot(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var z=zoborotData||{};
  var isDraft=!z.id||(z.status==='draft');
  var canConfirm=['manager','admin','accounting'].indexOf(currentUser.role)>=0;

  /* Live изчисления */
  function posNoBank(){ return Math.round(((parseFloat(z.cash_bgn)||0)+(parseFloat(z.cash_eur)||0)+(parseFloat(z.card_eur)||0)+(parseFloat(z.voucheri)||0))*100)/100; }
  function fuNet(n){ return Math.round(((parseFloat(z['fu'+n+'_gross'])||0)-(parseFloat(z['fu'+n+'_discount'])||0))*100)/100; }
  function fuTotalNet(){ return Math.round((fuNet(1)+fuNet(2)+fuNet(3))*100)/100; }
  function calcRaz(){ return Math.round((posNoBank()-fuTotalNet())*100)/100; }

  var pnb=parseFloat(z.pos_no_bank)||posNoBank();
  var ftn=parseFloat(z.fu_total_net)||fuTotalNet();
  var raz=parseFloat(z.razlika)||calcRaz();
  var razCol=raz===0?'#16a34a':raz<0?'#dc2626':'#d97706';
  var razBg =raz===0?'#f0fdf4':raz<0?'#fff5f5':'#fffbeb';

  function inp(id,val,placeholder){
    if(!isDraft) return '<span style="font-family:DM Mono,monospace;">'+(parseFloat(val)||0).toFixed(2)+'</span>';
    return '<input type="number" step="0.01" id="zf-'+id+'" value="'+(parseFloat(val)||0)+'" '+
      'oninput="zoborotLiveCalc()" placeholder="'+(placeholder||'0.00')+'" '+
      'style="width:110px;font-family:DM Mono,monospace;font-size:13px;text-align:right;'+
      'padding:4px 8px;border:1.5px solid #e2e8f0;border-radius:6px;">';
  }

  var html='<div class="page">'+
    '<div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+' — Равнение на оборота</div>'+
    kasaTabBar()+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'+
      '<div style="font-size:13px;color:var(--muted);">Дата: <b>'+fmtDate(today())+'</b></div>'+
      '<div style="display:flex;gap:8px;">'+
        (isDraft&&canConfirm?'<button onclick="saveZoborot()" class="btn btn-green">💾 Запази</button>':'')+
        (isDraft&&canConfirm&&z.id?'<button onclick="confirmZoborot()" class="btn" style="background:#2563eb;color:#fff;">✅ Потвърди</button>':'')+
        (!isDraft&&canConfirm?'<button onclick="unlockZoborot()" class="btn" style="background:#fffbeb;color:#d97706;border:1px solid #d97706;">🔓 Разключи</button>':'')+
        '<button onclick="printZoborot()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">🖨 Разпечатай</button>'+
      '</div>'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'+

    /* ПОС данни */
    '<div class="card">'+
      '<div class="card-title">📊 Данни от POS Zoborot</div>'+
      '<table style="width:100%;font-size:13px;">'+
        '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 4px;color:#64748b;">Плащане в брой BGN</td>'+
          '<td style="text-align:right;padding:6px 4px;">'+inp('cash_bgn',z.cash_bgn)+'</td></tr>'+
        '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 4px;color:#64748b;">Плащане в брой EUR</td>'+
          '<td style="text-align:right;padding:6px 4px;">'+inp('cash_eur',z.cash_eur)+'</td></tr>'+
        '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 4px;color:#64748b;">Плащане с карта EUR</td>'+
          '<td style="text-align:right;padding:6px 4px;">'+inp('card_eur',z.card_eur)+'</td></tr>'+
        '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 4px;color:#64748b;">Плащане по банков път EUR</td>'+
          '<td style="text-align:right;padding:6px 4px;">'+inp('bank_eur',z.bank_eur)+'</td></tr>'+
        '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 4px;color:#64748b;">Ваучери EUR</td>'+
          '<td style="text-align:right;padding:6px 4px;">'+inp('voucheri',z.voucheri)+'</td></tr>'+
        '<tr style="border-top:2px solid #e2e8f0;"><td style="padding:8px 4px;font-weight:700;">Обща сума в ПОС EUR</td>'+
          '<td style="text-align:right;padding:8px 4px;" id="zf-pos-total">'+
            '<span style="font-family:DM Mono,monospace;font-weight:700;font-size:14px;">'+pnb.toFixed(2)+' EUR</span>'+
          '</td></tr>'+
      '</table>'+
    '</div>'+

    /* ФУ данни */
    '<div class="card">'+
      '<div class="card-title">🖨 Фискални устройства (ФУ)</div>'+
      '<table style="width:100%;font-size:12px;">'+
        '<thead><tr>'+
          '<th style="padding:5px 6px;text-align:left;background:#2f2f2f;color:#fff;font-size:11px;">ФУ</th>'+
          '<th style="padding:5px 6px;text-align:right;background:#2f2f2f;color:#fff;font-size:11px;">Общ оборот</th>'+
          '<th style="padding:5px 6px;text-align:right;background:#2f2f2f;color:#fff;font-size:11px;">Сторно/Отст.</th>'+
          '<th style="padding:5px 6px;text-align:right;background:#2f2f2f;color:#fff;font-size:11px;">Чист оборот</th>'+
        '</tr></thead>'+
        '<tbody>'+
        [1,2,3].map(function(n){
          var gross=parseFloat(z['fu'+n+'_gross'])||0;
          var disc=parseFloat(z['fu'+n+'_discount'])||0;
          var net=Math.round((gross-disc)*100)/100;
          return '<tr style="border-bottom:1px solid #f1f5f9;">'+
            '<td style="padding:6px;font-weight:700;">ФУ '+n+'</td>'+
            '<td style="text-align:right;padding:5px 4px;">'+inp('fu'+n+'_gross',z['fu'+n+'_gross'])+'</td>'+
            '<td style="text-align:right;padding:5px 4px;">'+inp('fu'+n+'_discount',z['fu'+n+'_discount'])+'</td>'+
            '<td style="text-align:right;padding:6px;font-family:DM Mono,monospace;font-size:12px;" id="zf-fu'+n+'-net">'+net.toFixed(2)+'</td>'+
          '</tr>';
        }).join('')+
        '<tr style="border-top:2px solid #e2e8f0;font-weight:700;">'+
          '<td colspan="3" style="padding:8px 6px;">Общо ФУ нетен оборот</td>'+
          '<td style="text-align:right;padding:8px 6px;font-family:DM Mono,monospace;font-size:14px;" id="zf-fu-total">'+ftn.toFixed(2)+'</td>'+
        '</tr>'+
        '</tbody>'+
      '</table>'+
    '</div></div>'+

    /* Резултат */
    '<div class="card" style="background:#f8fafc;">'+
      '<div class="card-title">📊 Равнение</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'+
        '<div style="text-align:center;padding:14px;border-radius:8px;background:#eff6ff;">'+
          '<div style="font-size:10px;color:#1e40af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">POS оборот (без банков път)</div>'+
          '<div style="font-size:18px;font-weight:700;font-family:DM Mono,monospace;color:#1e40af;" id="zf-r-pos">'+pnb.toFixed(2)+' EUR</div>'+
        '</div>'+
        '<div style="text-align:center;padding:14px;border-radius:8px;background:#f0fdf4;">'+
          '<div style="font-size:10px;color:#166534;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Оборот по фискални устройства</div>'+
          '<div style="font-size:18px;font-weight:700;font-family:DM Mono,monospace;color:#166534;" id="zf-r-fu">'+ftn.toFixed(2)+' EUR</div>'+
        '</div>'+
        '<div style="text-align:center;padding:14px;border-radius:8px;border:2px solid '+razCol+';background:'+razBg+';">'+
          '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;color:'+razCol+';">'+
            (raz===0?'✅ РАЗЛИКА':'⚠️ РАЗЛИКА')+
          '</div>'+
          '<div style="font-size:22px;font-weight:700;font-family:DM Mono,monospace;color:'+razCol+';" id="zf-r-raz">'+
            (raz<0?'– ':'')+Math.abs(raz).toFixed(2)+' EUR'+
          '</div>'+
          (raz===0?'<div style="font-size:11px;color:#16a34a;margin-top:4px;">Без разлика ✓</div>':'')+ 
        '</div>'+
      '</div>'+
    '</div>'+

    (z.id?'<div style="font-size:12px;color:#94a3b8;margin-top:8px;text-align:right;">'+
      'Статус: '+(z.status==='confirmed'?'✅ Потвърден':'✏️ Чернова')+
      (z.status==='confirmed'?' · Потвърден от '+esc(z.confirmed_by||''):'')+'</div>':'')+
  '</div>';

  wrap.innerHTML=html;
}

/* ─── LIVE CALC ─────────────────────────────────────────────── */
function zoborotLiveCalc(){
  var g=function(id){return parseFloat((document.getElementById('zf-'+id)||{}).value)||0;};
  var cashBgn=g('cash_bgn'),cashEur=g('cash_eur'),card=g('card_eur'),bank=g('bank_eur'),vouch=g('voucheri');
  var posNoBank=Math.round((cashBgn+cashEur+card+vouch)*100)/100;
  var fuNets=[1,2,3].map(function(n){
    var gr=g('fu'+n+'_gross'),disc=g('fu'+n+'_discount');
    var net=Math.round((gr-disc)*100)/100;
    var el=document.getElementById('zf-fu'+n+'-net');if(el)el.textContent=net.toFixed(2);
    return net;
  });
  var fuTotal=Math.round((fuNets[0]+fuNets[1]+fuNets[2])*100)/100;
  var raz=Math.round((posNoBank-fuTotal)*100)/100;
  var razCol=raz===0?'#16a34a':raz<0?'#dc2626':'#d97706';
  var razBg =raz===0?'#f0fdf4':raz<0?'#fff5f5':'#fffbeb';

  var set=function(id,val,sfx){var el=document.getElementById(id);if(el)el.textContent=val.toFixed(2)+(sfx||'');};
  set('zf-pos-total',posNoBank,' EUR');
  var pt=document.getElementById('zf-pos-total');
  if(pt)pt.innerHTML='<span style="font-family:DM Mono,monospace;font-weight:700;font-size:14px;">'+posNoBank.toFixed(2)+' EUR</span>';
  set('zf-fu-total',fuTotal);
  set('zf-r-pos',posNoBank,' EUR');
  set('zf-r-fu',fuTotal,' EUR');
  var rEl=document.getElementById('zf-r-raz');
  if(rEl){rEl.textContent=(raz<0?'– ':'')+Math.abs(raz).toFixed(2)+' EUR';rEl.style.color=razCol;}
  var box=rEl?rEl.parentElement:null;
  if(box){box.style.borderColor=razCol;box.style.background=razBg;}
}

/* ─── SAVE / CONFIRM / UNLOCK ───────────────────────────────── */
function saveZoborot(){
  var g=function(id){return parseFloat((document.getElementById('zf-'+id)||{}).value)||0;};
  var cashBgn=g('cash_bgn'),cashEur=g('cash_eur'),card=g('card_eur'),bank=g('bank_eur'),vouch=g('voucheri');
  var fu1g=g('fu1_gross'),fu1d=g('fu1_discount');
  var fu2g=g('fu2_gross'),fu2d=g('fu2_discount');
  var fu3g=g('fu3_gross'),fu3d=g('fu3_discount');
  var fu1n=Math.round((fu1g-fu1d)*100)/100;
  var fu2n=Math.round((fu2g-fu2d)*100)/100;
  var fu3n=Math.round((fu3g-fu3d)*100)/100;
  var posNoBank=Math.round((cashBgn+cashEur+card+vouch)*100)/100;
  var fuTotal=Math.round((fu1n+fu2n+fu3n)*100)/100;
  var raz=Math.round((posNoBank-fuTotal)*100)/100;

  var p={
    store_name:currentUser.store_name,date:today(),
    cash_bgn:cashBgn,cash_eur:cashEur,card_eur:card,bank_eur:bank,
    pos_total_eur:Math.round((cashBgn+cashEur+card+bank+vouch)*100)/100,
    fu1_gross:fu1g,fu1_discount:fu1d,fu1_net:fu1n,
    fu2_gross:fu2g,fu2_discount:fu2d,fu2_net:fu2n,
    fu3_gross:fu3g,fu3_discount:fu3d,fu3_net:fu3n,
    pos_no_bank:posNoBank,fu_total_net:fuTotal,
    razlika:raz,voucheri:vouch,status:'draft'
  };
  var req=zoborotData?sbPatch('kasa_zoborot','id=eq.'+zoborotData.id,p):sbPost('kasa_zoborot',p);
  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('💾 Равнението е запазено!');
    loadZoborot();
  });
}
function confirmZoborot(){
  if(!confirm('Потвърди равнението? След потвърждение не може да се редактира.'))return;
  if(!zoborotData){saveZoborot();return;}
  sbPatch('kasa_zoborot','id=eq.'+zoborotData.id,{
    status:'confirmed',confirmed_by:currentUser.display_name||currentUser.email
  }).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Равнението е потвърдено!');loadZoborot();
  });
}
function unlockZoborot(){
  if(!zoborotData)return;
  if(!confirm('Разключи за редакция?'))return;
  sbPatch('kasa_zoborot','id=eq.'+zoborotData.id,{status:'draft',confirmed_by:null}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('🔓 Разключено!');loadZoborot();
  });
}

/* ─── PRINT ZOBOROT ─────────────────────────────────────────── */
function printZoborot(){
  var z=zoborotData||{};
  var pnb=parseFloat(z.pos_no_bank)||0;
  var ftn=parseFloat(z.fu_total_net)||0;
  var raz=parseFloat(z.razlika)||0;
  var razCol=raz===0?'#16a34a':raz<0?'#dc2626':'#d97706';

  var win=window.open('','_blank','width=800,height:600');
  win.document.write('<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">'+
    '<title>Равнение — '+esc(currentUser.store_name)+' — '+fmtDate(today())+'</title>'+
    '<style>@page{size:A4;margin:15mm;}*{box-sizing:border-box;margin:0;padding:0;}'+
    'body{font-family:Arial,sans-serif;font-size:11pt;color:#111;}'+
    'h1{font-size:15pt;margin-bottom:2mm;}h2{font-size:12pt;margin:5mm 0 3mm;border-bottom:1px solid #ccc;padding-bottom:1mm;}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:6mm;font-size:10.5pt;}'+
    'th{background:#2f2f2f;color:#fff;padding:4px 8px;text-align:left;}'+
    'td{padding:4px 8px;border-bottom:1px solid #e5e7eb;}'+
    '.summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm;margin:5mm 0;}'+
    '.box{border:1.5px solid #ccc;border-radius:5px;padding:4mm;text-align:center;}'+
    '.bval{font-size:18pt;font-weight:700;font-family:monospace;}'+
    '.blbl{font-size:8pt;color:#666;margin-bottom:2mm;}'+
    '@media print{button{display:none;}}'+
    '</style></head><body>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5mm;">'+
      '<div><h1>ТЕМАКС — Равнение на оборота</h1>'+
      '<div style="font-size:11pt;color:#444;">'+esc(currentUser.store_name)+' &nbsp;|&nbsp; '+fmtDate(today())+'</div>'+
      '<div style="font-size:8pt;color:#888;margin-top:1mm;">Статус: '+(z.status==='confirmed'?'✅ Потвърден':'✏️ Чернова')+'</div></div>'+
    '</div>'+
    '<h2>Данни от POS Zoborot</h2>'+
    '<table><tbody>'+
      '<tr><td>Плащане в брой BGN</td><td style="text-align:right;font-family:monospace;">'+((parseFloat(z.cash_bgn)||0).toFixed(2))+'</td></tr>'+
      '<tr><td>Плащане в брой EUR</td><td style="text-align:right;font-family:monospace;">'+((parseFloat(z.cash_eur)||0).toFixed(2))+'</td></tr>'+
      '<tr><td>Плащане с карта EUR</td><td style="text-align:right;font-family:monospace;">'+((parseFloat(z.card_eur)||0).toFixed(2))+'</td></tr>'+
      '<tr><td>Плащане по банков път EUR</td><td style="text-align:right;font-family:monospace;">'+((parseFloat(z.bank_eur)||0).toFixed(2))+'</td></tr>'+
      '<tr><td>Ваучери EUR</td><td style="text-align:right;font-family:monospace;">'+((parseFloat(z.voucheri)||0).toFixed(2))+'</td></tr>'+
      '<tr style="font-weight:700;"><td>POS оборот (без банков път)</td><td style="text-align:right;font-family:monospace;font-size:13pt;">'+pnb.toFixed(2)+' EUR</td></tr>'+
    '</tbody></table>'+
    '<h2>Фискални устройства (ФУ)</h2>'+
    '<table><thead><tr><th>ФУ</th><th style="text-align:right;">Общ оборот</th><th style="text-align:right;">Сторно/Отст.</th><th style="text-align:right;">Чист оборот</th></tr></thead><tbody>'+
    [1,2,3].map(function(n){
      var gr=parseFloat(z['fu'+n+'_gross'])||0;
      var dc=parseFloat(z['fu'+n+'_discount'])||0;
      var net=Math.round((gr-dc)*100)/100;
      return '<tr><td><b>ФУ '+n+'</b></td>'+
        '<td style="text-align:right;font-family:monospace;">'+gr.toFixed(2)+'</td>'+
        '<td style="text-align:right;font-family:monospace;">'+dc.toFixed(2)+'</td>'+
        '<td style="text-align:right;font-family:monospace;font-weight:700;">'+net.toFixed(2)+' EUR</td></tr>';
    }).join('')+
    '<tr style="font-weight:700;"><td colspan="3">Общо ФУ нетен оборот</td><td style="text-align:right;font-family:monospace;font-size:13pt;">'+ftn.toFixed(2)+' EUR</td></tr>'+
    '</tbody></table>'+
    '<h2>Равнение</h2>'+
    '<div class="summary">'+
      '<div class="box"><div class="blbl">POS оборот (без банков път)</div><div class="bval" style="color:#1e40af;">'+pnb.toFixed(2)+' EUR</div></div>'+
      '<div class="box"><div class="blbl">Оборот по фискални устройства</div><div class="bval" style="color:#166534;">'+ftn.toFixed(2)+' EUR</div></div>'+
      '<div class="box" style="border-color:'+razCol+'"><div class="blbl">'+(raz===0?'✅':'⚠️')+' РАЗЛИКА</div>'+
        '<div class="bval" style="color:'+razCol+';">'+(raz<0?'– ':'')+Math.abs(raz).toFixed(2)+' EUR</div></div>'+
    '</div>'+
    '<div style="margin-top:10mm;display:grid;grid-template-columns:1fr 1fr;gap:10mm;">'+
      '<div style="border-top:1px solid #333;padding-top:2mm;font-size:9pt;color:#555;">Изготвил: '+esc(currentUser.display_name||currentUser.email)+'</div>'+
      '<div style="border-top:1px solid #333;padding-top:2mm;font-size:9pt;color:#555;">Управител: ____________________________</div>'+
    '</div>'+
    '<div style="text-align:center;margin-top:6mm;"><button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;padding:8px 24px;border-radius:6px;font-size:11pt;cursor:pointer;">🖨 Принтирай / PDF</button></div>'+
  '</body></html>');
  win.document.close();
  setTimeout(function(){win.focus();},300);
}


/* ═══════════════════════════════════════════════════════════════
   ДОКУМЕНТИ — качване на сканирани отчети
═══════════════════════════════════════════════════════════════ */
var SB_STORAGE = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1';
var BUCKET     = 'kasa-docs';

function uploadKasaDoc(file, reportType, docType, onDone){
  var ext    = file.name.split('.').pop();
  var stamp  = Date.now();
  var path   = currentUser.store_name.replace(/\s+/g,'_')+'/'+today()+'/'+reportType+'_'+docType+'_'+stamp+'.'+ext;
  var reader = new FileReader();
  reader.onload = function(e){
    var arrBuf = e.target.result;
    fetch(SB_STORAGE+'/object/'+BUCKET+'/'+encodeURIComponent(path),{
      method:'POST',
      headers:{
        'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Content-Type':file.type||'application/octet-stream',
        'x-upsert':'true'
      },
      body: arrBuf
    }).then(function(r){
      if(!r.ok){toast('Грешка при качване на файл','#dc2626');return;}
      /* Запази metadata */
      sbPost('kasa_documents',{
        store_name:currentUser.store_name,
        date:today(),
        report_type:reportType,
        doc_type:docType,
        file_name:file.name,
        file_url:path,
        file_size:file.size,
        uploaded_by:currentUser.display_name||currentUser.email
      }).then(function(){
        toast('✅ Документът е качен успешно!');
        if(onDone)onDone();
      });
    }).catch(function(){toast('Грешка при качване','#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}

function getSignedUrl(path, onUrl){
  fetch(SB_STORAGE+'/object/sign/'+BUCKET+'/'+encodeURIComponent(path),{
    method:'POST',
    headers:{
      'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({expiresIn:3600})
  }).then(function(r){return r.json();})
  .then(function(d){
    if(d.signedURL) onUrl('https://xiwkdiqqplgdcrkewgtv.supabase.co'+d.signedURL);
    else onUrl(null);
  }).catch(function(){onUrl(null);});
}

function loadKasaDocs(date, onDone){
  var q='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+date+'&order=created_at.desc';
  sbGet('kasa_documents',q).then(onDone).catch(function(){onDone([]);});
}

/* ─── Рендер секция Документи ───────────────────────────────── */
function renderDocsSection(containerId, reportType, docs){
  var wrap=document.getElementById(containerId);if(!wrap)return;
  var docTypes={z_report:'Z-Четене',storno:'Сторно бележки',discount:'Отстъпки',other:'Друго'};
  var canUpload=['kasa','manager','admin','accounting'].indexOf(currentUser.role)>=0;

  var html='<div class="card" style="margin-top:14px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
      '<div class="card-title" style="margin:0;">📎 Прикачени документи</div>'+
      (canUpload?'<label style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:7px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">'+
        '+ Прикачи <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" multiple style="display:none;" onchange="handleDocUpload(event,''+reportType+'')">'+
      '</label>':'')+ 
    '</div>';

  if(!docs||!docs.length){
    html+='<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">'+
      'Няма прикачени документи. '+(canUpload?'Натисни &quot;+ Прикачи&quot; за да добавиш.':'')+'</div>';
  }else{
    html+='<div style="display:flex;flex-direction:column;gap:6px;">';
    docs.forEach(function(d){
      var icon=d.file_name.match(/\.pdf$/i)?'📄':d.file_name.match(/\.(jpg|jpeg|png|heic)$/i)?'🖼️':'📎';
      var size=d.file_size?'('+Math.round(d.file_size/1024)+' KB)':'';
      html+='<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8fafc;border-radius:7px;border:1px solid #e2e8f0;">'+
        '<span style="font-size:18px;">'+icon+'</span>'+
        '<div style="flex:1;">'+
          '<div style="font-size:12px;font-weight:500;">'+esc(d.file_name)+'</div>'+
          '<div style="font-size:10px;color:#94a3b8;">'+
            (docTypes[d.doc_type]||d.doc_type)+' · '+fmtDate(d.date)+' · '+esc(d.uploaded_by||'')+' '+size+
          '</div>'+
        '</div>'+
        '<button onclick="openDoc(''+esc(d.file_url)+'')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;">Виж</button>'+
      '</div>';
    });
    html+='</div>';
  }
  html+='</div>';
  wrap.innerHTML=html;
}

function handleDocUpload(event, reportType){
  var files=Array.from(event.target.files);
  if(!files.length)return;
  /* Определи тип по избор */
  var type=prompt('Тип документ:\n1 — Z-Четене\n2 — Сторно бележки\n3 — Отстъпки\n4 — Друго\n\nВъведи 1, 2, 3 или 4:');
  var typeMap={'1':'z_report','2':'storno','3':'discount','4':'other'};
  var docType=typeMap[type]||'other';
  var done=0;
  files.forEach(function(file){
    uploadKasaDoc(file, reportType, docType, function(){
      done++;
      if(done===files.length){
        /* Reload docs section */
        loadKasaDocs(today(), function(docs){
          var filtered=docs.filter(function(d){return d.report_type===reportType;});
          renderDocsSection('docs-section-'+reportType, reportType, filtered);
        });
      }
    });
  });
}

function openDoc(path){
  getSignedUrl(path, function(url){
    if(url) window.open(url,'_blank');
    else toast('Грешката при зареждане на документа','#dc2626');
  });
}

/* ─── Добави документи към ПОС view ────────────────────────── */
var _origRenderKasa=renderKasa;
renderKasa=function(){
  _origRenderKasa();
  var todayStr=today();
  /* Добави документи секция след таблицата */
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var page=wrap.querySelector('.page');if(!page)return;
  var docsDiv=document.createElement('div');docsDiv.id='docs-section-pos';
  page.appendChild(docsDiv);
  loadKasaDocs(todayStr,function(docs){
    var filtered=docs.filter(function(d){return d.report_type==='pos';});
    renderDocsSection('docs-section-pos','pos',filtered);
  });

  /* Добави бутон "Готово за проверка" */
  addReadyButton(page, 'pos');
};

/* ─── ГОТОВО ЗА ПРОВЕРКА ────────────────────────────────────── */
function addReadyButton(container, reportType){
  var canReady=['kasa','manager','admin'].indexOf(currentUser.role)>=0;
  if(!canReady)return;
  var btn=document.createElement('div');
  btn.style.cssText='margin-top:14px;display:flex;justify-content:flex-end;';
  btn.innerHTML='<button onclick="markReady()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600;cursor:pointer;">📤 Изпрати за проверка към счетоводство</button>';
  container.appendChild(btn);
}

function markReady(){
  var todayStr=today();
  var reps=kasaReports.filter(function(r){return r.date===todayStr;});
  if(!reps.length){toast('Няма касови отчети за днес','#dc2626');return;}
  var hasDraft=reps.some(function(r){return r.status==='draft';});
  if(hasDraft&&!confirm('Има непотвърдени отчети. Сигурен ли си, че искаш да изпратиш?'))return;

  /* Маркирай всички отчети за деня като ready */
  var promises=reps.map(function(r){
    return sbPatch('kasa_reports','id=eq.'+r.id,{
      ready_at:new Date().toISOString(),
      ready_by:currentUser.display_name||currentUser.email
    });
  });
  Promise.all(promises).then(function(){
    toast('📤 Изпратено за проверка към счетоводство!');
    loadKasa();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ДНЕВЕН ПРЕГЛЕД — за счетоводство и администрация
═══════════════════════════════════════════════════════════════ */
function loadDailyOverview(){
  var wrap=document.getElementById('h-results');
  if(!wrap)return;
  wrap.innerHTML='<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div>';

  var todayStr=today();
  Promise.all([
    sbGet('kasa_reports','date=eq.'+todayStr+'&order=store_name.asc'),
    sbGet('kasa_zoborot','date=eq.'+todayStr+'&order=store_name.asc'),
    sbGet('kasa_documents','date=eq.'+todayStr+'&order=store_name.asc'),
    sbGet('stores','select=name&order=name')
  ]).then(function(results){
    var reports  = Array.isArray(results[0])?results[0]:[];
    var zoborots = Array.isArray(results[1])?results[1]:[];
    var docs     = Array.isArray(results[2])?results[2]:[];
    var stores   = Array.isArray(results[3])?results[3]:[];

    /* Групирай по магазин */
    var storeNames=stores.map(function(s){return s.name;});

    var html='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'+
      '<div style="font-size:16px;font-weight:600;">📅 Дневен преглед — '+fmtDate(todayStr)+'</div>'+
      '<button onclick="printDailyOverview()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">🖨 Разпечатай</button>'+
    '</div>';

    /* Обобщаващи карти */
    var totalStores=storeNames.length;
    var storesWithReports=[...new Set(reports.map(function(r){return r.store_name;}))).length;
    var storesReady=reports.filter(function(r){return r.ready_at;}).length;
    var totalRaz=reports.reduce(function(s,r){return s+(parseFloat(r.razlika)||0);},0);
    var razC=totalRaz===0?'#16a34a':totalRaz<0?'#dc2626':'#d97706';

    html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">'+
      metricCardH('🏪 Магазини',''+storesWithReports+' / '+totalStores,'подали отчет','#2563eb')+
      metricCardH('📤 За проверка',''+storesReady,'изпратени','#16a34a')+
      metricCardH('📎 Документи',''+docs.length,'прикачени','#d97706')+
      metricCardH('💰 Обща разлика',(totalRaz<0?'–':'')+Math.abs(totalRaz).toFixed(2),'EUR',razC)+
    '</div>';

    /* Таблица по магазини */
    html+='<div class="card"><div class="card-title">Статус по магазини</div>'+
      '<div class="tbl-wrap"><table>'+
      '<thead><tr>'+
        '<th>Магазин</th>'+
        '<th style="text-align:center;">ПОС отчети</th>'+
        '<th style="text-align:center;">Равнение</th>'+
        '<th style="text-align:center;">Документи</th>'+
        '<th style="text-align:right;">Разлика</th>'+
        '<th style="text-align:center;">Статус</th>'+
        '<th style="text-align:center;">Изпратено</th>'+
      '</tr></thead><tbody>';

    storeNames.forEach(function(name){
      var storeReps=reports.filter(function(r){return r.store_name===name;});
      var storeZob=zoborots.find(function(z){return z.store_name===name;});
      var storeDocs=docs.filter(function(d){return d.store_name===name;});
      var storeRaz=storeReps.reduce(function(s,r){return s+(parseFloat(r.razlika)||0);},0);
      var razC2=storeRaz===0?'#16a34a':storeRaz<0?'#dc2626':'#d97706';
      var allConfirmed=storeReps.length>0&&storeReps.every(function(r){return r.status==='confirmed';});
      var anyReady=storeReps.some(function(r){return r.ready_at;});
      var readyBy=storeReps.find(function(r){return r.ready_by;});

      var posStatus=!storeReps.length?
        '<span style="color:#94a3b8;font-size:12px;">—</span>':
        storeReps.length+' отчета'+(allConfirmed?' ✅':' ✏️');
      var zobStatus=!storeZob?
        '<span style="color:#94a3b8;font-size:12px;">—</span>':
        storeZob.status==='confirmed'?'✅':'✏️';
      var docStatus=!storeDocs.length?
        '<span style="color:#94a3b8;font-size:12px;">—</span>':
        '📎 '+storeDocs.length;

      var overallStatus=!storeReps.length?
        '<span style="background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⬜ Не е попълнено</span>':
        anyReady?
        '<span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">📤 За проверка</span>':
        '<span style="background:#dbeafe;color:#1e3a5f;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✏️ В процес</span>';

      html+='<tr>'+
        '<td style="font-weight:500;">'+esc(name)+'</td>'+
        '<td style="text-align:center;font-size:12px;">'+posStatus+'</td>'+
        '<td style="text-align:center;font-size:12px;">'+zobStatus+'</td>'+
        '<td style="text-align:center;font-size:12px;">'+docStatus+'</td>'+
        '<td style="text-align:right;font-family:monospace;font-weight:700;color:'+razC2+';">'+
          (storeReps.length?(storeRaz<0?'–':'')+Math.abs(storeRaz).toFixed(2)+' EUR':'—')+'</td>'+
        '<td style="text-align:center;">'+overallStatus+'</td>'+
        '<td style="text-align:center;font-size:11px;color:#94a3b8;">'+
          (readyBy?esc(readyBy.ready_by||''):'—')+'</td>'+
      '</tr>';
    });

    html+='</tbody></table></div></div>';
    wrap.innerHTML=html;
  }).catch(function(e){
    wrap.innerHTML='<div style="color:#dc2626;padding:20px;">Грешка при зареждане.</div>';
  });
}

function metricCardH(label,val,sub,col){
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+col+';">'+
    '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+label+'</div>'+
    '<div style="font-size:24px;font-weight:700;color:'+col+';font-family:DM Mono,monospace;">'+val+'</div>'+
    '<div style="font-size:11px;color:#94a3b8;">'+sub+'</div>'+
  '</div>';
}

function printDailyOverview(){
  toast('🖨 Подготовка на отчет...','#2563eb');
  /* Простото решение — принтира текущия изглед */
  window.print();
}
