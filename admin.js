/* admin.js — Администрация (само за роля admin) */

function loadAdmin(){
  loadStoresAdmin();
  loadUsersAdmin();
  loadRestrictionsAdmin();
  loadCatalogAdmin();
  loadNotificationsAdmin();
  /* Backup секция — само за admin */
  if(currentUser && currentUser.role==='admin'){
    var backupContainer=document.getElementById('backup-admin-section');
    if(backupContainer) backupContainer.innerHTML=renderBackupSection();
    setTimeout(loadBackupAdmin, 500);
  }
}

/* ══════════════════════════════════════════
   МАГАЗИНИ
══════════════════════════════════════════ */

function loadStoresAdmin(){
  sbGet('stores','order=name').then(function(data){
    var body=document.getElementById('stores-body');if(!body)return;
    var list=Array.isArray(data)?data:[];
    if(!list.length){body.innerHTML='<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8;">Няма магазини.</td></tr>';return;}
    body.innerHTML=list.map(function(s){
      return '<tr>'+
        '<td style="font-weight:500;">'+esc(s.name)+'</td>'+
        '<td>'+esc(s.city||s.addr||'')+'</td>'+
        '<td><button onclick="deleteStore(\''+s.id+'\',\''+esc(s.name)+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">× Изтрий</button></td>'+
      '</tr>';
    }).join('');
  });
}

function addStore(){
  var name=v('new-store-name'),city=v('new-store-city');
  if(!name){toast('Въведи название','#dc2626');return;}
  sbPost('stores',{name:name,city:city,active:true}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    document.getElementById('new-store-name').value='';
    document.getElementById('new-store-city').value='';
    logAudit('store_added',{details:{name:name,city:city}});
    invalidateStoreCaches();
    toast('✓ Магазинът е добавен');loadStoresAdmin();
  });
}

function deleteStore(id,name){
  if(!confirm('Изтрий магазина?'))return;
  sbDelete('stores','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('deleteStore: магазинът НЕ беше изтрит',id,res.error);
      toast('⚠️ Магазинът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadStoresAdmin(); return;
    }
    /* count===0 значи, че заявката е минала, но не е засегнала нито един ред
       (двойно кликване, вече изтрит от друг). Не е грешка. */
    if(res.count===0){
      toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b');
      loadStoresAdmin(); return;
    }
    /* Одитът се пише САМО след потвърдено изтриване — иначе логът твърди
       "магазинът е изтрит" за нещо, което не е станало. */
    logAudit('store_deleted',{details:{id:id,name:name}});
    invalidateStoreCaches();
    toast('✓ Изтрит');loadStoresAdmin();
  });
}

/* ══════════════════════════════════════════
   ПОТРЕБИТЕЛИ — СПИСЪК
══════════════════════════════════════════ */

function loadUsersAdmin(){
  sbGet('users','order=role,email&select=id,email,display_name,store_name,role,active,assigned_stores,oborot_report,is_regional,notify_groups').then(function(data){
    var body=document.getElementById('users-body');if(!body)return;
    var list=Array.isArray(data)?data:[];
    /* colspan = броят клетки в РЕДА, не в заглавието: последната колона
       (действията) е без <th>, затова 8, а не 7. Разминаване тук оставя
       празната таблица със стеснен ред, който изглежда счупен. */
    if(!list.length){body.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8;">Няма потребители.</td></tr>';return;}
    var roleBg={manager:'#dbeafe',sklad:'#dcfce7',kasa:'#fef9c3',accounting:'#f3e8ff',admin:'#fee2e2',logistics:'#ffedd5',info:'#f1f5f9',supply:'#fce7f3',marketing:'#ecfdf5',user:'#f8fafc'};
    body.innerHTML=list.map(function(u){
      var stores=u.assigned_stores;
      var storesStr='—';
      if(Array.isArray(stores)&&stores.length)storesStr=stores.join(', ');
      else if(typeof stores==='string'&&stores.length>2)storesStr=stores.replace(/^{|}$/g,'');
      var isGlobalRole=['admin','accounting','logistics','supply','marketing'].indexOf(u.role)>=0;
      return '<tr>'+
        '<td>'+esc(u.email)+'</td>'+
        '<td>'+esc(u.display_name||'')+'</td>'+
        '<td>'+esc(u.store_name||'')+'</td>'+
        /* Баджът „РЕГ." стои ДО ролята нарочно: is_regional не се извежда от
           нея (В. Филев е admin и регионален; счетоводството не е), а колоната
           „оборот имейл" отдясно е трето, независимо нещо. Трите се четат
           наведнъж, за да не се бъркат. */
        '<td style="white-space:nowrap;"><span style="background:'+(roleBg[u.role]||'#f3f4f6')+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+esc(u.role)+'</span>'+
          (u.is_regional?'<span title="Регионален мениджър" style="background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;margin-left:4px;">РЕГ.</span>':'')+
        '</td>'+
        '<td style="font-size:11px;color:#64748b;">'+
          (isGlobalRole
            ? '<span style="color:'+(storesStr==='—'?'#16a34a':'#2563eb')+';">'+(storesStr==='—'?'Всички магазини':esc(storesStr))+'</span>'+
              ' <button onclick="editAssigned(\''+u.id+'\',\''+esc(u.display_name||u.email)+'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:1px 7px;font-size:10px;cursor:pointer;margin-left:4px;">✏️</button>'
            : esc(u.store_name||'—'))+
        '</td>'+
        '<td style="font-size:11px;color:#64748b;white-space:nowrap;">'+
          '<span style="color:'+(u.oborot_report?'#2563eb':'#94a3b8')+';">'+oborotReportLabel(u.oborot_report)+'</span>'+
          ' <button onclick="editOborotReport(\''+u.id+'\',\''+esc(u.display_name||u.email)+'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:1px 7px;font-size:10px;cursor:pointer;margin-left:4px;">✏️</button>'+
        '</td>'+
        '<td style="font-size:11px;white-space:nowrap;">'+
          notifyGroupsCell(u)+
          ' <button onclick="editNotifyGroups(\''+u.id+'\',\''+esc(u.display_name||u.email)+'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:1px 7px;font-size:10px;cursor:pointer;margin-left:4px;">✏️</button>'+
        '</td>'+
        '<td style="white-space:nowrap;">'+
          '<button onclick="openUserModal(\''+u.id+'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;margin-right:4px;">✏️</button>'+
          '<button onclick="deleteUser(\''+u.id+'\',\''+esc(u.email)+'\')" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button>'+
        '</td>'+
      '</tr>';
    }).join('');
  });
}

var _assignedEditUserId = null;
var _assignedEditUserName = null;

function editAssigned(userId, userName){
  _assignedEditUserId = userId;
  _assignedEditUserName = userName;
  sbGet('users','id=eq.'+userId+'&select=assigned_stores').then(function(data){
    var current = (Array.isArray(data) && data[0]) ? data[0].assigned_stores : null;
    var currentList = [];
    if (Array.isArray(current)) currentList = current;
    else if (typeof current==='string' && current.length>2) {
      try { currentList = current.replace(/^{|}$/g,'').split(',').map(function(s){return s.trim().replace(/^"|"$/g,'');}); } catch(e){}
    }
    sbGet('stores','order=name&select=name').then(function(storesData){
      var allStores = (Array.isArray(storesData)?storesData:[]).map(function(s){return s.name;});
      _renderAssignedModal(userName, allStores, currentList);
    });
  });
}

function _renderAssignedModal(userName, allStores, currentList){
  var old = document.getElementById('assigned-modal-ov');
  if (old) old.remove();

  var noneChecked = currentList.length === 0;
  var html = '<div class="bov open" id="assigned-modal-ov" onclick="if(event.target===this)closeAssignedModal()">' +
    '<div class="bmod" style="width:420px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;">🏪 Магазини за '+esc(userName)+'</div>' +
    '<button onclick="closeAssignedModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>' +
    '</div>' +
    '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:'+(noneChecked?'#f0fdf4':'#f8fafc')+';border-radius:8px;margin-bottom:10px;cursor:pointer;font-weight:600;font-size:13px;">' +
    '<input type="checkbox" id="assigned-all" '+(noneChecked?'checked':'')+' onchange="_toggleAssignedAll()"> ✅ Вижда ВСИЧКИ магазини (без ограничение)' +
    '</label>' +
    '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin:10px 0 6px;">или избери конкретни:</div>' +
    '<div id="assigned-store-list" style="max-height:280px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px;">' +
    allStores.map(function(name){
      var checked = currentList.indexOf(name) >= 0;
      return '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;cursor:pointer;">' +
        '<input type="checkbox" class="assigned-store-cb" value="'+esc(name)+'" '+(checked?'checked':'')+' onchange="_uncheckAssignedAll()"> '+esc(name) +
        '</label>';
    }).join('') +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeAssignedModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitAssigned()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function _toggleAssignedAll(){
  var all = document.getElementById('assigned-all').checked;
  if (all) document.querySelectorAll('.assigned-store-cb').forEach(function(cb){ cb.checked = false; });
}
function _uncheckAssignedAll(){
  var anyChecked = Array.from(document.querySelectorAll('.assigned-store-cb')).some(function(cb){ return cb.checked; });
  if (anyChecked) document.getElementById('assigned-all').checked = false;
}

function closeAssignedModal(){
  var ov = document.getElementById('assigned-modal-ov');
  if (ov) ov.remove();
  _assignedEditUserId = null;
  _assignedEditUserName = null;
}

function submitAssigned(){
  var wantsAll = document.getElementById('assigned-all').checked;
  var selected = Array.from(document.querySelectorAll('.assigned-store-cb')).filter(function(cb){return cb.checked;}).map(function(cb){return cb.value;});
  var payload = wantsAll ? {assigned_stores: null} : {assigned_stores: selected.length ? selected : null};
  sbPatch('users','id=eq.'+_assignedEditUserId, payload).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    logAudit('user_assigned_stores_changed',{details:{target_user_id:_assignedEditUserId,target_user_name:_assignedEditUserName,wants_all:wantsAll,stores:selected}});
    toast(wantsAll ? '✅ Вижда всички магазини' : '✅ Назначени '+selected.length+' магазина');
    closeAssignedModal();
    loadUsersAdmin();
  });
}

/* ══════════════════════════════════════════
   ВЕЧЕРЕН ОБОРОТ — ПОЛУЧАТЕЛИ НА ИМЕЙЛА
   users.oborot_report: 'all' | 'assigned' | NULL
   Чете се от Edge Function-а send-oborot-report (pg_cron, 20:45 софийско).
══════════════════════════════════════════ */

var _oborotEditUserId = null;
var _oborotEditUserName = null;
var _oborotEditAssigned = [];

var OBOROT_REPORT_LABELS = {all:'Всички обекти', assigned:'Своите обекти'};
function oborotReportLabel(v){ return OBOROT_REPORT_LABELS[v] || '—'; }

/* assigned_stores идва ту като масив, ту като Postgres literal '{"А","Б"}' —
   същият разбор като в editAssigned(). */
function _oborotParseStores(raw){
  if(Array.isArray(raw)) return raw;
  if(typeof raw==='string' && raw.length>2){
    try{ return raw.replace(/^{|}$/g,'').split(',').map(function(s){return s.trim().replace(/^"|"$/g,'');}); }catch(e){}
  }
  return [];
}

