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
   · supply — само чете до 16.11.2026; оттогава няма достъп (rvCanSee).
   От 13.11.2026 подадената бланка минава през одобрение от регионалния на
   обекта (draft → submitted = чака регионалния → approved → processed;
   обект без регионален: draft → approved). Виж rvSubmitRoute / rvRegApprove /
   rvRegReturn и rvCoReady.
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
var rvAcRes = [];
var rvAcSeq = 0;
var rvAcTimer = null;
/* app_settings.revaluation_stores — скрит фийчър (HIDDEN-FEATURES.md).
   'on' пуска всички обекти (и правото на регионалния да пише в бланките им);
   от 25.10.2026 може и списък имена, разделени със запетая (пилот:
   'Кърджали') — пуска само тях. Липсващ ключ, празно, 'off' и паднала
   заявка = изключено. Чете се при всеки логин от setupTabsForRole(); докато
   отговорът не е дошъл, е изключено — табът на обекта е скрит, тоест не
   мига. rvStoresReady — обещанието на последното четене (Бюлетинът и
   loadRevaluation() го чакат), rvStoresDone — дошъл ли е отговорът. */
var rvStoresOn = false;   /* 'on' — всички обекти */
var rvStoresList = [];    /* списъкът, когато не е 'on' */
var rvStoresSeq = 0;
var rvStoresReady = null;
var rvStoresDone = false;

var RV_STORE_ROLES = ['manager', 'sklad'];
var RV_KIND_LABEL = { mandatory: 'Задължителна', optional: 'Пожелателна' };
var RV_EXPORT_HEADERS = ['Магазин', 'Код', 'Описание на материал', 'Количество', 'Прехвърлено', 'Мерна единица',
  'Коментар Обект', 'Стандартна прод. цена', 'Предложение за цена', 'Преоценен код',
  'Цена преоценен код', 'Коментар Ели', 'Тотал ст.пр.цена', 'Тотал преоценка'];

/* ─── Роли ─────────────────────────────────────────────── */
function rvIsStoreUser(){ return !!currentUser && RV_STORE_ROLES.indexOf(currentUser.role) >= 0; }
function rvIsCO(){ return !!currentUser && ['admin', 'accounting', 'controlling'].indexOf(currentUser.role) >= 0; }
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
/* Регионален accounting (18.10.2026): вижда и обработва САМО зачислените си
   обекти; кампанийните бутони (Excel — кампания, MM41, „Кодовете са създадени",
   График на кампаниите, Затвори) не са за него. admin с is_regional (В. Филев)
   НЕ попада тук — admin е admin. */
function rvRegionalAcc(){ return !!currentUser && currentUser.role === 'accounting' && rvRegionStores().length > 0; }
/* Видимост на таба: admin, accounting, controlling — винаги; обекти — само ако
   обектът е включен в revaluation_stores ('on' или в списъка; скрито от
   13.10.2026 до етап 3, пилот по обект от 25.10.2026). Регионалните днес
   са admin/accounting (проверено 12.10.2026) и виждат таба като ЦО; правото им
   да ПИШАТ в бланката на обект е зад същия ключ, по обекта на бланката
   (rvCanEdit). supply (Снабдяване) — вън от 16.11.2026 (решение на Тенчо):
   в „Ревизии и преоценка“ вижда само „🎨 Зареждане“. */
function rvCanSee(){
  if(!currentUser) return false;
  if(['admin', 'accounting', 'controlling'].indexOf(currentUser.role) >= 0) return true;
  return rvIsStoreUser() && rvStoreOn(currentUser.store_name);
}
function rvStoreOn(store){ return rvStoresOn === true || (!!store && rvStoresList.indexOf(store) >= 0); }
/* 'on' → всички; '' / 'off' / null → никой; иначе — списък имена. */
function rvParseStoresFlag(v){
  var s = v == null ? '' : String(v).trim();
  if(s.toLowerCase() === 'on') return { on: true, list: [] };
  if(!s || s.toLowerCase() === 'off') return { on: false, list: [] };
  return { on: false, list: s.split(',').map(function(x){ return x.trim(); }).filter(Boolean) };
}
function rvLoadStoresFlag(){
  var seq = ++rvStoresSeq;
  rvStoresDone = false;
  rvStoresReady = sbGet('app_settings', 'key=eq.revaluation_stores&select=key,value', true).then(function(rows){
    var row = (Array.isArray(rows) ? rows : []).filter(function(r){ return r && r.key === 'revaluation_stores'; })[0];
    var f = rvParseStoresFlag(row && row.value);
    if(seq === rvStoresSeq){ rvStoresOn = f.on; rvStoresList = f.list; rvStoresDone = true; }
    return rvStoresOn;
  }).catch(function(){
    if(seq === rvStoresSeq){ rvStoresOn = false; rvStoresList = []; rvStoresDone = true; }
    return false;
  });
  return rvStoresReady;
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
  if(!c || !rvStore || !rvCampaignOpenNow(c) || !rvStoreOn(rvStore)) return false;
  /* Обработена бланка (етап 3а) е заключена за всички — промяна само след
     „Отключи бланката“ от ЦО. Одобрената от регионалния (13.11.2026) — също:
     тя е при Контролинг. */
  if(rvSub && (rvSub.status === 'processed' || rvSub.status === 'approved')) return false;
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
  if(reg.length && (rvRegionalAcc() || !rvIsCO())) return reg;
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
    /* is_regional / assigned_stores — от currentUser, ако rolesLoadRegional
       (shared.js) вече ги е донесъл; иначе собствена заявка, както досега. */
    currentUser.is_regional !== undefined
      ? Promise.resolve([{ is_regional: currentUser.is_regional, assigned_stores: currentUser.assigned_stores }])
      : sbGet('users', 'email=eq.' + encodeURIComponent(currentUser.email || '') + '&select=is_regional,assigned_stores'),
    sbGet('stores', 'select=name&order=name.asc'),
    rvIsCoViewer() ? rvLoadCodes() : Promise.resolve([]),
    rvIsStoreUser() ? sbGet('revaluation_submissions', 'store_name=eq.' + encodeURIComponent(currentUser.store_name || '') + '&status=in.(submitted,approved,processed)&select=campaign_id') : Promise.resolve([]),
    /* Кои обекти са включени — rvCanEdit / rvCoCanUnlock / списъкът го ползват. */
    rvStoresReady || Promise.resolve(),
    /* Одобряващите от списъка — за бутоните „Одобри" / „Върни"; паднало четене = празен списък. */
    sbGet('app_settings', 'key=eq.' + RV_APPROVERS_KEY + '&select=key,value', true).catch(function(){ return []; })
  ]).then(function(r){
    rvApprovers = rvApproversRow(r[6]);
    rvMyCampaignIds = {};
    (Array.isArray(r[4]) ? r[4] : []).forEach(function(s){ rvMyCampaignIds[s.campaign_id] = true; });
    rvCampaigns = rvSortCampaigns(Array.isArray(r[0]) ? r[0] : []);
    rvMe = (r[1] && r[1][0]) || null;
    rvStoreList = (r[2] || []).map(function(s){ return s.name; }).filter(function(n){
      return n && n !== 'Централен офис' && n.indexOf('Логистичен') !== 0;
    });
    rvPickDefaultCampaign();
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
  rvUnits = {}; rvUnitErr = {}; rvUnitsOk = true;
  rvAddNote = ''; rvVkFromVal = '';
  var c = rvCampaign();
  if(!c || !rvStore){ rvSub = null; rvItems = []; rvRender(); return Promise.resolve(); }
  return sbGet('revaluation_submissions', 'campaign_id=eq.' + c.id + '&store_name=eq.' + encodeURIComponent(rvStore) + '&select=*')
    .then(function(subs){
      if(seq !== rvLoadSeq) return;
      rvSub = (subs && subs[0]) || null;
      if(!rvSub){ rvItems = []; return; }
      return Promise.all([
        sbGet('revaluation_items', 'submission_id=eq.' + rvSub.id + '&select=*&order=sort_order.asc,created_at.asc'),
        sbGetOk('revaluation_units', 'submission_id=eq.' + rvSub.id + '&select=id,item_id,unit_no&order=created_at.asc,unit_no.asc')
      ]).then(function(r){
        if(seq !== rvLoadSeq) return;
        rvItems = Array.isArray(r[0]) ? r[0] : [];
        rvUnitsOk = !!r[1].ok;
        if(r[1].ok) rvUnitsSet(r[1].rows);
      });
    }).then(function(){
      /* Баджът „в SAP" гледа и product_catalog — само кодовете на бланката (30.10.2026). */
      if(seq === rvLoadSeq && rvIsCoViewer() && rvItems.length) return rvLoadCat(rvItems.map(function(it){ return it.new_sap_code; }));
    }).then(function(){ if(seq === rvLoadSeq) rvRender(); });
}
function rvPickCampaign(id){
  rvCampaignId = id; rvFormClose();
  if(rvIsCoViewer()){ rvCoOpen = false; return rvLoadOverview(); }
  return rvLoadSheet();
}
function rvPickStore(name){ rvStore = name; rvFormClose(); return rvLoadSheet(); }

/* ─── Рендер ───────────────────────────────────────────── */
function rvCampaignLabel(c){
  return (c.status === 'open' ? '' : '🗄 ') + c.title + ' · ' + (RV_KIND_LABEL[c.kind] || c.kind) + ' · ' +
    fmtDate(c.starts_on).slice(0, 5) + '–' + fmtDate(c.ends_on) + (c.default_pct != null ? ' · ' + rvFmtQty(c.default_pct) + ' %' : '');
}
function rvStatusBadge(){
  var st = 'background:#f1f5f9;color:#475569;';
  var txt = 'Няма бланка';
  if(rvSub){
    if(rvSub.no_items){ txt = 'Нямат за преоценка' + (rvSub.submitted_at ? ' · ' + rvFmtTs(rvSub.submitted_at) : '') + (rvSub.status === 'submitted' ? ' · чака регионалния' : ''); st = 'background:#f5f3ff;color:#6d28d9;'; }
    else if(rvSub.status === 'submitted'){ txt = 'Подадена ' + rvFmtTs(rvSub.submitted_at) + ' · чака регионалния'; st = 'background:#ffedd5;color:#9a3412;'; }
    else if(rvSub.status === 'approved'){ txt = 'Одобрена ' + rvFmtTs(rvSub.approved_at) + (rvSub.approved_by ? ' · ' + rvSub.approved_by : ''); st = 'background:#dcfce7;color:#166534;'; }
    else if(rvSub.status === 'processed'){ txt = 'Обработена ' + rvFmtTs(rvSub.processed_at); st = 'background:#dbeafe;color:#1e40af;'; }
    else { txt = rvReturnedNow() ? 'Върната — чернова' : 'Чернова'; st = 'background:#fef9c3;color:#854d0e;'; }
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
  h += rvCampaignPickerHtml();
  if(rvIsCoViewer()){
    if(rvCoOpen) h += '<button class="btn-sm" onclick="rvCoBack()">← Към списъка на обектите</button>';
    h += rvHistOpen
      ? '<button class="btn-sm" onclick="rvHistClose()">← Към кампанията</button>'
      : '<button class="btn-sm" onclick="rvHistOpenView()">📁 История</button>';
    if(c && !rvRegionalAcc()){
      h += '<button class="btn-sm" onclick="rvExportCampaign()">📥 Excel — кампания</button>';
      /* MM41 и „Кодовете са създадени" са в бланката на обекта (30.10.2026) —
         само ЦО, виж rvCoButtonsHtml. */
    }
  } else if(!rvIsStoreUser()){
    var opts = rvStoreOptions();
    h += '<label style="font-size:12px;color:#64748b;margin-left:8px;">Обект</label><select id="rv-store" onchange="rvPickStore(this.value)">';
    opts.forEach(function(s){ h += '<option value="' + escAttr(s) + '"' + (s === rvStore ? ' selected' : '') + '>' + esc(s) + '</option>'; });
    h += '</select>';
  }
  if(rvIsCO() && !rvRegionalAcc()){
    h += '<button class="btn-sm" onclick="rvToggleSchedule()">📅 График на кампаниите</button>';
    if(c && c.status === 'open') h += '<button class="btn-sm" onclick="rvCloseCampaign()">🔒 Затвори кампанията</button>';
  }
  h += '</div>';
  if(c && c.note) h += '<div style="font-size:12px;color:#64748b;margin-top:6px;">📝 ' + esc(c.note) + '</div>';
  if(c && !rvCampaignOpenNow(c)){
    /* ЦО (19.10.2026): прозорецът спира обектите, не обработката от ЦО. */
    var winTxt = rvIsCoViewer()
      ? (c.status === 'open' ? 'Кампанията е извън прозореца' : 'Кампанията е затворена') + ' — обектите не могат да подават. Обработката от ЦО продължава.'
      : (c.status === 'open' ? 'Извън прозореца на кампанията — бланката е само за четене.' : 'Кампанията е затворена — само за четене.');
    h += '<div id="rv-window" style="font-size:12px;color:#b45309;margin-top:6px;">' + winTxt + '</div>';
  }
  if(rvShowSchedule && rvIsCO()) h += rvScheduleHtml();
  h += '</div>';

  if(rvIsCoViewer() && rvHistOpen){ el.innerHTML = h + rvHistHtml(); return; }
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
      '<input id="rv-sub-pct" type="text" inputmode="decimal" value="' + escAttrVal(pct == null ? '' : rvFmtQty(pct)) + '" onchange="rvSetSubPct(this.value)" style="width:64px;">' +
      '<button class="btn-sm" onclick="rvApplyPctAll()">Приложи % към всички редове</button>';
  } else if(pct != null){
    h += '<span style="font-size:12px;color:#64748b;">% за бланката: ' + esc(rvFmtQty(pct)) + '</span>';
  }
  h += '</div>';
  /* Т.6 на Теодор (27.11.2026), преместен най-горе по негова молба 27.11.2026 — и при празна бланка. */
  if(edit && !(rvSub && rvSub.no_items)) h += '<button type="button" id="rv-add-btn" class="rv-add-big" onclick="rvFormOpen()">➕ Добави артикул</button>';
  h += '<div style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px;">' +
    'Не се подават артикули от проверка на срокове или за връщане към доставчик. Кабели/гофри/маркучи/мрежи под 1 л.м. и мушама под 0,5 л.м. са брак, не преоценка.</div>';
  if(rvReturnedNow()){
    h += '<div id="rv-return-shown" style="font-size:13px;color:#9a3412;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:6px 10px;margin-bottom:8px;">↩ Върната от ' +
      esc(rvSub.returned_by || 'регионалния') + (rvSub.returned_at ? ' · ' + esc(rvFmtTs(rvSub.returned_at)) : '') + ': <b>' + esc(rvSub.return_note) + '</b></div>';
  }
  if(rvSub && rvSub.status === 'submitted'){
    h += '<div id="rv-wait-reg" style="font-size:12px;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 10px;margin-bottom:8px;">' +
      'Чака одобрение от регионалния на обекта' + (rvIsCoViewer() ? ' — Контролинг обработва бланката след одобрението.' : '.') + '</div>';
  }
  if(rvImportFails.length){
    h += '<div id="rv-import-fails" style="font-size:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:6px 10px;margin-bottom:8px;">⚠ Не са записани: ' + esc(rvImportFails.join(', ')) + '</div>';
  }
  h += rvValidFromHtml();
  if(rvSub && !rvUnitsOk){
    h += '<div id="rv-units-load-fail" style="font-size:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:6px 10px;margin-bottom:8px;">⚠ Номерата на бройките не се заредиха — презареди таба.</div>';
  }
  if(rvCanPhoto()) h += '<input id="rv-photo-cam" type="file" accept="image/*" capture="environment" style="display:none;" onchange="rvPhotoUpload(this)">' +
    '<input id="rv-photo-file" type="file" accept="image/*" multiple style="display:none;" onchange="rvPhotoUpload(this)">';

  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
  if(edit){
    h += '<button class="btn-sm" onclick="document.getElementById(\'rv-file\').click()">📤 Качи файл от SAP (ZSTOCK)</button>' +
      '<input id="rv-file" type="file" accept=".xlsx,.xls" style="display:none;" onchange="rvImportFile(this)">';
  }
  h += '<button class="btn-sm" onclick="rvExport()">' + (rvIsCoViewer() ? '📥 Excel — този обект' : '📥 Изтегли моята бланка') + '</button>';
  if(!rvIsCoViewer() && rvSub && rvSub.status === 'processed' && rvItems.length) h += '<button class="btn-sm" onclick="rvCopyCodes()">📋 Копирай новите кодове</button>';
  /* Етикети (етап 3, 25.11.2026) — при обработена бланка за всеки, който я
     вижда; и без редове за печат (прозорецът го казва). */
  if(rvSub && rvSub.status === 'processed') h += '<button class="btn-sm" id="rv-lbl-btn" onclick="rvLblOpen()">🏷 Етикети</button>';
  h += rvRegButtonsHtml();
  h += rvCoButtonsHtml();
  if(canSub){
    h += '<button class="btn-sm" onclick="rvSubmit()" style="background:#16a34a;color:#fff;">✅ Подай</button>';
    h += '<button class="btn-sm" onclick="rvNoItems()">🚫 Нямаме за преоценка</button>';
  }
  h += '</div>';
  if(edit && rvAddNote) h += '<div id="rv-add-note" style="font-size:13px;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;margin-bottom:8px;">✍ ' + esc(rvAddNote) + '</div>';

  var PINK_TH = 'background:#fce7f3;color:#9d174d;';
  /* tbl-rv-sheet — пренасяне на „Описание“ / „Коментар обект“ и скрол в кутията (index.html, 15.11.2026).
     Под 700 px обектът вижда карти (rvCardsHtml) вместо таблицата — rv-has-cards я
     скрива там. ЦО и регионалните (admin / accounting → изгледът на ЦО) остават с
     таблицата — „без промяна" по задачата от 27.11.2026. */
  var cards = !rvIsCoViewer();
  h += '<div class="tbl-wrap tbl-compact tbl-rv-sheet' + (cards ? ' rv-has-cards' : '') + '"><table><thead><tr><th>Код</th><th>Описание</th><th>Кол.</th><th>МЕ</th><th>Коментар обект</th><th>Ст. цена</th><th>%</th><th>Предложение</th>' +
    (pink ? '<th style="' + PINK_TH + '">Преоценен код</th><th style="' + PINK_TH + '">Цена преоц. код</th><th style="' + PINK_TH + '">Прехвърлено</th><th style="' + PINK_TH + '">Коментар Ели</th>' : '') +
    (edit ? '<th></th>' : '') + '</tr></thead><tbody id="rv-rows">';
  if(!rvItems.length){
    h += '<tr><td colspan="' + (8 + (pink ? 4 : 0) + (edit ? 1 : 0)) + '" style="text-align:center;color:#94a3b8;">' + (rvSub && rvSub.no_items ? 'Обектът няма артикули за преоценка.' : 'Няма редове.') + '</td></tr>';
  }
  rvItems.forEach(function(it){ h += rvRowHtml(it, edit, pink, coEdit); });
  h += '</tbody></table></div>';
  if(cards) h += rvCardsHtml(rvCanSubmit());
  h += '</div>';
  el.innerHTML = h;
}
function rvInp(it, field, val, w){
  return '<input type="text" data-id="' + escAttr(it.id) + '" data-f="' + field + '" value="' + escAttrVal(val) + '" onchange="rvEdit(this.dataset.id,this.dataset.f,this.value)" style="width:' + w + ';">';
}
function rvRowHtml(it, edit, pink, coEdit){
  var bad = rvBad[it.id], err = rvErr[it.id];
  var bg = bad || err ? 'background:#fef2f2;' : '';
  var badge = rvIsRepeat(it.sap_code) ? ' <span class="rv-repeat" style="background:#ede9fe;color:#5b21b6;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;">вече преоценен</span>' : '';
  var h = '<tr id="rv-row-' + escAttr(it.id) + '" style="' + bg + '">';
  h += '<td style="font-family:DM Mono,monospace;">' + esc(it.sap_code) + badge +
    (bad ? '<div class="rv-bad" style="font-size:10px;color:#b91c1c;">' + esc(bad.join(' · ')) + '</div>' : '') +
    (err ? '<div class="rv-err" style="font-size:10px;color:#b91c1c;">⚠ ' + esc(err) + '</div>' : '') +
    rvUnitsHtml(it) + '</td>';
  h += '<td>' + esc(it.product_name) + rvPhotosHtml(it) + '</td>';
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
  if(edit) h += '<td>' + (rvCanPhoto() ? '<button class="btn-sm rv-photo-btn rv-photo-cam-btn" data-id="' + escAttr(it.id) + '" onclick="rvPhotoPick(this.dataset.id,\'cam\')" title="Снимай">📷</button> ' +
    '<button class="btn-sm rv-photo-btn rv-photo-gal-btn" data-id="' + escAttr(it.id) + '" onclick="rvPhotoPick(this.dataset.id)" title="От галерията">🖼</button> ' : '') +
    '<button class="btn-sm" data-id="' + escAttr(it.id) + '" onclick="rvDeleteRow(this.dataset.id)" title="Изтрий ред">🗑 Изтрий ред</button></td>';
  return h + '</tr>';
}
/* Карти на телефон (т.2 и т.5 на Теодор, 27.11.2026): под 700 px вместо
   таблицата (CSS в index.html), само в изгледа на обекта. edit = rvCanSubmit() —
   само черновата има „✏️ Промени" / „🗑 Изтрий"; подадената — само за четене. */
function rvCardsHtml(edit){
  var h = '<div class="rv-cards" id="rv-cards">';
  if(!rvItems.length) h += '<div class="rv-card-empty">' + (rvSub && rvSub.no_items ? 'Обектът няма артикули за преоценка.' : 'Няма редове.') + '</div>';
  rvItems.forEach(function(it){
    var bad = rvBad[it.id], err = rvErr[it.id];
    var pct = it.discount_pct == null ? '' : rvFmtQty(it.discount_pct) + ' %';
    h += '<div class="rv-card' + (bad || err ? ' rv-card-bad' : '') + '" id="rv-card-' + escAttr(it.id) + '">' +
      '<div class="rv-card-code">' + esc(it.sap_code) + (rvIsRepeat(it.sap_code) ? ' <span class="rv-repeat" style="background:#ede9fe;color:#5b21b6;border-radius:20px;padding:1px 7px;font-size:12px;font-weight:700;">вече преоценен</span>' : '') + '</div>' +
      (bad ? '<div class="rv-bad">' + esc(bad.join(' · ')) + '</div>' : '') +
      (err ? '<div class="rv-err">⚠ ' + esc(err) + '</div>' : '') +
      rvUnitsHtml(it) +
      '<div class="rv-card-name">' + esc(it.product_name) + '</div>' +
      '<div class="rv-card-line">' + esc(rvFmtQty(it.qty)) + ' ' + esc(it.unit || '') +
        (pct ? ' · ' + esc(pct) : '') + ' → <b>' + esc(rvFmt(it.proposed_price) || '—') + '</b>' +
        (it.std_price != null ? ' <span class="rv-card-std">(ст. ' + esc(rvFmt(it.std_price)) + ')</span>' : '') + '</div>' +
      (String(it.store_comment || '').trim() ? '<div class="rv-card-why">' + esc(it.store_comment) + '</div>' : '') +
      rvPhotosHtml(it) +
      (edit ? '<div class="rv-card-btns"><button type="button" class="rv-f-btn rv-card-edit" data-id="' + escAttr(it.id) + '" onclick="rvFormOpen(this.dataset.id)">✏️ Промени</button>' +
        '<button type="button" class="rv-f-btn rv-card-del" data-id="' + escAttr(it.id) + '" onclick="rvDeleteRow(this.dataset.id)">🗑 Изтрий</button></div>' : '') +
      '</div>';
  });
  return h + '</div>';
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
    if(field !== 'qty'){ rvRender(); return true; }
    return rvUnitsSync(it).then(function(){ rvRender(); return true; });
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
    delete rvUnits[id]; delete rvUnitErr[id];   /* номерата падат в базата с on delete cascade */
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

/* ─── Номера на бройките (етап 2 от 3, 23.11.2026) ─────────
   revaluation_units (revaluation-units-schema.sql): МЕ БР (бр., бр, БР —
   rvSapUnit) → по един номер на бройка (ceil(qty)); друга МЕ → един номер на
   реда. Номерът (сега 'GB42', до 27.11 '<обект>-П0042') дава тригерът в базата — клиентът праща само
   item_id и чете номера от отговора. От 27.11.2026 (т.7 на Теодор) номерът е
   къс: stores.unit_prefix + число без нули — 'GB7' (revaluation-unit-prefix-schema.sql). rvUnitsSync сверява реда с базата и
   добавя липсващите / трие НАЙ-ГОЛЕМИТЕ излишни (номерата не се
   преизползват, дупки са допустими). Вика се при нов ред (ръчно, скенер,
   ZSTOCK) и при промяна на qty (rvEdit, повторен ZSTOCK) — тоест само докато
   бланката е редактируема (rvCanEdit: чернова; регионалният — и подадена).
   Изтрит ред → номерата падат с on delete cascade. Провал НЕ се поглъща:
   червен toast + маркер на реда „без номер — опитай пак" (rvUnitsHtml).
   Обработените (processed) бланки нямат номера и маркер не се показва.
   Износът за SAP, MM41, VK11, писмото „Готово" и История НЕ носят номерата и
   снимките — те са за етикетите в етап 3 (решение на Тенчо, 23.11.2026). */
var rvUnits = {};      /* item_id → [{id, item_id, unit_no}], по номер */
var rvUnitErr = {};    /* item_id → съобщение от провален rvUnitsSync */
var rvUnitsOk = true;  /* false = номерата на бланката не се заредиха */
var rvUnitsBusy = {};  /* item_id → обещанието на последния rvUnitsSync (един по един) */
function rvUnitNum(u){ var m = /(\d+)$/.exec(String((u && u.unit_no) || '')); return m ? parseInt(m[1], 10) : 0; }
function rvUnitsSort(list){ return list.slice().sort(function(a, b){ return rvUnitNum(a) - rvUnitNum(b); }); }
function rvUnitsSet(rows){
  rvUnits = {};
  (rows || []).forEach(function(u){ (rvUnits[u.item_id] = rvUnits[u.item_id] || []).push(u); });
  Object.keys(rvUnits).forEach(function(k){ rvUnits[k] = rvUnitsSort(rvUnits[k]); });
}
function rvUnitsWant(it){
  if(!it) return 0;
  if(rvSapUnit(it.unit).unit !== 'БР') return 1;
  var q = Number(it.qty);
  return isFinite(q) && q > 0 ? Math.ceil(q - 1e-9) : 0;
}
/* Номерира ли се бланката изобщо — processed е стара, преди етап 2. */
function rvUnitsApply(){ return !!rvSub && rvSub.status !== 'processed'; }
/* POST на няколко реда наведнъж с return=representation — sbPostReturn връща само първия. */
function rvPostRows(t, rows){
  var url = API + '/' + t;
  return fetch(url, { method: 'POST', headers: Object.assign({}, H, { 'Prefer': 'return=representation' }), body: JSON.stringify(rows) })
    .then(function(r){
      return r.json().catch(function(){ return null; }).then(function(d){
        if(!r.ok) return sbWriteFail('rvPostRows', url, r.status, d);
        return { ok: true, rows: Array.isArray(d) ? d : (d ? [d] : []) };
      });
    }).catch(sbNetFail('rvPostRows', url));
}
function rvUnitsSync(it, quiet){
  var id = it.id;
  var p = (rvUnitsBusy[id] || Promise.resolve()).then(function(){ return rvUnitsSyncNow(it, quiet); });
  rvUnitsBusy[id] = p;
  return p;
}
/* true = редът има точно колкото трябва номера. */
function rvUnitsSyncNow(it, quiet){
  var id = it.id, want = rvUnitsWant(it);
  var fail = function(msg){
    rvUnitErr[id] = msg;
    if(!quiet) toast('Номерата на бройките: ' + msg, '#dc2626');
    return false;
  };
  return sbGetOk('revaluation_units', 'item_id=eq.' + id + '&select=id,item_id,unit_no&order=created_at.asc').then(function(res){
    if(!res.ok) return fail('не се прочетоха — ' + res.error);
    var have = rvUnitsSort(res.rows);
    rvUnits[id] = have;
    if(have.length < want){
      var rows = [];
      for(var i = have.length; i < want; i++) rows.push({ item_id: id, submission_id: it.submission_id, store_name: it.store_name });
      return rvPostRows('revaluation_units', rows).then(function(r){
        if(!r.ok) return fail('не са създадени — ' + sbErrMsg(r));
        rvUnits[id] = rvUnitsSort(have.concat(r.rows));
        if(rvUnits[id].length !== want) return fail('създадени ' + r.rows.length + ' от ' + rows.length);
        delete rvUnitErr[id]; return true;
      });
    }
    if(have.length > want){
      var extra = have.slice(want);
      return sbDelete('revaluation_units', 'id=in.(' + extra.map(function(u){ return u.id; }).join(',') + ')').then(function(r){
        if(!r.ok || r.count === 0) return fail('излишните не са изтрити — ' + (r.ok ? '0 реда' : sbErrMsg(r)));
        rvUnits[id] = have.slice(0, want);
        delete rvUnitErr[id]; return true;
      });
    }
    delete rvUnitErr[id]; return true;
  });
}
function rvUnitsRetry(id){
  var it = rvItem(id);
  if(!it || !rvUnitsCanRetry()) return Promise.resolve(false);
  return rvUnitsSync(it).then(function(ok){
    if(ok) toast('Номерата са създадени');
    rvRender(); return ok;
  });
}
function rvUnitsCanRetry(){ return rvUnitsApply() && (rvCanEdit() || rvCoCanEdit()); }
/* „GB42 … GB44, GB47" — поредиците се свиват. Номерът е къс (т.7 на Теодор,
   27.11.2026: префикс на обекта + число), затова се пише цял навсякъде. */
function rvUnitsLabel(list){
  if(!list || !list.length) return '';
  var parts = [], i = 0;
  while(i < list.length){
    var j = i;
    while(j + 1 < list.length && rvUnitNum(list[j + 1]) === rvUnitNum(list[j]) + 1) j++;
    var a = String(list[i].unit_no);
    parts.push(j > i ? a + ' … ' + String(list[j].unit_no) : a);
    i = j + 1;
  }
  return parts.join(', ');
}
function rvUnitsHtml(it){
  if(!rvUnitsOk) return '';
  var list = rvUnits[it.id] || [];
  var h = list.length ? '<div class="rv-units" style="font-size:10px;color:#475569;white-space:normal;">№ ' + esc(rvUnitsLabel(list)) + '</div>' : '';
  /* processed (решение на Тенчо 25.11.2026): номерата се показват само за
     четене — без маркер „без номер" и без 🔁; ред без номера в стара бланка
     е просто без ред с номера. rvUnitsApply остава false — нищо не се пише. */
  if(!rvUnitsApply()) return h;
  var want = rvUnitsWant(it);
  if(list.length !== want || rvUnitErr[it.id]){
    h += '<div class="rv-unit-miss" style="font-size:10px;color:#b91c1c;font-weight:700;">' +
      (list.length > want ? 'излишни номера' : 'без номер') + ' — опитай пак' +
      (rvUnitsCanRetry() ? ' <button class="btn-sm rv-unit-retry" data-id="' + escAttr(it.id) + '" onclick="rvUnitsRetry(this.dataset.id)" style="font-size:10px;padding:1px 6px;">🔁 Опитай пак</button>' : '') + '</div>';
  }
  return h;
}

/* ─── Снимки на реда (етап 2, 23.11.2026) ─────────────────
   revaluation_items.photos text[] — публичните адреси. Качване — само докато
   бланката е чернова и редактируема (rvCanPhoto); компресия през canvas
   (diffCompressImage от stock-differences.js), bucket 'bulletin-files',
   префикс 'revaluation/' (като Разлики — 'differences/'). Махане = само от
   масива, файлът остава в bucket-а. От 27.11.2026 снимката е задължителна —
   „Подай" спира ред без снимка (rvRowProblems), прозорецът не записва без нея.
   Регионалният и ЦО виждат миниатюрите; клик → цял екран (rvPhotoView). */
var RV_PHOTO_BKT = 'bulletin-files';
var rvPhotoItemId = null;
function rvCanPhoto(){ return rvCanEdit() && !!rvSub && rvSub.status === 'draft'; }
function rvPhotoList(it){ return Array.isArray(it && it.photos) ? it.photos.filter(Boolean) : rvParseList(it && it.photos); }
function rvPhotosHtml(it){
  var list = rvPhotoList(it);
  if(!list.length) return '';
  var rm = rvCanPhoto();
  return '<div class="rv-photos" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + list.map(function(url, k){
    return '<span style="position:relative;display:inline-block;">' +
      '<img class="rv-thumb" src="' + escAttr(url) + '" data-id="' + escAttr(it.id) + '" data-k="' + k + '" onclick="rvPhotoView(this.dataset.id,+this.dataset.k)" alt="снимка" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;cursor:zoom-in;">' +
      (rm ? '<button class="rv-photo-rm" data-id="' + escAttr(it.id) + '" data-k="' + k + '" onclick="rvPhotoRemove(this.dataset.id,+this.dataset.k)" title="Махни снимката" style="position:absolute;top:-6px;right:-6px;border:none;border-radius:50%;width:16px;height:16px;line-height:14px;font-size:10px;padding:0;background:#dc2626;color:#fff;cursor:pointer;">✕</button>' : '') +
      '</span>';
  }).join('') + '</div>';
}
/* 📷 → камерата (capture), 🖼 → галерията (multiple); 24.11.2026 */
function rvPhotoPick(id, src){
  if(!rvCanPhoto() || !rvItem(id)) return false;
  rvPhotoItemId = id;
  var inp = document.getElementById(src === 'cam' ? 'rv-photo-cam' : 'rv-photo-file');
  if(inp) inp.click();
  return true;
}
function rvPhotoPut(file){
  var compress = typeof diffCompressImage === 'function' ? diffCompressImage(file, 1600, 0.75) : Promise.resolve(file);
  return compress.then(function(blob){
    var path = 'revaluation/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
    return fetch(SB_URL + '/storage/v1/object/' + RV_PHOTO_BKT + '/' + path, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: blob
    }).then(function(r){ return r.ok ? SB_URL + '/storage/v1/object/public/' + RV_PHOTO_BKT + '/' + path : null; },
      function(){ return null; });
  });
}
function rvPhotoUpload(input){
  var files = Array.prototype.slice.call((input && input.files) || []);
  var id = rvPhotoItemId;
  if(input) input.value = '';
  var it = rvItem(id);
  if(!files.length || !it || !rvCanPhoto()) return Promise.resolve(0);
  files = files.filter(function(f){ return !f.type || f.type.indexOf('image/') === 0; });
  if(!files.length){ toast('Само снимки', '#dc2626'); return Promise.resolve(0); }
  toast('⏳ Качване на ' + files.length + (files.length === 1 ? ' снимка' : ' снимки') + '…');
  return Promise.all(files.map(rvPhotoPut)).then(function(urls){
    var ok = urls.filter(Boolean), lost = urls.length - ok.length;
    if(!ok.length){ toast('Снимките не са качени', '#dc2626'); return 0; }
    var next = rvPhotoList(it).concat(ok);
    return sbPatch('revaluation_items', 'id=eq.' + id, { photos: next, updated_at: new Date().toISOString() }).then(function(res){
      if(!res.ok){ toast('Снимките са качени, но не са записани към реда: ' + sbErrMsg(res), '#dc2626'); return 0; }
      it.photos = next;
      if(lost) toast(lost + ' от ' + urls.length + ' снимки не са качени', '#dc2626');
      else toast(ok.length === 1 ? 'Снимката е добавена' : 'Снимките са добавени');
      rvRender(); return ok.length;
    });
  });
}
function rvPhotoRemove(id, k){
  var it = rvItem(id);
  if(!it || !rvCanPhoto()) return Promise.resolve(false);
  var list = rvPhotoList(it);
  if(k < 0 || k >= list.length) return Promise.resolve(false);
  if(!confirm('Да махна снимката от реда?')) return Promise.resolve(false);
  var next = list.slice(0, k).concat(list.slice(k + 1));
  return sbPatch('revaluation_items', 'id=eq.' + id, { photos: next.length ? next : null, updated_at: new Date().toISOString() }).then(function(res){
    if(!res.ok){ toast('Снимката не е махната: ' + sbErrMsg(res), '#dc2626'); return false; }
    it.photos = next.length ? next : null;
    rvRender(); return true;
  });
}
function rvPhotoView(id, k){
  var url = rvPhotoList(rvItem(id))[k];
  if(!url) return false;
  rvPhotoClose();
  var d = document.createElement('div');
  d.id = 'rv-photo-view';
  d.setAttribute('onclick', 'rvPhotoClose()');
  d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:12px;';
  d.innerHTML = '<img src="' + escAttr(url) + '" alt="снимка" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;">' +
    '<button onclick="rvPhotoClose()" style="position:absolute;top:12px;right:12px;font-size:20px;border:none;background:#fff;border-radius:50%;width:36px;height:36px;cursor:pointer;">✕</button>';
  document.body.appendChild(d);
  return true;
}
function rvPhotoClose(){ var d = document.getElementById('rv-photo-view'); if(d && d.parentNode) d.parentNode.removeChild(d); }

