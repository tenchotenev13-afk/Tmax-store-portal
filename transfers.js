/* transfers.js — под-таб „🔁 Трансфери" в Транспорт.
   Междускладови трансфери, ЕТАП 1: създаване на транспорт с товари.
   Потвърждаването по товар (разтоварен / получен / предаден на куриер /
   проблем) е етап 2 и тук го НЯМА — статусът е винаги „Планиран".

   ОТДЕЛЕН МОДУЛ, не разширение на Товарни листи: loading.js остава
   инструмент на склада (какво е натоварено на неговия курс), а трансферът е
   на всеки обект — магазин или склад — и описва пътя на товара, включително
   прехвърлянията през други обекти.

   МОДЕЛ (Теодор, 28–29.09.2026)
   · Транспорт (transfers): бус или куриер. Номерът „Добрич-0007" се раздава
     от тригер в базата по създаващия обект — като in_num на клиентските
     заявки. Стойност от клиента се игнорира; номерът се чете от отговора
     на sbPostReturn.
       бус    — дата, час, шофьор; начало = създаващият обект; спирки по ред;
                крайна точка. Регистрационен номер НЕ се въвежда.
       куриер — фирма и № товарителница; винаги А→Б: без спирки, един
                получател (end_store), и всички товари са за него.
   · Товар (transfer_cargo): ЕДНА физическа единица — палет / руло / насип /
     кашон, с брой. Брой > 1 е пак един товар (потвърждава се наведнъж).
     Краен получател — винаги обект. Точки на прехвърляне — само обекти,
     където товарът се РАЗТОВАРВА и чака; транзитът не се пише. Първата
     точка (или получателят, ако няма точки) трябва да е спирка или крайна
     точка на ТОЗИ транспорт — иначе товарът няма къде да слезе.

   ВИДИМОСТ: обектът вижда транспортите, които е създал, и тези, в които е
   спирка, крайна точка, точка на прехвърляне или получател. isGlobal()
   (admin / accounting / logistics) — всички. Правилото е в
   tfVisibleToStores() и е едно за списъка и за теста.

   Обектите се пазят като ТЕКСТ (store_name), не като FK — конвенцията на
   проекта (виж loading-lists-schema.sql). */

/* ── Състояние ───────────────────────────────────────────────────────────── */
var tfTransfers = [];       /* видимите транспорти */
var tfCargoByTransfer = {}; /* transfer_id -> [товари] */
var tfStoreList = [];       /* обектите за спирки/получатели */
var tfView = 'list';        /* 'list' | 'form' */
var tfForm = null;          /* формата „Нов транспорт" */
var tfSaving = false;
var tfCoOpts = [];          /* клиентски поръчки на обекта — {id,label} */
var tfToOpts = [];          /* транспортни заявки на обекта — {id,label} */
var tfLlOpts = [];          /* редове от товарни листи (само за склад) — {id,label} */

var TF_KINDS = [
  ['pallet', 'Палет'],
  ['roll',   'Руло'],
  ['bulk',   'Насип'],
  ['carton', 'Кашон']
];
var TF_COURIERS = ['Intime', 'Econt', 'Transpress'];
var TF_STATUS_LABELS = { planned: 'Планиран' };

/* escAttr() от shared.js връща „—" за празно (минава през esc()) — в
   value="" това е тире в празно поле. Тук празното остава празно. */
function tfAttr(s) {
  return (s === null || s === undefined || s === '') ? '' : escAttr(String(s));
}

function tfKindLabel(k) {
  for (var i = 0; i < TF_KINDS.length; i++) if (TF_KINDS[i][0] === k) return TF_KINDS[i][1];
  return k || '';
}

/* ── Обекти ──────────────────────────────────────────────────────────────── */

/* Обектите, между които се движи товар: отчетните обекти + двата склада.
   ЦО и обектите без акаунт не участват. */
function tfLoadStoreList() {
  return loadReportableStores().then(function (list) {
    var all = (Array.isArray(list) ? list.slice() : []);
    LOGISTICS_WAREHOUSES.forEach(function (w) { if (all.indexOf(w) < 0) all.push(w); });
    all.sort(function (a, b) { return a.localeCompare(b, 'bg'); });
    tfStoreList = all;
    return all;
  });
}

/* От кой обект може да създава текущият потребител. Глобалните избират;
   обектът — само себе си (или назначените си). */
function tfCreatorStores() {
  var st = assignedStores();
  if (!st) return tfStoreList.slice();
  return st.filter(function (s) { return !!s; });
}

/* Обектите, чиито транспорти потребителят гледа. null = всички. */
function tfMyStores() {
  return assignedStores();
}

/* Участва ли някой от stores в транспорта t (с товарите му cargo).
   Единственото правило за видимост — ползва го и списъкът, и тестът. */
function tfVisibleToStores(t, cargo, stores) {
  if (!stores) return true;
  if (!t) return false;
  var hit = function (s) { return !!s && stores.indexOf(s) >= 0; };
  if (hit(t.from_store) || hit(t.end_store)) return true;
  if ((t.stops || []).some(hit)) return true;
  return (cargo || []).some(function (c) {
    return hit(c.recipient_store) || (c.transfer_points || []).some(hit);
  });
}

/* ── Зареждане ───────────────────────────────────────────────────────────── */

