/* docs.js — Инструкции и документи */

var DOCS_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var DOCS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var DOCS_BKT = 'docs';

/* Папка „🔒 Само за офиса“ (18.11.2026): вижда я САМО role 'admin'.
   Отделно правило от isAdmin в renderDocs (admin+accounting, за бутона 🗑). */
var DOCS_OFFICE_CAT = 'Само за офиса';
function docsOfficeVisible(){ return !!(currentUser && currentUser.role === 'admin'); }

/* Бутонът във #doc-filters и опцията в #d-cat следват docsOfficeVisible().
   Вика се при всеки рендер на таба и при отваряне на модала. */
function docsApplyOfficeUi(){
  var vis=docsOfficeVisible();
  var b=document.getElementById('doc-filter-office');
  if(b) b.style.display=vis?'':'none';
  var opt=document.getElementById('d-cat-office');
  if(opt){
    opt.hidden=!vis; opt.disabled=!vis; opt.style.display=vis?'':'none';
    var sel=document.getElementById('d-cat');
    if(!vis&&sel&&sel.value===DOCS_OFFICE_CAT) sel.selectedIndex=0;
  }
  if(!vis&&docFilter===DOCS_OFFICE_CAT){
    docFilter='all';
    var bs=document.querySelectorAll('#doc-filters .filter-btn');
    for(var i=0;i<bs.length;i++) bs[i].classList.toggle('active',i===0);
  }
}

function loadDocs(){
  sbGet('documents','order=created_at.desc').then(function(data){
    docs=Array.isArray(data)?data:[];renderDocs();
  }).catch(function(){});
}

function renderDocs(){
  docsApplyOfficeUi();
  var officeOk=docsOfficeVisible();
  var list=docs.filter(function(d){
    if(d.category===DOCS_OFFICE_CAT&&!officeOk) return false;
    return docFilter==='all'||d.category===docFilter;
  });
  var grid=document.getElementById('doc-grid');if(!grid)return;
  if(!list.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:#94a3b8;"><div style="font-size:32px;">📁</div><div>Няма документи.</div></div>';
    return;
  }
  var icons={SAP:'🖥',Процедури:'📋',Обучения:'🎓',Формуляри:'📝',Друго:'📄'};
  icons[DOCS_OFFICE_CAT]='🔒';
  var isAdmin=currentUser&&['admin','accounting'].indexOf(currentUser.role)>=0;
  /* label — текстът на картата (частта след тирето в група); grp — папката
     (data-doc-group), sub — подпапката (data-doc-sub). Без група — като преди. */
  function card(d,label,grp,sub){
    var delBtn=isAdmin
      ? '<button data-id="'+d.id+'" onclick="event.stopPropagation();docsDelete(this)" style="position:absolute;top:6px;right:6px;border:none;background:#fee2e2;color:#dc2626;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;font-weight:700;">✕</button>'
      : '';
    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:6px;position:relative;" data-url="'+esc(d.url)+'"'+(grp!=null?' data-doc-group="'+escAttr(grp)+'"':'')+(sub!=null?' data-doc-sub="'+escAttr(sub)+'"':'')+' onclick="docsOpen(this)">' +
      delBtn +
      '<div style="font-size:24px;">'+(icons[d.category]||'📄')+'</div>'+
      '<div style="font-size:13px;font-weight:500;">'+esc(label||'')+'</div>'+
      '<div style="font-size:11px;color:#94a3b8;">'+esc(d.category||'')+'</div>'+
      (d.description?'<div style="font-size:11px;color:#64748b;">'+esc(d.description)+'</div>':'')+
      '</div>';
  }
  /* Две нива (19.11.2026, решение на Тенчо): „Таб — Подтаб — име" → папка Таб,
     подпапка Подтаб; „Таб — име" → картата е направо в папката. Групирането е
     СЛЕД филтъра, тоест офисните документи за не-admin вече ги няма и не
     влизат в нито един брой. Папката брои всичко в себе си (и в подпапките). */
  var groups={},mods=[],loose=[];
  list.forEach(function(d){
    var s=docsSplitTitle(d.title);
    if(!s){loose.push(d);return;}
    var g=groups['m:'+s.mod];
    if(!g){g=groups['m:'+s.mod]={n:0,direct:[],subs:{},subNames:[]};mods.push(s.mod);}
    g.n++;
    if(s.sub==null){g.direct.push({d:d,part:s.part});return;}
    if(!g.subs['s:'+s.sub]){g.subs['s:'+s.sub]=[];g.subNames.push(s.sub);}
    g.subs['s:'+s.sub].push({d:d,part:s.part});
  });
  var tabs=docsPortalTabs(),tabNames=tabs.map(function(t){return t.name;});
  mods.sort(function(a,b){return docsOrderCmp(a,b,tabNames);});
  function byPart(a,b){return docsCardCmp(a.part,b.part);}
  var html=mods.map(function(m){
    var g=groups['m:'+m],open=!!docsOpenGroups['m:'+m];
    var hd='<div class="doc-group-hd" role="button" data-mod="'+escAttr(m)+'" onclick="docsToggleGroup(this)" style="grid-column:1/-1;cursor:pointer;padding:8px 10px;border-radius:8px;background:#f1f5f9;font-size:13px;font-weight:600;user-select:none;overflow-wrap:anywhere;">'+
      (open?'▾':'▸')+' 📂 '+esc(m)+' ('+g.n+')</div>';
    if(!open) return hd;
    var t=tabs[tabNames.indexOf(m)],subOrder=t?t.subs:[];
    var subsHtml=g.subNames.sort(function(a,b){return docsOrderCmp(a,b,subOrder);}).map(function(sn){
      var items=g.subs['s:'+sn].sort(byPart),sOpen=!!docsOpenGroups[docsSubKey(m,sn)];
      return '<div class="doc-sub" style="grid-column:1/-1;margin-left:16px;padding-left:10px;border-left:3px solid #cbd5e1;min-width:0;">'+
        '<div class="doc-sub-hd" role="button" data-mod="'+escAttr(m)+'" data-sub="'+escAttr(sn)+'" onclick="docsToggleSub(this)" style="cursor:pointer;padding:7px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;font-weight:600;user-select:none;overflow-wrap:anywhere;">'+
        (sOpen?'▾':'▸')+' 📁 '+esc(sn)+' ('+items.length+')</div>'+
        (sOpen?'<div class="doc-grid" style="margin-top:8px;">'+items.map(function(it){return card(it.d,it.part,m,sn);}).join('')+'</div>':'')+
        '</div>';
    }).join('');
    return hd+subsHtml+g.direct.sort(byPart).map(function(it){return card(it.d,it.part,m,null);}).join('');
  }).join('');
  grid.innerHTML=html+loose.map(function(d){return card(d,d.title,null,null);}).join('');
}

