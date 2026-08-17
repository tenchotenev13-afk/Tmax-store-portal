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

var INKASO_DENOM = [500,200,100,50,20,10,5];
var kasaSelectedDate = null;

function yesterday(){
  var d=new Date(); d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}
function kasaActiveDate(){ return kasaSelectedDate || yesterday(); }
function kasaSetDate(d){ kasaSelectedDate=d||null; }

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
  return Math.round((counted-(cash-storna-inkaso))*100)/100; /* В брой - Сторна - Инкасо */
}

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadKasa(){
  var q='order=date.desc,pos_number.asc'+storeQ();
  sbGet('kasa_reports',q).then(function(data){
    kasaReports=Array.isArray(data)?data:[];
    if(kasaView==='pos') renderKasa();
    else renderGlavna();
  }).catch(function(){renderKasa();});
  /* Главна каса за днес */
  var gq='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+kasaActiveDate();
  sbGet('kasa_glavna',gq).then(function(data){
    kasaGlavna=(Array.isArray(data)&&data.length)?data[0]:null;
    if(kasaView==='glavna') renderGlavna();
  }).catch(function(){});
}

/* ─── TABS ──────────────────────────────────────────────────── */
function kasaTab(tab){
  kasaView=tab;
  ['pos','glavna','zoborot','storno'].forEach(function(t){
    var el=document.getElementById('ktab-'+t);
    if(el) el.style.background=t===tab?'#2f2f2f':'#fff',
            el.style.color=t===tab?'#fff':'#64748b';
  });
  if(tab==='pos') renderKasa();
  else if(tab==='glavna'){
    var activeDate=kasaActiveDate();
    var enc=encodeURIComponent(currentUser.store_name);
    Promise.all([
      sbGet('kasa_reports','order=pos_number.asc&date=eq.'+activeDate+'&store_name=eq.'+enc),
      sbGet('kasa_glavna','store_name=eq.'+enc+'&date=eq.'+activeDate)
    ]).then(function(res){
      var fresh=Array.isArray(res[0])?res[0]:[];
      var other=kasaReports.filter(function(r){return r.date!==activeDate;});
      kasaReports=other.concat(fresh);
      kasaGlavna=(Array.isArray(res[1])&&res[1].length)?res[1][0]:null;
      renderGlavna();
    }).catch(function(){renderGlavna();});
  }
  else if(tab==='zoborot'){loadZoborot();}
  else if(tab==='storno'){loadStorno();}
}

function kasaTabBar(){
  var canGlavna=['manager','admin','kasa'].indexOf(currentUser.role)>=0;
  if(!canGlavna) return '';
  var active=kasaView||'pos';
  function tabStyle(t){
    return t===active ? 'background:#2f2f2f;color:#fff;' : 'background:#fff;color:#64748b;';
  }
  return '<div style="display:flex;gap:0;margin-bottom:18px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">'+
    '<button id="ktab-pos" onclick="kasaTab(\'pos\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;'+tabStyle('pos')+'">📋 ПОС Отчети</button>'+
    '<button id="ktab-glavna" onclick="kasaTab(\'glavna\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;'+tabStyle('glavna')+'">🏦 Главна каса</button>'+
    '<button id="ktab-zoborot" onclick="kasaTab(\'zoborot\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;'+tabStyle('zoborot')+'">📊 Равнение</button>'+
    '<button id="ktab-storno" onclick="kasaTab(\'storno\')" style="flex:1;padding:9px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;'+tabStyle('storno')+'">🧾 Сторно бележки</button>'+
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
  var canConfirm=['manager','admin','kasa'].indexOf(currentUser.role)>=0;
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
    html+='<div class="card">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">';
    html+='<div class="card-title" style="margin:0;">📜 История ('+histRep.length+')</div>';
    html+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
    html+='<input type="date" id="hist-date-filter" style="border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;">';
    html+='<select id="hist-status-filter" style="border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;">';
    html+='<option value="all">— Всички статуси —</option>';
    html+='<option value="draft">✏️ Чернова</option>';
    html+='<option value="confirmed">✅ Потвърден</option>';
    html+='<option value="returned">↩ Върнат</option>';
    html+='</select>';
    html+='<button onclick="filterHistRep()" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:5px 14px;font-size:12px;cursor:pointer;">Търси</button>';
    html+='<button onclick="clearHistFilter()" style="border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;">✕</button>';
    html+='</div></div>';
    html+='<div id="hist-table-wrap">'+renderHistTable(histRep)+'</div>';
    html+='</div>';
  }
  html+='<div id="docs-section-pos"></div>';
  html+='<div id="ready-btn-wrap" style="display:flex;justify-content:flex-end;padding-bottom:20px;"></div>';
  html+='</div>';
  wrap.innerHTML=html;
  if(typeof initKasaDocsView==='function') setTimeout(initKasaDocsView, 50);
}

