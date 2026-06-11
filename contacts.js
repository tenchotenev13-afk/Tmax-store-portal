/* contacts.js — Контакти & Доставчици */

var SB_CONTACTS = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var SB_CKEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var SB_CBKT     = 'contacts';
var SB_CPUB     = SB_CONTACTS + '/storage/v1/object/public/' + SB_CBKT + '/';

var allContacts  = [];
var contactsTab  = 'contact'; /* contact | supplier */
var contactsEdit = null;      /* редактиран запис */

/* ─── LOAD ──────────────────────────────────────────────── */
function loadContacts() {
  var wrap = document.getElementById('mod-contacts');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  sbGet('contacts', 'order=name').then(function(data) {
    allContacts = Array.isArray(data) ? data : [];
    renderContacts();
  }).catch(function(err) {
    if (wrap) wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане: ' + (err.message||err) + '</div>';
    console.error('loadContacts error:', err);
  });
}

/* ─── RENDER ────────────────────────────────────────────── */
function renderContacts() {
  var wrap = document.getElementById('mod-contacts');
  if (!wrap) return;

  var isAdmin = canEditContacts();
  var list = allContacts.filter(function(c) { return c.type === contactsTab; });
  var search = (document.getElementById('contacts-search') || {}).value || '';
  if (search) {
    search = search.toLowerCase();
    list = list.filter(function(c) {
      return (c.name||'').toLowerCase().indexOf(search) >= 0 ||
             (c.role_title||'').toLowerCase().indexOf(search) >= 0 ||
             (c.phone||'').indexOf(search) >= 0 ||
             (c.store_name||'').toLowerCase().indexOf(search) >= 0;
    });
  }

  var html = '<div style="max-width:1320px;margin:0 auto;padding:16px;">';

  /* Хедър */
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">';
  html += '<div style="display:flex;gap:8px;">';
  html += '<button onclick="setContactsTab(\'contact\')" style="border:none;padding:7px 18px;border-radius:40px;font-size:13px;font-weight:600;cursor:pointer;background:'+(contactsTab==='contact'?'#0f172a':'#f1f5f9')+';color:'+(contactsTab==='contact'?'#fff':'#64748b')+';">👥 Контакти</button>';
  html += '<button onclick="setContactsTab(\'supplier\')" style="border:none;padding:7px 18px;border-radius:40px;font-size:13px;font-weight:600;cursor:pointer;background:'+(contactsTab==='supplier'?'#0f172a':'#f1f5f9')+';color:'+(contactsTab==='supplier'?'#fff':'#64748b')+';">🏭 Доставчици</button>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;">';
  html += '<input id="contacts-search" placeholder="🔍 Търси..." oninput="renderContacts()" value="'+esc(search)+'" style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px;font-size:13px;font-family:inherit;outline:none;width:200px;">';
  if (isAdmin) {
    html += '<button onclick="openContactModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>';
  }
  html += '</div></div>';

  /* Карти — групирани по отдел/категория */
  if (!list.length) {
    html += '<div style="text-align:center;padding:60px;color:#94a3b8;">' +
      '<div style="font-size:40px;margin-bottom:10px;">'+(contactsTab==='contact'?'👥':'🏭')+'</div>' +
      '<div>Няма '+(contactsTab==='contact'?'контакти':'доставчици')+'.</div>' +
      (isAdmin?'<button onclick="openContactModal(null)" style="margin-top:14px;border:none;background:#2563eb;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>':'') +
      '</div>';
  } else {
    /* Групирай по категория */
    var groups = {};
    list.forEach(function(c) {
      var cat = c.category || 'Друго';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    var catOrder = ['Централно снабдяване','Отдел внос','Отдел Реклама','Онлайн магазин','Отдел контролинг','IT','Друго'];
    var cats = Object.keys(groups).sort(function(a,b){
      var ai = catOrder.indexOf(a); var bi = catOrder.indexOf(b);
      if(ai===-1)ai=99; if(bi===-1)bi=99;
      return ai-bi;
    });
    cats.forEach(function(cat) {
      html += '<div style="margin-bottom:24px;">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
      html += '<div style="font-size:14px;font-weight:700;color:#0f172a;">'+esc(cat)+'</div>';
      html += '<div style="flex:1;height:1px;background:#e2e8f0;"></div>';
      html += '<div style="font-size:11px;color:#94a3b8;">'+groups[cat].length+' '+(contactsTab==='contact'?'души':'доставчика')+'</div>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">';
    list.forEach(function(c) {
      var initials = (c.name||'?').split(' ').map(function(w){return w[0];}).slice(0,2).join('').toUpperCase();
      var bgColors = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2'];
      var bg = bgColors[Math.abs(c.name.charCodeAt(0)+c.name.charCodeAt(1)||0) % bgColors.length];

      html += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05);transition:.2s;" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.1)\'" onmouseout="this.style.boxShadow=\'0 1px 4px rgba(0,0,0,.05)\'">';

      /* Снимка / Аватар */
      html += '<div style="height:120px;background:linear-gradient(135deg,'+bg+' 0%,'+bg+'cc 100%);display:flex;align-items:center;justify-content:center;position:relative;">';
      if (c.photo_url) {
        html += '<img src="'+c.photo_url+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.8);">';
      } else {
        html += '<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.2);border:3px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;">'+initials+'</div>';
      }
      if (c.category) {
        html += '<span style="position:absolute;top:8px;right:8px;background:rgba(255,255,255,.25);color:#fff;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;">'+esc(c.category)+'</span>';
      }
      html += '</div>';

      /* Информация */
      html += '<div style="padding:14px;">';
      html += '<div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:2px;">'+esc(c.name||'')+'</div>';
      if (c.role_title) html += '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">'+esc(c.role_title)+'</div>';
      if (c.store_name) html += '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">🏪 '+esc(c.store_name)+'</div>';

      if (c.phone) html += '<a href="tel:'+esc(c.phone)+'" style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f1f5f9;text-decoration:none;color:#0f172a;font-size:13px;">📞 '+esc(c.phone)+'</a>';
      if (c.email) html += '<a href="mailto:'+esc(c.email)+'" style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f1f5f9;text-decoration:none;color:#2563eb;font-size:13px;">✉️ '+esc(c.email)+'</a>';
      if (c.address) html += '<div style="font-size:12px;color:#64748b;padding:5px 0;display:flex;gap:6px;align-items:flex-start;">📍 <span>'+esc(c.address)+'</span></div>';
      if (c.notes) html += '<div style="font-size:12px;color:#94a3b8;margin-top:6px;font-style:italic;">'+esc(c.notes)+'</div>';

      if (isAdmin) {
        html += '<div style="display:flex;gap:6px;margin-top:10px;">';
        html += '<button data-id="'+c.id+'" onclick="openContactModal(this.getAttribute(\'data-id\'))" style="flex:1;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:5px;font-size:12px;cursor:pointer;">✏️ Редактирай</button>';
        html += '<button data-id="'+c.id+'" onclick="deleteContact(this.getAttribute(\'data-id\'))" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">✕</button>';
        html += '</div>';
      }
      html += '</div></div>';
    });
      html += '</div></div>'; /* close grid + group */
    });
  }

  html += '</div>';
  try {
    html += contactModalHtml();
  } catch(e) { console.error('contactModalHtml error:', e); }
  wrap.innerHTML = html;
}

