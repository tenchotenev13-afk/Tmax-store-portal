/* kasa-docs.js — Документи и Дневен преглед */

var SB_STORAGE = 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1';
var BUCKET = 'kasa-docs';

function uploadKasaDoc(file, reportType, docType, onDone) {
  var ext   = file.name.split('.').pop();
  var stamp = Date.now();
  var clean = (currentUser.store_name||'store').replace(/[^a-zA-Z0-9]/g,'_');
  var docDate = (typeof kasaActiveDate==='function') ? kasaActiveDate() : today();
  var path  = clean+'/'+docDate+'/'+reportType+'_'+docType+'_'+stamp+'.'+ext;
  var reader = new FileReader();
  reader.onload = function(e) {
    var encodedPath = path.split('/').map(function(s){return encodeURIComponent(s);}).join('/');
    fetch(SB_STORAGE+'/object/'+BUCKET+'/'+encodedPath, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Content-Type': file.type||'application/octet-stream',
        'x-upsert': 'true'
      },
      body: e.target.result
    }).then(function(r) {
      if (!r.ok) { toast('Грешка при качване','#dc2626'); return; }
      sbPost('kasa_documents', {
        store_name: currentUser.store_name,
        date: docDate,
        report_type: reportType,
        doc_type: docType,
        file_name: file.name,
        file_url: path,
        file_size: file.size,
        uploaded_by: currentUser.display_name||currentUser.email
      }).then(function() {
        toast('✅ Документът е качен!');
        if (onDone) onDone();
      });
    }).catch(function() { toast('Грешка при качване','#dc2626'); });
  };
  reader.readAsArrayBuffer(file);
}

