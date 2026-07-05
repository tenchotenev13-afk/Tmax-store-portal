/* reference.js — Гаранционен справочник (Марка × Под-категория) */

var refSubcats   = [];
var refBrands    = [];
var refSelSubcat = '';
var refSelBrand  = '';
var refEntry     = null;   /* текущо зареден запис от warranty_entries */
var refLocations = [];     /* сервизни точки за избраната марка */
var refEditId    = null;   /* за админ модала на entry */

var REF_STORES = ['Враца','Габрово','Гоце Делчев','Добрич','Дупница','Карлово','Козлодуй',
  'Кърджали','Монтана','Петрич','Пирдоп','Раднево','Севлиево','Силистра','Сливен',
  'Троян','Търговище','Шумен','Резервен 1','Резервен 2','Резервен 3','Резервен 4','Резервен 5'];

function canEditRef() {
  return currentUser && ['admin','accounting'].indexOf(currentUser.role) >= 0;
}

/* ── LOAD (dropdown списъци) ── */
function loadReference() {
  var wrap = document.getElementById('mod-reference');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  Promise.all([
    sbGet('warranty_subcategories','order=name.asc'),
    sbGet('warranty_brands','order=name.asc')
  ]).then(function(r) {
    refSubcats = Array.isArray(r[0]) ? r[0] : [];
    refBrands  = Array.isArray(r[1]) ? r[1] : [];
    renderReference();
  }).catch(function(err) {
    if (wrap) wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка при зареждане.</div>';
    console.error(err);
  });
}

