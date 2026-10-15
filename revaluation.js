/* revaluation.js — модул „Преоценка" (намаление на цени по кампания).
   Етап 2 от 4 (12.10.2026): пътят на обекта + минимална форма за кампания.
   Схемата е от етап 1 (revaluation-schema.sql, миграция 20261011204320):
   revaluation_campaigns → revaluation_submissions (бланка на обект) →
   revaluation_items (редове).

   Кой какво:
   · обект (роля manager / sklad) — своята бланка; пише само в прозореца на
     отворена кампания и само докато бланката не е подадена;
   · регионален (users.is_regional + assigned_stores) — бланките на своите
     обекти, пише и преди, и след подаване (пак само в прозореца);
   · admin / accounting — отваря и затваря кампании; бланките само чете
     (отключване и колоните на ЦО са етап 3);
   · supply — само чете.
   is_regional НЕ идва с логина (auth-login връща само id, email, store_name,
   role, display_name, assigned_stores, active — проверено на живо v19,
   12.10.2026), затова се чете от users при всяко отваряне на таба.

   Цена ↔ процент: proposed_price = round2(std × (1 − pct/100)) — обикновено
   закръгляне до 2 знака (1,29 × 50 % → 0,65). Закръгляне „надолу до .х9" от
   коментара в схемата е ОТМЕНЕНО (решение 12.10.2026).

   Номерът на обекта (за „Завод" в ZSTOCK и колоната „Магазин" в износа) е
   обратното на SR_SHEET_TO_STORE от stock-returns.js; stores няма номер. */

var rvCampaigns = [];
var rvCampaignId = null;
var rvStore = '';
var rvStoreList = [];
var rvSub = null;
var rvItems = [];
var rvBad = {};        /* id на ред → [причини], от „Подай" */
var rvErr = {};        /* id на ред → съобщение от провален запис */
var rvImportFails = []; /* кодове от последния импорт, които не са записани */
var rvMe = null;       /* {is_regional, assigned_stores} от users */
var rvLoadSeq = 0;
var rvShowAdd = false;
var rvShowNewCampaign = false;
var rvAcRes = [];
var rvAcSeq = 0;
var rvAcTimer = null;
/* app_settings.revaluation_stores — скрит фийчър (HIDDEN-FEATURES.md). Само
   'on' пуска обектите (и правото на регионалния да пише в бланките им);
   липсващ ключ, празно, боклук и паднала заявка = изключено. Чете се при
   всеки логин от setupTabsForRole(); докато отговорът не е дошъл, е false —
   табът на обекта е скрит, тоест не мига. */
var rvStoresOn = false;
var rvStoresSeq = 0;

var RV_STORE_ROLES = ['manager', 'sklad'];
var RV_KIND_LABEL = { mandatory: 'Задължителна', optional: 'Пожелателна' };
var RV_EXPORT_HEADERS = ['Магазин', 'Код', 'Описание на материал', 'Количество', 'Мерна единица',
  'Коментар Обект', 'Стандартна прод. цена', 'Предложение за цена', 'Преоценен код',
  'Цена преоценен код', 'Коментар Ели', 'Тотал ст.пр.цена', 'Тотал преоценка'];

/* ─── Роли ─────────────────────────────────────────────── */
/* Стойност за value="…" на поле. escAttr() минава през esc(), който връща „—"
   за празно — така всяко празно поле излизаше с тире вътре (етапи 2–3а,
   хванато 15.10.2026). Празното трябва да е празно. */
function rvVal(s){ return s == null || s === '' ? '' : escAttr(s); }
function rvIsStoreUser(){ return !!currentUser && RV_STORE_ROLES.indexOf(currentUser.role) >= 0; }
function rvIsCO(){ return !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'accounting'); }
function rvParseList(v){
  if(Array.isArray(v)) return v;
  if(typeof v === 'string' && v.length > 2){
    return v.replace(/^\{|\}$/g, '').split(',').map(function(s){ return s.trim().replace(/^"|"$/g, ''); }).filter(Boolean);
  }
  return [];
}
function rvRegionStores(){
  if(!rvMe || !rvMe.is_regional) return [];
  return rvParseList(rvMe.assigned_stores);
}
function rvIsRegionalFor(store){ return !!store && rvRegionStores().indexOf(store) >= 0; }
/* Видимост на таба: admin, accounting, supply — винаги; обекти — само при
   revaluation_stores = 'on' (скрито от 13.10.2026 до етап 3). Регионалните днес
   са admin/accounting (проверено 12.10.2026) и виждат таба като ЦО; правото им
   да ПИШАТ в бланката на обект е зад същия ключ (rvCanEdit). */
function rvCanSee(){
  if(!currentUser) return false;
  if(['admin', 'accounting', 'supply'].indexOf(currentUser.role) >= 0) return true;
  return rvIsStoreUser() && rvStoresOn;
}
function rvLoadStoresFlag(){
  var seq = ++rvStoresSeq;
  return sbGet('app_settings', 'key=eq.revaluation_stores&select=key,value', true).then(function(rows){
    var row = (Array.isArray(rows) ? rows : []).filter(function(r){ return r && r.key === 'revaluation_stores'; })[0];
    var on = !!row && row.value != null && String(row.value).trim().toLowerCase() === 'on';
    if(seq === rvStoresSeq) rvStoresOn = on;
    return rvStoresOn;
  }).catch(function(){
    if(seq === rvStoresSeq) rvStoresOn = false;
    return false;
  });
}

