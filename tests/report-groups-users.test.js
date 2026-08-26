/* „Групи за докладване" приема и ОТДЕЛНИ ХОРА, не само четирите групи.

   Бюлетинът го пише един човек, но задачите идват от снабдяване,
   счетоводство, маркетинг. Дотук отчетът за изпълнението можеше да отиде само
   при `co` / `controlling` / `regional` / `owner`, тоест възложителят не
   научаваше нищо за собствената си задача. `report_groups` е text[] и приема
   и стойност `user:<имейл>` — нова колона не трябва, схемата не се пипа.

   Двете половини се тестват ЗАЕДНО, защото се чупят поотделно:

     · формата (bulletin.js) може да рисува отметките, а маршрутизацията
       (report.js) да ги подминава мълчаливо — `if(!grp)return;` пропуска
       всичко, което не е един от четирите ключа, без грешка и без следа;
     · маршрутизацията може да ги разбира, а формата да няма как да ги
       въведе.

   ⚠️ АНТИ-ТАВТОЛОГИЯ. Проверките 3, 5 и 6 са пуснати срещу СТАРИЯ код и
   падат (проверено на 26.08.2026, преди промяната да влезе):
     · 3 → старата функция чете само Object.keys(REPORT_GROUPS) и запазената
           стойност 'user:x@temax.bg' изобщо не се рисува → 0 отметки;
     · 5 → `REPORT_GROUPS['user:x@temax.bg']` е undefined → 0 получатели;
     · 6 → без дедупликация по имейл Миглена излиза 2 пъти.
   Проверка 7 е обратната: тя пази СТАРОТО поведение — непозната стойност без
   представка `user:` продължава да се пропуска, а не да става получател.

   Пускане:  node tests/report-groups-users.test.js .
*/
'use strict';

const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

/* Хората от ЦО, каквито ги връща loadCentralOfficePeople(): само двете
   безопасни колони, подредени по display_name. */
const CO_PEOPLE = [
  { email: 'k.ivanova@temax.bg', display_name: 'Красимира Иванова' },
  { email: 'm.pavlova@temax.bg', display_name: 'Миглена Павлова' },
  { email: 'y.koycheva@temax.bg', display_name: 'Юлиана Койчева' }
];

function env(over) {
  return boot(Object.assign({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: { users: [], stores: [], bulletins: [] }
  }, over || {}));
}

/* Рендира отметките в DOM-а и връща контейнера — readReportGroupsCheckboxes
   чете от документа, не от низа. */
function renderBoxes(h, selId, selectedArr) {
  h.doc.body.innerHTML = h.w.reportGroupsCheckboxesHtml(selId, selectedArr);
  return h.doc.getElementById(selId);
}

function boxes(wrap) {
  return Array.prototype.slice.call(wrap.querySelectorAll('input[type=checkbox]'));
}

