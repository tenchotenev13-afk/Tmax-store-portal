/* Чек лист — строителят на писмото.

   checklistEmailHtml() САМО строи HTML. Нищо не праща, няма бутон и няма
   запис в weekly_checklist_sends — това е отделна задача и тестът пази и
   това: нула заявки от извикването.

   ЗАЩО ПОЛОВИНАТА ПРОВЕРКИ СА ЗА МАРКЪП, А НЕ ЗА СЪДЪРЖАНИЕ
   Пощенските програми не разбират външен CSS. Клас без таблица със стилове
   е невидим атрибут, а <style> блок Gmail изрязва — писмото ще излезе като
   гола таблица без нищо. Затова:
     · нула class= в изхода
     · нула <link> и нула <style>
     · нула flex/grid
     · всеки видим елемент носи собствен inline style
   Това не се вижда при преглед на кода и не се вижда в jsdom, ако не се
   провери изрично. Реалният вид се потвърждава само с истинско пробно
   писмо до себе си.

   И: НУЛА ЛИНКОВЕ КЪМ ПОРТАЛА. Писмото отива до обектите, които нямат
   достъп до таб „Чек лист"; линк, водещ до отказан достъп, е по-лош от
   липсващ. Затова reportEmailShell() не се ползва — тя завършва с бутон
   „Отвори в портала →".

   Пускане:  node tests/checklist-email.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const METRICS = [
  { key:'revizia_953',     label:'ревизия',                   sublabel:'953',                             value_type:'yes_no',      sort_order:1, active:true },
  { key:'spravka_minusi',  label:'справка минуси',            sublabel:'подадено в срок/правилно',        value_type:'yes_no',      sort_order:2, active:true },
  { key:'stoka_vrashtane', label:'Стока за връщане- ТАБЛИЦИ', sublabel:'актуализирано от обекта',         value_type:'yes_no',      sort_order:3, active:true },
  { key:'storna_priem',    label:'Сторна по грешни приеми',   sublabel:'брой сторнирани поръчки/позиции', value_type:'number',      sort_order:4, active:true },
  { key:'stoka_na_pat',    label:'стока на път',              sublabel:'подадено в срок',                 value_type:'yes_no',      sort_order:5, active:true },
  { key:'preocenka',       label:'преоценка',                 sublabel:'подадено в срок/правилно',        value_type:'yes_no_none', sort_order:6, active:true }
];

/* 18-те отчетни обекта. */
const STORES = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Монтана', 'Петрич', 'Пирдоп', 'Раднево',
  'Севлиево', 'Силистра', 'Сливен', 'Троян', 'Търговище', 'Шумен'
];

const ADMIN = { id:'u-1', email:'c.teneva@temax.bg', display_name:'Ц. Тенева',
                role:'admin', store_name:'Централен офис' };

function env() {
  return boot({
    modules: ['bulletin.js', 'checklist.js'],
    user: ADMIN,
    data: { users: [], weekly_checklist_metrics: [], weekly_checklist: [] }
  });
}

function row(store, key, over) {
  return Object.assign({
    store_name: store, metric_key: key,
    portal_value: null, control_value: null, control_num: null, comment: null
  }, over || {});
}

/* Разбира готовото писмо като DOM, за да се броят редове и клетки. */
function parse(h, html) {
  const d = h.doc.implementation.createHTMLDocument('mail');
  d.body.innerHTML = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
  return d;
}
function tables(d) { return Array.prototype.slice.call(d.querySelectorAll('table')); }
function gridOf(d) { return tables(d)[0] || null; }
function bodyRows(d) {
  const t = gridOf(d);
  return t ? Array.prototype.slice.call(t.querySelectorAll('tbody tr')) : [];
}
function rowOf(d, store) {
  return bodyRows(d).filter(function (tr) {
    const f = tr.querySelector('td');
    return f && f.textContent.trim() === store;
  })[0] || null;
}
function cellText(d, store, key) {
  const tr = rowOf(d, store);
  if (!tr) return null;
  const i = METRICS.map(function (m) { return m.key; }).indexOf(key);
  const td = tr.querySelectorAll('td')[i + 1];
  return td ? td.textContent.trim() : null;
}

