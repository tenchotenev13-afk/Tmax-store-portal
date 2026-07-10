/* client-orders.js — Клиентски заявки + бланка за клиента */

function calcElapsed(createdAt){
  if(!createdAt) return 0;
  var created=new Date(createdAt); created.setHours(0,0,0,0);
  return Math.floor((TODAY-created)/86400000);
}

function elapsedBadge(days, status){
  /* Не показваме за финални статуси */
  if(['done','refused','postponed'].indexOf(status)>=0) return '';
  if(days<5) return '<span style="font-size:11px;color:#94a3b8;">'+days+' дни</span>';
  if(days<7)  return '<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;padding:2px 7px;border-radius:20px;">⚠️ '+days+' дни</span>';
  if(days<10) return '<span style="font-size:11px;font-weight:600;color:#ea580c;background:#fff7ed;padding:2px 7px;border-radius:20px;">🔶 '+days+' дни</span>';
  return '<span style="font-size:11px;font-weight:600;color:#dc2626;background:#fee2e2;padding:2px 7px;border-radius:20px;animation:rowPulse 1.5s infinite;">🔴 '+days+' дни!</span>';
}

function elapsedRowStyle(days, baseStatus){
  if(['done','refused','postponed'].indexOf(baseStatus)>=0) return '';
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

function loadClientOrders(){
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
  if (search) {
    list=list.filter(function(o){
      return (o.customer_name||'').toLowerCase().indexOf(search)>=0 ||
             (o.product||'').toLowerCase().indexOf(search)>=0 ||
             (o.sap||'').toLowerCase().indexOf(search)>=0 ||
             (o.phone||'').indexOf(search)>=0 ||
             (o.bon||'').toLowerCase().indexOf(search)>=0;
    });
  }
  var body=document.getElementById('co-body');if(!body)return;
  if(!list.length){body.innerHTML='<tr><td colspan="14" style="text-align:center;padding:30px;color:#94a3b8;">Няма клиентски заявки.</td></tr>';return;}
  var isAdmin=currentUser&&['admin','accounting'].indexOf(currentUser.role)>=0;
  body.innerHTML=list.map(function(o){
    var urgent=o._status==='overdue'||o._status==='today';
    var bdrColor={overdue:'#dc2626',today:'#2563eb',tomorrow:'#d97706'}[o._status]||'transparent';
    var rowStyle='border-left:3px solid '+bdrColor+';'+(urgent?'animation:rowPulse 2s infinite;':'');
    var fulfillerCell=o.fulfiller&&o.fulfiller!==o.store_name
      ?'<span style="background:#eff6ff;color:#1e40af;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">🏪 '+esc(o.fulfiller)+'</span>'
      :'<span style="color:#94a3b8;font-size:10px;">—</span>';
    var storeCell=o.fulfiller&&o.fulfiller!==o.store_name
      ?'<div style="font-size:10px;color:#94a3b8;">Заявител:</div><b>'+esc(o.store_name||'')+'</b><div style="font-size:10px;color:#2563eb;margin-top:2px;">Изпълнява: <b>'+esc(o.fulfiller)+'</b></div>'
      :esc(o.store_name||'');
    var myStore=currentUser&&currentUser.store_name;
    var done=o._status==='done'||o._status==='refused'||o.status==='done'||o.status==='refused';
    var isRequester=isAdmin||!o.fulfiller||o.store_name===myStore||isGlobal();
    var isFulfiller=o.fulfiller&&o.fulfiller===myStore&&!isRequester;
    var btns='<div style="display:flex;gap:4px;flex-wrap:wrap;">';
    if(!done){
      if(isRequester){
        btns+='<button data-id="'+o.id+'" onclick="openStatus(this.dataset.id,&apos;client_orders&apos;)" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">Статус</button>';
      } else if(isFulfiller){
        btns+='<button data-id="'+o.id+'" onclick="setClientStatus(this.dataset.id,&apos;done&apos;)" style="border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">📦 Изпратена</button>';
        btns+='<button data-id="'+o.id+'" onclick="setClientStatus(this.dataset.id,&apos;refused&apos;)" style="border:1px solid #dc2626;background:#fff1f2;color:#dc2626;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕ Откаже</button>';
      }
    } else {
      if(isRequester){
        btns+='<button data-id="'+o.id+'" onclick="revertStatus(this.dataset.id,&apos;client_orders&apos;)" style="border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">↩ Върни</button>';
      }
    }
    btns+='<button data-id="'+o.id+'" onclick="loadPrint(this.dataset.id)" style="border:1px solid #2563eb;background:#eff6ff;color:#2563eb;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">🖨 Бланка</button>';
    if(isAdmin){
      btns+='<button data-id="'+o.id+'" onclick="deleteClientOrder(this.dataset.id)" style="border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">✕</button>';
    }
    btns+='</div>';
    return '<tr style="'+rowStyle+'">'+
      '<td style="font-size:11px;color:#94a3b8;font-family:monospace;">'+esc(o.in_num||'—')+'</td>'+
      '<td>'+esc(o.date||'')+'<br><small style="color:#94a3b8;">'+esc(o.hour||'')+'</small></td>'+
      '<td><b>'+esc(o.customer_name||'')+'</b><br><small style="color:#94a3b8;">Бон: '+esc(o.bon||'—')+'</small></td>'+
      '<td style="font-family:monospace;">'+esc(o.phone||'')+'</td>'+
      '<td style="font-family:monospace;font-size:11px;">'+esc(o.sap||'—')+'</td>'+
      '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+esc(o.color||'')+'</small></td>'+
      '<td style="text-align:center;">'+esc(String(o.qty||1))+(o.unit&&o.unit!=='бр.'?'<br><small style="color:#94a3b8;">'+esc(o.unit)+'</small>':'')+'</td>'+
      '<td>'+esc(o.from_store||'')+'</td>'+
      '<td style="font-size:11px;">'+fulfillerCell+'</td>'+
      '<td><b>'+fmtDate(o.delivery)+'</b></td>'+
      '<td>'+elapsedBadge(o._days,o.status)+'</td>'+
      '<td>'+statusBadge(o._status)+'</td>'+
      '<td style="font-size:11px;">'+storeCell+'</td>'+
      '<td>'+btns+'</td></tr>';
  }).join('');
}

function filterOrders(f,btn){
  orderFilter=f;
  document.querySelectorAll('#co-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderClientOrders();
}

function setClientStatus(id,status){
  sbPatch('client_orders','id=eq.'+id,{status:status}).then(function(res){
    if(!res.ok){toast('Грешка','#dc2626');return;}
    toast('✓ Статусът е обновен');loadClientOrders();
  });
}

function deleteClientOrder(id){
  if(!confirm('Изтрий тази заявка?'))return;
  sbDelete('client_orders','id=eq.'+id).then(function(){
    toast('✓ Заявката е изтрита');loadClientOrders();
  });
}

function openClientModal(){
  ['c-bon','c-sap','c-name','c-phone','c-product','c-color','c-agent','c-note'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('c-date').value=today();
  document.getElementById('c-hour').value='10:00';
  document.getElementById('c-qty').value='1';
  document.getElementById('c-delivery').value='';
  document.getElementById('c-from-store').value=currentUser.store_name;
  document.getElementById('c-fulfiller').value=currentUser.store_name;
  if(document.getElementById('c-unit'))document.getElementById('c-unit').value='бр.';
  document.getElementById('client-modal').classList.add('open');
}

function submitClientOrder(){
  var name=v('c-name'),phone=v('c-phone'),product=v('c-product');
  if(!name||!phone||!product){toast('Попълни задължителните полета *','#dc2626');return;}
  var delivery=v('c-delivery')||null;
  var num=String(clientOrders.length+1).padStart(4,'0');
  sbPost('client_orders',{
    in_num:num,store_name:currentUser.store_name,
    date:v('c-date'),hour:v('c-hour'),bon:v('c-bon'),sap:v('c-sap'),
    customer_name:name,phone:phone,
    product:product,color:v('c-color'),qty:parseFloat(v('c-qty'))||1,unit:v('c-unit')||'бр.',
    from_store:v('c-from-store'),fulfiller:v('c-fulfiller'),
    agent:v('c-agent')||currentUser.display_name,
    delivery:delivery,status:calcStatus(delivery,'new'),note:v('c-note')
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    closeModal('client-modal');toast('✓ Заявката е записана!');loadClientOrders();
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
    done:{l:'✅ ИЗПЪЛНЕНА',bg:'#dcfce7',c:'#14532d'},
    refused:{l:'✕ ОТКАЗАНА',bg:'#fee2e2',c:'#991b1b'},
    postponed:{l:'⏱ ОТЛОЖЕНА',bg:'#f3e8ff',c:'#4c1d95'}
  };
  var si=stInfo[st]||stInfo.pending;
  var prod=(o.sap?o.sap+' - ':'')+esc(o.product||'');

  var blank=function(copy,sign1,sign2){
    return '<div style="background:#fff;border:1px solid #ccc;border-radius:10px;overflow:hidden;margin-bottom:16px;font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;">'+
      '<div style="background:#2b2b2b;display:flex;align-items:stretch;min-height:66px;">'+
        '<div style="padding:10px 14px;display:flex;align-items:center;border-right:1px solid rgba(255,255,255,.1);">'+
          '<img src="data:image/png;base64,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" style="height:42px;width:auto;" alt="TeMAX"></div>'+
        '<div style="flex:1;padding:10px 14px;display:flex;flex-direction:column;justify-content:center;">'+
          '<div style="font-size:11px;color:rgba(255,255,255,.55);">TeMAX — Клиентска заявка за доставка</div>'+
          '<div style="font-size:10px;color:rgba(255,255,255,.38);margin-top:2px;">'+esc(o.store_name||'')+'</div></div>'+
        '<div style="padding:10px 14px;text-align:right;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.1);">'+
          '<div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;">Заявка №</div>'+
          '<div style="font-size:15px;font-weight:700;color:#fff;margin:2px 0;">'+esc(o.in_num||'0001')+'</div>'+
          '<div style="font-size:10px;color:rgba(255,255,255,.45);">'+esc(o.date||'')+'</div></div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 14px;border-bottom:1px solid #eee;">'+
        '<span style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;">'+copy+'</span>'+
        '<span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;background:'+si.bg+';color:'+si.c+';">'+si.l+'</span></div>'+
      '<div style="padding:12px 14px;">'+
        '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #f0ede8;">Данни за поръчката</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">'+
          '<div style="grid-column:1/-1;background:#f9f8f6;border-radius:5px;padding:7px 9px;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Продукт (SAP - Описание)</div>'+
            '<div style="font-size:13px;font-weight:700;">'+prod+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Цвят / Размер</div>'+
            '<div style="font-size:12px;">'+esc(o.color||'—')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Количество</div>'+
            '<div style="font-size:12px;">'+esc(String(o.qty||1))+' '+esc(o.unit||'бр.')+'</div></div>'+
          '<div style="background:#fff8e1;border:1px solid #f0c940;border-radius:5px;padding:7px 9px;grid-column:1/-1;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">★ Дата на доставка</div>'+
            '<div style="font-size:13px;font-weight:700;color:#dc2626;">'+fmtDate(o.delivery)+'</div></div>'+
          (o.note?'<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;grid-column:1/-1;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Забележка</div><div style="font-size:11px;">'+esc(o.note)+'</div></div>':'')+
        '</div>'+
        '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #f0ede8;">Данни за клиента</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">'+
          '<div style="grid-column:1/-1;background:#f9f8f6;border-radius:5px;padding:7px 9px;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Три имена</div>'+
            '<div style="font-size:13px;font-weight:700;">'+esc(o.customer_name||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Телефон</div>'+
            '<div style="font-size:12px;font-family:monospace;">'+esc(o.phone||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;">'+
            '<div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Изготвил</div>'+
            '<div style="font-size:12px;">'+esc(o.agent||'')+'</div></div>'+
        '</div></div>'+
      '<div style="background:#f9f8f6;border-top:1px solid #eee;padding:7px 14px;font-size:9px;color:#999;line-height:1.6;"><b style="color:#777;">ОБЩИ УСЛОВИЯ:</b> Поръчката е валидна само след цялостно заплащане или капариране. Срокът за доставка е посочен по-горе.</div>'+
      '<div style="padding:11px 14px 14px;border-top:1px solid #eee;">'+
        '<div style="font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px;">'+sign1+'</div>'+
        '<div style="font-size:11px;font-style:italic;color:#555;margin-bottom:14px;padding:5px 10px;background:#f9f8f6;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;">'+sign2+'</div>'+
        '<div style="display:flex;gap:20px;">'+
          '<div style="flex:1;"><div style="border-top:1px solid #999;padding-top:4px;font-size:9px;color:#bbb;margin-top:24px;">Подпис: _______________________</div></div>'+
          '<div style="width:120px;"><div style="border-top:1px solid #999;padding-top:4px;font-size:9px;color:#bbb;margin-top:24px;">Дата: __________ г.</div></div>'+
        '</div></div>'+
    '</div>';
  };
  var dot='<div style="text-align:center;color:#94a3b8;font-size:11px;margin:4px 0;letter-spacing:.15em;">— — — — — — — — — — ОТКЪСВАТЕ ТУК — — — — — — — — — —</div>';
  wrap.innerHTML=
    '<div style="max-width:600px;margin:0 auto;padding:20px 16px 60px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px;" class="no-print">'+
        '<div style="font-size:18px;font-weight:600;">🖨 Бланка за печат</div>'+
        '<div style="display:flex;gap:8px;">'+
          '<button onclick="window.print()" style="border:none;border-radius:8px;padding:8px 16px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 Принтирай</button>'+
          '<button onclick="showModule(\'client\')" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;background:#fff;font-size:13px;cursor:pointer;">← Обратно</button>'+
        '</div></div>'+
      '<div style="font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px;padding:9px 13px;margin-bottom:14px;" class="no-print">'+
        '📄 Горна половина — остава при магазина с подпис на клиента. Долна — за клиента.</div>'+
      blank('КОПИЕ НА МАГАЗИНА','Подпис на клиента','Получих стоката без забележка. Запознат/а съм с условията.')+
      dot+
      blank('КОПИЕ НА КЛИЕНТА','Подпис на клиента','Получих стоката без забележка.')+
    '</div>';
}
