/* revisions.js — под-таб „📅 График ревизии“ в таба „Ревизии и преоценка“
   (14.10.2026). Таблица revision_schedule (revision-schedule-schema.sql):
   една седмица на ред — starts_on / ends_on, kind ('groups' | 'none' |
   'movements'), note, groups (jsonb [{code, name}]).

   Всички в таба виждат цялата година: текущата седмица (прозорецът включва
   днес) най-отгоре с бадж, после бъдещите, а миналите — свити под
   „Минали (N)“. Контролинг (admin/accounting) добавя, редактира и трие;
   обектите само четат — „пише само Контролинг“ е проверка тук, не в базата
   (общ anon ключ, виж хедъра на схемата).

   Табът „Ревизии и преоценка“ (id tab-revaluation, от преди) има под-лента
   #rev-subnav: „📅 График ревизии“ (по подразбиране, rs*) и „🏷️ Преоценка“
   (revaluation.js, по rvCanSee). Трети под-таб („Минуси (953)“) се добавя
   като нов бутон в лентата и нов mod-* — без пренареждане. */

var rsWeeks = [];
var rsShowPast = false;
var rsEditId = null;   /* null = няма форма, 'new' = нова седмица, иначе id */
var rsForm = null;     /* {starts_on, ends_on, kind, note, groups:[{code,name}]} */
var rsLoadSeq = 0;
var RS_KIND_LABEL = { groups: 'Ревизия на групи', none: 'Няма ревизии', movements: 'Движения' };

function rsCanSee(){
  return !!currentUser && ['admin', 'accounting', 'supply', 'manager', 'sklad', 'controlling'].indexOf(currentUser.role) >= 0;
}
/* Самият график. От 18.10.2026 и за Контролинг (само гледане — rsCanEdit е
   admin / accounting); дотогава Контролинг го нямаше. */
function rsCanSeeSchedule(){ return rsCanSee(); }
function rsCanEdit(){ return !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'accounting'); }

/* ─── Подредба ─────────────────────────────────────────── */
/* {current:[…], future:[…], past:[…]} спрямо днес (местна дата). */
function rsSplit(weeks, t){
  var out = { current: [], future: [], past: [] };
  weeks.slice().sort(function(a, b){ return String(a.starts_on).localeCompare(String(b.starts_on)); }).forEach(function(w){
    if(w.ends_on < t) out.past.push(w);
    else if(w.starts_on > t) out.future.push(w);
    else out.current.push(w);
  });
  out.past.reverse(); /* най-скорошната минала — първа */
  return out;
}
function rsGroupsOf(w){
  var g = w && w.groups;
  if(typeof g === 'string'){ try { g = JSON.parse(g); } catch(e){ g = []; } }
  return Array.isArray(g) ? g : [];
}
function rsRange(w){
  var a = fmtDate(w.starts_on), b = fmtDate(w.ends_on);
  return a.slice(0, 5) + ' – ' + b;
}

/* ─── Зареждане ────────────────────────────────────────── */
function loadRevSchedule(){
  var el = document.getElementById('mod-rev-schedule');
  if(!el) return Promise.resolve();
  if(!rsCanSeeSchedule()){ el.innerHTML = '<div class="pg-title">📅 График ревизии</div><div class="card">Нямаш достъп до този модул.</div>'; return Promise.resolve(); }
  var seq = ++rsLoadSeq;
  el.innerHTML = '<div class="pg-title">📅 График ревизии</div><div style="padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
  return sbGetOk('revision_schedule', 'select=*&order=starts_on.asc').then(function(res){
    if(seq !== rsLoadSeq) return;
    if(!res.ok){
      rsWeeks = [];
      el.innerHTML = '<div class="pg-title">📅 График ревизии</div><div id="rs-load-err" class="card" style="color:#b91c1c;">⚠ Графикът не се зареди: ' + esc(res.error) + '</div>';
      toast('Графикът не се зареди: ' + res.error, '#dc2626');
      return;
    }
    rsWeeks = res.rows;
    rsRender();
  });
}

