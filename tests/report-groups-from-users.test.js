/* Групите на личния отчет — от users, не от кода (18.09.2026).

   До тази дата co / controlling / owner бяха твърд списък с имена
   (REPORT_GROUPS) в bulletin.js, report.js и send-routed-report, и смяна на
   човек искаше деплой. Сега член на група е активен потребител с имейл и
   users.notify_groups, съдържащ групата; 'regional' — users.is_regional.

   Какво заковава тестът:
     1. група с 0 членове → нито писмо от нея, предупреждение; задачата
        БЕЗ други получатели не праща нищо;
     2. група с 0 членове, но задачата има автор → картичката отива до
        автора, предупреждението остава;
     3. група с 2 членове → 2 писма;
     4. смяна на notify_groups сменя получателя БЕЗ смяна на кода;
     5. неактивен и без имейл не са членове; 'regional' е по is_regional,
        не по notify_groups, и е по обекти;
     6. routedEmptyGroups: едно предупреждение на група, с броя задачи;
     7. обработчикът: warnings минават към buildRecipientMap, console.warn,
        empty_groups в dry_run и в last_status (закотвено в кода);
     8. колекторът тегли active=true, с имейл, с notify_groups и is_regional —
        в двата файла; REPORT_GROUPS го няма; REPORT_GROUP_KEYS е същият;
     9. формата: етикетите са с имената от users; празна група — „няма хора";
        основните етикети са същите като в admin.js.

   Функциите се вадят от .ts файла и се изпълняват наистина (същият разбор
   като в routed-empty-recipient.test.js).

   Пускане: node tests/report-groups-from-users.test.js . */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ROOT = process.argv[2] || path.join(__dirname, '..');
const TS_PATH = path.join(ROOT, 'supabase/functions/send-routed-report/index.ts');
const SRC = fs.readFileSync(TS_PATH, 'utf8');
const REPORT = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
const BULLETIN = fs.readFileSync(path.join(ROOT, 'bulletin.js'), 'utf8');

function extract(name) {
  const lines = SRC.split(/\r?\n/);
  let start = -1;
  const reFn = new RegExp('^(?:function|var|const|let) ' + name + '\\b');
  for (let i = 0; i < lines.length; i++) { if (reFn.test(lines[i])) { start = i; break; } }
  if (start < 0) throw new Error('няма обявление ' + name);
  let depth = 0, started = false, end = start;
  for (let j = start; j < lines.length; j++) {
    const bare = lines[j]
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, '""');
    for (let k = 0; k < bare.length; k++) {
      if (bare[k] === '{') { depth++; started = true; }
      else if (bare[k] === '}') depth--;
    }
    if (started && depth <= 0) { end = j; break; }
    if (!started && /;\s*$/.test(lines[j])) { end = j; break; }
  }
  return lines.slice(start, end + 1).join('\n')
    .replace(/:\s*(string|number)\[\]/g, '')
    .replace(/:\s*(string|number|boolean|any)\b/g, '');
}

let M = null;
try {
  M = new Function(
    ['REPORT_GROUP_KEYS', 'reportNotifyGroupsOf', 'reportGroupMembers', 'coPeopleCache',
     'coPersonName', 'resolveRecipientsForTask', 'buildRecipientMap', 'routedMailPlan',
     'routedEmptyGroups'].map(extract).join('\n') +
    '\nreturn { REPORT_GROUP_KEYS, reportGroupMembers, resolveRecipientsForTask,' +
    ' buildRecipientMap, routedMailPlan, routedEmptyGroups };')();
} catch (e) {
  console.error('❌ не мога да извадя функциите от ' + TS_PATH + ': ' + e.message);
  process.exit(1);
}

