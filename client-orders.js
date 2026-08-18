/* client-orders.js — Клиентски заявки + бланка за клиента */

function calcElapsed(createdAt){
  if(!createdAt) return 0;
  var created=new Date(createdAt); created.setHours(0,0,0,0);
  return Math.floor((TODAY-created)/86400000);
}

function elapsedBadge(days, status, order){
  /* Не показваме за финални статуси */
  if(['done','refused','postponed'].indexOf(status)>=0) return '';
  /* Обработена от ЦО и все още в срока на доставчика — броячът остава спокоен и
     показва какво чакаме. Иначе заявка с доставчик за 3 седмици светва червено
     на 10-ия ден без никой да е закъснял. */
  if(typeof coWaitingSupplier==='function'&&coWaitingSupplier(order)){
    return '<span style="font-size:11px;font-weight:600;color:#047857;background:#ecfdf5;padding:2px 7px;border-radius:20px;" title="Обработена от ЦО — чака доставчика">🏭 до '+fmtDate(order.co_eta)+'</span>';
  }
  if(days<5) return '<span style="font-size:11px;color:#94a3b8;">'+days+' дни</span>';
  if(days<7)  return '<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;padding:2px 7px;border-radius:20px;">⚠️ '+days+' дни</span>';
  if(days<10) return '<span style="font-size:11px;font-weight:600;color:#ea580c;background:#fff7ed;padding:2px 7px;border-radius:20px;">🔶 '+days+' дни</span>';
  return '<span style="font-size:11px;font-weight:600;color:#dc2626;background:#fee2e2;padding:2px 7px;border-radius:20px;animation:rowPulse 1.5s infinite;">🔴 '+days+' дни!</span>';
}

function elapsedRowStyle(days, baseStatus, order){
  if(['done','refused','postponed'].indexOf(baseStatus)>=0) return '';
  if(typeof coWaitingSupplier==='function'&&coWaitingSupplier(order)) return '';
  if(days>=10) return 'background:rgba(220,38,38,.04);animation:rowPulse 1.8s infinite;';
  if(days>=7)  return 'background:rgba(234,88,12,.03);';
  if(days>=5)  return 'background:rgba(217,119,6,.03);';
  return '';
}

var CO_BG_MONTHS = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
function coMonthLabel(ym){
  var p=ym.split('-'); var idx=parseInt(p[1],10)-1;
  return (CO_BG_MONTHS[idx]||ym)+' '+p[0];
}
function coBuildMonthOptions(){
  var sel=document.getElementById('co-month'); if(!sel) return;
  var cur=sel.value;
  var months={};
  clientOrders.forEach(function(o){ if(o.date) months[o.date.slice(0,7)]=1; });
  var sorted=Object.keys(months).sort().reverse();
  sel.innerHTML='<option value="">Всички месеци</option>'+sorted.map(function(ym){
    return '<option value="'+ym+'"'+(ym===cur?' selected':'')+'>'+coMonthLabel(ym)+'</option>';
  }).join('');
  if (sorted.indexOf(cur)>=0) sel.value=cur;
}

/* ═══════════════════════════════════════════════════════════
   ПЛАТЕН ТРАНСПОРТ — клиентска заявка ⇄ транспортна заявка
   Връзката е двупосочна и се пази в БАЗАТА, а не се извежда по име/телефон:
     client_orders.paid_transport (bool) + client_orders.transport_id (uuid)
     transport_orders.client_order_id (uuid) + client_order_num (текст, за търсене)
     transport_orders.awaiting_stock (bool) — докато стоката не е пристигнала
   Така транспортът не може да се "загуби" от свързаната клиентска заявка.
═══════════════════════════════════════════════════════════ */

/* Създава транспортна заявка, вързана за клиентска заявка.
   ВАЖНО: грешките НЕ се поглъщат тихо — ако POST-ът се провали, transport_id
   остава празен и на реда излиза червено предупреждение, за да не се стигне до
   ситуация "клиентът е платил транспорт, а заявка няма". */
function createLinkedTransport(co,addr,hour,deliveryDate,cb){
  if(!co||!co.id){toast('Липсва клиентската заявка','#dc2626');if(cb)cb(false);return;}
  if(!addr){toast('Адресът за доставка е задължителен','#dc2626');if(cb)cb(false);return;}
  var trId=uuid4();
  var items=resolveItems(co);
  var first=items[0]||{};
  var deliv=deliveryDate||co.delivery||null;
  var arrived=['arrived','done'].indexOf(co.status)>=0;
  var noteParts=['Платен транспорт по клиентска заявка №'+(co.in_num||'—')];
  if(co.fulfiller&&co.fulfiller!==co.store_name)noteParts.push('изпълнява: '+co.fulfiller);
  if(co.note)noteParts.push(co.note);
  sbPost('transport_orders',{
    id:trId,
    store_name:co.store_name,
    date:co.date||today(),
    hour:hour||co.hour||'10:00',
    bon:co.bon||null,
    customer_name:co.customer_name,
    phone:co.phone,
    address:addr,
    product:first.product,color:first.color,sap:first.sap,qty:first.qty,unit:first.unit,
    items:items,
    agent:co.agent||(currentUser&&currentUser.display_name)||null,
    notes:noteParts.join(' — '),
    delivery:deliv,
    status:'pending',
    client_order_id:co.id,
    client_order_num:co.in_num||null,
    awaiting_stock:!arrived
  }).then(function(res){
    if(!res.ok){
      console.error('createLinkedTransport: транспортът НЕ е създаден:',res.error);
      toast('⚠️ Транспортът НЕ е създаден! Натисни 🚚 на реда, за да опиташ пак.','#dc2626');
      if(cb)cb(false);
      return;
    }
    sbPatch('client_orders','id=eq.'+co.id,{paid_transport:true,transport_id:trId}).then(function(r2){
      if(!r2.ok){
        console.error('createLinkedTransport: транспортът е създаден, но връзката в клиентската заявка не се записа');
        toast('⚠️ Транспортът е създаден, но връзката не се записа — провери в таб Транспорт','#d97706');
      }
      if(cb)cb(!!r2.ok);
    });
  });
}

/* Синхронизира свързания транспорт при смяна на статуса на клиентската заявка.
   Извиква се от setClientStatus() тук, както и от setStatus()/revertStatus() в shared.js. */
function syncLinkedTransport(id,status){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o||!o.paid_transport||!o.transport_id)return;
  var patch=null;
  if(status==='arrived'||status==='done')      patch={awaiting_stock:false};
  else if(status==='refused')                  patch={status:'refused',awaiting_stock:false};
  else if(status==='pending'||status==='sent') patch={awaiting_stock:true};
  if(!patch)return; /* postponed — транспортът остава както е */
  sbPatch('transport_orders','id=eq.'+o.transport_id,patch).then(function(r){
    if(!r.ok){
      console.error('syncLinkedTransport: неуспешно обновяване на транспорт',o.transport_id);
      toast('⚠️ Свързаният транспорт не се обнови — провери в таб Транспорт','#d97706');
    }
  });
}

/* Отваря таб Транспорт и подсветва свързания ред */
function gotoLinkedTransport(trId){
  window._trHighlightId=trId;
  /* Нулираме филтъра — иначе редът може да е скрит и да изглежда, че бутонът не работи */
  var b=document.querySelector('#tr-filters .filter-btn');
  if(b&&typeof filterTransport==='function')filterTransport('all',b);
  showModule('transport');
}

