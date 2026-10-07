/* „За връщане": какво остава да се направи тази седмица (02.10.2026).

   ПОВОД. Ръчната отметка на постоянната задача „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ"
   изчезва — базата я слага сама, когато всички невзети записи на обекта
   получат „Дата потвърдена актуализация" от обекта, в прозореца на седмицата.
   Щом човекът вече не може да отметне, трябва да ВИЖДА какво му остава,
   иначе задачата просто мълчи и той не знае защо.

   ТВЪРДЕНИЯТА:
   · правилото на екрана е ДОСЛОВНО правилото на базата — дата извън
     прозореца, бъдеща дата, или дата от офиса/импорта не се броят;
   · броячът и филтърът се появяват чак от седмицата с понеделник 05.10
     (SR_AUTO_START = v_start в stock_returns_sync_completions) — дотогава
     биха показали 221 „неактуализирани" записа за седмица, в която никой
     нищо не дължи;
   · броячът казва и колко остават в ДРУГИЯ подтаб: задачата гледа всички
     невзети записи, а изчистеният подтаб иначе изглежда като „готово";
   · филтърът „Без актуализация" показва точно тези редове;
   · редът и формата носят малък надпис КОЙ е потвърдил и кога;
   · формата ОТКАЗВА бъдеща дата (двата заварени реда 2028/2029 са точно
     такива) — без CHECK в базата;
   · трите места, където живее едно и също правило (SQL, stock-returns.js,
     bulletin.js), дават ЕДИН И СЪЩ отговор ред по ред.

   Пускане: node tests/sr-needs-update.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, realClick, btn, ticks } = H;
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || '.';

/* Сряда 07.10.2026 — вътре в първата седмица, за която правилото важи
   (понеделник 05.10). Фиксирана, не изчислена от днешния ден: самата дата е
   предмет на теста. */
const WED = '2026-10-07';
const MON = '2026-10-05';
const PREV_WED = '2026-09-30';   /* седмица ПРЕДИ правилото */

function freezeDate(w, iso) {
  const Real = w.Date, ms = new Real(iso + 'T12:00:00').getTime();
  class F extends Real {
    constructor(...a) { if (!a.length) super(ms); else super(...a); }
    static now() { return ms; }
  }
  w.Date = F;
}

const STORE = 'Троян';
const USER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'store', store_name: STORE };
const OFFICE = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис' };

function ret(id, over) {
  return Object.assign({
    id: id, store_name: STORE, status: 'pending', source: 'diff',
    confirmed_date: null, confirmed_by: null, confirmed_at: null,
    product_name: 'Стока ' + id, sap_code: 'S' + id, quantity: 1,
    supplier: 'Доставчик', purchase_order: 'PV-' + id
  }, over || {});
}

function env(rows, iso, user) {
  const h = boot({
    modules: ['stock-returns.js'],
    user: user || USER,
    data: {
      users: [{ store_name: STORE }], stores: [{ name: STORE }],
      stock_returns: () => (rows || []),
      stock_differences: []
    }
  });
  freezeDate(h.w, iso || WED);
  return h;
}
async function view(rows, iso, user) {
  const h = env(rows, iso, user);
  if (!guard('loadStockReturns() не хвърля', () => h.w.loadStockReturns())) return null;
  for (let i = 0; i < 60; i++) {
    if (h.doc.getElementById('mod-stock-returns').innerHTML.indexOf('Стока за връщане') >= 0) break;
    await ticks();
  }
  return h;
}
const mod = h => h.doc.getElementById('mod-stock-returns');

