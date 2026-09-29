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
var TF_STATUS_LABELS = { planned: 'Планиран', partial: 'Частично изпълнен', done: 'Завършен' };
var TF_STATUS_COLORS = { planned: ['#eff6ff', '#1e40af'], partial: ['#fffbeb', '#92400e'], done: ['#f0fdf4', '#166534'] };

/* ── Етап 2: отметки по товар (transfer_cargo_events) ── */
var tfEvents = [];          /* събитията на видимите транспорти, по created_at */
var tfFilter = 'all';       /* 'all' | 'mine' (за потвърждение при мен) | 'problems' */
var tfCardId = null;        /* отворената карта на транспорт */
var tfEvForm = null;        /* прозорчето за отметка */
var TF_EVENT_LABELS = {
  unloaded: 'Разтоварен — чака прехвърляне',
  received: 'Получен',
  handed_to_courier: 'Предаден на куриер',
  problem: 'Проблем',
  resolved: 'Решен'
};
var TF_PROBLEM_KINDS = [['damaged', 'Повреден'], ['missing', 'Липсва'], ['incomplete', 'Непълен']];
/* Обекти без отчетен статус, които участват в трансферите. Сервиз Троян е
   извън isReportableStore (няма бюлетин), но приема и праща товари. */
var TF_EXTRA_STORES = ['Сервиз Троян'];

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

/* Обектите, между които се движи товар: отчетните обекти + двата склада +
   TF_EXTRA_STORES (Сервиз Троян). ЦО и обектите без акаунт не участват. */
