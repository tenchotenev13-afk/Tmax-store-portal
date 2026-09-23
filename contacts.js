/* contacts.js v4 — вътрешен указател
   Табове: 🏠 Начало (по макета: банер с търсачка, плочки на отделите,
   често търсени, „Кой за какво отговаря", магазини, помощ), 👥 Отдели
   (списък по отдел), 🏬 Магазини (персоналът на всеки обект по длъжност)
   и 🏭 Доставчици (картички, както досега).
   „Кой за какво" е в таблица contact_topics, „често търсени" е
   contacts.featured — contacts-home-schema.sql (23.09.2026).
   Колоните direction / deputy_id / store_role / sort_order / updated_at /
   updated_by идват от contacts-directory-schema.sql (23.09.2026).
   contactsTab е изгледът; ТИПЪТ на записа е 'contact' за първите два таба
   и 'supplier' за третия — виж ctTypeForTab(). */

var SB_CONTACTS = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var SB_CKEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var SB_CBKT     = 'contacts';
var SB_CPUB     = SB_CONTACTS + '/storage/v1/object/public/' + SB_CBKT + '/';

var allContacts  = [];
var contactsTab  = 'home';      /* 'home' | 'contact' | 'stores' | 'supplier' */
var allContactTopics = [];      /* contact_topics — „Кой за какво отговаря" */
var contactsTopicEdit = null;
var contactsEdit = null;
var contactsCat  = '';          /* филтър по отдел в таб Отдели ('' = всички) */
var contactsStore= '';          /* филтър по обект в таб Магазини ('' = всички) */
var contactsStaleOnly = false;  /* само „За проверка" (админ) */
/* Седмичното обновяване: запис, непроверен над CT_STALE_DAYS дни, се
   маркира за админите. „✓ Данните са верни" праща само updated_by —
   тригерът в базата слага updated_at = now() (contacts-directory-schema.sql). */
var CT_STALE_DAYS = 30;
var CAT_ORDER    = ['Ръководство','Регионално ръководство','Централно снабдяване','Отдел внос',
                    'Отдел Реклама','Онлайн магазин','Отдел контролинг','Счетоводство',
                    'Човешки ресурси','IT','Сервиз','Друго'];
var CT_STORE_CAT = 'Персонал магазини';
var CT_SUPPLIER_CATS = ['Материали','Стоки','Услуги','Логистика','Друго'];

/* Длъжност в обект — редът тук е редът на показване в картичката на обекта.
   'store' е общият телефон на обекта (не е човек) и отива в заглавието. */
var CT_STORE_ROLES = [
  ['manager','Управител'],
  ['deputy_mtz','Зам. управител (МТЗ)'],
  ['deputy_supply','Зам. управител (снабдител)'],
  ['otz','ОТЗ'],
  ['warehouse','Началник склад'],
  ['supplier','Снабдител'],
  ['other','Друго'],
  ['store','Общ телефон на обекта']
];

function isAdminContacts(){
  return !!(currentUser && ['admin','accounting'].indexOf(currentUser.role)>=0);
}

/* ── Помощни ── */
/* esc('') връща '—' (shared.js) — за value="" на поле това е грешно: празно
   поле се пълни с тире и тирето се записва в базата (към 23.09.2026 има 19
   такива стойности). Тук празното остава празно, а записано '—' се чете
   като празно. */
function ctClean(s){ s=(s==null?'':String(s)).trim(); return s==='—'?'':s; }
function ctVal(s){ s=ctClean(s); return s?escAttr(s):''; }
function ctAgeDays(c){
  if(!c.updated_at)return null;
  var t=new Date(c.updated_at).getTime();
  if(isNaN(t))return null;
  return Math.floor((Date.now()-t)/86400000);
}
/* Без дата = никога непроверен = за проверка. Общият телефон на обекта
   също се проверява — и той остарява. Доставчиците не влизат. */
function ctIsStale(c){
  if(c.type!=='contact')return false;
  var d=ctAgeDays(c);
  return d===null || d>CT_STALE_DAYS;
}
function ctStaleBadge(c){
  if(!isAdminContacts()||!ctIsStale(c))return '';
  var d=ctAgeDays(c);
  return ' <span class="ct-stale" title="'+(d===null?'Никога не е проверяван':'Непроверен от '+d+' дни')+'">⚠️</span>';
}
function ctUserName(){ return (currentUser&&(currentUser.display_name||currentUser.email))||null; }
/* ✓ Данните са верни — само updated_by; датата я слага тригерът. */
function confirmContact(id){
  var c=ctById(id); if(!c)return;
  sbPatch('contacts','id=eq.'+id,{updated_by:ctUserName()}).then(function(res){
    if(!res.ok){toast('⚠️ НЕ е отбелязано: '+sbErrMsg(res),'#dc2626');return;}
    toast('✓ '+(c.name||'Записът')+' — проверен');
    closeContactDetail();
    loadContacts();
  });
}
function setContactsStale(on){ contactsStaleOnly=!!on; renderContactsFilters(); renderContactsGrid(); }
function ctTypeForTab(tab){ return tab==='supplier'?'supplier':'contact'; }
function ctIsStoreStaff(c){ return c.type==='contact' && (!!c.store_role || c.category===CT_STORE_CAT); }
function ctRoleIdx(r){
  for(var i=0;i<CT_STORE_ROLES.length;i++) if(CT_STORE_ROLES[i][0]===r) return i;
  return CT_STORE_ROLES.length;
}
function ctRoleLabel(c){
  var i=ctRoleIdx(c.store_role);
  return i<CT_STORE_ROLES.length ? CT_STORE_ROLES[i][1] : ctClean(c.role_title);
}
/* Към 23.09.2026 52 от 98 телефона в contacts са записани без водещата
   нула (885949400 вместо 0885949400) — вероятно минали през число при
   внос. Други са с 359 отпред без + (359882790094). tel: с такъв номер
   набира грешно. ctMobile() връща 0XXXXXXXXX за български мобилен (8/9)
   в тези форми и null за всичко друго (стационарни, чужди) — те остават
   както са записани. Самите данни в базата НЕ се пипат оттук. */
function ctMobile(p){
  var d=String(ctClean(p)).replace(/\D/g,'');
  if(/^359[89]\d{8}$/.test(d)) d='0'+d.slice(3);
  else if(/^[89]\d{8}$/.test(d)) d='0'+d;
  return /^0[89]\d{8}$/.test(d) ? d : null;
}
function ctTel(p){
  var m=ctMobile(p);
  return m || String(ctClean(p)).replace(/[^\d+]/g,'');
}
function ctPhoneShow(p){
  var m=ctMobile(p);
  return m ? m.slice(0,4)+' '+m.slice(4,7)+' '+m.slice(7) : ctClean(p);
}
function ctById(id){
  if(!id)return null;
  for(var i=0;i<allContacts.length;i++) if(String(allContacts[i].id)===String(id)) return allContacts[i];
  return null;
}
function ctCatIdx(cat){ var i=CAT_ORDER.indexOf(cat); return i<0?99:i; }
function ctByName(a,b){ return String(a.name||'').localeCompare(String(b.name||''),'bg'); }
function ctMatches(c,q){
  if(!q)return true;
  var dep=ctById(c.deputy_id);
  /* Телефонът се търси и без интервали, и с добавената водеща нула —
     „0885 94“ намира записаното „885949400“. */
  var qd=q.replace(/\s+/g,'');
  var tel=ctTel(c.phone);
  if(qd && /^[\d+]+$/.test(qd) && tel.indexOf(qd)>=0) return true;
  return [c.name,c.role_title,c.phone,c.email,c.category,c.direction,c.store_name,
          ctRoleLabel(c),dep&&dep.name].some(function(v){
    return v && String(v).toLowerCase().indexOf(q)>=0;
  });
}
function ctSearchQ(){
  return ((document.getElementById('contacts-search')||{}).value||'').trim().toLowerCase();
}

/* Стиловете на списъка — едно <style>, за да има media query за телефон
   (inline style не може). На телефон редът е: име + длъжност вляво,
   телефон вдясно; направление, имейл и заместник се виждат в детайла. */