(async function () {

  const h = env();
  const W = h.w;

  /* ── 1. Скелетът ─────────────────────────────────────────────────────── */
  section('1. Шапка, размери, 18 × 6');
  {
    const html = W.checklistEmailHtml(2026, 34, 1, [], METRICS, STORES, null);
    const d = parse(h, html);

    ok('заглавието носи седмицата и годината',
       html.indexOf('Чек лист — Седмица 34 · 2026') >= 0);
    ok('подзаглавието носи датите на седмицата (пон–нед)',
       html.indexOf('17.08 – 23.08.2026') >= 0,
       (html.match(/\d\d\.\d\d – \d\d\.\d\d\.\d{4}/) || ['няма'])[0]);

    ok('18 реда в тялото', bodyRows(d).length === 18, 'реално: ' + bodyRows(d).length);
    const ths = gridOf(d) ? gridOf(d).querySelectorAll('thead th') : [];
    ok('7 колони в шапката (Обект + 6 показателя)', ths.length === 7,
       'реално: ' + ths.length);
    const first = bodyRows(d)[0];
    ok('редът има 7 клетки', !!first && first.querySelectorAll('td').length === 7,
       first ? 'реално: ' + first.querySelectorAll('td').length : 'няма ред');

    /* Шапката е на две нива в една клетка. */
    ok('шапката носи label', ths[1] && ths[1].textContent.indexOf('ревизия') >= 0);
    ok('и sublabel', ths[1] && ths[1].textContent.indexOf('953') >= 0);
    ok('sublabel е в отделен, по-дребен ред',
       ths[1] && ths[1].querySelectorAll('div').length === 2,
       ths[1] ? String(ths[1].querySelectorAll('div').length) : 'няма');
    ok('колоните са по реда на metrics',
       ths[4] && ths[4].textContent.indexOf('Сторна') >= 0, ths[4] ? ths[4].textContent : '');
  }

  /* ── 2. Стойностите ──────────────────────────────────────────────────── */
  section('2. control бие portal; преводът и съотношенията');
  {
    const rows = [
      row('Враца', 'revizia_953', { portal_value:'da', control_value:'ne' }),
      row('Габрово', 'revizia_953', { portal_value:'da' }),
      row('Добрич', 'preocenka', { control_value:'nyamat' }),
      row('Дупница', 'spravka_minusi', { portal_value:'4/5' }),
      row('Карлово', 'spravka_minusi', { portal_value:'0/5', control_value:'da' }),
      row('Козлодуй', 'storna_priem', { control_num: 7, portal_value:'da' }),
      row('Кърджали', 'storna_priem', { control_num: 0 })
    ];
    const d = parse(h, W.checklistEmailHtml(2026, 34, 1, rows, METRICS, STORES, null));

    ok('control_value бие portal_value („не", не „да")',
       cellText(d, 'Враца', 'revizia_953') === 'не', cellText(d, 'Враца', 'revizia_953'));
    ok('само portal_value → „да"',
       cellText(d, 'Габрово', 'revizia_953') === 'да', cellText(d, 'Габрово', 'revizia_953'));
    ok('nyamat → „нямат"',
       cellText(d, 'Добрич', 'preocenka') === 'нямат', cellText(d, 'Добрич', 'preocenka'));
    ok('„4/5" остава както е, не се превежда',
       cellText(d, 'Дупница', 'spravka_minusi') === '4/5', cellText(d, 'Дупница', 'spravka_minusi'));
    ok('control бие и при съотношение',
       cellText(d, 'Карлово', 'spravka_minusi') === 'да', cellText(d, 'Карлово', 'spravka_minusi'));
    ok('number показва control_num, не portal_value',
       cellText(d, 'Козлодуй', 'storna_priem') === '7', cellText(d, 'Козлодуй', 'storna_priem'));
    ok('нулата се показва, не пада в празно',
       cellText(d, 'Кърджали', 'storna_priem') === '0', cellText(d, 'Кърджали', 'storna_priem'));
  }

  /* ── 3. Празната клетка ──────────────────────────────────────────────── */
  section('3. Липсваща стойност → празно, не „undefined"');
  {
    const rows = [
      row('Враца', 'revizia_953', { portal_value:'da' }),
      /* Ред, който СЪЩЕСТВУВА, но е с нулеви стойности — записан само заради
         коментар. Пази го друг пазач, не липсата на ред. */
      row('Габрово', 'revizia_953', { comment:'магазинът не отговори' })
    ];
    const html = W.checklistEmailHtml(2026, 34, 1, rows, METRICS, STORES, null);
    const d = parse(h, html);

    ok('липсващ ред → празна клетка',
       cellText(d, 'Добрич', 'revizia_953') === '', JSON.stringify(cellText(d, 'Добрич', 'revizia_953')));
    ok('ред с нулеви стойности → също празна',
       cellText(d, 'Габрово', 'revizia_953') === '', JSON.stringify(cellText(d, 'Габрово', 'revizia_953')));
    ok('никъде „undefined"', html.indexOf('undefined') < 0);
    ok('никъде „null"', html.indexOf('null') < 0);
    /* esc() връща „—" за празно; escVal() не. Точно това пази клетките. */
    ok('никъде измислено тире в клетките',
       bodyRows(d).every(function (tr) { return tr.textContent.indexOf('—') < 0; }));
  }

  /* ── 4. Лентата за поправена версия ──────────────────────────────────── */
  section('4. version = 1 без лента, version = 2 с лента');
  {
    const v1 = W.checklistEmailHtml(2026, 34, 1, [], METRICS, STORES, null);
    ok('при версия 1 НЯМА лента', v1.indexOf('Поправена версия') < 0);

    const v2 = W.checklistEmailHtml(2026, 34, 2, [], METRICS, STORES, 'поправена Враца');
    ok('при версия 2 ИМА лента', v2.indexOf('Поправена версия 2') >= 0);
    ok('лентата носи днешната дата',
       v2.indexOf(W.fmtDate(W.toLocalISO(new Date()))) >= 0,
       W.fmtDate(W.toLocalISO(new Date())));
    ok('лентата носи бележката', v2.indexOf('поправена Враца') >= 0);

    /* Без бележка лентата пак се показва — версията е важната част. */
    const v3 = W.checklistEmailHtml(2026, 34, 3, [], METRICS, STORES, null);
    ok('версия 3 без бележка пак има лента', v3.indexOf('Поправена версия 3') >= 0);
    ok('и не пише „null" вместо бележка', v3.indexOf('null') < 0);

    /* Лентата е НАД таблицата. */
    ok('лентата е преди таблицата',
       v2.indexOf('Поправена версия') < v2.indexOf('<table'), 'редът е обърнат');
  }

  /* ── 5. Коментарите ──────────────────────────────────────────────────── */
  section('5. Коментарите; при нула — секцията отпада');
  {
    const none = W.checklistEmailHtml(2026, 34, 1,
      [row('Враца', 'revizia_953', { portal_value:'da' })], METRICS, STORES, null);
    ok('нула коментара → няма заглавие „Коментари"', none.indexOf('Коментари') < 0);
    ok('и няма втора таблица', parse(h, none).querySelectorAll('table').length === 1,
       'реално таблици: ' + parse(h, none).querySelectorAll('table').length);

    const rows = [
      row('Враца', 'revizia_953', { control_value:'ne', comment:'закъсня с 2 дни' }),
      row('Шумен', 'preocenka', { control_value:'nyamat', comment:'няма какво да подават' })
    ];
    const html = W.checklistEmailHtml(2026, 34, 1, rows, METRICS, STORES, null);
    ok('има секция „Коментари"', html.indexOf('Коментари') >= 0);
    ok('редът е „Обект · показател: текст"',
       html.indexOf('Враца</b> · ревизия: закъсня с 2 дни') >= 0,
       (html.match(/Враца<\/b>[^<]*[^\n]{0,60}/) || ['няма'])[0]);
    ok('вторият коментар също е вътре', html.indexOf('няма какво да подават') >= 0);
    ok('клетка без коментар не влиза',
       html.indexOf('Габрово</b> ·') < 0);
  }

  /* ── 6. Легендата ────────────────────────────────────────────────────── */
  section('6. Легендата дословно, същата като в таба');
  {
    const html = W.checklistEmailHtml(2026, 34, 1, [], METRICS, STORES, null);
    ok('ДА', html.indexOf('има изпратена преоценка.') >= 0);
    ok('НЕ', html.indexOf('от магазина не са писали, че няма преоценка.') >= 0);
    ok('НЯМАТ', html.indexOf('не са подавали, но магазинът е писал, че няма преоценка.') >= 0);
    /* ЕДИН източник за таба и писмото — иначе двете се разминават. */
    const tab = W.checklistLegendHtml();
    ok('трите реда идват от същия източник като таба',
       W.CHECKLIST_LEGEND_LINES.length === 3 &&
       tab.indexOf('има изпратена преоценка.') >= 0);
  }

  /* ── 7. ЯДРОТО: писмото е годно за поща ──────────────────────────────── */
  section('7. Всичко inline, нула class, нула линкове');
  {
    const rows = [row('Враца', 'revizia_953', { control_value:'ne', comment:'бележка' })];
    const html = W.checklistEmailHtml(2026, 34, 2, rows, METRICS, STORES, 'поправка');

    ok('нула class= атрибути', html.indexOf('class=') < 0,
       (html.match(/class="[^"]*"/) || ['—'])[0]);
    ok('нула <link>', html.toLowerCase().indexOf('<link') < 0);
    ok('нула <style> блокове', html.toLowerCase().indexOf('<style') < 0);
    ok('нула display:flex', html.indexOf('display:flex') < 0);
    ok('нула display:grid', html.indexOf('display:grid') < 0);
    ok('нула position:sticky (таба го ползва, пощата не го разбира)',
       html.indexOf('position:sticky') < 0);

    /* Няма линкове изобщо — обектите нямат достъп до таба. */
    ok('нула <a> тагове', html.toLowerCase().indexOf('<a ') < 0,
       (html.match(/<a [^>]*>/) || ['—'])[0]);
    ok('нула „Отвори в портала"', html.indexOf('Отвори в портала') < 0);

    /* А стиловете ги ИМА — инак горните проверки минават и за празен низ. */
    const d = parse(h, html);
    const cells = gridOf(d).querySelectorAll('td');
    ok('всяка клетка носи собствен inline style',
       Array.prototype.every.call(cells, function (td) {
         return (td.getAttribute('style') || '').length > 10;
       }), 'има клетка без style');
    ok('и клетките в шапката също',
       Array.prototype.every.call(gridOf(d).querySelectorAll('th'), function (th) {
         return (th.getAttribute('style') || '').length > 10;
       }));
    ok('таблицата е с role=presentation и border-collapse',
       (gridOf(d).getAttribute('role') === 'presentation') &&
       (gridOf(d).getAttribute('style') || '').indexOf('border-collapse') >= 0,
       gridOf(d).getAttribute('style'));
    ok('лейаутът е <table>, не div-ове с flex',
       html.indexOf('<table') >= 0);
  }

  /* ── 8. Само строи ───────────────────────────────────────────────────── */
  section('8. Функцията нищо не праща');
  {
    h.calls.post.length = 0;
    h.calls.patch.length = 0;
    h.calls.get.length = 0;
    const html = W.checklistEmailHtml(2026, 34, 2, [], METRICS, STORES, 'x');
    ok('връща низ', typeof html === 'string' && html.length > 500, typeof html);
    ok('нула POST', h.calls.post.length === 0);
    ok('нула PATCH', h.calls.patch.length === 0);
    ok('нула GET', h.calls.get.length === 0);
    ok('нула DELETE', h.calls.del.length === 0);

    /* Празни входове не гърмят. */
    let crashed = null;
    try { W.checklistEmailHtml(2026, 34, 1, null, null, null, null); }
    catch (e) { crashed = e; }
    ok('празни входове не хвърлят', !crashed, crashed ? crashed.message : '');
  }

  h.close();
  report();
})();