/* ─── Ръчен ред + автодопълване ────────────────────────── */
/* Бележката с номерата след „Запази" / импорта (25.11.2026); '' = няма. */
var rvAddNote = '';
/* Сканиране (етап 1/3, 23.11.2026): полето за код приема и EAN. SAP кодовете
   в product_catalog са 5–7 цифри, EAN-ите — 8–14, тоест 8–14 цифри винаги
   значат баркод (сверено в базата на 23.11.2026). Enter (ръчен скенер пише
   цифрите + Enter), „Добави" с EAN в полето и камерата минават по ЕДИН път —
   rvEanLookup. Същият код втори път → НОВ ред, без сливане: всяка бройка
   може да има свой % и дефект (решение на Тенчо, 23.11.2026). */
var rvEanRes = [];   /* EAN на повече от един ред в каталога → избор */

/* ─── Прозорец „➕ Добави артикул" / „✏️ Промени" ────────────
   Т.1, 2, 5, 6 на Теодор (27.11.2026): заменя лентата „＋ Ред". Прозорецът е
   отделен елемент в body (#rv-form, клас rv-form-bg — НЕ modal-bg, за да не
   се затвори от случаен клик встрани); rvRender не го пипа, полетата не губят
   стойностите си. Полетата пазят старите id-та (rv-a-*), затова rvSapLookup /
   rvEanLookup / скенерът / автодопълването работят без промяна. Под 700 px
   прозорецът е на цял екран (index.html, .rv-form).
   Снимката е задължителна (решение на Тенчо 27.11.2026): „💾 Запази" проверява
   код, кол. > 0, нова цена > 0, причина и поне една снимка; после качва
   снимките — падне ли дори една, НИЩО не се записва (качените се помнят за
   следващия опит); после записва реда с photos; после номерата. Ред без
   номера → маркерът „без номер — опитай пак" на реда, както досега.
   „5 празни реда" (т.1) НЕ се правят — номерата се дават при запис. */
