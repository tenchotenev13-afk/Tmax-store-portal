/* „Човек без нито една задача за седмицата НЕ получава писмо."

   Правилото звучи тривиално и точно затова е опасно: писмото се строи от
   personalizedSectionHtml(), която при празен списък връща учтивото „Няма
   задачи, адресирани лично към теб тази седмица." Тоест грешката НЕ гърми —
   тя изглежда като нормално писмо и в понеделник сутрин тръгва до хора,
   които нямат работа с бюлетина. Един пропуснат ред в цикъла на изпращането
   стига.

   Затова решението кой получава писмо живее в ОТДЕЛНА функция —
   routedMailPlan() в supabase/functions/send-routed-report/index.ts — и се
   тества пряко тук, а не чрез четене на обработчика.

   Функциите се вадят от .ts файла и се изпълняват НАИСТИНА. Това е важно:
   `node --check` не проверява .ts (връща 0 и за счупен файл), а самата едж
   функция не се изпълнява никъде в репото. Ако тук нещо не се разбере, значи
   и Deno няма да го разбере.

   Какво тестът НЕ прави: не пуска HTTP обработчика и не проверява деплоя.
   Проверките за реда в notification_topics (active/test_email) са ЗАКОТВЕНИ
   В КОДА, не изпълнени — отбелязано е поименно при всяка.

   Пускане:  node tests/routed-empty-recipient.test.js .
*/
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report, guard } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const SRC_PATH = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');

if (!fs.existsSync(SRC_PATH)) {
  console.error('❌ няма файл ' + SRC_PATH);
  process.exit(1);
}
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

/* Изважда обявление на най-горно ниво (функция или var) по име, затваряйки
   го по БРОЯЧ на скоби — същият разбор като в report-edge-sync.test.js.
   Простите TS анотации отпадат, за да мине блокът през JS парсера. */
function extract(name) {
  const lines = SRC.split(/\r?\n/);
  let start = -1;
  const reFn = new RegExp('^(?:function|var|const|let) ' + name + '\\b');
  for (let i = 0; i < lines.length; i++) {
    if (reFn.test(lines[i])) { start = i; break; }
  }
  if (start < 0) throw new Error('няма обявление ' + name);
  let depth = 0, started = false, end = start;
  for (let j = start; j < lines.length; j++) {
    const bare = lines[j]
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (let k = 0; k < bare.length; k++) {
      if (bare[k] === '{') { depth++; started = true; }
      else if (bare[k] === '}') depth--;
    }
    if (started && depth <= 0) { end = j; break; }
    /* Едноредово `var x = null;` няма скоби изобщо. */
    if (!started && /;\s*$/.test(lines[j])) { end = j; break; }
  }
  return lines.slice(start, end + 1).join('\n')
    .replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*(string|number)\[\]/g, '')
    .replace(/:\s*(string|number|boolean|any)\b/g, '');
}

let M = null;
try {
  M = new Function(
    ['esc', 'REPORT_GROUPS', 'coPeopleCache', 'coPersonName',
     'resolveRecipientsForTask', 'buildRecipientMap', 'routedMailPlan',
     'routedTestBannerHtml', 'reportDayMonth', 'routedWeeklySubject']
      .map(extract).join('\n') +
    '\nreturn { REPORT_GROUPS, coPersonName, resolveRecipientsForTask,' +
    ' buildRecipientMap, routedMailPlan, routedTestBannerHtml,' +
    ' routedWeeklySubject, setCoPeople: function(v){ coPeopleCache = v; } };')();
} catch (e) {
  console.error('❌ не мога да извадя функциите от ' + SRC_PATH + ': ' + e.message);
  process.exit(1);
}

const OWNER = { name: 'Теодор Тенев', email: 't.tenev@temax.bg' };

