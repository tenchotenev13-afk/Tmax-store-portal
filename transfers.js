/* transfers.js — под-таб „🔁 Трансфери" в Транспорт.
   Междускладови трансфери: ЕТАП 1 — създаване на транспорт с товари;
   ЕТАП 2 — отметки по товар и статус на транспорта; дотоварване от спирка и
   търсене по товар; ЕТАП 3 — прехвърляне на чакащ товар към следващ
   транспорт (transfer_cargo.prev_cargo_id, виж „Етап 3: веригите").

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
   спирка, крайна точка, точка на прехвърляне, получател или е дотоварил
   товар (transfer_cargo.loaded_at_store). isGlobal()
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
var tfFilter = 'all';       /* 'all' | 'mine' (за потвърждение при мен) | 'reship' (чакащи прехвърляне) | 'problems' */
var tfCardId = null;        /* отворената карта на транспорт */
var tfEvForm = null;        /* прозорчето за отметка */
var tfCargoInput = '';      /* текстът в полето „Товар" */
var tfCargoQ = '';          /* търсенето, за което са tfCargoHits */
var tfCargoHits = null;     /* null = няма търсене; иначе [{t, c, i, last}] */
/* ── Етап 3: вериги от прехвърляния (transfer_cargo.prev_cargo_id) ── */
var tfTransferById = {};    /* id -> транспорт: видимите + звената от веригите */
var tfCargoById = {};       /* id -> товар, за всички заредени транспорти */
var tfSuccOf = {};          /* id на товар -> товарът, който го продължава */
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
    return hit(c.recipient_store) || hit(c.loaded_at_store) || (c.transfer_points || []).some(hit);
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
       товарите (получател / дотоварил / точка на прехвърляне). Обединяват се по id. */
    var hq = [], cq = [];
    stores.forEach(function (s) {
      var e = encodeURIComponent(s);
      hq.push('from_store.eq.' + e, 'end_store.eq.' + e, tfArrCs('stops', s));
      cq.push('recipient_store.eq.' + e, 'loaded_at_store.eq.' + e, tfArrCs('transfer_points', s));
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

  return Promise.all([headersP, tfLoadStoreList()]).then(function (r) {
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
    tfTransferById = {};
    r[0].forEach(function (t) { tfTransferById[t.id] = t; });
    tfIndexChains();
    /* Звената от веригите се дозареждат ПРЕДИ рендера: „Чакащи прехвърляне"
       зависи от това дали товарът вече има наследник. */
    return tfLoadChains().catch(function () {}).then(function () { renderTransfers(); });
  }).catch(function () {
    tfTransfers = []; tfCargoByTransfer = {}; tfEvents = [];
    tfTransferById = {}; tfCargoById = {}; tfSuccOf = {};
    renderTransfers();
  });
}

/* ── Етап 3: веригите ────────────────────────────────────────────────────
   Товар, разтоварен в точка на прехвърляне P, продължава в НОВ ред
   transfer_cargo на следващия транспорт (нов от P или дотоварване на бус
   през P), вързан към стария с prev_cargo_id. Звената могат да са в
   транспорти, които обектът иначе не вижда (Козлодуй не участва в
   Пирдоп → Троян) — те се дозареждат в tfTransferById / tfCargoByTransfer /
   tfEvents, но НЕ влизат в tfTransfers (списъка и филтрите).
   Заявките са малки: наследници се търсят само за разтоварените товари,
   предшественици — само по prev_cargo_id. Двата филтъра се повтарят в
   клиента. Най-много TF_CHAIN_ROUNDS кръга. */
var TF_CHAIN_ROUNDS = 6;

function tfArr(x) { return Array.isArray(x) ? x : []; }
function tfUniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }

function tfIndexChains() {
  tfCargoById = {}; tfSuccOf = {};
  Object.keys(tfCargoByTransfer).forEach(function (tid) {
    (tfCargoByTransfer[tid] || []).forEach(function (c) { tfCargoById[c.id] = c; });
  });
  Object.keys(tfCargoById).forEach(function (id) {
    var c = tfCargoById[id];
    if (c.prev_cargo_id) tfSuccOf[c.prev_cargo_id] = c;
  });
}

function tfLoadChains() {
  var rounds = 0;
  var next = function (batch) {
    if (!batch.length || rounds++ >= TF_CHAIN_ROUNDS) return Promise.resolve();
    var succFor = batch.filter(function (c) { return !!tfUnloadedEvent(c) && !tfSuccOf[c.id]; })
      .map(function (c) { return c.id; });
    var prevIds = tfUniq(batch.map(function (c) { return c.prev_cargo_id; })
      .filter(function (id) { return id && !tfCargoById[id]; }));
    if (!succFor.length && !prevIds.length) return Promise.resolve();
    return Promise.all([
      succFor.length ? sbGet('transfer_cargo', 'prev_cargo_id=in.(' + succFor.join(',') + ')') : Promise.resolve([]),
      prevIds.length ? sbGet('transfer_cargo', 'id=in.(' + prevIds.join(',') + ')') : Promise.resolve([])
    ]).then(function (r) {
      var found = tfArr(r[0]).filter(function (c) { return c && succFor.indexOf(c.prev_cargo_id) >= 0; })
        .concat(tfArr(r[1]).filter(function (c) { return c && prevIds.indexOf(c.id) >= 0; }))
        .filter(function (c) { return !tfCargoById[c.id]; });
      if (!found.length) return;
      var tids = tfUniq(found.map(function (c) { return c.transfer_id; }))
        .filter(function (id) { return !tfTransferById[id]; });
      var load = tids.length ? Promise.all([
        sbGet('transfers', 'id=in.(' + tids.join(',') + ')'),
        sbGet('transfer_cargo', 'transfer_id=in.(' + tids.join(',') + ')&order=position.asc'),
        sbGet('transfer_cargo_events', 'transfer_id=in.(' + tids.join(',') + ')&order=created_at.asc')
      ]) : Promise.resolve([[], [], []]);
      return load.then(function (x) {
        tfArr(x[0]).forEach(function (t) { if (t && tids.indexOf(t.id) >= 0) tfTransferById[t.id] = t; });
        var added = [];
        var addCargo = function (c) {
          if (!c || tfCargoById[c.id]) return;
          (tfCargoByTransfer[c.transfer_id] = tfCargoByTransfer[c.transfer_id] || []).push(c);
          tfCargoById[c.id] = c;
          added.push(c);
        };
        tfArr(x[1]).filter(function (c) { return c && tids.indexOf(c.transfer_id) >= 0; }).forEach(addCargo);
        found.forEach(addCargo);
        tids.forEach(function (id) {
          (tfCargoByTransfer[id] || []).sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
        });
        var haveEv = {};
        tfEvents.forEach(function (e) { haveEv[e.id] = 1; });
        tfEvents = tfEvents.concat(tfArr(x[2]).filter(function (e) {
          return e && tids.indexOf(e.transfer_id) >= 0 && !haveEv[e.id];
        }));
        tfIndexChains();
        return next(added);
      });
    });
  };
  var all = [];
  Object.keys(tfCargoById).forEach(function (id) { all.push(tfCargoById[id]); });
  return next(all);
}