/* ─── Числа ────────────────────────────────────────────── */
function rvRound2(x){
  if(x == null || !isFinite(x)) return null;
  var s = x < 0 ? -1 : 1;
  return s * Math.round(Math.abs(x) * 100 + 1e-7) / 100;
}
function rvNum(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/\s/g, '');
  if(!s) return null;
  if(s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if(!/^-?\d*\.?\d+$/.test(s)) return null;
  return parseFloat(s);
}
function rvPriceFromPct(std, pct){
  if(std == null || pct == null) return null;
  return rvRound2(std * (1 - pct / 100));
}
function rvPctFromPrice(std, price){
  if(!std || price == null) return null;
  return rvRound2((1 - price / std) * 100);
}
function rvFmt(n){ return n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','); }
function rvFmtQty(n){ return n == null ? '' : String(Number(n)).replace('.', ','); }
function rvIsRepeat(code){ return /^8\d{6}$/.test(String(code || '').trim()); }
function rvStoreNo(store){
  if(typeof SR_SHEET_TO_STORE === 'undefined' || !store) return '';
  var keys = Object.keys(SR_SHEET_TO_STORE);
  for(var i = 0; i < keys.length; i++) if(SR_SHEET_TO_STORE[keys[i]] === store) return keys[i];
  return '';
}
function rvFmtTs(ts){
  if(!ts) return '';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '';
  var p = function(n){ return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ─── Кампания и права ─────────────────────────────────── */
function rvCampaign(){
  for(var i = 0; i < rvCampaigns.length; i++) if(rvCampaigns[i].id === rvCampaignId) return rvCampaigns[i];
  return null;
}
function rvCampaignOpenNow(c){
  if(!c || c.status !== 'open') return false;
  var t = today();
  return (!c.starts_on || t >= c.starts_on) && (!c.ends_on || t <= c.ends_on);
}
function rvCanEdit(){
  var c = rvCampaign();
  if(!c || !rvStore || !rvCampaignOpenNow(c) || !rvStoresOn) return false;
  /* Обработена бланка (етап 3а) е заключена за всички — промяна само след
     „Отключи бланката“ от ЦО. */
  if(rvSub && rvSub.status === 'processed') return false;
  if(rvIsRegionalFor(rvStore)) return true;
  if(rvIsStoreUser() && currentUser.store_name === rvStore) return !rvSub || rvSub.status === 'draft';
  return false;
}
function rvCanSubmit(){ return rvCanEdit() && (!rvSub || rvSub.status === 'draft'); }
function rvPct(){
  if(rvSub && rvSub.default_pct != null) return Number(rvSub.default_pct);
  var c = rvCampaign();
  return c && c.default_pct != null ? Number(c.default_pct) : null;
}
function rvSortCampaigns(list){
  return list.slice().sort(function(a, b){
    var oa = a.status === 'open' ? 0 : 1, ob = b.status === 'open' ? 0 : 1;
    if(oa !== ob) return oa - ob;
    return String(b.starts_on || '').localeCompare(String(a.starts_on || ''));
  });
}
/* Регионалният вижда първо своя регион (и той е по подразбиране). Днешните
   регионални са и admin/accounting, тоест ЦО — след региона идват останалите
   обекти, само за четене. */
function rvStoreOptions(){
  if(rvIsStoreUser()) return [currentUser.store_name];
  var reg = rvRegionStores();
  if(reg.length && !rvIsCO() && currentUser.role !== 'supply') return reg;
  return reg.concat(rvStoreList.filter(function(s){ return reg.indexOf(s) < 0; }));
}

/* ─── Зареждане ────────────────────────────────────────── */
function loadRevaluation(){
  var el = document.getElementById('mod-revaluation');
  if(!el) return Promise.resolve();
  if(!rvCanSee()){ el.innerHTML = '<div class="pg-title">🏷️ Преоценка</div><div class="card">Нямаш достъп до този модул.</div>'; return Promise.resolve(); }
  el.innerHTML = '<div class="pg-title">🏷️ Преоценка</div><div style="padding:20px;color:#94a3b8;">⏳ Зареждане...</div>';
  return Promise.all([
    sbGet('revaluation_campaigns', 'select=*&order=starts_on.desc'),
    sbGet('users', 'email=eq.' + encodeURIComponent(currentUser.email || '') + '&select=is_regional,assigned_stores'),
    sbGet('stores', 'select=name&order=name.asc')
  ]).then(function(r){
    rvCampaigns = rvSortCampaigns(Array.isArray(r[0]) ? r[0] : []);
    rvMe = (r[1] && r[1][0]) || null;
    rvStoreList = (r[2] || []).map(function(s){ return s.name; }).filter(function(n){
      return n && n !== 'Централен офис' && n.indexOf('Логистичен') !== 0;
    });
    if(!rvCampaign()) rvCampaignId = rvCampaigns.length ? rvCampaigns[0].id : null;
    var opts = rvStoreOptions();
    if(rvIsStoreUser()) rvStore = currentUser.store_name;
    else if(opts.indexOf(rvStore) < 0) rvStore = opts[0] || '';
    if(rvIsCoViewer() && !rvCoOpen) return rvLoadOverview();
    return rvLoadSheet();
  });
}
function rvLoadSheet(){
  var seq = ++rvLoadSeq;
  rvBad = {}; rvErr = {}; rvImportFails = [];
  var c = rvCampaign();
  if(!c || !rvStore){ rvSub = null; rvItems = []; rvRender(); return Promise.resolve(); }
  return sbGet('revaluation_submissions', 'campaign_id=eq.' + c.id + '&store_name=eq.' + encodeURIComponent(rvStore) + '&select=*')
    .then(function(subs){
      if(seq !== rvLoadSeq) return;
      rvSub = (subs && subs[0]) || null;
      if(!rvSub){ rvItems = []; return; }
      return sbGet('revaluation_items', 'submission_id=eq.' + rvSub.id + '&select=*&order=sort_order.asc,created_at.asc')
        .then(function(items){ if(seq === rvLoadSeq) rvItems = Array.isArray(items) ? items : []; });
    }).then(function(){ if(seq === rvLoadSeq) rvRender(); });
}
function rvPickCampaign(id){
  rvCampaignId = id; rvShowAdd = false;
  if(rvIsCoViewer()){ rvCoOpen = false; return rvLoadOverview(); }
  return rvLoadSheet();
}
function rvPickStore(name){ rvStore = name; rvShowAdd = false; return rvLoadSheet(); }

/* ─── Рендер ───────────────────────────────────────────── */
function rvCampaignLabel(c){
  return (c.status === 'open' ? '' : '🗄 ') + c.title + ' · ' + (RV_KIND_LABEL[c.kind] || c.kind) + ' · ' +
    fmtDate(c.starts_on).slice(0, 5) + '–' + fmtDate(c.ends_on) + (c.default_pct != null ? ' · ' + rvFmtQty(c.default_pct) + ' %' : '');
}
function rvStatusBadge(){
  var st = 'background:#f1f5f9;color:#475569;';
  var txt = 'Няма бланка';
  if(rvSub){
    if(rvSub.no_items){ txt = 'Нямат за преоценка' + (rvSub.submitted_at ? ' · ' + rvFmtTs(rvSub.submitted_at) : ''); st = 'background:#f5f3ff;color:#6d28d9;'; }
    else if(rvSub.status === 'submitted'){ txt = 'Подадена ' + rvFmtTs(rvSub.submitted_at); st = 'background:#dcfce7;color:#166534;'; }
    else if(rvSub.status === 'processed'){ txt = 'Обработена ' + rvFmtTs(rvSub.processed_at); st = 'background:#dbeafe;color:#1e40af;'; }
    else { txt = 'Чернова'; st = 'background:#fef9c3;color:#854d0e;'; }
  }
  return '<span id="rv-status" style="' + st + 'border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">' + esc(txt) + '</span>';
}
function rvRender(){
  var el = document.getElementById('mod-revaluation');
  if(!el) return;
  var c = rvCampaign();
  var h = '<div class="pg-title">🏷️ Преоценка</div>';

  /* Избор на кампания (+ за ЦО: нова / затвори) */
  h += '<div class="card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
  if(rvCampaigns.length){
    h += '<label style="font-size:12px;color:#64748b;">Кампания</label><select id="rv-campaign" onchange="rvPickCampaign(this.value)" style="min-width:260px;">';
    rvCampaigns.forEach(function(x){
      h += '<option value="' + escAttr(x.id) + '"' + (x.id === rvCampaignId ? ' selected' : '') + '>' + esc(rvCampaignLabel(x)) + '</option>';
    });
    h += '</select>';
  } else {
    h += '<span style="color:#94a3b8;font-size:13px;">Няма кампании.</span>';
  }
  if(rvIsCoViewer()){
    if(rvCoOpen) h += '<button class="btn-sm" onclick="rvCoBack()">← Към списъка на обектите</button>';
    h += '<button class="btn-sm" onclick="rvExportCampaign()">📥 Excel — кампания</button>';
  } else if(!rvIsStoreUser()){
    var opts = rvStoreOptions();
    h += '<label style="font-size:12px;color:#64748b;margin-left:8px;">Обект</label><select id="rv-store" onchange="rvPickStore(this.value)">';
    opts.forEach(function(s){ h += '<option value="' + escAttr(s) + '"' + (s === rvStore ? ' selected' : '') + '>' + esc(s) + '</option>'; });
    h += '</select>';
  }
  if(rvIsCO()){
    h += '<button class="btn-sm" onclick="rvToggleNewCampaign()">＋ Нова кампания</button>';
    if(c && c.status === 'open') h += '<button class="btn-sm" onclick="rvCloseCampaign()">🔒 Затвори кампанията</button>';
  }
  h += '</div>';
  if(c && c.note) h += '<div style="font-size:12px;color:#64748b;margin-top:6px;">📝 ' + esc(c.note) + '</div>';
  if(c && !rvCampaignOpenNow(c)){
    h += '<div style="font-size:12px;color:#b45309;margin-top:6px;">' + (c.status === 'open' ? 'Извън прозореца на кампанията — бланката е само за четене.' : 'Кампанията е затворена — само за четене.') + '</div>';
  }
  if(rvShowNewCampaign && rvIsCO()) h += rvNewCampaignHtml();
  h += '</div>';

  if(c && rvIsCoViewer() && !rvCoOpen){ el.innerHTML = h + rvOverviewHtml(); return; }
  if(!c || !rvStore){ el.innerHTML = h; return; }

  var edit = rvCanEdit();
  var pink = rvShowPink();
  var coEdit = rvCoCanEdit();
  var canSub = rvCanSubmit();
  var pct = rvPct();
  h += '<div class="card">';
  h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">';
  h += '<b>' + esc(rvStore) + '</b>' + (rvStoreNo(rvStore) ? ' <span style="color:#94a3b8;">№ ' + esc(rvStoreNo(rvStore)) + '</span>' : '') + ' ' + rvStatusBadge();
  if(edit){
    h += '<label style="font-size:12px;color:#64748b;margin-left:8px;">% за бланката</label>' +
      '<input id="rv-sub-pct" type="text" inputmode="decimal" value="' + rvVal(pct == null ? '' : rvFmtQty(pct)) + '" onchange="rvSetSubPct(this.value)" style="width:64px;">' +
      '<button class="btn-sm" onclick="rvApplyPctAll()">Приложи % към всички редове</button>';
  } else if(pct != null){
    h += '<span style="font-size:12px;color:#64748b;">% за бланката: ' + esc(rvFmtQty(pct)) + '</span>';
  }
  h += '</div>';
  h += '<div style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px;">' +
    'Не се подават артикули от проверка на срокове или за връщане към доставчик. Кабели/гофри/маркучи/мрежи под 1 л.м. и мушама под 0,5 л.м. са брак, не преоценка.</div>';
  if(rvImportFails.length){
    h += '<div id="rv-import-fails" style="font-size:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:6px 10px;margin-bottom:8px;">⚠ Не са записани: ' + esc(rvImportFails.join(', ')) + '</div>';
  }

  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
  if(edit){
    h += '<button class="btn-sm" onclick="rvToggleAdd()">＋ Ред</button>';
    h += '<button class="btn-sm" onclick="document.getElementById(\'rv-file\').click()">📤 Качи файл от SAP (ZSTOCK)</button>' +
      '<input id="rv-file" type="file" accept=".xlsx,.xls" style="display:none;" onchange="rvImportFile(this)">';
  }
  h += '<button class="btn-sm" onclick="rvExport()">' + (rvIsCoViewer() ? '📥 Excel — този обект' : '📥 Изтегли моята бланка') + '</button>';
  if(!rvIsCoViewer() && rvSub && rvSub.status === 'processed' && rvItems.length) h += '<button class="btn-sm" onclick="rvCopyCodes()">📋 Копирай новите кодове</button>';
  h += rvCoButtonsHtml();
  if(canSub){
    h += '<button class="btn-sm" onclick="rvSubmit()" style="background:#16a34a;color:#fff;">✅ Подай</button>';
    h += '<button class="btn-sm" onclick="rvNoItems()">🚫 Нямаме за преоценка</button>';
  }
  h += '</div>';
  if(edit && rvShowAdd) h += rvAddRowHtml();

  var PINK_TH = 'background:#fce7f3;color:#9d174d;';
  h += '<div class="tbl-wrap tbl-compact"><table><thead><tr><th>Код</th><th>Описание</th><th>Кол.</th><th>МЕ</th><th>Коментар обект</th><th>Ст. цена</th><th>%</th><th>Предложение</th>' +
    (pink ? '<th style="' + PINK_TH + '">Преоценен код</th><th style="' + PINK_TH + '">Цена преоц. код</th><th style="' + PINK_TH + '">Прехвърлено</th><th style="' + PINK_TH + '">Коментар Ели</th>' : '') +
    (edit ? '<th></th>' : '') + '</tr></thead><tbody id="rv-rows">';
  if(!rvItems.length){
    h += '<tr><td colspan="' + (8 + (pink ? 4 : 0) + (edit ? 1 : 0)) + '" style="text-align:center;color:#94a3b8;">' + (rvSub && rvSub.no_items ? 'Обектът няма артикули за преоценка.' : 'Няма редове.') + '</td></tr>';
  }
  rvItems.forEach(function(it){ h += rvRowHtml(it, edit, pink, coEdit); });
  h += '</tbody></table></div></div>';
  el.innerHTML = h;
}
function rvInp(it, field, val, w){
  return '<input type="text" data-id="' + escAttr(it.id) + '" data-f="' + field + '" value="' + rvVal(val) + '" onchange="rvEdit(this.dataset.id,this.dataset.f,this.value)" style="width:' + w + ';">';
}
function rvRowHtml(it, edit, pink, coEdit){
  var bad = rvBad[it.id], err = rvErr[it.id];
  var bg = bad || err ? 'background:#fef2f2;' : '';
  var badge = rvIsRepeat(it.sap_code) ? ' <span class="rv-repeat" style="background:#ede9fe;color:#5b21b6;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;">вече преоценен</span>' : '';
  var h = '<tr id="rv-row-' + escAttr(it.id) + '" style="' + bg + '">';
  h += '<td style="font-family:DM Mono,monospace;">' + esc(it.sap_code) + badge +
    (bad ? '<div class="rv-bad" style="font-size:10px;color:#b91c1c;">' + esc(bad.join(' · ')) + '</div>' : '') +
    (err ? '<div class="rv-err" style="font-size:10px;color:#b91c1c;">⚠ ' + esc(err) + '</div>' : '') + '</td>';
  h += '<td>' + esc(it.product_name) + '</td>';
  /* В екрана на ЦО МЕ се показва както ще излезе в износа (по SAP); ако не
     може да се сведе — жълт маркер. */
  var unitCell = esc(it.unit);
  if(rvIsCoViewer()){
    var su = rvSapUnit(it.unit);
    unitCell = esc(su.unit) + (su.ok ? '' : ' <span class="rv-unit-bad" style="background:#fef9c3;color:#854d0e;border-radius:4px;padding:0 4px;font-size:10px;font-weight:700;">МЕ не е по SAP</span>');
  }
  if(edit){
    h += '<td>' + rvInp(it, 'qty', rvFmtQty(it.qty), '64px') + '</td>';
    h += '<td>' + unitCell + '</td>';
    h += '<td>' + rvInp(it, 'store_comment', it.store_comment || '', '180px') + '</td>';
    h += '<td>' + rvInp(it, 'std_price', rvFmt(it.std_price), '72px') + '</td>';
    h += '<td>' + rvInp(it, 'discount_pct', it.discount_pct == null ? '' : rvFmtQty(it.discount_pct), '52px') + '</td>';
    h += '<td>' + rvInp(it, 'proposed_price', rvFmt(it.proposed_price), '72px') + '</td>';
  } else {
    h += '<td>' + esc(rvFmtQty(it.qty)) + '</td><td>' + unitCell + '</td><td>' + esc(it.store_comment) + '</td>' +
      '<td>' + esc(rvFmt(it.std_price)) + '</td><td>' + esc(it.discount_pct == null ? '' : rvFmtQty(it.discount_pct)) + '</td><td>' + esc(rvFmt(it.proposed_price)) + '</td>';
  }
  if(pink) h += rvPinkCells(it, coEdit);
  if(edit) h += '<td><button class="btn-sm" data-id="' + escAttr(it.id) + '" onclick="rvDeleteRow(this.dataset.id)" title="Изтрий ред">🗑 Изтрий ред</button></td>';
  return h + '</tr>';
}

/* ─── Бланка (submission) ──────────────────────────────── */
/* Бланката се създава при първото действие. Конфликт по (campaign_id,
   store_name) значи, че друг я е създал междувременно — тогава се чете. */
function rvEnsureSub(extra){
  if(rvSub) return Promise.resolve(rvSub);
  var c = rvCampaign();
  var body = { campaign_id: c.id, store_name: rvStore, default_pct: c.default_pct == null ? null : c.default_pct };
  if(extra) Object.keys(extra).forEach(function(k){ body[k] = extra[k]; });
  return sbPostReturn('revaluation_submissions', body).then(function(res){
    if(res && res.ok && res.row){ rvSub = res.row; return rvSub; }
    return sbGet('revaluation_submissions', 'campaign_id=eq.' + c.id + '&store_name=eq.' + encodeURIComponent(rvStore) + '&select=*', true)
      .then(function(rows){
        if(rows && rows[0]){ rvSub = rows[0]; return rvSub; }
        toast('Бланката не е създадена: ' + sbErrMsg(res), '#dc2626');
        return null;
      });
  });
}
function rvSetSubPct(val){
  if(!rvCanEdit()) return Promise.resolve(false);
  var p = String(val).trim() === '' ? null : rvNum(val);
  if(String(val).trim() !== '' && (p == null || p < 0 || p > 100)){ toast('Процентът е от 0 до 100', '#dc2626'); rvRender(); return Promise.resolve(false); }
  return rvEnsureSub().then(function(sub){
    if(!sub) return false;
    return sbPatch('revaluation_submissions', 'id=eq.' + sub.id, { default_pct: p }).then(function(res){
      if(!res.ok){ toast('Процентът не е записан: ' + sbErrMsg(res), '#dc2626'); rvRender(); return false; }
      rvSub.default_pct = p; rvRender(); return true;
    });
  });
}

/* ─── Редакция на ред ──────────────────────────────────── */
function rvItem(id){
  for(var i = 0; i < rvItems.length; i++) if(rvItems[i].id === id) return rvItems[i];
  return null;
}
/* Пресмята промяната за едно поле, без да пише. null = невалидно (toast вече е показан). */
function rvEditPatch(it, field, val){
  var p = {};
  if(field === 'store_comment'){ p.store_comment = String(val || '').trim() || null; return p; }
  var n = String(val).trim() === '' ? null : rvNum(val);
  if(String(val).trim() !== '' && n == null){ toast('Невалидно число', '#dc2626'); return null; }
  if(field === 'qty'){
    if(n == null || n < 0){ toast('Количеството е число ≥ 0', '#dc2626'); return null; }
    p.qty = n; return p;
  }
  if(field === 'std_price'){
    if(n != null && n < 0){ toast('Цената не може да е отрицателна', '#dc2626'); return null; }
    p.std_price = n == null ? null : rvRound2(n);
    if(it.discount_pct != null) p.proposed_price = rvPriceFromPct(p.std_price, Number(it.discount_pct));
    return p;
  }
  if(field === 'discount_pct'){
    if(n != null && (n < 0 || n > 100)){ toast('Процентът е от 0 до 100', '#dc2626'); return null; }
    p.discount_pct = n == null ? null : rvRound2(n);
    if(n != null) p.proposed_price = rvPriceFromPct(it.std_price == null ? null : Number(it.std_price), p.discount_pct);
    return p;
  }
  if(field === 'proposed_price'){
    if(n != null && n < 0){ toast('Цената не може да е отрицателна', '#dc2626'); return null; }
    p.proposed_price = n == null ? null : rvRound2(n);
    if(n != null) p.discount_pct = rvPctFromPrice(it.std_price == null ? null : Number(it.std_price), p.proposed_price);
    return p;
  }
  return null;
}
function rvEdit(id, field, val){
  var it = rvItem(id);
  if(!it || !rvCanEdit()) return Promise.resolve(false);
  var p = rvEditPatch(it, field, val);
  if(!p){ rvRender(); return Promise.resolve(false); }
  p.updated_at = new Date().toISOString();
  return sbPatch('revaluation_items', 'id=eq.' + id, p).then(function(res){
    if(!res.ok){
      rvErr[id] = 'не е записано: ' + sbErrMsg(res);
      toast('Редът не е записан: ' + sbErrMsg(res), '#dc2626');
      rvRender(); return false;
    }
    Object.keys(p).forEach(function(k){ it[k] = p[k]; });
    delete rvErr[id]; delete rvBad[id];
    rvRender(); return true;
  });
}
function rvDeleteRow(id){
  if(!rvCanEdit() || !rvItem(id)) return Promise.resolve(false);
  if(!confirm('Изтриване на реда?')) return Promise.resolve(false);
  return sbDelete('revaluation_items', 'id=eq.' + id).then(function(res){
    if(!res.ok || res.count === 0){
      rvErr[id] = res.ok ? 'не е изтрит (0 реда)' : 'не е изтрит: ' + sbErrMsg(res);
      toast('Редът не е изтрит', '#dc2626'); rvRender(); return false;
    }
    rvItems = rvItems.filter(function(x){ return x.id !== id; });
    delete rvBad[id]; delete rvErr[id];
    rvRender(); return true;
  });
}
function rvApplyPctAll(){
  if(!rvCanEdit()) return Promise.resolve(0);
  var pct = rvPct();
  if(pct == null){ toast('Няма зададен % за бланката', '#dc2626'); return Promise.resolve(0); }
  if(!rvItems.length){ toast('Няма редове', '#dc2626'); return Promise.resolve(0); }
  if(!confirm('Да се запише ' + rvFmtQty(pct) + ' % и новата цена на всички ' + rvItems.length + ' реда? Ръчно въведените цени се презаписват.')) return Promise.resolve(0);
  var fails = 0;
  var chain = Promise.resolve();
  rvItems.forEach(function(it){
    chain = chain.then(function(){
      var p = { discount_pct: pct, proposed_price: rvPriceFromPct(it.std_price == null ? null : Number(it.std_price), pct), updated_at: new Date().toISOString() };
      return sbPatch('revaluation_items', 'id=eq.' + it.id, p).then(function(res){
        if(res.ok){ it.discount_pct = p.discount_pct; it.proposed_price = p.proposed_price; delete rvErr[it.id]; }
        else { fails++; rvErr[it.id] = 'не е записано: ' + sbErrMsg(res); }
      });
    });
  });
  return chain.then(function(){
    if(fails) toast(fails + ' реда не са записани', '#dc2626'); else toast('Процентът е приложен');
    rvRender(); return rvItems.length - fails;
  });
}

/* ─── Ръчен ред + автодопълване ────────────────────────── */
function rvToggleAdd(){ rvShowAdd = !rvShowAdd; rvAcRes = []; rvRender(); }
function rvAddRowHtml(){
  var f = function(id, ph, w, extra){ return '<input id="' + id + '" type="text" placeholder="' + ph + '" style="width:' + w + ';"' + (extra || '') + '>'; };
  return '<div id="rv-add" style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;">' +
    '<div style="position:relative;">' + f('rv-a-code', 'SAP код', '110px', ' oninput="rvAcSchedule(this.value)" autocomplete="off"') +
    '<div id="rv-ac" style="display:none;position:absolute;z-index:20;background:#fff;border:1px solid #cbd5e1;border-radius:6px;min-width:320px;"></div></div>' +
    f('rv-a-name', 'Описание', '220px') + f('rv-a-unit', 'МЕ', '50px') + f('rv-a-qty', 'Кол.', '60px') +
    f('rv-a-std', 'Ст. цена', '72px') + f('rv-a-comment', 'Коментар обект', '180px') +
    '<button class="btn-sm" onclick="rvAddRow()" style="background:#2563eb;color:#fff;">Добави</button></div>';
}
function rvAcSchedule(val){
  if(rvAcTimer) clearTimeout(rvAcTimer);
  var term = String(val == null ? '' : val).replace(/[,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if(term.length < 3){ rvAcRes = []; rvAcRender(); return; }
  rvAcTimer = setTimeout(function(){ rvAcTimer = null; rvAcFetch(term); }, 300);
}
function rvAcFetch(term){
  var seq = ++rvAcSeq;
  var t = encodeURIComponent(term);
  return sbGet('product_catalog',
    'or=(sap_code.ilike.' + t + '*,product_name.ilike.*' + t + '*)' +
    '&select=sap_code,product_name,default_unit&order=sap_code.asc&limit=8'
  ).then(function(rows){
    if(seq !== rvAcSeq) return;
    rvAcRes = Array.isArray(rows) ? rows : [];
    rvAcRender();
  });
}
function rvAcRender(){
  var box = document.getElementById('rv-ac');
  if(!box) return;
  if(!rvAcRes.length){ box.innerHTML = ''; box.style.display = 'none'; return; }
  box.innerHTML = rvAcRes.map(function(p, k){
    return '<div data-k="' + k + '" onmousedown="event.preventDefault()" onclick="rvAcPick(+this.dataset.k)" style="padding:7px 9px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12.5px;">' +
      '<b style="font-family:DM Mono,monospace;">' + esc(p.sap_code) + '</b> · ' + esc(p.product_name) +
      (p.default_unit ? ' <span style="color:#94a3b8;">(' + esc(p.default_unit) + ')</span>' : '') + '</div>';
  }).join('');
  box.style.display = 'block';
}
function rvAcPick(k){
  var p = rvAcRes[k];
  if(!p) return;
  var set = function(id, val){ var el = document.getElementById(id); if(el) el.value = val || ''; };
  set('rv-a-code', p.sap_code); set('rv-a-name', p.product_name); set('rv-a-unit', p.default_unit);
  rvAcRes = []; rvAcRender();
  var q = document.getElementById('rv-a-qty'); if(q) q.focus();
}
function rvNextSort(){
  var m = 0;
  rvItems.forEach(function(x){ if((x.sort_order || 0) > m) m = x.sort_order || 0; });
  return m + 1;
}
function rvItemBody(sub, code, name, unit, qty, std, comment, sort){
  var pct = rvPct();
  return {
    submission_id: sub.id, campaign_id: sub.campaign_id, store_name: sub.store_name, sort_order: sort,
    sap_code: code, product_name: name || null, unit: unit || null, qty: qty, std_price: std,
    store_comment: comment || null, discount_pct: pct, proposed_price: rvPriceFromPct(std, pct),
    created_by: currentUser.display_name || currentUser.email || null
  };
}
function rvAddRow(){
  if(!rvCanEdit()) return Promise.resolve(false);
  if(rvSub && rvSub.no_items){ toast('Бланката е отбелязана „нямаме за преоценка" — първо я отключи ЦО', '#dc2626'); return Promise.resolve(false); }
  var code = v('rv-a-code');
  if(!code){ toast('Въведи SAP код', '#dc2626'); return Promise.resolve(false); }
  if(rvItems.some(function(x){ return String(x.sap_code) === code; })){ toast('Код ' + code + ' вече е в бланката', '#d97706'); return Promise.resolve(false); }
  var qty = v('rv-a-qty') === '' ? 0 : rvNum(v('rv-a-qty'));
  var std = v('rv-a-std') === '' ? null : rvNum(v('rv-a-std'));
  if(qty == null || qty < 0){ toast('Количеството е число ≥ 0', '#dc2626'); return Promise.resolve(false); }
  if(v('rv-a-std') !== '' && (std == null || std < 0)){ toast('Невалидна стандартна цена', '#dc2626'); return Promise.resolve(false); }
  var name = v('rv-a-name'), unit = v('rv-a-unit'), comment = v('rv-a-comment');
  return rvEnsureSub().then(function(sub){
    if(!sub){ rvRender(); return false; }
    return sbPostReturn('revaluation_items', rvItemBody(sub, code, name, unit, qty, std == null ? null : rvRound2(std), comment, rvNextSort())).then(function(res){
      if(!res.ok || !res.row){ toast('Редът не е записан: ' + sbErrMsg(res), '#dc2626'); rvRender(); return false; }
      rvItems.push(res.row);
      rvShowAdd = false;
      toast('Редът е добавен');
      rvRender(); return true;
    });
  });
}

/* ─── Импорт от SAP (ZSTOCK „Стоков анализ") ───────────── */
/* Ред 1 = заглавия, колоните се търсят по ИМЕ. „Завод" (напр. 1514) — последните
   две цифри са номерът на обекта. Код, който вече е в бланката → обновява
   qty/std_price, не дублира. Код извън product_catalog пак влиза — SAP е
   източникът. Един код два пъти във файла (няколко склада) → количествата се
   събират и след импорта се казва колко кода е засегнато (решение на сесията
   от 12.10.2026, не на спецификацията). */
var RV_ZSTOCK_COLS = { code: 'материал', name: 'описание на материал', qty: 'неограничен', unit: 'базова мерна единица', price: 'продажна цена', plant: 'завод' };
function rvWithXlsx(cb){
  if(window.XLSX){ cb(); return; }
  var sc = document.createElement('script');
  sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  sc.onload = cb;
  sc.onerror = function(){ toast('Грешка при зареждане на SheetJS', '#dc2626'); };
  document.head.appendChild(sc);
}
function rvImportFile(input){
  var f = input && input.files && input.files[0];
  if(!f) return;
  input.value = '';
  rvWithXlsx(function(){
    var rd = new FileReader();
    rd.onload = function(e){
      var aoa;
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
      } catch(err){ toast('Файлът не може да се прочете: ' + err.message, '#dc2626'); return; }
      rvImportAoa(aoa);
    };
    rd.readAsArrayBuffer(f);
  });
}
function rvCode(v){ return String(v == null ? '' : v).trim().replace(/\.0+$/, ''); }
function rvPlantNo(v){
  var s = rvCode(v);
  if(!/^\d{2,}$/.test(s)) return null;
  return String(parseInt(s.slice(-2), 10));
}
/* Чете aoa и връща {rows:[…]} или {error:'…'}. Без запис — отделено за теста. */
function rvParseZstock(aoa, storeNo){
  if(!Array.isArray(aoa) || !aoa.length) return { error: 'Файлът е празен' };
  var hdr = (aoa[0] || []).map(function(x){ return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase(); });
  var idx = {};
  Object.keys(RV_ZSTOCK_COLS).forEach(function(k){ idx[k] = hdr.indexOf(RV_ZSTOCK_COLS[k]); });
  var missing = ['code', 'qty', 'price', 'plant'].filter(function(k){ return idx[k] < 0; });
  if(missing.length) return { error: 'Липсва колона: ' + missing.map(function(k){ return '„' + RV_ZSTOCK_COLS[k].charAt(0).toUpperCase() + RV_ZSTOCK_COLS[k].slice(1) + '"'; }).join(', ') };
  var byCode = {}, order = [], dupes = {};
  for(var r = 1; r < aoa.length; r++){
    var row = aoa[r] || [];
    var code = rvCode(row[idx.code]);
    if(!code) continue;
    var plant = rvPlantNo(row[idx.plant]);
    if(storeNo && plant !== storeNo) return { error: 'Файлът е за обект ' + (plant || '?') };
    var qty = rvNum(row[idx.qty]);
    var price = rvNum(row[idx.price]);
    if(!byCode[code]){
      byCode[code] = { code: code, name: idx.name >= 0 ? String(row[idx.name] || '').trim() : '', unit: idx.unit >= 0 ? String(row[idx.unit] || '').trim() : '', qty: 0, std: null };
      order.push(code);
    } else dupes[code] = 1;
    byCode[code].qty += qty || 0;
    if(price != null) byCode[code].std = rvRound2(price);
  }
  return { rows: order.map(function(c){ var x = byCode[c]; x.qty = Math.round(x.qty * 1000) / 1000; return x; }), dupes: Object.keys(dupes).length };
}
function rvImportAoa(aoa){
  if(!rvCanEdit()){ toast('Бланката е само за четене', '#dc2626'); return Promise.resolve({ added: 0, updated: 0, failed: 0 }); }
  if(rvSub && rvSub.no_items){ toast('Бланката е отбелязана „нямаме за преоценка"', '#dc2626'); return Promise.resolve({ added: 0, updated: 0, failed: 0 }); }
  var storeNo = rvStoreNo(rvStore);
  var parsed = rvParseZstock(aoa, storeNo);
  if(parsed.error){ toast(parsed.error + ' — нищо не е импортирано', '#dc2626'); return Promise.resolve({ added: 0, updated: 0, failed: 0, error: parsed.error }); }
  if(!parsed.rows.length){ toast('Във файла няма редове', '#dc2626'); return Promise.resolve({ added: 0, updated: 0, failed: 0 }); }
  var warnNoNo = !storeNo;
  var out = { added: 0, updated: 0, failed: 0, dupes: parsed.dupes };
  /* toast() показва само последното съобщение — затова бележката за събраните
     количества се долепя към обобщението, вместо да е отделен toast. */
  var dupMsg = parsed.dupes ? ' · ' + parsed.dupes + (parsed.dupes === 1 ? ' код се срещаше' : ' кода се срещаха') + ' повече от веднъж — количествата са събрани' : '';
  rvImportFails = [];
  return rvEnsureSub().then(function(sub){
    if(!sub){ rvRender(); return out; }
    var sort = rvNextSort();
    var chain = Promise.resolve();
    parsed.rows.forEach(function(x){
      chain = chain.then(function(){
        var ex = null;
        rvItems.forEach(function(it){ if(String(it.sap_code) === x.code) ex = it; });
        if(ex){
          var p = { qty: x.qty, std_price: x.std, updated_at: new Date().toISOString() };
          if(ex.discount_pct != null) p.proposed_price = rvPriceFromPct(x.std, Number(ex.discount_pct));
          return sbPatch('revaluation_items', 'id=eq.' + ex.id, p).then(function(res){
            if(res.ok){ Object.keys(p).forEach(function(k){ ex[k] = p[k]; }); out.updated++; }
            else { out.failed++; rvImportFails.push(x.code); rvErr[ex.id] = 'импортът не е записан: ' + sbErrMsg(res); }
          });
        }
        return sbPostReturn('revaluation_items', rvItemBody(sub, x.code, x.name, x.unit, x.qty, x.std, null, sort++)).then(function(res){
          if(res.ok && res.row){ rvItems.push(res.row); out.added++; }
          else { out.failed++; rvImportFails.push(x.code); }
        });
      });
    });
    return chain.then(function(){
      if(out.failed) toast(out.failed + ' реда не са записани — виж списъка над таблицата' + dupMsg, '#dc2626');
      else if(warnNoNo) toast('Обектът няма номер — заводът във файла не е проверен. Нови: ' + out.added + ', обновени: ' + out.updated + dupMsg, '#d97706');
      else if(dupMsg) toast('Импорт: нови ' + out.added + ', обновени ' + out.updated + dupMsg, '#d97706');
      else toast('Импорт: нови ' + out.added + ', обновени ' + out.updated);
      rvRender();
      return out;
    });
  });
}

/* ─── Подаване ─────────────────────────────────────────── */
function rvRowProblems(it){
  var p = [];
  if(!(Number(it.qty) > 0)) p.push('количество 0 — оправи наличността в SAP');
  if(!String(it.store_comment || '').trim()) p.push('няма коментар');
  if(!(Number(it.proposed_price) > 0)) p.push('няма цена');
  return p;
}
function rvSubmit(){
  if(!rvCanSubmit()) return Promise.resolve(false);
  if(!rvItems.length){ toast('Няма редове — ако нямате артикули, ползвай „Нямаме за преоценка"', '#dc2626'); return Promise.resolve(false); }
  rvBad = {};
  var n = 0;
  rvItems.forEach(function(it){ var p = rvRowProblems(it); if(p.length){ rvBad[it.id] = p; n++; } });
  if(n){ rvRender(); toast(n + ' ' + (n === 1 ? 'ред не минава' : 'реда не минават') + ' — маркирани са, бланката НЕ е подадена', '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Подаване на ' + rvItems.length + ' реда? След подаване обектът не може да редактира.')) return Promise.resolve(false);
  var patch = { status: 'submitted', no_items: false, submitted_at: new Date().toISOString(), submitted_by: currentUser.display_name || currentUser.email };
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е подадена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    toast('Бланката е подадена');
    rvRender();
    return rvNotify('подадени ' + rvItems.length + ' реда').then(function(){ return true; });
  });
}
function rvNoItems(){
  if(!rvCanSubmit()) return Promise.resolve(false);
  if(rvItems.length){ toast('Бланката има ' + rvItems.length + ' реда — изтрий ги или ги подай', '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Отбелязване „нямаме за преоценка" за ' + rvStore + '?')) return Promise.resolve(false);
  var patch = { status: 'submitted', no_items: true, submitted_at: new Date().toISOString(), submitted_by: currentUser.display_name || currentUser.email };
  var write = rvSub
    ? sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
        if(res.ok) Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
        return res.ok ? true : (toast('Не е записано: ' + sbErrMsg(res), '#dc2626'), false);
      })
    : rvEnsureSub(patch).then(function(sub){ return !!sub; });
  return write.then(function(ok){
    if(!ok){ rvRender(); return false; }
    /* Конфликт при създаването → rvEnsureSub е прочела чужда бланка, без patch-а. */
    if(!rvSub.no_items){ toast('Бланката вече съществува — опитай пак', '#dc2626'); rvRender(); return false; }
    toast('Отбелязано: нямат за преоценка');
    rvRender();
    return rvNotify('нямат за преоценка').then(function(){ return true; });
  });
}

