/* КОЙ постави „Дата потвърдена актуализация" (stock_returns.confirmed_by).

   ПОВОД. Автоматичното отмятане на „СРОК НА ГОДНОСТ/РЕКЛАМАЦИИ" брои обекта за
   изпълнил по confirmed_date на невзетите му записи. Но тази колона се пише по
   ЧЕТИРИ пътя и само ЕДИН е обектът — ръчната форма. Другите три са Excel
   импорти, достъпни единствено на офиса (canAddSR), и ПРЕЗАПИСВАТ съществуващи
   редове; многолистовият дори изтрива датата при празна клетка. Без следа кой
   е сложил датата, файл, качен в сряда сутрин, щеше да отметне обектите
   наготово — тоест автоматиката щеше да произведе същата лъжа като ръчната
   отметка, само по-бързо.

   Измерено преди промяната: 51 невзети реда, създадени от офиса/импорта, имат
   confirmed_date; 32 от тях с дата ПО-РАННА от създаването на реда, тоест
   дошла от файла.

   ОТ 02.10.2026 (комит 2a6936c) импортът „По рекламации" САМО ДОБАВЯ нови
   редове — познат ПВ-ЕВР се пропуска. Значи съществуващ ред се пипа само от
   ЕДИН импорт („По разлики") и отстъпването пред обекта живее само там.
   ОТ 18.10.2026 и „По разлики" САМО ДОБАВЯ (писмо на Цвети от 07.10.2026) —
   съществуващ ред не се пипа от НИТО ЕДИН импорт, затова srImportKeepsDate
   (отстъпването пред обекта) е махната: няма какво да отстъпва.
   И двата импорта пишат следа на НОВИТЕ си редове: файлът може да носи
   дата, а колоната трябва да казва, че е от импорт.

   ТВЪРДЕНИЯТА:
   · форма от потребител на САМИЯ обект → 'store:<обект>';
   · форма от офиса → 'office:<име>' (решава обектът на РЕДА, не ролята);
   · импортите → 'import:<име>' на новите редове;
   · датата не се мени → колоните НЕ се пипат;
   · нито един импорт не обновява съществуващ ред (няма PATCH път);
   · партида от 300 реда излиза с ЕДНАКВИ колони — PostgREST го изисква.

   Пускане: node tests/sr-confirmed-by.test.js . */
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report } = H;

