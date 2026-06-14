/* calendar.js — Транспортен Календар */

var calWeekOffset = 0; /* 0 = текущата седмица */
var calTemplates  = [];
var showTemplatesMgr = false;
var calRoutes     = [];
var calTransport  = [];
var calClients    = [];

var PURPOSE = {
  goods_exchange:  { label: '🔄 Обмен на стоки',    color: '#2563eb', bg: '#eff6ff' },
  client_delivery: { label: '📦 Клиентска доставка', color: '#16a34a', bg: '#f0fdf4' },
  warehouse:       { label: '🏭 Складов трансфер',   color: '#7c3aed', bg: '#f5f3ff' },
  other:           { label: '🚐 Друго',              color: '#64748b', bg: '#f8fafc' }
};

var DAY_NAMES = ['Понеделник','Вторник','Сряда','Четвъртък','Петък','Събота','Неделя'];
var DAY_SHORT = ['Пон','Вт','Ср','Чет','Пет','Съб','Нед'];

function getWeekDates(offset) {
  var now = new Date();
  var dow = (now.getDay() + 6) % 7; /* 0=Mon */
  var mon = new Date(now);
  mon.setDate(now.getDate() - dow + offset * 7);
  mon.setHours(0,0,0,0);
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(mon); d.setDate(mon.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmtDMY(d) {
  return d.getDate()+'.'+(d.getMonth()<9?'0':'')+(d.getMonth()+1)+'.'+d.getFullYear();
}

function canEditCal() {
  return currentUser && ['admin','accounting','logistics','manager','sklad'].indexOf(currentUser.role) >= 0;
}

/* ── LOAD ── */
function loadCalendar() {
  var wrap = document.getElementById('mod-calendar');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  var days = getWeekDates(calWeekOffset);
  var from = days[0].toISOString().slice(0,10);
  var to   = days[6].toISOString().slice(0,10);

  Promise.all([
    sbGet('bus_routes', 'route_date=gte.'+from+'&route_date=lte.'+to+'&order=route_date.asc'+storeQ()),
    sbGet('transport_orders', 'date=gte.'+from+'&date=lte.'+to+'&order=date.asc'+storeQ()),
    sbGet('client_orders', 'date=gte.'+from+'&date=lte.'+to+'&order=date.asc'+storeQ()),
    sbGet('route_templates', 'active=eq.true&order=day_of_week.asc'+storeQ())
  ]).then(function(r) {
    calRoutes    = Array.isArray(r[0]) ? r[0] : [];
    calTransport = Array.isArray(r[1]) ? r[1] : [];
    calClients   = Array.isArray(r[2]) ? r[2] : [];
    /* Генерирай виртуални маршрути от шаблоните за текущата седмица */
    var templates = Array.isArray(r[3]) ? r[3] : [];
    var days2 = getWeekDates(calWeekOffset);
    var dayMap = {mon:0,tue:1,wed:2,thu:3,fri:4,sat:5,sun:6};
    templates.forEach(function(t) {
      var di = dayMap[t.day_of_week];
      if (di === undefined) return;
      var d = days2[di];
      var dateStr = d.toISOString().slice(0,10);
      /* Не добавяй ако вече има ръчен запис за същия магазин/ден */
      var exists = calRoutes.some(function(r) {
        return r.route_date===dateStr && r.store_name===t.store_name && r._fromTemplate;
      });
      if (!exists) {
        calRoutes.push({
          id: 'tmpl_'+t.id+'_'+dateStr,
          route_date: dateStr,
          store_name: t.store_name,
          destination: t.destination,
          purpose: t.purpose,
          departure_time: t.departure_time,
          notes: t.notes,
          _fromTemplate: true,
          _templateId: t.id
        });
      }
    });
    renderCalendar();
  }).catch(function(err) {
    console.error('loadCalendar error:', err);
    var w = document.getElementById('mod-calendar');
    if (w) w.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
  });
}

/* ── RENDER ── */
function renderCalendar() {
  var wrap = document.getElementById('mod-calendar');
  if (!wrap) return;
  var days    = getWeekDates(calWeekOffset);
  var today   = new Date(); today.setHours(0,0,0,0);
  var canEdit = canEditCal();
  var wkNum   = getWeekNumber(days[0]);

  var h = '<div style="max-width:1400px;margin:0 auto;padding:16px;">';

  /* Хедър */
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">';
  h += '<div style="display:flex;align-items:center;gap:12px;">';
  h += '<div style="font-size:20px;font-weight:600;">🚐 Транспортен Календар</div>';
  h += '<span style="font-family:DM Mono,monospace;font-size:12px;color:#94a3b8;padding:3px 10px;background:#f1f5f9;border-radius:40px;">Седмица '+wkNum+'</span>';
  h += '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center;">';
  h += '<button onclick="calWeekOffset--;loadCalendar();" style="border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">← Предишна</button>';
  h += '<span style="font-size:13px;color:#64748b;">'+fmtDMY(days[0])+' — '+fmtDMY(days[6])+'</span>';
  h += '<button onclick="calWeekOffset++;loadCalendar();" style="border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">Следваща →</button>';
  if (calWeekOffset !== 0) h += '<button onclick="calWeekOffset=0;loadCalendar();" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">Днес</button>';
  if (canEdit) h += '<button onclick="openCalRouteModal(null,null)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави маршрут</button>';
  if (currentUser && currentUser.role==='admin') h += '<button onclick="openTemplatesMgr()" style="border:1px solid #334155;background:#1e293b;color:#94a3b8;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">⚙️ Ротационен график</button>';
  h += '</div></div>';

  /* Легенда */
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">';
  Object.values(PURPOSE).forEach(function(p){
    h += '<span style="display:flex;align-items:center;gap:5px;font-size:11px;padding:3px 10px;border-radius:20px;background:'+p.bg+';color:'+p.color+';">'+p.label+'</span>';
  });
  h += '</div>';

  /* Календарна решетка — 7 дни */
  h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">';
  days.forEach(function(day, i) {
    var dateStr  = day.toISOString().slice(0,10);
    var isToday  = day.getTime() === today.getTime();
    var isWeekend = i >= 5;

    var dayRoutes    = calRoutes.filter(function(r){ return r.route_date===dateStr; });
    var dayTransport = calTransport.filter(function(r){ return r.date===dateStr; });
    var dayClients   = calClients.filter(function(r){ return r.date===dateStr; });
    var total = dayRoutes.length + dayTransport.length + dayClients.length;

    h += '<div style="border:1px solid '+(isToday?'#2563eb':isWeekend?'#f1f5f9':'#e2e8f0')+';border-radius:10px;padding:10px;min-height:140px;background:'+(isToday?'#eff6ff':isWeekend?'#fafafa':'#fff')+';display:flex;flex-direction:column;">';

    /* Ден заглавие */
    h += '<div style="margin-bottom:8px;">';
    h += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:'+(isToday?'#2563eb':isWeekend?'#94a3b8':'#94a3b8')+';">'+DAY_NAMES[i]+'</div>';
    h += '<div style="font-family:DM Mono,monospace;font-size:20px;font-weight:700;color:'+(isToday?'#2563eb':isWeekend?'#cbd5e1':'#0f172a')+';">'+day.getDate()+'<span style="font-size:12px;color:#94a3b8;">.'+(day.getMonth()+1)+'</span></div>';
    if (total) h += '<div style="font-size:10px;color:#94a3b8;">'+total+' записа</div>';
    h += '</div>';

    /* Маршрути */
    dayRoutes.forEach(function(r) {
      var p = PURPOSE[r.purpose] || PURPOSE.other;
      h += '<div style="background:'+p.bg+';border-left:2px solid '+p.color+';border-radius:0 5px 5px 0;padding:4px 6px;margin-bottom:4px;font-size:11px;">';
      h += '<div style="font-weight:600;color:'+p.color+';">'+p.label+'</div>';
      h += '<div style="color:#374151;">'+esc(r.store_name||'')+(r.destination?' → '+esc(r.destination):'')+'</div>';
      if (r.departure_time) h += '<div style="color:#94a3b8;">🕐 '+esc(r.departure_time)+'</div>';
      if (r.notes) h += '<div style="color:#94a3b8;font-style:italic;">'+esc(r.notes.slice(0,40))+'</div>';
      if (r._fromTemplate) {
        h += '<span style="font-size:9px;color:#94a3b8;font-style:italic;">📅 Ротационен</span>';
      } else if (canEdit) {
        h += '<button data-id="'+r.id+'" onclick="deleteCalRoute(this.dataset.id)" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:10px;padding:0;margin-top:2px;">✕ Изтрий</button>';
      }
      h += '</div>';
    });

    /* Транспортни заявки */
    dayTransport.forEach(function(t) {
      h += '<div style="background:#f0fdf4;border-left:2px solid #16a34a;border-radius:0 5px 5px 0;padding:4px 6px;margin-bottom:4px;font-size:11px;">';
      h += '<div style="font-weight:600;color:#16a34a;">🚚 Транспорт</div>';
      h += '<div style="color:#374151;">'+esc(t.store_name||'')+(t.destination?' → '+esc(t.destination):'')+'</div>';
      if (t.notes) h += '<div style="color:#94a3b8;">'+esc(t.notes.slice(0,30))+'</div>';
      h += '</div>';
    });

    /* Клиентски доставки */
    dayClients.filter(function(c){ return c.fulfiller_date===dateStr||c.date===dateStr; }).slice(0,3).forEach(function(c) {
      h += '<div style="background:#fdf4ff;border-left:2px solid #a855f7;border-radius:0 5px 5px 0;padding:4px 6px;margin-bottom:4px;font-size:11px;">';
      h += '<div style="font-weight:600;color:#7c3aed;">📋 Клиентска заявка</div>';
      h += '<div style="color:#374151;">'+esc(c.store_name||'')+'</div>';
      if (c.product) h += '<div style="color:#94a3b8;">'+esc((c.product||'').slice(0,30))+'</div>';
      h += '</div>';
    });

    if (!total && !isWeekend) {
      h += '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#e2e8f0;font-size:12px;">Свободен</div>';
    }

    /* Добави бутон */
    if (canEdit && !isWeekend) {
      h += '<button data-date="'+dateStr+'" onclick="openCalRouteModal(null,this.dataset.date)" style="width:100%;margin-top:auto;padding:3px;border:1px dashed #cbd5e1;border-radius:5px;background:none;color:#94a3b8;font-size:10px;cursor:pointer;font-family:inherit;">+ Добави</button>';
    }

    h += '</div>';
  });
  h += '</div></div>';
  h += calRouteModalHtml(days);
  wrap.innerHTML = h;
}

function getWeekNumber(d) {
  var dt = new Date(d); dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  var w1 = new Date(dt.getFullYear(),0,4);
  return 1+Math.round(((dt-w1)/86400000-3+(w1.getDay()+6)%7)/7);
}

/* ── МОДАЛ ── */
function calRouteModalHtml(days) {
  var dayOpts = days.slice(0,5).map(function(d,i){
    return '<option value="'+d.toISOString().slice(0,10)+'">'+DAY_NAMES[i]+' ('+fmtDMY(d)+')</option>';
  }).join('');
  var purposeOpts = Object.keys(PURPOSE).map(function(k){
    return '<option value="'+k+'">'+PURPOSE[k].label+'</option>';
  }).join('');

  return '<div class="bov" id="calr-ov"><div class="bmod" style="width:460px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">+ Добави маршрут</div>'+
    '<button onclick="closeCalRoute()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<label class="fl">Дата</label>'+
    '<select class="fi" id="cr-date">'+dayOpts+'</select>'+
    '<label class="fl">Магазин *</label>'+
    '<select class="fi" id="cr-store"><option value="">-- Избери --</option></select>'+
    '<label class="fl">Дестинация (до кой магазин/обект)</label>'+
    '<input class="fi" id="cr-dest" placeholder="напр. Кърджали, Хасково">'+
    '<label class="fl">Вид</label>'+
    '<select class="fi" id="cr-purpose">'+purposeOpts+'</select>'+
    '<label class="fl">Час на тръгване</label>'+
    '<input class="fi" id="cr-time" placeholder="напр. 08:00" type="time">'+
    '<label class="fl">Бележки</label>'+
    '<input class="fi" id="cr-notes" placeholder="Допълнителна информация">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeCalRoute()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitCalRoute()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>'+
    '</div></div></div>';
}

function openCalRouteModal(routeId, dateStr) {
  renderCalendar();
  var ov = document.getElementById('calr-ov');
  if (!ov) return;
  if (dateStr) {
    var sel = document.getElementById('cr-date');
    if (sel) sel.value = dateStr;
  }
  /* Зареди магазини */
  var stores = assignedStores();
  var storeSel = document.getElementById('cr-store');
  if (storeSel) {
    if (stores && stores.length === 1) {
      storeSel.innerHTML = '<option>'+esc(stores[0])+'</option>';
    } else if (stores) {
      storeSel.innerHTML = '<option value="">-- Избери --</option>'+stores.map(function(s){return '<option>'+esc(s)+'</option>';}).join('');
    } else {
      sbGet('stores','select=name&order=name').then(function(data){
        if(Array.isArray(data)&&storeSel)
          storeSel.innerHTML='<option value="">-- Избери --</option>'+data.map(function(s){return '<option>'+esc(s.name)+'</option>';}).join('');
      });
    }
  }
  ov.classList.add('open');
}
function closeCalRoute() {
  var ov=document.getElementById('calr-ov'); if(ov)ov.classList.remove('open');
}

function submitCalRoute() {
  var store=(document.getElementById('cr-store').value||'').trim();
  var date=document.getElementById('cr-date').value;
  if(!store){toast('Избери магазин','#dc2626');return;}
  if(!date){toast('Избери дата','#dc2626');return;}
  sbPost('bus_routes',{
    route_date:date,
    store_name:store,
    destination:document.getElementById('cr-dest').value,
    purpose:document.getElementById('cr-purpose').value,
    departure_time:document.getElementById('cr-time').value,
    notes:document.getElementById('cr-notes').value,
    created_by:currentUser.display_name||currentUser.email
  }).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeCalRoute(); toast('✅ Маршрутът е добавен!'); loadCalendar();
  });
}

