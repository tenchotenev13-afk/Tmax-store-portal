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
var supplyCoNotes = [];     /* supply_store_notes на обекта за текущата и предишната седмица */
/* „Нямам нужда тази седмица" (supply_no_need, supply-no-need-schema.sql, 13.10.2026)
   — редовете на обекта за supplyWeek. Ред за бланка = бланката се брои за
   попълнена в supply_store_done() и задачата в Бюлетина се отмята. */
var supplyNoNeed = [];
var supplyNoNeedSaving = {}; /* templateId -> true, докато тече запис/отмяна */

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
/* Коментарът на Снабдяването (supply_store_notes, 11.10.2026) — един свободен
   текст на бланка × обект × седмица: какво е поръчано, за да не се заявява
   същото всяка седмица. Пишат само supply и admin (supplyCanWriteCoNote);
   обектът и останалите го виждат само като текст. */
function supplyCanWriteCoNote(){
  return !!currentUser && (currentUser.role === 'supply' || currentUser.role === 'admin');
}
/* 'дд.мм чч:мм' — за реда на Снабдяването; без година, тя е ясна от седмицата. */
function supplyFmtDM(ts){
  if(!ts) return '';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '';
  function p2(n){ return String(n).padStart(2,'0'); }
  return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}
function supplyQtyText(v){ return (v === null || v === undefined) ? '—' : String(v); }
function supplyFmtStamp(ts){
  if(!ts) return '—';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '—';
  return fmtDate(localDateISO(d)) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/* Колоната САП се показва само ако поне един артикул на бланката има код.
   Бланки като „Подови настилки" нямат кодове изобщо и колоната би стояла
   празна. В Excel колоната остава винаги (supplyOvHeaderRow). */
function supplyHasSap(items){
  return items.some(function(i){ return i.sap_code !== null && i.sap_code !== undefined && String(i.sap_code).trim() !== ''; });
}
/* Има ли поне един артикул с доставчик. Ако няма — в матрицата за ЦО
   чиповете и колоната „Доставчик" не се рендират: и двете биха показвали
   само „Без доставчик". В Excel колоната остава (supplyOvHeaderRow). */
function supplyHasSupplier(items){
  return items.some(function(i){ return i.supplier !== null && i.supplier !== undefined && String(i.supplier).trim() !== ''; });
}
/* Миниатюри на снимките-подсказки (supply_templates.photos). Празен или
   липсващ масив -> празен низ, без контейнер. Допускат се само http(s)
   адреси — стойността отива в href. */
function supplyPhotosHtml(t){
  var urls = (Array.isArray(t.photos) ? t.photos : []).filter(function(u){
    return typeof u === 'string' && /^https?:\/\//i.test(u.trim());
  });
  if(!urls.length) return '';
  return '<div class="sup-photos" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
    urls.map(function(u, n){
      return '<a href="' + escAttr(u.trim()) + '" target="_blank" rel="noopener">' +
        '<img src="' + escAttr(u.trim()) + '" alt="Снимка ' + (n + 1) + '" loading="lazy" ' +
        'style="height:90px;width:auto;border-radius:6px;border:1px solid #e2e8f0;display:block;"></a>';
    }).join('') + '</div>';
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
    supplyNoNeed = [];
    if(!supplyTemplates.length){ renderSupplyStore(); return; }

    var ids = supplyTemplates.map(function(t){ return t.id; });
    var prev = supplyAddDays(supplyWeek, -7);
    return Promise.all([
      sbGet('supply_template_items', 'template_id=in.(' + ids.join(',') + ')&active=eq.true&order=sort_order'),
      sbGet('supply_entries', 'store_name=eq.' + encodeURIComponent(store) +
        '&week_start=in.(' + supplyWeek + ',' + prev + ')&template_id=in.(' + ids.join(',') + ')'),
      /* Коментарът на Снабдяването за двете седмици. silent: това е само текст
         над бланката — провал значи, че редът просто не излиза (грешката е в
         конзолата), а формата си остава. */
      sbGet('supply_store_notes', 'store_name=eq.' + encodeURIComponent(store) +
        '&week_start=in.(' + supplyWeek + ',' + prev + ')&template_id=in.(' + ids.join(',') + ')' +
        '&select=template_id,store_name,week_start,co_note,co_note_by,co_note_at', true),
      /* Не silent: провалът значи, че бутонът „Нямам нужда" би стоял, макар
         отметката да съществува — грешката трябва да се види. */
      sbGet('supply_no_need', 'store_name=eq.' + encodeURIComponent(store) +
        '&week_start=eq.' + supplyWeek + '&template_id=in.(' + ids.join(',') + ')' +
        '&select=id,template_id,store_name,week_start,created_by,created_at')
    ]).then(function(res){
      /* Филтрите се повтарят и тук: редовете, които не са за тази бланка,
         обект и седмица, не бива да попаднат във формата, каквото и да върне заявката. */
      supplyItems = (Array.isArray(res[0]) ? res[0] : []).filter(function(i){
        return ids.indexOf(i.template_id) >= 0 && i.active !== false;
      }).sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); });
      var entries = (Array.isArray(res[1]) ? res[1] : []).filter(function(e){ return e.store_name === store; });
      supplyEntries = entries.filter(function(e){ return e.week_start === supplyWeek; });
      supplyPrevEntries = entries.filter(function(e){ return e.week_start === prev; });
      supplyCoNotes = (Array.isArray(res[2]) ? res[2] : []).filter(function(n){
        return n.store_name === store && ids.indexOf(n.template_id) >= 0 &&
          (n.week_start === supplyWeek || n.week_start === prev);
      });
      supplyNoNeed = (Array.isArray(res[3]) ? res[3] : []).filter(function(n){
        return n.store_name === store && n.week_start === supplyWeek && ids.indexOf(n.template_id) >= 0;
      });
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
    var sap = supplyHasSap(items);

    /* „Последно запазено" — най-новият запис на обекта за седмицата по тази бланка. */
    var last = null;
    items.forEach(function(i){
      var e = byItem[i.id]; if(!e) return;
      var ts = e.updated_at || e.created_at;
      if(ts && (!last || ts > last.ts)) last = { ts: ts, by: e.updated_by || e.created_by };
    });
    /* „Нямам нужда": има ли ред за бланката и има ли ЗАПИСАНИ количества.
       Бутонът не се крие според данните — при количества е неактивен. */
    var nn = supplyNoNeedFor(t.id);
    var hasQty = items.some(function(i){
      var e = byItem[i.id];
      return !!e && ((e.qty1 !== null && e.qty1 !== undefined) || (e.qty2 !== null && e.qty2 !== undefined));
    });
    var tidA = escAttr(t.id);

    html += '<div class="card" id="sup-card-' + escAttr(t.id) + '" style="margin-bottom:14px;">' +
      '<div class="card-title">' + esc(t.name) + '</div>' +
      (t.instructions ? '<div style="font-size:13px;color:var(--muted);margin-bottom:10px;white-space:pre-line;">' + esc(t.instructions) + '</div>' : '') +
      supplyPhotosHtml(t) +
      (last ? '<div class="sup-last" style="font-size:12px;color:#16a34a;margin-bottom:8px;">Последно запазено: ' + supplyFmtStamp(last.ts) + ' от ' + esc(last.by) + '</div>' : '') +
      (nn ? '<div class="sup-no-need" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px;color:#16a34a;background:#f0fdf4;border-left:3px solid #16a34a;padding:6px 10px;border-radius:4px;margin-bottom:8px;">' +
        '<span>✅ Нямам нужда тази седмица — отбелязано ' + esc(supplyFmtDM(nn.created_at)) + (nn.created_by ? ' от ' + esc(nn.created_by) : '') + '</span>' +
        '<button type="button" class="btn sup-no-need-undo" style="background:#f1f5f9;font-size:12px;padding:4px 10px;" onclick="supplyUndoNoNeed(\'' + tidA + '\')">↩ Отмени</button></div>' : '') +
      supplyStoreCoNoteHtml(t) +
      '<div class="tbl-wrap tbl-compact tbl-auto"><table><thead><tr>' +
        (sap ? '<th>САП</th>' : '') + '<th>Име</th><th>Доставчик</th>' +
        '<th style="text-align:center;">' + esc(t.col1_label) + '</th>' +
        (two ? '<th style="text-align:center;">' + esc(t.col2_label) + '</th>' : '') +
        '<th>Коментар</th>' +
        '<th>Миналата седмица</th>' +
      '</tr></thead><tbody>' +
      items.map(function(i){
        var e = byItem[i.id] || {}, p = prevByItem[i.id] || {};
        /* Миналата стойност стои ПОД полето на същата колона — етикетът на
           колоната я обяснява. Не „За поръчка: X": не всяка бланка има колона
           за поръчка (Кабели: „Налична макара"). */
        function inp(n, val, prevVal){
          return '<input type="number" min="0" step="1" inputmode="numeric" class="fi" id="sup-q' + n + '-' + escAttr(i.id) + '" value="' +
            (val === null || val === undefined ? '' : String(val)) + '" style="text-align:center;max-width:110px;padding:5px 8px;">' +
            '<div class="sup-prev-q" style="font-size:11px;color:var(--muted);margin-top:3px;">мин. седм.: ' + supplyQtyText(prevVal) + '</div>';
        }
        /* Последната колона: коментарът от миналата седмица (ако има) и историята. */
        var prevCell = (p.note ? '<div class="sup-prev-note" style="font-size:12px;color:var(--muted);white-space:pre-line;margin-bottom:4px;">💬 ' + esc(p.note) + '</div>' : '') +
          '<button type="button" class="btn sup-hist-btn" style="background:#f1f5f9;font-size:12px;padding:4px 8px;white-space:nowrap;" onclick="supplyShowHistory(\'' + escAttr(i.id) + '\')">🕘 4 седмици</button>';
        return '<tr>' +
          (sap ? '<td style="font-family:DM Mono,monospace;">' + esc(i.sap_code) + '</td>' : '') +
          '<td>' + esc(i.name) + '</td>' +
          '<td style="font-size:12px;">' + esc(i.supplier) + '</td>' +
          '<td style="text-align:center;">' + inp(1, e.qty1, p.qty1) + '</td>' +
          (two ? '<td style="text-align:center;">' + inp(2, e.qty2, p.qty2) + '</td>' : '') +
          /* Коментарът е по желание; escAttr — кавичка в текста не бива да затваря value="". */
          '<td><input type="text" maxlength="500" class="fi sup-note" id="sup-note-' + escAttr(i.id) + '" placeholder="по желание" value="' +
            (e.note ? escAttr(e.note) : '') + '" style="min-width:140px;width:100%;padding:5px 8px;"></td>' +
          '<td class="sup-prev" style="min-width:120px;">' + prevCell + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;"><button class="btn btn-green" onclick="submitSupplyForm(\'' + escAttr(t.id) + '\')">💾 Запази</button>' +
        (nn ? '' : '<button type="button" class="btn sup-no-need-btn" style="background:#f1f5f9;' + (hasQty ? 'opacity:.5;cursor:not-allowed;' : '') + '"' +
          (hasQty ? ' disabled title="Има попълнени количества — първо ги изчисти"' : '') +
          ' onclick="supplyMarkNoNeed(\'' + tidA + '\')">Нямам нужда тази седмица</button>') +
      '</div>' +
    '</div>';
  });
  wrap.innerHTML = html + '</div>';
}

/* Коментарът на Снабдяването над таблицата на бланката. Само ако има непразен
   текст: за ТАЗИ седмица — „🏢 Снабдяване: …"; за предишната — сив ред
   „миналата седмица: …". Без запис -> празен низ. */
function supplyStoreCoNoteHtml(t){
  var prev = supplyAddDays(supplyWeek, -7);
  function find(w){
    return supplyCoNotes.find(function(n){
      return n.template_id === t.id && n.week_start === w && n.co_note && String(n.co_note).trim() !== '';
    });
  }
  var cur = find(supplyWeek), old = find(prev), h = '';
  if(cur){
    var meta = [cur.co_note_by ? esc(cur.co_note_by) : '', supplyFmtDM(cur.co_note_at)].filter(Boolean).join(', ');
    h += '<div class="sup-co-cur" style="font-size:13px;background:#eff6ff;border-left:3px solid #2563eb;padding:6px 10px;border-radius:4px;margin-bottom:6px;white-space:pre-line;">' +
      '🏢 Снабдяване: ' + esc(String(cur.co_note).trim()) + (meta ? ' · <span style="color:var(--muted);font-size:12px;">' + meta + '</span>' : '') + '</div>';
  }
  if(old){
    h += '<div class="sup-co-prev" style="font-size:12px;color:#94a3b8;margin-bottom:8px;white-space:pre-line;">миналата седмица: ' +
      esc(String(old.co_note).trim()) + '</div>';
  }
  return h;
}

/* ─── „НЯМАМ НУЖДА ТАЗИ СЕДМИЦА" ────────────────────────────── */
function supplyNoNeedFor(templateId){
  return supplyNoNeed.find(function(n){ return n.template_id === templateId; }) || null;
}
/* Има ли въведено количество в полетата на бланката — и незаписано. */
function supplyFormHasQty(templateId){
  return supplyItems.some(function(i){
    if(i.template_id !== templateId) return false;
    return [1, 2].some(function(n){
      var el = document.getElementById('sup-q' + n + '-' + i.id);
      return !!el && String(el.value || '').trim() !== '';
    });
  });
}
function supplyMarkNoNeed(templateId){
  var t = supplyTemplates.find(function(x){ return x.id === templateId; });
  if(!t){ toast('Бланката не е намерена', '#dc2626'); return; }
  if(supplyNoNeedSaving[templateId] || supplyNoNeedFor(templateId)) return;
  if(supplyFormHasQty(templateId)){ toast('Има попълнени количества — първо ги изчисти', '#d97706'); return; }
  supplyNoNeedSaving[templateId] = true;
  sbPost('supply_no_need', {
    template_id: templateId, store_name: currentUser.store_name,
    week_start: supplyWeek || supplyWeekStart(),
    created_by: currentUser.display_name || currentUser.email
  }).then(function(res){
    supplyNoNeedSaving[templateId] = false;
    if(!res || !res.ok){ toast('Грешка при запис на „Нямам нужда": ' + sbErrMsg(res), '#dc2626'); return; }
    toast('✅ Отбелязано: нямам нужда тази седмица');
    loadSupply();
  });
}
function supplyUndoNoNeed(templateId){
  var nn = supplyNoNeedFor(templateId);
  if(!nn || supplyNoNeedSaving[templateId]) return;
  supplyNoNeedSaving[templateId] = true;
  sbDelete('supply_no_need', 'id=eq.' + encodeURIComponent(nn.id)).then(function(res){
    supplyNoNeedSaving[templateId] = false;
    if(!res || !res.ok){ toast('Грешка при отмяна: ' + sbErrMsg(res), '#dc2626'); return; }
    toast('↩ Отменено');
    loadSupply();
  });
}

/* ─── ИСТОРИЯ НА РЕД (последните 4 седмици преди текущата) ───── */
/* Една заявка при клик — по обекта, артикула и четирите понеделника. През
   supplyGetAll, не sbGet: sbGet връща [] при провал и прозорецът би казал
   „няма запис" за всяка седмица, без да личи, че данните не са заредени. */
var SUPPLY_HIST_WEEKS = 4;
var supplyHistSeq = 0; /* по-стар отговор не бива да презапише прозореца на по-нов клик */
function supplyHistOverlay(){
  var ov = document.getElementById('sup-hist-ov');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'sup-hist-ov';
    ov.className = 'modal-bg';
    ov.onclick = function(ev){ if(ev.target === ov) closeModal('sup-hist-ov'); };
    document.body.appendChild(ov);
  }
  return ov;
}
function supplyShowHistory(itemId){
  var i = supplyItems.find(function(x){ return x.id === itemId; }); if(!i) return;
  var t = supplyTemplates.find(function(x){ return x.id === i.template_id; }); if(!t) return;
  var two = !!t.col2_label, store = currentUser.store_name, base = supplyWeek || supplyWeekStart();
  var weeks = [];
  for(var k = 1; k <= SUPPLY_HIST_WEEKS; k++) weeks.push(supplyAddDays(base, -7 * k));
  var ov = supplyHistOverlay();
  function frame(body){
    ov.innerHTML = '<div class="modal" style="width:640px;">' +
      '<h3>🕘 ' + esc(i.name) + '</h3>' +
      '<div class="modal-sub">' + esc(store) + ' — последните ' + SUPPLY_HIST_WEEKS + ' седмици</div>' + body +
      '<div class="modal-actions"><button type="button" class="btn sup-hist-close" style="background:#f1f5f9;" onclick="closeModal(\'sup-hist-ov\')">Затвори</button></div></div>';
  }
  var seq = ++supplyHistSeq;
  frame('<div style="text-align:center;padding:18px;color:#94a3b8;">⏳ Зареждане...</div>');
  ov.classList.add('open');
  supplyGetAll('supply_entries', 'store_name=eq.' + encodeURIComponent(store) + '&item_id=eq.' + encodeURIComponent(itemId) +
    '&week_start=in.(' + weeks.join(',') + ')&select=id,item_id,store_name,week_start,qty1,qty2,note,created_by,created_at,updated_by,updated_at')
  .then(function(rows){
    if(seq !== supplyHistSeq) return;
    var byWeek = {};
    rows.forEach(function(e){ if(e.store_name === store && e.item_id === itemId) byWeek[e.week_start] = e; });
    /* Блок на седмица, не таблица: на телефон таблицата с дългите етикети на
       колоните излиза ~690px и коментарът остава извън екрана (мерено на 375px). */
    var lbl = 'font-size:12px;color:var(--muted);';
    var val = 'font-family:DM Mono,monospace;font-weight:600;';
    frame('<div class="sup-hist">' +
      weeks.map(function(w){
        var e = byWeek[w];
        var head = '<div style="font-weight:600;margin-bottom:4px;">Седмица от ' + fmtDate(w) + '</div>';
        if(!e) return '<div class="sup-hist-week" data-week="' + w + '" style="padding:8px 0;border-bottom:1px solid #f1f5f9;">' + head +
          '<div class="sup-hist-none" style="color:#94a3b8;font-size:13px;">няма запис</div></div>';
        return '<div class="sup-hist-week" data-week="' + w + '" style="padding:8px 0;border-bottom:1px solid #f1f5f9;">' + head +
          '<div class="sup-hist-q" style="font-size:13px;"><span style="' + lbl + '">' + esc(t.col1_label) + ':</span> <span style="' + val + '">' + supplyQtyText(e.qty1) + '</span></div>' +
          (two ? '<div class="sup-hist-q" style="font-size:13px;"><span style="' + lbl + '">' + esc(t.col2_label) + ':</span> <span style="' + val + '">' + supplyQtyText(e.qty2) + '</span></div>' : '') +
          (e.note ? '<div class="sup-hist-note" style="font-size:13px;margin-top:2px;white-space:pre-line;">💬 ' + esc(e.note) + '</div>' : '') +
          '<div class="sup-hist-by" style="' + lbl + 'margin-top:2px;">' + esc(e.updated_by || e.created_by) + ' · ' + supplyFmtStamp(e.updated_at || e.created_at) + '</div></div>';
      }).join('') + '</div>');
  }).catch(function(err){
    if(seq !== supplyHistSeq) return;
    frame('<div class="sup-hist-err" style="text-align:center;padding:18px;color:#dc2626;">Историята не можа да се зареди: ' + esc(String((err && err.message) || err)) + '</div>');
  });
}