/* ── Модал "Платен транспорт" за вече съществуваща клиентска заявка ── */
function openPaidTransportModal(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o){toast('Заявката не е намерена','#dc2626');return;}
  if(o.transport_id){gotoLinkedTransport(o.transport_id);return;}
  var hours=['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
  var hourOpts=hours.map(function(h){return '<option'+(h===(o.hour||'10:00')?' selected':'')+'>'+h+'</option>';}).join('');
  var html='<div class="bov" id="pt-ov"><div class="bmod" style="width:460px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'+
      '<div style="font-size:15px;font-weight:600;">🚚 Платен транспорт</div>'+
      '<button onclick="closePaidTransportModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Клиентска заявка №'+esc(o.in_num||'—')+' · '+esc(o.customer_name||'')+' · '+esc(o.phone||'')+'</div>'+
    '<label class="fl">Адрес за доставка *</label>'+
    '<input class="fi" id="pt-addr" placeholder="гр. Варна, ул. Примерна 1, ет. 3, ап. 5" style="margin-bottom:10px;">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'+
      '<div><label class="fl">★ Дата на доставка</label><input type="date" class="fi" id="pt-delivery" value="'+escVal(o.delivery)+'"></div>'+
      '<div><label class="fl">Час</label><select class="fi" id="pt-hour">'+hourOpts+'</select></div>'+
    '</div>'+
    '<div style="font-size:11.5px;color:#854d0e;background:#fef9c3;border-radius:6px;padding:7px 10px;margin-bottom:14px;">'+
      '⏳ Транспортът излиза веднага в таб <b>Транспорт</b> със статус „Чака стока" и <b>не се брои за просрочен</b>, докато не маркираш заявката като „📦 Пристигнала".</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="closePaidTransportModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button id="pt-submit" data-id="'+esc(o.id)+'" onclick="submitPaidTransport(this.dataset.id)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">✓ Създай транспорт</button>'+
    '</div></div></div>';
  var ex=document.getElementById('pt-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('pt-ov').classList.add('open');
}
function closePaidTransportModal(){var el=document.getElementById('pt-ov');if(el)el.remove();}
function submitPaidTransport(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o){toast('Заявката не е намерена','#dc2626');return;}
  var addr=v('pt-addr');
  if(!addr){toast('Адресът за доставка е задължителен','#dc2626');return;}
  var btn=document.getElementById('pt-submit');
  if(btn){btn.disabled=true;btn.textContent='Записване...';}
  createLinkedTransport(o,addr,v('pt-hour'),v('pt-delivery')||null,function(ok){
    if(!ok){if(btn){btn.disabled=false;btn.textContent='✓ Създай транспорт';}return;}
    closePaidTransportModal();
    toast('✓ Транспортната заявка е създадена и свързана');
    loadClientOrders();
  });
}

/* ═══════════════════════════════════════════════════════════
   СВЪРЗАНИ ЗАЯВКИ НА ЕДИН КЛИЕНТ
   Един клиент често иска няколко артикула, които идват от различни обекти —
   магазинът пуска отделна заявка към всеки изпълнител. Ако не са свързани,
   колегата вижда "готово" по едната и вика клиента за половината стока.

   Връзката е ИЗРИЧНА (client_orders.group_id), а не изведена по телефон:
   в базата има телефони с по няколко различни клиента (служебни/семейни),
   а имената на един и същ човек са изписвани различно. Телефонът се ползва
   само за ПРЕДЛОЖЕНИЕ, което човек потвърждава.
═══════════════════════════════════════════════════════════ */

/* Активна ли е заявката (още не е приключила по един или друг начин) */
function coIsOpen(o){ return ['done','refused'].indexOf(o.status)<0; }

/* Всички заявки от групата (включително подадената), подредени по номер */
function coGroupMembers(o){
  if(!o||!o.group_id)return [o].filter(Boolean);
  return clientOrders.filter(function(x){return x.group_id===o.group_id;})
    .sort(function(a,b){return String(a.in_num||'').localeCompare(String(b.in_num||''));});
}
/* Позиция на заявката в групата — "2 от 3" */
function coGroupPos(o){
  var m=coGroupMembers(o);
  for(var i=0;i<m.length;i++) if(String(m[i].id)===String(o.id)) return i+1;
  return 1;
}
/* Други АКТИВНИ заявки със същия телефон, които още не са в тази група.
   Само предложение — не се свързват автоматично. */
function coSameCustomerCandidates(o){
  var ph=normPhone(o&&o.phone);
  if(!ph||ph.length<6)return [];
  return clientOrders.filter(function(x){
    if(String(x.id)===String(o.id))return false;
    if(!coIsOpen(x))return false;
    if(o.group_id&&x.group_id===o.group_id)return false;
    return normPhone(x.phone)===ph;
  });
}

/* Бадж до името на клиента */
function coGroupBadge(o){
  if(o.group_id){
    var m=coGroupMembers(o);
    var openLeft=m.filter(function(x){return coIsOpen(x);}).length;
    var allDone=openLeft===0;
    return '<span data-id="'+o.id+'" onclick="openCustomerOrders(this.dataset.id)" title="Заявката е част от обща поръчка — виж всички" '+
      'style="display:inline-block;margin-left:5px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;cursor:pointer;'+
      (allDone?'background:#dcfce7;color:#15803d;':'background:#e0e7ff;color:#3730a3;')+'">👥 '+coGroupPos(o)+' от '+m.length+'</span>';
  }
  /* Намек за свързване има смисъл само докато заявката е жива — на приключена
     заявка той е чист шум. */
  if(!coIsOpen(o))return '';
  var cand=coSameCustomerCandidates(o);
  if(!cand.length)return '';
  return '<span data-id="'+o.id+'" onclick="openCustomerOrders(this.dataset.id)" title="Същият телефон има още активни заявки — провери дали са една поръчка" '+
    'style="display:inline-block;margin-left:5px;font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;cursor:pointer;background:#f1f5f9;color:#64748b;">👥 още '+cand.length+'?</span>';
}

/* ── Панел "Заявки на клиента" ── */
function coOrderLine(x,isCurrent){
  var items=resolveItems(x).map(function(it){return esc(it.product||'');}).join(', ');
  return '<div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid '+(isCurrent?'#3730a3':'#e2e8f0')+';border-radius:7px;margin-bottom:6px;background:'+(isCurrent?'#eef2ff':'#fff')+';">'+
    '<div style="flex:1;min-width:0;">'+
      '<div style="font-size:12px;font-weight:600;">№'+esc(x.in_num||'—')+' · '+esc(x.store_name||'')+
        (x.fulfiller&&x.fulfiller!==x.store_name?' → <span style="color:#2563eb;">'+esc(x.fulfiller)+'</span>':'')+'</div>'+
      '<div style="font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+items+'</div>'+
    '</div>'+
    '<div style="flex-shrink:0;">'+statusBadge(calcStatus(x.delivery,x.status))+'</div>'+
  '</div>';
}
function openCustomerOrders(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o){toast('Заявката не е намерена','#dc2626');return;}
  var members=o.group_id?coGroupMembers(o):[o];
  var cand=coSameCustomerCandidates(o);
  var openLeft=members.filter(function(x){return coIsOpen(x);}).length;
  var html='<div class="bov" id="cust-ov"><div class="bmod" style="width:520px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">'+
      '<div><div style="font-size:15px;font-weight:600;">👥 Заявки на клиента</div>'+
      '<div style="font-size:12px;color:#64748b;margin-top:2px;">'+esc(o.customer_name||'')+' · '+esc(o.phone||'')+'</div></div>'+
      '<button onclick="closeCustomerOrders()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    (o.group_id
      ? '<div style="font-size:12px;font-weight:600;color:#3730a3;margin:12px 0 7px;">Обща поръчка — '+members.length+' заявки'+
        (openLeft?' · <span style="color:#b45309;">'+openLeft+' още не са готови</span>':' · <span style="color:#15803d;">всички са готови</span>')+'</div>'
      : '<div style="font-size:12px;font-weight:600;color:#334155;margin:12px 0 7px;">Тази заявка</div>')+
    members.map(function(x){return coOrderLine(x,String(x.id)===String(o.id));}).join('')+
    (cand.length
      ? '<div style="font-size:12px;font-weight:600;color:#64748b;margin:12px 0 7px;">Същият телефон, но НЕ са свързани ('+cand.length+')</div>'+
        cand.map(function(x){return coOrderLine(x,false);}).join('')+
        '<div style="font-size:11.5px;color:#64748b;margin-bottom:10px;">Провери имената — един телефон понякога се ползва от различни хора.</div>'+
        '<button data-id="'+o.id+'" onclick="coLinkCandidates(this.dataset.id)" style="border:1px solid #3730a3;background:#eef2ff;color:#3730a3;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">🔗 Свържи ги като една поръчка</button>'
      : '')+
    '<div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:12px;">'+
      '<button data-id="'+o.id+'" onclick="coAddAnotherForCustomer(this.dataset.id)" style="border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">➕ Още една заявка за същия клиент</button>'+
      '<button onclick="closeCustomerOrders()" style="border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Затвори</button>'+
    '</div></div></div>';
  var ex=document.getElementById('cust-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('cust-ov').classList.add('open');
}
function closeCustomerOrders(){var el=document.getElementById('cust-ov');if(el)el.remove();}

