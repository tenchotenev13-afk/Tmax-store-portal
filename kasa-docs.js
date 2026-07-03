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
  var win = window.open('', '_blank', 'width=1100,height=800');
  win.document.write('<html><head><meta charset="UTF-8"><title>Детайлен преглед — ' + storeName + ' — ' + date + '</title>' +
    '<style>' +
    '@page{size:A4;margin:12mm;}' +
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;background:#f8fafc;}' +
    '.wrap{max-width:1050px;margin:0 auto;padding:16px;}' +
    '.header{background:#2f2f2f;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}' +
    'h2{font-size:13pt;margin:14px 0 6px;color:#2f2f2f;border-bottom:2px solid #e2e8f0;padding-bottom:4px;}' +
    'h3{font-size:11pt;margin:10px 0 4px;color:#374151;}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9.5pt;}' +
    'th{background:#2f2f2f;color:#fff;padding:4px 8px;text-align:left;font-size:9pt;}' +
    'td{padding:3px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;}' +
    'tr:nth-child(even) td{background:#f9fafb;}' +
    '.card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:12px;}' +
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
    '.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}' +
    '.metric{border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center;}' +
    '.metric-val{font-size:16pt;font-weight:700;font-family:monospace;}' +
    '.metric-lbl{font-size:8pt;color:#6b7280;margin-bottom:4px;}' +
    '.tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9pt;font-weight:600;}' +
    '.tag-draft{background:#fef3c7;color:#92400e;}' +
    '.tag-confirmed{background:#dcfce7;color:#14532d;}' +
    '.tag-returned{background:#fee2e2;color:#991b1b;}' +
    '.razlika-pos{color:#16a34a;}.razlika-neg{color:#dc2626;}.razlika-warn{color:#d97706;}' +
    '.doc-item{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f8fafc;border-radius:5px;margin-bottom:4px;border:1px solid #e2e8f0;}' +
    '.return-box{background:#fee2e2;border:2px solid #dc2626;border-radius:8px;padding:12px;margin-bottom:14px;}' +
    '@media print{.no-print{display:none!important;}button{display:none!important;}}' +
    '</style></head><body><div class="wrap">' +
    '<div style="text-align:center;padding:40px;color:#94a3b8;">⏳ Зареждане на данни...</div>' +
    '</div></body></html>');
  win.document.close();

  /* Зареди данните */
  var enc = encodeURIComponent(storeName);
  Promise.all([
    sbGet('kasa_reports', 'store_name=eq.' + enc + '&date=eq.' + date + '&order=pos_number.asc'),
    sbGet('kasa_glavna',  'store_name=eq.' + enc + '&date=eq.' + date),
    sbGet('kasa_zoborot', 'store_name=eq.' + enc + '&date=eq.' + date),
    sbGet('kasa_documents', 'store_name=eq.' + enc + '&date=eq.' + date + '&order=created_at.asc')
  ]).then(function(res) {
    var reps  = Array.isArray(res[0]) ? res[0] : [];
    var gl    = (Array.isArray(res[1]) && res[1].length) ? res[1][0] : null;
    var zob   = (Array.isArray(res[2]) && res[2].length) ? res[2][0] : null;
    var docs  = Array.isArray(res[3]) ? res[3] : [];

    var canReturn = ['admin','accounting'].indexOf(currentUser.role) >= 0;
    var hasReturned = reps.some(function(r) { return r.status === 'returned'; });

    function fm(v) { var n=parseFloat(v)||0; return (n<0?'– ':'')+Math.abs(n).toFixed(2)+' EUR'; }
    function rc(v) { var n=parseFloat(v)||0; return n===0?'razlika-pos':n<0?'razlika-neg':'razlika-warn'; }
    function statusTag(s) {
      if(s==='confirmed') return '<span class="tag tag-confirmed">✅ Потвърден</span>';
      if(s==='returned')  return '<span class="tag tag-returned">↩ Върнат за корекция</span>';
      return '<span class="tag tag-draft">✏️ Чернова</span>';
    }

    var BILLS=[500,200,100,50,20,10,5,2,1];
    var COINS=[0.5,0.2,0.1,0.05,0.02,0.01];
    var INKASO_D=[500,200,100,50,20,10,5];
    var DK={'500':'bills_500','200':'bills_200','100':'bills_100','50':'bills_50',
            '20':'bills_20','10':'bills_10','5':'bills_5','2':'bills_2','1':'bills_1',
            '0.5':'coins_50','0.2':'coins_20','0.1':'coins_10',
            '0.05':'coins_5','0.02':'coins_2','0.01':'coins_1'};

    function calcCounted(r) {
      var s=0;
      BILLS.concat(COINS).forEach(function(v){s+=Math.round((parseInt(r[DK[String(v)]])||0)*v*100)/100;});
      return Math.round(s*100)/100;
    }
    function calcInk(r) {
      var s=0; INKASO_D.forEach(function(v){s+=(parseInt(r['inkaso_'+v])||0)*v;});
      return Math.round(s*100)/100;
    }

    /* Totals */
    var tTurn=0,tCash=0,tCard=0,tCount=0,tRaz=0,tInkaso=0;
    reps.forEach(function(r){
      tTurn+=parseFloat(r.total_turnover)||0; tCash+=parseFloat(r.cash_turnover)||0;
      tCard+=parseFloat(r.card_turnover)||0;  tCount+=parseFloat(r.counted_cash)||0;
      tRaz+=parseFloat(r.razlika)||0;         tInkaso+=calcInk(r);
    });

    /* Return for revision section */
    var returnSection = '';
    if(hasReturned) {
      var retRep = reps.find(function(r){return r.return_reason;});
      returnSection = '<div class="return-box">' +
        '<div style="font-size:11pt;font-weight:700;color:#991b1b;margin-bottom:4px;">↩ Отчетът е върнат за корекция</div>' +
        '<div style="font-size:9.5pt;">Причина: ' + esc(retRep?retRep.return_reason:'') + '</div>' +
        '<div style="font-size:8.5pt;color:#6b7280;margin-top:4px;">Върнат от: ' + esc(retRep?retRep.returned_by:'') + '</div>' +
        '</div>';
    }

    var returnBtn = canReturn
      ? '<button onclick="returnForRevision(\'' + esc(storeName) + '\',\'' + date + '\')" ' +
        'style="border:1px solid #dc2626;background:#fee2e2;color:#dc2626;border-radius:6px;padding:7px 14px;font-size:10pt;cursor:pointer;margin-right:8px;">↩ Върни за корекция</button>'
      : '';

    /* POS reports HTML */
    var posHTML = reps.map(function(r) {
      var ink = calcInk(r);
      var counted = calcCounted(r);
      var raz = parseFloat(r.razlika)||0;
      return '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<h3>ПОС ' + esc(String(r.pos_number||'')) + ' — Каса ' + esc(String(r.kasa_number||'')) + ' — ' + esc(r.cashier_name||'') + '</h3>' +
          statusTag(r.status) +
        '</div>' +
        '<div class="grid3" style="margin-bottom:10px;">' +
          '<div class="metric"><div class="metric-lbl">Общ оборот</div><div class="metric-val">' + fm(r.total_turnover) + '</div></div>' +
          '<div class="metric"><div class="metric-lbl">В брой</div><div class="metric-val">' + fm(r.cash_turnover) + '</div></div>' +
          '<div class="metric"><div class="metric-lbl">Карта</div><div class="metric-val">' + fm(r.card_turnover) + '</div></div>' +
        '</div>' +
        '<div class="grid2">' +
          /* Купюри */
          '<div><h3>Отчетени купюри</h3><table><thead><tr><th>Ном.</th><th>Брой</th><th>Сума</th></tr></thead><tbody>' +
          BILLS.concat(COINS).map(function(v){
            var k=DK[String(v)]; var qty=parseInt(r[k])||0; if(!qty)return '';
            return '<tr><td>' + v + ' EUR</td><td style="text-align:center;font-family:monospace;">' + qty + '</td><td style="text-align:right;font-family:monospace;">' + (Math.round(qty*v*100)/100).toFixed(2) + '</td></tr>';
          }).join('') +
          '<tr style="font-weight:700;background:#f0fdf4;"><td colspan="2">Общо налични</td><td style="text-align:right;font-family:monospace;">' + counted.toFixed(2) + '</td></tr>' +
          '</tbody></table></div>' +
          /* Инкасо + Сторна + Отчет */
          '<div><h3>Инкасо & Резултат</h3>' +
          '<table><thead><tr><th>Ном.</th><th>Брой</th><th>Сума</th></tr></thead><tbody>' +
          INKASO_D.map(function(v){
            var qty=parseInt(r['inkaso_'+v])||0; if(!qty)return '';
            return '<tr><td>' + v + ' EUR</td><td style="text-align:center;">' + qty + '</td><td style="text-align:right;font-family:monospace;">' + (qty*v).toFixed(2) + '</td></tr>';
          }).join('') +
          '<tr style="font-weight:700;"><td colspan="2">Общо инкасо</td><td style="text-align:right;font-family:monospace;">' + ink.toFixed(2) + '</td></tr>' +
          '</tbody></table>' +
          '<table style="margin-top:8px;"><tbody>' +
          '<tr><td>Сторна</td><td style="text-align:right;font-family:monospace;">' + fm(r.storna_total) + '</td></tr>' +
          '<tr><td>В брой (отчет)</td><td style="text-align:right;font-family:monospace;">' + fm(r.cash_turnover) + '</td></tr>' +
          '<tr><td>Налични (броени)</td><td style="text-align:right;font-family:monospace;">' + fm(r.counted_cash) + '</td></tr>' +
          '<tr style="font-weight:700;border-top:2px solid #e2e8f0;"><td>РАЗЛИКА</td><td style="text-align:right;font-family:monospace;" class="' + rc(raz) + '">' + fm(raz) + '</td></tr>' +
          '</tbody></table></div>' +
        '</div>' +
      '</div>';
    }).join('');

    /* Главна каса HTML */
    var glHTML = gl ? '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<h3 style="margin:0;">Главна каса</h3>' + statusTag(gl.status) +
      '</div>' +
      '<div class="grid2">' +
        '<div><table><thead><tr><th>Ном.</th><th>Брой</th><th>Сума</th></tr></thead><tbody>' +
        BILLS.concat(COINS).map(function(v){
          var k=DK[String(v)]; var qty=parseInt(gl[k])||0; if(!qty)return '';
          return '<tr><td>' + v + ' EUR</td><td style="text-align:center;">' + qty + '</td><td style="text-align:right;font-family:monospace;">' + (Math.round(qty*v*100)/100).toFixed(2) + '</td></tr>';
        }).join('') +
        '<tr style="font-weight:700;background:#f0fdf4;"><td colspan="2">Главна налични</td><td style="text-align:right;font-family:monospace;">' + fm(gl.counted_cash) + '</td></tr>' +
        '</tbody></table></div>' +
        '<div><table><tbody>' +
        '<tr><td>Общо налични (всички)</td><td style="text-align:right;font-family:monospace;">' + fm(gl.counted_cash) + '</td></tr>' +
        '<tr><td>Служебно въведени</td><td style="text-align:right;font-family:monospace;">' + fm(gl.slujebno) + '</td></tr>' +
        '<tr><td>Наличност SAP</td><td style="text-align:right;font-family:monospace;">' + fm(gl.sap_balance) + '</td></tr>' +
        '<tr style="font-weight:700;border-top:2px solid #e2e8f0;"><td>РАЗЛИКА</td><td style="text-align:right;font-family:monospace;" class="' + rc(gl.razlika) + '">' + fm(gl.razlika) + '</td></tr>' +
        '</tbody></table></div>' +
      '</div></div>' : '<div class="card" style="color:#94a3b8;text-align:center;padding:20px;">Главна каса — не е попълнена</div>';

    /* Обобщен купюрен опис ПОС + Главна */
    var ALL_D2=BILLS.concat(COINS);
    var grandTotalDenom=0;
    var denomSummaryHTML='<div class="card"><h2>💵 Отчетени купюри по ПОС + Главна каса</h2>'+
      '<table><thead><tr>'+
      '<th>Ном.</th>'+
      reps.map(function(r){return '<th style="text-align:center;">ПОС '+esc(String(r.pos_number||''))+'<br><span style="font-weight:400;font-size:8pt;">'+esc(r.cashier_name||'')+'</span></th>';}).join('')+
      (gl?'<th style="text-align:center;background:#92400e;color:#fff;">Главна</th>':'')+
      '<th style="text-align:center;">Общо бр.</th>'+
      '<th style="text-align:right;">Сума</th>'+
      '</tr></thead><tbody>';
    ALL_D2.forEach(function(v){
      var k=DK[String(v)];
      var posQtys=reps.map(function(r){return parseInt(r[k])||0;});
      var posTotal=posQtys.reduce(function(a,b){return a+b;},0);
      var glQ=gl?(parseInt(gl[k])||0):0;
      var total=posTotal+glQ;
      var sum=Math.round(total*v*100)/100;
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

    /* Равнение HTML */
    var zobHTML = zob ? '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<h3 style="margin:0;">Равнение на оборота (POS Zoborot)</h3>' + statusTag(zob.status) +
      '</div>' +
      '<div class="grid2">' +
        '<div><h3>POS данни</h3><table><tbody>' +
        '<tr><td>В брой BGN</td><td style="text-align:right;font-family:monospace;">' + fm(zob.cash_bgn) + '</td></tr>' +
        '<tr><td>В брой EUR</td><td style="text-align:right;font-family:monospace;">' + fm(zob.cash_eur) + '</td></tr>' +
        '<tr><td>Карта EUR</td><td style="text-align:right;font-family:monospace;">' + fm(zob.card_eur) + '</td></tr>' +
        '<tr><td>Банков път EUR</td><td style="text-align:right;font-family:monospace;">' + fm(zob.bank_eur) + '</td></tr>' +
        '<tr><td>Ваучери EUR</td><td style="text-align:right;font-family:monospace;">' + fm(zob.voucheri) + '</td></tr>' +
        '<tr style="font-weight:700;"><td>POS оборот (без банков)</td><td style="text-align:right;font-family:monospace;">' + fm(zob.pos_no_bank) + '</td></tr>' +
        '</tbody></table></div>' +
        '<div><h3>Фискални устройства</h3><table><thead><tr><th>ФУ</th><th>Общ</th><th>Сторно</th><th>Чист</th></tr></thead><tbody>' +
        [1,2,3].map(function(n){
          return '<tr><td><b>ФУ ' + n + '</b></td><td style="font-family:monospace;">' + fm(zob['fu'+n+'_gross']) + '</td><td style="font-family:monospace;">' + fm(zob['fu'+n+'_discount']) + '</td><td style="font-family:monospace;font-weight:700;">' + fm(zob['fu'+n+'_net']) + '</td></tr>';
        }).join('') +
        '<tr style="font-weight:700;border-top:2px solid #e2e8f0;"><td colspan="3">Общо ФУ нетен</td><td style="font-family:monospace;" class="' + rc(0) + '">' + fm(zob.fu_total_net) + '</td></tr>' +
        '</tbody></table>' +
        '<div style="margin-top:10px;padding:10px;border-radius:6px;border:2px solid ' + (parseFloat(zob.razlika)===0?'#16a34a':'#dc2626') + ';text-align:center;">' +
          '<div style="font-size:8.5pt;text-transform:uppercase;color:#6b7280;">РАЗЛИКА</div>' +
          '<div style="font-size:16pt;font-weight:700;font-family:monospace;" class="' + rc(zob.razlika) + '">' + fm(zob.razlika) + '</div>' +
        '</div>' +
      '</div></div></div>' : '<div class="card" style="color:#94a3b8;text-align:center;padding:20px;">Равнение — не е попълнено</div>';

    /* Документи */
    var docsHTML = '<div class="card"><h3>📎 Прикачени документи (' + docs.length + ')</h3>' +
      (docs.length ? docs.map(function(d){
        return '<div class="doc-item">' +
          '<span style="font-size:16px;">' + (/\.pdf$/i.test(d.file_name)?'📄':'🖼️') + '</span>' +
          '<div style="flex:1;"><div style="font-size:10pt;font-weight:500;">' + esc(d.file_name) + '</div>' +
          '<div style="font-size:8.5pt;color:#6b7280;">' + esc(d.doc_type) + ' · ' + esc(d.uploaded_by||'') + '</div></div>' +
          '<button onclick="openKasaDocFromDetail(\'' + esc(d.file_url) + '\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:4px;padding:3px 10px;font-size:9pt;cursor:pointer;">Виж</button>' +
        '</div>';
      }).join('') : '<div style="color:#94a3b8;padding:10px 0;">Няма прикачени документи.</div>') +
    '</div>';

    var html2 = '<html><head><meta charset="UTF-8"><title>Детайлен преглед — ' + esc(storeName) + ' — ' + date + '</title>' +
      win.document.head.innerHTML + '</head><body><div class="wrap">' +
      '<div class="header">' +
        '<div><div style="font-size:14pt;font-weight:700;">📋 Детайлен касов преглед</div>' +
        '<div style="font-size:10pt;color:#9ca3af;margin-top:2px;">' + esc(storeName) + ' · ' + date + ' · ' + reps.length + ' ПОС отчета</div></div>' +
        '<div style="display:flex;gap:8px;" class="no-print">' +
          returnBtn +
          '<button onclick="window.print()" style="border:none;background:#2563eb;color:#fff;border-radius:6px;padding:7px 14px;font-size:10pt;cursor:pointer;">🖨 Принтирай / PDF</button>' +
        '</div>' +
      '</div>' +
      returnSection +
      '<div class="grid3" style="margin-bottom:14px;">' +
        '<div class="metric"><div class="metric-lbl">Общ оборот</div><div class="metric-val">' + fm(tTurn) + '</div></div>' +
        '<div class="metric"><div class="metric-lbl">Обща разлика ПОС</div><div class="metric-val ' + rc(tRaz) + '">' + fm(tRaz) + '</div></div>' +
        '<div class="metric"><div class="metric-lbl">Общо инкасо</div><div class="metric-val">' + fm(tInkaso) + '</div></div>' +
      '</div>' +
      '<h2>ПОС Отчети</h2>' + posHTML +
      '<h2>Главна каса</h2>' + glHTML +
      denomSummaryHTML +
      '<h2>Равнение на оборота</h2>' + zobHTML +
      '<h2>Документи</h2>' + docsHTML +
    '</div>' +
    '<script>' +
    'function openKasaDocFromDetail(path){' +
      'var encPath=path.split("/").map(function(s){return encodeURIComponent(s);}).join("/");' +
      'fetch("' + SB_STORAGE + '/object/sign/' + BUCKET + '/"+encPath, {' +
        'method:"POST",' +
        'headers:{"Authorization":"Bearer ' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA' + '","Content-Type":"application/json"},' +
        'body:JSON.stringify({expiresIn:3600})' +
      '}).then(function(r){return r.json();}).then(function(d){if(d.signedURL)window.open("' + 'https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1' + '"+d.signedURL,"_blank");else alert("Грешка: "+JSON.stringify(d));});' +
    '}' +
    'function returnForRevision(store, date){' +
      'var reason=prompt("Причина за връщане за корекция:");' +
      'if(!reason)return;' +
      'window.opener&&window.opener.returnKasaForRevision(store,date,reason);' +
      'window.close();' +
    '}' +
    '</scr' + 'ipt></body></html>';

    win.document.open(); win.document.write(html2); win.document.close();
  }).catch(function(e) {
    win.document.body.innerHTML = '<div style="padding:40px;color:#dc2626;">Грешка при зареждане: ' + e + '</div>';
  });
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