function ctStyleTag(){
  return '<style id="ct-style">'+
    '.ct-wrap{max-width:1360px;margin:0 auto;padding:16px;}'+
    /* Начало — банер + бързи карти */
    '.ct-top{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,2fr);gap:14px;margin-bottom:16px;}'+
    '.ct-hero{position:relative;border-radius:14px;overflow:hidden;min-height:190px;display:flex;align-items:flex-end;'+
      'background:linear-gradient(120deg,#0f172a 0%,#1e293b 62%,#334155 100%);}'+
    '.ct-hero:after{content:"";position:absolute;right:0;bottom:0;width:0;height:0;border-style:solid;border-width:0 0 70px 70px;border-color:transparent transparent #FFCD00 transparent;}'+
    '.ct-hero-in{position:relative;z-index:1;padding:22px 22px 18px;width:100%;}'+
    '.ct-hero-h{font-size:24px;font-weight:800;color:#fff;margin-bottom:6px;}'+
    '.ct-hero-h:after{content:"";display:block;width:44px;height:4px;border-radius:2px;background:#FFCD00;margin-top:8px;}'+
    '.ct-hero-p{font-size:13.5px;line-height:1.5;color:#cbd5e1;max-width:460px;margin-bottom:14px;}'+
    '.ct-hero-sbox{display:flex;align-items:center;gap:8px;background:#fff;border-radius:10px;padding:0 12px;box-shadow:0 6px 18px rgba(0,0,0,.18);max-width:560px;}'+
    '.ct-hero-sico{font-size:15px;opacity:.6;}'+
    '.ct-hero-search{flex:1;border:none;outline:none;padding:12px 0;font-size:14px;font-family:inherit;background:transparent;min-width:0;}'+
    '.ct-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}'+
    '.ct-qcard{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 16px;cursor:pointer;font-family:inherit;transition:box-shadow .15s,transform .15s;}'+
    '.ct-qcard:hover{box-shadow:0 8px 22px rgba(15,23,42,.08);transform:translateY(-1px);}'+
    '.ct-qico{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:6px;}'+
    '.ct-qt{font-size:14.5px;font-weight:700;color:#0f172a;line-height:1.25;}'+
    '.ct-qs{font-size:12px;color:#64748b;line-height:1.35;}'+
    /* Начало — три колони */
    '.ct-home{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;}'+
    '.ct-col{display:flex;flex-direction:column;gap:16px;min-width:0;}'+
    '.ct-panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;}'+
    '.ct-ph{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;font-size:16px;font-weight:700;color:#0f172a;}'+
    '.ct-link{border:none;background:none;color:#2563eb;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;padding:0;white-space:nowrap;}'+
    '.ct-empty{font-size:12.5px;color:#94a3b8;padding:10px 2px;}'+
    '.ct-note{font-size:11.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 10px;margin-bottom:10px;}'+
    '.ct-chev{color:#94a3b8;font-size:18px;line-height:1;margin-left:auto;padding-left:6px;}'+
    '.ct-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:10px;}'+
    '.ct-tile{display:flex;align-items:center;gap:9px;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:11px 10px;cursor:pointer;font-family:inherit;min-width:0;}'+
    '.ct-tile:hover{border-color:#FFCD00;box-shadow:0 4px 14px rgba(15,23,42,.06);}'+
    '.ct-tico{width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;}'+
    '.ct-tt{display:flex;flex-direction:column;min-width:0;flex:1;}'+
    '.ct-tt b{font-size:12.5px;color:#0f172a;line-height:1.25;overflow-wrap:break-word;}'+
    '.ct-tile .ct-chev{flex:0 0 auto;}'+
    '.ct-tt small{font-size:11.5px;color:#64748b;margin-top:2px;}'+
    '.ct-scards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}'+
    '.ct-scard{display:flex;flex-direction:column;text-align:left;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;min-width:0;}'+
    '.ct-simg{display:block;height:92px;border-radius:10px;overflow:hidden;margin-bottom:7px;background:linear-gradient(135deg,#1e293b,#334155);}'+
    '.ct-simg img{width:100%;height:100%;object-fit:cover;display:block;}'+
    '.ct-sph{height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;border-bottom:4px solid #FFCD00;box-sizing:border-box;}'+
    '.ct-sname{display:flex;align-items:center;font-size:13.5px;font-weight:700;color:#0f172a;}'+
    '.ct-smgr{font-size:11.5px;color:#64748b;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'+
    '.ct-scard:hover .ct-sname{color:#2563eb;}'+
    '.ct-fcard{display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid #f1f5f9;}'+
    '.ct-fcard:last-child{border-bottom:none;}'+
    '.ct-fcard:hover{background:#f8fafc;}'+
    '.ct-fbody{min-width:0;flex:1;display:flex;flex-direction:column;}'+
    '.ct-fname{font-size:13.5px;font-weight:700;color:#0f172a;}'+
    '.ct-frole{font-size:12px;color:#64748b;}'+
    '.ct-fwhere{font-size:11.5px;color:#94a3b8;margin-bottom:3px;}'+
    '.ct-fline{font-size:12px;color:#334155;text-decoration:none;line-height:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'+
    '.ct-fmail{color:#2563eb;}'+
    '.ct-tsearch{display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:10px;padding:0 10px;margin-bottom:6px;}'+
    '.ct-tsearch span{opacity:.55;font-size:13px;}'+
    '.ct-tsearch input{flex:1;border:none;outline:none;padding:9px 0;font-size:13px;font-family:inherit;min-width:0;}'+
    '.ct-trow{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #f1f5f9;}'+
    '.ct-trow:last-child{border-bottom:none;}'+
    '.ct-trow:hover{background:#f8fafc;}'+
    '.ct-tico2{width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:#fff7d1;display:flex;align-items:center;justify-content:center;font-size:15px;}'+
    '.ct-ttopic{font-size:13px;color:#0f172a;font-weight:500;flex:1;min-width:0;}'+
    '.ct-tdept{font-size:12px;color:#64748b;text-align:right;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'+
    '.ct-tnone{color:#cbd5e1;font-style:italic;}'+
    '.ct-tedit{border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:2px 6px;font-size:11px;cursor:pointer;}'+
    '.ct-help{background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:16px;}'+
    '.ct-help-h{display:flex;align-items:center;gap:10px;font-size:15px;color:#0f172a;margin-bottom:6px;}'+
    '.ct-help-ico{width:38px;height:38px;border-radius:50%;background:#FFCD00;display:flex;align-items:center;justify-content:center;font-size:19px;}'+
    '.ct-help-p{font-size:12.5px;color:#475569;line-height:1.5;margin-bottom:12px;}'+
    '.ct-hbtn{display:block;width:100%;box-sizing:border-box;text-align:center;border:1px solid #e2e8f0;background:#fff;color:#0f172a;border-radius:10px;padding:10px;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;font-family:inherit;margin-top:8px;}'+
    '.ct-hbtn-y{background:#FFCD00;border-color:#FFCD00;}'+
    '.ct-hbtn-y:hover{background:#f5c400;}'+
    '@media (max-width:1180px){'+
      '.ct-top{grid-template-columns:1fr;}'+
      '.ct-home{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}'+
      '.ct-home .ct-col:first-child{grid-column:1 / -1;}'+
    '}'+
    '@media (max-width:760px){'+
      '.ct-wrap{padding:10px;}'+
      '.ct-quick{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}'+
      '.ct-qcard{padding:12px;}'+
      '.ct-qico{width:40px;height:40px;font-size:19px;}'+
      '.ct-home{grid-template-columns:1fr;}'+
      '.ct-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}'+
      '.ct-tico{width:34px;height:34px;flex:0 0 34px;font-size:16px;}'+
      '.ct-tile{flex-direction:column;align-items:flex-start;gap:6px;}'+
      '.ct-tile .ct-chev{display:none;}'+
      '.ct-tt b{overflow-wrap:normal;}'+
      '.ct-scards{grid-template-columns:repeat(2,minmax(0,1fr));}'+
      '.ct-hero-h{font-size:20px;}'+
    '}'+
    '.ct-row{display:grid;grid-template-columns:1.1fr 1.5fr 1.3fr 1fr 1.5fr 1.2fr 96px;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12.5px;color:#1e293b;}'+
    '.ct-row:hover{background:#f8fafc;}'+
    '.ct-row a{text-decoration:none;}'+
    '.ct-stale{font-size:11px;cursor:help;}'+
    '.ct-chip.ct-chip-warn{border-color:#fcd34d;background:#fffbeb;color:#92400e;}'+
    '.ct-chip.ct-chip-warn.on{background:#d97706;border-color:#d97706;color:#fff;}'+
    '.ct-upd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:#475569;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:9px 14px;margin-bottom:16px;}'+
    '.ct-head{font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.3px;background:#f8fafc;cursor:default;}'+
    '.ct-head:hover{background:#f8fafc;}'+
    '.ct-srow{grid-template-columns:1.3fr 1.6fr 1.1fr 96px;}'+
    '.ct-c-name{font-weight:600;color:#0f172a;display:flex;align-items:center;gap:5px;min-width:0;}'+
    '.ct-c-sub{color:#64748b;}'+
    '.ct-c-mail a{color:#2563eb;word-break:break-all;}'+
    '.ct-c-phone a{color:#0f172a;font-family:monospace;white-space:nowrap;}'+
    '.ct-act{display:flex;gap:4px;justify-content:flex-end;}'+
    '.ct-act button{border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:3px 7px;font-size:12px;cursor:pointer;}'+
    '.ct-chip{border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:40px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;}'+
    '.ct-chip.on{background:#0f172a;border-color:#0f172a;color:#fff;}'+
    '.ct-box{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:18px;}'+
    '.ct-box-h{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#fff;}'+
    '.ct-stores{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;align-items:start;}'+
    '@media (max-width:760px){'+
      '.ct-row,.ct-srow{grid-template-columns:1fr auto;row-gap:1px;}'+
      '.ct-head{display:none;}'+
      '.ct-c-dir,.ct-c-mail,.ct-c-dep,.ct-act{display:none;}'+
      '.ct-c-name{grid-column:1;grid-row:1;}'+
      '.ct-c-role{grid-column:1;grid-row:2;font-size:11px;}'+
      '.ct-c-phone{grid-column:2;grid-row:1 / 3;}'+
      '.ct-stores{grid-template-columns:1fr;}'+
      '#contacts-search{width:100% !important;}'+
    '}'+
  '</style>';
}

/* ── LOAD ── */
function loadContacts() {
  var wrap = document.getElementById('mod-contacts');
  if (wrap) wrap.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#94a3b8;">⏳ Зареждане...</div>';
  /* Двете заявки паралелно. sbGet не хвърля: при грешка показва червен
     toast и връща [] — затова провал на темите не спира контактите, но и
     не минава тихо. */
  Promise.all([
    sbGet('contacts', 'order=category,name'),
    sbGet('contact_topics', 'order=sort_order,topic')
  ]).then(function(res) {
    allContacts = Array.isArray(res[0]) ? res[0] : [];
    allContactTopics = Array.isArray(res[1]) ? res[1] : [];
    try { renderContacts(); } catch(e) { console.error('renderContacts error:', e); }
  }).catch(function(err) {
    console.error('DB error:', err);
    var wrap = document.getElementById('mod-contacts');
    if (wrap) wrap.innerHTML = '<div style="color:#dc2626;padding:40px;text-align:center;">Грешка: ' + esc(err.message||String(err)) + '</div>';
  });
}

