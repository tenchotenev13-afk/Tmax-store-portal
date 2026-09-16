/* supply.js — Транспорт > Зареждане (Етапи 1–2)

   Обектите попълват веднъж седмично бланка по шаблон (първата: Колоранти) —
   колко бройки да им се заредят. Схемата е в supply-schema.sql:
   supply_templates -> supply_template_items -> supply_entries.

   Един ред в supply_entries = артикул × обект × седмица, където седмицата е
   понеделникът на ISO седмицата (supplyWeekStart). Празно поле се записва като
   null, не 0: „0" е отговор („нямаме"), празното не е.

   Етап 1: магазинът попълва. Етап 2: ЦО/isGlobal() вижда кой е попълнил и
   матрица артикули × обекти за избрана седмица, с Excel износ. Редакцията на
   шаблоните е Етап 3.

   Всички глобални имена са с префикс supply* / SUPPLY_*, DOM id-тата — sup-*.

   ЗАВИСИМОСТИ (shared.js, зарежда се преди този файл): sbGet/sbPost/sbPatch,
   sbErrMsg, esc, escAttr, toast, fmtDate, localDateISO, isGlobal,
   isCentralOfficeUser, loadReportableStores, API, H. SheetJS (XLSX) се
   зарежда динамично от cdnjs при износ, както в history.js. */

var supplyTemplates = [];   /* активните шаблони за текущия изглед */
var supplyItems = [];       /* артикулите на тези шаблони */
var supplyEntries = [];     /* записите на обекта за текущата седмица */
var supplyPrevEntries = []; /* записите на обекта за предишната седмица */
var supplyWeek = '';        /* седмицата, за която е рендирана формата */
var supplySaving = {};      /* templateId -> true, докато тече запис */

/* Понеделникът на ISO седмицата на дадена дата (по подразбиране днес), като
   местна дата 'YYYY-MM-DD'. Неделя е последният ден от седмицата, не първият. */
function supplyWeekStart(d){
  d = d ? new Date(d.getTime()) : new Date();
  d.setHours(12,0,0,0); /* обед — местеното с дни не пресича полунощ при смяна на часа */
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateISO(d);
}
function supplyAddDays(iso, n){
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDateISO(d);
}
/* Обектът вижда шаблона, ако target_stores е null (всички) или съдържа името му. */
function supplyTemplateForStore(t, store){
  return !t.target_stores || (Array.isArray(t.target_stores) && t.target_stores.indexOf(store) >= 0);
}
/* ЦО се третира като глобален изглед дори с роля извън isGlobal() —
   Централният офис не попълва бланки за зареждане. */