/* ─── Известия ─────────────────────────────────────────── */
/* Получатели: група 'controlling' в notify_groups + регионалните, чиито
   assigned_stores включват обекта. Провалено известие не отменя подаването,
   но се казва с жълт toast. */
function rvRecipients(users, store){
  var out = [], seen = {};
  (users || []).forEach(function(u){
    var groups = typeof notifyGroupsOf === 'function' ? notifyGroupsOf(u) : rvParseList(u.notify_groups);
    var hit = groups.indexOf('controlling') >= 0 || (u.is_regional && rvParseList(u.assigned_stores).indexOf(store) >= 0);
    var key = u.email || u.display_name;
    if(hit && key && !seen[key]){ seen[key] = 1; out.push(u); }
  });
  return out;
}
function rvNotify(what){
  var c = rvCampaign();
  var text = 'Преоценка · ' + rvStore + ' · ' + (c ? c.title : '') + ': ' + what;
  var warn = function(msg){ toast('Подадено, но ' + msg, '#d97706'); return false; };
  return sbGet('users', 'active=eq.true&select=email,display_name,notify_groups,is_regional,assigned_stores', true).then(function(users){
    var rec = rvRecipients(users, rvStore);
    if(!rec.length) return warn('няма получатели на известието');
    var names = rec.map(function(u){ return u.display_name; }).filter(Boolean);
    var emails = rec.map(function(u){ return u.email; }).filter(Boolean);
    var html = '<p>' + esc(text) + '</p><p>Подаде: ' + esc(currentUser.display_name || currentUser.email) + '</p>';
    var jobs = [
      typeof pushToPeople === 'function' ? pushToPeople(names, 'Преоценка', text) : Promise.resolve({ ok: false }),
      typeof sendEmail === 'function' && emails.length ? sendEmail(emails, text, html) : Promise.resolve({ ok: false })
    ];
    return Promise.all(jobs).then(function(r){
      var bad = [];
      if(!r[0] || !r[0].ok) bad.push('push');
      if(!r[1] || !r[1].ok) bad.push('имейл');
      if(bad.length) return warn('известието не тръгна (' + bad.join(', ') + ')');
      return true;
    });
  }).catch(function(e){ return warn('известието не тръгна (' + ((e && e.message) || e) + ')'); });
}

