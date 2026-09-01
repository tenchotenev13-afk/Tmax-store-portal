/* Таб „Чек лист" — изгледът на контролинга.

   Табът само ЧЕТЕ. Затова проверките тук са за три неща, всяко от които е
   било грешка някъде другаде в портала:

   1. МРЕЖАТА НЕ ИЗЧЕЗВА ПРИ ПРАЗНА БАЗА. Седмица без нито един ред пак
      рендира 18 обекта × 6 показателя с празни клетки. „Няма данни" би
      скрило точно информацията, че никой нищо не е отметнал.
   2. control_value БИЕ portal_value, а portal_value се вижда РАЗЛИЧНО.
      Бледото е предположение на портала, не потвърдена отметка; слеят ли
      се визуално, контролингът чете чужда работа като своя.
   3. ЛИПСВАЩ РЕД ДАВА ПРАЗНА КЛЕТКА, не 'undefined' и не измислено 'не'.
      esc() в shared.js връща '—' за празен низ — затова стойностите минават
      през escVal(). Тази проверка пази точно това.

   Пускане:  node tests/checklist-view.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

/* 21-те различни store_name от users към 01.09.2026. ЦО и двата склада са
   тук нарочно: филтърът isReportableStore() трябва да ги маха, а дубликатът
   на „Шумен" проверява и дедупликацията. 21 - 3 = 18. */
const USERS = [
  'Враца', 'Габрово', 'Гоце Делчев', 'Добрич', 'Дупница', 'Карлово',
  'Козлодуй', 'Кърджали', 'Логистичен склад Добрич', 'Логистичен склад Търговище',
  'Монтана', 'Петрич', 'Пирдоп', 'Раднево', 'Севлиево', 'Силистра',
  'Сливен', 'Троян', 'Търговище', 'Централен офис', 'Шумен', 'Шумен'
].map(function (s) { return { store_name: s }; });

const METRICS = [
  { key: 'revizia_953',     label: 'ревизия',                   sublabel: '953',                             value_type: 'yes_no',      sort_order: 1, active: true },
  { key: 'spravka_minusi',  label: 'справка минуси',            sublabel: 'подадено в срок/правилно',        value_type: 'yes_no',      sort_order: 2, active: true },
  { key: 'stoka_vrashtane', label: 'Стока за връщане- ТАБЛИЦИ', sublabel: 'подадено в срок',                 value_type: 'yes_no',      sort_order: 3, active: true },
  { key: 'storna_priem',    label: 'Сторна по грешни приеми',   sublabel: 'брой сторнирани поръчки/позиции', value_type: 'number',      sort_order: 4, active: true },
  { key: 'stoka_na_pat',    label: 'стока на път',              sublabel: 'подадено в срок',                 value_type: 'yes_no',      sort_order: 5, active: true },
  { key: 'preocenka',       label: 'преоценка',                 sublabel: 'подадено в срок/правилно',        value_type: 'yes_no_none', sort_order: 6, active: true }
];

const ADMIN      = { id: 'u-1', email: 'c.teneva@temax.bg', display_name: 'Ц. Тенева', role: 'admin',   store_name: 'Централен офис' };
const MANAGER    = { id: 'u-2', email: 'shumen@temax.bg',   display_name: 'Шумен',     role: 'manager', store_name: 'Шумен' };
const CONTROLLER = { id: 'u-3', email: 'm.pavlova@temax.bg', display_name: 'М. Павлова', role: 'accounting', store_name: 'Централен офис', notify_groups: ['controlling'] };

function env(rows, user) {
  return boot({
    modules: ['bulletin.js', 'checklist.js'],   /* bulletin.js: weekNum/weekDays/fmtD */
    user: user || ADMIN,
    data: {
      users: USERS,
      weekly_checklist_metrics: METRICS,
      weekly_checklist: rows || []
    }
  });
}

