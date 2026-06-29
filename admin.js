/* admin.js — Администрация (само за роля admin) */

function loadAdmin(){
  loadStoresAdmin();
  loadUsersAdmin();
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

function editAssigned(userId, userName){
  var current=prompt('Магазини за '+userName+'\n\nВъведи имената разделени със запетая:\n(остави празно = вижда ВСИЧКИ)\n\nПример: Кърджали, Сливен, Раднево');
  if(current===null)return;
  var stores=current.trim()
    ? current.split(',').map(function(s){return s.trim();}).filter(Boolean)
    : null;
  /* Supabase очаква PostgreSQL масив или NULL */
  /* NULL = вижда всички; масив = само назначените */
  var payload = stores ? {assigned_stores: stores} : {assigned_stores: null};
  fetch(
    'https://xiwkdiqqplgdcrkewgtv.supabase.co/rest/v1/users?id=eq.'+userId,
    {
      method: 'PATCH',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    }
  ).then(function(r){ return r.json().then(function(data){ return {ok:r.ok, data:data}; }); })
  .then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');console.error(res.data);return;}
    var saved=Array.isArray(res.data)&&res.data[0]?res.data[0].assigned_stores:null;
    var count=Array.isArray(saved)?saved.length:0;
    toast(count?'✅ Назначени '+count+' магазина':'✅ Вижда всички магазини');
    loadUsersAdmin();
  }).catch(function(e){toast('Грешка: '+e.message,'#dc2626');});
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
