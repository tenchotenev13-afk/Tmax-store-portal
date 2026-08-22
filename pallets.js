/* pallets.js — Транспорт > Палети
   Всеки магазин попълва (обичайно всеки петък) наличните празни палети по типове.
   Admin/accounting/logistics виждат обобщена матрица по всички обекти, за да преценят
   дали да заявят транспорт за прибиране/размяна на палети. */

var palletsData = [];      /* за store изглед: история на записите на текущия магазин */
var palletsEditId = null;

var PALLET_TYPES = [
  { key:'euro_pallets',        label:'Европалет 120*80' },
  { key:'small_pallets',       label:'Малък палет 60*80' },
  { key:'nonstandard_pallets', label:'Нестандартен палет' },
  { key:'grate_pallets',       label:'Скара' },
  { key:'bilka_pallets',       label:'Палет Билка' }
];

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
  var lookbackStr=lookback.toISOString().slice(0,10);

  if(isGlobal()){
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
      renderPalletsAdmin(storeNames,latestByStore);
    }).catch(function(){renderPalletsAdmin([],{});});
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
function renderPalletsStore(){
  var wrap=document.getElementById('mod-pallets');if(!wrap)return;
  var latest=palletsData.length?palletsData[0]:null;
  var todays=palletsData.find(function(r){return r.report_date===today();})||null;
  var r=todays||{};

  function numField(id,val){
    return '<input type="number" min="0" class="fi" id="'+id+'" value="'+(val||0)+'" style="text-align:center;">';
  }

  var html='<div class="page">'+
    '<div class="pg-title">📦 Палети</div>'+
    '<div class="pg-sub">'+esc(currentUser.store_name)+' — наличности на празни палети (попълва се всеки петък)</div>'+

    '<div class="card" style="margin-bottom:14px;">'+
      '<div class="card-title">Въведи наличности</div>'+
      '<div class="form-grid" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">'+
        '<div><label class="fl">Дата</label><input type="date" class="fi" id="pf-date" value="'+(r.report_date||today())+'"></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;">'+
        PALLET_TYPES.map(function(t){
          return '<div><label class="fl">'+t.label+'</label>'+numField('pf-'+t.key,r[t.key])+'</div>';
        }).join('')+
      '</div>'+
      '<label class="fl">Изпратени с камион (ако вече има изпратени палети)</label>'+
      '<input class="fi" id="pf-sent_note" value="'+escVal(r.sent_note)+'" placeholder="напр. 20 европалета изпратени на 05.08 към ЦО">'+
      '<div style="margin-top:14px;"><button class="btn btn-green" onclick="submitPalletsForm()">💾 Запази</button></div>'+
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
  var date=(document.getElementById('pf-date')||{}).value||today();
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