var rvForm = null;   /* {id, keep:[url], files:[{file, src, url}], busy, last:'pct'|'price'} */
function rvFormClose(){
  var d = document.getElementById('rv-form');
  if(d && d.parentNode) d.parentNode.removeChild(d);
  if(rvForm) rvFormRevoke(rvForm.files);
  rvForm = null; rvAcRes = []; rvEanRes = []; rvCodeAsked = '';
}
function rvFormRevoke(files){
  (files || []).forEach(function(f){ if(f.src && window.URL && URL.revokeObjectURL){ try { URL.revokeObjectURL(f.src); } catch(e){} } });
}
/* id = ред за промяна; без id — нов ред. */
function rvFormOpen(id){
  if(!rvCanEdit()) return false;
  if(rvSub && rvSub.no_items){ toast('Бланката е отбелязана „нямаме за преоценка" — първо я отключи ЦО', '#dc2626'); return false; }
  var it = id ? rvItem(id) : null;
  if(id && !it) return false;
  rvFormClose();
  var d = document.createElement('div');
  d.id = 'rv-form'; d.className = 'rv-form-bg';
  document.body.appendChild(d);
  rvFormDraw(it);
  return true;
}
function rvFormDraw(it){
  var d = document.getElementById('rv-form');
  if(!d) return;
  if(rvForm) rvFormRevoke(rvForm.files);
  rvForm = { id: it ? it.id : null, keep: it ? rvPhotoList(it) : [], files: [], busy: false };
  rvAcRes = []; rvEanRes = []; rvCodeAsked = it ? String(it.sap_code || '') : '';
  var pct = it ? it.discount_pct : rvPct();
  var ro = it ? ' readonly' : '';
  var inp = function(id, val, extra){ return '<input id="' + id + '" type="text" value="' + escAttrVal(val) + '"' + (extra || '') + '>'; };
  var fld = function(t, inner){ return '<div class="rv-f-fld"><span class="rv-f-l">' + t + '</span>' + inner + '</div>'; };
  var units = it ? (rvUnits[it.id] || []) : [];
  var h = '<div class="rv-form" role="dialog" aria-modal="true">';
  h += '<div class="rv-f-head"><b>' + (it ? '✏️ Промени ред' : '➕ Добави артикул') + '</b>' +
    '<button type="button" class="rv-f-x" onclick="rvFormClose()" aria-label="Затвори">✕</button></div>';
  h += '<div id="rv-f-body">';
  if(!it) h += '<button type="button" class="rv-f-btn rv-f-scan" onclick="rvScanOpen()">📷 Сканирай</button>';
  h += fld('SAP код или EAN', '<div style="position:relative;">' +
    inp('rv-a-code', it ? it.sap_code : '', ' placeholder="SAP код или EAN"' + (it ? ro : ' inputmode="numeric" oninput="rvAcSchedule(this.value)" onkeydown="rvCodeKey(event)" onblur="rvCodeBlur()" autocomplete="off"')) +
    '<div id="rv-ac" class="rv-f-ac" style="display:none;"></div></div>' +
    (units.length ? '<div class="rv-f-units">№ ' + esc(rvUnitsLabel(units)) + '</div>' : ''));
  h += fld('Описание', inp('rv-a-name', it ? it.product_name : '', ' placeholder="Описание"' + ro));
  h += '<div class="rv-f-grid">' +
    fld('МЕ', inp('rv-a-unit', it ? it.unit : '', ' placeholder="МЕ"' + ro)) +
    fld('Ст. цена', inp('rv-a-std', it ? rvFmt(it.std_price) : '', ' placeholder="Ст. цена" inputmode="decimal" oninput="rvFormCalc(\'std\')"') +
      '<div id="rv-a-std-hint" class="rv-f-hint" style="display:none;">Повторна преоценка — въведи текущата цена на обекта</div>') + '</div>';
  h += '<div class="rv-f-grid rv-f-grid3">' +
    fld('Кол.', inp('rv-a-qty', it ? rvFmtQty(it.qty) : '1', ' placeholder="Кол." inputmode="decimal"')) +
    fld('%', inp('rv-a-pct', pct == null ? '' : rvFmtQty(pct), ' placeholder="%" inputmode="decimal" oninput="rvFormCalc(\'pct\')"')) +
    fld('Нова цена', inp('rv-a-price', it ? rvFmt(it.proposed_price) : '', ' placeholder="Нова цена" inputmode="decimal" oninput="rvFormCalc(\'price\')"')) + '</div>';
  h += fld('Причина / дефект', inp('rv-a-comment', it ? it.store_comment || '' : '', ' placeholder="Причина / дефект"'));
  h += fld('Снимки <span class="rv-f-req">— поне една</span>', '<div id="rv-f-photos" class="rv-f-photos"></div>' +
    '<div class="rv-f-row"><button type="button" class="rv-f-btn" id="rv-f-cam-btn" onclick="rvFormPick(\'cam\')">📷 Снимай</button>' +
    '<button type="button" class="rv-f-btn" id="rv-f-gal-btn" onclick="rvFormPick()">🖼 От галерията</button></div>' +
    '<input id="rv-f-cam" type="file" accept="image/*" capture="environment" style="display:none;" onchange="rvFormFiles(this)">' +
    '<input id="rv-f-file" type="file" accept="image/*" multiple style="display:none;" onchange="rvFormFiles(this)">');
  h += '<div id="rv-f-err" class="rv-f-err" style="display:none;"></div>';
  h += '<div class="rv-f-row rv-f-foot"><button type="button" class="rv-f-btn rv-f-save" id="rv-f-save" onclick="rvFormSave()">💾 Запази</button>' +
    '<button type="button" class="rv-f-btn" id="rv-f-cancel" onclick="rvFormClose()">Отказ</button></div>';
  h += '</div></div>';
  d.innerHTML = h;
  rvFormPhotosDraw();
  /* На телефон фокусът би извадил клавиатурата върху прозореца — там първо камерата. */
  if(!it && !(window.innerWidth < 700)) rvFocus('rv-a-code');
}
/* Ст. цена / % → нова цена; нова цена → %. Същите формули като в реда. */
function rvFormCalc(src){
  if(rvForm && (src === 'pct' || src === 'price')) rvForm.last = src;
  var std = rvNum(v('rv-a-std')), pct = rvNum(v('rv-a-pct')), pr = rvNum(v('rv-a-price'));
  if(src === 'price'){
    if(pr != null && std) rvSetVal('rv-a-pct', rvFmtQty(rvPctFromPrice(std, pr)));
    return;
  }
  if(pct != null && std != null) rvSetVal('rv-a-price', rvFmt(rvPriceFromPct(std, pct)));
}
function rvFormErr(msg){
  var el = document.getElementById('rv-f-err');
  if(!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
function rvFormTile(src, kind, k){
  return '<span class="rv-f-tile">' + (src ? '<img src="' + escAttr(src) + '" alt="снимка">' : '<span class="rv-f-tile-ph">📷</span>') +
    '<button type="button" class="rv-f-tile-x" data-kind="' + kind + '" data-k="' + k + '" onclick="rvFormPhotoRm(this.dataset.kind,+this.dataset.k)" aria-label="Махни снимката">✕</button></span>';
}
function rvFormPhotosDraw(){
  var box = document.getElementById('rv-f-photos');
  if(!box || !rvForm) return;
  var tiles = rvForm.keep.map(function(url, k){ return rvFormTile(url, 'keep', k); })
    .concat(rvForm.files.map(function(f, k){ return rvFormTile(f.src || f.url, 'file', k); }));
  box.innerHTML = tiles.length ? tiles.join('') : '<span class="rv-f-nophoto">Няма снимка</span>';
}
/* Махане в прозореца — без confirm: при промяна на ред важи чак със „Запази". */
function rvFormPhotoRm(kind, k){
  if(!rvForm || rvForm.busy) return false;
  var list = kind === 'keep' ? rvForm.keep : rvForm.files;
  if(!(k >= 0 && k < list.length)) return false;
  var gone = list.splice(k, 1);
  if(kind === 'file') rvFormRevoke(gone);
  rvFormPhotosDraw();
  return true;
}
function rvFormPick(src){
  if(!rvForm || rvForm.busy) return false;
  var inp = document.getElementById(src === 'cam' ? 'rv-f-cam' : 'rv-f-file');
  if(inp) inp.click();
  return true;
}
function rvFormFiles(input){
  var files = Array.prototype.slice.call((input && input.files) || []);
  if(input) input.value = '';
  if(!rvForm || !files.length) return 0;
  var img = files.filter(function(f){ return !f.type || f.type.indexOf('image/') === 0; });
  if(!img.length){ toast('Само снимки', '#dc2626'); return 0; }
  img.forEach(function(f){
    var src = '';
    try { src = window.URL && URL.createObjectURL ? URL.createObjectURL(f) : ''; } catch(e){}
    rvForm.files.push({ file: f, src: src, url: null });
  });
  rvFormErr('');
  rvFormPhotosDraw();
  return img.length;
}
/* Качва още некачените; null = поне една не мина (качените остават запомнени). */
function rvFormUpload(form){
  var todo = form.files.filter(function(f){ return !f.url; });
  if(!todo.length) return Promise.resolve(form.files.map(function(f){ return f.url; }));
  toast('⏳ Качване на ' + todo.length + (todo.length === 1 ? ' снимка' : ' снимки') + '…');
  return Promise.all(todo.map(function(f){
    return rvPhotoPut(f.file).then(function(url){ if(url) f.url = url; return url; }, function(){ return null; });
  })).then(function(urls){
    if(urls.some(function(u){ return !u; })) return null;
    return form.files.map(function(f){ return f.url; });
  });
}
function rvFormBusy(on){
  var b = document.getElementById('rv-f-save');
  if(b){ b.disabled = !!on; b.textContent = on ? '⏳ Записване…' : '💾 Запази'; }
}
function rvFormSave(){
  var form = rvForm;
  if(!form || form.busy) return Promise.resolve(false);
  var fail = function(msg){ form.busy = false; rvFormBusy(false); rvFormErr(msg); toast(msg, '#dc2626'); return false; };
  if(!rvCanEdit()) return Promise.resolve(fail('Бланката е само за четене'));
  var it = form.id ? rvItem(form.id) : null;
  if(form.id && !it) return Promise.resolve(fail('Редът вече го няма — затвори прозореца'));
  var code = v('rv-a-code');
  if(!it){
    if(rvSub && rvSub.no_items) return Promise.resolve(fail('Бланката е отбелязана „нямаме за преоценка" — първо я отключи ЦО'));
    if(!code) return Promise.resolve(fail('Въведи SAP код или EAN'));
    /* EAN в полето → първо каталогът; записът е със следващото „Запази",
       след като човекът види артикула. Същото, ако кодът още се търси. */
    if(rvIsEan(code)) return rvEanLookup(code).then(function(){ return false; });
    if(rvCodePending && rvCodePending.code === code) return rvCodePending.p.then(function(){ return false; });
  }
  var stdS = v('rv-a-std'), pctS = v('rv-a-pct'), prS = v('rv-a-price'), comment = v('rv-a-comment');
  var qty = rvNum(v('rv-a-qty'));
  var std = stdS === '' ? null : rvNum(stdS);
  var pct = pctS === '' ? null : rvNum(pctS);
  var pr = prS === '' ? null : rvNum(prS);
  var msg = [];
  if(!(qty > 0)) msg.push('количеството трябва да е над 0');
  if(stdS !== '' && (std == null || std < 0)) msg.push('невалидна стандартна цена');
  if(pctS !== '' && (pct == null || pct < 0 || pct > 100)) msg.push('процентът е от 0 до 100');
  if(!msg.length){
    /* Решава последното пипнато от двете (% или нова цена); без пипане — %.
       Така и поле, сменено без oninput, не оставя стара цена до нов %. */
    if(form.last === 'price' && pr != null){ if(std) pct = rvPctFromPrice(std, pr); }
    else if(pct != null && std != null) pr = rvPriceFromPct(std, pct);
    else if(pctS === '' && pr != null && std) pct = rvPctFromPrice(std, pr);
  }
  if(!(pr > 0)) msg.push('няма нова цена');
  if(!comment) msg.push('няма причина / дефект');
  if(!form.keep.length && !form.files.length) msg.push('няма снимка');
  if(msg.length) return Promise.resolve(fail('Не е записано: ' + msg.join(' · ')));
  form.busy = true; rvFormBusy(true); rvFormErr('');
  var name = v('rv-a-name'), unit = v('rv-a-unit');
  return rvFormUpload(form).then(function(urls){
    if(rvForm !== form) return false;
    if(!urls) return fail('Снимките не са качени — нищо не е записано. Опитай пак.');
    var photos = form.keep.concat(urls);
    var f = {
      qty: qty, std_price: std == null ? null : rvRound2(std), discount_pct: pct == null ? null : rvRound2(pct),
      proposed_price: rvRound2(pr), store_comment: comment, photos: photos
    };
    return it ? rvFormPatchRow(form, it, f, fail) : rvFormInsertRow(form, code, name, unit, f, fail);
  });
}
function rvFormInsertRow(form, code, name, unit, f, fail){
  return rvEnsureSub().then(function(sub){
    if(!sub){ rvRender(); return fail('Бланката не е създадена — редът НЕ е записан'); }
    var body = rvItemBody(sub, code, name, unit, f.qty, f.std_price, f.store_comment, rvNextSort(), f.discount_pct);
    body.proposed_price = f.proposed_price;
    body.photos = f.photos;
    return sbPostReturn('revaluation_items', body).then(function(res){
      if(!res.ok || !res.row) return fail('Редът не е записан: ' + sbErrMsg(res));
      rvItems.push(res.row);
      return rvUnitsSync(res.row).then(function(ok){
        var list = rvUnits[res.row.id] || [];
        rvAddNote = ok && list.length ? 'Запиши на стоката: № ' + rvUnitsLabel(list) : '';
        if(ok) toast('Редът е добавен');   /* иначе червеният toast от rvUnitsSync остава */
        rvRender();
        if(rvForm === form) rvFormSaved(form, res.row, ok, true);
        return true;
      });
    });
  });
}
function rvFormPatchRow(form, it, f, fail){
  var p = {};
  Object.keys(f).forEach(function(k){ p[k] = f[k]; });
  p.updated_at = new Date().toISOString();
  var qtyChanged = Number(it.qty) !== f.qty;
  return sbPatch('revaluation_items', 'id=eq.' + it.id, p).then(function(res){
    if(!res.ok) return fail('Редът не е записан: ' + sbErrMsg(res));
    Object.keys(p).forEach(function(k){ it[k] = p[k]; });
    delete rvErr[it.id]; delete rvBad[it.id];
    /* Кол. минава през номерата — както в реда (rvEdit). */
    return (qtyChanged ? rvUnitsSync(it) : Promise.resolve(true)).then(function(ok){
      if(ok) toast('Редът е записан');
      rvRender();
      if(rvForm === form) rvFormSaved(form, it, ok, false);
      return true;
    });
  });
}
function rvFormSaved(form, row, ok, isNew){
  form.busy = false;
  rvFormRevoke(form.files); form.files = [];
  var body = document.getElementById('rv-f-body');
  if(!body) return;
  var list = rvUnits[row.id] || [];
  var note = ok && list.length
    ? '<div id="rv-f-note" class="rv-f-note">✍ Запиши на стоката: № <b>' + esc(rvUnitsLabel(list)) + '</b></div>'
    : '<div id="rv-f-note" class="rv-f-err">Редът е записан, но е без номер — „🔁 Опитай пак" на реда.</div>';
  body.innerHTML = '<div class="rv-f-ok">✅ Записано: <b>' + esc(row.sap_code) + '</b> ' + esc(row.product_name || '') + '</div>' + note +
    '<div class="rv-f-row rv-f-foot">' +
    (isNew ? '<button type="button" class="rv-f-btn rv-f-save" id="rv-f-next" onclick="rvFormNext()">➕ Следващ</button>' : '') +
    '<button type="button" class="rv-f-btn" id="rv-f-done" onclick="rvFormClose()">Затвори</button></div>';
}
/* Празен прозорец за следващия артикул — без затваряне. */
function rvFormNext(){
  if(!document.getElementById('rv-form') || !rvCanEdit()) return false;
  rvFormDraw(null);
  return true;
}
function rvIsEan(code){ return /^\d{8,14}$/.test(String(code == null ? '' : code).trim()); }
/* Предложение на Теодор т.3 (27.11.2026): SAP код + Enter (или излизане от
   полето) зарежда артикула от каталога — по ТОЧЕН sap_code, през
   rvFillFromCat (код, описание, МЕ, цена). EAN минава както досега само през
   Enter / „Добави" / камерата. rvCodeAsked — последният поискан код:
   излизането от полето не пита втори път за същия (Enter → попълване →
   фокусът мръдва → blur). rvCodePending — заявката в ход: „Добави", натиснат
   преди отговора, чака я и НЕ добавя реда — човекът първо вижда артикула. */
var rvCodeAsked = '';
var rvCodePending = null;   /* {code, p} */
function rvCodeKey(ev){
  if(!ev || (ev.key !== 'Enter' && ev.keyCode !== 13)) return;
  if(ev.preventDefault) ev.preventDefault();
  var code = v('rv-a-code');
  if(rvIsEan(code)) rvEanLookup(code);
  else if(code) rvSapLookup(code);
}
function rvCodeBlur(){
  var code = v('rv-a-code');
  if(!code || rvIsEan(code) || code === rvCodeAsked) return Promise.resolve(0);
  return rvSapLookup(code);
}
function rvSapLookup(code){
  if(rvAcTimer){ clearTimeout(rvAcTimer); rvAcTimer = null; }
  rvAcSeq++; rvAcRes = []; rvEanRes = []; rvAcRender();
  rvCodeAsked = code;
  var pend = { code: code, p: null };
  pend.p = sbGetOk('product_catalog', 'sap_code=eq.' + encodeURIComponent(code) +
    '&select=sap_code,product_name,default_unit,sale_price&limit=1').then(function(res){
    if(rvCodePending === pend) rvCodePending = null;
    /* Полето вече е друго (нов ред, друг код) — отговорът е остарял. */
    if(v('rv-a-code') !== code) return 0;
    if(!res.ok){ rvCodeAsked = ''; toast('Каталогът не се прочете — ' + res.error, '#dc2626'); return 0; }
    if(!res.rows.length){
      /* Описанието / цената от предишен артикул не бива да останат до чужд код. */
      rvSetVal('rv-a-name', ''); rvSetVal('rv-a-unit', ''); rvSetVal('rv-a-std', '');
      var hint = document.getElementById('rv-a-std-hint'); if(hint) hint.style.display = 'none';
      toast('Кодът не е в каталога — попълни описанието на ръка', '#d97706');
      return 0;
    }
    rvFillFromCat(res.rows[0]);
    return 1;
  });
  rvCodePending = pend;
  return pend.p;
}
function rvSetVal(id, val){ var el = document.getElementById(id); if(el) el.value = val == null ? '' : val; }
function rvFocus(id){ var el = document.getElementById(id); if(el && el.focus) el.focus(); }
/* Каталогът → полетата. Повторна преоценка (код 8xxxxxx): цената в каталога
   НЕ е цената на обекта (6/6 реда в базата се разминават, 23.11.2026) —
   полето остава празно, с подсказка. Обикновен код: sale_price (56/56 реда
   съвпадат със std_price). */
function rvFillFromCat(p){
  var rep = rvIsRepeat(p.sap_code);
  rvCodeAsked = String(p.sap_code == null ? '' : p.sap_code).trim();
  rvSetVal('rv-a-code', p.sap_code);
  rvSetVal('rv-a-name', p.product_name);
  rvSetVal('rv-a-unit', p.default_unit);
  rvSetVal('rv-a-std', rep || p.sale_price == null ? '' : rvFmt(p.sale_price));
  var std = document.getElementById('rv-a-std');
  if(std) std.placeholder = rep ? 'въведи текущата цена на обекта' : 'Ст. цена';
  var hint = document.getElementById('rv-a-std-hint');
  if(hint) hint.style.display = rep ? 'block' : 'none';
  rvFormCalc('std');   /* прозорецът: новата цена по % на бланката */
  rvFocus(rep ? 'rv-a-std' : 'rv-a-comment');
}
function rvEanLookup(code){
  /* Автодопълването не бива да изтегли резултат върху вече намерения артикул. */
  if(rvAcTimer){ clearTimeout(rvAcTimer); rvAcTimer = null; }
  rvAcSeq++; rvAcRes = []; rvEanRes = []; rvAcRender();
  var vars = llEanVariants(code);
  if(!vars.length) return Promise.resolve(0);
  var q = vars.length === 1 ? 'ean_code=eq.' + encodeURIComponent(vars[0]) : 'ean_code=in.(' + vars.map(encodeURIComponent).join(',') + ')';
  return sbGet('product_catalog', q + '&select=sap_code,product_name,default_unit,sale_price,ean_code&order=sap_code.asc&limit=10').then(function(rows){
    var r = Array.isArray(rows) ? rows : [];
    if(!r.length){
      toast('Баркодът не е в каталога — въведи кода на ръка', '#d97706');
      rvSetVal('rv-a-code', '');
      rvFocus('rv-a-code');
      return 0;
    }
    if(r.length === 1){ rvFillFromCat(r[0]); return 1; }
    rvEanRes = r;
    rvEanRender();
    return r.length;
  });
}
function rvEanRender(){
  var box = document.getElementById('rv-ac');
  if(!box) return;
  box.innerHTML = '<div style="padding:7px 9px;font-size:12px;font-weight:600;color:#92400e;background:#fffbeb;">Баркодът съвпада с ' + rvEanRes.length + ' артикула — избери:</div>' +
    rvEanRes.map(function(p, k){
      return '<div class="rv-ean-pick" data-k="' + k + '" onmousedown="event.preventDefault()" onclick="rvEanPick(+this.dataset.k)" style="padding:7px 9px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12.5px;">' +
        '<b style="font-family:DM Mono,monospace;">' + esc(p.sap_code) + '</b> · ' + esc(p.product_name) +
        (p.default_unit ? ' <span style="color:#94a3b8;">(' + esc(p.default_unit) + ')</span>' : '') + '</div>';
    }).join('');
  box.style.display = 'block';
}
function rvEanPick(k){
  var p = rvEanRes[k];
  if(!p) return;
  rvEanRes = [];
  var box = document.getElementById('rv-ac');
  if(box){ box.innerHTML = ''; box.style.display = 'none'; }
  rvFillFromCat(p);
}
/* Камерата — скенерът на Товарни листи (loading.js: html5-qrcode 2.3.8 със
   SRI, BarcodeDetector), със свой обработчик. Едно сканиране = един артикул:
   скенерът се затваря, защото всяка бройка иска свой % и причина. */
function rvScanOpen(){
  if(!rvCanEdit()) return Promise.resolve(false);
  return llLoadScanLib().then(function(){
    llScanShowModal(null, { title: '📷 Сканиране — Преоценка', onRead: rvScanRead });
    return true;
  }, function(){
    toast('Скенерът не се зареди — въведи кода на ръка', '#dc2626');
    rvFocus('rv-a-code');
    return false;
  });
}
function rvScanRead(i, text){
  llScanClose();
  var code = String(text == null ? '' : text).trim();
  if(!rvIsEan(code)){
    toast('Прочетеният код не е EAN — въведи кода на ръка', '#d97706');
    rvFocus('rv-a-code');
    return Promise.resolve(0);
  }
  rvSetVal('rv-a-code', code);
  return rvEanLookup(code);
}
function rvAcSchedule(val){
  if(rvAcTimer) clearTimeout(rvAcTimer);
  if(rvIsEan(val)){ rvAcTimer = null; rvAcRes = []; rvAcRender(); return; }   /* баркод → Enter / „Добави", не автодопълване */
  var term = String(val == null ? '' : val).replace(/[,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if(term.length < 3){ rvAcRes = []; rvAcRender(); return; }
  rvAcTimer = setTimeout(function(){ rvAcTimer = null; rvAcFetch(term); }, 300);
}
function rvAcFetch(term){
  var seq = ++rvAcSeq;
  var t = encodeURIComponent(term);
  return sbGet('product_catalog',
    'or=(sap_code.ilike.' + t + '*,product_name.ilike.*' + t + '*)' +
    '&select=sap_code,product_name,default_unit,sale_price&order=sap_code.asc&limit=8'
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
  /* Т.4 на Теодор (27.11.2026): изборът носи и цената от каталога — същият
     път като EAN / SAP код (при 8xxxxxx — празна, с подсказката). */
  rvAcRes = []; rvAcRender();
  rvFillFromCat(p);
}
function rvNextSort(){
  var m = 0;
  rvItems.forEach(function(x){ if((x.sort_order || 0) > m) m = x.sort_order || 0; });
  return m + 1;
}
/* pct — по избор (ръчният ред има свое поле %); липсва → процентът на бланката. */
function rvItemBody(sub, code, name, unit, qty, std, comment, sort, pct){
  if(pct === undefined) pct = rvPct();
  return {
    submission_id: sub.id, campaign_id: sub.campaign_id, store_name: sub.store_name, sort_order: sort,
    sap_code: code, product_name: name || null, unit: unit || null, qty: qty, std_price: std,
    store_comment: comment || null, discount_pct: pct, proposed_price: rvPriceFromPct(std, pct),
    created_by: currentUser.display_name || currentUser.email || null
  };
}
/* ─── Импорт от SAP (ZSTOCK „Стоков анализ") ───────────── */
/* Ред 1 = заглавия, колоните се търсят по ИМЕ. „Завод" (напр. 1514) — последните
   две цифри са номерът на обекта. Код, който вече е в бланката → обновява
   qty/std_price, не дублира. Код извън product_catalog пак влиза — SAP е
   източникът. Един код два пъти във файла (няколко склада) → количествата се
   събират и след импорта се казва колко кода е засегнато (решение на сесията
   от 12.10.2026, не на спецификацията). */
var RV_IMPORT_NOTE = 'Запиши номерата върху бройките — виж под кода на всеки ред';
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
  /* Номерата на бройките (етап 2): тих режим на rvUnitsSync — един червен
     toast накрая вместо по един на ред; маркерът стои на всеки засегнат ред. */
  out.unitFails = 0;
  var rvCountUnitFail = function(ok){ if(!ok) out.unitFails++; };
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
            if(res.ok){ Object.keys(p).forEach(function(k){ ex[k] = p[k]; }); out.updated++; return rvUnitsSync(ex, true).then(rvCountUnitFail); }
            else { out.failed++; rvImportFails.push(x.code); rvErr[ex.id] = 'импортът не е записан: ' + sbErrMsg(res); }
          });
        }
        return sbPostReturn('revaluation_items', rvItemBody(sub, x.code, x.name, x.unit, x.qty, x.std, null, sort++)).then(function(res){
          if(res.ok && res.row){ rvItems.push(res.row); out.added++; return rvUnitsSync(res.row, true).then(rvCountUnitFail); }
          else { out.failed++; rvImportFails.push(x.code); }
        });
      });
    });
    return chain.then(function(){
      rvAddNote = out.added + out.updated > 0 ? RV_IMPORT_NOTE : '';
      var unitMsg = out.unitFails ? ' · ' + out.unitFails + (out.unitFails === 1 ? ' ред е без номера' : ' реда са без номера') + ' — „опитай пак" на реда' : '';
      if(out.failed || out.unitFails) toast((out.failed ? out.failed + ' реда не са записани — виж списъка над таблицата' : 'Импорт: нови ' + out.added + ', обновени ' + out.updated) + unitMsg + dupMsg, '#dc2626');
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
  /* Снимката е задължителна (решение на Тенчо 27.11.2026) — и за редовете от
     ZSTOCK (снимат се от реда / картата). Одобрението и ЦО не я проверяват. */
  if(!rvPhotoList(it).length) p.push('няма снимка');
  return p;
}
/* Еднакъв артикул с РАЗЛИЧЕН % / цена е позволен — всяка бройка със свой
   дефект (решение на Тенчо 25.11.2026, заменя правилото от 23.11.2026).
   „Един преоценен код = една цена" се пази при Контролинга: rvCoProposal не
   предлага кода на ред с друга цена, а rvCodePriceConflicts спира „Готово" и
   VK11. Обектът и регионалният не проверяват това. */
function rvSubmit(){
  if(!rvCanSubmit()) return Promise.resolve(false);
  if(!rvItems.length){ toast('Няма редове — ако нямате артикули, ползвай „Нямаме за преоценка"', '#dc2626'); return Promise.resolve(false); }
  rvBad = {};
  var n = 0;
  rvItems.forEach(function(it){
    var p = rvRowProblems(it);
    if(p.length){ rvBad[it.id] = p; n++; }
  });
  if(n){ rvRender(); toast(n + ' ' + (n === 1 ? 'ред не минава' : 'реда не минават') + ' — маркирани са, бланката НЕ е подадена', '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Подаване на ' + rvItems.length + ' реда? След подаване обектът не може да редактира.')) return Promise.resolve(false);
  var n0 = rvItems.length;
  return rvSubmitRoute().then(function(route){
    if(!route) return false;
    var patch = rvSubmitPatch({ status: 'submitted', no_items: false, submitted_at: new Date().toISOString(), submitted_by: currentUser.display_name || currentUser.email }, route);
    return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
      if(!res.ok){ toast('Бланката не е подадена: ' + sbErrMsg(res), '#dc2626'); return false; }
      Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
      toast(route.regs.length ? 'Бланката е подадена — чака одобрение от регионалния' : 'Бланката е подадена');
      rvRender();
      return rvNotify('подадени ' + n0 + ' реда', route).then(function(){ return true; });
    });
  });
}
/* ─── Одобрение от регионалния (13.11.2026, Тенчо по искане на Теодор) ────
   Регионален на обект = активен потребител с is_regional и обекта в
   assigned_stores — всяка роля. „Подай" при обект с регионален → 'submitted'
   (= чака регионалния); без регионален → направо 'approved' с approved_by
   'без регионален'. Контролинг обработва САМО 'approved' (rvCoCanEdit,
   rvCoReady). Регионалният: „✅ Одобри" — по всяко време; „↩ Върни на обекта"
   — само в дните на кампанията (като „Отключи"), със задължителен коментар →
   'draft' + return_note, който обектът вижда над таблицата. Регионалните се
   четат НАНОВО при подаване — паднала заявка = бланката НЕ се подава
   (иначе обект с регионален би минал като „без регионален").
   Одобряващи от списък (13.11.2026, решение на Тенчо — вместо да стане
   регионален, което стеснява admin в 8 модула): app_settings
   'revaluation_approvers' = JSON {"<обект>": ["<имейл>", …]}. Одобряващ за
   обект = регионалният му ИЛИ имейл от списъка за обекта — за бутоните
   „Одобри" / „Върни", за известието при „Подай" и за „без регионален" (само
   ако няма нито едното, нито другото). Правото да ПИШЕ в бланката (rvCanEdit)
   остава само за регионалния. Липсващ ключ / празно / невалиден JSON = празен
   списък; паднало четене при „Подай" = бланката НЕ се подава. */