/* ─── Износ: „Изтегли моята бланка" ───────────────────── */
/* 13-те колони. От етап 3а: МЕ — по SAP (rvSapUnit), количествата — до 3
   знака, „Тотал преоценка" = ПРЕХВЪРЛЕНОТО (co_qty; ако го няма — qty) ×
   цената на преоценения код (решение на сесията 15.10.2026: прехвърленото
   е количеството, което реално става с нова цена). */
function rvItemExportRow(store, it){
  var no = rvStoreNo(store);
  var shop = no ? Number(no) : store;
  var qty = rvRound3(it.qty == null ? 0 : Number(it.qty));
  var moved = it.co_qty == null ? qty : rvRound3(Number(it.co_qty));
  var std = it.std_price == null ? null : Number(it.std_price);
  var sale = it.sale_price == null ? null : Number(it.sale_price);
  return [shop, it.sap_code, it.product_name || '', qty, rvSapUnit(it.unit).unit, it.store_comment || '',
    std == null ? '' : std, it.proposed_price == null ? '' : Number(it.proposed_price),
    it.new_sap_code || '', sale == null ? '' : sale, it.co_comment || '',
    std == null ? '' : rvRound2(qty * std), sale == null ? '' : rvRound2(moved * sale)];
}
function rvExportAoa(store, items){
  store = store || rvStore;
  return [RV_EXPORT_HEADERS.slice()].concat((items || rvItems).map(function(it){ return rvItemExportRow(store, it); }));
}
function rvExport(){
  if(!rvItems.length){ toast('Няма редове за износ', '#dc2626'); return; }
  rvWithXlsx(function(){
    var c = rvCampaign();
    var no = rvStoreNo(rvStore);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rvExportAoa()), String(no || rvStore).slice(0, 31));
    XLSX.writeFile(wb, 'preocenka-' + (no || 'obekt') + '-' + ((c && c.starts_on) || today()) + '.xlsx');
  });
}