/* ─── ПОС ФОРМА ─────────────────────────────────────────────── */
function openKasaForm(report){
  kasaEditId=report?report.id:null;
  var r=report||{};
  kasaSetDate(r.date||kasaActiveDate()); /* синхронизира споделената дата за POS/Главна каса/Равнение, дори при нов отчет */
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
      '<div><label class="fl">Дата</label><input type="date" class="fi" id="kf-date" value="'+(r.date||kasaActiveDate())+'" oninput="kasaSetDate(this.value)"></div>'+
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
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">'+
      '<div style="font-size:13px;color:#1e40af;font-weight:600;">💵 Обща парична наличност (налични + инкасо)</div>'+
      '<div id="kf-total-nalichnost" style="font-size:18px;font-weight:700;font-family:DM Mono,monospace;color:#1e40af;">0.00</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px;">'+
      '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:11px;color:#64748b;">В брой (ПОС)</div><div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;" id="kf-r-cash">0.00</div></div>'+
      '<div style="background:#fff5f5;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:11px;color:#64748b;">– Сторна</div><div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;color:#dc2626;" id="kf-r-storna">0.00</div></div>'+
      '<div style="background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:11px;color:#64748b;">= Нето</div><div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;color:#16a34a;" id="kf-r-net">0.00</div></div>'+
      '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:11px;color:#64748b;">– Инкасо</div><div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;" id="kf-r-inkaso">0.00</div></div>'+
      '<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:11px;color:#64748b;">Налични (броени)</div><div style="font-size:16px;font-weight:700;font-family:DM Mono,monospace;" id="kf-r-counted">0.00</div></div>'+
    '</div>'+
    '<div id="kf-res-box">'+
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
  /* 1. КУПЮРИ — сумира всички банкноти */
  var counted = 0;
  ALL_DENOM.forEach(function(v){
    var key = DENOM_KEY[v];
    var el  = document.getElementById('kf-'+key);
    var qty = el ? (parseInt(el.value) || 0) : 0;
    var sub = Math.round(qty * v * 100) / 100;
    counted = Math.round((counted + sub) * 100) / 100;
    var sEl = document.getElementById('kf-sub-'+key);
    if (sEl) sEl.textContent = sub.toFixed(2);
  });
  var ctEl = document.getElementById('kf-counted-total');
  if (ctEl) ctEl.textContent = counted.toFixed(2);

  /* 2. ИНКАСО — сумира изведените банкноти */
  var inkaso = 0;
  INKASO_DENOM.forEach(function(v){
    var el  = document.getElementById('kf-inkaso_' + v);
    var qty = el ? (parseInt(el.value) || 0) : 0;
    var sub = Math.round(qty * v * 100) / 100;
    inkaso  = Math.round((inkaso + sub) * 100) / 100;
    var sEl = document.getElementById('kf-sub-inkaso_' + v);
    if (sEl) sEl.textContent = sub.toFixed(2);
  });
  var itEl = document.getElementById('kf-inkaso-total');
  if (itEl) itEl.textContent = inkaso.toFixed(2);

  /* 3. СТОРНА и В БРОЙ */
  var storna = parseFloat(document.getElementById('kf-storna')      ? document.getElementById('kf-storna').value      : 0) || 0;
  var cash   = parseFloat(document.getElementById('kf-cash_turnover') ? document.getElementById('kf-cash_turnover').value : 0) || 0;

  /* 4. ИЗЧИСЛЕНИЯ */
  var net     = Math.round((cash - storna) * 100) / 100;          /* В брой нето = ПОС - Сторна */
  var result  = Math.round((net - inkaso) * 100) / 100;           /* Очаквани налични */
  var razlika = Math.round((counted - result) * 100) / 100;       /* Разлика */
  var total   = Math.round((counted + inkaso) * 100) / 100;       /* Обща налична */

  /* 5. ПОКАЖИ РЕЗУЛТАТИТЕ */
  function show(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = (isNaN(val) ? 0 : val).toFixed(2);
  }
  show('kf-r-cash',    cash);
  show('kf-r-storna',  storna);
  show('kf-r-net',     net);
  show('kf-r-inkaso',  inkaso);
  show('kf-r-counted', counted);

  var tcEl = document.getElementById('kf-total-nalichnost');
  if (tcEl) tcEl.textContent = (isNaN(total) ? 0 : total).toFixed(2);

  /* 6. РАЗЛИКА с цвят */
  var rEl = document.getElementById('kf-r-razlika');
  if (rEl) {
    var col = razlika === 0 ? '#16a34a' : razlika < 0 ? '#dc2626' : '#d97706';
    var bg  = razlika < 0 ? '#fff5f5' : razlika > 0 ? '#fffbeb' : '#f0fdf4';
    rEl.textContent = (razlika < 0 ? '– ' : '') + Math.abs(razlika).toFixed(2) + ' EUR';
    rEl.style.color = col;
    var box = document.getElementById('kf-res-box');
    if (box) { box.style.borderColor = col; box.style.background = bg; }
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
  var razlika=Math.round((counted-(cash-storna-inkaso))*100)/100; /* В брой - Сторна - Инкасо */

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
    kasaSetDate(p.date); /* гарантира, че Главна каса/Равнение показват СЪЩАТА дата, за която е отчетът */
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
  var todayStr=kasaActiveDate();
  var todayRep=kasaReports.filter(function(r){return r.date===todayStr;});
  var g=kasaGlavna||{};
  var isDraft=!g.id||(g.status==='draft');
  var canEdit=['kasa','manager','admin','accounting'].indexOf(currentUser.role)>=0;
  /* Manager/kasa/admin могат да пишат САМО докато Главна каса е чернова (незаключена) */
  var canInput=['kasa','manager','admin'].indexOf(currentUser.role)>=0 && isDraft;
  var canConfirmGlavna=['kasa','manager','admin'].indexOf(currentUser.role)>=0;
  var canUnlockGlavna=['admin','accounting'].indexOf(currentUser.role)>=0;

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
      var glInput=canInput?
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

    /* Инкасо summary — деноминации като ориентир */
    '<div class="card" style="margin-bottom:14px;border-top:3px solid #d97706;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'+
      '<div class="card-title" style="margin:0;">📤 Изведени за инкасо — по деноминации</div>'+
      '<div style="font-size:11px;color:#d97706;font-weight:600;">Ориентир за инкасиране</div>'+
    '</div>'+
    '<div class="tbl-wrap"><table style="font-size:12px;">'+
    '<thead><tr>'+
      '<th style="text-align:right;">Ном.</th>'+
      todayRep.map(function(r){return '<th style="text-align:center;">ПОС '+r.pos_number+'</th>';}).join('')+
      '<th style="text-align:center;">Общо бр.</th>'+
      '<th style="text-align:right;background:#fef3c7;">Сума EUR</th>'+
    '</tr></thead><tbody>'+
    (function(){
      var rows='';var tot=0;
      INKASO_DENOM.forEach(function(v){
        var qtys=todayRep.map(function(r){return parseInt(r['inkaso_'+v])||0;});
        var total=qtys.reduce(function(a,b){return a+b;},0);
        var sum=Math.round(total*v*100)/100; tot+=sum;
        rows+='<tr style="border-bottom:1px solid #f1f5f9;">'+
          '<td style="text-align:right;padding:5px 10px;font-weight:700;">'+v+' EUR</td>'+
          qtys.map(function(q){return '<td style="text-align:center;padding:5px 8px;font-family:DM Mono,monospace;">'+(q||'—')+'</td>';}).join('')+
          '<td style="text-align:center;font-family:DM Mono,monospace;font-weight:600;">'+total+'</td>'+
          '<td style="text-align:right;padding:5px 10px;font-family:DM Mono,monospace;background:#fffbeb;font-weight:'+(total>0?'700':'400')+';color:'+(total>0?'#92400e':'#94a3b8')+';font-size:'+(total>0?'13':'12')+'px;">'+sum.toFixed(2)+'</td>'+
        '</tr>';
      });
      tot=Math.round(tot*100)/100;
      rows+='<tr style="border-top:2px solid #d97706;background:#fef3c7;font-weight:700;">'+
        '<td colspan="'+(1+todayRep.length)+'" style="padding:6px 10px;">ОБЩО ЗА ИНКАСО</td>'+
        '<td></td>'+
        '<td style="text-align:right;padding:6px 10px;font-family:DM Mono,monospace;font-size:14px;">'+tot.toFixed(2)+' EUR</td>'+
      '</tr>';
      return rows;
    })()+
    '</tbody></table></div></div>'+

    /* Жълти полета — ръчно въвеждане */
    '<div class="card" style="margin-bottom:14px;background:#fffbeb;border-color:#f0c940;">'+
    '<div class="card-title" style="color:#92400e;">⭐ Ръчно въвеждане (жълти полета)</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'+
      '<div><label class="fl">Служебно въведени (EUR)</label>'+
        (canInput?
          '<input type="number" step="0.01" class="fi" id="gl-slujebno" value="'+(g.slujebno||0)+'" oninput="glavnaLiveCalc()" style="background:#fffbeb;">':
          '<div class="fi" style="background:#f9f8f6;">'+(g.slujebno||0)+'</div>')+
      '</div>'+
      '<div><label class="fl">Наличност SAP (EUR)</label>'+
        (canInput?
          '<input type="number" step="0.01" class="fi" id="gl-sap" value="'+(g.sap_balance||0)+'" oninput="glavnaLiveCalc()" style="background:#fffbeb;">':
          '<div class="fi" style="background:#f9f8f6;">'+(g.sap_balance||0)+'</div>')+
      '</div>'+
      '<div style="display:flex;flex-direction:column;justify-content:flex-end;gap:6px;">'+
        (canInput?
          '<div style="display:flex;gap:6px;">'+
            '<button onclick="saveGlavna()" class="btn btn-green" style="margin-top:20px;">💾 Запази</button>'+
            (g.id&&canConfirmGlavna?'<button onclick="confirmGlavna()" style="margin-top:20px;border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;">✅ Потвърди</button>':'')+
          '</div>':
          '<div style="display:flex;align-items:center;gap:8px;margin-top:20px;">'+
            '<span style="font-size:12px;color:#16a34a;font-weight:600;">✅ Потвърдена — заключена</span>'+
            (canUnlockGlavna?'<button onclick="unlockGlavna()" style="border:1px solid #d97706;background:#fffbeb;color:#d97706;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">🔓 Разключи</button>':'')+
          '</div>')+
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
  var todayStr=kasaActiveDate();
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
  if(kasaGlavna&&kasaGlavna.status==='confirmed'){toast('Потвърдената Главна каса не може да се редактира — първо я разключи','#dc2626');return;}
  var p={store_name:currentUser.store_name,date:kasaActiveDate(),status:'draft'};
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
    var gq='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+kasaActiveDate();
    sbGet('kasa_glavna',gq).then(function(data){
      kasaGlavna=(Array.isArray(data)&&data.length)?data[0]:null;
      renderGlavna();
    });
  });
}

function confirmGlavna(){
  if(!kasaGlavna||!kasaGlavna.id){toast('Първо запази Главна каса','#dc2626');return;}
  if(kasaGlavna.status==='confirmed'){toast('Вече е потвърдена','#d97706');return;}
  if(!confirm('Потвърди Главна каса? След потвърждението не може да се редактира.'))return;
  sbPatch('kasa_glavna','id=eq.'+kasaGlavna.id,{
    status:'confirmed',
    confirmed_at:new Date().toISOString(),
    confirmed_by:currentUser.display_name||currentUser.email
  }).then(function(res){
    if(!res.ok){toast('Грешка при потвърждаване','#dc2626');return;}
    toast('✅ Главна каса е потвърдена и заключена!');
    var gq='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+kasaActiveDate();
    sbGet('kasa_glavna',gq).then(function(data){
      kasaGlavna=(Array.isArray(data)&&data.length)?data[0]:null;
      renderGlavna();
    });
  });
}