/* Свързва заявката с всички активни заявки на същия телефон.
   Приема id ИЛИ самия обект — при предложението веднага след запис новата
   заявка още не е в clientOrders (масивът се презарежда след това). */
function coLinkCandidates(idOrOrder){
  var o=(idOrOrder&&typeof idOrOrder==='object')
    ? idOrOrder
    : clientOrders.find(function(x){return String(x.id)===String(idOrOrder);});
  if(!o){toast('Заявката не е намерена','#dc2626');return;}
  var cand=coSameCustomerCandidates(o);
  if(!cand.length){toast('Няма какво да се свърже','#d97706');return;}
  var parts=[o].concat(cand);
  /* Ако някой от участниците вече е в група, ПОЛЗВАМЕ нея вместо да правим нова —
     иначе вече приключилите членове на старата група остават закачени за
     изоставен group_id и се откъсват от поръчката. При няколко различни групи
     ги сливаме в първата, като влачим и техните останали членове. */
  var gids=[];
  parts.forEach(function(x){ if(x.group_id&&gids.indexOf(x.group_id)<0)gids.push(x.group_id); });
  var gid=gids[0]||uuid4();
  var idMap={};
  parts.forEach(function(x){ idMap[x.id]=1; });
  if(gids.length){
    clientOrders.forEach(function(x){ if(x.group_id&&gids.indexOf(x.group_id)>=0) idMap[x.id]=1; });
  }
  var ids=Object.keys(idMap);
  var q='id=in.('+ids.map(encodeURIComponent).join(',')+')';
  sbPatch('client_orders',q,{group_id:gid}).then(function(res){
    if(!res.ok){
      console.error('coLinkCandidates: свързването се провали',ids);
      toast('Грешка при свързване','#dc2626');
      return;
    }
    closeCustomerOrders();
    toast('✓ '+ids.length+' заявки са свързани като една поръчка');
    loadClientOrders();
  });
}

/* Отваря модала за нова заявка с попълнени данни на клиента и обща група */
function coAddAnotherForCustomer(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o)return;
  closeCustomerOrders();
  closeSapReminder();
  var gid=o.group_id;
  if(!gid){
    /* Първата заявка още няма група — създаваме я сега и я записваме и на нея,
       за да не остане новата заявка сама в група от 1. */
    gid=uuid4();
    sbPatch('client_orders','id=eq.'+o.id,{group_id:gid}).then(function(res){
      if(!res.ok){console.error('coAddAnotherForCustomer: групата не се записа на изходната заявка',o.id);
        toast('⚠️ Групата не се записа — свържи ги ръчно след това','#d97706');}
    });
  }
  openClientModal({customer_name:o.customer_name,phone:o.phone,bon:o.bon,
    delivery:o.delivery,from_store:o.from_store,group_id:gid});
}

/* Предложение веднага след запис на нова заявка */
function coSuggestLink(newOrder,onDone){
  var cand=coSameCustomerCandidates(newOrder);
  if(!cand.length){if(onDone)onDone();return;}
  var rows=cand.map(function(x){return coOrderLine(x,false);}).join('');
  var html='<div class="bov" id="link-ov"><div class="bmod" style="width:520px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">'+
      '<div><div style="font-size:15px;font-weight:600;">👥 Този клиент има още заявки</div>'+
      '<div style="font-size:12px;color:#64748b;margin-top:2px;">'+esc(newOrder.customer_name||'')+' · '+esc(newOrder.phone||'')+'</div></div>'+
      '<button onclick="coSkipLink()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12.5px;color:#334155;margin:12px 0 8px;">Със същия телефон има още '+cand.length+' активн'+(cand.length===1?'а заявка':'и заявки')+':</div>'+
    rows+
    '<div style="font-size:11.5px;color:#64748b;margin:8px 0 14px;">Ако това е една поръчка, свържи ги — така при „Изпълнена" системата ще предупреди, че останалата стока още не е дошла. <b>Провери имената</b>, ако телефонът е служебен.</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="coSkipLink()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Не, отделни са</button>'+
      '<button id="link-yes" onclick="coConfirmLink()" style="border:none;background:#3730a3;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">🔗 Свържи ги</button>'+
    '</div></div></div>';
  var ex=document.getElementById('link-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('link-ov').classList.add('open');
  window._coLinkDone=onDone||null;
  window._coLinkOrder=newOrder;
}
function coSkipLink(){
  var el=document.getElementById('link-ov');if(el)el.remove();
  window._coLinkOrder=null;
  var cb=window._coLinkDone;window._coLinkDone=null;if(cb)cb();
}
function coConfirmLink(){
  var el=document.getElementById('link-ov');if(el)el.remove();
  var o=window._coLinkOrder;window._coLinkOrder=null;
  var cb=window._coLinkDone;window._coLinkDone=null;
  if(o)coLinkCandidates(o);
  if(cb)cb();
}

/* Преди "Изпълнена": ако другите заявки от групата не са готови, спираме и питаме.
   Точно тук се къса процесът — клиентът бива извикан за половината стока. */
function coConfirmGroupDone(id,proceed){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o||!o.group_id){proceed();return;}
  var others=coGroupMembers(o).filter(function(x){
    return String(x.id)!==String(o.id)&&coIsOpen(x);
  });
  if(!others.length){proceed();return;}
  var rows=others.map(function(x){return coOrderLine(x,false);}).join('');
  var html='<div class="bov" id="gdone-ov"><div class="bmod" style="width:520px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">'+
      '<div style="font-size:15px;font-weight:600;color:#b45309;">⚠️ Останалата стока още не е готова</div>'+
      '<button onclick="coCloseGroupDone()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12.5px;color:#334155;margin:10px 0 8px;">'+esc(o.customer_name||'')+' има още '+others.length+' незавършен'+(others.length===1?'а заявка':'и заявки')+' от същата поръчка:</div>'+
    rows+
    '<div style="font-size:11.5px;color:#64748b;margin:8px 0 14px;">Ако извикаш клиента сега, ще получи само част от поръчката.</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="coCloseGroupDone()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Отказ, ще изчакам</button>'+
      '<button id="gdone-yes" data-id="'+o.id+'" onclick="coProceedGroupDone(this.dataset.id)" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">Въпреки това — Изпълнена</button>'+
    '</div></div></div>';
  var ex=document.getElementById('gdone-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('gdone-ov').classList.add('open');
  window._coGroupDoneProceed=proceed;
}
function coCloseGroupDone(){
  var el=document.getElementById('gdone-ov');if(el)el.remove();
  window._coGroupDoneProceed=null;
}
function coProceedGroupDone(){
  var el=document.getElementById('gdone-ov');if(el)el.remove();
  var fn=window._coGroupDoneProceed;window._coGroupDoneProceed=null;
  if(fn)fn();
}

/* ═══ ОБРАБОТКА ОТ ЦЕНТРАЛЕН ОФИС ═══
   ЦО получава заявките, свързва се с доставчика и отбелязва, че е поръчал.
   Отделен статус, защото "Изпратена" значи друго — стоката вече пътува
   към магазина. Тук стоката още не съществува, само е поръчана. */
function openCoProcessedModal(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o){toast('Заявката не е намерена','#dc2626');return;}
  if(!isCentralOfficeUser()){toast('Само Централен офис може да маркира този статус','#dc2626');return;}
  if(!isCentralOffice(o.fulfiller)){toast('Тази заявка не е насочена към Централен офис','#dc2626');return;}
  var isEdit=o.status==='processed';
  var items=resolveItems(o).map(function(it){
    return (it.sap?esc(it.sap)+' — ':'')+esc(it.product||'')+' × '+esc(String(it.qty||1))+' '+esc(it.unit||'бр.');
  }).join('<br>');
  var html='<div class="bov" id="cop-ov"><div class="bmod" style="width:480px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">'+
      '<div style="font-size:15px;font-weight:600;color:#047857;">'+(isEdit?'✏️ Данни от ЦО':'✅ Обработена от ЦО')+'</div>'+
      '<button onclick="closeCoProcessedModal()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">Заявка №'+esc(o.in_num||'—')+' · '+esc(o.store_name||'')+' · '+esc(o.customer_name||'')+'</div>'+
    '<div style="font-size:11.5px;color:#475569;background:#f8fafc;border-radius:6px;padding:7px 10px;margin-bottom:12px;">'+items+'</div>'+
    '<label class="fl">Ориентировъчна дата за получаване в обекта</label>'+
    '<input type="date" class="fi" id="cop-eta" value="'+escVal(o.co_eta)+'" style="margin-bottom:10px;">'+
    '<label class="fl">Коментар от ЦО (доставчик, № на поръчка...)</label>'+
    '<input class="fi" id="cop-note" value="'+escVal(o.co_note)+'" placeholder="напр. ТЕСИ, поръчка 4500123" style="margin-bottom:12px;">'+
    '<div style="font-size:11.5px;color:#047857;background:#ecfdf5;border-radius:6px;padding:7px 10px;margin-bottom:14px;">'+
      'Докато очакваната дата не мине, заявката <b>няма да се брои за закъсняла</b> — броячът „Изминало" изчаква доставчика. След тази дата пак започва да алармира.</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;">'+
      '<button onclick="closeCoProcessedModal()" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 16px;font-size:13px;cursor:pointer;">Откажи</button>'+
      '<button id="cop-submit" data-id="'+esc(o.id)+'" onclick="submitCoProcessed(this.dataset.id)" style="border:none;background:#047857;color:#fff;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;">'+(isEdit?'✓ Запази':'✅ Отбележи като обработена')+'</button>'+
    '</div></div></div>';
  var ex=document.getElementById('cop-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('cop-ov').classList.add('open');
}
function closeCoProcessedModal(){var el=document.getElementById('cop-ov');if(el)el.remove();}
/* Извиква се от бутона в модала "Статус" — там id-то стои в statusTargetId. */
function openCoProcessedFromStatusModal(){
  var id=statusTargetId;
  closeModal('status-modal');
  if(id)openCoProcessedModal(id);
}
function submitCoProcessed(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o){toast('Заявката не е намерена','#dc2626');return;}
  var eta=v('cop-eta')||null;
  var btn=document.getElementById('cop-submit');
  if(btn){btn.disabled=true;btn.textContent='Записване...';}
  var patch={
    status:'processed',
    co_eta:eta,
    co_note:v('cop-note')||null,
    co_processed_at:new Date().toISOString(),
    co_processed_by:(currentUser&&currentUser.display_name)||null
  };
  sbPatch('client_orders','id=eq.'+id,patch).then(function(res){
    if(!res.ok){
      console.error('submitCoProcessed: неуспешен запис',id);
      toast('Грешка при запис','#dc2626');
      if(btn){btn.disabled=false;btn.textContent='✅ Отбележи като обработена';}
      return;
    }
    closeCoProcessedModal();
    toast(eta?'✓ Обработена от ЦО — очаквана '+fmtDate(eta):'✓ Обработена от ЦО');
    loadClientOrders();
  });
}