/* ─── Кампания (admin / accounting) ────────────────────── */
function rvToggleNewCampaign(){ rvShowNewCampaign = !rvShowNewCampaign; rvRender(); }
function rvNewCampaignHtml(){
  return '<div id="rv-new-campaign" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;">' +
    '<input id="rv-c-title" type="text" placeholder="Заглавие" style="width:200px;">' +
    '<select id="rv-c-kind"><option value="mandatory">Задължителна</option><option value="optional">Пожелателна</option></select>' +
    '<label style="font-size:12px;">от</label><input id="rv-c-from" type="date" value="' + today() + '">' +
    '<label style="font-size:12px;">до</label><input id="rv-c-to" type="date">' +
    '<input id="rv-c-pct" type="text" inputmode="decimal" placeholder="% (по желание)" style="width:110px;">' +
    '<input id="rv-c-note" type="text" placeholder="Бележка" style="width:220px;">' +
    '<button class="btn-sm" onclick="rvSaveCampaign()" style="background:#2563eb;color:#fff;">Запази</button>' +
    '<button class="btn-sm" onclick="rvToggleNewCampaign()">Откажи</button></div>';
}
function rvSaveCampaign(){
  if(!rvIsCO()) return Promise.resolve(false);
  var title = v('rv-c-title'), from = v('rv-c-from'), to = v('rv-c-to'), pctS = v('rv-c-pct');
  if(!title){ toast('Въведи заглавие', '#dc2626'); return Promise.resolve(false); }
  if(!from || !to){ toast('Въведи прозорец от–до', '#dc2626'); return Promise.resolve(false); }
  if(to < from){ toast('„До" е преди „от"', '#dc2626'); return Promise.resolve(false); }
  var pct = pctS === '' ? null : rvNum(pctS);
  if(pctS !== '' && (pct == null || pct < 0 || pct > 100)){ toast('Процентът е от 0 до 100', '#dc2626'); return Promise.resolve(false); }
  var body = { title: title, kind: v('rv-c-kind') || 'mandatory', starts_on: from, ends_on: to,
    default_pct: pct, note: v('rv-c-note') || null, status: 'open', created_by: currentUser.display_name || currentUser.email };
  return sbPostReturn('revaluation_campaigns', body).then(function(res){
    if(!res.ok || !res.row){ toast('Кампанията не е създадена: ' + sbErrMsg(res), '#dc2626'); return false; }
    rvCampaigns = rvSortCampaigns(rvCampaigns.concat([res.row]));
    rvCampaignId = res.row.id;
    rvShowNewCampaign = false;
    toast('Кампанията е отворена');
    return rvLoadSheet().then(function(){ return true; });
  });
}
function rvCloseCampaign(){
  var c = rvCampaign();
  if(!rvIsCO() || !c || c.status !== 'open') return Promise.resolve(false);
  if(!confirm('Затваряне на кампания „' + c.title + '"? Обектите няма да могат да подават.')) return Promise.resolve(false);
  var patch = { status: 'closed', closed_at: new Date().toISOString(), closed_by: currentUser.display_name || currentUser.email };
  return sbPatch('revaluation_campaigns', 'id=eq.' + c.id, patch).then(function(res){
    if(!res.ok){ toast('Кампанията не е затворена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ c[k] = patch[k]; });
    rvCampaigns = rvSortCampaigns(rvCampaigns);
    toast('Кампанията е затворена');
    rvRender(); return true;
  });
}

/* ═══ ЕТАП 3а: обработка от Контролинг (15.10.2026) ═════════════════════════
   admin / accounting обработват обект по обект; supply само чете.
   Розовите колони на реда: new_sap_code (Преоценен код), sale_price (Цена
   преоц. код), co_qty (Прехвърлено), co_comment (Коментар Ели).
   Предложения по подразбиране (показват се, НЕ се записват, докато ЦО не
   пипне реда или не натисне „Приеми предложените за всички"):
   - код = „8" + sap_code, допълнен с нули до 6 цифри (14557 → 8014557,
     103125 → 8103125); вече /^8\d{6}$/ (повторна преоценка) → същият код;
   - цена = proposed_price на обекта; прехвърлено = qty.
   „Готово за обект" → status 'processed' + известие САМО до този обект
   (push + имейл с прикачена 13-колонна бланка, копие до
   app_settings.revaluation_done_cc). „Отключи бланката" → обратно 'draft'. */

var rvCoOpen = false;     /* ЦО: false = списъкът на обектите, true = бланката на rvStore */
var rvCoRows = [];        /* [{store, sub, n}] за списъка */
var rvCoSeq = 0;
/* МЕ по SAP: главни, без точка. Само тези се свеждат; друго остава както е и
   редът се маркира в екрана на ЦО. Стойности, които вече са главни без точка
   (БР, M2, КАШ от ZSTOCK), се приемат за SAP. Каталогът към 15.10.2026: бр.,
   кв.м, л.м, пакет, чифт, ккт, бли, кг, кут, кашон, топ, рол, тон, m3 + боклук.
   кашон → КАШ (видяно в ZSTOCK, решение на Тенчо 15.10.2026); пакет, чифт,
   бли, кут, топ, рол, тон, m3 нарочно НЕ са в картата — светят жълто. */
var RV_SAP_UNITS = { 'бр.': 'БР', 'бр': 'БР', 'к-кт': 'ККТ', 'ккт': 'ККТ', 'м2': 'M2', 'кв.м': 'M2', 'кв.м.': 'M2',
  'м': 'M', 'л.м': 'M', 'л.м.': 'M', 'л': 'L', 'кг': 'KG', 'кашон': 'КАШ' };

function rvIsCoViewer(){ return rvIsCO() || (!!currentUser && currentUser.role === 'supply'); }
function rvRound3(x){
  if(x == null || !isFinite(x)) return null;
  var s = x < 0 ? -1 : 1;
  return s * Math.round(Math.abs(x) * 1000 + 1e-7) / 1000;
}
function rvSapUnit(u){
  var t = String(u == null ? '' : u).trim();
  var k = t.toLowerCase();
  if(Object.prototype.hasOwnProperty.call(RV_SAP_UNITS, k)) return { unit: RV_SAP_UNITS[k], ok: true };
  if(t && /^[A-ZА-Я0-9]+$/.test(t)) return { unit: t, ok: true };
  return { unit: t, ok: false };
}
function rvCoProposeCode(sap){
  var s = String(sap == null ? '' : sap).trim();
  if(/^8\d{6}$/.test(s)) return s;
  if(/^\d{1,6}$/.test(s)) return '8' + ('000000' + s).slice(-6);
  return null;
}
/* Предложенията само за ПРАЗНИТЕ розови полета; {} = няма какво да се предложи. */
function rvCoProposal(it){
  var p = {};
  if(it.new_sap_code == null || it.new_sap_code === ''){ var c = rvCoProposeCode(it.sap_code); if(c) p.new_sap_code = c; }
  if(it.sale_price == null && it.proposed_price != null) p.sale_price = rvRound2(Number(it.proposed_price));
  if(it.co_qty == null && it.qty != null) p.co_qty = rvRound3(Number(it.qty));
  return p;
}
function rvShowPink(){
  if(rvIsCoViewer()) return !!rvSub && !rvSub.no_items;
  return !!rvSub && rvSub.status === 'processed';
}
function rvCoCanEdit(){ return rvIsCO() && !!rvSub && rvSub.status === 'submitted' && !rvSub.no_items; }

/* ─── Списък на обектите ───────────────────────────────── */
function rvLoadOverview(){
  var c = rvCampaign();
  var seq = ++rvCoSeq;
  if(!c){ rvCoRows = []; rvRender(); return Promise.resolve(); }
  return Promise.all([
    sbGetOk('revaluation_submissions', 'campaign_id=eq.' + c.id + '&select=*'),
    sbGetAll('revaluation_items', 'campaign_id=eq.' + c.id + '&select=id,submission_id&order=id.asc')
  ]).then(function(r){
    if(seq !== rvCoSeq) return;
    if(!r[0].ok){ toast('Бланките не се заредиха: ' + r[0].error, '#dc2626'); }
    if(r[1].partial) toast('Броят редове е непълен — заявката падна', '#dc2626');
    var subs = r[0].ok ? r[0].rows : [];
    var cnt = {};
    r[1].forEach(function(x){ cnt[x.submission_id] = (cnt[x.submission_id] || 0) + 1; });
    var bySt = {};
    subs.forEach(function(s){ bySt[s.store_name] = s; });
    var names = rvStoreList.filter(function(n){ return typeof isReportableStore !== 'function' || isReportableStore(n); });
    subs.forEach(function(s){ if(names.indexOf(s.store_name) < 0) names.push(s.store_name); });
    names.sort(function(a, b){ return a.localeCompare(b, 'bg'); });
    rvCoRows = names.map(function(n){ var s = bySt[n] || null; return { store: n, sub: s, n: s ? (cnt[s.id] || 0) : 0 }; });
    rvRender();
  });
}
function rvCoStatus(sub){
  if(!sub) return { txt: 'не е подала', key: 'none' };
  if(sub.no_items) return { txt: 'нямат' + (sub.submitted_at ? ' · ' + fmtDate(String(sub.submitted_at).slice(0, 10)).slice(0, 5) : ''), key: 'no' };
  if(sub.status === 'processed') return { txt: 'обработена ' + fmtDate(String(sub.processed_at || '').slice(0, 10)).slice(0, 5), key: 'processed' };
  if(sub.status === 'submitted') return { txt: 'подадена ' + fmtDate(String(sub.submitted_at || '').slice(0, 10)).slice(0, 5), key: 'submitted' };
  return { txt: 'чернова', key: 'draft' };
}
function rvOverviewHtml(){
  var COL = { none: '#94a3b8', no: '#6d28d9', processed: '#1e40af', submitted: '#166534', draft: '#854d0e' };
  var tally = { none: 0, no: 0, processed: 0, submitted: 0, draft: 0 };
  var rows = rvCoRows.map(function(r){
    var st = rvCoStatus(r.sub);
    tally[st.key]++;
    return '<tr id="rv-co-' + escAttr(r.store) + '"><td><b>' + esc(r.store) + '</b>' + (rvStoreNo(r.store) ? ' <span style="color:#94a3b8;">№ ' + esc(rvStoreNo(r.store)) + '</span>' : '') + '</td>' +
      '<td style="color:' + COL[st.key] + ';font-weight:600;">' + esc(st.txt) + '</td><td>' + (r.sub && !r.sub.no_items ? r.n : '') + '</td>' +
      '<td>' + (r.sub ? '<button class="btn-sm" data-s="' + escAttr(r.store) + '" onclick="rvCoOpenStore(this.dataset.s)">Отвори</button>' : '') + '</td></tr>';
  }).join('');
  return '<div class="card"><div id="rv-co-tally" style="font-size:12px;color:#475569;margin-bottom:8px;">подадени ' + tally.submitted +
    ' · обработени ' + tally.processed + ' · нямат ' + tally.no + ' · чернова ' + tally.draft + ' · не са подали ' + tally.none + '</div>' +
    '<div class="tbl-wrap tbl-compact"><table><thead><tr><th>Обект</th><th>Статус</th><th>Редове</th><th></th></tr></thead><tbody id="rv-co-rows">' +
    (rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Няма обекти.</td></tr>') + '</tbody></table></div></div>';
}
function rvCoOpenStore(name){ rvCoOpen = true; rvStore = name; rvShowAdd = false; return rvLoadSheet(); }
function rvCoBack(){ rvCoOpen = false; rvBad = {}; rvErr = {}; return rvLoadOverview(); }

/* ─── Розовите колони ──────────────────────────────────── */
function rvPinkCells(it, coEdit){
  var prop = rvCoEditableProposal(it, coEdit);
  var val = function(f){ return it[f] != null && it[f] !== '' ? it[f] : (prop[f] != null ? prop[f] : null); };
  var isProp = function(f){ return (it[f] == null || it[f] === '') && prop[f] != null; };
  var fmt = { new_sap_code: function(x){ return x == null ? '' : String(x); }, sale_price: rvFmt, co_qty: function(x){ return x == null ? '' : rvFmtQty(x); }, co_comment: function(x){ return x || ''; } };
  var PINK = 'background:#fdf2f8;';
  return ['new_sap_code', 'sale_price', 'co_qty', 'co_comment'].map(function(f){
    var v = fmt[f](val(f));
    if(!coEdit) return '<td style="' + PINK + (f === 'new_sap_code' ? 'font-family:DM Mono,monospace;' : '') + '">' + esc(v) + '</td>';
    var w = f === 'co_comment' ? '160px' : (f === 'new_sap_code' ? '84px' : '68px');
    return '<td style="' + PINK + '"><input type="text" class="' + (isProp(f) ? 'rv-prop' : '') + '" data-id="' + escAttr(it.id) + '" data-f="' + f + '" value="' + rvVal(v) + '"' +
      (isProp(f) ? ' title="предложено — записва се, когато пипнеш реда" style="width:' + w + ';font-style:italic;color:#9d174d;border:1px dashed #f9a8d4;"' : ' style="width:' + w + ';"') +
      ' onchange="rvCoEdit(this.dataset.id,this.dataset.f,this.value)"></td>';
  }).join('');
}
function rvCoEditableProposal(it, coEdit){ return coEdit ? rvCoProposal(it) : {}; }
/* Пипането на едно розово поле записва и предложенията за празните останали
   на същия ред — „Елица пипна реда". */
function rvCoEdit(id, field, val){
  var it = rvItem(id);
  if(!it || !rvCoCanEdit()) return Promise.resolve(false);
  var p = rvCoProposal(it);
  var t = String(val == null ? '' : val).trim();
  if(field === 'new_sap_code' || field === 'co_comment'){ p[field] = t || null; }
  else {
    var n = t === '' ? null : rvNum(t);
    if(t !== '' && (n == null || n < 0)){ toast('Невалидно число', '#dc2626'); rvRender(); return Promise.resolve(false); }
    p[field] = n == null ? null : (field === 'co_qty' ? rvRound3(n) : rvRound2(n));
  }
  return rvCoPatchItem(it, p).then(function(ok){ rvRender(); return ok; });
}
function rvCoPatchItem(it, p){
  p.co_by = currentUser.display_name || currentUser.email;
  p.co_at = new Date().toISOString();
  return sbPatch('revaluation_items', 'id=eq.' + it.id, p).then(function(res){
    if(!res.ok){ rvErr[it.id] = 'не е записано: ' + sbErrMsg(res); toast('Редът не е записан: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(p).forEach(function(k){ it[k] = p[k]; });
    delete rvErr[it.id]; delete rvBad[it.id];
    return true;
  });
}
function rvCoAcceptAll(){
  if(!rvCoCanEdit()) return Promise.resolve(0);
  var todo = rvItems.filter(function(it){ return Object.keys(rvCoProposal(it)).length > 0; });
  if(!todo.length){ toast('Няма незаписани предложения'); return Promise.resolve(0); }
  if(!confirm('Да се запишат предложените стойности на ' + todo.length + ' реда?')) return Promise.resolve(0);
  var okN = 0, chain = Promise.resolve();
  todo.forEach(function(it){ chain = chain.then(function(){ return rvCoPatchItem(it, rvCoProposal(it)).then(function(ok){ if(ok) okN++; }); }); });
  return chain.then(function(){
    if(okN < todo.length) toast((todo.length - okN) + ' реда не са записани', '#dc2626'); else toast('Записани: ' + okN + ' реда');
    rvRender(); return okN;
  });
}

/* ─── Бутоните на ЦО ───────────────────────────────────── */
function rvCoButtonsHtml(){
  if(!rvIsCO() || !rvSub) return '';
  var h = '';
  if(rvCoCanEdit() && rvItems.some(function(it){ return Object.keys(rvCoProposal(it)).length > 0; })){
    h += '<button class="btn-sm" onclick="rvCoAcceptAll()">✔ Приеми предложените за всички</button>';
  }
  if(rvSub.status === 'submitted') h += '<button class="btn-sm" onclick="rvCoDone()" style="background:#16a34a;color:#fff;">✅ Готово за обект</button>';
  if(rvSub.status === 'submitted' || rvSub.status === 'processed') h += '<button class="btn-sm" onclick="rvCoUnlock()">🔓 Отключи бланката</button>';
  return h;
}
function rvCoDone(){
  if(!rvIsCO() || !rvSub || rvSub.status !== 'submitted') return Promise.resolve(false);
  rvBad = {};
  var n = 0;
  if(!rvSub.no_items){
    rvItems.forEach(function(it){
      var p = [];
      if(!String(it.new_sap_code || '').trim()) p.push('няма преоценен код');
      if(!(Number(it.sale_price) > 0)) p.push('няма цена на преоценения код');
      if(p.length){ rvBad[it.id] = p; n++; }
    });
  }
  if(n){
    rvRender();
    toast(n + (n === 1 ? ' ред е' : ' реда са') + ' без записан код/цена — „Приеми предложените“ или попълни. Нищо не е обработено.', '#dc2626');
    return Promise.resolve(false);
  }
  if(!confirm('Готово за ' + rvStore + '? Обектът ще получи известие и бланката се заключва.')) return Promise.resolve(false);
  var patch = { status: 'processed', processed_at: new Date().toISOString(), processed_by: currentUser.display_name || currentUser.email };
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е обработена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    toast('Обработена: ' + rvStore);
    rvRender();
    return rvCoNotifyDone(rvStore, rvSub, rvItems.slice()).then(function(){ return true; });
  });
}
function rvCoUnlock(){
  if(!rvIsCO() || !rvSub || (rvSub.status !== 'submitted' && rvSub.status !== 'processed')) return Promise.resolve(false);
  if(!confirm('Отключване на бланката на ' + rvStore + '? Обектът пак ще може да редактира и да подаде наново.')) return Promise.resolve(false);
  var patch = { status: 'draft', reopened_at: new Date().toISOString(), reopened_by: currentUser.display_name || currentUser.email, processed_at: null, processed_by: null };
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е отключена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    toast('Бланката е отключена');
    rvRender(); return true;
  });
}

/* ─── Известие „обработена" ────────────────────────────── */
/* base64 на 13-колонния xlsx или null (SheetJS не се зареди / гръмна). */
function rvXlsxBase64(store, items){
  return new Promise(function(resolve){
    var done = false;
    var fin = function(v){ if(!done){ done = true; resolve(v); } };
    var build = function(){
      try {
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rvExportAoa(store, items)), String(rvStoreNo(store) || store).slice(0, 31));
        fin(XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }));
      } catch(e){ fin(null); }
    };
    if(window.XLSX){ build(); return; }
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    sc.onload = build;
    sc.onerror = function(){ fin(null); };
    document.head.appendChild(sc);
  });
}
function rvCoNotifyDone(store, sub, items){
  var c = rvCampaign();
  var text = 'Преоценка · ' + store + ' · ' + (c ? c.title : '') + ': обработена';
  var warns = [];
  return Promise.all([
    sbGetOk('users', 'active=eq.true&store_name=eq.' + encodeURIComponent(store) + '&select=display_name,email'),
    sbGetOk('app_settings', 'key=eq.revaluation_done_cc&select=key,value'),
    sub.no_items || !items.length ? Promise.resolve(null) : rvXlsxBase64(store, items)
  ]).then(function(r){
    var users = r[0].ok ? r[0].rows : [];
    if(!r[0].ok) warns.push('получателите не се прочетоха');
    var ccRow = r[1].ok ? r[1].rows.filter(function(x){ return x && x.key === 'revaluation_done_cc'; })[0] : null;
    var cc = ccRow && ccRow.value ? String(ccRow.value).split(/[,;\s]+/).filter(Boolean) : [];
    if(!cc.length) warns.push('без копие (няма revaluation_done_cc)');
    var names = users.map(function(u){ return u.display_name; }).filter(Boolean);
    var emails = users.map(function(u){ return u.email; }).filter(Boolean);
    var html = '<p>' + esc(text) + '</p>';
    if(sub.no_items) html += '<p>Обектът е отбелязал, че няма артикули за преоценка.</p>';
    else {
      html += '<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px;"><tr><th>Код</th><th>Описание</th><th>Прехвърлено</th><th>Преоценен код</th><th>Цена</th></tr>' +
        items.map(function(it){
          return '<tr><td>' + esc(it.sap_code) + '</td><td>' + esc(it.product_name) + '</td><td>' + esc(rvFmtQty(it.co_qty == null ? it.qty : it.co_qty)) + '</td><td>' + esc(it.new_sap_code) + '</td><td>' + esc(rvFmt(it.sale_price)) + '</td></tr>';
        }).join('') + '</table>';
      if(r[2]) html += '<p>Бланката е прикачена (13 колони).</p>';
      else { html += '<p>Файлът е в портала: Ревизии и преоценка → Преоценка.</p>'; warns.push('без прикачен файл'); }
    }
    html += '<p>Обработи: ' + esc(currentUser.display_name || currentUser.email) + '</p>';
    var extra = {};
    if(cc.length) extra.cc = cc;
    if(r[2]) extra.attachments = [{ filename: 'preocenka-' + (rvStoreNo(store) || 'obekt') + '-' + ((c && c.starts_on) || today()) + '.xlsx', content: r[2] }];
    var jobs = [
      names.length && typeof pushToPeople === 'function' ? pushToPeople(names, 'Преоценка', text) : Promise.resolve({ ok: false, none: true }),
      emails.length && typeof sendEmail === 'function' ? sendEmail(emails, text, html, extra) : Promise.resolve({ ok: false, none: true })
    ];
    return Promise.all(jobs).then(function(res){
      if(!res[0] || !res[0].ok) warns.push(res[0] && res[0].none ? 'няма получатели за push' : 'push не тръгна');
      if(!res[1] || !res[1].ok) warns.push(res[1] && res[1].none ? 'обектът няма имейли' : 'имейлът не тръгна');
    });
  }).catch(function(e){ warns.push('грешка: ' + ((e && e.message) || e)); })
    .then(function(){
      if(warns.length) toast('Обработено, но: ' + warns.join('; '), '#d97706');
      return !warns.length;
    });
}