function setContactsTab(tab) { contactsTab = tab; renderContacts(); }

/* ─── MODAL ─────────────────────────────────────────────── */
function contactModalHtml() {
  var isEdit = !!contactsEdit;
  var c = contactsEdit || {};
  var catOptions = contactsTab === 'supplier'
    ? ['Материали','Стоки','Услуги','Логистика','Друго']
    : ['Управител','Счетоводство','Логистика','Контролинг','Технически','Друго'];

  return '<div class="bov" id="contact-ov"><div class="bmod" style="width:500px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави '+(contactsTab==='supplier'?'доставчик':'контакт'))+'</div>'+
    '<button onclick="closeContactModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+

    /* Снимка */
    '<div style="text-align:center;margin-bottom:14px;">'+
    '<div id="contact-photo-wrap" style="width:90px;height:90px;border-radius:50%;background:#e2e8f0;margin:0 auto 8px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:32px;color:#94a3b8;">'+
    (c.photo_url ? '<img src="'+c.photo_url+'" style="width:100%;height:100%;object-fit:cover;">' : '👤')+
    '</div>'+
    '<label style="font-size:12px;color:#2563eb;cursor:pointer;font-weight:600;">📷 Смени снимка<input type="file" id="contact-photo-input" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" onchange="previewContactPhoto(this)"></label>'+
    '</div>'+

    '<label class="fl">Име *</label><input class="fi" id="c-name" value="'+esc(c.name||'')+'" placeholder="Пълно име">'+
    '<label class="fl">Длъжност / Роля</label><input class="fi" id="c-role" value="'+esc(c.role_title||'')+'" placeholder="напр. Управител">'+
    '<label class="fl">Категория</label>'+
    '<select class="fi" id="c-cat">'+catOptions.map(function(o){return '<option'+(c.category===o?' selected':'')+'>'+o+'</option>';}).join('')+'</select>'+
    (contactsTab==='contact'?'<label class="fl">Магазин</label><input class="fi" id="c-store" value="'+esc(c.store_name||'')+'" placeholder="напр. Кърджали">':'<input type="hidden" id="c-store" value="">') +
    '<label class="fl">Телефон</label><input class="fi" id="c-phone" value="'+esc(c.phone||'')+'" placeholder="+359 ...">'+
    '<label class="fl">Имейл</label><input class="fi" id="c-email" value="'+esc(c.email||'')+'" placeholder="name@example.com">'+
    '<label class="fl">Адрес</label><input class="fi" id="c-addr" value="'+esc(c.address||'')+'" placeholder="Град, улица ...">'+
    '<label class="fl">Бележки</label><textarea class="fi" id="c-notes" rows="2" style="resize:none;" placeholder="Допълнителна информация">'+esc(c.notes||'')+'</textarea>'+

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
    '<button onclick="closeContactModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
    '<button onclick="submitContact()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
}