function tfFindTransfer(id) {
  return tfTransferById[id] || tfTransfers.filter(function (x) { return x.id === id; })[0] || null;
}
function tfSuccessor(c) { return c ? tfSuccOf[c.id] || null : null; }
function tfPredecessor(c) { return c && c.prev_cargo_id ? tfCargoById[c.prev_cargo_id] || null : null; }
/* Звената преди c, от най-старото (без самото c). */
function tfChainAncestors(c) {
  var out = [], p = tfPredecessor(c), guard = 0;
  while (p && guard++ < 20) { out.unshift(p); p = tfPredecessor(p); }
  return out;
}
/* Последното звено — там, където товарът е сега. */
function tfChainTail(c) {
  var cur = c, n = tfSuccessor(c), guard = 0;
  while (n && guard++ < 20) { cur = n; n = tfSuccessor(n); }
  return cur;
}
/* „Козлодуй-0001 #1" — звеното като текст. */
function tfCargoRef(c) {
  var t = c ? tfFindTransfer(c.transfer_id) : null;
  return (t ? t.transfer_num : '—') + ' #' + (c && c.position ? c.position : '?');
}
/* Отметката „Разтоварен" в първата точка на прехвърляне — последната такава. */
function tfUnloadedEvent(c) {
  var tg = tfCargoTarget(c);
  if (!c || tg.event !== 'unloaded') return null;
  var hit = null;
  tfCargoEvents(tfEventsOf(c.transfer_id), c.id).forEach(function (e) {
    if (e.event === 'unloaded' && e.store_name === tg.store) hit = e;
  });
  return hit;
}
/* Пълни календарни дни между отметката и днес (местно време). 0 = днес. */
function tfWaitDays(ts, now) {
  var d = new Date(ts), n = now ? new Date(now) : new Date();
  if (isNaN(d.getTime())) return 0;
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}
function tfWaitText(days) {
  if (!days) return 'чака от днес';
  return 'чака ' + days + (days === 1 ? ' ден' : ' дни');
}
/* Чакащите прехвърляне в stores: разтоварени там, без наследник. Само от
   видимите транспорти (tfTransfers) — чуждият обект не вижда чужди чакащи. */