/* ── RENDER FULL PAGE (само при първо зареждане или смяна на таб) ── */
function renderContacts() {
  var wrap = document.getElementById('mod-contacts');
  if (!wrap) return;
  var isAdmin = isAdminContacts();
  var prevQ = (document.getElementById('contacts-search')||{}).value || '';

  var isHome = contactsTab==='home';
  /* ВАЖНО: oninput вика само renderContactsGrid(), не renderContacts() —
     иначе полето се пресъздава и губи фокуса при всеки знак. На Начало
     полето е в банера (като на макета), на другите табове — горе вдясно. */
  var searchInput = '<input id="contacts-search" placeholder="'+(isHome?'Търси по име, отдел, длъжност, обект или телефон...':'🔍 Търси по име, отдел, длъжност, обект, телефон...')+'" value="'+ctVal(prevQ)+'" oninput="renderContactsGrid()" autocomplete="off"'+
    (isHome?' class="ct-hero-search"':' style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 14px;font-size:13px;font-family:inherit;outline:none;width:340px;max-width:100%;"')+'>';

  var h = ctStyleTag()+'<div class="ct-wrap">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;" id="c-tabs">';
  [['home','🏠 Начало'],['contact','👥 Отдели'],['stores','🏬 Магазини'],['supplier','🏭 Доставчици']].forEach(function(t){
    var a = contactsTab===t[0];
    h += '<button data-tab="'+t[0]+'" onclick="setContactsTab(this.dataset.tab)" style="border:none;padding:7px 18px;border-radius:40px;font-size:13px;font-weight:600;cursor:pointer;background:'+(a?'#0f172a':'#f1f5f9')+';color:'+(a?'#fff':'#64748b')+';">'+t[1]+'</button>';
  });
  h += '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:flex-end;min-width:240px;">';
  if (!isHome) h += searchInput;
  if (isAdmin) h += '<button onclick="openContactModal(null)" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Добави</button>';
  h += '</div></div>';
  if (isHome) h += ctHeroHtml(searchInput);
  h += '<div id="ct-filters" style="margin-bottom:14px;"></div>';
  h += '<div id="contacts-grid"></div></div>';
  h += contactModalHtml();
  wrap.innerHTML = h;
  renderContactsFilters();
  renderContactsGrid();
}

/* ── ФИЛТРИ: чипове по отдел (Отдели) / падащо меню по обект (Магазини) ──
   „Всички" е винаги там, дори когато има само един отдел — контрол, който
   изчезва според данните, изглежда като счупен. */
function ctDeptList(){ return allContacts.filter(function(c){ return c.type==='contact' && !ctIsStoreStaff(c); }); }
function ctStaffList(){ return allContacts.filter(ctIsStoreStaff); }
function ctStoreNames(){
  var seen={}, out=[];
  ctStaffList().forEach(function(c){ var s=ctClean(c.store_name)||'Без обект'; if(!seen[s]){seen[s]=1;out.push(s);} });
  return out.sort(function(a,b){ return a.localeCompare(b,'bg'); });
}
function renderContactsFilters(){
  var box=document.getElementById('ct-filters');
  if(!box)return;
  if(contactsTab==='contact'){
    var counts={};
    ctDeptList().forEach(function(c){ var k=ctClean(c.category)||'Друго'; counts[k]=(counts[k]||0)+1; });
    var cats=Object.keys(counts).sort(function(a,b){ return ctCatIdx(a)-ctCatIdx(b) || a.localeCompare(b,'bg'); });
    /* Избран отдел без хора (напр. от тема „Кой за какво", сочеща празен
       отдел) остава избран с 0 — иначе филтърът тихо ще се върне на
       „Всички" и ще покаже чужди хора като отговор. */
    if(contactsCat && !counts[contactsCat]) counts[contactsCat]=0;
    var h='<div style="display:flex;gap:6px;flex-wrap:wrap;">'+ctStaleChip(ctDeptList());
    h+='<button class="ct-chip'+(contactsCat?'':' on')+'" data-cat="" onclick="setContactsCat(this.dataset.cat)">Всички</button>';
    cats.forEach(function(k){
      h+='<button class="ct-chip'+(contactsCat===k?' on':'')+'" data-cat="'+escAttr(k)+'" onclick="setContactsCat(this.dataset.cat)">'+esc(k)+' <span style="opacity:.6;">'+counts[k]+'</span></button>';
    });
    box.innerHTML=h+'</div>';
  } else if(contactsTab==='stores'){
    var names=ctStoreNames();
    if(contactsStore && names.indexOf(contactsStore)<0) contactsStore='';
    box.innerHTML='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'+ctStaleChip(ctStaffList())+
      '<select id="ct-store-filter" onchange="setContactsStore(this.value)" style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px;font-size:13px;font-family:inherit;background:#fff;">'+
      '<option value="">Всички обекти ('+names.length+')</option>'+
      names.map(function(n){ return '<option value="'+escAttr(n)+'"'+(n===contactsStore?' selected':'')+'>'+esc(n)+'</option>'; }).join('')+
      '</select></div>';
  } else {
    box.innerHTML='';
  }
}
/* Чипът е винаги там за админа — и при 0 („За проверка 0" казва, че
   всичко е наред; изчезнал чип изглежда като счупен). Не-админът не го вижда. */
function ctStaleChip(list){
  if(!isAdminContacts())return '';
  var n=list.filter(ctIsStale).length;
  return '<button class="ct-chip ct-chip-warn'+(contactsStaleOnly?' on':'')+'" id="ct-stale-chip" onclick="setContactsStale(!contactsStaleOnly)" title="Записи, непроверени над '+CT_STALE_DAYS+' дни">⚠️ За проверка <span style="opacity:.75;">'+n+'</span></button>';
}
function setContactsCat(cat){ contactsCat=cat||''; renderContactsFilters(); renderContactsGrid(); }
function setContactsStore(s){ contactsStore=s||''; renderContactsGrid(); }

/* ── RENDER САМО СЪДЪРЖАНИЕТО (при търсене - без ре-рендър на хедъра) ── */
function renderContactsGrid() {
  var grid = document.getElementById('contacts-grid');
  if (!grid) return;
  if (contactsTab==='home')     return ctSearchQ() ? ctRenderSearchAll(grid) : ctRenderHome(grid);
  if (contactsTab==='supplier') return ctRenderSuppliers(grid);
  if (contactsTab==='stores')   return ctRenderStores(grid);
  return ctRenderDepts(grid);
}

function ctEmpty(icon,text,withAdd){
  return '<div style="text-align:center;padding:60px;color:#94a3b8;">'+
    '<div style="font-size:40px;margin-bottom:10px;">'+icon+'</div><div>'+text+'</div>'+
    (withAdd&&isAdminContacts()?'<button onclick="openContactModal(null)" style="margin-top:14px;border:none;background:#2563eb;color:#fff;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;">+ Добави</button>':'')+
    '</div>';
}

/* Ред в списъка. Целият ред отваря детайла (там е снимката); телефонът,
   имейлът и бутоните спират bubbling-а, за да вършат своето. */
function ctRowAttrs(c,cls){
  return 'class="ct-row'+(cls?' '+cls:'')+'" data-id="'+escAttr(c.id)+'" onclick="openContactDetail(this.dataset.id)" title="Отвори контакта" style="cursor:pointer;"';
}
function ctPhoneCell(c){
  var t=ctTel(c.phone);
  return '<div class="ct-c-phone">'+(t?'<a href="tel:'+escAttr(t)+'" onclick="event.stopPropagation()">'+esc(ctPhoneShow(c.phone))+'</a>':'<span style="color:#cbd5e1;">—</span>')+'</div>';
}
function ctActCell(c,isAdmin){
  if(!isAdmin)return '<div class="ct-act"></div>';
  return '<div class="ct-act">'+
    (ctIsStale(c)?'<button data-id="'+escAttr(c.id)+'" title="Данните са верни" onclick="event.stopPropagation();confirmContact(this.dataset.id)" style="color:#16a34a;">✓</button>':'')+
    '<button data-id="'+escAttr(c.id)+'" title="Редактирай" onclick="event.stopPropagation();openContactModal(this.dataset.id)">✏️</button>'+
    '<button data-id="'+escAttr(c.id)+'" title="Изтрий" onclick="event.stopPropagation();doDeleteContact(this.dataset.id)" style="color:#dc2626;">✕</button>'+
    '</div>';
}