(function () {

  /* ── 1 ─────────────────────────────────────────────────────────────────── */
  section('1. Празен кеш — четирите групи си остават, формата не гърми');
  {
    const h = env();
    /* Мрежов срив: loadCentralOfficePeople() оставя ПРАЗЕН МАСИВ, не null.
       Тестваме и двете състояния — null (още не е зареден) и [] (срив). */
    [null, []].forEach(function (state) {
      const label = state === null ? 'кешът е null' : 'кешът е празен масив';
      h.w.coPeopleCache = state;
      let wrap = null;
      /* guard() връща true, когато НЕ е хвърлила — хвърли ли, проверките
         надолу нямат какво да проверяват. */
      if (guard('reportGroupsCheckboxesHtml не хвърля (' + label + ')',
        () => { wrap = renderBoxes(h, 'tk-report-groups', []); })) {
        if (!ok('контейнерът се рендира (' + label + ')', !!wrap)) return;
        const vals = boxes(wrap).map(cb => cb.value);
        ok('точно четирите групи (' + label + ')',
          vals.join(',') === 'co,controlling,regional,owner', vals.join(','));
        ok('няма секция „Отделни хора" (' + label + ')',
          wrap.textContent.indexOf('Отделни хора') < 0);
      }
    });
    h.close && h.close();
  }

  /* ── 2 ─────────────────────────────────────────────────────────────────── */
  section('2. Кеш с трима души — три допълнителни отметки user:<имейл>');
  {
    const h = env();
    h.w.coPeopleCache = CO_PEOPLE.slice();
    const wrap = renderBoxes(h, 'tk-report-groups', []);
    if (ok('контейнерът се рендира', !!wrap)) {
      const vals = boxes(wrap).map(cb => cb.value);
      ok('общо 4 групи + 3 души = 7 отметки', vals.length === 7, String(vals.length));
      ok('има секция „Отделни хора"', wrap.textContent.indexOf('Отделни хора') >= 0);
      CO_PEOPLE.forEach(function (p) {
        ok('стойност user:' + p.email, vals.indexOf('user:' + p.email) >= 0, vals.join(','));
      });
      /* Етикетът е ИМЕТО, не имейлът — иначе формата става нечетима. */
      ok('показва display_name, не имейла',
        wrap.textContent.indexOf('Юлиана Койчева') >= 0 &&
        wrap.textContent.indexOf('y.koycheva@temax.bg') < 0,
        wrap.textContent.replace(/\s+/g, ' ').slice(0, 200));
      /* Групите остават ПЪРВИ — редът е част от договора с
         readReportGroupsCheckboxes (проверка 4). */
      ok('групите са преди хората',
        vals.slice(0, 4).join(',') === 'co,controlling,regional,owner', vals.join(','));
      ok('нищо не е отметнато без selectedArr',
        boxes(wrap).every(cb => !cb.checked));
    }
    h.close && h.close();
  }

  /* ── 3 ─────────────────────────────────────────────────────────────────── */
  section('3. Записана стойност, която я НЯМА в кеша, не се изхвърля');
  {
    const h = env();
    /* Човекът е деактивиран или е сменил обект след като задачата е записана.
       Ако отметката изчезне, редакцията на старата задача би изтрила тихо
       получател, когото никой не е махал. */
    h.w.coPeopleCache = CO_PEOPLE.filter(p => p.email !== 'x@temax.bg');
    const wrap = renderBoxes(h, 'etk-report-groups', ['co', 'user:x@temax.bg']);
    if (ok('контейнерът се рендира', !!wrap)) {
      const all = boxes(wrap);
      const vals = all.map(cb => cb.value);
      ok('x@temax.bg НЕ е в кеша (иначе тестът е тавтологичен)',
        h.w.coPeopleCache.every(p => p.email !== 'x@temax.bg'));
      const lost = all.filter(cb => cb.value === 'user:x@temax.bg')[0];
      if (ok('отметката за x@temax.bg все пак я има', !!lost, vals.join(','))) {
        ok('и е ОТМЕТНАТА', lost.checked === true);
      }
      ok('рисува се точно веднъж',
        vals.filter(v => v === 'user:x@temax.bg').length === 1, vals.join(','));
      /* Кешът не я знае → етикетът е самият имейл, за да се вижда КОЙ е. */
      ok('етикетът е имейлът', wrap.textContent.indexOf('x@temax.bg') >= 0);
      ok('„co" също е отметната', all.filter(cb => cb.value === 'co')[0].checked === true);
      ok('останалите групи не са отметнати',
        all.filter(cb => cb.value === 'controlling')[0].checked === false &&
        all.filter(cb => cb.value === 'owner')[0].checked === false);
      /* Хората от кеша НЕ се дублират заради добавената стойност. */
      ok('4 групи + 3 от кеша + 1 запазена = 8', vals.length === 8, String(vals.length));
    }
    h.close && h.close();
  }

  /* ── 4 ─────────────────────────────────────────────────────────────────── */
  section('4. readReportGroupsCheckboxes връща смесен масив в реда на отметките');
  {
    const h = env();
    h.w.coPeopleCache = CO_PEOPLE.slice();
    const sel = ['controlling', 'user:y.koycheva@temax.bg', 'user:k.ivanova@temax.bg'];
    const wrap = renderBoxes(h, 'rec-report-groups', sel);
    if (ok('контейнерът се рендира', !!wrap)) {
      const got = h.w.readReportGroupsCheckboxes('rec-report-groups');
      /* Редът е ДОКУМЕНТЕН (querySelectorAll), не редът на selectedArr:
         групите първи, после хората по display_name — Красимира преди Юлиана. */
      ok('връща точно отметнатите, в реда на отметките',
        got.join(',') === 'controlling,user:k.ivanova@temax.bg,user:y.koycheva@temax.bg',
        got.join(','));
      ok('смесва ключ и user: стойност в един масив',
        got.indexOf('controlling') >= 0 && got.some(v => v.indexOf('user:') === 0));
      ok('нищо неотметнато не влиза', got.length === 3, String(got.length));

      /* Кръгът се затваря: прочетеното се връща обратно във формата и дава
         същите отметки — точно това прави редакцията на задача. */
      const again = renderBoxes(h, 'rec-report-groups', got);
      const back = h.w.readReportGroupsCheckboxes('rec-report-groups');
      ok('обратно във формата дава същото', back.join(',') === got.join(','),
        back.join(','));
      ok('и същия брой отметки', boxes(again).length === 7, String(boxes(again).length));
    }
    h.close && h.close();
  }

  /* ── 5 ─────────────────────────────────────────────────────────────────── */
  section('5. resolveRecipientsForTask разбира user:<имейл>');
  {
    const h = env();
    h.w.coPeopleCache = CO_PEOPLE.slice();
    const task = { id: 't-1', kind: 'regular', report_groups: ['user:x@temax.bg'],
                   target_stores: [], created_by: null };
    const got = h.w.resolveRecipientsForTask(task, [], {});
    ok('точно един получател', got.length === 1, JSON.stringify(got));
    if (got.length) {
      ok('с имейла от стойността', got[0].email === 'x@temax.bg', got[0].email);
      /* Няма го в кеша → името пада обратно към имейла, писмото пак има адрес. */
      ok('името пада към имейла, щом кешът не го знае',
        got[0].name === 'x@temax.bg', got[0].name);
    }

    /* Същото, но човекът Е в кеша → взима се display_name. */
    const known = h.w.resolveRecipientsForTask(
      { id: 't-2', kind: 'regular', report_groups: ['user:y.koycheva@temax.bg'],
        target_stores: [], created_by: null }, [], {});
    if (ok('и за човек от кеша — един получател', known.length === 1, JSON.stringify(known))) {
      ok('името идва от кеша', known[0].name === 'Юлиана Койчева', known[0].name);
      ok('имейлът е правилният', known[0].email === 'y.koycheva@temax.bg', known[0].email);
    }

    /* Празен кеш не бива да чупи маршрутизацията — седмичният отчет може да
       тръгне, без Бюлетин изобщо да е отварян. */
    h.w.coPeopleCache = null;
    const cold = h.w.resolveRecipientsForTask(
      { id: 't-3', kind: 'regular', report_groups: ['user:y.koycheva@temax.bg'],
        target_stores: [], created_by: null }, [], {});
    if (ok('при празен кеш пак има получател', cold.length === 1, JSON.stringify(cold))) {
      ok('с имейл за име', cold[0].name === 'y.koycheva@temax.bg' &&
        cold[0].email === 'y.koycheva@temax.bg', JSON.stringify(cold[0]));
    }
    h.close && h.close();
  }

  /* ── 6 ─────────────────────────────────────────────────────────────────── */
  section('6. Човек и в група, и отметнат поименно — ЕДНО писмо');
  {
    const h = env();
    h.w.coPeopleCache = CO_PEOPLE.slice();
    const task = { id: 't-4', kind: 'regular',
                   report_groups: ['controlling', 'user:m.pavlova@temax.bg'],
                   target_stores: [], created_by: null };
    /* ⚠️ Тази секция трябва да пада и срещу СТАРИЯ код. Само „Миглена веднъж"
       не стига: там `user:` стойността отпада изцяло, тоест дублиране няма
       откъде да дойде и проверката минава тавтологично. Затова първо се
       заковава, че смесеният запис ИЗОБЩО е разчетен — човек, до когото се
       стига само през `user:`, наистина влиза в списъка (старият код дава 2
       вместо 3). Чак тогава дедупликацията долу значи нещо. */
    const mixed = h.w.resolveRecipientsForTask(
      Object.assign({}, task, { report_groups: ['controlling', 'user:x@temax.bg'] }),
      [], {});
    ok('смесен запис: групата + отделният човек дават трима',
      mixed.length === 3, mixed.map(r => r.email).join(','));
    ok('отделният човек наистина е в списъка',
      mixed.some(r => r.email === 'x@temax.bg'), mixed.map(r => r.email).join(','));

    const got = h.w.resolveRecipientsForTask(task, [], {});
    const megi = got.filter(r => r.email === 'm.pavlova@temax.bg');
    ok('Миглена е ВЕДНЪЖ, не два пъти', megi.length === 1,
      got.map(r => r.email).join(','));
    /* Цвети идва само от групата и не бива да изчезне заедно с дедупликацията. */
    ok('Цветелина още я има', got.some(r => r.email === 'c.teneva@temax.bg'),
      got.map(r => r.email).join(','));
    ok('общо двама получатели', got.length === 2, got.map(r => r.email).join(','));
    /* Първото име печели — същото, което прави buildRecipientMap надолу. */
    if (megi.length) ok('името е от групата (първото срещнато)',
      megi[0].name === 'Миглена Павлова', megi[0].name);

    /* И надолу през buildRecipientMap — там е реалният път към имейла. */
    const map = h.w.buildRecipientMap([task], [], {});
    ok('buildRecipientMap също дава един запис за Миглена',
      !!map['m.pavlova@temax.bg'] && Object.keys(map).length === 2,
      Object.keys(map).join(','));

    /* Обратният ред на групите дава същия резултат — иначе резултатът зависи
       от подредбата на отметките. */
    const rev = h.w.resolveRecipientsForTask(
      Object.assign({}, task, { report_groups: ['user:m.pavlova@temax.bg', 'controlling'] }),
      [], {});
    ok('обратният ред дава пак двама', rev.length === 2, rev.map(r => r.email).join(','));
    ok('и пак една Миглена',
      rev.filter(r => r.email === 'm.pavlova@temax.bg').length === 1);
    h.close && h.close();
  }

  /* ── 7 ─────────────────────────────────────────────────────────────────── */
  section('7. Непозната стойност БЕЗ представка user: — старото поведение стои');
  {
    const h = env();
    h.w.coPeopleCache = CO_PEOPLE.slice();
    const got = h.w.resolveRecipientsForTask(
      { id: 't-5', kind: 'regular',
        report_groups: ['glupost', 'marketing', 'user', 'users:x@temax.bg', ''],
        target_stores: [], created_by: null }, [], {});
    ok('нито един получател', got.length === 0, JSON.stringify(got));

    /* Смесено: боклукът се пропуска, валидните минават. */
    const mixed = h.w.resolveRecipientsForTask(
      { id: 't-6', kind: 'regular',
        report_groups: ['glupost', 'owner', 'user:x@temax.bg'],
        target_stores: [], created_by: null }, [], {});
    const em = mixed.map(r => r.email).sort().join(',');
    ok('минават само owner + отделният човек',
      em === 't.tenev@temax.bg,x@temax.bg', em);

    /* 'user:' без имейл след двоеточието не бива да прави получател с празен
       адрес — писмо до "" е тиха грешка чак при изпращането. */
    const empty = h.w.resolveRecipientsForTask(
      { id: 't-7', kind: 'regular', report_groups: ['user:'],
        target_stores: [], created_by: null }, [], {});
    ok('„user:" без имейл не дава получател', empty.length === 0, JSON.stringify(empty));

    /* Четирите фиксирани групи продължават да работят както преди. */
    const co = h.w.resolveRecipientsForTask(
      { id: 't-8', kind: 'regular', report_groups: ['co'],
        target_stores: [], created_by: null }, [], {});
    ok('групата „co" още дава двамата си човека', co.length === 2,
      co.map(r => r.email).join(','));
    h.close && h.close();
  }

  /* ── 8 ─────────────────────────────────────────────────────────────────── */
  section('8. Четирите форми ползват една и съща функция');
  {
    /* Ако някоя форма спре да я вика, отметките за хора биха изчезнали само
       там — най-тихият възможен провал. Затова се брои в изходния код. */
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.argv[2] || '.', 'bulletin.js'), 'utf8');
    const ids = (src.match(/reportGroupsCheckboxesHtml\('([^']+)'/g) || [])
      .map(m => m.replace(/.*\('/, '').replace(/'$/, ''));
    ok('четири извиквания — създаване и редакция, еднократна и постоянна',
      ids.length === 4, ids.join(','));
    ['tk-report-groups', 'etk-report-groups', 'erec-report-groups', 'rec-report-groups']
      .forEach(function (id) {
        ok('формата ' + id + ' я ползва', ids.indexOf(id) >= 0, ids.join(','));
      });
    /* И четирите четат обратно със същите ID-та. */
    ['tk-report-groups', 'etk-report-groups', 'erec-report-groups', 'rec-report-groups']
      .forEach(function (id) {
        ok('и се чете обратно от ' + id,
          src.indexOf("readReportGroupsCheckboxes('" + id + "')") >= 0);
      });
  }

  report();
})();