var RV_NO_REGIONAL = 'без регионален';
var RV_USERS_Q = 'active=eq.true&select=email,display_name,notify_groups,is_regional,assigned_stores,role,store_name,active';
var RV_RETURN_NO = 'Връщане — само в дните на кампанията (и при включен обект)';
var RV_APPROVERS_KEY = 'revaluation_approvers';
var rvApprovers = {};  /* обект → [имейли, малки букви]; зарежда се с таба */
function rvParseApprovers(v){
  var out = {}, o = null;
  if(v == null || v === '') return out;
  if(typeof v === 'string'){ try { o = JSON.parse(v); } catch(e){ return {}; } }
  else o = v;
  if(!o || typeof o !== 'object' || Array.isArray(o)) return {};
  Object.keys(o).forEach(function(store){
    if(!Array.isArray(o[store])) return;
    var list = o[store].filter(function(x){ return typeof x === 'string' && x.trim(); }).map(function(x){ return x.trim().toLowerCase(); });
    if(list.length) out[store] = list;
  });
  return out;
}
function rvApproversRow(rows){
  var row = (Array.isArray(rows) ? rows : []).filter(function(r){ return r && r.key === RV_APPROVERS_KEY; })[0];
  return rvParseApprovers(row && row.value);
}
function rvApproverEmails(store, map){ return ((map || rvApprovers)[store] || []).slice(); }
function rvIsApproverFor(store){
  if(rvIsRegionalFor(store)) return true;
  var me = String((currentUser && currentUser.email) || '').trim().toLowerCase();
  return !!me && rvApproverEmails(store).indexOf(me) >= 0;
}
/* Регионалните + одобряващите от списъка. Имейл от списъка без активен
   потребител остава като получател само на имейл (без push). */
function rvRegionalsOf(users, store, approvers){
  var list = (users || []).filter(function(u){
    return u && u.active !== false && u.is_regional === true && !!store && rvParseList(u.assigned_stores).indexOf(store) >= 0;
  });
  var emails = rvApproverEmails(store, approvers || {});
  emails.forEach(function(em){
    var u = (users || []).filter(function(x){ return x && x.active !== false && String(x.email || '').trim().toLowerCase() === em; })[0];
    list.push(u || { email: em, display_name: null });
  });
  return rvDedupe(list);
}
function rvSubmitRoute(){
  return Promise.all([sbGetOk('users', RV_USERS_Q), sbGetOk('app_settings', 'key=eq.' + RV_APPROVERS_KEY + '&select=key,value')]).then(function(r){
    if(!r[0].ok || !r[1].ok){ toast('Регионалните / одобряващите не се прочетоха — бланката НЕ е подадена, опитай пак', '#dc2626'); return null; }
    rvApprovers = rvApproversRow(r[1].rows);
    return { users: r[0].rows, regs: rvRegionalsOf(r[0].rows, rvStore, rvApprovers) };
  });
}
function rvSubmitPatch(patch, route){
  if(route.regs.length){ patch.approved_at = null; patch.approved_by = null; }
  else { patch.status = 'approved'; patch.approved_at = patch.submitted_at; patch.approved_by = RV_NO_REGIONAL; }
  return patch;
}
/* Върната бележка се показва, докато бланката е чернова след връщането —
   „Отключи" от ЦО след това (reopened_at по-късно) я скрива. */
function rvReturnedNow(){
  if(!rvSub || rvSub.status !== 'draft' || !rvSub.return_note || !rvSub.returned_at) return false;
  return !rvSub.reopened_at || String(rvSub.returned_at) > String(rvSub.reopened_at);
}
function rvRegCanAct(){ return !!rvSub && rvSub.status === 'submitted' && rvIsApproverFor(rvStore); }
function rvRegCanReturn(){ return rvRegCanAct() && rvStoreOn(rvStore) && rvCampaignOpenNow(rvCampaign()); }
function rvRegButtonsHtml(){
  if(!rvRegCanAct()) return '';
  var h = '<button class="btn-sm" onclick="rvRegApprove()" style="background:#16a34a;color:#fff;">✅ Одобри</button>';
  if(rvRegCanReturn()){
    h += '<input id="rv-return-note" type="text" placeholder="Защо се връща (задължително)" style="width:220px;">' +
      '<button class="btn-sm" onclick="rvRegReturn()">↩ Върни на обекта</button>';
  } else {
    h += '<button class="btn-sm" onclick="rvRegReturn()" disabled title="' + escAttr(RV_RETURN_NO) + '">↩ Върни на обекта</button>';
  }
  return h;
}
function rvRegApprove(){
  if(!rvRegCanAct()) return Promise.resolve(false);
  if(!confirm('Одобряване на бланката на ' + rvStore + '? Тя отива в Контролинг за обработка.')) return Promise.resolve(false);
  /* Свежият прочит на редовете (051f057) пазеше само „еднакъв артикул =
     еднакъв %" — махнат с правилото на 25.11.2026; нищо друго не проверяваше. */
  var patch = { status: 'approved', approved_at: new Date().toISOString(), approved_by: currentUser.display_name || currentUser.email };
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е одобрена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    toast('Одобрена: ' + rvStore);
    rvRender();
    return rvNotifyApproved().then(function(){ return true; });
  });
}
function rvRegReturn(){
  if(!rvRegCanAct()) return Promise.resolve(false);
  if(!rvRegCanReturn()){ toast(RV_RETURN_NO, '#dc2626'); return Promise.resolve(false); }
  var note = v('rv-return-note');
  if(!note){ toast('Напиши защо връщаш бланката — коментарът е задължителен. Нищо не е върнато.', '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Връщане на бланката на ' + rvStore + ' за поправка?')) return Promise.resolve(false);
  /* no_items: false — върната „нямат" става обикновена чернова (като „Отключи"). */
  var patch = { status: 'draft', no_items: false, return_note: note, returned_at: new Date().toISOString(), returned_by: currentUser.display_name || currentUser.email,
    approved_at: null, approved_by: null };
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е върната: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    toast('Върната на обекта: ' + rvStore);
    rvRender();
    return rvNotifyReturned(note).then(function(){ return true; });
  });
}
function rvNoItems(){
  if(!rvCanSubmit()) return Promise.resolve(false);
  if(rvItems.length){ toast('Бланката има ' + rvItems.length + ' реда — изтрий ги или ги подай', '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Отбелязване „нямаме за преоценка" за ' + rvStore + '?')) return Promise.resolve(false);
  return rvSubmitRoute().then(function(route){ return route ? rvNoItemsWrite(route) : false; });
}
function rvNoItemsWrite(route){
  var patch = rvSubmitPatch({ status: 'submitted', no_items: true, submitted_at: new Date().toISOString(), submitted_by: currentUser.display_name || currentUser.email }, route);
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
    toast('Отбелязано: нямат за преоценка' + (route.regs.length ? ' — чака одобрение от регионалния' : ''));
    rvRender();
    return rvNotify('нямат за преоценка', route).then(function(){ return true; });
  });
}

/* ─── Известия ─────────────────────────────────────────── */
/* Получатели: група 'revaluation' („Преоценка") в notify_groups + регионалните,
   чиито assigned_stores включват обекта. До 18.10.2026 беше групата
   'controlling' — сменена, за да се реши поименно кой получава подадените
   бланки (Администрация → Групи). Провалено известие не отменя подаването,
   но се казва с жълт toast. */
/* От 13.11.2026 (одобрение от регионалния):
   · „Подай" → САМО регионалните на обекта; обект без регионален → групата
     'revaluation', както досега (rvRecipients);
   · „Одобри" → групата 'revaluation' (rvNotifyApproved);
   · „Върни" → управителят и складът на обекта (rvNotifyReturned).
   Всяко е имейл + push. sendEmail стои във всяка функция поотделно — таблицата
   „Кой какво получава" (admin.js, WHO_BROWSER_MAILS) брои по функция. */
function rvDedupe(list){
  var out = [], seen = {};
  (list || []).forEach(function(u){ var key = u && (u.email || u.display_name); if(key && !seen[key]){ seen[key] = 1; out.push(u); } });
  return out;
}
function rvGroupUsers(users){
  return rvDedupe((users || []).filter(function(u){
    var groups = typeof notifyGroupsOf === 'function' ? notifyGroupsOf(u) : rvParseList(u.notify_groups);
    return groups.indexOf('revaluation') >= 0;
  }));
}
function rvRecipients(users, store, approvers){
  var regs = rvRegionalsOf(users, store, approvers || rvApprovers);
  return regs.length ? rvDedupe(regs) : rvGroupUsers(users);
}
function rvStoreStaff(users, store){
  return rvDedupe((users || []).filter(function(u){
    return u && u.active !== false && u.store_name === store && (u.role === 'manager' || u.role === 'sklad');
  }));
}
/* push + имейл вече тръгнали → жълт toast, ако нещо липсва. */
function rvNoticeResult(rec, jobs, warn){
  if(!rec.length) return Promise.resolve(warn('няма получатели на известието'));
  return Promise.all(jobs).then(function(r){
    var bad = [];
    if(!r[0] || !r[0].ok) bad.push('push');
    if(!r[1] || !r[1].ok) bad.push('имейл');
    if(bad.length) return warn('известието не тръгна (' + bad.join(', ') + ')');
    return true;
  });
}
function rvPush(rec, text){
  var names = rec.map(function(u){ return u.display_name; }).filter(Boolean);
  return names.length && typeof pushToPeople === 'function' ? pushToPeople(names, 'Преоценка', text) : Promise.resolve({ ok: false });
}
function rvEmails(rec){ return rec.map(function(u){ return u.email; }).filter(Boolean); }
/* Писмото при „Подай" / „Нямаме за преоценка" (28.11.2026, етап 1 — само
   съдържанието): регионалният решава от писмото, без да отваря портала.
   Чиста функция — без DOM и без заявки. Inline стилове, без класове (пощенските
   програми режат <style>). Числата — с помощните функции на екрана (rvFmt,
   rvFmtQty, rvSapUnit). Сбор по стара / предложена цена = кол. × цена; ред без
   ст. цена или без предложение не влиза и се казва под сборовете. Адрес на
   снимка извън http(s) не се показва. Етап 2 (бутони без вход) — отделно. */
