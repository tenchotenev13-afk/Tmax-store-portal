/* СЪДЪРЖАНИЕТО на личната картичка по задача — personalizedTaskCardHtml().

   Заварено: картичката показваше заглавие, „X от Y обекта изпълнили" и
   отложените. Тоест получателят на задача от тип photo/file виждаше едно
   число и нямаше как да разбере нито КОИ обекти не са я изпълнили, нито
   какво са качили тези, които са — а точно това е смисълът на такава
   задача. Снимката стигаше до имейла като единица в събирането.

   Причината беше две нива по-надолу: collectWeeklyRoutingData изхвърляше
   photos/files при нормализацията на comps, а taskStoreBreakdown връщаше
   done като масив от ГОЛИ ИМЕНА, тоест дори да ги имаше, картичката нямаше
   откъде да ги вземе. Затова тестът минава през РЕАЛНИЯ колектор, а не
   само през картичката с ръчно подадени comps — иначе би заковал само
   последната от трите стъпки.

   Рендерът на прикачените е ЕДИН — reportAttachmentsHtml(), ползван и от
   коментарите по обекти в общия отчет, и оттук. Тестът проверява, че и
   двете места дават същия резултат за същия вход: разминат ли се, писмото
   започва да показва едно и също нещо по два начина.

   Пускане:  node tests/routed-card-content.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, ticks } = H;

const ADMIN = { email: 'a@temax.bg', display_name: 'Админ', role: 'admin',
                store_name: 'Централен офис' };

const STORES = ['Раднево', 'Габрово', 'Троян'];
const USERS = STORES.map(s => ({ store_name: s }))
  .concat([{ store_name: 'Централен офис' }]);

const SNIMKA = { url: 'https://cdn.test/vitrina.jpg', filename: 'vitrina.jpg' };
const XLSX = { url: 'https://cdn.test/otchet.xlsx', filename: 'otchet.xlsx' };

/* Мини-PostgREST за task_completions — същият като в
   weekly-routing-window.test.js: harness-ът връща цялата фикстура
   независимо от филтрите, затова прозорецът по дата се прилага тук. */
function byCompletionDate(rows) {
  return function (url) {
    const gte = (url.match(/completion_date=gte\.([^&]+)/) || [])[1];
    const lte = (url.match(/completion_date=lte\.([^&]+)/) || [])[1];
    return rows.filter(function (r) {
      if (!gte && !lte) return true;
      if (!r.completion_date) return false;
      if (gte && r.completion_date < decodeURIComponent(gte)) return false;
      if (lte && r.completion_date > decodeURIComponent(lte)) return false;
      return true;
    });
  };
}

function weekUnderTest(w) {
  const target = w.reportWeekOfMonday(w.reportPrevWeekMonday(new Date()));
  return { target, dates: w.weekDays(target.week, target.year).map(w.toLocalISO) };
}

function env(over) {
  return boot(Object.assign({
    modules: ['bulletin.js', 'report.js'],
    user: ADMIN,
    data: {
      bulletins: [], recurring_tasks: [], bulletin_tasks: [],
      task_completions: [], users: USERS, report_snapshots: []
    }
  }, over || {}));
}

/* Колко пъти един низ се среща в HTML-а. Използва се, за да се докаже, че
   неизпълнилият обект излиза ТОЧНО веднъж — в реда „Не са изпълнили" — а не
   втори път в блока на изпълнилите. */
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