function tfArrCs(col, store) {
  return col + '.cs.' + encodeURIComponent('{"' + String(store).replace(/"/g, '\\"') + '"}');
}

function loadTransfers() {
  var wrap = document.getElementById('mod-transfers');
  if (!wrap) return;
  tfView = 'list';
  wrap.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div>';

  var stores = tfMyStores();
  var headersP;
  if (!stores) {
    headersP = sbGet('transfers', 'order=created_at.desc&limit=500');
  } else {
    /* Две заявки: по заглавието (създател / спирка / крайна точка) и по
       товарите (получател / точка на прехвърляне). Обединяват се по id. */
    var hq = [], cq = [];
    stores.forEach(function (s) {
      var e = encodeURIComponent(s);
      hq.push('from_store.eq.' + e, 'end_store.eq.' + e, tfArrCs('stops', s));
      cq.push('recipient_store.eq.' + e, tfArrCs('transfer_points', s));
    });
    headersP = Promise.all([
      sbGet('transfers', 'or=(' + hq.join(',') + ')&order=created_at.desc&limit=500'),
      sbGet('transfer_cargo', 'or=(' + cq.join(',') + ')&select=transfer_id')
    ]).then(function (r) {
      var list = Array.isArray(r[0]) ? r[0] : [];
      var have = {};
      list.forEach(function (t) { have[t.id] = 1; });
      var extra = (Array.isArray(r[1]) ? r[1] : [])
        .map(function (c) { return c.transfer_id; })
        .filter(function (id, i, a) { return id && !have[id] && a.indexOf(id) === i; });
      if (!extra.length) return list;
      return sbGet('transfers', 'id=in.(' + extra.join(',') + ')').then(function (more) {
        return list.concat(Array.isArray(more) ? more : []);
      });
    });
  }

  Promise.all([headersP, tfLoadStoreList()]).then(function (r) {
    var list = Array.isArray(r[0]) ? r[0] : [];
    if (!list.length) return [list, []];
    var ids = list.map(function (t) { return t.id; });
    return sbGet('transfer_cargo', 'transfer_id=in.(' + ids.join(',') + ')&order=position.asc')
      .then(function (cargo) { return [list, Array.isArray(cargo) ? cargo : []]; });
  }).then(function (r) {
    var byT = {};
    r[1].forEach(function (c) { (byT[c.transfer_id] = byT[c.transfer_id] || []).push(c); });
    /* Втора проверка в клиента — по същото правило, по което филтрира и
       заявката. Така видимостта не зависи само от синтаксиса на or=(). */
    var stores2 = tfMyStores();
    tfTransfers = r[0].filter(function (t) { return tfVisibleToStores(t, byT[t.id], stores2); });
    tfTransfers.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
    tfCargoByTransfer = byT;
    renderTransfers();
  }).catch(function () {
    tfTransfers = []; tfCargoByTransfer = {};
    renderTransfers();
  });
}

/* ── Списък ──────────────────────────────────────────────────────────────── */

function tfRouteText(t) {
  var parts = [t.from_store].concat(t.stops || []).concat([t.end_store]);
  return parts.filter(Boolean).join(' → ');
}

function tfModeLabel(t) {
  if (t.mode === 'courier') return '📦 Куриер' + (t.courier_company ? ' · ' + t.courier_company : '');
  return '🚐 Бус';
}

function tfDateLabel(t) {
  if (t.mode === 'bus' && t.depart_date) {
    return fmtDate(t.depart_date) + (t.depart_time ? ' ' + t.depart_time : '');
  }
  return fmtDate(String(t.created_at || '').slice(0, 10));
}

/* Търсене по номер / получател / товарителница. */
function tfMatches(t, q) {
  if (!q) return true;
  q = q.toLowerCase();
  var hay = [t.transfer_num, t.end_store, t.waybill_no];
  (tfCargoByTransfer[t.id] || []).forEach(function (c) { hay.push(c.recipient_store); });
  return hay.some(function (x) { return x && String(x).toLowerCase().indexOf(q) >= 0; });
}

function renderTransfers() {
  var wrap = document.getElementById('mod-transfers');
  if (!wrap) return;
  if (tfView === 'form') { renderTransferForm(); return; }

  var qEl = document.getElementById('trf-search');
  var q = qEl ? qEl.value.trim() : '';
  var rows = tfTransfers.filter(function (t) { return tfMatches(t, q); });

  var h = '<div class="pg-title">🔁 Трансфери</div>' +
    '<div class="pg-sub">Транспорти между обекти — бус със спирки или куриер. Всеки товар има краен получател.</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">' +
      '<input id="trf-search" placeholder="🔍 Номер / получател / товарителница…" value="' + tfAttr(q) + '"' +
      ' oninput="renderTransfersKeepFocus()" style="flex:1;min-width:220px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 14px;font-size:13px;font-family:inherit;outline:none;">' +
      (tfCreatorStores().length ? '<button id="trf-new" class="btn btn-green" onclick="openTransferForm()">+ Нов транспорт</button>' : '') +
    '</div>' +
    '<div class="tbl-wrap"><table id="trf-table">' +
    '<thead><tr><th>Номер</th><th>Вид</th><th>Дата</th><th>От → до</th><th>Товари</th><th>Статус</th><th></th></tr></thead><tbody>';

  if (!rows.length) {
    h += '<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">' +
      (q ? 'Няма съвпадения.' : 'Няма транспорти.') + '</td></tr>';
  }
  rows.forEach(function (t) {
    var cargo = tfCargoByTransfer[t.id] || [];
    var pcs = cargo.reduce(function (a, c) { return a + (parseInt(c.qty, 10) || 0); }, 0);
    h += '<tr data-id="' + tfAttr(t.id) + '">' +
      '<td style="font-weight:700;white-space:nowrap;">' + escVal(t.transfer_num) + '</td>' +
      '<td>' + escVal(tfModeLabel(t)) + (t.waybill_no ? '<div style="font-size:11px;color:#64748b;">№ ' + escVal(t.waybill_no) + '</div>' : '') + '</td>' +
      '<td style="white-space:nowrap;">' + escVal(tfDateLabel(t)) + '</td>' +
      '<td>' + escVal(tfRouteText(t)) + '</td>' +
      '<td style="text-align:center;">' + cargo.length + (pcs !== cargo.length ? ' <span style="color:#64748b;font-size:11px;">(' + pcs + ' бр.)</span>' : '') + '</td>' +
      '<td><span class="badge" style="background:#eff6ff;color:#1e40af;">' + escVal(TF_STATUS_LABELS[t.status] || t.status) + '</span></td>' +
      '<td><button class="btn-sm" onclick="printTransfer(\'' + tfAttr(t.id) + '\')">🖨 Печат</button></td>' +
    '</tr>';
  });
  h += '</tbody></table></div>';
  wrap.innerHTML = h;
}

/* Рендерът пише в innerHTML и губи фокуса на полето за търсене — връща се. */
function renderTransfersKeepFocus() {
  var el = document.getElementById('trf-search');
  var pos = el ? el.selectionStart : null;
  renderTransfers();
  var el2 = document.getElementById('trf-search');
  if (el2) { el2.focus(); try { if (pos !== null) el2.setSelectionRange(pos, pos); } catch (e) {} }
}

/* ── Формата ─────────────────────────────────────────────────────────────── */

function tfNewCargo() {
  return { kind: 'pallet', qty: 1, recipient_store: '', transfer_points: [], note: '',
           client_order_ids: [], transport_order_ids: [], claims: '', goods_doc: '', loading_item_id: '' };
}

function openTransferForm() {
  var creators = tfCreatorStores();
  if (!creators.length) return;
  tfForm = {
    from_store: creators.length === 1 ? creators[0] : '',
    mode: 'bus',
    depart_date: today(), depart_time: '', driver: '',
    stops: [], end_store: '',
    courier_company: '', waybill_no: '',
    note: '',
    cargo: [tfNewCargo()]
  };
  tfView = 'form';
  renderTransferForm();
  tfLoadLinkOptions();
}

function closeTransferForm() {
  tfView = 'list'; tfForm = null;
  renderTransfers();
}

/* Клиентски поръчки и транспортни заявки на създаващия обект — за
   автодовършването. Склад: и редовете от последните му товарни листи. */
function tfLoadLinkOptions() {
  var f = tfForm;
  if (!f || !f.from_store) { tfCoOpts = []; tfToOpts = []; tfLlOpts = []; return Promise.resolve(); }
  var s = encodeURIComponent(f.from_store);
  var jobs = [
    sbGet('client_orders', 'select=id,in_num,customer_name,status&or=(store_name.eq.' + s + ',fulfiller.eq.' + s + ')&order=created_at.desc&limit=300'),
    sbGet('transport_orders', 'select=id,date,customer_name,address&store_name=eq.' + s + '&order=created_at.desc&limit=300')
  ];
  var isWh = LOGISTICS_WAREHOUSES.indexOf(f.from_store) >= 0;
  if (isWh) {
    jobs.push(sbGet('loading_lists', 'select=id,list_date&warehouse=eq.' + s + '&order=list_date.desc&limit=20').then(function (lists) {
      lists = Array.isArray(lists) ? lists : [];
      if (!lists.length) return [];
      var dateOf = {};
      lists.forEach(function (l) { dateOf[l.id] = l.list_date; });
      return sbGet('loading_list_items', 'select=id,list_id,store_name,kind,pallet_no,pallet_total,purchase_doc&list_id=in.(' +
        lists.map(function (l) { return l.id; }).join(',') + ')&order=position.asc').then(function (items) {
        return (Array.isArray(items) ? items : []).map(function (it) {
          it._date = dateOf[it.list_id]; return it;
        });
      });
    }));
  }
  return Promise.all(jobs).then(function (r) {
    if (tfForm !== f) return;
    tfCoOpts = (Array.isArray(r[0]) ? r[0] : []).map(function (o) {
      return { id: o.id, label: (o.in_num || '—') + ' · ' + (o.customer_name || '') };
    });
    tfToOpts = (Array.isArray(r[1]) ? r[1] : []).map(function (o) {
      return { id: o.id, label: (o.date ? fmtDate(o.date) + ' · ' : '') + (o.customer_name || '') + (o.address ? ' · ' + o.address : '') };
    });
    tfLlOpts = (isWh && Array.isArray(r[2]) ? r[2] : []).map(function (it) {
      return { id: it.id, label: fmtDate(it._date) + ' · ' + it.store_name + ' · ' + tfKindLabel(it.kind) +
        (it.pallet_no ? ' ' + it.pallet_no + (it.pallet_total ? '/' + it.pallet_total : '') : '') +
        (it.purchase_doc ? ' · ' + it.purchase_doc : '') };
    });
    if (tfView === 'form') renderTransferForm();
  });
}

function tfOptLabel(opts, id) {
  for (var i = 0; i < opts.length; i++) if (opts[i].id === id) return opts[i].label;
  return id;
}

function tfStoreOptions(selected, exclude) {
  exclude = exclude || [];
  return '<option value="">— избери —</option>' + tfStoreList.filter(function (s) {
    return s === selected || exclude.indexOf(s) < 0;
  }).map(function (s) {
    return '<option value="' + tfAttr(s) + '"' + (s === selected ? ' selected' : '') + '>' + escVal(s) + '</option>';
  }).join('');
}

/* Спирките на транспорта (без началото): където товар може да слезе. */
function tfRouteStops(f) {
  var out = (f.mode === 'bus' ? (f.stops || []) : []).slice();
  if (f.end_store) out.push(f.end_store);
  return out.filter(Boolean);
}

var TF_FLD = 'border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;';

function renderTransferForm() {
  var wrap = document.getElementById('mod-transfers');
  if (!wrap || !tfForm) return;
  var f = tfForm;
  var creators = tfCreatorStores();
  var courier = f.mode === 'courier';

  var h = '<div class="pg-title">🔁 Нов транспорт</div>' +
    '<div id="trf-form" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;max-width:1000px;">';

  /* От кой обект + вид */
  h += '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">' +
    '<label style="font-size:12px;">От обект (начална точка)<br>' +
      (creators.length === 1
        ? '<b id="trf-from-fixed" style="font-size:14px;">' + escVal(f.from_store) + '</b>'
        : '<select id="trf-from" onchange="tfSetField(\'from_store\',this.value,true)" style="' + TF_FLD + '">' +
            '<option value="">— избери —</option>' + creators.map(function (s) {
              return '<option value="' + tfAttr(s) + '"' + (s === f.from_store ? ' selected' : '') + '>' + escVal(s) + '</option>';
            }).join('') + '</select>') +
    '</label>' +
    '<div style="font-size:12px;">Вид<br>' +
      '<label style="margin-right:12px;"><input type="radio" name="trf-mode" id="trf-mode-bus" value="bus"' + (!courier ? ' checked' : '') + ' onchange="tfSetMode(\'bus\')"> 🚐 Бус</label>' +
      '<label><input type="radio" name="trf-mode" id="trf-mode-courier" value="courier"' + (courier ? ' checked' : '') + ' onchange="tfSetMode(\'courier\')"> 📦 Куриер</label>' +
    '</div></div>';

  if (!courier) {
    h += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<label style="font-size:12px;">Дата<br><input id="trf-date" type="date" value="' + tfAttr(f.depart_date) + '" onchange="tfSetField(\'depart_date\',this.value)" style="' + TF_FLD + '"></label>' +
      '<label style="font-size:12px;">Час<br><input id="trf-time" type="time" value="' + tfAttr(f.depart_time) + '" onchange="tfSetField(\'depart_time\',this.value)" style="' + TF_FLD + '"></label>' +
      '<label style="font-size:12px;">Шофьор<br><input id="trf-driver" value="' + tfAttr(f.driver) + '" oninput="tfSetField(\'driver\',this.value)" style="' + TF_FLD + 'min-width:200px;"></label>' +
    '</div>';
    /* Маршрут */
    h += '<div style="font-size:12px;font-weight:700;margin-bottom:4px;">Маршрут</div>' +
      '<div style="font-size:13px;margin-bottom:6px;">🏁 ' + escVal(f.from_store || '—') + '</div>';
    f.stops.forEach(function (s, i) {
      h += '<div style="display:flex;gap:6px;align-items:center;margin:0 0 6px 16px;">' +
        '<span style="font-size:12px;color:#64748b;">Спирка ' + (i + 1) + '</span>' +
        '<select class="trf-stop" data-i="' + i + '" onchange="tfSetStop(' + i + ',this.value)" style="' + TF_FLD + '">' +
          tfStoreOptions(s, [f.from_store]) + '</select>' +
        '<button class="btn-sm" title="Махни спирката" onclick="tfRemoveStop(' + i + ')">✕</button></div>';
    });
    h += '<div style="margin:0 0 6px 16px;"><button id="trf-add-stop" class="btn-sm" onclick="tfAddStop()">+ Спирка</button></div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:12px;">' +
        '<span style="font-size:13px;">🏁 Крайна точка</span>' +
        '<select id="trf-end" onchange="tfSetField(\'end_store\',this.value,true)" style="' + TF_FLD + '">' + tfStoreOptions(f.end_store, [f.from_store]) + '</select></div>';
  } else {
    h += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<label style="font-size:12px;">Фирма<br><select id="trf-company" onchange="tfSetField(\'courier_company\',this.value)" style="' + TF_FLD + '">' +
        '<option value="">— избери —</option>' + TF_COURIERS.map(function (c) {
          return '<option value="' + c + '"' + (c === f.courier_company ? ' selected' : '') + '>' + c + '</option>';
        }).join('') + '</select></label>' +
      '<label style="font-size:12px;">№ товарителница<br><input id="trf-waybill" value="' + tfAttr(f.waybill_no) + '" oninput="tfSetField(\'waybill_no\',this.value)" style="' + TF_FLD + '"></label>' +
      '<label style="font-size:12px;">Получател<br><select id="trf-end" onchange="tfSetField(\'end_store\',this.value,true)" style="' + TF_FLD + '">' + tfStoreOptions(f.end_store, [f.from_store]) + '</select></label>' +
    '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Куриерът е винаги от ' + escVal(f.from_store || 'обекта') + ' до получателя — без спирки и прехвърляния.</div>';
  }

  /* Товари */
  var routeStops = tfRouteStops(f);
  h += '<div style="font-size:12px;font-weight:700;margin:4px 0 6px;">Товари</div>';
  f.cargo.forEach(function (c, i) {
    h += '<div class="trf-cargo" data-i="' + i + '" style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:8px;background:#f8fafc;">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">' +
        '<b style="font-size:13px;">#' + (i + 1) + '</b>' +
        '<label style="font-size:12px;">Вид<br><select class="trf-kind" onchange="tfSetCargo(' + i + ',\'kind\',this.value)" style="' + TF_FLD + '">' +
          TF_KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === c.kind ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') +
        '</select></label>' +
        '<label style="font-size:12px;">Брой<br><input class="trf-qty" type="number" min="1" step="1" value="' + tfAttr(String(c.qty)) + '" oninput="tfSetCargo(' + i + ',\'qty\',this.value)" style="' + TF_FLD + 'width:70px;"></label>' +
        '<label style="font-size:12px;">Краен получател<br>' +
          (courier
            ? '<b class="trf-recipient-fixed" style="font-size:13px;">' + escVal(f.end_store || '— избери получател горе —') + '</b>'
            : '<select class="trf-recipient" onchange="tfSetCargo(' + i + ',\'recipient_store\',this.value,true)" style="' + TF_FLD + '">' + tfStoreOptions(c.recipient_store, [f.from_store]) + '</select>') +
        '</label>' +
        '<label style="font-size:12px;flex:1;min-width:160px;">Забележка<br><input class="trf-note" value="' + tfAttr(c.note) + '" oninput="tfSetCargo(' + i + ',\'note\',this.value)" style="' + TF_FLD + 'width:100%;box-sizing:border-box;"></label>' +
        (f.cargo.length > 1 ? '<button class="btn-sm trf-remove-cargo" title="Махни товара" onclick="tfRemoveCargo(' + i + ')">✕</button>' : '') +
      '</div>';

    if (!courier) {
      h += '<div style="margin-top:8px;font-size:12px;">Точки на прехвърляне <span style="color:#94a3b8;">(само където товарът се разтоварва и чака)</span></div>';
      c.transfer_points.forEach(function (p, j) {
        h += '<div style="display:flex;gap:6px;align-items:center;margin:4px 0 0 12px;">' +
          '<span style="font-size:12px;color:#64748b;">' + (j + 1) + '.</span>' +
          '<select class="trf-point" data-j="' + j + '" onchange="tfSetPoint(' + i + ',' + j + ',this.value)" style="' + TF_FLD + '">' + tfStoreOptions(p, [f.from_store]) + '</select>' +
          '<button class="btn-sm" onclick="tfRemovePoint(' + i + ',' + j + ')">✕</button></div>';
      });
      h += '<div style="margin:4px 0 0 12px;"><button class="btn-sm trf-add-point" onclick="tfAddPoint(' + i + ')">+ Точка на прехвърляне</button></div>';
      var first = c.transfer_points[0] || c.recipient_store;
      if (first && routeStops.indexOf(first) < 0) {
        h += '<div class="trf-cargo-warn" style="margin-top:6px;font-size:12px;color:#b91c1c;">⚠️ ' + escVal(first) +
          ' не е спирка на този транспорт — добави я в маршрута или точка на прехвърляне по пътя.</div>';
      }
    }

    /* Връзки */
    h += '<details style="margin-top:8px;"' + (tfCargoHasLinks(c) ? ' open' : '') + '><summary style="font-size:12px;cursor:pointer;">🔗 Връзки</summary>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">' +
        tfLinkPicker(i, 'co', 'Клиентски поръчки', c.client_order_ids, tfCoOpts) +
        tfLinkPicker(i, 'to', 'Транспортни заявки', c.transport_order_ids, tfToOpts) +
        '<label style="font-size:12px;">№ рекламация <span style="color:#94a3b8;">(със запетая)</span><br><input class="trf-claims" value="' + tfAttr(c.claims) + '" oninput="tfSetCargo(' + i + ',\'claims\',this.value)" style="' + TF_FLD + '"></label>' +
        '<label style="font-size:12px;">Стокова разписка / изх. №<br><input class="trf-goods" value="' + tfAttr(c.goods_doc) + '" oninput="tfSetCargo(' + i + ',\'goods_doc\',this.value)" style="' + TF_FLD + '"></label>' +
        (tfLlOpts.length ? '<label style="font-size:12px;">Ред от товарен лист<br><select class="trf-ll" onchange="tfSetCargo(' + i + ',\'loading_item_id\',this.value)" style="' + TF_FLD + 'max-width:260px;">' +
          '<option value="">—</option>' + tfLlOpts.map(function (o) {
            return '<option value="' + tfAttr(o.id) + '"' + (o.id === c.loading_item_id ? ' selected' : '') + '>' + escVal(o.label) + '</option>';
          }).join('') + '</select></label>' : '') +
      '</div></details>';
    h += '</div>';
  });
  h += '<button id="trf-add-cargo" class="btn-sm" onclick="tfAddCargo()">+ Товар</button>';

  h += '<div style="margin-top:12px;"><label style="font-size:12px;">Бележка към транспорта<br>' +
    '<textarea id="trf-tnote" rows="2" oninput="tfSetField(\'note\',this.value)" style="' + TF_FLD + 'width:100%;box-sizing:border-box;">' + escVal(f.note) + '</textarea></label></div>';

  h += '<div id="trf-error" style="color:#b91c1c;font-size:13px;margin-top:8px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button id="trf-cancel" class="btn-sm" onclick="closeTransferForm()">Откажи</button>' +
      '<button id="trf-save" class="btn btn-green"' + (tfSaving ? ' disabled' : '') + ' onclick="submitTransfer()">' + (tfSaving ? '⏳ Записвам…' : 'Запиши') + '</button>' +
    '</div></div>';

  wrap.innerHTML = h;
}

function tfCargoHasLinks(c) {
  return c.client_order_ids.length || c.transport_order_ids.length || c.claims || c.goods_doc || c.loading_item_id;
}

/* Поле с datalist + чипове. Избраното отива в масива по id; етикетът е
   само за очите. Стойност, която не е от списъка, не се приема. */
function tfLinkPicker(i, kind, title, ids, opts) {
  var dl = 'trf-dl-' + kind + '-' + i;
  return '<div style="font-size:12px;min-width:220px;">' + title + '<br>' +
    '<input class="trf-link-' + kind + '" list="' + dl + '" placeholder="търси…" onchange="tfPickLink(' + i + ',\'' + kind + '\',this)" style="' + TF_FLD + 'width:220px;">' +
    '<datalist id="' + dl + '">' + opts.map(function (o) { return '<option value="' + tfAttr(o.label) + '">'; }).join('') + '</datalist>' +
    '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">' + ids.map(function (id, j) {
      return '<span class="trf-chip-' + kind + '" style="background:#e0e7ff;color:#3730a3;border-radius:10px;padding:2px 8px;font-size:11px;">' +
        escVal(tfOptLabel(opts, id)) + ' <a href="javascript:void(0)" onclick="tfUnlink(' + i + ',\'' + kind + '\',' + j + ')" style="color:#3730a3;text-decoration:none;">✕</a></span>';
    }).join('') + '</div></div>';
}

function tfLinkField(kind) { return kind === 'co' ? 'client_order_ids' : 'transport_order_ids'; }

function tfPickLink(i, kind, el) {
  if (!tfForm || !tfForm.cargo[i]) return;
  var opts = kind === 'co' ? tfCoOpts : tfToOpts;
  var val = (el.value || '').trim();
  var hit = opts.filter(function (o) { return o.label === val; })[0];
  if (!hit) { if (val) toast('Избери от списъка', '#dc2626'); el.value = ''; return; }
  var arr = tfForm.cargo[i][tfLinkField(kind)];
  if (arr.indexOf(hit.id) < 0) arr.push(hit.id);
  renderTransferForm();
}

function tfUnlink(i, kind, j) {
  if (!tfForm || !tfForm.cargo[i]) return;
  tfForm.cargo[i][tfLinkField(kind)].splice(j, 1);
  renderTransferForm();
}

/* ── Промени във формата ─────────────────────────────────────────────────── */

function tfSetField(k, v, rerender) {
  if (!tfForm) return;
  tfForm[k] = v;
  if (k === 'from_store') tfLoadLinkOptions();
  if (rerender) renderTransferForm();
}

function tfSetMode(m) {
  if (!tfForm) return;
  tfForm.mode = m;
  if (m === 'courier') {
    /* Куриерът е А→Б: спирките и прехвърлянията нямат смисъл. Махат се
       веднага, за да не заминат незабелязано в записа. */
    tfForm.stops = [];
    tfForm.cargo.forEach(function (c) { c.transfer_points = []; });
  }
  renderTransferForm();
}

function tfAddStop() { if (tfForm) { tfForm.stops.push(''); renderTransferForm(); } }
function tfSetStop(i, v) { if (tfForm) { tfForm.stops[i] = v; renderTransferForm(); } }
function tfRemoveStop(i) { if (tfForm) { tfForm.stops.splice(i, 1); renderTransferForm(); } }

function tfAddCargo() { if (tfForm) { tfForm.cargo.push(tfNewCargo()); renderTransferForm(); } }
function tfRemoveCargo(i) { if (tfForm && tfForm.cargo.length > 1) { tfForm.cargo.splice(i, 1); renderTransferForm(); } }
function tfSetCargo(i, k, v, rerender) {
  if (!tfForm || !tfForm.cargo[i]) return;
  tfForm.cargo[i][k] = v;
  if (rerender) renderTransferForm();
}
function tfAddPoint(i) { if (tfForm && tfForm.cargo[i]) { tfForm.cargo[i].transfer_points.push(''); renderTransferForm(); } }
function tfSetPoint(i, j, v) { if (tfForm && tfForm.cargo[i]) { tfForm.cargo[i].transfer_points[j] = v; renderTransferForm(); } }
function tfRemovePoint(i, j) { if (tfForm && tfForm.cargo[i]) { tfForm.cargo[i].transfer_points.splice(j, 1); renderTransferForm(); } }

/* ── Валидация ───────────────────────────────────────────────────────────── */

/* Връща текст на първата грешка или null. Чиста функция върху формата —
   тестът я вика направо. */
function tfValidate(f) {
  if (!f) return 'Няма форма';
  if (!f.from_store) return 'Избери от кой обект тръгва транспортът.';
  if (f.mode !== 'bus' && f.mode !== 'courier') return 'Избери вид — бус или куриер.';
  if (!f.end_store) return f.mode === 'courier' ? 'Избери получател.' : 'Избери крайна точка.';
  if (f.end_store === f.from_store) return 'Крайната точка не може да е началният обект.';

  if (f.mode === 'bus') {
    if (!f.depart_date) return 'Въведи дата на тръгване.';
    if (!f.depart_time) return 'Въведи час на тръгване.';
    var seen = {};
    for (var s = 0; s < f.stops.length; s++) {
      var st = f.stops[s];
      if (!st) return 'Спирка ' + (s + 1) + ' е празна — избери обект или я махни.';
      if (st === f.from_store || st === f.end_store) return 'Спирка ' + (s + 1) + ' повтаря началото или крайната точка.';
      if (seen[st]) return 'Спирка „' + st + '" е два пъти в маршрута.';
      seen[st] = 1;
    }
  } else {
    if (TF_COURIERS.indexOf(f.courier_company) < 0) return 'Избери куриерска фирма.';
    if (f.stops && f.stops.length) return 'Куриерът е без спирки.';
  }

  if (!f.cargo || !f.cargo.length) return 'Добави поне един товар.';
  var route = tfRouteStops(f);
  for (var i = 0; i < f.cargo.length; i++) {
    var c = f.cargo[i], n = 'Товар #' + (i + 1) + ': ';
    if (!TF_KINDS.some(function (k) { return k[0] === c.kind; })) return n + 'избери вид.';
    var q = Number(c.qty);
    if (!(q >= 1) || Math.floor(q) !== q) return n + 'бройката трябва да е цяло число ≥ 1.';
    var rec = f.mode === 'courier' ? f.end_store : c.recipient_store;
    if (!rec) return n + 'избери краен получател.';
    if (rec === f.from_store) return n + 'получателят не може да е началният обект.';
    var pts = c.transfer_points || [];
    if (f.mode === 'courier') {
      if (pts.length) return n + 'куриерът е без точки на прехвърляне.';
      if (c.recipient_store && c.recipient_store !== f.end_store) return n + 'куриерът има един получател — ' + f.end_store + '.';
      continue;
    }
    var pseen = {};
    for (var j = 0; j < pts.length; j++) {
      if (!pts[j]) return n + 'точка на прехвърляне ' + (j + 1) + ' е празна.';
      if (pts[j] === rec) return n + 'получателят не е точка на прехвърляне.';
      if (pts[j] === f.from_store) return n + 'началният обект не е точка на прехвърляне.';
      if (pseen[pts[j]]) return n + '„' + pts[j] + '" е два пъти.';
      pseen[pts[j]] = 1;
    }
    var first = pts[0] || rec;
    if (route.indexOf(first) < 0) {
      return n + (pts.length ? 'първата точка на прехвърляне' : 'получателят') + ' „' + first +
        '" трябва да е спирка или крайна точка на този транспорт.';
    }
  }
  return null;
}

/* ── Запис ───────────────────────────────────────────────────────────────── */

function tfSplitClaims(s) {
  return String(s || '').split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
}

function submitTransfer() {
  if (!tfForm || tfSaving) return;
  var f = tfForm;
  var err = tfValidate(f);
  var errEl = document.getElementById('trf-error');
  if (err) { if (errEl) errEl.textContent = err; toast(err, '#dc2626'); return; }

  var courier = f.mode === 'courier';
  /* transfer_num НЕ се подава: номерът го раздава тригерът и се чете от
     отговора. Подаден, пак би бил игнориран. */
  var head = {
    from_store: f.from_store,
    mode: f.mode,
    depart_date: courier ? null : f.depart_date,
    depart_time: courier ? null : f.depart_time,
    driver: courier ? null : (f.driver.trim() || null),
    stops: courier ? [] : f.stops.slice(),
    end_store: f.end_store,
    courier_company: courier ? f.courier_company : null,
    waybill_no: courier ? (f.waybill_no.trim() || null) : null,
    status: 'planned',
    note: f.note.trim() || null,
    created_by: (currentUser && (currentUser.display_name || currentUser.email)) || null
  };

  tfSaving = true;
  renderTransferForm();

  sbPostReturn('transfers', head).then(function (res) {
    if (!res.ok || !res.row || !res.row.id) {
      tfSaving = false; renderTransferForm();
      toast('Грешка при запис на транспорта: ' + sbErrMsg(res), '#dc2626');
      return;
    }
    var t = res.row;
    var body = f.cargo.map(function (c, i) {
      return {
        transfer_id: t.id,
        position: i + 1,
        kind: c.kind,
        qty: parseInt(c.qty, 10),
        recipient_store: courier ? f.end_store : c.recipient_store,
        transfer_points: courier ? [] : c.transfer_points.slice(),
        note: (c.note || '').trim() || null,
        client_order_ids: c.client_order_ids.slice(),
        transport_order_ids: c.transport_order_ids.slice(),
        claim_numbers: tfSplitClaims(c.claims),
        goods_doc: (c.goods_doc || '').trim() || null,
        loading_item_id: c.loading_item_id || null
      };
    });
    return sbPost('transfer_cargo', body).then(function (r2) {
      if (!r2.ok) {
        /* Транспорт без товари е безсмислен и заблуждава получателите —
           заглавието се трие. Номерът остава изразходван: броячът не се
           връща назад, също като при клиентските заявки. */
        return sbDelete('transfers', 'id=eq.' + t.id).then(function () {
          tfSaving = false; renderTransferForm();
          toast('Грешка при запис на товарите — транспортът не е създаден: ' + sbErrMsg(r2), '#dc2626');
        });
      }
      tfSaving = false;
      toast('✅ Създаден транспорт ' + (t.transfer_num || ''));
      tfForm = null;
      loadTransfers();
    });
  }).catch(function () {
    tfSaving = false; renderTransferForm();
    toast('Грешка при запис', '#dc2626');
  });
}

/* ── Печат ───────────────────────────────────────────────────────────────── */

function printTransfer(id) {
  var t = tfTransfers.filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  var cargo = tfCargoByTransfer[id] || [];
  /* Номерата на свързаните клиентски поръчки — само за печата. */
  var coIds = [];
  cargo.forEach(function (c) { (c.client_order_ids || []).forEach(function (x) { if (coIds.indexOf(x) < 0) coIds.push(x); }); });
  var p = coIds.length
    ? sbGet('client_orders', 'select=id,in_num&id=in.(' + coIds.join(',') + ')')
    : Promise.resolve([]);
  p.then(function (rows) {
    var num = {};
    (Array.isArray(rows) ? rows : []).forEach(function (r) { num[r.id] = r.in_num; });
    renderTransferPrint(t, cargo, num);
    showModule('print');
  });
}

function renderTransferPrint(t, cargo, coNum) {
  var wrap = document.getElementById('mod-print');
  if (!wrap) return;
  coNum = coNum || {};
  var CSS =
    '@media print{@page{size:A4 portrait;margin:10mm;}.no-print{display:none!important;}body{margin:0;padding:0;}.tp-wrap{max-width:none!important;padding:0!important;}}' +
    '.tf-p{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111;width:190mm;max-width:190mm;margin:0 auto;}' +
    '.tf-title{font-size:15pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:1mm;}' +
    '.tf-num{font-size:13pt;font-weight:700;margin-bottom:4mm;}' +
    '.tf-kv{width:100%;border-collapse:collapse;margin-bottom:4mm;}' +
    '.tf-kv td{padding:.6mm 0;font-size:9.5pt;vertical-align:top;white-space:normal;}' +
    '.tf-kv td:first-child{width:40mm;font-weight:600;}' +
    '.tf-tbl{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:6mm;}' +
    '.tf-tbl th,.tf-tbl td{border:1px solid #444;padding:1.2mm 1mm;font-size:8.5pt;vertical-align:top;text-align:left;white-space:normal;box-sizing:border-box;}' +
    '.tf-tbl tr:last-child td{border-bottom:1px solid #444;}' +
    '.tf-tbl th{background:#eee;}' +
    '.tf-sign{display:flex;justify-content:space-between;gap:10mm;margin-top:8mm;font-size:9pt;}' +
    '.tf-sign div{flex:1;border-top:1px dotted #999;padding-top:2mm;}';

  var kv = function (k, v) { return v ? '<tr><td>' + k + '</td><td>' + escVal(v) + '</td></tr>' : ''; };
  var courier = t.mode === 'courier';
  var head = '<table class="tf-kv">' +
    kv('Вид', courier ? 'Куриер · ' + (t.courier_company || '') : 'Бус') +
    (courier ? kv('№ товарителница', t.waybill_no) : kv('Дата / час', tfDateLabel(t))) +
    (courier ? '' : kv('Шофьор', t.driver)) +
    kv('Маршрут', tfRouteText(t)) +
    kv('Статус', TF_STATUS_LABELS[t.status] || t.status) +
    kv('Бележка', t.note) +
    kv('Създаден от', t.created_by) +
    '</table>';

  var rows = cargo.map(function (c, i) {
    var links = [];
    (c.client_order_ids || []).forEach(function (id) { links.push('КЗ ' + (coNum[id] || '—')); });
    if ((c.transport_order_ids || []).length) links.push('ТЗ ×' + c.transport_order_ids.length);
    (c.claim_numbers || []).forEach(function (x) { links.push('Рекл. ' + x); });
    if (c.goods_doc) links.push('СР ' + c.goods_doc);
    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + escVal(tfKindLabel(c.kind)) + '</td>' +
      '<td>' + escVal(String(c.qty)) + '</td>' +
      '<td><b>' + escVal(c.recipient_store) + '</b></td>' +
      '<td>' + escVal((c.transfer_points || []).join(' → ')) + '</td>' +
      '<td>' + escVal(links.join(', ')) + '</td>' +
      '<td>' + escVal(c.note) + '</td>' +
    '</tr>';
  }).join('');

  wrap.innerHTML = '<style>' + CSS + '</style>' +
    '<div class="tp-wrap" style="max-width:780px;margin:0 auto;padding:16px 16px 40px;">' +
      '<div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px;">' +
        '<button onclick="window.print()" class="btn btn-green">🖨 Принтирай</button>' +
        '<button onclick="showModule(\'transfers\')" class="btn-sm">← Обратно</button>' +
      '</div>' +
      '<div class="tf-p">' +
        '<div class="tf-title">Трансфер между обекти</div>' +
        '<div class="tf-num">' + escVal(t.transfer_num) + '</div>' +
        head +
        '<table class="tf-tbl"><colgroup><col style="width:7mm"><col style="width:16mm"><col style="width:11mm"><col style="width:34mm"><col style="width:40mm"><col style="width:48mm"><col style="width:34mm"></colgroup>' +
          '<thead><tr><th>#</th><th>Вид</th><th>Брой</th><th>Краен получател</th><th>Прехвърляне през</th><th>Връзки</th><th>Забележка</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>' +
        '<div class="tf-sign"><div>Предал: ………………………</div><div>Превозвач: ………………………</div><div>Приел: ………………………</div></div>' +
      '</div>' +
    '</div>';
}