function getSignedUrl(path, onUrl) {
  var encPath = path.split('/').map(function(s){return encodeURIComponent(s);}).join('/');
  fetch(SB_STORAGE+'/object/sign/'+BUCKET+'/'+encPath, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: 3600 })
  }).then(function(r) { return r.json(); })
  .then(function(d) { onUrl(d.signedURL ? 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1'+d.signedURL : null); })
  .catch(function() { onUrl(null); });
}

function loadKasaDocs(date, cb) {
  var q = 'store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&date=eq.'+date+'&order=created_at.desc';
  sbGet('kasa_documents', q).then(cb).catch(function() { cb([]); });
}

function renderDocsSection(containerId, reportType, docs) {
  var wrap = document.getElementById(containerId);
  if (!wrap) return;
  var canUpload = ['kasa','manager','admin','accounting'].indexOf(currentUser.role) >= 0;
  var types = { z_report:'Z-Четене', storno:'Сторно бележки', discount:'Отстъпки', other:'Друго' };

  var uploadBtn = canUpload
    ? '<label style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:7px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">+ Прикачи'
      + '<input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style="display:none;" id="doc-file-'+reportType+'" onchange="handleDocUpload(event,\''+reportType+'\')">'
      + '</label>'
    : '';

  var html = '<div class="card" style="margin-top:14px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
    + '<div class="card-title" style="margin:0;">📎 Прикачени документи</div>'
    + uploadBtn
    + '</div>';

  if (!docs || !docs.length) {
    html += '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px;">Няма прикачени документи.</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    docs.forEach(function(d) {
      var icon = d.file_name && /\.pdf$/i.test(d.file_name) ? '📄' : '🖼️';
      var sz = d.file_size ? ' · '+Math.round(d.file_size/1024)+' KB' : '';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8fafc;border-radius:7px;border:1px solid #e2e8f0;">'
        + '<span style="font-size:18px;">'+icon+'</span>'
        + '<div style="flex:1;">'
        + '<div style="font-size:12px;font-weight:500;">'+esc(d.file_name)+'</div>'
        + '<div style="font-size:10px;color:#94a3b8;">'+(types[d.doc_type]||d.doc_type)+' · '+fmtDate(d.date)+' · '+esc(d.uploaded_by||'')+sz+'</div>'
        + '</div>'
        + '<button onclick="openKasaDoc(\''+esc(d.file_url)+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;">Виж</button>'
        + '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  wrap.innerHTML = html;
}

function handleDocUpload(event, reportType) {
  var files = Array.from(event.target.files);
  if (!files.length) return;
  var t = prompt('Тип документ:\n1 — Z-Четене\n2 — Сторно бележки\n3 — Отстъпки\n4 — Друго\n\nВъведи число:');
  var typeMap = {'1':'z_report','2':'storno','3':'discount','4':'other'};
  var docType = typeMap[t] || 'other';
  var done = 0;
  files.forEach(function(file) {
    uploadKasaDoc(file, reportType, docType, function() {
      done++;
      if (done === files.length) {
        loadKasaDocs((typeof kasaActiveDate==='function')?kasaActiveDate():today(), function(allDocs) {
          renderDocsSection('docs-section-'+reportType, reportType, allDocs.filter(function(d) { return d.report_type === reportType; }));
        });
      }
    });
  });
}

function openKasaDoc(path) {
  getSignedUrl(path, function(url) {
    if (url) window.open(url, '_blank');
    else toast('Грешка при отваряне','#dc2626');
  });
}

/* Попълва placeholder-ите след renderKasa */
function initKasaDocsView() {
  var docsEl = document.getElementById('docs-section-pos');
  if (docsEl) {
    loadKasaDocs((typeof kasaActiveDate==='function')?kasaActiveDate():today(), function(allDocs) {
      renderDocsSection('docs-section-pos', 'pos', allDocs.filter(function(d) { return d.report_type === 'pos'; }));
    });
  }
  var btnWrap = document.getElementById('ready-btn-wrap');
  if (btnWrap && ['kasa','manager','admin'].indexOf(currentUser.role) >= 0) {
    btnWrap.innerHTML = '<button onclick="markReady()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600;cursor:pointer;">📤 Изпрати за проверка към счетоводство</button>';
  }
}

function markReady() {
  var todayStr = (typeof kasaActiveDate==='function') ? kasaActiveDate() : today();
  var reps = kasaReports.filter(function(r) { return r.date === todayStr; });
  if (!reps.length) { toast('Няма касови отчети за днес','#dc2626'); return; }
  var draftReps = reps.filter(function(r) { return r.status === 'draft'; });
  if (draftReps.length) {
    var posLabels = draftReps.map(function(r){
      return 'ПОС '+(r.pos_number||'?')+(r.cashier_name?' ('+r.cashier_name+')':'');
    }).join(', ');
    var word = draftReps.length===1?'е непотвърден':'са непотвърдени';
    if (!confirm('Внимание: '+posLabels+' '+word+'.\n\nПродължи ли въпреки това?')) return;
  }
  var by = currentUser.display_name||currentUser.email;
  var now = new Date().toISOString();
  Promise.all(reps.map(function(r) {
    return sbPatch('kasa_reports','id=eq.'+r.id,{ready_at:now,ready_by:by});
  })).then(function() {
    toast('📤 Изпратено за проверка!');
    loadKasa();
  });
}

/* Дневен преглед */
function loadDailyOverview() {
  var wrap = document.getElementById('daily-overview') || document.getElementById('h-results');
  if (!wrap) return;
  wrap.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
  var todayStr = today();
  Promise.all([
    sbGet('kasa_reports','date=eq.'+todayStr+'&order=store_name.asc'+storeQ()),
    sbGet('kasa_zoborot','date=eq.'+todayStr+storeQ()),
    sbGet('kasa_documents','date=eq.'+todayStr+storeQ()),
    sbGet('stores','select=name&order=name'+storeQ('name'))
  ]).then(function(res) {
    var reps   = Array.isArray(res[0]) ? res[0] : [];
    var zobs   = Array.isArray(res[1]) ? res[1] : [];
    var docs   = Array.isArray(res[2]) ? res[2] : [];
    var stores = Array.isArray(res[3]) ? res[3] : [];
    var names  = stores.map(function(s) { return s.name; });

    var withRep = reps.reduce(function(acc,r) { acc[r.store_name]=true; return acc; },{});
    var readyCount = reps.filter(function(r) { return r.ready_at; })
      .reduce(function(acc,r) { acc[r.store_name]=true; return acc; },{});
    readyCount = Object.keys(readyCount).length;
    var totalRaz = reps.reduce(function(s,r) { return s+(parseFloat(r.razlika)||0); },0);
    var razC = totalRaz===0 ? '#16a34a' : totalRaz<0 ? '#dc2626' : '#d97706';

    var html = '<div style="font-size:16px;font-weight:600;margin-bottom:14px;">📅 Дневен преглед — '+fmtDate(todayStr)+'</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">'
      + mkCard('🏪 Подали отчет', Object.keys(withRep).length+' / '+names.length, 'магазина', '#2563eb')
      + mkCard('📤 За проверка', readyCount, 'изпратили', '#16a34a')
      + mkCard('📎 Документи', docs.length, 'прикачени', '#d97706')
      + mkCard('💰 Обща разлика', (totalRaz<0?'–':'')+Math.abs(totalRaz).toFixed(2), 'EUR', razC)
      + '</div>'
      + '<div class="card"><div class="card-title">Статус по магазини</div>'
      + '<div class="tbl-wrap"><table>'
      + '<thead><tr><th>Магазин</th><th style="text-align:center;">ПОС</th><th style="text-align:center;">Равнение</th><th style="text-align:center;">Документи</th><th style="text-align:right;">Разлика EUR</th><th style="text-align:center;">Статус</th></tr></thead><tbody>';

    names.forEach(function(name) {
      var sr = reps.filter(function(r) { return r.store_name===name; });
      var sz = zobs.find(function(z) { return z.store_name===name; });
      var sd = docs.filter(function(d) { return d.store_name===name; });
      var raz = sr.reduce(function(s,r) { return s+(parseFloat(r.razlika)||0); },0);
      var rc  = raz===0?'#16a34a':raz<0?'#dc2626':'#d97706';
      var allOk = sr.length > 0 && sr.every(function(r) { return r.status==='confirmed'; });
      var rdy = sr.some(function(r) { return r.ready_at; });
      var st = !sr.length
        ? '<span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:20px;font-size:11px;">⬜ Не е попълнено</span>'
        : rdy
        ? '<span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">📤 За проверка</span>'
        : '<span style="background:#dbeafe;color:#1e3a5f;padding:2px 8px;border-radius:20px;font-size:11px;">✏️ В процес</span>';

      html += '<tr>'
        + '<td style="font-weight:500;">'+esc(name)+'</td>'
        + '<td style="text-align:center;font-size:12px;">'+(sr.length ? sr.length+'бр.'+(allOk?' ✅':' ✏️') : '—')+'</td>'
        + '<td style="text-align:center;">'+(sz ? (sz.status==='confirmed'?'✅':'✏️') : '—')+'</td>'
        + '<td style="text-align:center;">'+(sd.length ? '📎 '+sd.length : '—')+'</td>'
        + '<td style="text-align:right;font-family:monospace;font-weight:700;color:'+rc+';">'+(sr.length?(raz<0?'–':'')+Math.abs(raz).toFixed(2):'—')+'</td>'
        + '<td style="text-align:center;">'+st+'</td>'
        + '<td><button onclick="openKasaDetail(\''+name+'\',\''+todayStr+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;">Детайли →</button></td>'
        + '</tr>';
    });
    html += '</tbody></table></div></div>';
    wrap.innerHTML = html;
  }).catch(function() {
    wrap.innerHTML = '<div style="color:#dc2626;padding:20px;">Грешка при зареждане.</div>';
  });
}

function mkCard(label, val, sub, col) {
  return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid '+col+';">'
    + '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">'+label+'</div>'
    + '<div style="font-size:22px;font-weight:700;color:'+col+';font-family:DM Mono,monospace;">'+val+'</div>'
    + '<div style="font-size:11px;color:#94a3b8;">'+sub+'</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════════════════════
   ДЕТАЙЛЕН ПРЕГЛЕД — пълна информация за дата + магазин
   Достъп: admin, accounting, logistics
═══════════════════════════════════════════════════════════════ */

function openKasaDetail(storeName, date) {
  var enc = encodeURIComponent(storeName);
  Promise.all([
    sbGet('kasa_reports', 'store_name=eq.' + enc + '&date=eq.' + date + '&order=pos_number.asc'),
    sbGet('kasa_glavna',  'store_name=eq.' + enc + '&date=eq.' + date),
    sbGet('kasa_zoborot', 'store_name=eq.' + enc + '&date=eq.' + date),
    sbGet('kasa_documents', 'store_name=eq.' + enc + '&date=eq.' + date + '&order=created_at.asc')
  ]).then(function(res) {
    var reps = Array.isArray(res[0]) ? res[0] : [];
    var gl   = (Array.isArray(res[1]) && res[1].length) ? res[1][0] : null;
    var zob  = (Array.isArray(res[2]) && res[2].length) ? res[2][0] : null;
    var docs = Array.isArray(res[3]) ? res[3] : [];

    var g = gl || {};
    var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
    var SB_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';

    function fm(v){var n=parseFloat(v)||0;return(n<0?'– ':'')+Math.abs(n).toFixed(2)+' EUR';}
    function rc(v){var n=parseFloat(v)||0;return n<0?'color:#dc2626':n>0?'color:#d97706':'color:#16a34a';}

    var BILLS=[500,200,100,50,20,10,5,2,1];
    var COINS=[0.5,0.2,0.1,0.05,0.02,0.01];
    var ALL_D=BILLS.concat(COINS);
    var INKASO_D=[500,200,100,50,20,10,5];
    var DK={};
    BILLS.forEach(function(v){DK[String(v)]='bills_'+v;});
    DK['0.5']='coins_50';DK['0.2']='coins_20';DK['0.1']='coins_10';
    DK['0.05']='coins_5';DK['0.02']='coins_2';DK['0.01']='coins_1';

    /* Totals */
    var tTurn=0,tCash=0,tCard=0,tCount=0,tRaz=0,tInkaso=0;
    reps.forEach(function(r){
      tTurn+=parseFloat(r.total_turnover)||0; tCash+=parseFloat(r.cash_turnover)||0;
      tCard+=parseFloat(r.card_turnover)||0;  tCount+=parseFloat(r.counted_cash)||0;
      tRaz+=parseFloat(r.razlika)||0;
      var ink=0; INKASO_D.forEach(function(v){ink+=(parseInt(r['inkaso_'+v])||0)*v;});
      tInkaso+=Math.round(ink*100)/100;
    });

    /* Главна */
    var glCounted=0;
    ALL_D.forEach(function(v){
      var posQ=0; reps.forEach(function(r){posQ+=parseInt(r[DK[String(v)]])||0;});
      var glQ=parseInt(g[DK[String(v)]])||0;
      glCounted+=Math.round((posQ+glQ)*v*100)/100;
    });
    glCounted=Math.round(glCounted*100)/100;
    var slujebno=parseFloat(g.slujebno)||0;
    var sapBal=parseFloat(g.sap_balance)||0;
    var glRaz=Math.round((glCounted+slujebno-sapBal)*100)/100;

    /* Купюри таблица */
    var posHeaders=reps.map(function(r){
      return '<th style="text-align:center;padding:4px 8px;background:#2f2f2f;color:#fff;font-size:9pt;">ПОС '+r.pos_number+'<br><span style="font-weight:400;font-size:8pt;">'+esc(r.cashier_name||'')+'</span></th>';
    }).join('');

    var denomRows=''; var grandTotalCash=0;
    ALL_D.forEach(function(v){
      var posQtys=reps.map(function(r){return parseInt(r[DK[String(v)]])||0;});
      var posSum=posQtys.reduce(function(a,b){return a+b;},0);
      var glQ=parseInt(g[DK[String(v)]])||0;
      var total=posSum+glQ; var sum=Math.round(total*v*100)/100;
      grandTotalCash=Math.round((grandTotalCash+sum)*100)/100;
      if(total===0)return;
      denomRows+='<tr>'+
        '<td style="text-align:right;padding:2px 8px;font-weight:600;">'+v+'</td>'+
        posQtys.map(function(q){return '<td style="text-align:center;padding:2px 8px;">'+q+'</td>';}).join('')+
        '<td style="text-align:center;padding:2px 8px;background:#fffbeb;">'+glQ+'</td>'+
        '<td style="text-align:center;padding:2px 8px;font-weight:700;">'+total+'</td>'+
        '<td style="text-align:right;padding:2px 8px;font-family:monospace;">'+sum.toFixed(2)+'</td>'+
      '</tr>';
    });
    /* Общо ред */
    denomRows+='<tr style="border-top:2px solid #0f172a;background:#f0fdf4;font-weight:700;">'+
      '<td style="padding:5px 8px;">ОБЩА КАСОВА НАЛИЧНОСТ</td>'+
      reps.map(function(){return '<td></td>';}).join('')+
      '<td></td><td></td>'+
      '<td style="text-align:right;padding:5px 8px;font-family:monospace;font-size:11pt;color:#0f172a;">'+grandTotalCash.toFixed(2)+' EUR</td>'+
    '</tr>';

    /* Инкасо таблица */
    var inkRows=''; var totalInk=0;
    INKASO_D.forEach(function(v){
      var posQtys=reps.map(function(r){return parseInt(r['inkaso_'+v])||0;});
      var total=posQtys.reduce(function(a,b){return a+b;},0);
      var sum=total*v; totalInk+=sum;
      if(total===0)return;
      inkRows+='<tr>'+
        '<td style="text-align:right;padding:2px 8px;font-weight:600;">'+v+'</td>'+
        posQtys.map(function(q){return '<td style="text-align:center;padding:2px 8px;">'+q+'</td>';}).join('')+
        '<td style="text-align:center;padding:2px 8px;font-weight:700;">'+total+'</td>'+
        '<td style="text-align:right;padding:2px 8px;font-family:monospace;">'+sum.toFixed(2)+' EUR</td>'+
      '</tr>';
    });

    /* Документи */
    var docsHTML='';
    if(docs.length){
      docsHTML='<h3>📎 Прикачени документи ('+docs.length+')</h3>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:5mm;">';
      docs.forEach(function(d){
        docsHTML+='<div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:8.5pt;">'+
          '<div style="font-size:16px;text-align:center;margin-bottom:4px;">'+(/\.pdf$/i.test(d.file_name)?'📄':'🖼️')+'</div>'+
          '<div style="font-weight:600;word-break:break-all;">'+esc(d.file_name)+'</div>'+
          '<div style="color:#6b7280;">'+esc(d.doc_type||'')+'</div>'+
        '</div>';
      });
      docsHTML+='</div>';
    }

    /* Zoborot резюме */
    var zobHTML='';
    if(zob){
      var raz_z=parseFloat(zob.razlika)||0;
      zobHTML='<h3>📊 Равнение на оборота</h3>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm;margin-bottom:4mm;">'+
          '<div class="metric"><div class="metric-lbl">POS оборот (без банков)</div><div class="metric-val" style="color:#2563eb;">'+fm(zob.pos_no_bank)+'</div></div>'+
          '<div class="metric"><div class="metric-lbl">Общо ФУ нетен</div><div class="metric-val" style="color:#16a34a;">'+fm(zob.fu_total_net)+'</div></div>'+
          '<div class="metric" style="border-color:'+(raz_z===0?'#16a34a':raz_z<0?'#dc2626':'#d97706')+'"><div class="metric-lbl">РАЗЛИКА</div><div class="metric-val" style="'+rc(raz_z)+'">'+fm(raz_z)+'</div></div>'+
        '</div>';
    }

    var canReturn=['admin','accounting'].indexOf(currentUser.role)>=0;
    var hasReturned=reps.some(function(r){return r.status==='returned';});
    var returnBtn=canReturn?
      '<button onclick="returnForRevision(\''+esc(storeName)+'\',\''+date+'\')" style="border:1px solid #dc2626;background:#fee2e2;color:#dc2626;border-radius:6px;padding:7px 14px;font-size:10pt;cursor:pointer;margin-right:8px;">↩ Върни за корекция</button>':'';
    var returnBox=hasReturned?
      '<div style="background:#fee2e2;border:2px solid #dc2626;border-radius:8px;padding:12px;margin-bottom:4mm;">'+
        '<b style="color:#991b1b;">↩ Отчетът е върнат за корекция</b>'+
        '<div style="font-size:9pt;margin-top:4px;">'+esc((reps.find(function(r){return r.return_reason;})||{}).return_reason||'')+'</div>'+
      '</div>':'';

    var LOGO='data:image/png;base64,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';

    var html='<!DOCTYPE html><html lang="bg"><head><meta charset="UTF-8">'+
      '<title>Касов отчет — '+esc(storeName)+' — '+date+'</title>'+
      '<style>'+
      '@page{size:A4;margin:12mm;}'+
      '*{box-sizing:border-box;margin:0;padding:0;}'+
      'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;}'+
      'h3{font-size:11pt;margin:4mm 0 2mm;color:#2f2f2f;border-bottom:1px solid #ccc;padding-bottom:1mm;}'+
      'table{width:100%;border-collapse:collapse;margin-bottom:4mm;font-size:9.5pt;}'+
      'th{background:#2f2f2f;color:#fff;padding:4px 8px;text-align:left;font-size:9pt;}'+
      'td{padding:3px 8px;border-bottom:1px solid #e5e7eb;}'+
      'tr:last-child td{border-bottom:none;}'+
      '.total-row{background:#f8fafc;font-weight:700;}'+
      '.red{color:#dc2626;}.green{color:#16a34a;}.amber{color:#d97706;}'+
      '.mono{font-family:monospace;}'+
      '.metric{border:1px solid #e2e8f0;border-radius:4px;padding:3mm;text-align:center;}'+
      '.metric-val{font-size:14pt;font-weight:700;font-family:monospace;}'+
      '.metric-lbl{font-size:8pt;color:#64748b;margin-bottom:1mm;}'+
      '.sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm;margin-top:8mm;}'+
      '.sign-box{border-top:1px solid #333;padding-top:2mm;font-size:8pt;color:#555;}'+
      '@media print{.no-print{display:none!important;}}'+
      '</style></head><body>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4mm;">'+
        '<div>'+
          '<div style="font-size:16pt;font-weight:700;">ТЕМАКС — Касов отчет</div>'+
          '<div style="font-size:11pt;color:#444;">'+esc(storeName)+' &nbsp;|&nbsp; '+fmtDate(date)+'</div>'+
          '<div style="font-size:8.5pt;color:#888;margin-top:1mm;">Изготвен: '+new Date().toLocaleString('bg-BG')+' от '+esc(currentUser.display_name||currentUser.email)+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;align-items:center;" class="no-print">'+
          returnBtn+
          '<button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:7px 14px;font-size:10pt;cursor:pointer;">🖨 Принтирай / PDF</button>'+
        '</div>'+
        '<img src="'+LOGO+'" style="height:44pt;width:auto;">'+
      '</div>'+
      returnBox+
      '<h3>📋 Резюме по ПОС терминали</h3>'+
      '<table><thead><tr>'+
        '<th>ПОС</th><th>Касиер</th><th>Каса №</th>'+
        '<th style="text-align:right;">Общ оборот</th><th style="text-align:right;">В брой</th>'+
        '<th style="text-align:right;">Карти</th><th style="text-align:right;">Инкасо</th>'+
        '<th style="text-align:right;">Налични</th><th style="text-align:right;">Разлика</th>'+
        '<th style="text-align:center;">Статус</th>'+
      '</tr></thead><tbody>'+
      reps.map(function(r){
        var ink=0; INKASO_D.forEach(function(v){ink+=(parseInt(r['inkaso_'+v])||0)*v;});
        ink=Math.round(ink*100)/100;
        var raz=parseFloat(r.razlika)||0;
        return '<tr>'+
          '<td><b>ПОС '+esc(String(r.pos_number||''))+'</b></td>'+
          '<td>'+esc(r.cashier_name||'')+'</td>'+
          '<td style="text-align:center;">'+esc(String(r.kasa_number||''))+'</td>'+
          '<td style="text-align:right;" class="mono">'+fm(r.total_turnover)+'</td>'+
          '<td style="text-align:right;" class="mono">'+fm(r.cash_turnover)+'</td>'+
          '<td style="text-align:right;" class="mono">'+fm(r.card_turnover)+'</td>'+
          '<td style="text-align:right;" class="mono">'+fm(ink)+'</td>'+
          '<td style="text-align:right;" class="mono">'+fm(r.counted_cash)+'</td>'+
          '<td style="text-align:right;font-weight:700;" class="mono" style="'+rc(raz)+'">'+fm(raz)+'</td>'+
          '<td style="text-align:center;">'+(r.status==='confirmed'?'✅ Потвърден':r.status==='returned'?'↩ Върнат':'✏️ Чернова')+'</td>'+
        '</tr>';
      }).join('')+
      '<tr class="total-row">'+
        '<td colspan="3">ОБЩО</td>'+
        '<td style="text-align:right;" class="mono">'+fm(tTurn)+'</td>'+
        '<td style="text-align:right;" class="mono">'+fm(tCash)+'</td>'+
        '<td style="text-align:right;" class="mono">'+fm(tCard)+'</td>'+
        '<td style="text-align:right;" class="mono">'+fm(tInkaso)+'</td>'+
        '<td style="text-align:right;" class="mono">'+fm(tCount)+'</td>'+
        '<td style="text-align:right;font-weight:700;" class="mono" style="'+rc(tRaz)+'">'+fm(tRaz)+'</td>'+
        '<td></td>'+
      '</tr>'+
      '</tbody></table>'+
      '<h3>💵 Отчетени купюри по ПОС + Главна каса</h3>'+
      '<table><thead><tr>'+
        '<th>Ном.</th>'+posHeaders+
        '<th style="text-align:center;padding:4px 8px;background:#92400e;color:#fff;">Главна</th>'+
        '<th style="text-align:center;padding:4px 8px;">Общо бр.</th>'+
        '<th style="text-align:right;padding:4px 8px;">Сума</th>'+
      '</tr></thead><tbody>'+denomRows+'</tbody></table>'+
      '<h3>📤 Изведени за инкасо</h3>'+
      '<table><thead><tr>'+
        '<th>Ном.</th>'+posHeaders+
        '<th style="text-align:center;padding:4px 8px;">Общо бр.</th>'+
        '<th style="text-align:right;padding:4px 8px;">Сума</th>'+
      '</tr></thead><tbody>'+
      (inkRows||'<tr><td colspan="10" style="text-align:center;color:#94a3b8;">Няма изведени за инкасо</td></tr>')+
      '</tbody></table>'+
      zobHTML+
      '<h3>🏦 Главна каса</h3>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4mm;margin-bottom:5mm;">'+
        '<div class="metric"><div class="metric-lbl">Общо налични</div><div class="metric-val green">'+glCounted.toFixed(2)+' EUR</div></div>'+
        '<div class="metric"><div class="metric-lbl">Служебно въведени</div><div class="metric-val amber">'+slujebno.toFixed(2)+' EUR</div></div>'+
        '<div class="metric"><div class="metric-lbl">Наличност SAP</div><div class="metric-val" style="color:#1e40af;">'+sapBal.toFixed(2)+' EUR</div></div>'+
        '<div class="metric" style="border-color:'+(glRaz<0?'#dc2626':glRaz>0?'#d97706':'#16a34a')+'">'+
          '<div class="metric-lbl">РАЗЛИКА</div>'+
          '<div class="metric-val" style="'+rc(glRaz)+'">'+(glRaz<0?'– ':'')+Math.abs(glRaz).toFixed(2)+' EUR</div>'+
        '</div>'+
      '</div>'+
      (gl?'<div style="font-size:8.5pt;color:#888;margin-bottom:4mm;">Главна каса: '+(gl.status==='confirmed'?'✅ Потвърдена':'✏️ Чернова')+'</div>':'')+
      docsHTML+
      '<div class="sign-grid">'+
        '<div><div class="sign-box">Изготвил: ________________________</div>'+
          '<div style="font-size:8pt;color:#888;margin-top:1mm;">'+esc(currentUser.display_name||'')+'</div></div>'+
        '<div><div class="sign-box">Приел (гл. касиер): ________________________</div></div>'+
        '<div><div class="sign-box">Управител: ________________________</div></div>'+
      '</div>'+
    '</body></html>';

    var win=window.open('','_blank','width=900,height=700');
    win.document.write(html);
    win.document.close();
    setTimeout(function(){win.focus();},300);

  }).catch(function(e){toast('Грешка при зареждане: '+e,'#dc2626');});
}

/* ─── ВЪРНИ ЗА КОРЕКЦИЯ ─────────────────────────────────────── */
function returnKasaForRevision(storeName, date, reason) {
  var by = currentUser.display_name || currentUser.email;
  var now = new Date().toISOString();
  var enc = encodeURIComponent(storeName);
  /* Вземи всички отчети за тази дата+магазин */
  sbGet('kasa_reports', 'store_name=eq.' + enc + '&date=eq.' + date).then(function(reps) {
    if (!Array.isArray(reps) || !reps.length) { toast('Няма отчети за тази дата', '#dc2626'); return; }
    var patches = reps.map(function(r) {
      return sbPatch('kasa_reports', 'id=eq.' + r.id, {
        status: 'returned',
        return_reason: reason,
        returned_by: by,
        returned_at: now
      });
    });
    Promise.all(patches).then(function() {
      toast('↩ Отчетът е върнат за корекция на ' + storeName, '#d97706');
      loadHistory();
    });
  });
}