const STORE = 'Троян';
const OTHER = 'Ловеч';
const STORE_USER = { email: 't@temax.bg', display_name: 'Иван Петров', role: 'manager', store_name: STORE };
const OFFICE_USER = { email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева', role: 'accounting', store_name: 'Централен офис' };

function env(user) {
  return boot({
    modules: ['stock-returns.js'],
    user: user || STORE_USER,
    data: { stock_returns: [], users: [], stores: [] }
  });
}

(async function () {

  section('1. Кой е актьорът при РЪЧНАТА форма');
  {
    const w = env(STORE_USER).w;
    ok('потребител на САМИЯ обект → store:<обект>',
      w.srConfirmedActor(STORE) === 'store:' + STORE, w.srConfirmedActor(STORE));
    /* Същият човек, но редът е на ДРУГ обект — той не е този обект. */
    ok('същият потребител върху ЧУЖД ред → office:<име>',
      w.srConfirmedActor(OTHER) === 'office:Иван Петров', w.srConfirmedActor(OTHER));

    const w2 = env(OFFICE_USER).w;
    ok('офисът върху ред на обект → office:<име>',
      w2.srConfirmedActor(STORE) === 'office:Цветелина Тенева', w2.srConfirmedActor(STORE));
    ok('и импортът е import:<име>',
      w2.srImportActor() === 'import:Цветелина Тенева', w2.srImportActor());
  }

  section('2. Следа се пише САМО при смяна на датата');
  {
    const w = env(STORE_USER).w;
    const A = 'store:' + STORE;
    ok('няма дата → въведена: пише се',
      !!w.srConfirmedTrace(null, '2026-10-01', A).confirmed_by);
    ok('и носи актьора', w.srConfirmedTrace(null, '2026-10-01', A).confirmed_by === A);
    ok('и час', !!w.srConfirmedTrace(null, '2026-10-01', A).confirmed_at);
    ok('същата дата → НЕ се пише',
      Object.keys(w.srConfirmedTrace('2026-10-01', '2026-10-01', A)).length === 0);
    ok('същата дата с час в низа → пак НЕ се пише',
      Object.keys(w.srConfirmedTrace('2026-10-01T00:00:00', '2026-10-01', A)).length === 0);
    ok('друга дата → пише се',
      !!w.srConfirmedTrace('2026-09-28', '2026-10-01', A).confirmed_by);
    ok('ИЗТРИВАНЕ (дата → null) → пише се, защото е промяна',
      !!w.srConfirmedTrace('2026-10-01', null, A).confirmed_by);
    ok('нищо → нищо',
      Object.keys(w.srConfirmedTrace(null, null, A)).length === 0);
  }

  section('3. Нито един импорт не обновява съществуващ ред');
  {
    /* До 18.10.2026 „По разлики" обновяваше съвпаднал ред и отстъпваше пред
       датата на обекта (srImportKeepsDate). Сега и двата импорта само
       добавят — няма PATCH, значи няма и какво да отстъпва. Върне ли се
       пътят за обновяване, трябва да се върне и защитата на датата. */
    const fs2 = require('fs'), path2 = require('path');
    const src = fs2.readFileSync(path2.join(process.argv[2] || '.', 'stock-returns.js'), 'utf8');
    const w = env(OFFICE_USER).w;
    ok('srImportKeepsDate я няма', typeof w.srImportKeepsDate === 'undefined');
    ok('srBatchUpdate (PATCH по id за импорта) я няма', typeof w.srBatchUpdate === 'undefined');
    ok('в кода няма „delete upd.confirmed_date"', src.indexOf('delete upd.confirmed_date') < 0);
    /* Заявката за съпоставяне на „По разлики" тегли само ключа. */
    const sel = src.match(/source=eq\.diff&select=[^&']*/g) || [];
    ok('съпоставянето на „По разлики" тегли само колоните на ключа',
      sel.length === 1 && sel[0] === 'source=eq.diff&select=id,store_name,order_number,sap_code,product_name', sel.join(' | '));
  }

  section('5. Самият код: партидата излиза с ЕДНАКВИ колони');
  {
    /* srBatchImport праща по 300 реда с ЕДИН POST, а PostgREST иска еднакви
       колони. Затова confirmed_by/confirmed_at се слагат на ВСЕКИ нов ред —
       с null, когато файлът не носи дата. Проверява се по кода, защото самият
       импорт иска Excel файл и цял работен поток. */
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(process.argv[2] || '.', 'stock-returns.js'), 'utf8');
    const m = src.match(/r\.confirmed_by = r\.confirmed_date \? srImportActor\(\) : null;/g) || [];
    /* ТУК остават ДВА: и двата импорта ВМЪКВАТ нови редове, значи и двата
       слагат ключа на ВСЕКИ ред — иначе партидата от 300 излиза с различни
       колони и PostgREST отказва цялата. */
    ok('и двата импорта слагат ключа безусловно при ВМЪКВАНЕ', m.length === 2, String(m.length));
    const m2 = src.match(/r\.confirmed_at = r\.confirmed_date \? new Date\(\)\.toISOString\(\) : null;/g) || [];
    ok('същото за часа', m2.length === 2, String(m2.length));
    ok('никъде няма условно добавяне само при дата',
      !/if\(r\.confirmed_date\)\{ r\.confirmed_by/.test(src));
    ok('BATCH е 300', /var BATCH=300;/.test(src));
  }

  section('6. Партида от 300 реда със смесени случаи — еднакви колони');
  {
    /* Симулира се точно това, което прави импортът при вмъкване: половината
       редове с дата от файла, половината без. Ключовете на всички редове
       трябва да съвпадат, иначе PostgREST отказва цялата партида. */
    const w = env(OFFICE_USER).w;
    const rows = [];
    for (let i = 0; i < 300; i++) {
      const r = { store_name: STORE, sap_code: 'S' + i, product_name: 'П' + i,
                  confirmed_date: (i % 3 === 0) ? '2026-10-01' : null, status: 'pending', source: 'diff' };
      r.confirmed_by = r.confirmed_date ? w.srImportActor() : null;
      r.confirmed_at = r.confirmed_date ? new Date().toISOString() : null;
      rows.push(r);
    }
    const keys0 = Object.keys(rows[0]).sort().join(',');
    const bad = rows.filter(r => Object.keys(r).sort().join(',') !== keys0);
    ok('всичките 300 реда имат еднакви колони', bad.length === 0, String(bad.length));
    ok('и confirmed_by го има на всеки', rows.every(r => 'confirmed_by' in r));
    ok('с дата → import:<име>',
      rows.filter(r => r.confirmed_date).every(r => String(r.confirmed_by).indexOf('import:') === 0));
    ok('без дата → null', rows.filter(r => !r.confirmed_date).every(r => r.confirmed_by === null));
    ok('броят с дата е 100', rows.filter(r => r.confirmed_date).length === 100,
      String(rows.filter(r => r.confirmed_date).length));
  }

  section('7. Решението в SQL иска СЪЩОТО');
  {
    /* Правилото в базата (stock_returns_store_done) брои ред само при
       confirmed_by = 'store:' || store_name. Ако форматът тук се смени, а там
       не — обектите спират да се отмятат и никой не разбира защо. */
    const fs = require('fs'), path = require('path');
    const sql = fs.readFileSync(path.join(process.argv[2] || '.', 'stock-returns-auto-complete-schema.sql'), 'utf8');
    ok('SQL-ът сверява префикса store:',
      /confirmed_by is distinct from \('store:' \|\| p_store\)/.test(sql), 'няма го');
    const js = fs.readFileSync(path.join(process.argv[2] || '.', 'stock-returns.js'), 'utf8');
    ok('а клиентът пише точно този префикс',
      /return mine \? \('store:'\+storeName\)/.test(js), 'няма го');
    ok('и импортът — import:', /return 'import:'\+/.test(js));
    ok('и офисът — office:', /\('office:'\+/.test(js));
  }

  report();
})();