/* ═══ ТАБ ОТДЕЛИ ═══ */
function ctRenderDepts(grid){
  var isAdmin=isAdminContacts(), q=ctSearchQ();
  var list=ctDeptList().filter(function(c){
    return (!contactsCat || (ctClean(c.category)||'Друго')===contactsCat) && ctMatches(c,q) &&
           (!contactsStaleOnly || !isAdmin || ctIsStale(c));
  });
  if(!list.length){
    var inStores=q?ctStaffList().filter(function(c){return ctMatches(c,q);}).length:0;
    grid.innerHTML=ctEmpty(contactsStaleOnly&&isAdmin?'✅':'👥',(contactsStaleOnly&&isAdmin?'Всичко е проверено':'Няма контакти')+(q?' за „'+esc(q)+'"':'')+(contactsCat?' в „'+esc(contactsCat)+'"':'')+'.'+
      (inStores?'<div style="margin-top:10px;"><button class="ct-chip" data-tab="stores" onclick="setContactsTab(this.dataset.tab,true)">🏬 '+inStores+' в Магазини →</button></div>':''),
      !q&&!contactsCat&&!contactsStaleOnly);
    return;
  }
  var groups={};
  list.forEach(function(c){ var k=ctClean(c.category)||'Друго'; (groups[k]=groups[k]||[]).push(c); });
  var cats=Object.keys(groups).sort(function(a,b){ return ctCatIdx(a)-ctCatIdx(b) || a.localeCompare(b,'bg'); });
  var h='';
  cats.forEach(function(cat){
    var m=groups[cat].sort(function(a,b){
      return (a.sort_order||0)-(b.sort_order||0) ||
             String(ctClean(a.direction)).localeCompare(String(ctClean(b.direction)),'bg') || ctByName(a,b);
    });
    h+='<div class="ct-box"><div class="ct-box-h">'+
       '<div style="font-size:14px;font-weight:700;color:#0f172a;">'+esc(cat)+'</div>'+
       '<div style="flex:1;"></div><div style="font-size:11px;color:#94a3b8;">'+m.length+' '+(m.length===1?'човек':'души')+'</div></div>';
    h+='<div class="ct-row ct-head"><div class="ct-c-dir">Направление</div><div>Отговорник</div><div class="ct-c-role">Длъжност</div><div>Телефон</div><div class="ct-c-mail">Имейл</div><div class="ct-c-dep">Заместник</div><div></div></div>';
    m.forEach(function(c){
      var dep=ctById(c.deputy_id);
      var mail=ctClean(c.email);
      h+='<div '+ctRowAttrs(c)+'>'+
        '<div class="ct-c-dir ct-c-sub">'+esc(ctClean(c.direction))+'</div>'+
        '<div class="ct-c-name"><div class="ct-nm">'+esc(c.name||'')+'</div>'+ctStaleBadge(c)+'</div>'+
        '<div class="ct-c-role ct-c-sub">'+esc(ctClean(c.role_title))+'</div>'+
        ctPhoneCell(c)+
        '<div class="ct-c-mail">'+(mail?'<a href="mailto:'+escAttr(mail)+'" onclick="event.stopPropagation()">'+esc(mail)+'</a>':'')+'</div>'+
        '<div class="ct-c-dep ct-c-sub">'+(dep?esc(dep.name):'')+'</div>'+
        ctActCell(c,isAdmin)+
        '</div>';
    });
    h+='</div>';
  });
  grid.innerHTML=h;
}

/* ═══ ТАБ МАГАЗИНИ ═══
   Картичка на обект: заглавие + общ телефон (store_role='store'), после
   персоналът по реда на CT_STORE_ROLES. Търсене по име на обекта показва
   целия обект; иначе — само съвпадащите хора. */
function ctRenderStores(grid){
  var isAdmin=isAdminContacts(), q=ctSearchQ();
  var byStore={};
  ctStaffList().forEach(function(c){ var s=ctClean(c.store_name)||'Без обект'; (byStore[s]=byStore[s]||[]).push(c); });
  var names=ctStoreNames().filter(function(s){ return !contactsStore || s===contactsStore; });
  var h='', shown=0;
  names.forEach(function(s){
    var all=byStore[s]||[];
    var storeHit=q && s.toLowerCase().indexOf(q)>=0;
    var m=(q&&!storeHit)?all.filter(function(c){return ctMatches(c,q);}):all;
    if(contactsStaleOnly&&isAdmin) m=m.filter(ctIsStale);
    if(!m.length)return;
    shown++;
    var lines=all.filter(function(c){return c.store_role==='store';});
    var staff=m.filter(function(c){return c.store_role!=='store';}).sort(function(a,b){
      return ctRoleIdx(a.store_role)-ctRoleIdx(b.store_role) || (a.sort_order||0)-(b.sort_order||0) || ctByName(a,b);
    });
    h+='<div class="ct-box" style="margin-bottom:0;"><div class="ct-box-h">'+
       '<div style="font-size:14px;font-weight:700;color:#0f172a;">🏬 '+esc(s)+'</div><div style="flex:1;"></div>';
    lines.forEach(function(c){
      var t=ctTel(c.phone);
      if(t)h+='<a href="tel:'+escAttr(t)+'" title="Общ телефон на обекта" style="font-size:12.5px;font-family:monospace;color:#2563eb;text-decoration:none;white-space:nowrap;">📞 '+esc(ctPhoneShow(c.phone))+'</a>';
    });
    h+='</div>';
    if(!staff.length) h+='<div style="padding:12px 14px;font-size:12px;color:#94a3b8;">Няма въведен персонал.</div>';
    staff.forEach(function(c){
      h+='<div '+ctRowAttrs(c,'ct-srow')+'>'+
        '<div class="ct-c-role ct-c-sub">'+esc(ctRoleLabel(c)||'—')+'</div>'+
        '<div class="ct-c-name"><div class="ct-nm">'+esc(c.name||'')+'</div>'+ctStaleBadge(c)+'</div>'+
        ctPhoneCell(c)+
        ctActCell(c,isAdmin)+
        '</div>';
    });
    h+='</div>';
  });
  grid.innerHTML=shown
    ? '<div class="ct-stores">'+h+'</div>'
    : ctEmpty(contactsStaleOnly&&isAdmin?'✅':'🏬',(contactsStaleOnly&&isAdmin?'Всичко е проверено':'Няма контакти')+(q?' за „'+esc(q)+'"':'')+'.', !q&&!contactsStaleOnly);
}

/* ═══ ТАБ ДОСТАВЧИЦИ — картички, както досега ═══ */
function ctRenderSuppliers(grid){
  var isAdmin=isAdminContacts(), q=ctSearchQ();
  var list=allContacts.filter(function(c){ return c.type==='supplier' && ctMatches(c,q); });
  if(!list.length){ grid.innerHTML=ctEmpty('🏭','Няма доставчици'+(q?' за „'+esc(q)+'"':'')+'.', !q); return; }
  var groups={};
  list.forEach(function(c){ var k=c.category||'Друго'; (groups[k]=groups[k]||[]).push(c); });
  var cats=Object.keys(groups).sort(function(a,b){ return a.localeCompare(b,'bg'); });
  var h='';
  cats.forEach(function(cat){
    var m=groups[cat];
    h+='<div style="display:flex;align-items:center;gap:12px;margin:8px 0 12px;">'+
       '<div style="font-size:14px;font-weight:700;color:#0f172a;">'+esc(cat)+'</div>'+
       '<div style="flex:1;height:1px;background:#e2e8f0;"></div>'+
       '<div style="font-size:11px;color:#94a3b8;">'+m.length+' доставчика</div></div>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-bottom:28px;">';
    m.forEach(function(c){ h+=contactCard(c,isAdmin); });
    h+='</div>';
  });
  grid.innerHTML=h;
}

/* ── TAB SWITCH ── */
/* Пълен ре-рендър: на Начало полето за търсене е в банера, на другите
   табове — горе, затова хедърът се строи наново. renderContacts() пренася
   стойността на търсенето; keepSearch решава дали да я пренесе. */
function setContactsTab(tab, keepSearch) {
  contactsTab = tab;
  var si=document.getElementById('contacts-search'); if(si&&!keepSearch)si.value='';
  renderContacts();
  if(keepSearch){ var s2=document.getElementById('contacts-search'); if(s2&&s2.focus)try{s2.focus();}catch(e){} }
}
/* Отваря таб Отдели, филтриран по отдел — от плочка / тема на Начало. */
function openContactsDept(cat){ contactsCat=cat||''; setContactsTab('contact'); }
function openContactsStore(s){ contactsStore=s||''; setContactsTab('stores'); }

/* ═══════════════════════════════════════════════════════════════════════
   НАЧАЛО — по макета на колегите (23.09.2026)
   Лявото меню от макета НЕ се прави: порталът има своя навигация.
   Снимки: човек → contacts.photo_url; обект → photo_url на реда с общия
   телефон на обекта (store_role='store'). Банерът взима първата снимка
   на обект, ако има; иначе е тъмен с жълто.
   ═══════════════════════════════════════════════════════════════════════ */
var CT_DEPT_ICONS = {
  'Ръководство':           ['👑','#fef3c7'],
  'Регионално ръководство':['🧭','#e0e7ff'],
  'Централно снабдяване':  ['🛒','#dbeafe'],
  'Отдел внос':            ['🚢','#cffafe'],
  'Отдел Реклама':         ['📢','#ede9fe'],
  'Онлайн магазин':        ['💻','#e0f2fe'],
  'Отдел контролинг':      ['📊','#dcfce7'],
  'Счетоводство':          ['💰','#fef9c3'],
  'Човешки ресурси':       ['👥','#f3e8ff'],
  'IT':                    ['🖥️','#e0f2fe'],
  'Сервиз':                ['🔧','#ffedd5'],
  'Друго':                 ['📁','#f1f5f9']
};
function ctDeptIcon(cat){ return CT_DEPT_ICONS[cat] || ['🏢','#f1f5f9']; }
function ctInitials(name){ return String(name||'?').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase(); }
function ctAvatar(c,size){
  var bgC=['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#0f172a'];
  var name=c.name||'?', bg=bgC[(name.charCodeAt(0)||0)%bgC.length];
  var st='width:'+size+'px;height:'+size+'px;flex:0 0 '+size+'px;border-radius:50%;';
  return c.photo_url
    ? '<img src="'+escAttr(c.photo_url)+'" alt="" style="'+st+'object-fit:cover;background:#e2e8f0;">'
    : '<div style="'+st+'background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:'+Math.round(size*0.36)+'px;font-weight:700;color:#fff;">'+esc(ctInitials(name))+'</div>';
}
function ctStoreLine(store){
  for(var i=0;i<allContacts.length;i++){ var c=allContacts[i]; if(c.store_role==='store' && ctClean(c.store_name)===store) return c; }
  return null;
}
function ctStoreManager(store){
  var m=ctStaffList().filter(function(c){ return ctClean(c.store_name)===store && c.store_role!=='store'; })
    .sort(function(a,b){ return ctRoleIdx(a.store_role)-ctRoleIdx(b.store_role) || ctByName(a,b); });
  return m[0]||null;
}
function ctFocusSearch(){ var s=document.getElementById('contacts-search'); if(s){ try{s.focus();}catch(e){} if(s.scrollIntoView)s.scrollIntoView({block:'center'}); } }
function ctScrollTopics(){ var t=document.getElementById('ct-topics'); if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'start'}); var q=document.getElementById('ct-topic-q'); if(q)try{q.focus();}catch(e){} }

