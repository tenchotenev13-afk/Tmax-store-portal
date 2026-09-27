/* Изключените от отчетите обекти идват от app_settings.report_excluded_stores
   (28.09.2026), а не от твърд масив в кода.
   Пускане: node tests/report-excluded-key.test.js .

   Защо съществува: същият ключ чете и transit_mark_empty_stores() в базата —
   функцията, която отмята обектите БЕЗ входящи редове в „Стока на път". Два
   списъка значеха, че кронът отмята обект, който отчетът не брои. Тестът
   заковава, че КЛЮЧЪТ е източникът, а вграденият масив е само резерва.

   ВАЖНО за четящия: фалшивият PostgREST в харнеса НЕ филтрира — връща цялата
   таблица за всяко GET. Затова „ключът липсва" се разиграва с таблица, в която
   има ДРУГИ ключове, а не с празна: така се проверява и че кодът намира своя ред
   по име, вместо да вярва на rows[0]. */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, guard, section, report, ticks } = H;

const USERS = [
  { store_name: 'Троян' }, { store_name: 'Ловеч' }, { store_name: 'Плевен' },
  { store_name: 'Пазарджик' }, { store_name: 'Централен офис' },
  { store_name: 'Логистичен склад Добрич' }, { store_name: 'Сервиз Троян' },
  { store_name: 'Троян' }   /* дубликат — в отчетните трябва да влезе веднъж */
];

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* settings: редовете, които app_settings връща. */
function env(settings, over) {
  return boot(Object.assign({
    modules: ['bulletin.js'],
    user: ADMIN,
    data: { app_settings: settings || [], users: USERS }
  }, over || {}));
}

const keyGets = h => h.calls.get.filter(u => /key=eq\.report_excluded_stores/.test(u));

const KEY_ROW = v => ({ key: 'report_excluded_stores', value: v });
/* Чужд ред, който харнесът ще върне на СЪЩАТА заявка — капанът с rows[0]. */
const FOREIGN = { key: 'loading_scan', value: 'on' };