function unlockGlavna(){
  if(!kasaGlavna||!kasaGlavna.id)return;
  if(!confirm('Разключи Главна каса за редакция? Статусът ще се върне на Чернова.'))return;
  sbPatch('kasa_glavna','id=eq.'+kasaGlavna.id,{status:'draft',confirmed_at:null,confirmed_by:null}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('🔓 Главна каса е разключена за редакция.');
    var gq='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+kasaActiveDate();
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
  var todayStr=kasaActiveDate();
  var reps=kasaReports.filter(function(r){return r.date===todayStr;});

  if(!reps.length){toast('Няма отчети за тази дата','#dc2626');return;}

  var enc2=encodeURIComponent(currentUser.store_name);
  var zq='store_name=eq.'+enc2+'&date=eq.'+todayStr+'&order=created_at.desc';
  var gq='store_name=eq.'+enc2+'&date=eq.'+todayStr;
  var dq='store_name=eq.'+enc2+'&date=eq.'+todayStr+'&order=created_at.asc';
  /* Зареждаме zoborot, glavna и документи директно от базата */
  Promise.all([
    sbGet('kasa_zoborot',zq),
    sbGet('kasa_glavna',gq),
    sbGet('kasa_documents',dq)
  ]).then(function(res){
    zoborotData=(Array.isArray(res[0])&&res[0].length)?res[0][0]:null;
    var gl=(Array.isArray(res[1])&&res[1].length)?res[1][0]:null;
    var g=gl||{};
    var docs=Array.isArray(res[2])?res[2]:[];
    _doPrintKasaReport(todayStr,reps,gl,g,docs);
  }).catch(function(e){
    console.error('Print load error:',e);
    _doPrintKasaReport(todayStr,reps,null,{},[]);
  });
}

function _doPrintKasaReport(todayStr,reps,gl,g,docs){

  var BILLS=[500,200,100,50,20,10,5,2,1];
  var COINS=[0.5,0.2,0.1,0.05,0.02,0.01];
  var INKASO_D=[500,200,100,50,20,10,5];
  var DK={'500':'bills_500','200':'bills_200','100':'bills_100','50':'bills_50',
          '20':'bills_20','10':'bills_10','5':'bills_5','2':'bills_2','1':'bills_1',
          '0.5':'coins_50','0.2':'coins_20','0.1':'coins_10',
          '0.05':'coins_5','0.02':'coins_2','0.01':'coins_1'};

  function fm(v){var n=parseFloat(v)||0;return(n<0?'– ':'')+Math.abs(n).toFixed(2)+' EUR';}
  function rc(v){var n=parseFloat(v)||0;return n===0?'razlika-pos':n<0?'razlika-neg':'razlika-warn';}
  function statusTag(s){
    if(s==='confirmed')return '<span class="tag tag-confirmed">✅ Потвърден</span>';
    if(s==='returned') return '<span class="tag tag-returned">↩ Върнат за корекция</span>';
    return '<span class="tag tag-draft">✏️ Чернова</span>';
  }
  function calcCounted2(r){
    var s=0; BILLS.concat(COINS).forEach(function(v){s+=Math.round((parseInt(r[DK[String(v)]])||0)*v*100)/100;});
    return Math.round(s*100)/100;
  }
  function calcInk2(r){
    var s=0; INKASO_D.forEach(function(v){s+=(parseInt(r['inkaso_'+v])||0)*v;});
    return Math.round(s*100)/100;
  }

  var tTurn=0,tCash=0,tCard=0,tRaz=0,tInkaso=0;
  reps.forEach(function(r){
    tTurn+=parseFloat(r.total_turnover)||0; tCash+=parseFloat(r.cash_turnover)||0;
    tCard+=parseFloat(r.card_turnover)||0;
    tRaz+=parseFloat(r.razlika)||0; tInkaso+=calcInk2(r);
  });

  /* ПОС детайл */
  var posHTML=reps.map(function(r){
    var ink=calcInk2(r); var counted=calcCounted2(r); var raz=parseFloat(r.razlika)||0;
    return '<div class="card">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
        '<h3>ПОС '+esc(String(r.pos_number||''))+' — Каса '+esc(String(r.kasa_number||''))+' — '+esc(r.cashier_name||'')+'</h3>'+
        statusTag(r.status)+
      '</div>'+
      '<div class="grid3" style="margin-bottom:10px;">'+
        '<div class="metric"><div class="metric-lbl">Общ оборот</div><div class="metric-val">'+fm(r.total_turnover)+'</div></div>'+
        '<div class="metric"><div class="metric-lbl">В брой</div><div class="metric-val">'+fm(r.cash_turnover)+'</div></div>'+
        '<div class="metric"><div class="metric-lbl">Карта</div><div class="metric-val">'+fm(r.card_turnover)+'</div></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div><h3>Отчетени купюри</h3><table><thead><tr><th>Ном.</th><th>Брой</th><th>Сума</th></tr></thead><tbody>'+
        BILLS.concat(COINS).map(function(v){
          var k=DK[String(v)]; var qty=parseInt(r[k])||0; if(!qty)return '';
          return '<tr><td>'+v+' EUR</td><td style="text-align:center;font-family:monospace;">'+qty+'</td>'+
            '<td style="text-align:right;font-family:monospace;">'+(Math.round(qty*v*100)/100).toFixed(2)+'</td></tr>';
        }).join('')+
        '<tr style="font-weight:700;background:#f0fdf4;"><td colspan="2">Общо налични</td>'+
          '<td style="text-align:right;font-family:monospace;">'+counted.toFixed(2)+'</td></tr>'+
        '</tbody></table></div>'+
        '<div><h3>Инкасо & Резултат</h3>'+
        '<table><thead><tr><th>Ном.</th><th>Брой</th><th>Сума</th></tr></thead><tbody>'+
        INKASO_D.map(function(v){
          var qty=parseInt(r['inkaso_'+v])||0; if(!qty)return '';
          return '<tr><td>'+v+' EUR</td><td style="text-align:center;">'+qty+'</td>'+
            '<td style="text-align:right;font-family:monospace;">'+(qty*v).toFixed(2)+'</td></tr>';
        }).join('')+
        '<tr style="font-weight:700;"><td colspan="2">Общо инкасо</td>'+
          '<td style="text-align:right;font-family:monospace;">'+ink.toFixed(2)+'</td></tr>'+
        '</tbody></table>'+
        '<table style="margin-top:8px;"><tbody>'+
        '<tr><td>Сторна</td><td style="text-align:right;font-family:monospace;">'+fm(r.storna_total)+'</td></tr>'+
        '<tr><td>В брой (отчет)</td><td style="text-align:right;font-family:monospace;">'+fm(r.cash_turnover)+'</td></tr>'+
        '<tr><td>Налични (броени)</td><td style="text-align:right;font-family:monospace;">'+fm(r.counted_cash)+'</td></tr>'+
        '<tr style="font-weight:700;border-top:2px solid #e2e8f0;"><td>РАЗЛИКА</td>'+
          '<td style="text-align:right;font-family:monospace;" class="'+rc(raz)+'">'+fm(raz)+'</td></tr>'+
        '</tbody></table></div>'+
      '</div></div>';
  }).join('');

  /* Главна каса */
  /* allCounted = купюри от всички ПОС + Главна каса */
  var allCounted=0;
  BILLS.concat(COINS).forEach(function(v){
    var k=DK[String(v)];
    var posQty=0;reps.forEach(function(r){posQty+=parseInt(r[k])||0;});
    var glQty=gl?(parseInt(g[k])||0):0;
    allCounted=Math.round((allCounted+(posQty+glQty)*v)*100)/100;
  });
  var glRazlika=Math.round((allCounted+(parseFloat(g.slujebno)||0)-(parseFloat(g.sap_balance)||0))*100)/100;
  var glHTML=gl?'<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
      '<h3 style="margin:0;">Главна каса</h3>'+statusTag(g.status||'draft')+
    '</div>'+
    '<div class="grid2">'+
      '<div><table><thead><tr><th>Ном.</th><th>Брой</th><th>Сума</th></tr></thead><tbody>'+
      BILLS.concat(COINS).map(function(v){
        var k=DK[String(v)]; var qty=parseInt(g[k])||0; if(!qty)return '';
        return '<tr><td>'+v+' EUR</td><td style="text-align:center;">'+qty+'</td>'+
          '<td style="text-align:right;font-family:monospace;">'+(Math.round(qty*v*100)/100).toFixed(2)+'</td></tr>';
      }).join('')+
      '<tr style="font-weight:700;background:#f0fdf4;"><td colspan="2">Главна налични</td>'+
        '<td style="text-align:right;font-family:monospace;">'+fm(g.counted_cash)+'</td></tr>'+
      '</tbody></table></div>'+
      '<div><table><tbody>'+
      '<tr><td>Общо налични (ПОС + Главна)</td><td style="text-align:right;font-family:monospace;">'+fm(allCounted)+'</td></tr>'+
      '<tr><td>Служебно въведени</td><td style="text-align:right;font-family:monospace;">'+fm(g.slujebno)+'</td></tr>'+
      '<tr><td>Наличност SAP</td><td style="text-align:right;font-family:monospace;">'+fm(g.sap_balance)+'</td></tr>'+
      '<tr style="font-weight:700;border-top:2px solid #e2e8f0;"><td>РАЗЛИКА</td>'+
        '<td style="text-align:right;font-family:monospace;" class="'+rc(glRazlika)+'">'+fm(glRazlika)+'</td></tr>'+
      '</tbody></table></div>'+
    '</div></div>':
    '<div class="card" style="color:#94a3b8;text-align:center;padding:20px;">Главна каса — не е попълнена</div>';

  /* Купюрен опис обобщен */
  var ALL_D2=BILLS.concat(COINS);
  var grandTotalDenom=0;
  var denomSummaryHTML='<div class="card"><h2>💵 Отчетени купюри по ПОС + Главна каса</h2>'+
    '<table><thead><tr>'+
    '<th>Ном.</th>'+
    reps.map(function(r){return '<th style="text-align:center;">ПОС '+esc(String(r.pos_number||''))+
      '<br><span style="font-weight:400;font-size:8pt;">'+esc(r.cashier_name||'')+'</span></th>';}).join('')+
    (gl?'<th style="text-align:center;background:#92400e;color:#fff;">Главна</th>':'')+
    '<th style="text-align:center;">Общо бр.</th>'+
    '<th style="text-align:right;">Сума</th>'+
    '</tr></thead><tbody>';
  ALL_D2.forEach(function(v){
    var k=DK[String(v)];
    var posQtys=reps.map(function(r){return parseInt(r[k])||0;});
    var posTotal=posQtys.reduce(function(a,b){return a+b;},0);
    var glQ=gl?(parseInt(g[k])||0):0;
    var total=posTotal+glQ; var sum=Math.round(total*v*100)/100;
    grandTotalDenom=Math.round((grandTotalDenom+sum)*100)/100;
    if(total===0)return;
    denomSummaryHTML+='<tr>'+
      '<td style="text-align:right;font-weight:600;font-family:monospace;">'+v+'</td>'+
      posQtys.map(function(q){return '<td style="text-align:center;font-family:monospace;">'+(q||'—')+'</td>';}).join('')+
      (gl?'<td style="text-align:center;font-family:monospace;color:#92400e;">'+(glQ||'—')+'</td>':'')+
      '<td style="text-align:center;font-weight:700;font-family:monospace;">'+total+'</td>'+
      '<td style="text-align:right;font-family:monospace;">'+sum.toFixed(2)+' EUR</td>'+
    '</tr>';
  });
  denomSummaryHTML+=
    '<tr style="border-top:2px solid #0f172a;background:#f0fdf4;font-weight:700;">'+
      '<td style="padding:6px 8px;">ОБЩА КАСОВА НАЛИЧНОСТ</td>'+
      reps.map(function(){return '<td></td>';}).join('')+
      (gl?'<td></td>':'')+
      '<td></td>'+
      '<td style="text-align:right;font-family:monospace;font-size:12pt;color:#0f172a;">'+grandTotalDenom.toFixed(2)+' EUR</td>'+
    '</tr>'+
  '</tbody></table></div>';

  /* Равнение */
  var zob=zoborotData||null;
  var zobHTML=zob?'<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
      '<h3 style="margin:0;">Равнение на оборота (POS Zoborot)</h3>'+statusTag(zob.status||'draft')+
    '</div>'+
    '<div class="grid2">'+
      '<div><h3>POS данни</h3><table><tbody>'+
      '<tr><td>В брой EUR (BGN)</td><td style="text-align:right;font-family:monospace;">'+fm(zob.cash_bgn)+'</td></tr>'+
      '<tr><td>В брой EUR</td><td style="text-align:right;font-family:monospace;">'+fm(zob.cash_eur)+'</td></tr>'+
      '<tr><td>Карта EUR</td><td style="text-align:right;font-family:monospace;">'+fm(zob.card_eur)+'</td></tr>'+
      '<tr><td>Банков път EUR</td><td style="text-align:right;font-family:monospace;">'+fm(zob.bank_eur)+'</td></tr>'+
      '<tr><td>Ваучери EUR</td><td style="text-align:right;font-family:monospace;">'+fm(zob.voucheri)+'</td></tr>'+
      '<tr style="font-weight:700;"><td>POS оборот (без банков)</td><td style="text-align:right;font-family:monospace;">'+fm(zob.pos_no_bank)+'</td></tr>'+
      '</tbody></table></div>'+
      '<div><h3>Фискални устройства</h3>'+
      '<table><thead><tr><th>ФУ</th><th>Общ</th><th>Сторно</th><th>Чист</th></tr></thead><tbody>'+
      [1,2,3].map(function(n){
        return '<tr><td><b>ФУ '+n+'</b></td>'+
          '<td style="font-family:monospace;">'+fm(zob['fu'+n+'_gross'])+'</td>'+
          '<td style="font-family:monospace;">'+fm(zob['fu'+n+'_discount'])+'</td>'+
          '<td style="font-family:monospace;font-weight:700;">'+fm(zob['fu'+n+'_net'])+'</td></tr>';
      }).join('')+
      '<tr style="font-weight:700;border-top:2px solid #e2e8f0;"><td colspan="3">Общо ФУ нетен</td>'+
        '<td style="font-family:monospace;">'+fm(zob.fu_total_net)+'</td></tr>'+
      '</tbody></table>'+
      '<div style="margin-top:10px;padding:10px;border-radius:6px;border:2px solid '+(parseFloat(zob.razlika)===0?'#16a34a':'#dc2626')+';text-align:center;">'+
        '<div style="font-size:8.5pt;text-transform:uppercase;color:#6b7280;">РАЗЛИКА</div>'+
        '<div style="font-size:16pt;font-weight:700;font-family:monospace;" class="'+rc(zob.razlika)+'">'+fm(zob.razlika)+'</div>'+
      '</div>'+
    '</div></div>':
    '<div class="card" style="color:#94a3b8;text-align:center;padding:20px;">Равнение — не е попълнено</div>';

  /* Документи */
  var docsHTML = '';
  if(docs && docs.length){
    docsHTML = '<h2>📎 Документи</h2><div class="card">';
    docs.forEach(function(d){
      var isPdf=/\.pdf$/i.test(d.file_name||'');
      docsHTML+='<div class="doc-item">';
      docsHTML+='<span style="font-size:18px;">'+(isPdf?'📄':'🖼️')+'</span>';
      docsHTML+='<div style="flex:1;"><div style="font-size:10pt;font-weight:500;">'+esc(d.file_name||'')+'</div>';
      docsHTML+='<div style="font-size:8.5pt;color:#6b7280;">'+esc(d.doc_type||'')+' · '+esc(d.uploaded_by||'')+'</div></div>';
      docsHTML+='<button onclick="openDocFromPrint(\''+esc(d.file_url)+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:4px;padding:3px 10px;font-size:9pt;cursor:pointer;">Виж</button>';
      docsHTML+='</div>';
    });
    docsHTML += '</div>';
  }

  var win=window.open('','_blank','width=1100,height=800');
  win.document.write('<html><head><meta charset="UTF-8">'+
    '<title>Касов отчет — '+esc(currentUser.store_name)+' — '+fmtDate(todayStr)+'</title>'+
    '<style>'+
    '@page{size:A4;margin:12mm;}'+
    '*{box-sizing:border-box;margin:0;padding:0;}'+
    'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;background:#f8fafc;}'+
    '.wrap{max-width:1050px;margin:0 auto;padding:16px;}'+
    '.header{background:#2f2f2f;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}'+
    'h2{font-size:13pt;margin:14px 0 6px;color:#2f2f2f;border-bottom:2px solid #e2e8f0;padding-bottom:4px;}'+
    'h3{font-size:11pt;margin:10px 0 4px;color:#374151;}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9.5pt;}'+
    'th{background:#2f2f2f;color:#fff;padding:4px 8px;text-align:left;font-size:9pt;}'+
    'td{padding:3px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;}'+
    'tr:nth-child(even) td{background:#f9fafb;}'+
    '.card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:12px;}'+
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}'+
    '.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}'+
    '.metric{border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center;}'+
    '.metric-val{font-size:16pt;font-weight:700;font-family:monospace;}'+
    '.metric-lbl{font-size:8pt;color:#6b7280;margin-bottom:4px;}'+
    '.tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9pt;font-weight:600;}'+
    '.tag-draft{background:#fef3c7;color:#92400e;}'+
    '.tag-confirmed{background:#dcfce7;color:#14532d;}'+
    '.tag-returned{background:#fee2e2;color:#991b1b;}'+
    '.razlika-pos{color:#16a34a;}.razlika-neg{color:#dc2626;}.razlika-warn{color:#d97706;}'+
    '.doc-item{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f8fafc;border-radius:5px;margin-bottom:4px;border:1px solid #e2e8f0;}'+
    '@media print{.no-print{display:none!important;}button{display:none!important;}}'+
    '</style></head><body><div class="wrap">'+
    '<div class="header">'+
      '<div>'+
        '<div style="font-size:14pt;font-weight:700;">📋 Касов отчет — '+esc(currentUser.store_name)+'</div>'+
        '<div style="font-size:10pt;color:#9ca3af;margin-top:2px;">'+
          fmtDate(todayStr)+' · '+reps.length+' ПОС отчета · Изготвен: '+
          new Date().toLocaleString('bg-BG')+' от '+esc(currentUser.display_name||currentUser.email)+
        '</div>'+
      '</div>'+
      '<div class="no-print">'+
        '<button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:7px 14px;font-size:10pt;cursor:pointer;">🖨 Принтирай / PDF</button>'+
      '</div>'+
    '</div>'+
    '<div class="grid3" style="margin-bottom:14px;">'+
      '<div class="metric"><div class="metric-lbl">Общ оборот</div><div class="metric-val">'+fm(tTurn)+'</div></div>'+
      '<div class="metric"><div class="metric-lbl">Обща разлика ПОС</div><div class="metric-val '+rc(tRaz)+'">'+fm(tRaz)+'</div></div>'+
      '<div class="metric"><div class="metric-lbl">Общо инкасо</div><div class="metric-val">'+fm(tInkaso)+'</div></div>'+
    '</div>'+
    '<h2>ПОС Отчети</h2>'+posHTML+
    '<h2>Главна каса</h2>'+glHTML+
    denomSummaryHTML+
    '<h2>Равнение на оборота</h2>'+zobHTML+
    docsHTML+
    '</div>'+
    '<script>function openDocFromPrint(path){var enc=path.split("/").map(function(s){return encodeURIComponent(s);}).join("/");fetch("https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1/object/sign/kasa-docs/"+enc,{method:"POST",headers:{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA","Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})}).then(function(r){return r.json();}).then(function(d){if(d.signedURL)window.open("https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1"+d.signedURL,"_blank");else alert("Грешка: "+JSON.stringify(d));}).catch(function(e){alert(e);});}<\/script>'+
    '</body></html>');
  win.document.close();
  setTimeout(function(){win.focus();},300);
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



/* ─── ИСТОРИЯ ФИЛТРИ ────────────────────────────────────────── */
function renderHistTable(rows) {
  if (!rows.length) return '<div style="text-align:center;padding:20px;color:#94a3b8;">Няма записи.</div>';
  var canConfirm = ['manager','admin','kasa'].indexOf(currentUser.role) >= 0;
  var h = '<div class="tbl-wrap"><table>'+
    '<thead><tr><th>Дата</th><th>ПОС</th><th>Касиер</th><th>В брой</th><th>Инкасо</th><th>Налични</th><th>Разлика</th><th>Статус</th><th></th></tr></thead><tbody>';
  rows.slice(0,60).forEach(function(r){
    var canEdit = r.status==='draft' || r.status==='returned';
    var statusLabel = r.status==='confirmed'
      ? '<span style="background:#dcfce7;color:#14532d;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">✅ Потвърден</span>'
      : r.status==='returned'
      ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">↩ Върнат</span>'
      : '<span style="background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">✏️ Чернова</span>';
    h += '<tr>'+
      '<td>'+fmtDate(r.date)+'</td>'+
      '<td>ПОС '+esc(String(r.pos_number||''))+'</td>'+
      '<td>'+esc(r.cashier_name||'')+'</td>'+
      '<td>'+fmtMoney(r.cash_turnover)+'</td>'+
      '<td>'+fmtMoney(calcInkaso(r))+'</td>'+
      '<td>'+fmtMoney(r.counted_cash)+'</td>'+
      '<td>'+moneyBadge(r.razlika)+'</td>'+
      '<td>'+statusLabel+'</td>'+
      '<td><div style="display:flex;gap:4px;">'+
        (canEdit?'<button onclick="editKasaReport(\''+r.id+'\')" style="border:1px solid #dc2626;background:#fee2e2;color:#dc2626;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️ Редактирай</button>':'')+
        (r.status==='draft'&&canConfirm?'<button onclick="confirmKasaReport(\''+r.id+'\')" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✅ Потвърди</button>':'')+
      '</div></td>'+
    '</tr>';
  });
  h += '</tbody></table></div>';
  if (rows.length > 60) h += '<div style="font-size:12px;color:#94a3b8;padding:8px 0;">Показани 60 от '+rows.length+' записа.</div>';
  return h;
}

function filterHistRep() {
  var dateVal = (document.getElementById('hist-date-filter')||{}).value || '';
  var statusVal = (document.getElementById('hist-status-filter')||{}).value || 'all';
  var todayStr = today();
  var all = kasaReports.filter(function(r){ return r.date !== todayStr; });
  var filtered = all.filter(function(r){
    if (dateVal && r.date !== dateVal) return false;
    if (statusVal !== 'all' && r.status !== statusVal) return false;
    return true;
  });
  var wrap = document.getElementById('hist-table-wrap');
  if (wrap) wrap.innerHTML = renderHistTable(filtered);
}

function clearHistFilter() {
  var df = document.getElementById('hist-date-filter');
  var sf = document.getElementById('hist-status-filter');
  if (df) df.value = '';
  if (sf) sf.value = 'all';
  filterHistRep();
}

/* ═══════════════════════════════════════════════════════════════
   РАВНЕНИЕ НА ОБОРОТА (Zoborot)
   ПОС данни от системата vs Фискални устройства (ФУ)
═══════════════════════════════════════════════════════════════ */
var zoborotData = null;

function loadZoborot(){
  var q='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+kasaActiveDate()+'&order=created_at.desc';
  sbGet('kasa_zoborot',q).then(function(data){
    zoborotData=(Array.isArray(data)&&data.length)?data[0]:null;
    renderZoborot();
  }).catch(function(){renderZoborot();});
}

function renderZoborot(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var z=zoborotData||{};
  var isDraft=!z.id||(z.status==='draft');
  var canConfirm=['manager','admin','accounting','kasa'].indexOf(currentUser.role)>=0;
  var canUnlockZoborot=['admin','accounting'].indexOf(currentUser.role)>=0;

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
      '<div style="font-size:13px;color:var(--muted);">Дата: <b>'+fmtDate(kasaActiveDate())+'</b></div>'+
      '<div style="display:flex;gap:8px;">'+
        (isDraft&&canConfirm?'<button onclick="saveZoborot()" class="btn btn-green">💾 Запази</button>':'')+
        (isDraft&&canConfirm&&z.id?'<button onclick="confirmZoborot()" class="btn" style="background:#2563eb;color:#fff;">✅ Потвърди</button>':'')+
        (!isDraft&&canUnlockZoborot?'<button onclick="unlockZoborot()" class="btn" style="background:#fffbeb;color:#d97706;border:1px solid #d97706;">🔓 Разключи</button>':'')+
        '<button onclick="printZoborot()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">🖨 Разпечатай</button>'+
      '</div>'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'+

    /* ПОС данни */
    '<div class="card">'+
      '<div class="card-title">📊 Данни от POS Zoborot</div>'+
      '<table style="width:100%;font-size:13px;">'+
        '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 4px;color:#64748b;">Плащане в брой EUR (BGN)</td>'+
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
  if(zoborotData&&zoborotData.status==='confirmed'){toast('Потвърденото равнение не може да се редактира — първо го разключи','#dc2626');return;}
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
    store_name:currentUser.store_name,date:kasaActiveDate(),
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
  fetch(API+'/kasa_zoborot?id=eq.'+zoborotData.id,{
    method:'PATCH',
    headers:Object.assign({},H,{'Prefer':'return=minimal'}),
    body:JSON.stringify({status:'confirmed',confirmed_by:currentUser.display_name||currentUser.email})
  }).then(function(res){
    if(!res.ok){
      res.text().then(function(errText){
        console.error('kasa_zoborot PATCH грешка:', errText);
        toast('Грешка: '+errText.slice(0,150),'#dc2626');
      });
      return;
    }
    toast('✅ Равнението е потвърдено!');loadZoborot();
  });
}
function unlockZoborot(){
  if(!zoborotData)return;
  if(['admin','accounting'].indexOf(currentUser.role)<0){toast('Нямаш права за това действие','#dc2626');return;}
  if(!confirm('Разключи за редакция?'))return;
  sbPatch('kasa_zoborot','id=eq.'+zoborotData.id,{status:'draft',confirmed_by:null}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('🔓 Разключено!');loadZoborot();
  });
}

