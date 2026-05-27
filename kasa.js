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
  return (n<0?'–':'')+Math.abs(n).toFixed(2)+' лв.';
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

  var html='<div class="page">'+
    '<div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+'</div>'+
    kasaTabBar()+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'+
      '<div style="font-size:13px;color:var(--muted);">Днес: <b>'+todayRep.length+'</b> отчета</div>'+
      '<button class="btn btn-green" onclick="openKasaForm(null)">+ Нов ПОС отчет</button>'+
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
      '<div><label class="fl">Общ оборот (лв.)</label><input type="number" step="0.01" class="fi" id="kf-total_turnover" value="'+(r.total_turnover||'')+'" oninput="kasaLiveCalc()" placeholder="0.00"></div>'+
      '<div></div>'+
      '<div><label class="fl">В брой (лв.)</label><input type="number" step="0.01" class="fi" id="kf-cash_turnover" value="'+(r.cash_turnover||'')+'" oninput="kasaLiveCalc()" placeholder="0.00"></div>'+
      '<div><label class="fl">Деб./кредитни (лв.)</label><input type="number" step="0.01" class="fi" id="kf-card_turnover" value="'+(r.card_turnover||'')+'" oninput="kasaLiveCalc()" placeholder="0.00"></div>'+
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
    '<label class="fl">Сума сторна (лв.)</label>'+
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
    rEl.textContent=(razlika<0?'– ':'')+Math.abs(razlika).toFixed(2)+' лв.';
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
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:14px;" id="gl-total-counted">'+totalCounted.toFixed(2)+' лв.</td>'+
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
      '<td style="text-align:right;font-family:DM Mono,monospace;">'+totalInkaso.toFixed(2)+' лв.</td>'+
    '</tr></tbody></table></div></div>'+

    /* Жълти полета — ръчно въвеждане */
    '<div class="card" style="margin-bottom:14px;background:#fffbeb;border-color:#f0c940;">'+
    '<div class="card-title" style="color:#92400e;">⭐ Ръчно въвеждане (жълти полета)</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'+
      '<div><label class="fl">Служебно въведени (лв.)</label>'+
        (isDraft&&canEdit?
          '<input type="number" step="0.01" class="fi" id="gl-slujebno" value="'+(g.slujebno||0)+'" oninput="glavnaLiveCalc()" style="background:#fffbeb;">':
          '<div class="fi" style="background:#f9f8f6;">'+(g.slujebno||0)+'</div>')+
      '</div>'+
      '<div><label class="fl">Наличност SAP (лв.)</label>'+
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
        '<div style="font-size:15px;font-weight:700;font-family:DM Mono,monospace;color:#166534;" id="gl-r-counted">'+totalCounted.toFixed(2)+' лв.</div>'+
      '</div>'+
      '<div style="text-align:center;padding:12px;border-radius:8px;background:#fef9c3;">'+
        '<div style="font-size:10px;color:#92400e;text-transform:uppercase;margin-bottom:4px;">Служебно въведени</div>'+
        '<div style="font-size:15px;font-weight:700;font-family:DM Mono,monospace;color:#92400e;" id="gl-r-slujebno">'+slujebno.toFixed(2)+' лв.</div>'+
      '</div>'+
      '<div style="text-align:center;padding:12px;border-radius:8px;background:#eff6ff;">'+
        '<div style="font-size:10px;color:#1e40af;text-transform:uppercase;margin-bottom:4px;">Наличност SAP</div>'+
        '<div style="font-size:15px;font-weight:700;font-family:DM Mono,monospace;color:#1e40af;" id="gl-r-sap">'+sapBalance.toFixed(2)+' лв.</div>'+
      '</div>'+
      '<div style="text-align:center;padding:12px;border-radius:8px;border:2px solid '+razCol(razlika)+';background:'+(razlika<0?'#fff5f5':razlika>0?'#fffbeb':'#f0fdf4')+';">'+
        '<div style="font-size:10px;text-transform:uppercase;margin-bottom:4px;color:'+razCol(razlika)+';">РАЗЛИКА</div>'+
        '<div style="font-size:20px;font-weight:700;font-family:DM Mono,monospace;color:'+razCol(razlika)+';" id="gl-r-razlika">'+(razlika<0?'– ':'')+Math.abs(razlika).toFixed(2)+' лв.</div>'+
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
  set('gl-total-counted',total,' лв.');
  set('gl-r-counted',total,' лв.');
  set('gl-r-slujebno',slujebno,' лв.');
  set('gl-r-sap',sap,' лв.');
  var rEl=document.getElementById('gl-r-razlika');
  if(rEl){rEl.textContent=(razlika<0?'– ':'')+Math.abs(razlika).toFixed(2)+' лв.';rEl.style.color=razCol(razlika);}
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
