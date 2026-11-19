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
  /* label — текстът на картата (частта след тирето в група); grp — модулът
     (само за карта в група, data-doc-group). Без група картата е като преди. */
  function card(d,label,grp){
    var delBtn=isAdmin
      ? '<button data-id="'+d.id+'" onclick="event.stopPropagation();docsDelete(this)" style="position:absolute;top:6px;right:6px;border:none;background:#fee2e2;color:#dc2626;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;font-weight:700;">✕</button>'
      : '';
    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:6px;position:relative;" data-url="'+esc(d.url)+'"'+(grp!=null?' data-doc-group="'+escAttr(grp)+'"':'')+' onclick="docsOpen(this)">' +
      delBtn +
      '<div style="font-size:24px;">'+(icons[d.category]||'📄')+'</div>'+
      '<div style="font-size:13px;font-weight:500;">'+esc(label||'')+'</div>'+
      '<div style="font-size:11px;color:#94a3b8;">'+esc(d.category||'')+'</div>'+
      (d.description?'<div style="font-size:11px;color:#64748b;">'+esc(d.description)+'</div>':'')+
      '</div>';
  }
  /* Групиране по модул (18.11.2026) — СЛЕД филтъра, тоест офисните документи
     за не-admin вече ги няма и не влизат в броя. */
  var groups={},mods=[],loose=[];
  list.forEach(function(d){
    var s=docsSplitTitle(d.title);
    if(!s){loose.push(d);return;}
    if(!groups.hasOwnProperty('m:'+s.mod)){groups['m:'+s.mod]=[];mods.push(s.mod);}
    groups['m:'+s.mod].push({d:d,part:s.part});
  });
  mods.sort(function(a,b){return a.localeCompare(b,'bg');});
  var html=mods.map(function(m){
    var items=groups['m:'+m].sort(function(a,b){return a.part.localeCompare(b.part,'bg');});
    var open=!!docsOpenGroups['m:'+m];
    return '<div class="doc-group-hd" role="button" data-mod="'+escAttr(m)+'" onclick="docsToggleGroup(this)" style="grid-column:1/-1;cursor:pointer;padding:8px 10px;border-radius:8px;background:#f1f5f9;font-size:13px;font-weight:600;user-select:none;">'+
      (open?'▾':'▸')+' 📂 '+esc(m)+' ('+items.length+')</div>'+
      (open?items.map(function(it){return card(it.d,it.part,m);}).join(''):'');
  }).join('');
  grid.innerHTML=html+loose.map(function(d){return card(d,d.title,null);}).join('');
}

/* „Модул — част": първото „ — ", „ – " или „ - " в заглавието. Без разделител
   (или с празна страна) → null, документът е без група. */
function docsSplitTitle(title){
  var t=String(title||''),m=/ [—–-] /.exec(t);
  if(!m)return null;
  var mod=t.slice(0,m.index).trim(),part=t.slice(m.index+m[0].length).trim();
  return (mod&&part)?{mod:mod,part:part}:null;
}

/* Отворените групи — само в паметта за сесията, по модул. */
var docsOpenGroups={};
function docsToggleGroup(el){
  var k='m:'+el.getAttribute('data-mod');
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