/* „Таб — част" или „Таб — Подтаб — част": разделителят е „ — ", „ – " или
   „ - ". Режат се най-много ДВЕ нива — трето и следващо тире остава в името.
   Без разделител (или с празна страна) → null, документът е без група.
   tools/publish-instrukcii.js ползва СЪЩАТА функция (чете я от този файл). */
function docsSplitTitle(title){
  var re=/ [—–-] /,t=String(title||''),m=re.exec(t);
  if(!m)return null;
  var mod=t.slice(0,m.index).trim(),rest=t.slice(m.index+m[0].length).trim();
  if(!mod||!rest)return null;
  var m2=re.exec(rest);
  if(m2){
    var sub=rest.slice(0,m2.index).trim(),part=rest.slice(m2.index+m2[0].length).trim();
    if(sub&&part)return {mod:mod,sub:sub,part:part};
  }
  return {mod:mod,sub:null,part:rest};
}

/* Табовете на портала в реда на горната лента, с подтабовете им — четат се от
   самия DOM (#nav-tabs-container и лентите *-subnav), без втори ръчен списък.
   Лентата с подтабове е на таба, чийто showModule(...) е сред бутоните ѝ.
   tools/publish-instrukcii.js прави същото по index.html; тестът ги сверява. */
function docsBtnLabel(s){
  var t=String(s||'').replace(/\s+/g,' ').trim(),m=/^(\S+) (.+)$/.exec(t);
  return (m&&!/[0-9A-Za-zА-Яа-яЁё]/.test(m[1]))?m[2]:t;
}
function docsBtnMod(b){
  var m=/showModule\('([^']+)'\)/.exec(b.getAttribute('onclick')||'');
  return m?m[1]:null;
}
function docsPortalTabs(){
  var out=[],c=document.getElementById('nav-tabs-container');
  if(!c)return out;
  var bs=c.querySelectorAll('button.nav-tab');
  for(var i=0;i<bs.length;i++){
    var tl=bs[i].querySelector('.tl');
    out.push({name:docsBtnLabel((tl||bs[i]).textContent),mod:docsBtnMod(bs[i]),subs:[]});
  }
  var navs=document.querySelectorAll('[id$="-subnav"]');
  for(var j=0;j<navs.length;j++){
    var sb=navs[j].querySelectorAll('button'),mods=[],names=[];
    for(var k=0;k<sb.length;k++){mods.push(docsBtnMod(sb[k]));names.push(docsBtnLabel(sb[k].textContent));}
    for(var x=0;x<out.length;x++){
      if(out[x].mod&&!out[x].subs.length&&mods.indexOf(out[x].mod)>=0){out[x].subs=names;break;}
    }
  }
  return out.map(function(t){return {name:t.name,subs:t.subs};});
}

/* Ред: първо имената от order (табове / подтабове) в техния ред, после
   непознатите по азбучен ред. */