(async function () {

  section('1. Правилото: кога редът се брои за актуализиран');
  {
    const w = env([], WED).w;
    ok('понеделникът на сряда 07.10 е 05.10', w.srWeekStartISO(WED) === MON, w.srWeekStartISO(WED));
    ok('понеделникът на самия понеделник е той', w.srWeekStartISO(MON) === MON, w.srWeekStartISO(MON));
    ok('понеделникът на неделя 11.10 е пак 05.10', w.srWeekStartISO('2026-10-11') === MON, w.srWeekStartISO('2026-10-11'));
    ok('а на неделя 04.10 — 28.09', w.srWeekStartISO('2026-10-04') === '2026-09-28', w.srWeekStartISO('2026-10-04'));

    const by = d => ({ confirmed_date: d, confirmed_by: 'store:' + STORE });
    ok('дата от обекта в прозореца → актуализиран',
      w.srNeedsUpdate(ret('1', by(WED)), MON, WED) === false);
    ok('точно понеделник → актуализиран',
      w.srNeedsUpdate(ret('1', by(MON)), MON, WED) === false);
    ok('неделя преди това → НЕ',
      w.srNeedsUpdate(ret('1', by('2026-10-04')), MON, WED) === true);
    ok('бъдеща дата → НЕ',
      w.srNeedsUpdate(ret('1', by('2028-09-02')), MON, WED) === true);
    ok('дата от ОФИСА → НЕ',
      w.srNeedsUpdate(ret('1', { confirmed_date: WED, confirmed_by: 'office:Цветелина' }), MON, WED) === true);
    ok('дата от ИМПОРТ → НЕ',
      w.srNeedsUpdate(ret('1', { confirmed_date: WED, confirmed_by: 'import:Цветелина' }), MON, WED) === true);
    ok('ЗАВАРЕН ред (confirmed_by null) → НЕ',
      w.srNeedsUpdate(ret('1', { confirmed_date: WED }), MON, WED) === true);
    ok('дата от ДРУГ обект → НЕ',
      w.srNeedsUpdate(ret('1', { confirmed_date: WED, confirmed_by: 'store:Ловеч' }), MON, WED) === true);
    ok('без дата → НЕ',
      w.srNeedsUpdate(ret('1'), MON, WED) === true);
    /* Взетите записи не са задължение на обекта — и базата ги подминава. */
    ok('ВЗЕТ запис без дата → не се брои',
      w.srNeedsUpdate(ret('1', { status: 'taken' }), MON, WED) === false);
    ok('ПРИКЛЮЧЕН запис без дата → не се брои',
      w.srNeedsUpdate(ret('1', { status: 'completed' }), MON, WED) === false);
  }

  section('2. Правилото важи ЧАК от седмицата с понеделник 05.10');
  {
    const w = env([], WED).w;
    ok('константата е 05.10.2026', w.SR_AUTO_START === '2026-10-05', w.SR_AUTO_START);
    ok('сряда 07.10 → правилото е в сила', w.srAutoActive(WED) === true);
    ok('понеделник 05.10 → в сила', w.srAutoActive(MON) === true);
    ok('неделя 04.10 → НЕ', w.srAutoActive('2026-10-04') === false);
    ok('сряда 30.09 → НЕ', w.srAutoActive(PREV_WED) === false);
  }

  section('3. Броячът и филтърът на екрана');
  {
    const rows = [
      ret('a1'),                                                                       /* без дата */
      ret('a2', { confirmed_date: WED, confirmed_by: 'store:' + STORE, confirmed_at: WED + 'T08:00:00Z' }),
      ret('a3', { confirmed_date: WED, confirmed_by: 'import:Цветелина', confirmed_at: WED + 'T08:00:00Z' }),
      ret('a4', { status: 'taken' }),                                                  /* взет — не се брои */
      /* ТРИ, не две: броят в другия подтаб е нарочно различен от този в
         текущия (2), иначе грешка в избора на подтаб не се вижда. */
      ret('d1', { source: 'complaint' }),
      ret('d2', { source: 'complaint' }),
      ret('d3', { source: 'complaint' })
    ];
    const h = await view(rows, WED);
    if (h) {
      /* Картите са махнати: броят е в чипа „Без актуализация“ (#sr-needs-n), а „+ N в другия подтаб“ — в кутията „какво остава“. */
      const card = h.doc.getElementById('sr-needs-other');
      const num = h.doc.getElementById('sr-needs-n');
      if (ok('чипът „Без актуализация“ го има, а кутията — „в другия подтаб“', !!card && !!num)) {
        /* По СВОЙ елемент, не по текста на картата: там стои и „05.10.2026",
           тоест търсене на „2" минава винаги. */
        ok('чипът показва точно 2 за този подтаб', (num.textContent || '').trim() === '2', num.textContent.trim());
        ok('и казва, че в другия подтаб има още 3',
          (card.textContent || '').indexOf('+ 3 в другия подтаб') >= 0, card.textContent.trim());
        ok('тоест 2 и 3 не се разменят', (card.textContent || '').indexOf('+ 2 в другия') === -1);
      }
      const b = btn(mod(h), 'Без актуализация');
      if (ok('бутонът-филтър го има', !!b)) {
        ok('и носи същия брой', ((b.querySelector('.chips-n') || {}).textContent || '').trim() === '2', b.textContent.trim());
        realClick(h.w, b);
        const html = mod(h).innerHTML;
        ok('след клик се виждат точно двата реда',
          html.indexOf('Стока a1') >= 0 && html.indexOf('Стока a3') >= 0, '');
        ok('а актуализираният от обекта не се вижда', html.indexOf('Стока a2') === -1);
        ok('и взетият не се вижда', html.indexOf('Стока a4') === -1);
        ok('и редовете от другия подтаб не се вижат', html.indexOf('Стока d1') === -1);
      }
      ok('текстът казва колко остават ОБЩО (2 + 3)',
        mod(h).innerHTML.indexOf('<b>5</b> невзети записа') >= 0, '');
      ok('и че ръчна отметка няма',
        mod(h).innerHTML.indexOf('ръчна отметка няма') >= 0, '');
    }
  }

  section('4. Нищо от това не се показва преди 05.10');
  {
    const h = await view([ret('a1'), ret('a2')], PREV_WED);
    if (h) {
      ok('няма чип „Без актуализация“ и кутия с „в другия подтаб“', !h.doc.getElementById('sr-needs-n') && !h.doc.getElementById('sr-needs-other'));
      ok('няма бутон-филтър', !btn(mod(h), 'Без актуализация'));
      ok('няма обяснителен текст', mod(h).innerHTML.indexOf('ръчна отметка няма') === -1);
      ok('а самата таблица си е там', mod(h).innerHTML.indexOf('Стока a1') >= 0);
    }
  }

  section('5. Всичко е актуализирано');
  {
    const rows = [ret('a1', { confirmed_date: MON, confirmed_by: 'store:' + STORE })];
    const h = await view(rows, WED);
    if (h) {
      const num = h.doc.getElementById('sr-needs-n');
      ok('чипът показва точно 0', !!num && (num.textContent || '').trim() === '0', num && num.textContent.trim());
      ok('и текстът поздравява',
        mod(h).innerHTML.indexOf('Всички невзети записи са актуализирани') >= 0, '');
    }
  }

  section('6. Надписът „кой е потвърдил"');
  {
    const w = env([], WED).w;
    const at = { confirmed_at: '2026-09-30T06:12:00Z' };
    ok('обект → „потвърдено от обекта" + датата на записа',
      w.srConfirmedNote(ret('1', Object.assign({ confirmed_date: MON, confirmed_by: 'store:' + STORE }, at))) === 'потвърдено от обекта 30.09.2026',
      w.srConfirmedNote(ret('1', Object.assign({ confirmed_date: MON, confirmed_by: 'store:' + STORE }, at))));
    ok('офис → „потвърдено от офиса"',
      w.srConfirmedNote(ret('1', Object.assign({ confirmed_by: 'office:Цветелина Тенева' }, at))) === 'потвърдено от офиса 30.09.2026');
    ok('импорт → „от импорт"',
      w.srConfirmedNote(ret('1', Object.assign({ confirmed_by: 'import:Цветелина Тенева' }, at))) === 'от импорт 30.09.2026');
    ok('заварен ред → НИЩО (не се знае, измисленото е по-лошо)',
      w.srConfirmedNote(ret('1', { confirmed_date: MON })) === '');
    ok('и няма html за него', w.srConfirmedNoteHtml(ret('1', { confirmed_date: MON })) === '');
    /* Името отива в title, не в самия надпис — редът е тесен. */
    const html = w.srConfirmedNoteHtml(ret('1', Object.assign({ confirmed_by: 'office:Цветелина Тенева' }, at)));
    ok('името е в title', html.indexOf('Цветелина Тенева') >= 0, html);
    ok('а видимият текст е кратък', html.indexOf('>потвърдено от офиса 30.09.2026<') >= 0, html);

    const h = await view([ret('a1', Object.assign({ confirmed_date: MON, confirmed_by: 'store:' + STORE }, at))], WED);
    if (h) ok('и стои в реда на таблицата',
      mod(h).innerHTML.indexOf('потвърдено от обекта 30.09.2026') >= 0, '');
  }

  section('7. Формата: надпис + отказ на бъдеща дата');
  {
    const rows = [ret('a1', { confirmed_date: MON, confirmed_by: 'office:Цветелина Тенева', confirmed_at: '2026-09-30T06:12:00Z' })];
    const h = await view(rows, WED, OFFICE);
    if (h) {
      const w = h.w;
      if (guard('openSRModal() не хвърля', () => w.openSRModal('a1'))) {
        const by = h.doc.getElementById('sr-cdate-by');
        if (ok('надписът е и във формата', !!by)) {
          ok('и казва кой', (by.textContent || '').indexOf('потвърдено от офиса') >= 0, by.textContent.trim());
          ok('и кой точно', (by.textContent || '').indexOf('Цветелина Тенева') >= 0, by.textContent.trim());
        }
        await ticks();
        const stEl = h.doc.getElementById('sr-store');
        if (stEl && !stEl.value) stEl.value = STORE;
        ok('магазинът във формата е на реда', stEl && stEl.value === STORE, stEl && stEl.value);
        /* Бъдеща дата → отказ, без заявка. */
        h.doc.getElementById('sr-cdate').value = '2028-09-02';
        h.calls.patch.length = 0; h.calls.toast.length = 0;
        guard('submitSR() не хвърля', () => w.submitSR());
        await ticks();
        ok('бъдеща дата → няма PATCH', h.calls.patch.length === 0, String(h.calls.patch.length));
        ok('и има обяснение',
          h.calls.toast.some(t => String(t).indexOf('не може да е в бъдещето') >= 0),
          h.calls.toast.join(' | '));

        /* Днешната минава. */
        h.doc.getElementById('sr-cdate').value = WED;
        h.calls.patch.length = 0; h.calls.toast.length = 0;
        guard('submitSR() не хвърля при валидна дата', () => w.submitSR());
        await ticks();
        ok('валидна дата → има PATCH', h.calls.patch.length === 1, String(h.calls.patch.length));
        if (h.calls.patch.length) {
          const b = h.calls.patch[0].body;
          ok('и носи новата дата', b.confirmed_date === WED, String(b.confirmed_date));
          ok('и следа от ОФИСА (редът е на Троян, а човекът не е оттам)',
            b.confirmed_by === 'office:Цветелина Тенева', String(b.confirmed_by));
        }
      }
    }
  }

  section('8. Същото правило на трите места — SQL, „За връщане", Бюлетин');
  {
    const sql = fs.readFileSync(path.join(ROOT, 'stock-returns-auto-complete-schema.sql'), 'utf8');
    ok('SQL-ът иска дата >= понеделник', /confirmed_date < p_from/.test(sql));
    ok('и <= горната граница', /confirmed_date > p_upto/.test(sql));
    ok('и префикса на обекта', /confirmed_by is distinct from \('store:' \|\| p_store\)/.test(sql));
    ok('и само невзети', /status = 'pending'/.test(sql));
    ok("и началната седмица е същата константа",
      sql.indexOf("v_start   date := date '2026-10-05'") >= 0, 'няма я');

    /* Бюлетинът НЕ вика srNeedsUpdate (зарежда се преди stock-returns.js),
       затова правилото е преписано там. Тук се сверява ред по ред: при
       разминаване единият екран обещава отметка, която другият не прави. */
    const bul = fs.readFileSync(path.join(ROOT, 'bulletin.js'), 'utf8');
    ok('bulletin.js тегли и confirmed_by (и source — от 07.10.2026 брояч по задача)',
      bul.indexOf('select=id,status,source,store_name,confirmed_date,confirmed_by') >= 0, 'няма го');
    ok('и сверява префикса на обекта',
      bul.indexOf("String(r.confirmed_by||'') !== ('store:'+(r.store_name||''))") >= 0, 'няма го');
    ok('и прозореца', bul.indexOf('if(!d || d<mon || d>today) return true;') >= 0, 'няма го');

    /* И функционално: двете реализации върху едни и същи редове. */
    const w = env([], WED).w;
    const bulRule = (r, mon, today) => {
      if ((r.status || 'pending') !== 'pending') return false;
      const d = r.confirmed_date ? String(r.confirmed_date).slice(0, 10) : null;
      if (!d || d < mon || d > today) return true;
      return String(r.confirmed_by || '') !== ('store:' + (r.store_name || ''));
    };
    const cases = [
      ret('c1'),
      ret('c2', { confirmed_date: WED, confirmed_by: 'store:' + STORE }),
      ret('c3', { confirmed_date: WED, confirmed_by: 'office:Ц' }),
      ret('c4', { confirmed_date: WED, confirmed_by: 'import:Ц' }),
      ret('c5', { confirmed_date: '2026-10-04', confirmed_by: 'store:' + STORE }),
      ret('c6', { confirmed_date: '2028-09-02', confirmed_by: 'store:' + STORE }),
      ret('c7', { confirmed_date: WED }),
      ret('c8', { confirmed_date: WED, confirmed_by: 'store:Ловеч' }),
      ret('c9', { status: 'taken' }),
      ret('c10', { status: 'completed', confirmed_date: WED, confirmed_by: 'store:' + STORE })
    ];
    const diff = cases.filter(r => w.srNeedsUpdate(r, MON, WED) !== bulRule(r, MON, WED));
    ok('двете реализации дават еднакъв отговор за 10 случая',
      diff.length === 0, diff.map(r => r.id).join(', '));
    /* Гард срещу тавтология: списъкът трябва да има и „да", и „не". */
    const yes = cases.filter(r => w.srNeedsUpdate(r, MON, WED)).length;
    ok('и случаите не са едностранни', yes > 0 && yes < cases.length, yes + ' от ' + cases.length);
  }

  report();
})();
