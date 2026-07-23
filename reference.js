/* reference.js — Гаранционен справочник (Марка × Под-категория) */

var refSubcats   = [];
var refBrands    = [];
var refAllEntries = []; /* {brand_id, subcategory_id} чифтове — за филтриране на dropdown-ите */
var refSelSubcat = '';
var refSelBrand  = '';
var refEntry     = null;   /* текущо зареден запис от warranty_entries */
var refBrandSubcatChoices = []; /* subcategory_id-та, когато избраната марка има >1 запис — чака избор */
var refLocations = [];     /* сервизни точки за избраната марка */
var refEditId    = null;   /* за админ модала на entry */

var REF_STORES = ['Враца','Габрово','Гоце Делчев','Добрич','Дупница','Карлово','Козлодуй',
  'Кърджали','Монтана','Петрич','Пирдоп','Раднево','Севлиево','Силистра','Сливен',
  'Троян','Търговище','Шумен','Резервен 1','Резервен 2','Резервен 3','Резервен 4','Резервен 5'];

function canEditRef() {
  return currentUser && ['admin','accounting'].indexOf(currentUser.role) >= 0;
}

/* ── Болднат текст в свободните полета: **текст** -> <b>текст</b> (само след esc(), безопасно) ── */
function mdBold(text) {
  if (!text) return '';
  return esc(text).replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>');
}
/* Бутон "B" над textarea - удебелява селектирания текст (обгражда го с **) */
function wrapBold(id) {
  var ta = document.getElementById(id); if (!ta) return;
  var start = ta.selectionStart, end = ta.selectionEnd;
  if (start === end) { toast('Първо селектирай текст за болдване', '#dc2626'); return; }
  var val = ta.value;
  ta.value = val.slice(0, start) + '**' + val.slice(start, end) + '**' + val.slice(end);
  ta.focus();
  ta.selectionStart = start + 2; ta.selectionEnd = end + 2;
}
/* Textarea с етикет + бутон "B" за болдване, за свободните текстови полета */
function taField(label, id, val, rows) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">' +
    '<label class="fl" style="margin:0;">' + label + '</label>' +
    '<button type="button" onclick="wrapBold(\'' + id + '\')" title="Селектирай текст и натисни, за да го удебелиш (или пиши ръчно **текст**)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:0 8px;font-size:11px;font-weight:700;cursor:pointer;line-height:19px;">B</button>' +
    '</div>' +
    '<textarea class="fi" id="' + id + '" rows="' + rows + '">' + esc(val || '') + '</textarea>';
}

