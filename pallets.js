/* pallets.js — Транспорт > Палети
   Всеки магазин попълва (обичайно всеки петък) наличните празни палети по типове.
   Admin/accounting/logistics виждат обобщена матрица по всички обекти, за да преценят
   дали да заявят транспорт за прибиране/размяна на палети. */

var palletsData = [];      /* за store изглед: история на записите на текущия магазин */
var palletsEditId = null;
/* За admin изгледа — за експорта: всички редове от прозореца (90 дни) на
   обектите от матрицата, и самите обекти. Матрицата показва само последния. */
var palletsAdminRows = [];
var palletsAdminStores = [];

var PALLET_TYPES = [
  { key:'euro_pallets',        label:'Европалет 120*80' },
  { key:'small_pallets',       label:'Малък палет 60*80' },
  { key:'nonstandard_pallets', label:'Нестандартен палет' },
  { key:'grate_pallets',       label:'Скара' },
  { key:'bilka_pallets',       label:'Палет Билка' }
];
/* Снабдяване гледа палетите по всички обекти (то заявява транспорт за
   прибиране), но НЕ е глобална роля никъде другаде — затова локален чек,
   а не разширяване на isGlobal() в shared.js. */
function palletsIsGlobal(){ return isGlobal() || (currentUser && currentUser.role==='supply'); }

