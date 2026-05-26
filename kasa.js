/* kasa.js — Касов модул
   Редактирай САМО тук когато правиш промени по касата. */

function loadKasa(){
  /* TODO: зарежда касови операции за магазина */
  renderKasa();
}
function renderKasa(){
  var wrap=document.getElementById('mod-kasa');if(!wrap)return;
  wrap.innerHTML='<div class="page"><div class="pg-title">💰 Каса</div>'+
    '<div class="pg-sub">Касови операции за '+esc(currentUser?currentUser.store_name:'')+'</div>'+
    '<div class="card" style="text-align:center;padding:40px;">'+
      '<div style="font-size:48px;margin-bottom:12px;">🚧</div>'+
      '<div style="font-size:16px;font-weight:600;margin-bottom:8px;">Модулът е в разработка</div>'+
      '<div style="font-size:13px;color:#64748b;">Скоро ще бъде наличен. Свържи се с администратора за повече информация.</div>'+
    '</div></div>';
}