/* ─── PRINT ZOBOROT ─────────────────────────────────────────── */
function printZoborot(){
  /* Автоматично запази преди печат */
  saveZoborot();
  setTimeout(function(){
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
      '<tr><td>Плащане в брой EUR (BGN)</td><td style="text-align:right;font-family:monospace;">'+((parseFloat(z.cash_bgn)||0).toFixed(2))+'</td></tr>'+
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
  }, 400);
}


/* ═══════════════════════════════════════════════════════════════
   СТОРНО БЕЛЕЖКИ
══════════════════════════════════════════════════════════════ */
var kasaStorno = [];
var kasaStornoEditId = null;

/* Кодове, при които сравнението "сума на нов ≥ сума на върнат" няма смисъл —
   Капаро и Ваучер са финансови транзакции без реален заменящ артикул. */
var STORNO_EXEMPT_CODES = ['900001','900009'];

function stornoIsExempt(articlesStr){
  if(!articlesStr) return false;
  var codes=String(articlesStr).split('/').map(function(s){return s.trim();});
  return codes.some(function(c){return STORNO_EXEMPT_CODES.indexOf(c)>=0;});
}

function stornoIndicator(returnedSum, newSum, articlesStr) {
  if(stornoIsExempt(articlesStr)){
    return { flagged:false, exempt:true, label:'➖ Капаро/Ваучер', color:'#64748b', bg:null, diff:0 };
  }
  var ret = parseFloat(returnedSum) || 0;
  var nw  = parseFloat(newSum) || 0;
  var diff = Math.round((nw - ret) * 100) / 100;
  if (diff < 0) return { flagged: true,  label: '⚠️ ПО-МАЛКО', color: '#dc2626', bg: '#fef2f2', diff: diff };
  if (diff > 0) return { flagged: false, label: '✅ ПОВЕЧЕ',    color: '#16a34a', bg: '#f0fdf4', diff: diff };
  return          { flagged: false, label: '✅ РАВНО',      color: '#16a34a', bg: '#f0fdf4', diff: diff };
}