/* ── LOAD (dropdown списъци) ── */
function loadReference() {
  var wrap = document.getElementById('mod-reference');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  Promise.all([
    sbGet('warranty_subcategories','order=name.asc'),
    sbGet('warranty_brands','order=name.asc'),
    sbGet('warranty_entries','select=brand_id,subcategory_id')
  ]).then(function(r) {
    refSubcats = Array.isArray(r[0]) ? r[0] : [];
    refBrands  = Array.isArray(r[1]) ? r[1] : [];
    refAllEntries = Array.isArray(r[2]) ? r[2] : [];
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
  h += '<div style="font-size:12px;color:#94a3b8;margin-bottom:16px;">Изберете марка — картата се зарежда автоматично.</div>';

  /* Избор на марка */
  h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px;">';
  h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Избор на марка</div>';
  var selBrandObj = refBrands.find(function(b){return String(b.id)===String(refSelBrand);});
  h += '<div style="position:relative;">' +
    '<label class="fl">Марка</label>' +
    '<input class="fi" id="ref-brand-search" autocomplete="off" placeholder="🔍 Пиши име на марка..." value="'+(selBrandObj?esc(selBrandObj.name):'')+'"' +
    ' oninput="refFilterBrandSuggestions(this.value)" onfocus="refFilterBrandSuggestions(this.value)">' +
    '<input type="hidden" id="ref-brand" value="'+esc(refSelBrand)+'">' +
    '<div id="ref-brand-suggestions" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-height:280px;overflow-y:auto;z-index:50;"></div>' +
    '</div>';
  h += '</div>';
  if (refSelBrand) {
    h += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#1e40af;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
      '<span>🔍 Показва се картата за избраната марка.</span>' +
      '<button onclick="refClearFilter()" style="border:1px solid #93c5fd;background:#fff;color:#2563eb;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;">✕ Смени марката</button>' +
      '</div>';
  }


  /* Картата */
  h += '<div id="ref-card"></div>';
  h += '</div>';

  wrap.innerHTML = h;
  renderRefCard();
}

/* Филтрира opциите на select по въведен текст (за search полетата над dropdown-ите) */
function refFilterSelect(selectId, query) {
  var select = document.getElementById(selectId);
  if (!select) return;
  var q = (query || '').trim().toLowerCase();
  var options = select.querySelectorAll('option');
  options.forEach(function(opt) {
    if (!opt.value) { opt.style.display = ''; return; } /* "-- Избери --" винаги видима */
    opt.style.display = (!q || opt.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
}

/* Филтрира label-ите в checkbox списъка (за multi-select под-категория при нов запис) */
function refFilterCheckboxList(containerId, query) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var q = (query || '').trim().toLowerCase();
  container.querySelectorAll('label').forEach(function(lbl) {
    lbl.style.display = (!q || lbl.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
}

/* Изчиства избора на марка — премахва картата и показва пълния списък отначало */
function refClearFilter() {
  refSelSubcat = '';
  refSelBrand  = '';
  refEntry     = null;
  refLocations = [];
  refBrandSubcatChoices = [];
  renderReference();
}

/* Показва живо филтрирани предложения под полето за търсене на марка (истински combobox,
   вместо отделен dropdown, който трябваше ръчно да се отваря след писане) */
function refFilterBrandSuggestions(query) {
  var box = document.getElementById('ref-brand-suggestions');
  if (!box) return;
  var q = (query || '').trim().toLowerCase();
  var matches = q ? refBrands.filter(function(b){ return (b.name||'').toLowerCase().indexOf(q) >= 0; }) : refBrands;
  if (!matches.length) {
    box.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:#94a3b8;">Няма съвпадения</div>';
  } else {
    box.innerHTML = matches.slice(0, 50).map(function(b){
      return '<div onclick="refSelectBrandSuggestion(\''+b.id+'\')" style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'#fff\'">'+esc(b.name)+'</div>';
    }).join('');
  }
  box.style.display = 'block';
}

/* Избор на конкретна марка от предложенията */
function refSelectBrandSuggestion(brandId) {
  var brandObj = refBrands.find(function(b){return String(b.id)===String(brandId);}) || {};
  document.getElementById('ref-brand-search').value = brandObj.name || '';
  document.getElementById('ref-brand').value = brandId;
  var box = document.getElementById('ref-brand-suggestions');
  if (box) box.style.display = 'none';
  refOnBrandChange();
}

/* Затваря предложенията при клик извън полето/списъка */
document.addEventListener('click', function(e){
  var box = document.getElementById('ref-brand-suggestions');
  var input = document.getElementById('ref-brand-search');
  if (!box || box.style.display !== 'block') return;
  if (box.contains(e.target) || e.target === input) return;
  box.style.display = 'none';
});

/* Марката е сменена в основния selector.
   0 записа → празно състояние. 1 запис → зарежда директно. >1 → показва picker (renderRefCard). */
function refOnBrandChange() {
  var newBrand = document.getElementById('ref-brand').value;
  refSelBrand  = newBrand;
  refSelSubcat = '';
  refEntry     = null;
  refLocations = [];
  refBrandSubcatChoices = [];
  renderReference();

  if (!newBrand) { renderRefCard(); return; }

  var cardEl = document.getElementById('ref-card');
  if (cardEl) cardEl.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div>';

  sbGet('warranty_entries','brand_id=eq.'+newBrand+'&select=subcategory_id').then(function(rows){
    var ids = (Array.isArray(rows) ? rows : []).map(function(r){return r.subcategory_id;});
    if (!ids.length) { refEntry = null; refLocations = []; renderRefCard(); return; }
    if (ids.length === 1) { refLoadEntry(newBrand, ids[0]); return; }
    refBrandSubcatChoices = ids; /* повече от 1 запис за тази марка — колегата избира кой */
    renderRefCard();
  }).catch(function(err){
    console.error(err);
    var el = document.getElementById('ref-card');
    if (el) el.innerHTML = '<div style="color:#dc2626;padding:20px;text-align:center;">Грешка при зареждане.</div>';
  });
}

/* Реално зарежда конкретния запис (марка+под-категория вече еднозначно определени) и картата към него */
function refLoadEntry(brandId, subcatId) {
  refSelBrand  = brandId;
  refSelSubcat = subcatId;
  refBrandSubcatChoices = [];

  var cardEl = document.getElementById('ref-card');
  if (cardEl) cardEl.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане на картата...</div>';

  Promise.all([
    sbGet('warranty_entries', 'brand_id=eq.'+brandId+'&subcategory_id=eq.'+subcatId),
    sbGet('warranty_service_locations', 'brand_id=eq.'+brandId+'&order=store_name.asc')
  ]).then(function(r) {
    refEntry     = (Array.isArray(r[0]) && r[0].length) ? r[0][0] : null;
    refLocations = Array.isArray(r[1]) ? r[1] : [];
    renderRefCard();
  }).catch(function(err) {
    console.error(err);
    var el = document.getElementById('ref-card');
    if (el) el.innerHTML = '<div style="color:#dc2626;padding:20px;text-align:center;">Грешка при зареждане.</div>';
  });
}

function refField(label, val) {
  return '<div><div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">'+label+'</div>' +
    '<div style="font-size:13px;color:#0f172a;white-space:pre-wrap;">'+ (val ? mdBold(val) : '—') +'</div></div>';
}

function renderRefCard() {
  var cardEl = document.getElementById('ref-card');
  if (!cardEl) return;

  if (!refSelBrand) {
    cardEl.innerHTML = '<div style="text-align:center;padding:50px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">' +
      '<div style="font-size:36px;">📘</div><div style="margin-top:8px;">Изберете марка, за да видите картата.</div></div>';
    return;
  }

  if (refBrandSubcatChoices.length > 1 && !refSelSubcat) {
    var brandNameForChoice = (refBrands.find(function(b){return String(b.id)===String(refSelBrand);})||{}).name || '';
    cardEl.innerHTML = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;">' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:10px;">'+esc(brandNameForChoice)+' покрива няколко категории с различни гаранционни условия — избери коя:</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      refBrandSubcatChoices.map(function(scId){
        var s = refSubcats.find(function(x){return String(x.id)===String(scId);}) || {};
        return '<button onclick="refLoadEntry(\''+refSelBrand+'\',\''+scId+'\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;">'+esc(s.name||'—')+'</button>';
      }).join('') +
      '</div></div>';
    return;
  }

  if (!refSelSubcat) {
    cardEl.innerHTML = '<div style="text-align:center;padding:50px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">' +
      '<div style="font-size:36px;">⏳</div><div style="margin-top:8px;">Зареждане...</div></div>';
    return;
  }

  var brandObj  = refBrands.find(function(b){return String(b.id)===String(refSelBrand);}) || {};
  var brandName = brandObj.name || '';
  var subcatObj = refSubcats.find(function(s){return String(s.id)===String(refSelSubcat);}) || {};
  var subName   = subcatObj.name || '';

  /* РЪЧЕН избор на гаранционна карта вместо автоматично познаване по марка/категория —
     автоматичното мапване често сочеше към грешен шаблон (потвърден бъг). Колегата,
     който държи продукта, знае най-добре коя от 11-те карти е правилната. */
  var WARRANTY_TEMPLATES = [
    ['hobby.pdf','Hobby / Дребни артикули'],
    ['heatmann.pdf','Heatmann / Кухненски ел. уреди'],
    ['tayfun.pdf','Тайфун'],
    ['mehanik.pdf','Механик / Ръчни инструменти'],
    ['agromashini.pdf','Агро машини (косачки, тримери...)'],
    ['smesiteli.pdf','Смесители'],
    ['praskachka.pdf','Пръскачки'],
    ['oranzherii.pdf','Оранжерии'],
    ['monoblok.pdf','Моноблокове'],
    ['powervac.pdf','Ел. инструменти (винтоверти, перфоратори...)'],
    ['mivkialpaka.pdf','Мивки алпака']
  ];
  var templatePicker =
    '<div style="position:relative;display:inline-block;">' +
      '<button onclick="var m=document.getElementById(\'ref-tpl-menu\');m.style.display=m.style.display===\'block\'?\'none\':\'block\';" style="background:#2563eb;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">🖨 Гаранционна карта ▾</button>' +
      '<div id="ref-tpl-menu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:260px;z-index:50;overflow:hidden;">' +
        WARRANTY_TEMPLATES.map(function(t){
          return '<a href="warranty-templates/'+encodeURIComponent(t[0])+'" target="_blank" style="display:block;padding:8px 12px;font-size:12.5px;color:#1a1a1a;text-decoration:none;border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'#fff\'">'+esc(t[1])+'</a>';
        }).join('') +
      '</div>' +
    '</div>';

  var h = '<div style="background:#0f172a;color:#fff;border-radius:10px 10px 0 0;padding:12px 16px;font-size:14px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
    '<span>' + esc(brandName) + ' &nbsp;|&nbsp; ' + esc(subName) + '</span>' +
    templatePicker +
    '</div>';

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
      questions.map(function(q){return '<li style="margin-bottom:4px;">'+mdBold(q)+'</li>';}).join('') + '</ol>';
  }

  /* Бележки */
  if (r.internal_notes) {
    h += '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin:6px 0 10px;">📝 Вътрешни инструкции / Бележки</div>';
    h += '<div style="font-size:12px;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;white-space:pre-wrap;">'+mdBold(r.internal_notes)+'</div>';
  }

  h += '</div>';
  cardEl.innerHTML = h;
}

/* ═══════ АДМИН: Списък и управление на марки / под-категории / записи ═══════ */

function refAdminListHtml(items, table) {
  if (!items.length) return '<div style="font-size:12px;color:#94a3b8;padding:8px;">Няма записи.</div>';
  return items.map(function(it){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:12.5px;">' +
      '<span>'+esc(it.name)+'</span>' +
      '<span style="display:flex;gap:4px;flex-shrink:0;">' +
      '<button onclick="refRenamePrompt(\''+table+'\',\''+it.id+'\')" title="Преименувай" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">✏️</button>' +
      '<button onclick="refDeletePrompt(\''+table+'\',\''+it.id+'\')" title="Изтрий" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer;">🗑</button>' +
      '</span></div>';
  }).join('');
}

function openRefAdminList() {
  var div = document.createElement('div');
  div.id = 'ref-admin-ov';
  div.className = 'bov';
  div.style.cssText = 'display:flex;';
  div.innerHTML = '<div class="bmod" style="width:680px;max-width:95vw;max-height:85vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:600;">⚙️ Управление на справочника</div>' +
    '<button onclick="document.getElementById(\'ref-admin-ov\').remove()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<button onclick="openRefEntryModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px;">+ Нов запис (Марка × Под-категория)</button>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Марки ('+refBrands.length+')</div>' +
        '<button onclick="refQuickAdd(\'warranty_brands\',\'Нова марка\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;">+ Добави</button>' +
        '</div>' +
        '<div style="border:1px solid #e2e8f0;border-radius:8px;max-height:280px;overflow-y:auto;">'+refAdminListHtml(refBrands,'warranty_brands')+'</div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Под-категории ('+refSubcats.length+')</div>' +
        '<button onclick="refQuickAdd(\'warranty_subcategories\',\'Нова под-категория\')" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;">+ Добави</button>' +
        '</div>' +
        '<div style="border:1px solid #e2e8f0;border-radius:8px;max-height:280px;overflow-y:auto;">'+refAdminListHtml(refSubcats,'warranty_subcategories')+'</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-top:14px;">Изтриването е блокирано, ако марката/категорията вече се използва в гаранционен запис или сервизна точка — изтрий тях първо.</div>' +
    '</div>';
  document.body.appendChild(div);
}

/* ── Преименуване на марка/под-категория ── */
function refRenameModalHtml(table, currentName) {
  var label = table === 'warranty_brands' ? 'Преименувай марка' : 'Преименувай под-категория';
  return '<div class="bov" id="refrn-ov"><div class="bmod" style="width:380px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:600;">✏️ '+label+'</div>' +
    '<button onclick="document.getElementById(\'refrn-ov\').remove()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<label class="fl">Ново име</label><input class="fi" id="refrn-name" value="'+esc(currentName)+'">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="document.getElementById(\'refrn-ov\').remove()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitRefRename(\''+table+'\')" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Запази</button>' +
    '</div></div></div>';
}
function refRenamePrompt(table, id) {
  var list = table === 'warranty_brands' ? refBrands : refSubcats;
  var item = list.find(function(x){return String(x.id)===String(id);});
  if (!item) return;
  var existing = document.getElementById('refrn-ov'); if (existing) existing.remove();
  var div = document.createElement('div');
  div.innerHTML = refRenameModalHtml(table, item.name);
  document.body.appendChild(div.firstChild);
  div = document.getElementById('refrn-ov');
  div.dataset.id = id;
  div.classList.add('open');
  setTimeout(function(){ var el=document.getElementById('refrn-name'); if(el){el.focus();el.select();} }, 50);
}
function submitRefRename(table) {
  var ov = document.getElementById('refrn-ov');
  var id = ov ? ov.dataset.id : null;
  var el = document.getElementById('refrn-name');
  var name = el ? el.value.trim() : '';
  if (!name || !id) { toast('Въведи име','#dc2626'); return; }
  sbPatch(table, 'id=eq.'+id, {name:name}).then(function(res){
    if (!res.ok) { toast('Грешка при запис (възможно е името вече да съществува)','#dc2626'); return; }
    toast('✅ Преименувано!');
    if (ov) ov.remove();
    loadReference();
    var adminOv = document.getElementById('ref-admin-ov'); if (adminOv) adminOv.remove();
  });
}

/* ── Изтриване на марка/под-категория (блокирано, ако вече се използва) ── */
function refDeletePrompt(table, id) {
  var list = table === 'warranty_brands' ? refBrands : refSubcats;
  var item = list.find(function(x){return String(x.id)===String(id);});
  if (!item) return;
  var field = table === 'warranty_brands' ? 'brand_id' : 'subcategory_id';
  var entryCount = refAllEntries.filter(function(e){return String(e[field])===String(id);}).length;

  var proceed = function(locCount) {
    var total = entryCount + locCount;
    if (total > 0) {
      var parts = [];
      if (entryCount) parts.push(entryCount+' гаранционен запис('+(entryCount===1?'':'а')+')');
      if (locCount) parts.push(locCount+' сервизна точка/и');
      toast('⚠️ Не може да се изтрие — използва се в '+parts.join(' и ')+'. Изтрий ги първо.', '#dc2626');
      return;
    }
    if (!confirm('Сигурен ли си, че искаш да изтриеш "'+item.name+'"? Действието е необратимо.')) return;
    sbDelete(table, 'id=eq.'+id).then(function(res){
      if (!res.ok) { toast('Грешка при изтриване','#dc2626'); return; }
      toast('✅ Изтрито!');
      loadReference();
      var adminOv = document.getElementById('ref-admin-ov'); if (adminOv) adminOv.remove();
    });
  };

  if (table === 'warranty_brands') {
    sbGet('warranty_service_locations','select=id&brand_id=eq.'+id).then(function(rows){
      proceed(Array.isArray(rows) ? rows.length : 0);
    });
  } else {
    proceed(0);
  }
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
    '<div style="font-size:11px;color:#94a3b8;margin:-8px 0 12px;">💡 За удебелен текст: селектирай и натисни бутона <b>B</b>, или пиши ръчно <b>**текст**</b>.</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    (isEdit
      ? '<div><label class="fl">Под-категория *</label>' +
        '<input class="fi" id="re-subcat-search" placeholder="🔍 Търси сред '+refSubcats.length+'..." oninput="refFilterSelect(\'re-subcat\',this.value)" style="margin-bottom:4px;">' +
        '<select class="fi" id="re-subcat"><option value="">-- Избери --</option>' + refSubcats.map(function(s){return '<option value="'+s.id+'"'+(String(refSelSubcat)===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>';}).join('') + '</select></div>'
      : '<div><label class="fl">Под-категории * <span style="font-weight:400;text-transform:none;color:#94a3b8;">(избери 1 или повече — записът ще се приложи към всичките)</span></label>' +
        '<input class="fi" id="re-subcat-search" placeholder="🔍 Търси сред '+refSubcats.length+'..." oninput="refFilterCheckboxList(\'re-subcat-cb-list\',this.value)" style="margin-bottom:4px;">' +
        '<div id="re-subcat-cb-list" style="max-height:180px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;">' +
        refSubcats.map(function(s){return '<label style="display:flex;align-items:center;gap:6px;padding:3px 2px;font-size:12.5px;cursor:pointer;"><input type="checkbox" class="re-subcat-cb" value="'+s.id+'"> '+esc(s.name)+'</label>';}).join('') +
        '</div></div>') +
    '<div><label class="fl">Марка *</label><select class="fi" id="re-brand"><option value="">-- Избери --</option>' + refBrands.map(function(b){return '<option value="'+b.id+'"'+(String(refSelBrand)===String(b.id)?' selected':'')+'>'+esc(b.name)+'</option>';}).join('') + '</select></div>' +
    '</div>' +

    '<label class="fl">Срок на гаранцията</label><input class="fi" id="re-period" value="'+esc(r.warranty_period||'')+'">' +
    taField('За какво се отнася','re-covers',r.covers,2) +
    taField('Критерии за отказване','re-excl',r.exclusions,2) +
    '<label class="fl">Срок за обслужване на претенция</label><input class="fi" id="re-deadline" value="'+esc(r.claim_deadline||'')+'">' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Тип сервиз</label><select class="fi" id="re-svctype"><option value=""'+(!r.service_type?' selected':'')+'>— Няма данни —</option><option'+(r.service_type==='Чужд'?' selected':'')+'>Чужд</option><option'+(r.service_type==='Вътрешен'?' selected':'')+'>Вътрешен</option></select></div>' +
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
    taField('Инструкции за предаване','re-handover-instr',r.handover_instructions,2) +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label class="fl">Заместващ продукт</label><select class="fi" id="re-replace"><option value=""'+(!r.replacement_product?' selected':'')+'>— Няма данни —</option><option'+(r.replacement_product==='Да'?' selected':'')+'>Да</option><option'+(r.replacement_product==='Не'?' selected':'')+'>Не</option></select></div>' +
    '<div><label class="fl">Сервизиране</label><input class="fi" id="re-svcloc" value="'+esc(r.service_location||'')+'" placeholder="В сервиз / На място / И двете"></div>' +
    '</div>' +
    '<label class="fl">Пояснение към заместващ продукт</label><input class="fi" id="re-replacenote" value="'+esc(r.replacement_note||'')+'">' +
    '<label class="fl">Начин на предаване</label><input class="fi" id="re-handovermethod" value="'+esc(r.handover_method||'')+'">' +
    taField('Необходими документи','re-docs',r.required_documents,2) +
    '<label class="fl">Начин на уведомяване</label><input class="fi" id="re-notify" value="'+esc(r.notification_method||'')+'">' +
    '<label class="fl">Обслужване на рекламацията</label><input class="fi" id="re-claimhandling" value="'+esc(r.claim_handling||'')+'">' +

    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">' +
    '<label class="fl" style="margin:0;">Въпроси към клиента (по 1 на ред, до 10)</label>' +
    '<button type="button" onclick="wrapBold(\'re-questions\')" title="Селектирай текст и натисни, за да го удебелиш" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:0 8px;font-size:11px;font-weight:700;cursor:pointer;line-height:19px;">B</button>' +
    '</div>' +
    '<textarea class="fi" id="re-questions" rows="4" placeholder="Кога е закупен продуктът?&#10;Имате ли касов бон?">'+
      [r.question_1,r.question_2,r.question_3,r.question_4,r.question_5,r.question_6,r.question_7,r.question_8,r.question_9,r.question_10].filter(Boolean).join('\n') +
    '</textarea>' +

    taField('Вътрешни инструкции / Бележки','re-notes',r.internal_notes,3) +

    '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:16px;">' +
    (isEdit ? '<button onclick="refDeleteEntryPrompt()" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;margin-right:auto;">🗑 Изтрий запис</button>' : '') +
    '<button onclick="closeRefEntryModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitRefEntry()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>' +
    '</div></div></div>';
}

/* Изтрива текущо редактирания гаранционен запис (не самата марка/под-категория) */
function refDeleteEntryPrompt() {
  if (!refEditId) return;
  if (!confirm('Сигурен ли си, че искаш да изтриеш този гаранционен запис? Действието е необратимо.')) return;
  sbDelete('warranty_entries','id=eq.'+refEditId).then(function(res){
    if (!res.ok) { toast('Грешка при изтриване','#dc2626'); return; }
    toast('✅ Записът е изтрит!');
    closeRefEntryModal();
    refSelBrand = ''; refSelSubcat = ''; refEntry = null; refBrandSubcatChoices = [];
    loadReference();
  });
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
  var isEdit = !!refEditId;
  var brand  = document.getElementById('re-brand').value;
  var subcatList; /* масив от subcategory_id — 1 при редакция, N при нов запис */

  if (isEdit) {
    var subcatSingle = document.getElementById('re-subcat').value;
    if (!subcatSingle || !brand) { toast('Избери марка и под-категория','#dc2626'); return; }
    subcatList = [subcatSingle];
  } else {
    subcatList = Array.from(document.querySelectorAll('.re-subcat-cb')).filter(function(cb){return cb.checked;}).map(function(cb){return cb.value;});
    if (!subcatList.length || !brand) { toast('Избери марка и поне 1 под-категория','#dc2626'); return; }
  }

  var qLines = (document.getElementById('re-questions').value||'').split('\n').map(function(s){return s.trim();}).filter(Boolean).slice(0,10);
  var baseData = {
    brand_id: brand,
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
  qLines.forEach(function(q, i){ baseData['question_'+(i+1)] = q; });

  var requests;
  if (isEdit) {
    var editData = Object.assign({subcategory_id: subcatList[0]}, baseData);
    requests = [sbPatch('warranty_entries','id=eq.'+refEditId,editData)];
  } else {
    requests = subcatList.map(function(scId){
      var rowData = Object.assign({subcategory_id: scId}, baseData);
      return sbPost('warranty_entries', rowData);
    });
  }

  Promise.all(requests).then(function(results){
    var failed = results.filter(function(r){return !r.ok;}).length;
    if (failed) {
      toast(failed===results.length
        ? 'Грешка при запис (възможно е комбинациите вече да съществуват)'
        : '⚠️ Записани '+(results.length-failed)+' от '+results.length+' (останалите вероятно вече съществуват)', '#dc2626');
      if (failed===results.length) return;
    } else {
      toast(isEdit ? '✅ Записано!' : '✅ Добавени '+results.length+' записа!');
    }
    closeRefEntryModal();
    refSelBrand = brand;
    renderReference(); /* презарежда селектора на марки, за да отрази нов брой/имена + показва избраната марка в полето */
    refLoadEntry(brand, subcatList[0]);
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
    refLoadEntry(refSelBrand, refSelSubcat);
  });
}

/* Затваря dropdown менюто с гаранционните карти при клик извън него */
document.addEventListener('click', function(e){
  var menu = document.getElementById('ref-tpl-menu');
  if (!menu || menu.style.display !== 'block') return;
  if (menu.contains(e.target)) return;
  if (e.target.tagName === 'BUTTON' && e.target.textContent.indexOf('Гаранционна карта') >= 0) return;
  menu.style.display = 'none';
});
