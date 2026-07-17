/* admin.js — Администрация (само за роля admin) */

function loadAdmin(){
  loadStoresAdmin();
  loadUsersAdmin();
  loadRestrictionsAdmin();
  loadCatalogAdmin();
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
        '<td><button onclick="deleteStore(\''+s.id+'\')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">× Изтрий</button></td>'+
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
    toast('✓ Магазинът е добавен');loadStoresAdmin();
  });
}

function deleteStore(id){
  if(!confirm('Изтрий магазина?'))return;
  sbDelete('stores','id=eq.'+id).then(function(){toast('✓ Изтрит');loadStoresAdmin();});
}

/* ══════════════════════════════════════════
   ПОТРЕБИТЕЛИ — СПИСЪК
══════════════════════════════════════════ */

function loadUsersAdmin(){
  sbGet('users','order=role,email&select=id,email,display_name,store_name,role,active,assigned_stores').then(function(data){
    var body=document.getElementById('users-body');if(!body)return;
    var list=Array.isArray(data)?data:[];
    if(!list.length){body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">Няма потребители.</td></tr>';return;}
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
        '<td><span style="background:'+(roleBg[u.role]||'#f3f4f6')+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+esc(u.role)+'</span></td>'+
        '<td style="font-size:11px;color:#64748b;">'+
          (isGlobalRole
            ? '<span style="color:'+(storesStr==='—'?'#16a34a':'#2563eb')+';">'+(storesStr==='—'?'Всички магазини':esc(storesStr))+'</span>'+
              ' <button onclick="editAssigned(\''+u.id+'\',\''+esc(u.display_name||u.email)+'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:1px 7px;font-size:10px;cursor:pointer;margin-left:4px;">✏️</button>'
            : esc(u.store_name||'—'))+
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

function editAssigned(userId, userName){
  _assignedEditUserId = userId;
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
}

function submitAssigned(){
  var wantsAll = document.getElementById('assigned-all').checked;
  var selected = Array.from(document.querySelectorAll('.assigned-store-cb')).filter(function(cb){return cb.checked;}).map(function(cb){return cb.value;});
  var payload = wantsAll ? {assigned_stores: null} : {assigned_stores: selected.length ? selected : null};
  sbPatch('users','id=eq.'+_assignedEditUserId, payload).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    toast(wantsAll ? '✅ Вижда всички магазини' : '✅ Назначени '+selected.length+' магазина');
    closeAssignedModal();
    loadUsersAdmin();
  });
}

function deleteUser(id, email){
  if(!confirm('Изтрий потребител:\n'+email+'\n\nТова действие е необратимо!'))return;
  sbDelete('users','id=eq.'+id).then(function(){
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
    sbGet('users','id=eq.'+_userEditId+'&select=id,email,display_name,store_name,role,active').then(function(data){
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
  if(pass) data.password=pass;

  var p=_userEditId
    ? sbPatch('users','id=eq.'+_userEditId, data)
    : sbPost('users', Object.assign({email:email}, data));

  p.then(function(res){
    if(!res.ok){
      res.json&&res.json().then(function(e){
        toast('Грешка: '+(e.message||e.error||JSON.stringify(e)),'#dc2626');
      }).catch(function(){toast('Грешка при запис','#dc2626');});
      return;
    }
    toast('✅ '+(_userEditId?'Записано!':'Колегата е добавен!'));
    closeUserModal();
    loadUsersAdmin();
  });
}

/* ═══════════════════════════════════════════════════════════════
   BACKUP СИСТЕМА — Admin панел
   Добавя се в admin.js
═══════════════════════════════════════════════════════════════ */

function loadBackupAdmin(){
  sbGet('backup_snapshots','order=created_at.desc&limit=30').then(function(data){
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
var CATALOG_UNIT_MAP={'БР':'бр.','КАШ':'кашон','КОМПЛ':'компл.','ЧИФТ':'чифт','ПАК':'пакет','КВМ':'кв.м','ЛМ':'л.м'};
function normalizeCatalogUnit(u){
  u=(u||'').trim().toUpperCase();
  return CATALOG_UNIT_MAP[u]||(u?u.toLowerCase():'бр.');
}
function parseDelimitedCatalog(text){
  var delim=text.indexOf('\t')>=0?'\t':',';
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
    if(!mapped.length){progEl.innerHTML='<span style="color:#dc2626;">Не бяха разпознати редове. Провери дали колоните се казват точно "Материал"/"Описание на Материал".</span>';return;}
    progEl.textContent='⏳ Качване на 0 / '+mapped.length+'...';
    batchUpsertCatalog(mapped,function(done,total){
      progEl.textContent='⏳ Качване на '+done+' / '+total+'...';
    },function(){
      progEl.innerHTML='<span style="color:#16a34a;">✅ Готово! Обработени '+mapped.length+' артикула.</span>';
      toast('✅ Каталогът е обновен!');
      loadCatalogAdmin();
    });
  };
  reader.readAsText(file,'UTF-8');
}
function batchUpsertCatalog(rows,onProgress,onDone){
  var BATCH=500;
  var i=0;
  function next(){
    if(i>=rows.length){onDone();return;}
    var batch=rows.slice(i,i+BATCH);
    fetch(API+'/product_catalog',{
      method:'POST',
      headers:Object.assign({},H,{'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify(batch)
    }).then(function(){
      i+=BATCH;
      onProgress(Math.min(i,rows.length),rows.length);
      next();
    }).catch(function(err){
      console.error('Каталог upsert грешка на партида '+i+':',err);
      i+=BATCH;
      onProgress(Math.min(i,rows.length),rows.length);
      next();
    });
  }
  next();
}