/* Проверка дали датата на сторно е повече от 1 календарен месец след датата на
   оригиналния бон. Датите се подават като 'YYYY-MM-DD' стрингове от <input type=date>
   и се разбиват ръчно на компоненти — не се ползва new Date(isoString)/.toISOString(),
   за да няма UTC отместване спрямо българската часова зона (виж проектните бележки). */
function stornoExceedsOneMonth(origStr, stornoStr){
  if(!origStr || !stornoStr) return false;
  var o=origStr.split('-').map(Number), s=stornoStr.split('-').map(Number);
  if(o.length!==3||s.length!==3) return false;
  var stornoDate=new Date(s[0],s[1]-1,s[2]);
  var limitDate =new Date(o[0],o[1],o[2]); /* оригинална дата + 1 месец, JS сам нормализира преливането */
  return stornoDate.getTime() > limitDate.getTime();
}

/* ─── Споделени помощници за артикулите по редове (kasa_storno_items) ───
   Ползват се от renderStorno() тук И от history.js за админ изгледа. */
var stornoItemsById = {}; /* { [storno_id]: { returned:[{sap_code,article_name}], replacement:[...] } } */

function stornoLoadItemsFor(ids){
  var uniq=[]; (ids||[]).forEach(function(id){ if(id && uniq.indexOf(id)<0) uniq.push(id); });
  if(!uniq.length){ stornoItemsById={}; return Promise.resolve(); }
  var q='storno_id=in.('+uniq.map(encodeURIComponent).join(',')+')&order=kind.asc,line_no.asc';
  return sbGet('kasa_storno_items',q).then(function(data){
    var map={};
    (Array.isArray(data)?data:[]).forEach(function(row){
      if(!map[row.storno_id]) map[row.storno_id]={returned:[],replacement:[]};
      if(map[row.storno_id][row.kind]) map[row.storno_id][row.kind].push(row);
    });
    stornoItemsById=map;
  }).catch(function(){ stornoItemsById={}; });
}