/* ── Банер + 4 бързи карти (извън #contacts-grid, за да не се пресъздава
   полето за търсене при всеки знак) ── */
function ctHeroHtml(searchInput){
  var photo=null;
  allContacts.some(function(c){ if(c.store_role==='store'&&c.photo_url){photo=c.photo_url;return true;} return false; });
  var bg = photo
    ? 'background-image:linear-gradient(90deg,rgba(15,23,42,.92) 0%,rgba(15,23,42,.75) 45%,rgba(15,23,42,.15) 100%),url(\''+escAttr(photo).replace(/'/g,'%27')+'\');background-size:cover;background-position:center;'
    : '';
  var quick=[
    ['👥','Търси човек','По име, отдел или длъжност','ctFocusSearch()','#FFCD00'],
    ['🏢','Отдели','Всички екипи и контакти',"setContactsTab('contact')",'#e2e8f0'],
    ['❓','Кой за какво отговаря?','По процеси и дейности','ctScrollTopics()','#dbeafe'],
    ['🏬','Магазини','Персонал и телефони на обектите',"setContactsTab('stores')",'#e2e8f0']
  ];
  var h='<div class="ct-top">';
  h+='<div class="ct-hero" style="'+bg+'"><div class="ct-hero-in">'+
       '<div class="ct-hero-h">Добре дошли!</div>'+
       '<div class="ct-hero-p">Тук лесно намираш контакт с колегите от всички отдели и обекти и разбираш кой за какво отговаря.</div>'+
       '<div class="ct-hero-sbox"><span class="ct-hero-sico">🔍</span>'+searchInput+'</div>'+
     '</div></div>';
  h+='<div class="ct-quick">';
  quick.forEach(function(q){
    h+='<button class="ct-qcard" onclick="'+q[3]+'"><span class="ct-qico" style="background:'+q[4]+';">'+q[0]+'</span>'+
       '<span class="ct-qt">'+esc(q[1])+'</span><span class="ct-qs">'+esc(q[2])+'</span></button>';
  });
  h+='</div></div>';
  return h;
}

/* ── Табло ── */
/* Лента „Последно обновяване" — само за админ. Показва най-новата
   промяна и колко чакат проверка; клик → Отдели с филтъра „За проверка". */
function ctHomeUpdateHtml(){
  if(!isAdminContacts())return '';
  var people=allContacts.filter(function(c){return c.type==='contact';});
  var last=null;
  people.forEach(function(c){ if(c.updated_at && (!last || String(c.updated_at)>String(last.updated_at))) last=c; });
  var stale=people.filter(ctIsStale).length;
  var when=last?fmtDate(String(last.updated_at).slice(0,10))+(ctClean(last.updated_by)?' · '+esc(ctClean(last.updated_by)):''):'—';
  return '<div class="ct-upd">🗓️ Последно обновяване на указателя: <b>'+when+'</b>'+
    '<span style="flex:1;"></span>'+
    (stale
      ? '<button class="ct-chip ct-chip-warn" onclick="contactsStaleOnly=true;setContactsTab(\'contact\')">⚠️ '+stale+' за проверка →</button>'
      : '<span style="color:#15803d;font-weight:600;">✅ Всичко е проверено</span>')+
    '</div>';
}
function ctRenderHome(grid){
  var h=ctHomeUpdateHtml()+'<div class="ct-home">';
  h+='<div class="ct-col">'+ctHomeDeptsHtml()+ctHomeStoresHtml()+'</div>';
  h+='<div class="ct-col">'+ctHomeFeaturedHtml()+'</div>';
  h+='<div class="ct-col">'+ctHomeTopicsHtml()+ctHomeHelpHtml()+'</div>';
  h+='</div>';
  grid.innerHTML=h;
  ctRenderTopicList();
}

function ctHomeDeptsHtml(){
  var counts={};
  ctDeptList().forEach(function(c){ var k=ctClean(c.category)||'Друго'; counts[k]=(counts[k]||0)+1; });
  var cats=Object.keys(counts).sort(function(a,b){ return ctCatIdx(a)-ctCatIdx(b) || a.localeCompare(b,'bg'); });
  var stores=ctStoreNames().length;
  var h='<div class="ct-panel"><div class="ct-ph"><span>Отдели</span></div><div class="ct-tiles">';
  cats.forEach(function(k){
    var ic=ctDeptIcon(k);
    h+='<button class="ct-tile" data-cat="'+escAttr(k)+'" onclick="openContactsDept(this.dataset.cat)">'+
       '<span class="ct-tico" style="background:'+ic[1]+';">'+ic[0]+'</span>'+
       '<span class="ct-tt"><b>'+esc(k)+'</b><small>'+counts[k]+' '+(counts[k]===1?'лице':'лица')+'</small></span><span class="ct-chev">›</span></button>';
  });
  h+='<button class="ct-tile" onclick="setContactsTab(\'stores\')"><span class="ct-tico" style="background:#dcfce7;">🏬</span>'+
     '<span class="ct-tt"><b>Магазини</b><small>'+stores+' '+(stores===1?'локация':'локации')+'</small></span><span class="ct-chev">›</span></button>';
  return h+'</div></div>';
}

function ctHomeStoresHtml(){
  var names=ctStoreNames();
  var h='<div class="ct-panel"><div class="ct-ph"><span>Нашите магазини ('+names.length+')</span>'+
        '<button class="ct-link" onclick="setContactsTab(\'stores\')">Виж всички магазини →</button></div>';
  if(!names.length) return h+'<div class="ct-empty">Няма въведени обекти.</div></div>';
  h+='<div class="ct-scards">';
  names.slice(0,6).forEach(function(n){
    var line=ctStoreLine(n), mgr=ctStoreManager(n);
    var img=line&&line.photo_url
      ? '<img src="'+escAttr(line.photo_url)+'" alt="">'
      : '<div class="ct-sph">🏬</div>';
    h+='<button class="ct-scard" data-store="'+escAttr(n)+'" onclick="openContactsStore(this.dataset.store)">'+
       '<span class="ct-simg">'+img+'</span>'+
       '<span class="ct-sname">'+esc(n)+'<span class="ct-chev">›</span></span>'+
       '<span class="ct-smgr">'+(mgr?esc(ctRoleLabel(mgr))+': '+esc(mgr.name):'Няма въведен персонал')+'</span></button>';
  });
  return h+'</div></div>';
}

/* Често търсени: отметнатите (featured). Ако няма нито един — ръководството,
   за да не е празен блокът; админът вижда как се попълва. */
function ctHomeFeaturedHtml(){
  var list=allContacts.filter(function(c){ return c.type==='contact' && c.featured && c.store_role!=='store'; });
  var fallback=false;
  if(!list.length){
    fallback=true;
    list=allContacts.filter(function(c){ return c.type==='contact' && (c.category==='Ръководство'||c.category==='Регионално ръководство'); });
  }
  list=list.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0) || ctCatIdx(a.category)-ctCatIdx(b.category) || ctByName(a,b); }).slice(0,8);
  var h='<div class="ct-panel"><div class="ct-ph"><span>Често търсени контакти</span></div>';
  if(fallback && isAdminContacts()) h+='<div class="ct-note">Няма отбелязани. Засега се показва ръководството — отбележи „⭐ Често търсен“ в редакцията на човека.</div>';
  if(!list.length) return h+'<div class="ct-empty">Няма контакти.</div></div>';
  list.forEach(function(c){
    var t=ctTel(c.phone), mail=ctClean(c.email);
    var where=ctIsStoreStaff(c)?ctClean(c.store_name):ctClean(c.category);
    var role=ctIsStoreStaff(c)?ctRoleLabel(c):ctClean(c.role_title);
    h+='<div class="ct-fcard" data-id="'+escAttr(c.id)+'" onclick="openContactDetail(this.dataset.id)" title="Отвори контакта" style="cursor:pointer;">'+
       ctAvatar(c,56)+
       '<div class="ct-fbody"><div class="ct-fname">'+esc(c.name||'')+'</div>'+
       (role?'<div class="ct-frole">'+esc(role)+'</div>':'')+
       (where?'<div class="ct-fwhere">'+esc(where)+'</div>':'')+
       (t?'<a class="ct-fline" href="tel:'+escAttr(t)+'" onclick="event.stopPropagation()">📞 '+esc(ctPhoneShow(c.phone))+'</a>':'')+
       (mail?'<a class="ct-fline ct-fmail" href="mailto:'+escAttr(mail)+'" onclick="event.stopPropagation()">✉️ '+esc(mail)+'</a>':'')+
       '</div><span class="ct-chev">›</span></div>';
  });
  return h+'</div>';
}

