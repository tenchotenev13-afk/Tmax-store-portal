/* Статус 'new' в модала — да не се преобръща тихо на 'pending'.

   Редовете пристигат от подадена бланка със status='new' (35 от 42 към
   19.08.2026). Селектът в модала предлагаше само pending/taken/received, тоест
   нито една опция не съвпадаше и браузърът избираше първата. Достатъчно беше
   Цвети да отвори модала през бутона 💬, за да добави коментар или да прикачи
   документ, и записът тихо ставаше 'pending' — без никой да е искал смяна на
   статуса и без следа, че се е случило.

   Тестът минава по реалния път: бутонът 💬 в секцията „Нови подадени бланки",
   не директно през openSDModal().

   Пускане:  node tests/stock-diff-status-new.test.js .
*/
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { boot, ok, section, report, guard, realClick, btn, btnExact, ticks } = H;

function row(o) {
  return Object.assign({
    report_id: null, store_name: 'Раднево', supplier: 'ТЕСИ ООД',
    material_code: '111', material_name: 'АРТИКУЛ', quantity: 1,
    order_number: null, confirmed_date: null, comment: null,
    resolution_comment: null, attachments: [], credit_note_issued: false,
    difference_category: 'undelivered', unit: 'бр.'
  }, o);
}

const REPORT = {
  id: 'rep-1', direction: 'supplier', store_name: 'Раднево',
  counterpart: 'ТЕСИ ООД', document_number: '180489966',
  doc_date: '2026-08-17', submitted_by: 'Склад Раднево',
  general_comment: '', photos: [], reviewed: false
};

const CVETI = {
  email: 'c.teneva@temax.bg', display_name: 'Цветелина Тенева',
  role: 'admin', store_name: 'Централен офис', assigned_stores: ['Раднево']
};

function env(rows, reports) {
  const h = boot({
    modules: ['stock-returns.js', 'stock-differences.js'],
    user: CVETI,
    confirm: true,
    data: {
      stock_differences: rows, differences_reports: reports || [],
      stock_returns: [], users: []
    }
  });
  h.w.sdData = JSON.parse(JSON.stringify(rows));
  h.w.diffReports = JSON.parse(JSON.stringify(reports || []));
  h.w.sdFilter = 'all';
  h.w.sdTypeFilter = 'all';
  h.w.sdDirTab = 'supplier';
  return h;
}

function sdPatch(calls) {
  const list = calls.patch.filter(p => /stock_differences/.test(p.url));
  return list.length ? list[list.length - 1] : null;
}
function statusOptions(doc) {
  const sel = doc.getElementById('sd-status');
  return sel ? Array.prototype.map.call(sel.querySelectorAll('option'), o => o.value) : [];
}