/* Компактен номериран списък "SAP код — име" за клетка в таблица, вместо
   едно огромно опънато /-разделено поле. Пада обратно към старите текстови
   полета (за записи отпреди миграцията, ако по някаква причина липсват items). */
function stornoItemsListHtml(r, kind){
  var rec=stornoItemsById[r.id];
  var items = rec ? rec[kind] : null;
  if(items && items.length){
    return '<ol style="margin:0;padding-left:15px;font-size:11px;">'+
      items.map(function(it){
        return '<li style="margin-bottom:2px;"><span style="font-family:DM Mono,monospace;">'+esc(it.sap_code||'')+'</span>'+
          (it.article_name?' — '+esc(it.article_name):'')+'</li>';
      }).join('')+
    '</ol>';
  }
  var codes = kind==='returned' ? r.articles : r.replacement_articles;
  var name  = kind==='returned' ? r.article_name : r.replacement_article_name;
  if(!codes) return '<span style="color:#94a3b8;">—</span>';
  return '<span style="font-family:DM Mono,monospace;font-size:11px;">'+esc(codes)+'</span>'+(name?'<br>'+esc(name):'');
}

/* Директен скок към Каса > Сторно бележки — ползва се от банера при вход,
   когато сторно бележка е върната за коментар на самия магазин. */
function goToStornoTab(){
  showModule('kasa');
  kasaTab('storno');
}

/* Приоритет за сортиране: върнатите за коментар излизат най-отгоре,
   после изпратените отново, после всичко останало по дата. */
function stornoSortPriority(r){
  return r.status==='returned'?0:(r.status==='resubmitted'?1:2);
}

function loadStorno(){
  var q='store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&order=storno_date.desc,created_at.desc';
  sbGet('kasa_storno',q).then(function(data){
    kasaStorno=Array.isArray(data)?data:[];
    kasaStorno.sort(function(a,b){return stornoSortPriority(a)-stornoSortPriority(b);});
    return stornoLoadItemsFor(kasaStorno.map(function(r){return r.id;}));
  }).then(function(){
    renderStorno();
  }).catch(function(){kasaStorno=[];renderStorno();});
}

function renderStorno(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  var canEdit=['manager','admin','kasa'].indexOf(currentUser.role)>=0;
  var canReturn=['admin','accounting'].indexOf(currentUser.role)>=0;
  var flaggedCount=kasaStorno.filter(function(r){return stornoIndicator(r.returned_sum,r.new_sum,r.articles).flagged;}).length;
  var returnedCount=kasaStorno.filter(function(r){return r.status==='returned';}).length;

  var html='<div class="page">'+
    '<div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+' — Сторно бележки</div>'+
    kasaTabBar()+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'+
      '<div style="font-size:13px;color:var(--muted);">Общо: <b>'+kasaStorno.length+'</b> бележки'+
        (flaggedCount?' &nbsp;|&nbsp; <b style="color:#dc2626;">⚠️ '+flaggedCount+'</b> с по-малка сума на новата покупка':'')+
        (returnedCount?' &nbsp;|&nbsp; <b style="color:#d97706;">↩ '+returnedCount+'</b> върнати за коментар':'')+
      '</div>'+
      (canEdit?'<button class="btn btn-green" onclick="openStornoForm(null)">+ Нова сторно бележка</button>':'')+
    '</div>';

  if(!kasaStorno.length){
    html+='<div class="card" style="text-align:center;padding:30px;color:#94a3b8;">Няма въведени сторно бележки.</div></div>';
    wrap.innerHTML=html;
    return;
  }

  html+='<div class="card"><div class="tbl-wrap"><table>'+
    '<thead><tr>'+
      '<th style="width:8%;white-space:nowrap;">Дата сторно</th><th style="width:8%;white-space:nowrap;">Дата бон</th>'+
      '<th style="width:16%;">Артикул/и</th>'+
      '<th style="width:8%;white-space:nowrap;">Сума върнат</th><th style="width:14%;">Причина</th>'+
      '<th style="width:16%;">Реална замяна</th><th style="width:8%;white-space:nowrap;">Сума нов</th>'+
      '<th style="width:9%;white-space:nowrap;">Индикация</th><th style="width:9%;white-space:nowrap;">Статус</th>'+(canEdit||canReturn?'<th></th>':'')+
    '</tr></thead><tbody>'+
    kasaStorno.map(function(r){
      var ind=stornoIndicator(r.returned_sum,r.new_sum,r.articles);
      var rowBg=ind.flagged?ind.bg:(r.status==='returned'?'#fffbeb':(r.status==='resubmitted'?'#eff6ff':null));
      var statusBadge=
        r.status==='returned'   ? '<span style="background:#fed7aa;color:#9a3412;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;white-space:nowrap;">↩ Върнат</span>' :
        r.status==='resubmitted'? '<span style="background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;white-space:nowrap;">🔄 Изпратен отново</span>' :
        '';
      var row='<tr'+(rowBg?' style="background:'+rowBg+';"':'')+'>'+
        '<td style="white-space:nowrap;">'+fmtDate(r.storno_date)+'</td>'+
        '<td style="white-space:nowrap;">'+fmtDate(r.original_receipt_date)+'</td>'+
        '<td>'+stornoItemsListHtml(r,'returned')+'</td>'+
        '<td style="font-family:DM Mono,monospace;white-space:nowrap;">'+fmtMoney(r.returned_sum)+'</td>'+
        '<td style="font-size:12px;">'+esc(r.reason||'')+'</td>'+
        '<td>'+stornoItemsListHtml(r,'replacement')+'</td>'+
        '<td style="font-family:DM Mono,monospace;white-space:nowrap;">'+fmtMoney(r.new_sum)+'</td>'+
        '<td style="white-space:nowrap;"><span style="font-weight:700;color:'+ind.color+';font-size:12px;">'+ind.label+'</span></td>'+
        '<td>'+statusBadge+'</td>'+
        (canEdit||canReturn?'<td style="white-space:nowrap;">'+
          (canEdit?'<button onclick="openStornoForm(\''+r.id+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;margin-right:4px;">✏️</button>'+
          '<button onclick="deleteStornoEntry(\''+r.id+'\')" style="border:1px solid #dc2626;background:#fef2f2;color:#dc2626;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;margin-right:4px;">🗑</button>':'')+
          (canReturn?'<button onclick="returnStornoForComment(\''+r.id+'\')" style="border:1px solid #d97706;background:#fffbeb;color:#d97706;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">↩ Върни за коментар</button>':'')+
        '</td>':'')+
      '</tr>';

      /* Разширен ред — причина за връщане + поле за коментар от магазина (само когато е върнат) */
      if(r.status==='returned'){
        row+='<tr'+(rowBg?' style="background:'+rowBg+';"':'')+'>'+
          '<td colspan="'+(canEdit||canReturn?10:9)+'" style="padding:10px 14px;border-top:none;">'+
            '<div style="font-size:12px;color:#9a3412;margin-bottom:6px;"><b>Причина за връщане:</b> '+esc(r.return_reason||'')+
              ' &nbsp;·&nbsp; върнато от '+esc(r.returned_by||'')+(r.returned_at?' на '+fmtDate(r.returned_at.slice(0,10)):'')+'</div>'+
            (canEdit?
              '<textarea id="sc-'+r.id+'" placeholder="Напиши пояснение защо е така, преди да потвърдиш..." style="width:100%;min-height:60px;border:1px solid #fdba74;border-radius:6px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;">'+escVal(r.store_comment)+'</textarea>'+
              '<div style="margin-top:6px;"><button onclick="resubmitStorno(\''+r.id+'\')" style="border:none;background:#16a34a;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">✅ Потвърди с коментар</button></div>'
            :'')+
          '</td></tr>';
      } else if(r.status==='resubmitted'&&r.store_comment){
        row+='<tr'+(rowBg?' style="background:'+rowBg+';"':'')+'>'+
          '<td colspan="'+(canEdit||canReturn?10:9)+'" style="padding:10px 14px;border-top:none;">'+
            '<div style="font-size:12px;color:#1e40af;"><b>Пояснение от магазина:</b> '+esc(r.store_comment)+
              ' &nbsp;·&nbsp; от '+esc(r.resubmitted_by||'')+(r.resubmitted_at?' на '+fmtDate(r.resubmitted_at.slice(0,10)):'')+'</div>'+
          '</td></tr>';
      }
      return row;
    }).join('')+
    '</tbody></table></div></div></div>';

  wrap.innerHTML=html;
}

