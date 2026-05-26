/* client-orders.js — Клиентски заявки + бланка за клиента
   Редактирай САМО тук когато правиш промени по клиентски заявки. */

function loadClientOrders(){
  var q='order=created_at.desc';
  if(!isGlobal())q+='&store_name=eq.'+encodeURIComponent(currentUser.store_name);
  sbGet('client_orders',q).then(function(data){
    clientOrders=Array.isArray(data)?data:[];
    clientOrders.forEach(function(o){o._status=calcStatus(o.delivery,o.status);});
    renderClientOrders();renderMetrics();updateBadges();
  }).catch(function(e){console.warn('client_orders:',e);});
}
function renderClientOrders(){
  var list=clientOrders.filter(function(o){
    return orderFilter==='all'||o._status===orderFilter||o.status===orderFilter;
  });
  var body=document.getElementById('co-body');if(!body)return;
  if(!list.length){body.innerHTML='<tr><td colspan="11" style="text-align:center;padding:30px;color:#94a3b8;">Няма клиентски заявки.</td></tr>';return;}
  body.innerHTML=list.map(function(o){
    var bdr={overdue:'#dc2626',today:'#2563eb',tomorrow:'#d97706'}[o._status]||'transparent';
    return '<tr style="border-left:3px solid '+bdr+'">'+
      '<td style="font-size:11px;color:#94a3b8;font-family:monospace;">'+esc(o.in_num||'—')+'</td>'+
      '<td>'+esc(o.date||'')+'<br><small style="color:#94a3b8;">'+esc(o.hour||'')+'</small></td>'+
      '<td><b>'+esc(o.customer_name||'')+'</b><br><small style="color:#94a3b8;">Бон: '+esc(o.bon||'—')+'</small></td>'+
      '<td style="font-family:monospace;">'+esc(o.phone||'')+'</td>'+
      '<td>'+esc(o.product||'')+'<br><small style="color:#94a3b8;">'+esc(o.color||'')+'</small></td>'+
      '<td style="text-align:center;">'+esc(String(o.qty||1))+'</td>'+
      '<td>'+esc(o.from_store||'')+'</td>'+
      '<td><b>'+fmtDate(o.delivery)+'</b></td>'+
      '<td>'+statusBadge(o._status)+'</td>'+
      '<td>'+esc(o.store_name||'')+'</td>'+
      '<td>'+actionBtns(o.id,'client_orders',o._status)+'</td></tr>';
  }).join('');
}
function filterOrders(f,btn){
  orderFilter=f;
  document.querySelectorAll('#co-filters .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderClientOrders();
}
function openClientModal(){
  ['c-bon','c-name','c-phone','c-product','c-color','c-agent','c-note'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('c-date').value=today();
  document.getElementById('c-hour').value='10:00';
  document.getElementById('c-qty').value='1';
  document.getElementById('c-delivery').value='';
  document.getElementById('c-from-store').value=currentUser.store_name;
  document.getElementById('c-fulfiller').value=currentUser.store_name;
  document.getElementById('client-modal').classList.add('open');
}
function submitClientOrder(){
  var name=v('c-name'),phone=v('c-phone'),product=v('c-product');
  if(!name||!phone||!product){toast('Попълни задължителните полета *','#dc2626');return;}
  var delivery=v('c-delivery')||null;
  var num=String(clientOrders.length+1).padStart(4,'0');
  sbPost('client_orders',{
    in_num:num,store_name:currentUser.store_name,
    date:v('c-date'),hour:v('c-hour'),bon:v('c-bon'),
    customer_name:name,phone:phone,
    product:product,color:v('c-color'),qty:parseInt(v('c-qty'))||1,
    from_store:v('c-from-store'),fulfiller:v('c-fulfiller'),
    agent:v('c-agent')||currentUser.display_name,
    delivery:delivery,status:calcStatus(delivery,'new'),note:v('c-note')
  }).then(function(res){
    if(!res.ok){toast('Грешка при запис','#dc2626');return;}
    closeModal('client-modal');toast('✓ Заявката е записана!');loadClientOrders();
  });
}
function loadPrint(id){
  var o=clientOrders.find(function(x){return String(x.id)===String(id);});
  if(!o)return;renderPrint(o);showModule('print');
}
function renderPrint(o){
  var wrap=document.getElementById('mod-print');
  var TODAY2=new Date();TODAY2.setHours(0,0,0,0);
  var st=calcStatus(o.delivery,o.status);
  var stInfo={overdue:{l:'🔴 ПРОСРОЧЕНА',bg:'#fee2e2',c:'#991b1b'},today:{l:'🔵 ДОСТАВКА ДНЕС',bg:'#dbeafe',c:'#1e3a5f'},
    tomorrow:{l:'🟡 ДОСТАВКА УТРЕ',bg:'#fef3c7',c:'#92400e'},pending:{l:'⏳ ИЗЧАКВА',bg:'#f3f4f6',c:'#374151'},
    done:{l:'✅ ИЗПЪЛНЕНА',bg:'#dcfce7',c:'#14532d'},refused:{l:'✕ ОТКАЗАНА',bg:'#fee2e2',c:'#991b1b'},
    postponed:{l:'⏱ ОТЛОЖЕНА',bg:'#f3e8ff',c:'#4c1d95'}};
  var si=stInfo[st]||stInfo.pending;
  var blank=function(copy,sign1,sign2){
    return '<div class="print-blank" style="background:#fff;border:1px solid #ccc;border-radius:10px;max-width:580px;font-family:Arial;font-size:12px;overflow:hidden;margin-bottom:16px;">'+
      '<div style="background:#2b2b2b;display:flex;align-items:stretch;min-height:68px;">'+
        '<div style="padding:10px 16px;display:flex;align-items:center;border-right:1px solid rgba(255,255,255,.1);">'+
          '<img src="data:image/png;base64,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" style="height:44px;" alt="TeMAX"></div>'+
        '<div style="flex:1;padding:10px 14px;display:flex;flex-direction:column;justify-content:center;">'+
          '<div style="font-size:11px;color:rgba(255,255,255,.55);">TeMAX — Клиентска заявка за доставка</div>'+
          '<div style="font-size:10px;color:rgba(255,255,255,.38);margin-top:2px;">'+esc(o.store_name||'')+'</div></div>'+
        '<div style="padding:10px 16px;text-align:right;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.1);">'+
          '<div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;">Заявка №</div>'+
          '<div style="font-size:15px;font-weight:700;color:#fff;margin:2px 0;">'+esc(o.in_num||'0001')+'</div>'+
          '<div style="font-size:10px;color:rgba(255,255,255,.45);">'+esc(o.date||'')+'</div></div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 16px;border-bottom:1px solid #eee;">'+
        '<span style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;">'+copy+'</span>'+
        '<span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;background:'+si.bg+';color:'+si.c+';">'+si.l+'</span></div>'+
      '<div style="padding:12px 16px;">'+
        '<div style="font-size:9px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #f0ede8;">Данни за поръчката</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">'+
          '<div style="grid-column:1/-1;background:#f9f8f6;border-radius:5px;padding:7px 9px;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Продукт</div><div style="font-size:13px;font-weight:700;">'+esc(o.product||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Цвят / Размер</div><div style="font-size:12px;">'+esc(o.color||'—')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Количество</div><div style="font-size:12px;">'+esc(String(o.qty||1))+' бр.</div></div>'+
          '<div style="background:#fff8e1;border:1px solid #f0c940;border-radius:5px;padding:7px 9px;grid-column:1/-1;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">★ Дата на доставка</div><div style="font-size:13px;font-weight:700;color:#dc2626;">'+fmtDate(o.delivery)+'</div></div>'+
          (o.note?'<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;grid-column:1/-1;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Забележка</div><div style="font-size:11px;">'+esc(o.note)+'</div></div>':'')+
        '</div>'+
        '<div style="font-size:9px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #f0ede8;">Данни за клиента</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">'+
          '<div style="grid-column:1/-1;background:#f9f8f6;border-radius:5px;padding:7px 9px;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Три имена</div><div style="font-size:13px;font-weight:700;">'+esc(o.customer_name||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Телефон</div><div style="font-size:12px;font-family:monospace;">'+esc(o.phone||'')+'</div></div>'+
          '<div style="background:#f9f8f6;border-radius:5px;padding:7px 9px;"><div style="font-size:8px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Изготвил</div><div style="font-size:12px;">'+esc(o.agent||'')+'</div></div>'+
        '</div></div>'+
      '<div style="background:#f9f8f6;border-top:1px solid #eee;padding:8px 16px;font-size:9px;color:#999;line-height:1.6;"><b style="color:#777;">ОБЩИ УСЛОВИЯ:</b> Поръчката е валидна само след цялостно заплащане или капариране. Срокът за доставка е посочен по-горе.</div>'+
      '<div style="padding:12px 16px 16px;border-top:1px solid #eee;">'+
        '<div style="font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px;">'+sign1+'</div>'+
        '<div style="font-size:11px;font-style:italic;color:#555;margin-bottom:16px;padding:5px 10px;background:#f9f8f6;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;">'+sign2+'</div>'+
        '<div style="display:flex;gap:20px;">'+
          '<div style="flex:1;"><div style="border-top:1px solid #999;padding-top:4px;font-size:9px;color:#bbb;margin-top:26px;">Подпис: _______________________</div></div>'+
          '<div style="width:120px;"><div style="border-top:1px solid #999;padding-top:4px;font-size:9px;color:#bbb;margin-top:26px;">Дата: __________ г.</div></div>'+
        '</div></div>'+
    '</div>';
  };
  var dot='<div style="text-align:center;color:#94a3b8;font-size:11px;margin:6px 0;letter-spacing:.15em;">— — — — — — — — — — ОТКЪСВАТЕ ТУК — — — — — — — — — —</div>';
  wrap.innerHTML='<div style="max-width:600px;margin:0 auto;padding:20px 16px 60px;">'+
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