const ZH = { email: 'j.jeliazkov@temax.bg', display_name: 'Жеко Желязков' };
const VS = { email: 'v.shikova@temax.bg', display_name: 'Василка Шикова' };
const MP = { email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова' };
const TT = { email: 't.tenev@temax.bg', display_name: 'Теодор Тенев' };
function u(p, groups, extra) { return Object.assign({ active: true, notify_groups: groups, is_regional: false, assigned_stores: [] }, p, extra || {}); }
function task(id, groups, extra) { return Object.assign({ id: id, kind: 'regular', title: 'Задача ' + id, report_groups: groups, target_stores: null, created_by: null }, extra || {}); }
const emails = list => list.map(r => r.email).sort().join(',');
const serve = (SRC.match(/Deno\.serve\([\s\S]*$/) || [''])[0];

(async function () {

  section('1. Група с 0 членове → без писмо + предупреждение');
  {
    const users = [u(MP, ['controlling']), u(TT, ['owner'])];      /* никой в co */
    const w = [];
    const got = M.resolveRecipientsForTask(task('t1', ['co']), users, {}, w);
    ok('0 получатели', got.length === 0, emails(got));
    ok('предупреждение за co', w.length === 1 && w[0].group === 'co' && w[0].task_id === 't1', JSON.stringify(w));
    const w2 = [];
    const plan = M.routedMailPlan(M.buildRecipientMap([task('t1', ['co'])], users, {}, w2));
    ok('планът е празен — писмо няма', plan.length === 0, JSON.stringify(plan));
    ok('buildRecipientMap предава предупреждението', w2.length === 1 && w2[0].group === 'co');
    guard('без масив за предупреждения не хвърля', () => M.resolveRecipientsForTask(task('t1', ['co']), users, {}));
  }

  section('2. Празна група, но задачата има автор → картичката отива до автора');
  {
    const users = [u(MP, ['controlling'])];
    const w = [];
    const plan = M.routedMailPlan(M.buildRecipientMap(
      [task('t2', ['co'], { created_by: 'Миглена Павлова' })], users, { 'Миглена Павлова': MP.email }, w));
    ok('един получател — авторът', plan.length === 1 && plan[0].email === MP.email, JSON.stringify(plan.map(p => p.email)));
    ok('предупреждението за co остава', w.length === 1 && w[0].group === 'co');
  }

  section('3. Група с 2 членове → 2 писма');
  {
    const users = [u(ZH, ['co']), u(VS, ['co']), u(MP, ['controlling'])];
    const w = [];
    const plan = M.routedMailPlan(M.buildRecipientMap([task('t3', ['co'])], users, {}, w));
    ok('2 писма', plan.length === 2, emails(plan));
    ok('до Жеко и Васка', emails(plan) === [ZH.email, VS.email].sort().join(','), emails(plan));
    ok('с имената от users', plan.some(p => p.name === 'Жеко Желязков') && plan.some(p => p.name === 'Василка Шикова'));
    ok('без предупреждение', w.length === 0, JSON.stringify(w));
  }

  section('4. Смяна на notify_groups сменя получателя — кодът е същият');
  {
    const users = [u(ZH, ['co']), u(TT, ['owner'])];
    const before = M.resolveRecipientsForTask(task('t4', ['co']), users, {});
    ok('преди: Жеко', emails(before) === ZH.email, emails(before));
    /* Администрация → „🔔 Групи": co минава от Жеко към Т. Тенев. */
    users[0].notify_groups = [];
    users[1].notify_groups = ['owner', 'co'];
    const after = M.resolveRecipientsForTask(task('t4', ['co']), users, {});
    ok('след: Т. Тенев', emails(after) === TT.email, emails(after));
    ok('Жеко вече не е получател', after.every(r => r.email !== ZH.email));
    /* Низовият вид '{a,b}' от PostgREST също се разбира. */
    const strUsers = [Object.assign(u(MP, null), { notify_groups: '{owner,controlling}' })];
    ok('notify_groups като низ „{owner,controlling}"',
      emails(M.resolveRecipientsForTask(task('t4b', ['controlling']), strUsers, {})) === MP.email);
  }

  section('5. Неактивен / без имейл не са членове; regional — по is_regional и обекти');
  {
    const users = [u(ZH, ['co'], { active: false }), u({ email: null, display_name: 'Без имейл' }, ['co']), u(VS, ['co'])];
    ok('само Васка (активна, с имейл)', emails(M.reportGroupMembers('co', users)) === VS.email,
      emails(M.reportGroupMembers('co', users)));
    const reg = [
      u({ email: 'r1@temax.bg', display_name: 'Р1' }, [], { is_regional: true, assigned_stores: ['Троян'] }),
      u({ email: 'r2@temax.bg', display_name: 'Р2' }, ['regional'], { is_regional: false, assigned_stores: ['Троян'] }),
      u({ email: 'r3@temax.bg', display_name: 'Р3' }, [], { is_regional: true, assigned_stores: ['Ловеч'] })
    ];
    const got = M.resolveRecipientsForTask(task('t5', ['regional'], { target_stores: ['Троян'] }), reg, {});
    ok('regional за Троян → само Р1 (is_regional + обектът)', emails(got) === 'r1@temax.bg', emails(got));
    ok('Р2 има notify_groups regional, но is_regional=false → не', got.every(r => r.email !== 'r2@temax.bg'));
    const all = M.resolveRecipientsForTask(task('t5b', ['regional']), reg, {});
    ok('задача за всички обекти → Р1 и Р3', emails(all) === 'r1@temax.bg,r3@temax.bg', emails(all));
    const w = [];
    M.resolveRecipientsForTask(task('t5c', ['regional']), [u(MP, ['regional'])], {}, w);
    ok('0 души с is_regional → предупреждение за regional', w.length === 1 && w[0].group === 'regional', JSON.stringify(w));
    const wx = [];
    const junk = M.resolveRecipientsForTask(task('t5d', ['glupost', 'user']), [u(MP, ['glupost'])], {}, wx);
    ok('непозната група се пропуска, както досега — без получател', junk.length === 0, emails(junk));
    ok('и без предупреждение (не е група)', wx.length === 0, JSON.stringify(wx));
  }

  section('6. routedEmptyGroups — по едно на група');
  {
    const eg = M.routedEmptyGroups([
      { group: 'co', task_id: 'a', title: 'А' }, { group: 'co', task_id: 'b', title: 'Б' },
      { group: 'owner', task_id: 'a', title: 'А' }, null, {}
    ]);
    ok('две групи', eg.length === 2, JSON.stringify(eg));
    const co = eg.filter(x => x.group === 'co')[0];
    ok('co: 2 задачи, двете заглавия', !!co && co.tasks === 2 && co.titles.join('|') === 'А|Б', JSON.stringify(co));
    ok('празен вход → []', M.routedEmptyGroups(null).length === 0 && M.routedEmptyGroups([]).length === 0);
  }

  section('7. Обработчикът — не тихо (закотвено в кода)');
  {
    ok('warnings минават към buildRecipientMap',
      /buildRecipientMap\(data\.tasks, data\.groupUsers, data\.creatorMap, warnings\)/.test(serve));
    ok('emptyGroups = routedEmptyGroups(warnings)', /var emptyGroups = routedEmptyGroups\(warnings\)/.test(serve));
    ok('console.warn за всяка празна група', /emptyGroups\.forEach\(function\(w[^)]*\)\{\s*console\.warn\(/.test(serve));
    ok('empty_groups в dry_run', /dry_run:true[\s\S]{0,300}empty_groups: emptyGroups/.test(serve));
    ok('празните групи в last_status', /last_status:[\s\S]{0,300}празни групи/.test(serve));
    ok('empty_groups в отговора след изпращане', /test_email:testEmail, empty_groups:emptyGroups/.test(serve));
  }

  section('8. Колекторът и ключовете — в двата файла');
  {
    const Q = "sbGet('users','active=eq.true&email=not.is.null&select=email,display_name,assigned_stores,is_regional,notify_groups&order=display_name')";
    ok('send-routed-report тегли активните с имейл, notify_groups и is_regional', SRC.indexOf(Q) >= 0);
    ok('report.js — същата заявка', REPORT.indexOf(Q) >= 0);
    ok('старата заявка is_regional=eq.true я няма в двата', SRC.indexOf("is_regional=eq.true&select") < 0 && REPORT.indexOf("is_regional=eq.true&select") < 0);
    const noHard = s => !/var REPORT_GROUPS\b/.test(s) && !/REPORT_GROUPS\[/.test(s) && s.indexOf('j.jeliazkov@temax.bg') < 0;
    ok('няма твърд списък в send-routed-report', noHard(SRC));
    ok('няма твърд списък в report.js', noHard(REPORT));
    ok('няма твърд списък в bulletin.js', noHard(BULLETIN));
    const KEYS = "var REPORT_GROUP_KEYS = ['co','controlling','regional','owner'];";
    ok('REPORT_GROUP_KEYS е ДОСЛОВНО същият в bulletin.js и в routed', BULLETIN.indexOf(KEYS) >= 0 && SRC.indexOf(KEYS) >= 0);
    ok('users никога не се чете с password_hash', !/password_hash/.test(SRC) && !/select=\*/.test(Q));
  }

  section('9. Формата — етикетите от users');
  {
    const h = boot({ modules: ['bulletin.js', 'report.js', 'admin.js'],
      user: { email: 'a@temax.bg', display_name: 'Админ', role: 'admin', store_name: 'Централен офис' },
      data: { users: [
        { email: ZH.email, display_name: ZH.display_name, notify_groups: ['co'] },
        { email: VS.email, display_name: VS.display_name, notify_groups: ['co'] },
        { email: TT.email, display_name: TT.display_name, notify_groups: ['owner'] },
        { email: 'x@temax.bg', display_name: 'Без група', notify_groups: [] }
      ] } });
    const w = h.w;
    const lbl = () => {
      h.doc.body.innerHTML = w.reportGroupsCheckboxesHtml('tk-report-groups', []);
      return Array.prototype.map.call(h.doc.querySelectorAll('#tk-report-groups label'), l => l.textContent.replace(/\s+/g, ' ').trim());
    };
    ok('преди зареждане — само имената на групите', lbl().slice(0, 4).join('|') === 'ЦО|Контролинг|Регионален (по магазин)|Собственик', lbl().join('|'));
    let loaded = null;
    guard('loadReportGroupPeople() не хвърля', () => { w.loadReportGroupPeople().then(r => { loaded = r; }); });
    for (let i = 0; i < 20 && !loaded; i++) await ticks();
    const q = h.calls.get.filter(x => x.indexOf('/users?') >= 0);
    ok('заявката е с явен select=id,email,display_name,notify_groups', q.some(x => x.indexOf('select=id,email,display_name,notify_groups') >= 0), q.join(' | '));
    ok('и само активните', q.some(x => x.indexOf('active=eq.true') >= 0));
    const L = lbl();
    ok('ЦО (Жеко Желязков, Василка Шикова)', L[0] === 'ЦО (Жеко Желязков, Василка Шикова)', L[0]);
    ok('Контролинг (няма хора)', L[1] === 'Контролинг (няма хора)', L[1]);
    ok('Регионален (по магазин)', L[2] === 'Регионален (по магазин)', L[2]);
    ok('Собственик (Теодор Тенев)', L[3] === 'Собственик (Теодор Тенев)', L[3]);
    ok('стойностите са ключовете, в същия ред', Array.prototype.map.call(h.doc.querySelectorAll('#tk-report-groups input'), c => c.value).slice(0, 4).join(',') === 'co,controlling,regional,owner');
    ok('основните етикети = NOTIFY_GROUP_LABELS в admin.js',
      w.REPORT_GROUP_KEYS.every(k => w.REPORT_GROUP_LABELS[k] === w.NOTIFY_GROUP_LABELS[k]),
      JSON.stringify([w.REPORT_GROUP_LABELS, w.NOTIFY_GROUP_LABELS]));
    ok('и същия ред като NOTIFY_GROUP_ORDER', w.REPORT_GROUP_KEYS.join(',') === w.NOTIFY_GROUP_ORDER.join(','));
    /* Смяна в админа → етикетът следва, без код. */
    w.reportGroupPeopleCache = null;
    h.setData('users', [{ email: 'k@temax.bg', display_name: 'Нов контролинг', notify_groups: ['controlling'] }]);
    loaded = null; w.loadReportGroupPeople().then(r => { loaded = r; });
    for (let i = 0; i < 20 && !loaded; i++) await ticks();
    ok('след смяна: Контролинг (Нов контролинг)', lbl()[1] === 'Контролинг (Нов контролинг)', lbl()[1]);
    ok('и ЦО вече е без хора', lbl()[0] === 'ЦО (няма хора)', lbl()[0]);
  }

  report();
})().catch(e => { console.error(e); ok('тестът завърши без изключение', false, e && e.message); report(); });