var RV_PORTAL_URL = 'https://tenchotenev13-afk.github.io/Tmax-store-portal/';
function rvSubmitEmailHtml(ctx){
  ctx = ctx || {};
  var c = ctx.campaign || null, sub = ctx.sub || {}, items = ctx.items || [];
  var hasReg = Array.isArray(ctx.regs) ? ctx.regs.length > 0 : !!ctx.regs;
  var TD = 'padding:4px 8px;font-size:13px;color:#0f172a;vertical-align:top;';
  var LBL = 'padding:4px 8px;font-size:12px;color:#64748b;vertical-align:top;white-space:nowrap;';
  var pct = sub.default_pct != null ? Number(sub.default_pct) : (c && c.default_pct != null ? Number(c.default_pct) : null);
  var kv = function(k, val){ return '<tr><td style="' + LBL + '">' + esc(k) + '</td><td style="' + TD + '">' + val + '</td></tr>'; };
  var h = '<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">';
  h += '<div style="font-size:18px;font-weight:700;margin:0 0 8px;">Преоценка — ' + esc(ctx.store) + (ctx.storeNo ? ' <span style="color:#64748b;font-weight:400;">№ ' + esc(String(ctx.storeNo)) + '</span>' : '') + '</div>';
  h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:640px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:12px;">';
  if(c) h += kv('Кампания', esc(c.title) + (c.starts_on || c.ends_on ? ' · ' + esc(fmtDate(c.starts_on)) + ' – ' + esc(fmtDate(c.ends_on)) : ''));
  h += kv('Подаде', esc(ctx.by) + (ctx.at && rvFmtTs(ctx.at) ? ' · ' + esc(rvFmtTs(ctx.at)) : ''));
  if(pct != null && isFinite(pct)) h += kv('% за бланката', esc(rvFmtQty(pct) + ' %'));
  if(String(sub.store_note || '').trim()) h += kv('Коментар на обекта', esc(String(sub.store_note).trim()));
  h += '</table>';
  if(sub.no_items){
    h += '<p style="font-size:14px;margin:0 0 12px;"><b>Обектът няма артикули за преоценка.</b></p>';
  } else {
    var sumStd = 0, sumNew = 0, noPrice = 0;
    items.forEach(function(it){
      var photos = rvPhotoList(it).filter(function(u){ return /^https?:\/\//i.test(String(u)); });
      var left = photos.length ? photos.map(function(u){
        return '<a href="' + escAttr(u) + '" target="_blank" style="display:block;margin-bottom:4px;"><img src="' + escAttr(u) + '" alt="снимка" width="90" style="display:block;width:90px;max-width:90px;height:auto;border:1px solid #e2e8f0;border-radius:4px;"></a>';
      }).join('') : '<span style="font-size:11px;color:#94a3b8;">без снимка</span>';
      var su = rvSapUnit(it.unit);
      var pctTxt = it.discount_pct == null || it.discount_pct === '' ? '' : rvFmtQty(it.discount_pct) + ' %';
      var right = '<div style="font-family:Consolas,monospace;font-size:14px;font-weight:700;">' + esc(it.sap_code) +
        (rvIsRepeat(it.sap_code) ? ' <span style="background:#ede9fe;color:#5b21b6;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700;font-family:Arial,sans-serif;">вече преоценен</span>' : '') + '</div>' +
        '<div style="font-size:13px;margin:2px 0 6px;">' + esc(it.product_name) + '</div>' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
        kv('Количество', esc((rvFmtQty(it.qty) + ' ' + (su.unit || '')).trim())) +
        kv('Ст. цена', esc(rvFmt(it.std_price))) +
        kv('%', esc(pctTxt)) +
        kv('Предложение', '<b>' + esc(rvFmt(it.proposed_price)) + '</b>') +
        (String(it.store_comment || '').trim() ? kv('Коментар', esc(String(it.store_comment).trim())) : '') +
        '</table>';
      h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:640px;border:1px solid #cbd5e1;margin-bottom:8px;"><tr>' +
        '<td width="100" style="width:100px;padding:6px;vertical-align:top;background:#f8fafc;">' + left + '</td>' +
        '<td style="padding:6px;vertical-align:top;">' + right + '</td></tr></table>';
      var std = it.std_price == null || it.std_price === '' ? null : Number(it.std_price);
      var nw = it.proposed_price == null || it.proposed_price === '' ? null : Number(it.proposed_price);
      if(std == null || nw == null || !isFinite(std) || !isFinite(nw)){ noPrice++; return; }
      var q = Number(it.qty) || 0;
      sumStd += q * std; sumNew += q * nw;
    });
    h += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:640px;background:#f1f5f9;border:1px solid #cbd5e1;margin:4px 0 4px;">' +
      kv('Редове', esc(String(items.length))) +
      kv('Сбор по стара цена', esc(rvFmt(rvRound2(sumStd)))) +
      kv('Сбор по предложена цена', esc(rvFmt(rvRound2(sumNew)))) +
      kv('Разлика', '<b>' + esc(rvFmt(rvRound2(sumStd - sumNew))) + '</b>') +
      '</table>';
    if(noPrice) h += '<p style="font-size:12px;color:#b45309;margin:0 0 12px;">' + esc(noPrice + ' ' + (noPrice === 1 ? 'ред без цена не е в сбора' : 'реда без цена не са в сбора')) + '</p>';
  }
  if(hasReg){
    h += '<p style="font-size:14px;margin:12px 0 4px;">Одобри или върни бланката в портала: Ревизии и преоценка → Преоценка.</p>' +
      '<p style="margin:0 0 12px;"><a href="' + escAttr(RV_PORTAL_URL) + '" target="_blank" style="color:#1d4ed8;">Отвори портала →</a></p>';
  }
  return h + '</div>';
}
function rvNotify(what, route){
  var c = rvCampaign();
  var text = 'Преоценка · ' + rvStore + ' · ' + (c ? c.title : '') + ': ' + what + (route && route.regs.length ? ' — чака одобрение' : '');
  var warn = function(msg){ toast('Подадено, но ' + msg, '#d97706'); return false; };
  var rec = rvRecipients(route ? route.users : [], rvStore, rvApprovers);
  var emails = rvEmails(rec);
  var html = rvSubmitEmailHtml({ store: rvStore, storeNo: rvStoreNo(rvStore), campaign: c, by: currentUser.display_name || currentUser.email,
    at: rvSub && rvSub.submitted_at, sub: rvSub, items: rvItems, regs: route ? route.regs : [] });
  var jobs = rec.length ? [rvPush(rec, text),
    typeof sendEmail === 'function' && emails.length ? sendEmail(emails, text, html) : Promise.resolve({ ok: false })] : [];
  return rvNoticeResult(rec, jobs, warn).catch(function(e){ return warn('известието не тръгна (' + ((e && e.message) || e) + ')'); });
}
function rvNotifyApproved(){
  var c = rvCampaign(), store = rvStore;
  var text = 'Преоценка · ' + store + ' · ' + (c ? c.title : '') + ': одобрена от регионалния';
  var warn = function(msg){ toast('Одобрено, но ' + msg, '#d97706'); return false; };
  return sbGetOk('users', RV_USERS_Q).then(function(res){
    if(!res.ok) return warn('получателите не се прочетоха');
    var rec = rvGroupUsers(res.rows);
    var emails = rvEmails(rec);
    var html = '<p>' + esc(text) + '</p><p>Одобри: ' + esc(currentUser.display_name || currentUser.email) + '</p>';
    var jobs = rec.length ? [rvPush(rec, text),
      typeof sendEmail === 'function' && emails.length ? sendEmail(emails, text, html) : Promise.resolve({ ok: false })] : [];
    return rvNoticeResult(rec, jobs, warn);
  }).catch(function(e){ return warn('известието не тръгна (' + ((e && e.message) || e) + ')'); });
}
function rvNotifyReturned(note){
  var c = rvCampaign(), store = rvStore;
  var text = 'Преоценка · ' + store + ' · ' + (c ? c.title : '') + ': върната за поправка';
  var warn = function(msg){ toast('Върнато, но ' + msg, '#d97706'); return false; };
  return sbGetOk('users', RV_USERS_Q).then(function(res){
    if(!res.ok) return warn('получателите не се прочетоха');
    var rec = rvStoreStaff(res.rows, store);
    var emails = rvEmails(rec);
    var html = '<p>' + esc(text) + '</p><p>Коментар: <b>' + esc(note) + '</b></p><p>Върна: ' + esc(currentUser.display_name || currentUser.email) +
      '</p><p>Поправи и подай пак в портала: Ревизии и преоценка → Преоценка.</p>';
    var jobs = rec.length ? [rvPush(rec, text + ' — ' + note),
      typeof sendEmail === 'function' && emails.length ? sendEmail(emails, text, html) : Promise.resolve({ ok: false })] : [];
    return rvNoticeResult(rec, jobs, warn);
  }).catch(function(e){ return warn('известието не тръгна (' + ((e && e.message) || e) + ')'); });
}

/* ─── Износ: „Изтегли моята бланка" ───────────────────── */
/* 14-те колони (14.11.2026, Елица): „Прехвърлено" веднага след
   „Количество" (поисканото от обекта). МЕ — по SAP (rvSapUnit), количествата
   — до 3 знака. Двата тотала са по ЕДНО и също ефективно количество
   (rvEffQty): прехвърленото (co_qty); при повторно преоценен код — qty
   (там Контролинг само сменя цената). Без ефективно количество
   (необработена бланка): „Тотал ст.пр.цена" = qty × ст. цена, „Тотал
   преоценка" — празно. До 14.11.2026 „Тотал ст.пр.цена" беше винаги по qty,
   а „Тотал преоценка" — по co_qty, и при Шумен (80291 6,178 → 5,738) двата
   се разминаваха. „Прехвърлено" при повторен ред = текст „само цена". */
var RV_PRICE_ONLY = 'само цена';
function rvEffQty(it){
  if(rvIsRepeat(it.sap_code)) return it.qty == null || it.qty === '' ? null : rvRound3(Number(it.qty));
  return it.co_qty == null || it.co_qty === '' ? null : rvRound3(Number(it.co_qty));
}
function rvItemExportRow(store, it){
  var no = rvStoreNo(store);
  var shop = no ? Number(no) : store;
  var qty = rvRound3(it.qty == null ? 0 : Number(it.qty));
  var rep = rvIsRepeat(it.sap_code);
  var moved = it.co_qty == null || it.co_qty === '' ? null : rvRound3(Number(it.co_qty));
  var eff = rvEffQty(it);
  var std = it.std_price == null ? null : Number(it.std_price);
  var sale = it.sale_price == null ? null : Number(it.sale_price);
  return [shop, it.sap_code, it.product_name || '', qty, rep ? RV_PRICE_ONLY : (moved == null ? '' : moved), rvSapUnit(it.unit).unit, it.store_comment || '',
    std == null ? '' : std, it.proposed_price == null ? '' : Number(it.proposed_price),
    it.new_sap_code || '', sale == null ? '' : sale, it.co_comment || '',
    std == null ? '' : rvRound2((eff == null ? qty : eff) * std), sale == null || eff == null ? '' : rvRound2(eff * sale)];
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
/* „＋ Нова кампания" (етап 2, една по една) е заменена от „📅 График на
   кампаниите" (етап 3б) — виж rvScheduleHtml по-долу. */
function rvCloseCampaign(){
  var c = rvCampaign();
  if(!rvIsCO() || rvRegionalAcc() || !c || c.status !== 'open') return Promise.resolve(false);
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
   admin / accounting обработват обект по обект (supply — без достъп от 16.11.2026).
   Розовите колони на реда: new_sap_code (Преоценен код), sale_price (Цена
   преоц. код), co_qty (Прехвърлено), co_comment (Коментар Ели).
   Предложения по подразбиране (показват се, НЕ се записват, докато ЦО не
   пипне реда или не натисне „Приеми предложените за всички"):
   - код = „8" + sap_code, допълнен с нули до 6 цифри (14557 → 8014557,
     103125 → 8103125); вече /^8\d{6}$/ (повторна преоценка) → същият код;
   - цена = proposed_price на обекта; прехвърлено = qty.
   „Готово за обект" → status 'processed' + известие САМО до управителя на
   обекта (role manager, active; push + имейл с прикачена 14-колонна бланка),
   копие до app_settings.revaluation_done_cc — ВИНАГИ; без имейл на
   управител копието става основен получател (19.10.2026). „Отключи бланката" → обратно 'draft'. */

var rvCoOpen = false;     /* ЦО: false = списъкът на обектите, true = бланката на rvStore */
var rvCoRows = [];        /* [{store, sub, n}] за списъка */
var rvCoSeq = 0;
/* МЕ по SAP: главни, без точка. Само тези се свеждат; друго остава както е и
   редът се маркира в екрана на ЦО. Валидни са САМО стойностите от списъка
   RV_SAP_VALUES (и ключовете на картата) — от 19.10.2026 произволни главни
   букви/цифри (L, KG, M, TOM) вече НЕ минават автоматично, а получават
   „МЕ не е по SAP".
   Източник: EXPORT.XLSX от Елица, 16.10.2026, колона БМЕ (107 353 артикула).
   15 стойности в SAP: БР, M2, ЛМ, ПАК, ЧФТ, ККТ, БЛИ, КГ, КУТ, КАШ, ТОП, РОЛ,
   ТОН, M3 (+ TOM — правописна грешка на 1 код, 97573; не се приема). M2 и M3
   са с ЛАТИНСКО M, всички останали — кирилица. В SAP няма L, KG, M — не ги
   връщай. */
var RV_SAP_UNITS = { 'бр.': 'БР', 'бр': 'БР', 'кв.м': 'M2', 'кв.м.': 'M2', 'м2': 'M2',
  'л.м': 'ЛМ', 'л.м.': 'ЛМ', 'лм': 'ЛМ', 'м': 'ЛМ', 'пакет': 'ПАК', 'пак': 'ПАК',
  'чифт': 'ЧФТ', 'чфт': 'ЧФТ', 'ккт': 'ККТ', 'к-кт': 'ККТ', 'бли': 'БЛИ', 'блистер': 'БЛИ',
  'кг': 'КГ', 'кут': 'КУТ', 'кутия': 'КУТ', 'кашон': 'КАШ', 'каш': 'КАШ', 'топ': 'ТОП',
  'рол': 'РОЛ', 'ролка': 'РОЛ', 'тон': 'ТОН', 'm3': 'M3', 'м3': 'M3' };
var RV_SAP_VALUES = ['БР', 'M2', 'ЛМ', 'ПАК', 'ЧФТ', 'ККТ', 'БЛИ', 'КГ', 'КУТ', 'КАШ', 'ТОП', 'РОЛ', 'ТОН', 'M3'];

function rvIsCoViewer(){ return rvIsCO(); }   /* supply — вън от 16.11.2026 (rvCanSee) */
function rvRound3(x){
  if(x == null || !isFinite(x)) return null;
  var s = x < 0 ? -1 : 1;
  return s * Math.round(Math.abs(x) * 1000 + 1e-7) / 1000;
}
function rvSapUnit(u){
  var t = String(u == null ? '' : u).trim();
  var k = t.toLowerCase();
  if(Object.prototype.hasOwnProperty.call(RV_SAP_UNITS, k)) return { unit: RV_SAP_UNITS[k], ok: true };
  if(RV_SAP_VALUES.indexOf(t) >= 0) return { unit: t, ok: true };
  return { unit: t, ok: false };
}
function rvCoProposeCode(sap){
  var s = String(sap == null ? '' : sap).trim();
  if(/^8\d{6}$/.test(s)) return s;
  if(/^\d{1,6}$/.test(s)) return '8' + ('000000' + s).slice(-6);
  return null;
}
/* Няколко реда с един sap_code (25.11.2026): обичайният код се предлага на
   ПЪРВИЯ ред (най-малък sort_order, при равенство — по-ранният в списъка) и
   на всички със СЪЩАТА цена като него. Ред с друга цена — без предложен код и
   с бележка (rvCoOtherPrice): там Контролингът въвежда отделен код на ръка.
   Цената на реда = записаната sale_price, иначе proposed_price; сравнение
   като числа, закръглени до стотинка. */
function rvCoPriceKey(it){
  var x = it.sale_price != null && it.sale_price !== '' ? it.sale_price : it.proposed_price;
  return x == null || x === '' ? null : rvRound2(Number(x));
}
function rvCoFirstOfCode(it, items){
  var c = String(it.sap_code == null ? '' : it.sap_code).trim(), first = null;
  (items || []).forEach(function(x){
    if(String(x.sap_code == null ? '' : x.sap_code).trim() !== c) return;
    if(!first || (Number(x.sort_order) || 0) < (Number(first.sort_order) || 0)) first = x;
  });
  return first || it;
}
function rvCoOtherPrice(it, items){
  var f = rvCoFirstOfCode(it, items || rvItems);
  return f !== it && rvCoPriceKey(f) !== rvCoPriceKey(it);
}
var RV_OTHER_PRICE_NOTE = 'същият артикул с друга цена — въведи отделен код';
/* Предложенията само за ПРАЗНИТЕ розови полета; {} = няма какво да се предложи. */
function rvCoProposal(it, items){
  var p = {};
  if((it.new_sap_code == null || it.new_sap_code === '') && !rvCoOtherPrice(it, items)){ var c = rvCoProposeCode(it.sap_code); if(c) p.new_sap_code = c; }
  if(it.sale_price == null && it.proposed_price != null) p.sale_price = rvRound2(Number(it.proposed_price));
  /* Повторно преоценен код — само цена, без прехвърляне (14.11.2026). */
  if(it.co_qty == null && it.qty != null && !rvIsRepeat(it.sap_code)) p.co_qty = rvRound3(Number(it.qty));
  return p;
}
/* Бланка, която Контролинг обработва: одобрена от регионалния (или без
   регионален) или вече обработена. 'submitted' = чака регионалния → само
   четене, без розови колони и без файловете за SAP (13.11.2026). */
function rvCoReady(){ return !!rvSub && (rvSub.status === 'approved' || rvSub.status === 'processed'); }
function rvShowPink(){
  if(rvIsCoViewer()) return rvCoReady() && !rvSub.no_items;
  return !!rvSub && rvSub.status === 'processed';
}
function rvCoCanEdit(){ return rvIsCO() && !!rvSub && rvSub.status === 'approved' && !rvSub.no_items; }

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
    /* Пилот по списък (25.10.2026): „не са подали" брои само включените —
       останалите не могат да подадат. Обект с бланка остава (отдолу). */
    if(!rvStoresOn && rvStoresList.length) names = names.filter(function(n){ return rvStoresList.indexOf(n) >= 0; });
    subs.forEach(function(s){ if(names.indexOf(s.store_name) < 0) names.push(s.store_name); });
    if(rvRegionalAcc()){ var reg = rvRegionStores(); names = names.filter(function(n){ return reg.indexOf(n) >= 0; }); }
    names.sort(function(a, b){ return a.localeCompare(b, 'bg'); });
    rvCoRows = names.map(function(n){ var s = bySt[n] || null; return { store: n, sub: s, n: s ? (cnt[s.id] || 0) : 0 }; });
    rvRender();
  });
}
function rvCoStatus(sub){
  if(!sub) return { txt: 'не е подала', key: 'none' };
  if(sub.no_items) return { txt: 'нямат' + (sub.submitted_at ? ' · ' + fmtDate(String(sub.submitted_at).slice(0, 10)).slice(0, 5) : '') + (sub.status === 'submitted' ? ' · чака регионален' : ''), key: sub.status === 'submitted' ? 'waiting' : 'no' };
  if(sub.status === 'processed') return { txt: 'обработена ' + fmtDate(String(sub.processed_at || '').slice(0, 10)).slice(0, 5), key: 'processed' };
  if(sub.status === 'approved') return { txt: 'одобрена ' + fmtDate(String(sub.approved_at || sub.submitted_at || '').slice(0, 10)).slice(0, 5), key: 'approved' };
  if(sub.status === 'submitted') return { txt: 'чака регионален · подадена ' + fmtDate(String(sub.submitted_at || '').slice(0, 10)).slice(0, 5), key: 'waiting' };
  return { txt: 'чернова', key: 'draft' };
}
var RV_ST_COL = { none: '#94a3b8', no: '#6d28d9', processed: '#1e40af', approved: '#166534', waiting: '#9a3412', draft: '#854d0e' };
function rvOverviewHtml(){
  var COL = RV_ST_COL;
  var tally = { none: 0, no: 0, processed: 0, approved: 0, waiting: 0, draft: 0 };
  var rows = rvCoRows.map(function(r){
    var st = rvCoStatus(r.sub);
    tally[st.key]++;
    return '<tr id="rv-co-' + escAttr(r.store) + '"><td><b>' + esc(r.store) + '</b>' + (rvStoreNo(r.store) ? ' <span style="color:#94a3b8;">№ ' + esc(rvStoreNo(r.store)) + '</span>' : '') + '</td>' +
      '<td style="color:' + COL[st.key] + ';font-weight:600;">' + esc(st.txt) + '</td><td>' + (r.sub && !r.sub.no_items ? r.n : '') + '</td>' +
      '<td>' + (r.sub ? '<button class="btn-sm" data-s="' + escAttr(r.store) + '" onclick="rvCoOpenStore(this.dataset.s)">Отвори</button>' : '') + '</td></tr>';
  }).join('');
  return '<div class="card"><div id="rv-co-tally" style="font-size:12px;color:#475569;margin-bottom:8px;">чакат регионален ' + tally.waiting +
    ' · одобрени ' + tally.approved + ' · обработени ' + tally.processed + ' · нямат ' + tally.no + ' · чернова ' + tally.draft + ' · не са подали ' + tally.none + '</div>' +
    '<div class="tbl-wrap tbl-compact"><table><thead><tr><th>Обект</th><th>Статус</th><th>Редове</th><th></th></tr></thead><tbody id="rv-co-rows">' +
    (rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Няма обекти.</td></tr>') + '</tbody></table></div></div>';
}
function rvCoOpenStore(name){
  if(rvRegionalAcc() && rvRegionStores().indexOf(name) < 0){ toast('Обектът не е в твоя регион', '#dc2626'); return Promise.resolve(false); }
  rvCoOpen = true; rvStore = name; rvFormClose(); return rvLoadSheet();
}
function rvCoBack(){ rvCoOpen = false; rvBad = {}; rvErr = {}; return rvLoadOverview(); }

/* ─── Розовите колони ──────────────────────────────────── */
function rvPinkCells(it, coEdit){
  var prop = rvCoEditableProposal(it, coEdit);
  var val = function(f){ return it[f] != null && it[f] !== '' ? it[f] : (prop[f] != null ? prop[f] : null); };
  var isProp = function(f){ return (it[f] == null || it[f] === '') && prop[f] != null; };
  var fmt = { new_sap_code: function(x){ return x == null ? '' : String(x); }, sale_price: rvFmt, co_qty: function(x){ return x == null ? '' : rvFmtQty(x); }, co_comment: function(x){ return x || ''; } };
  var PINK = 'background:#fdf2f8;';
  /* Баджът „за създаване" / „в SAP" стои под новия код (30.10.2026, Елица). */
  var badge = rvCodeBadge(it);
  /* Повторна преоценка: отделен код не влиза в MM41 и в прехвърлянето —
     казва се под бележката (случаят е описан за Тенчо, 25.11.2026). */
  var other = rvIsCoViewer() && (it.new_sap_code == null || it.new_sap_code === '') && rvCoOtherPrice(it)
    ? '<div class="rv-code-other" style="font-size:10px;color:#b45309;max-width:150px;">' + esc(RV_OTHER_PRICE_NOTE) +
      (rvIsRepeat(it.sap_code) ? ' (повторна преоценка — отделният код не влиза в MM41 и прехвърлянето)' : '') + '</div>' : '';
  var under = function(f){ return f === 'new_sap_code' ? (badge ? '<div class="rv-code-badge">' + badge + '</div>' : '') + other : ''; };
  return ['new_sap_code', 'sale_price', 'co_qty', 'co_comment'].map(function(f){
    if(f === 'co_qty' && rvIsRepeat(it.sap_code)) return '<td class="rv-price-only" style="' + PINK + 'color:#6b7280;font-style:italic;">' + RV_PRICE_ONLY + '</td>';
    var v = fmt[f](val(f));
    if(!coEdit) return '<td style="' + PINK + (f === 'new_sap_code' ? 'font-family:DM Mono,monospace;' : '') + '">' + esc(v) + under(f) + '</td>';
    var w = f === 'co_comment' ? '160px' : (f === 'new_sap_code' ? '84px' : '68px');
    return '<td style="' + PINK + '"><input type="text" class="' + (isProp(f) ? 'rv-prop' : '') + '" data-id="' + escAttr(it.id) + '" data-f="' + f + '" value="' + escAttrVal(v) + '"' +
      (isProp(f) ? ' title="предложено — записва се, когато пипнеш реда" style="width:' + w + ';font-style:italic;color:#9d174d;border:1px dashed #f9a8d4;"' : ' style="width:' + w + ';"') +
      ' onchange="rvCoEdit(this.dataset.id,this.dataset.f,this.value)">' + under(f) + '</td>';
  }).join('');
}
function rvCoEditableProposal(it, coEdit){ return coEdit ? rvCoProposal(it) : {}; }
/* Пипането на едно розово поле записва и предложенията за празните останали
   на същия ред — „Елица пипна реда". */
function rvCoEdit(id, field, val){
  var it = rvItem(id);
  if(!it || !rvCoCanEdit()) return Promise.resolve(false);
  if(field === 'co_qty' && rvIsRepeat(it.sap_code)) return Promise.resolve(false);
  var p = rvCoProposal(it);
  var t = String(val == null ? '' : val).trim();
  if(field === 'new_sap_code' || field === 'co_comment'){ p[field] = t || null; }
  else {
    var n = t === '' ? null : rvNum(t);
    if(t !== '' && (n == null || n < 0)){ toast('Невалидно число', '#dc2626'); rvRender(); return Promise.resolve(false); }
    p[field] = n == null ? null : (field === 'co_qty' ? rvRound3(n) : rvRound2(n));
  }
  return rvCoPatchItem(it, p).then(function(ok){
    return (ok && it.new_sap_code ? rvLoadCat([it.new_sap_code]) : Promise.resolve()).then(function(){ rvRender(); return ok; });
  });
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
  /* Редовете „същият артикул с друга цена" остават без код — казва се колко. */
  var manualTxt = function(){
    var m = rvItems.filter(function(it){ return (it.new_sap_code == null || it.new_sap_code === '') && rvCoOtherPrice(it); }).length;
    return m ? ' · ' + m + (m === 1 ? ' ред остава' : ' реда остават') + ' за ръчен код (същият артикул с друга цена)' : '';
  };
  if(!todo.length){ var m0 = manualTxt(); toast('Няма незаписани предложения' + m0, m0 ? '#d97706' : undefined); return Promise.resolve(0); }
  if(!confirm('Да се запишат предложените стойности на ' + todo.length + ' реда?')) return Promise.resolve(0);
  var okN = 0, chain = Promise.resolve();
  todo.forEach(function(it){ chain = chain.then(function(){ return rvCoPatchItem(it, rvCoProposal(it)).then(function(ok){ if(ok) okN++; }); }); });
  return chain.then(function(){
    var mt = manualTxt();
    if(okN < todo.length) toast((todo.length - okN) + ' реда не са записани' + mt, '#dc2626'); else toast('Записани: ' + okN + ' реда' + mt, mt ? '#d97706' : undefined);
    /* Като rvCoEdit: знакът „в SAP" / „за създаване" за току-що записаните
       кодове — без това се появяваше чак при ново отваряне (06.11.2026).
       Паднала порция → кодът остава непроверен → без знак. */
    var codes = todo.map(function(it){ return it.new_sap_code; }).filter(Boolean);
    return (codes.length ? rvLoadCat(codes) : Promise.resolve()).then(function(){ rvRender(); return okN; });
  });
}

/* ─── Бутоните на ЦО ───────────────────────────────────── */
function rvCoButtonsHtml(){
  if(!rvIsCoViewer() || !rvSub) return '';
  var h = '';
  if(!rvIsCO()) return h;
  if(!rvSub.no_items && rvItems.length && rvCoReady()){
    h += '<label style="font-size:12px;color:#64748b;margin-left:6px;">Валидна от</label><input id="rv-vk-from" type="date" value="' + escAttr(rvVkFromDefault()) + '" onchange="rvVkFromSet(this.value)">' +
      '<button class="btn-sm" onclick="rvVk11()">📄 VK11 — ' + esc(rvStore) + '</button>';
    /* MM41 и прехвърлянето — по бланката на обекта (30.10.2026, Елица). */
    if(!rvRegionalAcc()){
      h += '<button class="btn-sm" onclick="rvMm41()">⬇ MM41</button>' +
        '<button class="btn-sm" onclick="rvMm41Done()">✔ Кодовете са създадени в SAP</button>';
    }
    h += '<button class="btn-sm" onclick="rvTransfer()">⬇ Прехвърляне</button>';
  }
  if(rvCoCanEdit() && rvItems.some(function(it){ return Object.keys(rvCoProposal(it)).length > 0; })){
    h += '<button class="btn-sm" onclick="rvCoAcceptAll()">✔ Приеми предложените за всички</button>';
  }
  if(rvSub.status === 'approved') h += '<button class="btn-sm" onclick="rvCoDone()" style="background:#16a34a;color:#fff;">✅ Готово за обект</button>';
  if(rvSub.status === 'submitted' || rvSub.status === 'approved' || rvSub.status === 'processed'){
    h += rvCoCanUnlock()
      ? '<button class="btn-sm" onclick="rvCoUnlock()">🔓 Отключи бланката</button>'
      : '<button class="btn-sm" onclick="rvCoUnlock()" disabled title="' + escAttr(RV_UNLOCK_NO) + '">🔓 Отключи бланката</button>';
  }
  return h;
}
/* Отключване има смисъл само ако обектът може да подаде наново (19.10.2026). */
var RV_UNLOCK_NO = 'Обектът не може да подаде наново — кампанията е извън прозореца или Преоценка е скрита за този обект';
function rvCoCanUnlock(){ return rvStoreOn(rvStore) && rvCampaignOpenNow(rvCampaign()); }
/* Пазачът (25.11.2026): един new_sap_code с две различни sale_price в една
   бланка = две цени за един код във VK11. Спира „Готово за обект" и VK11.
   Сравнение като ЧИСЛА (50 = 50.0), закръглени до стотинка. Ред без код или
   без цена не участва (за „Готово" го хваща проверката по ред). */
var RV_CODE_PRICE_MSG = 'един преоценен код с две различни цени — въведи отделен код';
function rvCodePriceConflicts(rows){
  var g = {}, out = { codes: [], ids: {} };
  (rows || []).forEach(function(it){
    var c = String(it.new_sap_code == null ? '' : it.new_sap_code).trim();
    if(!c || it.sale_price == null || it.sale_price === '') return;
    (g[c] = g[c] || []).push(it);
  });
  Object.keys(g).forEach(function(c){
    var prices = {};
    g[c].forEach(function(it){ prices[String(rvRound2(Number(it.sale_price)))] = 1; });
    if(Object.keys(prices).length < 2) return;
    out.codes.push(c);
    g[c].forEach(function(it){ out.ids[it.id] = true; });
  });
  return out;
}
/* Проверката е върху СВЕЖ прочит от базата, не върху екрана. Паднало четене
   = спира. what — какво не е направено, за съобщението. → Promise<bool>. */
function rvCoCodePriceCheck(what){
  return sbGetOk('revaluation_items', 'submission_id=eq.' + rvSub.id + '&select=id,new_sap_code,sale_price').then(function(fr){
    if(!fr.ok){ toast(what + ' — редовете не се прочетоха: ' + fr.error, '#dc2626'); return false; }
    var cf = rvCodePriceConflicts(fr.rows);
    if(!cf.codes.length) return true;
    Object.keys(cf.ids).forEach(function(id){ (rvBad[id] = rvBad[id] || []).push(RV_CODE_PRICE_MSG); });
    rvRender();
    toast(what + ' — един преоценен код с различни цени: ' + cf.codes.join(', ') + '. Редовете са маркирани — въведи отделен код или една цена.', '#dc2626');
    return false;
  });
}
function rvCoDone(){
  if(!rvIsCO() || !rvSub || rvSub.status !== 'approved') return Promise.resolve(false);
  rvBad = {};
  var n = 0;
  if(!rvSub.no_items){
    rvItems.forEach(function(it){
      var p = [];
      if(!String(it.new_sap_code || '').trim()) p.push('няма преоценен код');
      if(!(Number(it.sale_price) > 0)) p.push('няма цена на преоценения код');
      if(!rvIsRepeat(it.sap_code) && (it.co_qty == null || it.co_qty === '')) p.push('няма прехвърлено количество');
      if(p.length){ rvBad[it.id] = p; n++; }
    });
  }
  if(n){
    rvRender();
    toast(n + (n === 1 ? ' ред е' : ' реда са') + ' без записан код/цена/прехвърлено — „Приеми предложените“ или попълни. Нищо не е обработено.', '#dc2626');
    return Promise.resolve(false);
  }
  return (rvSub.no_items ? Promise.resolve(true) : rvCoCodePriceCheck('Нищо не е обработено')).then(function(okCodes){
    if(!okCodes) return false;
    /* Бланка „нямат" няма цени — без дата, с потвърждението както досега. */
    if(rvSub.no_items){
      if(!confirm('Готово за ' + rvStore + '? Обектът ще получи известие и бланката се заключва.')) return false;
      return rvCoDoneWrite(null);
    }
    return rvDoneModalOpen();
  });
}
/* „Цените важат от" (25.11.2026) — поле в потвърждението вместо confirm().
   По подразбиране — „Валидна от" на VK11, ако е попълнена, иначе днес.
   Без валидна дата — не се обработва. → Promise<bool>, разрешава се от
   „✅ Обработи" (rvDoneModalOk) или „Отказ" (rvDoneModalClose). */
var rvDoneResolve = null;
function rvIsoOk(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
  return d.getFullYear() === +p[0] && d.getMonth() === +p[1] - 1 && d.getDate() === +p[2];
}
function rvDoneModalOpen(){
  rvDoneModalClose(false);
  var def = v('rv-vk-from') || rvVkFromVal || today();
  if(!rvIsoOk(def)) def = today();
  var d = document.createElement('div');
  d.id = 'rv-done-modal';
  d.className = 'modal-bg open';
  d.innerHTML = '<div class="modal" style="width:440px;"><h3>✅ Готово за ' + esc(rvStore) + '</h3>' +
    '<div style="font-size:13px;margin:8px 0;">Обектът ще получи известие и бланката се заключва.</div>' +
    '<label style="font-size:13px;">Цените важат от <input id="rv-done-from" type="date" value="' + escAttr(def) + '"></label>' +
    '<div style="font-size:12px;color:#64748b;margin-top:4px;">Обектът слага етикетите на стоката от тази дата.</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button class="btn-sm" id="rv-done-ok" onclick="rvDoneModalOk()" style="background:#16a34a;color:#fff;">✅ Обработи</button>' +
      '<button class="btn-sm" id="rv-done-cancel" onclick="rvDoneModalClose(false)">Отказ</button>' +
    '</div></div>';
  document.body.appendChild(d);
  return new Promise(function(resolve){ rvDoneResolve = resolve; });
}
function rvDoneModalClose(val){
  var d = document.getElementById('rv-done-modal');
  if(d && d.parentNode) d.parentNode.removeChild(d);
  var r = rvDoneResolve; rvDoneResolve = null;
  if(r) r(val === true);
}
function rvDoneModalOk(){
  var from = v('rv-done-from');
  if(!rvIsoOk(from)){ toast('Въведи от кога важат цените — нищо не е обработено', '#dc2626'); return Promise.resolve(false); }
  if(!rvIsCO() || !rvSub || rvSub.status !== 'approved'){ rvDoneModalClose(false); return Promise.resolve(false); }
  var r = rvDoneResolve; rvDoneResolve = null;
  var d = document.getElementById('rv-done-modal');
  if(d && d.parentNode) d.parentNode.removeChild(d);
  return rvCoDoneWrite(from).then(function(ok){ if(r) r(ok); return ok; });
}
function rvCoDoneWrite(from){
  var patch = { status: 'processed', processed_at: new Date().toISOString(), processed_by: currentUser.display_name || currentUser.email };
  if(from) patch.prices_valid_from = from;
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е обработена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    if(from) rvVkFromVal = '';   /* полето на VK11 вече взема записаната дата */
    toast('Обработена: ' + rvStore);
    rvRender();
    return rvCoNotifyDone(rvStore, rvSub, rvItems.slice()).then(function(){ return true; });
  });
}
function rvCoUnlock(){
  if(!rvIsCO() || !rvSub || ['submitted', 'approved', 'processed'].indexOf(rvSub.status) < 0) return Promise.resolve(false);
  if(!rvCoCanUnlock()){ toast(RV_UNLOCK_NO, '#dc2626'); return Promise.resolve(false); }
  if(!confirm('Отключване на бланката на ' + rvStore + '? Обектът пак ще може да редактира и да подаде наново.')) return Promise.resolve(false);
  /* no_items: false — бланка „нямат" става обикновена чернова (19.10.2026).
     approved_* се чистят — новото подаване пак минава през регионалния. */
  var patch = { status: 'draft', no_items: false, reopened_at: new Date().toISOString(), reopened_by: currentUser.display_name || currentUser.email, processed_at: null, processed_by: null,
    prices_valid_from: null, approved_at: null, approved_by: null };
  return sbPatch('revaluation_submissions', 'id=eq.' + rvSub.id, patch).then(function(res){
    if(!res.ok){ toast('Бланката не е отключена: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(patch).forEach(function(k){ rvSub[k] = patch[k]; });
    /* Обработена бланка отпреди етап 2 (23.11.2026) няма номера на бройките —
       отключена става чернова и се номерира наведнъж, вместо маркер на всеки ред. */
    var fails = 0, chain = Promise.resolve();
    rvItems.forEach(function(it){ chain = chain.then(function(){ return rvUnitsSync(it, true).then(function(ok){ if(!ok) fails++; }); }); });
    return chain.then(function(){
      if(fails) toast('Бланката е отключена · ' + fails + (fails === 1 ? ' ред е без номера' : ' реда са без номера') + ' — „опитай пак" на реда', '#dc2626');
      else toast('Бланката е отключена');
      rvRender(); return true;
    });
  });
}

/* ─── Известие „обработена" ────────────────────────────── */
/* base64 на 14-колонния xlsx или null (SheetJS не се зареди / гръмна). */
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
  /* Датата и подсещането за етикетите (25.11.2026) — само при бланка с редове. */
  var vf = sub.no_items ? '' : rvValidFromTxt(sub);
  var tail = sub.no_items ? '' : (vf ? 'Цените важат от ' + vf + '. ' : '') + RV_PRINT_NOTE;
  var warns = [];
  return Promise.all([
    sbGetOk('users', 'active=eq.true&role=eq.manager&store_name=eq.' + encodeURIComponent(store) + '&select=display_name,email,role,active'),
    sbGetOk('app_settings', 'key=eq.revaluation_done_cc&select=key,value'),
    sub.no_items || !items.length ? Promise.resolve(null) : rvXlsxBase64(store, items)
  ]).then(function(r){
    /* Само управителят на обекта (19.10.2026) — kasa / sklad не получават. */
    var users = (r[0].ok ? r[0].rows : []).filter(function(u){ return u && u.active === true && u.role === 'manager'; });
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
          return '<tr><td>' + esc(it.sap_code) + '</td><td>' + esc(it.product_name) + '</td><td>' + esc(rvIsRepeat(it.sap_code) ? RV_PRICE_ONLY : rvFmtQty(it.co_qty)) + '</td><td>' + esc(it.new_sap_code) + '</td><td>' + esc(rvFmt(it.sale_price)) + '</td></tr>';
        }).join('') + '</table>';
      html += (vf ? '<p><b>Цените важат от ' + esc(vf) + '.</b></p>' : '') + '<p>' + esc(RV_PRINT_NOTE) + '</p>';
      if(r[2]) html += '<p>Бланката е прикачена (14 колони).</p>';
      else { html += '<p>Файлът е в портала: Ревизии и преоценка → Преоценка.</p>'; warns.push('без прикачен файл'); }
    }
    html += '<p>Обработи: ' + esc(currentUser.display_name || currentUser.email) + '</p>';
    var extra = {};
    /* Копието тръгва ВИНАГИ: без имейл на управител cc става основен получател. */
    var to = emails;
    if(cc.length && emails.length) extra.cc = cc;
    else if(cc.length){ to = cc; warns.push('обектът няма имейл на управител — пратено само до копието'); }
    if(r[2]) extra.attachments = [{ filename: 'preocenka-' + (rvStoreNo(store) || 'obekt') + '-' + ((c && c.starts_on) || today()) + '.xlsx', content: r[2] }];
    var jobs = [
      names.length && typeof pushToPeople === 'function' ? pushToPeople(names, 'Преоценка', text + (tail ? '\n' + tail : '')) : Promise.resolve({ ok: false, none: true }),
      to.length && typeof sendEmail === 'function' ? sendEmail(to, text, html, extra) : Promise.resolve({ ok: false, none: true })
    ];
    return Promise.all(jobs).then(function(res){
      if(!res[0] || !res[0].ok) warns.push(res[0] && res[0].none ? 'няма получатели за push' : 'push не тръгна');
      if(!res[1] || !res[1].ok) warns.push(res[1] && res[1].none ? 'обектът няма имейл на управител и няма копие' : 'имейлът не тръгна');
    });
  }).catch(function(e){ warns.push('грешка: ' + ((e && e.message) || e)); })
    .then(function(){
      if(warns.length) toast('Обработено, но: ' + warns.join('; '), '#d97706');
      return !warns.length;
    });
}