/* ── Отметка в модала за НОВА клиентска заявка ── */
function toggleClientPT(){
  var cb=document.getElementById('c-paid-transport');
  var wrap=document.getElementById('c-pt-wrap');
  if(wrap)wrap.style.display=(cb&&cb.checked)?'':'none';
}

/* ═══ SAP НАПОМНЯНЕ ═══
   Текстът НЕ се дублира — чете се от Наръчника (handbook.js: HB_SAP/HB_PROC),
   за да има едно място за поддръжка. */
function sapClientEntries(){
  var out=[];
  try{
    var pool=(typeof HB_SAP!=='undefined'?HB_SAP:[]).concat(typeof HB_PROC!=='undefined'?HB_PROC:[]);
    ['kl-poruchki','proc-kl-poruchki'].forEach(function(id){
      var it=pool.filter(function(x){return x.id===id;})[0];
      if(it)out.push(it);
    });
  }catch(e){console.warn('sapClientEntries:',e);}
  return out;
}
function sapEntryHtml(it){
  var steps=(it.steps||[]).map(function(s,i){
    return '<div style="display:flex;gap:8px;padding:4px 0;">'+
      '<div style="flex:0 0 18px;height:18px;border-radius:50%;background:#1e293b;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">'+(i+1)+'</div>'+
      '<div style="font-size:12px;line-height:1.45;"><b>'+esc(s.t||'')+'</b><br><span style="color:#475569;">'+(s.d||'')+'</span></div></div>';
  }).join('');
  return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;">'+
    '<div style="font-size:12.5px;font-weight:700;margin-bottom:2px;">'+esc(it.code||'')+' — '+esc(it.name||'')+'</div>'+
    (it.desc?'<div style="font-size:11.5px;color:#64748b;margin-bottom:6px;">'+esc(it.desc)+'</div>':'')+
    steps+
    (it.warn?'<div style="margin-top:7px;font-size:11.5px;color:#991b1b;background:#fee2e2;border-radius:6px;padding:6px 9px;">⚠ '+esc(it.warn)+'</div>':'')+
  '</div>';
}
function showSapReminder(inNum){
  var entries=sapClientEntries();
  var body=entries.length
    ? entries.map(sapEntryHtml).join('')
    : '<div style="font-size:12.5px;color:#475569;">Виж <b>Наръчник → Клиентски</b>: MIGO 951 (заприхождаване) → ZSTOCK / ZSTR тип 1 → MIGO 952 при доставка → проверка в MB51.</div>';
  var html='<div class="bov" id="sap-ov"><div class="bmod" style="width:560px;max-width:95vw;">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'+
      '<div><div style="font-size:15.5px;font-weight:700;color:#92400e;">⚠️ Не забравяй заявката и в SAP!</div>'+
      '<div style="font-size:12px;color:#64748b;margin-top:2px;">След всяка клиентска заявка се пуска и заявка през SAP.'+(inNum?' (Заявка №'+esc(inNum)+')':'')+'</div></div>'+
      '<button onclick="closeSapReminder()" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">✕</button></div>'+
    body+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">'+
      '<button onclick="closeSapReminder();openHandbookClientOrders();" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">📖 Отвори в Наръчника</button>'+
      '<button onclick="closeSapReminder()" style="border:none;background:#16a34a;color:#fff;border-radius:8px;padding:7px 18px;font-size:13px;font-weight:600;cursor:pointer;">Разбрах</button>'+
    '</div></div></div>';
  var ex=document.getElementById('sap-ov');if(ex)ex.remove();
  document.body.insertAdjacentHTML('beforeend',html);
  document.getElementById('sap-ov').classList.add('open');
}
function closeSapReminder(){var el=document.getElementById('sap-ov');if(el)el.remove();}
function openHandbookClientOrders(){
  if(typeof hbState!=='undefined'){
    hbState.search='';hbState.type='all';hbState.cat='Клиентски';
    hbState.openCards={'kl-poruchki':true,'proc-kl-poruchki':true};
  }
  showModule('handbook');
}

/* Постоянен банер в таба (сгъваем; по подразбиране отворен) */
var coSapBannerOpen=true;
function toggleCoSapBanner(){coSapBannerOpen=!coSapBannerOpen;renderCoSapBanner();}
function renderCoSapBanner(){
  var el=document.getElementById('co-sap-banner');if(!el)return;
  var entries=sapClientEntries();
  el.innerHTML='<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:10px 13px;margin-bottom:12px;">'+
    '<div onclick="toggleCoSapBanner()" style="display:flex;align-items:center;gap:8px;cursor:pointer;">'+
      '<span style="font-size:15px;">⚠️</span>'+
      '<div style="flex:1;font-size:13px;font-weight:600;color:#92400e;">След всяка клиентска заявка се пуска заявка и през SAP (MIGO 951/952 · ZSTOCK / ZSTR тип 1 · MB51)</div>'+
      '<span style="font-size:12px;color:#a16207;">'+(coSapBannerOpen?'▲ скрий':'▼ покажи')+'</span>'+
    '</div>'+
    (coSapBannerOpen?'<div style="margin-top:10px;">'+
      (entries.length?entries.map(sapEntryHtml).join(''):'<div style="font-size:12.5px;color:#475569;">Виж Наръчник → Клиентски.</div>')+
      '<button onclick="openHandbookClientOrders()" style="border:1px solid #e2e8f0;background:#fff;border-radius:7px;padding:5px 12px;font-size:12px;cursor:pointer;">📖 Отвори в Наръчника</button>'+
    '</div>':'')+
  '</div>';
}

/* Падащо меню "Изпълнява" — за да може ЦО (и складовете) да види само своите заявки.

   В базата един и същ обект е изписан по няколко начина ("Троян" / "ТРОЯН",
   "Централен офис" / "ЦЕНТРАЛЕН ОФИС"). Ако ги сложим като отделни опции, филтърът
   ще крие част от заявките, без потребителят да разбере — затова групираме по
   нормализирано име, а показваме най-четливото изписване. */