/* ── RENDER ── */
function renderReference() {
  var wrap = document.getElementById('mod-reference');
  if (!wrap) return;
  var isAdmin = canEditRef();

  var h = '<div style="max-width:1100px;margin:0 auto;padding:16px;">';

  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">';
  h += '<div style="font-size:20px;font-weight:600;">📘 Гаранционен справочник</div>';
  if (isAdmin) {
    h += '<div style="display:flex;gap:8px;">';
    h += '<button onclick="openRefAdminList()" style="border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">⚙️ Управление на записи</button>';
    h += '</div>';
  }
  h += '</div>';
  h += '<div style="font-size:12px;color:#94a3b8;margin-bottom:16px;">Изберете под-категория и марка — картата се зарежда автоматично.</div>';

  /* Избор на комбинация */
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px;">';
  h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Избор на комбинация</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
  h += '<div><label class="fl">Под-категория</label><select class="fi" id="ref-subcat" onchange="refOnChange()">' +
    '<option value="">-- Избери --</option>' +
    refSubcats.map(function(s){return '<option value="'+s.id+'"'+(String(refSelSubcat)===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>';}).join('') +
    '</select></div>';
  h += '<div><label class="fl">Марка</label><select class="fi" id="ref-brand" onchange="refOnChange()">' +
    '<option value="">-- Избери --</option>' +
    refBrands.map(function(b){return '<option value="'+b.id+'"'+(String(refSelBrand)===String(b.id)?' selected':'')+'>'+esc(b.name)+'</option>';}).join('') +
    '</select></div>';
  h += '</div></div>';

  /* Картата */
  h += '<div id="ref-card"></div>';
  h += '</div>';

  wrap.innerHTML = h;
  renderRefCard();
}

function refOnChange() {
  refSelSubcat = document.getElementById('ref-subcat').value;
  refSelBrand  = document.getElementById('ref-brand').value;
  if (!refSelSubcat || !refSelBrand) { refEntry = null; refLocations = []; renderRefCard(); return; }

  var cardEl = document.getElementById('ref-card');
  if (cardEl) cardEl.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане на картата...</div>';

  Promise.all([
    sbGet('warranty_entries', 'brand_id=eq.'+refSelBrand+'&subcategory_id=eq.'+refSelSubcat),
    sbGet('warranty_service_locations', 'brand_id=eq.'+refSelBrand+'&order=store_name.asc')
  ]).then(function(r) {
    refEntry     = (Array.isArray(r[0]) && r[0].length) ? r[0][0] : null;
    refLocations = Array.isArray(r[1]) ? r[1] : [];
    renderRefCard();
  }).catch(function(err) {
    console.error(err);
    if (cardEl) cardEl.innerHTML = '<div style="color:#dc2626;padding:20px;text-align:center;">Грешка при зареждане.</div>';
  });
}

function refField(label, val) {
  return '<div><div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">'+label+'</div>' +
    '<div style="font-size:13px;color:#0f172a;white-space:pre-wrap;">'+ (val ? esc(val) : '—') +'</div></div>';
}

function renderRefCard() {
  var cardEl = document.getElementById('ref-card');
  if (!cardEl) return;

  if (!refSelSubcat || !refSelBrand) {
    cardEl.innerHTML = '<div style="text-align:center;padding:50px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">' +
      '<div style="font-size:36px;">📘</div><div style="margin-top:8px;">Изберете под-категория и марка, за да видите картата.</div></div>';
    return;
  }

  var brandName = (refBrands.find(function(b){return String(b.id)===String(refSelBrand);})||{}).name || '';
  var subName   = (refSubcats.find(function(s){return String(s.id)===String(refSelSubcat);})||{}).name || '';

  var h = '<div style="background:#0f172a;color:#fff;border-radius:10px 10px 0 0;padding:12px 16px;font-size:14px;font-weight:600;">' +
    esc(brandName) + ' &nbsp;|&nbsp; ' + esc(subName) + '</div>';

  if (!refEntry) {
    h += '<div style="background:#fffbeb;border:1px solid #fde68a;border-top:none;border-radius:0 0 10px 10px;padding:20px;text-align:center;color:#92400e;font-weight:600;">' +
      '⚠️ Няма въведени данни за тази комбинация в справочника.' +
      (canEditRef() ? '<div style="margin-top:10px;"><button onclick="openRefEntryModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:6px 16px;font-size:12px;font-weight:600;cursor:pointer;">+ Добави запис</button></div>' : '') +
      '</div>';
    cardEl.innerHTML = h;
    return;
  }

  var r = refEntry;

  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:16px;">';

  if (canEditRef()) {
    h += '<div style="text-align:right;margin-bottom:10px;">' +
      '<button onclick="openRefEntryModal(\''+r.id+'\')" style="border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">✏️ Редактирай</button> ' +
      '<button onclick="openRefLocationsModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">🏪 Сервизни точки</button>' +
      '</div>';
  }

  /* Гаранционни условия */
  h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">🛡 Гаранционни условия</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  h += refField('Срок на гаранцията', r.warranty_period);
  h += refField('Срок за обслужване', r.claim_deadline);
  h += '<div style="grid-column:1/-1;">'+refField('За какво се отнася', r.covers)+'</div>';
  h += '<div style="grid-column:1/-1;">'+refField('Критерии за отказване', r.exclusions)+'</div>';
  h += '</div>';

  /* Данни за сервиза */
  h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">🔧 Данни за сервиза</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  h += refField('Тип сервиз', r.service_type);
  h += refField('Национален / Регионален', r.service_scope_foreign);
  h += refField('Наименование', r.service_name);
  h += refField('Работно време', r.working_hours);
  h += refField('Адрес', r.service_address);
  h += refField('Телефон', r.service_phone);
  h += refField('Имейл', r.service_email);
  h += refField('Лице за контакт', r.service_contact_person);
  h += refField('Обхват', r.coverage_scope);
  h += refField('Региони на покритие', r.coverage_regions);
  h += '<div style="grid-column:1/-1;">'+refField('Инструкции за предаване', r.handover_instructions)+'</div>';
  h += '</div>';

  /* Регионални сервизи */
  h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">📍 Регионални сервизи</div>';
  if (!refLocations.length) {
    h += '<div style="font-size:12px;color:#94a3b8;margin-bottom:16px;">Няма въведени специфични регионални сервизи (важи националният контакт по-горе за всички обекти).</div>';
  } else {
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:16px;">';
    refLocations.forEach(function(l){
      h += '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;">' +
        '<div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:4px;">🏪 '+esc(l.store_name)+'</div>' +
        (l.service_name?'<div style="font-size:11px;color:#374151;">'+esc(l.service_name)+'</div>':'') +
        (l.phone?'<div style="font-size:11px;color:#64748b;">📞 '+esc(l.phone)+'</div>':'') +
        (l.email?'<div style="font-size:11px;color:#64748b;">✉️ '+esc(l.email)+'</div>':'') +
        (l.contact_person?'<div style="font-size:11px;color:#64748b;">👤 '+esc(l.contact_person)+'</div>':'') +
        '</div>';
    });
    h += '</div>';
  }

  /* Логистика и процес */
  h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">🚚 Логистика и процес</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  h += refField('Заместващ продукт', r.replacement_product);
  h += refField('Сервизиране', r.service_location);
  h += '<div style="grid-column:1/-1;">'+refField('Пояснение към заместващ', r.replacement_note)+'</div>';
  h += '<div style="grid-column:1/-1;">'+refField('Начин на предаване', r.handover_method)+'</div>';
  h += '<div style="grid-column:1/-1;">'+refField('Необходими документи', r.required_documents)+'</div>';
  h += '<div style="grid-column:1/-1;">'+refField('Начин на уведомяване', r.notification_method)+'</div>';
  h += '<div style="grid-column:1/-1;">'+refField('Обслужване на рекламацията', r.claim_handling)+'</div>';
  h += '</div>';

  /* Въпроси към клиента */
  var questions = [r.question_1,r.question_2,r.question_3,r.question_4,r.question_5,
    r.question_6,r.question_7,r.question_8,r.question_9,r.question_10].filter(Boolean);
  if (questions.length) {
    h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">❓ Въпроси към клиента</div>';
    h += '<ol style="font-size:13px;color:#0f172a;margin:0 0 16px;padding-left:20px;">' +
      questions.map(function(q){return '<li style="margin-bottom:4px;">'+esc(q)+'</li>';}).join('') + '</ol>';
  }

  /* Бележки */
  if (r.internal_notes) {
    h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">📝 Вътрешни инструкции / Бележки</div>';
    h += '<div style="font-size:12px;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;white-space:pre-wrap;">'+esc(r.internal_notes)+'</div>';
  }

  h += '</div>';
  cardEl.innerHTML = h;
}

/* ═══════ АДМИН: Списък и управление на марки / под-категории / записи ═══════ */

function openRefAdminList() {
  var div = document.createElement('div');
  div.id = 'ref-admin-ov';
  div.className = 'bov';
  div.style.cssText = 'display:flex;';
  div.innerHTML = '<div class="bmod" style="width:640px;max-width:95vw;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:600;">⚙️ Управление на справочника</div>' +
    '<button onclick="document.getElementById(\'ref-admin-ov\').remove()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">' +
    '<button onclick="refQuickAdd(\'warranty_subcategories\',\'Нова под-категория\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">+ Под-категория</button>' +
    '<button onclick="refQuickAdd(\'warranty_brands\',\'Нова марка\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">+ Марка</button>' +
    '<button onclick="openRefEntryModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;">+ Нов запис (Марка × Под-категория)</button>' +
    '</div>' +
    '<div style="font-size:12px;color:#64748b;">Използвайте dropdown-ите в главния екран за да изберете съществуваща комбинация за редакция, или добавете нова тук.</div>' +
    '</div>';
  document.body.appendChild(div);
}

function refQuickAdd(table, promptLabel) {
  var existing = document.getElementById('refqa-ov'); if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'refqa-ov';
  div.className = 'bov';
  div.style.cssText = 'display:flex;';
  div.innerHTML = '<div class="bmod" style="width:380px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:600;">'+esc(promptLabel)+'</div>' +
    '<button onclick="document.getElementById(\'refqa-ov\').remove()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<label class="fl">Име</label><input class="fi" id="refqa-name" placeholder="напр. Адаптери">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="document.getElementById(\'refqa-ov\').remove()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitRefQuickAdd(\''+table+'\')" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Добави</button>' +
    '</div></div>';
  document.body.appendChild(div);
  div.classList.add('open');
  setTimeout(function(){ var el=document.getElementById('refqa-name'); if(el) el.focus(); }, 50);
}

function submitRefQuickAdd(table) {
  var el = document.getElementById('refqa-name');
  var name = el ? el.value.trim() : '';
  if (!name) { toast('Въведи име','#dc2626'); return; }
  sbPost(table, {name: name}).then(function(res){
    if (!res.ok) { toast('Грешка (възможно е да съществува вече)','#dc2626'); return; }
    toast('✅ Добавено!');
    var ov = document.getElementById('refqa-ov'); if (ov) ov.remove();
    loadReference();
    var adminOv = document.getElementById('ref-admin-ov'); if (adminOv) adminOv.remove();
  });
}

/* ── Модал за запис (warranty_entries) ── */
function refEntryModalHtml() {
  var r = refEntry || {};
  var isEdit = !!refEditId;

  if (!refSubcats.length || !refBrands.length) {
    return '<div class="bov" id="refe-ov"><div class="bmod" style="width:420px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
      '<div style="font-size:15px;font-weight:600;">⚠️ Няма марки/под-категории</div>' +
      '<button onclick="closeRefEntryModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
      '<div style="font-size:13px;color:#64748b;">Преди да добавиш гаранционен запис, трябва първо да имаш поне 1 под-категория и 1 марка. Затвори това и използвай "+ Под-категория" / "+ Марка" от менюто за управление.</div>' +
      '<div style="text-align:right;margin-top:16px;"><button onclick="closeRefEntryModal()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Разбрах</button></div>' +
      '</div></div>';
  }

  return '<div class="bov" id="refe-ov"><div class="bmod" style="width:640px;max-width:95vw;max-height:85vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай запис':'+ Нов гаранционен запис')+'</div>' +
    '<button onclick="closeRefEntryModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Под-категория *</label><select class="fi" id="re-subcat"><option value="">-- Избери --</option>' + refSubcats.map(function(s){return '<option value="'+s.id+'"'+(String(refSelSubcat)===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>';}).join('') + '</select></div>' +
    '<div><label class="fl">Марка *</label><select class="fi" id="re-brand"><option value="">-- Избери --</option>' + refBrands.map(function(b){return '<option value="'+b.id+'"'+(String(refSelBrand)===String(b.id)?' selected':'')+'>'+esc(b.name)+'</option>';}).join('') + '</select></div>' +
    '</div>' +

    '<label class="fl">Срок на гаранцията</label><input class="fi" id="re-period" value="'+esc(r.warranty_period||'')+'">' +
    '<label class="fl">За какво се отнася</label><textarea class="fi" id="re-covers" rows="2">'+esc(r.covers||'')+'</textarea>' +
    '<label class="fl">Критерии за отказване</label><textarea class="fi" id="re-excl" rows="2">'+esc(r.exclusions||'')+'</textarea>' +
    '<label class="fl">Срок за обслужване на претенция</label><input class="fi" id="re-deadline" value="'+esc(r.claim_deadline||'')+'">' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Тип сервиз</label><select class="fi" id="re-svctype"><option'+(r.service_type==='Чужд'?' selected':'')+'>Чужд</option><option'+(r.service_type==='Вътрешен'?' selected':'')+'>Вътрешен</option></select></div>' +
    '<div><label class="fl">Национален/Регионален</label><input class="fi" id="re-svcscope" value="'+esc(r.service_scope_foreign||'')+'"></div>' +
    '</div>' +

    '<label class="fl">Сервиз: Наименование</label><input class="fi" id="re-svcname" value="'+esc(r.service_name||'')+'">' +
    '<label class="fl">Сервиз: Адрес</label><input class="fi" id="re-svcaddr" value="'+esc(r.service_address||'')+'">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Телефон</label><input class="fi" id="re-svcphone" value="'+esc(r.service_phone||'')+'"></div>' +
    '<div><label class="fl">Имейл</label><input class="fi" id="re-svcemail" value="'+esc(r.service_email||'')+'"></div>' +
    '</div>' +
    '<label class="fl">Лице за контакт</label><input class="fi" id="re-svcperson" value="'+esc(r.service_contact_person||'')+'">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Обхват</label><input class="fi" id="re-covscope" value="'+esc(r.coverage_scope||'')+'"></div>' +
    '<div><label class="fl">Региони на покритие</label><input class="fi" id="re-covregions" value="'+esc(r.coverage_regions||'')+'"></div>' +
    '</div>' +
    '<label class="fl">Работно време</label><input class="fi" id="re-hours" value="'+esc(r.working_hours||'')+'">' +
    '<label class="fl">Инструкции за предаване</label><textarea class="fi" id="re-handover-instr" rows="2">'+esc(r.handover_instructions||'')+'</textarea>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Заместващ продукт</label><select class="fi" id="re-replace"><option'+(r.replacement_product==='Да'?' selected':'')+'>Да</option><option'+(r.replacement_product!=='Да'?' selected':'')+'>Не</option></select></div>' +
    '<div><label class="fl">Сервизиране</label><input class="fi" id="re-svcloc" value="'+esc(r.service_location||'')+'" placeholder="В сервиз / На място / И двете"></div>' +
    '</div>' +
    '<label class="fl">Пояснение към заместващ продукт</label><input class="fi" id="re-replacenote" value="'+esc(r.replacement_note||'')+'">' +
    '<label class="fl">Начин на предаване</label><input class="fi" id="re-handovermethod" value="'+esc(r.handover_method||'')+'">' +
    '<label class="fl">Необходими документи</label><textarea class="fi" id="re-docs" rows="2">'+esc(r.required_documents||'')+'</textarea>' +
    '<label class="fl">Начин на уведомяване</label><input class="fi" id="re-notify" value="'+esc(r.notification_method||'')+'">' +
    '<label class="fl">Обслужване на рекламацията</label><input class="fi" id="re-claimhandling" value="'+esc(r.claim_handling||'')+'">' +

    '<label class="fl">Въпроси към клиента (по 1 на ред, до 10)</label>' +
    '<textarea class="fi" id="re-questions" rows="4" placeholder="Кога е закупен продуктът?&#10;Имате ли касов бон?">'+
      [r.question_1,r.question_2,r.question_3,r.question_4,r.question_5,r.question_6,r.question_7,r.question_8,r.question_9,r.question_10].filter(Boolean).join('\n') +
    '</textarea>' +

    '<label class="fl">Вътрешни инструкции / Бележки</label><textarea class="fi" id="re-notes" rows="3">'+esc(r.internal_notes||'')+'</textarea>' +

    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeRefEntryModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitRefEntry()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>' +
    '</div></div></div>';
}

function openRefEntryModal(id) {
  refEditId = id;
  var existing = document.getElementById('refe-ov'); if (existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = refEntryModalHtml();
  document.body.appendChild(div.firstChild);
  document.getElementById('refe-ov').classList.add('open');
}
function closeRefEntryModal() {
  var ov = document.getElementById('refe-ov'); if (ov) ov.remove();
  refEditId = null;
}

function submitRefEntry() {
  var subcat = document.getElementById('re-subcat').value;
  var brand  = document.getElementById('re-brand').value;
  if (!subcat || !brand) { toast('Избери марка и под-категория','#dc2626'); return; }

  var qLines = (document.getElementById('re-questions').value||'').split('\n').map(function(s){return s.trim();}).filter(Boolean).slice(0,10);
  var data = {
    subcategory_id: subcat, brand_id: brand,
    warranty_period: v('re-period'), covers: v('re-covers'), exclusions: v('re-excl'), claim_deadline: v('re-deadline'),
    service_type: v('re-svctype'), service_scope_foreign: v('re-svcscope'),
    service_name: v('re-svcname'), service_address: v('re-svcaddr'), service_phone: v('re-svcphone'),
    service_email: v('re-svcemail'), service_contact_person: v('re-svcperson'),
    coverage_scope: v('re-covscope'), coverage_regions: v('re-covregions'), working_hours: v('re-hours'),
    handover_instructions: v('re-handover-instr'),
    replacement_product: v('re-replace'), replacement_note: v('re-replacenote'),
    handover_method: v('re-handovermethod'), required_documents: v('re-docs'),
    notification_method: v('re-notify'), claim_handling: v('re-claimhandling'), service_location: v('re-svcloc'),
    internal_notes: v('re-notes'),
    updated_at: new Date().toISOString()
  };
  qLines.forEach(function(q, i){ data['question_'+(i+1)] = q; });

  var p = refEditId
    ? sbPatch('warranty_entries','id=eq.'+refEditId,data)
    : sbPost('warranty_entries',data);
  p.then(function(res){
    if (!res.ok) { toast('Грешка при запис (възможно е комбинацията вече да съществува)','#dc2626'); return; }
    closeRefEntryModal();
    toast('✅ Записано!');
    refSelSubcat = subcat; refSelBrand = brand;
    document.getElementById('ref-subcat').value = subcat;
    document.getElementById('ref-brand').value = brand;
    refOnChange();
  });
}

/* ── Модал за сервизни точки по магазини (warranty_service_locations) ── */
function refLocationsModalHtml() {
  var rows = REF_STORES.map(function(storeName){
    var l = refLocations.find(function(x){return x.store_name===storeName;}) || {};
    return '<tr data-store="'+esc(storeName)+'" style="border-bottom:1px solid #f1f5f9;">' +
      '<td style="padding:5px 8px;font-weight:600;font-size:12px;white-space:nowrap;">'+esc(storeName)+'</td>' +
      '<td style="padding:5px;"><input class="fi rl-name" value="'+esc(l.service_name||'')+'" placeholder="Наименование" style="font-size:12px;"></td>' +
      '<td style="padding:5px;"><input class="fi rl-phone" value="'+esc(l.phone||'')+'" placeholder="Тел." style="font-size:12px;width:90px;"></td>' +
      '<td style="padding:5px;"><input class="fi rl-email" value="'+esc(l.email||'')+'" placeholder="Имейл" style="font-size:12px;"></td>' +
      '<td style="padding:5px;"><input class="fi rl-person" value="'+esc(l.contact_person||'')+'" placeholder="Лице" style="font-size:12px;"></td>' +
      '</tr>';
  }).join('');

  return '<div class="bov" id="refl-ov"><div class="bmod" style="width:820px;max-width:95vw;max-height:85vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
    '<div style="font-size:15px;font-weight:600;">🏪 Регионални сервизи — '+esc((refBrands.find(function(b){return String(b.id)===String(refSelBrand);})||{}).name||'')+'</div>' +
    '<button onclick="closeRefLocationsModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">Оставете празно ако важи националният контакт. Попълвайте само където има реална разлика.</div>' +
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;" id="refl-table">' +
    '<thead><tr style="background:#f8fafc;"><th style="text-align:left;padding:5px 8px;">Магазин</th><th style="text-align:left;padding:5px;">Наименование</th><th style="text-align:left;padding:5px;">Тел.</th><th style="text-align:left;padding:5px;">Имейл</th><th style="text-align:left;padding:5px;">Лице</th></tr></thead>' +
    '<tbody>'+rows+'</tbody></table></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeRefLocationsModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitRefLocations()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази всички</button>' +
    '</div></div></div>';
}

function openRefLocationsModal() {
  var existing = document.getElementById('refl-ov'); if (existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = refLocationsModalHtml();
  document.body.appendChild(div.firstChild);
  document.getElementById('refl-ov').classList.add('open');
}
function closeRefLocationsModal() {
  var ov = document.getElementById('refl-ov'); if (ov) ov.remove();
}

function submitRefLocations() {
  var rows = document.querySelectorAll('#refl-table tbody tr');
  var updates = [];
  rows.forEach(function(tr){
    var storeName = tr.getAttribute('data-store');
    var name   = tr.querySelector('.rl-name').value.trim();
    var phone  = tr.querySelector('.rl-phone').value.trim();
    var email  = tr.querySelector('.rl-email').value.trim();
    var person = tr.querySelector('.rl-person').value.trim();
    if (!name && !phone && !email && !person) return; /* празен ред — пропускаме */
    var existing = refLocations.find(function(x){return x.store_name===storeName;});
    updates.push({
      existing_id: existing ? existing.id : null,
      data: { brand_id: refSelBrand, store_name: storeName, service_name: name, phone: phone, email: email, contact_person: person }
    });
  });

  var promises = updates.map(function(u){
    return u.existing_id
      ? sbPatch('warranty_service_locations','id=eq.'+u.existing_id,u.data)
      : sbPost('warranty_service_locations',u.data);
  });

  Promise.all(promises).then(function(results){
    if (results.some(function(r){return !r.ok;})) { toast('Част от записите не бяха запазени','#dc2626'); }
    else toast('✅ Сервизните точки са записани!');
    closeRefLocationsModal();
    refOnChange();
  });
}