function editOborotReport(userId, userName){
  _oborotEditUserId = userId;
  _oborotEditUserName = userName;
  /* Текущата стойност се чете наново, а не се взима от реда — таблицата може
     да е отпреди чужда промяна. Заедно с нея идват и зачисленията, защото
     от тях зависи предупреждението при 'assigned'. */
  sbGet('users','id=eq.'+userId+'&select=oborot_report,assigned_stores').then(function(data){
    var row = (Array.isArray(data)&&data[0]) ? data[0] : {};
    _oborotEditAssigned = _oborotParseStores(row.assigned_stores);
    _renderOborotModal(userName, row.oborot_report||'');
  });
}

function _renderOborotModal(userName, current){
  var old = document.getElementById('oborot-modal-ov');
  if (old) old.remove();

  var noAssigned = !_oborotEditAssigned.length;
  function opt(val, title, sub){
    return '<label style="display:flex;align-items:flex-start;gap:8px;padding:9px 10px;background:'+
      (current===val?'#eff6ff':'#f8fafc')+';border:1px solid '+(current===val?'#2563eb':'#e2e8f0')+
      ';border-radius:8px;margin-bottom:8px;cursor:pointer;font-size:13px;">'+
      '<input type="radio" name="oborot-report-opt" value="'+val+'" '+(current===val?'checked':'')+' style="margin-top:2px;">'+
      '<span><b>'+title+'</b><br><span style="font-size:11px;color:#64748b;">'+sub+'</span></span>'+
      '</label>';
  }

  var html = '<div class="bov open" id="oborot-modal-ov" onclick="if(event.target===this)closeOborotModal()">' +
    '<div class="bmod" style="width:420px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;">💰 Вечерен оборот — '+esc(userName)+'</div>' +
    '<button onclick="closeOborotModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>' +
    '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Имейлът тръгва всеки ден в 20:45.</div>' +
    opt('', 'Не получава', 'Не влиза в списъка с получатели.') +
    opt('all', 'Всички обекти', 'Един имейл с оборота на всичките 18 обекта.') +
    opt('assigned', 'Своите обекти', 'Един имейл само с обектите от „Назначени магазини".' +
      (noAssigned ? ' <b style="color:#d97706;">Този потребител няма зачислени обекти.</b>' : '')) +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeOborotModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitOborotReport()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeOborotModal(){
  var ov = document.getElementById('oborot-modal-ov');
  if (ov) ov.remove();
  _oborotEditUserId = null;
  _oborotEditUserName = null;
  _oborotEditAssigned = [];
}

function submitOborotReport(){
  var el = document.querySelector('input[name="oborot-report-opt"]:checked');
  var val = el ? el.value : '';
  /* ПРАЗЕН НИЗ НЕ СТАВА: users_oborot_report_chk допуска само NULL, 'all' или
     'assigned' — '' би върнало 400 от базата. */
  var payload = {oborot_report: val ? val : null};
  var warn = (val==='assigned') && !_oborotEditAssigned.length;
  var uid = _oborotEditUserId, uname = _oborotEditUserName;

  sbPatch('users','id=eq.'+uid, payload).then(function(res){
    if(!res.ok){ toast('Грешка при запис: '+sbErrMsg(res),'#dc2626'); return; }
    /* Кой получава финансов отчет е промяна, която трябва да оставя следа. */
    logAudit('user_oborot_report_changed',{details:{target_user_id:uid,target_user_name:uname,value:payload.oborot_report}});
    closeOborotModal();
    /* Предупреждението не блокира записа, но е ПОСЛЕДНОТО съобщение — иначе
       зеленият toast го припокрива и човекът не разбира, че няма да получи
       нищо (edge функцията го отчита като no_assigned_stores). */
    if(warn) toast('Този потребител няма зачислени обекти и няма да получи имейл.','#d97706');
    else toast('✅ '+(payload.oborot_report ? oborotReportLabel(payload.oborot_report) : 'Не получава оборота'));
    loadUsersAdmin();
  });
}

function deleteUser(id, email){
  if(!confirm('Изтрий потребител:\n'+email+'\n\nТова действие е необратимо!'))return;
  sbDelete('users','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('deleteUser: потребителят НЕ беше изтрит',id,email,res.error);
      toast('⚠️ Потребителят НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadUsersAdmin(); return;
    }
    /* Точно тук е капанът с RLS: ако някой включи RLS върху users без DELETE
       политика, PostgREST връща 204 с нула изтрити реда и старият код казваше
       "изтрит". Виж docs/PATTERNS.md, "Спящи RLS политики". */
    if(res.count===0){
      toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b');
      loadUsersAdmin(); return;
    }
    logAudit('user_deleted',{details:{target_user_id:id,target_email:email}});
    /* reportableStoresCache се строи от users — ако това е бил последният
       акаунт на даден обект, знаменателят на бройките в Бюлетина трябва да
       падне веднага, а не при следващото презареждане на страницата. */
    invalidateStoreCaches();
    toast('✓ Потребителят е изтрит');
    loadUsersAdmin();
  });
}

/* ══════════════════════════════════════════
   ПОТРЕБИТЕЛИ — МОДАЛ ДОБАВЯНЕ / РЕДАКТИРАНЕ
══════════════════════════════════════════ */

var _userEditId = null; /* null = нов, string = редактиране */

function openUserModal(id){
  _userEditId = id || null;
  /* Зареди данните ако е редактиране */
  if(_userEditId){
    sbGet('users','id=eq.'+_userEditId+'&select=id,email,display_name,store_name,role,active,is_regional').then(function(data){
      var u=Array.isArray(data)&&data[0]?data[0]:{};
      _renderUserModal(u);
    });
  } else {
    _renderUserModal({});
  }
}

function _renderUserModal(u){
  /* Премахни стар модал ако има */
  var old=document.getElementById('user-modal-ov');
  if(old && typeof old.remove==='function')old.remove();

  var isEdit=!!_userEditId;
  var roles=['admin','accounting','logistics','manager','sklad','kasa','supply','marketing','info','user'];
  var stores=['Централен офис','Кърджали','Раднево','Враца','Троян','Дупница','Гоце Делчев','Петрич',
              'Силистра','Добрич','Шумен','Търговище','Сливен','Габрово','Севлиево','Пирдоп',
              'Карлово','Козлодуй','Монтана','Логистичен склад Добрич','Логистичен склад Търговище'];

  var html=
    '<div class="bov open" id="user-modal-ov" onclick="if(event.target===this)closeUserModal()">'+
    '<div class="bmod" style="width:460px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">'+
    '<div style="font-size:15px;font-weight:700;color:#0f172a;">'+(isEdit?'✏️ Редактирай колега':'+ Добави колега')+'</div>'+
    '<button onclick="closeUserModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+

    '<label class="fl">Имейл *</label>'+
    '<input class="fi" id="um-email" type="email" value="'+esc(u.email||'')+'" placeholder="name@temax.bg"'+(isEdit?' readonly style="background:#f8fafc;color:#64748b;"':'')+'>'+

    '<label class="fl">Имe (показвано)</label>'+
    '<input class="fi" id="um-name" value="'+esc(u.display_name||'')+'" placeholder="напр. А. Димитрова">'+

    '<label class="fl">Роля *</label>'+
    '<select class="fi" id="um-role">'+
      roles.map(function(r){
        return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+r+'</option>';
      }).join('')+
    '</select>'+

    /* Признакът за длъжност стои ДО ролята, защото дълго време се
       подразбираше от нея — групата „Регионален (по магазин)" в Бюлетина се
       пълнеше от role=accounting и грешеше в двете посоки. Отметката е
       независима: регионален може да е с всяка роля.
       Показва се САМО при редакция. При създаване anon няма INSERT право
       върху колоната (виж users-is-regional-schema.sql), тоест отметка тук
       би се загубила мълчаливо — по-честно е да я няма и админът да отвори
       новия колега за редакция. */
    (isEdit
      ? '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;">'+
        '<input type="checkbox" id="um-regional" '+(u.is_regional?'checked':'')+' style="width:16px;height:16px;cursor:pointer;">'+
        '<label for="um-regional" style="font-size:13px;color:#475569;cursor:pointer;">Регионален мениджър</label>'+
        '</div>'
      : '')+

    '<label class="fl">Магазин / Офис</label>'+
    '<select class="fi" id="um-store">'+
      stores.map(function(s){
        return '<option value="'+s+'"'+(u.store_name===s?' selected':'')+'>'+s+'</option>';
      }).join('')+
    '</select>'+

    '<label class="fl">'+(isEdit?'Нова парола (остави празно = без промяна)':'Парола *')+'</label>'+
    '<div style="position:relative;">'+
    '<input class="fi" id="um-pass" type="password" placeholder="'+(isEdit?'••••••••':'минимум 4 символа')+'" style="padding-right:40px;">'+
    '<button type="button" onclick="_togglePassVis()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;font-size:16px;color:#94a3b8;" id="um-eye">👁</button>'+
    '</div>'+

    '<div style="display:flex;align-items:center;gap:8px;margin-top:12px;">'+
    '<input type="checkbox" id="um-active" '+(u.active===false?'':'checked')+' style="width:16px;height:16px;cursor:pointer;">'+
    '<label for="um-active" style="font-size:13px;color:#475569;cursor:pointer;">Активен акаунт</label>'+
    '</div>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">'+
    '<button onclick="closeUserModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitUserModal()" style="border:none;background:#0f172a;color:#fff;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'💾 Запази':'➕ Добави')+'</button>'+
    '</div>'+
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function _togglePassVis(){
  var inp=document.getElementById('um-pass');
  var eye=document.getElementById('um-eye');
  if(!inp)return;
  inp.type=inp.type==='password'?'text':'password';
  if(eye)eye.textContent=inp.type==='password'?'👁':'🙈';
}

function closeUserModal(){
  var ov=document.getElementById('user-modal-ov');
  if(ov && typeof ov.remove==='function')ov.remove();
  _userEditId=null;
}

function submitUserModal(){
  var email=(document.getElementById('um-email').value||'').trim().toLowerCase();
  var name=(document.getElementById('um-name').value||'').trim();
  var role=document.getElementById('um-role').value;
  var store=document.getElementById('um-store').value;
  var pass=(document.getElementById('um-pass').value||'').trim();
  var active=document.getElementById('um-active').checked;

  if(!email){toast('Въведи имейл','#dc2626');return;}
  if(!role){toast('Избери роля','#dc2626');return;}
  if(!_userEditId&&!pass){toast('Въведи парола','#dc2626');return;}

  var data={
    display_name: name||email.split('@')[0],
    role: role,
    store_name: store,
    active: active
  };
  if(!_userEditId) data.email=email;
  /* Само при редакция: колоната е без INSERT грант за anon, а и полето го
     няма в модала за нов колега. Четем от DOM-а, за да не се подава при
     създаване дори ако някой добави чекбокса там. */
  if(_userEditId){
    var regEl=document.getElementById('um-regional');
    if(regEl) data.is_regional=!!regEl.checked;
  }

  var editingId=_userEditId; /* запазваме преди closeUserModal() да го нулира */

  function afterPassword(){
    /* И при създаване, и при редакция: reportableStoresCache се строи от
       users, тоест първият акаунт за обект без такъв (напр. Пазарджик) го
       добавя към знаменателя в Бюлетина, а смяна на store_name може да го
       извади. Без това числата остават стари до презареждане на страницата
       и изглежда, че „новият обект не се брои". */
    invalidateStoreCaches();
    toast('✅ '+(editingId?'Записано!':'Колегата е добавен!'));
    closeUserModal();
    loadUsersAdmin();
  }

  if(editingId){
    sbPatch('users','id=eq.'+editingId, data).then(function(res){
      if(!res.ok){toast('Грешка при запис','#dc2626');return;}
      logAudit('user_edited',{details:{target_user_id:editingId,target_email:email,role:role,store_name:store,active:active,is_regional:data.is_regional}});
      if(pass){
        setUserPassword(editingId,pass,function(ok,msg){
          if(ok) logAudit('user_password_changed_by_admin',{details:{target_user_id:editingId,target_email:email}});
          else toast('⚠️ Записано, но паролата НЕ бе сменена: '+(msg||''),'#d97706');
          afterPassword();
        });
      } else afterPassword();
    });
  } else {
    /* Prefer: return=representation, за да получим id-то на новосъздадения ред (за паролата).
       ?select=id е задължителен, не козметика: без него PostgREST прави
       RETURNING users.*, а Postgres иска SELECT право върху ВСЯКА върната
       колона. В мига, в който anon загуби правото върху password_hash,
       създаването на потребител би връщало 403. Кодът и без това чете само id. */
    fetch(API+'/users?select=id',{
      method:'POST',
      headers:Object.assign({},H,{'Prefer':'return=representation'}),
      body:JSON.stringify(Object.assign({email:email},data))
    }).then(function(r){
      return r.text().then(function(txt){
        var d=null; try{d=JSON.parse(txt);}catch(e){}
        return {ok:r.ok, data:d};
      });
    }).then(function(res){
      if(!res.ok||!res.data||!res.data.length){toast('Грешка при запис','#dc2626');return;}
      var newId=res.data[0].id;
      logAudit('user_added',{details:{target_user_id:newId,target_email:email,role:role,store_name:store,active:active}});
      setUserPassword(newId,pass,function(ok,msg){
        if(ok) logAudit('user_password_changed_by_admin',{details:{target_user_id:newId,target_email:email}});
        else toast('⚠️ Колегата е добавен, но паролата НЕ бе зададена: '+(msg||''),'#d97706');
        afterPassword();
      });
    });
  }
}

/* Хеширане на парола през Edge Function — таблицата users никога не получава чист текст оттук насетне */
function setUserPassword(userId,newPass,onDone){
  fetch(SB_URL+'/functions/v1/auth-set-password',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY,'apikey':SB_KEY},
    body:JSON.stringify({user_id:userId,new_password:newPass})
  }).then(function(r){return r.json().catch(function(){return{};});}).then(function(d){
    onDone(!!d.ok, d.message);
  }).catch(function(){onDone(false,'мрежова грешка');});
}