(function () {

  section('1. routedMailPlan — празният човек отпада');
  {
    /* Точният случай, който правилото пази: запис в картата без нито една
       задача. Влезе ли в плана, човекът получава писмо „Няма задачи…". */
    const plan = M.routedMailPlan({
      'a@temax.bg': { name: 'А', tasks: [{ id: 't-1' }] },
      'b@temax.bg': { name: 'Б', tasks: [] }
    });
    ok('остава само човекът със задача', plan.length === 1,
      JSON.stringify(plan.map(p => p.email)));
    ok('и това е точно той', plan[0].email === 'a@temax.bg', plan[0].email);
    ok('празният не е в плана',
      plan.every(p => p.email !== 'b@temax.bg'));
    ok('планът носи задачите му', plan[0].tasks.length === 1);
    ok('и името му', plan[0].name === 'А', plan[0].name);
  }

  section('2. Повредени и липсващи данни също не пращат писмо');
  {
    /* Всеки от тези редове е „човек без задачи", само записан различно.
       Пада ли някой от тях в плана, писмото пак тръгва. */
    const plan = M.routedMailPlan({
      'c@temax.bg': { name: 'В' },                  /* липсва tasks */
      'd@temax.bg': { name: 'Г', tasks: null },
      'e@temax.bg': null,
      '': { name: 'Празен ключ', tasks: [{ id: 't-9' }] }
    });
    ok('нито един не получава писмо', plan.length === 0,
      JSON.stringify(plan.map(p => p.email)));

    let empty = null;
    if (guard('празна карта не чупи функцията', function () {
      empty = M.routedMailPlan({});
    })) {
      ok('и дава празен план', empty.length === 0);
    }
    let missing = null;
    if (guard('липсваща карта не чупи функцията', function () {
      missing = M.routedMailPlan(null);
    })) {
      ok('и тя дава празен план', missing.length === 0);
    }
  }

  section('3. Целият път: задачи → получатели → план');
  {
    M.setCoPeople([{ email: 'k.ivanova@temax.bg', display_name: 'Красимира Иванова' }]);

    /* Три задачи, три различни адресата. Никой не е отметнат на всичките,
       тоест всеки трябва да получи РАЗЛИЧНО писмо, а не общо. */
    const tasks = [
      { id: 't-1', kind: 'regular', title: 'Витрина', report_groups: ['owner'] },
      { id: 't-2', kind: 'regular', title: 'Ревизия', report_groups: ['user:k.ivanova@temax.bg'] },
      { id: 't-3', kind: 'regular', title: 'Отчет',   report_groups: ['owner'] }
    ];
    const map = M.buildRecipientMap(tasks, [], {});
    const plan = M.routedMailPlan(map);

    ok('двама получатели, не трима', plan.length === 2,
      JSON.stringify(plan.map(p => p.email + ':' + p.tasks.length)));

    const owner = plan.filter(p => p.email === OWNER.email)[0];
    ok('Т. Тенев получава своите ДВЕ задачи',
      !!owner && owner.tasks.length === 2, JSON.stringify(owner && owner.tasks.length));
    ok('и не получава чуждата',
      !!owner && owner.tasks.every(t => t.id !== 't-2'));

    const co = plan.filter(p => p.email === 'k.ivanova@temax.bg')[0];
    ok('човекът от ЦО получава само своята', !!co && co.tasks.length === 1);
    ok('и излиза с ИМЕТО си, не с имейла',
      !!co && co.name === 'Красимира Иванова', co && co.name);

    /* Ядрото на правилото в реален вид: човек, който е в REPORT_GROUPS, но
       не е отметнат на НИТО ЕДНА задача тази седмица, изобщо не се появява. */
    const notAddressed = M.REPORT_GROUPS.controlling.people[0].email;
    ok('човек, неотметнат на нито една задача, не е в плана',
      plan.every(p => p.email !== notAddressed), notAddressed);
    ok('и го няма дори в картата', !map[notAddressed]);

    /* Нула маршрутизирани задачи → нула писма, не едно празно до всеки. */
    ok('без задачи изобщо няма получатели',
      M.routedMailPlan(M.buildRecipientMap([], [], {})).length === 0);
  }

  section('4. Обработчикът минава ПРЕЗ routedMailPlan, не покрай него');
  {
    /* Закотвяне в кода: тестът по-горе доказва, че функцията върши работа;
       това доказва, че изпращането наистина я ползва. Без него правилото
       може да остане вярно и напълно незадействано. */
    const serve = (SRC.match(/Deno\.serve\([\s\S]*$/) || [''])[0];
    ok('планът се строи от routedMailPlan(map)',
      /var plan\s*=\s*routedMailPlan\(map\)/.test(serve));
    ok('цикълът на изпращането обхожда plan, не map',
      /for \(var i = 0; i < plan\.length; i\+\+\)/.test(serve));
    ok('няма изпращане направо по ключовете на картата',
      !/Object\.keys\(map\)[\s\S]{0,200}routedSendEmail/.test(serve));
    ok('routedSendEmail се вика точно веднъж в обработчика',
      (serve.match(/routedSendEmail\(/g) || []).length === 1);
  }

  section('5. Тестовият режим (закотвено в кода, не изпълнено)');
  {
    const serve = (SRC.match(/Deno\.serve\([\s\S]*$/) || [''])[0];
    ok('темата се чете по ключ weekly_routed',
      /TOPIC_KEY = 'weekly_routed'/.test(SRC) &&
      /sbGet\('notification_topics', 'key=eq\.' \+ TOPIC_KEY/.test(serve));
    ok('изключената тема връща skipped и НЕ праща',
      /if \(!topic\.active\)[\s\S]{0,220}skipped/.test(serve));
    /* Проверката за active стои ПРЕДИ първото изпращане — иначе „не праща"
       зависи от това докъде е стигнало изпълнението. */
    ok('и проверката е преди изпращането',
      serve.indexOf('!topic.active') < serve.indexOf('routedSendEmail('));
    ok('при test_email адресът се подменя',
      /routedSendEmail\(testEmail \|\| p\.email/.test(serve));
    ok('и се добавя лента за кого е било предназначено',
      /testEmail \? routedTestBannerHtml\(p\.name, p\.email\) : ''/.test(serve));
    ok('без test_email писмата отиват на истинските адреси',
      /var testEmail = topic\.test_email \|\| null/.test(serve));

    /* Самата лента е функция и се проверява НАИСТИНА. */
    const banner = M.routedTestBannerHtml('Жеко Желязков', 'j.jeliazkov@temax.bg');
    ok('лентата казва ТЕСТОВ РЕЖИМ', banner.indexOf('ТЕСТОВ РЕЖИМ') >= 0, banner);
    ok('и носи името и имейла на истинския получател',
      banner.indexOf('Жеко Желязков') >= 0 &&
      banner.indexOf('j.jeliazkov@temax.bg') >= 0, banner);
    ok('жълта е, за да личи от съдържанието',
      banner.indexOf('#fef3c7') >= 0, banner);
    /* Имената идват от базата — минават през esc(), не се залепват сурови. */
    ok('името се екранира',
      M.routedTestBannerHtml('<b>х</b>', 'a@b.bg').indexOf('<b>х</b>') < 0);
  }

  section('6. Следата в notification_topics (закотвено в кода)');
  {
    const serve = (SRC.match(/Deno\.serve\([\s\S]*$/) || [''])[0];
    ok('обновява last_run_at', /last_run_at: new Date\(\)\.toISOString\(\)/.test(serve));
    ok('обновява last_recipients', /last_recipients: plan\.length/.test(serve));
    ok('обновява last_status', /last_status:/.test(serve));
    ok('и трите на реда на СЪЩАТА тема',
      /sbPatch\('notification_topics', 'key=eq\.' \+ TOPIC_KEY/.test(serve));
  }

  section('7. Темата на писмото');
  {
    /* Темата е на кирилица, в стила на останалите писма от портала. От
       23.08.2026 transliterate() в resend-email не се вика — темата минава
       през encodeSubject() (RFC 2047) и излиза на кирилица нарочно.
       Проверява се РЕЗУЛТАТЪТ, не изходният код. */
    const wk = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27',
                '2026-08-28','2026-08-29','2026-08-30'];
    const subj = M.routedWeeklySubject(wk);
    ok('точният вид, който се очаква в пощата',
      subj === '📬 ТеМАХ — Личен седмичен отчет 24.08 – 30.08.2026', subj);
    ok('носи датите на седмицата',
      subj.indexOf('24.08') >= 0 && subj.indexOf('30.08') >= 0, subj);
    ok('и годината', subj.indexOf('2026') >= 0, subj);
    /* Дългото тире между датите е същото като в reportWeeklySubject —
       различно от дефиса и от тирето след „ТеМАХ". */
    ok('разделителят между датите е – (U+2013)',
      subj.indexOf(' – ') >= 0, JSON.stringify(subj));

    /* Без бюлетин — тема без дати, вместо „NaN.NaN" до управители. */
    const bare = M.routedWeeklySubject(null);
    ok('без седмица пада на тема без дати',
      bare === '📬 ТеМАХ — Личен седмичен отчет', bare);
    ok('счупени дати също не дават NaN',
      M.routedWeeklySubject(['x','x','x','x','x','x','x']).indexOf('NaN') < 0);
    ok('и те падат на същата тема',
      M.routedWeeklySubject(['x','x','x','x','x','x','x']) === bare);
  }

  report();
})();
