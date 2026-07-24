/* stock-differences.js — Стока за изтегляне по разлики */

var sdData   = [];
var sdFilter = 'pending';
var sdTypeFilter = 'all';
var sdEditId = null;
var sdSearch = '';

function canEditSD() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
function canAddSD() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}
/* Подаване на нова бланка за разлики - магазинска страна (същите роли като canEditTransit) */
function canSubmitDiff() {
  return currentUser && ['admin','accounting','logistics','manager','sklad','info'].indexOf(currentUser.role) >= 0;
}
/* Решение по разликата (Заприхождаване/Връщане/Липса) - само централен офис */
function canReviewDiff() {
  return currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
}
/* Изпращане на имейл до доставчик - Цветелина Тенева + admin (за тестване/подпомагане) */
function canSendDiffEmail() {
  if (!currentUser) return false;
  if ((currentUser.email||'').toLowerCase() === 'c.teneva@temax.bg') return true;
  return currentUser.role === 'admin';
}

var DIFF_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var DIFF_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var DIFF_BKT = 'bulletin-files'; /* преизползваме съществуващия bucket, отделен префикс на пътя */

var diffReports = [];       /* differences_reports - заредени бланки */
var diffPendingPhotos = []; /* снимки, качени в текущо отворената форма за подаване, преди submit */

function loadStockDiff() {
  var wrap = document.getElementById('mod-stock-diff');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  Promise.all([
    sbGet('stock_differences', 'order=created_at.desc.nullslast' + storeQ()),
    sbGet('differences_reports', 'order=created_at.desc' + storeQ())
  ]).then(function(res){
    sdData = Array.isArray(res[0]) ? res[0] : [];
    diffReports = Array.isArray(res[1]) ? res[1] : [];
    renderStockDiff();
  }).catch(function(err) {
    var w = document.getElementById('mod-stock-diff');
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
    console.error(err);
  });
}

