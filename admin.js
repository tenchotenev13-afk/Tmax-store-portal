/* admin.js — Администрация (само за роля 'admin')
   Редактирай САМО тук когато правиш промени по администрацията. */

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
      return '<tr><td style="font-weight:500;">'+esc(s.name)+'</td><td>'+esc(s.city||'')+'</td>'+
        '<td><button onclick="deleteStore(''+s.id+'')" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">× Изтрий</button></td></tr>';
    }).join('');
  });
}
function loadUsersAdmin(){
  sbGet('users','order=role,email&select=email,display_name,store_name,role,active').then(function(data){
    var body=document.getElementById('users-body');if(!body)return;
    var list=Array.isArray(data)?data:[];
    if(!list.length){body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8;">Няма потребители.</td></tr>';return;}
    var roleBg={manager:'#dbeafe',sklad:'#dcfce7',kasa:'#fef9c3',accounting:'#f3e8ff',admin:'#fee2e2',logistics:'#ffedd5',info:'#f1f5f9'};
    body.innerHTML=list.map(function(u){
      var bg=roleBg[u.role]||'#f3f4f6';
      return '<tr>'+
        '<td>'+esc(u.email)+'</td>'+
        '<td>'+esc(u.display_name||'')+'</td>'+
        '<td>'+esc(u.store_name||'')+'</td>'+
        '<td><span style="background:'+bg+';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">'+esc(u.role)+'</span></td>'+
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