function tfReshipItems(stores, q) {
  var out = [];
  if (!stores || !stores.length) return out;
  tfTransfers.forEach(function (t) {
    if (q && !tfMatches(t, q)) return;
    (tfCargoByTransfer[t.id] || []).forEach(function (c, i) {
      var ev = tfUnloadedEvent(c);
      if (!ev || stores.indexOf(ev.store_name) < 0 || tfSuccessor(c)) return;
      out.push({ t: t, c: c, i: i, ev: ev, days: tfWaitDays(ev.created_at) });
    });
  });
  return out;
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
      '<input id="trf-csearch" placeholder="📦 Товар: стокова / рекламация / КЗ / бележка…" value="' + tfAttr(tfCargoInput) + '"' +
      ' oninput="tfCargoInput=this.value" onkeydown="if(event.key===\'Enter\')tfSearchCargo(this.value)"' +
      ' style="flex:1;min-width:220px;border:1px solid #e2e8f0;border-radius:8px;padding:7px 14px;font-size:13px;font-family:inherit;outline:none;">' +
      '<button id="trf-csearch-go" class="btn-sm" onclick="tfSearchCargo(document.getElementById(\'trf-csearch\').value)">Търси товар</button>' +
      (tfCreatorStores().length ? '<button id="trf-new" class="btn btn-green" onclick="openTransferForm()">+ Нов транспорт</button>' : '') +
    '</div>' + tfCargoResultsHtml() + tfFilterBarHtml();
  if (tfFilter === 'mine') { wrap.innerHTML = h + tfPendingHtml(q); return; }
  if (tfFilter === 'problems') { wrap.innerHTML = h + tfProblemsHtml(q); return; }
  if (tfFilter === 'reship') { wrap.innerHTML = h + tfReshipHtml(q); return; }
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

/* Заключен ред за чакащ товар: копие от предишното звено — вид, брой,
   получател, връзки, рекламации, стокова, забележка; точките = оставащите
   СЛЕД обекта, в който чака. Ред от товарен лист не се копира. */
function tfReshipCargo(it) {
  var c = it.c;
  return { kind: c.kind, qty: c.qty, recipient_store: c.recipient_store,
           transfer_points: (c.transfer_points || []).slice(1), note: c.note || '',
           client_order_ids: (c.client_order_ids || []).slice(), transport_order_ids: (c.transport_order_ids || []).slice(),
           claims: (c.claim_numbers || []).join(', '), goods_doc: c.goods_doc || '', loading_item_id: '',
           prev_cargo_id: c.id, locked: true, reship_from: it.ev.store_name, prev_ref: tfCargoRef(c) };
}
function tfIsBlankCargo(c) {
  return !c.locked && !c.recipient_store && !c.note && !c.goods_doc && !c.claims && !c.loading_item_id &&
    !(c.transfer_points || []).length && !(c.client_order_ids || []).length && !(c.transport_order_ids || []).length;
}
function tfTogglePendingPick() { if (tfForm) { tfForm.showPending = !tfForm.showPending; renderTransferForm(); } }
function tfAddReshipCargo(cid) {
  var f = tfForm;
  if (!f) return;
  var it = tfReshipItems([f.from_store], '').filter(function (x) { return x.c.id === cid; })[0];
  if (!it) { toast('Товарът не чака прехвърляне в ' + (f.from_store || 'този обект'), '#dc2626'); return; }
  if (f.cargo.some(function (c) { return c.prev_cargo_id === cid; })) { toast('Товарът вече е добавен', '#d97706'); return; }
  var row = tfReshipCargo(it);
  if (f.cargo.length === 1 && tfIsBlankCargo(f.cargo[0])) f.cargo[0] = row;
  else f.cargo.push(row);
  f.showPending = false;
  renderTransferForm();
}
/* Заключеният ред във формата — само за четене, с бутон за махане. */
function tfLockedCargoHtml(f, c, i, routeStops) {
  var links = [];
  if (c.client_order_ids.length) links.push('КЗ ×' + c.client_order_ids.length);
  if (c.transport_order_ids.length) links.push('ТЗ ×' + c.transport_order_ids.length);
  if (c.claims) links.push('Рекл. ' + c.claims);
  if (c.goods_doc) links.push('СР ' + c.goods_doc);
  var first = c.transfer_points[0] || c.recipient_store;
  return '<div class="trf-cargo trf-cargo-locked" data-i="' + i + '" data-prev="' + tfAttr(c.prev_cargo_id) + '" style="border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:8px;background:#fffbeb;">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
      '<div><b>#' + (i + 1) + ' 🔒 ' + escVal(tfKindLabel(c.kind) + (c.qty > 1 ? ' ×' + c.qty : '') + ' → ' + c.recipient_store) + '</b>' +
        '<div style="font-size:12px;color:#92400e;">продължение на ' + escVal(c.prev_ref) + ' · чака в ' + escVal(c.reship_from) + '</div>' +
        '<div class="trf-locked-points" style="font-size:12px;margin-top:2px;">' + (c.transfer_points.length
          ? 'Точки на прехвърляне: ' + escVal(c.transfer_points.join(' → ')) : 'Без прехвърляне — направо до получателя') + '</div>' +
        (links.length ? '<div style="font-size:12px;color:#64748b;">' + escVal(links.join(', ')) + '</div>' : '') +
        (c.note ? '<div style="font-size:12px;color:#64748b;">Забележка: ' + escVal(c.note) + '</div>' : '') +
      '</div>' +
      (f.cargo.length > 1 ? '<button class="btn-sm trf-remove-cargo" title="Махни товара" onclick="tfRemoveCargo(' + i + ')">✕</button>' : '') +
    '</div>' +
    (f.mode !== 'courier' && first && routeStops.indexOf(first) < 0
      ? '<div class="trf-cargo-warn" style="margin-top:6px;font-size:12px;color:#b91c1c;">⚠️ ' + escVal(first) + ' не е спирка на този транспорт' + (f.reload ? ' след ' + escVal(f.from_store) : '') + '.</div>' : '') +
  '</div>';
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
  var rl = tfForm && tfForm.reload;
  tfView = rl ? 'card' : 'list'; tfForm = null;
  if (rl) tfCardId = rl.tid;
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

/* Обекти, които не са избираеми като получател / точка: началото, а при
   дотоварване — и всичко по маршрута до дотоварващия обект включително. */
function tfFormExcluded(f) {
  return f.reload ? (f.reload.before || []).slice() : [f.from_store];
}

var TF_FLD = 'border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;';

function renderTransferForm() {
  var wrap = document.getElementById('mod-transfers');
  if (!wrap || !tfForm) return;
  var f = tfForm;
  var creators = tfCreatorStores();
  var courier = f.mode === 'courier';

  var rl = f.reload;
  var h = '<div class="pg-title">' + (rl ? '➕ Дотоварване в ' + escVal(f.from_store) + ' — ' + escVal(rl.num) : '🔁 Нов транспорт') + '</div>' +
    '<div id="trf-form" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;max-width:1000px;">';

  if (rl) {
    /* Дотоварване: транспортът вече съществува — маршрутът се показва, не се
       редактира. Товарът може да слезе само СЛЕД дотоварващия обект. */
    h += '<div id="trf-reload-route" style="font-size:13px;margin-bottom:12px;">Маршрут оттук: 🏁 <b>' + escVal(f.from_store) + '</b> → ' +
      escVal(tfRouteStops(f).join(' → ')) + '</div>';
  } else {
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
  } /* край на „не е дотоварване" */

  /* Товари */
  var routeStops = tfRouteStops(f);
  h += '<div style="font-size:12px;font-weight:700;margin:4px 0 6px;">Товари</div>';
  f.cargo.forEach(function (c, i) {
    if (c.locked) { h += tfLockedCargoHtml(f, c, i, routeStops); return; }
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
            : '<select class="trf-recipient" onchange="tfSetCargo(' + i + ',\'recipient_store\',this.value,true)" style="' + TF_FLD + '">' + tfStoreOptions(c.recipient_store, tfFormExcluded(f)) + '</select>') +
        '</label>' +
        '<label style="font-size:12px;flex:1;min-width:160px;">Забележка<br><input class="trf-note" value="' + tfAttr(c.note) + '" oninput="tfSetCargo(' + i + ',\'note\',this.value)" style="' + TF_FLD + 'width:100%;box-sizing:border-box;"></label>' +
        (f.cargo.length > 1 ? '<button class="btn-sm trf-remove-cargo" title="Махни товара" onclick="tfRemoveCargo(' + i + ')">✕</button>' : '') +
      '</div>';

    if (!courier) {
      h += '<div style="margin-top:8px;font-size:12px;">Точки на прехвърляне <span style="color:#94a3b8;">(само където товарът се разтоварва и чака)</span></div>';
      c.transfer_points.forEach(function (p, j) {
        h += '<div style="display:flex;gap:6px;align-items:center;margin:4px 0 0 12px;">' +
          '<span style="font-size:12px;color:#64748b;">' + (j + 1) + '.</span>' +
          '<select class="trf-point" data-j="' + j + '" onchange="tfSetPoint(' + i + ',' + j + ',this.value)" style="' + TF_FLD + '">' + tfStoreOptions(p, tfFormExcluded(f)) + '</select>' +
          '<button class="btn-sm" onclick="tfRemovePoint(' + i + ',' + j + ')">✕</button></div>';
      });
      h += '<div style="margin:4px 0 0 12px;"><button class="btn-sm trf-add-point" onclick="tfAddPoint(' + i + ')">+ Точка на прехвърляне</button></div>';
      var first = c.transfer_points[0] || c.recipient_store;
      if (first && routeStops.indexOf(first) < 0) {
        h += '<div class="trf-cargo-warn" style="margin-top:6px;font-size:12px;color:#b91c1c;">⚠️ ' + escVal(first) +
          (rl ? ' не е след ' + escVal(f.from_store) + ' по маршрута — избери спирка след него или точка на прехвърляне там.'
              : ' не е спирка на този транспорт — добави я в маршрута или точка на прехвърляне по пътя.') + '</div>';
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
  /* Етап 3: товар, който чака прехвърляне в началния обект, се слага на
     този транспорт като заключен ред. */
  var waiting = f.from_store ? tfReshipItems([f.from_store], '').filter(function (it) {
    return !f.cargo.some(function (c) { return c.prev_cargo_id === it.c.id; });
  }) : [];
  if (waiting.length) {
    h += ' <button id="trf-from-pending" class="btn-sm" onclick="tfTogglePendingPick()">➕ От чакащите (' + waiting.length + ')</button>';
    if (f.showPending) {
      h += '<div id="trf-pending-pick" style="border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:8px;margin-top:6px;">' +
        waiting.map(function (it) {
          return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:4px 0;font-size:12px;">' +
            '<span><b>' + escVal(it.t.transfer_num) + '</b> · ' + escVal(tfCargoLabel(it.c, it.i)) + ' · ' + escVal(tfWaitText(it.days)) + '</span>' +
            '<button class="btn-sm trf-pick-pending" data-c="' + tfAttr(it.c.id) + '" onclick="tfAddReshipCargo(this.getAttribute(\'data-c\'))">Добави</button></div>';
        }).join('') + '</div>';
    }
  }

  if (!rl) h += '<div style="margin-top:12px;"><label style="font-size:12px;">Бележка към транспорта<br>' +
    '<textarea id="trf-tnote" rows="2" oninput="tfSetField(\'note\',this.value)" style="' + TF_FLD + 'width:100%;box-sizing:border-box;">' + escVal(f.note) + '</textarea></label></div>';

  h += '<div id="trf-error" style="color:#b91c1c;font-size:13px;margin-top:8px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button id="trf-cancel" class="btn-sm" onclick="closeTransferForm()">Откажи</button>' +
      '<button id="trf-save" class="btn btn-green"' + (tfSaving ? ' disabled' : '') + ' onclick="submitTransfer()">' + (tfSaving ? '⏳ Записвам…' : (rl ? 'Дотовари' : 'Запиши')) + '</button>' +
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
    tfForm.cargo.forEach(function (c) { if (!c.locked) c.transfer_points = []; });
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

  if (f.reload) {
    /* Дотоварване: заглавието на транспорта вече е записано и валидно. */
    if (f.mode !== 'bus') return 'Дотоварва се само бус.';
  } else if (f.mode === 'bus') {
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
    if (c.prev_cargo_id) {
      /* Етап 3: чакащ товар — от обекта, в който чака, веднъж. */
      if (c.reship_from && c.reship_from !== f.from_store) return n + 'товарът чака в ' + c.reship_from + ' — прехвърля се оттам, не от ' + f.from_store + '.';
      for (var k = 0; k < i; k++) if (f.cargo[k].prev_cargo_id === c.prev_cargo_id) return n + 'същият чакащ товар е добавен два пъти.';
      var succ = tfSuccessor(tfCargoById[c.prev_cargo_id] || { id: c.prev_cargo_id });
      if (succ) return n + 'товарът вече е прехвърлен в ' + tfCargoRef(succ) + '.';
    }
    if (f.reload) {
      /* Дотоварване: нищо не слиза в обект, през който бусът вече е минал. */
      var bad = [rec].concat(pts).filter(function (x) { return (f.reload.before || []).indexOf(x) >= 0; })[0];
      if (bad) return n + '„' + bad + '" е преди ' + f.from_store + ' по маршрута — товарът слиза само след него.';
    }
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
        (f.reload ? '" трябва да е спирка след ' + f.from_store + ' или крайната точка.'
                  : '" трябва да е спирка или крайна точка на този транспорт.');
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
  if (f.reload) { tfSubmitReload(f); return; }

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
    var body = f.cargo.map(function (c, i) { return tfCargoRow(f, c, t.id, i + 1); });
    return sbPost('transfer_cargo', body).then(function (r2) {
      if (!r2.ok) {
        /* Транспорт без товари е безсмислен и заблуждава получателите —
           заглавието се трие. Номерът остава изразходван: броячът не се
           връща назад, също като при клиентските заявки. */
        return sbDelete('transfers', 'id=eq.' + t.id).then(function () {
          tfSaving = false; renderTransferForm();
          toast('Грешка при запис на товарите — транспортът не е създаден: ' + tfCargoErrText(r2), '#dc2626');
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

/* Един ред в transfer_cargo по товар от формата. */
function tfCargoRow(f, c, transferId, position) {
  var courier = f.mode === 'courier';
  return {
    transfer_id: transferId,
    position: position,
    kind: c.kind,
    qty: parseInt(c.qty, 10),
    recipient_store: courier ? f.end_store : c.recipient_store,
    transfer_points: courier ? [] : c.transfer_points.slice(),
    note: (c.note || '').trim() || null,
    client_order_ids: c.client_order_ids.slice(),
    transport_order_ids: c.transport_order_ids.slice(),
    claim_numbers: tfSplitClaims(c.claims),
    goods_doc: (c.goods_doc || '').trim() || null,
    loading_item_id: c.loading_item_id || null,
    prev_cargo_id: c.prev_cargo_id || null
  };
}

/* Уникалният индекс по prev_cargo_id връща 23505 при втори опит за същия
   товар (друг потребител го е прехвърлил междувременно). */
function tfCargoErrText(res) {
  var e = (res && res.error) || {};
  if (e.code === '23505' || /transfer_cargo_prev_uidx/.test(String(e.message || ''))) {
    return 'товарът вече е прехвърлен в друг транспорт — опресни списъка';
  }
  return sbErrMsg(res);
}

/* ── Дотоварване от спирка ───────────────────────────────────────────────── */

/* От кои обекти текущият потребител може да дотовари t: спирка на буса (не
   началото, не крайната точка), докато транспортът не е Завършен. Глобалните
   роли не са обект и не дотоварват. */
function tfReloadStores(t) {
  if (!t || t.mode !== 'bus') return [];
  if (tfComputeStatus(t, tfCargoByTransfer[t.id] || [], tfEventsOf(t.id)).status === 'done') return [];
  return tfActorStores().filter(function (s) {
    return (t.stops || []).indexOf(s) >= 0 && s !== t.from_store && s !== t.end_store;
  });
}

function openReloadForm(tid, store) {
  var t = tfTransfers.filter(function (x) { return x.id === tid; })[0];
  if (!t || tfReloadStores(t).indexOf(store) < 0) { toast('Не можеш да дотовариш този транспорт', '#dc2626'); return; }
  var stops = t.stops || [];
  var at = stops.indexOf(store);
  tfForm = {
    reload: { tid: t.id, num: t.transfer_num, before: [t.from_store].concat(stops.slice(0, at + 1)) },
    from_store: store, mode: 'bus',
    depart_date: t.depart_date, depart_time: t.depart_time, driver: t.driver || '',
    stops: stops.slice(at + 1), end_store: t.end_store,
    courier_company: '', waybill_no: '', note: '',
    cargo: [tfNewCargo()]
  };
  tfView = 'form';
  renderTransferForm();
  tfLoadLinkOptions();
}

/* Само товарите — заглавието не се пипа. loaded_at_store пази кой е
   дотоварил: той е изпращачът на товара (tfCargoSender). */
function tfSubmitReload(f) {
  var tid = f.reload.tid;
  var t = tfTransfers.filter(function (x) { return x.id === tid; })[0];
  if (!t || tfReloadStores(t).indexOf(f.from_store) < 0) { toast('Транспортът вече не може да се дотоварва', '#dc2626'); return; }
  var maxPos = (tfCargoByTransfer[tid] || []).reduce(function (m, c) { return Math.max(m, parseInt(c.position, 10) || 0); }, 0);
  var body = f.cargo.map(function (c, i) {
    var row = tfCargoRow(f, c, tid, maxPos + i + 1);
    row.loaded_at_store = f.from_store;
    return row;
  });
  tfSaving = true;
  renderTransferForm();
  sbPost('transfer_cargo', body).then(function (r) {
    tfSaving = false;
    if (!r.ok) { renderTransferForm(); toast('Грешка при дотоварването: ' + tfCargoErrText(r), '#dc2626'); return; }
    toast('✅ Дотоварено в ' + (t.transfer_num || ''));
    tfForm = null; tfView = 'card'; tfCardId = tid;
    /* Статусът се пресмята наново с новите товари — Завършен, отбелязан
       междувременно, става пак Частично. */
    var p = loadTransfers(true);
    return p && p.then(function () {
      var t2 = tfTransfers.filter(function (x) { return x.id === tid; })[0];
      return t2 ? tfSyncStatus(t2, null, 'Дотоварката') : null;
    }).then(function () { renderTransfers(); });
  }).catch(function () {
    tfSaving = false; renderTransferForm();
    toast('Грешка при запис', '#dc2626');
  });
}

/* ── Печат ───────────────────────────────────────────────────────────────── */

function printTransfer(id) {
  var t = tfFindTransfer(id);
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
      '<td><b>' + escVal(c.recipient_store) + '</b>' + (c.loaded_at_store ? '<br>дотоварен в ' + escVal(c.loaded_at_store) : '') +
        tfChainRefs(c).map(function (r) { return '<br>' + escVal(r.text); }).join('') + '</td>' +
      '<td>' + escVal((c.transfer_points || []).join(' → ')) + '</td>' +
      '<td>' + escVal(links.join(', ')) + '</td>' +
      '<td>' + escVal(c.note) + '</td>' +
    '</tr>';
  }).join('');

  /* История по товар — всички отметки по ред. */
  var hist = cargo.map(function (c, i) {
    var evs = tfEventsOf(t.id).filter(function (e) { return e.cargo_id === c.id; });
    var prevEv = tfChainPrevEvents(c);
    if (!evs.length && !prevEv.length) return '';
    return '<tr><td>' + (i + 1) + '</td><td colspan="2">' + prevEv.map(function (x) {
      return escVal(x.num + ' · ' + tfFmtTs(x.e.created_at) + ' · ' + x.e.store_name + ' · ' + tfEventText(x.e) + tfPhotoPrintText(x.e));
    }).concat(evs.map(function (e) {
      return escVal(tfFmtTs(e.created_at) + ' · ' + e.store_name + ' · ' + tfEventText(e) + tfPhotoPrintText(e));
    })).join('<br>') + '</td></tr>';
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

   Самото прехвърляне към следващ транспорт е етап 3 („Етап 3: веригите"):
   нов ред с prev_cargo_id; тук старият товар показва „↪ прехвърлен в …". */

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
/* Изпращачът на товара: обектът, който го е дотоварил по пътя, иначе
   създателят на транспорта. Той има правата на изпращач — „Решен",
   „Предаден на куриер" — и е началото на маршрута на товара. */
function tfCargoSender(t, c) {
  return (c && c.loaded_at_store) || (t && t.from_store) || null;
}
/* Обектите по маршрута на товара — само те отбелязват проблем. */
function tfCargoRouteStores(t, c) {
  return [tfCargoSender(t, c)].concat((c && c.transfer_points) || []).concat([c && c.recipient_store]).filter(Boolean);
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
    if (store !== tfCargoSender(t, c)) return 'Отбелязва изпращачът — ' + tfCargoSender(t, c) + '.';
    if (tfCargoEvents(evs, c.id).some(function (e) { return e.event === 'handed_to_courier'; })) return 'Вече е предаден.';
    if (done) return 'Товарът вече е получен.';
    return null;
  }
  if (kind === 'problem') {
    return tfCargoRouteStores(t, c).indexOf(store) >= 0 ? null : 'Само обект по маршрута на товара.';
  }
  if (kind === 'resolved') {
    if (!(isAdmin || store === tfCargoSender(t, c))) return 'Решава изпращачът или админ.';
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
  var succ = tfSuccessor(c);
  if (succ) return '↪ прехвърлен в ' + tfCargoRef(succ);
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
  var nRe = tfReshipItems(tfActorStores(), '').length;
  return '<div class="filter-bar" style="margin:0 0 12px;">' +
    b('all', 'Всички') +
    b('mine', '📥 За потвърждение при мен' + (nMine ? ' (' + nMine + ')' : '')) +
    b('reship', '⏳ Чакащи прехвърляне при мен' + (nRe ? ' (' + nRe + ')' : '')) +
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
  return '#' + (i + 1) + ' ' + tfKindLabel(c.kind) + (c.qty > 1 ? ' ×' + c.qty : '') + ' → ' + c.recipient_store +
    (c.loaded_at_store ? ' · дотоварен в ' + c.loaded_at_store : '');
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

/* „⏳ Чакащи прехвърляне при мен" — разтоварените в моя обект товари, още
   без следващ транспорт. Слагат се на нов транспорт или на минаващ бус с
   „➕ От чакащите" във формата. */
function tfReshipHtml(q) {
  var items = tfReshipItems(tfActorStores(), q);
  if (!items.length) return '<div id="trf-reship" style="text-align:center;padding:30px;color:#94a3b8;">Няма товари, които чакат прехвърляне при теб.</div>';
  return '<div id="trf-reship">' + items.map(function (it) {
    return '<div class="trf-reship-row" data-c="' + tfAttr(it.c.id) + '" style="border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:8px;background:#fffbeb;">' +
      '<div><b>' + escVal(it.t.transfer_num) + '</b> · ' + escVal(tfCargoLabel(it.c, it.i)) +
        ((it.c.transfer_points || []).length > 1 ? '<span style="font-size:12px;color:#64748b;"> · после през ' + escVal(it.c.transfer_points.slice(1).join(' → ')) + '</span>' : '') + '</div>' +
      '<div style="font-size:12px;color:#92400e;margin-top:2px;">⏸ разтоварен в ' + escVal(it.ev.store_name) + ' на ' + escVal(tfFmtTs(it.ev.created_at)) +
        ' · <b class="trf-wait" data-days="' + it.days + '">' + escVal(tfWaitText(it.days)) + '</b></div>' +
      '<div style="font-size:11px;color:#64748b;margin-top:2px;">Сложи го на нов транспорт или на минаващ бус — „➕ От чакащите" във формата.</div>' +
    '</div>';
  }).join('') + '</div>';
}

/* Препратките по веригата за товара: „продължение на …" / „продължава в …".
   На екрана — линк към картата; в печата — текст. */
function tfChainRefs(c) {
  var out = [];
  var p = tfPredecessor(c), n = tfSuccessor(c);
  if (p) out.push({ cls: 'trf-chain-prev', text: '↩ продължение на ' + tfCargoRef(p), tid: p.transfer_id });
  else if (c && c.prev_cargo_id) out.push({ cls: 'trf-chain-prev', text: '↩ продължение на друг транспорт', tid: null });
  if (n) out.push({ cls: 'trf-chain-next', text: '↪ продължава в ' + tfCargoRef(n), tid: n.transfer_id });
  return out;
}
function tfChainRefsHtml(c) {
  return tfChainRefs(c).map(function (r) {
    return '<div class="' + r.cls + '" style="font-size:12px;margin-top:2px;">' + (r.tid
      ? '<a href="javascript:void(0)" onclick="openTransferCard(\'' + tfAttr(r.tid) + '\')" style="color:#1d4ed8;">' + escVal(r.text) + '</a>'
      : escVal(r.text)) + '</div>';
  }).join('');
}
/* Отметките от предишните звена — за историята на товара. */
function tfChainPrevEvents(c) {
  var out = [];
  tfChainAncestors(c).forEach(function (a) {
    var num = (tfFindTransfer(a.transfer_id) || {}).transfer_num || '—';
    tfCargoEvents(tfEventsOf(a.transfer_id), a.id).forEach(function (e) { out.push({ e: e, num: num }); });
  });
  return out;
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

/* ── Търсене по товар ────────────────────────────────────────────────────── */

/* Резултатът е по ТОВАР, не по транспорт: стокова разписка, № рекламация,
   бележка, получател, дотоварил обект (tfCargoMatch — толерантно към
   правописа, числата точно) или № на свързана клиентска заявка
   („Троян-0042" — точно, през client_orders).
   Търси се само в заредените транспорти — tfTransfers вече е минал през
   tfVisibleToStores, тоест обектът не намира чужди товари, а глобалните
   роли виждат всички.
   ЕТАП 3 (30.09.2026): за прехвърлен товар резултатът е последното звено от
   веригата, с последното му движение и пътя „А #1 → Б #2". */

/* Толерантно съвпадение (30.09.2026): „дотоварване" намира „дотоварен",
   „стелжни" — „Стелажни". Числата НЕ са толерантни: стокова / рекламация с
   една различна цифра е друг документ. */
var TF_LAT2CYR = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };

/* Малки букви, латинските двойници → кирилица, без пунктуация, на думи. */
function tfSearchWords(s) {
  return String(s || '').toLowerCase().replace(/[abcehkmoptxy]/g, function (ch) { return TF_LAT2CYR[ch]; })
    .replace(/[^0-9a-zа-яѐ-џ]+/g, ' ').split(' ').filter(Boolean);
}
/* Число: само цифри, или цифрите са поне половината от знаците. */
function tfIsNumWord(w) {
  var d = (w.match(/[0-9]/g) || []).length;
  return d > 0 && d * 2 >= w.length;
}
function tfLev1(a, b) {
  /* Разстояние на Левенщайн ≤ 1 — без пълната матрица. */
  if (a === b) return true;
  var la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  var i = 0, j = 0, diff = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return diff + (la - i) + (lb - j) <= 1;
}
/* 2 = точно (подниз), 1 = толерантно, 0 = не. */
function tfWordMatch(q, w) {
  if (w.indexOf(q) >= 0) return 2;
  if (tfIsNumWord(q)) return 0;
  if (q.length >= 5 && w.length >= 5) {
    var n = Math.min(6, q.length, w.length);
    if (q.slice(0, n) === w.slice(0, n)) return 1;
    if (tfLev1(q, w)) return 1;
  }
  return 0;
}
/* Думите на товара, в които се търси. Дотовареният носи и „дотоварен в X",
   както го показва етикетът. № клиентска заявка се търси отделно (uuid). */
function tfCargoWords(c) {
  var parts = [c.note, c.goods_doc, c.recipient_store].concat(c.claim_numbers || []);
  if (c.loaded_at_store) parts.push('дотоварен в ' + c.loaded_at_store);
  return tfSearchWords(parts.filter(Boolean).join(' '));
}
/* Всяка дума от заявката — в някоя дума на товара (И, без значение от реда).
   Текстови думи под 3 знака се пропускат, ако има и други. 2 = всички
   точни, 1 = има толерантно, 0 = не съвпада. */
function tfCargoMatch(query, c) {
  var qw = tfSearchWords(query);
  var keep = qw.filter(function (w) { return w.length >= 3 || tfIsNumWord(w); });
  if (keep.length) qw = keep;
  if (!qw.length) return 0;
  var cw = tfCargoWords(c), level = 2;
  for (var i = 0; i < qw.length; i++) {
    var best = 0;
    for (var j = 0; j < cw.length && best < 2; j++) best = Math.max(best, tfWordMatch(qw[i], cw[j]));
    if (!best) return 0;
    level = Math.min(level, best);
  }
  return level;
}

/* Последното движение на товара: получен / разтоварен / предаден на куриер.
   Проблемите и решенията не са движение. null = няма — товарът е в път. */
function tfCargoLastMove(c) {
  var last = null;
  tfCargoEvents(tfEventsOf(c.transfer_id), c.id).forEach(function (e) {
    if (e.event === 'received' || e.event === 'unloaded' || e.event === 'handed_to_courier') last = e;
  });
  return last;
}
function tfLastMoveText(e) {
  if (!e) return '🚐 в път';
  var when = tfFmtTs(e.created_at);
  if (e.event === 'received') return '✅ получен в ' + e.store_name + ' · ' + when;
  if (e.event === 'unloaded') return '⏸ разтоварен в ' + e.store_name + ' — чака прехвърляне · ' + when;
  return '🚚 предаден на куриер от ' + e.store_name + ' · ' + when;
}

function tfSearchCargo(q) {
  q = String(q || '').trim();
  tfCargoInput = q;
  if (!q) { tfCargoQ = ''; tfCargoHits = null; renderTransfers(); return Promise.resolve([]); }
  var ql = q.toLowerCase();
  tfCargoQ = q;
  /* client_order_ids са uuid — номерът се превежда до id през client_orders.
     Филтърът се повтаря и тук, в клиента. */
  return sbGet('client_orders', 'select=id,in_num&in_num=ilike.' + encodeURIComponent('*' + q + '*') + '&limit=200').then(function (rows) {
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      return r && r.in_num && String(r.in_num).toLowerCase().indexOf(ql) >= 0;
    }).map(function (r) { return r.id; });
  }).catch(function () { return []; }).then(function (coIds) {
    if (tfCargoQ !== q) return tfCargoHits;
    var hits = [];
    tfTransfers.forEach(function (t) {
      (tfCargoByTransfer[t.id] || []).forEach(function (c, i) {
        var byCo = (c.client_order_ids || []).some(function (id) { return coIds.indexOf(id) >= 0; });
        var m = byCo ? 2 : tfCargoMatch(q, c);
        if (!m) return;
        /* Етап 3: показва се ПОСЛЕДНОТО звено от веригата — там, където
           товарът е сега — с пътя. Няколко звена от една верига са един ред. */
        var tail = tfChainTail(c);
        var tt = tfFindTransfer(tail.transfer_id) || t;
        var dup = hits.filter(function (x) { return x.c.id === tail.id; })[0];
        if (dup) { dup.exact = dup.exact || m === 2; return; }
        var ti = (tfCargoByTransfer[tt.id] || []).indexOf(tail);
        hits.push({ t: tt, c: tail, i: ti >= 0 ? ti : i, last: tfCargoLastMove(tail), exact: m === 2,
                    path: tfChainAncestors(tail).concat([tail]).map(tfCargoRef) });
      });
    });
    /* Точните първи, толерантните след тях; иначе редът на списъка. */
    hits = hits.map(function (x, k) { x.k = k; return x; }).sort(function (a, b) {
      return (b.exact - a.exact) || (a.k - b.k);
    });
    tfCargoHits = hits;
    renderTransfers();
    return hits;
  });
}
function tfClearCargoSearch() { tfCargoInput = ''; tfCargoQ = ''; tfCargoHits = null; renderTransfers(); }

function tfCargoResultsHtml() {
  if (!tfCargoHits) return '';
  var h = '<div id="trf-cargo-results" style="border:1px solid #c7d2fe;border-radius:8px;padding:10px;margin-bottom:12px;background:#eef2ff;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
      '<b style="font-size:13px;">📦 Товари по „' + escVal(tfCargoQ) + '"</b>' +
      '<button id="trf-csearch-clear" class="btn-sm" onclick="tfClearCargoSearch()">✕ Изчисти</button></div>';
  if (!tfCargoHits.length) return h + '<div style="font-size:13px;color:#64748b;">Няма товар с това.</div></div>';
  return h + tfCargoHits.map(function (x) {
    return '<div class="trf-cargo-hit" data-t="' + tfAttr(x.t.id) + '" data-c="' + tfAttr(x.c.id) + '" onclick="openTransferCard(\'' + tfAttr(x.t.id) + '\')"' +
      ' style="cursor:pointer;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-top:6px;">' +
      '<b>' + escVal(x.t.transfer_num) + '</b> · ' + escVal(tfCargoLabel(x.c, x.i)) +
      '<div class="trf-cargo-last" style="font-size:12px;color:#334155;margin-top:2px;">' + escVal(tfLastMoveText(x.last)) + '</div>' +
      (x.path && x.path.length > 1 ? '<div class="trf-cargo-path" style="font-size:11px;color:#64748b;margin-top:2px;">Път: ' + escVal(x.path.join(' → ')) + '</div>' : '') +
      '</div>';
  }).join('') + '</div>';
}

/* ── Карта на транспорта ─────────────────────────────────────────────────── */

function openTransferCard(id) { tfCardId = id; tfView = 'card'; renderTransfers(); }
function closeTransferCard() { tfCardId = null; tfView = 'list'; renderTransfers(); }

function renderTransferCard() {
  var wrap = document.getElementById('mod-transfers');
  var t = tfFindTransfer(tfCardId);
  if (!wrap) return;
  if (!t) { tfView = 'list'; renderTransfers(); return; }
  var cargo = tfCargoByTransfer[t.id] || [];
  var evs = tfEventsOf(t.id);
  var h = '<div id="trf-card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
      '<div class="pg-title" style="margin:0;">🔁 ' + escVal(t.transfer_num) + ' ' + tfStatusBadge(t) +
        ' <span class="trf-progress" style="font-size:13px;color:#64748b;font-weight:400;">' + escVal(tfProgressLabel(t)) + '</span></div>' +
      '<div style="display:flex;gap:6px;">' + tfReloadStores(t).map(function (s, k, a) {
        return '<button class="btn-sm trf-reload" data-s="' + tfAttr(s) + '" onclick="openReloadForm(\'' + tfAttr(t.id) + '\',this.getAttribute(\'data-s\'))">➕ Дотовари' + (a.length > 1 ? ' в ' + escVal(s) : '') + '</button>';
      }).join('') +
      '<button class="btn-sm" onclick="printTransfer(\'' + tfAttr(t.id) + '\')">🖨 Печат</button>' +
      '<button id="trf-card-back" class="btn-sm" onclick="closeTransferCard()">← Обратно</button></div>' +
    '</div>' +
    '<div style="font-size:13px;color:#334155;margin-bottom:12px;">' + escVal(tfModeLabel(t)) + ' · ' + escVal(tfDateLabel(t)) +
      (t.driver ? ' · шофьор ' + escVal(t.driver) : '') + (t.waybill_no ? ' · № ' + escVal(t.waybill_no) : '') +
      '<div style="margin-top:2px;">' + escVal(tfRouteText(t)) + '</div></div>';
  cargo.forEach(function (c, i) {
    var mine = tfCargoEvents(evs, c.id);
    var prevEv = tfChainPrevEvents(c);
    var acts = tfActionsFor(t, c, evs);
    var open = tfOpenProblems(c, evs).length;
    h += '<div class="trf-card-cargo" data-c="' + tfAttr(c.id) + '" style="border:1px solid ' + (open ? '#fecaca' : '#e2e8f0') + ';border-radius:8px;padding:10px;margin-bottom:8px;background:#fff;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
        '<div><b>' + escVal(tfCargoLabel(c, i)) + '</b>' +
          ((c.transfer_points || []).length ? '<span style="font-size:12px;color:#64748b;"> · през ' + escVal(c.transfer_points.join(' → ')) + '</span>' : '') +
          '<div class="trf-state" style="font-size:12px;margin-top:2px;">' + escVal(tfCargoStateText(t, c, evs)) + (open ? ' · <b style="color:#b91c1c;">⚠️ отворен проблем</b>' : '') + '</div>' +
          tfChainRefsHtml(c) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + acts.map(function (a) { return tfActBtn(t, c, a); }).join('') + '</div>' +
      '</div>' +
      (mine.length || prevEv.length ? '<ol class="trf-history" style="margin:8px 0 0;padding-left:20px;font-size:12px;color:#334155;">' +
        prevEv.map(function (x) {
          return '<li class="trf-hist-prev" style="color:#64748b;">' + escVal(x.num) + ' · ' + escVal(tfFmtTs(x.e.created_at)) + ' · <b>' + escVal(x.e.store_name) + '</b> · ' +
            escVal(tfEventText(x.e)) + tfPhotoThumbs(x.e) + '</li>';
        }).join('') +
        mine.map(function (e) {
        return '<li>' + escVal(tfFmtTs(e.created_at)) + ' · <b>' + escVal(e.store_name) + '</b> · ' + escVal(tfEventText(e)) +
          tfPhotoThumbs(e) + '</li>';
      }).join('') + '</ol>' : '') +
    '</div>';
  });
  wrap.innerHTML = h + '</div>';
}

/* ── Прозорчето за отметка ───────────────────────────────────────────────── */

function tfFindCargo(tid, cid) {
  var t = tfFindTransfer(tid);
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
function tfSyncStatus(t, extra, what) {
  var st = tfComputeStatus(t, tfCargoByTransfer[t.id] || [], tfEventsOf(t.id)).status;
  var body = {};
  if (st !== t.status) body.status = st;
  if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
  if (!Object.keys(body).length) return Promise.resolve(true);
  return sbPatch('transfers', 'id=eq.' + t.id, body).then(function (res) {
    if (!res || !res.ok) {
      toast((what || 'Отметката') + ' е записана, но транспортът НЕ е обновен (' + Object.keys(body).join(', ') + '): ' + sbErrMsg(res), '#dc2626');
      return false;
    }
    Object.keys(body).forEach(function (k) { t[k] = body[k]; });
    return true;
  });
}
