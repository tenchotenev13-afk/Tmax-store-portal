/* admin.js — Администрация (само за роля admin) */

function loadAdmin(){
  loadStoresAdmin();
  loadUsersAdmin();
}

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

function loadUsersAdmin(){
  sbGet('users','order=role,email&select=id,email,display_name,store_name,role,active,assigned_stores').then(function(data){
    var body=document.getElementById('users-body');if(!body)return;
    var list=Array.isArray(data)?data:[];
    if(!list.length){body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">Няма потребители.</td></tr>';return;}
    var roleBg={manager:'#dbeafe',sklad:'#dcfce7',kasa:'#fef9c3',accounting:'#f3e8ff',admin:'#fee2e2',logistics:'#ffedd5',info:'#f1f5f9'};
    body.innerHTML=list.map(function(u){
      var stores=u.assigned_stores;
      var storesStr='—';
      if(Array.isArray(stores)&&stores.length)storesStr=stores.join(', ');
      else if(typeof stores==='string'&&stores.length>2)storesStr=stores.replace(/^{|}$/g,'');
      var isGlobalRole=['admin','accounting','logistics'].indexOf(u.role)>=0;
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
      '</tr>';
    }).join('');
  });
}

function editAssigned(userId, userName){
  var current=prompt('Магазини за '+userName+'\n\nВъведи имената разделени със запетая:\n(остави празно = вижда ВСИЧКИ)\n\nПример: Кърджали, Сливен, Раднево');
  if(current===null)return; /* cancelled */
  var stores=current.trim()
    ? current.split(',').map(function(s){return s.trim();}).filter(Boolean)
    : [];
  sbPatch('users','id=eq.'+userId,{assigned_stores:stores}).then(function(r){
    if(!r.ok){toast('Грешка при запис','#dc2626');return;}
    toast(stores.length?'✅ Назначени '+stores.length+' магазина':'✅ Вижда всички магазини');
    loadUsersAdmin();
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