/* ─── „Цените важат от" (25.11.2026) ─────────────────────
   revaluation_submissions.prices_valid_from — от „✅ Готово за обект".
   NULL (бланките отпреди) → нищо не се показва, етикетът взима processed_at. */
var RV_PRINT_NOTE = 'Отпечатайте етикетите: Ревизии и преоценка → Преоценка → „🏷 Етикети“';
var rvVkFromVal = '';   /* ръчно избраната „Валидна от" за VK11 — пази се между рендерите */
function rvVkFromSet(val){ rvVkFromVal = String(val || ''); }
function rvVkFromDefault(){
  if(rvVkFromVal) return rvVkFromVal;
  if(rvSub && rvSub.status === 'processed' && rvSub.prices_valid_from) return String(rvSub.prices_valid_from).slice(0, 10);
  return today();
}
function rvValidFromTxt(sub){ return sub && sub.prices_valid_from ? fmtDate(String(sub.prices_valid_from).slice(0, 10)) : ''; }
function rvValidFromHtml(){
  if(!rvSub || rvSub.status !== 'processed' || rvSub.no_items) return '';
  var h = '';
  var vf = rvValidFromTxt(rvSub);
  if(vf) h += '<div id="rv-valid-from" style="font-size:13px;color:#1e40af;margin-bottom:8px;">📅 Цените важат от <b>' + esc(vf) + '</b></div>';
  if(rvIsStoreUser()){
    if(vf && String(rvSub.prices_valid_from).slice(0, 10) > today()){
      h += '<div id="rv-valid-future" style="font-size:13px;color:#854d0e;background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:6px 10px;margin-bottom:8px;">⏳ Етикетите се слагат на стоката от ' + esc(vf) + '</div>';
    }
    if(rvItems.length) h += '<div id="rv-print-note" style="font-size:13px;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;margin-bottom:8px;">🏷 ' + esc(RV_PRINT_NOTE) + '</div>';
  }
  return h;
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

/* ─── Етикети (етап 3, 25.11.2026) ────────────────────────
   Печат за преоценените бройки от обработена бланка (бутон „🏷 Етикети").
   · Малък 5,8 × 3,9 см — перфориран A4, 3 колони × 7 реда (мерено от Тенчо
     25.11): етикет k (колона), r (ред) е на 13 + k×60 / 8 + r×39 мм, кутия
     58 × 37 мм, текстът 3 мм навътре; „Започни от етикет №" — за начнат лист.
   · Голям A5 — два на A4 изправен, 210 × 148,5 мм, линия за рязане по средата.
   Етикет на всеки номер от revaluation_units; ред без номера (бланките
   отпреди етап 2) → един етикет без номер. От 25.11.2026 следват
   „Прехвърлено" (rvLblRows): co_qty = 0 → нищо, БР с по-малко прехвърлени от
   номерата → избор на бройките; датата е prices_valid_from (NULL → processed_at). Ред без new_sap_code или без
   sale_price не се печата. Видът и изместването (мм) се помнят в
   localStorage (try/catch — без него стойностите по подразбиране).
   Цените са в € — официалната валута от 01.01.2026, както Минуси / Каса.
   Печатът е в #mod-print (както loading / transfers / picking), @page A4 без
   поле, клетките с абсолютни координати. Само печат — износът, MM41, VK11,
   писмото „Готово", История и „Днес" не се пипат. */
var RV_LBL = {
  small: { perPage: 21, cols: 3, x0: 13, y0: 8, sx: 60, sy: 39, w: 58, h: 37 },
  big: { perPage: 2, cols: 1, x0: 0, y0: 0, sx: 210, sy: 148.5, w: 210, h: 148.5 }
};
var RV_LBL_KIND_KEY = 'rv_lbl_kind';
var RV_LBL_OFF_KEY = 'rv_lbl_offset';
var RV_LBL_HINT = 'Печатай в реален размер (100%), без „Побери в страницата“';
function rvLblStoreGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function rvLblStoreSet(k, val){ try { localStorage.setItem(k, val); } catch(e){} }
function rvLblHalf(x){ x = Number(String(x == null ? '' : x).replace(',', '.')); return isFinite(x) ? Math.max(-20, Math.min(20, Math.round(x * 2) / 2)) : 0; }
function rvLblKindSaved(){ return rvLblStoreGet(RV_LBL_KIND_KEY) === 'big' ? 'big' : 'small'; }
function rvLblOffSaved(){
  var o = null;
  try { o = JSON.parse(rvLblStoreGet(RV_LBL_OFF_KEY) || 'null'); } catch(e){ o = null; }
  return { dx: rvLblHalf(o && o.dx), dy: rvLblHalf(o && o.dy) };
}
function rvLblOk(it){ return !!String((it && it.new_sap_code) || '').trim() && Number(it.sale_price) > 0; }
/* [{it, units: [unit_no | null], pick, zero}] — редовете с код и цена.
   Етикетите следват „Прехвърлено" (25.11.2026):
   · zero — co_qty = 0 (не повторна преоценка) → нито един етикет;
   · pick — БР, повече номера от прехвърленото (цяло co_qty) → печатат се
     отметнатите бройки, по подразбиране първите pick по номер;
   · повторна преоценка („само цена"), празно co_qty, стара бланка без
     номера → както досега (всички номера / един етикет). */
function rvLblRows(){
  return rvItems.filter(rvLblOk).map(function(it){
    var u = (rvUnits[it.id] || []).map(function(x){ return x.unit_no; }).filter(Boolean);
    var hasCo = !rvIsRepeat(it.sap_code) && it.co_qty != null && it.co_qty !== '' && isFinite(Number(it.co_qty));
    var co = hasCo ? Number(it.co_qty) : null;
    var zero = hasCo && co <= 0;
    var pick = hasCo && !zero && rvSapUnit(it.unit).unit === 'БР' && co === Math.floor(co) && co < u.length ? co : null;
    return { it: it, units: u.length ? u : [null], pick: pick, zero: zero };
  });
}
function rvLblDate(ts){
  if(!ts) return '';
  var d = new Date(ts);
  if(isNaN(d.getTime())) return '';
  var p = function(n){ return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}
function rvLblMoney(n){ return rvFmt(n) + ' €'; }
function rvLblMm(x){ return String(Math.round(x * 100) / 100) + 'mm'; }

/* ─── Прозорецът преди печат ─── */
function rvLblOpen(){
  if(!rvSub || rvSub.status !== 'processed') return false;
  rvLblModal(rvLblKindSaved(), null);
  return true;
}
function rvLblClose(){ var d = document.getElementById('rv-lbl-modal'); if(d && d.parentNode) d.parentNode.removeChild(d); }
/* on — {item_id: true}, onU — {item_id: [unit_no]} от предишния рендер
   (смяна на вида пази отметките). */
function rvLblModal(kind, on, onU){
  var rows = rvLblRows();
  var skipped = rvItems.filter(function(it){ return !rvLblOk(it); });
  var off = rvLblOffSaved();
  var start = 1;
  var old = document.getElementById('rv-lbl-start');
  if(old) start = Math.max(1, Math.min(21, parseInt(old.value, 10) || 1));
  var h = '<div class="modal" style="width:640px;">' +
    '<h3>🏷 Етикети — ' + esc(rvStore) + '</h3>' +
    '<div style="display:flex;flex-wrap:wrap;gap:14px;margin:8px 0;font-size:13px;">' +
      '<label><input type="radio" name="rv-lbl-kind" id="rv-lbl-kind-small" value="small"' + (kind === 'small' ? ' checked' : '') + ' onchange="rvLblKind(\'small\')"> Малък 5,8 × 3,9 см (21 на лист)</label>' +
      '<label><input type="radio" name="rv-lbl-kind" id="rv-lbl-kind-big" value="big"' + (kind === 'big' ? ' checked' : '') + ' onchange="rvLblKind(\'big\')"> Голям А5 (2 на лист А4)</label>' +
    '</div>' +
    '<div id="rv-lbl-hint" style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px;">🖨 ' + esc(RV_LBL_HINT) + '</div>';
  if(!rows.length){
    h += '<div id="rv-lbl-empty" style="padding:10px;color:#b91c1c;font-size:13px;">Няма редове за етикети — ' +
      (rvItems.length ? 'на нито един ред няма нов код и цена.' : 'бланката няма редове.') + '</div>';
  } else {
    h += '<div class="tbl-wrap tbl-compact" style="max-height:40vh;overflow:auto;"><table><thead><tr><th style="width:32px;"></th><th>Нов код</th><th>Артикул</th><th>Нова цена</th><th style="width:26%;">Етикети</th></tr></thead><tbody>';
    rows.forEach(function(r){
      var chk = !r.zero && (!on || on[r.it.id]);
      var n;
      if(r.zero) n = '0 <span class="rv-lbl-zero" style="color:#94a3b8;font-size:11px;">нищо не е прехвърлено</span>';
      else if(r.pick != null){
        var sel = onU && onU[r.it.id];
        n = '<div class="rv-lbl-pick" data-id="' + escAttr(r.it.id) + '"><div style="font-size:11px;color:#92400e;overflow-wrap:anywhere;">прехвърлени ' + r.pick + ' от ' + r.units.length + ' — отметни кои бройки</div>' +
          r.units.map(function(u, k){
            var on1 = sel ? sel.indexOf(u) >= 0 : k < r.pick;
            return '<label title="' + escAttr(u) + '" style="display:inline-block;margin-right:8px;font-size:11px;white-space:nowrap;"><input type="checkbox" class="rv-lbl-u" data-id="' + escAttr(r.it.id) + '" data-u="' + escAttr(u) + '"' + (on1 ? ' checked' : '') + '> ' + esc(u) + '</label>';
          }).join('') + '</div>';
      } else n = r.units.length + (r.units[0] == null ? ' <span style="color:#94a3b8;font-size:11px;">без номер</span>' : '');
      h += '<tr id="rv-lbl-row-' + escAttr(r.it.id) + '"' + (r.zero ? ' class="rv-lbl-row-zero" style="color:#94a3b8;background:#f8fafc;"' : '') + '><td><input type="checkbox" class="rv-lbl-chk" data-id="' + escAttr(r.it.id) + '"' + (chk ? ' checked' : '') + (r.zero ? ' disabled' : '') + '></td>' +
        '<td style="font-family:DM Mono,monospace;">' + esc(r.it.new_sap_code) + '</td><td>' + esc(r.it.product_name) + '</td>' +
        '<td>' + esc(rvLblMoney(r.it.sale_price)) + '</td><td class="rv-lbl-n">' + n + '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  if(skipped.length){
    h += '<div id="rv-lbl-skipped" style="font-size:12px;color:#94a3b8;margin-top:6px;">Не се печатат (няма нов код или цена): ' +
      esc(skipped.map(function(it){ return (it.sap_code || '') + ' ' + (it.product_name || ''); }).join('; ')) + '</div>';
  }
  h += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px;font-size:13px;">';
  if(kind === 'small') h += '<label>Започни от етикет № <input id="rv-lbl-start" type="number" min="1" max="21" step="1" value="' + start + '" style="width:56px;"></label>';
  h += '<label>Изместване → <input id="rv-lbl-dx" type="number" step="0.5" min="-20" max="20" value="' + off.dx + '" onchange="rvLblSaveOff()" style="width:64px;"> мм</label>' +
    '<label>↓ <input id="rv-lbl-dy" type="number" step="0.5" min="-20" max="20" value="' + off.dy + '" onchange="rvLblSaveOff()" style="width:64px;"> мм</label>' +
    '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">' +
      '<button class="btn-sm" id="rv-lbl-print" onclick="rvLblPrint(false)" style="background:#16a34a;color:#fff;"' + (rows.length ? '' : ' disabled') + '>🖨 Печат</button>' +
      '<button class="btn-sm" id="rv-lbl-test" onclick="rvLblPrint(true)">▭ Пробен лист</button>' +
      '<button class="btn-sm" onclick="rvLblClose()">Затвори</button>' +
    '</div></div>';
  var d = document.getElementById('rv-lbl-modal');
  if(!d){
    d = document.createElement('div');
    d.id = 'rv-lbl-modal';
    document.body.appendChild(d);
  }
  d.className = 'modal-bg open';
  d.innerHTML = h;
}
function rvLblChecked(){
  var on = {};
  Array.prototype.forEach.call(document.querySelectorAll('#rv-lbl-modal .rv-lbl-chk'), function(c){ if(c.checked) on[c.dataset.id] = true; });
  return on;
}
/* Отметнатите бройки на редовете с избор: {item_id: [unit_no]}. */
function rvLblUnitsChecked(){
  var out = {};
  Array.prototype.forEach.call(document.querySelectorAll('#rv-lbl-modal .rv-lbl-u'), function(c){
    var a = out[c.dataset.id] = out[c.dataset.id] || [];
    if(c.checked) a.push(c.dataset.u);
  });
  return out;
}
function rvLblKind(kind){
  kind = kind === 'big' ? 'big' : 'small';
  rvLblStoreSet(RV_LBL_KIND_KEY, kind);
  rvLblModal(kind, rvLblChecked(), rvLblUnitsChecked());
}
function rvLblSaveOff(){
  var dx = rvLblHalf(v('rv-lbl-dx')), dy = rvLblHalf(v('rv-lbl-dy'));
  rvLblStoreSet(RV_LBL_OFF_KEY, JSON.stringify({ dx: dx, dy: dy }));
  return { dx: dx, dy: dy };
}
/* Етикетите по ред на бланката: [{it, unit}] само за отметнатите редове;
   ред с избор — отметнатите бройки (onU), без onU — първите pick. */
function rvLblList(on, onU){
  var out = [];
  rvLblRows().forEach(function(r){
    if(!on[r.it.id] || r.zero) return;
    var units = r.units;
    if(r.pick != null) units = onU && onU[r.it.id] ? r.units.filter(function(u){ return onU[r.it.id].indexOf(u) >= 0; }) : r.units.slice(0, r.pick);
    units.forEach(function(u){ out.push({ it: r.it, unit: u }); });
  });
  return out;
}

/* ─── Самият печат ─── */
function rvLblCss(){
  return '@page{size:A4;margin:0;}' +
    '#rv-lbl-sheets .rv-lbl-page{position:relative;width:210mm;height:296mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always;}' +
    '#rv-lbl-sheets .rv-lbl-page:last-child{break-after:auto;page-break-after:auto;}' +
    '#rv-lbl-sheets .rv-lbl{position:absolute;box-sizing:border-box;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#000;line-height:1.15;}' +
    '#rv-lbl-sheets .rv-lbl-frame{border:0.2mm solid #000;}' +
    '#rv-lbl-sheets .rv-lbl-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '#rv-lbl-sheets .rv-lbl-name{font-weight:700;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;word-break:break-word;}' +
    '#rv-lbl-sheets .rv-lbl-old{text-decoration:line-through;color:#333;}' +
    '#rv-lbl-sheets .rv-lbl-new{font-weight:800;}' +
    /* Малък: 58 × 37, 3 мм навътре → 52 × 31 за текста */
    '#rv-lbl-sheets .rv-lbl-s{width:58mm;height:37mm;padding:3mm;}' +
    '#rv-lbl-sheets .rv-lbl-s .rv-lbl-name{font-size:8pt;-webkit-line-clamp:2;max-height:2.3em;}' +
    '#rv-lbl-sheets .rv-lbl-s .rv-lbl-prices{margin-top:0.8mm;}' +
    '#rv-lbl-sheets .rv-lbl-s .rv-lbl-old{font-size:9pt;margin-right:2mm;}' +
    '#rv-lbl-sheets .rv-lbl-s .rv-lbl-new{font-size:19pt;}' +
    '#rv-lbl-sheets .rv-lbl-s .rv-lbl-small{font-size:7pt;}' +
    /* Голям: 210 × 148,5 */
    '#rv-lbl-sheets .rv-lbl-b{width:210mm;height:148.5mm;padding:14mm 16mm;}' +
    '#rv-lbl-sheets .rv-lbl-b .rv-lbl-name{font-size:24pt;-webkit-line-clamp:3;max-height:3.45em;}' +
    '#rv-lbl-sheets .rv-lbl-b .rv-lbl-prices{margin-top:5mm;}' +
    '#rv-lbl-sheets .rv-lbl-b .rv-lbl-old{font-size:26pt;}' +
    '#rv-lbl-sheets .rv-lbl-b .rv-lbl-new{font-size:78pt;}' +
    '#rv-lbl-sheets .rv-lbl-b .rv-lbl-small{font-size:15pt;margin-top:1.5mm;}' +
    '#rv-lbl-sheets .rv-lbl-b .rv-lbl-why{font-size:15pt;margin-top:2mm;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-height:2.3em;}' +
    '#rv-lbl-sheets .rv-lbl-cut{position:absolute;left:0;width:210mm;height:0;border-top:0.2mm solid #999;}' +
    '@media screen{#rv-lbl-sheets{background:#e2e8f0;padding:8mm 0;}#rv-lbl-sheets .rv-lbl-page{margin:0 auto 8mm;box-shadow:0 1px 6px rgba(0,0,0,.25);}' +
      '#rv-lbl-sheets .rv-lbl{outline:0.2mm dashed #cbd5e1;}}' +
    '@media print{#rv-lbl-sheets{padding:0;background:none;}#rv-lbl-sheets .rv-lbl-page{margin:0;box-shadow:none;}}';
}
function rvLblCellHtml(kind, x, test){
  if(test) return '';
  var it = x.it;
  var name = '<div class="rv-lbl-name">' + esc(it.product_name || '') + '</div>';
  var prices = '<div class="rv-lbl-prices rv-lbl-line">' +
    (Number(it.std_price) > 0 ? '<span class="rv-lbl-old">' + esc(rvLblMoney(it.std_price)) + '</span>' + (kind === 'big' ? '<br>' : ' ') : '') +
    '<span class="rv-lbl-new">' + esc(rvLblMoney(it.sale_price)) + '</span></div>';
  var code = '<div class="rv-lbl-small rv-lbl-line rv-lbl-code">Код ' + esc(String(it.new_sap_code).trim()) + '</div>';
  var unit = x.unit ? '<div class="rv-lbl-small rv-lbl-line rv-lbl-unit">№ ' + esc(x.unit) + '</div>' : '';
  /* prices_valid_from (25.11.2026); NULL — старите бланки → processed_at */
  var date = rvSub && rvSub.prices_valid_from ? fmtDate(String(rvSub.prices_valid_from).slice(0, 10)) : rvLblDate(rvSub && rvSub.processed_at);
  var when = date ? '<div class="rv-lbl-small rv-lbl-line rv-lbl-date">Преоценка ' + esc(date) + '</div>' : '';
  var why = it.store_comment ? '<div class="rv-lbl-small rv-lbl-why' + (kind === 'small' ? ' rv-lbl-line' : '') + '">' + esc(it.store_comment) + '</div>' : '';
  return name + prices + code + unit + when + why;
}
/* list — [{it, unit}]; start — от кой етикет на първия лист (само малкия);
   test — само рамките на всички клетки на един лист. */
function rvLblPagesHtml(kind, list, start, dx, dy, test){
  var g = RV_LBL[kind] || RV_LBL.small;
  var skip = kind === 'small' && !test ? Math.max(0, Math.min(20, (parseInt(start, 10) || 1) - 1)) : 0;
  var total = test ? g.perPage : skip + list.length;
  var pages = Math.max(1, Math.ceil(total / g.perPage));
  var h = '';
  for(var p = 0; p < pages; p++){
    h += '<div class="rv-lbl-page" data-page="' + (p + 1) + '">';
    if(kind === 'big') h += '<div class="rv-lbl-cut" style="top:' + rvLblMm(g.sy + dy) + ';"></div>';
    for(var s = 0; s < g.perPage; s++){
      var li = p * g.perPage + s - skip;
      if(!test && (li < 0 || li >= list.length)) continue;
      var k = s % g.cols, r = Math.floor(s / g.cols);
      h += '<div class="rv-lbl ' + (kind === 'big' ? 'rv-lbl-b' : 'rv-lbl-s') + (test ? ' rv-lbl-frame' : '') + '" data-slot="' + (s + 1) + '"' +
        ' style="left:' + rvLblMm(g.x0 + k * g.sx + dx) + ';top:' + rvLblMm(g.y0 + r * g.sy + dy) + ';">' +
        rvLblCellHtml(kind, test ? null : list[li], test) + '</div>';
    }
    h += '</div>';
  }
  return { html: h, pages: pages };
}
function rvLblPrint(test){
  var wrap = document.getElementById('mod-print');
  if(!wrap || !document.getElementById('rv-lbl-modal')) return false;
  var kind = (document.getElementById('rv-lbl-kind-big') || {}).checked ? 'big' : 'small';
  var off = rvLblSaveOff();
  var start = Math.max(1, Math.min(21, parseInt(v('rv-lbl-start'), 10) || 1));
  var list = test ? [] : rvLblList(rvLblChecked(), rvLblUnitsChecked());
  if(!test && !list.length){ toast('Не е отметнат нито един ред за етикети', '#dc2626'); return false; }
  var out = rvLblPagesHtml(kind, list, start, off.dx, off.dy, test);
  var title = test ? 'Пробен лист — ' + (kind === 'big' ? 'голям А5' : 'малък 5,8 × 3,9') :
    list.length + ' ' + (list.length === 1 ? 'етикет' : 'етикета') + ' · ' + out.pages + ' ' + (out.pages === 1 ? 'лист' : 'листа');
  wrap.innerHTML = '<style>' + rvLblCss() + '</style>' +
    '<div class="no-print" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;">' +
      '<div style="font-size:16px;font-weight:600;">🏷 Етикети — ' + esc(rvStore) + ' · ' + esc(title) + '</div>' +
      '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай</button>' +
      '<button onclick="rvLblBack()" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Назад</button>' +
      '<div style="font-size:12px;color:#92400e;width:100%;">' + esc(RV_LBL_HINT) + '</div>' +
    '</div>' +
    '<div id="rv-lbl-sheets" data-kind="' + kind + '">' + out.html + '</div>';
  rvLblClose();
  showModule('print');
  return true;
}
/* @page{margin:0} е само за етикетите — махаме го, щом се излезе от печата. */
function rvLblBack(){
  var wrap = document.getElementById('mod-print');
  if(wrap) wrap.innerHTML = '';
  showModule('revaluation');
}

/* ─── Excel — кампания (лист на обект + „Общо") ────────── */
function rvExportCampaign(){
  if(rvRegionalAcc()) return Promise.resolve(false);
  var c = rvCampaign();
  if(!c){ toast('Няма кампания', '#dc2626'); return Promise.resolve(false); }
  return Promise.all([
    sbGetOk('revaluation_submissions', 'campaign_id=eq.' + c.id + '&select=*'),
    sbGetAll('revaluation_items', 'campaign_id=eq.' + c.id + '&select=*&order=store_name.asc,sort_order.asc,id.asc')
  ]).then(function(r){
    if(!r[0].ok || r[1].partial){ toast('Данните за износа са непълни — Excel НЕ е направен', '#dc2626'); return false; }
    /* Само одобрените и обработените — чакащите регионалния не са за Контролинг (13.11.2026). */
    var subs = {}, waiting = 0;
    r[0].rows.forEach(function(s){
      if(s.no_items) return;
      if(s.status === 'approved' || s.status === 'processed') subs[s.id] = s;
      else if(s.status === 'submitted') waiting++;
    });
    var waitTxt = waiting ? ' · ' + waiting + (waiting === 1 ? ' бланка чака' : ' бланки чакат') + ' регионалния — не са включени' : '';
    var byStore = {}, order = [];
    r[1].forEach(function(it){
      if(!subs[it.submission_id]) return;
      if(!byStore[it.store_name]){ byStore[it.store_name] = []; order.push(it.store_name); }
      byStore[it.store_name].push(it);
    });
    if(!order.length){ toast('Няма одобрени бланки с редове' + waitTxt, '#dc2626'); return false; }
    return new Promise(function(resolve){
      rvWithXlsx(function(){
        var wb = XLSX.utils.book_new();
        var used = {};
        /* „Общо" (14.11.2026): без втора „Прехвърлено" — тя вече е в 14-те;
           TOTAL = „Тотал преоценка" (последната колона на реда), същото правило. */
        var total = [RV_EXPORT_HEADERS.concat(['TOTAL'])];
        var sum = 0;
        order.forEach(function(st){
          var nm = String(rvStoreNo(st) || st).slice(0, 31);
          while(used[nm]) nm = (nm + '_').slice(0, 31);
          used[nm] = 1;
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rvExportAoa(st, byStore[st])), nm);
          byStore[st].forEach(function(it){
            var row = rvItemExportRow(st, it);
            var t = row[row.length - 1];
            if(t !== '') sum += t;
            total.push(row.concat([t]));
          });
        });
        var last = new Array(RV_EXPORT_HEADERS.length + 1).fill('');
        last[0] = 'ОБЩО'; last[last.length - 1] = rvRound2(sum);
        total.push(last);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(total), 'Общо');
        XLSX.writeFile(wb, 'preocenka-kampania-' + (c.starts_on || today()) + '.xlsx');
        if(waitTxt) toast('Excel — кампания' + waitTxt, '#d97706');
        resolve(true);
      });
    });
  });
}

/* ═══ ЕТАП 3б: файловете за SAP + регистър + график на кампаниите (15.10.2026) ═══
   MM41 (създаване на преоценените кодове) — шаблон „MM41RAZPR Създаване на
   преоценени кодове.xlsx": точно MATNR, MAKTX, MEINH_01, ENDPR.
     MATNR = преоцененият код; MAKTX = „ПРЕОЦ." + описанието (без интервал,
     както в примера на шаблона), отрязано на 40 знака — SAP реже там;
     MEINH_01 = МЕ по SAP (rvSapUnit); ENDPR = СТАНДАРТНАТА цена на
     оригиналния артикул. Не влизат: повторна преоценка (sap_code
     /^8\d{6}$/), кодове от регистъра revaluation_codes (създадени по-рано),
     дубликати по код. Източник: подадени и обработени бланки на кампанията.
     От 30.10.2026 — по БЛАНКАТА на обекта (rvMm41Collect) и без кодовете от
     product_catalog; регистърът пази и обекта (revaluation_codes.store_name).
   VK11 (цената по обект) — шаблон „Смяна на продажна цена.xlsx": точно
   Материал, МЕ, „Прод,цена нова", „Валидна от", „Валидна до". Датите са
   ИСТИНСКИ дати (Date → Excel сериен номер с формат за дата), „Валидна до" =
   31.12.9999. Ред = всеки ред с new_sap_code и sale_price.
   График на кампаниите — Контролинг въвежда няколко наведнъж; припокриване
   на прозорци с друга кампания → отказ. Обектът вижда САМО активната (днес в
   прозореца); няма ли — „Следваща: …" без бланка. */

var rvCodes = {};            /* new_sap_code → true: регистърът revaluation_codes */
var rvShowSchedule = false;
var rvSchedRows = [];        /* нови редове във формата на графика */
var rvSchedEditId = null;
var rvSchedEdit = null;      /* {from,to,kind,pct,title} на редактираната кампания */
var rvSchedSubs = null;      /* campaign_id → брой бланки; null = не е заредено */
var rvMyCampaignIds = {};    /* обект: кампании, в които СВОЯТА му бланка е submitted / processed */
var RV_MM41_HEADERS = ['MATNR', 'MAKTX', 'MEINH_01', 'ENDPR'];
/* „Обект" след „Валидна до" (30.10.2026, Елица) — първите 5 са точно шаблона. */
var RV_VK11_HEADERS = ['Материал', 'МЕ', 'Прод,цена нова', 'Валидна от', 'Валидна до', 'Обект'];
var RV_TR_HEADERS = ['Основен код', 'Количество', 'Код 8', 'Количество', 'Завод'];
var rvCat = {};              /* new_sap_code → true (в product_catalog) / false; липсва = не е проверен */
var RV_CAT_CHUNK = 100;
var RV_MM41_SHEET = 'MM41RAZPR Създаване на преоцене';  /* както в шаблона (31 знака) */
var RV_VK11_SHEET = 'смяна на продажна цена ';          /* както в шаблона, с интервала */

/* ─── Активна / предстоящи / минали ────────────────────── */
/* Решение А на Тенчо (15.10.2026): обектът вижда активната кампания И всяка
   кампания, в която има своя подадена или обработена бланка — без срок, само
   за четене (rvCanEdit иска активна кампания). Иначе обработеното СЛЕД
   прозореца („Копирай новите кодове") нямаше как да се види. */
function rvStoreCampaigns(){
  return rvCampaigns.filter(function(c){ return rvBucket(c) === 'active' || rvMyCampaignIds[c.id]; })
    .sort(function(a, b){
      var aa = rvBucket(a) === 'active' ? 0 : 1, bb = rvBucket(b) === 'active' ? 0 : 1;
      return aa !== bb ? aa - bb : rvByStart(b, a);
    });
}
function rvBucket(c){
  var t = today();
  if(!c || c.status !== 'open' || c.ends_on < t) return 'past';
  if(c.starts_on > t) return 'upcoming';
  return 'active';
}
function rvByStart(a, b){ return String(a.starts_on).localeCompare(String(b.starts_on)); }
function rvActiveCampaign(){ return rvCampaigns.filter(function(c){ return rvBucket(c) === 'active'; }).sort(rvByStart)[0] || null; }
function rvNextCampaign(){ return rvCampaigns.filter(function(c){ return rvBucket(c) === 'upcoming'; }).sort(rvByStart)[0] || null; }
function rvPickDefaultCampaign(){
  if(rvIsStoreUser()){
    var mine = rvStoreCampaigns();
    if(!mine.some(function(c){ return c.id === rvCampaignId; })) rvCampaignId = mine.length ? mine[0].id : null;
    return;
  }
  if(rvCampaign()) return;
  var pick = rvActiveCampaign() || rvNextCampaign() ||
    rvCampaigns.slice().sort(function(a, b){ return rvByStart(b, a); })[0] || null;
  rvCampaignId = pick ? pick.id : null;
}
function rvCampaignPickerHtml(){
  if(rvIsStoreUser()){
    var a = rvActiveCampaign();
    var mine = rvStoreCampaigns();
    var nextTxt = function(){
      var n = rvNextCampaign();
      return '<span id="rv-next" style="font-size:13px;color:#64748b;">' + (n
        ? 'Следваща: ' + esc((RV_KIND_LABEL[n.kind] || n.kind).toLowerCase()) + ' ' + esc(fmtDate(n.starts_on).slice(0, 5)) + '–' + esc(fmtDate(n.ends_on))
        : 'Няма активна кампания.') + '</span>';
    };
    if(!mine.length) return nextTxt();
    if(mine.length === 1 && a) return '<span id="rv-active" style="font-size:13px;">Кампания: <b>' + esc(rvCampaignLabel(a)) + '</b></span>';
    return '<label style="font-size:12px;color:#64748b;">Кампания</label><select id="rv-campaign" onchange="rvPickCampaign(this.value)" style="min-width:260px;">' +
      mine.map(function(x){
        return '<option value="' + escAttr(x.id) + '"' + (x.id === rvCampaignId ? ' selected' : '') + '>' + esc((rvBucket(x) === 'active' ? '' : '🗄 ') + rvCampaignLabel(x)) + '</option>';
      }).join('') + '</select>' + (a ? '' : ' ' + nextTxt());
  }
  if(!rvCampaigns.length) return '<span style="color:#94a3b8;font-size:13px;">Няма кампании.</span>';
  var h = '<label style="font-size:12px;color:#64748b;">Кампания</label><select id="rv-campaign" onchange="rvPickCampaign(this.value)" style="min-width:260px;">';
  [['active', 'Активна'], ['upcoming', 'Предстоящи'], ['past', 'Минали и затворени']].forEach(function(g){
    var list = rvCampaigns.filter(function(c){ return rvBucket(c) === g[0]; }).sort(g[0] === 'past' ? function(a, b){ return rvByStart(b, a); } : rvByStart);
    if(!list.length) return;
    h += '<optgroup label="' + g[1] + '">' + list.map(function(x){
      return '<option value="' + escAttr(x.id) + '"' + (x.id === rvCampaignId ? ' selected' : '') + '>' + esc(rvCampaignLabel(x)) + '</option>';
    }).join('') + '</optgroup>';
  });
  return h + '</select>';
}

/* ─── График на кампаниите (admin / accounting) ────────── */
function rvSchedBlank(){ return { from: '', to: '', kind: 'mandatory', pct: '', title: '' }; }
function rvDefaultTitle(kind, from){
  var m = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? ' ' + from.slice(5, 7) + '.' + from.slice(0, 4) : '';
  return (kind === 'optional' ? 'Пожелателна' : 'Задължителна') + ' преоценка' + m;
}
function rvToggleSchedule(){
  if(!rvIsCO() || rvRegionalAcc()) return Promise.resolve();
  rvShowSchedule = !rvShowSchedule;
  if(!rvShowSchedule){ rvRender(); return Promise.resolve(); }
  if(!rvSchedRows.length) rvSchedRows = [rvSchedBlank()];
  return rvLoadSchedSubs();
}
function rvLoadSchedSubs(){
  return sbGetAll('revaluation_submissions', 'select=id,campaign_id&order=id.asc').then(function(rows){
    if(rows.partial){ rvSchedSubs = null; toast('Бланките не се прочетоха — изтриването е спряно', '#dc2626'); }
    else { rvSchedSubs = {}; rows.forEach(function(r){ rvSchedSubs[r.campaign_id] = (rvSchedSubs[r.campaign_id] || 0) + 1; }); }
    rvRender();
  });
}
function rvSchedSet(i, f, val){
  if(!rvSchedRows[i]) return;
  rvSchedRows[i][f] = val;
  if(f === 'kind' || f === 'from') rvRender(); /* подсказката за заглавието следва вида и месеца */
}
function rvSchedAddRow(){ rvSchedRows.push(rvSchedBlank()); rvRender(); }
function rvSchedDelRow(i){ rvSchedRows.splice(i, 1); if(!rvSchedRows.length) rvSchedRows.push(rvSchedBlank()); rvRender(); }
/* {body} или {error}. Празен ред (без от/до/заглавие/%) → {skip:true}. */
function rvSchedBody(r){
  if(!r.from && !r.to && !String(r.title || '').trim() && !String(r.pct || '').trim()) return { skip: true };
  if(!r.from || !r.to) return { error: 'липсва от/до' };
  if(r.to < r.from) return { error: '„до" е преди „от" (' + fmtDate(r.from) + ' – ' + fmtDate(r.to) + ')' };
  if(!RV_KIND_LABEL[r.kind]) return { error: 'невалиден вид' };
  var ps = String(r.pct == null ? '' : r.pct).trim();
  var pct = ps === '' ? null : rvNum(ps);
  if(ps !== '' && (pct == null || pct < 0 || pct > 100)) return { error: 'процентът е от 0 до 100' };
  return { body: { title: String(r.title || '').trim() || rvDefaultTitle(r.kind, r.from), kind: r.kind,
    starts_on: r.from, ends_on: r.to, default_pct: pct } };
}
/* Списък с припокриванията: всяко тяло срещу кампаниите в базата (без exceptId)
   и срещу останалите тела. Включително затворените — един прозорец, една кампания. */
function rvOverlaps(bodies, exceptId){
  var out = [];
  var hit = function(a, b){ return a.starts_on <= b.ends_on && b.starts_on <= a.ends_on; };
  var lbl = function(x){ return '„' + x.title + '" ' + fmtDate(x.starts_on).slice(0, 5) + '–' + fmtDate(x.ends_on); };
  bodies.forEach(function(b, i){
    rvCampaigns.forEach(function(c){ if(c.id !== exceptId && hit(b, c)) out.push(lbl(b) + ' × ' + lbl(c)); });
    for(var j = i + 1; j < bodies.length; j++) if(hit(b, bodies[j])) out.push(lbl(b) + ' × ' + lbl(bodies[j]));
  });
  return out;
}
function rvReloadCampaigns(){
  return sbGet('revaluation_campaigns', 'select=*&order=starts_on.desc').then(function(rows){
    rvCampaigns = rvSortCampaigns(Array.isArray(rows) ? rows : []);
    rvPickDefaultCampaign();
  });
}
function rvSchedSave(){
  if(!rvIsCO()) return Promise.resolve(false);
  var bodies = [], errs = [];
  rvSchedRows.forEach(function(r, i){
    var x = rvSchedBody(r);
    if(x.skip) return;
    if(x.error){ errs.push('ред ' + (i + 1) + ': ' + x.error); return; }
    x.body.status = 'open';
    x.body.created_by = currentUser.display_name || currentUser.email;
    bodies.push(x.body);
  });
  if(errs.length){ toast(errs.join('; '), '#dc2626'); return Promise.resolve(false); }
  if(!bodies.length){ toast('Няма попълнени редове', '#dc2626'); return Promise.resolve(false); }
  var ov = rvOverlaps(bodies, null);
  if(ov.length){ toast('Припокриване — нищо не е записано: ' + ov.join('; '), '#dc2626'); return Promise.resolve(false); }
  /* Една заявка за всички: PostgREST записва масива атомарно — или всички, или нито една. */
  return sbPost('revaluation_campaigns', bodies).then(function(res){
    if(!res.ok){ toast('Кампаниите не са записани: ' + sbErrMsg(res), '#dc2626'); return false; }
    rvSchedRows = [rvSchedBlank()];
    toast('Записани ' + bodies.length + (bodies.length === 1 ? ' кампания' : ' кампании'));
    return rvReloadCampaigns().then(function(){ return rvLoadSchedSubs(); }).then(function(){ return true; });
  });
}
function rvSchedOpenEdit(id){
  var c = rvCampaigns.filter(function(x){ return x.id === id; })[0];
  if(!rvIsCO() || !c || rvBucket(c) === 'past') return;
  rvSchedEditId = id;
  rvSchedEdit = { from: c.starts_on, to: c.ends_on, kind: c.kind, pct: c.default_pct == null ? '' : String(c.default_pct), title: c.title };
  rvRender();
}
function rvSchedEditSet(f, val){ if(rvSchedEdit) rvSchedEdit[f] = val; }
function rvSchedCancelEdit(){ rvSchedEditId = null; rvSchedEdit = null; rvRender(); }
function rvSchedSaveEdit(){
  var id = rvSchedEditId;
  var c = rvCampaigns.filter(function(x){ return x.id === id; })[0];
  if(!rvIsCO() || !c || !rvSchedEdit) return Promise.resolve(false);
  var x = rvSchedBody(rvSchedEdit);
  if(x.skip || x.error){ toast(x.error || 'Попълни кампанията', '#dc2626'); return Promise.resolve(false); }
  var ov = rvOverlaps([x.body], id);
  if(ov.length){ toast('Припокриване — нищо не е записано: ' + ov.join('; '), '#dc2626'); return Promise.resolve(false); }
  return sbPatch('revaluation_campaigns', 'id=eq.' + id, x.body).then(function(res){
    if(!res.ok){ toast('Кампанията не е записана: ' + sbErrMsg(res), '#dc2626'); return false; }
    Object.keys(x.body).forEach(function(k){ c[k] = x.body[k]; });
    rvCampaigns = rvSortCampaigns(rvCampaigns);
    rvSchedEditId = null; rvSchedEdit = null;
    toast('Кампанията е обновена');
    rvRender(); return true;
  });
}
/* Изтриване само на кампания БЕЗ бланки. FK от бланките е ON DELETE CASCADE —
   затова броят се чете наново точно преди заявката, не от екрана. */
function rvSchedDelete(id){
  var c = rvCampaigns.filter(function(x){ return x.id === id; })[0];
  if(!rvIsCO() || !c) return Promise.resolve(false);
  return sbGetOk('revaluation_submissions', 'campaign_id=eq.' + id + '&select=id&limit=1').then(function(res){
    if(!res.ok){ toast('Бланките не се прочетоха — кампанията НЕ е изтрита', '#dc2626'); return false; }
    if(res.rows.length){ toast('„' + c.title + '" има бланки — не може да се изтрие', '#dc2626'); return false; }
    if(!confirm('Изтриване на кампания „' + c.title + '" (' + fmtDate(c.starts_on) + ' – ' + fmtDate(c.ends_on) + ')?')) return false;
    return sbDelete('revaluation_campaigns', 'id=eq.' + id).then(function(d){
      if(!d.ok || d.count === 0){ toast(d.ok ? 'Кампанията не е изтрита (0 реда)' : 'Кампанията не е изтрита: ' + sbErrMsg(d), '#dc2626'); return false; }
      rvCampaigns = rvCampaigns.filter(function(x){ return x.id !== id; });
      if(rvCampaignId === id){ rvCampaignId = null; rvPickDefaultCampaign(); }
      toast('Кампанията е изтрита');
      rvRender(); return true;
    });
  });
}
function rvScheduleHtml(){
  var h = '<div id="rv-schedule" style="margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">';
  h += '<div style="font-weight:700;margin-bottom:6px;">📅 График на кампаниите</div>';
  /* нови редове */
  rvSchedRows.forEach(function(r, i){
    h += '<div class="rv-s-row" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;">' +
      '<input id="rv-s-from-' + i + '" type="date" value="' + escAttrVal(r.from) + '" data-i="' + i + '" onchange="rvSchedSet(+this.dataset.i,\'from\',this.value)">' +
      '<input id="rv-s-to-' + i + '" type="date" value="' + escAttrVal(r.to) + '" data-i="' + i + '" onchange="rvSchedSet(+this.dataset.i,\'to\',this.value)">' +
      '<select id="rv-s-kind-' + i + '" data-i="' + i + '" onchange="rvSchedSet(+this.dataset.i,\'kind\',this.value)">' +
      ['mandatory', 'optional'].map(function(k){ return '<option value="' + k + '"' + (r.kind === k ? ' selected' : '') + '>' + RV_KIND_LABEL[k] + '</option>'; }).join('') + '</select>' +
      '<input id="rv-s-pct-' + i + '" type="text" inputmode="decimal" placeholder="%" value="' + escAttrVal(r.pct) + '" data-i="' + i + '" onchange="rvSchedSet(+this.dataset.i,\'pct\',this.value)" style="width:56px;">' +
      '<input id="rv-s-title-' + i + '" type="text" placeholder="' + escAttr(rvDefaultTitle(r.kind, r.from)) + '" value="' + escAttrVal(r.title) + '" data-i="' + i + '" onchange="rvSchedSet(+this.dataset.i,\'title\',this.value)" style="width:240px;">' +
      '<button class="btn-sm" data-i="' + i + '" onclick="rvSchedDelRow(+this.dataset.i)" title="Махни реда">–</button></div>';
  });
  h += '<div style="display:flex;gap:6px;margin:6px 0 10px;"><button class="btn-sm" onclick="rvSchedAddRow()">＋ Ред</button>' +
    '<button class="btn-sm" onclick="rvSchedSave()" style="background:#2563eb;color:#fff;">Запази всички</button></div>';
  /* съществуващите */
  [['active', 'Активна'], ['upcoming', 'Предстоящи'], ['past', 'Минали и затворени']].forEach(function(g){
    var list = rvCampaigns.filter(function(c){ return rvBucket(c) === g[0]; }).sort(g[0] === 'past' ? function(a, b){ return rvByStart(b, a); } : rvByStart);
    if(!list.length) return;
    h += '<div style="font-size:12px;font-weight:700;color:#475569;margin-top:6px;">' + g[1] + '</div>';
    list.forEach(function(c){
      if(rvSchedEditId === c.id && rvSchedEdit){
        var e = rvSchedEdit;
        h += '<div id="rv-sched-' + escAttr(c.id) + '" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 0;">' +
          '<input id="rv-se-from" type="date" value="' + escAttrVal(e.from) + '" onchange="rvSchedEditSet(\'from\',this.value)">' +
          '<input id="rv-se-to" type="date" value="' + escAttrVal(e.to) + '" onchange="rvSchedEditSet(\'to\',this.value)">' +
          '<select id="rv-se-kind" onchange="rvSchedEditSet(\'kind\',this.value)">' +
          ['mandatory', 'optional'].map(function(k){ return '<option value="' + k + '"' + (e.kind === k ? ' selected' : '') + '>' + RV_KIND_LABEL[k] + '</option>'; }).join('') + '</select>' +
          '<input id="rv-se-pct" type="text" value="' + escAttrVal(e.pct) + '" onchange="rvSchedEditSet(\'pct\',this.value)" style="width:56px;">' +
          '<input id="rv-se-title" type="text" value="' + escAttrVal(e.title) + '" onchange="rvSchedEditSet(\'title\',this.value)" style="width:240px;">' +
          '<button class="btn-sm" onclick="rvSchedSaveEdit()" style="background:#2563eb;color:#fff;">Запази</button>' +
          '<button class="btn-sm" onclick="rvSchedCancelEdit()">Откажи</button></div>';
        return;
      }
      var n = rvSchedSubs ? (rvSchedSubs[c.id] || 0) : null;
      h += '<div id="rv-sched-' + escAttr(c.id) + '" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:3px 0;font-size:13px;">' +
        '<span>' + esc(rvCampaignLabel(c)) + '</span>' +
        '<span style="color:#94a3b8;font-size:11px;">' + (n == null ? '' : n + (n === 1 ? ' бланка' : ' бланки')) + '</span>' +
        (g[0] !== 'past' ? '<button class="btn-sm" data-id="' + escAttr(c.id) + '" onclick="rvSchedOpenEdit(this.dataset.id)" title="Редактирай">✏️</button>' : '') +
        (n === 0 ? '<button class="btn-sm" data-id="' + escAttr(c.id) + '" onclick="rvSchedDelete(this.dataset.id)" title="Изтрий">🗑</button>' : '') +
        '</div>';
    });
  });
  return h + '</div>';
}

/* ─── Регистър на създадените кодове ───────────────────── */
function rvLoadCodes(){
  return sbGetAll('revaluation_codes', 'select=new_sap_code&order=new_sap_code.asc').then(function(rows){
    rvCodes = {};
    rows.forEach(function(r){ rvCodes[r.new_sap_code] = true; });
    if(rows.partial) toast('Регистърът на кодовете не се прочете изцяло', '#dc2626');
    return rows;
  });
}
/* Каталогът (107 хил. реда) НЕ се чете цял — само дадените кодове, на порции
   по RV_CAT_CHUNK през in.(…), и само непроверените. Код, който не прилича на
   SAP код, не може да е в каталога → false без заявка. {ok:false} = порция
   падна; кодовете от нея остават непроверени (30.10.2026). */
function rvLoadCat(codes){
  var todo = [], seen = {};
  (codes || []).forEach(function(x){
    var c = String(x == null ? '' : x).trim();
    if(!c || seen[c] || rvCat[c] !== undefined) return;
    seen[c] = 1;
    if(/^[0-9A-Za-z_-]+$/.test(c)) todo.push(c); else rvCat[c] = false;
  });
  var chunks = [];
  for(var i = 0; i < todo.length; i += RV_CAT_CHUNK) chunks.push(todo.slice(i, i + RV_CAT_CHUNK));
  return Promise.all(chunks.map(function(ch){
    return sbGetOk('product_catalog', 'sap_code=in.(' + ch.join(',') + ')&select=sap_code').then(function(res){
      if(!res.ok) return false;
      var found = {};
      res.rows.forEach(function(r){ found[String(r.sap_code)] = 1; });
      ch.forEach(function(c){ rvCat[c] = !!found[c]; });
      return true;
    });
  })).then(function(oks){ return { ok: oks.every(function(x){ return x; }) }; });
}
/* „в SAP" = в регистъра ИЛИ в каталога; „за създаване" само ако каталогът е
   проверен и го няма. Непроверен код (паднала заявка) → без бадж. */
function rvCodeBadge(it){
  if(!rvIsCoViewer()) return '';
  var code = String(it.new_sap_code || '').trim();
  if(!code || rvIsRepeat(it.sap_code)) return '';
  if(rvCodes[code] || rvCat[code] === true) return '<span class="rv-in-sap" style="background:#dcfce7;color:#166534;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;">в SAP</span>';
  if(rvCat[code] === false) return '<span class="rv-to-create" style="background:#ffedd5;color:#9a3412;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;">за създаване</span>';
  return '';
}

/* ─── MM41 (по бланката на обекта, 30.10.2026) ─────────── */
/* Чете НАНОВО бланката, редовете ѝ, регистъра и каталога за кандидатите
   (не вярва на екрана) и връща {ok:true, rows:[…]} или {ok:false}. Не влизат:
   повторна преоценка, код в регистъра, код в каталога, дубликат. */
function rvMm41Collect(){
  var c = rvCampaign();
  if(!c || !rvSub) return Promise.resolve({ ok: false });
  var store = rvStore;
  return Promise.all([
    sbGetOk('revaluation_submissions', 'id=eq.' + rvSub.id + '&select=id,status,no_items'),
    sbGetAll('revaluation_items', 'submission_id=eq.' + rvSub.id + '&select=*&order=sort_order.asc,id.asc'),
    rvLoadCodes()
  ]).then(function(r){
    if(!r[0].ok || r[1].partial || r[2].partial) return { ok: false };
    var s = r[0].rows[0];
    if(!s || s.no_items || (s.status !== 'approved' && s.status !== 'processed')) return { ok: true, rows: [] };
    var cand = r[1].filter(function(it){
      var code = String(it.new_sap_code || '').trim();
      return code && !rvIsRepeat(it.sap_code) && !rvCodes[code];
    });
    return rvLoadCat(cand.map(function(it){ return it.new_sap_code; })).then(function(cat){
      if(!cat.ok) return { ok: false };
      var seen = {}, rows = [];
      cand.forEach(function(it){
        var code = String(it.new_sap_code).trim();
        if(rvCat[code] !== false || seen[code]) return;
        seen[code] = 1;
        var su = rvSapUnit(it.unit);
        rows.push({ new_sap_code: code, sap_code: String(it.sap_code), maktx: ('ПРЕОЦ.' + String(it.product_name || '').trim()).slice(0, 40),
          unit: su.unit, unitOk: su.ok, std: it.std_price == null ? null : Number(it.std_price), campaign_id: c.id, store_name: store });
      });
      return { ok: true, rows: rows };
    });
  });
}
/* Име на файл с обекта и кампанията: без знаците, които Windows не позволява. */
function rvFileName(prefix){
  var c = rvCampaign(), no = rvStoreNo(rvStore);
  var part = function(s){ return String(s || '').replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_'); };
  return prefix + '-' + (no ? no + '-' : '') + part(rvStore) + '-' + part((c && c.title) || (c && c.starts_on) || today()) + '.xlsx';
}
function rvMm41Aoa(rows){
  return [RV_MM41_HEADERS.slice()].concat(rows.map(function(x){ return [x.new_sap_code, x.maktx, x.unit, x.std == null ? '' : x.std]; }));
}
function rvMm41(){
  if(!rvIsCO() || rvRegionalAcc()) return Promise.resolve(false);
  return rvMm41Collect().then(function(res){
    if(!res.ok){ toast('Данните са непълни — MM41 НЕ е направен', '#dc2626'); return false; }
    if(!res.rows.length){ toast('Няма нови кодове за MM41'); return false; }
    var bad = res.rows.filter(function(x){ return !x.unitOk; }).map(function(x){ return x.new_sap_code + ' (' + (x.unit || 'празна') + ')'; });
    var noStd = res.rows.filter(function(x){ return x.std == null; }).map(function(x){ return x.new_sap_code; });
    return new Promise(function(resolve){
      rvWithXlsx(function(){
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rvMm41Aoa(res.rows)), RV_MM41_SHEET);
        XLSX.writeFile(wb, rvFileName('MM41'));
        var w = [];
        if(bad.length) w.push('МЕ не е по SAP: ' + bad.join(', '));
        if(noStd.length) w.push('без стандартна цена: ' + noStd.join(', '));
        toast('MM41: ' + res.rows.length + ' кода' + (w.length ? ' · ' + w.join(' · ') : ''), w.length ? '#d97706' : undefined);
        resolve(true);
      });
    });
  });
}
function rvMm41Done(){
  if(!rvIsCO() || rvRegionalAcc()) return Promise.resolve(false);
  return rvMm41Collect().then(function(res){
    if(!res.ok){ toast('Данните са непълни — нищо не е записано', '#dc2626'); return false; }
    if(!res.rows.length){ toast('Няма нови кодове за MM41'); return false; }
    if(!confirm('Да се запишат ' + res.rows.length + ' кода като създадени в SAP? Следващият MM41 няма да ги съдържа.')) return false;
    var who = currentUser.display_name || currentUser.email;
    var bodies = res.rows.map(function(x){
      return { new_sap_code: x.new_sap_code, sap_code: x.sap_code, product_name: x.maktx, unit: x.unit, std_price: x.std, campaign_id: x.campaign_id, store_name: x.store_name, created_by: who };
    });
    return sbPost('revaluation_codes', bodies).then(function(p){
      if(!p.ok){ toast('Кодовете НЕ са записани: ' + sbErrMsg(p), '#dc2626'); return false; }
      bodies.forEach(function(b){ rvCodes[b.new_sap_code] = true; });
      toast('Записани ' + bodies.length + ' кода в регистъра');
      rvRender(); return true;
    });
  });
}