/* ─── Рендер ───────────────────────────────────────────── */
function rsWeekHtml(w, isCurrent){
  var edit = rsCanEdit();
  if(edit && rsEditId === w.id) return rsFormHtml();
  var g = rsGroupsOf(w);
  var h = '<div class="card rs-week" id="rs-week-' + escAttr(w.id) + '" style="' + (isCurrent ? 'border:2px solid #2563eb;background:#eff6ff;' : '') + '">';
  h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  h += '<b style="font-size:15px;">' + esc(rsRange(w)) + '</b>';
  if(isCurrent) h += '<span class="rs-now" style="background:#2563eb;color:#fff;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700;">тази седмица</span>';
  h += '<span style="font-size:12px;color:#64748b;">' + esc(RS_KIND_LABEL[w.kind] || w.kind) + '</span>';
  if(edit){
    h += '<span style="flex:1;"></span>' +
      '<button class="btn-sm" data-id="' + escAttr(w.id) + '" onclick="rsOpenEdit(this.dataset.id)" title="Редактирай">✏️</button>' +
      '<button class="btn-sm" data-id="' + escAttr(w.id) + '" onclick="rsDelete(this.dataset.id)" title="Изтрий">🗑</button>';
  }
  h += '</div>';
  if(w.kind === 'none') h += '<div style="margin-top:6px;color:#92400e;">Няма ревизии' + (w.note ? ' — ' + esc(w.note) : '') + '</div>';
  else if(w.kind === 'movements') h += '<div style="margin-top:6px;font-weight:600;">Движения</div>';
  if(w.note && w.kind !== 'none') h += '<div class="rs-note" style="margin-top:6px;font-size:12px;color:#92400e;">📝 ' + esc(w.note) + '</div>';
  if(w.kind === 'groups'){
    if(!g.length) h += '<div style="margin-top:6px;font-size:12px;color:#94a3b8;">Няма въведени групи.</div>';
    else {
      h += '<div class="tbl-wrap tbl-compact" style="margin-top:6px;"><table><thead><tr><th>Код</th><th>Група</th></tr></thead><tbody>';
      g.forEach(function(x){ h += '<tr><td style="font-family:DM Mono,monospace;">' + esc(x.code) + '</td><td>' + esc(x.name) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
  }
  return h + '</div>';
}
function rsRender(){
  var el = document.getElementById('mod-rev-schedule');
  if(!el) return;
  var parts = rsSplit(rsWeeks, today());
  var h = '<div class="pg-title">📅 График ревизии</div>';
  if(rsCanEdit()){
    h += '<div style="margin-bottom:10px;"><button class="btn-sm" onclick="rsOpenNew()" style="background:#2563eb;color:#fff;">＋ Седмица</button></div>';
    if(rsEditId === 'new') h += rsFormHtml();
  }
  if(!rsWeeks.length) h += '<div class="card" style="color:#94a3b8;">Графикът е празен.</div>';
  h += '<div id="rs-current">';
  parts.current.forEach(function(w){ h += rsWeekHtml(w, true); });
  h += '</div><div id="rs-future">';
  parts.future.forEach(function(w){ h += rsWeekHtml(w, false); });
  h += '</div>';
  if(parts.past.length){
    h += '<div style="margin-top:14px;"><button class="filter-btn" id="rs-past-toggle" onclick="rsTogglePast()">' + (rsShowPast ? '▾' : '▸') + ' Минали (' + parts.past.length + ')</button></div>';
    h += '<div id="rs-past" style="' + (rsShowPast ? '' : 'display:none;') + 'opacity:.75;">';
    parts.past.forEach(function(w){ h += rsWeekHtml(w, false); });
    h += '</div>';
  }
  el.innerHTML = h;
}
function rsTogglePast(){ rsShowPast = !rsShowPast; rsRender(); }

/* ─── Форма (Контролинг) ───────────────────────────────── */
function rsOpenNew(){
  if(!rsCanEdit()) return;
  rsEditId = 'new';
  rsForm = { starts_on: '', ends_on: '', kind: 'groups', note: '', groups: [{ code: '', name: '' }] };
  rsRender();
}
function rsOpenEdit(id){
  if(!rsCanEdit()) return;
  var w = rsWeeks.filter(function(x){ return x.id === id; })[0];
  if(!w) return;
  rsEditId = id;
  rsForm = { starts_on: w.starts_on, ends_on: w.ends_on, kind: w.kind || 'groups', note: w.note || '',
    groups: rsGroupsOf(w).map(function(x){ return { code: x.code || '', name: x.name || '' }; }) };
  if(!rsForm.groups.length) rsForm.groups.push({ code: '', name: '' });
  rsRender();
}
function rsCancel(){ rsEditId = null; rsForm = null; rsRender(); }
function rsFormHtml(){
  var f = rsForm;
  var h = '<div class="card" id="rs-form" style="border:2px dashed #2563eb;">';
  h += '<div style="font-weight:700;margin-bottom:8px;">' + (rsEditId === 'new' ? '＋ Нова седмица' : '✏️ Редакция на седмица') + '</div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">' +
    '<label style="font-size:12px;">от</label><input id="rs-f-from" type="date" value="' + escAttrVal(f.starts_on) + '" onchange="rsFormSet(\'starts_on\',this.value)">' +
    '<label style="font-size:12px;">до</label><input id="rs-f-to" type="date" value="' + escAttrVal(f.ends_on) + '" onchange="rsFormSet(\'ends_on\',this.value)">' +
    '<select id="rs-f-kind" onchange="rsFormSet(\'kind\',this.value)">' +
    ['groups', 'none', 'movements'].map(function(k){ return '<option value="' + k + '"' + (f.kind === k ? ' selected' : '') + '>' + RS_KIND_LABEL[k] + '</option>'; }).join('') +
    '</select>' +
    '<input id="rs-f-note" type="text" placeholder="Бележка" value="' + escAttrVal(f.note) + '" onchange="rsFormSet(\'note\',this.value)" style="width:280px;">' +
    '</div>';
  if(f.kind === 'groups'){
    h += '<div style="margin-top:8px;">';
    f.groups.forEach(function(g, i){
      h += '<div class="rs-g-row" style="display:flex;gap:6px;margin-bottom:4px;">' +
        '<input id="rs-g-code-' + i + '" type="text" placeholder="Код" value="' + escAttrVal(g.code) + '" data-i="' + i + '" onchange="rsGroupSet(+this.dataset.i,\'code\',this.value)" style="width:110px;">' +
        '<input id="rs-g-name-' + i + '" type="text" placeholder="Група" value="' + escAttrVal(g.name) + '" data-i="' + i + '" onchange="rsGroupSet(+this.dataset.i,\'name\',this.value)" style="width:240px;">' +
        '<button class="btn-sm" data-i="' + i + '" onclick="rsGroupDel(+this.dataset.i)" title="Махни групата">–</button></div>';
    });
    h += '<button class="btn-sm" onclick="rsGroupAdd()">＋ Група</button></div>';
  }
  h += '<div style="margin-top:10px;display:flex;gap:6px;">' +
    '<button class="btn-sm" onclick="rsSave()" style="background:#2563eb;color:#fff;">Запази</button>' +
    '<button class="btn-sm" onclick="rsCancel()">Откажи</button></div>';
  return h + '</div>';
}
function rsFormSet(field, val){
  if(!rsForm) return;
  rsForm[field] = val;
  if(field === 'kind') rsRender();
}
function rsGroupSet(i, field, val){ if(rsForm && rsForm.groups[i]) rsForm.groups[i][field] = val; }
function rsGroupAdd(){ if(!rsForm) return; rsForm.groups.push({ code: '', name: '' }); rsRender(); }
function rsGroupDel(i){ if(!rsForm) return; rsForm.groups.splice(i, 1); rsRender(); }

/* Проверка + тяло за запис; null = невалидно (toast вече е показан). */
function rsFormBody(){
  var f = rsForm;
  if(!f.starts_on || !f.ends_on){ toast('Въведи от–до', '#dc2626'); return null; }
  if(f.ends_on < f.starts_on){ toast('„До“ е преди „от“', '#dc2626'); return null; }
  if(!RS_KIND_LABEL[f.kind]){ toast('Невалиден вид', '#dc2626'); return null; }
  var groups = [];
  if(f.kind === 'groups'){
    for(var i = 0; i < f.groups.length; i++){
      var code = String(f.groups[i].code || '').trim(), name = String(f.groups[i].name || '').trim();
      if(!code && !name) continue;
      if(!code){ toast('Група „' + name + '“ е без код', '#dc2626'); return null; }
      groups.push({ code: code, name: name });
    }
  }
  return { starts_on: f.starts_on, ends_on: f.ends_on, kind: f.kind, note: String(f.note || '').trim() || null, groups: groups };
}
/* 23505 / 409 — уникалността по starts_on; казва се на човешки, не се поглъща. */
function rsSaveErr(res, starts){
  var e = res && res.error;
  if((res && res.status === 409) || (e && e.code === '23505')) return 'Вече има седмица, която започва на ' + fmtDate(starts);
  return sbErrMsg(res);
}
function rsSave(){
  if(!rsCanEdit() || !rsForm) return Promise.resolve(false);
  var body = rsFormBody();
  if(!body) return Promise.resolve(false);
  var who = currentUser.display_name || currentUser.email;
  if(rsEditId === 'new'){
    body.created_by = who;
    return sbPostReturn('revision_schedule', body).then(function(res){
      if(!res.ok || !res.row){ toast('Седмицата не е записана: ' + rsSaveErr(res, body.starts_on), '#dc2626'); return false; }
      rsWeeks.push(res.row);
      rsEditId = null; rsForm = null;
      toast('Седмицата е добавена');
      rsRender(); return true;
    });
  }
  var id = rsEditId;
  body.updated_by = who;
  body.updated_at = new Date().toISOString();
  return sbPatch('revision_schedule', 'id=eq.' + id, body).then(function(res){
    if(!res.ok){ toast('Промяната не е записана: ' + rsSaveErr(res, body.starts_on), '#dc2626'); return false; }
    rsWeeks.forEach(function(w){ if(w.id === id) Object.keys(body).forEach(function(k){ w[k] = body[k]; }); });
    rsEditId = null; rsForm = null;
    toast('Седмицата е обновена');
    rsRender(); return true;
  });
}
function rsDelete(id){
  if(!rsCanEdit()) return Promise.resolve(false);
  var w = rsWeeks.filter(function(x){ return x.id === id; })[0];
  if(!w) return Promise.resolve(false);
  if(!confirm('Изтриване на седмицата ' + rsRange(w) + '?')) return Promise.resolve(false);
  return sbDelete('revision_schedule', 'id=eq.' + id).then(function(res){
    if(!res.ok || res.count === 0){
      toast(res.ok ? 'Седмицата не е изтрита (0 реда)' : 'Седмицата не е изтрита: ' + sbErrMsg(res), '#dc2626');
      return false;
    }
    rsWeeks = rsWeeks.filter(function(x){ return x.id !== id; });
    toast('Седмицата е изтрита');
    rsRender(); return true;
  });
}
