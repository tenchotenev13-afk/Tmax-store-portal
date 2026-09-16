/* supply.js — Транспорт > Зареждане (Етап 1)

   Обектите попълват веднъж седмично бланка по шаблон (първата: Колоранти) —
   колко бройки да им се заредят. Схемата е в supply-schema.sql:
   supply_templates -> supply_template_items -> supply_entries.

   Един ред в supply_entries = артикул × обект × седмица, където седмицата е
   понеделникът на ISO седмицата (supplyWeekStart). Празно поле се записва като
   null, не 0: „0" е отговор („нямаме"), празното не е.

   Етап 1: магазинът попълва; ЦО/isGlobal() вижда само кой е попълнил тази
   седмица. Обобщението по артикули е Етап 2, редакцията на шаблоните — Етап 3.

   Всички глобални имена са с префикс supply* / SUPPLY_*, DOM id-тата — sup-*.

   ЗАВИСИМОСТИ (shared.js, зарежда се преди този файл): sbGet/sbPost/sbPatch,
   sbErrMsg, esc, escAttr, toast, fmtDate, localDateISO, isGlobal,
   CENTRAL_OFFICE, loadReportableStores. */

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
  return isGlobal() || (currentUser && currentUser.store_name === CENTRAL_OFFICE);
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

  sbGet('supply_templates', 'active=eq.true&order=sort_order,name').then(function(tpls){
    tpls = Array.isArray(tpls) ? tpls.filter(function(t){ return t.active !== false; }) : [];
    if(supplyIsOverview()) return supplyLoadOverview(tpls);

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
   ЦО / isGlobal() — кой е попълнил тази седмица
══════════════════════════════════════════════════════════════ */
function supplyLoadOverview(tpls){
  supplyTemplates = tpls;
  if(!tpls.length){ renderSupplyOverview([], {}); return; }
  var ids = tpls.map(function(t){ return t.id; });
  return Promise.all([
    sbGet('supply_entries', 'week_start=eq.' + supplyWeek + '&template_id=in.(' + ids.join(',') +
      ')&select=template_id,store_name,week_start,qty1,qty2'),
    loadReportableStores()
  ]).then(function(res){
    /* Попълнил = поне една непразна стойност за седмицата по тази бланка. */
    var filled = {};
    (Array.isArray(res[0]) ? res[0] : []).forEach(function(e){
      if(e.week_start !== supplyWeek) return;
      if(e.qty1 === null && e.qty2 === null) return;
      filled[e.template_id + '|' + e.store_name] = true;
    });
    renderSupplyOverview(Array.isArray(res[1]) ? res[1] : [], filled);
  });
}
function renderSupplyOverview(allStores, filled){
  var wrap = document.getElementById('mod-supply'); if(!wrap) return;
  var html = '<div class="page"><div class="pg-title">🎨 Зареждане</div>' +
    '<div class="pg-sub">Седмица от ' + fmtDate(supplyWeek) + '. Обобщението по магазини е в следващ етап.</div>';
  if(!supplyTemplates.length){
    html += '<div class="card" style="text-align:center;padding:24px;color:#94a3b8;">Няма активни бланки.</div>';
  }
  supplyTemplates.forEach(function(t){
    var stores = (Array.isArray(t.target_stores) ? t.target_stores : allStores).slice()
      .sort(function(a,b){ return a.localeCompare(b,'bg'); });
    var done = stores.filter(function(s){ return filled[t.id + '|' + s]; }).length;
    html += '<div class="card" id="sup-ov-' + escAttr(t.id) + '" style="margin-bottom:14px;">' +
      '<div class="card-title">' + esc(t.name) + ' — попълнили ' + done + ' от ' + stores.length + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;">' +
      stores.map(function(s){
        var ok = !!filled[t.id + '|' + s];
        return '<span class="sup-ov-store" data-filled="' + (ok ? '1' : '0') + '">' + (ok ? '✅' : '⬜') + ' ' + esc(s) + '</span>';
      }).join('') +
      '</div></div>';
  });
  wrap.innerHTML = html + '</div>';
}