function supplyIsOverview(){
  return isGlobal() || isCentralOfficeUser();
}
function supplyQtyText(v){ return (v === null || v === undefined) ? '—' : String(v); }
function supplyFmtStamp(ts){
  if(!ts) return '—';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '—';
  return fmtDate(localDateISO(d)) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/* ─── LOAD ──────────────────────────────────────────────────── */
function loadSupply(){
  var wrap = document.getElementById('mod-supply'); if(!wrap) return;
  wrap.innerHTML = '<div class="page"><div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div></div>';
  supplyWeek = supplyWeekStart();
  if(supplyIsOverview()){ supplyOvWeek = supplyWeek; supplyOvReload(); return; }

  sbGet('supply_templates', 'active=eq.true&order=sort_order,name').then(function(tpls){
    tpls = Array.isArray(tpls) ? tpls.filter(function(t){ return t.active !== false; }) : [];
    var store = currentUser.store_name;
    supplyTemplates = tpls.filter(function(t){ return supplyTemplateForStore(t, store); });
    if(!supplyTemplates.length){ renderSupplyStore(); return; }

    var ids = supplyTemplates.map(function(t){ return t.id; });
    var prev = supplyAddDays(supplyWeek, -7);
    return Promise.all([
      sbGet('supply_template_items', 'template_id=in.(' + ids.join(',') + ')&active=eq.true&order=sort_order'),
      sbGet('supply_entries', 'store_name=eq.' + encodeURIComponent(store) +
        '&week_start=in.(' + supplyWeek + ',' + prev + ')&template_id=in.(' + ids.join(',') + ')')
    ]).then(function(res){
      /* Филтрите се повтарят и тук: редовете, които не са за тази бланка,
         обект и седмица, не бива да попаднат във формата, каквото и да върне заявката. */
      supplyItems = (Array.isArray(res[0]) ? res[0] : []).filter(function(i){
        return ids.indexOf(i.template_id) >= 0 && i.active !== false;
      }).sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); });
      var entries = (Array.isArray(res[1]) ? res[1] : []).filter(function(e){ return e.store_name === store; });
      supplyEntries = entries.filter(function(e){ return e.week_start === supplyWeek; });
      supplyPrevEntries = entries.filter(function(e){ return e.week_start === prev; });
      renderSupplyStore();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   МАГАЗИНСКИ ИЗГЛЕД — форма по шаблон
══════════════════════════════════════════════════════════════ */
function renderSupplyStore(){
  var wrap = document.getElementById('mod-supply'); if(!wrap) return;
  var head = '<div class="pg-title">🎨 Зареждане</div>' +
    '<div class="pg-sub">' + esc(currentUser.store_name) + ' — седмица от ' + fmtDate(supplyWeek) + '</div>';

  if(!supplyTemplates.length){
    wrap.innerHTML = '<div class="page">' + head +
      '<div class="card" style="text-align:center;padding:24px;color:#94a3b8;">За вашия обект няма активни бланки.</div></div>';
    return;
  }

  var html = '<div class="page">' + head;
  supplyTemplates.forEach(function(t){
    var items = supplyItems.filter(function(i){ return i.template_id === t.id; });
    var byItem = {}, prevByItem = {};
    supplyEntries.forEach(function(e){ byItem[e.item_id] = e; });
    supplyPrevEntries.forEach(function(e){ prevByItem[e.item_id] = e; });
    var two = !!t.col2_label;

    /* „Последно запазено" — най-новият запис на обекта за седмицата по тази бланка. */
    var last = null;
    items.forEach(function(i){
      var e = byItem[i.id]; if(!e) return;
      var ts = e.updated_at || e.created_at;
      if(ts && (!last || ts > last.ts)) last = { ts: ts, by: e.updated_by || e.created_by };
    });

    html += '<div class="card" id="sup-card-' + escAttr(t.id) + '" style="margin-bottom:14px;">' +
      '<div class="card-title">' + esc(t.name) + '</div>' +
      (t.instructions ? '<div style="font-size:13px;color:var(--muted);margin-bottom:10px;white-space:pre-line;">' + esc(t.instructions) + '</div>' : '') +
      (last ? '<div class="sup-last" style="font-size:12px;color:#16a34a;margin-bottom:8px;">Последно запазено: ' + supplyFmtStamp(last.ts) + ' от ' + esc(last.by) + '</div>' : '') +
      '<div class="tbl-wrap"><table><thead><tr>' +
        '<th>САП</th><th>Име</th><th>Доставчик</th>' +
        '<th style="text-align:center;">' + esc(t.col1_label) + '</th>' +
        (two ? '<th style="text-align:center;">' + esc(t.col2_label) + '</th>' : '') +
        '<th style="text-align:center;">Миналата седмица</th>' +
      '</tr></thead><tbody>' +
      items.map(function(i){
        var e = byItem[i.id] || {}, p = prevByItem[i.id];
        var prevTxt = p ? supplyQtyText(p.qty1) + (two ? ' / ' + supplyQtyText(p.qty2) : '') : '—';
        function inp(n, val){
          return '<input type="number" min="0" step="1" inputmode="numeric" class="fi" id="sup-q' + n + '-' + escAttr(i.id) + '" value="' +
            (val === null || val === undefined ? '' : String(val)) + '" style="text-align:center;max-width:110px;padding:5px 8px;">';
        }
        return '<tr>' +
          '<td style="font-family:DM Mono,monospace;">' + esc(i.sap_code) + '</td>' +
          '<td>' + esc(i.name) + '</td>' +
          '<td style="font-size:12px;">' + esc(i.supplier) + '</td>' +
          '<td style="text-align:center;">' + inp(1, e.qty1) + '</td>' +
          (two ? '<td style="text-align:center;">' + inp(2, e.qty2) + '</td>' : '') +
          '<td class="sup-prev" style="text-align:center;color:var(--muted);font-family:DM Mono,monospace;">' + prevTxt + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div style="margin-top:14px;"><button class="btn btn-green" onclick="submitSupplyForm(\'' + escAttr(t.id) + '\')">💾 Запази</button></div>' +
    '</div>';
  });
  wrap.innerHTML = html + '</div>';
}

/* Стойност от поле: '' -> null; цяло число >= 0 -> число; всичко друго -> undefined (невалидно). */
function supplyReadQty(id){
  var el = document.getElementById(id); if(!el) return null;
  var raw = String(el.value || '').trim();
  if(raw === '') return null;
  if(!/^\d+$/.test(raw)) return undefined;
  return parseInt(raw, 10);
}

/* ─── SUBMIT ────────────────────────────────────────────────── */
/* Upsert по (item_id, store_name, week_start): GET на съществуващите редове,
   после PATCH за тях и POST за новите — както submitPalletsForm().
   Нов ред с ВСИЧКИ полета празни не се създава: иначе празна бланка би
   изглеждала като попълнена в списъка на ЦО. Съществуващ ред се PATCH-ва и
   до null — човекът изрично е изтрил стойността. */
function submitSupplyForm(templateId){
  var t = supplyTemplates.find(function(x){ return x.id === templateId; });
  if(!t){ toast('Бланката не е намерена', '#dc2626'); return; }
  if(supplySaving[templateId]) return;
  var two = !!t.col2_label;
  var items = supplyItems.filter(function(i){ return i.template_id === templateId; });

  var rows = [], bad = [];
  items.forEach(function(i){
    var q1 = supplyReadQty('sup-q1-' + i.id);
    var q2 = two ? supplyReadQty('sup-q2-' + i.id) : null;
    if(q1 === undefined || q2 === undefined){ bad.push(i.sap_code || i.name); return; }
    rows.push({ item: i, qty1: q1, qty2: q2 });
  });
  if(bad.length){ toast('Невалидно количество (цяло число ≥ 0): ' + bad.join(', '), '#dc2626'); return; }

  var store = currentUser.store_name, week = supplyWeek || supplyWeekStart();
  var who = currentUser.display_name || currentUser.email;
  supplySaving[templateId] = true;

  sbGet('supply_entries', 'store_name=eq.' + encodeURIComponent(store) + '&week_start=eq.' + week +
    '&template_id=eq.' + templateId + '&select=id,item_id,store_name,week_start').then(function(existing){
    var byItem = {};
    (Array.isArray(existing) ? existing : []).forEach(function(e){
      if(e.store_name === store && e.week_start === week) byItem[e.item_id] = e;
    });
    var now = new Date().toISOString();
    var reqs = [];
    rows.forEach(function(r){
      var match = byItem[r.item.id];
      if(match){
        reqs.push(sbPatch('supply_entries', 'id=eq.' + match.id,
          { qty1: r.qty1, qty2: r.qty2, updated_by: who, updated_at: now }));
      } else if(r.qty1 !== null || r.qty2 !== null){
        reqs.push(sbPost('supply_entries', {
          template_id: templateId, item_id: r.item.id, store_name: store, week_start: week,
          qty1: r.qty1, qty2: r.qty2, created_by: who, updated_by: who, updated_at: now
        }));
      }
    });
    if(!reqs.length){
      supplySaving[templateId] = false;
      toast('Няма попълнени стойности за запис', '#d97706');
      return;
    }
    return Promise.all(reqs).then(function(results){
      supplySaving[templateId] = false;
      var failed = results.filter(function(res){ return !res || !res.ok; });
      if(failed.length){
        /* Формата НЕ се презарежда: въведеното остава на екрана и следващото
           „Запази" прави нов GET, тоест вече записаните редове минават през PATCH. */
        toast('Грешка при запис: ' + failed.length + ' от ' + results.length + ' реда не са записани — ' + sbErrMsg(failed[0]), '#dc2626');
        return;
      }
      toast('💾 Запазено');
      loadSupply();
    });
  }).catch(function(){
    supplySaving[templateId] = false;
    toast('Грешка при запис', '#dc2626');
  });
}

/* ═══════════════════════════════════════════════════════════════
   ЦО / isGlobal() — обобщение по обекти за избрана седмица
══════════════════════════════════════════════════════════════ */
var supplyOvWeek = '';        /* избраната седмица в обобщението */
var supplyOvData = null;      /* {items, entries, allStores} за supplyOvWeek */
var supplyOvSupplier = {};    /* templateId -> индекс в supplyOvSuppliers(t); липсва = „Всички" */
var supplyOvHideEmpty = {};   /* templateId -> true, ако „Скрий празните редове" е включено */
var SUPPLY_PAGE_SIZE = 1000;

/* ВСИЧКИ редове на страници — PostgREST реже отговора на 1000 реда, а
   бланка с 58 артикула за 18 обекта е 1044 реда за една седмица. Същият
   подход като checklistGetAll() (checklist.js се зарежда СЛЕД този файл,
   затова не се вика оттам). Нарочно не през sbGet: той връща [] при провал и
   пропаднала втора страница би изглеждала като „край на данните", тоест
   матрицата би излязла непълна, без да личи. Тук провалът отхвърля. */
function supplyGetAll(table, query){
  var all = [];
  function page(offset){
    var url = API + '/' + table + '?' + query + '&order=id.asc&limit=' + SUPPLY_PAGE_SIZE + '&offset=' + offset;
    return fetch(url, { headers: H }).then(function(r){
      return r.json().catch(function(){ return null; }).then(function(d){
        if(!r.ok || !Array.isArray(d)) throw new Error((d && (d.message || d.hint)) || ('HTTP ' + r.status));
        all = all.concat(d);
        return d.length === SUPPLY_PAGE_SIZE ? page(offset + SUPPLY_PAGE_SIZE) : all;
      });
    });
  }
  return page(0);
}

function supplyOvReload(){
  var wrap = document.getElementById('mod-supply'); if(!wrap) return;
  wrap.innerHTML = '<div class="page"><div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div></div>';
  sbGet('supply_templates', 'active=eq.true&order=sort_order,name').then(function(tpls){
    tpls = Array.isArray(tpls) ? tpls.filter(function(t){ return t.active !== false; }) : [];
    return supplyLoadOverview(tpls);
  });
}
function supplyOvShift(days){
  supplyOvWeek = supplyAddDays(supplyOvWeek || supplyWeekStart(), days);
  supplyOvReload();
}

function supplyLoadOverview(tpls){
  supplyTemplates = tpls;
  var week = supplyOvWeek;
  if(!tpls.length){
    supplyOvData = { items: [], entries: [], allStores: [] };
    renderSupplyOverview(); return;
  }
  var ids = tpls.map(function(t){ return t.id; });
  return Promise.all([
    sbGet('supply_template_items', 'template_id=in.(' + ids.join(',') + ')&active=eq.true&order=sort_order'),
    supplyGetAll('supply_entries', 'week_start=eq.' + week + '&template_id=in.(' + ids.join(',') +
      ')&select=id,template_id,item_id,store_name,week_start,qty1,qty2'),
    loadReportableStores()
  ]).then(function(res){
    if(week !== supplyOvWeek) return; /* междувременно е избрана друга седмица */
    supplyOvData = {
      items: (Array.isArray(res[0]) ? res[0] : []).filter(function(i){
        return ids.indexOf(i.template_id) >= 0 && i.active !== false;
      }).sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); }),
      entries: res[1].filter(function(e){ return e.week_start === week; }),
      allStores: Array.isArray(res[2]) ? res[2] : []
    };
    renderSupplyOverview();
  }).catch(function(e){
    if(week !== supplyOvWeek) return;
    supplyOvData = null;
    var wrap = document.getElementById('mod-supply'); if(!wrap) return;
    wrap.innerHTML = '<div class="page">' + supplyOvHead() +
      '<div class="card" style="text-align:center;padding:24px;color:#dc2626;">Грешка при зареждане на записите: ' +
      esc(String((e && e.message) || e)) + '</div></div>';
    toast('Грешка при зареждане на записите', '#dc2626');
  });
}

/* Уникалните доставчици на шаблона в реда на артикулите. '' = без доставчик. */
function supplyOvSuppliers(t){
  var seen = {}, out = [];
  (supplyOvData ? supplyOvData.items : []).forEach(function(i){
    if(i.template_id !== t.id) return;
    var s = i.supplier || '';
    if(!Object.prototype.hasOwnProperty.call(seen, s)){ seen[s] = 1; out.push(s); }
  });
  return out;
}

/* Матрицата на един шаблон — общ източник за HTML и за Excel.
   Колоните за обекти: target_stores, а при null — обектите, които имат записи
   за седмицата. Клетка без запис или с null = null (празно, не 0). Общо = сума
   на непразните; ако всички са празни — null. */
function supplyOvMatrix(t){
  var d = supplyOvData || { items: [], entries: [], allStores: [] };
  var two = !!t.col2_label;
  var entries = d.entries.filter(function(e){ return e.template_id === t.id; });
  var stores;
  if(Array.isArray(t.target_stores)){
    stores = t.target_stores.slice();
  } else {
    var seenS = {};
    stores = [];
    entries.forEach(function(e){ if(!seenS[e.store_name]){ seenS[e.store_name] = 1; stores.push(e.store_name); } });
  }
  stores.sort(function(a,b){ return a.localeCompare(b,'bg'); });
  var byKey = {};
  entries.forEach(function(e){ byKey[e.item_id + '|' + e.store_name] = e; });
  function val(v){ return (v === null || v === undefined || v === '') ? null : Number(v); }

  var rows = d.items.filter(function(i){ return i.template_id === t.id; }).map(function(i){
    var cells = [], tot1 = null, tot2 = null, empty = true;
    stores.forEach(function(s){
      var e = byKey[i.id + '|' + s] || {};
      var a = val(e.qty1);
      cells.push(a); if(a !== null){ tot1 = (tot1 || 0) + a; empty = false; }
      if(two){
        var b = val(e.qty2);
        cells.push(b); if(b !== null){ tot2 = (tot2 || 0) + b; empty = false; }
      }
    });
    return { item: i, cells: cells, totals: two ? [tot1, tot2] : [tot1], empty: empty };
  });
  return { stores: stores, two: two, rows: rows };
}
/* Един заглавен ред — за Excel. В HTML при col2_label заглавието е на два реда. */
function supplyOvHeaderRow(t, m){
  var h = ['САП', 'Име', 'Доставчик'];
  m.stores.forEach(function(s){
    if(m.two){ h.push(s + ' — ' + t.col1_label); h.push(s + ' — ' + t.col2_label); }
    else h.push(s);
  });
  if(m.two){ h.push('Общо — ' + t.col1_label); h.push('Общо — ' + t.col2_label); }
  else h.push('Общо');
  return h;
}

function supplyOvHead(){
  var atCurrent = supplyOvWeek >= supplyWeekStart();
  return '<div class="pg-title">🎨 Зареждане</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 14px;">' +
      '<button class="btn" id="sup-week-prev" style="background:#f1f5f9;" onclick="supplyOvShift(-7)">◀</button>' +
      '<span id="sup-week-label" style="font-weight:600;">Седмица от ' + fmtDate(supplyOvWeek) + '</span>' +
      '<button class="btn" id="sup-week-next" style="background:#f1f5f9;' + (atCurrent ? 'opacity:.4;' : '') + '"' +
        (atCurrent ? ' disabled' : '') + ' onclick="supplyOvShift(7)">▶</button>' +
    '</div>';
}

function renderSupplyOverview(){
  var wrap = document.getElementById('mod-supply'); if(!wrap) return;
  var d = supplyOvData || { items: [], entries: [], allStores: [] };
  var html = '<div class="page">' + supplyOvHead();
  if(!supplyTemplates.length){
    html += '<div class="card" style="text-align:center;padding:24px;color:#94a3b8;">Няма активни бланки.</div>';
  }
  supplyTemplates.forEach(function(t){
    /* ✅/⬜: target_stores, а при null — всички отчитащи се обекти.
       Попълнил = поне една непразна стойност за седмицата. */
    var filled = {};
    d.entries.forEach(function(e){
      if(e.template_id === t.id && (e.qty1 !== null || e.qty2 !== null)) filled[e.store_name] = true;
    });
    var roster = (Array.isArray(t.target_stores) ? t.target_stores : d.allStores).slice()
      .sort(function(a,b){ return a.localeCompare(b,'bg'); });
    var done = roster.filter(function(s){ return filled[s]; }).length;

    var m = supplyOvMatrix(t);
    var sups = supplyOvSuppliers(t);
    var selIdx = Object.prototype.hasOwnProperty.call(supplyOvSupplier, t.id) ? supplyOvSupplier[t.id] : -1;
    if(selIdx >= sups.length) selIdx = -1;
    var hide = !!supplyOvHideEmpty[t.id];
    var tid = escAttr(t.id);

    var visible = m.rows.filter(function(r){
      if(selIdx >= 0 && (r.item.supplier || '') !== sups[selIdx]) return false;
      if(hide && r.empty) return false;
      return true;
    });

    /* Чиповете стоят и при един доставчик — изгледът не бива да сменя
       формата си според данните. Подаваме индекс, не името: доставчик с
       кавичка в името не бива да чупи onclick. */
    function chip(idx, label){
      return '<button class="filter-btn sup-chip' + (idx === selIdx ? ' active' : '') +
        '" onclick="supplyOvSetSupplier(\'' + tid + '\',' + idx + ')">' + esc(label) + '</button>';
    }
    function num(v){ return v === null ? '' : String(v); }
    var tdNum = 'text-align:center;font-family:DM Mono,monospace;';
    var colCount = 3 + (m.stores.length + 1) * (m.two ? 2 : 1);

    var thead;
    if(m.two){
      thead = '<tr><th rowspan="2">САП</th><th rowspan="2">Име</th><th rowspan="2">Доставчик</th>' +
        m.stores.map(function(s){ return '<th colspan="2" style="text-align:center;">' + esc(s) + '</th>'; }).join('') +
        '<th colspan="2" style="text-align:center;">Общо</th></tr><tr>' +
        m.stores.concat(['Общо']).map(function(){
          return '<th style="text-align:center;">' + esc(t.col1_label) + '</th><th style="text-align:center;">' + esc(t.col2_label) + '</th>';
        }).join('') + '</tr>';
    } else {
      thead = '<tr><th>САП</th><th>Име</th><th>Доставчик</th>' +
        m.stores.map(function(s){ return '<th style="text-align:center;">' + esc(s) + '</th>'; }).join('') +
        '<th style="text-align:center;">Общо</th></tr>';
    }

    html += '<div class="card" id="sup-ov-' + tid + '" style="margin-bottom:14px;">' +
      '<div class="card-title">' + esc(t.name) + ' — попълнили ' + done + ' от ' + roster.length + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;margin-bottom:12px;">' +
      roster.map(function(s){
        var ok = !!filled[s];
        return '<span class="sup-ov-store" data-filled="' + (ok ? '1' : '0') + '">' + (ok ? '✅' : '⬜') + ' ' + esc(s) + '</span>';
      }).join('') +
      '</div>' +
      '<div class="filter-bar sup-chips" style="margin-bottom:8px;">' +
        chip(-1, 'Всички') + sups.map(function(s, i){ return chip(i, s || 'Без доставчик'); }).join('') +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
          '<input type="checkbox" class="sup-hide-empty"' + (hide ? ' checked' : '') +
          ' onchange="supplyOvSetHideEmpty(\'' + tid + '\',this.checked)"> Скрий празните редове</label>' +
        '<button class="btn btn-green sup-excel" onclick="supplyExportExcel(\'' + tid + '\')">📥 Excel</button>' +
      '</div>' +
      '<div class="sup-matrix-wrap" style="overflow-x:auto;"><table class="sup-matrix"><thead>' + thead + '</thead><tbody>' +
      (visible.length ? visible.map(function(r){
        return '<tr data-item="' + escAttr(r.item.id) + '">' +
          '<td style="font-family:DM Mono,monospace;">' + esc(r.item.sap_code) + '</td>' +
          '<td style="white-space:nowrap;">' + esc(r.item.name) + '</td>' +
          '<td style="font-size:12px;white-space:nowrap;">' + esc(r.item.supplier) + '</td>' +
          r.cells.map(function(v){ return '<td class="sup-cell" style="' + tdNum + '">' + num(v) + '</td>'; }).join('') +
          r.totals.map(function(v){ return '<td class="sup-total" style="' + tdNum + 'font-weight:700;">' + num(v) + '</td>'; }).join('') +
        '</tr>';
      }).join('') : '<tr><td colspan="' + colCount + '" style="text-align:center;padding:18px;color:#94a3b8;">Няма редове за показване.</td></tr>') +
      '</tbody></table></div>' +
    '</div>';
  });
  wrap.innerHTML = html + '</div>';
}
function supplyOvSetSupplier(templateId, idx){
  if(idx < 0) delete supplyOvSupplier[templateId]; else supplyOvSupplier[templateId] = idx;
  renderSupplyOverview();
}
function supplyOvSetHideEmpty(templateId, on){
  supplyOvHideEmpty[templateId] = !!on;
  renderSupplyOverview();
}

/* ─── EXCEL ─────────────────────────────────────────────────── */
/* Име на лист: Excel забранява \ / ? * [ ] : и позволява до 31 знака. */
function supplySheetName(name){
  var s = String(name || '').replace(/[\\\/\?\*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  return (s || 'Лист').slice(0, 31);
}
/* Износът е ВИНАГИ пълен: без филтъра по доставчик и без скриване на празни.
   Празна клетка остава празна (null в aoa), не 0. */
function supplyExportExcel(templateId){
  var t = supplyTemplates.find(function(x){ return x.id === templateId; });
  if(!t || !supplyOvData){ toast('Няма заредени данни за износ', '#dc2626'); return; }
  var week = supplyOvWeek;
  function doExport(){
    try {
      var m = supplyOvMatrix(t);
      var aoa = [supplyOvHeaderRow(t, m)];
      m.rows.forEach(function(r){
        aoa.push([r.item.sap_code || '', r.item.name || '', r.item.supplier || ''].concat(r.cells, r.totals));
      });
      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{wch:10},{wch:40},{wch:24}].concat(aoa[0].slice(3).map(function(){ return {wch:12}; }));
      XLSX.utils.book_append_sheet(wb, ws, supplySheetName(t.name));
      XLSX.writeFile(wb, 'zarezhdane_' + (t.slug || t.id) + '_' + week + '.xlsx');
      toast('✅ Excel изтеглен');
    } catch(e){
      console.error('supply Excel:', e);
      toast('Грешка при генериране на Excel', '#dc2626');
    }
  }
  if(window.XLSX){ doExport(); return; }
  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  script.onload = doExport;
  script.onerror = function(){ toast('Грешка при зареждане на SheetJS', '#dc2626'); };
  document.head.appendChild(script);
}