/* Стойност от поле: '' -> null; цяло число >= 0 -> число; всичко друго -> undefined (невалидно). */
function supplyReadQty(id){
  var el = document.getElementById(id); if(!el) return null;
  var raw = String(el.value || '').trim();
  if(raw === '') return null;
  if(!/^\d+$/.test(raw)) return undefined;
  return parseInt(raw, 10);
}

/* Коментар от поле: празен или само интервали -> null, иначе подрязаният текст. */
function supplyReadNote(id){
  var el = document.getElementById(id); if(!el) return null;
  var raw = String(el.value || '').trim();
  return raw === '' ? null : raw;
}

/* ─── SUBMIT ────────────────────────────────────────────────── */
/* Upsert по (item_id, store_name, week_start): GET на съществуващите редове,
   после PATCH за тях и POST за новите — както submitPalletsForm().
   Нов ред с ВСИЧКИ полета празни (и без коментар) не се създава: иначе празна
   бланка би изглеждала като попълнена в списъка на ЦО. Ред само с коментар се
   създава, но не брои за попълнен — там се гледат само qty1/qty2. Съществуващ
   ред се PATCH-ва и до null — човекът изрично е изтрил стойността. */
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
    rows.push({ item: i, qty1: q1, qty2: q2, note: supplyReadNote('sup-note-' + i.id) });
  });
  if(bad.length){ toast('Невалидно количество (цяло число ≥ 0): ' + bad.join(', '), '#dc2626'); return; }

  /* Число в коментара при празно количество — почти сигурно е сбъркана колона
     (Севлиево, 12.10.2026: 25 реда „Кабели на макара" с броя в „Коментар").
     Базата брои само qty1/qty2, тоест бланката би излязла непопълнена. Спира се
     целият запис, както при невалидно количество. */
  var noteNum = rows.filter(function(r){
    return r.qty1 === null && r.qty2 === null && r.note !== null && /^\s*\d+(?:[.,]\d+)?\s*$/.test(r.note);
  });
  if(noteNum.length){
    toast('Коментарът е число, а количеството е празно — ред(ове): ' +
      noteNum.map(function(r){ return r.item.sap_code || r.item.name; }).join(', ') +
      '. Напишете числото в количеството или го обяснете с думи.', '#dc2626');
    var f = document.getElementById('sup-q1-' + noteNum[0].item.id);
    if(f && f.focus) f.focus();
    return;
  }

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
          { qty1: r.qty1, qty2: r.qty2, note: r.note, updated_by: who, updated_at: now }));
      } else if(r.qty1 !== null || r.qty2 !== null || r.note !== null){
        reqs.push(sbPost('supply_entries', {
          template_id: templateId, item_id: r.item.id, store_name: store, week_start: week,
          qty1: r.qty1, qty2: r.qty2, note: r.note, created_by: who, updated_by: who, updated_at: now
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
      /* Записана поне една стойност -> бланката е заявена, не „без нужда":
         редът в supply_no_need се трие. По филтър, не по id — отметка от
         друго устройство след зареждането също трябва да падне. */
      var hasVal = rows.some(function(r){ return r.qty1 !== null || r.qty2 !== null; });
      if(!hasVal){ toast('💾 Запазено'); loadSupply(); return; }
      return sbDelete('supply_no_need', 'template_id=eq.' + templateId + '&store_name=eq.' + encodeURIComponent(store) +
        '&week_start=eq.' + week).then(function(del){
        if(!del || !del.ok){
          toast('Количествата са записани, но „Нямам нужда" НЕ е махнато: ' + sbErrMsg(del), '#dc2626');
        } else {
          toast('💾 Запазено');
        }
        loadSupply();
      });
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
var supplyCoSaving = {};      /* 'templateId|обект' -> true, докато тече запис на коментара на Снабдяването */
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
    supplyOvData = { items: [], entries: [], allStores: [], coNotes: [], coNotesErr: null, noNeed: [], noNeedErr: null };
    renderSupplyOverview(); return;
  }
  var ids = tpls.map(function(t){ return t.id; });
  return Promise.all([
    sbGet('supply_template_items', 'template_id=in.(' + ids.join(',') + ')&active=eq.true&order=sort_order'),
    supplyGetAll('supply_entries', 'week_start=eq.' + week + '&template_id=in.(' + ids.join(',') +
      ')&select=id,template_id,item_id,store_name,week_start,qty1,qty2,note'),
    loadReportableStores(),
    /* Провалът тук НЕ чупи матрицата — хваща се отделно и полетата за писане
       се заключват (supplyOvCoNotesHtml): запис „на сляпо" би презаписал
       коментар, който просто не е бил зареден. */
    supplyGetAll('supply_store_notes', 'week_start=eq.' + week + '&template_id=in.(' + ids.join(',') +
      ')&select=id,template_id,store_name,week_start,co_note,co_note_by,co_note_at')
      .catch(function(e){ return { error: String((e && e.message) || e) }; }),
    /* „Без нужда" — провалът също не чупи матрицата, но се казва с червен ред
       (supplyOvNoNeedErrHtml): иначе обектът би изглеждал като непопълнил. */
    supplyGetAll('supply_no_need', 'week_start=eq.' + week + '&template_id=in.(' + ids.join(',') +
      ')&select=id,template_id,store_name,week_start,created_by,created_at')
      .catch(function(e){ return { error: String((e && e.message) || e) }; })
  ]).then(function(res){
    if(week !== supplyOvWeek) return; /* междувременно е избрана друга седмица */
    supplyOvData = {
      items: (Array.isArray(res[0]) ? res[0] : []).filter(function(i){
        return ids.indexOf(i.template_id) >= 0 && i.active !== false;
      }).sort(function(a,b){ return (a.sort_order||0) - (b.sort_order||0); }),
      entries: res[1].filter(function(e){ return e.week_start === week; }),
      allStores: Array.isArray(res[2]) ? res[2] : [],
      coNotes: Array.isArray(res[3]) ? res[3].filter(function(n){ return n.week_start === week; }) : [],
      coNotesErr: Array.isArray(res[3]) ? null : ((res[3] && res[3].error) || 'неизвестна грешка'),
      noNeed: Array.isArray(res[4]) ? res[4].filter(function(n){ return n.week_start === week; }) : [],
      noNeedErr: Array.isArray(res[4]) ? null : ((res[4] && res[4].error) || 'неизвестна грешка')
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
   на непразните; ако всички са празни — null. notes = [{store, note}] по азбучен
   ред на обекта, само непразните коментари; не влияят на empty (той е за бройките). */
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
    entries.forEach(function(e){
      /* Ред само с коментар не отваря колона — обектът не е попълнил; коментарът е в блока под матрицата. */
      if(e.qty1 === null && e.qty2 === null && e.note) return;
      if(!seenS[e.store_name]){ seenS[e.store_name] = 1; stores.push(e.store_name); }
    });
  }
  /* „Без нужда" = ред в supply_no_need И нито един ред с бройки за бланката.
     Има ли бройки — данните печелят. При target_stores null такъв обект
     отваря колона, за да не изглежда като непопълнил. */
  var withQty = {}, noNeed = {};
  entries.forEach(function(e){ if(val(e.qty1) !== null || val(e.qty2) !== null) withQty[e.store_name] = true; });
  (d.noNeed || []).forEach(function(n){
    if(n.template_id !== t.id || withQty[n.store_name]) return;
    if(Array.isArray(t.target_stores) && t.target_stores.indexOf(n.store_name) < 0) return;
    noNeed[n.store_name] = true;
    if(stores.indexOf(n.store_name) < 0) stores.push(n.store_name);
  });
  stores.sort(function(a,b){ return a.localeCompare(b,'bg'); });
  var byKey = {};
  entries.forEach(function(e){ byKey[e.item_id + '|' + e.store_name] = e; });
  function val(v){ return (v === null || v === undefined || v === '') ? null : Number(v); }

  var rows = d.items.filter(function(i){ return i.template_id === t.id; }).map(function(i){
    var cells = [], tot1 = null, tot2 = null, empty = true;
    /* Коментарите — от записите, не от колоните: обект само с коментар няма колона. */
    var notes = entries.filter(function(e){
      return e.item_id === i.id && e.note && String(e.note).trim() !== '' &&
        (!Array.isArray(t.target_stores) || t.target_stores.indexOf(e.store_name) >= 0);
    })
      .map(function(e){ return { store: e.store_name, note: String(e.note).trim() }; })
      .sort(function(a,b){ return a.store.localeCompare(b.store,'bg'); });
    stores.forEach(function(s){
      var e = byKey[i.id + '|' + s] || {};
      var a = val(e.qty1);
      cells.push(a); if(a !== null){ tot1 = (tot1 || 0) + a; empty = false; }
      if(two){
        var b = val(e.qty2);
        cells.push(b); if(b !== null){ tot2 = (tot2 || 0) + b; empty = false; }
      }
    });
    return { item: i, cells: cells, totals: two ? [tot1, tot2] : [tot1], empty: empty, notes: notes };
  });
  return { stores: stores, two: two, rows: rows, noNeed: noNeed };
}
var SUPPLY_NO_NEED_TEXT = 'без нужда';
/* Обектът на клетка с индекс idx в r.cells (при col2_label — по две клетки на обект). */
function supplyOvCellStore(m, idx){ return m.stores[Math.floor(idx / (m.two ? 2 : 1))]; }
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
    var roster = supplyOvRoster(t);
    var done = roster.filter(function(s){ return filled[s]; }).length;

    var m = supplyOvMatrix(t);
    var nnCount = roster.filter(function(s){ return m.noNeed[s]; }).length;
    var sups = supplyOvSuppliers(t);
    var selIdx = Object.prototype.hasOwnProperty.call(supplyOvSupplier, t.id) ? supplyOvSupplier[t.id] : -1;
    if(selIdx >= sups.length) selIdx = -1;
    var hide = !!supplyOvHideEmpty[t.id];
    var tid = escAttr(t.id);

    var visible = m.rows.filter(function(r){
      if(selIdx >= 0 && (r.item.supplier || '') !== sups[selIdx]) return false;
      if(hide && r.empty && !r.notes.length) return false; /* ред само с коментар не е празен */
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
    var rowItems = m.rows.map(function(r){ return r.item; });
    var sap = supplyHasSap(rowItems);
    var hasSup = supplyHasSupplier(rowItems);
    var colCount = 1 + (sap ? 1 : 0) + (hasSup ? 1 : 0) + (m.stores.length + 1) * (m.two ? 2 : 1);

    var thead;
    if(m.two){
      thead = '<tr>' + (sap ? '<th rowspan="2">САП</th>' : '') + '<th class="sup-name-c" rowspan="2">Име</th>' + (hasSup ? '<th rowspan="2">Доставчик</th>' : '') +
        m.stores.map(function(s){ return '<th colspan="2" style="text-align:center;">' + esc(s) + '</th>'; }).join('') +
        '<th colspan="2" style="text-align:center;">Общо</th></tr><tr>' +
        m.stores.concat(['Общо']).map(function(){
          return '<th style="text-align:center;">' + esc(t.col1_label) + '</th><th style="text-align:center;">' + esc(t.col2_label) + '</th>';
        }).join('') + '</tr>';
    } else {
      thead = '<tr>' + (sap ? '<th>САП</th>' : '') + '<th class="sup-name-c">Име</th>' + (hasSup ? '<th>Доставчик</th>' : '') +
        m.stores.map(function(s){ return '<th style="text-align:center;">' + esc(s) + '</th>'; }).join('') +
        '<th style="text-align:center;">Общо</th></tr>';
    }

    html += '<div class="card" id="sup-ov-' + tid + '" style="margin-bottom:14px;">' +
      '<div class="card-title">' + esc(t.name) + ' — попълнили ' + done + ' от ' + roster.length +
        (nnCount ? ' · без нужда: ' + nnCount : '') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;margin-bottom:12px;">' +
      roster.map(function(s){
        var ok = !!filled[s];
        if(!ok && m.noNeed[s]){
          return '<span class="sup-ov-store sup-ov-nn" data-filled="nn" style="color:#94a3b8;">➖ ' + esc(s) + ' — ' + SUPPLY_NO_NEED_TEXT + '</span>';
        }
        return '<span class="sup-ov-store" data-filled="' + (ok ? '1' : '0') + '">' + (ok ? '✅' : '⬜') + ' ' + esc(s) + '</span>';
      }).join('') +
      '</div>' +
      supplyOvNoNeedErrHtml() +
      (hasSup ? '<div class="filter-bar sup-chips" style="margin-bottom:8px;">' +
        chip(-1, 'Всички') + sups.map(function(s, i){ return chip(i, s || 'Без доставчик'); }).join('') +
      '</div>' : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
          '<input type="checkbox" class="sup-hide-empty"' + (hide ? ' checked' : '') +
          ' onchange="supplyOvSetHideEmpty(\'' + tid + '\',this.checked)"> Скрий празните редове</label>' +
        '<button class="btn btn-green sup-excel" onclick="supplyExportExcel(\'' + tid + '\')">📥 Excel</button>' +
      '</div>' +
      '<div class="sup-matrix-wrap" style="overflow-x:auto;"><table class="sup-matrix"><thead>' + thead + '</thead><tbody>' +
      (visible.length ? visible.map(function(r){
        return '<tr data-item="' + escAttr(r.item.id) + '">' +
          (sap ? '<td style="font-family:DM Mono,monospace;">' + esc(r.item.sap_code) + '</td>' : '') +
          '<td class="sup-name-c" style="white-space:nowrap;">' + esc(r.item.name) + '</td>' +
          (hasSup ? '<td style="font-size:12px;white-space:nowrap;">' + esc(r.item.supplier) + '</td>' : '') +
          r.cells.map(function(v, ci){
            if(v === null && m.noNeed[supplyOvCellStore(m, ci)]){
              return '<td class="sup-cell sup-nn" style="' + tdNum + 'color:#94a3b8;font-size:11px;font-family:inherit;">' + SUPPLY_NO_NEED_TEXT + '</td>';
            }
            return '<td class="sup-cell" style="' + tdNum + '">' + num(v) + '</td>';
          }).join('') +
          r.totals.map(function(v){ return '<td class="sup-total" style="' + tdNum + 'font-weight:700;">' + num(v) + '</td>'; }).join('') +
        '</tr>';
      }).join('') : '<tr><td colspan="' + colCount + '" style="text-align:center;padding:18px;color:#94a3b8;">Няма редове за показване.</td></tr>') +
      '</tbody></table></div>' +
      supplyOvNotesHtml(visible) +
      supplyOvCoNotesHtml(t) +
    '</div>';
  });
  wrap.innerHTML = html + '</div>';
}
function supplyOvNoNeedErrHtml(){
  var e = supplyOvData && supplyOvData.noNeedErr;
  if(!e) return '';
  return '<div class="sup-nn-err" style="font-size:12px;color:#dc2626;margin-bottom:8px;">Отметките „без нужда" не можаха да се заредят: ' + esc(e) + '</div>';
}
/* Коментарите от обектите под матрицата — само за видимите редове (филтърът по
   доставчик важи и тук). Няма коментари -> празен низ, без заглавие. */
function supplyOvNotesHtml(rows){
  var list = [];
  rows.forEach(function(r){ r.notes.forEach(function(n){ list.push({ item: r.item, store: n.store, note: n.note }); }); });
  if(!list.length) return '';
  return '<div class="sup-notes" style="margin-top:12px;font-size:13px;">' +
    '<div style="font-weight:600;margin-bottom:6px;">💬 Коментари от обектите</div>' +
    list.map(function(x){
      return '<div class="sup-note-row" style="padding:4px 0;border-bottom:1px solid #f1f5f9;">' +
        '<b>' + esc(x.store) + '</b> · ' + esc(x.item.name) + ': ' +
        '<span style="color:var(--muted);white-space:pre-line;">' + esc(x.note) + '</span></div>';
    }).join('') + '</div>';
}
/* Обектите на бланката: target_stores, а при null — всички отчитащи се. */
function supplyOvRoster(t){
  var d = supplyOvData || { allStores: [] };
  return (Array.isArray(t.target_stores) ? t.target_stores : d.allStores).slice()
    .sort(function(a,b){ return a.localeCompare(b,'bg'); });
}
function supplyOvCoNote(templateId, store){
  var list = (supplyOvData && supplyOvData.coNotes) || [];
  return list.find(function(n){ return n.template_id === templateId && n.store_name === store; }) || null;
}
/* „🏢 Коментар на Снабдяването" — отделен блок под матрицата, по един ред на
   обект от списъка ✅/⬜. Не е ред в матрицата: колоните там са само обектите
   със записи (при target_stores null) и са закачени (a90ffaa), а коментар се
   оставя и на обект, който още не е попълнил. supply/admin — поле и „💾";
   останалите — само непразните коментари като текст. id-тата са по индекс в
   списъка, не по името на обекта. */
function supplyOvCoNotesHtml(t){
  var d = supplyOvData || {};
  var roster = supplyOvRoster(t), tid = escAttr(t.id), canWrite = supplyCanWriteCoNote();
  var head = '<div style="font-weight:600;margin-bottom:6px;">🏢 Коментар на Снабдяването</div>';
  var wrapOpen = '<div class="sup-co" style="margin-top:12px;font-size:13px;">';
  if(d.coNotesErr){
    return wrapOpen + head + '<div class="sup-co-err" style="color:#dc2626;">Коментарите на Снабдяването не можаха да се заредят: ' +
      esc(d.coNotesErr) + '</div></div>';
  }
  function stamp(n){
    if(!n || !n.co_note) return '';
    return [n.co_note_by ? esc(n.co_note_by) : '', supplyFmtDM(n.co_note_at)].filter(Boolean).join(', ');
  }
  if(!canWrite){
    var withNote = roster.filter(function(s){ var n = supplyOvCoNote(t.id, s); return n && n.co_note && String(n.co_note).trim() !== ''; });
    if(!withNote.length) return '';
    return wrapOpen + head + withNote.map(function(s){
      var n = supplyOvCoNote(t.id, s);
      return '<div class="sup-co-row" style="padding:4px 0;border-bottom:1px solid #f1f5f9;"><b>' + esc(s) + '</b>: ' +
        '<span class="sup-co-text" style="white-space:pre-line;">' + esc(String(n.co_note).trim()) + '</span>' +
        ' <span style="color:var(--muted);font-size:12px;">· ' + stamp(n) + '</span></div>';
    }).join('') + '</div>';
  }
  return wrapOpen + head + roster.map(function(s, idx){
    var n = supplyOvCoNote(t.id, s);
    return '<div class="sup-co-row" style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 10px;padding:5px 0;border-bottom:1px solid #f1f5f9;">' +
      '<div style="min-width:140px;font-weight:600;padding-top:5px;">' + esc(s) + '</div>' +
      '<textarea rows="1" maxlength="500" class="fi sup-co-input" id="sup-co-' + tid + '-' + idx + '" placeholder="какво е поръчано за обекта" ' +
        'style="flex:1;min-width:200px;padding:5px 8px;resize:vertical;">' + (n && n.co_note ? esc(n.co_note) : '') + '</textarea>' +
      '<button type="button" class="btn sup-co-save" style="background:#f1f5f9;padding:5px 10px;" onclick="supplySaveCoNote(\'' + tid + '\',' + idx + ')">💾</button>' +
      '<div class="sup-co-by" id="sup-co-by-' + tid + '-' + idx + '" style="flex-basis:100%;font-size:11px;color:var(--muted);">' + stamp(n) + '</div>' +
    '</div>';
  }).join('') + '</div>';
}
/* UPSERT по (template_id, store_name, week_start) — Prefer merge-duplicates с
   on_conflict, както checklistWritePortalValues(). Празен текст -> co_note
   null (съдържанието се трие, редът остава). co_note_at се праща изрично:
   default now() важи само при INSERT, а при UPDATE би останал старият час.
   Седмицата е supplyOvWeek — избраната в обобщението, не текущата. */
function supplySaveCoNote(templateId, idx){
  if(!supplyCanWriteCoNote()) return;
  if(!supplyOvData || supplyOvData.coNotesErr){ toast('Коментарите не са заредени — презаредете', '#dc2626'); return; }
  var t = supplyTemplates.find(function(x){ return x.id === templateId; });
  if(!t){ toast('Бланката не е намерена', '#dc2626'); return; }
  var store = supplyOvRoster(t)[idx];
  var el = document.getElementById('sup-co-' + templateId + '-' + idx);
  if(!store || !el) return;
  var key = templateId + '|' + store;
  if(supplyCoSaving[key]) return;
  var raw = String(el.value || '').trim();
  var week = supplyOvWeek;
  var body = {
    template_id: templateId, store_name: store, week_start: week,
    co_note: raw === '' ? null : raw,
    co_note_by: currentUser.display_name || currentUser.email,
    co_note_at: new Date().toISOString()
  };
  supplyCoSaving[key] = true;
  fetch(API + '/supply_store_notes?on_conflict=template_id,store_name,week_start', {
    method: 'POST',
    headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body)
  }).then(function(r){
    if(r.ok) return { ok: true };
    return r.json().catch(function(){ return null; }).then(function(dd){
      return { ok: false, error: (dd && (dd.message || dd.hint)) || ('HTTP ' + r.status) };
    });
  }).catch(function(e){
    return { ok: false, error: (e && e.message) || 'мрежов срив' };
  }).then(function(res){
    supplyCoSaving[key] = false;
    if(!res.ok){ toast('Грешка при запис на коментара: ' + res.error, '#dc2626'); return; }
    /* Междувременно е избрана друга седмица — локалното състояние е за нея. */
    if(supplyOvData && week === supplyOvWeek){
      var list = supplyOvData.coNotes = supplyOvData.coNotes || [];
      var n = supplyOvCoNote(templateId, store);
      if(!n){ n = { template_id: templateId, store_name: store, week_start: week }; list.push(n); }
      n.co_note = body.co_note; n.co_note_by = body.co_note_by; n.co_note_at = body.co_note_at;
      var by = document.getElementById('sup-co-by-' + templateId + '-' + idx);
      if(by) by.innerHTML = n.co_note ? [esc(n.co_note_by), supplyFmtDM(n.co_note_at)].join(', ') : '';
    }
    toast('✓ Запазено');
  });
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
   Празна клетка остава празна (null в aoa), не 0. Коментарите — втори лист,
   коментарът на Снабдяването — трети („Снабдяване"). */
function supplyExportExcel(templateId){
  var t = supplyTemplates.find(function(x){ return x.id === templateId; });
  if(!t || !supplyOvData){ toast('Няма заредени данни за износ', '#dc2626'); return; }
  var week = supplyOvWeek;
  function doExport(){
    try {
      var m = supplyOvMatrix(t);
      var aoa = [supplyOvHeaderRow(t, m)];
      m.rows.forEach(function(r){
        var cells = r.cells.map(function(v, ci){
          return (v === null && m.noNeed[supplyOvCellStore(m, ci)]) ? SUPPLY_NO_NEED_TEXT : v;
        });
        aoa.push([r.item.sap_code || '', r.item.name || '', r.item.supplier || ''].concat(cells, r.totals));
      });
      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{wch:10},{wch:40},{wch:24}].concat(aoa[0].slice(3).map(function(){ return {wch:12}; }));
      XLSX.utils.book_append_sheet(wb, ws, supplySheetName(t.name));
      /* Коментарите — на отделен лист: в матрицата колоните са обекти и един
         коментар на клетка няма къде да стои. Без коментари листът го няма. */
      var notes = [['Обект', 'САП', 'Име', 'Доставчик', 'Коментар']];
      m.rows.forEach(function(r){
        r.notes.forEach(function(n){ notes.push([n.store, r.item.sap_code || '', r.item.name || '', r.item.supplier || '', n.note]); });
      });
      if(notes.length > 1){
        var wn = XLSX.utils.aoa_to_sheet(notes);
        wn['!cols'] = [{wch:18},{wch:10},{wch:40},{wch:24},{wch:60}];
        XLSX.utils.book_append_sheet(wb, wn, supplySheetName(t.name) === 'Коментари' ? 'Коментари (2)' : 'Коментари');
      }
      /* Коментарът на Снабдяването — свой лист „Снабдяване": обект -> текст за
         седмицата. Само непразните; без тях листът го няма. */
      var co = [['Обект', 'Коментар на Снабдяването', 'От', 'Кога']];
      supplyOvRoster(t).forEach(function(s){
        var n = supplyOvCoNote(t.id, s);
        if(n && n.co_note && String(n.co_note).trim() !== '') co.push([s, String(n.co_note).trim(), n.co_note_by || '', supplyFmtStamp(n.co_note_at)]);
      });
      if(co.length > 1){
        var wc = XLSX.utils.aoa_to_sheet(co);
        wc['!cols'] = [{wch:18},{wch:60},{wch:18},{wch:18}];
        XLSX.utils.book_append_sheet(wb, wc, supplySheetName(t.name) === 'Снабдяване' ? 'Снабдяване (2)' : 'Снабдяване');
      }
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