/* ═══════════════════════════════════════════════════════════════
   BACKUP СИСТЕМА — Admin панел
   Добавя се в admin.js
═══════════════════════════════════════════════════════════════ */

function loadBackupAdmin(){
  sbGet('backup_snapshots','select=id,created_at,snapshot_type,total_rows,created_by&order=created_at.desc&limit=30').then(function(data){
    var list=Array.isArray(data)?data:[];
    var body=document.getElementById('backup-body');
    if(!body)return;

    if(!list.length){
      body.innerHTML='<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">Няма backups.</td></tr>';
      return;
    }

    body.innerHTML=list.map(function(b){
      var typeBg={daily:'#dbeafe',manual:'#dcfce7',initial:'#f3e8ff',weekly:'#fef9c3'};
      var d=new Date(b.created_at);
      var timeStr=d.toLocaleDateString('bg-BG')+' '+d.toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'});
      return '<tr>'+
        '<td style="padding:8px 12px;font-family:monospace;font-size:11px;">'+timeStr+'</td>'+
        '<td style="padding:8px 12px;"><span style="background:'+(typeBg[b.snapshot_type]||'#f3f4f6')+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+esc(b.snapshot_type||'')+'</span></td>'+
        '<td style="padding:8px 12px;text-align:right;font-family:monospace;">'+(b.total_rows||0)+'</td>'+
        '<td style="padding:8px 12px;font-size:11px;color:#64748b;">'+esc(b.created_by||'system')+'</td>'+
        '<td style="padding:8px 12px;">'+
          '<button onclick="downloadBackup(\''+b.id+'\')" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;">📥 Изтегли Excel</button>'+
        '</td>'+
      '</tr>';
    }).join('');
  });

  /* Последен backup лог */
  sbGet('backup_log','order=created_at.desc&limit=5').then(function(data){
    var el=document.getElementById('backup-last-log');
    if(!el||!Array.isArray(data)||!data.length)return;
    var last=data[0];
    var d=new Date(last.created_at);
    el.innerHTML='Последен: <b>'+d.toLocaleDateString('bg-BG')+' '+d.toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})+'</b> — '+esc(last.notes||'')+'<span style="color:'+(last.status==='success'?'#16a34a':'#dc2626')+';">  '+(last.status==='success'?'✅ Успешен':'❌ Грешка')+'</span>';
  });
}

function triggerManualBackup(){
  if(currentUser.role!=='admin'){toast('Само за admin','#dc2626');return;}
  toast('⏳ Стартиране на backup...');
  /* Извикваме Supabase RPC функцията */
  fetch('https://xiwkdiqqplgdcrkewgtv.supabase.co/rest/v1/rpc/perform_daily_backup',{
    method:'POST',
    headers:{
      'apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
      'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({p_type:'manual',p_by:currentUser.display_name||currentUser.email})
  }).then(function(r){return r.json();})
  .then(function(id){
    if(id){
      toast('✅ Backup завършен! ID: '+String(id).slice(0,8)+'...');
      setTimeout(loadBackupAdmin,1000);
    }else{
      toast('Грешка при backup','#dc2626');
    }
  }).catch(function(e){toast('Грешка: '+e.message,'#dc2626');});
}

function downloadBackup(id){
  if(!window.XLSX){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=function(){downloadBackup(id);};
    document.head.appendChild(s);return;
  }
  toast('⏳ Подготвяне на Excel файла...');
  sbGet('backup_snapshots','id=eq.'+id).then(function(data){
    if(!Array.isArray(data)||!data.length){toast('Backup не е намерен','#dc2626');return;}
    var b=data[0];
    var wb=window.XLSX.utils.book_new();
    var d=new Date(b.created_at);
    var dateStr=d.toLocaleDateString('bg-BG').replace(/\./g,'-');

    /* Функция за конвертиране на JSONB масив в worksheet */
    function jsonToSheet(jsonData,sheetName){
      if(!jsonData||!jsonData.length)return;
      var rows=[];
      /* Headers от първия обект */
      var keys=Object.keys(jsonData[0]);
      rows.push(keys);
      jsonData.forEach(function(obj){
        rows.push(keys.map(function(k){
          var v=obj[k];
          if(v===null||v===undefined)return '';
          if(typeof v==='object')return JSON.stringify(v);
          return v;
        }));
      });
      var ws=window.XLSX.utils.aoa_to_sheet(rows);
      window.XLSX.utils.book_append_sheet(wb,ws,sheetName);
    }

    /* Добавяме всички таблици като отделни листа */
    jsonToSheet(b.users_data,'Потребители');
    jsonToSheet(b.stores_data,'Магазини');
    jsonToSheet(b.kasa_reports_data,'ПОС Отчети');
    jsonToSheet(b.kasa_glavna_data,'Главна каса');
    jsonToSheet(b.kasa_zoborot_data,'Равнение');
    jsonToSheet(b.transport_data,'Транспорт');
    jsonToSheet(b.client_orders_data,'Клиентски заявки');
    jsonToSheet(b.goods_transit_data,'Стока на път');
    jsonToSheet(b.contacts_data,'Контакти');
    jsonToSheet(b.bulletins_data,'Бюлетини');

    /* Мета лист */
    var metaRows=[
      ['ТеМАХ Платформа — Backup'],
      ['Дата на backup:',dateStr],
      ['Тип:',b.snapshot_type],
      ['Общо записи:',b.total_rows],
      ['Създаден от:',b.created_by],
      ['Backup ID:',b.id],
    ];
    var wsMeta=window.XLSX.utils.aoa_to_sheet(metaRows);
    window.XLSX.utils.book_append_sheet(wb,wsMeta,'INFO');

    var fname='ТеМАХ_Backup_'+dateStr+'_'+b.snapshot_type+'.xlsx';
    window.XLSX.writeFile(wb,fname);
    toast('✅ Backup изтеглен! ('+b.total_rows+' записа, '+wb.SheetNames.length+' листа)');
  });
}

function renderBackupSection(){
  return '<div class="card" style="margin-top:20px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
      '<div>'+
        '<div class="card-title" style="margin:0;">🔐 Backup система</div>'+
        '<div id="backup-last-log" style="font-size:12px;color:#64748b;margin-top:4px;">Зареждане...</div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;">'+
        '<button onclick="triggerManualBackup()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">🔄 Ръчен Backup сега</button>'+
      '</div>'+
    '</div>'+
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#14532d;">'+
      '✅ Автоматичен backup: <b>всяка нощ в 02:00 ч.</b> &nbsp;·&nbsp; '+
      'Съхранение: <b>последните 90 дни</b> &nbsp;·&nbsp; '+
      'Формат: <b>Excel с отделен лист за всяка таблица</b>'+
    '</div>'+
    '<div class="tbl-wrap"><table style="width:100%;">'+
      '<thead><tr>'+
        '<th>Дата и час</th>'+
        '<th>Тип</th>'+
        '<th style="text-align:right;">Записи</th>'+
        '<th>Създаден от</th>'+
        '<th>Изтегли</th>'+
      '</tr></thead>'+
      '<tbody id="backup-body">'+
        '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">⏳ Зареждане...</td></tr>'+
      '</tbody>'+
    '</table></div>'+
  '</div>';
}

/* ══════════════════════════════════════════
   ОГРАНИЧЕНИЕ НА КЛИЕНТСКИ ЗАЯВКИ (период + складове/ЦО)
══════════════════════════════════════════ */

var adminRestrictions = [];

function loadRestrictionsAdmin(){
  sbGet('order_restrictions','order=start_date.desc').then(function(data){
    adminRestrictions = Array.isArray(data)?data:[];
    renderRestrictionsAdmin();
  }).catch(function(){
    var body=document.getElementById('restrictions-body');
    if(body) body.innerHTML='<div style="text-align:center;padding:16px;color:#dc2626;font-size:12px;">Грешка при зареждане.</div>';
  });
}

function renderRestrictionsAdmin(){
  var body=document.getElementById('restrictions-body'); if(!body)return;
  if(!adminRestrictions.length){
    body.innerHTML='<div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">Няма зададени ограничения.</div>';
    return;
  }
  var todayStr=today();
  body.innerHTML=adminRestrictions.map(function(r){
    var stores=Array.isArray(r.restricted_stores)?r.restricted_stores:[];
    var isNow = r.active && (!r.start_date||todayStr>=r.start_date) && (!r.end_date||todayStr<=r.end_date);
    var statusBadge = !r.active
      ? '<span style="background:#f1f5f9;color:#94a3b8;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">Изключено</span>'
      : (isNow
        ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">🔴 Активно СЕГА</span>'
        : '<span style="background:#eff6ff;color:#1e40af;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">⏳ Планирано</span>');
    return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">'+
        '<div>'+
          '<div style="font-size:12.5px;font-weight:600;margin-bottom:3px;">'+stores.map(function(s){return esc(s);}).join(', ')+'</div>'+
          '<div style="font-size:11px;color:#64748b;">'+fmtDate(r.start_date)+' — '+fmtDate(r.end_date)+(r.note?' · '+esc(r.note):'')+'</div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'+
          statusBadge+
          '<button onclick="toggleRestrictionActive(\''+r.id+'\','+(!r.active)+')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">'+(r.active?'⏸ Спри':'▶ Активирай')+'</button>'+
          '<button onclick="deleteRestriction(\''+r.id+'\')" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button>'+
        '</div>'+
      '</div></div>';
  }).join('');
}

function openRestrictionModal(){
  sbGet('stores','order=name&select=name').then(function(data){
    var allStores=(Array.isArray(data)?data:[]).map(function(s){return s.name;});
    if(allStores.indexOf('Централен офис')<0) allStores.unshift('Централен офис');
    _renderRestrictionModal(allStores);
  });
}
function _renderRestrictionModal(allStores){
  var old=document.getElementById('restriction-modal-ov'); if(old)old.remove();
  var html='<div class="bov open" id="restriction-modal-ov" onclick="if(event.target===this)closeRestrictionModal()">'+
    '<div class="bmod" style="width:440px;max-height:88vh;overflow-y:auto;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:15px;font-weight:700;">🚫 Нова забрана на заявки</div>'+
    '<button onclick="closeRestrictionModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>'+
    '</div>'+
    '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Складове / ЦО, които не приемат заявки:</div>'+
    '<div id="restriction-store-list" style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:12px;">'+
    allStores.map(function(name){
      return '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;cursor:pointer;">'+
        '<input type="checkbox" class="restriction-store-cb" value="'+esc(name)+'"> '+esc(name)+
        '</label>';
    }).join('')+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">'+
    '<div><label class="fl">Начална дата *</label><input type="date" class="fi" id="restr-start" value="'+today()+'"></div>'+
    '<div><label class="fl">Крайна дата *</label><input type="date" class="fi" id="restr-end"></div>'+
    '</div>'+
    '<label class="fl">Бележка (незадължително)</label>'+
    '<input class="fi" id="restr-note" placeholder="напр. Годишна инвентаризация" style="margin-bottom:14px;">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
    '<button onclick="closeRestrictionModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitRestriction()" style="border:none;background:#dc2626;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази забраната</button>'+
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}
function closeRestrictionModal(){
  var ov=document.getElementById('restriction-modal-ov'); if(ov)ov.remove();
}
function submitRestriction(){
  var stores=[].map.call(document.querySelectorAll('.restriction-store-cb:checked'),function(cb){return cb.value;});
  var start=document.getElementById('restr-start').value;
  var end=document.getElementById('restr-end').value;
  if(!stores.length){toast('Избери поне един склад/ЦО','#dc2626');return;}
  if(!start||!end){toast('Задай начална и крайна дата','#dc2626');return;}
  if(end<start){toast('Крайната дата трябва да е след началната','#dc2626');return;}
  sbPost('order_restrictions',{
    restricted_stores:stores,
    start_date:start,
    end_date:end,
    note:document.getElementById('restr-note').value.trim(),
    active:true,
    created_by:currentUser.display_name||currentUser.email
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('✅ Забраната е зададена!');
    closeRestrictionModal();
    loadRestrictionsAdmin();
  });
}
function toggleRestrictionActive(id,active){
  sbPatch('order_restrictions','id=eq.'+id,{active:active}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    loadRestrictionsAdmin();
  });
}
function deleteRestriction(id){
  if(!confirm('Изтрий тази забрана?'))return;
  sbDelete('order_restrictions','id=eq.'+id).then(function(res){
    if(!res.ok){toast('Грешка при изтриване','#dc2626');return;}
    toast('✅ Изтрито!');
    loadRestrictionsAdmin();
  });
}

