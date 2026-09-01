/* checklist.js — таб „Чек лист"
   Седмичният контрол на контролинга: ред на обект, колона на показател.
   Огледало на лист „общо" от бланката, която дотук се водеше в Excel.

   ТАБЪТ САМО ЧЕТЕ. Няма редакция, няма запис, няма попълване на
   portal_value, няма имейл и няма износ. Всичко това е отделна задача —
   ако някой добави тук бутон „Запази", първо да прочете защо клетката има
   ДВЕ стойности (по-долу), иначе ще ги слее в една.

   ДВЕТЕ СТОЙНОСТИ НА КЛЕТКАТА
   portal_value е това, което казва порталът (пълни се автоматично, но
   ЗАСЕГА никой не го пише — колоната стои празна). control_value е това,
   което отмята контролингът. Показва се control_value, ако е попълнена;
   иначе portal_value, но по-бледо и в курсив. Разликата във вида е
   съществена, не козметика: бледото е ПРЕДПОЛОЖЕНИЕ на портала, не
   потвърдена отметка, и не бива да се чете като свършена работа.

   ПРАЗНА КЛЕТКА
   Няма ли ред в weekly_checklist за (седмица, обект, показател), клетката е
   празна. Не се измисля 'не', не се измисля тире. Два отделни пазача:
   ранното `if (!row) return ''` за липсващ ред, и `if (text !== '')` за ред,
   който съществува, но е с нулеви стойности (запис само заради коментар).
   Вторият е важният: esc() в shared.js връща '—' за празен низ, тоест без
   него мрежата се напълва с тирета, които изглеждат като данни. Затова и
   стойностите минават през escVal(), не през esc().

   ЗАЩО ТАБЛИЦАТА НЕ ИЗЧЕЗВА ПРИ ЛИПСА НА ДАННИ
   При седмица без нито един ред се рендира пълната мрежа — 18 обекта × 6
   показателя, всичките клетки празни. НЕ „няма данни". Контрол, който
   изчезва според данните, изглежда като счупен, а и точно празната мрежа
   е информацията: никой нищо не е отметнал. */

/* ── Състояние ───────────────────────────────────────────────────────────── */
var checklistYear = null;      /* ISO година на показаната седмица */
var checklistWeek = null;      /* номер на показаната седмица */
var checklistMetrics = [];     /* weekly_checklist_metrics, активните, по sort_order */
var checklistRows = [];        /* weekly_checklist за показаната седмица */
var checklistStores = [];      /* 18-те отчетни обекта */

/* Стойностите се пазят в базата на латиница, за да не зависи схемата от
   изписването. Превеждат се само тук, при показване. */
var CHECKLIST_VALUE_LABELS = { da: 'да', ne: 'не', nyamat: 'нямат' };

/* ═══════════════════════════════════════════════════════════════════════════
   ДОСТЪП
   ═══════════════════════════════════════════════════════════════════════════ */

/* notify_groups идва от Postgres като масив, но PostgREST го подава и като
   низ '{co,controlling}' в някои пътища — затова и двете форми.

   ⚠️ admin.js има свой notifyGroupsOf() за същата колона. Двете НЕ са
   слети нарочно: admin.js е за списъка с потребители и се зарежда след
   този файл, а сливането им иска пипане на трети файл. Разминат ли се,
   единственото, което ще се различи, е кой вижда таба. */
function checklistGroupsOf(u) {
  var g = u && u.notify_groups;
  if (Array.isArray(g)) return g;
  if (typeof g === 'string' && g.length > 2) {
    return g.replace(/^{|}$/g, '').split(',')
      .map(function (s) { return s.trim().replace(/^"|"$/g, ''); })
      .filter(Boolean);
  }
  return [];
}

/* Роля admin ИЛИ notify_groups съдържа 'controlling'.

   ⚠️ ВТОРАТА ПОЛОВИНА ДНЕС Е СПЯЩА. Едж функцията auth-login връща
   currentUser без notify_groups (select-ът ѝ е
   id,email,password,password_hash,store_name,role,display_name,
   assigned_stores,active), тоест полето стига дотук като undefined и
   проверката пада на false. Двамата с 'controlling' в базата към
   01.09.2026 са Цветелина Тенева и Миглена Павлова — и двете с роля
   admin, затова днес разлика не се вижда. Даде ли се 'controlling' на
   не-админ, той няма да види таба, докато notify_groups не влезе в
   select-а на auth-login (и функцията не се преразпредели ръчно).
   Заковано е в tests/checklist-view.test.js. */
