/* Синхронът между report.js и едж функцията send-scheduled-report.

   Едж функцията носи ДУБЛИКАТ на репорт логиката от report.js — това е
   съзнателен избор (Deno не може да import-не браузърен файл), но е и
   най-тихият дефект в проекта: репото няма CI стъпка за едж функциите,
   деплойът е ръчен, и разминаване се вижда чак когато писмото излезе
   различно от това, което показва порталът.

   Реални разминавания, хващани досега само на ръка:
     · v5 нямаше buildWrongReceiptRowHtml — редът за сторната по грешен
       прием го имаше в таб „Днес" и в ръчното изпращане, но НЕ и в
       автоматичния седмичен имейл;
     · затварящата кавичка в „задача „всеки ден…" — ASCII в клиента,
       U+201C в едж копието. Виж ACCEPTED_DRIFT по-долу.

   Какво заковава тестът:
     1. трийсетте споделени функции ги има и в двата файла;
     2. КОДЪТ им е идентичен (коментарите нарочно може да се различават —
        едж файлът ги съкращава), с изключение на изрично приетите
        разминавания, които пък трябва РЕАЛНО да съществуват;
     3. нито една функция, извикана в едж файла, не липсва в него —
        точно това чупи деплоя, ако помощник бъде копиран само в report.js;
     4. функциите, които СЪЗНАТЕЛНО живеят само на едното място, са
        изброени поименно, за да не се чуди никой дали е пропуск.

   Какво тестът НЕ прави: не кара репото да съвпадне с живото. Живата
   версия изостава между деплоите — това е нормално. Поправя се копието,
   в посока към оригинала, при следващия деплой по същина.

   Пускане:  node tests/report-edge-sync.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'report.js');
const EDGE = path.join(ROOT, 'supabase/functions/send-scheduled-report/index.ts');
const SHARED = path.join(ROOT, 'shared.js');
const BULLETIN = path.join(ROOT, 'bulletin.js');

/* ── Списъкът е ИЗРИЧЕН, не сканиран ──
   Ако беше сканиран, изтриването на функция от двата файла щеше да мине
   мълчаливо. Така добавянето на нова споделена функция изисква съзнателен
   ред тук — същият принцип като TESTS в run-all.js. */
const SHARED_FNS = [
  /* събиране на данни */
  'collectDailyReportData', 'collectWeeklyReportData',
  'collectCrossModuleWeeklySummary',
  /* прозорци и избор на седмица */
  'reportPrevWeekMonday', 'reportWeekOfMonday', 'reportPickWeeklyBulletin',
  'reportItemMatchesComp', 'reportRecurringWeekDates', 'reportCrossWindow',
  /* обобщение */
  'reportBuildSummary', 'reportSaveSnapshot', 'reportFetchSnapshot',
  'reportRankingIsMeaningful',
  /* HTML */
  'reportEmailShell', 'reportTrendHtml', 'reportDotColor', 'reportPctColor',
  'reportStatCell', 'reportStoreRow', 'reportTopBottomTable',
  'reportNoDueNoticeHtml', 'reportPostponedSectionHtml',
  'reportCommentedSectionHtml', 'crossMetricCard', 'crossModuleRow',
  'buildWrongReceiptRowHtml', 'reportCrossWindowLabel',
  'buildCrossModuleSectionHtml', 'buildDailyReportHtml', 'buildWeeklyReportHtml'
];

/* Помощници, копирани в едж файла от shared.js / bulletin.js, защото Deno
   няма достъп до тях. Носят TS анотации, затова се сравняват след махането
   им, не байт по байт. */
const COPIED_HELPERS = [
  { fn: 'esc', from: SHARED },
  { fn: 'toLocalISO', from: BULLETIN },
  { fn: 'taskDueDates', from: BULLETIN },
  { fn: 'taskIsDueOnDate', from: BULLETIN },
  { fn: 'recurringIsDueOnWeekday', from: BULLETIN },
  { fn: 'recurringIsDueToday', from: BULLETIN },
  { fn: 'weekDays', from: BULLETIN },
  { fn: 'escAttr', from: SHARED },
  { fn: 'isReportableStore', from: SHARED }
];