/* ─── VK11 (цената по обект) ───────────────────────────── */
function rvVk11Aoa(items, fromIso, store){
  var p = fromIso.split('-');
  var from = new Date(+p[0], +p[1] - 1, +p[2]);
  var to = new Date(9999, 11, 31);
  return [RV_VK11_HEADERS.slice()].concat(items.filter(function(it){
    return String(it.new_sap_code || '').trim() && it.sale_price != null && it.sale_price !== '';
  }).map(function(it){
    /* Цената остава ЧИСЛО — точка/запетая е настройка на Excel-а, не на файла. */
    return [String(it.new_sap_code).trim(), rvSapUnit(it.unit).unit, Number(it.sale_price), from, to, store || ''];
  }));
}
/* → Promise<bool> от 25.11.2026 (пазачът чете свежо от базата). */
function rvVk11(){
  if(!rvIsCO() || !rvCoReady()) return Promise.resolve(false);
  var fromIso = v('rv-vk-from') || today();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fromIso)){ toast('Невалидна дата „Валидна от"', '#dc2626'); return Promise.resolve(false); }
  var aoa = rvVk11Aoa(rvSub.no_items ? [] : rvItems, fromIso, rvStore);
  if(aoa.length < 2){ toast('Няма редове с преоценен код и цена — VK11 НЕ е направен', '#dc2626'); return Promise.resolve(false); }
  rvBad = {};
  var saved = rvSub.status === 'processed' && rvSub.prices_valid_from ? String(rvSub.prices_valid_from).slice(0, 10) : '';
  var warn = saved && saved !== fromIso ? '„Валидна от" ' + fmtDate(fromIso) + ' се различава от записаната ' + fmtDate(saved) : '';
  return rvCoCodePriceCheck('VK11 НЕ е направен').then(function(okCodes){ return okCodes ? rvVk11Write(aoa, fromIso, warn) : false; });
}
function rvVk11Write(aoa, fromIso, warn){
  var no = rvStoreNo(rvStore);
  /* МЕ не по SAP — предупреждение като при MM41, файлът пак се прави (20.10.2026).
     rvSapUnit е идемпотентна: SAP стойност остава ок, несведената — не. */
  var bad = aoa.slice(1).filter(function(r){ return !rvSapUnit(r[1]).ok; }).map(function(r){ return r[0] + ' (' + (r[1] || 'празна') + ')'; });
  rvWithXlsx(function(){
    var wb = XLSX.utils.book_new();
    /* Date клетка → Excel сериен номер с формат за дата (като в шаблона), не текст.
       Точките са екранирани: SheetJS 0.18.5 отказва неекранирана точка („bad second format: .“). */
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { dateNF: 'dd"."mm"."yyyy' }), RV_VK11_SHEET);
    XLSX.writeFile(wb, 'VK11-' + (no || 'obekt') + '-' + fromIso + '.xlsx');
    toast('VK11: ' + (aoa.length - 1) + ' реда' + (bad.length ? ' · МЕ не е по SAP: ' + bad.join(', ') : '') + (warn ? ' · ' + warn : ''), bad.length || warn ? '#d97706' : undefined);
  });
  return true;
}