(async function run() {

  section('0. Средата се вдига');
  {
    const { w } = env([]);
    ok('stock-differences.js е зареден', typeof w.sdModalHtml === 'function');
    ok('sdStatusWords не е пипан', typeof w.sdStatusWords === 'function' &&
      w.sdStatusWords('writein').taken === 'Заприходена');
    ok('sdIsTaken не е пипан', w.sdIsTaken({ status: 'capitalized' }) === true);
  }

  section('1. Ред със status="new" без тип — модалът през 💬 не преобръща статуса');
  {
    const ROWS = [row({ id: 'l-1', report_id: 'rep-1', type: null, status: 'new' })];
    const { w, doc, calls } = env(ROWS, [REPORT]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const chat = btn(doc, '💬');
      if (ok('бутонът 💬 е на екрана (реалният път на Цвети)', !!chat)) {
        realClick(w, chat);
        await ticks();

        const sel = doc.getElementById('sd-status');
        if (ok('модалът е отворен, селектът съществува', !!sel)) {
          ok('селектът е disabled', sel.disabled === true, String(sel.disabled));
          ok('избраната стойност е "new", не "pending"', sel.value === 'new', sel.value);
          ok('опцията "new" присъства', statusOptions(doc).indexOf('new') >= 0,
            statusOptions(doc).join(','));
          ok('опцията "received" НЕ е махната', statusOptions(doc).indexOf('received') >= 0,
            statusOptions(doc).join(','));

          const hint = doc.getElementById('sd-ov').textContent;
          ok('подсказката под селекта се показва',
            hint.indexOf('Статусът се отключва, след като бъде зададен тип на решение.') >= 0);

          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              /* Ядрото на бъга: disabled селект пак се чете през
                 getElementById().value — стойността трябва да стигне до
                 тялото като 'new'. */
              ok('PATCH тялото съдържа status:"new"', p.body.status === 'new',
                JSON.stringify(p.body.status));
              ok('НЕ е записан "pending"', p.body.status !== 'pending',
                JSON.stringify(p.body.status));
              ok('типът остава празен', !p.body.type, JSON.stringify(p.body.type));
            }
          }
        }
      }
    }
  }

  section('2. Същият ред със сменен коментар — коментарът се записва, статусът остава "new"');
  {
    const ROWS = [row({ id: 'l-2', report_id: 'rep-1', type: null, status: 'new',
      comment: 'стар коментар' })];
    const { w, doc, calls } = env(ROWS, [REPORT]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const chat = btn(doc, '💬');
      if (ok('бутонът 💬 е на екрана', !!chat)) {
        realClick(w, chat);
        await ticks();

        const comment = doc.getElementById('sd-comment');
        const ctrl = doc.getElementById('sd-ctrl-comment');
        if (ok('полетата за коментар съществуват', !!comment && !!ctrl)) {
          comment.value = 'ЧАКАМЕ ОТГОВОР ОТ ДОСТАВЧИКА';
          ctrl.value = 'Изчаква се кредитно';

          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              ok('коментарът наистина се записва',
                p.body.comment === 'ЧАКАМЕ ОТГОВОР ОТ ДОСТАВЧИКА', JSON.stringify(p.body.comment));
              ok('коментарът на контрольора се записва',
                p.body.resolution_comment === 'Изчаква се кредитно',
                JSON.stringify(p.body.resolution_comment));
              ok('статусът пак е "new"', p.body.status === 'new', JSON.stringify(p.body.status));
            }
          }
        }
      }
    }
  }

  section('3. КОНТРОЛА: решен ред (type=return, status=pending) — менюто работи както преди');
  {
    const ROWS = [row({ id: 'l-3', type: 'return', status: 'pending' })];
    const { w, doc, calls } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const edit = btn(doc, '✏️');
      if (ok('бутонът за редакция е на екрана', !!edit)) {
        realClick(w, edit);
        await ticks();

        const sel = doc.getElementById('sd-status');
        if (ok('модалът е отворен', !!sel)) {
          ok('селектът НЕ е disabled', sel.disabled === false, String(sel.disabled));
          const opts = statusOptions(doc);
          ok('опциите са точно трите стари', opts.join(',') === 'pending,taken,received',
            opts.join(','));
          ok('избрано е pending', sel.value === 'pending', sel.value);

          sel.value = 'taken';
          const save = btnExact(doc, 'Запази');
          if (ok('бутонът „Запази" е на екрана', !!save)) {
            realClick(w, save);
            await ticks();

            const p = sdPatch(calls);
            if (ok('има PATCH към stock_differences', !!p)) {
              ok('смяната към taken минава както преди', p.body.status === 'taken',
                JSON.stringify(p.body.status));
              /* Регресия срещу предната стъпка — приключването пак пише кой. */
              ok('completed_by пак се записва', p.body.completed_by === 'Цветелина Тенева',
                JSON.stringify(p.body.completed_by));
            }
          }
        }
      }
    }
  }

  section('4. КОНТРОЛА: ново ръчно добавяне — селектът е активен и по подразбиране pending');
  {
    const { w, doc } = env([]);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const add = btn(doc, '+ Добави ръчно');
      if (ok('бутонът „+ Добави ръчно" е на екрана', !!add)) {
        realClick(w, add);
        await ticks();

        const sel = doc.getElementById('sd-status');
        if (ok('модалът е отворен', !!sel)) {
          ok('селектът НЕ е disabled', sel.disabled === false, String(sel.disabled));
          ok('няма опция "new" при ново добавяне',
            statusOptions(doc).indexOf('new') < 0, statusOptions(doc).join(','));
          ok('по подразбиране е pending (||!r.status fallback-ът е запазен)',
            sel.value === 'pending', sel.value);
        }
      }
    }
  }

  section('5. ГРАНИЧЕН: status="new", но типът ВЕЧЕ е зададен — опцията е там, селектът е отключен');
  {
    /* Днес нула такива реда в базата, но комбинацията е достижима: решение по
       реда, последвано от ръчна корекция на статуса. Селектът не бива да е
       заключен, защото типът вече го има. */
    const ROWS = [row({ id: 'l-5', type: 'writein', status: 'new' })];
    const { w, doc } = env(ROWS);

    if (guard('renderStockDiff() не хвърля', () => w.renderStockDiff())) {
      const edit = btn(doc, '✏️');
      if (ok('бутонът за редакция е на екрана', !!edit)) {
        realClick(w, edit);
        await ticks();

        const sel = doc.getElementById('sd-status');
        if (ok('модалът е отворен', !!sel)) {
          ok('селектът НЕ е disabled (типът вече е зададен)', sel.disabled === false,
            String(sel.disabled));
          ok('опцията "new" присъства и е избрана', sel.value === 'new', sel.value);
          ok('и трите стари опции са налични',
            statusOptions(doc).join(',') === 'new,pending,taken,received',
            statusOptions(doc).join(','));
          ok('подсказката за заключване НЕ се показва',
            doc.getElementById('sd-ov').textContent.indexOf('Статусът се отключва') < 0);
        }
      }
    }
  }

  report();
})();