/* ── Кой за какво отговаря ── */
function ctHomeTopicsHtml(){
  var isAdmin=isAdminContacts();
  return '<div class="ct-panel" id="ct-topics"><div class="ct-ph"><span>Кой за какво отговаря?</span>'+
    (isAdmin?'<button class="ct-link" onclick="openTopicModal(null)">+ Тема</button>':'')+'</div>'+
    '<div class="ct-tsearch"><span>🔍</span><input id="ct-topic-q" placeholder="Избери проблем или дейност..." oninput="ctRenderTopicList()" autocomplete="off"></div>'+
    '<div id="ct-topics-list"></div></div>';
}
function ctTopicTarget(t){
  var c=ctById(t.contact_id);
  if(c) return c.name;
  return ctClean(t.category);
}
function ctRenderTopicList(){
  var box=document.getElementById('ct-topics-list');
  if(!box)return;
  var isAdmin=isAdminContacts();
  var q=((document.getElementById('ct-topic-q')||{}).value||'').trim().toLowerCase();
  var list=allContactTopics.filter(function(t){
    if(t.active===false)return false;
    if(!q)return true;
    return [t.topic,t.category,ctTopicTarget(t)].some(function(v){ return v&&String(v).toLowerCase().indexOf(q)>=0; });
  });
  if(!list.length){ box.innerHTML='<div class="ct-empty">'+(q?'Няма тема за „'+esc(q)+'“.':'Няма въведени теми.')+'</div>'; return; }
  box.innerHTML=list.map(function(t){
    var target=ctTopicTarget(t);
    return '<div class="ct-trow" data-id="'+escAttr(t.id)+'" onclick="ctOpenTopic(this.dataset.id)" style="cursor:pointer;">'+
      '<span class="ct-tico2">'+esc(t.icon||'•')+'</span>'+
      '<span class="ct-ttopic">'+esc(t.topic)+'</span>'+
      '<span class="ct-tdept'+(target?'':' ct-tnone')+'">'+(target?esc(target):'не е зададен')+'</span>'+
      (isAdmin?'<button class="ct-tedit" data-id="'+escAttr(t.id)+'" title="Редактирай темата" onclick="event.stopPropagation();openTopicModal(this.dataset.id)">✏️</button>':'')+
      '<span class="ct-chev">›</span></div>';
  }).join('');
}
function ctTopicById(id){
  for(var i=0;i<allContactTopics.length;i++) if(String(allContactTopics[i].id)===String(id)) return allContactTopics[i];
  return null;
}
/* Клик по тема: конкретен отговорник → неговият детайл; само отдел →
   списъкът на отдела; нищо → админът редактира, другите виждат съобщение. */
function ctOpenTopic(id){
  var t=ctTopicById(id); if(!t)return;
  var c=ctById(t.contact_id);
  if(c) return openContactDetail(c.id);
  if(ctClean(t.category)) return openContactsDept(ctClean(t.category));
  if(isAdminContacts()) return openTopicModal(t.id);
  toast('За „'+t.topic+'“ още няма зададен отговорник','#64748b');
}

/* ── Нуждаеш се от помощ ── */
function ctHomeHelpHtml(){
  var hr=allContacts.filter(function(c){ return c.type==='contact' && c.category==='Човешки ресурси'; })
    .sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0) || ctByName(a,b); });
  var withTel=hr.filter(function(c){return ctTel(c.phone);})[0];
  var withMail=hr.filter(function(c){return ctClean(c.email);})[0];
  var call=withTel
    ? '<a class="ct-hbtn ct-hbtn-y" href="tel:'+escAttr(ctTel(withTel.phone))+'">📞 Свържи се с HR</a>'
    : '<button class="ct-hbtn ct-hbtn-y" onclick="openContactsDept(\'Човешки ресурси\')">📞 Свържи се с HR</button>';
  var mail=withMail
    ? '<a class="ct-hbtn" href="mailto:'+escAttr(ctClean(withMail.email))+'">✉️ Изпрати запитване</a>'
    : '<button class="ct-hbtn" onclick="openContactsDept(\'Човешки ресурси\')">✉️ Изпрати запитване</button>';
  return '<div class="ct-help"><div class="ct-help-h"><span class="ct-help-ico">🙋</span><b>Нуждаеш се от помощ?</b></div>'+
    '<div class="ct-help-p">Ако не си сигурен към кого да се обърнеш, свържи се с отдел „Човешки ресурси“.</div>'+
    call+mail+'</div>';
}

/* ── Търсене от банера: хора от отделите И от магазините, плюс темите ── */
function ctRenderSearchAll(grid){
  var isAdmin=isAdminContacts(), q=ctSearchQ();
  var people=allContacts.filter(function(c){ return c.type==='contact' && c.store_role!=='store' && ctMatches(c,q); })
    .sort(function(a,b){ return ctByName(a,b); });
  var topics=allContactTopics.filter(function(t){
    return t.active!==false && [t.topic,t.category,ctTopicTarget(t)].some(function(v){ return v&&String(v).toLowerCase().indexOf(q)>=0; });
  });
  var h='';
  if(topics.length){
    h+='<div class="ct-box"><div class="ct-box-h"><b style="font-size:14px;">Кой за какво отговаря</b><div style="flex:1;"></div><span style="font-size:11px;color:#94a3b8;">'+topics.length+'</span></div>'+
      topics.map(function(t){
        var target=ctTopicTarget(t);
        return '<div class="ct-trow" data-id="'+escAttr(t.id)+'" onclick="ctOpenTopic(this.dataset.id)" style="cursor:pointer;">'+
          '<span class="ct-tico2">'+esc(t.icon||'•')+'</span><span class="ct-ttopic">'+esc(t.topic)+'</span>'+
          '<span class="ct-tdept'+(target?'':' ct-tnone')+'">'+(target?esc(target):'не е зададен')+'</span><span class="ct-chev">›</span></div>';
      }).join('')+'</div>';
  }
  if(!people.length && !topics.length){ grid.innerHTML=ctEmpty('🔍','Няма резултати за „'+esc(q)+'“.',false); return; }
  if(people.length){
    h+='<div class="ct-box"><div class="ct-box-h"><b style="font-size:14px;">Хора</b><div style="flex:1;"></div><span style="font-size:11px;color:#94a3b8;">'+people.length+'</span></div>';
    h+='<div class="ct-row ct-head"><div class="ct-c-dir">Отдел / Обект</div><div>Име</div><div class="ct-c-role">Длъжност</div><div>Телефон</div><div class="ct-c-mail">Имейл</div><div class="ct-c-dep">Заместник</div><div></div></div>';
    people.forEach(function(c){
      var staff=ctIsStoreStaff(c), dep=ctById(c.deputy_id), mail=ctClean(c.email);
      h+='<div '+ctRowAttrs(c)+'>'+
        '<div class="ct-c-dir ct-c-sub">'+esc(staff?('🏬 '+(ctClean(c.store_name)||'')):ctClean(c.category))+'</div>'+
        '<div class="ct-c-name"><div class="ct-nm">'+esc(c.name||'')+'</div>'+ctStaleBadge(c)+'</div>'+
        '<div class="ct-c-role ct-c-sub">'+esc(staff?ctRoleLabel(c):ctClean(c.role_title))+'</div>'+
        ctPhoneCell(c)+
        '<div class="ct-c-mail">'+(mail?'<a href="mailto:'+escAttr(mail)+'" onclick="event.stopPropagation()">'+esc(mail)+'</a>':'')+'</div>'+
        '<div class="ct-c-dep ct-c-sub">'+(dep?esc(dep.name):'')+'</div>'+
        ctActCell(c,isAdmin)+'</div>';
    });
    h+='</div>';
  }
  grid.innerHTML=h;
}

/* ── Модал за тема (само админ) ── */
function ctTopicModalHtml(){
  var t=contactsTopicEdit||{};
  var isEdit=!!contactsTopicEdit;
  var cats=ctCategoryOptions('contact', ctClean(t.category)).filter(function(c){ return c!==CT_STORE_CAT; });
  var people=allContacts.filter(function(c){ return c.type==='contact' && c.store_role!=='store'; }).sort(ctByName);
  return '<div class="bov" id="ctt-ov"><div class="bmod" style="width:460px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
      '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Тема':'+ Нова тема')+'</div>'+
      '<button onclick="closeTopicModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="display:flex;gap:10px;"><div style="flex:0 0 80px;"><label class="fl">Иконка</label><input class="fi" id="ctt-icon" value="'+ctVal(t.icon)+'" placeholder="🚚" style="text-align:center;"></div>'+
    '<div style="flex:1;"><label class="fl">Проблем / дейност *</label><input class="fi" id="ctt-topic" value="'+ctVal(t.topic)+'" placeholder="напр. Грешна цена"></div></div>'+
    '<label class="fl">Отдел</label><select class="fi" id="ctt-cat"><option value="">— не е зададен —</option>'+
      cats.map(function(c){ return '<option value="'+escAttr(c)+'"'+(ctClean(t.category)===c?' selected':'')+'>'+esc(c)+'</option>'; }).join('')+'</select>'+
    '<label class="fl">Отговорник (по избор)</label><select class="fi" id="ctt-contact"><option value="">— целият отдел —</option>'+
      people.map(function(c){
        var lbl=c.name+(ctIsStoreStaff(c)&&ctClean(c.store_name)?' · '+ctClean(c.store_name):(c.category?' · '+c.category:''));
        return '<option value="'+escAttr(c.id)+'"'+(String(t.contact_id||'')===String(c.id)?' selected':'')+'>'+esc(lbl)+'</option>';
      }).join('')+'</select>'+
    '<label class="fl">Ред на показване</label><input class="fi" id="ctt-sort" type="number" value="'+(t.sort_order!=null?Number(t.sort_order):'')+'" placeholder="10, 20, 30...">'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'+
      (isEdit?'<button onclick="deleteTopic()" style="margin-right:auto;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">Изтрий</button>':'')+
      '<button onclick="closeTopicModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button onclick="submitTopic()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>'+
    '</div></div></div>';
}
function openTopicModal(id){
  contactsTopicEdit = id ? ctTopicById(id) : null;
  var old=document.getElementById('ctt-ov'); if(old)old.remove();
  var wrap=document.getElementById('mod-contacts'); if(!wrap)return;
  wrap.insertAdjacentHTML('beforeend',ctTopicModalHtml());
  document.getElementById('ctt-ov').classList.add('open');
}
function closeTopicModal(){
  var ov=document.getElementById('ctt-ov'); if(ov)ov.classList.remove('open');
  contactsTopicEdit=null;
}
function submitTopic(){
  function val(id){ var el=document.getElementById(id); return el?String(el.value||'').trim():''; }
  var topic=val('ctt-topic');
  if(!topic){toast('Въведи проблем / дейност','#dc2626');return;}
  var sort=val('ctt-sort');
  var data={
    topic:topic, icon:val('ctt-icon')||null, category:val('ctt-cat')||null,
    contact_id:val('ctt-contact')||null,
    sort_order:sort===''?0:(parseInt(sort,10)||0),
    updated_by:(currentUser&&(currentUser.display_name||currentUser.email))||null
  };
  var isEdit=!!contactsTopicEdit;
  var p=isEdit ? sbPatch('contact_topics','id=eq.'+contactsTopicEdit.id,data) : sbPost('contact_topics',data);
  p.then(function(res){
    if(!res.ok){toast('⚠️ Темата НЕ е записана: '+sbErrMsg(res),'#dc2626');return;}
    closeTopicModal();
    toast('✅ '+(isEdit?'Записано!':'Добавено!'));
    loadContacts();
  });
}
function deleteTopic(){
  var t=contactsTopicEdit; if(!t)return;
  if(!confirm('Изтрий темата „'+t.topic+'“?'))return;
  sbDelete('contact_topics','id=eq.'+t.id).then(function(res){
    if(!res.ok){toast('⚠️ Темата НЕ е изтрита: '+sbErrMsg(res),'#dc2626');return;}
    closeTopicModal(); toast('✓ Изтрита'); loadContacts();
  });
}