/* ══════════════════════════════════════════
   КАТАЛОГ АРТИКУЛИ (от SAP export) - автоматично зареждане на име по SAP код
══════════════════════════════════════════ */

function loadCatalogAdmin(){
  sbGet('product_catalog','select=sap_code&limit=1').then(function(){
    /* само за да проверим, че таблицата съществува; реалният брой - отделна заявка с count */
    fetch(API+'/product_catalog?select=sap_code',{method:'HEAD',headers:Object.assign({},H,{'Prefer':'count=exact'})}).then(function(res){
      var count=res.headers.get('content-range');
      var total=count?count.split('/')[1]:'?';
      renderCatalogAdmin(total);
    }).catch(function(){renderCatalogAdmin('?');});
  }).catch(function(){renderCatalogAdmin('?');});
}
function renderCatalogAdmin(total){
  var body=document.getElementById('catalog-admin-body'); if(!body)return;
  body.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">'+
    '<div style="font-size:13px;color:#374151;">📦 Общо артикули в каталога: <b>'+esc(total)+'</b></div>'+
    '<div style="display:flex;gap:8px;">'+
    '<button onclick="openAddCatalogItemModal()" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">+ Добави артикул</button>'+
    '<button onclick="openCatalogImportModal()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">📤 Импортирай CSV/TSV</button>'+
    '</div></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:8px;">'+
    '<input class="fi" id="catalog-search-inp" placeholder="Търси по SAP код или наименование..." style="flex:1;" onkeydown="if(event.key===\'Enter\')searchCatalog()">'+
    '<button onclick="searchCatalog()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:6px 16px;font-size:12.5px;cursor:pointer;">Търси</button>'+
    '</div>'+
    '<div id="catalog-search-results" style="font-size:12px;color:#94a3b8;">Въведи SAP код или част от име за търсене.</div>';
}
function searchCatalog(){
  var q=(document.getElementById('catalog-search-inp').value||'').trim();
  var resultsEl=document.getElementById('catalog-search-results');
  if(!q){resultsEl.innerHTML='Въведи SAP код или част от име за търсене.';return;}
  resultsEl.innerHTML='⏳ Търсене...';
  var filter='or=(sap_code.ilike.*'+encodeURIComponent(q)+'*,product_name.ilike.*'+encodeURIComponent(q)+'*)&limit=30';
  sbGet('product_catalog',filter).then(function(data){
    var rows=Array.isArray(data)?data:[];
    if(!rows.length){resultsEl.innerHTML='<div style="padding:8px;color:#94a3b8;">Няма намерени артикули.</div>';return;}
    resultsEl.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
      '<tr style="color:#94a3b8;text-align:left;"><th style="padding:4px 6px;">SAP</th><th style="padding:4px 6px;">Наименование</th><th style="padding:4px 6px;">Мярка</th><th style="padding:4px 6px;"></th></tr>'+
      rows.map(function(r){
        return '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 6px;font-family:DM Mono,monospace;">'+esc(r.sap_code)+'</td>'+
          '<td style="padding:4px 6px;">'+esc(r.product_name)+'</td>'+
          '<td style="padding:4px 6px;">'+esc(r.default_unit||'—')+'</td>'+
          '<td style="padding:4px 6px;"><button data-sap="'+esc(r.sap_code)+'" onclick="deleteCatalogItem(this.dataset.sap)" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:5px;padding:2px 7px;font-size:10px;cursor:pointer;">✕</button></td></tr>';
      }).join('')+
    '</table>';
  });
}
function openAddCatalogItemModal(){
  var old=document.getElementById('catalog-item-ov'); if(old)old.remove();
  var html='<div class="bov open" id="catalog-item-ov"><div class="bmod" style="width:380px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:15px;font-weight:700;">+ Артикул в каталога</div>'+
    '<button onclick="document.getElementById(\'catalog-item-ov\').remove()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<label class="fl">SAP код *</label><input class="fi" id="ci-sap" style="margin-bottom:8px;">'+
    '<label class="fl">Наименование *</label><input class="fi" id="ci-name" style="margin-bottom:8px;">'+
    '<label class="fl">Мярка</label><select class="fi" id="ci-unit" style="margin-bottom:14px;">'+unitOptionsHtml('бр.')+'</select>'+
    '<button onclick="submitCatalogItem()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Запази</button>'+
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function submitCatalogItem(){
  var sap=document.getElementById('ci-sap').value.trim();
  var name=document.getElementById('ci-name').value.trim();
  var unit=document.getElementById('ci-unit').value;
  if(!sap||!name){toast('Попълни SAP код и наименование','#dc2626');return;}
  fetch(API+'/product_catalog',{
    method:'POST',
    headers:Object.assign({},H,{'Prefer':'resolution=merge-duplicates,return=minimal'}),
    body:JSON.stringify([{sap_code:sap,product_name:name,default_unit:unit,updated_at:new Date().toISOString()}])
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast('✅ Запазено!');
    var ov=document.getElementById('catalog-item-ov'); if(ov)ov.remove();
    loadCatalogAdmin();
  });
}
function deleteCatalogItem(sap){
  if(!confirm('Изтрий артикул '+sap+' от каталога?'))return;
  sbDelete('product_catalog','sap_code=eq.'+encodeURIComponent(sap)).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('✅ Изтрито!');
    searchCatalog();
    loadCatalogAdmin();
  });
}