(async function run() {

  section('1. Ключът е източникът — и ЗАМЕНЯ вградения списък, не го допълва');
  {
    /* Пазарджик е във вградения списък, но НЕ е в ключа → трябва да стане
       отчетен. Ловеч не е във вградения, но е в ключа → трябва да изпадне.
       Двете заедно доказват, че списъкът се презаписва, а не се обединява. */
    const h = env([KEY_ROW('["Централен офис","Ловеч"]')]);
    let stores = null;
    if (guard('loadReportableStores() не хвърля', () =>
          h.w.loadReportableStores().then(r => { stores = r; }))) {
      await ticks(); await ticks();
      ok('заявка за ключа Е направена', keyGets(h).length === 1,
        JSON.stringify(keyGets(h)));
      ok('и иска ключа И стойността (не само стойността)',
        /select=key,value/.test(keyGets(h)[0] || ''), JSON.stringify(keyGets(h)));

      ok('Ловеч — в ключа → НЕ е отчетен', h.w.isReportableStore('Ловеч') === false);
      ok('Пазарджик — само във вградения → ВЕЧЕ е отчетен',
        h.w.isReportableStore('Пазарджик') === true);
      ok('Централен офис — в ключа → НЕ е отчетен',
        h.w.isReportableStore('Централен офис') === false);
      ok('Логистичен склад Добрич — само във вградения → ВЕЧЕ е отчетен',
        h.w.isReportableStore('Логистичен склад Добрич') === true);

      ok('знаменателят следва ключа', Array.isArray(stores) &&
        stores.indexOf('Ловеч') < 0 && stores.indexOf('Пазарджик') >= 0,
        JSON.stringify(stores));
      ok('без дубликати', Array.isArray(stores) &&
        stores.filter(s => s === 'Троян').length === 1, JSON.stringify(stores));
    }
  }

  section('2. Редът в отговора няма значение — сверява се по ключ, не по позиция');
  {
    const h = env([FOREIGN, KEY_ROW('["Ловеч"]')]);
    if (guard('зареждане', () => h.w.loadReportExcludedStores())) {
      await ticks(); await ticks();
      ok('чуждият ред не подвежда: Ловеч е изключен',
        h.w.isReportableStore('Ловеч') === false);
      ok('и Троян си остава отчетен', h.w.isReportableStore('Троян') === true);
    }
  }

  section('3. Липсващ ключ (но пълна таблица) → вграденият списък, без грешка');
  {
    const h = env([FOREIGN]);
    if (guard('зареждане', () => h.w.loadReportExcludedStores())) {
      await ticks(); await ticks();
      /* Точно тук старият код гърмеше: вземаше rows[0].value = 'on' и обявяваше
         ключа за повреден. */
      ok('Централен офис пак е изключен', h.w.isReportableStore('Централен офис') === false);
      ok('Пазарджик пак е изключен', h.w.isReportableStore('Пазарджик') === false);
      ok('Троян си е отчетен', h.w.isReportableStore('Троян') === true);
      ok('списъкът е точно вграденият',
        JSON.stringify(h.w.REPORT_EXCLUDED_STORES) === JSON.stringify(h.w.REPORT_EXCLUDED_DEFAULT),
        JSON.stringify(h.w.REPORT_EXCLUDED_STORES));
    }
  }

  section('4. Повредена стойност → вграденият списък (не празен!)');
  {
    /* Празен списък би вкарал Централния офис и складовете в статистиките по
       магазини — по-лошо от това да не сме прочели ключа. */
    for (const bad of ['не-джейсън', '[]', '{"a":1}', 'null']) {
      const h = env([KEY_ROW(bad)]);
      await h.w.loadReportExcludedStores();
      await ticks();
      ok('стойност ' + JSON.stringify(bad) + ' → Централен офис остава изключен',
        h.w.isReportableStore('Централен офис') === false,
        JSON.stringify(h.w.REPORT_EXCLUDED_STORES));
    }
  }

  section('5. Паднала заявка → вграденият списък, отчетите работят');
  {
    const h = env([KEY_ROW('["Ловеч"]')], { fail: { GET: /app_settings/ } });
    let stores = null;
    await h.w.loadReportableStores().then(r => { stores = r; });
    await ticks();
    ok('Централен офис е изключен по вградения списък',
      h.w.isReportableStore('Централен офис') === false);
    ok('Ловеч Е отчетен — ключът не е прочетен, значи не важи',
      h.w.isReportableStore('Ловеч') === true);
    ok('знаменателят пак е попълнен', Array.isArray(stores) && stores.length > 0,
      JSON.stringify(stores));
  }

  section('6. Една заявка на сесия, колкото и пъти да се извика');
  {
    const h = env([KEY_ROW('["Ловеч"]')]);
    await h.w.loadReportExcludedStores();
    await h.w.loadReportExcludedStores();
    await h.w.loadReportableStores();
    await ticks(); await ticks();
    ok('точно една заявка за ключа', keyGets(h).length === 1,
      JSON.stringify(keyGets(h)));
  }

  section('7. Отметката „няма входящи редове" се изписва с думи');
  {
    const h = env([KEY_ROW('["Ловеч"]')]);
    ok('auto:transit-empty → „няма входящи редове"',
      h.w.bulCompletedByLabel('auto:transit-empty') === 'автоматично — няма входящи редове',
      h.w.bulCompletedByLabel('auto:transit-empty'));
    ok('auto:transit си остава различно',
      h.w.bulCompletedByLabel('auto:transit') === 'автоматично от Стока на път',
      h.w.bulCompletedByLabel('auto:transit'));
    ok('човешко име минава непокътнато',
      h.w.bulCompletedByLabel('Управител Троян') === 'Управител Троян');
  }

  report();
})();