/* ── CARD (само Доставчици) ── */
/* ── CARD ── */
function contactCard(c, isAdmin) {
  var initials=(c.name||'?').split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase();
  var bgC=['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#0f172a'];
  var bg=bgC[(c.name.charCodeAt(0)||0)%bgC.length];
  /* Цялата картичка отваря детайла; бутоните и линковете спират bubbling-а,
     за да не отварят детайла вместо своето действие. */
  var h='<div data-id="'+esc(c.id)+'" onclick="openContactDetail(this.dataset.id)" title="Отвори контакта" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;cursor:pointer;">';
  h+='<div style="height:100px;background:linear-gradient(135deg,'+bg+','+bg+'bb);display:flex;align-items:center;justify-content:center;">';
  h+=c.photo_url
    ?'<img src="'+c.photo_url+'" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.8);">'
    :'<div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.2);border:3px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;">'+initials+'</div>';
  h+='</div>';
  h+='<div style="padding:12px 14px;">';
  h+='<div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px;">'+esc(c.name||'')+'</div>';
  if(c.role_title)h+='<div style="font-size:11px;color:#64748b;margin-bottom:6px;">'+esc(c.role_title)+'</div>';
  if(c.phone)h+='<a href="tel:'+esc(c.phone)+'" onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:6px;padding:4px 0;text-decoration:none;color:#0f172a;font-size:12.5px;border-bottom:1px solid #f8fafc;">📞 '+esc(c.phone)+'</a>';
  if(c.email)h+='<a href="mailto:'+esc(c.email)+'" onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:6px;padding:4px 0;text-decoration:none;color:#2563eb;font-size:12px;border-bottom:1px solid #f8fafc;">✉️ '+esc(c.email)+'</a>';
  if(c.notes)h+='<div style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.4;">'+esc(c.notes.slice(0,80))+(c.notes.length>80?'...':'')+'</div>';
  if(isAdmin){
    h+='<div style="display:flex;gap:6px;margin-top:10px;">';
    h+='<button data-id="'+c.id+'" onclick="event.stopPropagation();openContactModal(this.dataset.id)" style="flex:1;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:5px;font-size:12px;cursor:pointer;">✏️ Редактирай</button>';
    h+='<button data-id="'+c.id+'" onclick="event.stopPropagation();doDeleteContact(this.dataset.id)" style="border:1px solid #fecaca;background:#fff5f5;color:#dc2626;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">✕</button>';
    h+='</div>';
  }
  h+='</div></div>';
  return h;
}

/* ═══ МОДАЛ „КОНТАКТ" (само за четене) ═══
   По образец на openTransportDetail(): общите coDetailRow/coDetailSection,
   overlay 'ctd-ov' и собствен Escape handler, който отстъпва, ако отгоре е
   отворен друг детайл (cod-ov / trd-ov). Тук е снимката — списъкът нарочно
   е без нея. Заместникът е линк към неговия детайл.
   active / store_visible / created_at / sort_order са системни и не се показват. */