/* ── Импорт/обновяване през CSV или TSV (SAP export) ── */
var CATALOG_COL_MAP={sap:'Материал',name:'Описание на Материал',unit:'БМЕ',category:'Група материали',ean:'EAN/UPC код'};
var CATALOG_UNIT_MAP={'БР':'бр.','КАШ':'кашон','M2':'кв.м','M²':'кв.м','ЛМ':'л.м','ПАК':'пакет','ЧФТ':'чифт','КОМПЛ':'компл.'};
function normalizeCatalogUnit(u){
  u=(u||'').trim().toUpperCase();
  return CATALOG_UNIT_MAP[u]||(u?u.toLowerCase():'бр.');
}
function parseDelimitedCatalog(text){
  /* Excel-ският "CSV UTF-8" запис добавя невидим BOM символ в самото начало
     на файла - ако не се премахне, "поврежда" името на ПЪРВАТА колона
     (напр. "Материал" се чете като "\uFEFFМатериал"), чупейки разпознаването. */
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  /* Разпознаване на разделителя: табулация > точка-запетая (стандарт за SAP/
     европейски CSV износ, тъй като запетаята вече се ползва за десетичен
     знак в числата, напр. "0,230") > обикновена запетая, като последен fallback. */
  var delim = text.indexOf('\t')>=0 ? '\t' : (text.indexOf(';')>=0 ? ';' : ',');
  var lines=text.split(/\r\n|\n/).filter(function(l){return l.trim().length;});
  if(!lines.length)return [];
  var headers=lines[0].split(delim).map(function(h){return h.trim();});
  var rows=[];
  for(var i=1;i<lines.length;i++){
    var cols=lines[i].split(delim);
    var row={};
    headers.forEach(function(h,idx){row[h]=(cols[idx]||'').trim();});
    rows.push(row);
  }
  rows._detectedHeaders=headers; /* за диагностика, ако нищо не съвпадне */
  return rows;
}
function openCatalogImportModal(){
  var old=document.getElementById('catalog-import-ov'); if(old)old.remove();
  var html='<div class="bov open" id="catalog-import-ov"><div class="bmod" style="width:440px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
    '<div style="font-size:15px;font-weight:700;">📤 Импорт от SAP export (CSV/TSV)</div>'+
    '<button onclick="document.getElementById(\'catalog-import-ov\').remove()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Артикул със съществуващ SAP код се обновява; нов SAP код се добавя. Нищо не се трие автоматично.</div>'+
    '<input type="file" id="catalog-file-inp" accept=".csv,.tsv,.txt" style="margin-bottom:14px;">'+
    '<div id="catalog-import-progress" style="font-size:12px;color:#94a3b8;"></div>'+
    '<button onclick="startCatalogImport()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;">Започни импорт</button>'+
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function startCatalogImport(){
  var fileInp=document.getElementById('catalog-file-inp');
  var file=fileInp.files[0];
  if(!file){toast('Избери файл','#dc2626');return;}
  var progEl=document.getElementById('catalog-import-progress');
  progEl.textContent='⏳ Четене на файла...';
  var reader=new FileReader();
  reader.onload=function(e){
    var rows=parseDelimitedCatalog(e.target.result);
    var mapped=rows.map(function(r){
      return {
        sap_code:(r[CATALOG_COL_MAP.sap]||'').trim(),
        product_name:(r[CATALOG_COL_MAP.name]||'').trim(),
        default_unit:normalizeCatalogUnit(r[CATALOG_COL_MAP.unit]),
        category:(r[CATALOG_COL_MAP.category]||'').trim()||null,
        ean_code:(r[CATALOG_COL_MAP.ean]||'').trim()||null,
        updated_at:new Date().toISOString()
      };
    }).filter(function(x){return x.sap_code && x.product_name;});
    /* Де-дупликация по SAP код - ако файлът съдържа един и същ SAP код повече
       от веднъж (реален случай, установен в SAP износи), PostgreSQL хвърля
       грешка "ON CONFLICT DO UPDATE command cannot affect row a second time",
       когато дубликатите попаднат в една и съща партида (500 реда). Пазим
       ПОСЛЕДНОТО срещане на всеки код (обикновено най-актуалната версия). */
    var seen={};
    var deduped=[];
    mapped.forEach(function(x){
      if(seen.hasOwnProperty(x.sap_code)){
        deduped[seen[x.sap_code]]=x; /* заменя по-старото срещане с по-новото */
      } else {
        seen[x.sap_code]=deduped.length;
        deduped.push(x);
      }
    });
    var dupCount=mapped.length-deduped.length;
    mapped=deduped;
    if(!mapped.length){
      var foundHeaders=rows._detectedHeaders?rows._detectedHeaders.join(' | '):'(няма редове)';
      progEl.innerHTML='<span style="color:#dc2626;">Не бяха разпознати редове. Очаквани колони: "Материал"/"Описание на Материал".<br>Намерени в твоя файл: <b>'+esc(foundHeaders)+'</b></span>';
      return;
    }
    if(dupCount>0) progEl.textContent='ℹ️ Открити '+dupCount+' дублирани SAP кода (пазено последното срещане). ';
    progEl.textContent+='⏳ Качване на 0 / '+mapped.length+'...';
    batchUpsertCatalog(mapped,function(done,total,errCount){
      progEl.textContent='⏳ Качване на '+done+' / '+total+(errCount?' ('+errCount+' партиди с грешка)':'')+'...';
    },function(errorCount,firstError){
      if(errorCount>0){
        progEl.innerHTML='<span style="color:#dc2626;">⚠️ Завърши с '+errorCount+' неуспешни партиди от общо ~'+Math.ceil(mapped.length/500)+'. Провери конзолата (F12) за детайли.<br>Първа грешка: '+esc(String(firstError).slice(0,200))+'</span>';
        toast('⚠️ Импортът приключи с грешки - виж детайли','#dc2626');
      } else {
        progEl.innerHTML='<span style="color:#16a34a;">✅ Готово! Обработени '+mapped.length+' артикула.</span>';
        toast('✅ Каталогът е обновен!');
      }
      loadCatalogAdmin();
    });
  };
  reader.readAsText(file,'UTF-8');
}
function batchUpsertCatalog(rows,onProgress,onDone){
  var BATCH=500;
  var i=0;
  var errorCount=0;
  var firstError=null;
  function next(){
    if(i>=rows.length){onDone(errorCount,firstError);return;}
    var batch=rows.slice(i,i+BATCH);
    fetch(API+'/product_catalog',{
      method:'POST',
      headers:Object.assign({},H,{'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify(batch)
    }).then(function(res){
      if(!res.ok){
        errorCount++;
        return res.text().then(function(errText){
          console.error('Каталог upsert ГРЕШКА на партида (редове '+i+'-'+(i+BATCH)+'):',errText);
          if(!firstError)firstError=errText;
          i+=BATCH;
          onProgress(Math.min(i,rows.length),rows.length,errorCount);
          next();
        });
      }
      i+=BATCH;
      onProgress(Math.min(i,rows.length),rows.length,errorCount);
      next();
    }).catch(function(err){
      errorCount++;
      console.error('Каталог upsert - мрежова грешка на партида (редове '+i+'-'+(i+BATCH)+'):',err);
      if(!firstError)firstError=String(err);
      i+=BATCH;
      onProgress(Math.min(i,rows.length),rows.length,errorCount);
      next();
    });
  }
  next();
}

/* ══════════════════════════════════════════
   ИЗВЕСТИЯ ОТ БЮЛЕТИНА — теми, матрица, изключения
   Три таблици: notification_topics / notification_matrix /
   notification_overrides. Кронът (на всеки 15 мин) ги чете и вика едж
   функцията bulletin-notify — тя решава кой е просрочен, кой получава и
   как изглежда писмото. Тук САМО се задава какво пише в тях.

   Браузърът не праща известия и не смята получатели (CLAUDE.md т.14).
   Затова тук няма бутон „изпрати" и няма бутон „нова тема": тема без
   строител в edge функцията не прави нищо и би стояла мъртва в списъка.
══════════════════════════════════════════ */

var adminNotifTopics = [];
var adminNotifMatrix = [];
var adminNotifOverrides = [];
var adminNotifUsers = [];

var NOTIF_GROUPS = [
  { key: 'co',          label: 'ЦО' },
  { key: 'controlling', label: 'Контролинг' },
  { key: 'regional',    label: 'Регионален' },
  { key: 'owner',       label: 'Собственик' },
  { key: 'store',       label: 'Магазин' }
];
var NOTIF_CHANNEL_LABELS = { none: '—', email: 'Имейл', push: 'Push', both: 'Имейл + Push' };
var NOTIF_SCOPE_LABELS   = { all: 'всичко', own_stores: 'своите обекти', own_tasks: 'своите задачи' };
var NOTIF_MODE_LABELS    = { include: 'включва', exclude: 'изключва' };
var NOTIF_WEEKDAY_SHORT  = ['', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб', 'нед'];
var NOTIF_DOW_LABELS = { mon:'понеделник', tue:'вторник', wed:'сряда', thu:'четвъртък', fri:'петък', sat:'събота', sun:'неделя' };
var NOTIF_DOW_ORDER  = ['mon','tue','wed','thu','fri','sat','sun'];

/* КОПИЕ на IMPLEMENTED_TOPICS от supabase/functions/bulletin-notify/index.ts.
   notification_topics държи осем реда, но строител в едж функцията има само за
   тези три — останалите пет се събуждат и връщат „Темата още не е реализирана
   в кода", тоест известието просто не излиза. Екранът трябва да го КАЗВА:
   иначе „Дневен отчет · спряна" изглежда като тема, която чака да я включиш.

   Това е трето копие на един и същи факт (след списъка с обектите) и се знае.
   Порталът няма как да прочете едж функцията по време на изпълнение, а колона
   в базата би се разминала със същия успех. Двата списъка се менят ЗАЕДНО —
   tests/admin-notifications.test.js чете и двата от файловете и пада, ако се
   разминат. */
var NOTIF_IMPLEMENTED_TOPICS = ['overdue_tasks', 'today_deadlines', 'promo_expiring'];

function notifTopicHasBuilder(key){ return NOTIF_IMPLEMENTED_TOPICS.indexOf(key) >= 0; }

function notifIsAdmin(){ return !!(currentUser && currentUser.role === 'admin'); }

/* weekdays е int[] в базата. PostgREST го връща като масив, но огледалото и
   стари редове могат да дадат текстовия литерал '{1,2,3,4,5}'. */
function notifWeekdays(t){
  var w = t && t.weekdays;
  if (Array.isArray(w)) return w.map(Number).filter(function(n){ return n>=1 && n<=7; });
  if (typeof w === 'string' && w.length > 2) {
    return w.replace(/^{|}$/g,'').split(',').map(function(s){ return parseInt(s,10); })
      .filter(function(n){ return n>=1 && n<=7; });
  }
  return [];
}

function notifTimeText(t){
  var s = t && t.scheduled_time;
  return s ? String(s).slice(0,5) : '';
}

/* Разписанието на човешки език. Суровият масив [1,2,3,4,5] не казва нищо на
   човека, който трябва да реши дали темата тръгва в събота. */
function notifScheduleText(t){
  if (!t) return '—';
  var hm = notifTimeText(t);
  if (t.schedule_type === 'manual') return 'само ръчно';
  if (t.schedule_type === 'weekly') {
    var d = NOTIF_DOW_LABELS[t.day_of_week] || 'без зададен ден';
    return hm ? d + ' ' + hm : d;
  }
  var days = notifWeekdays(t).sort(function(a,b){ return a-b; });
  var part;
  if (!days.length) part = 'без зададени дни';
  else if (days.length === 7) part = 'всеки ден';
  else if (days.join(',') === '1,2,3,4,5') part = 'всеки делник';
  else part = days.map(function(n){ return NOTIF_WEEKDAY_SHORT[n]; }).join(', ');
  return hm ? part + ' ' + hm : part;
}

/* „последно тръгнало". NULL е ВАЖЕН случай, не празнота: спряна или счупена
   тема изглежда точно като работеща, докато не се види, че не е тръгвала. */
function notifLastRunText(ts){
  if (!ts) return 'никога';
  var s = String(ts).replace(' ', 'T');
  if (/[+-]\d{2}$/.test(s)) s += ':00';
  var d = new Date(s);
  if (isNaN(d.getTime())) return String(ts);
  var p2 = function(n){ return (n < 10 ? '0' : '') + n; };
  var hm = p2(d.getHours()) + ':' + p2(d.getMinutes());
  var then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var now = new Date();
  var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var diff = Math.round((t0 - then) / 86400000);
  if (diff === 0) return 'днес ' + hm;
  if (diff === 1) return 'вчера ' + hm;
  return p2(d.getDate()) + '.' + p2(d.getMonth()+1) + ' ' + hm;
}

function notifStatusIsError(s){ return !!s && String(s).indexOf('ГРЕШКА') === 0; }

function notifTopicLabel(key){
  var t = adminNotifTopics.filter(function(x){ return x.key === key; })[0];
  return t ? t.label : key;
}

function loadNotificationsAdmin(){
  var card = document.getElementById('notif-admin-card');
  /* Целият екран е само за admin — същата проверка като при backup секцията
     в loadAdmin(). При друга роля не се рендира нищо и базата не се пита. */
  if (!notifIsAdmin()) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = '';
  Promise.all([
    sbGet('notification_topics','order=sort_order,key'),
    sbGet('notification_matrix','order=topic_key,group_key'),
    sbGet('notification_overrides','order=user_email,topic_key'),
    /* Изричен select= — users никога не се чете със select=* от клиента. */
    sbGet('users','active=eq.true&order=display_name,email&select=id,email,display_name,active')
  ]).then(function(res){
    adminNotifTopics    = Array.isArray(res[0]) ? res[0] : [];
    adminNotifMatrix    = Array.isArray(res[1]) ? res[1] : [];
    adminNotifOverrides = Array.isArray(res[2]) ? res[2] : [];
    adminNotifUsers     = Array.isArray(res[3]) ? res[3] : [];
    renderNotifTopics();
    renderNotifMatrix();
    renderNotifOverrides();
  });
}

/* ── Теми ──────────────────────────────────────────────────────────────── */

function renderNotifTopics(){
  var body = document.getElementById('notif-topics-body'); if(!body) return;
  var head = '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin:2px 0 6px;">Теми</div>';
  if (!adminNotifTopics.length) {
    body.innerHTML = head + '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">Няма теми.</div>';
    return;
  }
  var rows = adminNotifTopics.map(function(t){
    var err = notifStatusIsError(t.last_status);
    /* Тема без строител не е „още изключена" — тя няма какво да свърши. Редът
       е приглушен, превключвателят е ЗАКЛЮЧЕН (не просто сив), а бутонът за
       редакция остава активен: часът и дните може да се подготвят отсега. */
    var impl = notifTopicHasBuilder(t.key);
    /* Тема без строител, която стои active=true в базата — състояние, което не
       бива да съществува. Показва се, не се крие: кронът я събужда всеки ден и
       тя всеки ден не праща нищо. */
    var warn = (!impl && t.active)
      ? '<span title="Включена е, но няма строител в bulletin-notify — известие няма да излезе" style="margin-right:5px;">⚠️</span>'
      : '';
    var noBuilder = impl ? ''
      : '<span class="ntf-no-builder" title="notification_topics има реда, bulletin-notify няма строител за него" style="margin-left:6px;font-size:10px;font-weight:600;color:#94a3b8;border:1px solid #e2e8f0;border-radius:20px;padding:2px 7px;white-space:nowrap;">още не е свързана с код</span>';
    var trStyle = (err ? 'background:#fef2f2;' : (impl ? '' : 'background:#fcfcfd;')) + (impl ? '' : 'color:#94a3b8;');
    var badge = t.test_email
      ? '<span title="Праща САМО на този адрес — хората не получават нищо" style="background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;margin-left:6px;white-space:nowrap;">ТЕСТОВ РЕЖИМ: ' + esc(t.test_email) + '</span>'
      : '';
    return '<tr' + (trStyle ? ' style="' + trStyle + '"' : '') + '>' +
      '<td><div style="font-weight:500;font-size:12.5px;">' + warn + esc(t.label) + noBuilder + badge + '</div>' +
        '<div style="font-size:10.5px;color:#94a3b8;">' + esc(t.key) + '</div></td>' +
      '<td style="font-size:12px;white-space:nowrap;">' + esc(notifScheduleText(t)) + '</td>' +
      '<td><label' + (impl ? '' : ' title="Няма строител в bulletin-notify — няма какво да се включва"') +
        ' style="display:inline-flex;align-items:center;gap:6px;font-size:11px;cursor:' + (impl ? 'pointer' : 'not-allowed') + ';">' +
        '<input type="checkbox" class="ntf-active-cb" data-key="' + escAttr(t.key) + '" ' + (t.active ? 'checked' : '') +
        (impl ? '' : ' disabled') +
        ' onchange="toggleNotifTopicActive(\'' + esc(t.key) + '\',this.checked)">' +
        '<span style="color:' + (!impl ? '#cbd5e1' : (t.active ? '#16a34a' : '#94a3b8')) + ';font-weight:600;">' + (t.active ? 'вкл.' : 'спряна') + '</span>' +
      '</label></td>' +
      '<td style="font-size:12px;white-space:nowrap;' + (t.last_run_at ? '' : 'color:#94a3b8;') + '">' +
        esc(notifLastRunText(t.last_run_at)) + '</td>' +
      '<td style="font-size:12px;text-align:center;">' +
        (t.last_recipients === null || t.last_recipients === undefined ? '<span style="color:#94a3b8;">—</span>' : String(t.last_recipients)) + '</td>' +
      '<td style="font-size:11px;' + (err ? 'color:#991b1b;font-weight:600;' : 'color:#64748b;') + '">' +
        (t.last_status ? esc(t.last_status) : '<span style="color:#cbd5e1;">—</span>') + '</td>' +
      '<td><button onclick="openNotifTopicModal(\'' + esc(t.key) + '\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️</button></td>' +
    '</tr>';
  }).join('');
  body.innerHTML = head + '<div class="tbl-wrap"><table>' +
    '<thead><tr><th>Тема</th><th>Разписание</th><th>Включена</th><th>Последно тръгнало</th><th>Души</th><th>Статус</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}

/* Връща отметката на реда в положението, което базата още държи. Без това
   екранът показва спряно, докато темата е включена — точно обратното на
   това, което колоната „последно тръгнало" се опитва да направи видимо. */
function _notifResetActiveCheckbox(key, value){
  var cbs = document.querySelectorAll('.ntf-active-cb');
  for (var i=0;i<cbs.length;i++){
    if (cbs[i].getAttribute('data-key') === key) { cbs[i].checked = !!value; return; }
  }
}

function toggleNotifTopicActive(key, active){
  var topic = adminNotifTopics.filter(function(x){ return x.key === key; })[0];
  /* Превключвателят на тема без строител е disabled, но функцията е глобална и
     се вика по име от inline onchange — заключването не бива да е само в HTML-а. */
  if (!notifTopicHasBuilder(key)) {
    _notifResetActiveCheckbox(key, !!(topic && topic.active));
    toast('„' + (topic ? topic.label : key) + '" още не е свързана с код — включването ѝ нищо не прави.', '#dc2626');
    return;
  }
  /* Пита се САМО при спиране. Спряна тема не изглежда различно от работеща
     отвън: известията просто спират и това се забелязва чак когато нещо не
     е дошло (dynamic-responder мълча месеци). Включването връща нормалното
     състояние и не крие нищо — то минава без въпрос. */
  if (!active) {
    var name = topic ? topic.label : key;
    if (!confirm('Спираш „' + name + '". Известията по нея няма да тръгват, докато не я включиш пак. Продължаваш ли?')) {
      _notifResetActiveCheckbox(key, true);
      return;
    }
  }
  sbPatch('notification_topics','key=eq.' + encodeURIComponent(key), { active: !!active }).then(function(res){
    if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); loadNotificationsAdmin(); return; }
    var t = adminNotifTopics.filter(function(x){ return x.key === key; })[0];
    if (t) t.active = !!active;
    logAudit('notif_topic_active_changed', { details: { topic_key: key, active: !!active } });
    toast(active ? '✅ Темата е включена' : '⏸ Темата е спряна');
    renderNotifTopics();
  });
}

var _notifTopicEditKey = null;

function openNotifTopicModal(key){
  var t = adminNotifTopics.filter(function(x){ return x.key === key; })[0];
  if (!t) { toast('Темата не е намерена','#dc2626'); return; }
  _notifTopicEditKey = key;
  _renderNotifTopicModal(t);
}

function _renderNotifTopicModal(t){
  var old = document.getElementById('notif-topic-modal-ov'); if(old) old.remove();
  var type = t.schedule_type || 'manual';
  var days = notifWeekdays(t);
  var typeOpt = function(val,label){ return '<option value="' + val + '"' + (val===type?' selected':'') + '>' + label + '</option>'; };
  var html = '<div class="bov open" id="notif-topic-modal-ov" onclick="if(event.target===this)closeNotifTopicModal()">' +
    '<div class="bmod" style="width:460px;max-height:88vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;">🔔 ' + esc(t.label) + '</div>' +
    '<button onclick="closeNotifTopicModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>' +
    '</div>' +
    '<div style="background:#f8fafc;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:11.5px;color:#64748b;">' +
      '<div><b>' + esc(t.key) + '</b></div>' +
      (t.description ? '<div style="margin-top:3px;">' + esc(t.description) + '</div>' : '') +
      '<div style="margin-top:4px;color:#94a3b8;">Името, ключът и описанието не се редактират — ключът е връзката със строителя в bulletin-notify.</div>' +
    '</div>' +
    '<label class="fl">Вид разписание</label>' +
    '<select class="fi" id="ntf-type" onchange="notifTopicTypeChange()" style="margin-bottom:10px;">' +
      typeOpt('daily','Дневно — по дни от седмицата') +
      typeOpt('weekly','Седмично — един ден') +
      typeOpt('manual','Само ръчно') +
    '</select>' +
    '<div id="ntf-daily-box" style="display:' + (type==='daily'?'block':'none') + ';margin-bottom:10px;">' +
      '<label class="fl">Дни</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
        [1,2,3,4,5,6,7].map(function(n){
          return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">' +
            '<input type="checkbox" class="ntf-wd" value="' + n + '" ' + (days.indexOf(n)>=0?'checked':'') + '> ' +
            NOTIF_WEEKDAY_SHORT[n] + '</label>';
        }).join('') +
      '</div>' +
      '<div style="margin-top:6px;display:flex;gap:6px;">' +
        '<button type="button" onclick="notifPickWeekdays(0)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">делници</button>' +
        '<button type="button" onclick="notifPickWeekdays(1)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">всеки ден</button>' +
      '</div>' +
    '</div>' +
    '<div id="ntf-weekly-box" style="display:' + (type==='weekly'?'block':'none') + ';margin-bottom:10px;">' +
      '<label class="fl">Ден от седмицата</label>' +
      '<select class="fi" id="ntf-dow">' +
        NOTIF_DOW_ORDER.map(function(d){
          return '<option value="' + d + '"' + (d===t.day_of_week?' selected':'') + '>' + NOTIF_DOW_LABELS[d] + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '<div id="ntf-time-box" style="display:' + (type==='manual'?'none':'block') + ';margin-bottom:10px;">' +
      '<label class="fl">Час</label>' +
      '<input type="time" class="fi" id="ntf-time" value="' + notifTimeText(t) + '">' +
      '<div style="font-size:10.5px;color:#94a3b8;margin-top:3px;">Кронът се буди на всеки 15 минути — темата тръгва при първото събуждане след този час.</div>' +
    '</div>' +
    '<label class="fl">Тестов адрес</label>' +
    '<input class="fi" id="ntf-test-email" placeholder="празно = праща на реалните получатели" value="' + (t.test_email ? escAttr(t.test_email) : '') + '">' +
    '<div style="font-size:10.5px;color:#b45309;margin:3px 0 12px;">При попълнен адрес темата отива САМО там — хората не получават нищо.</div>' +
    '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px;margin-bottom:14px;cursor:pointer;font-size:13px;font-weight:600;">' +
      '<input type="checkbox" id="ntf-active" ' + (t.active?'checked':'') + '> Темата е включена' +
    '</label>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="closeNotifTopicModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitNotifTopic()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function notifTopicTypeChange(){
  var type = v('ntf-type');
  var d = document.getElementById('ntf-daily-box');
  var w = document.getElementById('ntf-weekly-box');
  var tm = document.getElementById('ntf-time-box');
  if (d)  d.style.display  = (type==='daily')  ? 'block' : 'none';
  if (w)  w.style.display  = (type==='weekly') ? 'block' : 'none';
  if (tm) tm.style.display = (type==='manual') ? 'none'  : 'block';
}

function notifPickWeekdays(all){
  var cbs = document.querySelectorAll('.ntf-wd');
  for (var i=0;i<cbs.length;i++){
    var n = parseInt(cbs[i].value,10);
    cbs[i].checked = all ? true : (n <= 5);
  }
}

function closeNotifTopicModal(){
  var ov = document.getElementById('notif-topic-modal-ov'); if(ov) ov.remove();
  _notifTopicEditKey = null;
}

function submitNotifTopic(){
  if (!_notifTopicEditKey) return;
  var key = _notifTopicEditKey;
  var type = v('ntf-type');
  var time = v('ntf-time');
  var testMail = v('ntf-test-email');
  var activeEl = document.getElementById('ntf-active');
  if (testMail && testMail.indexOf('@') < 0) { toast('Тестовият адрес не прилича на имейл','#dc2626'); return; }
  var payload = { schedule_type: type, active: !!(activeEl && activeEl.checked), test_email: testMail || null };
  if (type === 'daily') {
    var days = [].map.call(document.querySelectorAll('.ntf-wd:checked'), function(cb){ return parseInt(cb.value,10); });
    if (!days.length) { toast('Избери поне един ден','#dc2626'); return; }
    if (!time) { toast('Задай час','#dc2626'); return; }
    days.sort(function(a,b){ return a-b; });
    payload.weekdays = days; payload.day_of_week = null; payload.scheduled_time = time;
  } else if (type === 'weekly') {
    var dow = v('ntf-dow');
    if (!dow) { toast('Избери ден','#dc2626'); return; }
    if (!time) { toast('Задай час','#dc2626'); return; }
    payload.weekdays = null; payload.day_of_week = dow; payload.scheduled_time = time;
  } else {
    payload.weekdays = null; payload.day_of_week = null; payload.scheduled_time = null;
  }
  sbPatch('notification_topics','key=eq.' + encodeURIComponent(key), payload).then(function(res){
    if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); return; }
    logAudit('notif_topic_changed', { details: { topic_key: key, payload: payload } });
    toast('✅ Записано');
    closeNotifTopicModal();
    loadNotificationsAdmin();
  });
}

/* ── Матрица тема × група ──────────────────────────────────────────────── */

function notifMatrixCell(topicKey, groupKey){
  for (var i=0;i<adminNotifMatrix.length;i++){
    var m = adminNotifMatrix[i];
    if (m.topic_key === topicKey && m.group_key === groupKey) return m;
  }
  return null;
}

/* own_tasks няма смисъл за група „Магазин": там задачите са на обекта, не на
   отделния човек — затова обхватът изобщо не се предлага. */
function notifScopeKeys(groupKey){
  return (groupKey === 'store') ? ['all','own_stores'] : ['all','own_stores','own_tasks'];
}

function renderNotifMatrix(){
  var body = document.getElementById('notif-matrix-body'); if(!body) return;
  var head = '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;margin:16px 0 6px;">Кой какво получава</div>';
  if (!adminNotifTopics.length) {
    body.innerHTML = head + '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">Няма теми.</div>';
    return;
  }
  var sel = 'style="padding:2px 4px;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;background:#fff;"';
  var thead = '<thead><tr><th>Тема</th>' +
    NOTIF_GROUPS.map(function(g){ return '<th>' + g.label + '</th>'; }).join('') + '</tr></thead>';
  var rows = adminNotifTopics.map(function(t){
    return '<tr><td style="font-weight:500;font-size:12px;">' + esc(t.label) + '</td>' +
      NOTIF_GROUPS.map(function(g){
        var m = notifMatrixCell(t.key, g.key);
        var ch = (m && m.channel) || 'none';
        var chSel = '<select ' + sel + ' onchange="notifMatrixChannel(this,\'' + esc(t.key) + '\',\'' + esc(g.key) + '\')">' +
          ['none','email','push','both'].map(function(c){
            return '<option value="' + c + '"' + (c===ch?' selected':'') + '>' + NOTIF_CHANNEL_LABELS[c] + '</option>';
          }).join('') + '</select>';
        /* Няма ред в базата (или каналът е none) → обхватът е безсмислен и
           клетката показва „—". Редът се създава при първия избор на канал. */
        var scopeHtml = (m && ch !== 'none')
          ? '<div class="ntf-scope-txt" title="Смени обхвата" onclick="openNotifScopeModal(\'' + esc(t.key) + '\',\'' + esc(g.key) + '\')"' +
              ' style="margin-top:3px;font-size:10.5px;color:#2563eb;cursor:pointer;border-bottom:1px dotted #93c5fd;display:inline-block;">' +
              esc(NOTIF_SCOPE_LABELS[m.scope] || m.scope || 'всичко') + '</div>'
          : '<div class="ntf-empty-cell" style="margin-top:3px;color:#cbd5e1;font-size:10.5px;">—</div>';
        return '<td style="white-space:nowrap;vertical-align:top;">' + chSel + scopeHtml + '</td>';
      }).join('') + '</tr>';
  }).join('');
  var legend = '<div style="font-size:11px;color:#64748b;margin-top:8px;line-height:1.7;">' +
    'Обхватът е синият текст под канала — клик върху него го сменя.<br>' +
    '<b>всичко</b> — човекът получава по темата за всички обекти.<br>' +
    '<b>своите обекти</b> — само за обектите, които са му назначени (за група „Магазин" — неговият обект).<br>' +
    '<b>своите задачи</b> — само редовете, на които той е отговорник.' +
    '</div>';
  body.innerHTML = head + '<div class="tbl-wrap"><table>' + thead + '<tbody>' + rows + '</tbody></table></div>' + legend;
}

function notifMatrixChannel(sel, topicKey, groupKey){
  var ch = sel.value;
  var m = notifMatrixCell(topicKey, groupKey);
  var flt = 'topic_key=eq.' + encodeURIComponent(topicKey) + '&group_key=eq.' + encodeURIComponent(groupKey);
  /* „none" е равносилно на празна клетка — редът се ТРИЕ, не се записва със
     стойност 'none'. Иначе матрицата се пълни с редове, които не значат нищо,
     а edge функцията ги чете при всяко събуждане. */
  if (ch === 'none') {
    if (!m) { renderNotifMatrix(); return; }
    sbDelete('notification_matrix', flt).then(function(res){
      if(!res.ok){ toast('Грешка при изтриване: ' + sbErrMsg(res), '#dc2626'); loadNotificationsAdmin(); return; }
      adminNotifMatrix = adminNotifMatrix.filter(function(x){
        return !(x.topic_key === topicKey && x.group_key === groupKey);
      });
      logAudit('notif_matrix_cleared', { details: { topic_key: topicKey, group_key: groupKey } });
      toast('✅ Клетката е изчистена');
      renderNotifMatrix();
    });
    return;
  }
  if (m) {
    sbPatch('notification_matrix', flt, { channel: ch }).then(function(res){
      if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); loadNotificationsAdmin(); return; }
      m.channel = ch;
      logAudit('notif_matrix_changed', { details: { topic_key: topicKey, group_key: groupKey, channel: ch } });
      toast('✅ Записано');
      renderNotifMatrix();
    });
    return;
  }
  sbPost('notification_matrix', { topic_key: topicKey, group_key: groupKey, channel: ch, scope: 'all' }).then(function(res){
    if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); loadNotificationsAdmin(); return; }
    adminNotifMatrix.push({ topic_key: topicKey, group_key: groupKey, channel: ch, scope: 'all' });
    logAudit('notif_matrix_added', { details: { topic_key: topicKey, group_key: groupKey, channel: ch } });
    toast('✅ Записано');
    renderNotifMatrix();
  });
}