/* Съзнателни разминавания — изброени, за да не изглеждат като пропуск. */
const CLIENT_ONLY = [
  'collectWeeklyRoutingData',    /* личните имейли се пращат само ръчно от портала */
  'reportRoutedTaskWindow',
  'resolveRecipientsForTask', 'buildRecipientMap', 'taskStoreBreakdown',
  'personalizedTaskCardHtml', 'personalizedSectionHtml',
  'sendWeeklyReportRouted', 'sendWeeklyReportTest'
];
const EDGE_ONLY = ['sbGet', 'sbPost', 'sbPatch'];  /* SERVICE ROLE, не shared.js */

/* ── ПРИЕТИ разминавания ────────────────────────────────────────────────
   Разлика, която ЗНАЕМ, че съществува, и която чака следващия деплой по
   същина. Не се крие — заковава се, за да не порасне тихо и за да не се
   изкуши някой да „оправи" репото, така че да съвпадне с живото.

   Правилото: репото е записът. Ако оригиналът е в клиента, а копието се е
   разминало при пренасянето, поправя се КОПИЕТО — при следващия деплой,
   заедно с промяна по същина. Не се прави деплой заради един знак.

   Записът НЕ освобождава цялата функция — това би било дупка колкото
   самата функция. `patch` описва ТОЧНО очакваната разлика: прилага се
   върху едж версията и след това двете трябва да съвпадат байт по байт.
   Промъкне ли се втора разлика в същата функция, тестът пада.

   Всеки запис трябва и РЕАЛНО да се различава: изчезне ли разликата,
   тестът иска записът да падне оттук, за да не остане да лъже. */
const ACCEPTED_DRIFT = [
  {
    fn: 'buildWeeklyReportHtml',
    note: 'затварящата кавичка в „задача „всеки ден…" — ASCII " (U+0022) в ' +
          'report.js, U+201C в живата v10. ASCII е ОРИГИНАЛЪТ: редът влиза в ' +
          'report.js на 37bcd06 и още стои така на fd2adf6, когато едж файлът ' +
          'се появява вече с U+201C — тоест копието се е разминало, не клиентът. ' +
          'Изравнява се едж файлът при следващия деплой по същина.',
    patch: s => s.replace('задача „всеки ден“', 'задача „всеки ден"')
  }
];

/* ── Разбор ─────────────────────────────────────────────────────────────
   Функциите се търсят на най-горно ниво (колона 0) и се затварят по БРОЯЧ
   на скоби, не по „ред, който е точно }".

   Първата версия на този тест разчиташе на второто и мълчаливо гълташе
   половин shared.js: там функциите са едноредови
   (`function escAttr(s){return esc(s).replace(/"/g,'&quot;');}`), затова
   „ред, който е точно }" се намираше чак десетки редове по-надолу. */
function topLevelFns(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^function ([A-Za-z0-9_$]+)\s*\(/);
    if (!m) continue;
    const body = [];
    let depth = 0, started = false;
    for (let j = i; j < lines.length; j++) {
      body.push(lines[j]);
      const bare = stripLiterals(lines[j]);
      for (let k = 0; k < bare.length; k++) {
        if (bare[k] === '{') { depth++; started = true; }
        else if (bare[k] === '}') depth--;
      }
      if (started && depth <= 0) break;
    }
    out[m[1]] = body.join('\n');
  }
  return out;
}

/* Стрингове и коментари стават празни — за да не се броят скоби вътре в
   тях. Регексите в тези файлове не съдържат скоби, затова не се пипат. */
function stripLiterals(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/* Само кодът: коментарите се различават нарочно (едж файлът ги съкращава,
   а и носи собствени бележки за деплоя). */
function codeOnly(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+$/gm, '')
    .split('\n').filter(l => l.trim()).join('\n');
}

/* За копираните помощници сравнението е по СМИСЪЛ, не по форматиране:
   те са пренасяни на ръка, затова `indexOf(name)<0` срещу
   `indexOf(name) < 0` е шум, а не разминаване. Стринговете се пазят
   непокътнати — интервал вътре в ' от ' Е значещ. */