function canSeeChecklist() {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  return checklistGroupsOf(currentUser).indexOf('controlling') >= 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   СЕДМИЦА
   ═══════════════════════════════════════════════════════════════════════════ */

/* ISO годината не е календарната: 1 януари може да падне в седмица 52/53 на
   предходната година. Четвъртъкът на седмицата винаги е в нейната ISO
   година — същото изместване, което ползва и weekNum() в bulletin.js. */
function checklistIsoYear(d) {
  var dt = new Date(d); dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  return dt.getFullYear();
}

/* По подразбиране се показва ПРИКЛЮЧИЛАТА седмица, не текущата: контролингът
   отмята постфактум, а текущата седмица още не е приключила и мрежата ѝ би
   била празна по съвсем законна причина — което изглежда точно като
   „никой нищо не е отметнал". */
function checklistDefaultWeek() {
  var d = new Date(); d.setDate(d.getDate() - 7);
  return { year: checklistIsoYear(d), week: weekNum(d) };
}

/* Навигацията минава през реална дата (понеделника на показаната седмица
   ± 7 дни), а не през week±1. Така прескачането на година е за сметка на
   календара: седмица 1 назад дава 52 или 53 според годината, без тук да се
   пише кое от двете. */
function checklistShiftWeek(delta) {
  var mon = weekDays(checklistWeek, checklistYear)[0];
  mon.setDate(mon.getDate() + delta * 7);
  checklistYear = checklistIsoYear(mon);
  checklistWeek = weekNum(mon);
  loadChecklist();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ЗАРЕЖДАНЕ
   ═══════════════════════════════════════════════════════════════════════════ */
function loadChecklist() {
  var wrap = document.getElementById('mod-checklist');
  if (!wrap) return;

  if (!canSeeChecklist()) {
    wrap.innerHTML = '<div class="page"><div style="text-align:center;padding:40px;color:#94a3b8;">' +
      'Нямаш достъп до този модул.</div></div>';
    return;
  }

  if (checklistWeek === null) {
    var def = checklistDefaultWeek();
    checklistYear = def.year;
    checklistWeek = def.week;
  }

  wrap.innerHTML = '<div class="page"><div style="text-align:center;padding:30px;color:#94a3b8;">⏳ Зареждане...</div></div>';

  Promise.all([
    sbGet('weekly_checklist_metrics', 'active=eq.true&order=sort_order'),
    sbGet('weekly_checklist', 'year=eq.' + checklistYear + '&week_number=eq.' + checklistWeek),
    /* Обектите идват от users през общия филтър isReportableStore() — 18.
       НЕ таблицата stores: тя брои и ЦО, двата склада и обекти без нито
       един акаунт (23 реда), тоест мрежата би имала пет реда, които няма
       кой да отметне. Същият източник като отчетите, „Днес" и Палети. */
    loadReportableStores()
  ]).then(function (res) {
    checklistMetrics = Array.isArray(res[0]) ? res[0] : [];
    checklistRows = Array.isArray(res[1]) ? res[1] : [];
    checklistStores = Array.isArray(res[2]) ? res[2] : [];
    renderChecklist();
  }).catch(function () {
    checklistMetrics = []; checklistRows = []; checklistStores = [];
    renderChecklist();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   РЕНДЕР
   ═══════════════════════════════════════════════════════════════════════════ */

/* Ключ обект+показател. Индексът се строи веднъж на рендер — иначе 18×6
   клетки значат 108 обхождания на масива. */
function checklistIndex() {
  var idx = {};
  checklistRows.forEach(function (r) {
    idx[r.store_name + ' ' + r.metric_key] = r;
  });
  return idx;
}

function checklistValueLabel(val) {
  if (val === null || val === undefined || val === '') return '';
  /* Непозната стойност се показва както е в базата. Не се превежда наум и
     не се скрива — новата стойност трябва да си личи, а не да изчезне. */
  return CHECKLIST_VALUE_LABELS[val] || String(val);
}

/* Съдържанието на една клетка. Връща само вътрешността на <td>. */
function checklistCellInner(metric, row) {
  if (!row) return '';

  var text = '', faint = false;

  if (metric.value_type === 'number') {
    /* При числов показател водещото е control_num. control_value не се
       ползва за този тип и нарочно не се показва вместо числото — иначе
       „да" би минало за брой. */
    if (row.control_num !== null && row.control_num !== undefined && row.control_num !== '') {
      text = String(row.control_num);
    } else if (row.portal_value) {
      text = checklistValueLabel(row.portal_value); faint = true;
    }
  } else {
    if (row.control_value !== null && row.control_value !== undefined && row.control_value !== '') {
      text = checklistValueLabel(row.control_value);
    } else if (row.portal_value !== null && row.portal_value !== undefined && row.portal_value !== '') {
      text = checklistValueLabel(row.portal_value); faint = true;
    }
  }

  var out = '';
  if (text !== '') {
    out += faint
      ? '<span title="Стойност от портала — не е потвърдена от контролинга" style="color:#94a3b8;font-style:italic;">' + escVal(text) + '</span>'
      : '<span style="font-weight:600;color:#0f172a;">' + escVal(text) + '</span>';
  }
  if (row.comment) {
    out += '<span title="' + escAttr(row.comment) + '" style="cursor:help;margin-left:4px;">💬</span>';
  }
  return out;
}

function checklistHeaderHtml() {
  var days = weekDays(checklistWeek, checklistYear);
  var range = fmtD(days[0]) + '–' + fmtD(days[6]);
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
    '<h2 style="margin:0;font-size:18px;">🗓️ Чек лист</h2>' +
    '<div style="display:flex;align-items:center;gap:6px;">' +
      '<button class="btn-sm" onclick="checklistShiftWeek(-1)" title="Предходна седмица">←</button>' +
      '<span style="font-weight:700;font-size:14px;min-width:150px;text-align:center;">' +
        'Седмица ' + checklistWeek + ' · ' + checklistYear +
        '<span style="display:block;font-weight:400;font-size:11px;color:#64748b;">' + range + '</span>' +
      '</span>' +
      '<button class="btn-sm" onclick="checklistShiftWeek(1)" title="Следваща седмица">→</button>' +
    '</div>' +
  '</div>';
}

function checklistLegendHtml() {
  /* Дословно от бланката. Не се преформулира — контролингът чете тези три
     реда точно така и разликата между „не" и „нямат" е целият им смисъл. */
  return '<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#334155;line-height:1.7;">' +
    '<div><b>ДА</b> — има изпратена преоценка.</div>' +
    '<div><b>НЕ</b> — от магазина не са писали, че няма преоценка.</div>' +
    '<div><b>НЯМАТ</b> — не са подавали, но магазинът е писал, че няма преоценка.</div>' +
  '</div>';
}

function renderChecklist() {
  var wrap = document.getElementById('mod-checklist');
  if (!wrap) return;

  var idx = checklistIndex();
  var cellCss = 'border:1px solid #e2e8f0;padding:6px 8px;text-align:center;font-size:12px;';

  var h = '<div class="page">' + checklistHeaderHtml();

  h += '<div style="overflow-x:auto;">' +
    '<table id="checklist-table" style="border-collapse:collapse;width:100%;min-width:760px;">';

  /* Шапка на две нива: label отгоре, sublabel отдолу и по-дребно. Двата реда
     са в един <th> с <div>-ове, не два <tr> с rowspan — така колоната на
     обекта не иска rowspan и подравняването не зависи от височината. */
  h += '<thead><tr>' +
    '<th style="' + cellCss + 'background:#f1f5f9;text-align:left;position:sticky;left:0;z-index:1;min-width:150px;">Обект</th>';
  checklistMetrics.forEach(function (m) {
    h += '<th style="' + cellCss + 'background:#f1f5f9;vertical-align:bottom;">' +
      '<div style="font-weight:700;color:#0f172a;">' + escVal(m.label) + '</div>' +
      (m.sublabel ? '<div style="font-weight:400;font-size:10px;color:#64748b;margin-top:2px;">' + escVal(m.sublabel) + '</div>' : '') +
    '</th>';
  });
  h += '</tr></thead><tbody>';

  checklistStores.forEach(function (store) {
    h += '<tr>' +
      '<td style="' + cellCss + 'text-align:left;font-weight:600;background:#fff;position:sticky;left:0;">' + escVal(store) + '</td>';
    checklistMetrics.forEach(function (m) {
      h += '<td style="' + cellCss + '">' + checklistCellInner(m, idx[store + ' ' + m.key]) + '</td>';
    });
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  h += checklistLegendHtml();
  h += '</div>';

  wrap.innerHTML = h;
}