/* Обхватът вече НЕ е второ падащо меню в клетката. Пет групи по два списъка
   не се побират: таблицата тръгваше на хоризонтален плъзгач и последната
   колона („Магазин") излизаше отрязана. В клетката остава само каналът, а
   обхватът е кратък текст под него, който се кликва и отваря този модал. */
var _notifScopeCell = null;

function openNotifScopeModal(topicKey, groupKey){
  var m = notifMatrixCell(topicKey, groupKey);
  /* Клетка без ред няма обхват — текстът дори не се рендира, но екранът може
     да е остарял спрямо базата. */
  if (!m) { renderNotifMatrix(); return; }
  _notifScopeCell = { topic: topicKey, group: groupKey };
  var g = NOTIF_GROUPS.filter(function(x){ return x.key === groupKey; })[0];
  var old = document.getElementById('notif-scope-modal-ov'); if(old) old.remove();
  var html = '<div class="bov open" id="notif-scope-modal-ov" onclick="if(event.target===this)closeNotifScopeModal()">' +
    '<div class="bmod" style="width:340px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<div style="font-size:15px;font-weight:700;">Обхват</div>' +
      '<button onclick="closeNotifScopeModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>' +
    '</div>' +
    '<div style="font-size:11.5px;color:#64748b;margin-bottom:12px;">' +
      esc(notifTopicLabel(topicKey)) + ' · група „' + esc(g ? g.label : groupKey) + '"</div>' +
    notifScopeKeys(groupKey).map(function(k){
      var cur = (m.scope === k);
      return '<button class="ntf-scope-opt" data-scope="' + escAttr(k) + '" onclick="pickNotifScope(\'' + esc(k) + '\')"' +
        ' style="display:block;width:100%;text-align:left;margin-bottom:6px;border:1px solid ' + (cur ? '#2563eb' : '#e2e8f0') +
        ';background:' + (cur ? '#eff6ff' : '#fff') + ';border-radius:8px;padding:9px 11px;font-size:12.5px;cursor:pointer;">' +
        (cur ? '● ' : '○ ') + esc(NOTIF_SCOPE_LABELS[k]) + '</button>';
    }).join('') +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeNotifScopeModal(){
  var ov = document.getElementById('notif-scope-modal-ov'); if(ov) ov.remove();
  _notifScopeCell = null;
}

function pickNotifScope(scope){
  if (!_notifScopeCell) return;
  var topicKey = _notifScopeCell.topic, groupKey = _notifScopeCell.group;
  var m = notifMatrixCell(topicKey, groupKey);
  if (!m) { closeNotifScopeModal(); renderNotifMatrix(); return; }
  /* Същият обхват — няма какво да се записва, само се затваря. Иначе всяко
     отваряне-затваряне би оставяло ред в одита. */
  if (m.scope === scope) { closeNotifScopeModal(); return; }
  var flt = 'topic_key=eq.' + encodeURIComponent(topicKey) + '&group_key=eq.' + encodeURIComponent(groupKey);
  sbPatch('notification_matrix', flt, { scope: scope }).then(function(res){
    if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); closeNotifScopeModal(); loadNotificationsAdmin(); return; }
    m.scope = scope;
    logAudit('notif_matrix_changed', { details: { topic_key: topicKey, group_key: groupKey, scope: scope } });
    toast('✅ Записано');
    closeNotifScopeModal();
    renderNotifMatrix();
  });
}