function renderStockDiff() {
  var wrap = document.getElementById('mod-stock-diff');
  if (!wrap) return;
  var isAdmin = currentUser && ['admin','accounting','logistics'].indexOf(currentUser.role) >= 0;
  var canEdit = canEditSD();
  var canAdd  = canAddSD();

  var list = sdData.filter(function(r) {
    if (!r.type) return false; /* още не е прегледан от Цветелина - показва се само в секцията "За преглед" */
    if (sdTypeFilter !== 'all' && r.type !== sdTypeFilter) return false;
    if (sdFilter === 'pending') { if (r.status !== 'pending') return false; }
    else if (sdFilter === 'taken') { if (r.status !== 'taken') return false; }
    if (sdSearch) {
      var q = sdSearch.toLowerCase();
      var hay = [r.store_name,r.supplier,r.material_name,r.material_code,r.order_number,r.comment].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  var TYPE_LABELS = { writein:'📥 Заприхождаване', 'return':'↩️ Връщане', missing:'❓ Липса' };
  var TYPE_COLORS = { writein:'#2563eb', 'return':'#7c3aed', missing:'#dc2626' };

  var pending = sdData.filter(function(r){ return r.status==='pending'; }).length;
  var taken   = sdData.filter(function(r){ return r.status==='taken'; }).length;

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Заглавие */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="font-size:20px;font-weight:600;">📋 Разлики</div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  if (canSubmitDiff()) h += '<button onclick="openDiffSubmitModal()" style="border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">📝 Подай бланка</button>';
  if (canAdd) h += '<button onclick="openSDModal(null)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави ръчно</button>';
  h += '</div></div>';

  /* Важна бележка */
  h += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;font-weight:600;color:#856404;">'+
    '⚠️ ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС И Е В ДОБЪР ТЪРГОВСКИ ВИД!'+
    '</div>';

  /* Новоподадени бланки - чакат преглед от Цветелина */
  h += renderDiffReportsSection();

  /* Карти */
  h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;max-width:400px;">';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #f59e0b;"><div style="font-size:11px;color:#64748b;">⏳ Невзета</div><div style="font-size:28px;font-weight:700;color:#f59e0b;font-family:DM Mono,monospace;">'+pending+'</div></div>';
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;border-left:3px solid #16a34a;"><div style="font-size:11px;color:#64748b;">✅ Взета</div><div style="font-size:28px;font-weight:700;color:#16a34a;font-family:DM Mono,monospace;">'+taken+'</div></div>';
  h += '</div>';

  /* Филтър по тип */
  var typeCounts = { writein:0, 'return':0, missing:0 };
  sdData.forEach(function(r){ if(r.type && typeCounts.hasOwnProperty(r.type)) typeCounts[r.type]++; });
  h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
  [['all','Всички типове'],['writein','📥 Заприхождаване ('+typeCounts.writein+')'],['return','↩️ Връщане ('+typeCounts['return']+')'],['missing','❓ Липса ('+typeCounts.missing+')']].forEach(function(f){
    var a = sdTypeFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setSDTypeFilter(this.dataset.f)" style="border:1px solid '+(a?'#0f172a':'#e2e8f0')+';padding:4px 12px;border-radius:40px;font-size:11.5px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#fff')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  /* Търсене */
  h += '<input id="sd-search-input" value="'+esc(sdSearch)+'" oninput="setSDSearch(this.value)" placeholder="🔍 Търси по магазин, доставчик, артикул, SAP, поръчка..." style="width:100%;max-width:420px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px;font-size:12.5px;font-family:inherit;margin-bottom:10px;display:block;">';

  /* Филтри */
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  [['all','Всички ('+sdData.length+')'],['pending','⏳ Невзета ('+pending+')'],['taken','✅ Взета ('+taken+')']].forEach(function(f){
    var a = sdFilter===f[0];
    h += '<button data-f="'+f[0]+'" onclick="setSDFilter(this.dataset.f)" style="border:none;padding:5px 14px;border-radius:40px;font-size:12px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+f[1]+'</button>';
  });
  h += '</div>';

  /* Таблица */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;background:#fff;border-radius:10px;border:1px solid #e2e8f0;"><div style="font-size:40px;">📋</div><div style="margin-top:8px;">Няма записи.</div></div>';
  } else {
    h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;overflow-x:auto;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;">';
    h += '<thead><tr style="background:#f8fafc;">';
    ['Тип','Магазин','Доставчик','Материал','Наименование','Кол.','Поръчка','Дата потвърд.','Статус','Кредитно','Коментар',''].forEach(function(c){
      h += '<th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">'+c+'</th>';
    });
    h += '</tr></thead><tbody>';

    list.forEach(function(r) {
      var isTaken = r.status === 'taken';
      var statusBadge = isTaken
        ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">✅ ВЗЕТА</span>'
        : '<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">⏳ НЕВЗЕТА</span>';
      /* Кредитно известие - релевантно само за тип "Липса" (доставчикът не ни е
         доставил артикула, трябва финансово да ни компенсира) */
      var creditCell = '—';
      if (r.type === 'missing') {
        creditCell = canEdit
          ? '<button data-id="'+r.id+'" onclick="sdToggleCreditNote(this.dataset.id)" style="border:none;border-radius:20px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;background:'+(r.credit_note_issued?'#f0fdf4':'#fef2f2')+';color:'+(r.credit_note_issued?'#16a34a':'#dc2626')+';">'+(r.credit_note_issued?'✅ Издадено':'❌ Няма')+'</button>'
          : (r.credit_note_issued?'<span style="color:#16a34a;">✅ Издадено</span>':'<span style="color:#dc2626;">❌ Няма</span>');
      }

      h += '<tr style="border-bottom:1px solid #f1f5f9;">'+
        '<td style="padding:7px 10px;white-space:nowrap;"><span style="background:'+(TYPE_COLORS[r.type]||'#94a3b8')+'1a;color:'+(TYPE_COLORS[r.type]||'#64748b')+';padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">'+(TYPE_LABELS[r.type]||r.type||'—')+'</span></td>'+
        '<td style="padding:7px 10px;font-weight:500;">'+esc(r.store_name||'')+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#64748b;">'+esc(r.supplier||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.material_code||'')+'</td>'+
        '<td style="padding:7px 10px;max-width:200px;">'+esc(r.material_name||'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:600;">'+((r.quantity)||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+esc(r.order_number||'')+'</td>'+
        '<td style="padding:7px 10px;font-family:DM Mono,monospace;font-size:11px;">'+fmtDate(r.confirmed_date)+'</td>'+
        '<td style="padding:7px 10px;">'+statusBadge+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">'+creditCell+'</td>'+
        '<td style="padding:7px 10px;font-size:11px;color:#d97706;font-weight:500;">'+esc(r.comment||'')+'</td>'+
        '<td style="padding:7px 10px;white-space:nowrap;">';

      if (canEdit && !isTaken) {
        var takenLabel = r.type==='return' ? '✅ Върната' : r.type==='missing' ? '✅ Изписана' : '✅ Приета';
        h += '<button data-id="'+r.id+'" onclick="sdMarkTaken(this.dataset.id)" style="border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:2px;">'+takenLabel+'</button>';
      }
      if (canEdit) {
        h += '<button data-id="'+r.id+'" onclick="openSDModal(this.dataset.id)" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin-right:2px;">✏️</button>';
      }
      if (isAdmin) {
        h += '<button data-id="'+r.id+'" onclick="sdDelete(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;">✕</button>';
      }
      h += '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">'+list.length+' от '+sdData.length+' записа.</div>';
  }

  h += '</div>';
  h += sdModalHtml();
  wrap.innerHTML = h;
}

/* ── Бутони за решение по ред (само canReviewDiff) ── */
function diffLineResolveButtons(l){
  var TYPE_LABELS={writein:'📥 Заприх.',return:'↩️ Връщане',missing:'❓ Липса'};
  if(!canReviewDiff()){
    if(l.type) return '<span style="color:#16a34a;font-weight:600;">✓ '+(TYPE_LABELS[l.type]||l.type)+'</span>';
    return '<span style="color:#94a3b8;">чака преглед</span>';
  }
  /* Бутоните остават кликаеми и СЛЕД избор - текущият избор е открояван,
     но може да се коригира директно с 1 клик, ако е избран грешен тип. */
  var mk=function(type,label,color){
    var active=l.type===type;
    return '<button data-id="'+l.id+'" onclick="resolveDiffLine(this.dataset.id,\''+type+'\')" title="'+(active?'Текущ избор — кликни друг бутон, за да коригираш':'Кликни, за да избереш')+'" style="border:none;background:'+(active?color:color+'1a')+';color:'+(active?'#fff':color)+';border-radius:5px;padding:3px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">'+(active?'✓ ':'')+label+'</button>';
  };
  return '<div style="display:flex;gap:3px;flex-wrap:wrap;">'+
    mk('writein','📥 Заприх.','#2563eb')+
    mk('return','↩️ Връщане','#7c3aed')+
    mk('missing','❓ Липса','#dc2626')+
  '</div>';
}
/* Автоматично създава запис в "За връщане" (source='diff'), когато разлика бъде
   решена като "Връщане" - проверява за вече съществуващ, за да не дублира
   при евентуална повторна корекция (напр. Връщане -> Липса -> пак Връщане). */
function autoCreateReturnFromDiff(line,cb){
  sbGet('stock_returns','diff_line_id=eq.'+line.id+'&limit=1').then(function(existing){
    if(Array.isArray(existing)&&existing.length){ cb(); return; }
    var data={
      store_name:line.store_name,
      supplier:line.supplier,
      product_name:line.material_name,
      sap_code:line.material_code,
      quantity:line.quantity,
      reason:'Излишък от разлика'+(line.supplier?' — '+line.supplier:''),
      status:'pending',
      source:'diff',
      diff_line_id:line.id,
      created_by:currentUser.display_name||currentUser.email
    };
    sbPost('stock_returns',data).then(function(){ cb(); }).catch(function(){ cb(); });
  }).catch(function(){ cb(); });
}
function resolveDiffLine(id,type){
  if(!canReviewDiff()){toast('Нямаш права за това действие','#dc2626');return;}
  var line=sdData.find(function(x){return String(x.id)===String(id);});
  if(!line)return;
  sbPatch('stock_differences','id=eq.'+id,{type:type,status:'pending'}).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    line.type=type; line.status='pending'; /* локално, за незабавна проверка по-долу без чакане на reload */
    var finish=function(){
      var siblingLines=sdData.filter(function(x){return x.report_id===line.report_id;});
      var allResolved = siblingLines.length>0 && siblingLines.every(function(x){return !!x.type;});
      if(allResolved && line.report_id){
        sbPatch('differences_reports','id=eq.'+line.report_id,{reviewed:true}).then(function(){
          toast('✅ Решено — бланката е напълно прегледана!');
          loadStockDiff();
        });
      } else {
        toast('✅ Записано!');
        loadStockDiff();
      }
    };
    if(type==='return'){
      autoCreateReturnFromDiff(line,finish);
    } else {
      finish();
    }
  });
}

function setSDFilter(f) { sdFilter=f; renderStockDiff(); }
function setSDTypeFilter(f) { sdTypeFilter=f; renderStockDiff(); }
/* Пре-рендира при търсене, но запазва фокуса/позицията на курсора в полето -
   иначе всяко натискане на клавиш би "изритвало" потребителя от полето. */
function setSDSearch(val){
  sdSearch=val;
  var hadFocus = document.activeElement && document.activeElement.id==='sd-search-input';
  var cursorPos = hadFocus ? document.activeElement.selectionStart : null;
  renderStockDiff();
  if(hadFocus){
    var el=document.getElementById('sd-search-input');
    if(el){ el.focus(); if(cursorPos!=null) el.setSelectionRange(cursorPos,cursorPos); }
  }
}

/* Превключва статус "Издадено кредитно известие" - релевантно само за тип "Липса" */
function sdToggleCreditNote(id){
  var line=sdData.find(function(x){return String(x.id)===String(id);});
  if(!line)return;
  var newVal=!line.credit_note_issued;
  sbPatch('stock_differences','id=eq.'+id,{credit_note_issued:newVal}).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    line.credit_note_issued=newVal;
    toast(newVal?'✅ Маркирано като издадено':'Маркирано като неиздадено');
    renderStockDiff();
  });
}
function sdMarkTaken(id) {
  if (!confirm('Маркирай стоката като ВЗЕТА?')) return;
  sbPatch('stock_differences','id=eq.'+id,{status:'taken'}).then(function(r){
    if(!r.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Маркирана като взета!'); loadStockDiff();
  });
}

function sdDelete(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('stock_differences','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadStockDiff(); });
}

/* ── МОДАЛ ── */
function sdModalHtml() {
  var r = sdEditId ? (sdData.find(function(x){return x.id===sdEditId;})||{}) : {};
  var isEdit = !!sdEditId;
  var storeOpts = '<option value="">-- Избери магазин --</option>';
  var stores = assignedStores();
  if (stores) {
    stores.forEach(function(s){ storeOpts += '<option'+(r.store_name===s?' selected':'')+'>'+esc(s)+'</option>'; });
  }

  return '<div class="bov" id="sd-ov"><div class="bmod" style="width:540px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави стока за изтегляне')+'</div>'+
    '<button onclick="closeSDModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;font-weight:600;color:#856404;">'+
    '⚠️ ЗАПРИХОЖДАВАТЕ САМО АКО СТОКАТА Е ПРИ ВАС И Е В ДОБЪР ТЪРГОВСКИ ВИД!</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Магазин *</label>'+(function(){
    var myS=assignedStores();
    if(myS&&myS.length===1)return '<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="sd-store" value="'+esc(myS[0])+'">';
    if(myS&&myS.length>1)return '<select class="fi" id="sd-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>';
    return '<select class="fi" id="sd-store"><option value="">-- Зарежда се... --</option></select>';
  })()+'</div>'+
    '<div><label class="fl">Доставчик</label><input class="fi" id="sd-supplier" value="'+esc(r.supplier||'')+'" placeholder="напр. ТАГЕМАЛ"></div>'+
    '<div><label class="fl">Код на материал (SAP)</label><input class="fi" id="sd-mat" value="'+esc(r.material_code||'')+'" placeholder="напр. 34989"></div>'+
    '<div><label class="fl">Количество</label><input type="number" step="0.01" class="fi" id="sd-qty" value="'+(r.quantity||'')+'"></div>'+
    '</div>'+

    '<label class="fl">Наименование *</label>'+
    '<input class="fi" id="sd-name" value="'+esc(r.material_name||'')+'" placeholder="напр. ЩУЦЕР ЗА МАРКУЧ МЕТАЛЕН С РЕЗБА 1&quot; ПРАВ">'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Поръчка</label><input class="fi" id="sd-order" value="'+esc(r.order_number||'')+'" placeholder="напр. 4100135756"></div>'+
    '<div><label class="fl">Дата потвърдена актуализация</label><input type="date" class="fi" id="sd-cdate" value="'+(r.confirmed_date||'')+'"></div>'+
    '</div>'+

    '<label class="fl">Тип на решение</label>'+
    '<select class="fi" id="sd-type">'+
    '<option value=""'+(isEdit&&!r.type?' selected':'')+'>— Още не е решено —</option>'+
    '<option value="writein"'+((r.type==='writein'||!isEdit)?' selected':'')+'>📥 Заприхождаване</option>'+
    '<option value="return"'+(r.type==='return'?' selected':'')+'>↩️ Връщане</option>'+
    '<option value="missing"'+(r.type==='missing'?' selected':'')+'>❓ Липса</option>'+
    '</select>'+

    '<label class="fl">Статус</label>'+
    '<select class="fi" id="sd-status">'+
    '<option value="pending"'+(r.status==='pending'||!r.status?' selected':'')+'>⏳ НЕВЗЕТА</option>'+
    '<option value="taken"'+(r.status==='taken'?' selected':'')+'>✅ ВЗЕТА</option>'+
    '</select>'+

    '<label class="fl">Коментар</label>'+
    '<input class="fi" id="sd-comment" value="'+esc(r.comment||'')+'" placeholder="напр. ЗАПРИХОДЕТЕ С РЕВИЗИЯ / ЧАКАМЕ">'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeSDModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitSD()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
}

function openSDModal(id) {
  sdEditId = id;
  renderStockDiff();
  var ov = document.getElementById('sd-ov');
  if (!ov) return;
  /* Магазин: автоматично или dropdown */
  var myStores = assignedStores();
  var storeEl = document.getElementById('sd-store');
  if (storeEl) {
    if (myStores && myStores.length === 1) {
      storeEl.outerHTML = '<div class="fi" style="background:#f8fafc;font-weight:500;">🏪 '+esc(myStores[0])+'</div><input type="hidden" id="sd-store" value="'+esc(myStores[0])+'">';
    } else if (myStores && myStores.length > 1) {
      storeEl.innerHTML = '<option value="">-- Избери --</option>'+myStores.map(function(s){return '<option>'+esc(s)+'</option>';}).join('');
    } else {
      sbGet('users','select=store_name&order=store_name').then(function(data){
        var el = document.getElementById('sd-store');
        if(Array.isArray(data)&&el){
          var seen={};
          el.innerHTML='<option value="">-- Избери --</option>'+data.filter(function(u){
            if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
            seen[u.store_name]=1;return true;
          }).map(function(u){return '<option>'+esc(u.store_name)+'</option>';}).join('');
          /* Избери текущия магазин при редактиране */
          var cur = sdEditId ? (sdData.find(function(x){return x.id===sdEditId;}))||{} : {};
          if(cur.store_name) el.value = cur.store_name;
        }
      });
    }
  }
    ov.classList.add('open');
}
function closeSDModal() {
  var ov=document.getElementById('sd-ov'); if(ov)ov.classList.remove('open');
  sdEditId=null;
}

function submitSD() {
  var store=(document.getElementById('sd-store').value||'').trim();
  var name=(document.getElementById('sd-name').value||'').trim();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!name){toast('Въведи наименование','#dc2626');return;}
  var data={
    store_name:     store,
    supplier:       document.getElementById('sd-supplier').value,
    material_code:  document.getElementById('sd-mat').value,
    material_name:  name,
    quantity:       parseFloat(document.getElementById('sd-qty').value)||null,
    order_number:   document.getElementById('sd-order').value,
    confirmed_date: document.getElementById('sd-cdate').value||null,
    type:           document.getElementById('sd-type').value||null,
    status:         document.getElementById('sd-status').value,
    comment:        document.getElementById('sd-comment').value,
    created_by:     currentUser.display_name||currentUser.email
  };
  var p = sdEditId
    ? sbPatch('stock_differences','id=eq.'+sdEditId,data)
    : sbPost('stock_differences',data);
  p.then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeSDModal();
    toast('✅ '+(sdEditId?'Записано!':'Добавено!'));
    loadStockDiff();
  });
}

/* ══════════════════════════════════════════
   ПОДАВАНЕ НА БЛАНКА ЗА РАЗЛИКИ (магазинска страна)
══════════════════════════════════════════ */

var DIFF_CATEGORIES = [
  /* [key, label, посоки[], снимки задължителни?, подсказка за доп. имейл] */
  ['undelivered','📦 Недоставен артикул (липса)', ['supplier','interstore'], true, null],
  ['excess','📈 Излишък (получен в повече)', ['supplier','interstore'], false, null],
  ['wrong_item','❌ Грешен артикул (не е поръчван)', ['supplier'], false, null],
  ['pack_mismatch','📦 Разлика от фабрична опаковка', ['interstore'], true, 'm.pavlova@temax.bg'],
  ['damaged','💔 Увредена стока / липсват части', ['supplier','interstore'], true, null],
  ['wrong_barcode','🏷️ Грешен баркод / етикет / описание', ['supplier','interstore'], true, 'j.jeliazkov@temax.bg, m.pavlova@temax.bg'],
  ['similar_item','🎨 Сходен артикул (различен цвят/размер)', ['interstore'], false, 'm.pavlova@temax.bg (за ZPACK корекция)']
];
function diffCatMeta(key){
  return DIFF_CATEGORIES.find(function(c){return c[0]===key;}) || null;
}
/* Опции за <select>, филтрирани по посока - доставчик и междускладов трансфер
   имат различни, невзаимозаменяеми списъци категории (по реалните бланки) */
function diffCategoryOptionsForDirection(direction,selected){
  var list=DIFF_CATEGORIES.filter(function(c){return c[2].indexOf(direction)>=0;});
  return '<option value="">-- категория --</option>'+list.map(function(c){
    return '<option value="'+c[0]+'"'+(selected===c[0]?' selected':'')+'>'+c[1]+'</option>';
  }).join('');
}
function diffCategoryLabel(v){
  var f=DIFF_CATEGORIES.find(function(c){return c[0]===v;});
  return f?f[1]:(v||'—');
}

/* ── Секция с подадени бланки (чакат преглед) ── */
function renderDiffReportsSection(){
  var unreviewed = diffReports.filter(function(r){return !r.reviewed;});
  if(!unreviewed.length) return '';
  var h='<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:14px;">';
  h+='<div style="font-size:14px;font-weight:700;color:#5b21b6;margin-bottom:10px;">🆕 Нови подадени бланки — чакат преглед ('+unreviewed.length+')</div>';
  unreviewed.forEach(function(rep){
    var lines = sdData.filter(function(x){return x.report_id===rep.id;});
    h+='<div style="background:#fff;border:1px solid #e9d5ff;border-radius:8px;padding:12px;margin-bottom:8px;">';
    h+='<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
    h+='<div><span style="font-weight:700;">🏪 '+esc(rep.store_name||'')+'</span>'+
       '<span style="color:#94a3b8;font-size:12px;margin-left:8px;">'+(rep.direction==='supplier'?'📦 Доставчик':'🔄 Междускладов')+' — '+esc(rep.counterpart||'')+'</span></div>'+
       '<div style="display:flex;align-items:center;gap:8px;">'+
       '<span style="font-size:11px;color:#94a3b8;">'+fmtDate(rep.doc_date)+(rep.document_number?' · Док. '+esc(rep.document_number):'')+'</span>'+
       (rep.email_sent_at?'<span style="font-size:10.5px;color:#16a34a;font-weight:600;">✉️ Изпратен '+fmtDate(rep.email_sent_at)+'</span>':'')+
       (canSendDiffEmail()?'<button data-rid="'+rep.id+'" onclick="openDiffEmailModal(this.dataset.rid)" style="border:none;background:#0ea5e9;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;">✉️ Изпрати имейл</button>':'')+
       '</div>';
    h+='</div>';
    if(lines.length){
      var repIsSupplier=rep.direction==='supplier';
      h+='<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6px;">';
      h+='<tr style="color:#94a3b8;text-align:left;"><th style="padding:3px 6px;">SAP</th><th style="padding:3px 6px;">Артикул</th><th style="padding:3px 6px;">Категория</th><th style="padding:3px 6px;text-align:right;">По вх. дост.</th>'+
        (repIsSupplier?'<th style="padding:3px 6px;text-align:right;">По стокова</th>':'')+
        '<th style="padding:3px 6px;text-align:right;">Реално</th><th style="padding:3px 6px;">Коментар</th><th style="padding:3px 6px;">Решение</th></tr>';
      lines.forEach(function(l){
        h+='<tr style="border-top:1px solid #f1f5f9;">'+
          '<td style="padding:3px 6px;font-family:DM Mono,monospace;">'+esc(l.material_code||'')+'</td>'+
          '<td style="padding:3px 6px;">'+esc(l.material_name||'')+'</td>'+
          '<td style="padding:3px 6px;">'+diffCategoryLabel(l.difference_category)+'</td>'+
          '<td style="padding:3px 6px;text-align:right;">'+(l.quantity!=null?l.quantity:'—')+'</td>'+
          (repIsSupplier?'<td style="padding:3px 6px;text-align:right;">'+(l.quantity_supplier_doc!=null?l.quantity_supplier_doc:'—')+'</td>':'')+
          '<td style="padding:3px 6px;text-align:right;">'+(l.quantity_received!=null?l.quantity_received:'—')+'</td>'+
          '<td style="padding:3px 6px;color:#64748b;">'+esc(l.comment||'')+'</td>'+
          '<td style="padding:3px 6px;white-space:nowrap;">'+diffLineResolveButtons(l)+'</td>'+
        '</tr>';
      });
      h+='</table>';
    }
    if(rep.general_comment) h+='<div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-bottom:6px;">💬 '+esc(rep.general_comment)+'</div>';
    var photos = Array.isArray(rep.photos)?rep.photos:[];
    if(photos.length){
      h+='<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      photos.forEach(function(p){
        h+='<a href="'+esc(p.url)+'" target="_blank"><img src="'+esc(p.url)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
      });
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  return h;
}

/* ── Динамични редове с артикули за формата за подаване ── */
/* lookupCatalogBySap() вече живее в shared.js - споделена с client-orders.js/transport.js */

function diffItemRowHtml(item,direction){
  item=item||{};
  direction=direction||'interstore';
  var catOpts=diffCategoryOptionsForDirection(direction,item.category);
  var meta=item.category?diffCatMeta(item.category):null;
  return '<div class="diff-item-row" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">'+
    '<div style="display:grid;grid-template-columns:1fr 2fr;gap:6px;margin-bottom:6px;">'+
      '<input class="fi di-sap" placeholder="SAP №" value="'+escVal(item.sap)+'" onblur="lookupCatalogBySap(this)">'+
      '<input class="fi di-name" placeholder="Наименование на артикула *" value="'+escVal(item.name)+'">'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:'+(direction==='supplier'?'1fr 1fr 1fr 1fr':'1fr 1fr 1fr')+';gap:6px;margin-bottom:6px;">'+
      '<input type="number" step="0.001" class="fi di-qty" placeholder="По вх. доставка" value="'+(item.qty!=null?item.qty:'')+'">'+
      (direction==='supplier'?'<input type="number" step="0.001" class="fi di-qty-supdoc" placeholder="По стокова на дост." value="'+(item.qtySupplierDoc!=null?item.qtySupplierDoc:'')+'">':'')+
      '<input type="number" step="0.001" class="fi di-qty-real" placeholder="Реално получено" value="'+(item.qtyReal!=null?item.qtyReal:'')+'">'+
      '<select class="fi di-unit">'+unitOptionsHtml(item.unit)+'</select>'+
    '</div>'+
    '<div style="margin-bottom:6px;"><select class="fi di-cat" style="width:100%;" onchange="updateDiffItemHint(this)">'+catOpts+'</select></div>'+
    '<div class="di-hint"></div>'+
    '<div style="display:flex;gap:6px;">'+
      '<input class="fi di-comment" placeholder="Коментар (незадължително)" style="flex:1;" value="'+escVal(item.comment)+'">'+
      '<button type="button" onclick="removeDiffItemRow(this)" style="border:none;background:#fee2e2;color:#991b1b;border-radius:5px;padding:0 10px;cursor:pointer;">✕</button>'+
    '</div>'+
  '</div>';
}
/* Показва инлайн подсказка под артикула, когато категорията е избрана -
   задължителни снимки и/или кой допълнително трябва да получи имейл */
function updateDiffItemHint(selectEl){
  var row=selectEl.closest('.diff-item-row');
  var hintEl=row?row.querySelector('.di-hint'):null;
  if(!hintEl)return;
  var meta=diffCatMeta(selectEl.value);
  if(!meta){hintEl.innerHTML='';return;}
  var photosReq=meta[3], notifyHint=meta[4];
  if(!photosReq&&!notifyHint){hintEl.innerHTML='';return;}
  var parts=[];
  if(photosReq)parts.push('📸 <b>Задължителни снимки</b> за тази категория');
  if(notifyHint)parts.push('✉️ Нужен доп. имейл до: <b>'+esc(notifyHint)+'</b>');
  hintEl.innerHTML='<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:5px 8px;font-size:11px;color:#92400e;margin:-2px 0 6px;">'+parts.join(' &nbsp;·&nbsp; ')+'</div>';
}
function renderDiffItemRows(items){
  var el=document.getElementById('diff-items'); if(!el)return;
  if(!items||!items.length)items=[{}];
  var dirEl=document.getElementById('diff-direction');
  var direction=dirEl?dirEl.value:'interstore';
  el.innerHTML=items.map(function(it){return diffItemRowHtml(it,direction);}).join('');
}
function addDiffItemRow(){
  var el=document.getElementById('diff-items'); if(!el)return;
  var dirEl=document.getElementById('diff-direction');
  var direction=dirEl?dirEl.value:'interstore';
  el.insertAdjacentHTML('beforeend',diffItemRowHtml({},direction));
}
function removeDiffItemRow(btn){
  var row=btn.closest('.diff-item-row'); if(!row)return;
  var container=row.parentNode;
  if(container.querySelectorAll('.diff-item-row').length<=1){toast('Трябва поне 1 артикул','#dc2626');return;}
  container.removeChild(row);
}
/* Като collectDiffItems(), но пази ВСИЧКИ редове (дори без въведено име) -
   ползва се само за запазване на въведените данни при смяна на посоката,
   когато layout-ът на редовете трябва да се пре-рендира (полето "По стокова
   на доставчика" се появява/скрива според избраната посока). */
function collectDiffItemsForRedraw(){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  var items=[];
  rows.forEach(function(row){
    var supDocEl=row.querySelector('.di-qty-supdoc');
    items.push({
      sap:row.querySelector('.di-sap').value,
      name:row.querySelector('.di-name').value,
      qty:parseFloat(row.querySelector('.di-qty').value)||null,
      qtySupplierDoc:supDocEl?(parseFloat(supDocEl.value)||null):null,
      qtyReal:parseFloat(row.querySelector('.di-qty-real').value)||null,
      unit:row.querySelector('.di-unit').value||'бр.',
      category:row.querySelector('.di-cat').value||null,
      comment:row.querySelector('.di-comment').value
    });
  });
  return items.length?items:[{}];
}
function collectDiffItems(){
  var rows=document.querySelectorAll('#diff-items .diff-item-row');
  var items=[];
  rows.forEach(function(row){
    var name=row.querySelector('.di-name').value.trim();
    if(!name)return;
    var supDocEl=row.querySelector('.di-qty-supdoc');
    items.push({
      sap:row.querySelector('.di-sap').value.trim(),
      name:name,
      qty:parseFloat(row.querySelector('.di-qty').value)||null,
      qtySupplierDoc:supDocEl?(parseFloat(supDocEl.value)||null):null,
      qtyReal:parseFloat(row.querySelector('.di-qty-real').value)||null,
      unit:row.querySelector('.di-unit').value||'бр.',
      category:row.querySelector('.di-cat').value||null,
      comment:row.querySelector('.di-comment').value.trim()
    });
  });
  return items;
}

/* ── Снимки - качване към Storage, събрани преди submit ── */
/* Компресира снимка чрез canvas - смалява до maxDim по дългата страна и преизкодира като JPEG.
   Ако файлът не е снимка (напр. видео), се връща непроменен. */
function diffCompressImage(file,maxDim,quality){
  return new Promise(function(resolve){
    if(!file.type||file.type.indexOf('image/')!==0){ resolve(file); return; }
    try{
      var url=URL.createObjectURL(file);
      var img=new Image();
      img.onload=function(){
        URL.revokeObjectURL(url);
        try{
          var w=img.width,h=img.height;
          var scale=Math.min(1,maxDim/Math.max(w,h));
          var cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
          var canvas=document.createElement('canvas');
          canvas.width=cw; canvas.height=ch;
          var ctx=canvas.getContext('2d');
          if(!ctx){resolve(file);return;}
          ctx.drawImage(img,0,0,cw,ch);
          canvas.toBlob(function(blob){ resolve(blob||file); },'image/jpeg',quality);
        }catch(err){ resolve(file); }
      };
      img.onerror=function(){ try{URL.revokeObjectURL(url);}catch(e){} resolve(file); };
      img.src=url;
    }catch(err){ resolve(file); }
  });
}
function diffUploadPhoto(input){
  var files=Array.from(input.files||[]);
  if(!files.length)return;
  var wrap=document.getElementById('diff-photos-wrap');
  files.forEach(function(file){
    var placeholderId='ph-'+Math.random().toString(36).slice(2,10);
    if(wrap) wrap.insertAdjacentHTML('beforeend','<div id="'+placeholderId+'" style="width:56px;height:56px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;">⏳</div>');
    diffCompressImage(file,1600,0.75).then(function(compressed){
      var isImg=file.type&&file.type.indexOf('image/')===0;
      var ext=isImg?'jpg':((file.name.split('.').pop()||'bin').toLowerCase());
      var ctype=isImg?'image/jpeg':(file.type||'application/octet-stream');
      var path='differences/'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.'+ext;
      var reader=new FileReader();
      reader.onload=function(e){
        fetch(DIFF_SB+'/storage/v1/object/'+DIFF_BKT+'/'+path,{
          method:'POST',
          headers:{'Authorization':'Bearer '+DIFF_KEY,'Content-Type':ctype,'x-upsert':'true'},
          body:e.target.result
        }).then(function(r){return r.ok;}).then(function(ok){
          var ph=document.getElementById(placeholderId);
          if(!ok){ if(ph) ph.outerHTML='<div style="width:56px;height:56px;border-radius:6px;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:16px;">⚠️</div>'; return; }
          var pub=DIFF_SB+'/storage/v1/object/public/'+DIFF_BKT+'/'+path;
          diffPendingPhotos.push({url:pub,name:file.name});
          if(ph) ph.outerHTML='<a href="'+esc(pub)+'" target="_blank"><img src="'+esc(pub)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>';
        }).catch(function(){
          var ph2=document.getElementById(placeholderId);
          if(ph2) ph2.outerHTML='<div style="width:56px;height:56px;border-radius:6px;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:16px;">⚠️</div>';
        });
      };
      reader.readAsArrayBuffer(compressed);
    });
  });
  input.value='';
}

/* ── Модал за подаване ── */
function diffSubmitModalHtml(){
  var myS=assignedStores();
  var storeField;
  if(myS&&myS.length===1) storeField='<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myS[0])+'</div><input type="hidden" id="diff-store" value="'+esc(myS[0])+'">';
  else if(myS&&myS.length>1) storeField='<select class="fi" id="diff-store"><option value="">-- Избери --</option>'+myS.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select>';
  else storeField='<select class="fi" id="diff-store"><option value="">-- Зарежда се... --</option></select>';

  return '<div class="bov" id="diff-submit-ov"><div class="bmod" style="width:640px;max-height:88vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:16px;font-weight:700;">📝 Подай бланка за разлики</div>'+
    '<button onclick="closeDiffSubmitModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'+
    '<div><label class="fl">Посока *</label><select class="fi" id="diff-direction" onchange="updateDiffCounterpartLabel()">'+
      '<option value="interstore">🔄 Междускладов трансфер</option>'+
      '<option value="supplier">📦 Доставчик</option>'+
    '</select></div>'+
    '<div><label class="fl">Магазин *</label>'+storeField+'</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'+
    '<div><label class="fl" id="diff-counterpart-label">Обект изпращач</label><select class="fi" id="diff-counterpart"></select></div>'+
    '<div><label class="fl">Документ №</label><input class="fi" id="diff-docnum" placeholder="напр. 4600179694"></div>'+
    '</div>'+
    '<div style="margin-bottom:12px;"><label class="fl">Дата на получаване/доставка</label><input type="date" class="fi" id="diff-docdate" value="'+today()+'" style="max-width:200px;"></div>'+

    '<label class="fl">Артикули с разлика *</label>'+
    '<div id="diff-items"></div>'+
    '<button type="button" onclick="addDiffItemRow()" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-bottom:12px;">+ Добави артикул</button>'+

    '<label class="fl">Снимки <span style="color:#94a3b8;font-weight:400;">(задължителни при увредена стока, грешен баркод, разлика от опаковка, липса)</span></label>'+
    '<div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;">'+
      '<label style="border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'+
        '📷 Снимай сега<input type="file" accept="image/*" capture="environment" onchange="diffUploadPhoto(this)" style="display:none;">'+
      '</label>'+
      '<label style="border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'+
        '🖼️ Избери от галерия<input type="file" accept="image/*" multiple onchange="diffUploadPhoto(this)" style="display:none;">'+
      '</label>'+
    '</div>'+
    '<div id="diff-photos-wrap" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div>'+

    '<label class="fl">Общ коментар</label>'+
    '<textarea class="fi" id="diff-comment" rows="2" placeholder="Допълнителна информация за случая..."></textarea>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeDiffSubmitModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitDiffReport()" style="border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✅ Подай бланка</button>'+
    '</div></div></div>';
}
function updateDiffCounterpartLabel(){
  var dir=document.getElementById('diff-direction').value;
  var lbl=document.getElementById('diff-counterpart-label');
  var sel=document.getElementById('diff-counterpart');
  if(dir==='supplier'){
    lbl.textContent='Доставчик';
    loadAllSuppliers().then(function(list){
      sel.innerHTML='<option value="">-- Избери доставчик --</option>'+list.map(function(n){return '<option>'+esc(n)+'</option>';}).join('');
    });
  } else {
    lbl.textContent='Обект изпращач';
    loadAllStores().then(function(){
      fillStoreSelect(sel,'');
    });
  }
  /* Пре-рендираме редовете с layout-а на новата посока (полето "По стокова на
     доставчика" се появява само за посока "Доставчик") - пазим вече въведените данни */
  var preserved=collectDiffItemsForRedraw();
  renderDiffItemRows(preserved);
  preserved.forEach(function(it,i){
    if(!it.category)return;
    var rows=document.querySelectorAll('#diff-items .diff-item-row');
    var catSel=rows[i]?rows[i].querySelector('.di-cat'):null;
    if(catSel)updateDiffItemHint(catSel);
  });
}

function openDiffSubmitModal(){
  diffPendingPhotos=[];
  var old=document.getElementById('diff-submit-ov'); if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',diffSubmitModalHtml());
  renderDiffItemRows([{}]);
  var ov=document.getElementById('diff-submit-ov');
  ov.classList.add('open');
  updateDiffCounterpartLabel(); /* зарежда магазини (посоката по подразбиране е "Междускладов")*/

  var myStores=assignedStores();
  if(!(myStores&&myStores.length)){
    sbGet('users','select=store_name&order=store_name').then(function(data){
      var el=document.getElementById('diff-store');
      if(Array.isArray(data)&&el){
        var seen={};
        el.innerHTML='<option value="">-- Избери --</option>'+data.filter(function(u){
          if(!u.store_name||u.store_name==='Централен офис'||seen[u.store_name])return false;
          seen[u.store_name]=1;return true;
        }).map(function(u){return '<option>'+esc(u.store_name)+'</option>';}).join('');
      }
    });
  }
}
function closeDiffSubmitModal(){
  var ov=document.getElementById('diff-submit-ov'); if(ov)ov.remove();
  diffPendingPhotos=[];
}

function submitDiffReport(){
  var store=(document.getElementById('diff-store').value||'').trim();
  var direction=document.getElementById('diff-direction').value||'interstore';
  var counterpart=document.getElementById('diff-counterpart').value.trim();
  var items=collectDiffItems();
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!items.length){toast('Добави поне един артикул с наименование','#dc2626');return;}

  /* Реална проверка за задължителни снимки (не само текстова подсказка) -
     ако поне 1 артикул е с категория, изискваща снимки, а няма качена нито 1 */
  var needsPhotos=items.some(function(it){
    var meta=it.category?diffCatMeta(it.category):null;
    return meta&&meta[3];
  });
  if(needsPhotos&&!diffPendingPhotos.length){
    var catsNeeding=items.filter(function(it){var m=it.category?diffCatMeta(it.category):null;return m&&m[3];})
      .map(function(it){return diffCategoryLabel(it.category);})
      .filter(function(v,i,arr){return arr.indexOf(v)===i;});
    toast('📸 Снимки са задължителни за: '+catsNeeding.join(', '),'#dc2626');
    return;
  }

  var reportData={
    direction:direction,
    store_name:store,
    counterpart:counterpart,
    document_number:document.getElementById('diff-docnum').value.trim(),
    doc_date:document.getElementById('diff-docdate').value||null,
    submitted_by:currentUser.display_name||currentUser.email,
    general_comment:document.getElementById('diff-comment').value.trim(),
    photos:diffPendingPhotos,
    reviewed:false
  };

  sbPost('differences_reports',reportData).then(function(res){
    if(!res.ok){toast('Грешка при запис на бланката','#dc2626');return;}
    /* PostgREST с Prefer:return=minimal не връща id - взимаме последния запис по store+created_at */
    sbGet('differences_reports','store_name=eq.'+encodeURIComponent(store)+'&order=created_at.desc&limit=1').then(function(rows){
      var report=Array.isArray(rows)&&rows[0]?rows[0]:null;
      if(!report){toast('Бланката е записана, но има забавяне при синхронизация - опреснете страницата','#d97706');closeDiffSubmitModal();loadStockDiff();return;}
      var lines=items.map(function(it){
        return {
          report_id:report.id,
          store_name:store,
          supplier:counterpart,
          material_code:it.sap,
          material_name:it.name,
          quantity:it.qty,
          quantity_supplier_doc:it.qtySupplierDoc,
          quantity_received:it.qtyReal,
          difference_category:it.category,
          unit:it.unit,
          comment:it.comment,
          status:'new',
          created_by:currentUser.display_name||currentUser.email
        };
      });
      fetch(DIFF_SB+'/rest/v1/stock_differences',{
        method:'POST',
        headers:{'apikey':DIFF_KEY,'Authorization':'Bearer '+DIFF_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify(lines)
      }).then(function(r2){
        if(!r2.ok){toast('Бланката е записана, но артикулите не се записаха - виж конзолата','#dc2626');console.error('stock_differences batch insert failed');closeDiffSubmitModal();loadStockDiff();return;}
        closeDiffSubmitModal();
        toast('✅ Бланката е подадена! Цветелина ще я прегледа.');
        loadStockDiff();
      });
    });
  });
}

/* ══════════════════════════════════════════
   ИМЕЙЛ ДО ДОСТАВЧИК/ИЗПРАЩАЧ (само Цветелина Тенева)
══════════════════════════════════════════ */

function diffEmailBodyHtml(rep,lines){
  var h='<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">';
  h+='<p>Здравейте,</p>';
  h+='<p>Установени са разлики при '+(rep.direction==='supplier'?'приемане на доставка':'междускладов трансфер')+' — '+esc(rep.counterpart||'')+
     (rep.document_number?', документ №'+esc(rep.document_number):'')+
     (rep.doc_date?', дата '+fmtDate(rep.doc_date):'')+'.</p>';
  var isSupplier=rep.direction==='supplier';
  h+='<table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;">';
  h+='<tr style="background:#f3f4f6;"><th style="border:1px solid #ccc;padding:6px;text-align:left;">SAP №</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Артикул</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Категория</th><th style="border:1px solid #ccc;padding:6px;text-align:right;">По вх. доставка</th>'+
    (isSupplier?'<th style="border:1px solid #ccc;padding:6px;text-align:right;">По стокова на дост.</th>':'')+
    '<th style="border:1px solid #ccc;padding:6px;text-align:right;">Реално</th><th style="border:1px solid #ccc;padding:6px;text-align:left;">Коментар</th></tr>';
  lines.forEach(function(l){
    h+='<tr><td style="border:1px solid #ccc;padding:6px;">'+esc(l.material_code||'')+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;">'+esc(l.material_name||'')+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;">'+diffCategoryLabel(l.difference_category)+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;text-align:right;">'+(l.quantity!=null?l.quantity:'—')+'</td>'+
       (isSupplier?'<td style="border:1px solid #ccc;padding:6px;text-align:right;">'+(l.quantity_supplier_doc!=null?l.quantity_supplier_doc:'—')+'</td>':'')+
       '<td style="border:1px solid #ccc;padding:6px;text-align:right;">'+(l.quantity_received!=null?l.quantity_received:'—')+'</td>'+
       '<td style="border:1px solid #ccc;padding:6px;">'+esc(l.comment||'')+'</td></tr>';
  });
  h+='</table>';
  if(rep.general_comment) h+='<p><strong>Допълнителна информация:</strong> '+esc(rep.general_comment)+'</p>';
  var photos=Array.isArray(rep.photos)?rep.photos:[];
  if(photos.length) h+='<p>📎 Прикачени са '+photos.length+' снимк'+(photos.length===1?'а':'и')+' към този имейл.</p>';
  h+='<p>Моля за обратна връзка относно решението по случая.</p>';
  h+='<p>Поздрави,<br>'+esc(currentUser.display_name||currentUser.email)+'<br>ТеМАХ</p>';
  h+='</div>';
  return h;
}

function diffEmailModalHtml(rep,lines){
  var subject=(rep.document_number?rep.document_number+' - ':'')+'РАЗЛИКИ ('+esc(rep.store_name||'')+')';
  return '<div class="bov" id="diff-email-ov"><div class="bmod" style="width:680px;max-height:90vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:16px;font-weight:700;">✉️ Изпрати имейл до '+(rep.direction==='supplier'?'доставчик':'изпращач')+'</div>'+
    '<button onclick="closeDiffEmailModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    '<label class="fl">До (имейл на '+(rep.direction==='supplier'?'доставчика':'обекта изпращач')+') *</label>'+
    '<input class="fi" id="de-to" list="de-supplier-list" placeholder="name@supplier.bg">'+
    '<datalist id="de-supplier-list"></datalist>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">'+
    '<div><label class="fl">Копие до (CC)</label><input class="fi" id="de-cc" value="'+esc(currentUser.email||'')+'"></div>'+
    '<div><label class="fl">Отговори на (Reply-To)</label><input class="fi" id="de-reply" value="'+esc(currentUser.email||'')+'"></div>'+
    '</div>'+

    '<label class="fl" style="margin-top:8px;">Тема</label>'+
    '<input class="fi" id="de-subject" value="'+esc(subject)+'">'+

    '<label class="fl" style="margin-top:8px;">Съдържание</label>'+
    '<textarea class="fi" id="de-body-note" rows="2" placeholder="(незадължително) кратко въведение отгоре на автоматичната таблица..."></textarea>'+

    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-top:8px;max-height:220px;overflow-y:auto;font-size:12px;">'+
    diffEmailBodyHtml(rep,lines)+
    '</div>'+

    '<div style="font-size:12px;color:#64748b;margin-top:8px;" id="de-photos-note">📎 Ще бъдат прикачени '+((rep.photos||[]).length)+' снимк'+((rep.photos||[]).length===1?'а':'и')+' от бланката.</div>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeDiffEmailModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button id="de-send-btn" data-rid="'+rep.id+'" onclick="sendDiffEmail(this.dataset.rid)" style="border:none;background:#0ea5e9;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">✉️ Изпрати</button>'+
    '</div></div></div>';
}

function openDiffEmailModal(reportId){
  if(!canSendDiffEmail()){toast('Само Цветелина Тенева може да изпраща имейли до доставчици','#dc2626');return;}
  var rep=diffReports.find(function(r){return String(r.id)===String(reportId);});
  if(!rep){toast('Бланката не е намерена','#dc2626');return;}
  var lines=sdData.filter(function(x){return x.report_id===rep.id;});
  var old=document.getElementById('diff-email-ov'); if(old)old.remove();
  document.body.insertAdjacentHTML('beforeend',diffEmailModalHtml(rep,lines));
  document.getElementById('diff-email-ov').classList.add('open');
  if(rep.counterpart) document.getElementById('de-to').value=''; /* оставяме празно - Цветелина избира от списъка или пише ръчно */

  /* Автоматично предлагане на имейл на доставчика от Контакти */
  sbGet('contacts','category=eq.supplier&order=name').then(function(rows){
    if(!Array.isArray(rows))return;
    var dl=document.getElementById('de-supplier-list');
    if(!dl)return;
    dl.innerHTML=rows.filter(function(c){return c.email;}).map(function(c){
      return '<option value="'+esc(c.email)+'">'+esc(c.name||'')+'</option>';
    }).join('');
    /* ако името на доставчика/изпращача съвпада приблизително с контакт - предлагаме директно */
    if(rep.counterpart){
      var match=rows.find(function(c){return c.email && c.name && c.name.toLowerCase().indexOf(rep.counterpart.toLowerCase())>=0;});
      var toEl=document.getElementById('de-to');
      if(match && toEl) toEl.value=match.email;
    }
  });
}
function closeDiffEmailModal(){
  var ov=document.getElementById('diff-email-ov'); if(ov)ov.remove();
}

function diffUrlToBase64(url){
  return fetch(url).then(function(r){return r.blob();}).then(function(blob){
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onloadend=function(){ resolve(String(reader.result).split(',')[1]||''); };
      reader.onerror=reject;
      reader.readAsDataURL(blob);
    });
  });
}

function sendDiffEmail(reportId){
  if(!canSendDiffEmail()){toast('Нямаш права за това действие','#dc2626');return;}
  var rep=diffReports.find(function(r){return String(r.id)===String(reportId);});
  if(!rep){toast('Бланката не е намерена','#dc2626');return;}
  var to=(document.getElementById('de-to').value||'').trim();
  if(!to){toast('Въведи имейл на получателя','#dc2626');return;}
  var cc=(document.getElementById('de-cc').value||'').trim();
  var replyTo=(document.getElementById('de-reply').value||'').trim();
  var subject=(document.getElementById('de-subject').value||'').trim()||'РАЗЛИКИ';
  var note=(document.getElementById('de-body-note').value||'').trim();
  var lines=sdData.filter(function(x){return x.report_id===rep.id;});

  var bodyHtml=(note?'<p style="font-family:Arial,sans-serif;font-size:14px;">'+esc(note)+'</p>':'')+diffEmailBodyHtml(rep,lines);

  var btn=document.getElementById('de-send-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Подготвям снимките...';}

  var photos=Array.isArray(rep.photos)?rep.photos:[];
  Promise.all(photos.map(function(p){
    return diffUrlToBase64(p.url).then(function(b64){ return {filename:p.name||'снимка.jpg',content:b64}; }).catch(function(){ return null; });
  })).then(function(atts){
    var attachments=atts.filter(Boolean);
    if(btn) btn.textContent='⏳ Изпращане...';
    return sendEmail(to,subject,bodyHtml,{cc:cc||undefined,reply_to:replyTo||undefined,attachments:attachments});
  }).then(function(res){
    if(!res.ok){
      toast('Грешка при изпращане: '+(res.data&&res.data.message?res.data.message:'—'),'#dc2626');
      if(btn){btn.disabled=false;btn.textContent='✉️ Изпрати';}
      return;
    }
    toast('✅ Имейлът е изпратен!');
    sbPatch('differences_reports','id=eq.'+rep.id,{email_sent_at:new Date().toISOString()}).then(function(){
      closeDiffEmailModal();
      loadStockDiff();
    });
  }).catch(function(err){
    toast('Грешка: '+(err.message||err),'#dc2626');
    if(btn){btn.disabled=false;btn.textContent='✉️ Изпрати';}
  });
}