function docsOrderCmp(a,b,order){
  var ia=order.indexOf(a),ib=order.indexOf(b);
  if(ia>=0&&ib>=0)return ia-ib;
  if(ia>=0)return -1;
  if(ib>=0)return 1;
  return a.localeCompare(b,'bg');
}
/* Картите: по азбучен ред, но „… пълна справка" е след ролите със същото
   начало („обекти", „складове", после „пълна справка"; същото след
   „Клиентски заявки: "). Началото е частта до последното „: ". */
function docsCardCmp(a,b){
  function pre(s){var i=s.lastIndexOf(': ');return i>=0?s.slice(0,i+2):'';}
  function full(s){return /пълна справка\s*$/i.test(s)?1:0;}
  var pa=pre(a),pb=pre(b);
  if(pa!==pb)return pa.localeCompare(pb,'bg');
  return (full(a)-full(b))||a.localeCompare(b,'bg');
}

/* Отворените папки и подпапки — само в паметта за сесията. */
var docsOpenGroups={};
function docsSubKey(mod,sub){return 's:'+mod+'\n'+sub;}
function docsToggleGroup(el){
  var k='m:'+el.getAttribute('data-mod');
  docsOpenGroups[k]=!docsOpenGroups[k];
  renderDocs();
}
function docsToggleSub(el){
  var k=docsSubKey(el.getAttribute('data-mod'),el.getAttribute('data-sub'));
  docsOpenGroups[k]=!docsOpenGroups[k];
  renderDocs();
}

function docsOpen(el){var url=el.getAttribute('data-url');if(url)window.open(url,'_blank');}
function docsDelete(btn){
  if(!confirm('Изтрий документа?'))return;
  var docId=btn.getAttribute('data-id');
  sbDelete('documents','id=eq.'+docId).then(function(res){
    if(!res.ok){
      console.error('docsDelete: документът НЕ беше изтрит',docId,res.error);
      toast('⚠️ Документът НЕ беше изтрит: '+sbErrMsg(res),'#dc2626');
      loadDocs(); return;
    }
    if(res.count===0){ toast('Нямаше какво да се изтрие — списъкът е опреснен','#64748b'); loadDocs(); return; }
    toast('✓ Изтрит');loadDocs();
  });
}

function filterDocs(f,btn){
  docFilter=f;
  document.querySelectorAll('#doc-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderDocs();
}

/* ─── MODAL ─────────────────────────────────────────────── */
function docFileSelected(input){
  var file=input.files[0]; if(!file)return;
  var prev=document.getElementById('doc-file-preview');
  if(prev)prev.innerHTML='📎 <b>'+esc(file.name)+'</b>';
  /* Винаги актуализира заглавието при нов файл */
  var titleEl=document.getElementById('d-title');
  if(titleEl) titleEl.value=file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
}

function resetDocModal(){
  var fi=document.getElementById('d-file');
  if(fi) fi.value='';
  var prev=document.getElementById('doc-file-preview');
  if(prev) prev.innerHTML='Избери файл...';
  var t=document.getElementById('d-title'); if(t) t.value='';
  var u=document.getElementById('d-url'); if(u) u.value='';
  var d=document.getElementById('d-desc'); if(d) d.value='';
  docsApplyOfficeUi();
}

function submitDoc(){
  var title=v('d-title');
  var cat=document.getElementById('d-cat').value;
  var desc=v('d-desc');
  var fileInput=document.getElementById('d-file');
  var url=v('d-url');
  if(!title){toast('Въведи заглавие','#dc2626');return;}
  if(cat===DOCS_OFFICE_CAT&&!docsOfficeVisible()){toast('Нямаш достъп до тази папка','#dc2626');return;}
  if(fileInput&&fileInput.files&&fileInput.files[0]){
    uploadDocFile(fileInput.files[0], title, cat, desc);
  } else if(url){
    saveDocRecord(title,cat,desc,url);
  } else {
    toast('Избери файл или въведи URL','#dc2626');
  }
}

function uploadDocFile(file, title, cat, desc){
  var fname=Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  var path='docs/'+fname;
  toast('⏳ Качване...');
  var reader=new FileReader();
  reader.onload=function(e){
    fetch(DOCS_SB+'/storage/v1/object/'+DOCS_BKT+'/'+path,{
      method:'POST',
      headers:{'Authorization':'Bearer '+DOCS_KEY,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},
      body:e.target.result
    }).then(function(r){
      if(!r.ok){toast('Грешка при качване','#dc2626');return;}
      var pub=DOCS_SB+'/storage/v1/object/public/'+DOCS_BKT+'/'+path;
      saveDocRecord(title,cat,desc,pub);
    }).catch(function(err){toast('Грешка: '+err.message,'#dc2626');});
  };
  reader.readAsArrayBuffer(file);
}

function saveDocRecord(title,cat,desc,url){
  sbPost('documents',{title:title,category:cat,url:url,description:desc}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    resetDocModal();
    closeModal('doc-modal');toast('✓ Документът е добавен');loadDocs();
  });
}
