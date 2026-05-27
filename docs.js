/* docs.js — Инструкции и документи */

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
  grid.innerHTML=list.map(function(d){
    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:6px;" onclick="openDocUrl(this)" data-url="'+esc(d.url)+'">'+
      '<div style="font-size:24px;">'+(icons[d.category]||'📄')+'</div>'+
      '<div style="font-size:13px;font-weight:500;">'+esc(d.title||'')+'</div>'+
      '<div style="font-size:11px;color:#94a3b8;">'+esc(d.category||'')+'</div>'+
      (d.description?'<div style="font-size:11px;color:#64748b;">'+esc(d.description)+'</div>':'')+
    '</div>';
  }).join('');
}

function openDocUrl(el){
  var url=el.getAttribute('data-url');
  if(url)window.open(url,'_blank');
}

function filterDocs(f,btn){
  docFilter=f;
  document.querySelectorAll('#doc-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderDocs();
}

function submitDoc(){
  var title=v('d-title'),url=v('d-url');
  if(!title||!url){toast('Въведи заглавие и линк','#dc2626');return;}
  sbPost('documents',{title:title,category:document.getElementById('d-cat').value,url:url,description:v('d-desc')}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    closeModal('doc-modal');toast('✓ Документът е добавен');loadDocs();
  });
}
