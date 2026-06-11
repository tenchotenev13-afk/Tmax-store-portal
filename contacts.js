/* contacts.js — Контакти & Доставчици */

var SB_CONTACTS = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var SB_CKEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var SB_CBKT     = 'contacts';
var SB_CPUB     = SB_CONTACTS + '/storage/v1/object/public/' + SB_CBKT + '/';

var allContacts  = [];
var contactsTab  = 'contact';
var contactsEdit = null;

var CAT_ORDER = ['Централно снабдяване','Отдел внос','Отдел Реклама',
                 'Онлайн магазин','Отдел контролинг','IT','Друго'];

function loadContacts() {
  var wrap = document.getElementById('mod-contacts');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  sbGet('contacts', 'order=category,name').then(function(data) {
    allContacts = Array.isArray(data) ? data : [];
    renderContacts();
  }).catch(function(err) {
    if (wrap) wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка: ' + (err.message||err) + '</div>';
  });
}

function canEditContacts() {
  return currentUser && ['admin','accounting'].indexOf(currentUser.role) >= 0;
}

function renderContacts() {
  var wrap = document.getElementById('mod-contacts');
  if (!wrap) return;

  var isAdmin = canEditContacts();
  var search  = (document.getElementById('contacts-search')||{}).value || '';
  var list    = allContacts.filter(function(c) { return c.type === contactsTab; });

  if (search) {
    var q = search.toLowerCase();
    list = list.filter(function(c) {
      return (c.name||'').toLowerCase().indexOf(q)>=0 ||
             (c.role_title||'').toLowerCase().indexOf(q)>=0 ||
             (c.phone||'').indexOf(q)>=0 ||
             (c.category||'').toLowerCase().indexOf(q)>=0;
    });
  }

  /* ── Хедър ── */
  var h = '<div style="max-width:1320px;margin:0 auto;padding:16px;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:20px;">';
  h += '<div style="display:flex;gap:8px;">';
  ['contact','supplier'].forEach(function(tab) {
    var active = contactsTab === tab;
    var lbl    = tab === 'contact' ? '👥 Контакти' : '🏭 Доставчици';
    h += '<button onclick="setContactsTab(\'' + tab + '\')" style="border:none;padding:7px 18px;border-radius:40px;font-size:13px;font-weight:600;cursor:pointer;' +
         'background:' + (active?'#0f172a':'#f1f5f9') + ';color:' + (active?'#fff':'#64748b') + ';">' + lbl + '</button>';
  });
  h += '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center;">';
  h += '<input id="contacts-search" placeholder="🔍 Търси по име, отдел, телефон..." oninput="renderContacts()" value="' + esc(search) + '" style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 14px;font-size:13px;font-family:inherit;outline:none;width:260px;">';
  if (isAdmin) h += '<button onclick="openContactModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
  h += '</div></div>';

  /* ── Съдържание ── */
  if (!list.length) {
    h += '<div style="text-align:center;padding:60px;color:#94a3b8;">';
    h += '<div style="font-size:40px;margin-bottom:10px;">' + (contactsTab==='contact'?'👥':'🏭') + '</div>';
    h += '<div style="font-size:15px;">Няма ' + (contactsTab==='contact'?'контакти':'доставчици') + (search?' за "'+esc(search)+'"':'') + '.</div>';
    if (isAdmin && !search) h += '<button onclick="openContactModal(null)" style="margin-top:14px;border:none;background:#2563eb;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
    h += '</div>';
  } else {
    /* Групирай по категория */
    var groups = {};
    list.forEach(function(c) {
      var cat = c.category || 'Друго';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    var cats = Object.keys(groups).sort(function(a,b) {
      var ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
      return (ai<0?99:ai) - (bi<0?99:bi);
    });

    cats.forEach(function(cat) {
      var members = groups[cat];
      /* Заглавие на групата */
      h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;margin-top:8px;">';
      h += '<div style="font-size:14px;font-weight:700;color:#0f172a;white-space:nowrap;">'+esc(cat)+'</div>';
      h += '<div style="flex:1;height:1px;background:#e2e8f0;"></div>';
      h += '<div style="font-size:11px;color:#94a3b8;white-space:nowrap;">'+members.length+' '+(contactsTab==='contact'?'души':'доставчика')+'</div>';
      h += '</div>';
      /* Карти */
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-bottom:28px;">';
      members.forEach(function(c) {
        h += contactCard(c, isAdmin);
      });
      h += '</div>';
    });
  }

  h += '</div>';

  /* Модал */
  h += contactModalHtml();

  wrap.innerHTML = h;
}

function contactCard(c, isAdmin) {
  var initials = (c.name||'?').split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase();
  var bgC = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#0f172a'];
  var bg  = bgC[(c.name.charCodeAt(0)||0) % bgC.length];

  var h  = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">';
  /* Топ лента с аватар */
  h += '<div style="height:100px;background:linear-gradient(135deg,'+bg+','+bg+'bb);display:flex;align-items:center;justify-content:center;position:relative;">';
  if (c.photo_url) {
    h += '<img src="'+c.photo_url+'" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.8);">';
  } else {
    h += '<div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.2);border:3px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;">'+initials+'</div>';
  }
  h += '</div>';
  /* Тяло */
  h += '<div style="padding:12px 14px;">';
  h += '<div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px;">'+esc(c.name||'')+'</div>';
  if (c.role_title) h += '<div style="font-size:11px;color:#64748b;margin-bottom:6px;">'+esc(c.role_title)+'</div>';
  if (c.phone) h += '<a href="tel:'+esc(c.phone)+'" style="display:flex;align-items:center;gap:6px;padding:4px 0;text-decoration:none;color:#0f172a;font-size:12.5px;border-bottom:1px solid #f8fafc;">📞 '+esc(c.phone)+'</a>';
  if (c.email) h += '<a href="mailto:'+esc(c.email)+'" style="display:flex;align-items:center;gap:6px;padding:4px 0;text-decoration:none;color:#2563eb;font-size:12px;border-bottom:1px solid #f8fafc;">✉️ '+esc(c.email)+'</a>';
  if (c.notes) h += '<div style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.4;">'+esc(c.notes.slice(0,80))+(c.notes.length>80?'...':'')+'</div>';
  if (isAdmin) {
    h += '<div style="display:flex;gap:6px;margin-top:10px;">';
    h += '<button data-id="'+c.id+'" onclick="openContactModal(this.dataset.id)" style="flex:1;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:5px;font-size:12px;cursor:pointer;">✏️ Редактирай</button>';
    h += '<button data-id="'+c.id+'" onclick="doDeleteContact(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">✕</button>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function setContactsTab(tab) { contactsTab = tab; renderContacts(); }
function doDeleteContact(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('contacts','id=eq.'+id).then(function(){toast('✓ Изтрит');loadContacts();});
}

/* ── Модал ── */
function contactModalHtml() {
  var c = contactsEdit || {};
  var isEdit = !!contactsEdit;
  var catOpts = contactsTab==='supplier'
    ? ['Материали','Стоки','Услуги','Логистика','Друго']
    : CAT_ORDER;

  return '<div class="bov" id="contact-ov">' +
    '<div class="bmod" style="width:480px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави '+(contactsTab==='supplier'?'доставчик':'контакт'))+'</div>' +
    '<button onclick="closeContactModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<div style="text-align:center;margin-bottom:14px;">' +
    '<div id="contact-photo-wrap" style="width:80px;height:80px;border-radius:50%;background:#e2e8f0;margin:0 auto 8px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:28px;">' +
    (c.photo_url?'<img src="'+c.photo_url+'" style="width:100%;height:100%;object-fit:cover;">':'👤') +
    '</div>' +
    '<label style="font-size:12px;color:#2563eb;cursor:pointer;font-weight:600;">📷 Избери снимка' +
    '<input type="file" id="contact-photo-input" accept=".jpg,.jpeg,.png,.webp" style="display:none;" onchange="previewContactPhoto(this)"></label>' +
    '</div>' +
    '<label class="fl">Име *</label><input class="fi" id="c-name" value="'+esc(c.name||'')+'" placeholder="Пълно име">' +
    '<label class="fl">Длъжност / Роля</label><input class="fi" id="c-role" value="'+esc(c.role_title||'')+'" placeholder="напр. Управител">' +
    '<label class="fl">Отдел / Категория</label>' +
    '<select class="fi" id="c-cat">'+catOpts.map(function(o){return '<option'+(c.category===o?' selected':'')+'>'+o+'</option>';}).join('')+'</select>' +
    (contactsTab==='contact'?'<label class="fl">Магазин</label><input class="fi" id="c-store" value="'+esc(c.store_name||'')+'" placeholder="напр. Кърджали">':'<input type="hidden" id="c-store" value="">') +
    '<label class="fl">Телефон</label><input class="fi" id="c-phone" value="'+esc(c.phone||'')+'" placeholder="0888 ...">'+
    '<label class="fl">Имейл</label><input class="fi" id="c-email" value="'+esc(c.email||'')+'" placeholder="name@temax.bg">'+
    '<label class="fl">Бележки / Групи</label><textarea class="fi" id="c-notes" rows="2" style="resize:none;">'+esc(c.notes||'')+'</textarea>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeContactModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitContact()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>' +
    '</div></div></div>';
}

function openContactModal(id) {
  contactsEdit = id ? (allContacts.find(function(c){return c.id===id;})||null) : null;
  renderContacts();
  var ov = document.getElementById('contact-ov');
  if (ov) ov.classList.add('open');
}
function closeContactModal() {
  var ov = document.getElementById('contact-ov');
  if (ov) ov.classList.remove('open');
  contactsEdit = null;
}
function previewContactPhoto(input) {
  var file=input.files[0]; if(!file)return;
  var wrap=document.getElementById('contact-photo-wrap');
  var reader=new FileReader();
  reader.onload=function(e){if(wrap)wrap.innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover;">';};
  reader.readAsDataURL(file);
}

function submitContact() {
  var name=(document.getElementById('c-name').value||'').trim();
  if(!name){toast('Въведи име','#dc2626');return;}
  var data={
    name:name, type:contactsTab,
    role_title:document.getElementById('c-role').value,
    category:document.getElementById('c-cat').value,
    store_name:(document.getElementById('c-store')||{}).value||'',
    phone:document.getElementById('c-phone').value,
    email:document.getElementById('c-email').value,
    notes:document.getElementById('c-notes').value
  };
  var file=(document.getElementById('contact-photo-input')||{}).files;
  if(file&&file[0]){
    uploadContactPhoto(file[0],data);
  } else {
    if(contactsEdit&&contactsEdit.photo_url)data.photo_url=contactsEdit.photo_url;
    saveContact(data);
  }
}

function uploadContactPhoto(file,data) {
  var ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  var path='photos/'+Date.now()+'.'+ext;
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(SB_CONTACTS+'/storage/v1/object/'+SB_CBKT+'/'+path,{
      method:'POST',headers:{'Authorization':'Bearer '+SB_CKEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      if(!r.ok){toast('Грешка при качване','#dc2626');return;}
      data.photo_url=SB_CPUB+path;
      saveContact(data);
    }).catch(function(e){toast('Грешка: '+e.message,'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}

function saveContact(data) {
  var p=contactsEdit
    ? sbPatch('contacts','id=eq.'+contactsEdit.id,data)
    : sbPost('contacts',data);
  p.then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeContactModal();
    toast('✅ '+(contactsEdit?'Записано!':'Добавено!'));
    loadContacts();
  });
}