(async function () {

  section('1. Целият път: колектор → разбивка → картичка');
  {
    const probe = env(); const wk = weekUnderTest(probe.w); probe.close();
    const due = wk.dates[2];

    const COMPS = [
      /* изпълнил с коментар И снимка */
      { task_id: 't-1', store_name: 'Раднево', status: 'done',
        comment: 'Витрината е подредена', photos: [SNIMKA], files: [],
        completion_date: due },
      /* изпълнил с прикачен документ, без коментар */
      { task_id: 't-1', store_name: 'Габрово', status: 'done',
        comment: '', photos: [], files: [XLSX], completion_date: due }
      /* Троян няма отмятане изобщо → неизпълнил */
    ];

    const h = env({
      data: {
        bulletins: [{ id: 'b-1', week_number: wk.target.week, year: wk.target.year,
                      status: 'published' }],
        bulletin_tasks: [
          { id: 't-1', bulletin_id: 'b-1', title: 'Снимка на витрината',
            report_groups: ['owner'], target_stores: STORES, due_date: due }
        ],
        recurring_tasks: [],
        task_completions: byCompletionDate(COMPS),
        users: USERS
      }
    });
    let data = null;
    h.w.collectWeeklyRoutingData(function (d) { data = d; });
    await ticks();

    if (ok('данните се събират', !!(data && data.tasks.length))) {

      /* Стъпка 1 — колекторът вече НЕ изхвърля прикачените. */
      const rad = data.comps.filter(c => c.store_name === 'Раднево')[0];
      const gab = data.comps.filter(c => c.store_name === 'Габрово')[0];
      ok('collectWeeklyRoutingData пренася photos',
        !!(rad && rad.photos && rad.photos.length === 1 &&
           rad.photos[0].filename === 'vitrina.jpg'), JSON.stringify(rad));
      ok('collectWeeklyRoutingData пренася files',
        !!(gab && gab.files && gab.files.length === 1 &&
           gab.files[0].filename === 'otchet.xlsx'), JSON.stringify(gab));

      /* Стъпка 2 — done носи обекти, не голи имена. */
      const bd = h.w.taskStoreBreakdown(data.tasks[0], data.comps, data.stores);
      const names = bd.done.map(d => d.store).sort().join(',');
      ok('изпълнили са Габрово и Раднево', names === 'Габрово,Раднево', names);
      ok('Троян е в „чакащи"', bd.pending.join(',') === 'Троян',
        'pending=' + bd.pending.join(','));
      const radDone = bd.done.filter(d => d.store === 'Раднево')[0];
      ok('done носи коментара на обекта',
        !!radDone && radDone.comment === 'Витрината е подредена',
        JSON.stringify(radDone));
      ok('done носи и прикачените',
        !!radDone && radDone.photos.length === 1 &&
        radDone.photos[0].url === SNIMKA.url, JSON.stringify(radDone));

      /* Стъпка 3 — самата картичка, това, което влиза в имейла. */
      let card = '';
      if (guard('картичката се рендира', function () {
        card = h.w.personalizedTaskCardHtml(data.tasks[0], data.comps, data.stores);
      })) {
        ok('казва 2 от 3', card.indexOf('2 от 3 обекта изпълнили') >= 0, card);

        ok('изрежда КОЙ не е изпълнил',
          card.indexOf('Не са изпълнили: Троян') >= 0, card);
        /* Ядрото на проверката: неизпълнилият излиза САМО в този ред. Излезе
           ли втори път, значи е попаднал и в блока на изпълнилите. */
        ok('Троян не излиза като изпълнил', count(card, 'Троян') === 1,
          'срещания: ' + count(card, 'Троян'));
        ok('и не е обявен като изпълнил в друг ред',
          !/Троян<\/div>\s*<div[^>]*>💬/.test(card));

        ok('носи текста на коментара',
          card.indexOf('Витрината е подредена') >= 0, card);
        ok('и името на обекта, който го е написал',
          card.indexOf('>Раднево</div>') >= 0, card);

        ok('снимката е <img>, не връзка',
          card.indexOf('<img src="' + SNIMKA.url + '"') >= 0, card);
        ok('документът е <a> с името си',
          card.indexOf('<a href="' + XLSX.url + '"') >= 0 &&
          card.indexOf('otchet.xlsx') >= 0, card);
        ok('документът НЕ е рендиран като картинка',
          card.indexOf('<img src="' + XLSX.url) < 0, card);
        ok('Габрово (само файл, без коментар) също има свой ред',
          card.indexOf('>Габрово</div>') >= 0, card);
      }
    }
    h.close();
  }

  section('2. .xlsx в СТАРАТА колона photos излиза като връзка');
  {
    /* В photos лежат три .xlsx отпреди отделната колона files. Преценката е
       по РАЗШИРЕНИЕ, не по това в коя колона е записът — иначе тези три
       излизат в писмото като счупени картинки. */
    const { w } = env();
    const task = { id: 't-9', kind: 'regular', title: 'Отчет', target_stores: null,
                   date: null, dateFrom: '2026-08-17', dateTo: '2026-08-23' };
    const comps = [{ item_id: 't-9', kind: 'regular', store_name: 'Раднево',
                     status: 'done', comment: '', photos: [XLSX], files: [],
                     completion_date: '2026-08-20' }];
    const card = w.personalizedTaskCardHtml(task, comps, ['Раднево']);
    ok('връзка, не картинка',
      card.indexOf('<a href="' + XLSX.url + '"') >= 0 &&
      card.indexOf('<img') < 0, card);
    ok('с иконата и името на файла',
      card.indexOf('📄 otchet.xlsx') >= 0, card);
  }

  section('3. Един рендер за прикачените, ползван на двете места');
  {
    const { w } = env();
    ok('reportAttachmentsHtml съществува',
      typeof w.reportAttachmentsHtml === 'function');
    ok('празен вход → празен низ',
      w.reportAttachmentsHtml([], []) === '' &&
      w.reportAttachmentsHtml(null, undefined) === '');

    /* Същият вход през коментарите по обекти в ОБЩИЯ отчет и през личната
       картичка трябва да даде същия HTML за прикачените. */
    const att = w.reportAttachmentsHtml([SNIMKA], [XLSX]);
    const общ = w.reportCommentsByStoreHtml({
      rows: [{ name: 'Раднево', pct: 50 }],
      commentedList: [{ store: 'Раднево', title: 'Отчет', comment: 'ок',
                        photos: [SNIMKA], files: [XLSX] }],
      postponedList: []
    });
    ok('общият отчет ползва същия рендер', общ.indexOf(att) >= 0, общ);

    const task = { id: 't-7', kind: 'regular', title: 'Отчет', target_stores: null,
                   date: null, dateFrom: '2026-08-17', dateTo: '2026-08-23' };
    const card = w.personalizedTaskCardHtml(task, [{
      item_id: 't-7', kind: 'regular', store_name: 'Раднево', status: 'done',
      comment: 'ок', photos: [SNIMKA], files: [XLSX],
      completion_date: '2026-08-20' }], ['Раднево']);
    ok('и личната картичка ползва същия рендер', card.indexOf(att) >= 0, card);

    /* Заковано и в кода: двете места ВИКАТ помощника, не носят свое копие
       на преценката по разширение. */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'report.js'), 'utf8');
    ok('преценката по разширение е на едно място',
      (src.match(/'jpg','jpeg','png','gif','webp','heic','heif'/g) || []).length === 1);
  }

  section('4. Празни и гранични случаи');
  {
    const { w } = env();
    const task = { id: 't-8', kind: 'regular', title: 'Х', target_stores: null,
                   date: null, dateFrom: '2026-08-17', dateTo: '2026-08-23' };

    /* Никой не е изпълнил — редът за неизпълнилите изброява всички. */
    const none = w.personalizedTaskCardHtml(task, [], STORES);
    ok('без отмятания: 0 от 3', none.indexOf('0 от 3 обекта изпълнили') >= 0, none);
    ok('и изброява и тримата',
      none.indexOf('Не са изпълнили: Раднево, Габрово, Троян') >= 0, none);

    /* Всички са изпълнили — редът за неизпълнилите изобщо не се появява. */
    const all = STORES.map(s => ({ item_id: 't-8', kind: 'regular', store_name: s,
                                   status: 'done', comment: '', photos: [], files: [],
                                   completion_date: '2026-08-20' }));
    const full = w.personalizedTaskCardHtml(task, all, STORES);
    ok('при 3 от 3 няма ред „Не са изпълнили"',
      full.indexOf('Не са изпълнили') < 0, full);
    /* Нито един няма коментар или прикачени → няма и празен блок с имена. */
    ok('изпълнили без съдържание не заемат ред',
      full.indexOf('>Раднево</div>') < 0, full);

    /* Отложилите остават както преди — не са глътнати от новия блок. */
    const post = [{ item_id: 't-8', kind: 'regular', store_name: 'Троян',
                    status: 'postponed', comment: 'няма стока',
                    completion_date: '2026-08-19' }];
    const pc = w.personalizedTaskCardHtml(task, post, STORES);
    ok('отложеният си остава с ⏱ и коментара',
      pc.indexOf('⏱ Троян: няма стока') >= 0, pc);
    ok('и не влиза в „Не са изпълнили"',
      pc.indexOf('Не са изпълнили: Раднево, Габрово') >= 0 &&
      pc.indexOf('Троян</div>') < 0, pc);

    /* Отмятане без photos/files (стари редове, NULL в базата) не чупи нищо. */
    let bare = '';
    if (guard('done без photos/files не чупи картичката', function () {
      bare = w.personalizedTaskCardHtml(task, [{ item_id: 't-8', kind: 'regular',
        store_name: 'Раднево', status: 'done', comment: 'само текст',
        completion_date: '2026-08-20' }], STORES);
    })) {
      ok('коментарът пак излиза', bare.indexOf('само текст') >= 0, bare);
    }
  }

  report();
})();