function normalize(s) {
  const lits = [];
  let t = codeOnly(s)
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, function (m) {
      lits.push(m); return ' ' + (lits.length - 1) + ' ';
    });
  t = t
    /* TS анотации: `s: any`, `q?: string` */
    .replace(/([A-Za-z0-9_$]+)\s*\?\s*:\s*[A-Za-z0-9_$<>\[\]|]+/g, '$1')
    .replace(/([A-Za-z0-9_$]+)\s*:\s*(string|number|boolean|any|Date|Request|Response)\b/g, '$1')
    .replace(/\s+/g, ' ')
    /* интервали около пунктуация и оператори */
    .replace(/\s*([(){}\[\],;:?<>=!+\-*/%&|]+)\s*/g, '$1')
    .trim();
  return t.replace(/ (\d+) /g, (_, i) => lits[+i]);
}

const client = topLevelFns(CLIENT);
const edge = topLevelFns(EDGE);

(function () {

  section('1. Двата файла изобщо се разбират');
  {
    ok('report.js дава функции', Object.keys(client).length > 30,
      String(Object.keys(client).length));
    ok('едж файлът дава функции', Object.keys(edge).length > 30,
      String(Object.keys(edge).length));
    ok('списъкът SHARED_FNS няма повторения',
      SHARED_FNS.length === new Set(SHARED_FNS).size);
  }

  section('2. Трийсетте споделени функции ги има и в двата файла');
  {
    const missingClient = SHARED_FNS.filter(n => !client[n]);
    const missingEdge = SHARED_FNS.filter(n => !edge[n]);
    ok('нито една не липсва в report.js', missingClient.length === 0,
      missingClient.join(', '));
    /* Точно това беше v5: buildWrongReceiptRowHtml я нямаше тук и редът
       не излизаше в автоматичния имейл. */
    ok('нито една не липсва в едж функцията', missingEdge.length === 0,
      missingEdge.join(', '));
  }

  section('3. ЯДРОТО: кодът им е идентичен');
  {
    /* Приетата разлика се ЗАКЪРПВА, не се прескача — така всяко ДРУГО
       разминаване в същата функция пак се вижда. */
    const patchOf = {};
    ACCEPTED_DRIFT.forEach(d => { patchOf[d.fn] = d.patch; });
    const drift = SHARED_FNS.filter(function (n) {
      if (!client[n] || !edge[n]) return false;
      const e = patchOf[n] ? patchOf[n](edge[n]) : edge[n];
      return codeOnly(client[n]) !== codeOnly(e);
    });
    ok('нула НЕочаквани разминавания в кода', drift.length === 0,
      drift.join(', ') + '  ← синхронизирай ги, преди да деплойваш');

    /* Показваме и колко са буквално идентични (с коментарите) — не е
       изискване, но пада ли рязко, значи двата файла се раздалечават. */
    const identical = SHARED_FNS.filter(n => client[n] === edge[n]).length;
    ok('поне две трети са идентични и с коментарите',
      identical >= Math.floor(SHARED_FNS.length * 2 / 3),
      identical + ' от ' + SHARED_FNS.length);
  }

  section('3b. Приетите разминавания са точно тези и още ги има');
  {
    if (!ACCEPTED_DRIFT.length) {
      ok('няма приети разминавания — двата файла съвпадат напълно', true);
    }
    ACCEPTED_DRIFT.forEach(function (d) {
      if (!ok(d.fn + ' е в списъка SHARED_FNS', SHARED_FNS.indexOf(d.fn) >= 0)) return;
      if (!ok(d.fn + ' я има и в двата файла', !!(client[d.fn] && edge[d.fn]))) return;
      /* Записът трябва да е ЖИВ. Изчезне ли разликата (напр. защото едж
         файлът е изравнен при деплой), редът тук става лъжа и трябва да
         падне — иначе списъкът бавно се превръща в гробище. */
      ok(d.fn + ' ВСЕ ОЩЕ се различава — записът е актуален',
        codeOnly(client[d.fn]) !== codeOnly(edge[d.fn]),
        'разликата я няма вече → махни записа от ACCEPTED_DRIFT');
      /* И е ТОЧНО описаната: закърпено, двете съвпадат напълно. */
      ok(d.fn + ' се различава ТОЧНО с описаното, нищо повече',
        codeOnly(client[d.fn]) === codeOnly(d.patch(edge[d.fn])),
        'има и друга разлика в тази функция — не е покрита от записа');
      ok(d.fn + ' носи обяснение защо е приета', !!d.note && d.note.length > 40);
    });
  }

  section('4. Копираните помощници съвпадат с оригиналите си');
  {
    COPIED_HELPERS.forEach(function (h) {
      const orig = topLevelFns(h.from)[h.fn];
      const copy = edge[h.fn];
      if (!ok(h.fn + ' я има в едж функцията', !!copy)) return;
      if (!ok(h.fn + ' я има в ' + path.basename(h.from), !!orig)) return;
      ok(h.fn + ' съвпада с оригинала', normalize(orig) === normalize(copy),
        '\n      оригинал: ' + normalize(orig) + '\n      копие:    ' + normalize(copy));
    });
  }

  section('5. ЯДРОТО: едж функцията не вика нищо, което няма');
  {
    const src = fs.readFileSync(EDGE, 'utf8');

    /* Коментарите и стринговете отпадат ПЪРВИ — иначе текст като
       „застояли pending (>7 дни)" минава за извикване на pending(). */
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');

    const defined = new Set();
    (src.match(/function\s+([A-Za-z0-9_$]+)/g) || [])
      .forEach(m => defined.add(m.replace(/function\s+/, '')));
    (src.match(/(?:var|let|const)\s+([A-Za-z0-9_$]+)/g) || [])
      .forEach(m => defined.add(m.split(/\s+/)[1]));
    /* Параметрите също са имена в обхват (cb, win, data …). */
    (src.match(/function[^(]*\(([^)]*)\)/g) || []).forEach(function (m) {
      m.match(/\(([^)]*)\)/)[1].split(',')
        .map(x => x.trim().split(/[:\s=]/)[0]).filter(Boolean)
        .forEach(x => defined.add(x));
    });

    const KEYWORDS = ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
      'function', 'async', 'await', 'new', 'delete', 'void', 'in', 'of', 'do',
      'else', 'try', 'throw'];
    const GLOBALS = ['fetch', 'JSON', 'Promise', 'Array', 'Object', 'String',
      'Number', 'Math', 'Date', 'Boolean', 'Response', 'Request', 'Error',
      'Deno', 'decodeURIComponent', 'encodeURIComponent', 'parseInt',
      'parseFloat', 'isNaN', 'Set', 'Map', 'RegExp', 'console'];

    const called = new Set();
    const re = /(^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    let m;
    while ((m = re.exec(code))) called.add(m[2]);

    const unknown = [...called].filter(n =>
      !defined.has(n) && KEYWORDS.indexOf(n) < 0 && GLOBALS.indexOf(n) < 0).sort();

    ok('всяко извикано име съществува в едж файла', unknown.length === 0,
      unknown.join(', ') + '  ← копирано е извикването, но не и функцията');
    ok('детекторът вижда достатъчно имена, за да значи нещо',
      called.size > 30, String(called.size));
  }

  section('6. Съзнателните разминавания са точно тези');
  {
    const notInEdge = CLIENT_ONLY.filter(n => !edge[n]);
    ok('маршрутизацията и ръчните изпращания остават само в report.js',
      notInEdge.length === CLIENT_ONLY.length,
      'неочаквано в едж файла: ' +
      CLIENT_ONLY.filter(n => edge[n]).join(', '));
    ok('и наистина ги има в report.js',
      CLIENT_ONLY.every(n => client[n]),
      'липсват: ' + CLIENT_ONLY.filter(n => !client[n]).join(', '));

    ok('sbGet/sbPost/sbPatch са само в едж файла (SERVICE ROLE)',
      EDGE_ONLY.every(n => edge[n] && !client[n]),
      EDGE_ONLY.filter(n => client[n]).join(', '));

    /* Ако някой добави споделена функция и забрави да я впише в SHARED_FNS,
       тя ще стои в двата файла необхваната. Изкарваме такива наяве. */
    const unlisted = Object.keys(client).filter(n =>
      edge[n] && SHARED_FNS.indexOf(n) < 0 && EDGE_ONLY.indexOf(n) < 0 &&
      COPIED_HELPERS.every(h => h.fn !== n));
    ok('няма функция в двата файла извън списъка', unlisted.length === 0,
      unlisted.join(', ') + '  ← добави я в SHARED_FNS');
  }

  report();
})();