/* ── Изключения по човек ───────────────────────────────────────────────── */

function renderNotifOverrides(){
  var body = document.getElementById('notif-overrides-body'); if(!body) return;
  /* Стои непосредствено под матрицата нарочно: в матрицата не личи, че някой
     има изключение за темата — двете се четат само едно до друго. */
  var head = '<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 6px;">' +
    '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Изключения по човек</div>' +
    '<button onclick="openNotifOverrideModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:4px 10px;font-size:11.5px;cursor:pointer;">+ Ново изключение</button>' +
    '</div>' +
    '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">Изключението бие матрицата за конкретния човек: „включва" го добавя извън групите му, „изключва" го маха.</div>';
  if (!adminNotifOverrides.length) {
    body.innerHTML = head + '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">Няма изключения.</div>';
    return;
  }
  var rows = adminNotifOverrides.map(function(o){
    var inc = o.mode === 'include';
    return '<tr>' +
      '<td style="font-size:12px;">' + esc(o.user_email) + '</td>' +
      '<td style="font-size:12px;">' + esc(notifTopicLabel(o.topic_key)) + '</td>' +
      '<td><span style="background:' + (inc?'#dcfce7':'#fee2e2') + ';color:' + (inc?'#166534':'#991b1b') + ';padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">' +
        (NOTIF_MODE_LABELS[o.mode] || esc(o.mode)) + '</span></td>' +
      '<td style="font-size:12px;">' + (o.channel ? (NOTIF_CHANNEL_LABELS[o.channel] || esc(o.channel)) : '<span style="color:#cbd5e1;">—</span>') + '</td>' +
      '<td style="font-size:12px;">' + (o.scope ? (NOTIF_SCOPE_LABELS[o.scope] || esc(o.scope)) : '<span style="color:#cbd5e1;">—</span>') + '</td>' +
      '<td style="font-size:11px;color:#64748b;">' + (o.note ? esc(o.note) : '') + '</td>' +
      '<td><button onclick="deleteNotifOverride(\'' + esc(o.id) + '\')" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button></td>' +
    '</tr>';
  }).join('');
  body.innerHTML = head + '<div class="tbl-wrap"><table>' +
    '<thead><tr><th>Човек</th><th>Тема</th><th>Режим</th><th>Канал</th><th>Обхват</th><th>Бележка</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}

function openNotifOverrideModal(){
  if (!adminNotifTopics.length) { toast('Темите не са заредени','#dc2626'); return; }
  if (!adminNotifUsers.length) { toast('Списъкът с потребители не е зареден','#dc2626'); return; }
  _renderNotifOverrideModal();
}

function _renderNotifOverrideModal(){
  var old = document.getElementById('notif-ovr-modal-ov'); if(old) old.remove();
  var html = '<div class="bov open" id="notif-ovr-modal-ov" onclick="if(event.target===this)closeNotifOverrideModal()">' +
    '<div class="bmod" style="width:440px;max-height:88vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;">👤 Ново изключение</div>' +
    '<button onclick="closeNotifOverrideModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>' +
    '</div>' +
    '<label class="fl">Човек *</label>' +
    '<select class="fi" id="ntf-ovr-user" style="margin-bottom:10px;">' +
      adminNotifUsers.map(function(u){
        return '<option value="' + escAttr(u.email) + '">' + esc((u.display_name || u.email) + ' · ' + u.email) + '</option>';
      }).join('') +
    '</select>' +
    '<label class="fl">Тема *</label>' +
    '<select class="fi" id="ntf-ovr-topic" style="margin-bottom:10px;">' +
      adminNotifTopics.map(function(t){
        return '<option value="' + escAttr(t.key) + '">' + esc(t.label) + '</option>';
      }).join('') +
    '</select>' +
    '<label class="fl">Режим *</label>' +
    '<select class="fi" id="ntf-ovr-mode" onchange="notifOverrideModeChange()" style="margin-bottom:10px;">' +
      '<option value="include">включва — получава, макар групите му да не го дават</option>' +
      '<option value="exclude">изключва — не получава, макар групите му да го дават</option>' +
    '</select>' +
    '<div id="ntf-ovr-chan-box">' +
      '<label class="fl">Канал</label>' +
      '<select class="fi" id="ntf-ovr-channel" style="margin-bottom:10px;">' +
        ['email','push','both'].map(function(c){
          return '<option value="' + c + '">' + NOTIF_CHANNEL_LABELS[c] + '</option>';
        }).join('') +
      '</select>' +
      '<label class="fl">Обхват</label>' +
      '<select class="fi" id="ntf-ovr-scope" style="margin-bottom:10px;">' +
        ['all','own_stores','own_tasks'].map(function(s){
          return '<option value="' + s + '">' + NOTIF_SCOPE_LABELS[s] + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '<label class="fl">Бележка</label>' +
    '<input class="fi" id="ntf-ovr-note" placeholder="защо е направено изключението" style="margin-bottom:14px;">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="closeNotifOverrideModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitNotifOverride()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

/* При „изключва" канал и обхват не значат нищо — скриват се и се пишат NULL. */
function notifOverrideModeChange(){
  var box = document.getElementById('ntf-ovr-chan-box');
  if (box) box.style.display = (v('ntf-ovr-mode') === 'exclude') ? 'none' : 'block';
}

function closeNotifOverrideModal(){
  var ov = document.getElementById('notif-ovr-modal-ov'); if(ov) ov.remove();
}

function submitNotifOverride(){
  var email = v('ntf-ovr-user');
  var topic = v('ntf-ovr-topic');
  var mode  = v('ntf-ovr-mode');
  if (!email || !topic) { toast('Избери човек и тема','#dc2626'); return; }
  /* Уникалността е (user_email, topic_key) в базата — 409 оттам е верният
     отговор, но безполезен за човека. Затова се казва ПРЕДИ заявката. */
  var dup = adminNotifOverrides.filter(function(o){
    return o.user_email === email && o.topic_key === topic;
  })[0];
  if (dup) {
    toast('⚠️ ' + email + ' вече има изключение за „' + notifTopicLabel(topic) + '" — изтрий старото първо.', '#dc2626');
    return;
  }
  var isExclude = mode === 'exclude';
  var payload = {
    user_email: email,
    topic_key: topic,
    mode: mode,
    channel: isExclude ? null : v('ntf-ovr-channel'),
    scope:   isExclude ? null : v('ntf-ovr-scope'),
    note: v('ntf-ovr-note') || null
  };
  sbPost('notification_overrides', payload).then(function(res){
    if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); return; }
    logAudit('notif_override_added', { details: payload });
    toast('✅ Изключението е записано');
    closeNotifOverrideModal();
    loadNotificationsAdmin();
  });
}

function deleteNotifOverride(id){
  var o = adminNotifOverrides.filter(function(x){ return x.id === id; })[0];
  if (!confirm('Изтрий изключението' + (o ? ' на ' + o.user_email : '') + '?')) return;
  sbDelete('notification_overrides','id=eq.' + encodeURIComponent(id)).then(function(res){
    if(!res.ok){ toast('Грешка при изтриване: ' + sbErrMsg(res), '#dc2626'); return; }
    if (res.count === 0) { toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadNotificationsAdmin(); return; }
    logAudit('notif_override_deleted', { details: { id: id, user_email: o ? o.user_email : null, topic_key: o ? o.topic_key : null } });
    toast('✅ Изтрито');
    loadNotificationsAdmin();
  });
}

/* ── users.notify_groups — колоната „Групи" в списъка с потребители ─────── */

var NOTIFY_GROUP_LABELS = { co: 'ЦО', controlling: 'Контролинг', regional: 'Регионален', owner: 'Собственик' };
var NOTIFY_GROUP_ORDER  = ['co','controlling','regional','owner'];

function notifyGroupsOf(u){
  var g = u && u.notify_groups;
  if (Array.isArray(g)) return g;
  if (typeof g === 'string' && g.length > 2) {
    return g.replace(/^{|}$/g,'').split(',')
      .map(function(s){ return s.trim().replace(/^"|"$/g,''); })
      .filter(Boolean);
  }
  return [];
}

/* is_regional и notify_groups са ДВЕ независими полета. report.js още чете
   is_regional, затова тя не се пипа тук — обединяването им е отделна задача.
   Разминаването само се показва: ⚠️ на реда, без автоматична поправка. */
function notifyGroupsMismatch(u){
  return (!!(u && u.is_regional)) !== (notifyGroupsOf(u).indexOf('regional') >= 0);
}

function notifyGroupsCell(u){
  var g = notifyGroupsOf(u);
  var badges = g.length
    ? g.map(function(k){
        return '<span style="background:#eef2ff;color:#3730a3;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;margin-right:3px;">' +
          esc(NOTIFY_GROUP_LABELS[k] || k) + '</span>';
      }).join('')
    : '<span style="color:#94a3b8;">—</span>';
  var warn = notifyGroupsMismatch(u)
    ? '<span title="is_regional и notify_groups не съвпадат — проверѝ ръчно" style="color:#b45309;font-weight:700;margin-right:4px;">⚠️</span>'
    : '';
  return warn + badges;
}

var _notifyGroupsUserId = null;
var _notifyGroupsUserName = null;

function editNotifyGroups(userId, userName){
  _notifyGroupsUserId = userId;
  _notifyGroupsUserName = userName;
  sbGet('users','id=eq.' + userId + '&select=notify_groups,is_regional').then(function(data){
    var u = (Array.isArray(data) && data[0]) ? data[0] : {};
    _renderNotifyGroupsModal(userName, notifyGroupsOf(u), !!u.is_regional);
  });
}

function _renderNotifyGroupsModal(userName, currentList, isRegional){
  var old = document.getElementById('notify-groups-modal-ov'); if(old) old.remove();
  var mismatch = isRegional !== (currentList.indexOf('regional') >= 0);
  var html = '<div class="bov open" id="notify-groups-modal-ov" onclick="if(event.target===this)closeNotifyGroupsModal()">' +
    '<div class="bmod" style="width:400px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;">🔔 Групи за известия — ' + esc(userName) + '</div>' +
    '<button onclick="closeNotifyGroupsModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button>' +
    '</div>' +
    '<div style="font-size:11.5px;color:#64748b;margin-bottom:10px;">Групата решава кои теми стигат до човека — според матрицата в „🔔 Известия". Група „Магазин" не се задава тук: тя следва обекта на човека.</div>' +
    (mismatch
      ? '<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 10px;font-size:11.5px;margin-bottom:10px;">⚠️ is_regional = ' + (isRegional?'да':'не') + ', а групата „Регионален" ' + (isRegional?'липсва':'е сложена') + '. Двете полета се четат от различен код (report.js чете is_regional) — изравни ги съзнателно.</div>'
      : '') +
    '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;">' +
    NOTIFY_GROUP_ORDER.map(function(k){
      return '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;cursor:pointer;">' +
        '<input type="checkbox" class="ntf-grp-cb" value="' + k + '" ' + (currentList.indexOf(k)>=0?'checked':'') + '> ' +
        esc(NOTIFY_GROUP_LABELS[k]) + '</label>';
    }).join('') +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeNotifyGroupsModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitNotifyGroups()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeNotifyGroupsModal(){
  var ov = document.getElementById('notify-groups-modal-ov'); if(ov) ov.remove();
  _notifyGroupsUserId = null;
  _notifyGroupsUserName = null;
}

function submitNotifyGroups(){
  /* Колоната е NOT NULL — при нула отметки се пише празен масив, не null. */
  var sel = [].map.call(document.querySelectorAll('.ntf-grp-cb:checked'), function(cb){ return cb.value; });
  sbPatch('users','id=eq.' + _notifyGroupsUserId, { notify_groups: sel }).then(function(res){
    if(!res.ok){ toast('Грешка при запис: ' + sbErrMsg(res), '#dc2626'); return; }
    logAudit('user_notify_groups_changed', {
      details: { target_user_id: _notifyGroupsUserId, target_user_name: _notifyGroupsUserName, groups: sel }
    });
    toast('✅ Групите са записани');
    closeNotifyGroupsModal();
    loadUsersAdmin();
  });
}