function tfLoadStoreList() {
  return loadReportableStores().then(function (list) {
    var all = (Array.isArray(list) ? list.slice() : []);
    LOGISTICS_WAREHOUSES.concat(TF_EXTRA_STORES).forEach(function (w) { if (all.indexOf(w) < 0) all.push(w); });
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

function loadTransfers(keepView) {
  var wrap = document.getElementById('mod-transfers');
  if (!wrap) return;
  /* keepView — след отметка картата остава отворена; от менюто — списък. */
  if (!keepView) { tfView = 'list'; tfCardId = null; tfFilter = 'all'; }
  if (!keepView) wrap.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div>';

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
    if (!list.length) return [list, [], []];
    var ids = list.map(function (t) { return t.id; });
    return Promise.all([
      sbGet('transfer_cargo', 'transfer_id=in.(' + ids.join(',') + ')&order=position.asc'),
      sbGet('transfer_cargo_events', 'transfer_id=in.(' + ids.join(',') + ')&order=created_at.asc')
    ]).then(function (x) { return [list, Array.isArray(x[0]) ? x[0] : [], Array.isArray(x[1]) ? x[1] : []]; });
  }).then(function (r) {
    var byT = {};
    r[1].forEach(function (c) { (byT[c.transfer_id] = byT[c.transfer_id] || []).push(c); });
    /* Втора проверка в клиента — по същото правило, по което филтрира и
       заявката. Така видимостта не зависи само от синтаксиса на or=(). */
    var stores2 = tfMyStores();
    tfTransfers = r[0].filter(function (t) { return tfVisibleToStores(t, byT[t.id], stores2); });
    tfTransfers.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
    tfCargoByTransfer = byT;
    tfEvents = r[2] || [];
    renderTransfers();
  }).catch(function () {
    tfTransfers = []; tfCargoByTransfer = {}; tfEvents = [];
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
  if (tfView === 'card') { renderTransferCard(); return; }

  var qEl = document.getElementById('trf-search');
  var q = qEl ? qEl.value.trim() : '';
  var rows = tfTransfers.filter(function (t) { return tfMatches(t, q); });

  var h = '<div class="pg-title">🔁 Трансфери</div>' +
    '<div class="pg-sub">Транспорти между обекти — бус със спирки или куриер. Всеки товар има краен получател.</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">' +
      '<input id="trf-search" placeholder="🔍 Номер / получател / товарителница…" value="' + tfAttr(q) + '"' +
      ' oninput="renderTransfersKeepFocus()" style="flex:1;min-width:220px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 14px;font-size:13px;font-family:inherit;outline:none;">' +
      (tfCreatorStores().length ? '<button id="trf-new" class="btn btn-green" onclick="openTransferForm()">+ Нов транспорт</button>' : '') +
    '</div>' + tfFilterBarHtml();
  if (tfFilter === 'mine') { wrap.innerHTML = h + tfPendingHtml(q); return; }
  if (tfFilter === 'problems') { wrap.innerHTML = h + tfProblemsHtml(q); return; }
  h += '<div class="tbl-wrap"><table id="trf-table">' +
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
      '<td style="text-align:center;white-space:nowrap;" class="trf-progress">' + tfProgressLabel(t) + (pcs !== cargo.length ? ' <span style="color:#64748b;font-size:11px;">(' + pcs + ' бр.)</span>' : '') + '</td>' +
      '<td>' + tfStatusBadge(t) + '</td>' +
      '<td style="white-space:nowrap;"><button class="btn-sm trf-open" onclick="openTransferCard(\'' + tfAttr(t.id) + '\')">Отвори</button> ' +
        '<button class="btn-sm" onclick="printTransfer(\'' + tfAttr(t.id) + '\')">🖨 Печат</button></td>' +
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
    '.tf-head{display:flex;justify-content:space-between;align-items:flex-start;}' +
    '.tf-logo{height:24pt;width:auto;flex-shrink:0;margin-left:8mm;}' +
    '.tf-sign{display:flex;justify-content:space-between;gap:10mm;margin-top:8mm;font-size:9pt;}' +
    '.tf-sign div{flex:1;border-top:1px dotted #999;padding-top:2mm;}';

  var kv = function (k, v) { return v ? '<tr><td>' + k + '</td><td>' + escVal(v) + '</td></tr>' : ''; };
  var courier = t.mode === 'courier';
  var head = '<table class="tf-kv">' +
    kv('Вид', courier ? 'Куриер · ' + (t.courier_company || '') : 'Бус') +
    (courier ? kv('№ товарителница', t.waybill_no) : kv('Дата / час', tfDateLabel(t))) +
    (courier ? '' : kv('Шофьор', t.driver)) +
    kv('Маршрут', tfRouteText(t)) +
    kv('Статус', (TF_STATUS_LABELS[tfComputeStatus(t, cargo, tfEventsOf(t.id)).status] || t.status) + ' · ' + tfProgressLabel(t, cargo)) +
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

  /* История по товар — всички отметки по ред. */
  var hist = cargo.map(function (c, i) {
    var evs = tfEventsOf(t.id).filter(function (e) { return e.cargo_id === c.id; });
    if (!evs.length) return '';
    return '<tr><td>' + (i + 1) + '</td><td colspan="2">' + evs.map(function (e) {
      return escVal(tfFmtTs(e.created_at) + ' · ' + e.store_name + ' · ' + tfEventText(e) + tfPhotoPrintText(e));
    }).join('<br>') + '</td></tr>';
  }).join('');

  wrap.innerHTML = '<style>' + CSS + '</style>' +
    '<div class="tp-wrap" style="max-width:780px;margin:0 auto;padding:16px 16px 40px;">' +
      '<div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px;">' +
        '<button onclick="window.print()" class="btn btn-green">🖨 Принтирай</button>' +
        '<button onclick="showModule(\'transfers\')" class="btn-sm">← Обратно</button>' +
      '</div>' +
      '<div class="tf-p">' +
        '<div class="tf-head"><div><div class="tf-title">Трансфер между обекти</div>' +
        '<div class="tf-num">' + escVal(t.transfer_num) + '</div></div>' +
        '<img src="' + TF_PRINT_LOGO + '" class="tf-logo" alt="TeMAX"></div>' +
        head +
        '<table class="tf-tbl"><colgroup><col style="width:7mm"><col style="width:16mm"><col style="width:11mm"><col style="width:34mm"><col style="width:40mm"><col style="width:48mm"><col style="width:34mm"></colgroup>' +
          '<thead><tr><th>#</th><th>Вид</th><th>Брой</th><th>Краен получател</th><th>Прехвърляне през</th><th>Връзки</th><th>Забележка</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>' +
        (hist ? '<div style="font-weight:700;margin:0 0 2mm;">История на товарите</div>' +
          '<table class="tf-tbl tf-hist"><colgroup><col style="width:7mm"><col><col style="width:1mm"></colgroup>' +
          '<thead><tr><th>#</th><th colspan="2">Отметки</th></tr></thead><tbody>' + hist + '</tbody></table>' : '') +
        '<div class="tf-sign"><div>Предал: ………………………</div><div>Превозвач: ………………………</div><div>Приел: ………………………</div></div>' +
      '</div>' +
    '</div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   ЕТАП 2 — ОТМЕТКИ ПО ТОВАР (transfer_cargo_events)
   ═══════════════════════════════════════════════════════════════════════════

   Един ред на събитие. Видове:
     unloaded          „Разтоварен — чака прехвърляне" — САМО в първата точка
                       на прехвърляне на товара (следващата по маршрута му за
                       ТОЗИ транспорт);
     received          „Получен" — при крайния получател, когато товарът няма
                       прехвърляне в този транспорт;
     handed_to_courier „Предаден на куриер" — само куриер, изпращачът; снимка
                       ИЛИ № товарителница (записва се в транспорта, ако я
                       няма там);
     problem           „Проблем" — всеки обект по маршрута на товара
                       (изпращач, точки на прехвърляне, получател); вид +
                       задължителен коментар. НЕ спира товара;
     resolved          „Решен" — затваря проблем; изпращачът или админ.
   Обект, през който товарът само минава, НЕ отбелязва нищо (Теодор, 29.09).
   Товар с брой > 1 — една отметка за целия; липсващ палет = „Проблем".

   КРАЙНАТА ОТМЕТКА ЗА ТОЗИ ТРАНСПОРТ е unloaded в първата точка или
   received при получателя — tfCargoTarget(). Статусът на транспорта:
   Планиран (нито една отметка) → Частично изпълнен (поне една) → Завършен
   (всеки товар има крайната си отметка). Смята се в tfComputeStatus() и се
   ЗАПИСВА в transfers.status след всяка отметка (tfSyncStatus), за да го
   четат отчетите без преизчисляване.

   Самото прехвърляне към нов транспорт е етап 3 — тук товарът само показва
   „чака прехвърляне в <обект>". */

var TF_PRINT_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAqCAIAAABDSv52AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAFGklEQVR42u1YW2hcVRRde59z7507M5lkkia1tS9atTRqa4kgaD8UHyBqqVAMgtQHKIJIP9ovoVToTxEKRX/8ED9ExEKRCoIUaREflFIUtahVsNbUhqbmNTOZuc9zth95OElnkpi2mkLP14V7zr7rnrPW2nsf2tB9BxbHYAAi8j8iEJFxAAyAiOacfe1wTD3r+SyYE+uCR31kxqIZ1zmUa0Qdnp3VC6bO7HAbxtfXiKezR2j49gZtr1co/302aAyFRBTAQDPuEUAi9YjroYsIREgEIuPRMI8fa6AgAUImCzDIgWg7Hm+aQ6dAzOyLgAgiDNj6/yNKAENwBQwkRBBxgNnhqM7OrmmnQqRENkTmlihttZISSopZJtImABJUFbUbWR8nF7XSQMJUIQLImdywkNBh7KrEjDFHJDelooGASQECWAikgZz1jNOqELYEyXt9owYAUFJ8vMXd15k3zAoAEBNui9KDF0oxYduadhGsic091fhkzv3DVY4gJKxMzDt9o2uj9P2O7M7lrbsHy3fXkt5VRQJyxr52qXKgq2VQsyPT9olnWI8CjTErK64VAJ2p7R2q3V+NA0IEWCBkenG42l2LFJA3NmC8Mljd1z+6Z6BigAhYG6WHzw3fnBom3BqljpWfPd1TjW4PkwHNz44EW8sRNRLFNCgWyIj86unXlxW+zrtacNrXz68unsloC6xO0oKxFmhNxRJ1pRZATy15rBRaUgpQIjWmp0rBqKJDbb4IIuaMyPcZB8wbw3RzkLw8OHbW08OKtcwUbAPaKuDNjtyAovsqUYvFVzm3wrR7sPrSUO2XjO5dVWw1lkBLUvt4OdpaCQOmFmPLTDUiV+ThsXhvZ36pAYkd1GSBPx0+lXWeHgm2lwLXypc5p6y43YqZngq4kZLRIrI6tQCGNSKi3tFw919j/a76uJARQU4sATGwv780qPmnjBaRfs0ZKztGasXU3hmZJyqhZXVvNdkcJkNaHW7NdAfJplpSdvWHrX7WznVAUyMlKhoL4FjOCwkvjATG4t02/2BHtsNYQ/RR0fetOdnivdWeWxenBPzu6RWp2XNxrJCaXQPlLZXIElWZzjtqfZg8N1QDoab41eUt3/qObiRs3dC/SGRpakH4NO/lLbLWKpHHKlFe8EnBM6C327PH8t6JrLs+TJbE9kzW/SznDbjqtO/84Osv8t72UvjoSG3XsuKQ4qN9Qxui9POC11NL2lP7ZCXqc9Q5R7l1gBofkAU8kTVxeqiYPesqgrzRlf/NdzYFaUAoExnAEB0pZC44/GA1vuTwzuWFc67qDhNDsr8z/0Gbf97ho23+dxlnY2xO5dxH1i15ZmXxQGdu76Wxh8aiIUXq8h24vA8SQIk8UI2OZ92USIOqjLwVAkpMOSvbKuGxnFdVHBPtGKme8N0fPa0JPUGyIjZHCpmcyF1B/I3vpgQNqhIU4AsCpqKxJSYGZphKEygiAEImf3IuCwxNQBSigODJRIYKCErgCSwhBVKCLxAgAlwRAjC58xZgIJnkxLy4Mu7JWSsyac6WJugt018JkBUIYAkAtIgjJAQBMjI5R8ROxQF080zUvLadniSkLoSdTqx/hEkkNJGGppbPSDa2eYqeb+lU79T10RdQ1jRbMt8yu1nZ/G8L8lnm36htb0BZxFCaKYivcD1m7a7njFbfPPOCHWJ8vixIz1fUMzdzGpp09wV3+VOR+arcHlyVG7LFoiAR4UWCY+a9rSxIDvP/4OyS/BsnQaRclmJE7gAAAABJRU5ErkJggg==';
/* Логото е КОПИЕ на LL_PRINT_LOGO (loading.js), по същата причина като там:
   вграденото base64 не зависи от мрежата, а печатът — от друг модул. */

function tfEventsOf(transferId) {
  return tfEvents.filter(function (e) { return e && e.transfer_id === transferId; });
}
function tfCargoEvents(evs, cargoId) {
  return (evs || []).filter(function (e) { return e && e.cargo_id === cargoId; });
}

/* Къде и с какво приключва товарът В ТОЗИ транспорт. */
function tfCargoTarget(c) {
  var pts = (c && c.transfer_points) || [];
  if (pts.length) return { store: pts[0], event: 'unloaded' };
  return { store: c ? c.recipient_store : null, event: 'received' };
}
function tfCargoDone(c, evs) {
  var tg = tfCargoTarget(c);
  return tfCargoEvents(evs, c.id).some(function (e) { return e.event === tg.event && e.store_name === tg.store; });
}
function tfOpenProblems(c, evs) {
  var mine = tfCargoEvents(evs, c.id);
  var closed = {};
  mine.forEach(function (e) { if (e.event === 'resolved' && e.resolves_id) closed[e.resolves_id] = 1; });
  return mine.filter(function (e) { return e.event === 'problem' && !closed[e.id]; });
}
/* Обектите по маршрута на товара — само те отбелязват проблем. */
function tfCargoRouteStores(t, c) {
  return [t.from_store].concat((c && c.transfer_points) || []).concat([c && c.recipient_store]).filter(Boolean);
}
function tfIsAdmin() { return !!currentUser && currentUser.role === 'admin'; }
/* От името на кои обекти потребителят отбелязва. Глобалните роли не са
   обект и не потвърждават вместо обекта — само админът решава проблеми. */
function tfActorStores() {
  if (!currentUser || isGlobal()) return [];
  var st = assignedStores();
  return (st || []).filter(Boolean);
}

/* Може ли store да отбележи kind за товар c от транспорт t. null = да,
   иначе текст на причината. Едно правило за бутоните, за записа и за теста. */
function tfEventAllowed(kind, t, c, evs, store, isAdmin) {
  if (!t || !c) return 'Няма товар';
  var tg = tfCargoTarget(c);
  var done = tfCargoDone(c, evs);
  if (kind === 'unloaded' || kind === 'received') {
    if (tg.event !== kind) return kind === 'received'
      ? 'Товарът се разтоварва в ' + tg.store + ' — не се получава в този транспорт.'
      : 'Товарът няма прехвърляне в този транспорт.';
    if (store !== tg.store) return 'Това се отбелязва от ' + tg.store + '.';
    if (done) return 'Вече е отбелязано.';
    return null;
  }
  if (kind === 'handed_to_courier') {
    if (t.mode !== 'courier') return 'Само при куриер.';
    if (store !== t.from_store) return 'Отбелязва изпращачът — ' + t.from_store + '.';
    if (tfCargoEvents(evs, c.id).some(function (e) { return e.event === 'handed_to_courier'; })) return 'Вече е предаден.';
    if (done) return 'Товарът вече е получен.';
    return null;
  }
  if (kind === 'problem') {
    return tfCargoRouteStores(t, c).indexOf(store) >= 0 ? null : 'Само обект по маршрута на товара.';
  }
  if (kind === 'resolved') {
    if (!(isAdmin || store === t.from_store)) return 'Решава изпращачът или админ.';
    return tfOpenProblems(c, evs).length ? null : 'Няма отворен проблем.';
  }
  return 'Непознат вид отметка.';
}

/* Какво може да натисне текущият потребител за товара — [{kind, store}]. */
function tfActionsFor(t, c, evs) {
  var out = [], seen = {};
  var add = function (kind, store) { if (!seen[kind]) { seen[kind] = 1; out.push({ kind: kind, store: store }); } };
  tfActorStores().forEach(function (s) {
    ['unloaded', 'received', 'handed_to_courier', 'problem', 'resolved'].forEach(function (k) {
      if (!tfEventAllowed(k, t, c, evs, s, false)) add(k, s);
    });
  });
  if (tfIsAdmin() && !tfEventAllowed('resolved', t, c, evs, currentUser.store_name, true)) add('resolved', currentUser.store_name);
  return out;
}

/* Задължителните полета на прозорчето. null = наред. */
function tfValidateEvent(kind, f, t) {
  f = f || {};
  var comment = String(f.comment || '').trim();
  if (kind === 'problem') {
    if (!TF_PROBLEM_KINDS.some(function (p) { return p[0] === f.problem_kind; })) return 'Избери вид на проблема.';
    if (!comment) return 'Опиши проблема в коментара.';
  }
  if (kind === 'handed_to_courier') {
    var wb = String(f.waybill_no || (t && t.waybill_no) || '').trim();
    if (!(f.photos && f.photos.length) && !wb) return 'Прикачи снимка или въведи № товарителница.';
  }
  return null;
}

/* Статус и прогрес на транспорта. */
function tfComputeStatus(t, cargo, evs) {
  cargo = cargo || [];
  var done = cargo.filter(function (c) { return tfCargoDone(c, evs); }).length;
  var status = !(evs && evs.length) ? 'planned' : (cargo.length && done === cargo.length ? 'done' : 'partial');
  return { status: status, done: done, total: cargo.length };
}
function tfProgressLabel(t, cargo) {
  var st = tfComputeStatus(t, cargo || tfCargoByTransfer[t.id] || [], tfEventsOf(t.id));
  return st.done + '/' + st.total + (st.total === 1 ? ' товар' : ' товара');
}
function tfStatusBadge(t) {
  var st = tfComputeStatus(t, tfCargoByTransfer[t.id] || [], tfEventsOf(t.id)).status;
  var c = TF_STATUS_COLORS[st] || TF_STATUS_COLORS.planned;
  return '<span class="badge trf-status" data-status="' + st + '" style="background:' + c[0] + ';color:' + c[1] + ';">' +
    escVal(TF_STATUS_LABELS[st] || st) + '</span>';
}

function tfFmtTs(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function tfEventText(e) {
  var t = TF_EVENT_LABELS[e.event] || e.event;
  if (e.event === 'problem') {
    var k = TF_PROBLEM_KINDS.filter(function (p) { return p[0] === e.problem_kind; })[0];
    if (k) t += ' (' + k[1].toLowerCase() + ')';
  }
  if (e.waybill_no) t += ' · № ' + e.waybill_no;
  if (e.comment) t += ' — ' + e.comment;
  return t;
}

/* Снимките на отметка — само адресите, които са http(s). */
function tfEventPhotos(e) {
  return ((e && e.photos) || []).filter(function (ph) { return ph && /^https?:\/\//.test(String(ph.url || '')); });
}
/* На екрана: миниатюра 40×40 на всяка снимка, кликаема към пълния размер в
   нов таб. Досега беше „📷 1 📷" — брояч в текста и емотикон-линк, които
   изглеждаха като украса, а не като снимка. */
function tfPhotoThumbs(e) {
  var ps = tfEventPhotos(e);
  if (!ps.length) return '';
  return ' <span class="trf-thumbs">' + ps.map(function (ph, i) {
    return '<a href="' + tfAttr(ph.url) + '" target="_blank" rel="noopener" class="trf-thumb" title="Снимка ' + (i + 1) + '">' +
      '<img src="' + tfAttr(ph.url) + '" alt="Снимка ' + (i + 1) + '" loading="lazy"' +
      ' style="width:40px;height:40px;object-fit:cover;border:1px solid #cbd5e1;border-radius:4px;vertical-align:middle;margin-left:4px;"></a>';
  }).join('') + '</span>';
}
/* В печата — текст „Снимка 1, Снимка 2", не миниатюра: външната снимка може
   да не е заредена, когато се отвори диалогът за печат, и листът излиза с
   празно място (затова и логото там е вградено, не по адрес). */
function tfPhotoPrintText(e) {
  var n = tfEventPhotos(e).length;
  if (!n) return '';
  var out = [];
  for (var i = 1; i <= n; i++) out.push('Снимка ' + i);
  return ' · ' + out.join(', ');
}

/* Състоянието на товара с думи — за картата и за „За потвърждение". */
function tfCargoStateText(t, c, evs) {
  var tg = tfCargoTarget(c);
  var mine = tfCargoEvents(evs, c.id);
  if (tfCargoDone(c, evs)) {
    return tg.event === 'unloaded' ? '⏸ чака прехвърляне в ' + tg.store : '✅ получен в ' + tg.store;
  }
  if (mine.some(function (e) { return e.event === 'handed_to_courier'; })) return '🚚 предаден на куриер';
  return '⏳ очаква се в ' + tg.store + (tg.event === 'unloaded' ? ' (прехвърляне)' : '');
}

/* ── Филтри ──────────────────────────────────────────────────────────────── */

function tfFilterBarHtml() {
  var b = function (key, label) {
    return '<button class="filter-btn trf-filter' + (tfFilter === key ? ' active' : '') + '" data-f="' + key + '" onclick="tfSetFilter(\'' + key + '\')">' + label + '</button>';
  };
  var nMine = tfPendingItems('').length, nProb = tfProblemItems('').length;
  return '<div class="filter-bar" style="margin:0 0 12px;">' +
    b('all', 'Всички') +
    b('mine', '📥 За потвърждение при мен' + (nMine ? ' (' + nMine + ')' : '')) +
    b('problems', '⚠️ Проблеми' + (nProb ? ' (' + nProb + ')' : '')) +
  '</div>';
}
function tfSetFilter(f) { tfFilter = f; renderTransfers(); }

/* Товари, очаквани в моя обект, без отметка — с бутоните според ролята. */
function tfPendingItems(q) {
  var out = [];
  tfTransfers.forEach(function (t) {
    if (!tfMatches(t, q)) return;
    var evs = tfEventsOf(t.id);
    (tfCargoByTransfer[t.id] || []).forEach(function (c, i) {
      var acts = tfActionsFor(t, c, evs).filter(function (a) {
        return a.kind === 'unloaded' || a.kind === 'received' || a.kind === 'handed_to_courier';
      });
      if (acts.length) out.push({ t: t, c: c, i: i, acts: acts });
    });
  });
  return out;
}
function tfProblemItems(q) {
  var out = [];
  tfTransfers.forEach(function (t) {
    if (!tfMatches(t, q)) return;
    var evs = tfEventsOf(t.id);
    (tfCargoByTransfer[t.id] || []).forEach(function (c, i) {
      tfOpenProblems(c, evs).forEach(function (p) { out.push({ t: t, c: c, i: i, p: p }); });
    });
  });
  return out;
}

function tfActBtn(t, c, a, extraCls) {
  var icon = { unloaded: '⏸', received: '✅', handed_to_courier: '🚚', problem: '⚠️', resolved: '✔' }[a.kind] || '';
  return '<button class="btn-sm trf-act trf-act-' + a.kind + (extraCls || '') + '" data-t="' + tfAttr(t.id) + '" data-c="' + tfAttr(c.id) + '"' +
    ' onclick="openEventModal(\'' + tfAttr(t.id) + '\',\'' + tfAttr(c.id) + '\',\'' + a.kind + '\')">' + icon + ' ' + escVal(TF_EVENT_LABELS[a.kind]) + '</button>';
}
function tfCargoLabel(c, i) {
  return '#' + (i + 1) + ' ' + tfKindLabel(c.kind) + (c.qty > 1 ? ' ×' + c.qty : '') + ' → ' + c.recipient_store;
}

function tfPendingHtml(q) {
  var items = tfPendingItems(q);
  if (!items.length) return '<div id="trf-pending" style="text-align:center;padding:30px;color:#94a3b8;">Нищо не чака потвърждение при теб.</div>';
  return '<div id="trf-pending">' + items.map(function (it) {
    var evs = tfEventsOf(it.t.id);
    var prob = tfActionsFor(it.t, it.c, evs).filter(function (a) { return a.kind === 'problem'; })[0];
    return '<div class="trf-pending-row" data-c="' + tfAttr(it.c.id) + '" style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:8px;background:#fff;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
        '<div><b>' + escVal(it.t.transfer_num) + '</b> · ' + escVal(tfModeLabel(it.t)) + ' · ' + escVal(tfRouteText(it.t)) +
        '<div style="font-size:13px;margin-top:2px;">' + escVal(tfCargoLabel(it.c, it.i)) + '</div>' +
        '<div class="trf-state" style="font-size:12px;color:#64748b;">' + escVal(tfCargoStateText(it.t, it.c, evs)) + '</div></div>' +
        '<div style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;">' +
          it.acts.map(function (a) { return tfActBtn(it.t, it.c, a); }).join('') +
          (prob ? tfActBtn(it.t, it.c, prob) : '') +
        '</div>' +
      '</div></div>';
  }).join('') + '</div>';
}

function tfProblemsHtml(q) {
  var items = tfProblemItems(q);
  if (!items.length) return '<div id="trf-problems" style="text-align:center;padding:30px;color:#94a3b8;">Няма отворени проблеми.</div>';
  return '<div id="trf-problems">' + items.map(function (it) {
    var evs = tfEventsOf(it.t.id);
    var res = tfActionsFor(it.t, it.c, evs).filter(function (a) { return a.kind === 'resolved'; })[0];
    return '<div class="trf-problem-row" data-e="' + tfAttr(it.p.id) + '" style="border:1px solid #fecaca;border-radius:8px;padding:10px;margin-bottom:8px;background:#fef2f2;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
        '<div><b>' + escVal(it.t.transfer_num) + '</b> · ' + escVal(tfCargoLabel(it.c, it.i)) +
        '<div style="font-size:13px;margin-top:2px;">⚠️ ' + escVal(it.p.store_name) + ' · ' + escVal(tfEventText(it.p)) + tfPhotoThumbs(it.p) + '</div>' +
        '<div style="font-size:11px;color:#64748b;">' + escVal(tfFmtTs(it.p.created_at)) + (it.p.created_by ? ' · ' + escVal(it.p.created_by) : '') + '</div></div>' +
        (res ? tfActBtn(it.t, it.c, res) : '') +
      '</div></div>';
  }).join('') + '</div>';
}

/* ── Карта на транспорта ─────────────────────────────────────────────────── */

function openTransferCard(id) { tfCardId = id; tfView = 'card'; renderTransfers(); }
function closeTransferCard() { tfCardId = null; tfView = 'list'; renderTransfers(); }

function renderTransferCard() {
  var wrap = document.getElementById('mod-transfers');
  var t = tfTransfers.filter(function (x) { return x.id === tfCardId; })[0];
  if (!wrap) return;
  if (!t) { tfView = 'list'; renderTransfers(); return; }
  var cargo = tfCargoByTransfer[t.id] || [];
  var evs = tfEventsOf(t.id);
  var h = '<div id="trf-card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
      '<div class="pg-title" style="margin:0;">🔁 ' + escVal(t.transfer_num) + ' ' + tfStatusBadge(t) +
        ' <span class="trf-progress" style="font-size:13px;color:#64748b;font-weight:400;">' + escVal(tfProgressLabel(t)) + '</span></div>' +
      '<div style="display:flex;gap:6px;"><button class="btn-sm" onclick="printTransfer(\'' + tfAttr(t.id) + '\')">🖨 Печат</button>' +
      '<button id="trf-card-back" class="btn-sm" onclick="closeTransferCard()">← Обратно</button></div>' +
    '</div>' +
    '<div style="font-size:13px;color:#334155;margin-bottom:12px;">' + escVal(tfModeLabel(t)) + ' · ' + escVal(tfDateLabel(t)) +
      (t.driver ? ' · шофьор ' + escVal(t.driver) : '') + (t.waybill_no ? ' · № ' + escVal(t.waybill_no) : '') +
      '<div style="margin-top:2px;">' + escVal(tfRouteText(t)) + '</div></div>';
  cargo.forEach(function (c, i) {
    var mine = tfCargoEvents(evs, c.id);
    var acts = tfActionsFor(t, c, evs);
    var open = tfOpenProblems(c, evs).length;
    h += '<div class="trf-card-cargo" data-c="' + tfAttr(c.id) + '" style="border:1px solid ' + (open ? '#fecaca' : '#e2e8f0') + ';border-radius:8px;padding:10px;margin-bottom:8px;background:#fff;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
        '<div><b>' + escVal(tfCargoLabel(c, i)) + '</b>' +
          ((c.transfer_points || []).length ? '<span style="font-size:12px;color:#64748b;"> · през ' + escVal(c.transfer_points.join(' → ')) + '</span>' : '') +
          '<div class="trf-state" style="font-size:12px;margin-top:2px;">' + escVal(tfCargoStateText(t, c, evs)) + (open ? ' · <b style="color:#b91c1c;">⚠️ отворен проблем</b>' : '') + '</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + acts.map(function (a) { return tfActBtn(t, c, a); }).join('') + '</div>' +
      '</div>' +
      (mine.length ? '<ol class="trf-history" style="margin:8px 0 0;padding-left:20px;font-size:12px;color:#334155;">' + mine.map(function (e) {
        return '<li>' + escVal(tfFmtTs(e.created_at)) + ' · <b>' + escVal(e.store_name) + '</b> · ' + escVal(tfEventText(e)) +
          tfPhotoThumbs(e) + '</li>';
      }).join('') + '</ol>' : '') +
    '</div>';
  });
  wrap.innerHTML = h + '</div>';
}

/* ── Прозорчето за отметка ───────────────────────────────────────────────── */

function tfFindCargo(tid, cid) {
  var t = tfTransfers.filter(function (x) { return x.id === tid; })[0];
  var c = t ? (tfCargoByTransfer[tid] || []).filter(function (x) { return x.id === cid; })[0] : null;
  return { t: t, c: c };
}

function openEventModal(tid, cid, kind) {
  var x = tfFindCargo(tid, cid);
  if (!x.t || !x.c) return;
  var act = tfActionsFor(x.t, x.c, tfEventsOf(tid)).filter(function (a) { return a.kind === kind; })[0];
  if (!act) { toast('Тази отметка не е за теб', '#dc2626'); return; }
  var probs = tfOpenProblems(x.c, tfEventsOf(tid));
  tfEvForm = { tid: tid, cid: cid, kind: kind, store: act.store, comment: '', problem_kind: '',
               waybill_no: kind === 'handed_to_courier' ? (x.t.waybill_no || '') : '',
               photos: [], uploading: 0, resolves_id: probs.length ? probs[0].id : null, saving: false };
  renderEventModal();
}
function closeEventModal() {
  tfEvForm = null;
  var ov = document.getElementById('tfe-ov');
  if (ov) ov.remove();
}
function tfEvSet(k, v) { if (tfEvForm) tfEvForm[k] = v; }

function renderEventModal() {
  var f = tfEvForm;
  if (!f) return;
  var x = tfFindCargo(f.tid, f.cid);
  var old = document.getElementById('tfe-ov');
  if (old) old.remove();
  var probs = f.kind === 'resolved' ? tfOpenProblems(x.c, tfEventsOf(f.tid)) : [];
  var h = '<div class="bmod" style="width:min(480px,94vw);">' +
    '<div style="font-weight:700;font-size:15px;margin-bottom:2px;">' + escVal(TF_EVENT_LABELS[f.kind]) + '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">' + escVal(x.t.transfer_num) + ' · ' +
      escVal(tfCargoLabel(x.c, (tfCargoByTransfer[f.tid] || []).indexOf(x.c))) + ' · от името на ' + escVal(f.store) + '</div>';
  if (f.kind === 'problem') {
    h += '<label class="fl">Вид *</label><select id="tfe-pkind" class="fi" onchange="tfEvSet(\'problem_kind\',this.value)">' +
      '<option value="">— избери —</option>' + TF_PROBLEM_KINDS.map(function (p) {
        return '<option value="' + p[0] + '"' + (f.problem_kind === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select>';
  }
  if (f.kind === 'resolved' && probs.length > 1) {
    h += '<label class="fl">Кой проблем</label><select id="tfe-resolves" class="fi" onchange="tfEvSet(\'resolves_id\',this.value)">' +
      probs.map(function (p) { return '<option value="' + tfAttr(p.id) + '"' + (f.resolves_id === p.id ? ' selected' : '') + '>' + escVal(p.store_name + ' · ' + tfEventText(p)) + '</option>'; }).join('') + '</select>';
  }
  if (f.kind === 'handed_to_courier') {
    h += '<label class="fl">№ товарителница' + (x.t.waybill_no ? '' : ' (записва се и в транспорта)') + '</label>' +
      '<input id="tfe-waybill" class="fi" value="' + tfAttr(f.waybill_no) + '"' + (x.t.waybill_no ? ' readonly' : '') +
      ' oninput="tfEvSet(\'waybill_no\',this.value)">';
  }
  h += '<label class="fl">Коментар' + (f.kind === 'problem' ? ' *' : '') + '</label>' +
    '<textarea id="tfe-comment" class="fi" rows="3" oninput="tfEvSet(\'comment\',this.value)">' + escVal(f.comment) + '</textarea>';
  if (f.kind !== 'resolved') {
    h += '<label class="fl">Снимка' + (f.kind === 'handed_to_courier' ? ' (или № товарителница)' : '') + '</label>' +
      '<input id="tfe-photo" type="file" accept="image/*" multiple onchange="tfEvUploadPhotos(this)">' +
      '<div id="tfe-photos" style="font-size:12px;color:#64748b;margin-top:4px;">' +
        (f.photos.length ? '📷 ' + f.photos.length + ' качени' : '') + (f.uploading ? ' ⏳ качва се…' : '') + '</div>';
  }
  h += '<div id="tfe-error" style="color:#b91c1c;font-size:13px;margin-top:8px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button class="btn-sm" onclick="closeEventModal()">Откажи</button>' +
      '<button id="tfe-save" class="btn btn-green"' + (f.saving || f.uploading ? ' disabled' : '') + ' onclick="submitEvent()">' + (f.saving ? '⏳ Записвам…' : 'Запиши') + '</button>' +
    '</div></div>';
  var ov = document.createElement('div');
  ov.id = 'tfe-ov'; ov.className = 'bov open';
  ov.innerHTML = h;
  document.body.appendChild(ov);
}

/* Снимките — в Storage по модела на Товарни листи / Разлики: bucket
   DIFF_BKT (stock-differences.js), префикс transfers/<транспорт>/, компресия
   с diffCompressImage. Редът се пише СЛЕД качването, тоест снимката вече е
   там, когато някой отвори историята. */
function tfEvUploadPhotos(input) {
  var f = tfEvForm;
  if (!f) return;
  var files = Array.prototype.slice.call(input.files || []);
  input.value = '';
  if (!files.length) return;
  if (typeof DIFF_SB === 'undefined' || typeof DIFF_BKT === 'undefined') { toast('Качването на снимки не е налично', '#dc2626'); return; }
  f.uploading += files.length;
  renderEventModal();
  files.forEach(function (file) {
    var compress = (typeof diffCompressImage === 'function') ? diffCompressImage(file, 1600, 0.75) : Promise.resolve(file);
    compress.then(function (blob) {
      var path = 'transfers/' + f.tid + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
      return fetch(DIFF_SB + '/storage/v1/object/' + DIFF_BKT + '/' + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + DIFF_KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: blob
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        f.photos.push({ url: DIFF_SB + '/storage/v1/object/public/' + DIFF_BKT + '/' + path, name: file.name || '' });
      });
    }).catch(function () {
      toast('⚠️ Снимка НЕ се качи — опитай пак', '#dc2626');
    }).then(function () {
      f.uploading = Math.max(0, f.uploading - 1);
      if (tfEvForm === f) renderEventModal();
    });
  });
}

function submitEvent() {
  var f = tfEvForm;
  if (!f || f.saving || f.uploading) return;
  var x = tfFindCargo(f.tid, f.cid);
  if (!x.t || !x.c) return;
  var evs = tfEventsOf(f.tid);
  /* Правото се проверява пак при записа — между отварянето и клика друг
     обект може да е отбелязал. */
  var why = tfEventAllowed(f.kind, x.t, x.c, evs, f.store, tfIsAdmin() && f.kind === 'resolved');
  var err = why || tfValidateEvent(f.kind, f, x.t);
  var errEl = document.getElementById('tfe-error');
  if (err) { if (errEl) errEl.textContent = err; toast(err, '#dc2626'); return; }

  var wb = String(f.waybill_no || '').trim();
  var row = {
    cargo_id: x.c.id, transfer_id: x.t.id, store_name: f.store, event: f.kind,
    problem_kind: f.kind === 'problem' ? f.problem_kind : null,
    comment: String(f.comment || '').trim() || null,
    photos: f.photos.slice(),
    waybill_no: f.kind === 'handed_to_courier' ? (wb || null) : null,
    resolves_id: f.kind === 'resolved' ? f.resolves_id : null,
    created_by: (currentUser && (currentUser.display_name || currentUser.email)) || null
  };
  f.saving = true; renderEventModal();
  sbPostReturn('transfer_cargo_events', row).then(function (res) {
    if (!res.ok) {
      f.saving = false; renderEventModal();
      toast('Грешка при запис на отметката: ' + sbErrMsg(res), '#dc2626');
      return;
    }
    var saved = (res.row && res.row.id) ? res.row : Object.assign({ id: 'local-' + Date.now(), created_at: new Date().toISOString() }, row);
    tfEvents.push(saved);
    closeEventModal();
    var extra = (f.kind === 'handed_to_courier' && wb && !x.t.waybill_no) ? { waybill_no: wb } : null;
    return tfSyncStatus(x.t, extra).then(function () {
      toast('✅ ' + TF_EVENT_LABELS[f.kind]);
      renderTransfers();
    });
  }).catch(function () {
    f.saving = false; renderEventModal();
    toast('Грешка при запис', '#dc2626');
  });
}

/* ЕДИН helper за записа на статуса (и на товарителницата при предаване на
   куриер): пресмята от отметките в паметта и пише transfers.status само ако
   се е сменил. Провал тук НЕ отменя отметката — тя вече е записана — а
   вдига червен toast, за да не остане разминаването мълчаливо. */
function tfSyncStatus(t, extra) {
  var st = tfComputeStatus(t, tfCargoByTransfer[t.id] || [], tfEventsOf(t.id)).status;
  var body = {};
  if (st !== t.status) body.status = st;
  if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
  if (!Object.keys(body).length) return Promise.resolve(true);
  return sbPatch('transfers', 'id=eq.' + t.id, body).then(function (res) {
    if (!res || !res.ok) {
      toast('Отметката е записана, но транспортът НЕ е обновен (' + Object.keys(body).join(', ') + '): ' + sbErrMsg(res), '#dc2626');
      return false;
    }
    Object.keys(body).forEach(function (k) { t[k] = body[k]; });
    return true;
  });
}