/* ─── ВЪРНИ ЗА КОМЕНТАР (само admin/accounting — контролинг) ──── */
function returnStornoForComment(id){
  var reason=prompt('Причина за връщане на сторно бележката за коментар:');
  if(!reason) return;
  var by=currentUser.display_name||currentUser.email;
  sbPatch('kasa_storno','id=eq.'+id,{
    status:'returned',
    return_reason:reason,
    returned_by:by,
    returned_at:new Date().toISOString(),
    store_comment:null
  }).then(function(res){
    if(!res.ok){toast('Грешка при връщане','#dc2626');return;}
    toast('↩ Сторно бележката е върната за коментар','#d97706');
    if(typeof kasaView!=='undefined'&&kasaView==='storno') loadStorno();
    if(typeof loadHistory==='function'&&document.getElementById('mod-history')&&document.getElementById('mod-history').style.display!=='none') loadHistory();
  });
}

/* ─── МАГАЗИНЪТ ПОТВЪРЖДАВА С ПОЯСНЕНИЕ ────────────────────── */
function resubmitStorno(id){
  var ta=document.getElementById('sc-'+id);
  var comment=(ta&&ta.value||'').trim();
  if(!comment){toast('Напиши пояснение преди да потвърдиш','#dc2626');return;}
  var by=currentUser.display_name||currentUser.email;
  sbPatch('kasa_storno','id=eq.'+id,{
    status:'resubmitted',
    store_comment:comment,
    resubmitted_by:by,
    resubmitted_at:new Date().toISOString()
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('✅ Изпратено отново за преглед');
    var rec=kasaStorno.find(function(x){return x.id===id;});
    if(typeof pushToRole==='function'){
      var title='🔄 Сторно бележка — пояснение получено';
      var msg=(rec?rec.store_name+': ':'')+comment.slice(0,120);
      pushToRole('admin',title,msg);
      pushToRole('accounting',title,msg);
    }
    loadStorno();
  });
}

var stornoFormReturned = [];      /* [{sap_code, article_name}] — линии върнати артикули в текущата форма */
var stornoFormReplacement = [];   /* същото за заменящите артикули */

function openStornoForm(id){
  kasaStornoEditId=id||null;
  var r=id?(kasaStorno.find(function(x){return x.id===id;})||{}):{};

  if(id){
    sbGet('kasa_storno_items','storno_id=eq.'+id+'&order=kind.asc,line_no.asc').then(function(data){
      var items=Array.isArray(data)?data:[];
      stornoFormReturned=items.filter(function(x){return x.kind==='returned';})
        .map(function(x){return {sap_code:x.sap_code||'',article_name:x.article_name||''};});
      stornoFormReplacement=items.filter(function(x){return x.kind==='replacement';})
        .map(function(x){return {sap_code:x.sap_code||'',article_name:x.article_name||''};});
      if(!stornoFormReturned.length) stornoFormReturned=[{sap_code:'',article_name:''}];
      renderStornoForm(r);
    }).catch(function(){
      stornoFormReturned=[{sap_code:'',article_name:''}];
      stornoFormReplacement=[];
      renderStornoForm(r);
    });
  } else {
    stornoFormReturned=[{sap_code:'',article_name:''}];
    stornoFormReplacement=[];
    renderStornoForm(r);
  }
}

function renderStornoForm(r){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;

  var html='<div style="max-width:640px;margin:0 auto;padding:20px 16px 60px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:18px;">'+
      '<div style="font-size:18px;font-weight:600;">'+(kasaStornoEditId?'✏️ Редактирай':'+ Нова')+' сторно бележка</div>'+
      '<div style="display:flex;gap:8px;">'+
        '<button onclick="submitStornoForm()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">💾 Запази</button>'+
        '<button onclick="kasaView=\'storno\';loadStorno();" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
      '</div>'+
    '</div>'+

    '<div class="card" style="margin-bottom:14px;"><div class="card-title">Дати</div>'+
    '<div class="form-grid">'+
      '<div><label class="fl">Дата на сторно</label><input type="date" class="fi" id="sf-storno_date" value="'+(r.storno_date||today())+'"></div>'+
      '<div><label class="fl">Дата на оригинален касов бон *</label><input type="date" class="fi" id="sf-original_receipt_date" value="'+(r.original_receipt_date||'')+'"></div>'+
    '</div>'+
    '<div style="font-size:11px;color:#94a3b8;margin-top:8px;">Сторно не се допуска на бон по-стар от 1 месец спрямо датата на сторно'+(['admin','accounting'].indexOf(currentUser.role)>=0?' (за твоята роля няма ограничение).':'.')+'</div>'+
    '</div>'+

    '<div class="card" style="margin-bottom:14px;"><div class="card-title">Върнати артикули</div>'+
      '<div id="sf-items-returned"></div>'+
      '<button type="button" onclick="stornoAddItemRow(\'returned\')" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-bottom:12px;">+ Добави артикул</button>'+
      '<div class="form-grid">'+
        '<div><label class="fl">Обща сума на върнати артикули (EUR)</label><input type="number" step="0.01" class="fi" id="sf-returned_sum" value="'+(r.returned_sum||'')+'" oninput="stornoLiveCalc()" placeholder="0.00"></div>'+
        '<div><label class="fl">Причина</label><input class="fi" id="sf-reason" value="'+escVal(r.reason)+'"></div>'+
      '</div></div>'+

    '<div class="card" style="margin-bottom:14px;"><div class="card-title">Нови/заменящи артикули</div>'+
      '<div id="sf-items-replacement"></div>'+
      '<button type="button" onclick="stornoAddItemRow(\'replacement\')" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-bottom:12px;">+ Добави заменящ артикул</button>'+
      '<div class="form-grid">'+
        '<div><label class="fl">Обща сума на нови артикули (EUR)</label><input type="number" step="0.01" class="fi" id="sf-new_sum" value="'+(r.new_sum||'')+'" oninput="stornoLiveCalc()" placeholder="0.00"></div>'+
      '</div></div>'+

    '<div class="card" id="sf-indicator-box" style="background:#f8fafc;text-align:center;padding:16px;">'+
      '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Индикация</div>'+
      '<div id="sf-indicator" style="font-size:18px;font-weight:700;">—</div>'+
      '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Сумата на новата покупка трябва да е равна или по-голяма от сумата на върнатия артикул. Изключение: артикули 900001 (Капаро) и 900009 (Ваучер) не се проверяват.</div>'+
    '</div>'+
  '</div>';

  wrap.innerHTML=html;
  renderStornoItemRows('returned');
  renderStornoItemRows('replacement');
  stornoLiveCalc();
}

/* ─── Динамични редове за артикули (върнати / заменящи) ──── */
function stornoItemRowHtml(kind, idx, item){
  var prefix = kind==='returned' ? 'ret' : 'rep';
  return '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;">'+
    '<div style="flex:0 0 120px;"><label class="fl">SAP код</label><input class="fi" id="sf-'+prefix+'-code-'+idx+'" value="'+escVal(item.sap_code)+'" onblur="stornoLookupItem(\''+kind+'\','+idx+')" placeholder="напр. 12345"></div>'+
    '<div style="flex:1;"><label class="fl">Име</label><input class="fi" id="sf-'+prefix+'-name-'+idx+'" value="'+escVal(item.article_name)+'"></div>'+
    '<button type="button" onclick="stornoRemoveItemRow(\''+kind+'\','+idx+')" title="Премахни" style="border:1px solid #dc2626;background:#fef2f2;color:#dc2626;border-radius:6px;padding:8px 10px;font-size:12px;cursor:pointer;height:38px;">✕</button>'+
  '</div>';
}

function renderStornoItemRows(kind){
  var arr = kind==='returned' ? stornoFormReturned : stornoFormReplacement;
  var el = document.getElementById(kind==='returned'?'sf-items-returned':'sf-items-replacement');
  if(!el) return;
  el.innerHTML = arr.length
    ? arr.map(function(item,idx){return stornoItemRowHtml(kind,idx,item);}).join('')
    : '<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">Няма добавени артикули.</div>';
}

/* Прехвърля текущите стойности от DOM обратно в масивите преди add/remove/submit,
   за да не се губи вече въведеното при пренареждане на редовете. */
function stornoSyncItemsFromDOM(){
  [['returned','ret',stornoFormReturned],['replacement','rep',stornoFormReplacement]].forEach(function(cfg){
    var prefix=cfg[1], arr=cfg[2];
    arr.forEach(function(item,idx){
      var codeEl=document.getElementById('sf-'+prefix+'-code-'+idx);
      var nameEl=document.getElementById('sf-'+prefix+'-name-'+idx);
      if(codeEl) item.sap_code=codeEl.value;
      if(nameEl) item.article_name=nameEl.value;
    });
  });
}