function table(doc) { return doc.getElementById('checklist-table'); }
function bodyRows(doc) {
  const t = table(doc);
  return t ? Array.prototype.slice.call(t.querySelectorAll('tbody tr')) : [];
}
/* Редът на обекта по име — не по индекс, за да не се счупи при пренареждане. */
function rowOf(doc, store) {
  return bodyRows(doc).filter(function (tr) {
    const first = tr.querySelector('td');
    return first && first.textContent.trim() === store;
  })[0] || null;
}
/* Клетката на показател: колона 0 е обектът, затова +1. */
function cellOf(doc, store, metricKey) {
  const tr = rowOf(doc, store);
  if (!tr) return null;
  const i = METRICS.map(function (m) { return m.key; }).indexOf(metricKey);
  if (i < 0) return null;
  return tr.querySelectorAll('td')[i + 1] || null;
}

(async function () {

  /* ── 1. Празна база — мрежата пак е пълна ────────────────────────────── */
  section('1. Празна седмица рендира цялата мрежа');
  {
    const h = env([]);
    if (guard('loadChecklist() не хвърля', function () { h.w.loadChecklist(); })) {
      await ticks();

      ok('таблицата съществува', !!table(h.doc));
      ok('18 реда (21 store_name минус ЦО и двата склада, „Шумен" веднъж)',
         bodyRows(h.doc).length === 18, 'реално: ' + bodyRows(h.doc).length);

      const ths = table(h.doc) ? table(h.doc).querySelectorAll('thead th') : [];
      ok('7 колони в шапката (Обект + 6 показателя)', ths.length === 7,
         'реално: ' + ths.length);

      const firstRow = bodyRows(h.doc)[0];
      ok('редът има 7 клетки', !!firstRow && firstRow.querySelectorAll('td').length === 7,
         firstRow ? 'реално: ' + firstRow.querySelectorAll('td').length : 'няма ред');

      /* Точно това, което спецификацията забранява. */
      const html = h.doc.getElementById('mod-checklist').innerHTML;
      ok('НЕ пише „няма данни"', html.toLowerCase().indexOf('няма данни') < 0);
      ok('нито един „Логистичен склад" ред', !rowOf(h.doc, 'Логистичен склад Добрич'));
      ok('няма ред „Централен офис"', !rowOf(h.doc, 'Централен офис'));
      ok('има ред „Шумен"', !!rowOf(h.doc, 'Шумен'));

      /* Шапката е на две нива: label и sublabel в един и същи <th>. */
      const th2 = ths[2];
      ok('шапката носи label', !!th2 && th2.textContent.indexOf('справка минуси') >= 0);
      ok('шапката носи и sublabel', !!th2 && th2.textContent.indexOf('подадено в срок/правилно') >= 0);
      ok('колоните са по sort_order (1-вата след „Обект" е „ревизия")',
         !!ths[1] && ths[1].textContent.indexOf('ревизия') >= 0);
    }
    h.close();
  }

  /* ── 2. Липсващ ред = празна клетка ──────────────────────────────────── */
  section('2. Няма ред в базата → празна клетка, не „undefined"');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    const c = cellOf(h.doc, 'Враца', 'revizia_953');
    if (ok('клетката съществува', !!c)) {
      ok('текстът е празен', c.textContent.trim() === '', 'реално: „' + c.textContent.trim() + '"');
      ok('няма „undefined"', c.innerHTML.indexOf('undefined') < 0, c.innerHTML);
      ok('няма „null"', c.innerHTML.indexOf('null') < 0, c.innerHTML);
      ok('няма измислено тире', c.textContent.indexOf('—') < 0, c.innerHTML);
      ok('няма измислено „не"', c.textContent.indexOf('не') < 0, c.innerHTML);
    }
    h.close();
  }

  /* Втората половина на същото: редът СЪЩЕСТВУВА, но всичките му стойности
     са null — така изглежда запис, направен само заради коментар. Пази го
     друг код, не ранното връщане при липсващ ред: пазачът `if (text !== '')`
     около самия <span>. Без него esc('') връща „—" и мрежата се напълва с
     тирета, които изглеждат като данни.
     (Проверено чрез мутация: махне ли се пазачът и escVal стане esc, тези
     три реда падат — единствените в целия пакет.) */
  {
    const h = env([
      { store_name: 'Враца', metric_key: 'revizia_953',
        portal_value: null, control_value: null, control_num: null, comment: 'магазинът не отговори' }
    ]);
    h.w.loadChecklist();
    await ticks();

    const c = cellOf(h.doc, 'Враца', 'revizia_953');
    if (ok('клетката на празния ред съществува', !!c)) {
      ok('няма тире при ред с нулеви стойности', c.textContent.indexOf('—') < 0, c.innerHTML);
      ok('няма празен <span> със стил', c.innerHTML.indexOf('font-weight:600') < 0, c.innerHTML);
      /* Коментарът все пак се вижда — иначе редът просто е невидим. */
      ok('коментарът пак излиза', c.textContent.indexOf('💬') >= 0, c.innerHTML);
    }
    h.close();
  }

  /* ── 3. control_value бие portal_value ───────────────────────────────── */
  section('3. control_value има превес над portal_value');
  {
    const h = env([
      { store_name: 'Враца', metric_key: 'revizia_953', portal_value: 'da', control_value: 'ne', control_num: null, comment: null },
      { store_name: 'Габрово', metric_key: 'revizia_953', portal_value: 'da', control_value: null, control_num: null, comment: null }
    ]);
    h.w.loadChecklist();
    await ticks();

    const c = cellOf(h.doc, 'Враца', 'revizia_953');
    if (ok('клетката на Враца съществува', !!c)) {
      ok('показва „не" (control_value)', c.textContent.indexOf('не') >= 0, c.innerHTML);
      ok('НЕ показва „да" (portal_value е скрито)', c.textContent.indexOf('да') < 0, c.innerHTML);
      /* Анти-тавтология: потвърдената стойност НЕ бива да е бледа. Ако тази
         проверка падне заедно със следващата секция, значи двата вида са
         слети и „различено" не значи нищо. */
      ok('потвърдената стойност не е в курсив', c.innerHTML.indexOf('italic') < 0, c.innerHTML);
    }
    h.close();
  }

  /* ── 4. portal_value се вижда, но различено ──────────────────────────── */
  section('4. portal_value при празно control_value — по-бледо');
  {
    const h = env([
      { store_name: 'Габрово', metric_key: 'spravka_minusi', portal_value: 'da', control_value: null, control_num: null, comment: null }
    ]);
    h.w.loadChecklist();
    await ticks();

    const c = cellOf(h.doc, 'Габрово', 'spravka_minusi');
    if (ok('клетката на Габрово съществува', !!c)) {
      ok('показва „да"', c.textContent.indexOf('да') >= 0, c.innerHTML);
      ok('в курсив (различено от отметнатото)', c.innerHTML.indexOf('italic') >= 0, c.innerHTML);
      ok('в бледо сиво', c.innerHTML.indexOf('#94a3b8') >= 0, c.innerHTML);
      ok('носи обяснение в tooltip', c.innerHTML.indexOf('не е потвърдена') >= 0, c.innerHTML);
    }
    h.close();
  }

  /* ── 5. Превод на стойностите ────────────────────────────────────────── */
  section('5. da/ne/nyamat се изписват на български');
  {
    const h = env([
      { store_name: 'Враца',   metric_key: 'preocenka', portal_value: null, control_value: 'nyamat', control_num: null, comment: null },
      { store_name: 'Габрово', metric_key: 'preocenka', portal_value: null, control_value: 'da',     control_num: null, comment: null },
      { store_name: 'Добрич',  metric_key: 'preocenka', portal_value: null, control_value: 'ne',     control_num: null, comment: null },
      /* Непозната стойност — показва се както е, не изчезва и не се превежда наум. */
      { store_name: 'Троян',   metric_key: 'preocenka', portal_value: null, control_value: 'chastichno', control_num: null, comment: null }
    ]);
    h.w.loadChecklist();
    await ticks();

    ok('nyamat → „нямат"', (cellOf(h.doc, 'Враца', 'preocenka') || {}).textContent.trim() === 'нямат',
       JSON.stringify((cellOf(h.doc, 'Враца', 'preocenka') || {}).textContent));
    ok('da → „да"',  (cellOf(h.doc, 'Габрово', 'preocenka') || {}).textContent.trim() === 'да');
    ok('ne → „не"',  (cellOf(h.doc, 'Добрич', 'preocenka') || {}).textContent.trim() === 'не');
    ok('непозната стойност се показва сурова, не се губи',
       (cellOf(h.doc, 'Троян', 'preocenka') || {}).textContent.indexOf('chastichno') >= 0);
    h.close();
  }

  /* ── 6. Числов показател ─────────────────────────────────────────────── */
  section('6. value_type=number показва control_num');
  {
    const h = env([
      { store_name: 'Враца',   metric_key: 'storna_priem', portal_value: null, control_value: null, control_num: 7, comment: null },
      /* Нула е стойност, не липса — не бива да пада в празна клетка. */
      { store_name: 'Габрово', metric_key: 'storna_priem', portal_value: null, control_value: null, control_num: 0, comment: null }
    ]);
    h.w.loadChecklist();
    await ticks();

    ok('7 се показва', (cellOf(h.doc, 'Враца', 'storna_priem') || {}).textContent.trim() === '7');
    ok('нулата се показва, не е празна клетка',
       (cellOf(h.doc, 'Габрово', 'storna_priem') || {}).textContent.trim() === '0',
       JSON.stringify((cellOf(h.doc, 'Габрово', 'storna_priem') || {}).textContent));
    h.close();
  }

  /* ── 7. Коментар ─────────────────────────────────────────────────────── */
  section('7. Коментарът излиза като 💬 с tooltip');
  {
    const h = env([
      { store_name: 'Враца', metric_key: 'revizia_953', portal_value: null, control_value: 'ne', control_num: null,
        comment: 'подадено със "закъснение" от 2 дни' }
    ]);
    h.w.loadChecklist();
    await ticks();

    const c = cellOf(h.doc, 'Враца', 'revizia_953');
    if (ok('клетката съществува', !!c)) {
      ok('има 💬', c.textContent.indexOf('💬') >= 0, c.innerHTML);
      ok('коментарът е в title', (c.innerHTML || '').indexOf('закъснение') >= 0, c.innerHTML);
      /* Кавичките в коментара минават през escAttr() — иначе затварят
         title="" и остатъкът се чете като markup. */
      const span = c.querySelector('span[title*="закъснение"]');
      ok('title е цял, кавичките не са го скъсали',
         !!span && span.getAttribute('title').indexOf('от 2 дни') >= 0,
         span ? span.getAttribute('title') : 'няма span с title');
    }
    /* Клетка без коментар няма балонче — иначе проверката по-горе е тавтология. */
    ok('клетка без коментар е без 💬',
       (cellOf(h.doc, 'Габрово', 'revizia_953') || {}).textContent.indexOf('💬') < 0);
    h.close();
  }

  /* ── 8. Седмица по подразбиране ──────────────────────────────────────── */
  section('8. По подразбиране — ПРИКЛЮЧИЛАТА седмица');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    const past = new Date(); past.setDate(past.getDate() - 7);
    const expWeek = h.w.weekNum(past);
    const expYear = h.w.checklistIsoYear(past);

    ok('седмицата е миналата, не текущата', h.w.checklistWeek === expWeek,
       'реално: ' + h.w.checklistWeek + ', очаквано: ' + expWeek);
    ok('годината е ISO годината на същата седмица', h.w.checklistYear === expYear,
       'реално: ' + h.w.checklistYear + ', очаквано: ' + expYear);
    ok('НЕ е текущата седмица', h.w.checklistWeek !== h.w.weekNum(new Date()) ||
       h.w.weekNum(new Date()) === expWeek /* при смяна на година в рамките на теста */,
       'текуща: ' + h.w.weekNum(new Date()));

    ok('заглавието показва номера на седмицата',
       h.doc.getElementById('mod-checklist').innerHTML.indexOf('Седмица ' + expWeek) >= 0);

    /* Стрелките местят с една седмица назад и обратно — през реална дата,
       затова прескачането на година не се пише тук. */
    h.w.checklistShiftWeek(-1);
    await ticks();
    const back = h.w.checklistWeek;
    h.w.checklistShiftWeek(1);
    await ticks();
    ok('стрелка назад мести седмицата', back !== expWeek, 'реално: ' + back);
    ok('стрелка напред връща на изходната', h.w.checklistWeek === expWeek,
       'реално: ' + h.w.checklistWeek);
    h.close();
  }

  /* ── 9. Легендата ────────────────────────────────────────────────────── */
  section('9. Легендата от бланката — дословно');
  {
    const h = env([]);
    h.w.loadChecklist();
    await ticks();

    const txt = h.doc.getElementById('mod-checklist').textContent;
    ok('ДА — има изпратена преоценка.',
       txt.indexOf('има изпратена преоценка.') >= 0);
    ok('НЕ — от магазина не са писали, че няма преоценка.',
       txt.indexOf('от магазина не са писали, че няма преоценка.') >= 0);
    ok('НЯМАТ — не са подавали, но магазинът е писал, че няма преоценка.',
       txt.indexOf('не са подавали, но магазинът е писал, че няма преоценка.') >= 0);
    h.close();
  }

  /* ── 10. Достъп ──────────────────────────────────────────────────────── */
  section('10. Кой вижда таба');
  {
    const h = env([], ADMIN);
    h.w.setupTabsForRole();
    const tab = h.doc.getElementById('tab-checklist');
    ok('бутонът съществува в index.html', !!tab);
    ok('admin вижда таба', !!tab && tab.style.display === 'flex', tab ? tab.style.display : '—');
    ok('canSeeChecklist() = true за admin', h.w.canSeeChecklist() === true);
    h.close();
  }
  {
    const h = env([], MANAGER);
    h.w.setupTabsForRole();
    const tab = h.doc.getElementById('tab-checklist');
    ok('manager НЕ вижда таба', !!tab && tab.style.display === 'none', tab ? tab.style.display : '—');
    ok('canSeeChecklist() = false за manager', h.w.canSeeChecklist() === false);

    /* Дори да стигне до модула по друг път, съдържание няма. */
    h.w.loadChecklist();
    ok('модулът не рендира таблица за manager', !table(h.doc));
    h.close();
  }
  {
    /* notify_groups съдържа 'controlling' при роля, различна от admin.

       ⚠️ Днес този път НЕ се задейства в браузъра: auth-login не връща
       notify_groups, тоест currentUser.notify_groups е undefined и
       проверката пада на false. Тестът подава полето явно — той заковава
       ЛОГИКАТА, не че тя се достига. Влезе ли notify_groups в select-а на
       auth-login, тук няма какво да се променя. */
    const h = env([], CONTROLLER);
    h.w.setupTabsForRole();
    const tab = h.doc.getElementById('tab-checklist');
    ok('accounting с notify_groups=[controlling] вижда таба',
       !!tab && tab.style.display === 'flex', tab ? tab.style.display : '—');
    ok('canSeeChecklist() = true за контролинг', h.w.canSeeChecklist() === true);
    h.close();
  }
  {
    /* Постгрес низовата форма на масива — PostgREST я подава така по някои пътища. */
    const h = env([], { id: 'u-4', email: 'x@temax.bg', role: 'accounting',
                        store_name: 'Централен офис', notify_groups: '{co,controlling}' });
    ok('низовата форма „{co,controlling}" също се разчита', h.w.canSeeChecklist() === true);
    h.close();
  }
  {
    /* Точно състоянието в браузъра днес: полето изобщо не пристига. */
    const h = env([], { id: 'u-5', email: 'y@temax.bg', role: 'accounting', store_name: 'Централен офис' });
    ok('без notify_groups (както го връща auth-login днес) → няма достъп',
       h.w.canSeeChecklist() === false);
    h.close();
  }

  /* ── 11. Табът само чете ─────────────────────────────────────────────── */
  section('11. Нито един запис към базата');
  {
    const h = env([
      { store_name: 'Враца', metric_key: 'revizia_953', portal_value: 'da', control_value: 'ne', control_num: null, comment: null }
    ]);
    h.w.loadChecklist();
    await ticks();
    h.w.checklistShiftWeek(-1);
    await ticks();

    ok('нула POST', h.calls.post.length === 0, JSON.stringify(h.calls.post));
    ok('нула PATCH', h.calls.patch.length === 0, JSON.stringify(h.calls.patch));
    ok('нула DELETE', h.calls.del.length === 0, JSON.stringify(h.calls.del));
    ok('нито една заявка не е върнала грешка', h.calls.notOk.length === 0,
       JSON.stringify(h.calls.notOk));
    h.close();
  }

  report();
})();