function openContactModal(id) {
  contactsEdit = id ? (allContacts.find(function(c){return c.id===id;}) || null) : null;
  renderContacts();
  document.getElementById('contact-ov').classList.add('open');
}
function closeContactModal() {
  var ov = document.getElementById('contact-ov');
  if (ov) ov.classList.remove('open');
  contactsEdit = null;
}

function previewContactPhoto(input) {
  var file = input.files[0]; if (!file) return;
  var wrap = document.getElementById('contact-photo-wrap');
  var reader = new FileReader();
  reader.onload = function(e) {
    if (wrap) wrap.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover;">';
  };
  reader.readAsDataURL(file);
}

/* ─── SUBMIT ─────────────────────────────────────────────── */
function submitContact() {
  var name = (document.getElementById('c-name').value || '').trim();
  if (!name) { toast('Въведи име', '#dc2626'); return; }

  var data = {
    name:       name,
    type:       contactsTab,
    role_title: document.getElementById('c-role').value,
    category:   document.getElementById('c-cat').value,
    store_name: (document.getElementById('c-store') || {}).value || '',
    phone:      document.getElementById('c-phone').value,
    email:      document.getElementById('c-email').value,
    address:    document.getElementById('c-addr').value,
    notes:      document.getElementById('c-notes').value
  };

  var photoInput = document.getElementById('contact-photo-input');
  var file = photoInput && photoInput.files && photoInput.files[0];

  if (file) {
    uploadContactPhoto(file, data);
  } else {
    if (contactsEdit && contactsEdit.photo_url) data.photo_url = contactsEdit.photo_url;
    saveContact(data);
  }
}

function uploadContactPhoto(file, data) {
  var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  var path = 'photos/' + Date.now() + '.' + ext;
  toast('⏳ Качване на снимка...');
  var reader = new FileReader();
  reader.onload = function(e) {
    fetch(SB_CONTACTS + '/storage/v1/object/' + SB_CBKT + '/' + path, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SB_CKEY, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
      body: e.target.result
    }).then(function(r) {
      if (!r.ok) { toast('Грешка при качване', '#dc2626'); return; }
      data.photo_url = SB_CPUB + path;
      saveContact(data);
    }).catch(function(err) { toast('Грешка: ' + err.message, '#dc2626'); });
  };
  reader.readAsArrayBuffer(file);
}

function saveContact(data) {
  var p = contactsEdit
    ? sbPatch('contacts', 'id=eq.' + contactsEdit.id, data)
    : sbPost('contacts', data);
  p.then(function(res) {
    if (!res.ok) { toast('Грешка', '#dc2626'); return; }
    closeContactModal();
    toast('✅ ' + (contactsEdit ? 'Записано!' : 'Добавено!'));
    loadContacts();
  });
}

function deleteContact(id) {
  if (!confirm('Изтрий записа?')) return;
  sbDelete('contacts', 'id=eq.' + id).then(function() {
    toast('✓ Изтрит');
    loadContacts();
  });
}