function stornoAddItemRow(kind){
  stornoSyncItemsFromDOM();
  var arr = kind==='returned' ? stornoFormReturned : stornoFormReplacement;
  arr.push({sap_code:'',article_name:''});
  renderStornoItemRows(kind);
}

function stornoRemoveItemRow(kind, idx){
  stornoSyncItemsFromDOM();
  var arr = kind==='returned' ? stornoFormReturned : stornoFormReplacement;
  arr.splice(idx,1);
  renderStornoItemRows(kind);
  stornoLiveCalc();
}

/* Автоматично търсене на име по SAP код за конкретен ред — не презаписва ръчно въведено име. */
function stornoLookupItem(kind, idx){
  stornoSyncItemsFromDOM();
  var arr = kind==='returned' ? stornoFormReturned : stornoFormReplacement;
  var item = arr[idx];
  if(!item) return;
  var code=(item.sap_code||'').trim();
  if(!code || (item.article_name||'').trim()) return;
  sbGet('product_catalog','sap_code=eq.'+encodeURIComponent(code)+'&select=product_name').then(function(data){
    if(Array.isArray(data)&&data.length&&data[0].product_name){
      item.article_name=data[0].product_name;
      var prefix=kind==='returned'?'ret':'rep';
      var nameEl=document.getElementById('sf-'+prefix+'-name-'+idx);
      if(nameEl) nameEl.value=item.article_name;
    }
  }).catch(function(){});
}

/* Търсене на наименование по SAP код/ове в product_catalog — поддържа няколко кода,
   разделени с "/" (напр. "93357/88304"), и ги обединява в едно показвано име.
   ЗАБЕЛЕЖКА: остава непроменена за съвместимост, но вече не се извиква от формата —
   заменена е от stornoLookupItem() (търсене на ниво отделен ред). */
function stornoLookupCatalog(kind){
  var srcId  = kind==='replacement' ? 'sf-replacement_articles' : 'sf-articles';
  var destId = kind==='replacement' ? 'sf-replacement_article_name' : 'sf-article_name';
  var srcEl  = document.getElementById(srcId);
  var destEl = document.getElementById(destId);
  if(!srcEl || !destEl) return;
  if(destEl.value.trim()) return; /* не презаписвай ръчно въведено име */

  var codes=srcEl.value.split('/').map(function(s){return s.trim();}).filter(Boolean);
  if(!codes.length) return;

  var q='sap_code=in.('+codes.map(encodeURIComponent).join(',')+')&select=sap_code,product_name';
  sbGet('product_catalog',q).then(function(data){
    if(!Array.isArray(data)||!data.length) return;
    var byCode={};
    data.forEach(function(item){byCode[item.sap_code]=item.product_name;});
    var names=codes.map(function(c){return byCode[c]||null;}).filter(Boolean);
    if(names.length) destEl.value=names.join(' / ');
  }).catch(function(){});
}



function stornoLiveCalc(){
  var ret=parseFloat((document.getElementById('sf-returned_sum')||{}).value)||0;
  var nw =parseFloat((document.getElementById('sf-new_sum')||{}).value)||0;
  var codes=stornoFormReturned.map(function(x){return (x.sap_code||'').trim();}).filter(Boolean).join('/');
  var ind=stornoIndicator(ret,nw,codes);
  var el=document.getElementById('sf-indicator');
  var box=document.getElementById('sf-indicator-box');
  if(el){
    el.textContent=ind.label+(ind.diff?'  ('+(ind.diff>0?'+':'')+ind.diff.toFixed(2)+' EUR)':'');
    el.style.color=ind.color;
  }
  if(box) box.style.background=ind.bg;
}

/* Прост UUIDv4 генератор (ES5, без зависимости) — ползва се, за да знаем id-то на
   новата сторно бележка ПРЕДИ да я запишем, и да можем веднага след това да
   запишем свързаните редове в kasa_storno_items със същия storno_id. */
function genUUID(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
    var r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

function submitStornoForm(){
  stornoSyncItemsFromDOM();
  var returnedItems=stornoFormReturned.filter(function(x){return (x.sap_code||'').trim();});
  var replacementItems=stornoFormReplacement.filter(function(x){return (x.sap_code||'').trim();});
  var returnedSum=parseFloat((document.getElementById('sf-returned_sum')||{}).value)||0;
  var stornoDate=(document.getElementById('sf-storno_date')||{}).value||today();
  var origReceiptDate=(document.getElementById('sf-original_receipt_date')||{}).value||'';
  if(!returnedItems.length){toast('Добави поне 1 върнат артикул','#dc2626');return;}
  if(!returnedSum){toast('Въведи сума на върнатия артикул','#dc2626');return;}
  if(!origReceiptDate){toast('Въведи дата на оригинален касов бон','#dc2626');return;}
  var canBypassAgeLimit=['admin','accounting'].indexOf(currentUser.role)>=0;
  if(!canBypassAgeLimit && stornoExceedsOneMonth(origReceiptDate,stornoDate)){
    toast('⛔ Бонът е от '+fmtDate(origReceiptDate)+' — сторно не се допуска на бон по-стар от 1 месец. За изключение се свържете с Цветелина/админ.','#dc2626');
    return;
  }

  /* Старите текстови полета (articles/article_name/replacement_articles/replacement_article_name)
     продължават да се пълнят автоматично от новите редове — за обратна съвместимост,
     докато Excel износът (следваща стъпка) не бъде обновен да чете от kasa_storno_items. */
  var articlesStr=returnedItems.map(function(x){return x.sap_code.trim();}).join('/');
  var articleNameStr=returnedItems.map(function(x){return (x.article_name||'').trim();}).filter(Boolean).join(' / ');
  var replArticlesStr=replacementItems.map(function(x){return x.sap_code.trim();}).join('/');
  var replNameStr=replacementItems.map(function(x){return (x.article_name||'').trim();}).filter(Boolean).join(' / ');

  var stornoId=kasaStornoEditId||genUUID();

  var p={
    store_name:currentUser.store_name,
    storno_date:stornoDate,
    original_receipt_date:origReceiptDate,
    articles:articlesStr,
    article_name:articleNameStr,
    returned_sum:returnedSum,
    reason:((document.getElementById('sf-reason')||{}).value||'').trim(),
    replacement_articles:replArticlesStr,
    replacement_article_name:replNameStr,
    new_sum:parseFloat((document.getElementById('sf-new_sum')||{}).value)||0,
    updated_by:currentUser.display_name||currentUser.email,
    updated_at:new Date().toISOString()
  };
  if(!kasaStornoEditId){ p.id=stornoId; p.created_by=currentUser.display_name||currentUser.email; }

  var req=kasaStornoEditId?sbPatch('kasa_storno','id=eq.'+kasaStornoEditId,p):sbPost('kasa_storno',p);
  req.then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    return stornoSaveItems(stornoId, returnedItems, replacementItems).then(function(itemsOk){
      if(itemsOk===false){toast('⚠️ Бележката е запазена, но артикулите не се записаха коректно','#d97706');}
      else toast('💾 Сторно бележката е запазена!');
      if(stornoIndicator(p.returned_sum,p.new_sum,p.articles).flagged) notifyStornoDiscrepancy(p);
      kasaStornoEditId=null;kasaView='storno';loadStorno();
    });
  });
}

/* Записва редовете с артикули за дадена сторно бележка: изтрива старите (ако има, при
   редакция) и записва наново текущия списък — просто и предвидимо, без diff логика. */
function stornoSaveItems(stornoId, returnedItems, replacementItems){
  return sbDelete('kasa_storno_items','storno_id=eq.'+stornoId).then(function(){
    var rows=[];
    returnedItems.forEach(function(x,i){
      rows.push({storno_id:stornoId,kind:'returned',sap_code:x.sap_code.trim(),article_name:(x.article_name||'').trim()||null,line_no:i+1});
    });
    replacementItems.forEach(function(x,i){
      rows.push({storno_id:stornoId,kind:'replacement',sap_code:x.sap_code.trim(),article_name:(x.article_name||'').trim()||null,line_no:i+1});
    });
    if(!rows.length) return true;
    return sbPost('kasa_storno_items',rows).then(function(r){return r.ok;});
  }).catch(function(){return false;});
}

/* Push нотификация до admin+accounting при разминаване (нова сума < върната) —
   изпраща се веднага при запис/редакция, независимо дали получателят е в портала. */
function notifyStornoDiscrepancy(p){
  if(typeof pushToRole!=='function') return;
  var diff=Math.round(((parseFloat(p.new_sum)||0)-(parseFloat(p.returned_sum)||0))*100)/100;
  var title='⚠️ Сторно с разминаване — '+p.store_name;
  var msg=(p.article_name||p.articles||'артикул')+': върнато '+(parseFloat(p.returned_sum)||0).toFixed(2)+
    ' EUR, ново '+(parseFloat(p.new_sum)||0).toFixed(2)+' EUR (разлика '+diff.toFixed(2)+' EUR)';
  pushToRole('admin',title,msg);
  pushToRole('accounting',title,msg);
}

function deleteStornoEntry(id){
  if(!confirm('Изтрий сторно бележката?'))return;
  sbDelete('kasa_storno','id=eq.'+id).then(function(res){
    if(!res.ok){toast('Грешка при изтриване','#dc2626');return;}
    toast('🗑 Изтрито');
    loadStorno();
  });
}