/* ─── Пътят на обекта при обработена бланка ─────────────── */
function rvCopyCodes(){
  var codes = rvItems.map(function(it){ return String(it.new_sap_code || '').trim(); }).filter(Boolean);
  if(!codes.length){ toast('Няма нови кодове', '#dc2626'); return Promise.resolve(false); }
  var txt = codes.join('\n');
  if(!navigator.clipboard || !navigator.clipboard.writeText){ toast('Браузърът не позволява копиране — кодовете са в „Изтегли моята бланка“', '#dc2626'); return Promise.resolve(false); }
  return navigator.clipboard.writeText(txt).then(function(){ toast('Копирани ' + codes.length + ' кода'); return true; },
    function(){ toast('Копирането не е позволено — кодовете са в „Изтегли моята бланка“', '#dc2626'); return false; });
}

/* ─── Excel — кампания (лист на обект + „Общо") ────────── */
function rvExportCampaign(){
  var c = rvCampaign();
  if(!c){ toast('Няма кампания', '#dc2626'); return Promise.resolve(false); }
  return Promise.all([
    sbGetOk('revaluation_submissions', 'campaign_id=eq.' + c.id + '&select=*'),
    sbGetAll('revaluation_items', 'campaign_id=eq.' + c.id + '&select=*&order=store_name.asc,sort_order.asc,id.asc')
  ]).then(function(r){
    if(!r[0].ok || r[1].partial){ toast('Данните за износа са непълни — Excel НЕ е направен', '#dc2626'); return false; }
    var subs = {};
    r[0].rows.forEach(function(s){ if(!s.no_items && (s.status === 'submitted' || s.status === 'processed')) subs[s.id] = s; });
    var byStore = {}, order = [];
    r[1].forEach(function(it){
      if(!subs[it.submission_id]) return;
      if(!byStore[it.store_name]){ byStore[it.store_name] = []; order.push(it.store_name); }
      byStore[it.store_name].push(it);
    });
    if(!order.length){ toast('Няма подадени бланки с редове', '#dc2626'); return false; }
    return new Promise(function(resolve){
      rvWithXlsx(function(){
        var wb = XLSX.utils.book_new();
        var used = {};
        var total = [RV_EXPORT_HEADERS.concat(['Прехвърлено', 'TOTAL'])];
        var sum = 0;
        order.forEach(function(st){
          var nm = String(rvStoreNo(st) || st).slice(0, 31);
          while(used[nm]) nm = (nm + '_').slice(0, 31);
          used[nm] = 1;
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rvExportAoa(st, byStore[st])), nm);
          byStore[st].forEach(function(it){
            var moved = it.co_qty == null ? null : rvRound3(Number(it.co_qty));
            var sale = it.sale_price == null ? null : Number(it.sale_price);
            var t = moved == null || sale == null ? '' : rvRound2(moved * sale);
            if(t !== '') sum += t;
            total.push(rvItemExportRow(st, it).concat([moved == null ? '' : moved, t]));
          });
        });
        var last = new Array(RV_EXPORT_HEADERS.length + 2).fill('');
        last[0] = 'ОБЩО'; last[last.length - 1] = rvRound2(sum);
        total.push(last);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(total), 'Общо');
        XLSX.writeFile(wb, 'preocenka-kampania-' + (c.starts_on || today()) + '.xlsx');
        resolve(true);
      });
    });
  });
}