/* ─── Прехвърляне (30.10.2026, Елица) ──────────────────── */
/* Ред на всеки ред с new_sap_code и co_qty > 0: основен код → код 8, двете
   количества = co_qty. Завод = minus_plants.plant с role 'наличност' за
   обекта; няма ли (Пазарджик, Сервиз Троян, складовете) — празна клетка и
   жълто предупреждение, файлът пак се прави. Повторно преоценен код НЕ влиза
   (14.11.2026, Елица — там се сменя само цената; до тогава излизаше
   8086397 → 8086397). */
function rvTransferAoa(items, plant){
  return [RV_TR_HEADERS.slice()].concat(items.filter(function(it){
    return String(it.new_sap_code || '').trim() && Number(it.co_qty) > 0 && !rvIsRepeat(it.sap_code);
  }).map(function(it){
    var q = Number(it.co_qty);
    return [String(it.sap_code == null ? '' : it.sap_code).trim(), q, String(it.new_sap_code).trim(), q, plant || ''];
  }));
}
function rvTransfer(){
  if(!rvIsCO() || !rvCoReady()) return Promise.resolve(false);
  var aoa = rvTransferAoa(rvSub.no_items ? [] : rvItems, '');
  if(aoa.length < 2){ toast('Няма редове с преоценен код и прехвърлено количество — файлът НЕ е направен', '#dc2626'); return Promise.resolve(false); }
  var store = rvStore;
  return sbGetOk('minus_plants', 'store_name=eq.' + encodeURIComponent(store) + '&role=eq.' + encodeURIComponent('наличност') + '&select=plant,store_name,role').then(function(res){
    if(!res.ok){ toast('Заводите не се прочетоха — файлът НЕ е направен', '#dc2626'); return false; }
    var row = res.rows.filter(function(r){ return r.store_name === store && r.role === 'наличност'; })[0];
    var plant = row ? String(row.plant) : '';
    aoa = rvTransferAoa(rvItems, plant);
    return new Promise(function(resolve){
      rvWithXlsx(function(){
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Прехвърляне');
        XLSX.writeFile(wb, rvFileName('Prehvarlyane'));
        toast('Прехвърляне: ' + (aoa.length - 1) + ' реда' + (plant ? ' · завод ' + plant : ' · няма завод „наличност" за ' + store + ' — колоната „Завод" е празна'), plant ? undefined : '#d97706');
        resolve(true);
      });
    });
  });
}

/* ═══ „📁 История" за ЦО (16.10.2026) ═══════════════════════════════════════
   Дърво като папки: Година → Кампания → Обект. Клик на папка само разгъва /
   свива (rvHistToggle); клик на обект отваря СЪЩИЯ лист като от обзора
   (rvPickCampaign + rvCoOpenStore). Данни: rvCampaigns (вече заредени) +
   ЕДНА заявка за всички бланки и ЕДНА за id-тата на редовете (броят по
   submission_id се смята тук, без N заявки). Непълни данни → червен toast,
   дървото не се показва. Нищо ново в схемата. */
var rvHistOpen = false;
var rvHistExp = {};        /* 'y:2026' / 'c:<campaign_id>' → разгъната */
var rvHistSubs = null;     /* бланките; null = не са заредени / непълни */
var rvHistCounts = {};     /* submission_id → брой редове */
var rvHistSeq = 0;

function rvHistOpenView(){
  if(!rvIsCoViewer()) return Promise.resolve(false);
  rvHistOpen = true; rvCoOpen = false;
  var seq = ++rvHistSeq;
  rvHistSubs = null;
  return Promise.all([
    sbGetAll('revaluation_submissions', 'select=id,campaign_id,store_name,status,no_items,submitted_at,approved_at,approved_by,processed_at,processed_by,prices_valid_from&order=store_name.asc,id.asc'),
    sbGetAll('revaluation_items', 'select=id,submission_id&order=id.asc')
  ]).then(function(r){
    if(seq !== rvHistSeq) return false;
    if(r[0].partial || r[1].partial){
      toast('Историята не се зареди изцяло — дървото не е показано', '#dc2626');
      rvHistSubs = null; rvRender(); return false;
    }
    var hreg = rvRegionalAcc() ? rvRegionStores() : null;
    rvHistSubs = hreg ? r[0].filter(function(sb){ return hreg.indexOf(sb.store_name) >= 0; }) : r[0];
    rvHistCounts = {};
    r[1].forEach(function(it){ rvHistCounts[it.submission_id] = (rvHistCounts[it.submission_id] || 0) + 1; });
    /* по подразбиране е разгъната последната година */
    var years = rvHistYears();
    if(years.length && !Object.keys(rvHistExp).some(function(k){ return k.indexOf('y:') === 0; })) rvHistExp['y:' + years[0]] = true;
    rvRender(); return true;
  });
}
function rvHistClose(){ rvHistOpen = false; return rvLoadOverview(); }
function rvHistToggle(key){ rvHistExp[key] = !rvHistExp[key]; rvRender(); }
function rvHistOpenStore(campaignId, store){
  rvHistOpen = false;
  return rvPickCampaign(campaignId).then(function(){ return rvCoOpenStore(store); });
}
function rvHistYears(){
  var y = {};
  rvCampaigns.forEach(function(c){ if(c.starts_on) y[String(c.starts_on).slice(0, 4)] = 1; });
  return Object.keys(y).sort().reverse();
}
function rvHistCampaignState(c){
  var b = rvBucket(c);
  return b === 'active' ? 'активна' : b === 'upcoming' ? 'предстояща' : (c.status === 'closed' ? 'затворена' : 'изтекла');
}
function rvHistHtml(){
  if(!rvHistSubs) return '<div class="card" id="rv-hist" style="color:#94a3b8;">⏳ Зареждане на историята…</div>';
  var COL = RV_ST_COL;
  var subsBy = {};
  rvHistSubs.forEach(function(sb){ (subsBy[sb.campaign_id] = subsBy[sb.campaign_id] || []).push(sb); });
  var ROW = 'cursor:pointer;padding:4px 6px;border-radius:6px;';
  var h = '<div class="card" id="rv-hist"><div style="font-weight:700;margin-bottom:6px;">📁 История на преоценките</div>';
  var years = rvHistYears();
  if(!years.length) h += '<div style="color:#94a3b8;">Няма кампании.</div>';
  years.forEach(function(y){
    var yk = 'y:' + y, yOpen = !!rvHistExp[yk];
    var camps = rvCampaigns.filter(function(c){ return String(c.starts_on).slice(0, 4) === y; })
      .sort(function(a, b){ return String(b.starts_on).localeCompare(String(a.starts_on)); });
    h += '<div id="rv-hist-y-' + y + '" data-k="' + yk + '" onclick="rvHistToggle(this.dataset.k)" style="' + ROW + 'font-weight:700;">' +
      (yOpen ? '▾ ' : '▸ ') + '📁 ' + y + ' <span style="color:#94a3b8;font-weight:400;font-size:12px;">(' + camps.length + ')</span></div>';
    if(!yOpen) return;
    camps.forEach(function(c){
      var ck = 'c:' + c.id, cOpen = !!rvHistExp[ck];
      var list = subsBy[c.id] || [];
      var done = list.filter(function(sb){ return sb.status === 'processed'; }).length;
      h += '<div id="rv-hist-c-' + escAttr(c.id) + '" data-k="' + escAttr(ck) + '" onclick="rvHistToggle(this.dataset.k)" style="' + ROW + 'margin-left:18px;">' +
        (cOpen ? '▾ ' : '▸ ') + '📁 ' + esc(c.title) + ' · ' + esc(fmtDate(c.starts_on).slice(0, 5)) + '–' + esc(fmtDate(c.ends_on)) + ' · ' +
        esc((RV_KIND_LABEL[c.kind] || c.kind).toLowerCase()) + ' · ' + esc(rvHistCampaignState(c)) + ' ' +
        (list.length
          ? '<span class="rv-hist-cnt" style="background:#f1f5f9;color:#475569;border-radius:20px;padding:1px 8px;font-size:11px;">' + list.length + (list.length === 1 ? ' обект' : ' обекта') + ' · ' + done + ' обработени</span>'
          : '<span class="rv-hist-cnt" style="color:#94a3b8;font-size:12px;">(няма подадени)</span>') + '</div>';
      if(!cOpen) return;
      list.forEach(function(sb){
        var st = rvCoStatus(sb);
        var n = rvHistCounts[sb.id] || 0;
        var tail = sb.no_items ? ' · нямаме за преоценка'
          : ' · ' + n + (n === 1 ? ' ред' : ' реда') + (sb.status === 'processed' && sb.processed_at
            ? ' · обработена ' + esc(fmtDate(String(sb.processed_at).slice(0, 10))) + (sb.processed_by ? ' от ' + esc(sb.processed_by) : '') +
              (sb.prices_valid_from ? ' · <span class="rv-hist-vf">цените от ' + esc(fmtDate(String(sb.prices_valid_from).slice(0, 10))) + '</span>' : '') : '');
        h += '<div class="rv-hist-s" id="rv-hist-s-' + escAttr(sb.id) + '" data-c="' + escAttr(c.id) + '" data-s="' + escAttr(sb.store_name) + '" onclick="rvHistOpenStore(this.dataset.c,this.dataset.s)" style="' + ROW + 'margin-left:40px;">' +
          '📄 <b>' + esc(sb.store_name) + '</b> · <span class="rv-hist-st" style="color:' + COL[st.key] + ';font-weight:600;">' + esc(st.key === 'draft' ? 'чернова' : st.txt) + '</span>' + tail + '</div>';
      });
    });
  });
  return h + '</div>';
}