function coNormName(n){ return String(n||'').trim().toLowerCase(); }
function coBuildFulfillerOptions(){
  var sel=document.getElementById('co-fulfiller-filter'); if(!sel) return;
  var cur=sel.value;
  var groups={};
  clientOrders.forEach(function(o){
    if(!o.fulfiller) return;
    var k=coNormName(o.fulfiller); if(!k) return;
    var label=String(o.fulfiller).trim();
    if(!groups[k]){ groups[k]={label:label,n:0}; }
    groups[k].n++;
    /* Предпочитаме варианта, който НЕ е изцяло с главни букви */
    var curAllCaps=groups[k].label===groups[k].label.toUpperCase();
    var newAllCaps=label===label.toUpperCase();
    if(curAllCaps&&!newAllCaps) groups[k].label=label;
  });
  var keys=Object.keys(groups).sort(function(a,b){
    if(isCentralOffice(a)&&!isCentralOffice(b))return -1;
    if(isCentralOffice(b)&&!isCentralOffice(a))return 1;
    return groups[a].label.localeCompare(groups[b].label,'bg');
  });
  sel.innerHTML='<option value="">Изпълнява: всички</option>'+keys.map(function(k){
    return '<option value="'+esc(k)+'"'+(k===cur?' selected':'')+'>'+esc(groups[k].label)+' ('+groups[k].n+')</option>';
  }).join('');
  if(keys.indexOf(cur)>=0)sel.value=cur;
}

function loadClientOrders(){
  loadOrderRestrictions();
  renderCoSapBanner();
  var q='order=created_at.desc';
  var stores=assignedStores();
  if(!stores){
    /* admin без ограничение - вижда всичко */
  } else if(stores.length===1){
    var s=encodeURIComponent(stores[0]);
    q+='&or=(store_name.eq.'+s+',fulfiller.eq.'+s+')';
  } else {
    var orParts=stores.map(function(st){var s=encodeURIComponent(st);return 'store_name.eq.'+s+',fulfiller.eq.'+s;}).join(',');
    q+='&or=('+orParts+')';
  }
  sbGet('client_orders',q).then(function(data){
    clientOrders=Array.isArray(data)?data:[];
    clientOrders.forEach(function(o){
      o._status=calcStatus(o.delivery,o.status);
      o._days=calcElapsed(o.created_at);
      /* Маркираме дали текущия магазин е изпълнителят */
      o._isFulfiller=!isGlobal()&&o.fulfiller===currentUser.store_name&&o.store_name!==currentUser.store_name;
    });
    coBuildMonthOptions();
    coBuildFulfillerOptions();
    renderClientOrders();renderMetrics();updateBadges();
  }).catch(function(e){console.warn('client_orders:',e);});
}

function renderClientOrders(){
  var search=((document.getElementById('co-search')||{}).value||'').trim().toLowerCase();
  var month=(document.getElementById('co-month')||{}).value||'';
  var list=clientOrders.filter(function(o){
    return orderFilter==='all'||o._status===orderFilter||o.status===orderFilter;
  });
  if (month) list=list.filter(function(o){ return o.date && o.date.slice(0,7)===month; });
  var fulf=(document.getElementById('co-fulfiller-filter')||{}).value||'';
  /* Сравнява се нормализирано, за да не изпадат старите записи с главни букви */
  if (fulf) list=list.filter(function(o){ return coNormName(o.fulfiller)===fulf; });
  if (search) {
    list=list.filter(function(o){
      if((o.customer_name||'').toLowerCase().indexOf(search)>=0)return true;
      if((o.phone||'').indexOf(search)>=0)return true;
      if((o.bon||'').toLowerCase().indexOf(search)>=0)return true;
      /* Проверяваме ВСИЧКИ артикули на заявката (не само първия) — resolveItems()
         връща o.items ако има, иначе fallback към старите единични полета */
      var items=resolveItems(o);
      for(var i=0;i<items.length;i++){
        if((items[i].sap||'').toLowerCase().indexOf(search)>=0)return true;
        if((items[i].product||'').toLowerCase().indexOf(search)>=0)return true;
      }
      return false;
    });
  }
  var body=document.getElementById('co-body');if(!body)return;
  if(!list.length){body.innerHTML='<tr><td colspan="14" style="text-align:center;padding:30px;color:#94a3b8;">Няма клиентски заявки.</td></tr>';return;}
  var isAdmin=currentUser&&['admin','accounting'].indexOf(currentUser.role)>=0;
  body.innerHTML=list.map(function(o){
    var urgent=o._status==='overdue'||o._status==='today';
    var bdrColor={overdue:'#dc2626',today:'#2563eb',tomorrow:'#d97706'}[o._status]||'transparent';
    var rowStyle='border-left:3px solid '+bdrColor+';'+(urgent?'animation:rowPulse 2s infinite;':'');
    var storeCell=o.fulfiller&&o.fulfiller!==o.store_name
      ?'<div style="font-size:10px;color:#94a3b8;">Заявител:</div><b>'+esc(o.store_name||'')+'</b><div style="font-size:10px;color:#2563eb;margin-top:2px;">Изпълнява: <b>'+esc(o.fulfiller)+'</b></div>'
      :esc(o.store_name||'');
    var myStore=currentUser&&currentUser.store_name;
    var rawStatus=o.status||'pending';
    var done=o._status==='done'||o._status==='refused'||o.status==='done'||o.status==='refused';
    var isRequester=isAdmin||!o.fulfiller||o.store_name===myStore||isGlobal();
    var isFulfiller=o.fulfiller&&o.fulfiller===myStore&&!isRequester;
    /* Централен офис обработва заявките към доставчици. Бутонът се показва на
       всеки от ЦО (supply, accounting, admin...) и само за заявки, насочени към ЦО —
       независимо дали този човек иначе се води "заявител" или "изпълнител". */
    var isCoJob=isCentralOffice(o.fulfiller)&&isCentralOfficeUser();
    var btns='<div style="display:flex;gap:4px;flex-wrap:wrap;">';
    if(!done){
      if(isCoJob&&['pending','postponed'].indexOf(rawStatus)>=0){
        btns+='<button data-id="'+o.id+'" onclick="openCoProcessedModal(this.dataset.id)" title="ЦО е обработил заявката и я е пуснал към доставчик" style="border:1px solid #047857;background:#ecfdf5;color:#047857;border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;">✅ Обработена от ЦО</button>';
      } else if(isCoJob&&rawStatus==='processed'){
        btns+='<button data-id="'+o.id+'" onclick="openCoProcessedModal(this.dataset.id)" title="Промени очакваната дата или коментара" style="border:1px solid #94a3b8;background:#f8fafc;color:#475569;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️ Дата от ЦО</button>';
      }
      /* Изпълнителят маркира "Изпратена", когато физически изпрати стоката
         към заявителя. След това вече чака заявителя — няма повече действия. */
      if(isFulfiller||isCoJob){
        if(['pending','postponed','processed'].indexOf(rawStatus)>=0){
          btns+='<button data-id="'+o.id+'" onclick="setClientStatus(this.dataset.id,&apos;sent&apos;)" style="border:1px solid #5b21b6;background:#ede9fe;color:#5b21b6;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">📤 Изпратена</button>';
          btns+='<button data-id="'+o.id+'" onclick="setClientStatus(this.dataset.id,&apos;refused&apos;)" style="border:1px solid #dc2626;background:#fff1f2;color:#dc2626;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕ Откаже</button>';
        } else if(isFulfiller){
          btns+='<span style="font-size:10px;color:#94a3b8;white-space:nowrap;">⏳ чака '+esc(o.store_name||'заявителя')+'</span>';
        }
      }
      /* Заявителят маркира "Пристигнала в магазина" при физическо пристигане,
         после отделно "Изпълнена" след предаване на клиента. "Статус" остава
         достъпен за ръчна корекция/отлагане на всеки етап. */
      if(isRequester){
        if(rawStatus==='sent'){
          btns+='<button data-id="'+o.id+'" onclick="setClientStatus(this.dataset.id,&apos;arrived&apos;)" style="border:1px solid #0369a1;background:#e0f2fe;color:#0369a1;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">📦 Пристигнала</button>';
        } else if(rawStatus==='arrived'){
          btns+='<button data-id="'+o.id+'" onclick="setClientStatus(this.dataset.id,&apos;done&apos;)" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✅ Изпълнена</button>';
        }
        btns+='<button data-id="'+o.id+'" onclick="openStatus(this.dataset.id,&apos;client_orders&apos;)" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">Статус</button>';
      }
    } else {
      if(isRequester){
        btns+='<button data-id="'+o.id+'" onclick="revertStatus(this.dataset.id,&apos;client_orders&apos;)" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">↩ Върни</button>';
      }
    }
    if(done&&canCorrectRecord(o,'client_orders')){
      btns+='<button data-id="'+o.id+'" onclick="openCorrection(this.dataset.id,&apos;client_orders&apos;)" style="border:1px solid #d97706;background:#fffbeb;color:#d97706;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✏️ Корекция</button>';
    }
    /* ПЛАТЕН ТРАНСПОРТ — бутонът стои винаги (не се крие според данните):
       без транспорт → създай; с транспорт → отвори свързания ред в таб Транспорт;
       отметнат, но без transport_id → червено предупреждение (POST-ът се е провалил). */
    var ptBroken=o.paid_transport&&!o.transport_id;
    if(o.transport_id){
      btns+='<button data-id="'+esc(o.transport_id)+'" onclick="gotoLinkedTransport(this.dataset.id)" title="Отвори свързаната транспортна заявка" style="border:1px solid #16a34a;background:#f0fdf4;color:#15803d;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🚚 Транспорт →</button>';
    } else if(ptBroken){
      btns+='<button data-id="'+o.id+'" onclick="openPaidTransportModal(this.dataset.id)" title="Отметнат е платен транспорт, но заявка НЯМА" style="border:1px solid #dc2626;background:#fee2e2;color:#991b1b;border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;">⚠️ Липсва транспорт</button>';
    } else if(!done){
      btns+='<button data-id="'+o.id+'" onclick="openPaidTransportModal(this.dataset.id)" title="Създай транспортна заявка към тази клиентска заявка" style="border:1px solid #94a3b8;background:#f8fafc;color:#475569;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🚚 Платен транспорт</button>';
    }
    btns+='<button data-id="'+o.id+'" onclick="loadPrint(this.dataset.id)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🖨 Бланка</button>';
    if(isAdmin){
      btns+='<button data-id="'+o.id+'" onclick="deleteClientOrder(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button>';
    }
    btns+='</div>';
    if(window._coHighlightId&&String(window._coHighlightId)===String(o.id))rowStyle+='background:#fef9c3;';
    return '<tr id="co-row-'+esc(o.id)+'" style="'+rowStyle+'">'+
      '<td style="font-size:11px;color:#94a3b8;font-family:monospace;">'+esc(o.in_num||'—')+'</td>'+
      '<td>'+esc(o.date||'')+'<br><small style="color:#94a3b8;">'+esc(o.hour||'')+'</small></td>'+
      /* Името на клиента отваря панела с всички негови заявки — там е и бутонът
         за още една заявка. Така не се налага още един бутон в реда. */
      '<td><b data-id="'+o.id+'" onclick="openCustomerOrders(this.dataset.id)" title="Виж всички заявки на този клиент" style="cursor:pointer;border-bottom:1px dotted #94a3b8;">'+esc(o.customer_name||'')+'</b>'+coGroupBadge(o)+
        '<br><small style="color:#94a3b8;">Бон: '+esc(o.bon||'—')+'</small></td>'+
      '<td style="font-family:monospace;">'+esc(o.phone||'')+'</td>'+
      '<td style="font-family:monospace;font-size:11px;"><div style="max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(o.sap||'')+'">'+esc(o.sap||'—')+'</div></td>'+
      '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+esc(o.color||'')+'</small></td>'+
      '<td style="text-align:center;">'+esc(String(o.qty||1))+(o.unit&&o.unit!=='бр.'?'<br><small style="color:#94a3b8;">'+esc(o.unit)+'</small>':'')+'</td>'+
      '<td>'+esc(o.from_store||'')+'</td>'+
      '<td><b>'+fmtDate(o.delivery)+'</b>'+coEtaCell(o)+'</td>'+
      '<td>'+elapsedBadge(o._days,o.status,o)+'</td>'+
      '<td>'+statusBadge(o._status)+ptBadge(o)+'</td>'+
      '<td style="font-size:11px;">'+storeCell+'</td>'+
      '<td>'+btns+'</td></tr>';
  }).join('');
  /* Подсветка + скрол към реда, отворен от бадж 📋 в таб Транспорт */
  if(window._coHighlightId){
    var row=document.getElementById('co-row-'+window._coHighlightId);
    if(row&&row.scrollIntoView)row.scrollIntoView({block:'center'});
    window._coHighlightId=null;
  }
}