var ctDetailEscHandler=null;
function openContactDetail(id){
  var c=ctById(id);
  if(!c){toast('Контактът не е намерен','#dc2626');return;}
  var name=c.name||'?';
  var initials=name.split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase();
  var bgC=['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#0f172a'];
  var bg=bgC[(name.charCodeAt(0)||0)%bgC.length];
  var avatar=c.photo_url
    ?'<img src="'+escAttr(c.photo_url)+'" style="width:96px;height:96px;border-radius:50%;object-fit:cover;flex:0 0 96px;">'
    :'<div style="width:96px;height:96px;flex:0 0 96px;border-radius:50%;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#fff;">'+esc(initials)+'</div>';

  var isSupplier=c.type==='supplier';
  var telRaw=ctTel(c.phone);
  var role=ctIsStoreStaff(c)?ctRoleLabel(c):ctClean(c.role_title);
  var dep=ctById(c.deputy_id);
  var deputyOf=allContacts.filter(function(x){return x.deputy_id&&String(x.deputy_id)===String(c.id);});
  var rows='';
  if(ctClean(c.phone))rows+=coDetailRow('Телефон',telRaw
    ?'<a href="tel:'+escAttr(telRaw)+'" style="color:#2563eb;text-decoration:none;font-family:monospace;">'+esc(ctPhoneShow(c.phone))+'</a>'
    :esc(ctPhoneShow(c.phone)));
  if(ctClean(c.email))rows+=coDetailRow('Имейл','<a href="mailto:'+escAttr(ctClean(c.email))+'" style="color:#2563eb;text-decoration:none;">'+esc(ctClean(c.email))+'</a>');
  if(c.category)rows+=coDetailRow(isSupplier?'Категория':'Отдел / Категория',esc(c.category));
  if(ctClean(c.direction))rows+=coDetailRow('Направление',esc(ctClean(c.direction)));
  if(ctClean(c.store_name))rows+=coDetailRow('Магазин',esc(ctClean(c.store_name)));
  if(ctClean(c.address))rows+=coDetailRow('Адрес',esc(ctClean(c.address)));
  if(dep)rows+=coDetailRow('Заместник','<a href="javascript:void(0)" data-id="'+escAttr(dep.id)+'" onclick="openContactDetail(this.dataset.id)" style="color:#2563eb;text-decoration:none;">'+esc(dep.name)+'</a>'+
    (ctTel(dep.phone)?' · <a href="tel:'+escAttr(ctTel(dep.phone))+'" style="color:#2563eb;text-decoration:none;font-family:monospace;">'+esc(ctPhoneShow(dep.phone))+'</a>':''));
  if(deputyOf.length)rows+=coDetailRow('Замества',deputyOf.map(function(x){
    return '<a href="javascript:void(0)" data-id="'+escAttr(x.id)+'" onclick="openContactDetail(this.dataset.id)" style="color:#2563eb;text-decoration:none;">'+esc(x.name)+'</a>';
  }).join(', '));
  var upd=c.updated_at?fmtDate(String(c.updated_at).slice(0,10)):'';
  var updTxt=upd?upd+(ctClean(c.updated_by)?' · '+ctClean(c.updated_by):''):'';

  var editBtn=isAdminContacts()
    ?(c.type==='contact'?'<button data-id="'+escAttr(c.id)+'" onclick="confirmContact(this.dataset.id)" style="margin-right:auto;border:1px solid #bbf7d0;background:#f0fdf4;color:#15803d;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;">✓ Данните са верни</button>':'')+
     '<button data-id="'+escAttr(c.id)+'" onclick="closeContactDetail();openContactModal(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">✏️ Редактирай</button>'
    :'';

  var html='<div class="bov" id="ctd-ov"><div class="bmod" style="width:480px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'+
      '<div style="display:flex;gap:16px;align-items:center;min-width:0;">'+avatar+
        '<div style="min-width:0;"><div style="font-size:17px;font-weight:600;color:#0f172a;word-break:break-word;">'+esc(c.name||'')+'</div>'+
        (role?'<div style="font-size:12.5px;color:#64748b;margin-top:2px;">'+esc(role)+'</div>':'')+
        '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">'+(isSupplier?'🏭 Доставчик':'👥 Контакт')+'</div></div></div>'+
      '<button onclick="closeContactDetail()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    coDetailSection('Данни',rows)+
    coDetailSection('Бележки',ctClean(c.notes)?'<div style="font-size:12.5px;color:#1e293b;white-space:pre-wrap;word-break:break-word;line-height:1.45;">'+esc(c.notes)+'</div>':'')+
    (updTxt?'<div style="font-size:11px;color:#94a3b8;margin-top:12px;">Последна промяна: '+esc(updTxt)+'</div>':'')+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">'+editBtn+
      '<button onclick="closeContactDetail()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Затвори</button>'+
    '</div></div></div>';

  var ex=document.getElementById('ctd-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('ctd-ov').classList.add('open');
  if(ctDetailEscHandler)document.removeEventListener('keydown',ctDetailEscHandler);
  ctDetailEscHandler=function(e){
    if(e.key!=='Escape')return;
    if(document.getElementById('cod-ov')||document.getElementById('trd-ov'))return;
    closeContactDetail();
  };
  document.addEventListener('keydown',ctDetailEscHandler);
}
function closeContactDetail(){
  var el=document.getElementById('ctd-ov');if(el)el.remove();
  if(ctDetailEscHandler){
    document.removeEventListener('keydown',ctDetailEscHandler);
    ctDetailEscHandler=null;
  }
}

function doDeleteContact(id){
  if(!confirm('Изтрий записа?'))return;
  var wasSupplier = allContacts.some(function(c){return c.id===id && c.type==='supplier';});
  sbDelete('contacts','id=eq.'+id).then(function(res){
    if(!res.ok){
      console.error('doDeleteContact: записът НЕ беше изтрит',id,res.error);
      toast('⚠️ Записът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadContacts(); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadContacts(); return; }
    if(wasSupplier) invalidateSuppliersCache();
    toast('✓ Изтрит');loadContacts();
  });
}

/* ── МОДАЛ ДОБАВИ / РЕДАКТИРАЙ ──
   Категориите са ОБЕДИНЕНИЕ от базовия списък и реално използваните в
   базата. Преди (до v3) падащото меню имаше само 7 фиксирани стойности и
   редакция на човек от „Счетоводство" (или доставчик от „Гр. 101") тихо
   сменяше категорията му на първата опция. */
function ctCategoryOptions(type, current){
  var base = type==='supplier' ? CT_SUPPLIER_CATS.slice() : CAT_ORDER.concat([CT_STORE_CAT]);
  allContacts.forEach(function(c){ if(c.type===type && c.category && base.indexOf(c.category)<0) base.push(c.category); });
  if(current && base.indexOf(current)<0) base.push(current);
  return base;
}
/* Обекти: таблицата stores + вече въведените в контактите (там има и
   логистични складове, които не са в stores) + текущата стойност — стара
   стойност не се трие тихо. */
function ctStoreOptions(current){
  var seen={}, out=[];
  function add(n){ n=ctClean(n); if(n&&!seen[n]){seen[n]=1;out.push(n);} }
  (allStoresCache||[]).forEach(add);
  allContacts.forEach(function(c){ if(c.type==='contact') add(c.store_name); });
  add(current);
  return out.sort(function(a,b){ return a.localeCompare(b,'bg'); });
}
function ctStoreOptionsHtml(current){
  current=ctClean(current);
  return '<option value="">— не е в обект —</option>'+ctStoreOptions(current).map(function(n){
    return '<option value="'+escAttr(n)+'"'+(n===current?' selected':'')+'>'+esc(n)+'</option>';
  }).join('');
}

function contactModalHtml() {
  var c = contactsEdit || {};
  var isEdit = !!contactsEdit;
  var type = isEdit ? (c.type||'contact') : ctTypeForTab(contactsTab);
  var isSup = type==='supplier';
  var curCat = isEdit ? c.category
    : (contactsTab==='stores' ? CT_STORE_CAT : (contactsTab==='contact' && contactsCat ? contactsCat : ''));
  var catOpts = ctCategoryOptions(type, curCat);
  var curRole = isEdit ? (c.store_role||'') : '';
  var curStore = isEdit ? c.store_name : (contactsTab==='stores' ? contactsStore : '');
  var deputies = allContacts.filter(function(x){ return x.type==='contact' && (!isEdit || String(x.id)!==String(c.id)) && x.store_role!=='store'; }).sort(ctByName);

  var h = '<div class="bov" id="contact-ov">' +
    '<div class="bmod" style="width:520px;max-width:95vw;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<div style="font-size:15px;font-weight:600;">'+(isEdit?'✏️ Редактирай':'+ Добави '+(isSup?'доставчик':'контакт'))+'</div>' +
    '<button onclick="closeContactModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>' +
    '<div style="text-align:center;margin-bottom:14px;">' +
    '<div id="contact-photo-wrap" style="width:80px;height:80px;border-radius:50%;background:#e2e8f0;margin:0 auto 8px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:28px;">' +
    (c.photo_url?'<img src="'+escAttr(c.photo_url)+'" style="width:100%;height:100%;object-fit:cover;">':'👤') +
    '</div>' +
    '<label style="font-size:12px;color:#2563eb;cursor:pointer;font-weight:600;">📷 Избери снимка' +
    '<input type="file" id="contact-photo-input" accept=".jpg,.jpeg,.png,.webp" style="display:none;" onchange="previewContactPhoto(this)"></label>' +
    '</div>' +
    '<label class="fl">Име *</label><input class="fi" id="ct-name" value="'+ctVal(c.name)+'" placeholder="Пълно име">' +
    '<label class="fl">Длъжност / Роля</label><input class="fi" id="c-role" value="'+ctVal(c.role_title)+'" placeholder="напр. Категориен мениджър">' +
    '<label class="fl">'+(isSup?'Категория':'Отдел')+'</label>' +
    '<select class="fi" id="c-cat">'+catOpts.map(function(o){return '<option value="'+escAttr(o)+'"'+(curCat===o?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';
  if(!isSup){
    h += '<label class="fl">Направление</label><input class="fi" id="ct-dir" value="'+ctVal(c.direction)+'" placeholder="напр. Транспорт, ERP / SAP, Подбор">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:180px;"><label class="fl">Магазин</label><select class="fi" id="c-store">'+ctStoreOptionsHtml(curStore)+'</select></div>' +
        '<div style="flex:1;min-width:180px;"><label class="fl">Длъжност в обекта</label><select class="fi" id="ct-srole">'+
          '<option value="">— не е в обект —</option>'+
          CT_STORE_ROLES.map(function(r){ return '<option value="'+r[0]+'"'+(curRole===r[0]?' selected':'')+'>'+esc(r[1])+'</option>'; }).join('')+
        '</select></div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin:12px 0 2px;font-size:13px;cursor:pointer;"><input type="checkbox" id="ct-featured"'+(c.featured?' checked':'')+'> ⭐ Често търсен <span style="color:#94a3b8;font-size:11.5px;">(показва се на Начало)</span></label>' +
      '<label class="fl">Заместник</label><select class="fi" id="ct-deputy"><option value="">— няма —</option>'+
        deputies.map(function(x){
          var lbl=x.name+(ctIsStoreStaff(x)&&ctClean(x.store_name)?' · '+ctClean(x.store_name):(x.category?' · '+x.category:''));
          return '<option value="'+escAttr(x.id)+'"'+(String(c.deputy_id||'')===String(x.id)?' selected':'')+'>'+esc(lbl)+'</option>';
        }).join('')+
      '</select>';
  } else {
    h += '<input type="hidden" id="c-store" value="">';
  }
  h += '<label class="fl">Телефон</label><input class="fi" id="ct-phone" value="'+ctVal(c.phone)+'" placeholder="0888 ...">'+
    '<label class="fl">Имейл</label><input class="fi" id="c-email" value="'+ctVal(c.email)+'" placeholder="name@temax.bg">'+
    '<label class="fl">Бележки</label><textarea class="fi" id="c-notes" rows="2" style="resize:none;">'+(ctClean(c.notes)?esc(c.notes):'')+'</textarea>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
    '<button onclick="closeContactModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>' +
    '<button onclick="submitContact()" style="border:none;background:#2563eb;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'Запази':'Добави')+'</button>' +
    '</div></div></div>';
  return h;
}

function openContactModal(id) {
  contactsEdit = id ? (ctById(id)||null) : null;
  renderContacts();
  var ov = document.getElementById('contact-ov');
  if (ov) ov.classList.add('open');
  /* Списъкът с обекти идва на заден план — модалът не го чака; щом
     пристигне, се допълва само падащото меню, без да се губи въведеното. */
  if (!allStoresCache && typeof loadAllStores==='function') {
    loadAllStores().then(function(){
      var sel=document.getElementById('c-store');
      if(sel && sel.tagName==='SELECT'){ var cur=sel.value; sel.innerHTML=ctStoreOptionsHtml(cur); }
    });
  }
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
  var name=(document.getElementById('ct-name').value||'').trim();
  if(!name){toast('Въведи име','#dc2626');return;}
  var type = contactsEdit ? (contactsEdit.type||'contact') : ctTypeForTab(contactsTab);
  function val(id){ var el=document.getElementById(id); return el?String(el.value||'').trim():''; }
  var data={
    name:name, type:type,
    role_title:val('c-role'),
    category:val('c-cat'),
    store_name:val('c-store'),
    phone:val('ct-phone'),
    email:val('c-email'),
    notes:val('c-notes'),
    updated_by:(currentUser&&(currentUser.display_name||currentUser.email))||null
  };
  if(type!=='supplier'){
    data.direction=val('ct-dir')||null;
    data.store_role=val('ct-srole')||null;
    data.deputy_id=val('ct-deputy')||null;
    var fe=document.getElementById('ct-featured'); data.featured=!!(fe&&fe.checked);
    if(data.store_role && !data.store_name){toast('Избери магазин за длъжността в обекта','#dc2626');return;}
  }
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
  /* isEdit се помни ПРЕДИ closeContactModal(), който нулира contactsEdit —
     иначе съобщението винаги казваше „Добавено!", и при редакция. */
  var isEdit=!!contactsEdit;
  var p=isEdit
    ? sbPatch('contacts','id=eq.'+contactsEdit.id,data)
    : sbPost('contacts',data);
  p.then(function(res){
    if(!res.ok){toast('⚠️ Грешка при запис: '+sbErrMsg(res),'#dc2626');return;}
    if(data.type==='supplier') invalidateSuppliersCache();
    closeContactModal();
    toast('✅ '+(isEdit?'Записано!':'Добавено!'));
    loadContacts();
  });
}