function deleteCalRoute(id) {
  if(!confirm('Изтрий маршрута?'))return;
  sbDelete('bus_routes','id=eq.'+id).then(function(){ toast('✓ Изтрит'); loadCalendar(); });
}

/* ═══════ РОТАЦИОНЕН ГРАФИК — ШАБЛОНИ ═══════════════════ */

var templatesList = [];

function openTemplatesMgr() {
  sbGet('route_templates', 'active=eq.true&order=day_of_week.asc').then(function(data) {
    templatesList = Array.isArray(data) ? data : [];
    renderTemplatesMgr();
  });
}

function renderTemplatesMgr() {
  var existing = document.getElementById('tmpl-mgr-ov');
  if (existing) existing.remove();

  var DAY_BG = {mon:'#eff6ff',tue:'#f0fdf4',wed:'#fffbeb',thu:'#fff1f2',fri:'#f5f3ff',sat:'#f8fafc',sun:'#f8fafc'};
  var DAY_LBL = {mon:'Понеделник',tue:'Вторник',wed:'Сряда',thu:'Четвъртък',fri:'Петък',sat:'Събота',sun:'Неделя'};

  var rows = templatesList.length ? templatesList.map(function(t) {
    var p = PURPOSE[t.purpose]||PURPOSE.other;
    return '<tr style="border-bottom:1px solid #f1f5f9;">'+
      '<td style="padding:7px 10px;font-size:12px;"><span style="background:'+(DAY_BG[t.day_of_week]||'#f8fafc')+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+(DAY_LBL[t.day_of_week]||t.day_of_week)+'</span></td>'+
      '<td style="padding:7px 10px;font-weight:500;font-size:13px;">'+esc(t.store_name||'')+'</td>'+
      '<td style="padding:7px 10px;font-size:12px;color:#64748b;">'+esc(t.destination||'—')+'</td>'+
      '<td style="padding:7px 10px;"><span style="background:'+p.bg+';color:'+p.color+';padding:2px 7px;border-radius:20px;font-size:11px;">'+p.label+'</span></td>'+
      '<td style="padding:7px 10px;font-size:12px;color:#94a3b8;">'+esc(t.departure_time||'—')+'</td>'+
      '<td style="padding:7px 10px;"><button data-id="'+t.id+'" onclick="deleteTmpl(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✕</button></td>'+
      '</tr>';
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">Няма зададени маршрути. Добави с формата по-долу.</td></tr>';

  var purposeOpts = Object.keys(PURPOSE).map(function(k){return '<option value="'+k+'">'+PURPOSE[k].label+'</option>';}).join('');
  var dayOpts = Object.keys(DAY_LBL).map(function(k){return '<option value="'+k+'">'+DAY_LBL[k]+'</option>';}).join('');

  var wrap = document.getElementById('mod-calendar');
  var div = document.createElement('div');
  div.id = 'tmpl-mgr-ov';
  div.className = 'bov';
  div.style.cssText = 'display:flex;';
  div.innerHTML = '<div class="bmod" style="width:700px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:16px;font-weight:600;">⚙️ Ротационен график — Шаблони</div>'+
    '<button onclick="closeTemplatesMgr()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;background:#fffbeb;padding:8px 12px;border-radius:6px;border:1px solid #fde68a;">💡 Тези маршрути се показват автоматично всяка седмица в календара. Добавени веднъж — важат за всички бъдещи седмици.</div>'+
    '<div style="overflow-x:auto;margin-bottom:16px;"><table style="width:100%;border-collapse:collapse;font-size:13px;">'+
    '<thead><tr style="background:#f8fafc;"><th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;">Ден</th><th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;">Магазин</th><th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;">Дестинация</th><th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;">Вид</th><th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;">Час</th><th style="padding:7px 10px;border-bottom:1px solid #e2e8f0;"></th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>'+
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">'+
    '<div style="font-size:12px;font-weight:600;color:#0f172a;margin-bottom:10px;">+ Добави постоянен маршрут</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">'+
    '<div><label class="fl">Ден</label><select class="fi" id="tmpl-day">'+dayOpts+'</select></div>'+
    '<div><label class="fl">Магазин *</label><select class="fi" id="tmpl-store"><option value="">-- Избери --</option></select></div>'+
    '<div><label class="fl">Дестинация</label><input class="fi" id="tmpl-dest" placeholder="напр. Хасково"></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'+
    '<div><label class="fl">Вид</label><select class="fi" id="tmpl-purpose">'+purposeOpts+'</select></div>'+
    '<div><label class="fl">Час</label><input class="fi" id="tmpl-time" type="time" placeholder="08:00"></div>'+
    '</div>'+
    '<div style="text-align:right;margin-top:10px;">'+
    '<button onclick="submitTmpl()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 18px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>'+
    '</div></div>'+
    '</div>';

  document.body.appendChild(div);

  /* Зареди магазини */
  sbGet('stores','select=name&order=name').then(function(data) {
    var sel = document.getElementById('tmpl-store');
    if (sel && Array.isArray(data)) {
      sel.innerHTML = '<option value="">-- Избери --</option>' +
        data.map(function(s){ return '<option>'+esc(s.name)+'</option>'; }).join('');
    }
  });
}

function closeTemplatesMgr() {
  var el = document.getElementById('tmpl-mgr-ov');
  if (el) el.remove();
}

function submitTmpl() {
  var store = (document.getElementById('tmpl-store').value||'').trim();
  if (!store) { toast('Избери магазин','#dc2626'); return; }
  sbPost('route_templates', {
    day_of_week:    document.getElementById('tmpl-day').value,
    store_name:     store,
    destination:    document.getElementById('tmpl-dest').value,
    purpose:        document.getElementById('tmpl-purpose').value,
    departure_time: document.getElementById('tmpl-time').value,
    active: true
  }).then(function(res) {
    if (!res.ok) { toast('Грешка','#dc2626'); return; }
    toast('✅ Маршрутът е добавен!');
    openTemplatesMgr(); /* презареди */
    loadCalendar();
  });
}

function deleteTmpl(id) {
  if (!confirm('Изтрий постоянния маршрут?')) return;
  sbPatch('route_templates','id=eq.'+id,{active:false}).then(function() {
    toast('✓ Изтрит'); openTemplatesMgr(); loadCalendar();
  });
}