/* Ориентировъчната дата от ЦО стои под датата за доставка — там я търси магазинът.
   Ако датата е минала, а заявката още е "Обработена", се оцветява червено:
   доставчикът е закъснял и някой трябва да се обади. */
function coEtaCell(o){
  if(!o.co_eta)return '';
  var late=o.status==='processed'&&!coWaitingSupplier(o);
  var col=late?'#dc2626':'#047857';
  return '<div style="font-size:10px;color:'+col+';margin-top:2px;white-space:nowrap;" title="'+
    (o.co_note?esc(o.co_note):'Ориентировъчна дата за получаване в обекта')+'">'+
    (late?'🏭 просрочена от ':'🏭 очаквана ')+fmtDate(o.co_eta)+'</div>'+
    (o.co_note?'<div style="font-size:10px;color:#94a3b8;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(o.co_note)+'</div>':'');
}

/* Малък бадж под статуса — веднага се вижда, че заявката е с платен транспорт */
function ptBadge(o){
  if(!o.paid_transport)return '';
  if(!o.transport_id)return '<div style="margin-top:3px;"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#fee2e2;color:#991b1b;">⚠️ Транспорт липсва</span></div>';
  return '<div style="margin-top:3px;"><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;background:#dcfce7;color:#15803d;">🚚 Платен транспорт</span></div>';
}

function filterOrders(f,btn){
  orderFilter=f;
  document.querySelectorAll('#co-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderClientOrders();
}

function setClientStatus(id,status){
  var apply=function(){
    sbPatch('client_orders','id=eq.'+id,{status:status}).then(function(res){
      if(!res.ok){toast('Грешка','#dc2626');return;}
      syncLinkedTransport(id,status);
      toast('✓ Статусът е обновен');loadClientOrders();
    });
  };
  /* "Изпълнена" при свързана поръчка минава през проверка на останалите заявки */
  if(status==='done'){coConfirmGroupDone(id,apply);return;}
  apply();
}

function deleteClientOrder(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  var trId=o&&o.transport_id;
  if(!confirm(trId?'Изтрий тази заявка ЗАЕДНО със свързаната транспортна заявка?':'Изтрий тази заявка?'))return;
  var step=trId
    ? sbDelete('transport_orders','id=eq.'+trId).then(function(r){
        if(!r.ok)console.error('deleteClientOrder: свързаният транспорт не беше изтрит',trId);
        return r;
      })
    : Promise.resolve({ok:true});
  step.then(function(){
    return sbDelete('client_orders','id=eq.'+id);
  }).then(function(){
    toast('✓ Заявката е изтрита');loadClientOrders();
    if(trId&&typeof loadTransport==='function')loadTransport();
  });
}

/* Група, към която ще се запише следващата нова заявка (задава се от
   "➕ Още една заявка за същия клиент"). Изчиства се при всяко отваряне. */
var coPendingGroupId=null;

function openClientModal(prefill){
  prefill=prefill||{};
  coPendingGroupId=prefill.group_id||null;
  ['c-bon','c-name','c-phone','c-agent','c-note','c-pt-addr'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  /* Платен транспорт — винаги стартира изчистен */
  var ptCb=document.getElementById('c-paid-transport');if(ptCb)ptCb.checked=false;
  var ptHour=document.getElementById('c-pt-hour');if(ptHour)ptHour.value='10:00';
  toggleClientPT();
  document.getElementById('c-date').value=today();
  document.getElementById('c-hour').value='10:00';
  document.getElementById('c-delivery').value='';
  /* Обикновените служители (точно 1 назначен магазин) не бива да могат да
     заявяват "от чуждо име" - заключваме "Поръчан от магазин" на техния
     собствен магазин. Само admin/multi-store потребители виждат истински
     dropdown с всички магазини. (Огледален модел на o-store в transport.js) */
  var myStores=assignedStores();
  var fromEl=document.getElementById('c-from-store');
  if(fromEl){
    if(myStores && myStores.length===1){
      fromEl.outerHTML='<div class="fi" style="background:#f8fafc;font-weight:500;border:1px solid #e2e8f0;">🏪 '+esc(myStores[0])+'</div><input type="hidden" id="c-from-store" value="'+esc(myStores[0])+'">';
    } else if(fromEl.tagName!=='SELECT'){
      fromEl.outerHTML='<select class="fi" id="c-from-store"></select>';
    }
  }
  loadAllStores().then(function(){
    var el=document.getElementById('c-from-store');
    if(el && el.tagName==='SELECT') fillStoreSelect(el,currentUser.store_name);
    fillStoreSelect(document.getElementById('c-fulfiller'),currentUser.store_name);
  });
  renderItemRows('c-items',[{}]);
  /* Данни на клиента, пренесени от предишната заявка — само те, артикулите
     са различни (затова е отделна заявка). */
  if(prefill.customer_name){var n1=document.getElementById('c-name');if(n1)n1.value=prefill.customer_name;}
  if(prefill.phone){var p1=document.getElementById('c-phone');if(p1)p1.value=prefill.phone;}
  if(prefill.bon){var b1=document.getElementById('c-bon');if(b1)b1.value=prefill.bon;}
  if(prefill.delivery){var d1=document.getElementById('c-delivery');if(d1)d1.value=prefill.delivery;}
  /* Видимо е, че заявката ще влезе в обща поръчка — иначе изглежда като обикновена нова */
  var gh=document.getElementById('c-group-hint');
  if(gh){
    gh.style.display=coPendingGroupId?'':'none';
    gh.innerHTML=coPendingGroupId
      ? '👥 Тази заявка ще се свърже с останалите заявки на <b>'+esc(prefill.customer_name||'клиента')+'</b> като една обща поръчка.'
      : '';
  }
  document.getElementById('client-modal').classList.add('open');
}

function submitClientOrder(){
  var name=v('c-name'),phone=v('c-phone');
  var items=collectItems('c-items');
  if(!name||!phone){toast('Попълни задължителните полета *','#dc2626');return;}
  var fulfillerVal=v('c-fulfiller');
  var restriction=checkFulfillerRestriction(fulfillerVal);
  if(restriction){
    toast('🚫 '+fulfillerVal+' не приема нови заявки от '+fmtDate(restriction.start_date)+' до '+fmtDate(restriction.end_date)+(restriction.note?' — '+restriction.note:''),'#dc2626');
    return;
  }
  if(!items.length){toast('Добави поне един артикул с продукт','#dc2626');return;}
  var paidTransport=!!(document.getElementById('c-paid-transport')||{}).checked;
  var ptAddr=v('c-pt-addr');
  if(paidTransport&&!ptAddr){toast('При платен транспорт адресът за доставка е задължителен','#dc2626');return;}
  var first=items[0];
  var delivery=v('c-delivery')||null;
  var num=String(clientOrders.length+1).padStart(4,'0');
  var coId=uuid4();
  var rec={
    id:coId,
    in_num:num,store_name:currentUser.store_name,
    date:v('c-date'),hour:v('c-hour'),bon:v('c-bon'),
    customer_name:name,phone:phone,
    product:first.product,color:first.color,sap:first.sap,qty:first.qty,unit:first.unit,
    items:items,
    from_store:v('c-from-store'),fulfiller:v('c-fulfiller'),
    agent:v('c-agent')||currentUser.display_name,
    delivery:delivery,status:'pending',note:v('c-note'),
    paid_transport:paidTransport,
    group_id:coPendingGroupId||null
  };
  var wasGrouped=!!coPendingGroupId;
  sbPost('client_orders',rec).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    coPendingGroupId=null;
    var finish=function(){
      closeModal('client-modal');
      loadClientOrders();
      if(typeof loadTransport==='function'&&paidTransport)loadTransport();
      /* Ако заявката вече е част от обща поръчка, няма какво да предлагаме.
         Иначе първо питаме за свързване, и чак после SAP напомнянето — за да
         не се отворят два прозореца един върху друг. */
      if(wasGrouped){showSapReminder(num);return;}
      var probe=rec;
      /* clientOrders още не е презаредена, затова търсим по вече заредените */
      coSuggestLink(probe,function(){showSapReminder(num);});
    };
    if(!paidTransport){toast('✓ Заявката е записана!');finish();return;}
    createLinkedTransport(rec,ptAddr,v('c-pt-hour'),delivery,function(ok){
      if(ok)toast('✓ Заявката е записана + транспортна заявка е създадена!');
      finish();
    });
  });
}

/* БЛАНКА ЗА КЛИЕНТА */
function loadPrint(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o)return;renderPrint(o);showModule('print');
}

