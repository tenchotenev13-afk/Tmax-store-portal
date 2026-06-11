/* docs.js — Инструкции и документи */

var DOCS_SB  = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var DOCS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';
var DOCS_BKT = 'docs';

function loadDocs(){
  sbGet('documents','order=created_at.desc').then(function(data){
    docs=Array.isArray(data)?data:[];renderDocs();
  }).catch(function(){});
}

function renderDocs(){
  var list=docs.filter(function(d){return docFilter==='all'||d.category===docFilter;});
  var grid=document.getElementById('doc-grid');if(!grid)return;
  if(!list.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:#94a3b8;"><div style="font-size:32px;">📁</div><div>Няма документи.</div></div>';
    return;
  }
  var icons={SAP:'🖥',Процедури:'📋',Обучения:'🎓',Формуляри:'📝',Друго:'📄'};
  var isAdmin=currentUser&&['admin','accounting'].indexOf(currentUser.role)>=0;
  grid.innerHTML=list.map(function(d){
    var delBtn=isAdmin
      ? '<button data-id="'+d.id+'" onclick="event.stopPropagation();docsDelete(this)" style="position:absolute;top:6px;right:6px;border:none;background:#fee2e2;color:#dc2626;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;font-weight:700;">✕</button>'
      : '';
    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:6px;position:relative;" data-url="'+esc(d.url)+'" onclick="docsOpen(this)">' +
      delBtn +
      '<div style="font-size:24px;">'+(icons[d.category]||'📄')+'</div>'+
      '<div style="font-size:13px;font-weight:500;">'+esc(d.title||'')+'</div>'+
      '<div style="font-size:11px;color:#94a3b8;">'+esc(d.category||'')+'</div>'+
      (d.description?'<div style="font-size:11px;color:#64748b;">'+esc(d.description)+'</div>':'')+
      '</div>';
  }).join('');
}

function docsOpen(el){var url=el.getAttribute('data-url');if(url)window.open(url,'_blank');}
function docsDelete(btn){
  if(!confirm('Изтрий документа?'))return;
  sbDelete('documents','id=eq.'+btn.getAttribute('data-id')).then(function(){toast('✓ Изтрит');loadDocs();});
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
}

function submitDoc(){
  var title=v('d-title');
  var cat=document.getElementById('d-cat').value;
  var desc=v('d-desc');
  var fileInput=document.getElementById('d-file');
  var url=v('d-url');
  if(!title){toast('Въведи заглавие','#dc2626');return;}
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