function palletsStaleness(dateStr){
  if(!dateStr) return { label:'Няма данни', color:'#dc2626', bg:'#fef2f2', days:null };
  var days=Math.floor((new Date(today())-new Date(dateStr))/86400000);
  if(days<=7)  return { label:fmtDate(dateStr), color:'#16a34a', bg:null,      days:days };
  if(days<=14) return { label:fmtDate(dateStr)+' ('+days+' дни)', color:'#d97706', bg:'#fffbeb', days:days };
  return          { label:fmtDate(dateStr)+' ('+days+' дни)', color:'#dc2626', bg:'#fef2f2', days:days };
}

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadPallets(){
  var wrap=document.getElementById('mod-pallets');if(!wrap)return;
  wrap.innerHTML='<div class="page"><div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div></div>';

  var lookback=new Date();lookback.setDate(lookback.getDate()-90);
  var lookbackStr=localDateISO(lookback);

  if(palletsIsGlobal()){
    Promise.all([
      sbGet('transport_pallets','report_date=gte.'+lookbackStr+'&order=report_date.desc'),
      /* Обектите идват от users, не от stores — същият източник и същият
         филтър (isReportableStore) като в отчетите и таб „Днес". stores
         държи и ЦО, складовете и обекти без потребители, затова матрицата
         показваше редове, които никога не подават палети. */
      sbGet('users','select=store_name&order=store_name')
    ]).then(function(res){
      var rows=Array.isArray(res[0])?res[0]:[];
      var seenS={};
      var storeNames=(Array.isArray(res[1])?res[1]:[]).filter(function(u){
        if(!isReportableStore(u.store_name)||seenS[u.store_name])return false;
        seenS[u.store_name]=1;return true;
      }).map(function(u){return u.store_name;});
      var latestByStore={};
      rows.forEach(function(r){ if(!latestByStore[r.store_name]) latestByStore[r.store_name]=r; });
      palletsAdminStores=storeNames;
      palletsAdminRows=rows.filter(function(r){return storeNames.indexOf(r.store_name)>=0;});
      renderPalletsAdmin(storeNames,latestByStore);
    }).catch(function(){palletsAdminStores=[];palletsAdminRows=[];renderPalletsAdmin([],{});});
  } else {
    sbGet('transport_pallets','store_name=eq.'+encodeURIComponent(currentUser.store_name)+'&report_date=gte.'+lookbackStr+'&order=report_date.desc').then(function(rows){
      palletsData=Array.isArray(rows)?rows:[];
      renderPalletsStore();
    }).catch(function(){palletsData=[];renderPalletsStore();});
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN ИЗГЛЕД — матрица по всички обекти
══════════════════════════════════════════════════════════════ */
function renderPalletsAdmin(storeNames,latestByStore){
  var wrap=document.getElementById('mod-pallets');if(!wrap)return;
  var missing=storeNames.filter(function(s){return !latestByStore[s];}).length;
  var stale=storeNames.filter(function(s){
    var r=latestByStore[s];if(!r)return false;
    var st=palletsStaleness(r.report_date);return st.days!==null&&st.days>7;
  }).length;

  /* Сборът е САМО по обектите в storeNames. Запис за обект извън списъка
     (склад, ЦО, закрит обект) не влиза, а обект без запис добавя 0 — не се
     пропуска мълчаливо, иначе „ОБЩО" щеше да изглежда като пълен сбор. */
  var withData=storeNames.filter(function(s){return !!latestByStore[s];}).length;
  /* Горната граница стои на всяка клетка, а не на <tr> — при border-collapse
     браузърът пропуска рамка, зададена на самия ред. */
  var footBrd='border-top:2px solid #cbd5e1;';
  var totals={};
  PALLET_TYPES.forEach(function(t){
    totals[t.key]=storeNames.reduce(function(sum,name){
      var r=latestByStore[name];
      return sum+(r?(parseInt(r[t.key])||0):0);
    },0);
  });

  var html='<div class="page">'+
    '<div class="pg-title">📦 Палети</div>'+
    '<div class="pg-sub">Наличности на празни палети по обекти — обичайно се попълва всеки петък. '+
    'Показва се ПОСЛЕДНАТА подадена наличност за всеки обект, а не сбор от седмиците.</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">'+
      '<div style="font-size:13px;color:var(--muted);">Общо обекти: <b>'+storeNames.length+'</b>'+
      (missing?' &nbsp;|&nbsp; <b style="color:#dc2626;">⚠️ '+missing+'</b> без данни':'')+
      (stale?' &nbsp;|&nbsp; <b style="color:#d97706;">🕓 '+stale+'</b> с остарели данни (>7 дни)':'')+
      '</div>'+
      '<button id="pallets-export-btn" onclick="exportPalletsExcel()" style="margin-left:auto;'+PALLETS_EXPORT_BTN_CSS+'">📊 Експорт Excel</button>'+
    '</div>'+
    '<div class="card"><div class="tbl-wrap"><table>'+
    '<thead><tr><th>Магазин</th>'+
      PALLET_TYPES.map(function(t){return '<th style="text-align:center;">'+t.label+'</th>';}).join('')+
      '<th>Изпратени с камион</th><th>Последно въведено</th>'+
    '</tr></thead><tbody>'+
    storeNames.slice().sort(function(a,b){return a.localeCompare(b,'bg');}).map(function(name){
      var r=latestByStore[name];
      var st=palletsStaleness(r?r.report_date:null);
      return '<tr'+(st.bg?' style="background:'+st.bg+';"':'')+'>'+
        '<td style="font-weight:600;">'+esc(name)+'</td>'+
        PALLET_TYPES.map(function(t){
          return '<td style="text-align:center;font-family:DM Mono,monospace;">'+(r?(parseInt(r[t.key])||0):'—')+'</td>';
        }).join('')+
        '<td style="font-size:12px;">'+esc(r&&r.sent_note||'')+'</td>'+
        '<td style="font-weight:600;color:'+st.color+';font-size:12px;white-space:nowrap;">'+st.label+'</td>'+
      '</tr>';
    }).join('')+
    '</tbody>'+
    '<tfoot><tr>'+
      '<td style="'+footBrd+'font-weight:700;">ОБЩО'+
        '<div style="font-size:11px;font-weight:400;color:var(--muted);">по данни от '+
          withData+' от '+storeNames.length+' обекта</div></td>'+
      PALLET_TYPES.map(function(t){
        return '<td style="'+footBrd+'text-align:center;font-family:DM Mono,monospace;font-weight:700;">'+totals[t.key]+'</td>';
      }).join('')+
      '<td style="'+footBrd+'"></td>'+
      '<td style="'+footBrd+'"></td>'+
    '</tr></tfoot>'+
    '</table></div></div>'+
  '</div>';

  wrap.innerHTML=html;
}

/* ═══════════════════════════════════════════════════════════════
   МАГАЗИНСКИ ИЗГЛЕД — форма за въвеждане + история
══════════════════════════════════════════════════════════════ */
/* Подаването е затворено от петък 17:00 до неделя 23:59 по часовника на
   устройството — отчетът тръгва в петък 18:00 и сравнява с предходното
   подаване, затова числата не бива да се менят след него. */
var PALLETS_LOCKED_MSG='Подаването за седмицата е затворено в петък 17:00. Отваря се отново в понеделник.';
function palletsIsLocked(now){
  var d=now||new Date();
  var wd=d.getDay();
  return wd===6||wd===0||(wd===5&&d.getHours()>=17);
}

function renderPalletsStore(){
  var wrap=document.getElementById('mod-pallets');if(!wrap)return;
  var latest=palletsData.length?palletsData[0]:null;
  var todays=palletsData.find(function(r){return r.report_date===today();})||null;
  var r=todays||{};
  var locked=palletsIsLocked(new Date());

  function numField(id,val){
    return '<input type="number" min="0" class="fi" id="'+id+'" value="'+(val||0)+'" style="text-align:center;">';
  }

  var html='<div class="page">'+
    '<div class="pg-title">📦 Палети</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+' — наличности на празни палети (попълва се до петък 17:00)</div>'+
    '<div style="margin-bottom:12px;"><button id="pallets-export-btn" onclick="exportPalletsExcel()" style="'+PALLETS_EXPORT_BTN_CSS+'">📊 Експорт Excel</button></div>'+

    '<div class="card" style="margin-bottom:14px;">'+
      '<div class="card-title">Въведи наличности</div>'+
      /* Датата е винаги днешната — без поле, за да не се пренаписва минала седмица. */
      '<div style="font-size:13px;color:var(--muted);margin-bottom:10px;">Дата: <b id="pf-date-text">'+fmtDate(today())+'</b></div>'+
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;">'+
        PALLET_TYPES.map(function(t){
          return '<div><label class="fl">'+t.label+'</label>'+numField('pf-'+t.key,r[t.key])+'</div>';
        }).join('')+
      '</div>'+
      '<label class="fl">Изпратени с камион (ако вече има изпратени палети)</label>'+
      '<input class="fi" id="pf-sent_note" value="'+escVal(r.sent_note)+'" placeholder="напр. 20 европалета изпратени на 05.08 към ЦО">'+
      (locked
        ?'<div id="pf-locked" style="margin-top:14px;padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;font-weight:600;">🔒 '+PALLETS_LOCKED_MSG+'</div>'
        :'<div style="margin-top:14px;"><button class="btn btn-green" onclick="submitPalletsForm()">💾 Запази</button></div>')+
    '</div>'+

    (latest?
      '<div class="card" style="margin-bottom:14px;background:#f8fafc;">'+
        '<div class="card-title">📊 Текущи наличности ('+fmtDate(latest.report_date)+')</div>'+
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">'+
          PALLET_TYPES.map(function(t){
            return '<div style="text-align:center;padding:10px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;">'+
              '<div style="font-size:11px;color:#64748b;">'+t.label+'</div>'+
              '<div style="font-size:18px;font-weight:700;font-family:DM Mono,monospace;">'+(parseInt(latest[t.key])||0)+'</div>'+
            '</div>';
          }).join('')+
        '</div>'+
      '</div>'
    :'')+

    (palletsData.length?
      '<div class="card"><div class="card-title">История (последните 90 дни)</div>'+
      '<div class="tbl-wrap"><table><thead><tr><th>Дата</th>'+
        PALLET_TYPES.map(function(t){return '<th style="text-align:center;">'+t.label+'</th>';}).join('')+
        '<th>Изпратени с камион</th></tr></thead><tbody>'+
        palletsData.map(function(row){
          return '<tr><td>'+fmtDate(row.report_date)+'</td>'+
            PALLET_TYPES.map(function(t){return '<td style="text-align:center;font-family:DM Mono,monospace;">'+(parseInt(row[t.key])||0)+'</td>';}).join('')+
            '<td style="font-size:12px;">'+esc(row.sent_note||'')+'</td></tr>';
        }).join('')+
      '</tbody></table></div></div>'
    :'<div class="card" style="text-align:center;padding:24px;color:#94a3b8;">Няма въведени наличности досега.</div>')+
  '</div>';

  wrap.innerHTML=html;
}

/* ─── SUBMIT ────────────────────────────────────────────────── */
function submitPalletsForm(){
  /* Таб, отворен преди 17:00, още показва бутона — проверката е и тук. */
  if(palletsIsLocked(new Date())){toast(PALLETS_LOCKED_MSG,'#dc2626');return;}
  var date=today();
  var p={
    store_name:currentUser.store_name,
    report_date:date,
    sent_note:((document.getElementById('pf-sent_note')||{}).value||'').trim(),
    updated_by:currentUser.display_name||currentUser.email,
    updated_at:new Date().toISOString()
  };
  PALLET_TYPES.forEach(function(t){
    p[t.key]=parseInt((document.getElementById('pf-'+t.key)||{}).value)||0;
  });

  var enc=encodeURIComponent(currentUser.store_name);
  sbGet('transport_pallets','store_name=eq.'+enc+'&report_date=eq.'+date).then(function(existing){
    var match=(Array.isArray(existing)&&existing.length)?existing[0]:null;
    if(!match) p.created_by=currentUser.display_name||currentUser.email;
    var req=match?sbPatch('transport_pallets','id=eq.'+match.id,p):sbPost('transport_pallets',p);
    req.then(function(res){
      if(!res.ok){toast('Грешка при запис','#dc2626');return;}
      toast('💾 Наличностите на палети са запазени!');
      loadPallets();
    });
  }).catch(function(){toast('Грешка при запис','#dc2626');});
}

/* ═══════════════════════════════════════════════════════════════
   ЕКСПОРТ EXCEL — каквото вижда потребителят: admin/accounting/logistics
   (isGlobal) — всички обекти от матрицата; магазин — само своя. Прозорецът е
   този на таба (90 дни), затова и старите подавания над него не влизат.
   Лист „Палети" — всеки ред, по обект и дата низходящо; след всеки тип „Δ
   <тип>", накрая „Предходно (общо)" и „Δ" — спрямо предходното подаване на
   СЪЩИЯ обект (празно при първо). „Проверка" = „⚠ спад" за тип с Δ <= −праг;
   прагът е app_settings 'pallets_drop_threshold', същото правило като в
   collectPalletsReportData (report.js): липсва/невалиден → 10.
   Лист „Обобщение" — последното по обект; без данни и остарели (>7 дни,
   palletsStaleness) отгоре; под тях ред с броя им и ред ОБЩО.
   Датите са истински Excel дати (Date + cellDates → тип 'd', dd.mm.yyyy).
   Удебеляване няма: безплатната SheetJS не записва стилове.
══════════════════════════════════════════════════════════════ */
var PALLETS_EXPORT_BTN_CSS='border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;';
var PALLETS_XLSX_SRC='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
var palletsXlsxLoading=false;

function palletsRowTotal(r){
  return PALLET_TYPES.reduce(function(s,t){return s+(parseInt(r[t.key])||0);},0);
}
/* Редовете и обектите, които потребителят има право да види. */
function palletsExportSource(){
  if(palletsIsGlobal()) return { rows:palletsAdminRows.slice(), stores:palletsAdminStores.slice() };
  var mine=currentUser.store_name;
  return { rows:palletsData.filter(function(r){return r.store_name===mine;}), stores:[mine] };
}
/* 'YYYY-MM-DD' → Date в МЕСТНА полунощ: SheetJS смята серийния номер по
   местния часовник, тоест полунощ дава цял ден, без изместване. */
function palletsXlsDate(iso){
  var p=String(iso||'').split('-');
  return p.length===3?new Date(+p[0],+p[1]-1,+p[2]):'';
}
/* Прагът — същото правило като storno_small_threshold / report.js. */
function palletsParseThreshold(rows){
  var row=(Array.isArray(rows)?rows:[]).find(function(x){return x&&x.key==='pallets_drop_threshold';});
  var raw=row&&row.value!=null?String(row.value).trim().replace(',','.'):'';
  var n=raw?Number(raw):NaN;
  return Number.isFinite(n)&&n>0?n:10;
}
var PALLETS_XLS_OPTS={cellDates:true,dateNF:'dd.mm.yyyy'};
/* Чиста — строи workbook-а с подадения XLSX и праг. Тестът я вика с фалшив. */
function palletsBuildWorkbook(X,thr){
  if(!(thr>0))thr=10;
  var src=palletsExportSource();
  var rows=src.rows.slice().sort(function(a,b){
    return String(a.store_name).localeCompare(String(b.store_name),'bg') ||
      (a.report_date<b.report_date?1:a.report_date>b.report_date?-1:0);
  });
  var head=['Обект','Дата на подаване','Подал'];
  PALLET_TYPES.forEach(function(t){head.push(t.label,'Δ '+t.label);});
  head=head.concat(['Общо','Предходно (общо)','Δ','Проверка','Изпратени с камион / коментар']);
  var aoa=[head];
  rows.forEach(function(r,i){
    var prev=rows[i+1]&&rows[i+1].store_name===r.store_name?rows[i+1]:null;
    var tot=palletsRowTotal(r), prevTot=prev?palletsRowTotal(prev):null;
    var line=[r.store_name||'',palletsXlsDate(r.report_date),r.updated_by||r.created_by||''];
    var drops=[];
    PALLET_TYPES.forEach(function(t){
      var v=parseInt(r[t.key])||0;
      var d=prev?v-(parseInt(prev[t.key])||0):'';
      if(prev&&d<=-thr)drops.push(t.label+' '+d);
      line.push(v,d);
    });
    aoa.push(line.concat([tot,prevTot===null?'':prevTot,prevTot===null?'':tot-prevTot,
      drops.length?'⚠ спад: '+drops.join(', '):'',r.sent_note||'']));
  });
  var wb=X.utils.book_new();
  var ws=X.utils.aoa_to_sheet(aoa,PALLETS_XLS_OPTS);
  ws['!cols']=[{wch:22},{wch:14},{wch:20}];
  PALLET_TYPES.forEach(function(){ws['!cols'].push({wch:12},{wch:8});});
  ws['!cols']=ws['!cols'].concat([{wch:8},{wch:10},{wch:6},{wch:28},{wch:36}]);
  X.utils.book_append_sheet(wb,ws,'Палети');

  /* Обобщение: първо без данни, после остарели, после актуални; по име. */
  var latest={};
  rows.forEach(function(r){ if(!latest[r.store_name]) latest[r.store_name]=r; });
  var rank=function(s){var r=latest[s];if(!r)return 0;var st=palletsStaleness(r.report_date);return st.days!==null&&st.days>7?1:2;};
  var stores=src.stores.slice().sort(function(a,b){return rank(a)-rank(b)||String(a).localeCompare(String(b),'bg');});
  var sum=[['Обект','Състояние','Последно подаване','Дни']
    .concat(PALLET_TYPES.map(function(t){return t.label;})).concat(['Общо','Изпратени с камион / коментар'])];
  /* ОБЩО — по последното подаване на всеки обект с данни (и остарелите),
     както редът ОБЩО в матрицата на таба. */
  var totals={}, grand=0, nMissing=0, nStale=0;
  PALLET_TYPES.forEach(function(t){totals[t.key]=0;});
  stores.forEach(function(s){
    var r=latest[s];
    if(!r){ nMissing++; sum.push([s,'Няма данни','','' ].concat(PALLET_TYPES.map(function(){return '';})).concat(['',''])); return; }
    var st=palletsStaleness(r.report_date);
    if(st.days>7)nStale++;
    PALLET_TYPES.forEach(function(t){totals[t.key]+=parseInt(r[t.key])||0;});
    grand+=palletsRowTotal(r);
    sum.push([s,st.days>7?'Остаряло (>7 дни)':'Актуално',palletsXlsDate(r.report_date),st.days]
      .concat(PALLET_TYPES.map(function(t){return parseInt(r[t.key])||0;})).concat([palletsRowTotal(r),r.sent_note||'']));
  });
  sum.push(['Без данни: '+nMissing+' · Остарели (>7 дни): '+nStale+' · Общо обекти: '+stores.length]);
  sum.push(['ОБЩО','по '+(stores.length-nMissing)+' от '+stores.length+' обекта','','']
    .concat(PALLET_TYPES.map(function(t){return totals[t.key];})).concat([grand,'']));
  var ws2=X.utils.aoa_to_sheet(sum,PALLETS_XLS_OPTS);
  ws2['!cols']=[{wch:22},{wch:18},{wch:16},{wch:6}].concat(PALLET_TYPES.map(function(){return {wch:12};}))
    .concat([{wch:8},{wch:36}]);
  X.utils.book_append_sheet(wb,ws2,'Обобщение');
  return { wb:wb, rows:rows.length, stores:stores.length };
}
function exportPalletsExcel(){
  if(!window.XLSX){
    /* Второ натискане, докато се зарежда — не добавя втори <script>. */
    if(palletsXlsxLoading){toast('⏳ Зарежда се SheetJS...');return;}
    palletsXlsxLoading=true;
    var s=document.createElement('script');
    s.src=PALLETS_XLSX_SRC;
    s.onload=function(){palletsXlsxLoading=false;exportPalletsExcel();};
    s.onerror=function(){palletsXlsxLoading=false;toast('Грешка при зареждане на SheetJS','#dc2626');};
    document.head.appendChild(s);return;
  }
  /* Прагът за „⚠ спад" — при провал на заявката 10, експортът не спира. */
  var write=function(thr){
    var out=palletsBuildWorkbook(window.XLSX,thr);
    window.XLSX.writeFile(out.wb,'ТеМАХ_Палети_'+today()+'.xlsx',{cellDates:true});
    toast('✅ Excel изтеглен! ('+out.rows+' подавания, '+out.stores+' обекта)');
  };
  /* silent: без червен toast — прагът има резерва, експортът не е провален.
     sbGet при грешка връща []; вторият аргумент на then е защита, ако
     някога започне да отхвърля. */
  sbGet('app_settings','key=eq.pallets_drop_threshold&select=key,value&limit=1',true)
    .then(palletsParseThreshold,function(){return 10;})
    .then(write);
}