function renderPrint(o){
  var wrap=document.getElementById('mod-print');
  var st=calcStatus(o.delivery,o.status);
  var stInfo={
    overdue:{l:'🔴 ПРОСРОЧЕНА',bg:'#fee2e2',c:'#991b1b'},
    today:{l:'🔵 ДОСТАВКА ДНЕС',bg:'#dbeafe',c:'#1e3a5f'},
    tomorrow:{l:'🟡 ДОСТАВКА УТРЕ',bg:'#fef3c7',c:'#92400e'},
    pending:{l:'⏳ ИЗЧАКВА',bg:'#f3f4f6',c:'#374151'},
    approved:{l:'✓ ОДОБРЕНА',bg:'#dbeafe',c:'#1e3a5f'},
    arrived:{l:'📦 ПРИСТИГНАЛА В МАГАЗИНА',bg:'#e0f2fe',c:'#0369a1'},
    done:{l:'✅ ИЗПЪЛНЕНА',bg:'#dcfce7',c:'#14532d'},
    refused:{l:'✕ ОТКАЗАНА',bg:'#fee2e2',c:'#991b1b'},
    postponed:{l:'⏱ ОТЛОЖЕНА',bg:'#f3e8ff',c:'#4c1d95'}
  };
  var si=stInfo[st]||stInfo.pending;

  /* Печатен CSS — 1 лист А4, 2 компактни копия едно под друго (по модел на transport.js) */
  var PRINT_CSS=
    '@media print{'+
      '@page{size:A4 portrait;margin:8mm;}'+
      '.no-print{display:none!important;}'+
      'body{margin:0;padding:0;}'+
      '.cp-wrap{max-width:none!important;padding:0!important;}'+
      '.cp-card{page-break-inside:avoid;}'+
      '.cp-cut{page-break-after:avoid;page-break-before:avoid;}'+
    '}';

  var blank=function(copy,sign1,sign2){
    return '<div class="cp-card" style="background:#fff;border:1px solid #ccc;border-radius:8px;overflow:hidden;margin-bottom:10px;font-family:Arial,sans-serif;font-size:11.5px;color:#1a1a1a;">'+
      '<div style="background:#2b2b2b;display:flex;align-items:stretch;min-height:48px;">'+
        '<div style="padding:6px 10px;display:flex;align-items:center;border-right:1px solid rgba(255,255,255,.1);">'+
          '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAqCAIAAABDSv52AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAFGklEQVR42u1YW2hcVRRde59z7507M5lkkia1tS9atTRqa4kgaD8UHyBqqVAMgtQHKIJIP9ovoVToTxEKRX/8ED9ExEKRCoIUaREflFIUtahVsNbUhqbmNTOZuc9zth95OElnkpi2mkLP14V7zr7rnrPW2nsf2tB9BxbHYAAi8j8iEJFxAAyAiOacfe1wTD3r+SyYE+uCR31kxqIZ1zmUa0Qdnp3VC6bO7HAbxtfXiKezR2j49gZtr1co/302aAyFRBTAQDPuEUAi9YjroYsIREgEIuPRMI8fa6AgAUImCzDIgWg7Hm+aQ6dAzOyLgAgiDNj6/yNKAENwBQwkRBBxgNnhqM7OrmmnQqRENkTmlihttZISSopZJtImABJUFbUbWR8nF7XSQMJUIQLImdywkNBh7KrEjDFHJDelooGASQECWAikgZz1jNOqELYEyXt9owYAUFJ8vMXd15k3zAoAEBNui9KDF0oxYduadhGsic091fhkzv3DVY4gJKxMzDt9o2uj9P2O7M7lrbsHy3fXkt5VRQJyxr52qXKgq2VQsyPT9olnWI8CjTErK64VAJ2p7R2q3V+NA0IEWCBkenG42l2LFJA3NmC8Mljd1z+6Z6BigAhYG6WHzw3fnBom3BqljpWfPd1TjW4PkwHNz44EW8sRNRLFNCgWyIj86unXlxW+zrtacNrXz68unsloC6xO0oKxFmhNxRJ1pRZATy15rBRaUgpQIjWmp0rBqKJDbb4IIuaMyPcZB8wbw3RzkLw8OHbW08OKtcwUbAPaKuDNjtyAovsqUYvFVzm3wrR7sPrSUO2XjO5dVWw1lkBLUvt4OdpaCQOmFmPLTDUiV+ThsXhvZ36pAYkd1GSBPx0+lXWeHgm2lwLXypc5p6y43YqZngq4kZLRIrI6tQCGNSKi3tFw919j/a76uJARQU4sATGwv780qPmnjBaRfs0ZKztGasXU3hmZJyqhZXVvNdkcJkNaHW7NdAfJplpSdvWHrX7WznVAUyMlKhoL4FjOCwkvjATG4t02/2BHtsNYQ/RR0fetOdnivdWeWxenBPzu6RWp2XNxrJCaXQPlLZXIElWZzjtqfZg8N1QDoab41eUt3/qObiRs3dC/SGRpakH4NO/lLbLWKpHHKlFe8EnBM6C327PH8t6JrLs+TJbE9kzW/SznDbjqtO/84Osv8t72UvjoSG3XsuKQ4qN9Qxui9POC11NL2lP7ZCXqc9Q5R7l1gBofkAU8kTVxeqiYPesqgrzRlf/NdzYFaUAoExnAEB0pZC44/GA1vuTwzuWFc67qDhNDsr8z/0Gbf97ho23+dxlnY2xO5dxH1i15ZmXxQGdu76Wxh8aiIUXq8h24vA8SQIk8UI2OZ92USIOqjLwVAkpMOSvbKuGxnFdVHBPtGKme8N0fPa0JPUGyIjZHCpmcyF1B/I3vpgQNqhIU4AsCpqKxJSYGZphKEygiAEImf3IuCwxNQBSigODJRIYKCErgCSwhBVKCLxAgAlwRAjC58xZgIJnkxLy4Mu7JWSsyac6WJugt018JkBUIYAkAtIgjJAQBMjI5R8ROxQF080zUvLadniSkLoSdTqx/hEkkNJGGppbPSDa2eYqeb+lU79T10RdQ1jRbMt8yu1nZ/G8L8lnm36htb0BZxFCaKYivcD1m7a7njFbfPPOCHWJ8vixIz1fUMzdzGpp09wV3+VOR+arcHlyVG7LFoiAR4UWCY+a9rSxIDvP/4OyS/BsnQaRclmJE7gAAAABJRU5ErkJggg==" style="height:32px;width:auto;" alt="TeMAX"></div>'+
        '<div style="flex:1;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;">'+
          '<div style="font-size:10px;color:rgba(255,255,255,.55);">TeMAX — Клиентска заявка за доставка</div>'+
          '<div style="font-size:9px;color:rgba(255,255,255,.38);margin-top:1px;">'+esc(o.store_name||'')+'</div></div>'+
        '<div style="padding:6px 10px;text-align:right;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.1);">'+
          '<div style="font-size:8px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;">Заявка №</div>'+
          '<div style="font-size:13px;font-weight:700;color:#fff;margin:1px 0;">'+esc(o.in_num||'0001')+'</div>'+
          '<div style="font-size:9px;color:rgba(255,255,255,.45);">'+esc(o.date||'')+'</div></div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #eee;">'+
        '<span style="font-size:9px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;">'+copy+'</span>'+
        '<span style="font-size:10px;font-weight:600;padding:1px 9px;border-radius:20px;background:'+si.bg+';color:'+si.c+';">'+si.l+'</span></div>'+
      '<div style="padding:8px 10px;">'+
        '<div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;padding-bottom:2px;border-bottom:1px solid #f0ede8;">Данни за поръчката</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px;">'+
          itemsPrintBlock(o)+
          '<div style="background:#fff8e1;border:1px solid #f0c940;border-radius:5px;padding:4px 8px;grid-column:1/-1;">'+
            '<div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">★ Дата на доставка</div>'+
            '<div style="font-size:12px;font-weight:700;color:#dc2626;">'+fmtDate(o.delivery)+'</div></div>'+
          /* Клиентът трябва да знае, че поръчката му е разделена на няколко заявки —
             иначе идва с една бланка и очаква цялата стока. */
          (o.group_id&&coGroupMembers(o).length>1
            ? '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:5px;padding:4px 8px;grid-column:1/-1;"><div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">Обща поръчка</div><div style="font-size:11px;font-weight:700;">Заявка '+coGroupPos(o)+' от '+coGroupMembers(o).length+' — стоката пристига на части</div></div>'
            : '')+
          (o.note?'<div style="background:#f9f8f6;border-radius:5px;padding:4px 8px;grid-column:1/-1;"><div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">Забележка</div><div style="font-size:10.5px;">'+esc(o.note)+'</div></div>':'')+
        '</div>'+
        '<div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;padding-bottom:2px;border-bottom:1px solid #f0ede8;">Данни за клиента</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'+
          '<div style="grid-column:1/-1;background:#f9f8f6;border-radius:5px;padding:4px 8px;">'+
            '<div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">Три имена</div>'+
            '<div style="font-size:12px;font-weight:700;">'+esc(o.customer_name||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:4px 8px;">'+
            '<div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">Телефон</div>'+
            '<div style="font-size:11px;font-family:monospace;">'+esc(o.phone||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:4px 8px;">'+
            '<div style="font-size:7.5px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px;">Изготвил</div>'+
            '<div style="font-size:11px;">'+esc(o.agent||'')+'</div></div>'+
        '</div></div>'+
      '<div style="background:#f9f8f6;border-top:1px solid #eee;padding:4px 10px;font-size:8.5px;color:#999;line-height:1.4;"><b style="color:#777;">ОБЩИ УСЛОВИЯ:</b> Поръчката е валидна само след цялостно заплащане или капариране. Срокът за доставка е посочен по-горе.</div>'+
      '<div style="padding:7px 10px 8px;border-top:1px solid #eee;">'+
        '<div style="font-size:8.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;">'+sign1+'</div>'+
        '<div style="font-size:10px;font-style:italic;color:#555;margin-bottom:8px;padding:3px 8px;background:#f9f8f6;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;">'+sign2+'</div>'+
        '<div style="display:flex;gap:16px;">'+
          '<div style="flex:1;"><div style="border-top:1px solid #999;padding-top:3px;font-size:8.5px;color:#bbb;margin-top:16px;">Подпис: _______________________</div></div>'+
          '<div style="width:110px;"><div style="border-top:1px solid #999;padding-top:3px;font-size:8.5px;color:#bbb;margin-top:16px;">Дата: __________ г.</div></div>'+
        '</div></div>'+
    '</div>';
  };
  var dot='<div class="cp-cut" style="text-align:center;color:#94a3b8;font-size:10px;margin:2px 0;letter-spacing:.15em;">— — — — — — — — — — ОТКЪСВАТЕ ТУК — — — — — — — — — —</div>';
  wrap.innerHTML=
    '<style>'+PRINT_CSS+'</style>'+
    '<div class="cp-wrap" style="max-width:600px;margin:0 auto;padding:20px 16px 24px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Бланка за печат</div>'+
        '<div style="display:flex;gap:8px;">'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай / PDF</button>'+
          '<button onclick="showModule(\'client\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
        '</div></div>'+
      '<div style="font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px;padding:9px 13px;margin-bottom:14px;" class="no-print">'+
        '📄 И двете копия се събират на 1 лист А4. Горна половина — остава при магазина с подпис на клиента. Долна — за клиента. '+
        'За PDF: при печат избери "Запази като PDF" вместо принтер.</div>'+
      blank('КОПИЕ НА МАГАЗИНА','Подпис на клиента','Получих стоката без забележка. Запознат/а съм с условията.')+
      dot+
      blank('КОПИЕ НА КЛИЕНТА','Подпис на клиента','Получих стоката без забележка.')+
    '</div>';
}
